import { describe, expect, it } from 'vitest';
import { computeSettleAngle } from '../src/ui/pencilView';

describe('Pencil Settle Physics', () => {
  it('starts at fromAngle and finishes at exact toAngle for both normal and slow modes', () => {
    for (const isSlow of [false, true]) {
      const start = computeSettleAngle(100, 280, 0, isSlow);
      const end = computeSettleAngle(100, 280, 1, isSlow);
      expect(start.angle).toBe(100);
      expect(start.isSettling).toBe(false);
      expect(end.angle).toBe(280);
    }
  });

  it('overshoots slightly before rocking back cleanly in normal mode', () => {
    const peak = computeSettleAngle(100, 280, 0.76, false);
    expect(peak.angle).toBeGreaterThan(280);
    expect(peak.isSettling).toBe(true);

    const late = computeSettleAngle(100, 280, 0.9, false);
    expect(late.isSettling).toBe(true);
    expect(Math.abs(late.angle - 280)).toBeLessThan(peak.angle - 280);
  });

  it('stays strictly monotonic with zero overshoot in slow pencil mode', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 10; i++) {
      const res = computeSettleAngle(40, 160, i / 10, true);
      expect(res.isSettling).toBe(false);
      expect(res.angle).toBeGreaterThanOrEqual(prev);
      expect(res.angle).toBeLessThanOrEqual(160);
      prev = res.angle;
    }
  });
});
