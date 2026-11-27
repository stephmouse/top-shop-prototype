import { STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import { getStoreVisual } from '../config/storeVisuals';
import {
  computeShopAssetValue,
  formatShopRef,
  getEffectiveItemRetailPrice,
} from '../engine/helpers';
import { getShopTotalStock } from '../engine/shops';
import { formatTimedWindowEndpoint, getTimedWindowRoundsLeft } from '../engine/timedEffects';
import type { GameState } from '../engine/types';
import { addLobbySection, mk, mkBtn } from './lobbyRoomView';
import { setMoneyText } from './moneyText';
import { createStoreIconSvg } from './storeTileView';
import { getDisplayPlayerColor } from './themeConfig';

export interface StoreInspectorOptions {
  getState: () => GameState;
}

export interface StoreInspectorController {
  el: HTMLElement;
  open: (shopId: string) => void;
  close: () => void;
  isOpen: () => boolean;
  refresh: () => void;
}

export function createStoreInspectorModal(options: StoreInspectorOptions): StoreInspectorController {
  let visible = false;
  let inspectedShopId: string | null = null;

  const backdrop = Object.assign(mk('div', 'setup-backdrop inspector-backdrop'), { hidden: true });
  const modal = mk('div', 'setup-modal inspector-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  backdrop.appendChild(modal);

  const close = () => {
    visible = false;
    inspectedShopId = null;
    backdrop.hidden = true;
  };

  const titleEl = mk('h2', 'setup-title', 'Store Inspector');
  const titleWrap = mk('div', 'inspector-title-wrap');
  const iconWrap = mk('span', 'inspector-title-icon');
  titleWrap.append(iconWrap, titleEl);

  const header = mk('div', 'setup-header');
  header.append(titleWrap, mkBtn('Close (Esc)', close));
  const bodyEl = mk('div', 'lobby-body inspector-body');
  const footer = mk('div', 'setup-footer');
  footer.append(mk('span', 'setup-muted', 'Click any owned store tile to inspect prices & stock.'), mkBtn('Close', close, 'primary'));
  modal.append(header, bodyEl, footer);

  function render(): void {
    bodyEl.innerHTML = '';
    iconWrap.innerHTML = '';
    if (!inspectedShopId) return;

    const state = options.getState();
    const shop = state.shops[inspectedShopId];
    if (!shop || !shop.ownerId || !shop.storeTypeId) {
      close();
      return;
    }

    const def = STORE_TYPES[shop.storeTypeId];
    const owner = state.players.find((p) => p.id === shop.ownerId);
    const ownerIdx = owner ? state.players.findIndex((p) => p.id === owner.id) : -1;
    const ownerColor = owner && ownerIdx >= 0 ? getDisplayPlayerColor(ownerIdx, owner.color) : '';
    const vis = getStoreVisual(shop.storeTypeId);
    iconWrap.appendChild(createStoreIconSvg(vis.iconId));
    iconWrap.style.color = vis.accent;
    titleEl.textContent = formatShopRef(state, shop);

    const metaSec = addLobbySection('Store Overview');
    const pills = mk('div', 'inspector-pills');
    const ownerPill = mk('span', 'player-meta-chip is-stores', `Owner: ${owner?.name ?? '?'}`);
    if (ownerColor) ownerPill.style.borderColor = ownerColor;
    const total = getShopTotalStock(shop);
    const cap = STORE_CAPACITY_BY_LEVEL[shop.level];
    const assetPill = mk('span', 'player-meta-chip is-buff', '');
    setMoneyText(assetPill, `Asset Value: $${computeShopAssetValue(shop)}`, 'asset');
    pills.append(
      ownerPill,
      mk('span', 'player-meta-chip is-dir', `Chain Level ${shop.level}`),
      mk('span', 'player-meta-chip is-info', `Stock: ${total}/${cap}`),
      assetPill
    );
    if (shop.closedWindow) {
      const rd = getTimedWindowRoundsLeft(state, shop.closedWindow);
      const pill = mk('span', 'player-meta-chip is-debuff', `CLOSED (${rd} rd)`);
      pill.title = formatTimedWindowEndpoint(state, shop.closedWindow, 'Reopens');
      pills.appendChild(pill);
    }
    if (owner?.doublePriceWindow) {
      const rd = getTimedWindowRoundsLeft(state, owner.doublePriceWindow);
      const pill = mk('span', 'player-meta-chip is-buff', `2× Prices (${rd} rd)`);
      pill.title = formatTimedWindowEndpoint(state, owner.doublePriceWindow, '2× prices end');
      pills.appendChild(pill);
    }
    if (state.globalSale) {
      const pct = Math.round((1 - state.globalSale.priceMultiplier) * 100);
      pills.appendChild(mk('span', 'player-meta-chip is-info', `${state.globalSale.label}: ${pct}% OFF`));
    }
    metaSec.appendChild(pills);

    const invSec = addLobbySection('Inventory & Prices');
    const itemsGrid = mk('div', 'inspector-items');
    const sorted = [...(def?.items ?? [])].sort((a, b) => a.retailPrice - b.retailPrice);
    for (const item of sorted) {
      const qty = shop.stock[item.id] ?? 0;
      const unlocked = item.tier <= shop.level;
      const effectivePrice = getEffectiveItemRetailPrice(state, item, shop.ownerId);
      const cbPct = Math.round(item.cashbackChance * 100);

      const row = mk(
        'div',
        `inspector-item${qty > 0 ? ' is-stocked' : !unlocked ? ' is-locked' : ' is-empty'}`
      );
      const left = mk('div', 'inspector-item-main');
      const subSpan = mk('span', 'inspector-item-sub', '');
      setMoneyText(subSpan, `L${item.tier} · Wholesale $${item.wholesaleCost} · Cash Back ${cbPct}%`);
      left.append(
        mk('span', 'inspector-item-name', item.name),
        subSpan
      );
      const right = mk('div', 'inspector-item-right');
      const priceSpan = mk('span', 'inspector-item-price', '');
      setMoneyText(priceSpan, `$${effectivePrice}`);
      right.append(
        priceSpan,
        mk(
          'span',
          'inspector-item-qty',
          qty > 0 ? `×${qty} in stock` : unlocked ? 'Out of stock' : `Unlocks at L${item.tier}`
        )
      );
      row.append(left, right);
      itemsGrid.appendChild(row);
    }
    invSec.appendChild(itemsGrid);
    bodyEl.append(metaSec, invSec);
  }

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  return {
    el: backdrop,
    open: (shopId) => {
      inspectedShopId = shopId;
      visible = true;
      render();
      if (visible) backdrop.hidden = false;
    },
    close,
    isOpen: () => visible,
    refresh: () => { if (visible) render(); },
  };
}
