import { PENCIL_FACES } from '../config/balance';
import type { DirectionChoice } from './actions';
import {
  advanceToNextTurn,
  appendLog,
  canCancelMove,
  canPlayerUseElevator,
  computePaydayAmount,
  drawThreeEventIds,
  getActivePlayer,
  getAvailableDirections,
  getTile,
} from './helpers';
import { pickRandom } from './rng';
import type {
  EscalatorLink,
  GameState,
  MoveSnapshot,
  PencilFace,
  Player,
  TurnPhase,
  VerticalDir,
} from './types';

function updateActivePlayer(state: GameState, patch: Partial<Player>): GameState {
  const players = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, ...patch } : p
  );
  return { ...state, players };
}

function applyBankPayday(
  state: GameState,
  isExactLanding: boolean
): { nextState: GameState; note: string } {
  const player = getActivePlayer(state);
  let payday = 0;
  let note = 'missed payday ($0)!';

  if (!player.skipNextPayday) {
    const base = computePaydayAmount(state, player, isExactLanding);
    payday = player.doubleNextPayday ? base * 2 : base;
    const tag = player.doubleNextPayday ? ' (2x payday!)' : isExactLanding ? ' (1.5x bonus)!' : ' payday.';
    note = `+$${payday}${tag}`;
  }

  const nextState = updateActivePlayer(state, {
    cash: player.cash + payday,
    stepsSincePayday: 0,
    doubleNextPayday: false,
    skipNextPayday: false,
    ...(isExactLanding ? { horizontalDir: null, verticalDir: null } : {}),
  });
  return { nextState, note };
}

function captureSnapshot(state: GameState): MoveSnapshot {
  const active = getActivePlayer(state);
  return {
    tileId: active.tileId,
    horizontalDir: active.horizontalDir,
    verticalDir: active.verticalDir,
    stepsSincePayday: active.stepsSincePayday,
    remainingSteps: state.remainingSteps,
    hadBranchChoice: state.hadBranchChoiceThisTurn,
    phase: state.phase === 'CHOOSE_DIRECTION' ? 'CHOOSE_DIRECTION' : 'STEPPING',
  };
}

function restoreSnapshot(
  state: GameState,
  snap: MoveSnapshot,
  remainingHistory: MoveSnapshot[]
): GameState {
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
  };
}

