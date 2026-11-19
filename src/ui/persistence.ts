import { DEFAULT_MATCH_CONFIG, PLAYER_COLORS } from '../config/balance';
import { DEFAULT_STAGE_ID, OFFICIAL_STAGES } from '../config/maps';
import type { StageId } from '../config/maps';
import type { PlayerSetupInput } from '../engine/state';
import type { GameState, MatchConfig } from '../engine/types';

export interface MatchSetupData {
  stageId: StageId;
  players: PlayerSetupInput[];
  config: MatchConfig;
}

export interface SavedMatchEnvelope {
  savedAt: string;
  state: GameState;
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
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function createDefaultMatchSetup(
  playerCount = 2,
  stageId: StageId = DEFAULT_STAGE_ID
): MatchSetupData {
  const count = Math.max(2, Math.min(6, Math.round(playerCount)));
  const players: PlayerSetupInput[] = Array.from({ length: count }, (_, idx) => ({
    name: `Player ${idx + 1}`,
    color: PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
    isBot: false,
  }));
  return {
    stageId: resolveStageId(stageId),
    players,
    config: { ...DEFAULT_MATCH_CONFIG },
  };
}

export function sanitizeMatchSetup(raw: unknown): MatchSetupData | null {
  if (!isRecord(raw)) return null;

  const stageId = resolveStageId(raw.stageId ?? raw.mapId);
  const rawPlayers = Array.isArray(raw.players) ? raw.players : [];
  const validCount = rawPlayers.length >= 2 && rawPlayers.length <= 6;
  const players: PlayerSetupInput[] = (validCount ? rawPlayers : [null, null]).map((entry, idx) => {
    const p = isRecord(entry) ? entry : {};
    const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : `Player ${idx + 1}`;
    const color =
      typeof p.color === 'string' && HEX_COLOR_RE.test(p.color)
        ? p.color.toLowerCase()
        : PLAYER_COLORS[idx % PLAYER_COLORS.length]!;
    return { name, color, isBot: Boolean(p.isBot) };
  });

  const rawCfg = isRecord(raw.config) ? raw.config : {};
  const maxBankrupt = Math.max(1, players.length - 1);
  const config: MatchConfig = {
    targetAssets: clampInt(rawCfg.targetAssets, 1000, 1000000, DEFAULT_MATCH_CONFIG.targetAssets),
    startingCash: clampInt(rawCfg.startingCash, 500, 500000, DEFAULT_MATCH_CONFIG.startingCash),
    bankruptLimit: clampInt(rawCfg.bankruptLimit, 1, maxBankrupt, 1),
    finishRoundOnWin: Boolean(rawCfg.finishRoundOnWin),
  };

  return { stageId, players, config };
}

export function extractSetupFromState(state: GameState): MatchSetupData {
  const sanitized = sanitizeMatchSetup({
    stageId: state.mapId,
    players: state.players.map((p) => ({ name: p.name, color: p.color, isBot: p.isBot })),
    config: state.config,
  });
  return sanitized ?? createDefaultMatchSetup();
}

export function isValidGameState(raw: unknown): raw is GameState {
  if (!isRecord(raw)) return false;
  if (typeof raw.seed !== 'number' || !Number.isFinite(raw.seed)) return false;
  if (typeof raw.mapId !== 'string' || !OFFICIAL_STAGES.some((s) => s.id === raw.mapId)) return false;
  if (typeof raw.turnNumber !== 'number' || !Number.isFinite(raw.turnNumber) || raw.turnNumber < 1) {
    return false;
  }
  if (typeof raw.month !== 'number' || !Number.isFinite(raw.month)) return false;
  if (typeof raw.year !== 'number' || !Number.isFinite(raw.year)) return false;
  if (typeof raw.totalMonths !== 'number' || !Number.isFinite(raw.totalMonths)) return false;
  if (typeof raw.phase !== 'string') return false;
  if (!isRecord(raw.config) || typeof raw.config.targetAssets !== 'number') return false;
  if (!Array.isArray(raw.players) || raw.players.length < 2) return false;
  if (
    typeof raw.activePlayerIndex !== 'number' ||
    !Number.isInteger(raw.activePlayerIndex) ||
    raw.activePlayerIndex < 0 ||
    raw.activePlayerIndex >= raw.players.length
  ) {
    return false;
  }
  if (!isRecord(raw.tiles) || !isRecord(raw.shops) || !isRecord(raw.segmentPools)) return false;
  if (!Array.isArray(raw.log)) return false;
  return true;
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
    const parsed: unknown = JSON.parse(raw);
    return isValidGameState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAutoSavedMatch(state: GameState): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(ACTIVE_MATCH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota/availability errors
  }
}

export function loadManualMatchSlot(): SavedMatchEnvelope | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVED_MATCH_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.savedAt !== 'string' || !isValidGameState(parsed.state)) {
      return null;
    }
    return { savedAt: parsed.savedAt, state: parsed.state };
  } catch {
    return null;
  }
}

export function saveManualMatchSlot(state: GameState): SavedMatchEnvelope {
  const envelope: SavedMatchEnvelope = { savedAt: new Date().toISOString(), state };
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
  return JSON.stringify({ version: 1, ...setup }, null, 2);
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
