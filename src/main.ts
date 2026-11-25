import type { GameAction } from './engine/actions';
import { applyAction, createInitialGameState } from './engine/state';
import type { GameState } from './engine/types';
import { HOST_TOKEN } from './net/protocol';
import { createMultiplayerSession } from './net/session';
import { createAppModals } from './ui/appModals';
import type { AppModals } from './ui/appModals';
import { createGameRenderer } from './ui/gameRenderer';
import type { GameRenderer } from './ui/gameRenderer';
import { applyHostSeatEdit, applyUnifiedProfileChange } from './ui/hostProfileSync';
import { bindKeyboardControls } from './ui/keyboard';
import { createMovementDriver } from './ui/movementDriver';
import {
  clearAutoSavedMatch,
  extractSetupFromState,
  loadAutoSavedMatch,
  loadStoredSetup,
  sanitizeMatchSetup,
  saveAutoSavedMatch,
  saveManualMatchSlot,
  saveStoredSetup,
} from './ui/persistence';
import type { MatchSetupData } from './ui/persistence';
import type { UserProfile } from './ui/playerProfile';
import { createSoundFx } from './ui/soundFx';
import { shouldWarnBeforeUnload } from './ui/turnCue';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

let autoStepEnabled = false;
let suppressSyncRender = false;
const INITIAL_SHOW_ROUTES = true;

const autoSaved = loadAutoSavedMatch();
let currentSetup: MatchSetupData = autoSaved ? extractSetupFromState(autoSaved) : loadStoredSetup();
let state: GameState =
  autoSaved ??
  createInitialGameState(
    currentSetup.players,
    currentSetup.config,
    Date.now() & 0xffffff,
    currentSetup.stageId
  );

const soundFx = createSoundFx();
let renderer!: GameRenderer;
let modals!: AppModals;

function applyHostAction(action: GameAction): GameState {
  const next = applyAction(state, action);
  if (next === state) return state;
  state = next;
  saveAutoSavedMatch(state);
  renderer.render();
  return state;
}

function broadcastSuppressed(nextState: GameState): void {
  suppressSyncRender = true;
  try {
    netSession.broadcastHostState(nextState);
  } finally {
    suppressSyncRender = false;
  }
}

const netSession = createMultiplayerSession({
  getState: () => state,
  onApplyHostAction: applyHostAction,
  onReceiveRemoteState: (remoteState) => {
    const prev = state;
    moveDriver.onRemoteStateAccepted(prev, remoteState);
    state = remoteState;
    modals.lobbyModal.refresh();
    renderer.render();
  },
  onActionAck: () => {
    moveDriver.clearAckTimer();
    moveDriver.clearAwaitingAck();
  },
  onSyncHostState: (synced) => {
    state = synced;
    saveAutoSavedMatch(state);
    if (!suppressSyncRender) renderer.render();
  },
  onSessionChange: () => renderer.renderSessionUi(),
  onTurnPing: (ping) => renderer.showTurnPing(ping.fromName, ping.targetPlayerName, ping.targetPlayerId),
  onError: (msg) => {
    moveDriver.clearAckTimer();
    moveDriver.clearAwaitingAck();
    if (netSession.getRole() === 'offline' && !modals.lobbyModal.isOpen() && !modals.homeModal.isOpen()) {
      modals.setupModal.close();
      modals.lobbyModal.open();
    }
    modals.lobbyModal.showStatus(msg, true);
    console.warn('[TopShop Net]', msg);
  },
});

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__topShopNet = netSession;
}

const moveDriver = createMovementDriver({
  netSession,
  getState: () => state,
  isAutoStepEnabled: () => autoStepEnabled,
  onApplyHostAction: applyHostAction,
});

function commitMatchState(nextState: GameState, nextSetup: MatchSetupData): void {
  moveDriver.cancel();
  moveDriver.clearAwaitingAck();
  renderer.resetVisualState();
  state = nextState;
  currentSetup = nextSetup;
  saveStoredSetup(nextSetup);
  saveAutoSavedMatch(state);
  broadcastSuppressed(state);
  renderer.render();
}

function startMatchFromSetup(setup: MatchSetupData): void {
  const clean = sanitizeMatchSetup(setup) ?? currentSetup;
  const seed = Date.now() & 0xffffff;
  commitMatchState(createInitialGameState(clean.players, clean.config, seed, clean.stageId), clean);
}

function loadSavedState(saved: GameState): void {
  commitMatchState(saved, extractSetupFromState(saved));
}

