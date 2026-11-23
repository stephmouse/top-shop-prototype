import { computePlayerNetWorth } from '../engine/helpers';
import type { GameState, Player } from '../engine/types';
import { createAvatarElement, getAvatarRenderKey } from './avatarSvg';
import {
  cancelRollingStat,
  formatDollars,
  makeRollingStatBox,
  setRollingStatTarget,
} from './cashCounter';
import type { RollingStatHandle } from './cashCounter';
import { resolvePlayerAvatar } from './hudView';
import type { HudNetInfo } from './hudView';
import { collectStatusChips, makeMetaChip, resolveNetBadge } from './playerCardMeta';

export const CASHBACK_BEAT2_MS = 820;

interface StatOverride {
  cash: number;
  netWorth: number;
}

interface PlayerCardDomRef {
  playerId: string;
  card: HTMLElement;
  nameWrap: HTMLElement;
  hudAv: HTMLElement;
  nameSpan: HTMLElement;
  badgeEl: HTMLElement | null;
  ptsSpan: HTMLElement;
  progress: HTMLElement;
  progressFill: HTMLElement;
  metaRow: HTMLElement;
  cashStat: RollingStatHandle;
  netStat: RollingStatHandle;
  lastAvatarKey: string;
  lastBadgeKey: string;
  lastMetaKey: string;
}

interface HudCardsCache {
  signature: string;
  cardRefs: PlayerCardDomRef[];
  stagedTimer: number | null;
  stagedState: GameState | null;
  stagedOverrides: Map<string, StatOverride>;
}

const hudCacheMap = new WeakMap<HTMLElement, HudCardsCache>();

function clearStagedOverride(cache: HudCardsCache): void {
  if (cache.stagedTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(cache.stagedTimer);
  }
  cache.stagedTimer = null;
  cache.stagedState = null;
  cache.stagedOverrides.clear();
}

export function resetPlayersHudCache(container: HTMLElement): void {
  const cache = hudCacheMap.get(container);
  if (!cache) return;
  clearStagedOverride(cache);
  for (const ref of cache.cardRefs) {
    cancelRollingStat(ref.cashStat);
    cancelRollingStat(ref.netStat);
  }
  hudCacheMap.delete(container);
}

export function stageCashbackHud(
  container: HTMLElement,
  prev: GameState,
  next: GameState,
  delayMs = CASHBACK_BEAT2_MS
): void {
  const cache = hudCacheMap.get(container);
  if (!cache) return;
  clearStagedOverride(cache);

  const receipt = next.lastPurchaseReceipt;
  if (
    prev.phase !== 'SHOP_BUY_RIVAL' ||
    !receipt ||
    receipt.cashbackCount <= 0 ||
    typeof window === 'undefined' ||
    typeof requestAnimationFrame !== 'function'
  ) {
    return;
  }

  const prevBuyer = prev.players.find((p) => p.id === receipt.buyerId);
  const prevOwner = prev.players.find((p) => p.id === receipt.ownerId);
  if (!prevBuyer || !prevOwner) return;

  const buyerBeat1Net = computePlayerNetWorth(next, receipt.buyerId) - receipt.cashbackRefund;
  const ownerBeat1Net = computePlayerNetWorth(next, receipt.ownerId) + receipt.cashbackRefund;
  cache.stagedOverrides.set(receipt.buyerId, { cash: prevBuyer.cash - receipt.grossPaid, netWorth: buyerBeat1Net });
  cache.stagedOverrides.set(receipt.ownerId, { cash: prevOwner.cash + receipt.grossPaid, netWorth: ownerBeat1Net });
  cache.stagedState = next;

  cache.stagedTimer = window.setTimeout(() => {
    cache.stagedTimer = null;
    cache.stagedOverrides.clear();
    cache.stagedState = null;
    const targetAssets = Math.max(1, next.config.targetAssets);
    for (const id of [receipt.buyerId, receipt.ownerId]) {
      const ref = cache.cardRefs.find((r) => r.playerId === id);
      const player = next.players.find((p) => p.id === id);
      if (!ref || !player) continue;
      const finalNet = computePlayerNetWorth(next, player.id);
      const pct = Math.max(0, Math.round((finalNet / targetAssets) * 100));
      setRollingStatTarget(ref.cashStat, player.cash, { durationMs: 520 });
      setRollingStatTarget(ref.netStat, finalNet, { durationMs: 520 });
      ref.progress.title = `${formatDollars(finalNet)} / ${formatDollars(targetAssets)} target (${pct}%)`;
      ref.progressFill.style.width = `${Math.min(100, pct)}%`;
    }
  }, delayMs);
}

function mountCard(player: Player, netWorth: number): PlayerCardDomRef {
  const card = document.createElement('div');
  const head = document.createElement('div');
  head.className = 'player-card-head';
  const nameWrap = document.createElement('span');
  nameWrap.className = 'player-card-namewrap';
  const hudAv = document.createElement('span');
  hudAv.className = 'hud-avatar';
  const nameSpan = document.createElement('span');
  nameWrap.append(hudAv, nameSpan);
  const ptsSpan = document.createElement('span');
  head.append(nameWrap, ptsSpan);

  const cashBox = makeRollingStatBox('CASH', player.cash, 'player-stat is-cash', (v) =>
    v < 0 ? 'player-stat is-cash is-negative' : 'player-stat is-cash'
  );
  const netBox = makeRollingStatBox('NET ASSETS', netWorth, 'player-stat is-net');
  const finances = document.createElement('div');
  finances.className = 'player-card-finances';
  finances.append(cashBox.box, netBox.box);

  const progress = document.createElement('div');
  progress.className = 'player-card-progress';
  const progressFill = document.createElement('div');
  progressFill.className = 'player-card-progress-fill';
  progress.appendChild(progressFill);

  const metaRow = document.createElement('div');
  metaRow.className = 'player-card-meta';
  card.append(head, finances, progress, metaRow);

  return {
    playerId: player.id,
    card,
    nameWrap,
    hudAv,
    nameSpan,
    badgeEl: null,
    ptsSpan,
    progress,
    progressFill,
    metaRow,
    cashStat: cashBox.handle,
    netStat: netBox.handle,
    lastAvatarKey: '',
    lastBadgeKey: '',
    lastMetaKey: '',
  };
}

