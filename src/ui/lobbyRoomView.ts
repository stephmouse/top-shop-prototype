import type { AvatarSpec } from '../config/avatarTypes';
import { MAX_PLAYERS } from '../config/balance';
import type { SignatureStoreSpec } from '../config/signatureStore';
import type { GameState } from '../engine/types';
import { canClientAct, HOST_TOKEN } from '../net/protocol';
import type { ConnectedPeerInfo, NetRole, RoomRoster } from '../net/protocol';
import type { MultiplayerSession } from '../net/session';
import { createAvatarElement } from './avatarSvg';
import { createColorPickerButton, PLAYER_COLOR_SWATCHES } from './colorPickerButton';
import { resolvePlayerAvatar } from './hudView';
import { createProfileEditorRow } from './playerProfile';
import type { UserProfile } from './playerProfile';

export interface ActiveRoomViewContext {
  role: Exclude<NetRole, 'offline'>;
  roster: RoomRoster;
  state: GameState;
  netSession: MultiplayerSession;
  showStatus: (message: string, isError?: boolean) => void;
  onAddPlayerSlot?: (peer: ConnectedPeerInfo) => void;
  guestProfile?: UserProfile;
  onSaveGuestProfile?: (next: UserProfile) => void;
  onEditAvatar?: (current: AvatarSpec, color: string, onSave: (next: AvatarSpec) => void, title?: string) => void;
  onEditSignatureStore?: (
    current: SignatureStoreSpec | undefined,
    color: string,
    onSave: (next: SignatureStoreSpec | undefined) => void,
    title?: string
  ) => void;
  onUpdateHostSeat?: (seatIndex: number, next: UserProfile) => void;
  onOpenMatchSetup?: () => void;
}

export const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, textContent = '') =>
  Object.assign(document.createElement(tag), { className, textContent });

export function mkBtn(label: string, onClick: () => void, cls = '', disabled = false): HTMLButtonElement {
  const btn = Object.assign(mk('button', cls, label), { type: 'button' as const, disabled });
  btn.addEventListener('click', onClick);
  return btn;
}

export function addLobbySection(title?: string, extraClass = ''): HTMLElement {
  const sec = mk('section', extraClass ? `setup-section ${extraClass}` : 'setup-section');
  if (title) sec.appendChild(mk('h3', 'setup-section-title', title));
  return sec;
}

function mkDot(color: string): HTMLElement {
  const dot = mk('span', 'lobby-color-dot');
  dot.style.backgroundColor = color;
  return dot;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* Clipboard unavailable */ }
  return false;
}

