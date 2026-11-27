import { MAX_PLAYERS, MIN_PLAYERS } from '../config/balance';
import { createStageMap, OFFICIAL_STAGES } from '../config/maps';
import type { BuiltMap, StageId } from '../config/maps';
import { redactStateForClient } from '../engine/actions';
import type { GameState } from '../engine/types';

export type WireGameState = Omit<GameState, 'tiles' | 'segmentPools'>;

const stageMapCache = new Map<StageId, Pick<BuiltMap, 'tiles' | 'segmentPools'>>();

function isOfficialStageId(raw: unknown): raw is StageId {
  return typeof raw === 'string' && OFFICIAL_STAGES.some((s) => s.id === raw);
}

function getCachedStageGeometry(stageId: StageId): Pick<BuiltMap, 'tiles' | 'segmentPools'> {
  const cached = stageMapCache.get(stageId);
  if (cached) return cached;
  const { tiles, segmentPools } = createStageMap(stageId);
  const entry = { tiles, segmentPools };
  stageMapCache.set(stageId, entry);
  return entry;
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

export function packWireGameState(state: GameState): WireGameState {
  const redacted = redactStateForClient(state);
  if (redacted.phase !== 'GAME_OVER') {
    const {
      tiles: _tiles,
      segmentPools: _segmentPools,
      matchStats: _matchStats,
      assetHistory: _assetHistory,
      winReason: _winReason,
      ...wire
    } = redacted;
    return wire;
  }
  const { tiles: _tiles, segmentPools: _segmentPools, ...wire } = redacted;
  return wire;
}

export function hydrateWireGameState(wire: WireGameState): GameState | null {
  if (!isOfficialStageId(wire.mapId)) return null;
  const { tiles, segmentPools } = getCachedStageGeometry(wire.mapId);
  if (
    !Array.isArray(wire.players) ||
    !wire.players.every((p) => p && typeof p.tileId === 'string' && Object.prototype.hasOwnProperty.call(tiles, p.tileId))
  ) {
    return null;
  }
  return { ...wire, tiles, segmentPools };
}

export function isValidWireGameState(raw: unknown): raw is WireGameState {
  if (!isRecord(raw)) return false;
  if (typeof raw.seed !== 'number' || !Number.isFinite(raw.seed)) return false;
  if (!isOfficialStageId(raw.mapId)) return false;
  if (typeof raw.turnNumber !== 'number' || !Number.isFinite(raw.turnNumber) || raw.turnNumber < 1) return false;
  if (typeof raw.month !== 'number' || !Number.isFinite(raw.month)) return false;
  if (typeof raw.year !== 'number' || !Number.isFinite(raw.year)) return false;
  if (typeof raw.totalMonths !== 'number' || !Number.isFinite(raw.totalMonths)) return false;
  if (typeof raw.phase !== 'string') return false;
  if (!isRecord(raw.config) || typeof raw.config.targetAssets !== 'number') return false;
  if (!Array.isArray(raw.players) || raw.players.length < MIN_PLAYERS || raw.players.length > MAX_PLAYERS) return false;
  if (
    typeof raw.activePlayerIndex !== 'number' ||
    !Number.isInteger(raw.activePlayerIndex) ||
    raw.activePlayerIndex < 0 ||
    raw.activePlayerIndex >= raw.players.length
  ) {
    return false;
  }
  if (!isRecord(raw.shops)) return false;
  if (!Array.isArray(raw.log) || !Array.isArray(raw.moveHistory) || !Array.isArray(raw.eventChoices)) return false;
  if (!Array.isArray(raw.deliveredShopIdsThisTurn)) return false;

  const { tiles } = getCachedStageGeometry(raw.mapId);
  return raw.players.every(
    (p) =>
      isRecord(p) &&
      typeof p.id === 'string' &&
      typeof p.tileId === 'string' &&
      Object.prototype.hasOwnProperty.call(tiles, p.tileId)
  );
}
