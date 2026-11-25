import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { AvatarSpec } from '../config/avatarTypes';
import { isValidGameAction } from '../engine/actions';
import type { GameAction } from '../engine/actions';
import type { GameState, PencilFace } from '../engine/types';
import { createReconnectBackoff, isTransientSignalingError, PEER_ICE_CONFIG } from './avatarSync';
import type { ReconnectBackoff } from './avatarSync';
import { createGuestTransport } from './guestTransport';
import { createHostRouter } from './hostRouter';
import type { HostRouter } from './hostRouter';
import {
  canClientAct,
  generateRoomCode,
  MAX_ROOM_PEERS,
  normalizeRoomCode,
  roomCodeToPeerId,
} from './protocol';
import type { HostToClientMessage, NetRole, RoomRoster } from './protocol';

export interface MultiplayerSessionCallbacks {
  getState: () => GameState;
  onApplyHostAction: (action: GameAction) => GameState;
  onReceiveRemoteState: (state: GameState, seq: number) => void;
  onActionAck?: () => void;
  onSyncHostState?: (state: GameState) => void;
  onSessionChange: () => void;
  onTurnPing?: (ping: { fromName: string; targetPlayerId: string; targetPlayerName: string }) => void;
  onError?: (message: string) => void;
}

export interface MultiplayerSession {
  getRole: () => NetRole;
  getRoster: () => RoomRoster | null;
  getMyPeerId: () => string;
  getSeq: () => number;
  getRoomCode: () => string | null;
  getCustomAvatars: () => Record<string, string>;
  isRemotePencilSpinning: () => boolean;
  getRemotePencilStopFace: () => PencilFace | null;
  isReconnecting: () => boolean;
  isLocalTurn: (state: GameState) => boolean;
  shouldTickEscalator: () => boolean;
  hostRoom: (customCode?: string) => Promise<string>;
  joinRoom: (roomCode: string, profile: { name: string; color: string; avatar?: AvatarSpec }) => Promise<void>;
  sendOrApplyAction: (action: GameAction) => boolean;
  broadcastHostState: (nextState: GameState) => void;
  notifyPencilSpin: (spinning: boolean, stopFace?: PencilFace) => void;
  sendTurnPing: () => { ok: boolean; waitSec?: number };
  assignSeat: (seatIndex: number, ownerId: string) => void;
  updateMyProfile: (profile: { name: string; color: string; avatar?: AvatarSpec }) => void;
  kickPeer: (peerId: string) => void;
  disconnect: () => void;
}

