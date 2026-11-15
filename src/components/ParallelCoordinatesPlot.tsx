import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ExternalLink, FilterX } from 'lucide-react';
import { PsiRun, SimulationResponse, ThemeMode } from '../types/psi';
import {
  AxisDomain,
  computeDesmosTicks,
  findNearestScreenPoint,
  formatUniqueRunLegendMap,
  panDomainByPixels,
  ScreenPointCandidate,
  zoomDomainAroundValue,
} from '../utils/chartViewportMath';
import {
  InteractiveChartViewport,
  RunTelemetryGlassTooltip,
} from './InteractiveChartViewport';
import { StudioSelect } from './StudioSelect';

interface ParallelCoordinatesPlotProps {
  theme: ThemeMode;
  runs: PsiRun[];
  sliders?: {
    O2_pct: number;
    P_psi: number;
    Flow_ms: number;
    g_eff: number;
    Thickness_mm: number;
  };
  simulation?: SimulationResponse;
  showActiveVirtual?: boolean;
  hoveredRunId: string | null;
  onHoverRun: (runId: string | null) => void;
  onInspectRun: (runId: string) => void;
  resetKey: string;
}

interface AxisSpec {
  id: string;
  label: string;
  shortLabel: string;
  unit: string;
  base: AxisDomain;
  getValue: (r: PsiRun) => number;
}

const RUN_COLORS = ['#10B981', '#F59E0B', '#64748B', '#EF4444'];

const SVG_W = 920;
const SVG_H = 314;
const X_POSITIONS = [108, 294, 480, 666, 852];
const Y_TOP = 42;
const Y_BOT = 266;
const PLOT_H = Y_BOT - Y_TOP;

const BASE_AXES: AxisSpec[] = [
  {
    id: 'O2_pct',
    label: 'O₂ %',
    shortLabel: 'O₂',
    unit: '%',
    base: { min: 14, max: 100 },
    getValue: (r) => r.O2_pct,
  },
  {
    id: 'P_psi',
    label: 'Pressure psi',
    shortLabel: 'Pressure',
    unit: 'psi',
    base: { min: 4.3, max: 20.0 },
    getValue: (r) => r.P_psi,
  },
  {
    id: 'Flow_ms',
    label: 'Airflow m/s',
    shortLabel: 'Airflow',
    unit: 'm/s',
    base: { min: 0.0, max: 0.5 },
    getValue: (r) => r.Flow_ms,
  },
  {
    id: 'peakTemp_K',
    label: 'Peak Temp K',
    shortLabel: 'Temp',
    unit: 'K',
    base: { min: 500, max: 1850 },
    getValue: (r) => r.peakTemp_K,
  },
  {
    id: 'flameSpread_mms',
    label: 'Spread mm/s',
    shortLabel: 'Spread',
    unit: 'mm/s',
    base: { min: 0.0, max: 5.0 },
    getValue: (r) => r.flameSpread_mms,
  },
];

