import React, { useId, useMemo, useRef, useState } from 'react';
import { PsiRun, ThemeMode } from '../types/psi';
import {
  AxisDomain,
  computeAdaptiveMarkerStyle,
  findNearestScreenPoint,
  ScreenPointCandidate,
} from '../utils/chartViewportMath';
import {
  InteractiveChartViewport,
  RunTelemetryGlassTooltip,
} from './InteractiveChartViewport';

export interface ScatterPlotPoint {
  run: PsiRun;
  x: number;
  y: number;
  z?: number;
  predicted?: number;
  residual?: number;
  color: string;
}

interface InteractiveScatterPlotProps {
  theme: ThemeMode;
  mode: 'scatter' | 'bubble' | 'residual';
  resetKey: string;
  xLabel: string;
  yLabel: string;
  xUnit?: string;
  yUnit?: string;
  points: ScatterPlotPoint[];
  simPoint?: {
    x: number;
    y: number;
    label?: string;
  };
  hoveredRunId: string | null;
  onHoverRun: (runId: string | null) => void;
  onInspectRun: (runId: string) => void;
  legendText?: string;
  rightHintText?: string;
}

const SVG_W = 920;
const SVG_H = 324;
const X_LEFT = 74;
const X_RIGHT = 894;
const Y_TOP = 20;
const Y_BOT = 272;
const PLOT_W = X_RIGHT - X_LEFT;
const PLOT_H = Y_BOT - Y_TOP;

const PLOT_INSETS = {
  left: X_LEFT / SVG_W,
  right: (SVG_W - X_RIGHT) / SVG_W,
  top: Y_TOP / SVG_H,
  bottom: (SVG_H - Y_BOT) / SVG_H,
};

function computePaddedBounds(values: number[], includeZero = false): AxisDomain {
  if (values.length === 0) return { min: 0, max: 1 };
  const all = includeZero ? [0, ...values] : values;
  let min = Math.min(...all);
  let max = Math.max(...all);
  const span = Math.max(max - min, 0.25);
  const pad = span * 0.08;
  min = min - pad;
  max = max + pad;
  // Preserve natural zero lower bound when values are non-negative (e.g. airflow, spread)
  if (!includeZero && Math.min(...values) >= 0 && min < 0) {
    min = 0;
  }
  return { min, max };
}

