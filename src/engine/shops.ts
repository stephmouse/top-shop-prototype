import { STORE_TYPES } from '../config/balance';
import { getShopDisplayName } from '../config/signatureStore';
import {
  appendLog,
  computeBuyoutCosts,
  formatShopRef,
  getActivePlayer,
  getTile,
} from './helpers';
import { bumpMatchStats, bumpMultiPlayerMatchStats } from './matchStats';
import {
  buildStarterStock,
  computeOpenShopCost,
  computeResultingChainLevel,
  getAllowedStoreTypeIds,
  getPlayerActiveSignatureSegment,
  getSegmentHighValueStoreTypeId,
  getShopTotalStock,
  getSignatureOpenEligibility,
  recomputeSegmentChainLevels,
  resumeAfterPostAction,
} from './shopHelpers';
import type { GameState, Shop } from './types';

export {
  buildStarterStock,
  computeOpenShopCost,
  computeResultingChainLevel,
  getAllowedStoreTypeIds,
  getCheapestItemPrice,
  getConnectedChainShops,
  getPlayerActiveSignatureSegment,
  getSegmentHighValueStoreTypeId,
  getSegmentSlotCount,
  getShopTotalStock,
  getSignatureOpenEligibility,
  recomputeSegmentChainLevels,
  resumeAfterPostAction,
} from './shopHelpers';
export {
  handleBuyRivalItems,
  handleDeliverItems,
  handleFinishRivalShop,
  handleSellShopLiquidate,
  handleSkipDeliver,
} from './shopShopping';

export function handleOpenShop(state: GameState, storeTypeId: string, asSignature = false): GameState {
  if (state.phase !== 'SHOP_BUY_SLOT') return state;
  const active = getActivePlayer(state);
  if (active.blockNewStoreWindow) return state;

  const tile = getTile(state, active.tileId);
  if (!tile.shopSlotId) return state;
  const shop = state.shops[tile.shopSlotId];
  const def = STORE_TYPES[storeTypeId];
  if (!shop || shop.ownerId !== null || !def) return state;

  const allowed = getAllowedStoreTypeIds(state, active.id, shop.segmentId);
  const { openCost } = computeOpenShopCost(state, shop.id, active.id, storeTypeId);
  if (!allowed.includes(storeTypeId) || active.cash < openCost) return state;

  const sig = getSignatureOpenEligibility(state, active.id, shop.segmentId);
  if (asSignature && !sig.isExpandingSignature && (!sig.canOpenAsSignature || storeTypeId !== sig.highValueTypeId)) {
    return state;
  }
  const signatureOwnerId = sig.isExpandingSignature || asSignature ? active.id : null;

  const players = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, cash: p.cash - openCost } : p
  );
  const claimedShop: Shop = { ...shop, ownerId: active.id, storeTypeId, signatureOwnerId, stock: {} };
  const interim: GameState = { ...state, players, shops: { ...state.shops, [shop.id]: claimedShop } };
  const leveledShops = recomputeSegmentChainLevels(interim, shop.segmentId, active.id);
  const updatedNewShop = leveledShops[shop.id]!;
  leveledShops[shop.id] = { ...updatedNewShop, stock: buildStarterStock(storeTypeId, updatedNewShop.level) };

  return resumeAfterPostAction({
    ...interim,
    shops: leveledShops,
    matchStats: bumpMatchStats(interim, active.id, { storesOpened: 1 }),
    log: appendLog(state, `${active.name} opened ${formatShopRef(interim, updatedNewShop)} L${updatedNewShop.level} (-$${openCost}, stocked).`),
  });
}

export function handleBuyoutShop(state: GameState, storeTypeId: string, asSignature = false): GameState {
  if (state.phase !== 'SHOP_BUY_SLOT') return state;
  const active = getActivePlayer(state);
  if (active.blockNewStoreWindow) return state;
  const tile = getTile(state, active.tileId);
  if (!tile.shopSlotId) return state;
  const shop = state.shops[tile.shopSlotId];
  if (!shop || !shop.ownerId || shop.ownerId === active.id || getShopTotalStock(shop) > 0) return state;

  const oldDef = shop.storeTypeId ? STORE_TYPES[shop.storeTypeId] : undefined;
  const newDef = STORE_TYPES[storeTypeId];
  const allowed = getAllowedStoreTypeIds(state, active.id, shop.segmentId, shop.id);
  if (!oldDef || !newDef || !allowed.includes(storeTypeId)) return state;

  const resultingLevel = computeResultingChainLevel(state, shop.id, active.id);
  const { rivalPayout, totalCost } = computeBuyoutCosts(shop, storeTypeId, resultingLevel);
  if (active.cash < totalCost) return state;

  const sig = getSignatureOpenEligibility(state, active.id, shop.segmentId, shop.id);
  if (asSignature && !sig.isExpandingSignature && (!sig.canOpenAsSignature || storeTypeId !== sig.highValueTypeId)) {
    return state;
  }
  const signatureOwnerId = sig.isExpandingSignature || asSignature ? active.id : null;

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
    signatureOwnerId,
    stock: {},
    closedWindow: null,
  };
  let nextShops = recomputeSegmentChainLevels(
    { ...state, shops: { ...state.shops, [shop.id]: claimedShop } },
    shop.segmentId,
    prevOwnerId
  );
  nextShops = recomputeSegmentChainLevels({ ...state, shops: nextShops }, shop.segmentId, active.id);

  const updatedNewShop = nextShops[shop.id]!;
  nextShops[shop.id] = { ...updatedNewShop, stock: buildStarterStock(storeTypeId, updatedNewShop.level) };
  const newShopName = getShopDisplayName(nextShops[shop.id]!, players);

  return resumeAfterPostAction({
    ...state,
    players,
    shops: nextShops,
    matchStats: bumpMultiPlayerMatchStats(state, [
      [active.id, { buyoutsMade: 1 }],
      [prevOwnerId, { timesBoughtOut: 1 }],
    ]),
    log: appendLog(
      state,
      `${active.name} bought out ${formatShopRef(state, shop)} as ${newShopName} L${updatedNewShop.level} (-$${totalCost}, $${rivalPayout} to rival).`
    ),
  });
}
