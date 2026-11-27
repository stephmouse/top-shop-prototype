export type ThemePresetId = 'midnight' | 'retro_ps1' | 'sakura' | 'arcade_neon' | 'daylight' | 'custom';

export type ColorBlindMode = 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia' | 'high_contrast';

export interface ThemePreferences {
  presetId: ThemePresetId;
  customBg: string;
  customPanel: string;
  customAccent: string;
  colorBlindMode: ColorBlindMode;
  showOwnerBadges: boolean;
  colorCodeCash: boolean;
}

export interface ThemePresetDef {
  id: Exclude<ThemePresetId, 'custom'>;
  name: string;
  tagline: string;
  bg: string;
  panel: string;
  accent: string;
  primaryBg?: string;
}

export const THEME_STORAGE_KEY = 'top_shop_theme_v1';
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const THEME_PRESETS: readonly ThemePresetDef[] = [
  {
    id: 'midnight',
    name: 'Midnight Mall',
    tagline: 'Classic dark navy',
    bg: '#12161f',
    panel: '#1b2230',
    accent: '#4da3ff',
    primaryBg: '#1f6feb',
  },
  { id: 'retro_ps1', name: 'Retro PS1 Mall', tagline: 'Cobalt & arcade gold', bg: '#0f1733', panel: '#1a2752', accent: '#f2c94c' },
  { id: 'sakura', name: 'Sakura Pastel', tagline: 'Soft blossom daylight', bg: '#fbeaf1', panel: '#ffffff', accent: '#db2777' },
  { id: 'arcade_neon', name: 'Arcade Neon', tagline: 'Obsidian & electric cyan', bg: '#0b0a18', panel: '#171430', accent: '#22d3ee' },
  { id: 'daylight', name: 'Daylight', tagline: 'Crisp high-contrast light', bg: '#e9eff6', panel: '#ffffff', accent: '#2563eb' },
];

export const COLOR_BLIND_OPTIONS: ReadonlyArray<{ id: ColorBlindMode; label: string; desc: string }> = [
  { id: 'off', label: 'Off (Standard)', desc: 'Standard board tiles, player colors, and green/red status.' },
  {
    id: 'deuteranopia',
    label: 'Deuteranopia (Red-Green)',
    desc: 'Sky Bank, Yellow Escalators, Okabe-Ito seat palette, shelf tier #s & blue/orange cash.',
  },
  {
    id: 'protanopia',
    label: 'Protanopia (Red-Green)',
    desc: 'High-luminance Sky/Yellow/Silver board tiles & seats avoiding muddy reds + blue/orange cash.',
  },
  {
    id: 'tritanopia',
    label: 'Tritanopia (Blue-Yellow)',
    desc: 'Cyan Bank, Rose Escalators, Crimson shutters, shelf tier #s & cyan/rose cash.',
  },
  {
    id: 'high_contrast',
    label: 'High Contrast / Mono',
    desc: 'Sharp board borders, max luminance spread, owner tags, patterns & chart dashes.',
  },
];

// Scientifically separated 8-seat local override palettes (never mutates online room state).
export const COLOR_BLIND_PALETTES: Record<Exclude<ColorBlindMode, 'off'>, readonly string[]> = {
  deuteranopia: ['#0072b2', '#e69f00', '#56b4e9', '#f0e442', '#cc79a7', '#a63603', '#f1f5f9', '#1e3a8a'],
  protanopia: ['#005ab5', '#facc15', '#38bdf8', '#9a6700', '#c084fc', '#1e3a8a', '#f8fafc', '#64748b'],
  tritanopia: ['#e11d48', '#06b6d4', '#fb7185', '#0f766e', '#f8fafc', '#991b1b', '#67e8f9', '#64748b'],
  high_contrast: ['#ffffff', '#facc15', '#38bdf8', '#fb923c', '#c084fc', '#4ade80', '#f472b6', '#94a3b8'],
};

export const SEAT_DASH_ARRAYS: readonly string[] = [
  '',
  '8 4',
  '3 3',
  '10 3 2 3',
  '14 4',
  '5 2 2 2',
  '2 4',
  '10 3 2 2 2 3',
];

