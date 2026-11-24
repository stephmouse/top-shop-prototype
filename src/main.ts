import { MAX_PLAYERS, PLAYER_COLORS } from './config/balance';
import { getStageDef } from './config/maps';
import type { StageId } from './config/maps';
import type { GameAction } from './engine/actions';
import { getActivePlayer } from './engine/helpers';
import { computeMovePreview } from './engine/movePreview';
import { applyAction, createInitialGameState } from './engine/state';
import type { GameState, PencilFace } from './engine/types';
import { HOST_TOKEN } from './net/protocol';
import type { ConnectedPeerInfo } from './net/protocol';
import { createMultiplayerSession } from './net/session';
import { renderActionPanel } from './ui/actionPanel';
import { createAvatarModal } from './ui/avatarModal';
import { getBoardTileElement, renderBoard, renderPlayersHud, renderTokensOverlay } from './ui/boardView';
import { buildBoardShopPick } from './ui/boardPickState';
import { createFxOverlay } from './ui/fxOverlay';
import { createHomeModal } from './ui/homeModal';
import { createHowToPlayModal } from './ui/howToPlayModal';
import { applyHostSeatEdit, applyUnifiedProfileChange, buildExtendedLocalPlayers } from './ui/hostProfileSync';
import type { TokenMoveHint } from './ui/hudView';
import { bindKeyboardControls } from './ui/keyboard';
import { createLobbyModal } from './ui/lobbyModal';
import { renderMatchLog } from './ui/matchLogView';
import { createMovementDriver } from './ui/movementDriver';
import { updateRemotePencil } from './ui/pencilView';
import {
  clearAutoSavedMatch,
  extractSetupFromState,
  loadAutoSavedMatch,
  loadManualMatchSlot,
  loadStoredSetup,
  sanitizeMatchSetup,
  saveAutoSavedMatch,
  saveManualMatchSlot,
  saveStoredSetup,
} from './ui/persistence';
import type { MatchSetupData } from './ui/persistence';
import { resetPlayersHudCache, stageCashbackHud } from './ui/playerCardView';
import { loadUserProfile } from './ui/playerProfile';
import type { UserProfile } from './ui/playerProfile';
import { renderRouteOverlay } from './ui/routeOverlay';
import { createSetupModal } from './ui/setupModal';
import { createSoundFx } from './ui/soundFx';
import { diffGameStates } from './ui/stateDiff';
import { createTopbar } from './ui/topbar';
import { createTurnCueTracker, shouldWarnBeforeUnload } from './ui/turnCue';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

let autoStepEnabled = false;
let showRoutes = true;
let suppressSyncRender = false;
let hoveredEndTileId: string | null = null;
let hoveredPickShopId: string | null = null;
let lastRenderedCanAct: boolean | null = null;
let lastRenderedRemoteSpin = false;
let lastRenderedReconnecting = false;
let lastRenderedRemoteStop: PencilFace | null = null;
let prevRenderedState: GameState | null = null;

const LANDING_LOCK_MS = 380;
let landingLockUntil = 0;
let landingLockTimer: number | null = null;

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

const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, textContent = '') =>
  Object.assign(document.createElement(tag), { className, textContent });

const getPrimaryFallback = () => ({
  name: currentSetup.players[0]?.name ?? 'Player 1',
  color: currentSetup.players[0]?.color ?? PLAYER_COLORS[0]!,
  avatar: currentSetup.players[0]?.avatar,
});

const shell = mk('div', 'app-shell');
const hudEl = mk('section', 'hud-row');
const boardStageEl = mk('section', 'board-stage');
const boardEl = mk('div', 'board-grid');
const tokensLayerEl = mk('div', 'tokens-layer');
const routeSvgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
routeSvgEl.setAttribute('class', 'route-layer');

const soundFx = createSoundFx();
const turnCue = createTurnCueTracker(soundFx);
const fxOverlay = createFxOverlay(boardEl, tokensLayerEl, soundFx);
boardStageEl.append(boardEl, routeSvgEl, tokensLayerEl, fxOverlay.el);

const bottomGrid = mk('section', 'bottom-grid');
const actionBox = mk('div', 'panel-box');
const logBox = mk('div', 'panel-box calendar-log-panel');
bottomGrid.append(actionBox, logBox);

