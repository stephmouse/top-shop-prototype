import { SHOP_RULES, STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import { SEGMENT_POOLS } from '../config/map1';
import {
  advanceToNextTurn,
  appendLog,
  computeShopAssetValue,
  getActivePlayer,
  getEffectiveItemRetailPrice,
  getTile,
} from './helpers';
import { nextRandom, randomInt } from './rng';
import type { GameState, ItemDef, Player, Shop } from './types';

export function getAllowedStoreTypeIds(
  state: GameState,
  playerId: string,
  segmentId: string,
  excludingShopId?: string
): string[] {
  const existingOwn = Object.values(state.shops).find(
    (s) => s.ownerId === playerId && s.segmentId === segmentId && s.storeTypeId
  );
  if (existingOwn?.storeTypeId) return [existingOwn.storeTypeId];

  const rivalTakenTypes = new Set<string>();
  for (const s of Object.values(state.shops)) {
    if (s.id !== excludingShopId && s.segmentId === segmentId && s.ownerId && s.ownerId !== playerId && s.storeTypeId) {
      rivalTakenTypes.add(s.storeTypeId);
    }
  }
  return (SEGMENT_POOLS[segmentId] ?? []).filter((id) => !rivalTakenTypes.has(id));
}

export function getShopTotalStock(shop: Shop): number {
  return Object.values(shop.stock).reduce((sum, qty) => sum + qty, 0);
}

export function getCheapestItemPrice(shop: Shop, priceMultiplier = 1): number | null {
  if (!shop.storeTypeId) return null;
  const def = STORE_TYPES[shop.storeTypeId];
  if (!def) return null;
  let min: number | null = null;
  for (const item of def.items) {
    if ((shop.stock[item.id] ?? 0) > 0) {
      const price = Math.max(1, Math.round(item.retailPrice * priceMultiplier));
      if (min === null || price < min) min = price;
    }
  }
  return min;
}

export function resumeAfterPostAction(state: GameState): GameState {
  const committed: GameState = {
    ...state,
    moveHistory: [],
    hadBranchChoiceThisTurn: false,
    eventStorePrompt: null,
  };
  const active = getActivePlayer(committed);

  if (active.cash < 0) {
    const owned = Object.values(committed.shops).filter((s) => s.ownerId === active.id);
    if (owned.length === 0) {
      const players = committed.players.map((p, idx) =>
        idx === committed.activePlayerIndex ? { ...p, isBankrupt: true } : p
      );
      return advanceToNextTurn({
        ...committed,
        players,
        pendingPostBankPhase: null,
        log: appendLog(committed, `${active.name} went BANKRUPT!`),
      });
    }
    return {
      ...committed,
      phase: 'LIQUIDATE_ASSETS',
      log: appendLog(committed, `${active.name} has negative cash ($${active.cash}) — must sell assets.`),
    };
  }

  if (committed.pendingPostBankPhase === 'STEPPING' && committed.remainingSteps > 0) {
    return { ...committed, phase: 'STEPPING', pendingPostBankPhase: null };
  }
  return advanceToNextTurn({ ...committed, pendingPostBankPhase: null });
}

export function buildStarterStock(storeTypeId: string, level: 1 | 2 | 3 | 4): Record<string, number> {
  const def = STORE_TYPES[storeTypeId];
  if (!def) return {};
  const slots = STORE_CAPACITY_BY_LEVEL[level];
  const sorted = [...def.items].sort((a, b) => a.retailPrice - b.retailPrice);
  const stock: Record<string, number> = {};
  for (const item of sorted.slice(0, slots)) {
    stock[item.id] = 1;
  }
  return stock;
}

export function recomputeSegmentChainLevels(
  state: GameState,
  segmentId: string,
  ownerId: string
): Record<string, Shop> {
  const shops = { ...state.shops };
  const ownedInSeg = Object.values(shops).filter(
    (s) => s.segmentId === segmentId && s.ownerId === ownerId
  );
  const visited = new Set<string>();

  for (const startShop of ownedInSeg) {
    if (visited.has(startShop.id)) continue;
    const queue = [startShop];
    const component: Shop[] = [];
    visited.add(startShop.id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      component.push(curr);
      const tile = state.tiles[curr.tileId];
      if (!tile) continue;

      for (const sideTileId of [tile.neighbors.left, tile.neighbors.right]) {
        if (!sideTileId) continue;
        const sideTile = state.tiles[sideTileId];
        const sideShop = sideTile?.shopSlotId ? shops[sideTile.shopSlotId] : undefined;
        if (sideShop && sideShop.segmentId === segmentId && sideShop.ownerId === ownerId && !visited.has(sideShop.id)) {
          visited.add(sideShop.id);
          queue.push(sideShop);
        }
      }
    }

    const level = Math.min(4, component.length) as 1 | 2 | 3 | 4;
    for (const member of component) {
      shops[member.id] = { ...member, level };
    }
  }
  return shops;
}

export function handleOpenShop(state: GameState, storeTypeId: string): GameState {
  if (state.phase !== 'SHOP_BUY_SLOT') return state;
  const active = getActivePlayer(state);
  if (active.blockNewStoreTurns > 0) return state;

  const tile = getTile(state, active.tileId);
  if (!tile.shopSlotId) return state;
  const shop = state.shops[tile.shopSlotId];
  const def = STORE_TYPES[storeTypeId];
  if (!shop || shop.ownerId !== null || !def) return state;

  const allowed = getAllowedStoreTypeIds(state, active.id, shop.segmentId);
  if (!allowed.includes(storeTypeId) || active.cash < def.baseOpenCost) return state;

  const players = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, cash: p.cash - def.baseOpenCost } : p
  );
  const claimedShop: Shop = { ...shop, ownerId: active.id, storeTypeId, stock: {} };
  const interim: GameState = { ...state, players, shops: { ...state.shops, [shop.id]: claimedShop } };
  const leveledShops = recomputeSegmentChainLevels(interim, shop.segmentId, active.id);
  const updatedNewShop = leveledShops[shop.id]!;
  leveledShops[shop.id] = { ...updatedNewShop, stock: buildStarterStock(storeTypeId, updatedNewShop.level) };

  return resumeAfterPostAction({
    ...interim,
    shops: leveledShops,
    log: appendLog(state, `${active.name} opened ${def.name} L${updatedNewShop.level} (-$${def.baseOpenCost}, stocked).`),
  });
}