export function renderActiveRoomView(container: HTMLElement, ctx: ActiveRoomViewContext): void {
  const { role, roster, state, netSession, showStatus } = ctx;
  const myPeerId = netSession.getMyPeerId();
  const onlineCount = roster.peers.filter((p) => p.connected).length;
  const waitingPeers = roster.peers.filter((p) => p.connected && !roster.seatOwners.includes(p.id));
  const isInProgress = state.turnNumber > 1 || state.phase !== 'ROLL_PENCIL';

  const infoSec = addLobbySection();
  const topRow = mk('div', 'setup-row-between');
  const pillRow = mk('div', 'setup-btn-row');
  pillRow.append(
    mk('span', 'lobby-code-pill', `Room: ${roster.roomCode}`),
    mk('span', 'net-seat-badge is-host', role === 'host' ? 'HOST' : 'GUEST'),
    mk('span', 'setup-muted', `${onlineCount} guest${onlineCount === 1 ? '' : 's'} online`)
  );
  topRow.append(
    pillRow,
    mkBtn('Disconnect', () => {
      netSession.disconnect();
      showStatus('Disconnected from online room.');
    })
  );

  const origin =
    typeof window !== 'undefined' && window.location ? window.location.origin + window.location.pathname : '/';
  const inviteUrl = `${origin}?room=${roster.roomCode}`;
  const shareRow = mk('div', 'setup-btn-row');
  shareRow.append(
    mkBtn('Copy Room Code', () => {
      void copyText(roster.roomCode).then((ok) =>
        showStatus(ok ? `Copied code ${roster.roomCode}!` : `Room code: ${roster.roomCode}`)
      );
    }),
    mkBtn(
      'Copy Invite Link',
      () => {
        void copyText(inviteUrl).then((ok) =>
          showStatus(ok ? 'Invite link copied!' : `Share link: ${inviteUrl}`)
        );
      },
      'primary'
    ),
    mkBtn('Open Guest Tab', () => window.open(inviteUrl, '_blank', 'noopener,noreferrer'))
  );
  if (role === 'host' && ctx.onOpenMatchSetup) {
    shareRow.appendChild(mkBtn('Match Setup & Rules', ctx.onOpenMatchSetup));
  }
  infoSec.append(topRow, shareRow);
  container.appendChild(infoSec);

  if (role === 'guest' && ctx.guestProfile && ctx.onSaveGuestProfile) {
    const profSec = addLobbySection('Your Standee & Profile');
    profSec.appendChild(mk('div', 'setup-muted lobby-profile-note', 'Edit your name, color, or standee live — changes sync to everyone.'));
    let draftProf = { ...ctx.guestProfile };
    profSec.appendChild(createProfileEditorRow({
      profile: draftProf,
      avatarTitle: 'Customize Your Standee',
      saveLabel: 'Update Profile',
      onChange: (next) => { draftProf = next; },
      onCommit: (next) => { draftProf = next; ctx.onSaveGuestProfile?.(next); },
      onEditAvatar: ctx.onEditAvatar
        ? (cur, col, onSave) => ctx.onEditAvatar!(cur, col, onSave, 'Customize Your Standee')
        : undefined,
      onEditSignatureStore: ctx.onEditSignatureStore
        ? (cur, col, onSave) => ctx.onEditSignatureStore!(cur, col, onSave, 'Customize Your Signature Store')
        : undefined,
    }));
    container.appendChild(profSec);
  }

  if (role === 'host' && waitingPeers.length > 0) {
    const waitSec = addLobbySection('Waiting Spectators (No Seat)', 'lobby-waiting-banner');
    if (state.players.length >= MAX_PLAYERS) {
      const names = waitingPeers.map((p) => p.name).join(', ');
      waitSec.appendChild(
        mk(
          'div',
          'setup-muted',
          `${names} joined as a spectator (maximum ${MAX_PLAYERS} player slots reached). You can reassign any seat below.`
        )
      );
    } else {
      for (const peer of waitingPeers) {
        const row = mk('div', 'lobby-peer-row');
        const info = mk('div', 'lobby-seat-info');
        info.append(
          mkDot(peer.color),
          mk('span', '', `${peer.name} joined as a spectator (all ${state.players.length} seats are taken).`)
        );
        row.appendChild(info);
        if (ctx.onAddPlayerSlot) {
          const nextNum = state.players.length + 1;
          const restartNote = isInProgress ? ` (restarts as ${nextNum}P)` : '';
          row.appendChild(
            mkBtn(
              `+ Add Player ${nextNum} Slot for ${peer.name}${restartNote}`,
              () => ctx.onAddPlayerSlot?.(peer),
              'primary'
            )
          );
        }
        waitSec.appendChild(row);
      }
    }
    container.appendChild(waitSec);
  } else if (role === 'guest' && !roster.seatOwners.includes(myPeerId)) {
    container.appendChild(
      mk(
        'div',
        'setup-status',
        'You are connected as a Spectator (no seat assigned yet). The Host can add a player slot or assign you a seat.'
      )
    );
  }

  const seatsSec = addLobbySection(`Seat Assignments (P1–P${state.players.length})`);
  const customAvatars = netSession.getCustomAvatars();
  state.players.forEach((player, idx) => {
    const ownerToken = roster.seatOwners[idx] ?? HOST_TOKEN;
    const isMine = canClientAct(role, roster, myPeerId, idx);
    const ownerPeer = roster.peers.find((p) => p.id === ownerToken);
    const resolvedAv = resolvePlayerAvatar(state, idx, roster, customAvatars);
    const canHostEditSeat = role === 'host' && ownerToken === HOST_TOKEN && Boolean(ctx.onUpdateHostSeat);

    const row = mk('div', 'lobby-seat-row');
    const left = mk('div', 'lobby-seat-info');
    left.appendChild(mk('span', 'setup-player-tag', `P${idx + 1}`));

    let seatAvatarEl: HTMLElement;
    if (canHostEditSeat && ctx.onEditAvatar) {
      const avBtn = Object.assign(mk('button', 'lobby-seat-avatar'), { type: 'button' as const, title: `Customize P${idx + 1} Standee` });
      avBtn.style.borderColor = player.color;
      avBtn.appendChild(createAvatarElement(resolvedAv, player.color));
      avBtn.addEventListener('click', () => {
        ctx.onEditAvatar!(resolvedAv, player.color, (nextAv) => {
          ctx.onUpdateHostSeat!(idx, {
            name: player.name,
            color: player.color,
            avatar: nextAv,
            ...(player.signatureStore ? { signatureStore: player.signatureStore } : {}),
          });
        }, `Customize P${idx + 1} Standee`);
      });
      seatAvatarEl = avBtn;
      left.appendChild(avBtn);
    } else {
      const avWrap = mk('span', 'lobby-seat-avatar is-static');
      avWrap.style.borderColor = player.color;
      avWrap.appendChild(createAvatarElement(resolvedAv, player.color));
      seatAvatarEl = avWrap;
      left.append(avWrap, mk('span', '', player.name));
    }

    if (canHostEditSeat) {
      const inlineEdit = mk('div', 'lobby-seat-inline-edit');
      const nameIn = Object.assign(mk('input', 'setup-input lobby-seat-name-input'), {
        type: 'text',
        value: player.name,
        maxLength: 18,
        placeholder: `Player ${idx + 1}`,
      });
      let selectedColor = player.color;
      const commitSeat = () =>
        ctx.onUpdateHostSeat!(idx, {
          name: nameIn.value.trim() || `Player ${idx + 1}`,
          color: selectedColor,
          avatar: resolvedAv,
          ...(player.signatureStore ? { signatureStore: player.signatureStore } : {}),
        });
      const colBtn = createColorPickerButton({
        initialColor: player.color,
        swatches: PLAYER_COLOR_SWATCHES,
        label: `P${idx + 1} Color`,
        title: `Pick ${player.name} color`,
        onChange: (hex) => {
          selectedColor = hex;
          seatAvatarEl.style.borderColor = hex;
        },
        onCommit: (hex) => {
          selectedColor = hex;
          commitSeat();
        },
      });
      nameIn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitSeat();
        }
      });
      inlineEdit.append(nameIn, colBtn.el, mkBtn('Apply', commitSeat));
      if (ctx.onEditSignatureStore) {
        const sigBtn = mkBtn(
          player.signatureStore ? `★ ${player.signatureStore.name}` : '★ Store',
          () =>
            ctx.onEditSignatureStore!(player.signatureStore, player.color, (nextSig) => {
              ctx.onUpdateHostSeat!(idx, {
                name: player.name,
                color: player.color,
                avatar: resolvedAv,
                ...(nextSig ? { signatureStore: nextSig } : {}),
              });
            }, `Customize P${idx + 1} Signature Store`),
          player.signatureStore ? 'signature-edit-btn is-configured' : 'signature-edit-btn'
        );
        inlineEdit.appendChild(sigBtn);
      }
      left.appendChild(inlineEdit);
    }
    if (isMine) left.appendChild(mk('span', 'net-seat-badge is-you', 'YOU'));

    if (role === 'host') {
      const select = mk('select', 'setup-select lobby-seat-select');
      select.appendChild(
        Object.assign(document.createElement('option'), {
          value: HOST_TOKEN,
          textContent: 'Host (Local Device)',
        })
      );
      for (const p of roster.peers) {
        select.appendChild(Object.assign(document.createElement('option'), {
          value: p.id,
          textContent: `Guest: ${p.name} (${p.connected ? 'Online' : 'Disconnected'})`,
        }));
      }
      select.value = roster.peers.some((p) => p.id === ownerToken) ? ownerToken : HOST_TOKEN;
      select.addEventListener('change', () => netSession.assignSeat(idx, select.value));
      row.append(left, select);
    } else {
      const guestName = ownerPeer?.name ?? 'Unknown';
      const youSuffix = ownerToken === myPeerId ? ' (YOU)' : '';
      const label = ownerToken === HOST_TOKEN ? 'Host' : `Guest: ${guestName}${youSuffix}`;
      row.append(left, mk('span', 'setup-muted', label));
    }
    seatsSec.appendChild(row);
  });

  const peersSec = addLobbySection('Connected Guests');
  if (roster.peers.length === 0) {
    peersSec.appendChild(mk('div', 'setup-muted', 'No guests joined yet. Share the Room Code or Invite Link above.'));
  } else {
    for (const peer of roster.peers) {
      const row = mk('div', 'lobby-peer-row');
      const left = mk('div', 'lobby-seat-info');
      const ownedCount = roster.seatOwners.filter((o) => o === peer.id).length;
      const seatLabel = ownedCount === 0 ? 'Spectator' : `${ownedCount} seat${ownedCount === 1 ? '' : 's'}`;
      const badge = mk(
        'span',
        `net-seat-badge ${peer.connected ? 'is-online' : 'is-offline'}`,
        peer.connected ? 'Online' : 'Disconnected — waiting reconnect'
      );
      left.append(mkDot(peer.color), mk('span', '', peer.name), badge, mk('span', 'setup-muted', seatLabel));
      row.appendChild(left);
      if (role === 'host') {
        row.appendChild(mkBtn('Kick / Reclaim Seats', () => netSession.kickPeer(peer.id)));
      }
      peersSec.appendChild(row);
    }
  }
  container.append(seatsSec, peersSec);
}
