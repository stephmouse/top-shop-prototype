import { BANK_REWARDS } from '../config/balance';
import { WALK_SOUND_META } from '../config/walkSounds';
import { canRedeemBankReward } from './bankEligibility';
import { resolveTargetRival } from './bankHelpers';
import { applyBankShopEffect } from './bankShopEffects';
import {
  appendLog,
  clampPoints,
  getActivePlayer,
  resolveEquippedWalkSound,
  reversePlayerDirections,
} from './helpers';
import { randomInt } from './rng';
import { resumeAfterPostAction } from './shops';
import { createTimedWindow, extendTimedWindow } from './timedEffects';
import type { GameState, Player } from './types';

export { canRedeemBankReward, getBankRewardTargets } from './bankEligibility';
export type { BankRewardTargetList } from './bankEligibility';

export function handleRedeemBankReward(
  state: GameState,
  rewardId: string,
  targetPlayerId?: string,
  targetShopId?: string
): GameState {
  if (state.phase !== 'BANK_MENU') return state;
  const reward = BANK_REWARDS.find((r) => r.id === rewardId);
  if (!reward || !canRedeemBankReward(state, reward, targetPlayerId, targetShopId)) {
    return state;
  }

  const active = getActivePlayer(state);
  let seed = state.seed;
  let players: Player[] = state.players.map((p, idx) =>
    idx === state.activePlayerIndex ? { ...p, points: p.points - reward.pointCost } : p
  );
  const shops = { ...state.shops };

  const shopHandled = applyBankShopEffect({
    state,
    reward,
    active,
    players,
    shops,
    seed,
    targetPlayerId,
    targetShopId,
  });
  if (shopHandled) return shopHandled;

  const makeState = (note: string): GameState => ({
    ...state,
    seed,
    players,
    shops,
    hadBranchChoiceThisTurn: false,
    moveHistory: [],
    pendingUndoSnapshot: null,
    log: appendLog(state, `${active.name} [${reward.pointCost}p] ${reward.label}: ${note}`),
  });

  const patchPlayer = (id: string, patch: Partial<Player>) => {
    players = players.map((p) => (p.id === id ? { ...p, ...patch } : p));
  };

  const eff = reward.effect;
  switch (eff.kind) {
    case 'gain_points':
      patchPlayer(active.id, { points: clampPoints(active.points - reward.pointCost + eff.amount) });
      return resumeAfterPostAction(makeState(`+${eff.amount} pt.`));

    case 'gain_cash':
      patchPlayer(active.id, { cash: active.cash + eff.amount });
      return resumeAfterPostAction(makeState(`+$${eff.amount}.`));

    case 'gain_cash_per_store': {
      const count = Object.values(shops).filter((s) => s.ownerId === active.id).length;
      const gain = count * eff.amountPerStore;
      patchPlayer(active.id, { cash: active.cash + gain });
      return resumeAfterPostAction(makeState(`+$${gain} (${count} stores).`));
    }

    case 'block_rival_delivery': {
      const rival = resolveTargetRival(state, targetPlayerId)!;
      patchPlayer(rival.id, {
        blockDeliveryWindow: extendTimedWindow(rival.blockDeliveryWindow, state, eff.rounds, active.id),
      });
      return resumeAfterPostAction(makeState(`${rival.name} deliveries stopped (${eff.rounds} rd).`));
    }

    case 'block_rival_new_stores': {
      const rival = resolveTargetRival(state, targetPlayerId)!;
      patchPlayer(rival.id, {
        blockNewStoreWindow: extendTimedWindow(rival.blockNewStoreWindow, state, eff.rounds, active.id),
      });
      return resumeAfterPostAction(makeState(`${rival.name} new stores stopped (${eff.rounds} rd).`));
    }

    case 'reverse_direction':
      if (eff.scope === 'rival') {
        const rival = resolveTargetRival(state, targetPlayerId)!;
        patchPlayer(rival.id, reversePlayerDirections(rival));
        return resumeAfterPostAction(makeState(`${rival.name} reversed direction!`));
      }
      players = players.map((p) => {
        if (p.isBankrupt) return p;
        if (p.id === active.id && state.pendingPostBankPhase === 'STEPPING') {
          return { ...p, reverseDirNextTurn: !p.reverseDirNextTurn };
        }
        return { ...p, ...reversePlayerDirections(p) };
      });
      return resumeAfterPostAction(makeState('All players reversed direction!'));

    case 'pencil_override': {
      const target = eff.target === 'self' ? active : resolveTargetRival(state, targetPlayerId)!;
      patchPlayer(target.id, {
        pencilMode: eff.mode,
        pencilWindow: createTimedWindow(state, eff.rounds, active.id),
      });
      return resumeAfterPostAction(makeState(`${target.name} pencil -> ${eff.mode} (${eff.rounds} rd).`));
    }

    case 'set_rival_cash_fraction': {
      if (eff.scope === 'one') {
        const rival = resolveTargetRival(state, targetPlayerId, (p) => p.cash > 0)!;
        const nextCash = Math.max(0, Math.floor((rival.cash * eff.numerator) / eff.denominator));
        const cut = Math.max(0, rival.cash - nextCash);
        patchPlayer(rival.id, { cash: nextCash });
        if (eff.giveToSelf) patchPlayer(active.id, { cash: active.cash + cut });
        return resumeAfterPostAction(makeState(`${rival.name} cash -> $${nextCash}.`));
      }
      players = players.map((p) =>
        p.id === active.id || p.isBankrupt || p.cash <= 0
          ? p
          : { ...p, cash: Math.floor((p.cash * eff.numerator) / eff.denominator) }
      );
      return resumeAfterPostAction(makeState("Rivals' cash reduced."));
    }

    case 'set_rival_cash_to_one':
      if (eff.scope === 'one') {
        const rival = resolveTargetRival(state, targetPlayerId, (p) => p.cash > 1)!;
        patchPlayer(rival.id, { cash: 1 });
        return resumeAfterPostAction(makeState(`${rival.name} cash -> $1.`));
      }
      players = players.map((p) =>
        p.id === active.id || p.isBankrupt ? p : { ...p, cash: Math.min(p.cash, 1) }
      );
      return resumeAfterPostAction(makeState("All rivals' cash -> $1."));

    case 'cut_rivals_cash_per_store':
      players = players.map((p) => {
        if (p.id === active.id || p.isBankrupt) return p;
        const count = Object.values(shops).filter((s) => s.ownerId === p.id).length;
        return { ...p, cash: p.cash - count * eff.amountPerStore };
      });
      return resumeAfterPostAction(makeState(`Rivals lost $${eff.amountPerStore}/store.`));

    case 'copy_rival_cash': {
      const rival = resolveTargetRival(state, targetPlayerId, (p) => p.cash > 0)!;
      const bonus = Math.max(0, rival.cash);
      patchPlayer(active.id, { cash: active.cash + bonus });
      return resumeAfterPostAction(makeState(`+$${bonus} (matching ${rival.name}).`));
    }

    case 'shuffle_all_cash': {
      const liveIdxs = players.map((p, i) => (p.isBankrupt ? -1 : i)).filter((i) => i >= 0);
      const cashPool = liveIdxs.map((i) => players[i]!.cash);
      for (let i = cashPool.length - 1; i > 0; i--) {
        const r = randomInt(seed, 0, i);
        seed = r.nextSeed;
        const tmp = cashPool[i]!;
        cashPool[i] = cashPool[r.value]!;
        cashPool[r.value] = tmp;
      }
      liveIdxs.forEach((pIdx, k) => {
        players[pIdx] = { ...players[pIdx]!, cash: cashPool[k]! };
      });
      return resumeAfterPostAction(makeState('Shuffled player money!'));
    }

    case 'halve_rival_points': {
      const rival = resolveTargetRival(state, targetPlayerId, (p) => p.points > 0)!;
      const nextPts = Math.floor(rival.points / 2);
      patchPlayer(rival.id, { points: nextPts });
      return resumeAfterPostAction(makeState(`${rival.name} points -> ${nextPts}.`));
    }

    case 'swap_position_with_rival': {
      const rival = resolveTargetRival(state, targetPlayerId)!;
      patchPlayer(active.id, { tileId: rival.tileId, horizontalDir: null, verticalDir: null });
      patchPlayer(rival.id, { tileId: active.tileId, horizontalDir: null, verticalDir: null });
      return resumeAfterPostAction({
        ...makeState(`Swapped places with ${rival.name}.`),
        remainingSteps: 0,
        pendingPostBankPhase: null,
      });
    }

    case 'payday_modifier':
      if (eff.target === 'self_double') {
        patchPlayer(active.id, { doubleNextPayday: true });
        return resumeAfterPostAction(makeState('Next payday doubled!'));
      } else {
        const rival = resolveTargetRival(state, targetPlayerId, (p) => !p.skipNextPayday)!;
        patchPlayer(rival.id, { skipNextPayday: true });
        return resumeAfterPostAction(makeState(`${rival.name} will miss next payday.`));
      }

    case 'equip_chirp_shoes': {
      const resolved = resolveEquippedWalkSound(active.avatar?.walkSound, seed);
      seed = resolved.nextSeed;
      patchPlayer(active.id, { chirpSandals: true, equippedWalkSound: resolved.style });
      return resumeAfterPostAction(makeState(`Equipped ${WALK_SOUND_META[resolved.style].label}!`));
    }

    case 'double_own_store_prices':
      patchPlayer(active.id, {
        doublePriceWindow: extendTimedWindow(active.doublePriceWindow, state, eff.rounds, active.id),
      });
      return resumeAfterPostAction(makeState(`Store prices 2x for ${eff.rounds} rounds!`));

    case 'claim_victory':
      return {
        ...makeState('Claimed victory!'),
        phase: 'GAME_OVER',
        winnerId: active.id,
      };

    default:
      return state;
  }
}
