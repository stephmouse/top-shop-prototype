import type { GameAction } from '../engine/actions';
import { getActivePlayer } from '../engine/helpers';
import { computeMovePreview } from '../engine/movePreview';
import type { GameState, PencilFace } from '../engine/types';
import type { MultiplayerSession } from '../net/session';
import { resolvePlayerSignatures } from '../net/signatureSync';
import { renderActionPanel } from './actionPanel';
import { getBoardTileElement, renderBoard, renderPlayersHud, renderTokensOverlay } from './boardView';
import { buildBoardShopPick } from './boardPickState';
import { syncBoardHoverHighlight } from './choiceUi';
import { createFxOverlay } from './fxOverlay';
import type { TokenMoveHint } from './hudView';
import { renderMatchLog } from './matchLogView';
import type { MovementDriver } from './movementDriver';
import { updateRemotePencil } from './pencilView';
import { resetPlayersHudCache, stageCashbackHud } from './playerCardView';
import { renderRouteOverlay } from './routeOverlay';
import type { SoundFxController } from './soundFx';
import { diffGameStates } from './stateDiff';
import { createTurnCueTracker } from './turnCue';
import { resolveWinReason } from './victoryModal';

const LANDING_LOCK_MS = 380;

export interface GameRendererOptions {
  getState: () => GameState;
  netSession: MultiplayerSession;
  moveDriver: MovementDriver;
  soundFx: SoundFxController;
  dispatch: (action: GameAction) => void;
  onOpenSetup: () => void;
  onOpenVictory?: () => void;
  onMatchEnded?: () => void;
  onInspectShop?: (shopId: string) => void;
  syncTopbar: () => void;
  onRefreshModals: () => void;
  onRefreshSetupModal: () => void;
  initialShowRoutes?: boolean;
}

export interface GameRenderer {
  shell: HTMLElement;
  hudEl: HTMLElement;
  boardStageEl: HTMLElement;
  bottomGrid: HTMLElement;
  actionBox: HTMLElement;
  isLandingLocked: () => boolean;
  clearHoverState: () => void;
  resetVisualState: () => void;
  setShowRoutes: (show: boolean) => void;
  showTurnPing: (fromName: string, targetPlayerName: string, targetPlayerId: string) => void;
  renderSessionUi: () => void;
  render: () => void;
}

function mk<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), { className });
}

