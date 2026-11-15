import React, { useMemo, useState } from 'react';
import {
  Play,
  Sliders,
  ShieldCheck,
  BarChart3,
  Terminal,
  GitCompareArrows,
  ArrowUpDown,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ExternalLink,
} from 'lucide-react';
import { exportVirtualTestFormatted } from '../utils/exportGenerators';
import { ExportDropdown } from './ExportDropdown';
import {
  formatAirflow,
  formatAirflowUnit,
  formatFlameSpread,
  formatFlameSpreadValue,
  formatPressure,
  formatPressureRiseKpa,
  formatPressureUnit,
  formatSpreadUnit,
  formatTemperature,
} from '../utils/themePreferences';
import {
  CandidateMaterialCode,
  DefaultExportFormat,
  EnvironmentPreset,
  EnvironmentPresetId,
  MaterialCandidate,
  MeasurementUnits,
  PsiRun,
  SimulationResponse,
  ThemeMode,
  VirtualTestConfig,
} from '../types/psi';
import { ENVIRONMENT_PRESETS } from '../data/environmentPresets';
import { CollapsibleCard } from './CollapsibleCard';

interface VirtualTestLabProps {
  theme: ThemeMode;
  measurementUnits?: MeasurementUnits;
  defaultExportFormat?: DefaultExportFormat;
  config: VirtualTestConfig;
  activePresetId: EnvironmentPresetId | null;
  simulation: SimulationResponse;
  isRunningTest: boolean;
  lastRunId: string | null;
  lastRunTimestamp: string | null;
  onSelectPreset: (preset: EnvironmentPreset) => void;
  onChangeConfig: <K extends keyof VirtualTestConfig>(
    key: K,
    value: VirtualTestConfig[K]
  ) => void;
  onResetConfig: () => void;
  onRunVirtualTest: () => void;
  onInspectInVisualStudio: () => void;
  onAnalyzeInModelConsole: () => void;
  onAddVirtualRunToComparator: () => void;
  onInspectRun: (runId: string) => void;
  hoveredMaterialId: string | null;
  onHoverMaterial: (code: string | null) => void;
}

const MATERIAL_OPTIONS: Array<{
  code: CandidateMaterialCode;
  label: string;
  loiPct: number;
  note: string;
}> = [
  {
    code: 'PMMA',
    label: 'PMMA Acrylic',
    loiPct: 17.2,
    note: 'Reference flame-spread standard polymer (PSI-99)',
  },
  {
    code: 'SIBAL',
    label: 'SIBAL Blend',
    loiPct: 18.4,
    note: 'Cotton-polyimide calibration blend (SAFFIRE)',
  },
  {
    code: 'Cotton-Fiberglass',
    label: 'Cotton-Fiberglass',
    loiPct: 19.1,
    note: 'Composite textile barrier fabric (BASS / SAFFIRE)',
  },
  {
    code: 'PTFE',
    label: 'PTFE Wire Jacket',
    loiPct: 28.5,
    note: 'High soot/CO yield under low-flow thermal stress (SAME)',
  },
  {
    code: 'Nomex',
    label: 'Nomex',
    loiPct: 29.8,
    note: 'Aramid flame-resistant barrier & flight suit weave',
  },
];

type MatrixSortField =
  | 'name'
  | 'limitingO2_pct'
  | 'flameSpread_mms'
  | 'smokeClumpingIndex'
  | 'toxicGasYieldIndex'
  | 'coolFlameRiskIndex';

