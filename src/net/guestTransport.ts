import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { AvatarSpec } from '../config/avatarTypes';
import type { SignatureStoreSpec } from '../config/signatureStore';
import { isValidGameAction } from '../engine/actions';
import type { GameAction } from '../engine/actions';
import type { GameState, PencilFace } from '../engine/types';
import {
  createAvatarSyncStore,
  createHeartbeatMonitor,
  createReconnectBackoff,
  GUEST_RECONNECT_DELAYS_MS,
  PEER_ICE_CONFIG,
} from './avatarSync';
import type { ReconnectBackoff } from './avatarSync';
import {
  canClientAct,
  getOrCreateClientToken,
  getOrCreateGuestToken,
  HEX_COLOR_RE,
  isValidHostMessage,
  normalizeRoomCode,
  roomCodeToPeerId,
} from './protocol';
import type { ClientToHostMessage, HostToClientMessage, RoomRoster } from './protocol';
import { createSignatureSyncStore } from './signatureSync';
import { hydrateWireGameState } from './wireState';

export interface GuestTransportCallbacks {
  getState: () => GameState;
  onReceiveRemoteState: (state: GameState, seq: number) => void;
  onActionAck?: () => void;
  onSessionChange: () => void;
  onTurnPing?: (ping: { fromName: string; targetPlayerId: string; targetPlayerName: string }) => void;
  onError?: (message: string) => void;
  onLostSession: () => void;
}

export interface GuestTransport {
  cleanup: () => void;
  joinRoom: (
    rawCode: string,
    profile: { name: string; color: string; avatar?: AvatarSpec; signatureStore?: SignatureStoreSpec }
  ) => Promise<void>;
  getRoster: () => RoomRoster | null;
  getMyPeerId: () => string;
  getSeq: () => number;
  getRoomCode: () => string | null;
  getCustomAvatars: () => Record<string, string>;
  getSyncedSignatures: () => Record<string, SignatureStoreSpec>;
  isRemotePencilSpinning: () => boolean;
  getRemotePencilStopFace: () => PencilFace | null;
  isReconnecting: () => boolean;
  isLocalTurn: (state: GameState) => boolean;
  sendAction: (action: GameAction) => boolean;
  notifyPencilSpin: (spinning: boolean, stopFace?: PencilFace) => void;
  sendTurnPing: () => { ok: boolean; waitSec?: number };
  updateProfile: (profile: {
    name: string;
    color: string;
    avatar?: AvatarSpec;
    signatureStore?: SignatureStoreSpec;
  }) => void;
}

