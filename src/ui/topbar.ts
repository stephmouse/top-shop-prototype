import { OFFICIAL_STAGES } from '../config/maps';
import type { StageId } from '../config/maps';
import type { NetRole } from '../net/protocol';

export interface TopbarNetInfo {
  role: NetRole;
  roomCode: string | null;
  peerCount: number;
  waitingCount?: number;
}

export interface TopbarOptions {
  initialShowRoutes: boolean;
  initialAutoStep: boolean;
  initialStageId: StageId;
  onToggleRoutes: (show: boolean) => void;
  onToggleAutoStep: (enabled: boolean) => void;
  onSelectStage: (stageId: StageId) => void;
  onOpenSetup: () => void;
  onOpenLobby: () => void;
  onSaveMatch: () => void;
  onLoadMatch: () => void;
  onNewMatch: (playerCount: number) => void;
}

export interface TopbarController {
  el: HTMLElement;
  sync: (stageId: StageId, hasSavedMatch: boolean, netInfo?: TopbarNetInfo) => void;
}

function makeButton(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  if (primary) btn.className = 'primary';
  btn.addEventListener('click', onClick);
  return btn;
}

export function createTopbar(options: TopbarOptions): TopbarController {
  const topbar = document.createElement('header');
  topbar.className = 'topbar';

  const title = document.createElement('div');
  title.className = 'topbar-title';
  title.textContent = 'TOP SHOP PROTOTYPE — Move: Arrows/WASD, Click Tiles, Esc: Reset';

  const controls = document.createElement('div');
  controls.className = 'topbar-controls';

  const routesLabel = document.createElement('label');
  const routesCheckbox = document.createElement('input');
  routesCheckbox.type = 'checkbox';
  routesCheckbox.checked = options.initialShowRoutes;
  routesCheckbox.addEventListener('change', () => options.onToggleRoutes(routesCheckbox.checked));
  routesLabel.append(routesCheckbox, ' Routes');
  controls.appendChild(routesLabel);

  const autoStepLabel = document.createElement('label');
  const autoStepCheckbox = document.createElement('input');
  autoStepCheckbox.type = 'checkbox';
  autoStepCheckbox.checked = options.initialAutoStep;
  autoStepCheckbox.addEventListener('change', () => options.onToggleAutoStep(autoStepCheckbox.checked));
  autoStepLabel.append(autoStepCheckbox, ' Auto-Move');
  controls.appendChild(autoStepLabel);

  const stageSelect = document.createElement('select');
  stageSelect.setAttribute('aria-label', 'Select Map Stage');
  for (const stage of OFFICIAL_STAGES) {
    const opt = document.createElement('option');
    opt.value = stage.id;
    opt.textContent = `${stage.name} (${stage.cols}×${stage.floors} · ${stage.shopCount} shops)`;
    stageSelect.appendChild(opt);
  }
  stageSelect.value = options.initialStageId;
  stageSelect.addEventListener('change', () => options.onSelectStage(stageSelect.value as StageId));
  controls.appendChild(stageSelect);

  let saveTimer: number | null = null;
  const setupBtn = makeButton('Match Setup', options.onOpenSetup, true);
  const onlineBtn = makeButton('Online Lobby', options.onOpenLobby);
  onlineBtn.className = 'topbar-online-btn';
  const saveBtn = makeButton('Save', () => {
    options.onSaveMatch();
    saveBtn.textContent = 'Saved!';
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveBtn.textContent = 'Save';
      saveTimer = null;
    }, 1500);
  });
  const loadBtn = makeButton('Load', options.onLoadMatch);
  controls.append(setupBtn, onlineBtn, saveBtn, loadBtn);

  const newMatchBtns: HTMLButtonElement[] = [];
  for (const count of [2, 3, 4]) {
    const btn = makeButton(`New ${count}P`, () => options.onNewMatch(count));
    newMatchBtns.push(btn);
    controls.appendChild(btn);
  }

  topbar.append(title, controls);
  return {
    el: topbar,
    sync: (stageId, hasSavedMatch, netInfo) => {
      const isGuest = netInfo?.role === 'guest';
      stageSelect.value = stageId;
      stageSelect.disabled = isGuest;
      setupBtn.disabled = isGuest;
      saveBtn.disabled = isGuest;
      loadBtn.disabled = isGuest || !hasSavedMatch;
      for (const btn of newMatchBtns) btn.disabled = isGuest;

      if (netInfo?.role === 'host') {
        const waiting = netInfo.waitingCount ?? 0;
        const waitSuffix = waiting > 0 ? ` · +${waiting} waiting` : '';
        onlineBtn.textContent = `Online: ${netInfo.roomCode ?? ''} (Host · ${netInfo.peerCount}G${waitSuffix})`;
        onlineBtn.className = `topbar-online-btn is-online${waiting > 0 ? ' has-waiting' : ''}`;
      } else if (isGuest) {
        onlineBtn.textContent = `Online: ${netInfo.roomCode ?? ''} (Guest)`;
        onlineBtn.className = 'topbar-online-btn is-online';
      } else {
        onlineBtn.textContent = 'Online Lobby';
        onlineBtn.className = 'topbar-online-btn';
      }
    },
  };
}
