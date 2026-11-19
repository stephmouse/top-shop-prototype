import { isValidCustomImageDataUrl, sanitizeAvatarSpec, stripAvatarCustomImage } from '../config/avatarTypes';
import type { AvatarSpec } from '../config/avatarTypes';
import { computePlayerNetWorth } from '../engine/helpers';
import type { GameState } from '../engine/types';
import { canClientAct, HOST_TOKEN } from '../net/protocol';
import type { NetRole, RoomRoster } from '../net/protocol';
import { createAvatarElement, getAvatarRenderKey } from './avatarSvg';

export interface HudNetInfo {
  role: NetRole;
  roster: RoomRoster | null;
  myClientToken: string;
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
    const peer = roster?.peers.find((p) => p.clientToken === ownerToken);
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
  customAvatars?: Readonly<Record<string, string>>
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

  const slotCounters: Record<string, number> = {};

  state.players.forEach((player, idx) => {
    if (player.isBankrupt) return;

    const tileEl = tileById.get(player.tileId);
    if (!tileEl) return;

    const slotIdx = slotCounters[player.tileId] ?? 0;
    slotCounters[player.tileId] = slotIdx + 1;

    const x = tileEl.offsetLeft + 5 + (slotIdx % 4) * 22;
    const y = tileEl.offsetTop + tileEl.offsetHeight - 31 - Math.floor(slotIdx / 4) * 24;

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

    token.title = player.name;
    token.className = `token-floating${idx === state.activePlayerIndex ? ' is-turn' : ''}`;
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

export function renderPlayersHud(container: HTMLElement, state: GameState, netInfo?: HudNetInfo): void {
  container.innerHTML = '';

  state.players.forEach((player, idx) => {
    const isActive = idx === state.activePlayerIndex;
    const card = document.createElement('div');
    card.className = `player-card${isActive ? ' is-active' : ''}`;
    card.style.borderColor = isActive ? player.color : '';

    const netWorth = computePlayerNetWorth(state, player.id);
    const hArrow =
      player.horizontalDir === 'left' ? '←' : player.horizontalDir === 'right' ? '→' : '?';
    const vArrow =
      player.verticalDir === 'up' ? '↑' : player.verticalDir === 'down' ? '↓' : '?';

    const head = document.createElement('div');
    head.className = 'player-card-head';
    const nameWrap = document.createElement('span');
    nameWrap.className = 'player-card-namewrap';
    const hudAv = document.createElement('span');
    hudAv.className = 'hud-avatar';
    hudAv.style.borderColor = player.color;
    hudAv.appendChild(createAvatarElement(resolvePlayerAvatar(state, idx, netInfo?.roster, netInfo?.customAvatars), player.color));
    const nameSpan = document.createElement('span');
    nameSpan.style.color = player.color;
    nameSpan.textContent = `P${idx + 1} ${player.name}`;
    nameWrap.append(hudAv, nameSpan);

    if (netInfo && netInfo.role !== 'offline' && netInfo.roster) {
      const isMine = canClientAct(netInfo.role, netInfo.roster, netInfo.myClientToken, idx);
      const ownerToken = netInfo.roster.seatOwners[idx] ?? HOST_TOKEN;
      const peer = netInfo.roster.peers.find((p) => p.clientToken === ownerToken);
      const badge = document.createElement('span');
      if (isMine) {
        badge.className = 'net-seat-badge is-you';
        badge.textContent = 'YOU';
      } else if (ownerToken === HOST_TOKEN) {
        badge.className = 'net-seat-badge is-host';
        badge.textContent = 'HOST';
      } else if (peer) {
        badge.className = `net-seat-badge ${peer.connected ? 'is-online' : 'is-offline'}`;
        badge.textContent = peer.connected ? peer.name : `${peer.name} (DC)`;
      }
      if (badge.textContent) nameWrap.appendChild(badge);
    }

    const ptsSpan = document.createElement('span');
    ptsSpan.textContent = player.isBankrupt ? 'BANKRUPT' : `Pts: ${player.points}`;
    head.append(nameWrap, ptsSpan);

    const stats = document.createElement('div');
    const tags: string[] = [];
    if (player.doubleNextPayday) tags.push('2xPay');
    if (player.skipNextPayday) tags.push('NoPay');
    if (player.doublePriceTurns > 0) tags.push(`2x$${player.doublePriceTurns}T`);
    if (player.pencilTurnsLeft > 0 && player.pencilMode !== 'normal') {
      tags.push(`Pencil:${player.pencilMode}(${player.pencilTurnsLeft}T)`);
    }
    if (player.blockDeliveryTurns > 0) tags.push(`NoDeliv(${player.blockDeliveryTurns}T)`);
    if (player.blockNewStoreTurns > 0) tags.push(`NoOpen(${player.blockNewStoreTurns}T)`);
    if (player.chirpSandals) tags.push('Chirp');
    const tagSuffix = tags.length > 0 ? ` | [${tags.join(', ')}]` : '';
    stats.textContent = `Cash: $${player.cash} | Net: $${netWorth} | Dir: ${hArrow} ${vArrow}${tagSuffix}`;

    card.appendChild(head);
    card.appendChild(stats);
    container.appendChild(card);
  });
}
