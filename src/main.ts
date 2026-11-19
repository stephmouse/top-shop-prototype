import { DEFAULT_STAGE_ID } from './config/maps';
import type { StageId } from './config/maps';
import type { DirectionChoice, GameAction } from './engine/actions';
import { getActivePlayer } from './engine/helpers';
import { computeMovePreview } from './engine/movePreview';
import { applyAction, createInitialGameState } from './engine/state';
import type { GameState } from './engine/types';
import { renderActionPanel } from './ui/actionPanel';
import { renderBoard, renderPlayersHud, renderTokensOverlay } from './ui/boardView';
import { bindKeyboardControls } from './ui/keyboard';
import { renderRouteOverlay } from './ui/routeOverlay';
import { createTopbar } from './ui/topbar';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

let autoStepEnabled = false;
let showRoutes = true;
let hoveredEndTileId: string | null = null;
let stepTimer: number | null = null;
let guidedWalkActive = false;
let guidedChoices: DirectionChoice[] = [];
let selectedStageId: StageId = DEFAULT_STAGE_ID;
let selectedPlayerCount = 2;

function buildPlayers(count: number) {
  return Array.from({ length: count }, (_, idx) => ({ name: `Player ${idx + 1}` }));
}

function createMatchState(count: number, stageId: StageId): GameState {
  return createInitialGameState(buildPlayers(count), {}, Date.now() & 0xffffff, stageId);
}

let state: GameState = createMatchState(selectedPlayerCount, selectedStageId);

const shell = document.createElement('div');
shell.className = 'app-shell';

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

function startNewMatch(count: number, stageId: StageId): void {
  cancelGuidedWalk();
  tokensLayerEl.innerHTML = '';
  selectedPlayerCount = count;
  selectedStageId = stageId;
  state = createMatchState(count, stageId);
  render();
}

const topbar = createTopbar({
  initialShowRoutes: showRoutes,
  initialAutoStep: autoStepEnabled,
  initialStageId: selectedStageId,
  onToggleRoutes: (show) => {
    showRoutes = show;
    renderRouteOverlay(routeSvgEl, boardEl, state, computeMovePreview(state), showRoutes, hoveredEndTileId);
  },
  onToggleAutoStep: (enabled) => {
    autoStepEnabled = enabled;
    scheduleMovementTick();
  },
  onSelectStage: (stageId) => startNewMatch(selectedPlayerCount, stageId),
  onNewMatch: (count) => startNewMatch(count, selectedStageId),
});

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

bindKeyboardControls({
  getState: () => state,
  getActionBox: () => actionBox,
  dispatch,
  isMovingPhase,
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
  if (boardStageEl.scrollWidth > boardStageEl.clientWidth) {
    const activeTileId = getActivePlayer(state).tileId;
    const activeTileEl = boardEl.querySelector<HTMLElement>(`[data-tile-id="${activeTileId}"]`);
    if (activeTileEl) {
      const targetLeft =
        activeTileEl.offsetLeft - boardStageEl.clientWidth / 2 + activeTileEl.offsetWidth / 2;
      boardStageEl.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
    }
  }
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