/** Coordinates host-authoritative or guest WebRTC multiplayer sessions over PeerJS. */
export function createMultiplayerSession(callbacks: MultiplayerSessionCallbacks): MultiplayerSession {
  let role: NetRole = 'offline';
  let hostRoomCode: string | null = null;
  let hostGeneration = 0;
  let openConns = 0;
  let hostPeer: Peer | null = null;
  let hostRouter: HostRouter | null = null;
  let hostBackoff: ReconnectBackoff | null = null;
  const connByPublicId = new Map<string, DataConnection>();

  const guest = createGuestTransport({
    getState: callbacks.getState,
    onReceiveRemoteState: callbacks.onReceiveRemoteState,
    onActionAck: callbacks.onActionAck,
    onSessionChange: callbacks.onSessionChange,
    onTurnPing: callbacks.onTurnPing,
    onError: callbacks.onError,
    onLostSession: () => {
      if (role === 'guest') role = 'offline';
    },
  });

  function cleanup(): void {
    hostGeneration++;
    openConns = 0;
    hostBackoff?.cancel();
    hostBackoff = null;
    for (const c of connByPublicId.values()) c.close();
    connByPublicId.clear();
    hostPeer?.destroy();
    hostPeer = null;
    hostRouter = null;
    hostRoomCode = null;
    guest.cleanup();
    role = 'offline';
  }

  function currentRoster(): RoomRoster | null {
    return role === 'host' && hostRouter ? hostRouter.getRoster() : guest.getRoster();
  }

  function broadcastToGuests(msg: HostToClientMessage, excludePublicId?: string): void {
    for (const [id, conn] of connByPublicId.entries()) {
      if (id !== excludePublicId && conn.open) conn.send(msg);
    }
  }

  function attachGuestConnection(conn: DataConnection, gen: number, onRelease: () => void): void {
    let boundPublicId: string | null = null;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        onRelease();
      }
    };

    conn.on('data', (raw) => {
      if (gen !== hostGeneration || role !== 'host' || !hostRouter) return;
      hostRouter.handleClientMessage(raw, {
        boundPublicId,
        send: (msg) => {
          if (conn.open) conn.send(msg);
        },
        close: () => conn.close(),
        onBind: (publicId) => {
          boundPublicId = publicId;
          const prev = connByPublicId.get(publicId);
          connByPublicId.set(publicId, conn);
          if (prev && prev !== conn) prev.close();
        },
      });
    });

    const handleDrop = () => {
      if (gen !== hostGeneration) return;
      release();
      if (!boundPublicId || connByPublicId.get(boundPublicId) !== conn) return;
      connByPublicId.delete(boundPublicId);
      hostRouter?.handlePeerDisconnect(boundPublicId);
    };

    conn.on('close', handleDrop);
    conn.on('error', handleDrop);
  }

  function hostRoom(customCode?: string): Promise<string> {
    cleanup();
    const gen = hostGeneration;
    const code = normalizeRoomCode(customCode ?? '') || generateRoomCode();
    if (code.length < 4) return Promise.reject(new Error('Room code must be at least 4 characters.'));

    role = 'host';
    hostRoomCode = code;
    hostRouter = createHostRouter(code, callbacks.getState(), {
      getState: callbacks.getState,
      onApplyHostAction: callbacks.onApplyHostAction,
      onSyncHostState: callbacks.onSyncHostState,
      onSessionChange: callbacks.onSessionChange,
      onTurnPing: callbacks.onTurnPing,
      sendToPeer: (publicId, msg) => {
        const c = connByPublicId.get(publicId);
        if (c?.open) c.send(msg);
      },
      broadcast: broadcastToGuests,
      closePeer: (publicId) => {
        connByPublicId.get(publicId)?.close();
        connByPublicId.delete(publicId);
      },
    });

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled || gen !== hostGeneration) return;
        settled = true;
        cleanup();
        reject(new Error('Timed out creating room.'));
        callbacks.onSessionChange();
      }, 15000);

      const p = (hostPeer = new Peer(roomCodeToPeerId(code), { config: PEER_ICE_CONFIG }));
      const backoff = (hostBackoff = createReconnectBackoff(
        () => {
          if (gen === hostGeneration && !p.destroyed && p.disconnected) {
            try {
              p.reconnect();
            } catch {
              /* ignore */
            }
          }
        },
        () => {
          if (gen === hostGeneration) {
            callbacks.onError?.(
              'Signaling server unreachable — active players stay connected, but new joins are paused.'
            );
          }
        }
      ));

      p.on('open', () => {
        if (gen !== hostGeneration) return;
        backoff.reset();
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          callbacks.onSessionChange();
          resolve(code);
        }
      });
      p.on('disconnected', () => {
        if (gen === hostGeneration && !p.destroyed) backoff.schedule();
      });
      p.on('connection', (conn) => {
        if (gen !== hostGeneration) return;
        if (openConns >= MAX_ROOM_PEERS * 2) {
          conn.close();
          return;
        }
        openConns++;
        attachGuestConnection(conn, gen, () => {
          openConns = Math.max(0, openConns - 1);
        });
      });
      p.on('error', (err) => {
        if (gen !== hostGeneration) return;
        const msg = err.message || 'PeerJS host error.';
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          reject(new Error(msg));
        } else if (isTransientSignalingError(err) && !backoff.isExhausted()) {
          console.warn('[TopShop Net] Host signaling error (retrying):', msg);
        } else {
          callbacks.onError?.(msg);
        }
        callbacks.onSessionChange();
      });
    });
  }

  function joinRoom(rawCode: string, profile: { name: string; color: string; avatar?: AvatarSpec }): Promise<void> {
    cleanup();
    const code = normalizeRoomCode(rawCode);
    if (code.length < 4) return Promise.reject(new Error('Enter a valid room code.'));
    role = 'guest';
    return guest.joinRoom(code, profile);
  }

  return {
    getRole: () => role,
    getRoster: currentRoster,
    getMyPeerId: () => guest.getMyPeerId(),
    getSeq: () => (role === 'host' && hostRouter ? hostRouter.getSeq() : guest.getSeq()),
    getRoomCode: () => (role === 'host' ? hostRoomCode : guest.getRoomCode()),
    getCustomAvatars: () => (role === 'host' && hostRouter ? hostRouter.getCustomAvatars() : guest.getCustomAvatars()),
    isRemotePencilSpinning: () =>
      role === 'host' && hostRouter ? hostRouter.isRemotePencilSpinning() : guest.isRemotePencilSpinning(),
    getRemotePencilStopFace: () =>
      role === 'host' && hostRouter ? hostRouter.getRemotePencilStopFace() : guest.getRemotePencilStopFace(),
    isReconnecting: () => guest.isReconnecting(),
    isLocalTurn: (state) =>
      role === 'guest'
        ? guest.isLocalTurn(state)
        : canClientAct(role, currentRoster(), '', state.activePlayerIndex),
    shouldTickEscalator: () => role !== 'guest',
    hostRoom,
    joinRoom,
    sendOrApplyAction: (action) => {
      if (role === 'guest') return guest.sendAction(action);
      const curState = callbacks.getState();
      if (!canClientAct(role, currentRoster(), '', curState.activePlayerIndex) || !isValidGameAction(action)) {
        return false;
      }
      const next = callbacks.onApplyHostAction(action);
      if (role === 'host' && next !== curState) hostRouter?.syncHostState(next);
      return next !== curState;
    },
    broadcastHostState: (nextState) => {
      if (role === 'host') hostRouter?.syncHostState(nextState);
    },
    notifyPencilSpin: (spinning, stopFace) => {
      if (role === 'host') hostRouter?.notifyPencilSpin(spinning, stopFace);
      else if (role === 'guest') guest.notifyPencilSpin(spinning, stopFace);
    },
    sendTurnPing: () => {
      if (role === 'host' && hostRouter) return hostRouter.sendHostTurnPing();
      if (role === 'guest') return guest.sendTurnPing();
      return { ok: false };
    },
    assignSeat: (seatIndex, ownerId) => {
      if (role === 'host') hostRouter?.assignSeat(seatIndex, ownerId);
    },
    updateMyProfile: (profile) => {
      if (role === 'guest') guest.updateProfile(profile);
    },
    kickPeer: (peerId) => {
      if (role === 'host') hostRouter?.kickPeer(peerId);
    },
    disconnect: () => {
      cleanup();
      callbacks.onSessionChange();
    },
  };
}