function clearLandingLock(): void {
  if (landingLockTimer !== null) {
    window.clearTimeout(landingLockTimer);
    landingLockTimer = null;
  }
  landingLockUntil = 0;
  actionBox.classList.remove('is-landing-guard');
}

function armLandingLock(): void {
  clearLandingLock();
  landingLockUntil = Date.now() + LANDING_LOCK_MS;
  actionBox.classList.add('is-landing-guard');
  landingLockTimer = window.setTimeout(() => {
    landingLockTimer = null;
    landingLockUntil = 0;
    actionBox.classList.remove('is-landing-guard');
  }, LANDING_LOCK_MS);
}

function applyHostAction(action: GameAction): GameState {
  const next = applyAction(state, action);
  if (next === state) return state;
  state = next;
  saveAutoSavedMatch(state);
  render();
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
    lobbyModal.refresh();
    render();
  },
  onActionAck: () => {
    moveDriver.clearAckTimer();
    moveDriver.clearAwaitingAck();
  },
  onSyncHostState: (synced) => {
    state = synced;
    saveAutoSavedMatch(state);
    if (!suppressSyncRender) render();
  },
  onSessionChange: () => renderSessionUi(),
  onError: (msg) => {
    moveDriver.clearAckTimer();
    moveDriver.clearAwaitingAck();
    if (netSession.getRole() === 'offline' && !lobbyModal.isOpen() && !homeModal.isOpen()) {
      setupModal.close();
      lobbyModal.open();
    }
    lobbyModal.showStatus(msg, true);
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
  clearLandingLock();
  hoveredEndTileId = null;
  hoveredPickShopId = null;
  turnCue.reset();
  resetPlayersHudCache(hudEl);
  tokensLayerEl.innerHTML = '';
  fxOverlay.clear();
  prevRenderedState = null;
  state = nextState;
  currentSetup = nextSetup;
  saveStoredSetup(nextSetup);
  saveAutoSavedMatch(state);
  broadcastSuppressed(state);
  render();
}

const startMatchFromSetup = (setup: MatchSetupData) => {
  const clean = sanitizeMatchSetup(setup) ?? currentSetup;
  const seed = Date.now() & 0xffffff;
  commitMatchState(createInitialGameState(clean.players, clean.config, seed, clean.stageId), clean);
};

const loadSavedState = (saved: GameState) => commitMatchState(saved, extractSetupFromState(saved));

const saveCurrentMatch = () => {
  const env = saveManualMatchSlot(state);
  setupModal.refreshSaveStatus();
  syncTopbar(true);
  return env;
};

function applyUnifiedProfile(next: UserProfile): void {
  const res = applyUnifiedProfileChange(state, currentSetup, netSession.getRole(), next);
  currentSetup = res.nextSetup;
  if (res.stateChanged) {
    state = res.nextState;
    if (netSession.getRole() === 'host') broadcastSuppressed(state);
    render();
  }
}

function updateHostSeat(seatIdx: number, next: UserProfile): void {
  const roster = netSession.getRoster();
  if (netSession.getRole() !== 'host' || (roster?.seatOwners[seatIdx] ?? HOST_TOKEN) !== HOST_TOKEN) return;
  const res = applyHostSeatEdit(state, currentSetup, seatIdx, next);
  state = res.nextState;
  currentSetup = res.nextSetup;
  broadcastSuppressed(state);
  render();
  lobbyModal.refresh();
}

const avatarModal = createAvatarModal({
  onPreviewWalkSound: (c) => soundFx.playWalkSoundPreview(c),
});

const setupModal = createSetupModal({
  initialSetup: currentSetup,
  onStartMatch: startMatchFromSetup,
  onSaveMatch: saveCurrentMatch,
  onLoadMatch: loadSavedState,
  onEditAvatar: (idx, cur, col, onSave) => avatarModal.open(cur, col, `Customize Player ${idx + 1} Standee`, onSave),
  getOnlineContext: () => ({
    role: netSession.getRole(),
    roster: netSession.getRoster(),
    customAvatars: netSession.getCustomAvatars(),
  }),
  onOpenLobby: () => lobbyModal.open(),
});

const openSetup = () => {
  homeModal.close();
  lobbyModal.close();
  setupModal.open(currentSetup);
};

const openLobby = (code?: string) => {
  homeModal.close();
  setupModal.close();
  lobbyModal.open(code);
};

