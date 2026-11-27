import { computePlayerNetWorth } from './helpers';
import type { GameState, Player } from './types';

export type WinReason = 'target_assets' | 'bankruptcy' | 'bank_99_points';

export interface AssetHistorySnapshot {
  totalMonths: number;
  netWorthByPlayer: Record<string, number>;
  isFinal?: boolean;
}

export interface PlayerMatchStats {
  peakNetWorth: number;
  salesRevenue: number;
  itemsSold: number;
  shoppingSpent: number;
  itemsBought: number;
  cashbackCount: number;
  cashbackTotal: number;
  itemsDelivered: number;
  deliverySpent: number;
  storesOpened: number;
  buyoutsMade: number;
  timesBoughtOut: number;
  rivalShopsClosed: number;
  shopsClosedByRivals: number;
  shopsStolen: number;
  shopsLostToTheft: number;
  shopsSoldByEvent: number;
  shopsLiquidated: number;
  liquidationValueLost: number;
  stepsTaken: number;
  escalatorsRidden: number;
  elevatorsRidden: number;
  pencilRolls: number;
  eventRolls: number;
  exactBankLandings: number;
  paydayTotal: number;
  bankRewardsRedeemed: number;
  pointsSpent: number;
  pointsFromBank: number;
  pointsFromShopping: number;
  pointsFromEvents: number;
  eventsDrawn: number;
  eventMisses: number;
  shoesPutOn: number;
}

export function createEmptyPlayerMatchStats(startingCash = 0): PlayerMatchStats {
  return {
    peakNetWorth: startingCash,
    salesRevenue: 0,
    itemsSold: 0,
    shoppingSpent: 0,
    itemsBought: 0,
    cashbackCount: 0,
    cashbackTotal: 0,
    itemsDelivered: 0,
    deliverySpent: 0,
    storesOpened: 0,
    buyoutsMade: 0,
    timesBoughtOut: 0,
    rivalShopsClosed: 0,
    shopsClosedByRivals: 0,
    shopsStolen: 0,
    shopsLostToTheft: 0,
    shopsSoldByEvent: 0,
    shopsLiquidated: 0,
    liquidationValueLost: 0,
    stepsTaken: 0,
    escalatorsRidden: 0,
    elevatorsRidden: 0,
    pencilRolls: 0,
    eventRolls: 0,
    exactBankLandings: 0,
    paydayTotal: 0,
    bankRewardsRedeemed: 0,
    pointsSpent: 0,
    pointsFromBank: 0,
    pointsFromShopping: 0,
    pointsFromEvents: 0,
    eventsDrawn: 0,
    eventMisses: 0,
    shoesPutOn: 0,
  };
}

export function createInitialMatchStats(players: Player[]): Record<string, Partial<PlayerMatchStats>> {
  const result: Record<string, Partial<PlayerMatchStats>> = {};
  for (const player of players) {
    result[player.id] = player.cash !== 0 ? { peakNetWorth: player.cash } : {};
  }
  return result;
}

export function getPlayerMatchStats(state: GameState, playerId: string): PlayerMatchStats {
  const base = createEmptyPlayerMatchStats(0);
  const stored = state.matchStats?.[playerId];
  return stored ? { ...base, ...stored } : base;
}

function compactStats(full: PlayerMatchStats): Partial<PlayerMatchStats> {
  const out: Partial<PlayerMatchStats> = {};
  for (const key of Object.keys(full) as Array<keyof PlayerMatchStats>) {
    if (full[key] !== 0) out[key] = full[key];
  }
  return out;
}

function applyStatDeltas(current: PlayerMatchStats, deltas: Partial<PlayerMatchStats>): Partial<PlayerMatchStats> {
  const next: PlayerMatchStats = { ...current };
  for (const key of Object.keys(deltas) as Array<keyof PlayerMatchStats>) {
    const delta = deltas[key];
    if (delta === undefined || delta === 0) continue;
    if (key === 'peakNetWorth') {
      next.peakNetWorth = Math.max(current.peakNetWorth, delta);
    } else {
      next[key] = Math.max(0, current[key] + delta);
    }
  }
  return compactStats(next);
}

export function bumpMultiPlayerMatchStats(
  state: GameState,
  updates: Array<[string, Partial<PlayerMatchStats>]>
): Record<string, Partial<PlayerMatchStats>> {
  const base: Record<string, Partial<PlayerMatchStats>> = { ...(state.matchStats ?? {}) };
  for (const [playerId, deltas] of updates) {
    const current = getPlayerMatchStats({ ...state, matchStats: base }, playerId);
    base[playerId] = applyStatDeltas(current, deltas);
  }
  return base;
}

export function bumpMatchStats(
  state: GameState,
  playerId: string,
  deltas: Partial<PlayerMatchStats>
): Record<string, Partial<PlayerMatchStats>> {
  return bumpMultiPlayerMatchStats(state, [[playerId, deltas]]);
}

export function buildAssetSnapshot(state: GameState, isFinal = false): AssetHistorySnapshot {
  const netWorthByPlayer: Record<string, number> = {};
  for (const player of state.players) {
    netWorthByPlayer[player.id] = computePlayerNetWorth(state, player.id);
  }
  return isFinal
    ? { totalMonths: state.totalMonths, netWorthByPlayer, isFinal: true }
    : { totalMonths: state.totalMonths, netWorthByPlayer };
}

export function recordAssetSnapshot(state: GameState, isFinal = false): AssetHistorySnapshot[] {
  const history = [...(state.assetHistory ?? [])];
  const snap = buildAssetSnapshot(state, isFinal);
  const last = history[history.length - 1];
  if (isFinal) {
    if (last?.isFinal) history[history.length - 1] = snap;
    else history.push(snap);
    return history;
  }
  if (last && !last.isFinal && last.totalMonths === snap.totalMonths) {
    history[history.length - 1] = snap;
  } else {
    history.push(snap);
  }
  return history;
}

export function syncPeakNetWorth(state: GameState): GameState {
  let nextStats: Record<string, Partial<PlayerMatchStats>> | null = null;
  for (const player of state.players) {
    const nw = computePlayerNetWorth(state, player.id);
    const cur = getPlayerMatchStats(state, player.id);
    if (nw > cur.peakNetWorth) {
      nextStats ??= { ...(state.matchStats ?? {}) };
      nextStats[player.id] = compactStats({ ...cur, peakNetWorth: nw });
    }
  }
  return nextStats ? { ...state, matchStats: nextStats } : state;
}
