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
  BLACK_HOLE_DIAMETER_RATIO,
  BLACK_HOLE_POSITION_MOBILE_X_RATIO,
  BLACK_HOLE_POSITION_MOBILE_Y_PX,
  BLACK_HOLE_POSITION_Y_PX,
  CAPTURED_METEOR_FADE_MS,
  CURSOR_DRIFT_BASE_ACCEL,
  CURSOR_DRIFT_ESCAPE_SPEED,
  CURSOR_RESISTANCE_POWER,
  DISK_ARC_INNER_OVERLAP_PX,
  DISK_BASE_COLOR,
  DISK_BELT_HALF_THICKNESS_FACTOR,
  DISK_BELT_SAG_FACTOR,
  DISK_CONTOUR_POINT_COUNT,
  DISK_LOWER_ARC_CUTOFF_ANGLE_DEG,
  DISK_LOWER_ARC_MERGE_X_FACTOR,
  DISK_LOWER_ARC_POLE_THICKNESS_FACTOR,
  DISK_LOWER_ARC_SIDE_THICKNESS_FACTOR,
  DISK_RX_FACTOR,
  DISK_TILT_RAD,
  DISK_UPPER_ARC_FILLET_RADIUS_FACTOR,
  DISK_UPPER_ARC_RENDER_HALF_SPAN_FACTOR,
  DISK_UPPER_ARC_THICKNESS_FACTOR,
  INNER_ZONE_BRIGHTNESS_FACTOR,
  LENSING_FADE_START_DIAMETERS,
  METEOR_CAPTURE_DIAMETERS,
  MOBILE_BREAKPOINT_PX,
  PHOTON_RING_CENTER_OFFSET_FACTOR,
  PHOTON_RING_COLOR,
  PHOTON_RING_LINE_WIDTH,
  PHOTON_RING_MIN_LINE_WIDTH,
  PHOTON_RING_RADIUS_FACTOR,
  PHOTON_RING_SEGMENT_COUNT,
  ROTATION_ZONE_EXTRA_FACTOR,
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
  // Деформация формы стартует на FADE_START — не на границе кольцевой зоны
  // (OUTER) — иначе звёзды сперва растягивались бы в эллипс без всякого
  // движения, а вращение включалось бы отдельным резким порогом позже.
  const outerBoundaryPx = blackHole ? blackHole.radius * 2 * LENSING_FADE_START_DIAMETERS : 0;
  // Раунд 12: у вращения СВОЯ, на 7% более широкая граница (ROTATION_ZONE_
  // EXTRA_FACTOR, constants/blackHole.ts) — это НЕ тот же баг «эллипс без
  // движения» в обратную сторону: на новых внешних процентах звезда просто
  // ещё круглая (деформация не включилась) и только-только начинает едва
  // заметно вращаться — обе величины по-прежнему стартуют строго с нуля.
  // computeLensing вычисляет свой порог самостоятельно из bh.radius и не
  // получает outerBoundaryPx извне — расширение физически не может задеть
  // деформацию формы, а курсор/метеоры читают LENSING_FADE_START_DIAMETERS
  // напрямую в других функциях, тоже не связаны с этой переменной.
  const rotationBoundaryPx = outerBoundaryPx * ROTATION_ZONE_EXTRA_FACTOR;

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
    // звёзд иначе выполняется впустую каждый кадр. Порог — rotationBoundaryPx
    // (шире, чем outerBoundaryPx деформации, раунд 12), иначе звёзды в новых
    // 7% отбрасывались бы здесь ещё ДО применения вращения.
    if (!blackHole || (s.distFromBhSurface ?? Infinity) > rotationBoundaryPx) {
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    // Вращение вихря (п.1.2) — применяется до расчёта деформации формы,
    // оба эффекта независимы друг от друга на одной и той же звезде.
    const { x: rx, y: ry } = applyOrbitalRotation(s.x, s.y, blackHole, rotationBoundaryPx, now);
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
// Аккреционный диск с нуля (docs/error-experience/spec.md, раунд 13, план,
// коммит 1 — статичная геометрия). Три НЕЗАВИСИМЫЕ фигуры вместо одной
// параметрической формулы (см. обоснование — constants/blackHole.ts, блок
// DISK_*). Дисциплина рендера — та же, что у звёзд/метеоров: НИ ОДНОЙ
// per-frame аллокации (ни массивов точек, ни замыканий) — только числа и
// прямые вызовы ctx в одном проходе цикла.
// ---------------------------------------------------------------------------

// Центральная линия пояса — не строго горизонтальная (правка 13.3, вводная
// пользователя): гладкий симметричный прогиб вниз, тот же профиль
// sqrt(1-(x/rx)²), что и толщина пояса — ноль на остриях, максимум в
// центре. Именно "полуэллипс", не излом/"чайка" — уточнено у пользователя
// явно двумя раундами вопросов.
function beltCenterlineY(x: number, rx: number, sag: number): number {
  return sag * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx)));
}

