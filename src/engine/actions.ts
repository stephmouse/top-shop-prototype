import { stripAvatarCustomImage } from '../config/avatarTypes';
import { PENCIL_FACES } from '../config/balance';
import type { GameState, HorizontalDir, PencilFace, VerticalDir } from './types';

export type DirectionChoice = HorizontalDir | VerticalDir;

export type GameAction =
  | { type: 'ROLL_PENCIL'; chosenFace?: PencilFace }
  | { type: 'CHOOSE_DIRECTION'; direction: DirectionChoice }
  | { type: 'ADVANCE_STEP' }
  | { type: 'UNDO_STEP' }
  | { type: 'CANCEL_MOVE' }
  | { type: 'RESOLVE_ELEVATOR'; ride: boolean }
  | { type: 'REVEAL_EVENT_CARD'; slotIndex: number }
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
  | { type: 'FINISH_RIVAL_SHOP' }
  | { type: 'SELL_SHOP_LIQUIDATE'; shopId: string };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

function isDirection(value: unknown): value is DirectionChoice {
  return value === 'left' || value === 'right' || value === 'up' || value === 'down';
}

function isValidOrderRecord(value: unknown): value is Record<string, number> {
  if (!isPlainRecord(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > 64) return false;
  return entries.every(
    ([itemId, qty]) =>
      isNonEmptyString(itemId) &&
      itemId !== '__proto__' &&
      itemId !== 'constructor' &&
      itemId !== 'prototype' &&
      typeof qty === 'number' &&
      Number.isInteger(qty) &&
      qty >= 0 &&
      qty <= 99
  );
}

export function isValidGameAction(raw: unknown): raw is GameAction {
  if (!isPlainRecord(raw) || typeof raw.type !== 'string') return false;

  switch (raw.type) {
    case 'ROLL_PENCIL':
      return raw.chosenFace === undefined || PENCIL_FACES.includes(raw.chosenFace as PencilFace);
    case 'CHOOSE_DIRECTION':
      return isDirection(raw.direction);
    case 'ADVANCE_STEP':
    case 'UNDO_STEP':
    case 'CANCEL_MOVE':
    case 'SKIP_EVENT_STORE':
    case 'CLOSE_BANK_MENU':
    case 'SKIP_SHOP_SLOT':
    case 'SKIP_DELIVER':
    case 'FINISH_RIVAL_SHOP':
      return true;
    case 'RESOLVE_ELEVATOR':
      return typeof raw.ride === 'boolean';
    case 'REVEAL_EVENT_CARD':
      return (
        typeof raw.slotIndex === 'number' &&
        Number.isInteger(raw.slotIndex) &&
        raw.slotIndex >= 0 &&
        raw.slotIndex <= 2
      );
    case 'PICK_EVENT_CARD':
      return isNonEmptyString(raw.cardId);
    case 'RESOLVE_EVENT_STORE':
      return isNonEmptyString(raw.shopId) && isOptionalString(raw.storeTypeId);
    case 'REDEEM_BANK_REWARD':
      return (
        isNonEmptyString(raw.rewardId) &&
        isOptionalString(raw.targetPlayerId) &&
        isOptionalString(raw.targetShopId)
      );
    case 'OPEN_SHOP':
    case 'BUYOUT_SHOP':
      return isNonEmptyString(raw.storeTypeId);
    case 'DELIVER_ITEMS':
      return isNonEmptyString(raw.shopId) && isValidOrderRecord(raw.order);
    case 'BUY_RIVAL_ITEMS':
      return (
        Array.isArray(raw.itemIds) &&
        raw.itemIds.length === 1 &&
        raw.itemIds.every(isNonEmptyString)
      );
    case 'SELL_SHOP_LIQUIDATE':
      return isNonEmptyString(raw.shopId);
    default:
      return false;
  }
}

export function redactStateForClient(state: GameState): GameState {
  const hasCustomImg = state.players.some((p) => p.avatar?.customImage !== undefined);
  const players = hasCustomImg
    ? state.players.map((p) => (p.avatar ? { ...p, avatar: stripAvatarCustomImage(p.avatar) } : p))
    : state.players;
  if (state.phase === 'EVENT_PICK' && (state.revealedEventSlot ?? null) === null) {
    return {
      ...state,
      seed: 0,
      players,
      eventChoices: state.eventChoices.map((_, idx) => `hidden_${idx}`),
    };
  }
  return { ...state, seed: 0, players };
}
