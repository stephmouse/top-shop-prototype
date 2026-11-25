import type { GameState, TimedEffectWindow } from './types';

type ClockState = Pick<GameState, 'totalMonths' | 'players' | 'activePlayerIndex' | 'roundStartPlayerIndex'>;

/**
 * Computes the monotonic turn clock matching PS1 SLUS_013.33 (`0x800498c8`):
 * `totalMonths * players.length + seatOffset` using fixed initial seat count.
 */
export function getTurnClock(state: ClockState): number {
  const playerCount = Math.max(1, state.players.length);
  const seatOffset =
    (((state.activePlayerIndex - state.roundStartPlayerIndex) % playerCount) + playerCount) % playerCount;
  return state.totalMonths * playerCount + seatOffset;
}

/** Stamps a timed effect lasting `rounds` full table cycles from the current turn. */
export function createTimedWindow(state: GameState, rounds: number, casterId: string): TimedEffectWindow {
  const castAt = getTurnClock(state);
  const playerCount = Math.max(1, state.players.length);
  return {
    castAt,
    expiresAt: castAt + Math.max(1, rounds) * playerCount,
    casterId,
  };
}

/** Returns whichever timer expires later when re-applying a timed effect. */
export function extendTimedWindow(
  existing: TimedEffectWindow | null,
  state: GameState,
  rounds: number,
  casterId: string
): TimedEffectWindow {
  const incoming = createTimedWindow(state, rounds, casterId);
  if (!existing || incoming.expiresAt >= existing.expiresAt) return incoming;
  return existing;
}

/** Active while `now <= expiresAt`, matching PS1's strict `expiresAt < now` expiry check. */
export function isTimedWindowActive(
  timer: TimedEffectWindow | null | undefined,
  now: number
): timer is TimedEffectWindow {
  return Boolean(timer && now <= timer.expiresAt);
}

/**
 * Derives whole rounds remaining for UI badges without off-by-one `+1` leaks on the cast turn.
 */
export function getTimedWindowRoundsLeft(
  state: GameState,
  timer: TimedEffectWindow | null | undefined
): number {
  if (!timer) return 0;
  const now = getTurnClock(state);
  if (now > timer.expiresAt) return 0;
  const playerCount = Math.max(1, state.players.length);
  const remaining = timer.expiresAt - now;
  return now === timer.castAt
    ? Math.max(1, Math.floor(remaining / playerCount))
    : Math.floor(remaining / playerCount) + 1;
}

/** Formats an unambiguous endpoint tooltip naming whose turn ends the effect. */
export function formatTimedWindowEndpoint(
  state: GameState,
  timer: TimedEffectWindow,
  verb = 'Ends'
): string {
  const now = getTurnClock(state);
  const casterName = state.players.find((p) => p.id === timer.casterId)?.name ?? 'triggering player';
  const roundsLeft = getTimedWindowRoundsLeft(state, timer);
  if (now === timer.expiresAt) {
    return `${verb} after this turn (${casterName})`;
  }
  if (roundsLeft <= 1) {
    return `${verb} after ${casterName}'s next turn`;
  }
  return `${verb} after ${casterName}'s turn (${roundsLeft} rounds)`;
}
