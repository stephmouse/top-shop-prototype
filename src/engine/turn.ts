import { MONTH_NAMES } from '../config/balance';
import { appendLog, computePlayerNetWorth, getActivePlayer, reversePlayerDirections } from './helpers';
import { recordAssetSnapshot } from './matchStats';
import type { WinReason } from './matchStats';
import { getTurnClock, isTimedWindowActive } from './timedEffects';
import type { GameState, Player, Shop } from './types';

export interface RankedPlayerStanding {
  player: Player;
  playerIdx: number;
  netWorth: number;
  rank: number;
}

// Mirrors PS1 SLUS_013.33 (0x80076e7c..0x80077194):
// sort row order by non-bankrupt -> later bankruptTurn (+0x4e) -> totalAssets (+0x70) -> cash (+0x68) -> seat index,
// and assign shared competition ranks (+0x2b: 1, 1, 3, 4) for non-bankrupt players tied on totalAssets.
export function rankPlayersForStandings(state: GameState): RankedPlayerStanding[] {
  const entries = state.players.map((player, playerIdx) => ({
    player,
    playerIdx,
    netWorth: computePlayerNetWorth(state, player.id),
  }));

  entries.sort((a, b) => {
    if (state.winReason === 'bank_99_points' && state.winnerId) {
      if (a.player.id === state.winnerId && b.player.id !== state.winnerId) return -1;
      if (b.player.id === state.winnerId && a.player.id !== state.winnerId) return 1;
    }
    if (a.player.isBankrupt !== b.player.isBankrupt) return a.player.isBankrupt ? 1 : -1;
    if (a.player.isBankrupt && b.player.isBankrupt) {
      const turnDiff = (b.player.bankruptTurn ?? 0) - (a.player.bankruptTurn ?? 0);
      if (turnDiff !== 0) return turnDiff;
    }
    if (b.netWorth !== a.netWorth) return b.netWorth - a.netWorth;
    if (b.player.cash !== a.player.cash) return b.player.cash - a.player.cash;
    return a.playerIdx - b.playerIdx;
  });

  const ranked: RankedPlayerStanding[] = [];
  for (let i = 0; i < entries.length; i++) {
    const cur = entries[i]!;
    const prev = ranked[i - 1];
    let rank = i + 1;
    if (i === 0) {
      rank = 1;
    } else if (state.winReason === 'bank_99_points' && i === 1) {
      rank = 2;
    } else if (prev && !cur.player.isBankrupt && !prev.player.isBankrupt && cur.netWorth === prev.netWorth) {
      rank = prev.rank;
    }
    ranked.push({ ...cur, rank });
  }
  return ranked;
}

export function getWinnerIds(state: GameState): string[] {
  if (state.winnerIds && state.winnerIds.length > 0) return state.winnerIds;
  return state.winnerId ? [state.winnerId] : [];
}

export function getVictoryWinners(state: GameState): string[] {
  const activePlayers = state.players.filter((p) => !p.isBankrupt);
  const bankruptCount = state.players.length - activePlayers.length;

  if (bankruptCount >= state.config.bankruptLimit || activePlayers.length <= 1) {
    const ranked = rankPlayersForStandings(state);
    return ranked.filter((r) => r.rank === 1).map((r) => r.player.id);
  }

  const qualifiers = activePlayers
    .map((player, idx) => ({
      player,
      seatIdx: state.players.indexOf(player) >= 0 ? state.players.indexOf(player) : idx,
      netWorth: computePlayerNetWorth(state, player.id),
    }))
    .filter((e) => e.netWorth >= state.config.targetAssets);

  if (qualifiers.length > 0) {
    qualifiers.sort((a, b) => {
      if (b.netWorth !== a.netWorth) return b.netWorth - a.netWorth;
      if (b.player.cash !== a.player.cash) return b.player.cash - a.player.cash;
      return a.seatIdx - b.seatIdx;
    });
    const topNetWorth = qualifiers[0]!.netWorth;
    return qualifiers.filter((q) => q.netWorth === topNetWorth).map((q) => q.player.id);
  }

  return [];
}

