import { EVENT_CARDS, STORE_TYPES } from '../config/balance';
import { drawThreeEventIds } from './eventDraw';
import { applyStockTransform, resetShopSlot } from './eventStore';
import {
  appendLog,
  clampPoints,
  computeShopAssetValue,
  getActivePlayer,
} from './helpers';
import { randomInt } from './rng';
import {
  getAllowedStoreTypeIds,
  getShopTotalStock,
  recomputeSegmentChainLevels,
  resumeAfterPostAction,
} from './shops';
import type { EventCardDef, GameState } from './types';

export { handleResolveEventStore, handleRevealEventCard, handleSkipEventStore } from './eventStore';
export type { EventCardDef };

export function computeEventBaseCash(totalMonths: number): number {
  return (Math.floor(Math.max(0, totalMonths) / 24) + 1) * 100;
}

function activeCount(state: GameState): number {
  return Math.max(1, state.players.filter((p) => !p.isBankrupt).length);
}

export function handlePickEventCard(state: GameState, cardId: string): GameState {
  if (state.phase !== 'EVENT_PICK' || !state.eventChoices.includes(cardId)) return state;
  const revealed = state.revealedEventSlot ?? null;
  if (revealed === null || state.eventChoices[revealed] !== cardId) return state;
  const card = EVENT_CARDS.find((c) => c.id === cardId);
  if (!card) return state;

  const active = getActivePlayer(state);
  let seed = state.seed;
  let ptsAwarded = 0;
  if (card.awardsPoints) {
    const ptsRoll = randomInt(seed, 1, 3);
    seed = ptsRoll.nextSeed;
    ptsAwarded = ptsRoll.value;
  }

  let players = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, points: clampPoints(p.points + ptsAwarded) } : p
  );
  let shops = { ...state.shops };
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
    revealedEventSlot: null,
    hadBranchChoiceThisTurn: false,
    moveHistory: [],
    pendingUndoSnapshot: null,
    log: appendLog(state, `${active.name}: ${card.name} (+${ptsAwarded} pts). ${logMsg}`),
  });

  const eff = card.effect;
  switch (eff.kind) {
    case 'nothing':
      return resumeAfterPostAction(nextBase(card.description));

    case 'cash_gift_scaled': {
      const amt = Math.floor(computeEventBaseCash(state.totalMonths) * eff.baseMultiplier);
      players = players.map((p, i) => (i === state.activePlayerIndex ? { ...p, cash: p.cash + amt } : p));
      return resumeAfterPostAction(nextBase(`+$${amt}.`));
    }

    case 'pay_each_rival_scaled': {
      const amt = Math.floor(computeEventBaseCash(state.totalMonths) * eff.baseMultiplier);
      const rivals = players.filter((p) => p.id !== active.id && !p.isBankrupt).length;
      players = players.map((p) => {
        if (p.id === active.id) return { ...p, cash: p.cash - amt * rivals };
        return p.isBankrupt ? p : { ...p, cash: p.cash + amt };
      });
      return resumeAfterPostAction(nextBase(`Paid $${amt} to each rival.`));
    }

    case 'collect_each_rival_scaled': {
      const amt = Math.floor(computeEventBaseCash(state.totalMonths) * eff.baseMultiplier);
      const rivals = players.filter((p) => p.id !== active.id && !p.isBankrupt).length;
      players = players.map((p) => {
        if (p.id === active.id) return { ...p, cash: p.cash + amt * rivals };
        return p.isBankrupt ? p : { ...p, cash: p.cash - amt };
      });
      return resumeAfterPostAction(nextBase(`Collected $${amt} from each rival.`));
    }

    case 'drop_cash_scaled': {
      const amt = Math.floor(computeEventBaseCash(state.totalMonths) * eff.baseMultiplier);
      players = players.map((p, i) => (i === state.activePlayerIndex ? { ...p, cash: p.cash - amt } : p));
      return resumeAfterPostAction(nextBase(`Dropped $${amt}.`));
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

    case 'restock_grade':
    case 'downgrade_stock': {
      const mode = eff.kind === 'restock_grade' ? eff.mode : 'downgrade';
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
      const drawn = drawThreeEventIds(state, seed);
      seed = drawn.nextSeed;
      return {
        ...nextBase('Draw another card!'),
        eventChoices: drawn.ids,
        revealedEventSlot: null,
        phase: 'EVENT_PICK',
      };
    }

    case 'go_steps':
      return {
        ...nextBase(`Move ${eff.steps} space(s)!`),
        remainingSteps: eff.steps,
        phase: active.horizontalDir === null ? 'CHOOSE_DIRECTION' : 'STEPPING',
      };

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
