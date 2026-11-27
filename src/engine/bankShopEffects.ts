import { STORE_TYPES } from '../config/balance';
import { STORE_CAPACITY_BY_LEVEL } from '../config/balance';
import {
  autoStockOwnShops,
  canCaptureShop,
  canPlayerOpenWithCash,
  captureRivalChainForPlayer,
  captureRivalShopForPlayer,
  getDistinctChains,
  getOpenableEmptyLots,
  resolveTargetRival,
  upgradeOwnSegmentToChain,
  vacateShopChain,
  vacateShopSlot,
} from './bankHelpers';
import { appendLog, formatShopRef } from './helpers';
import { bumpMultiPlayerMatchStats } from './matchStats';
import type { PlayerMatchStats } from './matchStats';
import { pickRandom } from './rng';
import {
  buildStarterStock,
  computeOpenShopCost,
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

function countOwnedItems(shops: Record<string, Shop>, ownerId: string): number {
  let total = 0;
  for (const s of Object.values(shops)) {
    if (s.ownerId === ownerId) total += getShopTotalStock(s);
  }
  return total;
}

function collectTransferDeltas(
  before: Record<string, Shop>,
  after: Record<string, Shop>,
  activeId: string,
  kind: 'closed' | 'stolen'
): Array<[string, Partial<PlayerMatchStats>]> {
  let activeCount = 0;
  const byRival = new Map<string, number>();
  for (const [id, oldShop] of Object.entries(before)) {
    const prevOwner = oldShop.ownerId;
    if (!prevOwner || prevOwner === activeId) continue;
    const nextOwner = after[id]?.ownerId ?? null;
    const matched = kind === 'closed' ? nextOwner === null : nextOwner === activeId;
    if (!matched) continue;
    activeCount += 1;
    byRival.set(prevOwner, (byRival.get(prevOwner) ?? 0) + 1);
  }
  if (activeCount === 0) return [];
  const updates: Array<[string, Partial<PlayerMatchStats>]> = [
    [activeId, kind === 'closed' ? { rivalShopsClosed: activeCount } : { shopsStolen: activeCount }],
  ];
  for (const [rivalId, count] of byRival) {
    updates.push([rivalId, kind === 'closed' ? { shopsClosedByRivals: count } : { shopsLostToTheft: count }]);
  }
  return updates;
}

function buildResultState(
  ctx: BankEffectContext,
  note: string,
  shops: Record<string, Shop> = ctx.shops,
  seed = ctx.seed,
  players: Player[] = ctx.players,
  statUpdates: Array<[string, Partial<PlayerMatchStats>]> = []
): GameState {
  return {
    ...ctx.state,
    seed,
    players,
    shops,
    hadBranchChoiceThisTurn: false,
    moveHistory: [],
    pendingUndoSnapshot: null,
    ...(statUpdates.length > 0
      ? { matchStats: bumpMultiPlayerMatchStats(ctx.state, statUpdates) }
      : {}),
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
    case 'open_delivery': {
      const rival =
        eff.mode === 'rival_paid'
          ? resolveTargetRival(state, targetPlayerId, (p) =>
              Object.values(ctx.shops).some(
                (s) => s.ownerId === p.id && getShopTotalStock(s) < STORE_CAPACITY_BY_LEVEL[s.level]
              )
            )
          : undefined;
      return {
        ...buildResultState(ctx, rival ? `Select items to deliver to ${rival.name}.` : 'Select items to deliver.'),
        phase: 'SHOP_DELIVER',
        pendingBankRefundPts: reward.pointCost,
        deliverMode: eff.mode,
        deliverTargetPlayerId: rival?.id ?? null,
        deliverPreferredShopId: targetShopId ?? null,
        deliveredShopIdsThisTurn: [],
      };
    }

    case 'auto_stock_own': {
      const beforeItems = countOwnedItems(ctx.shops, active.id);
      const nextShops = autoStockOwnShops({ ...state, shops: ctx.shops }, active.id, eff.mode);
      const addedItems = Math.max(0, countOwnedItems(nextShops, active.id) - beforeItems);
      return resumeAfterPostAction(
        buildResultState(
          ctx,
          'Own stores restocked.',
          nextShops,
          ctx.seed,
          ctx.players,
          addedItems > 0 ? [[active.id, { itemsDelivered: addedItems }]] : []
        )
      );
    }

    case 'close_rival_store_level': {
      let seed = ctx.seed;
      const rival = resolveTargetRival(state, targetPlayerId, (p) =>
        Object.values(ctx.shops).some((s) => s.ownerId === p.id && s.level === eff.level)
      )!;
      const rivalMatches = Object.values(ctx.shops).filter(
        (s) => s.ownerId === rival.id && s.level === eff.level
      );
      const chains = getDistinctChains(state, rivalMatches);
      const picked = pickRandom(seed, chains);
      seed = picked.nextSeed;
      const nextShops = vacateShopChain({ ...state, shops: ctx.shops }, picked.value.id);
      return resumeAfterPostAction(
        buildResultState(
          ctx,
          `Closed ${rival.name}'s ${formatShopRef(state, picked.value)} chain (L${eff.level}).`,
          nextShops,
          seed,
          ctx.players,
          collectTransferDeltas(ctx.shops, nextShops, active.id, 'closed')
        )
      );
    }

    case 'close_all_empty_rival_stores': {
      let cur: GameState = { ...state, shops: ctx.shops };
      for (const s of Object.values(ctx.shops)) {
        if (s.ownerId && s.ownerId !== active.id && getShopTotalStock(s) === 0) {
          cur = { ...cur, shops: vacateShopSlot(cur, s.id) };
        }
      }
      return resumeAfterPostAction(
        buildResultState(
          ctx,
          "Closed rivals' empty stores.",
          cur.shops,
          ctx.seed,
          ctx.players,
          collectTransferDeltas(ctx.shops, cur.shops, active.id, 'closed')
        )
      );
    }

    case 'open_free_random_shop': {
      let seed = ctx.seed;
      const candidates = getOpenableEmptyLots(state, active.id, Infinity, false);
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
        buildResultState(
          ctx,
          `Opened free ${formatShopRef(state, nextShops[claimed.id]!)}.`,
          nextShops,
          seed,
          ctx.players,
          [[active.id, { storesOpened: 1 }]]
        )
      );
    }

    case 'open_shop_rival_cash': {
      let seed = ctx.seed;
      const rival = resolveTargetRival(state, targetPlayerId, (p) =>
        canPlayerOpenWithCash(state, active.id, p.cash, false)
      )!;
      const candidates = getOpenableEmptyLots(state, active.id, rival.cash, false);
      const pickedSlot = pickRandom(seed, candidates);
      seed = pickedSlot.nextSeed;
      const affordableTypes = getAllowedStoreTypeIds(state, active.id, pickedSlot.value.segmentId).filter(
        (id) => computeOpenShopCost(state, pickedSlot.value.id, active.id, id).openCost <= rival.cash
      );
      const pickedType = pickRandom(seed, affordableTypes);
      seed = pickedType.nextSeed;
      const typeId = pickedType.value;
      const { openCost } = computeOpenShopCost(state, pickedSlot.value.id, active.id, typeId);
      const players = ctx.players.map((p) =>
        p.id === rival.id ? { ...p, cash: p.cash - openCost } : p
      );
      const claimed: Shop = { ...pickedSlot.value, ownerId: active.id, storeTypeId: typeId, stock: {} };
      const nextShops = recomputeSegmentChainLevels(
        { ...state, players, shops: { ...ctx.shops, [claimed.id]: claimed } },
        claimed.segmentId,
        active.id
      );
      const leveled = nextShops[claimed.id]!;
      nextShops[claimed.id] = { ...leveled, stock: buildStarterStock(typeId, leveled.level) };
      return resumeAfterPostAction(
        buildResultState(
          ctx,
          `Opened ${formatShopRef(state, nextShops[claimed.id]!)} using ${rival.name}'s cash (-$${openCost}).`,
          nextShops,
          seed,
          players,
          [[active.id, { storesOpened: 1 }]]
        )
      );
    }

    case 'capture_rival_store': {
      if (eff.mode === 'all_empty') {
        let cur: GameState = { ...state, shops: ctx.shops };
        for (const s of Object.values(ctx.shops)) {
          if (s.ownerId && s.ownerId !== active.id && getShopTotalStock(s) === 0 && canCaptureShop(cur, active.id, s)) {
            cur = { ...cur, shops: captureRivalShopForPlayer(cur, s.id, active.id) };
          }
        }
        return resumeAfterPostAction(
          buildResultState(
            ctx,
            "Captured rivals' empty stores.",
            cur.shops,
            ctx.seed,
            ctx.players,
            collectTransferDeltas(ctx.shops, cur.shops, active.id, 'stolen')
          )
        );
      }
      let seed = ctx.seed;
      if (eff.mode === 'one_l4') {
        const rival = resolveTargetRival(state, targetPlayerId, (p) =>
          Object.values(ctx.shops).some((s) => s.ownerId === p.id && s.level === 4)
        )!;
        const l4Chains = getDistinctChains(
          state,
          Object.values(ctx.shops).filter((s) => s.ownerId === rival.id && s.level === 4)
        );
        const picked = pickRandom(seed, l4Chains);
        seed = picked.nextSeed;
        const nextShops = captureRivalChainForPlayer({ ...state, shops: ctx.shops }, picked.value.id, active.id);
        return resumeAfterPostAction(
          buildResultState(
            ctx,
            `Captured ${rival.name}'s L4 ${formatShopRef(state, picked.value)} chain.`,
            nextShops,
            seed,
            ctx.players,
            collectTransferDeltas(ctx.shops, nextShops, active.id, 'stolen')
          )
        );
      }
      const rival = resolveTargetRival(state, targetPlayerId, (p) =>
        Object.values(ctx.shops).some(
          (s) => s.ownerId === p.id && getShopTotalStock(s) === 0 && canCaptureShop(state, active.id, s)
        )
      )!;
      const eligible = Object.values(ctx.shops).filter(
        (s) => s.ownerId === rival.id && getShopTotalStock(s) === 0 && canCaptureShop(state, active.id, s)
      );
      const picked = pickRandom(seed, eligible);
      seed = picked.nextSeed;
      const nextShops = captureRivalShopForPlayer({ ...state, shops: ctx.shops }, picked.value.id, active.id);
      return resumeAfterPostAction(
        buildResultState(
          ctx,
          `Captured ${rival.name}'s ${formatShopRef(state, picked.value)}.`,
          nextShops,
          seed,
          ctx.players,
          collectTransferDeltas(ctx.shops, nextShops, active.id, 'stolen')
        )
      );
    }

    case 'empty_rival_stores': {
      let seed = ctx.seed;
      const nextShops = { ...ctx.shops };
      if (eff.count === 1) {
        const rival = resolveTargetRival(state, targetPlayerId, (p) =>
          Object.values(ctx.shops).some((s) => s.ownerId === p.id && getShopTotalStock(s) > 0)
        )!;
        const pool = Object.values(ctx.shops).filter(
          (s) => s.ownerId === rival.id && getShopTotalStock(s) > 0
        );
        const picked = pickRandom(seed, pool);
        seed = picked.nextSeed;
        nextShops[picked.value.id] = { ...picked.value, stock: {} };
        return resumeAfterPostAction(
          buildResultState(ctx, `Emptied ${rival.name}'s ${formatShopRef(state, picked.value)}.`, nextShops, seed)
        );
      }
      const pool = Object.values(ctx.shops).filter(
        (s) => s.ownerId && s.ownerId !== active.id && getShopTotalStock(s) > 0
      );
      const chosen: Shop[] = [];
      while (chosen.length < eff.count && pool.length > 0) {
        const pick = pickRandom(seed, pool);
        seed = pick.nextSeed;
        chosen.push(pick.value);
        pool.splice(pool.findIndex((s) => s.id === pick.value.id), 1);
      }
      for (const s of chosen) nextShops[s.id] = { ...s, stock: {} };
      const refs = chosen.map((s) => formatShopRef(state, s)).join(', ');
      return resumeAfterPostAction(
        buildResultState(ctx, `Emptied ${chosen.length} rival store(s): ${refs}.`, nextShops, seed)
      );
    }

    case 'upgrade_own_store_l4': {
      let seed = ctx.seed;
      const seenSegs = new Set<string>();
      const segments: Shop[] = [];
      for (const s of Object.values(ctx.shops)) {
        if (s.ownerId !== active.id || s.level >= getSegmentSlotCount(state, s.segmentId)) continue;
        if (seenSegs.has(s.segmentId)) continue;
        seenSegs.add(s.segmentId);
        segments.push(s);
      }
      const picked = pickRandom(seed, segments);
      seed = picked.nextSeed;
      const nextShops = upgradeOwnSegmentToChain({ ...state, shops: ctx.shops }, picked.value.id, active.id);
      const nextLevel = nextShops[picked.value.id]?.level ?? 4;
      return resumeAfterPostAction(
        buildResultState(
          ctx,
          `Upgraded ${formatShopRef(state, picked.value)} segment to L${nextLevel} chain!`,
          nextShops,
          seed
        )
      );
    }

    default:
      return null;
  }
}
