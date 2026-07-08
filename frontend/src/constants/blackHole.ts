
//
export const BLACK_HOLE_DIAMETER_RATIO = 0.0225; // диаметр = 2.25% диагонали экрана (было 1.8%)
export const BLACK_HOLE_DIAMETER_RATIO_MOBILE = 0.0347; // 0.0385 × 0.9 — ещё −10% для гармонизации

//
export const BLACK_HOLE_POSITION = { xRatio: 0.713 };

export const BLACK_HOLE_POSITION_Y_PX = 594;

//
export const MOBILE_BREAKPOINT_PX = 768; // тот же порог, что у generateStars() ниже
export const BLACK_HOLE_POSITION_MOBILE_X_RATIO = 0.70;
export const BLACK_HOLE_POSITION_MOBILE_Y_PX = 480; // центр дыры так, чтобы верх вортекса (~117px радиус) был на ~363px (карточка ошибки кончается на ~355px)

//
export const LENSING_FADE_START_DIAMETERS = 3.0 / 0.6; // дальше — совсем без искажения
export const LENSING_OUTER_DIAMETERS = LENSING_FADE_START_DIAMETERS * 0.25;

export const RING_EDGE_RADIUS_FACTOR = 1.15; // радиус кольца = во столько раз больше bh.radius
export const RING_SPAN_AT_OUTER = 0.03; // доля окружности на границе OUTER — продолжение +300% эллипса
export const RING_SPAN_AT_SURFACE = 0.94; // доля окружности вплотную к горизонту — «почти полное кольцо»

//
export const CURSOR_RESISTANCE_POWER = 1 / 3;

export const INNER_ZONE_BRIGHTNESS_FACTOR = 0.7;

export const CAPTURED_METEOR_FADE_MS = 250; // как долго видна дуга схлопнувшегося метеора

export const METEOR_CAPTURE_DIAMETERS = 0.5 / 0.6;

export const ROTATION_OMEGA_MAX = 11.25; // рад/с — пиковая угловая скорость

export const ROTATION_ZONE_EXTRA_FACTOR = 1.07;

export const VORTEX_RADIUS_RATIO = 0.20; // ×диагональ экрана ≈ круг площадью ~30% экрана (16:9)
export const VORTEX_RADIUS_RATIO_MOBILE = 0.126; // 0.14 × 0.9 — ещё −10% для гармонизации
export const VORTEX_STAR_COUNT = 1100; // +22.2% (раунд 5)
export const VORTEX_BLOB_COUNT = 12; // +20% (раунд 5) — сколько смещённых «сгущений» формируют неправильную форму

export const VORTEX_STAR_COUNT_MOBILE = 830; // 1100 − 270 (40% от 675 сокращаемых)

export const SECONDARY_NEBULA_STAR_COUNT_MIN = 800;
export const SECONDARY_NEBULA_STAR_COUNT_MAX = 1500;
export const SECONDARY_NEBULA_STAR_COUNT_MIN_MOBILE = 520; // ср. 745 = 1150 − 405 (60% от 675)
export const SECONDARY_NEBULA_STAR_COUNT_MAX_MOBILE = 970;
export const SECONDARY_NEBULA_BLOB_COUNT = 7;
export const SECONDARY_NEBULA_RADIUS_RATIO = 0.22; // ×диагональ экрана
export const SECONDARY_NEBULA_RADIUS_RATIO_MOBILE = 0.139; // 0.154 × 0.9 — ещё −10% для гармонизации

export const CURSOR_DRIFT_BASE_ACCEL = 900; // px/s² на дистанции = радиусу дыры от центра
export const CURSOR_DRIFT_ESCAPE_SPEED = 900; // px/s реальной мыши — порог «обычного быстрого движения»

//
//
//
export const DISK_RX_FACTOR = 2.5; // × bh.radius — половина ширины пояса (по X, до поворота)
export const DISK_BELT_HALF_THICKNESS_FACTOR = 0.15; // × bh.radius — толщина пояса в центре (x=0)


export const DISK_BELT_SAG_FACTOR = 0.15; // × bh.radius

export const DISK_UPPER_ARC_THICKNESS_FACTOR = 0.3; // × bh.radius (=0.3) — постоянна по всей дуге

export const DISK_UPPER_ARC_FILLET_START_FACTOR = 0.9; // × bh.radius — до этого x внешняя граница строго по окружности Rup (наклон здесь ещё умеренный, ~37°, не близок к вертикали)
export const DISK_UPPER_ARC_FILLET_END_FACTOR = 2.2; // × bh.radius — после этого x внешняя граница строго = верхний край пояса (наклон здесь уже почти нулевой)


export const DISK_LOWER_ARC_THICKNESS_BOOST_FACTOR = 1.3;
export const DISK_LOWER_ARC_POLE_THICKNESS_FACTOR = 0.20; // × bh.radius
export const DISK_LOWER_ARC_SIDE_THICKNESS_FACTOR = 0.08; // × bh.radius
export const DISK_LOWER_ARC_MERGE_X_FACTOR = 1.0; // × bh.radius — боковая точка слияния с поясом (край самой тени)
export const DISK_LOWER_ARC_CUTOFF_ANGLE_DEG = 37.5; // середина диапазона 35-40°, заданного пользователем

export const DISK_ARC_INNER_OVERLAP_PX = 2;

export const DISK_CONTOUR_POINT_COUNT = 256; // точек контура на фигуру (пояс/дуга)
export const DISK_TILT_RAD = (17 * Math.PI) / 180; // 17° — левый край сборки выше правого

export const DISK_BELT_CENTER_COLOR = '#fff0e0'; // яркий тёплый белый в центре
export const DISK_BELT_EDGE_COLOR = '#8b4513'; // тёмно-коричневый/ржавый на остриях
export const DISK_UPPER_ARC_INNER_COLOR = '#ffe4c4'; // яркий вблизи тени
export const DISK_UPPER_ARC_OUTER_COLOR = '#a0522d'; // тёмный на внешнем крае
export const DISK_LOWER_ARC_COLOR = '#cd853f'; // ≈ 60% яркости верхней

export const PHOTON_RING_COLOR = '#ffe9d2'; // тёплый почти-белый — контрастнее янтарного пояса
export const PHOTON_RING_LINE_WIDTH = 1.5; // px — толщина у ЛЕВОГО полюса тени (максимум, не тронута)
export const PHOTON_RING_MIN_LINE_WIDTH = 0.8; // px — толщина у ПРАВОГО полюса тени (на грани видимости)
export const PHOTON_RING_SEGMENT_COUNT = 64; // сегментов дуги для переменной толщины — только числа в цикле, без per-frame аллокаций
export const PHOTON_RING_RADIUS_FACTOR = 0.92; // × bh.radius — чуть меньше самой тени
export const PHOTON_RING_CENTER_OFFSET_FACTOR = 0.02;
