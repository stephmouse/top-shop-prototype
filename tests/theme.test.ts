import { afterEach, describe, expect, it } from 'vitest';
import { PLAYER_COLORS } from '../src/config/balance';
import { tokenizeMoneyText } from '../src/ui/moneyText';
import {
  applyThemePreferences,
  COLOR_BLIND_PALETTES,
  contrastRatio,
  DEFAULT_THEME_PREFERENCES,
  deriveThemeTokens,
  getDisplayPlayerColor,
  getSeatDashArray,
  sanitizeThemePreferences,
  SEAT_DASH_ARRAYS,
  THEME_PRESETS,
} from '../src/ui/themeConfig';
import type { ColorBlindMode } from '../src/ui/themeConfig';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

// Viénot et al. (1999) sRGB CVD projection matrices for validating color-blind separation.
function simulateCvd(hex: string, mode: Exclude<ColorBlindMode, 'off' | 'high_contrast'>): [number, number, number] {
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const toSrgb = (c: number) => {
    const clamped = Math.max(0, Math.min(1, c));
    return 255 * (clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055);
  };
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  let m: readonly number[];
  if (mode === 'deuteranopia') {
    m = [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7];
  } else if (mode === 'protanopia') {
    m = [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758];
  } else {
    m = [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525];
  }
  return [
    toSrgb(m[0]! * r + m[1]! * g + m[2]! * b),
    toSrgb(m[3]! * r + m[4]! * g + m[5]! * b),
    toSrgb(m[6]! * r + m[7]! * g + m[8]! * b),
  ];
}

function rgbDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

afterEach(() => {
  applyThemePreferences(DEFAULT_THEME_PREFERENCES, false);
});

