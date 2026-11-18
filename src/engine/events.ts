import { EVENT_CARDS, STORE_TYPES } from '../config/balance';
import {
  appendLog,
  computeShopAssetValue,
  drawThreeEventIds,
  getActivePlayer,
} from './helpers';
import { randomInt } from './rng';
import {
  buildStarterStock,
  getAllowedStoreTypeIds,
  getShopTotalStock,
  recomputeSegmentChainLevels,
  resumeAfterPostAction,
} from './shops';
import type { EventCardDef, GameState, Player, Shop } from './types';

function activeCount(state: GameState): number {
  return Math.max(1, state.players.filter((p) => !p.isBankrupt).length);
}

function resetShopSlot(shop: Shop): Shop {
  return { ...shop, ownerId: null, storeTypeId: null, level: 1, upgradedToL4: false, stock: {}, isClosedTurns: 0 };
}

function applyStockTransform(
  shop: Shop,
  mode: 'second_cheapest_two' | 'dearest_one' | 'downgrade' | 'lose_some'
): Record<string, number> {
  if (!shop.storeTypeId) return shop.stock;
  const def = STORE_TYPES[shop.storeTypeId];
  if (!def) return shop.stock;
  const sorted = [...def.items].sort((a, b) => a.retailPrice - b.retailPrice);

  if (mode === 'second_cheapest_two') {
    const item = sorted[1] ?? sorted[0];
    return item ? { [item.id]: 2 } : {};
  }
  if (mode === 'dearest_one') {
    const unlocked = sorted.filter((i) => i.tier <= shop.level);
    const dearest = unlocked[unlocked.length - 1] ?? sorted[0];
    return dearest ? { [dearest.id]: 1 } : {};
  }
  if (mode === 'downgrade') {
    const total = getShopTotalStock(shop);
    const cheapest = sorted[0];
    return total > 0 && cheapest ? { [cheapest.id]: total } : {};
  }

  let toRemove = Math.ceil(getShopTotalStock(shop) / 2);
  const nextStock = { ...shop.stock };
  for (const item of [...sorted].reverse()) {
    const qty = nextStock[item.id] ?? 0;
    if (qty > 0 && toRemove > 0) {
      const take = Math.min(qty, toRemove);
      nextStock[item.id] = qty - take;
      toRemove -= take;
    }
  }
  return nextStock;
}

