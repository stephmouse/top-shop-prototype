import type { WalkSoundStyle } from '../config/walkSounds';
import type { GameState, Shop } from '../engine/types';

export const STEP_DURATION_MS = 200;
export const ESCALATOR_DWELL_MS = 260;

export function getMoveDurationMs(kind: 'step' | 'escalator' | 'elevator', floorDelta: number): number {
  if (kind === 'escalator') return floorDelta >= 2 ? 540 : 440;
  if (kind === 'elevator') return 420 + Math.max(1, floorDelta) * 100;
  return STEP_DURATION_MS;
}

export type VisualEvent =
  | {
      type: 'player_moved';
      playerId: string;
      fromTileId: string;
      toTileId: string;
      kind: 'step' | 'escalator' | 'elevator';
      floorDelta?: number;
      verticalSign?: -1 | 0 | 1;
      durationMs?: number;
      chirp?: boolean;
      walkSound?: WalkSoundStyle;
    }
  | { type: 'bank_payday'; playerId: string; tileId: string; isExact: boolean }
  | { type: 'cash_delta'; playerId: string; tileId: string; amount: number; reason: 'payday' | 'gain' | 'loss'; isHurt: boolean; isActive: boolean }
  | { type: 'points_delta'; playerId: string; tileId: string; amount: number }
  | { type: 'chirp_equipped'; playerId: string; tileId: string; walkSound?: WalkSoundStyle }
  | { type: 'shop_changed'; shopId: string; tileId: string; kind: 'opened' | 'buyout' | 'vacated' | 'upgraded' | 'closed' | 'restocked' }
  | { type: 'liquidate_forced'; playerId: string; tileId: string }
  | {
      type: 'cashback_triggered';
      buyerId: string;
      buyerName: string;
      buyerTileId: string;
      ownerId: string;
      ownerName: string;
      ownerTileId: string;
      shopTileId: string;
      storeName: string;
      grossPaid: number;
      cashbackCount: number;
      cashbackRefund: number;
      refundedItemNames: string[];
    }
  | { type: 'month_changed'; month: number; year: number };

function sumStock(shop: Shop): number {
  let total = 0;
  for (const qty of Object.values(shop.stock)) total += qty;
  return total;
}

function classifyMoveKind(prev: GameState, fromTileId: string): 'step' | 'escalator' | 'elevator' {
  if (prev.phase === 'ESCALATOR_RIDE' || prev.phase === 'ESCALATOR_UNDO') return 'escalator';
  if (prev.phase === 'CHOOSE_DIRECTION' && prev.tiles[fromTileId]?.type === 'escalator') return 'escalator';
  if (prev.phase === 'ELEVATOR_PROMPT' || prev.phase === 'BANK_MENU') return 'elevator';
  return 'step';
}

