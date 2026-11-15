import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Flame,
  FlaskConical,
  GitCompare,
  Home,
  Layers,
  LogIn,
  PanelLeftClose,
  RefreshCw,
  Search,
  Settings,
  TerminalSquare,
  UserCheck,
} from 'lucide-react';
import {
  AccountSession,
  LiteratureChunk,
  PsiInvestigationRecord,
  PsiRun,
  ResearchersGuideTopic,
  SidebarState,
  ThemeMode,
  WorkspaceView,
} from '../types/psi';
import { performGlobalSearch } from '../utils/globalSearch';

interface LeftSidebarProps {
  theme: ThemeMode;
  session: AccountSession | null;
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  onReturnToLanding: () => void;
  sidebarState: SidebarState;
  onCycleSidebarState: () => void;
  selectedRunsCount: number;
  investigationCount: number;
  totalRunsCount: number;
  missionCasesCount: number;
  isArchiveLoading?: boolean;
  customUploadsCount?: number;
  runs: PsiRun[];
  investigations: PsiInvestigationRecord[];
  guideTopics: ResearchersGuideTopic[];
  literatureChunks: LiteratureChunk[];
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onQuickJumpRun: (run: PsiRun) => void;
  onQuickJumpInvestigation: (inv: PsiInvestigationRecord) => void;
  onQuickJumpGuideTopic: (topicId?: string, searchHint?: string) => void;
  onOpenSettings: () => void;
  onOpenSignIn: () => void;
}

