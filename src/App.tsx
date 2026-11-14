import React, { useEffect, useMemo, useState } from 'react';
import {
  AssistantMessage,
  EnvironmentPreset,
  EnvironmentPresetId,
  PsiRun,
  SimulationResponse,
  SyncChangelogEntry,
  ThemeMode,
  VizMode,
  WorkspaceView,
} from './types/psi';
import {
  BASELINE_PSI_RUNS,
  ENVIRONMENT_PRESETS,
  INITIAL_SYNC_CHANGELOG,
  SIMULATED_NEW_SYNC_ENTRY,
} from './data/baselineRuns';
import { runLocalPhysicsSimulation } from './utils/physicsEngine';
import { analyzeCombustionState } from './services/psiApi';
import { HeaderBar } from './components/HeaderBar';
import { LeftSidebar } from './components/LeftSidebar';
import { VisualizationStage } from './components/VisualizationStage';
import { CatalogView } from './components/CatalogView';
import { RunComparator } from './components/RunComparator';
import { ImportSyncView } from './components/ImportSyncView';
import { RightAssistantPanel } from './components/RightAssistantPanel';
import { RunInspectorDrawer } from './components/RunInspectorDrawer';

export default function App() {
  // 1. Theme State ('normal' default #F3F4F6, 'light' #FFFFFF, 'dark' #09090B)
  const [theme, setTheme] = useState<ThemeMode>('normal');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // 2. Active Workspace View ('overview' default)
  const [activeView, setActiveView] = useState<WorkspaceView>('overview');

  // 3. Catalog & Selected Runs (19 baseline PSI investigations, 1,645 runs)
  const [catalogRuns, setCatalogRuns] = useState<PsiRun[]>(BASELINE_PSI_RUNS);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([
    'psi-99',
    'psi-25',
    'psi-69',
  ]);
  const [highlightedRunId, setHighlightedRunId] = useState<string | null>(null);

  // 4. Shared Brushing & Linking + Inspector Drawer State
  const [hoveredRunId, setHoveredRunId] = useState<string | null>(null);
  const [hoveredMaterialId, setHoveredMaterialId] = useState<string | null>(
    null
  );
  const [inspectedRunId, setInspectedRunId] = useState<string | null>(null);

  // 5. Environment Sliders (default Lunar 0.166g baseline)
  const [activePresetId, setActivePresetId] =
    useState<EnvironmentPresetId | null>('lunar');
  const [sliders, setSliders] = useState({
    O2_pct: 34.0,
    P_psi: 8.2,
    Flow_ms: 0.12,
    g_eff: 0.166,
    Thickness_mm: 2.0,
  });

  // 6. Visualization Mode
  const [vizMode, setVizMode] = useState<VizMode>('safety-map');

  // 7. Slide-Over AI Assistant Drawer & Sync Feed State
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [syncEntries, setSyncEntries] = useState<SyncChangelogEntry[]>(
    INITIAL_SYNC_CHANGELOG
  );
  const [hasSimulatedNewSync, setHasSimulatedNewSync] = useState(false);
  const [hasUnreadSync, setHasUnreadSync] = useState(true);
  const [investigationCount, setInvestigationCount] = useState(
    BASELINE_PSI_RUNS.length
  );
  const [totalRunsCount, setTotalRunsCount] = useState(1645);

  // Support ⌘K / Ctrl+K shortcut for AI Research Assistant
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsAssistantOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 8. Simulation & Assistant Messages
  const initialSim = useMemo(
    () => runLocalPhysicsSimulation(sliders, catalogRuns),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [simulation, setSimulation] = useState<SimulationResponse>(initialSim);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>(() => {
    const initReply = runLocalPhysicsSimulation(
      {
        ...sliders,
        question: 'Explain current lunar cabin risk step-by-step',
      },
      BASELINE_PSI_RUNS
    ).assistantReply;

    return [
      {
        id: 'msg-init',
        role: 'assistant',
        timestamp: 'Ready',
        steps: initReply?.steps ?? [],
        citations: initReply?.citations ?? ['PSI-99', 'PSI-25', 'PSI-69'],
      },
    ];
  });

  // Recalculate simulation whenever sliders or catalog change
  useEffect(() => {
    let cancelled = false;
    analyzeCombustionState(sliders, catalogRuns).then((res) => {
      if (!cancelled) {
        setSimulation(res);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sliders, catalogRuns]);

  const selectedRuns = useMemo(
    () =>
      selectedRunIds
        .map((id) => catalogRuns.find((r) => r.id === id))
        .filter((r): r is PsiRun => Boolean(r)),
    [selectedRunIds, catalogRuns]
  );

  const inspectedRun = useMemo(() => {
    if (!inspectedRunId) return null;
    return (
      catalogRuns.find(
        (r) =>
          r.id === inspectedRunId ||
          r.psiId.toLowerCase().includes(inspectedRunId.toLowerCase())
      ) ?? null
    );
  }, [inspectedRunId, catalogRuns]);

  // Handlers
  const handleSelectPreset = (preset: EnvironmentPreset) => {
    setActivePresetId(preset.id);
    setSliders({
      O2_pct: preset.O2_pct,
      P_psi: preset.P_psi,
      Flow_ms: preset.Flow_ms,
      g_eff: preset.g_eff,
      Thickness_mm: preset.Thickness_mm,
    });
  };

  const handleChangeSlider = (
    key: 'O2_pct' | 'P_psi' | 'Flow_ms' | 'g_eff' | 'Thickness_mm',
    value: number
  ) => {
    setActivePresetId(null);
    setSliders((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleResetSliders = () => {
    const lunarPreset = ENVIRONMENT_PRESETS.find((p) => p.id === 'lunar')!;
    handleSelectPreset(lunarPreset);
  };

  const handleToggleRun = (runId: string) => {
    setSelectedRunIds((prev) => {
      if (prev.includes(runId)) {
        return prev.filter((id) => id !== runId);
      }
      if (prev.length >= 4) {
        return [...prev.slice(1), runId];
      }
      return [...prev, runId];
    });
  };

  const handleLoadDefaultComparisonSet = () => {
    setSelectedRunIds(['psi-99', 'psi-25', 'psi-69', 'psi-159']);
  };

  const handleApplyRunToSliders = (run: PsiRun) => {
    setActivePresetId(null);
    setSliders({
      O2_pct: run.O2_pct,
      P_psi: run.P_psi,
      Flow_ms: run.Flow_ms,
      g_eff: run.g_eff,
      Thickness_mm: run.Thickness_mm,
    });
    setHighlightedRunId(run.id);
    setActiveView('overview');
  };

  const handleOpenInspector = (psiIdOrRunId: string) => {
    const matched = catalogRuns.find(
      (r) =>
        r.id === psiIdOrRunId ||
        r.psiId.toLowerCase().includes(psiIdOrRunId.toLowerCase())
    );
    if (matched) {
      setInspectedRunId(matched.id);
      setHighlightedRunId(matched.id);
    }
  };

  const handleQuickJumpRun = (run: PsiRun) => {
    setHighlightedRunId(run.id);
    setInspectedRunId(run.id);
  };

  const handleUpdateSlidersFromMap = (O2_pct: number, Flow_ms: number) => {
    setActivePresetId(null);
    setSliders((prev) => ({
      ...prev,
      O2_pct,
      Flow_ms,
    }));
  };

  const handleExportBrief = () => {
    const reportLines = [
      `# PSI Data Manager — Microgravity Combustion Engineering Brief`,
      `Generated: ${new Date().toISOString()}`,
      ``,
      `## 1. Active Cabin Environment Parameters`,
      `- Oxygen Concentration: ${sliders.O2_pct.toFixed(1)}% O2`,
      `- Cabin Pressure: ${sliders.P_psi.toFixed(1)} psi`,
      `- Forced Airflow Velocity: ${sliders.Flow_ms.toFixed(2)} m/s`,
      `- Effective Gravity: ${sliders.g_eff.toFixed(3)}g`,
      `- Substrate Thickness: ${sliders.Thickness_mm.toFixed(1)} mm`,
      ``,
      `## 2. Computed Fire Safety Telemetry`,
      `- Predicted Flame Spread Speed: ${simulation.flameSpread_mms.toFixed(2)} ± ${simulation.confidenceInterval_mms.toFixed(2)} mm/s (95% CI)`,
      `- Hazard Status: ${simulation.hazardStatus} (Peak Temp: ${simulation.peakTemp_K} K)`,
      `- 10s Growth Forecast: ${simulation.forecast10s.radius_mm.toFixed(1)} mm radius (+${simulation.forecast10s.pressureRise_kPa.toFixed(2)} kPa)`,
      `- Minimum Safe Thickness: >= ${simulation.safeMaterialCheck.minSafeThickness_mm.toFixed(1)} mm (${simulation.safeMaterialCheck.passed ? 'PASS' : 'FAIL'})`,
      ``,
      `## 3. Selected PSI Archive Reference Runs`,
      ...selectedRuns.map(
        (r) =>
          `- ${r.psiId} (${r.material}, ${r.facility}): ${r.O2_pct.toFixed(1)}% O2, ${r.P_psi.toFixed(1)} psi, ${r.Flow_ms.toFixed(2)} m/s -> Spread ${r.flameSpread_mms.toFixed(2)} mm/s [${r.outcome}]`
      ),
    ];

    const blob = new Blob([reportLines.join('\n')], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `psi-combustion-brief-${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSendPrompt = async (promptText: string) => {
    const userMsg: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      timestamp: 'Now',
      text: promptText,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    const response = await analyzeCombustionState(
      {
        ...sliders,
        question: promptText,
        selectedRunIds,
      },
      catalogRuns
    );
    setIsThinking(false);

    if (response.assistantReply) {
      if (response.assistantReply.suggestedVizMode) {
        setVizMode(response.assistantReply.suggestedVizMode);
        setActiveView('overview');
      }
      const assistantMsg: AssistantMessage = {
        id: `ast-${Date.now()}`,
        role: 'assistant',
        timestamp: 'Synced',
        steps: response.assistantReply.steps,
        citations: response.assistantReply.citations,
        suggestedVizMode: response.assistantReply.suggestedVizMode,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    }
  };

  const handleImportSuccess = (newRuns: PsiRun[]) => {
    setCatalogRuns((prev) => [...newRuns, ...prev]);
    setTotalRunsCount((prev) => prev + newRuns.length);
    const newIds = newRuns.map((r) => r.id).slice(0, 2);
    setSelectedRunIds((prev) => [...newIds, ...prev].slice(0, 4));
    if (newRuns[0]) {
      setHighlightedRunId(newRuns[0].id);
    }
  };

  const handleSimulateNewSync = () => {
    if (hasSimulatedNewSync) return;
    setHasSimulatedNewSync(true);
    setHasUnreadSync(false);
    setSyncEntries((prev) => [SIMULATED_NEW_SYNC_ENTRY, ...prev]);
    setInvestigationCount((prev) => prev + 1);
    setTotalRunsCount((prev) => prev + SIMULATED_NEW_SYNC_ENTRY.runsAdded);
    if (SIMULATED_NEW_SYNC_ENTRY.sampleRun) {
      const sample = SIMULATED_NEW_SYNC_ENTRY.sampleRun;
      setCatalogRuns((prev) => [sample, ...prev]);
      setSelectedRunIds((prev) => [sample.id, ...prev.slice(0, 3)]);
      setHighlightedRunId(sample.id);
    }
  };

  const canvasClass =
    theme === 'dark'
      ? 'bg-[#09090B] text-[#FAFAFA]'
      : theme === 'light'
      ? 'bg-[#FFFFFF] text-[#09090B]'
      : 'bg-[#F3F4F6] text-[#18181B]';

  return (
    <div
      className={`min-h-screen flex flex-col lg:flex-row transition-colors duration-150 ${canvasClass}`}
    >
      {/* Left Navigation Rail (232px Fixed Width) */}
      <LeftSidebar
        theme={theme}
        activeView={activeView}
        onSelectView={(view) => {
          setActiveView(view);
          if (view === 'import-sync') {
            setHasUnreadSync(false);
          }
        }}
        selectedRunsCount={selectedRuns.length}
        investigationCount={investigationCount}
        totalRunsCount={totalRunsCount}
        hasUnreadSync={hasUnreadSync}
        runs={catalogRuns}
        onQuickJumpRun={handleQuickJumpRun}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <HeaderBar
          theme={theme}
          onThemeChange={setTheme}
          activeView={activeView}
          isAssistantOpen={isAssistantOpen}
          onToggleAssistant={() => setIsAssistantOpen((prev) => !prev)}
          onExportBrief={handleExportBrief}
        />

        <main className="flex-1 px-5 pb-5 pt-0 max-w-[1640px] w-full">
          {activeView === 'overview' && (
            <VisualizationStage
              theme={theme}
              vizMode={vizMode}
              onChangeVizMode={setVizMode}
              activePresetId={activePresetId}
              onSelectPreset={handleSelectPreset}
              sliders={sliders}
              onChangeSlider={handleChangeSlider}
              onResetSliders={handleResetSliders}
              onUpdateSlidersFromMap={handleUpdateSlidersFromMap}
              simulation={simulation}
              selectedRuns={selectedRuns}
              hoveredRunId={hoveredRunId}
              onHoverRun={setHoveredRunId}
              hoveredMaterialId={hoveredMaterialId}
              onHoverMaterial={setHoveredMaterialId}
              onInspectRun={handleOpenInspector}
            />
          )}

          {activeView === 'catalog' && (
            <CatalogView
              theme={theme}
              runs={catalogRuns}
              selectedRunIds={selectedRunIds}
              highlightedRunId={highlightedRunId}
              onToggleRun={handleToggleRun}
              onApplyRunToSliders={handleApplyRunToSliders}
              onInspectRun={handleOpenInspector}
              onGoToComparator={() => setActiveView('comparator')}
            />
          )}

          {activeView === 'comparator' && (
            <RunComparator
              theme={theme}
              selectedRuns={selectedRuns}
              hoveredRunId={hoveredRunId}
              onHoverRun={setHoveredRunId}
              onInspectRun={handleOpenInspector}
              onRemoveRun={handleToggleRun}
              onApplyRunToSliders={handleApplyRunToSliders}
              onLoadDefaultComparisonSet={handleLoadDefaultComparisonSet}
              onGoToCatalog={() => setActiveView('catalog')}
            />
          )}

          {activeView === 'import-sync' && (
            <ImportSyncView
              theme={theme}
              onImportSuccess={handleImportSuccess}
              syncEntries={syncEntries}
              hasSimulatedNewSync={hasSimulatedNewSync}
              onSimulateNewSync={handleSimulateNewSync}
              onSelectRunFromSync={(psiId) => {
                handleOpenInspector(psiId);
              }}
            />
          )}
        </main>
      </div>

      {/* Clickable Run Detail Inspector Slide-Over Drawer */}
      <RunInspectorDrawer
        run={inspectedRun}
        onClose={() => setInspectedRunId(null)}
        theme={theme}
        isSelectedForComparison={
          inspectedRun ? selectedRunIds.includes(inspectedRun.id) : false
        }
        onToggleComparison={handleToggleRun}
        onLoadIntoSimulator={handleApplyRunToSliders}
      />

      {/* Slide-Over AI Research Assistant Drawer (380px width) */}
      <RightAssistantPanel
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        theme={theme}
        simulation={simulation}
        messages={messages}
        isThinking={isThinking}
        onSendPrompt={handleSendPrompt}
        onCitationClick={(cite) => {
          setIsAssistantOpen(false);
          handleOpenInspector(cite);
        }}
        onSwitchVizMode={(mode) => {
          setVizMode(mode);
          setActiveView('overview');
          setIsAssistantOpen(false);
        }}
      />
    </div>
  );
}
