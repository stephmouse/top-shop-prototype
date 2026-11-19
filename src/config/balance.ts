import type { MatchConfig, PencilFace } from '../engine/types';

export { BANK_REWARDS } from './bankRewards';
export { STORE_TYPES } from './stores';
export { EVENT_CARDS } from './events';
export {
  EVENT_RUBBER_BAND_CONFIG,
  EVENT_RUBBER_BAND_LABELS,
  EVENT_WEIGHT_TABLE,
  MONTH_NAMES,
  SEASONAL_EVENT_BY_MONTH,
} from './eventTables';
export type { EventRubberBandColumn, EventWeightRow } from './eventTables';

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  targetAssets: 10000,
  startingCash: 3000,
  bankruptLimit: 1,
  finishRoundOnWin: false,
};

export const PENCIL_FACES: readonly PencilFace[] = [1, 2, 3, 4, 5, 6, 7, 8, 'E'];

export const STORE_CAPACITY_BY_LEVEL: Record<1 | 2 | 3 | 4, number> = {
  1: 3,
  2: 4,
  3: 5,
  4: 6,
};

export const PAYDAY_CONFIG = {
  visitSalaryStep: 100,
  assetDivisor: 10,
  referenceLapSteps: 36,
  minStepPercent: 25,
  lapStepPercent: 75,
  landMultiplierNumerator: 3,
  landMultiplierDenominator: 2,
} as const;

export const SHOP_RULES = {
  maxItemsPerVisit: 2,
  buyoutLevelMultipliers: { 1: 1.5, 2: 2.0, 3: 2.5, 4: 3.0 } as Record<1 | 2 | 3 | 4, number>,
  sellLiquidationRate: 0.75,
  pointsAwardChance: 0.65,
  pointsPriceDivisor: 200,
  maxPoints: 99,
} as const;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];