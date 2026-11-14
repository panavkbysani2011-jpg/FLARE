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
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  ZAxis,
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
        className={`px-3 py-2 rounded-[6px] border backdrop-blur-md shadow-xl text-xs ${
          isDark
            ? 'bg-[#18181B]/85 border-[#27272A] text-[#FAFAFA]'
            : 'bg-white/88 border-[#E4E4E7] text-[#18181B]'
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

  // Histogram setup (honors yAxisKey dynamically)
  const histogramMetric: NumericAxisKey = isNumericAxisKey(xAxisKey)
    ? xAxisKey
    : numericY;
  const histogramData = useMemo(() => {
    const paramMeta =
      STUDIO_NUMERIC_COLUMNS.find((p) => p.key === histogramMetric) ??
      STUDIO_NUMERIC_COLUMNS[7];
    const values = activeRuns.map((r) => r[histogramMetric]);
    const simVal = getSimParamValue(histogramMetric, sliders, simulation);
    if (values.length === 0) {
      return { bins: [], simBinIdx: -1, mean: 0, median: 0, paramMeta, simVal };
    }
    const minV = Math.min(...values, simVal);
    const maxV = Math.max(...values, simVal);
    const binCount = Math.min(
      9,
      Math.max(4, Math.ceil(Math.log2(values.length) + 1))
    );
    const span = Math.max(maxV - minV, 0.05);
    const step = span / binCount;

    const bins = Array.from({ length: binCount }, (_, idx) => {
      const start = minV + idx * step;
      const end =
        idx === binCount - 1 ? maxV + 0.0001 : minV + (idx + 1) * step;
      const matchedRuns = activeRuns.filter((r) => {
        const val = r[histogramMetric];
        return idx === binCount - 1
          ? val >= start && val <= end
          : val >= start && val < end;
      });
      return {
        label: `${paramMeta.format(start)}–${paramMeta.format(
          minV + (idx + 1) * step
        )}`,
        count: matchedRuns.length,
        runs: matchedRuns.map((r) => r.psiId),
        hasSim:
          idx === binCount - 1
            ? simVal >= start && simVal <= end
            : simVal >= start && simVal < end,
      };
    });

    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const median = quantile(sorted, 0.5);
    const simBinIdx = bins.findIndex((b) => b.hasSim);

    return { bins, simBinIdx, mean, median, paramMeta, simVal };
  }, [activeRuns, histogramMetric, sliders, simulation]);

  const histogramEChartsOption: echarts.EChartsOption = useMemo(() => {
    return {
      animationDuration: 250,
      grid: { top: 36, right: 24, bottom: 48, left: 50 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: isDark
          ? 'rgba(24, 24, 27, 0.88)'
          : 'rgba(255, 255, 255, 0.92)',
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
          const bin = histogramData.bins[idx];
          if (!bin) return '';
          const runList =
            bin.runs.length > 0
              ? bin.runs.slice(0, 5).join(', ') +
                (bin.runs.length > 5 ? '…' : '')
              : 'None';
          return [
            `<div style="font-family:Inter,sans-serif;font-weight:600;margin-bottom:4px;"><span style="font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;">${bin.label}</span> ${histogramData.paramMeta.unit}</div>`,
            `<div>Sample Count: <strong style="font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;">${bin.count}</strong></div>`,
            `<div>Active Virtual Point Bin: <strong>${bin.hasSim ? 'YES' : 'No'}</strong></div>`,
            `<div style="opacity:0.75;margin-top:3px;font-size:10px;">Runs: <span style="${bin.runs.length > 0 ? "font-family:'JetBrains Mono',monospace;" : ''}">${runList}</span></div>`,
          ].join('');
        },
      },
      xAxis: {
        type: 'category',
        data: histogramData.bins.map((b) => b.label),
        axisLine: { lineStyle: { color: axisStroke } },
        axisLabel: {
          color: axisStroke,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
        },
        name: `${histogramData.paramMeta.label} (${histogramData.paramMeta.unit})`,
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
          data: histogramData.bins.map((b) => ({
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
  }, [histogramData, isDark, borderCol, textPrimary, axisStroke, gridStroke]);

  type ChamberInputKey = 'O2_pct' | 'P_psi' | 'Flow_ms' | 'g_eff' | 'Thickness_mm';
  const isChamberInputAxis = (k: NumericAxisKey): k is ChamberInputKey =>
    k === 'O2_pct' ||
    k === 'P_psi' ||
    k === 'Flow_ms' ||
    k === 'g_eff' ||
    k === 'Thickness_mm';

  // 2D Grid Generator (supports ALL 8 numeric X and Y axes dynamically:
  // physics phase sweep when both axes are chamber inputs, or empirical binned regime density when either axis is an output telemetry metric)
  const build2DPhysicsGrid = (
    xKey: NumericAxisKey,
    yKey: NumericAxisKey,
    cols = 24,
    rows = 14
  ) => {
    const resolvedXKey: NumericAxisKey = xKey;
    const resolvedYKey: NumericAxisKey = yKey;
    const useEmpiricalGrid =
      !isChamberInputAxis(resolvedXKey) || !isChamberInputAxis(resolvedYKey);

    const [baseXMin, baseXMax] = getAxisDomain(resolvedXKey);
    const [baseYMin, baseYMax] = getAxisDomain(resolvedYKey);

    const simXForBounds = getSimParamValue(resolvedXKey, sliders, simulation);
    const simYForBounds = getSimParamValue(resolvedYKey, sliders, simulation);

    const xValues = useEmpiricalGrid
      ? [simXForBounds, ...activeRuns.map((r) => Number(r[resolvedXKey]))]
      : [baseXMin, baseXMax, simXForBounds];
    const yValues = useEmpiricalGrid
      ? [simYForBounds, ...activeRuns.map((r) => Number(r[resolvedYKey]))]
      : [baseYMin, baseYMax, simYForBounds];

    const rawXMin = Math.min(baseXMin, ...xValues);
    const rawXMax = Math.max(baseXMax, ...xValues);
    const effXMin = rawXMin;
    const effXMax = rawXMax > rawXMin ? rawXMax : rawXMin + 1;

    const rawYMin = Math.min(baseYMin, ...yValues);
    const rawYMax = Math.max(baseYMax, ...yValues);
    const effYMin = rawYMin;
    const effYMax = rawYMax > rawYMin ? rawYMax : rawYMin + 1;

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
        const c = Math.max(
          0,
          Math.min(cols - 1, Math.floor(((rx - effXMin) / (effXMax - effXMin)) * cols))
        );
        const r = Math.max(
          0,
          Math.min(
            rows - 1,
            Math.floor((1 - (ry - effYMin) / (effYMax - effYMin)) * rows)
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
        className={`pointer-events-none absolute top-2 right-3 z-30 px-3 py-2 rounded-[6px] border backdrop-blur-md shadow-xl text-xs transition-all duration-150 ${
          isDark
            ? 'bg-[#18181B]/85 border-[#27272A] text-[#FAFAFA]'
            : 'bg-white/88 border-[#E4E4E7] text-[#18181B]'
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

  // 1. 2D REGIME HEATMAP & CONTOUR DENSITY MAP (Dynamic axes, zero cell text overlap, legend above)
  if (vizMode === 'safety-map' || vizMode === 'contour-surface') {
    const defaultX = vizMode === 'contour-surface' ? 'P_psi' : 'O2_pct';
    const defaultY = vizMode === 'contour-surface' ? 'Thickness_mm' : 'Flow_ms';
    const mapX = isNumericAxisKey(xAxisKey) ? xAxisKey : defaultX;
    const mapY = numericY === mapX ? defaultY : numericY;
    const grid = build2DPhysicsGrid(mapX, mapY, 24, 14);

    const simXVal = getSimParamValue(grid.resolvedXKey, sliders, simulation);
    const simYVal = getSimParamValue(grid.resolvedYKey, sliders, simulation);
    const xSpan = Math.max(1e-6, grid.effXMax - grid.effXMin);
    const ySpan = Math.max(1e-6, grid.effYMax - grid.effYMin);
    const cxSim =
      76 +
      Math.max(0, Math.min(1, (simXVal - grid.effXMin) / xSpan)) * 810;
    const cySim =
      14 +
      Math.max(0, Math.min(1, 1 - (simYVal - grid.effYMin) / ySpan)) * 256;

    // Offset active callout box cleanly away from crosshair lines & marker center
    const boxW = 148;
    const boxH = 22;
    const boxX = cxSim + boxW + 18 < 886 ? cxSim + 12 : Math.max(80, cxSim - boxW - 12);
    const boxY = cySim > 48 ? cySim - boxH - 8 : cySim + 12;

    const seenPsi = new Set<string>();
    const plottedRuns =
      activeRuns.length > 24
        ? activeRuns
            .filter((r) => {
              const key = r.psiId.split(' ')[0];
              if (seenPsi.has(key)) return false;
              seenPsi.add(key);
              return true;
            })
            .slice(0, 22)
        : activeRuns.slice(0, 22);

    const xTicks = Array.from({ length: 6 }, (_, i) =>
      Number((grid.effXMin + (i / 5) * (grid.effXMax - grid.effXMin)).toFixed(2))
    );
    const yTicks = Array.from({ length: 6 }, (_, i) =>
      Number((grid.effYMin + (i / 5) * (grid.effYMax - grid.effYMin)).toFixed(2))
    );

    return (
      <div
        className="space-y-2.5 relative"
        onMouseLeave={() => {
          setGlassTooltip(null);
          onHoverRun(null);
        }}
      >
        <FloatingGlassOverlay />

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
            {grid.resolvedYKey === 'Flow_ms' && (
              <span className="inline-flex items-center gap-1.5 pl-2 border-l border-zinc-300 dark:border-zinc-700 font-semibold">
                <span className="w-4 h-0 border-t-2 border-dashed border-zinc-800 dark:border-zinc-200" />
                <span className="font-mono tabular-nums">0.05–0.20 m/s</span>
                <span>Replenishment Band</span>
              </span>
            )}
          </div>
          <span className="font-sans text-[11px] text-zinc-500 dark:text-zinc-400">
            Click any cell to sample parameters · Hover squares for PSI run telemetry
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox="0 0 920 318"
            className="w-full h-auto min-w-[680px] select-none cursor-crosshair"
            role="img"
            aria-label={`${grid.xMeta.label} vs. ${grid.yMeta.label} 2D Regime Grid`}
          >
            {grid.cells.map((cell) => {
              const cellW = 810 / grid.cols;
              const cellH = 256 / grid.rows;
              return (
                <rect
                  key={`${cell.c}-${cell.r}`}
                  x={76 + cell.c * cellW}
                  y={14 + cell.r * cellH}
                  width={cellW - 1}
                  height={cellH - 1}
                  fill={cell.fill}
                  className="transition-opacity duration-150 hover:opacity-80"
                  onMouseEnter={() =>
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
                          value: cell.count > 0 ? `${cell.spread.toFixed(2)} mm/s` : 'No Archive Runs',
                        },
                      ],
                      status: cell.count > 0 ? cell.status : undefined,
                    })
                  }
                  onClick={() => {
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

            {/* Overlaid Archive Markers (NO dark text inside cells!) */}
            {plottedRuns.map((run) => {
              const rx = Number(run[grid.resolvedXKey]);
              const ry = Number(run[grid.resolvedYKey]);
              const cx =
                76 +
                Math.max(0, Math.min(1, (rx - grid.effXMin) / xSpan)) * 810;
              const cy =
                14 +
                Math.max(0, Math.min(1, 1 - (ry - grid.effYMin) / ySpan)) * 256;
              const isDimmed = hoveredRunId !== null && hoveredRunId !== run.id;
              const isHighlighted = hoveredRunId === run.id;

              return (
                <g
                  key={run.id}
                  className={`cursor-pointer transition-opacity duration-150 ${
                    isDimmed ? 'opacity-25' : 'opacity-100'
                  }`}
                  onMouseEnter={() => {
                    onHoverRun(run.id);
                    setGlassTooltip({
                      title: `${run.psiId} (${run.runCode})`,
                      subtitle: `${run.material} · ${run.facility}`,
                      metrics: [
                        {
                          label: grid.xMeta.shortLabel,
                          value: `${rx.toFixed(1)} ${grid.xMeta.unit ?? ''}`,
                        },
                        {
                          label: grid.yMeta.shortLabel,
                          value: `${ry.toFixed(2)} ${grid.yMeta.unit ?? ''}`,
                        },
                        { label: 'Spread', value: `${run.flameSpread_mms.toFixed(2)} mm/s` },
                      ],
                      status: run.outcome,
                    });
                  }}
                  onClick={() => onInspectRun(run.id)}
                >
                  <rect
                    x={cx - (isHighlighted ? 6 : 4.5)}
                    y={cy - (isHighlighted ? 6 : 4.5)}
                    width={isHighlighted ? 12 : 9}
                    height={isHighlighted ? 12 : 9}
                    fill={isDark ? '#09090B' : '#FFFFFF'}
                    stroke={getGroupColor(run, colorByKey, groupIndexMap, isDark)}
                    strokeWidth={isHighlighted ? 2.5 : 2}
                  />
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

            {/* Axes */}
            <line x1={76} y1={270} x2={886} y2={270} stroke={axisStroke} />
            <line x1={76} y1={14} x2={76} y2={270} stroke={axisStroke} />

            {xTicks.map((tk) => {
              const x = 76 + ((tk - grid.effXMin) / xSpan) * 810;
              return (
                <g key={tk}>
                  <line x1={x} y1={270} x2={x} y2={275} stroke={axisStroke} />
                  <text
                    x={x}
                    y={289}
                    textAnchor="middle"
                    fill={axisStroke}
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {grid.xMeta.format ? grid.xMeta.format(tk) : tk}
                  </text>
                </g>
              );
            })}

            {yTicks.map((tk) => {
              const y = 14 + (1 - (tk - grid.effYMin) / ySpan) * 256;
              return (
                <g key={tk}>
                  <line x1={71} y1={y} x2={76} y2={y} stroke={axisStroke} />
                  <text
                    x={66}
                    y={y + 3.5}
                    textAnchor="end"
                    fill={axisStroke}
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {grid.yMeta.format ? grid.yMeta.format(tk) : tk}
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
      </div>
    );
  }

  // 2. PARALLEL COORDINATES
  if (vizMode === 'multi-variable') {
    const displayedRuns = activeRuns.slice(0, 8);
    const axes = [
      { label: 'O₂ %', min: 14, max: 100, unit: '%' },
      { label: 'Pressure psi', min: 4.3, max: 20.0, unit: 'psi' },
      { label: 'Airflow m/s', min: 0.0, max: 0.5, unit: 'm/s' },
      { label: 'Peak Temp K', min: 500, max: 1850, unit: 'K' },
      { label: 'Spread mm/s', min: 0.0, max: 5.0, unit: 'mm/s' },
    ];
    const xPositions = [100, 290, 480, 670, 840];
    const yTop = 44;
    const yBot = 268;
    const normalize = (val: number, min: number, max: number) =>
      yBot - Math.max(0, Math.min(1, (val - min) / (max - min))) * (yBot - yTop);
    const buildPoints = (vals: number[]) =>
      vals
        .map((v, i) => `${xPositions[i]},${normalize(v, axes[i].min, axes[i].max)}`)
        .join(' ');
    const simVals = [
      sliders.O2_pct,
      sliders.P_psi,
      sliders.Flow_ms,
      simulation.peakTemp_K,
      simulation.flameSpread_mms,
    ];

    return (
      <div
        className="space-y-2.5 relative"
        onMouseLeave={() => {
          setGlassTooltip(null);
          onHoverRun(null);
        }}
      >
        <FloatingGlassOverlay />

        {/* Legend Strip cleanly above SVG */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1.5 font-sans font-semibold text-[#EF4444]">
              <span className="w-4 h-0 border-t-2 border-dashed border-[#EF4444]" />
              <span>Active Virtual Test</span>
            </span>
            {displayedRuns.map((run, idx) => {
              const isDimmed = hoveredRunId !== null && hoveredRunId !== run.id;
              return (
                <button
                  key={run.id}
                  type="button"
                  onMouseEnter={() => onHoverRun(run.id)}
                  onMouseLeave={() => onHoverRun(null)}
                  onClick={() => onInspectRun(run.id)}
                  className={`inline-flex items-center gap-1.5 font-sans transition-opacity cursor-pointer hover:underline ${
                    isDimmed ? 'opacity-30' : 'opacity-100'
                  }`}
                >
                  <span
                    className="w-3 h-1 rounded-[1px]"
                    style={{ backgroundColor: RUN_COLORS[idx % RUN_COLORS.length] }}
                  />
                  <span>{run.psiId}</span>
                </button>
              );
            })}
          </div>
          <span className="font-sans text-[11px] text-zinc-500 dark:text-zinc-400">
            Hover legend or lines to isolate · Click run to inspect
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox="0 0 920 310"
            className="w-full h-auto min-w-[680px]"
            role="img"
            aria-label="Parallel Coordinates Multi-Axis Profile"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const y = yBot - pct * (yBot - yTop);
              return (
                <line
                  key={pct}
                  x1={xPositions[0]}
                  y1={y}
                  x2={xPositions[4]}
                  y2={y}
                  stroke={gridStroke}
                  strokeDasharray="3 3"
                />
              );
            })}

            {axes.map((ax, i) => {
              const x = xPositions[i];
              return (
                <g key={ax.label}>
                  <line
                    x1={x}
                    y1={yTop}
                    x2={x}
                    y2={yBot}
                    stroke={axisStroke}
                    strokeWidth={1.25}
                  />
                  <text
                    x={x}
                    y={16}
                    textAnchor="middle"
                    fill={textPrimary}
                    fontSize="11"
                    fontFamily="Inter, sans-serif"
                    fontWeight="600"
                  >
                    {ax.label}
                  </text>
                  <text
                    x={x}
                    y={yTop - 7}
                    textAnchor="middle"
                    fill={axisStroke}
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {ax.max} {ax.unit}
                  </text>
                  <text
                    x={x}
                    y={yBot + 16}
                    textAnchor="middle"
                    fill={axisStroke}
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {ax.min} {ax.unit}
                  </text>
                </g>
              );
            })}

            {displayedRuns.map((run, idx) => {
              const vals = [
                run.O2_pct,
                run.P_psi,
                run.Flow_ms,
                run.peakTemp_K,
                run.flameSpread_mms,
              ];
              const color = RUN_COLORS[idx % RUN_COLORS.length];
              const isDimmed = hoveredRunId !== null && hoveredRunId !== run.id;

              return (
                <g
                  key={run.id}
                  className={`cursor-pointer transition-opacity duration-150 ${
                    isDimmed ? 'opacity-25' : 'opacity-90'
                  }`}
                  onMouseEnter={() => {
                    onHoverRun(run.id);
                    setGlassTooltip({
                      title: run.psiId,
                      subtitle: `${run.material} · ${run.facility}`,
                      metrics: [
                        { label: 'O₂', value: `${run.O2_pct.toFixed(1)}%` },
                        { label: 'Temp', value: `${run.peakTemp_K} K` },
                        { label: 'Spread', value: `${run.flameSpread_mms.toFixed(2)} mm/s` },
                      ],
                      status: run.outcome,
                    });
                  }}
                  onClick={() => onInspectRun(run.id)}
                >
                  <polyline fill="none" stroke={color} strokeWidth={2.25} points={buildPoints(vals)} />
                  {vals.map((v, i) => (
                    <circle
                      key={i}
                      cx={xPositions[i]}
                      cy={normalize(v, axes[i].min, axes[i].max)}
                      r={3.5}
                      fill={color}
                    />
                  ))}
                </g>
              );
            })}

            <polyline
              fill="none"
              stroke="#EF4444"
              strokeWidth={3}
              strokeDasharray="6 4"
              points={buildPoints(simVals)}
            />
            {simVals.map((v, i) => (
              <circle
                key={i}
                cx={xPositions[i]}
                cy={normalize(v, axes[i].min, axes[i].max)}
                r={4.5}
                fill="#EF4444"
                stroke={monoBg}
                strokeWidth={1.5}
              />
            ))}
          </svg>
        </div>
      </div>
    );
  }

  // 3. BULLET TARGET CHART (Material Safety)
  if (vizMode === 'material-safety') {
    const sortedMaterials = [...simulation.materialRankings].sort((a, b) => {
      const diff = a[materialSort.key] - b[materialSort.key];
      return materialSort.dir === 'asc' ? diff : -diff;
    });

    return (
      <div className="space-y-4">
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
              getBarPct: (m: (typeof simulation.materialRankings)[number]) =>
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
              getBarPct: (m: (typeof simulation.materialRankings)[number]) =>
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
              getBarPct: (m: (typeof simulation.materialRankings)[number]) =>
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
              getBarPct: (m: (typeof simulation.materialRankings)[number]) =>
                m.coolFlameRiskIndex,
              getBarColor: (m: (typeof simulation.materialRankings)[number]) =>
                m.coolFlameRiskIndex >= 65 ? 'bg-[#F59E0B]' : 'bg-[#10B981]',
            },
          ].map((panel) => (
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
                          className={`h-full transition-all duration-300 ${panel.getBarColor(
                            mat
                          )}`}
                          style={{ width: `${panel.getBarPct(mat)}%` }}
                        />
                        <div
                          className="absolute top-0 bottom-0 w-0 border-r border-dashed border-zinc-900 dark:border-zinc-100"
                          style={{ left: `${panel.thresholdPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

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

  // 4. DUAL-AXIS SENSOR LINE CHART (No overlapping zone label inside curves!)
  if (vizMode === 'sensor-timeline') {
    const hoveredPt =
      hoveredTimelineIdx !== null ? simulation.timelineSeries[hoveredTimelineIdx] : null;
    return (
      <div
        className="space-y-2.5 relative"
        onMouseLeave={() => {
          setHoveredTimelineIdx(null);
          setGlassTooltip(null);
        }}
      >
        <FloatingGlassOverlay />

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

        <div className="w-full overflow-x-auto">
          <svg viewBox="0 0 920 310" className="w-full h-auto min-w-[680px]">
            {(() => {
              const xLeft = 68;
              const xRight = 886;
              const yTop = 18;
              const yBot = 268;
              const w = xRight - xLeft;
              const h = yBot - yTop;
              const xTime = (t: number) => xLeft + (t / 120) * w;
              const yTemp = (k: number) =>
                yBot - Math.max(0, Math.min(1, (k - 250) / (1850 - 250))) * h;
              const yIr = (ir: number) =>
                yBot - Math.max(0, Math.min(1, ir / 22000)) * h;
              const yVis = (vis: number) =>
                yBot - Math.max(0, Math.min(1, vis / 100)) * h;

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

              return (
                <>
                  <rect
                    x={xLeft}
                    y={y800}
                    width={w}
                    height={y550 - y800}
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
                    const segW = w / simulation.timelineSeries.length;
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

                  <line x1={xLeft} y1={yBot} x2={xRight} y2={yBot} stroke={axisStroke} />
                  <line x1={xLeft} y1={yTop} x2={xLeft} y2={yBot} stroke={axisStroke} />
                  {[0, 20, 40, 60, 80, 100, 120].map((tTick) => (
                    <text
                      key={tTick}
                      x={xTime(tTick)}
                      y={yBot + 17}
                      textAnchor="middle"
                      fill={axisStroke}
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {tTick}s
                    </text>
                  ))}
                  {[300, 600, 900, 1200, 1500, 1800].map((kTick) => (
                    <text
                      key={kTick}
                      x={xLeft - 8}
                      y={yTemp(kTick) + 3.5}
                      textAnchor="end"
                      fill={axisStroke}
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {kTick}K
                    </text>
                  ))}
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
                </>
              );
            })()}
          </svg>
        </div>
      </div>
    );
  }

  // 5. GROUPED BAR CHART (Plots dynamically mapped X/Y metrics with dual-axis scaling when scales diverge + hover brushing)
  if (vizMode === 'grouped-bar') {
    const primaryMetricKey = numericX === numericY ? 'O2_pct' : numericX;
    const xMeta = getAxisMeta(primaryMetricKey);
    const yMeta = getAxisMeta(numericY);
    const displayedRuns = activeRuns.slice(0, 8);
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
    const useDualAxis =
      Math.max(maxXVal / maxYVal, maxYVal / maxXVal) > 2.2;

    return (
      <div className="space-y-2.5">
        <div className="h-[310px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: useDualAxis ? 16 : 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fill: axisStroke }}
              />
              <YAxis
                yAxisId="left"
                stroke="#10B981"
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              {useDualAxis && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
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
                onMouseEnter={(item) => {
                  const row = (item as { payload?: { id?: string; isSim?: boolean } })?.payload;
                  if (row?.id && !row.isSim) onHoverRun(row.id);
                }}
                onMouseLeave={() => onHoverRun(null)}
                onClick={(item) => {
                  const row = (item as { payload?: { id?: string; isSim?: boolean } })?.payload;
                  if (row?.id && !row.isSim) onInspectRun(row.id);
                }}
                className="cursor-pointer"
              >
                {chartData.map((row) => (
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
                onMouseEnter={(item) => {
                  const row = (item as { payload?: { id?: string; isSim?: boolean } })?.payload;
                  if (row?.id && !row.isSim) onHoverRun(row.id);
                }}
                onMouseLeave={() => onHoverRun(null)}
                onClick={(item) => {
                  const row = (item as { payload?: { id?: string; isSim?: boolean } })?.payload;
                  if (row?.id && !row.isSim) onInspectRun(row.id);
                }}
                className="cursor-pointer"
              >
                {chartData.map((row) => (
                  <Cell
                    key={`gy-${row.id}`}
                    fillOpacity={hoveredRunId && !row.isSim && hoveredRunId !== row.id ? 0.28 : 0.92}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 6. STACKED BAR CHART (Aggregates active dataset by X-axis & stacks by color group when multi-run data is active, or renders material hazard index composition in Virtual Lab mode)
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

      return (
        <div className="space-y-2.5">
          <div className="h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={matData} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke={axisStroke}
                  tick={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fill: axisStroke }}
                />
                <YAxis
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
                />
                <Bar
                  dataKey="toxicGasYieldIndex"
                  name="Toxic Gas"
                  stackId="hazard"
                  fill="#F59E0B"
                />
                <Bar
                  dataKey="coolFlameRiskIndex"
                  name="Cool-Flame Risk"
                  stackId="hazard"
                  fill="#10B981"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
      .slice(0, 10);

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-xs">
          <span className="font-sans text-zinc-500">
            Stacked Composition across {activeRuns.length} runs: Grouped by {getAxisMeta(xAxisKey).label}, Stacked by {getAxisMeta(effectiveStackKey).label}.
          </span>
        </div>
        <div className="h-[310px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stackedRows} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                stroke={axisStroke}
                tick={{ fontSize: 10.5, fontFamily: 'Inter, sans-serif', fill: axisStroke }}
              />
              <YAxis
                allowDecimals={false}
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
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 7. HORIZONTAL RANKED BAR CHART (Honors mapped yAxisKey dynamically!)
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
        <div style={{ height: `${Math.max(260, combined.length * 28)}px` }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={combined}
              layout="vertical"
              margin={{ top: 8, right: 28, left: 12, bottom: 8 }}
            >
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
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
              {numericY === 'flameSpread_mms' && (
                <ReferenceLine x={0.48} stroke="#10B981" strokeDasharray="4 4" strokeWidth={1.5} />
              )}
              <Bar
                dataKey="val"
                name={`${yMeta.label} (${yMeta.unit ?? ''})`}
                radius={[0, 3, 3, 0]}
                className="cursor-pointer"
                onClick={(item) => {
                  const row = (item as { payload?: { id?: string; isSim?: boolean } })?.payload;
                  if (row?.id && !row.isSim) onInspectRun(row.id);
                }}
              >
                {combined.map((entry) => (
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
      </div>
    );
  }

  // 8. CLEVELAND LOLLIPOP PLOT
  if (vizMode === 'lollipop-dot') {
    const paramMeta =
      STUDIO_NUMERIC_COLUMNS.find((p) => p.key === numericY) ?? STUDIO_NUMERIC_COLUMNS[7];
    const simVal = getSimParamValue(numericY, sliders, simulation);
    const items = activeRuns.slice(0, 12).map((r) => ({
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
    const toPct = (v: number) =>
      Math.max(2, Math.min(98, ((v - domMin) / Math.max(domMax - domMin, 0.01)) * 100));
    const simPct = toPct(simVal);

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

        <div
          className={`border rounded-[5px] p-3.5 space-y-2.5 ${
            isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/70 border-[#E4E4E7]'
          }`}
        >
          {items.map(({ run, val, delta }) => {
            const dotPct = toPct(val);
            const leftPct = Math.min(simPct, dotPct);
            const widthPct = Math.abs(dotPct - simPct);
            const isDimmed = hoveredRunId !== null && hoveredRunId !== run.id;
            const dotCol = getGroupColor(run, colorByKey, groupIndexMap, isDark);

            return (
              <div
                key={run.id}
                onMouseEnter={() => onHoverRun(run.id)}
                onMouseLeave={() => onHoverRun(null)}
                onClick={() => onInspectRun(run.id)}
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
                <div className="col-span-6 sm:col-span-8 relative h-5 flex items-center">
                  <div className="w-full h-[1px]" style={{ backgroundColor: gridStroke }} />
                  <div
                    className="absolute top-0.5 bottom-0.5 w-[2px]"
                    style={{ left: `${simPct}%`, backgroundColor: textPrimary }}
                  />
                  <div
                    className="absolute h-[2.5px]"
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 0.4)}%`,
                      backgroundColor: dotCol,
                    }}
                  />
                  <div
                    className="absolute w-3 h-3 rounded-[2px] -translate-x-1/2 border"
                    style={{
                      left: `${dotPct}%`,
                      backgroundColor: dotCol,
                      borderColor: monoBg,
                    }}
                  />
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
      </div>
    );
  }

  // 9. TELEMETRY HISTOGRAM
  if (vizMode === 'histogram') {
    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] font-sans text-[11px]">
          <span className="font-sans text-xs text-zinc-500">
            Binning: {histogramData.paramMeta.label} ({histogramData.paramMeta.unit})
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <span>n = <strong className="font-mono tabular-nums">{activeRuns.length}</strong></span>
            <span>Mean: <strong className="font-mono tabular-nums">{histogramData.paramMeta.format(histogramData.mean)} {histogramData.paramMeta.unit}</strong></span>
            <span>Median: <strong className="font-mono tabular-nums">{histogramData.paramMeta.format(histogramData.median)} {histogramData.paramMeta.unit}</strong></span>
            <span className="text-[#EF4444] font-semibold">
              ■ Active Point Bin (<span className="font-mono tabular-nums">{histogramData.paramMeta.format(histogramData.simVal)} {histogramData.paramMeta.unit}</span>)
            </span>
          </div>
        </div>
        <EChartsCanvas option={histogramEChartsOption} height={300} ariaLabel="Telemetry Histogram" />
      </div>
    );
  }

  // 10. FREQUENCY DISTRIBUTION BARS
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

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`p-3.5 rounded-[5px] border ${isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/60 border-[#E4E4E7]'}`}>
          <div className="text-xs font-sans font-semibold mb-2">
            Frequency by {getAxisMeta(colorByKey).label} (n = {activeRuns.length})
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={groupCounts} margin={{ top: 10, right: 16, left: -10, bottom: 8 }}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke={axisStroke} tick={{ fontSize: 10.5, fontFamily: 'Inter, sans-serif', fill: axisStroke }} />
                <YAxis allowDecimals={false} stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
                <Tooltip content={renderCustomTooltip as never} />
                <Bar dataKey="count" name="Runs" radius={[3, 3, 0, 0]} maxBarSize={52}>
                  {groupCounts.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`p-3.5 rounded-[5px] border ${isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/60 border-[#E4E4E7]'}`}>
          <div className="text-xs font-sans font-semibold mb-2">Frequency by Hardware Facility</div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={facilityCounts} margin={{ top: 10, right: 16, left: -10, bottom: 8 }}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fill: axisStroke }} />
                <YAxis allowDecimals={false} stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
                <Tooltip content={renderCustomTooltip as never} />
                <Bar dataKey="count" name="Runs" fill={isDark ? '#E4E4E7' : '#18181B'} radius={[3, 3, 0, 0]} maxBarSize={52} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // 11. CONFIDENCE INTERVAL RANGE PLOT
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
      ...activeRuns.slice(0, 10).map((r) => {
        const ci = Number(Math.max(0.04, r.flameSpread_mms * 0.05 + 0.01 * r.Flow_ms).toFixed(2));
        return {
          id: r.id,
          psiId: r.psiId,
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
    const toPct = (v: number) => Math.min(98, Math.max(0, (v / maxHigh) * 100));
    const quenchPct = toPct(0.48);

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

        <div className={`border rounded-[5px] p-3.5 space-y-2.5 ${isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/70 border-[#E4E4E7]'}`}>
          {items.map((item) => {
            const leftPct = toPct(item.low);
            const rightPct = toPct(item.high);
            const midPct = toPct(item.mid);
            const col = item.isSim ? textPrimary : outcomeColor(item.outcome);
            return (
              <div
                key={item.id}
                onMouseEnter={() => !item.isSim && onHoverRun(item.id)}
                onMouseLeave={() => onHoverRun(null)}
                onClick={() => !item.isSim && onInspectRun(item.id)}
                className={`grid grid-cols-12 items-center gap-3 ${!item.isSim ? 'cursor-pointer' : ''}`}
              >
                <div className="col-span-4 sm:col-span-3 truncate">
                  <div className="font-mono text-xs font-semibold truncate">{item.psiId}</div>
                  <div className="font-sans text-[10px] text-zinc-500 truncate">{item.material}</div>
                </div>
                <div className="col-span-5 sm:col-span-6 relative h-5 flex items-center">
                  <div className="w-full h-[1px]" style={{ backgroundColor: gridStroke }} />
                  <div className="absolute top-0 bottom-0 border-l border-dashed border-[#10B981]" style={{ left: `${quenchPct}%` }} />
                  <div
                    className="absolute h-2 rounded-[2px] opacity-80"
                    style={{ left: `${leftPct}%`, width: `${Math.max(rightPct - leftPct, 1.5)}%`, backgroundColor: col }}
                  />
                  <div
                    className="absolute w-1.5 h-3.5 -translate-x-1/2 rounded-[1px]"
                    style={{ left: `${midPct}%`, backgroundColor: textPrimary }}
                  />
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
      </div>
    );
  }

  // 12. BOX & QUARTILE DISTRIBUTION
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {stats.map((s) => {
            const pMin = s.norm(s.min);
            const pQ1 = s.norm(s.q1);
            const pMed = s.norm(s.med);
            const pQ3 = s.norm(s.q3);
            const pMax = s.norm(s.max);
            const pSim = s.norm(s.simVal);

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
                <div className="relative h-6 flex items-center">
                  <div className="w-full h-[1px]" style={{ backgroundColor: gridStroke }} />
                  <div
                    className="absolute h-[2px]"
                    style={{
                      left: `${pMin}%`,
                      width: `${Math.max(pMax - pMin, 0.5)}%`,
                      backgroundColor: axisStroke,
                    }}
                  />
                  <div
                    className="absolute h-4 rounded-[2px] border"
                    style={{
                      left: `${pQ1}%`,
                      width: `${Math.max(pQ3 - pQ1, 1.5)}%`,
                      backgroundColor: isDark ? 'rgba(250,250,250,0.16)' : 'rgba(24,24,27,0.12)',
                      borderColor: axisStroke,
                    }}
                  />
                  <div
                    className="absolute h-4 w-[2.5px]"
                    style={{ left: `${pMed}%`, backgroundColor: '#10B981' }}
                  />
                  <div
                    className="absolute w-2.5 h-2.5 rotate-45 -translate-x-1/2 bg-[#EF4444] border border-white dark:border-zinc-950"
                    style={{ left: `${pSim}%` }}
                  />
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
  }

  // 13. BIVARIATE DENSITY STRIP PLOT (New Generic Technique #24)
  if (vizMode === 'density-strip') {
    const yMeta = getAxisMeta(numericY);
    const categories = Array.from(new Set(activeRuns.map((r) => String(r[colorByKey])))).slice(0, 6);
    const vals = activeRuns.map((r) => r[numericY]);
    const minVal = Math.min(...vals, getSimParamValue(numericY, sliders, simulation));
    const maxVal = Math.max(...vals, getSimParamValue(numericY, sliders, simulation));
    const span = Math.max(maxVal - minVal, 0.1);
    const toPct = (v: number) => Math.max(2, Math.min(98, ((v - minVal) / span) * 100));
    const simPct = toPct(getSimParamValue(numericY, sliders, simulation));

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-xs">
          <span className="font-sans text-zinc-500">
            Strip dispersion on {yMeta.label} ({yMeta.unit ?? ''}) grouped by{' '}
            {getAxisMeta(colorByKey).label} ({activeRuns.length} observations)
          </span>
          <span className="font-sans text-[11px] text-[#EF4444] font-semibold">
            Dashed Rule = Active Point (
            <span className="font-mono tabular-nums">
              {yMeta.format ? yMeta.format(getSimParamValue(numericY, sliders, simulation)) : ''} {yMeta.unit}
            </span>
            )
          </span>
        </div>

        <div className={`border rounded-[5px] p-3.5 space-y-3 ${isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/70 border-[#E4E4E7]'}`}>
          {categories.map((cat) => {
            const catRuns = activeRuns.filter((r) => String(r[colorByKey]) === cat).slice(0, 60);
            return (
              <div key={cat} className="grid grid-cols-12 items-center gap-3">
                <div className="col-span-3 sm:col-span-2 truncate">
                  <div className="font-sans text-xs font-semibold truncate">{cat}</div>
                  <div className="font-sans text-[10px] text-zinc-500">
                    n ={' '}
                    <span className="font-mono tabular-nums">
                      {activeRuns.filter((r) => String(r[colorByKey]) === cat).length}
                    </span>
                  </div>
                </div>
                <div className="col-span-9 sm:col-span-10 relative h-7 flex items-center">
                  <div className="w-full h-[1px]" style={{ backgroundColor: gridStroke }} />
                  <div
                    className="absolute top-0 bottom-0 border-l border-dashed border-[#EF4444]"
                    style={{ left: `${simPct}%` }}
                  />
                  {catRuns.map((r, idx) => (
                    <button
                      key={r.id}
                      type="button"
                      onMouseEnter={() => onHoverRun(r.id)}
                      onMouseLeave={() => onHoverRun(null)}
                      onClick={() => onInspectRun(r.id)}
                      title={`${r.psiId}: ${r[numericY]} ${yMeta.unit ?? ''}`}
                      className="absolute w-2.5 h-2.5 -translate-x-1/2 rounded-[2px] border border-white dark:border-zinc-950 cursor-pointer transition-transform hover:scale-125"
                      style={{
                        left: `${toPct(r[numericY])}%`,
                        top: `${8 + ((idx * 7) % 10)}px`,
                        backgroundColor: getGroupColor(r, colorByKey, groupIndexMap, isDark),
                        opacity: hoveredRunId && hoveredRunId !== r.id ? 0.25 : 0.85,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 14. MULTI-AXIS SCATTER PLOT
  if (vizMode === 'scatter-plot') {
    const xMeta = getAxisMeta(numericX);
    const yMeta = getAxisMeta(numericY);
    const scatterPoints = activeRuns.slice(0, 300).map((r) => ({
      id: r.id,
      psiId: r.psiId,
      material: r.material,
      facility: r.facility,
      x: r[numericX],
      y: r[numericY],
      outcome: r.outcome,
      color: getGroupColor(r, colorByKey, groupIndexMap, isDark),
    }));

    const simPoint = [
      {
        id: 'sim-active',
        psiId: 'ACTIVE VIRTUAL TEST',
        material: 'Model Operating Point',
        facility: `${sliders.g_eff.toFixed(3)}g`,
        x: getSimParamValue(numericX, sliders, simulation),
        y: getSimParamValue(numericY, sliders, simulation),
        outcome: simulation.hazardStatus,
      },
    ];

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-xs">
          <span className="font-sans text-zinc-500">
            X: <strong>{xMeta.label}</strong> vs. Y: <strong>{yMeta.label}</strong> · Colored by{' '}
            <strong>{getAxisMeta(colorByKey).label}</strong> (showing {scatterPoints.length} points)
          </span>
          <span className="font-sans text-[11px] text-zinc-500">
            Click any archive point to open Investigation Detail
          </span>
        </div>

        <div className="h-[310px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 16, left: 4 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                name={xMeta.label}
                unit={xMeta.unit ? ` ${xMeta.unit}` : ''}
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={yMeta.label}
                unit={yMeta.unit ? ` ${yMeta.unit}` : ''}
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <Tooltip content={renderCustomTooltip as never} cursor={{ strokeDasharray: '3 3' }} />
              <Legend
                verticalAlign="top"
                align="right"
                height={28}
                wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }}
              />
              <Scatter
                name="Dataset Points"
                data={scatterPoints}
                className="cursor-pointer"
                onClick={(item) => {
                  const row = item as { payload?: { id?: string }; id?: string };
                  const runId = row?.payload?.id ?? row?.id;
                  if (runId) onInspectRun(runId);
                }}
              >
                {scatterPoints.map((pt) => (
                  <Cell
                    key={pt.id}
                    fill={pt.color}
                    fillOpacity={hoveredRunId && hoveredRunId !== pt.id ? 0.25 : 0.85}
                  />
                ))}
              </Scatter>
              <Scatter
                name="Active Virtual Point"
                data={simPoint}
                fill={textPrimary}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 15. BUBBLE MULTI-METRIC PLOT
  if (vizMode === 'bubble-plot') {
    const xMeta = getAxisMeta(numericX);
    const yMeta = getAxisMeta(numericY);
    const bubbleData = activeRuns.slice(0, 200).map((r) => ({
      id: r.id,
      psiId: r.psiId,
      material: r.material,
      facility: r.facility,
      x: r[numericX],
      y: r[numericY],
      z: r.radiometerFlux_Wm2,
      spread: r.flameSpread_mms,
      outcome: r.outcome,
      color: getGroupColor(r, colorByKey, groupIndexMap, isDark),
    }));
    const simBubble = [
      {
        id: 'sim-active',
        psiId: 'ACTIVE VIRTUAL TEST',
        material: 'Current Chamber State',
        facility: `${sliders.g_eff.toFixed(3)}g`,
        x: getSimParamValue(numericX, sliders, simulation),
        y: getSimParamValue(numericY, sliders, simulation),
        z: Math.round(simulation.peakTemp_K * 11.5),
        spread: simulation.flameSpread_mms,
        outcome: simulation.hazardStatus,
      },
    ];

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-xs">
          <span className="font-sans text-zinc-500">
            X = {xMeta.label}, Y = {yMeta.label}, Radius = IR Radiometer Flux (W/m²), Color ={' '}
            {getAxisMeta(colorByKey).label}.
          </span>
        </div>
        <div className="h-[310px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 16, left: 4 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                name={xMeta.label}
                unit={xMeta.unit ? ` ${xMeta.unit}` : ''}
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={yMeta.label}
                unit={yMeta.unit ? ` ${yMeta.unit}` : ''}
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <ZAxis type="number" dataKey="z" name="IR Flux (W/m²)" range={[70, 500]} />
              <Tooltip content={renderCustomTooltip as never} />
              <Legend
                verticalAlign="top"
                align="right"
                height={28}
                wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }}
              />
              <Scatter
                name="Dataset Points"
                data={bubbleData}
                className="cursor-pointer"
                onMouseEnter={(item) => {
                  const row = item as { payload?: { id?: string }; id?: string };
                  const runId = row?.payload?.id ?? row?.id;
                  if (runId) onHoverRun(runId);
                }}
                onMouseLeave={() => onHoverRun(null)}
                onClick={(item) => {
                  const row = item as { payload?: { id?: string }; id?: string };
                  const runId = row?.payload?.id ?? row?.id;
                  if (runId) onInspectRun(runId);
                }}
              >
                {bubbleData.map((b) => {
                  const isDimmed = hoveredRunId !== null && hoveredRunId !== b.id;
                  return (
                    <Cell
                      key={b.id}
                      fill={b.color}
                      fillOpacity={isDimmed ? 0.16 : 0.82}
                    />
                  );
                })}
              </Scatter>
              <Scatter name="Active Virtual Point" data={simBubble} fill={textPrimary} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 16. RESIDUAL SPREAD DEVIATION PLOT (New Generic Technique #25)
  if (vizMode === 'residual-deviation') {
    const xMeta = getAxisMeta(numericX);
    const residualPts = activeRuns.slice(0, 200).map((r) => {
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
        id: r.id,
        psiId: r.psiId,
        material: r.material,
        facility: r.facility,
        x: r[numericX],
        residual,
        observed: r.flameSpread_mms,
        predicted,
        color: Math.abs(residual) > 0.65 ? '#EF4444' : Math.abs(residual) > 0.3 ? '#F59E0B' : '#10B981',
      };
    });

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-xs">
          <span className="font-sans text-zinc-500">
            Observed minus Physics-Model Spread Error (mm/s) across {xMeta.label} ({residualPts.length} points)
          </span>
          <span className="font-sans text-[11px] text-[#10B981] font-semibold">
            Zero Line = Exact Calibration Fit
          </span>
        </div>
        <div className="h-[310px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 16, left: 4 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <ReferenceLine y={0} stroke="#10B981" strokeDasharray="4 4" strokeWidth={1.5} />
              <XAxis
                type="number"
                dataKey="x"
                name={xMeta.label}
                unit={xMeta.unit ? ` ${xMeta.unit}` : ''}
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                type="number"
                dataKey="residual"
                name="Residual Error"
                unit=" mm/s"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <Tooltip content={renderCustomTooltip as never} />
              <Scatter
                name="Model Residuals"
                data={residualPts}
                className="cursor-pointer"
                onMouseEnter={(item) => {
                  const row = item as { payload?: { id?: string }; id?: string };
                  const runId = row?.payload?.id ?? row?.id;
                  if (runId) onHoverRun(runId);
                }}
                onMouseLeave={() => onHoverRun(null)}
                onClick={(item) => {
                  const row = item as { payload?: { id?: string }; id?: string };
                  const runId = row?.payload?.id ?? row?.id;
                  if (runId) onInspectRun(runId);
                }}
              >
                {residualPts.map((pt) => {
                  const isDimmed = hoveredRunId !== null && hoveredRunId !== pt.id;
                  return (
                    <Cell
                      key={pt.id}
                      fill={pt.color}
                      fillOpacity={isDimmed ? 0.16 : 0.85}
                    />
                  );
                })}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 17. CORRELATION MATRIX
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

        <div className="overflow-x-auto">
          <table className={`w-full border-collapse border text-xs ${isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'}`}>
            <thead>
              <tr className={isDark ? 'bg-[#09090B]' : 'bg-zinc-50'}>
                <th className="p-2 text-left font-sans font-semibold border-b border-r border-inherit">
                  Variable
                </th>
                {vars.map((v) => (
                  <th key={v.key} className="p-2 text-center font-sans font-semibold border-b border-inherit">
                    {v.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vars.map((rowVar) => (
                <tr key={rowVar.key} className="border-b border-inherit">
                  <td className={`p-2 font-sans font-semibold border-r border-inherit ${isDark ? 'bg-[#09090B]' : 'bg-zinc-50'}`}>
                    {rowVar.label}
                  </td>
                  {vars.map((colVar) => {
                    const r =
                      rowVar.key === colVar.key
                        ? 1
                        : pearsonCorrelation(
                            activeRuns.map((x) => x[rowVar.key]),
                            activeRuns.map((x) => x[colVar.key])
                          );
                    const absR = Math.abs(r);
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
      </div>
    );
  }

  // 18. NORMALIZED MATRIX HEATMAP
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
      ...activeRuns.slice(0, 14).map((r) => ({
        id: r.id,
        psiId: r.psiId,
        isSim: false,
        vals: r as unknown as Record<NumericAxisKey, number>,
      })),
    ];

    return (
      <div className="space-y-2.5">
        <div className={`border rounded-[5px] overflow-x-auto ${isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'}`}>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className={`border-b font-sans text-[11px] font-semibold text-zinc-500 ${isDark ? 'bg-[#09090B] border-[#27272A]' : 'bg-zinc-50 border-[#E4E4E7]'}`}>
                <th className="py-2 px-3 text-left">Record</th>
                {cols.map((c) => (
                  <th key={c.key} className="py-2 px-3 text-right">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-[#27272A]' : 'divide-[#E4E4E7]'}`}>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onMouseEnter={() => !row.isSim && onHoverRun(row.id)}
                  onMouseLeave={() => onHoverRun(null)}
                  onClick={() => !row.isSim && onInspectRun(row.id)}
                  className={!row.isSim ? 'cursor-pointer hover:opacity-90' : ''}
                >
                  <td
                    className={`py-2 px-3 font-semibold whitespace-nowrap ${
                      row.isSim ? 'font-sans' : 'font-mono tabular-nums'
                    }`}
                  >
                    {row.psiId}
                  </td>
                  {cols.map((col) => {
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
      </div>
    );
  }

  // 19. MULTI-SERIES LINE CHART (Honors Y-Axis telemetry channel & shared hover brushing)
  if (vizMode === 'multi-series-line') {
    const compareRuns = activeRuns.slice(0, 4);
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
        <div className="h-[310px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              {channel === 'temp_K' && (
                <ReferenceArea y1={550} y2={800} fill="rgba(245, 158, 11, 0.1)" />
              )}
              <XAxis dataKey="time_s" unit="s" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
              <YAxis
                domain={channel === 'temp_K' ? [250, 1850] : ['auto', 'auto']}
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
              />
              {runSeriesMap.map((entry, idx) => {
                const isDimmed =
                  hoveredRunId !== null && hoveredRunId !== entry.run.id;
                return (
                  <Line
                    key={entry.run.id}
                    type="monotone"
                    dataKey={`run_${idx}`}
                    name={entry.run.psiId}
                    stroke={RUN_COLORS[idx % RUN_COLORS.length]}
                    strokeWidth={hoveredRunId === entry.run.id ? 3 : 2}
                    strokeOpacity={isDimmed ? 0.25 : 0.95}
                    dot={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 20. AREA PROGRESSION CHART
  if (vizMode === 'area-chart') {
    return (
      <div className="h-[310px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={simulation.timelineSeries} margin={{ top: 10, right: 20, left: 4, bottom: 8 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="time_s" unit="s" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
            <YAxis yAxisId="ir" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
            <YAxis yAxisId="co" orientation="right" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
            <Tooltip content={renderCustomTooltip as never} />
            <Legend verticalAlign="top" align="right" height={30} wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
            <Area yAxisId="ir" type="monotone" dataKey="irFlux_Wm2" name="IR Flux (W/m²)" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.22} strokeWidth={2} />
            <Area yAxisId="co" type="monotone" dataKey="coYield_ppm" name="CO Yield (ppm)" stroke="#EF4444" fill="#EF4444" fillOpacity={0.18} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // 21. STACKED AREA CHART
  if (vizMode === 'stacked-area') {
    const stackedData = simulation.timelineSeries.map((pt) => ({
      time_s: pt.time_s,
      thermalNorm: Math.round(((pt.temp_K - 298) / 1552) * 100),
      irNorm: Math.round((pt.irFlux_Wm2 / 22000) * 100),
      coNorm: Math.round((pt.coYield_ppm / 700) * 100),
    }));

    return (
      <div className="h-[310px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={stackedData} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="time_s" unit="s" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
            <YAxis unit="%" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
            <Tooltip content={renderCustomTooltip as never} />
            <Legend verticalAlign="top" align="right" height={30} wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
            <Area type="monotone" dataKey="thermalNorm" stackId="1" name="Thermal Load (%)" stroke="#EF4444" fill="#EF4444" fillOpacity={0.45} />
            <Area type="monotone" dataKey="irNorm" stackId="1" name="Radiative Load (%)" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.4} />
            <Area type="monotone" dataKey="coNorm" stackId="1" name="CO Load (%)" stroke="#10B981" fill="#10B981" fillOpacity={0.35} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // 22. STEP TRANSITION CHART
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

    return (
      <div className="h-[310px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={stepData} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="time_s" unit="s" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
            <YAxis yAxisId="temp" domain={[250, 1850]} unit="K" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
            <YAxis yAxisId="state" orientation="right" domain={[0, 3.5]} ticks={[0, 1, 2, 3]} stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
            <Tooltip content={renderCustomTooltip as never} />
            <Legend verticalAlign="top" align="right" height={30} wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
            <Line yAxisId="temp" type="stepAfter" dataKey="temp_K" name="Gas Temp (K)" stroke="#EF4444" strokeWidth={2.25} dot={false} />
            <Line yAxisId="state" type="stepAfter" dataKey="stateLevel" name="Regime State (0–3)" stroke="#F59E0B" strokeWidth={2} dot={{ r: 2.5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // 23. FORECAST PROGRESSION CHART
  if (vizMode === 'timeline-progression') {
    const startRadius = 12.0;
    const endRadius = simulation.forecast10s.radius_mm;
    const endPress = simulation.forecast10s.pressureRise_kPa;
    const steps10s = Array.from({ length: 11 }, (_, t) => ({
      second: `t+${t}s`,
      radius_mm: Number((startRadius + ((endRadius - startRadius) * t) / 10).toFixed(1)),
      pressureRise_kPa: Number(((endPress * t) / 10).toFixed(2)),
    }));

    return (
      <div className="h-[310px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={steps10s} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
            <XAxis dataKey="second" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
            <YAxis yAxisId="rad" unit=" mm" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
            <YAxis yAxisId="press" orientation="right" unit=" kPa" stroke={axisStroke} tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
            <Tooltip content={renderCustomTooltip as never} />
            <Legend verticalAlign="top" align="right" height={30} wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
            <Bar yAxisId="rad" dataKey="radius_mm" name="Flame Radius (mm)" fill={isDark ? '#D4D4D8' : '#27272A'} radius={[3, 3, 0, 0]} maxBarSize={36} />
            <Line yAxisId="press" type="monotone" dataKey="pressureRise_kPa" name="Pressure Rise (kPa)" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3.5, fill: '#F59E0B' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // 24. POLAR RADIAL PROFILE
  if (vizMode === 'polar-radial') {
    const compareRuns = activeRuns.slice(0, 2);
    const axes = [
      { metric: 'O₂ %', sim: (sliders.O2_pct / 50) * 100, fn: (r: PsiRun) => (r.O2_pct / 50) * 100 },
      { metric: 'Pressure', sim: (sliders.P_psi / 15) * 100, fn: (r: PsiRun) => (r.P_psi / 15) * 100 },
      { metric: 'Airflow', sim: (sliders.Flow_ms / 0.4) * 100, fn: (r: PsiRun) => (r.Flow_ms / 0.4) * 100 },
      { metric: 'Thickness', sim: (sliders.Thickness_mm / 8) * 100, fn: (r: PsiRun) => (r.Thickness_mm / 8) * 100 },
      { metric: 'Peak Temp', sim: (simulation.peakTemp_K / 1800) * 100, fn: (r: PsiRun) => (r.peakTemp_K / 1800) * 100 },
      { metric: 'Spread', sim: (simulation.flameSpread_mms / 4.0) * 100, fn: (r: PsiRun) => (r.flameSpread_mms / 4.0) * 100 },
    ];

    const radarData = axes.map((a) => {
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
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="54%" outerRadius="72%">
              <PolarGrid stroke={gridStroke} />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fill: textPrimary }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }} />
              <Tooltip content={renderCustomTooltip as never} />
              <Legend verticalAlign="top" align="right" height={30} wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
              <Radar name="ACTIVE VIRTUAL (%)" dataKey="ActiveSim" stroke="#EF4444" fill="#EF4444" fillOpacity={0.22} strokeWidth={2} />
              {compareRuns.map((r, idx) => (
                <Radar
                  key={r.id}
                  name={`${r.psiId} (%)`}
                  dataKey={`run_${idx}`}
                  stroke={RUN_COLORS[idx % RUN_COLORS.length]}
                  fill={RUN_COLORS[idx % RUN_COLORS.length]}
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return (
    <div className="py-10 text-center text-xs text-zinc-500">
      Select a compatible visualization technique to inspect the active dataset.
    </div>
  );
};
