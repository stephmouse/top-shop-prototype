export interface HsvColor {
  h: number;
  s: number;
  v: number;
}

export interface ColorPickerOptions {
  initialColor: string;
  swatches?: readonly string[];
  label?: string;
  onChange: (hex: string) => void;
}

export interface ColorPickerController {
  el: HTMLElement;
  setColor: (hex: string) => void;
  setLabel: (label: string) => void;
}

export const AVATAR_COLOR_SWATCHES: readonly string[] = [
  '#f8fafc', '#cbd5e1', '#9ca3af', '#64748b', '#334155', '#1f2937',
  '#ef4444', '#e25822', '#ea580c', '#f97316', '#f59e0b', '#facc15',
  '#fde68a', '#e0a958', '#c2783a', '#854d0e', '#6b4c3b', '#78350f',
  '#22c55e', '#16a34a', '#0d9488', '#38bdf8', '#2563eb', '#f472b6',
];

const HEX6_RE = /^#?[0-9a-fA-F]{6}$/;
const HEX3_RE = /^#?[0-9a-fA-F]{3}$/;

export function normalizeHex(raw: string): string | null {
  const trimmed = raw.trim();
  if (HEX6_RE.test(trimmed)) {
    const clean = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    return `#${clean.toLowerCase()}`;
  }
  if (HEX3_RE.test(trimmed)) {
    const clean = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    const expanded = clean
      .split('')
      .map((ch) => ch + ch)
      .join('');
    return `#${expanded.toLowerCase()}`;
  }
  return null;
}

export function hexToHsv(rawHex: string): HsvColor {
  const hex = normalizeHex(rawHex) ?? '#000000';
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s));
  const val = Math.max(0, Math.min(1, v));

  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toByte = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function bindDragSurface(
  surface: HTMLElement,
  onPoint: (rx: number, ry: number) => void
): void {
  const updateFromEvent = (e: PointerEvent) => {
    const rect = surface.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const rx = clamp01((e.clientX - rect.left) / rect.width);
    const ry = clamp01((e.clientY - rect.top) / rect.height);
    onPoint(rx, ry);
  };

  surface.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    surface.setPointerCapture?.(e.pointerId);
    updateFromEvent(e);
  });
  surface.addEventListener('pointermove', (e) => {
    if ((e.buttons & 1) === 0 && !surface.hasPointerCapture?.(e.pointerId)) return;
    updateFromEvent(e);
  });
}

/** Creates a reusable inline swatch + SV square + hue slider + hex color picker. */
export function createColorPicker(options: ColorPickerOptions): ColorPickerController {
  const swatches = options.swatches ?? AVATAR_COLOR_SWATCHES;
  let currentHex = normalizeHex(options.initialColor) ?? '#9ca3af';
  let hsv = hexToHsv(currentHex);

  const el = document.createElement('div');
  el.className = 'color-picker-panel';

  const head = document.createElement('div');
  head.className = 'color-picker-head';
  const labelEl = document.createElement('span');
  labelEl.className = 'color-picker-label';
  labelEl.textContent = options.label ?? 'Color';

  const hexWrap = document.createElement('div');
  hexWrap.className = 'color-picker-hex-wrap';
  const currentChip = document.createElement('span');
  currentChip.className = 'color-picker-current';
  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.maxLength = 7;
  hexInput.className = 'color-picker-hex-input';
  hexInput.setAttribute('aria-label', 'Hex color code');
  hexWrap.append(currentChip, hexInput);
  head.append(labelEl, hexWrap);

  const svPad = document.createElement('div');
  svPad.className = 'color-picker-sv';
  const svThumb = document.createElement('span');
  svThumb.className = 'color-picker-thumb';
  svPad.appendChild(svThumb);

  const hueBar = document.createElement('div');
  hueBar.className = 'color-picker-hue';
  const hueThumb = document.createElement('span');
  hueThumb.className = 'color-picker-hue-thumb';
  hueBar.appendChild(hueThumb);

  const swatchesRow = document.createElement('div');
  swatchesRow.className = 'color-picker-swatches';
  const swatchButtons: Array<{ btn: HTMLButtonElement; hex: string }> = [];

  for (const raw of swatches) {
    const hex = normalizeHex(raw);
    if (!hex) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-picker-swatch';
    btn.style.background = hex;
    btn.title = hex.toUpperCase();
    btn.setAttribute('aria-label', `Select color ${hex.toUpperCase()}`);
    btn.addEventListener('click', () => {
      applyExternalHex(hex, true);
    });
    swatchButtons.push({ btn, hex });
    swatchesRow.appendChild(btn);
  }

  el.append(head, svPad, hueBar, swatchesRow);

  function syncUi(updateHexText = true): void {
    svPad.style.backgroundColor = `hsl(${Math.round(hsv.h)}deg, 100%, 50%)`;
    svThumb.style.left = `${hsv.s * 100}%`;
    svThumb.style.top = `${(1 - hsv.v) * 100}%`;
    hueThumb.style.left = `${(hsv.h / 360) * 100}%`;
    currentChip.style.background = currentHex;
    if (updateHexText && document.activeElement !== hexInput) {
      hexInput.value = currentHex.toUpperCase();
    }
    for (const { btn, hex } of swatchButtons) {
      btn.classList.toggle('is-active', hex === currentHex);
    }
  }

  function commitFromHsv(): void {
    const nextHex = hsvToHex(hsv.h, hsv.s, hsv.v);
    currentHex = nextHex;
    hexInput.value = currentHex.toUpperCase();
    syncUi(false);
    options.onChange(currentHex);
  }

  function applyExternalHex(rawHex: string, emit: boolean): void {
    const norm = normalizeHex(rawHex);
    if (!norm) return;
    currentHex = norm;
    const nextHsv = hexToHsv(norm);
    // Preserve current hue when picking pure grayscale so the hue slider doesn't jump to red.
    hsv = nextHsv.s === 0 ? { ...nextHsv, h: hsv.h } : nextHsv;
    syncUi(true);
    if (emit) options.onChange(currentHex);
  }

  bindDragSurface(svPad, (rx, ry) => {
    hsv = { ...hsv, s: rx, v: 1 - ry };
    commitFromHsv();
  });

  bindDragSurface(hueBar, (rx) => {
    hsv = { ...hsv, h: Math.min(359.99, rx * 360) };
    commitFromHsv();
  });

  hexInput.addEventListener('input', () => {
    const norm = normalizeHex(hexInput.value);
    if (!norm) return;
    currentHex = norm;
    const nextHsv = hexToHsv(norm);
    hsv = nextHsv.s === 0 ? { ...nextHsv, h: hsv.h } : nextHsv;
    syncUi(false);
    options.onChange(currentHex);
  });
  hexInput.addEventListener('blur', () => {
    hexInput.value = currentHex.toUpperCase();
  });

  syncUi(true);

  return {
    el,
    setColor: (hex) => applyExternalHex(hex, false),
    setLabel: (label) => {
      labelEl.textContent = label;
    },
  };
}
