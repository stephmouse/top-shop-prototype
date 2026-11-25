import { MAX_PLAYERS, MIN_PLAYERS } from '../config/balance';
import { OFFICIAL_STAGES } from '../config/maps';
import type { GameState } from '../engine/types';

export const SAVE_SCHEMA_VERSION = 2;

export interface SavedMatchEnvelope {
  schemaVersion: number;
  savedAt: string;
  state: GameState;
}

export interface AutoSavedMatchEnvelope {
  schemaVersion: number;
  state: GameState;
}

const VALID_TURN_PHASES: ReadonlySet<string> = new Set([
  'ROLL_PENCIL',
  'CHOOSE_DIRECTION',
  'STEPPING',
  'ESCALATOR_RIDE',
  'ESCALATOR_UNDO',
  'EVENT_PICK',
  'EVENT_PICK_STORE',
  'BANK_MENU',
  'SHOP_BUY_RIVAL',
  'SHOP_BUY_SLOT',
  'SHOP_DELIVER',
  'ELEVATOR_PROMPT',
  'LIQUIDATE_ASSETS',
  'GAME_OVER',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidTimedWindow(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.castAt) &&
    value.castAt >= 0 &&
    isFiniteNumber(value.expiresAt) &&
    value.expiresAt >= value.castAt &&
    typeof value.casterId === 'string'
  );
}

function isValidNullableTimedWindow(value: unknown): boolean {
  return value === null || isValidTimedWindow(value);
}

function isValidPlayer(p: unknown, tilesObj: Record<string, unknown>): boolean {
  if (!isRecord(p)) return false;
  if (typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.color !== 'string') return false;
  if (!isFiniteNumber(p.cash) || !isFiniteNumber(p.points)) return false;
  if (typeof p.tileId !== 'string' || !Object.prototype.hasOwnProperty.call(tilesObj, p.tileId)) return false;
  if (typeof p.isBankrupt !== 'boolean' || typeof p.isBot !== 'boolean') return false;
  if (!isFiniteNumber(p.stepsSincePayday) || !isFiniteNumber(p.bankVisits)) return false;
  if (typeof p.pencilMode !== 'string') return false;
  if (typeof p.reverseDirNextTurn !== 'boolean' || typeof p.unlockDirNextTurn !== 'boolean') return false;
  if (
    !isValidNullableTimedWindow(p.blockDeliveryWindow) ||
    !isValidNullableTimedWindow(p.blockNewStoreWindow) ||
    !isValidNullableTimedWindow(p.pencilWindow) ||
    !isValidNullableTimedWindow(p.doublePriceWindow)
  ) {
    return false;
  }
  return true;
}

function isValidShop(s: unknown, tilesObj: Record<string, unknown>): boolean {
  if (!isRecord(s)) return false;
  if (typeof s.id !== 'string' || typeof s.segmentId !== 'string') return false;
  if (typeof s.tileId !== 'string' || !Object.prototype.hasOwnProperty.call(tilesObj, s.tileId)) return false;
  if (typeof s.level !== 'number' || !Number.isInteger(s.level) || s.level < 1 || s.level > 4) return false;
  if (!isRecord(s.stock)) return false;
  if (!Object.values(s.stock).every((qty) => isFiniteNumber(qty) && qty >= 0)) return false;
  if (!isValidNullableTimedWindow(s.closedWindow)) return false;
  return true;
}

/** Validates persisted or imported GameState shape before trusting it in the UI. */
export function isValidGameState(raw: unknown): raw is GameState {
  if (!isRecord(raw)) return false;
  if (!isFiniteNumber(raw.seed)) return false;
  if (typeof raw.mapId !== 'string' || !OFFICIAL_STAGES.some((s) => s.id === raw.mapId)) return false;
  if (!isFiniteNumber(raw.turnNumber) || raw.turnNumber < 1) return false;
  if (!isFiniteNumber(raw.month) || !isFiniteNumber(raw.year) || !isFiniteNumber(raw.totalMonths)) return false;
  if (typeof raw.phase !== 'string' || !VALID_TURN_PHASES.has(raw.phase)) return false;
  if (!isFiniteNumber(raw.remainingSteps) || raw.remainingSteps < 0) return false;
  if (!isFiniteNumber(raw.pendingBankRefundPts) || raw.pendingBankRefundPts < 0) return false;

  if (!Array.isArray(raw.players) || raw.players.length < MIN_PLAYERS || raw.players.length > MAX_PLAYERS) {
    return false;
  }
  const playerCount = raw.players.length;
  if (
    typeof raw.roundStartPlayerIndex !== 'number' ||
    !Number.isInteger(raw.roundStartPlayerIndex) ||
    raw.roundStartPlayerIndex < 0 ||
    raw.roundStartPlayerIndex >= playerCount
  ) {
    return false;
  }
  if (
    typeof raw.activePlayerIndex !== 'number' ||
    !Number.isInteger(raw.activePlayerIndex) ||
    raw.activePlayerIndex < 0 ||
    raw.activePlayerIndex >= playerCount
  ) {
    return false;
  }

  if (
    !isRecord(raw.config) ||
    !isFiniteNumber(raw.config.targetAssets) ||
    !isFiniteNumber(raw.config.startingCash) ||
    !isFiniteNumber(raw.config.bankruptLimit) ||
    typeof raw.config.finishRoundOnWin !== 'boolean'
  ) {
    return false;
  }

  if (!isRecord(raw.tiles) || !isRecord(raw.shops) || !isRecord(raw.segmentPools)) return false;
  if (!Array.isArray(raw.log) || !Array.isArray(raw.moveHistory) || !Array.isArray(raw.eventChoices)) return false;
  if (!Array.isArray(raw.deliveredShopIdsThisTurn)) return false;
  if (
    raw.globalSale !== null &&
    (!isRecord(raw.globalSale) ||
      typeof raw.globalSale.label !== 'string' ||
      !isFiniteNumber(raw.globalSale.priceMultiplier) ||
      raw.globalSale.priceMultiplier <= 0 ||
      !isValidTimedWindow(raw.globalSale.timer))
  ) {
    return false;
  }
  if (
    raw.elevatorLock !== null &&
    (!isRecord(raw.elevatorLock) ||
      !isValidTimedWindow(raw.elevatorLock.timer) ||
      (raw.elevatorLock.onlyPlayerId !== null && typeof raw.elevatorLock.onlyPlayerId !== 'string') ||
      (raw.elevatorLock.blockedPlayerId !== null && typeof raw.elevatorLock.blockedPlayerId !== 'string'))
  ) {
    return false;
  }

  const tilesObj = raw.tiles;
  if (!raw.players.every((p) => isValidPlayer(p, tilesObj))) return false;
  if (!Object.values(raw.shops).every((s) => isValidShop(s, tilesObj))) return false;
  return true;
}

export function parseAutoSavedMatch(raw: unknown): GameState | null {
  if (!isRecord(raw) || raw.schemaVersion !== SAVE_SCHEMA_VERSION) return null;
  return isValidGameState(raw.state) ? raw.state : null;
}

export function parseManualMatchEnvelope(raw: unknown): SavedMatchEnvelope | null {
  if (!isRecord(raw) || raw.schemaVersion !== SAVE_SCHEMA_VERSION || typeof raw.savedAt !== 'string') {
    return null;
  }
  if (!isValidGameState(raw.state)) return null;
  return { schemaVersion: raw.schemaVersion, savedAt: raw.savedAt, state: raw.state };
}
