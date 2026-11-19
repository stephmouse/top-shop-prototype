import { STORE_CAPACITY_BY_LEVEL } from '../config/balance';
import {
  canCaptureShop,
  canPlayerOpenWithCash,
  resolveTargetOwnShop,
  resolveTargetRival,
  resolveTargetRivalShop,
} from './bankHelpers';
import { getShopTotalStock } from './shops';
import type { BankRewardDef, GameState } from './types';

export function canRedeemBankReward(
  state: GameState,
  reward: BankRewardDef,
  targetPlayerId?: string,
  targetShopId?: string
): boolean {
  const active = state.players[state.activePlayerIndex]!;
  if (active.points < reward.pointCost) return false;

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
    case 'block_rival_delivery':
    case 'block_rival_new_stores':
    case 'swap_position_with_rival':
      return Boolean(resolveTargetRival(state, targetPlayerId));
    case 'reverse_direction':
      return Boolean(resolveTargetRival(state, targetPlayerId));
    case 'pencil_override':
      return eff.target === 'self' || Boolean(resolveTargetRival(state, targetPlayerId));
    case 'payday_modifier':
      return eff.target === 'self_double'
        ? !active.doubleNextPayday
        : Boolean(resolveTargetRival(state, targetPlayerId, (p) => !p.skipNextPayday));
    case 'equip_chirp_shoes':
      return !active.chirpSandals;
    case 'open_delivery':
      if (active.blockDeliveryTurns > 0) return false;
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
    case 'close_rival_store_level':
      return Boolean(resolveTargetRivalShop(state, targetShopId, (s) => s.level === eff.level));
    case 'close_all_empty_rival_stores':
      return Boolean(resolveTargetRivalShop(state, undefined, (s) => getShopTotalStock(s) === 0));
    case 'open_free_random_shop':
      return active.blockNewStoreTurns === 0 && canPlayerOpenWithCash(state, active.id, Infinity);
    case 'open_shop_rival_cash':
      return (
        active.blockNewStoreTurns === 0 &&
        Boolean(resolveTargetRival(state, targetPlayerId, (p) => canPlayerOpenWithCash(state, active.id, p.cash)))
      );
    case 'capture_rival_store':
      if (eff.mode === 'one_l4') {
        return Boolean(
          resolveTargetRivalShop(state, targetShopId, (s) => s.level === 4 && canCaptureShop(state, active.id, s))
        );
      }
      return Boolean(
        resolveTargetRivalShop(
          state,
          eff.mode === 'one_empty' ? targetShopId : undefined,
          (s) => getShopTotalStock(s) === 0 && canCaptureShop(state, active.id, s)
        )
      );
    case 'empty_rival_stores':
      return Boolean(resolveTargetRivalShop(state, targetShopId, (s) => getShopTotalStock(s) > 0));
    case 'set_rival_cash_fraction':
      return eff.scope === 'one'
        ? Boolean(resolveTargetRival(state, targetPlayerId, (p) => p.cash > 0))
        : Boolean(resolveTargetRival(state, undefined, (p) => p.cash > 0));
    case 'set_rival_cash_to_one':
      return eff.scope === 'one'
        ? Boolean(resolveTargetRival(state, targetPlayerId, (p) => p.cash > 1))
        : Boolean(resolveTargetRival(state, undefined, (p) => p.cash > 1));
    case 'cut_rivals_cash_per_store':
      return Boolean(resolveTargetRivalShop(state));
    case 'copy_rival_cash':
      return Boolean(resolveTargetRival(state, targetPlayerId, (p) => p.cash > 0));
    case 'shuffle_all_cash':
      return Boolean(resolveTargetRival(state));
    case 'halve_rival_points':
      return Boolean(resolveTargetRival(state, targetPlayerId, (p) => p.points > 0));
    case 'upgrade_own_store_l4':
      return Boolean(resolveTargetOwnShop(state, targetShopId, (s) => s.level < 4));
  }
}
