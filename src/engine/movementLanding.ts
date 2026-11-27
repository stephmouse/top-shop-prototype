import { PENCIL_FACES } from '../config/balance';
import { drawThreeEventIds } from './eventDraw';
import {
  appendLog,
  canPlayerUseElevator,
  computePaydayAmount,
  formatShopRef,
  getActivePlayer,
  getTile,
} from './helpers';
import { bumpMatchStats } from './matchStats';
import { pickRandom } from './rng';
import { advanceToNextTurn } from './turn';
import type { GameState, PencilFace, Player, TurnPhase } from './types';

export function updateActivePlayer(state: GameState, patch: Partial<Player>): GameState {
  const players = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, ...patch } : p
  );
  return { ...state, players };
}

export function applyBankPayday(
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
    bankVisits: (player.bankVisits ?? 0) + 1,
    stepsSincePayday: 0,
    doubleNextPayday: false,
    skipNextPayday: false,
    ...(isExactLanding ? { horizontalDir: null, verticalDir: null } : {}),
  });
  const trackedState: GameState = {
    ...nextState,
    matchStats: bumpMatchStats(nextState, player.id, {
      paydayTotal: payday,
      ...(isExactLanding ? { exactBankLandings: 1 } : {}),
    }),
  };
  return { nextState: trackedState, note };
}

export function handleRollPencil(state: GameState, chosenFace?: PencilFace): GameState {
  if (state.phase !== 'ROLL_PENCIL') return state;
  const player = getActivePlayer(state);
  let nextSeed = state.seed;
  let face: PencilFace;

  if (player.pencilWindow && player.pencilMode === 'ones_twos') {
    if (chosenFace === 1 || chosenFace === 2) {
      face = chosenFace;
    } else {
      const r = pickRandom(nextSeed, [1, 2] as const);
      face = r.value;
      nextSeed = r.nextSeed;
    }
  } else if (player.pencilWindow && player.pencilMode === 'event_only') {
    face = 'E';
  } else if (chosenFace !== undefined && PENCIL_FACES.includes(chosenFace)) {
    face = chosenFace;
  } else {
    const r = pickRandom(nextSeed, PENCIL_FACES);
    face = r.value;
    nextSeed = r.nextSeed;
  }

  if (face === 'E') {
    const drawn = drawThreeEventIds(state, nextSeed);
    return {
      ...state,
      seed: drawn.nextSeed,
      lastRoll: 'E',
      remainingSteps: 0,
      hadBranchChoiceThisTurn: false,
      moveHistory: [],
      pendingUndoSnapshot: null,
      phase: 'EVENT_PICK',
      eventChoices: drawn.ids,
      revealedEventSlot: null,
      matchStats: bumpMatchStats(state, player.id, { pencilRolls: 1, eventRolls: 1 }),
      log: appendLog(state, `${player.name} rolled E (Event)!`),
    };
  }

  return {
    ...state,
    seed: nextSeed,
    lastRoll: face,
    remainingSteps: face,
    hadBranchChoiceThisTurn: false,
    moveHistory: [],
    pendingUndoSnapshot: null,
    phase: player.horizontalDir === null ? 'CHOOSE_DIRECTION' : 'STEPPING',
    matchStats: bumpMatchStats(state, player.id, { pencilRolls: 1 }),
    log: appendLog(state, `${player.name} rolled ${face}.`),
  };
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
    if (shop.closedWindow) {
      return advanceToNextTurn({
        ...postState,
        log: appendLog(postState, `${player.name} visited closed ${formatShopRef(postState, shop)} — no purchase.`),
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

  const currentTile = getTile(state, player.tileId);
  const allElevators = Object.values(state.tiles).filter((t) => t.type === 'elevator');
  const hasMultiShaft = new Set(allElevators.map((t) => t.elevatorShaft ?? 0)).size > 1;
  const shaftElevators = allElevators.filter(
    (t) => currentTile.elevatorShaft === undefined || t.elevatorShaft === currentTile.elevatorShaft
  );
  const { value: destTile, nextSeed } = pickRandom(state.seed, shaftElevators);
  const shaftLabel = hasMultiShaft
    ? `Elevator ${currentTile.elevatorShaft === 1 ? 'B' : 'A'}`
    : 'Elevator';
  const stayedSameFloor = destTile.id === currentTile.id;
  const moved = updateActivePlayer(state, {
    tileId: destTile.id,
    horizontalDir: null,
    verticalDir: null,
  });

  return advanceToNextTurn({
    ...moved,
    seed: nextSeed,
    matchStats: bumpMatchStats(moved, player.id, { elevatorsRidden: 1 }),
    log: appendLog(
      moved,
      stayedSameFloor
        ? `${player.name} rode ${shaftLabel} — stayed on ${destTile.floor}F!`
        : `${player.name} rode ${shaftLabel} to ${destTile.floor}F!`
    ),
  });
}
