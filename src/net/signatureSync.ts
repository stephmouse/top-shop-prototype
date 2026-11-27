import { isValidSignatureStore, sanitizeSignatureStore } from '../config/signatureStore';
import type { SignatureStoreSpec } from '../config/signatureStore';
import { MAX_PLAYERS } from '../config/balance';
import type { GameState } from '../engine/types';
import { HOST_TOKEN, MAX_ROOM_PEERS } from './protocol';
import type { RoomRoster } from './protocol';

export interface SignaturePutEntry {
  key: string;
  signatureStore: SignatureStoreSpec | null;
}

export interface SignatureSyncStore {
  clear: () => void;
  getMap: () => Record<string, SignatureStoreSpec>;
  setPeerSpec: (peerId: string, spec?: SignatureStoreSpec) => void;
  removePeerSpec: (peerId: string) => void;
  refreshHostMap: (
    state: GameState,
    roster: RoomRoster | null
  ) => { map: Record<string, SignatureStoreSpec>; diffs: SignaturePutEntry[]; changed: boolean };
  setRemoteMap: (signatures: Record<string, SignatureStoreSpec>) => void;
  applyRemotePut: (key: string, spec: SignatureStoreSpec | null) => boolean;
}

const MAX_SIGNATURE_KEYS = MAX_ROOM_PEERS + MAX_PLAYERS;

function isSafeKey(key: string): boolean {
  return key.length > 0 && key.length <= 64 && key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
}

export function specsEqual(a?: SignatureStoreSpec | null, b?: SignatureStoreSpec | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.name === b.name &&
    a.iconId === b.iconId &&
    a.accent === b.accent &&
    a.itemNames.every((v, idx) => v === b.itemNames[idx])
  );
}

/** Tracks host & peer Signature Store specs out-of-band so zero bytes are added to STATE_SYNC. */
export function createSignatureSyncStore(): SignatureSyncStore {
  const peerSpecs = new Map<string, SignatureStoreSpec>();
  let currentMap: Record<string, SignatureStoreSpec> = {};

  return {
    clear: () => {
      peerSpecs.clear();
      currentMap = {};
    },
    getMap: () => ({ ...currentMap }),
    setPeerSpec: (peerId, spec) => {
      const clean = sanitizeSignatureStore(spec);
      if (clean) peerSpecs.set(peerId, clean);
      else peerSpecs.delete(peerId);
    },
    removePeerSpec: (peerId) => {
      peerSpecs.delete(peerId);
    },
    refreshHostMap: (state, roster) => {
      const next: Record<string, SignatureStoreSpec> = {};
      for (const player of state.players) {
        const clean = sanitizeSignatureStore(player.signatureStore);
        if (clean) next[player.id] = clean;
      }
      if (roster) {
        for (const peer of roster.peers) {
          const clean = peerSpecs.get(peer.id);
          if (clean) next[peer.id] = clean;
        }
      }
      const diffs: SignaturePutEntry[] = [];
      for (const [key, spec] of Object.entries(next)) {
        if (!specsEqual(currentMap[key], spec)) diffs.push({ key, signatureStore: spec });
      }
      for (const key of Object.keys(currentMap)) {
        if (!(key in next)) diffs.push({ key, signatureStore: null });
      }
      currentMap = next;
      return { map: currentMap, diffs, changed: diffs.length > 0 };
    },
    setRemoteMap: (signatures) => {
      const cleanMap: Record<string, SignatureStoreSpec> = {};
      for (const [key, val] of Object.entries(signatures)) {
        if (isSafeKey(key) && isValidSignatureStore(val)) cleanMap[key] = val;
      }
      currentMap = cleanMap;
    },
    applyRemotePut: (key, spec) => {
      if (!isSafeKey(key)) return false;
      if (spec === null) {
        if (!(key in currentMap)) return false;
        const next = { ...currentMap };
        delete next[key];
        currentMap = next;
        return true;
      }
      if (!isValidSignatureStore(spec) || specsEqual(currentMap[key], spec)) return false;
      if (!(key in currentMap) && Object.keys(currentMap).length >= MAX_SIGNATURE_KEYS) return false;
      currentMap = { ...currentMap, [key]: spec };
      return true;
    },
  };
}

/** Resolves a playerId -> SignatureStoreSpec lookup across offline state and online seat mappings. */
export function resolvePlayerSignatures(
  state: GameState,
  roster: RoomRoster | null,
  syncedSignatures: Readonly<Record<string, SignatureStoreSpec>>
): Record<string, SignatureStoreSpec> {
  const out: Record<string, SignatureStoreSpec> = {};
  state.players.forEach((player, idx) => {
    const seatOwner = roster?.seatOwners[idx];
    const fromPeer = seatOwner && seatOwner !== HOST_TOKEN ? syncedSignatures[seatOwner] : undefined;
    const spec = fromPeer ?? syncedSignatures[player.id] ?? player.signatureStore;
    if (spec?.name) out[player.id] = spec;
  });
  return out;
}
