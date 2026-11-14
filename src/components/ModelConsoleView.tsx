import React, { useMemo, useRef, useState } from 'react';
import {
  Terminal,
  Sliders,
  BookOpen,
  ShieldAlert,
  GitBranch,
  ArrowUpRight,
  Check,
  Send,
  RotateCcw,
  Activity,
  X,
  Settings,
} from 'lucide-react';
import {
  AssistantMessage,
  ConsoleMode,
  DecodedChartContext,
  SimulationResponse,
  ThemeMode,
  VirtualTestConfig,
} from '../types/psi';
import {
  getApiEndpointConfig,
  isRemoteApiConfigured,
} from '../services/psiApi';
import { CollapsibleCard } from './CollapsibleCard';

interface ModelConsoleViewProps {
  theme: ThemeMode;
  activeMode: ConsoleMode;
  onChangeMode: (mode: ConsoleMode) => void;
  virtualConfig: VirtualTestConfig;
  simulation: SimulationResponse;
  messages: AssistantMessage[];
  isRunningInference: boolean;
  activeChartContext: DecodedChartContext | null;
  onClearChartContext: () => void;
  totalRunsCount: number;
  investigationCount: number;
  literatureChunksCount: number;
  onSubmitInference: (promptText: string, mode: ConsoleMode) => void;
  onResetConsole: () => void;
  onApplyParamsToVirtualLab: (params: Partial<VirtualTestConfig>) => void;
  onOpenInvestigation: (psiId: string) => void;
  onGoToEndpointConfig: () => void;
}

const MODE_DEFINITIONS: Array<{
  id: ConsoleMode;
  label: string;
  shortDesc: string;
  starters: string[];
}> = [
  {
    id: 'decoder',
    label: 'Explain Chart & Sensors',
    shortDesc:
      'Explain what sensor curves, cool-flame zones, or Visual Analytics Studio charts mean in plain English.',
    starters: [
      'Explain the current 0–120s temperature, heat glow, and smoke visibility readings',
      'Explain why 550K–800K cool flames evade optical cameras under low airflow',
      'Explain low-gravity forced-ventilation peak between 0.05 and 0.22 m/s',
    ],
  },
  {
    id: 'what-if',
    label: '"What-If" Scenarios',
    shortDesc:
      'Test how changing O2 %, airflow, thickness, or materials changes fire speed and risk, with one-click lab loading.',
    starters: [
      'What if cabin O2 rises to 40% under Lunar 0.166g with PMMA at 2.0 mm?',
      'What if ventilation drops to 0.04 m/s quiescent flow vs 0.14 m/s?',
      'Compare Cotton-Fiberglass vs Nomex and increased 4.0 mm thickness',
    ],
  },
  {
    id: 'literature',
    label: 'Guide & Past Missions',
    shortDesc:
      'Search SAFFIRE-II test reports, the 50-page ISS Researcher\'s Guide, and historical flight fire briefs.',
    starters: [
      'Compare SAFFIRE-II (PSI-99) and BASS-II (PSI-25) space flame spread limits',
      'Summarize ISS Researcher\'s Guide cool-flame discovery and FLEX droplet findings',
      'Review Apollo 1, Apollo 13 PTFE wire arc, and Mir oxygen candle fire lessons',
    ],
  },
  {
    id: 'risk-audit',
    label: 'Pre-Test Safety Check',
    shortDesc:
      'Check your current settings against spacecraft fire safety limits, quenching thickness rules, and model confidence.',
    starters: [
      'Run full 4-gate pre-test spacecraft fire safety check on current setup',
      'Check conductive quenching thickness margin and physical test necessity',
      'Recommend safest barrier thickness & material mitigation under current O2',
    ],
  },
];

