import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
  Sliders,
  X,
} from 'lucide-react';
import { exportRunsDataFormatted } from '../utils/exportGenerators';
import { ExportDropdown } from './ExportDropdown';
import { StudioSelect } from './StudioSelect';
import {
  DefaultExportFormat,
  HazardOutcome,
  MeasurementUnits,
  PsiRun,
  ThemeMode,
} from '../types/psi';
import { CollapsibleCard } from './CollapsibleCard';

interface ExperimentRunsViewProps {
  theme: ThemeMode;
  measurementUnits?: MeasurementUnits;
  defaultExportFormat?: DefaultExportFormat;
  runs: PsiRun[];
  selectedRunIds: string[];
  highlightedRunId: string | null;
  onToggleRun: (runId: string) => void;
  onApplyRunToSliders: (run: PsiRun) => void;
  onInspectRun: (runId: string) => void;
  onGoToComparator: () => void;
}

type SortKey =
  | 'runCode'
  | 'psiId'
  | 'O2_pct'
  | 'P_psi'
  | 'Flow_ms'
  | 'g_eff'
  | 'Thickness_mm'
  | 'peakTemp_K'
  | 'radiometerFlux_Wm2'
  | 'flameSpread_mms';

export const ExperimentRunsView: React.FC<ExperimentRunsViewProps> = ({
  theme,
  measurementUnits = 'spacecraft',
  defaultExportFormat,
  runs,
  selectedRunIds,
  highlightedRunId,
  onToggleRun,
  onApplyRunToSliders,
  onInspectRun,
  onGoToComparator,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [facilityFilter, setFacilityFilter] = useState<string>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('flameSpread_mms');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const PAGE_SIZE = 50;

  const isDark = theme === 'dark';

  const cardSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const dividerBorder = isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]';

  const filteredAndSortedRuns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = runs.filter((run) => {
      const matchFacility =
        facilityFilter === 'ALL' ||
        run.facility.toLowerCase() === facilityFilter.toLowerCase();
      const matchOutcome =
        outcomeFilter === 'ALL' || run.outcome === outcomeFilter;
      const matchSearch =
        !q ||
        run.runCode.toLowerCase().includes(q) ||
        run.psiId.toLowerCase().includes(q) ||
        run.investigationTitle.toLowerCase().includes(q) ||
        run.material.toLowerCase().includes(q) ||
        run.facility.toLowerCase().includes(q) ||
        run.notes.toLowerCase().includes(q);
      return matchFacility && matchOutcome && matchSearch;
    });

    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortAsc ? aVal - bVal : bVal - aVal;
      }
      return sortAsc
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [runs, searchQuery, facilityFilter, outcomeFilter, sortKey, sortAsc]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, facilityFilter, outcomeFilter, sortKey, sortAsc]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAndSortedRuns.length / PAGE_SIZE)
  );
  const safePage = Math.min(page, totalPages);
  const pagedRuns = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredAndSortedRuns.slice(start, start + PAGE_SIZE);
  }, [filteredAndSortedRuns, safePage]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const outcomeStyle = (outcome: HazardOutcome) => {
    if (outcome === 'Rapid Flame Spread') return 'text-[#EF4444]';
    if (outcome === 'Cool Flame Caution') return 'text-[#F59E0B]';
    return 'text-[#10B981]';
  };

  const renderSortHeader = (
    label: string,
    key: SortKey,
    alignRight = true
  ) => (
    <th className={`py-2.5 px-3 ${alignRight ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => handleSort(key)}
        className={`inline-flex items-center gap-1 font-sans text-[11px] font-semibold hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer whitespace-nowrap ${
          sortKey === key
            ? 'text-zinc-900 dark:text-zinc-100 underline'
            : 'text-zinc-500 dark:text-zinc-400'
        }`}
      >
        <span>{label}</span>
        <ArrowUpDown className="w-3 h-3 shrink-0" />
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-lg sm:text-xl font-semibold tracking-[-0.02em]">
          Experiment Runs Catalog ({runs.length.toLocaleString()})
        </h1>
        <span className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
          Flight test measurements across all 18 experiments
        </span>
      </div>

      {/* Search, Filter & Comparison Selection Bar */}
      <CollapsibleCard
        theme={theme}
        title="Search All Experiment Runs"
        subtitle={`${filteredAndSortedRuns.length.toLocaleString()} matching runs`}
        summaryLine={`${filteredAndSortedRuns.length.toLocaleString()} matching runs · Facility: ${facilityFilter} · Regime: ${outcomeFilter} · ${selectedRunIds.length}/4 Selected`}
        rightActions={
          <div className="flex items-center gap-2.5">
            <span className="font-sans text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-mono tabular-nums">
                {selectedRunIds.length}/4
              </span>{' '}
              Selected
            </span>
            <button
              type="button"
              onClick={onGoToComparator}
              className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs font-sans font-semibold rounded-lg transition-all duration-150 active:scale-[0.98] focus-visible:outline-none cursor-pointer ${
                isDark
                  ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200'
                  : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800'
              }`}
            >
              <span>Open Run Comparator ({selectedRunIds.length})</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Search individual test runs, sort fire measurements, and check up to 4 runs to compare side by side.
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by run code (e.g. SAF2-M07), PSI ID, fuel, or notes..."
                aria-label="Search experiment runs"
                className={`w-full h-9 pl-8 pr-8 text-xs font-sans rounded-lg border shadow-2xs transition-colors duration-150 focus:outline-none ${
                  isDark
                    ? 'bg-[#09090B] border-[#27272A] text-zinc-100 placeholder:text-zinc-500 hover:border-zinc-600 focus:border-zinc-400'
                    : 'bg-zinc-50 border-[#E4E4E7] text-zinc-900 placeholder:text-zinc-400 hover:border-zinc-300 focus:border-zinc-500'
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear run search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <StudioSelect
              ariaLabel="Filter runs by hardware facility"
              height="h-9"
              placement="auto-flip"
              value={facilityFilter}
              onChange={setFacilityFilter}
              options={[
                { value: 'ALL', label: 'All Facilities' },
                { value: 'CIR', label: 'CIR' },
                { value: 'MSG', label: 'MSG' },
                { value: 'Cygnus', label: 'Cygnus' },
                { value: 'FSL', label: 'FSL' },
                { value: 'Virtual', label: 'Virtual' },
              ]}
              className="w-full sm:w-40"
            />

            <StudioSelect
              ariaLabel="Filter runs by safety regime outcome"
              height="h-9"
              placement="auto-flip"
              value={outcomeFilter}
              onChange={setOutcomeFilter}
              options={[
                { value: 'ALL', label: 'All Safety Regimes' },
                { value: 'Rapid Flame Spread', label: 'Rapid Flame Spread' },
                { value: 'Cool Flame Caution', label: 'Cool Flame Caution' },
                { value: 'Self-Extinguishing', label: 'Self-Extinguishing' },
              ]}
              className="w-full sm:w-48"
            />

            {(searchQuery !== '' ||
              facilityFilter !== 'ALL' ||
              outcomeFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFacilityFilter('ALL');
                  setOutcomeFilter('ALL');
                }}
                className={`inline-flex items-center gap-1.5 h-9 px-3 text-xs font-sans font-medium rounded-lg border shadow-2xs transition-all duration-150 cursor-pointer ${
                  isDark
                    ? 'bg-[#09090B] border-[#27272A] text-zinc-300 hover:bg-zinc-800 hover:border-zinc-500'
                    : 'bg-zinc-50 border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300'
                }`}
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}

            <ExportDropdown
              theme={theme}
              label="Export Data"
              formats={['csv', 'json', 'doc', 'pdf']}
              defaultFormat={defaultExportFormat}
              disabled={filteredAndSortedRuns.length === 0}
              title="Download currently filtered test runs as CSV, JSON, Word, or PDF"
              onSelectFormat={(fmt) =>
                exportRunsDataFormatted({
                  runs: filteredAndSortedRuns,
                  selectedRunIds,
                  title: 'PSI Filtered Experiment Runs',
                  units: measurementUnits,
                  format: fmt,
                })
              }
            />
          </div>
        </div>
      </CollapsibleCard>

      {/* Granular Run-Level Table */}
      <section className={`border rounded-lg overflow-hidden ${cardSurface}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr
                className={`border-b font-sans text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 ${
                  isDark
                    ? 'bg-[#09090B] border-[#27272A]'
                    : 'bg-zinc-50 border-[#E4E4E7]'
                }`}
              >
                <th className="py-2.5 px-3 text-center">Compare</th>
                {renderSortHeader('Run Code', 'runCode', false)}
                {renderSortHeader('Investigation', 'psiId', false)}
                <th className="py-2.5 px-3">Material / Fuel</th>
                <th className="py-2.5 px-3">Facility</th>
                {renderSortHeader('O₂ %', 'O2_pct')}
                {renderSortHeader('Pressure', 'P_psi')}
                {renderSortHeader('Airflow', 'Flow_ms')}
                {renderSortHeader('Gravity', 'g_eff')}
                {renderSortHeader('Thickness', 'Thickness_mm')}
                {renderSortHeader('Peak Temp', 'peakTemp_K')}
                {renderSortHeader('IR Flux', 'radiometerFlux_Wm2')}
                {renderSortHeader('Spread', 'flameSpread_mms')}
                <th className="py-2.5 px-3">Regime</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${dividerBorder}`}>
              {filteredAndSortedRuns.length === 0 ? (
                <tr>
                  <td
                    colSpan={15}
                    className="py-10 px-4 text-center text-xs font-sans text-zinc-500"
                  >
                    No experiment runs match the current search and filters.
                  </td>
                </tr>
              ) : (
                pagedRuns.map((run) => {
                  const isChecked = selectedRunIds.includes(run.id);
                  const isHighlighted = highlightedRunId === run.id;

                  return (
                    <tr
                      key={run.id}
                      className={`transition-colors ${
                        isHighlighted
                          ? isDark
                            ? 'bg-zinc-800/40'
                            : 'bg-zinc-100/80'
                          : isDark
                          ? 'hover:bg-white/[0.02]'
                          : 'hover:bg-zinc-50/80'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => onToggleRun(run.id)}
                          aria-label={`Select ${run.runCode} for comparison`}
                          className="inline-flex items-center justify-center p-1 rounded-[3px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                        >
                          <span
                            className={`w-4 h-4 rounded-[3px] border flex items-center justify-center shrink-0 transition-colors ${
                              isChecked
                                ? isDark
                                  ? 'bg-[#FAFAFA] border-[#FAFAFA] text-[#09090B]'
                                  : 'bg-[#18181B] border-[#18181B] text-[#FFFFFF]'
                                : isDark
                                ? 'border-zinc-600 bg-transparent hover:border-zinc-400'
                                : 'border-zinc-300 bg-white hover:border-zinc-400'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[2.5]" />}
                          </span>
                        </button>
                      </td>

                      <td className="py-2.5 px-3 font-mono font-semibold whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onInspectRun(run.id)}
                          className="hover:underline cursor-pointer text-left"
                        >
                          {run.runCode}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onInspectRun(run.id)}
                          className="hover:underline cursor-pointer text-left font-medium"
                        >
                          {run.psiId}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 font-sans truncate max-w-[180px]">
                        {run.material}
                      </td>

                      <td className="py-2.5 px-3 font-sans text-zinc-500 dark:text-zinc-400">
                        {run.facility}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-right tabular-nums whitespace-nowrap">
                        {run.O2_pct.toFixed(1)}%
                      </td>

                      <td className="py-2.5 px-3 font-mono text-right tabular-nums whitespace-nowrap">
                        {run.P_psi.toFixed(1)} psi
                      </td>

                      <td className="py-2.5 px-3 font-mono text-right tabular-nums whitespace-nowrap">
                        {run.Flow_ms.toFixed(2)} m/s
                      </td>

                      <td className="py-2.5 px-3 font-mono text-right tabular-nums whitespace-nowrap">
                        {run.g_eff.toFixed(3)}g
                      </td>

                      <td className="py-2.5 px-3 font-mono text-right tabular-nums whitespace-nowrap">
                        {run.Thickness_mm.toFixed(1)} mm
                      </td>

                      <td className="py-2.5 px-3 font-mono text-right tabular-nums whitespace-nowrap">
                        {run.peakTemp_K} K
                      </td>

                      <td className="py-2.5 px-3 font-mono text-right tabular-nums whitespace-nowrap">
                        {run.radiometerFlux_Wm2.toLocaleString()} W/m²
                      </td>

                      <td className="py-2.5 px-3 font-mono font-bold text-right tabular-nums whitespace-nowrap">
                        {run.flameSpread_mms.toFixed(2)} mm/s
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
                            onClick={() => onInspectRun(run.id)}
                            className={`px-2.5 py-1 text-[11px] font-sans font-medium rounded-lg border shadow-xs active:scale-[0.98] transition-all cursor-pointer ${
                              isDark
                                ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600'
                                : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300'
                            }`}
                          >
                            Inspect
                          </button>
                          <button
                            type="button"
                            onClick={() => onApplyRunToSliders(run)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans font-medium rounded-lg border shadow-xs active:scale-[0.98] transition-all cursor-pointer ${
                              isDark
                                ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600'
                                : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300'
                            }`}
                          >
                            <Sliders className="w-3 h-3" />
                            <span>Simulate</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div
          className={`px-4 py-2.5 border-t flex flex-wrap items-center justify-between gap-2 text-xs ${dividerBorder}`}
        >
          <span className="font-sans text-[11px] text-zinc-500 dark:text-zinc-400">
            Showing{' '}
            <span className="font-mono tabular-nums">
              {filteredAndSortedRuns.length === 0
                ? 0
                : (safePage - 1) * PAGE_SIZE + 1}
            </span>
            –
            <span className="font-mono tabular-nums">
              {Math.min(
                safePage * PAGE_SIZE,
                filteredAndSortedRuns.length
              )}
            </span>{' '}
            of{' '}
            <span className="font-mono tabular-nums">
              {filteredAndSortedRuns.length.toLocaleString()}
            </span>{' '}
            runs (
            <span className="font-mono tabular-nums">
              {runs.length.toLocaleString()}
            </span>{' '}
            total in catalog)
          </span>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5 font-sans text-xs">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border shadow-xs active:scale-[0.98] transition-all disabled:opacity-40 cursor-pointer ${
                  isDark
                    ? 'border-[#27272A] text-zinc-200 hover:bg-zinc-800'
                    : 'border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100'
                }`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>
              <span className="px-2">
                Page{' '}
                <span className="font-mono tabular-nums">
                  {safePage} / {totalPages}
                </span>
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border shadow-xs active:scale-[0.98] transition-all disabled:opacity-40 cursor-pointer ${
                  isDark
                    ? 'border-[#27272A] text-zinc-200 hover:bg-zinc-800'
                    : 'border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100'
                }`}
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
