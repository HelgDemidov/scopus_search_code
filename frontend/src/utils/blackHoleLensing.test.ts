import { describe, expect, it } from 'vitest';
import {
  blackHoleRadiusPx,
  computeLensing,
  exceedsEscapeSpeed,
  gravitationalDriftAccel,
  isInsideBlackHoleDisk,
  orbitalAngularVelocity,
  shouldHideCursor,
  smoothstep,
} from './blackHoleLensing';
import {
  LENSING_FADE_START_DIAMETERS,
  LENSING_OUTER_DIAMETERS,
  RING_SPAN_AT_OUTER,
  RING_SPAN_AT_SURFACE,
} from '../constants/blackHole';

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

  it('matches the calibration point just outside the outer boundary (still an ellipse)', () => {
    const diameter = radius * 2;
    const px = bhX + radius + LENSING_OUTER_DIAMETERS * diameter + 0.01; // чуть снаружи границы — ещё эллипс
    const result = computeLensing(px, bhY, bhX, bhY, radius);
    expect(result.mode).toBe('lensed');
    expect(result.scaleAcrossOrbit).toBeCloseTo(0.5, 2);
    expect(result.scaleAlongOrbit).toBeCloseTo(4, 2);
  });

  it('ring radius continues from the object\'s real distance exactly at the outer boundary', () => {
    const diameter = radius * 2;
    const px = bhX + radius + LENSING_OUTER_DIAMETERS * diameter; // ровно на границе — уже 'ring'
    const result = computeLensing(px, bhY, bhX, bhY, radius);
    expect(result.mode).toBe('ring');
    // Радиус кольца на самой границе OUTER = реальная дистанция объекта там
    // же — нет скачка радиуса при переходе эллипс → кольцо
    expect(result.ringRadius).toBeCloseTo(radius + LENSING_OUTER_DIAMETERS * diameter, 5);
    expect(result.ringSpanFraction).toBeCloseTo(RING_SPAN_AT_OUTER, 5);
  });

  it('reports ring mode at or inside the outer boundary, growing toward the surface', () => {
    const diameter = radius * 2;
    const px = bhX + radius + 0.5 * LENSING_OUTER_DIAMETERS * diameter; // на полпути к поверхности внутри зоны
    const result = computeLensing(px, bhY, bhX, bhY, radius);
    expect(result.mode).toBe('ring');

    const onSurface = computeLensing(bhX + radius, bhY, bhX, bhY, radius);
    expect(onSurface.mode).toBe('ring');
    // У самой поверхности — почти полное кольцо, шире, чем на полпути
    expect(onSurface.ringSpanFraction).toBeCloseTo(RING_SPAN_AT_SURFACE, 5);
    expect(onSurface.ringSpanFraction).toBeGreaterThan(result.ringSpanFraction);
  });

  it('ring radius hugs the disk edge at the surface, not the object\'s real distance', () => {
    // На поверхности реальная дистанция объекта = radius, но радиус кольца
    // должен быть привязан к краю диска (RING_EDGE_RADIUS_FACTOR), не 1:1
    const onSurface = computeLensing(bhX + radius, bhY, bhX, bhY, radius);
    expect(onSurface.ringRadius).toBeGreaterThan(radius);
    expect(onSurface.ringRadius).toBeLessThan(radius * 1.5);
  });

  it('has no radius discontinuity crossing the outer boundary (continuous, not discrete)', () => {
    const diameter = radius * 2;
    const justOutside = bhX + radius + LENSING_OUTER_DIAMETERS * diameter + 0.01;
    const justInside = bhX + radius + LENSING_OUTER_DIAMETERS * diameter - 0.01;
    const outside = computeLensing(justOutside, bhY, bhX, bhY, radius);
    const inside = computeLensing(justInside, bhY, bhX, bhY, radius);
    expect(outside.mode).toBe('lensed');
    expect(inside.mode).toBe('ring');
    // Радиус, на котором фактически рисуется искажённая форма, не должен
    // скакать на границе: снаружи эллипс центрирован на реальной дистанции
    // объекта, внутри ringRadius (при t≈1) стягивается к той же величине
    expect(Math.abs(inside.ringRadius - (justOutside - bhX))).toBeLessThan(0.1);
    // И угловой охват кольца на волосок внутри почти равен стартовому
    // значению (RING_SPAN_AT_OUTER) — не «прыжок» сразу к почти-полному кольцу
    expect(inside.ringSpanFraction).toBeCloseTo(RING_SPAN_AT_OUTER, 2);
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

  describe('resistancePower (доработка: курсор устойчивее звёзд к деформации, звёзды используют p=1)', () => {
    it('leaves the calibration boundaries untouched regardless of resistancePower', () => {
      const diameter = radius * 2;
      // Границы зон (0^p=0, 1^p=1 при любом p>0) — резистентность не должна
      // сдвигать сами пороги, только форму перехода между ними
      const atOuterBoundary = bhX + radius + LENSING_OUTER_DIAMETERS * diameter;
      const atSurface = bhX + radius;
      for (const power of [1, 1 / 3, 0.27]) {
        const outer = computeLensing(atOuterBoundary, bhY, bhX, bhY, radius, power);
        expect(outer.ringSpanFraction).toBeCloseTo(RING_SPAN_AT_OUTER, 5);
        const surface = computeLensing(atSurface, bhY, bhX, bhY, radius, power);
        expect(surface.ringSpanFraction).toBeCloseTo(RING_SPAN_AT_SURFACE, 5);
      }
    });

    it('reduces deformation at the zone midpoint for power < 1 (more "resistant")', () => {
      const diameter = radius * 2;
      const midpoint = bhX + radius + 0.5 * LENSING_OUTER_DIAMETERS * diameter; // середина кольцевой зоны [0..OUTER]
      const normal = computeLensing(midpoint, bhY, bhX, bhY, radius, 1);
      const resistant = computeLensing(midpoint, bhY, bhX, bhY, radius, 1 / 3);
      expect(resistant.ringSpanFraction).toBeLessThan(normal.ringSpanFraction);
    });

    it('cursor resistance power (1/3) cuts deformation by roughly half at the zone midpoint', () => {
      const diameter = radius * 2;
      const midpoint = bhX + radius + 0.5 * LENSING_OUTER_DIAMETERS * diameter;
      const normal = computeLensing(midpoint, bhY, bhX, bhY, radius, 1);
      const resistant = computeLensing(midpoint, bhY, bhX, bhY, radius, 1 / 3);
      const reduction = 1 - resistant.ringSpanFraction / normal.ringSpanFraction;
      expect(reduction).toBeGreaterThan(0.4);
      expect(reduction).toBeLessThan(0.7);
    });
  });
});

