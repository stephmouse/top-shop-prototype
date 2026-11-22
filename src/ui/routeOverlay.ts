import type { MovePreview } from '../engine/movePreview';
import type { GameState } from '../engine/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Point {
  x: number;
  y: number;
}

function getTileCenters(boardGrid: HTMLElement): Map<string, Point> {
  const centers = new Map<string, Point>();
  for (const el of Array.from(boardGrid.querySelectorAll<HTMLElement>('[data-tile-id]'))) {
    const id = el.dataset.tileId;
    if (!id) continue;
    centers.set(id, {
      x: el.offsetLeft + el.offsetWidth / 2,
      y: el.offsetTop + el.offsetHeight / 2,
    });
  }
  return centers;
}

function trimSegment(a: Point, b: Point, trimA: number, trimB: number): [Point, Point] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return [
    { x: a.x + (dx / len) * trimA, y: a.y + (dy / len) * trimA },
    { x: b.x - (dx / len) * trimB, y: b.y - (dy / len) * trimB },
  ];
}

function createMarker(id: string, color: string): SVGMarkerElement {
  const marker = document.createElementNS(SVG_NS, 'marker');
  marker.setAttribute('id', id);
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '5');
  marker.setAttribute('markerHeight', '5');
  marker.setAttribute('orient', 'auto-start-reverse');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M 0 1 L 10 5 L 0 9 z');
  path.setAttribute('fill', color);
  marker.appendChild(path);
  return marker;
}

function createSvgPath(
  d: string,
  attrs: Record<string, string>
): SVGPathElement {
  const el = document.createElementNS(SVG_NS, 'path');
  el.setAttribute('d', d);
  el.setAttribute('fill', 'none');
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

export function renderRouteOverlay(
  svg: SVGSVGElement,
  boardGrid: HTMLElement,
  state: GameState,
  preview: MovePreview,
  showRoutes: boolean,
  hoveredEndTileId: string | null
): void {
  svg.innerHTML = '';
  if (!showRoutes) return;

  const w = Math.max(boardGrid.offsetWidth, boardGrid.scrollWidth || 0);
  const h = Math.max(boardGrid.offsetHeight, boardGrid.scrollHeight || 0);
  if (w === 0 || h === 0) return;

  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.appendChild(createMarker('arrow-up', 'rgba(88, 166, 255, 0.78)'));
  defs.appendChild(createMarker('arrow-down', 'rgba(210, 153, 34, 0.78)'));
  defs.appendChild(createMarker('arrow-preview', '#f2cc60'));
  svg.appendChild(defs);

  const centers = getTileCenters(boardGrid);

  // 1. Static map rails and escalator links
  for (const tile of Object.values(state.tiles)) {
    const from = centers.get(tile.id);
    if (!from) continue;

    if (tile.neighbors.right) {
      const to = centers.get(tile.neighbors.right);
      if (to) {
        svg.appendChild(
          createSvgPath(`M ${from.x} ${from.y} L ${to.x} ${to.y}`, {
            stroke: 'rgba(146, 161, 184, 0.2)',
            'stroke-width': '2',
          })
        );
      }
    }

    if (tile.neighbors.left && state.tiles[tile.neighbors.left]?.neighbors.right !== tile.id) {
      const to = centers.get(tile.neighbors.left);
      if (to) {
        svg.appendChild(
          createSvgPath(`M ${from.x} ${from.y} L ${to.x} ${to.y}`, {
            stroke: 'rgba(146, 161, 184, 0.2)',
            'stroke-width': '2',
          })
        );
      }
    }

    for (const [dir, link] of [
      ['up', tile.neighbors.up],
      ['down', tile.neighbors.down],
    ] as const) {
      if (!link) continue;
      const exits = link.byEntryDir ? Object.values(link.byEntryDir) : [link];
      const drawnTargets = new Set<string>();
      for (const exit of exits) {
        if (drawnTargets.has(exit.targetTileId)) continue;
        drawnTargets.add(exit.targetTileId);
        const rawTo = centers.get(exit.targetTileId);
        if (!rawTo) continue;

        const [p1, p2] = trimSegment(from, rawTo, 14, 18);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2 + (dir === 'up' ? -10 : 10);

        svg.appendChild(
          createSvgPath(`M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}`, {
            stroke: dir === 'up' ? 'rgba(88, 166, 255, 0.55)' : 'rgba(210, 153, 34, 0.55)',
            'stroke-width': '2.2',
            'marker-end': dir === 'up' ? 'url(#arrow-up)' : 'url(#arrow-down)',
          })
        );
      }
    }
  }

  // 2. Active turn roll preview routes
  for (const target of preview.endTargets) {
    if (target.pathTileIds.length < 2) continue;
    const pts = target.pathTileIds
      .map((id) => centers.get(id))
      .filter((pt): pt is Point => Boolean(pt));
    if (pts.length < 2) continue;

    const isFocused = hoveredEndTileId === null || hoveredEndTileId === target.tileId;
    const lastIdx = pts.length - 1;
    const [, trimmedEnd] = trimSegment(pts[lastIdx - 1]!, pts[lastIdx]!, 0, 14);
    const cmds = pts.map((p, idx) => {
      const point = idx === lastIdx ? trimmedEnd : p;
      return `${idx === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
    });

    svg.appendChild(
      createSvgPath(cmds.join(' '), {
        class: 'route-preview-path',
        stroke: '#f2cc60',
        'stroke-width': isFocused ? '3.5' : '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        opacity: isFocused ? '0.92' : '0.25',
        'marker-end': 'url(#arrow-preview)',
      })
    );
  }
}