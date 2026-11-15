import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  X,
  Sliders,
  Plus,
  Columns3,
  Layers,
  ArrowUpRight,
  LineChart as LineChartIcon,
} from 'lucide-react';
import { exportComparisonFormatted } from '../utils/exportGenerators';
import { ExportDropdown } from './ExportDropdown';
import {
  formatAirflow,
  formatFlameSpread,
  formatPressure,
  formatTemperature,
} from '../utils/themePreferences';
import {
  ComparatorInsightSummary,
  generateComparatorInsights,
} from '../services/psiApi';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  DefaultExportFormat,
  MeasurementUnits,
  PsiRun,
  ThemeMode,
  VizMode,
} from '../types/psi';
import { generateTimelineSeries } from '../utils/physicsEngine';
import { CollapsibleCard } from './CollapsibleCard';
import { InteractiveChartViewport } from './InteractiveChartViewport';
import { ParallelCoordinatesPlot } from './ParallelCoordinatesPlot';
import { formatUniqueRunLegendMap } from '../utils/chartViewportMath';

interface RunComparatorProps {
  theme: ThemeMode;
  measurementUnits?: MeasurementUnits;
  defaultExportFormat?: DefaultExportFormat;
  selectedRuns: PsiRun[];
  hoveredRunId: string | null;
  onHoverRun: (runId: string | null) => void;
  onInspectRun: (runId: string) => void;
  onRemoveRun: (runId: string) => void;
  onApplyRunToSliders: (run: PsiRun) => void;
  onLoadDefaultComparisonSet: () => void;
  onAddActiveVirtualRun?: () => void;
  onGoToCatalog?: () => void;
  onOpenWorkbenchTechnique?: (mode: VizMode) => void;
}

type ComparatorChartMode =
  | 'parallel'
  | 'trajectory'
  | 'grouped-bar'
  | 'lollipop'
  | 'heatmap';

const RUN_COLORS = ['#10B981', '#F59E0B', '#64748B', '#EF4444'];

