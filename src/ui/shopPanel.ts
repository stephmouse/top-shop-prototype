import {
  SHOP_RULES,
  STORE_CAPACITY_BY_LEVEL,
  STORE_TYPES,
} from '../config/balance';
import type { GameAction } from '../engine/actions';
import {
  computeShopAssetValue,
  getActivePlayer,
  getEffectiveItemRetailPrice,
  getTile,
} from '../engine/helpers';
import { getAllowedStoreTypeIds, getShopTotalStock } from '../engine/shops';
import type { GameState, Shop } from '../engine/types';

type DispatchFn = (action: GameAction) => void;

function makeBtn(
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

function formatShopLocation(state: GameState, shop: Shop): string {
  const t = state.tiles[shop.tileId];
  return t ? `${t.floor}F:${t.col + 1}` : shop.id;
}

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
  const oldDef = shop.storeTypeId ? STORE_TYPES[shop.storeTypeId] : undefined;
  const buyoutCost = oldDef
    ? Math.floor(oldDef.baseOpenCost * shop.level * SHOP_RULES.buyoutMultiplier)
    : 0;

  const list = document.createElement('div');
  list.className = 'card-list';

  if (!isBuyout && active.blockNewStoreTurns > 0) {
    const blocked = document.createElement('div');
    blocked.textContent = 'Opening new stores is blocked this turn.';
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
      const cost = isBuyout ? buyoutCost : def.baseOpenCost;
      const label = isBuyout
        ? `Buyout & Convert to ${def.name} ($${cost}, auto-stocks)`
        : `Open ${def.name} ($${cost}, auto-stocks)`;
      list.appendChild(
        makeBtn(
          label,
          () => dispatch({ type: isBuyout ? 'BUYOUT_SHOP' : 'OPEN_SHOP', storeTypeId: def.id }),
          { primary: true, disabled: active.cash < cost }
        )
      );
    }
  }

  list.appendChild(makeBtn('Do Not Open / Skip', () => dispatch({ type: 'SKIP_SHOP_SLOT' })));
  container.appendChild(list);
}

