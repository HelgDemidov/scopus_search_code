import { useEffect, useRef } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { getBlackHole } from '../../stores/blackHoleStore';
import {
  blackHoleRadiusPx,
  computeLensing,
  isInsideBlackHoleDisk,
  shouldHideCursor,
} from '../../utils/blackHoleLensing';
import {
  BLACK_HOLE_DIAMETER_RATIO,
  CAPTURED_CURSOR_ARC_SPAN,
  CAPTURED_METEOR_ARC_SPAN,
  CAPTURED_METEOR_FADE_MS,
  CAPTURED_STAR_ARC_SPAN,
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
  // Заполняются, если метеор пролетел ближе LENSING_INNER_DIAMETERS к чёрной
  // дыре (docs/error-experience/spec.md) — вместо полосы по вектору скорости
  // рендерится зафиксированная дуга по орбите, угасающая за CAPTURED_METEOR_FADE_MS
  capturedAt?: number;
  capturedAngle?: number;
  capturedOrbitRadius?: number;
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

function generateStars(w: number, h: number): Star[] {
  const count = w < 768 ? 150 : 400;
  return Array.from({ length: count }, () => {
    const r = Math.random();
    let baseBrightness: number;
    let twinkles: boolean;
    let radius: number;

    let twinklePeriod: number;
    let twinklePhase: number;
    if (r < 0.6) {
      baseBrightness = 0.085 + Math.random() * 0.102; // 0.085–0.187 (−15% от 0.10–0.22)
      twinkles = false;
      twinklePeriod = 0;
      twinklePhase  = 0;
      radius = 0.7;
    } else if (r < 0.9) {
      baseBrightness = 0.238 + Math.random() * 0.187; // 0.238–0.425 (−15% от 0.28–0.50)
      twinkles = true;
      twinklePeriod = 2000 + Math.random() * 7000;    // 2–9 s, индивидуальный
      twinklePhase  = Math.random() * Math.PI * 2;
      radius = 0.9;
    } else {
      baseBrightness = 0.398 + Math.random() * 0.093; // 0.398–0.491 (−15% от 0.468–0.578)
      twinkles = true;
      twinklePeriod = (2000 + Math.random() * 7000) / 2.5; // 0.8–3.6 s (2.5x быстрее Tier 2)
      twinklePhase  = Math.random() * Math.PI * 2;
      radius = 1.2;
    }

    return {
      x: Math.random() * w,
      y: Math.random() * h,
      radius,
      baseBrightness,
      twinkles,
      twinklePeriod,
      twinklePhase,
    };
  });
}

// Дуга по орбите вокруг чёрной дыры — общий рендер для «схлопнувшихся»
// звёзд/метеоров (режим 'captured' из computeLensing).
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

    const lensing = computeLensing(s.x, s.y, blackHole.x, blackHole.y, blackHole.radius);
    if (lensing.mode === 'normal') {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.fill();
    } else if (lensing.mode === 'lensed') {
      ctx.beginPath();
      ctx.ellipse(
        s.x, s.y,
        s.radius * lensing.scaleAlongOrbit,
        s.radius * lensing.scaleAcrossOrbit,
        lensing.angle, 0, Math.PI * 2,
      );
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.fill();
    } else {
      // captured — статичная дуга (звёзды не двигаются, в отличие от метеоров)
      const orbitRadius = Math.hypot(s.x - blackHole.x, s.y - blackHole.y);
      const angle = Math.atan2(s.y - blackHole.y, s.x - blackHole.x);
      drawOrbitArc(ctx, blackHole, orbitRadius, angle, CAPTURED_STAR_ARC_SPAN, a);
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
        ctx, blackHole, m.capturedOrbitRadius ?? 0, m.capturedAngle ?? 0,
        CAPTURED_METEOR_ARC_SPAN, alpha,
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

    // Проверяем горизонт события — метеор мгновенно «схлопывается» в дугу
    if (blackHole && computeLensing(headX, headY, blackHole.x, blackHole.y, blackHole.radius).mode === 'captured') {
      m.capturedAt = now;
      m.capturedAngle = Math.atan2(headY - blackHole.y, headX - blackHole.x);
      m.capturedOrbitRadius = Math.hypot(headX - blackHole.x, headY - blackHole.y);
      alive.push(m);
      drawOrbitArc(ctx, blackHole, m.capturedOrbitRadius, m.capturedAngle, CAPTURED_METEOR_ARC_SPAN, a);
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

  const lensing = computeLensing(cursorPos.x, cursorPos.y, blackHole.x, blackHole.y, blackHole.radius);
  if (lensing.mode === 'captured') {
    const orbitRadius = Math.hypot(cursorPos.x - blackHole.x, cursorPos.y - blackHole.y);
    const angle = Math.atan2(cursorPos.y - blackHole.y, cursorPos.x - blackHole.x);
    drawOrbitArc(ctx, blackHole, orbitRadius, angle, CAPTURED_CURSOR_ARC_SPAN, CURSOR_ALPHA);
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
      starsRef.current = generateStars(w, h);
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
      cursorPosRef.current = { x: e.clientX, y: e.clientY };
    }
    window.addEventListener('mousemove', onMouseMove);

    // ---- RAF loop ----
    function loop(now: number) {
      rafRef.current = requestAnimationFrame(loop);

      const hasMeteors = meteorsRef.current.length > 0 || specsRef.current.length > 0;
      const targetMs   = hasMeteors ? MTR_FRAME_MS : STAR_FRAME_MS;
      if (now - lastFrameRef.current < targetMs) return;
      lastFrameRef.current = now;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { w, h } = sizeRef.current;
      const blackHole = resolveBlackHoleGeometry(w, h);
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

      renderCursorLensing(ctx, blackHole, cursorPosRef.current, cursorHiddenRef);
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
