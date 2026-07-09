import { describe, expect, it } from 'vitest';
import { resolveBlackHoleGeometry } from './blackHoleGeometry';
import {
  BH_DIAM_RATIO,
  BH_MAX_RADIUS_PX,
  BH_MESSAGE_GAP_PX,
  BH_MIN_RADIUS_PX,
  BH_TARGET_Y_RATIO,
} from '../constants/blackHole';

describe('resolveBlackHoleGeometry', () => {
  it('places x proportionally to width (xRatio·w)', () => {
    const result = resolveBlackHoleGeometry(1000, 800, 0.713, null, 0);
    expect(result?.x).toBeCloseTo(713, 5);
  });

  it('uses the target Y ratio when message/fold clamps do not bind', () => {
    // Десктоп 1756×846 (§1.2 ТЗ) — messageBottom=null→0, safeArea=0: ни floor,
    // ни ceil не должны связывать target
    const w = 1756;
    const h = 846;
    const result = resolveBlackHoleGeometry(w, h, 0.713, null, 0);
    expect(result?.y).toBeCloseTo(BH_TARGET_Y_RATIO * h, 5);
  });

  it('computes radius from diagonal·DIAM_RATIO/2 when between MIN and MAX', () => {
    const w = 1756;
    const h = 846;
    const diagonal = Math.hypot(w, h);
    const result = resolveBlackHoleGeometry(w, h, 0.713, null, 0);
    expect(result?.radius).toBeCloseTo((diagonal * BH_DIAM_RATIO) / 2, 5);
    expect(result!.radius).toBeGreaterThan(BH_MIN_RADIUS_PX);
    expect(result!.radius).toBeLessThan(BH_MAX_RADIUS_PX);
  });

  it('clamps radius up to MIN_RADIUS_PX on a small phone diagonal', () => {
    // iPhone SE 320×568 — diagonal·DIAM_RATIO/2 < MIN
    const result = resolveBlackHoleGeometry(320, 568, 0.70, null, 0);
    expect(result?.radius).toBe(BH_MIN_RADIUS_PX);
  });

  it('clamps radius down to MAX_RADIUS_PX on a very large display', () => {
    const result = resolveBlackHoleGeometry(3840, 2160, 0.713, null, 0);
    expect(result?.radius).toBe(BH_MAX_RADIUS_PX);
  });

  it('does not overlap the message: y - radius >= messageBottom + GAP_PX', () => {
    // messageBottom высок относительно target — floor должен связать y
    const w = 1000;
    const h = 700;
    const messageBottom = 550; // близко к низу — выше target (0.70·700=490)
    const result = resolveBlackHoleGeometry(w, h, 0.713, messageBottom, 0);
    expect(result).not.toBeNull();
    const topEdge = result!.y - result!.radius;
    expect(topEdge).toBeGreaterThanOrEqual(messageBottom + BH_MESSAGE_GAP_PX - 1e-6);
  });

  it('clamps y down to ceil (bottom edge stays within viewport minus safe-area)', () => {
    const w = 1000;
    const h = 300; // короткий landscape вьюпорт — target может уйти за ceil
    const safeAreaBottom = 20;
    const result = resolveBlackHoleGeometry(w, h, 0.713, null, safeAreaBottom);
    expect(result).not.toBeNull();
    const bottomEdge = result!.y + result!.radius;
    expect(bottomEdge).toBeLessThanOrEqual(h - safeAreaBottom + 1e-6);
  });

  it('treats a null messageBottomPx as "no message constraint" (floor = GAP + radius)', () => {
    const w = 1000;
    const h = 800;
    const result = resolveBlackHoleGeometry(w, h, 0.713, null, 0);
    const topEdge = result!.y - result!.radius;
    // target (0.70·800=560) далеко от floor (~40-64) — не должен связывать
    expect(topEdge).toBeGreaterThan(0);
    expect(result!.y).toBeCloseTo(BH_TARGET_Y_RATIO * h, 5);
  });

  it('shrinks radius to MIN, then returns null if floor still exceeds ceil (very short viewport, tall message)', () => {
    // h=100 — короткий landscape; messageBottom=90 почти у низа экрана
    const result = resolveBlackHoleGeometry(800, 100, 0.713, 90, 0);
    expect(result).toBeNull();
  });

  it('returns null gracefully rather than a negative-radius or NaN geometry on the edge case', () => {
    const result = resolveBlackHoleGeometry(800, 80, 0.713, 100, 30);
    expect(result).toBeNull();
  });
});