export const RunComparator: React.FC<RunComparatorProps> = ({
  theme,
  measurementUnits = 'spacecraft',
  defaultExportFormat,
  selectedRuns,
  hoveredRunId,
  onHoverRun,
  onInspectRun,
  onRemoveRun,
  onApplyRunToSliders,
  onLoadDefaultComparisonSet,
  onAddActiveVirtualRun,
  onGoToCatalog,
  onOpenWorkbenchTechnique,
}) => {
  const [showExtendedCols, setShowExtendedCols] = useState(false);
  const [chartMode, setChartMode] = useState<ComparatorChartMode>('parallel');
  const [insightSummary, setInsightSummary] =
    useState<ComparatorInsightSummary | null>(null);

  useEffect(() => {
    let active = true;
    generateComparatorInsights(selectedRuns).then((res) => {
      if (active) setInsightSummary(res);
    });
    return () => {
      active = false;
    };
  }, [selectedRuns]);

  const isDark = theme === 'dark';

  const baselineRun = selectedRuns[0] ?? null;

  const trajectoryRows = useMemo(() => {
    if (selectedRuns.length < 2) return [];
    const perRunSeries = selectedRuns.map((r) =>
      generateTimelineSeries({
        O2_pct: r.O2_pct,
        P_psi: r.P_psi,
        Flow_ms: r.Flow_ms,
        g_eff: r.g_eff,
        Thickness_mm: r.Thickness_mm,
        peakTemp_K: r.peakTemp_K,
        hazardStatus: r.outcome,
      })
    );
    return perRunSeries[0].map((pt, idx) => {
      const row: Record<string, number> = { time_s: pt.time_s };
      selectedRuns.forEach((run, runIdx) => {
        row[run.id] = perRunSeries[runIdx][idx]?.temp_K ?? 298;
      });
      return row;
    });
  }, [selectedRuns]);

  const uniqueLegendMap = useMemo(
    () => formatUniqueRunLegendMap(selectedRuns),
    [selectedRuns]
  );

  const comparatorResetKey = useMemo(
    () => `${chartMode}|${selectedRuns.map((r) => r.id).join(',')}`,
    [chartMode, selectedRuns]
  );

  const formatDeltaPct = (val: number, baseVal: number, idx: number) => {
    if (idx === 0 || baseVal === 0) return null;
    const pct = ((val - baseVal) / Math.abs(baseVal)) * 100;
    if (Math.abs(pct) < 0.5) return '0%';
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(0)}%`;
  };

  const outcomeStyle = (outcome: PsiRun['outcome']) => {
    if (outcome === 'Rapid Flame Spread') return 'text-[#EF4444]';
    if (outcome === 'Cool Flame Caution') return 'text-[#F59E0B]';
    return 'text-[#10B981]';
  };

  const axisTextFill = isDark ? '#A1A1AA' : '#52525B';
  const gridStroke = isDark ? 'rgba(255,255,255,0.08)' : '#E4E4E7';

  return (
    <div className="space-y-5">
      {/* Page Title */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-lg sm:text-xl font-semibold tracking-[-0.02em]">
            Run Comparator
          </h1>
          <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Compare up to 4 historical or virtual test runs side-by-side and inspect thermal trajectories together
          </p>
        </div>
        {onAddActiveVirtualRun && (
          <button
            type="button"
            onClick={onAddActiveVirtualRun}
            className={`inline-flex items-center gap-1.5 h-10 px-4 text-xs font-sans font-semibold rounded-lg border shadow-xs hover:shadow-sm active:scale-[0.98] transition-all duration-150 focus-visible:outline-none cursor-pointer ${
              isDark
                ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA] hover:bg-zinc-200'
                : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B] hover:bg-zinc-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Active Virtual Run</span>
          </button>
        )}
      </div>

      {/* Model Comparison Summary */}
      {selectedRuns.length > 0 && insightSummary && (
        <div
          className={`p-5 rounded-lg border space-y-2 transition-colors duration-150 ${
            isDark
              ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
              : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-display font-semibold tracking-[-0.01em]">
              {insightSummary.headline}
            </span>
            <span className="text-[11px] font-sans text-zinc-500">
              {insightSummary.endpointLabel}
              {insightSummary.matchedCorrectionsCount > 0
                ? ` · ${insightSummary.matchedCorrectionsCount} saved correction(s) matched`
                : ''}
            </span>
          </div>
          {insightSummary.highlights.length > 0 && (
            <ul className="space-y-1 text-xs font-sans text-zinc-600 dark:text-zinc-300">
              {insightSummary.highlights.map((line, i) => (
                <li key={i}>• {line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 1. Side-by-Side Comparison Matrix */}
      <CollapsibleCard
        theme={theme}
        title="Side-by-Side Run Comparison Table"
        subtitle={`${selectedRuns.length}/4 Runs Selected · Differences vs. ${baselineRun?.psiId ?? 'Baseline'}`}
        summaryLine={`${selectedRuns.length}/4 selected runs · Baseline ${baselineRun?.psiId ?? 'None'}`}
        rightActions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportDropdown
              theme={theme}
              label="Export Comparison"
              formats={['csv', 'doc', 'pdf', 'json']}
              defaultFormat={defaultExportFormat}
              disabled={selectedRuns.length === 0}
              title="Download selected comparison matrix as CSV, Word, PDF, or JSON"
              onSelectFormat={(fmt) =>
                exportComparisonFormatted({
                  selectedRuns,
                  units: measurementUnits,
                  format: fmt,
                })
              }
            />

            <button
              type="button"
              onClick={() => setShowExtendedCols((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-sans font-medium rounded-lg border shadow-2xs active:scale-[0.98] transition-all duration-150 focus-visible:outline-none cursor-pointer ${
                showExtendedCols
                  ? isDark
                    ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA] font-semibold'
                    : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B] font-semibold'
                  : isDark
                  ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600'
                  : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>
                {showExtendedCols
                  ? 'Hide Extra Measurements'
                  : 'Show Extra Measurements (+3 cols)'}
              </span>
            </button>

            {onGoToCatalog && (
              <button
                type="button"
                onClick={onGoToCatalog}
                className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-sans font-medium rounded-lg border shadow-2xs active:scale-[0.98] transition-all duration-150 focus-visible:outline-none cursor-pointer ${
                  isDark
                    ? 'border-[#27272A] text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600'
                    : 'border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add / Change Runs</span>
              </button>
            )}
          </div>
        }
      >

        {/* Actionable Empty State if < 2 runs checked */}
        {selectedRuns.length < 2 ? (
          <div className="py-10 px-4 text-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-[5px] space-y-3">
            <div className="text-xs font-sans text-zinc-600 dark:text-zinc-300">
              Select at least 2 PSI runs to calculate relative percentage deltas
              and multi-axis overlays ({selectedRuns.length}/4 currently
              checked).
            </div>
            <div className="flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={onLoadDefaultComparisonSet}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-sans font-semibold rounded-lg shadow-xs hover:shadow-sm active:scale-[0.98] transition-all cursor-pointer ${
                  isDark
                    ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200'
                    : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Load Default Comparison Set</span>
              </button>
              {onGoToCatalog && (
                <button
                  type="button"
                  onClick={onGoToCatalog}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-sans font-medium rounded-lg border shadow-xs active:scale-[0.98] transition-all cursor-pointer ${
                    isDark
                      ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800'
                      : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  <span>Browse Experiment Runs</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            className={`border rounded-[5px] overflow-x-auto ${
              isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
            }`}
          >
            <table className="w-full text-left border-collapse text-[11px] sm:text-xs">
              <thead>
                <tr
                  className={`border-b font-sans text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 ${
                    isDark
                      ? 'bg-[#09090B] border-[#27272A]'
                      : 'bg-zinc-50 border-[#E4E4E7]'
                  }`}
                >
                  <th className="py-2 px-1.5">PSI ID</th>
                  <th className="py-2 px-1.5">Material</th>
                  <th className="py-2 px-1.5">Facility</th>
                  <th className="py-2 px-1.5">O₂</th>
                  <th className="py-2 px-1.5">Pressure</th>
                  <th className="py-2 px-1.5">Airflow</th>
                  {showExtendedCols && (
                    <>
                      <th className="py-2 px-1.5">Gravity</th>
                      <th className="py-2 px-1.5">Thick.</th>
                      <th className="py-2 px-1.5">Temp</th>
                    </>
                  )}
                  <th className="py-2 px-1.5">Spread</th>
                  <th className="py-2 px-1.5">Outcome</th>
                  <th className="py-2 pr-2 pl-1 text-right">Actions</th>
                </tr>
              </thead>
              <tbody
                className={`divide-y ${
                  isDark ? 'divide-[#27272A]' : 'divide-[#E4E4E7]'
                }`}
              >
                {selectedRuns.map((run, idx) => {
                  const o2Delta = baselineRun
                    ? formatDeltaPct(run.O2_pct, baselineRun.O2_pct, idx)
                    : null;
                  const pDelta = baselineRun
                    ? formatDeltaPct(run.P_psi, baselineRun.P_psi, idx)
                    : null;
                  const flowDelta = baselineRun
                    ? formatDeltaPct(run.Flow_ms, baselineRun.Flow_ms, idx)
                    : null;
                  const gDelta =
                    idx > 0 && baselineRun
                      ? baselineRun.g_eff === 0
                        ? run.g_eff > 0
                          ? `+${run.g_eff.toFixed(2)}g`
                          : null
                        : formatDeltaPct(run.g_eff, baselineRun.g_eff, idx)
                      : null;
                  const thickDelta = baselineRun
                    ? formatDeltaPct(
                        run.Thickness_mm,
                        baselineRun.Thickness_mm,
                        idx
                      )
                    : null;
                  const tempDelta = baselineRun
                    ? formatDeltaPct(run.peakTemp_K, baselineRun.peakTemp_K, idx)
                    : null;
                  const spreadDelta = baselineRun
                    ? formatDeltaPct(
                        run.flameSpread_mms,
                        baselineRun.flameSpread_mms,
                        idx
                      )
                    : null;
                  const isDimmed =
                    hoveredRunId !== null && hoveredRunId !== run.id;

                  return (
                    <tr
                      key={run.id}
                      onMouseEnter={() => onHoverRun(run.id)}
                      onMouseLeave={() => onHoverRun(null)}
                      className={`transition-opacity duration-200 ${
                        isDimmed ? 'opacity-30' : 'opacity-100'
                      } ${
                        isDark
                          ? 'hover:bg-white/[0.02]'
                          : 'hover:bg-zinc-50/80'
                      }`}
                    >
                      <td className="py-2 px-1.5 font-mono font-semibold whitespace-nowrap">
                        <div className="flex items-start gap-1.5">
                          <span
                            className="w-2 h-2 rounded-[2px] shrink-0 mt-1"
                            style={{
                              backgroundColor:
                                RUN_COLORS[idx % RUN_COLORS.length],
                            }}
                          />
                          <div>
                            <button
                              type="button"
                              onClick={() => onInspectRun(run.id)}
                              className="hover:underline cursor-pointer text-left leading-tight"
                            >
                              {run.psiId}
                            </button>
                            {(idx === 0 || run.isVirtual) && (
                              <div className="font-sans text-[10px] font-normal leading-tight text-zinc-400">
                                {idx === 0 ? 'Baseline' : ''}
                                {idx === 0 && run.isVirtual ? ' · ' : ''}
                                {run.isVirtual ? (
                                  <span className="text-[#10B981]">Virtual</span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-1.5 font-sans text-zinc-700 dark:text-zinc-200 max-w-[115px] truncate" title={run.material}>
                        {run.material}
                      </td>
                      <td className="py-2 px-1.5 font-sans text-zinc-500 max-w-[82px] truncate" title={run.facility}>
                        {run.facility}
                      </td>
                      <td className="py-2 px-1.5 font-mono tabular-nums whitespace-nowrap">
                        <span>{run.O2_pct.toFixed(1)}%</span>
                        {o2Delta && (
                          <span className="ml-1 text-[10px] text-zinc-400">
                            ({o2Delta})
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-1.5 font-mono tabular-nums whitespace-nowrap">
                        <span>{formatPressure(run.P_psi, measurementUnits)}</span>
                        {pDelta && (
                          <span className="ml-1 text-[10px] text-zinc-400">
                            ({pDelta})
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-1.5 font-mono tabular-nums whitespace-nowrap">
                        <span>{formatAirflow(run.Flow_ms, measurementUnits)}</span>
                        {flowDelta && (
                          <span className="ml-1 text-[10px] text-zinc-400">
                            ({flowDelta})
                          </span>
                        )}
                      </td>
                      {showExtendedCols && (
                        <>
                          <td className="py-2 px-1.5 font-mono tabular-nums whitespace-nowrap">
                            <span>{run.g_eff.toFixed(3)}g</span>
                            {gDelta && (
                              <span className="ml-1 text-[10px] text-zinc-400">
                                ({gDelta})
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-1.5 font-mono tabular-nums whitespace-nowrap">
                            <span>{run.Thickness_mm.toFixed(1)} mm</span>
                            {thickDelta && (
                              <span className="ml-1 text-[10px] text-zinc-400">
                                ({thickDelta})
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-1.5 font-mono tabular-nums whitespace-nowrap">
                            <span>{formatTemperature(run.peakTemp_K, measurementUnits)}</span>
                            {tempDelta && (
                              <span className="ml-1 text-[10px] text-zinc-400">
                                ({tempDelta})
                              </span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="py-2 px-1.5 font-mono tabular-nums whitespace-nowrap font-bold">
                        <span>{formatFlameSpread(run.flameSpread_mms, measurementUnits)}</span>
                        {spreadDelta && (
                          <span
                            className={`ml-1 text-[10px] ${
                              spreadDelta.startsWith('+')
                                ? 'text-[#EF4444]'
                                : 'text-[#10B981]'
                            }`}
                          >
                            ({spreadDelta})
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-2 px-1.5 font-sans font-semibold whitespace-nowrap ${outcomeStyle(
                          run.outcome
                        )}`}
                      >
                        ● {run.outcome}
                      </td>
                      <td className="py-2 pr-2 pl-1 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onApplyRunToSliders(run)}
                            className={`h-8 px-2.5 inline-flex items-center gap-1 text-xs font-sans font-medium rounded-lg border shadow-xs transition-all duration-150 active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                              isDark
                                ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600'
                                : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300'
                            }`}
                          >
                            <Sliders className="w-3 h-3" />
                            <span>Simulate</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveRun(run.id)}
                            aria-label={`Remove ${run.psiId} from comparison`}
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-[#EF4444] hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-all duration-150 active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleCard>

      {/* 2. Switchable Multi-Axis & Time-Series Comparison Chart */}
      {selectedRuns.length >= 2 && (
        <CollapsibleCard
          theme={theme}
          title="Multi-Axis & Time-Series Comparison"
          subtitle={
            chartMode === 'parallel'
              ? 'Parallel Coordinates'
              : chartMode === 'trajectory'
              ? '0–120s Burn Curve Overlay'
              : chartMode === 'grouped-bar'
              ? 'Grouped Bars'
              : chartMode === 'lollipop'
              ? 'Cleveland Lollipop'
              : 'Matrix Heatmap'
          }
          summaryLine={`Comparing ${selectedRuns.length} runs across ${chartMode === 'trajectory' ? '0–120s burn curves' : 'multiple test columns'}`}
          rightActions={
            onOpenWorkbenchTechnique ? (
              <button
                type="button"
                onClick={() =>
                  onOpenWorkbenchTechnique(
                    chartMode === 'parallel'
                      ? 'multi-variable'
                      : chartMode === 'trajectory'
                      ? 'multi-series-line'
                      : chartMode === 'grouped-bar'
                      ? 'grouped-bar'
                      : chartMode === 'lollipop'
                      ? 'lollipop-dot'
                      : 'heatmap-matrix'
                  )
                }
                className={`h-8 px-3 inline-flex items-center gap-1.5 text-xs font-sans font-medium rounded-lg border shadow-xs transition-all duration-150 active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                  isDark
                    ? 'border-[#27272A] text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600'
                    : 'border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300'
                }`}
              >
                <span>Open in Visual Analytics Studio</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
                Switch comparison techniques on the same {selectedRuns.length} selected runs, or hover any run series to highlight it.
              </p>

              <div
                className={`flex flex-wrap items-center gap-1 p-1 rounded-lg border ${
                  isDark
                    ? 'bg-[#09090B] border-[#27272A]'
                    : 'bg-zinc-100 border-[#E4E4E7]'
                }`}
                role="group"
                aria-label="Comparator Chart Technique Switcher"
              >
                {(
                  [
                    { id: 'parallel', label: 'Parallel Coordinates' },
                    { id: 'trajectory', label: '0–120s Burn Curve' },
                    { id: 'grouped-bar', label: 'Grouped Bars' },
                    { id: 'lollipop', label: 'Lollipop / Dot' },
                    { id: 'heatmap', label: 'Heatmap Matrix' },
                  ] as Array<{ id: ComparatorChartMode; label: string }>
                ).map((tab) => {
                  const active = chartMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setChartMode(tab.id)}
                      className={`h-8 px-3 text-[11px] font-sans rounded-md transition-all duration-150 focus-visible:outline-none cursor-pointer ${
                        active
                          ? isDark
                            ? 'bg-[#FAFAFA] text-[#09090B] font-semibold shadow-2xs'
                            : 'bg-[#18181B] text-[#FFFFFF] font-semibold shadow-2xs'
                          : isDark
                          ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60'
                          : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {chartMode !== 'parallel' && (
              <div className="flex flex-wrap items-center gap-4 font-sans text-xs pb-1">
                {selectedRuns.map((run, idx) => {
                  const isDimmed =
                    hoveredRunId !== null && hoveredRunId !== run.id;
                  const label = uniqueLegendMap.get(run.id) ?? run.psiId;
                  return (
                    <button
                      key={run.id}
                      type="button"
                      onMouseEnter={() => onHoverRun(run.id)}
                      onMouseLeave={() => onHoverRun(null)}
                      onClick={() => onInspectRun(run.id)}
                      className={`inline-flex items-center gap-1.5 transition-opacity duration-200 cursor-pointer hover:underline ${
                        isDimmed ? 'opacity-30' : 'opacity-100'
                      }`}
                    >
                      <span
                        className="w-3 h-1 rounded-[1px]"
                        style={{
                          backgroundColor: RUN_COLORS[idx % RUN_COLORS.length],
                        }}
                      />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {chartMode === 'trajectory' && (() => {
              const minT = trajectoryRows[0]?.time_s ?? 0;
              const maxT = trajectoryRows[trajectoryRows.length - 1]?.time_s ?? 120;
              const allTemps = trajectoryRows.flatMap((row) =>
                selectedRuns.map((r) => Number(row[r.id] ?? 298))
              );
              const minTemp = Math.max(
                200,
                Math.floor((allTemps.length > 0 ? Math.min(...allTemps) : 250) * 0.9)
              );
              const maxTemp = Math.ceil(
                Math.max(1200, ...(allTemps.length > 0 ? allTemps : [1850])) * 1.08
              );

              return (
                <InteractiveChartViewport
                  theme={theme}
                  baseXDomain={{ min: minT, max: Math.max(minT + 1, maxT) }}
                  baseYDomain={{ min: minTemp, max: maxTemp }}
                  resetKey={comparatorResetKey}
                  xTickCount={7}
                  yTickCount={6}
                  xUnit="s"
                  yUnit="K"
                  plotInsets={{ left: 0.08, right: 0.03, top: 0.06, bottom: 0.12 }}
                >
                  {(ctx) => (
                    <div className="h-[290px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={trajectoryRows}
                          margin={{ top: 12, right: 20, left: 4, bottom: 8 }}
                        >
                          <CartesianGrid
                            stroke={gridStroke}
                            strokeDasharray="3 3"
                            vertical={false}
                          />
                          <XAxis
                            type="number"
                            dataKey="time_s"
                            domain={[ctx.xDomain.min, ctx.xDomain.max]}
                            ticks={ctx.xTicks.ticks}
                            allowDataOverflow={true}
                            stroke={axisTextFill}
                            tickFormatter={(v) => `${v}s`}
                            tick={{
                              fontSize: 11,
                              fontFamily: 'JetBrains Mono, monospace',
                              fill: axisTextFill,
                            }}
                          />
                          <YAxis
                            domain={[ctx.yDomain.min, ctx.yDomain.max]}
                            ticks={ctx.yTicks.ticks}
                            allowDataOverflow={true}
                            stroke={axisTextFill}
                            unit=" K"
                            tick={{
                              fontSize: 11,
                              fontFamily: 'JetBrains Mono, monospace',
                              fill: axisTextFill,
                            }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: isDark
                                ? 'rgba(24,24,27,0.9)'
                                : 'rgba(255,255,255,0.92)',
                              backdropFilter: 'blur(8px)',
                              borderColor: isDark ? '#27272A' : '#E4E4E7',
                              borderRadius: '5px',
                              fontSize: '11px',
                              fontFamily: 'Inter, sans-serif',
                            }}
                          />
                          {selectedRuns.map((run, idx) => (
                            <Line
                              key={run.id}
                              type="monotone"
                              dataKey={run.id}
                              name={`${uniqueLegendMap.get(run.id) ?? run.psiId} (K)`}
                              stroke={RUN_COLORS[idx % RUN_COLORS.length]}
                              strokeWidth={hoveredRunId === run.id ? 3 : 2}
                              strokeOpacity={
                                hoveredRunId !== null && hoveredRunId !== run.id
                                  ? 0.25
                                  : 1
                              }
                              dot={false}
                              isAnimationActive={false}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </InteractiveChartViewport>
              );
            })()}

            {chartMode === 'parallel' && (
              <ParallelCoordinatesPlot
                theme={theme}
                runs={selectedRuns}
                showActiveVirtual={false}
                hoveredRunId={hoveredRunId}
                onHoverRun={onHoverRun}
                onInspectRun={onInspectRun}
                resetKey={comparatorResetKey}
              />
            )}

            {chartMode === 'grouped-bar' && (() => {
              const barData = selectedRuns.map((r) => ({
                id: r.id,
                name: uniqueLegendMap.get(r.id) ?? r.psiId,
                O2_pct: r.O2_pct,
                P_psi: r.P_psi,
                Spread_x10: Number((r.flameSpread_mms * 10).toFixed(1)),
              }));
              const maxBarVal = Math.ceil(
                Math.max(
                  25,
                  ...barData.flatMap((d) => [d.O2_pct, d.P_psi, d.Spread_x10])
                ) * 1.12
              );

              return (
                <InteractiveChartViewport
                  theme={theme}
                  baseXDomain={{ min: 0, max: Math.max(1, barData.length - 1) }}
                  baseYDomain={{ min: 0, max: maxBarVal }}
                  resetKey={comparatorResetKey}
                  xTickCount={barData.length}
                  yTickCount={6}
                  integerX={true}
                  plotInsets={{ left: 0.06, right: 0.03, top: 0.06, bottom: 0.12 }}
                >
                  {(ctx) => {
                    const sIdx = Math.max(0, Math.floor(ctx.xDomain.min));
                    const eIdx = Math.min(barData.length - 1, Math.ceil(ctx.xDomain.max));
                    const visibleBars =
                      ctx.xZoomRatio > 1.03 || sIdx > 0 || eIdx < barData.length - 1
                        ? barData.slice(
                            Math.min(sIdx, Math.max(0, barData.length - 2)),
                            Math.max(Math.min(barData.length, sIdx + 2), eIdx + 1)
                          )
                        : barData;

                    return (
                      <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={visibleBars}
                            margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
                          >
                            <CartesianGrid
                              stroke={gridStroke}
                              strokeDasharray="3 3"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="name"
                              stroke={axisTextFill}
                              tick={{
                                fontSize: 10.5,
                                fontFamily: 'JetBrains Mono, monospace',
                                fill: axisTextFill,
                              }}
                            />
                            <YAxis
                              domain={[ctx.yDomain.min, ctx.yDomain.max]}
                              ticks={ctx.yTicks.ticks}
                              allowDataOverflow={true}
                              stroke={axisTextFill}
                              tick={{
                                fontSize: 11,
                                fontFamily: 'JetBrains Mono, monospace',
                                fill: axisTextFill,
                              }}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                                borderColor: isDark ? '#27272A' : '#E4E4E7',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontFamily: 'Inter, sans-serif',
                              }}
                            />
                            <Bar
                              dataKey="O2_pct"
                              name="O₂ (%)"
                              fill="#10B981"
                              radius={[3, 3, 0, 0]}
                              isAnimationActive={false}
                            />
                            <Bar
                              dataKey="P_psi"
                              name="Pressure (psi)"
                              fill="#F59E0B"
                              radius={[3, 3, 0, 0]}
                              isAnimationActive={false}
                            />
                            <Bar
                              dataKey="Spread_x10"
                              name="Flame Spread (×10 mm/s)"
                              fill="#EF4444"
                              radius={[3, 3, 0, 0]}
                              isAnimationActive={false}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  }}
                </InteractiveChartViewport>
              );
            })()}

            {chartMode === 'lollipop' && (() => {
              const maxSpread = Math.max(
                3.5,
                ...selectedRuns.map((r) => r.flameSpread_mms * 1.1)
              );
              return (
                <InteractiveChartViewport
                  theme={theme}
                  baseXDomain={{ min: 0, max: Number(maxSpread.toFixed(2)) }}
                  baseYDomain={{ min: 0, max: Math.max(1, selectedRuns.length - 1) }}
                  resetKey={comparatorResetKey}
                  defaultLockMode="x"
                  xTickCount={6}
                  integerY={true}
                  xUnit="mm/s"
                  plotInsets={{ left: 0.25, right: 0.16, top: 0.08, bottom: 0.08 }}
                >
                  {(ctx) => {
                    const xMin = ctx.xDomain.min;
                    const xMax = ctx.xDomain.max;
                    const xSpan = Math.max(1e-6, xMax - xMin);
                    const toPct = (v: number) => ((v - xMin) / xSpan) * 100;
                    const zeroPct = toPct(0);
                    const rStart = Math.max(0, Math.floor(ctx.yDomain.min));
                    const rEnd = Math.min(selectedRuns.length - 1, Math.ceil(ctx.yDomain.max));
                    const visibleRuns =
                      ctx.yZoomRatio > 1.03 || rStart > 0 || rEnd < selectedRuns.length - 1
                        ? selectedRuns.slice(
                            Math.min(rStart, Math.max(0, selectedRuns.length - 2)),
                            Math.max(Math.min(selectedRuns.length, rStart + 2), rEnd + 1)
                          )
                        : selectedRuns;

                    return (
                      <div
                        className={`border rounded-[5px] p-4 space-y-3 ${
                          isDark
                            ? 'bg-[#09090B]/60 border-[#27272A]'
                            : 'bg-zinc-50/70 border-[#E4E4E7]'
                        }`}
                      >
                        <div className="grid grid-cols-12 items-center gap-3 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A]">
                          <div className="col-span-3 font-sans text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                            Selected Run
                          </div>
                          <div className="col-span-7 relative h-4 font-mono text-[10px] tabular-nums text-zinc-400">
                            {ctx.xTicks.ticks.map((tk, idx) => {
                              const pos = toPct(tk);
                              if (pos < -2 || pos > 102) return null;
                              return (
                                <span
                                  key={`cmp-lol-${tk}-${idx}`}
                                  className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                                  style={{ left: `${Math.max(2, Math.min(98, pos))}%` }}
                                >
                                  {ctx.xTicks.labels[idx] ?? tk.toFixed(1)}
                                </span>
                              );
                            })}
                          </div>
                          <div className="col-span-2 text-right font-sans text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                            Spread
                          </div>
                        </div>

                        {visibleRuns.map((run) => {
                          const globalIdx = selectedRuns.findIndex((r) => r.id === run.id);
                          const color = RUN_COLORS[(globalIdx >= 0 ? globalIdx : 0) % RUN_COLORS.length];
                          const dotRaw = toPct(run.flameSpread_mms);
                          const segL = Math.max(0, Math.min(100, Math.min(zeroPct, dotRaw)));
                          const segR = Math.max(0, Math.min(100, Math.max(zeroPct, dotRaw)));
                          const isDimmed =
                            hoveredRunId !== null && hoveredRunId !== run.id;

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
                              <div
                                className="col-span-3 font-mono text-xs font-semibold truncate"
                                title={uniqueLegendMap.get(run.id) ?? run.psiId}
                              >
                                {uniqueLegendMap.get(run.id) ?? run.psiId}
                              </div>
                              <div className="col-span-7 relative h-5 flex items-center overflow-hidden">
                                <div
                                  className="w-full h-[1px]"
                                  style={{ backgroundColor: gridStroke }}
                                />
                                {segR > segL && (
                                  <div
                                    className="absolute h-[2.5px]"
                                    style={{
                                      left: `${segL}%`,
                                      width: `${segR - segL}%`,
                                      backgroundColor: color,
                                    }}
                                  />
                                )}
                                {dotRaw >= 0 && dotRaw <= 100 && (
                                  <div
                                    className="absolute w-3 h-3 rounded-[2px] -translate-x-1/2"
                                    style={{ left: `${dotRaw}%`, backgroundColor: color }}
                                  />
                                )}
                              </div>
                              <div className="col-span-2 text-right font-mono text-xs font-bold tabular-nums">
                                {run.flameSpread_mms.toFixed(2)} mm/s
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }}
                </InteractiveChartViewport>
              );
            })()}

            {chartMode === 'heatmap' && (() => {
              const metricCols = [
                {
                  id: 'o2',
                  label: 'O₂ %',
                  render: (run: PsiRun) => {
                    const normO2 = Math.min(1, Math.max(0, (run.O2_pct - 14) / 30));
                    return (
                      <td
                        key="o2"
                        className="py-2 px-3 text-right font-mono tabular-nums"
                        style={{
                          backgroundColor: `rgba(245, 158, 11, ${(0.06 + normO2 * 0.34).toFixed(2)})`,
                        }}
                      >
                        {run.O2_pct.toFixed(1)}%
                      </td>
                    );
                  },
                },
                {
                  id: 'pressure',
                  label: 'Pressure',
                  render: (run: PsiRun) => (
                    <td key="pressure" className="py-2 px-3 text-right font-mono tabular-nums">
                      {run.P_psi.toFixed(1)} psi
                    </td>
                  ),
                },
                {
                  id: 'flow',
                  label: 'Airflow',
                  render: (run: PsiRun) => (
                    <td key="flow" className="py-2 px-3 text-right font-mono tabular-nums">
                      {run.Flow_ms.toFixed(2)} m/s
                    </td>
                  ),
                },
                {
                  id: 'temp',
                  label: 'Peak Temp',
                  render: (run: PsiRun) => (
                    <td key="temp" className="py-2 px-3 text-right font-mono tabular-nums">
                      {run.peakTemp_K} K
                    </td>
                  ),
                },
                {
                  id: 'spread',
                  label: 'Spread',
                  render: (run: PsiRun) => {
                    const normSpread = Math.min(1, run.flameSpread_mms / 3.0);
                    return (
                      <td
                        key="spread"
                        className="py-2 px-3 text-right font-mono font-bold tabular-nums"
                        style={{
                          backgroundColor: `rgba(239, 68, 68, ${(0.06 + normSpread * 0.38).toFixed(2)})`,
                        }}
                      >
                        {run.flameSpread_mms.toFixed(2)} mm/s
                      </td>
                    );
                  },
                },
              ];

              return (
                <InteractiveChartViewport
                  theme={theme}
                  baseXDomain={{ min: 0, max: metricCols.length - 1 }}
                  baseYDomain={{ min: 0, max: Math.max(1, selectedRuns.length - 1) }}
                  resetKey={comparatorResetKey}
                  integerX={true}
                  integerY={true}
                  plotInsets={{ left: 0.16, right: 0.02, top: 0.12, bottom: 0.02 }}
                >
                  {(ctx) => {
                    const c0 = Math.max(0, Math.floor(ctx.xDomain.min));
                    const c1 = Math.min(metricCols.length - 1, Math.ceil(ctx.xDomain.max));
                    const r0 = Math.max(0, Math.floor(ctx.yDomain.min));
                    const r1 = Math.min(selectedRuns.length - 1, Math.ceil(ctx.yDomain.max));
                    const visibleCols =
                      ctx.xZoomRatio > 1.04 || c0 > 0 || c1 < metricCols.length - 1
                        ? metricCols.slice(
                            Math.min(c0, Math.max(0, metricCols.length - 2)),
                            Math.max(Math.min(metricCols.length, c0 + 2), c1 + 1)
                          )
                        : metricCols;
                    const visibleRuns =
                      ctx.yZoomRatio > 1.04 || r0 > 0 || r1 < selectedRuns.length - 1
                        ? selectedRuns.slice(
                            Math.min(r0, Math.max(0, selectedRuns.length - 2)),
                            Math.max(Math.min(selectedRuns.length, r0 + 2), r1 + 1)
                          )
                        : selectedRuns;

                    return (
                      <div
                        className={`border rounded-[5px] overflow-x-auto ${
                          isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                        }`}
                      >
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr
                              className={`border-b font-sans text-[11px] font-semibold text-zinc-500 ${
                                isDark
                                  ? 'bg-[#09090B] border-[#27272A]'
                                  : 'bg-zinc-50 border-[#E4E4E7]'
                              }`}
                            >
                              <th className="py-2 px-3 text-left">Run</th>
                              {visibleCols.map((c) => (
                                <th key={c.id} className="py-2 px-3 text-right">
                                  {c.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody
                            className={`divide-y ${
                              isDark ? 'divide-[#27272A]' : 'divide-[#E4E4E7]'
                            }`}
                          >
                            {visibleRuns.map((run) => (
                              <tr
                                key={run.id}
                                onMouseEnter={() => onHoverRun(run.id)}
                                onMouseLeave={() => onHoverRun(null)}
                                onClick={() => {
                                  if (!ctx.wasRecentlyDragged()) onInspectRun(run.id);
                                }}
                                className="cursor-pointer"
                              >
                                <td className="py-2 px-3 font-mono font-semibold">
                                  {uniqueLegendMap.get(run.id) ?? run.psiId}
                                </td>
                                {visibleCols.map((c) => c.render(run))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }}
                </InteractiveChartViewport>
              );
            })()}
          </div>
        </CollapsibleCard>
      )}
    </div>
  );
};
