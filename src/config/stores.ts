import type { ItemDef, StoreTypeDef } from '../engine/types';
import { STORES_PART_1 } from './storesPart1';
import { STORES_PART_2 } from './storesPart2';

export interface RawStoreSpec {
  id: string;
  name: string;
  segmentPool: string;
  baseOpenCost: number;
  items: ReadonlyArray<readonly [name: string, wholesaleCost: number]>;
}

const RETAIL_PRICE_MULTIPLIER = 2;
const SLOT_TIERS: readonly (1 | 2 | 3 | 4)[] = [1, 1, 1, 2, 3, 4];
// VERIFY: Placeholder cashback rates per slot (cheapest -> dearest)
const SLOT_CASHBACK_CHANCES: readonly number[] = [0.04, 0.06, 0.08, 0.12, 0.16, 0.22];

function slugifyItem(storeId: string, itemName: string): string {
  const clean = itemName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `${storeId}_${clean}`;
}

function buildStoreType(spec: RawStoreSpec): StoreTypeDef {
  const items: ItemDef[] = spec.items.map(([name, wholesaleCost], idx) => ({
    id: slugifyItem(spec.id, name),
    name,
    wholesaleCost,
    retailPrice: wholesaleCost * RETAIL_PRICE_MULTIPLIER,
    tier: SLOT_TIERS[idx] ?? 4,
    cashbackChance: SLOT_CASHBACK_CHANCES[idx] ?? 0.22,
  }));

  return {
    id: spec.id,
    name: spec.name,
    baseOpenCost: spec.baseOpenCost,
    segmentPool: spec.segmentPool,
    items,
  };
}

export const ALL_RAW_STORES: readonly RawStoreSpec[] = [
  ...STORES_PART_1,
  ...STORES_PART_2,
];

export const STORE_TYPES: Record<string, StoreTypeDef> = Object.fromEntries(
  ALL_RAW_STORES.map((spec) => [spec.id, buildStoreType(spec)])
);