function patchCard(
  ref: PlayerCardDomRef,
  state: GameState,
  player: Player,
  idx: number,
  ownedCount: number,
  displayCash: number,
  displayNetWorth: number,
  immediate: boolean,
  netInfo?: HudNetInfo
): void {
  const isActive = idx === state.activePlayerIndex;
  const cls = ['player-card'];
  if (isActive) cls.push('is-active');
  if (player.isBankrupt) cls.push('is-bankrupt');
  ref.card.className = cls.join(' ');
  ref.card.style.borderColor = isActive ? player.color : '';

  const resolvedAvatar = resolvePlayerAvatar(state, idx, netInfo?.roster, netInfo?.customAvatars);
  const avatarKey = getAvatarRenderKey(resolvedAvatar, player.color);
  if (avatarKey !== ref.lastAvatarKey) {
    ref.hudAv.style.borderColor = player.color;
    ref.hudAv.innerHTML = '';
    ref.hudAv.appendChild(createAvatarElement(resolvedAvatar, player.color));
    ref.lastAvatarKey = avatarKey;
  }

  ref.nameSpan.style.color = player.color;
  ref.nameSpan.textContent = `P${idx + 1} ${player.name}`;

  const badge = resolveNetBadge(idx, netInfo);
  const badgeKey = badge ? `${badge.cls}|${badge.text}` : '';
  if (badgeKey !== ref.lastBadgeKey) {
    if (ref.badgeEl) {
      ref.nameWrap.innerHTML = '';
      ref.nameWrap.append(ref.hudAv, ref.nameSpan);
      ref.badgeEl = null;
    }
    if (badge) {
      const b = document.createElement('span');
      b.className = badge.cls;
      b.textContent = badge.text;
      ref.nameWrap.appendChild(b);
      ref.badgeEl = b;
    }
    ref.lastBadgeKey = badgeKey;
  }

  ref.ptsSpan.className = player.isBankrupt ? 'player-card-pts is-bankrupt' : 'player-card-pts';
  ref.ptsSpan.textContent = player.isBankrupt ? 'BANKRUPT' : `${player.points} pts`;

  setRollingStatTarget(ref.cashStat, displayCash, { immediate });
  setRollingStatTarget(ref.netStat, displayNetWorth, { immediate });

  const targetAssets = Math.max(1, state.config.targetAssets);
  const pct = Math.max(0, Math.round((displayNetWorth / targetAssets) * 100));
  ref.progress.title = `${formatDollars(displayNetWorth)} / ${formatDollars(targetAssets)} target (${pct}%)`;
  ref.progressFill.style.width = `${Math.min(100, pct)}%`;
  ref.progressFill.style.backgroundColor = player.color;

  const chips = collectStatusChips(player, ownedCount);
  const metaKey = chips.map((c) => `${c.variant}:${c.text}`).join('|');
  if (metaKey !== ref.lastMetaKey) {
    ref.metaRow.innerHTML = '';
    for (const c of chips) ref.metaRow.appendChild(makeMetaChip(c.text, c.variant));
    ref.lastMetaKey = metaKey;
  }
}

export function renderPlayersHud(container: HTMLElement, state: GameState, netInfo?: HudNetInfo): void {
  const storeCounts: Record<string, number> = {};
  for (const shop of Object.values(state.shops)) {
    if (shop.ownerId) storeCounts[shop.ownerId] = (storeCounts[shop.ownerId] ?? 0) + 1;
  }

  const sig = state.players.map((p) => p.id).join('|');
  let cache = hudCacheMap.get(container);
  const rebuilt = !cache || cache.signature !== sig;
  if (rebuilt) {
    resetPlayersHudCache(container);
    container.innerHTML = '';
    const cardRefs = state.players.map((player) => {
      const ref = mountCard(player, computePlayerNetWorth(state, player.id));
      container.appendChild(ref.card);
      return ref;
    });
    cache = { signature: sig, cardRefs, stagedTimer: null, stagedState: null, stagedOverrides: new Map() };
    hudCacheMap.set(container, cache);
  } else if (cache!.stagedState && cache!.stagedState !== state) {
    clearStagedOverride(cache!);
  }

  state.players.forEach((player, idx) => {
    const ref = cache!.cardRefs[idx]!;
    const override = cache!.stagedState === state ? cache!.stagedOverrides.get(player.id) : undefined;
    const displayCash = override ? override.cash : player.cash;
    const displayNetWorth = override ? override.netWorth : computePlayerNetWorth(state, player.id);
    patchCard(ref, state, player, idx, storeCounts[player.id] ?? 0, displayCash, displayNetWorth, rebuilt, netInfo);
  });
}
