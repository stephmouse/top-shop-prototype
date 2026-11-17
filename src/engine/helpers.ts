import { EVENT_CARDS, PAYDAY_CONFIG, STORE_TYPES } from '../config/balance';
import { pickRandom } from './rng';
import type { GameState, ItemDef, Player, Shop, Tile } from './types';

export function getActivePlayer(state: GameState): Player {
  const player = state.players[state.activePlayerIndex];
  if (!player) {
    throw new Error(`Invalid activePlayerIndex: ${state.activePlayerIndex}`);
  }
  return player;
}

export function getTile(state: GameState, tileId: string): Tile {
  const tile = state.tiles[tileId];
  if (!tile) {
    throw new Error(`Unknown tileId: ${tileId}`);
  }
  return tile;
}

export function appendLog(state: GameState, message: string): string[] {
  const entry = `[T${state.turnNumber}] ${message}`;
  return [entry, ...state.log].slice(0, 40);
}

export function drawThreeEventIds(seed: number): { ids: string[]; nextSeed: number } {
  const pool = [...EVENT_CARDS];
  const ids: string[] = [];
  let currentSeed = seed;

  while (ids.length < 3 && pool.length > 0) {
    const { value, nextSeed } = pickRandom(currentSeed, pool);
    currentSeed = nextSeed;
    ids.push(value.id);
    const removeIdx = pool.findIndex((c) => c.id === value.id);
    if (removeIdx >= 0) pool.splice(removeIdx, 1);
  }
  return { ids, nextSeed: currentSeed };
}

export function getEffectiveItemRetailPrice(
  state: GameState,
  item: ItemDef,
  shopOwnerId?: string | null
): number {
  const saleMult = state.globalSale?.priceMultiplier ?? 1;
  const owner = shopOwnerId ? state.players.find((p) => p.id === shopOwnerId) : undefined;
  const ownerMult = owner && owner.doublePriceTurns > 0 ? 2 : 1;
  return Math.max(1, Math.round(item.retailPrice * saleMult * ownerMult));
}

export function canPlayerUseElevator(state: GameState, playerId: string): boolean {
  const lock = state.elevatorLock;
  if (!lock) return true;
  if (lock.onlyPlayerId !== null) return playerId === lock.onlyPlayerId;
  if (lock.blockedPlayerId !== null) return playerId !== lock.blockedPlayerId;
  return false;
}

export function canCancelMove(state: GameState): boolean {
  if (state.moveHistory.length === 0) return false;
  if (
    state.phase === 'CHOOSE_DIRECTION' ||
    state.phase === 'STEPPING' ||
    state.phase === 'ESCALATOR_RIDE'
  ) {
    return true;
  }
  if (
    state.hadBranchChoiceThisTurn &&
    (state.phase === 'ELEVATOR_PROMPT' ||
      state.phase === 'SHOP_BUY_SLOT' ||
      state.phase === 'SHOP_BUY_RIVAL' ||
      state.phase === 'SHOP_DELIVER')
  ) {
    return true;
  }
  return false;
}

export function computeShopAssetValue(shop: Shop): number {
  if (!shop.storeTypeId) return 0;
  const def = STORE_TYPES[shop.storeTypeId];
  if (!def) return 0;

  const baseValue = def.baseOpenCost * shop.level;
  let stockValue = 0;
  for (const item of def.items) {
    const qty = shop.stock[item.id] ?? 0;
    stockValue += qty * item.wholesaleCost;
  }
  return baseValue + stockValue;
}

export function computePlayerNetWorth(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;

  let total = player.cash;
  for (const shop of Object.values(state.shops)) {
    if (shop.ownerId === playerId) {
      total += computeShopAssetValue(shop);
    }
  }
  return total;
}

export function computePaydayAmount(
  state: GameState,
  player: Player,
  isExactLanding: boolean
): number {
  const netWorth = Math.max(0, computePlayerNetWorth(state, player.id));
  const raw =
    PAYDAY_CONFIG.baseSalary +
    Math.floor(netWorth * PAYDAY_CONFIG.assetRate) +
    player.stepsSincePayday * PAYDAY_CONFIG.stepBonus;

  return isExactLanding
    ? Math.floor(raw * PAYDAY_CONFIG.landMultiplier)
    : raw;
}

export function getAvailableDirections(
  state: GameState,
  player: Player
): Array<'left' | 'right' | 'up' | 'down'> {
  const tile = getTile(state, player.tileId);
  const dirs: Array<'left' | 'right' | 'up' | 'down'> = [];

  if (tile.type === 'escalator') {
    if (tile.neighbors.up) dirs.push('up');
    if (tile.neighbors.down) dirs.push('down');
    return dirs;
  }

  if (tile.neighbors.left) dirs.push('left');
  if (tile.neighbors.right) dirs.push('right');
  return dirs;
}

