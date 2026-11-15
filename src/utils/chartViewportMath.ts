import { PsiRun } from '../types/psi';

export interface AxisDomain {
  min: number;
  max: number;
}

export type AxisLockMode = 'xy' | 'x' | 'y';

export interface NiceTicksResult {
  ticks: number[];
  labels: string[];
  step: number;
  decimals: number;
}

export interface AdaptiveMarkerStyle {
  radius: number;
  activeRadius: number;
  haloWidth: number;
  fillOpacity: number;
  dimOpacity: number;
  showLabels: boolean;
}

export interface ScreenPointCandidate<T> {
  item: T;
  sx: number;
  sy: number;
}

/**
 * Clamp and normalize a numeric domain so min < max cleanly.
 */
export function normalizeDomain(min: number, max: number): AxisDomain {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (Math.abs(max - min) < 1e-9) {
    const pad = Math.max(0.5, Math.abs(min) * 0.1 || 1);
    return { min: min - pad, max: max + pad };
  }
  return min < max ? { min, max } : { min: max, max: min };
}

/**
 * Zoom a numeric domain mathematically around an anchor value (such as pointer data coordinate).
 */
export function zoomDomainAroundValue(
  current: AxisDomain,
  anchorValue: number,
  zoomScaleFactor: number,
  base: AxisDomain,
  minSpanRatio = 0.005,
  maxSpanRatio = 2.0
): AxisDomain {
  const normBase = normalizeDomain(base.min, base.max);
  const normCur = normalizeDomain(current.min, current.max);
  const baseSpan = normBase.max - normBase.min;
  const curSpan = normCur.max - normCur.min;

  const minSpan = baseSpan * minSpanRatio;
  const maxSpan = baseSpan * maxSpanRatio;
  let nextSpan = curSpan * zoomScaleFactor;
  if (nextSpan < minSpan) nextSpan = minSpan;
  if (nextSpan > maxSpan) nextSpan = maxSpan;

  // Snap cleanly back onto exact 100% bounds when zooming out across 1.0x
  const curZoomRatio = baseSpan / curSpan;
  const nextZoomRatio = baseSpan / nextSpan;
  if (
    zoomScaleFactor > 1 &&
    curZoomRatio > 1.03 &&
    nextZoomRatio <= 1.04 &&
    nextZoomRatio >= 0.82
  ) {
    return { min: normBase.min, max: normBase.max };
  }

  const u = Math.max(0, Math.min(1, (anchorValue - normCur.min) / curSpan));
  let newMin = anchorValue - u * nextSpan;
  let newMax = newMin + nextSpan;

  // Keep domain near the dataset envelope with gentle overscroll allowance
  const overscroll = baseSpan * 0.25;
  const hardMin = normBase.min - overscroll;
  const hardMax = normBase.max + overscroll;

  if (newMin < hardMin) {
    newMin = hardMin;
    newMax = newMin + nextSpan;
  }
  if (newMax > hardMax) {
    newMax = hardMax;
    newMin = Math.max(hardMin, newMax - nextSpan);
  }

  return { min: newMin, max: newMax };
}

/**
 * Pan a numeric domain mathematically by screen pixel delta while preserving current zoom span.
 */
export function panDomainByPixels(
  current: AxisDomain,
  deltaPx: number,
  plotSpanPx: number,
  base: AxisDomain
): AxisDomain {
  if (plotSpanPx <= 1) return current;
  const normBase = normalizeDomain(base.min, base.max);
  const normCur = normalizeDomain(current.min, current.max);
  const baseSpan = normBase.max - normBase.min;
  const curSpan = normCur.max - normCur.min;

  const shift = -(deltaPx / plotSpanPx) * curSpan;
  const overscroll = baseSpan * 0.25;
  const hardMin = normBase.min - overscroll;
  const hardMax = normBase.max + overscroll;

  let newMin = normCur.min + shift;
  let newMax = newMin + curSpan;

  if (newMin < hardMin) {
    newMin = hardMin;
    newMax = newMin + curSpan;
  }
  if (newMax > hardMax) {
    newMax = hardMax;
    newMin = Math.max(hardMin, newMax - curSpan);
  }

  return { min: newMin, max: newMax };
}

function requiredDecimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2;
  for (let d = 0; d <= 4; d++) {
    const scaled = step * Math.pow(10, d);
    if (Math.abs(scaled - Math.round(scaled)) < 1e-4) {
      return d;
    }
  }
  return 4;
}