export function handleBuyoutShop(state: GameState, storeTypeId: string): GameState {
  if (state.phase !== 'SHOP_BUY_SLOT') return state;
  const active = getActivePlayer(state);
  const tile = getTile(state, active.tileId);
  if (!tile.shopSlotId) return state;
  const shop = state.shops[tile.shopSlotId];
  if (!shop || !shop.ownerId || shop.ownerId === active.id || getShopTotalStock(shop) > 0) return state;

  const oldDef = shop.storeTypeId ? STORE_TYPES[shop.storeTypeId] : undefined;
  const newDef = STORE_TYPES[storeTypeId];
  const allowed = getAllowedStoreTypeIds(state, active.id, shop.segmentId, shop.id);
  if (!oldDef || !newDef || !allowed.includes(storeTypeId)) return state;

  const cost = Math.floor(oldDef.baseOpenCost * shop.level * SHOP_RULES.buyoutMultiplier);
  if (active.cash < cost) return state;

  const prevOwnerId = shop.ownerId;
  const players = state.players.map((p) => {
    if (p.id === active.id) return { ...p, cash: p.cash - cost };
    if (p.id === prevOwnerId) return { ...p, cash: p.cash + cost };
    return p;
  });

  const claimedShop: Shop = { ...shop, ownerId: active.id, storeTypeId, stock: {}, isClosedTurns: 0 };
  let nextShops = recomputeSegmentChainLevels(
    { ...state, shops: { ...state.shops, [shop.id]: claimedShop } },
    shop.segmentId,
    prevOwnerId
  );
  nextShops = recomputeSegmentChainLevels({ ...state, shops: nextShops }, shop.segmentId, active.id);

  const updatedNewShop = nextShops[shop.id]!;
  nextShops[shop.id] = { ...updatedNewShop, stock: buildStarterStock(storeTypeId, updatedNewShop.level) };

  return resumeAfterPostAction({
    ...state,
    players,
    shops: nextShops,
    log: appendLog(state, `${active.name} bought out store as ${newDef.name} L${updatedNewShop.level} (-$${cost}).`),
  });
}

