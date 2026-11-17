import type { MatchConfig, PencilFace } from '../engine/types';

export { BANK_REWARDS } from './bankRewards';
export { STORE_TYPES } from './stores';
export { EVENT_CARDS } from './events';

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
  baseSalary: 250,
  assetRate: 0.04,
  stepBonus: 15,
  landMultiplier: 1.5,
} as const;

export const SHOP_RULES = {
  maxItemsPerVisit: 2,
  buyoutMultiplier: 1.25,
  sellLiquidationRate: 0.75,
  pointsPerPurchaseMin: 1,
  pointsPerPurchaseMax: 2,
} as const;

export const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];