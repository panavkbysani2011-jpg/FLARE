import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  Database,
  GitBranch,
  MessageSquarePlus,
  Mic,
  MicOff,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Server,
  Settings,
  Sliders,
  ThumbsUp,
  Trash2,
  X,
  MessageSquareWarning,
} from 'lucide-react';
import {
  AssistantMessage,
  ChatAttachment,
  ChatThread,
  ChatVisualizationOutputMode,
  ConsoleMode,
  DecodedChartContext,
  DefaultExportFormat,
  EndpointSyncState,
  ExplanationDepth,
  HazardOutcome,
  MeasurementUnits,
  NamedApiEndpointProfile,
  PsiInvestigationRecord,
  PsiRun,
  SimulationResponse,
  ThemeMode,
  VirtualTestConfig,
  VizMode,
} from '../types/psi';
import {
  getActiveEndpointProfileId,
  getApiEndpointProfiles,
  LOCAL_MODEL_ID,
  setActiveEndpointProfileId,
  submitModelFeedback,
  syncCorpusWithEndpoint,
} from '../services/psiApi';
import {
  getOrCreateUserProfile,
  getVerifiedCorrections,
  setExplanationDepth,
} from '../services/userAdaptation';
import { exportChatThreadFormatted } from '../utils/exportGenerators';
import { ExportDropdown } from './ExportDropdown';
import { VIZ_FAMILIES, VIZ_TECHNIQUE_REGISTRY } from '../utils/vizRegistry';
import { ApiSettingsModal } from './ApiSettingsModal';
import { ChatInlineChartCard } from './ChatInlineChartCard';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export interface ModelConsoleSubmitPayload {
  promptText: string;
  mode: ConsoleMode;
  attachments: ChatAttachment[];
  vizOutput: ChatVisualizationOutputMode;
  chartContextOverride?: DecodedChartContext | null;
}

interface ModelConsoleViewProps {
  theme: ThemeMode;
  measurementUnits?: MeasurementUnits;
  defaultExportFormat?: DefaultExportFormat;
  activeResearcherLabel?: string;
  activeMode: ConsoleMode;
  onChangeMode: (mode: ConsoleMode) => void;
  virtualConfig: VirtualTestConfig;
  simulation: SimulationResponse;
  runs: PsiRun[];
  investigations: PsiInvestigationRecord[];
  selectedRuns: PsiRun[];
  studioVizMode: VizMode;
  threads: ChatThread[];
  activeThreadId: string;
  isRunningInference: boolean;
  activeChartContext: DecodedChartContext | null;
  onClearChartContext: () => void;
  totalRunsCount: number;
  investigationCount: number;
  literatureChunksCount: number;
  onSubmitInference: (payload: ModelConsoleSubmitPayload) => void;
  onCreateNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
  onMarkMessageFeedback?: (
    messageId: string,
    status: 'helpful' | 'corrected'
  ) => void;
  onEndpointSyncedOrProfileChanged?: () => void;
  onApplyParamsToVirtualLab: (params: Partial<VirtualTestConfig>) => void;
  onChangeSlider: (
    key: 'O2_pct' | 'P_psi' | 'Flow_ms' | 'g_eff' | 'Thickness_mm',
    value: number
  ) => void;
  onOpenInvestigation: (psiId: string) => void;
  onOpenInVisualStudio: (vizMode: VizMode) => void;
}

const STARTER_CARDS: Array<{
  title: string;
  prompt: string;
  mode: ConsoleMode;
  hint: string;
}> = [
  {
    title: 'Compare SAFFIRE-II & BASS-II',
    prompt: 'Compare SAFFIRE-II (PSI-99) and BASS-II (PSI-25) space flame spread limits across airflow speeds',
    mode: 'literature',
    hint: 'Generates ranked comparison chart + flight citations',
  },
  {
    title: 'Decode Cool-Flame Sensors',
    prompt: 'Explain why 550K–800K cool flames evade smoke cameras across the 0–120s sensor curve',
    mode: 'decoder',
    hint: 'Overlays temperature, heat glow & smoke visibility curve',
  },
  {
    title: 'Check Material Fire Margins',
    prompt: 'Compare PMMA, Cotton-Fiberglass, and Nomex fire limits under 32% O2 Lunar cabin settings',
    mode: 'what-if',
    hint: 'Builds material qualification limits + loadable setup',
  },
];

