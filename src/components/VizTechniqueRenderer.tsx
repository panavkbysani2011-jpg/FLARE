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

interface VizTechniqueRendererProps {
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

function outcomeColor(outcome: HazardOutcome): string {
  if (outcome === 'Rapid Flame Spread') return '#EF4444';
  if (outcome === 'Cool Flame Caution') return '#F59E0B';
  return '#10B981';
}

type NumericParamKey =
  | 'O2_pct'
  | 'P_psi'
  | 'Flow_ms'
  | 'g_eff'
  | 'Thickness_mm'
  | 'flameSpread_mms'
  | 'peakTemp_K'
  | 'radiometerFlux_Wm2';

const PARAM_OPTIONS: Array<{
  key: NumericParamKey;
  label: string;
  unit: string;
  format: (v: number) => string;
}> = [
  { key: 'O2_pct', label: 'O₂ Concentration', unit: '%', format: (v) => v.toFixed(1) },
  { key: 'P_psi', label: 'Cabin Pressure', unit: 'psi', format: (v) => v.toFixed(1) },
  { key: 'Flow_ms', label: 'Airflow Velocity', unit: 'm/s', format: (v) => v.toFixed(2) },
  { key: 'Thickness_mm', label: 'Substrate Thickness', unit: 'mm', format: (v) => v.toFixed(1) },
  { key: 'g_eff', label: 'Effective Gravity', unit: 'g', format: (v) => v.toFixed(3) },
  { key: 'flameSpread_mms', label: 'Flame Spread', unit: 'mm/s', format: (v) => v.toFixed(2) },
  { key: 'peakTemp_K', label: 'Peak Gas Temp', unit: 'K', format: (v) => `${Math.round(v)}` },
  {
    key: 'radiometerFlux_Wm2',
    label: 'IR Radiometer Flux',
    unit: 'W/m²',
    format: (v) => `${Math.round(v)}`,
  },
];

function getSimParamValue(
  key: NumericParamKey,
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

interface EChartsCanvasProps {
  option: echarts.EChartsOption;
  height?: number;
  ariaLabel: string;
}

const EChartsCanvas: React.FC<EChartsCanvasProps> = ({
  option,
  height = 310,
  ariaLabel,
}) => {
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
  const textMuted = isDark ? '#A1A1AA' : '#71717A';

  const [scatterX, setScatterX] = useState<NumericParamKey>('O2_pct');
  const [scatterY, setScatterY] = useState<NumericParamKey>('flameSpread_mms');
  const [histogramMetric, setHistogramMetric] =
    useState<NumericParamKey>('flameSpread_mms');
  const [lollipopMetric, setLollipopMetric] =
    useState<NumericParamKey>('flameSpread_mms');
  const [contourHover, setContourHover] = useState<{
    p: number;
    thick: number;
    spread: number;
    status: string;
  } | null>(null);

  const tooltipContentStyle: React.CSSProperties = {
    backgroundColor: isDark ? 'rgba(24, 24, 27, 0.96)' : 'rgba(255, 255, 255, 0.96)',
    border: `1px solid ${borderCol}`,
    borderRadius: '5px',
    fontSize: '11px',
    fontFamily: 'JetBrains Mono, monospace',
    color: textPrimary,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  };

  // Custom Recharts tooltip for runs
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
        className="px-3 py-2 rounded-[5px] border shadow-lg text-xs"
        style={tooltipContentStyle}
      >
        <div className="font-sans font-semibold text-xs">{title}</div>
        {subtitle && (
          <div className="font-sans text-[10px] opacity-70 mt-0.5">{subtitle}</div>
        )}
        <div className="mt-1.5 space-y-0.5 font-mono tabular-nums text-[11px]">
          {payload.map((entry, idx) => (
            <div key={idx} className="flex items-center justify-between gap-4">
              <span className="font-sans opacity-75">{entry.name}:</span>
              <span className="font-semibold" style={{ color: entry.color || textPrimary }}>
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

  // ECharts Histogram Option (used when vizMode === 'histogram')
  const histogramData = useMemo(() => {
    const paramMeta =
      PARAM_OPTIONS.find((p) => p.key === histogramMetric) ?? PARAM_OPTIONS[5];
    const values = activeRuns.map((r) => r[histogramMetric]);
    const simVal = getSimParamValue(histogramMetric, sliders, simulation);
    if (values.length === 0) {
      return { bins: [], simBinIdx: -1, mean: 0, median: 0, paramMeta, simVal };
    }
    const minV = Math.min(...values, simVal);
    const maxV = Math.max(...values, simVal);
    const binCount = Math.min(8, Math.max(4, Math.ceil(Math.log2(values.length) + 1)));
    const span = Math.max(maxV - minV, 0.1);
    const step = span / binCount;

    const bins = Array.from({ length: binCount }, (_, idx) => {
      const start = minV + idx * step;
      const end = idx === binCount - 1 ? maxV + 0.0001 : minV + (idx + 1) * step;
      const matchedRuns = activeRuns.filter((r) => {
        const val = r[histogramMetric];
        return idx === binCount - 1 ? val >= start && val <= end : val >= start && val < end;
      });
      return {
        label: `${paramMeta.format(start)}–${paramMeta.format(minV + (idx + 1) * step)}`,
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
      animationDuration: 300,
      grid: { top: 34, right: 24, bottom: 44, left: 48 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: isDark ? '#18181B' : '#FFFFFF',
        borderColor: borderCol,
        textStyle: {
          color: textPrimary,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
        },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const first = arr[0] as { dataIndex?: number; name?: string } | undefined;
          const idx = first?.dataIndex ?? 0;
          const bin = histogramData.bins[idx];
          if (!bin) return '';
          const runList =
            bin.runs.length > 0
              ? bin.runs.slice(0, 5).join(', ') + (bin.runs.length > 5 ? '…' : '')
              : 'None';
          return [
            `<div style="font-family:Inter,sans-serif;font-weight:600;margin-bottom:4px;">${bin.label} ${histogramData.paramMeta.unit}</div>`,
            `<div>Archive Count: <strong>${bin.count}</strong></div>`,
            `<div>Active Sim Bin: <strong>${bin.hasSim ? 'YES' : 'No'}</strong></div>`,
            `<div style="opacity:0.75;margin-top:3px;font-size:10px;">Runs: ${runList}</div>`,
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
        nameGap: 26,
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
        name: 'Run Count',
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
              color: b.hasSim
                ? '#EF4444'
                : isDark
                ? '#D4D4D8'
                : '#27272A',
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

  // 1. GROUPED BAR CHART
  if (vizMode === 'grouped-bar') {
    const displayedRuns = activeRuns.slice(0, 8);
    const chartData = [
      {
        name: 'ACTIVE SIM',
        psiId: 'ACTIVE SIM',
        O2_pct: Number(sliders.O2_pct.toFixed(1)),
        P_psi: Number(sliders.P_psi.toFixed(1)),
        Spread_x10: Number((simulation.flameSpread_mms * 10).toFixed(1)),
        flameSpread_mms: simulation.flameSpread_mms,
        material: 'Current Cabin Simulation',
        facility: `${sliders.g_eff.toFixed(3)}g`,
        isSim: true,
      },
      ...displayedRuns.map((r) => ({
        id: r.id,
        name: r.psiId.split(' ')[0],
        psiId: r.psiId,
        O2_pct: r.O2_pct,
        P_psi: r.P_psi,
        Spread_x10: Number((r.flameSpread_mms * 10).toFixed(1)),
        flameSpread_mms: r.flameSpread_mms,
        material: r.material,
        facility: r.facility,
        isSim: false,
      })),
    ];

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            Comparing O₂ %, Cabin Pressure (psi), and Flame Spread (×10 mm/s scale) across active runs + simulator.
          </span>
          <div className="flex items-center gap-4 text-[11px] font-sans font-medium">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#10B981]" />
              <span>O₂ %</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#F59E0B]" />
              <span>Pressure (psi)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#EF4444]" />
              <span>Spread (×10 mm/s)</span>
            </span>
          </div>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <Tooltip content={renderCustomTooltip as never} />
              <Bar
                dataKey="O2_pct"
                name="O₂ (%)"
                fill="#10B981"
                radius={[3, 3, 0, 0]}
                onClick={(item) => {
                  const row = (item as { payload?: { id?: string; isSim?: boolean } })?.payload;
                  if (row?.id && !row.isSim) onInspectRun(row.id);
                }}
                className="cursor-pointer"
              />
              <Bar
                dataKey="P_psi"
                name="Pressure (psi)"
                fill="#F59E0B"
                radius={[3, 3, 0, 0]}
                onClick={(item) => {
                  const row = (item as { payload?: { id?: string; isSim?: boolean } })?.payload;
                  if (row?.id && !row.isSim) onInspectRun(row.id);
                }}
                className="cursor-pointer"
              />
              <Bar
                dataKey="Spread_x10"
                name="Flame Spread (×10 mm/s)"
                fill="#EF4444"
                radius={[3, 3, 0, 0]}
                onClick={(item) => {
                  const row = (item as { payload?: { id?: string; isSim?: boolean } })?.payload;
                  if (row?.id && !row.isSim) onInspectRun(row.id);
                }}
                className="cursor-pointer"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 2. STACKED BAR CHART
  if (vizMode === 'stacked-bar') {
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            Stacked composite hazard load across candidate substrates (0–100 normalized indices per category).
          </span>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-sans font-medium">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#EF4444]" />
              <span>Flame Spread</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#71717A]" />
              <span>Smoke Clumping</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#F59E0B]" />
              <span>Toxic Yield</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px] bg-[#10B981]" />
              <span>Cool-Flame Risk</span>
            </span>
          </div>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={matData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
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
              <Bar
                dataKey="flameSpreadIndex"
                name="Flame Spread Index"
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
                name="Smoke Clumping Index"
                stackId="hazard"
                fill={isDark ? '#A1A1AA' : '#52525B'}
              />
              <Bar
                dataKey="toxicGasYieldIndex"
                name="Toxic Gas Yield Index"
                stackId="hazard"
                fill="#F59E0B"
              />
              <Bar
                dataKey="coolFlameRiskIndex"
                name="Cool-Flame Risk Index"
                stackId="hazard"
                fill="#10B981"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {hoveredMaterialId && (
          <div className="text-[11px] font-mono text-zinc-500">
            Highlighted Material Code: {hoveredMaterialId}
          </div>
        )}
      </div>
    );
  }

  // 3. HORIZONTAL RANKED BARS
  if (vizMode === 'horizontal-ranked-bar') {
    const combined = [
      {
        id: 'sim-active',
        name: 'ACTIVE SIM',
        psiId: 'ACTIVE SIMULATION',
        flameSpread_mms: simulation.flameSpread_mms,
        outcome: simulation.hazardStatus,
        material: `${sliders.O2_pct.toFixed(1)}% O₂ · ${sliders.Thickness_mm.toFixed(1)}mm`,
        facility: `${sliders.g_eff.toFixed(3)}g`,
        isSim: true,
      },
      ...activeRuns.slice(0, 12).map((r) => ({
        id: r.id,
        name: r.psiId.split(' ')[0],
        psiId: r.psiId,
        flameSpread_mms: r.flameSpread_mms,
        outcome: r.outcome,
        material: r.material,
        facility: r.facility,
        isSim: false,
      })),
    ].sort((a, b) => b.flameSpread_mms - a.flameSpread_mms);

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            Ranked by Flame Spread Speed (mm/s). Click any archive bar to open Run Detail Inspector.
          </span>
          <span className="font-mono text-[11px] text-[#10B981] font-semibold">
            Dashed Line = 0.48 mm/s Self-Extinguishing Bound
          </span>
        </div>
        <div style={{ height: `${Math.max(260, combined.length * 28)}px` }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={combined}
              layout="vertical"
              margin={{ top: 8, right: 28, left: 24, bottom: 8 }}
            >
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                unit=" mm/s"
              />
              <YAxis
                type="category"
                dataKey="name"
                width={92}
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <Tooltip content={renderCustomTooltip as never} />
              <ReferenceLine
                x={0.48}
                stroke="#10B981"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
              <Bar
                dataKey="flameSpread_mms"
                name="Flame Spread (mm/s)"
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
                    fill={
                      entry.isSim
                        ? isDark
                          ? '#FAFAFA'
                          : '#18181B'
                        : outcomeColor(entry.outcome)
                    }
                    fillOpacity={
                      hoveredRunId && hoveredRunId !== entry.id && !entry.isSim ? 0.3 : 0.9
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 4. LOLLIPOP / DOT DELTA COMPARISON
  if (vizMode === 'lollipop-dot') {
    const paramMeta =
      PARAM_OPTIONS.find((p) => p.key === lollipopMetric) ?? PARAM_OPTIONS[5];
    const simVal = getSimParamValue(lollipopMetric, sliders, simulation);
    const items = activeRuns.slice(0, 12).map((r) => ({
      run: r,
      val: r[lollipopMetric],
      delta: r[lollipopMetric] - simVal,
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="lollipop-metric" className="font-sans font-medium text-zinc-500">
              Metric:
            </label>
            <select
              id="lollipop-metric"
              value={lollipopMetric}
              onChange={(e) => setLollipopMetric(e.target.value as NumericParamKey)}
              className={`px-2 py-1 text-xs font-sans rounded-[4px] border focus:outline-none ${
                isDark
                  ? 'bg-[#09090B] border-[#27272A] text-zinc-100'
                  : 'bg-zinc-50 border-[#E4E4E7] text-zinc-900'
              }`}
            >
              {PARAM_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} ({p.unit})
                </option>
              ))}
            </select>
          </div>
          <div className="font-mono text-[11px] tabular-nums">
            Active Simulator Baseline:{' '}
            <span className="font-bold">
              {paramMeta.format(simVal)} {paramMeta.unit}
            </span>
          </div>
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
            const dotCol = outcomeColor(run.outcome);

            return (
              <div
                key={run.id}
                onMouseEnter={() => onHoverRun(run.id)}
                onMouseLeave={() => onHoverRun(null)}
                onClick={() => onInspectRun(run.id)}
                className={`grid grid-cols-12 items-center gap-3 cursor-pointer transition-opacity duration-150 ${
                  isDimmed ? 'opacity-30' : 'opacity-100'
                }`}
              >
                <div className="col-span-3 sm:col-span-2 truncate">
                  <div className="font-mono text-xs font-semibold truncate">{run.psiId}</div>
                  <div className="font-sans text-[10px] text-zinc-500 truncate">{run.material}</div>
                </div>

                <div className="col-span-6 sm:col-span-8 relative h-5 flex items-center">
                  <div
                    className="w-full h-[1px]"
                    style={{ backgroundColor: gridStroke }}
                  />
                  {/* Simulator baseline vertical marker */}
                  <div
                    className="absolute top-0.5 bottom-0.5 w-[2px]"
                    style={{
                      left: `${simPct}%`,
                      backgroundColor: isDark ? '#FAFAFA' : '#18181B',
                    }}
                    title="Active Simulator Baseline"
                  />
                  {/* Stem from simulator baseline to run value */}
                  <div
                    className="absolute h-[2.5px] transition-all duration-300"
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 0.4)}%`,
                      backgroundColor: dotCol,
                    }}
                  />
                  {/* Dot */}
                  <div
                    className="absolute w-3 h-3 rounded-[2px] -translate-x-1/2 border transition-all duration-300"
                    style={{
                      left: `${dotPct}%`,
                      backgroundColor: dotCol,
                      borderColor: isDark ? '#09090B' : '#FFFFFF',
                    }}
                  />
                </div>

                <div className="col-span-3 sm:col-span-2 text-right font-mono text-[11px] tabular-nums">
                  <span className="font-bold">
                    {paramMeta.format(val)} {paramMeta.unit}
                  </span>
                  <span
                    className={`block text-[10px] ${
                      delta > 0 ? 'text-[#EF4444]' : 'text-[#10B981]'
                    }`}
                  >
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

  // 5. HISTOGRAM (ECharts)
  if (vizMode === 'histogram') {
    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="hist-metric" className="font-sans font-medium text-zinc-500">
              Variable to Bin:
            </label>
            <select
              id="hist-metric"
              value={histogramMetric}
              onChange={(e) => setHistogramMetric(e.target.value as NumericParamKey)}
              className={`px-2 py-1 text-xs font-sans rounded-[4px] border focus:outline-none ${
                isDark
                  ? 'bg-[#09090B] border-[#27272A] text-zinc-100'
                  : 'bg-zinc-50 border-[#E4E4E7] text-zinc-900'
              }`}
            >
              {PARAM_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} ({p.unit})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] tabular-nums">
            <span>
              n = <strong>{activeRuns.length}</strong>
            </span>
            <span>
              Mean:{' '}
              <strong>
                {histogramData.paramMeta.format(histogramData.mean)}{' '}
                {histogramData.paramMeta.unit}
              </strong>
            </span>
            <span>
              Median:{' '}
              <strong>
                {histogramData.paramMeta.format(histogramData.median)}{' '}
                {histogramData.paramMeta.unit}
              </strong>
            </span>
            <span className="text-[#EF4444] font-semibold">
              ■ Red Bar = Active Sim ({histogramData.paramMeta.format(histogramData.simVal)}{' '}
              {histogramData.paramMeta.unit})
            </span>
          </div>
        </div>

        <EChartsCanvas
          option={histogramEChartsOption}
          height={295}
          ariaLabel="Telemetry Distribution Histogram"
        />
      </div>
    );
  }

  // 6. FREQUENCY DISTRIBUTION BARS
  if (vizMode === 'frequency-distribution') {
    const outcomeCounts: Array<{ name: HazardOutcome; count: number; color: string }> = [
      {
        name: 'Rapid Flame Spread',
        count: activeRuns.filter((r) => r.outcome === 'Rapid Flame Spread').length,
        color: '#EF4444',
      },
      {
        name: 'Cool Flame Caution',
        count: activeRuns.filter((r) => r.outcome === 'Cool Flame Caution').length,
        color: '#F59E0B',
      },
      {
        name: 'Self-Extinguishing',
        count: activeRuns.filter((r) => r.outcome === 'Self-Extinguishing').length,
        color: '#10B981',
      },
    ];

    const facilities = ['CIR', 'MSG', 'Cygnus', 'FSL'] as const;
    const facilityCounts = facilities.map((f) => ({
      name: f,
      count: activeRuns.filter((r) => r.facility === f).length,
    }));

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          className={`p-3.5 rounded-[5px] border ${
            isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/60 border-[#E4E4E7]'
          }`}
        >
          <div className="text-xs font-sans font-semibold mb-2">
            Frequency by Hazard Outcome Regime (n = {activeRuns.length})
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outcomeCounts} margin={{ top: 10, right: 16, left: -10, bottom: 8 }}>
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
                <Bar dataKey="count" name="Runs" radius={[3, 3, 0, 0]} maxBarSize={56}>
                  {outcomeCounts.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-[5px] border ${
            isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/60 border-[#E4E4E7]'
          }`}
        >
          <div className="text-xs font-sans font-semibold mb-2">
            Frequency by Orbital Hardware Facility
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={facilityCounts} margin={{ top: 10, right: 16, left: -10, bottom: 8 }}>
                <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke={axisStroke}
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                />
                <YAxis
                  allowDecimals={false}
                  stroke={axisStroke}
                  tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
                />
                <Tooltip content={renderCustomTooltip as never} />
                <Bar
                  dataKey="count"
                  name="Runs"
                  fill={isDark ? '#E4E4E7' : '#18181B'}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={56}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // 7. RANGE & UNCERTAINTY INTERVAL BARS
  if (vizMode === 'range-interval-bar') {
    const items = [
      {
        id: 'sim-active',
        psiId: 'ACTIVE SIMULATOR',
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            Displays ±95% confidence interval spans around predicted/observed flame spread velocities (mm/s).
          </span>
          <span className="font-mono text-[11px] text-[#10B981] font-semibold">
            Dashed Line = 0.48 mm/s Quench Bound
          </span>
        </div>

        <div
          className={`border rounded-[5px] p-3.5 space-y-2.5 ${
            isDark ? 'bg-[#09090B]/60 border-[#27272A]' : 'bg-zinc-50/70 border-[#E4E4E7]'
          }`}
        >
          {items.map((item) => {
            const leftPct = toPct(item.low);
            const rightPct = toPct(item.high);
            const midPct = toPct(item.mid);
            const col = item.isSim ? (isDark ? '#FAFAFA' : '#18181B') : outcomeColor(item.outcome);
            return (
              <div
                key={item.id}
                onMouseEnter={() => !item.isSim && onHoverRun(item.id)}
                onMouseLeave={() => onHoverRun(null)}
                onClick={() => !item.isSim && onInspectRun(item.id)}
                className={`grid grid-cols-12 items-center gap-3 ${
                  !item.isSim ? 'cursor-pointer' : ''
                }`}
              >
                <div className="col-span-4 sm:col-span-3 truncate">
                  <div className="font-mono text-xs font-semibold truncate">{item.psiId}</div>
                  <div className="font-sans text-[10px] text-zinc-500 truncate">{item.material}</div>
                </div>
                <div className="col-span-5 sm:col-span-6 relative h-5 flex items-center">
                  <div className="w-full h-[1px]" style={{ backgroundColor: gridStroke }} />
                  <div
                    className="absolute top-0 bottom-0 border-l border-dashed border-[#10B981]"
                    style={{ left: `${quenchPct}%` }}
                  />
                  {/* Interval bar */}
                  <div
                    className="absolute h-2 rounded-[2px] opacity-80"
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(rightPct - leftPct, 1.5)}%`,
                      backgroundColor: col,
                    }}
                  />
                  {/* Center median/point marker */}
                  <div
                    className="absolute w-1.5 h-3.5 -translate-x-1/2 rounded-[1px]"
                    style={{
                      left: `${midPct}%`,
                      backgroundColor: isDark ? '#FFFFFF' : '#09090B',
                    }}
                  />
                </div>
                <div className="col-span-3 text-right font-mono text-[11px] tabular-nums">
                  <span className="font-bold">
                    {item.mid.toFixed(2)} ± {item.ci.toFixed(2)}
                  </span>{' '}
                  <span className="text-zinc-500">mm/s</span>
                  <span className="block text-[10px] text-zinc-500">{item.temp} K peak</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 8. BOX / QUARTILE SUMMARY PLOT
  if (vizMode === 'box-quartile') {
    const metrics: Array<{
      key: NumericParamKey;
      label: string;
      unit: string;
      minScale: number;
      maxScale: number;
      format: (v: number) => string;
    }> = [
      { key: 'O2_pct', label: 'O₂ %', unit: '%', minScale: 14, maxScale: 45, format: (v) => v.toFixed(1) },
      { key: 'P_psi', label: 'Pressure', unit: 'psi', minScale: 4, maxScale: 16, format: (v) => v.toFixed(1) },
      { key: 'Flow_ms', label: 'Airflow', unit: 'm/s', minScale: 0, maxScale: 0.4, format: (v) => v.toFixed(2) },
      { key: 'Thickness_mm', label: 'Thickness', unit: 'mm', minScale: 0, maxScale: 8, format: (v) => v.toFixed(1) },
      { key: 'flameSpread_mms', label: 'Flame Spread', unit: 'mm/s', minScale: 0, maxScale: 3.5, format: (v) => v.toFixed(2) },
      { key: 'peakTemp_K', label: 'Peak Temp', unit: 'K', minScale: 500, maxScale: 1600, format: (v) => `${Math.round(v)}` },
    ];

    const stats = metrics.map((m) => {
      const vals = activeRuns.map((r) => r[m.key]).sort((a, b) => a - b);
      const min = vals[0] ?? 0;
      const max = vals[vals.length - 1] ?? 0;
      const q1 = quantile(vals, 0.25);
      const med = quantile(vals, 0.5);
      const q3 = quantile(vals, 0.75);
      const simVal = getSimParamValue(m.key, sliders, simulation);
      const norm = (v: number) =>
        Math.max(0, Math.min(100, ((v - m.minScale) / (m.maxScale - m.minScale)) * 100));
      return {
        ...m,
        min,
        q1,
        med,
        q3,
        max,
        simVal,
        vals,
        norm,
      };
    });

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            5-Number Quartile Summary (Min, Q1, Median, Q3, Max) across n = {activeRuns.length} active samples.
          </span>
          <span className="font-mono text-[11px] text-[#EF4444] font-semibold">
            ◆ Red Marker = Active Simulator State
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
                  isDark ? 'bg-[#09090B]/70 border-[#27272A]' : 'bg-zinc-50/70 border-[#E4E4E7]'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-sans font-semibold">{s.label}</span>
                  <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                    Med: <strong className="text-zinc-900 dark:text-zinc-100">{s.format(s.med)} {s.unit}</strong> · IQR: {s.format(s.q1)}–{s.format(s.q3)}
                  </span>
                </div>

                <div className="relative h-7 flex items-center">
                  {/* Track */}
                  <div className="w-full h-[1px]" style={{ backgroundColor: gridStroke }} />
                  {/* Whisker Min to Max */}
                  <div
                    className="absolute h-[2px] bg-zinc-400 dark:bg-zinc-500"
                    style={{ left: `${pMin}%`, width: `${Math.max(0.5, pMax - pMin)}%` }}
                  />
                  {/* Min & Max caps */}
                  <div
                    className="absolute w-[2px] h-3 bg-zinc-400 dark:bg-zinc-500"
                    style={{ left: `${pMin}%` }}
                  />
                  <div
                    className="absolute w-[2px] h-3 bg-zinc-400 dark:bg-zinc-500"
                    style={{ left: `${pMax}%` }}
                  />
                  {/* IQR Box Q1 to Q3 */}
                  <div
                    className={`absolute h-4 rounded-[2px] border ${
                      isDark
                        ? 'bg-zinc-700/70 border-zinc-300'
                        : 'bg-zinc-300/80 border-zinc-800'
                    }`}
                    style={{
                      left: `${pQ1}%`,
                      width: `${Math.max(1.5, pQ3 - pQ1)}%`,
                    }}
                  />
                  {/* Median line */}
                  <div
                    className="absolute w-[2.5px] h-5 bg-[#10B981]"
                    style={{ left: `${pMed}%` }}
                  />
                  {/* Active Simulator marker */}
                  <div
                    className="absolute w-2.5 h-2.5 rotate-45 bg-[#EF4444] border border-white dark:border-zinc-900 -translate-x-1/2"
                    style={{ left: `${pSim}%` }}
                    title={`Active Sim: ${s.format(s.simVal)} ${s.unit}`}
                  />
                </div>

                <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500 tabular-nums">
                  <span>Min {s.format(s.min)}</span>
                  <span>Sim {s.format(s.simVal)} {s.unit}</span>
                  <span>Max {s.format(s.max)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 9. SCATTER PLOT
  if (vizMode === 'scatter-plot') {
    const xMeta = PARAM_OPTIONS.find((p) => p.key === scatterX) ?? PARAM_OPTIONS[0];
    const yMeta = PARAM_OPTIONS.find((p) => p.key === scatterY) ?? PARAM_OPTIONS[5];

    const scatterPoints = activeRuns.map((r) => ({
      id: r.id,
      psiId: r.psiId,
      material: r.material,
      facility: r.facility,
      x: r[scatterX],
      y: r[scatterY],
      outcome: r.outcome,
    }));

    const simPoint = [
      {
        id: 'sim-active',
        psiId: 'ACTIVE SIMULATOR',
        material: 'Live Physics Engine',
        facility: `${sliders.g_eff.toFixed(3)}g`,
        x: getSimParamValue(scatterX, sliders, simulation),
        y: getSimParamValue(scatterY, sliders, simulation),
        outcome: simulation.hazardStatus,
      },
    ];

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <label htmlFor="scatter-x" className="font-sans font-medium text-zinc-500">
                X Axis:
              </label>
              <select
                id="scatter-x"
                value={scatterX}
                onChange={(e) => setScatterX(e.target.value as NumericParamKey)}
                className={`px-2 py-1 text-xs rounded-[4px] border focus:outline-none ${
                  isDark
                    ? 'bg-[#09090B] border-[#27272A] text-zinc-100'
                    : 'bg-zinc-50 border-[#E4E4E7] text-zinc-900'
                }`}
              >
                {PARAM_OPTIONS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label} ({p.unit})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="scatter-y" className="font-sans font-medium text-zinc-500">
                Y Axis:
              </label>
              <select
                id="scatter-y"
                value={scatterY}
                onChange={(e) => setScatterY(e.target.value as NumericParamKey)}
                className={`px-2 py-1 text-xs rounded-[4px] border focus:outline-none ${
                  isDark
                    ? 'bg-[#09090B] border-[#27272A] text-zinc-100'
                    : 'bg-zinc-50 border-[#E4E4E7] text-zinc-900'
                }`}
              >
                {PARAM_OPTIONS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label} ({p.unit})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <span className="font-sans text-[11px] text-zinc-500">
            Click any archive point to open Run Detail Inspector.
          </span>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 20, bottom: 16, left: 4 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                name={xMeta.label}
                unit={` ${xMeta.unit}`}
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={yMeta.label}
                unit={` ${yMeta.unit}`}
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <Tooltip content={renderCustomTooltip as never} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter
                name="PSI Archive Runs"
                data={scatterPoints}
                className="cursor-pointer"
                onClick={(item) => {
                  const row = (item as { payload?: { id?: string }; id?: string });
                  const runId = row?.payload?.id ?? row?.id;
                  if (runId) onInspectRun(runId);
                }}
              >
                {scatterPoints.map((pt) => (
                  <Cell
                    key={pt.id}
                    fill={outcomeColor(pt.outcome)}
                    fillOpacity={hoveredRunId && hoveredRunId !== pt.id ? 0.25 : 0.9}
                  />
                ))}
              </Scatter>
              <Scatter
                name="Active Simulator"
                data={simPoint}
                fill={isDark ? '#FAFAFA' : '#18181B'}
                shape="diamond"
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 10. 4-VARIABLE BUBBLE PLOT
  if (vizMode === 'bubble-plot') {
    const bubbleData = activeRuns.map((r) => ({
      id: r.id,
      psiId: r.psiId,
      material: r.material,
      facility: r.facility,
      x: r.O2_pct,
      y: r.Flow_ms,
      z: r.radiometerFlux_Wm2,
      spread: r.flameSpread_mms,
      outcome: r.outcome,
    }));
    const simBubble = [
      {
        id: 'sim-active',
        psiId: 'ACTIVE SIMULATOR',
        material: 'Live Boundary-Layer State',
        facility: `${sliders.g_eff.toFixed(3)}g`,
        x: sliders.O2_pct,
        y: sliders.Flow_ms,
        z: Math.round(simulation.peakTemp_K * 11.5),
        spread: simulation.flameSpread_mms,
        outcome: simulation.hazardStatus,
      },
    ];

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            X = O₂ %, Y = Airflow (m/s), Bubble Area = Radiometer IR Flux (W/m²), Color = Hazard Outcome.
          </span>
          <span className="font-mono text-[11px] font-semibold">
            Shaded Band: 0.05–0.20 m/s Replenishment Zone
          </span>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 20, bottom: 16, left: 4 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <ReferenceArea
                y1={0.05}
                y2={0.2}
                fill={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(24,24,27,0.04)'}
                stroke={axisStroke}
                strokeDasharray="4 4"
              />
              <XAxis
                type="number"
                dataKey="x"
                name="Oxygen %"
                domain={[14, 42]}
                unit="%"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Airflow Velocity"
                domain={[0, 0.36]}
                unit=" m/s"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <ZAxis type="number" dataKey="z" name="IR Flux (W/m²)" range={[70, 520]} />
              <Tooltip content={renderCustomTooltip as never} />
              <Scatter
                name="PSI Runs"
                data={bubbleData}
                className="cursor-pointer"
                onClick={(item) => {
                  const row = (item as { payload?: { id?: string }; id?: string });
                  const runId = row?.payload?.id ?? row?.id;
                  if (runId) onInspectRun(runId);
                }}
              >
                {bubbleData.map((b) => (
                  <Cell key={b.id} fill={outcomeColor(b.outcome)} fillOpacity={0.78} />
                ))}
              </Scatter>
              <Scatter
                name="Active Sim"
                data={simBubble}
                fill={isDark ? '#FAFAFA' : '#18181B'}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 11. PEARSON CORRELATION MATRIX
  if (vizMode === 'correlation-matrix') {
    const vars: Array<{ key: NumericParamKey; label: string }> = [
      { key: 'O2_pct', label: 'O₂ %' },
      { key: 'P_psi', label: 'Pressure' },
      { key: 'Flow_ms', label: 'Airflow' },
      { key: 'Thickness_mm', label: 'Thickness' },
      { key: 'peakTemp_K', label: 'Peak Temp' },
      { key: 'flameSpread_mms', label: 'Spread' },
    ];

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            Pairwise Pearson r across n = {activeRuns.length} active runs (+1.00 = positive coupling, -1.00 = inverse quenching).
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
          <table
            className={`w-full border-collapse border text-xs ${
              isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
            }`}
          >
            <thead>
              <tr className={isDark ? 'bg-[#09090B]' : 'bg-zinc-50'}>
                <th className="p-2 text-left font-sans font-semibold border-b border-r border-inherit">
                  Parameter
                </th>
                {vars.map((v) => (
                  <th
                    key={v.key}
                    className="p-2 text-center font-sans font-semibold border-b border-inherit"
                  >
                    {v.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vars.map((rowVar) => (
                <tr key={rowVar.key} className="border-b border-inherit">
                  <td
                    className={`p-2 font-sans font-semibold border-r border-inherit ${
                      isDark ? 'bg-[#09090B]' : 'bg-zinc-50'
                    }`}
                  >
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

  // 12. RUN × PARAMETER NORMALIZED HEATMAP MATRIX
  if (vizMode === 'heatmap-matrix') {
    const cols: Array<{
      key: NumericParamKey;
      label: string;
      format: (v: number) => string;
    }> = [
      { key: 'O2_pct', label: 'O₂ %', format: (v) => `${v.toFixed(1)}%` },
      { key: 'P_psi', label: 'Pressure', format: (v) => `${v.toFixed(1)} psi` },
      { key: 'Flow_ms', label: 'Airflow', format: (v) => `${v.toFixed(2)} m/s` },
      { key: 'Thickness_mm', label: 'Thick', format: (v) => `${v.toFixed(1)} mm` },
      { key: 'peakTemp_K', label: 'Temp K', format: (v) => `${Math.round(v)} K` },
      { key: 'flameSpread_mms', label: 'Spread', format: (v) => `${v.toFixed(2)} mm/s` },
    ];

    const colBounds = cols.reduce(
      (acc, col) => {
        const vals = [
          getSimParamValue(col.key, sliders, simulation),
          ...activeRuns.map((r) => r[col.key]),
        ];
        acc[col.key] = { min: Math.min(...vals), max: Math.max(...vals) };
        return acc;
      },
      {} as Record<NumericParamKey, { min: number; max: number }>
    );

    const rows = [
      {
        id: 'sim-active',
        psiId: 'ACTIVE SIM',
        isSim: true,
        vals: {
          O2_pct: sliders.O2_pct,
          P_psi: sliders.P_psi,
          Flow_ms: sliders.Flow_ms,
          Thickness_mm: sliders.Thickness_mm,
          peakTemp_K: simulation.peakTemp_K,
          flameSpread_mms: simulation.flameSpread_mms,
        } as Record<NumericParamKey, number>,
      },
      ...activeRuns.slice(0, 14).map((r) => ({
        id: r.id,
        psiId: r.psiId,
        isSim: false,
        vals: r as unknown as Record<NumericParamKey, number>,
      })),
    ];

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            Min-max normalized cell intensity across active runs + live simulator state. Click any run row to inspect.
          </span>
        </div>
        <div
          className={`border rounded-[5px] overflow-x-auto ${
            isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
          }`}
        >
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr
                className={`border-b font-sans text-[11px] font-semibold text-zinc-500 ${
                  isDark ? 'bg-[#09090B] border-[#27272A]' : 'bg-zinc-50 border-[#E4E4E7]'
                }`}
              >
                <th className="py-2 px-3 text-left">Run / State</th>
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
                  <td className="py-2 px-3 font-mono font-semibold whitespace-nowrap">
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

  // 13. MULTI-SERIES LINE CHART
  if (vizMode === 'multi-series-line') {
    const compareRuns = activeRuns.slice(0, 4);
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
      const row: Record<string, number> = {
        time_s: pt.time_s,
        simTemp: pt.temp_K,
      };
      runSeriesMap.forEach((entry, rIdx) => {
        row[`run_${rIdx}`] = entry.series[idx]?.temp_K ?? 298;
      });
      return row;
    });

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            0–120s thermal evolution comparing active simulation (dashed) against selected PSI runs.
          </span>
          <span className="font-mono text-[11px] text-[#F59E0B]">
            Shaded Band: 550K–800K Cool-Flame NTC Window
          </span>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top: 12, right: 20, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <ReferenceArea y1={550} y2={800} fill="rgba(245, 158, 11, 0.1)" />
              <XAxis
                dataKey="time_s"
                unit="s"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                domain={[250, 1850]}
                unit="K"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <Tooltip content={renderCustomTooltip as never} />
              <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }} />
              <Line
                type="monotone"
                dataKey="simTemp"
                name="ACTIVE SIM (K)"
                stroke={isDark ? '#FAFAFA' : '#18181B'}
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={false}
              />
              {runSeriesMap.map((entry, idx) => (
                <Line
                  key={entry.run.id}
                  type="monotone"
                  dataKey={`run_${idx}`}
                  name={entry.run.psiId}
                  stroke={RUN_COLORS[idx % RUN_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 14. AREA CHART
  if (vizMode === 'area-chart') {
    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            0–120s Radiometer IR Flux (W/m²) and Carbon Monoxide Yield (ppm) accumulation profiles.
          </span>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={simulation.timelineSeries}
              margin={{ top: 12, right: 20, left: 4, bottom: 8 }}
            >
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <XAxis
                dataKey="time_s"
                unit="s"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                yAxisId="ir"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                yAxisId="co"
                orientation="right"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <Tooltip content={renderCustomTooltip as never} />
              <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
              <Area
                yAxisId="ir"
                type="monotone"
                dataKey="irFlux_Wm2"
                name="IR Radiometer Flux (W/m²)"
                stroke="#F59E0B"
                fill="#F59E0B"
                fillOpacity={0.22}
                strokeWidth={2}
              />
              <Area
                yAxisId="co"
                type="monotone"
                dataKey="coYield_ppm"
                name="CO Concentration (ppm)"
                stroke="#EF4444"
                fill="#EF4444"
                fillOpacity={0.18}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 15. STACKED AREA CHART
  if (vizMode === 'stacked-area') {
    const stackedData = simulation.timelineSeries.map((pt) => ({
      time_s: pt.time_s,
      thermalNorm: Math.round(((pt.temp_K - 298) / 1552) * 100),
      irNorm: Math.round((pt.irFlux_Wm2 / 22000) * 100),
      coNorm: Math.round((pt.coYield_ppm / 700) * 100),
    }));

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            Stacked normalized sensor load (% of peak full-scale capacity) over 0–120s burn duration.
          </span>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stackedData} margin={{ top: 12, right: 20, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <XAxis
                dataKey="time_s"
                unit="s"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                unit="%"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <Tooltip content={renderCustomTooltip as never} />
              <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
              <Area
                type="monotone"
                dataKey="thermalNorm"
                stackId="1"
                name="Gas Thermal Load (%)"
                stroke="#EF4444"
                fill="#EF4444"
                fillOpacity={0.45}
              />
              <Area
                type="monotone"
                dataKey="irNorm"
                stackId="1"
                name="Radiative IR Load (%)"
                stroke="#F59E0B"
                fill="#F59E0B"
                fillOpacity={0.4}
              />
              <Area
                type="monotone"
                dataKey="coNorm"
                stackId="1"
                name="CO Emission Load (%)"
                stroke="#10B981"
                fill="#10B981"
                fillOpacity={0.35}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 16. STEP CHART
  if (vizMode === 'step-chart') {
    const stepData = simulation.timelineSeries.map((pt) => {
      let stateLevel = 0;
      let phaseLabel = 'Quenched / Baseline';
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
      return {
        time_s: pt.time_s,
        temp_K: pt.temp_K,
        stateLevel,
        phaseLabel,
      };
    });

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            Discrete combustion regime transitions (step-after) paired with stepped gas temperature (K).
          </span>
          <span className="font-mono text-[11px] text-zinc-500">
            Levels: 0=Quench · 1=Ignition · 2=Cool-Flame NTC · 3=Hot Flame
          </span>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stepData} margin={{ top: 12, right: 20, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <XAxis
                dataKey="time_s"
                unit="s"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                yAxisId="temp"
                domain={[250, 1850]}
                unit="K"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                yAxisId="state"
                orientation="right"
                domain={[0, 3.5]}
                ticks={[0, 1, 2, 3]}
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <Tooltip content={renderCustomTooltip as never} />
              <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
              <Line
                yAxisId="temp"
                type="stepAfter"
                dataKey="temp_K"
                name="Gas Temp (K)"
                stroke="#EF4444"
                strokeWidth={2.25}
                dot={false}
              />
              <Line
                yAxisId="state"
                type="stepAfter"
                dataKey="stateLevel"
                name="Regime State (0–3)"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={{ r: 2.5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 17. 10S TIMELINE PROGRESSION PLOT
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
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            0–10 second unmitigated flame front growth (mm) and enclosed cabin pressure rise (kPa).
          </span>
          <span className="font-mono text-[11px] font-semibold">
            t+10s Target: {endRadius.toFixed(1)} mm · +{endPress.toFixed(2)} kPa
          </span>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={steps10s} margin={{ top: 12, right: 20, left: 0, bottom: 8 }}>
              <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
              <XAxis
                dataKey="second"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                yAxisId="rad"
                unit=" mm"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <YAxis
                yAxisId="press"
                orientation="right"
                unit=" kPa"
                stroke={axisStroke}
                tick={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <Tooltip content={renderCustomTooltip as never} />
              <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Inter, sans-serif' }} />
              <Bar
                yAxisId="rad"
                dataKey="radius_mm"
                name="Flame Radius (mm)"
                fill={isDark ? '#D4D4D8' : '#27272A'}
                radius={[3, 3, 0, 0]}
                maxBarSize={36}
              />
              <Line
                yAxisId="press"
                type="monotone"
                dataKey="pressureRise_kPa"
                name="Cabin Pressure Rise (kPa)"
                stroke="#F59E0B"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#F59E0B' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // 18. CONTOUR / SURFACE HEATMAP (Pressure vs Thickness Quenching Grid)
  if (vizMode === 'contour-surface') {
    const cols = 24;
    const rows = 14;
    const cells: Array<{
      c: number;
      r: number;
      p: number;
      thick: number;
      spread: number;
      status: string;
      fill: string;
    }> = [];

    for (let r = 0; r < rows; r++) {
      const thick = Number((0.4 + (1 - r / (rows - 1)) * 7.6).toFixed(1));
      for (let c = 0; c < cols; c++) {
        const p = Number((4.3 + (c / (cols - 1)) * (14.7 - 4.3)).toFixed(1));
        const res = computeFlameSpreadVelocity({
          O2_pct: sliders.O2_pct,
          P_psi: p,
          Flow_ms: sliders.Flow_ms,
          g_eff: sliders.g_eff,
          Thickness_mm: thick,
        });
        let fill = `rgba(16, 185, 129, ${isDark ? 0.28 : 0.24})`;
        if (res.hazardStatus === 'Rapid Flame Spread') {
          const alpha = Math.min(0.82, 0.25 + (res.flameSpread_mms / 6.0) * 0.52);
          fill = `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
        } else if (res.hazardStatus === 'Cool Flame Caution') {
          fill = `rgba(245, 158, 11, ${isDark ? 0.42 : 0.34})`;
        }
        cells.push({
          c,
          r,
          p,
          thick,
          spread: res.flameSpread_mms,
          status: res.hazardStatus,
          fill,
        });
      }
    }

    const simX = 68 + Math.max(0, Math.min(1, (sliders.P_psi - 4.3) / (14.7 - 4.3))) * 822;
    const simY = 12 + Math.max(0, Math.min(1, 1 - (sliders.Thickness_mm - 0.4) / 7.6)) * 258;

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-sans text-zinc-500 dark:text-zinc-400">
            Click any coordinate cell to update Cabin Pressure (psi) & Thickness (mm) sliders.
          </span>
          {contourHover ? (
            <span className="font-mono text-[11px] font-semibold tabular-nums">
              P: {contourHover.p.toFixed(1)} psi · δ: {contourHover.thick.toFixed(1)} mm · Spread:{' '}
              {contourHover.spread.toFixed(2)} mm/s ({contourHover.status})
            </span>
          ) : (
            <span className="font-mono text-[11px] text-zinc-500">
              Min Safe Thickness at {sliders.O2_pct.toFixed(1)}% O₂: ≥{' '}
              {simulation.safeMaterialCheck.minSafeThickness_mm.toFixed(1)} mm
            </span>
          )}
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox="0 0 920 315"
            className="w-full h-auto min-w-[680px] select-none cursor-crosshair"
            role="img"
            aria-label="Pressure vs Thickness Conductive Quenching Contour Surface"
          >
            {cells.map((cell) => {
              const cellW = 822 / cols;
              const cellH = 258 / rows;
              return (
                <rect
                  key={`${cell.c}-${cell.r}`}
                  x={68 + cell.c * cellW}
                  y={12 + cell.r * cellH}
                  width={cellW - 1}
                  height={cellH - 1}
                  fill={cell.fill}
                  className="hover:opacity-80"
                  onMouseEnter={() =>
                    setContourHover({
                      p: cell.p,
                      thick: cell.thick,
                      spread: cell.spread,
                      status: cell.status,
                    })
                  }
                  onClick={() => {
                    onChangeSlider('P_psi', cell.p);
                    onChangeSlider('Thickness_mm', cell.thick);
                  }}
                />
              );
            })}

            {activeRuns.slice(0, 10).map((run) => {
              const cx = 68 + Math.max(0, Math.min(1, (run.P_psi - 4.3) / (14.7 - 4.3))) * 822;
              const cy = 12 + Math.max(0, Math.min(1, 1 - (run.Thickness_mm - 0.4) / 7.6)) * 258;
              return (
                <g
                  key={run.id}
                  onClick={() => onInspectRun(run.id)}
                  className="cursor-pointer"
                >
                  <rect
                    x={cx - 4}
                    y={cy - 4}
                    width={8}
                    height={8}
                    fill={isDark ? '#18181B' : '#FFFFFF'}
                    stroke={isDark ? '#FAFAFA' : '#18181B'}
                    strokeWidth={1.75}
                  />
                  <text
                    x={cx + 7}
                    y={cy + 3}
                    fill={textPrimary}
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="600"
                  >
                    {run.psiId.split(' ')[0]}
                  </text>
                </g>
              );
            })}

            {/* Active Simulator Crosshair */}
            <g pointerEvents="none">
              <line x1={simX} y1={12} x2={simX} y2={270} stroke={textPrimary} strokeDasharray="3 3" />
              <line x1={68} y1={simY} x2={890} y2={simY} stroke={textPrimary} strokeDasharray="3 3" />
              <circle
                cx={simX}
                cy={simY}
                r={5.5}
                fill={textPrimary}
                stroke={monoBg}
                strokeWidth={2}
              />
            </g>

            {/* Axes */}
            <line x1={68} y1={270} x2={890} y2={270} stroke={axisStroke} />
            <line x1={68} y1={12} x2={68} y2={270} stroke={axisStroke} />
            {[4.3, 6.5, 8.2, 10.2, 12.5, 14.7].map((pTick) => {
              const x = 68 + ((pTick - 4.3) / (14.7 - 4.3)) * 822;
              return (
                <text
                  key={pTick}
                  x={x}
                  y={288}
                  textAnchor="middle"
                  fill={axisStroke}
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {pTick.toFixed(1)}
                </text>
              );
            })}
            {[0.4, 2.0, 4.0, 6.0, 8.0].map((tTick) => {
              const y = 12 + (1 - (tTick - 0.4) / 7.6) * 258;
              return (
                <text
                  key={tTick}
                  x={60}
                  y={y + 3}
                  textAnchor="end"
                  fill={axisStroke}
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {tTick.toFixed(1)}
                </text>
              );
            })}
            <text
              x={479}
              y={308}
              textAnchor="middle"
              fill={axisStroke}
              fontSize="11"
              fontFamily="Inter, sans-serif"
              fontWeight="600"
            >
              Cabin Pressure (psi)
            </text>
            <text
              x={16}
              y={141}
              textAnchor="middle"
              fill={axisStroke}
              fontSize="11"
              fontFamily="Inter, sans-serif"
              fontWeight="600"
              transform="rotate(-90 16 141)"
            >
              Thickness (mm)
            </text>
          </svg>
        </div>
      </div>
    );
  }

  // 19. POLAR / RADIAL MULTI-PARAMETER PROFILE (with explicit caveats)
  if (vizMode === 'polar-radial') {
    const compareRuns = activeRuns.slice(0, 2);
    const axes = [
      { metric: 'O₂ %', sim: (sliders.O2_pct / 50) * 100, fn: (r: PsiRun) => (r.O2_pct / 50) * 100 },
      { metric: 'Pressure', sim: (sliders.P_psi / 15) * 100, fn: (r: PsiRun) => (r.P_psi / 15) * 100 },
      { metric: 'Airflow', sim: (sliders.Flow_ms / 0.4) * 100, fn: (r: PsiRun) => (r.Flow_ms / 0.4) * 100 },
      { metric: 'Thickness', sim: (sliders.Thickness_mm / 8) * 100, fn: (r: PsiRun) => (r.Thickness_mm / 8) * 100 },
      { metric: 'Peak Temp', sim: (simulation.peakTemp_K / 1800) * 100, fn: (r: PsiRun) => (r.peakTemp_K / 1800) * 100 },
      {
        metric: 'Spread',
        sim: (simulation.flameSpread_mms / 4.0) * 100,
        fn: (r: PsiRun) => (r.flameSpread_mms / 4.0) * 100,
      },
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
        <div
          className={`p-2.5 rounded-[4px] border flex items-start gap-2 text-xs ${
            isDark
              ? 'bg-[#F59E0B]/10 border-[#F59E0B]/30 text-zinc-200'
              : 'bg-[#F59E0B]/10 border-[#F59E0B]/40 text-zinc-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
          <span>
            {caveatNote ||
              'Analytical Caveat: Radial polygon area scales quadratically with radius and depends on axis ordering. Use Parallel Coordinates or Bullet Bars for strict linear comparison.'}
          </span>
        </div>

        <div className="h-[290px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="76%">
              <PolarGrid stroke={gridStroke} />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fontSize: 11, fontFamily: 'Inter, sans-serif', fill: textPrimary }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                tick={{ fontSize: 9.5, fontFamily: 'JetBrains Mono, monospace', fill: axisStroke }}
              />
              <Tooltip content={renderCustomTooltip as never} />
              <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono, monospace' }} />
              <Radar
                name="ACTIVE SIM (%)"
                dataKey="ActiveSim"
                stroke="#EF4444"
                fill="#EF4444"
                fillOpacity={0.22}
                strokeWidth={2}
              />
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
