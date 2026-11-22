import { computePlayerNetWorth } from '../engine/helpers';
import type { GameState, Player } from '../engine/types';
import { canClientAct, HOST_TOKEN } from '../net/protocol';
import { createAvatarElement } from './avatarSvg';
import { resolvePlayerAvatar } from './hudView';
import type { HudNetInfo } from './hudView';

type MetaChipVariant = 'dir' | 'stores' | 'buff' | 'debuff' | 'info';

function formatDollars(amount: number): string {
  const abs = Math.abs(Math.round(amount)).toLocaleString('en-US');
  return amount < 0 ? `-$${abs}` : `$${abs}`;
}

function makeStatBox(label: string, valueText: string, extraClass: string): HTMLElement {
  const box = document.createElement('div');
  box.className = extraClass ? `player-stat ${extraClass}` : 'player-stat';
  const lbl = document.createElement('span');
  lbl.className = 'player-stat-label';
  lbl.textContent = label;
  const val = document.createElement('span');
  val.className = 'player-stat-value';
  val.textContent = valueText;
  box.append(lbl, val);
  return box;
}

function makeMetaChip(text: string, variant?: MetaChipVariant): HTMLElement {
  const chip = document.createElement('span');
  chip.className = variant ? `player-meta-chip is-${variant}` : 'player-meta-chip';
  chip.textContent = text;
  return chip;
}

function appendNetBadge(nameWrap: HTMLElement, idx: number, netInfo?: HudNetInfo): void {
  if (!netInfo || netInfo.role === 'offline' || !netInfo.roster) return;
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

function appendStatusChips(metaRow: HTMLElement, player: Player): void {
  if (player.doubleNextPayday) metaRow.appendChild(makeMetaChip('2xPay', 'buff'));
  if (player.skipNextPayday) metaRow.appendChild(makeMetaChip('NoPay', 'debuff'));
  if (player.doublePriceTurns > 0) metaRow.appendChild(makeMetaChip(`2x$${player.doublePriceTurns}T`, 'buff'));
  if (player.pencilTurnsLeft > 0 && player.pencilMode !== 'normal') {
    const variant: MetaChipVariant = player.pencilMode === 'slow' ? 'buff' : 'debuff';
    metaRow.appendChild(makeMetaChip(`Pencil:${player.pencilMode}(${player.pencilTurnsLeft}T)`, variant));
  }
  if (player.blockDeliveryTurns > 0) metaRow.appendChild(makeMetaChip(`NoDeliv(${player.blockDeliveryTurns}T)`, 'debuff'));
  if (player.blockNewStoreTurns > 0) metaRow.appendChild(makeMetaChip(`NoOpen(${player.blockNewStoreTurns}T)`, 'debuff'));
  if (player.chirpSandals) metaRow.appendChild(makeMetaChip('Chirp', 'info'));
}

export function renderPlayersHud(container: HTMLElement, state: GameState, netInfo?: HudNetInfo): void {
  container.innerHTML = '';

  const storeCounts: Record<string, number> = {};
  for (const shop of Object.values(state.shops)) {
    if (shop.ownerId) {
      storeCounts[shop.ownerId] = (storeCounts[shop.ownerId] ?? 0) + 1;
    }
  }

  state.players.forEach((player, idx) => {
    const isActive = idx === state.activePlayerIndex;
    const card = document.createElement('div');
    const cls = ['player-card'];
    if (isActive) cls.push('is-active');
    if (player.isBankrupt) cls.push('is-bankrupt');
    card.className = cls.join(' ');
    card.style.borderColor = isActive ? player.color : '';

    const head = document.createElement('div');
    head.className = 'player-card-head';
    const nameWrap = document.createElement('span');
    nameWrap.className = 'player-card-namewrap';
    const hudAv = document.createElement('span');
    hudAv.className = 'hud-avatar';
    hudAv.style.borderColor = player.color;
    hudAv.appendChild(
      createAvatarElement(resolvePlayerAvatar(state, idx, netInfo?.roster, netInfo?.customAvatars), player.color)
    );
    const nameSpan = document.createElement('span');
    nameSpan.style.color = player.color;
    nameSpan.textContent = `P${idx + 1} ${player.name}`;
    nameWrap.append(hudAv, nameSpan);
    appendNetBadge(nameWrap, idx, netInfo);

    const ptsSpan = document.createElement('span');
    ptsSpan.className = player.isBankrupt ? 'player-card-pts is-bankrupt' : 'player-card-pts';
    ptsSpan.textContent = player.isBankrupt ? 'BANKRUPT' : `${player.points} pts`;
    head.append(nameWrap, ptsSpan);

    const netWorth = computePlayerNetWorth(state, player.id);
    const finances = document.createElement('div');
    finances.className = 'player-card-finances';
    finances.append(
      makeStatBox('CASH', formatDollars(player.cash), player.cash < 0 ? 'is-cash is-negative' : 'is-cash'),
      makeStatBox('NET ASSETS', formatDollars(netWorth), 'is-net')
    );

    const targetAssets = Math.max(1, state.config.targetAssets);
    const pct = Math.max(0, Math.round((netWorth / targetAssets) * 100));
    const fillPct = Math.min(100, pct);
    const progress = document.createElement('div');
    progress.className = 'player-card-progress';
    progress.title = `${formatDollars(netWorth)} / ${formatDollars(targetAssets)} target (${pct}%)`;
    const progressFill = document.createElement('div');
    progressFill.className = 'player-card-progress-fill';
    progressFill.style.width = `${fillPct}%`;
    progressFill.style.backgroundColor = player.color;
    progress.appendChild(progressFill);

    const hArrow = player.horizontalDir === 'left' ? '←' : player.horizontalDir === 'right' ? '→' : '?';
    const vArrow = player.verticalDir === 'up' ? '↑' : player.verticalDir === 'down' ? '↓' : '?';
    const ownedCount = storeCounts[player.id] ?? 0;

    const metaRow = document.createElement('div');
    metaRow.className = 'player-card-meta';
    metaRow.append(
      makeMetaChip(`Dir ${hArrow} ${vArrow}`, 'dir'),
      makeMetaChip(`${ownedCount} ${ownedCount === 1 ? 'store' : 'stores'}`, 'stores')
    );
    appendStatusChips(metaRow, player);

    card.append(head, finances, progress, metaRow);
    container.appendChild(card);
  });
}
