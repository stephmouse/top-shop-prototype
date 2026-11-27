import { describe, expect, it } from 'vitest';
import { getDefaultAvatarForSeat } from '../src/config/avatarTypes';
import { BANK_REWARDS, EVENT_CARDS, STORE_TYPES } from '../src/config/balance';
import { redactStateForClient } from '../src/engine/actions';
import { drawThreeEventIds, getEventRubberBandColumn } from '../src/engine/eventDraw';
import { computePaydayAmount, formatShopRef, formatTileCoord, getEffectiveItemRetailPrice } from '../src/engine/helpers';
import { applyAction, createInitialGameState } from '../src/engine/state';
import { formatTimedWindowEndpoint, getTimedWindowRoundsLeft, getTurnClock } from '../src/engine/timedEffects';
import type { GameState } from '../src/engine/types';

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

  it('keeps closed stores shut through the caster next turn (Item 18)', () => {
    const base = createInitialGameState(PLAYERS, { startingCash: 3000 }, 21, 'stage_0');
    const setupState = {
      ...base,
      activePlayerIndex: 1,
      turnNumber: 2,
      phase: 'EVENT_PICK' as const,
      eventChoices: ['eve_031', 'eve_032', 'eve_033'],
      revealedEventSlot: 0,
      shops: {
        ...base.shops,
        shop_1_1: { ...base.shops.shop_1_1!, ownerId: 'p_1', storeTypeId: 'pancake_house', stock: { pancake_1: 2 } },
        shop_1_2: { ...base.shops.shop_1_2!, ownerId: 'p_2', storeTypeId: 'toy_shop', stock: { toy_1: 2 } },
      },
    };

    // Bob (p_2) draws Mall Holiday (1 round) -> advances to Alice (clock = 2)
    const afterHoliday = applyAction(setupState, { type: 'PICK_EVENT_CARD', cardId: 'eve_031' });
    expect(afterHoliday.activePlayerIndex).toBe(0);
    expect(getTurnClock(afterHoliday)).toBe(2);
    expect(getTimedWindowRoundsLeft(afterHoliday, afterHoliday.shops.shop_1_1!.closedWindow)).toBe(1);
    expect(getTimedWindowRoundsLeft(afterHoliday, afterHoliday.shops.shop_1_2!.closedWindow)).toBe(1);
    expect(formatTimedWindowEndpoint(afterHoliday, afterHoliday.shops.shop_1_1!.closedWindow!, 'Reopens')).toBe(
      "Reopens after Bob's next turn"
    );

    // Alice finishes her turn; Bob gets his turn (clock = 3) and Alice's shop_1_1 MUST STILL BE CLOSED
    const bobTurn = applyAction({ ...afterHoliday, phase: 'SHOP_BUY_SLOT' as const }, { type: 'SKIP_SHOP_SLOT' });
    expect(bobTurn.activePlayerIndex).toBe(1);
    expect(getTurnClock(bobTurn)).toBe(3);
    expect(bobTurn.shops.shop_1_1!.closedWindow).not.toBeNull();
    expect(bobTurn.shops.shop_1_2!.closedWindow).not.toBeNull();
    expect(getTimedWindowRoundsLeft(bobTurn, bobTurn.shops.shop_1_1!.closedWindow)).toBe(1);
    expect(formatTimedWindowEndpoint(bobTurn, bobTurn.shops.shop_1_1!.closedWindow!, 'Reopens')).toBe(
      'Reopens after this turn (Bob)'
    );

    // Bob finishes that turn -> clock = 4 > expiresAt (3), so both stores reopen together
    const reopened = applyAction({ ...bobTurn, phase: 'SHOP_BUY_SLOT' as const }, { type: 'SKIP_SHOP_SLOT' });
    expect(reopened.activePlayerIndex).toBe(0);
    expect(getTurnClock(reopened)).toBe(4);
    expect(reopened.shops.shop_1_1!.closedWindow).toBeNull();
    expect(reopened.shops.shop_1_2!.closedWindow).toBeNull();

    // Exclusive Open (eve_032) closes Alice's store while leaving Bob's open, lasting through Bob's turn
    const exclusive = applyAction(
      { ...setupState, revealedEventSlot: 1 },
      { type: 'PICK_EVENT_CARD', cardId: 'eve_032' }
    );
    expect(exclusive.shops.shop_1_1!.closedWindow).not.toBeNull();
    expect(exclusive.shops.shop_1_2!.closedWindow).toBeNull();
    const exclBobTurn = applyAction({ ...exclusive, phase: 'SHOP_BUY_SLOT' as const }, { type: 'SKIP_SHOP_SLOT' });
    expect(exclBobTurn.shops.shop_1_1!.closedWindow).not.toBeNull();
    const exclReopen = applyAction({ ...exclBobTurn, phase: 'SHOP_BUY_SLOT' as const }, { type: 'SKIP_SHOP_SLOT' });
    expect(exclReopen.shops.shop_1_1!.closedWindow).toBeNull();

    // Mall Renovation (eve_033, 2 rounds) counts 2 -> 1 cleanly across rounds
    let reno = applyAction({ ...setupState, revealedEventSlot: 2 }, { type: 'PICK_EVENT_CARD', cardId: 'eve_033' });
    expect(getTimedWindowRoundsLeft(reno, reno.shops.shop_1_1!.closedWindow)).toBe(2);
    reno = applyAction({ ...reno, phase: 'SHOP_BUY_SLOT' as const }, { type: 'SKIP_SHOP_SLOT' }); // Bob T1 (clock 3)
    expect(getTimedWindowRoundsLeft(reno, reno.shops.shop_1_1!.closedWindow)).toBe(2);
    reno = applyAction({ ...reno, phase: 'SHOP_BUY_SLOT' as const }, { type: 'SKIP_SHOP_SLOT' }); // Alice T2 (clock 4)
    expect(getTimedWindowRoundsLeft(reno, reno.shops.shop_1_1!.closedWindow)).toBe(1);
    reno = applyAction({ ...reno, phase: 'SHOP_BUY_SLOT' as const }, { type: 'SKIP_SHOP_SLOT' }); // Bob T2 (clock 5)
    expect(getTimedWindowRoundsLeft(reno, reno.shops.shop_1_1!.closedWindow)).toBe(1);
    reno = applyAction({ ...reno, phase: 'SHOP_BUY_SLOT' as const }, { type: 'SKIP_SHOP_SLOT' }); // Reopens (clock 6)
    expect(reno.shops.shop_1_1!.closedWindow).toBeNull();
  });

  it('tracks 2x Prices for 4 rounds without cast-turn +1 leak and preserves Slow Pencil on Spin Again (Item 16)', () => {
    const base = createInitialGameState(PLAYERS, { startingCash: 3000 }, 33, 'stage_0');
    const item = STORE_TYPES.pancake_house!.items[0]!;
    let state: GameState = {
      ...base,
      phase: 'BANK_MENU',
      pendingPostBankPhase: 'STEPPING',
      remainingSteps: 2,
      players: base.players.map((p, i) => (i === 0 ? { ...p, points: 30 } : p)),
      shops: {
        ...base.shops,
        shop_1_1: { ...base.shops.shop_1_1!, ownerId: 'p_1', storeTypeId: 'pancake_house', stock: { [item.id]: 2 } },
      },
    };

    // Pass Bank mid-move: immediately shows 4 rd (not 5) and endpoint names Alice
    state = applyAction(state, { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_32_double_prices' });
    expect(state.phase).toBe('STEPPING');
    expect(getTimedWindowRoundsLeft(state, state.players[0]!.doublePriceWindow)).toBe(4);
    expect(formatTimedWindowEndpoint(state, state.players[0]!.doublePriceWindow!, '2× prices end')).toBe(
      "2× prices end after Alice's turn (4 rounds)"
    );

    // Finish Alice's turn -> Bob's turn 1 (clock 1): 4 rd and 2x price
    state = applyAction({ ...state, phase: 'SHOP_BUY_SLOT' as const, pendingPostBankPhase: null }, { type: 'SKIP_SHOP_SLOT' });
    expect(getEffectiveItemRetailPrice(state, item, 'p_1')).toBe(item.retailPrice * 2);
    expect(getTimedWindowRoundsLeft(state, state.players[0]!.doublePriceWindow)).toBe(4);

    // Advance through Bob's 4 turns against 2x prices (expires when Alice finishes turn at clock 8 -> clock 9)
    for (let i = 0; i < 7; i++) {
      state = applyAction({ ...state, phase: 'SHOP_BUY_SLOT' as const }, { type: 'SKIP_SHOP_SLOT' });
      expect(state.players[0]!.doublePriceWindow).not.toBeNull();
    }
    expect(getTurnClock(state)).toBe(8);
    expect(getTimedWindowRoundsLeft(state, state.players[0]!.doublePriceWindow)).toBe(1);

    state = applyAction({ ...state, phase: 'SHOP_BUY_SLOT' as const }, { type: 'SKIP_SHOP_SLOT' });
    expect(getTurnClock(state)).toBe(9);
    expect(state.players[0]!.doublePriceWindow).toBeNull();
    expect(getEffectiveItemRetailPrice(state, item, 'p_1')).toBe(item.retailPrice);

    // Slow Pencil + Spin Again keeps Slow Pencil active cleanly for 2 full rounds
    let slowState = applyAction(
      {
        ...base,
        phase: 'BANK_MENU' as const,
        players: base.players.map((p, i) => (i === 0 ? { ...p, points: 20 } : p)),
      },
      { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_16_slow_pencil' }
    );
    expect(slowState.players[0]!.pencilMode).toBe('slow');
    expect(getTimedWindowRoundsLeft(slowState, slowState.players[0]!.pencilWindow)).toBe(2);

    slowState = applyAction({ ...slowState, phase: 'SHOP_BUY_SLOT' as const }, { type: 'SKIP_SHOP_SLOT' }); // Alice next turn (clock 2)
    expect(getTimedWindowRoundsLeft(slowState, slowState.players[0]!.pencilWindow)).toBe(2);
    slowState = applyAction(
      { ...slowState, phase: 'EVENT_PICK' as const, eventChoices: ['eve_045', 'eve_001', 'eve_002'], revealedEventSlot: 0 },
      { type: 'PICK_EVENT_CARD', cardId: 'eve_045' }
    );
    expect(slowState.phase).toBe('ROLL_PENCIL');
    expect(slowState.players[0]!.pencilWindow).not.toBeNull();
    expect(getTimedWindowRoundsLeft(slowState, slowState.players[0]!.pencilWindow)).toBe(2);
  });

  it('formats tile coordinates and shop references consistently without leaking raw shop IDs (Item 20)', () => {
    const base = createInitialGameState(PLAYERS, { startingCash: 3000 }, 55, 'stage_0');
    const shop = base.shops.shop_1_2!;
    const tile = base.tiles[shop.tileId]!;
    expect(formatTileCoord(tile)).toBe('1F:3');
    expect(formatShopRef(base, shop)).toBe('Empty Lot (1F:3)');

    const ownedShop = { ...shop, ownerId: 'p_2', storeTypeId: 'bakery', level: 1 as const, stock: { bun: 1 } };
    const bankState = {
      ...base,
      phase: 'BANK_MENU' as const,
      players: base.players.map((p, i) => (i === 0 ? { ...p, points: 20 } : p)),
      shops: { ...base.shops, shop_1_2: ownedShop },
    };
    expect(formatShopRef(bankState, ownedShop)).toBe('Bakery (1F:3)');

    const closed = applyAction(bankState, {
      type: 'REDEEM_BANK_REWARD',
      rewardId: 'bank_09_close_rival_l1',
      targetPlayerId: 'p_2',
    });
    expect(closed.log[0]).toContain("Closed Bob's Bakery (1F:3) chain (L1).");
    expect(closed.log[0]).not.toContain('shop_1_2');
  });

  it('matches PS1 SLUS_013.33 targeting and randomization across Bank rewards (Item 40)', () => {
    const base = createInitialGameState(
      [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }],
      { startingCash: 3000 },
      77,
      'stage_0'
    );
    const allShopIds = Object.keys(base.shops);
    const stockedItem = (typeId: string) => STORE_TYPES[typeId]!.items[0]!.id;

    // Build rival stores for Bob (p_2) and Carol (p_3), plus 2 own stores for Alice (p_1)
    const shops = { ...base.shops };
    const ownSegShop = Object.values(shops).find((s) => s.segmentId === Object.values(shops)[0]!.segmentId && s.id !== Object.values(shops)[0]!.id);
    const bob1 = shops.shop_1_1!;
    const bob2 = shops.shop_1_2!;
    const carol1 = Object.values(shops).find((s) => s.segmentId !== bob1.segmentId && s.segmentId !== (ownSegShop?.segmentId ?? ''))!;
    const carol2 = Object.values(shops).find((s) => s.segmentId !== bob1.segmentId && s.segmentId !== carol1.segmentId)!;
    const carol3 = Object.values(shops).find((s) => ![bob1.segmentId, carol1.segmentId, carol2.segmentId].includes(s.segmentId))!;
    const alice1 = allShopIds
      .map((id) => shops[id]!)
      .find((s) => ![bob1.segmentId, carol1.segmentId, carol2.segmentId, carol3.segmentId].includes(s.segmentId))!;

    shops[bob1.id] = { ...bob1, ownerId: 'p_2', storeTypeId: 'pancake_house', level: 1, stock: { [stockedItem('pancake_house')]: 1 } };
    shops[bob2.id] = { ...bob2, ownerId: 'p_2', storeTypeId: 'bakery', level: 1, stock: {} };
    shops[carol1.id] = { ...carol1, ownerId: 'p_3', storeTypeId: 'flower_heart', level: 1, stock: { [stockedItem('flower_heart')]: 1 } };
    shops[carol2.id] = { ...carol2, ownerId: 'p_3', storeTypeId: 'candy_store', level: 1, stock: { [stockedItem('candy_store')]: 1 } };
    shops[carol3.id] = { ...carol3, ownerId: 'p_3', storeTypeId: 'kiss', level: 1, stock: { [stockedItem('kiss')]: 1 } };
    shops[alice1.id] = { ...alice1, ownerId: 'p_1', storeTypeId: 'burger_shop', level: 1, stock: { [stockedItem('burger_shop')]: 1 } };

    const bankBase: GameState = {
      ...base,
      phase: 'BANK_MENU',
      players: base.players.map((p, i) => (i === 0 ? { ...p, points: 90 } : p)),
      shops,
    };

    // bank_07_deliver_rival targets a rival player and restricts SHOP_DELIVER to that rival's stores
    const r07 = applyAction(bankBase, { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_07_deliver_rival', targetPlayerId: 'p_3' });
    expect(r07.phase).toBe('SHOP_DELIVER');
    expect(r07.deliverTargetPlayerId).toBe('p_3');
    const rejectedOtherRival = applyAction(r07, {
      type: 'DELIVER_ITEMS',
      shopId: bob1.id,
      order: { [stockedItem('pancake_house')]: 1 },
    });
    expect(rejectedOtherRival).toBe(r07);

    // bank_15_capture_empty targets a rival player and captures 1 random empty store of theirs
    const r15 = applyAction(bankBase, { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_15_capture_empty', targetPlayerId: 'p_2' });
    expect(r15.shops[bob2.id]!.ownerId).toBe('p_1');

    // bank_18_empty_rival_1 targets a rival player and empties 1 random stocked store of theirs
    const r18 = applyAction(bankBase, { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_18_empty_rival_1', targetPlayerId: 'p_2' });
    const totalStock = (id: string) => Object.values(r18.shops[id]!.stock).reduce((a, b) => a + b, 0);
    expect(totalStock(bob1.id)).toBe(0);
    expect(totalStock(carol1.id)).toBe(1);

    // bank_33_empty_rival_4 has no target pick and randomly empties up to 4 stocked rival stores across all rivals
    const r33Def = BANK_REWARDS.find((r) => r.id === 'bank_33_empty_rival_4')!;
    expect(r33Def.target).toBe('none');
    const r33 = applyAction(bankBase, { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_33_empty_rival_4' });
    const stockedRivalIds = [bob1.id, carol1.id, carol2.id, carol3.id];
    const emptiedCount = stockedRivalIds.filter(
      (id) => Object.values(r33.shops[id]!.stock).reduce((a, b) => a + b, 0) === 0
    ).length;
    expect(emptiedCount).toBe(4);

    // bank_26_open_with_rival_cash immediately opens 1 random empty slot in an unowned segment using rival's cash
    const r26 = applyAction(bankBase, { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_26_open_with_rival_cash', targetPlayerId: 'p_2' });
    expect(r26.phase).toBe('ROLL_PENCIL');
    expect(r26.players[1]!.cash).toBeLessThan(3000);
    const aliceCountAfterR26 = Object.values(r26.shops).filter((s) => s.ownerId === 'p_1').length;
    expect(aliceCountAfterR26).toBe(2);

    // bank_48_upgrade_own_l4 has no target pick and upgrades 1 random eligible own store segment
    const r48Def = BANK_REWARDS.find((r) => r.id === 'bank_48_upgrade_own_l4')!;
    expect(r48Def.target).toBe('none');
    const r48 = applyAction(bankBase, { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_48_upgrade_own_l4' });
    const aliceUpgradedSeg = Object.values(r48.shops).filter((s) => s.ownerId === 'p_1' && s.segmentId === alice1.segmentId);
    expect(aliceUpgradedSeg.every((s) => s.level >= 2)).toBe(true);
  });

  it('restores Chrip-Chrip Bank label and supports Novelty Shoes stacking, swapping, keeping, and removal (Items 12 & 25)', () => {
    const bankShoes = BANK_REWARDS.find((r) => r.id === 'bank_24_chirp_shoes');
    expect(bankShoes?.label).toBe('Equip "Chrip-Chrip" shoes');

    const base = createInitialGameState(PLAYERS, { startingCash: 3000 }, 88, 'stage_0');
    const eventShoes = {
      ...base,
      phase: 'EVENT_PICK' as const,
      eventChoices: ['eve_075', 'eve_001', 'eve_002'],
      revealedEventSlot: 0,
    };

    // First trigger equips player profile sound ('poot') immediately
    const first = applyAction(eventShoes, { type: 'PICK_EVENT_CARD', cardId: 'eve_075' });
    expect(first.phase).toBe('ROLL_PENCIL');
    expect(first.players[0]!.chirpSandals).toBe(true);
    expect(first.players[0]!.equippedWalkSounds).toEqual(['poot']);

    // Second trigger opens EVENT_SHOES_CHOICE (since already wearing shoes)
    const repeat = applyAction(
      { ...first, activePlayerIndex: 0, phase: 'EVENT_PICK' as const, eventChoices: ['eve_075', 'eve_001', 'eve_002'], revealedEventSlot: 0 },
      { type: 'PICK_EVENT_CARD', cardId: 'eve_075' }
    );
    expect(repeat.phase).toBe('EVENT_SHOES_CHOICE');

    // Keep leaves layer unchanged
    const kept = applyAction(repeat, { type: 'RESOLVE_SHOES', mode: 'keep' });
    expect(kept.players[0]!.equippedWalkSounds).toEqual(['poot']);
    expect(kept.phase).toBe('ROLL_PENCIL');

    // Stack up to 3 layers; 4th stack is rejected
    const layer2 = applyAction(repeat, { type: 'RESOLVE_SHOES', mode: 'stack', style: 'honk' });
    expect(layer2.players[0]!.equippedWalkSounds).toEqual(['poot', 'honk']);

    const openFor3 = applyAction(
      { ...layer2, activePlayerIndex: 0, phase: 'EVENT_PICK' as const, eventChoices: ['eve_075', 'eve_001', 'eve_002'], revealedEventSlot: 0 },
      { type: 'PICK_EVENT_CARD', cardId: 'eve_075' }
    );
    const layer3 = applyAction(openFor3, { type: 'RESOLVE_SHOES', mode: 'stack', style: 'boing' });
    expect(layer3.players[0]!.equippedWalkSounds).toEqual(['poot', 'honk', 'boing']);

    const openAtCap = applyAction(
      { ...layer3, activePlayerIndex: 0, phase: 'EVENT_PICK' as const, eventChoices: ['eve_075', 'eve_001', 'eve_002'], revealedEventSlot: 0 },
      { type: 'PICK_EVENT_CARD', cardId: 'eve_075' }
    );
    expect(applyAction(openAtCap, { type: 'RESOLVE_SHOES', mode: 'stack', style: 'tap' })).toBe(openAtCap);

    // Swap Layer 2 ('honk' -> 'tap')
    const swapped = applyAction(openAtCap, { type: 'RESOLVE_SHOES', mode: 'replace', slotIndex: 1, style: 'tap' });
    expect(swapped.players[0]!.equippedWalkSounds).toEqual(['poot', 'tap', 'boing']);

    // Take off all shoes
    const cleared = applyAction(openAtCap, { type: 'RESOLVE_SHOES', mode: 'clear' });
    expect(cleared.players[0]!.chirpSandals).toBe(false);
    expect(cleared.players[0]!.equippedWalkSounds).toEqual([]);

    // Bank repeat redemption while wearing shoes opens EVENT_SHOES_CHOICE and resumes STEPPING when passing Bank
    const repeatViaBank = applyAction(
      {
        ...first,
        activePlayerIndex: 0,
        phase: 'BANK_MENU' as const,
        pendingPostBankPhase: 'STEPPING' as const,
        remainingSteps: 2,
        players: first.players.map((p, i) => (i === 0 ? { ...p, points: 12 } : p)),
      },
      { type: 'REDEEM_BANK_REWARD', rewardId: 'bank_24_chirp_shoes' }
    );
    expect(repeatViaBank.phase).toBe('EVENT_SHOES_CHOICE');
    expect(repeatViaBank.players[0]!.points).toBe(3);
    expect(repeatViaBank.pendingPostBankPhase).toBe('STEPPING');

    const stackedViaBank = applyAction(repeatViaBank, { type: 'RESOLVE_SHOES', mode: 'stack', style: 'jingle' });
    expect(stackedViaBank.players[0]!.equippedWalkSounds).toEqual(['poot', 'jingle']);
    expect(stackedViaBank.phase).toBe('STEPPING');
    expect(stackedViaBank.pendingPostBankPhase).toBeNull();

    const swappedViaBank = applyAction(repeatViaBank, {
      type: 'RESOLVE_SHOES',
      mode: 'replace',
      slotIndex: 0,
      style: 'chirp',
    });
    expect(swappedViaBank.players[0]!.equippedWalkSounds).toEqual(['chirp']);
    expect(swappedViaBank.phase).toBe('STEPPING');
  });
});
