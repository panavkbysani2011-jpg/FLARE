import React, { useState } from 'react';
import {
  Activity,
  BookOpen,
  Database,
  GitCompare,
  RefreshCw,
  Search,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { PsiRun, ThemeMode, WorkspaceView } from '../types/psi';

interface LeftSidebarProps {
  theme: ThemeMode;
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  selectedRunsCount: number;
  investigationCount: number;
  totalRunsCount: number;
  hasUnreadSync: boolean;
  runs: PsiRun[];
  onQuickJumpRun: (run: PsiRun) => void;
}

interface NavGroup {
  section: string;
  items: Array<{
    id: Exclude<WorkspaceView, 'investigation-detail'>;
    label: string;
    icon: React.FC<{ className?: string }>;
  }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    section: 'ANALYSIS WORKSPACE',
    items: [
      {
        id: 'overview',
        label: 'Simulation Workbench',
        icon: Activity,
      },
      {
        id: 'comparator',
        label: 'Run Comparator',
        icon: GitCompare,
      },
    ],
  },
  {
    section: 'ARCHIVE & DOCUMENTATION',
    items: [
      {
        id: 'investigations',
        label: 'Data Archive',
        icon: BookOpen,
      },
      {
        id: 'experiment-runs',
        label: 'Experiment Runs',
        icon: Database,
      },
    ],
  },
  {
    section: 'DATA PIPELINE',
    items: [
      {
        id: 'import-sync',
        label: 'Data Import & Sync',
        icon: RefreshCw,
      },
    ],
  },
];

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  theme,
  activeView,
  onSelectView,
  selectedRunsCount,
  investigationCount,
  totalRunsCount,
  hasUnreadSync,
  runs,
  onQuickJumpRun,
}) => {
  const [quickFind, setQuickFind] = useState('');

  const isDark = theme === 'dark';
  const railSurface = isDark
    ? 'bg-[#09090B] border-[#27272A] text-[#FAFAFA]'
    : theme === 'light'
    ? 'bg-[#FFFFFF] border-[#E4E4E7] text-[#09090B]'
    : 'bg-[#FAFAFA] border-[#E4E4E7] text-[#18181B]';

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

  return (
    <aside
      className={`w-full lg:w-[240px] shrink-0 lg:sticky lg:top-0 lg:h-screen border-b lg:border-b-0 lg:border-r flex flex-col justify-between select-none transition-colors duration-150 ${railSurface}`}
      aria-label="Primary Workspace Navigation"
    >
      {/* Top: Brand Header + Quick Filter + Grouped Navigation Rail */}
      <div className="p-3.5 space-y-3 overflow-y-auto">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-6 h-6 rounded-[4px] flex items-center justify-center border ${
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

          {/* Quick Jump Dropdown Results */}
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
                  className={`w-full text-left px-2 py-1.5 rounded-[3px] text-xs flex items-center justify-between gap-1 cursor-pointer ${
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

        {/* Structured Grouped Navigation Rail */}
        <nav className="space-y-4 pt-1" aria-label="Workspace Views">
          {NAV_GROUPS.map((group) => (
            <div key={group.section} className="space-y-1">
              <div className="px-2.5 pb-0.5 text-[10px] font-sans font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {group.section}
              </div>

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  activeView === item.id ||
                  (activeView === 'investigation-detail' &&
                    item.id === 'investigations');

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectView(item.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 text-xs font-sans font-medium rounded-[4px] transition-colors duration-150 cursor-pointer ${
                      isActive
                        ? isDark
                          ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                          : 'bg-[#18181B] text-[#FFFFFF] font-semibold'
                        : isDark
                        ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                        : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>

                    {item.id === 'investigations' && (
                      <span
                        className={`font-mono text-[10px] tabular-nums ${
                          isActive
                            ? isDark
                              ? 'text-zinc-700'
                              : 'text-zinc-300'
                            : 'text-zinc-400'
                        }`}
                      >
                        {investigationCount}
                      </span>
                    )}

                    {item.id === 'experiment-runs' && (
                      <span
                        className={`font-mono text-[10px] tabular-nums ${
                          isActive
                            ? isDark
                              ? 'text-zinc-700'
                              : 'text-zinc-300'
                            : 'text-zinc-400'
                        }`}
                      >
                        {runs.length.toLocaleString()}
                      </span>
                    )}

                    {item.id === 'comparator' && (
                      <span
                        className={`font-mono text-[10px] tabular-nums ${
                          isActive
                            ? isDark
                              ? 'text-zinc-700'
                              : 'text-zinc-300'
                            : 'text-zinc-400'
                        }`}
                      >
                        {selectedRunsCount}/4
                      </span>
                    )}

                    {item.id === 'import-sync' && hasUnreadSync && (
                      <span
                        className="w-1.5 h-1.5 rounded-[2px] bg-[#10B981] shrink-0"
                        aria-label="New sync data available"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Footer: Quiet Inline Metadata */}
      <div
        className={`px-4 py-3 border-t ${
          isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
        }`}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
          <span
            className="w-1.5 h-1.5 rounded-[2px] bg-[#10B981] shrink-0"
            aria-hidden="true"
          />
          <span>
            {investigationCount} PSI · {totalRunsCount.toLocaleString()} Runs ·
            Synced
          </span>
        </div>
      </div>
    </aside>
  );
};
