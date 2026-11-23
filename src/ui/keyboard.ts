import type { DirectionChoice, GameAction } from '../engine/actions';
import { canCancelMove, getActivePlayer, getAvailableDirections } from '../engine/helpers';
import type { GameState } from '../engine/types';

export interface KeyboardBindOptions {
  getState: () => GameState;
  getActionBox: () => HTMLElement;
  dispatch: (action: GameAction) => void;
  isMovingPhase: (phase: GameState['phase']) => boolean;
  isModalOpen?: () => boolean;
  onCloseModal?: () => void;
  getHoldWaitMs?: () => number;
  isAwaitingAck?: () => boolean;
}

const HOLD_CADENCE_MS = 210;

function keyToDirection(key: string): DirectionChoice | null {
  switch (key) {
    case 'ArrowLeft': case 'a': case 'A': return 'left';
    case 'ArrowRight': case 'd': case 'D': return 'right';
    case 'ArrowUp': case 'w': case 'W': return 'up';
    case 'ArrowDown': case 's': case 'S': return 'down';
    default: return null;
  }
}

export function bindKeyboardControls({
  getState,
  getActionBox,
  dispatch,
  isMovingPhase,
  isModalOpen,
  onCloseModal,
  getHoldWaitMs,
  isAwaitingAck,
}: KeyboardBindOptions): void {
  let heldDir: DirectionChoice | null = null;
  let heldIntent: 'forward' | 'undo' | null = null;
  let holdTimer: number | null = null;

  const clearHoldTimer = () => {
    if (holdTimer !== null) { window.clearTimeout(holdTimer); holdTimer = null; }
  };
  const stopHold = () => { clearHoldTimer(); heldDir = null; heldIntent = null; };

  function scheduleHold(delayMs = HOLD_CADENCE_MS): void {
    clearHoldTimer();
    holdTimer = window.setTimeout(tickHold, Math.max(40, delayMs));
  }

  function startHold(dir: DirectionChoice, intent: 'forward' | 'undo'): void {
    stopHold();
    heldDir = dir;
    heldIntent = intent;
    scheduleHold(HOLD_CADENCE_MS);
  }

  function tickHold(): void {
    holdTimer = null;
    if (!heldDir || !heldIntent || isModalOpen?.()) { stopHold(); return; }
    if (isAwaitingAck?.()) { scheduleHold(80); return; }

    const state = getState();
    if (state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO') {
      scheduleHold(100);
      return;
    }
    const waitMs = getHoldWaitMs?.() ?? 0;
    if (waitMs > 0) { scheduleHold(waitMs); return; }

    const active = getActivePlayer(state);
    if (heldIntent === 'forward') {
      if (state.phase === 'STEPPING' && active.horizontalDir === heldDir) {
        dispatch({ type: 'ADVANCE_STEP' });
        scheduleHold(HOLD_CADENCE_MS);
      } else {
        stopHold();
      }
      return;
    }

    const opp = active.horizontalDir === 'left' ? 'right' : active.horizontalDir === 'right' ? 'left' : null;
    if (
      opp === heldDir &&
      canCancelMove(state) &&
      (state.phase === 'STEPPING' || (state.phase === 'CHOOSE_DIRECTION' && !getAvailableDirections(state, active).includes(heldDir)))
    ) {
      dispatch({ type: 'UNDO_STEP' });
      scheduleHold(HOLD_CADENCE_MS);
    } else {
      stopHold();
    }
  }

  window.addEventListener('keyup', (e) => {
    if (heldDir && keyToDirection(e.key) === heldDir) stopHold();
  });
  window.addEventListener('blur', stopHold);

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (isModalOpen?.()) {
      stopHold();
      if (e.key === 'Escape') { e.preventDefault(); onCloseModal?.(); }
      return;
    }

    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    const state = getState();
    if ((state.phase === 'ROLL_PENCIL' || state.phase === 'EVENT_PICK') && (e.key === ' ' || e.key === 'Enter')) {
      stopHold();
      const pencilBtn = getActionBox().querySelector<HTMLButtonElement>('[data-pencil-primary="true"]');
      if (pencilBtn && !pencilBtn.disabled) { e.preventDefault(); pencilBtn.click(); }
      return;
    }

    if ((e.key === 'Escape' || e.key === 'Backspace') && canCancelMove(state)) {
      stopHold();
      e.preventDefault();
      dispatch({ type: 'CANCEL_MOVE' });
      return;
    }

    if (!isMovingPhase(state.phase) || state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO') return;

    const active = getActivePlayer(state);
    const dirKey = keyToDirection(e.key);
    const oppositeHorizontal =
      active.horizontalDir === 'left' ? 'right' : active.horizontalDir === 'right' ? 'left' : null;

    if (
      dirKey &&
      oppositeHorizontal === dirKey &&
      canCancelMove(state) &&
      (state.phase === 'STEPPING' || !getAvailableDirections(state, active).includes(dirKey))
    ) {
      e.preventDefault();
      dispatch({ type: 'UNDO_STEP' });
      startHold(dirKey, 'undo');
      return;
    }

    if (state.phase === 'CHOOSE_DIRECTION' && dirKey) {
      if (getAvailableDirections(state, active).includes(dirKey)) {
        e.preventDefault();
        dispatch({ type: 'CHOOSE_DIRECTION', direction: dirKey });
        if (dirKey === 'left' || dirKey === 'right') startHold(dirKey, 'forward');
      }
      return;
    }

    if (state.phase === 'STEPPING') {
      if (dirKey && dirKey === active.horizontalDir) {
        e.preventDefault();
        dispatch({ type: 'ADVANCE_STEP' });
        startHold(dirKey, 'forward');
      } else if (e.key === ' ' || e.key === 'Enter') {
        stopHold();
        e.preventDefault();
        dispatch({ type: 'ADVANCE_STEP' });
      }
    }
  });
}
