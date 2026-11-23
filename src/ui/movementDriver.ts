import type { DirectionChoice, GameAction } from '../engine/actions';
import { getActivePlayer } from '../engine/helpers';
import type { GameState } from '../engine/types';
import type { MultiplayerSession } from '../net/session';
import { ESCALATOR_DWELL_MS, getMoveDurationMs } from './stateDiff';

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
  isAwaitingAck: () => boolean;
  getHoldWaitMs: () => number;
  startGuidedWalk: (choices: DirectionChoice[]) => void;
  scheduleTick: () => void;
}

export function createMovementDriver(opts: MovementDriverOptions): MovementDriver {
  let guidedWalkActive = false;
  let awaitingRemoteStepAck = false;
  let guidedChoices: DirectionChoice[] = [];
  let stepTimer: number | null = null;
  let ackTimer: number | null = null;
  let glideUntil = 0;
  let lastSeenPhase: GameState['phase'] | null = null;
  let lastSeenTileId: string | null = null;

  const isMovingPhase = (phase: GameState['phase']) =>
    phase === 'STEPPING' || phase === 'ESCALATOR_RIDE' || phase === 'ESCALATOR_UNDO' || phase === 'CHOOSE_DIRECTION';
  const clearStepTimer = () => { if (stepTimer !== null) { window.clearTimeout(stepTimer); stepTimer = null; } };
  const clearAckTimer = () => { if (ackTimer !== null) { window.clearTimeout(ackTimer); ackTimer = null; } };
  const clearAwaitingAck = () => { awaitingRemoteStepAck = false; };
  const getHoldWaitMs = () => Math.max(0, glideUntil - Date.now());
  const cancel = () => {
    clearStepTimer();
    clearAckTimer();
    guidedWalkActive = false;
    guidedChoices = [];
    glideUntil = 0;
    lastSeenPhase = null;
    lastSeenTileId = null;
  };

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
    const active = getActivePlayer(state);
    const wasEsc = lastSeenPhase === 'ESCALATOR_RIDE' || lastSeenPhase === 'ESCALATOR_UNDO';
    if (wasEsc && (state.phase === 'STEPPING' || state.phase === 'CHOOSE_DIRECTION') && lastSeenTileId) {
      const fromFloor = state.tiles[lastSeenTileId]?.floor ?? 1;
      const toFloor = state.tiles[active.tileId]?.floor ?? 1;
      glideUntil = Date.now() + getMoveDurationMs('escalator', Math.abs(toFloor - fromFloor));
    }
    lastSeenPhase = state.phase;
    lastSeenTileId = active.tileId;

    if (!isMovingPhase(state.phase)) { guidedWalkActive = false; guidedChoices = []; return; }
    const isEsc = state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO';
    if (isEsc) {
      if (opts.netSession.shouldTickEscalator()) {
        stepTimer = window.setTimeout(stepGuidedOrAuto, ESCALATOR_DWELL_MS);
      }
      return;
    }
    const canWalk = opts.netSession.isLocalTurn(state) && !awaitingRemoteStepAck && (guidedWalkActive || (opts.isAutoStepEnabled() && state.phase === 'STEPPING'));
    if (canWalk) {
      const delay = Math.max(210, getHoldWaitMs());
      stepTimer = window.setTimeout(stepGuidedOrAuto, delay);
    }
  }

  return {
    isMovingPhase,
    cancel,
    clearAckTimer,
    clearAwaitingAck,
    isAwaitingAck: () => awaitingRemoteStepAck,
    getHoldWaitMs,
    scheduleTick,
    startGuidedWalk: (choices) => { cancel(); guidedChoices = [...choices]; guidedWalkActive = true; stepGuidedOrAuto(); },
  };
}
