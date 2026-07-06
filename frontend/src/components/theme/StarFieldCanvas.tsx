import { useEffect, useRef } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { getBlackHole } from '../../stores/blackHoleStore';
import {
  blackHoleRadiusPx,
  computeLensing,
  exceedsEscapeSpeed,
  gravitationalDriftAccel,
  isInsideBlackHoleDisk,
  orbitalAngularVelocity,
  shouldHideCursor,
} from '../../utils/blackHoleLensing';
import {
  ACCRETION_BAND_BOTTOM_HALF_WIDTH_RAD,
  ACCRETION_BAND_BOTTOM_OVERSHOOT_FACTOR,
  ACCRETION_BAND_CONTOUR_JITTER_PX,
  ACCRETION_BAND_POINT_COUNT,
  ACCRETION_BAND_POLAR_RIBBON_FACTOR,
  ACCRETION_BAND_RX_FACTOR,
  ACCRETION_BAND_RY_FACTOR,
  ACCRETION_BAND_TOP_OVERSHOOT_PX_FACTOR,
  ACCRETION_BAND_TOP_SHARPNESS,
  ACCRETION_CHAOS_ANGULAR_FREQ_1,
  ACCRETION_CHAOS_ANGULAR_FREQ_2,
  ACCRETION_CHAOS_ANGULAR_FREQ_3,
  ACCRETION_CHAOS_TIME_FREQ_1,
  ACCRETION_CHAOS_TIME_FREQ_2,
  ACCRETION_CHAOS_TIME_FREQ_3,
  ACCRETION_FLAME_COLOR,
  ACCRETION_FLECK_CLUSTER_MAX,
  ACCRETION_FLECK_CLUSTER_MIN,
  ACCRETION_FLECK_COUNT,
  ACCRETION_FLECK_MICRO_SPREAD_FACTOR,
  ACCRETION_FLECK_RADIUS_FACTOR,
  ACCRETION_FLICKER_FREQ_1,
  ACCRETION_FLICKER_FREQ_2,
  ACCRETION_FLICKER_RANDOM_AMP,
  ACCRETION_RIM_JITTER_PX,
  ACCRETION_RIM_LINE_WIDTH,
  ACCRETION_RIM_POINT_COUNT,
  ACCRETION_WARM_WHITE_COLOR,
  BLACK_HOLE_DIAMETER_RATIO,
  BLACK_HOLE_POSITION_MOBILE_X_RATIO,
  BLACK_HOLE_POSITION_MOBILE_Y_PX,
  BLACK_HOLE_POSITION_Y_PX,
  CAPTURED_METEOR_FADE_MS,
  CURSOR_DRIFT_BASE_ACCEL,
  CURSOR_DRIFT_ESCAPE_SPEED,
  CURSOR_RESISTANCE_POWER,
  INNER_ZONE_BRIGHTNESS_FACTOR,
  LENSING_FADE_START_DIAMETERS,
  METEOR_CAPTURE_DIAMETERS,
  MOBILE_BREAKPOINT_PX,
  SECONDARY_NEBULA_BLOB_COUNT,
  SECONDARY_NEBULA_RADIUS_RATIO,
  SECONDARY_NEBULA_STAR_COUNT_MAX,
  SECONDARY_NEBULA_STAR_COUNT_MAX_MOBILE,
  SECONDARY_NEBULA_STAR_COUNT_MIN,
  SECONDARY_NEBULA_STAR_COUNT_MIN_MOBILE,
  VORTEX_BLOB_COUNT,
  VORTEX_RADIUS_RATIO,
  VORTEX_STAR_COUNT,
  VORTEX_STAR_COUNT_MOBILE,
} from '../../constants/blackHole';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Star {
  x: number;
  y: number;
  radius: number;
  baseBrightness: number;
  twinkles: boolean;
  twinklePeriod: number; // ms, индивидуальный для каждой звезды
  twinklePhase: number;  // radians [0, 2π], индивидуальный
  // Дистанция до поверхности чёрной дыры (px) — считается ОДИН РАЗ при
  // resize (tagBlackHoleDistance), не каждый кадр: радиус орбиты звезды не
  // меняется (меняется только угол при вращении), поэтому это истинная
  // константа для всего времени жизни массива звёзд (см. п.8.2.1,
  // docs/error-experience/spec.md). undefined до первого resize/без дыры.
  distFromBhSurface?: number;
}

interface Meteor {
  x0: number;
  y0: number;
  dx: number;     // normalized direction vector
  dy: number;
  length: number; // px
  duration: number;
  startTime: number;
  maxAlpha: number;
  // Заполняются, если метеор вошёл в кольцевую зону чёрной дыры
  // (docs/error-experience/spec.md) — вместо полосы по вектору скорости
  // рендерится зафиксированная дуга по орбите, угасающая за CAPTURED_METEOR_FADE_MS.
  // Радиус/охват дуги берутся из computeLensing() в момент захвата — не константы.
  capturedAt?: number;
  capturedAngle?: number;
  capturedRingRadius?: number;
  capturedSpanFraction?: number;
}

interface BlackHoleGeometry {
  x: number;
  y: number;
  radius: number;
}

interface ShowerSpec {
  startAt: number;
  angle: number;
  direction: number; // +1 right, -1 left
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TWINKLE_AMP   = 0.20;
const STAR_FRAME_MS = 1000 / 15;    // 15 fps для звёзд
const MTR_FRAME_MS  = 1000 / 60;    // 60 fps пока активен метеор
const MAX_METEORS   = 50;
const MAX_DPR       = 2;

// Метеорный поток (docs/error-experience/spec.md, п.5.6, раунд 5)
const SHOWER_MAX_CLUSTERS         = 3; // обычный поток — было 4
const SHOWER_CATCHUP_MAX_CLUSTERS = 2; // «догоняющий» поток при возврате из фона — п.5.6.3
// Обычный кадр идёт раз в 16–66 мс — разрыв такого порядка означает, что
// цикл только что вернулся из остановленного/троттлящегося состояния
// (скрытая вкладка, фоновый троттлинг ОС/браузера), а не обычный тик.
const RESUME_GAP_MS = 2000;

// Клэмп шага интегрирования дрейфа курсора (п.8.3, docs/error-experience/
// spec.md) — без него dt после скрытой вкладки/долгой паузы устройства
// может быть счётом на секунды и уйти прямиком в интегрирование скорости
// (driftVelRef += ax·dt), давая один кадр с непредсказуемым скачком.
// 100мс — заведомо больше обычного джиттера кадра (16–66мс), но пресекает
// патологические разрывы.
const MAX_DRIFT_DT_SECONDS = 0.1;

// ---------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------

// Яркость/мерцание — общая логика для обычного фона и скопления вихря
// (п.1.2), различается только пространственное распределение x/y.
function randomStarVisuals(): Pick<Star, 'radius' | 'baseBrightness' | 'twinkles' | 'twinklePeriod' | 'twinklePhase'> {
  const r = Math.random();
  if (r < 0.6) {
    return {
      baseBrightness: 0.085 + Math.random() * 0.102, // 0.085–0.187 (−15% от 0.10–0.22)
      twinkles: false,
      twinklePeriod: 0,
      twinklePhase: 0,
      radius: 0.7,
    };
  }
  if (r < 0.9) {
    return {
      baseBrightness: 0.238 + Math.random() * 0.187, // 0.238–0.425 (−15% от 0.28–0.50)
      twinkles: true,
      twinklePeriod: 2000 + Math.random() * 7000,    // 2–9 s, индивидуальный
      twinklePhase: Math.random() * Math.PI * 2,
      radius: 0.9,
    };
  }
  return {
    baseBrightness: 0.398 + Math.random() * 0.093, // 0.398–0.491 (−15% от 0.468–0.578)
    twinkles: true,
    twinklePeriod: (2000 + Math.random() * 7000) / 2.5, // 0.8–3.6 s (2.5x быстрее Tier 2)
    twinklePhase: Math.random() * Math.PI * 2,
    radius: 1.2,
  };
}

function generateStars(w: number, h: number): Star[] {
  const count = w < MOBILE_BREAKPOINT_PX ? 150 : 400;
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    ...randomStarVisuals(),
  }));
}

