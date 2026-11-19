import {
  EVENT_RUBBER_BAND_CONFIG,
  EVENT_WEIGHT_TABLE,
  MONTH_NAMES,
  SEASONAL_EVENT_BY_MONTH,
} from '../config/balance';
import type { EventRubberBandColumn } from '../config/balance';
import { computePlayerNetWorth, getActivePlayer } from './helpers';
import { pickRandom, randomInt } from './rng';
import type { GameState } from './types';

export function formatCalendarDate(month: number, year: number): string {
  return `Year ${year} · ${MONTH_NAMES[month] ?? 'April'}`;
}

export function getSeasonalEventId(month: number): string {
  return SEASONAL_EVENT_BY_MONTH[month] ?? 'eve_085';
}

function resolveTableEventId(id: string, month: number): string {
  return id === 'seasonal' ? getSeasonalEventId(month) : id;
}

/**
 * Exact PS1 rubber-banding column selector (SLUS_013.33 0x8008cc4c..0x8008cd68):
 * Endgame (>=50% target) -> 7; else Year 1 (totalMonths < 12) -> 0;
 * otherwise bucket by net-worth deficit behind the richest active player (1..6).
 */
export function getEventRubberBandColumn(state: GameState): EventRubberBandColumn {
  let maxNetWorth = 0;
  for (const player of state.players) {
    if (!player.isBankrupt) {
      maxNetWorth = Math.max(maxNetWorth, computePlayerNetWorth(state, player.id));
    }
  }

  const activeNetWorth = computePlayerNetWorth(state, getActivePlayer(state).id);
  if (activeNetWorth >= Math.trunc(state.config.targetAssets / 2)) {
    return 7;
  }
  if (state.totalMonths < EVENT_RUBBER_BAND_CONFIG.earlyGameMonths) {
    return 0;
  }

  const deficit = maxNetWorth - activeNetWorth;
  const [b1, b2, b3, b4, b5] = EVENT_RUBBER_BAND_CONFIG.deficitBuckets;
  if (deficit <= b1) return 1;
  if (deficit <= b2) return 2;
  if (deficit <= b3) return 3;
  if (deficit <= b4) return 4;
  if (deficit <= b5) return 5;
  return 6;
}

function selectEventFromColumn(roll: number, col: EventRubberBandColumn, month: number): string {
  for (const row of EVENT_WEIGHT_TABLE) {
    if (roll < row.thresholds[col]) {
      return resolveTableEventId(row.id, month);
    }
  }
  return getSeasonalEventId(month);
}

export function rollWeightedEventId(
  state: GameState,
  seed: number
): { id: string; nextSeed: number } {
  const col = getEventRubberBandColumn(state);
  const { value: roll, nextSeed } = randomInt(seed, 0, EVENT_RUBBER_BAND_CONFIG.rollMax - 1);
  return {
    id: selectEventFromColumn(roll, col, state.month),
    nextSeed,
  };
}

export function drawThreeEventIds(
  state: GameState,
  seed: number
): { ids: string[]; nextSeed: number } {
  const col = getEventRubberBandColumn(state);
  const ids: string[] = [];
  let currentSeed = seed;

  for (let attempt = 0; attempt < 32 && ids.length < 3; attempt++) {
    const { value: roll, nextSeed } = randomInt(currentSeed, 0, EVENT_RUBBER_BAND_CONFIG.rollMax - 1);
    currentSeed = nextSeed;
    const id = selectEventFromColumn(roll, col, state.month);
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }

  if (ids.length < 3) {
    const fallbackPool: string[] = [];
    let prev = 0;
    for (const row of EVENT_WEIGHT_TABLE) {
      const thresh = row.thresholds[col];
      if (thresh > prev) {
        const resolved = resolveTableEventId(row.id, state.month);
        if (!ids.includes(resolved) && !fallbackPool.includes(resolved)) {
          fallbackPool.push(resolved);
        }
      }
      prev = thresh;
    }
    while (ids.length < 3 && fallbackPool.length > 0) {
      const { value, nextSeed } = pickRandom(currentSeed, fallbackPool);
      currentSeed = nextSeed;
      ids.push(value);
      const removeIdx = fallbackPool.indexOf(value);
      if (removeIdx >= 0) fallbackPool.splice(removeIdx, 1);
    }
  }

  return { ids, nextSeed: currentSeed };
}
