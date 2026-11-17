import type { HorizontalDir, VerticalDir } from './types';

export type DirectionChoice = HorizontalDir | VerticalDir;

export type GameAction =
  | { type: 'ROLL_PENCIL' }
  | { type: 'CHOOSE_DIRECTION'; direction: DirectionChoice }
  | { type: 'ADVANCE_STEP' }
  | { type: 'UNDO_STEP' }
  | { type: 'CANCEL_MOVE' }
  | { type: 'RESOLVE_ELEVATOR'; ride: boolean }
  | { type: 'PICK_EVENT_CARD'; cardId: string }
  | { type: 'RESOLVE_EVENT_STORE'; shopId: string; storeTypeId?: string }
  | { type: 'SKIP_EVENT_STORE' }
  | { type: 'REDEEM_BANK_REWARD'; rewardId: string; targetPlayerId?: string; targetShopId?: string }
  | { type: 'CLOSE_BANK_MENU' }
  | { type: 'OPEN_SHOP'; storeTypeId: string }
  | { type: 'BUYOUT_SHOP'; storeTypeId: string }
  | { type: 'SKIP_SHOP_SLOT' }
  | { type: 'DELIVER_ITEMS'; shopId: string; order: Record<string, number> }
  | { type: 'SKIP_DELIVER' }
  | { type: 'BUY_RIVAL_ITEMS'; itemIds: string[] }
  | { type: 'SELL_SHOP_LIQUIDATE'; shopId: string }
  | { type: 'END_TURN' };