// Половина толщины пояса в точке x — тот же профиль, симметично вокруг
// центральной линии (прогиб не меняет толщину диска — явное условие
// пользователя).
function beltHalfThicknessAt(x: number, rx: number, beltHalf: number): number {
  return beltHalf * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx)));
}

// Экспоненциальный smooth-min (LogSumExp) — сглаживает угол ровно там, где
// две независимые кривые пересекаются (a≈b), НЕ трогая форму нигде больше
// (там, где a и b далеки друг от друга, результат неотличим от обычного
// min). Правка 13.4: верхняя дуга константной толщины (простое кольцо,
// окружность Rup вокруг тени) неизбежно пересекает верхний край пояса ПОД
// УГЛОМ — по вводной пользователя, этот угол "закрашивается" плавным
// скруглением (добавляет материала ровно в точке пересечения), а не
// гладким слиянием по всей длине дуги (то, что делал прежний domeBump, — и
// именно это схлопывало толщину дуги в шип, см. правку в constants/
// blackHole.ts).
// Правка 13.5 — заменили полиномиальный smooth-min на экспоненциальный
// (вводная пользователя: угол всё ещё читался чётким) — при сопоставимом k
// экспоненциальный вариант даёт заметно более широкую и глубокую зону
// смешения (полиномиальный обнуляется РОВНО на |a-b|=k, у экспоненциального
// влияние спадает плавно и за пределами k). ВАЖНО про направление k: здесь
// k стоит в ЗНАМЕНАТЕЛЕ (a/k, не k*a, как в канонической формуле IQ) —
// поэтому у нас, в отличие от канонической записи, БОЛЬШЕ k = ПЛАВНЕЕ
// переход (не наоборот) — проверено прямым вычислением на нашем диапазоне
// значений, см. constants/blackHole.ts.
// Знак: "северное" (верхнее) направление — МЕНЬШИЙ y (canvas y растёт вниз)
// — обычный min(a,b) уже выбирает более выступающую границу, smoothMinNorth
// лишь скругляет стык.
function smoothMinNorth(a: number, b: number, k: number): number {
  const sum = Math.exp(-a / k) + Math.exp(-b / k);
  return -Math.log(sum) * k;
}

