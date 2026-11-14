import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Activity,
  ShieldCheck,
  SlidersHorizontal,
  Info,
  RotateCcw,
  ArrowUpDown,
} from 'lucide-react';
import {
  EnvironmentPreset,
  EnvironmentPresetId,
  MaterialCandidate,
  PsiRun,
  SimulationResponse,
  ThemeMode,
  VizMode,
} from '../types/psi';
import { ENVIRONMENT_PRESETS } from '../data/baselineRuns';
import { computeFlameSpreadVelocity } from '../utils/physicsEngine';

interface VisualizationStageProps {
  theme: ThemeMode;
  vizMode: VizMode;
  onChangeVizMode: (mode: VizMode) => void;
  activePresetId: EnvironmentPresetId | null;
  onSelectPreset: (preset: EnvironmentPreset) => void;
  sliders: {
    O2_pct: number;
    P_psi: number;
    Flow_ms: number;
    g_eff: number;
    Thickness_mm: number;
  };
  onChangeSlider: (
    key: 'O2_pct' | 'P_psi' | 'Flow_ms' | 'g_eff' | 'Thickness_mm',
    value: number
  ) => void;
  onResetSliders: () => void;
  onUpdateSlidersFromMap: (O2_pct: number, Flow_ms: number) => void;
  simulation: SimulationResponse;
  selectedRuns: PsiRun[];
  hoveredRunId: string | null;
  onHoverRun: (runId: string | null) => void;
  hoveredMaterialId: string | null;
  onHoverMaterial: (matCode: string | null) => void;
  onInspectRun: (psiIdOrRunId: string) => void;
}

interface GlassTooltipState {
  title: string;
  subtitle?: string;
  metrics: Array<{ label: string; value: string }>;
  status?: string;
}

const VIZ_TABS: Array<{
  id: VizMode;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    id: 'safety-map',
    label: 'Oxygen vs. Airflow Safety Map',
    icon: Crosshair,
  },
  {
    id: 'multi-variable',
    label: 'Multi-Variable Comparison Chart',
    icon: SlidersHorizontal,
  },
  {
    id: 'material-safety',
    label: 'Material Safety Comparison',
    icon: ShieldCheck,
  },
  {
    id: 'sensor-timeline',
    label: 'Temperature & Sensor Timeline',
    icon: Activity,
  },
];

const RUN_STROKE_COLORS = ['#10B981', '#F59E0B', '#A855F7', '#EC4899'];

type MaterialSortKey =
  | 'flameSpread_mms'
  | 'limitingO2_pct'
  | 'smokeClumpingIndex'
  | 'coolFlameRiskIndex';

