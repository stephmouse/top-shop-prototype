import { PENCIL_FACES } from '../config/balance';
import type { GameAction } from '../engine/actions';
import { getActivePlayer } from '../engine/helpers';
import { formatTimedWindowEndpoint, getTimedWindowRoundsLeft } from '../engine/timedEffects';
import type { GameState, PencilFace } from '../engine/types';

type DispatchFn = (action: GameAction) => void;

const FACE_COUNT = 9;
const FACE_ANGLE = 360 / FACE_COUNT; // 40deg
const PRISM_RADIUS_PX = 27.5; // 20px / (2 * tan(20deg))
const LANDED_HOLD_MS = 500;

let activeRafId: number | null = null;
let activeHoldTimerId: number | null = null;
let activeRemoteController: {
  isConnected: () => boolean;
  startSpin: () => void;
  stopOnFace: (face: PencilFace) => void;
} | null = null;

export function cancelPencilAnimation(): void {
  if (activeRafId !== null) {
    cancelAnimationFrame(activeRafId);
    activeRafId = null;
  }
  if (activeHoldTimerId !== null) {
    window.clearTimeout(activeHoldTimerId);
    activeHoldTimerId = null;
  }
  activeRemoteController = null;
}

export function updateRemotePencil(spinning: boolean, stopFace: PencilFace | null): boolean {
  if (!activeRemoteController || !activeRemoteController.isConnected()) {
    activeRemoteController = null;
    return false;
  }
  if (spinning) {
    activeRemoteController.startSpin();
    return true;
  }
  if (stopFace !== null) {
    activeRemoteController.stopOnFace(stopFace);
    return true;
  }
  return false;
}

function getFacesForPlayer(state: GameState): readonly PencilFace[] {
  const active = getActivePlayer(state);
  if (active.pencilWindow && active.pencilMode === 'ones_twos') return [1, 2, 1, 2, 1, 2, 1, 2, 1];
  if (active.pencilWindow && active.pencilMode === 'event_only') return ['E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E'];
  return PENCIL_FACES;
}

function computeStopTargetAngle(
  currentAngle: number,
  targetFace: PencilFace,
  faces: readonly PencilFace[],
  coastDeg: number
): number {
  const baseSlot = Math.ceil((currentAngle + coastDeg) / FACE_ANGLE);
  for (let offset = 0; offset < FACE_COUNT; offset++) {
    const slot = baseSlot + offset;
    const faceIdx = ((slot % FACE_COUNT) + FACE_COUNT) % FACE_COUNT;
    if (faces[faceIdx] === targetFace) return slot * FACE_ANGLE;
  }
  return baseSlot * FACE_ANGLE;
}

export interface PencilPanelOptions {
  readOnly?: boolean;
  remoteSpinning?: boolean;
  remoteStopFace?: PencilFace | null;
  onSpinChange?: (spinning: boolean, stopFace?: PencilFace) => void;
  onLanded?: (face: PencilFace) => void;
}

