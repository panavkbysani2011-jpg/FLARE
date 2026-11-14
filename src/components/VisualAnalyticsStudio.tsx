import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  Download,
  Lock,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TerminalSquare,
  X,
} from 'lucide-react';
import {
  ActiveChartExportSnapshot,
  exportStudioChartData,
} from '../utils/exportHelpers';
import {
  DecodedChartContext,
  PsiRun,
  SimulationResponse,
  StudioDatasetSource,
  ThemeMode,
  VizMode,
} from '../types/psi';
import {
  ALL_STUDIO_AXIS_COLUMNS,
  AxisVariableKey,
  buildDatasetContext,
  CategoricalGroupKey,
  evaluateAllTechniques,
  filterTechniques,
  getAxisMeta,
  getDefaultAxesForTechnique,
  getTechniqueHeadline,
  NumericAxisKey,
  STUDIO_CATEGORICAL_COLUMNS,
  STUDIO_DATASET_SOURCES,
  STUDIO_NUMERIC_COLUMNS,
} from '../utils/vizRegistry';
import { computeFlameSpreadVelocity } from '../utils/physicsEngine';
import { CollapsibleCard } from './CollapsibleCard';
import { VizTechniqueRenderer } from './VizTechniqueRenderer';

interface VisualAnalyticsStudioProps {
  theme: ThemeMode;
  vizMode: VizMode;
  onChangeVizMode: (mode: VizMode) => void;
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
  simulation: SimulationResponse;
  selectedRuns: PsiRun[];
  catalogRuns: PsiRun[];
  hoveredRunId: string | null;
  onHoverRun: (runId: string | null) => void;
  hoveredMaterialId: string | null;
  onHoverMaterial: (matCode: string | null) => void;
  onInspectRun: (runId: string) => void;
  onGoToImportSync: () => void;
  onDecodeInModelConsole: (context: DecodedChartContext) => void;
  onExportSnapshotChange?: (snapshot: ActiveChartExportSnapshot) => void;
}

