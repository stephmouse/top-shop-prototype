import { isValidAvatarSpec, isValidCustomImageDataUrl } from '../config/avatarTypes';
import type { AvatarSpec } from '../config/avatarTypes';
import { MAX_PLAYERS, MIN_PLAYERS, PENCIL_FACES } from '../config/balance';
import { isValidGameAction } from '../engine/actions';
import type { GameAction } from '../engine/actions';
import type { PencilFace } from '../engine/types';
import { isValidWireGameState } from './wireState';
import type { WireGameState } from './wireState';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PEER_ID_PREFIX = 'topshop-v1-';
export const HOST_TOKEN = 'HOST';
export const CLIENT_TOKEN_STORAGE_KEY = 'top_shop_client_token_v1';
export const MAX_ROOM_PEERS = 8;
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export type NetRole = 'offline' | 'host' | 'guest';

export interface ConnectedPeerInfo {
  id: string;
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
  | { type: 'UI_PENCIL_SPIN'; clientToken: string; spinning: boolean; stopFace?: PencilFace }
  | { type: 'PING'; clientToken: string; ts: number };

export type HostToClientMessage =
  | { type: 'WELCOME'; seq: number; myPeerId: string; roster: RoomRoster; state: WireGameState }
  | { type: 'STATE_SYNC'; seq: number; roster: RoomRoster; state: WireGameState; pencilSpinning: boolean }
  | { type: 'ROSTER_SYNC'; roster: RoomRoster }
  | { type: 'AVATAR_SYNC'; avatars: Record<string, string> }
  | { type: 'AVATAR_PUT'; key: string; dataUrl: string | null }
  | { type: 'UI_PENCIL_SPIN'; spinning: boolean; activePlayerIndex: number; stopFace?: PencilFace }
  | { type: 'PONG'; ts: number }
  | { type: 'ERROR'; message: string };

export function generateRoomCode(length = 6): string {
  let code = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      code += ROOM_CODE_ALPHABET[bytes[i]! % ROOM_CODE_ALPHABET.length]!;
    }
    return code;
  }
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
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  }
  return `cli_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

export function getOrCreateClientToken(): string {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const existing = window.sessionStorage.getItem(CLIENT_TOKEN_STORAGE_KEY);
      if (existing && existing.length >= 8 && existing !== HOST_TOKEN) return existing;
      const fresh = makeRandomToken();
      window.sessionStorage.setItem(CLIENT_TOKEN_STORAGE_KEY, fresh);
      return fresh;
    }
  } catch {
    // Ignore storage unavailability
  }
  return makeRandomToken();
}

export function getOrCreateGuestToken(roomCode: string, guestName: string): string {
  const code = normalizeRoomCode(roomCode) || 'ROOM';
  const safeName = guestName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'guest';
  const key = `top_shop_guest_tok_${code}_${safeName}`;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const existing = window.sessionStorage.getItem(key);
      if (existing && existing.length >= 8 && existing !== HOST_TOKEN) return existing;
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
  const idx = roster.peers.findIndex((p) => p.id === peer.id);
  const peers =
    idx >= 0 ? roster.peers.map((p, i) => (i === idx ? { ...peer } : p)) : [...roster.peers, { ...peer }];
  const seatOwners = [...roster.seatOwners];

  if (autoClaimSeat && !seatOwners.includes(peer.id)) {
    const freeIdx = seatOwners.findIndex((owner, seatIdx) => seatIdx >= 1 && owner === HOST_TOKEN);
    if (freeIdx >= 1) seatOwners[freeIdx] = peer.id;
  }
  return { ...roster, seatOwners, peers };
}

export function assignSeatOwner(roster: RoomRoster, seatIndex: number, ownerId: string): RoomRoster {
  if (seatIndex < 0 || seatIndex >= roster.seatOwners.length) return roster;
  const seatOwners = roster.seatOwners.map((owner, idx) => (idx === seatIndex ? ownerId : owner));
  return { ...roster, seatOwners };
}

export function removePeerFromRoster(roster: RoomRoster, peerId: string): RoomRoster {
  return {
    ...roster,
    seatOwners: roster.seatOwners.map((owner) => (owner === peerId ? HOST_TOKEN : owner)),
    peers: roster.peers.filter((p) => p.id !== peerId),
  };
}

export function canClientAct(
  role: NetRole,
  roster: RoomRoster | null,
  myPeerId: string,
  activePlayerIndex: number
): boolean {
  if (role === 'offline' || !roster) return true;
  const owner = roster.seatOwners[activePlayerIndex];
  if (!owner) return false;
  return role === 'host' ? owner === HOST_TOKEN : Boolean(myPeerId) && owner === myPeerId;
}

export function getLocalSeatIndices(
  role: NetRole,
  roster: RoomRoster | null,
  myPeerId: string,
  playerCount: number
): number[] {
  if (role === 'offline' || !roster) return Array.from({ length: playerCount }, (_, idx) => idx);
  const out: number[] = [];
  for (let i = 0; i < playerCount; i++) {
    if (canClientAct(role, roster, myPeerId, i)) out.push(i);
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
      isShortStr(p.id, 64) &&
      isShortStr(p.name, 40) &&
      typeof p.color === 'string' &&
      HEX_COLOR_RE.test(p.color) &&
      (p.avatar === undefined || isValidAvatarSpec(p.avatar)) &&
      typeof p.connected === 'boolean'
  );
}

function isOptionalPencilFace(raw: unknown): raw is PencilFace | undefined {
  return raw === undefined || PENCIL_FACES.includes(raw as PencilFace);
}

export function isValidClientMessage(raw: unknown): raw is ClientToHostMessage {
  if (
    !isRecord(raw) ||
    !isShortStr(raw.clientToken, 64) ||
    raw.clientToken.length < 8 ||
    raw.clientToken === HOST_TOKEN ||
    typeof raw.type !== 'string'
  ) {
    return false;
  }
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
  if (raw.type === 'UI_PENCIL_SPIN') return typeof raw.spinning === 'boolean' && isOptionalPencilFace(raw.stopFace);
  if (raw.type === 'PING') return typeof raw.ts === 'number' && Number.isFinite(raw.ts);
  return false;
}

function isValidAvatarKey(key: unknown): key is string {
  return isShortStr(key, 64) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

function isValidAvatarMap(raw: unknown): raw is Record<string, string> {
  if (!isRecord(raw)) return false;
  const entries = Object.entries(raw);
  if (entries.length > MAX_ROOM_PEERS + MAX_PLAYERS) return false;
  return entries.every(([key, val]) => isValidAvatarKey(key) && isValidCustomImageDataUrl(val));
}

export function isValidHostMessage(raw: unknown): raw is HostToClientMessage {
  if (!isRecord(raw) || typeof raw.type !== 'string') return false;
  if (raw.type === 'WELCOME') {
    return (
      typeof raw.seq === 'number' &&
      Number.isInteger(raw.seq) &&
      isShortStr(raw.myPeerId, 64) &&
      raw.myPeerId !== HOST_TOKEN &&
      isValidRoster(raw.roster) &&
      isValidWireGameState(raw.state)
    );
  }
  if (raw.type === 'STATE_SYNC') {
    return (
      typeof raw.seq === 'number' &&
      Number.isInteger(raw.seq) &&
      isValidRoster(raw.roster) &&
      isValidWireGameState(raw.state) &&
      typeof raw.pencilSpinning === 'boolean'
    );
  }
  if (raw.type === 'ROSTER_SYNC') return isValidRoster(raw.roster);
  if (raw.type === 'AVATAR_SYNC') return isValidAvatarMap(raw.avatars);
  if (raw.type === 'AVATAR_PUT') {
    return isValidAvatarKey(raw.key) && (raw.dataUrl === null || isValidCustomImageDataUrl(raw.dataUrl));
  }
  if (raw.type === 'UI_PENCIL_SPIN') {
    return (
      typeof raw.spinning === 'boolean' &&
      typeof raw.activePlayerIndex === 'number' &&
      Number.isInteger(raw.activePlayerIndex) &&
      isOptionalPencilFace(raw.stopFace)
    );
  }
  if (raw.type === 'PONG') return typeof raw.ts === 'number' && Number.isFinite(raw.ts);
  if (raw.type === 'ERROR') return typeof raw.message === 'string' && raw.message.length <= 200;
  return false;
}
