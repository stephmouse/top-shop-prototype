import { MAX_PLAYERS, PLAYER_COLORS } from './config/balance';
import type { StageId } from './config/maps';
import type { DirectionChoice, GameAction } from './engine/actions';
import { getActivePlayer } from './engine/helpers';
import { computeMovePreview } from './engine/movePreview';
import { applyAction, createInitialGameState } from './engine/state';
import type { GameState } from './engine/types';
import type { ConnectedPeerInfo } from './net/protocol';
import { createMultiplayerSession } from './net/session';
import { renderActionPanel } from './ui/actionPanel';
import { createAvatarModal } from './ui/avatarModal';
import { getBoardTileElement, renderBoard, renderPlayersHud, renderTokensOverlay } from './ui/boardView';
import { createFxOverlay } from './ui/fxOverlay';
import { bindKeyboardControls } from './ui/keyboard';
import {
  extractSetupFromState, loadAutoSavedMatch, loadManualMatchSlot, loadStoredSetup,
  sanitizeMatchSetup, saveAutoSavedMatch, saveManualMatchSlot, saveStoredSetup,
} from './ui/persistence';
import type { MatchSetupData } from './ui/persistence';
import { renderRouteOverlay } from './ui/routeOverlay';
import { createSoundFx } from './ui/soundFx';
import { createLobbyModal } from './ui/lobbyModal';
import { createSetupModal } from './ui/setupModal';
import { createTopbar } from './ui/topbar';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

let autoStepEnabled = false, showRoutes = true, guidedWalkActive = false, awaitingRemoteStepAck = false;
let hoveredEndTileId: string | null = null, stepTimer: number | null = null, ackTimer: number | null = null;
let guidedChoices: DirectionChoice[] = [];
let lastRenderedCanAct: boolean | null = null, lastRenderedRemoteSpin = false;
let prevRenderedState: GameState | null = null;

const autoSaved = loadAutoSavedMatch();
let currentSetup: MatchSetupData = autoSaved ? extractSetupFromState(autoSaved) : loadStoredSetup();
let state: GameState =
  autoSaved ?? createInitialGameState(currentSetup.players, currentSetup.config, Date.now() & 0xffffff, currentSetup.stageId);

const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, textContent = '') =>
  Object.assign(document.createElement(tag), { className, textContent });

const shell = mk('div', 'app-shell'), hudEl = mk('section', 'hud-row'), boardStageEl = mk('section', 'board-stage');
const boardEl = mk('div', 'board-grid'), tokensLayerEl = mk('div', 'tokens-layer');
const routeSvgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
routeSvgEl.setAttribute('class', 'route-layer');
const soundFx = createSoundFx();
const fxOverlay = createFxOverlay(boardEl, tokensLayerEl, soundFx);
boardStageEl.append(boardEl, routeSvgEl, tokensLayerEl, fxOverlay.el);

const bottomGrid = mk('section', 'bottom-grid'), actionBox = mk('div', 'panel-box'), logBox = mk('div', 'panel-box');
const logList = mk('ol', 'log-list');
logBox.append(mk('h3', 'panel-title', 'Match Log'), logList);
bottomGrid.append(actionBox, logBox);

function applyHostAction(action: GameAction): GameState {
  const next = applyAction(state, action);
  if (next === state) return state;
  state = next; saveAutoSavedMatch(state); render(); return state;
}

const netSession = createMultiplayerSession({
  getState: () => state,
  onApplyHostAction: applyHostAction,
  onReceiveRemoteState: (remoteState) => { clearAckTimer(); awaitingRemoteStepAck = false; state = remoteState; lobbyModal.refresh(); render(); },
  onSyncHostState: (synced) => { state = synced; saveAutoSavedMatch(state); render(); },
  onSessionChange: () => renderSessionUi(),
  onError: (msg) => {
    clearAckTimer(); awaitingRemoteStepAck = false;
    if (netSession.getRole() === 'offline' && !lobbyModal.isOpen()) { setupModal.close(); lobbyModal.open(); }
    lobbyModal.showStatus(msg, true); console.warn('[TopShop Net]', msg);
  },
});
(window as unknown as Record<string, unknown>).__topShopNet = netSession;

function commitMatchState(nextState: GameState, nextSetup: MatchSetupData): void {
  cancelGuidedWalk(); awaitingRemoteStepAck = false; hoveredEndTileId = null; tokensLayerEl.innerHTML = ''; fxOverlay.clear();
  prevRenderedState = null; state = nextState; currentSetup = nextSetup;
  saveStoredSetup(nextSetup); saveAutoSavedMatch(state);
  netSession.broadcastHostState(state);
  render();
}