export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  presetId: 'midnight',
  customBg: '#12161f',
  customPanel: '#1b2230',
  customAccent: '#4da3ff',
  colorBlindMode: 'off',
  showOwnerBadges: false,
  colorCodeCash: true,
};

function parseHex(hex: string): [number, number, number] {
  const clean = HEX_RE.test(hex.trim()) ? hex.trim().slice(1) : '1b2230';
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function mixHex(hexA: string, hexB: string, weightB: number): string {
  const [r1, g1, b1] = parseHex(hexA);
  const [r2, g2, b2] = parseHex(hexB);
  const t = Math.max(0, Math.min(1, weightB));
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function pickBestInk(bgHex: string, lightInk: string, darkInk: string): string {
  return contrastRatio(bgHex, darkInk) >= contrastRatio(bgHex, lightInk) ? darkInk : lightInk;
}

export function sanitizeThemePreferences(raw: unknown): ThemePreferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_THEME_PREFERENCES };
  const rec = raw as Record<string, unknown>;
  const validPreset =
    rec.presetId === 'custom' || THEME_PRESETS.some((p) => p.id === rec.presetId)
      ? (rec.presetId as ThemePresetId)
      : DEFAULT_THEME_PREFERENCES.presetId;
  const validCb = COLOR_BLIND_OPTIONS.some((o) => o.id === rec.colorBlindMode)
    ? (rec.colorBlindMode as ColorBlindMode)
    : 'off';
  const cleanHex = (val: unknown, fb: string) =>
    typeof val === 'string' && HEX_RE.test(val.trim()) ? val.trim().toLowerCase() : fb;

  return {
    presetId: validPreset,
    customBg: cleanHex(rec.customBg, DEFAULT_THEME_PREFERENCES.customBg),
    customPanel: cleanHex(rec.customPanel, DEFAULT_THEME_PREFERENCES.customPanel),
    customAccent: cleanHex(rec.customAccent, DEFAULT_THEME_PREFERENCES.customAccent),
    colorBlindMode: validCb,
    showOwnerBadges: typeof rec.showOwnerBadges === 'boolean' ? rec.showOwnerBadges : validCb !== 'off',
    colorCodeCash: typeof rec.colorCodeCash === 'boolean' ? rec.colorCodeCash : true,
  };
}

export interface DerivedThemeTokens {
  isLight: boolean;
  vars: Record<string, string>;
}

const BOARD_PIP_RAMPS: Record<ColorBlindMode, readonly [string, string, string, string]> = {
  off: ['#60a5fa', '#34d399', '#facc15', '#e879f9'],
  deuteranopia: ['#e2e8f0', '#56b4e9', '#facc15', '#d55e00'],
  protanopia: ['#e2e8f0', '#38bdf8', '#fde047', '#005ab5'],
  tritanopia: ['#f1f5f9', '#67e8f9', '#fb7185', '#be123c'],
  high_contrast: ['#f8fafc', '#38bdf8', '#facc15', '#fb923c'],
};

const BOARD_TILE_BORDERS: Record<
  Exclude<ColorBlindMode, 'off'>,
  {
    dark: { bank: string; elev: string; esc: string; closed: string };
    light: { bank: string; elev: string; esc: string; closed: string };
  }
> = {
  deuteranopia: {
    dark: { bank: '#38bdf8', elev: '#f8fafc', esc: '#facc15', closed: '#d55e00' },
    light: { bank: '#0284c7', elev: '#334155', esc: '#eab308', closed: '#c2410c' },
  },
  protanopia: {
    dark: { bank: '#38bdf8', elev: '#f8fafc', esc: '#fde047', closed: '#9a6700' },
    light: { bank: '#0284c7', elev: '#334155', esc: '#eab308', closed: '#854d0e' },
  },
  tritanopia: {
    dark: { bank: '#06b6d4', elev: '#f8fafc', esc: '#fb7185', closed: '#be123c' },
    light: { bank: '#0891b2', elev: '#334155', esc: '#fb7185', closed: '#9f1239' },
  },
  high_contrast: {
    dark: { bank: '#38bdf8', elev: '#ffffff', esc: '#facc15', closed: '#fb923c' },
    light: { bank: '#0369a1', elev: '#0f172a', esc: '#b45309', closed: '#c2410c' },
  },
};

