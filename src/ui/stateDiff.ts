import type { GameState, Shop } from '../engine/types';

export type VisualEvent =
  | { type: 'player_moved'; playerId: string; fromTileId: string; toTileId: string; kind: 'step' | 'escalator' | 'elevator' }
  | { type: 'bank_payday'; playerId: string; tileId: string; isExact: boolean }
  | { type: 'cash_delta'; playerId: string; tileId: string; amount: number; reason: 'payday' | 'gain' | 'loss'; isHurt: boolean }
  | { type: 'points_delta'; playerId: string; tileId: string; amount: number }
  | { type: 'shop_changed'; shopId: string; tileId: string; kind: 'opened' | 'buyout' | 'vacated' | 'upgraded' | 'closed' | 'restocked' };

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

  for (let i = 0; i < next.players.length; i++) {
    const pp = prev.players[i];
    const np = next.players[i];
    if (!pp || !np) continue;

    if (np.tileId !== pp.tileId) {
      events.push({
        type: 'player_moved',
        playerId: np.id,
        fromTileId: pp.tileId,
        toTileId: np.tileId,
        kind: classifyMoveKind(prev, pp.tileId),
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
    if (cashDiff !== 0) {
      events.push({
        type: 'cash_delta',
        playerId: np.id,
        tileId: np.tileId,
        amount: cashDiff,
        reason: paydayTriggered && cashDiff > 0 ? 'payday' : cashDiff > 0 ? 'gain' : 'loss',
        isHurt: cashDiff < 0 && canHurt,
      });
    }

    const ptsDiff = np.points - pp.points;
    if (ptsDiff !== 0) {
      events.push({ type: 'points_delta', playerId: np.id, tileId: np.tileId, amount: ptsDiff });
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

  return events;
}