export function handlePickEventCard(state: GameState, cardId: string): GameState {
  if (state.phase !== 'EVENT_PICK' || !state.eventChoices.includes(cardId)) return state;
  const card = EVENT_CARDS.find((c) => c.id === cardId);
  if (!card) return state;

  const active = getActivePlayer(state);
  let players = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, points: p.points + card.pointsAwarded } : p
  );
  let shops = { ...state.shops };
  let seed = state.seed;
  let globalSale = state.globalSale;
  let elevatorLock = state.elevatorLock;

  const nextBase = (logMsg: string): GameState => ({
    ...state,
    seed,
    players,
    shops,
    globalSale,
    elevatorLock,
    eventChoices: [],
    hadBranchChoiceThisTurn: false,
    moveHistory: [],
    pendingUndoSnapshot: null,
    log: appendLog(state, `${active.name}: ${card.name} (+${card.pointsAwarded} pts). ${logMsg}`),
  });

  const eff = card.effect;
  switch (eff.kind) {
    case 'nothing':
      return resumeAfterPostAction(nextBase(card.description));

    case 'cash_gift':
      players = players.map((p, i) => (i === state.activePlayerIndex ? { ...p, cash: p.cash + eff.amount } : p));
      return resumeAfterPostAction(nextBase(`+$${eff.amount}.`));

    case 'pay_each_rival': {
      const rivals = players.filter((p) => p.id !== active.id && !p.isBankrupt).length;
      players = players.map((p) => {
        if (p.id === active.id) return { ...p, cash: p.cash - eff.amount * rivals };
        return p.isBankrupt ? p : { ...p, cash: p.cash + eff.amount };
      });
      return resumeAfterPostAction(nextBase(`Paid $${eff.amount} to each rival.`));
    }

    case 'collect_each_rival': {
      const rivals = players.filter((p) => p.id !== active.id && !p.isBankrupt).length;
      players = players.map((p) => {
        if (p.id === active.id) return { ...p, cash: p.cash + eff.amount * rivals };
        return p.isBankrupt ? p : { ...p, cash: p.cash - eff.amount };
      });
      return resumeAfterPostAction(nextBase(`Collected $${eff.amount} from each rival.`));
    }

    case 'drop_cash_fraction': {
      const lost = Math.max(0, Math.floor((active.cash * eff.numerator) / eff.denominator));
      players = players.map((p, i) => (i === state.activePlayerIndex ? { ...p, cash: p.cash - lost } : p));
      return resumeAfterPostAction(nextBase(`Dropped $${lost}.`));
    }

    case 'equalize_cash':
      players = players.map((p) => (p.isBankrupt ? p : { ...p, cash: active.cash }));
      return resumeAfterPostAction(nextBase(`All players' cash set to $${active.cash}.`));

    case 'sell_store_prompt': {
      const own = Object.values(shops).filter((s) => s.ownerId === active.id);
      if (own.length === 0) return resumeAfterPostAction(nextBase('No stores owned.'));
      return {
        ...nextBase(`Choose a store to sell at ${eff.multiplier}x.`),
        phase: 'EVENT_PICK_STORE',
        eventStorePrompt: { mode: 'sell', multiplier: eff.multiplier, forced: eff.forced },
      };
    }

    case 'lose_store': {
      const own = Object.values(shops).filter((s) => s.ownerId === active.id);
      if (own.length === 0) return resumeAfterPostAction(nextBase('No stores owned.'));
      return {
        ...nextBase('Choose a store to forfeit.'),
        phase: 'EVENT_PICK_STORE',
        eventStorePrompt: { mode: 'lose', multiplier: 0, forced: true },
      };
    }

    case 'buy_empty_store': {
      if (active.blockNewStoreTurns > 0) return resumeAfterPostAction(nextBase('New stores blocked.'));
      const hasAny = Object.values(shops).some(
        (s) =>
          s.ownerId === null &&
          !Object.values(shops).some((o) => o.ownerId === active.id && o.segmentId === s.segmentId) &&
          getAllowedStoreTypeIds(state, active.id, s.segmentId).some(
            (id) => (STORE_TYPES[id]?.baseOpenCost ?? Infinity) <= active.cash
          )
      );
      if (!hasAny) return resumeAfterPostAction(nextBase('No eligible empty stores available.'));
      return {
        ...nextBase('Choose an empty store slot to buy.'),
        phase: 'EVENT_PICK_STORE',
        eventStorePrompt: { mode: 'buy_empty', multiplier: 1, forced: false },
      };
    }

    case 'sell_empty_stores': {
      const touched = new Set<string>();
      for (const s of Object.values(shops)) {
        if (!s.ownerId || getShopTotalStock(s) > 0) continue;
        const match =
          eff.scope === 'all' ||
          (eff.scope === 'self' && s.ownerId === active.id) ||
          (eff.scope === 'others' && s.ownerId !== active.id);
        if (!match) continue;
        const payout = Math.floor(computeShopAssetValue(s) * eff.multiplier);
        const oid = s.ownerId;
        players = players.map((p) => (p.id === oid ? { ...p, cash: p.cash + payout } : p));
        shops[s.id] = resetShopSlot(s);
        touched.add(`${s.segmentId}|${oid}`);
      }
      for (const key of touched) {
        const [seg, oid] = key.split('|');
        if (seg && oid) shops = recomputeSegmentChainLevels({ ...state, shops }, seg, oid);
      }
      return resumeAfterPostAction(nextBase('Empty stores liquidated.'));
    }

    case 'close_stores': {
      for (const s of Object.values(shops)) {
        if (!s.ownerId) continue;
        const match =
          eff.scope === 'all' ||
          (eff.scope === 'self' && s.ownerId === active.id) ||
          (eff.scope === 'others' && s.ownerId !== active.id);
        if (match) {
          const extra = s.ownerId === active.id ? 1 : 0;
          shops[s.id] = { ...s, isClosedTurns: Math.max(s.isClosedTurns, eff.rounds + extra) };
        }
      }
      return resumeAfterPostAction(nextBase(card.description));
    }

    case 'close_empty_stores': {
      for (const s of Object.values(shops)) {
        if (s.ownerId && getShopTotalStock(s) === 0) {
          const extra = s.ownerId === active.id ? 1 : 0;
          shops[s.id] = { ...s, isClosedTurns: Math.max(s.isClosedTurns, eff.rounds + extra) };
        }
      }
      return resumeAfterPostAction(nextBase(card.description));
    }

    case 'restock_grade':
    case 'downgrade_stock':
    case 'lose_some_stock': {
      const mode =
        eff.kind === 'restock_grade' ? eff.mode : eff.kind === 'downgrade_stock' ? 'downgrade' : 'lose_some';
      for (const s of Object.values(shops)) {
        if (s.ownerId === active.id) shops[s.id] = { ...s, stock: applyStockTransform(s, mode) };
      }
      return resumeAfterPostAction(nextBase(card.description));
    }

    case 'unlock_dir_next':
      players = players.map((p, i) => (i === state.activePlayerIndex ? { ...p, unlockDirNextTurn: true } : p));
      return resumeAfterPostAction(nextBase('Direction will unlock next turn.'));

    case 'reverse_dir_next':
      players = players.map((p, i) => (i === state.activePlayerIndex ? { ...p, reverseDirNextTurn: true } : p));
      return resumeAfterPostAction(nextBase('Direction will reverse next turn.'));

    case 'roll_again':
      return { ...nextBase('Spin again!'), phase: 'ROLL_PENCIL' };

    case 'draw_another': {
      const drawn = drawThreeEventIds(seed);
      seed = drawn.nextSeed;
      return { ...nextBase('Draw another card!'), eventChoices: drawn.ids, phase: 'EVENT_PICK' };
    }

    case 'go_steps_1_7': {
      const rolled = randomInt(seed, 1, 7);
      seed = rolled.nextSeed;
      return {
        ...nextBase(`Move ${rolled.value} space(s)!`),
        remainingSteps: rolled.value,
        phase: active.horizontalDir === null ? 'CHOOSE_DIRECTION' : 'STEPPING',
      };
    }

    case 'miss_turn':
      players = players.map((p, i) => (i === state.activePlayerIndex ? { ...p, skipNextTurn: true } : p));
      return resumeAfterPostAction(nextBase('Will miss next turn.'));

    case 'chirp_sandals':
      players = players.map((p, i) => (i === state.activePlayerIndex ? { ...p, chirpSandals: true } : p));
      return resumeAfterPostAction(nextBase('Chirp-chirp!'));

    case 'elevator_lock':
      elevatorLock = {
        turnsLeft: eff.rounds * activeCount(state) + 1,
        onlyPlayerId: eff.mode === 'only_self' ? active.id : null,
        blockedPlayerId: eff.mode === 'ban_self' ? active.id : null,
      };
      return resumeAfterPostAction(nextBase(card.description));

    case 'global_sale':
      globalSale = {
        label: card.name,
        priceMultiplier: eff.priceMultiplier,
        turnsLeft: eff.rounds * activeCount(state) + 1,
      };
      return resumeAfterPostAction(nextBase(card.description));
  }
}

