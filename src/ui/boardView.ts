import { STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import { canPlayerUseElevator, getActivePlayer } from '../engine/helpers';
import type { EndTarget, MoveOption, MovePreview } from '../engine/movePreview';
import { getCheapestItemPrice, getShopTotalStock } from '../engine/shops';
import type { GameState, Tile } from '../engine/types';

export { renderPlayersHud, renderTokensOverlay } from './hudView';

export interface BoardInteractionOptions {
  preview: MovePreview;
  onSelectNextStep: (option: MoveOption) => void;
  onSelectEndTarget: (target: EndTarget) => void;
  onHoverEndTarget?: (tileId: string | null) => void;
}

interface TileContent {
  name: string;
  stats?: string;
  isClosed?: boolean;
}

function formatTileContent(state: GameState, tile: Tile, hasMultiShaft: boolean): TileContent {
  const active = getActivePlayer(state);
  switch (tile.type) {
    case 'bank':
      return { name: 'BANK', stats: '$ / Pts' };
    case 'elevator':
      return {
        name: hasMultiShaft ? `ELEVATOR ${tile.elevatorShaft === 1 ? 'B' : 'A'}` : 'ELEVATOR',
        stats: canPlayerUseElevator(state, active.id) ? undefined : 'LOCKED',
      };
    case 'escalator': {
      const { up, down } = tile.neighbors;
      if (up && down) return { name: 'ESC ↕ (X)' };
      if (up) {
        if (up.byEntryDir) return { name: 'ESC ↑ (↖↗)' };
        const dest = state.tiles[up.targetTileId];
        if (dest && Math.abs(dest.floor - tile.floor) > 1) {
          return { name: up.exitHorizontalDir === 'right' ? `ESC ↗ ${dest.floor}F` : `ESC ↖ ${dest.floor}F` };
        }
        return { name: up.exitHorizontalDir === 'right' ? 'ESC ↗' : 'ESC ↖' };
      }
      if (down) {
        if (down.byEntryDir) return { name: 'ESC ↓ (↙↘)' };
        const dest = state.tiles[down.targetTileId];
        if (dest && Math.abs(dest.floor - tile.floor) > 1) {
          return { name: down.exitHorizontalDir === 'right' ? `ESC ↘ ${dest.floor}F` : `ESC ↙ ${dest.floor}F` };
        }
        return { name: down.exitHorizontalDir === 'right' ? 'ESC ↘' : 'ESC ↙' };
      }
      return { name: 'ESC' };
    }
    case 'shop': {
      const shop = tile.shopSlotId ? state.shops[tile.shopSlotId] : undefined;
      if (!shop || !shop.ownerId || !shop.storeTypeId) {
        return { name: 'Tenant Wanted' };
      }
      const def = STORE_TYPES[shop.storeTypeId];
      const total = getShopTotalStock(shop);
      const cap = STORE_CAPACITY_BY_LEVEL[shop.level];
      const owner = state.players.find((p) => p.id === shop.ownerId);
      const doubleMult = owner && owner.doublePriceTurns > 0 ? 2 : 1;
      const mult = (state.globalSale?.priceMultiplier ?? 1) * doubleMult;
      const minPrice = getCheapestItemPrice(shop, mult);
      const priceStr = minPrice !== null ? `$${minPrice}${doubleMult > 1 ? '×2' : ''}` : 'EMPTY';
      return {
        name: def?.name ?? 'Shop',
        stats: `L${shop.level} · ${total}/${cap} · ${priceStr}`,
        isClosed: shop.isClosedTurns > 0,
      };
    }
  }
}

function findTileAt(state: GameState, floor: number, col: number): Tile | undefined {
  return Object.values(state.tiles).find((t) => t.floor === floor && t.col === col);
}

export function renderBoard(
  container: HTMLElement,
  state: GameState,
  interaction?: BoardInteractionOptions
): void {
  const tileValues = Object.values(state.tiles);
  const cols = Math.max(1, ...tileValues.map((t) => t.col + 1));
  const floors = Math.max(1, ...tileValues.map((t) => t.floor));
  const hasMultiShaft =
    new Set(tileValues.filter((t) => t.type === 'elevator').map((t) => t.elevatorShaft ?? 0)).size > 1;

  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${cols}, minmax(104px, 1fr))`;

  const activePlayer = getActivePlayer(state);
  const nextByTile = new Map(
    (interaction?.preview.nextTiles ?? []).map((opt) => [opt.tileId, opt])
  );
  const endByTile = new Map(
    (interaction?.preview.endTargets ?? []).map((target) => [target.tileId, target])
  );

  for (let floor = floors; floor >= 1; floor--) {
    for (let col = 0; col < cols; col++) {
      const tile = findTileAt(state, floor, col);
      const cell = document.createElement('div');
      if (!tile) {
        cell.className = 'tile tile--void';
        container.appendChild(cell);
        continue;
      }

      const isActiveTile = activePlayer.tileId === tile.id;
      const nextOpt = nextByTile.get(tile.id);
      const endTarget = endByTile.get(tile.id);

      const classes = ['tile', `tile--${tile.type}`];
      if (isActiveTile) classes.push('active-tile');
      if (nextOpt && !endTarget) classes.push('tile--next-step');
      if (endTarget) classes.push('tile--end-target');

      cell.className = classes.join(' ');
      cell.dataset.tileId = tile.id;

      if (tile.type === 'shop' && tile.shopSlotId) {
        const shop = state.shops[tile.shopSlotId];
        const owner = shop?.ownerId
          ? state.players.find((p) => p.id === shop.ownerId)
          : undefined;
        if (owner) {
          cell.style.borderBottom = `4px solid ${owner.color}`;
        }
      }

      const content = formatTileContent(state, tile, hasMultiShaft);

      const header = document.createElement('div');
      header.className = 'tile-header';
      const coord = document.createElement('span');
      coord.textContent = `${tile.floor}F:${tile.col + 1}`;
      header.appendChild(coord);

      if (endTarget) {
        const badge = document.createElement('span');
        badge.className = 'tile-badge badge-land';
        badge.textContent = 'LAND';
        header.appendChild(badge);
      } else if (nextOpt) {
        const badge = document.createElement('span');
        badge.className = 'tile-badge badge-step';
        badge.textContent = nextOpt.direction ? nextOpt.direction.toUpperCase() : 'STEP';
        header.appendChild(badge);
      } else if (content.isClosed) {
        const badge = document.createElement('span');
        badge.className = 'tile-badge badge-closed';
        badge.textContent = 'CLOSED';
        header.appendChild(badge);
      }
      cell.appendChild(header);

      const body = document.createElement('div');
      body.className = 'tile-body';
      const nameEl = document.createElement('div');
      nameEl.className = 'tile-name';
      nameEl.textContent = content.name;
      body.appendChild(nameEl);
      if (content.stats) {
        const statsEl = document.createElement('div');
        statsEl.className = 'tile-stats';
        statsEl.textContent = content.stats;
        body.appendChild(statsEl);
      }
      cell.appendChild(body);

      const spacer = document.createElement('div');
      spacer.className = 'tile-tokens';
      cell.appendChild(spacer);

      if (interaction && (endTarget || nextOpt)) {
        cell.addEventListener('click', () => {
          if (endTarget) {
            interaction.onSelectEndTarget(endTarget);
          } else if (nextOpt) {
            interaction.onSelectNextStep(nextOpt);
          }
        });
      }

      if (interaction?.onHoverEndTarget && endTarget) {
        cell.addEventListener('mouseenter', () => interaction.onHoverEndTarget?.(tile.id));
        cell.addEventListener('mouseleave', () => interaction.onHoverEndTarget?.(null));
      }

      container.appendChild(cell);
    }
  }
}
