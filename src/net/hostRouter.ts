import { stripAvatarCustomImage } from '../config/avatarTypes';
import type { SignatureStoreSpec } from '../config/signatureStore';
import type { GameAction } from '../engine/actions';
import type { GameState, PencilFace } from '../engine/types';
import { applyPeerSeatProfiles, createAvatarSyncStore } from './avatarSync';
import {
  assignSeatOwner,
  createDefaultRoster,
  HOST_TOKEN,
  isValidClientMessage,
  MAX_ROOM_PEERS,
  removePeerFromRoster,
  resizeRosterSeats,
  upsertPeerInRoster,
} from './protocol';
import type { ClientToHostMessage, HostToClientMessage, RoomRoster } from './protocol';
import { createSignatureSyncStore } from './signatureSync';
import { packWireGameState } from './wireState';

export interface HostPeerSender {
  boundPublicId: string | null;
  send: (msg: HostToClientMessage) => void;
  close: () => void;
  onBind: (publicId: string) => void;
}

export interface HostRouterCallbacks {
  getState: () => GameState;
  onApplyHostAction: (action: GameAction) => GameState;
  onSyncHostState?: (state: GameState) => void;
  onSessionChange: () => void;
  onTurnPing?: (ping: { fromName: string; targetPlayerId: string; targetPlayerName: string }) => void;
  nowMs?: () => number;
  sendToPeer: (publicId: string, msg: HostToClientMessage) => void;
  broadcast: (msg: HostToClientMessage, excludePublicId?: string) => void;
  closePeer: (publicId: string) => void;
}

export interface HostRouter {
  getRoster: () => RoomRoster;
  getSeq: () => number;
  getCustomAvatars: () => Record<string, string>;
  getSyncedSignatures: () => Record<string, SignatureStoreSpec>;
  isRemotePencilSpinning: () => boolean;
  getRemotePencilStopFace: () => PencilFace | null;
  handleClientMessage: (raw: unknown, sender: HostPeerSender) => void;
  handlePeerDisconnect: (publicId: string) => void;
  syncHostState: (nextState: GameState) => void;
  notifyPencilSpin: (spinning: boolean, stopFace?: PencilFace) => void;
  sendHostTurnPing: () => { ok: boolean; waitSec?: number };
  assignSeat: (seatIndex: number, ownerId: string) => void;
  kickPeer: (publicId: string) => void;
}

