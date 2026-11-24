import { MONTH_NAMES } from '../config/balance';
import { appendLog, computePlayerNetWorth, getActivePlayer, reversePlayerDirections } from './helpers';
import type { GameState, Shop } from './types';

export function checkVictory(state: GameState): string | null {
  const activePlayers = state.players.filter((p) => !p.isBankrupt);
  const bankruptCount = state.players.length - activePlayers.length;

  if (bankruptCount >= state.config.bankruptLimit || activePlayers.length <= 1) {
    const pool = activePlayers.length > 0 ? activePlayers : state.players;
    const sorted = [...pool].sort(
      (a, b) => computePlayerNetWorth(state, b.id) - computePlayerNetWorth(state, a.id)
    );
    return sorted[0]?.id ?? null;
  }

  const qualifiers = activePlayers.filter(
    (p) => computePlayerNetWorth(state, p.id) >= state.config.targetAssets
  );
  if (qualifiers.length > 0) {
    const sorted = [...qualifiers].sort(
      (a, b) => computePlayerNetWorth(state, b.id) - computePlayerNetWorth(state, a.id)
    );
    return sorted[0]?.id ?? null;
  }

  return null;
}

export function advanceToNextTurn(state: GameState): GameState {
  const active = getActivePlayer(state);
  if (!active.isBankrupt && active.cash < 0) {
    const owned = Object.values(state.shops).filter((s) => s.ownerId === active.id);
    if (owned.length > 0) {
      return {
        ...state,
        phase: 'LIQUIDATE_ASSETS',
        moveHistory: [],
        hadBranchChoiceThisTurn: false,
        log: appendLog(state, `${active.name} has negative cash ($${active.cash}) — must sell assets.`),
      };
    }
    const bankruptPlayers = state.players.map((p, idx) =>
      idx === state.activePlayerIndex ? { ...p, isBankrupt: true } : p
    );
    return advanceToNextTurn({
      ...state,
      players: bankruptPlayers,
      pendingPostBankPhase: null,
      pendingBankRefundPts: 0,
      log: appendLog(state, `${active.name} went BANKRUPT!`),
    });
  }

  const finishedId = active.id;
  const nextPlayers = state.players.map((p, idx) => {
    if (idx !== state.activePlayerIndex) return p;
    return {
      ...p,
      blockDeliveryTurns: Math.max(0, p.blockDeliveryTurns - 1),
      blockNewStoreTurns: Math.max(0, p.blockNewStoreTurns - 1),
      doublePriceTurns: Math.max(0, p.doublePriceTurns - 1),
    };
  });

  const nextShops: Record<string, Shop> = {};
  for (const [id, shop] of Object.entries(state.shops)) {
    nextShops[id] =
      shop.ownerId === finishedId && shop.isClosedTurns > 0
        ? { ...shop, isClosedTurns: shop.isClosedTurns - 1 }
        : shop;
  }

  const nextSale =
    state.globalSale && state.globalSale.turnsLeft > 1
      ? { ...state.globalSale, turnsLeft: state.globalSale.turnsLeft - 1 }
      : null;
  const nextElevLock =
    state.elevatorLock && state.elevatorLock.turnsLeft > 1
      ? { ...state.elevatorLock, turnsLeft: state.elevatorLock.turnsLeft - 1 }
      : null;

  let log = state.log;
  const total = nextPlayers.length;
  let nextIndex = (state.activePlayerIndex + 1) % total;
  let crossedRoundBoundary = false;
  let guard = 0;

  while (guard < total) {
    if (nextIndex === state.roundStartPlayerIndex) {
      crossedRoundBoundary = true;
    }
    const cand = nextPlayers[nextIndex];
    if (!cand || cand.isBankrupt) {
      nextIndex = (nextIndex + 1) % total;
      guard++;
      continue;
    }
    break;
  }

  const incoming = nextPlayers[nextIndex];
  if (incoming && !incoming.isBankrupt) {
    let hDir = incoming.horizontalDir;
    let vDir = incoming.verticalDir;
    if (incoming.unlockDirNextTurn) {
      hDir = null;
      vDir = null;
    } else if (incoming.reverseDirNextTurn) {
      const reversed = reversePlayerDirections({ horizontalDir: hDir, verticalDir: vDir });
      hDir = reversed.horizontalDir;
      vDir = reversed.verticalDir;
    }
    nextPlayers[nextIndex] = {
      ...incoming,
      horizontalDir: hDir,
      verticalDir: vDir,
      unlockDirNextTurn: false,
      reverseDirNextTurn: false,
    };
  }

  const isRoundBoundary = crossedRoundBoundary;
  const nextTotalMonths = isRoundBoundary ? state.totalMonths + 1 : state.totalMonths;
  const nextMonth = nextTotalMonths % 12;
  const nextYear = Math.floor(nextTotalMonths / 12) + 1;
  if (isRoundBoundary) {
    const monthLabel = MONTH_NAMES[nextMonth] ?? 'April';
    log = [`[T${state.turnNumber + 1}] Calendar: Year ${nextYear} · ${monthLabel}.`, ...log].slice(0, 40);
  }

  const candidateState: GameState = {
    ...state,
    players: nextPlayers,
    shops: nextShops,
    globalSale: nextSale,
    elevatorLock: nextElevLock,
    activePlayerIndex: nextIndex,
    turnNumber: state.turnNumber + 1,
    month: nextMonth,
    year: nextYear,
    totalMonths: nextTotalMonths,
    lastRoll: null,
    remainingSteps: 0,
    hadBranchChoiceThisTurn: false,
    moveHistory: [],
    pendingUndoSnapshot: null,
    pendingPostBankPhase: null,
    pendingBankRefundPts: 0,
    deliverMode: null,
    deliverPreferredShopId: null,
    deliveredShopIdsThisTurn: [],
    eventChoices: [],
    revealedEventSlot: null,
    eventStorePrompt: null,
    log,
  };

  const activePlayers = candidateState.players.filter((p) => !p.isBankrupt);
  const bankruptCount = candidateState.players.length - activePlayers.length;
  const bankruptcyEnded =
    activePlayers.length <= 1 || bankruptCount >= candidateState.config.bankruptLimit;

  if (bankruptcyEnded || !state.config.finishRoundOnWin || isRoundBoundary) {
    const winnerId = checkVictory(candidateState);
    if (winnerId) {
      const winner = candidateState.players.find((p) => p.id === winnerId);
      return {
        ...candidateState,
        phase: 'GAME_OVER',
        winnerId,
        log: appendLog(candidateState, `${winner?.name ?? 'Player'} wins the match!`),
      };
    }
  }

  return { ...candidateState, phase: 'ROLL_PENCIL' };
}
