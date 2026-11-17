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

export interface EventCardDef {
  id: string;
  name: string;
  description: string;
  pointsAwarded: number;
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
  config: MatchConfig;
  players: Player[];
  tiles: Record<string, Tile>;
  shops: Record<string, Shop>;
  winnerId: string | null;
  log: string[];
}