import {
  ChatAttachment,
  ChatVisualizationOutputMode,
  ConsoleMode,
  DecodedChartContext,
  EndpointSyncState,
  HazardOutcome,
  ModelFeedbackCorrection,
  NamedApiEndpointProfile,
  PsiApiEndpointConfig,
  PsiInvestigationRecord,
  PsiRun,
  SimulationRequest,
  SimulationResponse,
  StructuredDataTable,
  VirtualTestConfig,
} from '../types/psi';
import {
  AssistantArchiveContext,
  computeFlameSpreadVelocity,
  runLocalPhysicsSimulation,
} from '../utils/physicsEngine';
import {
  ImportValidationResult,
  validateAndNormalizeDataset,
} from '../utils/dataImporter';
import { resolveChatVisualization } from '../utils/chatVisualizations';
import {
  applyCorrectionsAndProfileToSimulation,
  findMatchingCorrections,
  getOrCreateUserProfile,
  getVerifiedCorrections,
  markCorrectionSynced,
  recordHelpfulFeedback,
  saveVerifiedCorrection,
} from './userAdaptation';
import {
  evaluateCombustionState,
  getLiveBackendUrl,
  askLiveModel,
  hasCustomBackendUrlOverride,
  getCachedBackendConnectionStatus,
  isGeminiApiKey,
  normalizeUrl,
  publishBackendConnectionStatus,
  runLocalCombustionModelPipeline,
  setGeminiApiKey,
  setLiveBackendUrl,
  validateGeminiApiKey,
  MODEL_LABEL_ACTIVE,
  MODEL_LABEL_LOCAL,
  MODEL_LABEL_CUSTOM,
} from '../lib/flareApi';

export const LOCAL_MODEL_ID = 'local-combustion-model';
export const ENV_DEFAULT_PROFILE_ID = 'env-default-endpoint';
const API_CONFIG_STORAGE_KEY = 'psi_api_endpoint_config_v1';
const API_PROFILES_STORAGE_KEY = 'psi_api_endpoint_profiles_v2';
const ACTIVE_PROFILE_STORAGE_KEY = 'psi_active_endpoint_profile_id_v2';

function readEnvBaseUrl(): string {
  try {
    if (typeof import.meta !== 'undefined') {
      const metaEnv = (
        import.meta as unknown as { env?: Record<string, string | undefined> }
      ).env;
      if (metaEnv?.VITE_IGNIS_API_URL) {
        return normalizeUrl(metaEnv.VITE_IGNIS_API_URL);
      }
      if (metaEnv?.VITE_API_BASE_URL) {
        return normalizeUrl(metaEnv.VITE_API_BASE_URL);
      }
    }
    if (typeof process !== 'undefined') {
      if (process.env?.VITE_IGNIS_API_URL) {
        return normalizeUrl(process.env.VITE_IGNIS_API_URL);
      }
      if (process.env?.VITE_API_BASE_URL) {
        return normalizeUrl(process.env.VITE_API_BASE_URL);
      }
    }
  } catch {
    // Ignore environment access edge cases
  }
  return '';
}

const DEFAULT_API_CONFIG: PsiApiEndpointConfig = {
  baseUrl: readEnvBaseUrl(),
  apiKeyHeader: 'X-API-Key',
  apiKeyValue: '',
  modelId: '',
};

function readStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Ignore storage read failures
  }
  return null;
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage write failures
  }
}

export function getApiEndpointProfiles(): NamedApiEndpointProfile[] {
  const rawStored = readStorage(API_PROFILES_STORAGE_KEY);
  if (rawStored) {
    try {
      const parsed = JSON.parse(rawStored) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (p): p is NamedApiEndpointProfile =>
              Boolean(p) &&
              typeof p === 'object' &&
              typeof (p as NamedApiEndpointProfile).id === 'string' &&
              typeof (p as NamedApiEndpointProfile).name === 'string' &&
              typeof (p as NamedApiEndpointProfile).baseUrl === 'string'
          )
          .map((p) => ({
            id: p.id,
            name: p.name.trim() || 'Remote Model Endpoint',
            baseUrl: normalizeUrl(p.baseUrl),
            apiKeyHeader:
              p.apiKeyHeader === 'Authorization' ? 'Authorization' : 'X-API-Key',
            apiKeyValue: p.apiKeyValue ?? '',
            modelId: p.modelId?.trim() || '',
          }));
      }
    } catch {
      // Ignore parse failures
    }
  }

  // Graceful migration of single legacy endpoint if present
  const rawLegacy = readStorage(API_CONFIG_STORAGE_KEY);
  if (rawLegacy) {
    try {
      const parsed = JSON.parse(rawLegacy) as Partial<PsiApiEndpointConfig>;
      const base = parsed.baseUrl?.trim().replace(/\/$/, '') ?? '';
      if (base) {
        const migrated: NamedApiEndpointProfile = {
          id: 'migrated-legacy-endpoint',
          name: 'Custom Remote Endpoint',
          baseUrl: base,
          apiKeyHeader:
            parsed.apiKeyHeader === 'Authorization' ? 'Authorization' : 'X-API-Key',
          apiKeyValue: parsed.apiKeyValue ?? '',
          modelId: parsed.modelId?.trim() || '',
        };
        writeStorage(API_PROFILES_STORAGE_KEY, JSON.stringify([migrated]));
        if (!readStorage(ACTIVE_PROFILE_STORAGE_KEY)) {
          writeStorage(ACTIVE_PROFILE_STORAGE_KEY, migrated.id);
        }
        return [migrated];
      }
    } catch {
      // Ignore parse error
    }
  }

  return [];
}

export function saveApiEndpointProfiles(
  profiles: NamedApiEndpointProfile[]
): NamedApiEndpointProfile[] {
  const cleaned = profiles.map((p) => ({
    id: p.id,
    name: p.name.trim() || 'Remote Endpoint',
    baseUrl: normalizeUrl(p.baseUrl),
    apiKeyHeader: (p.apiKeyHeader === 'Authorization'
      ? 'Authorization'
      : 'X-API-Key') as 'X-API-Key' | 'Authorization',
    apiKeyValue: p.apiKeyValue.trim(),
    modelId: p.modelId?.trim() || '',
  }));
  writeStorage(API_PROFILES_STORAGE_KEY, JSON.stringify(cleaned));
  return cleaned;
}