export function diffGameStates(prev: GameState | null, next: GameState): VisualEvent[] {
  if (!prev || prev === next) return [];
  if (prev.mapId !== next.mapId || prev.players.length !== next.players.length) return [];
  if (next.turnNumber < prev.turnNumber) return [];

  const events: VisualEvent[] = [];
  const canHurt = prev.phase === 'SHOP_BUY_RIVAL' || prev.phase === 'EVENT_PICK' || prev.phase === 'BANK_MENU';
  const cashbackReceipt =
    prev.phase === 'SHOP_BUY_RIVAL' &&
    next.lastPurchaseReceipt &&
    next.lastPurchaseReceipt.cashbackCount > 0
      ? next.lastPurchaseReceipt
      : null;

  for (let i = 0; i < next.players.length; i++) {
    const pp = prev.players[i];
    const np = next.players[i];
    if (!pp || !np) continue;

    if (np.tileId !== pp.tileId) {
      const kind = classifyMoveKind(prev, pp.tileId);
      const fromFloor = prev.tiles[pp.tileId]?.floor ?? 1;
      const toFloor = next.tiles[np.tileId]?.floor ?? 1;
      const floorDelta = Math.abs(toFloor - fromFloor);
      const verticalSign: -1 | 0 | 1 = toFloor > fromFloor ? 1 : toFloor < fromFloor ? -1 : 0;
      events.push({
        type: 'player_moved',
        playerId: np.id,
        fromTileId: pp.tileId,
        toTileId: np.tileId,
        kind,
        floorDelta,
        verticalSign,
        durationMs: getMoveDurationMs(kind, floorDelta),
        ...(np.chirpSandals ? { chirp: true, walkSound: np.equippedWalkSound ?? 'chirp' } : {}),
      });
    }

    const paydayTriggered = np.bankVisits > pp.bankVisits;
    if (paydayTriggered) {
      const tileType = next.tiles[np.tileId]?.type;
      events.push({
        type: 'bank_payday',
        playerId: np.id,
        tileId: np.tileId,
        isExact: tileType === 'bank' && next.pendingPostBankPhase === null,
      });
    }

    const cashDiff = np.cash - pp.cash;
    const suppressedByCashback =
      cashbackReceipt && (np.id === cashbackReceipt.buyerId || np.id === cashbackReceipt.ownerId);
    if (cashDiff !== 0 && !suppressedByCashback) {
      events.push({
        type: 'cash_delta',
        playerId: np.id,
        tileId: np.tileId,
        amount: cashDiff,
        reason: paydayTriggered && cashDiff > 0 ? 'payday' : cashDiff > 0 ? 'gain' : 'loss',
        isHurt: cashDiff < 0 && canHurt,
        isActive: i === prev.activePlayerIndex,
      });
    }

    const ptsDiff = np.points - pp.points;
    if (ptsDiff !== 0) {
      events.push({ type: 'points_delta', playerId: np.id, tileId: np.tileId, amount: ptsDiff });
    }
    if (!pp.chirpSandals && np.chirpSandals) {
      events.push({ type: 'chirp_equipped', playerId: np.id, tileId: np.tileId, walkSound: np.equippedWalkSound ?? 'chirp' });
    }
  }

  for (const [shopId, ns] of Object.entries(next.shops)) {
    const ps = prev.shops[shopId];
    if (!ps) continue;

    if (!ps.ownerId && ns.ownerId) {
      events.push({ type: 'shop_changed', shopId, tileId: ns.tileId, kind: 'opened' });
    } else if (ps.ownerId && !ns.ownerId) {
      events.push({ type: 'shop_changed', shopId, tileId: ns.tileId, kind: 'vacated' });
    } else if (ps.ownerId && ns.ownerId && ps.ownerId !== ns.ownerId) {
      events.push({ type: 'shop_changed', shopId, tileId: ns.tileId, kind: 'buyout' });
    } else if (ns.ownerId && ns.level > ps.level) {
      events.push({ type: 'shop_changed', shopId, tileId: ns.tileId, kind: 'upgraded' });
    } else if (ns.isClosedTurns > ps.isClosedTurns) {
      events.push({ type: 'shop_changed', shopId, tileId: ns.tileId, kind: 'closed' });
    } else if (ns.ownerId && sumStock(ns) > sumStock(ps)) {
      events.push({ type: 'shop_changed', shopId, tileId: ns.tileId, kind: 'restocked' });
    }
  }

  if (prev.phase !== 'LIQUIDATE_ASSETS' && next.phase === 'LIQUIDATE_ASSETS') {
    const active = next.players[next.activePlayerIndex];
    if (active) {
      events.push({ type: 'liquidate_forced', playerId: active.id, tileId: active.tileId });
    }
  }

  if (cashbackReceipt) {
    const buyer = next.players.find((p) => p.id === cashbackReceipt.buyerId);
    const owner = next.players.find((p) => p.id === cashbackReceipt.ownerId);
    if (buyer && owner) {
      events.push({
        type: 'cashback_triggered',
        buyerId: buyer.id,
        buyerName: buyer.name,
        buyerTileId: buyer.tileId,
        ownerId: owner.id,
        ownerName: owner.name,
        ownerTileId: owner.tileId,
        shopTileId: cashbackReceipt.tileId,
        storeName: cashbackReceipt.storeName,
        grossPaid: cashbackReceipt.grossPaid,
        cashbackCount: cashbackReceipt.cashbackCount,
        cashbackRefund: cashbackReceipt.cashbackRefund,
        refundedItemNames: cashbackReceipt.refundedItemNames,
      });
    }
  }

  if (next.totalMonths > prev.totalMonths && next.config.showMonthPopup !== false && next.phase !== 'GAME_OVER') {
    events.push({ type: 'month_changed', month: next.month, year: next.year });
  }

  return events;
}
