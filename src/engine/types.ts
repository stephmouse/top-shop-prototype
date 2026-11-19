import type {
  BankRewardDef,
  BankRewardEffect,
  BankTargetKind,
  DeliverMode,
  ElevatorLockState,
  EventCardDef,
  EventEffect,
  EventScope,
  EventStorePrompt,
  GlobalSaleState,
} from './effectTypes';

export type {
  BankRewardDef,
  BankRewardEffect,
  BankTargetKind,
  DeliverMode,
  ElevatorLockState,
  EventCardDef,
  EventEffect,
  EventScope,
  EventStorePrompt,
  GlobalSaleState,
};

export type TileType = 'shop' | 'bank' | 'elevator' | 'escalator';
export type HorizontalDir = 'left' | 'right';
export type VerticalDir = 'up' | 'down';

export interface EscalatorExit {
  targetTileId: string;
  exitHorizontalDir: HorizontalDir;
}

export interface EscalatorLink {
  targetTileId: string;
  exitHorizontalDir: HorizontalDir;
  /** Optional entry-direction exits for pass-through center escalators (Stages 1, 4, 5). */
  byEntryDir?: Partial<Record<HorizontalDir, EscalatorExit>>;
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
  elevatorShaft?: number;
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
  emptyBaseCost: number;
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
  bankVisits: number;
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
  mapId: string;
  turnNumber: number;
  month: number;       // 0..11 (0 = April .. 11 = March)
  year: number;        // 1-based fiscal year (increments on April wrap)
  totalMonths: number; // 0-based total completed rounds/months (= (year - 1) * 12 + month)
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
  revealedEventSlot: number | null;
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
