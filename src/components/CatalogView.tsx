import React, { useMemo, useState } from 'react';
import {
  Search,
  Filter,
  CheckSquare,
  Square,
  Sliders,
  ArrowUpRight,
  ExternalLink,
  FileText,
  BookOpen,
  Flame,
  Database,
  Play,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';
import {
  DataArchiveTab,
  HazardOutcome,
  LiteratureChunk,
  LiteratureCorpusStats,
  MissionSpinoffCase,
  PsiInvestigationRecord,
  PsiRun,
  ResearchersGuideTopic,
  ThemeMode,
} from '../types/psi';
import {
  RESEARCHERS_GUIDE_PDF_URL,
  SAME_EIRD_PDF_URL,
  searchLiteratureChunks,
} from '../services/dataLoader';
import { CollapsibleCard } from './CollapsibleCard';

interface CatalogViewProps {
  theme: ThemeMode;
  activeTabOverride?: DataArchiveTab;
  onChangeTab?: (tab: DataArchiveTab) => void;
  guideJumpHint?: { topicId?: string; searchHint?: string; nonce: number } | null;
  runs: PsiRun[];
  investigations: PsiInvestigationRecord[];
  guideTopics: ResearchersGuideTopic[];
  literatureChunks: LiteratureChunk[];
  corpusStats: LiteratureCorpusStats | null;
  missionCases: MissionSpinoffCase[];
  isArchiveLoading?: boolean;
  selectedRunIds: string[];
  highlightedRunId: string | null;
  onToggleRun: (runId: string) => void;
  onApplyRunToSliders: (run: PsiRun) => void;
  onSimulateEnvironment: (
    env: NonNullable<MissionSpinoffCase['simulatableEnvironment']>
  ) => void;
  onInspectRun: (runId: string) => void;
  onGoToComparator: () => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  theme,
  activeTabOverride,
  onChangeTab,
  guideJumpHint,
  runs,
  investigations,
  guideTopics,
  literatureChunks,
  corpusStats,
  missionCases,
  isArchiveLoading = false,
  selectedRunIds,
  highlightedRunId,
  onToggleRun,
  onApplyRunToSliders,
  onSimulateEnvironment,
  onInspectRun,
  onGoToComparator,
}) => {
  const [internalTab, setInternalTab] =
    useState<DataArchiveTab>('psi-investigations');
  const activeTab = activeTabOverride ?? internalTab;
  const setActiveTab = (tab: DataArchiveTab) => {
    setInternalTab(tab);
    onChangeTab?.(tab);
  };
  const [showFilters, setShowFilters] = useState(true);

  // Tab 1: PSI Investigations filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFacility, setSelectedFacility] = useState<string>('ALL');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('ALL');
  const [selectedFuelGroup, setSelectedFuelGroup] = useState<string>('ALL');

  // Tab 2: ISS Researcher's Guide states
  const [guideSearch, setGuideSearch] = useState('');
  const [guideCategory, setGuideCategory] = useState<string>('ALL');
  const [expandedTopicIds, setExpandedTopicIds] = useState<string[]>([
    'guide-sec-3',
    'guide-sec-4',
  ]);
  const [showInlinePdf, setShowInlinePdf] = useState(false);

  // Tab 3: Mission & Spin-Off Cases states
  const [caseSearch, setCaseSearch] = useState('');
  const [caseCategory, setCaseCategory] = useState<string>('ALL');

  React.useEffect(() => {
    if (!guideJumpHint) return;
    if (guideJumpHint.topicId) {
      setGuideSearch('');
      setExpandedTopicIds((prev) =>
        prev.includes(guideJumpHint.topicId!)
          ? prev
          : [guideJumpHint.topicId!, ...prev]
      );
    } else if (guideJumpHint.searchHint) {
      setGuideSearch(guideJumpHint.searchHint);
    }
  }, [guideJumpHint]);

  const isDark = theme === 'dark';

  const cardSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const insetSurface = isDark
    ? 'bg-[#09090B] border-[#27272A]'
    : 'bg-zinc-50 border-[#E4E4E7]';

  const dividerBorder = isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]';

  const activeMonochrome = isDark
    ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
    : 'bg-[#18181B] text-[#FFFFFF] font-semibold';

  const inactiveMonochrome = isDark
    ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100';

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

  // Filtered PSI Investigations (Tab 1)
  const filteredInvestigations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return investigations.filter((inv) => {
      const matchFacility =
        selectedFacility === 'ALL' ||
        inv.facility.toLowerCase() === selectedFacility.toLowerCase() ||
        inv.hardwareRaw.toLowerCase().includes(selectedFacility.toLowerCase());

      const matchOutcome =
        selectedOutcome === 'ALL' || inv.dominantOutcome === selectedOutcome;

      const fuelHaystack = [
        ...inv.fuels,
        inv.title,
        inv.subResearchArea,
        inv.objective,
      ]
        .join(' ')
        .toLowerCase();

      const matchFuel =
        selectedFuelGroup === 'ALL' ||
        (selectedFuelGroup === 'Ethylene'
          ? fuelHaystack.includes('c2h4') ||
            fuelHaystack.includes('ch4') ||
            fuelHaystack.includes('ethylene') ||
            fuelHaystack.includes('methane') ||
            fuelHaystack.includes('ethane') ||
            fuelHaystack.includes('gaseous')
          : selectedFuelGroup === 'Droplet'
          ? fuelHaystack.includes('droplet') ||
            fuelHaystack.includes('heptane') ||
            fuelHaystack.includes('octane') ||
            fuelHaystack.includes('dodecane') ||
            fuelHaystack.includes('methanol')
          : fuelHaystack.includes(selectedFuelGroup.toLowerCase()));

      const searchHaystack = [
        inv.psiId,
        inv.acronym,
        inv.title,
        inv.hardwareRaw,
        inv.managingCenter,
        inv.objective,
        ...inv.fuels,
        ...inv.principalInvestigators,
      ]
        .join(' ')
        .toLowerCase();

      const matchSearch = !q || searchHaystack.includes(q);
      return matchFacility && matchOutcome && matchFuel && matchSearch;
    });
  }, [
    investigations,
    searchQuery,
    selectedFacility,
    selectedOutcome,
    selectedFuelGroup,
  ]);

  // Filtered ISS Researcher's Guide Topics & Live Chunks (Tab 2)
  const filteredGuideTopics = useMemo(() => {
    const q = guideSearch.trim().toLowerCase();
    return guideTopics.filter((topic) => {
      const matchCat =
        guideCategory === 'ALL' || topic.category === guideCategory;
      if (!matchCat) return false;
      if (!q) return true;
      const inSummary =
        topic.title.toLowerCase().includes(q) ||
        topic.summary.toLowerCase().includes(q) ||
        topic.keyTakeaways.some((k) => k.toLowerCase().includes(q));
      const inChunks = topic.chunks.some((c) =>
        c.text.toLowerCase().includes(q)
      );
      return inSummary || inChunks;
    });
  }, [guideTopics, guideSearch, guideCategory]);

  const matchedLiteratureChunks = useMemo(() => {
    if (!guideSearch.trim()) return [];
    return searchLiteratureChunks(guideSearch, literatureChunks, 10);
  }, [guideSearch, literatureChunks]);

  // Filtered Mission & Spin-Off Cases (Tab 3)
  const filteredCases = useMemo(() => {
    const q = caseSearch.trim().toLowerCase();
    return missionCases.filter((item) => {
      const matchCat =
        caseCategory === 'ALL' || item.category === caseCategory;
      if (!matchCat) return false;
      if (!q) return true;
      const haystack = [
        item.code,
        item.title,
        item.missionOrDomain,
        item.atmosphereLabel,
        item.summary,
        ...item.lessonsLearned,
        ...item.relatedPsiIds,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [missionCases, caseSearch, caseCategory]);

  const toggleTopicExpand = (id: string) => {
    setExpandedTopicIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-lg font-bold tracking-tight">
          {activeTab === 'psi-investigations'
            ? `PSI Investigations Archive (${investigations.length})`
            : activeTab === 'researchers-guide'
            ? "ISS Researcher's Guide to Combustion Science"
            : `Mission & Earth Spin-Off Cases (${missionCases.length})`}
        </h1>
        <span className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
          Physical Science Informatics Unified Repository
        </span>
      </div>

      {/* Top Unified Data Archive Navigation Bar */}
      <section
        className={`border rounded-[6px] p-3.5 flex flex-wrap items-center justify-between gap-3 ${cardSurface}`}
        aria-label="Data Archive Sections"
      >
        <div
          className={`flex flex-wrap items-center p-0.5 rounded-[5px] border gap-0.5 ${
            isDark ? 'bg-[#09090B] border-[#27272A]' : 'bg-zinc-100 border-[#E4E4E7]'
          }`}
          role="tablist"
          aria-label="Data Archive Sub-Tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'psi-investigations'}
            onClick={() => setActiveTab('psi-investigations')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-sans rounded-lg transition-all cursor-pointer ${
              activeTab === 'psi-investigations'
                ? activeMonochrome
                : inactiveMonochrome
            }`}
          >
            <Database className="w-3.5 h-3.5 shrink-0" />
            <span>PSI Investigations</span>
            <span className="font-mono text-[11px] opacity-80 tabular-nums">
              ({investigations.length})
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'researchers-guide'}
            onClick={() => setActiveTab('researchers-guide')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-sans rounded-lg transition-all cursor-pointer ${
              activeTab === 'researchers-guide'
                ? activeMonochrome
                : inactiveMonochrome
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>ISS Researcher's Guide</span>
            <span className="font-mono text-[11px] opacity-80 tabular-nums">
              (50 pp.)
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'mission-spinoffs'}
            onClick={() => setActiveTab('mission-spinoffs')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-sans rounded-lg transition-all cursor-pointer ${
              activeTab === 'mission-spinoffs'
                ? activeMonochrome
                : inactiveMonochrome
            }`}
          >
            <Flame className="w-3.5 h-3.5 shrink-0" />
            <span>Mission & Spin-Off Cases</span>
            <span className="font-mono text-[11px] opacity-80 tabular-nums">
              ({missionCases.length})
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="font-sans text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="font-mono tabular-nums">{runs.length.toLocaleString()}</span> Test Runs ·{' '}
            {corpusStats ? (
              <>
                <span className="font-mono tabular-nums">
                  {corpusStats.totalRawChunks.toLocaleString()}
                </span>{' '}
                Indexed Guide Sections
              </>
            ) : (
              <>
                <span className="font-mono tabular-nums">{literatureChunks.length}</span> Indexed Sections
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onGoToComparator}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-sans font-semibold rounded-lg shadow-xs hover:shadow-sm active:scale-[0.98] transition-all cursor-pointer ${
              isDark
                ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200'
                : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800'
            }`}
          >
            <span>Run Comparator ({selectedRunIds.length}/4)</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* TAB 1: PSI INVESTIGATIONS (18 REAL INVESTIGATIONS FROM CATALOG & CSV) */}
      {activeTab === 'psi-investigations' && (
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* Left Facet Filter Panel */}
          {showFilters && (
            <aside
              className={`w-full lg:w-[240px] shrink-0 border rounded-[6px] p-4 space-y-5 ${cardSurface}`}
              aria-label="Investigation Filters"
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
                placeholder="Search PSI ID, acronym, PI, fuel..."
                aria-label="Search PSI Investigations"
                className={`w-full pl-8 pr-2.5 py-1.5 text-xs font-sans rounded-[4px] border focus:outline-none ${
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
                  { id: 'CIR', label: 'CIR / ACME / MDCA' },
                  { id: 'MSG', label: 'MSG (Microgravity Glovebox)' },
                  { id: 'Cygnus', label: 'Cygnus (SAFFIRE)' },
                  { id: 'FSL', label: 'Counterflow / Lab' },
                ].map((fac) => {
                  const active = selectedFacility === fac.id;
                  return (
                    <button
                      key={fac.id}
                      type="button"
                      onClick={() => setSelectedFacility(fac.id)}
                      className={`w-full text-left px-2.5 py-1.5 text-xs font-sans rounded-[4px] transition-colors cursor-pointer ${
                        active ? activeMonochrome : inactiveMonochrome
                      }`}
                    >
                      {fac.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Fuel / Material Category Filter */}
            <div className={`space-y-1.5 pt-3 border-t ${dividerBorder}`}>
              <div className="text-[11px] font-sans font-semibold text-zinc-500 dark:text-zinc-400">
                Fuel &amp; Material Class
              </div>
              <div className="space-y-1">
                {[
                  { id: 'ALL', label: 'All Fuels & Polymers' },
                  { id: 'PMMA', label: 'PMMA Acrylic Solids' },
                  { id: 'SIBAL', label: 'SIBAL / Cotton-Fiberglass' },
                  { id: 'Ethylene', label: 'Gaseous (C₂H₄ / CH₄ / C₂H₆)' },
                  { id: 'Droplet', label: 'Liquid Alkane Droplets' },
                ].map((fuel) => {
                  const active = selectedFuelGroup === fuel.id;
                  return (
                    <button
                      key={fuel.id}
                      type="button"
                      onClick={() => setSelectedFuelGroup(fuel.id)}
                      className={`w-full text-left px-2.5 py-1.5 text-xs font-sans rounded-[4px] transition-colors cursor-pointer ${
                        active ? activeMonochrome : inactiveMonochrome
                      }`}
                    >
                      {fuel.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Combustion Regime Outcome Filter */}
            <div className={`space-y-1.5 pt-3 border-t ${dividerBorder}`}>
              <div className="text-[11px] font-sans font-semibold text-zinc-500 dark:text-zinc-400">
                Dominant Regime
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
                        active ? activeMonochrome : inactiveMonochrome
                      }`}
                    >
                      {out.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
          )}

          {/* Right Full-Width PSI Investigations Archive Grid */}
          <div className="flex-1 min-w-0 w-full space-y-4">
            <div
              className={`border rounded-[6px] px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${cardSurface}`}
            >
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setShowFilters((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-sans font-medium rounded-lg border shadow-xs active:scale-[0.98] transition-all cursor-pointer ${
                    isDark
                      ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800'
                      : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  <span>{showFilters ? 'Hide Filters' : 'Show Filters'}</span>
                </button>
                <span className="font-sans font-medium">
                  Showing{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    {filteredInvestigations.length}
                  </span>{' '}
                  of{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    {investigations.length}
                  </span>{' '}
                  PSI Investigations
                </span>
                <span className="text-zinc-300 dark:text-zinc-700">|</span>
                <span className="font-sans text-zinc-500 dark:text-zinc-400">
                  {isArchiveLoading ? (
                    'Loading experiment test runs...'
                  ) : (
                    <>
                      <span className="font-mono tabular-nums">
                        {runs.length.toLocaleString()}
                      </span>{' '}
                      test runs loaded
                    </>
                  )}
                </span>
              </div>
              <span className="font-sans text-[11px] text-zinc-500 dark:text-zinc-400">
                Source: Spaceflight Fire Test Data &amp; ISS Safety Guide
              </span>
            </div>

            {filteredInvestigations.length === 0 ? (
              <div
                className={`border rounded-[6px] p-10 text-center text-xs font-sans text-zinc-500 ${cardSurface}`}
              >
                No PSI investigations match the current filter criteria.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredInvestigations.map((inv) => {
                  const repRun = inv.representativeRun;
                  const isChecked = selectedRunIds.includes(repRun.id);
                  const isHighlighted =
                    highlightedRunId !== null &&
                    (highlightedRunId === repRun.id ||
                      inv.psiId
                        .toLowerCase()
                        .includes(highlightedRunId.toLowerCase()));

                  return (
                    <article
                      key={inv.psiId}
                      className={`border rounded-[6px] p-4 flex flex-col justify-between transition-colors duration-150 ${cardSurface} ${
                        isHighlighted
                          ? isDark
                            ? 'ring-1 ring-zinc-300'
                            : 'ring-1 ring-zinc-800'
                          : ''
                      }`}
                    >
                      <div>
                        {/* Top Row: Clickable PSI ID + Compare Button */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onInspectRun(inv.psiId)}
                                className="font-sans text-sm font-bold tracking-tight hover:underline cursor-pointer text-left"
                              >
                                <span className="font-mono tabular-nums">{inv.psiId}</span> · {inv.acronym}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => onInspectRun(inv.psiId)}
                              className="font-display text-xs font-semibold text-left mt-1 hover:underline cursor-pointer line-clamp-2"
                            >
                              {inv.title}
                            </button>
                            <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-1">
                              {inv.hardwareRaw} · {inv.managingCenter}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => onToggleRun(repRun.id)}
                            aria-label={`Compare ${inv.psiId}`}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium rounded-lg border shadow-xs active:scale-[0.98] transition-all shrink-0 cursor-pointer ${
                              isChecked
                                ? activeMonochrome +
                                  (isDark ? ' border-[#FAFAFA]' : ' border-[#18181B]')
                                : isDark
                                ? 'bg-transparent border-[#27272A] text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600'
                                : 'bg-zinc-50 border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300'
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

                        {/* Objective Preview */}
                        <p className="mt-2.5 text-xs font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed line-clamp-3">
                          {inv.objective}
                        </p>

                        {/* Archive Metadata Inventory Row */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                          <span className="inline-flex items-center gap-1 font-semibold text-zinc-700 dark:text-zinc-200">
                            <Layers className="w-3 h-3" />
                            <span>
                              <span className="font-mono tabular-nums">{inv.runCount}</span> CSV runs
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            <span>
                              <span className="font-mono tabular-nums">{inv.pdfs.length}</span> PDFs ·{' '}
                              <span className="font-mono tabular-nums">{inv.spreadsheets.length}</span> tables ·{' '}
                              <span className="font-mono tabular-nums">{inv.publications.length}</span> papers
                            </span>
                          </span>
                        </div>

                        {/* Parameter Envelope Matrix */}
                        <div
                          className={`mt-3 pt-3 border-t grid grid-cols-4 gap-2 text-[11px] ${dividerBorder}`}
                        >
                          <div>
                            <div className="text-[10px] font-sans text-zinc-400">
                              O₂ Range
                            </div>
                            <div className="font-mono font-semibold tabular-nums">
                              {inv.o2Range[0] === inv.o2Range[1]
                                ? `${inv.o2Range[0].toFixed(1)}%`
                                : `${inv.o2Range[0].toFixed(0)}–${inv.o2Range[1].toFixed(0)}%`}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-sans text-zinc-400">
                              Pressure
                            </div>
                            <div className="font-mono font-semibold tabular-nums">
                              {inv.pressureRange[0] === inv.pressureRange[1]
                                ? `${inv.pressureRange[0].toFixed(1)} psi`
                                : `${inv.pressureRange[0].toFixed(0)}–${inv.pressureRange[1].toFixed(0)}`}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-sans text-zinc-400">
                              Airflow
                            </div>
                            <div className="font-mono font-semibold tabular-nums">
                              {inv.flowRange[0] === inv.flowRange[1]
                                ? `${inv.flowRange[0].toFixed(2)} m/s`
                                : `${inv.flowRange[0].toFixed(2)}–${inv.flowRange[1].toFixed(2)}`}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-sans text-zinc-400">
                              Spread
                            </div>
                            <div className="font-mono font-bold tabular-nums">
                              {inv.spreadRange[0] === inv.spreadRange[1]
                                ? `${inv.spreadRange[0].toFixed(2)}`
                                : `${inv.spreadRange[0].toFixed(2)}–${inv.spreadRange[1].toFixed(2)}`}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className={`mt-3.5 pt-3 border-t space-y-2.5 ${dividerBorder}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div
                            className={`inline-flex items-center gap-1.5 text-xs font-sans font-semibold ${outcomeTextColor(
                              inv.dominantOutcome
                            )}`}
                          >
                            <span
                              className={`w-2 h-2 rounded-[2px] ${outcomeDotColor(
                                inv.dominantOutcome
                              )}`}
                              aria-hidden="true"
                            />
                            <span>{inv.dominantOutcome}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onInspectRun(inv.psiId)}
                              className={`px-2.5 py-1 text-[11px] font-sans font-medium rounded-lg border shadow-xs active:scale-[0.98] transition-all cursor-pointer ${
                                isDark
                                  ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600'
                                  : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300'
                              }`}
                            >
                              Inspect Runs
                            </button>
                            <button
                              type="button"
                              onClick={() => onApplyRunToSliders(repRun)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans font-medium rounded-lg border shadow-xs active:scale-[0.98] transition-all cursor-pointer ${
                                isDark
                                  ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-600'
                                  : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 hover:border-zinc-300'
                              }`}
                            >
                              <Sliders className="w-3 h-3" />
                              <span>Simulate</span>
                            </button>
                          </div>
                        </div>

                        <div
                          className={`pt-2 border-t flex flex-wrap items-center justify-between gap-2 ${dividerBorder}`}
                        >
                          <a
                            href={inv.psiSourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-sans text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline truncate"
                          >
                            <span className="truncate">
                              {inv.psiPortalLabel ?? `Official PSI Portal (Search: ${inv.psiId}) ↗`}
                            </span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>

                          {inv.doiUrl && (
                            <a
                              href={inv.doiUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-sans text-zinc-500 dark:text-zinc-400 hover:underline shrink-0"
                            >
                              <span>DOI</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ISS RESEARCHER'S GUIDE (PARSED CHUNKS + LOCAL 50-PAGE PDF) */}
      {activeTab === 'researchers-guide' && (
        <div className="space-y-4">
          {/* Header Banner & PDF Actions */}
          <CollapsibleCard
            theme={theme}
            title="A Researcher's Guide to Combustion Science in Reduced Gravity (50-Page Reference)"
            subtitle={`${literatureChunks.length.toLocaleString()} indexed chunks`}
            summaryLine={`50-Page Reference PDF · ${filteredGuideTopics.length} sections · Search filter "${guideSearch || 'All'}"`}
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-3xl">
                  Search directly through the ISS Fire Safety Handbook (190 Researcher&apos;s Guide sections +{' '}
                  {literatureChunks.length.toLocaleString()} report excerpts). Search fire-safety concepts or open any page in the 50-page PDF guide.
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowInlinePdf((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium rounded-lg border shadow-xs active:scale-[0.98] transition-all cursor-pointer ${
                      showInlinePdf
                        ? activeMonochrome +
                          (isDark ? ' border-[#FAFAFA]' : ' border-[#18181B]')
                        : isDark
                        ? 'border-[#27272A] text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600'
                        : 'border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>
                      {showInlinePdf ? 'Hide Embedded PDF' : 'Read PDF Inline'}
                    </span>
                  </button>

                  <a
                    href={RESEARCHERS_GUIDE_PDF_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-semibold rounded-lg shadow-xs hover:shadow-sm active:scale-[0.98] transition-all ${
                      isDark
                        ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200'
                        : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800'
                    }`}
                  >
                    <span>Open 50-Page Guide PDF</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <a
                    href={SAME_EIRD_PDF_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium rounded-lg border shadow-xs active:scale-[0.98] transition-all ${
                      isDark
                        ? 'border-[#27272A] text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600'
                        : 'border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300'
                    }`}
                  >
                    <span>SAME EIRD Spec PDF</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Search & Chapter Category Filter */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={guideSearch}
                    onChange={(e) => setGuideSearch(e.target.value)}
                    placeholder="Search Researcher's Guide & PSI literature (e.g. cool flame, soot, radiometer, BASS, PMMA)..."
                    aria-label="Search ISS Researcher's Guide"
                    className={`w-full pl-8 pr-3 py-1.5 text-xs font-sans rounded-[4px] border focus:outline-none ${
                      isDark
                        ? 'bg-[#09090B] border-[#27272A] text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500'
                        : 'bg-zinc-50 border-[#E4E4E7] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500'
                    }`}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {[
                    'ALL',
                    'Environment & Physics',
                    'Droplet & Cool Flames',
                    'Solid Flammability',
                    'Gaseous & Soot',
                    'ISS Facilities',
                  ].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setGuideCategory(cat)}
                      className={`px-2.5 py-1 text-[11px] font-sans rounded-lg border shadow-xs active:scale-[0.98] transition-all cursor-pointer ${
                        guideCategory === cat
                          ? activeMonochrome +
                            (isDark ? ' border-[#FAFAFA]' : ' border-[#18181B]')
                          : isDark
                          ? 'border-[#27272A] text-zinc-400 hover:text-zinc-100 hover:border-zinc-600'
                          : 'border-[#E4E4E7] text-zinc-600 hover:text-zinc-950 hover:border-zinc-300'
                      }`}
                    >
                      {cat === 'ALL' ? 'All Sections' : cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CollapsibleCard>

          {/* Optional Embedded Local PDF Viewer */}
          {showInlinePdf && (
            <section className={`border rounded-[6px] overflow-hidden ${cardSurface}`}>
              <div
                className={`px-4 py-2 border-b flex items-center justify-between text-xs ${dividerBorder}`}
              >
                <span className="font-sans font-semibold">
                  ISS Researcher's Guide to Combustion Science in Reduced Gravity (50-Page PDF)
                </span>
                <button
                  type="button"
                  onClick={() => setShowInlinePdf(false)}
                  className="text-xs font-sans underline cursor-pointer"
                >
                  Close Viewer
                </button>
              </div>
              <iframe
                src={RESEARCHERS_GUIDE_PDF_URL}
                title="ISS Researcher's Guide to Combustion Science"
                className="w-full h-[540px] bg-white"
              />
            </section>
          )}

          {/* Direct Corpus Chunk Matches when Searching */}
          {guideSearch.trim() !== '' && matchedLiteratureChunks.length > 0 && (
            <section className={`border rounded-[6px] p-4 space-y-3 ${cardSurface}`}>
              <div className="flex items-center justify-between text-xs">
                <h3 className="font-display font-semibold">
                  Top Verbatim Excerpts Matching "{guideSearch}"
                </h3>
                <span className="font-sans text-[11px] text-zinc-500">
                  <span className="font-mono tabular-nums">{matchedLiteratureChunks.length}</span> matched chunks
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {matchedLiteratureChunks.map((chunk) => (
                  <div
                    key={chunk.chunk_id}
                    className={`p-3 rounded-[4px] border space-y-1.5 ${insetSurface}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-sans">
                      <button
                        type="button"
                        onClick={() => onInspectRun(chunk.psi_id)}
                        className="font-bold hover:underline cursor-pointer"
                      >
                        <span className="font-mono tabular-nums">{chunk.psi_id}</span> · Page{' '}
                        <span className="font-mono tabular-nums">{chunk.page_number}</span>
                      </button>
                      <span className="font-mono text-zinc-500 truncate max-w-[220px]">
                        {chunk.source_file}
                      </span>
                    </div>
                    <p className="text-xs font-sans text-zinc-700 dark:text-zinc-300 leading-relaxed line-clamp-4">
                      {chunk.text.replace(/\s+/g, ' ').trim()}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Chapter Topic Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredGuideTopics.map((topic) => {
              const isExpanded = expandedTopicIds.includes(topic.id);
              const qLower = guideSearch.trim().toLowerCase();
              const matchingTopicChunks = qLower
                ? topic.chunks.filter((c) =>
                    c.text.toLowerCase().includes(qLower)
                  )
                : topic.chunks;
              const previewChunks = matchingTopicChunks
                .filter((c) => c.text.trim().length > 100)
                .slice(0, isExpanded ? 6 : 2);

              return (
                <article
                  key={topic.id}
                  className={`border rounded-[6px] p-4 flex flex-col justify-between space-y-3 ${cardSurface}`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                          <span className="font-bold text-zinc-800 dark:text-zinc-200">
                            SECTION{' '}
                            <span className="font-mono tabular-nums">
                              {topic.sectionNumber}
                            </span>
                          </span>
                          <span>·</span>
                          <span>
                            pp.{' '}
                            <span className="font-mono tabular-nums">
                              {topic.pageRange.replace(/^pp\.\s*/i, '')}
                            </span>
                          </span>
                          <span>·</span>
                          <span>{topic.category}</span>
                        </div>
                        <h3 className="font-display text-sm font-bold mt-1">
                          {topic.title}
                        </h3>
                      </div>

                      <a
                        href={topic.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans font-medium rounded-[4px] border shrink-0 transition-colors ${
                          isDark
                            ? 'border-[#27272A] text-zinc-200 hover:bg-zinc-800'
                            : 'border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100'
                        }`}
                      >
                        <span>
                          p. <span className="font-mono tabular-nums">{topic.startPage}</span> PDF
                        </span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <p className="text-xs font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed">
                      {topic.summary}
                    </p>

                    <ul className="space-y-1 text-xs font-sans text-zinc-700 dark:text-zinc-200">
                      {topic.keyTakeaways.map((bullet, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="font-sans text-zinc-400 mt-0.5">
                            —
                          </span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Parsed Chunks Preview from psi_literature_chunks.json */}
                    {previewChunks.length > 0 && (
                      <div className={`pt-2 border-t space-y-2 ${dividerBorder}`}>
                        <div className="flex items-center justify-between text-[11px] font-sans text-zinc-500">
                          <span>
                            Parsed Guide Excerpts (
                            <span className="font-mono tabular-nums">
                              {topic.chunks.length}
                            </span>{' '}
                            chunks in section)
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleTopicExpand(topic.id)}
                            className="inline-flex items-center gap-1 font-sans font-semibold text-zinc-700 dark:text-zinc-300 hover:underline cursor-pointer"
                          >
                            <span>
                              {isExpanded ? 'Show Fewer' : 'Read Excerpts'}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )}
                          </button>
                        </div>

                        {previewChunks.map((ch) => (
                          <div
                            key={ch.chunk_id}
                            className={`p-2.5 rounded-[4px] border text-[11px] font-sans leading-relaxed text-zinc-600 dark:text-zinc-300 ${insetSurface}`}
                          >
                            <span className="font-sans font-semibold text-zinc-800 dark:text-zinc-100 mr-1.5">
                              [p.<span className="font-mono tabular-nums">{ch.page_number}</span>]
                            </span>
                            {ch.text.replace(/\s+/g, ' ').trim()}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: MISSION & SPIN-OFF CASES (8 HISTORICAL FIRES & TERRESTRIAL SPINOFFS) */}
      {activeTab === 'mission-spinoffs' && (
        <div className="space-y-4">
          <CollapsibleCard
            theme={theme}
            title="Historical Spacecraft Fire Incidents & Earth Fire-Safety Spin-Offs"
            subtitle={`${filteredCases.length} of ${missionCases.length} Official Case Records`}
            summaryLine={`${filteredCases.length} of ${missionCases.length} Historical & Spin-Off Cases · Category: ${caseCategory === 'ALL' ? 'All' : caseCategory}`}
          >
            <div className="space-y-3">
              <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
                Eight engineering reference cases linking Apollo 1, Apollo 13, and Mir fire lessons to ISS microgravity combustion research and firefighter safety hardware.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={caseSearch}
                    onChange={(e) => setCaseSearch(e.target.value)}
                    placeholder="Filter by Apollo 1, Mir, SCBA, smoke detector, Nomex..."
                    aria-label="Search Mission & Spin-Off Cases"
                    className={`w-full pl-8 pr-3 py-1.5 text-xs font-sans rounded-[4px] border focus:outline-none ${
                      isDark
                        ? 'bg-[#09090B] border-[#27272A] text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500'
                        : 'bg-zinc-50 border-[#E4E4E7] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500'
                    }`}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {[
                    { id: 'ALL', label: 'All Cases (8)' },
                    {
                      id: 'Historical Spacecraft Fire',
                      label: 'Historical Spacecraft Fires',
                    },
                    { id: 'ISS Program & Science', label: 'ISS Program & Science' },
                    { id: 'Terrestrial Spin-Off', label: 'Terrestrial Spin-Offs' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCaseCategory(cat.id)}
                      className={`px-2.5 py-1 text-[11px] font-sans rounded-lg border shadow-xs active:scale-[0.98] transition-all cursor-pointer ${
                        caseCategory === cat.id
                          ? activeMonochrome +
                            (isDark ? ' border-[#FAFAFA]' : ' border-[#18181B]')
                          : isDark
                          ? 'border-[#27272A] text-zinc-400 hover:text-zinc-100 hover:border-zinc-600'
                          : 'border-[#E4E4E7] text-zinc-600 hover:text-zinc-950 hover:border-zinc-300'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CollapsibleCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredCases.map((item) => {
              const catDot =
                item.category === 'Historical Spacecraft Fire'
                  ? 'bg-[#EF4444]'
                  : item.category === 'ISS Program & Science'
                  ? 'bg-[#F59E0B]'
                  : 'bg-[#10B981]';

              return (
                <article
                  key={item.id}
                  className={`border rounded-[6px] p-4 flex flex-col justify-between space-y-3 ${cardSurface}`}
                >
                  <div className="space-y-3">
                    {/* Card Header */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-sans">
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <span
                              className={`w-2 h-2 rounded-[2px] ${catDot}`}
                              aria-hidden="true"
                            />
                            <span>{item.category}</span>
                          </span>
                          <span className="text-zinc-400">·</span>
                          <span className="font-mono text-zinc-500">{item.code}</span>
                          <span className="text-zinc-400">·</span>
                          <span className="text-zinc-500">{item.yearOrEra}</span>
                        </div>

                        <h3 className="font-display text-base font-bold tracking-tight">
                          {item.title}
                        </h3>
                        <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
                          {item.missionOrDomain} ·{' '}
                          <span className="font-sans font-semibold text-zinc-700 dark:text-zinc-200">
                            {item.atmosphereLabel}
                          </span>
                        </p>
                      </div>

                      {item.simulatableEnvironment && (
                        <button
                          type="button"
                          onClick={() =>
                            onSimulateEnvironment(item.simulatableEnvironment!)
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-semibold rounded-[4px] transition-colors shrink-0 cursor-pointer ${
                            isDark
                              ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200'
                              : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800'
                          }`}
                        >
                          <Play className="w-3 h-3" />
                          <span>Simulate This Environment</span>
                        </button>
                      )}
                    </div>

                    <p className="text-xs font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed">
                      {item.summary}
                    </p>

                    {/* Engineering Parameter Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {item.engineeringParameters.map((param) => (
                        <div
                          key={param.label}
                          className={`p-2 rounded-[4px] border ${insetSurface}`}
                        >
                          <div className="text-[10px] font-sans text-zinc-400">
                            {param.label}
                          </div>
                          <div className="font-sans text-[11px] font-semibold mt-0.5 leading-snug">
                            {param.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Key Lessons Learned */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Key Engineering Lessons Learned
                      </div>
                      <ul className="space-y-1 text-xs font-sans text-zinc-700 dark:text-zinc-200">
                        {item.lessonsLearned.map((lesson, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="font-sans text-zinc-400 mt-0.5">
                              •
                            </span>
                            <span>{lesson}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Card Footer: Linked PSI Investigations + Official Source URL */}
                  <div className={`pt-3 border-t space-y-2.5 ${dividerBorder}`}>
                    {item.relatedPsiIds.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-sans text-zinc-500 dark:text-zinc-400 mr-1">
                          Linked PSI Archives:
                        </span>
                        {item.relatedPsiIds.map((pid) => (
                          <button
                            key={pid}
                            type="button"
                            onClick={() => onInspectRun(pid)}
                            className={`px-2 py-0.5 font-sans font-semibold rounded-[4px] border transition-colors cursor-pointer ${
                              isDark
                                ? 'border-[#27272A] bg-[#09090B] text-zinc-200 hover:bg-zinc-800'
                                : 'border-[#E4E4E7] bg-zinc-50 text-zinc-800 hover:bg-zinc-200'
                            }`}
                          >
                            {pid}
                          </button>
                        ))}
                      </div>
                    )}

                    <div
                      className={`pt-2 border-t flex items-center justify-between gap-2 ${dividerBorder}`}
                    >
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] font-sans text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline truncate"
                      >
                        <span className="truncate">
                          Official Reference: {item.sourceDisplayUrl}
                        </span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
