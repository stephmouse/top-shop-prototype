import { sanitizeAvatarSpec } from '../config/avatarTypes';
import type { AvatarSpec } from '../config/avatarTypes';
import { PLAYER_COLORS } from '../config/balance';
import { getStageDef, OFFICIAL_STAGES } from '../config/maps';
import type { StageId } from '../config/maps';
import { formatCalendarDate } from '../engine/eventDraw';
import type { GameState } from '../engine/types';
import { createAvatarElement } from './avatarSvg';
import {
  clearManualMatchSlot, createDefaultMatchSetup, downloadSetupConfigJson,
  loadManualMatchSlot, parseSetupConfigJson, sanitizeMatchSetup, saveStoredSetup,
} from './persistence';
import type { MatchSetupData, SavedMatchEnvelope } from './persistence';

export interface SetupModalOptions {
  initialSetup: MatchSetupData;
  onStartMatch: (setup: MatchSetupData) => void;
  onSaveMatch: () => SavedMatchEnvelope;
  onLoadMatch: (state: GameState) => void;
  onEditAvatar?: (idx: number, current: AvatarSpec, color: string, onSave: (next: AvatarSpec) => void) => void;
}

export interface SetupModalController {
  el: HTMLElement;
  open: (setup?: MatchSetupData) => void;
  close: () => void;
  isOpen: () => boolean;
  refreshSaveStatus: () => void;
}

