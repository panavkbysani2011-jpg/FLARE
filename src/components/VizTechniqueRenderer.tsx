import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  ComposedChart,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  Cell,
  Legend,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';
import {
  HazardOutcome,
  PsiRun,
  SimulationResponse,
  ThemeMode,
  VizMode,
} from '../types/psi';
import {
  computeFlameSpreadVelocity,
  generateTimelineSeries,
} from '../utils/physicsEngine';
import {
  AxisVariableKey,
  CategoricalGroupKey,
  getAxisMeta,
  isNumericAxisKey,
  NumericAxisKey,
  STUDIO_NUMERIC_COLUMNS,
} from '../utils/vizRegistry';
import {
  AxisDomain,
  computeAdaptiveMarkerStyle,
  findNearestScreenPoint,
  formatUniqueRunLegendMap,
  ScreenPointCandidate,
} from '../utils/chartViewportMath';
import {
  InteractiveChartViewport,
  RunTelemetryGlassTooltip,
} from './InteractiveChartViewport';
import {
  InteractiveScatterPlot,
  ScatterPlotPoint,
} from './InteractiveScatterPlot';
import { ParallelCoordinatesPlot } from './ParallelCoordinatesPlot';

export interface VizTechniqueRendererProps {
  theme: ThemeMode;
  vizMode: VizMode;
  sliders: {
    O2_pct: number;
    P_psi: number;
    Flow_ms: number;
    g_eff: number;
    Thickness_mm: number;
  };
  simulation: SimulationResponse;
  activeRuns: PsiRun[];
  xAxisKey?: AxisVariableKey;
  yAxisKey?: NumericAxisKey;
  colorByKey?: CategoricalGroupKey;
  hoveredRunId: string | null;
  onHoverRun: (runId: string | null) => void;
  hoveredMaterialId: string | null;
  onHoverMaterial: (matCode: string | null) => void;
  onInspectRun: (runId: string) => void;
  onChangeSlider: (
    key: 'O2_pct' | 'P_psi' | 'Flow_ms' | 'g_eff' | 'Thickness_mm',
    value: number
  ) => void;
  caveatNote?: string;
}

const RUN_COLORS = ['#10B981', '#F59E0B', '#64748B', '#EF4444'];
const CATEGORY_PALETTE = ['#10B981', '#F59E0B', '#EF4444', '#64748B', '#18181B', '#71717A'];

function outcomeColor(outcome: HazardOutcome): string {
  if (outcome === 'Rapid Flame Spread') return '#EF4444';
  if (outcome === 'Cool Flame Caution') return '#F59E0B';
  return '#10B981';
}

function getGroupColor(
  run: PsiRun,
  colorByKey: CategoricalGroupKey,
  groupIndexMap: Map<string, number>,
  isDark: boolean
): string {
  if (colorByKey === 'outcome') {
    return outcomeColor(run.outcome);
  }
  const keyVal = String(run[colorByKey]);
  const idx = groupIndexMap.get(keyVal) ?? 0;
  const col = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];
  return col === '#18181B' && isDark ? '#FAFAFA' : col;
}

function getSimParamValue(
  key: NumericAxisKey,
  sliders: VizTechniqueRendererProps['sliders'],
  simulation: SimulationResponse
): number {
  switch (key) {
    case 'O2_pct':
      return sliders.O2_pct;
    case 'P_psi':
      return sliders.P_psi;
    case 'Flow_ms':
      return sliders.Flow_ms;
    case 'g_eff':
      return sliders.g_eff;
    case 'Thickness_mm':
      return sliders.Thickness_mm;
    case 'flameSpread_mms':
      return simulation.flameSpread_mms;
    case 'peakTemp_K':
      return simulation.peakTemp_K;
    case 'radiometerFlux_Wm2':
      return Math.round(simulation.peakTemp_K * 11.5);
  }
}

function getAxisDomain(key: NumericAxisKey): [number, number] {
  const meta = STUDIO_NUMERIC_COLUMNS.find((c) => c.key === key);
  return [meta?.min ?? 0, meta?.max ?? 100];
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

interface FloatingGlassTooltipData {
  title: string;
  subtitle?: string;
  metrics: Array<{ label: string; value: string }>;
  status?: string;
}

const EChartsCanvas: React.FC<{
  option: echarts.EChartsOption;
  height?: number;
  ariaLabel: string;
}> = ({ option, height = 310, ariaLabel }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const instance = echarts.init(el, undefined, { renderer: 'svg' });
    chartRef.current = instance;

    const observer = new ResizeObserver(() => {
      instance.resize();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      instance.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.setOption(option, true);
    }
  }, [option]);

  return (
    <div
      ref={containerRef}
      style={{ height: `${height}px`, width: '100%' }}
      role="img"
      aria-label={ariaLabel}
    />
  );
};

