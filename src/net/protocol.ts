import { isValidAvatarSpec, isValidCustomImageDataUrl } from '../config/avatarTypes';
import type { AvatarSpec } from '../config/avatarTypes';
import { MAX_PLAYERS, MIN_PLAYERS } from '../config/balance';
import { isValidGameAction } from '../engine/actions';
import type { GameAction } from '../engine/actions';
import type { GameState } from '../engine/types';
import { isValidGameState } from '../ui/persistence';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PEER_ID_PREFIX = 'topshop-v1-';
export const HOST_TOKEN = 'HOST';
export const CLIENT_TOKEN_STORAGE_KEY = 'top_shop_client_token_v1';
export const MAX_ROOM_PEERS = 8;
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export type NetRole = 'offline' | 'host' | 'guest';

export interface ConnectedPeerInfo {
  clientToken: string;
  peerId: string;
  name: string;
  color: string;
  avatar?: AvatarSpec;
  connected: boolean;
}

export interface RoomRoster {
  roomCode: string;
  seatOwners: string[];
  peers: ConnectedPeerInfo[];
}

export type ClientToHostMessage =
  | { type: 'HELLO'; clientToken: string; name: string; color: string; avatar?: AvatarSpec }
  | { type: 'UPDATE_PROFILE'; clientToken: string; name: string; color: string; avatar?: AvatarSpec }
  | { type: 'ACTION_REQUEST'; clientToken: string; seq: number; action: GameAction }
  | { type: 'UI_PENCIL_SPIN'; clientToken: string; spinning: boolean };

export type HostToClientMessage =
  | { type: 'WELCOME'; seq: number; roster: RoomRoster; state: GameState }
  | { type: 'STATE_SYNC'; seq: number; roster: RoomRoster; state: GameState; pencilSpinning: boolean }
  | { type: 'ROSTER_SYNC'; roster: RoomRoster }
  | { type: 'AVATAR_SYNC'; avatars: Record<string, string> }
  | { type: 'UI_PENCIL_SPIN'; spinning: boolean; activePlayerIndex: number }
  | { type: 'ERROR'; message: string };

export function generateRoomCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]!;
  }
  return code;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function roomCodeToPeerId(roomCode: string): string {
  return `${PEER_ID_PREFIX}${normalizeRoomCode(roomCode)}`;
}

