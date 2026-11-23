import type { AvatarSpec } from '../config/avatarTypes';
import type { GameState } from '../engine/types';
import { normalizeRoomCode } from '../net/protocol';
import type { ConnectedPeerInfo } from '../net/protocol';
import type { MultiplayerSession } from '../net/session';
import { addLobbySection, mk, mkBtn, renderActiveRoomView } from './lobbyRoomView';
import {
  createProfileEditorRow,
  GUEST_PROFILE_STORAGE_KEY,
  loadUserProfile,
  saveUserProfile,
} from './playerProfile';
import type { UserProfile } from './playerProfile';

export { GUEST_PROFILE_STORAGE_KEY };

export interface LobbyModalOptions {
  netSession: MultiplayerSession;
  getState: () => GameState;
  getDefaultProfile: () => { name: string; color: string; avatar?: AvatarSpec };
  onAddPlayerSlot?: (peer: ConnectedPeerInfo) => void;
  onEditAvatar?: (current: AvatarSpec, color: string, onSave: (next: AvatarSpec) => void, title?: string) => void;
  onUpdateHostSeat?: (seatIndex: number, next: UserProfile) => void;
  onOpenMatchSetup?: () => void;
  onProfileChange?: (next: UserProfile) => void;
}

export interface LobbyModalController {
  el: HTMLElement;
  open: (prefillRoomCode?: string) => void;
  close: () => void;
  isOpen: () => boolean;
  refresh: () => void;
  showStatus: (message: string, isError?: boolean) => void;
}

function mkCodeInput(value: string, maxLength: number, placeholder: string, onCode: (code: string) => void): HTMLInputElement {
  const input = Object.assign(mk('input', 'setup-input'), { type: 'text', value, maxLength, placeholder });
  input.addEventListener('input', () => {
    const clean = normalizeRoomCode(input.value);
    onCode(clean);
    if (input.value !== clean) input.value = clean;
  });
  return input;
}

export function createLobbyModal(options: LobbyModalOptions): LobbyModalController {
  let profile = loadUserProfile(options.getDefaultProfile());
  let draftHostCode = '';
  let draftJoinCode = '';
  let visible = false;
  let busy = false;

  const backdrop = Object.assign(mk('div', 'setup-backdrop'), { hidden: true });
  const modal = mk('div', 'setup-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  backdrop.appendChild(modal);

  const statusEl = Object.assign(mk('div', 'setup-status'), { hidden: true });
  const bodyEl = mk('div', 'lobby-body');
  const close = () => { visible = false; backdrop.hidden = true; };

  const header = mk('div', 'setup-header');
  header.append(mk('h2', 'setup-title', 'Online P2P Multiplayer Lobby'), mkBtn('Close (Esc)', close));
  const footer = mk('div', 'setup-footer');
  footer.append(mk('span', 'setup-muted', 'Host owns the match clock & rules.'), mkBtn('Back to Game', close));
  modal.append(header, statusEl, bodyEl, footer);

  function showStatus(message: string, isError = false): void {
    statusEl.textContent = message;
    statusEl.className = `setup-status${isError ? ' is-error' : ''}`;
    statusEl.hidden = !message;
  }

  function runConnect(pendingMsg: string, task: () => Promise<string | void>, okText: (res: string | void) => string): void {
    busy = true;
    showStatus(pendingMsg);
    renderBody();
    task().then(
      (res) => { busy = false; showStatus(okText(res)); renderBody(); },
      (err: Error) => { busy = false; showStatus(err.message || 'Connection failed.', true); renderBody(); }
    );
  }

  function renderOfflineView(): void {
    const profileSec = addLobbySection('Your Standee & Guest Profile');
    profileSec.appendChild(createProfileEditorRow({
      profile,
      avatarTitle: 'Customize Guest Standee',
      onChange: (next) => {
        profile = next;
        saveUserProfile(profile);
        options.onProfileChange?.(profile);
      },
      onEditAvatar: options.onEditAvatar
        ? (cur, col, onSave) => options.onEditAvatar!(cur, col, onSave, 'Customize Guest Standee')
        : undefined,
    }));

    const hostSec = addLobbySection('Host a Private Room');
    hostSec.appendChild(mk('div', 'setup-muted', 'Mix local couch seats and online friends across P1–P6. Share the room code after hosting.'));
    const hostRow = mk('div', 'setup-player-row');
    const hostInput = mkCodeInput(draftHostCode, 8, 'Custom code (blank = random 6 chars)', (c) => { draftHostCode = c; });
    const triggerHost = () => runConnect(
      'Creating room...',
      () => options.netSession.hostRoom(draftHostCode),
      (code) => `Room ${code} ready! Share the code or invite link.`
    );
    hostRow.append(hostInput, mkBtn(busy ? 'Connecting...' : 'Host Online Room', triggerHost, 'primary', busy));
    hostSec.appendChild(hostRow);

    const joinSec = addLobbySection('Join a Room');
    const joinRow = mk('div', 'setup-player-row');
    const joinInput = mkCodeInput(draftJoinCode, 12, 'Enter Room Code (e.g. 7K9P2M)', (c) => { draftJoinCode = c; });
    const triggerJoin = () => {
      saveUserProfile(profile);
      runConnect(
        `Joining room ${draftJoinCode || '...'}...`,
        () => options.netSession.joinRoom(draftJoinCode, profile),
        () => `Connected to room ${options.netSession.getRoomCode() ?? draftJoinCode}!`
      );
    };
    joinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !busy) triggerJoin(); });
    joinRow.append(joinInput, mkBtn(busy ? 'Connecting...' : 'Join Room', triggerJoin, 'primary', busy));
    joinSec.appendChild(joinRow);

    bodyEl.append(profileSec, hostSec, joinSec);
  }

  function renderBody(): void {
    bodyEl.innerHTML = '';
    const role = options.netSession.getRole();
    const roster = options.netSession.getRoster();
    if (role === 'offline' || !roster) {
      renderOfflineView();
    } else {
      renderActiveRoomView(bodyEl, {
        role,
        roster,
        state: options.getState(),
        netSession: options.netSession,
        showStatus,
        onAddPlayerSlot: options.onAddPlayerSlot,
        guestProfile: profile,
        onSaveGuestProfile: (next) => {
          profile = next;
          saveUserProfile(profile);
          options.onProfileChange?.(profile);
          options.netSession.updateMyProfile(profile);
          showStatus('Profile updated & synced!');
          renderBody();
        },
        onEditAvatar: options.onEditAvatar,
        onUpdateHostSeat: options.onUpdateHostSeat,
        onOpenMatchSetup: options.onOpenMatchSetup,
      });
    }
  }

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  return {
    el: backdrop,
    open: (prefillRoomCode) => {
      profile = loadUserProfile(options.getDefaultProfile());
      if (prefillRoomCode) draftJoinCode = normalizeRoomCode(prefillRoomCode);
      visible = true;
      backdrop.hidden = false;
      renderBody();
    },
    close,
    isOpen: () => visible,
    refresh: () => { if (visible) renderBody(); },
    showStatus,
  };
}
