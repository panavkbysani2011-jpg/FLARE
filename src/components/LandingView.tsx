import React from 'react';
import {
  ArrowRight,
  BarChart3,
  Flame,
  FlaskConical,
  TerminalSquare,
} from 'lucide-react';
import { QuickScenarioId, ThemeMode, WorkspaceView } from '../types/psi';

interface LandingViewProps {
  theme: ThemeMode;
  investigationCount: number;
  totalRunsCount: number;
  literatureChunksCount: number;
  missionCasesCount: number;
  isArchiveLoading: boolean;
  onEnterWorkspace: () => void;
  onSelectWorkspace: (view: WorkspaceView) => void;
  onStartQuickScenario: (scenarioId: QuickScenarioId) => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  theme,
  investigationCount,
  totalRunsCount,
  literatureChunksCount,
  missionCasesCount,
  isArchiveLoading,
  onEnterWorkspace,
  onSelectWorkspace,
  onStartQuickScenario,
}) => {
  const isDark = theme === 'dark';

  const displayInvestigations =
    investigationCount > 0 ? investigationCount : 18;
  const displayRuns = totalRunsCount > 0 ? totalRunsCount : 1616;
  const displayGuideSections =
    literatureChunksCount > 0 ? literatureChunksCount : 979;

  const bodySurface = isDark
    ? 'bg-[#09090B] text-[#FAFAFA]'
    : 'bg-[#FAFAFA] text-[#18181B]';

  const statCardClass = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const toolCardClass = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA] hover:bg-[#18181B] hover:border-zinc-500 shadow-sm hover:shadow-md'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B] hover:bg-zinc-50 hover:border-zinc-400 shadow-sm hover:shadow-md';

  return (
    <div className={`min-h-screen flex flex-col ${bodySurface}`}>
      {/* Sleek Dark Hero Canvas (#09090B) — Full-Width Entry without Sidebar */}
      <section className="relative bg-[#09090B] text-[#FAFAFA] border-b border-[#27272A] overflow-hidden">
        {/* Right-Side Subtle Microgravity Spherical Flame Visual */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-full md:w-[68%] lg:w-[58%] flex items-center justify-end overflow-hidden"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 640 520"
            className="w-[460px] sm:w-[560px] lg:w-[640px] h-full max-w-none translate-x-10 sm:translate-x-6 select-none"
            role="presentation"
          >
            <defs>
              <radialGradient id="sgHaloOuter" cx="56%" cy="50%" r="48%">
                <stop offset="0%" stopColor="#1D4ED8" stopOpacity="0.30" />
                <stop offset="48%" stopColor="#0EA5E9" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#09090B" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="sgBlueShell" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#E0F2FE" stopOpacity="0.88" />
                <stop offset="30%" stopColor="#38BDF8" stopOpacity="0.62" />
                <stop offset="65%" stopColor="#2563EB" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#1E3A8A" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="sgAmberCore" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FEF3C7" stopOpacity="0.95" />
                <stop offset="45%" stopColor="#F59E0B" stopOpacity="0.65" />
                <stop offset="80%" stopColor="#D97706" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#09090B" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Broad ambient microgravity diffusion glow */}
            <circle cx="385" cy="260" r="245" fill="url(#sgHaloOuter)" />

            {/* Subtle concentric symmetry rings */}
            <circle
              cx="385"
              cy="260"
              r="182"
              fill="none"
              stroke="rgba(148, 163, 184, 0.10)"
              strokeWidth="1"
              strokeDasharray="4 6"
            />
            <circle
              cx="385"
              cy="260"
              r="138"
              fill="none"
              stroke="rgba(56, 189, 248, 0.16)"
              strokeWidth="1"
            />
            <line
              x1="185"
              y1="260"
              x2="585"
              y2="260"
              stroke="rgba(148, 163, 184, 0.08)"
              strokeWidth="1"
            />
            <line
              x1="385"
              y1="60"
              x2="385"
              y2="460"
              stroke="rgba(148, 163, 184, 0.08)"
              strokeWidth="1"
            />

            {/* Gently pulsing spherical 0g blue outer reaction shell + amber core */}
            <g className="spherical-flame-pulse">
              <circle cx="385" cy="260" r="118" fill="url(#sgBlueShell)" />
              <circle
                cx="385"
                cy="260"
                r="84"
                fill="none"
                stroke="rgba(125, 211, 252, 0.42)"
                strokeWidth="1.25"
              />
              <circle cx="385" cy="260" r="46" fill="url(#sgAmberCore)" />
              <circle cx="385" cy="260" r="14" fill="#FEF3C7" fillOpacity="0.72" />
            </g>
          </svg>

          {/* Left dark gradient fade so text stays razor-sharp at any viewport */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, #09090B 0%, rgba(9,9,11,0.94) 28%, rgba(9,9,11,0.52) 60%, rgba(9,9,11,0.08) 100%)',
            }}
          />
        </div>

        {/* Minimal Top Header Strip inside Hero */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 pt-6 pb-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
              <Flame className="w-3.5 h-3.5 text-[#FAFAFA]" />
            </div>
            <span className="font-display text-sm font-semibold tracking-tight text-white">
              PSI Data Manager
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 text-xs font-sans text-zinc-400">
            <span
              className={`w-1.5 h-1.5 rounded-[2px] ${
                isArchiveLoading ? 'bg-[#F59E0B]' : 'bg-[#10B981]'
              }`}
              aria-hidden="true"
            />
            <span>
              {isArchiveLoading
                ? 'Loading flight runs...'
                : `${displayRuns.toLocaleString()} flight runs loaded`}
            </span>
          </div>
        </div>

        {/* Main Hero Left Content */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 py-14 sm:py-20 lg:py-24">
          <div className="max-w-2xl space-y-5">
            <p className="text-xs font-sans font-medium tracking-wide uppercase text-sky-400/90">
              Spacecraft Fire Safety &amp; Microgravity Combustion
            </p>

            <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-white leading-[1.12]">
              PSI Data Manager — Test &amp; Analyze Fire Behavior in Space
            </h1>

            <p className="text-sm sm:text-base font-sans text-zinc-300 leading-relaxed max-w-xl">
              See how materials ignite, spread flames, or self-extinguish inside
              lunar habitats, spacecraft cabins, and low-airflow ducts before
              running physical ground tests.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onEnterWorkspace}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#FAFAFA] text-[#09090B] font-sans text-sm font-semibold shadow-md hover:bg-zinc-200 hover:-translate-y-0.5 transition-all duration-150 active:scale-[0.98] cursor-pointer"
              >
                <span>Open PSI Data Manager</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onStartQuickScenario('lunar-cabin')}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border border-zinc-700 bg-[#18181B]/90 text-zinc-100 font-sans text-sm font-medium hover:bg-zinc-800 hover:border-zinc-500 transition-all duration-150 active:scale-[0.98] cursor-pointer"
              >
                <span>Try Lunar Cabin Scenario</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Below Hero: 4 Simple Metric Blocks + 3 Core Tool Cards */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 sm:px-10 py-10 space-y-10">
        {/* 4 Simple Static Metric Blocks */}
        <section aria-label="Included Spacecraft Fire Safety Data" className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-sm font-semibold tracking-tight">
              What Data Is Included
            </h2>
            <span className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
              Loaded locally from flight test files and ISS safety guides
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-4 rounded-lg border ${statCardClass}`}>
              <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                {displayInvestigations}
              </div>
              <div className="mt-1 text-xs font-sans font-medium text-zinc-600 dark:text-zinc-400">
                Space Flight Experiments
              </div>
            </div>

            <div className={`p-4 rounded-lg border ${statCardClass}`}>
              <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                {displayRuns.toLocaleString()}
              </div>
              <div className="mt-1 text-xs font-sans font-medium text-zinc-600 dark:text-zinc-400">
                Calibrated Test Runs
              </div>
            </div>

            <div className={`p-4 rounded-lg border ${statCardClass}`}>
              <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                {displayGuideSections.toLocaleString()}
              </div>
              <div className="mt-1 text-xs font-sans font-medium text-zinc-600 dark:text-zinc-400">
                Guide &amp; Report Sections
              </div>
            </div>

            <div className={`p-4 rounded-lg border ${statCardClass}`}>
              <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
                {missionCasesCount}
              </div>
              <div className="mt-1 text-xs font-sans font-medium text-zinc-600 dark:text-zinc-400">
                Fire History &amp; Spin-Off Cases
              </div>
            </div>
          </div>
        </section>

        {/* 3 Core Tool Cards */}
        <section aria-label="Core Workspace Tools" className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-sm font-semibold tracking-tight">
              Core Tools Inside the Platform
            </h2>
            <span className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
              Click any tool to jump straight in
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Virtual Test Lab */}
            <button
              type="button"
              onClick={() => onSelectWorkspace('virtual-lab')}
              className={`group text-left p-5 rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-4 hover:-translate-y-0.5 ${toolCardClass}`}
            >
              <div className="space-y-3">
                <div
                  className={`w-9 h-9 rounded-md border flex items-center justify-center ${
                    isDark
                      ? 'bg-[#18181B] border-[#27272A] text-zinc-100'
                      : 'bg-zinc-100 border-[#E4E4E7] text-zinc-900'
                  }`}
                >
                  <FlaskConical className="w-4 h-4" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-display text-base font-semibold tracking-tight">
                    Virtual Test Lab
                  </h3>
                  <p className="text-xs font-sans text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Adjust oxygen, air pressure, airflow, gravity, and material
                    thickness to check flame spread speed and fire risk before
                    physical testing.
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                <span>Open Virtual Test Lab</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
              </span>
            </button>

            {/* Visual Analytics Studio */}
            <button
              type="button"
              onClick={() => onSelectWorkspace('visual-studio')}
              className={`group text-left p-5 rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-4 hover:-translate-y-0.5 ${toolCardClass}`}
            >
              <div className="space-y-3">
                <div
                  className={`w-9 h-9 rounded-md border flex items-center justify-center ${
                    isDark
                      ? 'bg-[#18181B] border-[#27272A] text-zinc-100'
                      : 'bg-zinc-100 border-[#E4E4E7] text-zinc-900'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-display text-base font-semibold tracking-tight">
                    Visual Analytics Studio
                  </h3>
                  <p className="text-xs font-sans text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Explore {displayRuns.toLocaleString()} spaceflight test runs
                    across 25 chart types with custom X-axis, Y-axis, and Color
                    grouping controls.
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                <span>Open Visual Analytics Studio</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
              </span>
            </button>

            {/* Model Console */}
            <button
              type="button"
              onClick={() => onSelectWorkspace('model-console')}
              className={`group text-left p-5 rounded-lg border transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between gap-4 hover:-translate-y-0.5 ${toolCardClass}`}
            >
              <div className="space-y-3">
                <div
                  className={`w-9 h-9 rounded-md border flex items-center justify-center ${
                    isDark
                      ? 'bg-[#18181B] border-[#27272A] text-zinc-100'
                      : 'bg-zinc-100 border-[#E4E4E7] text-zinc-900'
                  }`}
                >
                  <TerminalSquare className="w-4 h-4" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-display text-base font-semibold tracking-tight">
                    Model Console
                  </h3>
                  <p className="text-xs font-sans text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Ask plain-English questions, read what sensor charts mean,
                    and run quick &ldquo;what-if&rdquo; comparisons against past
                    flight tests.
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                <span>Open Model Console</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
              </span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};
