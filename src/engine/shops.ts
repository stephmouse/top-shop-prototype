import { STORE_TYPES } from '../config/balance';
import {
  appendLog,
  computeBuyoutCosts,
  getActivePlayer,
  getTile,
} from './helpers';
import {
  buildStarterStock,
  getAllowedStoreTypeIds,
  getShopTotalStock,
  recomputeSegmentChainLevels,
  resumeAfterPostAction,
} from './shopHelpers';
import type { GameState, Shop } from './types';

export {
  buildStarterStock,
  getAllowedStoreTypeIds,
  getCheapestItemPrice,
  getConnectedChainShops,
  getSegmentSlotCount,
  getShopTotalStock,
  recomputeSegmentChainLevels,
  resumeAfterPostAction,
} from './shopHelpers';
export {
  handleBuyRivalItems,
  handleDeliverItems,
  handleSellShopLiquidate,
  handleSkipDeliver,
} from './shopShopping';

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
  if (active.blockNewStoreTurns > 0) return state;
  const tile = getTile(state, active.tileId);
  if (!tile.shopSlotId) return state;
  const shop = state.shops[tile.shopSlotId];
  if (!shop || !shop.ownerId || shop.ownerId === active.id || getShopTotalStock(shop) > 0) return state;

  const oldDef = shop.storeTypeId ? STORE_TYPES[shop.storeTypeId] : undefined;
  const newDef = STORE_TYPES[storeTypeId];
  const allowed = getAllowedStoreTypeIds(state, active.id, shop.segmentId, shop.id);
  if (!oldDef || !newDef || !allowed.includes(storeTypeId)) return state;

  const { rivalPayout, totalCost } = computeBuyoutCosts(shop, storeTypeId);
  if (active.cash < totalCost) return state;

  const prevOwnerId = shop.ownerId;
  const players = state.players.map((p) => {
    if (p.id === active.id) return { ...p, cash: p.cash - totalCost };
    if (p.id === prevOwnerId) return { ...p, cash: p.cash + rivalPayout };
    return p;
  });

  const claimedShop: Shop = {
    ...shop,
    ownerId: active.id,
    storeTypeId,
    stock: {},
    isClosedTurns: 0,
  };
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
    log: appendLog(
      state,
      `${active.name} bought out store as ${newDef.name} L${updatedNewShop.level} (-$${totalCost}, $${rivalPayout} to rival).`
    ),
  });
}
