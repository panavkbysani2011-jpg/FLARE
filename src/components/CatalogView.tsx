import React, { useMemo, useState } from 'react';
import {
  Search,
  Filter,
  CheckSquare,
  Square,
  Sliders,
  ArrowUpRight,
} from 'lucide-react';
import { HazardOutcome, PsiRun, ThemeMode } from '../types/psi';

interface CatalogViewProps {
  theme: ThemeMode;
  runs: PsiRun[];
  selectedRunIds: string[];
  highlightedRunId: string | null;
  onToggleRun: (runId: string) => void;
  onApplyRunToSliders: (run: PsiRun) => void;
  onInspectRun: (runId: string) => void;
  onGoToComparator: () => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  theme,
  runs,
  selectedRunIds,
  highlightedRunId,
  onToggleRun,
  onApplyRunToSliders,
  onInspectRun,
  onGoToComparator,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFacility, setSelectedFacility] = useState<string>('ALL');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('ALL');
  const [selectedFuelGroup, setSelectedFuelGroup] = useState<string>('ALL');

  const isDark = theme === 'dark';

  const cardSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      const matchFacility =
        selectedFacility === 'ALL' ||
        run.facility.toLowerCase() === selectedFacility.toLowerCase();
      const matchOutcome =
        selectedOutcome === 'ALL' || run.outcome === selectedOutcome;
      const matchFuel =
        selectedFuelGroup === 'ALL' ||
        run.material.toLowerCase().includes(selectedFuelGroup.toLowerCase());

      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        run.psiId.toLowerCase().includes(q) ||
        run.investigationTitle.toLowerCase().includes(q) ||
        run.material.toLowerCase().includes(q) ||
        run.runCode.toLowerCase().includes(q) ||
        run.notes.toLowerCase().includes(q);

      return matchFacility && matchOutcome && matchFuel && matchSearch;
    });
  }, [
    runs,
    searchQuery,
    selectedFacility,
    selectedOutcome,
    selectedFuelGroup,
  ]);

  const outcomeDotColor = (outcome: HazardOutcome) => {
    if (outcome === 'Rapid Flame Spread') return 'bg-[#EF4444]';
    if (outcome === 'Cool Flame Caution') return 'bg-[#F59E0B]';
    return 'bg-[#10B981]';
  };

  const outcomeTextColor = (outcome: HazardOutcome) => {
    if (outcome === 'Rapid Flame Spread') return 'text-[#EF4444]';
    if (outcome === 'Cool Flame Caution') return 'text-[#F59E0B]';
    return 'text-[#10B981]';
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      {/* Left Facet Filter Panel */}
      <aside
        className={`w-full lg:w-[240px] shrink-0 border rounded-[6px] p-4 space-y-5 ${cardSurface}`}
        aria-label="Catalog Filters"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-sans font-semibold uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
          </div>
          {(selectedFacility !== 'ALL' ||
            selectedOutcome !== 'ALL' ||
            selectedFuelGroup !== 'ALL' ||
            searchQuery !== '') && (
            <button
              type="button"
              onClick={() => {
                setSelectedFacility('ALL');
                setSelectedOutcome('ALL');
                setSelectedFuelGroup('ALL');
                setSearchQuery('');
              }}
              className="text-[11px] font-sans text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search PSI ID, material..."
            aria-label="Search PSI Experiment Catalog"
            className={`w-full pl-8 pr-2.5 py-1.5 text-xs rounded-[4px] border focus:outline-none ${
              isDark
                ? 'bg-[#09090B] border-[#27272A] text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500'
                : 'bg-zinc-50 border-[#E4E4E7] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500'
            }`}
          />
        </div>

        {/* Facility Filter Group */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-sans font-semibold text-zinc-500 dark:text-zinc-400">
            Orbital Facility
          </div>
          <div className="space-y-1">
            {[
              { id: 'ALL', label: 'All Facilities' },
              { id: 'CIR', label: 'CIR (Combustion Rack)' },
              { id: 'MSG', label: 'MSG (Microgravity Glovebox)' },
              { id: 'Cygnus', label: 'Cygnus Pressurized Carrier' },
            ].map((fac) => {
              const active = selectedFacility === fac.id;
              return (
                <button
                  key={fac.id}
                  type="button"
                  onClick={() => setSelectedFacility(fac.id)}
                  className={`w-full text-left px-2.5 py-1.5 text-xs font-sans rounded-[4px] transition-colors cursor-pointer ${
                    active
                      ? isDark
                        ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                        : 'bg-[#18181B] text-[#FFFFFF] font-semibold'
                      : isDark
                      ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
                  }`}
                >
                  {fac.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fuel / Material Category Filter */}
        <div className="space-y-1.5 pt-3 border-t border-zinc-200 dark:border-[#27272A]">
          <div className="text-[11px] font-sans font-semibold text-zinc-500 dark:text-zinc-400">
            Fuel & Substrate Class
          </div>
          <div className="space-y-1">
            {[
              { id: 'ALL', label: 'All Fuels & Polymers' },
              { id: 'PMMA', label: 'PMMA Acrylic Solids' },
              { id: 'SIBAL', label: 'SIBAL / Cotton-Fiberglass' },
              { id: 'Ethylene', label: 'Gaseous Diffusion (C₂H₄ / CH₄)' },
              { id: 'Droplet', label: 'Liquid Alkane Droplets' },
            ].map((fuel) => {
              const active = selectedFuelGroup === fuel.id;
              return (
                <button
                  key={fuel.id}
                  type="button"
                  onClick={() => setSelectedFuelGroup(fuel.id)}
                  className={`w-full text-left px-2.5 py-1.5 text-xs font-sans rounded-[4px] transition-colors cursor-pointer ${
                    active
                      ? isDark
                        ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                        : 'bg-[#18181B] text-[#FFFFFF] font-semibold'
                      : isDark
                      ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
                  }`}
                >
                  {fuel.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Combustion Regime Outcome Filter */}
        <div className="space-y-1.5 pt-3 border-t border-zinc-200 dark:border-[#27272A]">
          <div className="text-[11px] font-sans font-semibold text-zinc-500 dark:text-zinc-400">
            Hazard Outcome Regime
          </div>
          <div className="space-y-1">
            {[
              { id: 'ALL', label: 'All Regimes' },
              { id: 'Rapid Flame Spread', label: 'Rapid Flame Spread' },
              { id: 'Cool Flame Caution', label: 'Cool Flame Caution' },
              { id: 'Self-Extinguishing', label: 'Self-Extinguishing' },
            ].map((out) => {
              const active = selectedOutcome === out.id;
              return (
                <button
                  key={out.id}
                  type="button"
                  onClick={() => setSelectedOutcome(out.id)}
                  className={`w-full text-left px-2.5 py-1.5 text-xs font-sans rounded-[4px] transition-colors cursor-pointer ${
                    active
                      ? isDark
                        ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                        : 'bg-[#18181B] text-[#FFFFFF] font-semibold'
                      : isDark
                      ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
                  }`}
                >
                  {out.label}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Right Full-Width Investigation Card Grid */}
      <div className="flex-1 min-w-0 w-full space-y-4">
        {/* Top Action & Selection Summary Bar */}
        <div
          className={`border rounded-[6px] px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${cardSurface}`}
        >
          <div className="flex items-center gap-3 text-xs">
            <span className="font-sans font-medium">
              Showing{' '}
              <span className="font-mono font-semibold tabular-nums">
                {filteredRuns.length}
              </span>{' '}
              of{' '}
              <span className="font-mono font-semibold tabular-nums">
                {runs.length}
              </span>{' '}
              PSI Investigations
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">|</span>
            <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
              {selectedRunIds.length}/4 Selected for Comparison
            </span>
          </div>

          <button
            type="button"
            onClick={onGoToComparator}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-semibold rounded-[4px] transition-colors cursor-pointer ${
              isDark
                ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200'
                : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800'
            }`}
          >
            <span>Open Run Comparator ({selectedRunIds.length})</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Grid of Cards */}
        {filteredRuns.length === 0 ? (
          <div
            className={`border rounded-[6px] p-10 text-center text-xs text-zinc-500 ${cardSurface}`}
          >
            No PSI investigations match the current filter criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredRuns.map((run) => {
              const isChecked = selectedRunIds.includes(run.id);
              const isHighlighted =
                highlightedRunId !== null &&
                (run.id === highlightedRunId ||
                  run.psiId
                    .toLowerCase()
                    .includes(highlightedRunId.toLowerCase()));

              return (
                <article
                  key={run.id}
                  className={`border rounded-[6px] p-4 flex flex-col justify-between transition-colors duration-150 ${cardSurface} ${
                    isHighlighted
                      ? isDark
                        ? 'ring-1 ring-zinc-300'
                        : 'ring-1 ring-zinc-800'
                      : ''
                  }`}
                >
                  <div>
                    {/* Top Row: Clickable PSI ID + Compare Checkbox */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onInspectRun(run.id)}
                            className="font-mono text-sm font-bold tracking-tight hover:underline cursor-pointer text-left truncate"
                          >
                            {run.psiId}
                          </button>
                          {run.isCustom && (
                            <span className="font-mono text-[10px] text-zinc-500">
                              [IMPORTED]
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {run.material} · {run.facility} ·{' '}
                          <span className="font-mono">{run.runCode}</span>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggleRun(run.id)}
                        aria-label={`Compare ${run.psiId}`}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium rounded-[4px] border transition-colors shrink-0 cursor-pointer ${
                          isChecked
                            ? isDark
                              ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA] font-semibold'
                              : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B] font-semibold'
                            : isDark
                            ? 'bg-transparent border-[#27272A] text-zinc-300 hover:bg-zinc-800'
                            : 'bg-zinc-50 border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100'
                        }`}
                      >
                        {isChecked ? (
                          <CheckSquare className="w-3.5 h-3.5" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                        <span>{isChecked ? 'Selected' : 'Compare'}</span>
                      </button>
                    </div>

                    {/* Investigation Notes */}
                    <p className="mt-3 text-xs font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed line-clamp-2">
                      {run.notes}
                    </p>

                    {/* Compact Telemetry Matrix */}
                    <div
                      className={`mt-3.5 pt-3 border-t grid grid-cols-4 gap-2 text-[11px] ${
                        isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                      }`}
                    >
                      <div>
                        <div className="text-[10px] font-sans text-zinc-400">
                          O₂
                        </div>
                        <div className="font-mono font-semibold tabular-nums">
                          {run.O2_pct.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-sans text-zinc-400">
                          Pressure
                        </div>
                        <div className="font-mono font-semibold tabular-nums">
                          {run.P_psi.toFixed(1)} psi
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-sans text-zinc-400">
                          Airflow
                        </div>
                        <div className="font-mono font-semibold tabular-nums">
                          {run.Flow_ms.toFixed(2)} m/s
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-sans text-zinc-400">
                          Spread
                        </div>
                        <div className="font-mono font-bold tabular-nums">
                          {run.flameSpread_mms.toFixed(2)} mm/s
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Semantic Outcome Status + Inspect / Simulate */}
                  <div
                    className={`mt-3.5 pt-3 border-t flex items-center justify-between gap-2 ${
                      isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                    }`}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 text-xs font-sans font-semibold ${outcomeTextColor(
                        run.outcome
                      )}`}
                    >
                      <span
                        className={`w-2 h-2 rounded-[2px] ${outcomeDotColor(
                          run.outcome
                        )}`}
                        aria-hidden="true"
                      />
                      <span>{run.outcome}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onInspectRun(run.id)}
                        className={`px-2 py-1 text-[11px] font-sans font-medium rounded-[4px] border transition-colors cursor-pointer ${
                          isDark
                            ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800'
                            : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100'
                        }`}
                      >
                        Inspect
                      </button>
                      <button
                        type="button"
                        onClick={() => onApplyRunToSliders(run)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans font-medium rounded-[4px] border transition-colors cursor-pointer ${
                          isDark
                            ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800 hover:text-white'
                            : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950'
                        }`}
                      >
                        <Sliders className="w-3 h-3" />
                        <span>Simulate</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
