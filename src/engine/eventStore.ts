import { STORE_TYPES } from '../config/balance';
import { getPlayerWalkSounds, MAX_WALK_SOUND_LAYERS, WALK_SOUND_META } from '../config/walkSounds';
import type { WalkSoundStyle } from '../config/walkSounds';
import {
  appendLog,
  computeShopAssetValue,
  formatShopRef,
  getActivePlayer,
} from './helpers';
import { bumpMatchStats } from './matchStats';
import {
  buildStarterStock,
  computeOpenShopCost,
  getAllowedStoreTypeIds,
  getShopTotalStock,
  recomputeSegmentChainLevels,
  resumeAfterPostAction,
} from './shops';
import type { GameState, Player, Shop } from './types';

export function resetShopSlot(shop: Shop): Shop {
  return { ...shop, ownerId: null, storeTypeId: null, level: 1, stock: {}, closedWindow: null };
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
      matchStats: bumpMatchStats(state, active.id, { shopsSoldByEvent: 1 }),
      log: appendLog(state, `${active.name} sold ${formatShopRef(state, shop)} for +$${payout}.`),
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
    const { openCost } = computeOpenShopCost(state, shop.id, active.id, storeTypeId);
    if (!payer || ownsSeg || !def || !allowed.includes(storeTypeId) || payer.cash < openCost) {
      return state;
    }

    const players = state.players.map((p) =>
      p.id === payer.id ? { ...p, cash: p.cash - openCost } : p
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

    const payerNote = payer.id === active.id ? `-$${openCost}` : `paid $${openCost} by ${payer.name}`;
    return resumeAfterPostAction({
      ...state,
      players,
      shops: nextShops,
      matchStats: bumpMatchStats(state, active.id, { storesOpened: 1 }),
      log: appendLog(state, `${active.name} opened ${formatShopRef(state, leveled)} L${leveled.level} (${payerNote}).`),
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
      matchStats: refund > 0 ? bumpMatchStats(state, active.id, { bankRewardsRedeemed: -1, pointsSpent: -refund }) : state.matchStats,
      log: appendLog(state, `${active.name} canceled Bank store opening (+${refund} pts refunded).`),
    };
  }
  return resumeAfterPostAction(state);
}

export function handleResolveShoes(
  state: GameState,
  mode: 'keep' | 'stack' | 'replace' | 'clear',
  style?: WalkSoundStyle,
  slotIndex?: number
): GameState {
  if (state.phase !== 'EVENT_SHOES_CHOICE') return state;
  const active = getActivePlayer(state);
  const current = getPlayerWalkSounds(active);

  if (mode === 'keep') {
    return resumeAfterPostAction({
      ...state,
      log: appendLog(state, `${active.name} kept current novelty shoes.`),
    });
  }

  let nextSounds: WalkSoundStyle[];
  let note: string;
  if (mode === 'clear') {
    nextSounds = [];
    note = `${active.name} took off all novelty shoes.`;
  } else if (mode === 'stack') {
    if (!style || current.length >= MAX_WALK_SOUND_LAYERS) return state;
    nextSounds = [...current, style];
    note = `${active.name} stacked ${WALK_SOUND_META[style].label} (Layer ${nextSounds.length}).`;
  } else {
    if (!style || slotIndex === undefined || slotIndex < 0 || slotIndex >= current.length) return state;
    nextSounds = current.map((s, idx) => (idx === slotIndex ? style : s));
    note = `${active.name} swapped Layer ${slotIndex + 1} to ${WALK_SOUND_META[style].label}.`;
  }

  const players = state.players.map((p, idx) =>
    idx === state.activePlayerIndex
      ? {
          ...p,
          chirpSandals: nextSounds.length > 0,
          equippedWalkSound: nextSounds[nextSounds.length - 1],
          equippedWalkSounds: nextSounds,
        }
      : p
  );
  return resumeAfterPostAction({
    ...state,
    players,
    matchStats:
      mode === 'stack' || mode === 'replace'
        ? bumpMatchStats(state, active.id, { shoesPutOn: 1 })
        : state.matchStats,
    log: appendLog(state, note),
  });
}