const lobbyModal = createLobbyModal({
  netSession,
  getState: () => state,
  getDefaultProfile: () => ({
    name: currentSetup.players[1]?.name ?? 'Guest',
    color: currentSetup.players[1]?.color ?? PLAYER_COLORS[1]!,
    avatar: currentSetup.players[1]?.avatar,
  }),
  onAddPlayerSlot: (peer: ConnectedPeerInfo) => {
    if (netSession.getRole() !== 'host' || state.players.length >= MAX_PLAYERS) return;
    const players = buildExtendedLocalPlayers(currentSetup);
    startMatchFromSetup({ ...currentSetup, players });
    netSession.assignSeat(players.length - 1, peer.id);
    lobbyModal.showStatus(`Added Player ${players.length} slot for ${peer.name}.`);
  },
  onEditAvatar: (cur, col, onSave, title = 'Customize Guest Standee') => avatarModal.open(cur, col, title, onSave),
  onUpdateHostSeat: updateHostSeat,
  onOpenMatchSetup: openSetup,
  onProfileChange: applyUnifiedProfile,
});

const howToPlayModal = createHowToPlayModal();

const homeModal = createHomeModal({
  getState: () => state,
  getProfile: () => loadUserProfile(getPrimaryFallback()),
  onUpdateProfile: applyUnifiedProfile,
  onEditAvatar: (cur, col, onSave, title = 'Customize Your Standee') => avatarModal.open(cur, col, title, onSave),
  onOpenHowToPlay: () => howToPlayModal.open(),
  onPlayLocal: () => setupModal.open(currentSetup),
  onHostOnline: async (customCode) => {
    const code = await netSession.hostRoom(customCode);
    syncTopbar();
    lobbyModal.open();
    lobbyModal.showStatus(`Room ${code} ready! Share the code or invite link.`);
    return code;
  },
  onJoinOnline: async (roomCode, prof) => {
    applyUnifiedProfile(prof);
    await netSession.joinRoom(roomCode, prof);
    syncTopbar();
  },
  onDiscardResume: () => {
    clearAutoSavedMatch();
    const seed = Date.now() & 0xffffff;
    commitMatchState(
      createInitialGameState(currentSetup.players, currentSetup.config, seed, currentSetup.stageId),
      currentSetup
    );
  },
});

const drawRoutes = (preview = computeMovePreview(state)) =>
  renderRouteOverlay(routeSvgEl, boardEl, state, preview, showRoutes, hoveredEndTileId);

const topbar = createTopbar({
  initialShowRoutes: showRoutes,
  initialAutoStep: autoStepEnabled,
  initialSoundEnabled: !soundFx.isMuted(),
  initialStageId: state.mapId as StageId,
  onToggleRoutes: (show) => {
    showRoutes = show;
    drawRoutes();
  },
  onToggleAutoStep: (enabled) => {
    autoStepEnabled = enabled;
    moveDriver.scheduleTick();
  },
  onToggleSound: (enabled) => soundFx.setMuted(!enabled),
  onSelectStage: (stageId) => {
    const stg = getStageDef(stageId);
    startMatchFromSetup({
      ...currentSetup,
      stageId,
      config: {
        ...currentSetup.config,
        startingCash: stg.recommendedStartingCash,
        targetAssets: stg.recommendedTargetAssets,
      },
    });
  },
  onOpenHome: () => {
    setupModal.close();
    lobbyModal.close();
    homeModal.open();
  },
  onOpenHowToPlay: () => howToPlayModal.open(),
  onOpenSetup: openSetup,
  onOpenLobby: () => openLobby(),
  onSaveMatch: saveCurrentMatch,
  onLoadMatch: () => {
    const slot = loadManualMatchSlot();
    if (slot) loadSavedState(slot.state);
  },
  onNewMatch: (count) =>
    startMatchFromSetup({
      ...currentSetup,
      players: Array.from(
        { length: count },
        (_, i) =>
          currentSetup.players[i] ?? {
            name: `Player ${i + 1}`,
            color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
            isBot: false,
          }
      ),
    }),
});

const syncTopbar = (hasSave = Boolean(loadManualMatchSlot())) => {
  const roster = netSession.getRoster();
  topbar.sync(state.mapId as StageId, hasSave, {
    role: netSession.getRole(),
    roomCode: netSession.getRoomCode(),
    peerCount: roster?.peers.filter((p) => p.connected).length ?? 0,
    waitingCount: roster?.peers.filter((p) => p.connected && !roster.seatOwners.includes(p.id)).length ?? 0,
    reconnecting: netSession.isReconnecting(),
  });
};

