import { useEffect, useRef } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { getBlackHole, getMessageBottom } from '../../stores/blackHoleStore';
import i18n from '../../i18n';
import {
  computeLensing,
  exceedsEscapeSpeed,
  gravitationalDriftAccel,
  isInsideBlackHoleDisk,
  orbitalAngularVelocity,
  shouldHideCursor,
} from '../../utils/blackHoleLensing';
import { resolveBlackHoleGeometry } from '../../utils/blackHoleGeometry';
import {
  BH_VORTEX_CLEARANCE_FACTOR,
  BLACK_HOLE_POSITION_MOBILE_X_RATIO,
  CAPTURED_METEOR_FADE_MS,
  CURSOR_DRIFT_BASE_ACCEL,
  CURSOR_DRIFT_ESCAPE_SPEED,
  CURSOR_RESISTANCE_POWER,
  DISK_ARC_INNER_OVERLAP_PX,
  DISK_BELT_CENTER_COLOR,
  DISK_BELT_EDGE_COLOR,
  DISK_BELT_HALF_THICKNESS_FACTOR,
  DISK_BELT_SAG_FACTOR,
  DISK_CONTOUR_POINT_COUNT,
  DISK_LOWER_ARC_COLOR,
  DISK_LOWER_ARC_CUTOFF_ANGLE_DEG,
  DISK_LOWER_ARC_MERGE_X_FACTOR,
  DISK_LOWER_ARC_POLE_THICKNESS_FACTOR,
  DISK_LOWER_ARC_SIDE_THICKNESS_FACTOR,
  DISK_RX_FACTOR,
  DISK_TILT_RAD,
  DISK_UPPER_ARC_FILLET_END_FACTOR,
  DISK_UPPER_ARC_FILLET_START_FACTOR,
  DISK_UPPER_ARC_INNER_COLOR,
  DISK_UPPER_ARC_OUTER_COLOR,
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
  SECONDARY_NEBULA_RADIUS_RATIO_MOBILE,
  SECONDARY_NEBULA_STAR_COUNT_MAX,
  SECONDARY_NEBULA_STAR_COUNT_MAX_MOBILE,
  SECONDARY_NEBULA_STAR_COUNT_MIN,
  SECONDARY_NEBULA_STAR_COUNT_MIN_MOBILE,
  VORTEX_BLOB_COUNT,
  VORTEX_RADIUS_RATIO,
  VORTEX_RADIUS_RATIO_MOBILE,
  VORTEX_STAR_COUNT,
  VORTEX_STAR_COUNT_MOBILE,
} from '../../constants/blackHole';


interface Star {
  x: number;
  y: number;
  radius: number;
  baseBrightness: number;
  twinkles: boolean;
  twinklePeriod: number; // ms, индивидуальный для каждой звезды
  twinklePhase: number;  // radians [0, 2π], индивидуальный
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


const TWINKLE_AMP   = 0.20;
const STAR_FRAME_MS = 1000 / 15;    // 15 fps для звёзд
const MTR_FRAME_MS  = 1000 / 60;    // 60 fps пока активен метеор
const MAX_METEORS   = 50;
const MAX_DPR       = 2;

const SHOWER_MAX_CLUSTERS         = 3; // обычный поток — было 4
const SHOWER_CATCHUP_MAX_CLUSTERS = 2; // «догоняющий» поток при возврате из фона — п.5.6.3
const RESUME_GAP_MS = 2000;

const MAX_DRIFT_DT_SECONDS = 0.1;


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

// Единый источник isMobile/ratio-решения для радиуса вихря (§10.4 post-prod,
// docs/layout-overhaul/spec.md) — используется и здесь (генерация звёзд
// облака), и в getCurrentBlackHoleGeometry (клиренс floor'а под это же
// облако), чтобы два места не могли разъехаться в допущении о размере вихря.
function vortexNebulaRadiusPx(w: number, diagonal: number): number {
  const isMobile = w < MOBILE_BREAKPOINT_PX;
  return diagonal * (isMobile ? VORTEX_RADIUS_RATIO_MOBILE : VORTEX_RADIUS_RATIO);
}

function generateVortexCluster(bh: BlackHoleGeometry, diagonal: number, w: number): Star[] {
  const isMobile = w < MOBILE_BREAKPOINT_PX;
  const nebulaRadius = vortexNebulaRadiusPx(w, diagonal);
  const anchorAngle = Math.random() * Math.PI * 2;
  const anchorX = bh.x + Math.cos(anchorAngle) * nebulaRadius * 0.2;
  const anchorY = bh.y + Math.sin(anchorAngle) * nebulaRadius * 0.2;
  const starCount = isMobile ? VORTEX_STAR_COUNT_MOBILE : VORTEX_STAR_COUNT;
  return generateStarClumps(anchorX, anchorY, nebulaRadius, VORTEX_BLOB_COUNT, starCount);
}

function generateSecondaryNebula(w: number, h: number): Star[] {
  const diagonal = Math.hypot(w, h);
  const isMobile = w < MOBILE_BREAKPOINT_PX;
  const nebulaRadius = diagonal * (isMobile ? SECONDARY_NEBULA_RADIUS_RATIO_MOBILE : SECONDARY_NEBULA_RADIUS_RATIO);
  const anchorX = w * (0.18 + Math.random() * 0.12);
  const anchorY = h * (0.68 + Math.random() * 0.12);
  const min = isMobile ? SECONDARY_NEBULA_STAR_COUNT_MIN_MOBILE : SECONDARY_NEBULA_STAR_COUNT_MIN;
  const max = isMobile ? SECONDARY_NEBULA_STAR_COUNT_MAX_MOBILE : SECONDARY_NEBULA_STAR_COUNT_MAX;
  const totalStars = Math.round(min + Math.random() * (max - min));
  return generateStarClumps(anchorX, anchorY, nebulaRadius, SECONDARY_NEBULA_BLOB_COUNT, totalStars);
}

function applyOrbitalRotation(
  x0: number, y0: number, bh: BlackHoleGeometry, outerBoundaryPx: number, nowMs: number,
): { x: number; y: number } {
  const r = Math.hypot(x0 - bh.x, y0 - bh.y);
  const omega = orbitalAngularVelocity(r - bh.radius, outerBoundaryPx);
  if (omega === 0) return { x: x0, y: y0 };
  const theta = Math.atan2(y0 - bh.y, x0 - bh.x) + omega * (nowMs / 1000);
  return { x: bh.x + r * Math.cos(theta), y: bh.y + r * Math.sin(theta) };
}

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
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

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
  const outerBoundaryPx = blackHole ? blackHole.radius * 2 * LENSING_FADE_START_DIAMETERS : 0;
  const rotationBoundaryPx = outerBoundaryPx * ROTATION_ZONE_EXTRA_FACTOR;