export function renderDeliverPanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn
): void {
  const active = getActivePlayer(state);
  const ownedShops = Object.values(state.shops).filter((s) => s.ownerId === active.id);
  const list = document.createElement('div');
  list.className = 'card-list';

  if (active.blockDeliveryTurns > 0 || ownedShops.length === 0) {
    const msg = document.createElement('div');
    msg.textContent = active.blockDeliveryTurns > 0
      ? 'Deliveries are blocked for this turn.'
      : 'No owned stores to deliver to.';
    list.appendChild(msg);
    list.appendChild(makeBtn('Skip Delivery', () => dispatch({ type: 'SKIP_DELIVER' }), { primary: true }));
    container.appendChild(list);
    return;
  }

  const landedTile = getTile(state, active.tileId);
  const defaultShop =
    ownedShops.find((s) => s.id === landedTile.shopSlotId) ?? ownedShops[0]!;

  const shopSelect = document.createElement('select');
  for (const s of ownedShops) {
    const def = s.storeTypeId ? STORE_TYPES[s.storeTypeId] : undefined;
    const loc = formatShopLocation(state, s);
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${loc} ${def?.name ?? s.id} L${s.level} (${getShopTotalStock(s)}/${STORE_CAPACITY_BY_LEVEL[s.level]})`;
    if (s.id === defaultShop.id) opt.selected = true;
    shopSelect.appendChild(opt);
  }
  list.appendChild(shopSelect);

  const itemsWrap = document.createElement('div');
  itemsWrap.className = 'card-list';
  const summaryEl = document.createElement('div');
  const submitBtn = makeBtn('Confirm Delivery', () => {}, { primary: true });
  let order: Record<string, number> = {};

  function rebuildItems(shop: Shop): void {
    itemsWrap.innerHTML = '';
    order = {};
    const def = shop.storeTypeId ? STORE_TYPES[shop.storeTypeId] : undefined;
    if (!def) return;

    const maxCap = STORE_CAPACITY_BY_LEVEL[shop.level];
    const currentTotal = getShopTotalStock(shop);

    const refreshSummary = () => {
      let addQty = 0;
      let cost = 0;
      for (const [id, q] of Object.entries(order)) {
        const it = def.items.find((i) => i.id === id);
        if (it && q > 0) {
          addQty += q;
          cost += it.wholesaleCost * q;
        }
      }
      summaryEl.textContent = `Adding ${addQty} (Space left: ${maxCap - currentTotal - addQty}) | Cost: $${cost}`;
      submitBtn.disabled = addQty === 0 || currentTotal + addQty > maxCap || cost > active.cash;
    };

    const sortedItems = [...def.items]
      .filter((item) => item.tier <= shop.level)
      .sort((a, b) => b.wholesaleCost - a.wholesaleCost);

    for (const item of sortedItems) {
      const row = document.createElement('div');
      row.className = 'action-stack';
      const qtySpan = document.createElement('span');
      const updateRow = () => {
        const q = order[item.id] ?? 0;
        qtySpan.textContent = `${item.name} ($${item.wholesaleCost} -> $${item.retailPrice}) [Shelf: ${shop.stock[item.id] ?? 0}] +${q}`;
        refreshSummary();
      };
      row.appendChild(makeBtn('-', () => { order[item.id] = Math.max(0, (order[item.id] ?? 0) - 1); updateRow(); }));
      row.appendChild(makeBtn('+', () => { order[item.id] = (order[item.id] ?? 0) + 1; updateRow(); }));
      row.appendChild(qtySpan);
      itemsWrap.appendChild(row);
      updateRow();
    }
  }

  shopSelect.addEventListener('change', () => {
    const nextShop = state.shops[shopSelect.value];
    if (nextShop) rebuildItems(nextShop);
  });
  submitBtn.addEventListener('click', () => {
    dispatch({ type: 'DELIVER_ITEMS', shopId: shopSelect.value, order });
  });

  rebuildItems(defaultShop);
  list.appendChild(itemsWrap);
  list.appendChild(summaryEl);
  list.appendChild(submitBtn);
  list.appendChild(makeBtn('Do Not Deliver', () => dispatch({ type: 'SKIP_DELIVER' })));
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
  const buyBtn = makeBtn('Purchase Selected', () => dispatch({ type: 'BUY_RIVAL_ITEMS', itemIds: selectedIds }), { primary: true });

  const refresh = () => {
    const total = selectedIds.reduce((sum, id) => {
      const it = def.items.find((i) => i.id === id);
      return sum + (it ? getEffectiveItemRetailPrice(state, it) : 0);
    }, 0);
    summary.textContent = `Selected: ${selectedIds.length}/2 (Must buy 1–2) | Total: $${total}`;
    buyBtn.disabled = selectedIds.length < 1 || selectedIds.length > 2;
  };

  const sortedStockedItems = [...def.items]
    .filter((item) => (shop.stock[item.id] ?? 0) > 0)
    .sort((a, b) => b.retailPrice - a.retailPrice);

  for (const item of sortedStockedItems) {
    const stockQty = shop.stock[item.id] ?? 0;
    const price = getEffectiveItemRetailPrice(state, item);
    const row = document.createElement('div');
    row.className = 'action-stack';
    const label = document.createElement('span');
    const updateLabel = () => {
      const chosenCount = selectedIds.filter((id) => id === item.id).length;
      label.textContent = `${item.name} ($${price}, CB ${Math.round(item.cashbackChance * 100)}%) [Stock: ${stockQty}] Picked: ${chosenCount}`;
      refresh();
    };
    row.appendChild(makeBtn('-', () => {
      const idx = selectedIds.indexOf(item.id);
      if (idx >= 0) selectedIds.splice(idx, 1);
      updateLabel();
    }));
    row.appendChild(makeBtn('+', () => {
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
  dispatch: DispatchFn
): void {
  const active = getActivePlayer(state);
  const owned = Object.values(state.shops).filter((s) => s.ownerId === active.id);
  const list = document.createElement('div');
  list.className = 'card-list';

  const note = document.createElement('div');
  note.textContent = `Negative cash ($${active.cash})! Sell stores until cash >= $0:`;
  list.appendChild(note);

  for (const s of owned) {
    const def = s.storeTypeId ? STORE_TYPES[s.storeTypeId] : undefined;
    const loc = formatShopLocation(state, s);
    const payout = Math.floor(computeShopAssetValue(s) * SHOP_RULES.sellLiquidationRate);
    list.appendChild(
      makeBtn(`Sell ${loc} ${def?.name ?? 'Store'} L${s.level} (+$${payout})`, () =>
        dispatch({ type: 'SELL_SHOP_LIQUIDATE', shopId: s.id })
      )
    );
  }
  container.appendChild(list);
}