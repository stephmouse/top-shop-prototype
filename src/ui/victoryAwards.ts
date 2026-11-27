import { computePlayerNetWorth } from '../engine/helpers';
import { getPlayerMatchStats } from '../engine/matchStats';
import type { PlayerMatchStats } from '../engine/matchStats';
import type { GameState, Player } from '../engine/types';
import { formatDollars } from './cashCounter';

export interface MatchAward {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  winnerIds: string[];
  valueLabel: string;
}

interface AwardSpec {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  score: (stats: PlayerMatchStats, player: Player, state: GameState) => number;
  tiebreak?: (stats: PlayerMatchStats, player: Player, state: GameState) => number;
  formatValue: (score: number, leaderStats: PlayerMatchStats) => string;
}

const AWARD_SPECS: readonly AwardSpec[] = [
  {
    id: 'sales_superstar',
    icon: '💵',
    title: 'Sales Superstar',
    subtitle: 'Highest sales revenue',
    score: (s) => s.salesRevenue,
    formatValue: (v) => formatDollars(v),
  },
  {
    id: 'shopaholic',
    icon: '🛍️',
    title: 'Shopaholic',
    subtitle: 'Most spent at rival stores',
    score: (s) => s.shoppingSpent,
    formatValue: (v) => formatDollars(v),
  },
  {
    id: 'lucky_shopper',
    icon: '🍀',
    title: 'Lucky Shopper',
    subtitle: 'Most Cash Backs won',
    score: (s) => s.cashbackCount,
    tiebreak: (s) => s.cashbackTotal,
    formatValue: (v, st) => `${v} (${formatDollars(st.cashbackTotal)})`,
  },
  {
    id: 'logistics_pro',
    icon: '📦',
    title: 'Logistics Pro',
    subtitle: 'Most items delivered',
    score: (s) => s.itemsDelivered,
    formatValue: (v) => `${v} item${v === 1 ? '' : 's'}`,
  },
  {
    id: 'rollercoaster',
    icon: '📉',
    title: 'Rollercoaster',
    subtitle: 'Biggest drop from peak assets',
    score: (s, p, state) => Math.max(0, s.peakNetWorth - computePlayerNetWorth(state, p.id)),
    formatValue: (v) => `-${formatDollars(v)}`,
  },
  {
    id: 'hostile_takeover',
    icon: '🦈',
    title: 'Hostile Takeover',
    subtitle: 'Most rival buyouts made',
    score: (s) => s.buyoutsMade,
    formatValue: (v) => `${v} buyout${v === 1 ? '' : 's'}`,
  },
  {
    id: 'store_bandit',
    icon: '🏴‍☠️',
    title: 'Store Bandit',
    subtitle: 'Most rival stores captured',
    score: (s) => s.shopsStolen,
    formatValue: (v) => `${v} stolen`,
  },
  {
    id: 'public_enemy',
    icon: '🎯',
    title: 'Public Enemy #1',
    subtitle: 'Most stores bought out, closed, or stolen',
    score: (s) => s.timesBoughtOut + s.shopsClosedByRivals + s.shopsLostToTheft,
    formatValue: (v) => `${v} hit${v === 1 ? '' : 's'}`,
  },
  {
    id: 'fire_sale_survivor',
    icon: '🏚️',
    title: 'Fire Sale Survivor',
    subtitle: 'Most value lost to liquidation',
    score: (s) => s.liquidationValueLost,
    formatValue: (v) => `-${formatDollars(v)}`,
  },
  {
    id: 'mall_walker',
    icon: '👟',
    title: 'Mall Walker',
    subtitle: 'Most steps taken',
    score: (s) => s.stepsTaken,
    formatValue: (v) => `${v} steps`,
  },
  {
    id: 'frequent_flyer',
    icon: '🛗',
    title: 'Frequent Flyer',
    subtitle: 'Most elevator rides',
    score: (s) => s.elevatorsRidden,
    formatValue: (v) => `${v} ride${v === 1 ? '' : 's'}`,
  },
  {
    id: 'bullseye_banker',
    icon: '🏦',
    title: 'Bullseye Banker',
    subtitle: 'Most 1.5x exact Bank landings',
    score: (s) => s.exactBankLandings,
    formatValue: (v) => `${v} exact`,
  },
  {
    id: 'big_spender',
    icon: '💳',
    title: 'Big Spender',
    subtitle: 'Most Bank points redeemed',
    score: (s) => s.pointsSpent,
    formatValue: (v) => `${v} pts`,
  },
  {
    id: 'event_magnet',
    icon: '🎲',
    title: 'Event Magnet',
    subtitle: 'Most Event cards drawn',
    score: (s) => s.eventsDrawn,
    formatValue: (v) => `${v} drawn`,
  },
  {
    id: 'swing_and_miss',
    icon: '💨',
    title: 'Swing and a Miss',
    subtitle: 'Most Miss events drawn',
    score: (s) => s.eventMisses,
    formatValue: (v) => `${v} miss${v === 1 ? '' : 'es'}`,
  },
  {
    id: 'shoe_collector',
    icon: '👠',
    title: 'Shoe Collector',
    subtitle: 'Most times putting on Novelty Shoes',
    score: (s) => s.shoesPutOn,
    formatValue: (v) => `${v} time${v === 1 ? '' : 's'}`,
  },
];

/** Computes earned end-of-match superlative awards (omits 0-value awards). */
export function computeMatchAwards(state: GameState): MatchAward[] {
  const awards: MatchAward[] = [];

  for (const spec of AWARD_SPECS) {
    let bestScore = 0;
    let bestTie = -Infinity;
    let winners: Array<{ player: Player; stats: PlayerMatchStats }> = [];

    for (const player of state.players) {
      const stats = getPlayerMatchStats(state, player.id);
      const score = spec.score(stats, player, state);
      if (score <= 0) continue;
      const tie = spec.tiebreak ? spec.tiebreak(stats, player, state) : 0;

      if (score > bestScore || (score === bestScore && tie > bestTie)) {
        bestScore = score;
        bestTie = tie;
        winners = [{ player, stats }];
      } else if (score === bestScore && tie === bestTie) {
        winners.push({ player, stats });
      }
    }

    if (winners.length > 0 && bestScore > 0) {
      awards.push({
        id: spec.id,
        icon: spec.icon,
        title: spec.title,
        subtitle: spec.subtitle,
        winnerIds: winners.map((w) => w.player.id),
        valueLabel: spec.formatValue(bestScore, winners[0]!.stats),
      });
    }
  }

  return awards;
}