// Нижняя дуга — толщина (не радиус) задаётся напрямую как функция x:
// полная DISK_LOWER_ARC_POLE_THICKNESS_FACTOR у полюса (x=0), затем
// ЛИНЕЙНО (не smoothstep — угол на стыке здесь желателен, не баг) убывает
// до DISK_LOWER_ARC_SIDE_THICKNESS_FACTOR ровно в точке слияния с поясом
// (DISK_LOWER_ARC_MERGE_X_FACTOR × R), под углом DISK_LOWER_ARC_CUTOFF_
// ANGLE_DEG — ширина зоны обреза выводится из перепада толщины и угла.
// Внешняя граница — max(линейный обрез, нижний край ПРОГНУВШЕГОСЯ пояса) —
// гарантия от зазора: без этой подстраховки прогиб пояса (пусть и малый)
// мог бы у самого края тени уйти ниже, чем успевает опуститься дуга по
// своей собственной (не знающей о поясе) формуле толщины.
function drawDiskLowerArc(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry): void {
  const R = bh.radius;
  const rx = R * DISK_RX_FACTOR;
  const beltHalf = R * DISK_BELT_HALF_THICKNESS_FACTOR;
  const sag = R * DISK_BELT_SAG_FACTOR;
  const poleT = R * DISK_LOWER_ARC_POLE_THICKNESS_FACTOR;
  const sideT = R * DISK_LOWER_ARC_SIDE_THICKNESS_FACTOR;
  const mergeX = R * DISK_LOWER_ARC_MERGE_X_FACTOR;
  const slope = Math.tan((DISK_LOWER_ARC_CUTOFF_ANGLE_DEG * Math.PI) / 180);
  const rampWidth = (poleT - sideT) / slope;
  const xFlat = mergeX - rampWidth;
  const n = DISK_CONTOUR_POINT_COUNT;
  const cos = Math.cos(DISK_TILT_RAD);
  const sin = Math.sin(DISK_TILT_RAD);

  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = -rx + (2 * rx * i) / n;
    const y = Math.sqrt(Math.max(0, R * R - x * x)) - DISK_ARC_INNER_OVERLAP_PX;
    const px = bh.x + x * cos - y * sin;
    const py = bh.y + x * sin + y * cos;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  for (let i = n; i >= 0; i--) {
    const x = -rx + (2 * rx * i) / n;
    const absX = Math.abs(x);
    const innerY = Math.sqrt(Math.max(0, R * R - x * x)) - DISK_ARC_INNER_OVERLAP_PX;
    const thickness = absX <= xFlat ? poleT : Math.max(0, poleT - slope * (absX - xFlat));
    const rampY = innerY + thickness;
    const beltBottomY = beltCenterlineY(x, rx, sag) + beltHalfThicknessAt(x, rx, beltHalf);
    const y = Math.max(rampY, beltBottomY);
    const px = bh.x + x * cos - y * sin;
    const py = bh.y + x * sin + y * cos;
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = DISK_BASE_COLOR;
  ctx.fill();
}

// Верхняя дуга — правка 13.4 (по вводной пользователя, живая проверка
// правки 13.3): толщина СТАБИЛЬНА по всей длине (кольцо между концентричной
// тени окружностью Rup=R+DISK_UPPER_ARC_THICKNESS_FACTOR и самой тенью —
// толщина постоянна по построению, никакого купол-спада). Внутренняя
// граница — окружность тени БЕЗ сдвига (не +overlapPx, в отличие от нижней
// дуги) — по вводной пользователя, эта граница нигде не должна перекрывать
// тень; безопасно, т.к. обе кривые статичны и совпадают точно (не два
// независимо джиттерящих контура, которым нужен запас).
// Внешняя граница = smoothMinNorth(окружность Rup, верхний край пояса) —
// min гарантирует отсутствие зазора (дуга не короче пояса нигде), а
// smooth-часть закрашивает угол на пересечении плавным скруглением
// (буквально "добавляет толщины" ровно в этой точке — вводная
// пользователя), не трогая форму дуги нигде, где она далеко от пояса.
function drawDiskUpperArc(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry): void {
  const R = bh.radius;
  const rx = R * DISK_RX_FACTOR;
  const beltHalf = R * DISK_BELT_HALF_THICKNESS_FACTOR;
  const sag = R * DISK_BELT_SAG_FACTOR;
  const Rup = R + R * DISK_UPPER_ARC_THICKNESS_FACTOR;
  const filletRadius = R * DISK_UPPER_ARC_FILLET_RADIUS_FACTOR;
  const halfSpan = R * DISK_UPPER_ARC_RENDER_HALF_SPAN_FACTOR;
  const n = DISK_CONTOUR_POINT_COUNT;
  const cos = Math.cos(DISK_TILT_RAD);
  const sin = Math.sin(DISK_TILT_RAD);

  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = -halfSpan + (2 * halfSpan * i) / n;
    const circleY = -Math.sqrt(Math.max(0, Rup * Rup - x * x));
    const beltTopY = beltCenterlineY(x, rx, sag) - beltHalfThicknessAt(x, rx, beltHalf);
    const y = smoothMinNorth(circleY, beltTopY, filletRadius);
    const px = bh.x + x * cos - y * sin;
    const py = bh.y + x * sin + y * cos;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  for (let i = n; i >= 0; i--) {
    const x = -halfSpan + (2 * halfSpan * i) / n;
    const y = -Math.sqrt(Math.max(0, R * R - x * x));
    const px = bh.x + x * cos - y * sin;
    const py = bh.y + x * sin + y * cos;
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = DISK_BASE_COLOR;
  ctx.fill();
}

// Пояс — отдельная линза (профиль sqrt(1-(x/rx)²), половина эллипса,
// естественно сужается к острию ровно в x=±rx), с прогнутой вниз
// центральной линией (beltCenterlineY, правка 13.3). Рисуется ПОСЛЕДНИМ из
// трёх (вызывающий код) — пересекает тень поперёк по центру и перекрывает
// боковые швы обеих дуг сверху, "нагло" (см. ТЗ), без точной геометрической
// стыковки.
function drawDiskBelt(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry): void {
  const rx = bh.radius * DISK_RX_FACTOR;
  const beltHalf = bh.radius * DISK_BELT_HALF_THICKNESS_FACTOR;
  const sag = bh.radius * DISK_BELT_SAG_FACTOR;
  const n = DISK_CONTOUR_POINT_COUNT;
  const cos = Math.cos(DISK_TILT_RAD);
  const sin = Math.sin(DISK_TILT_RAD);

  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = -rx + (2 * rx * i) / n;
    const y = beltCenterlineY(x, rx, sag) - beltHalfThicknessAt(x, rx, beltHalf);
    const px = bh.x + x * cos - y * sin;
    const py = bh.y + x * sin + y * cos;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  for (let i = n; i >= 0; i--) {
    const x = -rx + (2 * rx * i) / n;
    const y = beltCenterlineY(x, rx, sag) + beltHalfThicknessAt(x, rx, beltHalf);
    const px = bh.x + x * cos - y * sin;
    const py = bh.y + x * sin + y * cos;
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = DISK_BASE_COLOR;
  ctx.fill();
}

// Фотонное кольцо — тонкая нить чуть внутри границы тени (PHOTON_RING_
// RADIUS_FACTOR), ПОЛНАЯ окружность, не участвует в наклоне сборки
// (окружность вокруг своего центра инвариантна к повороту). Две правки по
// вводной пользователя (после раунда 13.2):
// 1. Центр кольца смещён вправо от центра тени (PHOTON_RING_CENTER_OFFSET_
//    FACTOR) — на референсе кольцо не концентрично тени.
// 2. Толщина линии асимметрична по дуге: максимум (PHOTON_RING_LINE_WIDTH)
//    у левого полюса тени, плавно убывает до минимума (PHOTON_RING_MIN_
//    LINE_WIDTH, "на грани видимости") у правого полюса — cos(угол) даёт
//    гладкую (не ступенчатую) интерполяцию, симметричную сверху/снизу.
// Canvas не поддерживает переменную толщину линии в одном stroke() —
// кольцо рисуется PHOTON_RING_SEGMENT_COUNT короткими дугами, каждая со
// своим lineWidth (только числа в цикле, без аллокаций). round-колпачки —
// чтобы стыки сегментов не были видны как ступеньки.
function drawPhotonRing(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry): void {
  const r = bh.radius * PHOTON_RING_RADIUS_FACTOR;
  const cx = bh.x + bh.radius * PHOTON_RING_CENTER_OFFSET_FACTOR;
  const cy = bh.y;
  const n = PHOTON_RING_SEGMENT_COUNT;
  ctx.strokeStyle = PHOTON_RING_COLOR;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const aMid = (a0 + a1) / 2;
    // t: 0 у правого полюса (угол 0, cos=1), 1 у левого полюса (угол π, cos=-1)
    const t = (1 - Math.cos(aMid)) / 2;
    ctx.lineWidth = PHOTON_RING_MIN_LINE_WIDTH + (PHOTON_RING_LINE_WIDTH - PHOTON_RING_MIN_LINE_WIDTH) * t;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.stroke();
  }
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
          drawDiskLowerArc(ctx, bh);
          drawDiskUpperArc(ctx, bh);
          drawDiskBelt(ctx, bh);
          drawPhotonRing(ctx, bh);
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

      // Круг — поверх звёзд/метеоров (горизонт событий их «закрывает»).
      // Аккреционный диск (раунд 13, коммит 1 — статичная геометрия): тень
      // → нижняя дуга → верхняя дуга → пояс (перекрывает швы дуг по бокам)
      // → фотонное кольцо (см. функции выше).
      if (blackHole) {
        drawBlackHole(ctx, blackHole);
        drawDiskLowerArc(ctx, blackHole);
        drawDiskUpperArc(ctx, blackHole);
        drawDiskBelt(ctx, blackHole);
        drawPhotonRing(ctx, blackHole);
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
