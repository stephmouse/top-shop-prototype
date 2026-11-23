import type { GameState } from '../engine/types';
import { getBoardTileElement } from './boardView';
import { formatDollars } from './cashCounter';
import { createCashbackBannerElement, createMonthBannerElement } from './fxBanners';
import { getTokenBodyElement } from './hudView';
import { CASHBACK_BEAT2_MS } from './playerCardView';
import type { SoundFxController } from './soundFx';
import { diffGameStates } from './stateDiff';

export interface FxOverlayController {
  el: HTMLElement;
  playStateDiff: (prev: GameState | null, next: GameState) => void;
  clear: () => void;
}

const SHOP_FX_CLASS: Record<'opened' | 'buyout' | 'vacated' | 'upgraded' | 'closed' | 'restocked', string> = {
  opened: 'fx-shop-open',
  buyout: 'fx-shop-buyout',
  vacated: 'fx-shop-vacate',
  upgraded: 'fx-shop-upgrade',
  closed: 'fx-shop-closed',
  restocked: 'fx-shop-restock',
};

const MOVE_FX: Record<'step' | 'escalator' | 'elevator', [string, number]> = {
  step: ['fx-hop', 210],
  escalator: ['fx-glide', 260],
  elevator: ['fx-teleport', 420],
};

function stripFxClasses(el: HTMLElement): void {
  const kept = (el.className || '')
    .split(/\s+/)
    .filter((c) => c && !c.startsWith('fx-'));
  el.className = kept.join(' ');
}

function removeNode(node: HTMLElement): void {
  if (typeof node.remove === 'function') node.remove();
}

