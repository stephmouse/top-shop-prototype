import { PLAYER_COLORS } from './config/balance';
import type { StageId } from './config/maps';
import type { DirectionChoice, GameAction } from './engine/actions';
import { getActivePlayer } from './engine/helpers';
import { computeMovePreview } from './engine/movePreview';
import { applyAction, createInitialGameState } from './engine/state';
import type { GameState } from './engine/types';
import { createMultiplayerSession } from './net/session';
import { renderActionPanel } from './ui/actionPanel';
import { renderBoard, renderPlayersHud, renderTokensOverlay } from './ui/boardView';
import { bindKeyboardControls } from './ui/keyboard';
import {
  extractSetupFromState, loadAutoSavedMatch, loadManualMatchSlot, loadStoredSetup,
  sanitizeMatchSetup, saveAutoSavedMatch, saveManualMatchSlot, saveStoredSetup,
} from './ui/persistence';
import type { MatchSetupData } from './ui/persistence';
import { renderRouteOverlay } from './ui/routeOverlay';
import { createLobbyModal } from './ui/lobbyModal';
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
let awaitingRemoteStepAck = false;

const autoSaved = loadAutoSavedMatch();
let currentSetup: MatchSetupData = autoSaved ? extractSetupFromState(autoSaved) : loadStoredSetup();
let state: GameState =
  autoSaved ?? createInitialGameState(currentSetup.players, currentSetup.config, Date.now() & 0xffffff, currentSetup.stageId);

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

function applyHostAction(action: GameAction): GameState {
  state = applyAction(state, action);
  saveAutoSavedMatch(state);
  render();
  return state;
}

const netSession = createMultiplayerSession({
  getState: () => state,
  onApplyHostAction: applyHostAction,
  onReceiveRemoteState: (remoteState) => { awaitingRemoteStepAck = false; state = remoteState; render(); },
  onSessionChange: () => { lobbyModal.refresh(); render(); },
  onError: (msg) => { awaitingRemoteStepAck = false; lobbyModal.showStatus(msg, true); console.warn('[TopShop Net]', msg); },
});
(window as unknown as Record<string, unknown>).__topShopNet = netSession;

function commitMatchState(nextState: GameState, nextSetup: MatchSetupData): void {
  cancelGuidedWalk();
  awaitingRemoteStepAck = false;
  hoveredEndTileId = null;
  tokensLayerEl.innerHTML = '';
  state = nextState;
  currentSetup = nextSetup;
  saveStoredSetup(nextSetup);
  saveAutoSavedMatch(state);
  netSession.broadcastHostState(state);
  render();
}

const startMatchFromSetup = (setup: MatchSetupData) => {
  const clean = sanitizeMatchSetup(setup) ?? currentSetup;
  commitMatchState(createInitialGameState(clean.players, clean.config, Date.now() & 0xffffff, clean.stageId), clean);
};
const loadSavedState = (saved: GameState) => commitMatchState(saved, extractSetupFromState(saved));
const saveCurrentMatch = () => {
  const env = saveManualMatchSlot(state);
  setupModal.refreshSaveStatus();
  syncTopbar(true);
  return env;
};

const setupModal = createSetupModal({
  initialSetup: currentSetup,
  onStartMatch: startMatchFromSetup,
  onSaveMatch: saveCurrentMatch,
  onLoadMatch: loadSavedState,
});

const addPlayerSlotForPeer = (peer: { clientToken: string; name: string; color: string }) => {
  if (netSession.getRole() !== 'host' || state.players.length >= 4) return;
  const players = [...state.players.map(({ name, color, isBot }) => ({ name, color, isBot })), { name: peer.name, color: peer.color, isBot: false }];
  startMatchFromSetup({ ...currentSetup, players });
  netSession.assignSeat(state.players.length - 1, peer.clientToken);
  lobbyModal.showStatus(`Added Player ${state.players.length} slot for ${peer.name}.`);
};

const lobbyModal = createLobbyModal({
  netSession,
  getState: () => state,
  getDefaultProfile: () => ({ name: currentSetup.players[1]?.name ?? 'Guest', color: currentSetup.players[1]?.color ?? PLAYER_COLORS[1]! }),
  onAddPlayerSlot: addPlayerSlotForPeer,
});
const openSetup = () => { lobbyModal.close(); setupModal.open(currentSetup); };

const drawRoutes = (preview = computeMovePreview(state)) =>
  renderRouteOverlay(routeSvgEl, boardEl, state, preview, showRoutes, hoveredEndTileId);

const topbar = createTopbar({
  initialShowRoutes: showRoutes,
  initialAutoStep: autoStepEnabled,
  initialStageId: state.mapId as StageId,
  onToggleRoutes: (show) => { showRoutes = show; drawRoutes(); },
  onToggleAutoStep: (enabled) => { autoStepEnabled = enabled; scheduleMovementTick(); },
  onSelectStage: (stageId) => startMatchFromSetup({ ...currentSetup, stageId }),
  onOpenSetup: openSetup,
  onOpenLobby: () => { setupModal.close(); lobbyModal.open(); },
  onSaveMatch: saveCurrentMatch,
  onLoadMatch: () => { const slot = loadManualMatchSlot(); if (slot) loadSavedState(slot.state); },
  onNewMatch: (count) => startMatchFromSetup({
    ...currentSetup,
    players: Array.from({ length: count }, (_, i) => currentSetup.players[i] ?? { name: `Player ${i + 1}`, color: PLAYER_COLORS[i % PLAYER_COLORS.length]!, isBot: false }),
  }),
});

