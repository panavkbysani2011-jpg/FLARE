import React, { useMemo, useState } from 'react';
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
import { PsiRun, ThemeMode, VizMode } from '../types/psi';
import { generateTimelineSeries } from '../utils/physicsEngine';
import { CollapsibleCard } from './CollapsibleCard';

interface RunComparatorProps {
  theme: ThemeMode;
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
    <div className="space-y-4">
      {/* Page Title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Run Comparator
          </h1>
          <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Side-by-side comparison matrix and overlaid trajectory analysis for up to 4 historical or virtual combustion runs
          </p>
        </div>
        {onAddActiveVirtualRun && (
          <button
            type="button"
            onClick={onAddActiveVirtualRun}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-semibold rounded-[4px] border transition-colors cursor-pointer ${
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

      {/* 1. Side-by-Side Comparison Matrix */}
      <CollapsibleCard
        theme={theme}
        title="Side-by-Side Run Comparison Matrix"
        subtitle={`${selectedRuns.length}/4 Runs Checked · Deltas vs. ${baselineRun?.psiId ?? 'Baseline'}`}
        summaryLine={`${selectedRuns.length}/4 selected runs · Baseline ${baselineRun?.psiId ?? 'None'}`}
        rightActions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowExtendedCols((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium rounded-[4px] border transition-colors cursor-pointer ${
                showExtendedCols
                  ? isDark
                    ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA] font-semibold'
                    : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B] font-semibold'
                  : isDark
                  ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800'
                  : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>
                {showExtendedCols
                  ? 'Hide Extra Telemetry'
                  : 'Show Extra Telemetry (+3 cols)'}
              </span>
            </button>

            {onGoToCatalog && (
              <button
                type="button"
                onClick={onGoToCatalog}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium rounded-[4px] border transition-colors cursor-pointer ${
                  isDark
                    ? 'border-[#27272A] text-zinc-200 hover:bg-zinc-800'
                    : 'border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100'
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
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-sans font-semibold rounded-[4px] transition-colors cursor-pointer ${
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
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium rounded-[4px] border transition-colors cursor-pointer ${
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
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr
                  className={`border-b font-sans text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 ${
                    isDark
                      ? 'bg-[#09090B] border-[#27272A]'
                      : 'bg-zinc-50 border-[#E4E4E7]'
                  }`}
                >
                  <th className="py-2.5 px-3">PSI ID</th>
                  <th className="py-2.5 px-3">Material / Fuel</th>
                  <th className="py-2.5 px-3">Facility</th>
                  <th className="py-2.5 px-3">O₂ %</th>
                  <th className="py-2.5 px-3">Pressure</th>
                  <th className="py-2.5 px-3">Airflow</th>
                  {showExtendedCols && (
                    <>
                      <th className="py-2.5 px-3">Gravity</th>
                      <th className="py-2.5 px-3">Thickness</th>
                      <th className="py-2.5 px-3">Peak Temp</th>
                    </>
                  )}
                  <th className="py-2.5 px-3">Flame Spread</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
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
                      <td className="py-2.5 px-3 font-mono font-semibold whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-[2px] shrink-0"
                            style={{
                              backgroundColor:
                                RUN_COLORS[idx % RUN_COLORS.length],
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => onInspectRun(run.id)}
                            className="hover:underline cursor-pointer text-left"
                          >
                            {run.psiId}
                          </button>
                          {idx === 0 && (
                            <span className="font-sans text-[10px] text-zinc-400 font-normal">
                              [REF]
                            </span>
                          )}
                          {run.isVirtual && (
                            <span className="font-sans text-[10px] text-[#10B981] font-normal">
                              [VIRTUAL]
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-sans text-zinc-700 dark:text-zinc-200">
                        {run.material}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-zinc-500">
                        {run.facility}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        <span>{run.O2_pct.toFixed(1)}%</span>
                        {o2Delta && (
                          <span className="ml-1.5 text-[10px] text-zinc-400">
                            ({o2Delta})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        <span>{run.P_psi.toFixed(1)} psi</span>
                        {pDelta && (
                          <span className="ml-1.5 text-[10px] text-zinc-400">
                            ({pDelta})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        <span>{run.Flow_ms.toFixed(2)} m/s</span>
                        {flowDelta && (
                          <span className="ml-1.5 text-[10px] text-zinc-400">
                            ({flowDelta})
                          </span>
                        )}
                      </td>
                      {showExtendedCols && (
                        <>
                          <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                            <span>{run.g_eff.toFixed(3)}g</span>
                            {gDelta && (
                              <span className="ml-1.5 text-[10px] text-zinc-400">
                                ({gDelta})
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                            <span>{run.Thickness_mm.toFixed(1)} mm</span>
                            {thickDelta && (
                              <span className="ml-1.5 text-[10px] text-zinc-400">
                                ({thickDelta})
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                            <span>{run.peakTemp_K} K</span>
                            {tempDelta && (
                              <span className="ml-1.5 text-[10px] text-zinc-400">
                                ({tempDelta})
                              </span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap font-bold">
                        <span>{run.flameSpread_mms.toFixed(2)} mm/s</span>
                        {spreadDelta && (
                          <span
                            className={`ml-1.5 text-[10px] ${
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
                        className={`py-2.5 px-3 font-sans font-semibold whitespace-nowrap ${outcomeStyle(
                          run.outcome
                        )}`}
                      >
                        ● {run.outcome}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onApplyRunToSliders(run)}
                            className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-sans font-medium rounded-[3px] border transition-colors cursor-pointer ${
                              isDark
                                ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800'
                                : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100'
                            }`}
                          >
                            <Sliders className="w-3 h-3" />
                            <span>Simulate</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveRun(run.id)}
                            aria-label={`Remove ${run.psiId} from comparison`}
                            className="p-1 text-zinc-400 hover:text-[#EF4444] cursor-pointer"
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

      {/* 2. Switchable Multi-Axis & Trajectory Comparison Chart */}
      {selectedRuns.length >= 2 && (
        <CollapsibleCard
          theme={theme}
          title="Overlaid Multi-Axis Trajectory & Technique Comparison"
          subtitle={
            chartMode === 'parallel'
              ? 'Parallel Coordinates'
              : chartMode === 'trajectory'
              ? '0–120s Trajectory Overlay'
              : chartMode === 'grouped-bar'
              ? 'Grouped Bars'
              : chartMode === 'lollipop'
              ? 'Cleveland Lollipop'
              : 'Matrix Heatmap'
          }
          summaryLine={`Comparing ${selectedRuns.length} runs across ${chartMode === 'trajectory' ? '0–120s thermal evolution' : 'multi-variable axes'}`}
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
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans font-medium rounded-[4px] border transition-colors cursor-pointer ${
                  isDark
                    ? 'border-[#27272A] text-zinc-200 hover:bg-zinc-800'
                    : 'border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100'
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
                className={`flex flex-wrap items-center gap-1 p-1 rounded-[5px] border ${
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
                    { id: 'trajectory', label: '0–120s Trajectory' },
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
                      className={`px-2.5 py-1 text-[11px] font-sans rounded-[4px] transition-colors cursor-pointer ${
                        active
                          ? isDark
                            ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                            : 'bg-[#18181B] text-[#FFFFFF] font-semibold'
                          : isDark
                          ? 'text-zinc-400 hover:text-zinc-100'
                          : 'text-zinc-600 hover:text-zinc-950'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 font-sans text-xs pb-1">
              {selectedRuns.map((run, idx) => {
                const isDimmed =
                  hoveredRunId !== null && hoveredRunId !== run.id;
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
                    <span>{run.psiId}</span>
                  </button>
                );
              })}
            </div>

            {chartMode === 'trajectory' && (
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
                      dataKey="time_s"
                      stroke={axisTextFill}
                      tickFormatter={(v) => `${v}s`}
                      tick={{
                        fontSize: 11,
                        fontFamily: 'JetBrains Mono, monospace',
                        fill: axisTextFill,
                      }}
                    />
                    <YAxis
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
                        backgroundColor: isDark ? 'rgba(24,24,27,0.9)' : 'rgba(255,255,255,0.92)',
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
                        name={`${run.psiId} (K)`}
                        stroke={RUN_COLORS[idx % RUN_COLORS.length]}
                        strokeWidth={hoveredRunId === run.id ? 3 : 2}
                        strokeOpacity={
                          hoveredRunId !== null && hoveredRunId !== run.id
                            ? 0.25
                            : 1
                        }
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

          {chartMode === 'parallel' && (
            <svg
              viewBox="0 0 920 280"
              className="w-full h-auto"
              role="img"
              aria-label="Selected Runs Overlaid Parallel Axes Chart"
            >
            {(() => {
              const axes = [
                { label: 'O₂ %', min: 14, max: 85, unit: '%' },
                { label: 'Pressure psi', min: 4.3, max: 14.7, unit: 'psi' },
                { label: 'Airflow m/s', min: 0.0, max: 0.5, unit: 'm/s' },
                { label: 'Peak Temp K', min: 500, max: 1850, unit: 'K' },
                {
                  label: 'Flame Spread mm/s',
                  min: 0.0,
                  max: 4.0,
                  unit: 'mm/s',
                },
              ];
              const xPositions = [100, 290, 480, 670, 840];
              const yTop = 36;
              const yBot = 244;

              const normalize = (val: number, min: number, max: number) =>
                yBot -
                Math.max(0, Math.min(1, (val - min) / (max - min))) *
                  (yBot - yTop);

              const buildPoints = (vals: number[]) =>
                vals
                  .map(
                    (v, i) =>
                      `${xPositions[i]},${normalize(
                        v,
                        axes[i].min,
                        axes[i].max
                      )}`
                  )
                  .join(' ');

              return (
                <>
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
                          stroke={axisTextFill}
                          strokeWidth={1.25}
                        />
                        <text
                          x={x}
                          y={16}
                          textAnchor="middle"
                          fill={isDark ? '#FAFAFA' : '#18181B'}
                          fontSize="11"
                          fontFamily="Inter, sans-serif"
                          fontWeight="600"
                        >
                          {ax.label}
                        </text>
                        <text
                          x={x}
                          y={yTop - 5}
                          textAnchor="middle"
                          fill={axisTextFill}
                          fontSize="9.5"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {ax.max} {ax.unit}
                        </text>
                        <text
                          x={x}
                          y={yBot + 16}
                          textAnchor="middle"
                          fill={axisTextFill}
                          fontSize="9.5"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {ax.min} {ax.unit}
                        </text>
                      </g>
                    );
                  })}

                  {selectedRuns.map((run, idx) => {
                    const vals = [
                      run.O2_pct,
                      run.P_psi,
                      run.Flow_ms,
                      run.peakTemp_K,
                      run.flameSpread_mms,
                    ];
                    const color = RUN_COLORS[idx % RUN_COLORS.length];
                    const isDimmed =
                      hoveredRunId !== null && hoveredRunId !== run.id;

                    return (
                      <g
                        key={run.id}
                        onMouseEnter={() => onHoverRun(run.id)}
                        onMouseLeave={() => onHoverRun(null)}
                        onClick={() => onInspectRun(run.id)}
                        className={`cursor-pointer transition-opacity duration-200 ${
                          isDimmed ? 'opacity-30' : 'opacity-100'
                        }`}
                      >
                        <polyline
                          fill="none"
                          stroke={color}
                          strokeWidth={hoveredRunId === run.id ? 3.25 : 2.25}
                          points={buildPoints(vals)}
                        />
                        {vals.map((v, i) => (
                          <circle
                            key={i}
                            cx={xPositions[i]}
                            cy={normalize(v, axes[i].min, axes[i].max)}
                            r={4.5}
                            fill={color}
                          />
                        ))}
                      </g>
                    );
                  })}
                </>
              );
            })()}
          </svg>
          )}

          {chartMode === 'grouped-bar' && (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={selectedRuns.map((r) => ({
                    name: r.psiId,
                    O2_pct: r.O2_pct,
                    P_psi: r.P_psi,
                    Spread_x10: Number((r.flameSpread_mms * 10).toFixed(1)),
                  }))}
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
                      fontSize: 11,
                      fontFamily: 'JetBrains Mono, monospace',
                      fill: axisTextFill,
                    }}
                  />
                  <YAxis
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
                  />
                  <Bar
                    dataKey="P_psi"
                    name="Pressure (psi)"
                    fill="#F59E0B"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="Spread_x10"
                    name="Flame Spread (×10 mm/s)"
                    fill="#EF4444"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {chartMode === 'lollipop' && (
            <div
              className={`border rounded-[5px] p-4 space-y-3 ${
                isDark
                  ? 'bg-[#09090B]/60 border-[#27272A]'
                  : 'bg-zinc-50/70 border-[#E4E4E7]'
              }`}
            >
              {(() => {
                const maxSpread = Math.max(
                  3.5,
                  ...selectedRuns.map((r) => r.flameSpread_mms * 1.1)
                );
                return selectedRuns.map((run, idx) => {
                  const pct = Math.min(
                    98,
                    (run.flameSpread_mms / maxSpread) * 100
                  );
                  const isDimmed =
                    hoveredRunId !== null && hoveredRunId !== run.id;
                  const color = RUN_COLORS[idx % RUN_COLORS.length];
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
                      <div className="col-span-3 font-mono text-xs font-semibold truncate">
                        {run.psiId}
                      </div>
                      <div className="col-span-7 relative h-5 flex items-center">
                        <div
                          className="w-full h-[1px]"
                          style={{ backgroundColor: gridStroke }}
                        />
                        <div
                          className="absolute left-0 h-[2.5px]"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                        <div
                          className="absolute w-3 h-3 rounded-[2px] -translate-x-1/2"
                          style={{ left: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                      <div className="col-span-2 text-right font-mono text-xs font-bold tabular-nums">
                        {run.flameSpread_mms.toFixed(2)} mm/s
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {chartMode === 'heatmap' && (
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
                    <th className="py-2 px-3 text-right">O₂ %</th>
                    <th className="py-2 px-3 text-right">Pressure</th>
                    <th className="py-2 px-3 text-right">Airflow</th>
                    <th className="py-2 px-3 text-right">Peak Temp</th>
                    <th className="py-2 px-3 text-right">Spread</th>
                  </tr>
                </thead>
                <tbody
                  className={`divide-y ${
                    isDark ? 'divide-[#27272A]' : 'divide-[#E4E4E7]'
                  }`}
                >
                  {selectedRuns.map((run) => {
                    const normO2 = Math.min(1, Math.max(0, (run.O2_pct - 14) / 30));
                    const normSpread = Math.min(1, run.flameSpread_mms / 3.0);
                    return (
                      <tr
                        key={run.id}
                        onMouseEnter={() => onHoverRun(run.id)}
                        onMouseLeave={() => onHoverRun(null)}
                        onClick={() => onInspectRun(run.id)}
                        className="cursor-pointer"
                      >
                        <td className="py-2 px-3 font-mono font-semibold">
                          {run.psiId}
                        </td>
                        <td
                          className="py-2 px-3 text-right font-mono tabular-nums"
                          style={{
                            backgroundColor: `rgba(245, 158, 11, ${(0.06 + normO2 * 0.34).toFixed(2)})`,
                          }}
                        >
                          {run.O2_pct.toFixed(1)}%
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {run.P_psi.toFixed(1)} psi
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {run.Flow_ms.toFixed(2)} m/s
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {run.peakTemp_K} K
                        </td>
                        <td
                          className="py-2 px-3 text-right font-mono font-bold tabular-nums"
                          style={{
                            backgroundColor: `rgba(239, 68, 68, ${(0.06 + normSpread * 0.38).toFixed(2)})`,
                          }}
                        >
                          {run.flameSpread_mms.toFixed(2)} mm/s
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </CollapsibleCard>
      )}
    </div>
  );
};