export function createFxOverlay(
  boardEl: HTMLElement,
  tokensLayerEl: HTMLElement,
  soundFx?: SoundFxController
): FxOverlayController {
  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');

  const elemTimers = new WeakMap<HTMLElement, number>();
  const activeTimers = new Set<number>();
  const activeFxTargets = new Set<HTMLElement>();

  function scheduleTimer(fn: () => void, ms: number): number {
    const id = window.setTimeout(() => {
      activeTimers.delete(id);
      fn();
    }, ms);
    activeTimers.add(id);
    return id;
  }

  function removeByClass(cls: string): void {
    for (const child of Array.from(layer.children)) {
      if (((child as HTMLElement).className || '').includes(cls)) {
        removeNode(child as HTMLElement);
      }
    }
  }

  function triggerFxClass(target: HTMLElement | undefined, cls: string, durationMs: number): void {
    if (!target) return;
    const prevTimer = elemTimers.get(target);
    if (prevTimer !== undefined) {
      window.clearTimeout(prevTimer);
      activeTimers.delete(prevTimer);
    }

    stripFxClasses(target);
    void target.offsetWidth;
    target.className = target.className ? `${target.className} ${cls}` : cls;
    activeFxTargets.add(target);

    const timerId = scheduleTimer(() => {
      stripFxClasses(target);
      elemTimers.delete(target);
      activeFxTargets.delete(target);
    }, durationMs);
    elemTimers.set(target, timerId);
  }

  function spawnFloatBadge(tileEl: HTMLElement | undefined, text: string, variant: string, stackIdx: number): void {
    if (!tileEl) return;
    const badge = document.createElement('span');
    badge.className = `fx-float-badge ${variant}`;
    badge.textContent = text;
    badge.style.left = `${tileEl.offsetLeft + Math.max(12, Math.round(tileEl.offsetWidth / 2))}px`;
    badge.style.top = `${Math.max(4, tileEl.offsetTop + 12 - stackIdx * 18)}px`;
    layer.appendChild(badge);
    scheduleTimer(() => removeNode(badge), 950);
  }

  function clear(): void {
    for (const id of activeTimers) window.clearTimeout(id);
    activeTimers.clear();
    for (const target of activeFxTargets) {
      elemTimers.delete(target);
      stripFxClasses(target);
    }
    activeFxTargets.clear();
    layer.innerHTML = '';
  }

  function playStateDiff(prev: GameState | null, next: GameState): void {
    const sameMatch =
      prev && prev !== next && prev.mapId === next.mapId && prev.players.length === next.players.length && next.turnNumber >= prev.turnNumber;
    if (sameMatch && soundFx) {
      if (prev.phase === 'EVENT_PICK' && (prev.revealedEventSlot ?? null) === null && (next.revealedEventSlot ?? null) !== null) {
        soundFx.playCardFlip();
      } else if (prev.phase === 'ROLL_PENCIL' && next.phase !== 'ROLL_PENCIL') {
        soundFx.playPencilStop();
      }
    }

    const events = diffGameStates(prev, next);
    if (events.length === 0) return;
    soundFx?.playVisualEvents(events);

    const hasCashback = events.some((e) => e.type === 'cashback_triggered');
    const tileStacks = new Map<string, number>();
    const bumpStack = (tileId: string) => {
      const idx = tileStacks.get(tileId) ?? 0;
      tileStacks.set(tileId, idx + 1);
      return idx;
    };

    for (const ev of events) {
      if (ev.type === 'player_moved') {
        const [cls, ms] = MOVE_FX[ev.kind];
        triggerFxClass(getTokenBodyElement(tokensLayerEl, ev.playerId), cls, ms);
      } else if (ev.type === 'bank_payday') {
        triggerFxClass(getTokenBodyElement(tokensLayerEl, ev.playerId), 'fx-celebrate', 520);
        triggerFxClass(getBoardTileElement(boardEl, ev.tileId), 'fx-bank-pulse', 650);
      } else if (ev.type === 'cash_delta') {
        const sign = ev.amount > 0 ? '+' : '-';
        const variant = ev.reason === 'payday' ? 'is-payday' : ev.amount > 0 ? 'is-gain' : 'is-loss';
        spawnFloatBadge(getBoardTileElement(boardEl, ev.tileId), `${sign}$${Math.abs(ev.amount)}`, variant, bumpStack(ev.tileId));
        if (ev.isHurt) {
          triggerFxClass(getTokenBodyElement(tokensLayerEl, ev.playerId), 'fx-shake', 420);
        }
      } else if (ev.type === 'points_delta') {
        const sign = ev.amount > 0 ? '+' : '-';
        spawnFloatBadge(getBoardTileElement(boardEl, ev.tileId), `${sign}${Math.abs(ev.amount)} pts`, 'is-pts', bumpStack(ev.tileId));
      } else if (ev.type === 'chirp_equipped') {
        triggerFxClass(getTokenBodyElement(tokensLayerEl, ev.playerId), 'fx-celebrate', 520);
        spawnFloatBadge(getBoardTileElement(boardEl, ev.tileId), 'Chirp-Chirp!', 'is-payday', bumpStack(ev.tileId));
      } else if (ev.type === 'shop_changed') {
        triggerFxClass(getBoardTileElement(boardEl, ev.tileId), SHOP_FX_CLASS[ev.kind], 650);
      } else if (ev.type === 'liquidate_forced') {
        triggerFxClass(getTokenBodyElement(tokensLayerEl, ev.playerId), 'fx-shake', 420);
      } else if (ev.type === 'cashback_triggered') {
        // Beat 1: Normal purchase pay/gain floats & owner smugly celebrates
        spawnFloatBadge(getBoardTileElement(boardEl, ev.shopTileId), `-${formatDollars(ev.grossPaid)}`, 'is-loss', bumpStack(ev.shopTileId));
        spawnFloatBadge(getBoardTileElement(boardEl, ev.ownerTileId), `+${formatDollars(ev.grossPaid)}`, 'is-gain', bumpStack(ev.ownerTileId));
        triggerFxClass(getTokenBodyElement(tokensLayerEl, ev.buyerId), 'fx-shake', 420);
        triggerFxClass(getTokenBodyElement(tokensLayerEl, ev.ownerId), 'fx-celebrate', 480);

        // Beat 2: Bait-and-switch 2x Cash Back refund drops on owner!
        scheduleTimer(() => {
          removeByClass('fx-cashback-banner');
          const banner = createCashbackBannerElement(ev);
          layer.appendChild(banner);
          scheduleTimer(() => removeNode(banner), 1950);
          soundFx?.playCashbackFanfare();
          triggerFxClass(getTokenBodyElement(tokensLayerEl, ev.buyerId), 'fx-celebrate', 650);
          triggerFxClass(getTokenBodyElement(tokensLayerEl, ev.ownerId), 'fx-shake', 550);
          spawnFloatBadge(getBoardTileElement(boardEl, ev.buyerTileId), `+${formatDollars(ev.cashbackRefund)}`, 'is-payday', 0);
          spawnFloatBadge(getBoardTileElement(boardEl, ev.ownerTileId), `-${formatDollars(ev.cashbackRefund)}`, 'is-loss', 0);
        }, CASHBACK_BEAT2_MS);
      } else if (ev.type === 'month_changed') {
        const spawnMonth = () => {
          removeByClass('fx-month-banner');
          const banner = createMonthBannerElement(ev.month, ev.year);
          layer.appendChild(banner);
          soundFx?.playMonthFlip();
          scheduleTimer(() => removeNode(banner), 1380);
        };
        if (hasCashback) scheduleTimer(spawnMonth, 2100);
        else spawnMonth();
      }
    }
  }

  return { el: layer, playStateDiff, clear };
}