export function handleResolveEventStore(
  state: GameState,
  shopId: string,
  storeTypeId?: string
): GameState {
  if (state.phase !== 'EVENT_PICK_STORE' || !state.eventStorePrompt) return state;
  const prompt = state.eventStorePrompt;
  const active = getActivePlayer(state);
  const shop = state.shops[shopId];
  if (!shop) return state;

  if (prompt.mode === 'sell' || prompt.mode === 'lose') {
    if (shop.ownerId !== active.id) return state;
    const payout = prompt.mode === 'sell' ? Math.floor(computeShopAssetValue(shop) * prompt.multiplier) : 0;
    const players: Player[] = state.players.map((p, i) =>
      i === state.activePlayerIndex ? { ...p, cash: p.cash + payout } : p
    );
    const nextShops = recomputeSegmentChainLevels(
      { ...state, shops: { ...state.shops, [shop.id]: resetShopSlot(shop) } },
      shop.segmentId,
      active.id
    );
    const msg = prompt.mode === 'sell' ? `sold store for +$${payout}.` : 'lost a store.';
    return resumeAfterPostAction({
      ...state,
      players,
      shops: nextShops,
      log: appendLog(state, `${active.name} ${msg}`),
    });
  }

  if (prompt.mode === 'buy_empty' && storeTypeId) {
    if (shop.ownerId !== null) return state;
    const payer = prompt.payerId ? state.players.find((p) => p.id === prompt.payerId) : active;
    const ownsSeg =
      !prompt.allowOwnedSegment &&
      Object.values(state.shops).some(
        (s) => s.ownerId === active.id && s.segmentId === shop.segmentId
      );
    const allowed = getAllowedStoreTypeIds(state, active.id, shop.segmentId);
    const def = STORE_TYPES[storeTypeId];
    if (!payer || ownsSeg || !def || !allowed.includes(storeTypeId) || payer.cash < def.baseOpenCost) {
      return state;
    }

    const players = state.players.map((p) =>
      p.id === payer.id ? { ...p, cash: p.cash - def.baseOpenCost } : p
    );
    const claimedShop: Shop = {
      ...shop,
      ownerId: active.id,
      storeTypeId,
      upgradedToL4: false,
      stock: {},
    };
    const nextShops = recomputeSegmentChainLevels(
      { ...state, shops: { ...state.shops, [shop.id]: claimedShop } },
      shop.segmentId,
      active.id
    );
    const leveled = nextShops[shop.id]!;
    nextShops[shop.id] = { ...leveled, stock: buildStarterStock(storeTypeId, leveled.level) };

    const payerNote = payer.id === active.id ? `-$${def.baseOpenCost}` : `paid $${def.baseOpenCost} by ${payer.name}`;
    return resumeAfterPostAction({
      ...state,
      players,
      shops: nextShops,
      log: appendLog(state, `${active.name} opened ${def.name} L${leveled.level} (${payerNote}).`),
    });
  }

  return state;
}

export function handleSkipEventStore(state: GameState): GameState {
  if (state.phase !== 'EVENT_PICK_STORE' || !state.eventStorePrompt || state.eventStorePrompt.forced) {
    return state;
  }
  if (state.eventStorePrompt.fromBank) {
    const active = getActivePlayer(state);
    const refund = state.pendingBankRefundPts;
    const players = state.players.map((p, idx) =>
      idx === state.activePlayerIndex ? { ...p, points: p.points + refund } : p
    );
    return {
      ...state,
      players,
      phase: 'BANK_MENU',
      pendingBankRefundPts: 0,
      eventStorePrompt: null,
      log: appendLog(state, `${active.name} canceled Bank store opening (+${refund} pts refunded).`),
    };
  }
  return resumeAfterPostAction(state);
}

export type { EventCardDef };