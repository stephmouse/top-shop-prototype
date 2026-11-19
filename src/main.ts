import { PLAYER_COLORS } from './config/balance';
import type { StageId } from './config/maps';
import type { DirectionChoice, GameAction } from './engine/actions';
import { getActivePlayer } from './engine/helpers';
import { computeMovePreview } from './engine/movePreview';
import { applyAction, createInitialGameState } from './engine/state';
import type { GameState } from './engine/types';
import { renderActionPanel } from './ui/actionPanel';
import { renderBoard, renderPlayersHud, renderTokensOverlay } from './ui/boardView';
import { bindKeyboardControls } from './ui/keyboard';
import {
  extractSetupFromState, loadAutoSavedMatch, loadManualMatchSlot, loadStoredSetup,
  sanitizeMatchSetup, saveAutoSavedMatch, saveManualMatchSlot, saveStoredSetup,
} from './ui/persistence';
import type { MatchSetupData } from './ui/persistence';
import { renderRouteOverlay } from './ui/routeOverlay';
import { createSetupModal } from './ui/setupModal';
import { createTopbar } from './ui/topbar';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

let autoStepEnabled = false;
let showRoutes = true;
let hoveredEndTileId: string | null = null;
let stepTimer: number | null = null;
let guidedWalkActive = false;
let guidedChoices: DirectionChoice[] = [];

const autoSaved = loadAutoSavedMatch();
let currentSetup: MatchSetupData = autoSaved ? extractSetupFromState(autoSaved) : loadStoredSetup();
let state: GameState =
  autoSaved ??
  createInitialGameState(currentSetup.players, currentSetup.config, Date.now() & 0xffffff, currentSetup.stageId);

const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, textContent = '') =>
  Object.assign(document.createElement(tag), { className, textContent });

const shell = mk('div', 'app-shell');
const hudEl = mk('section', 'hud-row');
const boardStageEl = mk('section', 'board-stage');
const boardEl = mk('div', 'board-grid');
const routeSvgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
routeSvgEl.setAttribute('class', 'route-layer');
const tokensLayerEl = mk('div', 'tokens-layer');
boardStageEl.append(boardEl, routeSvgEl, tokensLayerEl);

const bottomGrid = mk('section', 'bottom-grid');
const actionBox = mk('div', 'panel-box');
const logBox = mk('div', 'panel-box');
const logList = mk('ol', 'log-list');
logBox.append(mk('h3', 'panel-title', 'Match Log'), logList);
bottomGrid.append(actionBox, logBox);

function commitMatchState(nextState: GameState, nextSetup: MatchSetupData): void {
  cancelGuidedWalk();
  hoveredEndTileId = null;
  tokensLayerEl.innerHTML = '';
  state = nextState;
  currentSetup = nextSetup;
  saveStoredSetup(nextSetup);
  saveAutoSavedMatch(state);
  render();
}

function startMatchFromSetup(setup: MatchSetupData): void {
  const clean = sanitizeMatchSetup(setup) ?? currentSetup;
  const fresh = createInitialGameState(clean.players, clean.config, Date.now() & 0xffffff, clean.stageId);
  commitMatchState(fresh, clean);
}

function loadSavedState(savedState: GameState): void {
  commitMatchState(savedState, extractSetupFromState(savedState));
}

function saveCurrentMatch() {
  const env = saveManualMatchSlot(state);
  setupModal.refreshSaveStatus();
  topbar.sync(state.mapId as StageId, true);
  return env;
}

const setupModal = createSetupModal({
  initialSetup: currentSetup,
  onStartMatch: startMatchFromSetup,
  onSaveMatch: saveCurrentMatch,
  onLoadMatch: loadSavedState,
});