setupModal.el.addEventListener('click', () => syncTopbar());
shell.append(
  topbar.el,
  hudEl,
  boardStageEl,
  bottomGrid,
  homeModal.el,
  setupModal.el,
  lobbyModal.el,
  avatarModal.el,
  howToPlayModal.el
);
root.appendChild(shell);

function dispatch(action: GameAction): void {
  if (!netSession.isLocalTurn(state) || netSession.isReconnecting()) return;
  if (Date.now() < landingLockUntil && action.type !== 'UNDO_STEP' && action.type !== 'CANCEL_MOVE') return;
  if (netSession.getRole() === 'guest') {
    if (moveDriver.isAwaitingAck()) return;
    moveDriver.cancel();
    hoveredEndTileId = null;
    hoveredPickShopId = null;
    moveDriver.markAwaitingAck();
    if (!netSession.sendOrApplyAction(action)) {
      moveDriver.clearAckTimer();
      moveDriver.clearAwaitingAck();
    }
    return;
  }
  moveDriver.cancel();
  moveDriver.clearAwaitingAck();
  hoveredEndTileId = null;
  hoveredPickShopId = null;
  netSession.sendOrApplyAction(action);
}

bindKeyboardControls({
  getState: () => state,
  getActionBox: () => actionBox,
  dispatch,
  isMovingPhase: moveDriver.isMovingPhase,
  isModalOpen: () =>
    avatarModal.isOpen() ||
    howToPlayModal.isOpen() ||
    homeModal.isOpen() ||
    setupModal.isOpen() ||
    lobbyModal.isOpen(),
  onCloseModal: () => {
    if (avatarModal.isOpen()) return avatarModal.close();
    if (howToPlayModal.isOpen()) return howToPlayModal.close();
    homeModal.close();
    setupModal.close();
    lobbyModal.close();
  },
  getHoldWaitMs: moveDriver.getHoldWaitMs,
  isAwaitingAck: moveDriver.isAwaitingAck,
});

function syncHeaderAndHud(): void {
  syncTopbar();
  renderPlayersHud(hudEl, state, {
    role: netSession.getRole(),
    roster: netSession.getRoster(),
    myPeerId: netSession.getMyPeerId(),
    customAvatars: netSession.getCustomAvatars(),
  });
}

const refreshPickUi = () => {
  const canAct = netSession.isLocalTurn(state);
  paintBoard(computeMovePreview(state), canAct);
  renderActionBox(canAct);
};

function renderActionBox(
  canAct: boolean,
  remoteSpin = netSession.isRemotePencilSpinning(),
  remoteStop = netSession.getRemotePencilStopFace()
): void {
  const reconnecting = netSession.isReconnecting();
  lastRenderedCanAct = canAct;
  lastRenderedRemoteSpin = remoteSpin;
  lastRenderedRemoteStop = remoteStop;
  lastRenderedReconnecting = reconnecting;
  renderActionPanel(actionBox, state, dispatch, {
    onOpenSetup: netSession.getRole() === 'guest' ? undefined : openSetup,
    readOnly: !canAct,
    reconnecting,
    remotePencilSpinning: remoteSpin,
    remotePencilStopFace: remoteStop,
    onPencilSpinChange: (spinning, stopFace) => netSession.notifyPencilSpin(spinning, stopFace),
    onPencilLanded: (face) => soundFx.playPencilStop(face === 'E'),
    onUiChange: refreshPickUi,
    onHoverShop: (shopId) => {
      if (hoveredPickShopId !== shopId) {
        hoveredPickShopId = shopId;
        paintBoard();
      }
    },
  });
}

function paintBoard(preview = computeMovePreview(state), canAct = netSession.isLocalTurn(state)): void {
  renderBoard(boardEl, state, {
    preview,
    shopPick: canAct ? buildBoardShopPick(state, dispatch, refreshPickUi, hoveredPickShopId) : null,
    onSelectNextStep: (opt) =>
      dispatch(
        state.phase === 'CHOOSE_DIRECTION' && opt.direction
          ? { type: 'CHOOSE_DIRECTION', direction: opt.direction }
          : { type: 'ADVANCE_STEP' }
      ),
    onSelectEndTarget: (target) => {
      if (netSession.isLocalTurn(state)) {
        hoveredEndTileId = null;
        moveDriver.startGuidedWalk(target.queuedChoices);
      }
    },
    onHoverEndTarget: (tileId) => {
      hoveredEndTileId = tileId;
      drawRoutes(preview);
    },
  });
}