export function renderPencilPanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  options: PencilPanelOptions = {}
): void {
  cancelPencilAnimation();

  const active = getActivePlayer(state);
  const faces = getFacesForPlayer(state);
  const isSlow = Boolean(active.pencilWindow && active.pencilMode === 'slow');
  const speedDegPerSec = isSlow ? 180 : 1350;
  const coastDeg = isSlow ? 0 : 120;
  let stopDurationMs = isSlow ? 80 : 320;

  let spinPhase: 'idle' | 'spinning' | 'stopping' | 'landed' = 'idle';
  let angleDeg = Math.floor(Math.random() * FACE_COUNT) * FACE_ANGLE;
  let lastFrameTs = 0;
  let stopStartTs = 0;
  let stopFromAngle = angleDeg;
  let stopToAngle = angleDeg;
  let chosenFace: PencilFace = faces[0]!;

  const wrap = Object.assign(document.createElement('div'), { className: 'pencil-panel' });
  const stage = Object.assign(document.createElement('div'), { className: 'pencil-stage' });
  const assembly = Object.assign(document.createElement('div'), { className: 'pencil-assembly' });
  const eraser = Object.assign(document.createElement('div'), { className: 'pencil-eraser' });
  const ferrule = Object.assign(document.createElement('div'), { className: 'pencil-ferrule' });
  const prismWrap = Object.assign(document.createElement('div'), { className: 'pencil-prism-wrap' });
  const prism = Object.assign(document.createElement('div'), { className: 'pencil-prism' });

  faces.forEach((face, idx) => {
    const el = document.createElement('div');
    const isEvent = face === 'E';
    el.className = `pencil-face${isEvent ? ' pencil-face--event' : idx % 2 === 1 ? ' pencil-face--alt' : ''}`;
    el.textContent = String(face);
    el.style.transform = `rotateX(${idx * FACE_ANGLE}deg) translateZ(${PRISM_RADIUS_PX}px)`;
    prism.appendChild(el);
  });

  const targetBar = Object.assign(document.createElement('div'), { className: 'pencil-target-bar' });
  const tipWood = Object.assign(document.createElement('div'), { className: 'pencil-tip-wood' });
  tipWood.appendChild(Object.assign(document.createElement('div'), { className: 'pencil-tip-lead' }));
  prismWrap.append(prism, targetBar);
  assembly.append(eraser, ferrule, prismWrap, tipWood);
  stage.appendChild(assembly);
  wrap.appendChild(stage);

  const controls = Object.assign(document.createElement('div'), { className: 'action-stack' });
  const primaryBtn = Object.assign(document.createElement('button'), { className: 'primary', textContent: 'Spin Pencil (Space)' });
  primaryBtn.dataset.pencilPrimary = 'true';
  const quickBtn = Object.assign(document.createElement('button'), { textContent: 'Quick Roll (Q)' });
  quickBtn.dataset.hotkey = 'q';
  quickBtn.addEventListener('click', () => {
    cancelPencilAnimation();
    dispatch({ type: 'ROLL_PENCIL' });
  });
  controls.append(primaryBtn, quickBtn);

  if (active.pencilWindow && active.pencilMode !== 'normal') {
    const rd = getTimedWindowRoundsLeft(state, active.pencilWindow);
    const modeNote = document.createElement('span');
    modeNote.textContent =
      active.pencilMode === 'slow'
        ? `Slow Pencil (${rd} rd) — Instant Stop`
        : active.pencilMode === 'ones_twos'
          ? `Curse: 1 & 2 only (${rd} rd)`
          : `Curse: E only (${rd} rd)`;
    modeNote.title = formatTimedWindowEndpoint(state, active.pencilWindow, 'Ends');
    controls.appendChild(modeNote);
  }
  wrap.appendChild(controls);
  container.appendChild(wrap);

  const applyAngle = (deg: number) => { prism.style.transform = `rotateX(${-deg}deg)`; };
  applyAngle(angleDeg);

  const finishLanding = () => {
    if (activeRafId !== null) { cancelAnimationFrame(activeRafId); activeRafId = null; }
    spinPhase = 'landed';
    stage.classList.remove('is-spinning');
    stage.classList.add('is-landed');
    if (chosenFace === 'E') stage.classList.add('is-event-landed');
    primaryBtn.textContent = chosenFace === 'E' ? 'Rolled E (Event)!' : `Rolled ${chosenFace}!`;
    options.onLanded?.(chosenFace);
    if (!options.readOnly) {
      activeHoldTimerId = window.setTimeout(() => {
        activeHoldTimerId = null;
        dispatch({ type: 'ROLL_PENCIL', chosenFace });
      }, LANDED_HOLD_MS);
    }
  };

  const tick = (ts: number) => {
    if (!stage.isConnected) { cancelPencilAnimation(); return; }
    if (lastFrameTs === 0) lastFrameTs = ts;
    const dtSec = Math.min(0.05, (ts - lastFrameTs) / 1000);
    lastFrameTs = ts;

    if (spinPhase === 'spinning') {
      angleDeg += speedDegPerSec * dtSec;
      applyAngle(angleDeg);
      activeRafId = requestAnimationFrame(tick);
      return;
    }

    if (spinPhase === 'stopping') {
      const t = Math.min(1, (ts - stopStartTs) / stopDurationMs);
      angleDeg = stopFromAngle + (stopToAngle - stopFromAngle) * (1 - Math.pow(1 - t, 3));
      applyAngle(angleDeg);
      if (t >= 1) { finishLanding(); return; }
      activeRafId = requestAnimationFrame(tick);
    }
  };

  const startRemoteSpin = () => {
    if (spinPhase === 'spinning') return;
    spinPhase = 'spinning';
    lastFrameTs = 0;
    stage.classList.remove('is-landed', 'is-event-landed');
    stage.classList.add('is-spinning');
    primaryBtn.textContent = 'Spinning...';
    if (activeRafId === null) activeRafId = requestAnimationFrame(tick);
  };

  const startRemoteStop = (face: PencilFace) => {
    if (spinPhase === 'landed' && chosenFace === face) return;
    spinPhase = 'stopping';
    chosenFace = face;
    stopStartTs = performance.now();
    stopFromAngle = angleDeg;
    stopToAngle = computeStopTargetAngle(angleDeg, face, faces, coastDeg);
    const delta = Math.max(0, stopToAngle - stopFromAngle);
    stopDurationMs = isSlow ? Math.max(80, Math.min(220, delta * 0.7)) : Math.max(240, Math.min(360, 210 + delta * 0.32));
    stage.classList.remove('is-spinning', 'is-landed', 'is-event-landed');
    primaryBtn.textContent = 'Stopping...';
    if (activeRafId === null) activeRafId = requestAnimationFrame(tick);
  };

  if (options.readOnly) {
    primaryBtn.disabled = true;
    quickBtn.disabled = true;
    activeRemoteController = { isConnected: () => stage.isConnected, startSpin: startRemoteSpin, stopOnFace: startRemoteStop };
    if (options.remoteSpinning) startRemoteSpin();
    else if (options.remoteStopFace !== undefined && options.remoteStopFace !== null) startRemoteStop(options.remoteStopFace);
    else primaryBtn.textContent = 'Waiting for Roll...';
    return;
  }

  primaryBtn.addEventListener('click', () => {
    if (spinPhase === 'idle') {
      spinPhase = 'spinning';
      lastFrameTs = 0;
      stage.classList.add('is-spinning');
      primaryBtn.textContent = isSlow ? 'Instant Stop (Space)' : 'Stop Pencil (Space)';
      quickBtn.disabled = true;
      options.onSpinChange?.(true);
      activeRafId = requestAnimationFrame(tick);
    } else if (spinPhase === 'spinning') {
      spinPhase = 'stopping';
      stopDurationMs = isSlow ? 80 : 320;
      stopStartTs = performance.now();
      stopFromAngle = angleDeg;
      const snappedSlot = Math.round((angleDeg + coastDeg) / FACE_ANGLE);
      stopToAngle = snappedSlot * FACE_ANGLE;
      const faceIdx = ((snappedSlot % FACE_COUNT) + FACE_COUNT) % FACE_COUNT;
      chosenFace = faces[faceIdx] ?? faces[0]!;
      stage.classList.remove('is-spinning');
      primaryBtn.disabled = true;
      primaryBtn.textContent = 'Stopping...';
      options.onSpinChange?.(false, chosenFace);
    }
  });
}
