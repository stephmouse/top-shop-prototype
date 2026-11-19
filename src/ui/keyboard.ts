import type { DirectionChoice, GameAction } from '../engine/actions';
import { canCancelMove, getActivePlayer, getAvailableDirections } from '../engine/helpers';
import type { GameState } from '../engine/types';

export interface KeyboardBindOptions {
  getState: () => GameState;
  getActionBox: () => HTMLElement;
  dispatch: (action: GameAction) => void;
  isMovingPhase: (phase: GameState['phase']) => boolean;
}

function keyToDirection(key: string): DirectionChoice | null {
  switch (key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 'left';
    case 'ArrowRight':
    case 'd':
    case 'D':
      return 'right';
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'up';
    case 'ArrowDown':
    case 's':
    case 'S':
      return 'down';
    default:
      return null;
  }
}

export function bindKeyboardControls({
  getState,
  getActionBox,
  dispatch,
  isMovingPhase,
}: KeyboardBindOptions): void {
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    const state = getState();
    if (state.phase === 'ROLL_PENCIL' && (e.key === ' ' || e.key === 'Enter')) {
      const pencilBtn = getActionBox().querySelector<HTMLButtonElement>('[data-pencil-primary="true"]');
      if (pencilBtn && !pencilBtn.disabled) {
        e.preventDefault();
        pencilBtn.click();
      }
      return;
    }

    if ((e.key === 'Escape' || e.key === 'Backspace') && canCancelMove(state)) {
      e.preventDefault();
      dispatch({ type: 'CANCEL_MOVE' });
      return;
    }

    if (!isMovingPhase(state.phase) || state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO') {
      return;
    }

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
      return;
    }

    if (state.phase === 'CHOOSE_DIRECTION' && dirKey) {
      if (getAvailableDirections(state, active).includes(dirKey)) {
        e.preventDefault();
        dispatch({ type: 'CHOOSE_DIRECTION', direction: dirKey });
      }
      return;
    }

    if (state.phase === 'STEPPING') {
      if (e.key === ' ' || e.key === 'Enter' || (dirKey && dirKey === active.horizontalDir)) {
        e.preventDefault();
        dispatch({ type: 'ADVANCE_STEP' });
      }
    }
  });
}
