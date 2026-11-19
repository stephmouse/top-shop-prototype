import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { isValidGameAction, redactStateForClient } from '../engine/actions';
import type { GameAction } from '../engine/actions';
import type { GameState } from '../engine/types';
import {
  assignSeatOwner, canClientAct, createDefaultRoster, generateRoomCode, getOrCreateClientToken,
  getOrCreateGuestToken, HOST_TOKEN, isValidClientMessage, isValidHostMessage, normalizeRoomCode,
  removePeerFromRoster, resizeRosterSeats, roomCodeToPeerId, upsertPeerInRoster,
} from './protocol';
import type { ClientToHostMessage, HostToClientMessage, NetRole, RoomRoster } from './protocol';

export interface MultiplayerSessionCallbacks {
  getState: () => GameState;
  onApplyHostAction: (action: GameAction) => GameState;
  onReceiveRemoteState: (state: GameState, seq: number) => void;
  onSessionChange: () => void;
  onError?: (message: string) => void;
}

export interface MultiplayerSession {
  getRole: () => NetRole;
  getRoster: () => RoomRoster | null;
  getClientToken: () => string;
  getSeq: () => number;
  getRoomCode: () => string | null;
  isRemotePencilSpinning: () => boolean;
  isLocalTurn: (state: GameState) => boolean;
  shouldTickEscalator: () => boolean;
  hostRoom: (customCode?: string) => Promise<string>;
  joinRoom: (roomCode: string, profile: { name: string; color: string }) => Promise<void>;
  sendOrApplyAction: (action: GameAction) => boolean;
  broadcastHostState: (nextState: GameState) => void;
  notifyPencilSpin: (spinning: boolean) => void;
  assignSeat: (seatIndex: number, ownerToken: string) => void;
  kickPeer: (clientToken: string) => void;
  disconnect: () => void;
}

