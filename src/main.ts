import type { DirectionChoice, GameAction } from './engine/actions';
import { canCancelMove, getActivePlayer, getAvailableDirections } from './engine/helpers';
import { computeMovePreview } from './engine/movePreview';
import { applyAction, createInitialGameState } from './engine/state';
import type { GameState } from './engine/types';
import { renderActionPanel } from './ui/actionPanel';
import { renderBoard, renderPlayersHud, renderTokensOverlay } from './ui/boardView';
import { renderRouteOverlay } from './ui/routeOverlay';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

let autoStepEnabled = false;
let showRoutes = true;
let hoveredEndTileId: string | null = null;
let stepTimer: number | null = null;
let guidedWalkActive = false;
let guidedChoices: DirectionChoice[] = [];

function buildPlayers(count: number) {
  return Array.from({ length: count }, (_, idx) => ({ name: `Player ${idx + 1}` }));
}

let state: GameState = createInitialGameState(buildPlayers(2), {}, Date.now() & 0xffffff);

const shell = document.createElement('div');
shell.className = 'app-shell';

const topbar = document.createElement('header');
topbar.className = 'topbar';

const title = document.createElement('div');
title.className = 'topbar-title';
title.textContent = 'TOP SHOP PROTOTYPE — Move: Arrows/WASD, Click Tiles, Esc: Reset';

const controls = document.createElement('div');
controls.className = 'topbar-controls';

const routesLabel = document.createElement('label');
const routesCheckbox = document.createElement('input');
routesCheckbox.type = 'checkbox';
routesCheckbox.checked = showRoutes;
routesCheckbox.addEventListener('change', () => {
  showRoutes = routesCheckbox.checked;
  renderRouteOverlay(routeSvgEl, boardEl, state, computeMovePreview(state), showRoutes, hoveredEndTileId);
});
routesLabel.appendChild(routesCheckbox);
routesLabel.append(' Routes');
controls.appendChild(routesLabel);

const autoStepLabel = document.createElement('label');
const autoStepCheckbox = document.createElement('input');
autoStepCheckbox.type = 'checkbox';
autoStepCheckbox.checked = autoStepEnabled;
autoStepCheckbox.addEventListener('change', () => {
  autoStepEnabled = autoStepCheckbox.checked;
  scheduleMovementTick();
});
autoStepLabel.appendChild(autoStepCheckbox);
autoStepLabel.append(' Auto-Move');
controls.appendChild(autoStepLabel);

for (const count of [2, 3, 4]) {
  const btn = document.createElement('button');
  btn.textContent = `New ${count}P`;
  btn.addEventListener('click', () => {
    cancelGuidedWalk();
    tokensLayerEl.innerHTML = '';
    state = createInitialGameState(buildPlayers(count), {}, Date.now() & 0xffffff);
    render();
  });
  controls.appendChild(btn);
}

topbar.appendChild(title);
topbar.appendChild(controls);

const hudEl = document.createElement('section');
hudEl.className = 'hud-row';

const boardStageEl = document.createElement('section');
boardStageEl.className = 'board-stage';
const boardEl = document.createElement('div');
boardEl.className = 'board-grid';
const routeSvgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
routeSvgEl.setAttribute('class', 'route-layer');
const tokensLayerEl = document.createElement('div');
tokensLayerEl.className = 'tokens-layer';
boardStageEl.appendChild(boardEl);
boardStageEl.appendChild(routeSvgEl);
boardStageEl.appendChild(tokensLayerEl);

const bottomGrid = document.createElement('section');
bottomGrid.className = 'bottom-grid';

const actionBox = document.createElement('div');
actionBox.className = 'panel-box';

const logBox = document.createElement('div');
logBox.className = 'panel-box';
const logTitle = document.createElement('h3');
logTitle.className = 'panel-title';
logTitle.textContent = 'Match Log';
const logList = document.createElement('ol');
logList.className = 'log-list';
logBox.appendChild(logTitle);
logBox.appendChild(logList);

bottomGrid.appendChild(actionBox);
bottomGrid.appendChild(logBox);

shell.appendChild(topbar);
shell.appendChild(hudEl);
shell.appendChild(boardStageEl);
shell.appendChild(bottomGrid);
root.appendChild(shell);

function clearStepTimer(): void {
  if (stepTimer !== null) {
    window.clearTimeout(stepTimer);
    stepTimer = null;
  }
}

function cancelGuidedWalk(): void {
  clearStepTimer();
  guidedWalkActive = false;
  guidedChoices = [];
}

function isMovingPhase(phase: GameState['phase']): boolean {
  return (
    phase === 'STEPPING' ||
    phase === 'ESCALATOR_RIDE' ||
    phase === 'ESCALATOR_UNDO' ||
    phase === 'CHOOSE_DIRECTION'
  );
}

