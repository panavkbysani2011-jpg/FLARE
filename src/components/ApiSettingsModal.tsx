import React, { useState } from 'react';
import {
  Activity,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Plus,
  Server,
  Trash2,
  X,
} from 'lucide-react';
import {
  EndpointSyncState,
  NamedApiEndpointProfile,
  PsiInvestigationRecord,
  PsiRun,
  ThemeMode,
} from '../types/psi';
import {
  deleteApiEndpointProfile,
  LOCAL_MODEL_ID,
  setActiveEndpointProfileId,
  syncCorpusWithEndpoint,
  testApiEndpointHealth,
  upsertApiEndpointProfile,
} from '../services/psiApi';
import { getVerifiedCorrections } from '../services/userAdaptation';

interface ApiSettingsModalProps {
  theme: ThemeMode;
  isOpen: boolean;
  profiles: NamedApiEndpointProfile[];
  activeProfileId: string;
  catalogRuns?: PsiRun[];
  investigations?: PsiInvestigationRecord[];
  literatureChunksCount?: number;
  onClose: () => void;
  onProfilesUpdated: (
    nextProfiles: NamedApiEndpointProfile[],
    nextActiveId: string
  ) => void;
  onSyncCompleted?: (syncState: EndpointSyncState) => void;
  onProfileChanged?: () => void;
}

