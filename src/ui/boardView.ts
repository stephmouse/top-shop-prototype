import { getStageDef } from '../config/maps';
import type { StageId } from '../config/maps';
import type { StoreIconId } from '../config/storeVisuals';
import { getActivePlayer } from '../engine/helpers';
import type { EndTarget, MoveOption, MovePreview } from '../engine/movePreview';
import type { GameState, Tile } from '../engine/types';
import type { BoardShopPickSpec } from './boardPickState';
import {
  computeChainAdjacency,
  computeEscalatorAdjacency,
  createDecorativeCell,
  createStoreIconSvg,
  formatTileContent,
  updateShopShelf,
} from './storeTileView';

export { renderTokensOverlay } from './hudView';
export { renderPlayersHud } from './playerCardView';

export interface BoardInteractionOptions {
  preview: MovePreview;
  shopPick?: BoardShopPickSpec | null;
  onSelectNextStep: (option: MoveOption) => void;
  onSelectEndTarget: (target: EndTarget) => void;
  onHoverEndTarget?: (tileId: string | null) => void;
}

interface TileDomRef {
  cell: HTMLElement;
  awningEl: HTMLElement;
  badgeEl: HTMLSpanElement;
  iconEl: HTMLElement;
  nameEl: HTMLElement;
  statsEl: HTMLElement;
  shelfEl: HTMLElement;
  shutterEl: HTMLElement;
  lastIconId?: StoreIconId;
}

interface BoardDomCache {
  stageSignature: string;
  tileRefs: Map<string, TileDomRef>;
  currentInteraction?: BoardInteractionOptions;
  nextByTile: Map<string, MoveOption>;
  endByTile: Map<string, EndTarget>;
}

const boardCacheMap = new WeakMap<HTMLElement, BoardDomCache>();

export function getBoardTileElement(boardGrid: HTMLElement, tileId: string): HTMLElement | undefined {
  const cached = boardCacheMap.get(boardGrid)?.tileRefs.get(tileId)?.cell;
  if (cached) return cached;
  return Array.from(boardGrid.children).find((el) => (el as HTMLElement).dataset?.tileId === tileId) as
    | HTMLElement
    | undefined;
}

function findTileAt(state: GameState, floor: number, col: number): Tile | undefined {
  return Object.values(state.tiles).find((t) => t.floor === floor && t.col === col);
}

function setClassesKeepingFx(el: HTMLElement, baseClasses: string[]): void {
  const fxClasses = (el.className || '').split(/\s+/).filter((c) => c.startsWith('fx-'));
  el.className = [...baseClasses, ...fxClasses].join(' ');
}

