import { MONTH_NAMES } from '../config/balance';
import type { GameState } from '../engine/types';
import { getMonthTheme } from './fxBanners';

const CALENDAR_RE = /^(?:\[T(\d+)\]\s*)?Calendar:\s*(.+?)\.?$/;
const TURN_RE = /^\[T(\d+)\]\s*(.+)$/;
const RING_COUNT = 6;

function classifyLogEntry(text: string): string {
  const lower = text.toLowerCase();
  if (lower.startsWith('match started')) return '';
  if (lower.includes('cash back')) return 'is-cashback';
  if (lower.includes('bankrupt') || lower.includes('liquidated') || lower.includes('closed') || lower.includes('penalty')) {
    return 'is-alert';
  }
  if (lower.includes('payday') || lower.includes('bank') || lower.includes('redeemed')) return 'is-payday';
  if (lower.includes('event:') || lower.includes('picked event') || lower.includes('sale') || lower.includes('card')) {
    return 'is-event';
  }
  if (
    lower.includes('bought') ||
    lower.includes('opened') ||
    lower.includes('restocked') ||
    lower.includes('upgraded') ||
    lower.includes('delivered')
  ) {
    return 'is-shop';
  }
  return '';
}

function makeSpan(className: string, textContent: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = textContent;
  return el;
}

export function renderMatchLog(container: HTMLElement, state: GameState): void {
  container.innerHTML = '';

  const theme = getMonthTheme(state.month);
  const monthName = MONTH_NAMES[((state.month % 12) + 12) % 12] ?? 'April';

  const rings = document.createElement('div');
  rings.className = 'calendar-log-rings';
  rings.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < RING_COUNT; i++) {
    rings.appendChild(makeSpan('calendar-log-ring', ''));
  }

  const header = document.createElement('div');
  header.className = 'calendar-log-header';
  header.style.setProperty('--cal-accent', theme.accent);

  const dateWrap = document.createElement('div');
  dateWrap.className = 'calendar-log-date';
  dateWrap.append(
    makeSpan('calendar-log-icon', theme.icon),
    makeSpan('calendar-log-month', monthName),
    makeSpan('calendar-log-year', `Year ${state.year}`)
  );

  const metaWrap = document.createElement('div');
  metaWrap.className = 'calendar-log-meta';
  metaWrap.append(
    makeSpan('calendar-log-title', 'Match Log'),
    makeSpan('calendar-log-turnpill', `Turn ${state.turnNumber}`)
  );
  header.append(dateWrap, metaWrap);

  const list = document.createElement('ol');
  list.className = 'calendar-log-list';

  for (const raw of state.log) {
    const li = document.createElement('li');
    const calMatch = CALENDAR_RE.exec(raw);
    if (calMatch) {
      const turn = calMatch[1];
      const label = calMatch[2] ?? '';
      const monthIdx = MONTH_NAMES.findIndex((m) => label.includes(m));
      const divTheme = monthIdx >= 0 ? getMonthTheme(monthIdx) : theme;
      li.className = 'calendar-log-divider';
      li.style.setProperty('--div-accent', divTheme.accent);
      li.append(
        makeSpan('calendar-log-div-icon', divTheme.icon),
        makeSpan('calendar-log-div-label', label)
      );
      if (turn) li.appendChild(makeSpan('calendar-log-div-turn', `T${turn}`));
    } else {
      const turnMatch = TURN_RE.exec(raw);
      const turnTag = turnMatch?.[1] ? `T${turnMatch[1]}` : 'START';
      const body = turnMatch?.[2] ?? raw;
      const cat = classifyLogEntry(body);
      li.className = cat ? `calendar-log-entry ${cat}` : 'calendar-log-entry';
      li.append(makeSpan('calendar-log-turn', turnTag), makeSpan('calendar-log-text', body));
    }
    list.appendChild(li);
  }

  container.append(rings, header, list);
}
