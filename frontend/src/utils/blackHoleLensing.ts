import {
  LENSING_FADE_START_DIAMETERS,
  LENSING_OUTER_DIAMETERS,
  RING_EDGE_RADIUS_FACTOR,
  RING_SPAN_AT_OUTER,
  RING_SPAN_AT_SURFACE,
  ROTATION_OMEGA_MAX,
} from '../constants/blackHole';

// Чистая математика гравитационного искажения — вынесена из StarFieldCanvas,
// чтобы быть тестируемой без канваса/jsdom-моков (см. docs/error-experience/spec.md).

export type LensingMode = 'normal' | 'lensed' | 'ring';

export interface LensingResult {
  mode: LensingMode;
  // 'lensed': множитель размера ВДОЛЬ орбиты (по касательной) — 1 = без искажения, 4 = «+300%»
  scaleAlongOrbit: number;
  // 'lensed': множитель размера ПОПЕРЁК орбиты (по радиусу) — 1 = без искажения, 0.5 = «−50%»
  scaleAcrossOrbit: number;
  // Угол поворота (радианы) — касательная к окружности орбиты в этой точке
  angle: number;
  // 'ring': радиус, на котором рисуется дуга — стягивается к краю диска
  // (НЕ к реальной дистанции объекта, см. комментарий в constants/blackHole.ts)
  ringRadius: number;
  // 'ring': доля окружности, которую занимает дуга (0..~0.94)
  ringSpanFraction: number;
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
// Две зоны, calibration-точка ТЗ сидит ровно на границе OUTER
// (squash=0.5/stretch=4, см. constants/blackHole.ts — сейчас OUTER = 25%
// от FADE_START):
//   [FADE_START.. OUTER]: деформация плавно нарастает от нуля (без этого
//     был бы разрыв ровно на границе OUTER — незаметно для неподвижных
//     звёзд, но критично для курсора, который пересекает её в реальном
//     времени) до калибровочной точки — обычный вытянутый эллипс.
//   [0.. OUTER]: «кольцо» — единая зона до самой поверхности. Радиус дуги
//     непрерывно стягивается от реальной дистанции объекта (на границе
//     OUTER, чтобы не было скачка с эллипсом) к RING_EDGE_RADIUS_FACTOR·bhRadius
//     у поверхности; угловой охват непрерывно растёт от RING_SPAN_AT_OUTER
//     (продолжение +300% эллипса) до RING_SPAN_AT_SURFACE («почти полное
//     кольцо») — реальные фотонные кольца выглядят именно так: почти
//     фиксированный радиус чуть за горизонтом тени независимо от истинного
//     расстояния источника.
// resistancePower (по умолчанию 1 = без реформирования, звёзды/метеоры
// используют именно это значение) — реформирует прогресс t внутри КАЖДОЙ
// зоны через t^resistancePower перед lerp. При power<1 объект дольше
// остаётся ближе к недеформированному концу своей зоны, и вся резкая часть
// перехода сжимается в отрезок у самой границы (ближе к горизонту) —
// калибровочные точки на границах зон не сдвигаются (0^p=0, 1^p=1 при
// любом p>0). Используется только курсором, см. CURSOR_RESISTANCE_POWER в
// constants/blackHole.ts.
export function computeLensing(
  px: number,
  py: number,
  bhX: number,
  bhY: number,
  bhRadius: number,
  resistancePower = 1,
): LensingResult {
  const dx = px - bhX;
  const dy = py - bhY;
  const dist = Math.hypot(dx, dy);
  const diameter = bhRadius * 2;
  const distFromSurface = dist - bhRadius;
  // Касательная к окружности орбиты в этой точке = радиус-вектор + 90°
  const angle = Math.atan2(dy, dx) + Math.PI / 2;

  const fadeStart     = LENSING_FADE_START_DIAMETERS * diameter;
  const outerBoundary = LENSING_OUTER_DIAMETERS * diameter;

  if (distFromSurface > fadeStart) {
    return { mode: 'normal', scaleAlongOrbit: 1, scaleAcrossOrbit: 1, angle, ringRadius: 0, ringSpanFraction: 0 };
  }

  if (distFromSurface > outerBoundary) {
    // t: 0 у OUTER (калибровка) → 1 у FADE_START (без искажения)
    const t = Math.pow(smoothstep(outerBoundary, fadeStart, distFromSurface), resistancePower);
    return {
      mode: 'lensed',
      scaleAcrossOrbit: lerp(0.5, 1, t),
      scaleAlongOrbit: lerp(4, 1, t),
      angle,
      ringRadius: 0,
      ringSpanFraction: 0,
    };
  }

  // t: 0 у поверхности → 1 у OUTER (граница с эллипсом — без скачка)
  const t = Math.pow(smoothstep(0, outerBoundary, Math.max(0, distFromSurface)), resistancePower);
  const distanceAtOuter = bhRadius + outerBoundary;
  return {
    mode: 'ring',
    scaleAlongOrbit: 1,
    scaleAcrossOrbit: 1,
    angle,
    ringRadius: lerp(RING_EDGE_RADIUS_FACTOR * bhRadius, distanceAtOuter, t),
    ringSpanFraction: lerp(RING_SPAN_AT_SURFACE, RING_SPAN_AT_OUTER, t),
  };
}

// Радиус чёрной дыры (px) для заданного размера окна — 3% диагонали (ТЗ)
export function blackHoleRadiusPx(w: number, h: number, diameterRatio: number): number {
  return (Math.hypot(w, h) * diameterRatio) / 2;
}

// --- Орбитальное вращение звёзд рядом с горизонтом (docs/error-experience/spec.md, п.1.2) ---

// Угловая скорость (рад/с) как функция дистанции до поверхности — ноль на
// границе воздействия (OUTER) и ровно у поверхности, пик между ними.
// Немонотонный профиль: t·(1−t³) — произведение «кеплеровского разгона»
// (растёт по мере приближения) и «замедления времени» (душит скорость почти
// до нуля у самой поверхности, см. constants/blackHole.ts). Пик при t=(1/4)^(1/3)≈0.63,
// т.е. примерно в трети пути от OUTER к поверхности.
export function orbitalAngularVelocity(distFromSurface: number, outerBoundaryPx: number): number {
  if (distFromSurface >= outerBoundaryPx || outerBoundaryPx <= 0) return 0;
  const t = 1 - Math.max(0, distFromSurface) / outerBoundaryPx;
  const speedup = t;
  const freeze = 1 - t * t * t;
  return ROTATION_OMEGA_MAX * speedup * freeze;
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
// 'ring' (та зона шире, включает дугу вокруг диска)
export function isInsideBlackHoleDisk(px: number, py: number, bhX: number, bhY: number, bhRadius: number): boolean {
  return Math.hypot(px - bhX, py - bhY) <= bhRadius;
}

// --- Дрейф курсора к центру (docs/error-experience/spec.md, п.3 доработки, раунд 3) ---

// Ускорение притяжения к центру дыры — растёт при приближении (magnitude =
// baseAccel·bhRadius/dist), как настоящая гравитация: на дистанции = одному
// радиусу дыры от центра ускорение равно baseAccel, дальше — слабее.
export function gravitationalDriftAccel(
  x: number, y: number, bhX: number, bhY: number, bhRadius: number, baseAccel: number,
): { ax: number; ay: number } {
  const dx = bhX - x;
  const dy = bhY - y;
  const dist = Math.max(Math.hypot(dx, dy), 1); // защита от деления на 0 в самом центре
  const magnitude = baseAccel * (bhRadius / dist);
  return { ax: (dx / dist) * magnitude, ay: (dy / dist) * magnitude };
}

// «Обычного быстрого движения мышью/тачпадом должно быть достаточно, чтобы
// вырваться» — сравниваем скорость реального курсора между двумя
// mousemove-сэмплами с порогом (px/с).
export function exceedsEscapeSpeed(dx: number, dy: number, dtMs: number, thresholdPxPerSec: number): boolean {
  if (dtMs <= 0) return false;
  const speedPxPerSec = (Math.hypot(dx, dy) / dtMs) * 1000;
  return speedPxPerSec > thresholdPxPerSec;
}
