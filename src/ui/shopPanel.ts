import { SHOP_RULES, STORE_TYPES } from '../config/balance';
import {
  computeBuyoutCosts,
  computeShopAssetValue,
  getActivePlayer,
  getEffectiveItemRetailPrice,
  getTile,
} from '../engine/helpers';
import { getAllowedStoreTypeIds } from '../engine/shops';
import type { GameState, ItemDef } from '../engine/types';
import { getLiquidateConfirmShopId, handleLiquidatePickClick } from './boardPickState';
import {
  formatShopLocation,
  makePanelButton,
  renderDeliverPanel,
} from './deliverPanel';
import type { DispatchFn } from './deliverPanel';

export { renderDeliverPanel };

export function renderBuySlotPanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn
): void {
  const active = getActivePlayer(state);
  const tile = getTile(state, active.tileId);
  const shop = tile.shopSlotId ? state.shops[tile.shopSlotId] : undefined;
  if (!shop) return;

  const isBuyout = shop.ownerId !== null && shop.ownerId !== active.id;

  const list = document.createElement('div');
  list.className = 'card-list';

  if (active.blockNewStoreTurns > 0) {
    const blocked = document.createElement('div');
    blocked.textContent = "This store can't be opened due to vandalism.";
    list.appendChild(blocked);
  } else {
    const allowedIds = getAllowedStoreTypeIds(
      state,
      active.id,
      shop.segmentId,
      isBuyout ? shop.id : undefined
    );
    const sortedDefs = allowedIds
      .map((id) => STORE_TYPES[id])
      .filter((def): def is NonNullable<typeof def> => Boolean(def))
      .sort((a, b) => b.baseOpenCost - a.baseOpenCost);

    if (sortedDefs.length === 0) {
      const noneMsg = document.createElement('div');
      noneMsg.textContent = 'All store types in this segment are already claimed by rivals.';
      list.appendChild(noneMsg);
    }
    for (const def of sortedDefs) {
      const { rivalPayout, totalCost } = isBuyout
        ? computeBuyoutCosts(shop, def.id)
        : { rivalPayout: 0, totalCost: def.baseOpenCost };
      const cost = isBuyout ? totalCost : def.baseOpenCost;
      const label = isBuyout
        ? `Buyout & Convert to ${def.name} ($${totalCost} = $${rivalPayout} + $${def.baseOpenCost}, auto-stocks)`
        : `Open ${def.name} ($${cost}, auto-stocks)`;
      list.appendChild(
        makePanelButton(
          label,
          () => dispatch({ type: isBuyout ? 'BUYOUT_SHOP' : 'OPEN_SHOP', storeTypeId: def.id }),
          { primary: true, disabled: active.cash < cost }
        )
      );
    }
  }

  list.appendChild(makePanelButton('Do Not Open / Skip', () => dispatch({ type: 'SKIP_SHOP_SLOT' })));
  container.appendChild(list);
}

