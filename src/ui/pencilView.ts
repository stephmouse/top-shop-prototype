import { PENCIL_FACES } from '../config/balance';
import type { GameAction } from '../engine/actions';
import { getActivePlayer } from '../engine/helpers';
import { formatTimedWindowEndpoint, getTimedWindowRoundsLeft } from '../engine/timedEffects';
import type { GameState, PencilFace } from '../engine/types';
import { getDisplayPlayerColor } from './themeConfig';

type DispatchFn = (action: GameAction) => void;

const FACE_COUNT = 9;
const FACE_ANGLE = 360 / FACE_COUNT; // 40deg
const PRISM_RADIUS_PX = 27.5; // 20px / (2 * tan(20deg))
const LANDED_HOLD_MS = 500;
const SETTLE_SPLIT = 0.76;
const SETTLE_OVERSHOOT_DEG = 5.5;

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

/** Computes deceleration angle with a damped wooden facet overshoot for normal spins. */
export function computeSettleAngle(
  fromAngle: number,
  toAngle: number,
  rawT: number,
  isSlow: boolean
): { angle: number; isSettling: boolean } {
  const t = Math.max(0, Math.min(1, rawT));
  if (t <= 0) return { angle: fromAngle, isSettling: false };
  if (t >= 1) return { angle: toAngle, isSettling: !isSlow };

  if (isSlow) {
    return {
      angle: fromAngle + (toAngle - fromAngle) * (1 - Math.pow(1 - t, 3)),
      isSettling: false,
    };
  }

  if (t < SETTLE_SPLIT) {
    const u = t / SETTLE_SPLIT;
    return {
      angle: fromAngle + (toAngle + SETTLE_OVERSHOOT_DEG - fromAngle) * (1 - Math.pow(1 - u, 3)),
      isSettling: false,
    };
  }

  const v = (t - SETTLE_SPLIT) / (1 - SETTLE_SPLIT);
  const rock = SETTLE_OVERSHOOT_DEG * Math.pow(1 - v, 1.4) * Math.cos(v * Math.PI * 1.5);
  return { angle: toAngle + rock, isSettling: true };
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
  onTick?: (isSlow: boolean, speedNorm: number) => void;
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
  const pencilMode = active.pencilWindow ? active.pencilMode : 'normal';
  const isSlow = pencilMode === 'slow';
  const speedDegPerSec = isSlow ? 180 : 1350;
  const coastDeg = isSlow ? 0 : 120;
  let stopDurationMs = isSlow ? 80 : 400;

  let spinPhase: 'idle' | 'spinning' | 'stopping' | 'landed' = 'idle';
  let angleDeg = Math.floor(Math.random() * FACE_COUNT) * FACE_ANGLE;
  let lastTickSlot = Math.floor((angleDeg + FACE_ANGLE / 2) / FACE_ANGLE);
  let lastFrameTs = 0;
  let stopStartTs = 0;
  let stopFromAngle = angleDeg;
  let stopToAngle = angleDeg;
  let chosenFace: PencilFace = faces[0]!;
  let hasDispatched = false;

  const wrap = Object.assign(document.createElement('div'), { className: 'pencil-panel' });
  const stage = Object.assign(document.createElement('div'), { className: 'pencil-stage' });
  stage.dataset.pencilMode = pencilMode;

  const shadowEl = Object.assign(document.createElement('div'), { className: 'pencil-shadow' });
  const assembly = Object.assign(document.createElement('div'), { className: 'pencil-assembly' });
  const eraser = Object.assign(document.createElement('div'), { className: 'pencil-eraser' });
  const ferruleLeft = Object.assign(document.createElement('div'), { className: 'pencil-ferrule pencil-ferrule--left' });
  const ownerBand = Object.assign(document.createElement('div'), { className: 'pencil-owner-band' });
  ownerBand.style.setProperty('--owner-color', getDisplayPlayerColor(state.activePlayerIndex, active.color));
  const ferruleRight = Object.assign(document.createElement('div'), { className: 'pencil-ferrule pencil-ferrule--right' });

  const prismWrap = Object.assign(document.createElement('div'), { className: 'pencil-prism-wrap' });
  const prism = Object.assign(document.createElement('div'), { className: 'pencil-prism' });
  const faceEls: HTMLElement[] = [];

  faces.forEach((face, idx) => {
    const el = document.createElement('div');
    const isEvent = face === 'E';
    el.className = `pencil-face${isEvent ? ' pencil-face--event' : idx % 2 === 1 ? ' pencil-face--alt' : ''}`;
    el.textContent = isEvent ? '★ E' : String(face);
    el.style.transform = `rotateX(${idx * FACE_ANGLE}deg) translateZ(${PRISM_RADIUS_PX}px)`;
    prism.appendChild(el);
    faceEls.push(el);
  });

  const targetBar = Object.assign(document.createElement('div'), { className: 'pencil-target-bar' });
  const tipWood = Object.assign(document.createElement('div'), { className: 'pencil-tip-wood' });
  tipWood.appendChild(Object.assign(document.createElement('div'), { className: 'pencil-tip-lead' }));
  prismWrap.append(prism, targetBar);
  assembly.append(eraser, ferruleLeft, ownerBand, ferruleRight, prismWrap, tipWood);

  const resultPop = Object.assign(document.createElement('div'), {
    className: 'pencil-result-pop',
    hidden: true,
  });

  if (active.pencilWindow && pencilMode !== 'normal') {
    const rd = getTimedWindowRoundsLeft(state, active.pencilWindow);
    const badge = Object.assign(document.createElement('div'), { className: 'pencil-mode-badge' });
    badge.dataset.pencilMode = pencilMode;
    badge.textContent =
      pencilMode === 'slow'
        ? `Slow Pencil (${rd} rd) · Instant Stop`
        : pencilMode === 'ones_twos'
          ? `Curse: 1 & 2 Only (${rd} rd)`
          : `Curse: ★ E Only (${rd} rd)`;
    badge.title = formatTimedWindowEndpoint(state, active.pencilWindow, 'Ends');
    stage.appendChild(badge);
  }

  stage.append(shadowEl, assembly, resultPop);

  const idleHint = Object.assign(document.createElement('span'), {
    className: 'pencil-idle-hint',
    textContent: 'Click or Space',
    hidden: Boolean(options.readOnly),
  });
  stage.appendChild(idleHint);
  wrap.appendChild(stage);

  const controls = Object.assign(document.createElement('div'), { className: 'action-stack' });
  const primaryBtn = Object.assign(document.createElement('button'), {
    className: 'primary',
    textContent: 'Spin Pencil (Space)',
  });
  primaryBtn.dataset.pencilPrimary = 'true';
  const quickBtn = Object.assign(document.createElement('button'), { textContent: 'Quick Roll (Q)' });
  quickBtn.dataset.hotkey = 'q';
  quickBtn.addEventListener('click', () => {
    cancelPencilAnimation();
    dispatch({ type: 'ROLL_PENCIL' });
  });
  controls.append(primaryBtn, quickBtn);
  wrap.appendChild(controls);
  container.appendChild(wrap);

  const applyAngle = (deg: number) => {
    prism.style.transform = `rotateX(${-deg}deg)`;
    for (let idx = 0; idx < faceEls.length; idx++) {
      const faceEl = faceEls[idx]!;
      const delta = ((((idx * FACE_ANGLE - deg) % 360) + 540) % 360) - 180;
      if (Math.abs(delta) <= 95) {
        const cos = Math.max(0, Math.cos((delta * Math.PI) / 180));
        faceEl.style.filter = `brightness(${(0.58 + 0.48 * cos).toFixed(2)})`;
      } else if (faceEl.style.filter) {
        faceEl.style.filter = '';
      }
    }
  };
  applyAngle(angleDeg);

  const commitRoll = () => {
    if (hasDispatched) return;
    hasDispatched = true;
    if (activeHoldTimerId !== null) {
      window.clearTimeout(activeHoldTimerId);
      activeHoldTimerId = null;
    }
    dispatch({ type: 'ROLL_PENCIL', chosenFace });
  };

  const finishLanding = () => {
    if (activeRafId !== null) { cancelAnimationFrame(activeRafId); activeRafId = null; }
    spinPhase = 'landed';
    stage.classList.remove('is-spinning', 'is-idle');
    stage.classList.add('is-landed');
    if (chosenFace === 'E') stage.classList.add('is-event-landed');
    resultPop.textContent = chosenFace === 'E' ? '★ EVENT!' : `${chosenFace}!`;
    resultPop.className = `pencil-result-pop${chosenFace === 'E' ? ' is-event' : ''}`;
    resultPop.hidden = false;
    options.onLanded?.(chosenFace);

    if (!options.readOnly) {
      stage.classList.add('is-interactive');
      stage.title = 'Click or press Space to continue';
      primaryBtn.disabled = false;
      primaryBtn.textContent = chosenFace === 'E' ? 'Rolled ★ E! (Space)' : `Rolled ${chosenFace}! (Space)`;
      activeHoldTimerId = window.setTimeout(commitRoll, LANDED_HOLD_MS);
    } else {
      primaryBtn.textContent = chosenFace === 'E' ? 'Rolled ★ E!' : `Rolled ${chosenFace}!`;
    }
  };

  const tick = (ts: number) => {
    if (!stage.isConnected) { cancelPencilAnimation(); return; }
    if (lastFrameTs === 0) lastFrameTs = ts;
    const dtSec = Math.min(0.05, (ts - lastFrameTs) / 1000);
    lastFrameTs = ts;

    if (spinPhase === 'spinning') {
      angleDeg += speedDegPerSec * dtSec;
      const slot = Math.floor((angleDeg + FACE_ANGLE / 2) / FACE_ANGLE);
      if (slot !== lastTickSlot) {
        lastTickSlot = slot;
        options.onTick?.(isSlow, 1);
      }
      applyAngle(angleDeg);
      activeRafId = requestAnimationFrame(tick);
      return;
    }

    if (spinPhase === 'stopping') {
      const t = Math.min(1, (ts - stopStartTs) / stopDurationMs);
      const res = computeSettleAngle(stopFromAngle, stopToAngle, t, isSlow);
      angleDeg = res.angle;
      if (!res.isSettling) {
        const slot = Math.floor((angleDeg + FACE_ANGLE / 2) / FACE_ANGLE);
        if (slot !== lastTickSlot) {
          lastTickSlot = slot;
          options.onTick?.(isSlow, isSlow ? 1 : Math.max(0.1, 1 - t / SETTLE_SPLIT));
        }
      }
      applyAngle(angleDeg);
      if (t >= 1) { finishLanding(); return; }
      activeRafId = requestAnimationFrame(tick);
    }
  };

  const startRemoteSpin = () => {
    if (spinPhase === 'spinning') return;
    spinPhase = 'spinning';
    lastFrameTs = 0;
    lastTickSlot = Math.floor((angleDeg + FACE_ANGLE / 2) / FACE_ANGLE);
    idleHint.hidden = true;
    resultPop.hidden = true;
    stage.classList.remove('is-idle', 'is-landed', 'is-event-landed');
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
    stopDurationMs = isSlow ? Math.max(80, Math.min(220, delta * 0.7)) : Math.max(280, Math.min(440, 250 + delta * 0.34));
    idleHint.hidden = true;
    resultPop.hidden = true;
    stage.classList.remove('is-idle', 'is-spinning', 'is-landed', 'is-event-landed');
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

  const triggerSpinOrStop = () => {
    if (spinPhase === 'idle') {
      spinPhase = 'spinning';
      lastFrameTs = 0;
      lastTickSlot = Math.floor((angleDeg + FACE_ANGLE / 2) / FACE_ANGLE);
      idleHint.hidden = true;
      stage.classList.remove('is-idle');
      stage.classList.add('is-spinning');
      stage.title = isSlow ? 'Click or tap pencil for instant stop' : 'Click or tap pencil to stop';
      primaryBtn.textContent = isSlow ? 'Instant Stop (Space)' : 'Stop Pencil (Space)';
      quickBtn.disabled = true;
      options.onSpinChange?.(true);
      activeRafId = requestAnimationFrame(tick);
    } else if (spinPhase === 'spinning') {
      spinPhase = 'stopping';
      stopDurationMs = isSlow ? 80 : 400;
      stopStartTs = performance.now();
      stopFromAngle = angleDeg;
      const snappedSlot = Math.round((angleDeg + coastDeg) / FACE_ANGLE);
      stopToAngle = snappedSlot * FACE_ANGLE;
      const faceIdx = ((snappedSlot % FACE_COUNT) + FACE_COUNT) % FACE_COUNT;
      chosenFace = faces[faceIdx] ?? faces[0]!;
      stage.classList.remove('is-spinning', 'is-interactive');
      stage.title = '';
      primaryBtn.disabled = true;
      primaryBtn.textContent = 'Stopping...';
      options.onSpinChange?.(false, chosenFace);
    } else if (spinPhase === 'landed') {
      commitRoll();
    }
  };

  stage.classList.add('is-interactive', 'is-idle');
  stage.setAttribute('role', 'button');
  stage.setAttribute('aria-label', 'Spin or stop pencil');
  stage.title = 'Click or tap pencil to spin';
  stage.addEventListener('click', triggerSpinOrStop);
  primaryBtn.addEventListener('click', triggerSpinOrStop);
}
