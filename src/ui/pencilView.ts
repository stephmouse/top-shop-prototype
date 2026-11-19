import { PENCIL_FACES } from '../config/balance';
import type { GameAction } from '../engine/actions';
import { getActivePlayer } from '../engine/helpers';
import type { GameState, PencilFace } from '../engine/types';

type DispatchFn = (action: GameAction) => void;

const FACE_COUNT = 9;
const FACE_ANGLE = 360 / FACE_COUNT; // 40deg
const PRISM_RADIUS_PX = 27.5; // 20px / (2 * tan(20deg))

let activeRafId: number | null = null;

function cancelActiveAnimation(): void {
  if (activeRafId !== null) {
    cancelAnimationFrame(activeRafId);
    activeRafId = null;
  }
}

function getFacesForPlayer(state: GameState): readonly PencilFace[] {
  const active = getActivePlayer(state);
  if (active.pencilTurnsLeft > 0 && active.pencilMode === 'ones_twos') {
    return [1, 2, 1, 2, 1, 2, 1, 2, 1];
  }
  if (active.pencilTurnsLeft > 0 && active.pencilMode === 'event_only') {
    return ['E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E'];
  }
  return PENCIL_FACES;
}

export interface PencilPanelOptions {
  readOnly?: boolean;
  remoteSpinning?: boolean;
  onSpinChange?: (spinning: boolean) => void;
}

export function renderPencilPanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  options: PencilPanelOptions = {}
): void {
  cancelActiveAnimation();

  const active = getActivePlayer(state);
  const faces = getFacesForPlayer(state);
  const isSlow = active.pencilTurnsLeft > 0 && active.pencilMode === 'slow';
  const speedDegPerSec = isSlow ? 180 : 900;
  const coastDeg = isSlow ? 0 : 120;
  const decelDurationMs = isSlow ? 80 : 320;

  let spinPhase: 'idle' | 'spinning' | 'stopping' = 'idle';
  let angleDeg = ((Math.abs(state.seed) % FACE_COUNT) * FACE_ANGLE) % 360;
  let lastFrameTs = 0;
  let stopStartTs = 0;
  let stopFromAngle = angleDeg;
  let stopToAngle = angleDeg;
  let chosenFace: PencilFace = faces[0]!;

  const wrap = document.createElement('div');
  wrap.className = 'pencil-panel';

  const stage = document.createElement('div');
  stage.className = 'pencil-stage';

  const assembly = document.createElement('div');
  assembly.className = 'pencil-assembly';

  const eraser = document.createElement('div');
  eraser.className = 'pencil-eraser';

  const ferrule = document.createElement('div');
  ferrule.className = 'pencil-ferrule';

  const prismWrap = document.createElement('div');
  prismWrap.className = 'pencil-prism-wrap';

  const prism = document.createElement('div');
  prism.className = 'pencil-prism';

  faces.forEach((face, idx) => {
    const el = document.createElement('div');
    const isEvent = face === 'E';
    el.className = `pencil-face${isEvent ? ' pencil-face--event' : idx % 2 === 1 ? ' pencil-face--alt' : ''}`;
    el.textContent = String(face);
    el.style.transform = `rotateX(${idx * FACE_ANGLE}deg) translateZ(${PRISM_RADIUS_PX}px)`;
    prism.appendChild(el);
  });

  const targetBar = document.createElement('div');
  targetBar.className = 'pencil-target-bar';

  const tipWood = document.createElement('div');
  tipWood.className = 'pencil-tip-wood';
  const tipLead = document.createElement('div');
  tipLead.className = 'pencil-tip-lead';
  tipWood.appendChild(tipLead);

  prismWrap.appendChild(prism);
  prismWrap.appendChild(targetBar);
  assembly.appendChild(eraser);
  assembly.appendChild(ferrule);
  assembly.appendChild(prismWrap);
  assembly.appendChild(tipWood);
  stage.appendChild(assembly);
  wrap.appendChild(stage);

  const controls = document.createElement('div');
  controls.className = 'action-stack';

  const primaryBtn = document.createElement('button');
  primaryBtn.className = 'primary';
  primaryBtn.dataset.pencilPrimary = 'true';
  primaryBtn.textContent = 'Spin Pencil (Space)';

  const quickBtn = document.createElement('button');
  quickBtn.textContent = 'Quick Roll';
  quickBtn.addEventListener('click', () => {
    cancelActiveAnimation();
    dispatch({ type: 'ROLL_PENCIL' });
  });

  controls.appendChild(primaryBtn);
  controls.appendChild(quickBtn);

  if (active.pencilTurnsLeft > 0 && active.pencilMode !== 'normal') {
    const modeNote = document.createElement('span');
    modeNote.textContent =
      active.pencilMode === 'slow'
        ? `Slow Pencil (${active.pencilTurnsLeft}T) — Instant Stop`
        : active.pencilMode === 'ones_twos'
          ? `Curse: 1 & 2 only (${active.pencilTurnsLeft}T)`
          : `Curse: E only (${active.pencilTurnsLeft}T)`;
    controls.appendChild(modeNote);
  }

  wrap.appendChild(controls);
  container.appendChild(wrap);

  const applyAngle = (deg: number) => {
    prism.style.transform = `rotateX(${-deg}deg)`;
  };
  applyAngle(angleDeg);

  const tick = (ts: number) => {
    if (!stage.isConnected) {
      cancelActiveAnimation();
      return;
    }
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
      const elapsed = ts - stopStartTs;
      const t = Math.min(1, elapsed / decelDurationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      angleDeg = stopFromAngle + (stopToAngle - stopFromAngle) * eased;
      applyAngle(angleDeg);

      if (t >= 1) {
        cancelActiveAnimation();
        dispatch({ type: 'ROLL_PENCIL', chosenFace });
        return;
      }
      activeRafId = requestAnimationFrame(tick);
    }
  };

  if (options.readOnly) {
    primaryBtn.disabled = true;
    quickBtn.disabled = true;
    if (options.remoteSpinning) {
      spinPhase = 'spinning';
      lastFrameTs = 0;
      stage.classList.add('is-spinning');
      primaryBtn.textContent = 'Spinning...';
      activeRafId = requestAnimationFrame(tick);
    } else {
      primaryBtn.textContent = 'Waiting for Roll...';
    }
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
      stopStartTs = performance.now();
      stopFromAngle = angleDeg;
      const snappedSlot = Math.round((angleDeg + coastDeg) / FACE_ANGLE);
      stopToAngle = snappedSlot * FACE_ANGLE;
      const faceIdx = ((snappedSlot % FACE_COUNT) + FACE_COUNT) % FACE_COUNT;
      chosenFace = faces[faceIdx] ?? faces[0]!;
      stage.classList.remove('is-spinning');
      primaryBtn.disabled = true;
      primaryBtn.textContent = 'Stopping...';
    }
  });
}
