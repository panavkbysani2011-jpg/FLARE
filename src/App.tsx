import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccountSession,
  AppSettings,
  AssistantMessage,
  CandidateMaterialCode,
  ChatThread,
  ConsoleMode,
  DataManifestFileRecord,
  DecodedChartContext,
  EnvironmentPreset,
  EnvironmentPresetId,
  LiteratureChunk,
  LiteratureCorpusStats,
  PsiInvestigationRecord,
  PsiRun,
  QuickScenarioId,
  ResearchersGuideTopic,
  SavedUserAccountWorkspace,
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
  getActiveEndpointProfile,
  ingestRunsToActiveEndpoint,
  runModelConsoleInference,
  syncCorpusWithEndpoint,
} from './services/psiApi';
import {
  getOrCreateUserProfile,
  recordFuelUsage,
  recordGravityUsage,
} from './services/userAdaptation';
import {
  clearChatHistoryForSession,
  deleteNamedAccount,
  loadActiveSessionOnStartup,
  persistActiveUserWorkspace,
  signInWithFullName,
  signOutAccountSession,
  startGuestSession,
  updateActiveUserProfileDetails,
} from './services/accountSession';
import {
  applyAppearanceSettings,
  DEFAULT_APP_SETTINGS,
  resolveThemePolarity,
} from './utils/themePreferences';
import { getCanonicalPsiId } from './utils/investigationArtifacts';
import { HeaderBar } from './components/HeaderBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LeftSidebar } from './components/LeftSidebar';
import { LandingView } from './components/LandingView';
import { SignInModal } from './components/SignInModal';
import { SettingsModal } from './components/SettingsModal';
import { OverviewView } from './components/OverviewView';
import { VirtualTestLab } from './components/VirtualTestLab';
import { VisualAnalyticsStudio } from './components/VisualAnalyticsStudio';
import {
  ModelConsoleSubmitPayload,
  ModelConsoleView,
} from './components/ModelConsoleView';
import { CatalogView } from './components/CatalogView';
import { ExperimentRunsView } from './components/ExperimentRunsView';
import { RunComparator } from './components/RunComparator';
import { ImportSyncView } from './components/ImportSyncView';
import { PsiInvestigationDetailView } from './components/PsiInvestigationDetailView';
import {
  ActiveChartExportSnapshot,
  HeaderExportFormat,
  HeaderExportSectionId,
} from './utils/exportHelpers';
import { exportHeaderBundleFormatted } from './utils/exportGenerators';
import {
  getTechniqueHeadline,
  VIZ_TECHNIQUE_REGISTRY,
} from './utils/vizRegistry';
import {
  appendMessagesToThread,
  createChatThread,
  formatChatTimestamp,
  loadActiveChatThreadId,
  loadChatThreads,
  saveActiveChatThreadId,
  saveChatThreads,
  sortThreadsNewestFirst,
} from './utils/chatStorage';

