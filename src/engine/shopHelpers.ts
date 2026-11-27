import { STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import { computeOpenCostForLevel } from './helpers';
import { advanceToNextTurn } from './turn';
import type { GameState, Shop } from './types';

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
  return (state.segmentPools[segmentId] ?? []).filter((id) => !rivalTakenTypes.has(id));
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
    pendingBankRefundPts: 0,
    deliverMode: null,
    deliverTargetPlayerId: null,
    deliverPreferredShopId: null,
    deliveredShopIdsThisTurn: [],
    rivalItemsBoughtThisTurn: 0,
  };

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

/** Returns the total number of shop slots in a given segment. */
export function getSegmentSlotCount(state: GameState, segmentId: string): number {
  let count = 0;
  for (const s of Object.values(state.shops)) {
    if (s.segmentId === segmentId) count++;
  }
  return count;
}

function collectConnectedChain(
  state: GameState,
  shops: Record<string, Shop>,
  startShop: Shop,
  visited = new Set<string>()
): Shop[] {
  const { segmentId, ownerId } = startShop;
  if (!ownerId || visited.has(startShop.id)) return [];
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
  return component;
}

/** Returns all contiguous same-owner shops in the same segment connected to `shopId`, sorted by tile column. */
export function getConnectedChainShops(state: GameState, shopId: string): Shop[] {
  const start = state.shops[shopId];
  if (!start || !start.ownerId) return [];
  const chain = collectConnectedChain(state, state.shops, start);
  return chain.sort((a, b) => (state.tiles[a.tileId]?.col ?? 0) - (state.tiles[b.tileId]?.col ?? 0));
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
    const component = collectConnectedChain(state, shops, startShop, visited);
    const level = Math.min(4, component.length) as 1 | 2 | 3 | 4;
    for (const member of component) {
      shops[member.id] = { ...member, level };
    }
  }
  return shops;
}

export function computeResultingChainLevel(
  state: GameState,
  shopId: string,
  ownerId: string
): 1 | 2 | 3 | 4 {
  const shop = state.shops[shopId];
  if (!shop) return 1;
  const hypothetical: Shop = { ...shop, ownerId };
  const nextShops = { ...state.shops, [shopId]: hypothetical };
  const chain = collectConnectedChain(state, nextShops, hypothetical);
  return Math.max(1, Math.min(4, chain.length)) as 1 | 2 | 3 | 4;
}

export function computeOpenShopCost(
  state: GameState,
  shopId: string,
  ownerId: string,
  storeTypeId: string
): { openCost: number; level: 1 | 2 | 3 | 4 } {
  const level = computeResultingChainLevel(state, shopId, ownerId);
  return { openCost: computeOpenCostForLevel(storeTypeId, level), level };
}