function makeRandomToken(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `cli_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

export function getOrCreateClientToken(): string {
  return makeRandomToken();
}

export function getOrCreateGuestToken(roomCode: string, guestName: string): string {
  const code = normalizeRoomCode(roomCode) || 'ROOM';
  const safeName = guestName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'guest';
  const key = `top_shop_guest_tok_${code}_${safeName}`;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const existing = window.sessionStorage.getItem(key);
      if (existing && existing.length >= 8) return existing;
      const fresh = makeRandomToken();
      window.sessionStorage.setItem(key, fresh);
      return fresh;
    }
  } catch {
    // Ignore storage unavailability
  }
  return makeRandomToken();
}

export function createDefaultRoster(roomCode: string, playerCount: number): RoomRoster {
  const count = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.round(playerCount)));
  return {
    roomCode: normalizeRoomCode(roomCode),
    seatOwners: Array.from({ length: count }, () => HOST_TOKEN),
    peers: [],
  };
}

export function resizeRosterSeats(roster: RoomRoster, playerCount: number): RoomRoster {
  const count = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.round(playerCount)));
  const seatOwners = Array.from({ length: count }, (_, idx) => roster.seatOwners[idx] ?? HOST_TOKEN);
  return { ...roster, seatOwners };
}

export function upsertPeerInRoster(
  roster: RoomRoster,
  peer: ConnectedPeerInfo,
  autoClaimSeat = true
): RoomRoster {
  const idx = roster.peers.findIndex((p) => p.clientToken === peer.clientToken);
  const peers =
    idx >= 0 ? roster.peers.map((p, i) => (i === idx ? { ...peer } : p)) : [...roster.peers, { ...peer }];
  const seatOwners = [...roster.seatOwners];

  if (autoClaimSeat && !seatOwners.includes(peer.clientToken)) {
    const freeIdx = seatOwners.findIndex((owner, seatIdx) => seatIdx >= 1 && owner === HOST_TOKEN);
    if (freeIdx >= 1) seatOwners[freeIdx] = peer.clientToken;
  }
  return { ...roster, seatOwners, peers };
}

export function assignSeatOwner(roster: RoomRoster, seatIndex: number, ownerToken: string): RoomRoster {
  if (seatIndex < 0 || seatIndex >= roster.seatOwners.length) return roster;
  const seatOwners = roster.seatOwners.map((owner, idx) => (idx === seatIndex ? ownerToken : owner));
  return { ...roster, seatOwners };
}

export function removePeerFromRoster(roster: RoomRoster, clientToken: string): RoomRoster {
  return {
    ...roster,
    seatOwners: roster.seatOwners.map((owner) => (owner === clientToken ? HOST_TOKEN : owner)),
    peers: roster.peers.filter((p) => p.clientToken !== clientToken),
  };
}

export function canClientAct(
  role: NetRole,
  roster: RoomRoster | null,
  myClientToken: string,
  activePlayerIndex: number
): boolean {
  if (role === 'offline' || !roster) return true;
  const owner = roster.seatOwners[activePlayerIndex];
  if (!owner) return false;
  return role === 'host' ? owner === HOST_TOKEN : owner === myClientToken;
}

export function getLocalSeatIndices(
  role: NetRole,
  roster: RoomRoster | null,
  myClientToken: string,
  playerCount: number
): number[] {
  if (role === 'offline' || !roster) return Array.from({ length: playerCount }, (_, idx) => idx);
  const out: number[] = [];
  for (let i = 0; i < playerCount; i++) {
    if (canClientAct(role, roster, myClientToken, i)) out.push(i);
  }
  return out;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isShortStr(val: unknown, maxLen = 64): val is string {
  return typeof val === 'string' && val.length > 0 && val.length <= maxLen;
}

function isValidRoster(raw: unknown): raw is RoomRoster {
  if (!isRecord(raw) || !isShortStr(raw.roomCode, 16)) return false;
  if (!Array.isArray(raw.seatOwners) || raw.seatOwners.length < MIN_PLAYERS || raw.seatOwners.length > MAX_PLAYERS) return false;
  if (!raw.seatOwners.every((s) => isShortStr(s, 64))) return false;
  if (!Array.isArray(raw.peers) || raw.peers.length > MAX_ROOM_PEERS) return false;
  return raw.peers.every(
    (p) =>
      isRecord(p) &&
      isShortStr(p.clientToken, 64) &&
      typeof p.peerId === 'string' &&
      isShortStr(p.name, 40) &&
      typeof p.color === 'string' &&
      HEX_COLOR_RE.test(p.color) &&
      (p.avatar === undefined || isValidAvatarSpec(p.avatar)) &&
      typeof p.connected === 'boolean'
  );
}

export function isValidClientMessage(raw: unknown): raw is ClientToHostMessage {
  if (!isRecord(raw) || !isShortStr(raw.clientToken, 64) || typeof raw.type !== 'string') return false;
  if (raw.type === 'HELLO' || raw.type === 'UPDATE_PROFILE') {
    return (
      isShortStr(raw.name, 40) &&
      typeof raw.color === 'string' &&
      HEX_COLOR_RE.test(raw.color) &&
      (raw.avatar === undefined || isValidAvatarSpec(raw.avatar))
    );
  }
  if (raw.type === 'ACTION_REQUEST') {
    return typeof raw.seq === 'number' && Number.isInteger(raw.seq) && raw.seq >= 0 && isValidGameAction(raw.action);
  }
  if (raw.type === 'UI_PENCIL_SPIN') return typeof raw.spinning === 'boolean';
  return false;
}

function isValidAvatarMap(raw: unknown): raw is Record<string, string> {
  if (!isRecord(raw)) return false;
  const entries = Object.entries(raw);
  if (entries.length > MAX_ROOM_PEERS + MAX_PLAYERS) return false;
  return entries.every(
    ([key, val]) =>
      isShortStr(key, 64) &&
      key !== '__proto__' &&
      key !== 'constructor' &&
      key !== 'prototype' &&
      isValidCustomImageDataUrl(val)
  );
}

export function isValidHostMessage(raw: unknown): raw is HostToClientMessage {
  if (!isRecord(raw) || typeof raw.type !== 'string') return false;
  if (raw.type === 'WELCOME') {
    return typeof raw.seq === 'number' && Number.isInteger(raw.seq) && isValidRoster(raw.roster) && isValidGameState(raw.state);
  }
  if (raw.type === 'STATE_SYNC') {
    return (
      typeof raw.seq === 'number' &&
      Number.isInteger(raw.seq) &&
      isValidRoster(raw.roster) &&
      isValidGameState(raw.state) &&
      typeof raw.pencilSpinning === 'boolean'
    );
  }
  if (raw.type === 'ROSTER_SYNC') return isValidRoster(raw.roster);
  if (raw.type === 'AVATAR_SYNC') return isValidAvatarMap(raw.avatars);
  if (raw.type === 'UI_PENCIL_SPIN') {
    return typeof raw.spinning === 'boolean' && typeof raw.activePlayerIndex === 'number' && Number.isInteger(raw.activePlayerIndex);
  }
  if (raw.type === 'ERROR') return typeof raw.message === 'string' && raw.message.length <= 200;
  return false;
}
