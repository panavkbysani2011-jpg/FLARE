import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Flame,
  AlertTriangle,
  Search,
  ShieldCheck,
  Sliders,
  Square,
} from 'lucide-react';
import {
  LiteratureChunk,
  PsiInvestigationRecord,
  PsiRun,
  ThemeMode,
} from '../types/psi';
import {
  FACILITY_DESCRIPTIONS,
  buildInvestigationArtifacts,
  getCanonicalPsiId,
  getPsiSourceLink,
} from '../utils/investigationArtifacts';
import { getRunsForInvestigation } from '../services/dataLoader';

interface PsiInvestigationDetailViewProps {
  run: PsiRun | null;
  investigationRecord?: PsiInvestigationRecord | null;
  allRuns: PsiRun[];
  literatureChunks?: LiteratureChunk[];
  selectedRunIds: string[];
  theme: ThemeMode;
  backLabel: string;
  isSelectedForComparison: boolean;
  selectedRunsCount: number;
  onBack: () => void;
  onToggleComparison: (runId: string) => void;
  onLoadIntoSimulator: (run: PsiRun) => void;
  onSelectRun: (runId: string) => void;
}

const RUNS_PER_PAGE = 25;

export const PsiInvestigationDetailView: React.FC<
  PsiInvestigationDetailViewProps
