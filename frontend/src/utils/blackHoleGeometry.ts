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
// Edge case: если даже при radius=MIN floor > ceil (очень низкий/landscape
// вьюпорт, сообщение занимает почти всю высоту) — корректной позиции нет,
// возвращаем null. Канвас со звёздами остаётся, ЧД не рисуется — деградация,
// не баг.
export function resolveBlackHoleGeometry(
  w: number,
  h: number,
  xRatio: number,
  messageBottomPx: number | null,
  safeAreaBottomPx: number,
): ResolvedBlackHoleGeometry | null {
  const messageBottom = messageBottomPx ?? 0;

  let radius = clamp(BH_MIN_RADIUS_PX, blackHoleRadiusPx(w, h, BH_DIAM_RATIO), BH_MAX_RADIUS_PX);
  let floor = messageBottom + BH_MESSAGE_GAP_PX + radius;
  let ceil = h - radius - safeAreaBottomPx;

  if (floor > ceil) {
    radius = BH_MIN_RADIUS_PX;
    floor = messageBottom + BH_MESSAGE_GAP_PX + radius;
    ceil = h - radius - safeAreaBottomPx;
    if (floor > ceil) return null;
  }

  const target = BH_TARGET_Y_RATIO * h;
  const y = clamp(floor, target, ceil);

  return { x: xRatio * w, y, radius };
}
