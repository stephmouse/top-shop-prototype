import type { Player } from '../engine/types';
import { canClientAct, HOST_TOKEN } from '../net/protocol';
import type { HudNetInfo } from './hudView';

export type MetaChipVariant = 'dir' | 'stores' | 'buff' | 'debuff' | 'info';

export function makeMetaChip(text: string, variant: MetaChipVariant): HTMLElement {
  const chip = document.createElement('span');
  chip.className = `player-meta-chip is-${variant}`;
  chip.textContent = text;
  return chip;
}

export function resolveNetBadge(idx: number, netInfo?: HudNetInfo): { cls: string; text: string } | null {
  if (!netInfo || netInfo.role === 'offline' || !netInfo.roster) return null;
  const isMine = canClientAct(netInfo.role, netInfo.roster, netInfo.myClientToken, idx);
  const ownerToken = netInfo.roster.seatOwners[idx] ?? HOST_TOKEN;
  const peer = netInfo.roster.peers.find((p) => p.clientToken === ownerToken);
  if (isMine) return { cls: 'net-seat-badge is-you', text: 'YOU' };
  if (ownerToken === HOST_TOKEN) return { cls: 'net-seat-badge is-host', text: 'HOST' };
  if (peer) {
    return {
      cls: `net-seat-badge ${peer.connected ? 'is-online' : 'is-offline'}`,
      text: peer.connected ? 'GUEST' : 'GUEST (DC)',
    };
  }
  return null;
}

export function collectStatusChips(
  player: Player,
  ownedCount: number
): Array<{ text: string; variant: MetaChipVariant }> {
  const hArrow = player.horizontalDir === 'left' ? '←' : player.horizontalDir === 'right' ? '→' : '?';
  const vArrow = player.verticalDir === 'up' ? '↑' : player.verticalDir === 'down' ? '↓' : '?';
  const chips: Array<{ text: string; variant: MetaChipVariant }> = [
    { text: `Dir ${hArrow} ${vArrow}`, variant: 'dir' },
    { text: `${ownedCount} ${ownedCount === 1 ? 'store' : 'stores'}`, variant: 'stores' },
  ];
  if (player.doubleNextPayday) chips.push({ text: '2xPay', variant: 'buff' });
  if (player.skipNextPayday) chips.push({ text: 'NoPay', variant: 'debuff' });
  if (player.doublePriceTurns > 0) chips.push({ text: `2x$${player.doublePriceTurns}T`, variant: 'buff' });
  if (player.pencilTurnsLeft > 0 && player.pencilMode !== 'normal') {
    chips.push({
      text: `Pencil:${player.pencilMode}(${player.pencilTurnsLeft}T)`,
      variant: player.pencilMode === 'slow' ? 'buff' : 'debuff',
    });
  }
  if (player.blockDeliveryTurns > 0) chips.push({ text: `NoDeliv(${player.blockDeliveryTurns}T)`, variant: 'debuff' });
  if (player.blockNewStoreTurns > 0) chips.push({ text: `NoOpen(${player.blockNewStoreTurns}T)`, variant: 'debuff' });
  if (player.chirpSandals) chips.push({ text: 'Chirp', variant: 'info' });
  return chips;
}
