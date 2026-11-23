import { SHOP_RULES, STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import {
  appendLog,
  clampPoints,
  computePlayerRank,
  computeShopAssetValue,
  getActivePlayer,
  getEffectiveItemRetailPrice,
  getTile,
} from './helpers';
import { nextRandom, randomInt } from './rng';
import {
  getShopTotalStock,
  recomputeSegmentChainLevels,
  resumeAfterPostAction,
} from './shopHelpers';
import type { GameState, ItemDef, Player, Shop } from './types';

export function handleDeliverItems(state: GameState, shopId: string, order: Record<string, number>): GameState {
  if (state.phase !== 'SHOP_DELIVER') return state;
  const active = getActivePlayer(state);
  if (active.blockDeliveryTurns > 0) return state;

  const mode = state.deliverMode ?? 'own_paid';
  const shop = state.shops[shopId];
  if (!shop || !shop.storeTypeId) return state;
  if (mode === 'rival_paid' ? !shop.ownerId || shop.ownerId === active.id : shop.ownerId !== active.id) {
    return state;
  }
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
    totalCost += mode === 'own_free' ? 0 : item.wholesaleCost * qty;
    nextStock[itemId] = (nextStock[itemId] ?? 0) + qty;
  }

  if (totalAdd === 0 || getShopTotalStock(shop) + totalAdd > maxCap || totalCost > active.cash) return state;

  const nextCash = active.cash - totalCost;
  const players = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, cash: nextCash } : p
  );
  const nextShops = { ...state.shops, [shop.id]: { ...shop, stock: nextStock } };
  const deliveredIds = [...state.deliveredShopIdsThisTurn, shop.id];
  const updatedState: GameState = {
    ...state,
    players,
    shops: nextShops,
    pendingBankRefundPts: 0,
    deliveredShopIdsThisTurn: deliveredIds,
    log: appendLog(state, `${active.name} delivered ${totalAdd} item(s) to ${def.name} (-$${totalCost}).`),
  };

  if (mode === 'all_own_paid') {
    const hasMoreOwn = Object.values(nextShops).some((s) => {
      if (s.ownerId !== active.id || !s.storeTypeId || deliveredIds.includes(s.id)) return false;
      if (getShopTotalStock(s) >= STORE_CAPACITY_BY_LEVEL[s.level]) return false;
      const sDef = STORE_TYPES[s.storeTypeId];
      return sDef?.items.some((i) => i.tier <= s.level && i.wholesaleCost <= nextCash) ?? false;
    });
    if (hasMoreOwn) return updatedState;
  }

  return resumeAfterPostAction(updatedState);
}

export function handleSkipDeliver(state: GameState): GameState {
  if (state.phase !== 'SHOP_DELIVER') return state;
  if (state.deliverMode !== null && state.deliveredShopIdsThisTurn.length === 0) {
    const active = getActivePlayer(state);
    const refund = state.pendingBankRefundPts;
    const players = state.players.map((p, idx) =>
      idx === state.activePlayerIndex ? { ...p, points: p.points + refund } : p
    );
    return {
      ...state,
      players,
      phase: 'BANK_MENU',
      pendingBankRefundPts: 0,
      deliverMode: null,
      deliverPreferredShopId: null,
      deliveredShopIdsThisTurn: [],
      log: appendLog(state, `${active.name} canceled Bank delivery (+${refund} pts refunded).`),
    };
  }
  return resumeAfterPostAction(state);
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
    else netPaid += getEffectiveItemRetailPrice(state, item, shop.ownerId);
  }

  const { rank, activeCount } = computePlayerRank(state, active.id);
  const basePts = Math.floor(netPaid / SHOP_RULES.pointsPriceDivisor);
  const rawMax =
    rank === activeCount || rank >= 3 ? basePts + 1 : rank === 1 ? basePts - 1 : basePts;
  const minPts = Math.max(1, rawMax - 4);
  const maxPts = Math.max(1, rawMax);

  const ptsChanceRoll = nextRandom(seed);
  seed = ptsChanceRoll.nextSeed;
  let ptsAwarded = 0;
  if (netPaid > 0 && ptsChanceRoll.value < SHOP_RULES.pointsAwardChance) {
    if (minPts === maxPts) {
      ptsAwarded = minPts;
    } else {
      const r = randomInt(seed, minPts, maxPts);
      seed = r.nextSeed;
      ptsAwarded = r.value;
    }
  }

  const ownerId = shop.ownerId;
  const players: Player[] = state.players.map((p) => {
    if (p.id === active.id) {
      return { ...p, cash: p.cash - netPaid, points: clampPoints(p.points + ptsAwarded) };
    }
    if (p.id === ownerId) return { ...p, cash: p.cash + netPaid };
    return p;
  });

  const updatedShop: Shop = { ...shop, stock: nextStock };
  const refundNote = refunds > 0 ? ` (${refunds} Cash Back refund!)` : '';
  const ptsNote = ptsAwarded > 0 ? `, +${ptsAwarded} pts` : '';
  const nextState: GameState = {
    ...state,
    seed,
    players,
    shops: { ...state.shops, [shop.id]: updatedShop },
    moveHistory: [],
    hadBranchChoiceThisTurn: false,
    log: appendLog(
      state,
      `${active.name} bought ${boughtItems.length} item(s) at ${def.name} for $${netPaid}${ptsNote}.${refundNote}`
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

  const resetShop: Shop = {
    ...shop,
    ownerId: null,
    storeTypeId: null,
    level: 1,
    stock: {},
    isClosedTurns: 0,
  };
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