> = ({
  run,
  investigationRecord,
  allRuns,
  literatureChunks = [],
  selectedRunIds,
  theme,
  backLabel,
  isSelectedForComparison,
  selectedRunsCount,
  onBack,
  onToggleComparison,
  onLoadIntoSimulator,
  onSelectRun,
}) => {
  const artifacts = useMemo(
    () => (run ? buildInvestigationArtifacts(run) : []),
    [run]
  );
  const [activeArtifactId, setActiveArtifactId] = useState<string>('');
  const [runTableSearch, setRunTableSearch] = useState('');
  const [runPage, setRunPage] = useState(1);

  useEffect(() => {
    if (artifacts.length > 0) {
      setActiveArtifactId(artifacts[0].id);
    }
  }, [artifacts]);

  useEffect(() => {
    setRunPage(1);
    setRunTableSearch('');
  }, [investigationRecord?.psiId, run?.id]);

  const activeArtifact =
    artifacts.find((a) => a.id === activeArtifactId) ?? artifacts[0];

  const canonicalId = useMemo(() => {
    if (investigationRecord) return investigationRecord.psiId;
    return run ? getCanonicalPsiId(run) : 'PSI';
  }, [investigationRecord, run]);

  // All CSV runs belonging to this investigation
  const investigationRuns = useMemo(() => {
    const base = getRunsForInvestigation(canonicalId, allRuns);
    const q = runTableSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (r) =>
        r.runCode.toLowerCase().includes(q) ||
        r.psiId.toLowerCase().includes(q) ||
        r.material.toLowerCase().includes(q) ||
        r.outcome.toLowerCase().includes(q)
    );
  }, [canonicalId, allRuns, runTableSearch]);

  const totalRunPages = Math.max(
    1,
    Math.ceil(investigationRuns.length / RUNS_PER_PAGE)
  );
  const clampedPage = Math.min(runPage, totalRunPages);
  const pagedInvestigationRuns = useMemo(() => {
    const start = (clampedPage - 1) * RUNS_PER_PAGE;
    return investigationRuns.slice(start, start + RUNS_PER_PAGE);
  }, [investigationRuns, clampedPage]);

  // Real literature chunks associated with this PSI investigation
  const investigationChunks = useMemo(() => {
    const idPrefix = canonicalId.toUpperCase();
    return literatureChunks
      .filter((c) => {
        const cid = c.psi_id.toUpperCase();
        if (cid === idPrefix) return true;
        if (idPrefix === 'PSI-20' && cid === 'PSI-22') return true;
        if (idPrefix === 'PSI-102' && cid === 'PSI-101') return true;
        return false;
      })
      .slice(0, 8);
  }, [canonicalId, literatureChunks]);

  const csvRows = useMemo(() => {
    if (!activeArtifact || activeArtifact.format !== 'CSV') return [];
    return activeArtifact.content
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split(','));
  }, [activeArtifact]);

  const isDark = theme === 'dark';

  const cardSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const cellSurface = isDark
    ? 'bg-[#09090B] border-[#27272A]'
    : 'bg-zinc-50 border-[#E4E4E7]';

  const dividerBorder = isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]';

  if (!run) {
    return (
      <div
        className={`border rounded-[6px] p-10 text-center space-y-4 ${cardSurface}`}
      >
        <p className="text-sm font-sans text-zinc-500 dark:text-zinc-400">
          No PSI investigation is currently selected.
        </p>
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-semibold rounded-[4px] cursor-pointer ${
            isDark
              ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200'
              : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800'
          }`}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to {backLabel}</span>
        </button>
      </div>
    );
  }

  const sourceLink = getPsiSourceLink(run);

  const statusMeta =
    run.outcome === 'Rapid Flame Spread'
      ? {
          color: 'text-[#EF4444]',
          bg: 'bg-[#EF4444]/10 border-[#EF4444]/30',
          icon: Flame,
        }
      : run.outcome === 'Cool Flame Caution'
      ? {
          color: 'text-[#F59E0B]',
          bg: 'bg-[#F59E0B]/10 border-[#F59E0B]/30',
          icon: AlertTriangle,
        }
      : {
          color: 'text-[#10B981]',
          bg: 'bg-[#10B981]/10 border-[#10B981]/30',
          icon: ShieldCheck,
        };

  const StatusIcon = statusMeta.icon;

  const handleDownloadArtifact = () => {
    if (!activeArtifact) return;
    const blob = new Blob([activeArtifact.content], {
      type:
        activeArtifact.format === 'CSV'
          ? 'text/csv;charset=utf-8'
          : 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeArtifact.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const telemetryCells = [
    {
      label: 'O₂ Concentration',
      value: `${run.O2_pct.toFixed(1)}% O₂`,
      sub: 'Oxidizer Mole Fraction',
    },
    {
      label: 'Cabin Pressure',
      value: `${run.P_psi.toFixed(1)} psi`,
      sub: `${(run.P_psi * 6.89476).toFixed(1)} kPa`,
    },
    {
      label: 'Forced Airflow',
      value: `${run.Flow_ms.toFixed(2)} m/s`,
      sub: `${(run.Flow_ms * 100).toFixed(0)} cm/s duct velocity`,
    },
    {
      label: 'Effective Gravity',
      value: `${run.g_eff.toFixed(3)}g`,
      sub: run.g_eff === 0 ? 'Microgravity (0g)' : 'Partial / Terrestrial',
    },
    {
      label: 'Sample Thickness',
      value: `${run.Thickness_mm.toFixed(2)} mm`,
      sub: run.material,
    },
    {
      label: 'Peak Gas Temp',
      value: `${run.peakTemp_K} K`,
      sub: 'Radiation-corrected TC',
    },
    {
      label: 'Radiometer IR Flux',
      value: `${run.radiometerFlux_Wm2.toLocaleString()} W/m²`,
      sub: 'Narrow-band thermopile',
    },
    {
      label: 'Flame Spread Rate',
      value: `${run.flameSpread_mms.toFixed(2)} mm/s`,
      sub:
        run.flameSpread_mms < 0.48
          ? 'Below 0.48 quench bound'
          : 'Sustained propagation',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Breadcrumb & Primary Action Bar */}
      <div
        className={`border rounded-[6px] px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${cardSurface}`}
      >
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-2 text-xs font-sans font-medium transition-colors cursor-pointer ${
            isDark
              ? 'text-zinc-300 hover:text-white'
              : 'text-zinc-600 hover:text-zinc-950'
          }`}
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
          <span>Back to {backLabel}</span>
          <span className="text-zinc-400" aria-hidden="true">
            /
          </span>
          <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
            {canonicalId}
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleComparison(run.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium rounded-[4px] border transition-colors cursor-pointer ${
              isSelectedForComparison
                ? isDark
                  ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                  : 'border-zinc-400 bg-zinc-100 text-zinc-900'
                : isDark
                ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800'
                : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            {isSelectedForComparison ? (
              <CheckSquare className="w-3.5 h-3.5" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            <span>
              {isSelectedForComparison
                ? `In Comparator (${selectedRunsCount}/4)`
                : `Add to Comparator (${selectedRunsCount}/4)`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onLoadIntoSimulator(run)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-sans font-semibold rounded-[4px] transition-colors cursor-pointer ${
              isDark
                ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200'
                : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Load Parameters into Simulator</span>
          </button>
        </div>
      </div>

      {/* 1. Header & Executive Summary */}
      <section className={`border rounded-[6px] p-5 space-y-4 ${cardSurface}`}>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono font-bold tracking-tight">
                {investigationRecord
                  ? `${investigationRecord.psiId} · ${investigationRecord.acronym}`
                  : run.psiId}
              </span>
              <span className="text-zinc-400">·</span>
              <span className="font-mono text-zinc-500 dark:text-zinc-400">
                Active Run: {run.runCode}
              </span>
              <span className="text-zinc-400">·</span>
              <span className="font-mono text-zinc-500 dark:text-zinc-400">
                Facility: {run.facility}
              </span>
              {investigationRecord?.doi && (
                <>
                  <span className="text-zinc-400">·</span>
                  <span className="font-mono text-zinc-500 dark:text-zinc-400">
                    DOI: {investigationRecord.doi}
                  </span>
                </>
              )}
            </div>

            <h2 className="font-display text-xl font-bold tracking-tight leading-snug">
              {investigationRecord?.title ?? run.investigationTitle}
            </h2>

            <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
              Fuel / Substrate:{' '}
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {run.material}
              </span>{' '}
              · Cool-Flame Regime:{' '}
              <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                {run.coolFlameObserved
                  ? 'DETECTED (550K–800K NTC)'
                  : 'NOT OBSERVED'}
              </span>
              {investigationRecord?.principalInvestigators &&
                investigationRecord.principalInvestigators.length > 0 && (
                  <>
                    {' '}
                    · Investigators:{' '}
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">
                      {investigationRecord.principalInvestigators.join(', ')}
                    </span>
                  </>
                )}
            </p>
          </div>

          {/* Safety Regime Status Panel */}
          <div
            className={`px-4 py-3 rounded-[5px] border flex items-center gap-3 shrink-0 ${statusMeta.bg}`}
          >
            <StatusIcon className={`w-5 h-5 shrink-0 ${statusMeta.color}`} />
            <div>
              <div className="text-[10px] font-sans uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Safety Regime Status
              </div>
              <div className={`text-sm font-sans font-bold ${statusMeta.color}`}>
                {run.outcome}
              </div>
            </div>
            <div className={`pl-3 ml-1 border-l ${dividerBorder} text-right`}>
              <div className="text-[10px] font-sans text-zinc-500 dark:text-zinc-400">
                Spread Rate
              </div>
              <div className="font-mono text-sm font-bold tabular-nums">
                {run.flameSpread_mms.toFixed(2)} mm/s
              </div>
            </div>
          </div>
        </div>

        {/* Hardware Facility & Investigation Objective / Hypothesis */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2">
          <div
            className={`lg:col-span-5 p-4 rounded-[5px] border space-y-1.5 ${cellSurface}`}
          >
            <div className="flex items-center gap-1.5 text-xs font-sans font-semibold">
              <Cpu className="w-3.5 h-3.5 text-zinc-400" />
              <span>
                Hardware Facility —{' '}
                {investigationRecord?.hardwareRaw || run.facility}
              </span>
            </div>
            <p className="text-xs font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {FACILITY_DESCRIPTIONS[run.facility]}
            </p>
            {investigationRecord && (
              <div className="pt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                Center: {investigationRecord.managingCenter} ·{' '}
                {investigationRecord.flightPlatform}
              </div>
            )}
          </div>

          <div
            className={`lg:col-span-7 p-4 rounded-[5px] border space-y-1.5 ${cellSurface}`}
          >
            <div className="flex items-center gap-1.5 text-xs font-sans font-semibold">
              <BookOpen className="w-3.5 h-3.5 text-zinc-400" />
              <span>Science Objective & Key Findings</span>
            </div>
            <p className="text-xs font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {investigationRecord?.objective || run.notes}
            </p>
            {investigationRecord?.hypothesis && (
              <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 leading-relaxed pt-1 border-t border-zinc-200 dark:border-zinc-800">
                <strong className="text-zinc-700 dark:text-zinc-200">
                  Hypothesis:{' '}
                </strong>
                {investigationRecord.hypothesis}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 2. Calibrated Telemetry & Real CSV Experimental Runs Table */}
      <section className={`border rounded-[6px] p-5 space-y-4 ${cardSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-semibold">
              Active Run Telemetry ({run.runCode}) & Experimental CSV Sweep Table
            </h3>
            <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 mt-0.5">
              Showing calibrated parameters for {run.runCode} and all{' '}
              <span className="font-mono font-semibold">
                {investigationRuns.length}
              </span>{' '}
              experimental runs parsed from{' '}
              <span className="font-mono">master_psi_telemetry.csv</span>.
            </p>
          </div>
          <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            Record {canonicalId} / {run.runCode}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {telemetryCells.map((cell) => (
            <div
              key={cell.label}
              className={`p-3 rounded-[4px] border ${cellSurface}`}
            >
              <div className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                {cell.label}
              </div>
              <div className="font-mono text-sm font-bold tabular-nums mt-1">
                {cell.value}
              </div>
              <div className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                {cell.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Paginated Experimental Runs Table from master_psi_telemetry.csv */}
        <div className="pt-2 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-sans font-semibold text-zinc-700 dark:text-zinc-200">
              {canonicalId} Experimental Runs ({investigationRuns.length} rows)
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3 h-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={runTableSearch}
                  onChange={(e) => {
                    setRunTableSearch(e.target.value);
                    setRunPage(1);
                  }}
                  placeholder="Filter runs by fuel or code..."
                  className={`pl-7 pr-2.5 py-1 text-xs font-sans rounded-[4px] border focus:outline-none ${
                    isDark
                      ? 'bg-[#09090B] border-[#27272A] text-zinc-100 placeholder:text-zinc-500'
                      : 'bg-zinc-50 border-[#E4E4E7] text-zinc-900 placeholder:text-zinc-400'
                  }`}
                />
              </div>

              {totalRunPages > 1 && (
                <div className="flex items-center gap-1 text-xs font-mono">
                  <button
                    type="button"
                    disabled={clampedPage <= 1}
                    onClick={() => setRunPage((p) => Math.max(1, p - 1))}
                    className={`p-1 rounded-[4px] border disabled:opacity-40 cursor-pointer ${
                      isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                    }`}
                    aria-label="Previous runs page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 tabular-nums">
                    {clampedPage}/{totalRunPages}
                  </span>
                  <button
                    type="button"
                    disabled={clampedPage >= totalRunPages}
                    onClick={() =>
                      setRunPage((p) => Math.min(totalRunPages, p + 1))
                    }
                    className={`p-1 rounded-[4px] border disabled:opacity-40 cursor-pointer ${
                      isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                    }`}
                    aria-label="Next runs page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div
            className={`border rounded-[5px] overflow-x-auto ${dividerBorder}`}
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
                  <th className="py-2 px-3">Run Code</th>
                  <th className="py-2 px-3">Campaign</th>
                  <th className="py-2 px-3">Substrate / Fuel</th>
                  <th className="py-2 px-3 text-right">O₂ %</th>
                  <th className="py-2 px-3 text-right">Pressure</th>
                  <th className="py-2 px-3 text-right">Airflow</th>
                  <th className="py-2 px-3 text-right">Thickness</th>
                  <th className="py-2 px-3 text-right">Peak Temp</th>
                  <th className="py-2 px-3 text-right">Spread</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${dividerBorder}`}>
                {pagedInvestigationRuns.map((rel) => {
                  const isActiveRow = rel.id === run.id;
                  const isInCompare = selectedRunIds.includes(rel.id);
                  return (
                    <tr
                      key={rel.id}
                      onClick={() => onSelectRun(rel.id)}
                      className={`cursor-pointer transition-colors ${
                        isActiveRow
                          ? isDark
                            ? 'bg-zinc-800/50'
                            : 'bg-zinc-100'
                          : isDark
                          ? 'hover:bg-white/[0.03]'
                          : 'hover:bg-zinc-50'
                      }`}
                    >
                      <td className="py-2 px-3 font-mono font-semibold whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {rel.runCode}
                          <ArrowUpRight className="w-3 h-3 text-zinc-400" />
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-zinc-500 whitespace-nowrap">
                        {rel.psiId.split(' ')[0]}
                      </td>
                      <td className="py-2 px-3 font-sans truncate max-w-[210px]">
                        {rel.material}
                      </td>
                      <td className="py-2 px-3 font-mono text-right tabular-nums">
                        {rel.O2_pct.toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 font-mono text-right tabular-nums">
                        {rel.P_psi.toFixed(1)} psi
                      </td>
                      <td className="py-2 px-3 font-mono text-right tabular-nums">
                        {rel.Flow_ms.toFixed(2)} m/s
                      </td>
                      <td className="py-2 px-3 font-mono text-right tabular-nums">
                        {rel.Thickness_mm.toFixed(2)} mm
                      </td>
                      <td className="py-2 px-3 font-mono text-right tabular-nums">
                        {rel.peakTemp_K} K
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-right tabular-nums">
                        {rel.flameSpread_mms.toFixed(2)} mm/s
                      </td>
                      <td
                        className="py-2 px-3 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onToggleComparison(rel.id)}
                            className={`px-2 py-0.5 text-[10px] font-sans rounded-[3px] border cursor-pointer ${
                              isInCompare
                                ? isDark
                                  ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA]'
                                  : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B]'
                                : isDark
                                ? 'border-[#27272A] text-zinc-300'
                                : 'border-[#E4E4E7] text-zinc-700'
                            }`}
                          >
                            {isInCompare ? 'Selected' : 'Compare'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onLoadIntoSimulator(rel)}
                            className={`px-2 py-0.5 text-[10px] font-sans rounded-[3px] border cursor-pointer ${
                              isDark
                                ? 'border-[#27272A] text-zinc-200 hover:bg-zinc-800'
                                : 'border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100'
                            }`}
                          >
                            Simulate
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 3. Archive Inventory, Literature Excerpts & Publications */}
      {(investigationRecord || investigationChunks.length > 0) && (
        <section className={`border rounded-[6px] p-5 space-y-4 ${cardSurface}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold">
              Archive Reports, Literature Chunks & Peer-Reviewed Publications
            </h3>
            {investigationRecord && (
              <span className="font-mono text-[11px] text-zinc-500">
                {investigationRecord.auditStatus}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Literature Chunks for this PSI */}
            <div className="lg:col-span-7 space-y-2.5">
              <div className="text-xs font-sans font-semibold text-zinc-600 dark:text-zinc-300">
                Indexed Technical Literature Chunks ({investigationChunks.length})
              </div>
              {investigationChunks.length === 0 ? (
                <div
                  className={`p-3 rounded-[4px] border text-xs font-sans text-zinc-500 ${cellSurface}`}
                >
                  Metadata-only / tabular dataset in archive (see generated engineering protocol artifacts below).
                </div>
              ) : (
                investigationChunks.map((ch) => (
                  <div
                    key={ch.chunk_id}
                    className={`p-3 rounded-[4px] border space-y-1 ${cellSurface}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-zinc-500">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {ch.psi_id} · p. {ch.page_number}
                      </span>
                      <span className="truncate max-w-[280px]">
                        {ch.source_file}
                      </span>
                    </div>
                    <p className="text-xs font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed line-clamp-3">
                      {ch.text.replace(/\s+/g, ' ').trim()}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Publications + File Manifest */}
            <div className="lg:col-span-5 space-y-3">
              {investigationRecord &&
                investigationRecord.publications.length > 0 && (
                  <div
                    className={`p-3.5 rounded-[5px] border space-y-2 ${cellSurface}`}
                  >
                    <div className="text-xs font-sans font-semibold">
                      Peer-Reviewed Publications (
                      {investigationRecord.publications.length})
                    </div>
                    <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                      {investigationRecord.publications
                        .slice(0, 8)
                        .map((pub, idx) => (
                          <div
                            key={idx}
                            className={`pb-2 border-b last:border-b-0 last:pb-0 text-xs ${dividerBorder}`}
                          >
                            {pub.link ? (
                              <a
                                href={pub.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-sans font-medium hover:underline inline-flex items-start gap-1"
                              >
                                <span>{pub.title}</span>
                                <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
                              </a>
                            ) : (
                              <div className="font-sans font-medium">
                                {pub.title}
                              </div>
                            )}
                            {pub.authors && (
                              <div className="text-[11px] font-sans text-zinc-500 mt-0.5 line-clamp-1">
                                {pub.authors}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

              {investigationRecord && (
                <div
                  className={`p-3.5 rounded-[5px] border space-y-2 ${cellSurface}`}
                >
                  <div className="text-xs font-sans font-semibold">
                    Manifest Source Files (
                    {investigationRecord.spreadsheets.length} tables ·{' '}
                    {investigationRecord.pdfs.length} PDFs)
                  </div>
                  <div className="space-y-1 max-h-[160px] overflow-y-auto font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {investigationRecord.spreadsheets.map((s) => (
                      <div key={s} className="truncate text-zinc-700 dark:text-zinc-200">
                        [CSV/XLS] {s}
                      </div>
                    ))}
                    {investigationRecord.pdfs.slice(0, 12).map((p) => (
                      <div key={p} className="truncate">
                        [PDF] {p}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 4. Generated Protocol & Calibrated Artifacts Browser */}
      <section className={`border rounded-[6px] p-5 space-y-4 ${cardSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-semibold">
              Investigation Protocol & Calibrated Run Summaries
            </h3>
            <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 mt-0.5">
              Inspect generated protocols, sensor calibration bounds, and time-slice telemetry for {run.runCode}.
            </p>
          </div>
          <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            {artifacts.length} Calibrated Summaries
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-5 space-y-2">
            {artifacts.map((art) => {
              const isSelected = activeArtifact?.id === art.id;
              const Icon = art.format === 'CSV' ? FileSpreadsheet : FileText;
              return (
                <button
                  key={art.id}
                  type="button"
                  onClick={() => setActiveArtifactId(art.id)}
                  className={`w-full text-left p-3 rounded-[4px] border transition-colors cursor-pointer ${
                    isSelected
                      ? isDark
                        ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA]'
                        : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B]'
                      : isDark
                      ? 'bg-[#09090B] border-[#27272A] text-zinc-200 hover:border-zinc-500'
                      : 'bg-zinc-50 border-[#E4E4E7] text-zinc-900 hover:border-zinc-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-sans text-xs font-semibold truncate">
                        {art.title}
                      </span>
                    </div>
                    <span
                      className={`font-mono text-[10px] shrink-0 tabular-nums ${
                        isSelected
                          ? isDark
                            ? 'text-zinc-700'
                            : 'text-zinc-300'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {art.format} · {art.sizeLabel}
                    </span>
                  </div>
                  <div
                    className={`font-mono text-[10px] mt-1 truncate ${
                      isSelected
                        ? isDark
                          ? 'text-zinc-700'
                          : 'text-zinc-300'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {art.fileName} · {art.revision}
                  </div>
                </button>
              );
            })}
          </div>

          {activeArtifact && (
            <div
              className={`lg:col-span-7 border rounded-[5px] overflow-hidden ${cellSurface}`}
            >
              <div
                className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 ${dividerBorder}`}
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold truncate">
                    {activeArtifact.fileName}
                  </div>
                  <div className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                    {activeArtifact.category} · {activeArtifact.revision}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadArtifact}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-sans font-medium rounded-[4px] border transition-colors cursor-pointer ${
                    isDark
                      ? 'border-[#27272A] bg-[#121215] text-zinc-200 hover:bg-zinc-800'
                      : 'border-[#E4E4E7] bg-white text-zinc-800 hover:bg-zinc-100'
                  }`}
                >
                  <Download className="w-3 h-3" />
                  <span>Download {activeArtifact.format}</span>
                </button>
              </div>

              {activeArtifact.format === 'CSV' && csvRows.length > 1 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                    <thead>
                      <tr className={`border-b ${dividerBorder}`}>
                        {csvRows[0].map((col) => (
                          <th
                            key={col}
                            className="py-2 px-3 font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${dividerBorder}`}>
                      {csvRows.slice(1).map((row, idx) => (
                        <tr key={idx}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="py-2 px-3 whitespace-nowrap">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap text-zinc-700 dark:text-zinc-200 overflow-x-auto">
                  {activeArtifact.content}
                </pre>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 5. External Source Footer Bar */}
      <footer
        className={`border rounded-[6px] px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${cardSurface}`}
      >
        <div className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
          Verified Physical Science Informatics (PSI) Archive Metadata ·{' '}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {canonicalId}
          </span>
        </div>

        <a
          href={investigationRecord?.psiSourceUrl ?? sourceLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1.5 text-xs font-mono font-semibold hover:underline ${
            isDark ? 'text-[#FAFAFA]' : 'text-[#18181B]'
          }`}
        >
          <span>
            Official PSI Archive Source: {sourceLink.displayPath} ↗
          </span>
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
        </a>
      </footer>
    </div>
  );
};
