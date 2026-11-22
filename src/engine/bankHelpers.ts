import { STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import {
  buildStarterStock,
  getAllowedStoreTypeIds,
  getShopTotalStock,
  recomputeSegmentChainLevels,
} from './shops';
import type { GameState, Player, Shop } from './types';

export function resolveTargetRival(
  state: GameState,
  preferredId?: string,
  predicate: (p: Player) => boolean = () => true
): Player | undefined {
  const active = state.players[state.activePlayerIndex]!;
  const rivals = state.players.filter((p) => p.id !== active.id && !p.isBankrupt && predicate(p));
  if (preferredId !== undefined) {
    return rivals.find((p) => p.id === preferredId);
  }
  return rivals[0];
}

export function resolveTargetRivalShop(
  state: GameState,
  preferredShopId?: string,
  predicate: (s: Shop) => boolean = () => true
): Shop | undefined {
  const active = state.players[state.activePlayerIndex]!;
  const shops = Object.values(state.shops).filter(
    (s) => s.ownerId !== null && s.ownerId !== active.id && predicate(s)
  );
  if (preferredShopId !== undefined) {
    return shops.find((s) => s.id === preferredShopId);
  }
  return shops[0];
}

export function resolveTargetOwnShop(
  state: GameState,
  preferredShopId?: string,
  predicate: (s: Shop) => boolean = () => true
): Shop | undefined {
  const active = state.players[state.activePlayerIndex]!;
  const shops = Object.values(state.shops).filter(
    (s) => s.ownerId === active.id && predicate(s)
  );
  if (preferredShopId !== undefined) {
    return shops.find((s) => s.id === preferredShopId);
  }
  return shops[0];
}

export function canCaptureShop(state: GameState, playerId: string, shop: Shop): boolean {
  return getAllowedStoreTypeIds(state, playerId, shop.segmentId, shop.id).length > 0;
}

export function canPlayerOpenWithCash(state: GameState, ownerId: string, cashBudget: number): boolean {
  return Object.values(state.shops).some(
    (s) =>
      s.ownerId === null &&
      getAllowedStoreTypeIds(state, ownerId, s.segmentId).some(
        (id) => (STORE_TYPES[id]?.baseOpenCost ?? Infinity) <= cashBudget
      )
  );
}

export function vacateShopSlot(state: GameState, shopId: string): Record<string, Shop> {
  const shop = state.shops[shopId];
  if (!shop || !shop.ownerId) return state.shops;
  const prevOwner = shop.ownerId;
  const reset: Shop = {
    ...shop,
    ownerId: null,
    storeTypeId: null,
    level: 1,
    upgradedToL4: false,
    stock: {},
    isClosedTurns: 0,
  };
  return recomputeSegmentChainLevels(
    { ...state, shops: { ...state.shops, [shopId]: reset } },
    shop.segmentId,
    prevOwner
  );
}

export function captureRivalShopForPlayer(
  state: GameState,
  shopId: string,
  newOwnerId: string,
  preserveL4 = false
): Record<string, Shop> {
  const shop = state.shops[shopId];
  if (!shop || !shop.ownerId || shop.ownerId === newOwnerId) return state.shops;
  const allowed = getAllowedStoreTypeIds(state, newOwnerId, shop.segmentId, shop.id);
  if (allowed.length === 0) return state.shops;

  const prevOwnerId = shop.ownerId;
  const nextTypeId =
    shop.storeTypeId && allowed.includes(shop.storeTypeId) ? shop.storeTypeId : allowed[0]!;
  const keepStock = nextTypeId === shop.storeTypeId && getShopTotalStock(shop) > 0;

  const claimed: Shop = {
    ...shop,
    ownerId: newOwnerId,
    storeTypeId: nextTypeId,
    upgradedToL4: preserveL4 || Boolean(shop.upgradedToL4),
    isClosedTurns: 0,
  };

  let nextShops = recomputeSegmentChainLevels(
    { ...state, shops: { ...state.shops, [shopId]: claimed } },
    shop.segmentId,
    prevOwnerId
  );
  nextShops = recomputeSegmentChainLevels({ ...state, shops: nextShops }, shop.segmentId, newOwnerId);

  const updated = nextShops[shopId]!;
  nextShops[shopId] = {
    ...updated,
    stock: keepStock ? updated.stock : buildStarterStock(nextTypeId, updated.level),
  };
  return nextShops;
}

export function autoStockOwnShops(
  state: GameState,
  playerId: string,
  mode: 'cheap_fill' | 'costly_one' | 'costly_fill'
): Record<string, Shop> {
  const nextShops = { ...state.shops };
  for (const shop of Object.values(nextShops)) {
    if (shop.ownerId !== playerId || !shop.storeTypeId) continue;
    const def = STORE_TYPES[shop.storeTypeId];
    if (!def) continue;

    const maxCap = STORE_CAPACITY_BY_LEVEL[shop.level];
    const unlocked = [...def.items]
      .filter((i) => i.tier <= shop.level)
      .sort((a, b) => a.wholesaleCost - b.wholesaleCost);
    const cheapest = unlocked[0];
    const dearest = unlocked[unlocked.length - 1];
    if (!cheapest || !dearest) continue;

    if (mode === 'cheap_fill') {
      const space = Math.max(0, maxCap - getShopTotalStock(shop));
      if (space > 0) {
        nextShops[shop.id] = {
          ...shop,
          stock: { ...shop.stock, [cheapest.id]: (shop.stock[cheapest.id] ?? 0) + space },
        };
      }
    } else if (mode === 'costly_one') {
      const stock = { ...shop.stock };
      if (getShopTotalStock(shop) >= maxCap) {
        for (const item of unlocked) {
          if ((stock[item.id] ?? 0) > 0) {
            stock[item.id] = (stock[item.id] ?? 1) - 1;
            break;
          }
        }
      }
      stock[dearest.id] = (stock[dearest.id] ?? 0) + 1;
      nextShops[shop.id] = { ...shop, stock };
    } else {
      nextShops[shop.id] = { ...shop, stock: { [dearest.id]: maxCap } };
    }
  }
  return nextShops;
}
