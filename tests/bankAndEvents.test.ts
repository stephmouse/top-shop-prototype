import { describe, expect, it } from 'vitest';
import { getDefaultAvatarForSeat } from '../src/config/avatarTypes';
import { EVENT_CARDS } from '../src/config/balance';
import { redactStateForClient } from '../src/engine/actions';
import { drawThreeEventIds, getEventRubberBandColumn } from '../src/engine/eventDraw';
import { computePaydayAmount } from '../src/engine/helpers';
import { applyAction, createInitialGameState } from '../src/engine/state';

const PLAYERS = [
  { name: 'Alice', avatar: { ...getDefaultAvatarForSeat(0), walkSound: 'poot' as const, customImage: 'data:image/webp;base64,AAA' } },
  { name: 'Bob' },
];

describe('bank rewards, paydays, events, rubber-banding, and calendar', () => {
  it('computes exact-landing 1.5x payday, supports Bank cancel refund, and exits after 1 reward', () => {
    const state = createInitialGameState(PLAYERS, { startingCash: 3000 }, 50, 'stage_0');
    const p1 = state.players[0]!;
    const passPay = computePaydayAmount(state, { ...p1, stepsSincePayday: 18 }, false);
    const exactPay = computePaydayAmount(state, { ...p1, stepsSincePayday: 18 }, true);
    expect(exactPay).toBe(Math.floor((passPay * 3) / 2));

    const bankState = {
      ...state,
      phase: 'BANK_MENU' as const,
      players: state.players.map((p, i) => (i === 0 ? { ...p, points: 10 } : p)),
    };
    const cashAfter = applyAction(bankState, { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_02_cash_200' });
    expect(cashAfter.players[0]!.cash).toBe(3200);
    expect(cashAfter.players[0]!.points).toBe(9);
    expect(cashAfter.phase).toBe('ROLL_PENCIL');
    expect(cashAfter.activePlayerIndex).toBe(1);

    const deliverPrompt = applyAction(
      {
        ...bankState,
        shops: { ...bankState.shops, shop_1_1: { ...bankState.shops.shop_1_1!, ownerId: 'p_1', storeTypeId: 'pancake_house', level: 1 as const, stock: {} } },
      },
      { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_06_deliver_own' }
    );
    expect(deliverPrompt.phase).toBe('SHOP_DELIVER');
    const refunded = applyAction(deliverPrompt, { type: 'SKIP_DELIVER' });
    expect(refunded.phase).toBe('BANK_MENU');
    expect(refunded.players[0]!.points).toBe(10);

    const shoes = applyAction(bankState, { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_24_chirp_shoes' });
    expect(shoes.players[0]!.chirpSandals).toBe(true);
    expect(shoes.players[0]!.equippedWalkSound).toBe('poot');

    const copied = applyAction(
      { ...bankState, players: bankState.players.map((p, i) => (i === 0 ? { ...p, points: 60 } : { ...p, cash: 4500 })) },
      { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_52_copy_rival_cash', targetPlayerId: 'p_2' }
    );
    expect(copied.players[0]!.cash).toBe(3000 + 4500);
    expect(copied.players[1]!.cash).toBe(4500);

    const won = applyAction(
      { ...bankState, players: bankState.players.map((p, i) => (i === 0 ? { ...p, points: 99 } : p)) },
      { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_53_claim_victory' }
    );
    expect(won.phase).toBe('GAME_OVER');
    expect(won.winnerId).toBe('p_1');
  });

  it('draws 3 distinct valid events, redacts unrevealed picks, and follows PS1 rubber-banding', () => {
    const base = createInitialGameState(PLAYERS, { targetAssets: 30000 }, 314, 'stage_0');
    expect(getEventRubberBandColumn(base)).toBe(0);

    const year2Trailing = {
      ...base,
      totalMonths: 12,
      players: [
        { ...base.players[0]!, cash: 2000 },
        { ...base.players[1]!, cash: 13000 },
      ],
    };
    expect(getEventRubberBandColumn(year2Trailing)).toBe(6);

    const nearWin = {
      ...year2Trailing,
      players: [{ ...base.players[0]!, cash: 15000 }, base.players[1]!],
    };
    expect(getEventRubberBandColumn(nearWin)).toBe(7);

    const { ids } = drawThreeEventIds(base, 777);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) {
      expect(EVENT_CARDS.some((c) => c.id === id)).toBe(true);
    }

    const rolledEvent = applyAction(base, { type: 'ROLL_PENCIL', chosenFace: 'E' });
    expect(rolledEvent.phase).toBe('EVENT_PICK');
    const redacted = redactStateForClient(rolledEvent);
    expect(redacted.seed).toBe(0);
    expect(redacted.eventChoices).toEqual(['hidden_0', 'hidden_1', 'hidden_2']);
    expect(redacted.players[0]!.avatar?.customImage).toBeUndefined();

    const revealed = applyAction(rolledEvent, { type: 'REVEAL_EVENT_CARD', slotIndex: 1 });
    expect(revealed.revealedEventSlot).toBe(1);
    const chosenId = revealed.eventChoices[1]!;
    const resolved = applyAction(revealed, { type: 'PICK_EVENT_CARD', cardId: chosenId });
    expect(resolved.eventChoices).toEqual([]);
    expect(resolved.revealedEventSlot).toBeNull();
  });

  it('starts in Year 1 April and advances month on round boundary', () => {
    let state = createInitialGameState(PLAYERS, { startingPlayer: 1 }, 5, 'stage_0');
    expect(state.month).toBe(0);
    expect(state.year).toBe(1);
    expect(state.activePlayerIndex).toBe(1);

    state = { ...state, phase: 'SHOP_BUY_SLOT' };
    state = applyAction(state, { type: 'SKIP_SHOP_SLOT' });
    expect(state.activePlayerIndex).toBe(0);
    expect(state.totalMonths).toBe(0);

    state = { ...state, phase: 'SHOP_BUY_SLOT' };
    state = applyAction(state, { type: 'SKIP_SHOP_SLOT' });
    expect(state.activePlayerIndex).toBe(1);
    expect(state.totalMonths).toBe(1);
    expect(state.month).toBe(1);
  });

  it('reverses both horizontal and vertical directions on Forced U-Turn and Bank reversals', () => {
    const base = createInitialGameState(PLAYERS, { startingCash: 3000 }, 99, 'stage_0');

    const eventState = {
      ...base,
      phase: 'EVENT_PICK' as const,
      eventChoices: ['eve_044', 'eve_001', 'eve_002'],
      revealedEventSlot: 0,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, horizontalDir: 'left' as const, verticalDir: 'down' as const } : p
      ),
    };
    const afterEvent = applyAction(eventState, { type: 'PICK_EVENT_CARD', cardId: 'eve_044' });
    expect(afterEvent.players[0]!.horizontalDir).toBe('right');
    expect(afterEvent.players[0]!.verticalDir).toBe('up');
    expect(afterEvent.players[0]!.reverseDirNextTurn).toBe(false);

    const nullAxis = applyAction(
      {
        ...eventState,
        players: base.players.map((p, i) =>
          i === 0 ? { ...p, horizontalDir: null, verticalDir: 'up' as const } : p
        ),
      },
      { type: 'PICK_EVENT_CARD', cardId: 'eve_044' }
    );
    expect(nullAxis.players[0]!.horizontalDir).toBeNull();
    expect(nullAxis.players[0]!.verticalDir).toBe('down');

    const bankState = {
      ...base,
      phase: 'BANK_MENU' as const,
      players: [
        { ...base.players[0]!, points: 30, horizontalDir: 'right' as const, verticalDir: 'up' as const },
        { ...base.players[1]!, horizontalDir: 'left' as const, verticalDir: 'down' as const },
      ],
    };
    const rev1 = applyAction(bankState, {
      type: 'REDEEM_BANK_REWARD',
      rewardId: 'bank_08_reverse_rival',
      targetPlayerId: 'p_2',
    });
    expect(rev1.players[1]!.horizontalDir).toBe('right');
    expect(rev1.players[1]!.verticalDir).toBe('up');

    const rev2 = applyAction(
      { ...rev1, activePlayerIndex: 0, phase: 'BANK_MENU' as const },
      { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_08_reverse_rival', targetPlayerId: 'p_2' }
    );
    expect(rev2.players[1]!.horizontalDir).toBe('left');
    expect(rev2.players[1]!.verticalDir).toBe('down');

    const revAllPassBank = applyAction(
      { ...bankState, pendingPostBankPhase: 'STEPPING' as const, remainingSteps: 2 },
      { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_21_reverse_all' }
    );
    expect(revAllPassBank.players[0]!.horizontalDir).toBe('right');
    expect(revAllPassBank.players[0]!.verticalDir).toBe('up');
    expect(revAllPassBank.players[0]!.reverseDirNextTurn).toBe(true);
    expect(revAllPassBank.players[1]!.horizontalDir).toBe('right');
    expect(revAllPassBank.players[1]!.verticalDir).toBe('up');

    const finishedWalk = applyAction(
      { ...revAllPassBank, phase: 'SHOP_BUY_SLOT' as const, pendingPostBankPhase: null },
      { type: 'SKIP_SHOP_SLOT' }
    );
    const backToP1 = applyAction(
      { ...finishedWalk, phase: 'SHOP_BUY_SLOT' as const },
      { type: 'SKIP_SHOP_SLOT' }
    );
    expect(backToP1.activePlayerIndex).toBe(0);
    expect(backToP1.players[0]!.horizontalDir).toBe('left');
    expect(backToP1.players[0]!.verticalDir).toBe('down');
    expect(backToP1.players[0]!.reverseDirNextTurn).toBe(false);
  });
});
