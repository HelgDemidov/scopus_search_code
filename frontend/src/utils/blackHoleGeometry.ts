import {
  BH_DIAM_RATIO,
  BH_MAX_RADIUS_PX,
  BH_MESSAGE_GAP_PX,
  BH_MIN_RADIUS_PX,
  BH_TARGET_Y_RATIO,
} from '../constants/blackHole';
import { blackHoleRadiusPx } from './blackHoleLensing';

export interface ResolvedBlackHoleGeometry {
  x: number;
  y: number;
  radius: number;
}

function clamp(min: number, value: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Адаптивная геометрия ЧД (§4.4 ТЗ, docs/layout-overhaul/spec.md) — чистая
// функция, вынесенная из StarFieldCanvas, чтобы быть тестируемой без канваса.
//
// Радиус — единая непрерывная кривая (без скачка на 768px, см. §1.2):
//   radius = clamp(MIN_RADIUS_PX, DIAM_RATIO·diagonal/2, MAX_RADIUS_PX)
//
// Y — гибрид (пропорция + клампы к сообщению и нижнему фолду):
//   target = TARGET_Y_RATIO · h                     — мягкая цель
//   floor  = messageBottom + GAP_PX + radius        — верхний край ЧД не наезжает на сообщение
//   ceil   = h - radius - safeAreaBottom            — нижний край не уходит за фолд/жестовую зону
//   y      = clamp(floor, target, ceil)             — т.е. clamp(value=target, min=floor, max=ceil)
//
// ВАЖНО (уточнение относительно пseudo-кода в §4.4 spec.md): floor включает
// +radius, не только +GAP_PX — иначе при радиусе, приближающемся к MAX,
// верхний край круга (y - radius) мог бы оказаться ВЫШЕ messageBottom+gap,
// т.е. наехать на сообщение ровно на ту разницу. Симметрично с ceil (который
// уже учитывал radius в исходном pseudo-коде). spec.md обновлён вслед за
// этим фиксом.
//
// vortexClearancePx (§10.4 post-prod, docs/layout-overhaul/spec.md) — клиренс
// под декоративный вихрь вокруг ЧД (generateVortexCluster в StarFieldCanvas.tsx),
// который на узких экранах на порядок шире самого диска (bh.radius). floor
// защищает БОЛЬШИЙ из двух: диск (как раньше) или вихрь. Канвас — единственный
// источник isMobile/ratio-решения по нему (см. BH_VORTEX_CLEARANCE_FACTOR),
// здесь просто принимаем готовое px-значение — чистота функции сохранена.
//
// Деградация — 3 шага (расширяет исходную 2-шаговую; «показать ЧД когда
// возможно» важнее полного клиренса вихря):
//   1) full-clearance:  floor = messageBottom + GAP + max(radius, vortexClearancePx)
//   2) floor > ceil  →  диск-only: floor = messageBottom + GAP + radius
//      (вихрь может слегка вторгнуться на очень коротких вьюпортах — редкий
//      случай, приемлем по договорённости 10.3)
//   3) floor > ceil  →  radius → MIN, пересчёт; если всё ещё floor > ceil — null
//
// Edge case: если даже при radius=MIN (шаг 3) floor > ceil (очень низкий/
// landscape вьюпорт, сообщение занимает почти всю высоту) — корректной позиции
// нет, возвращаем null. Канвас со звёздами остаётся, ЧД не рисуется —
// деградация, не баг.
export function resolveBlackHoleGeometry(
  w: number,
  h: number,
  xRatio: number,
  messageBottomPx: number | null,
  safeAreaBottomPx: number,
  vortexClearancePx = 0,
): ResolvedBlackHoleGeometry | null {
  const messageBottom = messageBottomPx ?? 0;

  let radius = clamp(BH_MIN_RADIUS_PX, blackHoleRadiusPx(w, h, BH_DIAM_RATIO), BH_MAX_RADIUS_PX);
  let floor = messageBottom + BH_MESSAGE_GAP_PX + Math.max(radius, vortexClearancePx);
  let ceil = h - radius - safeAreaBottomPx;

  if (floor > ceil) {
    // Шаг 2 — диск-only клиренс.
    floor = messageBottom + BH_MESSAGE_GAP_PX + radius;

    if (floor > ceil) {
      // Шаг 3 — минимальный радиус.
      radius = BH_MIN_RADIUS_PX;
      floor = messageBottom + BH_MESSAGE_GAP_PX + radius;
      ceil = h - radius - safeAreaBottomPx;
      if (floor > ceil) return null;
    }
  }

  const target = BH_TARGET_Y_RATIO * h;
  const y = clamp(floor, target, ceil);

  return { x: xRatio * w, y, radius };
}