const BOARD_HIGHLIGHTS: Record<
  ColorBlindMode,
  { step: string; land: string; pick: string; routeUp: string; routeDown: string }
> = {
  off: { step: '#1f6feb', land: '#f2cc60', pick: '#0ea5e9', routeUp: '#58a6ff', routeDown: '#d29922' },
  deuteranopia: { step: '#0072b2', land: '#facc15', pick: '#38bdf8', routeUp: '#38bdf8', routeDown: '#facc15' },
  protanopia: { step: '#0072b2', land: '#facc15', pick: '#38bdf8', routeUp: '#38bdf8', routeDown: '#facc15' },
  tritanopia: { step: '#0891b2', land: '#fb7185', pick: '#22d3ee', routeUp: '#22d3ee', routeDown: '#fb7185' },
  high_contrast: { step: '#38bdf8', land: '#facc15', pick: '#ffffff', routeUp: '#38bdf8', routeDown: '#facc15' },
};

function deriveBoardTokens(
  mode: ColorBlindMode,
  isLight: boolean,
  panel: string,
  surfaceCard: string
): Record<string, string> {
  const pips = BOARD_PIP_RAMPS[mode];
  const hi = BOARD_HIGHLIGHTS[mode];

  let specialVars: Record<string, string>;
  if (mode === 'off') {
    specialVars = isLight
      ? {
          '--tile-bank-bg-top': '#dcfce7',
          '--tile-bank-bg-bot': '#bbf7d0',
          '--tile-bank-border': '#16a34a',
          '--tile-bank-icon': '#15803d',
          '--tile-elev-bg-top': '#ede9fe',
          '--tile-elev-bg-bot': '#ddd6fe',
          '--tile-elev-border': '#7c3aed',
          '--tile-elev-icon': '#6d28d9',
          '--tile-esc-bg': '#fef3c7',
          '--tile-esc-shaft-bg': '#fde68a',
          '--tile-esc-border': '#d97706',
          '--tile-esc-icon': '#b45309',
          '--tile-esc-text': '#92400e',
          '--tile-closed-border': '#dc2626',
          '--tile-closed-badge-bg': '#dc2626',
          '--tile-closed-badge-ink': '#ffffff',
        }
      : {
          '--tile-bank-bg-top': '#214030',
          '--tile-bank-bg-bot': '#172b20',
          '--tile-bank-border': '#2ea043',
          '--tile-bank-icon': '#f2cc60',
          '--tile-elev-bg-top': '#292544',
          '--tile-elev-bg-bot': '#1d1a31',
          '--tile-elev-border': '#8957e5',
          '--tile-elev-icon': '#c4b5fd',
          '--tile-esc-bg': '#282115',
          '--tile-esc-shaft-bg': '#231c11',
          '--tile-esc-border': '#d29922',
          '--tile-esc-icon': '#fbbf24',
          '--tile-esc-text': '#fde68a',
          '--tile-closed-border': '#e74c3c',
          '--tile-closed-badge-bg': '#c0392b',
          '--tile-closed-badge-ink': '#ffffff',
        };
  } else {
    const spec = isLight ? BOARD_TILE_BORDERS[mode].light : BOARD_TILE_BORDERS[mode].dark;
    specialVars = {
      '--tile-bank-bg-top': mixHex(panel, spec.bank, isLight ? 0.2 : 0.28),
      '--tile-bank-bg-bot': mixHex(surfaceCard, spec.bank, isLight ? 0.1 : 0.16),
      '--tile-bank-border': spec.bank,
      '--tile-bank-icon': isLight ? mixHex(spec.bank, '#0f172a', 0.22) : spec.bank,
      '--tile-elev-bg-top': mixHex(panel, spec.elev, isLight ? 0.14 : 0.18),
      '--tile-elev-bg-bot': mixHex(surfaceCard, spec.elev, isLight ? 0.08 : 0.1),
      '--tile-elev-border': spec.elev,
      '--tile-elev-icon': spec.elev,
      '--tile-esc-bg': mixHex(surfaceCard, spec.esc, isLight ? 0.22 : 0.2),
      '--tile-esc-shaft-bg': mixHex(surfaceCard, spec.esc, isLight ? 0.3 : 0.14),
      '--tile-esc-border': spec.esc,
      '--tile-esc-icon': isLight ? mixHex(spec.esc, '#0f172a', 0.32) : spec.esc,
      '--tile-esc-text': isLight ? mixHex(spec.esc, '#0f172a', 0.42) : mixHex(spec.esc, '#ffffff', 0.35),
      '--tile-closed-border': spec.closed,
      '--tile-closed-badge-bg': spec.closed,
      '--tile-closed-badge-ink': pickBestInk(spec.closed, '#ffffff', '#0b0e14'),
    };
  }

  return {
    ...specialVars,
    '--tile-step-color': hi.step,
    '--tile-step-ink': pickBestInk(hi.step, '#ffffff', '#0b0e14'),
    '--tile-land-color': hi.land,
    '--tile-land-ink': pickBestInk(hi.land, '#ffffff', '#0b0e14'),
    '--tile-pick-color': hi.pick,
    '--tile-pick-ink': pickBestInk(hi.pick, '#ffffff', '#0b0e14'),
    '--route-up-color': hi.routeUp,
    '--route-down-color': hi.routeDown,
    '--pip-t1': pips[0],
    '--pip-t2': pips[1],
    '--pip-t3': pips[2],
    '--pip-t4': pips[3],
    '--pip-t1-ink': pickBestInk(pips[0], '#ffffff', '#0b0e14'),
    '--pip-t2-ink': pickBestInk(pips[1], '#ffffff', '#0b0e14'),
    '--pip-t3-ink': pickBestInk(pips[2], '#ffffff', '#0b0e14'),
    '--pip-t4-ink': pickBestInk(pips[3], '#ffffff', '#0b0e14'),
  };
}

