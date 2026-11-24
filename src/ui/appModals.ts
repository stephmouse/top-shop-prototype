import { MAX_PLAYERS, PLAYER_COLORS } from '../config/balance';
import { getStageDef } from '../config/maps';
import type { StageId } from '../config/maps';
import type { GameState } from '../engine/types';
import type { ConnectedPeerInfo } from '../net/protocol';
import type { MultiplayerSession } from '../net/session';
import { createAvatarModal } from './avatarModal';
import type { AvatarModalController } from './avatarModal';
import { createHomeModal } from './homeModal';
import type { HomeModalController } from './homeModal';
import { createHowToPlayModal } from './howToPlayModal';
import type { HowToPlayModalController } from './howToPlayModal';
import { buildExtendedLocalPlayers } from './hostProfileSync';
import { createLobbyModal } from './lobbyModal';
import type { LobbyModalController } from './lobbyModal';
import { loadManualMatchSlot } from './persistence';
import type { MatchSetupData, SavedMatchEnvelope } from './persistence';
import { loadUserProfile } from './playerProfile';
import type { UserProfile } from './playerProfile';
import { createSetupModal } from './setupModal';
import type { SetupModalController } from './setupModal';
import type { SoundFxController } from './soundFx';
import { createTopbar } from './topbar';
import type { TopbarController } from './topbar';

export interface AppModalsOptions {
  netSession: MultiplayerSession;
  soundFx: SoundFxController;
  getState: () => GameState;
  getSetup: () => MatchSetupData;
  initialShowRoutes: boolean;
  initialAutoStep: boolean;
  onToggleRoutes: (show: boolean) => void;
  onToggleAutoStep: (enabled: boolean) => void;
  onStartMatch: (setup: MatchSetupData) => void;
  onSaveMatch: () => SavedMatchEnvelope;
  onLoadMatch: (state: GameState) => void;
  onDiscardResume: () => void;
  onUpdateProfile: (next: UserProfile) => void;
  onUpdateHostSeat: (seatIdx: number, next: UserProfile) => void;
}

export interface AppModals {
  topbar: TopbarController;
  homeModal: HomeModalController;
  setupModal: SetupModalController;
  lobbyModal: LobbyModalController;
  avatarModal: AvatarModalController;
  howToPlayModal: HowToPlayModalController;
  openSetup: () => void;
  openLobby: (code?: string) => void;
  syncTopbar: (hasSave?: boolean) => void;
  isAnyModalOpen: () => boolean;
  closeTopModal: () => void;
  refreshAll: () => void;
}

