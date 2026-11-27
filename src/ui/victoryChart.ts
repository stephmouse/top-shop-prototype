import { MONTH_NAMES } from '../config/balance';
import { buildAssetSnapshot } from '../engine/matchStats';
import { getWinnerIds } from '../engine/turn';
import type { AssetHistorySnapshot, GameState } from '../engine/types';
import { formatDollars } from './cashCounter';
import { mk } from './lobbyRoomView';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_W = 640;
const VIEW_H = 228;
const PAD_L = 58;
const PAD_R = 18;
const PAD_T = 16;
const PAD_B = 30;
const PLOT_W = VIEW_W - PAD_L - PAD_R;
const PLOT_H = VIEW_H - PAD_T - PAD_B;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

function formatSnapLabel(snap: AssetHistorySnapshot, idx: number): string {
  const year = Math.floor(snap.totalMonths / 12) + 1;
  const monthShort = (MONTH_NAMES[snap.totalMonths % 12] ?? 'Apr').slice(0, 3);
  if (idx === 0 && snap.totalMonths === 0 && !snap.isFinal) return `Start (Y${year} ${monthShort})`;
  return snap.isFinal ? `Final (Y${year} ${monthShort})` : `Y${year} ${monthShort}`;
}

function niceBounds(minRaw: number, maxRaw: number): { yMin: number; yMax: number; ticks: number[] } {
  const span = Math.max(1000, maxRaw - minRaw);
  const rawStep = span / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / pow;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = Math.max(250, niceNorm * pow);
  const yMin = minRaw < 0 ? Math.floor(minRaw / step) * step : 0;
  const yMax = Math.max(yMin + step, Math.ceil(maxRaw / step) * step);
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + 0.001; v += step) {
    ticks.push(Math.round(v));
  }
  return { yMin, yMax, ticks };
}

