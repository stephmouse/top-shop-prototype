import { isValidCustomImageDataUrl, sanitizeAvatarSpec } from '../config/avatarTypes';
import type { AvatarSpec } from '../config/avatarTypes';
import { PLAYER_COLORS } from '../config/balance';
import type { SignatureStoreSpec } from '../config/signatureStore';
import type { ConnectedPeerInfo, NetRole, RoomRoster } from '../net/protocol';
import { HOST_TOKEN } from '../net/protocol';
import { createAvatarElement } from './avatarSvg';
import { createColorPickerButton, PLAYER_COLOR_SWATCHES } from './colorPickerButton';
import type { MatchSetupData } from './persistence';

export interface SetupOnlineContext {
  role: NetRole;
  roster: RoomRoster | null;
  customAvatars: Readonly<Record<string, string>>;
}

export interface SetupPlayersCallbacks {
  onEditAvatar?: (idx: number, current: AvatarSpec, color: string, onSave: (next: AvatarSpec) => void) => void;
  onEditSignatureStore?: (
    idx: number,
    current: SignatureStoreSpec | undefined,
    color: string,
    onSave: (next: SignatureStoreSpec | undefined) => void
  ) => void;
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
      const colorBtn = createColorPickerButton({
        initialColor: gColor,
        disabled: true,
        title: `Controlled by ${guestPeer.name}`,
      });
      const badge = Object.assign(document.createElement('span'), {
        className: `net-seat-badge ${guestPeer.connected ? 'is-online' : 'is-offline'}`,
        textContent: guestPeer.connected ? 'GUEST' : 'GUEST (DC)',
      });
      const lockNote = Object.assign(document.createElement('span'), {
        className: 'setup-muted',
        textContent: 'Controlled by connected guest',
      });
      row.append(tag, badge, avatarBtn, nameInput, colorBtn.el, lockNote);
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

    const swatches = Object.assign(document.createElement('div'), { className: 'setup-swatches' });
    const colorBtn = createColorPickerButton({
      initialColor: pColor,
      swatches: PLAYER_COLOR_SWATCHES,
      label: `P${idx + 1} Color`,
      title: `Pick Player ${idx + 1} color`,
      onChange: (hex) => {
        draft.players[idx] = { ...draft.players[idx]!, color: hex };
        avatarBtn.style.borderColor = hex;
        for (const sw of Array.from(swatches.children) as HTMLElement[]) {
          sw.classList.toggle('is-selected', sw.title.toLowerCase() === hex);
        }
      },
      onCommit: () => callbacks.onPlayersMutated(),
    });

    for (const hex of PLAYER_COLORS) {
      const sw = Object.assign(document.createElement('button'), {
        type: 'button' as const,
        title: hex,
        className: `color-swatch${pColor.toLowerCase() === hex ? ' is-selected' : ''}`,
      });
      sw.style.backgroundColor = hex;
      sw.addEventListener('click', () => {
        colorBtn.close();
        draft.players[idx] = { ...draft.players[idx]!, color: hex };
        callbacks.onPlayersMutated();
      });
      swatches.appendChild(sw);
    }

    const sigBtn = Object.assign(document.createElement('button'), {
      type: 'button' as const,
      className: player.signatureStore ? 'signature-edit-btn is-configured' : 'signature-edit-btn',
      textContent: player.signatureStore ? `★ ${player.signatureStore.name}` : '★ Store',
      title: `Customize P${idx + 1} Signature Store`,
    });
    sigBtn.addEventListener('click', () =>
      callbacks.onEditSignatureStore?.(idx, player.signatureStore, pColor, (nextSig) => {
        const cur = draft.players[idx]!;
        const { signatureStore: _old, ...rest } = cur;
        draft.players[idx] = nextSig ? { ...rest, signatureStore: nextSig } : rest;
        callbacks.onPlayersMutated();
      })
    );

    if (isHostOnline) {
      const hostBadge = Object.assign(document.createElement('span'), {
        className: 'net-seat-badge is-host',
        textContent: 'HOST',
      });
      row.append(tag, hostBadge, avatarBtn, nameInput, colorBtn.el, swatches, sigBtn);
    } else {
      row.append(tag, avatarBtn, nameInput, colorBtn.el, swatches, sigBtn);
    }
    container.appendChild(row);
  });
}
