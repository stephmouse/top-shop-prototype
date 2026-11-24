import { sanitizeAvatarSpec } from '../config/avatarTypes';
import type { AvatarSpec } from '../config/avatarTypes';
import { PLAYER_COLORS } from '../config/balance';
import { getStageDef, OFFICIAL_STAGES } from '../config/maps';
import type { StageId } from '../config/maps';
import { formatCalendarDate } from '../engine/eventDraw';
import type { GameState } from '../engine/types';
import {
  clearManualMatchSlot, createDefaultMatchSetup, downloadSetupConfigJson,
  loadManualMatchSlot, parseSetupConfigJson, sanitizeMatchSetup, saveStoredSetup,
} from './persistence';
import type { MatchSetupData, SavedMatchEnvelope } from './persistence';
import { getGuestPeerForSeat, renderSetupPlayersList } from './setupPlayersView';
import type { SetupOnlineContext } from './setupPlayersView';

export type { SetupOnlineContext };

export interface SetupModalOptions {
  initialSetup: MatchSetupData;
  onStartMatch: (setup: MatchSetupData) => void;
  onSaveMatch: () => SavedMatchEnvelope;
  onLoadMatch: (state: GameState) => void;
  onEditAvatar?: (idx: number, current: AvatarSpec, color: string, onSave: (next: AvatarSpec) => void) => void;
  getOnlineContext?: () => SetupOnlineContext;
  onOpenLobby?: () => void;
}

export interface SetupModalController {
  el: HTMLElement;
  open: (setup?: MatchSetupData) => void;
  close: () => void;
  isOpen: () => boolean;
  refresh: () => void;
  refreshSaveStatus: () => void;
}

const MODAL_TEMPLATE = `
  <div class="setup-header">
    <h2 class="setup-title">Match Setup &amp; Persistence</h2>
    <button type="button" data-role="close-header">Resume Match (Esc)</button>
  </div>
  <div class="setup-online-banner" hidden data-role="online-banner">
    <span data-role="online-note"></span>
    <button type="button" data-role="open-lobby">Online Lobby</button>
  </div>
  <section class="setup-section">
    <h3 class="setup-section-title">Map / Stage</h3>
    <select class="setup-select" data-role="stage"></select>
    <div class="setup-muted" data-role="stage-desc"></div>
  </section>
  <section class="setup-section">
    <div class="setup-row-between">
      <h3 class="setup-section-title">Players</h3>
      <div class="setup-count-group" data-role="counts">
        <button type="button" data-count="2">2P</button>
        <button type="button" data-count="3">3P</button>
        <button type="button" data-count="4">4P</button>
        <button type="button" data-count="5">5P</button>
        <button type="button" data-count="6">6P</button>
      </div>
    </div>
    <div class="setup-players-list" data-role="players-list"></div>
  </section>
  <section class="setup-section">
    <div class="setup-row-between">
      <h3 class="setup-section-title">Match Rules</h3>
      <button type="button" data-role="reset">Reset Defaults</button>
    </div>
    <div class="setup-grid">
      <label class="setup-field">
        <span class="setup-field-label">Target Assets ($)</span>
        <input class="setup-input" type="number" min="1000" max="1000000" step="100" data-role="target" />
      </label>
      <label class="setup-field">
        <span class="setup-field-label">Starting Cash ($)</span>
        <input class="setup-input" type="number" min="500" max="500000" step="100" data-role="cash" />
      </label>
      <label class="setup-field">
        <span class="setup-field-label">Bankrupt Limit</span>
        <input class="setup-input" type="number" min="1" step="1" data-role="bankrupt" />
      </label>
      <label class="setup-field">
        <span class="setup-field-label">First Turn</span>
        <select class="setup-select" data-role="first-player"></select>
      </label>
      <label class="setup-checkbox-field setup-has-tooltip">
        <input type="checkbox" data-role="finish-round" aria-describedby="finish-round-tip" />
        Finish Round on Win
        <span class="setup-info-hint" aria-hidden="true">?</span>
        <span id="finish-round-tip" class="setup-tooltip" role="tooltip">
          When someone reaches Target Assets, let the rest of the round finish so everyone gets equal turns.
          Highest Net Assets wins.
        </span>
      </label>
      <label class="setup-checkbox-field"><input type="checkbox" data-role="month-popup" /> Show Month Popups</label>
    </div>
  </section>
  <section class="setup-section">
    <h3 class="setup-section-title">Save / Load &amp; Config JSON</h3>
    <div class="setup-muted" data-role="save-summary"></div>
    <div class="setup-btn-row">
      <button type="button" data-role="save">Save Current Match</button>
      <button type="button" data-role="load">Load Saved Match</button>
      <button type="button" data-role="clear">Clear Save</button>
      <button type="button" data-role="export">Export Config JSON</button>
      <button type="button" data-role="import">Import Config JSON</button>
      <input type="file" accept=".json,application/json" hidden data-role="file" />
    </div>
    <div class="setup-status" hidden data-role="status"></div>
  </section>
  <div class="setup-footer">
    <button type="button" data-role="close-footer">Resume Current Match</button>
    <button type="button" class="primary" data-role="start">Start New Match</button>
  </div>
`;

