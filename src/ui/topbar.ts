import { APP_VERSION } from '../config/appVersion';
import { OFFICIAL_STAGES } from '../config/maps';
import type { StageId } from '../config/maps';
import type { NetRole } from '../net/protocol';

export interface TopbarNetInfo {
  role: NetRole;
  roomCode: string | null;
  peerCount: number;
  waitingCount?: number;
  reconnecting?: boolean;
  debugUnlocked?: boolean;
  debugOpen?: boolean;
}

export interface TopbarOptions {
  initialShowRoutes: boolean;
  initialAutoStep: boolean;
  initialSoundEnabled?: boolean;
  initialStageId: StageId;
  onToggleRoutes: (show: boolean) => void;
  onToggleAutoStep: (enabled: boolean) => void;
  onToggleSound?: (enabled: boolean) => void;
  onSelectStage: (stageId: StageId) => void;
  onOpenHome?: () => void;
  onOpenHowToPlay?: () => void;
  onOpenAppearance?: () => void;
  onOpenSetup: () => void;
  onOpenLobby: () => void;
  onSaveMatch: () => void;
  onLoadMatch: () => void;
  onToggleDebug?: () => void;
  onUnlockDebug?: () => void;
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
  const verTag = document.createElement('span');
  verTag.className = 'app-version-tag';
  verTag.textContent = `v${APP_VERSION}`;
  let verClicks = 0;
  let verClickTimer: number | null = null;
  verTag.addEventListener('click', () => {
    verClicks += 1;
    if (verClickTimer !== null) window.clearTimeout(verClickTimer);
    if (verClicks >= 3) {
      verClicks = 0;
      verClickTimer = null;
      options.onUnlockDebug?.();
      return;
    }
    verClickTimer = window.setTimeout(() => {
      verClicks = 0;
      verClickTimer = null;
    }, 1200);
  });
  title.append(
    document.createTextNode('TOP SHOP PROTOTYPE '),
    verTag,
    document.createTextNode(' — Move: Arrows/WASD, Click Tiles, Esc: Reset')
  );

  const controls = document.createElement('div');
  controls.className = 'topbar-controls';

  const makeToggle = (labelText: string, checked: boolean, onChange: (val: boolean) => void) => {
    const lbl = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.addEventListener('change', () => onChange(cb.checked));
    lbl.append(cb, ` ${labelText}`);
    return lbl;
  };

  controls.append(
    makeToggle('Routes', options.initialShowRoutes, options.onToggleRoutes),
    makeToggle('Auto-Move', options.initialAutoStep, options.onToggleAutoStep),
    makeToggle('SFX', options.initialSoundEnabled ?? true, (v) => options.onToggleSound?.(v))
  );

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
  const homeBtn = options.onOpenHome ? makeButton('Home', options.onOpenHome) : null;
  const howToBtn = options.onOpenHowToPlay ? makeButton('How to Play', options.onOpenHowToPlay) : null;
  const appearanceBtn = options.onOpenAppearance ? makeButton('🎨 Appearance', options.onOpenAppearance) : null;
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
  const debugBtn = makeButton('🛠 Debug', () => options.onToggleDebug?.());
  debugBtn.hidden = true;
  if (homeBtn) controls.appendChild(homeBtn);
  if (howToBtn) controls.appendChild(howToBtn);
  if (appearanceBtn) controls.appendChild(appearanceBtn);
  controls.append(setupBtn, onlineBtn, saveBtn, loadBtn, debugBtn);

  topbar.append(title, controls);
  return {
    el: topbar,
    sync: (stageId, hasSavedMatch, netInfo) => {
      const isGuest = netInfo?.role === 'guest';
      stageSelect.value = stageId;
      stageSelect.disabled = isGuest;
      if (homeBtn) homeBtn.disabled = isGuest;
      setupBtn.disabled = isGuest;
      saveBtn.disabled = isGuest;
      loadBtn.disabled = isGuest || !hasSavedMatch;
      debugBtn.hidden = !netInfo?.debugUnlocked || isGuest;
      debugBtn.className = netInfo?.debugOpen ? 'primary' : '';

      if (netInfo?.role === 'host') {
        const waiting = netInfo.waitingCount ?? 0;
        const waitSuffix = waiting > 0 ? ` · +${waiting} waiting` : '';
        onlineBtn.textContent = `Online: ${netInfo.roomCode ?? ''} (Host · ${netInfo.peerCount}G${waitSuffix})`;
        onlineBtn.className = `topbar-online-btn is-online${waiting > 0 ? ' has-waiting' : ''}`;
      } else if (isGuest && netInfo?.reconnecting) {
        onlineBtn.textContent = `Reconnecting: ${netInfo.roomCode ?? ''}…`;
        onlineBtn.className = 'topbar-online-btn is-online has-waiting';
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
