import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Minus, Plus } from 'lucide-react';
import { HazardOutcome, PsiRun, ThemeMode } from '../types/psi';
import {
  AxisDomain,
  AxisLockMode,
  computeDesmosTicks,
  computeZoomReadout,
  NiceTicksResult,
  normalizeDomain,
  panDomainByPixels,
  zoomDomainAroundValue,
} from '../utils/chartViewportMath';

export interface ChartViewportRenderContext {
  xDomain: AxisDomain;
  yDomain: AxisDomain;
  xTicks: NiceTicksResult;
  yTicks: NiceTicksResult;
  zoomRatio: number;
  xZoomRatio: number;
  yZoomRatio: number;
  isZoomed: boolean;
  isModified: boolean;
  lockMode: AxisLockMode;
  isDragging: boolean;
  wasRecentlyDragged: () => boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  setXDomain: React.Dispatch<React.SetStateAction<AxisDomain>>;
  setYDomain: React.Dispatch<React.SetStateAction<AxisDomain>>;
}

export interface PlotInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface InteractiveChartViewportProps {
  theme: ThemeMode;
  baseXDomain: AxisDomain;
  baseYDomain: AxisDomain;
  resetKey?: string;
  defaultLockMode?: AxisLockMode;
  showAxisLock?: boolean;
  xTickCount?: number;
  yTickCount?: number;
  integerX?: boolean;
  integerY?: boolean;
  xUnit?: string;
  yUnit?: string;
  rangeSummaryOverride?: string;
  plotInsets?: PlotInsets;
  minHeightClass?: string;
  extraToolbarControls?: React.ReactNode;
  customResetHandler?: () => void;
  customZoomInHandler?: () => void;
  customZoomOutHandler?: () => void;
  customWheelHandler?: (e: WheelEvent, rect: DOMRect) => boolean;
  customZoomStatus?: {
    isZoomed: boolean;
    label: string;
  };
  children: (ctx: ChartViewportRenderContext) => React.ReactNode;
}

const DEFAULT_INSETS: PlotInsets = {
  left: 0.08,
  right: 0.04,
  top: 0.05,
  bottom: 0.14,
};

