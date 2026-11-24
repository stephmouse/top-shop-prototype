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
  markAwaitingAck: () => void;
  onRemoteStateAccepted: (prev: GameState | null, next: GameState) => void;
  isAwaitingAck: () => boolean;
  getHoldWaitMs: () => number;
  startGuidedWalk: (choices: DirectionChoice[]) => void;
  scheduleTick: () => void;
}

export function createMovementDriver(opts: MovementDriverOptions): MovementDriver {
  let guidedWalkActive = false;
  let awaitingRemoteStepAck = false;
  let pendingGuidedShift = false;
  let guidedChoices: DirectionChoice[] = [];
  let stepTimer: ReturnType<typeof setTimeout> | null = null;
  let ackTimer: ReturnType<typeof setTimeout> | null = null;
  let glideUntil = 0;
  let lastSeenPhase: GameState['phase'] | null = null;
  let lastSeenTileId: string | null = null;

  const isMovingPhase = (phase: GameState['phase']) =>
    phase === 'STEPPING' || phase === 'ESCALATOR_RIDE' || phase === 'ESCALATOR_UNDO' || phase === 'CHOOSE_DIRECTION';
  const clearStepTimer = () => { if (stepTimer !== null) { clearTimeout(stepTimer); stepTimer = null; } };
  const clearAckTimer = () => { if (ackTimer !== null) { clearTimeout(ackTimer); ackTimer = null; } };
  const clearAwaitingAck = () => { awaitingRemoteStepAck = false; pendingGuidedShift = false; };
  const getHoldWaitMs = () => Math.max(0, glideUntil - Date.now());
  const cancel = () => {
    clearStepTimer();
    clearAckTimer();
    guidedWalkActive = false;
    pendingGuidedShift = false;
    guidedChoices = [];
    glideUntil = 0;
    lastSeenPhase = null;
    lastSeenTileId = null;
  };

  const markAwaitingAck = () => {
    clearAckTimer();
    awaitingRemoteStepAck = true;
    ackTimer = setTimeout(() => {
      ackTimer = null;
      awaitingRemoteStepAck = false;
      pendingGuidedShift = false;
      scheduleTick();
    }, 2500);
  };

  const sendStepAction = (action: GameAction) => {
    clearAckTimer();
    if (opts.netSession.getRole() === 'guest') {
      markAwaitingAck();
    }
    if (!opts.netSession.sendOrApplyAction(action)) {
      clearAckTimer();
      clearAwaitingAck();
    }
  };

  function stepGuidedOrAuto(): void {
    const state = opts.getState();
    if (state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO') {
      if (opts.netSession.shouldTickEscalator()) {
        opts.netSession.broadcastHostState(opts.onApplyHostAction({ type: 'ADVANCE_STEP' }));
      } else if (opts.netSession.isLocalTurn(state) && !awaitingRemoteStepAck) {
        sendStepAction({ type: 'ADVANCE_STEP' });
      }
      return;
    }
    if (!opts.netSession.isLocalTurn(state) || awaitingRemoteStepAck) return;
    if (guidedWalkActive) {
      if (state.phase === 'CHOOSE_DIRECTION' && guidedChoices.length > 0) {
        const dir = guidedChoices[0]!;
        if (opts.netSession.getRole() === 'guest') pendingGuidedShift = true;
        else guidedChoices.shift();
        return sendStepAction({ type: 'CHOOSE_DIRECTION', direction: dir });
      }
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

    if (!isMovingPhase(state.phase)) { guidedWalkActive = false; pendingGuidedShift = false; guidedChoices = []; return; }
    const isEsc = state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO';
    if (isEsc) {
      if (opts.netSession.shouldTickEscalator() || (opts.netSession.isLocalTurn(state) && !awaitingRemoteStepAck)) {
        stepTimer = setTimeout(stepGuidedOrAuto, ESCALATOR_DWELL_MS);
      }
      return;
    }
    const canWalk = opts.netSession.isLocalTurn(state) && !awaitingRemoteStepAck && (guidedWalkActive || (opts.isAutoStepEnabled() && state.phase === 'STEPPING'));
    if (canWalk) {
      const delay = Math.max(210, getHoldWaitMs());
      stepTimer = setTimeout(stepGuidedOrAuto, delay);
    }
  }

  return {
    isMovingPhase,
    cancel,
    clearAckTimer,
    clearAwaitingAck,
    markAwaitingAck,
    onRemoteStateAccepted: (prev, next) => {
      clearAckTimer();
      awaitingRemoteStepAck = false;
      if (pendingGuidedShift) {
        const progressed =
          !prev ||
          next.phase !== 'CHOOSE_DIRECTION' ||
          getActivePlayer(next).tileId !== getActivePlayer(prev).tileId ||
          next.remainingSteps !== prev.remainingSteps;
        if (progressed) guidedChoices.shift();
        pendingGuidedShift = false;
      }
    },
    isAwaitingAck: () => awaitingRemoteStepAck,
    getHoldWaitMs,
    scheduleTick,
    startGuidedWalk: (choices) => { if (awaitingRemoteStepAck) return; cancel(); guidedChoices = [...choices]; guidedWalkActive = true; stepGuidedOrAuto(); },
  };
}
