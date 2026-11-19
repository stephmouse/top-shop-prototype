import { STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import type { GameAction } from '../engine/actions';
import { getActivePlayer, getTile } from '../engine/helpers';
import { getShopTotalStock } from '../engine/shops';
import type { GameState, Shop } from '../engine/types';

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
  return t ? `${t.floor}F:${t.col + 1}` : shop.id;
}

export function renderDeliverPanel(
  container: HTMLElement,
  state: GameState,
  dispatch: DispatchFn
): void {
  const active = getActivePlayer(state);
  const mode = state.deliverMode ?? 'own_paid';
  const isFree = mode === 'own_free';
  const eligibleShops = Object.values(state.shops).filter((s) => {
    if (mode === 'rival_paid') {
      return (
        s.ownerId !== null &&
        s.ownerId !== active.id &&
        getShopTotalStock(s) < STORE_CAPACITY_BY_LEVEL[s.level]
      );
    }
    if (mode === 'all_own_paid' && state.deliveredShopIdsThisTurn.includes(s.id)) {
      return false;
    }
    return s.ownerId === active.id;
  });

  const list = document.createElement('div');
  list.className = 'card-list';

  if (active.blockDeliveryTurns > 0 || eligibleShops.length === 0) {
    const msg = document.createElement('div');
    msg.textContent =
      active.blockDeliveryTurns > 0
        ? 'Deliveries are blocked for this turn.'
        : 'No eligible stores to deliver to.';
    list.appendChild(msg);
    list.appendChild(
      makePanelButton('Skip Delivery', () => dispatch({ type: 'SKIP_DELIVER' }), { primary: true })
    );
    container.appendChild(list);
    return;
  }

  if (mode !== 'own_paid') {
    const modeNote = document.createElement('div');
    modeNote.textContent =
      mode === 'own_free'
        ? 'Bank Free Delivery ($0 wholesale cost):'
        : mode === 'rival_paid'
          ? 'Bank Rival Store Delivery:'
          : `Bank Deliver to All Own Stores (${state.deliveredShopIdsThisTurn.length} done):`;
    list.appendChild(modeNote);
  }

  const landedTile = getTile(state, active.tileId);
  const defaultShop =
    eligibleShops.find((s) => s.id === state.deliverPreferredShopId) ??
    eligibleShops.find((s) => s.id === landedTile.shopSlotId) ??
    eligibleShops[0]!;

  const shopSelect = document.createElement('select');
  for (const s of eligibleShops) {
    const def = s.storeTypeId ? STORE_TYPES[s.storeTypeId] : undefined;
    const loc = formatShopLocation(state, s);
    const owner = state.players.find((p) => p.id === s.ownerId);
    const ownerTag = mode === 'rival_paid' ? ` (${owner?.name ?? '?'})` : '';
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${loc} ${def?.name ?? s.id} L${s.level} (${getShopTotalStock(s)}/${STORE_CAPACITY_BY_LEVEL[s.level]})${ownerTag}`;
    if (s.id === defaultShop.id) opt.selected = true;
    shopSelect.appendChild(opt);
  }
  list.appendChild(shopSelect);

  const itemsWrap = document.createElement('div');
  itemsWrap.className = 'card-list';
  const summaryEl = document.createElement('div');
  const submitBtn = makePanelButton('Confirm Delivery', () => {}, { primary: true });
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
          cost += isFree ? 0 : it.wholesaleCost * q;
        }
      }
      summaryEl.textContent = `Adding ${addQty} (Space left: ${maxCap - currentTotal - addQty}) | Cost: $${cost}${isFree ? ' (FREE)' : ''}`;
      submitBtn.disabled = addQty === 0 || currentTotal + addQty > maxCap || cost > active.cash;
    };

    const sortedItems = [...def.items]
      .filter((item) => item.tier <= shop.level)
      .sort((a, b) => b.wholesaleCost - a.wholesaleCost);

    for (const item of sortedItems) {
      const row = document.createElement('div');
      row.className = 'action-stack';
      const qtySpan = document.createElement('span');
      const unitCost = isFree ? 0 : item.wholesaleCost;
      const updateRow = () => {
        const q = order[item.id] ?? 0;
        qtySpan.textContent = `${item.name} ($${unitCost} -> $${item.retailPrice}) [Shelf: ${shop.stock[item.id] ?? 0}] +${q}`;
        refreshSummary();
      };
      row.appendChild(makePanelButton('-', () => { order[item.id] = Math.max(0, (order[item.id] ?? 0) - 1); updateRow(); }));
      row.appendChild(makePanelButton('+', () => { order[item.id] = (order[item.id] ?? 0) + 1; updateRow(); }));
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
  const cancelLabel =
    mode === 'all_own_paid' && state.deliveredShopIdsThisTurn.length > 0
      ? 'Finish Deliveries'
      : state.deliverMode !== null
        ? 'Cancel & Return to Bank'
        : 'Do Not Deliver';
  list.appendChild(makePanelButton(cancelLabel, () => dispatch({ type: 'SKIP_DELIVER' })));
  container.appendChild(list);
}