function renderSessionUi(): void {
  lobbyModal.refresh();
  setupModal.refresh();
  homeModal.refresh();
  syncHeaderAndHud();
  renderTokensOverlay(tokensLayerEl, boardEl, state, netSession.getRoster(), netSession.getCustomAvatars());

  const canAct = netSession.isLocalTurn(state);
  const remoteSpin = netSession.isRemotePencilSpinning();
  const remoteStop = netSession.getRemotePencilStopFace();
  const reconnecting = netSession.isReconnecting();
  turnCue.sync(state, canAct);

  const remotePencilChanged =
    !canAct && (remoteSpin !== lastRenderedRemoteSpin || remoteStop !== lastRenderedRemoteStop);
  if (
    canAct === lastRenderedCanAct &&
    reconnecting === lastRenderedReconnecting &&
    state.phase === 'ROLL_PENCIL' &&
    remotePencilChanged &&
    updateRemotePencil(remoteSpin, remoteStop)
  ) {
    lastRenderedRemoteSpin = remoteSpin;
    lastRenderedRemoteStop = remoteStop;
    return;
  }
  if (
    canAct !== lastRenderedCanAct ||
    reconnecting !== lastRenderedReconnecting ||
    remotePencilChanged ||
    state.phase === 'GAME_OVER'
  ) {
    paintBoard(computeMovePreview(state), canAct);
    renderActionBox(canAct, remoteSpin, remoteStop);
    moveDriver.scheduleTick();
  }
}

function render(): void {
  const prev = prevRenderedState;
  if (prev && prev !== state) stageCashbackHud(hudEl, prev, state);
  const preview = computeMovePreview(state);
  const canAct = netSession.isLocalTurn(state);
  const diffEvents = diffGameStates(prev, state);
  const moveHints = new Map<string, TokenMoveHint>();
  for (const ev of diffEvents) {
    if (ev.type === 'player_moved' && ev.durationMs !== undefined) {
      moveHints.set(ev.playerId, { kind: ev.kind, durationMs: ev.durationMs });
    }
  }

  syncHeaderAndHud();
  paintBoard(preview, canAct);
  drawRoutes(preview);
  renderTokensOverlay(tokensLayerEl, boardEl, state, netSession.getRoster(), netSession.getCustomAvatars(), moveHints);
  fxOverlay.playStateDiff(prev, state, diffEvents);
  prevRenderedState = state;

  if (
    prev &&
    moveDriver.isMovingPhase(prev.phase) &&
    !moveDriver.isMovingPhase(state.phase) &&
    state.phase !== 'ROLL_PENCIL' &&
    state.phase !== 'GAME_OVER' &&
    canAct
  ) {
    armLandingLock();
  } else if (prev && prev.phase !== state.phase) {
    clearLandingLock();
  }

  const activeEl =
    boardStageEl.scrollWidth > boardStageEl.clientWidth
      ? getBoardTileElement(boardEl, getActivePlayer(state).tileId)
      : undefined;
  if (activeEl) {
    boardStageEl.scrollTo({
      left: Math.max(0, activeEl.offsetLeft - boardStageEl.clientWidth / 2 + activeEl.offsetWidth / 2),
      behavior: 'smooth',
    });
  }

  renderActionBox(canAct);
  turnCue.sync(state, canAct);
  renderMatchLog(logBox, state);
  setupModal.refresh();
  moveDriver.scheduleTick();
}

const syncBoardOverlays = () => {
  drawRoutes();
  renderTokensOverlay(tokensLayerEl, boardEl, state, netSession.getRoster(), netSession.getCustomAvatars());
};
window.addEventListener('resize', syncBoardOverlays);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncBoardOverlays).observe(boardEl);
window.addEventListener('beforeunload', (e) => {
  if (shouldWarnBeforeUnload(state, netSession.getRole(), netSession.getRoster())) {
    e.preventDefault();
    e.returnValue = '';
  }
});

render();
const roomParam = new URLSearchParams(window.location.search).get('room')?.trim();
if (roomParam) openLobby(roomParam);
else homeModal.open();