  ctx.save();
  ctx.fillStyle = '#ffffff';

  for (const s of stars) {
    let a = s.baseBrightness;
    if (animate && s.twinkles) {
      a = Math.max(0, Math.min(1, a * (1 + TWINKLE_AMP * Math.sin(2 * Math.PI * now / s.twinklePeriod + s.twinklePhase))));
    }

    if (!blackHole || (s.distFromBhSurface ?? Infinity) > rotationBoundaryPx) {
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const { x: rx, y: ry } = applyOrbitalRotation(s.x, s.y, blackHole, rotationBoundaryPx, now);
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
      const angle = Math.atan2(ry - blackHole.y, rx - blackHole.x);
      drawOrbitArc(ctx, blackHole, lensing.ringRadius, angle, lensing.ringSpanFraction, a * INNER_ZONE_BRIGHTNESS_FACTOR);
    }
  }

  ctx.restore();
}


function spawnMeteor(
  w: number,
  h: number,
  angle: number,   // radians from vertical
  direction: number,
  now: number,
): Meteor {
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

    let a: number;
    if (progress < 0.10) a = m.maxAlpha * (progress / 0.10);
    else if (progress < 0.80) a = m.maxAlpha;
    else a = m.maxAlpha * (1 - (progress - 0.80) / 0.20);
    a = Math.max(0, a);

    const dist  = progress * m.length;
    const headX = m.x0 + m.dx * dist;
    const headY = m.y0 + m.dy * dist;

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

function drawBlackHole(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry): void {
  ctx.beginPath();
  ctx.arc(bh.x, bh.y, bh.radius, 0, Math.PI * 2);
  ctx.fillStyle = '#000000';
  ctx.fill();
}



function beltCenterlineY(x: number, rx: number, sag: number): number {
  const t = Math.max(0, Math.min(1, Math.abs(x) / rx));
  return sag * Math.pow(Math.cos(t * Math.PI / 2), 2.5);
}

function beltHalfThicknessAt(x: number, rx: number, beltHalf: number): number {
  const t = Math.max(0, Math.min(1, Math.abs(x) / rx));
  if (t >= 1) return 0;
  const exponent = 2.5 - 1.5 * Math.pow(t, 2);
  return beltHalf * Math.pow(Math.cos(t * Math.PI / 2), exponent);
}

function hermiteBlend(p0: number, m0: number, p1: number, m1: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
}

function getEdgeDisplacement(x: number, rx: number, R: number, now: number, direction: number, seed: number): { dx: number, dy: number } {
  const t = x / rx; // -1 to 1
  
  const baseJitter = (
    Math.sin(t * 13 + now * 0.15 + seed) * 0.5 +
    Math.sin(t * 23 - now * 0.21 + seed * 1.3) * 0.3 +
    Math.sin(t * 37 + now * 0.33 + seed * 0.7) * 0.2
  ) * (R * 0.03); 
  
  const t1 = now * 0.012 + seed;
  const t2 = now * 0.018 - seed;
  
  const envelope = Math.max(0, 
    Math.sin(t * 19.5 - t1) + 
    Math.cos(t * 33 + t2) - 
    1.60 // Снижен порог (появляются в 2 раза чаще)
  ); // Максимум envelope: 0.40
  
  let flameDx = 0;
  let flameDy = 0;
  
  if (envelope > 0) {
    const jagged = Math.sin(t * 180 - now * 0.04) * 0.5 + Math.sin(t * 310 + now * 0.05) * 0.5;
    const shape = Math.pow(envelope, 0.7);
    const height = shape * (1.43 + jagged * 0.47); // Перекалибровано для envelope 0.40
    flameDy = height;
    
    const baseAngle = Math.atan(1.8);
    const rand = Math.abs(Math.sin(t * 13.45 + seed * 9.87));
    const angleDeviation = rand * (15 * Math.PI / 180);
    const finalAngle = baseAngle - angleDeviation;
    
    flameDx = height * Math.tan(finalAngle); 
  }
  const edgeTaper = Math.pow(Math.max(0, 1 - Math.abs(t)), 1.5);

  return {
    dx: flameDx * direction * edgeTaper,
    dy: (Math.abs(baseJitter) + flameDy) * direction * edgeTaper
  };
}

function applyDopplerGlow(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry, rx: number, now: number): void {
  const cos = Math.cos(DISK_TILT_RAD);
  const sin = Math.sin(DISK_TILT_RAD);
  const dopplerGrad = ctx.createLinearGradient(
    bh.x - rx * cos, bh.y - rx * sin,
    bh.x + rx * cos, bh.y + rx * sin
  );
  
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const baseAlpha = 0.8 * Math.pow(1 - t, 1.5);
    
    const flicker = (
      Math.sin(t * 15 + now * 0.11) * 0.5 +
      Math.sin(t * 27 - now * 0.17) * 0.3 +
      Math.sin(t * 43 + now * 0.23) * 0.2
    );
    
    const a = Math.max(0, Math.min(1, baseAlpha * (1 + 0.5 * flicker)));
    
    if (i === 0) {
      dopplerGrad.addColorStop(0, `rgba(50, 150, 255, 0)`); // Принудительно прозрачный кончик для идеального клина
      dopplerGrad.addColorStop(0.02, `rgba(50, 150, 255, ${(a * 0.9).toFixed(3)})`); // True blue outer envelope
      dopplerGrad.addColorStop(0.05, `rgba(255, 255, 255, ${Math.min(1, a * 2.0).toFixed(3)})`); // Pure white core
      dopplerGrad.addColorStop(0.15, `rgba(255, 255, 255, ${Math.min(1, a * 1.5).toFixed(3)})`);
    } else {
      dopplerGrad.addColorStop(t, `rgba(100, 200, 255, ${a.toFixed(3)})`);
    }
  }
  
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = dopplerGrad;
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function drawDiskLowerArc(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry, now: number): void {
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
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const n = isMobile ? Math.floor(DISK_CONTOUR_POINT_COUNT / 2) : DISK_CONTOUR_POINT_COUNT;
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
    const disp = getEdgeDisplacement(x, rx, R, now, 1, 1000);
    const finalX = x + disp.dx;
    const finalY = y + disp.dy;
    const px = bh.x + finalX * cos - finalY * sin;
    const py = bh.y + finalX * sin + finalY * cos;
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = DISK_LOWER_ARC_COLOR;
  ctx.fill();

  applyDopplerGlow(ctx, bh, rx, now);

  ctx.beginPath();
  for (let i = n; i >= 0; i--) {
    const x = -rx + (2 * rx * i) / n;
    const absX = Math.abs(x);
    const innerY = Math.sqrt(Math.max(0, R * R - x * x)) - DISK_ARC_INNER_OVERLAP_PX;
    const thickness = absX <= xFlat ? poleT : Math.max(0, poleT - slope * (absX - xFlat));
    const rampY = innerY + thickness;
    const beltBottomY = beltCenterlineY(x, rx, sag) + beltHalfThicknessAt(x, rx, beltHalf);
    const y = Math.max(rampY, beltBottomY);
    const disp = getEdgeDisplacement(x, rx, R, now, 1, 11000);
    const finalX = x + disp.dx;
    const finalY = y + disp.dy;
    const px = bh.x + finalX * cos - finalY * sin;
    const py = bh.y + finalX * sin + finalY * cos;
    if (i === n) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.lineWidth = 3;
  const alphaStroke = Math.max(0, 0.07 + 0.77 * Math.sin(now * 0.102)).toFixed(2);
  
  const lowerArcStrokeGrad = ctx.createLinearGradient(
    bh.x - rx * cos, bh.y - rx * sin,
    bh.x + rx * cos, bh.y + rx * sin
  );
  
  const fadeOutStartX = mergeX * 0.8; 
  const fadeOutEndX = mergeX * 1.1;
  
  const tZeroLeft = (rx - fadeOutEndX) / (2 * rx);
  const tSolidLeft = (rx - fadeOutStartX) / (2 * rx);
  const tSolidRight = (rx + fadeOutStartX) / (2 * rx);
  const tZeroRight = (rx + fadeOutEndX) / (2 * rx);
  
  lowerArcStrokeGrad.addColorStop(0, `rgba(255, 180, 100, 0)`);
  lowerArcStrokeGrad.addColorStop(Math.max(0, tZeroLeft), `rgba(255, 180, 100, 0)`);
  lowerArcStrokeGrad.addColorStop(Math.max(0, tSolidLeft), `rgba(255, 180, 100, ${alphaStroke})`);
  lowerArcStrokeGrad.addColorStop(Math.min(1, tSolidRight), `rgba(255, 180, 100, ${alphaStroke})`);
  lowerArcStrokeGrad.addColorStop(Math.min(1, tZeroRight), `rgba(255, 180, 100, 0)`);
  lowerArcStrokeGrad.addColorStop(1, `rgba(255, 180, 100, 0)`);
  
  ctx.strokeStyle = lowerArcStrokeGrad;
  ctx.stroke();
}

function drawDiskUpperArc(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry, now: number): void {
  const R = bh.radius;
  const Rinner = R + 2; // 2px зазор — чёрная щель, «дыра дышит»
  const rx = R * DISK_RX_FACTOR;
  const beltHalf = R * DISK_BELT_HALF_THICKNESS_FACTOR;
  const sag = R * DISK_BELT_SAG_FACTOR;
  const Rup = R + R * DISK_UPPER_ARC_THICKNESS_FACTOR;
  const x1 = R * DISK_UPPER_ARC_FILLET_START_FACTOR;
  const x2 = R * DISK_UPPER_ARC_FILLET_END_FACTOR;
  const halfSpan = x2;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const n = isMobile ? Math.floor(DISK_CONTOUR_POINT_COUNT / 2) : DISK_CONTOUR_POINT_COUNT;
  const cos = Math.cos(DISK_TILT_RAD);
  const sin = Math.sin(DISK_TILT_RAD);

  const y1 = -Math.sqrt(Math.max(0, Rup * Rup - x1 * x1));
  const slope1 = x1 / Math.sqrt(Math.max(1e-6, Rup * Rup - x1 * x1));
  const beltAmplitude = sag - beltHalf; // амплитуда верхнего края пояса (обычно отрицательна)
  const beltTaper2 = Math.sqrt(Math.max(0, 1 - (x2 * x2) / (rx * rx)));
  const y2 = beltAmplitude * beltTaper2;
  const slope2 = beltTaper2 > 1e-6 ? (-beltAmplitude * x2) / (rx * rx * beltTaper2) : 0;
  const dx = x2 - x1;
  const m0 = slope1 * dx;
  const m1 = slope2 * dx;

  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = -halfSpan + (2 * halfSpan * i) / n;
    const absX = Math.abs(x);
    let y: number;
    if (absX <= x1) {
      y = -Math.sqrt(Math.max(0, Rup * Rup - x * x));
    } else if (absX >= x2) {
      y = beltCenterlineY(x, rx, sag) - beltHalfThicknessAt(x, rx, beltHalf);
    } else {
      y = hermiteBlend(y1, m0, y2, m1, (absX - x1) / dx);
    }
    const disp = getEdgeDisplacement(x, rx, R, now, -1, 2000);
    const finalX = x + disp.dx;
    const finalY = y + disp.dy;
    
    const px = bh.x + finalX * cos - finalY * sin;
    const py = bh.y + finalX * sin + finalY * cos;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  for (let i = n; i >= 0; i--) {
    const x = -halfSpan + (2 * halfSpan * i) / n;
    const jInnerDisp = getEdgeDisplacement(x, rx, R, now, -1, 3000);
    const y = -Math.sqrt(Math.max(0, Rinner * Rinner - x * x)) + jInnerDisp.dy * 0.15; // Just a tiny wobble
    const px = bh.x + x * cos - y * sin;
    const py = bh.y + x * sin + y * cos;
    ctx.lineTo(px, py);
  }
  ctx.closePath();

  const rEnd = halfSpan;
  const upperArcGrad = ctx.createRadialGradient(bh.x, bh.y, Rinner, bh.x, bh.y, rEnd);
  
  const midStop = Math.max(0, Math.min(1, (Rup - Rinner) / (rEnd - Rinner)));
  
  upperArcGrad.addColorStop(0, DISK_UPPER_ARC_INNER_COLOR);
  upperArcGrad.addColorStop(midStop, DISK_UPPER_ARC_OUTER_COLOR); // Сохраняем объем
  upperArcGrad.addColorStop(1, `rgba(160, 82, 45, 0)`); // Плавно уходит в 100% прозрачность к концу сплайна
  
  ctx.fillStyle = upperArcGrad;
  ctx.fill();

  applyDopplerGlow(ctx, bh, rx, now);

  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = -halfSpan + (2 * halfSpan * i) / n;
    const absX = Math.abs(x);
    let y: number;
    if (absX <= x1) {
      y = -Math.sqrt(Math.max(0, Rup * Rup - x * x));
    } else if (absX >= x2) {
      y = beltCenterlineY(x, rx, sag) - beltHalfThicknessAt(x, rx, beltHalf);
    } else {
      y = hermiteBlend(y1, m0, y2, m1, (absX - x1) / dx);
    }
    const disp = getEdgeDisplacement(x, rx, R, now, -1, 12000);
    const finalX = x + disp.dx;
    const finalY = y + disp.dy;
    const px = bh.x + finalX * cos - finalY * sin;
    const py = bh.y + finalX * sin + finalY * cos;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.lineWidth = 3;
  const alphaStroke = Math.max(0, 0.07 + 0.77 * Math.sin(now * 0.096)).toFixed(2);
  
  const arcStrokeGrad = ctx.createLinearGradient(
    bh.x - halfSpan * cos, bh.y - halfSpan * sin,
    bh.x + halfSpan * cos, bh.y + halfSpan * sin
  );
  
  const tLeftEnd = 0;
  const tLeftStart = (halfSpan - x1) / (2 * halfSpan);
  const tRightStart = (halfSpan + x1) / (2 * halfSpan);
  const tRightEnd = 1;
  
  arcStrokeGrad.addColorStop(tLeftEnd, `rgba(255, 180, 100, 0)`);
  arcStrokeGrad.addColorStop(tLeftStart, `rgba(255, 180, 100, ${alphaStroke})`);
  arcStrokeGrad.addColorStop(tRightStart, `rgba(255, 180, 100, ${alphaStroke})`);
  arcStrokeGrad.addColorStop(tRightEnd, `rgba(255, 180, 100, 0)`);
  
  ctx.strokeStyle = arcStrokeGrad;
  ctx.stroke();
}

function drawDiskBelt(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry, now: number): void {
  const rx = bh.radius * DISK_RX_FACTOR;
  const beltHalf = bh.radius * DISK_BELT_HALF_THICKNESS_FACTOR;
  const sag = bh.radius * DISK_BELT_SAG_FACTOR;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const n = isMobile ? Math.floor(DISK_CONTOUR_POINT_COUNT / 2) : DISK_CONTOUR_POINT_COUNT;
  const cos = Math.cos(DISK_TILT_RAD);
  const sin = Math.sin(DISK_TILT_RAD);

  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = -rx + (2 * rx * i) / n;
    const disp = getEdgeDisplacement(x, rx, bh.radius, now, -1, 4000);
    const finalX = x + disp.dx;
    const finalY = (beltCenterlineY(x, rx, sag) - beltHalfThicknessAt(x, rx, beltHalf)) + disp.dy;
    const px = bh.x + finalX * cos - finalY * sin;
    const py = bh.y + finalX * sin + finalY * cos;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  for (let i = n; i >= 0; i--) {
    const x = -rx + (2 * rx * i) / n;
    const disp = getEdgeDisplacement(x, rx, bh.radius, now, 1, 5000);
    const finalX = x + disp.dx;
    const finalY = (beltCenterlineY(x, rx, sag) + beltHalfThicknessAt(x, rx, beltHalf)) + disp.dy;
    const px = bh.x + finalX * cos - finalY * sin;
    const py = bh.y + finalX * sin + finalY * cos;
    ctx.lineTo(px, py);
  }
  ctx.closePath();

  const beltGrad = ctx.createLinearGradient(
    bh.x - rx * cos, bh.y - rx * sin, 
    bh.x + rx * cos, bh.y + rx * sin
  );
  beltGrad.addColorStop(0, 'rgba(139, 69, 19, 0)');     // Прозрачный кончик
  beltGrad.addColorStop(0.03, DISK_BELT_EDGE_COLOR);    // Основной цвет края
  beltGrad.addColorStop(0.5, DISK_BELT_CENTER_COLOR);
  beltGrad.addColorStop(0.97, DISK_BELT_EDGE_COLOR);    // Основной цвет края
  beltGrad.addColorStop(1, 'rgba(139, 69, 19, 0)');     // Прозрачный кончик
  
  ctx.fillStyle = beltGrad;
  ctx.fill();

  applyDopplerGlow(ctx, bh, rx, now);

  ctx.beginPath();
  
  for (let i = 0; i <= n; i++) {
    const x = -rx + (2 * rx * i) / n;
    const t = x / rx;
    const exponent = 2.5 - 1.5 * Math.pow(t, 2);
    const halfW = 1.5 * Math.pow(Math.cos(t * Math.PI / 2), exponent);
    const disp = getEdgeDisplacement(x, rx, bh.radius, now, -1, 14000);
    const finalX = x + disp.dx;
    const finalY = (beltCenterlineY(x, rx, sag) - beltHalfThicknessAt(x, rx, beltHalf)) + disp.dy - halfW;
    const px = bh.x + finalX * cos - finalY * sin;
    const py = bh.y + finalX * sin + finalY * cos;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  for (let i = n; i >= 0; i--) {
    const x = -rx + (2 * rx * i) / n;
    const t = x / rx;
    const exponent = 2.5 - 1.5 * Math.pow(t, 2);
    const halfW = 1.5 * Math.pow(Math.cos(t * Math.PI / 2), exponent);
    const disp = getEdgeDisplacement(x, rx, bh.radius, now, 1, 15000);
    const finalX = x + disp.dx;
    const finalY = (beltCenterlineY(x, rx, sag) + beltHalfThicknessAt(x, rx, beltHalf)) + disp.dy + halfW;
    const px = bh.x + finalX * cos - finalY * sin;
    const py = bh.y + finalX * sin + finalY * cos;
    ctx.lineTo(px, py);
  }
  for (let i = 0; i <= n; i++) {
    const x = -rx + (2 * rx * i) / n;
    const t = x / rx;
    const exponent = 2.5 - 1.5 * Math.pow(t, 2);
    const halfW = 1.5 * Math.pow(Math.cos(t * Math.PI / 2), exponent);
    const disp = getEdgeDisplacement(x, rx, bh.radius, now, 1, 15000);
    const finalX = x + disp.dx;
    const finalY = (beltCenterlineY(x, rx, sag) + beltHalfThicknessAt(x, rx, beltHalf)) + disp.dy - halfW;
    const px = bh.x + finalX * cos - finalY * sin;
    const py = bh.y + finalX * sin + finalY * cos;
    ctx.lineTo(px, py);
  }
  for (let i = n; i >= 0; i--) {
    const x = -rx + (2 * rx * i) / n;
    const t = x / rx;
    const exponent = 2.5 - 1.5 * Math.pow(t, 2);
    const halfW = 1.5 * Math.pow(Math.cos(t * Math.PI / 2), exponent);
    const disp = getEdgeDisplacement(x, rx, bh.radius, now, -1, 14000);
    const finalX = x + disp.dx;
    const finalY = (beltCenterlineY(x, rx, sag) - beltHalfThicknessAt(x, rx, beltHalf)) + disp.dy + halfW;
    const px = bh.x + finalX * cos - finalY * sin;
    const py = bh.y + finalX * sin + finalY * cos;
    ctx.lineTo(px, py);
  }
  
  ctx.closePath();
  ctx.fillStyle = `rgba(255, 180, 100, ${Math.max(0, 0.07 + 0.77 * Math.sin(now * 0.106)).toFixed(2)})`;
  ctx.fill();
}

function drawPhotonRing(ctx: CanvasRenderingContext2D, bh: BlackHoleGeometry, now: number): void {
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
    const t = (1 - Math.cos(aMid)) / 2;
    ctx.lineWidth = PHOTON_RING_MIN_LINE_WIDTH + (PHOTON_RING_LINE_WIDTH - PHOTON_RING_MIN_LINE_WIDTH) * t;
    
    const flicker = Math.sin(aMid * 3 + now * 0.015) * 0.5 + Math.sin(aMid * 7 - now * 0.02) * 0.5;
    const baseAlpha = 0.3 + 0.7 * t;
    ctx.globalAlpha = Math.max(0, Math.min(1, baseAlpha * (1 + 0.3 * flicker))); // +/- 30% jitter
    
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const CURSOR_BASE_RADIUS = 3; // px — базовый размер синтетического «курсора» на канвасе
const CURSOR_ALPHA = 0.85;

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

  if (isInsideBlackHoleDisk(cursorPos.x, cursorPos.y, blackHole.x, blackHole.y, blackHole.radius)) {
    return;
  }

  const lensing = computeLensing(
    cursorPos.x, cursorPos.y, blackHole.x, blackHole.y, blackHole.radius, CURSOR_RESISTANCE_POWER,
  );
  if (lensing.mode === 'ring') {
    const angle = Math.atan2(cursorPos.y - blackHole.y, cursorPos.x - blackHole.x);
    drawOrbitArc(ctx, blackHole, lensing.ringRadius, angle, lensing.ringSpanFraction, CURSOR_ALPHA);
    return;
  }

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

  if (!driftPosRef.current) {
    driftPosRef.current = { x: real.x, y: real.y };
  }

  const pos = driftPosRef.current;

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
  if (isInsideBlackHoleDisk(next.x, next.y, blackHole.x, blackHole.y, blackHole.radius)) {
    driftVelRef.current = { x: 0, y: 0 };
  }
  driftPosRef.current = next;
  return next;
}

// Обёртка над чистой resolveBlackHoleGeometry (utils/blackHoleGeometry.ts,
// §4.4 ТЗ docs/layout-overhaul/spec.md, Шаг 5): решает, ЕСТЬ ли вообще ЧД на
// этой странице (getBlackHole()) и её X-ratio (десктоп/мобильный — оставлено
// дискретным, см. комментарий у MOBILE_BREAKPOINT_PX в constants/blackHole.ts),
// затем делегирует Y/радиус чистой clamp-модели.
function getCurrentBlackHoleGeometry(w: number, h: number, safeAreaBottomPx: number): BlackHoleGeometry | null {
  const pos = getBlackHole();
  if (!pos) return null;
  const isMobile = w < MOBILE_BREAKPOINT_PX;
  const xRatio = isMobile ? BLACK_HOLE_POSITION_MOBILE_X_RATIO : pos.xRatio;
  const nebulaRadius = vortexNebulaRadiusPx(w, Math.hypot(w, h));
  const vortexClearancePx = nebulaRadius * BH_VORTEX_CLEARANCE_FACTOR;
  return resolveBlackHoleGeometry(w, h, xRatio, getMessageBottom(), safeAreaBottomPx, vortexClearancePx);
}

// env(safe-area-inset-bottom) нельзя прочитать напрямую из JS — нет такого
// API; стандартный приём — зонд-элемент с этим CSS-значением в стиле и чтение
// его РЕЗОЛВНУТОГО getComputedStyle (браузер сам подставляет px). Вызывается
// только в resize() (не per-frame) — создание/удаление узла раз на ресайз
// не влияет на производительность цикла отрисовки.
function readSafeAreaBottomPx(): number {
  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.bottom = '0';
  probe.style.paddingBottom = 'env(safe-area-inset-bottom)';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  const value = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  document.body.removeChild(probe);
  return value;
}


function randSoloMs():   number { return 20000  + (Math.random() * 20000 - 10000);  } // 20 ± 10 s
function randShowerMs(): number { return 120000 + (Math.random() * 60000 - 30000);  } // 120 ± 30 s

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


export function StarFieldCanvas() {
  const { theme } = useTheme();
  if (theme !== 'dark') return null;
  return <StarFieldCanvasInner />;
}


function StarFieldCanvasInner() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const starsRef     = useRef<Star[]>([]);
  const meteorsRef   = useRef<Meteor[]>([]);
  const specsRef     = useRef<ShowerSpec[]>([]);
  const rafRef       = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const hiddenTimeOffsetRef = useRef(0);
  const nextSoloRef  = useRef<number>(0);
  const nextShwRef   = useRef<number>(0);
  const sizeRef      = useRef({ w: 0, h: 0 });
  const cursorPosRef    = useRef<{ x: number; y: number } | null>(null);
  const cursorHiddenRef = useRef(false);
  const driftPosRef        = useRef<{ x: number; y: number } | null>(null);
  const driftVelRef        = useRef({ x: 0, y: 0 });
  const lastMouseSampleRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastDriftTimeRef   = useRef(0);
  const safeAreaBottomRef  = useRef(0);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const canvas: HTMLCanvasElement = canvasEl;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    // w/h читаются из clientWidth/clientHeight (CSS-разметка, задана через
    // style height:'100dvh' в JSX ниже), НЕ из window.innerWidth/innerHeight
    // (§4.4 ТЗ, Шаг 5): канвас и ErrorPanel (h-[calc(100dvh-3.5rem)]) меряют
    // одну и ту же CSS-единицу — показ/скрытие адресной строки мобильного
    // браузера (меняющее фактическое значение dvh) двигает оба синхронно,
    // без явной подписки на visualViewport/pinch-zoom.
    function resize() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      sizeRef.current = { w, h };
      safeAreaBottomRef.current = readSafeAreaBottomPx();
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      const stars = generateStars(w, h);
      const bh = getCurrentBlackHoleGeometry(w, h, safeAreaBottomRef.current);
      const allStars = bh
        ? stars.concat(generateVortexCluster(bh, Math.hypot(w, h), w), generateSecondaryNebula(w, h))
        : stars;
      tagBlackHoleDistance(allStars, bh);
      starsRef.current = allStars;
    }

    resize();

    const t0 = performance.now();
    nextSoloRef.current = t0 + randSoloMs();
    nextShwRef.current  = t0 + randShowerMs();
    if (Math.abs(nextSoloRef.current - nextShwRef.current) < 8000) {
      nextShwRef.current = nextSoloRef.current + 8000;
    }

    if (prefersReduced) {
      // Статический кадр — без RAF-цикла. Но геометрия ЧД зависит от
      // messageBottom (шрифты/i18n грузятся асинхронно, см. useBlackHole-
      // MessageAnchor) и от размера вьюпорта — без пересчёта reduced-motion
      // пользователь навсегда застрял бы с геометрией на момент mount, даже
      // после resize/поворота экрана. Один redraw на каждое из этих событий
      // (не per-frame) держит ЧД корректной, сохраняя allocation-free RAF-
      // отсутствие как таковое.
      let cancelled = false;

      function drawStatic() {
        if (cancelled) return;
        resize();
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { w, h } = sizeRef.current;
        ctx.clearRect(0, 0, w, h);
        drawStars(ctx, starsRef.current, 0, false, null);
        const bh = getCurrentBlackHoleGeometry(w, h, safeAreaBottomRef.current);
        if (bh) {
          drawBlackHole(ctx, bh);
          drawDiskLowerArc(ctx, bh, 0);
          drawDiskUpperArc(ctx, bh, 0);
          drawDiskBelt(ctx, bh, 0);
          drawPhotonRing(ctx, bh, 0);
        }
      }

      drawStatic();
      window.addEventListener('orientationchange', drawStatic);
      i18n.on('languageChanged', drawStatic);
      document.fonts?.ready?.then(drawStatic);

      const roStatic = new ResizeObserver(drawStatic);
      roStatic.observe(canvas);

      return () => {
        cancelled = true;
        window.removeEventListener('orientationchange', drawStatic);
        i18n.off('languageChanged', drawStatic);
        roStatic.disconnect();
      };
    }

    function onMouseMove(e: MouseEvent) {
      const now = performance.now();
      const prevSample = lastMouseSampleRef.current;
      cursorPosRef.current = { x: e.clientX, y: e.clientY };
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

    function loop(now: number) {
      rafRef.current = requestAnimationFrame(loop);

      const { w, h } = sizeRef.current;
      const blackHole = getCurrentBlackHoleGeometry(w, h, safeAreaBottomRef.current);
      const hasMeteors = meteorsRef.current.length > 0 || specsRef.current.length > 0;
      const targetMs = (hasMeteors || blackHole) ? MTR_FRAME_MS : STAR_FRAME_MS;
      const frameGapMs = now - lastFrameRef.current;
      if (frameGapMs < targetMs) return;
      lastFrameRef.current = now;

      if (frameGapMs > RESUME_GAP_MS) {
        hiddenTimeOffsetRef.current += frameGapMs - targetMs;
      }
      const rotationNow = now - hiddenTimeOffsetRef.current;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, w, h);
      drawStars(ctx, starsRef.current, rotationNow, true, blackHole);

      if (now >= nextSoloRef.current && meteorsRef.current.length < MAX_METEORS) {
        const angle = (60 + Math.random() * 30) * (Math.PI / 180);
        meteorsRef.current.push(spawnMeteor(w, h, angle, Math.random() < 0.5 ? 1 : -1, now));
        nextSoloRef.current = now + randSoloMs();
        if (Math.abs(nextSoloRef.current - nextShwRef.current) < 8000) {
          nextShwRef.current = nextSoloRef.current + 8000;
        }
      }

      if (specsRef.current.length === 0 && now >= nextShwRef.current) {
        const maxClusters = frameGapMs > RESUME_GAP_MS ? SHOWER_CATCHUP_MAX_CLUSTERS : SHOWER_MAX_CLUSTERS;
        specsRef.current = buildShowerSpecs(now, maxClusters);
        nextShwRef.current = now + randShowerMs();
        if (Math.abs(nextShwRef.current - nextSoloRef.current) < 8000) {
          nextSoloRef.current = nextShwRef.current + 8000;
        }
      }

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

      if (meteorsRef.current.length > 0) {
        meteorsRef.current = drawAndFilterMeteors(ctx, meteorsRef.current, now, blackHole);
      }

      if (blackHole) {
        drawBlackHole(ctx, blackHole);
        drawDiskLowerArc(ctx, blackHole, rotationNow);
        drawDiskUpperArc(ctx, blackHole, rotationNow);
        drawDiskBelt(ctx, blackHole, rotationNow);
        drawPhotonRing(ctx, blackHole, rotationNow);
      }

      const rawDriftDtSeconds = lastDriftTimeRef.current ? (now - lastDriftTimeRef.current) / 1000 : 0;
      const driftDtSeconds = Math.min(rawDriftDtSeconds, MAX_DRIFT_DT_SECONDS);
      lastDriftTimeRef.current = now;
      const effectiveCursorPos = updateCursorDrift(
        cursorPosRef.current, blackHole, driftDtSeconds, driftPosRef, driftVelRef,
      );
      renderCursorLensing(ctx, blackHole, effectiveCursorPos, cursorHiddenRef);
    }

    rafRef.current = requestAnimationFrame(loop);

    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
      } else {
        rafRef.current = requestAnimationFrame(loop);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    // ResizeObserver на канвасе (не document.body, §4.4 ТЗ Шаг 5) — ловит
    // изменение фактического 100dvh (показ/скрытие адресной строки) точно
    // так же, как ловит изменение ширины при повороте/ресайзе окна.
    // orientationchange — подстраховка: некоторые мобильные браузеры не
    // всегда синхронно триггерят ResizeObserver сразу на смену ориентации.
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener('orientationchange', resize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('orientationchange', resize);
      ro.disconnect();
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
        // dvh/vw (не 100%, §4.4 ТЗ Шаг 5) — CSS, а не JS, владеет размером;
        // resize() читает обратно canvas.clientWidth/clientHeight, поэтому
        // канвас и ErrorPanel (тоже на 100dvh) всегда синхронны.
        width: '100vw',
        height: '100dvh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
