import type { Shop, Tile } from '../engine/types';

export const TEST_MAP_COLS = 9;
export const TEST_MAP_FLOORS = 3;
export const START_TILE_ID = 'f1_c3'; // Bank on Floor 1

export const SEGMENT_POOLS: Record<string, string[]> = {
  seg_1w: ['bakery', 'candy_store', 'burger_shop'],
  seg_1e: ['comic_boy', 'gameland', 'golden_jewelry'],
  seg_2w: ['bakery', 'candy_store', 'burger_shop'],
  seg_2e: ['comic_boy', 'gameland', 'golden_jewelry'],
  seg_3w: ['bakery', 'candy_store', 'burger_shop'],
  seg_3e: ['comic_boy', 'gameland', 'golden_jewelry'],
};

function makeShop(id: string, tileId: string, segmentId: string): Shop {
  return {
    id,
    tileId,
    segmentId,
    ownerId: null,
    storeTypeId: null,
    level: 1,
    stock: {},
    isClosedTurns: 0,
  };
}

export function createTestMap(): {
  tiles: Record<string, Tile>;
  shops: Record<string, Shop>;
  segmentPools: Record<string, string[]>;
} {
  const tiles: Record<string, Tile> = {
    // --- FLOOR 1 (Bottom) ---
    f1_c0: { id: 'f1_c0', floor: 1, col: 0, type: 'escalator', neighbors: { up: { targetTileId: 'f2_c1', exitHorizontalDir: 'right', nextVerticalDir: 'up' } } },
    f1_c1: { id: 'f1_c1', floor: 1, col: 1, type: 'shop', segmentId: 'seg_1w', shopSlotId: 'shop_1_1', neighbors: { left: 'f1_c0', right: 'f1_c2' } },
    f1_c2: { id: 'f1_c2', floor: 1, col: 2, type: 'shop', segmentId: 'seg_1w', shopSlotId: 'shop_1_2', neighbors: { left: 'f1_c1', right: 'f1_c3' } },
    f1_c3: { id: 'f1_c3', floor: 1, col: 3, type: 'bank', neighbors: { left: 'f1_c2', right: 'f1_c4' } },
    f1_c4: { id: 'f1_c4', floor: 1, col: 4, type: 'elevator', neighbors: { left: 'f1_c3', right: 'f1_c5' } },
    f1_c5: { id: 'f1_c5', floor: 1, col: 5, type: 'shop', segmentId: 'seg_1e', shopSlotId: 'shop_1_5', neighbors: { left: 'f1_c4', right: 'f1_c6' } },
    f1_c6: { id: 'f1_c6', floor: 1, col: 6, type: 'shop', segmentId: 'seg_1e', shopSlotId: 'shop_1_6', neighbors: { left: 'f1_c5', right: 'f1_c7' } },
    f1_c7: { id: 'f1_c7', floor: 1, col: 7, type: 'shop', segmentId: 'seg_1e', shopSlotId: 'shop_1_7', neighbors: { left: 'f1_c6', right: 'f1_c8' } },
    f1_c8: { id: 'f1_c8', floor: 1, col: 8, type: 'escalator', neighbors: { up: { targetTileId: 'f2_c7', exitHorizontalDir: 'left', nextVerticalDir: 'up' } } },

    // --- FLOOR 2 (Middle - Stacked X Escalators at c0 and c8) ---
    f2_c0: {
      id: 'f2_c0', floor: 2, col: 0, type: 'escalator',
      neighbors: {
        up: { targetTileId: 'f3_c1', exitHorizontalDir: 'right' },
        down: { targetTileId: 'f1_c1', exitHorizontalDir: 'right' },
      },
    },
    f2_c1: { id: 'f2_c1', floor: 2, col: 1, type: 'shop', segmentId: 'seg_2w', shopSlotId: 'shop_2_1', neighbors: { left: 'f2_c0', right: 'f2_c2' } },
    f2_c2: { id: 'f2_c2', floor: 2, col: 2, type: 'shop', segmentId: 'seg_2w', shopSlotId: 'shop_2_2', neighbors: { left: 'f2_c1', right: 'f2_c3' } },
    f2_c3: { id: 'f2_c3', floor: 2, col: 3, type: 'shop', segmentId: 'seg_2w', shopSlotId: 'shop_2_3', neighbors: { left: 'f2_c2', right: 'f2_c4' } },
    f2_c4: { id: 'f2_c4', floor: 2, col: 4, type: 'elevator', neighbors: { left: 'f2_c3', right: 'f2_c5' } },
    f2_c5: { id: 'f2_c5', floor: 2, col: 5, type: 'shop', segmentId: 'seg_2e', shopSlotId: 'shop_2_5', neighbors: { left: 'f2_c4', right: 'f2_c6' } },
    f2_c6: { id: 'f2_c6', floor: 2, col: 6, type: 'shop', segmentId: 'seg_2e', shopSlotId: 'shop_2_6', neighbors: { left: 'f2_c5', right: 'f2_c7' } },
    f2_c7: { id: 'f2_c7', floor: 2, col: 7, type: 'shop', segmentId: 'seg_2e', shopSlotId: 'shop_2_7', neighbors: { left: 'f2_c6', right: 'f2_c8' } },
    f2_c8: {
      id: 'f2_c8', floor: 2, col: 8, type: 'escalator',
      neighbors: {
        up: { targetTileId: 'f3_c7', exitHorizontalDir: 'left' },
        down: { targetTileId: 'f1_c7', exitHorizontalDir: 'left' },
      },
    },

    // --- FLOOR 3 (Top) ---
    f3_c0: { id: 'f3_c0', floor: 3, col: 0, type: 'escalator', neighbors: { down: { targetTileId: 'f2_c1', exitHorizontalDir: 'right', nextVerticalDir: 'down' } } },
    f3_c1: { id: 'f3_c1', floor: 3, col: 1, type: 'shop', segmentId: 'seg_3w', shopSlotId: 'shop_3_1', neighbors: { left: 'f3_c0', right: 'f3_c2' } },
    f3_c2: { id: 'f3_c2', floor: 3, col: 2, type: 'shop', segmentId: 'seg_3w', shopSlotId: 'shop_3_2', neighbors: { left: 'f3_c1', right: 'f3_c3' } },
    f3_c3: { id: 'f3_c3', floor: 3, col: 3, type: 'shop', segmentId: 'seg_3w', shopSlotId: 'shop_3_3', neighbors: { left: 'f3_c2', right: 'f3_c4' } },
    f3_c4: { id: 'f3_c4', floor: 3, col: 4, type: 'elevator', neighbors: { left: 'f3_c3', right: 'f3_c5' } },
    f3_c5: { id: 'f3_c5', floor: 3, col: 5, type: 'shop', segmentId: 'seg_3e', shopSlotId: 'shop_3_5', neighbors: { left: 'f3_c4', right: 'f3_c6' } },
    f3_c6: { id: 'f3_c6', floor: 3, col: 6, type: 'shop', segmentId: 'seg_3e', shopSlotId: 'shop_3_6', neighbors: { left: 'f3_c5', right: 'f3_c7' } },
    f3_c7: { id: 'f3_c7', floor: 3, col: 7, type: 'shop', segmentId: 'seg_3e', shopSlotId: 'shop_3_7', neighbors: { left: 'f3_c6', right: 'f3_c8' } },
    f3_c8: { id: 'f3_c8', floor: 3, col: 8, type: 'escalator', neighbors: { down: { targetTileId: 'f2_c7', exitHorizontalDir: 'left', nextVerticalDir: 'down' } } },
  };

  const shops: Record<string, Shop> = {};
  for (const tile of Object.values(tiles)) {
    if (tile.type === 'shop' && tile.shopSlotId && tile.segmentId) {
      shops[tile.shopSlotId] = makeShop(tile.shopSlotId, tile.id, tile.segmentId);
    }
  }

  return { tiles, shops, segmentPools: SEGMENT_POOLS };
}