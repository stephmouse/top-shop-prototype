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
  stock: Record<string, number>; // itemId -> quantity
  isClosedTurns: number;
}

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
}

export interface BankRewardDef {
  id: string;
  label: string;
  pointCost: number;
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
  eventChoices: string[];
  eventStorePrompt: EventStorePrompt | null;
  globalSale: GlobalSaleState | null;
  elevatorLock: ElevatorLockState | null;
  config: MatchConfig;
  players: Player[];
  tiles: Record<string, Tile>;
  shops: Record<string, Shop>;
  winnerId: string | null;
  log: string[];
}