import { isValidCustomImageDataUrl } from '../config/avatarTypes';
import type { GameState } from '../engine/types';
import type { RoomRoster } from './protocol';

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