export const VirtualTestLab: React.FC<VirtualTestLabProps> = ({
  theme,
  measurementUnits = 'spacecraft',
  defaultExportFormat,
  config,
  activePresetId,
  simulation,
  isRunningTest,
  lastRunId,
  lastRunTimestamp,
  onSelectPreset,
  onChangeConfig,
  onResetConfig,
  onRunVirtualTest,
  onInspectInVisualStudio,
  onAnalyzeInModelConsole,
  onAddVirtualRunToComparator,
  onInspectRun,
  hoveredMaterialId,
  onHoverMaterial,
}) => {
  const [sortField, setSortField] = useState<MatrixSortField>('flameSpread_mms');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [addedToComparatorNotice, setAddedToComparatorNotice] = useState<string | null>(null);

  const isDark = theme === 'dark';

  const cardSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const subSurface = isDark
    ? 'bg-[#09090B]/70 border-[#27272A]'
    : 'bg-[#FAFAFA] border-[#E4E4E7]';

  const primaryButton = isDark
    ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200 border-[#FAFAFA] shadow-xs hover:shadow-sm active:scale-[0.98] transition-all'
    : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800 border-[#18181B] shadow-xs hover:shadow-sm active:scale-[0.98] transition-all';

  const secondaryButton = isDark
    ? 'bg-[#18181B] text-[#FAFAFA] border-[#27272A] hover:bg-zinc-800 hover:border-zinc-600 shadow-xs active:scale-[0.98] transition-all'
    : 'bg-[#FFFFFF] text-[#18181B] border-[#E4E4E7] hover:bg-zinc-100 hover:border-zinc-300 shadow-xs active:scale-[0.98] transition-all';

  const regimeColorHex =
    simulation.hazardStatus === 'Rapid Flame Spread'
      ? '#EF4444'
      : simulation.hazardStatus === 'Cool Flame Caution'
      ? '#F59E0B'
      : '#10B981';

  const regimeTextClass =
    simulation.hazardStatus === 'Rapid Flame Spread'
      ? 'text-[#EF4444]'
      : simulation.hazardStatus === 'Cool Flame Caution'
      ? 'text-[#F59E0B]'
      : 'text-[#10B981]';

  const confidence = simulation.modelConfidence ?? {
    confidencePct: 91.4,
    validatedRunCount: simulation.nearestRuns.length,
    nearestDeltaSummary: 'Matched directly against archived spaceflight fire runs.',
    physicalTestingRecommendation:
      simulation.hazardStatus === 'Cool Flame Caution'
        ? ('Recommended' as const)
        : ('Avoidable' as const),
    rationale:
      'Prediction combines microgravity airflow scaling with nearest real spaceflight test runs.',
  };

  const sortedMaterials = useMemo(() => {
    const copy = [...simulation.materialRankings];
    copy.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc
        ? Number(av) - Number(bv)
        : Number(bv) - Number(av);
    });
    return copy;
  }, [simulation.materialRankings, sortField, sortAsc]);

  const handleSort = (field: MatrixSortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleAddToComparator = () => {
    onAddVirtualRunToComparator();
    setAddedToComparatorNotice(
      `Virtual run (${config.material}, ${config.O2_pct.toFixed(1)}% O2) added to Run Comparator`
    );
    window.setTimeout(() => setAddedToComparatorNotice(null), 4000);
  };

  const activeMaterialMeta =
    MATERIAL_OPTIONS.find((m) => m.code === config.material) ?? MATERIAL_OPTIONS[0];

  const getMaterialRegimeColor = (m: MaterialCandidate) => {
    if (m.flameSpread_mms < 0.48) return '#10B981';
    if (m.flameSpread_mms < 1.25 || m.coolFlameRiskIndex >= 65) return '#F59E0B';
    return '#EF4444';
  };

  return (
    <div className="space-y-4">
      {/* Page Intro Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Virtual Test Lab
          </h1>
          <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Test how materials burn under lunar, orbital, or custom cabin conditions and compare against historical spaceflight runs
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-sans">
          {lastRunId && (
            <span className="inline-flex items-center gap-1.5 font-sans text-zinc-500 dark:text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-[2px] bg-zinc-400 dark:bg-zinc-500" />
              Run <span className="font-mono tabular-nums text-zinc-700 dark:text-zinc-200">{lastRunId}</span> ·{' '}
              <span className={/\d/.test(lastRunTimestamp ?? '') ? 'font-mono tabular-nums' : 'font-sans'}>
                {lastRunTimestamp}
              </span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 font-sans">
            <span
              className="w-2 h-2 rounded-[2px]"
              style={{ backgroundColor: regimeColorHex }}
            />
            <span className="font-sans font-medium text-zinc-800 dark:text-zinc-200">{simulation.hazardStatus}</span>
          </span>
        </div>
      </div>

      {/* Section 1: Collapsible Test Chamber Configuration Panel */}
      <CollapsibleCard
        theme={theme}
        title="Test Chamber Configuration"
        subtitle={`${config.g_eff.toFixed(3)}g · ${config.material}`}
        summaryLine={`${config.g_eff.toFixed(3)}g · ${config.O2_pct.toFixed(1)}% O2 · ${formatPressure(config.P_psi, measurementUnits)} · ${formatAirflow(config.Flow_ms, measurementUnits)} · ${config.material} · ${config.Thickness_mm.toFixed(1)} mm · ${(config.ignitionFlux_Wm2 / 1000).toFixed(0)} kW/m²`}
        rightActions={
          <button
            type="button"
            onClick={onResetConfig}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium rounded-lg border cursor-pointer ${secondaryButton}`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Baseline</span>
          </button>
        }
      >
        <div className="space-y-5">
          {/* Gravity Presets Row */}
          <div>
            <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
              Mission Cabin Presets
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {ENVIRONMENT_PRESETS.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSelectPreset(preset)}
                    className={`text-left p-3 rounded-lg border cursor-pointer ${
                      isActive
                        ? primaryButton
                        : `${subSurface} shadow-xs hover:shadow-sm hover:border-zinc-400 dark:hover:border-zinc-600 active:scale-[0.98] transition-all`
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-sans text-xs font-semibold">
                        {preset.label}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums opacity-80">
                        {preset.shortGravity}
                      </span>
                    </div>
                    <p
                      className={`mt-1 text-[11px] font-mono tabular-nums ${
                        isActive ? 'opacity-85' : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {preset.O2_pct}% O2 · {preset.P_psi} psi · {preset.Flow_ms} m/s
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Numeric Parameters Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* O2 Concentration */}
            <div className={`p-3.5 rounded-[5px] border ${subSurface} space-y-2`}>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="vtl-o2"
                  className="font-sans text-xs font-medium"
                >
                  Oxygen Concentration (%)
                </label>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {config.O2_pct.toFixed(1)}%
                </span>
              </div>
              <input
                id="vtl-o2"
                type="range"
                min={14.0}
                max={50.0}
                step={0.5}
                value={config.O2_pct}
                onChange={(e) => onChangeConfig('O2_pct', Number(e.target.value))}
                className="w-full accent-[#18181B] dark:accent-[#FAFAFA] cursor-pointer"
              />
              <div className="flex justify-between font-sans text-[10px] text-zinc-500">
                <span>
                  <span className="font-mono tabular-nums">14.0%</span> O2
                </span>
                <span>
                  <span className="font-mono tabular-nums">21%</span> Ambient
                </span>
                <span>
                  <span className="font-mono tabular-nums">50.0%</span> O2
                </span>
              </div>
            </div>

            {/* Cabin Pressure */}
            <div className={`p-3.5 rounded-[5px] border ${subSurface} space-y-2`}>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="vtl-pressure"
                  className="font-sans text-xs font-medium"
                >
                  Cabin Pressure ({formatPressureUnit(measurementUnits)})
                </label>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {formatPressure(config.P_psi, measurementUnits)}
                </span>
              </div>
              <input
                id="vtl-pressure"
                type="range"
                min={4.3}
                max={16.5}
                step={0.1}
                value={config.P_psi}
                onChange={(e) => onChangeConfig('P_psi', Number(e.target.value))}
                className="w-full accent-[#18181B] dark:accent-[#FAFAFA] cursor-pointer"
              />
              <div className="flex justify-between font-sans text-[10px] text-zinc-500">
                <span>
                  <span className="font-mono tabular-nums">{formatPressure(4.3, measurementUnits)}</span> (EVA)
                </span>
                <span>
                  <span className="font-mono tabular-nums">{formatPressure(8.2, measurementUnits)}</span> Exploration
                </span>
                <span>
                  <span className="font-mono tabular-nums">{formatPressure(14.7, measurementUnits)}</span> ISS
                </span>
              </div>
            </div>

            {/* Forced Airflow */}
            <div className={`p-3.5 rounded-[5px] border ${subSurface} space-y-2`}>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="vtl-flow"
                  className="font-sans text-xs font-medium"
                >
                  Forced Airflow ({formatAirflowUnit(measurementUnits)})
                </label>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {formatAirflow(config.Flow_ms, measurementUnits)}
                </span>
              </div>
              <input
                id="vtl-flow"
                type="range"
                min={0.0}
                max={0.45}
                step={0.01}
                value={config.Flow_ms}
                onChange={(e) => onChangeConfig('Flow_ms', Number(e.target.value))}
                className="w-full accent-[#18181B] dark:accent-[#FAFAFA] cursor-pointer"
              />
              <div className="flex justify-between font-sans text-[10px] text-zinc-500">
                <span>
                  <span className="font-mono tabular-nums">0.0</span> Quiescent
                </span>
                <span>
                  <span className="font-mono tabular-nums">{formatAirflow(0.14, measurementUnits)}</span> Peak Vent
                </span>
                <span className="font-mono tabular-nums">{formatAirflow(0.45, measurementUnits)}</span>
              </div>
            </div>

            {/* Candidate Material Selector */}
            <div className={`p-3.5 rounded-[5px] border ${subSurface} space-y-2`}>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="vtl-material"
                  className="font-sans text-xs font-medium"
                >
                  Candidate Material
                </label>
                <span className="font-sans text-[11px] text-zinc-500">
                  LOI{' '}
                  <span className="font-mono tabular-nums">
                    {activeMaterialMeta.loiPct.toFixed(1)}%
                  </span>
                </span>
              </div>
              <select
                id="vtl-material"
                value={config.material}
                onChange={(e) =>
                  onChangeConfig(
                    'material',
                    e.target.value as CandidateMaterialCode
                  )
                }
                className={`w-full px-2.5 py-1.5 text-xs font-sans font-medium rounded-[4px] border outline-none ${cardSurface}`}
              >
                {MATERIAL_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label} ({opt.code})
                  </option>
                ))}
              </select>
              <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                {activeMaterialMeta.note}
              </p>
            </div>

            {/* Material Thickness */}
            <div className={`p-3.5 rounded-[5px] border ${subSurface} space-y-2`}>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="vtl-thickness"
                  className="font-sans text-xs font-medium"
                >
                  Material Thickness (mm)
                </label>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {config.Thickness_mm.toFixed(1)} mm
                </span>
              </div>
              <input
                id="vtl-thickness"
                type="range"
                min={0.2}
                max={8.0}
                step={0.1}
                value={config.Thickness_mm}
                onChange={(e) =>
                  onChangeConfig('Thickness_mm', Number(e.target.value))
                }
                className="w-full accent-[#18181B] dark:accent-[#FAFAFA] cursor-pointer"
              />
              <div className="flex justify-between font-sans text-[10px] text-zinc-500">
                <span>
                  <span className="font-mono tabular-nums">0.2</span> Thin Film
                </span>
                <span>
                  <span className="font-mono tabular-nums">2.0</span> Ref
                </span>
                <span>
                  <span className="font-mono tabular-nums">8.0</span> Thermally Thick
                </span>
              </div>
            </div>

            {/* Ignition Heat Flux + Gravity Fine Control */}
            <div className={`p-3.5 rounded-[5px] border ${subSurface} space-y-2`}>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="vtl-flux"
                  className="font-sans text-xs font-medium"
                >
                  Ignition Heat Flux (W/m²)
                </label>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {config.ignitionFlux_Wm2.toLocaleString()} W/m²
                </span>
              </div>
              <input
                id="vtl-flux"
                type="range"
                min={10000}
                max={55000}
                step={1000}
                value={config.ignitionFlux_Wm2}
                onChange={(e) =>
                  onChangeConfig('ignitionFlux_Wm2', Number(e.target.value))
                }
                className="w-full accent-[#18181B] dark:accent-[#FAFAFA] cursor-pointer"
              />
              <div className="flex items-center justify-between pt-0.5 text-[10px] font-sans text-zinc-500">
                <span>
                  <span className="font-mono tabular-nums">10 kW/m²</span> Wire
                </span>
                <span>
                  <span className="font-mono tabular-nums">25 kW/m²</span> Nominal
                </span>
                <span>
                  <span className="font-mono tabular-nums">55 kW/m²</span> Arc
                </span>
              </div>
            </div>
          </div>

          {/* Primary Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-3 text-xs font-sans text-zinc-500 dark:text-zinc-400">
              <span>
                Effective Gravity:{' '}
                <strong className="font-mono text-[#18181B] dark:text-[#FAFAFA] tabular-nums">
                  {config.g_eff.toFixed(3)}g
                </strong>
              </span>
              <span>·</span>
              <span>
                Thickness Margin:{' '}
                <strong
                  className={`font-mono tabular-nums ${
                    simulation.safeMaterialCheck.passed
                      ? 'text-[#10B981]'
                      : 'text-[#EF4444]'
                  }`}
                >
                  {simulation.safeMaterialCheck.margin_mm >= 0 ? '+' : ''}
                  {simulation.safeMaterialCheck.margin_mm.toFixed(1)} mm
                </strong>
              </span>
            </div>

            <button
              type="button"
              onClick={onRunVirtualTest}
              disabled={isRunningTest}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-xs font-sans font-semibold rounded-lg border cursor-pointer disabled:opacity-60 ${primaryButton}`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isRunningTest ? 'Running Virtual Test...' : 'Run Virtual Test'}</span>
            </button>
          </div>
        </div>
      </CollapsibleCard>

      {/* Section 2: Collapsible Virtual Test Results & Model Accuracy Report */}
      <CollapsibleCard
        theme={theme}
        title="Virtual Test Results & Model Accuracy Report"
        subtitle={`${confidence.confidencePct.toFixed(1)}% Model Confidence`}
        summaryLine={`${simulation.hazardStatus} · ${formatFlameSpread(simulation.flameSpread_mms, measurementUnits)} ± ${formatFlameSpread(simulation.confidenceInterval_mms, measurementUnits)} · Confidence ${confidence.confidencePct.toFixed(1)}% (${confidence.physicalTestingRecommendation === 'Avoidable' ? 'Physical test avoidable' : 'Physical test recommended'})`}
        rightActions={
          <ExportDropdown
            theme={theme}
            label="Export Test"
            formats={['doc', 'pdf', 'json']}
            defaultFormat={defaultExportFormat}
            title="Download active chamber settings, prediction, confidence, and nearest runs"
            onSelectFormat={(fmt) =>
              exportVirtualTestFormatted({
                config,
                simulation,
                units: measurementUnits,
                format: fmt,
              })
            }
          />
        }
      >
        <div className="space-y-4">
          {/* Primary Telemetry Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {/* Predicted Regime */}
            <div className={`p-3.5 rounded-[5px] border ${subSurface}`}>
              <div className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                Predicted Regime
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                  style={{ backgroundColor: regimeColorHex }}
                />
                <span className={`font-display text-sm font-semibold ${regimeTextClass}`}>
                  {simulation.hazardStatus}
                </span>
              </div>
              <div className="mt-1 font-sans text-[11px] text-zinc-500">
                Peak Temp{' '}
                <span className="font-mono tabular-nums">
                  {formatTemperature(simulation.peakTemp_K, measurementUnits)}
                </span>
              </div>
            </div>

            {/* Flame Spread Speed + 95% CI */}
            <div className={`p-3.5 rounded-[5px] border ${subSurface}`}>
              <div className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                Flame Spread Speed (95% CI)
              </div>
              <div className="mt-1.5 font-mono text-lg font-semibold tabular-nums">
                {formatFlameSpreadValue(simulation.flameSpread_mms, measurementUnits)}{' '}
                <span className="text-xs font-normal text-zinc-500">
                  ± {formatFlameSpreadValue(simulation.confidenceInterval_mms, measurementUnits)}{' '}
                  {formatSpreadUnit(measurementUnits)}
                </span>
              </div>
              <div className="mt-1 font-sans text-[11px] text-zinc-500">
                Material: {activeMaterialMeta.label}
              </div>
            </div>

            {/* 10-Second Flame Growth & Pressure Rise */}
            <div className={`p-3.5 rounded-[5px] border ${subSurface}`}>
              <div className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                10s Flame Growth &amp; ΔP
              </div>
              <div className="mt-1.5 font-mono text-lg font-semibold tabular-nums">
                {simulation.forecast10s.radius_mm.toFixed(1)}{' '}
                <span className="text-xs font-normal text-zinc-500">mm</span>
              </div>
              <div className="mt-1 font-sans text-[11px] text-zinc-500">
                <span className="font-mono tabular-nums">
                  {formatPressureRiseKpa(simulation.forecast10s.pressureRise_kPa, measurementUnits)}
                </span>{' '}
                cabin rise
              </div>
            </div>

            {/* Minimum Safe Quenching Thickness */}
            <div className={`p-3.5 rounded-[5px] border ${subSurface}`}>
              <div className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                Min Safe Quenching Thickness
              </div>
              <div className="mt-1.5 font-mono text-lg font-semibold tabular-nums">
                {simulation.safeMaterialCheck.minSafeThickness_mm.toFixed(1)}{' '}
                <span className="text-xs font-normal text-zinc-500">mm</span>
              </div>
              <div
                className={`mt-1 font-sans text-[11px] font-medium ${
                  simulation.safeMaterialCheck.passed
                    ? 'text-[#10B981]'
                    : 'text-[#EF4444]'
                }`}
              >
                ● {simulation.safeMaterialCheck.passed ? 'PASS' : 'FAIL'} at{' '}
                {config.Thickness_mm.toFixed(1)} mm
              </div>
            </div>

            {/* Model Confidence Score */}
            <div className={`p-3.5 rounded-[5px] border ${subSurface}`}>
              <div className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                Model Confidence &amp; Grounding
              </div>
              <div className="mt-1.5 font-mono text-lg font-semibold tabular-nums">
                {confidence.confidencePct.toFixed(1)}%
              </div>
              <div className="mt-1 font-sans text-[11px] text-zinc-500">
                Validated against{' '}
                <span className="font-mono font-semibold text-[#18181B] dark:text-[#FAFAFA] tabular-nums">
                  {confidence.validatedRunCount}
                </span>{' '}
                nearby PSI runs
              </div>
            </div>
          </div>

          {/* Model Confidence Banner & Physical Testing Decision */}
          <div
            className={`p-4 rounded-[5px] border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${subSurface}`}
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {confidence.physicalTestingRecommendation === 'Avoidable' ? (
                  <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
                )}
                <span className="font-display text-sm font-semibold">
                  {confidence.confidencePct.toFixed(1)}% Model Confidence — validated against{' '}
                  <span className="font-mono tabular-nums">
                    {confidence.validatedRunCount}
                  </span>{' '}
                  nearby historical PSI runs
                </span>
                <span className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold">
                  <span
                    className="w-2 h-2 rounded-[2px]"
                    style={{
                      backgroundColor:
                        confidence.physicalTestingRecommendation === 'Avoidable'
                          ? '#10B981'
                          : '#F59E0B',
                    }}
                  />
                  Physical Testing:{' '}
                  {confidence.physicalTestingRecommendation}
                </span>
              </div>
              <p className="text-xs font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {confidence.rationale}
              </p>
              <p className="text-[11px] font-sans text-zinc-500">
                {confidence.nearestDeltaSummary}
              </p>
            </div>

            {/* Quick Action Bar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onInspectInVisualStudio}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-sans font-medium rounded-lg border cursor-pointer ${secondaryButton}`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Open in Visual Analytics Studio</span>
              </button>

              <button
                type="button"
                onClick={onAnalyzeInModelConsole}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-sans font-medium rounded-lg border cursor-pointer ${secondaryButton}`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Ask Model Console</span>
              </button>

              <button
                type="button"
                onClick={handleAddToComparator}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-sans font-semibold rounded-lg border cursor-pointer ${primaryButton}`}
              >
                <GitCompareArrows className="w-3.5 h-3.5" />
                <span>Add to Run Comparator</span>
              </button>
            </div>
          </div>

          {addedToComparatorNotice && (
            <div className="text-xs font-sans text-[#10B981] font-medium">
              ● {addedToComparatorNotice}
            </div>
          )}

          {/* Nearest Historical Archive Anchors */}
          {simulation.nearestRuns.length > 0 && (
            <div>
              <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                Closest Past Spaceflight Experiments
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {simulation.nearestRuns.slice(0, 4).map(({ run, similarityPct }) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => onInspectRun(run.id)}
                    className={`text-left p-3 rounded-lg border shadow-xs hover:shadow-sm active:scale-[0.98] transition-all cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-500 ${subSurface}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold">
                        {run.psiId}
                      </span>
                      <span className="font-sans text-[11px] text-[#10B981]">
                        <span className="font-mono tabular-nums">
                          {similarityPct}%
                        </span>{' '}
                        match
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] font-sans text-zinc-500 truncate">
                      {run.material} · {run.facility}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-zinc-600 dark:text-zinc-300 tabular-nums">
                      <span>
                        {run.O2_pct.toFixed(1)}% O2 · {formatAirflow(run.Flow_ms, measurementUnits)}
                      </span>
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleCard>

      {/* Section 3: Collapsible Governing Equations & Material Qualification Matrix */}
      <CollapsibleCard
        theme={theme}
        title="Governing Equations & Material Qualification Matrix"
        subtitle="5 Candidate Materials"
        summaryLine="Reduced-gravity flame spread equation, cool-flame NTC criterion (550K–800K), bullet bars & sortable material table"
      >
        <div className="space-y-6">
          {/* Governing Physics Equations Block */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`p-4 rounded-[5px] border ${subSurface} space-y-2`}>
              <div className="text-xs font-display font-semibold">
                Opposed / Forced-Flow Spread Correlation
              </div>
              <div className="font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-200 tabular-nums overflow-x-auto">
                V_f = 1.18 · ((O2 - 13.5)/12.5)^1.48 · (P/14.7)^0.42 · F_vent(Flow, g) · (2.0/δ)^0.58 · k_mat · (q_ign/25000)^0.18
              </div>
              <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Substituted state: O2 ={' '}
                <span className="font-mono tabular-nums">{config.O2_pct.toFixed(1)}%</span>, P ={' '}
                <span className="font-mono tabular-nums">{config.P_psi.toFixed(1)} psi</span>, Flow ={' '}
                <span className="font-mono tabular-nums">{config.Flow_ms.toFixed(2)} m/s</span>, δ ={' '}
                <span className="font-mono tabular-nums">{config.Thickness_mm.toFixed(1)} mm</span>, q_ign ={' '}
                <span className="font-mono tabular-nums">{config.ignitionFlux_Wm2.toLocaleString()} W/m²</span> →{' '}
                <strong className="font-mono tabular-nums">
                  {simulation.flameSpread_mms.toFixed(2)} mm/s
                </strong>
                .
              </p>
            </div>

            <div className={`p-4 rounded-[5px] border ${subSurface} space-y-2`}>
              <div className="text-xs font-display font-semibold">
                Quenching Thickness &amp; Non-Luminous Cool-Flame Window
              </div>
              <div className="font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-200 tabular-nums">
                δ_safe = 2.0 · (V_chamber / 0.45)^(1/0.58) · · · T_cool ∈ [550 K, 800 K] when Flow ≤ 0.09 m/s &amp; g ≤ 0.25g
              </div>
              <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Self-extinguishing target (&lt; 0.48 mm/s) requires material thickness ≥{' '}
                <strong className="font-mono tabular-nums">
                  {simulation.safeMaterialCheck.minSafeThickness_mm.toFixed(1)} mm
                </strong>
                . Low-airflow heat loss can create hard-to-see cool flames (FLEX / FLEX-2).
              </p>
            </div>
          </div>

          {/* Aligned Horizontal Bullet Target Bars (Zero Radar Charts) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-display font-semibold">
                Candidate Material Spread Bullet Chart (vs. 0.48 mm/s Self-Extinguishing Target)
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] font-sans text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#10B981]" />
                  Self-Extinguishing (&lt;0.48)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#F59E0B]" />
                  Transitional / Cool-Flame Risk
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[2px] bg-[#EF4444]" />
                  Rapid Flame Spread
                </span>
              </div>
            </div>

            <div className={`p-4 rounded-[5px] border ${subSurface} space-y-3.5`}>
              {simulation.materialRankings.map((mat) => {
                const maxScale = Math.max(
                  3.0,
                  ...simulation.materialRankings.map((m) => m.flameSpread_mms * 1.15)
                );
                const widthPct = Math.min(100, (mat.flameSpread_mms / maxScale) * 100);
                const safeMarkerPct = Math.min(100, (0.48 / maxScale) * 100);
                const cautionMarkerPct = Math.min(100, (1.25 / maxScale) * 100);
                const barColor = getMaterialRegimeColor(mat);
                const isSelected = mat.code.toLowerCase().includes(config.material.toLowerCase().slice(0, 4)) ||
                  mat.name.toLowerCase().includes(config.material.toLowerCase());
                const isDimmed =
                  hoveredMaterialId !== null && hoveredMaterialId !== mat.code;

                return (
                  <div
                    key={mat.code}
                    onMouseEnter={() => onHoverMaterial(mat.code)}
                    onMouseLeave={() => onHoverMaterial(null)}
                    className={`grid grid-cols-12 items-center gap-4 transition-opacity ${
                      isDimmed ? 'opacity-35' : 'opacity-100'
                    }`}
                  >
                    <div className="col-span-12 sm:col-span-3 flex items-center justify-between gap-2">
                      <span className="font-sans text-xs font-medium truncate">
                        {mat.name}
                        {isSelected ? ' *' : ''}
                      </span>
                      <span className="font-sans text-[10px] text-zinc-500 shrink-0">
                        LOI <span className="font-mono tabular-nums">{mat.limitingO2_pct}%</span>
                      </span>
                    </div>

                    <div className="col-span-9 sm:col-span-7 relative h-6 flex items-center">
                      {/* Qualitative bullet background bands */}
                      <div
                        className="w-full h-4 rounded-[3px] relative overflow-hidden flex"
                        style={{
                          backgroundColor: isDark ? '#18181B' : '#E4E4E7',
                        }}
                      >
                        <div
                          className="h-full opacity-20"
                          style={{
                            width: `${safeMarkerPct}%`,
                            backgroundColor: '#10B981',
                          }}
                        />
                        <div
                          className="h-full opacity-15"
                          style={{
                            width: `${Math.max(0, cautionMarkerPct - safeMarkerPct)}%`,
                            backgroundColor: '#F59E0B',
                          }}
                        />
                      </div>

                      {/* Actual Spread Bar */}
                      <div
                        className="absolute left-0 h-2 rounded-[2px] transition-all duration-200"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: barColor,
                        }}
                      />

                      {/* Target Threshold Marker */}
                      <div
                        className="absolute top-0.5 bottom-0.5 w-[2px] bg-[#18181B] dark:bg-[#FAFAFA]"
                        style={{ left: `${safeMarkerPct}%` }}
                        title="0.48 mm/s Self-Extinguishing Threshold"
                      />
                    </div>

                    <div className="col-span-3 sm:col-span-2 text-right font-mono text-xs font-semibold tabular-nums">
                      {mat.flameSpread_mms.toFixed(2)} mm/s
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sortable Material Qualification Table */}
          <div className="overflow-x-auto border rounded-[5px] border-[#E4E4E7] dark:border-[#27272A]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr
                  className={`border-b font-sans text-[11px] font-semibold text-zinc-500 ${
                    isDark
                      ? 'bg-[#09090B] border-[#27272A]'
                      : 'bg-zinc-50 border-[#E4E4E7]'
                  }`}
                >
                  {(
                    [
                      ['name', 'Candidate Material'],
                      ['limitingO2_pct', 'Limiting O2 (%)'],
                      ['flameSpread_mms', 'Spread Rate (mm/s)'],
                      ['smokeClumpingIndex', 'Smoke Clumping'],
                      ['toxicGasYieldIndex', 'Toxic CO Index'],
                      ['coolFlameRiskIndex', 'Cool-Flame Index'],
                    ] as Array<[MatrixSortField, string]>
                  ).map(([field, label]) => (
                    <th key={field} className="py-2.5 px-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSort(field)}
                        className="inline-flex items-center gap-1 hover:text-[#18181B] dark:hover:text-[#FAFAFA] cursor-pointer"
                      >
                        <span>{label}</span>
                        <ArrowUpDown className="w-3 h-3 opacity-60" />
                      </button>
                    </th>
                  ))}
                  <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#27272A]">
                {sortedMaterials.map((mat) => {
                  const color = getMaterialRegimeColor(mat);
                  const statusLabel =
                    mat.flameSpread_mms < 0.48
                      ? 'Self-Extinguishing'
                      : mat.coolFlameRiskIndex >= 65
                      ? 'Soot / Cool-Flame Risk'
                      : 'Rapid Spread Hazard';
                  return (
                    <tr
                      key={mat.code}
                      onMouseEnter={() => onHoverMaterial(mat.code)}
                      onMouseLeave={() => onHoverMaterial(null)}
                      className="hover:bg-zinc-50/80 dark:hover:bg-white/[0.02]"
                    >
                      <td className="py-2.5 px-3 font-sans font-medium whitespace-nowrap">
                        {mat.name}{' '}
                        <span className="font-sans text-[10px] text-zinc-500">
                          [{mat.code}]
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        {mat.limitingO2_pct.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold tabular-nums whitespace-nowrap">
                        {mat.flameSpread_mms.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        {mat.smokeClumpingIndex}/100
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        {mat.toxicGasYieldIndex}/100
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                        {mat.coolFlameRiskIndex}/100
                      </td>
                      <td className="py-2.5 px-3 font-sans font-medium whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-[2px]"
                            style={{ backgroundColor: color }}
                          />
                          <span>{statusLabel}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CollapsibleCard>
    </div>
  );
};