/**
 * Compute Desmos-style crisp numeric tick intervals and uniformly formatted precision labels.
 * Includes exact multipliers (e.g. 1.2 so [18, 24] -> 18.0, 19.2, 20.4, 21.6, 22.8, 24.0).
 */
export function computeDesmosTicks(
  minVal: number,
  maxVal: number,
  targetCount = 6,
  integerOnly = false
): NiceTicksResult {
  const { min, max } = normalizeDomain(minVal, maxVal);
  const span = max - min;
  const intervals = Math.max(2, targetCount - 1);
  const rawStep = span / intervals;

  const exp = Math.floor(Math.log10(rawStep));
  const pow10 = Math.pow(10, exp);
  const fraction = rawStep / pow10;

  const niceFactors = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  let chosen = 10;
  for (const f of niceFactors) {
    if (f + 1e-9 >= fraction) {
      chosen = f;
      break;
    }
  }
  let step = chosen * pow10;
  if (integerOnly && step < 1) {
    step = 1;
  }

  // Generate ticks cleanly across [min, max]
  let start = Math.ceil((min - step * 1e-6) / step) * step;
  const ticks: number[] = [];
  for (let i = 0; i < 24; i++) {
    const val = start + i * step;
    if (val > max + step * 1e-5) break;
    if (val >= min - step * 1e-5) {
      const cleaned = Math.abs(val) < step * 1e-9 ? 0 : val;
      ticks.push(cleaned);
    }
  }

  // Fallback if nice start skipped endpoints too narrowly
  if (ticks.length < 2) {
    const fallbackStep = span / intervals;
    const fbTicks = Array.from({ length: intervals + 1 }, (_, idx) => {
      const v = min + idx * fallbackStep;
      return Math.abs(v) < fallbackStep * 1e-9 ? 0 : v;
    });
    const decimals = integerOnly ? 0 : requiredDecimalsForStep(fallbackStep);
    return {
      ticks: fbTicks,
      labels: fbTicks.map((v) => v.toFixed(decimals)),
      step: fallbackStep,
      decimals,
    };
  }

  const decimals = integerOnly
    ? 0
    : Math.max(
        requiredDecimalsForStep(step),
        ...ticks.map((t) => requiredDecimalsForStep(Math.abs(t)))
      );
  const cappedDecimals = Math.min(4, Math.max(0, decimals));

  return {
    ticks,
    labels: ticks.map((v) => Number(v.toFixed(cappedDecimals)).toFixed(cappedDecimals)),
    step,
    decimals: cappedDecimals,
  };
}

/**
 * Compute zoom magnification ratio and user-facing toolbar readout string.
 */
export function computeZoomReadout(
  baseX: AxisDomain,
  curX: AxisDomain,
  baseY: AxisDomain,
  curY: AxisDomain,
  lockMode: AxisLockMode
): { zoomRatio: number; isZoomed: boolean; isModified: boolean; label: string } {
  const bxSpan = Math.max(1e-9, baseX.max - baseX.min);
  const cxSpan = Math.max(1e-9, curX.max - curX.min);
  const bySpan = Math.max(1e-9, baseY.max - baseY.min);
  const cySpan = Math.max(1e-9, curY.max - curY.min);

  const rx = bxSpan / cxSpan;
  const ry = bySpan / cySpan;

  let zoomRatio = rx;
  if (lockMode === 'y') {
    zoomRatio = ry;
  } else if (lockMode === 'xy') {
    if (Math.abs(rx - 1) > 0.03 && Math.abs(ry - 1) <= 0.03) {
      zoomRatio = rx;
    } else if (Math.abs(ry - 1) > 0.03 && Math.abs(rx - 1) <= 0.03) {
      zoomRatio = ry;
    } else {
      zoomRatio = Math.sqrt(rx * ry);
    }
  }

  const isZoomed = Math.abs(rx - 1) > 0.025 || Math.abs(ry - 1) > 0.025;
  const isPanned =
    Math.abs(curX.min - baseX.min) > bxSpan * 0.008 ||
    Math.abs(curY.min - baseY.min) > bySpan * 0.008;
  const isModified = isZoomed || isPanned;

  let label = '100%';
  if (isZoomed) {
    label = `${zoomRatio.toFixed(1)}x · Zoomed`;
  } else if (isPanned) {
    label = '100% · Panned';
  }

  return { zoomRatio, isZoomed, isModified, label };
}

