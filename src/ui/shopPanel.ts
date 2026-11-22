import { SHOP_RULES, STORE_TYPES } from '../config/balance';
import {
  computeBuyoutCosts,
  computeShopAssetValue,
  getActivePlayer,
  getEffectiveItemRetailPrice,
  getTile,
} from '../engine/helpers';
import { getAllowedStoreTypeIds } from '../engine/shops';
import type { GameState } from '../engine/types';
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
  const selectedIds: string[] = [];
  const summary = document.createElement('div');
  const buyBtn = makePanelButton('Purchase Selected', () => dispatch({ type: 'BUY_RIVAL_ITEMS', itemIds: selectedIds }), { primary: true });

  const refresh = () => {
    const total = selectedIds.reduce((sum, id) => {
      const it = def.items.find((i) => i.id === id);
      return sum + (it ? getEffectiveItemRetailPrice(state, it, shop.ownerId) : 0);
    }, 0);
    summary.textContent = `Selected: ${selectedIds.length}/2 (Must buy 1–2) | Total: $${total}`;
    buyBtn.disabled = selectedIds.length < 1 || selectedIds.length > 2;
  };

  const sortedStockedItems = [...def.items]
    .filter((item) => (shop.stock[item.id] ?? 0) > 0)
    .sort((a, b) => b.retailPrice - a.retailPrice);

  for (const item of sortedStockedItems) {
    const stockQty = shop.stock[item.id] ?? 0;
    const price = getEffectiveItemRetailPrice(state, item, shop.ownerId);
    const row = document.createElement('div');
    row.className = 'action-stack';
    const label = document.createElement('span');
    const updateLabel = () => {
      const chosenCount = selectedIds.filter((id) => id === item.id).length;
      label.textContent = `${item.name} ($${price}, CB ${Math.round(item.cashbackChance * 100)}%) [Stock: ${stockQty}] Picked: ${chosenCount}`;
      refresh();
    };
    row.appendChild(makePanelButton('-', () => {
      const idx = selectedIds.indexOf(item.id);
      if (idx >= 0) selectedIds.splice(idx, 1);
      updateLabel();
    }));
    row.appendChild(makePanelButton('+', () => {
      const chosenCount = selectedIds.filter((id) => id === item.id).length;
      if (selectedIds.length < 2 && chosenCount < stockQty) selectedIds.push(item.id);
      updateLabel();
    }));
    row.appendChild(label);
    list.appendChild(row);
    updateLabel();
  }

  refresh();
  list.appendChild(summary);
  list.appendChild(buyBtn);
  container.appendChild(list);
}

export function renderLiquidatePanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn,
  onUiChange?: () => void
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
      const btn = makePanelButton(isConfirming ? `Confirm? ${label}` : label, () =>
        handleLiquidatePickClick(state, s.id, dispatch, notify),
        { primary: isConfirming }
      );
      btn.style.borderLeft = `4px solid ${active.color}`;
      list.appendChild(btn);
    }
  };

  render();
}