// Общая раскладка звёзд по нескольким смещённым друг от друга «сгущениям»
// (Box-Muller вокруг своего центра у каждого) — даёт органичную, рваную
// форму скопления вместо одного правильного круга. Используется и основной
// туманностью-воронкой у горизонта, и независимой от чёрной дыры туманностью
// в левом нижнем квадранте (docs/error-experience/spec.md, п.5.4, раунд 5).
function generateStarClumps(
  anchorX: number, anchorY: number, nebulaRadius: number, blobCount: number, totalStars: number,
): Star[] {
  const perBlob = Math.ceil(totalStars / blobCount);
  const stars: Star[] = [];

  for (let b = 0; b < blobCount; b++) {
    const blobAngle = Math.random() * Math.PI * 2;
    const blobDist  = nebulaRadius * (0.25 + Math.random() * 0.55);
    const blobX = anchorX + Math.cos(blobAngle) * blobDist;
    const blobY = anchorY + Math.sin(blobAngle) * blobDist;
    const spread = nebulaRadius * (0.3 + Math.random() * 0.35);

    for (let i = 0; i < perBlob; i++) {
      const u1 = Math.random() || 1e-6; // избегаем log(0)
      const u2 = Math.random();
      const mag = Math.sqrt(-2 * Math.log(u1));
      stars.push({
        x: blobX + mag * Math.cos(2 * Math.PI * u2) * spread,
        y: blobY + mag * Math.sin(2 * Math.PI * u2) * spread,
        ...randomStarVisuals(),
      });
    }
  }
  return stars;
}

// Плотное, неправильной формы скопление звёзд вокруг чёрной дыры — фон для
// эффекта воронки (docs/error-experience/spec.md, п.1.2), ~30% площади
// экрана. Художественная аппроксимация через частицы, не пиксельное
// линзирование фона (вне scope). Масштаб считается от диагонали экрана
// (VORTEX_RADIUS_RATIO), НЕ от радиуса дыры — иначе туманность была бы
// жёстко привязана к крошечному размеру самой дыры и оставалась тонкой
// каёмкой вокруг неё вместо полноценного фона.
function generateVortexCluster(bh: BlackHoleGeometry, diagonal: number, w: number): Star[] {
  const nebulaRadius = diagonal * VORTEX_RADIUS_RATIO;
  // Якорь скопления смещён от центра дыры — дыра не строго в центре туманности
  const anchorAngle = Math.random() * Math.PI * 2;
  const anchorX = bh.x + Math.cos(anchorAngle) * nebulaRadius * 0.2;
  const anchorY = bh.y + Math.sin(anchorAngle) * nebulaRadius * 0.2;
  // Мобильная плотность снижена (раунд 7, производительность) — см.
  // комментарий у VORTEX_STAR_COUNT_MOBILE в constants/blackHole.ts.
  const starCount = w < MOBILE_BREAKPOINT_PX ? VORTEX_STAR_COUNT_MOBILE : VORTEX_STAR_COUNT;
  return generateStarClumps(anchorX, anchorY, nebulaRadius, VORTEX_BLOB_COUNT, starCount);
}

// Вторая, независимая от чёрной дыры туманность (docs/error-experience/
// spec.md, п.5.4, раунд 5) — компенсирует визуальную пустоту нижнего левого
// квадранта на error-страницах. Якорь держится уверенно внутри квадранта
// (0.18–0.30 w, 0.68–0.80 h), а естественный разброс сгущений вокруг него
// (generateStarClumps) даёт частичный заход в соседние квадранты без
// декларативного обрезания по границе — неправильная форма получается сама.
function generateSecondaryNebula(w: number, h: number): Star[] {
  const diagonal = Math.hypot(w, h);
  const nebulaRadius = diagonal * SECONDARY_NEBULA_RADIUS_RATIO;
  const anchorX = w * (0.18 + Math.random() * 0.12);
  const anchorY = h * (0.68 + Math.random() * 0.12);
  // Мобильная плотность снижена сильнее, чем у вихря (раунд 7) — эта
  // туманность не участвует в орбитальном вращении (п.1.2), несёт большую
  // долю сокращения, см. константы в constants/blackHole.ts.
  const isMobile = w < MOBILE_BREAKPOINT_PX;
  const min = isMobile ? SECONDARY_NEBULA_STAR_COUNT_MIN_MOBILE : SECONDARY_NEBULA_STAR_COUNT_MIN;
  const max = isMobile ? SECONDARY_NEBULA_STAR_COUNT_MAX_MOBILE : SECONDARY_NEBULA_STAR_COUNT_MAX;
  const totalStars = Math.round(min + Math.random() * (max - min));
  return generateStarClumps(anchorX, anchorY, nebulaRadius, SECONDARY_NEBULA_BLOB_COUNT, totalStars);
}

// Позиция звезды с учётом орбитального вращения вихря (docs/error-experience/
// spec.md, п.1.2) — радиус орбиты неизменен (звёзды не падают на дыру),
// меняется только угол; вне зоны действия (outerBoundaryPx) не делает
// лишней работы, возвращает исходные координаты как есть.
function applyOrbitalRotation(
  x0: number, y0: number, bh: BlackHoleGeometry, outerBoundaryPx: number, nowMs: number,
): { x: number; y: number } {
  const r = Math.hypot(x0 - bh.x, y0 - bh.y);
  const omega = orbitalAngularVelocity(r - bh.radius, outerBoundaryPx);
  if (omega === 0) return { x: x0, y: y0 };
  const theta = Math.atan2(y0 - bh.y, x0 - bh.x) + omega * (nowMs / 1000);
  return { x: bh.x + r * Math.cos(theta), y: bh.y + r * Math.sin(theta) };
}