export function createSetupModal(options: SetupModalOptions): SetupModalController {
  let draft: MatchSetupData = sanitizeMatchSetup(options.initialSetup) ?? createDefaultMatchSetup();
  let visible = false;

  const backdrop = Object.assign(document.createElement('div'), { className: 'setup-backdrop', hidden: true });
  const modal = Object.assign(document.createElement('div'), { className: 'setup-modal', innerHTML: MODAL_TEMPLATE });
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  backdrop.appendChild(modal);

  const q = <T extends HTMLElement>(role: string): T => modal.querySelector<T>(`[data-role="${role}"]`)!;
  const onlineBanner = q<HTMLElement>('online-banner');
  const onlineNote = q<HTMLElement>('online-note');
  const stageSelect = q<HTMLSelectElement>('stage');
  const stageDesc = q<HTMLElement>('stage-desc');
  const playersList = q<HTMLElement>('players-list');
  const countBtns = Array.from(modal.querySelectorAll<HTMLButtonElement>('[data-count]'));
  const targetInput = q<HTMLInputElement>('target');
  const cashInput = q<HTMLInputElement>('cash');
  const bankruptInput = q<HTMLInputElement>('bankrupt');
  const firstPlayerSelect = q<HTMLSelectElement>('first-player');
  const finishRoundCheckbox = q<HTMLInputElement>('finish-round');
  const monthPopupCheckbox = q<HTMLInputElement>('month-popup');
  const saveSummary = q<HTMLElement>('save-summary');
  const loadBtn = q<HTMLButtonElement>('load');
  const clearBtn = q<HTMLButtonElement>('clear');
  const fileInput = q<HTMLInputElement>('file');
  const statusEl = q<HTMLElement>('status');

  for (const stage of OFFICIAL_STAGES) {
    const opt = document.createElement('option');
    opt.value = stage.id;
    opt.textContent = `${stage.name} (${stage.cols}×${stage.floors} · ${stage.shopCount} shops)`;
    stageSelect.appendChild(opt);
  }

  function setStatus(message: string, isError = false): void {
    statusEl.textContent = message;
    statusEl.className = `setup-status${isError ? ' is-error' : ''}`;
    statusEl.hidden = !message;
  }

  function captureFormInputs(): void {
    draft.stageId = stageSelect.value as StageId;
    const rawFirst = firstPlayerSelect.value;
    draft.config = {
      targetAssets: Number(targetInput.value),
      startingCash: Number(cashInput.value),
      bankruptLimit: Number(bankruptInput.value),
      finishRoundOnWin: finishRoundCheckbox.checked,
      showMonthPopup: monthPopupCheckbox.checked,
      startingPlayer: rawFirst === 'random' ? 'random' : Number(rawFirst),
    };
  }

  function syncFirstPlayerOptions(online?: SetupOnlineContext): void {
    const curVal =
      draft.config.startingPlayer === 'random'
        ? 'random'
        : String(
            typeof draft.config.startingPlayer === 'number' && draft.config.startingPlayer < draft.players.length
              ? draft.config.startingPlayer
              : 0
          );
    firstPlayerSelect.innerHTML = '';
    firstPlayerSelect.appendChild(
      Object.assign(document.createElement('option'), { value: 'random', textContent: '🎲 Random Player' })
    );
    draft.players.forEach((p, idx) => {
      const guest = getGuestPeerForSeat(online, idx);
      const label = guest
        ? `P${idx + 1} · ${guest.name} (Guest)`
        : `P${idx + 1} · ${p.name || `Player ${idx + 1}`}`;
      firstPlayerSelect.appendChild(
        Object.assign(document.createElement('option'), { value: String(idx), textContent: label })
      );
    });
    firstPlayerSelect.value = curVal;
  }

  function resizePlayers(count: number): void {
    captureFormInputs();
    const nextPlayers = Array.from({ length: count }, (_, idx) => {
      const prev = draft.players[idx];
      return {
        name: prev?.name ?? `Player ${idx + 1}`,
        color: prev?.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
        isBot: prev?.isBot ?? false,
        avatar: sanitizeAvatarSpec(prev?.avatar, idx),
      };
    });
    draft = sanitizeMatchSetup({ ...draft, players: nextPlayers }) ?? draft;
    syncForm();
  }

  function refreshSaveStatus(): void {
    const slot = loadManualMatchSlot();
    loadBtn.disabled = !slot;
    clearBtn.disabled = !slot;
    if (!slot) {
      saveSummary.textContent = 'No manual save in slot.';
      return;
    }
    const stageName = getStageDef(slot.state.mapId as StageId).name;
    const cal = formatCalendarDate(slot.state.month, slot.state.year);
    saveSummary.textContent = `Saved Slot: ${stageName} · Turn ${slot.state.turnNumber} (${cal}) · ${slot.state.players.length}P`;
  }

  function formatStageDesc(stageId: StageId): string {
    const stg = getStageDef(stageId);
    const start = stg.recommendedStartingCash.toLocaleString();
    const goal = stg.recommendedTargetAssets.toLocaleString();
    return (
      `Stage ${stg.stageIndex + 1} · ${stg.cols} cols × ${stg.floors} floors · ` +
      `${stg.shopCount} shop slots · Rec: $${start} start / $${goal} goal`
    );
  }

  function syncForm(): void {
    const online = options.getOnlineContext?.();
    const isHostOnline = online?.role === 'host' && Boolean(online.roster);
    onlineBanner.hidden = !isHostOnline;
    if (isHostOnline && online?.roster) {
      onlineNote.textContent = `Online Room ${online.roster.roomCode} active — guest slots are auto-populated and locked.`;
    }
    stageSelect.value = draft.stageId;
    stageDesc.textContent = formatStageDesc(draft.stageId);
    targetInput.value = String(draft.config.targetAssets);
    cashInput.value = String(draft.config.startingCash);
    bankruptInput.max = String(Math.max(1, draft.players.length - 1));
    bankruptInput.value = String(draft.config.bankruptLimit);
    finishRoundCheckbox.checked = draft.config.finishRoundOnWin;
    monthPopupCheckbox.checked = draft.config.showMonthPopup !== false;
    for (const btn of countBtns) btn.className = Number(btn.dataset.count) === draft.players.length ? 'primary' : '';
    renderSetupPlayersList(playersList, draft, online, {
      onEditAvatar: options.onEditAvatar,
      onPlayersMutated: () => syncForm(),
      onNameInput: () => syncFirstPlayerOptions(online),
    });
    syncFirstPlayerOptions(online);
    refreshSaveStatus();
  }

  function readSanitizedDraft(): MatchSetupData {
    captureFormInputs();
    draft = sanitizeMatchSetup(draft) ?? createDefaultMatchSetup();
    return draft;
  }

  const open = (nextSetup?: MatchSetupData): void => {
    if (nextSetup) draft = sanitizeMatchSetup(nextSetup) ?? createDefaultMatchSetup();
    setStatus('');
    syncForm();
    visible = true;
    backdrop.hidden = false;
  };
  const close = (): void => {
    visible = false;
    backdrop.hidden = true;
  };

  stageSelect.addEventListener('change', () => {
    captureFormInputs();
    draft.stageId = stageSelect.value as StageId;
    const stg = getStageDef(draft.stageId);
    draft.config.startingCash = stg.recommendedStartingCash;
    draft.config.targetAssets = stg.recommendedTargetAssets;
    cashInput.value = String(stg.recommendedStartingCash);
    targetInput.value = String(stg.recommendedTargetAssets);
    stageDesc.textContent = formatStageDesc(draft.stageId);
  });
  for (const btn of countBtns) {
    btn.addEventListener('click', () => resizePlayers(Number(btn.dataset.count)));
  }
  q('open-lobby').addEventListener('click', () => {
    close();
    options.onOpenLobby?.();
  });
  q('reset').addEventListener('click', () => {
    draft = createDefaultMatchSetup();
    syncForm();
    setStatus('Reset setup to default rules.');
  });
  q('save').addEventListener('click', () => {
    options.onSaveMatch();
    refreshSaveStatus();
    setStatus('Match saved to browser storage.');
  });
  loadBtn.addEventListener('click', () => {
    const slot = loadManualMatchSlot();
    if (!slot) {
      refreshSaveStatus();
      return;
    }
    options.onLoadMatch(slot.state);
    close();
  });
  clearBtn.addEventListener('click', () => {
    clearManualMatchSlot();
    refreshSaveStatus();
    setStatus('Cleared saved match slot.');
  });
  q('export').addEventListener('click', () => {
    const cfg = readSanitizedDraft();
    saveStoredSetup(cfg);
    downloadSetupConfigJson(cfg);
    setStatus('Exported top-shop-config.json.');
  });
  q('import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      draft = parseSetupConfigJson(await file.text());
      saveStoredSetup(draft);
      syncForm();
      setStatus('Config imported.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to import config JSON.', true);
    }
  });
  q('close-header').addEventListener('click', close);
  q('close-footer').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  q('start').addEventListener('click', () => {
    const cfg = readSanitizedDraft();
    saveStoredSetup(cfg);
    options.onStartMatch(cfg);
    close();
  });

  syncForm();
  return {
    el: backdrop,
    open,
    close,
    isOpen: () => visible,
    refresh: () => {
      if (visible) syncForm();
    },
    refreshSaveStatus,
  };
}