const startMatchFromSetup = (setup: MatchSetupData) => {
  const clean = sanitizeMatchSetup(setup) ?? currentSetup;
  commitMatchState(createInitialGameState(clean.players, clean.config, Date.now() & 0xffffff, clean.stageId), clean);
};
const loadSavedState = (saved: GameState) => commitMatchState(saved, extractSetupFromState(saved));
const saveCurrentMatch = () => { const env = saveManualMatchSlot(state); setupModal.refreshSaveStatus(); syncTopbar(true); return env; };

const avatarModal = createAvatarModal();
const setupModal = createSetupModal({
  initialSetup: currentSetup, onStartMatch: startMatchFromSetup, onSaveMatch: saveCurrentMatch, onLoadMatch: loadSavedState,
  onEditAvatar: (idx, cur, col, onSave) => avatarModal.open(cur, col, `Customize Player ${idx + 1} Standee`, onSave),
});

const addPlayerSlotForPeer = (peer: ConnectedPeerInfo) => {
  if (netSession.getRole() !== 'host' || state.players.length >= MAX_PLAYERS) return;
  const peerImg = netSession.getCustomAvatars()[peer.clientToken];
  const players = [
    ...state.players.map(({ name, color, isBot, avatar }) => ({ name, color, isBot, avatar })),
    { name: peer.name, color: peer.color, isBot: false, ...(peer.avatar ? { avatar: peerImg ? { ...peer.avatar, customImage: peerImg } : peer.avatar } : {}) },
  ];
  startMatchFromSetup({ ...currentSetup, players });
  netSession.assignSeat(state.players.length - 1, peer.clientToken);
  lobbyModal.showStatus(`Added Player ${state.players.length} slot for ${peer.name}.`);
};

const lobbyModal = createLobbyModal({
  netSession, getState: () => state,
  getDefaultProfile: () => ({ name: currentSetup.players[1]?.name ?? 'Guest', color: currentSetup.players[1]?.color ?? PLAYER_COLORS[1]!, avatar: currentSetup.players[1]?.avatar }),
  onAddPlayerSlot: addPlayerSlotForPeer,
  onEditAvatar: (cur, col, onSave) => avatarModal.open(cur, col, 'Customize Guest Standee', onSave),
});
const openSetup = () => { lobbyModal.close(); setupModal.open(currentSetup); };

const drawRoutes = (preview = computeMovePreview(state)) =>
  renderRouteOverlay(routeSvgEl, boardEl, state, preview, showRoutes, hoveredEndTileId);

const topbar = createTopbar({
  initialShowRoutes: showRoutes, initialAutoStep: autoStepEnabled, initialSoundEnabled: !soundFx.isMuted(), initialStageId: state.mapId as StageId,
  onToggleRoutes: (show) => { showRoutes = show; drawRoutes(); },
  onToggleAutoStep: (enabled) => { autoStepEnabled = enabled; scheduleMovementTick(); },
  onToggleSound: (enabled) => soundFx.setMuted(!enabled),
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
    role: netSession.getRole(), roomCode: netSession.getRoomCode(),
    peerCount: roster?.peers.filter((p) => p.connected).length ?? 0,
    waitingCount: roster?.peers.filter((p) => p.connected && !roster.seatOwners.includes(p.clientToken)).length ?? 0,
  });
};

setupModal.el.addEventListener('click', () => syncTopbar());
shell.append(topbar.el, hudEl, boardStageEl, bottomGrid, setupModal.el, lobbyModal.el, avatarModal.el);
root.appendChild(shell);

const clearStepTimer = () => { if (stepTimer !== null) { window.clearTimeout(stepTimer); stepTimer = null; } };
const clearAckTimer = () => { if (ackTimer !== null) { window.clearTimeout(ackTimer); ackTimer = null; } };
const cancelGuidedWalk = () => { clearStepTimer(); clearAckTimer(); guidedWalkActive = false; guidedChoices = []; };
const isMovingPhase = (phase: GameState['phase']) =>
  phase === 'STEPPING' || phase === 'ESCALATOR_RIDE' || phase === 'ESCALATOR_UNDO' || phase === 'CHOOSE_DIRECTION';

const sendStepAction = (action: GameAction) => {
  clearAckTimer();
  if (netSession.getRole() === 'guest') {
    awaitingRemoteStepAck = true;
    ackTimer = window.setTimeout(() => { awaitingRemoteStepAck = false; scheduleMovementTick(); }, 2500);
  }
  if (!netSession.sendOrApplyAction(action)) { clearAckTimer(); awaitingRemoteStepAck = false; }
};