/** Manages guest-side PeerJS transport, reconnects, heartbeat, and incoming host syncs. */
export function createGuestTransport(callbacks: GuestTransportCallbacks): GuestTransport {
  let active = false;
  let clientToken = getOrCreateClientToken();
  let myPeerId = '';
  let roomCode: string | null = null;
  let seq = 0;
  let generation = 0;
  let connAttempt = 0;
  let reconnecting = false;
  let remoteSpinning = false;
  let remoteStopFace: PencilFace | null = null;
  let roster: RoomRoster | null = null;
  let peer: Peer | null = null;
  let hostConn: DataConnection | null = null;
  let backoff: ReconnectBackoff | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let profile: { name: string; color: string; avatar?: AvatarSpec; signatureStore?: SignatureStoreSpec } | null = null;
  let triggerDrop: (() => void) | null = null;
  let pingLastAt = -Infinity;
  let pingRecent: number[] = [];
  let pingBlockedUntil = 0;

  const avatarSync = createAvatarSyncStore();
  const signatureSync = createSignatureSyncStore();
  const heartbeat = createHeartbeatMonitor(
    () => {
      if (active && hostConn?.open) {
        hostConn.send({ type: 'PING', clientToken, ts: Date.now() } satisfies ClientToHostMessage);
      }
    },
    () => triggerDrop?.()
  );

  function teardownSocket(): void {
    connAttempt++;
    heartbeat.stop();
    triggerDrop = null;
    if (connectTimer !== null) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    hostConn?.close();
    peer?.destroy();
    hostConn = null;
    peer = null;
  }

  function cleanup(): void {
    active = false;
    generation++;
    backoff?.cancel();
    backoff = null;
    reconnecting = false;
    profile = null;
    avatarSync.clear();
    signatureSync.clear();
    teardownSocket();
    roomCode = null;
    myPeerId = '';
    roster = null;
    seq = 0;
    remoteSpinning = false;
    remoteStopFace = null;
  }

  function joinRoom(
    rawCode: string,
    nextProfile: { name: string; color: string; avatar?: AvatarSpec; signatureStore?: SignatureStoreSpec }
  ): Promise<void> {
    cleanup();
    const gen = generation;
    const code = normalizeRoomCode(rawCode);
    if (code.length < 4) {
      return Promise.reject(new Error('Enter a valid room code.'));
    }

    active = true;
    clientToken = getOrCreateGuestToken(code, nextProfile.name);
    roomCode = code;
    profile = { ...nextProfile };

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const failPermanent = (msg: string) => {
        if (gen !== generation) return;
        const wasSettled = settled;
        settled = true;
        cleanup();
        callbacks.onLostSession();
        if (!wasSettled) {
          reject(new Error(msg));
        } else {
          callbacks.onError?.(msg);
        }
        callbacks.onSessionChange();
      };

      const scheduleReconnect = () => {
        if (gen !== generation || !active || !backoff) return;
        teardownSocket();
        reconnecting = true;
        callbacks.onSessionChange();
        backoff.schedule();
      };

      const handleIncomingMessage = (raw: HostToClientMessage) => {
        heartbeat.touch();
        if (raw.type === 'PONG') return;
        if (raw.type === 'WELCOME' || raw.type === 'STATE_SYNC') {
          const hydrated = hydrateWireGameState(raw.state);
          if (!hydrated) return;
          if (raw.type === 'STATE_SYNC') {
            if (raw.seq < seq) return;
            if (raw.seq === seq) {
              callbacks.onActionAck?.();
              return;
            }
          } else {
            avatarSync.clear();
            signatureSync.clear();
            myPeerId = raw.myPeerId;
            const wasReconnecting = reconnecting;
            reconnecting = false;
            backoff?.reset();
            if (connectTimer !== null) {
              clearTimeout(connectTimer);
              connectTimer = null;
            }
            heartbeat.start();
            if (!settled) {
              settled = true;
              resolve();
            } else if (wasReconnecting) {
              callbacks.onSessionChange();
            }
          }
          seq = raw.seq;
          roster = raw.roster;
          remoteSpinning = raw.type === 'STATE_SYNC' ? raw.pencilSpinning : false;
          remoteStopFace = null;
          callbacks.onReceiveRemoteState(hydrated, raw.seq);
          return;
        }
        if (raw.type === 'ROSTER_SYNC') {
          roster = raw.roster;
          callbacks.onSessionChange();
        } else if (raw.type === 'AVATAR_SYNC') {
          avatarSync.setRemoteMap(raw.avatars);
          callbacks.onSessionChange();
        } else if (raw.type === 'AVATAR_PUT') {
          if (avatarSync.applyRemotePut(raw.key, raw.dataUrl)) callbacks.onSessionChange();
        } else if (raw.type === 'SIGNATURE_SYNC') {
          signatureSync.setRemoteMap(raw.signatures);
          callbacks.onSessionChange();
        } else if (raw.type === 'SIGNATURE_PUT') {
          if (signatureSync.applyRemotePut(raw.key, raw.signatureStore)) callbacks.onSessionChange();
        } else if (raw.type === 'UI_PENCIL_SPIN') {
          remoteSpinning = raw.spinning;
          remoteStopFace = raw.spinning ? null : (raw.stopFace ?? null);
          callbacks.onSessionChange();
        } else if (raw.type === 'UI_TURN_PING') {
          callbacks.onTurnPing?.({
            fromName: raw.fromName,
            targetPlayerId: raw.targetPlayerId,
            targetPlayerName: raw.targetPlayerName,
          });
        } else if (raw.type === 'ERROR') {
          if (!settled || raw.message === 'You were removed by the host.') failPermanent(raw.message);
          else callbacks.onError?.(raw.message);
        }
      };

      const openConnection = () => {
        if (gen !== generation || !active || !profile) return;
        teardownSocket();
        const attempt = connAttempt;
        const curProfile = profile;
        const p = (peer = new Peer({ config: PEER_ICE_CONFIG }));
        const onDrop = (msg: string) => {
          if (gen !== generation || attempt !== connAttempt) return;
          if (!settled) failPermanent(msg);
          else scheduleReconnect();
        };

        connectTimer = setTimeout(
          () =>
            onDrop(
              'Timed out joining room. Verify the code — or if on mobile/strict Wi-Fi, try switching networks or hosts.'
            ),
          settled ? 10000 : 15000
        );
        triggerDrop = () => onDrop('Host connection timed out.');

        p.on('open', () => {
          if (gen !== generation || attempt !== connAttempt) return;
          const conn = (hostConn = p.connect(roomCodeToPeerId(code), { reliable: true }));
          const safeColor = HEX_COLOR_RE.test(curProfile.color) ? curProfile.color : '#3498db';

          conn.on('open', () => {
            if (gen !== generation || attempt !== connAttempt) return;
            conn.send({
              type: 'HELLO',
              clientToken,
              name: curProfile.name || 'Guest',
              color: safeColor,
              ...(curProfile.avatar ? { avatar: curProfile.avatar } : {}),
              ...(curProfile.signatureStore ? { signatureStore: curProfile.signatureStore } : {}),
            } satisfies ClientToHostMessage);
          });
          conn.on('data', (raw) => {
            if (gen === generation && attempt === connAttempt && isValidHostMessage(raw)) {
              handleIncomingMessage(raw);
            }
          });
          conn.on('close', () => onDrop('Connection to host closed.'));
          conn.on('error', (err) => {
            if (!settled || !conn.open) onDrop(err.message || 'Connection error.');
            else callbacks.onError?.(err.message || 'Connection error.');
          });
        });

        p.on('error', (err) => {
          if (gen !== generation || attempt !== connAttempt) return;
          if (!settled || !hostConn?.open) {
            onDrop(err.message || 'Failed to connect to room.');
          } else {
            console.warn(
              '[TopShop Net] Ignoring transient guest signaling error (P2P still open):',
              err.message || err.type
            );
          }
        });
      };

      backoff = createReconnectBackoff(
        () => openConnection(),
        () => failPermanent('Lost connection to host after multiple retries. Rejoin from Online Lobby.'),
        GUEST_RECONNECT_DELAYS_MS
      );
      openConnection();
    });
  }

  return {
    cleanup,
    joinRoom,
    getRoster: () => roster,
    getMyPeerId: () => myPeerId,
    getSeq: () => seq,
    getRoomCode: () => roomCode,
    getCustomAvatars: () => avatarSync.getMap(),
    getSyncedSignatures: () => signatureSync.getMap(),
    isRemotePencilSpinning: () => remoteSpinning,
    getRemotePencilStopFace: () => remoteStopFace,
    isReconnecting: () => reconnecting,
    isLocalTurn: (state) => !reconnecting && canClientAct('guest', roster, myPeerId, state.activePlayerIndex),
    sendAction: (action) => {
      const curState = callbacks.getState();
      if (
        !active ||
        reconnecting ||
        !canClientAct('guest', roster, myPeerId, curState.activePlayerIndex) ||
        !isValidGameAction(action)
      ) {
        return false;
      }
      if (!hostConn?.open) {
        callbacks.onError?.('Not connected to host.');
        return false;
      }
      hostConn.send({ type: 'ACTION_REQUEST', clientToken, seq, action } satisfies ClientToHostMessage);
      return true;
    },
    notifyPencilSpin: (spinning, stopFace) => {
      const curState = callbacks.getState();
      if (
        !active ||
        reconnecting ||
        !hostConn?.open ||
        !canClientAct('guest', roster, myPeerId, curState.activePlayerIndex)
      ) {
        return;
      }
      hostConn.send({
        type: 'UI_PENCIL_SPIN',
        clientToken,
        spinning,
        ...(stopFace !== undefined ? { stopFace } : {}),
      } satisfies ClientToHostMessage);
    },
    sendTurnPing: () => {
      if (!active || reconnecting || !hostConn?.open) return { ok: false };
      const now = Date.now();
      if (now < pingBlockedUntil) {
        return { ok: false, waitSec: Math.max(1, Math.ceil((pingBlockedUntil - now) / 1000)) };
      }
      if (now - pingLastAt < 1000) return { ok: false, waitSec: 1 };
      pingRecent = pingRecent.filter((ts) => now - ts <= 10_000);
      if (pingRecent.length >= 3) {
        pingBlockedUntil = now + 12_000;
        pingRecent = [];
        return { ok: false, waitSec: 12 };
      }
      pingLastAt = now;
      pingRecent.push(now);
      pingBlockedUntil = 0;
      hostConn.send({ type: 'UI_TURN_PING', clientToken } satisfies ClientToHostMessage);
      return { ok: true };
    },
    updateProfile: (nextProfile) => {
      if (!active) return;
      profile = { ...nextProfile };
      if (!hostConn?.open) return;
      const name = nextProfile.name.trim().slice(0, 20) || 'Guest';
      const color = HEX_COLOR_RE.test(nextProfile.color) ? nextProfile.color : '#3498db';
      hostConn.send({
        type: 'UPDATE_PROFILE',
        clientToken,
        name,
        color,
        ...(nextProfile.avatar ? { avatar: nextProfile.avatar } : {}),
        ...(nextProfile.signatureStore ? { signatureStore: nextProfile.signatureStore } : {}),
      } satisfies ClientToHostMessage);
    },
  };
}