function stepGuidedOrAuto(): void {
  if (state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO') {
    state = applyAction(state, { type: 'ADVANCE_STEP' });
    render();
    return;
  }

  if (guidedWalkActive) {
    if (state.phase === 'CHOOSE_DIRECTION' && guidedChoices.length > 0) {
      const nextDir = guidedChoices.shift()!;
      state = applyAction(state, { type: 'CHOOSE_DIRECTION', direction: nextDir });
      render();
      return;
    }
    if (state.phase === 'STEPPING') {
      state = applyAction(state, { type: 'ADVANCE_STEP' });
      render();
      return;
    }
    cancelGuidedWalk();
    return;
  }

  if (autoStepEnabled && state.phase === 'STEPPING') {
    state = applyAction(state, { type: 'ADVANCE_STEP' });
    render();
  }
}

function scheduleMovementTick(): void {
  clearStepTimer();
  if (!isMovingPhase(state.phase)) {
    guidedWalkActive = false;
    guidedChoices = [];
    return;
  }
  const shouldTick =
    guidedWalkActive ||
    state.phase === 'ESCALATOR_RIDE' ||
    state.phase === 'ESCALATOR_UNDO' ||
    (autoStepEnabled && state.phase === 'STEPPING');
  if (shouldTick) {
    stepTimer = window.setTimeout(stepGuidedOrAuto, 210);
  }
}

function dispatch(action: GameAction): void {
  cancelGuidedWalk();
  hoveredEndTileId = null;
  state = applyAction(state, action);
  render();
}

function keyToDirection(key: string): DirectionChoice | null {
  switch (key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 'left';
    case 'ArrowRight':
    case 'd':
    case 'D':
      return 'right';
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'up';
    case 'ArrowDown':
    case 's':
    case 'S':
      return 'down';
    default:
      return null;
  }
}

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  if ((e.key === 'Escape' || e.key === 'Backspace') && canCancelMove(state)) {
    e.preventDefault();
    dispatch({ type: 'CANCEL_MOVE' });
    return;
  }

  if (!isMovingPhase(state.phase) || state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO') {
    return;
  }

  const active = getActivePlayer(state);
  const dirKey = keyToDirection(e.key);
  const oppositeHorizontal =
    active.horizontalDir === 'left' ? 'right' : active.horizontalDir === 'right' ? 'left' : null;

  if (
    dirKey &&
    oppositeHorizontal === dirKey &&
    canCancelMove(state) &&
    (state.phase === 'STEPPING' || !getAvailableDirections(state, active).includes(dirKey))
  ) {
    e.preventDefault();
    dispatch({ type: 'UNDO_STEP' });
    return;
  }

  if (state.phase === 'CHOOSE_DIRECTION' && dirKey) {
    if (getAvailableDirections(state, active).includes(dirKey)) {
      e.preventDefault();
      dispatch({ type: 'CHOOSE_DIRECTION', direction: dirKey });
    }
    return;
  }

  if (state.phase === 'STEPPING') {
    if (e.key === ' ' || e.key === 'Enter' || (dirKey && dirKey === active.horizontalDir)) {
      e.preventDefault();
      dispatch({ type: 'ADVANCE_STEP' });
    }
  }
});

function render(): void {
  const preview = computeMovePreview(state);
  renderPlayersHud(hudEl, state);
  renderBoard(boardEl, state, {
    preview,
    onSelectNextStep: (opt) => {
      if (state.phase === 'CHOOSE_DIRECTION' && opt.direction) {
        dispatch({ type: 'CHOOSE_DIRECTION', direction: opt.direction });
      } else {
        dispatch({ type: 'ADVANCE_STEP' });
      }
    },
    onSelectEndTarget: (target) => {
      cancelGuidedWalk();
      hoveredEndTileId = null;
      guidedChoices = [...target.queuedChoices];
      guidedWalkActive = true;
      stepGuidedOrAuto();
    },
    onHoverEndTarget: (tileId) => {
      hoveredEndTileId = tileId;
      renderRouteOverlay(routeSvgEl, boardEl, state, preview, showRoutes, hoveredEndTileId);
    },
  });
  renderRouteOverlay(routeSvgEl, boardEl, state, preview, showRoutes, hoveredEndTileId);
  renderTokensOverlay(tokensLayerEl, boardEl, state);
  renderActionPanel(actionBox, state, dispatch);

  logList.innerHTML = '';
  for (const entry of state.log) {
    const li = document.createElement('li');
    li.textContent = entry;
    logList.appendChild(li);
  }

  scheduleMovementTick();
}

window.addEventListener('resize', () => {
  renderRouteOverlay(routeSvgEl, boardEl, state, computeMovePreview(state), showRoutes, hoveredEndTileId);
  renderTokensOverlay(tokensLayerEl, boardEl, state);
});

render();