import React, { useEffect, useMemo, useState } from 'react';
import {
  AssistantMessage,
  CandidateMaterialCode,
  ConsoleMode,
  DataManifestFileRecord,
  DecodedChartContext,
  EnvironmentPreset,
  EnvironmentPresetId,
  LiteratureChunk,
  LiteratureCorpusStats,
  PsiInvestigationRecord,
  PsiRun,
  ResearchersGuideTopic,
  SessionIngestionEvent,
  SidebarState,
  SimulationResponse,
  ThemeMode,
  VirtualTestConfig,
  VizMode,
  WorkspaceView,
} from './types/psi';
import { ENVIRONMENT_PRESETS } from './data/environmentPresets';
import { MISSION_AND_SPINOFF_CASES } from './data/missionAndSpinoffCases';
import {
  formatUtcTimestamp,
  loadPsiArchiveData,
} from './services/dataLoader';
import { runLocalPhysicsSimulation } from './utils/physicsEngine';
import {
  analyzeCombustionState,
  runModelConsoleInference,
} from './services/psiApi';
import { getCanonicalPsiId } from './utils/investigationArtifacts';
import { HeaderBar } from './components/HeaderBar';
import { LeftSidebar } from './components/LeftSidebar';
import { VirtualTestLab } from './components/VirtualTestLab';
import { VisualAnalyticsStudio } from './components/VisualAnalyticsStudio';
import { ModelConsoleView } from './components/ModelConsoleView';
import { CatalogView } from './components/CatalogView';
import { ExperimentRunsView } from './components/ExperimentRunsView';
import { RunComparator } from './components/RunComparator';
import { ImportSyncView } from './components/ImportSyncView';
import { PsiInvestigationDetailView } from './components/PsiInvestigationDetailView';

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

  // 2. Active Workspace View & Collapsible Sidebar State
  const [activeView, setActiveView] = useState<WorkspaceView>('virtual-lab');
  const [previousView, setPreviousView] =
    useState<WorkspaceView>('investigations');
  const [sidebarState, setSidebarState] = useState<SidebarState>('expanded');

  // 3. Catalog, Real Loaded Archive & Selected Runs
  const [catalogRuns, setCatalogRuns] = useState<PsiRun[]>([]);
  const [investigations, setInvestigations] = useState<
    PsiInvestigationRecord[]
  >([]);
  const [guideTopics, setGuideTopics] = useState<ResearchersGuideTopic[]>([]);
  const [literatureChunks, setLiteratureChunks] = useState<LiteratureChunk[]>(
    []
  );
  const [corpusStats, setCorpusStats] =
    useState<LiteratureCorpusStats | null>(null);
  const [isArchiveLoading, setIsArchiveLoading] = useState<boolean>(true);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([
    'psi-99',
    'psi-25',
    'psi-69',
  ]);
  const [highlightedRunId, setHighlightedRunId] = useState<string | null>(null);

  // 4. Shared Brushing & Linking + Full-Page Investigation Detail State
  const [hoveredRunId, setHoveredRunId] = useState<string | null>(null);
  const [hoveredMaterialId, setHoveredMaterialId] = useState<string | null>(
    null
  );
  const [inspectedRunId, setInspectedRunId] = useState<string | null>(null);

  // 5. Virtual Test Chamber Configuration (default Lunar 0.166g baseline)
  const [activePresetId, setActivePresetId] =
    useState<EnvironmentPresetId | null>('lunar');
  const [sliders, setSliders] = useState<VirtualTestConfig>({
    O2_pct: 34.0,
    P_psi: 8.2,
    Flow_ms: 0.12,
    g_eff: 0.166,
    Thickness_mm: 2.0,
    material: 'PMMA',
    ignitionFlux_Wm2: 25000,
  });
  const [isRunningVirtualTest, setIsRunningVirtualTest] = useState(false);
  const [virtualRunCounter, setVirtualRunCounter] = useState(1);
  const [lastVirtualRunId, setLastVirtualRunId] = useState<string | null>('VTL-001');
  const [lastVirtualRunTimestamp, setLastVirtualRunTimestamp] =
    useState<string | null>('Ready');

  // 6. Visualization Mode
  const [vizMode, setVizMode] = useState<VizMode>('safety-map');

  // 7. Live Public Archive Manifest & Session Ingestion Status
  const [manifestFiles, setManifestFiles] = useState<DataManifestFileRecord[]>(
    []
  );
  const [sessionEvents, setSessionEvents] = useState<SessionIngestionEvent[]>(
    []
  );
  const [customUploadsCount, setCustomUploadsCount] = useState(0);
  const [investigationCount, setInvestigationCount] = useState(0);
  const [totalRunsCount, setTotalRunsCount] = useState(0);

  // Load real sanitized PSI investigations, CSV runs, and ISS Researcher's Guide chunks at runtime
  useEffect(() => {
    let active = true;
    loadPsiArchiveData()
      .then((loaded) => {
        if (!active) return;
        setCatalogRuns((prev) => {
          const customRuns = prev.filter((r) => r.isCustom || r.isVirtual);
          return [...customRuns, ...loaded.runs];
        });
        setTotalRunsCount(loaded.runs.length);
        setInvestigations(loaded.investigations);
        setInvestigationCount(loaded.investigations.length);
        setGuideTopics(loaded.researchersGuideTopics);
        setLiteratureChunks(loaded.literatureChunks);
        setCorpusStats(loaded.corpusStats);
        setManifestFiles(loaded.manifestFiles);

        const loadedAtUtc =
          loaded.manifestFiles[0]?.loadedAtUtc ?? formatUtcTimestamp(new Date());
        setSessionEvents((prev) => {
          const customEvents = prev.filter((e) => e.eventType === 'custom-upload');
          return [
            ...customEvents,
            {
              id: 'evt-archive-load',
              sourceName: 'public/data/nasa-space-apps/',
              eventType: 'archive-load',
              timestampUtc: loadedAtUtc,
              runsIndexed: loaded.runs.length,
              summary: `Indexed ${loaded.investigations.length} PSI investigations, ${loaded.totalCsvRuns.toLocaleString()} calibrated CSV telemetry rows (${loaded.runs.length.toLocaleString()} total runs), and ${loaded.literatureChunks.length.toLocaleString()} literature chunks across ${loaded.manifestFiles.length} archive files.`,
              targetView: 'experiment-runs',
            },
          ];
        });

        setMessages((prev) => {
          if (prev.length !== 1 || prev[0]?.id !== 'msg-init') return prev;
          const refreshed = runLocalPhysicsSimulation(
            {
              ...sliders,
              consoleMode: 'decoder',
              question:
                'Decode active Lunar 0.166g Virtual Chamber telemetry step-by-step',
            },
            loaded.runs,
            {
              literatureChunks: loaded.literatureChunks,
              investigations: loaded.investigations,
              missionCases: MISSION_AND_SPINOFF_CASES,
            }
          ).assistantReply;

          if (!refreshed) return prev;
          return [
            {
              ...prev[0],
              steps: refreshed.steps,
              citations: refreshed.citations,
              recommendedParams: refreshed.recommendedParams,
              whatIfRows: refreshed.whatIfRows,
            },
          ];
        });
      })
      .catch((err) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'Unable to fetch archive assets.';
        console.warn('PSI runtime archive fetch error:', err);
        setSessionEvents((prev) => [
          {
            id: `evt-archive-err-${Date.now()}`,
            sourceName: 'public/data/nasa-space-apps/',
            eventType: 'archive-error',
            timestampUtc: formatUtcTimestamp(new Date()),
            runsIndexed: 0,
            summary: msg,
          },
          ...prev,
        ]);
      })
      .finally(() => {
        if (active) setIsArchiveLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Support [ keyboard shortcut to cycle sidebar (Expanded -> Compact -> Hidden -> Expanded)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (!isInput && e.key === '[') {
        e.preventDefault();
        setSidebarState((prev) =>
          prev === 'expanded'
            ? 'compact'
            : prev === 'compact'
            ? 'hidden'
            : 'expanded'
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 8. Simulation & Model Console State
  const initialSim = useMemo(
    () => runLocalPhysicsSimulation(sliders, catalogRuns),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [simulation, setSimulation] = useState<SimulationResponse>(initialSim);
  const [isThinking, setIsThinking] = useState(false);
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>('decoder');
  const [activeChartContext, setActiveChartContext] =
    useState<DecodedChartContext | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>(() => {
    const initReply = runLocalPhysicsSimulation(
      {
        ...sliders,
        consoleMode: 'decoder',
        question: 'Decode active Lunar 0.166g Virtual Chamber telemetry step-by-step',
      },
      []
    ).assistantReply;

    return [
      {
        id: 'msg-init',
        role: 'assistant',
        timestamp: 'Ready',
        mode: 'decoder',
        steps: initReply?.steps ?? [],
        citations: initReply?.citations ?? ['PSI-99', 'PSI-25', 'PSI-69'],
        recommendedParams: initReply?.recommendedParams,
        whatIfRows: initReply?.whatIfRows,
      },
    ];
  });

  const archiveContext = useMemo(
    () => ({
      literatureChunks,
      investigations,
      missionCases: MISSION_AND_SPINOFF_CASES,
    }),
    [literatureChunks, investigations]
  );

  // Recalculate simulation whenever sliders, catalog, or archive change
  useEffect(() => {
    let cancelled = false;
    analyzeCombustionState(sliders, catalogRuns, archiveContext).then((res) => {
      if (!cancelled) {
        setSimulation(res);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sliders, catalogRuns, archiveContext]);

  const selectedRuns = useMemo(
    () =>
      selectedRunIds
        .map((id) => catalogRuns.find((r) => r.id === id))
        .filter((r): r is PsiRun => Boolean(r)),
    [selectedRunIds, catalogRuns]
  );

  const inspectedRun = useMemo(() => {
    if (!inspectedRunId) return null;
    const q = inspectedRunId.toLowerCase();
    return (
      catalogRuns.find((r) => r.id.toLowerCase() === q) ??
      catalogRuns.find((r) => r.psiId.toLowerCase() === q) ??
      catalogRuns.find((r) => r.psiId.toLowerCase().startsWith(q)) ??
      catalogRuns.find((r) => r.psiId.toLowerCase().includes(q)) ??
      null
    );
  }, [inspectedRunId, catalogRuns]);

  const inspectedInvestigationRecord = useMemo(() => {
    if (!inspectedRun) return null;
    const cid = getCanonicalPsiId(inspectedRun);
    const normalizedId =
      cid === 'PSI-22' ? 'PSI-20' : cid === 'PSI-101' ? 'PSI-102' : cid;
    return (
      investigations.find((inv) => inv.psiId.toUpperCase() === normalizedId) ??
      null
    );
  }, [inspectedRun, investigations]);

  const mapMaterialToCandidate = (raw?: string): CandidateMaterialCode => {
    const m = (raw ?? '').toLowerCase();
    if (m.includes('nomex')) return 'Nomex';
    if (m.includes('ptfe') || m.includes('teflon')) return 'PTFE';
    if (m.includes('cotton') || m.includes('cfg')) return 'Cotton-Fiberglass';
    if (m.includes('sibal')) return 'SIBAL';
    return 'PMMA';
  };

  // Handlers
  const handleSelectPreset = (preset: EnvironmentPreset) => {
    setActivePresetId(preset.id);
    setSliders((prev) => ({
      ...prev,
      O2_pct: preset.O2_pct,
      P_psi: preset.P_psi,
      Flow_ms: preset.Flow_ms,
      g_eff: preset.g_eff,
      Thickness_mm: preset.Thickness_mm,
    }));
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

  const handleChangeVirtualConfig = <K extends keyof VirtualTestConfig>(
    key: K,
    value: VirtualTestConfig[K]
  ) => {
    setActivePresetId(null);
    setSliders((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleResetSliders = () => {
    const lunarPreset = ENVIRONMENT_PRESETS.find((p) => p.id === 'lunar')!;
    setActivePresetId(lunarPreset.id);
    setSliders({
      O2_pct: lunarPreset.O2_pct,
      P_psi: lunarPreset.P_psi,
      Flow_ms: lunarPreset.Flow_ms,
      g_eff: lunarPreset.g_eff,
      Thickness_mm: lunarPreset.Thickness_mm,
      material: 'PMMA',
      ignitionFlux_Wm2: 25000,
    });
  };

  const handleRunVirtualTest = async () => {
    setIsRunningVirtualTest(true);
    try {
      const result = await analyzeCombustionState(
        sliders,
        catalogRuns,
        archiveContext
      );
      setSimulation(result);
      const nextNum = virtualRunCounter + 1;
      setVirtualRunCounter(nextNum);
      setLastVirtualRunId(`VTL-${String(nextNum).padStart(3, '0')}`);
      setLastVirtualRunTimestamp(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } finally {
      setIsRunningVirtualTest(false);
    }
  };

  const handleAddVirtualRunToComparator = () => {
    const numStr = String(virtualRunCounter).padStart(3, '0');
    const virtualCode = lastVirtualRunId ?? `VTL-${numStr}`;
    const virtualId = `virtual-${virtualCode.toLowerCase()}-${Date.now()}`;
    const virtualRun: PsiRun = {
      id: virtualId,
      psiId: virtualCode,
      investigationTitle: `Virtual Chamber Test (${sliders.material}, ${sliders.g_eff.toFixed(3)}g)`,
      runCode: `${virtualCode}-${sliders.material.slice(0, 4).toUpperCase()}`,
      facility: 'Virtual',
      material: sliders.material,
      O2_pct: sliders.O2_pct,
      P_psi: sliders.P_psi,
      Flow_ms: sliders.Flow_ms,
      g_eff: sliders.g_eff,
      Thickness_mm: sliders.Thickness_mm,
      flameSpread_mms: simulation.flameSpread_mms,
      peakTemp_K: simulation.peakTemp_K,
      radiometerFlux_Wm2: sliders.ignitionFlux_Wm2,
      coolFlameObserved: simulation.hazardStatus === 'Cool Flame Caution',
      outcome: simulation.hazardStatus,
      notes: `Pre-physical Virtual Test Lab output · Model confidence ${simulation.modelConfidence?.confidencePct.toFixed(1) ?? '90.0'}% (${simulation.modelConfidence?.physicalTestingRecommendation ?? 'Recommended'})`,
      isVirtual: true,
    };

    setCatalogRuns((prev) => [virtualRun, ...prev]);
    setSelectedRunIds((prev) => [virtualRun.id, ...prev].slice(0, 4));
    setHighlightedRunId(virtualRun.id);
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
    setSliders((prev) => ({
      ...prev,
      O2_pct: Math.min(100.0, Math.max(14.0, run.O2_pct)),
      P_psi: Math.min(20.0, Math.max(4.3, run.P_psi)),
      Flow_ms: Math.min(0.5, Math.max(0.0, run.Flow_ms)),
      g_eff: Math.min(1.0, Math.max(0.0, run.g_eff)),
      Thickness_mm: Math.min(10.0, Math.max(0.2, run.Thickness_mm)),
      material: mapMaterialToCandidate(run.material),
    }));
    setHighlightedRunId(run.id);
    setActiveView('virtual-lab');
  };

  const handleSimulateEnvironment = (env: {
    O2_pct: number;
    P_psi: number;
    Flow_ms: number;
    g_eff: number;
    Thickness_mm: number;
  }) => {
    setActivePresetId(null);
    setSliders((prev) => ({
      ...prev,
      O2_pct: env.O2_pct,
      P_psi: env.P_psi,
      Flow_ms: env.Flow_ms,
      g_eff: env.g_eff,
      Thickness_mm: env.Thickness_mm,
    }));
    setActiveView('virtual-lab');
  };

  const navigateToInvestigationDetail = (run: PsiRun) => {
    if (activeView !== 'investigation-detail') {
      setPreviousView(activeView);
    }
    setInspectedRunId(run.id);
    setHighlightedRunId(run.id);
    setActiveView('investigation-detail');
  };

  const handleOpenInspector = (psiIdOrRunId: string) => {
    const q = psiIdOrRunId.trim().toLowerCase();
    const matched =
      catalogRuns.find((r) => r.id.toLowerCase() === q) ??
      catalogRuns.find((r) => r.psiId.toLowerCase() === q) ??
      catalogRuns.find((r) => r.psiId.toLowerCase().startsWith(q)) ??
      catalogRuns.find((r) => r.psiId.toLowerCase().includes(q));
    if (matched) {
      navigateToInvestigationDetail(matched);
    }
  };

  const handleQuickJumpRun = (run: PsiRun) => {
    navigateToInvestigationDetail(run);
  };

  const handleExportBrief = () => {
    const reportLines = [
      `# PSI Data Manager — Microgravity Combustion Engineering Brief`,
      `Generated: ${new Date().toISOString()}`,
      ``,
      `## 1. Active Virtual Test Chamber Parameters`,
      `- Candidate Material: ${sliders.material}`,
      `- Oxygen Concentration: ${sliders.O2_pct.toFixed(1)}% O2`,
      `- Cabin Pressure: ${sliders.P_psi.toFixed(1)} psi`,
      `- Forced Airflow Velocity: ${sliders.Flow_ms.toFixed(2)} m/s`,
      `- Effective Gravity: ${sliders.g_eff.toFixed(3)}g`,
      `- Substrate Thickness: ${sliders.Thickness_mm.toFixed(1)} mm`,
      `- Ignition Heat Flux: ${sliders.ignitionFlux_Wm2.toLocaleString()} W/m2`,
      ``,
      `## 2. Computed Fire Safety Telemetry`,
      `- Predicted Flame Spread Speed: ${simulation.flameSpread_mms.toFixed(2)} ± ${simulation.confidenceInterval_mms.toFixed(2)} mm/s (95% CI)`,
      `- Hazard Status: ${simulation.hazardStatus} (Peak Temp: ${simulation.peakTemp_K} K)`,
      `- 10s Growth Forecast: ${simulation.forecast10s.radius_mm.toFixed(1)} mm radius (+${simulation.forecast10s.pressureRise_kPa.toFixed(2)} kPa)`,
      `- Minimum Safe Thickness: >= ${simulation.safeMaterialCheck.minSafeThickness_mm.toFixed(1)} mm (${simulation.safeMaterialCheck.passed ? 'PASS' : 'FAIL'})`,
      simulation.modelConfidence
        ? `- Model Confidence: ${simulation.modelConfidence.confidencePct.toFixed(1)}% (${simulation.modelConfidence.validatedRunCount} nearby PSI runs · Physical Testing: ${simulation.modelConfidence.physicalTestingRecommendation})`
        : `- Model Confidence: Calibrated baseline`,
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

  const handleSendPrompt = async (
    promptText: string,
    modeOverride?: ConsoleMode,
    chartContextOverride?: DecodedChartContext | null
  ) => {
    const modeToUse = modeOverride ?? consoleMode;
    const chartCtx =
      chartContextOverride !== undefined
        ? chartContextOverride
        : activeChartContext;

    const userMsg: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      timestamp: 'Now',
      mode: modeToUse,
      text: promptText,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    const response = await runModelConsoleInference({
      question: promptText,
      mode: modeToUse,
      request: {
        ...sliders,
        selectedRunIds,
      },
      catalog: catalogRuns,
      archiveContext,
      chartContext: chartCtx,
    });
    setIsThinking(false);

    if (response.assistantReply) {
      if (response.assistantReply.suggestedVizMode) {
        setVizMode(response.assistantReply.suggestedVizMode);
      }
      const assistantMsg: AssistantMessage = {
        id: `ast-${Date.now()}`,
        role: 'assistant',
        timestamp: 'Synced',
        mode: modeToUse,
        steps: response.assistantReply.steps,
        citations: response.assistantReply.citations,
        suggestedVizMode: response.assistantReply.suggestedVizMode,
        recommendedParams: response.assistantReply.recommendedParams,
        whatIfRows: response.assistantReply.whatIfRows,
        chartContext: chartCtx ?? undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    }
  };

  const handleResetConsole = () => {
    const initReply = runLocalPhysicsSimulation(
      {
        ...sliders,
        consoleMode,
        question: 'Decode active Virtual Test Chamber configuration and safety bounds',
      },
      catalogRuns,
      archiveContext
    ).assistantReply;

    setMessages([
      {
        id: `msg-reset-${Date.now()}`,
        role: 'assistant',
        timestamp: 'Ready',
        mode: consoleMode,
        steps: initReply?.steps ?? [],
        citations: initReply?.citations ?? ['PSI-99', 'PSI-25', 'PSI-69'],
        recommendedParams: initReply?.recommendedParams,
        whatIfRows: initReply?.whatIfRows,
      },
    ]);
  };

  const handleApplyParamsToVirtualLab = (
    params: Partial<VirtualTestConfig>
  ) => {
    setActivePresetId(null);
    setSliders((prev) => ({
      ...prev,
      ...params,
    }));
  };

  const handleImportSuccess = (
    newRuns: PsiRun[],
    meta: { fileName: string; unitConversionsApplied: string[] }
  ) => {
    setCatalogRuns((prev) => [...newRuns, ...prev]);
    setTotalRunsCount((prev) => prev + newRuns.length);
    setCustomUploadsCount((prev) => prev + newRuns.length);
    const newIds = newRuns.map((r) => r.id).slice(0, 2);
    setSelectedRunIds((prev) => [...newIds, ...prev].slice(0, 4));
    if (newRuns[0]) {
      setHighlightedRunId(newRuns[0].id);
    }
    setSessionEvents((prev) => [
      {
        id: `evt-upload-${Date.now()}`,
        sourceName: meta.fileName,
        eventType: 'custom-upload',
        timestampUtc: formatUtcTimestamp(new Date()),
        runsIndexed: newRuns.length,
        summary: `Validated and indexed ${newRuns.length} normalized run${
          newRuns.length === 1 ? '' : 's'
        } into active Experiment Catalog & Comparator.`,
        targetRunId: newRuns[0]?.id,
        unitConversions: meta.unitConversionsApplied,
      },
      ...prev,
    ]);
  };

  const detailBackTarget: WorkspaceView =
    previousView === 'experiment-runs' ||
    previousView === 'comparator' ||
    previousView === 'import-sync' ||
    previousView === 'researchers-guide' ||
    previousView === 'mission-spinoffs' ||
    previousView === 'model-console' ||
    previousView === 'virtual-lab' ||
    previousView === 'visual-studio'
      ? previousView
      : 'investigations';

  const detailBackLabel =
    detailBackTarget === 'experiment-runs'
      ? 'Experiment Runs'
      : detailBackTarget === 'comparator'
      ? 'Run Comparator'
      : detailBackTarget === 'import-sync'
      ? 'Data Import & Sync'
      : detailBackTarget === 'researchers-guide'
      ? "ISS Researcher's Guide"
      : detailBackTarget === 'mission-spinoffs'
      ? 'Mission & Spin-Off Cases'
      : detailBackTarget === 'model-console'
      ? 'Model Console'
      : detailBackTarget === 'virtual-lab'
      ? 'Virtual Test Lab'
      : detailBackTarget === 'visual-studio'
      ? 'Visual Analytics Studio'
      : 'Data Archive';

  const handleCycleSidebarState = () => {
    setSidebarState((prev) =>
      prev === 'expanded'
        ? 'compact'
        : prev === 'compact'
        ? 'hidden'
        : 'expanded'
    );
  };

  const handleHeaderToggleSidebar = () => {
    setSidebarState((prev) => (prev === 'expanded' ? 'compact' : 'expanded'));
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
      {/* Left Hierarchical Collapsible Navigation Sidebar */}
      <LeftSidebar
        theme={theme}
        activeView={activeView}
        onSelectView={setActiveView}
        sidebarState={sidebarState}
        onCycleSidebarState={handleCycleSidebarState}
        selectedRunsCount={selectedRuns.length}
        investigationCount={investigationCount}
        totalRunsCount={totalRunsCount}
        missionCasesCount={MISSION_AND_SPINOFF_CASES.length}
        isArchiveLoading={isArchiveLoading}
        customUploadsCount={customUploadsCount}
        runs={catalogRuns}
        onQuickJumpRun={handleQuickJumpRun}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <HeaderBar
          theme={theme}
          onThemeChange={setTheme}
          activeView={activeView}
          inspectedRun={inspectedRun}
          sidebarState={sidebarState}
          onHeaderToggleSidebar={handleHeaderToggleSidebar}
          onExportBrief={handleExportBrief}
        />

        <main className="flex-1 px-4 sm:px-6 pb-6 pt-4 max-w-[1720px] w-full">
          {activeView === 'virtual-lab' && (
            <VirtualTestLab
              theme={theme}
              config={sliders}
              activePresetId={activePresetId}
              simulation={simulation}
              isRunningTest={isRunningVirtualTest}
              lastRunId={lastVirtualRunId}
              lastRunTimestamp={lastVirtualRunTimestamp}
              onSelectPreset={handleSelectPreset}
              onChangeConfig={handleChangeVirtualConfig}
              onResetConfig={handleResetSliders}
              onRunVirtualTest={handleRunVirtualTest}
              onInspectInVisualStudio={() => setActiveView('visual-studio')}
              onAnalyzeInModelConsole={() => {
                setConsoleMode('decoder');
                setActiveChartContext(null);
                setActiveView('model-console');
                handleSendPrompt(
                  `Analyze Virtual Test Lab output (${sliders.material}, ${sliders.O2_pct.toFixed(1)}% O2, ${sliders.P_psi.toFixed(1)} psi, ${sliders.Flow_ms.toFixed(2)} m/s, ${sliders.g_eff.toFixed(3)}g, ${sliders.Thickness_mm.toFixed(1)} mm) yielding ${simulation.flameSpread_mms.toFixed(2)} mm/s (${simulation.hazardStatus}).`,
                  'decoder',
                  null
                );
              }}
              onAddVirtualRunToComparator={handleAddVirtualRunToComparator}
              onInspectRun={handleOpenInspector}
              hoveredMaterialId={hoveredMaterialId}
              onHoverMaterial={setHoveredMaterialId}
            />
          )}

          {activeView === 'visual-studio' && (
            <VisualAnalyticsStudio
              theme={theme}
              vizMode={vizMode}
              onChangeVizMode={setVizMode}
              sliders={sliders}
              onChangeSlider={handleChangeSlider}
              simulation={simulation}
              selectedRuns={selectedRuns}
              catalogRuns={catalogRuns}
              hoveredRunId={hoveredRunId}
              onHoverRun={setHoveredRunId}
              hoveredMaterialId={hoveredMaterialId}
              onHoverMaterial={setHoveredMaterialId}
              onInspectRun={handleOpenInspector}
              onGoToImportSync={() => setActiveView('import-sync')}
              onDecodeInModelConsole={(chartContext) => {
                setActiveChartContext(chartContext);
                setConsoleMode('decoder');
                setActiveView('model-console');
                handleSendPrompt(
                  `Decode active Visual Analytics view: ${chartContext.techniqueName} (${chartContext.xAxisLabel} vs ${chartContext.yAxisLabel}) across ${chartContext.runCount} points. ${chartContext.anomalies[0] ?? ''}`,
                  'decoder',
                  chartContext
                );
              }}
            />
          )}

          {activeView === 'model-console' && (
            <ModelConsoleView
              theme={theme}
              activeMode={consoleMode}
              onChangeMode={setConsoleMode}
              virtualConfig={sliders}
              simulation={simulation}
              messages={messages}
              isRunningInference={isThinking}
              activeChartContext={activeChartContext}
              onClearChartContext={() => setActiveChartContext(null)}
              totalRunsCount={totalRunsCount}
              investigationCount={investigationCount}
              literatureChunksCount={literatureChunks.length}
              onSubmitInference={(text, mode) => handleSendPrompt(text, mode)}
              onResetConsole={handleResetConsole}
              onApplyParamsToVirtualLab={handleApplyParamsToVirtualLab}
              onOpenInvestigation={handleOpenInspector}
              onGoToEndpointConfig={() => setActiveView('import-sync')}
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
              onAddActiveVirtualRun={handleAddVirtualRunToComparator}
              onGoToCatalog={() => setActiveView('experiment-runs')}
              onOpenWorkbenchTechnique={(mode) => {
                setVizMode(mode);
                setActiveView('visual-studio');
              }}
            />
          )}

          {(activeView === 'investigations' ||
            activeView === 'researchers-guide' ||
            activeView === 'mission-spinoffs') && (
            <CatalogView
              theme={theme}
              activeTabOverride={
                activeView === 'researchers-guide'
                  ? 'researchers-guide'
                  : activeView === 'mission-spinoffs'
                  ? 'mission-spinoffs'
                  : 'psi-investigations'
              }
              onChangeTab={(tab) =>
                setActiveView(
                  tab === 'researchers-guide'
                    ? 'researchers-guide'
                    : tab === 'mission-spinoffs'
                    ? 'mission-spinoffs'
                    : 'investigations'
                )
              }
              runs={catalogRuns}
              investigations={investigations}
              guideTopics={guideTopics}
              literatureChunks={literatureChunks}
              corpusStats={corpusStats}
              missionCases={MISSION_AND_SPINOFF_CASES}
              isArchiveLoading={isArchiveLoading}
              selectedRunIds={selectedRunIds}
              highlightedRunId={highlightedRunId}
              onToggleRun={handleToggleRun}
              onApplyRunToSliders={handleApplyRunToSliders}
              onSimulateEnvironment={handleSimulateEnvironment}
              onInspectRun={handleOpenInspector}
              onGoToComparator={() => setActiveView('comparator')}
            />
          )}

          {activeView === 'experiment-runs' && (
            <ExperimentRunsView
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

          {activeView === 'import-sync' && (
            <ImportSyncView
              theme={theme}
              onImportSuccess={handleImportSuccess}
              manifestFiles={manifestFiles}
              sessionEvents={sessionEvents}
              isArchiveLoading={isArchiveLoading}
              onInspectRunFromManifest={(runId) => {
                handleOpenInspector(runId);
              }}
              onNavigateArchiveView={(view) => setActiveView(view)}
            />
          )}

          {activeView === 'investigation-detail' && (
            <PsiInvestigationDetailView
              run={inspectedRun}
              investigationRecord={inspectedInvestigationRecord}
              allRuns={catalogRuns}
              literatureChunks={literatureChunks}
              selectedRunIds={selectedRunIds}
              theme={theme}
              backLabel={detailBackLabel}
              isSelectedForComparison={
                inspectedRun ? selectedRunIds.includes(inspectedRun.id) : false
              }
              selectedRunsCount={selectedRuns.length}
              onBack={() => setActiveView(detailBackTarget)}
              onToggleComparison={handleToggleRun}
              onLoadIntoSimulator={handleApplyRunToSliders}
              onSelectRun={(runId) => handleOpenInspector(runId)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
