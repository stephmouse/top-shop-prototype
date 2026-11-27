import { SHOP_RULES, STORE_TYPES } from '../config/balance';
import {
  computeBuyoutCosts,
  computeOpenCostForLevel,
  computeShopAssetValue,
  getActivePlayer,
  getEffectiveItemRetailPrice,
  getTile,
} from '../engine/helpers';
import { computeResultingChainLevel, getAllowedStoreTypeIds } from '../engine/shops';
import { formatTimedWindowEndpoint } from '../engine/timedEffects';
import type { GameState, ItemDef } from '../engine/types';
import { getLiquidateConfirmShopId, handleLiquidatePickClick } from './boardPickState';
import { createChoiceButton, decorateChoiceButton, makeChoiceHeaderRow } from './choiceUi';
import { formatShopLocation, renderDeliverPanel } from './deliverPanel';
import type { DispatchFn } from './deliverPanel';
import { setMoneyText } from './moneyText';
import { getDisplayPlayerColor } from './themeConfig';

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
  container.appendChild(list);

  let confirmStoreTypeId: string | null = null;

  const renderList = () => {
    list.innerHTML = '';

    const allowedIds = active.blockNewStoreWindow
      ? []
      : getAllowedStoreTypeIds(state, active.id, shop.segmentId, isBuyout ? shop.id : undefined);
    const resultingLevel = computeResultingChainLevel(state, shop.id, active.id);
    const levelTag = resultingLevel > 1 ? ` L${resultingLevel}` : '';
    const sortedDefs = allowedIds
      .map((id) => STORE_TYPES[id])
      .filter((def): def is NonNullable<typeof def> => Boolean(def))
      .sort(
        (a, b) =>
          computeOpenCostForLevel(b.id, resultingLevel) -
          computeOpenCostForLevel(a.id, resultingLevel)
      );

    const promptText = active.blockNewStoreWindow
      ? `This store can't be opened due to vandalism (${formatTimedWindowEndpoint(state, active.blockNewStoreWindow, 'Ends')}).`
      : sortedDefs.length === 0
        ? 'All store types in this segment are already claimed by rivals.'
        : isBuyout
          ? 'Choose a store for buyout (click twice or press 1–3 then Enter):'
          : 'Choose a store to open (click twice or press 1–3 then Enter):';

    const skipBtn = createChoiceButton(
      'Do Not Open / Skip',
      () => {
        confirmStoreTypeId = null;
        dispatch({ type: 'SKIP_SHOP_SLOT' });
      },
      { primary: Boolean(active.blockNewStoreWindow) || sortedDefs.length === 0, skip: true }
    );
    const { headerRow, promptEl } = makeChoiceHeaderRow([skipBtn], promptText);
    list.appendChild(headerRow);
    if (promptEl) list.appendChild(promptEl);

    sortedDefs.forEach((def, idx) => {
      const buyout = isBuyout ? computeBuyoutCosts(shop, def.id, resultingLevel) : null;
      const openCost = buyout ? buyout.openCost : computeOpenCostForLevel(def.id, resultingLevel);
      const cost = buyout ? buyout.totalCost : openCost;
      const baseLabel = buyout
        ? `Buyout & Convert to ${def.name}${levelTag} ($${cost} = $${buyout.rivalPayout} + $${openCost}, auto-stocks)`
        : `Open ${def.name}${levelTag} ($${cost}, auto-stocks)`;
      const isConfirming = confirmStoreTypeId === def.id;
      list.appendChild(
        createChoiceButton(
          isConfirming ? `Confirm? ${baseLabel}` : baseLabel,
          () => {
            if (confirmStoreTypeId !== def.id) {
              confirmStoreTypeId = def.id;
              renderList();
              return;
            }
            confirmStoreTypeId = null;
            dispatch({ type: isBuyout ? 'BUYOUT_SHOP' : 'OPEN_SHOP', storeTypeId: def.id });
          },
          {
            hotkey: idx < 9 ? idx + 1 : undefined,
            primary: isConfirming,
            confirm: isConfirming,
            nav: true,
            disabled: active.cash < cost,
          }
        )
      );
    });
  };

  renderList();
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

  const sortedItems = [...def.items].sort((a, b) => a.retailPrice - b.retailPrice);
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
    setMoneyText(banner, `Bought ${receipt.itemName ?? 'item'} (-$${receipt.grossPaid}) · ${ptsText}${cbText}`);
    list.appendChild(banner);
  }

  let selectedSlotIdx: number | null = null;
  const summary = document.createElement('div');
  const grid = document.createElement('div');
  grid.className = 'rival-shelf-grid';
  const buyBtn = createChoiceButton(
    'Buy Selected (Enter)',
    () => {
      if (selectedSlotIdx === null) return;
      dispatch({ type: 'BUY_RIVAL_ITEMS', itemIds: [slots[selectedSlotIdx]!.item.id] });
    },
    { primary: true, confirm: true }
  );
  const buyLabelEl = buyBtn.querySelector('.choice-btn-label') ?? buyBtn;

  const slotButtons: Array<{ btn: HTMLButtonElement; slot: ShelfSlot; statusEl: HTMLSpanElement }> = [];

  const refresh = () => {
    const chosen = selectedSlotIdx !== null ? slots[selectedSlotIdx] : undefined;
    for (const { btn, slot, statusEl } of slotButtons) {
      const picked = slot.slotIdx === selectedSlotIdx;
      btn.className = `rival-item-card${picked ? ' is-selected' : ''}`;
      statusEl.textContent = picked ? 'Click/Press again to Buy' : 'Click to select';
    }
    const stepText =
      boughtCount === 0
        ? `Item 1 of ${SHOP_RULES.maxItemsPerVisit} (Required)`
        : `Optional item ${boughtCount + 1} of ${SHOP_RULES.maxItemsPerVisit}`;
    const buyoutNote = slots.length === 1 ? ' · Clears store for buyout!' : '';
    summary.textContent = `Shelf: ${slots.length} item${slots.length === 1 ? '' : 's'} | ${stepText}${buyoutNote}`;
    setMoneyText(
      buyLabelEl,
      chosen ? `Buy ${chosen.item.name} ($${chosen.price}) (Enter)` : 'Buy Selected (Enter)'
    );
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
    setMoneyText(metaEl, `$${slot.price} · CB ${Math.round(slot.item.cashbackChance * 100)}%`);
    const statusEl = document.createElement('span');
    statusEl.className = 'rival-item-pick';
    btn.append(nameEl, metaEl, statusEl);
    decorateChoiceButton(btn, { hotkey: slot.slotIdx < 9 ? slot.slotIdx + 1 : undefined, nav: true });
    btn.addEventListener('click', () => {
      if (selectedSlotIdx === slot.slotIdx) {
        dispatch({ type: 'BUY_RIVAL_ITEMS', itemIds: [slot.item.id] });
        return;
      }
      selectedSlotIdx = slot.slotIdx;
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
      createChoiceButton('Leave Shop', () => dispatch({ type: 'FINISH_RIVAL_SHOP' }), { back: true, skip: true })
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
    setMoneyText(
      note,
      `Negative cash ($${active.cash})! Sell stores until cash >= $0 (click twice or press 1–9 then Enter):`
    );
    list.appendChild(note);

    const confirmId = getLiquidateConfirmShopId(state);
    owned.forEach((s, idx) => {
      const def = s.storeTypeId ? STORE_TYPES[s.storeTypeId] : undefined;
      const loc = formatShopLocation(state, s);
      const payout = Math.floor(computeShopAssetValue(s) * SHOP_RULES.sellLiquidationRate);
      const isConfirming = confirmId === s.id;
      const label = `Sell ${loc} ${def?.name ?? 'Store'} L${s.level} (+$${payout})`;
      const btn = createChoiceButton(
        isConfirming ? `Confirm? ${label}` : label,
        () => {
          onHoverShop?.(null);
          handleLiquidatePickClick(state, s.id, dispatch, notify);
        },
        {
          hotkey: idx < 9 ? idx + 1 : undefined,
          shopId: s.id,
          onHoverShop,
          primary: isConfirming,
          confirm: isConfirming,
          nav: true,
          accentColor: getDisplayPlayerColor(state.players.indexOf(active), active.color),
        }
      );
      list.appendChild(btn);
    });
  };

  render();
}