const topbar = createTopbar({
  initialShowRoutes: showRoutes,
  initialAutoStep: autoStepEnabled,
  initialStageId: state.mapId as StageId,
  onToggleRoutes: (show) => {
    showRoutes = show;
    renderRouteOverlay(routeSvgEl, boardEl, state, computeMovePreview(state), showRoutes, hoveredEndTileId);
  },
  onToggleAutoStep: (enabled) => {
    autoStepEnabled = enabled;
    scheduleMovementTick();
  },
  onSelectStage: (stageId) => startMatchFromSetup({ ...currentSetup, stageId }),
  onOpenSetup: () => setupModal.open(currentSetup),
  onSaveMatch: saveCurrentMatch,
  onLoadMatch: () => {
    const slot = loadManualMatchSlot();
    if (slot) loadSavedState(slot.state);
  },
  onNewMatch: (count) => {
    const players = Array.from({ length: count }, (_, idx) => ({
      name: currentSetup.players[idx]?.name ?? `Player ${idx + 1}`,
      color: currentSetup.players[idx]?.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
      isBot: currentSetup.players[idx]?.isBot ?? false,
    }));
    startMatchFromSetup({ ...currentSetup, players });
  },
});

setupModal.el.addEventListener('click', () => {
  topbar.sync(state.mapId as StageId, Boolean(loadManualMatchSlot()));
});

shell.append(topbar.el, hudEl, boardStageEl, bottomGrid, setupModal.el);
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

function commitAction(action: GameAction): void {
  state = applyAction(state, action);
  saveAutoSavedMatch(state);
  render();
}

function stepGuidedOrAuto(): void {
  if (state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO') {
    return commitAction({ type: 'ADVANCE_STEP' });
  }
  if (guidedWalkActive) {
    if (state.phase === 'CHOOSE_DIRECTION' && guidedChoices.length > 0) {
      return commitAction({ type: 'CHOOSE_DIRECTION', direction: guidedChoices.shift()! });
    }
    if (state.phase === 'STEPPING') return commitAction({ type: 'ADVANCE_STEP' });
    return cancelGuidedWalk();
  }
  if (autoStepEnabled && state.phase === 'STEPPING') commitAction({ type: 'ADVANCE_STEP' });
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
  if (shouldTick) stepTimer = window.setTimeout(stepGuidedOrAuto, 210);
}

function dispatch(action: GameAction): void {
  cancelGuidedWalk();
  hoveredEndTileId = null;
  commitAction(action);
}

bindKeyboardControls({
  getState: () => state,
  getActionBox: () => actionBox,
  dispatch,
  isMovingPhase,
  isModalOpen: () => setupModal.isOpen(),
  onCloseModal: () => setupModal.close(),
});

function render(): void {
  const preview = computeMovePreview(state);
  topbar.sync(state.mapId as StageId, Boolean(loadManualMatchSlot()));
  renderPlayersHud(hudEl, state);
  renderBoard(boardEl, state, {
    preview,
    onSelectNextStep: (opt) =>
      dispatch(
        state.phase === 'CHOOSE_DIRECTION' && opt.direction
          ? { type: 'CHOOSE_DIRECTION', direction: opt.direction }
          : { type: 'ADVANCE_STEP' }
      ),
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
    const activeEl = boardEl.querySelector<HTMLElement>(`[data-tile-id="${getActivePlayer(state).tileId}"]`);
    if (activeEl) {
      const targetLeft = activeEl.offsetLeft - boardStageEl.clientWidth / 2 + activeEl.offsetWidth / 2;
      boardStageEl.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
    }
  }
  renderActionPanel(actionBox, state, dispatch, () => setupModal.open(currentSetup));

  logList.innerHTML = '';
  for (const entry of state.log) logList.appendChild(mk('li', '', entry));

  scheduleMovementTick();
}

window.addEventListener('resize', () => {
  renderRouteOverlay(routeSvgEl, boardEl, state, computeMovePreview(state), showRoutes, hoveredEndTileId);
  renderTokensOverlay(tokensLayerEl, boardEl, state);
});

render();
if (!autoSaved) setupModal.open(currentSetup);
