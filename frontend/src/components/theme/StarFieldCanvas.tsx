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
  CAPTURED_METEOR_FADE_MS,
  CURSOR_DRIFT_BASE_ACCEL,
  CURSOR_DRIFT_ESCAPE_SPEED,
  CURSOR_RESISTANCE_POWER,
  INNER_ZONE_BRIGHTNESS_FACTOR,
  LENSING_FADE_START_DIAMETERS,
  METEOR_CAPTURE_DIAMETERS,
  VORTEX_BLOB_COUNT,
  VORTEX_RADIUS_RATIO,
  VORTEX_STAR_COUNT,
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
  const count = w < 768 ? 150 : 400;
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    ...randomStarVisuals(),
  }));
}

// Плотное, неправильной формы скопление звёзд вокруг чёрной дыры — фон для
// эффекта воронки (docs/error-experience/spec.md, п.1.2), ~30% площади
// экрана. Художественная аппроксимация через частицы, не пиксельное
// линзирование фона (вне scope). Несколько смещённых друг от друга
// «сгущений» (Box-Muller вокруг своего центра) вместо одного правильного
// круга — даёт органичную, рваную форму. Масштаб считается от диагонали
// экрана (VORTEX_RADIUS_RATIO), НЕ от радиуса дыры — иначе туманность была
// бы жёстко привязана к крошечному размеру самой дыры и оставалась тонкой
// каёмкой вокруг неё вместо полноценного фона.
function generateVortexCluster(bh: BlackHoleGeometry, diagonal: number): Star[] {
  const nebulaRadius = diagonal * VORTEX_RADIUS_RATIO;
  // Якорь скопления смещён от центра дыры — дыра не строго в центре туманности
  const anchorAngle = Math.random() * Math.PI * 2;
  const anchorX = bh.x + Math.cos(anchorAngle) * nebulaRadius * 0.2;
  const anchorY = bh.y + Math.sin(anchorAngle) * nebulaRadius * 0.2;
  const perBlob = Math.ceil(VORTEX_STAR_COUNT / VORTEX_BLOB_COUNT);
  const stars: Star[] = [];

  for (let b = 0; b < VORTEX_BLOB_COUNT; b++) {
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
  ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, alpha).toFixed(3)})`;
  ctx.lineWidth = 1;
  ctx.stroke();
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

  for (const s of stars) {
    let a = s.baseBrightness;
    if (animate && s.twinkles) {
      a = Math.max(0, Math.min(1, a * (1 + TWINKLE_AMP * Math.sin(2 * Math.PI * now / s.twinklePeriod + s.twinklePhase))));
    }

    if (!blackHole) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
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
      ctx.beginPath();
      ctx.arc(rx, ry, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.fill();
    } else if (lensing.mode === 'lensed') {
      ctx.beginPath();
      ctx.ellipse(
        rx, ry,
        s.radius * lensing.scaleAlongOrbit,
        s.radius * lensing.scaleAcrossOrbit,
        lensing.angle, 0, Math.PI * 2,
      );
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
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
    duration: (200 + Math.random() * 500) * 0.80,   // 160–560 ms (на 20% быстрее)
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

    const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, `rgba(255,255,255,${a.toFixed(3)})`);

    ctx.strokeStyle = grad;
    ctx.lineWidth   = 1.5;
    ctx.shadowBlur  = 3;
    ctx.shadowColor = `rgba(255,255,255,${(a * 0.4).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(headX, headY);
    ctx.stroke();
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
  const { ax, ay } = gravitationalDriftAccel(pos.x, pos.y, blackHole.x, blackHole.y, blackHole.radius, CURSOR_DRIFT_BASE_ACCEL);
  driftVelRef.current = { x: driftVelRef.current.x + ax * dtSeconds, y: driftVelRef.current.y + ay * dtSeconds };
  driftPosRef.current = {
    x: pos.x + driftVelRef.current.x * dtSeconds,
    y: pos.y + driftVelRef.current.y * dtSeconds,
  };
  return driftPosRef.current;
}

function resolveBlackHoleGeometry(w: number, h: number): BlackHoleGeometry | null {
  const pos = getBlackHole();
  if (!pos) return null;
  return {
    x: pos.xRatio * w,
    y: pos.yRatio * h,
    radius: blackHoleRadiusPx(w, h, BLACK_HOLE_DIAMETER_RATIO),
  };
}

// ---------------------------------------------------------------------------
// Shower scheduler
// ---------------------------------------------------------------------------

function randSoloMs():   number { return 20000  + (Math.random() * 20000 - 10000);  } // 20 ± 10 s
function randShowerMs(): number { return 120000 + (Math.random() * 60000 - 30000);  } // 120 ± 30 s

function buildShowerSpecs(now: number): ShowerSpec[] {
  const numClusters = 1 + Math.floor(Math.random() * 4);           // 1–4 кластера
  const angle       = (60 + Math.random() * 30) * (Math.PI / 180); // 60–90° от вертикали
  const direction   = Math.random() < 0.5 ? 1 : -1;

  const specs: ShowerSpec[] = [];
  let t = now;

  for (let c = 0; c < numClusters; c++) {
    const n = 5 + Math.floor(Math.random() * 36); // 5–40 метеоров в кластере
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
      starsRef.current = bh ? stars.concat(generateVortexCluster(bh, Math.hypot(w, h))) : stars;
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
        if (bh) drawBlackHole(ctx, bh);
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
      if (now - lastFrameRef.current < targetMs) return;
      lastFrameRef.current = now;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, w, h);
      drawStars(ctx, starsRef.current, now, true, blackHole);

      // Solo meteor
      if (now >= nextSoloRef.current && meteorsRef.current.length < MAX_METEORS) {
        const angle = (60 + Math.random() * 30) * (Math.PI / 180);
        meteorsRef.current.push(spawnMeteor(w, h, angle, Math.random() < 0.5 ? 1 : -1, now));
        nextSoloRef.current = now + randSoloMs();
        if (Math.abs(nextSoloRef.current - nextShwRef.current) < 8000) {
          nextShwRef.current = nextSoloRef.current + 8000;
        }
      }

      // Start shower
      if (specsRef.current.length === 0 && now >= nextShwRef.current) {
        specsRef.current = buildShowerSpecs(now);
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
      if (blackHole) drawBlackHole(ctx, blackHole);

      // Дрейф к центру (п.3 доработки) — вычисляем позицию для рендера
      // (реальную либо дрейфующую) ДО renderCursorLensing, который её просто
      // рисует, не зная о существовании дрейфа
      const driftDtSeconds = lastDriftTimeRef.current ? (now - lastDriftTimeRef.current) / 1000 : 0;
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
        lastFrameRef.current = performance.now();
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
