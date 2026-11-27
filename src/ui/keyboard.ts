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
    const actionBox = getActionBox();
    if (state.phase === 'ROLL_PENCIL' && (e.key === 'q' || e.key === 'Q') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      stopHold();
      const quickBtn = actionBox.querySelector<HTMLButtonElement>('button[data-hotkey="q"]');
      if (quickBtn && !quickBtn.disabled) { e.preventDefault(); quickBtn.click(); }
      return;
    }

    if ((state.phase === 'ROLL_PENCIL' || state.phase === 'EVENT_PICK') && (e.key === ' ' || e.key === 'Enter')) {
      stopHold();
      const pencilBtn = actionBox.querySelector<HTMLButtonElement>('[data-pencil-primary="true"]');
      if (pencilBtn && !pencilBtn.disabled) { e.preventDefault(); pencilBtn.click(); }
      return;
    }

    if ((e.key === 'Escape' || e.key === 'Backspace') && canCancelMove(state)) {
      stopHold();
      e.preventDefault();
      dispatch({ type: 'CANCEL_MOVE' });
      return;
    }

    if (!isMovingPhase(state.phase) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const clearNavHighlight = () => {
        for (const el of Array.from(actionBox.querySelectorAll<HTMLElement>('.is-kbd-active'))) {
          el.classList.remove('is-kbd-active');
        }
      };

      if (!actionBox.classList.contains('is-landing-guard')) {
        if (e.key >= '1' && e.key <= '9') {
          clearNavHighlight();
          const btn = actionBox.querySelector<HTMLButtonElement>(`button[data-hotkey="${e.key}"]`);
          if (btn && !btn.disabled) {
            e.preventDefault();
            btn.click();
          }
          return;
        }
        if (e.key === '0' || e.key === 's' || e.key === 'S') {
          const btn = actionBox.querySelector<HTMLButtonElement>('button[data-choice-skip="true"]');
          if (btn && !btn.disabled) {
            e.preventDefault();
            btn.click();
          }
          return;
        }
        if (e.key === '-' || e.key === 'z' || e.key === 'Z') {
          const btn = actionBox.querySelector<HTMLButtonElement>('button[data-restock-undo="true"]');
          if (btn && !btn.disabled) {
            e.preventDefault();
            btn.click();
          }
          return;
        }
        if (e.key === 'c' || e.key === 'C') {
          const btn = actionBox.querySelector<HTMLButtonElement>('button[data-restock-clear="true"]');
          if (btn && !btn.disabled) {
            e.preventDefault();
            btn.click();
          }
          return;
        }
        if (e.key === 'u' || e.key === 'U') {
          const toggle = actionBox.querySelector<HTMLInputElement>('input[data-bank-usable-toggle="true"]');
          if (toggle && !toggle.disabled) {
            e.preventDefault();
            toggle.click();
          }
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          const navBtns = Array.from(
            actionBox.querySelectorAll<HTMLButtonElement>('button[data-choice-nav="true"]')
          ).filter((b) => !b.disabled);
          if (navBtns.length > 0) {
            e.preventDefault();
            const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
            const curIdx = navBtns.findIndex((b) => b.classList.contains('is-kbd-active'));
            const nextIdx = curIdx === -1 ? (delta > 0 ? 0 : navBtns.length - 1) : (curIdx + delta + navBtns.length) % navBtns.length;
            clearNavHighlight();
            const nextBtn = navBtns[nextIdx]!;
            nextBtn.classList.add('is-kbd-active');
            nextBtn.scrollIntoView?.({ block: 'nearest' });
            nextBtn.focus?.({ preventScroll: true });
          }
          return;
        }
        if (e.key === 'Enter') {
          const navBtn = actionBox.querySelector<HTMLButtonElement>('button[data-choice-nav="true"].is-kbd-active');
          if (navBtn && !navBtn.disabled) {
            e.preventDefault();
            navBtn.click();
            return;
          }
          const btn = actionBox.querySelector<HTMLButtonElement>('button[data-choice-confirm="true"]');
          if (btn && !btn.disabled) {
            e.preventDefault();
            btn.click();
          }
          return;
        }
      }
      if (e.key === 'Escape') {
        const btn = actionBox.querySelector<HTMLButtonElement>('button[data-choice-back="true"]');
        if (btn && !btn.disabled) {
          e.preventDefault();
          btn.click();
        }
        return;
      }
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
