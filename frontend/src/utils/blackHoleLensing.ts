import {
  LENSING_FADE_START_DIAMETERS,
  LENSING_INNER_DIAMETERS,
  LENSING_OUTER_DIAMETERS,
} from '../constants/blackHole';

// Чистая математика гравитационного искажения — вынесена из StarFieldCanvas,
// чтобы быть тестируемой без канваса/jsdom-моков (см. docs/error-experience/spec.md).

export type LensingMode = 'normal' | 'lensed' | 'captured';

export interface LensingResult {
  mode: LensingMode;
  // Множитель размера ВДОЛЬ орбиты (по касательной) — 1 = без искажения, 4 = «+300%»
  scaleAlongOrbit: number;
  // Множитель размера ПОПЕРЁК орбиты (по радиусу) — 1 = без искажения, 0.5 = «−50%»
  scaleAcrossOrbit: number;
  // Угол поворота (радианы) — касательная к окружности орбиты в этой точке
  angle: number;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// px/py — координаты объекта (звезды/метеора/курсора); bhX/bhY — центр
// чёрной дыры; bhRadius — её радиус (все в одних и тех же px-единицах).
//
// Три зоны, calibration-точка ТЗ — ровно на 1.5D (squash=0.5/stretch=4):
//   [FADE_START.. OUTER]: деформация плавно нарастает от нуля (без этого
//     был бы разрыв ровно на границе OUTER — незаметно для неподвижных
//     звёзд, но критично для курсора, который пересекает её в реальном
//     времени, см. docs/error-experience/spec.md про непрерывность)
//   (OUTER.. INNER]: калибровочная точка → усиление к почти-дуге
//   <= INNER: 'captured' — рендерится как дуга/полоса, не эллипс
export function computeLensing(
  px: number,
  py: number,
  bhX: number,
  bhY: number,
  bhRadius: number,
): LensingResult {
  const dx = px - bhX;
  const dy = py - bhY;
  const dist = Math.hypot(dx, dy);
  const diameter = bhRadius * 2;
  const distFromSurface = dist - bhRadius;
  // Касательная к окружности орбиты в этой точке = радиус-вектор + 90°
  const angle = Math.atan2(dy, dx) + Math.PI / 2;

  const fadeStart    = LENSING_FADE_START_DIAMETERS * diameter;
  const outerBoundary = LENSING_OUTER_DIAMETERS * diameter;
  const innerBoundary = LENSING_INNER_DIAMETERS * diameter;

  if (distFromSurface > fadeStart) {
    return { mode: 'normal', scaleAlongOrbit: 1, scaleAcrossOrbit: 1, angle };
  }
  if (distFromSurface <= innerBoundary) {
    return { mode: 'captured', scaleAlongOrbit: 1, scaleAcrossOrbit: 1, angle };
  }

  if (distFromSurface > outerBoundary) {
    // t: 0 у OUTER (калибровка) → 1 у FADE_START (без искажения)
    const t = smoothstep(outerBoundary, fadeStart, distFromSurface);
    return {
      mode: 'lensed',
      scaleAcrossOrbit: lerp(0.5, 1, t),
      scaleAlongOrbit: lerp(4, 1, t),
      angle,
    };
  }

  // t: 0 у INNER (почти захват) → 1 у OUTER (калибровочная точка)
  const t = smoothstep(innerBoundary, outerBoundary, distFromSurface);
  return {
    mode: 'lensed',
    scaleAcrossOrbit: lerp(0.15, 0.5, t),
    scaleAlongOrbit: lerp(7, 4, t),
    angle,
  };
}

// Радиус чёрной дыры (px) для заданного размера окна — 3% диагонали (ТЗ)
export function blackHoleRadiusPx(w: number, h: number, diameterRatio: number): number {
  return (Math.hypot(w, h) * diameterRatio) / 2;
}

// --- Экспериментальная курсорная часть (docs/error-experience/spec.md, Reach) ---

const CURSOR_HYSTERESIS_DIAMETERS = 0.1; // зазор между порогами скрытия/показа системного курсора

// Гистерезис вместо одного порога — иначе курсор мерцает, если мышь
// замерла ровно на границе fade-зоны (см. ТЗ про обязательный гистерезис).
export function shouldHideCursor(currentlyHidden: boolean, distFromSurface: number, diameter: number): boolean {
  const hideThreshold = LENSING_FADE_START_DIAMETERS * diameter;
  const showThreshold = hideThreshold + CURSOR_HYSTERESIS_DIAMETERS * diameter;
  return currentlyHidden ? distFromSurface < showThreshold : distFromSurface < hideThreshold;
}

// «При наведении на сам круг курсор исчезает бесследно» — отдельно от
// 'captured' (та зона шире, включает кольцо-дугу вокруг диска)
export function isInsideBlackHoleDisk(px: number, py: number, bhX: number, bhY: number, bhRadius: number): boolean {
  return Math.hypot(px - bhX, py - bhY) <= bhRadius;
}
