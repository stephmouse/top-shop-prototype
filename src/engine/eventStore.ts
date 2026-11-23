import { STORE_TYPES } from '../config/balance';
import {
  appendLog,
  computeShopAssetValue,
  getActivePlayer,
} from './helpers';
import {
  buildStarterStock,
  getAllowedStoreTypeIds,
  getShopTotalStock,
  recomputeSegmentChainLevels,
  resumeAfterPostAction,
} from './shops';
import type { GameState, Player, Shop } from './types';

export function resetShopSlot(shop: Shop): Shop {
  return { ...shop, ownerId: null, storeTypeId: null, level: 1, stock: {}, isClosedTurns: 0 };
}

export function applyStockTransform(
  shop: Shop,
  mode: 'second_cheapest_two' | 'dearest_one' | 'downgrade'
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

  const total = getShopTotalStock(shop);
  const cheapest = sorted[0];
  return total > 0 && cheapest ? { [cheapest.id]: total } : {};
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

  if (prompt.mode === 'sell') {
    if (shop.ownerId !== active.id) return state;
    const payout = Math.floor(computeShopAssetValue(shop) * prompt.multiplier);
    const players: Player[] = state.players.map((p, i) =>
      i === state.activePlayerIndex ? { ...p, cash: p.cash + payout } : p
    );
    const nextShops = recomputeSegmentChainLevels(
      { ...state, shops: { ...state.shops, [shop.id]: resetShopSlot(shop) } },
      shop.segmentId,
      active.id
    );
    return resumeAfterPostAction({
      ...state,
      players,
      shops: nextShops,
      log: appendLog(state, `${active.name} sold store for +$${payout}.`),
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

export function handleRevealEventCard(state: GameState, slotIndex: number): GameState {
  if (state.phase !== 'EVENT_PICK') return state;
  if ((state.revealedEventSlot ?? null) !== null) return state;
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= state.eventChoices.length) {
    return state;
  }
  return {
    ...state,
    revealedEventSlot: slotIndex,
  };
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