export function createMultiplayerSession(callbacks: MultiplayerSessionCallbacks): MultiplayerSession {
  let clientToken = getOrCreateClientToken();
  let role: NetRole = 'offline';
  let roomCode: string | null = null;
  let seq = 0;
  let roster: RoomRoster | null = null;
  let remotePencilSpinning = false;
  let peer: Peer | null = null;
  let hostConn: DataConnection | null = null;
  const connByToken = new Map<string, DataConnection>();
  let generation = 0;

  function cleanup(): void {
    generation++;
    for (const c of connByToken.values()) c.close();
    connByToken.clear();
    hostConn?.close();
    peer?.destroy();
    hostConn = null;
    peer = null;
    role = 'offline';
    roomCode = null;
    roster = null;
    seq = 0;
    remotePencilSpinning = false;
  }

  function broadcastToGuests(msg: HostToClientMessage, excludeToken?: string): void {
    for (const [token, conn] of connByToken.entries()) if (token !== excludeToken && conn.open) conn.send(msg);
  }

  function syncHostState(nextState: GameState): void {
    if (role !== 'host' || !roster) return;
    roster = resizeRosterSeats(roster, nextState.players.length);
    seq++;
    remotePencilSpinning = false;
    broadcastToGuests({ type: 'STATE_SYNC', seq, roster, state: redactStateForClient(nextState), pencilSpinning: false });
  }

  function attachGuestConnection(conn: DataConnection, gen: number): void {
    let boundToken: string | null = null;
    conn.on('data', (raw) => {
      if (gen !== generation || role !== 'host' || !roster) return;
      if (!isValidClientMessage(raw)) { conn.open && conn.send({ type: 'ERROR', message: 'Malformed action payload.' }); return; }
      if (raw.type === 'HELLO') {
        if (boundToken !== null && boundToken !== raw.clientToken) return;
        boundToken = raw.clientToken;
        const prev = connByToken.get(boundToken);
        if (prev && prev !== conn) prev.close();
        connByToken.set(boundToken, conn);
        roster = upsertPeerInRoster(roster, { clientToken: raw.clientToken, peerId: conn.peer, name: raw.name, color: raw.color, connected: true });
        conn.send({ type: 'WELCOME', seq, roster, state: redactStateForClient(callbacks.getState()) });
        broadcastToGuests({ type: 'ROSTER_SYNC', roster }, boundToken);
        callbacks.onSessionChange();
        return;
      }
      if (boundToken !== raw.clientToken) return;
      const curState = callbacks.getState();
      if (roster.seatOwners[curState.activePlayerIndex] !== boundToken) {
        conn.open && conn.send({ type: 'ERROR', message: 'Not your turn.' });
        return;
      }
      if (raw.type === 'ACTION_REQUEST') {
        if (curState.phase === 'ESCALATOR_RIDE' || curState.phase === 'ESCALATOR_UNDO') return;
        syncHostState(callbacks.onApplyHostAction(raw.action));
        callbacks.onSessionChange();
      } else if (raw.type === 'UI_PENCIL_SPIN') {
        remotePencilSpinning = raw.spinning;
        broadcastToGuests({ type: 'UI_PENCIL_SPIN', spinning: raw.spinning, activePlayerIndex: curState.activePlayerIndex }, boundToken);
        callbacks.onSessionChange();
      }
    });
    const handleDrop = () => {
      if (gen !== generation || !boundToken || !roster || connByToken.get(boundToken) !== conn) return;
      connByToken.delete(boundToken);
      const existing = roster.peers.find((p) => p.clientToken === boundToken);
      if (!existing) return;
      roster = upsertPeerInRoster(roster, { ...existing, connected: false }, false);
      broadcastToGuests({ type: 'ROSTER_SYNC', roster });
      callbacks.onSessionChange();
    };
    conn.on('close', handleDrop);
    conn.on('error', handleDrop);
  }

  function hostRoom(customCode?: string): Promise<string> {
    cleanup();
    const gen = generation;
    const code = normalizeRoomCode(customCode ?? '') || generateRoomCode();
    if (code.length < 4) return Promise.reject(new Error('Room code must be at least 4 characters.'));
    role = 'host'; roomCode = code; seq = 1;
    roster = createDefaultRoster(code, callbacks.getState().players.length);

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => { if (!settled && gen === generation) { settled = true; cleanup(); reject(new Error('Timed out creating room.')); callbacks.onSessionChange(); } }, 15000);
      const p = (peer = new Peer(roomCodeToPeerId(code)));
      p.on('open', () => { if (gen === generation && !settled) { settled = true; clearTimeout(timer); callbacks.onSessionChange(); resolve(code); } });
      p.on('connection', (conn) => { if (gen === generation) attachGuestConnection(conn, gen); });
      p.on('error', (err) => {
        const msg = err.message || 'PeerJS host error.';
        if (!settled) { settled = true; clearTimeout(timer); cleanup(); reject(new Error(msg)); } else callbacks.onError?.(msg);
        callbacks.onSessionChange();
      });
    });
  }

  function joinRoom(rawCode: string, profile: { name: string; color: string }): Promise<void> {
    cleanup();
    const gen = generation;
    const code = normalizeRoomCode(rawCode);
    if (code.length < 4) return Promise.reject(new Error('Enter a valid room code.'));
    clientToken = getOrCreateGuestToken(code, profile.name);
    role = 'guest'; roomCode = code;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (msg: string) => {
        if (!settled) { settled = true; clearTimeout(timer); cleanup(); reject(new Error(msg)); } else { cleanup(); callbacks.onError?.(msg); }
        callbacks.onSessionChange();
      };
      const timer = setTimeout(() => fail('Timed out joining room.'), 15000);
      const p = (peer = new Peer());
      p.on('open', () => {
        if (gen !== generation) return;
        const conn = (hostConn = p.connect(roomCodeToPeerId(code), { reliable: true }));
        conn.on('open', () => { if (gen === generation) conn.send({ type: 'HELLO', clientToken, name: profile.name || 'Guest', color: profile.color || '#3498db' } satisfies ClientToHostMessage); });
        conn.on('data', (raw) => {
          if (gen !== generation || !isValidHostMessage(raw)) return;
          if (raw.type === 'WELCOME' || raw.type === 'STATE_SYNC') {
            if (raw.type === 'STATE_SYNC' && raw.seq <= seq) return;
            seq = raw.seq; roster = raw.roster; remotePencilSpinning = raw.type === 'STATE_SYNC' ? raw.pencilSpinning : false;
            if (!settled) { settled = true; clearTimeout(timer); resolve(); }
            callbacks.onReceiveRemoteState(raw.state, raw.seq);
          } else if (raw.type === 'ROSTER_SYNC') { roster = raw.roster; callbacks.onSessionChange(); }
          else if (raw.type === 'UI_PENCIL_SPIN') { remotePencilSpinning = raw.spinning; callbacks.onSessionChange(); }
          else if (raw.type === 'ERROR') { if (!settled) fail(raw.message); else callbacks.onError?.(raw.message); }
        });
        conn.on('close', () => { if (gen === generation) fail('Connection to host closed.'); });
        conn.on('error', (e) => { if (gen === generation) fail(e.message || 'Connection error.'); });
      });
      p.on('error', (err) => { if (gen === generation) fail(err.message || 'Failed to connect to room.'); });
    });
  }

  return {
    getRole: () => role, getRoster: () => roster, getClientToken: () => clientToken,
    getSeq: () => seq, getRoomCode: () => roomCode, isRemotePencilSpinning: () => remotePencilSpinning,
    isLocalTurn: (state) => canClientAct(role, roster, clientToken, state.activePlayerIndex),
    shouldTickEscalator: () => role !== 'guest',
    hostRoom, joinRoom,
    sendOrApplyAction: (action) => {
      const curState = callbacks.getState();
      if (!canClientAct(role, roster, clientToken, curState.activePlayerIndex) || !isValidGameAction(action)) return false;
      if (role === 'offline') { callbacks.onApplyHostAction(action); return true; }
      if (role === 'host') { syncHostState(callbacks.onApplyHostAction(action)); return true; }
      if (!hostConn?.open) { callbacks.onError?.('Not connected to host.'); return false; }
      hostConn.send({ type: 'ACTION_REQUEST', clientToken, seq, action } satisfies ClientToHostMessage);
      return true;
    },
    broadcastHostState: (nextState) => syncHostState(nextState),
    notifyPencilSpin: (spinning) => {
      const cur = callbacks.getState();
      if (role === 'host') broadcastToGuests({ type: 'UI_PENCIL_SPIN', spinning, activePlayerIndex: cur.activePlayerIndex });
      else if (role === 'guest' && hostConn?.open && canClientAct(role, roster, clientToken, cur.activePlayerIndex)) {
        hostConn.send({ type: 'UI_PENCIL_SPIN', clientToken, spinning } satisfies ClientToHostMessage);
      }
    },
    assignSeat: (seatIndex, ownerToken) => {
      if (role !== 'host' || !roster) return;
      roster = assignSeatOwner(roster, seatIndex, ownerToken || HOST_TOKEN);
      broadcastToGuests({ type: 'ROSTER_SYNC', roster }); callbacks.onSessionChange();
    },
    kickPeer: (targetToken) => {
      if (role !== 'host' || !roster) return;
      connByToken.get(targetToken)?.close(); connByToken.delete(targetToken);
      roster = removePeerFromRoster(roster, targetToken);
      broadcastToGuests({ type: 'ROSTER_SYNC', roster }); callbacks.onSessionChange();
    },
    disconnect: () => { cleanup(); callbacks.onSessionChange(); },
  };
}