export const VisualAnalyticsStudio: React.FC<VisualAnalyticsStudioProps> = ({
  theme,
  vizMode,
  onChangeVizMode,
  sliders,
  onChangeSlider,
  simulation,
  selectedRuns,
  catalogRuns,
  hoveredRunId,
  onHoverRun,
  hoveredMaterialId,
  onHoverMaterial,
  onInspectRun,
  onGoToImportSync,
  onDecodeInModelConsole,
  onExportSnapshotChange,
}) => {
  const isDark = theme === 'dark';

  const [chartExportFormat, setChartExportFormat] = useState<'csv' | 'json'>(
    'csv'
  );
  const [datasetSource, setDatasetSource] =
    useState<StudioDatasetSource>('full-archive');
  const [axisMap, setAxisMap] = useState<{
    xAxis: AxisVariableKey;
    yAxis: NumericAxisKey;
    colorBy: CategoricalGroupKey;
  }>(() => getDefaultAxesForTechnique(vizMode));

  // Floating Technique Search Popover
  const [isTechOpen, setIsTechOpen] = useState(false);
  const [techSearch, setTechSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'recommended' | 'available' | 'unavailable'
  >('all');
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAxisMap(getDefaultAxesForTechnique(vizMode));
  }, [vizMode]);

  useEffect(() => {
    const onOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsTechOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsTechOpen(false);
    };
    if (isTechOpen) {
      document.addEventListener('mousedown', onOutsideClick);
      document.addEventListener('keydown', onEsc);
    }
    return () => {
      document.removeEventListener('mousedown', onOutsideClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [isTechOpen]);

  const customRunsCount = useMemo(
    () => catalogRuns.filter((r) => Boolean(r.isCustom)).length,
    [catalogRuns]
  );

  const datasetContext = useMemo(
    () => buildDatasetContext(datasetSource, selectedRuns, catalogRuns, simulation),
    [datasetSource, selectedRuns, catalogRuns, simulation]
  );

  const evaluatedTechniques = useMemo(
    () => evaluateAllTechniques(datasetContext),
    [datasetContext]
  );

  const filteredTechniques = useMemo(
    () =>
      filterTechniques(evaluatedTechniques, {
        searchQuery: techSearch,
        statusFilter,
        familyFilter: 'all',
      }),
    [evaluatedTechniques, techSearch, statusFilter]
  );

  const activeTechnique = useMemo(
    () =>
      evaluatedTechniques.find((t) => t.definition.id === vizMode) ??
      evaluatedTechniques[0],
    [evaluatedTechniques, vizMode]
  );

  const statusCounts = useMemo(
    () => ({
      all: evaluatedTechniques.length,
      recommended: evaluatedTechniques.filter(
        (t) => t.compatibility.status === 'recommended'
      ).length,
      available: evaluatedTechniques.filter(
        (t) => t.compatibility.status !== 'unavailable'
      ).length,
      unavailable: evaluatedTechniques.filter(
        (t) => t.compatibility.status === 'unavailable'
      ).length,
    }),
    [evaluatedTechniques]
  );

  const xAxisMeta = getAxisMeta(axisMap.xAxis);
  const yAxisMeta = getAxisMeta(axisMap.yAxis);
  const colorByMeta = getAxisMeta(axisMap.colorBy);

  const headline = useMemo(
    () =>
      getTechniqueHeadline(vizMode, simulation, sliders, datasetContext.activeRuns, {
        xAxisLabel: xAxisMeta.shortLabel,
        yAxisLabel: yAxisMeta.shortLabel,
        colorByLabel: colorByMeta.shortLabel,
      }),
    [vizMode, simulation, sliders, datasetContext.activeRuns, xAxisMeta, yAxisMeta, colorByMeta]
  );

  const activeDatasetMeta =
    STUDIO_DATASET_SOURCES.find((s) => s.id === datasetSource) ??
    STUDIO_DATASET_SOURCES[0];

  const chartExportSnapshot = useMemo<ActiveChartExportSnapshot>(
    () => ({
      vizMode,
      techniqueName: activeTechnique.definition.name,
      datasetLabel: activeDatasetMeta.label,
      xAxisKey: xAxisMeta.key,
      xAxisLabel: xAxisMeta.label,
      xAxisUnit: xAxisMeta.unit,
      yAxisKey: yAxisMeta.key,
      yAxisLabel: yAxisMeta.label,
      yAxisUnit: yAxisMeta.unit,
      colorByKey: colorByMeta.key,
      colorByLabel: colorByMeta.label,
      headline,
      plottedRuns: datasetContext.activeRuns,
      getAxisValue: (run, key) =>
        (run as unknown as Record<string, number | string>)[key] ?? '',
    }),
    [
      vizMode,
      activeTechnique,
      activeDatasetMeta,
      xAxisMeta,
      yAxisMeta,
      colorByMeta,
      headline,
      datasetContext.activeRuns,
    ]
  );

  useEffect(() => {
    onExportSnapshotChange?.(chartExportSnapshot);
  }, [chartExportSnapshot, onExportSnapshotChange]);

  const handleDecodeView = () => {
    const runs = datasetContext.activeRuns;
    const anomalies: string[] = [];
    const coolCount = runs.filter((r) => r.outcome === 'Cool Flame Caution').length;
    const rapidRuns = [...runs]
      .filter((r) => r.outcome === 'Rapid Flame Spread')
      .sort((a, b) => b.flameSpread_mms - a.flameSpread_mms);
    if (coolCount > 0) {
      anomalies.push(
        `${coolCount} run(s) exhibit non-luminous 550K–800K Cool-Flame NTC behavior with low optical emission.`
      );
    }
    if (rapidRuns[0]) {
      anomalies.push(
        `Peak spread outlier: ${rapidRuns[0].psiId} (${rapidRuns[0].material}) at ${rapidRuns[0].flameSpread_mms.toFixed(
          2
        )} mm/s under ${rapidRuns[0].O2_pct.toFixed(1)}% O₂.`
      );
    }
    const maxResidual = runs
      .slice(0, 60)
      .map((r) => {
        const pred = computeFlameSpreadVelocity({
          O2_pct: r.O2_pct,
          P_psi: r.P_psi,
          Flow_ms: r.Flow_ms,
          g_eff: r.g_eff,
          Thickness_mm: r.Thickness_mm,
          material: r.material,
        }).flameSpread_mms;
        return { run: r, diff: Math.abs(r.flameSpread_mms - pred) };
      })
      .sort((a, b) => b.diff - a.diff)[0];
    if (maxResidual && maxResidual.diff > 0.35) {
      anomalies.push(
        `Largest difference between real test and model: ${maxResidual.run.psiId} (Δ = ${maxResidual.diff.toFixed(
          2
        )} mm/s).`
      );
    }
    if (anomalies.length === 0) {
      anomalies.push(
        `Active virtual operating point predicts ${simulation.flameSpread_mms.toFixed(
          2
        )} mm/s (${simulation.hazardStatus}) with ${simulation.modelConfidence?.confidencePct ?? 92}% model confidence.`
      );
    }

    onDecodeInModelConsole({
      datasetLabel: activeDatasetMeta.label,
      techniqueName: activeTechnique.definition.name,
      xAxisLabel: xAxisMeta.label,
      yAxisLabel: yAxisMeta.label,
      colorByLabel: colorByMeta.label,
      runCount: runs.length,
      anomalies,
      summaryHeadline: headline,
    });
  };

  const selectClass = `w-full px-2.5 py-1.5 text-xs font-sans rounded-[4px] border focus:outline-none transition-colors ${
    isDark
      ? 'bg-[#09090B] border-[#27272A] text-[#FAFAFA] focus:border-zinc-500'
      : 'bg-zinc-50 border-[#E4E4E7] text-[#18181B] focus:border-zinc-500'
  }`;

  const activeMonoBtn = isDark
    ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA] font-semibold shadow-xs hover:bg-zinc-200 hover:shadow-sm active:scale-[0.98] transition-all'
    : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B] font-semibold shadow-xs hover:bg-zinc-800 hover:shadow-sm active:scale-[0.98] transition-all';

  const inactiveMonoBtn = isDark
    ? 'bg-[#09090B] border-[#27272A] text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 shadow-xs active:scale-[0.98] transition-all'
    : 'bg-white border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 shadow-xs active:scale-[0.98] transition-all';

  const isUnavailable = activeTechnique.compatibility.status === 'unavailable';

  return (
    <div className="space-y-4">
      {/* Page Title Row + Model Console Decode CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg sm:text-xl font-semibold tracking-tight">
            Visual Analytics Studio
          </h1>
          <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Explore spaceflight fire data across 25 chart types with custom X, Y, and grouping controls.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDecodeView}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-sans font-semibold rounded-lg border cursor-pointer ${activeMonoBtn}`}
        >
          <TerminalSquare className="w-3.5 h-3.5" />
          <span>Explain Chart in Model Console</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Collapsible 3-Part Top Control Strip */}
      <CollapsibleCard
        theme={theme}
        title="Chart Controls: Dataset, Chart Type & Variables"
        subtitle="Choose a dataset scope, chart method, and dynamic X / Y / Color variables"
        summaryLine={
          <span>
            {activeDatasetMeta.label} (<span className="font-mono tabular-nums">{datasetContext.activeRuns.length}</span>) •{' '}
            <strong>{activeTechnique.definition.name}</strong> • {xAxisMeta.shortLabel} vs.{' '}
            {yAxisMeta.shortLabel} ({colorByMeta.shortLabel})
          </span>
        }
      >
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-end">
          {/* Control 1: Active Dataset Source Dropdown */}
          <div className="xl:col-span-3 space-y-1.5">
            <label
              htmlFor="studio-dataset-source"
              className="block text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              1. Active Dataset Source
            </label>
            <select
              id="studio-dataset-source"
              value={datasetSource}
              onChange={(e) => setDatasetSource(e.target.value as StudioDatasetSource)}
              className={selectClass}
            >
              <option value="full-archive">
                Full PSI Archive ({catalogRuns.length.toLocaleString()} runs)
              </option>
              <option value="selected-comparison">
                Selected Comparison Runs ({selectedRuns.length})
              </option>
              <option value="virtual-lab-output">
                Virtual Test Lab Output ({simulation.nearestRuns.length} validated neighbors)
              </option>
              <option value="material-qualification">
                Material Safety Comparison ({simulation.materialRankings.length} materials)
              </option>
              <option value="imported-custom">
                Imported Custom CSV/JSON ({customRunsCount} runs)
              </option>
            </select>
          </div>

          {/* Control 2: Generic Visualization Technique Searchable Popover Dropdown */}
          <div className="xl:col-span-4 space-y-1.5 relative" ref={popoverRef}>
            <div className="flex items-center justify-between text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <span>2. Visualization Technique ({evaluatedTechniques.length})</span>
              <span className="font-sans text-[10px] font-normal text-zinc-400">
                {activeTechnique.definition.familyLabel}
              </span>
            </div>

            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isTechOpen}
              onClick={() => setIsTechOpen((p) => !p)}
              className={`w-full px-3 py-1.5 text-xs font-sans rounded-lg border flex items-center justify-between gap-2 shadow-xs hover:shadow-sm active:scale-[0.98] transition-all cursor-pointer ${
                isDark
                  ? 'bg-[#09090B] border-[#27272A] text-[#FAFAFA] hover:border-zinc-500'
                  : 'bg-zinc-50 border-[#E4E4E7] text-[#18181B] hover:bg-zinc-100 hover:border-zinc-300'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="font-semibold truncate">
                  {activeTechnique.definition.name}
                </span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span
                  className={`w-1.5 h-1.5 rounded-[1px] ${
                    activeTechnique.compatibility.status === 'recommended'
                      ? 'bg-[#10B981]'
                      : activeTechnique.compatibility.status === 'unavailable'
                      ? 'bg-[#F59E0B]'
                      : 'bg-zinc-400'
                  }`}
                />
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              </span>
            </button>

            {/* Floating Searchable Popover (Never pushes page layout down) */}
            {isTechOpen && (
              <div
                role="listbox"
                aria-label="Select analytical visualization method"
                className={`absolute left-0 top-full mt-1.5 w-[min(92vw,680px)] max-h-[430px] overflow-y-auto z-50 rounded-[6px] border backdrop-blur-md shadow-2xl ${
                  isDark
                    ? 'bg-[#18181B]/95 border-[#27272A] text-[#FAFAFA]'
                    : 'bg-white/98 border-[#E4E4E7] text-[#18181B]'
                }`}
              >
                <div
                  className={`sticky top-0 z-10 p-2.5 border-b space-y-2 backdrop-blur-md ${
                    isDark
                      ? 'bg-[#18181B]/95 border-[#27272A]'
                      : 'bg-white/95 border-[#E4E4E7]'
                  }`}
                >
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      value={techSearch}
                      onChange={(e) => setTechSearch(e.target.value)}
                      placeholder="Search analytical technique (e.g., Heatmap, Parallel, Scatter, Box, Correlation)..."
                      className={`w-full pl-8 pr-7 py-1.5 text-xs font-sans rounded-[4px] border focus:outline-none ${
                        isDark
                          ? 'bg-[#09090B] border-[#27272A] text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500'
                          : 'bg-zinc-50 border-[#E4E4E7] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500'
                      }`}
                    />
                    {techSearch && (
                      <button
                        type="button"
                        onClick={() => setTechSearch('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Rectangular Status Tabs */}
                  <div className="flex flex-wrap items-center gap-1">
                    {(
                      [
                        { id: 'all', label: `All (${statusCounts.all})`, dot: null },
                        {
                          id: 'recommended',
                          label: `Recommended (${statusCounts.recommended})`,
                          dot: 'bg-[#10B981]',
                        },
                        {
                          id: 'available',
                          label: `Available (${statusCounts.available})`,
                          dot: 'bg-zinc-400',
                        },
                        {
                          id: 'unavailable',
                          label: `Unavailable (${statusCounts.unavailable})`,
                          dot: 'bg-[#F59E0B]',
                        },
                      ] as const
                    ).map((tab) => {
                      const active = statusFilter === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setStatusFilter(tab.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-sans rounded-lg border cursor-pointer ${
                            active ? activeMonoBtn : inactiveMonoBtn
                          }`}
                        >
                          {tab.dot && (
                            <span
                              className={`w-1.5 h-1.5 rounded-[1px] ${tab.dot}`}
                              aria-hidden="true"
                            />
                          )}
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Single-line Technique Rows */}
                <div
                  className={`p-1.5 divide-y ${
                    isDark ? 'divide-[#27272A]/60' : 'divide-[#E4E4E7]/70'
                  }`}
                >
                  {filteredTechniques.length === 0 ? (
                    <div className="py-6 text-center text-xs font-sans text-zinc-500">
                      No visualization techniques match &quot;{techSearch}&quot;.
                    </div>
                  ) : (
                    filteredTechniques.map(({ definition, compatibility }) => {
                      const selected = vizMode === definition.id;
                      const disabled = compatibility.status === 'unavailable';
                      const recommended = compatibility.status === 'recommended';
                      const unavailableText =
                        compatibility.missingRequirement ??
                        compatibility.reason.replace(/^Unavailable:\s*/i, '');

                      return (
                        <button
                          key={definition.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          disabled={disabled}
                          title={compatibility.reason}
                          onClick={() => {
                            onChangeVizMode(definition.id);
                            setIsTechOpen(false);
                          }}
                          className={`w-full px-2.5 py-2 flex items-center justify-between gap-3 text-left text-xs rounded-[4px] transition-colors ${
                            disabled
                              ? 'opacity-55 cursor-not-allowed text-zinc-400 dark:text-zinc-500'
                              : selected
                              ? activeMonoBtn + ' cursor-pointer'
                              : isDark
                              ? 'hover:bg-zinc-800/80 text-zinc-100 cursor-pointer'
                              : 'hover:bg-zinc-100 text-zinc-900 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-sans font-semibold truncate">
                              {definition.name}
                            </span>
                            <span
                              className={`text-[11px] font-sans shrink-0 ${
                                selected
                                  ? isDark
                                    ? 'text-zinc-700'
                                    : 'text-zinc-300'
                                  : 'text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              · {definition.familyLabel}
                            </span>
                          </div>

                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] font-sans shrink-0 whitespace-nowrap ${
                              disabled
                                ? 'text-[#F59E0B]'
                                : recommended
                                ? selected
                                  ? isDark
                                    ? 'text-[#059669] font-semibold'
                                    : 'text-[#34D399] font-semibold'
                                  : 'text-[#10B981] font-semibold'
                                : selected
                                ? isDark
                                  ? 'text-zinc-700'
                                  : 'text-zinc-300'
                                : 'text-zinc-500 dark:text-zinc-400'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-[1px] ${
                                disabled
                                  ? 'bg-[#F59E0B]'
                                  : recommended
                                  ? 'bg-[#10B981]'
                                  : 'bg-zinc-400'
                              }`}
                            />
                            <span>
                              {disabled
                                ? `Unavailable: ${unavailableText}`
                                : recommended
                                ? 'Recommended'
                                : 'Available'}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Control 3: Dynamic Variable / Axis Mapper */}
          <div className="xl:col-span-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="space-y-1.5">
              <label
                htmlFor="studio-x-axis"
                className="block text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
              >
                3a. X-Axis
              </label>
              <select
                id="studio-x-axis"
                value={axisMap.xAxis}
                onChange={(e) =>
                  setAxisMap((prev) => ({
                    ...prev,
                    xAxis: e.target.value as AxisVariableKey,
                  }))
                }
                className={selectClass}
              >
                {ALL_STUDIO_AXIS_COLUMNS.map((col) => (
                  <option key={col.key} value={col.key}>
                    {col.shortLabel}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="studio-y-axis"
                className="block text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
              >
                3b. Y-Axis
              </label>
              <select
                id="studio-y-axis"
                value={axisMap.yAxis}
                onChange={(e) =>
                  setAxisMap((prev) => ({
                    ...prev,
                    yAxis: e.target.value as NumericAxisKey,
                  }))
                }
                className={selectClass}
              >
                {STUDIO_NUMERIC_COLUMNS.map((col) => (
                  <option key={col.key} value={col.key}>
                    {col.shortLabel}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="studio-color-by"
                  className="block text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
                >
                  3c. Color / Group
                </label>
                <button
                  type="button"
                  onClick={() => setAxisMap(getDefaultAxesForTechnique(vizMode))}
                  title="Reset axes to recommended pair"
                  className="text-[10px] font-sans text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 inline-flex items-center gap-0.5 cursor-pointer"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Default</span>
                </button>
              </div>
              <select
                id="studio-color-by"
                value={axisMap.colorBy}
                onChange={(e) =>
                  setAxisMap((prev) => ({
                    ...prev,
                    colorBy: e.target.value as CategoricalGroupKey,
                  }))
                }
                className={selectClass}
              >
                {STUDIO_CATEGORICAL_COLUMNS.map((col) => (
                  <option key={col.key} value={col.key}>
                    {col.shortLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </CollapsibleCard>

      {/* Main Dedicated Spacious Chart Stage */}
      <div
        className={`rounded-[6px] border p-4 sm:p-5 space-y-4 ${
          isDark
            ? 'bg-[#18181B] border-[#27272A] text-[#FAFAFA]'
            : 'bg-white border-[#E4E4E7] text-[#18181B]'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-sm sm:text-base font-semibold">
                {activeTechnique.definition.name}
              </h2>
              <span className="inline-flex items-center gap-1.5 text-xs font-sans text-zinc-500 dark:text-zinc-400">
                <span className="w-1.5 h-1.5 rounded-[2px] bg-zinc-400 dark:bg-zinc-500" />
                <span>{activeTechnique.definition.familyLabel}</span>
              </span>
            </div>
            <p className="text-xs font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {headline}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-[10px] font-sans uppercase tracking-wider text-zinc-400">
                Plotted Runs
              </div>
              <div className="font-mono text-sm font-semibold tabular-nums">
                {datasetContext.activeRuns.length.toLocaleString()} runs
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <div
                className={`flex items-center p-0.5 rounded-md border ${
                  isDark
                    ? 'bg-[#09090B] border-[#27272A]'
                    : 'bg-zinc-100 border-[#E4E4E7]'
                }`}
                role="group"
                aria-label="Chart export format"
              >
                <button
                  type="button"
                  onClick={() => setChartExportFormat('csv')}
                  className={`px-2 py-1 text-[11px] font-sans font-medium rounded-[4px] cursor-pointer transition-colors ${
                    chartExportFormat === 'csv'
                      ? activeMonoBtn
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => setChartExportFormat('json')}
                  className={`px-2 py-1 text-[11px] font-sans font-medium rounded-[4px] cursor-pointer transition-colors ${
                    chartExportFormat === 'json'
                      ? activeMonoBtn
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  JSON
                </button>
              </div>

              <button
                type="button"
                disabled={isUnavailable}
                onClick={() =>
                  exportStudioChartData({
                    snapshot: chartExportSnapshot,
                    simulation,
                    format: chartExportFormat,
                  })
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium rounded-lg border shadow-xs active:scale-[0.98] disabled:opacity-45 cursor-pointer ${
                  isDark
                    ? 'bg-[#09090B] border-[#27272A] text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600'
                    : 'bg-zinc-50 border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300'
                }`}
                title="Download the currently plotted chart data and axis metadata"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Chart Data</span>
              </button>
            </div>
          </div>
        </div>

        {/* Unavailable Technique Guard State */}
        {isUnavailable ? (
          <div
            className={`p-8 rounded-[5px] border border-dashed text-center space-y-3 ${
              isDark
                ? 'bg-[#09090B]/70 border-[#27272A]'
                : 'bg-zinc-50 border-zinc-300'
            }`}
          >
            <div className="inline-flex items-center gap-2 text-xs font-sans font-semibold text-[#F59E0B]">
              <Lock className="w-4 h-4" />
              <span>
                {activeTechnique.definition.name} is Unavailable for {activeDatasetMeta.label}
              </span>
            </div>
            <p className="text-xs font-sans text-zinc-600 dark:text-zinc-300 max-w-xl mx-auto">
              {activeTechnique.compatibility.reason}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {datasetSource !== 'full-archive' && (
                <button
                  type="button"
                  onClick={() => setDatasetSource('full-archive')}
                  className={`px-3 py-1.5 text-xs font-sans rounded-lg border cursor-pointer ${activeMonoBtn}`}
                >
                  Switch to Full PSI Archive ({catalogRuns.length.toLocaleString()} runs)
                </button>
              )}
              {datasetSource === 'imported-custom' && customRunsCount === 0 && (
                <button
                  type="button"
                  onClick={onGoToImportSync}
                  className={`px-3 py-1.5 text-xs font-sans rounded-lg border cursor-pointer ${inactiveMonoBtn}`}
                >
                  Upload CSV/JSON in Data Import &amp; Sync
                </button>
              )}
              <button
                type="button"
                onClick={() => onChangeVizMode('safety-map')}
                className={`px-3 py-1.5 text-xs font-sans rounded-lg border cursor-pointer ${inactiveMonoBtn}`}
              >
                Switch to 2D Regime Heatmap
              </button>
            </div>
          </div>
        ) : (
          <VizTechniqueRenderer
            theme={theme}
            vizMode={vizMode}
            sliders={sliders}
            simulation={simulation}
            activeRuns={datasetContext.activeRuns}
            xAxisKey={axisMap.xAxis}
            yAxisKey={axisMap.yAxis}
            colorByKey={axisMap.colorBy}
            hoveredRunId={hoveredRunId}
            onHoverRun={onHoverRun}
            hoveredMaterialId={hoveredMaterialId}
            onHoverMaterial={onHoverMaterial}
            onInspectRun={onInspectRun}
            onChangeSlider={onChangeSlider}
            caveatNote={activeTechnique.definition.caveatNote}
          />
        )}
      </div>

      {/* Collapsible Active Linked Runs Strip (Brushing & Linking) */}
      <CollapsibleCard
        theme={theme}
        title="Nearby Flight Runs & Quick Links"
        subtitle="Hover any run to highlight it in the charts, or click to inspect full experiment details"
        defaultOpen={false}
        summaryLine={
          <span>
            {selectedRuns.length} selected for comparison ·{' '}
            {simulation.nearestRuns.length} nearest flight test matches
          </span>
        }
      >
        <div className="flex flex-wrap gap-2">
          {simulation.nearestRuns.slice(0, 8).map(({ run, similarityPct }) => {
            const dotColor =
              run.outcome === 'Rapid Flame Spread'
                ? 'bg-[#EF4444]'
                : run.outcome === 'Cool Flame Caution'
                ? 'bg-[#F59E0B]'
                : 'bg-[#10B981]';
            const isHovered = hoveredRunId === run.id;
            return (
              <button
                key={run.id}
                type="button"
                onMouseEnter={() => onHoverRun(run.id)}
                onMouseLeave={() => onHoverRun(null)}
                onClick={() => onInspectRun(run.id)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border shadow-xs hover:shadow-sm active:scale-[0.98] transition-all cursor-pointer ${
                  isHovered
                    ? activeMonoBtn
                    : isDark
                    ? 'bg-[#09090B] border-[#27272A] text-zinc-200 hover:border-zinc-500'
                    : 'bg-zinc-50 border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-[1px] ${dotColor}`} />
                <span className="font-mono font-semibold">{run.psiId}</span>
                <span className="font-sans text-[11px] opacity-75">
                  {run.material}
                </span>
                <span className="font-sans text-[10px] opacity-75">
                  <span className="font-mono tabular-nums">{similarityPct}%</span> match
                </span>
              </button>
            );
          })}
        </div>
      </CollapsibleCard>
    </div>
  );
};
