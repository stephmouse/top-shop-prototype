import type { AvatarSpec } from '../config/avatarTypes';
import { sanitizeAvatarSpec } from '../config/avatarTypes';
import { sanitizeSignatureStore } from '../config/signatureStore';
import type { SignatureStoreSpec } from '../config/signatureStore';
import { PLAYER_COLORS } from '../config/balance';
import type { GameState } from '../engine/types';
import type { NetRole } from '../net/protocol';
import type { MatchSetupData } from './persistence';
import { saveAutoSavedMatch, saveStoredSetup } from './persistence';
import { isMatchInProgress, saveUserProfile } from './playerProfile';
import type { UserProfile } from './playerProfile';

function patchEntryWithProfile<
  T extends { name: string; color?: string; avatar?: AvatarSpec; signatureStore?: SignatureStoreSpec },
>(entry: T, next: UserProfile): T {
  const sig = sanitizeSignatureStore(next.signatureStore);
  const { signatureStore: _old, ...rest } = entry;
  return {
    ...rest,
    name: next.name,
    color: next.color,
    avatar: next.avatar,
    ...(sig ? { signatureStore: sig } : {}),
  } as T;
}

export function buildExtendedLocalPlayers(setup: MatchSetupData): MatchSetupData['players'] {
  const nextIdx = setup.players.length;
  return [
    ...setup.players,
    {
      name: `Player ${nextIdx + 1}`,
      color: PLAYER_COLORS[nextIdx % PLAYER_COLORS.length]!,
      isBot: false,
      avatar: sanitizeAvatarSpec(undefined, nextIdx),
    },
  ];
}

export function applyUnifiedProfileChange(
  state: GameState,
  setup: MatchSetupData,
  role: NetRole,
  next: UserProfile
): { nextState: GameState; nextSetup: MatchSetupData; stateChanged: boolean } {
  saveUserProfile(next);
  const nextSetup: MatchSetupData = {
    ...setup,
    players: setup.players.map((p, idx) => (idx === 0 ? patchEntryWithProfile(p, next) : p)),
  };
  saveStoredSetup(nextSetup);

  if (role === 'guest' || isMatchInProgress(state) || !state.players[0]) {
    return { nextState: state, nextSetup, stateChanged: false };
  }
  const players = state.players.map((p, idx) => (idx === 0 ? patchEntryWithProfile(p, next) : p));
  const nextState: GameState = { ...state, players };
  saveAutoSavedMatch(nextState);
  return { nextState, nextSetup, stateChanged: true };
}

export function applyHostSeatEdit(
  state: GameState,
  setup: MatchSetupData,
  seatIdx: number,
  next: UserProfile
): { nextState: GameState; nextSetup: MatchSetupData } {
  const nextSetup: MatchSetupData = {
    ...setup,
    players: setup.players.map((p, idx) => (idx === seatIdx ? patchEntryWithProfile(p, next) : p)),
  };
  saveStoredSetup(nextSetup);
  if (seatIdx === 0) saveUserProfile(next);

  const players = state.players.map((p, idx) => (idx === seatIdx ? patchEntryWithProfile(p, next) : p));
  const nextState: GameState = { ...state, players };
  saveAutoSavedMatch(nextState);
  return { nextState, nextSetup };
}