export default function App() {
  const initialStartup = useMemo(() => loadActiveSessionOnStartup(), []);

  // 1. Account Session, Settings & Dynamic Theme Resolution
  const [accountSession, setAccountSession] = useState<AccountSession | null>(
    () => initialStartup.session
  );
  const [appSettings, setAppSettings] = useState<AppSettings>(() =>
    initialStartup.workspace?.settings
      ? {
          ...DEFAULT_APP_SETTINGS,
          ...initialStartup.workspace.settings,
          customColors: {
            ...(initialStartup.workspace.settings.customColors ?? {}),
          },
        }
      : { ...DEFAULT_APP_SETTINGS, customColors: {} }
  );
  const [profileEmail, setProfileEmail] = useState<string>(
    () => initialStartup.workspace?.email ?? ''
  );
  const [profileBio, setProfileBio] = useState<string>(
    () => initialStartup.workspace?.bio ?? ''
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const theme: ThemeMode = useMemo(() => {
    void systemPrefersDark;
    return resolveThemePolarity(appSettings.themeSetting);
  }, [appSettings.themeSetting, systemPrefersDark]);

  useEffect(() => {
    applyAppearanceSettings(appSettings, theme);
  }, [appSettings, theme]);

  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const [signInContextLabel, setSignInContextLabel] = useState<
    string | undefined
  >(undefined);
  const [pendingLandingIntent, setPendingLandingIntent] = useState<
    | { kind: 'enter' }
    | { kind: 'workspace'; view: WorkspaceView }
    | { kind: 'scenario'; scenarioId: QuickScenarioId }
    | null
  >(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [guideJumpHint, setGuideJumpHint] = useState<{
    topicId?: string;
    searchHint?: string;
    nonce: number;
  } | null>(null);
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);

  // 2. Full-Screen Landing Page vs. Inside-App Overview & Collapsible Sidebar State
  const [showLanding, setShowLanding] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<WorkspaceView>('overview');
  const [previousView, setPreviousView] =
    useState<WorkspaceView>('investigations');
  const [sidebarState, setSidebarState] = useState<SidebarState>('expanded');

  // 3. Catalog, Real Loaded Archive & Selected Runs
  const [catalogRuns, setCatalogRuns] = useState<PsiRun[]>(
    () => initialStartup.workspace?.customRuns ?? []
  );
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

  // 6. Visualization Mode & Active Export Snapshot (adapts default chart pick to researcher history)
  const [vizMode, setVizMode] = useState<VizMode>(
    () => getOrCreateUserProfile().preferredCharts[0] ?? 'safety-map'
  );
  const [studioExportSnapshot, setStudioExportSnapshot] =
    useState<ActiveChartExportSnapshot | null>(null);

  // 7. Live Public Archive Manifest & Session Ingestion Status
  const [manifestFiles, setManifestFiles] = useState<DataManifestFileRecord[]>(
    []
  );
  const [sessionEvents, setSessionEvents] = useState<SessionIngestionEvent[]>(
    []
  );
  const [customUploadsCount, setCustomUploadsCount] = useState(
    () => initialStartup.workspace?.customRuns.length ?? 0
  );
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
              sourceName: 'Archived Spaceflight Fire Data & ISS Guide',
              eventType: 'archive-load',
              timestampUtc: loadedAtUtc,
              runsIndexed: loaded.runs.length,
              summary: `Loaded ${loaded.investigations.length} PSI experiments, ${loaded.totalCsvRuns.toLocaleString()} test data rows (${loaded.runs.length.toLocaleString()} total test runs), and ${loaded.literatureChunks.length.toLocaleString()} handbook sections across ${loaded.manifestFiles.length} data files.`,
              targetView: 'experiment-runs',
            },
          ];
        });

        // Automatic background corpus sync if a remote model or VITE_API_BASE_URL is configured
        if (getActiveEndpointProfile()) {
          void syncCorpusWithEndpoint({
            catalogRuns: loaded.runs,
            investigations: loaded.investigations,
            literatureChunksCount: loaded.literatureChunks.length,
          });
        }
      })
      .catch((err) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'Unable to fetch archive assets.';
        console.warn('PSI runtime archive fetch error:', err);
        setSessionEvents((prev) => [
          {
            id: `evt-archive-err-${Date.now()}`,
            sourceName: 'Archived Spaceflight Fire Data & ISS Guide',
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

  // Support [ to cycle sidebar & Ctrl/Cmd+K to focus global search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (!showLanding) {
          e.preventDefault();
          setSidebarState('expanded');
          setTimeout(() => {
            globalSearchInputRef.current?.focus();
            globalSearchInputRef.current?.select();
          }, 25);
        }
        return;
      }

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
  }, [showLanding]);

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
  const [chatThreads, setChatThreads] = useState<ChatThread[]>(() =>
    loadChatThreads()
  );
  const [activeChatThreadId, setActiveChatThreadId] = useState<string>(() => {
    const saved = loadChatThreads();
    const savedActiveId = loadActiveChatThreadId();
    if (savedActiveId && saved.some((t) => t.id === savedActiveId)) {
      return savedActiveId;
    }
    return createChatThread().id;
  });

  useEffect(() => {
    saveChatThreads(chatThreads);
  }, [chatThreads]);

  useEffect(() => {
    saveActiveChatThreadId(activeChatThreadId);
  }, [activeChatThreadId]);

  // Continuously persist settings, chats, custom runs, and learned memory per signed-in session
  useEffect(() => {
    if (!accountSession?.isAuthenticated) return;
    const customRuns = catalogRuns.filter((r) => Boolean(r.isCustom));
    persistActiveUserWorkspace(accountSession, {
      settings: appSettings,
      chatThreads,
      activeChatThreadId,
      customRuns,
    });
  }, [accountSession, appSettings, chatThreads, activeChatThreadId, catalogRuns]);

  const messages: AssistantMessage[] = useMemo(
    () =>
      chatThreads.find((t) => t.id === activeChatThreadId)?.messages ?? [],
    [chatThreads, activeChatThreadId]
  );

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
    recordGravityUsage(preset.g_eff);
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
    if (key === 'material') {
      recordFuelUsage(String(value));
    } else if (key === 'g_eff') {
      recordGravityUsage(Number(value));
    }
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
    recordFuelUsage(sliders.material);
    recordGravityUsage(sliders.g_eff);
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

  const resolvedActiveChart: ActiveChartExportSnapshot = useMemo(() => {
    if (studioExportSnapshot && studioExportSnapshot.vizMode === vizMode) {
      return studioExportSnapshot;
    }
    const technique = VIZ_TECHNIQUE_REGISTRY.find((t) => t.id === vizMode);
    return {
      vizMode,
      techniqueName: technique?.name ?? '2D Regime Heatmap',
      datasetLabel: 'Full PSI Archive',
      xAxisKey: 'O2_pct',
      xAxisLabel: 'O2 Concentration',
      xAxisUnit: '%',
      yAxisKey: 'flameSpread_mms',
      yAxisLabel: 'Flame Spread Rate',
      yAxisUnit: 'mm/s',
      colorByKey: 'outcome',
      colorByLabel: 'Fire Safety Result',
      headline: getTechniqueHeadline(vizMode, simulation, sliders, catalogRuns),
      plottedRuns: catalogRuns,
    };
  }, [studioExportSnapshot, vizMode, simulation, sliders, catalogRuns]);

  const handleExportBundle = (
    sections: HeaderExportSectionId[],
    format: HeaderExportFormat
  ) => {
    exportHeaderBundleFormatted({
      sections,
      format,
      config: sliders,
      simulation,
      selectedRuns,
      activeChart: resolvedActiveChart,
      consoleMessages: messages,
      units: appSettings.units,
    });
  };

  const handleSendPrompt = async (
    input: string | ModelConsoleSubmitPayload,
    modeOverride?: ConsoleMode,
    chartContextOverride?: DecodedChartContext | null
  ) => {
    const payloadObj: ModelConsoleSubmitPayload =
      typeof input === 'string'
        ? {
            promptText: input,
            mode: modeOverride ?? consoleMode,
            attachments: [],
            vizOutput: 'auto',
            chartContextOverride,
          }
        : input;

    const modeToUse = payloadObj.mode ?? consoleMode;
    const chartCtx =
      payloadObj.chartContextOverride !== undefined
        ? payloadObj.chartContextOverride
        : activeChartContext;
    const targetThreadId = activeChatThreadId;
    const msgTimestamp = formatChatTimestamp();

    const userMsg: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      timestamp: msgTimestamp,
      mode: modeToUse,
      text: payloadObj.promptText,
      attachments:
        payloadObj.attachments.length > 0 ? payloadObj.attachments : undefined,
    };
    setChatThreads((prev) =>
      appendMessagesToThread(prev, targetThreadId, [userMsg])
    );
    setIsThinking(true);

    const response = await runModelConsoleInference({
      question: payloadObj.promptText,
      mode: modeToUse,
      request: {
        ...sliders,
        selectedRunIds,
        attachments: payloadObj.attachments,
        requestedVizOutput: payloadObj.vizOutput,
      },
      catalog: catalogRuns,
      archiveContext,
      chartContext: chartCtx,
      attachments: payloadObj.attachments,
      requestedVizOutput: payloadObj.vizOutput,
      selectedRuns,
    });
    setIsThinking(false);

    if (response.assistantReply) {
      if (response.assistantReply.inlineChart?.resolvedVizMode) {
        setVizMode(response.assistantReply.inlineChart.resolvedVizMode);
      } else if (response.assistantReply.suggestedVizMode) {
        setVizMode(response.assistantReply.suggestedVizMode);
      }
      const assistantMsg: AssistantMessage = {
        id: `ast-${Date.now()}`,
        role: 'assistant',
        timestamp: formatChatTimestamp(),
        mode: modeToUse,
        steps: response.assistantReply.steps,
        citations: response.assistantReply.citations,
        suggestedVizMode: response.assistantReply.suggestedVizMode,
        recommendedParams: response.assistantReply.recommendedParams,
        whatIfRows: response.assistantReply.whatIfRows,
        dataTable: response.assistantReply.dataTable,
        chartContext: chartCtx ?? undefined,
        inlineChart: response.assistantReply.inlineChart,
        endpointLabel: response.assistantReply.endpointLabel,
        appliedCorrectionIds: response.assistantReply.appliedCorrectionIds,
        adaptiveNote: response.assistantReply.adaptiveNote,
      };
      setChatThreads((prev) =>
        appendMessagesToThread(prev, targetThreadId, [assistantMsg])
      );
    }
  };

  const handleMarkMessageFeedback = (
    messageId: string,
    status: 'helpful' | 'corrected'
  ) => {
    setChatThreads((prev) =>
      prev.map((t) => ({
        ...t,
        messages: t.messages.map((m) =>
          m.id === messageId ? { ...m, feedbackStatus: status } : m
        ),
      }))
    );
  };

  const handleRefreshSimulation = () => {
    void analyzeCombustionState(sliders, catalogRuns, archiveContext).then(
      (res) => setSimulation(res)
    );
  };

  const handleCreateNewThread = () => {
    const fresh = createChatThread();
    setActiveChatThreadId(fresh.id);
    setActiveChartContext(null);
  };

  const handleSelectThread = (threadId: string) => {
    setActiveChatThreadId(threadId);
  };

  const handleDeleteThread = (threadId: string) => {
    setChatThreads((prev) => {
      const remaining = prev.filter((t) => t.id !== threadId);
      if (activeChatThreadId === threadId) {
        if (remaining.length > 0) {
          setActiveChatThreadId(remaining[0].id);
        } else {
          setActiveChatThreadId(createChatThread().id);
        }
      }
      return remaining;
    });
  };

  const handleRenameThread = (threadId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setChatThreads((prev) =>
      sortThreadsNewestFirst(
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                title: trimmed,
              }
            : t
        )
      )
    );
  };

  const handleStartQuickScenario = (scenarioId: QuickScenarioId) => {
    setShowLanding(false);
    if (scenarioId === 'lunar-cabin') {
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
      setActiveView('virtual-lab');
      return;
    }

    if (scenarioId === 'cool-flame') {
      setActivePresetId(null);
      setSliders({
        O2_pct: 21.0,
        P_psi: 14.7,
        Flow_ms: 0.04,
        g_eff: 0.0,
        Thickness_mm: 2.0,
        material: 'PMMA',
        ignitionFlux_Wm2: 25000,
      });
      setVizMode('safety-map');
      setActiveView('visual-studio');
      return;
    }

    setActiveView('mission-spinoffs');
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

  const handleImportSuccess = async (
    newRuns: PsiRun[],
    meta: { fileName: string; unitConversionsApplied: string[] }
  ): Promise<{ message: string }> => {
    setCatalogRuns((prev) => [...newRuns, ...prev]);
    setTotalRunsCount((prev) => prev + newRuns.length);
    setCustomUploadsCount((prev) => prev + newRuns.length);
    const newIds = newRuns.map((r) => r.id).slice(0, 2);
    setSelectedRunIds((prev) => [...newIds, ...prev].slice(0, 4));
    if (newRuns[0]) {
      setHighlightedRunId(newRuns[0].id);
    }

    const ingestResult = await ingestRunsToActiveEndpoint({
      runs: newRuns,
      fileName: meta.fileName,
      unitConversionsApplied: meta.unitConversionsApplied,
    });

    setSessionEvents((prev) => [
      {
        id: `evt-upload-${Date.now()}`,
        sourceName: meta.fileName,
        eventType: 'custom-upload',
        timestampUtc: formatUtcTimestamp(new Date()),
        runsIndexed: newRuns.length,
        summary: ingestResult.message,
        targetRunId: newRuns[0]?.id,
        unitConversions: meta.unitConversionsApplied,
      },
      ...prev,
    ]);

    return { message: ingestResult.message };
  };

  const detailBackTarget: WorkspaceView =
    previousView === 'overview' ||
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
    detailBackTarget === 'overview'
      ? 'Overview'
      : detailBackTarget === 'experiment-runs'
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

  const applyWorkspaceSnapshotToRuntime = (
    workspace: SavedUserAccountWorkspace
  ) => {
    const mergedSettings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      ...workspace.settings,
      customColors: {
        ...(workspace.settings?.customColors ?? {}),
      },
    };
    setAppSettings(mergedSettings);
    setProfileEmail(workspace.email ?? '');
    setProfileBio(workspace.bio ?? '');

    const nextThreads =
      workspace.chatThreads.length > 0
        ? sortThreadsNewestFirst(workspace.chatThreads)
        : [createChatThread('New Chat')];
    setChatThreads(nextThreads);
    const nextActiveId =
      workspace.activeChatThreadId &&
      nextThreads.some((t) => t.id === workspace.activeChatThreadId)
        ? workspace.activeChatThreadId
        : nextThreads[0].id;
    setActiveChatThreadId(nextActiveId);

    setVizMode(workspace.adaptationProfile.preferredCharts?.[0] ?? 'safety-map');

    const userCustom = workspace.customRuns ?? [];
    setCatalogRuns((prev) => {
      const baseArchive = prev.filter((r) => !r.isCustom);
      return [...userCustom, ...baseArchive];
    });
    setCustomUploadsCount(userCustom.length);
    return mergedSettings;
  };

  const executeLandingIntent = (
    intent:
      | { kind: 'enter' }
      | { kind: 'workspace'; view: WorkspaceView }
      | { kind: 'scenario'; scenarioId: QuickScenarioId }
      | null,
    overrideDefaultWorkspace?: AppSettings['defaultWorkspace']
  ) => {
    if (!intent) return;
    if (intent.kind === 'enter') {
      setActiveView(overrideDefaultWorkspace ?? appSettings.defaultWorkspace);
      setShowLanding(false);
    } else if (intent.kind === 'workspace') {
      setActiveView(intent.view);
      setShowLanding(false);
    } else {
      handleStartQuickScenario(intent.scenarioId);
    }
  };

  const handleCompleteNameSignIn = (fullName: string) => {
    const { session, workspace } = signInWithFullName(fullName);
    setAccountSession(session);
    const restoredSettings = applyWorkspaceSnapshotToRuntime(workspace);
    setIsSignInModalOpen(false);
    const intent = pendingLandingIntent;
    setPendingLandingIntent(null);
    setSignInContextLabel(undefined);
    executeLandingIntent(intent, restoredSettings.defaultWorkspace);
  };

  const handleCompleteGuestSignIn = () => {
    const { session, workspace } = startGuestSession();
    setAccountSession(session);
    const guestSettings = applyWorkspaceSnapshotToRuntime(workspace);
    setIsSignInModalOpen(false);
    const intent = pendingLandingIntent;
    setPendingLandingIntent(null);
    setSignInContextLabel(undefined);
    executeLandingIntent(intent, guestSettings.defaultWorkspace);
  };

  const handleUpdateSettings = (patch: Partial<AppSettings>) => {
    setAppSettings((prev) => {
      const next: AppSettings = {
        ...prev,
        ...patch,
        customColors: patch.customColors
          ? patch.customColors
          : prev.customColors,
      };
      return next;
    });
  };

  const handleSaveProfileDetails = (updates: {
    fullName: string;
    email: string;
    bio: string;
  }) => {
    if (!accountSession) return;
    const customRuns = catalogRuns.filter((r) => Boolean(r.isCustom));
    const { session: nextSession, workspace: nextWorkspace } =
      updateActiveUserProfileDetails(accountSession, updates, customRuns);
    setAccountSession(nextSession);
    setProfileEmail(nextWorkspace.email);
    setProfileBio(nextWorkspace.bio);
  };

  const handleClearChatHistoryOnly = () => {
    const { threads, activeThreadId } =
      clearChatHistoryForSession(accountSession);
    setChatThreads(threads);
    setActiveChatThreadId(activeThreadId);
  };

  const handleSignOut = () => {
    signOutAccountSession();
    setAccountSession(null);
    setAppSettings({ ...DEFAULT_APP_SETTINGS, customColors: {} });
    setProfileEmail('');
    setProfileBio('');
    const fresh = createChatThread('New Chat');
    setChatThreads([fresh]);
    setActiveChatThreadId(fresh.id);
    setCatalogRuns((prev) => prev.filter((r) => !r.isCustom));
    setCustomUploadsCount(0);
    setShowLanding(true);
  };

  const handleDeleteAccount = () => {
    if (!accountSession || accountSession.mode === 'guest') return;
    deleteNamedAccount(accountSession.researcherId);
    setAccountSession(null);
    setAppSettings({ ...DEFAULT_APP_SETTINGS, customColors: {} });
    setProfileEmail('');
    setProfileBio('');
    const fresh = createChatThread('New Chat');
    setChatThreads([fresh]);
    setActiveChatThreadId(fresh.id);
    setCatalogRuns((prev) => prev.filter((r) => !r.isCustom));
    setCustomUploadsCount(0);
    setShowLanding(true);
  };

  const handleLandingEnterRequest = () => {
    if (accountSession?.isAuthenticated) {
      setActiveView(appSettings.defaultWorkspace);
      setShowLanding(false);
      return;
    }
    setPendingLandingIntent({ kind: 'enter' });
    setSignInContextLabel('FLARE');
    setIsSignInModalOpen(true);
  };

  const handleLandingWorkspaceRequest = (view: WorkspaceView) => {
    if (accountSession?.isAuthenticated) {
      setActiveView(view);
      setShowLanding(false);
      return;
    }
    setPendingLandingIntent({ kind: 'workspace', view });
    setSignInContextLabel(
      view === 'virtual-lab'
        ? 'Virtual Test Lab'
        : view === 'visual-studio'
        ? 'Visual Analytics Studio'
        : 'Model Console'
    );
    setIsSignInModalOpen(true);
  };

  const handleLandingScenarioRequest = (scenarioId: QuickScenarioId) => {
    if (accountSession?.isAuthenticated) {
      handleStartQuickScenario(scenarioId);
      return;
    }
    setPendingLandingIntent({ kind: 'scenario', scenarioId });
    setSignInContextLabel('Lunar Cabin Scenario');
    setIsSignInModalOpen(true);
  };

  const canvasClass =
    theme === 'dark'
      ? 'bg-[#09090B] text-[#FAFAFA]'
      : theme === 'light'
      ? 'bg-[#FFFFFF] text-[#09090B]'
      : 'bg-[#F3F4F6] text-[#18181B]';

  if (showLanding) {
    return (
      <>
        <LandingView
          theme={theme}
          session={accountSession}
          investigationCount={investigationCount}
          totalRunsCount={totalRunsCount}
          literatureChunksCount={literatureChunks.length}
          missionCasesCount={MISSION_AND_SPINOFF_CASES.length}
          isArchiveLoading={isArchiveLoading}
          onOpenSignIn={() => {
            setPendingLandingIntent(null);
            setSignInContextLabel(undefined);
            setIsSignInModalOpen(true);
          }}
          onEnterWorkspace={handleLandingEnterRequest}
          onSelectWorkspace={handleLandingWorkspaceRequest}
          onStartQuickScenario={handleLandingScenarioRequest}
        />
        <SignInModal
          isOpen={isSignInModalOpen}
          contextLabel={signInContextLabel}
          onClose={() => {
            setIsSignInModalOpen(false);
            setPendingLandingIntent(null);
            setSignInContextLabel(undefined);
          }}
          onConfirmNameSignIn={handleCompleteNameSignIn}
          onContinueAsGuest={handleCompleteGuestSignIn}
        />
      </>
    );
  }

  return (
    <div
      className={`psi-app-shell min-h-screen flex flex-col lg:flex-row transition-colors duration-150 ${canvasClass}`}
    >
      {/* Left Hierarchical Collapsible Navigation Sidebar */}
      <LeftSidebar
        theme={theme}
        session={accountSession}
        activeView={activeView}
        onSelectView={setActiveView}
        onReturnToLanding={() => setShowLanding(true)}
        sidebarState={sidebarState}
        onCycleSidebarState={handleCycleSidebarState}
        selectedRunsCount={selectedRuns.length}
        investigationCount={investigationCount}
        totalRunsCount={totalRunsCount}
        missionCasesCount={MISSION_AND_SPINOFF_CASES.length}
        isArchiveLoading={isArchiveLoading}
        customUploadsCount={customUploadsCount}
        runs={catalogRuns}
        investigations={investigations}
        guideTopics={guideTopics}
        literatureChunks={literatureChunks}
        searchInputRef={globalSearchInputRef}
        onQuickJumpRun={handleQuickJumpRun}
        onQuickJumpInvestigation={(inv) =>
          handleQuickJumpRun(inv.representativeRun)
        }
        onQuickJumpGuideTopic={(topicId, searchHint) => {
          setGuideJumpHint({
            topicId,
            searchHint,
            nonce: Date.now(),
          });
          setActiveView('researchers-guide');
        }}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenSignIn={() => {
          setPendingLandingIntent(null);
          setSignInContextLabel(undefined);
          setIsSignInModalOpen(true);
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <HeaderBar
          theme={theme}
          themeSetting={appSettings.themeSetting}
          onThemeChange={(mode) => handleUpdateSettings({ themeSetting: mode })}
          defaultExportFormat={appSettings.defaultExportFormat}
          activeView={activeView}
          inspectedRun={inspectedRun}
          sidebarState={sidebarState}
          onHeaderToggleSidebar={handleHeaderToggleSidebar}
          onExportBundle={handleExportBundle}
        />

        <main className="flex-1 px-4 sm:px-6 pb-6 pt-4 max-w-[1720px] w-full">
          <ErrorBoundary
            fallbackTitle="FLARE Workspace Recovery"
            onResetChat={() => handleClearChatHistoryOnly()}
          >
          {activeView === 'overview' && (
            <OverviewView
              theme={theme}
              investigationCount={investigationCount}
              totalRunsCount={totalRunsCount}
              literatureChunksCount={literatureChunks.length}
              missionCasesCount={MISSION_AND_SPINOFF_CASES.length}
              isArchiveLoading={isArchiveLoading}
              onNavigate={setActiveView}
              onStartQuickScenario={handleStartQuickScenario}
            />
          )}

          {activeView === 'virtual-lab' && (
            <VirtualTestLab
              theme={theme}
              measurementUnits={appSettings.units}
              defaultExportFormat={appSettings.defaultExportFormat}
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
                  {
                    promptText: `Analyze Virtual Test Lab output (${sliders.material}, ${sliders.O2_pct.toFixed(1)}% O2, ${sliders.P_psi.toFixed(1)} psi, ${sliders.Flow_ms.toFixed(2)} m/s, ${sliders.g_eff.toFixed(3)}g, ${sliders.Thickness_mm.toFixed(1)} mm) yielding ${simulation.flameSpread_mms.toFixed(2)} mm/s (${simulation.hazardStatus}).`,
                    mode: 'decoder',
                    attachments: [
                      {
                        id: 'attach-virtual-lab',
                        kind: 'virtual-lab',
                        label: 'Virtual Test Lab Current Run',
                      },
                    ],
                    vizOutput: 'auto',
                  },
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
              onExportSnapshotChange={setStudioExportSnapshot}
              theme={theme}
              defaultExportFormat={appSettings.defaultExportFormat}
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
                  {
                    promptText: `Decode active Visual Analytics view: ${chartContext.techniqueName} (${chartContext.xAxisLabel} vs ${chartContext.yAxisLabel}) across ${chartContext.runCount} points. ${chartContext.anomalies[0] ?? ''}`,
                    mode: 'decoder',
                    attachments: [
                      {
                        id: 'attach-visual-studio',
                        kind: 'visual-studio',
                        label: 'Visual Analytics Studio Active View',
                      },
                    ],
                    vizOutput: 'auto',
                    chartContextOverride: chartContext,
                  },
                  'decoder',
                  chartContext
                );
              }}
            />
          )}

          {activeView === 'model-console' && (
            <ErrorBoundary
              fallbackTitle="Model Console Recovery"
              onResetChat={() => handleClearChatHistoryOnly()}
            >
            <ModelConsoleView
              theme={theme}
              measurementUnits={appSettings.units}
              defaultExportFormat={appSettings.defaultExportFormat}
              activeResearcherLabel={
                accountSession?.mode === 'guest'
                  ? 'Guest Session'
                  : accountSession?.researcherId
              }
              activeMode={consoleMode}
              onChangeMode={setConsoleMode}
              virtualConfig={sliders}
              simulation={simulation}
              runs={catalogRuns}
              investigations={investigations}
              selectedRuns={selectedRuns}
              studioVizMode={vizMode}
              threads={chatThreads}
              activeThreadId={activeChatThreadId}
              isRunningInference={isThinking}
              activeChartContext={activeChartContext}
              onClearChartContext={() => setActiveChartContext(null)}
              totalRunsCount={totalRunsCount}
              investigationCount={investigationCount}
              literatureChunksCount={literatureChunks.length}
              onSubmitInference={(payload) => handleSendPrompt(payload)}
              onCreateNewThread={handleCreateNewThread}
              onSelectThread={handleSelectThread}
              onDeleteThread={handleDeleteThread}
              onRenameThread={handleRenameThread}
              onMarkMessageFeedback={handleMarkMessageFeedback}
              onEndpointSyncedOrProfileChanged={handleRefreshSimulation}
              onApplyParamsToVirtualLab={handleApplyParamsToVirtualLab}
              onChangeSlider={handleChangeSlider}
              onOpenInvestigation={handleOpenInspector}
              onOpenInVisualStudio={(targetViz) => {
                setVizMode(targetViz);
                setActiveView('visual-studio');
              }}
            />
            </ErrorBoundary>
          )}

          {activeView === 'comparator' && (
            <RunComparator
              theme={theme}
              measurementUnits={appSettings.units}
              defaultExportFormat={appSettings.defaultExportFormat}
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
              guideJumpHint={guideJumpHint}
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
              measurementUnits={appSettings.units}
              defaultExportFormat={appSettings.defaultExportFormat}
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
              measurementUnits={appSettings.units}
              defaultExportFormat={appSettings.defaultExportFormat}
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
          </ErrorBoundary>
        </main>
      </div>

      <SignInModal
        isOpen={isSignInModalOpen}
        contextLabel={signInContextLabel}
        onClose={() => {
          setIsSignInModalOpen(false);
          setPendingLandingIntent(null);
          setSignInContextLabel(undefined);
        }}
        onConfirmNameSignIn={handleCompleteNameSignIn}
        onContinueAsGuest={handleCompleteGuestSignIn}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        session={accountSession}
        resolvedTheme={theme}
        settings={appSettings}
        onUpdateSettings={handleUpdateSettings}
        initialEmail={profileEmail}
        initialBio={profileBio}
        onSaveProfileDetails={handleSaveProfileDetails}
        savedChatsCount={chatThreads.length}
        customRuns={catalogRuns.filter((r) => Boolean(r.isCustom))}
        onClearChatHistory={handleClearChatHistoryOnly}
        onSignOut={handleSignOut}
        onDeleteAccount={handleDeleteAccount}
      />
    </div>
  );
}