const ARCHIVE_CHILD_VIEWS: WorkspaceView[] = [
  'investigations',
  'experiment-runs',
  'researchers-guide',
  'mission-spinoffs',
  'investigation-detail',
];

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  theme,
  session,
  activeView,
  onSelectView,
  onReturnToLanding,
  sidebarState,
  onCycleSidebarState,
  selectedRunsCount,
  investigationCount,
  totalRunsCount,
  missionCasesCount,
  isArchiveLoading = false,
  customUploadsCount = 0,
  runs,
  investigations,
  guideTopics,
  literatureChunks,
  searchInputRef,
  onQuickJumpRun,
  onQuickJumpInvestigation,
  onQuickJumpGuideTopic,
  onOpenSettings,
  onOpenSignIn,
}) => {
  const [quickFind, setQuickFind] = useState('');
  const [virtualLabExpanded, setVirtualLabExpanded] = useState(true);
  const [archiveExpanded, setArchiveExpanded] = useState(true);

  if (sidebarState === 'hidden') {
    return null;
  }

  const isCompact = sidebarState === 'compact';
  const isDark = theme === 'dark';

  const railSurface = isDark
    ? 'bg-[#09090B] border-[#27272A] text-[#FAFAFA]'
    : theme === 'light'
    ? 'bg-[#FFFFFF] border-[#E4E4E7] text-[#09090B]'
    : 'bg-[#FAFAFA] border-[#E4E4E7] text-[#18181B]';

  const activeItemClass = isDark
    ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
    : 'bg-[#18181B] text-[#FFFFFF] font-semibold';

  const inactiveItemClass = isDark
    ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60';

  const countBadgeClass = (isActive: boolean) =>
    isActive
      ? isDark
        ? 'text-zinc-700'
        : 'text-zinc-300'
      : 'text-zinc-400';

  const searchResults = useMemo(
    () =>
      performGlobalSearch({
        query: quickFind,
        investigations,
        runs,
        guideTopics,
        literatureChunks,
        limitPerGroup: 4,
      }),
    [quickFind, investigations, runs, guideTopics, literatureChunks]
  );
  const hasSearchQuery = quickFind.trim().length > 0;

  const isArchiveGroupActive = ARCHIVE_CHILD_VIEWS.includes(activeView);

  if (isCompact) {
    const compactItems: Array<{
      id: WorkspaceView;
      label: string;
      icon: React.FC<{ className?: string }>;
      isActive: boolean;
      badge?: string;
    }> = [
      {
        id: 'overview',
        label: 'Overview',
        icon: Home,
        isActive: activeView === 'overview',
      },
      {
        id: 'virtual-lab',
        label: 'Virtual Test Lab',
        icon: FlaskConical,
        isActive: activeView === 'virtual-lab',
      },
      {
        id: 'comparator',
        label: 'Run Comparator',
        icon: GitCompare,
        isActive: activeView === 'comparator',
        badge: `${selectedRunsCount}/4`,
      },
      {
        id: 'visual-studio',
        label: 'Visual Analytics Studio',
        icon: BarChart3,
        isActive: activeView === 'visual-studio',
      },
      {
        id: 'model-console',
        label: 'Model Console',
        icon: TerminalSquare,
        isActive: activeView === 'model-console',
      },
      {
        id: 'investigations',
        label: `PSI Investigations (${investigationCount})`,
        icon: BookOpen,
        isActive:
          activeView === 'investigations' ||
          activeView === 'investigation-detail',
      },
      {
        id: 'experiment-runs',
        label: `Experiment Runs (${totalRunsCount.toLocaleString()})`,
        icon: Database,
        isActive: activeView === 'experiment-runs',
      },
      {
        id: 'researchers-guide',
        label: "ISS Researcher's Guide",
        icon: FileText,
        isActive: activeView === 'researchers-guide',
      },
      {
        id: 'mission-spinoffs',
        label: `Mission & Spin-Off Cases (${missionCasesCount})`,
        icon: Flame,
        isActive: activeView === 'mission-spinoffs',
      },
      {
        id: 'import-sync',
        label: 'Data Import & Sync',
        icon: RefreshCw,
        isActive: activeView === 'import-sync',
      },
    ];

    return (
      <aside
        className={`w-full lg:w-[64px] shrink-0 lg:sticky lg:top-0 lg:h-screen border-b lg:border-b-0 lg:border-r flex flex-row lg:flex-col justify-between items-center py-2.5 px-2 select-none transition-colors duration-150 z-30 ${railSurface}`}
        aria-label="Compact Navigation Rail"
      >
        <div className="flex flex-row lg:flex-col items-center gap-2 w-full">
          <div className="flex items-center justify-center w-full pb-1">
            <button
              type="button"
              onClick={onCycleSidebarState}
              title="Hide Navigation Rail ([)"
              aria-label="Hide Navigation Rail"
              className={`w-9 h-9 rounded-lg border shadow-xs flex items-center justify-center transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                isDark
                  ? 'bg-[#18181B] border-[#27272A] text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800'
                  : 'bg-white border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300'
              }`}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          <div
            className={`hidden lg:block w-8 border-t ${
              isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
            }`}
          />

          <nav
            className="flex flex-row lg:flex-col items-center gap-1.5 overflow-x-auto lg:overflow-visible w-full"
            aria-label="Compact Workspace Views"
          >
            {compactItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="relative group flex justify-center">
                  <button
                    type="button"
                    onClick={() => onSelectView(item.id)}
                    aria-label={item.label}
                    className={`w-10 h-9 rounded-lg flex items-center justify-center transition-all duration-150 active:scale-[0.98] cursor-pointer relative ${
                      item.isActive ? activeItemClass + ' shadow-xs' : inactiveItemClass
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.id === 'import-sync' && customUploadsCount > 0 && (
                      <span
                        className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-[2px] bg-[#10B981]"
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  {/* Hover Tooltip */}
                  <div
                    role="tooltip"
                    className={`hidden lg:flex items-center gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-100 absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 px-2.5 py-1.5 rounded-[4px] border shadow-md whitespace-nowrap text-xs font-sans font-medium ${
                      isDark
                        ? 'bg-[#18181B] border-[#27272A] text-[#FAFAFA]'
                        : 'bg-white border-[#E4E4E7] text-[#18181B]'
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="font-mono text-[10px] tabular-nums text-zinc-500">
                        {item.badge}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:flex flex-col items-center gap-2 pt-2">
          <button
            type="button"
            onClick={session?.isAuthenticated ? onOpenSettings : onOpenSignIn}
            title={
              session?.isAuthenticated
                ? `Settings (${session.fullName})`
                : 'Sign In'
            }
            aria-label={session?.isAuthenticated ? 'Open Workspace Settings' : 'Sign In'}
            className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
              isDark
                ? 'bg-[#18181B] border-[#27272A] text-zinc-300 hover:text-white hover:border-zinc-500'
                : 'bg-white border-[#E4E4E7] text-zinc-700 hover:text-zinc-950 hover:border-zinc-300'
            }`}
          >
            {session?.isAuthenticated ? (
              <Settings className="w-4 h-4" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
          </button>
          <span
            className={`w-2 h-2 rounded-[2px] ${
              isArchiveLoading ? 'bg-[#F59E0B]' : 'bg-[#10B981]'
            }`}
            aria-label="Archive Status"
          />
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`w-full lg:w-[240px] shrink-0 lg:sticky lg:top-0 lg:h-screen border-b lg:border-b-0 lg:border-r flex flex-col justify-between select-none transition-colors duration-150 ${railSurface}`}
      aria-label="Primary Workspace Navigation"
    >
      {/* Top: Brand Header + Collapse Toggle + Quick Find + Hierarchical Tree */}
      <div className="p-3.5 space-y-3 overflow-y-auto">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <button
            type="button"
            onClick={onReturnToLanding}
            className="flex items-center gap-2 min-w-0 text-left cursor-pointer hover:opacity-80 transition-opacity"
            title="Back to Landing Page"
          >
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center border shrink-0 shadow-xs ${
                isDark
                  ? 'bg-[#FAFAFA] text-[#09090B] border-white/20'
                  : 'bg-[#18181B] text-[#FFFFFF] border-zinc-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
            </div>
            <span className="font-display text-sm font-semibold tracking-tight truncate">
              PSI Data Manager
            </span>
          </button>

          <button
            type="button"
            onClick={onCycleSidebarState}
            title="Collapse to Icon Rail ([)"
            aria-label="Collapse sidebar to compact rail"
            className={`w-7 h-7 rounded-lg border shadow-xs flex items-center justify-center shrink-0 transition-all duration-150 active:scale-[0.98] cursor-pointer ${
              isDark
                ? 'bg-[#18181B] border-[#27272A] text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800'
                : 'bg-white border-[#E4E4E7] text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 hover:border-zinc-300'
            }`}
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Global Quick Search Bar (Ctrl/Cmd + K) */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={quickFind}
            onChange={(e) => setQuickFind(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuickFind('');
              }
            }}
            placeholder="Find PSI ID, run, fuel..."
            aria-label="Global search across PSI investigations, runs, and researcher guide"
            className={`w-full pl-8 pr-11 py-1.5 text-xs font-sans rounded-[4px] border transition-colors focus:outline-none ${
              isDark
                ? 'bg-[#18181B] border-[#27272A] text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500'
                : 'bg-white border-[#E4E4E7] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500'
            }`}
          />
          {!hasSearchQuery && (
            <kbd
              className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-[3px] border text-[9px] font-mono ${
                isDark
                  ? 'bg-[#09090B] border-[#27272A] text-zinc-500'
                  : 'bg-zinc-50 border-[#E4E4E7] text-zinc-400'
              }`}
            >
              Ctrl+K
            </kbd>
          )}

          {hasSearchQuery && (
            <div
              className={`absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border shadow-xl p-1.5 max-h-[340px] overflow-y-auto space-y-2 ${
                isDark
                  ? 'bg-[#18181B] border-[#27272A] text-zinc-100'
                  : 'bg-white border-[#E4E4E7] text-zinc-900'
              }`}
            >
              {searchResults.all.length === 0 ? (
                <div className="px-2 py-2.5 text-[11px] font-sans text-zinc-500 text-center">
                  No matches across investigations, runs, or guide sections.
                </div>
              ) : (
                <>
                  {searchResults.investigations.length > 0 && (
                    <div className="space-y-0.5">
                      <div className="px-2 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wider text-zinc-500">
                        Investigations ({searchResults.investigations.length})
                      </div>
                      {searchResults.investigations.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            if (item.investigation) {
                              onQuickJumpInvestigation(item.investigation);
                            }
                            setQuickFind('');
                          }}
                          className={`w-full text-left px-2 py-1.5 rounded-[4px] text-xs flex items-center justify-between gap-1 cursor-pointer ${
                            isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-mono font-semibold text-[11px] truncate">
                              {item.title}
                            </div>
                            <div className="text-[10px] font-sans text-zinc-500 truncate">
                              {item.subtitle}
                            </div>
                          </div>
                          <ArrowUpRight className="w-3 h-3 text-zinc-400 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.runs.length > 0 && (
                    <div className="space-y-0.5">
                      <div className="px-2 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wider text-zinc-500">
                        Experiment Runs ({searchResults.runs.length})
                      </div>
                      {searchResults.runs.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            if (item.run) {
                              onQuickJumpRun(item.run);
                            }
                            setQuickFind('');
                          }}
                          className={`w-full text-left px-2 py-1.5 rounded-[4px] text-xs flex items-center justify-between gap-1 cursor-pointer ${
                            isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-mono font-semibold text-[11px] truncate">
                              {item.title}
                            </div>
                            <div className="text-[10px] font-sans text-zinc-500 truncate">
                              {item.subtitle} · {item.meta}
                            </div>
                          </div>
                          <ArrowUpRight className="w-3 h-3 text-zinc-400 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.guide.length > 0 && (
                    <div className="space-y-0.5">
                      <div className="px-2 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wider text-zinc-500">
                        ISS Researcher&apos;s Guide ({searchResults.guide.length})
                      </div>
                      {searchResults.guide.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            onQuickJumpGuideTopic(
                              item.guideTopicId,
                              item.guideSearchHint
                            );
                            setQuickFind('');
                          }}
                          className={`w-full text-left px-2 py-1.5 rounded-[4px] text-xs flex items-center justify-between gap-1 cursor-pointer ${
                            isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-sans font-semibold text-[11px] truncate">
                              {item.title}
                            </div>
                            <div className="text-[10px] font-sans text-zinc-500 truncate">
                              {item.meta}
                            </div>
                          </div>
                          <ArrowUpRight className="w-3 h-3 text-zinc-400 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Hierarchical Expandable Navigation Tree */}
        <nav className="space-y-1 pt-1" aria-label="Workspace Navigation Tree">
          {/* 0. Workspace Overview Page */}
          <button
            type="button"
            onClick={() => onSelectView('overview')}
            className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-sans font-medium rounded-lg transition-all duration-150 active:scale-[0.98] cursor-pointer ${
              activeView === 'overview'
                ? activeItemClass + ' shadow-xs'
                : inactiveItemClass
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <Home className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Overview</span>
            </span>
          </button>

          {/* 1. Virtual Test Lab + Nested Run Comparator */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onSelectView('virtual-lab')}
                className={`flex-1 flex items-center justify-between px-2.5 py-2 text-xs font-sans font-medium rounded-lg transition-all duration-150 active:scale-[0.98] cursor-pointer min-w-0 ${
                  activeView === 'virtual-lab'
                    ? activeItemClass + ' shadow-xs'
                    : inactiveItemClass
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <FlaskConical className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Virtual Test Lab</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setVirtualLabExpanded((p) => !p)}
                aria-label="Toggle Virtual Test Lab sub-items"
                aria-expanded={virtualLabExpanded}
                className={`w-6 h-8 rounded-lg flex items-center justify-center transition-all duration-150 active:scale-[0.98] cursor-pointer shrink-0 ${inactiveItemClass}`}
              >
                {virtualLabExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
            </div>

            {virtualLabExpanded && (
              <div
                className={`ml-3 pl-2.5 border-l space-y-0.5 ${
                  isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectView('comparator')}
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-sans font-medium rounded-lg transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                    activeView === 'comparator'
                      ? activeItemClass + ' shadow-xs'
                      : inactiveItemClass
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <GitCompare className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Run Comparator</span>
                  </span>
                  <span
                    className={`font-mono text-[10px] tabular-nums shrink-0 ${countBadgeClass(
                      activeView === 'comparator'
                    )}`}
                  >
                    {selectedRunsCount}/4
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* 2. Visual Analytics Studio */}
          <button
            type="button"
            onClick={() => onSelectView('visual-studio')}
            className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-sans font-medium rounded-lg transition-all duration-150 active:scale-[0.98] cursor-pointer ${
              activeView === 'visual-studio'
                ? activeItemClass + ' shadow-xs'
                : inactiveItemClass
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <BarChart3 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Visual Analytics Studio</span>
            </span>
          </button>

          {/* 3. Model Console */}
          <button
            type="button"
            onClick={() => onSelectView('model-console')}
            className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-sans font-medium rounded-lg transition-all duration-150 active:scale-[0.98] cursor-pointer ${
              activeView === 'model-console'
                ? activeItemClass + ' shadow-xs'
                : inactiveItemClass
            }`}
          >
            <span className="flex items-center gap-2.5 truncate">
              <TerminalSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Model Console</span>
            </span>
          </button>

          {/* 4. Data Archive (Expandable Parent + 4 Nested Sub-Items) */}
          <div className="space-y-0.5 pt-1">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setArchiveExpanded(true);
                  if (!isArchiveGroupActive) {
                    onSelectView('investigations');
                  }
                }}
                className={`flex-1 flex items-center justify-between px-2.5 py-2 text-xs font-sans font-medium rounded-lg transition-all duration-150 active:scale-[0.98] cursor-pointer min-w-0 ${
                  isArchiveGroupActive
                    ? isDark
                      ? 'text-zinc-100 bg-zinc-900 font-semibold'
                      : 'text-zinc-950 bg-zinc-200/70 font-semibold'
                    : inactiveItemClass
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Data Archive</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setArchiveExpanded((p) => !p)}
                aria-label="Toggle Data Archive sub-items"
                aria-expanded={archiveExpanded}
                className={`w-6 h-8 rounded-lg flex items-center justify-center transition-all duration-150 active:scale-[0.98] cursor-pointer shrink-0 ${inactiveItemClass}`}
              >
                {archiveExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
            </div>

            {archiveExpanded && (
              <div
                className={`ml-3 pl-2.5 border-l space-y-0.5 ${
                  isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectView('investigations')}
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-sans font-medium rounded-lg transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                    activeView === 'investigations' ||
                    activeView === 'investigation-detail'
                      ? activeItemClass + ' shadow-xs'
                      : inactiveItemClass
                  }`}
                >
                  <span className="truncate">PSI Investigations</span>
                  <span
                    className={`font-mono text-[10px] tabular-nums shrink-0 ${countBadgeClass(
                      activeView === 'investigations' ||
                        activeView === 'investigation-detail'
                    )}`}
                  >
                    {investigationCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectView('experiment-runs')}
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-sans font-medium rounded-lg transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                    activeView === 'experiment-runs'
                      ? activeItemClass + ' shadow-xs'
                      : inactiveItemClass
                  }`}
                >
                  <span className="truncate">Experiment Runs</span>
                  <span
                    className={`font-mono text-[10px] tabular-nums shrink-0 ${countBadgeClass(
                      activeView === 'experiment-runs'
                    )}`}
                  >
                    {totalRunsCount.toLocaleString()}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectView('researchers-guide')}
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-sans font-medium rounded-lg transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                    activeView === 'researchers-guide'
                      ? activeItemClass + ' shadow-xs'
                      : inactiveItemClass
                  }`}
                >
                  <span className="truncate">ISS Researcher&apos;s Guide</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectView('mission-spinoffs')}
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-sans font-medium rounded-lg transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                    activeView === 'mission-spinoffs'
                      ? activeItemClass + ' shadow-xs'
                      : inactiveItemClass
                  }`}
                >
                  <span className="truncate">Mission &amp; Spin-Off Cases</span>
                  <span
                    className={`font-mono text-[10px] tabular-nums shrink-0 ${countBadgeClass(
                      activeView === 'mission-spinoffs'
                    )}`}
                  >
                    {missionCasesCount}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* 5. Data Import & Sync */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => onSelectView('import-sync')}
              className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-sans font-medium rounded-lg transition-all duration-150 active:scale-[0.98] cursor-pointer ${
                activeView === 'import-sync'
                  ? activeItemClass + ' shadow-xs'
                  : inactiveItemClass
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Data Import &amp; Sync</span>
              </span>
              {customUploadsCount > 0 && (
                <span
                  className={`font-mono text-[10px] tabular-nums shrink-0 ${countBadgeClass(
                    activeView === 'import-sync'
                  )}`}
                >
                  +{customUploadsCount}
                </span>
              )}
            </button>
          </div>
        </nav>
      </div>

      {/* Bottom Footer: Active Researcher Profile Card & Settings */}
      <div
        className={`p-3 border-t ${
          isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
        }`}
      >
        {session?.isAuthenticated ? (
          <div
            className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
              isDark
                ? 'bg-[#121215] border-[#27272A]'
                : 'bg-white border-[#E4E4E7]'
            }`}
          >
            <div className="min-w-0 flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-md border flex items-center justify-center shrink-0 ${
                  isDark
                    ? 'bg-[#18181B] border-[#27272A] text-zinc-200'
                    : 'bg-zinc-100 border-[#E4E4E7] text-zinc-800'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-[#10B981]" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-sans font-semibold truncate">
                  {session.mode === 'guest'
                    ? 'Guest Session'
                    : session.fullName}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 truncate">
                  <span
                    className={`w-1.5 h-1.5 rounded-[2px] shrink-0 ${
                      isArchiveLoading ? 'bg-[#F59E0B]' : 'bg-[#10B981]'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate">
                    {session.mode === 'guest'
                      ? 'Sandbox'
                      : session.researcherId}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenSettings}
              className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-sans font-medium shrink-0 transition-colors cursor-pointer ${
                isDark
                  ? 'bg-[#18181B] border-[#27272A] text-zinc-200 hover:bg-zinc-800 hover:border-zinc-500'
                  : 'bg-zinc-50 border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300'
              }`}
              title="Open Workspace Settings"
            >
              <Settings className="w-3 h-3" />
              <span>Settings</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-sans text-zinc-500 truncate">
              Not signed in
            </span>
            <button
              type="button"
              onClick={onOpenSignIn}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-sans font-semibold cursor-pointer ${activeItemClass}`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
