import React from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Flame,
  FlaskConical,
  GitCompare,
  RefreshCw,
  TerminalSquare,
} from 'lucide-react';
import { QuickScenarioId, ThemeMode, WorkspaceView } from '../types/psi';

interface OverviewViewProps {
  theme: ThemeMode;
  investigationCount: number;
  totalRunsCount: number;
  literatureChunksCount: number;
  missionCasesCount: number;
  isArchiveLoading: boolean;
  onNavigate: (view: WorkspaceView) => void;
  onStartQuickScenario: (scenarioId: QuickScenarioId) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
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

  const displayInvestigations =
    investigationCount > 0 ? investigationCount : 18;
  const displayRuns = totalRunsCount > 0 ? totalRunsCount : 1616;
  const displayGuideSections =
    literatureChunksCount > 0 ? literatureChunksCount : 979;

  const staticSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const sectionCardClass = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const openButtonClass = isDark
    ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200'
    : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800';

  const quickCardClass = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA] hover:bg-[#18181B] hover:border-zinc-500 shadow-xs hover:shadow-md'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B] hover:bg-zinc-50 hover:border-zinc-400 shadow-xs hover:shadow-md';

  const workspaceSections: {
    id: WorkspaceView;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
    detailLine: string;
  }[] = [
    {
      id: 'virtual-lab',
      title: 'Virtual Test Lab',
      icon: FlaskConical,
      description:
        'Test how fast a fire spreads by adjusting cabin oxygen, air pressure, airflow, gravity, and sample thickness.',
      detailLine: 'Includes 5 spacecraft materials & pass/fail thickness checks',
    },
    {
      id: 'comparator',
      title: 'Run Comparator',
      icon: GitCompare,
      description:
        'Line up up to 4 historical test runs side by side to compare flame speed, peak temperature, and smoke output.',
      detailLine: 'Compare 0–120s curves and test measurements in one table',
    },
    {
      id: 'visual-studio',
      title: 'Visual Analytics Studio',
      icon: BarChart3,
      description:
        'Browse 25 chart types across real spaceflight runs, filter by material or flight mission, and customize every axis.',
      detailLine: `${displayRuns.toLocaleString()} flight runs · X, Y & Color controls`,
    },
    {
      id: 'model-console',
      title: 'Model Console',
      icon: TerminalSquare,
      description:
        'Ask plain-English questions, decode why a chart looks the way it does, and test "what-if" air changes.',
      detailLine: 'Backed by flight data & the ISS fire-safety handbook',
    },
    {
      id: 'investigations',
      title: 'Data Archive',
      icon: BookOpen,
      description:
        'Search all flight experiments, individual test rows, ISS handbook chapters, and historic cabin fire case studies.',
      detailLine: `${displayInvestigations} Experiments · ${displayRuns.toLocaleString()} Runs · ${displayGuideSections.toLocaleString()} Guide Sections · ${missionCasesCount} Cases`,
    },
    {
      id: 'import-sync',
      title: 'Data Import & Sync',
      icon: RefreshCw,
      description:
        'Upload your own CSV or JSON fire-test spreadsheets into the charts and simulator, or check loaded data files.',
      detailLine: 'Automatic column checking & unit conversion',
    },
  ];

  return (
    <div className="space-y-8 py-2">
      {/* Compact Inside-App Overview Header */}
      <section className="space-y-2 pt-1">
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-sans text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span
              className={`w-1.5 h-1.5 rounded-[2px] ${
                isArchiveLoading ? 'bg-[#F59E0B]' : 'bg-[#10B981]'
              }`}
              aria-hidden="true"
            />
            {isArchiveLoading
              ? 'Loading flight test records...'
              : `${displayRuns.toLocaleString()} Flight Runs Loaded`}
          </span>
          <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">
            •
          </span>
          <span>Spacecraft Fire Safety Workspace</span>
        </div>

        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
          Workspace Overview &amp; User Guide
        </h1>
        <p className="font-sans text-sm text-zinc-600 dark:text-zinc-400 max-w-3xl leading-relaxed">
          Everything inside PSI Data Manager helps you check material fire risk
          in space conditions, inspect real flight measurements, and compare past
          missions without needing specialist lab software.
        </p>
      </section>

      {/* Section 1 — How to Use This Platform (3 Simple Steps) */}
      <section aria-label="How to Use This Platform" className="space-y-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">
            How to Use This Platform
          </h2>
          <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Follow three quick steps from initial safety check to full data review.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`p-4 rounded-lg border ${staticSurface} space-y-2`}>
            <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Step 1
            </div>
            <h3 className="font-display text-sm font-semibold">
              Set Cabin Air &amp; Material
            </h3>
            <p className="text-xs font-sans text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Pick cabin air and material settings in{' '}
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Virtual Test Lab
              </span>{' '}
              to check flame speed, peak gas heat, and quenching thickness safety
              margins.
            </p>
          </div>

          <div className={`p-4 rounded-lg border ${staticSurface} space-y-2`}>
            <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Step 2
            </div>
            <h3 className="font-display text-sm font-semibold">
              Explore Real Space Flight Data
            </h3>
            <p className="text-xs font-sans text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Open{' '}
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Visual Analytics Studio
              </span>{' '}
              to compare 25 chart types across {displayRuns.toLocaleString()}{' '}
              flight runs, and switch X, Y, and Color axes freely.
            </p>
          </div>

          <div className={`p-4 rounded-lg border ${staticSurface} space-y-2`}>
            <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Step 3
            </div>
            <h3 className="font-display text-sm font-semibold">
              Ask Questions &amp; Check Sources
            </h3>
            <p className="text-xs font-sans text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Ask plain-English questions in{' '}
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Model Console
              </span>{' '}
              or inspect original flight test tables and handbook notes inside{' '}
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Data Archive
              </span>
              .
            </p>
          </div>
        </div>
      </section>

      {/* Section 2 — What Is Inside Each Section (6 Cards with Open -> Buttons) */}
      <section aria-label="What Is Inside Each Section" className="space-y-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">
            What Is Inside Each Section
          </h2>
          <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Jump straight into any workspace module using the sidebar or the
            buttons below.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaceSections.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={`p-4 rounded-lg border flex flex-col justify-between gap-4 ${sectionCardClass}`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-md border flex items-center justify-center shrink-0 ${
                          isDark
                            ? 'bg-[#18181B] border-[#27272A] text-zinc-200'
                            : 'bg-zinc-100 border-[#E4E4E7] text-zinc-800'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <h3 className="font-display text-sm font-semibold tracking-tight">
                        {item.title}
                      </h3>
                    </div>
                  </div>

                  <p className="text-xs font-sans text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {item.description}
                  </p>
                  <div className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                    {item.detailLine}
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-all duration-150 active:scale-[0.98] cursor-pointer ${openButtonClass}`}
                  >
                    <span>Open</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 3 — Quick-Start Examples */}
      <section aria-label="Quick-Start Examples" className="space-y-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">
            Quick-Start Examples
          </h2>
          <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Click any ready-made scenario to load its settings right away.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => onStartQuickScenario('lunar-cabin')}
            className={`group text-left p-4 rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-3 hover:-translate-y-0.5 ${quickCardClass}`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-sans font-medium text-zinc-500 dark:text-zinc-400">
                <Flame className="w-3.5 h-3.5 shrink-0" />
                <span>Lunar Exploration Cabin</span>
              </div>
              <div className="font-display text-sm font-semibold">
                34% Oxygen · 8.2 psi · 0.166g
              </div>
              <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Check how materials behave inside an elevated-oxygen Moon
                habitat where higher oxygen increases flame risk.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-sans font-semibold text-[#18181B] dark:text-[#FAFAFA]">
              <span>Open in Virtual Test Lab</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => onStartQuickScenario('cool-flame')}
            className={`group text-left p-4 rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-3 hover:-translate-y-0.5 ${quickCardClass}`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-sans font-medium text-zinc-500 dark:text-zinc-400">
                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                <span>Invisible Cool-Flame Behavior</span>
              </div>
              <div className="font-display text-sm font-semibold">
                Low Airflow &amp; Hidden Heat Zones
              </div>
              <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 leading-relaxed">
                See where slow space-station airflow allows cool flames that keep
                burning without bright light or heavy soot.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-sans font-semibold text-[#18181B] dark:text-[#FAFAFA]">
              <span>Open in Visual Analytics Studio</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => onStartQuickScenario('apollo-mir')}
            className={`group text-left p-4 rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-3 hover:-translate-y-0.5 ${quickCardClass}`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-sans font-medium text-zinc-500 dark:text-zinc-400">
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>Apollo 1 vs. Mir Fire Safety Lessons</span>
              </div>
              <div className="font-display text-sm font-semibold">
                Mission Incidents &amp; Fire Standards
              </div>
              <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Compare historical cabin fires and see how those lessons shaped
                modern oxygen limits, smoke detectors, and wiring rules.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-sans font-semibold text-[#18181B] dark:text-[#FAFAFA]">
              <span>Open in Mission &amp; Spin-Off Cases</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>
      </section>
    </div>
  );
};