export const VisualizationStage: React.FC<VisualizationStageProps> = ({
  theme,
  vizMode,
  onChangeVizMode,
  activePresetId,
  onSelectPreset,
  sliders,
  onChangeSlider,
  onResetSliders,
  onUpdateSlidersFromMap,
  simulation,
  selectedRuns,
  hoveredRunId,
  onHoverRun,
  hoveredMaterialId,
  onHoverMaterial,
  onInspectRun,
}) => {
  const [showEquations, setShowEquations] = useState(false);
  const [hoveredTimelineIdx, setHoveredTimelineIdx] = useState<number | null>(
    null
  );
  const [tooltip, setTooltip] = useState<GlassTooltipState | null>(null);
  const [matSortKey, setMatSortKey] =
    useState<MaterialSortKey>('flameSpread_mms');
  const [matSortAsc, setMatSortAsc] = useState<boolean>(false);

  const isDark = theme === 'dark';

  const cardSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const dividerBorder = isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]';
  const axisTextFill = isDark ? '#A1A1AA' : '#52525B';
  const gridStroke = isDark ? 'rgba(255,255,255,0.08)' : '#E4E4E7';

  const activeMonochrome = isDark
    ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
    : 'bg-[#18181B] text-[#FFFFFF] font-semibold';

  const inactiveMonochrome = isDark
    ? 'text-zinc-400 hover:text-zinc-100'
    : 'text-zinc-600 hover:text-zinc-950';

  const sliderConfigs = [
    {
      key: 'O2_pct' as const,
      label: 'O2 %',
      fullLabel: 'Oxygen Concentration',
      min: 14.0,
      max: 85.0,
      step: 0.5,
      value: sliders.O2_pct,
      formatted: `${sliders.O2_pct.toFixed(1)}%`,
    },
    {
      key: 'P_psi' as const,
      label: 'Pressure psi',
      fullLabel: 'Cabin Pressure',
      min: 4.3,
      max: 14.7,
      step: 0.1,
      value: sliders.P_psi,
      formatted: `${sliders.P_psi.toFixed(1)} psi`,
    },
    {
      key: 'Flow_ms' as const,
      label: 'Airflow m/s',
      fullLabel: 'Airflow Velocity',
      min: 0.0,
      max: 0.5,
      step: 0.01,
      value: sliders.Flow_ms,
      formatted: `${sliders.Flow_ms.toFixed(2)} m/s`,
    },
    {
      key: 'g_eff' as const,
      label: 'Gravity g',
      fullLabel: 'Gravity Level',
      min: 0.0,
      max: 1.0,
      step: 0.002,
      value: sliders.g_eff,
      formatted: `${sliders.g_eff.toFixed(3)}g`,
    },
    {
      key: 'Thickness_mm' as const,
      label: 'Thickness mm',
      fullLabel: 'Material Thickness',
      min: 0.2,
      max: 10.0,
      step: 0.1,
      value: sliders.Thickness_mm,
      formatted: `${sliders.Thickness_mm.toFixed(1)} mm`,
    },
  ];

  // Precompute 2D Heatmap Grid for Mode 1 (Oxygen vs. Airflow Safety Map)
  const safetyGrid = useMemo(() => {
    const cols = 28;
    const rows = 13;
    const cells: Array<{
      c: number;
      r: number;
      o2: number;
      flow: number;
      spread: number;
      status: string;
      fill: string;
    }> = [];

    for (let r = 0; r < rows; r++) {
      const flow = Number((0.5 * (1 - r / (rows - 1))).toFixed(3));
      for (let c = 0; c < cols; c++) {
        const o2 = Number((14 + (c / (cols - 1)) * (85 - 14)).toFixed(1));
        const res = computeFlameSpreadVelocity({
          O2_pct: o2,
          P_psi: sliders.P_psi,
          Flow_ms: flow,
          g_eff: sliders.g_eff,
          Thickness_mm: sliders.Thickness_mm,
        });

        let fill = '#10B981';
        let alpha = isDark ? 0.26 : 0.22;
        if (res.hazardStatus === 'Rapid Flame Spread') {
          fill = '#EF4444';
          alpha = Math.min(0.8, 0.26 + (res.flameSpread_mms / 6.0) * 0.5);
        } else if (res.hazardStatus === 'Cool Flame Caution') {
          fill = '#F59E0B';
          alpha = isDark ? 0.42 : 0.34;
        }

        cells.push({
          c,
          r,
          o2,
          flow,
          spread: res.flameSpread_mms,
          status: res.hazardStatus,
          fill:
            fill === '#EF4444'
              ? `rgba(239, 68, 68, ${alpha.toFixed(2)})`
              : fill === '#F59E0B'
              ? `rgba(245, 158, 11, ${alpha.toFixed(2)})`
              : `rgba(16, 185, 129, ${alpha.toFixed(2)})`,
        });
      }
    }
    return { cols, rows, cells };
  }, [sliders.P_psi, sliders.g_eff, sliders.Thickness_mm, isDark]);

  const sortedMaterials = useMemo(() => {
    const copy = [...simulation.materialRankings];
    copy.sort((a, b) => {
      const diff = a[matSortKey] - b[matSortKey];
      return matSortAsc ? diff : -diff;
    });
    return copy;
  }, [simulation.materialRankings, matSortKey, matSortAsc]);

  const handleSortMaterials = (key: MaterialSortKey) => {
    if (matSortKey === key) {
      setMatSortAsc((prev) => !prev);
    } else {
      setMatSortKey(key);
      setMatSortAsc(false);
    }
  };

  const hazardTone =
    simulation.hazardStatus === 'Rapid Flame Spread'
      ? {
          color: 'text-[#EF4444]',
          badgeBg: 'bg-[#EF4444]/15 text-[#EF4444] hover:bg-[#EF4444]/25',
          shortLabel: 'Rapid Spread',
        }
      : simulation.hazardStatus === 'Cool Flame Caution'
      ? {
          color: 'text-[#F59E0B]',
          badgeBg: 'bg-[#F59E0B]/15 text-[#F59E0B] hover:bg-[#F59E0B]/25',
          shortLabel: 'Cool Flame',
        }
      : {
          color: 'text-[#10B981]',
          badgeBg: 'bg-[#10B981]/15 text-[#10B981] hover:bg-[#10B981]/25',
          shortLabel: 'Self-Quench',
        };

  const matchedPsiId = simulation.nearestRuns[0]?.run.psiId.split(' ')[0] ?? 'PSI-99';

  return (
    <div className="space-y-2">
      {/* 1. Compact Single-Row Environment Parameters Bar (with Presets + Reset on Right) */}
      <section
        className={`border rounded-[6px] px-3.5 py-1.5 transition-colors duration-150 ${cardSurface}`}
        aria-label="Environment Parameter Controls"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              Environment Parameters
            </span>
            <span className="hidden sm:inline text-zinc-300 dark:text-zinc-700">
              ·
            </span>
            <span className="hidden sm:inline text-zinc-500 dark:text-zinc-400">
              Live boundary-layer physics calibration
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div
              className={`flex items-center p-0.5 rounded-[5px] border ${
                isDark
                  ? 'bg-[#18181B] border-[#27272A]'
                  : 'bg-zinc-100 border-[#E4E4E7]'
              }`}
              role="group"
              aria-label="Environment Presets"
            >
              {ENVIRONMENT_PRESETS.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSelectPreset(preset)}
                    className={`px-2 py-0.5 text-[11px] rounded-[4px] transition-colors duration-150 whitespace-nowrap cursor-pointer ${
                      isActive ? activeMonochrome : inactiveMonochrome
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onResetSliders}
              className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-[4px] border transition-colors cursor-pointer ${
                isDark
                  ? 'border-[#27272A] text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800'
                  : 'border-[#E4E4E7] text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {sliderConfigs.map((cfg) => (
            <div
              key={cfg.key}
              className={`px-2.5 py-1 rounded-[4px] border ${
                isDark
                  ? 'bg-[#09090B]/70 border-[#27272A]'
                  : 'bg-zinc-50/80 border-[#E4E4E7]'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] mb-1">
                <label
                  htmlFor={`slider-${cfg.key}`}
                  className="font-sans font-medium text-zinc-600 dark:text-zinc-300"
                >
                  {cfg.label}
                </label>
                <span className="font-mono font-bold text-[11px] tabular-nums">
                  {cfg.formatted}
                </span>
              </div>
              <input
                id={`slider-${cfg.key}`}
                aria-label={cfg.fullLabel}
                type="range"
                min={cfg.min}
                max={cfg.max}
                step={cfg.step}
                value={cfg.value}
                onChange={(e) =>
                  onChangeSlider(cfg.key, parseFloat(e.target.value))
                }
                className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-[2px] appearance-none cursor-pointer accent-zinc-900 dark:accent-zinc-100"
              />
            </div>
          ))}
        </div>
      </section>

      {/* 2. Unified Vercel-Style Connected 4-KPI Strip + Dynamic Visualization Stage */}
      <section
        className={`border rounded-[6px] overflow-hidden transition-colors duration-150 ${cardSurface}`}
      >
        {/* Top Connected 4-Cell KPI Metric Strip (26px Tabular Numerals + Clickable PSI ID Badge) */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x border-b ${
            isDark
              ? 'divide-[#27272A] border-[#27272A]'
              : 'divide-[#E4E4E7] border-[#E4E4E7]'
          }`}
        >
          {/* Cell 1: Flame Spread Speed */}
          <div className="px-4 py-2.5 relative flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-sans font-medium text-zinc-500 dark:text-zinc-400">
              <span>Flame Spread Speed</span>
              <span className="font-mono text-[11px] tabular-nums">95% CI</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-[26px] leading-none font-bold tracking-tight transition-all duration-300">
                {simulation.flameSpread_mms.toFixed(2)}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                ± {simulation.confidenceInterval_mms.toFixed(2)} mm/s
              </span>
            </div>
            <div
              className={`absolute bottom-0 left-0 right-0 h-[2px] ${
                isDark ? 'bg-[#FAFAFA]' : 'bg-[#18181B]'
              }`}
            />
          </div>

          {/* Cell 2: Hazard Status + Clickable Matched PSI ID Badge */}
          <div className="px-4 py-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-sans font-medium text-zinc-500 dark:text-zinc-400">
              <span>Hazard Status</span>
              <span className="font-mono text-[11px] tabular-nums">
                T_peak: {simulation.peakTemp_K}K
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span
                className={`font-sans text-[24px] leading-none font-bold tracking-tight ${hazardTone.color}`}
              >
                {hazardTone.shortLabel}
              </span>
              <button
                type="button"
                onClick={() => onInspectRun(matchedPsiId)}
                className={`px-2 py-0.5 text-[11px] font-mono font-semibold rounded-[4px] transition-colors cursor-pointer ${hazardTone.badgeBg}`}
              >
                {matchedPsiId} ↗
              </button>
            </div>
          </div>

          {/* Cell 3: 10s Growth Forecast */}
          <div className="px-4 py-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-sans font-medium text-zinc-500 dark:text-zinc-400">
              <span>10s Growth Forecast</span>
              <span className="font-mono text-[11px] tabular-nums">t + 10s</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2 font-mono tabular-nums">
              <span className="text-[26px] leading-none font-bold tracking-tight">
                {simulation.forecast10s.radius_mm.toFixed(1)}
                <span className="text-xs font-normal text-zinc-500 ml-1">
                  mm
                </span>
              </span>
              <span className="px-2 py-0.5 text-[11px] rounded-[4px] bg-amber-500/15 text-[#F59E0B] font-semibold">
                +{simulation.forecast10s.pressureRise_kPa.toFixed(2)} kPa
              </span>
            </div>
          </div>

          {/* Cell 4: Safe Material Thickness */}
          <div className="px-4 py-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-sans font-medium text-zinc-500 dark:text-zinc-400">
              <span>Safe Material Thickness</span>
              <span className="font-mono text-[11px] tabular-nums">
                Now: {sliders.Thickness_mm.toFixed(1)} mm
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2 font-mono tabular-nums">
              <span className="text-[26px] leading-none font-bold tracking-tight">
                ≥ {simulation.safeMaterialCheck.minSafeThickness_mm.toFixed(1)}
                <span className="text-xs font-normal text-zinc-500 ml-1">
                  mm
                </span>
              </span>
              <span
                className={`px-2 py-0.5 text-[11px] font-bold rounded-[4px] ${
                  simulation.safeMaterialCheck.passed
                    ? 'bg-[#10B981]/15 text-[#10B981]'
                    : 'bg-[#EF4444]/15 text-[#EF4444]'
                }`}
              >
                {simulation.safeMaterialCheck.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
          </div>
        </div>

        {/* Visualization Mode Tabs + Headline-First Banner */}
        <div className={`px-4 py-2.5 border-b ${dividerBorder} space-y-2`}>
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-1 p-1 rounded-[5px] border ${
              isDark
                ? 'bg-[#09090B] border-[#27272A]'
                : 'bg-zinc-100 border-[#E4E4E7]'
            }`}
            role="tablist"
            aria-label="Visualization Mode Selector"
          >
            {VIZ_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = vizMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onChangeVizMode(tab.id)}
                  className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-sans rounded-[4px] transition-colors duration-150 whitespace-nowrap cursor-pointer ${
                    active ? activeMonochrome : inactiveMonochrome
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <p className="text-xs font-sans font-medium text-zinc-700 dark:text-zinc-200 leading-snug">
                {simulation.headlineTakeaway[vizMode]}
              </p>
            </div>

            <button
              type="button"
              aria-expanded={showEquations}
              onClick={() => setShowEquations((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-sans font-medium rounded-[4px] border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isDark
                  ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800'
                  : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              <span>View Governing Equations</span>
              {showEquations ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {showEquations && (
            <div
              className={`pt-2.5 border-t ${dividerBorder} grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px]`}
            >
              <div
                className={`p-2.5 rounded-[4px] border ${
                  isDark
                    ? 'bg-[#09090B] border-[#27272A]'
                    : 'bg-zinc-50 border-[#E4E4E7]'
                }`}
              >
                <div className="font-sans font-semibold text-zinc-900 dark:text-zinc-100">
                  1. Forced-Flow Flame Spread
                </div>
                <div className="mt-1 font-mono text-zinc-500 dark:text-zinc-400">
                  V_f = V_0 · ((Y_O2 - Y_lim)/Y_ref)^1.48 · (P/P_0)^0.42 ·
                  Φ(U_flow, g_eff) · (δ_0/δ)^0.58
                </div>
              </div>
              <div
                className={`p-2.5 rounded-[4px] border ${
                  isDark
                    ? 'bg-[#09090B] border-[#27272A]'
                    : 'bg-zinc-50 border-[#E4E4E7]'
                }`}
              >
                <div className="font-sans font-semibold text-[#F59E0B]">
                  2. Cool-Flame NTC Regime
                </div>
                <div className="mt-1 font-mono text-zinc-500 dark:text-zinc-400">
                  550K ≤ T_gas ≤ 800K when Q_rad &gt; Q_chem(hot); partial
                  oxidation yields CO + CH2O at 0% visible emission.
                </div>
              </div>
              <div
                className={`p-2.5 rounded-[4px] border ${
                  isDark
                    ? 'bg-[#09090B] border-[#27272A]'
                    : 'bg-zinc-50 border-[#E4E4E7]'
                }`}
              >
                <div className="font-sans font-semibold text-[#10B981]">
                  3. Conductive Quenching Bound
                </div>
                <div className="mt-1 font-mono text-zinc-500 dark:text-zinc-400">
                  δ_safe = δ_0 · (q_gas_feedback / q_solid_cond)^(1/0.58) →
                  Self-extinguishes when V_f &lt; 0.48 mm/s.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Interactive Visualization Canvas */}
        <div
          className="px-4 py-3 relative"
          onMouseLeave={() => {
            setTooltip(null);
            onHoverRun(null);
            onHoverMaterial(null);
          }}
        >
          {/* Floating Glass HTML Tooltip (Replaces native browser titles) */}
          {tooltip && (
            <div
              className={`pointer-events-none absolute top-3 right-5 z-30 px-3 py-2 rounded-md border backdrop-blur-md shadow-lg text-xs transition-all duration-150 ${
                isDark
                  ? 'bg-[#18181B]/95 border-[#27272A] text-[#FAFAFA]'
                  : 'bg-white/95 border-[#E4E4E7] text-[#18181B]'
              }`}
            >
              <div className="font-sans font-semibold flex items-center justify-between gap-4">
                <span>{tooltip.title}</span>
                {tooltip.status && (
                  <span
                    className={`text-[11px] font-semibold ${
                      tooltip.status.includes('Rapid')
                        ? 'text-[#EF4444]'
                        : tooltip.status.includes('Cool')
                        ? 'text-[#F59E0B]'
                        : 'text-[#10B981]'
                    }`}
                  >
                    ● {tooltip.status}
                  </span>
                )}
              </div>
              {tooltip.subtitle && (
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {tooltip.subtitle}
                </div>
              )}
              <div className="mt-1.5 flex items-center gap-3 font-mono text-[11px] tabular-nums">
                {tooltip.metrics.map((m) => (
                  <span key={m.label}>
                    <span className="text-zinc-400 font-sans">{m.label}: </span>
                    <span className="font-semibold">{m.value}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 1: OXYGEN VS. AIRFLOW SAFETY MAP */}
          {vizMode === 'safety-map' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-sans text-zinc-500 dark:text-zinc-400">
                  Click any coordinate cell to animate Oxygen % and Airflow
                  sliders, or click a PSI marker to open the Run Detail
                  Inspector.
                </span>
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
                  <span className="inline-flex items-center gap-1.5 pl-2 border-l border-zinc-300 dark:border-zinc-700 font-semibold text-zinc-800 dark:text-zinc-200">
                    <span className="w-4 h-0 border-t-2 border-dashed border-zinc-800 dark:border-zinc-200" />
                    <span className="font-mono">0.05–0.20 m/s</span>
                    <span>O₂ Replenishment Zone</span>
                  </span>
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <svg
                  viewBox="0 0 920 315"
                  className="w-full h-auto min-w-[680px] select-none cursor-crosshair"
                  role="img"
                  aria-label="Oxygen vs. Airflow Safety Map 2D Contour Grid"
                >
                  {/* Plot area: x=68..890 (width 822), y=12..270 (height 258) */}
                  {safetyGrid.cells.map((cell) => {
                    const cellW = 822 / safetyGrid.cols;
                    const cellH = 258 / safetyGrid.rows;
                    const x = 68 + cell.c * cellW;
                    const y = 12 + cell.r * cellH;
                    return (
                      <rect
                        key={`${cell.c}-${cell.r}`}
                        x={x}
                        y={y}
                        width={cellW - 1}
                        height={cellH - 1}
                        fill={cell.fill}
                        className="transition-opacity duration-200 hover:opacity-85"
                        onMouseEnter={() =>
                          setTooltip({
                            title: 'Boundary-Layer Coordinate',
                            metrics: [
                              { label: 'O₂', value: `${cell.o2.toFixed(1)}%` },
                              {
                                label: 'Airflow',
                                value: `${cell.flow.toFixed(2)} m/s`,
                              },
                              {
                                label: 'Spread',
                                value: `${cell.spread.toFixed(2)} mm/s`,
                              },
                            ],
                            status: cell.status,
                          })
                        }
                        onClick={() => onUpdateSlidersFromMap(cell.o2, cell.flow)}
                      />
                    );
                  })}

                  {/* Dashed Boundary Lines for 0.05–0.20 m/s Replenishment Zone */}
                  {(() => {
                    const yTop = 12 + (1 - 0.2 / 0.5) * 258;
                    const yBot = 12 + (1 - 0.05 / 0.5) * 258;
                    return (
                      <rect
                        x={68}
                        y={yTop}
                        width={822}
                        height={yBot - yTop}
                        fill="none"
                        stroke={isDark ? '#FAFAFA' : '#18181B'}
                        strokeWidth={1.25}
                        strokeDasharray="6 4"
                        opacity={0.7}
                        pointerEvents="none"
                      />
                    );
                  })()}

                  {/* Plotted Selected PSI Runs (Clickable to open Run Detail Inspector) */}
                  {selectedRuns.map((run) => {
                    const cx =
                      68 +
                      Math.max(0, Math.min(1, (run.O2_pct - 14) / (85 - 14))) *
                        822;
                    const cy =
                      12 +
                      Math.max(0, Math.min(1, 1 - run.Flow_ms / 0.5)) * 258;
                    const isDimmed =
                      hoveredRunId !== null && hoveredRunId !== run.id;

                    return (
                      <g
                        key={run.id}
                        className={`cursor-pointer transition-opacity duration-200 ${
                          isDimmed ? 'opacity-30' : 'opacity-100'
                        }`}
                        onMouseEnter={() => {
                          onHoverRun(run.id);
                          setTooltip({
                            title: run.psiId,
                            subtitle: `${run.material} · ${run.facility}`,
                            metrics: [
                              {
                                label: 'O₂',
                                value: `${run.O2_pct.toFixed(1)}%`,
                              },
                              {
                                label: 'Flow',
                                value: `${run.Flow_ms.toFixed(2)} m/s`,
                              },
                              {
                                label: 'Spread',
                                value: `${run.flameSpread_mms.toFixed(2)} mm/s`,
                              },
                            ],
                            status: run.outcome,
                          });
                        }}
                        onClick={() => onInspectRun(run.id)}
                      >
                        <rect
                          x={cx - 5}
                          y={cy - 5}
                          width={10}
                          height={10}
                          fill={isDark ? '#18181B' : '#FFFFFF'}
                          stroke={isDark ? '#FAFAFA' : '#18181B'}
                          strokeWidth={2}
                        />
                        <text
                          x={cx + 8}
                          y={cy + 3.5}
                          fill={isDark ? '#FAFAFA' : '#18181B'}
                          fontSize="10.5"
                          fontFamily="JetBrains Mono, monospace"
                          fontWeight="700"
                        >
                          {run.psiId.split(' ')[0]}
                        </text>
                      </g>
                    );
                  })}

                  {/* Active Slider Crosshair Marker (Fluid CSS transitions) */}
                  {(() => {
                    const cx =
                      68 +
                      Math.max(
                        0,
                        Math.min(1, (sliders.O2_pct - 14) / (85 - 14))
                      ) *
                        822;
                    const cy =
                      12 +
                      Math.max(0, Math.min(1, 1 - sliders.Flow_ms / 0.5)) * 258;
                    const accent = isDark ? '#FAFAFA' : '#18181B';
                    const boxX = Math.min(745, Math.max(75, cx - 68));
                    const boxY = cy > 55 ? cy - 32 : cy + 12;
                    return (
                      <g
                        pointerEvents="none"
                        className="transition-all duration-300 ease-out"
                      >
                        <line
                          x1={cx}
                          y1={12}
                          x2={cx}
                          y2={270}
                          stroke={accent}
                          strokeWidth={1.25}
                          strokeDasharray="3 3"
                        />
                        <line
                          x1={68}
                          y1={cy}
                          x2={890}
                          y2={cy}
                          stroke={accent}
                          strokeWidth={1.25}
                          strokeDasharray="3 3"
                        />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={6}
                          fill={accent}
                          stroke={isDark ? '#09090B' : '#FFFFFF'}
                          strokeWidth={2}
                        />
                        <rect
                          x={boxX}
                          y={boxY}
                          width={136}
                          height={21}
                          rx={3}
                          fill={isDark ? '#09090B' : '#18181B'}
                          stroke={isDark ? '#52525B' : '#18181B'}
                          strokeWidth={1}
                        />
                        <text
                          x={boxX + 68}
                          y={boxY + 14}
                          textAnchor="middle"
                          fill="#FAFAFA"
                          fontSize="10"
                          fontFamily="JetBrains Mono, monospace"
                          fontWeight="700"
                        >
                          {`ACTIVE: ${simulation.flameSpread_mms.toFixed(2)} mm/s`}
                        </text>
                      </g>
                    );
                  })()}

                  {/* Axes */}
                  <line
                    x1={68}
                    y1={270}
                    x2={890}
                    y2={270}
                    stroke={axisTextFill}
                    strokeWidth={1}
                  />
                  <line
                    x1={68}
                    y1={12}
                    x2={68}
                    y2={270}
                    stroke={axisTextFill}
                    strokeWidth={1}
                  />

                  {[14, 21, 34, 50, 68, 85].map((o2Tick) => {
                    const x = 68 + ((o2Tick - 14) / (85 - 14)) * 822;
                    return (
                      <g key={o2Tick}>
                        <line
                          x1={x}
                          y1={270}
                          x2={x}
                          y2={275}
                          stroke={axisTextFill}
                        />
                        <text
                          x={x}
                          y={288}
                          textAnchor="middle"
                          fill={axisTextFill}
                          fontSize="10"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {o2Tick}%
                        </text>
                      </g>
                    );
                  })}

                  {[0.0, 0.1, 0.2, 0.3, 0.4, 0.5].map((flowTick) => {
                    const y = 12 + (1 - flowTick / 0.5) * 258;
                    return (
                      <g key={flowTick}>
                        <line
                          x1={63}
                          y1={y}
                          x2={68}
                          y2={y}
                          stroke={axisTextFill}
                        />
                        <text
                          x={58}
                          y={y + 3}
                          textAnchor="end"
                          fill={axisTextFill}
                          fontSize="10"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {flowTick.toFixed(2)}
                        </text>
                      </g>
                    );
                  })}

                  <text
                    x={479}
                    y={308}
                    textAnchor="middle"
                    fill={axisTextFill}
                    fontSize="11"
                    fontFamily="Inter, sans-serif"
                    fontWeight="600"
                  >
                    Oxygen Concentration (O₂ %)
                  </text>
                  <text
                    x={16}
                    y={141}
                    textAnchor="middle"
                    fill={axisTextFill}
                    fontSize="11"
                    fontFamily="Inter, sans-serif"
                    fontWeight="600"
                    transform="rotate(-90 16 141)"
                  >
                    Airflow Velocity (m/s)
                  </text>
                </svg>
              </div>
            </div>
          )}

          {/* VIEW 2: MULTI-VARIABLE COMPARISON CHART */}
          {vizMode === 'multi-variable' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-sans text-zinc-500 dark:text-zinc-400">
                  Hover any run to brush across coordinates, or click a PSI
                  badge to open the Run Detail Inspector.
                </span>
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 font-sans font-semibold text-[#EF4444]">
                    <span className="w-4 h-0 border-t-2 border-dashed border-[#EF4444]" />
                    <span>Active Simulator State</span>
                  </span>
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
                        className={`inline-flex items-center gap-1.5 font-mono transition-opacity duration-200 cursor-pointer hover:underline ${
                          isDimmed ? 'opacity-30' : 'opacity-100'
                        }`}
                      >
                        <span
                          className="w-3 h-1 rounded-[1px]"
                          style={{
                            backgroundColor:
                              RUN_STROKE_COLORS[idx % RUN_STROKE_COLORS.length],
                          }}
                        />
                        <span>{run.psiId}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <svg
                  viewBox="0 0 920 310"
                  className="w-full h-auto min-w-[680px]"
                  role="img"
                  aria-label="Multi-Variable Comparison Parallel Axes Chart"
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
                        max: 5.0,
                        unit: 'mm/s',
                      },
                    ];
                    const xPositions = [100, 290, 480, 670, 840];
                    const yTop = 38;
                    const yBot = 268;

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

                    const simVals = [
                      sliders.O2_pct,
                      sliders.P_psi,
                      sliders.Flow_ms,
                      simulation.peakTemp_K,
                      simulation.flameSpread_mms,
                    ];

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
                                y={18}
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

                        {/* Historical PSI Runs */}
                        {selectedRuns.map((run, idx) => {
                          const vals = [
                            run.O2_pct,
                            run.P_psi,
                            run.Flow_ms,
                            run.peakTemp_K,
                            run.flameSpread_mms,
                          ];
                          const color =
                            RUN_STROKE_COLORS[idx % RUN_STROKE_COLORS.length];
                          const isDimmed =
                            hoveredRunId !== null && hoveredRunId !== run.id;

                          return (
                            <g
                              key={run.id}
                              className={`cursor-pointer transition-opacity duration-200 ${
                                isDimmed ? 'opacity-30' : 'opacity-90'
                              }`}
                              onMouseEnter={() => {
                                onHoverRun(run.id);
                                setTooltip({
                                  title: run.psiId,
                                  subtitle: `${run.material} · ${run.facility}`,
                                  metrics: [
                                    {
                                      label: 'O₂',
                                      value: `${run.O2_pct.toFixed(1)}%`,
                                    },
                                    {
                                      label: 'Temp',
                                      value: `${run.peakTemp_K}K`,
                                    },
                                    {
                                      label: 'Spread',
                                      value: `${run.flameSpread_mms.toFixed(
                                        2
                                      )} mm/s`,
                                    },
                                  ],
                                  status: run.outcome,
                                });
                              }}
                              onClick={() => onInspectRun(run.id)}
                            >
                              <polyline
                                fill="none"
                                stroke={color}
                                strokeWidth={hoveredRunId === run.id ? 3 : 2}
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

                        {/* Dashed High-Contrast Trajectory Line for Active Simulator State */}
                        <g className="transition-all duration-300 ease-out">
                          <polyline
                            fill="none"
                            stroke="#EF4444"
                            strokeWidth={2.75}
                            strokeDasharray="6 4"
                            points={buildPoints(simVals)}
                          />
                          {simVals.map((v, i) => {
                            const cy = normalize(v, axes[i].min, axes[i].max);
                            const labelText =
                              i === 2
                                ? v.toFixed(2)
                                : i === 3
                                ? Math.round(v)
                                : v.toFixed(1);
                            const haloColor = isDark ? '#121215' : '#FFFFFF';
                            return (
                              <g key={i}>
                                <circle
                                  cx={xPositions[i]}
                                  cy={cy}
                                  r={5}
                                  fill="#EF4444"
                                  stroke={isDark ? '#09090B' : '#FFFFFF'}
                                  strokeWidth={1.5}
                                />
                                <text
                                  x={xPositions[i] + 8}
                                  y={cy}
                                  dy="-10"
                                  fill="none"
                                  stroke={haloColor}
                                  strokeWidth={4}
                                  strokeLinejoin="round"
                                  fontSize="10"
                                  fontFamily="JetBrains Mono, monospace"
                                  fontWeight="700"
                                  aria-hidden="true"
                                >
                                  {labelText}
                                </text>
                                <text
                                  x={xPositions[i] + 8}
                                  y={cy}
                                  dy="-10"
                                  fill="#EF4444"
                                  fontSize="10"
                                  fontFamily="JetBrains Mono, monospace"
                                  fontWeight="700"
                                >
                                  {labelText}
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          )}

          {/* VIEW 3: MATERIAL SAFETY COMPARISON (DUAL-LAYER COMPARATIVE MATERIAL MATRIX — NO RADAR CHART) */}
          {vizMode === 'material-safety' && (
            <div className="space-y-4">
              {/* Top Layer: 4 Small-Multiple Horizontal Bullet Charts (4-Column Grid) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {[
                  {
                    id: 'spread',
                    title: 'Flame Spread Speed (mm/s)',
                    thresholdLabel: '0.48 mm/s Quench Limit',
                    thresholdPct: (0.48 / 3.5) * 100,
                    getValue: (m: MaterialCandidate) =>
                      `${m.flameSpread_mms.toFixed(2)}`,
                    getBarPct: (m: MaterialCandidate) =>
                      Math.min(100, (m.flameSpread_mms / 3.5) * 100),
                    getBarColor: (m: MaterialCandidate) =>
                      m.flameSpread_mms >= 0.48 ? 'bg-[#EF4444]' : 'bg-[#10B981]',
                  },
                  {
                    id: 'loi',
                    title: 'Limiting Oxygen Index (% O2)',
                    thresholdLabel: `Cabin ${sliders.O2_pct.toFixed(0)}% O₂`,
                    thresholdPct: Math.min(
                      96,
                      Math.max(10, (sliders.O2_pct / 40) * 100)
                    ),
                    getValue: (m: MaterialCandidate) =>
                      `${m.limitingO2_pct.toFixed(1)}%`,
                    getBarPct: (m: MaterialCandidate) =>
                      Math.min(100, (m.limitingO2_pct / 40) * 100),
                    getBarColor: (m: MaterialCandidate) =>
                      sliders.O2_pct >= m.limitingO2_pct
                        ? 'bg-[#EF4444]'
                        : 'bg-[#10B981]',
                  },
                  {
                    id: 'smoke',
                    title: 'Smoke Aggregation Index (0-100)',
                    thresholdLabel: '60 Soot Limit',
                    thresholdPct: 60,
                    getValue: (m: MaterialCandidate) =>
                      `${m.smokeClumpingIndex}`,
                    getBarPct: (m: MaterialCandidate) => m.smokeClumpingIndex,
                    getBarColor: (m: MaterialCandidate) =>
                      m.smokeClumpingIndex >= 60
                        ? 'bg-[#F59E0B]'
                        : isDark
                        ? 'bg-zinc-300'
                        : 'bg-zinc-700',
                  },
                  {
                    id: 'coolflame',
                    title: 'Cool-Flame Persistence Risk (0-100)',
                    thresholdLabel: '65 NTC Threshold',
                    thresholdPct: 65,
                    getValue: (m: MaterialCandidate) =>
                      `${m.coolFlameRiskIndex}`,
                    getBarPct: (m: MaterialCandidate) => m.coolFlameRiskIndex,
                    getBarColor: (m: MaterialCandidate) =>
                      m.coolFlameRiskIndex >= 65
                        ? 'bg-[#F59E0B]'
                        : 'bg-[#10B981]',
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
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="text-xs font-sans font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {panel.title}
                      </span>
                    </div>
                    <div className="text-[10px] font-sans text-zinc-400 mb-2 flex items-center justify-between gap-2">
                      <span className="truncate">Candidate Substrate</span>
                      <span className="font-mono shrink-0 text-right">
                        {panel.thresholdLabel}
                      </span>
                    </div>

                    <div className="space-y-2 relative">
                      {simulation.materialRankings.map((mat) => {
                        const isDimmed =
                          hoveredMaterialId !== null &&
                          hoveredMaterialId !== mat.code;
                        return (
                          <div
                            key={mat.code}
                            onMouseEnter={() => onHoverMaterial(mat.code)}
                            onMouseLeave={() => onHoverMaterial(null)}
                            className={`space-y-0.5 transition-opacity duration-200 cursor-pointer ${
                              isDimmed ? 'opacity-30' : 'opacity-100'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-sans font-medium truncate">
                                {mat.name}
                              </span>
                              <span className="font-mono font-semibold tabular-nums">
                                {panel.getValue(mat)}
                              </span>
                            </div>
                            <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-[2px] relative overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ease-out ${panel.getBarColor(
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

              {/* Bottom Layer: Tufte-Style Sparkline & Safety Matrix Table */}
              <div
                className={`border rounded-[5px] overflow-hidden ${dividerBorder}`}
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
                      <th className="py-2 px-3">Spacecraft Material</th>
                      <th className="py-2 px-3">
                        <button
                          type="button"
                          onClick={() =>
                            handleSortMaterials('flameSpread_mms')
                          }
                          className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                        >
                          <span>Flame Spread (mm/s)</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2 px-3">
                        <button
                          type="button"
                          onClick={() => handleSortMaterials('limitingO2_pct')}
                          className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                        >
                          <span>LOI (% O₂)</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2 px-3">Min Quench Thickness</th>
                      <th className="py-2 px-3">
                        Smoke / Toxicity / Cool-Flame Micro-Bars
                      </th>
                      <th className="py-2 px-3 text-right">
                        Cabin Qualification
                      </th>
                    </tr>
                  </thead>
                  <tbody
                    className={`divide-y ${
                      isDark ? 'divide-[#27272A]' : 'divide-[#E4E4E7]'
                    }`}
                  >
                    {sortedMaterials.map((mat) => {
                      const isDimmed =
                        hoveredMaterialId !== null &&
                        hoveredMaterialId !== mat.code;
                      const minThick = Math.max(
                        0.4,
                        Number(
                          (
                            simulation.safeMaterialCheck.minSafeThickness_mm *
                            (mat.flameSpread_mms /
                              Math.max(simulation.flameSpread_mms, 0.1))
                          ).toFixed(1)
                        )
                      );
                      const passesCabin =
                        sliders.O2_pct < mat.limitingO2_pct &&
                        mat.flameSpread_mms < 0.55;

                      return (
                        <tr
                          key={mat.code}
                          onMouseEnter={() => onHoverMaterial(mat.code)}
                          onMouseLeave={() => onHoverMaterial(null)}
                          className={`transition-opacity duration-200 ${
                            isDimmed ? 'opacity-30' : 'opacity-100'
                          } ${
                            isDark
                              ? 'hover:bg-white/[0.02]'
                              : 'hover:bg-zinc-50/80'
                          }`}
                        >
                          <td className="py-2 px-3 font-sans font-semibold">
                            {mat.name}
                            <span className="ml-2 font-mono text-[10px] font-normal text-zinc-400">
                              {mat.code}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono font-bold tabular-nums">
                            {mat.flameSpread_mms.toFixed(2)} mm/s
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums">
                            {mat.limitingO2_pct.toFixed(1)}%
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums">
                            ≥ {minThick.toFixed(1)} mm
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-3 font-mono text-[10px] tabular-nums">
                              <div className="w-20">
                                <div className="flex justify-between text-zinc-400">
                                  <span className="font-sans">Smoke</span>
                                  <span>{mat.smokeClumpingIndex}</span>
                                </div>
                                <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded-[1px] overflow-hidden">
                                  <div
                                    className="h-full bg-zinc-600 dark:bg-zinc-300 transition-all duration-300"
                                    style={{
                                      width: `${mat.smokeClumpingIndex}%`,
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="w-20">
                                <div className="flex justify-between text-zinc-400">
                                  <span className="font-sans">Toxic</span>
                                  <span>{mat.toxicGasYieldIndex}</span>
                                </div>
                                <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded-[1px] overflow-hidden">
                                  <div
                                    className="h-full bg-[#F59E0B] transition-all duration-300"
                                    style={{
                                      width: `${mat.toxicGasYieldIndex}%`,
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="w-20">
                                <div className="flex justify-between text-zinc-400">
                                  <span className="font-sans">Cool</span>
                                  <span>{mat.coolFlameRiskIndex}</span>
                                </div>
                                <div className="h-1 bg-zinc-200 dark:bg-zinc-800 rounded-[1px] overflow-hidden">
                                  <div
                                    className="h-full bg-[#10B981] transition-all duration-300"
                                    style={{
                                      width: `${mat.coolFlameRiskIndex}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            <span
                              className={`inline-block px-2 py-0.5 text-[11px] font-bold rounded-[4px] ${
                                passesCabin
                                  ? 'bg-[#10B981]/15 text-[#10B981]'
                                  : 'bg-[#EF4444]/15 text-[#EF4444]'
                              }`}
                            >
                              {passesCabin ? 'PASS' : 'FAIL'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW 4: TEMPERATURE & SENSOR TIMELINE */}
          {vizMode === 'sensor-timeline' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-4 text-[11px] font-sans font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3.5 h-0.5 bg-[#EF4444]" />
                    <span>T_gas (K)</span>
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
                    <span>
                      550K–800K Cool-Flame Bifurcation Zone
                    </span>
                  </span>
                </div>

                {hoveredTimelineIdx !== null &&
                  simulation.timelineSeries[hoveredTimelineIdx] && (
                    <div className="font-mono text-[11px] tabular-nums font-semibold">
                      t = {simulation.timelineSeries[hoveredTimelineIdx].time_s}s
                      · T_gas:{' '}
                      {simulation.timelineSeries[hoveredTimelineIdx].temp_K}K ·
                      IR Flux:{' '}
                      {
                        simulation.timelineSeries[hoveredTimelineIdx]
                          .irFlux_Wm2
                      }{' '}
                      W/m² · Visible Emission:{' '}
                      {
                        simulation.timelineSeries[hoveredTimelineIdx]
                          .opticalVisibility_pct
                      }
                      %
                    </div>
                  )}
              </div>

              <div className="w-full overflow-x-auto">
                <svg
                  viewBox="0 0 920 310"
                  className="w-full h-auto min-w-[680px]"
                  role="img"
                  aria-label="Temperature, IR Flux, and Visible Emission Sensor Timeline"
                >
                  {(() => {
                    const xLeft = 66;
                    const xRight = 890;
                    const yTop = 18;
                    const yBot = 268;
                    const w = xRight - xLeft;
                    const h = yBot - yTop;

                    const xTime = (t: number) => xLeft + (t / 120) * w;
                    const yTemp = (k: number) =>
                      yBot -
                      Math.max(0, Math.min(1, (k - 250) / (1850 - 250))) * h;
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
                      .map(
                        (p) =>
                          `${xTime(p.time_s)},${yVis(p.opticalVisibility_pct)}`
                      )
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
                        <text
                          x={xRight - 10}
                          y={y800 + 14}
                          textAnchor="end"
                          fill="#F59E0B"
                          fontSize="10"
                          fontFamily="Inter, sans-serif"
                          fontWeight="600"
                        >
                          550K–800K Non-Luminous Cool-Flame Bifurcation Zone
                        </text>

                        {simulation.timelineSeries.map((pt, idx) => {
                          if (!pt.isCoolFlameZone) return null;
                          const x = xTime(pt.time_s);
                          const segW =
                            w / (simulation.timelineSeries.length - 1);
                          return (
                            <rect
                              key={`cf-${idx}`}
                              x={x - segW / 2}
                              y={yTop}
                              width={segW}
                              height={h}
                              fill="rgba(245, 158, 11, 0.07)"
                            />
                          );
                        })}

                        <polyline
                          fill="none"
                          stroke="#EF4444"
                          strokeWidth={2.5}
                          points={tempPts}
                        />
                        <polyline
                          fill="none"
                          stroke="#F59E0B"
                          strokeWidth={2}
                          strokeDasharray="5 3"
                          points={irPts}
                        />
                        <polyline
                          fill="none"
                          stroke="#10B981"
                          strokeWidth={2}
                          points={visPts}
                        />

                        {simulation.timelineSeries.map((pt, idx) => {
                          const x = xTime(pt.time_s);
                          const segW = w / simulation.timelineSeries.length;
                          return (
                            <g
                              key={pt.time_s}
                              onMouseEnter={() => {
                                setHoveredTimelineIdx(idx);
                                setTooltip({
                                  title: `Sensor Readout at t = ${pt.time_s}s`,
                                  metrics: [
                                    { label: 'T_gas', value: `${pt.temp_K}K` },
                                    {
                                      label: 'IR Flux',
                                      value: `${pt.irFlux_Wm2} W/m²`,
                                    },
                                    {
                                      label: 'Visible',
                                      value: `${pt.opticalVisibility_pct}%`,
                                    },
                                  ],
                                  status: pt.isCoolFlameZone
                                    ? 'Cool Flame Caution'
                                    : simulation.hazardStatus,
                                });
                              }}
                              className="cursor-pointer"
                            >
                              <rect
                                x={x - segW / 2}
                                y={yTop}
                                width={segW}
                                height={h}
                                fill="transparent"
                              />
                              {hoveredTimelineIdx === idx && (
                                <g pointerEvents="none">
                                  <line
                                    x1={x}
                                    y1={yTop}
                                    x2={x}
                                    y2={yBot}
                                    stroke={isDark ? '#FAFAFA' : '#18181B'}
                                    strokeWidth={1.25}
                                    strokeDasharray="3 3"
                                  />
                                  <circle
                                    cx={x}
                                    cy={yTemp(pt.temp_K)}
                                    r={4.5}
                                    fill="#EF4444"
                                  />
                                  <circle
                                    cx={x}
                                    cy={yIr(pt.irFlux_Wm2)}
                                    r={4.5}
                                    fill="#F59E0B"
                                  />
                                  <circle
                                    cx={x}
                                    cy={yVis(pt.opticalVisibility_pct)}
                                    r={4.5}
                                    fill="#10B981"
                                  />
                                </g>
                              )}
                            </g>
                          );
                        })}

                        <line
                          x1={xLeft}
                          y1={yBot}
                          x2={xRight}
                          y2={yBot}
                          stroke={axisTextFill}
                        />
                        <line
                          x1={xLeft}
                          y1={yTop}
                          x2={xLeft}
                          y2={yBot}
                          stroke={axisTextFill}
                        />

                        {[0, 20, 40, 60, 80, 100, 120].map((tTick) => {
                          const x = xTime(tTick);
                          return (
                            <g key={tTick}>
                              <line
                                x1={x}
                                y1={yBot}
                                x2={x}
                                y2={yBot + 5}
                                stroke={axisTextFill}
                              />
                              <text
                                x={x}
                                y={yBot + 17}
                                textAnchor="middle"
                                fill={axisTextFill}
                                fontSize="10"
                                fontFamily="JetBrains Mono, monospace"
                              >
                                {tTick}s
                              </text>
                            </g>
                          );
                        })}

                        {[300, 600, 900, 1200, 1500, 1800].map((kTick) => {
                          const y = yTemp(kTick);
                          return (
                            <g key={kTick}>
                              <line
                                x1={xLeft - 5}
                                y1={y}
                                x2={xLeft}
                                y2={y}
                                stroke={axisTextFill}
                              />
                              <text
                                x={xLeft - 8}
                                y={y + 3}
                                textAnchor="end"
                                fill={axisTextFill}
                                fontSize="10"
                                fontFamily="JetBrains Mono, monospace"
                              >
                                {kTick}K
                              </text>
                            </g>
                          );
                        })}

                        <text
                          x={(xLeft + xRight) / 2}
                          y={304}
                          textAnchor="middle"
                          fill={axisTextFill}
                          fontSize="11"
                          fontFamily="Inter, sans-serif"
                          fontWeight="600"
                        >
                          Elapsed Burn Duration (Seconds)
                        </text>
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
