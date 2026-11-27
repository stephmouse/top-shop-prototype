import type { DirectionChoice } from './actions';
import {
  appendLog,
  canCancelMove,
  getActivePlayer,
  getAvailableDirections,
  getTile,
  resolveEscalatorExit,
} from './helpers';
import {
  applyBankPayday,
  resolveTileLanding,
  updateActivePlayer,
} from './movementLanding';
import { bumpMatchStats } from './matchStats';
import type {
  EscalatorLink,
  GameState,
  MoveSnapshot,
  VerticalDir,
} from './types';

export { handleResolveElevator, handleRollPencil, resolveTileLanding } from './movementLanding';

function captureSnapshot(state: GameState, stepCost = 1, rodeEscalator = false): MoveSnapshot {
  const active = getActivePlayer(state);
  return {
    tileId: active.tileId,
    horizontalDir: active.horizontalDir,
    verticalDir: active.verticalDir,
    stepsSincePayday: active.stepsSincePayday,
    remainingSteps: state.remainingSteps,
    hadBranchChoice: state.hadBranchChoiceThisTurn,
    phase: state.phase === 'CHOOSE_DIRECTION' ? 'CHOOSE_DIRECTION' : 'STEPPING',
    stepCost,
    ...(rodeEscalator ? { rodeEscalator: true } : {}),
  };
}

function restoreSnapshot(
  state: GameState,
  snap: MoveSnapshot,
  remainingHistory: MoveSnapshot[],
  undoneSnapshots: MoveSnapshot[]
): GameState {
  const active = getActivePlayer(state);
  const undoSteps = undoneSnapshots.reduce((sum, u) => sum + (u.stepCost ?? 1), 0);
  const undoEscalators = undoneSnapshots.reduce((sum, u) => sum + (u.rodeEscalator ? 1 : 0), 0);
  const restored = updateActivePlayer(state, {
    tileId: snap.tileId,
    horizontalDir: snap.horizontalDir,
    verticalDir: snap.verticalDir,
    stepsSincePayday: snap.stepsSincePayday,
  });
  return {
    ...restored,
    remainingSteps: snap.remainingSteps,
    hadBranchChoiceThisTurn: snap.hadBranchChoice,
    phase: snap.phase,
    moveHistory: remainingHistory,
    pendingUndoSnapshot: null,
    ...(undoSteps > 0 || undoEscalators > 0
      ? {
          matchStats: bumpMatchStats(restored, active.id, {
            stepsTaken: -undoSteps,
            escalatorsRidden: -undoEscalators,
          }),
        }
      : {}),
  };
}

export function handleUndoStep(state: GameState): GameState {
  if (!canCancelMove(state)) return state;
  const snap = state.moveHistory[state.moveHistory.length - 1];
  if (!snap) return state;
  const remaining = state.moveHistory.slice(0, -1);

  if (snap.viaEscalatorTileId) {
    const steppedBack = updateActivePlayer(state, { tileId: snap.viaEscalatorTileId });
    return {
      ...steppedBack,
      phase: 'ESCALATOR_UNDO',
      moveHistory: remaining,
      pendingUndoSnapshot: snap,
    };
  }
  return restoreSnapshot(state, snap, remaining, [snap]);
}

export function handleCancelMove(state: GameState): GameState {
  if (!canCancelMove(state)) return state;
  if (state.moveHistory.length === 1 && state.moveHistory[0]?.viaEscalatorTileId) {
    return handleUndoStep(state);
  }
  const firstSnap = state.moveHistory[0];
  if (!firstSnap) return state;
  const next = restoreSnapshot(state, firstSnap, [], state.moveHistory);
  return { ...next, log: appendLog(next, `${getActivePlayer(next).name} reset move.`) };
}