// Дуга по орбите вокруг чёрной дыры — общий рендер для звёзд/курсора/метеоров
// в кольцевой зоне (режим 'ring' из computeLensing).
function drawOrbitArc(
  ctx: CanvasRenderingContext2D,
  bh: BlackHoleGeometry,
  orbitRadius: number,
  centerAngle: number,
  angularSpanFraction: number,
  alpha: number,
): void {
  const halfSpan = angularSpanFraction * Math.PI; // fraction — доля полной окружности
  ctx.beginPath();
  ctx.arc(bh.x, bh.y, orbitRadius, centerAngle - halfSpan, centerAngle + halfSpan);
  // Цвет всегда белый — альфа через globalAlpha, а не rgba()-строку (п.8.2.2,
  // docs/error-experience/spec.md): убирает аллокацию+парсинг цвета на
  // каждый вызов (звёзды в кольцевой зоне, метеоры, курсор). Сбрасываем в 1
  // сразу после — функция общая для нескольких вызывающих в одном кадре,
  // не должна оставлять «протёкшее» состояние соседям.
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Считается ОДИН РАЗ при resize (не каждый кадр) — см. Star.distFromBhSurface
// и п.8.2.1 (docs/error-experience/spec.md). Дистанция звезды до дыры не
// меняется от вращения (оно меняет только угол, не радиус орбиты), поэтому
// кэшировать безопасно на весь срок жизни массива звёзд.
function tagBlackHoleDistance(stars: Star[], bh: BlackHoleGeometry | null): void {
  for (const s of stars) {
    s.distFromBhSurface = bh ? Math.hypot(s.x - bh.x, s.y - bh.y) - bh.radius : Infinity;
  }
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  stars: Star[],
  now: number,
  animate: boolean,
  blackHole: BlackHoleGeometry | null,
): void {
  // Вращение начинается там же, где стартует деформация формы (FADE_START) —
  // не там, где начинается кольцевая зона (OUTER) — иначе звёзды сперва
  // растягивались бы в эллипс без всякого движения, а вращение включалось
  // бы отдельным резким порогом позже. Единый старт даёт плавный переход
  // «эллипс, чуть вращающийся → линия у горизонта, вращающаяся быстро».
  const outerBoundaryPx = blackHole ? blackHole.radius * 2 * LENSING_FADE_START_DIAMETERS : 0;

  // Цвет звёзд всегда белый — альфа/мерцание идёт через globalAlpha, не
  // через новую rgba()-строку на каждую звезду каждый кадр (п.8.2.2): на
  // десктопе это ~2650 аллокаций строк/кадр × 60fps, заметный источник
  // GC-пауз, которые и ощущаются как «рывками» при вращении вихря на слабых
  // устройствах. save/restore — чтобы globalAlpha не «протёк» в отрисовку
  // метеоров/дыры/курсора, которая идёт следом в том же кадре.
  ctx.save();
  ctx.fillStyle = '#ffffff';

  for (const s of stars) {
    let a = s.baseBrightness;
    if (animate && s.twinkles) {
      a = Math.max(0, Math.min(1, a * (1 + TWINKLE_AMP * Math.sin(2 * Math.PI * now / s.twinklePeriod + s.twinklePhase))));
    }

    // Вне зоны эффекта (или дыры на странице нет вовсе) — координаты звезды
    // не меняются (радиус орбиты постоянен, случай 'normal' гарантирован),
    // пропускаем applyOrbitalRotation/computeLensing целиком, а не только
    // их результат (п.8.2.1) — тригонометрия на статичное большинство
    // звёзд иначе выполняется впустую каждый кадр.
    if (!blackHole || (s.distFromBhSurface ?? Infinity) > outerBoundaryPx) {
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    // Вращение вихря (п.1.2) — применяется до расчёта деформации формы,
    // оба эффекта независимы друг от друга на одной и той же звезде.
    const { x: rx, y: ry } = applyOrbitalRotation(s.x, s.y, blackHole, outerBoundaryPx, now);
    // Раунд 3: без resistancePower (p=1) — граница OUTER сама откалибрована
    // на 25% радиуса эффекта, см. constants/blackHole.ts.
    const lensing = computeLensing(rx, ry, blackHole.x, blackHole.y, blackHole.radius);
    if (lensing.mode === 'normal') {
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(rx, ry, s.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (lensing.mode === 'lensed') {
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.ellipse(
        rx, ry,
        s.radius * lensing.scaleAlongOrbit,
        s.radius * lensing.scaleAcrossOrbit,
        lensing.angle, 0, Math.PI * 2,
      );
      ctx.fill();
    } else {
      // ring — пересчитывается каждый кадр из текущей (повёрнутой) позиции,
      // звёзды не «замораживаются» в отличие от метеоров. Внутренние 50%
      // радиуса эффекта (вся кольцевая зона) приглушены — иначе плотность
      // перекрывающихся дуг у горизонта выглядит слишком ярко (п.6).
      const angle = Math.atan2(ry - blackHole.y, rx - blackHole.x);
      drawOrbitArc(ctx, blackHole, lensing.ringRadius, angle, lensing.ringSpanFraction, a * INNER_ZONE_BRIGHTNESS_FACTOR);
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Meteors
// ---------------------------------------------------------------------------

function spawnMeteor(
  w: number,
  h: number,
  angle: number,   // radians from vertical
  direction: number,
  now: number,
): Meteor {
  // angle from vertical → dx ≈ ±1, dy small positive (downward)
  const dx = Math.sin(angle) * direction;
  const dy = Math.cos(angle);
  const edgeOffset = Math.random() * w * 0.20;
  return {
    x0:       direction > 0 ? edgeOffset : w - edgeOffset,
    y0:       Math.random() * h * 0.65,
    dx,
    dy,
    length:   Math.random() < 0.95
      ? w * (0.10 + Math.random() * 0.40)           // 95%: 10–50% ширины
      : w * (0.50 + Math.random() * 0.20),           // 5%: 50–70% ширины
    // Смесь двух равномерных распределений (докрутка раунд 6, п.1.2) —
    // не единый диапазон: 95% случаев 160–400 мс (медиана 280 мс, попадает
    // в целевые 250–400), 5% — редкий «исключительный» хвост 400–800 мс.
    // Корреляция именно по вероятности (5%), не по жёсткому порогу — внутри
    // каждой ветки сохраняется полный псевдорандомный разброс.
    duration: Math.random() < 0.95
      ? 160 + Math.random() * 240
      : 400 + Math.random() * 400,
    startTime: now,
    maxAlpha: 0.60 + Math.random() * 0.25,          // 0.60–0.85
  };
}

function drawAndFilterMeteors(
  ctx: CanvasRenderingContext2D,
  meteors: Meteor[],
  now: number,
  blackHole: BlackHoleGeometry | null,
): Meteor[] {
  ctx.save();
  ctx.lineCap = 'round';

  const alive: Meteor[] = [];
  for (const m of meteors) {
    // Уже захвачен — рендерим зафиксированную дугу, игнорируя исходную
    // траекторию/duration; живёт CAPTURED_METEOR_FADE_MS, затем удаляется
    if (m.capturedAt !== undefined && blackHole) {
      const fadeProgress = (now - m.capturedAt) / CAPTURED_METEOR_FADE_MS;
      if (fadeProgress >= 1) continue;
      alive.push(m);
      const alpha = m.maxAlpha * (1 - fadeProgress);
      drawOrbitArc(
        ctx, blackHole, m.capturedRingRadius ?? 0, m.capturedAngle ?? 0,
        m.capturedSpanFraction ?? 0, alpha,
      );
      continue;
    }

    const progress = (now - m.startTime) / m.duration;
    if (progress >= 1) continue;

    // Профиль альфа: fade-in 0–10%, plateau 10–80%, fade-out 80–100%
    let a: number;
    if (progress < 0.10) a = m.maxAlpha * (progress / 0.10);
    else if (progress < 0.80) a = m.maxAlpha;
    else a = m.maxAlpha * (1 - (progress - 0.80) / 0.20);
    a = Math.max(0, a);

    const dist  = progress * m.length;
    const headX = m.x0 + m.dx * dist;
    const headY = m.y0 + m.dy * dist;

    // Проверяем горизонт события — метеор мгновенно «схлопывается» в дугу.
    // Порог у метеоров свой, уже (METEOR_CAPTURE_DIAMETERS), не расширенная
    // вместе со звёздами/курсором зона п.1.1 — см. комментарий у константы.
    const meteorDistFromSurface = blackHole
      ? Math.hypot(headX - blackHole.x, headY - blackHole.y) - blackHole.radius
      : Infinity;
    if (blackHole && meteorDistFromSurface <= METEOR_CAPTURE_DIAMETERS * blackHole.radius * 2) {
      const lensing = computeLensing(headX, headY, blackHole.x, blackHole.y, blackHole.radius);
      m.capturedAt = now;
      m.capturedAngle = Math.atan2(headY - blackHole.y, headX - blackHole.x);
      m.capturedRingRadius = lensing.ringRadius;
      m.capturedSpanFraction = lensing.ringSpanFraction;
      alive.push(m);
      drawOrbitArc(ctx, blackHole, m.capturedRingRadius, m.capturedAngle, m.capturedSpanFraction, a);
      continue;
    }

    alive.push(m);
    const tail  = Math.min(progress, 0.30) * m.length;
    const tailX = headX - m.dx * tail;
    const tailY = headY - m.dy * tail;

    // Градиент-объект пересоздаётся каждый раз (геометрия головы/хвоста
    // движется, кэшировать нечем) — но обе цветовые точки и shadowColor
    // теперь статичные литералы, не `rgba(...)`-строка на метеор/кадр (п.9.1,
    // docs/error-experience/spec.md, тот же приём, что у звёзд в раунде 8):
    // globalAlpha умножает альфу И градиента, И тени одновременно, поэтому
    // «а»-затухание метеора по-прежнему полностью сохраняется.
    const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, '#ffffff');

    ctx.strokeStyle = grad;
    ctx.globalAlpha = a;
    ctx.lineWidth   = 1.5;
    ctx.shadowBlur  = 3;
    ctx.shadowColor = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(headX, headY);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
  return alive;
}

// Круг самой чёрной дыры — рисуется поверх звёзд/метеоров (горизонт событий
// физически «закрывает» всё, что за ним), абсолютно чёрный, без текстуры
function drawBlackHole(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry): void {
  ctx.beginPath();
  ctx.arc(bh.x, bh.y, bh.radius, 0, Math.PI * 2);
  ctx.fillStyle = '#000000';
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Аккреционный диск (docs/error-experience/spec.md, раунд 9, п.9.2)
// ---------------------------------------------------------------------------
// Художественная аппроксимация (EHT M87*/Interstellar-стиль), не физическая
// симуляция. Рисуется ПОСЛЕ drawBlackHole — окаёмка/полоса/вкрапления должны
// быть видны поверх чёрного диска, дуги "через полюса" целиком снаружи
// bh.radius и не пересекаются с ним ни при каких параметрах ниже.
//
// Дисциплина рендера — та же, что у звёзд/метеоров (п.8.2/9.1): НИ ОДНОЙ
// per-frame аллокации. Оба цвета — статичные литералы (`#ffffff`,
// ACCRETION_FLAME_COLOR), яркость/мерцание — через globalAlpha и числовой
// scalar `alpha`, не через новый градиент/строку на кадр. Хаос формы — на
// голых числах (jitter), не объектах.

// Вспышки цвета пламени вдоль контура (rx=ry — окружность окаёмки; rx≠ry —
// эллипс полосы) — каждая вспышка не одна точка, а кластер из нескольких
// микро-точек неправильной формы (docs/error-experience/spec.md, раунд 9,
// вторая живая правка), с "протуберанцем" — анкер кластера смещён от
// идеальной геометрии на deviationPx. Persistence сознательно не нужна
// (см. чат) — позиция/альфа/состав кластера пересчитываются с нуля каждый
// кадр. animate=false (prefers-reduced-motion) — фиксированная раскладка,
// ровно одна точка на вспышку, без смещения/кластера, детерминировано.
// Радиус/разброс — доля bhRadius (третья живая правка, п.9.2): в фикс. px
// кластер был почти той же ширины, что и сам (тонкий) ремешок — визуально
// съедал заливку целиком, читалось как "ремешок рассыпался на пиксели".
function scatterFlameFlecks(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number,
  count: number, alpha: number, animate: boolean, deviationPx: number, bhRadius: number,
): void {
  const fleckRadius = bhRadius * ACCRETION_FLECK_RADIUS_FACTOR;
  const microSpread = bhRadius * ACCRETION_FLECK_MICRO_SPREAD_FACTOR;
  ctx.fillStyle = ACCRETION_FLAME_COLOR;
  for (let i = 0; i < count; i++) {
    const theta = animate ? Math.random() * Math.PI * 2 : (i / count) * Math.PI * 2;
    const dev = animate ? (Math.random() * 2 - 1) * deviationPx : 0;
    const anchorX = cx + Math.cos(theta) * (rx + dev);
    const anchorY = cy + Math.sin(theta) * (ry + dev);
    const clusterSize = animate
      ? ACCRETION_FLECK_CLUSTER_MIN + Math.floor(Math.random() * (ACCRETION_FLECK_CLUSTER_MAX - ACCRETION_FLECK_CLUSTER_MIN + 1))
      : 1;
    for (let k = 0; k < clusterSize; k++) {
      const mx = animate ? (Math.random() * 2 - 1) * microSpread : 0;
      const my = animate ? (Math.random() * 2 - 1) * microSpread : 0;
      ctx.globalAlpha = alpha * (animate ? 0.5 + Math.random() * 0.5 : 0.75);
      ctx.beginPath();
      ctx.arc(anchorX + mx, anchorY + my, fleckRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// Непрерывный по углу И по времени "хаос формы" (раунд 10, п.4) — заменяет
// независимый Math.random() на каждой из N ФИКСИРОВАННЫХ равномерно
// расположенных точек контура. Число и угол точек — были и остаются
// неизменной решёткой, но раньше именно они и определяли видимый узор
// (только величина смещения "плясала" внутри узкого диапазона, пересчитываясь
// заново каждый кадр без связи с предыдущим) — глаз считывает жёсткую
// N-кратную периодическую структуру как "шестерёнки", а несвязанный re-roll
// на 60 кадров/сек даёт дребезжащий, а не органичный характер (диагноз
// подтверждён живым разбором, spec.md раунд 10). Сумма 3 несоизмеримых по
// УГЛОВОЙ частоте гармоник — функция гладкая и определена для ЛЮБОГО θ, не
// только для точек решётки, поэтому не привязана к её периоду; несоизмеримые
// ВРЕМЕННЫ́Е частоты — тот же приём, что уже работает для alpha-мерцания
// (ACCRETION_FLICKER_FREQ_1/2) — дают плавное "дыхание" формы кадр к кадру
// вместо рывка. `phase` разводит несколько независимых применений (окаёмка/
// полоса-X/полоса-Y), чтобы они не двигались синхронно как одна ось.
function chaosOffset(theta: number, now: number, ampPx: number, phase: number): number {
  return ampPx * (
    0.5 * Math.sin(theta * ACCRETION_CHAOS_ANGULAR_FREQ_1 + now * ACCRETION_CHAOS_TIME_FREQ_1 + phase)
    + 0.3 * Math.sin(theta * ACCRETION_CHAOS_ANGULAR_FREQ_2 + now * ACCRETION_CHAOS_TIME_FREQ_2 + phase * 1.7 + 1.7)
    + 0.2 * Math.sin(theta * ACCRETION_CHAOS_ANGULAR_FREQ_3 + now * ACCRETION_CHAOS_TIME_FREQ_3 + phase * 2.3 + 3.1)
  );
}

// Тонкая окаёмка ровно по краю горизонта — калибровочная точка ТЗ раунда 9
// (п.3.1): "тонкая яркая окаёмка по внешней поверхности чёрной дыры".
// Джиттер точек контура (не готовый ctx.arc) — те самые "протуберанцы
// толщиной 1-2px", непрерывная функция θ+now (chaosOffset), не независимый
// per-frame random (раунд 10, п.4 — см. комментарий выше).
function drawAccretionRim(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry, alpha: number, animate: boolean, now: number): void {
  const n = ACCRETION_RIM_POINT_COUNT;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const theta = (i / n) * Math.PI * 2;
    const r = bh.radius + (animate ? chaosOffset(theta, now, ACCRETION_RIM_JITTER_PX, 0) : 0);
    const x = bh.x + Math.cos(theta) * r;
    const y = bh.y + Math.sin(theta) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = ACCRETION_WARM_WHITE_COLOR;
  ctx.lineWidth = ACCRETION_RIM_LINE_WIDTH;
  ctx.globalAlpha = alpha;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Кратчайшее угловое расстояние между двумя углами (0..π) — используется,
// чтобы "вспухание" полосы у полюса не зависело от направления обхода.
function angularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

// "Полюсность" точки θ — насколько она близка к верхнему/нижнему полюсу,
// раздельно (0..1). θ=3π/2 (canvas Y вниз ⇒ sin<0) — верхний полюс; θ=π/2 —
// нижний. Верх и низ — НАМЕРЕННО разные семейства кривых (раунд 10, не
// просто разные числа одной формулы — см. ACCRETION_BAND_BOTTOM_HALF_WIDTH_RAD
// в constants/blackHole.ts, почему гладкая cos^N в принципе не могла дать
// низу видимый угол ни при каком N): верх — гладкая cos^N (купол без
// излома, C¹ везде включая пик и точку выхода в 0), низ — кусочно-линейная
// "палатка" (Math.max(0, 1 − Δθ/halfWidth)) с настоящим изломом производной
// ровно в пике — острая, не круглая вершина.
function poleBumps(theta: number): { top: number; bottom: number } {
  return {
    top: Math.max(0, Math.cos(angularDistance(theta, (3 * Math.PI) / 2))) ** ACCRETION_BAND_TOP_SHARPNESS,
    bottom: Math.max(0, 1 - angularDistance(theta, Math.PI / 2) / ACCRETION_BAND_BOTTOM_HALF_WIDTH_RAD),
  };
}

// Внешняя граница полосы в точке θ (docs/error-experience/spec.md, раунд 9,
// живая сверка со скриншотом Interstellar/Gargantua) — НЕ константа по
// углу: у полюсов граница "вспухает" навстречу окаёмке, асимметрично сверху
// и снизу (см. комментарий у ACCRETION_BAND_* в constants/blackHole.ts).
// Верхний полюс: цель — bh.radius + line width окаёмки (третья живая
// правка — было ровно bh.radius, касание в одной точке между ДВУМЯ
// независимо джиттерящимися фигурами почти всегда оставляло щель с фоном,
// живьём подтверждено скриншотом со звёздами сквозь просвет). Заведомый
// нахлёст поверх окаёмки убирает щель структурно, а не подгонкой чисел.
// Нижний: цель НЕМНОГО БОЛЬШЕ bh.radius (overshoot), более узкий bump ⇒
// полоса выходит за окаёмку и пересекает её под видимым углом.
function bandOuterRadiusAt(bh: BlackHoleGeometry, bumps: { top: number; bottom: number }): number {
  const flat = bh.radius * ACCRETION_BAND_RY_FACTOR;
  const topTarget = bh.radius + ACCRETION_BAND_TOP_OVERSHOOT_PX_FACTOR;
  const bottomTarget = bh.radius * ACCRETION_BAND_BOTTOM_OVERSHOOT_FACTOR;
  return flat + (topTarget - flat) * bumps.top + (bottomTarget - flat) * bumps.bottom;
}

// Толщина ремешка (расстояние между внешней и внутренней границей) — 0 не
// возвращаем: сплошной лист вдали от полюсов задаётся толщиной `flat` (не
// нулевой шириной до центра — см. bandInwardNormalAt ниже про то, почему
// это должно быть именно СМЕЩЕНИЕ толщины, а не абсолютный радиус). У
// полюсов толщина подтягивается к более тонкому РЕМЕШКУ (не растущий
// клин!) — то, что и должно "вливаться" в окаёмку, а не закрашивать собой
// весь диск (баг первой версии раунда 9).
function bandRibbonThicknessAt(bh: BlackHoleGeometry, bumps: { top: number; bottom: number }): number {
  const flat = bh.radius * ACCRETION_BAND_RY_FACTOR;
  const poleness = Math.min(1, bumps.top + bumps.bottom);
  const ribbonThickness = bh.radius * ACCRETION_BAND_POLAR_RIBBON_FACTOR;
  return flat + (ribbonThickness - flat) * poleness; // flat→ribbon по мере приближения к полюсу
}

// Внешняя граница полосы в декартовых координатах (не просто радиус) —
// нужна как точка, чтобы посчитать касательную/нормаль кривой в этом угле
// (bandInwardNormalAt). rx — половина ширины полосы (ACCRETION_BAND_RX_
// FACTOR × bh.radius), общая для всех θ (сама лента — не растяжимый эллипс,
// а сплюснутый эллипс с фиксированной шириной и переменной высотой).
function bandOuterXY(theta: number, bh: BlackHoleGeometry, rx: number, bumps: { top: number; bottom: number }): [number, number] {
  const outerR = bandOuterRadiusAt(bh, bumps);
  return [bh.x + Math.cos(theta) * rx, bh.y + Math.sin(theta) * outerR];
}

const BAND_TANGENT_EPS_RAD = 0.01; // шаг конечной разности для касательной внешней границы

// Внутренняя нормаль внешней границы в точке θ (раунд 10 — заменяет старое
// смещение внутренней границы ЧИСТО по Y). У полюсов (θ=π/2, 3π/2)
// касательная кривой горизонтальна — сдвиг по Y там СОВПАДАЕТ с нормалью,
// давал верный результат. Но у "крыльев" (θ=0, π — там, где полоса выходит
// за пределы окаёмки) касательная почти ВЕРТИКАЛЬНА — сдвиг по Y там
// ОРТОГОНАЛЕН нормали, и эффективная толщина ленты стремится к нулю
// (~flat·sinΔθ) вместо задуманной константы `flat`: полоса схлопывалась в
// острый клин вместо сплошной ленты именно там, где жаловались на "полый
// контур/просвечивает фон" (доказано пиксельным замером живой страницы +
// подтверждено крупным скриншотом, spec.md раунд 10). Смещение вдоль
// НАСТОЯЩЕЙ нормали (не вдоль оси Y) снимает проблему для любого угла
// разом, без частных случаев по θ.
function bandInwardNormalAt(theta: number, bh: BlackHoleGeometry, rx: number, ox: number, oy: number): [number, number] {
  const [px0, py0] = bandOuterXY(theta - BAND_TANGENT_EPS_RAD, bh, rx, poleBumps(theta - BAND_TANGENT_EPS_RAD));
  const [px1, py1] = bandOuterXY(theta + BAND_TANGENT_EPS_RAD, bh, rx, poleBumps(theta + BAND_TANGENT_EPS_RAD));
  const tLen = Math.hypot(px1 - px0, py1 - py0) || 1;
  let nx = -(py1 - py0) / tLen;
  let ny = (px1 - px0) / tLen;
  // Знак нормали от конечной разности зависит от направления обхода —
  // проверяем, что она указывает К центру диска, а не полагаемся на
  // фиксированный знак поворота касательной.
  if (nx * (bh.x - ox) + ny * (bh.y - oy) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

// Пересекающая полоса диска — рисуется ПОСЛЕ чёрного диска, поэтому целиком
// видна пересекающей его (п.3.1: "тонкая поперечная ярко-белая полоса"), с
// асимметричным слиянием у полюсов — см. bandOuterRadiusAt выше. Путь —
// внешняя граница по кругу, затем внутренняя (смещённая вдоль нормали на
// bandRibbonThicknessAt) в обратном направлении.
function drawAccretionBand(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry, alpha: number, animate: boolean, now: number): void {
  const rx = bh.radius * ACCRETION_BAND_RX_FACTOR;
  const n = ACCRETION_BAND_POINT_COUNT;
  const outerPts: [number, number][] = [];
  const innerPts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const theta = (i / n) * Math.PI * 2;
    const bumps = poleBumps(theta);
    const [ox, oy] = bandOuterXY(theta, bh, rx, bumps);
    const [nx, ny] = bandInwardNormalAt(theta, bh, rx, ox, oy);
    const thickness = bandRibbonThicknessAt(bh, bumps);
    // ОДИН И ТОТ ЖЕ jx/jy для внешней И внутренней точки в этой θ — толщина
    // ремешка в этой точке не меняется, колышется вся точка целиком (не
    // рвёт заливку, см. ACCRETION_BAND_CONTOUR_JITTER_PX в constants/blackHole.ts).
    // Разные `phase` у jx/jy (раунд 10, п.4) — иначе обе оси двигались бы
    // синхронно (чистое радиальное пульсирование), а не органичное 2D-колыхание.
    const jx = animate ? chaosOffset(theta, now, ACCRETION_BAND_CONTOUR_JITTER_PX, 5) : 0;
    const jy = animate ? chaosOffset(theta, now, ACCRETION_BAND_CONTOUR_JITTER_PX, 11) : 0;
    outerPts.push([ox + jx, oy + jy]);
    innerPts.push([ox + nx * thickness + jx, oy + ny * thickness + jy]);
  }

  ctx.beginPath();
  outerPts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  for (let i = innerPts.length - 1; i >= 0; i--) ctx.lineTo(innerPts[i][0], innerPts[i][1]);
  ctx.closePath();
  ctx.fillStyle = ACCRETION_WARM_WHITE_COLOR;
  ctx.globalAlpha = alpha;
  ctx.fill();
  ctx.globalAlpha = 1;
  const flatThicknessPx = bh.radius * ACCRETION_BAND_RY_FACTOR;
  scatterFlameFlecks(
    ctx, bh.x, bh.y, rx, flatThicknessPx, ACCRETION_FLECK_COUNT, alpha, animate, flatThicknessPx * 0.25, bh.radius,
  );
}

// Сумма 2 несоизмеримых по частоте синусоид от `now` (без состояния/
// аллокаций, тот же приём, что твинкл звёзд) даёт "дышащий", не строго
// периодичный паттерн; += Math.random() поверх — лёгкое сверкание без
// ощущения чистого шума на каждый кадр. prefers-reduced-motion — фикс на
// среднем значении, без Math.random(), кадр детерминирован.
function drawAccretionDisk(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry, now: number, animate: boolean): void {
  const flicker = animate
    ? 0.65 + 0.2 * Math.sin(now * ACCRETION_FLICKER_FREQ_1) * Math.cos(now * ACCRETION_FLICKER_FREQ_2 + 1.7)
      + (Math.random() * 2 - 1) * ACCRETION_FLICKER_RANDOM_AMP
    : 0.7;
  const alpha = Math.max(0.35, Math.min(0.95, flicker));

  ctx.save();
  drawAccretionBand(ctx, bh, alpha, animate, now);
  drawAccretionRim(ctx, bh, alpha, animate, now);
  // Отклонение вкраплений окаёмки — 25% её line width, аналог "25% толщины
  // ремешка" для полосы (свой характерный масштаб толщины для этого элемента)
  scatterFlameFlecks(
    ctx, bh.x, bh.y, bh.radius, bh.radius, ACCRETION_FLECK_COUNT, alpha, animate,
    ACCRETION_RIM_LINE_WIDTH * 0.25, bh.radius,
  );
  ctx.restore();
}

const CURSOR_BASE_RADIUS = 3; // px — базовый размер синтетического «курсора» на канвасе
const CURSOR_ALPHA = 0.85;

// Экспериментальная курсорная деформация (docs/error-experience/spec.md,
// раздел Reach) — непрерывная, не дискретная: величина сплющивания следует
// той же гладкой computeLensing(), что и звёзды, поэтому нет «прыжка» при
// пересечении границы, только плавное нарастание/убывание при движении мыши.
function renderCursorLensing(
  ctx: CanvasRenderingContext2D,
  blackHole: BlackHoleGeometry | null,
  cursorPos: { x: number; y: number } | null,
  cursorHiddenRef: { current: boolean },
): void {
  if (!blackHole || !cursorPos) {
    if (cursorHiddenRef.current) {
      cursorHiddenRef.current = false;
      document.body.style.cursor = '';
    }
    return;
  }

  const diameter = blackHole.radius * 2;
  const distFromSurface = Math.hypot(cursorPos.x - blackHole.x, cursorPos.y - blackHole.y) - blackHole.radius;
  const hidden = shouldHideCursor(cursorHiddenRef.current, distFromSurface, diameter);
  cursorHiddenRef.current = hidden;
  document.body.style.cursor = hidden ? 'none' : '';
  if (!hidden) return;

  // «Наведение на сам круг — исчезает бесследно»: ничего не рисуем
  if (isInsideBlackHoleDisk(cursorPos.x, cursorPos.y, blackHole.x, blackHole.y, blackHole.radius)) {
    return;
  }

  // CURSOR_RESISTANCE_POWER — курсор на 50–60% устойчивее звёзд к деформации
  // (тот же порог начала эффекта, shouldHideCursor выше не менялся), но
  // превращается в линию/кольцо на орбите заметно ближе к горизонту (п.1).
  const lensing = computeLensing(
    cursorPos.x, cursorPos.y, blackHole.x, blackHole.y, blackHole.radius, CURSOR_RESISTANCE_POWER,
  );
  if (lensing.mode === 'ring') {
    const angle = Math.atan2(cursorPos.y - blackHole.y, cursorPos.x - blackHole.x);
    drawOrbitArc(ctx, blackHole, lensing.ringRadius, angle, lensing.ringSpanFraction, CURSOR_ALPHA);
    return;
  }

  // 'lensed' И узкая гистерезис-зона, где computeLensing уже вернул бы
  // 'normal' — рисуем плавный эллипс (при scale=1,1 это просто кружок),
  // чтобы скрытый системный курсор не оставлял видимый разрыв
  ctx.beginPath();
  ctx.ellipse(
    cursorPos.x, cursorPos.y,
    CURSOR_BASE_RADIUS * lensing.scaleAlongOrbit,
    CURSOR_BASE_RADIUS * lensing.scaleAcrossOrbit,
    lensing.angle, 0, Math.PI * 2,
  );
  ctx.fillStyle = `rgba(255,255,255,${CURSOR_ALPHA})`;
  ctx.fill();
}

// Дрейф синтетического курсора к центру дыры (docs/error-experience/spec.md,
// п.3 доработки, раунд 3) — как только реальная мышь входит в зону
// гравитационного эффекта (FADE_START), рендер отделяется от живой позиции
// мыши и падает к центру с ускорением (см. gravitationalDriftAccel), пока
// onMouseMove не увидит достаточно быстрое движение и не сбросит driftPosRef
// в null. Возвращает позицию, которую нужно рисовать вместо cursorPosRef —
// либо ту же реальную (вне зоны/нет дыры), либо дрейфующую.
function updateCursorDrift(
  real: { x: number; y: number } | null,
  blackHole: BlackHoleGeometry | null,
  dtSeconds: number,
  driftPosRef: { current: { x: number; y: number } | null },
  driftVelRef: { current: { x: number; y: number } },
): { x: number; y: number } | null {
  if (!real || !blackHole) {
    driftPosRef.current = null;
    return real;
  }

  const fadeStartPx = blackHole.radius * 2 * LENSING_FADE_START_DIAMETERS;
  const distFromSurface = Math.hypot(real.x - blackHole.x, real.y - blackHole.y) - blackHole.radius;
  if (distFromSurface >= fadeStartPx) {
    driftPosRef.current = null;
    return real;
  }

  // Только что вошли в зону — дрейф стартует с текущей реальной позиции
  if (!driftPosRef.current) {
    driftPosRef.current = { x: real.x, y: real.y };
  }

  const pos = driftPosRef.current;

  // Уже внутри диска — не интегрируем дальше (докритика раунд 5, п.5.3):
  // без остановки накопленная скорость проносит курсор сквозь центр, и он
  // вылетает с противоположной стороны, восстанавливая форму на глазах
  // (эффект «пролёта через потенциальную яму»). Замораживаем позицию —
  // курсор остаётся невидимым (renderCursorLensing уже ничего не рисует
  // внутри диска), пока escape-флик в onMouseMove не сбросит driftPosRef.
  if (isInsideBlackHoleDisk(pos.x, pos.y, blackHole.x, blackHole.y, blackHole.radius)) {
    driftVelRef.current = { x: 0, y: 0 };
    return pos;
  }

  const { ax, ay } = gravitationalDriftAccel(pos.x, pos.y, blackHole.x, blackHole.y, blackHole.radius, CURSOR_DRIFT_BASE_ACCEL);
  driftVelRef.current = { x: driftVelRef.current.x + ax * dtSeconds, y: driftVelRef.current.y + ay * dtSeconds };
  const next = {
    x: pos.x + driftVelRef.current.x * dtSeconds,
    y: pos.y + driftVelRef.current.y * dtSeconds,
  };
  // Шаг интегрирования может перепрыгнуть диск целиком за один кадр —
  // клэмпим сам переход, а не только уже случившееся попадание внутрь.
  if (isInsideBlackHoleDisk(next.x, next.y, blackHole.x, blackHole.y, blackHole.radius)) {
    driftVelRef.current = { x: 0, y: 0 };
  }
  driftPosRef.current = next;
  return next;
}

// И мобильная (раунд 6, п.2), и десктопная/планшетная (раунд 8, п.8.4/
// 8.5.1) ветки резолвят Y из абсолютной px-константы, не из доли высоты
// окна — в обоих случаях ориентир (кнопка «Go home» на мобильном, нижний
// правый уголок ErrorPanel на десктопе/планшете) стоит на фиксированной
// абсолютной высоте независимо от высоты окна (см. подробное обоснование у
// констант в constants/blackHole.ts). xRatio, наоборот, ratio-based в обеих
// ветках — сам ориентир тоже растёт пропорционально ширине окна.
function resolveBlackHoleGeometry(w: number, h: number): BlackHoleGeometry | null {
  const pos = getBlackHole();
  if (!pos) return null;
  const isMobile = w < MOBILE_BREAKPOINT_PX;
  return {
    x: isMobile ? BLACK_HOLE_POSITION_MOBILE_X_RATIO * w : pos.xRatio * w,
    y: isMobile ? BLACK_HOLE_POSITION_MOBILE_Y_PX : BLACK_HOLE_POSITION_Y_PX,
    radius: blackHoleRadiusPx(w, h, BLACK_HOLE_DIAMETER_RATIO),
  };
}

// ---------------------------------------------------------------------------
// Shower scheduler
// ---------------------------------------------------------------------------

function randSoloMs():   number { return 20000  + (Math.random() * 20000 - 10000);  } // 20 ± 10 s
function randShowerMs(): number { return 120000 + (Math.random() * 60000 - 30000);  } // 120 ± 30 s

// maxClusters параметризован (раунд 5, п.5.6.3) — обычный поток использует
// SHOWER_MAX_CLUSTERS, но «догоняющий» поток при возврате из фона использует
// более узкий предел (см. loop() ниже), чтобы не выглядеть максимально
// нагруженным каждый раз, когда пользователь отсутствовал на вкладке.
function buildShowerSpecs(now: number, maxClusters: number): ShowerSpec[] {
  const numClusters = 1 + Math.floor(Math.random() * maxClusters);
  const angle       = (60 + Math.random() * 30) * (Math.PI / 180); // 60–90° от вертикали
  const direction   = Math.random() < 0.5 ? 1 : -1;

  const specs: ShowerSpec[] = [];
  let t = now;

  for (let c = 0; c < numClusters; c++) {
    const n = 5 + Math.floor(Math.random() * 28); // 5–32 метеора в кластере (раунд 5: было 5–40, −20%)
    for (let i = 0; i < n; i++) {
      if (i > 0) t += 50 + Math.random() * 50;   // кумулятивный стаггер 50–100 ms
      specs.push({ startAt: t, angle, direction });
    }
    t += 1000 + Math.random() * 4000;             // пауза между кластерами 1–5 s
  }
  return specs;
}

// ---------------------------------------------------------------------------
// Component (exported — thin conditional wrapper)
// ---------------------------------------------------------------------------

export function StarFieldCanvas() {
  const { theme } = useTheme();
  if (theme !== 'dark') return null;
  return <StarFieldCanvasInner />;
}

// ---------------------------------------------------------------------------
// Inner implementation — монтируется только в dark-режиме
// ---------------------------------------------------------------------------

function StarFieldCanvasInner() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const starsRef     = useRef<Star[]>([]);
  const meteorsRef   = useRef<Meteor[]>([]);
  const specsRef     = useRef<ShowerSpec[]>([]);
  const rafRef       = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  // Накопленное время в «скрытых» разрывах (RESUME_GAP_MS) — вычитается из
  // now ТОЛЬКО для вращения вихря (п.8.3, docs/error-experience/spec.md):
  // угол считается напрямую от performance.now(), которое идёт и при
  // скрытой вкладке, поэтому без этого первый кадр после возврата рисовал
  // бы звезду в позиции «по реальному прошедшему времени» — заметный
  // скачок на случайный угол вместо продолжения с точки паузы. Метеорный
  // планировщик (nextSoloRef/nextShwRef) НЕ использует это смещение —
  // «догоняющий» поток при возврате осознанно сохранён (см. RESUME_GAP_MS
  // выше), виртуальные часы затронули бы и его.
  const hiddenTimeOffsetRef = useRef(0);
  const nextSoloRef  = useRef<number>(0);
  const nextShwRef   = useRef<number>(0);
  const sizeRef      = useRef({ w: 0, h: 0 });
  // Экспериментальная курсорная деформация (docs/error-experience/spec.md, Reach)
  const cursorPosRef    = useRef<{ x: number; y: number } | null>(null);
  const cursorHiddenRef = useRef(false);
  // Дрейф курсора к центру (раунд 3, п.3) — driftPosRef=null означает «не
  // дрейфует, точно следует за реальной мышью»; ненулевой — синтетическая
  // позиция, падающая к центру независимо от cursorPosRef, пока быстрое
  // движение мыши (onMouseMove) не сбросит её обратно в null.
  const driftPosRef        = useRef<{ x: number; y: number } | null>(null);
  const driftVelRef        = useRef({ x: 0, y: 0 });
  const lastMouseSampleRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastDriftTimeRef   = useRef(0);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    // TypeScript не сужает тип внутри замыканий — переобъявляем без null
    const canvas: HTMLCanvasElement = canvasEl;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    // ---- Resize ----
    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      sizeRef.current = { w, h };
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      // Пересоздаём звёзды для новых размеров (периоды и фазы хранятся в каждой Star)
      const stars = generateStars(w, h);
      const bh = resolveBlackHoleGeometry(w, h);
      const allStars = bh
        ? stars.concat(generateVortexCluster(bh, Math.hypot(w, h), w), generateSecondaryNebula(w, h))
        : stars;
      tagBlackHoleDistance(allStars, bh);
      starsRef.current = allStars;
    }

    resize();

    // ---- Scheduler init ----
    const t0 = performance.now();
    nextSoloRef.current = t0 + randSoloMs();
    nextShwRef.current  = t0 + randShowerMs();
    // Гарантируем буфер 8 s между первыми событиями
    if (Math.abs(nextSoloRef.current - nextShwRef.current) < 8000) {
      nextShwRef.current = nextSoloRef.current + 8000;
    }

    // ---- Static draw (prefers-reduced-motion) ----
    if (prefersReduced) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const { w, h } = sizeRef.current;
        ctx.clearRect(0, 0, w, h);
        // reduced-motion: чёрная дыра статична, без искажения звёзд/метеоров
        // (само искажение — вид анимации), поэтому звёзды рисуются как обычно,
        // а круг просто накладывается поверх
        drawStars(ctx, starsRef.current, 0, false, null);
        const bh = resolveBlackHoleGeometry(w, h);
        if (bh) {
          drawBlackHole(ctx, bh);
          drawAccretionDisk(ctx, bh, 0, false);
        }
      }
      return;
    }

    // ---- Курсор (Reach — только вне prefers-reduced-motion) ----
    function onMouseMove(e: MouseEvent) {
      const now = performance.now();
      const prevSample = lastMouseSampleRef.current;
      cursorPosRef.current = { x: e.clientX, y: e.clientY };
      // Обычное быстрое движение мышью/тачпадом «вырывает» курсор из дрейфа
      // (докидываем п.3 доработки) — сравниваем скорость с предыдущим сэмплом
      if (
        prevSample &&
        exceedsEscapeSpeed(e.clientX - prevSample.x, e.clientY - prevSample.y, now - prevSample.t, CURSOR_DRIFT_ESCAPE_SPEED)
      ) {
        driftPosRef.current = null;
        driftVelRef.current = { x: 0, y: 0 };
      }
      lastMouseSampleRef.current = { x: e.clientX, y: e.clientY, t: now };
    }
    window.addEventListener('mousemove', onMouseMove);

    // ---- RAF loop ----
    function loop(now: number) {
      rafRef.current = requestAnimationFrame(loop);

      const { w, h } = sizeRef.current;
      const blackHole = resolveBlackHoleGeometry(w, h);
      const hasMeteors = meteorsRef.current.length > 0 || specsRef.current.length > 0;
      // Чёрная дыра держит активно вращающиеся звёзды (п.1.2/1.3 ТЗ) — на 15 fps
      // быстрое вращение выглядело бы дёргано (стробоскопический эффект),
      // поэтому канвас переключается на те же 60 fps, что и при метеорах.
      const targetMs = (hasMeteors || blackHole) ? MTR_FRAME_MS : STAR_FRAME_MS;
      const frameGapMs = now - lastFrameRef.current;
      if (frameGapMs < targetMs) return;
      lastFrameRef.current = now;

      // Разрыв такого порядка — пауза (скрытая вкладка/троттлинг), а не
      // обычный тик; исключаем «лишнее» время из виртуальных часов вращения
      // (п.8.3) — оставляем типичный кадровый интервал, чтобы после
      // возврата вихрь продолжил вращение с той же точки, где остановился,
      // а не прыгнул на угол, «положенный» по реальному прошедшему времени.
      if (frameGapMs > RESUME_GAP_MS) {
        hiddenTimeOffsetRef.current += frameGapMs - targetMs;
      }
      const rotationNow = now - hiddenTimeOffsetRef.current;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, w, h);
      drawStars(ctx, starsRef.current, rotationNow, true, blackHole);

      // Solo meteor
      if (now >= nextSoloRef.current && meteorsRef.current.length < MAX_METEORS) {
        const angle = (60 + Math.random() * 30) * (Math.PI / 180);
        meteorsRef.current.push(spawnMeteor(w, h, angle, Math.random() < 0.5 ? 1 : -1, now));
        nextSoloRef.current = now + randSoloMs();
        if (Math.abs(nextSoloRef.current - nextShwRef.current) < 8000) {
          nextShwRef.current = nextSoloRef.current + 8000;
        }
      }

      // Start shower — «догоняющий» поток после долгого отсутствия на
      // вкладке ограничен более узким числом кластеров (п.5.6.3, раунд 5),
      // иначе он гарантированно получался бы максимально нагруженным каждый
      // раз (случайный диапазон buildShowerSpecs не отличает обычное и
      // догоняющее срабатывание сам по себе).
      if (specsRef.current.length === 0 && now >= nextShwRef.current) {
        const maxClusters = frameGapMs > RESUME_GAP_MS ? SHOWER_CATCHUP_MAX_CLUSTERS : SHOWER_MAX_CLUSTERS;
        specsRef.current = buildShowerSpecs(now, maxClusters);
        nextShwRef.current = now + randShowerMs();
        if (Math.abs(nextShwRef.current - nextSoloRef.current) < 8000) {
          nextSoloRef.current = nextShwRef.current + 8000;
        }
      }

      // Dispatch ready shower specs
      if (specsRef.current.length > 0) {
        const pending: ShowerSpec[] = [];
        for (const spec of specsRef.current) {
          if (now >= spec.startAt && meteorsRef.current.length < MAX_METEORS) {
            meteorsRef.current.push(spawnMeteor(w, h, spec.angle, spec.direction, now));
          } else {
            pending.push(spec);
          }
        }
        specsRef.current = pending;
      }

      // Draw meteors & remove expired
      if (meteorsRef.current.length > 0) {
        meteorsRef.current = drawAndFilterMeteors(ctx, meteorsRef.current, now, blackHole);
      }

      // Круг — поверх звёзд/метеоров (горизонт событий их «закрывает»)
      if (blackHole) {
        drawBlackHole(ctx, blackHole);
        // `now` (не rotationNow) — мерцание ограничено (saturating), скачок
        // после скрытой вкладки даёт максимум один "прыжок" по мерцанию
        // между кадрами, а не заметный "телепорт", как у угла вращения
        // (п.9.2, docs/error-experience/spec.md); тот же выбор, что и у
        // твинкла звёзд (тоже raw `now`, не rotationNow).
        drawAccretionDisk(ctx, blackHole, now, true);
      }

      // Дрейф к центру (п.3 доработки) — вычисляем позицию для рендера
      // (реальную либо дрейфующую) ДО renderCursorLensing, который её просто
      // рисует, не зная о существовании дрейфа. Клэмп (п.8.3) — без него dt
      // после скрытой вкладки может быть счётом на секунды и уйти прямиком
      // в интегрирование скорости (см. MAX_DRIFT_DT_SECONDS выше).
      const rawDriftDtSeconds = lastDriftTimeRef.current ? (now - lastDriftTimeRef.current) / 1000 : 0;
      const driftDtSeconds = Math.min(rawDriftDtSeconds, MAX_DRIFT_DT_SECONDS);
      lastDriftTimeRef.current = now;
      const effectiveCursorPos = updateCursorDrift(
        cursorPosRef.current, blackHole, driftDtSeconds, driftPosRef, driftVelRef,
      );
      renderCursorLensing(ctx, blackHole, effectiveCursorPos, cursorHiddenRef);
    }

    rafRef.current = requestAnimationFrame(loop);

    // ---- Pause on hidden tab ----
    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
      } else {
        // lastFrameRef.current НЕ трогаем — loop() сам читает разрыв между
        // этим (устаревшим) значением и текущим performance.now() как сигнал
        // «только что вернулись из фона» (RESUME_GAP_MS, п.5.6.3, раунд 5),
        // сброс здесь замаскировал бы этот разрыв ещё до первого тика.
        rafRef.current = requestAnimationFrame(loop);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    // ---- Resize observer ----
    const ro = new ResizeObserver(resize);
    ro.observe(document.body);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('mousemove', onMouseMove);
      ro.disconnect();
      // На случай ухода со страницы прямо в момент, когда курсор был скрыт
      document.body.style.cursor = '';
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
