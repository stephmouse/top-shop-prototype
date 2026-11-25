import { STORE_TYPES } from '../config/balance';
import { formatTileCoord } from '../engine/helpers';
import { computeOpenShopCost, computeResultingChainLevel, getAllowedStoreTypeIds } from '../engine/shops';
import type { GameState, Shop } from '../engine/types';

export interface EmptyLotItem {
  shop: Shop;
  spotNum: number;
  coord: string;
  isChainAdjacent: boolean;
  resultingLevel: 1 | 2 | 3 | 4;
}

export interface EmptyLotGroup {
  segmentId: string;
  title: string;
  storeSummary: string;
  items: EmptyLotItem[];
}

const WING_NAMES_BY_COUNT: Record<number, readonly string[]> = {
  1: ['Main'],
  2: ['Left Wing', 'Right Wing'],
  3: ['Left Wing', 'Center', 'Right Wing'],
};

/** Formats a segment into a human-friendly floor and wing title (never exposing raw internal IDs). */
export function formatSectionName(state: GameState, segmentId: string): string {
  const segTiles = Object.values(state.tiles).filter((t) => t.segmentId === segmentId);
  const floor = segTiles[0]?.floor;
  if (floor === undefined) return segmentId;

  const segMinCol = new Map<string, number>();
  for (const t of Object.values(state.tiles)) {
    if (t.floor !== floor || !t.segmentId) continue;
    const prev = segMinCol.get(t.segmentId);
    segMinCol.set(t.segmentId, prev === undefined ? t.col : Math.min(prev, t.col));
  }

  const ordered = [...segMinCol.entries()].sort((a, b) => a[1] - b[1]);
  const idx = ordered.findIndex(([id]) => id === segmentId);
  const labels = WING_NAMES_BY_COUNT[ordered.length];
  const wing = idx >= 0 && labels?.[idx] ? labels[idx] : `Section ${Math.max(1, idx + 1)}`;
  return `${floor}F · ${wing}`;
}

/** Formats an individual shop slot as a floor/wing name, 1-based spot number, and map coordinate. */
export function formatLotLabel(state: GameState, shop: Shop): string {
  const tile = state.tiles[shop.tileId];
  const segShops = Object.values(state.shops)
    .filter((s) => s.segmentId === shop.segmentId)
    .sort((a, b) => (state.tiles[a.tileId]?.col ?? 0) - (state.tiles[b.tileId]?.col ?? 0));
  const spotNum = Math.max(1, segShops.findIndex((s) => s.id === shop.id) + 1);
  const coord = tile ? formatTileCoord(tile) : shop.id;
  return `${formatSectionName(state, shop.segmentId)}, Spot ${spotNum} (${coord})`;
}

/** Returns true when `shop` is horizontally adjacent to another store owned by `playerId` in the same segment. */
export function isAdjacentToOwnStore(state: GameState, shop: Shop, playerId: string): boolean {
  const tile = state.tiles[shop.tileId];
  if (!tile) return false;
  for (const sideId of [tile.neighbors.left, tile.neighbors.right]) {
    if (!sideId) continue;
    const sideSlotId = state.tiles[sideId]?.shopSlotId;
    const sideShop = sideSlotId ? state.shops[sideSlotId] : undefined;
    if (sideShop && sideShop.segmentId === shop.segmentId && sideShop.ownerId === playerId) {
      return true;
    }
  }
  return false;
}

/** Groups eligible empty store slots by floor and section, sorted top-to-bottom then left-to-right. */
export function groupEmptyLotsBySection(
  state: GameState,
  emptySlots: Shop[],
  activePlayerId: string
): EmptyLotGroup[] {
  const grouped = new Map<string, Shop[]>();
  for (const shop of emptySlots) {
    const bucket = grouped.get(shop.segmentId) ?? [];
    bucket.push(shop);
    grouped.set(shop.segmentId, bucket);
  }

  const meta = [...grouped.entries()].map(([segmentId, lots]) => {
    const allInSeg = Object.values(state.shops)
      .filter((s) => s.segmentId === segmentId)
      .sort((a, b) => (state.tiles[a.tileId]?.col ?? 0) - (state.tiles[b.tileId]?.col ?? 0));
    const floor = state.tiles[allInSeg[0]?.tileId ?? '']?.floor ?? 0;
    const minCol = state.tiles[allInSeg[0]?.tileId ?? '']?.col ?? 0;

    const allowedDefs = getAllowedStoreTypeIds(state, activePlayerId, segmentId)
      .map((id) => STORE_TYPES[id])
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .sort((a, b) => a.baseOpenCost - b.baseOpenCost);
    const costs = lots
      .flatMap((lot) =>
        allowedDefs.map((d) => computeOpenShopCost(state, lot.id, activePlayerId, d.id).openCost)
      )
      .sort((a, b) => a - b);
    const minCost = costs[0] ?? 0;
    const maxCost = costs[costs.length - 1] ?? minCost;

    const storeSummary =
      allowedDefs.length === 0
        ? 'No eligible stores'
        : allowedDefs.length === 1
          ? minCost === maxCost
            ? `${allowedDefs[0]!.name} ($${minCost})`
            : `${allowedDefs[0]!.name} ($${minCost}–$${maxCost})`
          : `${allowedDefs.map((d) => d.name).join(', ')} · $${minCost}–$${maxCost}`;

    const items: EmptyLotItem[] = [...lots]
      .sort((a, b) => (state.tiles[a.tileId]?.col ?? 0) - (state.tiles[b.tileId]?.col ?? 0))
      .map((shop) => {
        const tile = state.tiles[shop.tileId];
        return {
          shop,
          spotNum: Math.max(1, allInSeg.findIndex((s) => s.id === shop.id) + 1),
          coord: tile ? formatTileCoord(tile) : shop.id,
          isChainAdjacent: isAdjacentToOwnStore(state, shop, activePlayerId),
          resultingLevel: computeResultingChainLevel(state, shop.id, activePlayerId),
        };
      });

    return { segmentId, floor, minCol, title: formatSectionName(state, segmentId), storeSummary, items };
  });

  meta.sort((a, b) => (b.floor !== a.floor ? b.floor - a.floor : a.minCol - b.minCol));
  return meta.map(({ segmentId, title, storeSummary, items }) => ({ segmentId, title, storeSummary, items }));
}
