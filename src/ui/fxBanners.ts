import { MONTH_NAMES } from '../config/balance';
import { formatDollars } from './cashCounter';
import type { VisualEvent } from './stateDiff';

export interface MonthTheme {
  icon: string;
  season: string;
  accent: string;
  bg: string;
}

const MONTH_THEMES: readonly MonthTheme[] = [
  { icon: '🌸', season: 'Spring', accent: '#f472b6', bg: '#2c1828' },
  { icon: '🌷', season: 'Spring', accent: '#34d399', bg: '#142a22' },
  { icon: '☂️', season: 'Early Summer', accent: '#60a5fa', bg: '#142238' },
  { icon: '🌻', season: 'Summer', accent: '#fbbf24', bg: '#2b2312' },
  { icon: '🏖️', season: 'High Summer', accent: '#fb923c', bg: '#2c1c12' },
  { icon: '🍂', season: 'Early Autumn', accent: '#f59e0b', bg: '#292013' },
  { icon: '🎃', season: 'Autumn', accent: '#f97316', bg: '#2a1811' },
  { icon: '🍁', season: 'Late Autumn', accent: '#e11d48', bg: '#2b151d' },
  { icon: '❄️', season: 'Winter', accent: '#38bdf8', bg: '#132434' },
  { icon: '🎍', season: 'New Year', accent: '#a78bfa', bg: '#1f1a33' },
  { icon: '⛄', season: 'Winter', accent: '#93c5fd', bg: '#162134' },
  { icon: '🏷️', season: 'Fiscal End', accent: '#facc15', bg: '#2b2612' },
];

export function getMonthTheme(month: number): MonthTheme {
  const idx = ((month % 12) + 12) % 12;
  return MONTH_THEMES[idx]!;
}

export function createMonthBannerElement(month: number, year: number): HTMLElement {
  const idx = ((month % 12) + 12) % 12;
  const theme = getMonthTheme(idx);
  const banner = document.createElement('div');
  banner.className = 'fx-month-banner';
  banner.style.setProperty('--month-accent', theme.accent);
  banner.style.setProperty('--month-bg', theme.bg);

  const ribbon = document.createElement('div');
  ribbon.className = 'fx-month-ribbon';
  ribbon.textContent = `YEAR ${year} · ${theme.season.toUpperCase()}`;

  const main = document.createElement('div');
  main.className = 'fx-month-main';
  const icon = document.createElement('span');
  icon.className = 'fx-month-icon';
  icon.textContent = theme.icon;
  const name = document.createElement('span');
  name.className = 'fx-month-name';
  name.textContent = MONTH_NAMES[idx] ?? 'April';
  main.append(icon, name);

  banner.append(ribbon, main);
  return banner;
}

export function createCashbackBannerElement(
  ev: Extract<VisualEvent, { type: 'cashback_triggered' }>
): HTMLElement {
  const banner = document.createElement('div');
  banner.className = 'fx-cashback-banner';

  const kicker = document.createElement('div');
  kicker.className = 'fx-cashback-kicker';
  kicker.textContent = '💸 CASH BACK!';

  const headline = document.createElement('div');
  headline.className = 'fx-cashback-headline';
  headline.textContent = `${ev.buyerName} gets +${formatDollars(ev.cashbackRefund)} back!`;

  const sub = document.createElement('div');
  sub.className = 'fx-cashback-sub';
  sub.textContent = `${ev.ownerName}'s ${ev.storeName} paid 2× on ${ev.refundedItemNames.join(', ')}!`;

  banner.append(kicker, headline, sub);
  return banner;
}
