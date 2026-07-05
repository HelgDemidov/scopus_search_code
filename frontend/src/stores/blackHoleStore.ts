// Плоский module-level holder (тот же приём, что tokenStore.ts) —
// StarFieldCanvas не перерисовывается по React-рендеру, а сам опрашивает
// состояние на каждом RAF-кадре, поэтому Zustand-подписка избыточна:
// страницы ошибок пишут позицию при монтировании/размонтировании,
// канвас читает её в своём уже существующем цикле отрисовки.

export interface BlackHolePosition {
  xRatio: number; // 0..1 — доля ширины окна
  // yRatio больше не используется (раунд 8, п.8.4/8.5.1, docs/error-
  // experience/spec.md) — Y для обоих брейкпоинтов (десктоп/мобильный)
  // резолвится из абсолютных px-констант в constants/blackHole.ts, не из
  // стора: панель ErrorPanel зафиксирована на постоянной высоте от верха
  // вьюпорта (position:fixed + top-14), доля высоты ОКНА для неё в принципе
  // не подходит (тот же класс проблемы, что уже решён для мобильной X/Y).
}

let _blackHole: BlackHolePosition | null = null;

export const getBlackHole = (): BlackHolePosition | null => _blackHole;
export const setBlackHole = (pos: BlackHolePosition | null): void => {
  _blackHole = pos;
};
