import React from 'react';
import { Download, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { PsiRun, SidebarState, ThemeMode, WorkspaceView } from '../types/psi';
import { getCanonicalPsiId } from '../utils/investigationArtifacts';

interface HeaderBarProps {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  activeView: WorkspaceView;
  inspectedRun?: PsiRun | null;
  sidebarState: SidebarState;
  onHeaderToggleSidebar: () => void;
  onExportBrief: () => void;
}

const VIEW_BREADCRUMBS: Record<WorkspaceView, { section: string; subPage?: string }> = {
  overview: { section: 'Overview' },
  'virtual-lab': { section: 'Virtual Test Lab' },
  comparator: { section: 'Virtual Test Lab', subPage: 'Run Comparator' },
  'visual-studio': { section: 'Visual Analytics Studio' },
  'model-console': { section: 'Model Console' },
  investigations: { section: 'Data Archive', subPage: 'PSI Investigations' },
  'experiment-runs': { section: 'Data Archive', subPage: 'Experiment Runs' },
  'researchers-guide': {
    section: 'Data Archive',
    subPage: "ISS Researcher's Guide",
  },
  'mission-spinoffs': {
    section: 'Data Archive',
    subPage: 'Mission & Spin-Off Cases',
  },
  'import-sync': { section: 'Data Import & Sync' },
  'investigation-detail': { section: 'Data Archive', subPage: 'Detail' },
};

export const HeaderBar: React.FC<HeaderBarProps> = ({
  theme,
  onThemeChange,
  activeView,
  inspectedRun,
  sidebarState,
  onHeaderToggleSidebar,
  onExportBrief,
}) => {
  const isDark = theme === 'dark';
  const crumb = VIEW_BREADCRUMBS[activeView];

  const topBarSurface = isDark
    ? 'bg-[#09090B]/95 border-[#27272A] text-[#FAFAFA]'
    : theme === 'light'
    ? 'bg-[#FFFFFF]/95 border-[#E4E4E7] text-[#09090B]'
    : 'bg-[#FAFAFA]/95 border-[#E4E4E7] text-[#18181B]';

  const groupSurface = isDark
    ? 'bg-[#18181B] border-[#27272A]'
    : 'bg-zinc-100 border-[#E4E4E7]';

  const activeMonochrome = isDark
    ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
    : 'bg-[#18181B] text-[#FFFFFF] font-semibold';

  const inactiveMonochrome = isDark
    ? 'text-zinc-400 hover:text-zinc-100'
    : 'text-zinc-600 hover:text-zinc-950';

  const detailPsiId =
    activeView === 'investigation-detail' && inspectedRun
      ? getCanonicalPsiId(inspectedRun)
      : null;

  const sidebarBtnTitle =
    sidebarState === 'hidden'
      ? 'Show Navigation Sidebar ([)'
      : sidebarState === 'compact'
      ? 'Expand Navigation Sidebar ([)'
      : 'Collapse Navigation Sidebar ([)';

  return (
    <header
      className={`sticky top-0 z-20 h-[52px] px-4 sm:px-5 border-b backdrop-blur-md flex items-center justify-between gap-4 transition-colors duration-150 ${topBarSurface}`}
    >
      {/* Left: Subtle Sidebar Expand/Collapse Trigger + Dynamic Breadcrumb */}
      <div className="flex items-center gap-2.5 text-xs font-sans font-medium min-w-0">
        <button
          type="button"
          onClick={onHeaderToggleSidebar}
          title={sidebarBtnTitle}
          aria-label={sidebarBtnTitle}
          className={`w-7 h-7 rounded-lg border shadow-xs flex items-center justify-center shrink-0 transition-all duration-150 active:scale-[0.98] cursor-pointer ${
            isDark
              ? 'bg-[#18181B] border-[#27272A] text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-800'
              : 'bg-white border-[#E4E4E7] text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 hover:border-zinc-300'
          }`}
        >
          {sidebarState === 'expanded' ? (
            <PanelLeftClose className="w-3.5 h-3.5" />
          ) : (
            <PanelLeftOpen className="w-3.5 h-3.5" />
          )}
        </button>

        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 min-w-0 truncate"
        >
          <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
            PSI Data Manager
          </span>
          <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
            /
          </span>
          <span
            className={
              crumb.subPage || detailPsiId
                ? 'text-zinc-500 dark:text-zinc-400 whitespace-nowrap'
                : 'font-semibold truncate'
            }
          >
            {crumb.section}
          </span>
          {(detailPsiId || crumb.subPage) && (
            <>
              <span
                className="text-zinc-300 dark:text-zinc-700"
                aria-hidden="true"
              >
                /
              </span>
              <span
                className={`font-semibold truncate ${
                  detailPsiId ? 'font-mono tabular-nums' : ''
                }`}
              >
                {detailPsiId ?? crumb.subPage}
              </span>
            </>
          )}
        </nav>
      </div>

      {/* Right: Export Safety Brief Outline Button + 3-Mode Theme Toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onExportBrief}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium rounded-lg border shadow-xs transition-all duration-150 active:scale-[0.98] whitespace-nowrap cursor-pointer ${
            isDark
              ? 'bg-[#18181B] border-[#27272A] text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800'
              : 'bg-white border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300'
          }`}
          title="Download Markdown safety brief for current virtual test and selected runs"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export Safety Brief</span>
          <span className="sm:hidden">Export Brief</span>
        </button>

        <div
          className={`flex items-center p-0.5 rounded-lg border ${groupSurface}`}
          role="group"
          aria-label="Theme Mode Switcher"
        >
          {(['normal', 'light', 'dark'] as ThemeMode[]).map((mode) => {
            const active = theme === mode;
            const label = mode.charAt(0).toUpperCase() + mode.slice(1);
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onThemeChange(mode)}
                className={`px-2.5 py-0.5 text-xs font-sans rounded-md transition-all duration-150 active:scale-[0.98] whitespace-nowrap cursor-pointer ${
                  active ? activeMonochrome + ' shadow-xs' : inactiveMonochrome
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
