import { STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import { getShopDisplayName, getShopItemDisplayName } from '../config/signatureStore';
import type { SignatureStoreSpec } from '../config/signatureStore';
import type { GameAction } from '../engine/actions';
import { formatTileCoord, getActivePlayer, getTile } from '../engine/helpers';
import { getShopTotalStock } from '../engine/shops';
import { formatTimedWindowEndpoint } from '../engine/timedEffects';
import type { DeliverMode, GameState, Shop } from '../engine/types';
import {
  getDeliverSelectedShopId,
  getDeliverShopSelectionInfo,
  setDeliverSelectedShopId,
} from './boardPickState';
import { createChoiceButton, makeChoiceHeaderRow } from './choiceUi';
import { setMoneyText } from './moneyText';
import { getDisplayPlayerColor } from './themeConfig';

export type DispatchFn = (action: GameAction) => void;

export function makePanelButton(
  label: string,
  onClick: () => void,
  options: { primary?: boolean; disabled?: boolean } = {}
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  if (options.primary) btn.className = 'primary';
  if (options.disabled) btn.disabled = true;
  btn.addEventListener('click', onClick);
  return btn;
}

export function formatShopLocation(state: GameState, shop: Shop): string {
  const t = state.tiles[shop.tileId];
  return t ? formatTileCoord(t) : shop.id;
}

function getModePrompt(deliverMode: DeliverMode | null, deliveredCount: number): string {
  if (deliverMode === 'own_free') return 'Bank Free Delivery ($0 wholesale cost) — Pick a store (below or on the map):';
  if (deliverMode === 'rival_paid') return 'Bank Rival Store Delivery — Pick a rival store (below or on the map):';
  if (deliverMode === 'all_own_paid') return `Bank Deliver to All Own Stores (${deliveredCount} done) — Pick a store (below or on the map):`;
  return deliverMode === 'own_paid'
    ? 'Bank Delivery — Pick a store to restock (below or on the map):'
    : 'Pick a store to restock (below or on the map):';
}

function getCancelLabel(state: GameState, mode: DeliverMode): string {
  if (mode === 'all_own_paid' && state.deliveredShopIdsThisTurn.length > 0) return 'Finish Deliveries';
  return state.deliverMode !== null ? 'Cancel & Return to Bank' : 'Do Not Deliver';
}

function formatShopLabel(
  state: GameState,
  shop: Shop,
  includeOwner: boolean,
  landedShopId?: string,
  syncedSignatures?: Readonly<Record<string, SignatureStoreSpec>>
): string {
  const storeName = getShopDisplayName(shop, state.players, syncedSignatures);
  const owner = shop.ownerId ? state.players.find((p) => p.id === shop.ownerId) : undefined;
  const ownerTag = includeOwner ? ` (${owner?.name ?? '?'})` : '';
  const hereTag = state.deliverMode === null && shop.id === landedShopId ? ' (Here)' : '';
  return `${formatShopLocation(state, shop)} ${storeName} L${shop.level} [${getShopTotalStock(shop)}/${STORE_CAPACITY_BY_LEVEL[shop.level]}]${ownerTag}${hereTag}`;
}

function appendStorePickerStep(
  root: HTMLElement,
  state: GameState,
  candidateShops: Shop[],
  mode: DeliverMode,
  isSelectable: (s: Shop) => boolean,
  dispatch: DispatchFn,
  onPickShop: (shopId: string) => void,
  onHoverShop?: (shopId: string | null) => void,
  syncedSignatures?: Readonly<Record<string, SignatureStoreSpec>>
): void {
  const landedShopId = getTile(state, getActivePlayer(state).tileId).shopSlotId;
  const cancelBtn = createChoiceButton(
    getCancelLabel(state, mode),
    () => {
      onHoverShop?.(null);
      setDeliverSelectedShopId(state, null);
      dispatch({ type: 'SKIP_DELIVER' });
    },
    {
      primary: !candidateShops.some(isSelectable),
      back: state.deliverMode !== null,
      skip: true,
    }
  );
  const { headerRow, promptEl } = makeChoiceHeaderRow(
    [cancelBtn],
    getModePrompt(state.deliverMode, state.deliveredShopIdsThisTurn.length)
  );
  root.appendChild(headerRow);
  if (promptEl) root.appendChild(promptEl);

  const storesWrap = document.createElement('div');
  storesWrap.className = 'card-list';
  storesWrap.style.maxHeight = '260px';
  storesWrap.style.overflowY = 'auto';

  let hotkey = 1;
  candidateShops.forEach((s) => {
    const delivered = mode === 'all_own_paid' && state.deliveredShopIdsThisTurn.includes(s.id);
    const full = getShopTotalStock(s) >= STORE_CAPACITY_BY_LEVEL[s.level];
    const selectable = isSelectable(s);
    const suffix = delivered ? ' — Delivered' : full ? ' — Full' : ' → Restock';
    const label = `${formatShopLabel(state, s, mode === 'rival_paid', landedShopId, syncedSignatures)}${suffix}`;
    const ownerIndex = s.ownerId ? state.players.findIndex((p) => p.id === s.ownerId) : -1;
    const owner = ownerIndex >= 0 ? state.players[ownerIndex] : undefined;
    const assignedKey = selectable && hotkey <= 9 ? hotkey++ : undefined;
    const btn = createChoiceButton(
      label,
      () => {
        onHoverShop?.(null);
        onPickShop(s.id);
      },
      {
        hotkey: assignedKey,
        shopId: s.id,
        onHoverShop: selectable ? onHoverShop : undefined,
        nav: true,
        disabled: delivered || full,
        accentColor: owner ? getDisplayPlayerColor(ownerIndex, owner.color) : undefined,
      }
    );
    storesWrap.appendChild(btn);
  });
  root.appendChild(storesWrap);
}

function appendRestockStep(
  root: HTMLElement,
  state: GameState,
  shop: Shop,
  mode: DeliverMode,
  isFree: boolean,
  dispatch: DispatchFn,
  onBack: () => void,
  onHoverShop?: (shopId: string | null) => void,
  syncedSignatures?: Readonly<Record<string, SignatureStoreSpec>>
): void {
  const active = getActivePlayer(state);
  const def = shop.storeTypeId ? STORE_TYPES[shop.storeTypeId] : undefined;
  if (!def) return;

  const landedShopId = getTile(state, active.tileId).shopSlotId;
  const backBtn = createChoiceButton(
    '← Back to Stores',
    () => {
      onHoverShop?.(null);
      onBack();
    },
    { back: true }
  );
  const { headerRow, promptEl } = makeChoiceHeaderRow(
    [backBtn],
    `${formatShopLabel(state, shop, mode === 'rival_paid', landedShopId, syncedSignatures)}${isFree ? ' (FREE)' : ''}`
  );
  root.appendChild(headerRow);
  if (promptEl) root.appendChild(promptEl);

  const itemsWrap = document.createElement('div');
  itemsWrap.className = 'card-list';
  const summaryEl = document.createElement('div');
  const order: Record<string, number> = {};
  const addedStack: string[] = [];
  const maxCap = STORE_CAPACITY_BY_LEVEL[shop.level];
  const currentTotal = getShopTotalStock(shop);

  const submitBtn = createChoiceButton(
    'Confirm Delivery (Enter)',
    () => {
      onHoverShop?.(null);
      setDeliverSelectedShopId(state, null);
      dispatch({ type: 'DELIVER_ITEMS', shopId: shop.id, order });
    },
    { primary: true, confirm: true }
  );
  const undoBtn = makePanelButton('Undo Last (- / Z)', () => {
    const lastId = addedStack.pop();
    if (!lastId) return;
    order[lastId] = Math.max(0, (order[lastId] ?? 0) - 1);
    refreshAll();
  });
  undoBtn.type = 'button';
  undoBtn.dataset.restockUndo = 'true';

  const clearBtn = makePanelButton('Clear (C)', () => {
    for (const k of Object.keys(order)) order[k] = 0;
    addedStack.length = 0;
    refreshAll();
  });
  clearBtn.type = 'button';
  clearBtn.dataset.restockClear = 'true';

  const rowUpdaters: Array<(addQty: number, cost: number) => void> = [];
  const refreshAll = () => {
    let addQty = 0;
    let cost = 0;
    for (const [id, q] of Object.entries(order)) {
      const it = def.items.find((i) => i.id === id);
      if (it && q > 0) { addQty += q; cost += isFree ? 0 : it.wholesaleCost * q; }
    }
    const spaceLeft = Math.max(0, maxCap - currentTotal - addQty);
    setMoneyText(
      summaryEl,
      `Adding ${addQty} (Space left: ${spaceLeft}) | Cost: $${cost}${isFree ? ' (FREE)' : ''} | Cash: $${active.cash}`
    );
    submitBtn.disabled = addQty === 0 || currentTotal + addQty > maxCap || cost > active.cash;
    undoBtn.disabled = addedStack.length === 0;
    clearBtn.disabled = addedStack.length === 0;
    for (const update of rowUpdaters) update(addQty, cost);
  };

  const sortedItems = [...def.items].filter((i) => i.tier <= shop.level).sort((a, b) => b.wholesaleCost - a.wholesaleCost);
  sortedItems.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'restock-item-row';
    const unitCost = isFree ? 0 : item.wholesaleCost;
    const infoEl = document.createElement('div');
    infoEl.className = 'restock-item-info';
    const nameEl = document.createElement('span');
    nameEl.className = 'restock-item-name';
    nameEl.textContent = getShopItemDisplayName(shop, item, state.players, syncedSignatures);
    const metaEl = document.createElement('span');
    metaEl.className = 'restock-item-meta';
    setMoneyText(metaEl, `$${unitCost} → $${item.retailPrice} · Shelf: ${shop.stock[item.id] ?? 0}`);
    infoEl.append(nameEl, metaEl);

    const controlsEl = document.createElement('div');
    controlsEl.className = 'restock-item-controls';
    const qtyPill = document.createElement('span');
    qtyPill.className = 'restock-qty-pill';
    const minusBtn = makePanelButton('-', () => {
      const cur = order[item.id] ?? 0;
      if (cur <= 0) return;
      order[item.id] = cur - 1;
      const lastPos = addedStack.lastIndexOf(item.id);
      if (lastPos >= 0) addedStack.splice(lastPos, 1);
      refreshAll();
    });
    minusBtn.type = 'button';
    const plusBtn = createChoiceButton(
      '+',
      () => {
        order[item.id] = (order[item.id] ?? 0) + 1;
        addedStack.push(item.id);
        refreshAll();
      },
      { hotkey: idx < 9 ? idx + 1 : undefined }
    );

    rowUpdaters.push((addQty, cost) => {
      const q = order[item.id] ?? 0;
      minusBtn.disabled = q === 0;
      plusBtn.disabled = maxCap - currentTotal - addQty <= 0 || (!isFree && cost + item.wholesaleCost > active.cash);
      qtyPill.textContent = `+${q}`;
      qtyPill.classList.toggle('has-qty', q > 0);
    });
    controlsEl.append(minusBtn, qtyPill, plusBtn);
    row.append(infoEl, controlsEl);
    itemsWrap.appendChild(row);
  });

  const actionsRow = document.createElement('div');
  actionsRow.className = 'restock-actions-row';
  actionsRow.append(submitBtn, undoBtn, clearBtn);

  refreshAll();
  root.append(itemsWrap, summaryEl, actionsRow);
}