export function handleDeliverItems(state: GameState, shopId: string, order: Record<string, number>): GameState {
  if (state.phase !== 'SHOP_DELIVER') return state;
  const active = getActivePlayer(state);
  if (active.blockDeliveryTurns > 0) return state;

  const shop = state.shops[shopId];
  if (!shop || shop.ownerId !== active.id || !shop.storeTypeId) return state;
  const def = STORE_TYPES[shop.storeTypeId];
  if (!def) return state;

  const maxCap = STORE_CAPACITY_BY_LEVEL[shop.level];
  let totalAdd = 0;
  let totalCost = 0;
  const nextStock = { ...shop.stock };

  for (const [itemId, qty] of Object.entries(order)) {
    if (qty <= 0) continue;
    const item = def.items.find((i) => i.id === itemId);
    if (!item || item.tier > shop.level) return state;
    totalAdd += qty;
    totalCost += item.wholesaleCost * qty;
    nextStock[itemId] = (nextStock[itemId] ?? 0) + qty;
  }

  if (totalAdd === 0 || getShopTotalStock(shop) + totalAdd > maxCap || totalCost > active.cash) return state;

  const players = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, cash: p.cash - totalCost } : p
  );
  return resumeAfterPostAction({
    ...state,
    players,
    shops: { ...state.shops, [shop.id]: { ...shop, stock: nextStock } },
    log: appendLog(state, `${active.name} delivered ${totalAdd} item(s) to ${def.name} (-$${totalCost}).`),
  });
}

export function handleBuyRivalItems(state: GameState, itemIds: string[]): GameState {
  if (state.phase !== 'SHOP_BUY_RIVAL') return state;
  if (itemIds.length < 1 || itemIds.length > SHOP_RULES.maxItemsPerVisit) return state;

  const active = getActivePlayer(state);
  const tile = getTile(state, active.tileId);
  if (!tile.shopSlotId) return state;
  const shop = state.shops[tile.shopSlotId];
  if (!shop || !shop.ownerId || shop.ownerId === active.id || !shop.storeTypeId) return state;

  const def = STORE_TYPES[shop.storeTypeId];
  if (!def) return state;

  const nextStock = { ...shop.stock };
  const boughtItems: ItemDef[] = [];
  for (const itemId of itemIds) {
    const qty = nextStock[itemId] ?? 0;
    const item = def.items.find((i) => i.id === itemId);
    if (!item || qty <= 0) return state;
    nextStock[itemId] = qty - 1;
    boughtItems.push(item);
  }

  let seed = state.seed;
  let netPaid = 0;
  let refunds = 0;
  for (const item of boughtItems) {
    const roll = nextRandom(seed);
    seed = roll.nextSeed;
    if (roll.value < item.cashbackChance) refunds++;
    else netPaid += getEffectiveItemRetailPrice(state, item);
  }

  const ptsRoll = randomInt(seed, SHOP_RULES.pointsPerPurchaseMin, SHOP_RULES.pointsPerPurchaseMax);
  seed = ptsRoll.nextSeed;

  const ownerId = shop.ownerId;
  const players: Player[] = state.players.map((p) => {
    if (p.id === active.id) return { ...p, cash: p.cash - netPaid, points: p.points + ptsRoll.value };
    if (p.id === ownerId) return { ...p, cash: p.cash + netPaid };
    return p;
  });

  const updatedShop: Shop = { ...shop, stock: nextStock };
  const refundNote = refunds > 0 ? ` (${refunds} Cash Back refund!)` : '';
  const nextState: GameState = {
    ...state,
    seed,
    players,
    shops: { ...state.shops, [shop.id]: updatedShop },
    moveHistory: [],
    hadBranchChoiceThisTurn: false,
    log: appendLog(
      state,
      `${active.name} bought ${boughtItems.length} item(s) at ${def.name} for $${netPaid}, +${ptsRoll.value} pts.${refundNote}`
    ),
  };

  if (getShopTotalStock(updatedShop) === 0 && getActivePlayer(nextState).cash >= 0) {
    return { ...nextState, phase: 'SHOP_BUY_SLOT' };
  }
  return resumeAfterPostAction(nextState);
}

export function handleSellShopLiquidate(state: GameState, shopId: string): GameState {
  if (state.phase !== 'LIQUIDATE_ASSETS') return state;
  const active = getActivePlayer(state);
  const shop = state.shops[shopId];
  if (!shop || shop.ownerId !== active.id) return state;

  const payout = Math.floor(computeShopAssetValue(shop) * SHOP_RULES.sellLiquidationRate);
  const players = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, cash: p.cash + payout } : p
  );

  const resetShop: Shop = { ...shop, ownerId: null, storeTypeId: null, level: 1, stock: {}, isClosedTurns: 0 };
  const nextShops = recomputeSegmentChainLevels(
    { ...state, shops: { ...state.shops, [shop.id]: resetShop } },
    shop.segmentId,
    active.id
  );

  return resumeAfterPostAction({
    ...state,
    players,
    shops: nextShops,
    log: appendLog(state, `${active.name} liquidated store for +$${payout}.`),
  });
}