export function renderBuyRivalPanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn
): void {
  const active = getActivePlayer(state);
  const tile = getTile(state, active.tileId);
  const shop = tile.shopSlotId ? state.shops[tile.shopSlotId] : undefined;
  const def = shop?.storeTypeId ? STORE_TYPES[shop.storeTypeId] : undefined;
  if (!shop || !def) return;

  const list = document.createElement('div');
  list.className = 'card-list';

  interface ShelfSlot {
    slotIdx: number;
    item: ItemDef;
    price: number;
  }

  const sortedItems = [...def.items].sort((a, b) => b.retailPrice - a.retailPrice);
  const slots: ShelfSlot[] = [];
  for (const item of sortedItems) {
    const qty = shop.stock[item.id] ?? 0;
    const price = getEffectiveItemRetailPrice(state, item, shop.ownerId);
    for (let k = 0; k < qty; k++) {
      slots.push({ slotIdx: slots.length, item, price });
    }
  }

  const boughtCount = state.rivalItemsBoughtThisTurn ?? 0;
  const receipt = state.lastPurchaseReceipt;
  if (boughtCount > 0 && receipt?.shopId === shop.id) {
    const banner = document.createElement('div');
    const isCb = receipt.cashbackCount > 0;
    banner.className = `rival-purchase-banner${isCb ? ' is-cashback' : ''}`;
    const ptsText =
      receipt.pointsAwarded && receipt.pointsAwarded > 0
        ? `+${receipt.pointsAwarded} pt${receipt.pointsAwarded === 1 ? '' : 's'}`
        : 'No points';
    const cbText = isCb ? ` · CASH BACK! +$${receipt.cashbackRefund}` : '';
    banner.textContent = `Bought ${receipt.itemName ?? 'item'} (-$${receipt.grossPaid}) · ${ptsText}${cbText}`;
    list.appendChild(banner);
  }

  let selectedSlotIdx: number | null = null;
  const summary = document.createElement('div');
  const grid = document.createElement('div');
  grid.className = 'rival-shelf-grid';
  const buyBtn = makePanelButton(
    'Buy Selected',
    () => {
      if (selectedSlotIdx === null) return;
      dispatch({ type: 'BUY_RIVAL_ITEMS', itemIds: [slots[selectedSlotIdx]!.item.id] });
    },
    { primary: true }
  );

  const slotButtons: Array<{ btn: HTMLButtonElement; slot: ShelfSlot; statusEl: HTMLSpanElement }> = [];

  const refresh = () => {
    const chosen = selectedSlotIdx !== null ? slots[selectedSlotIdx] : undefined;
    for (const { btn, slot, statusEl } of slotButtons) {
      const picked = slot.slotIdx === selectedSlotIdx;
      btn.className = `rival-item-card${picked ? ' is-selected' : ''}`;
      statusEl.textContent = picked ? '✓ Selected' : 'Click to select';
    }
    const stepText =
      boughtCount === 0
        ? `Item 1 of ${SHOP_RULES.maxItemsPerVisit} (Required)`
        : `Optional item ${boughtCount + 1} of ${SHOP_RULES.maxItemsPerVisit}`;
    const buyoutNote = slots.length === 1 ? ' · Clears store for buyout!' : '';
    summary.textContent = `Shelf: ${slots.length} item${slots.length === 1 ? '' : 's'} | ${stepText}${buyoutNote}`;
    buyBtn.textContent = chosen ? `Buy ${chosen.item.name} ($${chosen.price})` : 'Buy Selected';
    buyBtn.disabled = !chosen;
  };

  for (const slot of slots) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rival-item-card';
    const nameEl = document.createElement('span');
    nameEl.className = 'rival-item-name';
    nameEl.textContent = slot.item.name;
    const metaEl = document.createElement('span');
    metaEl.className = 'rival-item-meta';
    metaEl.textContent = `$${slot.price} · CB ${Math.round(slot.item.cashbackChance * 100)}%`;
    const statusEl = document.createElement('span');
    statusEl.className = 'rival-item-pick';
    btn.append(nameEl, metaEl, statusEl);
    btn.addEventListener('click', () => {
      selectedSlotIdx = selectedSlotIdx === slot.slotIdx ? null : slot.slotIdx;
      refresh();
    });
    slotButtons.push({ btn, slot, statusEl });
    grid.appendChild(btn);
  }

  refresh();
  const actionsRow = document.createElement('div');
  actionsRow.className = 'rival-actions-row';
  actionsRow.appendChild(buyBtn);
  if (boughtCount >= 1) {
    actionsRow.appendChild(
      makePanelButton('Leave Shop', () => dispatch({ type: 'FINISH_RIVAL_SHOP' }))
    );
  }
  list.append(summary, grid, actionsRow);
  container.appendChild(list);
}

export function renderLiquidatePanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  onUiChange?: () => void,
  onHoverShop?: (shopId: string | null) => void
): void {
  const active = getActivePlayer(state);
  const owned = Object.values(state.shops).filter((s) => s.ownerId === active.id);
  const list = document.createElement('div');
  list.className = 'card-list';
  container.appendChild(list);

  const render = () => {
    const notify = () => (onUiChange ? onUiChange() : render());
    list.innerHTML = '';

    const note = document.createElement('div');
    note.textContent = `Negative cash ($${active.cash})! Sell stores until cash >= $0 (click twice to confirm):`;
    list.appendChild(note);

    const confirmId = getLiquidateConfirmShopId(state);
    for (const s of owned) {
      const def = s.storeTypeId ? STORE_TYPES[s.storeTypeId] : undefined;
      const loc = formatShopLocation(state, s);
      const payout = Math.floor(computeShopAssetValue(s) * SHOP_RULES.sellLiquidationRate);
      const isConfirming = confirmId === s.id;
      const label = `Sell ${loc} ${def?.name ?? 'Store'} L${s.level} (+$${payout})`;
      const btn = makePanelButton(
        isConfirming ? `Confirm? ${label}` : label,
        () => {
          onHoverShop?.(null);
          handleLiquidatePickClick(state, s.id, dispatch, notify);
        },
        { primary: isConfirming }
      );
      if (onHoverShop) {
        btn.addEventListener('mouseenter', () => onHoverShop(s.id));
        btn.addEventListener('mouseleave', () => onHoverShop(null));
        btn.addEventListener('focus', () => onHoverShop(s.id));
        btn.addEventListener('blur', () => onHoverShop(null));
      }
      btn.style.borderLeft = `4px solid ${active.color}`;
      list.appendChild(btn);
    }
  };

  render();
}
