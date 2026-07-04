// Плоский module-level holder (тот же приём, что tokenStore.ts) —
// StarFieldCanvas не перерисовывается по React-рендеру, а сам опрашивает
// состояние на каждом RAF-кадре, поэтому Zustand-подписка избыточна:
// страницы ошибок пишут позицию при монтировании/размонтировании,
// канвас читает её в своём уже существующем цикле отрисовки.

export interface BlackHolePosition {
  xRatio: number; // 0..1 — доля ширины окна
  yRatio: number; // 0..1 — доля высоты окна
}

let _blackHole: BlackHolePosition | null = null;

export const getBlackHole = (): BlackHolePosition | null => _blackHole;
export const setBlackHole = (pos: BlackHolePosition | null): void => {
  _blackHole = pos;
};
