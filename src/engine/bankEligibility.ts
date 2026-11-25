import { STORE_CAPACITY_BY_LEVEL } from '../config/balance';
import {
  canCaptureShop,
  canPlayerOpenWithCash,
  resolveTargetRival,
  resolveTargetRivalShop,
} from './bankHelpers';
import { getSegmentSlotCount, getShopTotalStock } from './shops';
import type { BankRewardDef, GameState, Player, Shop } from './types';

export type BankRewardTargetList =
  | { kind: 'none' }
  | { kind: 'player'; players: Player[]; prompt: string }
  | { kind: 'shop'; shops: Shop[]; includeOwner: boolean; prompt: string };

/**
 * Returns the valid target candidates for a targeted bank reward (Step 2 picker),
 * or `{ kind: 'none' }` for immediate rewards and delivery rewards (`SHOP_DELIVER` has its own picker).
 */
export function getBankRewardTargets(state: GameState, reward: BankRewardDef): BankRewardTargetList {
  if (reward.target === 'none' || reward.effect.kind === 'open_delivery') {
    return { kind: 'none' };
  }

  const active = state.players[state.activePlayerIndex]!;
  const rivals = state.players.filter((p) => p.id !== active.id && !p.isBankrupt);
  const rivalShops = Object.values(state.shops).filter(
    (s) => s.ownerId !== null && s.ownerId !== active.id
  );
  const ownShops = Object.values(state.shops).filter((s) => s.ownerId === active.id);
  const eff = reward.effect;

  switch (eff.kind) {
    case 'block_rival_delivery':
    case 'block_rival_new_stores':
    case 'swap_position_with_rival':
      return { kind: 'player', players: rivals, prompt: 'Pick Target Rival:' };
    case 'reverse_direction':
      return eff.scope === 'rival'
        ? { kind: 'player', players: rivals, prompt: 'Pick Rival to Reverse:' }
        : { kind: 'none' };
    case 'pencil_override':
      return eff.target === 'self'
        ? { kind: 'none' }
        : { kind: 'player', players: rivals, prompt: 'Pick Target Rival:' };
    case 'payday_modifier':
      return eff.target === 'self_double'
        ? { kind: 'none' }
        : {
            kind: 'player',
            players: rivals.filter((p) => !p.skipNextPayday),
            prompt: 'Pick Rival to Skip Next Payday:',
          };
    case 'open_shop_rival_cash':
      return {
        kind: 'player',
        players:
          !active.blockNewStoreWindow
            ? rivals.filter((p) => canPlayerOpenWithCash(state, active.id, p.cash))
            : [],
        prompt: "Pick Rival Whose Cash You'll Use:",
      };
    case 'set_rival_cash_fraction':
      return eff.scope === 'one'
        ? {
            kind: 'player',
            players: rivals.filter((p) => p.cash > 0),
            prompt: 'Pick Rival Whose Cash to Reduce:',
          }
        : { kind: 'none' };
    case 'set_rival_cash_to_one':
      return eff.scope === 'one'
        ? {
            kind: 'player',
            players: rivals.filter((p) => p.cash > 1),
            prompt: 'Pick Rival to Reduce to $1:',
          }
        : { kind: 'none' };
    case 'copy_rival_cash':
      return {
        kind: 'player',
        players: rivals.filter((p) => p.cash > 0),
        prompt: 'Pick Rival Whose Cash to Copy:',
      };
    case 'halve_rival_points':
      return {
        kind: 'player',
        players: rivals.filter((p) => p.points > 0),
        prompt: 'Pick Rival Whose Points to Halve:',
      };
    case 'close_rival_store_level':
      return {
        kind: 'shop',
        shops: rivalShops.filter((s) => s.level === eff.level),
        includeOwner: true,
        prompt: `Pick Rival L${eff.level} Store to Close:`,
      };
    case 'capture_rival_store':
      if (eff.mode === 'all_empty') return { kind: 'none' };
      if (eff.mode === 'one_l4') {
        return {
          kind: 'shop',
          shops: rivalShops.filter((s) => s.level === 4),
          includeOwner: true,
          prompt: 'Pick Rival L4 Store to Take Over:',
        };
      }
      return {
        kind: 'shop',
        shops: rivalShops.filter(
          (s) => getShopTotalStock(s) === 0 && canCaptureShop(state, active.id, s)
        ),
        includeOwner: true,
        prompt: 'Pick Empty Rival Store to Take Over:',
      };
    case 'empty_rival_stores':
      return {
        kind: 'shop',
        shops: rivalShops.filter((s) => getShopTotalStock(s) > 0),
        includeOwner: true,
        prompt:
          eff.count > 1
            ? `Pick First Rival Store to Empty (+ up to ${eff.count - 1} random others):`
            : 'Pick Rival Store to Empty:',
      };
    case 'upgrade_own_store_l4':
      return {
        kind: 'shop',
        shops: ownShops.filter((s) => s.level < getSegmentSlotCount(state, s.segmentId)),
        includeOwner: false,
        prompt: 'Pick Your Store to Upgrade to L4:',
      };
    default:
      return { kind: 'none' };
  }
}

