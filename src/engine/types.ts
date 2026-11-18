export type TileType = 'shop' | 'bank' | 'elevator' | 'escalator';
export type HorizontalDir = 'left' | 'right';
export type VerticalDir = 'up' | 'down';

export interface EscalatorLink {
  targetTileId: string;
  exitHorizontalDir: HorizontalDir;
  /** Applied when hitting top/bottom floor edge to reverse loop direction */
  nextVerticalDir?: VerticalDir;
}

export interface TileNeighbors {
  left?: string;
  right?: string;
  up?: EscalatorLink;
  down?: EscalatorLink;
}

export interface Tile {
  id: string;
  floor: number; // 1 = bottom, 2 = middle, 3 = top
  col: number;   // 0-indexed grid column
  type: TileType;
  segmentId?: string;
  shopSlotId?: string;
  neighbors: TileNeighbors;
}

export interface ItemDef {
  id: string;
  name: string;
  wholesaleCost: number;
  retailPrice: number;
  tier: 1 | 2 | 3 | 4;
  cashbackChance: number;
}

export interface StoreTypeDef {
  id: string;
  name: string;
  baseOpenCost: number;
  segmentPool: string;
  items: ItemDef[];
}

export interface Shop {
  id: string;
  tileId: string;
  segmentId: string;
  ownerId: string | null;
  storeTypeId: string | null;
  level: 1 | 2 | 3 | 4;
  upgradedToL4?: boolean;
  stock: Record<string, number>; // itemId -> quantity
  isClosedTurns: number;
}

export type PencilOverrideMode = 'normal' | 'ones_twos' | 'event_only' | 'slow';
export type DeliverMode = 'own_paid' | 'rival_paid' | 'all_own_paid' | 'own_free';

export interface Player {
  id: string;
  name: string;
  color: string;
  cash: number;
  points: number;
  tileId: string;
  horizontalDir: HorizontalDir | null;
  verticalDir: VerticalDir | null;
  stepsSincePayday: number;
  blockDeliveryTurns: number;
  blockNewStoreTurns: number;
  pencilMode: PencilOverrideMode;
  pencilTurnsLeft: number;
  doubleNextPayday: boolean;
  skipNextPayday: boolean;
  doublePriceTurns: number;
  skipNextTurn: boolean;
  unlockDirNextTurn: boolean;
  reverseDirNextTurn: boolean;
  chirpSandals: boolean;
  isBankrupt: boolean;
  isBot: boolean;
}

export type TurnPhase =
  | 'ROLL_PENCIL'
  | 'CHOOSE_DIRECTION'
  | 'STEPPING'
  | 'ESCALATOR_RIDE'
  | 'ESCALATOR_UNDO'
  | 'EVENT_PICK'
  | 'EVENT_PICK_STORE'
  | 'BANK_MENU'
  | 'SHOP_BUY_RIVAL'
  | 'SHOP_BUY_SLOT'
  | 'SHOP_DELIVER'
  | 'ELEVATOR_PROMPT'
  | 'LIQUIDATE_ASSETS'
  | 'GAME_OVER';

export interface MatchConfig {
  targetAssets: number;
  startingCash: number;
  bankruptLimit: number;
  finishRoundOnWin: boolean;
}

export type EventScope = 'self' | 'all' | 'others';

export type EventEffect =
  | { kind: 'nothing' }
  | { kind: 'cash_gift'; amount: number }
  | { kind: 'pay_each_rival'; amount: number }
  | { kind: 'collect_each_rival'; amount: number }
  | { kind: 'drop_cash_fraction'; numerator: number; denominator: number }
  | { kind: 'equalize_cash' }
  | { kind: 'sell_store_prompt'; multiplier: number; forced: boolean }
  | { kind: 'sell_empty_stores'; scope: EventScope; multiplier: number }
  | { kind: 'buy_empty_store' }
  | { kind: 'lose_store' }
  | { kind: 'close_stores'; scope: EventScope; rounds: number }
  | { kind: 'close_empty_stores'; rounds: number }
  | { kind: 'restock_grade'; mode: 'second_cheapest_two' | 'dearest_one' }
  | { kind: 'downgrade_stock' }
  | { kind: 'lose_some_stock' }
  | { kind: 'unlock_dir_next' }
  | { kind: 'reverse_dir_next' }
  | { kind: 'roll_again' }
  | { kind: 'draw_another' }
  | { kind: 'go_steps_1_7' }
  | { kind: 'miss_turn' }
  | { kind: 'chirp_sandals' }
  | { kind: 'elevator_lock'; mode: 'none' | 'only_self' | 'ban_self'; rounds: number }
  | { kind: 'global_sale'; priceMultiplier: number; rounds: number };

export interface EventCardDef {
  id: string;
  name: string;
  description: string;
  pointsAwarded: number;
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
  mode: 'sell' | 'lose' | 'buy_empty';
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

export type PencilFace = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 'E';

export interface MoveSnapshot {
  tileId: string;
  horizontalDir: HorizontalDir | null;
  verticalDir: VerticalDir | null;
  stepsSincePayday: number;
  remainingSteps: number;
  hadBranchChoice: boolean;
  phase: 'CHOOSE_DIRECTION' | 'STEPPING';
  viaEscalatorTileId?: string;
}

export interface GameState {
  seed: number;
  turnNumber: number;
  roundStartPlayerIndex: number;
  activePlayerIndex: number;
  phase: TurnPhase;
  lastRoll: PencilFace | null;
  remainingSteps: number;
  hadBranchChoiceThisTurn: boolean;
  moveHistory: MoveSnapshot[];
  pendingUndoSnapshot: MoveSnapshot | null;
  pendingPostBankPhase: TurnPhase | null;
  pendingBankRefundPts: number;
  deliverMode: DeliverMode | null;
  deliverPreferredShopId: string | null;
  deliveredShopIdsThisTurn: string[];
  eventChoices: string[];
  eventStorePrompt: EventStorePrompt | null;
  globalSale: GlobalSaleState | null;
  elevatorLock: ElevatorLockState | null;
  config: MatchConfig;
  players: Player[];
  tiles: Record<string, Tile>;
  shops: Record<string, Shop>;
  segmentPools: Record<string, string[]>;
  winnerId: string | null;
  log: string[];
}