export const ModelConsoleView: React.FC<ModelConsoleViewProps> = ({
  theme,
  activeMode,
  onChangeMode,
  virtualConfig,
  simulation,
  messages,
  isRunningInference,
  activeChartContext,
  onClearChartContext,
  totalRunsCount,
  investigationCount,
  literatureChunksCount,
  onSubmitInference,
  onResetConsole,
  onApplyParamsToVirtualLab,
  onOpenInvestigation,
  onGoToEndpointConfig,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [appliedMsgId, setAppliedMsgId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const isDark = theme === 'dark';
  const apiConfig = getApiEndpointConfig();
  const remoteConfigured = isRemoteApiConfigured(apiConfig);

  const cardSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const subSurface = isDark
    ? 'bg-[#09090B]/70 border-[#27272A]'
    : 'bg-[#FAFAFA] border-[#E4E4E7]';

  const activeMonochrome = isDark
    ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA] font-semibold shadow-xs hover:bg-zinc-200 hover:shadow-sm active:scale-[0.98] transition-all'
    : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B] font-semibold shadow-xs hover:bg-zinc-800 hover:shadow-sm active:scale-[0.98] transition-all';

  const inactiveMonochrome = isDark
    ? 'bg-[#18181B] text-zinc-300 border-[#27272A] hover:bg-zinc-800 hover:border-zinc-600 shadow-xs active:scale-[0.98] transition-all'
    : 'bg-white text-zinc-700 border-[#E4E4E7] hover:bg-zinc-100 hover:border-zinc-300 shadow-xs active:scale-[0.98] transition-all';

  const activeModeMeta = useMemo(
    () =>
      MODE_DEFINITIONS.find((m) => m.id === activeMode) ?? MODE_DEFINITIONS[0],
    [activeMode]
  );

  const regimeColor =
    simulation.hazardStatus === 'Rapid Flame Spread'
      ? '#EF4444'
      : simulation.hazardStatus === 'Cool Flame Caution'
      ? '#F59E0B'
      : '#10B981';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isRunningInference) return;
    onSubmitInference(trimmed, activeMode);
    setInputValue('');
  };

  const handleApplyParams = (
    params: Partial<VirtualTestConfig>,
    keyId: string
  ) => {
    onApplyParamsToVirtualLab(params);
    setAppliedMsgId(keyId);
    window.setTimeout(() => setAppliedMsgId(null), 2500);
  };

  const getModeIcon = (mode: ConsoleMode) => {
    switch (mode) {
      case 'decoder':
        return <Activity className="w-3.5 h-3.5 shrink-0" />;
      case 'what-if':
        return <GitBranch className="w-3.5 h-3.5 shrink-0" />;
      case 'literature':
        return <BookOpen className="w-3.5 h-3.5 shrink-0" />;
      case 'risk-audit':
        return <ShieldAlert className="w-3.5 h-3.5 shrink-0" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Page Title & Engine Mode Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Model Console — Combustion Prediction &amp; Decoding
          </h1>
          <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Ask questions about sensor curves, test &quot;What-If&quot; cabin scenarios, search the ISS Researcher&apos;s Guide, or run a pre-test safety check
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 text-xs font-sans text-zinc-600 dark:text-zinc-300">
            <span
              className={`w-2 h-2 rounded-[2px] ${
                remoteConfigured ? 'bg-[#10B981]' : 'bg-[#F59E0B]'
              }`}
            />
            <span>
              {remoteConfigured
                ? `Connected Server (${apiConfig.baseUrl})`
                : 'Local Fire Physics & Flight Data'}
            </span>
          </div>

          <button
            type="button"
            onClick={onGoToEndpointConfig}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium rounded-lg border cursor-pointer ${inactiveMonochrome}`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>API Config</span>
          </button>
        </div>
      </div>

      {/* Collapsible Active Model Context Strip */}
      <CollapsibleCard
        theme={theme}
        defaultOpen={Boolean(activeChartContext)}
        title="Current Test Settings"
        subtitle={`${virtualConfig.material} · ${virtualConfig.O2_pct.toFixed(1)}% O2 · ${virtualConfig.Flow_ms.toFixed(2)} m/s`}
        summaryLine={`${virtualConfig.material} (${virtualConfig.Thickness_mm.toFixed(1)} mm) · ${virtualConfig.O2_pct.toFixed(1)}% O2 · ${virtualConfig.P_psi.toFixed(1)} psi · ${virtualConfig.Flow_ms.toFixed(2)} m/s · ${totalRunsCount.toLocaleString()} test runs loaded`}
        rightActions={
          <button
            type="button"
            onClick={onResetConsole}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium rounded-lg border cursor-pointer ${inactiveMonochrome}`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear Chat</span>
          </button>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className={`p-3 rounded-[5px] border ${subSurface}`}>
              <div className="text-[11px] font-sans text-zinc-500">
                Test Cabin Settings
              </div>
              <div className="mt-1 font-mono font-semibold tabular-nums">
                {virtualConfig.O2_pct.toFixed(1)}% O2 · {virtualConfig.P_psi.toFixed(1)} psi · {virtualConfig.Flow_ms.toFixed(2)} m/s
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-zinc-500 tabular-nums">
                {virtualConfig.g_eff.toFixed(3)}g · {virtualConfig.Thickness_mm.toFixed(1)} mm{' '}
                <span className="font-sans">{virtualConfig.material}</span>
              </div>
            </div>

            <div className={`p-3 rounded-[5px] border ${subSurface}`}>
              <div className="text-[11px] font-sans text-zinc-500">
                Model Prediction
              </div>
              <div className="mt-1 font-mono font-semibold tabular-nums">
                {simulation.flameSpread_mms.toFixed(2)} ± {simulation.confidenceInterval_mms.toFixed(2)} mm/s
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 font-sans text-[11px]">
                <span
                  className="w-2 h-2 rounded-[2px]"
                  style={{ backgroundColor: regimeColor }}
                />
                <span>{simulation.hazardStatus}</span>
              </div>
            </div>

            <div className={`p-3 rounded-[5px] border ${subSurface}`}>
              <div className="text-[11px] font-sans text-zinc-500">
                Confidence &amp; Physical Testing
              </div>
              <div className="mt-1 font-sans font-semibold">
                <span className="font-mono tabular-nums">
                  {(simulation.modelConfidence?.confidencePct ?? 91.4).toFixed(1)}%
                </span>{' '}
                Confidence
              </div>
              <div className="mt-0.5 font-sans text-[11px] text-zinc-500">
                {simulation.modelConfidence?.validatedRunCount ?? simulation.nearestRuns.length} nearby flight runs · Physical test:{' '}
                <span className="font-semibold text-[#18181B] dark:text-[#FAFAFA]">
                  {simulation.modelConfidence?.physicalTestingRecommendation ?? 'Recommended'}
                </span>
              </div>
            </div>

            <div className={`p-3 rounded-[5px] border ${subSurface}`}>
              <div className="text-[11px] font-sans text-zinc-500">
                Archived Flight Data
              </div>
              <div className="mt-1 font-sans font-semibold">
                <span className="font-mono tabular-nums">{investigationCount}</span> Experiments ·{' '}
                <span className="font-mono tabular-nums">{totalRunsCount.toLocaleString()}</span> Runs
              </div>
              <div className="mt-0.5 font-sans text-[11px] text-zinc-500">
                <span className="font-mono tabular-nums">{literatureChunksCount.toLocaleString()}</span> guide &amp; report sections
              </div>
            </div>
          </div>

          {activeChartContext && (
            <div
              className={`p-3 rounded-[5px] border flex flex-wrap items-start justify-between gap-3 ${subSurface}`}
            >
              <div className="space-y-1">
                <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-[#10B981]">
                  ● Chart Loaded from Visual Analytics Studio
                </div>
                <div className="text-xs font-sans font-medium">
                  {activeChartContext.techniqueName} · {activeChartContext.datasetLabel} ({activeChartContext.runCount.toLocaleString()} points)
                </div>
                <div className="text-[11px] font-sans text-zinc-500">
                  Axes: {activeChartContext.xAxisLabel} vs {activeChartContext.yAxisLabel} (Group: {activeChartContext.colorByLabel})
                </div>
              </div>

              <button
                type="button"
                onClick={onClearChartContext}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans rounded-lg border cursor-pointer ${inactiveMonochrome}`}
              >
                <X className="w-3 h-3" />
                <span>Detach Chart</span>
              </button>
            </div>
          )}
        </div>
      </CollapsibleCard>

      {/* Main Model Console Workspace */}
      <section className={`border rounded-[6px] p-4 sm:p-5 space-y-4 ${cardSurface}`}>
        {/* 4 Operational Mode Tabs */}
        <div className="space-y-2.5">
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
            role="tablist"
            aria-label="Model Console Operational Modes"
          >
            {MODE_DEFINITIONS.map((m) => {
              const active = activeMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onChangeMode(m.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 text-xs font-sans rounded-lg border text-left cursor-pointer ${
                    active ? activeMonochrome : inactiveMonochrome
                  }`}
                >
                  {getModeIcon(m.id)}
                  <span className="truncate">{m.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-sans text-zinc-500 dark:text-zinc-400">
            <span>{activeModeMeta.shortDesc}</span>
          </div>
        </div>

        {/* Mode-Specific Quick Prompt Starters */}
        <div className="flex flex-wrap gap-2">
          {activeModeMeta.starters.map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={isRunningInference}
              onClick={() => onSubmitInference(starter, activeMode)}
              className={`px-3 py-1.5 text-xs font-sans rounded-lg border text-left cursor-pointer disabled:opacity-60 ${inactiveMonochrome}`}
            >
              {starter}
            </button>
          ))}
        </div>

        {/* Elevated Multi-Line Query Composer */}
        <form onSubmit={handleSubmit} className="space-y-2.5 pt-1">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
            <textarea
              ref={inputRef}
              rows={3}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={`Ask in ${activeModeMeta.label} mode (e.g., "What if O2 is 38% at 0.04 m/s?" or "PSI-99")... Press Enter to submit, Shift+Enter for new line`}
              aria-label="Model Console Question Input"
              className={`flex-1 min-h-[72px] px-4 py-3 text-xs sm:text-sm font-sans rounded-xl border outline-none resize-y ${
                isDark
                  ? 'bg-[#09090B] border-[#27272A] text-[#FAFAFA] placeholder:text-zinc-500 focus:border-zinc-500'
                  : 'bg-zinc-50 border-[#E4E4E7] text-[#18181B] placeholder:text-zinc-400 focus:border-zinc-500'
              }`}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isRunningInference}
              className={`inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-sans font-semibold rounded-lg border cursor-pointer disabled:opacity-50 shrink-0 ${activeMonochrome}`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isRunningInference ? 'Running...' : 'Ask Model'}</span>
            </button>
          </div>
        </form>

        {/* Output Stream (blank until first query or running calculation) */}
        {(messages.length > 0 || isRunningInference) && (
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1 pt-3 border-t border-[#E4E4E7] dark:border-[#27272A]">
            {messages.map((msg) => {
            const isUser = msg.role === 'user';
            if (isUser) {
              return (
                <div
                  key={msg.id}
                  className={`p-3.5 rounded-[5px] border ${
                    isDark
                      ? 'bg-[#18181B] border-[#3F3F46]'
                      : 'bg-zinc-100 border-[#D4D4D8]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-sans text-zinc-500 mb-1">
                    <span>YOUR QUESTION · {msg.mode?.toUpperCase() ?? activeMode.toUpperCase()}</span>
                    <span className={/\d/.test(msg.timestamp) ? 'font-mono tabular-nums' : 'font-sans'}>
                      {msg.timestamp}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-sans font-medium">
                    {msg.text}
                  </p>
                </div>
              );
            }

            return (
              <article
                key={msg.id}
                className={`p-4 rounded-[5px] border space-y-3.5 ${subSurface}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E4E4E7] dark:border-[#27272A]">
                  <div className="flex items-center gap-2 text-xs font-display font-semibold">
                    <Terminal className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Model Console Answer</span>
                    {msg.mode && (
                      <span className="inline-flex items-center gap-1.5 font-sans text-[11px] font-normal text-zinc-500">
                        <span className="w-1.5 h-1.5 rounded-[2px] bg-zinc-400 dark:bg-zinc-500" />
                        <span>{msg.mode}</span>
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[11px] text-zinc-500 ${
                      /\d/.test(msg.timestamp) ? 'font-mono tabular-nums' : 'font-sans'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>

                {/* Structured Reasoning Steps */}
                {msg.steps && msg.steps.length > 0 && (
                  <ol className="space-y-2 text-xs sm:text-[13px] font-sans leading-relaxed">
                    {msg.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="font-mono text-[11px] text-zinc-500 mt-0.5 tabular-nums shrink-0">
                          [{i + 1}]
                        </span>
                        <span className="text-zinc-800 dark:text-zinc-200">
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}

                {/* Comparative What-If Sensitivity Table */}
                {msg.whatIfRows && msg.whatIfRows.length > 0 && (
                  <div className="overflow-x-auto border rounded-[5px] border-[#E4E4E7] dark:border-[#27272A]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr
                          className={`border-b font-sans text-[11px] font-semibold text-zinc-500 ${
                            isDark
                              ? 'bg-[#121215] border-[#27272A]'
                              : 'bg-zinc-50 border-[#E4E4E7]'
                          }`}
                        >
                          <th className="py-2 px-3">Scenario</th>
                          <th className="py-2 px-3">Material</th>
                          <th className="py-2 px-3 text-right">O2 %</th>
                          <th className="py-2 px-3 text-right">Flow</th>
                          <th className="py-2 px-3 text-right">Thick</th>
                          <th className="py-2 px-3 text-right">Spread</th>
                          <th className="py-2 px-3 text-right">Safe Min</th>
                          <th className="py-2 px-3">Regime</th>
                          <th className="py-2 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E4E4E7] dark:divide-[#27272A]">
                        {msg.whatIfRows.map((row) => {
                          const rowColor =
                            row.outcome === 'Rapid Flame Spread'
                              ? 'text-[#EF4444]'
                              : row.outcome === 'Cool Flame Caution'
                              ? 'text-[#F59E0B]'
                              : 'text-[#10B981]';
                          const rowKey = `${msg.id}-${row.id}`;
                          return (
                            <tr
                              key={row.id}
                              className="hover:bg-zinc-50/70 dark:hover:bg-white/[0.02]"
                            >
                              <td className="py-2 px-3 font-sans font-medium whitespace-nowrap">
                                {row.label}
                              </td>
                              <td className="py-2 px-3 font-sans whitespace-nowrap">
                                {row.material}
                              </td>
                              <td className="py-2 px-3 font-mono text-right tabular-nums whitespace-nowrap">
                                {row.O2_pct.toFixed(1)}%
                              </td>
                              <td className="py-2 px-3 font-mono text-right tabular-nums whitespace-nowrap">
                                {row.Flow_ms.toFixed(2)} m/s
                              </td>
                              <td className="py-2 px-3 font-mono text-right tabular-nums whitespace-nowrap">
                                {row.Thickness_mm.toFixed(1)} mm
                              </td>
                              <td className="py-2 px-3 font-mono text-right font-semibold tabular-nums whitespace-nowrap">
                                {row.flameSpread_mms.toFixed(2)} mm/s
                              </td>
                              <td className="py-2 px-3 font-mono text-right tabular-nums whitespace-nowrap">
                                {row.minSafeThickness_mm.toFixed(1)} mm
                              </td>
                              <td
                                className={`py-2 px-3 font-sans font-semibold whitespace-nowrap ${rowColor}`}
                              >
                                ● {row.outcome}
                              </td>
                              <td className="py-2 px-3 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleApplyParams(
                                      {
                                        O2_pct: row.O2_pct,
                                        P_psi: row.P_psi,
                                        Flow_ms: row.Flow_ms,
                                        g_eff: row.g_eff,
                                        Thickness_mm: row.Thickness_mm,
                                        material: row.material,
                                        ignitionFlux_Wm2: row.ignitionFlux_Wm2,
                                      },
                                      rowKey
                                    )
                                  }
                                  className={`px-2.5 py-1 text-[11px] font-sans font-medium rounded-lg border cursor-pointer ${inactiveMonochrome}`}
                                >
                                  {appliedMsgId === rowKey ? 'Loaded' : 'Load'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Action Footer: Clickable PSI Investigation Citations + Apply Parameters Button */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E4E4E7] dark:border-[#27272A]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-sans text-zinc-500 mr-1">
                      Archive Citations:
                    </span>
                    {(msg.citations ?? []).map((citeId) => (
                      <button
                        key={citeId}
                        type="button"
                        onClick={() => onOpenInvestigation(citeId)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans font-medium rounded-lg border cursor-pointer ${inactiveMonochrome}`}
                        title={`Open ${citeId} Investigation Details`}
                      >
                        <span>{citeId}</span>
                        <ArrowUpRight className="w-3 h-3 opacity-70" />
                      </button>
                    ))}
                  </div>

                  {msg.recommendedParams && (
                    <button
                      type="button"
                      onClick={() =>
                        handleApplyParams(msg.recommendedParams!, msg.id)
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-semibold rounded-lg border cursor-pointer ${activeMonochrome}`}
                    >
                      {appliedMsgId === msg.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Parameters Applied to Virtual Test Lab</span>
                        </>
                      ) : (
                        <>
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Apply Parameters to Virtual Test Lab</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          {isRunningInference && (
            <div
              className={`p-3.5 rounded-[5px] border text-xs font-sans text-zinc-500 ${subSurface}`}
            >
              Running combustion model calculation...
            </div>
          )}
          </div>
        )}
      </section>
    </div>
  );
};
