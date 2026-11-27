import { isValidCustomImageDataUrl } from '../config/avatarTypes';
import { sanitizeSignatureStore } from '../config/signatureStore';
import { MAX_PLAYERS } from '../config/balance';
import type { GameState } from '../engine/types';
import { HEX_COLOR_RE, HOST_TOKEN, MAX_ROOM_PEERS } from './protocol';
import type { RoomRoster } from './protocol';
import { specsEqual } from './signatureSync';

export const PEER_ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

export function applyPeerSeatProfiles(state: GameState, roster: RoomRoster | null): GameState {
  if (!roster) return state;
  let changed = false;
  const players = state.players.map((player, idx) => {
    const ownerId = roster.seatOwners[idx];
    if (!ownerId || ownerId === HOST_TOKEN) return player;
    const peer = roster.peers.find((p) => p.id === ownerId);
    if (!peer) return player;
    const nextName = peer.name.trim() || player.name;
    const nextColor = HEX_COLOR_RE.test(peer.color) ? peer.color : player.color;
    const peerWalk = peer.avatar?.walkSound;
    const walkChanged = peerWalk !== undefined && peerWalk !== player.avatar?.walkSound;
    const peerSig = sanitizeSignatureStore(peer.signatureStore);
    const sigChanged = !specsEqual(peerSig, player.signatureStore);
    if (nextName === player.name && nextColor === player.color && !walkChanged && !sigChanged) return player;
    changed = true;
    const nextAvatar =
      walkChanged && player.avatar ? { ...player.avatar, walkSound: peerWalk } : player.avatar;
    const { signatureStore: _oldSig, ...restPlayer } = player;
    return {
      ...restPlayer,
      name: nextName,
      color: nextColor,
      ...(nextAvatar ? { avatar: nextAvatar } : {}),
      ...(peerSig ? { signatureStore: peerSig } : {}),
    };
  });
  return changed ? { ...state, players } : state;
}

export interface AvatarPutEntry {
  key: string;
  dataUrl: string | null;
}

export interface AvatarSyncStore {
  clear: () => void;
  getMap: () => Record<string, string>;
  setPeerImage: (peerId: string, customImage?: string) => void;
  removePeerImage: (peerId: string) => void;
  refreshHostMap: (
    state: GameState,
    roster: RoomRoster | null
  ) => { map: Record<string, string>; diffs: AvatarPutEntry[]; changed: boolean };
  setRemoteMap: (avatars: Record<string, string>) => void;
  applyRemotePut: (key: string, dataUrl: string | null) => boolean;
}

const MAX_AVATAR_KEYS = MAX_ROOM_PEERS + MAX_PLAYERS;

function isSafeAvatarKey(key: string): boolean {
  return key.length > 0 && key.length <= 64 && key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

export function createAvatarSyncStore(): AvatarSyncStore {
  const peerImages = new Map<string, string>();
  let currentMap: Record<string, string> = {};

  return {
    clear: () => {
      peerImages.clear();
      currentMap = {};
    },
    getMap: () => ({ ...currentMap }),
    setPeerImage: (peerId, customImage) => {
      if (isValidCustomImageDataUrl(customImage)) peerImages.set(peerId, customImage);
      else peerImages.delete(peerId);
    },
    removePeerImage: (peerId) => {
      peerImages.delete(peerId);
    },
    refreshHostMap: (state, roster) => {
      const next: Record<string, string> = {};
      for (const player of state.players) {
        const img = player.avatar?.customImage;
        if (isValidCustomImageDataUrl(img)) next[player.id] = img;
      }
      if (roster) {
        for (const peer of roster.peers) {
          const img = peerImages.get(peer.id);
          if (isValidCustomImageDataUrl(img)) next[peer.id] = img;
        }
      }
      const diffs: AvatarPutEntry[] = [];
      for (const [key, dataUrl] of Object.entries(next)) {
        if (currentMap[key] !== dataUrl) diffs.push({ key, dataUrl });
      }
      for (const key of Object.keys(currentMap)) {
        if (!(key in next)) diffs.push({ key, dataUrl: null });
      }
      currentMap = next;
      return { map: currentMap, diffs, changed: diffs.length > 0 };
    },
    setRemoteMap: (avatars) => {
      const clean: Record<string, string> = {};
      for (const [key, val] of Object.entries(avatars)) {
        if (isSafeAvatarKey(key) && isValidCustomImageDataUrl(val)) clean[key] = val;
      }
      currentMap = clean;
    },
    applyRemotePut: (key, dataUrl) => {
      if (!isSafeAvatarKey(key)) return false;
      if (dataUrl === null) {
        if (!(key in currentMap)) return false;
        const next = { ...currentMap };
        delete next[key];
        currentMap = next;
        return true;
      }
      if (!isValidCustomImageDataUrl(dataUrl) || currentMap[key] === dataUrl) return false;
      if (!(key in currentMap) && Object.keys(currentMap).length >= MAX_AVATAR_KEYS) return false;
      currentMap = { ...currentMap, [key]: dataUrl };
      return true;
    },
  };
}

export const HOST_RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;
export const GUEST_RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 12000] as const;
export const PING_INTERVAL_MS = 5000;
export const PONG_TIMEOUT_MS = 12000;
const TRANSIENT_PEER_ERRORS = new Set(['network', 'disconnected', 'server-error', 'socket-error', 'socket-closed']);

export function isTransientSignalingError(err: { type?: string } | null | undefined): boolean {
  return typeof err?.type === 'string' && TRANSIENT_PEER_ERRORS.has(err.type);
}

export interface ReconnectBackoff {
  schedule: () => void;
  reset: () => void;
  cancel: () => void;
  isExhausted: () => boolean;
  getAttempts: () => number;
}

export function createReconnectBackoff(
  onAttempt: () => void,
  onExhausted: () => void,
  delays: readonly number[] = HOST_RECONNECT_DELAYS_MS
): ReconnectBackoff {
  let attempts = 0;
  let exhausted = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };

  return {
    cancel,
    reset: () => { cancel(); attempts = 0; exhausted = false; },
    isExhausted: () => exhausted,
    getAttempts: () => attempts,
    schedule: () => {
      if (timer !== null || exhausted) return;
      if (attempts >= delays.length) {
        exhausted = true;
        onExhausted();
        return;
      }
      const delay = delays[attempts]!;
      attempts++;
      timer = setTimeout(() => { timer = null; onAttempt(); }, delay);
    },
  };
}

export interface HeartbeatMonitor {
  start: () => void;
  touch: () => void;
  stop: () => void;
}

export function createHeartbeatMonitor(
  onSendPing: () => void,
  onTimeout: () => void,
  intervalMs = PING_INTERVAL_MS,
  timeoutMs = PONG_TIMEOUT_MS
): HeartbeatMonitor {
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastAlive = 0;

  const stop = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  return {
    stop,
    touch: () => {
      lastAlive = Date.now();
    },
    start: () => {
      stop();
      lastAlive = Date.now();
      timer = setInterval(() => {
        if (Date.now() - lastAlive >= timeoutMs) {
          stop();
          onTimeout();
          return;
        }
        onSendPing();
      }, intervalMs);
    },
  };
}