/** Builds an interactive SVG chart showing each player's Total Assets per month. */
export function createVictoryChart(state: GameState): HTMLElement {
  const wrap = mk('div', 'victory-chart-wrap');
  const rawHistory = state.assetHistory ?? [];
  const snapshots: AssetHistorySnapshot[] =
    rawHistory.length >= 2
      ? rawHistory
      : rawHistory.length === 1
        ? [rawHistory[0]!, buildAssetSnapshot(state, true)]
        : [buildAssetSnapshot(state, false), buildAssetSnapshot(state, true)];

  let minVal = 0;
  let maxVal = Math.max(1000, state.config.targetAssets);
  for (const snap of snapshots) {
    for (const v of Object.values(snap.netWorthByPlayer)) {
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
  }
  const { yMin, yMax, ticks } = niceBounds(minVal, maxVal);

  const xAt = (idx: number): number =>
    snapshots.length <= 1
      ? PAD_L + PLOT_W / 2
      : PAD_L + (idx / (snapshots.length - 1)) * PLOT_W;
  const yAt = (val: number): number =>
    PAD_T + PLOT_H - ((val - yMin) / Math.max(1, yMax - yMin)) * PLOT_H;

  const readout = mk('div', 'victory-chart-readout');
  wrap.appendChild(readout);

  const svg = svgEl('svg', {
    class: 'victory-chart-svg',
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    role: 'img',
    'aria-label': 'Total Assets history graph',
  });

  // Grid lines and Y ticks
  for (const tick of ticks) {
    const y = yAt(tick);
    svg.appendChild(
      svgEl('line', {
        x1: PAD_L,
        y1: y.toFixed(1),
        x2: VIEW_W - PAD_R,
        y2: y.toFixed(1),
        class: tick === 0 ? 'victory-chart-axis' : 'victory-chart-grid',
      })
    );
    const lbl = svgEl('text', {
      x: PAD_L - 8,
      y: (y + 3.5).toFixed(1),
      class: 'victory-chart-ylabel',
      'text-anchor': 'end',
    });
    lbl.textContent = formatDollars(tick);
    svg.appendChild(lbl);
  }

  // Target Assets goal line
  const goalY = yAt(state.config.targetAssets);
  if (goalY >= PAD_T - 2 && goalY <= VIEW_H - PAD_B + 2) {
    svg.appendChild(
      svgEl('line', {
        x1: PAD_L,
        y1: goalY.toFixed(1),
        x2: VIEW_W - PAD_R,
        y2: goalY.toFixed(1),
        class: 'victory-chart-goal',
      })
    );
    const goalTxt = svgEl('text', {
      x: VIEW_W - PAD_R - 4,
      y: Math.max(PAD_T + 10, goalY - 4).toFixed(1),
      class: 'victory-chart-goal-label',
      'text-anchor': 'end',
    });
    goalTxt.textContent = `Goal ${formatDollars(state.config.targetAssets)}`;
    svg.appendChild(goalTxt);
  }

  // X-axis tick labels (spaced up to ~7 labels)
  const labelStride = Math.max(1, Math.ceil((snapshots.length - 1) / 6));
  for (let i = 0; i < snapshots.length; i++) {
    const isLast = i === snapshots.length - 1;
    if (i % labelStride !== 0 && !isLast) continue;
    if (!isLast && snapshots.length - 1 - i < Math.ceil(labelStride * 0.45)) continue;
    const xLbl = svgEl('text', {
      x: xAt(i).toFixed(1),
      y: VIEW_H - 10,
      class: 'victory-chart-xlabel',
      'text-anchor': i === 0 ? 'start' : isLast ? 'end' : 'middle',
    });
    xLbl.textContent = formatSnapLabel(snapshots[i]!, i);
    svg.appendChild(xLbl);
  }

  // Player trajectory lines & active dots
  const winnerIdSet = new Set(getWinnerIds(state));
  const linesGroup = svgEl('g');
  const lineEls = new Map<string, SVGPolylineElement>();
  const markerDots = new Map<string, SVGCircleElement>();

  for (const player of state.players) {
    const isWinner = winnerIdSet.has(player.id);
    const points = snapshots
      .map((snap, i) => `${xAt(i).toFixed(1)},${yAt(snap.netWorthByPlayer[player.id] ?? player.cash).toFixed(1)}`)
      .join(' ');
    const poly = svgEl('polyline', {
      points,
      fill: 'none',
      stroke: player.color,
      class: `victory-chart-line${isWinner ? ' is-winner' : ''}`,
    });
    linesGroup.appendChild(poly);
    lineEls.set(player.id, poly);
  }
  svg.appendChild(linesGroup);

  const hoverLine = svgEl('line', {
    x1: xAt(snapshots.length - 1).toFixed(1),
    y1: PAD_T,
    x2: xAt(snapshots.length - 1).toFixed(1),
    y2: VIEW_H - PAD_B,
    class: 'victory-chart-cursor',
  });
  svg.appendChild(hoverLine);

  for (const player of state.players) {
    const dot = svgEl('circle', {
      r: winnerIdSet.has(player.id) ? 4.5 : 3.5,
      fill: player.color,
      class: 'victory-chart-dot',
    });
    svg.appendChild(dot);
    markerDots.set(player.id, dot);
  }

  const hitRect = svgEl('rect', {
    x: PAD_L,
    y: PAD_T,
    width: PLOT_W,
    height: PLOT_H,
    fill: 'transparent',
    class: 'victory-chart-hit',
  });
  svg.appendChild(hitRect);
  wrap.appendChild(svg);

  // Interactive legend chips
  let pinnedPlayerId: string | null = null;
  let hoveredPlayerId: string | null = null;
  const legend = mk('div', 'victory-chart-legend');
  const legendBtns = new Map<string, HTMLButtonElement>();

  const syncLineHighlight = () => {
    const focusId = hoveredPlayerId ?? pinnedPlayerId;
    for (const player of state.players) {
      const line = lineEls.get(player.id);
      const dot = markerDots.get(player.id);
      const btn = legendBtns.get(player.id);
      const active = !focusId || focusId === player.id;
      line?.classList.toggle('is-dimmed', !active);
      line?.classList.toggle('is-focused', Boolean(focusId && focusId === player.id));
      dot?.classList.toggle('is-dimmed', !active);
      btn?.classList.toggle('is-active', Boolean(focusId && focusId === player.id));
      btn?.classList.toggle('is-dimmed', Boolean(focusId && focusId !== player.id));
    }
  };

  for (const player of state.players) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'victory-legend-chip';
    const swatch = mk('span', 'victory-legend-swatch');
    swatch.style.backgroundColor = player.color;
    const text = mk(
      'span',
      '',
      `${player.name}${winnerIdSet.has(player.id) ? ' ★' : ''}`
    );
    btn.append(swatch, text);
    btn.addEventListener('mouseenter', () => {
      hoveredPlayerId = player.id;
      syncLineHighlight();
    });
    btn.addEventListener('mouseleave', () => {
      hoveredPlayerId = null;
      syncLineHighlight();
    });
    btn.addEventListener('click', () => {
      pinnedPlayerId = pinnedPlayerId === player.id ? null : player.id;
      syncLineHighlight();
    });
    legend.appendChild(btn);
    legendBtns.set(player.id, btn);
  }
  wrap.appendChild(legend);

  let activeSnapIdx = snapshots.length - 1;
  const syncReadout = (idx: number) => {
    activeSnapIdx = Math.max(0, Math.min(snapshots.length - 1, idx));
    const snap = snapshots[activeSnapIdx]!;
    const x = xAt(activeSnapIdx).toFixed(1);
    hoverLine.setAttribute('x1', x);
    hoverLine.setAttribute('x2', x);

    readout.innerHTML = '';
    readout.appendChild(mk('strong', 'victory-readout-date', formatSnapLabel(snap, activeSnapIdx)));

    const sortedPlayers = [...state.players].sort(
      (a, b) => (snap.netWorthByPlayer[b.id] ?? 0) - (snap.netWorthByPlayer[a.id] ?? 0)
    );
    for (const player of sortedPlayers) {
      const val = snap.netWorthByPlayer[player.id] ?? player.cash;
      const dot = markerDots.get(player.id);
      if (dot) {
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', yAt(val).toFixed(1));
      }
      const item = mk('span', 'victory-readout-item');
      const pip = mk('span', 'victory-legend-swatch');
      pip.style.backgroundColor = player.color;
      item.append(pip, mk('span', '', `${player.name}: ${formatDollars(val)}`));
      readout.appendChild(item);
    }
  };

  const handlePointer = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * VIEW_W;
    const ratio = Math.max(0, Math.min(1, (svgX - PAD_L) / PLOT_W));
    const idx = Math.round(ratio * (snapshots.length - 1));
    if (idx !== activeSnapIdx) syncReadout(idx);
  };

  hitRect.addEventListener('pointermove', (e) => handlePointer(e.clientX));
  hitRect.addEventListener('pointerdown', (e) => handlePointer(e.clientX));
  svg.addEventListener('pointerleave', () => syncReadout(snapshots.length - 1));

  syncReadout(snapshots.length - 1);
  return wrap;
}