export function renderDeliverPanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  onUiChange?: () => void,
  onHoverShop?: (shopId: string | null) => void,
  syncedSignatures?: Readonly<Record<string, SignatureStoreSpec>>
): void {
  const active = getActivePlayer(state);
  const { mode, isFree, candidateShops, isSelectable } = getDeliverShopSelectionInfo(state);

  const root = document.createElement('div');
  root.className = 'card-list';
  container.appendChild(root);

  const render = () => {
    const notify = () => (onUiChange ? onUiChange() : render());
    root.innerHTML = '';
    if (active.blockDeliveryWindow || candidateShops.length === 0) {
      setDeliverSelectedShopId(state, null);
      const msg = document.createElement('div');
      msg.textContent = active.blockDeliveryWindow
        ? `Deliveries are blocked (${formatTimedWindowEndpoint(state, active.blockDeliveryWindow, 'Ends')}).`
        : 'No eligible stores to deliver to.';
      const skipBtn = createChoiceButton(
        'Skip Delivery',
        () => {
          onHoverShop?.(null);
          setDeliverSelectedShopId(state, null);
          dispatch({ type: 'SKIP_DELIVER' });
        },
        { primary: true, confirm: true, skip: true }
      );
      root.append(msg, skipBtn);
      return;
    }
    const selId = getDeliverSelectedShopId(state);
    const picked = selId ? candidateShops.find((s) => s.id === selId && isSelectable(s)) : undefined;
    if (picked) {
      appendRestockStep(
        root,
        state,
        picked,
        mode,
        isFree,
        dispatch,
        () => { setDeliverSelectedShopId(state, null); notify(); },
        onHoverShop,
        syncedSignatures
      );
      return;
    }
    setDeliverSelectedShopId(state, null);
    appendStorePickerStep(
      root,
      state,
      candidateShops,
      mode,
      isSelectable,
      dispatch,
      (id) => {
        setDeliverSelectedShopId(state, id);
        notify();
      },
      onHoverShop,
      syncedSignatures
    );
  };
  render();
}
