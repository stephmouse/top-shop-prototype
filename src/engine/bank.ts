import { BANK_REWARDS, STORE_TYPES } from '../config/balance';
import {
  autoStockOwnShops,
  canCaptureShop,
  canPlayerOpenWithCash,
  canRedeemBankReward,
  captureRivalShopForPlayer,
  resolveTargetOwnShop,
  resolveTargetRival,
  resolveTargetRivalShop,
  vacateShopSlot,
} from './bankHelpers';
import { appendLog, getActivePlayer } from './helpers';
import { pickRandom, randomInt } from './rng';
import {
  buildStarterStock,
  getAllowedStoreTypeIds,
  getShopTotalStock,
  recomputeSegmentChainLevels,
  resumeAfterPostAction,
} from './shops';
import type { GameState, Player, Shop } from './types';

export { canRedeemBankReward } from './bankHelpers';

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
  let shops: Record<string, Shop> = { ...state.shops };

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
      patchPlayer(active.id, { points: active.points - reward.pointCost + eff.amount });
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
      patchPlayer(rival.id, { blockDeliveryTurns: Math.max(rival.blockDeliveryTurns, eff.turns) });
      return resumeAfterPostAction(makeState(`${rival.name} deliveries stopped (${eff.turns}T).`));
    }

    case 'block_rival_new_stores': {
      const rival = resolveTargetRival(state, targetPlayerId)!;
      patchPlayer(rival.id, { blockNewStoreTurns: Math.max(rival.blockNewStoreTurns, eff.turns) });
      return resumeAfterPostAction(makeState(`${rival.name} new stores stopped (${eff.turns}T).`));
    }

    case 'open_delivery':
      return {
        ...makeState('Select items to deliver.'),
        phase: 'SHOP_DELIVER',
        pendingBankRefundPts: reward.pointCost,
        deliverMode: eff.mode,
        deliverPreferredShopId: targetShopId ?? null,
        deliveredShopIdsThisTurn: [],
      };

    case 'auto_stock_own':
      shops = autoStockOwnShops({ ...state, shops }, active.id, eff.mode);
      return resumeAfterPostAction(makeState('Own stores restocked.'));

    case 'reverse_direction':
      if (eff.scope === 'rival') {
        const rival = resolveTargetRival(state, targetPlayerId)!;
        patchPlayer(rival.id, { reverseDirNextTurn: true });
        return resumeAfterPostAction(makeState(`${rival.name} will reverse next turn.`));
      }
      players = players.map((p) => (p.isBankrupt ? p : { ...p, reverseDirNextTurn: true }));
      return resumeAfterPostAction(makeState('All players reverse next turn.'));

    case 'close_rival_store_level': {
      const target = resolveTargetRivalShop(state, targetShopId, (s) => s.level === eff.level)!;
      shops = vacateShopSlot({ ...state, shops }, target.id);
      return resumeAfterPostAction(makeState(`Closed ${target.id} (L${eff.level}).`));
    }

    case 'close_all_empty_rival_stores': {
      let cur: GameState = { ...state, shops };
      for (const s of Object.values(shops)) {
        if (s.ownerId && s.ownerId !== active.id && getShopTotalStock(s) === 0) {
          cur = { ...cur, shops: vacateShopSlot(cur, s.id) };
        }
      }
      shops = cur.shops;
      return resumeAfterPostAction(makeState("Closed rivals' empty stores."));
    }

    case 'open_free_random_shop': {
      const candidates = Object.values(shops).filter(
        (s) => s.ownerId === null && getAllowedStoreTypeIds(state, active.id, s.segmentId).length > 0
      );
      const pickedSlot = pickRandom(seed, candidates);
      seed = pickedSlot.nextSeed;
      const allowed = getAllowedStoreTypeIds(state, active.id, pickedSlot.value.segmentId);
      const pickedType = pickRandom(seed, allowed);
      seed = pickedType.nextSeed;
      const typeId = pickedType.value;
      const claimed: Shop = { ...pickedSlot.value, ownerId: active.id, storeTypeId: typeId, stock: {} };
      shops = recomputeSegmentChainLevels(
        { ...state, shops: { ...shops, [claimed.id]: claimed } },
        claimed.segmentId,
        active.id
      );
      const leveled = shops[claimed.id]!;
      shops[claimed.id] = { ...leveled, stock: buildStarterStock(typeId, leveled.level) };
      return resumeAfterPostAction(makeState(`Opened free ${STORE_TYPES[typeId]?.name ?? typeId}.`));
    }

    case 'open_shop_rival_cash': {
      const rival = resolveTargetRival(state, targetPlayerId, (p) =>
        canPlayerOpenWithCash(state, active.id, p.cash)
      )!;
      return {
        ...makeState(`Using ${rival.name}'s cash ($${rival.cash}).`),
        phase: 'EVENT_PICK_STORE',
        pendingBankRefundPts: reward.pointCost,
        eventStorePrompt: {
          mode: 'buy_empty',
          multiplier: 1,
          forced: false,
          payerId: rival.id,
          allowOwnedSegment: true,
          fromBank: true,
        },
      };
    }

    case 'pencil_override': {
      const target = eff.target === 'self' ? active : resolveTargetRival(state, targetPlayerId)!;
      patchPlayer(target.id, { pencilMode: eff.mode, pencilTurnsLeft: eff.turns });
      return resumeAfterPostAction(makeState(`${target.name} pencil -> ${eff.mode} (${eff.turns}T).`));
    }

    case 'capture_rival_store': {
      if (eff.mode === 'all_empty') {
        let cur: GameState = { ...state, shops };
        for (const s of Object.values(shops)) {
          if (s.ownerId && s.ownerId !== active.id && getShopTotalStock(s) === 0 && canCaptureShop(cur, active.id, s)) {
            cur = { ...cur, shops: captureRivalShopForPlayer(cur, s.id, active.id, false) };
          }
        }
        shops = cur.shops;
        return resumeAfterPostAction(makeState("Captured rivals' empty stores."));
      }
      const target = resolveTargetRivalShop(
        state,
        targetShopId,
        (s) =>
          (eff.mode === 'one_l4' ? s.level === 4 : getShopTotalStock(s) === 0) &&
          canCaptureShop(state, active.id, s)
      )!;
      shops = captureRivalShopForPlayer({ ...state, shops }, target.id, active.id, eff.mode === 'one_l4');
      return resumeAfterPostAction(makeState(`Captured ${target.id}.`));
    }

    case 'empty_rival_stores': {
      const stocked = Object.values(shops).filter(
        (s) => s.ownerId && s.ownerId !== active.id && getShopTotalStock(s) > 0
      );
      const first = resolveTargetRivalShop(state, targetShopId, (s) => getShopTotalStock(s) > 0);
      const chosen: Shop[] = first ? [first] : [];
      const pool = stocked.filter((s) => s.id !== first?.id);
      while (chosen.length < eff.count && pool.length > 0) {
        const pick = pickRandom(seed, pool);
        seed = pick.nextSeed;
        chosen.push(pick.value);
        pool.splice(pool.findIndex((s) => s.id === pick.value.id), 1);
      }
      for (const s of chosen) shops[s.id] = { ...s, stock: {} };
      return resumeAfterPostAction(makeState(`Emptied ${chosen.length} rival store(s).`));
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
        p.id === active.id || p.isBankrupt
          ? p
          : { ...p, cash: Math.max(0, Math.floor((p.cash * eff.numerator) / eff.denominator)) }
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

    case 'equip_chirp_shoes':
      patchPlayer(active.id, { chirpSandals: true });
      return resumeAfterPostAction(makeState('Equipped "Chirp-Chirp" shoes!'));

    case 'double_own_store_prices':
      patchPlayer(active.id, { doublePriceTurns: eff.turns + 1 });
      return resumeAfterPostAction(makeState(`Store prices 2x for ${eff.turns} turns!`));

    case 'upgrade_own_store_l4': {
      const target = resolveTargetOwnShop(state, targetShopId, (s) => s.level < 4)!;
      shops = recomputeSegmentChainLevels(
        {
          ...state,
          shops: { ...shops, [target.id]: { ...target, level: 4, upgradedToL4: true } },
        },
        target.segmentId,
        active.id
      );
      return resumeAfterPostAction(makeState(`Upgraded ${target.id} to Level 4!`));
    }

    case 'claim_victory':
      return {
        ...makeState('Claimed victory!'),
        phase: 'GAME_OVER',
        winnerId: active.id,
      };
  }
}