export function checkVictory(state: GameState): string | null {
  return getVictoryWinners(state)[0] ?? null;
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
      idx === state.activePlayerIndex ? { ...p, isBankrupt: true, bankruptTurn: state.turnNumber } : p
    );
    return advanceToNextTurn({
      ...state,
      players: bankruptPlayers,
      pendingPostBankPhase: null,
      pendingBankRefundPts: 0,
      log: appendLog(state, `${active.name} went BANKRUPT!`),
    });
  }

  let log = state.log;
  const total = state.players.length;
  let nextIndex = (state.activePlayerIndex + 1) % total;
  let crossedRoundBoundary = false;
  let guard = 0;

  while (guard < total) {
    if (nextIndex === state.roundStartPlayerIndex) {
      crossedRoundBoundary = true;
    }
    const cand = state.players[nextIndex];
    if (!cand || cand.isBankrupt) {
      nextIndex = (nextIndex + 1) % total;
      guard++;
      continue;
    }
    break;
  }

  const isRoundBoundary = crossedRoundBoundary;
  const nextTotalMonths = isRoundBoundary ? state.totalMonths + 1 : state.totalMonths;
  const nextMonth = nextTotalMonths % 12;
  const nextYear = Math.floor(nextTotalMonths / 12) + 1;
  if (isRoundBoundary) {
    const monthLabel = MONTH_NAMES[nextMonth] ?? 'April';
    log = [`[T${state.turnNumber + 1}] Calendar: Year ${nextYear} · ${monthLabel}.`, ...log].slice(0, 40);
  }

  const nextNow = getTurnClock({
    totalMonths: nextTotalMonths,
    players: state.players,
    activePlayerIndex: nextIndex,
    roundStartPlayerIndex: state.roundStartPlayerIndex,
  });

  const nextPlayers = state.players.map((p, idx) => {
    const pencilWindow = isTimedWindowActive(p.pencilWindow, nextNow) ? p.pencilWindow : null;
    const basePlayer = {
      ...p,
      blockDeliveryWindow: isTimedWindowActive(p.blockDeliveryWindow, nextNow) ? p.blockDeliveryWindow : null,
      blockNewStoreWindow: isTimedWindowActive(p.blockNewStoreWindow, nextNow) ? p.blockNewStoreWindow : null,
      pencilWindow,
      pencilMode: pencilWindow ? p.pencilMode : ('normal' as const),
      doublePriceWindow: isTimedWindowActive(p.doublePriceWindow, nextNow) ? p.doublePriceWindow : null,
    };
    if (idx !== nextIndex || p.isBankrupt) return basePlayer;

    let hDir = p.horizontalDir;
    let vDir = p.verticalDir;
    if (p.unlockDirNextTurn) {
      hDir = null;
      vDir = null;
    } else if (p.reverseDirNextTurn) {
      const reversed = reversePlayerDirections({ horizontalDir: hDir, verticalDir: vDir });
      hDir = reversed.horizontalDir;
      vDir = reversed.verticalDir;
    }
    return {
      ...basePlayer,
      horizontalDir: hDir,
      verticalDir: vDir,
      unlockDirNextTurn: false,
      reverseDirNextTurn: false,
    };
  });

  const nextShops: Record<string, Shop> = {};
  for (const [id, shop] of Object.entries(state.shops)) {
    nextShops[id] =
      shop.closedWindow && !isTimedWindowActive(shop.closedWindow, nextNow)
        ? { ...shop, closedWindow: null }
        : shop;
  }

  const nextSale =
    state.globalSale && isTimedWindowActive(state.globalSale.timer, nextNow) ? state.globalSale : null;
  const nextElevLock =
    state.elevatorLock && isTimedWindowActive(state.elevatorLock.timer, nextNow) ? state.elevatorLock : null;

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

  if (isRoundBoundary) {
    candidateState.assetHistory = recordAssetSnapshot(candidateState, false);
  }

  const activePlayers = candidateState.players.filter((p) => !p.isBankrupt);
  const bankruptCount = candidateState.players.length - activePlayers.length;
  const bankruptcyEnded =
    activePlayers.length <= 1 || bankruptCount >= candidateState.config.bankruptLimit;

  if (bankruptcyEnded || !state.config.finishRoundOnWin || isRoundBoundary) {
    const winnerIds = getVictoryWinners(candidateState);
    if (winnerIds.length > 0) {
      const winners = winnerIds
        .map((id) => candidateState.players.find((p) => p.id === id)?.name)
        .filter((n): n is string => Boolean(n));
      const winReason: WinReason = bankruptcyEnded ? 'bankruptcy' : 'target_assets';
      const winText =
        winners.length > 1
          ? `${winners.join(' & ')} tie for the win!`
          : `${winners[0] ?? 'Player'} wins the match!`;
      const wonState: GameState = {
        ...candidateState,
        phase: 'GAME_OVER',
        winnerId: winnerIds[0]!,
        winnerIds,
        winReason,
        log: appendLog(candidateState, winText),
      };
      return {
        ...wonState,
        assetHistory: recordAssetSnapshot(wonState, true),
      };
    }
  }

  return { ...candidateState, phase: 'ROLL_PENCIL' };
}
