import { STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import { getStoreVisual, STORE_ICON_PATHS } from '../config/storeVisuals';
import type { StoreIconId, StoreVisualCategory } from '../config/storeVisuals';
import { canPlayerUseElevator, getActivePlayer } from '../engine/helpers';
import { getCheapestItemPrice, getShopTotalStock } from '../engine/shops';
import { formatTimedWindowEndpoint, getTimedWindowRoundsLeft } from '../engine/timedEffects';
import type { GameState, Shop, Tile } from '../engine/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface TileContent {
  name: string;
  stats?: string;
  statsTooltip?: string;
  iconId: StoreIconId;
  category?: StoreVisualCategory;
  accent?: string;
  isOwned: boolean;
  isVacantShop: boolean;
  isClosed: boolean;
  closedRounds: number;
  closedTooltip?: string;
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

export interface EscalatorAdjacency {
  joinUp: boolean;
  joinDown: boolean;
  splitAbove: boolean;
  splitBelow: boolean;
}

export function computeEscalatorAdjacency(state: GameState, tile: Tile): EscalatorAdjacency {
  if (tile.type !== 'escalator') {
    return { joinUp: false, joinDown: false, splitAbove: false, splitBelow: false };
  }
  const hasEscAbove = state.tiles[`f${tile.floor + 1}_c${tile.col}`]?.type === 'escalator';
  const hasEscBelow = state.tiles[`f${tile.floor - 1}_c${tile.col}`]?.type === 'escalator';
  const hasUp = Boolean(tile.neighbors.up);
  const hasDown = Boolean(tile.neighbors.down);
  const upSpans = Boolean(
    tile.neighbors.up && Math.abs((state.tiles[tile.neighbors.up.targetTileId]?.floor ?? tile.floor) - tile.floor) > 1
  );
  const downSpans = Boolean(
    tile.neighbors.down &&
      Math.abs((state.tiles[tile.neighbors.down.targetTileId]?.floor ?? tile.floor) - tile.floor) > 1
  );
  return {
    joinUp: hasUp && (hasEscAbove || upSpans),
    joinDown: hasDown && (hasEscBelow || downSpans),
    splitAbove: !hasUp && hasEscAbove,
    splitBelow: !hasDown && hasEscBelow,
  };
}

export function createDecorativeCell(token: string, floor: number, col: number): HTMLElement {
  const cell = document.createElement('div');
  if (token !== '=' && token !== 'S' && token !== 'T') {
    cell.className = 'tile tile--void';
    return cell;
  }
  const isHallway = token === '=';
  cell.className = isHallway ? 'tile tile--hallway' : 'tile tile--esc-shaft';
  cell.setAttribute('aria-hidden', 'true');
  cell.title = isHallway ? '0-step mall walkway into the crossover escalator' : 'Express escalator shaft (non-stop ride)';

  const header = Object.assign(document.createElement('div'), { className: 'tile-header' });
  header.appendChild(Object.assign(document.createElement('span'), { textContent: `${floor}F:${col + 1}` }));

  const body = Object.assign(document.createElement('div'), { className: 'tile-body' });
  const titleRow = Object.assign(document.createElement('div'), { className: 'tile-title-row' });
  if (!isHallway) {
    const iconEl = Object.assign(document.createElement('span'), { className: 'tile-icon' });
    iconEl.appendChild(createStoreIconSvg('escalator'));
    titleRow.appendChild(iconEl);
  }
  titleRow.appendChild(
    Object.assign(document.createElement('div'), {
      className: 'tile-name',
      textContent: isHallway ? '← WALKWAY →' : 'EXPRESS ↕',
    })
  );
  const statsEl = Object.assign(document.createElement('div'), {
    className: 'tile-stats',
    textContent: isHallway ? 'Pass-through' : 'Tower Shaft',
  });
  body.append(titleRow, statsEl);
  cell.append(header, body, Object.assign(document.createElement('div'), { className: 'tile-tokens' }));
  return cell;
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
    if (i < tiers.length) {
      pip.className = `shelf-pip tier-${tiers[i]}`;
      pip.textContent = String(tiers[i]);
    } else {
      pip.className = 'shelf-pip is-empty';
    }
    shelfEl.appendChild(pip);
  }
}

export function formatTileContent(state: GameState, tile: Tile, hasMultiShaft: boolean): TileContent {
  const active = getActivePlayer(state);
  const base = { isOwned: false, isVacantShop: false, isClosed: false, closedRounds: 0, level: null };

  switch (tile.type) {
    case 'bank':
      return { ...base, name: 'BANK', stats: '$ / Pts', iconId: 'bank' };
    case 'elevator': {
      const locked = !canPlayerUseElevator(state, active.id) && state.elevatorLock;
      return {
        ...base,
        name: hasMultiShaft ? `ELEVATOR ${tile.elevatorShaft === 1 ? 'B' : 'A'}` : 'ELEVATOR',
        stats: locked ? `LOCKED (${getTimedWindowRoundsLeft(state, locked.timer)} rd)` : undefined,
        statsTooltip: locked ? formatTimedWindowEndpoint(state, locked.timer, 'Unlocks') : undefined,
        iconId: 'elevator',
      };
    }
    case 'escalator': {
      const { up, down } = tile.neighbors;
      const escAdj = computeEscalatorAdjacency(state, tile);
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
      const stats =
        up && down
          ? 'Fork ↑ / ↓'
          : escAdj.splitBelow
            ? 'Up only'
            : escAdj.splitAbove
              ? 'Down only'
              : undefined;
      return { ...base, name, ...(stats ? { stats } : {}), iconId: 'escalator' };
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
      const doubleMult = owner && owner.doublePriceWindow ? 2 : 1;
      const mult = (state.globalSale?.priceMultiplier ?? 1) * doubleMult;
      const minPrice = getCheapestItemPrice(shop, mult);
      const priceStr = minPrice !== null ? `$${minPrice}${doubleMult > 1 ? '×2' : ''}` : 'EMPTY';
      const vis = getStoreVisual(shop.storeTypeId);
      const closedRounds = getTimedWindowRoundsLeft(state, shop.closedWindow);
      const closedTooltip = shop.closedWindow
        ? formatTimedWindowEndpoint(state, shop.closedWindow, 'Reopens')
        : undefined;
      return {
        name: def?.name ?? 'Shop',
        stats: `L${shop.level} · ${total}/${cap} · ${priceStr}`,
        iconId: vis.iconId,
        category: vis.category,
        accent: vis.accent,
        isOwned: true,
        isVacantShop: false,
        isClosed: Boolean(shop.closedWindow),
        closedRounds,
        closedTooltip,
        level: shop.level,
        shop,
      };
    }
  }
}