describe('Theme Presets & Contrast Derivation', () => {
  it('ensures every built-in preset passes WCAG AA contrast for text, panels, and accent ink', () => {
    for (const preset of THEME_PRESETS) {
      const derived = deriveThemeTokens({
        ...DEFAULT_THEME_PREFERENCES,
        presetId: preset.id,
        customBg: preset.bg,
        customPanel: preset.panel,
        customAccent: preset.accent,
      });
      const shouldBeLight = preset.id === 'sakura' || preset.id === 'daylight';
      expect(derived.isLight).toBe(shouldBeLight);
      expect(contrastRatio(derived.vars['--bg']!, derived.vars['--text']!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(derived.vars['--panel']!, derived.vars['--text']!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(derived.vars['--surface-card']!, derived.vars['--text']!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(derived.vars['--accent']!, derived.vars['--accent-contrast']!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(derived.vars['--primary-bg']!, derived.vars['--primary-ink']!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(derived.vars['--primary-bg']!, derived.vars['--cash-on-accent']!)).toBeGreaterThanOrEqual(4.5);
      expect(derived.vars['--asset-color']).toBe(derived.vars['--status-warn']);
    }

    const midnight = deriveThemeTokens({ ...DEFAULT_THEME_PREFERENCES, presetId: 'midnight' });
    expect(midnight.vars['--primary-bg']).toBe('#1f6feb');
    expect(midnight.vars['--primary-ink']).toBe('#ffffff');
  });

  it('auto-adapts text and accent ink for custom light and dark themes', () => {
    const light = deriveThemeTokens({
      ...DEFAULT_THEME_PREFERENCES,
      presetId: 'custom',
      customBg: '#f8fafc',
      customPanel: '#ffffff',
      customAccent: '#facc15',
    });
    expect(light.isLight).toBe(true);
    expect(light.vars['--text']).toBe('#0f172a');
    expect(light.vars['--accent-contrast']).toBe('#0b0e14');

    const dark = deriveThemeTokens({
      ...DEFAULT_THEME_PREFERENCES,
      presetId: 'custom',
      customBg: '#090d16',
      customPanel: '#111827',
      customAccent: '#1d4ed8',
    });
    expect(dark.isLight).toBe(false);
    expect(dark.vars['--text']).toBe('#e8eef7');
    expect(dark.vars['--accent-contrast']).toBe('#ffffff');
  });

  it('sanitizes malformed stored preferences safely', () => {
    const clean = sanitizeThemePreferences({
      presetId: 'nonexistent',
      customBg: 'not-a-hex',
      customPanel: '#ABCDEF',
      colorBlindMode: 'deuteranopia',
    });
    expect(clean.presetId).toBe(DEFAULT_THEME_PREFERENCES.presetId);
    expect(clean.customBg).toBe(DEFAULT_THEME_PREFERENCES.customBg);
    expect(clean.customPanel).toBe('#abcdef');
    expect(clean.colorBlindMode).toBe('deuteranopia');
    expect(clean.showOwnerBadges).toBe(true);
    expect(clean.colorCodeCash).toBe(true);
  });
});

describe('Color-Blind Modes & Local Seat Mapping', () => {
  it('keeps good/bad status indicators distinct under each CVD simulation', () => {
    for (const mode of ['deuteranopia', 'protanopia', 'tritanopia'] as const) {
      for (const presetId of ['midnight', 'daylight'] as const) {
        const tokens = deriveThemeTokens({
          ...DEFAULT_THEME_PREFERENCES,
          presetId,
          colorBlindMode: mode,
        });
        const goodSim = simulateCvd(tokens.vars['--status-good']!, mode);
        const badSim = simulateCvd(tokens.vars['--status-bad']!, mode);
        expect(rgbDist(goodSim, badSim)).toBeGreaterThan(70);
      }
    }
  });

  it('provides 8 distinct seat colors under each color-blind simulation and wraps seat lookups cleanly', () => {
    for (const mode of ['deuteranopia', 'protanopia', 'tritanopia'] as const) {
      const palette = COLOR_BLIND_PALETTES[mode];
      expect(palette).toHaveLength(8);
      for (let i = 0; i < palette.length; i++) {
        for (let j = i + 1; j < palette.length; j++) {
          const dist = rgbDist(simulateCvd(palette[i]!, mode), simulateCvd(palette[j]!, mode));
          expect(dist).toBeGreaterThanOrEqual(40);
        }
      }
    }

    applyThemePreferences({ ...DEFAULT_THEME_PREFERENCES, colorBlindMode: 'off', showOwnerBadges: false }, false);
    expect(getDisplayPlayerColor(0, PLAYER_COLORS[0]!)).toBe(PLAYER_COLORS[0]);
    expect(getSeatDashArray(1)).toBe('');

    applyThemePreferences({ ...DEFAULT_THEME_PREFERENCES, colorBlindMode: 'deuteranopia', showOwnerBadges: true }, false);
    expect(getDisplayPlayerColor(0, PLAYER_COLORS[0]!)).toBe(COLOR_BLIND_PALETTES.deuteranopia[0]);
    expect(getDisplayPlayerColor(9, PLAYER_COLORS[1]!)).toBe(COLOR_BLIND_PALETTES.deuteranopia[1]);
    expect(getSeatDashArray(1)).toBe(SEAT_DASH_ARRAYS[1]);
  });

  it('remaps board special tiles, shelf pips, and highlight inks cleanly across CVD modes and light/dark themes', () => {
    for (const mode of ['deuteranopia', 'protanopia', 'tritanopia'] as const) {
      for (const presetId of ['midnight', 'daylight'] as const) {
        const { vars } = deriveThemeTokens({
          ...DEFAULT_THEME_PREFERENCES,
          presetId,
          colorBlindMode: mode,
        });

        const tileColors = [
          vars['--tile-bank-border']!,
          vars['--tile-elev-border']!,
          vars['--tile-esc-border']!,
          vars['--tile-closed-border']!,
        ];
        for (let i = 0; i < tileColors.length; i++) {
          for (let j = i + 1; j < tileColors.length; j++) {
            expect(rgbDist(simulateCvd(tileColors[i]!, mode), simulateCvd(tileColors[j]!, mode))).toBeGreaterThanOrEqual(80);
          }
        }

        const pipColors = [vars['--pip-t1']!, vars['--pip-t2']!, vars['--pip-t3']!, vars['--pip-t4']!];
        const pipInks = [vars['--pip-t1-ink']!, vars['--pip-t2-ink']!, vars['--pip-t3-ink']!, vars['--pip-t4-ink']!];
        for (let i = 0; i < pipColors.length; i++) {
          expect(contrastRatio(pipColors[i]!, pipInks[i]!)).toBeGreaterThanOrEqual(4.5);
          for (let j = i + 1; j < pipColors.length; j++) {
            expect(rgbDist(simulateCvd(pipColors[i]!, mode), simulateCvd(pipColors[j]!, mode))).toBeGreaterThanOrEqual(80);
          }
        }

        expect(contrastRatio(vars['--tile-closed-badge-bg']!, vars['--tile-closed-badge-ink']!)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(vars['--tile-step-color']!, vars['--tile-step-ink']!)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(vars['--tile-land-color']!, vars['--tile-land-ink']!)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(vars['--tile-pick-color']!, vars['--tile-pick-ink']!)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('Money Text Tokenizer', () => {
  it('separates positive, signed, decimal, and negative ($- and -$) cash tokens accurately', () => {
    expect(tokenizeMoneyText('Cost: $450 | Cash: -$20 (or $-200) · Bonus +$1,250.50!')).toEqual([
      { text: 'Cost: ', isMoney: false, isLoss: false },
      { text: '$450', isMoney: true, isLoss: false },
      { text: ' | Cash: ', isMoney: false, isLoss: false },
      { text: '-$20', isMoney: true, isLoss: true },
      { text: ' (or ', isMoney: false, isLoss: false },
      { text: '$-200', isMoney: true, isLoss: true },
      { text: ') · Bonus ', isMoney: false, isLoss: false },
      { text: '+$1,250.50', isMoney: true, isLoss: false },
      { text: '!', isMoney: false, isLoss: false },
    ]);
    expect(tokenizeMoneyText('No money mentioned')).toEqual([
      { text: 'No money mentioned', isMoney: false, isLoss: false },
    ]);
    expect(tokenizeMoneyText('')).toEqual([]);
  });
});
