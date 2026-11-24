import { sanitizeAvatarSpec } from '../config/avatarTypes';
import { DEFAULT_MATCH_CONFIG, MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS } from '../config/balance';
import { DEFAULT_STAGE_ID, getStageDef, OFFICIAL_STAGES } from '../config/maps';
import type { StageId } from '../config/maps';
import type { PlayerSetupInput } from '../engine/state';
import type { GameState, MatchConfig } from '../engine/types';
import {
  isValidGameState,
  parseAutoSavedMatch,
  parseManualMatchEnvelope,
  SAVE_SCHEMA_VERSION,
} from './stateValidation';
import type { AutoSavedMatchEnvelope, SavedMatchEnvelope } from './stateValidation';

export { isValidGameState, parseAutoSavedMatch, parseManualMatchEnvelope, SAVE_SCHEMA_VERSION };
export type { AutoSavedMatchEnvelope, SavedMatchEnvelope };

export interface MatchSetupData {
  stageId: StageId;
  players: PlayerSetupInput[];
  config: MatchConfig;
}

export const SETUP_STORAGE_KEY = 'top_shop_setup_v1';
export const ACTIVE_MATCH_STORAGE_KEY = 'top_shop_active_match_v1';
export const SAVED_MATCH_STORAGE_KEY = 'top_shop_saved_match_v1';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function resolveStageId(rawStageId: unknown): StageId {
  if (typeof rawStageId === 'string' && OFFICIAL_STAGES.some((s) => s.id === rawStageId)) {
    return rawStageId as StageId;
  }
  return DEFAULT_STAGE_ID;
}

function getStorage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export function createDefaultMatchSetup(
  playerCount = 2,
  stageId: StageId = DEFAULT_STAGE_ID
): MatchSetupData {
  const resolvedStageId = resolveStageId(stageId);
  const stageDef = getStageDef(resolvedStageId);
  const count = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.round(playerCount)));
  const players: PlayerSetupInput[] = Array.from({ length: count }, (_, idx) => ({
    name: `Player ${idx + 1}`,
    color: PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
    isBot: false,
    avatar: sanitizeAvatarSpec(undefined, idx),
  }));
  return {
    stageId: resolvedStageId,
    players,
    config: {
      ...DEFAULT_MATCH_CONFIG,
      startingCash: stageDef.recommendedStartingCash,
      targetAssets: stageDef.recommendedTargetAssets,
    },
  };
}

export function sanitizeMatchSetup(raw: unknown): MatchSetupData | null {
  if (!isRecord(raw)) return null;

  const stageId = resolveStageId(raw.stageId ?? raw.mapId);
  const stageDef = getStageDef(stageId);
  const rawPlayers = Array.isArray(raw.players) ? raw.players : [];
  const validCount = rawPlayers.length >= MIN_PLAYERS && rawPlayers.length <= MAX_PLAYERS;
  const players: PlayerSetupInput[] = (validCount ? rawPlayers : [null, null]).map((entry, idx) => {
    const p = isRecord(entry) ? entry : {};
    const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `Player ${idx + 1}`;
    const color =
      typeof p.color === 'string' && HEX_COLOR_RE.test(p.color)
        ? p.color.toLowerCase()
        : PLAYER_COLORS[idx % PLAYER_COLORS.length]!;
    return { name, color, isBot: Boolean(p.isBot), avatar: sanitizeAvatarSpec(p.avatar, idx) };
  });

  const rawCfg = isRecord(raw.config) ? raw.config : {};
  const maxBankrupt = Math.max(1, players.length - 1);
  const rawStarter = rawCfg.startingPlayer;
  const startingPlayer: MatchConfig['startingPlayer'] =
    rawStarter === 'random'
      ? 'random'
      : typeof rawStarter === 'number' &&
          Number.isInteger(rawStarter) &&
          rawStarter >= 0 &&
          rawStarter < players.length
        ? rawStarter
        : 0;
  const config: MatchConfig = {
    targetAssets: clampInt(rawCfg.targetAssets, 1000, 1000000, stageDef.recommendedTargetAssets),
    startingCash: clampInt(rawCfg.startingCash, 500, 500000, stageDef.recommendedStartingCash),
    bankruptLimit: clampInt(rawCfg.bankruptLimit, 1, maxBankrupt, 1),
    finishRoundOnWin: Boolean(rawCfg.finishRoundOnWin),
    showMonthPopup:
      rawCfg.showMonthPopup === undefined
        ? DEFAULT_MATCH_CONFIG.showMonthPopup !== false
        : Boolean(rawCfg.showMonthPopup),
    startingPlayer,
  };

  return { stageId, players, config };
}

export function extractSetupFromState(state: GameState): MatchSetupData {
  const sanitized = sanitizeMatchSetup({
    stageId: state.mapId,
    players: state.players.map((p, idx) => ({
      name: p.name, color: p.color, isBot: p.isBot, avatar: sanitizeAvatarSpec(p.avatar, idx),
    })),
    config: state.config,
  });
  return sanitized ?? createDefaultMatchSetup();
}

export function loadStoredSetup(): MatchSetupData {
  const storage = getStorage();
  if (!storage) return createDefaultMatchSetup();
  try {
    const raw = storage.getItem(SETUP_STORAGE_KEY);
    if (!raw) return createDefaultMatchSetup();
    return sanitizeMatchSetup(JSON.parse(raw)) ?? createDefaultMatchSetup();
  } catch {
    return createDefaultMatchSetup();
  }
}

export function saveStoredSetup(setup: MatchSetupData): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Ignore storage quota/availability errors
  }
}

export function loadAutoSavedMatch(): GameState | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(ACTIVE_MATCH_STORAGE_KEY);
    if (!raw) return null;
    return parseAutoSavedMatch(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveAutoSavedMatch(state: GameState): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const envelope: AutoSavedMatchEnvelope = { schemaVersion: SAVE_SCHEMA_VERSION, state };
    storage.setItem(ACTIVE_MATCH_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Ignore storage quota/availability errors
  }
}

export function clearAutoSavedMatch(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(ACTIVE_MATCH_STORAGE_KEY);
  } catch {
    // Ignore storage availability errors
  }
}

export function loadManualMatchSlot(): SavedMatchEnvelope | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVED_MATCH_STORAGE_KEY);
    if (!raw) return null;
    return parseManualMatchEnvelope(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveManualMatchSlot(state: GameState): SavedMatchEnvelope {
  const envelope: SavedMatchEnvelope = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    state,
  };
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(SAVED_MATCH_STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      // Ignore storage quota/availability errors
    }
  }
  return envelope;
}

export function clearManualMatchSlot(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(SAVED_MATCH_STORAGE_KEY);
  } catch {
    // Ignore storage availability errors
  }
}

export function serializeSetupConfigJson(setup: MatchSetupData): string {
  return JSON.stringify({ version: 1, schemaVersion: SAVE_SCHEMA_VERSION, ...setup }, null, 2);
}

export function parseSetupConfigJson(jsonText: string): MatchSetupData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid JSON file: syntax error.');
  }
  if (!isRecord(parsed) || !('players' in parsed || 'config' in parsed || 'stageId' in parsed || 'mapId' in parsed)) {
    throw new Error('JSON file does not contain Top Shop setup fields (stageId, players, config).');
  }
  const setup = sanitizeMatchSetup(parsed);
  if (!setup) {
    throw new Error('Invalid Top Shop match config.');
  }
  return setup;
}

export function downloadSetupConfigJson(setup: MatchSetupData): void {
  const blob = new Blob([serializeSetupConfigJson(setup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'top-shop-config.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