/** Pure, transport-agnostic host message and seat/state coordinator. */
export function createHostRouter(
  roomCode: string,
  initialState: GameState,
  callbacks: HostRouterCallbacks
): HostRouter {
  let roster: RoomRoster = createDefaultRoster(roomCode, initialState.players.length);
  let seq = 1;
  let nextGuestNum = 0;
  let remotePencilSpinning = false;
  let remotePencilStopFace: PencilFace | null = null;
  const tokenToPublicId = new Map<string, string>();
  const pingStates = new Map<string, { lastAt: number; recent: number[]; blockedUntil: number }>();
  const avatarSync = createAvatarSyncStore();
  avatarSync.refreshHostMap(initialState, roster);
  const signatureSync = createSignatureSyncStore();
  signatureSync.refreshHostMap(initialState, roster);

  function attemptTurnPing(senderId: string, fromName: string): { ok: boolean; waitSec?: number } {
    const curState = callbacks.getState();
    if (curState.phase === 'GAME_OVER') return { ok: false };
    const now = (callbacks.nowMs ?? Date.now)();
    const entry = pingStates.get(senderId) ?? { lastAt: -Infinity, recent: [], blockedUntil: 0 };
    if (now < entry.blockedUntil) {
      return { ok: false, waitSec: Math.max(1, Math.ceil((entry.blockedUntil - now) / 1000)) };
    }
    if (now - entry.lastAt < 1000) {
      return { ok: false, waitSec: 1 };
    }
    const recent = entry.recent.filter((ts) => now - ts <= 10_000);
    if (recent.length >= 3) {
      const blockedUntil = now + 12_000;
      pingStates.set(senderId, { lastAt: entry.lastAt, recent: [], blockedUntil });
      return { ok: false, waitSec: 12 };
    }
    pingStates.set(senderId, { lastAt: now, recent: [...recent, now], blockedUntil: 0 });
    const active = curState.players[curState.activePlayerIndex];
    if (!active) return { ok: false };
    const ping = { fromName, targetPlayerId: active.id, targetPlayerName: active.name };
    callbacks.broadcast({ type: 'UI_TURN_PING', ...ping });
    callbacks.onTurnPing?.(ping);
    return { ok: true };
  }

  function deleteTokenMappingsForPeer(publicId: string): void {
    for (const [token, mappedId] of tokenToPublicId.entries()) {
      if (mappedId === publicId) tokenToPublicId.delete(token);
    }
  }

  function evictDisconnectedPeer(): boolean {
    const victim =
      roster.peers.find((p) => !p.connected && !roster.seatOwners.includes(p.id)) ??
      roster.peers.find((p) => !p.connected);
    if (!victim) return false;
    avatarSync.removePeerImage(victim.id);
    signatureSync.removePeerSpec(victim.id);
    deleteTokenMappingsForPeer(victim.id);
    roster = removePeerFromRoster(roster, victim.id);
    return true;
  }

  function sendTargetSync(sender: HostPeerSender, curState = callbacks.getState()): void {
    sender.send({
      type: 'STATE_SYNC',
      seq,
      roster,
      state: packWireGameState(curState),
      pencilSpinning: remotePencilSpinning,
    });
  }

  function clearRemoteSpin(activeIdx = callbacks.getState().activePlayerIndex): void {
    if (!remotePencilSpinning && remotePencilStopFace === null) return;
    remotePencilSpinning = false;
    remotePencilStopFace = null;
    callbacks.broadcast({
      type: 'UI_PENCIL_SPIN',
      spinning: false,
      activePlayerIndex: activeIdx,
    });
  }

  function syncAvatars(forceTarget?: HostPeerSender, excludePublicId?: string): void {
    const { map, diffs } = avatarSync.refreshHostMap(callbacks.getState(), roster);
    for (const diff of diffs) {
      callbacks.broadcast(
        { type: 'AVATAR_PUT', key: diff.key, dataUrl: diff.dataUrl },
        excludePublicId
      );
    }
    if (forceTarget) {
      for (const [key, dataUrl] of Object.entries(map)) {
        forceTarget.send({ type: 'AVATAR_PUT', key, dataUrl });
      }
    }
  }

  function syncSignatures(forceTarget?: HostPeerSender, excludePublicId?: string): void {
    const { map, diffs } = signatureSync.refreshHostMap(callbacks.getState(), roster);
    for (const diff of diffs) {
      callbacks.broadcast(
        { type: 'SIGNATURE_PUT', key: diff.key, signatureStore: diff.signatureStore },
        excludePublicId
      );
    }
    if (forceTarget && Object.keys(map).length > 0) {
      forceTarget.send({ type: 'SIGNATURE_SYNC', signatures: map });
    }
  }

  function syncSeatProfiles(baseState = callbacks.getState()): { state: GameState; changed: boolean } {
    const next = applyPeerSeatProfiles(baseState, roster);
    if (next !== baseState) {
      callbacks.onSyncHostState?.(next);
      return { state: next, changed: true };
    }
    return { state: baseState, changed: false };
  }

  function syncHostState(nextState: GameState): void {
    roster = resizeRosterSeats(roster, nextState.players.length);
    const { state: synced } = syncSeatProfiles(nextState);
    seq++;
    remotePencilSpinning = false;
    remotePencilStopFace = null;
    callbacks.broadcast({
      type: 'STATE_SYNC',
      seq,
      roster,
      state: packWireGameState(synced),
      pencilSpinning: false,
    });
    syncAvatars();
    syncSignatures();
  }

  function handleHello(msg: Extract<ClientToHostMessage, { type: 'HELLO' }>, sender: HostPeerSender): void {
    let publicId = tokenToPublicId.get(msg.clientToken);
    if (sender.boundPublicId !== null && sender.boundPublicId !== publicId) return;

    if (!publicId) {
      if (roster.peers.length >= MAX_ROOM_PEERS && !evictDisconnectedPeer()) {
        sender.send({ type: 'ERROR', message: 'Room is full.' });
        sender.close();
        return;
      }
      publicId = `guest_${++nextGuestNum}`;
      tokenToPublicId.set(msg.clientToken, publicId);
    }

    sender.onBind(publicId);
    avatarSync.setPeerImage(publicId, msg.avatar?.customImage);
    signatureSync.setPeerSpec(publicId, msg.signatureStore);
    const peerAvatar = stripAvatarCustomImage(msg.avatar);
    roster = upsertPeerInRoster(roster, {
      id: publicId,
      name: msg.name,
      color: msg.color,
      ...(peerAvatar ? { avatar: peerAvatar } : {}),
      ...(msg.signatureStore ? { signatureStore: msg.signatureStore } : {}),
      connected: true,
    });

    const { state: synced, changed: seatChanged } = syncSeatProfiles();
    if (seatChanged) seq++;

    sender.send({
      type: 'WELCOME',
      seq,
      myPeerId: publicId,
      roster,
      state: packWireGameState(synced),
    });

    if (seatChanged) {
      callbacks.broadcast(
        {
          type: 'STATE_SYNC',
          seq,
          roster,
          state: packWireGameState(synced),
          pencilSpinning: remotePencilSpinning,
        },
        publicId
      );
    } else {
      callbacks.broadcast({ type: 'ROSTER_SYNC', roster }, publicId);
    }

    syncAvatars(sender, publicId);
    syncSignatures(sender, publicId);
    callbacks.onSessionChange();
  }

  function handleUpdateProfile(
    msg: Extract<ClientToHostMessage, { type: 'UPDATE_PROFILE' }>,
    publicId: string
  ): void {
    avatarSync.setPeerImage(publicId, msg.avatar?.customImage);
    signatureSync.setPeerSpec(publicId, msg.signatureStore);
    const peerAvatar = stripAvatarCustomImage(msg.avatar);
    roster = upsertPeerInRoster(
      roster,
      {
        id: publicId,
        name: msg.name.trim().slice(0, 20) || 'Guest',
        color: msg.color,
        ...(peerAvatar ? { avatar: peerAvatar } : {}),
        ...(msg.signatureStore ? { signatureStore: msg.signatureStore } : {}),
        connected: true,
      },
      false
    );

    const { state: synced, changed: seatChanged } = syncSeatProfiles();
    if (seatChanged) {
      seq++;
      callbacks.broadcast({
        type: 'STATE_SYNC',
        seq,
        roster,
        state: packWireGameState(synced),
        pencilSpinning: remotePencilSpinning,
      });
    } else {
      callbacks.broadcast({ type: 'ROSTER_SYNC', roster });
    }
    syncAvatars();
    syncSignatures();
    callbacks.onSessionChange();
  }

  return {
    getRoster: () => roster,
    getSeq: () => seq,
    getCustomAvatars: () => avatarSync.getMap(),
    getSyncedSignatures: () => signatureSync.getMap(),
    isRemotePencilSpinning: () => remotePencilSpinning,
    getRemotePencilStopFace: () => remotePencilStopFace,

    handleClientMessage: (raw, sender) => {
      if (!isValidClientMessage(raw) || raw.clientToken === HOST_TOKEN) {
        sender.send({ type: 'ERROR', message: 'Malformed action payload.' });
        return;
      }
      if (raw.type === 'HELLO') {
        handleHello(raw, sender);
        return;
      }

      const publicId = sender.boundPublicId;
      if (!publicId || tokenToPublicId.get(raw.clientToken) !== publicId) return;

      if (raw.type === 'PING') {
        sender.send({ type: 'PONG', ts: raw.ts });
        return;
      }
      if (raw.type === 'UPDATE_PROFILE') {
        handleUpdateProfile(raw, publicId);
        return;
      }
      if (raw.type === 'UI_TURN_PING') {
        const peer = roster.peers.find((p) => p.id === publicId);
        const res = attemptTurnPing(publicId, peer?.name ?? 'Guest');
        if (!res.ok && res.waitSec) {
          sender.send({ type: 'ERROR', message: `Ping cooldown (${res.waitSec}s).` });
        }
        return;
      }

      const curState = callbacks.getState();
      if (roster.seatOwners[curState.activePlayerIndex] !== publicId) {
        sender.send({ type: 'ERROR', message: 'Not your turn.' });
        if (raw.type === 'ACTION_REQUEST') sendTargetSync(sender, curState);
        return;
      }

      if (raw.type === 'ACTION_REQUEST') {
        const inEscalator = curState.phase === 'ESCALATOR_RIDE' || curState.phase === 'ESCALATOR_UNDO';
        if (inEscalator && raw.action.type !== 'ADVANCE_STEP') return;
        if (raw.seq !== seq) {
          sendTargetSync(sender, curState);
          return;
        }
        const nextState = callbacks.onApplyHostAction(raw.action);
        if (nextState !== curState) syncHostState(nextState);
        else sendTargetSync(sender, curState);
        return;
      }

      if (raw.type === 'UI_PENCIL_SPIN') {
        remotePencilSpinning = raw.spinning;
        remotePencilStopFace = raw.spinning ? null : (raw.stopFace ?? null);
        callbacks.broadcast(
          {
            type: 'UI_PENCIL_SPIN',
            spinning: raw.spinning,
            activePlayerIndex: curState.activePlayerIndex,
            ...(raw.stopFace !== undefined ? { stopFace: raw.stopFace } : {}),
          },
          publicId
        );
        callbacks.onSessionChange();
      }
    },

    handlePeerDisconnect: (publicId) => {
      const existing = roster.peers.find((p) => p.id === publicId);
      if (!existing) return;
      const activeIdx = callbacks.getState().activePlayerIndex;
      const wasActive = roster.seatOwners[activeIdx] === publicId;
      roster = upsertPeerInRoster(roster, { ...existing, connected: false }, false);
      callbacks.broadcast({ type: 'ROSTER_SYNC', roster });
      if (wasActive) clearRemoteSpin(activeIdx);
      callbacks.onSessionChange();
    },

    syncHostState,

    notifyPencilSpin: (spinning, stopFace) => {
      remotePencilSpinning = spinning;
      remotePencilStopFace = spinning ? null : (stopFace ?? null);
      callbacks.broadcast({
        type: 'UI_PENCIL_SPIN',
        spinning,
        activePlayerIndex: callbacks.getState().activePlayerIndex,
        ...(stopFace !== undefined ? { stopFace } : {}),
      });
    },

    sendHostTurnPing: () => {
      const peerLabel =
        callbacks.getState().players.find((_, i) => roster.seatOwners[i] === HOST_TOKEN)?.name ?? 'Host';
      return attemptTurnPing(HOST_TOKEN, peerLabel);
    },

    assignSeat: (seatIndex, ownerId) => {
      roster = assignSeatOwner(roster, seatIndex, ownerId || HOST_TOKEN);
      const { state: synced, changed } = syncSeatProfiles();
      if (changed) {
        syncHostState(synced);
      } else {
        callbacks.broadcast({ type: 'ROSTER_SYNC', roster });
        if (seatIndex === callbacks.getState().activePlayerIndex) clearRemoteSpin(seatIndex);
      }
      callbacks.onSessionChange();
    },

    kickPeer: (publicId) => {
      const activeIdx = callbacks.getState().activePlayerIndex;
      const wasActive = roster.seatOwners[activeIdx] === publicId;
      callbacks.sendToPeer(publicId, { type: 'ERROR', message: 'You were removed by the host.' });
      callbacks.closePeer(publicId);
      avatarSync.removePeerImage(publicId);
      signatureSync.removePeerSpec(publicId);
      deleteTokenMappingsForPeer(publicId);
      roster = removePeerFromRoster(roster, publicId);
      callbacks.broadcast({ type: 'ROSTER_SYNC', roster });
      syncAvatars();
      syncSignatures();
      if (wasActive) clearRemoteSpin(activeIdx);
      callbacks.onSessionChange();
    },
  };
}
