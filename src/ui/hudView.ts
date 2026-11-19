import { computePlayerNetWorth } from '../engine/helpers';
import type { GameState } from '../engine/types';

export function renderTokensOverlay(
  tokensLayer: HTMLElement,
  boardGrid: HTMLElement,
  state: GameState
): void {
  const activeIds = new Set(state.players.filter((p) => !p.isBankrupt).map((p) => p.id));

  for (const child of Array.from(tokensLayer.children)) {
    const el = child as HTMLElement;
    if (!el.dataset.playerId || !activeIds.has(el.dataset.playerId)) {
      el.remove();
    }
  }

  const slotCounters: Record<string, number> = {};

  state.players.forEach((player, idx) => {
    if (player.isBankrupt) return;

    const tileEl = boardGrid.querySelector<HTMLElement>(`[data-tile-id="${player.tileId}"]`);
    if (!tileEl) return;

    const slotIdx = slotCounters[player.tileId] ?? 0;
    slotCounters[player.tileId] = slotIdx + 1;

    const x = tileEl.offsetLeft + 8 + (slotIdx % 4) * 21;
    const y = tileEl.offsetTop + tileEl.offsetHeight - 28 - Math.floor(slotIdx / 4) * 20;

    let token = tokensLayer.querySelector<HTMLElement>(`[data-player-id="${player.id}"]`);
    const isNew = !token;
    if (!token) {
      token = document.createElement('span');
      token.dataset.playerId = player.id;
      token.textContent = String(idx + 1);
    }

    token.style.backgroundColor = player.color;
    token.title = player.name;
    token.className = `token token-floating${idx === state.activePlayerIndex ? ' is-turn' : ''}`;
    token.style.transform = `translate(${x}px, ${y}px)`;
    if (isNew) {
      tokensLayer.appendChild(token);
    }
  });
}

export function renderPlayersHud(container: HTMLElement, state: GameState): void {
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
    const nameSpan = document.createElement('span');
    nameSpan.style.color = player.color;
    nameSpan.textContent = `P${idx + 1} ${player.name}`;
    const ptsSpan = document.createElement('span');
    ptsSpan.textContent = player.isBankrupt ? 'BANKRUPT' : `Pts: ${player.points}`;
    head.append(nameSpan, ptsSpan);

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
