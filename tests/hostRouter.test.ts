import { describe, expect, it } from 'vitest';
import { getDefaultAvatarForSeat } from '../src/config/avatarTypes';
import { applyAction, createInitialGameState } from '../src/engine/state';
import type { GameState } from '../src/engine/types';
import { createHostRouter } from '../src/net/hostRouter';
import type { HostPeerSender } from '../src/net/hostRouter';
import { HOST_TOKEN, MAX_ROOM_PEERS } from '../src/net/protocol';
import type { HostToClientMessage } from '../src/net/protocol';

interface MockConn {
  sender: HostPeerSender;
  sent: HostToClientMessage[];
  closed: boolean;
}

function createHarness(initial?: GameState) {
  let state =
    initial ??
    createInitialGameState([{ name: 'Host' }, { name: 'Guest Seat' }], {}, 42, 'stage_0');
  const broadcasts: Array<{ msg: HostToClientMessage; excludePublicId?: string }> = [];
  const directSends: Array<{ publicId: string; msg: HostToClientMessage }> = [];
  const closedPeers: string[] = [];
  const conns = new Map<string, MockConn>();
  let sessionChanges = 0;

  const router = createHostRouter('ROOM42', state, {
    getState: () => state,
    onApplyHostAction: (action) => {
      const next = applyAction(state, action);
      state = next;
      return next;
    },
    onSyncHostState: (synced) => {
      state = synced;
    },
    onSessionChange: () => {
      sessionChanges++;
    },
    sendToPeer: (publicId, msg) => {
      directSends.push({ publicId, msg });
      conns.get(publicId)?.sent.push(msg);
    },
    broadcast: (msg, excludePublicId) => {
      broadcasts.push({ msg, excludePublicId });
      for (const [pid, conn] of conns.entries()) {
        if (pid !== excludePublicId && !conn.closed) {
          conn.sent.push(msg);
        }
      }
    },
    closePeer: (publicId) => {
      closedPeers.push(publicId);
      const conn = conns.get(publicId);
      if (conn) conn.closed = true;
    },
  });

  function openMockConn(): MockConn {
    const conn: MockConn = {
      sent: [],
      closed: false,
      sender: {
        boundPublicId: null,
        send: (msg) => {
          conn.sent.push(msg);
        },
        close: () => {
          conn.closed = true;
        },
        onBind: (publicId) => {
          conn.sender.boundPublicId = publicId;
          conns.set(publicId, conn);
        },
      },
    };
    return conn;
  }

  return {
    router,
    getState: () => state,
    getSessionChanges: () => sessionChanges,
    broadcasts,
    directSends,
    closedPeers,
    openMockConn,
  };
}

