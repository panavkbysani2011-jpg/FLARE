import React from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Database,
  Flame,
  FlaskConical,
  TerminalSquare,
} from 'lucide-react';
import { ThemeMode, WorkspaceView } from '../types/psi';

export type QuickScenarioId = 'lunar-cabin' | 'cool-flame' | 'apollo-mir';

interface HomeViewProps {
  theme: ThemeMode;
  investigationCount: number;
  totalRunsCount: number;
  literatureChunksCount: number;
  missionCasesCount: number;
  isArchiveLoading: boolean;
  onNavigate: (view: WorkspaceView) => void;
  onStartQuickScenario: (scenarioId: QuickScenarioId) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  theme,
  investigationCount,
  totalRunsCount,
  literatureChunksCount,
  missionCasesCount,
  isArchiveLoading,
  onNavigate,
  onStartQuickScenario,
}) => {
  const isDark = theme === 'dark';

  const displayInvestigations = investigationCount > 0 ? investigationCount : 18;
  const displayRuns = totalRunsCount > 0 ? totalRunsCount : 1616;
  const displayGuideSections = literatureChunksCount > 0 ? literatureChunksCount : 979;

  const panelSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const interactiveCardClass = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA] hover:bg-[#18181B] hover:border-zinc-500 shadow-sm hover:shadow-md'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B] hover:bg-zinc-50 hover:border-zinc-400 shadow-sm hover:shadow-md';

  const quickScenarioButtonClass = isDark
    ? 'bg-[#18181B] border-[#27272A] text-[#FAFAFA] hover:bg-zinc-800/90 hover:border-zinc-500 shadow-xs hover:shadow-sm'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B] hover:bg-zinc-50 hover:border-zinc-400 shadow-xs hover:shadow-sm';

  return (
    <div className="space-y-8 py-2">
      {/* 1. Top Hero Section */}
      <section className="space-y-3 pt-1">
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-sans text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span
              className={`w-2 h-2 rounded-[2px] ${
                isArchiveLoading ? 'bg-[#F59E0B]' : 'bg-[#10B981]'
              }`}
              aria-hidden="true"
            />
            <span>
              {isArchiveLoading
                ? 'Loading Verified Reference Corpus...'
                : 'Verified Reference Corpus Ready'}
            </span>
          </span>
          <span aria-hidden="true">·</span>
          <span>Physical Science Informatics Workbench</span>
        </div>

        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight leading-tight max-w-4xl">
          PSI Data Manager — Spacecraft Fire Safety &amp; Microgravity Combustion Platform
        </h1>

        <p className="font-sans text-sm sm:text-[15px] text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-3xl">
          Test how cabin materials behave under lunar, orbital, and custom atmosphere conditions before running costly hardware tests. Compare{' '}
          <span className="font-mono tabular-nums">{displayRuns.toLocaleString()}</span> historical flight runs, spot hidden cool-flame hazards, and check safety limits in plain language.
        </p>
      </section>

      {/* 2. Three Main Action Cards */}
      <section className="space-y-3" aria-label="Primary Workspaces">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-200">
            Start Working
          </h2>
          <span className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Choose a workspace to open directly
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('virtual-lab')}
            className={`group text-left p-5 rounded-xl border transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-5 ${interactiveCardClass}`}
          >
            <div className="space-y-3">
              <div
                className={`w-10 h-10 rounded-lg border flex items-center justify-center ${
                  isDark
                    ? 'bg-[#18181B] border-[#27272A] text-[#FAFAFA]'
                    : 'bg-zinc-100 border-[#E4E4E7] text-[#18181B]'
                }`}
              >
                <FlaskConical className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-base font-bold tracking-tight">
                  Virtual Test Lab
                </h3>
                <p className="text-xs sm:text-[13px] font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Run virtual fire safety tests under lunar, orbital, or custom cabin conditions and check prediction confidence.
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold pt-2 border-t border-[#E4E4E7] dark:border-[#27272A]">
              <span>Open Virtual Test Lab</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('visual-studio')}
            className={`group text-left p-5 rounded-xl border transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-5 ${interactiveCardClass}`}
          >
            <div className="space-y-3">
              <div
                className={`w-10 h-10 rounded-lg border flex items-center justify-center ${
                  isDark
                    ? 'bg-[#18181B] border-[#27272A] text-[#FAFAFA]'
                    : 'bg-zinc-100 border-[#E4E4E7] text-[#18181B]'
                }`}
              >
                <BarChart3 className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-base font-bold tracking-tight">
                  Visual Analytics Studio
                </h3>
                <p className="text-xs sm:text-[13px] font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Explore <span className="font-mono tabular-nums">{displayRuns.toLocaleString()}</span> calibrated experiment runs across <span className="font-mono tabular-nums">25</span> chart types with custom axis controls.
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold pt-2 border-t border-[#E4E4E7] dark:border-[#27272A]">
              <span>Open Visual Analytics Studio</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('model-console')}
            className={`group text-left p-5 rounded-xl border transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-5 ${interactiveCardClass}`}
          >
            <div className="space-y-3">
              <div
                className={`w-10 h-10 rounded-lg border flex items-center justify-center ${
                  isDark
                    ? 'bg-[#18181B] border-[#27272A] text-[#FAFAFA]'
                    : 'bg-zinc-100 border-[#E4E4E7] text-[#18181B]'
                }`}
              >
                <TerminalSquare className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-base font-bold tracking-tight">
                  Model Console
                </h3>
                <p className="text-xs sm:text-[13px] font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Ask questions, decode sensor patterns, and test &ldquo;what-if&rdquo; scenarios using the combustion model.
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold pt-2 border-t border-[#E4E4E7] dark:border-[#27272A]">
              <span>Open Model Console</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </div>
          </button>
        </div>
      </section>

      {/* 3. Corpus Summary Strip (Static Non-Interactive Metrics) */}
      <section className="space-y-3" aria-label="Verified Corpus Summary">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-200">
            Reference Data Included
          </h2>
          <span className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Source: Verified Physical Science Informatics &amp; ISS Reference Corpus
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className={`p-4 rounded-lg border ${panelSurface}`}>
            <div className="font-mono text-2xl font-bold tabular-nums">
              {displayInvestigations}
            </div>
            <div className="mt-1 text-xs font-sans font-medium text-zinc-600 dark:text-zinc-300">
              Orbital Investigations
            </div>
          </div>

          <div className={`p-4 rounded-lg border ${panelSurface}`}>
            <div className="font-mono text-2xl font-bold tabular-nums">
              {displayRuns.toLocaleString()}
            </div>
            <div className="mt-1 text-xs font-sans font-medium text-zinc-600 dark:text-zinc-300">
              Calibrated Runs
            </div>
          </div>

          <div className={`p-4 rounded-lg border ${panelSurface}`}>
            <div className="font-mono text-2xl font-bold tabular-nums">
              {displayGuideSections.toLocaleString()}
            </div>
            <div className="mt-1 text-xs font-sans font-medium text-zinc-600 dark:text-zinc-300">
              Indexed Guide Sections
            </div>
          </div>

          <div className={`p-4 rounded-lg border ${panelSurface}`}>
            <div className="font-mono text-2xl font-bold tabular-nums">
              {missionCasesCount}
            </div>
            <div className="mt-1 text-xs font-sans font-medium text-zinc-600 dark:text-zinc-300">
              Historical &amp; Earth Spin-Off Cases
            </div>
          </div>
        </div>
      </section>

      {/* 4. Quick-Start Scenarios (3 Clickable Pre-Loaded Cards) */}
      <section className="space-y-3" aria-label="Quick-Start Scenarios">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-200">
            Quick-Start Scenarios
          </h2>
          <span className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Open ready-to-explore examples with one click
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => onStartQuickScenario('lunar-cabin')}
            className={`group text-left p-4 rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-3 ${quickScenarioButtonClass}`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-sans font-medium text-zinc-500 dark:text-zinc-400">
                <span className="w-2 h-2 rounded-[2px] bg-[#10B981]" aria-hidden="true" />
                <span>Virtual Test Lab</span>
              </div>
              <h3 className="font-display text-sm font-bold tracking-tight">
                Lunar Exploration Cabin
              </h3>
              <p className="text-xs font-sans text-zinc-600 dark:text-zinc-300">
                <span className="font-mono tabular-nums">34%</span> Oxygen,{' '}
                <span className="font-mono tabular-nums">8.2</span> psi,{' '}
                <span className="font-mono tabular-nums">0.166g</span> — evaluate cabin materials in reduced pressure &amp; lunar gravity.
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold pt-1">
              <span>Load in Virtual Test Lab</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onStartQuickScenario('cool-flame')}
            className={`group text-left p-4 rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-3 ${quickScenarioButtonClass}`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-sans font-medium text-zinc-500 dark:text-zinc-400">
                <span className="w-2 h-2 rounded-[2px] bg-[#F59E0B]" aria-hidden="true" />
                <span>Visual Analytics Studio</span>
              </div>
              <h3 className="font-display text-sm font-bold tracking-tight">
                Invisible Cool-Flame Behavior
              </h3>
              <p className="text-xs font-sans text-zinc-600 dark:text-zinc-300">
                Low-airflow radiative quenching (<span className="font-mono tabular-nums">550K–800K</span>) where flames produce heat without visible smoke cameras can see.
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold pt-1">
              <span>Explore in Visual Analytics Studio</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onStartQuickScenario('apollo-mir')}
            className={`group text-left p-4 rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-3 ${quickScenarioButtonClass}`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-sans font-medium text-zinc-500 dark:text-zinc-400">
                <span className="w-2 h-2 rounded-[2px] bg-[#EF4444]" aria-hidden="true" />
                <span>Mission &amp; Spin-Off Cases</span>
              </div>
              <h3 className="font-display text-sm font-bold tracking-tight">
                Apollo 1 vs. Mir Fire Safety Lessons
              </h3>
              <p className="text-xs font-sans text-zinc-600 dark:text-zinc-300">
                Compare historical spacecraft fires against orbital research and firefighter spin-off hardware.
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold pt-1">
              <span>Open Mission &amp; Spin-Off Cases</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </div>
          </button>
        </div>
      </section>

      {/* Secondary Archive Direct Access Row */}
      <section className="flex flex-wrap items-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => onNavigate('investigations')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-sans font-medium rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer ${quickScenarioButtonClass}`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Browse All {displayInvestigations} PSI Investigations</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('researchers-guide')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-sans font-medium rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer ${quickScenarioButtonClass}`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Read ISS Combustion Guide (50 pp.)</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('import-sync')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-sans font-medium rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer ${quickScenarioButtonClass}`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Upload Custom Test Data</span>
        </button>
      </section>
    </div>
  );
};
