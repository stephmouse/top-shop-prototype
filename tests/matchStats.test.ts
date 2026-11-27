import { describe, expect, it } from 'vitest';
import { STORE_TYPES } from '../src/config/balance';
import { getActivePlayer } from '../src/engine/helpers';
import { getPlayerMatchStats } from '../src/engine/matchStats';
import { applyAction, createInitialGameState } from '../src/engine/state';
import { getWinnerIds, rankPlayersForStandings } from '../src/engine/turn';
import { packWireGameState } from '../src/net/wireState';
import { isValidGameState } from '../src/ui/stateValidation';
import { computeMatchAwards } from '../src/ui/victoryAwards';

const PLAYERS = [{ name: 'Alice' }, { name: 'Bob' }];

describe('matchStats, assetHistory, winReason, and victoryAwards', () => {
  it('tracks exact stepsTaken and escalatorsRidden across escalators, forks, undo, and cancel', () => {
    let state = createInitialGameState(PLAYERS, {}, 123, 'stage_0');
    state = applyAction(state, { type: 'ROLL_PENCIL', chosenFace: 6 });
    state = applyAction(state, { type: 'CHOOSE_DIRECTION', direction: 'left' });
    for (let i = 0; i < 4; i++) {
      state = applyAction(state, { type: 'ADVANCE_STEP' });
    }
    expect(state.phase).toBe('ESCALATOR_RIDE');
    expect(getPlayerMatchStats(state, 'p_1').stepsTaken).toBe(5);
    expect(getPlayerMatchStats(state, 'p_1').escalatorsRidden).toBe(0);

    // Slide onto 2F: takes 0 extra steps and increments escalatorsRidden
    state = applyAction(state, { type: 'ADVANCE_STEP' });
    expect(getPlayerMatchStats(state, 'p_1').stepsTaken).toBe(5);
    expect(getPlayerMatchStats(state, 'p_1').escalatorsRidden).toBe(1);

    // Undo escalator slide reverts both the escalator ride and the step onto f1_c0
    state = applyAction(state, { type: 'UNDO_STEP' });
    expect(state.phase).toBe('ESCALATOR_UNDO');
    state = applyAction(state, { type: 'ADVANCE_STEP' });
    expect(getPlayerMatchStats(state, 'p_1').stepsTaken).toBe(4);
    expect(getPlayerMatchStats(state, 'p_1').escalatorsRidden).toBe(0);

    // Full cancel resets uncommitted steps to 0
    state = applyAction(state, { type: 'CANCEL_MOVE' });
    expect(getPlayerMatchStats(state, 'p_1').stepsTaken).toBe(0);
    expect(getPlayerMatchStats(state, 'p_1').pencilRolls).toBe(1);

    // Bidirectional fork choice adds 0 extra steps and 1 escalator ride
    let forkState = createInitialGameState(PLAYERS, {}, 77, 'stage_0');
    forkState = {
      ...forkState,
      phase: 'STEPPING',
      remainingSteps: 3,
      players: forkState.players.map((p, idx) =>
        idx === 0 ? { ...p, tileId: 'f2_c1', horizontalDir: 'left', verticalDir: null } : p
      ),
    };
    forkState = applyAction(forkState, { type: 'ADVANCE_STEP' });
    expect(forkState.phase).toBe('CHOOSE_DIRECTION');
    expect(getPlayerMatchStats(forkState, 'p_1').stepsTaken).toBe(1);

    forkState = applyAction(forkState, { type: 'CHOOSE_DIRECTION', direction: 'up' });
    expect(getPlayerMatchStats(forkState, 'p_1').stepsTaken).toBe(1);
    expect(getPlayerMatchStats(forkState, 'p_1').escalatorsRidden).toBe(1);
  });

  it('tracks elevator rides (1 step onto tile, 0 if skipped) and awards Frequent Flyer strictly on elevators', () => {
    let state = createInitialGameState(PLAYERS, {}, 42, 'stage_0');
    const elev = Object.values(state.tiles).find((t) => t.type === 'elevator')!;
    const neighborLeft = elev.neighbors.left!;
    state = {
      ...state,
      phase: 'STEPPING',
      remainingSteps: 1,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, tileId: neighborLeft, horizontalDir: 'right', verticalDir: null } : p
      ),
    };
    state = applyAction(state, { type: 'ADVANCE_STEP' });
    expect(state.phase).toBe('ELEVATOR_PROMPT');
    expect(getPlayerMatchStats(state, 'p_1').stepsTaken).toBe(1);

    // Riding elevator increments elevatorsRidden
    const rode = applyAction(state, { type: 'RESOLVE_ELEVATOR', ride: true });
    expect(getPlayerMatchStats(rode, 'p_1').elevatorsRidden).toBe(1);

    // Skipping elevator leaves elevatorsRidden at 0
    const skipped = applyAction(state, { type: 'RESOLVE_ELEVATOR', ride: false });
    expect(getPlayerMatchStats(skipped, 'p_1').elevatorsRidden).toBe(0);

    // Escalators alone must NOT win Frequent Flyer
    const onlyEscalators = {
      ...skipped,
      matchStats: {
        ...skipped.matchStats,
        p_1: { ...getPlayerMatchStats(skipped, 'p_1'), escalatorsRidden: 12, elevatorsRidden: 0 },
        p_2: { ...getPlayerMatchStats(skipped, 'p_2'), escalatorsRidden: 0, elevatorsRidden: 1 },
      },
    };
    const flyer = computeMatchAwards(onlyEscalators).find((a) => a.id === 'frequent_flyer');
    expect(flyer?.winnerIds).toEqual(['p_2']);
  });

  it('tracks shopping, bank points, event points, shoes, liquidation, and round assetHistory + winReason', () => {
    let state = createInitialGameState(
      PLAYERS,
      { startingCash: 3000, targetAssets: 20000, finishRoundOnWin: false, startingPlayer: 0 },
      99,
      'stage_0'
    );
    expect(state.assetHistory).toHaveLength(1);
    expect(state.assetHistory![0]!.netWorthByPlayer).toEqual({ p_1: 3000, p_2: 3000 });

    // Bank cash & points + delivery cancel refund
    const bankMenu = {
      ...state,
      phase: 'BANK_MENU' as const,
      players: state.players.map((p) => ({ ...p, points: 10 })),
      shops: {
        ...state.shops,
        shop_1_1: { ...state.shops.shop_1_1!, ownerId: 'p_1', storeTypeId: 'pancake_house', level: 1 as const, stock: {} },
      },
    };
    const deliverPrompt = applyAction(bankMenu, { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_06_deliver_own' });
    const canceled = applyAction(deliverPrompt, { type: 'SKIP_DELIVER' });
    expect(getPlayerMatchStats(canceled, 'p_1').bankRewardsRedeemed).toBe(0);
    expect(getPlayerMatchStats(canceled, 'p_1').pointsSpent).toBe(0);

    const earnPt = applyAction(bankMenu, { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_01_earn_1pt' });
    expect(getPlayerMatchStats(earnPt, 'p_1').pointsFromBank).toBe(1);
    expect(earnPt.assetHistory?.length).toBeGreaterThanOrEqual(1);

    // Completing round records month snapshot in assetHistory
    const roundWrap = applyAction(
      { ...earnPt, phase: 'BANK_MENU' },
      { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_02_cash_200' }
    );
    expect(roundWrap.totalMonths).toBe(1);
    expect(roundWrap.assetHistory).toHaveLength(2);
    expect(roundWrap.assetHistory![1]!.totalMonths).toBe(1);

    // Event pick tracks eventsDrawn, pointsFromEvents, eventMisses
    let evState = createInitialGameState(PLAYERS, { startingPlayer: 0 }, 7, 'stage_0');
    evState = {
      ...evState,
      phase: 'EVENT_PICK',
      eventChoices: ['eve_076', 'eve_024', 'eve_025'],
      revealedEventSlot: 0,
    };
    evState = applyAction(evState, { type: 'PICK_EVENT_CARD', cardId: 'eve_076' });
    expect(getPlayerMatchStats(evState, 'p_1').eventsDrawn).toBe(1);
    expect(getPlayerMatchStats(evState, 'p_1').eventMisses).toBe(1);
    expect(getPlayerMatchStats(evState, 'p_1').pointsFromEvents).toBe(0);

    // Liquidation tracks value lost
    const liqState = applyAction(
      {
        ...roundWrap,
        phase: 'LIQUIDATE_ASSETS',
        activePlayerIndex: 0,
        players: roundWrap.players.map((p, i) => (i === 0 ? { ...p, cash: -100 } : p)),
      },
      { type: 'SELL_SHOP_LIQUIDATE', shopId: 'shop_1_1' }
    );
    expect(getPlayerMatchStats(liqState, 'p_1').shopsLiquidated).toBe(1);
    expect(getPlayerMatchStats(liqState, 'p_1').liquidationValueLost).toBeGreaterThan(0);

    // Target assets winReason + final assetHistory snapshot
    const wonTarget = applyAction(
      {
        ...roundWrap,
        phase: 'BANK_MENU',
        activePlayerIndex: 0,
        players: roundWrap.players.map((p, i) => (i === 0 ? { ...p, cash: 25000, points: 5 } : p)),
      },
      { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_02_cash_200' }
    );
    expect(wonTarget.phase).toBe('GAME_OVER');
    expect(wonTarget.winnerId).toBe('p_1');
    expect(wonTarget.winReason).toBe('target_assets');
    expect(wonTarget.assetHistory![wonTarget.assetHistory!.length - 1]!.isFinal).toBe(true);
    expect(getActivePlayer(wonTarget).id).toBe('p_2');

    // 99-point bank claim winReason
    const won99 = applyAction(
      {
        ...state,
        phase: 'BANK_MENU',
        players: state.players.map((p, i) => (i === 0 ? { ...p, points: 99 } : p)),
      },
      { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_53_claim_victory' }
    );
    expect(won99.phase).toBe('GAME_OVER');
    expect(won99.winReason).toBe('bank_99_points');
    expect(won99.assetHistory![won99.assetHistory!.length - 1]!.isFinal).toBe(true);

    // Legacy & new validation
    expect(isValidGameState(won99)).toBe(true);
    const { winReason: _w, assetHistory: _a, matchStats: _m, ...legacy } = won99;
    expect(isValidGameState(legacy)).toBe(true);

    // Wire compaction strips telemetry mid-game and includes it on GAME_OVER
    const midWire = packWireGameState(roundWrap);
    expect('matchStats' in midWire).toBe(false);
    expect('assetHistory' in midWire).toBe(false);
    const overWire = packWireGameState(won99);
    expect(overWire.winReason).toBe('bank_99_points');
    expect(overWire.assetHistory?.length).toBeGreaterThanOrEqual(2);
    expect(overWire.matchStats).toBeDefined();
  });

  it('resolves shared #1 co-winners, cash sort tiebreaker, and bankruptTurn ordering per PS1 SLUS_013.33', () => {
    const threePlayers = [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }];

    // 1. Bankruptcy ends 3-player game on Turn 1 while Bob & Carol tie at $3000 -> shared #1 co-winners
    const base = createInitialGameState(threePlayers, { startingCash: 3000, bankruptLimit: 1, startingPlayer: 0 }, 5, 'stage_0');
    const negAlice = {
      ...base,
      phase: 'BANK_MENU' as const,
      players: base.players.map((p, i) => (i === 0 ? { ...p, cash: -100, points: 5 } : p)),
    };
    const bankruptWin = applyAction(negAlice, { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_01_earn_1pt' });
    expect(bankruptWin.phase).toBe('GAME_OVER');
    expect(bankruptWin.winReason).toBe('bankruptcy');
    expect(getWinnerIds(bankruptWin)).toEqual(['p_2', 'p_3']);
    const bStandings = rankPlayersForStandings(bankruptWin);
    expect(bStandings.map((r) => [r.player.id, r.rank])).toEqual([
      ['p_2', 1],
      ['p_3', 1],
      ['p_1', 3],
    ]);

    // 2. Target-assets round-end tie with identical net worth: higher cash sorts first, both share #1
    const shopState = {
      ...base,
      config: { ...base.config, targetAssets: 4000, finishRoundOnWin: true },
      activePlayerIndex: 2,
      phase: 'BANK_MENU' as const,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, cash: 3200 } : i === 1 ? { ...p, cash: 4000 } : { ...p, cash: 1000, points: 5 }
      ),
      shops: {
        ...base.shops,
        // Give Alice a stocked store worth $800 (Pancake House emptyBaseCost=80 + items? set netWorth exactly 4000 via shop stock):
        // Better: use emptyBaseCost + 0 stock or compute exact shop value, actually test with store + cash offset:
        shop_1_1: { ...base.shops.shop_1_1!, ownerId: 'p_1', storeTypeId: 'pancake_house', level: 1 as const, stock: {} },
      },
    };
    // Empty Pancake House asset value = emptyBaseCost -> set Alice cash so Alice & Bob tie at exactly 4000 netWorth, with Bob ahead on cash
    const pancakeBase = STORE_TYPES.pancake_house!.emptyBaseCost;
    const tiedRoundEnd = applyAction(
      {
        ...shopState,
        players: shopState.players.map((p, i) => (i === 0 ? { ...p, cash: 4000 - pancakeBase } : p)),
      },
      { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_01_earn_1pt' }
    );
    expect(tiedRoundEnd.phase).toBe('GAME_OVER');
    expect(tiedRoundEnd.winReason).toBe('target_assets');
    expect(getWinnerIds(tiedRoundEnd)).toEqual(['p_2', 'p_1']);
    const tStandings = rankPlayersForStandings(tiedRoundEnd);
    expect(tStandings.map((r) => [r.player.id, r.rank])).toEqual([
      ['p_2', 1],
      ['p_1', 1],
      ['p_3', 3],
    ]);

    // 3. Multiple bankrupt players: later bankruptTurn ranks ahead of earlier bankruptTurn
    const multiBankrupt = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0
          ? { ...p, isBankrupt: true, bankruptTurn: 3, cash: -100 }
          : i === 1
            ? { ...p, isBankrupt: true, bankruptTurn: 7, cash: -500 }
            : p
      ),
    };
    expect(rankPlayersForStandings(multiBankrupt).map((r) => r.player.id)).toEqual(['p_3', 'p_2', 'p_1']);
  });
});
