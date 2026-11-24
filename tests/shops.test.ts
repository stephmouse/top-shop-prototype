import { describe, expect, it } from 'vitest';
import { SHOP_RULES, STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../src/config/balance';
import { computeOpenCostForLevel, computePlayerRank } from '../src/engine/helpers';
import { nextRandom } from '../src/engine/rng';
import { getAllowedStoreTypeIds, getShopTotalStock } from '../src/engine/shops';
import { applyAction, createInitialGameState } from '../src/engine/state';

const PLAYERS = [{ name: 'Alice' }, { name: 'Bob' }];

function findSeedForTwoItemRolls(
  cbChance: number,
  cb1: boolean,
  pts1: boolean,
  cb2: boolean,
  pts2: boolean
): number {
  for (let seed = 1; seed < 500000; seed++) {
    const r1 = nextRandom(seed);
    if ((r1.value < cbChance) !== cb1) continue;
    const r2 = nextRandom(r1.nextSeed);
    if ((r2.value < SHOP_RULES.pointsAwardChance) !== pts1) continue;
    const r3 = nextRandom(r2.nextSeed);
    if ((r3.value < cbChance) !== cb2) continue;
    const r4 = nextRandom(r3.nextSeed);
    if ((r4.value < SHOP_RULES.pointsAwardChance) !== pts2) continue;
    return seed;
  }
  throw new Error('Failed to find matching seed');
}

describe('shops, chains, delivery, cashback, buyouts, and liquidation', () => {
  it('upgrades adjacent same-owner shops L1 -> L4 and enforces segment exclusivity', () => {
    let state = createInitialGameState(PLAYERS, { startingCash: 20000 }, 10, 'stage_0');
    const storeId = 'pancake_house';
    const def = STORE_TYPES[storeId]!;

    expect(getAllowedStoreTypeIds(state, 'p_1', 'f1_a3')).toContain(storeId);

    let expectedTotalOpenCost = 0;
    for (let col = 1; col <= 4; col++) {
      const cashBefore = state.players[0]!.cash;
      const stepCost = computeOpenCostForLevel(storeId, col as 1 | 2 | 3 | 4);
      expectedTotalOpenCost += stepCost;
      state = {
        ...state,
        activePlayerIndex: 0,
        phase: 'SHOP_BUY_SLOT',
        players: state.players.map((p, i) => (i === 0 ? { ...p, tileId: `f1_c${col}` } : p)),
      };
      state = applyAction(state, { type: 'OPEN_SHOP', storeTypeId: storeId });

      const opened = state.shops[`shop_1_${col}`]!;
      expect(opened.ownerId).toBe('p_1');
      expect(opened.level).toBe(col);
      expect(cashBefore - state.players[0]!.cash).toBe(stepCost);
      expect(getShopTotalStock(opened)).toBe(STORE_CAPACITY_BY_LEVEL[opened.level]);
      if (col > 1) {
        expect(getShopTotalStock(state.shops.shop_1_1!)).toBe(3);
      }
    }

    expect(getAllowedStoreTypeIds(state, 'p_2', 'f1_a3')).not.toContain(storeId);
    expect(state.players[0]!.cash).toBe(20000 - expectedTotalOpenCost);
    expect(expectedTotalOpenCost).toBeGreaterThan(def.baseOpenCost * 4);
  });

  it('matches PS1 chain-level open & buyout costs across L1..L4 and bridging', () => {
    for (const def of Object.values(STORE_TYPES)) {
      expect(computeOpenCostForLevel(def.id, 1)).toBe(def.baseOpenCost);
    }
    expect([1, 2, 3, 4].map((lv) => computeOpenCostForLevel('bakery', lv as 1 | 2 | 3 | 4))).toEqual([240, 380, 600, 920]);
    expect([1, 2, 3, 4].map((lv) => computeOpenCostForLevel('auto_parts', lv as 1 | 2 | 3 | 4))).toEqual([768, 1216, 1920, 2944]);

    let state = createInitialGameState(PLAYERS, { startingCash: 10000 }, 10, 'stage_0');
    for (const col of [1, 3]) {
      state = { ...state, activePlayerIndex: 0, phase: 'SHOP_BUY_SLOT', players: state.players.map((p, i) => (i === 0 ? { ...p, tileId: `f1_c${col}` } : p)) };
      state = applyAction(state, { type: 'OPEN_SHOP', storeTypeId: 'pancake_house' });
    }
    const beforeBridge = state.players[0]!.cash;
    state = { ...state, activePlayerIndex: 0, phase: 'SHOP_BUY_SLOT', players: state.players.map((p, i) => (i === 0 ? { ...p, tileId: 'f1_c2' } : p)) };
    state = applyAction(state, { type: 'OPEN_SHOP', storeTypeId: 'pancake_house' });
    expect(state.shops.shop_1_2!.level).toBe(3);
    expect(beforeBridge - state.players[0]!.cash).toBe(computeOpenCostForLevel('pancake_house', 3));

    const buyoutBase = createInitialGameState(PLAYERS, { startingCash: 5000 }, 10, 'stage_0');
    const buyoutState = {
      ...buyoutBase,
      activePlayerIndex: 1,
      phase: 'SHOP_BUY_SLOT' as const,
      players: buyoutBase.players.map((p, i) => (i === 1 ? { ...p, tileId: 'f1_c2' } : p)),
      shops: {
        ...buyoutBase.shops,
        shop_1_1: { ...buyoutBase.shops.shop_1_1!, ownerId: 'p_2', storeTypeId: 'gameland', level: 1 as const, stock: {} },
        shop_1_2: { ...buyoutBase.shops.shop_1_2!, ownerId: 'p_1', storeTypeId: 'camera_shop', level: 1 as const, stock: {} },
      },
    };
    const afterBuyout = applyAction(buyoutState, { type: 'BUYOUT_SHOP', storeTypeId: 'gameland' });
    const rivalPayout = Math.floor(STORE_TYPES.camera_shop!.emptyBaseCost * 1.5);
    expect(afterBuyout.shops.shop_1_2!.level).toBe(2);
    expect(afterBuyout.players[1]!.cash).toBe(5000 - rivalPayout - computeOpenCostForLevel('gameland', 2));
  });

  it('validates deliveries against level tier, capacity, and cash', () => {
    let state = createInitialGameState(PLAYERS, { startingCash: 5000 }, 11, 'stage_0');
    const storeId = 'pancake_house';
    const def = STORE_TYPES[storeId]!;
    state = {
      ...state,
      phase: 'SHOP_BUY_SLOT',
      players: state.players.map((p, i) => (i === 0 ? { ...p, tileId: 'f1_c1' } : p)),
    };
    state = applyAction(state, { type: 'OPEN_SHOP', storeTypeId: storeId });

    const deliverState = {
      ...state,
      activePlayerIndex: 0,
      phase: 'SHOP_DELIVER' as const,
      players: state.players.map((p, i) => (i === 0 ? { ...p, tileId: 'f1_c1' } : p)),
    };
    const overCap = applyAction(deliverState, {
      type: 'DELIVER_ITEMS',
      shopId: 'shop_1_1',
      order: { [def.items[0]!.id]: 1 },
    });
    expect(overCap.phase).toBe('SHOP_DELIVER');

    const emptyStockState = {
      ...deliverState,
      shops: { ...deliverState.shops, shop_1_1: { ...deliverState.shops.shop_1_1!, stock: {} } },
    };
    const tierTooHigh = applyAction(emptyStockState, {
      type: 'DELIVER_ITEMS',
      shopId: 'shop_1_1',
      order: { [def.items[5]!.id]: 1 },
    });
    expect(tierTooHigh.phase).toBe('SHOP_DELIVER');

    const valid = applyAction(emptyStockState, {
      type: 'DELIVER_ITEMS',
      shopId: 'shop_1_1',
      order: { [def.items[0]!.id]: 2 },
    });
    expect(getShopTotalStock(valid.shops.shop_1_1!)).toBe(2);
    expect(valid.players[0]!.cash).toBe(5000 - def.baseOpenCost - def.items[0]!.wholesaleCost * 2);
  });

  it('handles rival shopping with 2x Cash Back and triggers buyout on empty store', () => {
    const def = STORE_TYPES.camera_shop!;
    const item = def.items[0]!;
    let seed = 1;
    while (nextRandom(seed).value >= item.cashbackChance) {
      seed = nextRandom(seed).nextSeed;
    }

    const base = createInitialGameState(PLAYERS, { startingCash: 5000 }, seed, 'stage_0');
    const beforeBuy = {
      ...base,
      activePlayerIndex: 1,
      phase: 'SHOP_BUY_RIVAL' as const,
      players: base.players.map((p, i) => (i === 1 ? { ...p, tileId: 'f1_c1' } : p)),
      shops: {
        ...base.shops,
        shop_1_1: {
          ...base.shops.shop_1_1!,
          ownerId: 'p_1',
          storeTypeId: 'camera_shop',
          level: 1 as const,
          stock: { [item.id]: 1 },
        },
      },
    };

    const afterBuy = applyAction(beforeBuy, { type: 'BUY_RIVAL_ITEMS', itemIds: [item.id] });
    expect(afterBuy.lastPurchaseReceipt?.cashbackCount).toBe(1);
    expect(afterBuy.lastPurchaseReceipt?.cashbackRefund).toBe(item.retailPrice * 2);
    expect(afterBuy.players[1]!.cash).toBe(5000 + item.retailPrice);
    expect(afterBuy.players[0]!.cash).toBe(5000 - item.retailPrice);
    expect(afterBuy.phase).toBe('SHOP_BUY_SLOT');

    const newDef = STORE_TYPES.gameland!;
    const payout = Math.floor(def.emptyBaseCost * 1.5);
    const totalCost = payout + newDef.baseOpenCost;
    const afterBuyout = applyAction(afterBuy, { type: 'BUYOUT_SHOP', storeTypeId: 'gameland' });
    expect(afterBuyout.shops.shop_1_1?.ownerId).toBe('p_2');
    expect(afterBuyout.shops.shop_1_1?.storeTypeId).toBe('gameland');
    expect(afterBuyout.players[1]!.cash).toBe(5000 + item.retailPrice - totalCost);
    expect(afterBuyout.players[0]!.cash).toBe(5000 - item.retailPrice + payout);
  });

  it('forces 75% asset liquidation on negative cash and bankrupts with no shops left', () => {
    const base = createInitialGameState(PLAYERS, { bankruptLimit: 1 }, 9, 'stage_0');
    const negWithShop = {
      ...base,
      phase: 'SHOP_BUY_SLOT' as const,
      players: base.players.map((p, i) => (i === 0 ? { ...p, cash: -100, tileId: 'f1_c2' } : p)),
      shops: {
        ...base.shops,
        shop_1_1: {
          ...base.shops.shop_1_1!,
          ownerId: 'p_1',
          storeTypeId: 'bakery',
          level: 1 as const,
          stock: {},
        },
      },
    };

    const liqState = applyAction(negWithShop, { type: 'SKIP_SHOP_SLOT' });
    expect(liqState.phase).toBe('LIQUIDATE_ASSETS');

    const soldState = applyAction(liqState, { type: 'SELL_SHOP_LIQUIDATE', shopId: 'shop_1_1' });
    const expectedPayout = Math.floor(STORE_TYPES.bakery!.emptyBaseCost * 0.75);
    expect(soldState.players[0]!.cash).toBe(-100 + expectedPayout);
    expect(soldState.shops.shop_1_1?.ownerId).toBeNull();

    const negNoShops = {
      ...base,
      phase: 'SHOP_BUY_SLOT' as const,
      players: base.players.map((p, i) => (i === 0 ? { ...p, cash: -50, tileId: 'f1_c2' } : p)),
    };
    const bankruptEnd = applyAction(negNoShops, { type: 'SKIP_SHOP_SLOT' });
    expect(bankruptEnd.players[0]!.isBankrupt).toBe(true);
    expect(bankruptEnd.phase).toBe('GAME_OVER');
    expect(bankruptEnd.winnerId).toBe('p_2');
  });

  it('purchases rival items one at a time, rolling Shopping Points and Cash Back per item', () => {
    const bun = STORE_TYPES.bakery!.items[0]!;
    const makeState = (seed: number, stockQty = 3) => {
      const base = createInitialGameState(PLAYERS, { startingCash: 5000 }, seed, 'stage_0');
      return {
        ...base,
        activePlayerIndex: 1,
        phase: 'SHOP_BUY_RIVAL' as const,
        players: base.players.map((p, i) => (i === 1 ? { ...p, tileId: 'f1_c1' } : p)),
        shops: {
          ...base.shops,
          shop_1_1: {
            ...base.shops.shop_1_1!,
            ownerId: 'p_1',
            storeTypeId: 'bakery',
            level: 1 as const,
            stock: { [bun.id]: stockQty },
          },
        },
      };
    };

    const initial = makeState(findSeedForTwoItemRolls(bun.cashbackChance, false, true, false, true));
    expect(applyAction(initial, { type: 'FINISH_RIVAL_SHOP' })).toBe(initial);
    expect(applyAction(initial, { type: 'BUY_RIVAL_ITEMS', itemIds: [bun.id, bun.id] })).toBe(initial);

    const after1 = applyAction(initial, { type: 'BUY_RIVAL_ITEMS', itemIds: [bun.id] });
    expect(after1.phase).toBe('SHOP_BUY_RIVAL');
    expect(after1.rivalItemsBoughtThisTurn).toBe(1);
    expect(after1.players[1]!.points).toBe(1);
    expect(after1.lastPurchaseReceipt?.itemName).toBe(bun.name);
    expect(after1.lastPurchaseReceipt?.pointsAwarded).toBe(1);

    const afterLeave = applyAction(after1, { type: 'FINISH_RIVAL_SHOP' });
    expect(afterLeave.phase).toBe('ROLL_PENCIL');
    expect(afterLeave.activePlayerIndex).toBe(0);
    expect(afterLeave.rivalItemsBoughtThisTurn).toBe(0);
    expect(afterLeave.lastPurchaseReceipt).toBeNull();

    const after2 = applyAction(after1, { type: 'BUY_RIVAL_ITEMS', itemIds: [bun.id] });
    expect(after2.phase).toBe('ROLL_PENCIL');
    expect(after2.rivalItemsBoughtThisTurn).toBe(0);
    expect(after2.players[1]!.points).toBe(2);

    const buyTwoSeq = (seed: number, stockQty = 3) => {
      const s1 = applyAction(makeState(seed, stockQty), { type: 'BUY_RIVAL_ITEMS', itemIds: [bun.id] });
      return applyAction(s1, { type: 'BUY_RIVAL_ITEMS', itemIds: [bun.id] });
    };
    expect(buyTwoSeq(findSeedForTwoItemRolls(bun.cashbackChance, false, true, false, false)).players[1]!.points).toBe(1);
    expect(buyTwoSeq(findSeedForTwoItemRolls(bun.cashbackChance, false, false, false, false)).players[1]!.points).toBe(0);

    const cbSecond = buyTwoSeq(findSeedForTwoItemRolls(bun.cashbackChance, false, false, true, false));
    expect(cbSecond.lastPurchaseReceipt?.cashbackCount).toBe(1);
    expect(cbSecond.lastPurchaseReceipt?.cashbackRefund).toBe(bun.retailPrice * 2);
    expect(cbSecond.players[1]!.cash).toBe(5000);

    const cbBothEmpty = buyTwoSeq(findSeedForTwoItemRolls(bun.cashbackChance, true, false, true, false), 2);
    expect(cbBothEmpty.phase).toBe('SHOP_BUY_SLOT');
    expect(cbBothEmpty.rivalItemsBoughtThisTurn).toBe(0);
    expect(cbBothEmpty.players[1]!.cash).toBe(5000 + bun.retailPrice * 2);
  });

  it('uses PS1 competition ranking with tie-sharing and rank offsets for Shopping Points', () => {
    const fourPlayers = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }];
    const tied = createInitialGameState(fourPlayers, { startingCash: 3000 }, 1, 'stage_0');
    expect(computePlayerRank(tied, 'p_1')).toEqual({ rank: 1, maxRank: 1, activeCount: 4 });
    expect(computePlayerRank(tied, 'p_4')).toEqual({ rank: 1, maxRank: 1, activeCount: 4 });

    const withTies = {
      ...tied,
      players: tied.players.map((p, i) => ({ ...p, cash: [5000, 3000, 2000, 2000][i]! })),
    };
    expect(computePlayerRank(withTies, 'p_3')).toEqual({ rank: 3, maxRank: 3, activeCount: 4 });
    expect(computePlayerRank(withTies, 'p_4')).toEqual({ rank: 3, maxRank: 3, activeCount: 4 });

    const secSys = STORE_TYPES.auto_parts!.items[5]!; // retail $2048 -> basePts = 10
    const bounds: Array<[number, number, number]> = [[0, 4, 8], [1, 5, 9], [2, 6, 10], [3, 7, 11]];
    for (const [idx, minExp, maxExp] of bounds) {
      const seen = new Set<number>();
      for (let seed = 1; seed <= 80; seed++) {
        const base = createInitialGameState(fourPlayers, { startingCash: 2000 }, seed, 'stage_0');
        const ownerIdx = idx === 0 ? 1 : 0;
        const testState = {
          ...base,
          activePlayerIndex: idx,
          phase: 'SHOP_BUY_RIVAL' as const,
          players: base.players.map((p, i) => ({
            ...p,
            cash: [8000, 6000, 4000, 2000][i]!,
            tileId: i === idx ? 'f1_c1' : p.tileId,
          })),
          shops: {
            ...base.shops,
            shop_1_1: { ...base.shops.shop_1_1!, ownerId: `p_${ownerIdx + 1}`, storeTypeId: 'auto_parts', level: 4 as const, stock: { [secSys.id]: 1 } },
          },
        };
        const pts = applyAction(testState, { type: 'BUY_RIVAL_ITEMS', itemIds: [secSys.id] }).players[idx]!.points;
        if (pts > 0) seen.add(pts);
      }
      expect(Math.min(...seen)).toBe(minExp);
      expect(Math.max(...seen)).toBe(maxExp);
    }
  });
});
