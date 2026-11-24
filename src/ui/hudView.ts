import { isValidCustomImageDataUrl, sanitizeAvatarSpec, stripAvatarCustomImage } from '../config/avatarTypes';
import type { AvatarSpec } from '../config/avatarTypes';
import type { GameState } from '../engine/types';
import { HOST_TOKEN } from '../net/protocol';
import type { NetRole, RoomRoster } from '../net/protocol';
import { createAvatarElement, getAvatarRenderKey } from './avatarSvg';

export function getContrastInk(hex: string): '#ffffff' | '#0b0e14' {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return '#0b0e14';
  const n = parseInt(m[1]!, 16);
  const brightness = (299 * ((n >> 16) & 255) + 587 * ((n >> 8) & 255) + 114 * (n & 255)) / 1000;
  return brightness < 140 ? '#ffffff' : '#0b0e14';
}

export interface TokenMoveHint {
  kind: 'step' | 'escalator' | 'elevator';
  durationMs: number;
}

export interface HudNetInfo {
  role: NetRole;
  roster: RoomRoster | null;
  myPeerId: string;
  customAvatars?: Readonly<Record<string, string>>;
}

export function resolvePlayerAvatar(
  state: GameState,
  playerIdx: number,
  roster?: RoomRoster | null,
  customAvatars?: Readonly<Record<string, string>>
): AvatarSpec {
  const player = state.players[playerIdx];
  const seatAvatar = sanitizeAvatarSpec(player?.avatar, playerIdx);
  const ownerToken = roster?.seatOwners[playerIdx];
  if (ownerToken && ownerToken !== HOST_TOKEN) {
    const peer = roster?.peers.find((p) => p.id === ownerToken);
    if (peer) {
      const base = peer.avatar ? sanitizeAvatarSpec(peer.avatar, playerIdx) : stripAvatarCustomImage(seatAvatar)!;
      const remoteImg = customAvatars?.[ownerToken];
      return isValidCustomImageDataUrl(remoteImg)
        ? { ...base, customImage: remoteImg }
        : stripAvatarCustomImage(base)!;
    }
  }
  if (isValidCustomImageDataUrl(seatAvatar.customImage)) return seatAvatar;
  const hostImg = player ? customAvatars?.[player.id] : undefined;
  return isValidCustomImageDataUrl(hostImg) ? { ...seatAvatar, customImage: hostImg } : seatAvatar;
}

export function getTokenBodyElement(tokensLayer: HTMLElement, playerId: string): HTMLElement | undefined {
  for (const child of Array.from(tokensLayer.children)) {
    const wrap = child as HTMLElement;
    if (wrap.dataset?.playerId === playerId) {
      return Array.from(wrap.children).find((c) => (c as HTMLElement).className?.includes('token-body')) as
        | HTMLElement
        | undefined;
    }
  }
  return undefined;
}

export function renderTokensOverlay(
  tokensLayer: HTMLElement,
  boardGrid: HTMLElement,
  state: GameState,
  roster?: RoomRoster | null,
  customAvatars?: Readonly<Record<string, string>>,
  moveHints?: ReadonlyMap<string, TokenMoveHint>
): void {
  const activeIds = new Set(state.players.filter((p) => !p.isBankrupt).map((p) => p.id));

  for (const child of Array.from(tokensLayer.children)) {
    const el = child as HTMLElement;
    if (!el.dataset.playerId || !activeIds.has(el.dataset.playerId)) {
      el.remove();
    }
  }

  const tileById = new Map<string, HTMLElement>();
  for (const child of Array.from(boardGrid.children)) {
    const el = child as HTMLElement;
    if (el.dataset.tileId) tileById.set(el.dataset.tileId, el);
  }
  const tokenByPlayerId = new Map<string, HTMLElement>();
  for (const child of Array.from(tokensLayer.children)) {
    const el = child as HTMLElement;
    if (el.dataset.playerId) tokenByPlayerId.set(el.dataset.playerId, el);
  }

  const tileCounts: Record<string, number> = {};
  for (const p of state.players) {
    if (!p.isBankrupt) tileCounts[p.tileId] = (tileCounts[p.tileId] ?? 0) + 1;
  }
  const slotCounters: Record<string, number> = {};

  state.players.forEach((player, idx) => {
    if (player.isBankrupt) return;

    const tileEl = tileById.get(player.tileId);
    if (!tileEl) return;

    const slotIdx = slotCounters[player.tileId] ?? 0;
    slotCounters[player.tileId] = slotIdx + 1;

    const crowded = (tileCounts[player.tileId] ?? 0) >= 5;
    const x = tileEl.offsetLeft + (crowded ? 4 : 5) + (slotIdx % 4) * (crowded ? 21 : 22);
    const y = tileEl.offsetTop + tileEl.offsetHeight - (crowded ? 25 : 31) - Math.floor(slotIdx / 4) * (crowded ? 19 : 24);

    let token = tokenByPlayerId.get(player.id);
    const isNew = !token;
    if (!token) {
      token = document.createElement('span');
      token.dataset.playerId = player.id;
    }
    let bodyEl = Array.from(token.children).find((c) =>
      (c as HTMLElement).className?.includes('token-body')
    ) as HTMLElement | undefined;
    if (!bodyEl) {
      bodyEl = document.createElement('span');
      bodyEl.className = 'token token-body';
      token.appendChild(bodyEl);
    }

    const hint = moveHints?.get(player.id);
    const moveCls =
      hint?.kind === 'escalator'
        ? ' is-escalator-glide'
        : hint?.kind === 'elevator'
          ? ' is-elevator-ride'
          : '';
    token.style.setProperty?.('--move-dur', `${hint?.durationMs ?? 200}ms`);
    token.title = player.name;
    token.className = `token-floating${idx === state.activePlayerIndex ? ' is-turn' : ''}${crowded ? ' is-crowded' : ''}${moveCls}`;
    token.style.transform = `translate(${x}px, ${y}px)`;

    bodyEl.style.borderColor = player.color;
    bodyEl.style.backgroundColor = '#141b29';
    const avSpec = resolvePlayerAvatar(state, idx, roster, customAvatars);
    const avKey = `${getAvatarRenderKey(avSpec, player.color)}|${idx}`;
    if (bodyEl.dataset?.avatarKey !== avKey) {
      if (bodyEl.dataset) bodyEl.dataset.avatarKey = avKey;
      bodyEl.innerHTML = '';
      bodyEl.appendChild(createAvatarElement(avSpec, player.color));
      const pip = document.createElement('span');
      pip.className = 'token-pip';
      pip.style.backgroundColor = player.color;
      pip.style.color = getContrastInk(player.color);
      pip.textContent = String(idx + 1);
      bodyEl.appendChild(pip);
    }

    const fxCls = (bodyEl.className || '').split(/\s+/).filter((c) => c.startsWith('fx-'));
    const dirCls =
      player.horizontalDir === 'left' ? ['dir-left'] : player.horizontalDir === 'right' ? ['dir-right'] : [];
    bodyEl.className = ['token', 'token-body', ...dirCls, ...fxCls].join(' ');

    if (isNew) {
      tokensLayer.appendChild(token);
    }
  });
}
