import { STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import {
  buildStarterStock,
  computeOpenShopCost,
  getAllowedStoreTypeIds,
  getConnectedChainShops,
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
  return preferredId !== undefined ? rivals.find((p) => p.id === preferredId) : rivals[0];
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
  return preferredShopId !== undefined ? shops.find((s) => s.id === preferredShopId) : shops[0];
}

export function resolveTargetOwnShop(
  state: GameState,
  preferredShopId?: string,
  predicate: (s: Shop) => boolean = () => true
): Shop | undefined {
  const active = state.players[state.activePlayerIndex]!;
  const shops = Object.values(state.shops).filter((s) => s.ownerId === active.id && predicate(s));
  return preferredShopId !== undefined ? shops.find((s) => s.id === preferredShopId) : shops[0];
}

export function canCaptureShop(state: GameState, playerId: string, shop: Shop): boolean {
  return getAllowedStoreTypeIds(state, playerId, shop.segmentId, shop.id).length > 0;
}

export function canPlayerOpenWithCash(state: GameState, ownerId: string, cashBudget: number): boolean {
  return Object.values(state.shops).some(
    (s) =>
      s.ownerId === null &&
      getAllowedStoreTypeIds(state, ownerId, s.segmentId).some(
        (id) => computeOpenShopCost(state, s.id, ownerId, id).openCost <= cashBudget
      )
  );
}

function makeVacantShop(shop: Shop): Shop {
  return { ...shop, ownerId: null, storeTypeId: null, level: 1, stock: {}, isClosedTurns: 0 };
}

function recomputeSegmentOwners(
  state: GameState,
  shops: Record<string, Shop>,
  segmentId: string,
  ...ownerIds: string[]
): Record<string, Shop> {
  let next = shops;
  for (const ownerId of ownerIds) {
    next = recomputeSegmentChainLevels({ ...state, shops: next }, segmentId, ownerId);
  }
  return next;
}

export function vacateShopSlot(state: GameState, shopId: string): Record<string, Shop> {
  const shop = state.shops[shopId];
  if (!shop || !shop.ownerId) return state.shops;
  const nextShops = { ...state.shops, [shopId]: makeVacantShop(shop) };
  return recomputeSegmentOwners(state, nextShops, shop.segmentId, shop.ownerId);
}

/** Closes all connected tiles in the chain containing `shopId` and recomputes remaining chain levels. */
export function vacateShopChain(state: GameState, shopId: string): Record<string, Shop> {
  const shop = state.shops[shopId];
  if (!shop || !shop.ownerId) return state.shops;
  const nextShops = { ...state.shops };
  for (const member of getConnectedChainShops(state, shopId)) {
    nextShops[member.id] = makeVacantShop(member);
  }
  return recomputeSegmentOwners(state, nextShops, shop.segmentId, shop.ownerId);
}

export function captureRivalShopForPlayer(
  state: GameState,
  shopId: string,
  newOwnerId: string
): Record<string, Shop> {
  const shop = state.shops[shopId];
  if (!shop || !shop.ownerId || shop.ownerId === newOwnerId) return state.shops;
  const allowed = getAllowedStoreTypeIds(state, newOwnerId, shop.segmentId, shop.id);
  if (allowed.length === 0) return state.shops;

  const prevOwnerId = shop.ownerId;
  const nextTypeId = shop.storeTypeId && allowed.includes(shop.storeTypeId) ? shop.storeTypeId : allowed[0]!;
  const keepStock = nextTypeId === shop.storeTypeId && getShopTotalStock(shop) > 0;
  const claimed: Shop = { ...shop, ownerId: newOwnerId, storeTypeId: nextTypeId, isClosedTurns: 0 };

  const nextShops = recomputeSegmentOwners(
    state,
    { ...state.shops, [shopId]: claimed },
    shop.segmentId,
    prevOwnerId,
    newOwnerId
  );
  const updated = nextShops[shopId]!;
  nextShops[shopId] = { ...updated, stock: keepStock ? updated.stock : buildStarterStock(nextTypeId, updated.level) };
  return nextShops;
}

/** Transfers all connected tiles of a rival chain to `newOwnerId`, preserving store type and stock. */
export function captureRivalChainForPlayer(
  state: GameState,
  shopId: string,
  newOwnerId: string
): Record<string, Shop> {
  const shop = state.shops[shopId];
  if (!shop || !shop.ownerId || shop.ownerId === newOwnerId) return state.shops;

  const nextShops = { ...state.shops };
  for (const member of getConnectedChainShops(state, shopId)) {
    nextShops[member.id] = { ...member, ownerId: newOwnerId, isClosedTurns: 0 };
  }
  return recomputeSegmentOwners(state, nextShops, shop.segmentId, shop.ownerId, newOwnerId);
}

/**
 * Claims every slot in `targetShopId`'s segment under `ownerId` (PS1 `bank_48` / `0x80071098`),
 * keeping existing own stock and auto-stocking newly claimed slots.
 */
export function upgradeOwnSegmentToChain(
  state: GameState,
  targetShopId: string,
  ownerId: string
): Record<string, Shop> {
  const target = state.shops[targetShopId];
  if (!target || target.ownerId !== ownerId || !target.storeTypeId) return state.shops;

  const storeTypeId = target.storeTypeId;
  const newlyClaimedIds = new Set<string>();
  const claimedShops: Record<string, Shop> = { ...state.shops };

  for (const s of Object.values(claimedShops)) {
    if (s.segmentId !== target.segmentId) continue;
    const isOwn = s.ownerId === ownerId;
    if (!isOwn) newlyClaimedIds.add(s.id);
    claimedShops[s.id] = { ...s, ownerId, storeTypeId, stock: isOwn ? s.stock : {}, isClosedTurns: 0 };
  }

  const nextShops = recomputeSegmentOwners(state, claimedShops, target.segmentId, ownerId);
  for (const id of newlyClaimedIds) {
    const leveled = nextShops[id]!;
    nextShops[id] = { ...leveled, stock: buildStarterStock(storeTypeId, leveled.level) };
  }
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
