import { EVENT_CARDS, STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import { appendLog, clampPoints, computePlayerNetWorth, formatShopRef, formatTileCoord, getActivePlayer } from '../engine/helpers';
import { recordAssetSnapshot, syncPeakNetWorth } from '../engine/matchStats';
import type { PlayerMatchStats, WinReason } from '../engine/matchStats';
import { buildStarterStock, recomputeSegmentChainLevels } from '../engine/shops';
import { createTimedWindow } from '../engine/timedEffects';
import { advanceToNextTurn } from '../engine/turn';
import type { GameState, Shop } from '../engine/types';

export interface DebugPlayerPatch {
  cashDelta?: number;
  setCash?: number;
  pointsDelta?: number;
  setPoints?: number;
  tileId?: string;
  toggleBankrupt?: boolean;
  toggleDoublePayday?: boolean;
}

export type DebugShopOp =
  | { kind: 'clear' | 'empty_stock' | 'fill_cheap' | 'fill_costly' | 'toggle_closed' }
  | { kind: 'assign'; ownerId: string; storeTypeId: string };

/** Mutates a player's cash, points, tile, or flags for local/host debugging. */
export function debugAdjustPlayer(state: GameState, playerId: string, patch: DebugPlayerPatch): GameState {
  const target = state.players.find((p) => p.id === playerId);
  if (!target) return state;

  const tile = patch.tileId ? state.tiles[patch.tileId] : undefined;
  const players = state.players.map((p) => {
    if (p.id !== playerId) return p;
    const cash =
      patch.setCash !== undefined
        ? patch.setCash
        : patch.cashDelta !== undefined
          ? p.cash + patch.cashDelta
          : p.cash;
    const points =
      patch.setPoints !== undefined
        ? clampPoints(patch.setPoints)
        : patch.pointsDelta !== undefined
          ? clampPoints(p.points + patch.pointsDelta)
          : p.points;
    const nextBankrupt = patch.toggleBankrupt ? !p.isBankrupt : p.isBankrupt;
    return {
      ...p,
      cash,
      points,
      ...(tile ? { tileId: tile.id, horizontalDir: null, verticalDir: null } : {}),
      ...(patch.toggleBankrupt
        ? { isBankrupt: nextBankrupt, bankruptTurn: nextBankrupt ? state.turnNumber : undefined }
        : {}),
      ...(patch.toggleDoublePayday ? { doubleNextPayday: !p.doubleNextPayday } : {}),
    };
  });

  const note = tile ? `teleported to ${formatTileCoord(tile)}` : 'updated player stats';
  return syncPeakNetWorth({
    ...state,
    players,
    log: appendLog(state, `[DEBUG] ${target.name}: ${note}.`),
  });
}

/** Jumps directly into BANK_MENU for the active player. */
export function debugOpenBankMenu(state: GameState): GameState {
  const active = getActivePlayer(state);
  return {
    ...state,
    phase: 'BANK_MENU',
    moveHistory: [],
    hadBranchChoiceThisTurn: false,
    pendingUndoSnapshot: null,
    pendingPostBankPhase: null,
    pendingBankRefundPts: 0,
    log: appendLog(state, `[DEBUG] Opened Bank Menu for ${active.name}.`),
  };
}

/** Opens EVENT_PICK immediately with the requested Event card revealed in slot 0. */
export function debugTriggerEventCard(state: GameState, cardId: string): GameState {
  const card = EVENT_CARDS.find((c) => c.id === cardId) ?? EVENT_CARDS[0]!;
  const decoys = EVENT_CARDS.filter((c) => c.id !== card.id).slice(0, 2).map((c) => c.id);
  return {
    ...state,
    phase: 'EVENT_PICK',
    eventChoices: [card.id, ...decoys],
    revealedEventSlot: 0,
    eventStorePrompt: null,
    moveHistory: [],
    hadBranchChoiceThisTurn: false,
    pendingUndoSnapshot: null,
    log: appendLog(state, `[DEBUG] Triggered event "${card.name}".`),
  };
}

/** Advances immediately to the next player's turn via the normal turn boundary logic. */
export function debugAdvanceTurn(state: GameState): GameState {
  if (state.phase === 'GAME_OVER') return state;
  return syncPeakNetWorth(advanceToNextTurn(state));
}

/** Advances turns until totalMonths increments (or match ends). */
export function debugAdvanceMonth(state: GameState): GameState {
  if (state.phase === 'GAME_OVER') return state;
  const startMonths = state.totalMonths;
  let cur = state;
  const limit = cur.players.length + 2;
  for (let i = 0; i < limit && cur.totalMonths === startMonths && cur.phase !== 'GAME_OVER'; i++) {
    cur = advanceToNextTurn(cur);
  }
  return syncPeakNetWorth(cur);
}

/** Edits any shop slot's owner, store type, stock level, or closure state. */
export function debugMutateShop(state: GameState, shopId: string, op: DebugShopOp): GameState {
  const shop = state.shops[shopId];
  if (!shop) return state;
  const active = getActivePlayer(state);

  if (op.kind === 'clear') {
    const prevOwner = shop.ownerId;
    const cleared: Shop = { ...shop, ownerId: null, storeTypeId: null, level: 1, stock: {}, closedWindow: null };
    let nextShops: Record<string, Shop> = { ...state.shops, [shopId]: cleared };
    if (prevOwner) {
      nextShops = recomputeSegmentChainLevels({ ...state, shops: nextShops }, shop.segmentId, prevOwner);
    }
    return { ...state, shops: nextShops, log: appendLog(state, `[DEBUG] Cleared ${formatShopRef(state, shop)}.`) };
  }

  if (op.kind === 'empty_stock') {
    return {
      ...state,
      shops: { ...state.shops, [shopId]: { ...shop, stock: {} } },
      log: appendLog(state, `[DEBUG] Emptied stock of ${formatShopRef(state, shop)}.`),
    };
  }

  if (op.kind === 'toggle_closed') {
    const nextClosed = shop.closedWindow ? null : createTimedWindow(state, 2, active.id);
    return {
      ...state,
      shops: { ...state.shops, [shopId]: { ...shop, closedWindow: nextClosed } },
      log: appendLog(state, `[DEBUG] ${nextClosed ? 'Closed' : 'Reopened'} ${formatShopRef(state, shop)}.`),
    };
  }

  if (op.kind === 'fill_cheap' || op.kind === 'fill_costly') {
    if (!shop.storeTypeId) return state;
    const def = STORE_TYPES[shop.storeTypeId];
    if (!def) return state;
    const sorted = [...def.items].filter((i) => i.tier <= shop.level).sort((a, b) => a.retailPrice - b.retailPrice);
    const chosen = op.kind === 'fill_cheap' ? sorted[0] : sorted[sorted.length - 1];
    if (!chosen) return state;
    const cap = STORE_CAPACITY_BY_LEVEL[shop.level];
    const nextShops = { ...state.shops, [shopId]: { ...shop, stock: { [chosen.id]: cap } } };
    return syncPeakNetWorth({
      ...state,
      shops: nextShops,
      log: appendLog(state, `[DEBUG] Filled ${formatShopRef(state, shop)} with ${cap}x ${chosen.name}.`),
    });
  }

  if (op.kind !== 'assign') return state;
  // Assign owner & store type
  if (!state.players.some((p) => p.id === op.ownerId) || !STORE_TYPES[op.storeTypeId]) return state;
  const prevOwner = shop.ownerId;
  const assigned: Shop = { ...shop, ownerId: op.ownerId, storeTypeId: op.storeTypeId, stock: {}, closedWindow: null };
  let nextShops: Record<string, Shop> = { ...state.shops, [shopId]: assigned };
  if (prevOwner && prevOwner !== op.ownerId) {
    nextShops = recomputeSegmentChainLevels({ ...state, shops: nextShops }, shop.segmentId, prevOwner);
  }
  nextShops = recomputeSegmentChainLevels({ ...state, shops: nextShops }, shop.segmentId, op.ownerId);
  const leveled = nextShops[shopId]!;
  nextShops[shopId] = { ...leveled, stock: buildStarterStock(op.storeTypeId, leveled.level) };
  return syncPeakNetWorth({
    ...state,
    shops: nextShops,
    log: appendLog(state, `[DEBUG] Assigned ${formatShopRef({ ...state, shops: nextShops }, nextShops[shopId]!)} to ${op.ownerId}.`),
  });
}

/** Populates realistic monthly assetHistory + varied per-player stats for Victory UI testing. */
export function debugSeedSampleStats(state: GameState, months = 8): GameState {
  const startCash = state.config.startingCash;
  const history: Array<{ totalMonths: number; netWorthByPlayer: Record<string, number>; isFinal?: boolean }> = [];
  for (let m = 0; m <= months; m++) {
    const netWorthByPlayer: Record<string, number> = {};
    state.players.forEach((p, idx) => {
      const slope = 900 + idx * 320;
      const wave = Math.round(Math.sin((m + idx * 1.4) * 0.9) * 650);
      netWorthByPlayer[p.id] = Math.max(200, Math.round(startCash + m * slope + wave));
    });
    history.push({ totalMonths: m, netWorthByPlayer });
  }

  const finalSnap = history[history.length - 1]!.netWorthByPlayer;
  const players = state.players.map((p, idx) => ({
    ...p,
    cash: finalSnap[p.id] ?? p.cash,
    bankVisits: 2 + ((idx * 2) % 5),
    points: Math.min(99, 6 + idx * 5),
  }));

  const stats: Record<string, Partial<PlayerMatchStats>> = {};
  state.players.forEach((p, i) => {
    const fin = finalSnap[p.id] ?? startCash;
    stats[p.id] = {
      peakNetWorth: fin + (i === state.players.length - 1 ? 1800 : 250),
      salesRevenue: 640 + i * 480,
      itemsSold: 2 + i * 2,
      shoppingSpent: 420 + ((i + 1) % state.players.length) * 390,
      itemsBought: 2 + i,
      cashbackCount: i === 0 ? 2 : i % 2,
      cashbackTotal: i === 0 ? 520 : i % 2 ? 240 : 0,
      itemsDelivered: 3 + i * 2,
      deliverySpent: 380 + i * 260,
      storesOpened: 2 + i,
      buyoutsMade: i % 2,
      timesBoughtOut: (i + 1) % 2,
      rivalShopsClosed: i === 1 ? 1 : 0,
      shopsClosedByRivals: i === 0 ? 1 : 0,
      shopsStolen: i === 0 ? 1 : 0,
      shopsLostToTheft: i === 1 ? 1 : 0,
      shopsSoldByEvent: i % 3 === 0 ? 1 : 0,
      shopsLiquidated: i === state.players.length - 1 ? 1 : 0,
      liquidationValueLost: i === state.players.length - 1 ? 450 : 0,
      stepsTaken: 34 + i * 9,
      escalatorsRidden: 4 + i * 2,
      elevatorsRidden: 1 + (i % 3),
      pencilRolls: 8 + months,
      eventRolls: 2 + (i % 3),
      exactBankLandings: 1 + (i % 2),
      paydayTotal: 1850 + i * 420,
      bankRewardsRedeemed: 2 + (i % 3),
      pointsSpent: 8 + i * 6,
      pointsFromBank: 3 + i,
      pointsFromShopping: 5 + i * 2,
      pointsFromEvents: 4 + i,
      eventsDrawn: 2 + (i % 3),
      eventMisses: i % 2,
      shoesPutOn: i === 0 ? 3 : 1,
    };
  });

  const nextTotalMonths = Math.max(state.totalMonths, months);
  return syncPeakNetWorth({
    ...state,
    totalMonths: nextTotalMonths,
    month: nextTotalMonths % 12,
    year: Math.floor(nextTotalMonths / 12) + 1,
    turnNumber: Math.max(state.turnNumber, months * state.players.length + 1),
    players,
    assetHistory: history,
    matchStats: stats,
    log: appendLog(state, `[DEBUG] Seeded ${months} months of sample stats & asset history.`),
  });
}

/** Transitions cleanly into GAME_OVER to preview Victory Modal, fanfare, chart & awards. */
export function debugTriggerVictory(state: GameState, reason: WinReason, winnerId: string): GameState {
  const winner = state.players.find((p) => p.id === winnerId) ?? getActivePlayer(state);
  const currentNw = computePlayerNetWorth(state, winner.id);
  const players = state.players.map((p) => {
    if (p.id === winner.id) {
      const cash =
        reason === 'target_assets' && currentNw < state.config.targetAssets
          ? p.cash + (state.config.targetAssets - currentNw) + 400
          : p.cash;
      return {
        ...p,
        isBankrupt: false,
        bankruptTurn: undefined,
        cash,
        points: reason === 'bank_99_points' ? 99 : p.points,
      };
    }
    return reason === 'bankruptcy'
      ? { ...p, isBankrupt: true, bankruptTurn: p.bankruptTurn ?? state.turnNumber }
      : p;
  });

  const wonState: GameState = {
    ...state,
    players,
    phase: 'GAME_OVER',
    winnerId: winner.id,
    winnerIds: [winner.id],
    winReason: reason,
    moveHistory: [],
    hadBranchChoiceThisTurn: false,
    pendingUndoSnapshot: null,
    log: appendLog(state, `[DEBUG] ${winner.name} wins (${reason})!`),
  };

  return syncPeakNetWorth({
    ...wonState,
    assetHistory: recordAssetSnapshot(wonState, true),
  });
}
