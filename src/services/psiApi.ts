import {
  ConsoleMode,
  DecodedChartContext,
  PsiApiEndpointConfig,
  PsiRun,
  SimulationRequest,
  SimulationResponse,
} from '../types/psi';
import {
  AssistantArchiveContext,
  runLocalPhysicsSimulation,
} from '../utils/physicsEngine';
import {
  ImportValidationResult,
  validateAndNormalizeDataset,
} from '../utils/dataImporter';

const API_CONFIG_STORAGE_KEY = 'psi_api_endpoint_config_v1';

const DEFAULT_API_CONFIG: PsiApiEndpointConfig = {
  baseUrl:
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string | undefined> })
        .env?.VITE_API_BASE_URL?.trim()) ||
    '',
  apiKeyHeader: 'X-API-Key',
  apiKeyValue: '',
};

export function getApiEndpointConfig(): PsiApiEndpointConfig {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(API_CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PsiApiEndpointConfig>;
        return {
          baseUrl: parsed.baseUrl?.trim() ?? DEFAULT_API_CONFIG.baseUrl,
          apiKeyHeader:
            parsed.apiKeyHeader === 'Authorization'
              ? 'Authorization'
              : 'X-API-Key',
          apiKeyValue: parsed.apiKeyValue ?? '',
        };
      }
    }
  } catch {
    // Ignore localStorage parse errors and return default config
  }
  return { ...DEFAULT_API_CONFIG };
}

export function saveApiEndpointConfig(
  config: PsiApiEndpointConfig
): PsiApiEndpointConfig {
  const sanitized: PsiApiEndpointConfig = {
    baseUrl: config.baseUrl.trim().replace(/\/$/, ''),
    apiKeyHeader:
      config.apiKeyHeader === 'Authorization' ? 'Authorization' : 'X-API-Key',
    apiKeyValue: config.apiKeyValue.trim(),
  };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        API_CONFIG_STORAGE_KEY,
        JSON.stringify(sanitized)
      );
    }
  } catch {
    // Ignore storage failures in restricted contexts
  }
  return sanitized;
}

export function isRemoteApiConfigured(config = getApiEndpointConfig()): boolean {
  return Boolean(config.baseUrl && config.baseUrl.trim().length > 0);
}

function buildAuthHeaders(config: PsiApiEndpointConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKeyValue) {
    headers[config.apiKeyHeader] =
      config.apiKeyHeader === 'Authorization' &&
      !config.apiKeyValue.toLowerCase().startsWith('bearer ')
        ? `Bearer ${config.apiKeyValue}`
        : config.apiKeyValue;
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
}> {
  const baseUrl = config.baseUrl.trim().replace(/\/$/, '');
  if (!baseUrl) {
    return {
      ok: true,
      latencyMs: 1,
      mode: 'offline-fallback',
      message:
        'No remote FastAPI URL configured. Operating seamlessly via Local Physics + Archive Inference Engine.',
    };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: buildAuthHeaders(config),
      signal: controller.signal,
    });
    const latencyMs = Math.max(1, Date.now() - started);
    if (res.ok) {
      return {
        ok: true,
        latencyMs,
        mode: 'remote',
        message: `Connected to live inference endpoint (${baseUrl}) in ${latencyMs} ms.`,
      };
    }
    return {
      ok: false,
      latencyMs,
      mode: 'offline-fallback',
      message: `Endpoint returned HTTP ${res.status}. Automatic local fallback active.`,
    };
  } catch {
    const latencyMs = Math.max(1, Date.now() - started);
    return {
      ok: false,
      latencyMs,
      mode: 'offline-fallback',
      message: `Endpoint unreachable (${baseUrl}). Offline deterministic fallback engine active.`,
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

  return {
    ...localFallback,
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
      ? { assistantReply: r.assistantReply as SimulationResponse['assistantReply'] }
      : {}),
  };
}

/**
 * Centralized API adapter for PSI Data Manager.
 * Routes Virtual Test Lab predictions, confidence scoring, telemetry decoding,
 * hypothetical What-If sweeps, and risk audits to configured FastAPI backend or
 * deterministic local combustion physics + archive engine when offline.
 */
export async function analyzeCombustionState(
  request: SimulationRequest,
  catalog: PsiRun[] = [],
  archiveContext?: AssistantArchiveContext
): Promise<SimulationResponse> {
  const config = getApiEndpointConfig();
  const apiBaseUrl = config.baseUrl.trim().replace(/\/$/, '');

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
  };

  if (apiBaseUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${apiBaseUrl}/api/analyze`, {
        method: 'POST',
        headers: buildAuthHeaders(config),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (response.ok) {
        const remoteData = (await response.json()) as unknown;
        const localFallback = runLocalPhysicsSimulation(
          request,
          catalog,
          archiveContext
        );
        return sanitizeRemoteSimulationPatch(remoteData, localFallback);
      }
    } catch {
      // Fall back cleanly to local deterministic physics calculation if external FastAPI backend is offline
    } finally {
      clearTimeout(timer);
    }
  }

  if (request.question) {
    await new Promise((resolve) => setTimeout(resolve, 110));
  }

  return runLocalPhysicsSimulation(request, catalog, archiveContext);
}

export async function runModelConsoleInference(params: {
  question: string;
  mode: ConsoleMode;
  request: SimulationRequest;
  catalog: PsiRun[];
  archiveContext?: AssistantArchiveContext;
  chartContext?: DecodedChartContext | null;
}): Promise<SimulationResponse> {
  return analyzeCombustionState(
    {
      ...params.request,
      question: params.question,
      consoleMode: params.mode,
      activeChartContext: params.chartContext ?? undefined,
    },
    params.catalog,
    params.archiveContext
  );
}

export function processCustomDatasetUpload(
  rawContent: string,
  fileName: string
): ImportValidationResult {
  return validateAndNormalizeDataset(rawContent, fileName);
}
