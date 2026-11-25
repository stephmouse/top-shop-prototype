import { describe, expect, it } from 'vitest';
import { getActivePlayer, getAvailableDirections } from '../src/engine/helpers';
import { computeMovePreview } from '../src/engine/movePreview';
import { applyAction, createInitialGameState } from '../src/engine/state';

const PLAYERS = [{ name: 'Alice' }, { name: 'Bob' }];

describe('movement, escalators, undo, elevators, and preview', () => {
  it('executes deterministically for identical seeds and action sequences', () => {
    const s1 = createInitialGameState(PLAYERS, {}, 9001, 'stage_0');
    const s2 = createInitialGameState(PLAYERS, {}, 9001, 'stage_0');
    const seq = [
      { type: 'ROLL_PENCIL', chosenFace: 3 },
      { type: 'CHOOSE_DIRECTION', direction: 'left' },
      { type: 'ADVANCE_STEP' },
      { type: 'ADVANCE_STEP' },
    ] as const;

    const r1 = seq.reduce(applyAction, s1);
    const r2 = seq.reduce(applyAction, s2);
    expect(r1).toEqual(r2);
    expect(getActivePlayer(r1).tileId).toBe('f1_c2');
  });

  it('rides escalators at 0 extra step cost and supports escalator undo and full cancel', () => {
    let state = createInitialGameState(PLAYERS, {}, 123, 'stage_0');
    state = applyAction(state, { type: 'ROLL_PENCIL', chosenFace: 6 });
    state = applyAction(state, { type: 'CHOOSE_DIRECTION', direction: 'left' });
    for (let i = 0; i < 4; i++) {
      state = applyAction(state, { type: 'ADVANCE_STEP' });
    }
    expect(state.phase).toBe('ESCALATOR_RIDE');
    expect(getActivePlayer(state).tileId).toBe('f1_c0');
    expect(state.remainingSteps).toBe(1);

    state = applyAction(state, { type: 'ADVANCE_STEP' });
    expect(state.phase).toBe('STEPPING');
    expect(state.remainingSteps).toBe(1);
    expect(getActivePlayer(state).tileId).toBe('f2_c1');
    expect(getActivePlayer(state).horizontalDir).toBe('right');
    expect(getActivePlayer(state).verticalDir).toBe('up');

    state = applyAction(state, { type: 'UNDO_STEP' });
    expect(state.phase).toBe('ESCALATOR_UNDO');
    state = applyAction(state, { type: 'ADVANCE_STEP' });
    expect(getActivePlayer(state).tileId).toBe('f1_c1');
    expect(state.remainingSteps).toBe(2);
    expect(getActivePlayer(state).horizontalDir).toBe('left');

    state = applyAction(state, { type: 'CANCEL_MOVE' });
    expect(state.phase).toBe('CHOOSE_DIRECTION');
    expect(getActivePlayer(state).tileId).toBe('f1_c5');
    expect(state.remainingSteps).toBe(6);
    expect(getActivePlayer(state).horizontalDir).toBeNull();
  });

  it('pauses at unlocked bidirectional escalator forks for up/down choice', () => {
    let state = createInitialGameState(PLAYERS, {}, 77, 'stage_0');
    state = {
      ...state,
      phase: 'STEPPING',
      remainingSteps: 3,
      players: state.players.map((p, idx) =>
        idx === 0 ? { ...p, tileId: 'f2_c1', horizontalDir: 'left', verticalDir: null } : p
      ),
    };

    state = applyAction(state, { type: 'ADVANCE_STEP' });
    expect(state.phase).toBe('CHOOSE_DIRECTION');
    expect(getActivePlayer(state).tileId).toBe('f2_c0');
    expect(getAvailableDirections(state, getActivePlayer(state))).toEqual(['up', 'down']);

    state = applyAction(state, { type: 'CHOOSE_DIRECTION', direction: 'down' });
    expect(getActivePlayer(state).tileId).toBe('f1_c1');
    expect(getActivePlayer(state).horizontalDir).toBe('right');
    expect(getActivePlayer(state).verticalDir).toBe('down');
  });

  it('pauses in BANK_MENU when passing Bank mid-move and clears moveHistory', () => {
    let state = createInitialGameState(PLAYERS, {}, 55, 'stage_0');
    const startCash = getActivePlayer(state).cash;
    state = {
      ...state,
      phase: 'STEPPING',
      remainingSteps: 4,
      players: state.players.map((p, idx) =>
        idx === 0 ? { ...p, tileId: 'f1_c7', horizontalDir: 'left', stepsSincePayday: 12 } : p
      ),
    };

    state = applyAction(state, { type: 'ADVANCE_STEP' });
    state = applyAction(state, { type: 'ADVANCE_STEP' });
    expect(state.phase).toBe('BANK_MENU');
    expect(state.pendingPostBankPhase).toBe('STEPPING');
    expect(state.moveHistory).toEqual([]);
    expect(getActivePlayer(state).cash).toBeGreaterThan(startCash);

    state = applyAction(state, { type: 'CLOSE_BANK_MENU' });
    expect(state.phase).toBe('STEPPING');
    expect(state.remainingSteps).toBe(2);
  });

  it('unlocks directions on Elevator skip or ride and respects elevator locks', () => {
    const base = createInitialGameState(PLAYERS, {}, 88, 'stage_0');
    const atElev = {
      ...base,
      phase: 'ELEVATOR_PROMPT' as const,
      players: base.players.map((p, idx) =>
        idx === 0 ? { ...p, tileId: 'f2_c5', horizontalDir: 'right' as const, verticalDir: 'up' as const } : p
      ),
    };

    const skipped = applyAction(atElev, { type: 'RESOLVE_ELEVATOR', ride: false });
    expect(skipped.players[0]?.horizontalDir).toBeNull();
    expect(skipped.players[0]?.verticalDir).toBeNull();
    expect(skipped.activePlayerIndex).toBe(1);

    const ridden = applyAction(atElev, { type: 'RESOLVE_ELEVATOR', ride: true });
    expect(ridden.players[0]?.horizontalDir).toBeNull();
    expect(ridden.players[0]?.verticalDir).toBeNull();
    expect(ridden.tiles[ridden.players[0]!.tileId]?.type).toBe('elevator');

    const lockedState = {
      ...base,
      phase: 'STEPPING' as const,
      remainingSteps: 1,
      elevatorLock: {
        blockedPlayerId: 'p_1',
        onlyPlayerId: null,
        timer: { castAt: 0, expiresAt: 2, casterId: 'p_2' },
      },
      players: base.players.map((p, idx) =>
        idx === 0 ? { ...p, tileId: 'f2_c4', horizontalDir: 'right' as const } : p
      ),
    };
    const afterLock = applyAction(lockedState, { type: 'ADVANCE_STEP' });
    expect(afterLock.phase).toBe('ROLL_PENCIL');
    expect(afterLock.activePlayerIndex).toBe(1);
  });

  it('computes symmetric reachable landing targets from Bank on roll', () => {
    let state = createInitialGameState(PLAYERS, {}, 42, 'stage_0');
    state = applyAction(state, { type: 'ROLL_PENCIL', chosenFace: 3 });
    const preview = computeMovePreview(state);
    const targetIds = preview.endTargets.map((t) => t.tileId);
    expect(targetIds).toContain('f1_c2');
    expect(targetIds).toContain('f1_c8');
  });
});
