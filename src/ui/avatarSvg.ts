import {
  ACCESSORY_SHAPES,
  BUST_PATH,
  HAIR_BACK_SHAPES,
  HAIR_FRONT_SHAPES,
  HEAD_PATH,
  MARKING_BODY_SHAPES,
  MARKING_HEAD_SHAPES,
  SPECIES_BACK_SHAPES,
  SPECIES_FRONT_SHAPES,
  SPECIES_MUZZLE_SHAPES,
} from '../config/avatarParts';
import type { FillRole, ShapeSpec } from '../config/avatarParts';
import { isValidCustomImageDataUrl } from '../config/avatarTypes';
import type { AvatarEyeStyle, AvatarSpec } from '../config/avatarTypes';

const SVG_NS = 'http://www.w3.org/2000/svg';
let clipSeq = 0;

function hashStr32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function getAvatarRenderKey(spec: AvatarSpec, accent: string): string {
  if (isValidCustomImageDataUrl(spec.customImage)) {
    return `img|${spec.customImage.length}|${hashStr32(spec.customImage)}|${accent}`;
  }
  return `${spec.species}|${spec.primaryColor}|${spec.secondaryColor}|${spec.eyeColor}|${spec.hairColor}|${spec.marking}|${spec.hair}|${spec.eyeStyle}|${spec.accessory}|${accent}`;
}

function elSvg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function resolveColor(role: FillRole, spec: AvatarSpec, accent: string): string {
  switch (role) {
    case 'primary': return spec.primaryColor;
    case 'secondary': return spec.secondaryColor;
    case 'innerEar': return '#f4a3b5';
    case 'hair': return spec.hairColor;
    case 'dark': return '#111827';
    case 'light': return '#f8fafc';
    case 'accent': return accent;
    case 'gold': return '#facc15';
    case 'glass': return 'rgba(224, 242, 254, 0.34)';
    case 'none': return 'none';
  }
}

function appendShapes(parent: SVGElement, shapes: readonly ShapeSpec[] | undefined, spec: AvatarSpec, accent: string): void {
  if (!shapes) return;
  for (const s of shapes) {
    const attrs: Record<string, string | number> = { d: s.d, fill: resolveColor(s.fill, spec, accent) };
    if (s.stroke) {
      attrs.stroke = resolveColor(s.stroke, spec, accent);
      attrs['stroke-width'] = s.sw ?? 1.4;
      attrs['stroke-linecap'] = 'round';
      attrs['stroke-linejoin'] = 'round';
    }
    if (s.op !== undefined && s.op < 1) attrs['stroke-opacity'] = s.op;
    parent.appendChild(elSvg('path', attrs));
  }
}

function drawEyeSide(svg: SVGElement, cx: number, style: AvatarEyeStyle, eyeColor: string, lidColor: string, isRight: boolean): void {
  const cy = 30;
  if (style === 'happy' || (style === 'wink' && isRight)) {
    svg.appendChild(elSvg('path', {
      d: `M ${cx - 3.2} ${cy + 0.5} Q ${cx} ${cy - 3.2} ${cx + 3.2} ${cy + 0.5}`,
      fill: 'none', stroke: '#111827', 'stroke-width': 2, 'stroke-linecap': 'round',
    }));
    return;
  }
  svg.appendChild(elSvg('ellipse', { cx, cy, rx: 3.1, ry: 3.5, fill: '#ffffff', stroke: '#111827', 'stroke-width': 0.9 }));
  svg.appendChild(elSvg('circle', { cx, cy: cy + 0.2, r: 2.2, fill: eyeColor }));
  svg.appendChild(elSvg('circle', { cx, cy: cy + 0.2, r: 1.1, fill: '#111827' }));
  if (style === 'starry') {
    svg.appendChild(elSvg('path', { d: `M ${cx} ${cy - 2.2} L ${cx + 0.7} ${cy - 0.5} L ${cx + 2.2} ${cy} L ${cx + 0.7} ${cy + 0.5} L ${cx} ${cy + 2} L ${cx - 0.7} ${cy + 0.5} L ${cx - 2.2} ${cy} L ${cx - 0.7} ${cy - 0.5} Z`, fill: '#ffffff' }));
  } else {
    svg.appendChild(elSvg('circle', { cx: cx - 0.9, cy: cy - 1.1, r: 0.9, fill: '#ffffff' }));
  }
  if (style === 'relaxed') {
    svg.appendChild(elSvg('path', { d: `M ${cx - 3.3} ${cy - 0.5} A 3.3 3.5 0 0 1 ${cx + 3.3} ${cy - 0.5} Z`, fill: lidColor, stroke: '#111827', 'stroke-width': 1 }));
  }
}

