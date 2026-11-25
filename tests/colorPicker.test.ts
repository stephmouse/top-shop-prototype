import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, normalizeHex } from '../src/ui/colorPicker';

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