const syncTopbar = (hasSave = Boolean(loadManualMatchSlot())) => {
  const roster = netSession.getRoster();
  topbar.sync(state.mapId as StageId, hasSave, {
    role: netSession.getRole(),
    roomCode: netSession.getRoomCode(),
    peerCount: roster?.peers.filter((p) => p.connected).length ?? 0,
    waitingCount: roster?.peers.filter((p) => p.connected && !roster.seatOwners.includes(p.clientToken)).length ?? 0,
  });
};

setupModal.el.addEventListener('click', () => syncTopbar());
shell.append(topbar.el, hudEl, boardStageEl, bottomGrid, setupModal.el, lobbyModal.el);
root.appendChild(shell);

const clearStepTimer = () => { if (stepTimer !== null) { window.clearTimeout(stepTimer); stepTimer = null; } };
const cancelGuidedWalk = () => { clearStepTimer(); guidedWalkActive = false; guidedChoices = []; };
const isMovingPhase = (phase: GameState['phase']) =>
  phase === 'STEPPING' || phase === 'ESCALATOR_RIDE' || phase === 'ESCALATOR_UNDO' || phase === 'CHOOSE_DIRECTION';

function sendStepAction(action: GameAction): void {
  if (netSession.getRole() === 'guest') awaitingRemoteStepAck = true;
  if (!netSession.sendOrApplyAction(action)) awaitingRemoteStepAck = false;
}

function stepGuidedOrAuto(): void {
  if ((state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO') && netSession.shouldTickEscalator()) {
    netSession.broadcastHostState(applyHostAction({ type: 'ADVANCE_STEP' }));
    return;
  }
  if (!netSession.isLocalTurn(state) || awaitingRemoteStepAck) return;
  if (guidedWalkActive) {
    if (state.phase === 'CHOOSE_DIRECTION' && guidedChoices.length > 0) {
      return sendStepAction({ type: 'CHOOSE_DIRECTION', direction: guidedChoices.shift()! });
    }
    if (state.phase === 'STEPPING') return sendStepAction({ type: 'ADVANCE_STEP' });
    return cancelGuidedWalk();
  }
  if (autoStepEnabled && state.phase === 'STEPPING') sendStepAction({ type: 'ADVANCE_STEP' });
}

function scheduleMovementTick(): void {
  clearStepTimer();
  if (!isMovingPhase(state.phase)) { guidedWalkActive = false; guidedChoices = []; return; }
  const canEsc = netSession.shouldTickEscalator() && (state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO');
  const canWalk = netSession.isLocalTurn(state) && !awaitingRemoteStepAck && (guidedWalkActive || (autoStepEnabled && state.phase === 'STEPPING'));
  if (canEsc || canWalk) stepTimer = window.setTimeout(stepGuidedOrAuto, 210);
}

function dispatch(action: GameAction): void {
  if (!netSession.isLocalTurn(state)) return;
  cancelGuidedWalk();
  awaitingRemoteStepAck = false;
  hoveredEndTileId = null;
  netSession.sendOrApplyAction(action);
}

bindKeyboardControls({
  getState: () => state, getActionBox: () => actionBox, dispatch, isMovingPhase,
  isModalOpen: () => setupModal.isOpen() || lobbyModal.isOpen(),
  onCloseModal: () => { setupModal.close(); lobbyModal.close(); },
});

function render(): void {
  const preview = computeMovePreview(state);
  const canAct = netSession.isLocalTurn(state);
  syncTopbar();
  renderPlayersHud(hudEl, state, { role: netSession.getRole(), roster: netSession.getRoster(), myClientToken: netSession.getClientToken() });
  renderBoard(boardEl, state, {
    preview,
    onSelectNextStep: (opt) => dispatch(state.phase === 'CHOOSE_DIRECTION' && opt.direction ? { type: 'CHOOSE_DIRECTION', direction: opt.direction } : { type: 'ADVANCE_STEP' }),
    onSelectEndTarget: (target) => {
      if (!netSession.isLocalTurn(state)) return;
      cancelGuidedWalk(); hoveredEndTileId = null;
      guidedChoices = [...target.queuedChoices]; guidedWalkActive = true;
      stepGuidedOrAuto();
    },
    onHoverEndTarget: (tileId) => { hoveredEndTileId = tileId; drawRoutes(preview); },
  });
  drawRoutes(preview);
  renderTokensOverlay(tokensLayerEl, boardEl, state);
  if (boardStageEl.scrollWidth > boardStageEl.clientWidth) {
    const activeEl = boardEl.querySelector<HTMLElement>(`[data-tile-id="${getActivePlayer(state).tileId}"]`);
    if (activeEl) boardStageEl.scrollTo({ left: Math.max(0, activeEl.offsetLeft - boardStageEl.clientWidth / 2 + activeEl.offsetWidth / 2), behavior: 'smooth' });
  }
  renderActionPanel(actionBox, state, dispatch, {
    onOpenSetup: netSession.getRole() === 'guest' ? undefined : openSetup,
    readOnly: !canAct,
    remotePencilSpinning: netSession.isRemotePencilSpinning(),
    onPencilSpinChange: (spinning) => netSession.notifyPencilSpin(spinning),
  });
  logList.innerHTML = '';
  for (const entry of state.log) logList.appendChild(mk('li', '', entry));
  scheduleMovementTick();
}

window.addEventListener('resize', () => { drawRoutes(); renderTokensOverlay(tokensLayerEl, boardEl, state); });
render();
const roomParam = new URLSearchParams(window.location.search).get('room')?.trim();
if (roomParam) lobbyModal.open(roomParam);
else if (!autoSaved) setupModal.open(currentSetup);