export function checkVictory(state: GameState): string | null {
  const activePlayers = state.players.filter((p) => !p.isBankrupt);
  const bankruptCount = state.players.length - activePlayers.length;

  if (bankruptCount >= state.config.bankruptLimit && activePlayers.length > 0) {
    const sorted = [...activePlayers].sort(
      (a, b) => computePlayerNetWorth(state, b.id) - computePlayerNetWorth(state, a.id)
    );
    return sorted[0]?.id ?? null;
  }

  const qualifiers = activePlayers.filter(
    (p) => computePlayerNetWorth(state, p.id) >= state.config.targetAssets
  );
  if (qualifiers.length > 0) {
    const sorted = [...qualifiers].sort(
      (a, b) => computePlayerNetWorth(state, b.id) - computePlayerNetWorth(state, a.id)
    );
    return sorted[0]?.id ?? null;
  }

  return null;
}

export function advanceToNextTurn(state: GameState): GameState {
  const finishedId = getActivePlayer(state).id;
  const nextPlayers = state.players.map((p, idx) => {
    if (idx !== state.activePlayerIndex) return p;
    return {
      ...p,
      blockDeliveryTurns: Math.max(0, p.blockDeliveryTurns - 1),
      blockNewStoreTurns: Math.max(0, p.blockNewStoreTurns - 1),
      doublePriceTurns: Math.max(0, p.doublePriceTurns - 1),
    };
  });

  const nextShops: Record<string, Shop> = {};
  for (const [id, shop] of Object.entries(state.shops)) {
    nextShops[id] =
      shop.ownerId === finishedId && shop.isClosedTurns > 0
        ? { ...shop, isClosedTurns: shop.isClosedTurns - 1 }
        : shop;
  }

  const nextSale =
    state.globalSale && state.globalSale.turnsLeft > 1
      ? { ...state.globalSale, turnsLeft: state.globalSale.turnsLeft - 1 }
      : null;
  const nextElevLock =
    state.elevatorLock && state.elevatorLock.turnsLeft > 1
      ? { ...state.elevatorLock, turnsLeft: state.elevatorLock.turnsLeft - 1 }
      : null;

  let log = state.log;
  const total = nextPlayers.length;
  let nextIndex = (state.activePlayerIndex + 1) % total;
  let guard = 0;

  while (guard < total) {
    const cand = nextPlayers[nextIndex];
    if (!cand || cand.isBankrupt) {
      nextIndex = (nextIndex + 1) % total;
      guard++;
      continue;
    }
    if (cand.skipNextTurn) {
      nextPlayers[nextIndex] = { ...cand, skipNextTurn: false };
      log = [`[T${state.turnNumber}] ${cand.name} missed their turn!`, ...log].slice(0, 40);
      nextIndex = (nextIndex + 1) % total;
      guard++;
      continue;
    }
    break;
  }

  const incoming = nextPlayers[nextIndex];
  if (incoming) {
    let hDir = incoming.horizontalDir;
    let vDir = incoming.verticalDir;
    if (incoming.unlockDirNextTurn) {
      hDir = null;
      vDir = null;
    } else if (incoming.reverseDirNextTurn && hDir) {
      hDir = hDir === 'left' ? 'right' : 'left';
    }
    nextPlayers[nextIndex] = {
      ...incoming,
      horizontalDir: hDir,
      verticalDir: vDir,
      unlockDirNextTurn: false,
      reverseDirNextTurn: false,
    };
  }

  const isRoundBoundary = nextIndex === state.roundStartPlayerIndex;
  const candidateState: GameState = {
    ...state,
    players: nextPlayers,
    shops: nextShops,
    globalSale: nextSale,
    elevatorLock: nextElevLock,
    activePlayerIndex: nextIndex,
    turnNumber: state.turnNumber + 1,
    lastRoll: null,
    remainingSteps: 0,
    hadBranchChoiceThisTurn: false,
    moveHistory: [],
    pendingUndoSnapshot: null,
    pendingPostBankPhase: null,
    deliverMode: null,
    deliverPreferredShopId: null,
    deliveredShopIdsThisTurn: [],
    eventChoices: [],
    eventStorePrompt: null,
    log,
  };

  if (!state.config.finishRoundOnWin || isRoundBoundary) {
    const winnerId = checkVictory(candidateState);
    if (winnerId) {
      const winner = candidateState.players.find((p) => p.id === winnerId);
      return {
        ...candidateState,
        phase: 'GAME_OVER',
        winnerId,
        log: appendLog(candidateState, `${winner?.name ?? 'Player'} wins the match!`),
      };
    }
  }

  return { ...candidateState, phase: 'ROLL_PENCIL' };
}