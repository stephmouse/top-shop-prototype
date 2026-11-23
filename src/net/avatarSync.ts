import { isValidCustomImageDataUrl } from '../config/avatarTypes';
import type { GameState } from '../engine/types';
import { HEX_COLOR_RE, HOST_TOKEN } from './protocol';
import type { RoomRoster } from './protocol';

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
    const ownerToken = roster.seatOwners[idx];
    if (!ownerToken || ownerToken === HOST_TOKEN) return player;
    const peer = roster.peers.find((p) => p.clientToken === ownerToken);
    if (!peer) return player;
    const nextName = peer.name.trim() || player.name;
    const nextColor = HEX_COLOR_RE.test(peer.color) ? peer.color : player.color;
    const peerWalk = peer.avatar?.walkSound;
    const walkChanged = peerWalk !== undefined && peerWalk !== player.avatar?.walkSound;
    if (nextName === player.name && nextColor === player.color && !walkChanged) return player;
    changed = true;
    const nextAvatar =
      walkChanged && player.avatar ? { ...player.avatar, walkSound: peerWalk } : player.avatar;
    return { ...player, name: nextName, color: nextColor, ...(nextAvatar ? { avatar: nextAvatar } : {}) };
  });
  return changed ? { ...state, players } : state;
}

export interface AvatarSyncStore {
  clear: () => void;
  getMap: () => Record<string, string>;
  setPeerImage: (clientToken: string, customImage?: string) => void;
  removePeerImage: (clientToken: string) => void;
  refreshHostMap: (state: GameState, roster: RoomRoster | null) => { map: Record<string, string>; changed: boolean };
  setRemoteMap: (avatars: Record<string, string>) => void;
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
    setPeerImage: (clientToken, customImage) => {
      if (isValidCustomImageDataUrl(customImage)) peerImages.set(clientToken, customImage);
      else peerImages.delete(clientToken);
    },
    removePeerImage: (clientToken) => {
      peerImages.delete(clientToken);
    },
    refreshHostMap: (state, roster) => {
      const next: Record<string, string> = {};
      for (const player of state.players) {
        const img = player.avatar?.customImage;
        if (isValidCustomImageDataUrl(img)) next[player.id] = img;
      }
      if (roster) {
        for (const peer of roster.peers) {
          const img = peerImages.get(peer.clientToken);
          if (isValidCustomImageDataUrl(img)) next[peer.clientToken] = img;
        }
      }
      const nextKeys = Object.keys(next);
      const prevKeys = Object.keys(currentMap);
      const changed = nextKeys.length !== prevKeys.length || nextKeys.some((k) => currentMap[k] !== next[k]);
      currentMap = next;
      return { map: currentMap, changed };
    },
    setRemoteMap: (avatars) => {
      const clean: Record<string, string> = {};
      for (const [key, val] of Object.entries(avatars)) {
        if (isValidCustomImageDataUrl(val)) clean[key] = val;
      }
      currentMap = clean;
    },
  };
}

export const HOST_RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;
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