describe('hostRouter security and session flows', () => {
  it('rejects HOST-token and short-token payloads without binding or adding peers', () => {
    const h = createHarness();
    const attacker = h.openMockConn();

    h.router.handleClientMessage(
      { type: 'HELLO', clientToken: HOST_TOKEN, name: 'SpoofHost', color: '#e74c3c' },
      attacker.sender
    );
    h.router.handleClientMessage(
      { type: 'HELLO', clientToken: 'short', name: 'ShortTok', color: '#e74c3c' },
      attacker.sender
    );
    h.router.handleClientMessage(
      { type: 'ACTION_REQUEST', clientToken: HOST_TOKEN, seq: 1, action: { type: 'ROLL_PENCIL', chosenFace: 4 } },
      attacker.sender
    );
    h.router.handleClientMessage(
      { type: 'UPDATE_PROFILE', clientToken: HOST_TOKEN, name: 'Hacked', color: '#111111' },
      attacker.sender
    );

    expect(attacker.sender.boundPublicId).toBeNull();
    expect(attacker.sent).toEqual([
      { type: 'ERROR', message: 'Malformed action payload.' },
      { type: 'ERROR', message: 'Malformed action payload.' },
      { type: 'ERROR', message: 'Malformed action payload.' },
      { type: 'ERROR', message: 'Malformed action payload.' },
    ]);
    expect(h.router.getRoster().peers).toHaveLength(0);
    expect(h.router.getRoster().seatOwners).toEqual([HOST_TOKEN, HOST_TOKEN]);
    expect(h.getState().phase).toBe('ROLL_PENCIL');
  });

  it('assigns opaque public IDs and never leaks secret clientTokens or peerIds', () => {
    const h = createHarness();
    const tokenA = 'secret_token_alpha_001';
    const tokenB = 'secret_token_beta_002';
    const customImg = `data:image/webp;base64,${'A'.repeat(40)}`;

    const connA = h.openMockConn();
    const connB = h.openMockConn();

    h.router.handleClientMessage(
      {
        type: 'HELLO',
        clientToken: tokenA,
        name: 'Alice',
        color: '#3498db',
        avatar: { ...getDefaultAvatarForSeat(1), customImage: customImg },
      },
      connA.sender
    );
    h.router.handleClientMessage(
      { type: 'HELLO', clientToken: tokenB, name: 'Bob', color: '#2ecc71' },
      connB.sender
    );

    const welcomeA = connA.sent.find((m) => m.type === 'WELCOME');
    const welcomeB = connB.sent.find((m) => m.type === 'WELCOME');
    expect(welcomeA?.type === 'WELCOME' ? welcomeA.myPeerId : null).toBe('guest_1');
    expect(welcomeB?.type === 'WELCOME' ? welcomeB.myPeerId : null).toBe('guest_2');

    const roster = h.router.getRoster();
    expect(roster.peers.map((p) => p.id)).toEqual(['guest_1', 'guest_2']);
    for (const peer of roster.peers) {
      expect('clientToken' in peer).toBe(false);
      expect('peerId' in peer).toBe(false);
    }

    const serialized = JSON.stringify({
      roster,
      broadcasts: h.broadcasts,
      connASent: connA.sent,
      connBSent: connB.sent,
    });
    expect(serialized).not.toContain(tokenA);
    expect(serialized).not.toContain(tokenB);
  });

  it('blocks cross-guest impersonation and re-HELLO on already-bound connections', () => {
    const h = createHarness();
    const tokenA = 'secret_token_alpha_001';
    const tokenB = 'secret_token_beta_002';
    const connA = h.openMockConn();
    const connB = h.openMockConn();

    h.router.handleClientMessage(
      { type: 'HELLO', clientToken: tokenA, name: 'Alice', color: '#3498db' },
      connA.sender
    );
    h.router.handleClientMessage(
      { type: 'HELLO', clientToken: tokenB, name: 'Bob', color: '#2ecc71' },
      connB.sender
    );

    h.router.assignSeat(0, 'guest_1');
    const seqBefore = h.router.getSeq();
    const sentBeforeB = connB.sent.length;
    const broadcastsBefore = h.broadcasts.length;

    // Guest B tries to use Guest A's token or public ID on Guest B's connection
    h.router.handleClientMessage(
      { type: 'UPDATE_PROFILE', clientToken: tokenA, name: 'Impostor', color: '#ff0000' },
      connB.sender
    );
    h.router.handleClientMessage(
      { type: 'UPDATE_PROFILE', clientToken: 'guest_1', name: 'Impostor', color: '#ff0000' },
      connB.sender
    );
    h.router.handleClientMessage(
      { type: 'ACTION_REQUEST', clientToken: tokenA, seq: seqBefore, action: { type: 'ROLL_PENCIL', chosenFace: 5 } },
      connB.sender
    );
    h.router.handleClientMessage(
      { type: 'UI_PENCIL_SPIN', clientToken: tokenA, spinning: true },
      connB.sender
    );
    // Re-HELLO with another token on bound connB must be ignored
    h.router.handleClientMessage(
      { type: 'HELLO', clientToken: 'secret_token_gamma_003', name: 'Evil', color: '#ff0000' },
      connB.sender
    );

    expect(connB.sender.boundPublicId).toBe('guest_2');
    expect(h.router.getRoster().peers).toHaveLength(2);
    expect(h.router.getRoster().peers.find((p) => p.id === 'guest_1')?.name).toBe('Alice');
    expect(h.router.isRemotePencilSpinning()).toBe(false);
    expect(h.getState().phase).toBe('ROLL_PENCIL');
    expect(h.router.getSeq()).toBe(seqBefore);
    expect(h.broadcasts.length).toBe(broadcastsBefore);
    // Short token 'guest_1' returns ERROR; mismatched bound token messages are dropped silently
    expect(connB.sent.slice(sentBeforeB)).toEqual([{ type: 'ERROR', message: 'Malformed action payload.' }]);
  });

  it('enforces turn ownership and seq ordering with STATE_SYNC resync', () => {
    const h = createHarness();
    const tokenA = 'secret_token_alpha_001';
    const connA = h.openMockConn();

    h.router.handleClientMessage(
      { type: 'HELLO', clientToken: tokenA, name: 'Alice', color: '#3498db' },
      connA.sender
    );

    // Seat 0 still belongs to HOST_TOKEN
    connA.sent.length = 0;
    h.router.handleClientMessage(
      {
        type: 'ACTION_REQUEST',
        clientToken: tokenA,
        seq: h.router.getSeq(),
        action: { type: 'ROLL_PENCIL', chosenFace: 3 },
      },
      connA.sender
    );
    expect(connA.sent[0]).toEqual({ type: 'ERROR', message: 'Not your turn.' });
    expect(connA.sent[1]?.type).toBe('STATE_SYNC');
    expect(h.getState().phase).toBe('ROLL_PENCIL');

    // Assign seat 0 to guest_1
    h.router.assignSeat(0, 'guest_1');
    const curSeq = h.router.getSeq();
    connA.sent.length = 0;

    // Stale seq triggers STATE_SYNC without applying action
    h.router.handleClientMessage(
      {
        type: 'ACTION_REQUEST',
        clientToken: tokenA,
        seq: curSeq - 1,
        action: { type: 'ROLL_PENCIL', chosenFace: 3 },
      },
      connA.sender
    );
    expect(connA.sent).toHaveLength(1);
    expect(connA.sent[0]?.type).toBe('STATE_SYNC');
    expect(h.getState().phase).toBe('ROLL_PENCIL');

    // Matching seq applies action and increments seq
    h.router.handleClientMessage(
      {
        type: 'ACTION_REQUEST',
        clientToken: tokenA,
        seq: curSeq,
        action: { type: 'ROLL_PENCIL', chosenFace: 3 },
      },
      connA.sender
    );
    expect(h.getState().lastRoll).toBe(3);
    expect(h.router.getSeq()).toBe(curSeq + 1);
    expect(h.broadcasts.at(-1)?.msg.type).toBe('STATE_SYNC');
  });

  it('handles disconnect, clears active remote spin, and reclaims public ID on reconnect', () => {
    const h = createHarness();
    const tokenA = 'secret_token_alpha_001';
    const connA = h.openMockConn();

    h.router.handleClientMessage(
      { type: 'HELLO', clientToken: tokenA, name: 'Alice', color: '#3498db' },
      connA.sender
    );
    h.router.assignSeat(0, 'guest_1');

    h.router.handleClientMessage(
      { type: 'UI_PENCIL_SPIN', clientToken: tokenA, spinning: true },
      connA.sender
    );
    expect(h.router.isRemotePencilSpinning()).toBe(true);

    h.router.handlePeerDisconnect('guest_1');
    expect(h.router.isRemotePencilSpinning()).toBe(false);
    expect(h.router.getRoster().peers.find((p) => p.id === 'guest_1')?.connected).toBe(false);
    expect(h.broadcasts.some((b) => b.msg.type === 'UI_PENCIL_SPIN' && b.msg.spinning === false)).toBe(true);

    const connA2 = h.openMockConn();
    h.router.handleClientMessage(
      { type: 'HELLO', clientToken: tokenA, name: 'Alice', color: '#3498db' },
      connA2.sender
    );
    const welcome = connA2.sent.find((m) => m.type === 'WELCOME');
    expect(welcome?.type === 'WELCOME' ? welcome.myPeerId : null).toBe('guest_1');
    expect(h.router.getRoster().peers).toHaveLength(1);
    expect(h.router.getRoster().peers[0]?.connected).toBe(true);
  });

  it('kicks peers cleanly and enforces MAX_ROOM_PEERS cap', () => {
    const h = createHarness();
    const tokenA = 'secret_token_alpha_001';
    const customImg = `data:image/webp;base64,${'C'.repeat(40)}`;
    const connA = h.openMockConn();

    h.router.handleClientMessage(
      {
        type: 'HELLO',
        clientToken: tokenA,
        name: 'Alice',
        color: '#3498db',
        avatar: { ...getDefaultAvatarForSeat(1), customImage: customImg },
      },
      connA.sender
    );
    expect(h.router.getCustomAvatars().guest_1).toBe(customImg);
    expect(h.router.getRoster().seatOwners[1]).toBe('guest_1');

    h.router.kickPeer('guest_1');
    expect(connA.closed).toBe(true);
    expect(connA.sent.at(-1)).toEqual({ type: 'ERROR', message: 'You were removed by the host.' });
    expect(h.router.getRoster().peers).toHaveLength(0);
    expect(h.router.getRoster().seatOwners[1]).toBe(HOST_TOKEN);
    expect(h.router.getCustomAvatars().guest_1).toBeUndefined();

    // Token mapping was cleared on kick, so a friend who glitched out can still rejoin cleanly
    const rejoin = h.openMockConn();
    h.router.handleClientMessage(
      { type: 'HELLO', clientToken: tokenA, name: 'Alice', color: '#3498db' },
      rejoin.sender
    );
    const rejoinWelcome = rejoin.sent.find((m) => m.type === 'WELCOME');
    expect(rejoinWelcome?.type === 'WELCOME' ? rejoinWelcome.myPeerId : null).toBe('guest_2');

    for (let i = 1; i < MAX_ROOM_PEERS; i++) {
      const c = h.openMockConn();
      h.router.handleClientMessage(
        { type: 'HELLO', clientToken: `room_member_token_${i}`, name: `P${i}`, color: '#3498db' },
        c.sender
      );
      expect(c.closed).toBe(false);
    }

    const overflow = h.openMockConn();
    h.router.handleClientMessage(
      { type: 'HELLO', clientToken: 'overflow_token_999', name: 'Extra', color: '#3498db' },
      overflow.sender
    );
    expect(overflow.closed).toBe(true);
    expect(overflow.sent).toEqual([{ type: 'ERROR', message: 'Room is full.' }]);
  });

  it('evicts disconnected ghost peers when room is at MAX_ROOM_PEERS (preferring spectators first)', () => {
    const h = createHarness();
    for (let i = 0; i < MAX_ROOM_PEERS; i++) {
      const c = h.openMockConn();
      h.router.handleClientMessage(
        { type: 'HELLO', clientToken: `member_token_00${i}`, name: `P${i}`, color: '#3498db' },
        c.sender
      );
      expect(c.closed).toBe(false);
    }

    // guest_1 claimed seat 1; guest_2..guest_8 are spectators. Disconnect both guest_1 and guest_2.
    h.router.handlePeerDisconnect('guest_1');
    h.router.handlePeerDisconnect('guest_2');

    // New joiner must succeed by evicting disconnected spectator guest_2 first, preserving seated guest_1.
    const newcomer = h.openMockConn();
    h.router.handleClientMessage(
      { type: 'HELLO', clientToken: 'fresh_token_009', name: 'Newcomer', color: '#2ecc71' },
      newcomer.sender
    );
    expect(newcomer.closed).toBe(false);
    expect(newcomer.sent.find((m) => m.type === 'WELCOME')).toBeDefined();
    expect(h.router.getRoster().peers).toHaveLength(MAX_ROOM_PEERS);
    expect(h.router.getRoster().peers.some((p) => p.id === 'guest_2')).toBe(false);
    expect(h.router.getRoster().peers.some((p) => p.id === 'guest_1')).toBe(true);
    expect(h.router.getRoster().seatOwners[1]).toBe('guest_1');

    // Disconnect every connected peer (0 online); another fresh joiner must still succeed.
    for (const peer of h.router.getRoster().peers) {
      if (peer.connected) h.router.handlePeerDisconnect(peer.id);
    }
    const afterAllLeft = h.openMockConn();
    h.router.handleClientMessage(
      { type: 'HELLO', clientToken: 'fresh_token_010', name: 'LateJoin', color: '#9b59b6' },
      afterAllLeft.sender
    );
    expect(afterAllLeft.closed).toBe(false);
    expect(afterAllLeft.sent.find((m) => m.type === 'WELCOME')).toBeDefined();
    expect(h.router.getRoster().peers).toHaveLength(MAX_ROOM_PEERS);
  });
});
