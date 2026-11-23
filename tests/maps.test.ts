import { describe, expect, it } from 'vitest';
import { AREA_POOLS } from '../src/config/areaPools';
import { BANK_REWARDS, EVENT_CARDS, STORE_TYPES } from '../src/config/balance';
import { createStageMap, OFFICIAL_STAGES } from '../src/config/maps';

const PS1_LAP_STEPS = [36, 30, 58, 54, 45, 42, 36, 44, 72, 46];
const PS1_STAGE_DEFAULTS: ReadonlyArray<readonly [startCash: number, targetAssets: number]> = [
  [3000, 10000],
  [3200, 12000],
  [3400, 14000],
  [3600, 16000],
  [3800, 18000],
  [4000, 20000],
  [4200, 24000],
  [4600, 26000],
  [4800, 28000],
  [5000, 30000],
];

describe('official PS1 stages and catalogs', () => {
  it('builds all 10 official stages with PS1 lapSteps and recommended asset defaults', () => {
    expect(OFFICIAL_STAGES).toHaveLength(10);

    OFFICIAL_STAGES.forEach((def, idx) => {
      const built = createStageMap(def.id);
      expect(def.stageIndex).toBe(idx);
      expect(def.lapSteps).toBe(PS1_LAP_STEPS[idx]);
      expect([def.recommendedStartingCash, def.recommendedTargetAssets]).toEqual(PS1_STAGE_DEFAULTS[idx]);
      expect(built.tiles[built.startTileId]?.type).toBe('bank');
      expect(Object.keys(built.shops)).toHaveLength(def.shopCount);
    });
  });

  it('matches PS1 escalator split, crossover, and express tower rules', () => {
    const stage1 = createStageMap('stage_0');
    expect(stage1.tiles.f2_c0?.neighbors.up?.targetTileId).toBe('f3_c1');
    expect(stage1.tiles.f2_c0?.neighbors.down?.targetTileId).toBe('f1_c1');

    const stage2 = createStageMap('stage_1');
    expect(stage2.tiles.f3_c0?.neighbors.up).toBeDefined();
    expect(stage2.tiles.f3_c0?.neighbors.down).toBeUndefined();
    expect(stage2.tiles.f2_c0?.neighbors.up).toBeUndefined();
    expect(stage2.tiles.f2_c0?.neighbors.down).toBeDefined();
    expect(stage2.tiles.f3_c5?.neighbors.down?.byEntryDir?.left?.targetTileId).toBe('f2_c3');
    expect(stage2.tiles.f3_c5?.neighbors.down?.byEntryDir?.right?.targetTileId).toBe('f2_c7');

    const stage5 = createStageMap('stage_4');
    expect(stage5.tiles.f4_c0?.neighbors.down).toBeUndefined();
    expect(stage5.tiles.f3_c0?.neighbors.up).toBeUndefined();
    expect(stage5.tiles.f2_c0?.neighbors.up).toBeDefined();
    expect(stage5.tiles.f2_c0?.neighbors.down).toBeDefined();

    const stage7 = createStageMap('stage_6');
    expect(stage7.tiles.f4_c0?.neighbors.down?.targetTileId).toBe('f1_c1');
    expect(stage7.tiles.f1_c0?.neighbors.up?.targetTileId).toBe('f4_c1');
    expect(stage7.tiles.f2_c0).toBeUndefined();
    expect(stage7.tiles.f3_c0).toBeUndefined();

    const stage10 = createStageMap('stage_9');
    expect(stage10.tiles.f4_c15?.neighbors.down?.targetTileId).toBe('f1_c14');
    expect(stage10.tiles.f1_c15?.neighbors.up?.targetTileId).toBe('f4_c14');
  });

  it('verifies all 44 stores, 264 items, 55 events, 53 bank rewards, and 11 area pools', () => {
    const stores = Object.values(STORE_TYPES);
    expect(stores).toHaveLength(44);
    expect(EVENT_CARDS).toHaveLength(55);
    expect(BANK_REWARDS).toHaveLength(53);

    const mults = [1, 2, 4, 7, 11, 16];
    let totalItems = 0;
    for (const store of stores) {
      expect(store.items).toHaveLength(6);
      const base = store.items[0]!.wholesaleCost;
      expect(store.emptyBaseCost).toBe(base * 5);
      expect(store.baseOpenCost).toBe(base * 12);
      store.items.forEach((item, idx) => {
        expect(item.wholesaleCost).toBe(base * mults[idx]!);
        expect(item.retailPrice).toBe(item.wholesaleCost * 2);
      });
      totalItems += store.items.length;
    }
    expect(totalItems).toBe(264);

    const crane = STORE_TYPES.arcade_games?.items.find((i) => i.name === 'Crane Game');
    const fridge = STORE_TYPES.electrical_goods?.items.find((i) => i.name === 'Refrigerator');
    expect(crane?.wholesaleCost).toBe(208);
    expect(fridge?.wholesaleCost).toBe(896);

    for (const pool of Object.values(AREA_POOLS)) {
      expect(pool).toHaveLength(4);
      for (const storeId of pool) {
        expect(STORE_TYPES[storeId]).toBeDefined();
      }
    }
  });
});
