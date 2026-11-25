import { WALK_SOUND_META } from '../config/walkSounds';
import { formatTimedWindowEndpoint, getTimedWindowRoundsLeft } from '../engine/timedEffects';
import type { GameState, Player } from '../engine/types';
import { canClientAct, HOST_TOKEN } from '../net/protocol';
import type { HudNetInfo } from './hudView';

export type MetaChipVariant = 'dir' | 'stores' | 'buff' | 'debuff' | 'info';

export function makeMetaChip(text: string, variant: MetaChipVariant, title?: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = `player-meta-chip is-${variant}`;
  chip.textContent = text;
  if (title) chip.title = title;
  return chip;
}

export function resolveNetBadge(idx: number, netInfo?: HudNetInfo): { cls: string; text: string } | null {
  if (!netInfo || netInfo.role === 'offline' || !netInfo.roster) return null;
  const isMine = canClientAct(netInfo.role, netInfo.roster, netInfo.myPeerId, idx);
  const ownerToken = netInfo.roster.seatOwners[idx] ?? HOST_TOKEN;
  const peer = netInfo.roster.peers.find((p) => p.id === ownerToken);
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
  state: GameState,
  player: Player,
  ownedCount: number
): Array<{ text: string; variant: MetaChipVariant; title?: string }> {
  const hArrow = player.horizontalDir === 'left' ? '←' : player.horizontalDir === 'right' ? '→' : '?';
  const vArrow = player.verticalDir === 'up' ? '↑' : player.verticalDir === 'down' ? '↓' : '?';
  const chips: Array<{ text: string; variant: MetaChipVariant; title?: string }> = [
    { text: `Dir ${hArrow} ${vArrow}`, variant: 'dir' },
    { text: `${ownedCount} ${ownedCount === 1 ? 'store' : 'stores'}`, variant: 'stores' },
  ];
  if (player.doubleNextPayday) chips.push({ text: '2xPay', variant: 'buff' });
  if (player.skipNextPayday) chips.push({ text: 'NoPay', variant: 'debuff' });
  if (player.doublePriceWindow) {
    const rd = getTimedWindowRoundsLeft(state, player.doublePriceWindow);
    chips.push({
      text: `2x$ (${rd} rd)`,
      variant: 'buff',
      title: formatTimedWindowEndpoint(state, player.doublePriceWindow, '2× prices end'),
    });
  }
  if (player.pencilWindow && player.pencilMode !== 'normal') {
    const rd = getTimedWindowRoundsLeft(state, player.pencilWindow);
    const label =
      player.pencilMode === 'slow'
        ? `Slow (${rd} rd)`
        : player.pencilMode === 'ones_twos'
          ? `Pencil 1&2 (${rd} rd)`
          : `Pencil E (${rd} rd)`;
    chips.push({
      text: label,
      variant: player.pencilMode === 'slow' ? 'buff' : 'debuff',
      title: formatTimedWindowEndpoint(state, player.pencilWindow, 'Pencil effect ends'),
    });
  }
  if (player.blockDeliveryWindow) {
    const rd = getTimedWindowRoundsLeft(state, player.blockDeliveryWindow);
    chips.push({
      text: `NoDeliv (${rd} rd)`,
      variant: 'debuff',
      title: formatTimedWindowEndpoint(state, player.blockDeliveryWindow, 'Delivery block ends'),
    });
  }
  if (player.blockNewStoreWindow) {
    const rd = getTimedWindowRoundsLeft(state, player.blockNewStoreWindow);
    chips.push({
      text: `NoOpen (${rd} rd)`,
      variant: 'debuff',
      title: formatTimedWindowEndpoint(state, player.blockNewStoreWindow, 'New store block ends'),
    });
  }
  if (player.chirpSandals) {
    chips.push({ text: WALK_SOUND_META[player.equippedWalkSound ?? 'chirp'].shortChip, variant: 'info' });
  }
  return chips;
}