export function getActiveEndpointProfileId(): string {
  const activeId = readStorage(ACTIVE_PROFILE_STORAGE_KEY);
  if (activeId) return activeId;
  const envUrl = readEnvBaseUrl() || DEFAULT_API_CONFIG.baseUrl;
  return envUrl ? ENV_DEFAULT_PROFILE_ID : LOCAL_MODEL_ID;
}

export function setActiveEndpointProfileId(profileId: string): void {
  writeStorage(ACTIVE_PROFILE_STORAGE_KEY, profileId || LOCAL_MODEL_ID);
}

export function getActiveEndpointProfile(): NamedApiEndpointProfile | null {
  const activeId = getActiveEndpointProfileId();
  if (activeId === LOCAL_MODEL_ID) return null;
  const profiles = getApiEndpointProfiles();
  const matched = profiles.find((p) => p.id === activeId);
  if (matched) return matched;

  const envUrl = readEnvBaseUrl() || DEFAULT_API_CONFIG.baseUrl;
  if (envUrl) {
    return {
      id: ENV_DEFAULT_PROFILE_ID,
      name: hasCustomBackendUrlOverride() ? MODEL_LABEL_CUSTOM : MODEL_LABEL_ACTIVE,
      baseUrl: envUrl,
      apiKeyHeader: 'X-API-Key',
      apiKeyValue: '',
      modelId: '',
    };
  }
  return null;
}

export function getEffectiveEndpointLabel(): string {
  const active = getActiveEndpointProfile();
  if (!active) return MODEL_LABEL_LOCAL;
  if (active.id === ENV_DEFAULT_PROFILE_ID) {
    if (!getCachedBackendConnectionStatus().connected) {
      return MODEL_LABEL_LOCAL;
    }
    return hasCustomBackendUrlOverride() ? MODEL_LABEL_CUSTOM : MODEL_LABEL_ACTIVE;
  }
  return active.name?.trim() ? MODEL_LABEL_CUSTOM : MODEL_LABEL_LOCAL;
}

