import { STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import { getStoreVisual, STORE_ICON_PATHS } from '../config/storeVisuals';
import type { StoreIconId, StoreVisualCategory } from '../config/storeVisuals';
import { canPlayerUseElevator, getActivePlayer } from '../engine/helpers';
import { getCheapestItemPrice, getShopTotalStock } from '../engine/shops';
import type { GameState, Shop, Tile } from '../engine/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface TileContent {
  name: string;
  stats?: string;
  iconId: StoreIconId;
  category?: StoreVisualCategory;
  accent?: string;
  isOwned: boolean;
  isVacantShop: boolean;
  isClosed: boolean;
  closedTurns: number;
  level: 1 | 2 | 3 | 4 | null;
  shop?: Shop;
}

export function createStoreIconSvg(iconId: StoreIconId): Element {
  const paths = STORE_ICON_PATHS[iconId] ?? STORE_ICON_PATHS.vacant;
  if (typeof document.createElementNS !== 'function') {
    return Object.assign(document.createElement('span'), { className: 'store-icon-svg' });
  }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'store-icon-svg');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
  }
  return svg;
}

export function computeChainAdjacency(
  state: GameState,
  tile: Tile,
  shop: Shop | undefined
): { chainLeft: boolean; chainRight: boolean } {
  if (!shop || !shop.ownerId) return { chainLeft: false, chainRight: false };
  const hasNeighbor = (neighborId?: string) => {
    const nTile = neighborId ? state.tiles[neighborId] : undefined;
    const nShop = nTile?.shopSlotId ? state.shops[nTile.shopSlotId] : undefined;
    return Boolean(nShop && nShop.ownerId === shop.ownerId && nShop.segmentId === shop.segmentId);
  };
  return { chainLeft: hasNeighbor(tile.neighbors.left), chainRight: hasNeighbor(tile.neighbors.right) };
}

export function updateShopShelf(shelfEl: HTMLElement, shop: Shop | undefined): void {
  if (!shop || !shop.ownerId || !shop.storeTypeId) {
    if (!shelfEl.hidden) {
      shelfEl.hidden = true;
      shelfEl.innerHTML = '';
      if (shelfEl.dataset) delete shelfEl.dataset.shelfSig;
    }
    return;
  }
  const cap = STORE_CAPACITY_BY_LEVEL[shop.level];
  const def = STORE_TYPES[shop.storeTypeId];
  const tiers: number[] = [];
  if (def) {
    for (const item of def.items) {
      const qty = Math.max(0, shop.stock[item.id] ?? 0);
      for (let q = 0; q < qty && tiers.length < cap; q++) tiers.push(item.tier);
    }
  }
  const sig = `${cap}:${tiers.join(',')}`;
  shelfEl.hidden = false;
  if (shelfEl.dataset?.shelfSig === sig) return;
  if (shelfEl.dataset) shelfEl.dataset.shelfSig = sig;

  shelfEl.innerHTML = '';
  for (let i = 0; i < cap; i++) {
    const pip = document.createElement('span');
    pip.className = i < tiers.length ? `shelf-pip tier-${tiers[i]}` : 'shelf-pip is-empty';
    shelfEl.appendChild(pip);
  }
}

export function formatTileContent(state: GameState, tile: Tile, hasMultiShaft: boolean): TileContent {
  const active = getActivePlayer(state);
  const base = { isOwned: false, isVacantShop: false, isClosed: false, closedTurns: 0, level: null };

  switch (tile.type) {
    case 'bank':
      return { ...base, name: 'BANK', stats: '$ / Pts', iconId: 'bank' };
    case 'elevator':
      return {
        ...base,
        name: hasMultiShaft ? `ELEVATOR ${tile.elevatorShaft === 1 ? 'B' : 'A'}` : 'ELEVATOR',
        stats: canPlayerUseElevator(state, active.id) ? undefined : 'LOCKED',
        iconId: 'elevator',
      };
    case 'escalator': {
      const { up, down } = tile.neighbors;
      let name = 'ESC';
      if (up && down) name = 'ESC ↕ (X)';
      else if (up) {
        if (up.byEntryDir) name = 'ESC ↑ (↖↗)';
        else {
          const dest = state.tiles[up.targetTileId];
          const arrow = up.exitHorizontalDir === 'right' ? '↗' : '↖';
          name = dest && Math.abs(dest.floor - tile.floor) > 1 ? `ESC ${arrow} ${dest.floor}F` : `ESC ${arrow}`;
        }
      } else if (down) {
        if (down.byEntryDir) name = 'ESC ↓ (↙↘)';
        else {
          const dest = state.tiles[down.targetTileId];
          const arrow = down.exitHorizontalDir === 'right' ? '↘' : '↙';
          name = dest && Math.abs(dest.floor - tile.floor) > 1 ? `ESC ${arrow} ${dest.floor}F` : `ESC ${arrow}`;
        }
      }
      return { ...base, name, iconId: 'escalator' };
    }
    case 'shop': {
      const shop = tile.shopSlotId ? state.shops[tile.shopSlotId] : undefined;
      if (!shop || !shop.ownerId || !shop.storeTypeId) {
        return { ...base, name: 'Tenant Wanted', stats: 'For Lease', iconId: 'vacant', isVacantShop: true };
      }
      const def = STORE_TYPES[shop.storeTypeId];
      const total = getShopTotalStock(shop);
      const cap = STORE_CAPACITY_BY_LEVEL[shop.level];
      const owner = state.players.find((p) => p.id === shop.ownerId);
      const doubleMult = owner && owner.doublePriceTurns > 0 ? 2 : 1;
      const mult = (state.globalSale?.priceMultiplier ?? 1) * doubleMult;
      const minPrice = getCheapestItemPrice(shop, mult);
      const priceStr = minPrice !== null ? `$${minPrice}${doubleMult > 1 ? '×2' : ''}` : 'EMPTY';
      const vis = getStoreVisual(shop.storeTypeId);
      return {
        name: def?.name ?? 'Shop',
        stats: `L${shop.level} · ${total}/${cap} · ${priceStr}`,
        iconId: vis.iconId,
        category: vis.category,
        accent: vis.accent,
        isOwned: true,
        isVacantShop: false,
        isClosed: shop.isClosedTurns > 0,
        closedTurns: shop.isClosedTurns,
        level: shop.level,
        shop,
      };
    }
  }
}
