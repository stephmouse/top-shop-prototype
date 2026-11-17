import { STORE_CAPACITY_BY_LEVEL, STORE_TYPES } from '../config/balance';
import { MAP_COLS, MAP_FLOORS } from '../config/map1';
import { canPlayerUseElevator, computePlayerNetWorth, getActivePlayer } from '../engine/helpers';
import type { EndTarget, MoveOption, MovePreview } from '../engine/movePreview';
import { getCheapestItemPrice, getShopTotalStock } from '../engine/shops';
import type { GameState, Tile } from '../engine/types';

export interface BoardInteractionOptions {
  preview: MovePreview;
  onSelectNextStep: (option: MoveOption) => void;
  onSelectEndTarget: (target: EndTarget) => void;
  onHoverEndTarget?: (tileId: string | null) => void;
}

function formatTileLabel(state: GameState, tile: Tile): string {
  const active = getActivePlayer(state);
  switch (tile.type) {
    case 'bank':
      return 'BANK ($ / Pts)';
    case 'elevator':
      return canPlayerUseElevator(state, active.id) ? 'ELEVATOR' : 'ELEV [LOCKED]';
    case 'escalator': {
      const { up, down } = tile.neighbors;
      if (up && down) return 'ESC ↕ (X)';
      if (up) return up.exitHorizontalDir === 'right' ? 'ESC ↗' : 'ESC ↖';
      if (down) return down.exitHorizontalDir === 'right' ? 'ESC ↘' : 'ESC ↙';
      return 'ESC';
    }
    case 'shop': {
      const shop = tile.shopSlotId ? state.shops[tile.shopSlotId] : undefined;
      if (!shop || !shop.ownerId || !shop.storeTypeId) {
        return 'Tenant Wanted';
      }
      const def = STORE_TYPES[shop.storeTypeId];
      const total = getShopTotalStock(shop);
      const cap = STORE_CAPACITY_BY_LEVEL[shop.level];
      const mult = state.globalSale?.priceMultiplier ?? 1;
      const minPrice = getCheapestItemPrice(shop, mult);
      const priceStr = minPrice !== null ? `$${minPrice}` : 'EMPTY';
      const closed = shop.isClosedTurns > 0 ? ' [CLOSED]' : '';
      return `${def?.name ?? 'Shop'} L${shop.level}${closed}\n${total}/${cap} | ${priceStr}`;
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
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${MAP_COLS}, minmax(0, 1fr))`;

  const activePlayer = getActivePlayer(state);
  const nextByTile = new Map(
    (interaction?.preview.nextTiles ?? []).map((opt) => [opt.tileId, opt])
  );
  const endByTile = new Map(
    (interaction?.preview.endTargets ?? []).map((target) => [target.tileId, target])
  );

  for (let floor = MAP_FLOORS; floor >= 1; floor--) {
    for (let col = 0; col < MAP_COLS; col++) {
      const tile = findTileAt(state, floor, col);
      const cell = document.createElement('div');
      if (!tile) {
        cell.className = 'tile';
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
      }
      cell.appendChild(header);

      const body = document.createElement('div');
      body.className = 'tile-body';
      body.style.whiteSpace = 'pre-line';
      body.textContent = formatTileLabel(state, tile);
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

export function renderTokensOverlay(
  tokensLayer: HTMLElement,
  boardGrid: HTMLElement,
  state: GameState
): void {
  const activeIds = new Set(state.players.filter((p) => !p.isBankrupt).map((p) => p.id));

  for (const child of Array.from(tokensLayer.children)) {
    const el = child as HTMLElement;
    if (!el.dataset.playerId || !activeIds.has(el.dataset.playerId)) {
      el.remove();
    }
  }

  const slotCounters: Record<string, number> = {};

  state.players.forEach((player, idx) => {
    if (player.isBankrupt) return;

    const tileEl = boardGrid.querySelector<HTMLElement>(`[data-tile-id="${player.tileId}"]`);
    if (!tileEl) return;

    const slotIdx = slotCounters[player.tileId] ?? 0;
    slotCounters[player.tileId] = slotIdx + 1;

    const x = tileEl.offsetLeft + 8 + (slotIdx % 4) * 21;
    const y = tileEl.offsetTop + tileEl.offsetHeight - 28 - Math.floor(slotIdx / 4) * 20;

    let token = tokensLayer.querySelector<HTMLElement>(`[data-player-id="${player.id}"]`);
    const isNew = !token;
    if (!token) {
      token = document.createElement('span');
      token.dataset.playerId = player.id;
      token.style.backgroundColor = player.color;
      token.textContent = String(idx + 1);
      token.title = player.name;
    }

    token.className = `token token-floating${idx === state.activePlayerIndex ? ' is-turn' : ''}`;
    token.style.transform = `translate(${x}px, ${y}px)`;
    if (isNew) {
      tokensLayer.appendChild(token);
    }
  });
}

export function renderPlayersHud(container: HTMLElement, state: GameState): void {
  container.innerHTML = '';

  state.players.forEach((player, idx) => {
    const isActive = idx === state.activePlayerIndex;
    const card = document.createElement('div');
    card.className = `player-card${isActive ? ' is-active' : ''}`;
    card.style.borderColor = isActive ? player.color : '';

    const netWorth = computePlayerNetWorth(state, player.id);
    const hArrow =
      player.horizontalDir === 'left' ? '←' : player.horizontalDir === 'right' ? '→' : '?';
    const vArrow =
      player.verticalDir === 'up' ? '↑' : player.verticalDir === 'down' ? '↓' : '?';

    const head = document.createElement('div');
    head.className = 'player-card-head';
    head.innerHTML = `<span style="color:${player.color}">P${idx + 1} ${player.name}</span><span>${
      player.isBankrupt ? 'BANKRUPT' : `Pts: ${player.points}`
    }</span>`;

    const stats = document.createElement('div');
    stats.textContent = `Cash: $${player.cash} | Net: $${netWorth} | Dir: ${hArrow} ${vArrow}`;

    card.appendChild(head);
    card.appendChild(stats);
    container.appendChild(card);
  });
}