export function upsertApiEndpointProfile(
  profile: Omit<NamedApiEndpointProfile, 'id'> & { id?: string },
  makeActive = true
): { profiles: NamedApiEndpointProfile[]; saved: NamedApiEndpointProfile } {
  const existing = getApiEndpointProfiles();
  const id =
    profile.id &&
    profile.id !== LOCAL_MODEL_ID &&
    profile.id !== ENV_DEFAULT_PROFILE_ID
      ? profile.id
      : `api-profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const saved: NamedApiEndpointProfile = {
    id,
    name: profile.name.trim() || 'Remote Model Endpoint',
    baseUrl: normalizeUrl(profile.baseUrl),
    apiKeyHeader:
      profile.apiKeyHeader === 'Authorization' ? 'Authorization' : 'X-API-Key',
    apiKeyValue: profile.apiKeyValue.trim(),
    modelId: profile.modelId?.trim() || '',
  };

  const next = existing.some((p) => p.id === id)
    ? existing.map((p) => (p.id === id ? saved : p))
    : [...existing, saved];

  const persisted = saveApiEndpointProfiles(next);
  if (makeActive) {
    setActiveEndpointProfileId(saved.id);
  }
  return { profiles: persisted, saved };
}

export function deleteApiEndpointProfile(
  profileId: string
): NamedApiEndpointProfile[] {
  const next = getApiEndpointProfiles().filter((p) => p.id !== profileId);
  const persisted = saveApiEndpointProfiles(next);
  if (getActiveEndpointProfileId() === profileId) {
    setActiveEndpointProfileId(LOCAL_MODEL_ID);
  }
  return persisted;
}

export function getApiEndpointConfig(): PsiApiEndpointConfig {
  const activeProfile = getActiveEndpointProfile();
  if (activeProfile) {
    return {
      baseUrl: activeProfile.baseUrl,
      apiKeyHeader: activeProfile.apiKeyHeader,
      apiKeyValue: activeProfile.apiKeyValue,
      modelId: activeProfile.modelId,
    };
  }

  const activeId = readStorage(ACTIVE_PROFILE_STORAGE_KEY);
  if (activeId === LOCAL_MODEL_ID) {
    return {
      baseUrl: '',
      apiKeyHeader: 'X-API-Key',
      apiKeyValue: '',
      modelId: '',
    };
  }

  try {
    const raw = readStorage(API_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PsiApiEndpointConfig>;
      return {
        baseUrl:
          parsed.baseUrl?.trim() ??
          (readEnvBaseUrl() || DEFAULT_API_CONFIG.baseUrl),
        apiKeyHeader:
          parsed.apiKeyHeader === 'Authorization'
            ? 'Authorization'
            : 'X-API-Key',
        apiKeyValue: parsed.apiKeyValue ?? '',
        modelId: parsed.modelId?.trim() ?? '',
      };
    }
  } catch {
    // Ignore localStorage parse errors and return default config
  }
  return {
    ...DEFAULT_API_CONFIG,
    baseUrl: readEnvBaseUrl() || DEFAULT_API_CONFIG.baseUrl,
  };
}

export function saveApiEndpointConfig(
  config: PsiApiEndpointConfig
): PsiApiEndpointConfig {
  const sanitized: PsiApiEndpointConfig = {
    baseUrl: normalizeUrl(config.baseUrl),
    apiKeyHeader:
      config.apiKeyHeader === 'Authorization' ? 'Authorization' : 'X-API-Key',
    apiKeyValue: config.apiKeyValue.trim(),
    modelId: config.modelId?.trim() ?? '',
  };
  writeStorage(API_CONFIG_STORAGE_KEY, JSON.stringify(sanitized));
  if (sanitized.baseUrl) {
    const existing = getApiEndpointProfiles();
    const match = existing.find((p) => p.baseUrl === sanitized.baseUrl);
    if (match) {
      upsertApiEndpointProfile(
        {
          ...match,
          apiKeyHeader: sanitized.apiKeyHeader,
          apiKeyValue: sanitized.apiKeyValue,
          modelId: sanitized.modelId,
        },
        true
      );
    } else {
      upsertApiEndpointProfile(
        {
          id: 'migrated-legacy-endpoint',
          name: 'Custom Remote Endpoint',
          baseUrl: sanitized.baseUrl,
          apiKeyHeader: sanitized.apiKeyHeader,
          apiKeyValue: sanitized.apiKeyValue,
          modelId: sanitized.modelId,
        },
        true
      );
    }
  } else {
    setActiveEndpointProfileId(LOCAL_MODEL_ID);
  }
  return sanitized;
}

export function isRemoteApiConfigured(config = getApiEndpointConfig()): boolean {
  return Boolean(config.baseUrl && config.baseUrl.trim().length > 0);
}

function buildAuthHeaders(
  config: PsiApiEndpointConfig,
  includeContentType = true
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  const token = config.apiKeyValue?.trim() || '';
  if (token) {
    headers[config.apiKeyHeader] =
      config.apiKeyHeader === 'Authorization' &&
      !token.toLowerCase().startsWith('bearer ')
        ? `Bearer ${token}`
        : token;
  }
  return headers;
}

export async function testApiEndpointHealth(
  config: PsiApiEndpointConfig = getApiEndpointConfig()
): Promise<{
  ok: boolean;
  latencyMs: number;
  mode: 'remote' | 'offline-fallback';
  message: string;
  isGeminiKeyValid?: boolean;
}> {
  const baseUrl = normalizeUrl(config.baseUrl);
  const token = (config.apiKeyValue || '').trim();
  const hasGeminiToken = isGeminiApiKey(token);

  let geminiCheck: {
    ok: boolean;
    latencyMs: number;
    status?: number;
    message: string;
  } | null = null;

  if (hasGeminiToken) {
    geminiCheck = await validateGeminiApiKey(token);
    if (geminiCheck.ok) {
      setGeminiApiKey(token);
    }
    if (!baseUrl) {
      return {
        ok: geminiCheck.ok,
        latencyMs: geminiCheck.latencyMs,
        mode: 'offline-fallback',
        isGeminiKeyValid: geminiCheck.ok,
        message: geminiCheck.message,
      };
    }
  }

  if (!baseUrl) {
    return {
      ok: true,
      latencyMs: 1,
      mode: 'offline-fallback',
      message:
        'Using Local Combustion Model in your browser. Add a remote endpoint anytime in API Settings.',
    };
  }

  const started = Date.now();
  const headers = buildAuthHeaders(
    hasGeminiToken ? { ...config, apiKeyValue: '' } : config,
    false
  );
  const probeRoutes = [
    `${baseUrl}/health`,
    `${baseUrl}/`,
    `${baseUrl}/openapi.json`,
  ];

  let lastStatus: number | null = null;
  let reachedAny = false;

  for (const routeUrl of probeRoutes) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(routeUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      lastStatus = res.status;
      reachedAny = true;

      let isJsonOk = false;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          const body = (await res.clone().json()) as Record<string, unknown>;
          if (
            body &&
            (body.ok === true ||
              body.status === 'ok' ||
              body.status === 'healthy' ||
              body.status === 'connected')
          ) {
            isJsonOk = true;
          }
        } catch {
          // Ignore non-JSON body
        }
      }

      if ((res.status >= 200 && res.status < 300) || isJsonOk) {
        const latencyMs = Math.max(1, Date.now() - started);
        const label = `Connected · ${latencyMs} ms`;
        publishBackendConnectionStatus({
          connected: true,
          statusText: label,
          badgeLabel: label,
          latencyMs,
          checkedAtMs: Date.now(),
        });
        setLiveBackendUrl(baseUrl);
        return {
          ok: true,
          latencyMs,
          mode: 'remote',
          isGeminiKeyValid: geminiCheck?.ok,
          message: geminiCheck?.ok
            ? `Connected to live server (${baseUrl}) in ${latencyMs} ms and verified Gemini API key.`
            : `Connected to live server (${baseUrl}) in ${latencyMs} ms.`,
        };
      }
    } catch {
      // Continue to next probe route
    } finally {
      clearTimeout(timer);
    }
  }

  const latencyMs = Math.max(1, Date.now() - started);
  publishBackendConnectionStatus({
    connected: false,
    statusText: 'Local Mode',
    badgeLabel: 'Local Mode',
    latencyMs: 0,
    checkedAtMs: Date.now(),
  });
  return {
    ok: false,
    latencyMs,
    mode: 'offline-fallback',
    isGeminiKeyValid: geminiCheck?.ok,
    message:
      reachedAny && lastStatus !== null
        ? `Endpoint returned HTTP ${lastStatus}. Automatic local fallback active.`
        : `Endpoint unreachable (${baseUrl}). Local Combustion Model fallback active.`,
  };
}

/**
 * Automatic health + corpus handshake (`GET /health` followed by `POST /sync-corpus`).
 * Sends local PSI catalog summary, custom imported runs, verified user corrections,
 * and active Researcher Adaptation Profile so remote models stay aligned automatically.
 */
export async function syncCorpusWithEndpoint(params: {
  catalogRuns: PsiRun[];
  investigations: PsiInvestigationRecord[];
  literatureChunksCount: number;
  config?: PsiApiEndpointConfig;
  endpointName?: string;
}): Promise<EndpointSyncState> {
  const activeProfile = getActiveEndpointProfile();
  const config = params.config ?? getApiEndpointConfig();
  const baseUrl = normalizeUrl(config.baseUrl);
  const endpointName =
    params.endpointName ?? activeProfile?.name ?? 'Local Combustion Model';
  const corrections = getVerifiedCorrections();
  const customRuns = params.catalogRuns.filter((r) => r.isCustom);

  if (!baseUrl) {
    return {
      status: 'local-only',
      endpointName: 'Local Combustion Model',
      syncedRunsCount: params.catalogRuns.length,
      syncedCorrectionsCount: corrections.length,
      message: `Local Combustion Model active (${params.catalogRuns.length.toLocaleString()} runs, ${corrections.length} saved corrections).`,
    };
  }

  const health = await testApiEndpointHealth(config);
  if (!health.ok || health.mode !== 'remote') {
    return {
      status: 'offline-fallback',
      endpointName,
      baseUrl,
      latencyMs: health.latencyMs,
      syncedRunsCount: params.catalogRuns.length,
      syncedCorrectionsCount: corrections.length,
      message: health.message,
    };
  }

  const userProfile = getOrCreateUserProfile();
  const syncPayload = {
    researcher_id: userProfile.researcherId,
    model_id: config.modelId || undefined,
    user_profile: userProfile,
    catalog_summary: {
      total_runs: params.catalogRuns.length,
      investigation_count: params.investigations.length,
      literature_chunks_count: params.literatureChunksCount,
      investigations: params.investigations.slice(0, 30).map((inv) => ({
        psiId: inv.psiId,
        acronym: inv.acronym,
        title: inv.title,
        facility: inv.facility,
        fuels: inv.fuels,
        o2Range: inv.o2Range,
        runCount: inv.runCount,
      })),
      sample_runs: params.catalogRuns.slice(0, 60),
    },
    custom_imported_runs: customRuns,
    verified_corrections: corrections,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const syncRes = await fetch(`${baseUrl}/sync-corpus`, {
      method: 'POST',
      headers: buildAuthHeaders(config),
      body: JSON.stringify(syncPayload),
      signal: controller.signal,
    });

    const syncedAt = new Date().toISOString();
    if (syncRes.ok || syncRes.status === 404 || syncRes.status === 405) {
      return {
        status: 'synced',
        endpointName,
        baseUrl,
        lastSyncAtUtc: syncedAt,
        latencyMs: health.latencyMs,
        syncedRunsCount: params.catalogRuns.length,
        syncedCorrectionsCount: corrections.length,
        message: syncRes.ok
          ? `Connected & synced ${params.catalogRuns.length.toLocaleString()} runs (${customRuns.length} custom) and ${corrections.length} corrections with ${endpointName} (${health.latencyMs} ms).`
          : `Connected to ${endpointName} (${health.latencyMs} ms). Active Combustion Model is ready across Model Console, Virtual Test Lab, and Run Comparator.`,
      };
    }

    return {
      status: 'offline-fallback',
      endpointName,
      baseUrl,
      latencyMs: health.latencyMs,
      syncedRunsCount: params.catalogRuns.length,
      syncedCorrectionsCount: corrections.length,
      message: `${endpointName} /health succeeded (${health.latencyMs} ms), but /sync-corpus returned HTTP ${syncRes.status}. Local archive fallback remains active.`,
    };
  } catch {
    return {
      status: 'offline-fallback',
      endpointName,
      baseUrl,
      latencyMs: health.latencyMs,
      syncedRunsCount: params.catalogRuns.length,
      syncedCorrectionsCount: corrections.length,
      message: `${endpointName} /health succeeded, but /sync-corpus timed out. Local fallback remains active.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Automatically forwards newly uploaded CSV/JSON rows to POST /ingest-runs
 * whenever a remote endpoint is active, without failing local ingestion if offline.
 */
export async function ingestRunsToActiveEndpoint(params: {
  runs: PsiRun[];
  fileName: string;
  unitConversionsApplied: string[];
}): Promise<{
  syncedRemote: boolean;
  runsCount: number;
  endpointName: string;
  message: string;
}> {
  const config = getApiEndpointConfig();
  const baseUrl = normalizeUrl(config.baseUrl);
  const endpointName = getEffectiveEndpointLabel();
  const userProfile = getOrCreateUserProfile();

  if (!baseUrl) {
    return {
      syncedRemote: false,
      runsCount: params.runs.length,
      endpointName,
      message: `Added ${params.runs.length} formatted test runs into Virtual Test Lab, Visual Studio, and Experiment Catalog.`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${baseUrl}/ingest-runs`, {
      method: 'POST',
      headers: buildAuthHeaders(config),
      body: JSON.stringify({
        researcher_id: userProfile.researcherId,
        model_id: config.modelId || undefined,
        source_file: params.fileName,
        unit_conversions: params.unitConversionsApplied,
        runs: params.runs,
        user_profile: userProfile,
      }),
      signal: controller.signal,
    });

    if (res.ok) {
      return {
        syncedRemote: true,
        runsCount: params.runs.length,
        endpointName,
        message: `Added ${params.runs.length} runs locally and synced them to ${endpointName}.`,
      };
    }

    return {
      syncedRemote: false,
      runsCount: params.runs.length,
      endpointName,
      message: `Added ${params.runs.length} runs locally (${endpointName} /ingest-runs returned HTTP ${res.status}; fallback active).`,
    };
  } catch {
    return {
      syncedRemote: false,
      runsCount: params.runs.length,
      endpointName,
      message: `Added ${params.runs.length} runs locally (${endpointName} unreachable; automatic local fallback active).`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Closed-loop feedback persistence: stores verified corrections or helpful votes
 * in localStorage and immediately forwards to POST /feedback when connected.
 */
export async function submitModelFeedback(
  params:
    | {
        kind: 'helpful';
        messageId: string;
      }
    | {
        kind: 'corrected';
        messageId: string;
        question: string;
        material: string;
        O2_pct: number;
        P_psi: number;
        Flow_ms: number;
        g_eff: number;
        Thickness_mm: number;
        predictedSpread_mms: number;
        correctedSpread_mms?: number;
        correctedMinSafeThickness_mm?: number;
        correctedOutcome?: HazardOutcome;
        correctionNote: string;
      }
): Promise<{
  savedCorrection?: ModelFeedbackCorrection;
  remoteSynced: boolean;
  message: string;
}> {
  const userProfile = getOrCreateUserProfile();
  const config = getApiEndpointConfig();
  const baseUrl = normalizeUrl(config.baseUrl);

  if (params.kind === 'helpful') {
    recordHelpfulFeedback(params.messageId);
    if (!baseUrl) {
      return {
        remoteSynced: false,
        message: 'Marked reply helpful in your local Researcher Profile.',
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetch(`${baseUrl}/feedback`, {
        method: 'POST',
        headers: buildAuthHeaders(config),
        body: JSON.stringify({
          feedback_type: 'helpful',
          message_id: params.messageId,
          researcher_id: userProfile.researcherId,
          user_profile: userProfile,
        }),
        signal: controller.signal,
      });
      return {
        remoteSynced: res.ok,
        message: res.ok
          ? 'Marked helpful and shared with active remote model.'
          : 'Marked helpful locally (remote /feedback unavailable).',
      };
    } catch {
      return {
        remoteSynced: false,
        message: 'Marked helpful in your local Researcher Profile.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const saved = saveVerifiedCorrection({
    messageId: params.messageId,
    question: params.question,
    material: params.material,
    O2_pct: params.O2_pct,
    P_psi: params.P_psi,
    Flow_ms: params.Flow_ms,
    g_eff: params.g_eff,
    Thickness_mm: params.Thickness_mm,
    predictedSpread_mms: params.predictedSpread_mms,
    correctedSpread_mms: params.correctedSpread_mms,
    correctedMinSafeThickness_mm: params.correctedMinSafeThickness_mm,
    correctedOutcome: params.correctedOutcome,
    correctionNote: params.correctionNote,
  });

  if (!baseUrl) {
    return {
      savedCorrection: saved,
      remoteSynced: false,
      message:
        'Correction saved locally. Future matching runs and replies will incorporate it automatically.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${baseUrl}/feedback`, {
      method: 'POST',
      headers: buildAuthHeaders(config),
      body: JSON.stringify({
        feedback_type: 'correction',
        message_id: params.messageId,
        researcher_id: userProfile.researcherId,
        correction: saved,
        user_profile: userProfile,
      }),
      signal: controller.signal,
    });
    if (res.ok) {
      markCorrectionSynced(saved.id);
      return {
        savedCorrection: { ...saved, syncedRemote: true },
        remoteSynced: true,
        message: 'Verified correction saved locally and synced to remote endpoint.',
      };
    }
    return {
      savedCorrection: saved,
      remoteSynced: false,
      message: `Correction saved locally (remote /feedback returned HTTP ${res.status}).`,
    };
  } catch {
    return {
      savedCorrection: saved,
      remoteSynced: false,
      message: 'Correction saved locally (remote endpoint offline).',
    };
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeRemoteSimulationPatch(
  remoteData: unknown,
  localFallback: SimulationResponse
): SimulationResponse {
  if (!remoteData || typeof remoteData !== 'object' || Array.isArray(remoteData)) {
    return localFallback;
  }
  const r = remoteData as Record<string, unknown>;
  const validHazard =
    r.hazardStatus === 'Self-Extinguishing' ||
    r.hazardStatus === 'Cool Flame Caution' ||
    r.hazardStatus === 'Rapid Flame Spread'
      ? r.hazardStatus
      : localFallback.hazardStatus;

  const isFiniteNum = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v);

  const remoteAttribution =
    getActiveEndpointProfileId() !== ENV_DEFAULT_PROFILE_ID ||
    hasCustomBackendUrlOverride()
      ? MODEL_LABEL_CUSTOM
      : MODEL_LABEL_ACTIVE;

  return {
    ...localFallback,
    assistantReply: localFallback.assistantReply
      ? {
          ...localFallback.assistantReply,
          endpointLabel:
            localFallback.assistantReply.endpointLabel ?? MODEL_LABEL_LOCAL,
        }
      : {
          steps: [],
          citations: [],
          endpointLabel: MODEL_LABEL_LOCAL,
        },
    ...(isFiniteNum(r.flameSpread_mms) ? { flameSpread_mms: r.flameSpread_mms } : {}),
    ...(isFiniteNum(r.confidenceInterval_mms)
      ? { confidenceInterval_mms: r.confidenceInterval_mms }
      : {}),
    hazardStatus: validHazard,
    ...(isFiniteNum(r.peakTemp_K) ? { peakTemp_K: Math.round(r.peakTemp_K) } : {}),
    ...(r.forecast10s &&
    typeof r.forecast10s === 'object' &&
    isFiniteNum((r.forecast10s as Record<string, unknown>).radius_mm) &&
    isFiniteNum((r.forecast10s as Record<string, unknown>).pressureRise_kPa)
      ? { forecast10s: r.forecast10s as SimulationResponse['forecast10s'] }
      : {}),
    ...(r.safeMaterialCheck &&
    typeof r.safeMaterialCheck === 'object' &&
    isFiniteNum((r.safeMaterialCheck as Record<string, unknown>).minSafeThickness_mm)
      ? { safeMaterialCheck: r.safeMaterialCheck as SimulationResponse['safeMaterialCheck'] }
      : {}),
    ...(r.modelConfidence &&
    typeof r.modelConfidence === 'object' &&
    isFiniteNum((r.modelConfidence as Record<string, unknown>).confidencePct)
      ? { modelConfidence: r.modelConfidence as SimulationResponse['modelConfidence'] }
      : {}),
    ...(Array.isArray(r.timelineSeries) && r.timelineSeries.length > 0
      ? { timelineSeries: r.timelineSeries as SimulationResponse['timelineSeries'] }
      : {}),
    ...(Array.isArray(r.materialRankings) && r.materialRankings.length > 0
      ? { materialRankings: r.materialRankings as SimulationResponse['materialRankings'] }
      : {}),
    ...(r.assistantReply &&
    typeof r.assistantReply === 'object' &&
    Array.isArray((r.assistantReply as Record<string, unknown>).steps)
      ? {
          assistantReply: {
            ...(r.assistantReply as NonNullable<SimulationResponse['assistantReply']>),
            endpointLabel:
              typeof (r.assistantReply as Record<string, unknown>).endpointLabel ===
              'string'
                ? String((r.assistantReply as Record<string, unknown>).endpointLabel)
                : remoteAttribution,
          },
        }
      : {}),
  };
}

/**
 * Centralized API adapter for FLARE - Flight & Lunar Atmosphere Risk Engine.
 * Attaches Researcher Profile & verified corrections automatically and routes predictions
 * to the active remote endpoint (or seamless Local Combustion Model fallback offline).
 */
export async function analyzeCombustionState(
  request: SimulationRequest,
  catalog: PsiRun[] = [],
  archiveContext?: AssistantArchiveContext
): Promise<SimulationResponse> {
  const config = getApiEndpointConfig();
  const apiBaseUrl = config.baseUrl.trim().replace(/\/$/, '');
  const userProfile = request.userProfile ?? getOrCreateUserProfile();
  const allCorrections = request.verifiedCorrections ?? getVerifiedCorrections();
  const matchedCorrections = findMatchingCorrections(
    {
      O2_pct: request.O2_pct,
      P_psi: request.P_psi,
      Flow_ms: request.Flow_ms,
      g_eff: request.g_eff,
      Thickness_mm: request.Thickness_mm,
      material: request.material,
      question: request.question,
    },
    allCorrections
  ).map((m) => m.correction);

  const payload = {
    O2_pct: request.O2_pct,
    P_psi: request.P_psi,
    Flow_ms: request.Flow_ms,
    g_eff: request.g_eff,
    Thickness_mm: request.Thickness_mm,
    material: request.material ?? 'PMMA',
    ignitionFlux_Wm2: request.ignitionFlux_Wm2 ?? 25000,
    forecast_10s: true,
    material_check: true,
    question: request.question ?? undefined,
    console_mode: request.consoleMode ?? undefined,
    active_chart_context: request.activeChartContext ?? undefined,
    attachments: request.attachments ?? undefined,
    requested_viz_output: request.requestedVizOutput ?? undefined,
    comparator_runs: request.comparatorRuns ?? undefined,
    user_profile: userProfile,
    verified_corrections:
      matchedCorrections.length > 0 ? matchedCorrections : undefined,
    model_id: config.modelId || undefined,
  };

  if (apiBaseUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      // First attempt /evaluate on the active inference endpoint
      const evaluateRes = await fetch(`${apiBaseUrl}/evaluate`, {
        method: 'POST',
        headers: buildAuthHeaders(config),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (evaluateRes.ok) {
        const remoteData = (await evaluateRes.json()) as unknown;
        const localBase = runLocalPhysicsSimulation(
          request,
          catalog,
          archiveContext
        );
        const patched = sanitizeRemoteSimulationPatch(remoteData, localBase);
        const unsynced = allCorrections.filter((c) => !c.syncedRemote);
        if (unsynced.length > 0) {
          return applyCorrectionsAndProfileToSimulation(
            patched,
            request,
            userProfile,
            unsynced
          );
        }
        return patched;
      }

      // Fallback to /api/analyze if endpoint uses legacy route
      const response = await fetch(`${apiBaseUrl}/api/analyze`, {
        method: 'POST',
        headers: buildAuthHeaders(config),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (response.ok) {
        const remoteData = (await response.json()) as unknown;
        const localBase = runLocalPhysicsSimulation(
          request,
          catalog,
          archiveContext
        );
        const patched = sanitizeRemoteSimulationPatch(remoteData, localBase);
        // If there are unsynced local corrections, blend them locally so edits take effect immediately
        const unsynced = allCorrections.filter((c) => !c.syncedRemote);
        if (unsynced.length > 0) {
          return applyCorrectionsAndProfileToSimulation(
            patched,
            request,
            userProfile,
            unsynced
          );
        }
        return patched;
      }
    } catch {
      // Fall back cleanly to local deterministic physics calculation if external backend is offline
    } finally {
      clearTimeout(timer);
    }
  }

  if (request.question) {
    await new Promise((resolve) => setTimeout(resolve, 110));
  }

  const localBase = {
    ...runLocalPhysicsSimulation(request, catalog, archiveContext),
    endpointLabel: MODEL_LABEL_LOCAL,
  };
  return applyCorrectionsAndProfileToSimulation(
    localBase,
    request,
    userProfile,
    allCorrections
  );
}

export async function runModelConsoleInference(params: {
  question: string;
  mode: ConsoleMode;
  request: SimulationRequest;
  catalog: PsiRun[];
  archiveContext?: AssistantArchiveContext;
  chartContext?: DecodedChartContext | null;
  attachments?: ChatAttachment[];
  requestedVizOutput?: ChatVisualizationOutputMode;
  selectedRuns?: PsiRun[];
}): Promise<SimulationResponse> {
  const userProfile = params.request.userProfile ?? getOrCreateUserProfile();
  const attachments = params.attachments ?? params.request.attachments ?? [];
  const requestedVizOutput: ChatVisualizationOutputMode =
    params.requestedVizOutput ?? params.request.requestedVizOutput ?? 'auto';

  const attachedPsiTags = attachments
    .filter((a) => a.kind === 'psi-investigation' && a.psiId)
    .map((a) => a.psiId!)
    .filter((id) => !params.question.toUpperCase().includes(id.toUpperCase()));

  const groundedQuestion =
    attachedPsiTags.length > 0
      ? `${params.question} [${attachedPsiTags.join(', ')}]`
      : params.question;

  const selectedRunsForRequest =
    params.selectedRuns ??
    (params.request.selectedRunIds
      ? params.catalog.filter((r) => params.request.selectedRunIds!.includes(r.id))
      : []);

  // If remote live backend is configured, attempt POST /ask
  const activeProfile = getActiveEndpointProfile();
  const config = getApiEndpointConfig();
  const apiBaseUrl = config.baseUrl.trim().replace(/\/$/, '');

  let liveAskResult: {
    answer: string;
    steps: string[];
    citations: string[];
    suggestedVizMode?: string;
    guardrailWarning?: string;
    groundedModel?: string;
    flameSpread_mms?: number;
    hazardStatus?: SimulationResponse['hazardStatus'];
    dataTable?: StructuredDataTable;
  } | null = null;

  if (apiBaseUrl && activeProfile) {
    const liveSliders: VirtualTestConfig = {
      O2_pct: params.request.O2_pct,
      P_psi: params.request.P_psi,
      Flow_ms: params.request.Flow_ms,
      g_eff: params.request.g_eff,
      Thickness_mm: params.request.Thickness_mm,
      material: (params.request.material as VirtualTestConfig['material']) ?? 'PMMA',
      ignitionFlux_Wm2: params.request.ignitionFlux_Wm2 ?? 25000,
    };
    try {
      const askRes = await askLiveModel({
        question: groundedQuestion,
        mode: params.mode,
        sliders: liveSliders,
        catalog: params.catalog,
        archiveContext: params.archiveContext,
        customUrl:
          activeProfile.id !== ENV_DEFAULT_PROFILE_ID ? apiBaseUrl : undefined,
      });
      if (askRes && askRes.steps.length > 0) {
        liveAskResult = askRes;
      }
    } catch {
      // Offline or rate-limited fallback to Local Combustion Model pipeline below
    }
  }

  const response = await analyzeCombustionState(
    {
      ...params.request,
      question: groundedQuestion,
      consoleMode: params.mode,
      activeChartContext: params.chartContext ?? undefined,
      attachments,
      requestedVizOutput,
      comparatorRuns: selectedRunsForRequest,
      userProfile,
    },
    params.catalog,
    params.archiveContext
  );

  if (response.assistantReply) {
    const sliders: VirtualTestConfig = {
      O2_pct: params.request.O2_pct,
      P_psi: params.request.P_psi,
      Flow_ms: params.request.Flow_ms,
      g_eff: params.request.g_eff,
      Thickness_mm: params.request.Thickness_mm,
      material: (params.request.material as VirtualTestConfig['material']) ?? 'PMMA',
      ignitionFlux_Wm2: params.request.ignitionFlux_Wm2 ?? 25000,
    };

    const analyzeEndpointLabel = response.assistantReply.endpointLabel;
    const remoteAnalyzeSucceeded =
      analyzeEndpointLabel === MODEL_LABEL_CUSTOM ||
      analyzeEndpointLabel === MODEL_LABEL_ACTIVE;

    if (!liveAskResult && !remoteAnalyzeSucceeded) {
      liveAskResult = await runLocalCombustionModelPipeline({
        question: params.question,
        mode: params.mode,
        sliders,
        localSim: response,
        explanationDepth: userProfile.explanationDepth,
        chartContextSummary: params.chartContext?.summaryHeadline,
        catalog: params.catalog,
        archiveContext: params.archiveContext,
      });
    }

    const inlineChart = resolveChatVisualization({
      question: params.question,
      mode: params.mode,
      requestedVizOutput,
      attachments,
      chartContext: params.chartContext,
      selectedRuns: selectedRunsForRequest,
      catalogRuns: params.catalog,
      simulation: response,
      sliders,
      suggestedVizMode: response.assistantReply.suggestedVizMode,
      preferredCharts: userProfile.preferredCharts,
    });

    const verifiedNotes = response.assistantReply.steps.filter((s) =>
      s.includes('Verified Correction Applied')
    );

    const endpointLabel =
      liveAskResult?.groundedModel ||
      (remoteAnalyzeSucceeded && analyzeEndpointLabel
        ? analyzeEndpointLabel
        : MODEL_LABEL_LOCAL);

    let combinedSteps =
      liveAskResult && liveAskResult.steps.length > 0
        ? [
            ...verifiedNotes.filter(
              (note) => !liveAskResult!.steps.some((st) => st.includes(note))
            ),
            ...liveAskResult.steps,
          ]
        : response.assistantReply.steps;

    if (liveAskResult?.guardrailWarning) {
      combinedSteps = [
        `[GUARDRAIL WARNING] ${liveAskResult.guardrailWarning}`,
        ...combinedSteps,
      ];
    }

    const steps =
      inlineChart?.status === 'incompatible' && inlineChart.incompatibilityReason
        ? [
            `Selected Chart Incompatible: ${inlineChart.incompatibilityReason}`,
            ...combinedSteps,
          ]
        : combinedSteps;

    const citations = Array.from(
      new Set([
        ...attachments
          .filter((a) => a.psiId)
          .map((a) => a.psiId!.toUpperCase()),
        ...(liveAskResult?.citations ?? []),
        ...response.assistantReply.citations,
      ])
    ).slice(0, 6);

    const resolvedDataTable =
      liveAskResult?.dataTable ?? response.assistantReply.dataTable;

    return {
      ...response,
      assistantReply: {
        ...response.assistantReply,
        steps,
        citations,
        ...(resolvedDataTable ? { dataTable: resolvedDataTable } : {}),
        inlineChart,
        endpointLabel,
      },
    };
  }

  return response;
}

/**
 * Centralized chart-decoding brain for Visual Analytics Studio.
 * Evaluates residuals, cool-flame pockets, and saved researcher corrections across plotted runs.
 */
export function generateChartDecodeInsight(params: {
  datasetLabel: string;
  techniqueName: string;
  xAxisLabel: string;
  yAxisLabel: string;
  colorByLabel: string;
  plottedRuns: PsiRun[];
  simulation: SimulationResponse;
  summaryHeadline: string;
}): DecodedChartContext {
  const {
    datasetLabel,
    techniqueName,
    xAxisLabel,
    yAxisLabel,
    colorByLabel,
    plottedRuns,
    simulation,
    summaryHeadline,
  } = params;
  const corrections = getVerifiedCorrections();
  const anomalies: string[] = [];

  const coolCount = plottedRuns.filter(
    (r) => r.outcome === 'Cool Flame Caution'
  ).length;
  const rapidRuns = [...plottedRuns]
    .filter((r) => r.outcome === 'Rapid Flame Spread')
    .sort((a, b) => b.flameSpread_mms - a.flameSpread_mms);

  if (coolCount > 0) {
    anomalies.push(
      `${coolCount} run(s) exhibit non-luminous 550K–800K Cool-Flame NTC behavior with low optical emission.`
    );
  }
  if (rapidRuns[0]) {
    anomalies.push(
      `Peak spread outlier: ${rapidRuns[0].psiId} (${rapidRuns[0].material}) at ${rapidRuns[0].flameSpread_mms.toFixed(
        2
      )} mm/s under ${rapidRuns[0].O2_pct.toFixed(1)}% O2.`
    );
  }

  const maxResidual = plottedRuns
    .slice(0, 60)
    .map((r) => {
      const basePred = computeFlameSpreadVelocity({
        O2_pct: r.O2_pct,
        P_psi: r.P_psi,
        Flow_ms: r.Flow_ms,
        g_eff: r.g_eff,
        Thickness_mm: r.Thickness_mm,
        material: r.material,
      }).flameSpread_mms;
      const matches = findMatchingCorrections(r, corrections);
      const calibratedPred =
        matches[0] &&
        typeof matches[0].correction.correctedSpread_mms === 'number'
          ? matches[0].correction.correctedSpread_mms
          : basePred;
      return { run: r, diff: Math.abs(r.flameSpread_mms - calibratedPred) };
    })
    .sort((a, b) => b.diff - a.diff)[0];

  if (maxResidual && maxResidual.diff > 0.35) {
    anomalies.push(
      `Largest gap between flight data and model: ${maxResidual.run.psiId} (Δ = ${maxResidual.diff.toFixed(
        2
      )} mm/s).`
    );
  }

  if (anomalies.length === 0) {
    anomalies.push(
      `Active operating point predicts ${simulation.flameSpread_mms.toFixed(
        2
      )} mm/s (${simulation.hazardStatus}) with ${
        simulation.modelConfidence?.confidencePct ?? 92
      }% model confidence.`
    );
  }

  return {
    datasetLabel,
    techniqueName,
    xAxisLabel,
    yAxisLabel,
    colorByLabel,
    runCount: plottedRuns.length,
    anomalies,
    summaryHeadline,
  };
}

export interface ComparatorInsightSummary {
  headline: string;
  highlights: string[];
  matchedCorrectionsCount: number;
  endpointLabel: string;
}

/**
 * Centralized comparison insight generator for Run Comparator.
 */
export async function generateComparatorInsights(
  selectedRuns: PsiRun[]
): Promise<ComparatorInsightSummary> {
  const endpointLabel = getEffectiveEndpointLabel();
  if (selectedRuns.length === 0) {
    return {
      headline: 'Select 1 to 4 test runs to generate comparison insights.',
      highlights: [],
      matchedCorrectionsCount: 0,
      endpointLabel,
    };
  }

  const sortedBySpread = [...selectedRuns].sort(
    (a, b) => b.flameSpread_mms - a.flameSpread_mms
  );
  const fastest = sortedBySpread[0];
  const slowest = sortedBySpread[sortedBySpread.length - 1];
  const spreadRatio =
    slowest.flameSpread_mms > 0.01
      ? fastest.flameSpread_mms / slowest.flameSpread_mms
      : 1;
  const maxPeakTemp = [...selectedRuns].sort(
    (a, b) => b.peakTemp_K - a.peakTemp_K
  )[0];
  const coolRuns = selectedRuns.filter(
    (r) => r.outcome === 'Cool Flame Caution' || r.coolFlameObserved
  );

  const corrections = getVerifiedCorrections();
  let matchedCorrectionsCount = 0;
  for (const run of selectedRuns) {
    matchedCorrectionsCount += findMatchingCorrections(run, corrections).length;
  }

  // Ask active unified analyzer to evaluate the highest-spread run (remote if connected, local fallback if offline)
  const leadSim = await analyzeCombustionState({
    O2_pct: fastest.O2_pct,
    P_psi: fastest.P_psi,
    Flow_ms: fastest.Flow_ms,
    g_eff: fastest.g_eff,
    Thickness_mm: fastest.Thickness_mm,
    material: fastest.material,
    comparatorRuns: selectedRuns,
  });

  const highlights: string[] = [];
  if (selectedRuns.length >= 2) {
    highlights.push(
      `Fastest spread is ${fastest.psiId} (${fastest.material}) at ${fastest.flameSpread_mms.toFixed(
        2
      )} mm/s - ${spreadRatio.toFixed(1)}× faster than ${slowest.psiId} (${slowest.flameSpread_mms.toFixed(
        2
      )} mm/s).`
    );
  }
  highlights.push(
    `Peak combustion temperature reaches ${maxPeakTemp.peakTemp_K} K in ${maxPeakTemp.psiId} (${maxPeakTemp.O2_pct.toFixed(
      1
    )}% O2, ${maxPeakTemp.Flow_ms.toFixed(2)} m/s airflow).`
  );
  if (coolRuns.length > 0) {
    highlights.push(
      `${coolRuns.length} staged run(s) (${coolRuns
        .map((r) => r.psiId)
        .join(', ')}) show non-luminous 550K–800K cool-flame caution.`
    );
  } else {
    highlights.push(
      `Model check on leading hazard ${fastest.psiId} predicts ${leadSim.flameSpread_mms.toFixed(
        2
      )} mm/s (${leadSim.safeMaterialCheck.minSafeThickness_mm.toFixed(
        1
      )} mm safe minimum thickness).`
    );
  }

  return {
    headline:
      selectedRuns.length === 1
        ? `Single-run baseline: ${fastest.psiId} (${fastest.flameSpread_mms.toFixed(2)} mm/s, ${fastest.outcome}).`
        : `${selectedRuns.length} runs compared: ${fastest.psiId} sets upper spread risk (${fastest.flameSpread_mms.toFixed(
            2
          )} mm/s vs. ${slowest.psiId} at ${slowest.flameSpread_mms.toFixed(2)} mm/s).`,
    highlights,
    matchedCorrectionsCount,
    endpointLabel,
  };
}

export function processCustomDatasetUpload(
  rawContent: string,
  fileName: string
): ImportValidationResult {
  return validateAndNormalizeDataset(rawContent, fileName);
}
