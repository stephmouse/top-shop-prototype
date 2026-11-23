import type { DirectionChoice, GameAction } from '../engine/actions';
import type { GameState } from '../engine/types';
import type { MultiplayerSession } from '../net/session';

export interface MovementDriverOptions {
  netSession: MultiplayerSession;
  getState: () => GameState;
  isAutoStepEnabled: () => boolean;
  onApplyHostAction: (action: GameAction) => GameState;
}

export interface MovementDriver {
  isMovingPhase: (phase: GameState['phase']) => boolean;
  cancel: () => void;
  clearAckTimer: () => void;
  clearAwaitingAck: () => void;
  startGuidedWalk: (choices: DirectionChoice[]) => void;
  scheduleTick: () => void;
}

export function createMovementDriver(opts: MovementDriverOptions): MovementDriver {
  let guidedWalkActive = false;
  let awaitingRemoteStepAck = false;
  let guidedChoices: DirectionChoice[] = [];
  let stepTimer: number | null = null;
  let ackTimer: number | null = null;

  const isMovingPhase = (phase: GameState['phase']) =>
    phase === 'STEPPING' || phase === 'ESCALATOR_RIDE' || phase === 'ESCALATOR_UNDO' || phase === 'CHOOSE_DIRECTION';
  const clearStepTimer = () => { if (stepTimer !== null) { window.clearTimeout(stepTimer); stepTimer = null; } };
  const clearAckTimer = () => { if (ackTimer !== null) { window.clearTimeout(ackTimer); ackTimer = null; } };
  const clearAwaitingAck = () => { awaitingRemoteStepAck = false; };
  const cancel = () => { clearStepTimer(); clearAckTimer(); guidedWalkActive = false; guidedChoices = []; };

  const sendStepAction = (action: GameAction) => {
    clearAckTimer();
    if (opts.netSession.getRole() === 'guest') {
      awaitingRemoteStepAck = true;
      ackTimer = window.setTimeout(() => { awaitingRemoteStepAck = false; scheduleTick(); }, 2500);
    }
    if (!opts.netSession.sendOrApplyAction(action)) { clearAckTimer(); awaitingRemoteStepAck = false; }
  };

  function stepGuidedOrAuto(): void {
    const state = opts.getState();
    if ((state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO') && opts.netSession.shouldTickEscalator()) {
      opts.netSession.broadcastHostState(opts.onApplyHostAction({ type: 'ADVANCE_STEP' }));
      return;
    }
    if (!opts.netSession.isLocalTurn(state) || awaitingRemoteStepAck) return;
    if (guidedWalkActive) {
      if (state.phase === 'CHOOSE_DIRECTION' && guidedChoices.length > 0) return sendStepAction({ type: 'CHOOSE_DIRECTION', direction: guidedChoices.shift()! });
      if (state.phase === 'STEPPING') return sendStepAction({ type: 'ADVANCE_STEP' });
      return cancel();
    }
    if (opts.isAutoStepEnabled() && state.phase === 'STEPPING') sendStepAction({ type: 'ADVANCE_STEP' });
  }

  function scheduleTick(): void {
    clearStepTimer();
    const state = opts.getState();
    if (!isMovingPhase(state.phase)) { guidedWalkActive = false; guidedChoices = []; return; }
    const canEsc = opts.netSession.shouldTickEscalator() && (state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO');
    const canWalk = opts.netSession.isLocalTurn(state) && !awaitingRemoteStepAck && (guidedWalkActive || (opts.isAutoStepEnabled() && state.phase === 'STEPPING'));
    if (canEsc || canWalk) stepTimer = window.setTimeout(stepGuidedOrAuto, 210);
  }

  return {
    isMovingPhase, cancel, clearAckTimer, clearAwaitingAck, scheduleTick,
    startGuidedWalk: (choices) => { cancel(); guidedChoices = [...choices]; guidedWalkActive = true; stepGuidedOrAuto(); },
  };
}