/**
 * Adapt point marker radius, translucency, halos, and Run ID visibility based on zoom level and point density.
 */
export function computeAdaptiveMarkerStyle(
  visiblePointCount: number,
  zoomLevel: number,
  baseRadius = 4.2
): AdaptiveMarkerStyle {
  const densityFactor =
    visiblePointCount <= 12
      ? 1.18
      : visiblePointCount <= 35
      ? 1.0
      : visiblePointCount <= 100
      ? 0.86
      : 0.74;

  const zoomBoost = Math.min(1.75, 1 + Math.max(0, zoomLevel - 1) * 0.24);
  const radius = Math.max(2.6, Math.min(7.5, baseRadius * densityFactor * zoomBoost));
  const activeRadius = radius + 2.4;

  const baseOpacity =
    visiblePointCount > 120
      ? 0.52
      : visiblePointCount > 45
      ? 0.64
      : visiblePointCount > 16
      ? 0.76
      : 0.88;
  const fillOpacity = Math.min(0.95, baseOpacity + Math.max(0, zoomLevel - 1) * 0.12);

  return {
    radius: Number(radius.toFixed(2)),
    activeRadius: Number(activeRadius.toFixed(2)),
    haloWidth: visiblePointCount > 80 ? 0.9 : 1.15,
    fillOpacity: Number(fillOpacity.toFixed(2)),
    dimOpacity: 0.22,
    showLabels: zoomLevel >= 1.85 || visiblePointCount <= 10,
  };
}

/**
 * Nearest-neighbor cursor snapping within a screen-pixel capture radius (default 16px).
 */
export function findNearestScreenPoint<T>(
  candidates: ScreenPointCandidate<T>[],
  mouseSx: number,
  mouseSy: number,
  maxRadiusPx = 16
): { item: T; distancePx: number } | null {
  let best: { item: T; distancePx: number } | null = null;
  let bestDistSq = maxRadiusPx * maxRadiusPx;

  for (const c of candidates) {
    const dx = c.sx - mouseSx;
    const dy = c.sy - mouseSy;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestDistSq) {
      bestDistSq = d2;
      best = { item: c.item, distancePx: Math.sqrt(d2) };
    }
  }

  return best;
}

/**
 * Format guaranteed-unique, human-readable legend labels across multiple runs from the same PSI investigation.
 * Example: "R-0412 · PSI-20 (21% O₂)" or "PSI-20 #2 · PMMA (34% O₂)"
 */
export function formatUniqueRunLegendMap(runs: PsiRun[]): Map<string, string> {
  const result = new Map<string, string>();
  const usedLabels = new Set<string>();

  const shortPsiCounts = new Map<string, number>();
  for (const r of runs) {
    const shortPsi = r.psiId.split(' ')[0] || r.psiId;
    shortPsiCounts.set(shortPsi, (shortPsiCounts.get(shortPsi) ?? 0) + 1);
  }

  const perPsiCounter = new Map<string, number>();
  for (const r of runs) {
    const shortPsi = r.psiId.split(' ')[0] || r.psiId;
    const idxForPsi = (perPsiCounter.get(shortPsi) ?? 0) + 1;
    perPsiCounter.set(shortPsi, idxForPsi);

    const hasDupPsi = (shortPsiCounts.get(shortPsi) ?? 1) > 1;
    const cleanCode = r.runCode?.trim();
    const o2Tag = `${r.O2_pct % 1 === 0 ? r.O2_pct.toFixed(0) : r.O2_pct.toFixed(1)}% O₂`;

    let candidate: string;
    if (cleanCode && cleanCode !== shortPsi && cleanCode !== r.psiId) {
      candidate = `${cleanCode} · ${shortPsi} (${o2Tag})`;
    } else if (hasDupPsi) {
      const matShort = r.material.split(/[\s(]/)[0];
      candidate = `${shortPsi} #${idxForPsi} · ${matShort} (${o2Tag})`;
    } else {
      candidate = `${shortPsi} (${o2Tag})`;
    }

    if (usedLabels.has(candidate)) {
      candidate = `${shortPsi} #${idxForPsi} · ${cleanCode || r.material.split(/[\s(]/)[0]} (${o2Tag})`;
    }
    let bump = 2;
    const baseCandidate = candidate;
    while (usedLabels.has(candidate)) {
      candidate = `${baseCandidate} [${bump++}]`;
    }
    usedLabels.add(candidate);
    result.set(r.id, candidate);
  }

  return result;
}