function stepGuidedOrAuto(): void {
  if ((state.phase === 'ESCALATOR_RIDE' || state.phase === 'ESCALATOR_UNDO') && netSession.shouldTickEscalator()) {
    netSession.broadcastHostState(applyHostAction({ type: 'ADVANCE_STEP' })); return;
  }
  if (!netSession.isLocalTurn(state) || awaitingRemoteStepAck) return;
  if (guidedWalkActive) {
    if (state.phase === 'CHOOSE_DIRECTION' && guidedChoices.length > 0) return sendStepAction({ type: 'CHOOSE_DIRECTION', direction: guidedChoices.shift()! });
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
  cancelGuidedWalk(); awaitingRemoteStepAck = false; hoveredEndTileId = null;
  netSession.sendOrApplyAction(action);
}

bindKeyboardControls({
  getState: () => state, getActionBox: () => actionBox, dispatch, isMovingPhase,
  isModalOpen: () => avatarModal.isOpen() || setupModal.isOpen() || lobbyModal.isOpen(),
  onCloseModal: () => { if (avatarModal.isOpen()) return avatarModal.close(); setupModal.close(); lobbyModal.close(); },
});

function syncHeaderAndHud(): void {
  syncTopbar();
  renderPlayersHud(hudEl, state, { role: netSession.getRole(), roster: netSession.getRoster(), myClientToken: netSession.getClientToken(), customAvatars: netSession.getCustomAvatars() });
}
function renderActionBox(canAct: boolean, remoteSpin = netSession.isRemotePencilSpinning()): void {
  lastRenderedCanAct = canAct; lastRenderedRemoteSpin = remoteSpin;
  renderActionPanel(actionBox, state, dispatch, {
    onOpenSetup: netSession.getRole() === 'guest' ? undefined : openSetup,
    readOnly: !canAct, remotePencilSpinning: remoteSpin,
    onPencilSpinChange: (spinning) => netSession.notifyPencilSpin(spinning),
  });
}
function renderSessionUi(): void {
  lobbyModal.refresh(); syncHeaderAndHud(); renderTokensOverlay(tokensLayerEl, boardEl, state, netSession.getRoster(), netSession.getCustomAvatars());
  const canAct = netSession.isLocalTurn(state), remoteSpin = netSession.isRemotePencilSpinning();
  if (canAct !== lastRenderedCanAct || (!canAct && remoteSpin !== lastRenderedRemoteSpin) || state.phase === 'GAME_OVER') { renderActionBox(canAct, remoteSpin); scheduleMovementTick(); }
}

function render(): void {
  const preview = computeMovePreview(state);
  syncHeaderAndHud();
  renderBoard(boardEl, state, {
    preview,
    onSelectNextStep: (opt) => dispatch(state.phase === 'CHOOSE_DIRECTION' && opt.direction ? { type: 'CHOOSE_DIRECTION', direction: opt.direction } : { type: 'ADVANCE_STEP' }),
    onSelectEndTarget: (target) => {
      if (!netSession.isLocalTurn(state)) return;
      cancelGuidedWalk(); hoveredEndTileId = null; guidedChoices = [...target.queuedChoices]; guidedWalkActive = true; stepGuidedOrAuto();
    },
    onHoverEndTarget: (tileId) => { hoveredEndTileId = tileId; drawRoutes(preview); },
  });
  drawRoutes(preview); renderTokensOverlay(tokensLayerEl, boardEl, state, netSession.getRoster(), netSession.getCustomAvatars());
  fxOverlay.playStateDiff(prevRenderedState, state); prevRenderedState = state;
  const activeEl = boardStageEl.scrollWidth > boardStageEl.clientWidth ? getBoardTileElement(boardEl, getActivePlayer(state).tileId) : undefined;
  if (activeEl) boardStageEl.scrollTo({ left: Math.max(0, activeEl.offsetLeft - boardStageEl.clientWidth / 2 + activeEl.offsetWidth / 2), behavior: 'smooth' });
  renderActionBox(netSession.isLocalTurn(state));
  logList.innerHTML = ''; for (const entry of state.log) logList.appendChild(mk('li', '', entry));
  scheduleMovementTick();
}

const syncBoardOverlays = () => { drawRoutes(); renderTokensOverlay(tokensLayerEl, boardEl, state, netSession.getRoster(), netSession.getCustomAvatars()); };
window.addEventListener('resize', syncBoardOverlays);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncBoardOverlays).observe(boardEl);
window.addEventListener('beforeunload', (e) => { if (netSession.getRole() !== 'offline') { e.preventDefault(); e.returnValue = ''; } });
render();
const roomParam = new URLSearchParams(window.location.search).get('room')?.trim();
if (roomParam) lobbyModal.open(roomParam);
else if (!autoSaved) setupModal.open(currentSetup);
