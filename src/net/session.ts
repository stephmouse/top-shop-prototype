import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { stripAvatarCustomImage } from '../config/avatarTypes';
import type { AvatarSpec } from '../config/avatarTypes';
import { isValidGameAction, redactStateForClient } from '../engine/actions';
import type { GameAction } from '../engine/actions';
import type { GameState, PencilFace } from '../engine/types';
import { applyPeerSeatProfiles, createAvatarSyncStore, createReconnectBackoff, isTransientSignalingError, PEER_ICE_CONFIG } from './avatarSync';
import type { ReconnectBackoff } from './avatarSync';
import {
  assignSeatOwner, canClientAct, createDefaultRoster, generateRoomCode, getOrCreateClientToken,
  getOrCreateGuestToken, HEX_COLOR_RE, HOST_TOKEN, isValidClientMessage, isValidHostMessage,
  MAX_ROOM_PEERS, normalizeRoomCode, removePeerFromRoster, resizeRosterSeats, roomCodeToPeerId, upsertPeerInRoster,
} from './protocol';
import type { ClientToHostMessage, HostToClientMessage, NetRole, RoomRoster } from './protocol';

export interface MultiplayerSessionCallbacks {
  getState: () => GameState;
  onApplyHostAction: (action: GameAction) => GameState;
  onReceiveRemoteState: (state: GameState, seq: number) => void;
  onSyncHostState?: (state: GameState) => void;
  onSessionChange: () => void;
  onError?: (message: string) => void;
}

export interface MultiplayerSession {
  getRole: () => NetRole;
  getRoster: () => RoomRoster | null;
  getClientToken: () => string;
  getSeq: () => number;
  getRoomCode: () => string | null;
  getCustomAvatars: () => Record<string, string>;
  isRemotePencilSpinning: () => boolean;
  getRemotePencilStopFace: () => PencilFace | null;
  isLocalTurn: (state: GameState) => boolean;
  shouldTickEscalator: () => boolean;
  hostRoom: (customCode?: string) => Promise<string>;
  joinRoom: (roomCode: string, profile: { name: string; color: string; avatar?: AvatarSpec }) => Promise<void>;
  sendOrApplyAction: (action: GameAction) => boolean;
  broadcastHostState: (nextState: GameState) => void;
  notifyPencilSpin: (spinning: boolean, stopFace?: PencilFace) => void;
  assignSeat: (seatIndex: number, ownerToken: string) => void;
  updateMyProfile: (profile: { name: string; color: string; avatar?: AvatarSpec }) => void;
  kickPeer: (clientToken: string) => void;
  disconnect: () => void;
}