function mountBoardTiles(container: HTMLElement, state: GameState, cols: number, floors: number, sig: string): BoardDomCache {
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${cols}, minmax(104px, 1fr))`;
  container.style.setProperty('--board-cols', String(cols));

  const cache: BoardDomCache = { stageSignature: sig, tileRefs: new Map(), nextByTile: new Map(), endByTile: new Map() };
  const stageGrid = getStageDef(state.mapId as StageId).rows.map((r) => r.trim().split(/\s+/));

  for (let floor = floors; floor >= 1; floor--) {
    for (let col = 0; col < cols; col++) {
      const tile = findTileAt(state, floor, col);
      if (!tile) {
        container.appendChild(createDecorativeCell(stageGrid[floors - floor]?.[col] ?? '.', floor, col));
        continue;
      }
      const cell = document.createElement('div');

      cell.className = `tile tile--${tile.type}`;
      cell.dataset.tileId = tile.id;
      cell.dataset.floorParity = floor % 2 === 0 ? 'even' : 'odd';

      const awningEl = document.createElement('div');
      awningEl.className = 'tile-awning';
      awningEl.hidden = true;

      const header = document.createElement('div');
      header.className = 'tile-header';
      const coord = document.createElement('span');
      coord.textContent = `${tile.floor}F:${tile.col + 1}`;
      const badgeEl = document.createElement('span');
      badgeEl.className = 'tile-badge';
      badgeEl.hidden = true;
      header.append(coord, badgeEl);

      const body = document.createElement('div');
      body.className = 'tile-body';
      const titleRow = document.createElement('div');
      titleRow.className = 'tile-title-row';
      const iconEl = document.createElement('span');
      iconEl.className = 'tile-icon';
      const nameEl = document.createElement('div');
      nameEl.className = 'tile-name';
      titleRow.append(iconEl, nameEl);

      const statsEl = document.createElement('div');
      statsEl.className = 'tile-stats';
      statsEl.hidden = true;
      const shelfEl = document.createElement('div');
      shelfEl.className = 'tile-shelf';
      shelfEl.hidden = true;
      body.append(titleRow, statsEl, shelfEl);

      const spacer = document.createElement('div');
      spacer.className = 'tile-tokens';

      const shutterEl = document.createElement('div');
      shutterEl.className = 'tile-shutter';
      shutterEl.textContent = 'CLOSED';

      cell.append(awningEl, header, body, spacer, shutterEl);

      cell.addEventListener('click', () => {
        const inter = cache.currentInteraction;
        if (!inter) return;
        const pick = inter.shopPick;
        if (pick) {
          if (tile.shopSlotId && pick.selectableShopIds.has(tile.shopSlotId)) pick.onSelectShop(tile.shopSlotId);
          return;
        }
        const end = cache.endByTile.get(tile.id);
        if (end) inter.onSelectEndTarget(end);
        else { const next = cache.nextByTile.get(tile.id); if (next) inter.onSelectNextStep(next); }
      });
      cell.addEventListener('mouseenter', () => {
        if (cache.endByTile.has(tile.id)) cache.currentInteraction?.onHoverEndTarget?.(tile.id);
      });
      cell.addEventListener('mouseleave', () => {
        if (cache.endByTile.has(tile.id)) cache.currentInteraction?.onHoverEndTarget?.(null);
      });

      cache.tileRefs.set(tile.id, { cell, awningEl, badgeEl, iconEl, nameEl, statsEl, shelfEl, shutterEl });
      container.appendChild(cell);
    }
  }

  boardCacheMap.set(container, cache);
  return cache;
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
  const sig = `${state.mapId}:${cols}x${floors}:${tileValues.length}`;

  let cache = boardCacheMap.get(container);
  if (!cache || cache.stageSignature !== sig) {
    cache = mountBoardTiles(container, state, cols, floors, sig);
  }

  cache.currentInteraction = interaction;
  cache.nextByTile = new Map((interaction?.preview.nextTiles ?? []).map((opt) => [opt.tileId, opt]));
  cache.endByTile = new Map((interaction?.preview.endTargets ?? []).map((target) => [target.tileId, target]));

  const activePlayer = getActivePlayer(state);
  const pick = interaction?.shopPick;

  for (const tile of tileValues) {
    const ref = cache.tileRefs.get(tile.id);
    if (!ref) continue;

    const { cell, awningEl, badgeEl, iconEl, nameEl, statsEl, shelfEl, shutterEl } = ref;
    const isActiveTile = activePlayer.tileId === tile.id;
    const nextOpt = cache.nextByTile.get(tile.id);
    const endTarget = cache.endByTile.get(tile.id);
    const pickTarget = Boolean(pick && tile.shopSlotId && pick.selectableShopIds.has(tile.shopSlotId));
    const pickSelected = Boolean(pickTarget && tile.shopSlotId === pick?.selectedShopId);
    const pickHovered = Boolean(pickTarget && tile.shopSlotId === pick?.hoveredShopId);
    const content = formatTileContent(state, tile, hasMultiShaft);
    const { chainLeft, chainRight } = computeChainAdjacency(state, tile, content.shop);
    const escAdj = computeEscalatorAdjacency(state, tile);

    const classes = ['tile', `tile--${tile.type}`];
    if (isActiveTile) classes.push('active-tile');
    if (nextOpt && !endTarget) classes.push('tile--next-step');
    if (endTarget) classes.push('tile--end-target');
    if (pickTarget) classes.push('tile--pick-target');
    if (pickSelected) classes.push('tile--pick-selected');
    if (pickHovered) classes.push('tile--pick-hover');
    if (pick && !pickTarget) classes.push('tile--pick-dim');
    if (content.isOwned) classes.push('is-owned');
    if (content.isVacantShop) classes.push('is-vacant');
    if (content.isClosed) classes.push('is-closed');
    if (chainLeft) classes.push('chain-left');
    if (chainRight) classes.push('chain-right');
    if (escAdj.joinUp) classes.push('esc-join-up');
    if (escAdj.joinDown) classes.push('esc-join-down');
    if (escAdj.splitAbove) classes.push('esc-split-above');
    if (escAdj.splitBelow) classes.push('esc-split-below');
    if (content.level) classes.push(`chain-l${content.level}`);
    if (content.category) classes.push(`cat-${content.category}`);
    setClassesKeepingFx(cell, classes);
    cell.title = escAdj.splitBelow
      ? 'Separate escalator flight — does not connect to the floor below'
      : escAdj.splitAbove
        ? 'Separate escalator flight — does not connect to the floor above'
        : '';

    const owner = content.shop?.ownerId ? state.players.find((p) => p.id === content.shop?.ownerId) : undefined;
    cell.style.borderBottom = owner ? `4px solid ${owner.color}` : '';
    if (owner) cell.style.setProperty?.('--owner-color', owner.color);
    else cell.style.removeProperty?.('--owner-color');
    if (content.accent) cell.style.setProperty?.('--cat-accent', content.accent);
    else cell.style.removeProperty?.('--cat-accent');

    awningEl.hidden = !content.isOwned;
    if (ref.lastIconId !== content.iconId) {
      iconEl.innerHTML = '';
      iconEl.appendChild(createStoreIconSvg(content.iconId));
      ref.lastIconId = content.iconId;
    }

    const badge = pickSelected
      ? ['tile-badge badge-confirm', pick!.selectedBadgeText]
      : pickTarget
        ? ['tile-badge badge-pick', pick!.badgeText]
        : endTarget
          ? ['tile-badge badge-land', 'LAND']
          : nextOpt
            ? ['tile-badge badge-step', nextOpt.direction ? nextOpt.direction.toUpperCase() : 'STEP']
            : content.isClosed
              ? ['tile-badge badge-closed', 'CLOSED']
              : null;
    badgeEl.hidden = !badge;
    if (badge) { badgeEl.className = badge[0]!; badgeEl.textContent = badge[1]!; }

    nameEl.textContent = content.name;
    statsEl.textContent = content.stats ?? '';
    statsEl.hidden = !content.stats;
    updateShopShelf(shelfEl, content.shop);
    shutterEl.textContent = content.isClosed ? `CLOSED (${content.closedTurns}T)` : 'CLOSED';
  }
}
