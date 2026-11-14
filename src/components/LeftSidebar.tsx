import React, { useState } from 'react';
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
  Layers,
  PanelLeftClose,
  RefreshCw,
  Search,
  TerminalSquare,
} from 'lucide-react';
import { PsiRun, SidebarState, ThemeMode, WorkspaceView } from '../types/psi';

interface LeftSidebarProps {
  theme: ThemeMode;
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  sidebarState: SidebarState;
  onCycleSidebarState: () => void;
  selectedRunsCount: number;
  investigationCount: number;
  totalRunsCount: number;
  missionCasesCount: number;
  isArchiveLoading?: boolean;
  customUploadsCount?: number;
  runs: PsiRun[];
  onQuickJumpRun: (run: PsiRun) => void;
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
  activeView,
  onSelectView,
  sidebarState,
  onCycleSidebarState,
  selectedRunsCount,
  investigationCount,
  totalRunsCount,
  missionCasesCount,
  isArchiveLoading = false,
  customUploadsCount = 0,
  runs,
  onQuickJumpRun,
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

  const quickResults =
    quickFind.trim().length > 0
      ? runs
          .filter(
            (r) =>
              r.psiId.toLowerCase().includes(quickFind.toLowerCase()) ||
              r.material.toLowerCase().includes(quickFind.toLowerCase()) ||
              r.investigationTitle
                .toLowerCase()
                .includes(quickFind.toLowerCase()) ||
              r.facility.toLowerCase().includes(quickFind.toLowerCase()) ||
              r.runCode.toLowerCase().includes(quickFind.toLowerCase())
          )
          .slice(0, 6)
      : [];

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
              className={`w-9 h-9 rounded-[4px] border flex items-center justify-center transition-colors cursor-pointer ${
                isDark
                  ? 'bg-[#18181B] border-[#27272A] text-zinc-200 hover:border-zinc-500'
                  : 'bg-white border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100'
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
                    className={`w-10 h-9 rounded-[4px] flex items-center justify-center transition-colors cursor-pointer relative ${
                      item.isActive ? activeItemClass : inactiveItemClass
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

        <div
          className="hidden lg:flex flex-col items-center gap-1 pt-2"
          title={`${investigationCount} PSI Investigations • ${totalRunsCount.toLocaleString()} Runs • Ready`}
        >
          <span
            className="w-2 h-2 rounded-[2px] bg-[#10B981]"
            aria-label="Archive Ready"
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
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-6 h-6 rounded-[4px] flex items-center justify-center border shrink-0 ${
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
          </div>

          <button
            type="button"
            onClick={onCycleSidebarState}
            title="Collapse to Icon Rail ([)"
            aria-label="Collapse sidebar to compact rail"
            className={`w-7 h-7 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
              isDark
                ? 'bg-[#18181B] border-[#27272A] text-zinc-400 hover:text-zinc-100 hover:border-zinc-500'
                : 'bg-white border-[#E4E4E7] text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick Command / Filter Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={quickFind}
            onChange={(e) => setQuickFind(e.target.value)}
            placeholder="Find PSI ID, run, fuel..."
            aria-label="Find PSI investigation or run"
            className={`w-full pl-8 pr-2.5 py-1.5 text-xs font-sans rounded-[4px] border transition-colors focus:outline-none ${
              isDark
                ? 'bg-[#18181B] border-[#27272A] text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500'
                : 'bg-white border-[#E4E4E7] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500'
            }`}
          />

          {quickResults.length > 0 && (
            <div
              className={`absolute left-0 right-0 top-full mt-1 z-40 rounded-[4px] border shadow-lg p-1 space-y-0.5 ${
                isDark
                  ? 'bg-[#18181B] border-[#27272A] text-zinc-100'
                  : 'bg-white border-[#E4E4E7] text-zinc-900'
              }`}
            >
              {quickResults.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => {
                    onQuickJumpRun(run);
                    setQuickFind('');
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded-[4px] text-xs flex items-center justify-between gap-1 cursor-pointer ${
                    isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-[11px] truncate">
                      {run.psiId} · {run.runCode}
                    </div>
                    <div className="text-[10px] font-sans text-zinc-500 truncate">
                      {run.material} ·{' '}
                      <span className="font-mono tabular-nums">
                        {run.O2_pct.toFixed(0)}%
                      </span>{' '}
                      O₂
                    </div>
                  </div>
                  <ArrowUpRight className="w-3 h-3 text-zinc-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Exact Hierarchical Expandable Navigation Tree */}
        <nav className="space-y-1 pt-1" aria-label="Workspace Navigation Tree">
          {/* 1. Virtual Test Lab + Nested Run Comparator */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onSelectView('virtual-lab')}
                className={`flex-1 flex items-center justify-between px-2.5 py-2 text-xs font-sans font-medium rounded-[4px] transition-colors duration-150 cursor-pointer min-w-0 ${
                  activeView === 'virtual-lab'
                    ? activeItemClass
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
                className={`w-6 h-8 rounded-[4px] flex items-center justify-center transition-colors cursor-pointer shrink-0 ${inactiveItemClass}`}
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
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-sans font-medium rounded-[4px] transition-colors duration-150 cursor-pointer ${
                    activeView === 'comparator'
                      ? activeItemClass
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
            className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-sans font-medium rounded-[4px] transition-colors duration-150 cursor-pointer ${
              activeView === 'visual-studio'
                ? activeItemClass
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
            className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-sans font-medium rounded-[4px] transition-colors duration-150 cursor-pointer ${
              activeView === 'model-console'
                ? activeItemClass
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
                className={`flex-1 flex items-center justify-between px-2.5 py-2 text-xs font-sans font-medium rounded-[4px] transition-colors duration-150 cursor-pointer min-w-0 ${
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
                className={`w-6 h-8 rounded-[4px] flex items-center justify-center transition-colors cursor-pointer shrink-0 ${inactiveItemClass}`}
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
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-sans font-medium rounded-[4px] transition-colors duration-150 cursor-pointer ${
                    activeView === 'investigations' ||
                    activeView === 'investigation-detail'
                      ? activeItemClass
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
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-sans font-medium rounded-[4px] transition-colors duration-150 cursor-pointer ${
                    activeView === 'experiment-runs'
                      ? activeItemClass
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
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-sans font-medium rounded-[4px] transition-colors duration-150 cursor-pointer ${
                    activeView === 'researchers-guide'
                      ? activeItemClass
                      : inactiveItemClass
                  }`}
                >
                  <span className="truncate">ISS Researcher&apos;s Guide</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectView('mission-spinoffs')}
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-xs font-sans font-medium rounded-[4px] transition-colors duration-150 cursor-pointer ${
                    activeView === 'mission-spinoffs'
                      ? activeItemClass
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
              className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-sans font-medium rounded-[4px] transition-colors duration-150 cursor-pointer ${
                activeView === 'import-sync'
                  ? activeItemClass
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

      {/* Bottom Footer: Quiet Single-Line Status Only (No Chat Button) */}
      <div
        className={`px-3.5 py-3 border-t ${
          isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
        }`}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-sans text-zinc-500 dark:text-zinc-400 truncate">
          <span
            className={`w-1.5 h-1.5 rounded-[2px] shrink-0 ${
              isArchiveLoading ? 'bg-[#F59E0B]' : 'bg-[#10B981]'
            }`}
            aria-hidden="true"
          />
          <span className="truncate">
            {isArchiveLoading ? (
              'Loading PSI Archive...'
            ) : (
              <>
                <span className="font-mono tabular-nums">
                  {investigationCount}
                </span>{' '}
                PSI Investigations •{' '}
                <span className="font-mono tabular-nums">
                  {totalRunsCount.toLocaleString()}
                </span>{' '}
                Runs • Ready
              </>
            )}
          </span>
        </div>
      </div>
    </aside>
  );
};
