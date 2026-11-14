import React from 'react';
import { MessageSquareText, Download } from 'lucide-react';
import { PsiRun, ThemeMode, WorkspaceView } from '../types/psi';
import { getCanonicalPsiId } from '../utils/investigationArtifacts';

interface HeaderBarProps {
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  activeView: WorkspaceView;
  inspectedRun?: PsiRun | null;
  isAssistantOpen: boolean;
  onToggleAssistant: () => void;
  onExportBrief: () => void;
}

const VIEW_METADATA: Record<
  WorkspaceView,
  { breadcrumb: string; headlinePrimary: string; headlineSecondary: string }
> = {
  overview: {
    breadcrumb: 'Simulation Workbench',
    headlinePrimary: 'Microgravity Combustion Analysis.',
    headlineSecondary: 'Simulate and compare cabin fire safety thresholds.',
  },
  comparator: {
    breadcrumb: 'Run Comparator',
    headlinePrimary: 'Side-by-Side Telemetry Matrix.',
    headlineSecondary: 'Inspect normalized multi-axis deltas across selected runs.',
  },
  investigations: {
    breadcrumb: 'Data Archive',
    headlinePrimary: 'Physical Science Informatics Data Archive.',
    headlineSecondary:
      'Explore 18 PSI investigations, the 50-page ISS Researcher’s Guide, and historical fire & spin-off cases.',
  },
  'experiment-runs': {
    breadcrumb: 'Experiment Runs',
    headlinePrimary: 'Granular Experiment Run Catalog.',
    headlineSecondary:
      'Filter, sort, and multi-select individual microgravity combustion runs.',
  },
  'import-sync': {
    breadcrumb: 'Data Import & Sync',
    headlinePrimary: 'Dataset Ingestion & Archive Sync.',
    headlineSecondary:
      'Validate custom CSV/JSON telemetry and normalize units.',
  },
  'investigation-detail': {
    breadcrumb: 'Data Archive / Detail',
    headlinePrimary: 'PSI Investigation & Telemetry Dossier.',
    headlineSecondary:
      'Calibrated run parameters, real CSV telemetry sweeps, documentation artifacts, and official PSI links.',
  },
};

export const HeaderBar: React.FC<HeaderBarProps> = ({
  theme,
  onThemeChange,
  activeView,
  inspectedRun,
  isAssistantOpen,
  onToggleAssistant,
  onExportBrief,
}) => {
  const isDark = theme === 'dark';
  const meta = VIEW_METADATA[activeView];

  const topBarSurface = isDark
    ? 'bg-[#09090B]/90 border-[#27272A] text-[#FAFAFA]'
    : theme === 'light'
    ? 'bg-[#FFFFFF]/95 border-[#E4E4E7] text-[#09090B]'
    : 'bg-[#FAFAFA]/90 border-[#E4E4E7] text-[#18181B]';

  const groupSurface = isDark
    ? 'bg-[#18181B] border-[#27272A]'
    : 'bg-zinc-100 border-[#E4E4E7]';

  const activeMonochrome = isDark
    ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
    : 'bg-[#18181B] text-[#FFFFFF] font-semibold';

  const inactiveMonochrome = isDark
    ? 'text-zinc-400 hover:text-zinc-100'
    : 'text-zinc-600 hover:text-zinc-950';

  const detailBreadcrumb =
    activeView === 'investigation-detail' && inspectedRun
      ? `Data Archive / ${getCanonicalPsiId(inspectedRun)}`
      : meta.breadcrumb;

  return (
    <div className="w-full">
      {/* Global Top Header (52px compact height) */}
      <header
        className={`sticky top-0 z-20 h-[52px] px-5 border-b backdrop-blur-md flex items-center justify-between gap-4 transition-colors duration-150 ${topBarSurface}`}
      >
        {/* Left: Dynamic Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-sans font-medium min-w-0">
          <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
            PSI Data Manager
          </span>
          <span className="text-zinc-300 dark:text-zinc-700" aria-hidden="true">
            /
          </span>
          <span className="font-semibold truncate">{detailBreadcrumb}</span>
        </div>

        {/* Right: Export Brief + AI Assistant (with ⌘K badge) + 3-Mode Theme Switcher */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onExportBrief}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium rounded-[4px] border transition-colors duration-150 whitespace-nowrap cursor-pointer ${
              isDark
                ? 'bg-[#18181B] border-[#27272A] text-zinc-200 hover:border-zinc-500'
                : 'bg-white border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100'
            }`}
            title="Download formatted Markdown engineering report of current state"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Brief</span>
          </button>

          <button
            type="button"
            onClick={onToggleAssistant}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium rounded-[4px] border transition-colors duration-150 whitespace-nowrap cursor-pointer ${
              isAssistantOpen
                ? activeMonochrome +
                  (isDark ? ' border-[#FAFAFA]' : ' border-[#18181B]')
                : isDark
                ? 'bg-[#18181B] border-[#27272A] text-zinc-200 hover:border-zinc-500'
                : 'bg-white border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100'
            }`}
          >
            <MessageSquareText className="w-3.5 h-3.5" />
            <span>AI Assistant</span>
            <kbd
              className={`ml-0.5 px-1 py-0.2 text-[10px] font-mono rounded-[3px] border ${
                isAssistantOpen
                  ? isDark
                    ? 'border-zinc-400 text-zinc-800 bg-zinc-200'
                    : 'border-zinc-700 text-zinc-200 bg-zinc-800'
                  : isDark
                  ? 'border-[#27272A] text-zinc-400 bg-zinc-900'
                  : 'border-[#E4E4E7] text-zinc-500 bg-zinc-100'
              }`}
            >
              ⌘K
            </kbd>
          </button>

          <div
            className={`flex items-center p-0.5 rounded-[5px] border ${groupSurface}`}
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
                  className={`px-2 py-0.5 text-xs font-sans rounded-[4px] transition-colors duration-150 whitespace-nowrap cursor-pointer ${
                    active ? activeMonochrome : inactiveMonochrome
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Compact Single-Line Two-Tone Subheader */}
      <div className="px-5 pt-2 pb-1 flex items-baseline justify-between gap-4">
        <h1 className="font-display text-base sm:text-lg tracking-tight leading-snug truncate">
          <span className="font-semibold">{meta.headlinePrimary}</span>{' '}
          <span className="font-sans font-normal text-sm text-zinc-500 dark:text-zinc-400">
            {meta.headlineSecondary}
          </span>
        </h1>
      </div>
    </div>
  );
};
