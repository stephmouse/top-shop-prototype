import { isValidCustomImageDataUrl, sanitizeAvatarSpec } from '../config/avatarTypes';
import type { AvatarSpec } from '../config/avatarTypes';
import { PLAYER_COLORS } from '../config/balance';
import type { ConnectedPeerInfo, NetRole, RoomRoster } from '../net/protocol';
import { HOST_TOKEN } from '../net/protocol';
import { createAvatarElement } from './avatarSvg';
import type { MatchSetupData } from './persistence';

export interface SetupOnlineContext {
  role: NetRole;
  roster: RoomRoster | null;
  customAvatars: Readonly<Record<string, string>>;
}

export interface SetupPlayersCallbacks {
  onEditAvatar?: (idx: number, current: AvatarSpec, color: string, onSave: (next: AvatarSpec) => void) => void;
  onPlayersMutated: () => void;
  onNameInput?: () => void;
}

export function getGuestPeerForSeat(
  online: SetupOnlineContext | undefined,
  seatIdx: number
): ConnectedPeerInfo | null {
  if (!online || online.role !== 'host' || !online.roster) return null;
  const ownerToken = online.roster.seatOwners[seatIdx];
  if (!ownerToken || ownerToken === HOST_TOKEN) return null;
  return online.roster.peers.find((p) => p.id === ownerToken) ?? null;
}

export function renderSetupPlayersList(
  container: HTMLElement,
  draft: MatchSetupData,
  online: SetupOnlineContext | undefined,
  callbacks: SetupPlayersCallbacks
): void {
  container.innerHTML = '';
  const isHostOnline = online?.role === 'host';

  draft.players.forEach((player, idx) => {
    const guestPeer = getGuestPeerForSeat(online, idx);
    const row = Object.assign(document.createElement('div'), {
      className: guestPeer ? 'setup-player-row is-guest-locked' : 'setup-player-row',
    });
    const tag = Object.assign(document.createElement('span'), {
      className: 'setup-player-tag',
      textContent: `P${idx + 1}`,
    });

    if (guestPeer) {
      const gColor = guestPeer.color;
      const baseAv = sanitizeAvatarSpec(guestPeer.avatar, idx);
      const remoteImg = online?.customAvatars[guestPeer.id];
      const gAvatar = isValidCustomImageDataUrl(remoteImg) ? { ...baseAv, customImage: remoteImg } : baseAv;

      const avatarBtn = Object.assign(document.createElement('button'), {
        type: 'button' as const,
        className: 'setup-avatar-btn',
        disabled: true,
        title: `Controlled by ${guestPeer.name}`,
      });
      avatarBtn.style.borderColor = gColor;
      avatarBtn.appendChild(createAvatarElement(gAvatar, gColor));

      const nameInput = Object.assign(document.createElement('input'), {
        className: 'setup-input',
        type: 'text',
        value: guestPeer.name,
        disabled: true,
      });
      const colorInput = Object.assign(document.createElement('input'), {
        className: 'setup-color-picker',
        type: 'color',
        value: gColor,
        disabled: true,
      });
      const badge = Object.assign(document.createElement('span'), {
        className: `net-seat-badge ${guestPeer.connected ? 'is-online' : 'is-offline'}`,
        textContent: guestPeer.connected ? 'GUEST' : 'GUEST (DC)',
      });
      const lockNote = Object.assign(document.createElement('span'), {
        className: 'setup-muted',
        textContent: 'Controlled by connected guest',
      });
      row.append(tag, badge, avatarBtn, nameInput, colorInput, lockNote);
      container.appendChild(row);
      return;
    }

    const pColor = player.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]!;
    const avatarSpec = sanitizeAvatarSpec(player.avatar, idx);
    const avatarBtn = Object.assign(document.createElement('button'), {
      type: 'button' as const,
      className: 'setup-avatar-btn',
      title: 'Customize Standee',
    });
    avatarBtn.style.borderColor = pColor;
    avatarBtn.appendChild(createAvatarElement(avatarSpec, pColor));
    avatarBtn.addEventListener('click', () =>
      callbacks.onEditAvatar?.(idx, avatarSpec, pColor, (nextAv) => {
        draft.players[idx] = { ...draft.players[idx]!, avatar: nextAv };
        callbacks.onPlayersMutated();
      })
    );

    const nameInput = Object.assign(document.createElement('input'), {
      className: 'setup-input',
      type: 'text',
      maxLength: 20,
      value: player.name,
    });
    nameInput.addEventListener('input', () => {
      draft.players[idx] = { ...draft.players[idx]!, name: nameInput.value };
      callbacks.onNameInput?.();
    });

    const colorInput = Object.assign(document.createElement('input'), {
      className: 'setup-color-picker',
      type: 'color',
      value: pColor,
    });
    colorInput.addEventListener('input', () => {
      draft.players[idx] = { ...draft.players[idx]!, color: colorInput.value };
      avatarBtn.style.borderColor = colorInput.value;
    });
    colorInput.addEventListener('change', () => callbacks.onPlayersMutated());

    const swatches = Object.assign(document.createElement('div'), { className: 'setup-swatches' });
    for (const hex of PLAYER_COLORS) {
      const sw = Object.assign(document.createElement('button'), {
        type: 'button' as const,
        title: hex,
        className: `color-swatch${colorInput.value.toLowerCase() === hex ? ' is-selected' : ''}`,
      });
      sw.style.backgroundColor = hex;
      sw.addEventListener('click', () => {
        draft.players[idx] = { ...draft.players[idx]!, color: hex };
        callbacks.onPlayersMutated();
      });
      swatches.appendChild(sw);
    }

    if (isHostOnline) {
      const hostBadge = Object.assign(document.createElement('span'), {
        className: 'net-seat-badge is-host',
        textContent: 'HOST',
      });
      row.append(tag, hostBadge, avatarBtn, nameInput, colorInput, swatches);
    } else {
      row.append(tag, avatarBtn, nameInput, colorInput, swatches);
    }
    container.appendChild(row);
  });
}