export function createAvatarSvg(spec: AvatarSpec, accentColor: string): Element {
  if (typeof document.createElementNS !== 'function') {
    return Object.assign(document.createElement('span'), { className: 'avatar-svg' });
  }
  const uid = ++clipSeq;
  const hdId = `av-hd-${uid}`;
  const bdId = `av-bd-${uid}`;
  const svg = elSvg('svg', { viewBox: '0 0 64 64', class: 'avatar-svg', 'aria-hidden': 'true' });

  const defs = elSvg('defs', {});
  const hdClip = elSvg('clipPath', { id: hdId });
  hdClip.appendChild(elSvg('path', { d: HEAD_PATH }));
  const bdClip = elSvg('clipPath', { id: bdId });
  bdClip.appendChild(elSvg('path', { d: BUST_PATH }));
  defs.append(hdClip, bdClip);
  svg.appendChild(defs);

  svg.appendChild(elSvg('circle', { cx: 32, cy: 32, r: 31, fill: '#141b29' }));
  svg.appendChild(elSvg('circle', { cx: 32, cy: 32, r: 31, fill: accentColor, opacity: 0.16 }));

  appendShapes(svg, HAIR_BACK_SHAPES[spec.hair], spec, accentColor);
  appendShapes(svg, SPECIES_BACK_SHAPES[spec.species], spec, accentColor);

  svg.appendChild(elSvg('path', { d: BUST_PATH, fill: spec.primaryColor }));
  const bodyMarks = elSvg('g', { 'clip-path': `url(#${bdId})` });
  appendShapes(bodyMarks, MARKING_BODY_SHAPES[spec.marking], spec, accentColor);
  svg.appendChild(bodyMarks);
  svg.appendChild(elSvg('path', { d: BUST_PATH, fill: 'none', stroke: '#111827', 'stroke-width': 1.7 }));

  svg.appendChild(elSvg('path', { d: HEAD_PATH, fill: spec.primaryColor }));
  const headMarks = elSvg('g', { 'clip-path': `url(#${hdId})` });
  appendShapes(headMarks, MARKING_HEAD_SHAPES[spec.marking], spec, accentColor);
  svg.appendChild(headMarks);
  svg.appendChild(elSvg('path', { d: HEAD_PATH, fill: 'none', stroke: '#111827', 'stroke-width': 1.7 }));

  appendShapes(svg, SPECIES_MUZZLE_SHAPES[spec.species], spec, accentColor);
  drawEyeSide(svg, 24, spec.eyeStyle, spec.eyeColor, spec.primaryColor, false);
  drawEyeSide(svg, 40, spec.eyeStyle, spec.eyeColor, spec.primaryColor, true);
  appendShapes(svg, SPECIES_FRONT_SHAPES[spec.species], spec, accentColor);
  appendShapes(svg, HAIR_FRONT_SHAPES[spec.hair], spec, accentColor);
  appendShapes(svg, ACCESSORY_SHAPES[spec.accessory], spec, accentColor);

  return svg;
}

export function createAvatarElement(spec: AvatarSpec, accentColor: string): Element {
  if (isValidCustomImageDataUrl(spec.customImage)) {
    return Object.assign(document.createElement('img'), {
      className: 'avatar-img',
      src: spec.customImage,
      alt: '',
      draggable: false,
    });
  }
  return createAvatarSvg(spec, accentColor);
}