export const ModelConsoleView: React.FC<ModelConsoleViewProps> = ({
  theme,
  measurementUnits = 'spacecraft',
  defaultExportFormat,
  activeResearcherLabel,
  activeMode,
  onChangeMode,
  virtualConfig,
  simulation,
  runs,
  investigations,
  selectedRuns,
  studioVizMode,
  threads,
  activeThreadId,
  isRunningInference,
  activeChartContext,
  onClearChartContext,
  totalRunsCount,
  investigationCount,
  literatureChunksCount,
  onSubmitInference,
  onCreateNewThread,
  onSelectThread,
  onDeleteThread,
  onRenameThread,
  onMarkMessageFeedback,
  onEndpointSyncedOrProfileChanged,
  onApplyParamsToVirtualLab,
  onChangeSlider,
  onOpenInvestigation,
  onOpenInVisualStudio,
}) => {
  const isDark = theme === 'dark';

  // Chat layout & drawer state
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');

  // Composer state
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [vizOutput, setVizOutput] = useState<ChatVisualizationOutputMode>('auto');
  const [appliedMsgId, setAppliedMsgId] = useState<string | null>(null);

  // Popover menus inside bottom composer
  const [openMenu, setOpenMenu] = useState<'attach' | 'viz' | 'model' | null>(null);
  const [psiSearchQuery, setPsiSearchQuery] = useState('');
  const [vizSearchQuery, setVizSearchQuery] = useState('');

  // Multi-API Endpoint state synced from localStorage
  const [apiProfiles, setApiProfiles] = useState<NamedApiEndpointProfile[]>(() =>
    getApiEndpointProfiles()
  );
  const [activeProfileId, setActiveProfileIdState] = useState<string>(() =>
    getActiveEndpointProfileId()
  );
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);
  const [endpointSyncNotice, setEndpointSyncNotice] =
    useState<EndpointSyncState | null>(null);

  // Per-user profile & closed-loop inline correction state
  const [userProfile, setUserProfile] = useState(() => getOrCreateUserProfile());
  const [correctionCount, setCorrectionCount] = useState(
    () => getVerifiedCorrections().length
  );
  const [editingCorrectionMsgId, setEditingCorrectionMsgId] = useState<
    string | null
  >(null);
  const [correctionSpreadInput, setCorrectionSpreadInput] = useState('');
  const [correctionOutcomeInput, setCorrectionOutcomeInput] = useState<
    '' | HazardOutcome
  >('');
  const [correctionNoteInput, setCorrectionNoteInput] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackNotices, setFeedbackNotices] = useState<Record<string, string>>(
    {}
  );

  const handleDepthSelect = (depth: ExplanationDepth) => {
    const nextProfile = setExplanationDepth(depth);
    setUserProfile(nextProfile);
    onEndpointSyncedOrProfileChanged?.();
  };

  useEffect(() => {
    setUserProfile(getOrCreateUserProfile());
    setCorrectionCount(getVerifiedCorrections().length);
  }, [activeResearcherLabel, threads]);

  const adaptedStarterCards = useMemo(() => {
    const topFuel = userProfile.preferredFuels[0];
    const topGravity = userProfile.preferredGravities[0];
    if (!topFuel && !topGravity) return STARTER_CARDS;
    const fuelLabel = topFuel ?? virtualConfig.material;
    const gravityLabel = topGravity ?? 'Microgravity (0g)';
    return [
      STARTER_CARDS[0],
      STARTER_CARDS[1],
      {
        title: `Focus: ${fuelLabel} in ${gravityLabel}`,
        prompt: `Evaluate ${fuelLabel} flame spread limits and safe thickness margins in ${gravityLabel} conditions`,
        mode: 'risk-audit' as ConsoleMode,
        hint: `Personalized quick start (${userProfile.researcherId})`,
      },
    ];
  }, [userProfile, virtualConfig.material]);

  // Voice Dictation (Web Speech API)
  const [isDictating, setIsDictating] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseInputBeforeDictateRef = useRef<string>('');
  const finalDictatedRef = useRef<string>('');

  const composerToolbarRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messageStreamRef = useRef<HTMLDivElement | null>(null);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );
  const messages: AssistantMessage[] = activeThread?.messages ?? [];

  const activeProfile = useMemo(
    () => apiProfiles.find((p) => p.id === activeProfileId) ?? null,
    [apiProfiles, activeProfileId]
  );

  // Sync chart context decoded from Visual Analytics Studio into an attachment chip
  useEffect(() => {
    if (!activeChartContext) return;
    setAttachments((prev) => {
      if (prev.some((a) => a.kind === 'visual-studio')) return prev;
      return [
        ...prev,
        {
          id: 'attach-visual-studio',
          kind: 'visual-studio',
          label: `Visual Studio: ${activeChartContext.techniqueName}`,
          sublabel: `${activeChartContext.runCount.toLocaleString()} runs`,
        },
      ];
    });
  }, [activeChartContext]);

  // Auto-expand composer textarea smoothly as content grows
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextH = Math.min(168, Math.max(48, el.scrollHeight));
    el.style.height = `${nextH}px`;
  }, [inputValue]);

  // Smooth scroll chat stream to bottom when messages arrive
  useEffect(() => {
    const container = messageStreamRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length, isRunningInference, activeThreadId]);

  // Close composer popovers on outside click / Escape
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        composerToolbarRef.current &&
        !composerToolbarRef.current.contains(e.target as Node)
      ) {
        setOpenMenu(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    if (openMenu) {
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [openMenu]);

  // Cleanup active SpeechRecognition on unmount
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, []);

  const surfaceShell = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';
  const drawerSurface = isDark
    ? 'bg-[#0C0C0E] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FAFAFA] border-[#E4E4E7] text-[#18181B]';
  const subtleSurface = isDark
    ? 'bg-[#18181B] border-[#27272A] text-zinc-200'
    : 'bg-zinc-50 border-[#E4E4E7] text-zinc-800';
  const primaryBtn = isDark
    ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA] hover:bg-zinc-200'
    : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B] hover:bg-zinc-800';
  const secondaryBtn = isDark
    ? 'bg-[#18181B] border-[#27272A] text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600'
    : 'bg-white border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300';

  const studioTechniqueLabel =
    VIZ_TECHNIQUE_REGISTRY.find((t) => t.id === studioVizMode)?.shortName ??
    '2D Heatmap';

  const selectedVizLabel = useMemo(() => {
    if (vizOutput === 'auto') return 'Chart: Auto';
    if (vizOutput === 'none') return 'None (Text Only)';
    return (
      VIZ_TECHNIQUE_REGISTRY.find((t) => t.id === vizOutput)?.shortName ??
      vizOutput
    );
  }, [vizOutput]);

  const searchablePsiItems = useMemo(() => {
    const q = psiSearchQuery.trim().toLowerCase();
    const invItems = investigations.map((inv) => ({
      id: `psi-inv-${inv.psiId}`,
      psiId: inv.psiId,
      runId: inv.representativeRun.id,
      title: `${inv.psiId}${inv.acronym ? ` · ${inv.acronym}` : ''}`,
      sub: `${inv.title} (${inv.runCount} runs)`,
    }));

    if (!q) {
      return invItems.slice(0, 8);
    }

    const matchedInv = invItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.sub.toLowerCase().includes(q)
    );
    if (matchedInv.length > 0) return matchedInv.slice(0, 10);

    return runs
      .filter(
        (r) =>
          r.psiId.toLowerCase().includes(q) ||
          r.runCode.toLowerCase().includes(q) ||
          r.material.toLowerCase().includes(q)
      )
      .slice(0, 8)
      .map((r) => ({
        id: `psi-run-${r.id}`,
        psiId: r.psiId,
        runId: r.id,
        title: `${r.psiId} · ${r.runCode}`,
        sub: `${r.material} · ${r.O2_pct.toFixed(1)}% O2 · ${r.flameSpread_mms.toFixed(2)} mm/s`,
      }));
  }, [investigations, runs, psiSearchQuery]);

  const filteredVizRegistry = useMemo(() => {
    const q = vizSearchQuery.trim().toLowerCase();
    if (!q) return VIZ_TECHNIQUE_REGISTRY;
    return VIZ_TECHNIQUE_REGISTRY.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.shortName.toLowerCase().includes(q) ||
        t.familyLabel.toLowerCase().includes(q)
    );
  }, [vizSearchQuery]);

  const toggleWorkspaceAttachment = (item: ChatAttachment) => {
    setAttachments((prev) =>
      prev.some((a) => a.id === item.id)
        ? prev.filter((a) => a.id !== item.id)
        : [...prev, item]
    );
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    if (id === 'attach-visual-studio' && activeChartContext) {
      onClearChartContext();
    }
  };

  const stopDictation = () => {
    setIsDictating(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore stop failures
    }
  };

  const handleToggleDictation = () => {
    if (isDictating) {
      stopDictation();
      return;
    }

    setVoiceNotice(null);
    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SpeechCtor = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechCtor) {
      setVoiceNotice(
        'Voice dictation is not supported in this browser — type or paste your question directly.'
      );
      return;
    }

    try {
      const recognition = new SpeechCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      baseInputBeforeDictateRef.current = inputValue.trimEnd();
      finalDictatedRef.current = '';

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let finalChunk = '';
        let interimChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0]?.transcript ?? '';
          if (res.isFinal) {
            finalChunk += text;
          } else {
            interimChunk += text;
          }
        }
        if (finalChunk) {
          finalDictatedRef.current = `${finalDictatedRef.current} ${finalChunk}`.trim();
        }
        const prefix = baseInputBeforeDictateRef.current;
        const spoken = [finalDictatedRef.current, interimChunk.trim()]
          .filter(Boolean)
          .join(' ');
        const combined = [prefix, spoken].filter(Boolean).join(prefix ? ' ' : '');
        setInputValue(combined);
      };

      recognition.onerror = (evt) => {
        setIsDictating(false);
        if (evt.error && evt.error !== 'aborted') {
          setVoiceNotice(
            evt.error === 'not-allowed'
              ? 'Microphone access was blocked. Allow microphone permission in your browser to dictate.'
              : `Voice dictation stopped (${evt.error}). You can continue typing.`
          );
        }
      };

      recognition.onend = () => {
        setIsDictating(false);
      };

      recognitionRef.current = recognition;
      setIsDictating(true);
      recognition.start();
    } catch {
      setIsDictating(false);
      setVoiceNotice(
        'Could not start voice dictation in this browser — type or paste your question instead.'
      );
    }
  };

  const inferModeFromPrompt = (text: string): ConsoleMode => {
    const q = text.toLowerCase();
    if (q.includes('what if') || q.includes('what-if') || q.includes('sweep')) {
      return 'what-if';
    }
    if (
      q.includes('safety check') ||
      q.includes('audit') ||
      q.includes('margin') ||
      q.includes('quench')
    ) {
      return 'risk-audit';
    }
    if (
      q.includes('curve') ||
      q.includes('sensor') ||
      q.includes('cool flame') ||
      q.includes('decode') ||
      q.includes('chart')
    ) {
      return 'decoder';
    }
    return activeMode;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isRunningInference) return;
    if (isDictating) stopDictation();

    const modeToUse = inferModeFromPrompt(trimmed);
    onChangeMode(modeToUse);
    onSubmitInference({
      promptText: trimmed,
      mode: modeToUse,
      attachments: [...attachments],
      vizOutput,
      chartContextOverride: activeChartContext,
    });
    setInputValue('');
    setOpenMenu(null);
  };

  const handleRetryWithChartMode = (
    userPromptText: string,
    userAttachments: ChatAttachment[],
    targetVizMode: VizMode
  ) => {
    if (isRunningInference) return;
    setVizOutput(targetVizMode);
    onSubmitInference({
      promptText: userPromptText,
      mode: inferModeFromPrompt(userPromptText),
      attachments: userAttachments,
      vizOutput: targetVizMode,
      chartContextOverride: activeChartContext,
    });
  };

  const handleApplyParams = (
    params: Partial<VirtualTestConfig>,
    keyId: string
  ) => {
    onApplyParamsToVirtualLab(params);
    setAppliedMsgId(keyId);
    window.setTimeout(() => setAppliedMsgId(null), 2500);
  };

  const handleCommitRename = (threadId: string) => {
    const trimmed = editingTitleValue.trim();
    if (trimmed) {
      onRenameThread(threadId, trimmed);
    }
    setEditingThreadId(null);
  };

  const findPrecedingUserPrompt = (msgIndex: number): {
    text: string;
    attachments: ChatAttachment[];
  } => {
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        return {
          text: messages[i].text ?? '',
          attachments: messages[i].attachments ?? [],
        };
      }
    }
    return { text: 'Analyze active flight data comparison', attachments: [] };
  };

  const handleSelectModelProfileWithSync = async (profileId: string) => {
    setActiveEndpointProfileId(profileId);
    setActiveProfileIdState(profileId);
    setOpenMenu(null);

    const chosen =
      profileId === LOCAL_MODEL_ID
        ? null
        : apiProfiles.find((p) => p.id === profileId) ?? null;

    if (!chosen) {
      setEndpointSyncNotice({
        status: 'local-only',
        endpointName: 'Local Combustion Model',
        message: 'Local Combustion Model active',
      });
      onEndpointSyncedOrProfileChanged?.();
      return;
    }

    setEndpointSyncNotice({
      status: 'syncing',
      endpointName: chosen.name,
      message: `Syncing archive with ${chosen.name}...`,
    });

    const syncRes = await syncCorpusWithEndpoint({
      catalogRuns: runs,
      investigations,
      literatureChunksCount,
      config: {
        baseUrl: chosen.baseUrl,
        apiKeyHeader: chosen.apiKeyHeader,
        apiKeyValue: chosen.apiKeyValue,
        modelId: chosen.modelId,
      },
      endpointName: chosen.name,
    });
    setEndpointSyncNotice(syncRes);
    onEndpointSyncedOrProfileChanged?.();
  };

  const handleMarkHelpful = async (msg: AssistantMessage) => {
    const res = await submitModelFeedback({
      kind: 'helpful',
      messageId: msg.id,
    });
    setUserProfile(getOrCreateUserProfile());
    onMarkMessageFeedback?.(msg.id, 'helpful');
    setFeedbackNotices((prev) => ({ ...prev, [msg.id]: res.message }));
  };

  const handleSubmitCorrection = async (
    msg: AssistantMessage,
    originQuestion: string
  ) => {
    const trimmedNote = correctionNoteInput.trim();
    if (!trimmedNote || isSubmittingFeedback) return;
    setIsSubmittingFeedback(true);

    const parsedSpread = Number(correctionSpreadInput);
    const hasSpread =
      correctionSpreadInput.trim() !== '' && Number.isFinite(parsedSpread);

    const res = await submitModelFeedback({
      kind: 'corrected',
      messageId: msg.id,
      question: originQuestion,
      material: virtualConfig.material,
      O2_pct: virtualConfig.O2_pct,
      P_psi: virtualConfig.P_psi,
      Flow_ms: virtualConfig.Flow_ms,
      g_eff: virtualConfig.g_eff,
      Thickness_mm: virtualConfig.Thickness_mm,
      predictedSpread_mms: simulation.flameSpread_mms,
      correctedSpread_mms: hasSpread ? parsedSpread : undefined,
      correctedOutcome: correctionOutcomeInput || undefined,
      correctionNote: trimmedNote,
    });

    setCorrectionCount(getVerifiedCorrections().length);
    setUserProfile(getOrCreateUserProfile());
    onMarkMessageFeedback?.(msg.id, 'corrected');
    onEndpointSyncedOrProfileChanged?.();
    setFeedbackNotices((prev) => ({ ...prev, [msg.id]: res.message }));
    setEditingCorrectionMsgId(null);
    setCorrectionNoteInput('');
    setCorrectionSpreadInput('');
    setCorrectionOutcomeInput('');
    setIsSubmittingFeedback(false);
  };

  return (
    <div
      className={`flex rounded-[8px] border overflow-hidden h-[calc(100vh-88px)] min-h-[600px] ${surfaceShell}`}
    >
      {/* Left Collapsible Chat History Drawer (240px inside Model Console) */}
      {isHistoryOpen && (
        <aside
          aria-label="Chat History"
          className={`w-[240px] shrink-0 border-r flex flex-col ${drawerSurface}`}
        >
          <div className="p-3 border-b border-[#E4E4E7] dark:border-[#27272A] flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setOpenMenu(null);
                onCreateNewThread();
              }}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-sans font-semibold rounded-lg border shadow-xs transition-all cursor-pointer ${primaryBtn}`}
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>+ New Chat</span>
            </button>

            <button
              type="button"
              onClick={() => setIsHistoryOpen(false)}
              title="Collapse Chat History"
              aria-label="Collapse Chat History"
              className={`p-2 rounded-lg border cursor-pointer ${secondaryBtn}`}
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <div className="px-2 py-1 text-[10px] font-sans font-semibold uppercase tracking-wider text-zinc-500">
              Saved Conversations ({threads.length})
            </div>

            {threads.length === 0 ? (
              <div className="px-2.5 py-4 text-xs font-sans text-zinc-500 leading-relaxed">
                Start a conversation to save your questions, data chips, and charts locally.
              </div>
            ) : (
              threads.map((thread) => {
                const isActive = thread.id === activeThreadId;
                const isEditing = editingThreadId === thread.id;
                return (
                  <div
                    key={thread.id}
                    className={`group relative rounded-md border transition-colors ${
                      isActive
                        ? isDark
                          ? 'bg-[#18181B] border-zinc-600 text-[#FAFAFA]'
                          : 'bg-white border-zinc-400 text-[#18181B] shadow-2xs'
                        : 'border-transparent hover:bg-zinc-200/60 dark:hover:bg-zinc-900/70'
                    }`}
                  >
                    {isEditing ? (
                      <div className="p-1.5 flex items-center gap-1">
                        <input
                          type="text"
                          autoFocus
                          value={editingTitleValue}
                          onChange={(e) => setEditingTitleValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCommitRename(thread.id);
                            if (e.key === 'Escape') setEditingThreadId(null);
                          }}
                          className={`flex-1 min-w-0 px-2 py-1 text-xs font-sans rounded-[4px] border outline-none ${surfaceShell}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleCommitRename(thread.id)}
                          aria-label="Save thread title"
                          className={`p-1 rounded-[4px] border cursor-pointer ${primaryBtn}`}
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-1 px-2.5 py-2">
                        <button
                          type="button"
                          onClick={() => onSelectThread(thread.id)}
                          className="flex-1 min-w-0 text-left cursor-pointer"
                        >
                          <div className="text-xs font-sans font-medium truncate">
                            {thread.title}
                          </div>
                          <div className="text-[10px] font-mono tabular-nums text-zinc-500 mt-0.5">
                            {thread.updatedAt} · {thread.messages.length} msgs
                          </div>
                        </button>

                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingThreadId(thread.id);
                              setEditingTitleValue(thread.title);
                            }}
                            title="Rename conversation"
                            aria-label="Rename conversation"
                            className="p-1 rounded-[4px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteThread(thread.id);
                            }}
                            title="Delete conversation"
                            aria-label="Delete conversation"
                            className="p-1 rounded-[4px] text-zinc-500 hover:text-[#EF4444] cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* Main Right Conversational Workspace Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean Minimal Workspace Sub-Header (NO standalone API Config button) */}
        <div className="px-4 sm:px-5 py-2.5 border-b border-[#E4E4E7] dark:border-[#27272A] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {!isHistoryOpen && (
              <button
                type="button"
                onClick={() => setIsHistoryOpen(true)}
                title="Open Chat History"
                aria-label="Open Chat History"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium rounded-md border cursor-pointer ${secondaryBtn}`}
              >
                <PanelLeftOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">History</span>
              </button>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-sm font-semibold tracking-tight truncate">
                Model Console
              </h1>
              <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 truncate">
                Active chamber: {virtualConfig.material} ·{' '}
                <span className="font-mono tabular-nums">
                  {virtualConfig.O2_pct.toFixed(1)}% O2
                </span>{' '}
                ·{' '}
                <span className="font-mono tabular-nums">
                  {virtualConfig.Flow_ms.toFixed(2)} m/s
                </span>{' '}
                ·{' '}
                <span className="font-mono tabular-nums">
                  {simulation.flameSpread_mms.toFixed(2)} mm/s
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs font-sans text-zinc-600 dark:text-zinc-300 shrink-0">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-[2px] ${
                  activeProfile
                    ? isDark
                      ? 'bg-[#FAFAFA]'
                      : 'bg-[#18181B]'
                    : 'bg-[#10B981]'
                }`}
              />
              <span className="font-medium">
                {activeProfile ? activeProfile.name : 'Local Combustion Model'}
              </span>
              {endpointSyncNotice && (
                <span className="text-[11px] font-sans text-zinc-500">
                  ·{' '}
                  {endpointSyncNotice.status === 'syncing'
                    ? 'Syncing...'
                    : endpointSyncNotice.status === 'synced'
                    ? 'Synced'
                    : endpointSyncNotice.status === 'offline-fallback'
                    ? 'Offline Fallback'
                    : 'Offline'}
                </span>
              )}
            </span>
            <span className="hidden md:inline text-zinc-400">·</span>
            <span className="hidden md:inline text-[11px] text-zinc-500">
              {activeResearcherLabel ?? userProfile.researcherId} · {correctionCount} corrections ·{' '}
              <span className="font-mono tabular-nums">{totalRunsCount.toLocaleString()}</span>{' '}
              runs
            </span>

            <ExportDropdown
              theme={theme}
              label="Export Chat"
              formats={['doc', 'pdf', 'md', 'json']}
              defaultFormat={defaultExportFormat}
              disabled={!activeThread}
              title="Download active chat conversation as Word, PDF, Markdown, or JSON"
              onSelectFormat={(fmt) =>
                exportChatThreadFormatted({
                  thread: activeThread,
                  virtualConfig,
                  simulation,
                  units: measurementUnits,
                  format: fmt,
                })
              }
            />
          </div>
        </div>

        {/* Main Scrollable Message Stream (Top / Center) */}
        <div
          ref={messageStreamRef}
          className="flex-1 overflow-y-auto px-3 sm:px-6 py-5"
        >
          {messages.length === 0 && !isRunningInference ? (
            <div className="h-full max-w-3xl mx-auto flex flex-col items-center justify-center text-center py-6 space-y-6">
              <div className="space-y-2 max-w-xl">
                <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
                  Model Console — Ask about flight runs, fire behavior, or safety limits
                </h2>
                <p className="text-xs sm:text-sm font-sans text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Attach Virtual Test Lab telemetry or PSI flight experiments below, pick any chart type or leave on Auto, and explore interactive results in plain English.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full text-left">
                {adaptedStarterCards.map((card) => (
                  <button
                    key={card.title}
                    type="button"
                    disabled={isRunningInference}
                    onClick={() => {
                      onChangeMode(card.mode);
                      onSubmitInference({
                        promptText: card.prompt,
                        mode: card.mode,
                        attachments: [...attachments],
                        vizOutput,
                        chartContextOverride: activeChartContext,
                      });
                    }}
                    className={`p-3.5 rounded-lg border flex flex-col justify-between gap-2 transition-all hover:-translate-y-0.5 cursor-pointer ${secondaryBtn}`}
                  >
                    <div className="space-y-1">
                      <div className="text-xs font-display font-semibold">
                        {card.title}
                      </div>
                      <p className="text-xs font-sans text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        {card.prompt}
                      </p>
                    </div>
                    <div className="text-[11px] font-sans text-zinc-500 pt-1 border-t border-[#E4E4E7] dark:border-[#27272A]">
                      {card.hint}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-5">
              {messages.map((msg, msgIndex) => {
                const isUser = msg.role === 'user';

                if (isUser) {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div
                        className={`max-w-[85%] sm:max-w-[74%] px-4 py-3 rounded-xl border space-y-2 shadow-xs ${
                          isDark
                            ? 'bg-[#27272A] border-[#3F3F46] text-[#FAFAFA]'
                            : 'bg-[#18181B] border-[#18181B] text-[#FFFFFF]'
                        }`}
                      >
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pb-1">
                            {msg.attachments.map((att) => (
                              <span
                                key={att.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-sans font-medium rounded-[4px] bg-white/12 text-zinc-100 border border-white/15"
                              >
                                <Database className="w-2.5 h-2.5" />
                                <span>{att.label}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs sm:text-sm font-sans leading-relaxed whitespace-pre-wrap">
                          {msg.text}
                        </p>
                        <div className="text-[10px] font-mono tabular-nums text-zinc-300/75 text-right">
                          {msg.timestamp}
                        </div>
                      </div>
                    </div>
                  );
                }

                const originPrompt = findPrecedingUserPrompt(msgIndex);

                return (
                  <div key={msg.id} className="flex justify-start">
                    <article
                      className={`w-full max-w-[96%] sm:max-w-[90%] p-4 rounded-xl border space-y-3.5 ${subtleSurface}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E4E4E7] dark:border-[#27272A]">
                        <div className="flex items-center gap-2 text-xs font-display font-semibold">
                          <span>Combustion Model</span>
                          <span className="inline-flex items-center gap-1.5 font-sans text-[11px] font-normal text-zinc-500">
                            <span className="w-1.5 h-1.5 rounded-[2px] bg-[#10B981]" />
                            <span>
                              {msg.endpointLabel ?? 'Local Combustion Model'}
                            </span>
                          </span>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                          {msg.timestamp}
                        </span>
                      </div>

                      {/* Structured Plain-English Engineering Steps */}
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
                        <div className="overflow-x-auto border rounded-md border-[#E4E4E7] dark:border-[#27272A]">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr
                                className={`border-b font-sans text-[11px] font-semibold text-zinc-500 ${
                                  isDark
                                    ? 'bg-[#121215] border-[#27272A]'
                                    : 'bg-zinc-100/70 border-[#E4E4E7]'
                                }`}
                              >
                                <th className="py-2 px-3">Scenario</th>
                                <th className="py-2 px-3">Material</th>
                                <th className="py-2 px-3 text-right">O2 %</th>
                                <th className="py-2 px-3 text-right">Flow</th>
                                <th className="py-2 px-3 text-right">Thick</th>
                                <th className="py-2 px-3 text-right">Spread</th>
                                <th className="py-2 px-3 text-right">Safe Min</th>
                                <th className="py-2 px-3">Safety Result</th>
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
                                              ignitionFlux_Wm2:
                                                row.ignitionFlux_Wm2,
                                            },
                                            rowKey
                                          )
                                        }
                                        className={`px-2.5 py-1 text-[11px] font-sans font-medium rounded-md border cursor-pointer ${secondaryBtn}`}
                                      >
                                        {appliedMsgId === rowKey
                                          ? 'Loaded'
                                          : 'Load'}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Embedded Interactive Chart / Compatibility Fallback */}
                      {msg.inlineChart && (
                        <ChatInlineChartCard
                          theme={theme}
                          inlineChart={msg.inlineChart}
                          sliders={virtualConfig}
                          simulation={simulation}
                          selectedRuns={selectedRuns}
                          catalogRuns={runs}
                          onInspectRun={onOpenInvestigation}
                          onChangeSlider={onChangeSlider}
                          onOpenInVisualStudio={onOpenInVisualStudio}
                          onRetryWithChartMode={(altViz) =>
                            handleRetryWithChartMode(
                              originPrompt.text,
                              originPrompt.attachments,
                              altViz
                            )
                          }
                        />
                      )}

                      {/* Adaptive Calibration Summary Line */}
                      {msg.adaptiveNote && (
                        <div className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                          {msg.adaptiveNote}
                        </div>
                      )}

                      {/* Citations & Action Footer */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E4E4E7] dark:border-[#27272A]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-sans text-zinc-500 mr-1">
                            Citations:
                          </span>
                          {(msg.citations ?? []).map((citeId) => (
                            <button
                              key={citeId}
                              type="button"
                              onClick={() => onOpenInvestigation(citeId)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-medium rounded-md border cursor-pointer ${secondaryBtn}`}
                              title={`Open ${citeId} Investigation Details`}
                            >
                              <span>{citeId}</span>
                              <ArrowUpRight className="w-3 h-3 opacity-70" />
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleMarkHelpful(msg)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans font-medium rounded-lg border cursor-pointer ${
                              msg.feedbackStatus === 'helpful'
                                ? 'border-[#10B981] text-[#10B981]'
                                : secondaryBtn
                            }`}
                          >
                            <ThumbsUp className="w-3 h-3" />
                            <span>
                              {msg.feedbackStatus === 'helpful'
                                ? 'Helpful Saved'
                                : 'Helpful'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingCorrectionMsgId((prev) =>
                                prev === msg.id ? null : msg.id
                              );
                              setCorrectionNoteInput('');
                              setCorrectionSpreadInput('');
                              setCorrectionOutcomeInput('');
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-sans font-medium rounded-lg border cursor-pointer ${
                              msg.feedbackStatus === 'corrected'
                                ? 'border-[#F59E0B] text-[#F59E0B]'
                                : secondaryBtn
                            }`}
                          >
                            <MessageSquareWarning className="w-3 h-3" />
                            <span>
                              {msg.feedbackStatus === 'corrected'
                                ? 'Corrected'
                                : 'Correct / Teach Model'}
                            </span>
                          </button>

                          {msg.recommendedParams && (
                            <button
                              type="button"
                              onClick={() =>
                                handleApplyParams(msg.recommendedParams!, msg.id)
                              }
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-semibold rounded-lg border cursor-pointer ${primaryBtn}`}
                            >
                              {appliedMsgId === msg.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Applied to Virtual Test Lab</span>
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
                      </div>

                      {/* Subtle Feedback Confirmation Text */}
                      {feedbackNotices[msg.id] && (
                        <div className="text-[11px] font-sans text-[#10B981]">
                          {feedbackNotices[msg.id]}
                        </div>
                      )}

                      {/* Compact Inline Correction Form */}
                      {editingCorrectionMsgId === msg.id && (
                        <div
                          className={`p-3 rounded-lg border space-y-2.5 ${
                            isDark
                              ? 'bg-[#09090B]/70 border-[#27272A]'
                              : 'bg-zinc-50 border-[#E4E4E7]'
                          }`}
                        >
                          <div className="text-xs font-display font-semibold">
                            Teach Model Verified Physics Correction ({virtualConfig.material} ·{' '}
                            {virtualConfig.O2_pct.toFixed(1)}% O2 · {virtualConfig.P_psi.toFixed(1)} psi)
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={correctionSpreadInput}
                              onChange={(e) => setCorrectionSpreadInput(e.target.value)}
                              placeholder="Verified spread rate mm/s (optional)"
                              className={`px-2.5 py-1.5 text-xs font-mono rounded-[4px] border outline-none ${surfaceShell}`}
                            />
                            <select
                              value={correctionOutcomeInput}
                              onChange={(e) =>
                                setCorrectionOutcomeInput(
                                  e.target.value as '' | HazardOutcome
                                )
                              }
                              className={`px-2.5 py-1.5 text-xs font-sans rounded-[4px] border outline-none ${surfaceShell}`}
                            >
                              <option value="">Keep safety classification</option>
                              <option value="Self-Extinguishing">Self-Extinguishing</option>
                              <option value="Cool Flame Caution">Cool Flame Caution</option>
                              <option value="Rapid Flame Spread">Rapid Flame Spread</option>
                            </select>
                          </div>
                          <input
                            type="text"
                            value={correctionNoteInput}
                            onChange={(e) => setCorrectionNoteInput(e.target.value)}
                            placeholder="Enter verified value, material behavior, or lab correction note..."
                            className={`w-full px-2.5 py-1.5 text-xs font-sans rounded-[4px] border outline-none ${surfaceShell}`}
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingCorrectionMsgId(null)}
                              className={`px-2.5 py-1 text-xs font-sans rounded-lg border cursor-pointer ${secondaryBtn}`}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={!correctionNoteInput.trim() || isSubmittingFeedback}
                              onClick={() =>
                                void handleSubmitCorrection(msg, originPrompt.text)
                              }
                              className={`px-3 py-1 text-xs font-sans font-semibold rounded-lg border cursor-pointer disabled:opacity-45 ${primaryBtn}`}
                            >
                              {isSubmittingFeedback ? 'Saving...' : 'Save Correction'}
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  </div>
                );
              })}

              {isRunningInference && (
                <div className="flex justify-start">
                  <div
                    className={`px-4 py-3 rounded-xl border text-xs font-sans text-zinc-500 flex items-center gap-2 ${subtleSurface}`}
                  >
                    <span className="w-2 h-2 rounded-[2px] bg-[#10B981] animate-pulse" />
                    <span>Running combustion model calculation...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Bottom Gemini-Style Composer Bar */}
        <div className="shrink-0 px-3 sm:px-6 pb-4 pt-2">
          <div className="max-w-4xl mx-auto relative" ref={composerToolbarRef}>
            {voiceNotice && (
              <div
                className={`mb-2 px-3 py-2 rounded-lg border text-xs font-sans flex items-center justify-between gap-2 ${subtleSurface}`}
              >
                <span>{voiceNotice}</span>
                <button
                  type="button"
                  onClick={() => setVoiceNotice(null)}
                  aria-label="Dismiss voice notice"
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Upward Menu 1: "+" Attach Workspace Data */}
            {openMenu === 'attach' && (
              <div
                role="dialog"
                aria-label="Attach Workspace Data or PSI Investigation"
                className={`absolute left-0 bottom-full mb-2 w-[330px] sm:w-[390px] rounded-xl border shadow-xl p-3.5 z-40 space-y-3 ${surfaceShell}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-display text-xs font-semibold">
                    Attach Workspace Data to Prompt
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenMenu(null)}
                    aria-label="Close attach menu"
                    className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  {[
                    {
                      id: 'attach-virtual-lab',
                      kind: 'virtual-lab' as const,
                      label: 'Virtual Test Lab Current Run',
                      sublabel: `${virtualConfig.material} · ${virtualConfig.O2_pct.toFixed(1)}% O2 · ${simulation.flameSpread_mms.toFixed(2)} mm/s`,
                      icon: <Sliders className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'attach-comparator',
                      kind: 'comparator-runs' as const,
                      label: 'Run Comparator Staged Runs',
                      sublabel:
                        selectedRuns.length > 0
                          ? `${selectedRuns.length} staged runs (${selectedRuns.map((r) => r.psiId).join(', ')})`
                          : 'No runs currently staged in Comparator',
                      icon: <GitBranch className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'attach-visual-studio',
                      kind: 'visual-studio' as const,
                      label: 'Visual Analytics Studio Active View',
                      sublabel: studioTechniqueLabel,
                      icon: <BarChart3 className="w-3.5 h-3.5" />,
                    },
                  ].map((item) => {
                    const active = attachments.some((a) => a.id === item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          toggleWorkspaceAttachment({
                            id: item.id,
                            kind: item.kind,
                            label: item.label,
                            sublabel: item.sublabel,
                          })
                        }
                        className={`w-full px-2.5 py-2 rounded-md border flex items-center justify-between gap-2 text-left cursor-pointer ${
                          active ? primaryBtn : secondaryBtn
                        }`}
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="mt-0.5 shrink-0">{item.icon}</span>
                          <div className="min-w-0">
                            <div className="text-xs font-sans font-medium truncate">
                              {item.label}
                            </div>
                            <div
                              className={`text-[10px] font-sans truncate ${
                                active ? 'opacity-80' : 'text-zinc-500'
                              }`}
                            >
                              {item.sublabel}
                            </div>
                          </div>
                        </div>
                        {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Search & Attach Specific PSI Investigation / Run ID */}
                <div className="pt-2 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={psiSearchQuery}
                      onChange={(e) => setPsiSearchQuery(e.target.value)}
                      placeholder="Attach PSI-99, PSI-25, SAFFIRE, FLEX..."
                      className={`w-full pl-8 pr-3 py-1.5 text-xs font-sans rounded-md border outline-none ${subtleSurface}`}
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {searchablePsiItems.map((item) => {
                      const attachId = `attach-psi-${item.id}`;
                      const attached = attachments.some((a) => a.id === attachId);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            toggleWorkspaceAttachment({
                              id: attachId,
                              kind: 'psi-investigation',
                              label: item.title,
                              sublabel: item.sub,
                              psiId: item.psiId,
                              runId: item.runId,
                            })
                          }
                          className={`w-full px-2.5 py-1.5 rounded-md border flex items-center justify-between gap-2 text-left text-xs cursor-pointer ${
                            attached ? primaryBtn : secondaryBtn
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] font-semibold truncate">
                              {item.title}
                            </div>
                            <div
                              className={`text-[10px] font-sans truncate ${
                                attached ? 'opacity-80' : 'text-zinc-500'
                              }`}
                            >
                              {item.sub}
                            </div>
                          </div>
                          {attached ? (
                            <Check className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <Plus className="w-3.5 h-3.5 shrink-0 opacity-70" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Upward Menu 2: Visualization Output Selector (Auto, None, 25 Techniques) */}
            {openMenu === 'viz' && (
              <div
                role="dialog"
                aria-label="Visualization Output Mode"
                className={`absolute left-12 bottom-full mb-2 w-[310px] sm:w-[360px] rounded-xl border shadow-xl p-3 z-40 space-y-2.5 ${surfaceShell}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-display text-xs font-semibold">
                    Inline Chart Output (25 Techniques)
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenMenu(null)}
                    aria-label="Close chart selector"
                    className="text-zinc-400 hover:text-zinc-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setVizOutput('auto');
                      setOpenMenu(null);
                    }}
                    className={`px-2.5 py-2 text-xs font-sans font-medium rounded-md border text-left cursor-pointer ${
                      vizOutput === 'auto' ? primaryBtn : secondaryBtn
                    }`}
                  >
                    Chart: Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVizOutput('none');
                      setOpenMenu(null);
                    }}
                    className={`px-2.5 py-2 text-xs font-sans font-medium rounded-md border text-left cursor-pointer ${
                      vizOutput === 'none' ? primaryBtn : secondaryBtn
                    }`}
                  >
                    None (Text Only)
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={vizSearchQuery}
                    onChange={(e) => setVizSearchQuery(e.target.value)}
                    placeholder="Filter 25 chart types (heatmap, scatter, bar...)"
                    className={`w-full pl-8 pr-3 py-1.5 text-xs font-sans rounded-md border outline-none ${subtleSurface}`}
                  />
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2 pr-0.5">
                  {VIZ_FAMILIES.map((fam) => {
                    const familyTechs = filteredVizRegistry.filter(
                      (t) => t.familyId === fam.id
                    );
                    if (familyTechs.length === 0) return null;
                    return (
                      <div key={fam.id} className="space-y-1">
                        <div className="px-1 text-[10px] font-sans font-semibold uppercase tracking-wider text-zinc-500">
                          {fam.shortLabel}
                        </div>
                        {familyTechs.map((tech) => {
                          const selected = vizOutput === tech.id;
                          return (
                            <button
                              key={tech.id}
                              type="button"
                              onClick={() => {
                                setVizOutput(tech.id);
                                setOpenMenu(null);
                              }}
                              className={`w-full px-2.5 py-1.5 rounded-md border flex items-center justify-between gap-2 text-left text-xs font-sans cursor-pointer ${
                                selected ? primaryBtn : secondaryBtn
                              }`}
                            >
                              <span className="truncate">{tech.name}</span>
                              {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Upward Menu 3: Model / API Endpoint Selector */}
            {openMenu === 'model' && (
              <div
                role="dialog"
                aria-label="Model and API Endpoint Selector"
                className={`absolute right-0 bottom-full mb-2 w-[290px] sm:w-[320px] rounded-xl border shadow-xl p-2.5 z-40 space-y-1.5 ${surfaceShell}`}
              >
                <div className="px-1.5 py-1 text-[10px] font-sans font-semibold uppercase tracking-wider text-zinc-500">
                  Select Inference Model / Endpoint
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void handleSelectModelProfileWithSync(LOCAL_MODEL_ID);
                  }}
                  className={`w-full px-2.5 py-2 rounded-md border flex items-center justify-between gap-2 text-left cursor-pointer ${
                    activeProfileId === LOCAL_MODEL_ID
                      ? primaryBtn
                      : secondaryBtn
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-sans font-semibold">
                      Local Combustion Model
                    </div>
                    <div
                      className={`text-[10px] font-sans ${
                        activeProfileId === LOCAL_MODEL_ID
                          ? 'opacity-80'
                          : 'text-zinc-500'
                      }`}
                    >
                      Built-in offline engine · Zero API key needed
                    </div>
                  </div>
                  {activeProfileId === LOCAL_MODEL_ID && (
                    <Check className="w-3.5 h-3.5 shrink-0" />
                  )}
                </button>

                {apiProfiles.map((profile) => {
                  const selected = activeProfileId === profile.id;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => {
                        void handleSelectModelProfileWithSync(profile.id);
                      }}
                      className={`w-full px-2.5 py-2 rounded-md border flex items-center justify-between gap-2 text-left cursor-pointer ${
                        selected ? primaryBtn : secondaryBtn
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-sans font-semibold truncate">
                          <Server className="w-3 h-3 shrink-0" />
                          <span className="truncate">{profile.name}</span>
                        </div>
                        <div
                          className={`text-[10px] font-mono truncate ${
                            selected ? 'opacity-80' : 'text-zinc-500'
                          }`}
                        >
                          {profile.baseUrl}
                        </div>
                      </div>
                      {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}

                {/* Reply Detail Depth right inside Composer Model Dropdown */}
                <div className="pt-2 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-1.5">
                  <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-zinc-500 px-1">
                    Reply Detail Depth
                  </div>
                  <div
                    className={`grid grid-cols-3 gap-1 p-1 rounded-md border ${
                      isDark
                        ? 'bg-[#09090B] border-[#27272A]'
                        : 'bg-zinc-100 border-[#E4E4E7]'
                    }`}
                    role="group"
                    aria-label="Reply Detail Depth"
                  >
                    {(
                      [
                        { id: 'concise', label: 'Brief' },
                        { id: 'standard', label: 'Standard' },
                        { id: 'detailed', label: 'Deep' },
                      ] as Array<{ id: ExplanationDepth; label: string }>
                    ).map((opt) => {
                      const active = userProfile.explanationDepth === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleDepthSelect(opt.id)}
                          className={`px-2 py-1 text-[11px] font-sans font-medium rounded-[4px] transition-colors cursor-pointer ${
                            active
                              ? primaryBtn
                              : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-1 border-t border-[#E4E4E7] dark:border-[#27272A]">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      setIsApiModalOpen(true);
                    }}
                    className={`w-full px-2.5 py-2 rounded-md border flex items-center gap-2 text-xs font-sans font-medium cursor-pointer ${secondaryBtn}`}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>API Settings...</span>
                  </button>
                </div>
              </div>
            )}

            {/* Gemini-Style Floating rounded-2xl Composer Box */}
            <form
              onSubmit={handleSubmit}
              className={`rounded-2xl border shadow-md p-3 space-y-2 transition-colors ${
                isDark
                  ? 'bg-[#18181B] border-[#27272A] focus-within:border-zinc-500'
                  : 'bg-[#FFFFFF] border-[#D4D4D8] focus-within:border-zinc-500'
              }`}
            >
              {/* Top Row Inside Composer: Removable Attached Data Chips */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1 border-b border-[#E4E4E7] dark:border-[#27272A]">
                  {attachments.map((att) => (
                    <span
                      key={att.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-sans font-medium rounded-md border ${subtleSurface}`}
                    >
                      <Database className="w-3 h-3 text-[#10B981] shrink-0" />
                      <span className="truncate max-w-[220px]">{att.label}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        aria-label={`Remove ${att.label}`}
                        className="text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Middle Auto-Expanding Textarea */}
              <div className="px-1">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="Ask the combustion model... Press Enter to send, Shift+Enter for new line"
                  aria-label="Model Console Question Input"
                  className="w-full min-h-[48px] max-h-[168px] py-1.5 text-xs sm:text-sm font-sans bg-transparent outline-none resize-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                />
              </div>

              {/* Bottom Composer Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {/* Left Controls: "+" Attach Workspace Data + Visualization Output Dropdown */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMenu((prev) => (prev === 'attach' ? null : 'attach'))
                    }
                    aria-expanded={openMenu === 'attach'}
                    title="Attach Virtual Lab, Comparator, Studio view, or PSI Investigation"
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-sans font-medium rounded-lg border cursor-pointer ${
                      openMenu === 'attach' ? primaryBtn : secondaryBtn
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Attach</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setOpenMenu((prev) => (prev === 'viz' ? null : 'viz'))
                    }
                    aria-expanded={openMenu === 'viz'}
                    title="Choose chart generation mode for replies"
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-sans font-medium rounded-lg border cursor-pointer ${
                      openMenu === 'viz' ? primaryBtn : secondaryBtn
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate max-w-[145px]">
                      {selectedVizLabel}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-70" />
                  </button>
                </div>

                {/* Right Controls: Model/API Selector + Voice Dictate Mic + Send */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMenu((prev) => (prev === 'model' ? null : 'model'))
                    }
                    aria-expanded={openMenu === 'model'}
                    title="Switch inference model or configure API Settings"
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-sans font-medium rounded-lg border cursor-pointer ${
                      openMenu === 'model' ? primaryBtn : secondaryBtn
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate max-w-[155px]">
                      {activeProfile
                        ? activeProfile.name
                        : 'Local Combustion Model'}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-70" />
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleDictation}
                    aria-pressed={isDictating}
                    title={
                      isDictating
                        ? 'Stop voice dictation'
                        : 'Dictate question using microphone'
                    }
                    aria-label={
                      isDictating ? 'Stop voice dictation' : 'Voice dictate'
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-sans font-medium rounded-lg border cursor-pointer ${
                      isDictating
                        ? 'border-[#EF4444] bg-[#EF4444]/10 text-[#EF4444]'
                        : secondaryBtn
                    }`}
                  >
                    {isDictating ? (
                      <>
                        <span className="w-2 h-2 rounded-[2px] bg-[#EF4444] animate-pulse" />
                        <MicOff className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Listening</span>
                      </>
                    ) : (
                      <Mic className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isRunningInference}
                    aria-label="Send message"
                    title="Send message"
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border cursor-pointer disabled:opacity-40 transition-all ${primaryBtn}`}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Multi-API Key & Remote Endpoint Modal */}
      <ApiSettingsModal
        theme={theme}
        isOpen={isApiModalOpen}
        profiles={apiProfiles}
        activeProfileId={activeProfileId}
        catalogRuns={runs}
        investigations={investigations}
        literatureChunksCount={literatureChunksCount}
        onClose={() => setIsApiModalOpen(false)}
        onProfilesUpdated={(nextProfiles, nextActiveId) => {
          setApiProfiles(nextProfiles);
          setActiveProfileIdState(nextActiveId);
          onEndpointSyncedOrProfileChanged?.();
        }}
        onSyncCompleted={(syncState) => {
          setEndpointSyncNotice(syncState);
          onEndpointSyncedOrProfileChanged?.();
        }}
      />
    </div>
  );
};
