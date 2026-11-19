export type DeliverMode = 'own_paid' | 'rival_paid' | 'all_own_paid' | 'own_free';
export type EventScope = 'self' | 'all' | 'others';

export type EventEffect =
  | { kind: 'nothing' }
  | { kind: 'cash_gift_scaled'; baseMultiplier: number }
  | { kind: 'pay_each_rival_scaled'; baseMultiplier: number }
  | { kind: 'collect_each_rival_scaled'; baseMultiplier: number }
  | { kind: 'drop_cash_scaled'; baseMultiplier: number }
  | { kind: 'drop_cash_fraction'; numerator: number; denominator: number }
  | { kind: 'equalize_cash' }
  | { kind: 'sell_store_prompt'; multiplier: number; forced: boolean }
  | { kind: 'sell_empty_stores'; scope: EventScope; multiplier: number }
  | { kind: 'buy_empty_store' }
  | { kind: 'close_stores'; scope: EventScope; rounds: number }
  | { kind: 'restock_grade'; mode: 'second_cheapest_two' | 'dearest_one' }
  | { kind: 'downgrade_stock' }
  | { kind: 'unlock_dir_next' }
  | { kind: 'reverse_dir_next' }
  | { kind: 'roll_again' }
  | { kind: 'draw_another' }
  | { kind: 'go_steps'; steps: number }
  | { kind: 'chirp_sandals' }
  | { kind: 'elevator_lock'; mode: 'none' | 'only_self' | 'ban_self'; rounds: number }
  | { kind: 'global_sale'; priceMultiplier: number; rounds: number };

export interface EventCardDef {
  id: string;
  name: string;
  description: string;
  awardsPoints: boolean;
  effect: EventEffect;
}

export interface GlobalSaleState {
  label: string;
  priceMultiplier: number;
  turnsLeft: number;
}

export interface ElevatorLockState {
  turnsLeft: number;
  onlyPlayerId: string | null;
  blockedPlayerId: string | null;
}

export interface EventStorePrompt {
  mode: 'sell' | 'buy_empty';
  multiplier: number;
  forced: boolean;
  payerId?: string;
  allowOwnedSegment?: boolean;
  fromBank?: boolean;
}

export type BankTargetKind =
  | 'none'
  | 'rival_player'
  | 'own_shop_any'
  | 'own_shop_upgrade'
  | 'rival_shop_any'
  | 'rival_shop_stocked'
  | 'rival_shop_empty'
  | 'rival_shop_l1'
  | 'rival_shop_l2'
  | 'rival_shop_l3'
  | 'rival_shop_l4';

export type BankRewardEffect =
  | { kind: 'gain_points'; amount: number }
  | { kind: 'gain_cash'; amount: number }
  | { kind: 'gain_cash_per_store'; amountPerStore: number }
  | { kind: 'block_rival_delivery'; turns: number }
  | { kind: 'block_rival_new_stores'; turns: number }
  | { kind: 'open_delivery'; mode: DeliverMode }
  | { kind: 'auto_stock_own'; mode: 'cheap_fill' | 'costly_one' | 'costly_fill' }
  | { kind: 'reverse_direction'; scope: 'rival' | 'all' }
  | { kind: 'close_rival_store_level'; level: 1 | 2 | 3 | 4 }
  | { kind: 'close_all_empty_rival_stores' }
  | { kind: 'open_free_random_shop' }
  | { kind: 'open_shop_rival_cash' }
  | { kind: 'pencil_override'; target: 'rival' | 'self'; mode: 'ones_twos' | 'event_only' | 'slow'; turns: number }
  | { kind: 'capture_rival_store'; mode: 'one_empty' | 'all_empty' | 'one_l4' }
  | { kind: 'empty_rival_stores'; count: 1 | 4 }
  | { kind: 'set_rival_cash_fraction'; scope: 'one' | 'all'; numerator: number; denominator: number; giveToSelf: boolean }
  | { kind: 'set_rival_cash_to_one'; scope: 'one' | 'all' }
  | { kind: 'cut_rivals_cash_per_store'; amountPerStore: number }
  | { kind: 'copy_rival_cash' }
  | { kind: 'shuffle_all_cash' }
  | { kind: 'halve_rival_points' }
  | { kind: 'swap_position_with_rival' }
  | { kind: 'payday_modifier'; target: 'self_double' | 'rival_stop' }
  | { kind: 'equip_chirp_shoes' }
  | { kind: 'double_own_store_prices'; turns: number }
  | { kind: 'upgrade_own_store_l4' }
  | { kind: 'claim_victory' };

export interface BankRewardDef {
  id: string;
  label: string;
  note?: string;
  pointCost: number;
  target: BankTargetKind;
  effect: BankRewardEffect;
}