const BLANK_FORM = {
  id: '',
  name: '',
  baseUrl: '',
  apiKeyHeader: 'X-API-Key' as 'X-API-Key' | 'Authorization',
  apiKeyValue: '',
  modelId: '',
};

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({
  theme,
  isOpen,
  profiles,
  activeProfileId,
  catalogRuns = [],
  investigations = [],
  literatureChunksCount = 0,
  onClose,
  onProfilesUpdated,
  onSyncCompleted,
}) => {
  const [form, setForm] = useState(BLANK_FORM);
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const isDark = theme === 'dark';
  const modalSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';
  const subSurface = isDark
    ? 'bg-[#09090B] border-[#27272A] text-[#FAFAFA]'
    : 'bg-zinc-50 border-[#E4E4E7] text-[#18181B]';
  const primaryBtn = isDark
    ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA] hover:bg-zinc-200'
    : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B] hover:bg-zinc-800';
  const secondaryBtn = isDark
    ? 'bg-[#18181B] text-zinc-200 border-[#27272A] hover:bg-zinc-800 hover:border-zinc-600'
    : 'bg-white text-zinc-800 border-[#E4E4E7] hover:bg-zinc-100 hover:border-zinc-300';

  const runHandshakeForProfile = async (
    profile: NamedApiEndpointProfile | null
  ) => {
    setIsSyncing(true);
    setStatusNotice({
      ok: true,
      message: profile
        ? `Running /health handshake and syncing archive with ${profile.name}...`
        : 'Switching to Local Combustion Model...',
    });

    const syncResult = await syncCorpusWithEndpoint({
      catalogRuns,
      investigations,
      literatureChunksCount,
      config: profile
        ? {
            baseUrl: profile.baseUrl,
            apiKeyHeader: profile.apiKeyHeader,
            apiKeyValue: profile.apiKeyValue,
            modelId: profile.modelId,
          }
        : {
            baseUrl: '',
            apiKeyHeader: 'X-API-Key',
            apiKeyValue: '',
            modelId: '',
          },
      endpointName: profile ? profile.name : 'Local Combustion Model',
    });

    setStatusNotice({
      ok: syncResult.status === 'synced' || syncResult.status === 'local-only',
      message: syncResult.message,
    });
    onSyncCompleted?.(syncResult);
    setIsSyncing(false);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedUrl = form.baseUrl.trim();
    if (!cleanedUrl) {
      setStatusNotice({
        ok: false,
        message: 'Enter a Base URL (for example http://127.0.0.1:8000) to save a remote profile.',
      });
      return;
    }

    const { profiles: updated, saved } = upsertApiEndpointProfile(
      {
        id: form.id || undefined,
        name: form.name.trim() || 'Remote Combustion Endpoint',
        baseUrl: cleanedUrl,
        apiKeyHeader: form.apiKeyHeader,
        apiKeyValue: form.apiKeyValue,
        modelId: form.modelId.trim(),
      },
      true
    );

    onProfilesUpdated(updated, saved.id);
    setForm(BLANK_FORM);
    void runHandshakeForProfile(saved);
  };

  const handleEditProfile = (profile: NamedApiEndpointProfile) => {
    setForm({
      id: profile.id,
      name: profile.name,
      baseUrl: profile.baseUrl,
      apiKeyHeader: profile.apiKeyHeader,
      apiKeyValue: profile.apiKeyValue,
      modelId: profile.modelId ?? '',
    });
    setStatusNotice(null);
  };

  const handleDeleteProfile = (profileId: string) => {
    const next = deleteApiEndpointProfile(profileId);
    const nextActive =
      activeProfileId === profileId ? LOCAL_MODEL_ID : activeProfileId;
    onProfilesUpdated(next, nextActive);
    if (form.id === profileId) {
      setForm(BLANK_FORM);
    }
    setStatusNotice({
      ok: true,
      message: 'Removed remote endpoint profile.',
    });
  };

  const handleSelectProfile = (profileId: string) => {
    setActiveEndpointProfileId(profileId);
    onProfilesUpdated(profiles, profileId);
    const chosen =
      profileId === LOCAL_MODEL_ID
        ? null
        : profiles.find((p) => p.id === profileId) ?? null;
    void runHandshakeForProfile(chosen);
  };

  const handleTestFormEndpoint = async () => {
    setIsTesting(true);
    const res = await testApiEndpointHealth({
      baseUrl: form.baseUrl,
      apiKeyHeader: form.apiKeyHeader,
      apiKeyValue: form.apiKeyValue,
      modelId: form.modelId,
    });
    setStatusNotice({
      ok: res.ok,
      message: res.message,
    });
    setIsTesting(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="API Settings and Remote Model Endpoints"
    >
      <div
        className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border shadow-2xl p-5 space-y-5 ${modalSurface}`}
      >
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#E4E4E7] dark:border-[#27272A]">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">
              API Settings &amp; Model Endpoints
            </h2>
            <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 mt-0.5">
              Connect custom FastAPI or remote AI inference servers, or keep using the built-in Local Combustion Model with zero API key needed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close API Settings"
            className={`w-7 h-7 rounded-md border flex items-center justify-center cursor-pointer ${secondaryBtn}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Saved Profiles List + Local Built-in Option */}
        <div className="space-y-2">
          <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Saved Model Endpoints ({profiles.length + 1})
          </div>

          <div className="space-y-2">
            {/* Built-in Local Combustion Model */}
            <div
              className={`p-3 rounded-md border flex items-center justify-between gap-3 ${
                activeProfileId === LOCAL_MODEL_ID
                  ? isDark
                    ? 'border-zinc-400 bg-[#18181B]'
                    : 'border-zinc-800 bg-zinc-50'
                  : subSurface
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-sans font-semibold">
                  <span className="w-2 h-2 rounded-[2px] bg-[#10B981]" />
                  <span>Local Combustion Model</span>
                  <span className="text-[11px] font-normal text-zinc-500">
                    (Built-in · No API key required)
                  </span>
                </div>
                <p className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Runs directly in your browser across 1,616 calibrated spaceflight runs and ISS safety guides.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSelectProfile(LOCAL_MODEL_ID)}
                className={`px-3 py-1.5 text-xs font-sans font-medium rounded-md border shrink-0 cursor-pointer ${
                  activeProfileId === LOCAL_MODEL_ID ? primaryBtn : secondaryBtn
                }`}
              >
                {activeProfileId === LOCAL_MODEL_ID ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="w-3 h-3" /> Active
                  </span>
                ) : (
                  'Use Local'
                )}
              </button>
            </div>

            {profiles.map((profile) => {
              const isActive = activeProfileId === profile.id;
              return (
                <div
                  key={profile.id}
                  className={`p-3 rounded-md border flex flex-wrap items-center justify-between gap-3 ${
                    isActive
                      ? isDark
                        ? 'border-zinc-400 bg-[#18181B]'
                        : 'border-zinc-800 bg-zinc-50'
                      : subSurface
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 text-xs font-sans font-semibold">
                      <Server className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <span className="truncate">{profile.name}</span>
                      {profile.modelId && (
                        <span className="font-mono text-[11px] font-normal text-zinc-500">
                          {profile.modelId}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-zinc-500 truncate">
                      {profile.baseUrl} · Header: {profile.apiKeyHeader}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSelectProfile(profile.id)}
                      className={`px-2.5 py-1 text-xs font-sans font-medium rounded-md border cursor-pointer ${
                        isActive ? primaryBtn : secondaryBtn
                      }`}
                    >
                      {isActive ? 'Active' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditProfile(profile)}
                      className={`px-2.5 py-1 text-xs font-sans rounded-md border cursor-pointer ${secondaryBtn}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProfile(profile.id)}
                      aria-label={`Delete ${profile.name}`}
                      className={`p-1.5 rounded-md border text-zinc-500 hover:text-[#EF4444] cursor-pointer ${secondaryBtn}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add / Edit Form */}
        <form
          onSubmit={handleSaveProfile}
          className={`p-4 rounded-md border space-y-3 ${subSurface}`}
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-display font-semibold">
              {form.id ? 'Edit Remote Endpoint Profile' : 'Add New Remote Endpoint Profile'}
            </div>
            {form.id && (
              <button
                type="button"
                onClick={() => setForm(BLANK_FORM)}
                className="text-[11px] font-sans text-zinc-500 hover:underline cursor-pointer"
              >
                + New Blank Profile
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div className="flex flex-col justify-end gap-1.5">
              <label
                htmlFor="modal-api-profile-name"
                className="block text-[11px] font-sans font-medium text-zinc-500"
              >
                Profile Name
              </label>
              <input
                id="modal-api-profile-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Lab FastAPI Server"
                className={`w-full h-9 px-3 text-xs font-sans rounded-lg border transition-colors duration-150 outline-none ${modalSurface}`}
              />
            </div>

            <div className="flex flex-col justify-end gap-1.5">
              <label
                htmlFor="modal-api-model-id"
                className="block text-[11px] font-sans font-medium text-zinc-500"
              >
                Model ID (Optional)
              </label>
              <input
                id="modal-api-model-id"
                type="text"
                value={form.modelId}
                onChange={(e) => setForm((p) => ({ ...p, modelId: e.target.value }))}
                placeholder="e.g. psi-combustion-v2"
                className={`w-full h-9 px-3 text-xs font-mono rounded-lg border transition-colors duration-150 outline-none ${modalSurface}`}
              />
            </div>

            <div className="sm:col-span-2 flex flex-col justify-end gap-1.5">
              <label
                htmlFor="modal-api-base-url"
                className="block text-[11px] font-sans font-medium text-zinc-500"
              >
                Base URL
              </label>
              <input
                id="modal-api-base-url"
                type="url"
                value={form.baseUrl}
                onChange={(e) => setForm((p) => ({ ...p, baseUrl: e.target.value }))}
                placeholder="http://127.0.0.1:8000"
                className={`w-full h-9 px-3 text-xs font-sans rounded-lg border transition-colors duration-150 outline-none ${modalSurface}`}
              />
            </div>

            <div className="flex flex-col justify-end gap-1.5">
              <label
                htmlFor="modal-api-header"
                className="block text-[11px] font-sans font-medium text-zinc-500"
              >
                Auth Header Name
              </label>
              <div className="relative">
                <select
                  id="modal-api-header"
                  value={form.apiKeyHeader}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      apiKeyHeader: e.target.value as 'X-API-Key' | 'Authorization',
                    }))
                  }
                  className={`w-full h-9 appearance-none pl-3 pr-8 text-xs font-sans font-medium rounded-lg border transition-colors duration-150 outline-none cursor-pointer ${modalSurface}`}
                >
                  <option value="X-API-Key">X-API-Key</option>
                  <option value="Authorization">Authorization</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              </div>
            </div>

            <div className="flex flex-col justify-end gap-1.5">
              <label
                htmlFor="modal-api-key"
                className="block text-[11px] font-sans font-medium text-zinc-500"
              >
                API Key / Bearer Token
              </label>
              <div className="relative">
                <input
                  id="modal-api-key"
                  type={showKey ? 'text' : 'password'}
                  value={form.apiKeyValue}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, apiKeyValue: e.target.value }))
                  }
                  placeholder="Optional token..."
                  className={`w-full h-9 pl-3 pr-8 text-xs font-sans rounded-lg border transition-colors duration-150 outline-none ${modalSurface}`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((p) => !p)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                >
                  {showKey ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {statusNotice && (
            <div className="flex items-center gap-2 text-xs font-sans pt-1">
              <span
                className={`w-2 h-2 rounded-[2px] shrink-0 ${
                  statusNotice.ok ? 'bg-[#10B981]' : 'bg-[#F59E0B]'
                }`}
              />
              <span>{statusNotice.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isTesting}
              onClick={handleTestFormEndpoint}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium rounded-md border cursor-pointer disabled:opacity-55 ${secondaryBtn}`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
            </button>

            <button
              type="submit"
              disabled={isSyncing}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-sans font-semibold rounded-lg border cursor-pointer disabled:opacity-55 ${primaryBtn}`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>
                {isSyncing
                  ? 'Syncing...'
                  : form.id
                  ? 'Update & Sync Endpoint'
                  : 'Save, Activate & Sync'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