export const InteractiveChartViewport: React.FC<InteractiveChartViewportProps> = ({
  theme,
  baseXDomain,
  baseYDomain,
  resetKey = '',
  defaultLockMode = 'xy',
  showAxisLock = true,
  xTickCount = 6,
  yTickCount = 6,
  integerX = false,
  integerY = false,
  xUnit = '',
  yUnit = '',
  rangeSummaryOverride,
  plotInsets = DEFAULT_INSETS,
  minHeightClass = '',
  extraToolbarControls,
  customResetHandler,
  customZoomInHandler,
  customZoomOutHandler,
  customWheelHandler,
  customZoomStatus,
  children,
}) => {
  const isDark = theme === 'dark';

  const normBaseX = useMemo(
    () => normalizeDomain(baseXDomain.min, baseXDomain.max),
    [baseXDomain.min, baseXDomain.max]
  );
  const normBaseY = useMemo(
    () => normalizeDomain(baseYDomain.min, baseYDomain.max),
    [baseYDomain.min, baseYDomain.max]
  );

  const [xDomain, setXDomain] = useState<AxisDomain>(normBaseX);
  const [yDomain, setYDomain] = useState<AxisDomain>(normBaseY);
  const [lockMode, setLockMode] = useState<AxisLockMode>(defaultLockMode);
  const [isDragging, setIsDragging] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    moved: boolean;
    lastX: number;
    lastY: number;
    startX: number;
    startY: number;
  }>({
    active: false,
    moved: false,
    lastX: 0,
    lastY: 0,
    startX: 0,
    startY: 0,
  });
  const lastDragTimestampRef = useRef<number>(0);

  // Sync base bounds only when mode/dataset key changes or bounds reset meaningfully
  const prevResetKeyRef = useRef<string>(resetKey);
  const prevBaseSignatureRef = useRef<string>(
    `${normBaseX.min.toFixed(4)}|${normBaseX.max.toFixed(4)}|${normBaseY.min.toFixed(4)}|${normBaseY.max.toFixed(4)}`
  );

  useEffect(() => {
    const nextSig = `${normBaseX.min.toFixed(4)}|${normBaseX.max.toFixed(4)}|${normBaseY.min.toFixed(4)}|${normBaseY.max.toFixed(4)}`;
    if (
      prevResetKeyRef.current !== resetKey ||
      prevBaseSignatureRef.current !== nextSig
    ) {
      prevResetKeyRef.current = resetKey;
      prevBaseSignatureRef.current = nextSig;
      setXDomain(normBaseX);
      setYDomain(normBaseY);
    }
  }, [resetKey, normBaseX, normBaseY]);

  useEffect(() => {
    setLockMode(defaultLockMode);
  }, [defaultLockMode]);

  const xDomainRef = useRef(xDomain);
  const yDomainRef = useRef(yDomain);
  const lockModeRef = useRef(lockMode);
  xDomainRef.current = xDomain;
  yDomainRef.current = yDomain;
  lockModeRef.current = lockMode;

  const resetView = useCallback(() => {
    setXDomain(normBaseX);
    setYDomain(normBaseY);
    customResetHandler?.();
  }, [normBaseX, normBaseY, customResetHandler]);

  const zoomAtNormalizedPoint = useCallback(
    (u: number, v: number, factor: number) => {
      const mode = lockModeRef.current;
      if (mode !== 'y') {
        setXDomain((prev) => {
          const anchorX = prev.min + u * (prev.max - prev.min);
          return zoomDomainAroundValue(prev, anchorX, factor, normBaseX);
        });
      }
      if (mode !== 'x') {
        setYDomain((prev) => {
          const anchorY = prev.min + (1 - v) * (prev.max - prev.min);
          return zoomDomainAroundValue(prev, anchorY, factor, normBaseY);
        });
      }
    },
    [normBaseX, normBaseY]
  );

  const zoomIn = useCallback(() => {
    if (customZoomInHandler) {
      customZoomInHandler();
      return;
    }
    zoomAtNormalizedPoint(0.5, 0.5, 0.72);
  }, [zoomAtNormalizedPoint, customZoomInHandler]);

  const zoomOut = useCallback(() => {
    if (customZoomOutHandler) {
      customZoomOutHandler();
      return;
    }
    zoomAtNormalizedPoint(0.5, 0.5, 1.38);
  }, [zoomAtNormalizedPoint, customZoomOutHandler]);

  // Native non-passive wheel listener so outer page never scrolls when zooming inside chart
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (toolbarRef.current && toolbarRef.current.contains(e.target as Node)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      if (customWheelHandler && customWheelHandler(e, rect)) {
        return;
      }

      const plotLeft = rect.left + rect.width * plotInsets.left;
      const plotWidth = Math.max(20, rect.width * (1 - plotInsets.left - plotInsets.right));
      const plotTop = rect.top + rect.height * plotInsets.top;
      const plotHeight = Math.max(20, rect.height * (1 - plotInsets.top - plotInsets.bottom));

      const u = Math.max(0, Math.min(1, (e.clientX - plotLeft) / plotWidth));
      const v = Math.max(0, Math.min(1, (e.clientY - plotTop) / plotHeight));

      const deltaNorm = Math.max(-0.45, Math.min(0.45, e.deltaY * 0.0018));
      const factor = Math.exp(deltaNorm);
      zoomAtNormalizedPoint(u, v, factor);
    };

    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleNativeWheel);
    };
  }, [plotInsets, zoomAtNormalizedPoint, customWheelHandler]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (toolbarRef.current && toolbarRef.current.contains(e.target as Node)) {
      return;
    }
    dragStateRef.current = {
      active: true,
      moved: false,
      lastX: e.clientX,
      lastY: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st.active) return;

    const totalDx = e.clientX - st.startX;
    const totalDy = e.clientY - st.startY;
    if (!st.moved && Math.hypot(totalDx, totalDy) > 3) {
      st.moved = true;
      setIsDragging(true);
    }
    if (!st.moved) return;

    const dx = e.clientX - st.lastX;
    const dy = e.clientY - st.lastY;
    st.lastX = e.clientX;
    st.lastY = e.clientY;

    const rect = stageRef.current?.getBoundingClientRect();
    const plotW = Math.max(40, (rect?.width ?? 760) * (1 - plotInsets.left - plotInsets.right));
    const plotH = Math.max(40, (rect?.height ?? 300) * (1 - plotInsets.top - plotInsets.bottom));

    if (lockModeRef.current !== 'y' && dx !== 0) {
      setXDomain((prev) => panDomainByPixels(prev, dx, plotW, normBaseX));
    }
    if (lockModeRef.current !== 'x' && dy !== 0) {
      // Negative screen Y corresponds to positive mathematical Y drag
      setYDomain((prev) => panDomainByPixels(prev, -dy, plotH, normBaseY));
    }
  };

  const finishDrag = () => {
    if (dragStateRef.current.moved) {
      lastDragTimestampRef.current = Date.now();
    }
    dragStateRef.current.active = false;
    dragStateRef.current.moved = false;
    setIsDragging(false);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (toolbarRef.current && toolbarRef.current.contains(e.target as Node)) {
      return;
    }
    resetView();
  };

  const wasRecentlyDragged = useCallback(() => {
    return Date.now() - lastDragTimestampRef.current < 160;
  }, []);

  const xTicks = useMemo(
    () => computeDesmosTicks(xDomain.min, xDomain.max, xTickCount, integerX),
    [xDomain.min, xDomain.max, xTickCount, integerX]
  );
  const yTicks = useMemo(
    () => computeDesmosTicks(yDomain.min, yDomain.max, yTickCount, integerY),
    [yDomain.min, yDomain.max, yTickCount, integerY]
  );

  const readout = useMemo(
    () => computeZoomReadout(normBaseX, xDomain, normBaseY, yDomain, lockMode),
    [normBaseX, xDomain, normBaseY, yDomain, lockMode]
  );

  const xZoomRatio =
    Math.max(1e-9, normBaseX.max - normBaseX.min) /
    Math.max(1e-9, xDomain.max - xDomain.min);
  const yZoomRatio =
    Math.max(1e-9, normBaseY.max - normBaseY.min) /
    Math.max(1e-9, yDomain.max - yDomain.min);

  const effectiveZoomLabel = customZoomStatus?.label ?? readout.label;
  const effectiveIsModified =
    Boolean(customZoomStatus?.isZoomed) || readout.isModified;

  const activeRangeText =
    rangeSummaryOverride ??
    `${xDomain.min.toFixed(xTicks.decimals)}–${xDomain.max.toFixed(xTicks.decimals)}${xUnit ? ` ${xUnit}` : ''}${yUnit ? ` · ${yDomain.min.toFixed(yTicks.decimals)}–${yDomain.max.toFixed(yTicks.decimals)} ${yUnit}` : ''}`;

  const cycleAxisLock = () => {
    setLockMode((prev) =>
      prev === 'xy' ? 'x' : prev === 'x' ? 'y' : 'xy'
    );
  };

  const lockLabel =
    lockMode === 'xy' ? 'XY' : lockMode === 'x' ? 'X-Only' : 'Y-Only';

  return (
    <div
      ref={stageRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onPointerLeave={finishDrag}
      onDoubleClick={handleDoubleClick}
      className={`relative select-none pb-11 ${minHeightClass} ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      {children({
        xDomain,
        yDomain,
        xTicks,
        yTicks,
        zoomRatio: readout.zoomRatio,
        xZoomRatio,
        yZoomRatio,
        isZoomed: readout.isZoomed,
        isModified: effectiveIsModified,
        lockMode,
        isDragging,
        wasRecentlyDragged,
        zoomIn,
        zoomOut,
        resetView,
        setXDomain,
        setYDomain,
      })}

      {/* Compact Bottom-Right Floating Desmos Zoom Toolbar */}
      <div
        ref={toolbarRef}
        onPointerDown={(e) => e.stopPropagation()}
        className={`absolute bottom-1 right-1 z-20 focus-within:z-40 hover:z-40 inline-flex flex-wrap items-center gap-1 px-1.5 py-1 rounded-lg border backdrop-blur-md shadow-md cursor-default ${
          isDark
            ? 'bg-[#18181B]/92 border-[#27272A] text-[#FAFAFA]'
            : 'bg-white/94 border-[#E4E4E7] text-[#18181B]'
        }`}
      >
        {extraToolbarControls && (
          <div className="flex items-center pr-1 mr-0.5 border-r border-[#E4E4E7] dark:border-[#27272A]">
            {extraToolbarControls}
          </div>
        )}

        <button
          type="button"
          onClick={zoomOut}
          aria-label="Zoom out"
          title="Zoom Out (or scroll down)"
          className={`h-7 w-7 inline-flex items-center justify-center rounded-md border transition-all duration-150 active:scale-[0.95] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
            isDark
              ? 'border-[#27272A] hover:bg-zinc-800 text-zinc-200'
              : 'border-[#E4E4E7] hover:bg-zinc-100 text-zinc-700'
          }`}
        >
          <Minus className="w-3 h-3" />
        </button>

        <div
          className="px-2 py-0.5 text-[11px] font-sans font-medium flex items-center gap-1.5 whitespace-nowrap"
          title={`Active Domain: ${activeRangeText} (Double-click plot to reset)`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-[1px] shrink-0 ${
              effectiveIsModified ? 'bg-[#10B981]' : 'bg-zinc-400'
            }`}
          />
          <span className="font-mono tabular-nums font-semibold">
            {effectiveZoomLabel}
          </span>
          {effectiveIsModified && (
            <span className="hidden sm:inline font-mono tabular-nums text-[10px] text-zinc-500 dark:text-zinc-400">
              ({activeRangeText})
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={zoomIn}
          aria-label="Zoom in"
          title="Zoom In (or scroll up)"
          className={`h-7 w-7 inline-flex items-center justify-center rounded-md border transition-all duration-150 active:scale-[0.95] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
            isDark
              ? 'border-[#27272A] hover:bg-zinc-800 text-zinc-200'
              : 'border-[#E4E4E7] hover:bg-zinc-100 text-zinc-700'
          }`}
        >
          <Plus className="w-3 h-3" />
        </button>

        {showAxisLock && (
          <button
            type="button"
            onClick={cycleAxisLock}
            aria-label="Axis lock mode"
            title="Cycle axis lock: XY, X-Only, or Y-Only"
            className={`h-7 px-2 inline-flex items-center justify-center text-[10.5px] font-sans font-semibold rounded-md border transition-all duration-150 active:scale-[0.95] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
              lockMode !== 'xy'
                ? 'border-[#F59E0B]/60 bg-[#F59E0B]/12 text-[#F59E0B]'
                : isDark
                ? 'border-[#27272A] hover:bg-zinc-800 text-zinc-300'
                : 'border-[#E4E4E7] hover:bg-zinc-100 text-zinc-700'
            }`}
          >
            {lockLabel}
          </button>
        )}

        <button
          type="button"
          onClick={resetView}
          aria-label="Reset zoom view"
          title="Reset to 100% default bounds (or double-click canvas)"
          className={`h-7 px-2 inline-flex items-center gap-1 text-[10.5px] font-sans font-semibold rounded-md border transition-all duration-150 active:scale-[0.95] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
            effectiveIsModified
              ? 'border-[#10B981] bg-[#10B981]/15 text-[#10B981] hover:bg-[#10B981]/25'
              : isDark
              ? 'border-[#27272A] hover:bg-zinc-800 text-zinc-400'
              : 'border-[#E4E4E7] hover:bg-zinc-100 text-zinc-500'
          }`}
        >
          <Crosshair className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
};

export interface RunTelemetryTooltipProps {
  theme: ThemeMode;
  run: PsiRun;
  extraMetrics?: Array<{ label: string; value: string }>;
}

function getRegimeColorClass(outcome: HazardOutcome): string {
  if (outcome === 'Rapid Flame Spread') return 'text-[#EF4444]';
  if (outcome === 'Cool Flame Caution') return 'text-[#F59E0B]';
  return 'text-[#10B981]';
}

export const RunTelemetryGlassTooltip: React.FC<RunTelemetryTooltipProps> = ({
  theme,
  run,
  extraMetrics,
}) => {
  const isDark = theme === 'dark';
  return (
    <div
      className={`pointer-events-none absolute top-2 right-2 z-30 max-w-[360px] px-3 py-2.5 rounded-lg border backdrop-blur-md shadow-xl text-xs transition-all duration-150 ${
        isDark
          ? 'bg-[#18181B]/90 border-[#27272A] text-[#FAFAFA]'
          : 'bg-white/92 border-[#E4E4E7] text-[#18181B]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono font-semibold text-xs truncate">
          {run.runCode ? `${run.runCode} · ${run.psiId}` : run.psiId}
        </span>
        <span
          className={`text-[11px] font-sans font-semibold shrink-0 ${getRegimeColorClass(
            run.outcome
          )}`}
        >
          ● {run.outcome}
        </span>
      </div>
      <div className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
        {run.investigationTitle || run.material} · {run.facility}
      </div>
      <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 font-mono text-[10.5px] tabular-nums">
        <div>
          <span className="font-sans text-zinc-400">O₂: </span>
          <span className="font-semibold">{run.O2_pct.toFixed(1)}%</span>
        </div>
        <div>
          <span className="font-sans text-zinc-400">Air: </span>
          <span className="font-semibold">{run.Flow_ms.toFixed(2)} m/s</span>
        </div>
        <div>
          <span className="font-sans text-zinc-400">Temp: </span>
          <span className="font-semibold">{Math.round(run.peakTemp_K)} K</span>
        </div>
        <div>
          <span className="font-sans text-zinc-400">Spread: </span>
          <span className="font-semibold">{run.flameSpread_mms.toFixed(2)}</span>
        </div>
      </div>
      {extraMetrics && extraMetrics.length > 0 && (
        <div className="mt-1 pt-1 border-t border-[#E4E4E7] dark:border-[#27272A] flex flex-wrap gap-3 font-mono text-[10.5px] tabular-nums">
          {extraMetrics.map((m) => (
            <span key={m.label}>
              <span className="font-sans text-zinc-400">{m.label}: </span>
              <span className="font-semibold">{m.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
