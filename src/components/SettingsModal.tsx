import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  Copy,
  Database,
  Download,
  Keyboard,
  Lock,
  LogOut,
  Palette,
  RotateCcw,
  Server,
  Sliders,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  AccountSession,
  AppSettings,
  ContrastMode,
  DefaultExportFormat,
  DefaultStartingWorkspace,
  FontFamilyId,
  FontSizePx,
  MeasurementUnits,
  PsiRun,
  ThemeMode,
  ThemePresetId,
  ThemeSetting,
} from '../types/psi';
import {
  FONT_FAMILY_OPTIONS,
  getPresetDefinition,
  normalizeHexColor,
  THEME_PRESETS,
} from '../utils/themePreferences';
import { generateResearcherIdFromName } from '../services/accountSession';
import {
  buildLearnedProfileBundle,
  getVerifiedCorrections,
} from '../services/userAdaptation';
import { triggerFileDownload } from '../utils/exportHelpers';
import { StudioSelect } from './StudioSelect';
import {
  getGeminiApiKey,
  getLiveBackendUrl,
  hasCustomGeminiApiKey,
  normalizeUrl,
  resetGeminiApiKey,
  resetLiveBackendUrl,
  setGeminiApiKey,
  setLiveBackendUrl,
  testFlareApiConnection,
} from '../lib/flareApi';

