import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, BarChart3 } from 'lucide-react';
import {
  ChatInlineChartPayload,
  PsiRun,
  SimulationResponse,
  ThemeMode,
  VirtualTestConfig,
  VizMode,
} from '../types/psi';
import { reconstructRunsForInlineChart } from '../utils/chatVisualizations';
import { AxisVariableKey, CategoricalGroupKey, NumericAxisKey } from '../utils/vizRegistry';
import { VizTechniqueRenderer } from './VizTechniqueRenderer';

interface ChatInlineChartCardProps {
  theme: ThemeMode;
  inlineChart: ChatInlineChartPayload;
  sliders: VirtualTestConfig;
  simulation: SimulationResponse;
  selectedRuns: PsiRun[];
  catalogRuns: PsiRun[];
  onInspectRun: (runId: string) => void;
  onChangeSlider: (
    key: 'O2_pct' | 'P_psi' | 'Flow_ms' | 'g_eff' | 'Thickness_mm',
    value: number
  ) => void;
  onOpenInVisualStudio: (vizMode: VizMode) => void;
  onRetryWithChartMode: (vizMode: VizMode) => void;
}

export const ChatInlineChartCard: React.FC<ChatInlineChartCardProps> = ({
  theme,
  inlineChart,
  sliders,
  simulation,
  selectedRuns,
  catalogRuns,
  onInspectRun,
  onChangeSlider,
  onOpenInVisualStudio,
  onRetryWithChartMode,
}) => {
  const [hoveredRunId, setHoveredRunId] = useState<string | null>(null);
  const [hoveredMaterialId, setHoveredMaterialId] = useState<string | null>(null);

  const isDark = theme === 'dark';

  const cardSurface = isDark
    ? 'bg-[#09090B]/90 border-[#27272A] text-[#FAFAFA]'
    : 'bg-white border-[#E4E4E7] text-[#18181B]';

  const chipButton = isDark
    ? 'bg-[#18181B] border-[#3F3F46] text-zinc-200 hover:bg-zinc-800 hover:border-zinc-500'
    : 'bg-zinc-50 border-[#D4D4D8] text-zinc-800 hover:bg-zinc-100 hover:border-zinc-400';

  const activeRuns = useMemo(
    () =>
      reconstructRunsForInlineChart(
        inlineChart,
        selectedRuns,
        catalogRuns,
        simulation
      ),
    [inlineChart, selectedRuns, catalogRuns, simulation]
  );

  // Unavailable / incompatible state with clickable compatible chart chips
  if (inlineChart.status === 'incompatible') {
    return (
      <div className={`p-3.5 rounded-md border border-dashed space-y-2.5 ${cardSurface}`}>
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="text-xs font-sans font-semibold text-[#F59E0B]">
              {inlineChart.techniqueName ?? 'Selected Chart'} is unavailable for this question
            </div>
            <p className="text-xs font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {inlineChart.incompatibilityReason}
            </p>
          </div>
        </div>

        {inlineChart.compatibleAlternatives &&
          inlineChart.compatibleAlternatives.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-sans font-medium text-zinc-500">
                Try a compatible chart with one click:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {inlineChart.compatibleAlternatives.map((alt) => (
                  <button
                    key={alt.vizMode}
                    type="button"
                    onClick={() => onRetryWithChartMode(alt.vizMode)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-sans font-medium rounded-md border transition-colors cursor-pointer ${chipButton}`}
                  >
                    <BarChart3 className="w-3 h-3 text-[#10B981]" />
                    <span>{alt.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
      </div>
    );
  }

  if (!inlineChart.resolvedVizMode) return null;

  return (
    <div className={`rounded-md border p-3.5 space-y-3 ${cardSurface}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E4E4E7] dark:border-[#27272A]">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-display font-semibold">
            <BarChart3 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span>{inlineChart.techniqueName}</span>
            <span className="text-[11px] font-sans font-normal text-zinc-500">
              · {inlineChart.datasetLabel} (
              <span className="font-mono tabular-nums">
                {activeRuns.length.toLocaleString()}
              </span>{' '}
              runs)
            </span>
          </div>
          {inlineChart.headline && (
            <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 leading-snug">
              {inlineChart.headline}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenInVisualStudio(inlineChart.resolvedVizMode!)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-sans font-semibold rounded-md border shrink-0 transition-colors cursor-pointer ${chipButton}`}
        >
          <span>Open in Visual Analytics Studio</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="w-full overflow-x-auto">
        <VizTechniqueRenderer
          theme={theme}
          vizMode={inlineChart.resolvedVizMode}
          sliders={sliders}
          simulation={simulation}
          activeRuns={activeRuns}
          xAxisKey={inlineChart.xAxisKey as AxisVariableKey | undefined}
          yAxisKey={inlineChart.yAxisKey as NumericAxisKey | undefined}
          colorByKey={inlineChart.colorByKey as CategoricalGroupKey | undefined}
          hoveredRunId={hoveredRunId}
          onHoverRun={setHoveredRunId}
          hoveredMaterialId={hoveredMaterialId}
          onHoverMaterial={setHoveredMaterialId}
          onInspectRun={onInspectRun}
          onChangeSlider={onChangeSlider}
        />
      </div>
    </div>
  );
};
