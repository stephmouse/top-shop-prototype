import { describe, expect, it } from 'vitest';
import { SHOP_RULES } from '../src/config/balance';
import { computeShopAssetValue } from '../src/engine/helpers';
import { createInitialGameState } from '../src/engine/state';
import { buildBoardShopPick } from '../src/ui/boardPickState';

const noopDispatch = () => {};
const noopUi = () => {};

describe('boardPickState per-tile badges and hover selection', () => {
  it('formats SELL +$XXX and CONFIRM +$XXX badges on LIQUIDATE_ASSETS tiles', () => {
    const base = createInitialGameState([{ name: 'Alice' }, { name: 'Bob' }], { startingCash: 3000 }, 50, 'stage_0');
    const shop = {
      ...base.shops.shop_1_1!,
      ownerId: 'p_1',
      storeTypeId: 'pancake_house',
      level: 1 as const,
      stock: { pancake_basic: 2 },
    };
    const expectedPayout = Math.floor(computeShopAssetValue(shop) * SHOP_RULES.sellLiquidationRate);
    const state = {
      ...base,
      phase: 'LIQUIDATE_ASSETS' as const,
      shops: { ...base.shops, shop_1_1: shop },
    };

    const pick = buildBoardShopPick(state, noopDispatch, noopUi, 'shop_1_1');
    expect(pick).not.toBeNull();
    expect(pick!.selectableShopIds.has('shop_1_1')).toBe(true);
    expect(pick!.hoveredShopId).toBe('shop_1_1');
    expect(pick!.getBadgeText?.('shop_1_1', false)).toBe(`SELL +$${expectedPayout}`);
    expect(pick!.getBadgeText?.('shop_1_1', true)).toBe(`CONFIRM +$${expectedPayout}`);
  });

  it('formats scaled payout badges on EVENT_PICK_STORE sell mode and ignores non-selectable hover ids', () => {
    const base = createInitialGameState([{ name: 'Alice' }, { name: 'Bob' }], { startingCash: 3000 }, 50, 'stage_0');
    const shop = {
      ...base.shops.shop_1_2!,
      ownerId: 'p_1',
      storeTypeId: 'bakery',
      level: 1 as const,
      stock: { bread: 1 },
    };
    const expectedPayout = Math.floor(computeShopAssetValue(shop) * 2);
    const state = {
      ...base,
      phase: 'EVENT_PICK_STORE' as const,
      eventStorePrompt: { mode: 'sell' as const, multiplier: 2, forced: true },
      shops: { ...base.shops, shop_1_2: shop },
    };

    const pick = buildBoardShopPick(state, noopDispatch, noopUi, 'shop_1_1');
    expect(pick).not.toBeNull();
    expect(pick!.hoveredShopId).toBeUndefined();
    expect(pick!.getBadgeText?.('shop_1_2', false)).toBe(`SELL +$${expectedPayout}`);
    expect(pick!.getBadgeText?.('shop_1_2', true)).toBe(`CONFIRM +$${expectedPayout}`);
  });
});