function saveCurrentMatch() {
  const env = saveManualMatchSlot(state);
  modals.setupModal.refreshSaveStatus();
  modals.syncTopbar(true);
  return env;
}

function applyUnifiedProfile(next: UserProfile): void {
  const res = applyUnifiedProfileChange(state, currentSetup, netSession.getRole(), next);
  currentSetup = res.nextSetup;
  if (res.stateChanged) {
    state = res.nextState;
    if (netSession.getRole() === 'host') broadcastSuppressed(state);
    renderer.render();
  }
}

function updateHostSeat(seatIdx: number, next: UserProfile): void {
  const roster = netSession.getRoster();
  if (netSession.getRole() !== 'host' || (roster?.seatOwners[seatIdx] ?? HOST_TOKEN) !== HOST_TOKEN) return;
  const res = applyHostSeatEdit(state, currentSetup, seatIdx, next);
  state = res.nextState;
  currentSetup = res.nextSetup;
  broadcastSuppressed(state);
  renderer.render();
  modals.lobbyModal.refresh();
}

function dispatch(action: GameAction): void {
  if (!netSession.isLocalTurn(state) || netSession.isReconnecting()) return;
  if (renderer.isLandingLocked() && action.type !== 'UNDO_STEP' && action.type !== 'CANCEL_MOVE') return;
  if (netSession.getRole() === 'guest') {
    if (moveDriver.isAwaitingAck()) return;
    moveDriver.cancel();
    renderer.clearHoverState();
    moveDriver.markAwaitingAck();
    if (!netSession.sendOrApplyAction(action)) {
      moveDriver.clearAckTimer();
      moveDriver.clearAwaitingAck();
    }
    return;
  }
  moveDriver.cancel();
  moveDriver.clearAwaitingAck();
  renderer.clearHoverState();
  netSession.sendOrApplyAction(action);
}

renderer = createGameRenderer({
  getState: () => state,
  netSession,
  moveDriver,
  soundFx,
  dispatch,
  onOpenSetup: () => modals.openSetup(),
  onInspectShop: (shopId) => modals.storeInspectorModal.open(shopId),
  syncTopbar: () => modals.syncTopbar(),
  onRefreshModals: () => modals.refreshAll(),
  onRefreshSetupModal: () => modals.setupModal.refresh(),
  initialShowRoutes: INITIAL_SHOW_ROUTES,
});

modals = createAppModals({
  netSession,
  soundFx,
  getState: () => state,
  getSetup: () => currentSetup,
  initialShowRoutes: INITIAL_SHOW_ROUTES,
  initialAutoStep: autoStepEnabled,
  onToggleRoutes: (show) => renderer.setShowRoutes(show),
  onToggleAutoStep: (enabled) => {
    autoStepEnabled = enabled;
    moveDriver.scheduleTick();
  },
  onStartMatch: startMatchFromSetup,
  onSaveMatch: saveCurrentMatch,
  onLoadMatch: loadSavedState,
  onDiscardResume: () => {
    clearAutoSavedMatch();
    const seed = Date.now() & 0xffffff;
    commitMatchState(
      createInitialGameState(currentSetup.players, currentSetup.config, seed, currentSetup.stageId),
      currentSetup
    );
  },
  onUpdateProfile: applyUnifiedProfile,
  onUpdateHostSeat: updateHostSeat,
});

renderer.shell.append(
  modals.topbar.el,
  renderer.hudEl,
  renderer.boardStageEl,
  renderer.bottomGrid,
  modals.homeModal.el,
  modals.setupModal.el,
  modals.lobbyModal.el,
  modals.avatarModal.el,
  modals.howToPlayModal.el,
  modals.storeInspectorModal.el
);
root.appendChild(renderer.shell);

bindKeyboardControls({
  getState: () => state,
  getActionBox: () => renderer.actionBox,
  dispatch,
  isMovingPhase: moveDriver.isMovingPhase,
  isModalOpen: () => modals.isAnyModalOpen(),
  onCloseModal: () => modals.closeTopModal(),
  getHoldWaitMs: moveDriver.getHoldWaitMs,
  isAwaitingAck: moveDriver.isAwaitingAck,
});

window.addEventListener('beforeunload', (e) => {
  if (shouldWarnBeforeUnload(state, netSession.getRole(), netSession.getRoster())) {
    e.preventDefault();
    e.returnValue = '';
  }
});

renderer.render();
const roomParam = new URLSearchParams(window.location.search).get('room')?.trim();
if (roomParam) modals.openLobby(roomParam, true);
else modals.homeModal.open();