/** Owns the board, HUD, FX overlays, route SVG, action panel, and match log rendering pipeline. */
export function createGameRenderer(options: GameRendererOptions): GameRenderer {
  const { netSession, moveDriver, soundFx } = options;

  let showRoutes = options.initialShowRoutes ?? true;
  let hoveredEndTileId: string | null = null;
  let hoveredPickShopId: string | null = null;
  let lastRenderedCanAct: boolean | null = null;
  let lastRenderedRemoteSpin = false;
  let lastRenderedReconnecting = false;
  let lastRenderedRemoteStop: PencilFace | null = null;
  let prevRenderedState: GameState | null = null;
  let landingLockUntil = 0;
  let landingLockTimer: number | null = null;

  const shell = mk('div', 'app-shell');
  const hudEl = mk('section', 'hud-row');
  const boardStageEl = mk('section', 'board-stage');
  const boardEl = mk('div', 'board-grid');
  const tokensLayerEl = mk('div', 'tokens-layer');
  const routeSvgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  routeSvgEl.setAttribute('class', 'route-layer');

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

  function drawRoutes(preview = computeMovePreview(options.getState())): void {
    renderRouteOverlay(routeSvgEl, boardEl, options.getState(), preview, showRoutes, hoveredEndTileId);
  }

  function syncHeaderAndHud(): void {
    const state = options.getState();
    options.syncTopbar();
    hudEl.classList.toggle('is-large-match', state.players.length >= 7);
    renderPlayersHud(hudEl, state, {
      role: netSession.getRole(),
      roster: netSession.getRoster(),
      myPeerId: netSession.getMyPeerId(),
      customAvatars: netSession.getCustomAvatars(),
    });
  }

  function refreshPickUi(): void {
    const state = options.getState();
    const canAct = netSession.isLocalTurn(state);
    paintBoard(computeMovePreview(state), canAct);
    renderActionBox(canAct);
  }

  function currentSignatures() {
    return resolvePlayerSignatures(
      options.getState(),
      netSession.getRoster(),
      netSession.getSyncedSignatures()
    );
  }

  function renderActionBox(
    canAct: boolean,
    remoteSpin = netSession.isRemotePencilSpinning(),
    remoteStop = netSession.getRemotePencilStopFace()
  ): void {
    const state = options.getState();
    const reconnecting = netSession.isReconnecting();
    lastRenderedCanAct = canAct;
    lastRenderedRemoteSpin = remoteSpin;
    lastRenderedRemoteStop = remoteStop;
    lastRenderedReconnecting = reconnecting;
    renderActionPanel(actionBox, state, options.dispatch, {
      onOpenSetup: netSession.getRole() === 'guest' ? undefined : options.onOpenSetup,
      onOpenVictory: options.onOpenVictory,
      readOnly: !canAct,
      reconnecting,
      syncedSignatures: currentSignatures(),
      remotePencilSpinning: remoteSpin,
      remotePencilStopFace: remoteStop,
      onPencilSpinChange: (spinning, stopFace) => netSession.notifyPencilSpin(spinning, stopFace),
      onPencilTick: (isSlow, speedNorm) => soundFx.playPencilTick(isSlow, speedNorm),
      onPencilLanded: (face) => soundFx.playPencilStop(face === 'E'),
      onUiChange: refreshPickUi,
      onHoverShop: (shopId) => {
        if (hoveredPickShopId !== shopId) {
          hoveredPickShopId = shopId;
          paintBoard();
        }
      },
      onPreviewWalkSound: (choice) => soundFx.playWalkSoundPreview(choice),
      onPingTurn: netSession.getRole() !== 'offline' ? () => netSession.sendTurnPing() : undefined,
    });
  }

  function paintBoard(
    preview = computeMovePreview(options.getState()),
    canAct = netSession.isLocalTurn(options.getState())
  ): void {
    const state = options.getState();
    renderBoard(boardEl, state, {
      preview,
      syncedSignatures: currentSignatures(),
      shopPick: canAct ? buildBoardShopPick(state, options.dispatch, refreshPickUi, hoveredPickShopId) : null,
      onInspectShop: options.onInspectShop,
      onSelectNextStep: (opt) =>
        options.dispatch(
          state.phase === 'CHOOSE_DIRECTION' && opt.direction
            ? { type: 'CHOOSE_DIRECTION', direction: opt.direction }
            : { type: 'ADVANCE_STEP' }
        ),
      onSelectEndTarget: (target) => {
        if (netSession.isLocalTurn(options.getState())) {
          hoveredEndTileId = null;
          moveDriver.startGuidedWalk(target.queuedChoices);
        }
      },
      onHoverEndTarget: (tileId) => {
        hoveredEndTileId = tileId;
        drawRoutes(preview);
      },
      onHoverShop: (shopId) => syncBoardHoverHighlight(actionBox, shopId),
    });
  }

  function syncBoardOverlays(): void {
    drawRoutes();
    renderTokensOverlay(tokensLayerEl, boardEl, options.getState(), netSession.getRoster(), netSession.getCustomAvatars());
  }

  window.addEventListener('resize', syncBoardOverlays);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(syncBoardOverlays).observe(boardEl);
  }

  return {
    shell,
    hudEl,
    boardStageEl,
    bottomGrid,
    actionBox,
    isLandingLocked: () => Date.now() < landingLockUntil,
    clearHoverState: () => {
      hoveredEndTileId = null;
      hoveredPickShopId = null;
      syncBoardHoverHighlight(actionBox, null);
    },
    resetVisualState: () => {
      clearLandingLock();
      hoveredEndTileId = null;
      hoveredPickShopId = null;
      syncBoardHoverHighlight(actionBox, null);
      turnCue.reset();
      resetPlayersHudCache(hudEl);
      tokensLayerEl.innerHTML = '';
      fxOverlay.clear();
      prevRenderedState = null;
    },
    setShowRoutes: (show) => {
      showRoutes = show;
      drawRoutes();
    },
    showTurnPing: (fromName, targetPlayerName, targetPlayerId) => {
      soundFx.playTurnPing();
      fxOverlay.showTurnPing(fromName, targetPlayerName, targetPlayerId);
    },
    renderSessionUi: () => {
      const state = options.getState();
      options.onRefreshModals();
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
    },
    render: () => {
      const state = options.getState();
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
      options.onRefreshSetupModal();
      moveDriver.scheduleTick();

      if (prev && prev.phase !== 'GAME_OVER' && state.phase === 'GAME_OVER') {
        soundFx.playVictoryFanfare(resolveWinReason(state));
        options.onMatchEnded?.();
      }
    },
  };
}