export type SettingsTabId =
  | 'general'
  | 'profile'
  | 'appearance'
  | 'shortcuts'
  | 'account';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: AccountSession | null;
  resolvedTheme: ThemeMode;
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  initialEmail: string;
  initialBio: string;
  onSaveProfileDetails: (updates: {
    fullName: string;
    email: string;
    bio: string;
  }) => void;
  savedChatsCount: number;
  customRuns: PsiRun[];
  onClearChatHistory: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  session,
  resolvedTheme,
  settings,
  onUpdateSettings,
  initialEmail,
  initialBio,
  onSaveProfileDetails,
  savedChatsCount,
  customRuns,
  onClearChatHistory,
  onSignOut,
  onDeleteAccount,
}) => {
  const isDark = resolvedTheme === 'dark';
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');

  // Profile Tab Local Form
  const [fullNameDraft, setFullNameDraft] = useState(
    session?.mode === 'named' ? session.fullName : ''
  );
  const [emailDraft, setEmailDraft] = useState(initialEmail);
  const [bioDraft, setBioDraft] = useState(initialBio);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  // Appearance Hex Draft Inputs
  const activePreset = getPresetDefinition(settings.presetId);
  const polarityTokens =
    resolvedTheme === 'dark' ? activePreset.dark : activePreset.light;
  const effectiveBg =
    settings.customColors.background || polarityTokens.bg;
  const effectiveFg =
    settings.customColors.foreground || polarityTokens.fg;
  const effectiveAccent =
    settings.customColors.accent || polarityTokens.accent;

  const [bgHexDraft, setBgHexDraft] = useState(effectiveBg);
  const [fgHexDraft, setFgHexDraft] = useState(effectiveFg);
  const [accentHexDraft, setAccentHexDraft] = useState(effectiveAccent);

  // Live Backend Endpoint URL & Gemini API Key state (general tab)
  const [backendUrlDraft, setBackendUrlDraft] = useState(getLiveBackendUrl());
  const [isTestingBackend, setIsTestingBackend] = useState(false);
  const [backendStatusInfo, setBackendStatusInfo] = useState<{
    ok: boolean;
    statusText: string;
    badgeLabel: string;
    latencyMs?: number;
  }>({
    ok: false,
    statusText: 'Local Mode',
    badgeLabel: 'Local Mode',
  });
  const [geminiKeyDraft, setGeminiKeyDraft] = useState(() =>
    hasCustomGeminiApiKey() ? getGeminiApiKey() : ''
  );
  const [geminiKeyNotice, setGeminiKeyNotice] = useState<string | null>(null);
  const hasAnyGeminiKey = Boolean(getGeminiApiKey());

  // Account & Memory Tab Feedback / Confirmations
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [copiedResearcherId, setCopiedResearcherId] = useState(false);

  const handleCopyResearcherId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedResearcherId(true);
    setTimeout(() => setCopiedResearcherId(false), 1800);
  };
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFullNameDraft(session?.mode === 'named' ? session.fullName : '');
    setEmailDraft(initialEmail);
    setBioDraft(initialBio);
    setProfileNotice(null);
    setAccountNotice(null);
    setConfirmDeleteOpen(false);
    const activeUrl = getLiveBackendUrl();
    setBackendUrlDraft(activeUrl);
    setGeminiKeyDraft(hasCustomGeminiApiKey() ? getGeminiApiKey() : '');
    setGeminiKeyNotice(null);
    void testFlareApiConnection(activeUrl).then(setBackendStatusInfo);
  }, [isOpen, session, initialEmail, initialBio]);

  useEffect(() => {
    setBgHexDraft(effectiveBg);
    setFgHexDraft(effectiveFg);
    setAccentHexDraft(effectiveAccent);
  }, [effectiveBg, effectiveFg, effectiveAccent]);

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isGuest = !session || session.mode === 'guest';
  const liveComputedId =
    fullNameDraft.trim().length > 0
      ? generateResearcherIdFromName(fullNameDraft)
      : session?.researcherId ?? 'GUEST-SESSION';

  const modalSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';
  const sidebarSurface = isDark
    ? 'bg-[#09090B] border-[#27272A]'
    : 'bg-zinc-50 border-[#E4E4E7]';
  const panelBox = isDark
    ? 'bg-[#18181B] border-[#27272A]'
    : 'bg-zinc-50/80 border-[#E4E4E7]';
  const inputSurface = isDark
    ? 'bg-[#09090B] border-[#27272A] text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500'
    : 'bg-white border-[#E4E4E7] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500';
  const activeOptionBtn = isDark
    ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA] font-semibold'
    : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B] font-semibold';
  const inactiveOptionBtn = isDark
    ? 'bg-[#09090B] border-[#27272A] text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600'
    : 'bg-white border-[#E4E4E7] text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300';

  const corrections = getVerifiedCorrections();

  const navItems: Array<{
    id: SettingsTabId;
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'general', label: 'General', icon: Sliders },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
    { id: 'account', label: 'Account & Memory', icon: Database },
  ];

  const handleHexCommit = (
    field: 'background' | 'foreground' | 'accent',
    raw: string
  ) => {
    const valid = normalizeHexColor(raw);
    if (!valid) return;
    onUpdateSettings({
      customColors: {
        ...settings.customColors,
        [field]: valid,
      },
    });
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = fullNameDraft.trim().replace(/\s+/g, ' ');
    if (cleaned.length < 2) {
      setProfileNotice('Enter your full name (at least 2 characters) to save.');
      return;
    }
    onSaveProfileDetails({
      fullName: cleaned,
      email: emailDraft.trim(),
      bio: bioDraft.trim(),
    });
    setProfileNotice(
      `Saved profile for ${cleaned} (${generateResearcherIdFromName(cleaned)}).`
    );
  };

  const handleExportLearnedBundle = () => {
    const bundle = buildLearnedProfileBundle(customRuns, null);
    triggerFileDownload(
      JSON.stringify(bundle, null, 2),
      `psi-profile-${bundle.researcherProfile.researcherId}-${Date.now()}.json`,
      'application/json;charset=utf-8'
    );
    setAccountNotice(
      `Exported profile ${bundle.researcherProfile.researcherId}, ${bundle.verifiedCorrections.length} saved correction(s), and ${bundle.customImportedRuns.length} custom run(s).`
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full max-w-4xl h-[86vh] max-h-[680px] border rounded-xl shadow-2xl flex flex-col overflow-hidden psi-animate-modal ${modalSurface}`}
      >
        {/* Modal Header */}
        <div
          className={`px-5 py-3.5 border-b flex items-center justify-between gap-3 shrink-0 ${
            isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
          }`}
        >
          <div>
            <h2
              id="settings-modal-title"
              className="font-display text-sm sm:text-base font-semibold tracking-tight"
            >
              Workspace Settings
            </h2>
            <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
              {session
                ? isGuest
                  ? 'Guest Session · Temporary browser sandbox'
                  : `${session.fullName} · ${session.researcherId}`
                : 'Local session settings'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${inactiveOptionBtn}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Two-Column Body */}
        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          {/* Left Category Navigation Rail */}
          <nav
            aria-label="Settings Categories"
            className={`sm:w-[210px] shrink-0 border-b sm:border-b-0 sm:border-r p-2.5 flex sm:flex-col gap-1 overflow-x-auto ${sidebarSurface}`}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-sans text-left whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? activeOptionBtn
                      : isDark
                      ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Scrollable Settings Panel */}
          <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-5">
            {activeTab === 'general' && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-display text-sm font-semibold">
                    General Preferences
                  </h3>
                  <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
                    Choose display units, starting screen, and preferred export file format
                  </p>
                </div>

                {/* Measurement Units */}
                <div className={`p-4 rounded-lg border space-y-2.5 ${panelBox}`}>
                  <div>
                    <div className="text-xs font-sans font-semibold">
                      Measurement Units
                    </div>
                    <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                      Formats pressure, temperature, airflow, and flame spread readouts in Virtual Test Lab &amp; Run Comparator
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(
                      [
                        {
                          id: 'spacecraft',
                          title: 'Spacecraft Standard',
                          desc: 'psi · Kelvin (K) · mm/s · m/s',
                        },
                        {
                          id: 'metric-si',
                          title: 'Metric SI',
                          desc: 'kPa · Celsius (°C) · cm/s',
                        },
                      ] as Array<{
                        id: MeasurementUnits;
                        title: string;
                        desc: string;
                      }>
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onUpdateSettings({ units: opt.id })}
                        className={`p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                          settings.units === opt.id
                            ? activeOptionBtn
                            : inactiveOptionBtn
                        }`}
                      >
                        <div className="text-xs font-sans font-semibold">
                          {opt.title}
                        </div>
                        <div
                          className={`text-[11px] font-mono mt-0.5 ${
                            settings.units === opt.id
                              ? 'opacity-85'
                              : 'text-zinc-500'
                          }`}
                        >
                          {opt.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Default Starting Workspace */}
                <div className={`p-4 rounded-lg border space-y-2.5 ${panelBox}`}>
                  <div>
                    <div className="text-xs font-sans font-semibold">
                      Default Starting Workspace
                    </div>
                    <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                      Screen shown right after clicking Open FLARE
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'overview', label: 'Overview' },
                        { id: 'virtual-lab', label: 'Virtual Test Lab' },
                        { id: 'model-console', label: 'Model Console' },
                      ] as Array<{
                        id: DefaultStartingWorkspace;
                        label: string;
                      }>
                    ).map((ws) => (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() =>
                          onUpdateSettings({ defaultWorkspace: ws.id })
                        }
                        className={`px-3 py-2 rounded-lg border text-xs font-sans cursor-pointer transition-colors ${
                          settings.defaultWorkspace === ws.id
                            ? activeOptionBtn
                            : inactiveOptionBtn
                        }`}
                      >
                        {ws.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Default Quick-Export Format */}
                <div className={`p-4 rounded-lg border space-y-2.5 ${panelBox}`}>
                  <div>
                    <div className="text-xs font-sans font-semibold">
                      Default Quick-Export Format
                    </div>
                    <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                      Highlighted default option inside every workspace Export menu
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { id: 'pdf', label: 'PDF (.pdf)' },
                        { id: 'doc', label: 'Word (.doc)' },
                        { id: 'csv', label: 'CSV (.csv)' },
                        { id: 'json', label: 'JSON (.json)' },
                      ] as Array<{
                        id: DefaultExportFormat;
                        label: string;
                      }>
                    ).map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() =>
                          onUpdateSettings({ defaultExportFormat: fmt.id })
                        }
                        className={`px-3 py-2 rounded-lg border text-xs font-sans cursor-pointer transition-colors ${
                          settings.defaultExportFormat === fmt.id
                            ? activeOptionBtn
                            : inactiveOptionBtn
                        }`}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Backend Endpoint URL & Tunnel Override */}
                <div className={`p-4 rounded-lg border space-y-3 ${panelBox}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-sans font-semibold flex items-center gap-2">
                        <Server className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Live Backend Endpoint URL</span>
                      </div>
                      <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Configure the live combustion inference endpoint or Cloudflare tunnel URL
                      </p>
                    </div>

                    {/* Live Status Indicator Badge */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-sans font-medium">
                      <span
                        className={`w-2 h-2 rounded-[2px] shrink-0 ${
                          backendStatusInfo.ok
                            ? 'bg-[#10B981]'
                            : 'bg-zinc-400 dark:bg-zinc-500'
                        }`}
                      />
                      <span
                        className={
                          backendStatusInfo.ok
                            ? 'text-[#10B981]'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }
                      >
                        {backendStatusInfo.statusText}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="url"
                        value={backendUrlDraft}
                        onChange={(e) => setBackendUrlDraft(e.target.value)}
                        onBlur={() => {
                          const saved = setLiveBackendUrl(backendUrlDraft);
                          setBackendUrlDraft(saved);
                        }}
                        placeholder="https://soonest-entrepreneurs-formatting-hash.trycloudflare.com"
                        aria-label="Live Backend Endpoint URL"
                        className={`flex-1 h-9 px-3 rounded-lg border text-xs font-mono transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${inputSurface}`}
                      />
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isTestingBackend}
                          onClick={async () => {
                            setIsTestingBackend(true);
                            const normalized = normalizeUrl(backendUrlDraft);
                            const saved = setLiveBackendUrl(normalized);
                            setBackendUrlDraft(saved);
                            const result = await testFlareApiConnection(saved);
                            setBackendStatusInfo(result);
                            setIsTestingBackend(false);
                          }}
                          className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border text-xs font-sans font-medium cursor-pointer transition-all duration-150 active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${inactiveOptionBtn}`}
                        >
                          <Activity className="w-3.5 h-3.5" />
                          <span>{isTestingBackend ? 'Testing...' : 'Test Connection'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const reset = resetLiveBackendUrl();
                            setBackendUrlDraft(reset);
                            void testFlareApiConnection(reset).then(setBackendStatusInfo);
                          }}
                          className={`h-9 px-2.5 rounded-lg border text-xs font-sans font-medium cursor-pointer transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${inactiveOptionBtn}`}
                          title="Reset to default tunnel URL"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] font-sans text-zinc-500 dark:text-zinc-400">
                      Saved in localStorage. Defaults to import.meta.env.VITE_IGNIS_API_URL so fresh tunnel URLs can be pasted anytime without redeploying.
                    </p>
                  </div>

                  {/* Optional Gemini API Key Override for Local Combustion Model */}
                  <div className="pt-3 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-sans font-semibold">
                          Gemini API Key (Optional Override)
                        </div>
                        <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                          Powers Local Combustion Model synthesis with automatic multi-model failover.
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                          hasCustomGeminiApiKey()
                            ? 'border-[#10B981]/40 text-[#10B981]'
                            : hasAnyGeminiKey
                            ? 'border-[#27272A]/40 dark:border-[#27272A] text-zinc-500 dark:text-zinc-400'
                            : 'border-[#F59E0B]/40 text-[#F59E0B]'
                        }`}
                      >
                        {hasCustomGeminiApiKey()
                          ? 'Browser Override Active'
                          : hasAnyGeminiKey
                          ? 'Default .env Key Active'
                          : 'No Key Configured'}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="password"
                        value={geminiKeyDraft}
                        onChange={(e) => {
                          setGeminiKeyDraft(e.target.value);
                          setGeminiKeyNotice(null);
                        }}
                        placeholder={
                          hasAnyGeminiKey
                            ? 'Using default .env key (paste to override)'
                            : 'Paste Gemini API key (saved locally in browser)'
                        }
                        aria-label="Gemini API Key"
                        className={`flex-1 h-9 px-3 rounded-lg border text-xs font-mono transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${inputSurface}`}
                      />
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setGeminiApiKey(geminiKeyDraft);
                            setGeminiKeyNotice(
                              geminiKeyDraft.trim()
                                ? 'Saved Gemini API key in localStorage.'
                                : 'Using default import.meta.env.VITE_GEMINI_API_KEY.'
                            );
                          }}
                          className={`h-9 px-3 rounded-lg border text-xs font-sans font-medium cursor-pointer transition-all duration-150 active:scale-[0.98] ${inactiveOptionBtn}`}
                        >
                          Save Key
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            resetGeminiApiKey();
                            setGeminiKeyDraft('');
                            setGeminiKeyNotice('Reset to default project .env key.');
                          }}
                          className={`h-9 px-2.5 rounded-lg border text-xs font-sans font-medium cursor-pointer transition-all duration-150 active:scale-[0.98] ${inactiveOptionBtn}`}
                          title="Reset Gemini API key to .env default"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    {geminiKeyNotice && (
                      <p className="text-[11px] font-sans text-[#10B981]">
                        {geminiKeyNotice}
                      </p>
                    )}
                  </div>
                </div>

                {/* About, Data Attribution & SI Disclosure */}
                <div className={`p-4 rounded-lg border space-y-1.5 ${panelBox}`}>
                  <div className="text-xs font-sans font-semibold">
                    About, Data Attribution &amp; SI Disclosure
                  </div>
                  <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Data &amp; Media: Built on open-science datasets from{' '}
                    <a
                      href="https://psi.nasa.gov/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-[#18181B] dark:hover:text-[#FAFAFA]"
                    >
                      NASA Physical Science Informatics (PSI)
                    </a>{' '}
                    (CC0-1.0) and public-domain NASA microgravity imagery. Independent 2026 NASA Space Apps Challenge project - not affiliated with or endorsed by NASA.
                  </p>
                  <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Google Gemini was used for code scaffolding; all combustion physics and experimental benchmarks rely on deterministic equations and NASA PSI flight records. MIT License (2026 FLARE Team).
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'profile' && (
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <h3 className="font-display text-sm font-semibold">
                    Researcher Profile
                  </h3>
                  <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
                    Your Researcher ID is locked and deterministically derived from your full name
                  </p>
                </div>

                {isGuest && (
                  <div className="p-3 rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 text-xs font-sans text-zinc-700 dark:text-zinc-200">
                    You are currently in a temporary Guest Session. Enter your full name below and save to convert this session into a persistent Researcher profile.
                  </div>
                )}

                <div className={`p-4 rounded-lg border space-y-3.5 ${panelBox}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="settings-profile-name"
                        className="block text-xs font-sans font-medium"
                      >
                        Full Name
                      </label>
                      <input
                        id="settings-profile-name"
                        type="text"
                        value={fullNameDraft}
                        onChange={(e) => {
                          setFullNameDraft(e.target.value);
                          setProfileNotice(null);
                        }}
                        placeholder="Enter your full name"
                        className={`w-full h-9 px-3 rounded-lg border text-xs font-sans transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${inputSurface}`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="settings-profile-id"
                        className="block text-xs font-sans font-medium"
                      >
                        Researcher ID (Read-Only)
                      </label>
                      <div className="relative">
                        <Lock className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="settings-profile-id"
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={liveComputedId}
                          className={`w-full pl-8 pr-10 h-9 rounded-lg border text-xs font-mono font-semibold opacity-90 cursor-not-allowed focus-visible:outline-none ${inputSurface}`}
                        />
                        <button
                          type="button"
                          onClick={() => handleCopyResearcherId(liveComputedId)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                          title="Copy Researcher ID"
                          aria-label="Copy Researcher ID"
                        >
                          {copiedResearcherId ? (
                            <Check className="w-3.5 h-3.5 text-[#10B981]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="settings-profile-email"
                      className="block text-xs font-sans font-medium"
                    >
                      Email (Optional)
                    </label>
                    <input
                      id="settings-profile-email"
                      type="email"
                      value={emailDraft}
                      onChange={(e) => {
                        setEmailDraft(e.target.value);
                        setProfileNotice(null);
                      }}
                      placeholder="researcher@institution.org"
                      className={`w-full h-9 px-3 rounded-lg border text-xs font-sans transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${inputSurface}`}
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="settings-profile-bio"
                      className="block text-xs font-sans font-medium"
                    >
                      Researcher Bio (Optional)
                    </label>
                    <textarea
                      id="settings-profile-bio"
                      rows={3}
                      value={bioDraft}
                      onChange={(e) => {
                        setBioDraft(e.target.value);
                        setProfileNotice(null);
                      }}
                      placeholder="Focus areas, cabin safety instrumentation, or material programs..."
                      className={`w-full px-3 py-2 rounded-lg border text-xs font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 resize-none ${inputSurface}`}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {profileNotice ? (
                      <span className="text-xs font-sans text-[#10B981]">
                        {profileNotice}
                      </span>
                    ) : (
                      <span className="text-[11px] font-sans text-zinc-500">
                        Stored locally per Researcher ID
                      </span>
                    )}
                    <button
                      type="submit"
                      className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border text-xs font-sans font-medium cursor-pointer transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${activeOptionBtn}`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Profile</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-display text-sm font-semibold">
                    Appearance &amp; Accessibility
                  </h3>
                  <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
                    Customize theme polarity, contrast, typography, presets, and custom hex overrides
                  </p>
                </div>

                {/* Mode + Contrast Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className={`p-3.5 rounded-lg border space-y-2 ${panelBox}`}>
                    <div className="text-xs font-sans font-semibold">
                      Theme Mode
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(
                        [
                          { id: 'normal', label: 'Normal' },
                          { id: 'light', label: 'Light' },
                          { id: 'dark', label: 'Dark' },
                          { id: 'system', label: 'System' },
                        ] as Array<{ id: ThemeSetting; label: string }>
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() =>
                            onUpdateSettings({ themeSetting: m.id })
                          }
                          className={`px-2 py-1.5 rounded-md border text-xs font-sans cursor-pointer ${
                            settings.themeSetting === m.id
                              ? activeOptionBtn
                              : inactiveOptionBtn
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`p-3.5 rounded-lg border space-y-2 ${panelBox}`}>
                    <div className="text-xs font-sans font-semibold">
                      Contrast Level
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { id: 'default', label: 'Default' },
                          { id: 'strong', label: 'Strong' },
                        ] as Array<{ id: ContrastMode; label: string }>
                      ).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onUpdateSettings({ contrast: c.id })}
                          className={`px-3 py-1.5 rounded-md border text-xs font-sans cursor-pointer ${
                            settings.contrast === c.id
                              ? activeOptionBtn
                              : inactiveOptionBtn
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Font Family + Font Size */}
                <div className={`p-4 rounded-lg border space-y-3 ${panelBox}`}>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-8 flex flex-col justify-end gap-1.5">
                      <label
                        htmlFor="settings-font-family"
                        className="block text-xs font-sans font-semibold"
                      >
                        Font Family
                      </label>
                      <StudioSelect<FontFamilyId>
                        id="settings-font-family"
                        ariaLabel="Font Family"
                        height="h-10"
                        placement="auto-flip"
                        value={settings.fontFamily}
                        onChange={(val) => onUpdateSettings({ fontFamily: val })}
                        options={FONT_FAMILY_OPTIONS.map((f) => ({
                          value: f.id,
                          label: f.label,
                          subtitle: f.subtitle,
                        }))}
                        className="w-full"
                      />
                    </div>

                    <div className="md:col-span-4 flex flex-col justify-end gap-1.5">
                      <div className="text-xs font-sans font-semibold">
                        Font Size
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {([13, 14, 15, 16] as FontSizePx[]).map((px) => (
                          <button
                            key={px}
                            type="button"
                            onClick={() => onUpdateSettings({ fontSizePx: px })}
                            className={`h-10 rounded-lg border text-xs font-mono tabular-nums transition-all duration-150 cursor-pointer ${
                              settings.fontSizePx === px
                                ? activeOptionBtn
                                : inactiveOptionBtn
                            }`}
                          >
                            {px}px
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Curated Presets + Custom Overrides with Dynamic Light/Dark Label */}
                <div className={`p-4 rounded-lg border space-y-3.5 ${panelBox}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-sans font-semibold">
                        {resolvedTheme === 'dark' ? 'Dark Theme' : 'Light Theme'} · Curated Presets
                      </div>
                      <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
                        10 tuned palettes that automatically adapt to the active theme mode
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          customColors: {},
                        })
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-sans font-medium cursor-pointer ${inactiveOptionBtn}`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset to Preset</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {THEME_PRESETS.map((preset) => {
                      const active = settings.presetId === preset.id;
                      const previewTokens =
                        resolvedTheme === 'dark' ? preset.dark : preset.light;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            onUpdateSettings({
                              presetId: preset.id as ThemePresetId,
                              customColors: {},
                            })
                          }
                          className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                            active ? activeOptionBtn : inactiveOptionBtn
                          }`}
                          title={preset.description}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span
                              className="w-3.5 h-3.5 rounded-[3px] border border-zinc-400/50 shrink-0"
                              style={{ backgroundColor: previewTokens.bg }}
                            />
                            <span
                              className="w-3.5 h-3.5 rounded-[3px] border border-zinc-400/50 shrink-0"
                              style={{ backgroundColor: previewTokens.accent }}
                            />
                          </div>
                          <div className="text-[11px] font-sans font-semibold truncate">
                            {preset.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* 3 Custom Hex Color Overrides */}
                  <div className="pt-2 border-t border-[#E4E4E7] dark:border-[#27272A] space-y-2.5">
                    <div className="text-xs font-sans font-semibold">
                      Custom {resolvedTheme === 'dark' ? 'Dark' : 'Light'} Color Overrides
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {(
                        [
                          {
                            key: 'background',
                            label: 'Background',
                            value: effectiveBg,
                            draft: bgHexDraft,
                            setDraft: setBgHexDraft,
                          },
                          {
                            key: 'foreground',
                            label: 'Foreground',
                            value: effectiveFg,
                            draft: fgHexDraft,
                            setDraft: setFgHexDraft,
                          },
                          {
                            key: 'accent',
                            label: 'Accent',
                            value: effectiveAccent,
                            draft: accentHexDraft,
                            setDraft: setAccentHexDraft,
                          },
                        ] as const
                      ).map((row) => (
                        <div
                          key={row.key}
                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                            isDark
                              ? 'bg-[#09090B] border-[#27272A]'
                              : 'bg-white border-[#E4E4E7]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-md border border-zinc-400/40 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95">
                              <input
                                type="color"
                                aria-label={`${row.label} color picker`}
                                value={row.value}
                                onChange={(e) => {
                                  row.setDraft(e.target.value.toUpperCase());
                                  onUpdateSettings({
                                    customColors: {
                                      ...settings.customColors,
                                      [row.key]: e.target.value.toUpperCase(),
                                    },
                                  });
                                }}
                                className="w-10 h-10 -m-1.5 border-0 bg-transparent cursor-pointer p-0"
                              />
                            </div>
                            <span className="text-xs font-sans font-medium truncate">
                              {row.label}
                            </span>
                          </div>
                          <input
                            type="text"
                            aria-label={`${row.label} hex code`}
                            value={row.draft}
                            onChange={(e) => row.setDraft(e.target.value)}
                            onBlur={() => handleHexCommit(row.key, row.draft)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleHexCommit(row.key, row.draft);
                              }
                            }}
                            className={`h-9 w-[88px] px-2.5 rounded-lg border font-mono text-xs uppercase transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${inputSurface}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-display text-sm font-semibold">
                    Keyboard Shortcuts
                  </h3>
                  <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
                    Read-only quick reference for keyboard navigation across FLARE
                  </p>
                </div>

                <div className={`rounded-lg border overflow-hidden ${panelBox}`}>
                  {[
                    {
                      keys: '[',
                      action: 'Cycle Left Navigation Rail (Expanded / Compact / Hidden)',
                    },
                    {
                      keys: 'Ctrl / Cmd + K',
                      action: 'Focus Global Search Bar (investigations, runs & guide sections)',
                    },
                    {
                      keys: 'Enter',
                      action: 'Send question in Model Console composer',
                    },
                    {
                      keys: 'Shift + Enter',
                      action: 'Insert a new line in Model Console composer',
                    },
                    {
                      keys: 'Esc',
                      action: 'Close active dialogs, dropdown menus, or search results',
                    },
                  ].map((item, idx) => (
                    <div
                      key={item.keys}
                      className={`px-4 py-3 flex items-center justify-between gap-4 text-xs ${
                        idx > 0
                          ? isDark
                            ? 'border-t border-[#27272A]'
                            : 'border-t border-[#E4E4E7]'
                          : ''
                      }`}
                    >
                      <span className="font-sans text-zinc-700 dark:text-zinc-200">
                        {item.action}
                      </span>
                      <kbd
                        className={`px-2 py-1 rounded-md border font-mono text-[11px] font-semibold shrink-0 ${
                          isDark
                            ? 'bg-[#09090B] border-[#27272A] text-zinc-100'
                            : 'bg-white border-[#E4E4E7] text-zinc-900'
                        }`}
                      >
                        {item.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-display text-sm font-semibold">
                    Account &amp; Learned Memory
                  </h3>
                  <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
                    Manage your saved chats, imported custom runs, taught model corrections, and session state
                  </p>
                </div>

                {/* Live Read-Only Account Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className={`p-3.5 rounded-lg border ${panelBox}`}>
                    <div className="text-[11px] font-sans text-zinc-500">
                      Saved Chats
                    </div>
                    <div className="font-mono text-xl font-semibold mt-1 tabular-nums">
                      {savedChatsCount}
                    </div>
                  </div>
                  <div className={`p-3.5 rounded-lg border ${panelBox}`}>
                    <div className="text-[11px] font-sans text-zinc-500">
                      Custom Imported Runs
                    </div>
                    <div className="font-mono text-xl font-semibold mt-1 tabular-nums">
                      {customRuns.length}
                    </div>
                  </div>
                  <div className={`p-3.5 rounded-lg border ${panelBox}`}>
                    <div className="text-[11px] font-sans text-zinc-500">
                      Model Corrections Taught
                    </div>
                    <div className="font-mono text-xl font-semibold mt-1 tabular-nums">
                      {corrections.length}
                    </div>
                  </div>
                </div>

                {accountNotice && (
                  <div className="p-3 rounded-lg border border-[#10B981]/35 bg-[#10B981]/10 text-xs font-sans text-[#10B981]">
                    {accountNotice}
                  </div>
                )}

                <div className={`p-4 rounded-lg border space-y-2.5 ${panelBox}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-sans font-semibold">
                        Export Profile &amp; Corrections Backup
                      </div>
                      <p className="text-[11px] font-sans text-zinc-500">
                        Download your Researcher profile and taught model rules as JSON
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportLearnedBundle}
                      className={`h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg border text-xs font-sans font-medium cursor-pointer transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${inactiveOptionBtn}`}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Profile &amp; Corrections (.json)</span>
                    </button>
                  </div>

                  <div
                    className={`pt-3 border-t flex flex-wrap items-center justify-between gap-2 ${
                      isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-sans font-semibold">
                        Clear Chat History Only
                      </div>
                      <p className="text-[11px] font-sans text-zinc-500">
                        Removes conversation threads while keeping your settings and taught model corrections
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClearChatHistory();
                        setAccountNotice('Cleared Model Console chat history.');
                      }}
                      className={`h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg border text-xs font-sans font-medium cursor-pointer transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${inactiveOptionBtn}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear Chat History Only</span>
                    </button>
                  </div>

                  <div
                    className={`pt-3 border-t flex flex-wrap items-center justify-between gap-2 ${
                      isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-sans font-semibold">
                        Sign Out
                      </div>
                      <p className="text-[11px] font-sans text-zinc-500">
                        {isGuest
                          ? 'Ends this temporary Guest Session and returns to the Landing Page'
                          : 'Signs out of this session and returns to the Landing Page'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onSignOut();
                        onClose();
                      }}
                      className={`h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg border text-xs font-sans font-medium cursor-pointer transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${inactiveOptionBtn}`}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>

                  {!isGuest && (
                    <div
                      className={`pt-3 border-t space-y-2.5 ${
                        isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-sans font-semibold text-[#EF4444]">
                            Delete Account
                          </div>
                          <p className="text-[11px] font-sans text-zinc-500">
                            Permanently deletes saved profile, chats, custom runs, and learned corrections for {session?.researcherId}
                          </p>
                        </div>
                        {!confirmDeleteOpen ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteOpen(true)}
                            className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-lg border border-[#EF4444]/40 text-[#EF4444] text-xs font-sans font-medium hover:bg-[#EF4444]/10 cursor-pointer transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Delete Account</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteOpen(false)}
                              className={`h-9 px-3 rounded-lg border text-xs font-sans cursor-pointer transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${inactiveOptionBtn}`}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteAccount();
                                onClose();
                              }}
                              className="h-9 px-3.5 rounded-lg bg-[#EF4444] text-white text-xs font-sans font-semibold hover:opacity-90 cursor-pointer transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                            >
                              Confirm Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
