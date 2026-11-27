import { describe, expect, it } from 'vitest';
import { getPlayerMatchStats } from '../src/engine/matchStats';
import { applyAction, createInitialGameState } from '../src/engine/state';
import {
  debugAdjustPlayer,
  debugAdvanceMonth,
  debugAdvanceTurn,
  debugMutateShop,
  debugOpenBankMenu,
  debugSeedSampleStats,
  debugTriggerEventCard,
  debugTriggerVictory,
} from '../src/ui/debugActions';
import { isValidGameState } from '../src/ui/stateValidation';
import { computeMatchAwards } from '../src/ui/victoryAwards';

const PLAYERS = [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }];

describe('debug tools state transforms', () => {
  it('edits players, teleports, opens bank, advances turn/month, and triggers event cards', () => {
    let state = createInitialGameState(PLAYERS, { startingCash: 3000, startingPlayer: 0 }, 11, 'stage_0');

    const neg = debugAdjustPlayer(state, 'p_1', { cashDelta: -3200, setPoints: 120, tileId: 'f2_c0' });
    expect(neg.players[0]!.cash).toBe(-200);
    expect(neg.players[0]!.points).toBe(99);
    expect(neg.players[0]!.tileId).toBe('f2_c0');

    state = debugAdjustPlayer(neg, 'p_1', { setCash: 3000 });
    const bank = debugOpenBankMenu(state);
    expect(bank.phase).toBe('BANK_MENU');

    const ev = debugTriggerEventCard(bank, 'eve_075');
    expect(ev.phase).toBe('EVENT_PICK');
    expect(ev.revealedEventSlot).toBe(0);
    expect(ev.eventChoices[0]).toBe('eve_075');

    const nextTurn = debugAdvanceTurn(state);
    expect(nextTurn.turnNumber).toBe(2);
    expect(nextTurn.activePlayerIndex).toBe(1);

    const nextMonth = debugAdvanceMonth(nextTurn);
    expect(nextMonth.totalMonths).toBe(1);
    expect(nextMonth.assetHistory).toHaveLength(2);
  });

  it('mutates stores cleanly (assign, fill costly, empty stock, toggle closed, clear)', () => {
    let state = createInitialGameState(PLAYERS, { startingCash: 3000, startingPlayer: 0 }, 12, 'stage_0');
    const shopId = 'shop_1_1';

    state = debugMutateShop(state, shopId, { kind: 'assign', ownerId: 'p_1', storeTypeId: 'pancake_house' });
    expect(state.shops[shopId]!.ownerId).toBe('p_1');
    expect(state.shops[shopId]!.storeTypeId).toBe('pancake_house');

    state = debugMutateShop(state, shopId, { kind: 'fill_costly' });
    expect(Object.values(state.shops[shopId]!.stock).reduce((a, b) => a + b, 0)).toBe(3);

    state = debugMutateShop(state, shopId, { kind: 'toggle_closed' });
    expect(state.shops[shopId]!.closedWindow).not.toBeNull();
    state = debugMutateShop(state, shopId, { kind: 'toggle_closed' });
    expect(state.shops[shopId]!.closedWindow).toBeNull();

    state = debugMutateShop(state, shopId, { kind: 'empty_stock' });
    expect(state.shops[shopId]!.stock).toEqual({});

    state = debugMutateShop(state, shopId, { kind: 'clear' });
    expect(state.shops[shopId]!.ownerId).toBeNull();
  });

  it('seeds sample monthly stats and triggers all three victory conditions cleanly', () => {
    const base = createInitialGameState(PLAYERS, { startingCash: 3000, targetAssets: 12000, startingPlayer: 0 }, 15, 'stage_0');
    const seeded = debugSeedSampleStats(base, 8);
    expect(seeded.totalMonths).toBe(8);
    expect(seeded.assetHistory).toHaveLength(9);
    expect(getPlayerMatchStats(seeded, 'p_1').stepsTaken).toBeGreaterThan(0);
    expect(computeMatchAwards(seeded).length).toBeGreaterThanOrEqual(8);
    expect(isValidGameState(seeded)).toBe(true);

    const winTarget = debugTriggerVictory(seeded, 'target_assets', 'p_2');
    expect(winTarget.phase).toBe('GAME_OVER');
    expect(winTarget.winnerId).toBe('p_2');
    expect(winTarget.winReason).toBe('target_assets');
    expect(winTarget.assetHistory![winTarget.assetHistory!.length - 1]!.isFinal).toBe(true);

    // Further gameplay actions are blocked once GAME_OVER
    expect(applyAction(winTarget, { type: 'ROLL_PENCIL' })).toBe(winTarget);

    const winBankrupt = debugTriggerVictory(seeded, 'bankruptcy', 'p_3');
    expect(winBankrupt.winReason).toBe('bankruptcy');
    expect(winBankrupt.players.filter((p) => !p.isBankrupt).map((p) => p.id)).toEqual(['p_3']);

    const win99 = debugTriggerVictory(seeded, 'bank_99_points', 'p_1');
    expect(win99.winReason).toBe('bank_99_points');
    expect(win99.players[0]!.points).toBe(99);
  });
});