export const VizTechniqueRenderer: React.FC<VizTechniqueRendererProps> = ({
  theme,
  vizMode,
  sliders,
  simulation,
  activeRuns,
  xAxisKey = 'O2_pct',
  yAxisKey = 'flameSpread_mms',
  colorByKey = 'outcome',
  hoveredRunId,
  onHoverRun,
  hoveredMaterialId,
  onHoverMaterial,
  onInspectRun,
  onChangeSlider,
  caveatNote,
}) => {
  const isDark = theme === 'dark';
  const axisStroke = isDark ? '#A1A1AA' : '#52525B';
  const gridStroke = isDark ? 'rgba(255,255,255,0.08)' : '#E4E4E7';
  const monoBg = isDark ? '#09090B' : '#FAFAFA';
  const borderCol = isDark ? '#27272A' : '#E4E4E7';
  const textPrimary = isDark ? '#FAFAFA' : '#18181B';

  const [glassTooltip, setGlassTooltip] =
    useState<FloatingGlassTooltipData | null>(null);
  const [hoveredTimelineIdx, setHoveredTimelineIdx] = useState<number | null>(
    null
  );
  const [materialSort, setMaterialSort] = useState<{
    key: 'flameSpread_mms' | 'limitingO2_pct';
    dir: 'asc' | 'desc';
  }>({ key: 'flameSpread_mms', dir: 'desc' });
  const [snappedHeatmapRun, setSnappedHeatmapRun] = useState<PsiRun | null>(null);
  const heatmapSvgRef = useRef<SVGSVGElement | null>(null);
  const heatmapClipId = `hm-${vizMode}-${xAxisKey}-${yAxisKey}`.replace(/[^a-zA-Z0-9_-]/g, '');

  const resetKey = `${vizMode}|${xAxisKey}|${yAxisKey}|${colorByKey}|${activeRuns.length}`;

  const numericX: NumericAxisKey = isNumericAxisKey(xAxisKey)
    ? xAxisKey
    : vizMode === 'contour-surface'
    ? 'P_psi'
    : 'O2_pct';
  const numericY: NumericAxisKey = yAxisKey;

  const groupValues = useMemo(() => {
    const vals = Array.from(
      new Set(activeRuns.map((r) => String(r[colorByKey])))
    );
    return vals.slice(0, 8);
  }, [activeRuns, colorByKey]);

  const groupIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    groupValues.forEach((v, i) => m.set(v, i));
    return m;
  }, [groupValues]);

  // Frosted Glass Tooltip Renderer for Recharts (backdrop-blur-md + tabular-nums)
  const renderCustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{
      name?: string;
      value?: number | string;
      color?: string;
      payload?: Record<string, unknown>;
    }>;
    label?: string | number;
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    const raw = payload[0]?.payload;
    const title =
      (raw?.psiId as string) ||
      (raw?.name as string) ||
      (label !== undefined ? String(label) : 'Telemetry Point');
    const subtitle = raw?.material
      ? `${String(raw.material)} · ${String(raw.facility ?? '')}`
      : raw?.phaseLabel
      ? String(raw.phaseLabel)
      : undefined;

    return (
      <div
        className={`px-3 py-2 rounded-lg border backdrop-blur-xl shadow-xl text-xs ${
          isDark
            ? 'bg-[#121216]/95 border-[#27272A] text-[#FAFAFA]'
            : 'bg-white/95 border-[#E4E4E7] text-[#18181B]'
        }`}
      >
        <div className="font-sans font-semibold text-xs">{title}</div>
        {subtitle && (
          <div className="font-sans text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {subtitle}
          </div>
        )}
        <div className="mt-1.5 space-y-0.5 font-mono tabular-nums text-[11px]">
          {payload.map((entry, idx) => (
            <div key={idx} className="flex items-center justify-between gap-4">
              <span className="font-sans text-zinc-500 dark:text-zinc-400">
                {entry.name}:
              </span>
              <span
                className="font-semibold"
                style={{ color: entry.color || textPrimary }}
              >
                {typeof entry.value === 'number'
                  ? Number.isInteger(entry.value)
                    ? entry.value
                    : entry.value.toFixed(2)
                  : String(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Dynamic Zoomable Histogram builder (re-bins live inside zoomed [xMin, xMax] domain)
  const histogramMetric: NumericAxisKey = isNumericAxisKey(xAxisKey)
    ? xAxisKey
    : numericY;
  const histogramBaseBounds = useMemo(() => {
    const values = activeRuns.map((r) => r[histogramMetric]);
    const simVal = getSimParamValue(histogramMetric, sliders, simulation);
    if (values.length === 0) {
      const [dMin, dMax] = getAxisDomain(histogramMetric);
      return {
        xDomain: { min: dMin, max: dMax },
        maxCount: 4,
      };
    }
    const minV = Math.min(...values, simVal);
    const maxV = Math.max(...values, simVal);
    const pad = Math.max((maxV - minV) * 0.04, 0.05);
    const binCount = Math.min(9, Math.max(4, Math.ceil(Math.log2(values.length) + 1)));
    const span = Math.max(maxV - minV, 0.05);
    const step = span / binCount;
    let peak = 1;
    for (let idx = 0; idx < binCount; idx++) {
      const s = minV + idx * step;
      const e = idx === binCount - 1 ? maxV + 0.0001 : minV + (idx + 1) * step;
      const cnt = activeRuns.filter((r) => {
        const v = r[histogramMetric];
        return idx === binCount - 1 ? v >= s && v <= e : v >= s && v < e;
      }).length;
      if (cnt > peak) peak = cnt;
    }
    return {
      xDomain: { min: minV - pad * 0.25, max: maxV + pad * 0.25 },
      maxCount: Math.max(2, Math.ceil(peak * 1.15)),
    };
  }, [activeRuns, histogramMetric, sliders, simulation]);

  const computeHistogramSlice = (xDom: AxisDomain, yDom: AxisDomain) => {
    const paramMeta =
      STUDIO_NUMERIC_COLUMNS.find((p) => p.key === histogramMetric) ??
      STUDIO_NUMERIC_COLUMNS[7];
    const simVal = getSimParamValue(histogramMetric, sliders, simulation);
    const inWindow = activeRuns.filter(
      (r) => r[histogramMetric] >= xDom.min - 1e-6 && r[histogramMetric] <= xDom.max + 1e-6
    );
    const values = inWindow.map((r) => r[histogramMetric]);
    const span = Math.max(xDom.max - xDom.min, 0.02);
    const binCount = Math.min(10, Math.max(4, Math.ceil(Math.log2(Math.max(4, values.length)) + 1)));
    const step = span / binCount;
    const dec = step < 0.1 ? 3 : step < 1.0 ? 2 : 1;

    const bins = Array.from({ length: binCount }, (_, idx) => {
      const start = xDom.min + idx * step;
      const end =
        idx === binCount - 1 ? xDom.max + 0.0001 : xDom.min + (idx + 1) * step;
      const matchedRuns = inWindow.filter((r) => {
        const val = r[histogramMetric];
        return idx === binCount - 1
          ? val >= start && val <= end
          : val >= start && val < end;
      });
      return {
        label: `${start.toFixed(dec)}–${(xDom.min + (idx + 1) * step).toFixed(dec)}`,
        count: matchedRuns.length,
        runs: matchedRuns.map((r) => r.psiId),
        hasSim:
          idx === binCount - 1
            ? simVal >= start && simVal <= end
            : simVal >= start && simVal < end,
      };
    });

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : simVal;
    const median = values.length > 0 ? quantile(sorted, 0.5) : simVal;

    const option: echarts.EChartsOption = {
      animationDuration: 180,
      grid: { top: 36, right: 24, bottom: 48, left: 50 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: isDark
          ? 'rgba(24, 24, 27, 0.9)'
          : 'rgba(255, 255, 255, 0.94)',
        borderColor: borderCol,
        textStyle: {
          color: textPrimary,
          fontFamily: 'Inter, sans-serif',
          fontSize: 11,
        },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const first = arr[0] as { dataIndex?: number } | undefined;
          const idx = first?.dataIndex ?? 0;
          const bin = bins[idx];
          if (!bin) return '';
          const runList =
            bin.runs.length > 0
              ? bin.runs.slice(0, 5).join(', ') + (bin.runs.length > 5 ? '…' : '')
              : 'None';
          return [
            `<div style="font-family:Inter,sans-serif;font-weight:600;margin-bottom:4px;"><span style="font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;">${bin.label}</span> ${paramMeta.unit ?? ''}</div>`,
            `<div>Sample Count: <strong style="font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;">${bin.count}</strong></div>`,
            `<div>Active Virtual Point Bin: <strong>${bin.hasSim ? 'YES' : 'No'}</strong></div>`,
            `<div style="opacity:0.75;margin-top:3px;font-size:10px;">Runs: <span style="${bin.runs.length > 0 ? "font-family:'JetBrains Mono',monospace;" : ''}">${runList}</span></div>`,
          ].join('');
        },
      },
      xAxis: {
        type: 'category',
        data: bins.map((b) => b.label),
        axisLine: { lineStyle: { color: axisStroke } },
        axisLabel: {
          color: axisStroke,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
        },
        name: `${paramMeta.label} (${paramMeta.unit ?? ''})`,
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: {
          color: axisStroke,
          fontFamily: 'Inter, sans-serif',
          fontSize: 11,
          fontWeight: 600,
        },
      },
      yAxis: {
        type: 'value',
        min: Math.max(0, Math.floor(yDom.min)),
        max: Math.max(1, Math.ceil(yDom.max)),
        minInterval: 1,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: gridStroke, type: 'dashed' } },
        axisLabel: {
          color: axisStroke,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
        },
        name: 'Count',
        nameTextStyle: {
          color: axisStroke,
          fontFamily: 'Inter, sans-serif',
          fontSize: 11,
          fontWeight: 600,
        },
      },
      series: [
        {
          name: 'Frequency',
          type: 'bar',
          barMaxWidth: 48,
          data: bins.map((b) => ({
            value: b.count,
            itemStyle: {
              color: b.hasSim ? '#EF4444' : isDark ? '#D4D4D8' : '#27272A',
              borderRadius: [3, 3, 0, 0],
            },
          })),
          label: {
            show: true,
            position: 'top',
            color: textPrimary,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
          },
        },
      ],
    };

    return { bins, inWindowCount: inWindow.length, mean, median, paramMeta, simVal, option };
  };

  type ChamberInputKey = 'O2_pct' | 'P_psi' | 'Flow_ms' | 'g_eff' | 'Thickness_mm';
  const isChamberInputAxis = (k: NumericAxisKey): k is ChamberInputKey =>
    k === 'O2_pct' ||
    k === 'P_psi' ||
    k === 'Flow_ms' ||
    k === 'g_eff' ||
    k === 'Thickness_mm';

  const get2DGridBaseBounds = (xKey: NumericAxisKey, yKey: NumericAxisKey) => {
    const useEmpiricalGrid = !isChamberInputAxis(xKey) || !isChamberInputAxis(yKey);
    const [baseXMin, baseXMax] = getAxisDomain(xKey);
    const [baseYMin, baseYMax] = getAxisDomain(yKey);
    const simXForBounds = getSimParamValue(xKey, sliders, simulation);
    const simYForBounds = getSimParamValue(yKey, sliders, simulation);

    const xValues = useEmpiricalGrid
      ? [simXForBounds, ...activeRuns.map((r) => Number(r[xKey]))]
      : [baseXMin, baseXMax, simXForBounds];
    const yValues = useEmpiricalGrid
      ? [simYForBounds, ...activeRuns.map((r) => Number(r[yKey]))]
      : [baseYMin, baseYMax, simYForBounds];

    const rawXMin = Math.min(baseXMin, ...xValues);
    const rawXMax = Math.max(baseXMax, ...xValues);
    const rawYMin = Math.min(baseYMin, ...yValues);
    const rawYMax = Math.max(baseYMax, ...yValues);

    return {
      useEmpiricalGrid,
      xDomain: { min: rawXMin, max: rawXMax > rawXMin ? rawXMax : rawXMin + 1 },
      yDomain: { min: rawYMin, max: rawYMax > rawYMin ? rawYMax : rawYMin + 1 },
    };
  };

  // 2D Grid Generator supporting live zoomed [xDomain, yDomain] mathematical recomputation
  const build2DPhysicsGrid = (
    xKey: NumericAxisKey,
    yKey: NumericAxisKey,
    cols = 24,
    rows = 14,
    overrideX?: AxisDomain,
    overrideY?: AxisDomain
  ) => {
    const resolvedXKey: NumericAxisKey = xKey;
    const resolvedYKey: NumericAxisKey = yKey;
    const bounds = get2DGridBaseBounds(resolvedXKey, resolvedYKey);
    const useEmpiricalGrid = bounds.useEmpiricalGrid;
    const effXMin = overrideX ? overrideX.min : bounds.xDomain.min;
    const effXMax = overrideX ? overrideX.max : bounds.xDomain.max;
    const effYMin = overrideY ? overrideY.min : bounds.yDomain.min;
    const effYMax = overrideY ? overrideY.max : bounds.yDomain.max;

    const xMeta = getAxisMeta(resolvedXKey);
    const yMeta = getAxisMeta(resolvedYKey);

    const cells: Array<{
      c: number;
      r: number;
      xVal: number;
      yVal: number;
      spread: number;
      count: number;
      sampleRunId?: string;
      status: HazardOutcome;
      fill: string;
    }> = [];

    if (!useEmpiricalGrid) {
      for (let r = 0; r < rows; r++) {
        const yFrac = 1 - r / (rows - 1);
        const yVal = Number((effYMin + yFrac * (effYMax - effYMin)).toFixed(3));
        for (let c = 0; c < cols; c++) {
          const xFrac = c / (cols - 1);
          const xVal = Number((effXMin + xFrac * (effXMax - effXMin)).toFixed(3));
          const res = computeFlameSpreadVelocity({
            O2_pct: sliders.O2_pct,
            P_psi: sliders.P_psi,
            Flow_ms: sliders.Flow_ms,
            g_eff: sliders.g_eff,
            Thickness_mm: sliders.Thickness_mm,
            [resolvedXKey]: xVal,
            [resolvedYKey]: yVal,
          });
          let fill = `rgba(16, 185, 129, ${isDark ? 0.28 : 0.24})`;
          if (res.hazardStatus === 'Rapid Flame Spread') {
            const alpha = Math.min(0.84, 0.26 + (res.flameSpread_mms / 6.0) * 0.54);
            fill = `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
          } else if (res.hazardStatus === 'Cool Flame Caution') {
            fill = `rgba(245, 158, 11, ${isDark ? 0.42 : 0.34})`;
          }
          cells.push({
            c,
            r,
            xVal,
            yVal,
            spread: res.flameSpread_mms,
            count: 1,
            status: res.hazardStatus,
            fill,
          });
        }
      }
    } else {
      const bins = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => ({
          runs: [] as PsiRun[],
          spreadSum: 0,
          rapid: 0,
          cool: 0,
          safe: 0,
        }))
      );

      for (const run of activeRuns) {
        const rx = Number(run[resolvedXKey]);
        const ry = Number(run[resolvedYKey]);
        if (rx < effXMin || rx > effXMax || ry < effYMin || ry > effYMax) {
          continue;
        }
        const c = Math.max(
          0,
          Math.min(cols - 1, Math.floor(((rx - effXMin) / Math.max(1e-9, effXMax - effXMin)) * cols))
        );
        const r = Math.max(
          0,
          Math.min(
            rows - 1,
            Math.floor((1 - (ry - effYMin) / Math.max(1e-9, effYMax - effYMin)) * rows)
          )
        );
        const bucket = bins[r][c];
        bucket.runs.push(run);
        bucket.spreadSum += run.flameSpread_mms;
        if (run.outcome === 'Rapid Flame Spread') bucket.rapid += 1;
        else if (run.outcome === 'Cool Flame Caution') bucket.cool += 1;
        else bucket.safe += 1;
      }

      for (let r = 0; r < rows; r++) {
        const yFrac = 1 - r / (rows - 1);
        const yVal = Number((effYMin + yFrac * (effYMax - effYMin)).toFixed(3));
        for (let c = 0; c < cols; c++) {
          const xFrac = c / (cols - 1);
          const xVal = Number((effXMin + xFrac * (effXMax - effXMin)).toFixed(3));
          const bucket = bins[r][c];
          const count = bucket.runs.length;
          if (count > 0) {
            const meanSpread = Number((bucket.spreadSum / count).toFixed(2));
            const status: HazardOutcome =
              bucket.rapid >= bucket.cool && bucket.rapid >= bucket.safe
                ? 'Rapid Flame Spread'
                : bucket.cool >= bucket.safe
                ? 'Cool Flame Caution'
                : 'Self-Extinguishing';
            const densityBoost = Math.min(0.45, Math.log10(count + 1) * 0.25);
            const alpha = (0.32 + densityBoost).toFixed(2);
            const fill =
              status === 'Rapid Flame Spread'
                ? `rgba(239, 68, 68, ${alpha})`
                : status === 'Cool Flame Caution'
                ? `rgba(245, 158, 11, ${alpha})`
                : `rgba(16, 185, 129, ${alpha})`;
            cells.push({
              c,
              r,
              xVal,
              yVal,
              spread: meanSpread,
              count,
              sampleRunId: bucket.runs[0]?.id,
              status,
              fill,
            });
          } else {
            cells.push({
              c,
              r,
              xVal,
              yVal,
              spread: 0,
              count: 0,
              status: 'Self-Extinguishing',
              fill: isDark ? 'rgba(39, 39, 42, 0.28)' : 'rgba(228, 228, 231, 0.35)',
            });
          }
        }
      }
    }

    return {
      cells,
      cols,
      rows,
      resolvedXKey,
      resolvedYKey,
      useEmpiricalGrid,
      effXMin,
      effXMax,
      effYMin,
      effYMax,
      xMeta,
      yMeta,
    };
  };

  const FloatingGlassOverlay = () =>
    glassTooltip ? (
      <div
        className={`pointer-events-none absolute top-2 right-3 z-30 px-3 py-2 rounded-lg border backdrop-blur-xl shadow-xl text-xs transition-all duration-150 ${
          isDark
            ? 'bg-[#121216]/95 border-[#27272A] text-[#FAFAFA]'
            : 'bg-white/95 border-[#E4E4E7] text-[#18181B]'
        }`}
      >
        <div className="font-sans font-semibold flex items-center justify-between gap-4">
          <span>{glassTooltip.title}</span>
          {glassTooltip.status && (
            <span
              className={`text-[11px] font-semibold ${
                glassTooltip.status.includes('Rapid')
                  ? 'text-[#EF4444]'
                  : glassTooltip.status.includes('Cool')
                  ? 'text-[#F59E0B]'
                  : 'text-[#10B981]'
              }`}
            >
              ● {glassTooltip.status}
            </span>
          )}
        </div>
        {glassTooltip.subtitle && (
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {glassTooltip.subtitle}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-3 font-mono text-[11px] tabular-nums">
          {glassTooltip.metrics.map((m) => (
            <span key={m.label}>
              <span className="text-zinc-400 font-sans">{m.label}: </span>
              <span className="font-semibold">{m.value}</span>
            </span>
          ))}
        </div>
      </div>
    ) : null;

  // 1. 2D REGIME HEATMAP & CONTOUR DENSITY MAP (Desmos domain zoom/pan, hairline grid, circular markers + 16px magnetic snap)
  if (vizMode === 'safety-map' || vizMode === 'contour-surface') {
    const defaultX = vizMode === 'contour-surface' ? 'P_psi' : 'O2_pct';
    const defaultY = vizMode === 'contour-surface' ? 'Thickness_mm' : 'Flow_ms';
    const mapX = isNumericAxisKey(xAxisKey) ? xAxisKey : defaultX;
    const mapY = numericY === mapX ? defaultY : numericY;
    const baseBounds = get2DGridBaseBounds(mapX, mapY);
    const xMetaBase = getAxisMeta(mapX);
    const yMetaBase = getAxisMeta(mapY);

    return (
      <div
        className="space-y-2.5 relative"
        onMouseLeave={() => {
          setGlassTooltip(null);
          setSnappedHeatmapRun(null);
          onHoverRun(null);
        }}
      >
        {/* Legend placed strictly ABOVE the heatmap area */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div className="flex flex-wrap items-center gap-4 text-[11px] font-sans font-medium">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#10B981]" />
              <span>Self-Extinguishing</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#F59E0B]" />
              <span>Cool Flame Caution</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#EF4444]" />
              <span>Rapid Flame Spread</span>
            </span>
            {mapY === 'Flow_ms' && (
              <span className="inline-flex items-center gap-1.5 pl-2 border-l border-zinc-300 dark:border-zinc-700 font-semibold">
                <span className="w-4 h-0 border-t-2 border-dashed border-zinc-800 dark:border-zinc-200" />
                <span className="font-mono tabular-nums">0.05–0.20 m/s</span>
                <span>Replenishment Band</span>
              </span>
            )}
          </div>
          <span className="font-sans text-[11px] text-zinc-500 dark:text-zinc-400">
            Scroll to zoom · Drag to pan · Click run marker or cell to inspect
          </span>
        </div>

        <InteractiveChartViewport
          theme={theme}
          baseXDomain={baseBounds.xDomain}
          baseYDomain={baseBounds.yDomain}
          resetKey={resetKey}
          xTickCount={6}
          yTickCount={6}
          xUnit={xMetaBase.unit ?? ''}
          yUnit={yMetaBase.unit ?? ''}
          plotInsets={{
            left: 76 / 920,
            right: (920 - 886) / 920,
            top: 14 / 318,
            bottom: (318 - 270) / 318,
          }}
        >
          {(ctx) => {
            const grid = build2DPhysicsGrid(
              mapX,
              mapY,
              24,
              14,
              ctx.xDomain,
              ctx.yDomain
            );
            const simXVal = getSimParamValue(grid.resolvedXKey, sliders, simulation);
            const simYVal = getSimParamValue(grid.resolvedYKey, sliders, simulation);
            const xSpan = Math.max(1e-6, grid.effXMax - grid.effXMin);
            const ySpan = Math.max(1e-6, grid.effYMax - grid.effYMin);
            const cxSim = 76 + ((simXVal - grid.effXMin) / xSpan) * 810;
            const cySim = 14 + (1 - (simYVal - grid.effYMin) / ySpan) * 256;

            const boxW = 148;
            const boxH = 22;
            const clampedSimX = Math.max(76, Math.min(886, cxSim));
            const clampedSimY = Math.max(14, Math.min(270, cySim));
            const boxX =
              clampedSimX + boxW + 18 < 886
                ? clampedSimX + 12
                : Math.max(80, clampedSimX - boxW - 12);
            const boxY = clampedSimY > 48 ? clampedSimY - boxH - 8 : clampedSimY + 12;

            const inViewRuns = activeRuns.filter((run) => {
              const rx = Number(run[grid.resolvedXKey]);
              const ry = Number(run[grid.resolvedYKey]);
              return (
                rx >= grid.effXMin &&
                rx <= grid.effXMax &&
                ry >= grid.effYMin &&
                ry <= grid.effYMax
              );
            });

            const plottedRuns = (() => {
              if (ctx.zoomRatio >= 1.45 || inViewRuns.length <= 42) {
                return inViewRuns.slice(0, 140);
              }
              const seenPsi = new Set<string>();
              const deduped: PsiRun[] = [];
              for (const r of inViewRuns) {
                const key = r.psiId.split(' ')[0];
                if (!seenPsi.has(key)) {
                  seenPsi.add(key);
                  deduped.push(r);
                }
              }
              return (deduped.length >= 12 ? deduped : inViewRuns).slice(0, 36);
            })();

            const markerStyle = computeAdaptiveMarkerStyle(
              plottedRuns.length,
              ctx.zoomRatio,
              4.3
            );

            const placedLabels: Array<{ x: number; y: number; w: number; h: number }> = [];
            const activeRunTooltip =
              snappedHeatmapRun ??
              (hoveredRunId
                ? inViewRuns.find((r) => r.id === hoveredRunId) ?? null
                : null);

            return (
              <div className="relative w-full">
                {activeRunTooltip ? (
                  <RunTelemetryGlassTooltip
                    theme={theme}
                    run={activeRunTooltip}
                    extraMetrics={[
                      {
                        label: grid.xMeta.shortLabel,
                        value: `${Number(activeRunTooltip[grid.resolvedXKey]).toFixed(1)} ${grid.xMeta.unit ?? ''}`,
                      },
                      {
                        label: grid.yMeta.shortLabel,
                        value: `${Number(activeRunTooltip[grid.resolvedYKey]).toFixed(2)} ${grid.yMeta.unit ?? ''}`,
                      },
                    ]}
                  />
                ) : (
                  <FloatingGlassOverlay />
                )}

                <svg
                  ref={heatmapSvgRef}
                  viewBox="0 0 920 318"
                  className="w-full h-auto select-none"
                  role="img"
                  aria-label={`${grid.xMeta.label} vs. ${grid.yMeta.label} 2D Regime Grid`}
                  onMouseMove={(e) => {
                    const svg = heatmapSvgRef.current;
                    if (!svg) return;
                    const rect = svg.getBoundingClientRect();
                    if (rect.width <= 0 || rect.height <= 0) return;
                    const mxCss = e.clientX - rect.left;
                    const myCss = e.clientY - rect.top;

                    const candidates: ScreenPointCandidate<PsiRun>[] = plottedRuns.map(
                      (run) => {
                        const rx = Number(run[grid.resolvedXKey]);
                        const ry = Number(run[grid.resolvedYKey]);
                        const svgX = 76 + ((rx - grid.effXMin) / xSpan) * 810;
                        const svgY = 14 + (1 - (ry - grid.effYMin) / ySpan) * 256;
                        return {
                          item: run,
                          sx: (svgX / 920) * rect.width,
                          sy: (svgY / 318) * rect.height,
                        };
                      }
                    );

                    const snapped = findNearestScreenPoint(candidates, mxCss, myCss, 16);
                    if (snapped) {
                      if (snappedHeatmapRun?.id !== snapped.item.id) {
                        setSnappedHeatmapRun(snapped.item);
                      }
                      if (hoveredRunId !== snapped.item.id) {
                        onHoverRun(snapped.item.id);
                      }
                      setGlassTooltip(null);
                    } else if (snappedHeatmapRun !== null) {
                      setSnappedHeatmapRun(null);
                      onHoverRun(null);
                    }
                  }}
                  onMouseLeave={() => {
                    setSnappedHeatmapRun(null);
                    setGlassTooltip(null);
                    onHoverRun(null);
                  }}
                  onClick={() => {
                    if (ctx.wasRecentlyDragged()) return;
                    if (snappedHeatmapRun) {
                      onInspectRun(snappedHeatmapRun.id);
                    }
                  }}
                >
                  <defs>
                    <clipPath id={heatmapClipId}>
                      <rect x={76} y={14} width={810} height={256} />
                    </clipPath>
                  </defs>

                  <g clipPath={`url(#${heatmapClipId})`}>
                    {grid.cells.map((cell) => {
                      const cellW = 810 / grid.cols;
                      const cellH = 256 / grid.rows;
                      return (
                        <rect
                          key={`${cell.c}-${cell.r}`}
                          x={76 + cell.c * cellW}
                          y={14 + cell.r * cellH}
                          width={cellW + 0.3}
                          height={cellH + 0.3}
                          fill={cell.fill}
                          stroke={
                            isDark
                              ? 'rgba(255,255,255,0.055)'
                              : 'rgba(24,24,27,0.065)'
                          }
                          strokeWidth={0.45}
                          className="transition-opacity duration-150 hover:opacity-85"
                          onMouseEnter={() => {
                            if (snappedHeatmapRun) return;
                            setGlassTooltip({
                              title: grid.useEmpiricalGrid
                                ? `${grid.xMeta.shortLabel} × ${grid.yMeta.shortLabel} (${cell.count} runs)`
                                : `${grid.xMeta.shortLabel} × ${grid.yMeta.shortLabel} Cell`,
                              metrics: [
                                {
                                  label: grid.xMeta.shortLabel,
                                  value: `${grid.xMeta.format ? grid.xMeta.format(cell.xVal) : cell.xVal.toFixed(1)} ${grid.xMeta.unit ?? ''}`,
                                },
                                {
                                  label: grid.yMeta.shortLabel,
                                  value: `${grid.yMeta.format ? grid.yMeta.format(cell.yVal) : cell.yVal.toFixed(2)} ${grid.yMeta.unit ?? ''}`,
                                },
                                {
                                  label: grid.useEmpiricalGrid ? 'Mean Spread' : 'Spread',
                                  value:
                                    cell.count > 0
                                      ? `${cell.spread.toFixed(2)} mm/s`
                                      : 'No Archive Runs',
                                },
                              ],
                              status: cell.count > 0 ? cell.status : undefined,
                            });
                          }}
                          onClick={(e) => {
                            if (ctx.wasRecentlyDragged()) return;
                            if (snappedHeatmapRun) {
                              e.stopPropagation();
                              onInspectRun(snappedHeatmapRun.id);
                              return;
                            }
                            if (isChamberInputAxis(grid.resolvedXKey)) {
                              onChangeSlider(grid.resolvedXKey, cell.xVal);
                            }
                            if (isChamberInputAxis(grid.resolvedYKey)) {
                              onChangeSlider(grid.resolvedYKey, cell.yVal);
                            }
                            if (grid.useEmpiricalGrid && cell.sampleRunId) {
                              onInspectRun(cell.sampleRunId);
                            }
                          }}
                        />
                      );
                    })}

                    {/* Desmos gridlines clipped strictly inside plot bounds */}
                    {ctx.xTicks.ticks.map((tk) => {
                      const gx = 76 + ((tk - grid.effXMin) / xSpan) * 810;
                      return (
                        <line
                          key={`vg-${tk}`}
                          x1={gx}
                          y1={14}
                          x2={gx}
                          y2={270}
                          stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(24,24,27,0.08)'}
                          strokeWidth={0.75}
                          pointerEvents="none"
                        />
                      );
                    })}
                    {ctx.yTicks.ticks.map((tk) => {
                      const gy = 14 + (1 - (tk - grid.effYMin) / ySpan) * 256;
                      return (
                        <line
                          key={`hg-${tk}`}
                          x1={76}
                          y1={gy}
                          x2={886}
                          y2={gy}
                          stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(24,24,27,0.08)'}
                          strokeWidth={0.75}
                          pointerEvents="none"
                        />
                      );
                    })}

                    {/* Optional 0.05-0.20 m/s dashed replenishment zone when Airflow is on Y axis */}
                    {grid.resolvedYKey === 'Flow_ms' && (() => {
                      const yTopBand = 14 + (1 - (0.2 - grid.effYMin) / ySpan) * 256;
                      const yBotBand = 14 + (1 - (0.05 - grid.effYMin) / ySpan) * 256;
                      return (
                        <rect
                          x={76}
                          y={yTopBand}
                          width={810}
                          height={Math.max(1, yBotBand - yTopBand)}
                          fill="none"
                          stroke={isDark ? '#FAFAFA' : '#18181B'}
                          strokeWidth={1.25}
                          strokeDasharray="6 4"
                          opacity={0.72}
                          pointerEvents="none"
                        />
                      );
                    })()}

                    {/* Softened circular markers with 1px crisp halos & magnetic highlight */}
                    {plottedRuns.map((run) => {
                      const rx = Number(run[grid.resolvedXKey]);
                      const ry = Number(run[grid.resolvedYKey]);
                      const cx = 76 + ((rx - grid.effXMin) / xSpan) * 810;
                      const cy = 14 + (1 - (ry - grid.effYMin) / ySpan) * 256;
                      const activeTarget = snappedHeatmapRun?.id ?? hoveredRunId;
                      const isDimmed = activeTarget !== null && activeTarget !== run.id;
                      const isHighlighted = activeTarget === run.id;
                      const fillCol = getGroupColor(run, colorByKey, groupIndexMap, isDark);

                      let showRunLabel = false;
                      const labelText = run.runCode || run.psiId.split(' ')[0];
                      if (markerStyle.showLabels || isHighlighted) {
                        const lw = labelText.length * 6.2 + 8;
                        const lh = 13;
                        const lx = cx + markerStyle.radius + 4;
                        const ly = cy - 6;
                        const overlaps = placedLabels.some(
                          (b) =>
                            lx < b.x + b.w &&
                            lx + lw > b.x &&
                            ly < b.y + b.h &&
                            ly + lh > b.y
                        );
                        if (!overlaps && lx + lw < 882) {
                          placedLabels.push({ x: lx, y: ly, w: lw, h: lh });
                          showRunLabel = true;
                        }
                      }

                      return (
                        <g
                          key={run.id}
                          className="cursor-pointer transition-opacity duration-150"
                          style={{
                            opacity: isDimmed ? markerStyle.dimOpacity : 1,
                          }}
                          onMouseEnter={() => {
                            setSnappedHeatmapRun(run);
                            onHoverRun(run.id);
                            setGlassTooltip(null);
                          }}
                          onClick={(e) => {
                            if (ctx.wasRecentlyDragged()) return;
                            e.stopPropagation();
                            onInspectRun(run.id);
                          }}
                        >
                          {isHighlighted && (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={markerStyle.activeRadius + 4.5}
                              fill="none"
                              stroke={fillCol}
                              strokeWidth={1.6}
                              strokeOpacity={0.75}
                            />
                          )}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={
                              isHighlighted
                                ? markerStyle.activeRadius
                                : markerStyle.radius
                            }
                            fill={fillCol}
                            fillOpacity={
                              isHighlighted ? 0.96 : markerStyle.fillOpacity
                            }
                            stroke={monoBg}
                            strokeWidth={isHighlighted ? 1.5 : markerStyle.haloWidth}
                          />
                          {showRunLabel && (
                            <text
                              x={cx + markerStyle.radius + 5}
                              y={cy + 3}
                              fill={isDark ? '#E4E4E7' : '#27272A'}
                              fontSize="9.5"
                              fontFamily="JetBrains Mono, monospace"
                              fontWeight={isHighlighted ? '700' : '500'}
                              pointerEvents="none"
                            >
                              {labelText}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Active Operating Point Crosshair + Cleanly Offset Callout */}
                    <g pointerEvents="none">
                      <line
                        x1={cxSim}
                        y1={14}
                        x2={cxSim}
                        y2={270}
                        stroke={textPrimary}
                        strokeWidth={1.25}
                        strokeDasharray="3 3"
                      />
                      <line
                        x1={76}
                        y1={cySim}
                        x2={886}
                        y2={cySim}
                        stroke={textPrimary}
                        strokeWidth={1.25}
                        strokeDasharray="3 3"
                      />
                      <circle
                        cx={cxSim}
                        cy={cySim}
                        r={5.5}
                        fill={textPrimary}
                        stroke={monoBg}
                        strokeWidth={2}
                      />
                      <rect
                        x={boxX}
                        y={boxY}
                        width={boxW}
                        height={boxH}
                        rx={4}
                        fill={isDark ? '#09090B' : '#18181B'}
                        stroke={isDark ? '#52525B' : '#18181B'}
                        strokeWidth={1}
                      />
                      <text
                        x={boxX + boxW / 2}
                        y={boxY + 14.5}
                        textAnchor="middle"
                        fill="#FAFAFA"
                        fontSize="10"
                        fontFamily="Inter, sans-serif"
                        fontWeight="700"
                      >
                        ACTIVE:{' '}
                        <tspan fontFamily="JetBrains Mono, monospace">
                          {`${simulation.flameSpread_mms.toFixed(2)} mm/s`}
                        </tspan>
                      </text>
                    </g>
                  </g>

                  {/* Axes */}
                  <line x1={76} y1={270} x2={886} y2={270} stroke={axisStroke} />
                  <line x1={76} y1={14} x2={76} y2={270} stroke={axisStroke} />

                  {ctx.xTicks.ticks.map((tk, idx) => {
                    const x = 76 + ((tk - grid.effXMin) / xSpan) * 810;
                    if (x < 74 || x > 888) return null;
                    return (
                      <g key={`xt-${tk}-${idx}`}>
                        <line x1={x} y1={270} x2={x} y2={275} stroke={axisStroke} />
                        <text
                          x={x}
                          y={289}
                          textAnchor="middle"
                          fill={axisStroke}
                          fontSize="10"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {ctx.xTicks.labels[idx] ?? tk}
                        </text>
                      </g>
                    );
                  })}

                  {ctx.yTicks.ticks.map((tk, idx) => {
                    const y = 14 + (1 - (tk - grid.effYMin) / ySpan) * 256;
                    if (y < 12 || y > 272) return null;
                    return (
                      <g key={`yt-${tk}-${idx}`}>
                        <line x1={71} y1={y} x2={76} y2={y} stroke={axisStroke} />
                        <text
                          x={66}
                          y={y + 3.5}
                          textAnchor="end"
                          fill={axisStroke}
                          fontSize="10"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {ctx.yTicks.labels[idx] ?? tk}
                        </text>
                      </g>
                    );
                  })}

                  <text
                    x={481}
                    y={310}
                    textAnchor="middle"
                    fill={axisStroke}
                    fontSize="11"
                    fontFamily="Inter, sans-serif"
                    fontWeight="600"
                  >
                    {`${grid.xMeta.label} (${grid.xMeta.unit ?? ''})`}
                  </text>
                  <text
                    x={14}
                    y={142}
                    textAnchor="middle"
                    fill={axisStroke}
                    fontSize="11"
                    fontFamily="Inter, sans-serif"
                    fontWeight="600"
                    transform="rotate(-90 14 142)"
                  >
                    {`${grid.yMeta.label} (${grid.yMeta.unit ?? ''})`}
                  </text>
                </svg>
              </div>
            );
          }}
        </InteractiveChartViewport>
      </div>
    );
  }

  // 2. PARALLEL COORDINATES (Unique Run Legends, Click/Hover Trajectory Isolation, Per-Axis Vertical Desmos Zoom)
  if (vizMode === 'multi-variable') {
    return (
      <ParallelCoordinatesPlot
        theme={theme}
        runs={activeRuns}
        sliders={sliders}
        simulation={simulation}
        showActiveVirtual={true}
        hoveredRunId={hoveredRunId}
        onHoverRun={onHoverRun}
        onInspectRun={onInspectRun}
        resetKey={resetKey}
      />
    );
  }

  // 3. BULLET TARGET CHART (Material Safety - Horizontal Desmos Scale Zoom & Pan)
  if (vizMode === 'material-safety') {
    const sortedMaterials = [...simulation.materialRankings].sort((a, b) => {
      const diff = a[materialSort.key] - b[materialSort.key];
      return materialSort.dir === 'asc' ? diff : -diff;
    });

    return (
      <div className="space-y-4">
        <InteractiveChartViewport
          theme={theme}
          baseXDomain={{ min: 0, max: 100 }}
          baseYDomain={{ min: 0, max: 4 }}
          resetKey={resetKey}
          defaultLockMode="x"
          showAxisLock={false}
          xTickCount={6}
          xUnit="%"
          plotInsets={{ left: 0.03, right: 0.03, top: 0.06, bottom: 0.08 }}
        >
          {(ctx) => {
            const xMin = ctx.xDomain.min;
            const xMax = ctx.xDomain.max;
            const xSpan = Math.max(1e-6, xMax - xMin);
            const toViewPct = (v: number) =>
              Math.max(0, Math.min(100, ((v - xMin) / xSpan) * 100));

            return (
              <div className="space-y-2.5">
                {/* Live Desmos Scale Ruler across all 4 panels */}
                <div
                  className={`px-3 py-1.5 rounded-[5px] border flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums ${
                    isDark
                      ? 'bg-[#09090B]/70 border-[#27272A] text-zinc-400'
                      : 'bg-zinc-50 border-[#E4E4E7] text-zinc-600'
                  }`}
                >
                  <span className="font-sans font-semibold text-[10.5px]">
                    Normalized Scale Window:
                  </span>
                  <div className="relative flex-1 h-4">
                    {ctx.xTicks.ticks.map((tk, idx) => {
                      const pos = ((tk - xMin) / xSpan) * 100;
                      if (pos < -2 || pos > 102) return null;
                      return (
                        <span
                          key={`ms-tk-${tk}-${idx}`}
                          className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                          style={{ left: `${Math.max(2, Math.min(98, pos))}%` }}
                        >
                          {ctx.xTicks.labels[idx] ?? tk.toFixed(0)}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  {[
                    {
                      id: 'spread',
                      title: 'Flame Spread Index (0–100)',
                      thresholdValue: '35',
                      thresholdText: 'Safe Limit',
                      thresholdPct: 35,
                      getValue: (m: (typeof simulation.materialRankings)[number]) =>
                        `${m.flameSpread_mms.toFixed(2)} mm/s`,
                      getRawVal: (m: (typeof simulation.materialRankings)[number]) =>
                        m.flameSpreadIndex,
                      getBarColor: (m: (typeof simulation.materialRankings)[number]) =>
                        m.flameSpread_mms > 1.2
                          ? 'bg-[#EF4444]'
                          : m.flameSpread_mms > 0.5
                          ? 'bg-[#F59E0B]'
                          : 'bg-[#10B981]',
                    },
                    {
                      id: 'loi',
                      title: 'Limiting Oxygen Index (% O₂)',
                      thresholdValue: `${sliders.O2_pct.toFixed(1)}%`,
                      thresholdText: 'Cabin',
                      thresholdPct: Math.min(98, sliders.O2_pct),
                      getValue: (m: (typeof simulation.materialRankings)[number]) =>
                        `${m.limitingO2_pct.toFixed(1)}%`,
                      getRawVal: (m: (typeof simulation.materialRankings)[number]) =>
                        Math.min(100, m.limitingO2_pct),
                      getBarColor: (m: (typeof simulation.materialRankings)[number]) =>
                        m.limitingO2_pct <= sliders.O2_pct
                          ? 'bg-[#EF4444]'
                          : 'bg-[#10B981]',
                    },
                    {
                      id: 'smoke',
                      title: 'Smoke Clumping Index (0–100)',
                      thresholdValue: '50',
                      thresholdText: 'Threshold',
                      thresholdPct: 50,
                      getValue: (m: (typeof simulation.materialRankings)[number]) =>
                        `${m.smokeClumpingIndex}`,
                      getRawVal: (m: (typeof simulation.materialRankings)[number]) =>
                        m.smokeClumpingIndex,
                      getBarColor: () => (isDark ? 'bg-zinc-300' : 'bg-zinc-700'),
                    },
                    {
                      id: 'coolflame',
                      title: 'Cool-Flame Persistence (0–100)',
                      thresholdValue: '65',
                      thresholdText: 'NTC Bound',
                      thresholdPct: 65,
                      getValue: (m: (typeof simulation.materialRankings)[number]) =>
                        `${m.coolFlameRiskIndex}`,
                      getRawVal: (m: (typeof simulation.materialRankings)[number]) =>
                        m.coolFlameRiskIndex,
                      getBarColor: (m: (typeof simulation.materialRankings)[number]) =>
                        m.coolFlameRiskIndex >= 65 ? 'bg-[#F59E0B]' : 'bg-[#10B981]',
                    },
                  ].map((panel) => {
                    const threshPos = ((panel.thresholdPct - xMin) / xSpan) * 100;
                    const showThreshold = threshPos >= 0 && threshPos <= 100;
                    return (
                      <div
                        key={panel.id}
                        className={`p-3 rounded-[5px] border ${
                          isDark
                            ? 'bg-[#09090B]/70 border-[#27272A]'
                            : 'bg-zinc-50/70 border-[#E4E4E7]'
                        }`}
                      >
                        <div className="text-xs font-sans font-semibold mb-1 truncate">
                          {panel.title}
                        </div>
                        <div className="text-[10px] font-sans text-zinc-400 mb-2 flex items-center justify-between gap-2">
                          <span>Candidate</span>
                          <span>
                            <span className="font-mono tabular-nums">{panel.thresholdValue}</span>{' '}
                            {panel.thresholdText}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {simulation.materialRankings.map((mat) => {
                            const isDimmed =
                              hoveredMaterialId !== null && hoveredMaterialId !== mat.code;
                            const barWidth = toViewPct(panel.getRawVal(mat));
                            return (
                              <div
                                key={mat.code}
                                onMouseEnter={() => onHoverMaterial(mat.code)}
                                onMouseLeave={() => onHoverMaterial(null)}
                                className={`space-y-0.5 cursor-pointer transition-opacity ${
                                  isDimmed ? 'opacity-30' : 'opacity-100'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className="font-sans font-medium truncate">
                                    {mat.name}
                                  </span>
                                  <span className="font-mono font-semibold tabular-nums shrink-0">
                                    {panel.getValue(mat)}
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-[2px] relative overflow-hidden">
                                  <div
                                    className={`h-full ${panel.getBarColor(mat)}`}
                                    style={{ width: `${barWidth}%` }}
                                  />
                                  {showThreshold && (
                                    <div
                                      className="absolute top-0 bottom-0 w-0 border-r border-dashed border-zinc-900 dark:border-zinc-100"
                                      style={{ left: `${threshPos}%` }}
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }}
        </InteractiveChartViewport>

        <div className={`border rounded-[5px] overflow-x-auto ${isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'}`}>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className={`border-b font-sans text-[11px] font-semibold text-zinc-500 ${isDark ? 'bg-[#09090B] border-[#27272A]' : 'bg-zinc-50 border-[#E4E4E7]'}`}>
                <th className="py-2 px-3">Candidate Material</th>
                <th className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() =>
                      setMaterialSort((p) => ({
                        key: 'flameSpread_mms',
                        dir: p.key === 'flameSpread_mms' && p.dir === 'desc' ? 'asc' : 'desc',
                      }))
                    }
                    className="hover:underline cursor-pointer"
                  >
                    Flame Spread (mm/s)
                  </button>
                </th>
                <th className="py-2 px-3">
                  <button
                    type="button"
                    onClick={() =>
                      setMaterialSort((p) => ({
                        key: 'limitingO2_pct',
                        dir: p.key === 'limitingO2_pct' && p.dir === 'desc' ? 'asc' : 'desc',
                      }))
                    }
                    className="hover:underline cursor-pointer"
                  >
                    LOI (% O₂)
                  </button>
                </th>
                <th className="py-2 px-3 text-right">Cabin Status</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-[#27272A]' : 'divide-[#E4E4E7]'}`}>
              {sortedMaterials.map((mat) => {
                const passes = sliders.O2_pct < mat.limitingO2_pct && mat.flameSpread_mms < 0.55;
                return (
                  <tr
                    key={mat.code}
                    onMouseEnter={() => onHoverMaterial(mat.code)}
                    onMouseLeave={() => onHoverMaterial(null)}
                    className={
                      hoveredMaterialId && hoveredMaterialId !== mat.code
                        ? 'opacity-30'
                        : 'opacity-100'
                    }
                  >
                    <td className="py-2 px-3 font-sans font-semibold">{mat.name}</td>
                    <td className="py-2 px-3 font-mono tabular-nums font-semibold">
                      {mat.flameSpread_mms.toFixed(2)} mm/s
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums">
                      {mat.limitingO2_pct.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right font-sans font-bold">
                      <span className={passes ? 'text-[#10B981]' : 'text-[#EF4444]'}>
                        {passes ? 'PASS' : 'FAIL'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 4. DUAL-AXIS SENSOR LINE CHART (Desmos Time × Temperature Zoom, Clipped Curves, Cursor Readout)
  if (vizMode === 'sensor-timeline') {
    const hoveredPt =
      hoveredTimelineIdx !== null ? simulation.timelineSeries[hoveredTimelineIdx] : null;
    const minT = simulation.timelineSeries[0]?.time_s ?? 0;
    const maxT =
      simulation.timelineSeries[simulation.timelineSeries.length - 1]?.time_s ?? 120;

    return (
      <div
        className="space-y-2.5 relative"
        onMouseLeave={() => {
          setHoveredTimelineIdx(null);
          setGlassTooltip(null);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-[11px]">
          <div className="flex flex-wrap items-center gap-4 font-sans font-medium">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-[#EF4444]" />
              <span>Gas Temp (K)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-[#F59E0B]" />
              <span>IR Radiometer Flux (W/m²)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-[#10B981]" />
              <span>Visible Emission (%)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#F59E0B]/30 border border-[#F59E0B]" />
              <span>550K–800K Cool-Flame NTC Window</span>
            </span>
          </div>
          {hoveredPt && (
            <span className="font-mono tabular-nums font-semibold">
              t = {hoveredPt.time_s}s · {hoveredPt.temp_K}K · {hoveredPt.irFlux_Wm2} W/m²
            </span>
          )}
        </div>

        <InteractiveChartViewport
          theme={theme}
          baseXDomain={{ min: minT, max: Math.max(minT + 1, maxT) }}
          baseYDomain={{ min: 250, max: 1850 }}
          resetKey={resetKey}
          xTickCount={7}
          yTickCount={6}
          xUnit="s"
          yUnit="K"
          plotInsets={{
            left: 68 / 920,
            right: (920 - 886) / 920,
            top: 18 / 310,
            bottom: (310 - 268) / 310,
          }}
        >
          {(ctx) => {
            const xLeft = 68;
            const xRight = 886;
            const yTop = 18;
            const yBot = 268;
            const w = xRight - xLeft;
            const h = yBot - yTop;
            const xMin = ctx.xDomain.min;
            const xMax = ctx.xDomain.max;
            const xSpan = Math.max(1e-6, xMax - xMin);
            const yMin = ctx.yDomain.min;
            const yMax = ctx.yDomain.max;
            const ySpan = Math.max(1e-6, yMax - yMin);

            const xTime = (t: number) => xLeft + ((t - xMin) / xSpan) * w;
            const yTemp = (k: number) => yBot - ((k - yMin) / ySpan) * h;
            const yIr = (ir: number) => yTemp(250 + (ir / 22000) * 1600);
            const yVis = (vis: number) => yTemp(250 + (vis / 100) * 1600);

            const tempPts = simulation.timelineSeries
              .map((p) => `${xTime(p.time_s)},${yTemp(p.temp_K)}`)
              .join(' ');
            const irPts = simulation.timelineSeries
              .map((p) => `${xTime(p.time_s)},${yIr(p.irFlux_Wm2)}`)
              .join(' ');
            const visPts = simulation.timelineSeries
              .map((p) => `${xTime(p.time_s)},${yVis(p.opticalVisibility_pct)}`)
              .join(' ');
            const y800 = yTemp(800);
            const y550 = yTemp(550);
            const timelineClipId = `tl-clip-${heatmapClipId}`;

            return (
              <div className="relative w-full">
                <FloatingGlassOverlay />
                <svg viewBox="0 0 920 310" className="w-full h-auto select-none">
                  <defs>
                    <clipPath id={timelineClipId}>
                      <rect x={xLeft} y={yTop} width={w} height={h} />
                    </clipPath>
                  </defs>

                  <g clipPath={`url(#${timelineClipId})`}>
                    {ctx.xTicks.ticks.map((tk) => (
                      <line
                        key={`gx-${tk}`}
                        x1={xTime(tk)}
                        y1={yTop}
                        x2={xTime(tk)}
                        y2={yBot}
                        stroke={gridStroke}
                        strokeDasharray="3 3"
                      />
                    ))}
                    {ctx.yTicks.ticks.map((tk) => (
                      <line
                        key={`gy-${tk}`}
                        x1={xLeft}
                        y1={yTemp(tk)}
                        x2={xRight}
                        y2={yTemp(tk)}
                        stroke={gridStroke}
                        strokeDasharray="3 3"
                      />
                    ))}

                    <rect
                      x={xLeft}
                      y={y800}
                      width={w}
                      height={Math.max(1, y550 - y800)}
                      fill="rgba(245, 158, 11, 0.12)"
                      stroke="#F59E0B"
                      strokeDasharray="4 4"
                      strokeWidth={1}
                    />
                    <polyline fill="none" stroke="#EF4444" strokeWidth={2.5} points={tempPts} />
                    <polyline
                      fill="none"
                      stroke="#F59E0B"
                      strokeWidth={2}
                      strokeDasharray="5 3"
                      points={irPts}
                    />
                    <polyline fill="none" stroke="#10B981" strokeWidth={2} points={visPts} />

                    {simulation.timelineSeries.map((pt, idx) => {
                      const x = xTime(pt.time_s);
                      if (x < xLeft - 20 || x > xRight + 20) return null;
                      const segW = Math.max(12, w / Math.max(4, simulation.timelineSeries.length / ctx.xZoomRatio));
                      return (
                        <g
                          key={pt.time_s}
                          className="cursor-pointer"
                          onMouseEnter={() => {
                            setHoveredTimelineIdx(idx);
                            setGlassTooltip({
                              title: `Sensor Readout (t = ${pt.time_s}s)`,
                              metrics: [
                                { label: 'Gas Temp', value: `${pt.temp_K} K` },
                                { label: 'IR Flux', value: `${pt.irFlux_Wm2} W/m²` },
                                { label: 'Visible', value: `${pt.opticalVisibility_pct}%` },
                              ],
                              status: pt.isCoolFlameZone
                                ? 'Cool Flame Caution'
                                : simulation.hazardStatus,
                            });
                          }}
                        >
                          <rect x={x - segW / 2} y={yTop} width={segW} height={h} fill="transparent" />
                          {hoveredTimelineIdx === idx && (
                            <g pointerEvents="none">
                              <line
                                x1={x}
                                y1={yTop}
                                x2={x}
                                y2={yBot}
                                stroke={textPrimary}
                                strokeWidth={1.25}
                                strokeDasharray="3 3"
                              />
                              <circle cx={x} cy={yTemp(pt.temp_K)} r={4.5} fill="#EF4444" />
                              <circle cx={x} cy={yIr(pt.irFlux_Wm2)} r={4.5} fill="#F59E0B" />
                              <circle cx={x} cy={yVis(pt.opticalVisibility_pct)} r={4.5} fill="#10B981" />
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </g>

                  <line x1={xLeft} y1={yBot} x2={xRight} y2={yBot} stroke={axisStroke} />
                  <line x1={xLeft} y1={yTop} x2={xLeft} y2={yBot} stroke={axisStroke} />
                  {ctx.xTicks.ticks.map((tTick, idx) => {
                    const tx = xTime(tTick);
                    if (tx < xLeft - 4 || tx > xRight + 4) return null;
                    return (
                      <text
                        key={`t-${tTick}-${idx}`}
                        x={tx}
                        y={yBot + 17}
                        textAnchor="middle"
                        fill={axisStroke}
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {ctx.xTicks.labels[idx] ?? tTick}s
                      </text>
                    );
                  })}
                  {ctx.yTicks.ticks.map((kTick, idx) => {
                    const ty = yTemp(kTick);
                    if (ty < yTop - 4 || ty > yBot + 4) return null;
                    return (
                      <text
                        key={`k-${kTick}-${idx}`}
                        x={xLeft - 8}
                        y={ty + 3.5}
                        textAnchor="end"
                        fill={axisStroke}
                        fontSize="10"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {ctx.yTicks.labels[idx] ?? kTick}K
                      </text>
                    );
                  })}
                  <text
                    x={477}
                    y={304}
                    textAnchor="middle"
                    fill={axisStroke}
                    fontSize="11"
                    fontFamily="Inter, sans-serif"
                    fontWeight="600"
                  >
                    Elapsed Burn Duration (seconds)
                  </text>
                </svg>
              </div>
            );
          }}
        </InteractiveChartViewport>
      </div>
    );
  }

  // 5. GROUPED BAR CHART (Desmos Y-Scale & X-Bar-Window Zoom/Pan + Dual-Axis Synchronization)
  if (vizMode === 'grouped-bar') {
    const primaryMetricKey = numericX === numericY ? 'O2_pct' : numericX;
    const xMeta = getAxisMeta(primaryMetricKey);
    const yMeta = getAxisMeta(numericY);
    const displayedRuns = activeRuns.slice(0, 10);
    const chartData = [
      {
        id: 'sim-active',
        name: 'VIRTUAL',
        psiId: 'ACTIVE VIRTUAL TEST',
        mappedX: getSimParamValue(primaryMetricKey, sliders, simulation),
        mappedY: getSimParamValue(numericY, sliders, simulation),
        material: 'Active Configuration',
        facility: `${sliders.g_eff.toFixed(3)}g`,
        isSim: true,
      },
      ...displayedRuns.map((r) => ({
        id: r.id,
        name:
          xAxisKey === 'material'
            ? r.material.slice(0, 12)
            : xAxisKey === 'facility'
            ? r.facility
            : xAxisKey === 'outcome'
            ? r.outcome.split(' ')[0]
            : r.psiId.split(' ')[0],
        psiId: r.psiId,
        mappedX: r[primaryMetricKey],
        mappedY: r[numericY],
        material: r.material,
        facility: r.facility,
        isSim: false,
      })),
    ];

    const maxXVal = Math.max(...chartData.map((d) => Math.abs(d.mappedX)), 0.01);
    const maxYVal = Math.max(...chartData.map((d) => Math.abs(d.mappedY)), 0.01);
    const useDualAxis = Math.max(maxXVal / maxYVal, maxYVal / maxXVal) > 2.2;
    const baseLeftMax = Number(
      ((useDualAxis ? maxXVal : Math.max(maxXVal, maxYVal)) * 1.15).toFixed(2)
    );
    const rightScaleRatio = (maxYVal * 1.15) / Math.max(1e-6, baseLeftMax);

    return (
      <div className="space-y-2.5">
        <InteractiveChartViewport
          theme={theme}
          baseXDomain={{ min: 0, max: Math.max(1, chartData.length - 1) }}
          baseYDomain={{ min: 0, max: Math.max(1, baseLeftMax) }}
          resetKey={resetKey}
          xTickCount={chartData.length}
          yTickCount={5}
          integerX={true}
          yUnit={useDualAxis ? (xMeta.unit ?? '') : (yMeta.unit ?? '')}
          plotInsets={{ left: 0.06, right: useDualAxis ? 0.06 : 0.03, top: 0.12, bottom: 0.12 }}
        >
          {(ctx) => {
            const startIdx = Math.max(0, Math.floor(ctx.xDomain.min));
            const endIdx = Math.min(chartData.length - 1, Math.ceil(ctx.xDomain.max));
            const visibleData =
              ctx.xZoomRatio > 1.03 || startIdx > 0 || endIdx < chartData.length - 1
                ? chartData.slice(
                    Math.min(startIdx, Math.max(0, chartData.length - 2)),
                    Math.max(Math.min(chartData.length, startIdx + 2), endIdx + 1)
                  )
                : chartData;

            return (
              <div className="h-[310px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={visibleData}
                    margin={{ top: 10, right: useDualAxis ? 16 : 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke={axisStroke}
                      tick={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fill: axisStroke }}
                    />
                    <YAxis
                      yAxisId="left"
                      domain={[ctx.yDomain.min, ctx.yDomain.max]}
                      ticks={ctx.yTicks.ticks}
                      allowDataOverflow={true}
                      stroke="#10B981"
                      tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                    />
                    {useDualAxis && (
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={[
                          Number((ctx.yDomain.min * rightScaleRatio).toFixed(2)),
                          Number((ctx.yDomain.max * rightScaleRatio).toFixed(2)),
                        ]}
                        allowDataOverflow={true}
                        stroke="#EF4444"
                        tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                      />
                    )}
                    <Tooltip content={renderCustomTooltip as never} />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={30}
                      wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="mappedX"
                      name={`${xMeta.shortLabel} (${xMeta.unit ?? ''})`}
                      fill="#10B981"
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                      onMouseEnter={(item) => {
                        const row = (item as { payload?: { id?: string; isSim?: boolean } })?.payload;
                        if (row?.id && !row.isSim) onHoverRun(row.id);
                      }}
                      onMouseLeave={() => onHoverRun(null)}
                      onClick={(item) => {
                        if (ctx.wasRecentlyDragged()) return;
                        const row = (item as { payload?: { id?: string; isSim?: boolean } })?.payload;
                        if (row?.id && !row.isSim) onInspectRun(row.id);
                      }}
                      className="cursor-pointer"
                    >
                      {visibleData.map((row) => (
                        <Cell
                          key={`gx-${row.id}`}
                          fillOpacity={hoveredRunId && !row.isSim && hoveredRunId !== row.id ? 0.28 : 0.92}
                        />
                      ))}
                    </Bar>
                    <Bar
                      yAxisId={useDualAxis ? 'right' : 'left'}
                      dataKey="mappedY"
                      name={`${yMeta.shortLabel} (${yMeta.unit ?? ''})`}
                      fill="#EF4444"
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={false}
                      onMouseEnter={(item) => {
                        const row = (item as { payload?: { id?: string; isSim?: boolean } })?.payload;
                        if (row?.id && !row.isSim) onHoverRun(row.id);
                      }}
                      onMouseLeave={() => onHoverRun(null)}
                      onClick={(item) => {
                        if (ctx.wasRecentlyDragged()) return;
                        const row = (item as { payload?: { id?: string; isSim?: boolean } })?.payload;
                        if (row?.id && !row.isSim) onInspectRun(row.id);
                      }}
                      className="cursor-pointer"
                    >
                      {visibleData.map((row) => (
                        <Cell
                          key={`gy-${row.id}`}
                          fillOpacity={hoveredRunId && !row.isSim && hoveredRunId !== row.id ? 0.28 : 0.92}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          }}
        </InteractiveChartViewport>
      </div>
    );
  }

  // 6. STACKED BAR CHART (Desmos Y-Scale & X-Bar-Window Zoom/Pan)
  if (vizMode === 'stacked-bar') {
    const stackAcrossDataset = activeRuns.length > 1;
    if (!stackAcrossDataset) {
      const matData = simulation.materialRankings.map((m) => ({
        name: m.name,
        code: m.code,
        flameSpreadIndex: m.flameSpreadIndex,
        smokeClumpingIndex: m.smokeClumpingIndex,
        toxicGasYieldIndex: m.toxicGasYieldIndex,
        coolFlameRiskIndex: m.coolFlameRiskIndex,
      }));
      const maxMatTotal = Math.ceil(
        Math.max(
          100,
          ...matData.map(
            (m) =>
              m.flameSpreadIndex +
              m.smokeClumpingIndex +
              m.toxicGasYieldIndex +
              m.coolFlameRiskIndex
          )
        ) * 1.1
      );

      return (
        <div className="space-y-2.5">
          <InteractiveChartViewport
            theme={theme}
            baseXDomain={{ min: 0, max: Math.max(1, matData.length - 1) }}
            baseYDomain={{ min: 0, max: maxMatTotal }}
            resetKey={resetKey}
            xTickCount={matData.length}
            yTickCount={5}
            integerX={true}
            integerY={true}
            plotInsets={{ left: 0.06, right: 0.03, top: 0.12, bottom: 0.12 }}
          >
            {(ctx) => {
              const sIdx = Math.max(0, Math.floor(ctx.xDomain.min));
              const eIdx = Math.min(matData.length - 1, Math.ceil(ctx.xDomain.max));
              const visibleMat =
                ctx.xZoomRatio > 1.03 || sIdx > 0 || eIdx < matData.length - 1
                  ? matData.slice(
                      Math.min(sIdx, Math.max(0, matData.length - 2)),
                      Math.max(Math.min(matData.length, sIdx + 2), eIdx + 1)
                    )
                  : matData;

              return (
                <div className="h-[310px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={visibleMat} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        stroke={axisStroke}
                        tick={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fill: axisStroke }}
                      />
                      <YAxis
                        domain={[ctx.yDomain.min, ctx.yDomain.max]}
                        ticks={ctx.yTicks.ticks}
                        allowDataOverflow={true}
                        stroke={axisStroke}
                        tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                      />
                      <Tooltip content={renderCustomTooltip as never} />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        height={30}
                        wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }}
                      />
                      <Bar
                        dataKey="flameSpreadIndex"
                        name="Flame Spread"
                        stackId="hazard"
                        fill="#EF4444"
                        isAnimationActive={false}
                        onMouseEnter={(item) => {
                          const row = (item as { payload?: { code?: string } })?.payload;
                          if (row?.code) onHoverMaterial(row.code);
                        }}
                        onMouseLeave={() => onHoverMaterial(null)}
                      />
                      <Bar
                        dataKey="smokeClumpingIndex"
                        name="Smoke Clumping"
                        stackId="hazard"
                        fill={isDark ? '#A1A1AA' : '#52525B'}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="toxicGasYieldIndex"
                        name="Toxic Gas"
                        stackId="hazard"
                        fill="#F59E0B"
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="coolFlameRiskIndex"
                        name="Cool-Flame Risk"
                        stackId="hazard"
                        fill="#10B981"
                        radius={[3, 3, 0, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            }}
          </InteractiveChartViewport>
        </div>
      );
    }

    const effectiveStackKey: CategoricalGroupKey =
      !isNumericAxisKey(xAxisKey) && xAxisKey === colorByKey ? 'outcome' : colorByKey;
    const categoryLabelForRun = (r: PsiRun): string => {
      if (!isNumericAxisKey(xAxisKey)) {
        if (xAxisKey === 'psiId') return r.psiId.split(' ')[0];
        return String(r[xAxisKey]).slice(0, 18);
      }
      const val = Number(r[xAxisKey]);
      const [dMin, dMax] = [
        Math.min(...activeRuns.map((x) => Number(x[xAxisKey]))),
        Math.max(...activeRuns.map((x) => Number(x[xAxisKey]))),
      ];
      const step = Math.max(0.05, (dMax - dMin) / 6);
      const binIdx = Math.min(5, Math.max(0, Math.floor((val - dMin) / step)));
      const lo = dMin + binIdx * step;
      const hi = lo + step;
      return `${lo.toFixed(1)}–${hi.toFixed(1)}`;
    };

    const stackKeysSet = new Set<string>();
    const groupedMap = new Map<string, Record<string, number | string>>();
    for (const r of activeRuns) {
      const cat = categoryLabelForRun(r);
      const stk =
        effectiveStackKey === 'psiId'
          ? r.psiId.split(' ')[0]
          : String(r[effectiveStackKey]);
      stackKeysSet.add(stk);
      const row = groupedMap.get(cat) ?? { name: cat, _total: 0 };
      row[stk] = (Number(row[stk]) || 0) + 1;
      row._total = Number(row._total) + 1;
      groupedMap.set(cat, row);
    }
    const stackKeys = Array.from(stackKeysSet).slice(0, 6);
    const stackedRows = Array.from(groupedMap.values())
      .sort((a, b) => Number(b._total) - Number(a._total))
      .slice(0, 12);
    const maxStackedTotal = Math.ceil(
      Math.max(4, ...stackedRows.map((d) => Number(d._total))) * 1.15
    );

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-xs">
          <span className="font-sans text-zinc-500">
            Stacked Composition across {activeRuns.length} runs: Grouped by {getAxisMeta(xAxisKey).label}, Stacked by {getAxisMeta(effectiveStackKey).label}.
          </span>
        </div>
        <InteractiveChartViewport
          theme={theme}
          baseXDomain={{ min: 0, max: Math.max(1, stackedRows.length - 1) }}
          baseYDomain={{ min: 0, max: maxStackedTotal }}
          resetKey={resetKey}
          xTickCount={stackedRows.length}
          yTickCount={5}
          integerX={true}
          integerY={true}
          yUnit="runs"
          plotInsets={{ left: 0.06, right: 0.03, top: 0.12, bottom: 0.12 }}
        >
          {(ctx) => {
            const sIdx = Math.max(0, Math.floor(ctx.xDomain.min));
            const eIdx = Math.min(stackedRows.length - 1, Math.ceil(ctx.xDomain.max));
            const visibleRows =
              ctx.xZoomRatio > 1.03 || sIdx > 0 || eIdx < stackedRows.length - 1
                ? stackedRows.slice(
                    Math.min(sIdx, Math.max(0, stackedRows.length - 2)),
                    Math.max(Math.min(stackedRows.length, sIdx + 2), eIdx + 1)
                  )
                : stackedRows;

            return (
              <div className="h-[310px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={visibleRows} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke={axisStroke}
                      tick={{ fontSize: 10.5, fontFamily: 'Inter, sans-serif', fill: axisStroke }}
                    />
                    <YAxis
                      allowDecimals={false}
                      domain={[ctx.yDomain.min, ctx.yDomain.max]}
                      ticks={ctx.yTicks.ticks}
                      allowDataOverflow={true}
                      stroke={axisStroke}
                      tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                    />
                    <Tooltip content={renderCustomTooltip as never} />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={30}
                      wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }}
                    />
                    {stackKeys.map((sk, idx) => (
                      <Bar
                        key={sk}
                        dataKey={sk}
                        name={sk}
                        stackId="cat"
                        fill={
                          effectiveStackKey === 'outcome'
                            ? outcomeColor(sk as HazardOutcome)
                            : CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length]
                        }
                        radius={idx === stackKeys.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                        isAnimationActive={false}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          }}
        </InteractiveChartViewport>
      </div>
    );
  }

  // 7. HORIZONTAL RANKED BAR CHART (Honors mapped yAxisKey dynamically + Desmos X/Row Zoom)
  if (vizMode === 'horizontal-ranked-bar') {
    const yMeta = getAxisMeta(numericY);
    const simY = getSimParamValue(numericY, sliders, simulation);
    const combined = [
      {
        id: 'sim-active',
        name: 'ACTIVE TEST',
        psiId: 'ACTIVE VIRTUAL TEST',
        val: simY,
        outcome: simulation.hazardStatus,
        material: `${sliders.O2_pct.toFixed(1)}% O₂ · ${sliders.Thickness_mm.toFixed(1)}mm`,
        facility: `${sliders.g_eff.toFixed(3)}g`,
        isSim: true,
        color: isDark ? '#FAFAFA' : '#18181B',
      },
      ...(() => {
        const usedLabels = new Set<string>(['ACTIVE TEST']);
        return activeRuns.slice(0, 12).map((r, idx) => {
          const shortPsi = r.psiId.split(' ')[0];
          const runCode = r.runCode?.trim();
          let label = runCode ? `${shortPsi} · ${runCode}` : `${shortPsi} · #${idx + 1}`;
          if (usedLabels.has(label)) {
            label = `${label} (${idx + 1})`;
          }
          usedLabels.add(label);
          return {
            id: r.id,
            name: label,
            psiId: runCode ? `${r.psiId} · ${runCode}` : r.psiId,
            val: r[numericY],
            outcome: r.outcome,
            material: r.material,
            facility: r.facility,
            isSim: false,
            color: getGroupColor(r, colorByKey, groupIndexMap, isDark),
          };
        });
      })(),
    ].sort((a, b) => b.val - a.val);

    const maxMetricVal = Number(
      (Math.max(0.5, ...combined.map((d) => Math.abs(d.val))) * 1.12).toFixed(2)
    );

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-1 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            Sorted descending by {yMeta.label} ({yMeta.unit ?? ''}) · Colored by{' '}
            {getAxisMeta(colorByKey).label}
          </span>
          {numericY === 'flameSpread_mms' && (
            <span className="font-sans text-[11px] text-[#10B981] font-semibold">
              Dashed Line = <span className="font-mono tabular-nums">0.48 mm/s</span> Quench Bound
            </span>
          )}
        </div>
        <InteractiveChartViewport
          theme={theme}
          baseXDomain={{ min: 0, max: maxMetricVal }}
          baseYDomain={{ min: 0, max: Math.max(1, combined.length - 1) }}
          resetKey={resetKey}
          xTickCount={6}
          yTickCount={6}
          integerY={true}
          xUnit={yMeta.unit ?? ''}
          plotInsets={{ left: 0.18, right: 0.04, top: 0.04, bottom: 0.12 }}
        >
          {(ctx) => {
            const rStart = Math.max(0, Math.floor(ctx.yDomain.min));
            const rEnd = Math.min(combined.length - 1, Math.ceil(ctx.yDomain.max));
            const visibleRows =
              ctx.yZoomRatio > 1.03 || rStart > 0 || rEnd < combined.length - 1
                ? combined.slice(
                    Math.min(rStart, Math.max(0, combined.length - 2)),
                    Math.max(Math.min(combined.length, rStart + 2), rEnd + 1)
                  )
                : combined;
            const showQuenchRef =
              numericY === 'flameSpread_mms' &&
              0.48 >= ctx.xDomain.min &&
              0.48 <= ctx.xDomain.max;

            return (
              <div style={{ height: `${Math.max(260, visibleRows.length * 28)}px` }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={visibleRows}
                    layout="vertical"
                    margin={{ top: 8, right: 28, left: 12, bottom: 8 }}
                  >
                    <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[ctx.xDomain.min, ctx.xDomain.max]}
                      ticks={ctx.xTicks.ticks}
                      allowDataOverflow={true}
                      stroke={axisStroke}
                      tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                      unit={yMeta.unit ? ` ${yMeta.unit}` : ''}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      interval={0}
                      width={150}
                      stroke={axisStroke}
                      tick={({ x, y, payload }) => {
                        const val = String(payload?.value ?? '');
                        const isStatusLabel = val === 'ACTIVE TEST';
                        return (
                          <text
                            x={x}
                            y={y}
                            dx={-4}
                            dy={4}
                            textAnchor="end"
                            fill={axisStroke}
                            fontSize={11}
                            fontFamily={isStatusLabel ? 'Inter, sans-serif' : 'JetBrains Mono, monospace'}
                          >
                            {val}
                          </text>
                        );
                      }}
                    />
                    <Tooltip content={renderCustomTooltip as never} />
                    {showQuenchRef && (
                      <ReferenceLine x={0.48} stroke="#10B981" strokeDasharray="4 4" strokeWidth={1.5} />
                    )}
                    <Bar
                      dataKey="val"
                      name={`${yMeta.label} (${yMeta.unit ?? ''})`}
                      radius={[0, 3, 3, 0]}
                      isAnimationActive={false}
                      className="cursor-pointer"
                      onClick={(item) => {
                        if (ctx.wasRecentlyDragged()) return;
                        const row = (item as { payload?: { id?: string; isSim?: boolean } })?.payload;
                        if (row?.id && !row.isSim) onInspectRun(row.id);
                      }}
                    >
                      {visibleRows.map((entry) => (
                        <Cell
                          key={entry.id}
                          fill={entry.color}
                          fillOpacity={hoveredRunId && hoveredRunId !== entry.id && !entry.isSim ? 0.3 : 0.9}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          }}
        </InteractiveChartViewport>
      </div>
    );
  }

  // 8. CLEVELAND LOLLIPOP PLOT (Desmos X-Scale & Row-Window Zoom/Pan)
  if (vizMode === 'lollipop-dot') {
    const paramMeta =
      STUDIO_NUMERIC_COLUMNS.find((p) => p.key === numericY) ?? STUDIO_NUMERIC_COLUMNS[7];
    const simVal = getSimParamValue(numericY, sliders, simulation);
    const items = activeRuns.slice(0, 14).map((r) => ({
      run: r,
      val: r[numericY],
      delta: r[numericY] - simVal,
    }));
    const allVals = [simVal, ...items.map((i) => i.val)];
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);
    const pad = Math.max((maxV - minV) * 0.12, 0.2);
    const domMin = Math.max(0, minV - pad);
    const domMax = maxV + pad;

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-xs">
          <span className="font-sans text-zinc-500">
            Stem delta on {paramMeta.label} relative to active Virtual Test baseline
          </span>
          <span className="font-sans text-[11px] font-semibold">
            Baseline:{' '}
            <span className="font-mono tabular-nums">
              {paramMeta.format(simVal)} {paramMeta.unit}
            </span>
          </span>
        </div>

        <InteractiveChartViewport
          theme={theme}
          baseXDomain={{ min: domMin, max: Math.max(domMin + 0.1, domMax) }}
          baseYDomain={{ min: 0, max: Math.max(1, items.length - 1) }}
          resetKey={resetKey}
          xTickCount={6}
          yTickCount={items.length}
          integerY={true}
          xUnit={paramMeta.unit}
          plotInsets={{ left: 0.18, right: 0.16, top: 0.08, bottom: 0.08 }}
        >
          {(ctx) => {
            const xMin = ctx.xDomain.min;
            const xMax = ctx.xDomain.max;
            const xSpan = Math.max(1e-6, xMax - xMin);
            const toRawPct = (v: number) => ((v - xMin) / xSpan) * 100;
            const simPct = toRawPct(simVal);
            const rStart = Math.max(0, Math.floor(ctx.yDomain.min));
            const rEnd = Math.min(items.length - 1, Math.ceil(ctx.yDomain.max));
            const visibleItems =
              ctx.yZoomRatio > 1.03 || rStart > 0 || rEnd < items.length - 1
                ? items.slice(
                    Math.min(rStart, Math.max(0, items.length - 2)),
                    Math.max(Math.min(items.length, rStart + 2), rEnd + 1)
                  )
                : items;

            return (
              <div
                className={`border rounded-[5px] p-3.5 space-y-2.5 ${
                  isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/70 border-[#E4E4E7]'
                }`}
              >
                {/* Live Desmos X Scale Ruler */}
                <div className="grid grid-cols-12 items-center gap-3 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A]">
                  <div className="col-span-3 sm:col-span-2 font-sans text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Run ID
                  </div>
                  <div className="col-span-6 sm:col-span-8 relative h-4 font-mono text-[10px] tabular-nums text-zinc-400">
                    {ctx.xTicks.ticks.map((tk, idx) => {
                      const pos = toRawPct(tk);
                      if (pos < -2 || pos > 102) return null;
                      return (
                        <span
                          key={`lol-tk-${tk}-${idx}`}
                          className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                          style={{ left: `${Math.max(2, Math.min(98, pos))}%` }}
                        >
                          {ctx.xTicks.labels[idx] ?? paramMeta.format(tk)}
                        </span>
                      );
                    })}
                  </div>
                  <div className="col-span-3 sm:col-span-2 text-right font-sans text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Delta
                  </div>
                </div>

                {visibleItems.map(({ run, val, delta }) => {
                  const dotPct = toRawPct(val);
                  const segStart = Math.max(0, Math.min(100, Math.min(simPct, dotPct)));
                  const segEnd = Math.max(0, Math.min(100, Math.max(simPct, dotPct)));
                  const segWidth = Math.max(0, segEnd - segStart);
                  const isDimmed = hoveredRunId !== null && hoveredRunId !== run.id;
                  const dotCol = getGroupColor(run, colorByKey, groupIndexMap, isDark);

                  return (
                    <div
                      key={run.id}
                      onMouseEnter={() => onHoverRun(run.id)}
                      onMouseLeave={() => onHoverRun(null)}
                      onClick={() => {
                        if (!ctx.wasRecentlyDragged()) onInspectRun(run.id);
                      }}
                      className={`grid grid-cols-12 items-center gap-3 cursor-pointer transition-opacity ${
                        isDimmed ? 'opacity-30' : 'opacity-100'
                      }`}
                    >
                      <div className="col-span-3 sm:col-span-2 truncate">
                        <div className="font-mono text-xs font-semibold truncate">
                          {run.runCode ? `${run.psiId.split(' ')[0]} · ${run.runCode}` : run.psiId}
                        </div>
                        <div className="font-sans text-[10px] text-zinc-500 truncate">{run.material}</div>
                      </div>
                      <div className="col-span-6 sm:col-span-8 relative h-5 flex items-center overflow-hidden">
                        <div className="w-full h-[1px]" style={{ backgroundColor: gridStroke }} />
                        {simPct >= 0 && simPct <= 100 && (
                          <div
                            className="absolute top-0.5 bottom-0.5 w-[2px]"
                            style={{ left: `${simPct}%`, backgroundColor: textPrimary }}
                          />
                        )}
                        {segWidth > 0 && (
                          <div
                            className="absolute h-[2.5px]"
                            style={{
                              left: `${segStart}%`,
                              width: `${Math.max(segWidth, 0.4)}%`,
                              backgroundColor: dotCol,
                            }}
                          />
                        )}
                        {dotPct >= 0 && dotPct <= 100 && (
                          <div
                            className="absolute w-3 h-3 rounded-[3px] -translate-x-1/2 border"
                            style={{
                              left: `${dotPct}%`,
                              backgroundColor: dotCol,
                              borderColor: monoBg,
                            }}
                          />
                        )}
                      </div>
                      <div className="col-span-3 sm:col-span-2 text-right font-mono text-[11px] tabular-nums">
                        <span className="font-bold">
                          {paramMeta.format(val)} {paramMeta.unit}
                        </span>
                        <span className={`block text-[10px] ${delta > 0 ? 'text-[#EF4444]' : 'text-[#10B981]'}`}>
                          {delta >= 0 ? '+' : ''}
                          {paramMeta.format(delta)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }}
        </InteractiveChartViewport>
      </div>
    );
  }

  // 9. TELEMETRY HISTOGRAM (Live Re-Binning Inside Zoomed [xMin, xMax] + Count Y Scaling)
  if (vizMode === 'histogram') {
    const histMeta =
      STUDIO_NUMERIC_COLUMNS.find((p) => p.key === histogramMetric) ??
      STUDIO_NUMERIC_COLUMNS[7];

    return (
      <InteractiveChartViewport
        theme={theme}
        baseXDomain={histogramBaseBounds.xDomain}
        baseYDomain={{ min: 0, max: histogramBaseBounds.maxCount }}
        resetKey={resetKey}
        xTickCount={6}
        yTickCount={5}
        integerY={true}
        xUnit={histMeta.unit}
        yUnit="runs"
        plotInsets={{
          left: 50 / 920,
          right: 24 / 920,
          top: 36 / 300,
          bottom: 48 / 300,
        }}
      >
        {(ctx) => {
          const slice = computeHistogramSlice(ctx.xDomain, ctx.yDomain);
          return (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] font-sans text-[11px]">
                <span className="font-sans text-xs text-zinc-500">
                  Binning: {slice.paramMeta.label} ({slice.paramMeta.unit})
                </span>
                <div className="flex flex-wrap items-center gap-4">
                  <span>
                    in-window n = <strong className="font-mono tabular-nums">{slice.inWindowCount}</strong>
                  </span>
                  <span>
                    Mean:{' '}
                    <strong className="font-mono tabular-nums">
                      {slice.paramMeta.format(slice.mean)} {slice.paramMeta.unit}
                    </strong>
                  </span>
                  <span>
                    Median:{' '}
                    <strong className="font-mono tabular-nums">
                      {slice.paramMeta.format(slice.median)} {slice.paramMeta.unit}
                    </strong>
                  </span>
                  <span className="text-[#EF4444] font-semibold">
                    ■ Active Point Bin (
                    <span className="font-mono tabular-nums">
                      {slice.paramMeta.format(slice.simVal)} {slice.paramMeta.unit}
                    </span>
                    )
                  </span>
                </div>
              </div>
              <EChartsCanvas
                option={slice.option}
                height={300}
                ariaLabel="Telemetry Histogram"
              />
            </div>
          );
        }}
      </InteractiveChartViewport>
    );
  }

  // 10. FREQUENCY DISTRIBUTION BARS (Independent Desmos Y-Count & Category Slice Zoom per Card)
  if (vizMode === 'frequency-distribution') {
    const groupCountsMap = new Map<string, number>();
    activeRuns.forEach((r) => {
      const k = String(r[colorByKey]);
      groupCountsMap.set(k, (groupCountsMap.get(k) ?? 0) + 1);
    });
    const groupCounts = Array.from(groupCountsMap.entries())
      .map(([name, count], idx) => ({
        name,
        count,
        color:
          colorByKey === 'outcome'
            ? outcomeColor(name as HazardOutcome)
            : CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length],
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const facilities = Array.from(new Set(activeRuns.map((r) => r.facility)));
    const facilityCounts = facilities.map((f) => ({
      name: f,
      count: activeRuns.filter((r) => r.facility === f).length,
    }));

    const maxGroupCnt = Math.max(2, ...groupCounts.map((g) => g.count));
    const maxFacCnt = Math.max(2, ...facilityCounts.map((f) => f.count));

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`p-3.5 rounded-[5px] border ${isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/60 border-[#E4E4E7]'}`}>
          <div className="text-xs font-sans font-semibold mb-2">
            Frequency by {getAxisMeta(colorByKey).label} (n = {activeRuns.length})
          </div>
          <InteractiveChartViewport
            theme={theme}
            baseXDomain={{ min: 0, max: Math.max(1, groupCounts.length - 1) }}
            baseYDomain={{ min: 0, max: Math.ceil(maxGroupCnt * 1.15) }}
            resetKey={`${resetKey}-freq-g`}
            integerX={true}
            integerY={true}
            yTickCount={5}
            yUnit="runs"
            plotInsets={{ left: 0.08, right: 0.03, top: 0.06, bottom: 0.14 }}
          >
            {(ctx) => {
              const sIdx = Math.max(0, Math.floor(ctx.xDomain.min));
              const eIdx = Math.min(groupCounts.length - 1, Math.ceil(ctx.xDomain.max));
              const visible =
                ctx.xZoomRatio > 1.03 || sIdx > 0 || eIdx < groupCounts.length - 1
                  ? groupCounts.slice(
                      Math.min(sIdx, Math.max(0, groupCounts.length - 2)),
                      Math.max(Math.min(groupCounts.length, sIdx + 2), eIdx + 1)
                    )
                  : groupCounts;
              return (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={visible} margin={{ top: 10, right: 16, left: -10, bottom: 8 }}>
                      <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" stroke={axisStroke} tick={{ fontSize: 10.5, fontFamily: 'Inter, sans-serif', fill: axisStroke }} />
                      <YAxis
                        allowDecimals={false}
                        domain={[ctx.yDomain.min, ctx.yDomain.max]}
                        ticks={ctx.yTicks.ticks}
                        allowDataOverflow={true}
                        stroke={axisStroke}
                        tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                      />
                      <Tooltip content={renderCustomTooltip as never} />
                      <Bar dataKey="count" name="Runs" radius={[3, 3, 0, 0]} maxBarSize={52} isAnimationActive={false}>
                        {visible.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            }}
          </InteractiveChartViewport>
        </div>

        <div className={`p-3.5 rounded-[5px] border ${isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/60 border-[#E4E4E7]'}`}>
          <div className="text-xs font-sans font-semibold mb-2">Frequency by Hardware Facility</div>
          <InteractiveChartViewport
            theme={theme}
            baseXDomain={{ min: 0, max: Math.max(1, facilityCounts.length - 1) }}
            baseYDomain={{ min: 0, max: Math.ceil(maxFacCnt * 1.15) }}
            resetKey={`${resetKey}-freq-f`}
            integerX={true}
            integerY={true}
            yTickCount={5}
            yUnit="runs"
            plotInsets={{ left: 0.08, right: 0.03, top: 0.06, bottom: 0.14 }}
          >
            {(ctx) => {
              const sIdx = Math.max(0, Math.floor(ctx.xDomain.min));
              const eIdx = Math.min(facilityCounts.length - 1, Math.ceil(ctx.xDomain.max));
              const visible =
                ctx.xZoomRatio > 1.03 || sIdx > 0 || eIdx < facilityCounts.length - 1
                  ? facilityCounts.slice(
                      Math.min(sIdx, Math.max(0, facilityCounts.length - 2)),
                      Math.max(Math.min(facilityCounts.length, sIdx + 2), eIdx + 1)
                    )
                  : facilityCounts;
              return (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={visible} margin={{ top: 10, right: 16, left: -10, bottom: 8 }}>
                      <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fill: axisStroke }} />
                      <YAxis
                        allowDecimals={false}
                        domain={[ctx.yDomain.min, ctx.yDomain.max]}
                        ticks={ctx.yTicks.ticks}
                        allowDataOverflow={true}
                        stroke={axisStroke}
                        tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                      />
                      <Tooltip content={renderCustomTooltip as never} />
                      <Bar dataKey="count" name="Runs" fill={isDark ? '#E4E4E7' : '#18181B'} radius={[3, 3, 0, 0]} maxBarSize={52} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            }}
          </InteractiveChartViewport>
        </div>
      </div>
    );
  }

  // 11. CONFIDENCE INTERVAL RANGE PLOT (Desmos X-Velocity & Row Zoom/Pan)
  if (vizMode === 'range-interval-bar') {
    const items = [
      {
        id: 'sim-active',
        psiId: 'ACTIVE VIRTUAL TEST',
        material: `${sliders.O2_pct.toFixed(1)}% O₂ · ${sliders.Thickness_mm.toFixed(1)}mm`,
        low: Math.max(0, simulation.flameSpread_mms - simulation.confidenceInterval_mms),
        mid: simulation.flameSpread_mms,
        high: simulation.flameSpread_mms + simulation.confidenceInterval_mms,
        ci: simulation.confidenceInterval_mms,
        temp: simulation.peakTemp_K,
        outcome: simulation.hazardStatus,
        isSim: true,
      },
      ...activeRuns.slice(0, 12).map((r) => {
        const ci = Number(Math.max(0.04, r.flameSpread_mms * 0.05 + 0.01 * r.Flow_ms).toFixed(2));
        return {
          id: r.id,
          psiId: r.runCode ? `${r.psiId.split(' ')[0]} · ${r.runCode}` : r.psiId,
          material: r.material,
          low: Math.max(0, Number((r.flameSpread_mms - ci).toFixed(2))),
          mid: r.flameSpread_mms,
          high: Number((r.flameSpread_mms + ci).toFixed(2)),
          ci,
          temp: r.peakTemp_K,
          outcome: r.outcome,
          isSim: false,
        };
      }),
    ];

    const maxHigh = Math.max(3.5, ...items.map((i) => i.high * 1.1));

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-xs">
          <span className="font-sans text-zinc-500">
            ±95% confidence bounds around observed & modeled flame spread velocities (mm/s).
          </span>
          <span className="font-sans text-[11px] text-[#10B981] font-semibold">
            Dashed Line = <span className="font-mono tabular-nums">0.48 mm/s</span> Quench Bound
          </span>
        </div>

        <InteractiveChartViewport
          theme={theme}
          baseXDomain={{ min: 0, max: Number(maxHigh.toFixed(2)) }}
          baseYDomain={{ min: 0, max: Math.max(1, items.length - 1) }}
          resetKey={resetKey}
          xTickCount={6}
          integerY={true}
          xUnit="mm/s"
          plotInsets={{ left: 0.25, right: 0.22, top: 0.08, bottom: 0.08 }}
        >
          {(ctx) => {
            const xMin = ctx.xDomain.min;
            const xMax = ctx.xDomain.max;
            const xSpan = Math.max(1e-6, xMax - xMin);
            const toPct = (v: number) => ((v - xMin) / xSpan) * 100;
            const quenchPct = toPct(0.48);
            const rStart = Math.max(0, Math.floor(ctx.yDomain.min));
            const rEnd = Math.min(items.length - 1, Math.ceil(ctx.yDomain.max));
            const visibleItems =
              ctx.yZoomRatio > 1.03 || rStart > 0 || rEnd < items.length - 1
                ? items.slice(
                    Math.min(rStart, Math.max(0, items.length - 2)),
                    Math.max(Math.min(items.length, rStart + 2), rEnd + 1)
                  )
                : items;

            return (
              <div className={`border rounded-[5px] p-3.5 space-y-2.5 ${isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/70 border-[#E4E4E7]'}`}>
                {/* Scale tick ruler */}
                <div className="grid grid-cols-12 items-center gap-3 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A]">
                  <div className="col-span-4 sm:col-span-3 font-sans text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Test Record
                  </div>
                  <div className="col-span-5 sm:col-span-6 relative h-4 font-mono text-[10px] tabular-nums text-zinc-400">
                    {ctx.xTicks.ticks.map((tk, idx) => {
                      const pos = toPct(tk);
                      if (pos < -2 || pos > 102) return null;
                      return (
                        <span
                          key={`rng-tk-${tk}-${idx}`}
                          className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                          style={{ left: `${Math.max(2, Math.min(98, pos))}%` }}
                        >
                          {ctx.xTicks.labels[idx] ?? tk.toFixed(1)}
                        </span>
                      );
                    })}
                  </div>
                  <div className="col-span-3 text-right font-sans text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Spread ± CI
                  </div>
                </div>

                {visibleItems.map((item) => {
                  const leftRaw = toPct(item.low);
                  const rightRaw = toPct(item.high);
                  const clipL = Math.max(0, Math.min(100, leftRaw));
                  const clipR = Math.max(0, Math.min(100, rightRaw));
                  const midRaw = toPct(item.mid);
                  const col = item.isSim ? textPrimary : outcomeColor(item.outcome);
                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => !item.isSim && onHoverRun(item.id)}
                      onMouseLeave={() => onHoverRun(null)}
                      onClick={() => {
                        if (!ctx.wasRecentlyDragged() && !item.isSim) onInspectRun(item.id);
                      }}
                      className={`grid grid-cols-12 items-center gap-3 ${!item.isSim ? 'cursor-pointer' : ''}`}
                    >
                      <div className="col-span-4 sm:col-span-3 truncate">
                        <div className="font-mono text-xs font-semibold truncate">{item.psiId}</div>
                        <div className="font-sans text-[10px] text-zinc-500 truncate">{item.material}</div>
                      </div>
                      <div className="col-span-5 sm:col-span-6 relative h-5 flex items-center overflow-hidden">
                        <div className="w-full h-[1px]" style={{ backgroundColor: gridStroke }} />
                        {quenchPct >= 0 && quenchPct <= 100 && (
                          <div className="absolute top-0 bottom-0 border-l border-dashed border-[#10B981]" style={{ left: `${quenchPct}%` }} />
                        )}
                        {clipR > clipL && (
                          <div
                            className="absolute h-2 rounded-[2px] opacity-80"
                            style={{ left: `${clipL}%`, width: `${Math.max(clipR - clipL, 1.2)}%`, backgroundColor: col }}
                          />
                        )}
                        {midRaw >= 0 && midRaw <= 100 && (
                          <div
                            className="absolute w-1.5 h-3.5 -translate-x-1/2 rounded-[1px]"
                            style={{ left: `${midRaw}%`, backgroundColor: textPrimary }}
                          />
                        )}
                      </div>
                      <div className="col-span-3 text-right font-mono text-[11px] tabular-nums">
                        <span className="font-bold">
                          {item.mid.toFixed(2)} ± {item.ci.toFixed(2)}
                        </span>{' '}
                        <span className="text-zinc-500">mm/s</span>
                        <span className="block text-[10px] text-zinc-500">
                          {item.temp} K <span className="font-sans">peak</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }}
        </InteractiveChartViewport>
      </div>
    );
  }

  // 12. BOX & QUARTILE DISTRIBUTION (Desmos Normalized Quantile Window Zoom & Pan)
  if (vizMode === 'box-quartile') {
    const baseMetrics: Array<{
      key: NumericAxisKey;
      label: string;
      unit: string;
      minScale: number;
      maxScale: number;
      format: (v: number) => string;
    }> = [
      { key: 'O2_pct', label: 'O₂ %', unit: '%', minScale: 14, maxScale: 45, format: (v) => v.toFixed(1) },
      { key: 'P_psi', label: 'Pressure', unit: 'psi', minScale: 4, maxScale: 16, format: (v) => v.toFixed(1) },
      { key: 'Flow_ms', label: 'Airflow', unit: 'm/s', minScale: 0, maxScale: 0.4, format: (v) => v.toFixed(2) },
      { key: 'g_eff', label: 'Gravity', unit: 'g', minScale: 0, maxScale: 1.0, format: (v) => v.toFixed(3) },
      { key: 'Thickness_mm', label: 'Thickness', unit: 'mm', minScale: 0, maxScale: 8, format: (v) => v.toFixed(1) },
      { key: 'flameSpread_mms', label: 'Flame Spread', unit: 'mm/s', minScale: 0, maxScale: 3.5, format: (v) => v.toFixed(2) },
      { key: 'peakTemp_K', label: 'Peak Temp', unit: 'K', minScale: 500, maxScale: 1600, format: (v) => `${Math.round(v)}` },
      { key: 'radiometerFlux_Wm2', label: 'IR Flux', unit: 'W/m²', minScale: 0, maxScale: 20000, format: (v) => `${Math.round(v)}` },
    ];
    const metrics = [
      ...baseMetrics.filter((m) => m.key === numericY || m.key === numericX),
      ...baseMetrics.filter((m) => m.key !== numericY && m.key !== numericX),
    ];

    const stats = metrics.map((m) => {
      const vals = activeRuns.map((r) => r[m.key]).sort((a, b) => a - b);
      const min = vals[0] ?? 0;
      const max = vals[vals.length - 1] ?? 0;
      const q1 = quantile(vals, 0.25);
      const med = quantile(vals, 0.5);
      const q3 = quantile(vals, 0.75);
      const simVal = getSimParamValue(m.key, sliders, simulation);
      const effMin = Math.min(m.minScale, min, simVal);
      const effMax = Math.max(m.maxScale, max, simVal, effMin + 1e-4);
      const norm = (v: number) =>
        Math.max(0, Math.min(100, ((v - effMin) / (effMax - effMin)) * 100));
      return { ...m, min, q1, med, q3, max, simVal, norm };
    });

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-xs">
          <span className="font-sans text-zinc-500">
            5-Number Quartile Summary (Min, Q1, Median, Q3, Max) across n = {activeRuns.length} samples.
          </span>
          <span className="font-sans text-[11px] text-[#EF4444] font-semibold">
            ◆ Active Virtual Test State
          </span>
        </div>

        <InteractiveChartViewport
          theme={theme}
          baseXDomain={{ min: 0, max: 100 }}
          baseYDomain={{ min: 0, max: Math.max(1, stats.length - 1) }}
          resetKey={resetKey}
          defaultLockMode="x"
          showAxisLock={false}
          xTickCount={6}
          xUnit="%"
          plotInsets={{ left: 0.03, right: 0.03, top: 0.06, bottom: 0.08 }}
        >
          {(ctx) => {
            const xMin = ctx.xDomain.min;
            const xMax = ctx.xDomain.max;
            const xSpan = Math.max(1e-6, xMax - xMin);
            const mapPct = (rawPct: number) => ((rawPct - xMin) / xSpan) * 100;

            return (
              <div className="space-y-2.5">
                <div
                  className={`px-3 py-1.5 rounded-[5px] border flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums ${
                    isDark
                      ? 'bg-[#09090B]/70 border-[#27272A] text-zinc-400'
                      : 'bg-zinc-50 border-[#E4E4E7] text-zinc-600'
                  }`}
                >
                  <span className="font-sans font-semibold text-[10.5px]">
                    Quantile Window:
                  </span>
                  <div className="relative flex-1 h-4">
                    {ctx.xTicks.ticks.map((tk, idx) => {
                      const pos = mapPct(tk);
                      if (pos < -2 || pos > 102) return null;
                      return (
                        <span
                          key={`bq-tk-${tk}-${idx}`}
                          className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                          style={{ left: `${Math.max(2, Math.min(98, pos))}%` }}
                        >
                          {ctx.xTicks.labels[idx] ?? tk.toFixed(0)}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {stats.map((s) => {
                    const pMin = mapPct(s.norm(s.min));
                    const pQ1 = mapPct(s.norm(s.q1));
                    const pMed = mapPct(s.norm(s.med));
                    const pQ3 = mapPct(s.norm(s.q3));
                    const pMax = mapPct(s.norm(s.max));
                    const pSim = mapPct(s.norm(s.simVal));

                    const wStart = Math.max(0, Math.min(100, pMin));
                    const wEnd = Math.max(0, Math.min(100, pMax));
                    const bStart = Math.max(0, Math.min(100, pQ1));
                    const bEnd = Math.max(0, Math.min(100, pQ3));

                    return (
                      <div
                        key={s.key}
                        className={`p-3 rounded-[5px] border space-y-2 ${
                          isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/70 border-[#E4E4E7]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-sans font-semibold">{s.label}</span>
                          <span className="font-sans text-[11px]">
                            Med: <strong className="font-mono tabular-nums">{s.format(s.med)}</strong> · Active:{' '}
                            <strong className="font-mono tabular-nums text-[#EF4444]">
                              {s.format(s.simVal)} {s.unit}
                            </strong>
                          </span>
                        </div>
                        <div className="relative h-6 flex items-center overflow-hidden">
                          <div className="w-full h-[1px]" style={{ backgroundColor: gridStroke }} />
                          {wEnd > wStart && (
                            <div
                              className="absolute h-[2px]"
                              style={{
                                left: `${wStart}%`,
                                width: `${Math.max(wEnd - wStart, 0.5)}%`,
                                backgroundColor: axisStroke,
                              }}
                            />
                          )}
                          {bEnd > bStart && (
                            <div
                              className="absolute h-4 rounded-[2px] border"
                              style={{
                                left: `${bStart}%`,
                                width: `${Math.max(bEnd - bStart, 1.5)}%`,
                                backgroundColor: isDark ? 'rgba(250,250,250,0.16)' : 'rgba(24,24,27,0.12)',
                                borderColor: axisStroke,
                              }}
                            />
                          )}
                          {pMed >= 0 && pMed <= 100 && (
                            <div
                              className="absolute h-4 w-[2.5px]"
                              style={{ left: `${pMed}%`, backgroundColor: '#10B981' }}
                            />
                          )}
                          {pSim >= 0 && pSim <= 100 && (
                            <div
                              className="absolute w-2.5 h-2.5 rotate-45 -translate-x-1/2 bg-[#EF4444] border border-white dark:border-zinc-950"
                              style={{ left: `${pSim}%` }}
                            />
                          )}
                        </div>
                        <div className="flex items-center justify-between font-sans text-[10px] text-zinc-500">
                          <span>Min <span className="font-mono tabular-nums">{s.format(s.min)}</span></span>
                          <span>Q1 <span className="font-mono tabular-nums">{s.format(s.q1)}</span></span>
                          <span>Q3 <span className="font-mono tabular-nums">{s.format(s.q3)}</span></span>
                          <span>Max <span className="font-mono tabular-nums">{s.format(s.max)}</span></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }}
        </InteractiveChartViewport>
      </div>
    );
  }

  // 13. BIVARIATE DENSITY STRIP PLOT (Desmos X-Zoom, Adaptive Marker Sizing, Progressive IDs & Glass Tooltip)
  if (vizMode === 'density-strip') {
    const yMeta = getAxisMeta(numericY);
    const categories = Array.from(new Set(activeRuns.map((r) => String(r[colorByKey])))).slice(0, 6);
    const simTargetVal = getSimParamValue(numericY, sliders, simulation);
    const vals = activeRuns.map((r) => r[numericY]);
    const minVal = Math.min(...vals, simTargetVal);
    const maxVal = Math.max(...vals, simTargetVal);
    const pad = Math.max((maxVal - minVal) * 0.05, 0.1);
    const hoveredStripRun = hoveredRunId
      ? activeRuns.find((r) => r.id === hoveredRunId) ?? null
      : null;

    return (
      <div className="space-y-2.5 relative">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-xs">
          <span className="font-sans text-zinc-500">
            Strip dispersion on {yMeta.label} ({yMeta.unit ?? ''}) grouped by{' '}
            {getAxisMeta(colorByKey).label} ({activeRuns.length} observations)
          </span>
          <span className="font-sans text-[11px] text-[#EF4444] font-semibold">
            Dashed Rule = Active Point (
            <span className="font-mono tabular-nums">
              {yMeta.format ? yMeta.format(simTargetVal) : ''} {yMeta.unit}
            </span>
            )
          </span>
        </div>

        <InteractiveChartViewport
          theme={theme}
          baseXDomain={{ min: minVal - pad, max: maxVal + pad }}
          baseYDomain={{ min: 0, max: Math.max(1, categories.length - 1) }}
          resetKey={resetKey}
          defaultLockMode="x"
          showAxisLock={false}
          xTickCount={6}
          xUnit={yMeta.unit ?? ''}
          plotInsets={{ left: 0.18, right: 0.03, top: 0.08, bottom: 0.08 }}
        >
          {(ctx) => {
            const xMin = ctx.xDomain.min;
            const xMax = ctx.xDomain.max;
            const xSpan = Math.max(1e-6, xMax - xMin);
            const toPct = (v: number) => ((v - xMin) / xSpan) * 100;
            const simPct = toPct(simTargetVal);

            const visibleRunsPerCat = categories.map((cat) => {
              const catRuns = activeRuns.filter(
                (r) =>
                  String(r[colorByKey]) === cat &&
                  r[numericY] >= xMin &&
                  r[numericY] <= xMax
              );
              return { cat, totalCount: activeRuns.filter((r) => String(r[colorByKey]) === cat).length, catRuns: catRuns.slice(0, ctx.xZoomRatio > 1.4 ? 120 : 60) };
            });
            const totalVisibleCount = visibleRunsPerCat.reduce(
              (acc, c) => acc + c.catRuns.length,
              0
            );
            const markerStyle = computeAdaptiveMarkerStyle(
              Math.max(1, Math.round(totalVisibleCount / Math.max(1, categories.length))),
              ctx.xZoomRatio,
              4.0
            );

            return (
              <div className="relative">
                {hoveredStripRun && (
                  <RunTelemetryGlassTooltip
                    theme={theme}
                    run={hoveredStripRun}
                    extraMetrics={[
                      {
                        label: yMeta.shortLabel,
                        value: `${Number(hoveredStripRun[numericY]).toFixed(2)} ${yMeta.unit ?? ''}`,
                      },
                    ]}
                  />
                )}
                <div className={`border rounded-[5px] p-3.5 space-y-3 ${isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/70 border-[#E4E4E7]'}`}>
                  {/* Desmos X Tick Ruler */}
                  <div className="grid grid-cols-12 items-center gap-3 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A]">
                    <div className="col-span-3 sm:col-span-2 font-sans text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      {getAxisMeta(colorByKey).label}
                    </div>
                    <div className="col-span-9 sm:col-span-10 relative h-4 font-mono text-[10px] tabular-nums text-zinc-400">
                      {ctx.xTicks.ticks.map((tk, idx) => {
                        const pos = toPct(tk);
                        if (pos < -2 || pos > 102) return null;
                        return (
                          <span
                            key={`ds-tk-${tk}-${idx}`}
                            className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                            style={{ left: `${Math.max(2, Math.min(98, pos))}%` }}
                          >
                            {ctx.xTicks.labels[idx] ?? tk.toFixed(1)}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {visibleRunsPerCat.map(({ cat, totalCount, catRuns }) => (
                    <div key={cat} className="grid grid-cols-12 items-center gap-3">
                      <div className="col-span-3 sm:col-span-2 truncate">
                        <div className="font-sans text-xs font-semibold truncate">{cat}</div>
                        <div className="font-sans text-[10px] text-zinc-500">
                          n ={' '}
                          <span className="font-mono tabular-nums">
                            {catRuns.length}/{totalCount}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-9 sm:col-span-10 relative h-8 flex items-center overflow-hidden">
                        <svg viewBox="0 0 720 32" className="w-full h-8 select-none overflow-visible">
                          <line x1={0} y1={16} x2={720} y2={16} stroke={gridStroke} strokeWidth={1} />
                          {simPct >= 0 && simPct <= 100 && (
                            <line
                              x1={(simPct / 100) * 720}
                              y1={2}
                              x2={(simPct / 100) * 720}
                              y2={30}
                              stroke="#EF4444"
                              strokeDasharray="4 3"
                              strokeWidth={1.25}
                            />
                          )}
                          {catRuns.map((r, idx) => {
                            const sx = Math.max(4, Math.min(716, (toPct(r[numericY]) / 100) * 720));
                            const sy = 9 + ((idx * 7) % 14);
                            const isHighlighted = hoveredRunId === r.id;
                            const isDimmed = hoveredRunId !== null && hoveredRunId !== r.id;
                            const fillCol = getGroupColor(r, colorByKey, groupIndexMap, isDark);
                            const showTag = (markerStyle.showLabels && idx < 12) || isHighlighted;

                            return (
                              <g
                                key={r.id}
                                className="cursor-pointer transition-opacity duration-150"
                                style={{
                                  opacity: isDimmed ? markerStyle.dimOpacity : 1,
                                }}
                                onMouseEnter={() => onHoverRun(r.id)}
                                onMouseLeave={() => onHoverRun(null)}
                                onClick={() => {
                                  if (!ctx.wasRecentlyDragged()) onInspectRun(r.id);
                                }}
                              >
                                {isHighlighted && (
                                  <circle
                                    cx={sx}
                                    cy={sy}
                                    r={markerStyle.activeRadius + 3.5}
                                    fill="none"
                                    stroke={fillCol}
                                    strokeWidth={1.5}
                                  />
                                )}
                                <circle
                                  cx={sx}
                                  cy={sy}
                                  r={isHighlighted ? markerStyle.activeRadius : markerStyle.radius}
                                  fill={fillCol}
                                  fillOpacity={isHighlighted ? 0.96 : markerStyle.fillOpacity}
                                  stroke={monoBg}
                                  strokeWidth={isHighlighted ? 1.5 : markerStyle.haloWidth}
                                />
                                {showTag && (
                                  <text
                                    x={sx + markerStyle.radius + 3}
                                    y={sy + 3}
                                    fill={isDark ? '#E4E4E7' : '#27272A'}
                                    fontSize="8.5"
                                    fontFamily="JetBrains Mono, monospace"
                                    pointerEvents="none"
                                  >
                                    {r.runCode || r.psiId.split(' ')[0]}
                                  </text>
                                )}
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
        </InteractiveChartViewport>
      </div>
    );
  }

  // 14. MULTI-AXIS SCATTER PLOT (Desmos Domain Zoom/Pan, Adaptive Points, 16px Magnetic Snap & Glass Tooltip)
  if (vizMode === 'scatter-plot') {
    const xMeta = getAxisMeta(numericX);
    const yMeta = getAxisMeta(numericY);
    const points: ScatterPlotPoint[] = activeRuns.slice(0, 450).map((r) => ({
      run: r,
      x: r[numericX],
      y: r[numericY],
      color: getGroupColor(r, colorByKey, groupIndexMap, isDark),
    }));

    return (
      <InteractiveScatterPlot
        theme={theme}
        mode="scatter"
        resetKey={resetKey}
        xLabel={xMeta.label}
        yLabel={yMeta.label}
        xUnit={xMeta.unit ?? ''}
        yUnit={yMeta.unit ?? ''}
        points={points}
        simPoint={{
          x: getSimParamValue(numericX, sliders, simulation),
          y: getSimParamValue(numericY, sliders, simulation),
          label: 'Active Test',
        }}
        hoveredRunId={hoveredRunId}
        onHoverRun={onHoverRun}
        onInspectRun={onInspectRun}
        legendText={`X: ${xMeta.label} vs. Y: ${yMeta.label} · Colored by ${getAxisMeta(colorByKey).label} (${points.length} points)`}
        rightHintText="Scroll to zoom · Drag to pan · Hover near point (16px snap) or click to inspect"
      />
    );
  }

  // 15. BUBBLE MULTI-METRIC PLOT (Desmos Zoom/Pan, IR Flux Area Sizing, 16px Magnetic Snap)
  if (vizMode === 'bubble-plot') {
    const xMeta = getAxisMeta(numericX);
    const yMeta = getAxisMeta(numericY);
    const points: ScatterPlotPoint[] = activeRuns.slice(0, 300).map((r) => ({
      run: r,
      x: r[numericX],
      y: r[numericY],
      z: r.radiometerFlux_Wm2,
      color: getGroupColor(r, colorByKey, groupIndexMap, isDark),
    }));

    return (
      <InteractiveScatterPlot
        theme={theme}
        mode="bubble"
        resetKey={resetKey}
        xLabel={xMeta.label}
        yLabel={yMeta.label}
        xUnit={xMeta.unit ?? ''}
        yUnit={yMeta.unit ?? ''}
        points={points}
        simPoint={{
          x: getSimParamValue(numericX, sliders, simulation),
          y: getSimParamValue(numericY, sliders, simulation),
          label: 'Active Test',
        }}
        hoveredRunId={hoveredRunId}
        onHoverRun={onHoverRun}
        onInspectRun={onInspectRun}
        legendText={`X = ${xMeta.label}, Y = ${yMeta.label}, Radius = IR Radiometer Flux (W/m²), Color = ${getAxisMeta(colorByKey).label}`}
        rightHintText="Scroll to zoom · Drag to pan · 16px magnetic snap"
      />
    );
  }

  // 16. RESIDUAL SPREAD DEVIATION PLOT (Desmos Zoom/Pan, Zero Baseline & 16px Magnetic Snap)
  if (vizMode === 'residual-deviation') {
    const xMeta = getAxisMeta(numericX);
    const points: ScatterPlotPoint[] = activeRuns.slice(0, 300).map((r) => {
      const predicted = computeFlameSpreadVelocity({
        O2_pct: r.O2_pct,
        P_psi: r.P_psi,
        Flow_ms: r.Flow_ms,
        g_eff: r.g_eff,
        Thickness_mm: r.Thickness_mm,
        material: r.material,
      }).flameSpread_mms;
      const residual = Number((r.flameSpread_mms - predicted).toFixed(3));
      return {
        run: r,
        x: r[numericX],
        y: residual,
        predicted,
        residual,
        color:
          Math.abs(residual) > 0.65
            ? '#EF4444'
            : Math.abs(residual) > 0.3
            ? '#F59E0B'
            : '#10B981',
      };
    });

    return (
      <InteractiveScatterPlot
        theme={theme}
        mode="residual"
        resetKey={resetKey}
        xLabel={xMeta.label}
        yLabel="Residual Error"
        xUnit={xMeta.unit ?? ''}
        yUnit="mm/s"
        points={points}
        hoveredRunId={hoveredRunId}
        onHoverRun={onHoverRun}
        onInspectRun={onInspectRun}
        legendText={`Real Test minus Model Speed Difference (mm/s) across ${xMeta.label} (${points.length} points)`}
        rightHintText="Dashed Zero Line = Model Matches Test · 16px snap"
      />
    );
  }

  // 17. CORRELATION MATRIX (Desmos Sub-Matrix Focus Window & Color Contrast Zoom)
  if (vizMode === 'correlation-matrix') {
    const vars: Array<{ key: NumericAxisKey; label: string }> = [
      { key: 'O2_pct', label: 'O₂ %' },
      { key: 'P_psi', label: 'Pressure' },
      { key: 'Flow_ms', label: 'Airflow' },
      { key: 'g_eff', label: 'Gravity' },
      { key: 'Thickness_mm', label: 'Thickness' },
      { key: 'peakTemp_K', label: 'Peak Temp' },
      { key: 'radiometerFlux_Wm2', label: 'IR Flux' },
      { key: 'flameSpread_mms', label: 'Spread' },
    ];

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-xs">
          <span className="font-sans text-zinc-500">
            Pairwise Pearson r across n = {activeRuns.length} records
          </span>
          <div className="flex items-center gap-3 text-[11px] font-sans">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#EF4444]/60" />
              <span>Positive r</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#10B981]/60" />
              <span>Negative r</span>
            </span>
          </div>
        </div>

        <InteractiveChartViewport
          theme={theme}
          baseXDomain={{ min: 0, max: vars.length - 1 }}
          baseYDomain={{ min: 0, max: vars.length - 1 }}
          resetKey={resetKey}
          integerX={true}
          integerY={true}
          plotInsets={{ left: 0.12, right: 0.02, top: 0.12, bottom: 0.02 }}
        >
          {(ctx) => {
            const c0 = Math.max(0, Math.floor(ctx.xDomain.min));
            const c1 = Math.min(vars.length - 1, Math.ceil(ctx.xDomain.max));
            const r0 = Math.max(0, Math.floor(ctx.yDomain.min));
            const r1 = Math.min(vars.length - 1, Math.ceil(ctx.yDomain.max));
            const colVars =
              ctx.xZoomRatio > 1.04 || c0 > 0 || c1 < vars.length - 1
                ? vars.slice(
                    Math.min(c0, Math.max(0, vars.length - 3)),
                    Math.max(Math.min(vars.length, c0 + 3), c1 + 1)
                  )
                : vars;
            const rowVars =
              ctx.yZoomRatio > 1.04 || r0 > 0 || r1 < vars.length - 1
                ? vars.slice(
                    Math.min(r0, Math.max(0, vars.length - 3)),
                    Math.max(Math.min(vars.length, r0 + 3), r1 + 1)
                  )
                : vars;
            const contrastGain = Math.min(1.5, 1 + Math.max(0, ctx.zoomRatio - 1) * 0.2);

            return (
              <div className="overflow-x-auto">
                <table className={`w-full border-collapse border text-xs ${isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'}`}>
                  <thead>
                    <tr className={isDark ? 'bg-[#09090B]' : 'bg-zinc-50'}>
                      <th className="p-2 text-left font-sans font-semibold border-b border-r border-inherit">
                        Variable
                      </th>
                      {colVars.map((v) => (
                        <th key={v.key} className="p-2 text-center font-sans font-semibold border-b border-inherit">
                          {v.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowVars.map((rowVar) => (
                      <tr key={rowVar.key} className="border-b border-inherit">
                        <td className={`p-2 font-sans font-semibold border-r border-inherit ${isDark ? 'bg-[#09090B]' : 'bg-zinc-50'}`}>
                          {rowVar.label}
                        </td>
                        {colVars.map((colVar) => {
                          const r =
                            rowVar.key === colVar.key
                              ? 1
                              : pearsonCorrelation(
                                  activeRuns.map((x) => x[rowVar.key]),
                                  activeRuns.map((x) => x[colVar.key])
                                );
                          const absR = Math.min(1, Math.abs(r) * contrastGain);
                          const bg =
                            rowVar.key === colVar.key
                              ? isDark
                                ? 'rgba(255,255,255,0.08)'
                                : 'rgba(24,24,27,0.08)'
                              : r >= 0
                              ? `rgba(239, 68, 68, ${(absR * 0.45).toFixed(2)})`
                              : `rgba(16, 185, 129, ${(absR * 0.45).toFixed(2)})`;
                          return (
                            <td
                              key={colVar.key}
                              style={{ backgroundColor: bg }}
                              className="p-2.5 text-center font-mono font-semibold tabular-nums"
                            >
                              {r >= 0 ? `+${r.toFixed(2)}` : r.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }}
        </InteractiveChartViewport>
      </div>
    );
  }

  // 18. NORMALIZED MATRIX HEATMAP (Desmos Row/Column Window Zoom & Pan)
  if (vizMode === 'heatmap-matrix') {
    const cols: Array<{
      key: NumericAxisKey;
      label: string;
      format: (v: number) => string;
    }> = [
      { key: 'O2_pct', label: 'O₂ %', format: (v) => `${v.toFixed(1)}%` },
      { key: 'P_psi', label: 'Pressure', format: (v) => `${v.toFixed(1)} psi` },
      { key: 'Flow_ms', label: 'Airflow', format: (v) => `${v.toFixed(2)} m/s` },
      { key: 'g_eff', label: 'Gravity', format: (v) => `${v.toFixed(3)}g` },
      { key: 'Thickness_mm', label: 'Thickness', format: (v) => `${v.toFixed(1)} mm` },
      { key: 'peakTemp_K', label: 'Temp K', format: (v) => `${Math.round(v)} K` },
      { key: 'radiometerFlux_Wm2', label: 'IR Flux', format: (v) => `${Math.round(v)} W/m²` },
      { key: 'flameSpread_mms', label: 'Spread', format: (v) => `${v.toFixed(2)} mm/s` },
    ];

    const colBounds = cols.reduce((acc, col) => {
      const vals = [getSimParamValue(col.key, sliders, simulation), ...activeRuns.map((r) => r[col.key])];
      acc[col.key] = { min: Math.min(...vals), max: Math.max(...vals) };
      return acc;
    }, {} as Record<NumericAxisKey, { min: number; max: number }>);

    const rows = [
      {
        id: 'sim-active',
        psiId: 'ACTIVE VIRTUAL',
        isSim: true,
        vals: {
          O2_pct: sliders.O2_pct,
          P_psi: sliders.P_psi,
          Flow_ms: sliders.Flow_ms,
          g_eff: sliders.g_eff,
          Thickness_mm: sliders.Thickness_mm,
          peakTemp_K: simulation.peakTemp_K,
          radiometerFlux_Wm2: Math.round(simulation.peakTemp_K * 11.5),
          flameSpread_mms: simulation.flameSpread_mms,
        } as Record<NumericAxisKey, number>,
      },
      ...activeRuns.slice(0, 22).map((r) => ({
        id: r.id,
        psiId: r.runCode ? `${r.psiId.split(' ')[0]} · ${r.runCode}` : r.psiId,
        isSim: false,
        vals: r as unknown as Record<NumericAxisKey, number>,
      })),
    ];

    return (
      <div className="space-y-2.5">
        <InteractiveChartViewport
          theme={theme}
          baseXDomain={{ min: 0, max: cols.length - 1 }}
          baseYDomain={{ min: 0, max: Math.max(1, rows.length - 1) }}
          resetKey={resetKey}
          integerX={true}
          integerY={true}
          plotInsets={{ left: 0.14, right: 0.02, top: 0.1, bottom: 0.02 }}
        >
          {(ctx) => {
            const c0 = Math.max(0, Math.floor(ctx.xDomain.min));
            const c1 = Math.min(cols.length - 1, Math.ceil(ctx.xDomain.max));
            const r0 = Math.max(0, Math.floor(ctx.yDomain.min));
            const r1 = Math.min(rows.length - 1, Math.ceil(ctx.yDomain.max));
            const visibleCols =
              ctx.xZoomRatio > 1.04 || c0 > 0 || c1 < cols.length - 1
                ? cols.slice(
                    Math.min(c0, Math.max(0, cols.length - 3)),
                    Math.max(Math.min(cols.length, c0 + 3), c1 + 1)
                  )
                : cols;
            const visibleRows =
              ctx.yZoomRatio > 1.04 || r0 > 0 || r1 < rows.length - 1
                ? rows.slice(
                    Math.min(r0, Math.max(0, rows.length - 4)),
                    Math.max(Math.min(rows.length, r0 + 4), r1 + 1)
                  )
                : rows.slice(0, 15);

            return (
              <div className={`border rounded-[5px] overflow-x-auto ${isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'}`}>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className={`border-b font-sans text-[11px] font-semibold text-zinc-500 ${isDark ? 'bg-[#09090B] border-[#27272A]' : 'bg-zinc-50 border-[#E4E4E7]'}`}>
                      <th className="py-2 px-3 text-left">Record</th>
                      {visibleCols.map((c) => (
                        <th key={c.key} className="py-2 px-3 text-right">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-[#27272A]' : 'divide-[#E4E4E7]'}`}>
                    {visibleRows.map((row) => (
                      <tr
                        key={row.id}
                        onMouseEnter={() => !row.isSim && onHoverRun(row.id)}
                        onMouseLeave={() => onHoverRun(null)}
                        onClick={() => {
                          if (!ctx.wasRecentlyDragged() && !row.isSim) onInspectRun(row.id);
                        }}
                        className={!row.isSim ? 'cursor-pointer hover:opacity-90' : ''}
                      >
                        <td
                          className={`py-2 px-3 font-semibold whitespace-nowrap ${
                            row.isSim ? 'font-sans' : 'font-mono tabular-nums'
                          }`}
                        >
                          {row.psiId}
                        </td>
                        {visibleCols.map((col) => {
                          const val = row.vals[col.key];
                          const b = colBounds[col.key];
                          const t = b.max === b.min ? 0.5 : (val - b.min) / (b.max - b.min);
                          const cellBg =
                            col.key === 'Thickness_mm'
                              ? `rgba(16, 185, 129, ${(0.08 + t * 0.36).toFixed(2)})`
                              : `rgba(239, 68, 68, ${(0.06 + t * 0.38).toFixed(2)})`;
                          return (
                            <td
                              key={col.key}
                              style={{ backgroundColor: cellBg }}
                              className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap"
                            >
                              {col.format(val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }}
        </InteractiveChartViewport>
      </div>
    );
  }

  // 19. MULTI-SERIES LINE CHART (Unique Legend Keys, Desmos Time × Metric Domain Zoom/Pan)
  if (vizMode === 'multi-series-line') {
    const compareRuns = activeRuns.slice(0, 4);
    const runLegendMap = formatUniqueRunLegendMap(compareRuns);
    const channel: 'temp_K' | 'irFlux_Wm2' | 'coYield_ppm' | 'opticalVisibility_pct' =
      numericY === 'radiometerFlux_Wm2'
        ? 'irFlux_Wm2'
        : numericY === 'Flow_ms' || numericY === 'O2_pct'
        ? 'coYield_ppm'
        : numericY === 'flameSpread_mms'
        ? 'opticalVisibility_pct'
        : 'temp_K';

    const channelLabel =
      channel === 'irFlux_Wm2'
        ? 'IR Flux (W/m²)'
        : channel === 'coYield_ppm'
        ? 'CO Yield (ppm)'
        : channel === 'opticalVisibility_pct'
        ? 'Visibility (%)'
        : 'Gas Temp (K)';
    const channelUnit =
      channel === 'irFlux_Wm2'
        ? 'W/m²'
        : channel === 'coYield_ppm'
        ? ' ppm'
        : channel === 'opticalVisibility_pct'
        ? '%'
        : 'K';

    const runSeriesMap = compareRuns.map((r) => ({
      run: r,
      legendName: runLegendMap.get(r.id) ?? r.psiId,
      series: generateTimelineSeries({
        O2_pct: r.O2_pct,
        P_psi: r.P_psi,
        Flow_ms: r.Flow_ms,
        g_eff: r.g_eff,
        Thickness_mm: r.Thickness_mm,
        peakTemp_K: r.peakTemp_K,
        hazardStatus: r.outcome,
      }),
    }));

    const lineData = simulation.timelineSeries.map((pt, idx) => {
      const row: Record<string, number> = { time_s: pt.time_s, simVal: pt[channel] };
      runSeriesMap.forEach((entry, rIdx) => {
        row[`run_${rIdx}`] = entry.series[idx]?.[channel] ?? 0;
      });
      return row;
    });

    const minT = lineData[0]?.time_s ?? 0;
    const maxT = lineData[lineData.length - 1]?.time_s ?? 120;
    const allYVals = lineData.flatMap((row) => [
      row.simVal,
      ...runSeriesMap.map((_, idx) => row[`run_${idx}`] ?? 0),
    ]);
    const baseYDomain: AxisDomain =
      channel === 'temp_K'
        ? { min: 250, max: 1850 }
        : {
            min: Math.max(0, Math.floor(Math.min(...allYVals) * 0.9)),
            max: Math.ceil(Math.max(10, ...allYVals) * 1.12),
          };

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-xs">
          <span className="font-sans text-zinc-500">
            0–120s {channelLabel} Trajectories vs. Active Virtual State
          </span>
          {channel === 'temp_K' && (
            <span className="font-sans text-[11px] text-[#F59E0B]">
              Shaded Band: <span className="font-mono tabular-nums">550K–800K</span> Cool-Flame NTC Window
            </span>
          )}
        </div>
        <InteractiveChartViewport
          theme={theme}
          baseXDomain={{ min: minT, max: Math.max(minT + 1, maxT) }}
          baseYDomain={baseYDomain}
          resetKey={resetKey}
          xTickCount={7}
          yTickCount={6}
          xUnit="s"
          yUnit={channelUnit.trim()}
          plotInsets={{ left: 0.07, right: 0.03, top: 0.12, bottom: 0.12 }}
        >
          {(ctx) => {
            const bandLo = Math.max(550, ctx.yDomain.min);
            const bandHi = Math.min(800, ctx.yDomain.max);
            const showBand = channel === 'temp_K' && bandHi > bandLo;

            return (
              <div className="h-[310px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineData} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                    {showBand && (
                      <ReferenceArea y1={bandLo} y2={bandHi} fill="rgba(245, 158, 11, 0.1)" />
                    )}
                    <XAxis
                      type="number"
                      dataKey="time_s"
                      domain={[ctx.xDomain.min, ctx.xDomain.max]}
                      ticks={ctx.xTicks.ticks}
                      allowDataOverflow={true}
                      unit="s"
                      stroke={axisStroke}
                      tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                    />
                    <YAxis
                      domain={[ctx.yDomain.min, ctx.yDomain.max]}
                      ticks={ctx.yTicks.ticks}
                      allowDataOverflow={true}
                      unit={channelUnit}
                      stroke={axisStroke}
                      tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                    />
                    <Tooltip content={renderCustomTooltip as never} />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      height={30}
                      wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="simVal"
                      name={`ACTIVE VIRTUAL (${channelUnit.trim()})`}
                      stroke={textPrimary}
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                    {runSeriesMap.map((entry, idx) => {
                      const isDimmed =
                        hoveredRunId !== null && hoveredRunId !== entry.run.id;
                      return (
                        <Line
                          key={entry.run.id}
                          type="monotone"
                          dataKey={`run_${idx}`}
                          name={entry.legendName}
                          stroke={RUN_COLORS[idx % RUN_COLORS.length]}
                          strokeWidth={hoveredRunId === entry.run.id ? 3 : 2}
                          strokeOpacity={isDimmed ? 0.25 : 0.95}
                          dot={false}
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          }}
        </InteractiveChartViewport>
      </div>
    );
  }

  // 20. AREA PROGRESSION CHART (Desmos Time × Synchronized Dual-Y Domain Zoom/Pan)
  if (vizMode === 'area-chart') {
    const minT = simulation.timelineSeries[0]?.time_s ?? 0;
    const maxT =
      simulation.timelineSeries[simulation.timelineSeries.length - 1]?.time_s ?? 120;
    const maxIr = Math.ceil(
      Math.max(1000, ...simulation.timelineSeries.map((p) => p.irFlux_Wm2)) * 1.1
    );
    const maxCo = Math.ceil(
      Math.max(100, ...simulation.timelineSeries.map((p) => p.coYield_ppm)) * 1.1
    );
    const coRatio = maxCo / Math.max(1, maxIr);

    return (
      <InteractiveChartViewport
        theme={theme}
        baseXDomain={{ min: minT, max: Math.max(minT + 1, maxT) }}
        baseYDomain={{ min: 0, max: maxIr }}
        resetKey={resetKey}
        xTickCount={7}
        yTickCount={6}
        xUnit="s"
        yUnit="W/m²"
        plotInsets={{ left: 0.08, right: 0.08, top: 0.12, bottom: 0.12 }}
      >
        {(ctx) => (
          <div className="h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={simulation.timelineSeries} margin={{ top: 10, right: 20, left: 4, bottom: 8 }}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="time_s"
                  domain={[ctx.xDomain.min, ctx.xDomain.max]}
                  ticks={ctx.xTicks.ticks}
                  allowDataOverflow={true}
                  unit="s"
                  stroke={axisStroke}
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                />
                <YAxis
                  yAxisId="ir"
                  domain={[ctx.yDomain.min, ctx.yDomain.max]}
                  ticks={ctx.yTicks.ticks}
                  allowDataOverflow={true}
                  stroke={axisStroke}
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                />
                <YAxis
                  yAxisId="co"
                  orientation="right"
                  domain={[
                    Number((ctx.yDomain.min * coRatio).toFixed(1)),
                    Number((ctx.yDomain.max * coRatio).toFixed(1)),
                  ]}
                  allowDataOverflow={true}
                  stroke={axisStroke}
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                />
                <Tooltip content={renderCustomTooltip as never} />
                <Legend verticalAlign="top" align="right" height={30} wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
                <Area yAxisId="ir" type="monotone" dataKey="irFlux_Wm2" name="IR Flux (W/m²)" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.22} strokeWidth={2} isAnimationActive={false} />
                <Area yAxisId="co" type="monotone" dataKey="coYield_ppm" name="CO Yield (ppm)" stroke="#EF4444" fill="#EF4444" fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </InteractiveChartViewport>
    );
  }

  // 21. STACKED AREA CHART (Desmos Time × Cumulative % Zoom/Pan)
  if (vizMode === 'stacked-area') {
    const stackedData = simulation.timelineSeries.map((pt) => ({
      time_s: pt.time_s,
      thermalNorm: Math.round(((pt.temp_K - 298) / 1552) * 100),
      irNorm: Math.round((pt.irFlux_Wm2 / 22000) * 100),
      coNorm: Math.round((pt.coYield_ppm / 700) * 100),
    }));
    const minT = stackedData[0]?.time_s ?? 0;
    const maxT = stackedData[stackedData.length - 1]?.time_s ?? 120;
    const maxSum = Math.ceil(
      Math.max(100, ...stackedData.map((d) => d.thermalNorm + d.irNorm + d.coNorm)) * 1.1
    );

    return (
      <InteractiveChartViewport
        theme={theme}
        baseXDomain={{ min: minT, max: Math.max(minT + 1, maxT) }}
        baseYDomain={{ min: 0, max: maxSum }}
        resetKey={resetKey}
        xTickCount={7}
        yTickCount={6}
        xUnit="s"
        yUnit="%"
        plotInsets={{ left: 0.07, right: 0.03, top: 0.12, bottom: 0.12 }}
      >
        {(ctx) => (
          <div className="h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stackedData} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="time_s"
                  domain={[ctx.xDomain.min, ctx.xDomain.max]}
                  ticks={ctx.xTicks.ticks}
                  allowDataOverflow={true}
                  unit="s"
                  stroke={axisStroke}
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                />
                <YAxis
                  domain={[ctx.yDomain.min, ctx.yDomain.max]}
                  ticks={ctx.yTicks.ticks}
                  allowDataOverflow={true}
                  unit="%"
                  stroke={axisStroke}
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                />
                <Tooltip content={renderCustomTooltip as never} />
                <Legend verticalAlign="top" align="right" height={30} wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
                <Area type="monotone" dataKey="thermalNorm" stackId="1" name="Thermal Load (%)" stroke="#EF4444" fill="#EF4444" fillOpacity={0.45} isAnimationActive={false} />
                <Area type="monotone" dataKey="irNorm" stackId="1" name="Radiative Load (%)" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.4} isAnimationActive={false} />
                <Area type="monotone" dataKey="coNorm" stackId="1" name="CO Load (%)" stroke="#10B981" fill="#10B981" fillOpacity={0.35} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </InteractiveChartViewport>
    );
  }

  // 22. STEP TRANSITION CHART (Desmos Time × Gas Temp Zoom/Pan)
  if (vizMode === 'step-chart') {
    const stepData = simulation.timelineSeries.map((pt) => {
      let stateLevel = 0;
      let phaseLabel = 'Quenched';
      if (pt.time_s < 10) {
        stateLevel = 1;
        phaseLabel = 'Igniter Ramp';
      } else if (pt.isCoolFlameZone) {
        stateLevel = 2;
        phaseLabel = 'Cool-Flame NTC Plateau (550K–800K)';
      } else if (pt.temp_K > 800) {
        stateLevel = 3;
        phaseLabel = 'Luminous Hot Flame Spread';
      }
      return { time_s: pt.time_s, temp_K: pt.temp_K, stateLevel, phaseLabel };
    });
    const minT = stepData[0]?.time_s ?? 0;
    const maxT = stepData[stepData.length - 1]?.time_s ?? 120;

    return (
      <InteractiveChartViewport
        theme={theme}
        baseXDomain={{ min: minT, max: Math.max(minT + 1, maxT) }}
        baseYDomain={{ min: 250, max: 1850 }}
        resetKey={resetKey}
        xTickCount={7}
        yTickCount={6}
        xUnit="s"
        yUnit="K"
        plotInsets={{ left: 0.07, right: 0.07, top: 0.12, bottom: 0.12 }}
      >
        {(ctx) => (
          <div className="h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stepData} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="time_s"
                  domain={[ctx.xDomain.min, ctx.xDomain.max]}
                  ticks={ctx.xTicks.ticks}
                  allowDataOverflow={true}
                  unit="s"
                  stroke={axisStroke}
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                />
                <YAxis
                  yAxisId="temp"
                  domain={[ctx.yDomain.min, ctx.yDomain.max]}
                  ticks={ctx.yTicks.ticks}
                  allowDataOverflow={true}
                  unit="K"
                  stroke={axisStroke}
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                />
                <YAxis
                  yAxisId="state"
                  orientation="right"
                  domain={[0, 3.5]}
                  ticks={[0, 1, 2, 3]}
                  allowDataOverflow={true}
                  stroke={axisStroke}
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                />
                <Tooltip content={renderCustomTooltip as never} />
                <Legend verticalAlign="top" align="right" height={30} wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
                <Line yAxisId="temp" type="stepAfter" dataKey="temp_K" name="Gas Temp (K)" stroke="#EF4444" strokeWidth={2.25} dot={false} isAnimationActive={false} />
                <Line yAxisId="state" type="stepAfter" dataKey="stateLevel" name="Regime State (0–3)" stroke="#F59E0B" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </InteractiveChartViewport>
    );
  }

  // 23. FORECAST PROGRESSION CHART (Desmos Time-Step Window & Dual-Metric Scale Zoom/Pan)
  if (vizMode === 'timeline-progression') {
    const startRadius = 12.0;
    const endRadius = simulation.forecast10s.radius_mm;
    const endPress = simulation.forecast10s.pressureRise_kPa;
    const steps10s = Array.from({ length: 11 }, (_, t) => ({
      t_s: t,
      second: `t+${t}s`,
      radius_mm: Number((startRadius + ((endRadius - startRadius) * t) / 10).toFixed(1)),
      pressureRise_kPa: Number(((endPress * t) / 10).toFixed(2)),
    }));
    const maxRad = Math.ceil(Math.max(20, ...steps10s.map((s) => s.radius_mm)) * 1.15);
    const maxPress = Math.max(0.5, ...steps10s.map((s) => s.pressureRise_kPa)) * 1.15;
    const pressRatio = maxPress / Math.max(1, maxRad);

    return (
      <InteractiveChartViewport
        theme={theme}
        baseXDomain={{ min: 0, max: 10 }}
        baseYDomain={{ min: 0, max: maxRad }}
        resetKey={resetKey}
        xTickCount={11}
        yTickCount={6}
        integerX={true}
        xUnit="s"
        yUnit="mm"
        plotInsets={{ left: 0.07, right: 0.07, top: 0.12, bottom: 0.12 }}
      >
        {(ctx) => {
          const sIdx = Math.max(0, Math.floor(ctx.xDomain.min));
          const eIdx = Math.min(steps10s.length - 1, Math.ceil(ctx.xDomain.max));
          const visibleSteps =
            ctx.xZoomRatio > 1.03 || sIdx > 0 || eIdx < steps10s.length - 1
              ? steps10s.slice(
                  Math.min(sIdx, Math.max(0, steps10s.length - 2)),
                  Math.max(Math.min(steps10s.length, sIdx + 2), eIdx + 1)
                )
              : steps10s;

          return (
            <div className="h-[310px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleSteps} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                  <XAxis dataKey="second" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
                  <YAxis
                    yAxisId="rad"
                    domain={[ctx.yDomain.min, ctx.yDomain.max]}
                    ticks={ctx.yTicks.ticks}
                    allowDataOverflow={true}
                    unit=" mm"
                    stroke={axisStroke}
                    tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                  />
                  <YAxis
                    yAxisId="press"
                    orientation="right"
                    domain={[
                      Number((ctx.yDomain.min * pressRatio).toFixed(2)),
                      Number((ctx.yDomain.max * pressRatio).toFixed(2)),
                    ]}
                    allowDataOverflow={true}
                    unit=" kPa"
                    stroke={axisStroke}
                    tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                  />
                  <Tooltip content={renderCustomTooltip as never} />
                  <Legend verticalAlign="top" align="right" height={30} wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
                  <Bar yAxisId="rad" dataKey="radius_mm" name="Flame Radius (mm)" fill={isDark ? '#D4D4D8' : '#27272A'} radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                  <Line yAxisId="press" type="monotone" dataKey="pressureRise_kPa" name="Pressure Rise (kPa)" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3.5, fill: '#F59E0B' }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          );
        }}
      </InteractiveChartViewport>
    );
  }

  // 24. POLAR RADIAL PROFILE (Unique Run Legend Labels + Radial Envelope Zoom & Pan)
  if (vizMode === 'polar-radial') {
    const compareRuns = activeRuns.slice(0, 2);
    const runLegendMap = formatUniqueRunLegendMap(compareRuns);
    const axes = [
      { metric: 'O₂ %', sim: (sliders.O2_pct / 50) * 100, fn: (r: PsiRun) => (r.O2_pct / 50) * 100 },
      { metric: 'Pressure', sim: (sliders.P_psi / 15) * 100, fn: (r: PsiRun) => (r.P_psi / 15) * 100 },
      { metric: 'Airflow', sim: (sliders.Flow_ms / 0.4) * 100, fn: (r: PsiRun) => (r.Flow_ms / 0.4) * 100 },
      { metric: 'Thickness', sim: (sliders.Thickness_mm / 8) * 100, fn: (r: PsiRun) => (r.Thickness_mm / 8) * 100 },
      { metric: 'Peak Temp', sim: (simulation.peakTemp_K / 1800) * 100, fn: (r: PsiRun) => (r.peakTemp_K / 1800) * 100 },
      { metric: 'Spread', sim: (simulation.flameSpread_mms / 4.0) * 100, fn: (r: PsiRun) => (r.flameSpread_mms / 4.0) * 100 },
    ];

    const baseRadarData = axes.map((a) => {
      const entry: Record<string, string | number> = {
        metric: a.metric,
        ActiveSim: Math.min(100, Math.round(a.sim)),
      };
      compareRuns.forEach((r, idx) => {
        entry[`run_${idx}`] = Math.min(100, Math.round(a.fn(r)));
      });
      return entry;
    });

    return (
      <div className="space-y-3">
        <div className={`p-2.5 rounded-[4px] border flex items-start gap-2 text-xs ${isDark ? 'bg-[#F59E0B]/10 border-[#F59E0B]/30 text-zinc-200' : 'bg-[#F59E0B]/10 border-[#F59E0B]/40 text-zinc-800'}`}>
          <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
          <span>
            {caveatNote ||
              'Analytical Caveat: Radial polygon area scales quadratically with radius and depends on axis ordering. Prefer Parallel Coordinates or Bullet Target Chart for strict quantitative comparison.'}
          </span>
        </div>
        <InteractiveChartViewport
          theme={theme}
          baseXDomain={{ min: 0, max: 100 }}
          baseYDomain={{ min: 0, max: 100 }}
          resetKey={resetKey}
          defaultLockMode="y"
          showAxisLock={false}
          yTickCount={5}
          yUnit="%"
        >
          {(ctx) => {
            const rMin = Math.max(0, Math.floor(ctx.yDomain.min));
            const rMax = Math.max(rMin + 10, Math.ceil(ctx.yDomain.max));
            const clampedRadar = baseRadarData.map((row) => {
              const out: Record<string, string | number> = {
                metric: row.metric,
                ActiveSim: Math.max(rMin, Math.min(rMax, Number(row.ActiveSim))),
              };
              compareRuns.forEach((_, idx) => {
                const key = `run_${idx}`;
                out[key] = Math.max(rMin, Math.min(rMax, Number(row[key])));
              });
              return out;
            });

            return (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={clampedRadar} cx="50%" cy="54%" outerRadius="72%">
                    <PolarGrid stroke={gridStroke} />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fill: textPrimary }} />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[rMin, rMax]}
                      ticks={ctx.yTicks.ticks.filter((tk) => tk >= rMin && tk <= rMax)}
                      tick={{ fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                    />
                    <Tooltip content={renderCustomTooltip as never} />
                    <Legend verticalAlign="top" align="right" height={30} wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
                    <Radar name="ACTIVE VIRTUAL (%)" dataKey="ActiveSim" stroke="#EF4444" fill="#EF4444" fillOpacity={0.22} strokeWidth={2} isAnimationActive={false} />
                    {compareRuns.map((r, idx) => (
                      <Radar
                        key={r.id}
                        name={`${runLegendMap.get(r.id) ?? r.psiId} (%)`}
                        dataKey={`run_${idx}`}
                        stroke={RUN_COLORS[idx % RUN_COLORS.length]}
                        fill={RUN_COLORS[idx % RUN_COLORS.length]}
                        fillOpacity={0.14}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    ))}
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            );
          }}
        </InteractiveChartViewport>
      </div>
    );
  }

  return (
    <div className="py-10 text-center text-xs text-zinc-500">
      Select a compatible visualization technique to inspect the active dataset.
    </div>
  );
};