/** Derives contrast-safe semantic CSS variables from preset/custom colors + color-blind mode. */
export function deriveThemeTokens(prefs: ThemePreferences): DerivedThemeTokens {
  const preset = THEME_PRESETS.find((p) => p.id === prefs.presetId);
  const bg = preset ? preset.bg : prefs.customBg;
  const panel = preset ? preset.panel : prefs.customPanel;
  const accent = preset ? preset.accent : prefs.customAccent;

  const isLight = relativeLuminance(panel) > 0.42;
  const surfaceDeep = isLight ? mixHex(bg, '#0f172a', 0.06) : mixHex(bg, '#000000', 0.34);
  const surfaceCard = isLight ? mixHex(panel, bg, 0.35) : mixHex(bg, panel, 0.48);
  const panelElevated = isLight ? mixHex(panel, accent, 0.1) : mixHex(panel, '#ffffff', 0.08);
  const border = isLight ? mixHex(bg, '#0f172a', 0.22) : mixHex(panel, '#cbd5e1', 0.18);
  const borderStrong = isLight ? mixHex(bg, '#0f172a', 0.38) : mixHex(panel, '#e2e8f0', 0.32);

  const text = isLight ? '#0f172a' : '#e8eef7';
  const muted = isLight ? '#475569' : '#94a3b8';
  const accentContrast = pickBestInk(accent, '#ffffff', '#0b0e14');
  const accentSoft = isLight ? mixHex(panel, accent, 0.14) : mixHex(panel, accent, 0.22);

  let statusGood = isLight ? '#15803d' : '#4ade80';
  let statusBad = isLight ? '#dc2626' : '#f87171';
  let statusWarn = isLight ? '#b45309' : '#facc15';
  const statusInfo = isLight ? '#0369a1' : '#38bdf8';

  if (prefs.colorBlindMode === 'deuteranopia' || prefs.colorBlindMode === 'protanopia') {
    statusGood = isLight ? '#0369a1' : '#38bdf8';
    statusBad = isLight ? '#c2410c' : '#fb923c';
    statusWarn = isLight ? '#a16207' : '#fde047';
  } else if (prefs.colorBlindMode === 'tritanopia') {
    statusGood = isLight ? '#0e7490' : '#22d3ee';
    statusBad = isLight ? '#be123c' : '#fb7185';
    statusWarn = isLight ? '#9f1239' : '#fda4af';
  }

  let primaryBg = preset?.primaryBg ?? accent;
  if (!preset?.primaryBg && !isLight && contrastRatio(accent, '#ffffff') < 4.5 && relativeLuminance(accent) < 0.42) {
    const darkened = mixHex(accent, '#081020', 0.34);
    if (contrastRatio(darkened, '#ffffff') >= 4.5) primaryBg = darkened;
  }
  const primaryInk = contrastRatio(primaryBg, '#ffffff') >= 4.5 ? '#ffffff' : pickBestInk(primaryBg, '#ffffff', '#0b0e14');
  const cashOnAccent = primaryInk;

  return {
    isLight,
    vars: {
      '--bg': bg,
      '--surface-deep': surfaceDeep,
      '--surface-card': surfaceCard,
      '--panel': panel,
      '--panel-elevated': panelElevated,
      '--border': border,
      '--border-strong': borderStrong,
      '--text': text,
      '--muted': muted,
      '--accent': accent,
      '--accent-contrast': accentContrast,
      '--accent-soft': accentSoft,
      '--primary-bg': primaryBg,
      '--primary-border': accent,
      '--primary-ink': primaryInk,
      '--status-good': statusGood,
      '--status-warn': statusWarn,
      '--status-bad': statusBad,
      '--status-info': statusInfo,
      '--cash-color': statusGood,
      '--cash-loss-color': statusBad,
      '--cash-on-accent': cashOnAccent,
      '--asset-color': statusWarn,
      ...deriveBoardTokens(prefs.colorBlindMode, isLight, panel, surfaceCard),
    },
  };
}

