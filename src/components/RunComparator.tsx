import React, { useState } from 'react';
import {
  Table,
  X,
  Sliders,
  Plus,
  Columns3,
  Layers,
} from 'lucide-react';
import { PsiRun, ThemeMode } from '../types/psi';

interface RunComparatorProps {
  theme: ThemeMode;
  selectedRuns: PsiRun[];
  hoveredRunId: string | null;
  onHoverRun: (runId: string | null) => void;
  onInspectRun: (runId: string) => void;
  onRemoveRun: (runId: string) => void;
  onApplyRunToSliders: (run: PsiRun) => void;
  onLoadDefaultComparisonSet: () => void;
  onGoToCatalog?: () => void;
}

const RUN_COLORS = ['#10B981', '#F59E0B', '#A855F7', '#EC4899'];

export const RunComparator: React.FC<RunComparatorProps> = ({
  theme,
  selectedRuns,
  hoveredRunId,
  onHoverRun,
  onInspectRun,
  onRemoveRun,
  onApplyRunToSliders,
  onLoadDefaultComparisonSet,
  onGoToCatalog,
}) => {
  const [showExtendedCols, setShowExtendedCols] = useState(false);

  const isDark = theme === 'dark';

  const cardSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const baselineRun = selectedRuns[0] ?? null;

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
      {/* 1. Side-by-Side Comparison Matrix */}
      <section className={`border rounded-[6px] p-5 ${cardSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <Table className="w-4 h-4 text-zinc-500" />
            <h2 className="font-display text-sm font-semibold">
              Side-by-Side Run Comparison Matrix
            </h2>
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
              ({selectedRuns.length}/4 Runs Checked · Deltas vs.{' '}
              {baselineRun?.psiId ?? 'Baseline'})
            </span>
          </div>

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
                  ? 'Hide Extended Telemetry'
                  : 'Expand Full Telemetry (+3 cols)'}
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
        </div>

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
                  <span>Browse Experiment Catalog</span>
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
                            <span className="text-[10px] text-zinc-400 font-normal">
                              [REF]
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
                        {run.P_psi.toFixed(1)} psi
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        {run.Flow_ms.toFixed(2)} m/s
                      </td>
                      {showExtendedCols && (
                        <>
                          <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                            {run.g_eff.toFixed(3)}g
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                            {run.Thickness_mm.toFixed(1)} mm
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                            {run.peakTemp_K} K
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
      </section>

      {/* 2. Overlaid Multi-Variable Parallel Profile */}
      {selectedRuns.length >= 2 && (
        <section className={`border rounded-[6px] p-5 ${cardSurface}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="font-display text-sm font-semibold">
                Overlaid Multi-Variable Coordinate Comparison
              </h3>
              <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 mt-0.5">
                Hover any run in the table or legend to isolate its trajectory
                across all 5 normalized combustion axes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
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
          </div>

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
        </section>
      )}
    </div>
  );
};
