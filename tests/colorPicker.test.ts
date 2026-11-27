import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, normalizeHex } from '../src/ui/colorPicker';
import { computePopoverPosition } from '../src/ui/colorPickerButton';

const SRC_SOURCES = import.meta.glob<string>('../src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('colorPicker hex/HSV helpers', () => {
  it('normalizes 3-digit, 6-digit, uppercase, and hashless hex strings', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('38BDF8')).toBe('#38bdf8');
    expect(normalizeHex(' #f90 ')).toBe('#ff9900');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('nope')).toBeNull();
  });

  it('round-trips primaries, neutrals, and pastel colors between hex and HSV', () => {
    for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#38bdf8', '#e25822', '#f9a8d4']) {
      const hsv = hexToHsv(hex);
      expect(hsvToHex(hsv.h, hsv.s, hsv.v)).toBe(hex);
    }
  });
});

describe('colorPickerButton popover positioning & zero native color inputs', () => {
  it('positions below trigger by default, flips above near bottom, and clamps to viewport edges', () => {
    // Default below trigger
    expect(computePopoverPosition({ left: 120, top: 100, bottom: 130, width: 34 }, 276, 260, 1280, 720)).toEqual({
      left: 120,
      top: 136,
    });

    // Flips above when bottom space overflows viewportHeight - 10
    expect(computePopoverPosition({ left: 120, top: 640, bottom: 670, width: 34 }, 276, 260, 1280, 720)).toEqual({
      left: 120,
      top: 374,
    });

    // Clamps horizontally inside left/right margins
    expect(computePopoverPosition({ left: 1200, top: 100, bottom: 130, width: 34 }, 276, 260, 1280, 720)).toEqual({
      left: 994,
      top: 136,
    });
    expect(computePopoverPosition({ left: -20, top: 100, bottom: 130, width: 34 }, 276, 260, 1280, 720)).toEqual({
      left: 10,
      top: 136,
    });
  });

  it('has zero native <input type="color"> usages remaining under src/', () => {
    const entries = Object.entries(SRC_SOURCES);
    expect(entries.length).toBeGreaterThan(20);
    const nativeColorRe = /type\s*[:=]\s*['"]color['"]/;
    const offenders: string[] = [];
    for (const [filePath, content] of entries) {
      if (nativeColorRe.test(content)) {
        offenders.push(filePath);
      }
    }
    expect(offenders).toEqual([]);
  });
});