let activePrefs: ThemePreferences = { ...DEFAULT_THEME_PREFERENCES };

export function loadThemePreferences(): ThemePreferences {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage?.getItem(THEME_STORAGE_KEY) : null;
    activePrefs = raw ? sanitizeThemePreferences(JSON.parse(raw)) : { ...DEFAULT_THEME_PREFERENCES };
  } catch {
    activePrefs = { ...DEFAULT_THEME_PREFERENCES };
  }
  return { ...activePrefs };
}

export function saveThemePreferences(prefs: ThemePreferences): void {
  activePrefs = sanitizeThemePreferences(prefs);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(activePrefs));
    }
  } catch { /* Ignore storage errors */ }
}

export function getActiveThemePreferences(): ThemePreferences {
  return activePrefs;
}

export function applyThemePreferences(prefs: ThemePreferences, persist = false): ThemePreferences {
  const clean = sanitizeThemePreferences(prefs);
  activePrefs = clean;
  if (persist) saveThemePreferences(clean);

  if (typeof document !== 'undefined' && document.documentElement) {
    const root = document.documentElement;
    const { isLight, vars } = deriveThemeTokens(clean);
    for (const [key, val] of Object.entries(vars)) {
      root.style.setProperty(key, val);
    }
    root.dataset.themeMode = isLight ? 'light' : 'dark';
    root.dataset.cbMode = clean.colorBlindMode;
    root.dataset.ownerBadges = clean.showOwnerBadges ? 'true' : 'false';
    root.dataset.cashColors = clean.colorCodeCash ? 'true' : 'false';
  }
  return clean;
}

/** Resolves a player's locally displayed color, applying the active Color-Blind palette if enabled. */
export function getDisplayPlayerColor(playerIndex: number, rawColor: string): string {
  const mode = activePrefs.colorBlindMode;
  if (mode === 'off') return rawColor;
  const palette = COLOR_BLIND_PALETTES[mode];
  return palette[((playerIndex % palette.length) + palette.length) % palette.length] ?? rawColor;
}

export function getSeatDashArray(playerIndex: number): string {
  if (activePrefs.colorBlindMode === 'off' && !activePrefs.showOwnerBadges) return '';
  return (
    SEAT_DASH_ARRAYS[((playerIndex % SEAT_DASH_ARRAYS.length) + SEAT_DASH_ARRAYS.length) % SEAT_DASH_ARRAYS.length] ??
    ''
  );
}