function applyEscalatorSlide(
  state: GameState,
  link: EscalatorLink,
  chosenVertical?: VerticalDir
): GameState {
  const player = getActivePlayer(state);
  const exit = resolveEscalatorExit(link, player.horizontalDir);
  const nextVertical = link.nextVerticalDir ?? chosenVertical ?? player.verticalDir;
  let history = state.moveHistory;
  if (state.phase === 'ESCALATOR_RIDE' && history.length > 0) {
    const last = history[history.length - 1]!;
    history = [
      ...history.slice(0, -1),
      { ...last, viaEscalatorTileId: player.tileId, rodeEscalator: true },
    ];
  }

  const nextState = updateActivePlayer(
    { ...state, moveHistory: history },
    {
      tileId: exit.targetTileId,
      horizontalDir: exit.exitHorizontalDir,
      verticalDir: nextVertical,
    }
  );
  const dest = getTile(nextState, exit.targetTileId);
  const logged: GameState = {
    ...nextState,
    matchStats: bumpMatchStats(nextState, player.id, { escalatorsRidden: 1 }),
    log: appendLog(nextState, `${player.name} rode escalator to ${dest.floor}F.`),
  };

  return logged.remainingSteps > 0
    ? { ...logged, phase: 'STEPPING' }
    : resolveTileLanding(logged);
}

function executeHorizontalStep(state: GameState): GameState {
  const player = getActivePlayer(state);
  const nextTileId = player.horizontalDir
    ? getTile(state, player.tileId).neighbors[player.horizontalDir]
    : undefined;
  if (!nextTileId) return { ...state, phase: 'CHOOSE_DIRECTION' };

  const remainingSteps = state.remainingSteps - 1;
  let nextState = updateActivePlayer(state, {
    tileId: nextTileId,
    stepsSincePayday: player.stepsSincePayday + 1,
  });
  nextState = {
    ...nextState,
    remainingSteps,
    matchStats: bumpMatchStats(nextState, player.id, { stepsTaken: 1 }),
  };

  const landedTile = getTile(nextState, nextTileId);
  if (landedTile.type === 'escalator') {
    const { up, down } = landedTile.neighbors;
    if (up && down && !getActivePlayer(nextState).verticalDir) {
      return { ...nextState, phase: 'CHOOSE_DIRECTION' };
    }
    if (up || down) return { ...nextState, phase: 'ESCALATOR_RIDE' };
  }

  if (landedTile.type === 'bank' && remainingSteps > 0) {
    const { nextState: paidState, note } = applyBankPayday(nextState, false);
    return {
      ...paidState,
      phase: 'BANK_MENU',
      hadBranchChoiceThisTurn: false,
      moveHistory: [],
      pendingPostBankPhase: 'STEPPING',
      log: appendLog(paidState, `${player.name} passed Bank: ${note}`),
    };
  }

  return remainingSteps === 0 ? resolveTileLanding(nextState) : nextState;
}

export function handleChooseDirection(state: GameState, direction: DirectionChoice): GameState {
  if (state.phase !== 'CHOOSE_DIRECTION') return state;
  const player = getActivePlayer(state);
  const available = getAvailableDirections(state, player);
  if (!available.includes(direction)) return state;

  const isHorizontal = direction === 'left' || direction === 'right';
  const history = [
    ...state.moveHistory,
    captureSnapshot(state, isHorizontal ? 1 : 0, !isHorizontal),
  ];
  const branched = state.hadBranchChoiceThisTurn || available.length > 1;

  if (isHorizontal) {
    const nextState = updateActivePlayer(
      { ...state, moveHistory: history, hadBranchChoiceThisTurn: branched },
      { horizontalDir: direction }
    );
    return executeHorizontalStep({
      ...nextState,
      phase: 'STEPPING',
      log: appendLog(nextState, `${player.name} heads ${direction}.`),
    });
  }

  const link = getTile(state, player.tileId).neighbors[direction];
  return link
    ? applyEscalatorSlide({ ...state, moveHistory: history, hadBranchChoiceThisTurn: branched }, link, direction)
    : state;
}

export function handleAdvanceStep(state: GameState): GameState {
  if (state.phase === 'ESCALATOR_UNDO' && state.pendingUndoSnapshot) {
    return restoreSnapshot(state, state.pendingUndoSnapshot, state.moveHistory, [state.pendingUndoSnapshot]);
  }
  if (state.phase === 'ESCALATOR_RIDE') {
    const player = getActivePlayer(state);
    const { up, down } = getTile(state, player.tileId).neighbors;
    const link = up && down ? (player.verticalDir === 'down' ? down : up) : up ?? down;
    return link ? applyEscalatorSlide(state, link) : resolveTileLanding(state);
  }
  if (state.phase !== 'STEPPING' || state.remainingSteps <= 0) return state;

  const history = [...state.moveHistory, captureSnapshot(state, 1)];
  return executeHorizontalStep({ ...state, moveHistory: history });
}
