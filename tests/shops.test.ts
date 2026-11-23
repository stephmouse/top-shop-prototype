import { describe, expect, it } from 'vitest';
import { STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../src/config/balance';
import { nextRandom } from '../src/engine/rng';
import { getAllowedStoreTypeIds, getShopTotalStock } from '../src/engine/shops';
import { applyAction, createInitialGameState } from '../src/engine/state';

const PLAYERS = [{ name: 'Alice' }, { name: 'Bob' }];

describe('shops, chains, delivery, cashback, buyouts, and liquidation', () => {
  it('upgrades adjacent same-owner shops L1 -> L4 and enforces segment exclusivity', () => {
    let state = createInitialGameState(PLAYERS, { startingCash: 20000 }, 10, 'stage_0');
    const storeId = 'pancake_house';
    const def = STORE_TYPES[storeId]!;

    expect(getAllowedStoreTypeIds(state, 'p_1', 'f1_a3')).toContain(storeId);

    for (let col = 1; col <= 4; col++) {
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
      expect(getShopTotalStock(opened)).toBe(STORE_CAPACITY_BY_LEVEL[opened.level]);
      if (col > 1) {
        expect(getShopTotalStock(state.shops.shop_1_1!)).toBe(3);
      }
    }

    expect(getAllowedStoreTypeIds(state, 'p_2', 'f1_a3')).not.toContain(storeId);
    expect(state.players[0]!.cash).toBe(20000 - def.baseOpenCost * 4);
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
});