export function canRedeemBankReward(
  state: GameState,
  reward: BankRewardDef,
  targetPlayerId?: string,
  targetShopId?: string
): boolean {
  const active = state.players[state.activePlayerIndex]!;
  if (active.points < reward.pointCost) return false;

  const targets = getBankRewardTargets(state, reward);
  if (targets.kind === 'player') {
    return targetPlayerId !== undefined
      ? targets.players.some((p) => p.id === targetPlayerId)
      : targets.players.length > 0;
  }
  if (targets.kind === 'shop') {
    return targetShopId !== undefined
      ? targets.shops.some((s) => s.id === targetShopId)
      : targets.shops.length > 0;
  }

  const ownShops = Object.values(state.shops).filter((s) => s.ownerId === active.id);
  const eff = reward.effect;

  switch (eff.kind) {
    case 'gain_points':
    case 'gain_cash':
    case 'double_own_store_prices':
    case 'claim_victory':
      return true;
    case 'gain_cash_per_store':
      return ownShops.length > 0;
    case 'reverse_direction':
      return Boolean(resolveTargetRival(state, eff.scope === 'rival' ? targetPlayerId : undefined));
    case 'pencil_override':
      return true;
    case 'payday_modifier':
      return !active.doubleNextPayday;
    case 'equip_chirp_shoes':
      return true;
    case 'open_delivery':
      if (active.blockDeliveryWindow) return false;
      if (eff.mode === 'rival_paid') {
        return Boolean(
          resolveTargetRivalShop(state, targetShopId, (s) => getShopTotalStock(s) < STORE_CAPACITY_BY_LEVEL[s.level])
        );
      }
      return ownShops.some((s) => getShopTotalStock(s) < STORE_CAPACITY_BY_LEVEL[s.level]);
    case 'auto_stock_own':
      return eff.mode === 'cheap_fill'
        ? ownShops.some((s) => getShopTotalStock(s) < STORE_CAPACITY_BY_LEVEL[s.level])
        : ownShops.length > 0;
    case 'close_all_empty_rival_stores':
      return Boolean(resolveTargetRivalShop(state, undefined, (s) => getShopTotalStock(s) === 0));
    case 'open_free_random_shop':
      return !active.blockNewStoreWindow && canPlayerOpenWithCash(state, active.id, Infinity);
    case 'capture_rival_store':
      return Boolean(
        resolveTargetRivalShop(
          state,
          undefined,
          (s) => getShopTotalStock(s) === 0 && canCaptureShop(state, active.id, s)
        )
      );
    case 'set_rival_cash_fraction':
      return Boolean(resolveTargetRival(state, undefined, (p) => p.cash > 0));
    case 'set_rival_cash_to_one':
      return Boolean(resolveTargetRival(state, undefined, (p) => p.cash > 1));
    case 'cut_rivals_cash_per_store':
      return Boolean(resolveTargetRivalShop(state));
    case 'shuffle_all_cash':
      return Boolean(resolveTargetRival(state));
    default:
      return false;
  }
}