const MODAL_TEMPLATE = `
  <div class="setup-header">
    <h2 class="setup-title">Match Setup &amp; Persistence</h2>
    <button type="button" data-role="close-header">Resume Match (Esc)</button>
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
        <button type="button" data-count="2">2 Players</button>
        <button type="button" data-count="3">3 Players</button>
        <button type="button" data-count="4">4 Players</button>
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
      <label class="setup-field"><span class="setup-field-label">Target Assets ($)</span><input class="setup-input" type="number" min="1000" max="1000000" step="500" data-role="target" /></label>
      <label class="setup-field"><span class="setup-field-label">Starting Cash ($)</span><input class="setup-input" type="number" min="500" max="500000" step="500" data-role="cash" /></label>
      <label class="setup-field"><span class="setup-field-label">Bankrupt Limit</span><input class="setup-input" type="number" min="1" step="1" data-role="bankrupt" /></label>
      <label class="setup-checkbox-field"><input type="checkbox" data-role="finish-round" /> Finish Round on Win</label>
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
  const stageSelect = q<HTMLSelectElement>('stage');
  const stageDesc = q<HTMLElement>('stage-desc');
  const playersList = q<HTMLElement>('players-list');
  const countBtns = Array.from(modal.querySelectorAll<HTMLButtonElement>('[data-count]'));
  const targetInput = q<HTMLInputElement>('target');
  const cashInput = q<HTMLInputElement>('cash');
  const bankruptInput = q<HTMLInputElement>('bankrupt');
  const finishRoundCheckbox = q<HTMLInputElement>('finish-round');
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

  function resizePlayers(count: number): void {
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

  function renderPlayersList(): void {
    playersList.innerHTML = '';
    for (const btn of countBtns) btn.className = Number(btn.dataset.count) === draft.players.length ? 'primary' : '';
    draft.players.forEach((player, idx) => {
      const row = Object.assign(document.createElement('div'), { className: 'setup-player-row' });
      const tag = Object.assign(document.createElement('span'), { className: 'setup-player-tag', textContent: `P${idx + 1}` });
      const pColor = player.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]!;
      const avatarSpec = sanitizeAvatarSpec(player.avatar, idx);
      const avatarBtn = Object.assign(document.createElement('button'), { type: 'button' as const, className: 'setup-avatar-btn', title: 'Customize Standee' });
      avatarBtn.style.borderColor = pColor;
      avatarBtn.appendChild(createAvatarElement(avatarSpec, pColor));
      avatarBtn.addEventListener('click', () => options.onEditAvatar?.(idx, avatarSpec, pColor, (nextAv) => {
        draft.players[idx] = { ...draft.players[idx]!, avatar: nextAv }; renderPlayersList();
      }));
      const nameInput = Object.assign(document.createElement('input'), { className: 'setup-input', type: 'text', maxLength: 20, value: player.name });
      nameInput.addEventListener('input', () => { draft.players[idx] = { ...draft.players[idx]!, name: nameInput.value }; });
      const colorInput = Object.assign(document.createElement('input'), { className: 'setup-color-picker', type: 'color', value: pColor });
      colorInput.addEventListener('input', () => { draft.players[idx] = { ...draft.players[idx]!, color: colorInput.value }; avatarBtn.style.borderColor = colorInput.value; });
      colorInput.addEventListener('change', () => renderPlayersList());
      const swatches = Object.assign(document.createElement('div'), { className: 'setup-swatches' });
      for (const hex of PLAYER_COLORS) {
        const sw = Object.assign(document.createElement('button'), { type: 'button', title: hex, className: `color-swatch${colorInput.value.toLowerCase() === hex ? ' is-selected' : ''}` });
        sw.style.backgroundColor = hex;
        sw.addEventListener('click', () => { draft.players[idx] = { ...draft.players[idx]!, color: hex }; renderPlayersList(); });
        swatches.appendChild(sw);
      }
      row.append(tag, avatarBtn, nameInput, colorInput, swatches);
      playersList.appendChild(row);
    });
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

  function formatStageSummary(stageId: StageId): string {
    const stg = getStageDef(stageId);
    return `Stage ${stg.stageIndex + 1} · ${stg.cols} cols × ${stg.floors} floors · ${stg.shopCount} shop slots`;
  }

  function syncForm(): void {
    stageSelect.value = draft.stageId;
    stageDesc.textContent = formatStageSummary(draft.stageId);
    targetInput.value = String(draft.config.targetAssets);
    cashInput.value = String(draft.config.startingCash);
    bankruptInput.max = String(Math.max(1, draft.players.length - 1));
    bankruptInput.value = String(draft.config.bankruptLimit);
    finishRoundCheckbox.checked = draft.config.finishRoundOnWin;
    renderPlayersList();
    refreshSaveStatus();
  }

  function readSanitizedDraft(): MatchSetupData {
    draft.stageId = stageSelect.value as StageId;
    draft.config = {
      targetAssets: Number(targetInput.value),
      startingCash: Number(cashInput.value),
      bankruptLimit: Number(bankruptInput.value),
      finishRoundOnWin: finishRoundCheckbox.checked,
    };
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
  const close = (): void => { visible = false; backdrop.hidden = true; };

  stageSelect.addEventListener('change', () => {
    draft.stageId = stageSelect.value as StageId;
    stageDesc.textContent = formatStageSummary(draft.stageId);
  });
  for (const btn of countBtns) btn.addEventListener('click', () => resizePlayers(Number(btn.dataset.count)));
  q('reset').addEventListener('click', () => { draft = createDefaultMatchSetup(); syncForm(); setStatus('Reset setup to default rules.'); });
  q('save').addEventListener('click', () => { options.onSaveMatch(); refreshSaveStatus(); setStatus('Match saved to browser storage.'); });
  loadBtn.addEventListener('click', () => { const s = loadManualMatchSlot(); if (!s) return refreshSaveStatus(); options.onLoadMatch(s.state); close(); });
  clearBtn.addEventListener('click', () => { clearManualMatchSlot(); refreshSaveStatus(); setStatus('Cleared saved match slot.'); });
  q('export').addEventListener('click', () => { const c = readSanitizedDraft(); saveStoredSetup(c); downloadSetupConfigJson(c); setStatus('Exported top-shop-config.json.'); });
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
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  q('start').addEventListener('click', () => { const c = readSanitizedDraft(); saveStoredSetup(c); options.onStartMatch(c); close(); });

  syncForm();
  return { el: backdrop, open, close, isOpen: () => visible, refreshSaveStatus };
}