export const ParallelCoordinatesPlot: React.FC<ParallelCoordinatesPlotProps> = ({
  theme,
  runs,
  sliders,
  simulation,
  showActiveVirtual = true,
  hoveredRunId,
  onHoverRun,
  onInspectRun,
  resetKey,
}) => {
  const isDark = theme === 'dark';
  const axisStroke = isDark ? '#A1A1AA' : '#52525B';
  const gridStroke = isDark ? 'rgba(255,255,255,0.08)' : '#E4E4E7';
  const monoBg = isDark ? '#09090B' : '#FAFAFA';
  const textPrimary = isDark ? '#FAFAFA' : '#18181B';
  const clipId = useId().replace(/:/g, '');

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isolatedRunId, setIsolatedRunId] = useState<string | null>(null);
  const [focusedAxisIdx, setFocusedAxisIdx] = useState<number | 'all'>('all');
  const [axisDomains, setAxisDomains] = useState<AxisDomain[]>(() =>
    BASE_AXES.map((a) => ({ ...a.base }))
  );

  useEffect(() => {
    setAxisDomains(BASE_AXES.map((a) => ({ ...a.base })));
    setIsolatedRunId(null);
    setFocusedAxisIdx('all');
  }, [resetKey]);

  const legendMap = useMemo(() => formatUniqueRunLegendMap(runs), [runs]);

  const activeRunId = isolatedRunId ?? hoveredRunId;
  const activeRun = useMemo(
    () => runs.find((r) => r.id === activeRunId) ?? null,
    [runs, activeRunId]
  );

  const axisZoomRatios = useMemo(
    () =>
      axisDomains.map((dom, idx) => {
        const baseSpan = BASE_AXES[idx].base.max - BASE_AXES[idx].base.min;
        const curSpan = Math.max(1e-9, dom.max - dom.min);
        return baseSpan / curSpan;
      }),
    [axisDomains]
  );

  const maxAxisZoom = Math.max(...axisZoomRatios);
  const isAnyAxisZoomed =
    axisZoomRatios.some((r) => Math.abs(r - 1) > 0.03) ||
    axisDomains.some(
      (d, idx) =>
        Math.abs(d.min - BASE_AXES[idx].base.min) >
        (BASE_AXES[idx].base.max - BASE_AXES[idx].base.min) * 0.01
    );

  const zoomSpecificOrAllAxes = useCallback(
    (axisIndex: number | 'all', anchorNormalizedY: number, factor: number) => {
      setAxisDomains((prev) =>
        prev.map((dom, idx) => {
          if (axisIndex !== 'all' && axisIndex !== idx) return dom;
          const anchorVal = dom.min + anchorNormalizedY * (dom.max - dom.min);
          return zoomDomainAroundValue(dom, anchorVal, factor, BASE_AXES[idx].base);
        })
      );
    },
    []
  );

  const resetAllAxes = useCallback(() => {
    setAxisDomains(BASE_AXES.map((a) => ({ ...a.base })));
    setFocusedAxisIdx('all');
  }, []);

  const customWheelHandler = useCallback(
    (e: WheelEvent, rect: DOMRect) => {
      const svgRect = svgRef.current?.getBoundingClientRect() ?? rect;
      const svgX = ((e.clientX - svgRect.left) / Math.max(1, svgRect.width)) * SVG_W;
      const svgY = ((e.clientY - svgRect.top) / Math.max(1, svgRect.height)) * SVG_H;

      const normY = Math.max(0, Math.min(1, 1 - (svgY - Y_TOP) / PLOT_H));
      const deltaNorm = Math.max(-0.45, Math.min(0.45, e.deltaY * 0.0018));
      const factor = Math.exp(deltaNorm);

      // Snap to nearest vertical axis if pointer is hovering over an axis column (+/- 62 SVG px)
      let targetIdx: number | 'all' = focusedAxisIdx;
      if (focusedAxisIdx === 'all') {
        let bestDist = 62;
        X_POSITIONS.forEach((axX, idx) => {
          const dist = Math.abs(svgX - axX);
          if (dist < bestDist) {
            bestDist = dist;
            targetIdx = idx;
          }
        });
      }

      zoomSpecificOrAllAxes(targetIdx, normY, factor);
      return true;
    },
    [focusedAxisIdx, zoomSpecificOrAllAxes]
  );

  const simVals = useMemo(() => {
    if (!showActiveVirtual || !sliders || !simulation) return null;
    return [
      sliders.O2_pct,
      sliders.P_psi,
      sliders.Flow_ms,
      simulation.peakTemp_K,
      simulation.flameSpread_mms,
    ];
  }, [showActiveVirtual, sliders, simulation]);

  const normalizeY = (val: number, dom: AxisDomain) =>
    Y_BOT - ((val - dom.min) / Math.max(1e-9, dom.max - dom.min)) * PLOT_H;

  const buildPoints = (vals: number[]) =>
    vals.map((v, i) => `${X_POSITIONS[i]},${normalizeY(v, axisDomains[i])}`).join(' ');

  const zoomLabel = isAnyAxisZoomed
    ? `${maxAxisZoom.toFixed(1)}x · ${
        focusedAxisIdx === 'all' ? 'Zoomed' : BASE_AXES[focusedAxisIdx].shortLabel
      }`
    : '100%';

  return (
    <div
      className="space-y-2.5 relative"
      onMouseLeave={() => onHoverRun(null)}
    >
      {/* Unique Run Legend Strip cleanly above SVG */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-[#E4E4E7] dark:border-[#27272A]">
        <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
          {simVals && (
            <span className="inline-flex items-center gap-1.5 font-sans font-semibold text-[#EF4444]">
              <span className="w-4 h-0 border-t-2 border-dashed border-[#EF4444]" />
              <span>Active Virtual Test</span>
            </span>
          )}
          {runs.map((run, idx) => {
            const label = legendMap.get(run.id) ?? run.psiId;
            const isIsolated = isolatedRunId === run.id;
            const isDimmed = activeRunId !== null && activeRunId !== run.id;
            const color = RUN_COLORS[idx % RUN_COLORS.length];
            return (
              <button
                key={run.id}
                type="button"
                onMouseEnter={() => onHoverRun(run.id)}
                onMouseLeave={() => onHoverRun(null)}
                onClick={() =>
                  setIsolatedRunId((prev) => (prev === run.id ? null : run.id))
                }
                title="Hover to preview or click to isolate this run trajectory"
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-sans transition-all cursor-pointer ${
                  isIsolated
                    ? isDark
                      ? 'border-zinc-400 bg-zinc-800 text-white font-semibold'
                      : 'border-zinc-700 bg-zinc-900 text-white font-semibold'
                    : isDark
                    ? 'border-[#27272A] hover:border-zinc-600 text-zinc-200'
                    : 'border-[#E4E4E7] hover:border-zinc-400 text-zinc-800'
                } ${isDimmed ? 'opacity-30' : 'opacity-100'}`}
              >
                <span
                  className="w-2.5 h-1 rounded-[1px] shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="whitespace-nowrap">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-sans">
          {isolatedRunId && activeRun && (
            <>
              <button
                type="button"
                onClick={() => onInspectRun(activeRun.id)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[#10B981]/50 bg-[#10B981]/10 text-[#10B981] font-semibold hover:bg-[#10B981]/20 cursor-pointer"
              >
                <span>Open Run Detail</span>
                <ExternalLink className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setIsolatedRunId(null)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[#E4E4E7] dark:border-[#27272A] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
              >
                <FilterX className="w-3 h-3" />
                <span>Show All</span>
              </button>
            </>
          )}
          {!isolatedRunId && (
            <span className="text-zinc-500 dark:text-zinc-400">
              Click legend/line to isolate · Scroll over any vertical axis to zoom
            </span>
          )}
        </div>
      </div>

      <InteractiveChartViewport
        theme={theme}
        baseXDomain={{ min: 0, max: 100 }}
        baseYDomain={
          focusedAxisIdx === 'all'
            ? { min: 0, max: 100 }
            : BASE_AXES[focusedAxisIdx].base
        }
        resetKey={resetKey}
        showAxisLock={false}
        customWheelHandler={customWheelHandler}
        customResetHandler={resetAllAxes}
        customZoomInHandler={() => zoomSpecificOrAllAxes(focusedAxisIdx, 0.5, 0.72)}
        customZoomOutHandler={() => zoomSpecificOrAllAxes(focusedAxisIdx, 0.5, 1.38)}
        customZoomStatus={{
          isZoomed: isAnyAxisZoomed,
          label: zoomLabel,
        }}
        rangeSummaryOverride={
          focusedAxisIdx === 'all'
            ? isAnyAxisZoomed
              ? 'Custom Vertical Bounds'
              : 'All 5 Axes 100%'
            : `${axisDomains[focusedAxisIdx].min.toFixed(1)}–${axisDomains[focusedAxisIdx].max.toFixed(1)} ${BASE_AXES[focusedAxisIdx].unit}`
        }
        extraToolbarControls={
          <div className="relative z-40 flex items-center gap-1">
            <StudioSelect
              ariaLabel="Focused vertical axis for zoom controls"
              height="h-6"
              placement="top"
              value={focusedAxisIdx === 'all' ? 'all' : String(focusedAxisIdx)}
              onChange={(v) => {
                setFocusedAxisIdx(v === 'all' ? 'all' : Number(v));
              }}
              options={[
                { value: 'all', label: 'All Axes' },
                ...BASE_AXES.map((ax, idx) => ({
                  value: String(idx),
                  label: `Axis: ${ax.shortLabel}`,
                })),
              ]}
              className="w-28 sm:w-32"
            />
          </div>
        }
      >
        {(ctx) => {
          const handleDragPanVertical = (e: React.PointerEvent<SVGSVGElement>) => {
            // Drag pan vertical axis scale when dragging inside viewport
            if (!ctx.isDragging || Math.abs(e.movementY) === 0) return;
            const svgRect = svgRef.current?.getBoundingClientRect();
            const plotPx = Math.max(40, (svgRect?.height ?? 260) * (PLOT_H / SVG_H));
            const svgX = svgRect
              ? ((e.clientX - svgRect.left) / Math.max(1, svgRect.width)) * SVG_W
              : 0;
            let targetIdx: number | 'all' = focusedAxisIdx;
            if (focusedAxisIdx === 'all') {
              let bestDist = 65;
              X_POSITIONS.forEach((axX, idx) => {
                const d = Math.abs(svgX - axX);
                if (d < bestDist) {
                  bestDist = d;
                  targetIdx = idx;
                }
              });
            }
            setAxisDomains((prev) =>
              prev.map((dom, idx) =>
                targetIdx === 'all' || targetIdx === idx
                  ? panDomainByPixels(dom, -e.movementY, plotPx, BASE_AXES[idx].base)
                  : dom
              )
            );
          };

          const handleMouseMoveNearest = (e: React.MouseEvent<SVGSVGElement>) => {
            if (ctx.isDragging) return;
            const svgEl = svgRef.current;
            if (!svgEl) return;
            const rect = svgEl.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const mouseSx = e.clientX - rect.left;
            const mouseSy = e.clientY - rect.top;

            // Snap to nearest vertex marker across all plotted trajectories within 16px
            const candidates: ScreenPointCandidate<PsiRun>[] = [];
            runs.forEach((run) => {
              BASE_AXES.forEach((ax, i) => {
                const cySvg = normalizeY(ax.getValue(run), axisDomains[i]);
                candidates.push({
                  item: run,
                  sx: (X_POSITIONS[i] / SVG_W) * rect.width,
                  sy: (cySvg / SVG_H) * rect.height,
                });
              });
            });
            const hit = findNearestScreenPoint(candidates, mouseSx, mouseSy, 16);
            if (hit) {
              if (hoveredRunId !== hit.item.id) onHoverRun(hit.item.id);
            }
          };

          return (
            <div className="relative w-full">
              {activeRun && <RunTelemetryGlassTooltip theme={theme} run={activeRun} />}

              <svg
                ref={svgRef}
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                className="w-full h-auto"
                onPointerMove={handleDragPanVertical}
                onMouseMove={handleMouseMoveNearest}
                role="img"
                aria-label="Parallel Coordinates Multi-Axis Profile"
              >
                <defs>
                  <clipPath id={clipId}>
                    <rect
                      x={X_POSITIONS[0] - 18}
                      y={Y_TOP - 4}
                      width={X_POSITIONS[4] - X_POSITIONS[0] + 36}
                      height={PLOT_H + 8}
                    />
                  </clipPath>
                </defs>

                {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                  const y = Y_BOT - pct * PLOT_H;
                  return (
                    <line
                      key={pct}
                      x1={X_POSITIONS[0]}
                      y1={y}
                      x2={X_POSITIONS[4]}
                      y2={y}
                      stroke={gridStroke}
                      strokeDasharray="3 3"
                    />
                  );
                })}

                {BASE_AXES.map((ax, i) => {
                  const x = X_POSITIONS[i];
                  const dom = axisDomains[i];
                  const ticks = computeDesmosTicks(dom.min, dom.max, 5);
                  const isAxFocused = focusedAxisIdx === i;
                  const isAxZoomed = Math.abs(axisZoomRatios[i] - 1) > 0.03;

                  return (
                    <g
                      key={ax.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFocusedAxisIdx((prev) => (prev === i ? 'all' : i));
                      }}
                      className="cursor-pointer"
                    >
                      <line
                        x1={x}
                        y1={Y_TOP}
                        x2={x}
                        y2={Y_BOT}
                        stroke={isAxFocused || isAxZoomed ? '#10B981' : axisStroke}
                        strokeWidth={isAxFocused || isAxZoomed ? 2 : 1.25}
                      />
                      <text
                        x={x}
                        y={16}
                        textAnchor="middle"
                        fill={isAxFocused ? '#10B981' : textPrimary}
                        fontSize="11"
                        fontFamily="Inter, sans-serif"
                        fontWeight="600"
                      >
                        {ax.label}
                        {isAxZoomed ? ` (${axisZoomRatios[i].toFixed(1)}x)` : ''}
                      </text>

                      {/* Dynamic Desmos Ticks along each vertical axis */}
                      {ticks.ticks.map((tk, tIdx) => {
                        const y = normalizeY(tk, dom);
                        if (y < Y_TOP - 4 || y > Y_BOT + 4) return null;
                        return (
                          <g key={`pt-${ax.id}-${tk}`}>
                            <line
                              x1={x - 4}
                              y1={y}
                              x2={x + 4}
                              y2={y}
                              stroke={isAxFocused || isAxZoomed ? '#10B981' : axisStroke}
                              strokeWidth={1}
                            />
                            <text
                              x={x - 7}
                              y={y + 3}
                              textAnchor="end"
                              fill={axisStroke}
                              fontSize="9"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {ticks.labels[tIdx]}
                            </text>
                          </g>
                        );
                      })}

                      {/* Current min / max bounds footer */}
                      <text
                        x={x}
                        y={Y_BOT + 18}
                        textAnchor="middle"
                        fill={axisStroke}
                        fontSize="9"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {dom.min.toFixed(ticks.decimals)}–{dom.max.toFixed(ticks.decimals)}
                      </text>
                    </g>
                  );
                })}

                <g clipPath={`url(#${clipId})`}>
                  {runs.map((run, idx) => {
                    const vals = BASE_AXES.map((a) => a.getValue(run));
                    const color = RUN_COLORS[idx % RUN_COLORS.length];
                    const isFocused = activeRunId === run.id;
                    const isDimmed = activeRunId !== null && !isFocused;

                    return (
                      <g
                        key={run.id}
                        className={`cursor-pointer transition-opacity duration-150 ${
                          isDimmed ? 'opacity-20' : 'opacity-95'
                        }`}
                        onMouseEnter={() => onHoverRun(run.id)}
                        onMouseLeave={() => onHoverRun(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (ctx.wasRecentlyDragged()) return;
                          setIsolatedRunId((prev) => (prev === run.id ? null : run.id));
                        }}
                      >
                        {/* Invisible wide hit stroke for easy clicking */}
                        <polyline
                          fill="none"
                          stroke="transparent"
                          strokeWidth={12}
                          points={buildPoints(vals)}
                        />
                        <polyline
                          fill="none"
                          stroke={color}
                          strokeWidth={isFocused ? 3.5 : 2.1}
                          points={buildPoints(vals)}
                        />
                        {vals.map((v, i) => (
                          <circle
                            key={i}
                            cx={X_POSITIONS[i]}
                            cy={normalizeY(v, axisDomains[i])}
                            r={isFocused ? 5.2 : 3.6}
                            fill={color}
                            stroke={monoBg}
                            strokeWidth={1}
                          />
                        ))}
                      </g>
                    );
                  })}

                  {simVals && (
                    <g pointerEvents="none">
                      <polyline
                        fill="none"
                        stroke="#EF4444"
                        strokeWidth={2.75}
                        strokeDasharray="6 4"
                        points={buildPoints(simVals)}
                      />
                      {simVals.map((v, i) => (
                        <circle
                          key={i}
                          cx={X_POSITIONS[i]}
                          cy={normalizeY(v, axisDomains[i])}
                          r={4.5}
                          fill="#EF4444"
                          stroke={monoBg}
                          strokeWidth={1.5}
                        />
                      ))}
                    </g>
                  )}
                </g>
              </svg>
            </div>
          );
        }}
      </InteractiveChartViewport>
    </div>
  );
};
