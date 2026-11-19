import type { Shop, Tile } from '../engine/types';
import { AREA_POOLS } from './areaPools';
import { createStageMap } from './maps';

export const MAP_COLS = 11;
export const MAP_FLOORS = 3;
export const START_TILE_ID = 'f1_c5'; // Bank at center of 1F

// Official PS1 Stage 0 (Map 1) area pools verified from SLUS_013.33 (0x800ac2d4):
// 1F: Areas 3 & 2 | 2F: Areas 0 & 1 (cheapest floor) | 3F: Areas 4 & 5
export const SEGMENT_POOLS: Record<string, string[]> = {
  seg_1w: [...AREA_POOLS[3]],
  seg_1e: [...AREA_POOLS[2]],
  seg_2w: [...AREA_POOLS[0]],
  seg_2e: [...AREA_POOLS[1]],
  seg_3w: [...AREA_POOLS[4]],
  seg_3e: [...AREA_POOLS[5]],
};

export function createMap1(): {
  tiles: Record<string, Tile>;
  shops: Record<string, Shop>;
  segmentPools: Record<string, string[]>;
} {
  const { tiles, shops, segmentPools } = createStageMap('stage_0');
  return { tiles, shops, segmentPools };
}