/** Instantiates and cross-wires the topbar and all application modals. */
export function createAppModals(options: AppModalsOptions): AppModals {
  const { netSession, soundFx } = options;

  const getPrimaryFallback = () => {
    const first = options.getSetup().players[0];
    return {
      name: first?.name ?? 'Player 1',
      color: first?.color ?? PLAYER_COLORS[0]!,
      avatar: first?.avatar,
    };
  };

  const avatarModal = createAvatarModal({
    onPreviewWalkSound: (c) => soundFx.playWalkSoundPreview(c),
  });
  const howToPlayModal = createHowToPlayModal();

  const openSetup = () => {
    homeModal.close();
    lobbyModal.close();
    setupModal.open(options.getSetup());
  };

  const openLobby = (code?: string) => {
    homeModal.close();
    setupModal.close();
    lobbyModal.open(code);
  };

  const setupModal = createSetupModal({
    initialSetup: options.getSetup(),
    onStartMatch: options.onStartMatch,
    onSaveMatch: options.onSaveMatch,
    onLoadMatch: options.onLoadMatch,
    onEditAvatar: (idx, cur, col, onSave) => avatarModal.open(cur, col, `Customize Player ${idx + 1} Standee`, onSave),
    getOnlineContext: () => ({
      role: netSession.getRole(),
      roster: netSession.getRoster(),
      customAvatars: netSession.getCustomAvatars(),
    }),
    onOpenLobby: () => lobbyModal.open(),
  });

  const lobbyModal = createLobbyModal({
    netSession,
    getState: options.getState,
    getDefaultProfile: () => {
      const second = options.getSetup().players[1];
      return {
        name: second?.name ?? 'Guest',
        color: second?.color ?? PLAYER_COLORS[1]!,
        avatar: second?.avatar,
      };
    },
    onAddPlayerSlot: (peer: ConnectedPeerInfo) => {
      const setup = options.getSetup();
      if (netSession.getRole() !== 'host' || options.getState().players.length >= MAX_PLAYERS) return;
      const players = buildExtendedLocalPlayers(setup);
      options.onStartMatch({ ...setup, players });
      netSession.assignSeat(players.length - 1, peer.id);
      lobbyModal.showStatus(`Added Player ${players.length} slot for ${peer.name}.`);
    },
    onEditAvatar: (cur, col, onSave, title = 'Customize Guest Standee') => avatarModal.open(cur, col, title, onSave),
    onUpdateHostSeat: options.onUpdateHostSeat,
    onOpenMatchSetup: openSetup,
    onProfileChange: options.onUpdateProfile,
  });

  const homeModal = createHomeModal({
    getState: options.getState,
    getProfile: () => loadUserProfile(getPrimaryFallback()),
    onUpdateProfile: options.onUpdateProfile,
    onEditAvatar: (cur, col, onSave, title = 'Customize Your Standee') => avatarModal.open(cur, col, title, onSave),
    onOpenHowToPlay: () => howToPlayModal.open(),
    onPlayLocal: () => setupModal.open(options.getSetup()),
    onHostOnline: async (customCode) => {
      const code = await netSession.hostRoom(customCode);
      syncTopbar();
      lobbyModal.open();
      lobbyModal.showStatus(`Room ${code} ready! Share the code or invite link.`);
      return code;
    },
    onJoinOnline: async (roomCode, prof) => {
      options.onUpdateProfile(prof);
      await netSession.joinRoom(roomCode, prof);
      syncTopbar();
    },
    onDiscardResume: options.onDiscardResume,
  });

  const topbar = createTopbar({
    initialShowRoutes: options.initialShowRoutes,
    initialAutoStep: options.initialAutoStep,
    initialSoundEnabled: !soundFx.isMuted(),
    initialStageId: options.getState().mapId as StageId,
    onToggleRoutes: options.onToggleRoutes,
    onToggleAutoStep: options.onToggleAutoStep,
    onToggleSound: (enabled) => soundFx.setMuted(!enabled),
    onSelectStage: (stageId) => {
      const setup = options.getSetup();
      const stg = getStageDef(stageId);
      options.onStartMatch({
        ...setup,
        stageId,
        config: {
          ...setup.config,
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
    onSaveMatch: options.onSaveMatch,
    onLoadMatch: () => {
      const slot = loadManualMatchSlot();
      if (slot) options.onLoadMatch(slot.state);
    },
    onNewMatch: (count) => {
      const setup = options.getSetup();
      options.onStartMatch({
        ...setup,
        players: Array.from(
          { length: count },
          (_, i) =>
            setup.players[i] ?? {
              name: `Player ${i + 1}`,
              color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
              isBot: false,
            }
        ),
      });
    },
  });

  const syncTopbar = (hasSave = Boolean(loadManualMatchSlot())) => {
    const roster = netSession.getRoster();
    topbar.sync(options.getState().mapId as StageId, hasSave, {
      role: netSession.getRole(),
      roomCode: netSession.getRoomCode(),
      peerCount: roster?.peers.filter((p) => p.connected).length ?? 0,
      waitingCount: roster?.peers.filter((p) => p.connected && !roster.seatOwners.includes(p.id)).length ?? 0,
      reconnecting: netSession.isReconnecting(),
    });
  };

  setupModal.el.addEventListener('click', () => syncTopbar());

  return {
    topbar,
    homeModal,
    setupModal,
    lobbyModal,
    avatarModal,
    howToPlayModal,
    openSetup,
    openLobby,
    syncTopbar,
    isAnyModalOpen: () =>
      avatarModal.isOpen() ||
      howToPlayModal.isOpen() ||
      homeModal.isOpen() ||
      setupModal.isOpen() ||
      lobbyModal.isOpen(),
    closeTopModal: () => {
      if (avatarModal.isOpen()) return avatarModal.close();
      if (howToPlayModal.isOpen()) return howToPlayModal.close();
      homeModal.close();
      setupModal.close();
      lobbyModal.close();
    },
    refreshAll: () => {
      lobbyModal.refresh();
      setupModal.refresh();
      homeModal.refresh();
    },
  };
}
