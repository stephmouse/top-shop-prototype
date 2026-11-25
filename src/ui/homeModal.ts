import { APP_VERSION } from '../config/appVersion';
import type { AvatarSpec } from '../config/avatarTypes';
import { getStageDef } from '../config/maps';
import type { StageId } from '../config/maps';
import { formatCalendarDate } from '../engine/eventDraw';
import type { GameState } from '../engine/types';
import { normalizeRoomCode } from '../net/protocol';
import { addLobbySection, mk, mkBtn } from './lobbyRoomView';
import { createProfileEditorRow, isMatchInProgress } from './playerProfile';
import type { UserProfile } from './playerProfile';

export interface HomeModalOptions {
  getState: () => GameState;
  getProfile: () => UserProfile;
  onUpdateProfile: (next: UserProfile) => void;
  onEditAvatar?: (current: AvatarSpec, color: string, onSave: (next: AvatarSpec) => void, title?: string) => void;
  onOpenHowToPlay?: () => void;
  onPlayLocal: () => void;
  onHostOnline: (customCode: string) => Promise<string>;
  onJoinOnline: (roomCode: string, profile: UserProfile) => Promise<void>;
  onDiscardResume: () => void;
}

export interface HomeModalController {
  el: HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  refresh: () => void;
}

function mkCodeField(value: string, maxLength: number, placeholder: string, onCode: (code: string) => void): HTMLInputElement {
  const input = Object.assign(mk('input', 'setup-input'), { type: 'text', value, maxLength, placeholder });
  input.addEventListener('input', () => {
    const clean = normalizeRoomCode(input.value);
    onCode(clean);
    if (input.value !== clean) input.value = clean;
  });
  return input;
}

export function createHomeModal(options: HomeModalOptions): HomeModalController {
  let visible = false;
  let busy = false;
  let draftHostCode = '';
  let draftJoinCode = '';

  const backdrop = Object.assign(mk('div', 'setup-backdrop home-backdrop'), { hidden: true });
  const modal = mk('div', 'setup-modal home-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  backdrop.appendChild(modal);

  const statusEl = Object.assign(mk('div', 'setup-status'), { hidden: true });
  const bodyEl = mk('div', 'lobby-body');
  const close = () => { visible = false; backdrop.hidden = true; };

  const header = mk('div', 'setup-header home-hero');
  const titleWrap = mk('div', 'home-title-wrap');
  const titleRow = mk('div', 'home-title-row');
  titleRow.append(
    mk('h2', 'setup-title home-title', 'TOP SHOP'),
    mk('span', 'app-version-tag', `v${APP_VERSION}`)
  );
  titleWrap.append(
    titleRow,
    mk('span', 'setup-muted', 'Mall Tycoon · Local Couch & Online P2P')
  );
  const headerBtns = mk('div', 'setup-btn-row');
  if (options.onOpenHowToPlay) headerBtns.appendChild(mkBtn('How to Play', () => options.onOpenHowToPlay?.()));
  headerBtns.appendChild(mkBtn('View Board', close));
  header.append(titleWrap, headerBtns);
  modal.append(header, statusEl, bodyEl);

  function showStatus(message: string, isError = false): void {
    statusEl.textContent = message;
    statusEl.className = `setup-status${isError ? ' is-error' : ''}`;
    statusEl.hidden = !message;
  }

  function renderBody(): void {
    bodyEl.innerHTML = '';
    const profile = options.getProfile();

    const profSec = addLobbySection('Your Standee & Profile');
    profSec.appendChild(createProfileEditorRow({
      profile,
      avatarTitle: 'Customize Your Standee',
      onChange: (next) => options.onUpdateProfile(next),
      onEditAvatar: options.onEditAvatar
        ? (cur, col, onSave) => options.onEditAvatar!(cur, col, onSave, 'Customize Your Standee')
        : undefined,
    }));
    bodyEl.appendChild(profSec);

    const state = options.getState();
    if (isMatchInProgress(state)) {
      const stageName = getStageDef(state.mapId as StageId).name;
      const cal = formatCalendarDate(state.month, state.year);
      const names = state.players.map((p) => p.name).join(', ');
      const resumeSec = addLobbySection('Resume Previous Match', 'home-resume-card');
      const row = mk('div', 'setup-row-between');
      const info = mk('div', 'home-resume-info');
      info.append(
        mk('div', 'home-resume-meta', `${stageName} · Turn ${state.turnNumber} (${cal}) · ${state.players.length}P`),
        mk('div', 'setup-muted', `Players: ${names}`)
      );
      const btns = mk('div', 'setup-btn-row');
      btns.append(
        mkBtn('Resume Match', close, 'primary', busy),
        mkBtn('Discard Save', () => {
          options.onDiscardResume();
          showStatus('Cleared previous match.');
          renderBody();
        }, '', busy)
      );
      row.append(info, btns);
      resumeSec.appendChild(row);
      bodyEl.appendChild(resumeSec);
    }

    const grid = mk('div', 'home-actions-grid');

    const localCard = addLobbySection('Play Local Match', 'home-action-card');
    localCard.append(
      mk('p', 'setup-muted home-card-desc', 'Pass-and-play on this device for 2–6 players with custom map & rules.'),
      mkBtn('Match Setup & Play', () => { close(); options.onPlayLocal(); }, 'primary', busy)
    );

    const hostCard = addLobbySection('Host Online Session', 'home-action-card');
    hostCard.appendChild(mk('p', 'setup-muted home-card-desc', 'Start a private P2P room and mix local couch players with online friends.'));
    const hostInput = mkCodeField(draftHostCode, 8, 'Room code (blank = random)', (c) => { draftHostCode = c; });
    const triggerHost = () => {
      if (busy) return;
      busy = true;
      showStatus('Creating online room...');
      renderBody();
      options.onHostOnline(draftHostCode).then(
        () => { busy = false; showStatus(''); close(); },
        (err: Error) => { busy = false; showStatus(err.message || 'Failed to host room.', true); renderBody(); }
      );
    };
    hostCard.append(hostInput, mkBtn(busy ? 'Connecting...' : 'Host Online Room', triggerHost, 'primary', busy));

    const joinCard = addLobbySection('Join Online Room', 'home-action-card');
    joinCard.appendChild(mk('p', 'setup-muted home-card-desc', 'Enter a host code to join with your profile & standee above.'));
    const joinInput = mkCodeField(draftJoinCode, 12, 'Enter Code (e.g. 7K9P2M)', (c) => { draftJoinCode = c; });
    const triggerJoin = () => {
      if (busy) return;
      busy = true;
      showStatus(`Joining room ${draftJoinCode || '...'}...`);
      renderBody();
      options.onJoinOnline(draftJoinCode, options.getProfile()).then(
        () => { busy = false; showStatus(''); close(); },
        (err: Error) => { busy = false; showStatus(err.message || 'Failed to join room.', true); renderBody(); }
      );
    };
    joinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !busy) triggerJoin(); });
    joinCard.append(joinInput, mkBtn(busy ? 'Connecting...' : 'Join Room', triggerJoin, 'primary', busy));

    grid.append(localCard, hostCard, joinCard);
    bodyEl.appendChild(grid);
  }

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  return {
    el: backdrop,
    open: () => {
      showStatus('');
      visible = true;
      backdrop.hidden = false;
      renderBody();
    },
    close,
    isOpen: () => visible,
    refresh: () => { if (visible) renderBody(); },
  };
}
