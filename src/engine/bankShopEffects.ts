import { STORE_TYPES } from '../config/balance';
import {
  autoStockOwnShops,
  canCaptureShop,
  canPlayerOpenWithCash,
  captureRivalChainForPlayer,
  captureRivalShopForPlayer,
  resolveTargetOwnShop,
  resolveTargetRival,
  resolveTargetRivalShop,
  upgradeOwnSegmentToChain,
  vacateShopChain,
  vacateShopSlot,
} from './bankHelpers';
import { appendLog } from './helpers';
import { pickRandom } from './rng';
import {
  buildStarterStock,
  getAllowedStoreTypeIds,
  getSegmentSlotCount,
  getShopTotalStock,
  recomputeSegmentChainLevels,
  resumeAfterPostAction,
} from './shops';
import type { BankRewardDef, GameState, Player, Shop } from './types';

export interface BankEffectContext {
  state: GameState;
  reward: BankRewardDef;
  active: Player;
  players: Player[];
  shops: Record<string, Shop>;
  seed: number;
  targetPlayerId?: string;
  targetShopId?: string;
}

function buildResultState(
  ctx: BankEffectContext,
  note: string,
  shops: Record<string, Shop> = ctx.shops,
  seed = ctx.seed
): GameState {
  return {
    ...ctx.state,
    seed,
    players: ctx.players,
    shops,
    hadBranchChoiceThisTurn: false,
    moveHistory: [],
    pendingUndoSnapshot: null,
    log: appendLog(
      ctx.state,
      `${ctx.active.name} [${ctx.reward.pointCost}p] ${ctx.reward.label}: ${note}`
    ),
  };
}

export function applyBankShopEffect(ctx: BankEffectContext): GameState | null {
  const { state, reward, active, targetPlayerId, targetShopId } = ctx;
  const eff = reward.effect;

  switch (eff.kind) {
    case 'open_delivery':
      return {
        ...buildResultState(ctx, 'Select items to deliver.'),
        phase: 'SHOP_DELIVER',
        pendingBankRefundPts: reward.pointCost,
        deliverMode: eff.mode,
        deliverPreferredShopId: targetShopId ?? null,
        deliveredShopIdsThisTurn: [],
      };

    case 'auto_stock_own': {
      const nextShops = autoStockOwnShops({ ...state, shops: ctx.shops }, active.id, eff.mode);
      return resumeAfterPostAction(buildResultState(ctx, 'Own stores restocked.', nextShops));
    }

    case 'close_rival_store_level': {
      const target = resolveTargetRivalShop(state, targetShopId, (s) => s.level === eff.level)!;
      const nextShops = vacateShopChain({ ...state, shops: ctx.shops }, target.id);
      return resumeAfterPostAction(
        buildResultState(ctx, `Closed ${target.id} chain (L${eff.level}).`, nextShops)
      );
    }

    case 'close_all_empty_rival_stores': {
      let cur: GameState = { ...state, shops: ctx.shops };
      for (const s of Object.values(ctx.shops)) {
        if (s.ownerId && s.ownerId !== active.id && getShopTotalStock(s) === 0) {
          cur = { ...cur, shops: vacateShopSlot(cur, s.id) };
        }
      }
      return resumeAfterPostAction(buildResultState(ctx, "Closed rivals' empty stores.", cur.shops));
    }

    case 'open_free_random_shop': {
      let seed = ctx.seed;
      const candidates = Object.values(ctx.shops).filter(
        (s) => s.ownerId === null && getAllowedStoreTypeIds(state, active.id, s.segmentId).length > 0
      );
      const pickedSlot = pickRandom(seed, candidates);
      seed = pickedSlot.nextSeed;
      const allowed = getAllowedStoreTypeIds(state, active.id, pickedSlot.value.segmentId);
      const pickedType = pickRandom(seed, allowed);
      seed = pickedType.nextSeed;
      const typeId = pickedType.value;
      const claimed: Shop = { ...pickedSlot.value, ownerId: active.id, storeTypeId: typeId, stock: {} };
      const nextShops = recomputeSegmentChainLevels(
        { ...state, shops: { ...ctx.shops, [claimed.id]: claimed } },
        claimed.segmentId,
        active.id
      );
      const leveled = nextShops[claimed.id]!;
      nextShops[claimed.id] = { ...leveled, stock: buildStarterStock(typeId, leveled.level) };
      return resumeAfterPostAction(
        buildResultState(ctx, `Opened free ${STORE_TYPES[typeId]?.name ?? typeId}.`, nextShops, seed)
      );
    }

    case 'open_shop_rival_cash': {
      const rival = resolveTargetRival(state, targetPlayerId, (p) =>
        canPlayerOpenWithCash(state, active.id, p.cash)
      )!;
      return {
        ...buildResultState(ctx, `Using ${rival.name}'s cash ($${rival.cash}).`),
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

    case 'capture_rival_store': {
      if (eff.mode === 'all_empty') {
        let cur: GameState = { ...state, shops: ctx.shops };
        for (const s of Object.values(ctx.shops)) {
          if (s.ownerId && s.ownerId !== active.id && getShopTotalStock(s) === 0 && canCaptureShop(cur, active.id, s)) {
            cur = { ...cur, shops: captureRivalShopForPlayer(cur, s.id, active.id) };
          }
        }
        return resumeAfterPostAction(buildResultState(ctx, "Captured rivals' empty stores.", cur.shops));
      }
      if (eff.mode === 'one_l4') {
        const target = resolveTargetRivalShop(state, targetShopId, (s) => s.level === 4)!;
        const nextShops = captureRivalChainForPlayer({ ...state, shops: ctx.shops }, target.id, active.id);
        return resumeAfterPostAction(buildResultState(ctx, `Captured L4 chain (${target.id}).`, nextShops));
      }
      const target = resolveTargetRivalShop(
        state,
        targetShopId,
        (s) => getShopTotalStock(s) === 0 && canCaptureShop(state, active.id, s)
      )!;
      const nextShops = captureRivalShopForPlayer({ ...state, shops: ctx.shops }, target.id, active.id);
      return resumeAfterPostAction(buildResultState(ctx, `Captured ${target.id}.`, nextShops));
    }

    case 'empty_rival_stores': {
      let seed = ctx.seed;
      const stocked = Object.values(ctx.shops).filter(
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
      const nextShops = { ...ctx.shops };
      for (const s of chosen) nextShops[s.id] = { ...s, stock: {} };
      return resumeAfterPostAction(
        buildResultState(ctx, `Emptied ${chosen.length} rival store(s).`, nextShops, seed)
      );
    }

    case 'upgrade_own_store_l4': {
      const target = resolveTargetOwnShop(
        state,
        targetShopId,
        (s) => s.level < getSegmentSlotCount(state, s.segmentId)
      )!;
      const nextShops = upgradeOwnSegmentToChain({ ...state, shops: ctx.shops }, target.id, active.id);
      const nextLevel = nextShops[target.id]?.level ?? 4;
      return resumeAfterPostAction(
        buildResultState(ctx, `Upgraded ${target.id} segment to L${nextLevel} chain!`, nextShops)
      );
    }

    default:
      return null;
  }
}
