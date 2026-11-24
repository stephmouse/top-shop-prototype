import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDefaultAvatarForSeat } from '../src/config/avatarTypes';
import type { GameAction } from '../src/engine/actions';
import { createInitialGameState } from '../src/engine/state';
import type { GameState } from '../src/engine/types';
import { createHeartbeatMonitor, PONG_TIMEOUT_MS } from '../src/net/avatarSync';
import { createDefaultRoster, isValidClientMessage, isValidHostMessage } from '../src/net/protocol';
import type { MultiplayerSession } from '../src/net/session';
import { hydrateWireGameState, isValidWireGameState, packWireGameState } from '../src/net/wireState';
import { createMovementDriver } from '../src/ui/movementDriver';
import { ESCALATOR_DWELL_MS } from '../src/ui/stateDiff';

describe('wire state compaction, heartbeat, and guided-walk ack resilience', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('strips static map data in packWireGameState and losslessly hydrates it back', () => {
    const imgA = `data:image/webp;base64,${'A'.repeat(40)}`;
    const base = createInitialGameState(
      [{ name: 'Alice', avatar: { ...getDefaultAvatarForSeat(0), customImage: imgA } }, { name: 'Bob' }],
      {},
      4242,
      'stage_0'
    );
    const eventState: GameState = {
      ...base,
      phase: 'EVENT_PICK',
      eventChoices: ['ev_a', 'ev_b', 'ev_c'],
      revealedEventSlot: null,
    };

    const fullJson = JSON.stringify(eventState);
    const wire = packWireGameState(eventState);
    const wireJson = JSON.stringify(wire);

    expect('tiles' in wire).toBe(false);
    expect('segmentPools' in wire).toBe(false);
    expect(wire.seed).toBe(0);
    expect(wire.eventChoices).toEqual(['hidden_0', 'hidden_1', 'hidden_2']);
    expect(wire.players[0]!.avatar?.customImage).toBeUndefined();
    expect(wireJson.length).toBeLessThan(fullJson.length * 0.5);
    expect(isValidWireGameState(wire)).toBe(true);

    const hydrated = hydrateWireGameState(wire);
    expect(hydrated).not.toBeNull();
    expect(hydrated!.tiles).toEqual(eventState.tiles);
    expect(hydrated!.segmentPools).toEqual(eventState.segmentPools);

    expect(hydrateWireGameState({ ...wire, mapId: 'stage_999' })).toBeNull();
    expect(
      isValidWireGameState({
        ...wire,
        players: [{ ...wire.players[0]!, tileId: 'missing_tile' }, wire.players[1]!],
      })
    ).toBe(false);

    const roster = createDefaultRoster('ROOM42', 2);
    expect(isValidClientMessage({ type: 'PING', clientToken: 'tok_12345', ts: 123456 })).toBe(true);
    expect(isValidClientMessage({ type: 'PING', clientToken: 'tok_12345', ts: Number.NaN })).toBe(false);
    expect(isValidHostMessage({ type: 'PONG', ts: 123456 })).toBe(true);
    expect(isValidHostMessage({ type: 'WELCOME', seq: 1, roster, state: wire })).toBe(true);
    expect(isValidHostMessage({ type: 'STATE_SYNC', seq: 2, roster, state: wire, pencilSpinning: false })).toBe(true);
  });

  it('sends heartbeat pings on interval and fires timeout when touch stops', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    let pings = 0;
    let timeouts = 0;
    const hb = createHeartbeatMonitor(() => { pings++; }, () => { timeouts++; }, 5000, PONG_TIMEOUT_MS);

    hb.start();
    vi.advanceTimersByTime(5000);
    expect(pings).toBe(1);
    expect(timeouts).toBe(0);

    hb.touch();
    vi.advanceTimersByTime(10000);
    expect(pings).toBe(3);
    expect(timeouts).toBe(0);

    // Next tick puts elapsed past PONG_TIMEOUT_MS (12000ms) without another touch
    vi.advanceTimersByTime(5000);
    expect(timeouts).toBe(1);
    hb.stop();
  });

  it('peeks guided choices until host STATE_SYNC confirms step progression', () => {
    vi.useFakeTimers();
    const base = createInitialGameState([{ name: 'Host' }, { name: 'Guest' }], {}, 1, 'stage_0');
    const forkTile = Object.values(base.tiles).find((t) => t.neighbors.left && t.neighbors.right);
    expect(forkTile).toBeDefined();

    let state: GameState = {
      ...base,
      activePlayerIndex: 1,
      phase: 'CHOOSE_DIRECTION',
      remainingSteps: 2,
      players: base.players.map((p, i) => (i === 1 ? { ...p, tileId: forkTile!.id } : p)),
    };

    const sentActions: GameAction[] = [];
    const mockNet = {
      getRole: () => 'guest' as const,
      isLocalTurn: () => true,
      shouldTickEscalator: () => false,
      sendOrApplyAction: (action: GameAction) => { sentActions.push(action); return true; },
      broadcastHostState: () => {},
    } as unknown as MultiplayerSession;

    const driver = createMovementDriver({
      netSession: mockNet,
      getState: () => state,
      isAutoStepEnabled: () => false,
      onApplyHostAction: () => state,
    });

    driver.startGuidedWalk(['right', 'left']);
    expect(sentActions).toEqual([{ type: 'CHOOSE_DIRECTION', direction: 'right' }]);
    expect(driver.isAwaitingAck()).toBe(true);

    // Non-advancing STATE_SYNC (e.g. concurrent update on same tile/phase) must NOT consume 'right'
    const concurrentState: GameState = { ...state, players: state.players.map((p) => ({ ...p })) };
    driver.onRemoteStateAccepted(state, concurrentState);
    state = concurrentState;
    expect(driver.isAwaitingAck()).toBe(false);
    driver.scheduleTick();
    vi.advanceTimersByTime(250);
    expect(sentActions).toEqual([
      { type: 'CHOOSE_DIRECTION', direction: 'right' },
      { type: 'CHOOSE_DIRECTION', direction: 'right' },
    ]);

    // Real progression clears 'right' and sends 'left' at the next CHOOSE_DIRECTION
    const movedState: GameState = {
      ...state,
      remainingSteps: 1,
      players: state.players.map((p, i) => (i === 1 ? { ...p, tileId: forkTile!.neighbors.right! } : p)),
    };
    driver.onRemoteStateAccepted(state, movedState);
    state = movedState;
    driver.scheduleTick();
    vi.advanceTimersByTime(250);
    expect(sentActions[2]).toEqual({ type: 'CHOOSE_DIRECTION', direction: 'left' });
    driver.cancel();
  });

  it('allows active guest (not spectator) to tick ADVANCE_STEP during ESCALATOR_RIDE', () => {
    vi.useFakeTimers();
    const base = createInitialGameState([{ name: 'Host' }, { name: 'Guest' }], {}, 1, 'stage_0');
    const escState: GameState = { ...base, activePlayerIndex: 1, phase: 'ESCALATOR_RIDE' };

    const activeActions: GameAction[] = [];
    const activeGuest = createMovementDriver({
      netSession: {
        getRole: () => 'guest',
        isLocalTurn: () => true,
        shouldTickEscalator: () => false,
        sendOrApplyAction: (a: GameAction) => { activeActions.push(a); return true; },
        broadcastHostState: () => {},
      } as unknown as MultiplayerSession,
      getState: () => escState,
      isAutoStepEnabled: () => false,
      onApplyHostAction: () => escState,
    });

    const spectatorActions: GameAction[] = [];
    const spectatorGuest = createMovementDriver({
      netSession: {
        getRole: () => 'guest',
        isLocalTurn: () => false,
        shouldTickEscalator: () => false,
        sendOrApplyAction: (a: GameAction) => { spectatorActions.push(a); return true; },
        broadcastHostState: () => {},
      } as unknown as MultiplayerSession,
      getState: () => escState,
      isAutoStepEnabled: () => false,
      onApplyHostAction: () => escState,
    });

    activeGuest.scheduleTick();
    spectatorGuest.scheduleTick();
    vi.advanceTimersByTime(ESCALATOR_DWELL_MS);

    expect(activeActions).toEqual([{ type: 'ADVANCE_STEP' }]);
    expect(spectatorActions).toEqual([]);
    activeGuest.cancel();
    spectatorGuest.cancel();
  });
});
