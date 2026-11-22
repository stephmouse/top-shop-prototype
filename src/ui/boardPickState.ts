import { BANK_REWARDS, STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import type { GameAction } from '../engine/actions';
import { canRedeemBankReward, getBankRewardTargets } from '../engine/bank';
import { getActivePlayer } from '../engine/helpers';
import { getAllowedStoreTypeIds, getShopTotalStock } from '../engine/shops';
import type { BankRewardDef, DeliverMode, GameState, Shop } from '../engine/types';

type DispatchFn = (action: GameAction) => void;
type SlotKind = 'bank' | 'deliver' | 'event' | 'liquidate';

export interface BoardShopPickSpec {
  selectableShopIds: Set<string>;
  selectedShopId: string | null;
  badgeText: string;
  selectedBadgeText: string;
  onSelectShop: (shopId: string) => void;
}

interface ContextSlot {
  key: string;
  primaryId: string | null;
  confirmId: string | null;
}

const slots: Record<SlotKind, ContextSlot> = {
  bank: { key: '', primaryId: null, confirmId: null },
  deliver: { key: '', primaryId: null, confirmId: null },
  event: { key: '', primaryId: null, confirmId: null },
  liquidate: { key: '', primaryId: null, confirmId: null },
};

function getContextKey(state: GameState, kind: SlotKind): string {
  const active = getActivePlayer(state);
  const head = `${state.phase}|${state.turnNumber}|${state.activePlayerIndex}`;
  if (kind === 'bank') return `${head}|${active.points}`;
  if (kind === 'deliver') {
    return `${head}|${state.deliverMode ?? 'land'}|${state.deliveredShopIdsThisTurn.join(',')}|${active.tileId}`;
  }
  if (kind === 'event') {
    const p = state.eventStorePrompt;
    return `${head}|${p?.mode ?? ''}|${p?.payerId ?? ''}|${p?.fromBank ? 1 : 0}|${active.tileId}`;
  }
  return `${head}|${active.cash}`;
}

function syncSlot(state: GameState, kind: SlotKind): ContextSlot {
  const slot = slots[kind];
  const key = getContextKey(state, kind);
  if (key !== slot.key) {
    slot.key = key;
    slot.primaryId = null;
    slot.confirmId = null;
  }
  return slot;
}

export const getBankPendingRewardId = (state: GameState): string | null => syncSlot(state, 'bank').primaryId;
export function setBankPendingRewardId(state: GameState, id: string | null): void {
  const slot = syncSlot(state, 'bank');
  slot.primaryId = id;
  slot.confirmId = null;
}
export const getBankConfirmShopId = (state: GameState): string | null => syncSlot(state, 'bank').confirmId;
export const setBankConfirmShopId = (state: GameState, shopId: string | null): void => { syncSlot(state, 'bank').confirmId = shopId; };
export const getDeliverSelectedShopId = (state: GameState): string | null => syncSlot(state, 'deliver').primaryId;
export const setDeliverSelectedShopId = (state: GameState, shopId: string | null): void => { syncSlot(state, 'deliver').primaryId = shopId; };
export const getEventSelectedShopId = (state: GameState): string | null => syncSlot(state, 'event').primaryId;
export const setEventSelectedShopId = (state: GameState, shopId: string | null): void => { syncSlot(state, 'event').primaryId = shopId; };
export const getLiquidateConfirmShopId = (state: GameState): string | null => syncSlot(state, 'liquidate').confirmId;
export const setLiquidateConfirmShopId = (state: GameState, shopId: string | null): void => { syncSlot(state, 'liquidate').confirmId = shopId; };

export function getDeliverShopSelectionInfo(state: GameState): {
  mode: DeliverMode;
  isFree: boolean;
  candidateShops: Shop[];
  isSelectable: (s: Shop) => boolean;
} {
  const active = getActivePlayer(state);
  const mode = state.deliverMode ?? 'own_paid';
  const candidateShops = Object.values(state.shops).filter((s) =>
    mode === 'rival_paid' ? s.ownerId !== null && s.ownerId !== active.id : s.ownerId === active.id
  );
  const isSelectable = (s: Shop) =>
    !(mode === 'all_own_paid' && state.deliveredShopIdsThisTurn.includes(s.id)) &&
    getShopTotalStock(s) < STORE_CAPACITY_BY_LEVEL[s.level];
  return { mode, isFree: mode === 'own_free', candidateShops, isSelectable };
}

export function getEligibleEventEmptySlots(state: GameState): Shop[] {
  const prompt = state.eventStorePrompt;
  if (!prompt || prompt.mode !== 'buy_empty') return [];
  const active = getActivePlayer(state);
  const payer = prompt.payerId ? state.players.find((p) => p.id === prompt.payerId) ?? active : active;
  return Object.values(state.shops).filter(
    (s) =>
      s.ownerId === null &&
      (prompt.allowOwnedSegment ||
        !Object.values(state.shops).some((o) => o.ownerId === active.id && o.segmentId === s.segmentId)) &&
      getAllowedStoreTypeIds(state, active.id, s.segmentId).some((id) => (STORE_TYPES[id]?.baseOpenCost ?? Infinity) <= payer.cash)
  );
}

function handleTwoClickConfirm(
  state: GameState,
  kind: SlotKind,
  shopId: string,
  field: 'primaryId' | 'confirmId',
  onUiChange: (() => void) | undefined,
  onCommit: () => void
): void {
  const slot = syncSlot(state, kind);
  if (slot[field] !== shopId) {
    slot[field] = shopId;
    onUiChange?.();
    return;
  }
  slot.primaryId = null;
  slot.confirmId = null;
  onCommit();
}

export const handleBankShopPickClick = (
  state: GameState, rewardId: string, shopId: string, dispatch: DispatchFn, onUiChange?: () => void
): void => handleTwoClickConfirm(state, 'bank', shopId, 'confirmId', onUiChange, () => dispatch({ type: 'REDEEM_BANK_REWARD', rewardId, targetShopId: shopId }));

export const handleEventSellPickClick = (
  state: GameState, shopId: string, dispatch: DispatchFn, onUiChange?: () => void
): void => handleTwoClickConfirm(state, 'event', shopId, 'primaryId', onUiChange, () => dispatch({ type: 'RESOLVE_EVENT_STORE', shopId }));

export const handleLiquidatePickClick = (
  state: GameState, shopId: string, dispatch: DispatchFn, onUiChange?: () => void
): void => handleTwoClickConfirm(state, 'liquidate', shopId, 'confirmId', onUiChange, () => dispatch({ type: 'SELL_SHOP_LIQUIDATE', shopId }));

function getBankShopBadge(reward: BankRewardDef): string {
  switch (reward.effect.kind) {
    case 'close_rival_store_level': return 'CLOSE';
    case 'capture_rival_store': return 'TAKE';
    case 'empty_rival_stores': return 'EMPTY';
    case 'upgrade_own_store_l4': return 'L4 UP';
    default: return 'PICK';
  }
}

export function buildBoardShopPick(
  state: GameState,
  dispatch: DispatchFn,
  onUiChange: () => void
): BoardShopPickSpec | null {
  const active = getActivePlayer(state);

  if (state.phase === 'SHOP_DELIVER' && active.blockDeliveryTurns === 0) {
    const { candidateShops, isSelectable } = getDeliverShopSelectionInfo(state);
    const selectableIds = new Set(candidateShops.filter(isSelectable).map((s) => s.id));
    if (selectableIds.size === 0) return null;
    const curId = getDeliverSelectedShopId(state);
    return {
      selectableShopIds: selectableIds,
      selectedShopId: curId && selectableIds.has(curId) ? curId : null,
      badgeText: 'RESTOCK',
      selectedBadgeText: 'STOCKING',
      onSelectShop: (shopId) => { setDeliverSelectedShopId(state, shopId); onUiChange(); },
    };
  }

  if (state.phase === 'BANK_MENU') {
    const rewardId = getBankPendingRewardId(state);
    const reward = rewardId ? BANK_REWARDS.find((r) => r.id === rewardId) : undefined;
    if (!reward || !canRedeemBankReward(state, reward)) return null;
    const targets = getBankRewardTargets(state, reward);
    if (targets.kind !== 'shop' || targets.shops.length === 0) return null;
    const selectableIds = new Set(targets.shops.map((s) => s.id));
    const curConfirm = getBankConfirmShopId(state);
    return {
      selectableShopIds: selectableIds,
      selectedShopId: curConfirm && selectableIds.has(curConfirm) ? curConfirm : null,
      badgeText: getBankShopBadge(reward),
      selectedBadgeText: 'CONFIRM?',
      onSelectShop: (shopId) => handleBankShopPickClick(state, reward.id, shopId, dispatch, onUiChange),
    };
  }

  if (state.phase === 'EVENT_PICK_STORE' && state.eventStorePrompt) {
    if (state.eventStorePrompt.mode === 'sell') {
      const selectableIds = new Set(Object.values(state.shops).filter((s) => s.ownerId === active.id).map((s) => s.id));
      if (selectableIds.size === 0) return null;
      const curConfirm = getEventSelectedShopId(state);
      return {
        selectableShopIds: selectableIds,
        selectedShopId: curConfirm && selectableIds.has(curConfirm) ? curConfirm : null,
        badgeText: 'SELL',
        selectedBadgeText: 'CONFIRM?',
        onSelectShop: (shopId) => handleEventSellPickClick(state, shopId, dispatch, onUiChange),
      };
    }
    const emptySlots = getEligibleEventEmptySlots(state);
    if (emptySlots.length === 0) return null;
    const selectableIds = new Set(emptySlots.map((s) => s.id));
    const curId = getEventSelectedShopId(state);
    return {
      selectableShopIds: selectableIds,
      selectedShopId: curId && selectableIds.has(curId) ? curId : null,
      badgeText: 'OPEN',
      selectedBadgeText: 'OPENING',
      onSelectShop: (shopId) => { setEventSelectedShopId(state, shopId); onUiChange(); },
    };
  }

  if (state.phase === 'LIQUIDATE_ASSETS') {
    const selectableIds = new Set(Object.values(state.shops).filter((s) => s.ownerId === active.id).map((s) => s.id));
    if (selectableIds.size === 0) return null;
    const curConfirm = getLiquidateConfirmShopId(state);
    return {
      selectableShopIds: selectableIds,
      selectedShopId: curConfirm && selectableIds.has(curConfirm) ? curConfirm : null,
      badgeText: 'SELL',
      selectedBadgeText: 'CONFIRM?',
      onSelectShop: (shopId) => handleLiquidatePickClick(state, shopId, dispatch, onUiChange),
    };
  }

  return null;
}
