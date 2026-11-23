import { getActivePlayer } from '../engine/helpers';
import type { GameState } from '../engine/types';
import type { NetRole, RoomRoster } from '../net/protocol';
import type { SoundFxController } from './soundFx';

export interface TurnCueTracker {
  sync: (state: GameState, canAct: boolean) => boolean;
  reset: () => void;
}

/**
 * Returns true when leaving/refreshing the tab could disrupt an active match:
 * - For `guest`: never warn (guests can reconnect cleanly via invite link).
 * - For `host`: warn unless GAME_OVER when guests are online or the match is in progress.
 * - For `offline` local play: warn once the match has progressed beyond Turn 1 pre-roll until GAME_OVER.
 */
export function shouldWarnBeforeUnload(
  state: GameState,
  role: NetRole,
  roster: RoomRoster | null
): boolean {
  if (state.phase === 'GAME_OVER' || role === 'guest') return false;
  const inProgress = state.turnNumber > 1 || state.phase !== 'ROLL_PENCIL';
  if (role === 'host') {
    return Boolean(roster?.peers.some((p) => p.connected)) || inProgress;
  }
  return inProgress;
}

/**
 * Tracks local turn transitions so the "Your Turn" chime plays only for the device
 * taking control of the current turn, while keeping `document.title` updated.
 */
export function createTurnCueTracker(
  soundFx: Pick<SoundFxController, 'playYourTurn'>,
  baseTitle = 'Top Shop Prototype'
): TurnCueTracker {
  let initialized = false;
  let wasLocalTurn = false;
  let lastTurnKey: string | null = null;

  return {
    sync: (state, canAct) => {
      const active = getActivePlayer(state);
      if (typeof document !== 'undefined') {
        document.title =
          canAct && state.phase !== 'GAME_OVER'
            ? `▶ Your Turn (${active.name}) — ${baseTitle}`
            : baseTitle;
      }

      const turnKey = `${state.mapId}|${state.turnNumber}|${state.activePlayerIndex}`;
      const shouldChime =
        initialized &&
        state.phase !== 'GAME_OVER' &&
        canAct &&
        (!wasLocalTurn || turnKey !== lastTurnKey);

      if (shouldChime) {
        soundFx.playYourTurn();
      }

      initialized = true;
      wasLocalTurn = canAct;
      lastTurnKey = turnKey;
      return shouldChime;
    },
    reset: () => {
      initialized = false;
      wasLocalTurn = false;
      lastTurnKey = null;
    },
  };
}