describe('orbitalAngularVelocity', () => {
  const outerBoundaryPx = 60; // например, 1.5D для diameter=40

  it('is zero at and beyond the outer boundary', () => {
    expect(orbitalAngularVelocity(outerBoundaryPx, outerBoundaryPx)).toBe(0);
    expect(orbitalAngularVelocity(outerBoundaryPx + 10, outerBoundaryPx)).toBe(0);
  });

  it('is zero exactly at the surface ("frozen star" — gravitational time dilation)', () => {
    expect(orbitalAngularVelocity(0, outerBoundaryPx)).toBe(0);
  });

  it('is positive strictly between the boundary and the surface', () => {
    expect(orbitalAngularVelocity(outerBoundaryPx * 0.5, outerBoundaryPx)).toBeGreaterThan(0);
  });

  it('has a non-monotonic speed-up-then-freeze profile, not a monotonic decay', () => {
    // У самой поверхности скорость должна быть МЕНЬШЕ, чем на подходе —
    // разгон (кеплеровский), затем резкое торможение у горизонта, а не
    // просто монотонное затухание от границы к поверхности
    const nearOuter    = orbitalAngularVelocity(outerBoundaryPx * 0.9, outerBoundaryPx);
    const midway       = orbitalAngularVelocity(outerBoundaryPx * 0.4, outerBoundaryPx);
    const nearSurface  = orbitalAngularVelocity(outerBoundaryPx * 0.02, outerBoundaryPx);
    expect(midway).toBeGreaterThan(nearOuter);
    expect(midway).toBeGreaterThan(nearSurface);
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

describe('gravitationalDriftAccel (доработка, п.3: дрейф курсора к центру)', () => {
  const bhX = 100;
  const bhY = 100;
  const radius = 20;

  it('points from the object straight toward the black hole center', () => {
    const { ax, ay } = gravitationalDriftAccel(bhX + 50, bhY, bhX, bhY, radius, 900);
    expect(ax).toBeLessThan(0); // тянет влево, к центру
    expect(ay).toBeCloseTo(0, 5); // строго горизонтально — без вертикальной составляющей
  });

  it('grows stronger closer to the center (real gravity, not constant pull)', () => {
    const far = gravitationalDriftAccel(bhX + 200, bhY, bhX, bhY, radius, 900);
    const near = gravitationalDriftAccel(bhX + 25, bhY, bhX, bhY, radius, 900);
    expect(Math.hypot(near.ax, near.ay)).toBeGreaterThan(Math.hypot(far.ax, far.ay));
  });

  it('equals baseAccel exactly at one black-hole-radius from the center', () => {
    const { ax, ay } = gravitationalDriftAccel(bhX + radius, bhY, bhX, bhY, radius, 900);
    expect(Math.hypot(ax, ay)).toBeCloseTo(900, 5);
  });

  it('does not blow up at the exact center (division-by-zero guard)', () => {
    const { ax, ay } = gravitationalDriftAccel(bhX, bhY, bhX, bhY, radius, 900);
    expect(Number.isFinite(ax)).toBe(true);
    expect(Number.isFinite(ay)).toBe(true);
  });
});

describe('exceedsEscapeSpeed (доработка, п.3: быстрое движение мышью выдёргивает курсор из дрейфа)', () => {
  it('is false for a slow, deliberate movement', () => {
    // 20px за 100ms = 200px/с — обычное неспешное движение
    expect(exceedsEscapeSpeed(20, 0, 100, 900)).toBe(false);
  });

  it('is true for a fast flick', () => {
    // 300px за 100ms = 3000px/с — явный быстрый взмах мышью/тачпадом
    expect(exceedsEscapeSpeed(300, 0, 100, 900)).toBe(true);
  });

  it('is false when dtMs is zero or negative (no reliable speed estimate)', () => {
    expect(exceedsEscapeSpeed(500, 0, 0, 900)).toBe(false);
    expect(exceedsEscapeSpeed(500, 0, -5, 900)).toBe(false);
  });

  it('combines both axes via magnitude, not a single axis', () => {
    // 3-4-5: |Δ|=5px за 1ms = 5000px/с, явно выше порога 900
    expect(exceedsEscapeSpeed(3, 4, 1, 900)).toBe(true);
  });
});
