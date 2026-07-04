import { describe, expect, it } from 'vitest';
import {
  blackHoleRadiusPx,
  computeLensing,
  isInsideBlackHoleDisk,
  shouldHideCursor,
  smoothstep,
} from './blackHoleLensing';
import { LENSING_FADE_START_DIAMETERS, LENSING_OUTER_DIAMETERS } from '../constants/blackHole';

describe('smoothstep', () => {
  it('returns 0 at or before edge0', () => {
    expect(smoothstep(0, 10, -5)).toBe(0);
    expect(smoothstep(0, 10, 0)).toBe(0);
  });

  it('returns 1 at or after edge1', () => {
    expect(smoothstep(0, 10, 10)).toBe(1);
    expect(smoothstep(0, 10, 15)).toBe(1);
  });

  it('is monotonically increasing between edges', () => {
    const a = smoothstep(0, 10, 2);
    const b = smoothstep(0, 10, 5);
    const c = smoothstep(0, 10, 8);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe('computeLensing', () => {
  const bhX = 100;
  const bhY = 100;
  const radius = 20; // diameter = 40

  it('reports normal mode far from the black hole', () => {
    const result = computeLensing(bhX + 1000, bhY, bhX, bhY, radius);
    expect(result.mode).toBe('normal');
    expect(result.scaleAlongOrbit).toBe(1);
    expect(result.scaleAcrossOrbit).toBe(1);
  });

  it('matches the calibration point at 1.5 diameters from the surface', () => {
    const diameter = radius * 2;
    const px = bhX + radius + 1.5 * diameter; // exactly at the outer boundary
    const result = computeLensing(px, bhY, bhX, bhY, radius);
    expect(result.mode).toBe('lensed');
    expect(result.scaleAcrossOrbit).toBeCloseTo(0.5, 5);
    expect(result.scaleAlongOrbit).toBeCloseTo(4, 5);
  });

  it('reports captured mode at or inside 0.5 diameters from the surface', () => {
    const diameter = radius * 2;
    const px = bhX + radius + 0.5 * diameter;
    const result = computeLensing(px, bhY, bhX, bhY, radius);
    expect(result.mode).toBe('captured');

    const onSurface = computeLensing(bhX + radius, bhY, bhX, bhY, radius);
    expect(onSurface.mode).toBe('captured');
  });

  it('has no discontinuity crossing the outer boundary (continuous, not discrete)', () => {
    const diameter = radius * 2;
    const justOutside = bhX + radius + LENSING_OUTER_DIAMETERS * diameter + 0.01;
    const justInside = bhX + radius + LENSING_OUTER_DIAMETERS * diameter - 0.01;
    const outside = computeLensing(justOutside, bhY, bhX, bhY, radius);
    const inside = computeLensing(justInside, bhY, bhX, bhY, radius);
    // На волосок снаружи почти не искажено, на волосок внутри — почти то же
    // самое (не резкий скачок к 50%/300%, как было бы без fade-зоны)
    expect(Math.abs(outside.scaleAcrossOrbit - inside.scaleAcrossOrbit)).toBeLessThan(0.01);
    expect(Math.abs(outside.scaleAlongOrbit - inside.scaleAlongOrbit)).toBeLessThan(0.01);
  });

  it('is fully normal beyond the fade-start boundary', () => {
    const diameter = radius * 2;
    const px = bhX + radius + LENSING_FADE_START_DIAMETERS * diameter + 1;
    const result = computeLensing(px, bhY, bhX, bhY, radius);
    expect(result.mode).toBe('normal');
  });

  it('computes a tangent-to-orbit angle perpendicular to the radius vector', () => {
    // Точка строго справа от чёрной дыры — касательная должна указывать вертикально
    const result = computeLensing(bhX + radius * 3, bhY, bhX, bhY, radius);
    const normalizedAngle = ((result.angle % Math.PI) + Math.PI) % Math.PI;
    expect(normalizedAngle).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('shouldHideCursor', () => {
  const diameter = 40; // radius=20

  it('hides once inside the fade-start threshold', () => {
    const hideThreshold = LENSING_FADE_START_DIAMETERS * diameter;
    expect(shouldHideCursor(false, hideThreshold - 1, diameter)).toBe(true);
    expect(shouldHideCursor(false, hideThreshold + 1, diameter)).toBe(false);
  });

  it('stays hidden past the hide threshold thanks to hysteresis (no flicker)', () => {
    const hideThreshold = LENSING_FADE_START_DIAMETERS * diameter;
    // Чуть дальше порога скрытия — без гистерезиса уже "нормально", с ним всё ещё скрыт
    expect(shouldHideCursor(true, hideThreshold + 1, diameter)).toBe(true);
  });

  it('shows again once past the wider show threshold', () => {
    const hideThreshold = LENSING_FADE_START_DIAMETERS * diameter;
    expect(shouldHideCursor(true, hideThreshold + 0.5 * diameter, diameter)).toBe(false);
  });
});

describe('isInsideBlackHoleDisk', () => {
  it('is true on and inside the surface, false just outside', () => {
    expect(isInsideBlackHoleDisk(100, 100, 100, 100, 20)).toBe(true); // center
    expect(isInsideBlackHoleDisk(120, 100, 100, 100, 20)).toBe(true); // exactly on surface
    expect(isInsideBlackHoleDisk(121, 100, 100, 100, 20)).toBe(false);
  });
});

describe('blackHoleRadiusPx', () => {
  it('is 3% of the screen diagonal, halved for radius', () => {
    const w = 1920;
    const h = 1080;
    const diagonal = Math.hypot(w, h);
    expect(blackHoleRadiusPx(w, h, 0.03)).toBeCloseTo((diagonal * 0.03) / 2, 5);
  });
});
