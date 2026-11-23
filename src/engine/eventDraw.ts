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

function collectColumnPool(col: EventRubberBandColumn, month: number, excluding: string[]): string[] {
  const pool: string[] = [];
  let prev = 0;
  for (const row of EVENT_WEIGHT_TABLE) {
    const thresh = row.thresholds[col];
    if (thresh > prev) {
      const resolved = resolveTableEventId(row.id, month);
      if (!excluding.includes(resolved) && !pool.includes(resolved)) {
        pool.push(resolved);
      }
    }
    prev = thresh;
  }
  return pool;
}

function drawDistinctFromColumn(
  col: EventRubberBandColumn,
  month: number,
  existing: string[],
  startSeed: number
): { id: string; nextSeed: number } {
  let currentSeed = startSeed;
  for (let attempt = 0; attempt < 32; attempt++) {
    const { value: roll, nextSeed } = randomInt(currentSeed, 0, EVENT_RUBBER_BAND_CONFIG.rollMax - 1);
    currentSeed = nextSeed;
    const id = selectEventFromColumn(roll, col, month);
    if (!existing.includes(id)) {
      return { id, nextSeed: currentSeed };
    }
  }

  let fallbackPool = collectColumnPool(col, month, existing);
  if (fallbackPool.length === 0) {
    fallbackPool = collectColumnPool(1, month, existing);
  }
  if (fallbackPool.length > 0) {
    const picked = pickRandom(currentSeed, fallbackPool);
    return { id: picked.value, nextSeed: picked.nextSeed };
  }
  return { id: getSeasonalEventId(month), nextSeed: currentSeed };
}

export function drawThreeEventIds(
  state: GameState,
  seed: number
): { ids: string[]; nextSeed: number } {
  const col = getEventRubberBandColumn(state);
  const ids: string[] = [];
  let currentSeed = seed;

  for (let k = 0; k < 3; k++) {
    const drawn = drawDistinctFromColumn(col, state.month, ids, currentSeed);
    currentSeed = drawn.nextSeed;
    ids.push(drawn.id);
  }

  for (let i = ids.length - 1; i > 0; i--) {
    const { value: j, nextSeed } = randomInt(currentSeed, 0, i);
    currentSeed = nextSeed;
    const tmp = ids[i]!;
    ids[i] = ids[j]!;
    ids[j] = tmp;
  }

  return { ids, nextSeed: currentSeed };
}
