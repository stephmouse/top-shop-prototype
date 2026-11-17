import { STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import {
  buildStarterStock,
  getAllowedStoreTypeIds,
  getShopTotalStock,
  recomputeSegmentChainLevels,
} from './shops';
import type { BankRewardDef, GameState, Player, Shop } from './types';

export function resolveTargetRival(
  state: GameState,
  preferredId?: string,
  predicate: (p: Player) => boolean = () => true
): Player | undefined {
  const active = state.players[state.activePlayerIndex]!;
  const rivals = state.players.filter((p) => p.id !== active.id && !p.isBankrupt && predicate(p));
  if (preferredId) {
    const exact = rivals.find((p) => p.id === preferredId);
    if (exact) return exact;
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
  if (preferredShopId) {
    const exact = shops.find((s) => s.id === preferredShopId);
    if (exact) return exact;
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
  if (preferredShopId) {
    const exact = shops.find((s) => s.id === preferredShopId);
    if (exact) return exact;
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

export function canRedeemBankReward(
  state: GameState,
  reward: BankRewardDef,
  targetPlayerId?: string,
  targetShopId?: string
): boolean {
  const active = state.players[state.activePlayerIndex]!;
  if (active.points < reward.pointCost) return false;

  const ownShops = Object.values(state.shops).filter((s) => s.ownerId === active.id);
  const eff = reward.effect;

  switch (eff.kind) {
    case 'gain_points':
    case 'gain_cash':
    case 'double_own_store_prices':
    case 'claim_victory':
      return true;
    case 'gain_cash_per_store':
      return ownShops.length > 0;
    case 'block_rival_delivery':
    case 'block_rival_new_stores':
    case 'swap_position_with_rival':
      return Boolean(resolveTargetRival(state, targetPlayerId));
    case 'reverse_direction':
      return Boolean(resolveTargetRival(state, targetPlayerId));
    case 'pencil_override':
      return eff.target === 'self' || Boolean(resolveTargetRival(state, targetPlayerId));
    case 'payday_modifier':
      return eff.target === 'self_double'
        ? !active.doubleNextPayday
        : Boolean(resolveTargetRival(state, targetPlayerId, (p) => !p.skipNextPayday));
    case 'equip_chirp_shoes':
      return !active.chirpSandals;
    case 'open_delivery':
      if (active.blockDeliveryTurns > 0) return false;
      if (eff.mode === 'rival_paid') {
        return Boolean(
          resolveTargetRivalShop(state, targetShopId, (s) => getShopTotalStock(s) < STORE_CAPACITY_BY_LEVEL[s.level])
        );
      }
      return ownShops.some((s) => getShopTotalStock(s) < STORE_CAPACITY_BY_LEVEL[s.level]);
    case 'auto_stock_own':
      return eff.mode === 'cheap_fill'
        ? ownShops.some((s) => getShopTotalStock(s) < STORE_CAPACITY_BY_LEVEL[s.level])
        : ownShops.length > 0;
    case 'close_rival_store_level':
      return Boolean(resolveTargetRivalShop(state, targetShopId, (s) => s.level === eff.level));
    case 'close_all_empty_rival_stores':
      return Boolean(resolveTargetRivalShop(state, undefined, (s) => getShopTotalStock(s) === 0));
    case 'open_free_random_shop':
      return active.blockNewStoreTurns === 0 && canPlayerOpenWithCash(state, active.id, Infinity);
    case 'open_shop_rival_cash':
      return (
        active.blockNewStoreTurns === 0 &&
        Boolean(resolveTargetRival(state, targetPlayerId, (p) => canPlayerOpenWithCash(state, active.id, p.cash)))
      );
    case 'capture_rival_store':
      if (eff.mode === 'one_l4') {
        return Boolean(
          resolveTargetRivalShop(state, targetShopId, (s) => s.level === 4 && canCaptureShop(state, active.id, s))
        );
      }
      return Boolean(
        resolveTargetRivalShop(
          state,
          eff.mode === 'one_empty' ? targetShopId : undefined,
          (s) => getShopTotalStock(s) === 0 && canCaptureShop(state, active.id, s)
        )
      );
    case 'empty_rival_stores':
      return Boolean(resolveTargetRivalShop(state, targetShopId, (s) => getShopTotalStock(s) > 0));
    case 'set_rival_cash_fraction':
      return eff.scope === 'one'
        ? Boolean(resolveTargetRival(state, targetPlayerId, (p) => p.cash > 0))
        : Boolean(resolveTargetRival(state, undefined, (p) => p.cash > 0));
    case 'set_rival_cash_to_one':
      return eff.scope === 'one'
        ? Boolean(resolveTargetRival(state, targetPlayerId, (p) => p.cash > 1))
        : Boolean(resolveTargetRival(state, undefined, (p) => p.cash > 1));
    case 'cut_rivals_cash_per_store':
      return Boolean(resolveTargetRivalShop(state));
    case 'copy_rival_cash':
      return Boolean(resolveTargetRival(state, targetPlayerId, (p) => p.cash > 0));
    case 'shuffle_all_cash':
      return Boolean(resolveTargetRival(state));
    case 'halve_rival_points':
      return Boolean(resolveTargetRival(state, targetPlayerId, (p) => p.points > 0));
    case 'upgrade_own_store_l4':
      return Boolean(resolveTargetOwnShop(state, targetShopId, (s) => s.level < 4));
  }
}
