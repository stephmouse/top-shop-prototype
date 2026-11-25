import { PAYDAY_CONFIG, SHOP_RULES, STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import { getStageDef } from '../config/maps';
import type { StageId } from '../config/maps';
import { isValidWalkSoundStyle, WALK_SOUND_STYLES } from '../config/walkSounds';
import type { WalkSoundChoice, WalkSoundStyle } from '../config/walkSounds';
import { pickRandom } from './rng';
import type {
  EscalatorExit,
  EscalatorLink,
  GameState,
  HorizontalDir,
  ItemDef,
  Player,
  Shop,
  Tile,
} from './types';

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

/** Formats a map coordinate consistently across tiles, UI pickers, and logs (e.g. `3F:7`). */
export function formatTileCoord(tile: Pick<Tile, 'floor' | 'col'>): string {
  return `${tile.floor}F:${tile.col + 1}`;
}

/** Formats a store slot consistently for player-facing logs and prompts (`Store Name (3F:7)`). */
export function formatShopRef(state: GameState, shop: Shop): string {
  const tile = state.tiles[shop.tileId];
  const loc = tile ? formatTileCoord(tile) : shop.id;
  const def = shop.storeTypeId ? STORE_TYPES[shop.storeTypeId] : undefined;
  return def ? `${def.name} (${loc})` : `Empty Lot (${loc})`;
}

export function resolveEscalatorExit(
  link: EscalatorLink,
  entryDir: HorizontalDir | null
): EscalatorExit {
  if (entryDir && link.byEntryDir?.[entryDir]) {
    return link.byEntryDir[entryDir]!;
  }
  return { targetTileId: link.targetTileId, exitHorizontalDir: link.exitHorizontalDir };
}

export function getEffectiveItemRetailPrice(
  state: GameState,
  item: ItemDef,
  shopOwnerId?: string | null
): number {
  const saleMult = state.globalSale?.priceMultiplier ?? 1;
  const owner = shopOwnerId ? state.players.find((p) => p.id === shopOwnerId) : undefined;
  const ownerMult = owner && owner.doublePriceWindow ? 2 : 1;
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

export function clampPoints(points: number): number {
  return Math.max(0, Math.min(SHOP_RULES.maxPoints, points));
}

export function computeShopAssetValue(shop: Shop): number {
  if (!shop.storeTypeId) return 0;
  const def = STORE_TYPES[shop.storeTypeId];
  if (!def) return 0;

  const baseValue = def.emptyBaseCost;
  let stockValue = 0;
  for (const item of def.items) {
    const qty = shop.stock[item.id] ?? 0;
    stockValue += qty * item.wholesaleCost;
  }
  return baseValue + stockValue;
}

export function computeOpenCostForLevel(storeTypeId: string, level: 1 | 2 | 3 | 4): number {
  const def = STORE_TYPES[storeTypeId];
  if (!def) return 0;
  const slots = STORE_CAPACITY_BY_LEVEL[level];
  const sorted = [...def.items].sort((a, b) => a.retailPrice - b.retailPrice);
  const stockCost = sorted.slice(0, slots).reduce((sum, item) => sum + item.wholesaleCost, 0);
  return def.emptyBaseCost + stockCost;
}

export function computeBuyoutCosts(
  oldShop: Shop,
  newStoreTypeId: string,
  resultingLevel: 1 | 2 | 3 | 4 = 1
): { rivalPayout: number; openCost: number; totalCost: number } {
  const oldDef = oldShop.storeTypeId ? STORE_TYPES[oldShop.storeTypeId] : undefined;
  const newDef = STORE_TYPES[newStoreTypeId];
  if (!oldDef || !newDef) return { rivalPayout: 0, openCost: 0, totalCost: 0 };

  const mult = SHOP_RULES.buyoutLevelMultipliers[oldShop.level];
  const rivalPayout = Math.floor(oldDef.emptyBaseCost * mult);
  const openCost = computeOpenCostForLevel(newStoreTypeId, resultingLevel);
  return { rivalPayout, openCost, totalCost: rivalPayout + openCost };
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

export function computePlayerRank(
  state: GameState,
  playerId: string
): { rank: number; maxRank: number; activeCount: number } {
  const active = state.players.filter((p) => !p.isBankrupt);
  const netWorthById = new Map(active.map((p) => [p.id, computePlayerNetWorth(state, p.id)]));
  const sorted = [...active].sort(
    (a, b) => (netWorthById.get(b.id) ?? 0) - (netWorthById.get(a.id) ?? 0)
  );
  const ranksById = new Map<string, number>();
  let maxRank = 1;
  let prevRank = 1;
  let prevNetWorth = 0;
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    const netWorth = netWorthById.get(p.id) ?? 0;
    const assigned = i > 0 && netWorth === prevNetWorth ? prevRank : i + 1;
    ranksById.set(p.id, assigned);
    prevRank = assigned;
    prevNetWorth = netWorth;
    maxRank = assigned;
  }
  return {
    rank: ranksById.get(playerId) ?? maxRank,
    maxRank,
    activeCount: Math.max(1, active.length),
  };
}

export function computePaydayAmount(
  state: GameState,
  player: Player,
  isExactLanding: boolean
): number {
  const stageLap = getStageDef(state.mapId as StageId).lapSteps;
  const netWorth = computePlayerNetWorth(state, player.id);
  const assetPart = Math.max(0, Math.floor(netWorth / PAYDAY_CONFIG.assetDivisor));
  const visitBonus = ((player.bankVisits ?? 0) + 1) * PAYDAY_CONFIG.visitSalaryStep;
  const scaledBase = Math.floor(((assetPart + visitBonus) * stageLap) / PAYDAY_CONFIG.referenceLapSteps);
  const stepPct =
    PAYDAY_CONFIG.minStepPercent +
    Math.floor((PAYDAY_CONFIG.lapStepPercent * player.stepsSincePayday) / stageLap);
  const rawPay = Math.floor((scaledBase * stepPct) / 100);

  return isExactLanding
    ? Math.floor((rawPay * PAYDAY_CONFIG.landMultiplierNumerator) / PAYDAY_CONFIG.landMultiplierDenominator)
    : rawPay;
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

export function reversePlayerDirections(
  player: Pick<Player, 'horizontalDir' | 'verticalDir'>
): Pick<Player, 'horizontalDir' | 'verticalDir'> {
  return {
    horizontalDir:
      player.horizontalDir === 'left' ? 'right' : player.horizontalDir === 'right' ? 'left' : null,
    verticalDir:
      player.verticalDir === 'up' ? 'down' : player.verticalDir === 'down' ? 'up' : null,
  };
}

export function resolveEquippedWalkSound(
  choice: WalkSoundChoice | undefined,
  seed: number
): { style: WalkSoundStyle; nextSeed: number } {
  if (choice === 'random') {
    const picked = pickRandom(seed, WALK_SOUND_STYLES);
    return { style: picked.value, nextSeed: picked.nextSeed };
  }
  return { style: isValidWalkSoundStyle(choice) ? choice : 'chirp', nextSeed: seed };
}
