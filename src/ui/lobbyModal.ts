import { sanitizeAvatarSpec } from '../config/avatarTypes';
import type { AvatarSpec } from '../config/avatarTypes';
import type { GameState } from '../engine/types';
import { HEX_COLOR_RE, normalizeRoomCode } from '../net/protocol';
import type { ConnectedPeerInfo } from '../net/protocol';
import type { MultiplayerSession } from '../net/session';
import { createAvatarElement } from './avatarSvg';
import { addLobbySection, mk, mkBtn, renderActiveRoomView } from './lobbyRoomView';

export const GUEST_PROFILE_STORAGE_KEY = 'top_shop_guest_profile_v1';

interface GuestProfile { name: string; color: string; avatar: AvatarSpec; }

function getLocalStore(): Storage | null {
  try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch { return null; }
}

function loadGuestProfile(fallback: { name: string; color: string; avatar?: AvatarSpec }): GuestProfile {
  const def: GuestProfile = {
    name: fallback.name.trim().slice(0, 18) || 'Guest',
    color: HEX_COLOR_RE.test(fallback.color) ? fallback.color : '#3498db',
    avatar: sanitizeAvatarSpec(fallback.avatar, 1),
  };
  const store = getLocalStore();
  if (!store) return def;
  try {
    const rawText = store.getItem(GUEST_PROFILE_STORAGE_KEY);
    if (!rawText) return def;
    const raw: unknown = JSON.parse(rawText);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return def;
    const r = raw as Record<string, unknown>;
    return {
      name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 18) : def.name,
      color: typeof r.color === 'string' && HEX_COLOR_RE.test(r.color) ? r.color : def.color,
      avatar: sanitizeAvatarSpec(r.avatar, 1),
    };
  } catch { return def; }
}

function saveGuestProfile(prof: GuestProfile): void {
  const store = getLocalStore();
  if (!store) return;
  try { store.setItem(GUEST_PROFILE_STORAGE_KEY, JSON.stringify(prof)); } catch { /* Ignore quota errors */ }
}

export interface LobbyModalOptions {
  netSession: MultiplayerSession;
  getState: () => GameState;
  getDefaultProfile: () => { name: string; color: string; avatar?: AvatarSpec };
  onAddPlayerSlot?: (peer: ConnectedPeerInfo) => void;
  onEditAvatar?: (current: AvatarSpec, color: string, onSave: (next: AvatarSpec) => void) => void;
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
  const profile = loadGuestProfile(options.getDefaultProfile());
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
    const profileSec = addLobbySection('Your Guest Profile (When Joining)');
    const profileRow = mk('div', 'setup-player-row');
    const avatarBtn = Object.assign(mk('button', 'setup-avatar-btn'), { type: 'button' as const, title: 'Customize Guest Standee' });
    avatarBtn.style.borderColor = profile.color;
    avatarBtn.appendChild(createAvatarElement(profile.avatar, profile.color));
    const openCustomize = () => options.onEditAvatar?.(profile.avatar, profile.color, (next) => {
      profile.avatar = next; saveGuestProfile(profile); renderBody();
    });
    avatarBtn.addEventListener('click', openCustomize);
    const nameInput = Object.assign(mk('input', 'setup-input'), { type: 'text', value: profile.name, maxLength: 18, placeholder: 'Your Name' });
    nameInput.addEventListener('input', () => { profile.name = nameInput.value.trim() || 'Guest'; saveGuestProfile(profile); });
    const colorInput = Object.assign(mk('input', 'setup-color-picker'), { type: 'color', value: profile.color });
    colorInput.addEventListener('input', () => { profile.color = colorInput.value; avatarBtn.style.borderColor = colorInput.value; saveGuestProfile(profile); });
    colorInput.addEventListener('change', () => { profile.color = colorInput.value; saveGuestProfile(profile); renderBody(); });
    profileRow.append(avatarBtn, nameInput, colorInput, mkBtn('Customize', openCustomize));
    profileSec.appendChild(profileRow);

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
      saveGuestProfile(profile);
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
      });
    }
  }

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  return {
    el: backdrop,
    open: (prefillRoomCode) => {
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
