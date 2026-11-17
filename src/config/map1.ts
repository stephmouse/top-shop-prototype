import type { Shop, Tile } from '../engine/types';

export const MAP_COLS = 11;
export const MAP_FLOORS = 3;
export const START_TILE_ID = 'f1_c5'; // Bank at center of 1F

// VERIFY: Placeholder 4-store segment pools from stores.ts; swap IDs once exact Map 1 pools are verified
export const SEGMENT_POOLS: Record<string, string[]> = {
  seg_1w: ['kiss', 'bakery', 'flower_heart', 'candy_store'],
  seg_1e: ['bobsons', 'cookin_fun', 'pharmacy', 'burger_shop'],
  seg_2w: ['fruits_market', 'curry_india', 'tokyo_restaurant', 'pancake_house'],
  seg_2e: ['george_video', 'comic_boy', 'gameland', 'fancy_dress'],
  seg_3w: ['bbq_house', 'sports_shop', 'yamato_music', 'electrical_goods'],
  seg_3e: ['golden_jewelry', 'kid', 'auto_parts', 'tour_tours'],
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

function addShopWing(
  tiles: Record<string, Tile>,
  floor: number,
  startCol: number,
  endCol: number,
  segmentId: string
): void {
  for (let col = startCol; col <= endCol; col++) {
    const id = `f${floor}_c${col}`;
    tiles[id] = {
      id,
      floor,
      col,
      type: 'shop',
      segmentId,
      shopSlotId: `shop_${floor}_${col}`,
      neighbors: {
        left: `f${floor}_c${col - 1}`,
        right: `f${floor}_c${col + 1}`,
      },
    };
  }
}

export function createMap1(): {
  tiles: Record<string, Tile>;
  shops: Record<string, Shop>;
} {
  const tiles: Record<string, Tile> = {
    // --- Outer Escalators (c0 and c10) ---
    f1_c0: { id: 'f1_c0', floor: 1, col: 0, type: 'escalator', neighbors: { up: { targetTileId: 'f2_c1', exitHorizontalDir: 'right', nextVerticalDir: 'up' } } },
    f1_c10: { id: 'f1_c10', floor: 1, col: 10, type: 'escalator', neighbors: { up: { targetTileId: 'f2_c9', exitHorizontalDir: 'left', nextVerticalDir: 'up' } } },

    f2_c0: {
      id: 'f2_c0', floor: 2, col: 0, type: 'escalator',
      neighbors: {
        up: { targetTileId: 'f3_c1', exitHorizontalDir: 'right' },
        down: { targetTileId: 'f1_c1', exitHorizontalDir: 'right' },
      },
    },
    f2_c10: {
      id: 'f2_c10', floor: 2, col: 10, type: 'escalator',
      neighbors: {
        up: { targetTileId: 'f3_c9', exitHorizontalDir: 'left' },
        down: { targetTileId: 'f1_c9', exitHorizontalDir: 'left' },
      },
    },

    f3_c0: { id: 'f3_c0', floor: 3, col: 0, type: 'escalator', neighbors: { down: { targetTileId: 'f2_c1', exitHorizontalDir: 'right', nextVerticalDir: 'down' } } },
    f3_c10: { id: 'f3_c10', floor: 3, col: 10, type: 'escalator', neighbors: { down: { targetTileId: 'f2_c9', exitHorizontalDir: 'left', nextVerticalDir: 'down' } } },

    // --- Center Column (c5): Bank on 1F, Elevators on 2F & 3F ---
    f1_c5: { id: 'f1_c5', floor: 1, col: 5, type: 'bank', neighbors: { left: 'f1_c4', right: 'f1_c6' } },
    f2_c5: { id: 'f2_c5', floor: 2, col: 5, type: 'elevator', neighbors: { left: 'f2_c4', right: 'f2_c6' } },
    f3_c5: { id: 'f3_c5', floor: 3, col: 5, type: 'elevator', neighbors: { left: 'f3_c4', right: 'f3_c6' } },
  };

  addShopWing(tiles, 1, 1, 4, 'seg_1w');
  addShopWing(tiles, 1, 6, 9, 'seg_1e');
  addShopWing(tiles, 2, 1, 4, 'seg_2w');
  addShopWing(tiles, 2, 6, 9, 'seg_2e');
  addShopWing(tiles, 3, 1, 4, 'seg_3w');
  addShopWing(tiles, 3, 6, 9, 'seg_3e');

  const shops: Record<string, Shop> = {};
  for (const tile of Object.values(tiles)) {
    if (tile.type === 'shop' && tile.shopSlotId && tile.segmentId) {
      shops[tile.shopSlotId] = makeShop(tile.shopSlotId, tile.id, tile.segmentId);
    }
  }

  return { tiles, shops };
}