export const InteractiveScatterPlot: React.FC<InteractiveScatterPlotProps> = ({
  theme,
  mode,
  resetKey,
  xLabel,
  yLabel,
  xUnit = '',
  yUnit = '',
  points,
  simPoint,
  hoveredRunId,
  onHoverRun,
  onInspectRun,
  legendText,
  rightHintText,
}) => {
  const isDark = theme === 'dark';
  const axisStroke = isDark ? '#A1A1AA' : '#52525B';
  const gridStroke = isDark ? 'rgba(255,255,255,0.08)' : '#E4E4E7';
  const textPrimary = isDark ? '#FAFAFA' : '#18181B';
  const haloColor = isDark ? '#09090B' : '#FFFFFF';
  const clipId = useId().replace(/:/g, '');

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [snappedPoint, setSnappedPoint] = useState<ScatterPlotPoint | null>(null);

  const baseXDomain = useMemo(() => {
    const xs = points.map((p) => p.x);
    if (simPoint) xs.push(simPoint.x);
    return computePaddedBounds(xs, false);
  }, [points, simPoint]);

  const baseYDomain = useMemo(() => {
    const ys = points.map((p) => p.y);
    if (simPoint) ys.push(simPoint.y);
    return computePaddedBounds(ys, mode === 'residual');
  }, [points, simPoint, mode]);

  const zBounds = useMemo(() => {
    const zs = points.map((p) => p.z ?? 0).filter((z) => z > 0);
    if (zs.length === 0) return { min: 0, max: 1 };
    return { min: Math.min(...zs), max: Math.max(...zs, Math.min(...zs) + 1) };
  }, [points]);

  return (
    <div className="space-y-2 relative">
      {(legendText || rightHintText) && (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A] text-xs">
          {legendText && <span className="font-sans text-zinc-500">{legendText}</span>}
          {rightHintText && (
            <span
              className={`font-sans text-[11px] font-semibold ${
                mode === 'residual' ? 'text-[#10B981]' : 'text-zinc-500'
              }`}
            >
              {rightHintText}
            </span>
          )}
        </div>
      )}

      <InteractiveChartViewport
        theme={theme}
        baseXDomain={baseXDomain}
        baseYDomain={baseYDomain}
        resetKey={resetKey}
        xUnit={xUnit}
        yUnit={yUnit}
        plotInsets={PLOT_INSETS}
      >
        {(ctx) => {
          const xSpan = Math.max(1e-9, ctx.xDomain.max - ctx.xDomain.min);
          const ySpan = Math.max(1e-9, ctx.yDomain.max - ctx.yDomain.min);

          const toSvgX = (val: number) => X_LEFT + ((val - ctx.xDomain.min) / xSpan) * PLOT_W;
          const toSvgY = (val: number) => Y_BOT - ((val - ctx.yDomain.min) / ySpan) * PLOT_H;

          const visiblePoints = points.filter(
            (p) =>
              p.x >= ctx.xDomain.min - xSpan * 0.06 &&
              p.x <= ctx.xDomain.max + xSpan * 0.06 &&
              p.y >= ctx.yDomain.min - ySpan * 0.06 &&
              p.y <= ctx.yDomain.max + ySpan * 0.06
          );

          const adaptive = computeAdaptiveMarkerStyle(
            visiblePoints.length,
            ctx.zoomRatio,
            mode === 'bubble' ? 6.2 : 4.4
          );

          const activeFocusId = snappedPoint?.run.id ?? hoveredRunId;

          const getPointRadius = (pt: ScatterPlotPoint) => {
            if (mode !== 'bubble') return adaptive.radius;
            const zNorm =
              ((pt.z ?? zBounds.min) - zBounds.min) /
              Math.max(1, zBounds.max - zBounds.min);
            return adaptive.radius * (0.65 + Math.sqrt(Math.max(0, zNorm)) * 1.45);
          };

          // Compute greedy non-overlapping Run ID labels when zoomed in or sparse
          const placedLabelBoxes: Array<{ x: number; y: number }> = [];
          const labeledIds = new Set<string>();
          if (adaptive.showLabels || activeFocusId) {
            const prioritySorted = [...visiblePoints].sort((a, b) => {
              if (a.run.id === activeFocusId) return -1;
              if (b.run.id === activeFocusId) return 1;
              return b.y - a.y;
            });
            for (const pt of prioritySorted) {
              if (labeledIds.size >= 24) break;
              const cx = toSvgX(pt.x);
              const cy = toSvgY(pt.y);
              if (cx < X_LEFT + 6 || cx > X_RIGHT - 30 || cy < Y_TOP + 10 || cy > Y_BOT - 6) {
                continue;
              }
              const overlaps = placedLabelBoxes.some(
                (b) => Math.abs(b.x - cx) < 76 && Math.abs(b.y - cy) < 15
              );
              if (!overlaps || pt.run.id === activeFocusId) {
                placedLabelBoxes.push({ x: cx, y: cy });
                labeledIds.add(pt.run.id);
              }
            }
          }

          const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
            if (ctx.isDragging) return;
            const svgEl = svgRef.current;
            if (!svgEl) return;
            const rect = svgEl.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            const mouseSx = e.clientX - rect.left;
            const mouseSy = e.clientY - rect.top;

            const candidates: ScreenPointCandidate<ScatterPlotPoint>[] = visiblePoints.map((pt) => {
              const cxSvg = toSvgX(pt.x);
              const cySvg = toSvgY(pt.y);
              return {
                item: pt,
                sx: (cxSvg / SVG_W) * rect.width,
                sy: (cySvg / SVG_H) * rect.height,
              };
            });

            const nearest = findNearestScreenPoint(candidates, mouseSx, mouseSy, 16);
            if (nearest) {
              if (snappedPoint?.run.id !== nearest.item.run.id) {
                setSnappedPoint(nearest.item);
              }
              if (hoveredRunId !== nearest.item.run.id) {
                onHoverRun(nearest.item.run.id);
              }
            } else if (snappedPoint !== null) {
              setSnappedPoint(null);
              onHoverRun(null);
            }
          };

          const handleSvgMouseLeave = () => {
            if (snappedPoint !== null) setSnappedPoint(null);
            if (hoveredRunId !== null) onHoverRun(null);
          };

          const handleSvgClick = () => {
            if (ctx.wasRecentlyDragged()) return;
            if (snappedPoint) {
              onInspectRun(snappedPoint.run.id);
            }
          };

          const zeroY =
            mode === 'residual' && ctx.yDomain.min <= 0 && ctx.yDomain.max >= 0
              ? toSvgY(0)
              : null;

          const tooltipExtra =
            snappedPoint && mode === 'residual'
              ? [
                  {
                    label: 'Model Pred',
                    value: `${(snappedPoint.predicted ?? 0).toFixed(2)} mm/s`,
                  },
                  {
                    label: 'Residual',
                    value: `${(snappedPoint.residual ?? 0) >= 0 ? '+' : ''}${(snappedPoint.residual ?? 0).toFixed(2)} mm/s`,
                  },
                ]
              : snappedPoint && mode === 'bubble'
              ? [
                  {
                    label: 'IR Flux',
                    value: `${Math.round(snappedPoint.z ?? 0)} W/m²`,
                  },
                ]
              : undefined;

          return (
            <div className="relative w-full">
              {snappedPoint && (
                <RunTelemetryGlassTooltip
                  theme={theme}
                  run={snappedPoint.run}
                  extraMetrics={tooltipExtra}
                />
              )}

              <svg
                ref={svgRef}
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                className={`w-full h-auto ${snappedPoint ? 'cursor-pointer' : ''}`}
                onMouseMove={handleSvgMouseMove}
                onMouseLeave={handleSvgMouseLeave}
                onClick={handleSvgClick}
                role="img"
                aria-label={`${xLabel} vs. ${yLabel} interactive chart`}
              >
                <defs>
                  <clipPath id={clipId}>
                    <rect x={X_LEFT} y={Y_TOP} width={PLOT_W} height={PLOT_H} />
                  </clipPath>
                </defs>

                {/* Dynamic Desmos Gridlines */}
                {ctx.xTicks.ticks.map((tk) => {
                  const x = toSvgX(tk);
                  if (x < X_LEFT - 1 || x > X_RIGHT + 1) return null;
                  return (
                    <line
                      key={`xg-${tk}`}
                      x1={x}
                      y1={Y_TOP}
                      x2={x}
                      y2={Y_BOT}
                      stroke={gridStroke}
                      strokeDasharray="3 3"
                    />
                  );
                })}
                {ctx.yTicks.ticks.map((tk) => {
                  const y = toSvgY(tk);
                  if (y < Y_TOP - 1 || y > Y_BOT + 1) return null;
                  return (
                    <line
                      key={`yg-${tk}`}
                      x1={X_LEFT}
                      y1={y}
                      x2={X_RIGHT}
                      y2={y}
                      stroke={gridStroke}
                      strokeDasharray="3 3"
                    />
                  );
                })}

                {/* Clipped Plot Contents */}
                <g clipPath={`url(#${clipId})`}>
                  {zeroY !== null && (
                    <line
                      x1={X_LEFT}
                      y1={zeroY}
                      x2={X_RIGHT}
                      y2={zeroY}
                      stroke="#10B981"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                    />
                  )}

                  {/* Archive Data Points with Adaptive Radii, Translucency & 1px Halos */}
                  {visiblePoints.map((pt) => {
                    const cx = toSvgX(pt.x);
                    const cy = toSvgY(pt.y);
                    const r = getPointRadius(pt);
                    const isActive = activeFocusId === pt.run.id;
                    const isDimmed = activeFocusId !== null && !isActive;

                    return (
                      <g key={pt.run.id}>
                        {isActive && (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={r + 5}
                            fill="none"
                            stroke={pt.color}
                            strokeWidth={2}
                            opacity={0.95}
                          />
                        )}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isActive ? r + 1.8 : r}
                          fill={pt.color}
                          fillOpacity={isActive ? 0.98 : isDimmed ? adaptive.dimOpacity : adaptive.fillOpacity}
                          stroke={haloColor}
                          strokeWidth={isActive ? 1.5 : adaptive.haloWidth}
                        />
                        {labeledIds.has(pt.run.id) && (
                          <text
                            x={cx + r + 4}
                            y={cy + 3.5}
                            fill={isActive ? textPrimary : axisStroke}
                            fontSize={isActive ? '10.5' : '9.5'}
                            fontWeight={isActive ? '700' : '500'}
                            fontFamily="JetBrains Mono, monospace"
                            opacity={isDimmed ? 0.35 : 0.92}
                            pointerEvents="none"
                          >
                            {pt.run.runCode || pt.run.psiId.split(' ')[0]}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Active Virtual Test Point Diamond */}
                  {simPoint && (() => {
                    const sx = toSvgX(simPoint.x);
                    const sy = toSvgY(simPoint.y);
                    return (
                      <g pointerEvents="none">
                        <line
                          x1={sx}
                          y1={Y_TOP}
                          x2={sx}
                          y2={Y_BOT}
                          stroke={textPrimary}
                          strokeWidth={1}
                          strokeDasharray="3 3"
                          opacity={0.45}
                        />
                        <line
                          x1={X_LEFT}
                          y1={sy}
                          x2={X_RIGHT}
                          y2={sy}
                          stroke={textPrimary}
                          strokeWidth={1}
                          strokeDasharray="3 3"
                          opacity={0.45}
                        />
                        <polygon
                          points={`${sx},${sy - 7} ${sx + 7},${sy} ${sx},${sy + 7} ${sx - 7},${sy}`}
                          fill={textPrimary}
                          stroke={haloColor}
                          strokeWidth={2}
                        />
                        {simPoint.label && (
                          <text
                            x={sx + 10}
                            y={sy - 6}
                            fill={textPrimary}
                            fontSize="10"
                            fontWeight="700"
                            fontFamily="Inter, sans-serif"
                          >
                            {simPoint.label}
                          </text>
                        )}
                      </g>
                    );
                  })()}
                </g>

                {/* Crisp X & Y Axes & Dynamically Rescaled Desmos Tick Labels */}
                <line x1={X_LEFT} y1={Y_BOT} x2={X_RIGHT} y2={Y_BOT} stroke={axisStroke} />
                <line x1={X_LEFT} y1={Y_TOP} x2={X_LEFT} y2={Y_BOT} stroke={axisStroke} />

                {ctx.xTicks.ticks.map((tk, idx) => {
                  const x = toSvgX(tk);
                  if (x < X_LEFT - 2 || x > X_RIGHT + 2) return null;
                  return (
                    <g key={`xt-${tk}`}>
                      <line x1={x} y1={Y_BOT} x2={x} y2={Y_BOT + 5} stroke={axisStroke} />
                      <text
                        x={x}
                        y={Y_BOT + 18}
                        textAnchor="middle"
                        fill={axisStroke}
                        fontSize="10.5"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {ctx.xTicks.labels[idx]}
                      </text>
                    </g>
                  );
                })}

                {ctx.yTicks.ticks.map((tk, idx) => {
                  const y = toSvgY(tk);
                  if (y < Y_TOP - 2 || y > Y_BOT + 2) return null;
                  return (
                    <g key={`yt-${tk}`}>
                      <line x1={X_LEFT - 5} y1={y} x2={X_LEFT} y2={y} stroke={axisStroke} />
                      <text
                        x={X_LEFT - 9}
                        y={y + 3.5}
                        textAnchor="end"
                        fill={axisStroke}
                        fontSize="10.5"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {ctx.yTicks.labels[idx]}
                      </text>
                    </g>
                  );
                })}

                {/* Axis Titles */}
                <text
                  x={(X_LEFT + X_RIGHT) / 2}
                  y={SVG_H - 10}
                  textAnchor="middle"
                  fill={axisStroke}
                  fontSize="11"
                  fontFamily="Inter, sans-serif"
                  fontWeight="600"
                >
                  {xUnit ? `${xLabel} (${xUnit})` : xLabel}
                </text>
                <text
                  x={16}
                  y={(Y_TOP + Y_BOT) / 2}
                  textAnchor="middle"
                  fill={axisStroke}
                  fontSize="11"
                  fontFamily="Inter, sans-serif"
                  fontWeight="600"
                  transform={`rotate(-90 16 ${(Y_TOP + Y_BOT) / 2})`}
                >
                  {yUnit ? `${yLabel} (${yUnit})` : yLabel}
                </text>
              </svg>
            </div>
          );
        }}
      </InteractiveChartViewport>
    </div>
  );
};