export function createMultiplayerSession(callbacks: MultiplayerSessionCallbacks): MultiplayerSession {
  let clientToken = getOrCreateClientToken(), role: NetRole = 'offline', roomCode: string | null = null;
  let seq = 0, generation = 0, openConns = 0, remotePencilSpinning = false;
  let remotePencilStopFace: PencilFace | null = null;
  let roster: RoomRoster | null = null, peer: Peer | null = null, hostConn: DataConnection | null = null, hostBackoff: ReconnectBackoff | null = null;
  const connByToken = new Map<string, DataConnection>(), avatarSync = createAvatarSyncStore();

  function cleanup(): void {
    generation++; openConns = 0; hostBackoff?.cancel(); hostBackoff = null;
    for (const c of connByToken.values()) c.close();
    connByToken.clear(); avatarSync.clear(); hostConn?.close(); peer?.destroy();
    hostConn = null; peer = null; role = 'offline'; roomCode = null; roster = null; seq = 0; remotePencilSpinning = false; remotePencilStopFace = null;
  }

  function broadcastToGuests(msg: HostToClientMessage, excludeToken?: string): void {
    for (const [token, conn] of connByToken.entries()) if (token !== excludeToken && conn.open) conn.send(msg);
  }
  function clearRemoteSpin(activeIdx = callbacks.getState().activePlayerIndex): void {
    if (!remotePencilSpinning && remotePencilStopFace === null) return;
    remotePencilSpinning = false; remotePencilStopFace = null;
    broadcastToGuests({ type: 'UI_PENCIL_SPIN', spinning: false, activePlayerIndex: activeIdx });
  }
  function syncAvatars(forceTarget?: DataConnection, excludeToken?: string): void {
    const { map, diffs } = avatarSync.refreshHostMap(callbacks.getState(), roster);
    for (const diff of diffs) {
      broadcastToGuests({ type: 'AVATAR_PUT', key: diff.key, dataUrl: diff.dataUrl }, excludeToken);
    }
    if (forceTarget?.open) {
      for (const [key, dataUrl] of Object.entries(map)) {
        forceTarget.send({ type: 'AVATAR_PUT', key, dataUrl } satisfies HostToClientMessage);
      }
    }
  }
  function syncSeatProfiles(baseState = callbacks.getState()): { state: GameState; changed: boolean } {
    const next = applyPeerSeatProfiles(baseState, roster);
    if (next !== baseState) { callbacks.onSyncHostState?.(next); return { state: next, changed: true }; }
    return { state: baseState, changed: false };
  }
  function syncHostState(nextState: GameState): void {
    if (role !== 'host' || !roster) return;
    roster = resizeRosterSeats(roster, nextState.players.length);
    const { state: synced } = syncSeatProfiles(nextState);
    seq++; remotePencilSpinning = false; remotePencilStopFace = null;
    broadcastToGuests({ type: 'STATE_SYNC', seq, roster, state: redactStateForClient(synced), pencilSpinning: false }); syncAvatars();
  }

  function attachGuestConnection(conn: DataConnection, gen: number, onRelease: () => void): void {
    let boundToken: string | null = null, released = false;
    const release = () => { if (!released) { released = true; onRelease(); } };
    conn.on('data', (raw) => {
      if (gen !== generation || role !== 'host' || !roster) return;
      if (!isValidClientMessage(raw)) { conn.open && conn.send({ type: 'ERROR', message: 'Malformed action payload.' }); return; }
      if (raw.type === 'HELLO') {
        if (boundToken !== null && boundToken !== raw.clientToken) return;
        const knownPeer = roster.peers.some((p) => p.clientToken === raw.clientToken);
        if (!knownPeer && roster.peers.length >= MAX_ROOM_PEERS) { conn.open && conn.send({ type: 'ERROR', message: 'Room is full.' }); conn.close(); release(); return; }
        boundToken = raw.clientToken;
        const prev = connByToken.get(boundToken); if (prev && prev !== conn) prev.close();
        connByToken.set(boundToken, conn); avatarSync.setPeerImage(boundToken, raw.avatar?.customImage);
        const peerAvatar = stripAvatarCustomImage(raw.avatar);
        roster = upsertPeerInRoster(roster, { clientToken: raw.clientToken, peerId: conn.peer, name: raw.name, color: raw.color, ...(peerAvatar ? { avatar: peerAvatar } : {}), connected: true });
        const { state: synced, changed: seatChanged } = syncSeatProfiles();
        if (seatChanged) seq++;
        conn.send({ type: 'WELCOME', seq, roster, state: redactStateForClient(synced) });
        if (seatChanged) broadcastToGuests({ type: 'STATE_SYNC', seq, roster, state: redactStateForClient(synced), pencilSpinning: remotePencilSpinning }, boundToken);
        else broadcastToGuests({ type: 'ROSTER_SYNC', roster }, boundToken);
        syncAvatars(conn, boundToken); callbacks.onSessionChange(); return;
      }
      if (boundToken !== raw.clientToken) return;
      if (raw.type === 'UPDATE_PROFILE') {
        avatarSync.setPeerImage(boundToken, raw.avatar?.customImage);
        const peerAvatar = stripAvatarCustomImage(raw.avatar);
        roster = upsertPeerInRoster(roster, {
          clientToken: boundToken, peerId: conn.peer, name: raw.name.trim().slice(0, 20) || 'Guest',
          color: raw.color, ...(peerAvatar ? { avatar: peerAvatar } : {}), connected: true,
        }, false);
        const { state: synced, changed: seatChanged } = syncSeatProfiles();
        if (seatChanged) { seq++; broadcastToGuests({ type: 'STATE_SYNC', seq, roster, state: redactStateForClient(synced), pencilSpinning: remotePencilSpinning }); }
        else broadcastToGuests({ type: 'ROSTER_SYNC', roster });
        syncAvatars(); callbacks.onSessionChange(); return;
      }
      const curState = callbacks.getState();
      if (roster.seatOwners[curState.activePlayerIndex] !== boundToken) { conn.open && conn.send({ type: 'ERROR', message: 'Not your turn.' }); return; }
      if (raw.type === 'ACTION_REQUEST') {
        if (raw.seq !== seq || curState.phase === 'ESCALATOR_RIDE' || curState.phase === 'ESCALATOR_UNDO') return;
        const nextState = callbacks.onApplyHostAction(raw.action); if (nextState !== curState) syncHostState(nextState);
      } else if (raw.type === 'UI_PENCIL_SPIN') {
        remotePencilSpinning = raw.spinning;
        remotePencilStopFace = raw.spinning ? null : (raw.stopFace ?? null);
        broadcastToGuests(
          { type: 'UI_PENCIL_SPIN', spinning: raw.spinning, activePlayerIndex: curState.activePlayerIndex, ...(raw.stopFace !== undefined ? { stopFace: raw.stopFace } : {}) },
          boundToken
        );
        callbacks.onSessionChange();
      }
    });
    const handleDrop = () => {
      if (gen !== generation) return;
      release();
      if (!boundToken || !roster || connByToken.get(boundToken) !== conn) return;
      connByToken.delete(boundToken);
      const existing = roster.peers.find((p) => p.clientToken === boundToken); if (!existing) return;
      const activeIdx = callbacks.getState().activePlayerIndex, wasActive = roster.seatOwners[activeIdx] === boundToken;
      roster = upsertPeerInRoster(roster, { ...existing, connected: false }, false); broadcastToGuests({ type: 'ROSTER_SYNC', roster });
      if (wasActive) clearRemoteSpin(activeIdx); callbacks.onSessionChange();
    };
    conn.on('close', handleDrop); conn.on('error', handleDrop);
  }

  function hostRoom(customCode?: string): Promise<string> {
    cleanup();
    const gen = generation;
    const code = normalizeRoomCode(customCode ?? '') || generateRoomCode();
    if (code.length < 4) return Promise.reject(new Error('Room code must be at least 4 characters.'));
    role = 'host'; roomCode = code; seq = 1;
    roster = createDefaultRoster(code, callbacks.getState().players.length);
    avatarSync.refreshHostMap(callbacks.getState(), roster);

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => { if (!settled && gen === generation) { settled = true; cleanup(); reject(new Error('Timed out creating room.')); callbacks.onSessionChange(); } }, 15000);
      const p = (peer = new Peer(roomCodeToPeerId(code), { config: PEER_ICE_CONFIG }));
      const backoff = (hostBackoff = createReconnectBackoff(
        () => { if (gen === generation && !p.destroyed && p.disconnected) { try { p.reconnect(); } catch { /* ignore */ } } },
        () => { if (gen === generation) callbacks.onError?.('Signaling server unreachable — active players stay connected, but new joins are paused.'); }
      ));
      p.on('open', () => { if (gen !== generation) return; backoff.reset(); if (!settled) { settled = true; clearTimeout(timer); callbacks.onSessionChange(); resolve(code); } });
      p.on('disconnected', () => { if (gen === generation && !p.destroyed) backoff.schedule(); });
      p.on('connection', (conn) => {
        if (gen !== generation) return;
        if (openConns >= MAX_ROOM_PEERS * 2) { conn.close(); return; }
        openConns++; attachGuestConnection(conn, gen, () => { openConns = Math.max(0, openConns - 1); });
      });
      p.on('error', (err) => {
        if (gen !== generation) return;
        const msg = err.message || 'PeerJS host error.';
        if (!settled) { settled = true; clearTimeout(timer); cleanup(); reject(new Error(msg)); }
        else if (isTransientSignalingError(err) && !backoff.isExhausted()) console.warn('[TopShop Net] Host signaling error (retrying):', msg);
        else callbacks.onError?.(msg);
        callbacks.onSessionChange();
      });
    });
  }

  function joinRoom(rawCode: string, profile: { name: string; color: string; avatar?: AvatarSpec }): Promise<void> {
    cleanup();
    const gen = generation, code = normalizeRoomCode(rawCode);
    if (code.length < 4) return Promise.reject(new Error('Enter a valid room code.'));
    clientToken = getOrCreateGuestToken(code, profile.name); role = 'guest'; roomCode = code;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (msg: string) => {
        if (!settled) { settled = true; clearTimeout(timer); cleanup(); reject(new Error(msg)); } else { cleanup(); callbacks.onError?.(msg); }
        callbacks.onSessionChange();
      };
      const timer = setTimeout(() => fail('Timed out joining room. Verify the code — or if on mobile/strict Wi-Fi, try switching networks or hosts.'), 15000);
      const p = (peer = new Peer({ config: PEER_ICE_CONFIG }));
      p.on('open', () => {
        if (gen !== generation) return;
        const conn = (hostConn = p.connect(roomCodeToPeerId(code), { reliable: true }));
        const safeColor = HEX_COLOR_RE.test(profile.color) ? profile.color : '#3498db';
        conn.on('open', () => {
          if (gen === generation) conn.send({ type: 'HELLO', clientToken, name: profile.name || 'Guest', color: safeColor, ...(profile.avatar ? { avatar: profile.avatar } : {}) } satisfies ClientToHostMessage);
        });
        conn.on('data', (raw) => {
          if (gen !== generation || !isValidHostMessage(raw)) return;
          if (raw.type === 'WELCOME' || raw.type === 'STATE_SYNC') {
            if (raw.type === 'STATE_SYNC' && raw.seq <= seq) return;
            if (raw.type === 'WELCOME') avatarSync.clear();
            seq = raw.seq; roster = raw.roster; remotePencilSpinning = raw.type === 'STATE_SYNC' ? raw.pencilSpinning : false; remotePencilStopFace = null;
            if (!settled) { settled = true; clearTimeout(timer); resolve(); }
            callbacks.onReceiveRemoteState(raw.state, raw.seq);
          } else if (raw.type === 'ROSTER_SYNC') { roster = raw.roster; callbacks.onSessionChange(); }
          else if (raw.type === 'AVATAR_SYNC') { avatarSync.setRemoteMap(raw.avatars); callbacks.onSessionChange(); }
          else if (raw.type === 'AVATAR_PUT') { if (avatarSync.applyRemotePut(raw.key, raw.dataUrl)) callbacks.onSessionChange(); }
          else if (raw.type === 'UI_PENCIL_SPIN') { remotePencilSpinning = raw.spinning; remotePencilStopFace = raw.spinning ? null : (raw.stopFace ?? null); callbacks.onSessionChange(); }
          else if (raw.type === 'ERROR') { if (!settled) fail(raw.message); else callbacks.onError?.(raw.message); }
        });
        conn.on('close', () => { if (gen === generation) fail('Connection to host closed.'); });
        conn.on('error', (e) => { if (gen === generation) { if (!settled || !conn.open) fail(e.message || 'Connection error.'); else callbacks.onError?.(e.message || 'Connection error.'); } });
      });
      p.on('error', (err) => {
        if (gen !== generation) return;
        if (!settled || !hostConn?.open) fail(err.message || 'Failed to connect to room.');
        else console.warn('[TopShop Net] Ignoring transient guest signaling error (P2P still open):', err.message || err.type);
      });
    });
  }

  return {
    getRole: () => role, getRoster: () => roster, getClientToken: () => clientToken, getSeq: () => seq, getRoomCode: () => roomCode,
    getCustomAvatars: () => avatarSync.getMap(), isRemotePencilSpinning: () => remotePencilSpinning, getRemotePencilStopFace: () => remotePencilStopFace,
    isLocalTurn: (state) => canClientAct(role, roster, clientToken, state.activePlayerIndex), shouldTickEscalator: () => role !== 'guest', hostRoom, joinRoom,
    sendOrApplyAction: (action) => {
      const curState = callbacks.getState();
      if (!canClientAct(role, roster, clientToken, curState.activePlayerIndex) || !isValidGameAction(action)) return false;
      if (role === 'offline') return callbacks.onApplyHostAction(action) !== curState;
      if (role === 'host') { const next = callbacks.onApplyHostAction(action); if (next !== curState) syncHostState(next); return next !== curState; }
      if (!hostConn?.open) { callbacks.onError?.('Not connected to host.'); return false; }
      hostConn.send({ type: 'ACTION_REQUEST', clientToken, seq, action } satisfies ClientToHostMessage); return true;
    },
    broadcastHostState: (nextState) => syncHostState(nextState),
    notifyPencilSpin: (spinning, stopFace) => {
      const cur = callbacks.getState();
      if (role === 'host') {
        remotePencilSpinning = spinning; remotePencilStopFace = spinning ? null : (stopFace ?? null);
        broadcastToGuests({ type: 'UI_PENCIL_SPIN', spinning, activePlayerIndex: cur.activePlayerIndex, ...(stopFace !== undefined ? { stopFace } : {}) });
      } else if (role === 'guest' && hostConn?.open && canClientAct(role, roster, clientToken, cur.activePlayerIndex)) {
        hostConn.send({ type: 'UI_PENCIL_SPIN', clientToken, spinning, ...(stopFace !== undefined ? { stopFace } : {}) } satisfies ClientToHostMessage);
      }
    },
    assignSeat: (seatIndex, ownerToken) => {
      if (role !== 'host' || !roster) return;
      roster = assignSeatOwner(roster, seatIndex, ownerToken || HOST_TOKEN);
      const { state: synced, changed } = syncSeatProfiles();
      if (changed) syncHostState(synced); else { broadcastToGuests({ type: 'ROSTER_SYNC', roster }); if (seatIndex === callbacks.getState().activePlayerIndex) clearRemoteSpin(seatIndex); }
      callbacks.onSessionChange();
    },
    updateMyProfile: (profile) => {
      if (role !== 'guest' || !hostConn?.open) return;
      const name = profile.name.trim().slice(0, 20) || 'Guest';
      const color = HEX_COLOR_RE.test(profile.color) ? profile.color : '#3498db';
      hostConn.send({ type: 'UPDATE_PROFILE', clientToken, name, color, ...(profile.avatar ? { avatar: profile.avatar } : {}) } satisfies ClientToHostMessage);
    },
    kickPeer: (targetToken) => {
      if (role !== 'host' || !roster) return;
      const activeIdx = callbacks.getState().activePlayerIndex;
      const wasActive = roster.seatOwners[activeIdx] === targetToken;
      connByToken.get(targetToken)?.close(); connByToken.delete(targetToken); avatarSync.removePeerImage(targetToken);
      roster = removePeerFromRoster(roster, targetToken);
      broadcastToGuests({ type: 'ROSTER_SYNC', roster }); syncAvatars();
      if (wasActive) clearRemoteSpin(activeIdx);
      callbacks.onSessionChange();
    },
    disconnect: () => { cleanup(); callbacks.onSessionChange(); },
  };
}