export function handleRollPencil(state: GameState, chosenFace?: PencilFace): GameState {
  if (state.phase !== 'ROLL_PENCIL') return state;
  const player = getActivePlayer(state);
  let nextSeed = state.seed;
  let face: PencilFace;

  if (player.pencilTurnsLeft > 0 && player.pencilMode === 'ones_twos') {
    const r = pickRandom(nextSeed, [1, 2] as const);
    face = r.value;
    nextSeed = r.nextSeed;
  } else if (player.pencilTurnsLeft > 0 && player.pencilMode === 'event_only') {
    face = 'E';
  } else if (
    player.pencilTurnsLeft > 0 &&
    player.pencilMode === 'slow' &&
    chosenFace !== undefined &&
    PENCIL_FACES.includes(chosenFace)
  ) {
    face = chosenFace;
  } else {
    const r = pickRandom(nextSeed, PENCIL_FACES);
    face = r.value;
    nextSeed = r.nextSeed;
  }

  const nextPencilTurns = Math.max(0, player.pencilTurnsLeft - 1);
  const rolledState = updateActivePlayer(state, {
    pencilTurnsLeft: nextPencilTurns,
    pencilMode: nextPencilTurns === 0 ? 'normal' : player.pencilMode,
  });

  if (face === 'E') {
    const drawn = drawThreeEventIds(nextSeed);
    return {
      ...rolledState,
      seed: drawn.nextSeed,
      lastRoll: 'E',
      remainingSteps: 0,
      hadBranchChoiceThisTurn: false,
      moveHistory: [],
      pendingUndoSnapshot: null,
      phase: 'EVENT_PICK',
      eventChoices: drawn.ids,
      log: appendLog(rolledState, `${player.name} rolled E (Event)!`),
    };
  }

  return {
    ...rolledState,
    seed: nextSeed,
    lastRoll: face,
    remainingSteps: face,
    hadBranchChoiceThisTurn: false,
    moveHistory: [],
    pendingUndoSnapshot: null,
    phase: player.horizontalDir === null ? 'CHOOSE_DIRECTION' : 'STEPPING',
    log: appendLog(rolledState, `${player.name} rolled ${face}.`),
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
  return restoreSnapshot(state, snap, remaining);
}

export function handleCancelMove(state: GameState): GameState {
  if (!canCancelMove(state)) return state;
  if (state.moveHistory.length === 1 && state.moveHistory[0]?.viaEscalatorTileId) {
    return handleUndoStep(state);
  }
  const firstSnap = state.moveHistory[0];
  if (!firstSnap) return state;
  const next = restoreSnapshot(state, firstSnap, []);
  return { ...next, log: appendLog(next, `${getActivePlayer(next).name} reset move.`) };
}

function applyEscalatorSlide(
  state: GameState,
  link: EscalatorLink,
  chosenVertical?: VerticalDir
): GameState {
  const player = getActivePlayer(state);
  const nextVertical = link.nextVerticalDir ?? chosenVertical ?? player.verticalDir;
  let history = state.moveHistory;
  if (state.phase === 'ESCALATOR_RIDE' && history.length > 0) {
    const last = history[history.length - 1]!;
    history = [...history.slice(0, -1), { ...last, viaEscalatorTileId: player.tileId }];
  }

  const nextState = updateActivePlayer(
    { ...state, moveHistory: history },
    {
      tileId: link.targetTileId,
      horizontalDir: link.exitHorizontalDir,
      verticalDir: nextVertical,
    }
  );
  const dest = getTile(nextState, link.targetTileId);
  const logged = {
    ...nextState,
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
  nextState = { ...nextState, remainingSteps };

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

  const history = [...state.moveHistory, captureSnapshot(state)];
  const branched = state.hadBranchChoiceThisTurn || available.length > 1;

  if (direction === 'left' || direction === 'right') {
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
    return restoreSnapshot(state, state.pendingUndoSnapshot, state.moveHistory);
  }
  if (state.phase === 'ESCALATOR_RIDE') {
    const player = getActivePlayer(state);
    const { up, down } = getTile(state, player.tileId).neighbors;
    const link = up && down ? (player.verticalDir === 'down' ? down : up) : up ?? down;
    return link ? applyEscalatorSlide(state, link) : resolveTileLanding(state);
  }
  if (state.phase !== 'STEPPING' || state.remainingSteps <= 0) return state;

  const history = [...state.moveHistory, captureSnapshot(state)];
  return executeHorizontalStep({ ...state, moveHistory: history });
}

export function resolveTileLanding(state: GameState): GameState {
  const player = getActivePlayer(state);
  const tile = getTile(state, player.tileId);

  if (tile.type === 'bank') {
    const { nextState: paidState, note } = applyBankPayday(state, true);
    return {
      ...paidState,
      phase: 'BANK_MENU',
      hadBranchChoiceThisTurn: false,
      moveHistory: [],
      pendingPostBankPhase: null,
      log: appendLog(paidState, `${player.name} stopped at Bank: ${note}`),
    };
  }

  const postState: GameState = state.hadBranchChoiceThisTurn ? state : { ...state, moveHistory: [] };

  if (tile.type === 'elevator') {
    if (!canPlayerUseElevator(postState, player.id)) {
      return advanceToNextTurn({
        ...postState,
        moveHistory: [],
        hadBranchChoiceThisTurn: false,
        log: appendLog(postState, `${player.name} landed on locked Elevator.`),
      });
    }
    return { ...postState, phase: 'ELEVATOR_PROMPT', log: appendLog(postState, `${player.name} stopped at Elevator.`) };
  }

  if (tile.type === 'shop' && tile.shopSlotId) {
    const shop = postState.shops[tile.shopSlotId];
    if (!shop || !shop.ownerId) return { ...postState, phase: 'SHOP_BUY_SLOT' };
    if (shop.ownerId === player.id) return { ...postState, phase: 'SHOP_DELIVER' };
    if (shop.isClosedTurns > 0) {
      return advanceToNextTurn({
        ...postState,
        log: appendLog(postState, `${player.name} visited closed rival store — no purchase.`),
      });
    }
    const totalStock = Object.values(shop.stock).reduce((sum, q) => sum + q, 0);
    const nextPhase: TurnPhase = totalStock === 0 ? 'SHOP_BUY_SLOT' : 'SHOP_BUY_RIVAL';
    return { ...postState, phase: nextPhase };
  }

  return advanceToNextTurn(postState);
}

export function handleResolveElevator(state: GameState, ride: boolean): GameState {
  if (state.phase !== 'ELEVATOR_PROMPT') return state;
  const player = getActivePlayer(state);
  if (!ride || !canPlayerUseElevator(state, player.id)) {
    const unlocked = updateActivePlayer(state, { horizontalDir: null, verticalDir: null });
    return advanceToNextTurn({
      ...unlocked,
      log: appendLog(unlocked, `${player.name} skipped the Elevator (direction unlocked).`),
    });
  }

  const elevatorTiles = Object.values(state.tiles).filter((t) => t.type === 'elevator');
  const { value: destTile, nextSeed } = pickRandom(state.seed, elevatorTiles);
  const moved = updateActivePlayer(state, {
    tileId: destTile.id,
    horizontalDir: null,
    verticalDir: null,
  });

  return advanceToNextTurn({
    ...moved,
    seed: nextSeed,
    log: appendLog(moved, `${player.name} rode Elevator to ${destTile.floor}F!`),
  });
}