/**
 * FLARE Production API Client & Local Combustion Model Pipeline
 * Handles connection health checks, strict /evaluate and /ask response normalization,
 * Gemini Flash synthesis with multi-model fallback, and dynamic local telemetry synthesis.
 */
import {
  ConsoleMode,
  HazardOutcome,
  PsiInvestigationRecord,
  PsiRun,
  SimulationRequest,
  SimulationResponse,
  VirtualTestConfig,
} from '../types/psi';
import {
  AssistantArchiveContext,
  runLocalPhysicsSimulation,
} from '../utils/physicsEngine';

export const DEFAULT_LIVE_API_URL =
  'https://collectables-accommodate-cumulative-chemical.trycloudflare.com';
export const FLARE_API_STORAGE_KEY = 'flare_live_backend_endpoint_url_v2';
export const FLARE_API_STATUS_STORAGE_KEY = 'flare_live_backend_status_cached_v2';
export const GEMINI_API_KEY_STORAGE_KEY = 'flare_gemini_api_key_v1';
export const FLARE_BACKEND_STATUS_EVENT = 'flare-backend-status-changed';

export const GEMINI_MODEL_CHAIN = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
] as const;

export const MODEL_LABEL_ACTIVE = 'Active Combustion Model';
export const MODEL_LABEL_LOCAL = 'Local Combustion Model';
export const MODEL_LABEL_CUSTOM = 'Custom API Endpoint';

export interface BackendConnectionSnapshot {
  connected: boolean;
  statusText: string;
  badgeLabel: string;
  latencyMs: number;
  checkedAtMs: number;
}

export interface AuditStatusResponse {
  ok: boolean;
  connected: boolean;
  latencyMs: number;
  badgeLabel: string;
  statusText: string;
}

export interface JepaForecasts {
  peakTempTrend?: string;
  spreadStability?: string;
  ignitionRiskScore?: number;
}

export interface EclssSuppressionMetrics {
  recommendedDiluent?: string;
  quenchingLatencySec?: number;
  extinctionMarginPct?: number;
}

export interface LiveEvaluateResponse {
  ok: boolean;
  flameSpread_mms: number;
  hazardStatus: HazardOutcome;
  peakTemp_K?: number;
  radiationFraction?: number;
  confidenceInterval_mms?: number;
  jepaForecasts?: JepaForecasts;
  eclssSuppression?: EclssSuppressionMetrics;
  endpointLabel: string;
}

export interface LiveAskResponse {
  blocked: boolean;
  answer: string;
  reason?: string;
  steps: string[];
  citations: string[];
  groundedModel: string;
  guardrailWarning?: string;
  flameSpread_mms?: number;
  hazardStatus?: HazardOutcome;
  latencyMs?: number;
  telemetry?: Partial<{
    flameSpread_mms: number;
    O2_pct: number;
    P_psi: number;
    Flow_ms: number;
    g_eff: number;
    peakTemp_K: number;
    radiationFraction: number;
    hazardStatus: HazardOutcome;
  }>;
}

let inMemoryConnectionSnapshot: BackendConnectionSnapshot | null = null;

function readEnvValue(keys: string[]): string {
  try {
    const metaEnv = (
      import.meta as unknown as { env?: Record<string, string | undefined> }
    )?.env;
    if (metaEnv) {
      for (const k of keys) {
        const val = metaEnv[k];
        if (typeof val === 'string' && val.trim()) {
          return val.trim();
        }
      }
    }
  } catch {
    // Ignore outside Vite runtime
  }
  try {
    const proc = (
      globalThis as unknown as {
        process?: { env?: Record<string, string | undefined> };
      }
    )?.process;
    if (proc?.env) {
      for (const k of keys) {
        const val = proc.env[k];
        if (typeof val === 'string' && val.trim()) {
          return val.trim();
        }
      }
    }
  } catch {
    // Ignore outside Node runtime
  }
  return '';
}

function readStorage(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (value === null || value === '') {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage quota or SSR errors
  }
}

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function getEnvIgnisUrl(): string {
  const fromEnv = readEnvValue(['VITE_IGNIS_API_URL', 'VITE_API_BASE_URL']);
  return normalizeUrl(fromEnv || DEFAULT_LIVE_API_URL);
}

export function getLiveBackendUrl(): string {
  const saved = readStorage(FLARE_API_STORAGE_KEY);
  if (saved && saved.trim()) {
    return normalizeUrl(saved);
  }
  return getEnvIgnisUrl();
}

export function hasCustomBackendUrlOverride(): boolean {
  const saved = readStorage(FLARE_API_STORAGE_KEY);
  if (!saved || !saved.trim()) return false;
  return normalizeUrl(saved) !== getEnvIgnisUrl();
}

export function setLiveBackendUrl(url: string): string {
  const clean = normalizeUrl(url);
  if (!clean || clean === getEnvIgnisUrl()) {
    writeStorage(FLARE_API_STORAGE_KEY, null);
    return getEnvIgnisUrl();
  }
  writeStorage(FLARE_API_STORAGE_KEY, clean);
  return clean;
}

export function resetLiveBackendUrl(): string {
  writeStorage(FLARE_API_STORAGE_KEY, null);
  return getEnvIgnisUrl();
}

export function getGeminiApiKey(): string {
  const saved = readStorage(GEMINI_API_KEY_STORAGE_KEY);
  if (saved && saved.trim()) {
    return saved.trim();
  }
  return readEnvValue(['VITE_GEMINI_API_KEY']);
}

export function hasCustomGeminiApiKey(): boolean {
  const saved = readStorage(GEMINI_API_KEY_STORAGE_KEY);
  return Boolean(saved && saved.trim());
}

export function setGeminiApiKey(key: string): string {
  const clean = key.trim();
  if (!clean) {
    writeStorage(GEMINI_API_KEY_STORAGE_KEY, null);
    return getGeminiApiKey();
  }
  writeStorage(GEMINI_API_KEY_STORAGE_KEY, clean);
  return clean;
}

export function resetGeminiApiKey(): string {
  writeStorage(GEMINI_API_KEY_STORAGE_KEY, null);
  return getGeminiApiKey();
}

export function safeFiniteNumber(val: unknown, fallback: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function normalizeHazardOutcome(
  raw: unknown,
  spreadMms?: number
): HazardOutcome {
  if (typeof raw === 'string') {
    const low = raw.toLowerCase();
    if (low.includes('rapid')) return 'Rapid Flame Spread';
    if (low.includes('cool')) return 'Cool Flame Caution';
    if (low.includes('self') || low.includes('extinguish')) {
      return 'Self-Extinguishing';
    }
  }
  if (typeof spreadMms === 'number' && Number.isFinite(spreadMms)) {
    if (spreadMms >= 1.5) return 'Rapid Flame Spread';
    if (spreadMms >= 0.45) return 'Cool Flame Caution';
    return 'Self-Extinguishing';
  }
  return 'Cool Flame Caution';
}

export function splitAnswerIntoParagraphs(answer: unknown): string[] {
  if (Array.isArray(answer)) {
    const items = answer
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item ?? '')))
      .map((s) => s.trim())
      .filter(Boolean);
    return items;
  }
  if (typeof answer === 'string') {
    const clean = answer.replace(/\r\n/g, '\n').trim();
    if (!clean) return [];
    const blocks = clean
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);
    if (blocks.length > 0) return blocks;
    return clean
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }
  if (answer && typeof answer === 'object') {
    const obj = answer as Record<string, unknown>;
    if (typeof obj.text === 'string' && obj.text.trim()) {
      return splitAnswerIntoParagraphs(obj.text);
    }
    if (typeof obj.summary === 'string' && obj.summary.trim()) {
      return splitAnswerIntoParagraphs(obj.summary);
    }
    try {
      return [JSON.stringify(obj)];
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeCitations(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) out.push(trimmed);
      continue;
    }
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const psiId =
        typeof rec.psi_id === 'string' && rec.psi_id.trim()
          ? rec.psi_id.trim()
          : typeof rec.psiId === 'string' && rec.psiId.trim()
          ? rec.psiId.trim()
          : 'PSI-Archive';
      const source =
        typeof rec.source_file === 'string' && rec.source_file.trim()
          ? rec.source_file.trim()
          : typeof rec.source === 'string' && rec.source.trim()
          ? rec.source.trim()
          : 'PSI Fire Safety Archive';
      const pageRaw = rec.page_number ?? rec.page;
      const pageNum = safeFiniteNumber(pageRaw, 1);
      const excerpt =
        typeof rec.excerpt === 'string' && rec.excerpt.trim()
          ? ` - ${rec.excerpt.trim()}`
          : '';
      out.push(`${psiId} (${source}, p.${pageNum})${excerpt}`);
    }
  }
  return out;
}

export function normalizeLiveAskResponse(
  payload: unknown,
  fallbackModelLabel: string = MODEL_LABEL_ACTIVE,
  fallbackSpread?: number
): LiveAskResponse {
  const safeFallbackSpread = safeFiniteNumber(fallbackSpread, 1.0);
  if (!payload || typeof payload !== 'object') {
    const answerText =
      typeof payload === 'string' && payload.trim()
        ? payload.trim()
        : 'Response received from combustion model.';
    return {
      blocked: false,
      answer: answerText,
      steps: splitAnswerIntoParagraphs(answerText),
      citations: [],
      groundedModel: fallbackModelLabel,
      flameSpread_mms: safeFallbackSpread,
      hazardStatus: normalizeHazardOutcome(undefined, safeFallbackSpread),
    };
  }

  const data = payload as Record<string, unknown>;
  const blocked = Boolean(data.blocked);
  const reason =
    typeof data.reason === 'string' && data.reason.trim()
      ? data.reason.trim()
      : undefined;

  const rawAnswer =
    data.answer ??
    data.response ??
    data.text ??
    data.message ??
    (Array.isArray(data.steps) ? data.steps : undefined) ??
    reason ??
    '';

  const parsedFromSteps = Array.isArray(data.steps)
    ? data.steps
        .map((s) => (typeof s === 'string' ? s.trim() : String(s ?? '').trim()))
        .filter(Boolean)
    : [];

  const parsedFromSections = Array.isArray(data.sections)
    ? data.sections
        .map((sec) => {
          if (typeof sec === 'string') return sec.trim();
          if (sec && typeof sec === 'object') {
            const s = sec as Record<string, unknown>;
            const heading = typeof s.title === 'string' ? `${s.title}: ` : '';
            const body =
              typeof s.content === 'string'
                ? s.content
                : typeof s.text === 'string'
                ? s.text
                : '';
            return `${heading}${body}`.trim();
          }
          return '';
        })
        .filter(Boolean)
    : [];

  let steps =
    parsedFromSteps.length > 0
      ? parsedFromSteps
      : splitAnswerIntoParagraphs(rawAnswer);

  if (parsedFromSections.length > 0 && steps.length === 0) {
    steps = parsedFromSections;
  }
  if (steps.length === 0 && reason) {
    steps = [reason];
  }
  if (steps.length === 0) {
    steps = [
      blocked
        ? 'The query was filtered by the combustion domain guardrail. Try asking about fire spread, cabin oxygen, airflow, or a PSI investigation.'
        : 'Combustion evaluation completed using grounded telemetry and archival records.',
    ];
  }

  const telemetryObj =
    data.telemetry && typeof data.telemetry === 'object'
      ? (data.telemetry as Record<string, unknown>)
      : {};

  const spreadVal = safeFiniteNumber(
    telemetryObj.flameSpread_mms ?? data.flameSpread_mms ?? data.spread_mms,
    safeFallbackSpread
  );
  const hazard = normalizeHazardOutcome(
    telemetryObj.hazardStatus ?? data.hazardStatus ?? data.regime,
    spreadVal
  );

  const normalizedCitations = normalizeCitations(
    Array.isArray(data.citations) ? data.citations : []
  );

  const rawPoints = Array.isArray(data.points) ? data.points : [];
  if (rawPoints.length > 0 && steps.length === 1 && !blocked) {
    steps = [
      ...steps,
      ...rawPoints
        .map((pt) => (typeof pt === 'string' ? pt.trim() : ''))
        .filter(Boolean)
        .slice(0, 6),
    ];
  }

  const answer =
    typeof rawAnswer === 'string' && rawAnswer.trim()
      ? rawAnswer.trim()
      : steps.join('\n\n');

  const safeTelemetry: LiveAskResponse['telemetry'] = {
    flameSpread_mms: spreadVal,
    hazardStatus: hazard,
    O2_pct: Number.isFinite(Number(telemetryObj.O2_pct))
      ? Number(telemetryObj.O2_pct)
      : undefined,
    P_psi: Number.isFinite(Number(telemetryObj.P_psi))
      ? Number(telemetryObj.P_psi)
      : undefined,
    Flow_ms: Number.isFinite(Number(telemetryObj.Flow_ms))
      ? Number(telemetryObj.Flow_ms)
      : undefined,
    g_eff: Number.isFinite(Number(telemetryObj.g_eff))
      ? Number(telemetryObj.g_eff)
      : undefined,
    peakTemp_K: Number.isFinite(Number(telemetryObj.peakTemp_K))
      ? Number(telemetryObj.peakTemp_K)
      : undefined,
    radiationFraction: Number.isFinite(Number(telemetryObj.radiationFraction))
      ? Number(telemetryObj.radiationFraction)
      : undefined,
  };

  return {
    blocked,
    answer,
    reason,
    steps,
    citations: normalizedCitations,
    groundedModel: fallbackModelLabel,
    guardrailWarning:
      typeof data.guardrailWarning === 'string' && data.guardrailWarning.trim()
        ? data.guardrailWarning.trim()
        : blocked && reason
        ? reason
        : undefined,
    flameSpread_mms: spreadVal,
    hazardStatus: hazard,
    latencyMs: Number.isFinite(Number(data.latencyMs))
      ? Number(data.latencyMs)
      : undefined,
    telemetry: safeTelemetry,
  };
}

function scrubLegacyStatusText(raw: string): string {
  if (!raw || /32\/32|certified|v2|version 2/i.test(raw)) {
    return 'Local Mode';
  }
  return raw;
}

export function getCachedBackendConnectionStatus(): BackendConnectionSnapshot {
  if (inMemoryConnectionSnapshot) {
    return inMemoryConnectionSnapshot;
  }
  const raw = readStorage(FLARE_API_STATUS_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<BackendConnectionSnapshot>;
      const connected = Boolean(parsed.connected);
      const latencyMs = safeFiniteNumber(parsed.latencyMs, 0);
      const cleanLabel = connected
        ? latencyMs > 0
          ? `Connected · ${Math.round(latencyMs)} ms`
          : 'Connected'
        : scrubLegacyStatusText(String(parsed.badgeLabel ?? 'Local Mode'));
      return {
        connected,
        latencyMs,
        statusText: cleanLabel,
        badgeLabel: cleanLabel,
        checkedAtMs: safeFiniteNumber(parsed.checkedAtMs, 0),
      };
    } catch {
      // Fallback below
    }
  }
  return {
    connected: false,
    statusText: 'Local Mode',
    badgeLabel: 'Local Mode',
    latencyMs: 0,
    checkedAtMs: 0,
  };
}

function publishBackendConnectionStatus(snapshot: BackendConnectionSnapshot): void {
  inMemoryConnectionSnapshot = snapshot;
  writeStorage(FLARE_API_STATUS_STORAGE_KEY, JSON.stringify(snapshot));
  try {
    if (
      typeof window !== 'undefined' &&
      typeof window.dispatchEvent === 'function' &&
      typeof CustomEvent === 'function'
    ) {
      window.dispatchEvent(
        new CustomEvent(FLARE_BACKEND_STATUS_EVENT, { detail: snapshot })
      );
    }
  } catch {
    // Ignore non-browser test runners
  }
}

export async function testFlareApiConnection(customUrl?: string): Promise<{
  ok: boolean;
  connected: boolean;
  statusText: string;
  latencyMs: number;
  badgeLabel: string;
}> {
  const baseUrl = normalizeUrl(customUrl || getLiveBackendUrl());
  if (!baseUrl) {
    const offline: BackendConnectionSnapshot = {
      connected: false,
      statusText: 'Local Mode',
      badgeLabel: 'Local Mode',
      latencyMs: 0,
      checkedAtMs: Date.now(),
    };
    publishBackendConnectionStatus(offline);
    return { ok: false, ...offline };
  }

  const startedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  const tryHealth = async (pathSuffix: string): Promise<Response | null> => {
    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), 5000)
      : null;
    try {
      const res = await fetch(`${baseUrl}${pathSuffix}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller?.signal,
      });
      return res;
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  let res = await tryHealth('/health');
  if (!res || !res.ok) {
    res = await tryHealth('/api/audit-status');
  }

  if (res && res.ok) {
    const elapsed = Math.max(
      1,
      Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
          startedAt
      )
    );
    const label = `Connected · ${elapsed} ms`;
    const snapshot: BackendConnectionSnapshot = {
      connected: true,
      statusText: label,
      badgeLabel: label,
      latencyMs: elapsed,
      checkedAtMs: Date.now(),
    };
    publishBackendConnectionStatus(snapshot);
    return { ok: true, ...snapshot };
  }

  const offline: BackendConnectionSnapshot = {
    connected: false,
    statusText: 'Local Mode',
    badgeLabel: 'Local Mode',
    latencyMs: 0,
    checkedAtMs: Date.now(),
  };
  publishBackendConnectionStatus(offline);
  return { ok: false, ...offline };
}

export async function fetchAuditStatus(): Promise<AuditStatusResponse> {
  const result = await testFlareApiConnection();
  return {
    ok: result.ok,
    connected: result.connected,
    latencyMs: result.latencyMs,
    badgeLabel: result.badgeLabel,
    statusText: result.statusText,
  };
}

export async function fetchLiveInvestigations(): Promise<
  PsiInvestigationRecord[] | null
> {
  const baseUrl = getLiveBackendUrl();
  if (!baseUrl) return null;
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 4500) : null;
  try {
    const res = await fetch(`${baseUrl}/api/investigations`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (Array.isArray(data)) return data as PsiInvestigationRecord[];
    if (
      data &&
      typeof data === 'object' &&
      Array.isArray((data as { investigations?: unknown[] }).investigations)
    ) {
      return (data as { investigations: PsiInvestigationRecord[] }).investigations;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function evaluateCombustionState(
  request: SimulationRequest,
  catalog: PsiRun[],
  archiveContext?: AssistantArchiveContext
): Promise<{
  simulation: SimulationResponse;
  jepaForecasts?: JepaForecasts;
  eclssSuppression?: EclssSuppressionMetrics;
  endpointLabel: string;
}> {
  const localBase = runLocalPhysicsSimulation(request, catalog, archiveContext);
  const baseUrl = getLiveBackendUrl();
  const attribution = hasCustomBackendUrlOverride()
    ? MODEL_LABEL_CUSTOM
    : MODEL_LABEL_ACTIVE;

  if (!baseUrl) {
    return {
      simulation: localBase,
      endpointLabel: MODEL_LABEL_LOCAL,
    };
  }

  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 6500) : null;
  const startedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    const res = await fetch(`${baseUrl}/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        O2_pct: request.O2_pct,
        P_psi: request.P_psi,
        Flow_ms: request.Flow_ms,
        g_eff: request.g_eff,
        Thickness_mm: request.Thickness_mm,
        material: request.material ?? 'PMMA',
        ignitionFlux_Wm2: request.ignitionFlux_Wm2 ?? 25000,
      }),
      signal: controller?.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const payload = (await res.json()) as Record<string, unknown>;
    const elapsed = Math.max(
      1,
      Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
          startedAt
      )
    );
    publishBackendConnectionStatus({
      connected: true,
      statusText: `Connected · ${elapsed} ms`,
      badgeLabel: `Connected · ${elapsed} ms`,
      latencyMs: elapsed,
      checkedAtMs: Date.now(),
    });

    const spreadVal = safeFiniteNumber(
      payload.flameSpread_mms ?? payload.spread_mms,
      localBase.flameSpread_mms
    );
    const hazard = normalizeHazardOutcome(payload.hazardStatus, spreadVal);
    const merged: SimulationResponse = {
      ...localBase,
      flameSpread_mms: Number(spreadVal.toFixed(2)),
      hazardStatus: hazard,
      peakTemp_K: Math.round(
        safeFiniteNumber(payload.peakTemp_K, localBase.peakTemp_K)
      ),
      confidenceInterval_mms: safeFiniteNumber(
        payload.confidenceInterval_mms,
        localBase.confidenceInterval_mms
      ),
      assistantReply: localBase.assistantReply
        ? {
            ...localBase.assistantReply,
            endpointLabel: attribution,
          }
        : undefined,
    };

    return {
      simulation: merged,
      jepaForecasts:
        payload.jepaForecasts && typeof payload.jepaForecasts === 'object'
          ? (payload.jepaForecasts as JepaForecasts)
          : undefined,
      eclssSuppression:
        payload.eclssSuppression && typeof payload.eclssSuppression === 'object'
          ? (payload.eclssSuppression as EclssSuppressionMetrics)
          : undefined,
      endpointLabel: attribution,
    };
  } catch {
    return {
      simulation: localBase,
      endpointLabel: MODEL_LABEL_LOCAL,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function askLiveModel(params: {
  question: string;
  mode: ConsoleMode;
  sliders: VirtualTestConfig;
  catalog: PsiRun[];
  archiveContext?: AssistantArchiveContext;
  customUrl?: string;
}): Promise<LiveAskResponse> {
  const baseUrl = normalizeUrl(params.customUrl || getLiveBackendUrl());
  const localSim = runLocalPhysicsSimulation(
    {
      ...params.sliders,
      consoleMode: params.mode,
      question: params.question,
    },
    params.catalog,
    params.archiveContext
  );

  const attribution =
    params.customUrl || hasCustomBackendUrlOverride()
      ? MODEL_LABEL_CUSTOM
      : MODEL_LABEL_ACTIVE;

  if (!baseUrl) {
    throw new Error('No live endpoint configured');
  }

  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 9000) : null;
  const startedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    const res = await fetch(`${baseUrl}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        question: params.question,
        mode: params.mode,
        material: params.sliders.material,
        O2_pct: params.sliders.O2_pct,
        P_psi: params.sliders.P_psi,
        Flow_ms: params.sliders.Flow_ms,
        g_eff: params.sliders.g_eff,
        Thickness_mm: params.sliders.Thickness_mm,
        ignitionFlux_Wm2: params.sliders.ignitionFlux_Wm2,
        sliders: params.sliders,
        nearest_runs: localSim.nearestRuns.slice(0, 3).map((nr) => ({
          psiId: nr.run.psiId,
          runCode: nr.run.runCode,
          material: nr.run.material,
          O2_pct: nr.run.O2_pct,
          flameSpread_mms: nr.run.flameSpread_mms,
          outcome: nr.run.outcome,
        })),
      }),
      signal: controller?.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const rawJson = (await res.json()) as unknown;
    const elapsed = Math.max(
      1,
      Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
          startedAt
      )
    );
    publishBackendConnectionStatus({
      connected: true,
      statusText: `Connected · ${elapsed} ms`,
      badgeLabel: `Connected · ${elapsed} ms`,
      latencyMs: elapsed,
      checkedAtMs: Date.now(),
    });

    const normalized = normalizeLiveAskResponse(
      rawJson,
      attribution,
      localSim.flameSpread_mms
    );

    if (normalized.citations.length === 0 && localSim.assistantReply?.citations?.length) {
      normalized.citations = localSim.assistantReply.citations;
    }

    return {
      ...normalized,
      latencyMs: elapsed,
      groundedModel: attribution,
    };
  } catch (err) {
    publishBackendConnectionStatus({
      connected: false,
      statusText: 'Local Mode',
      badgeLabel: 'Local Mode',
      latencyMs: 0,
      checkedAtMs: Date.now(),
    });
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isConversationalGreeting(question: string): boolean {
  const clean = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return true;
  const greetings = new Set([
    'hi',
    'hello',
    'hey',
    'good morning',
    'good afternoon',
    'good evening',
    'thanks',
    'thank you',
    'yo',
    'sup',
    'help',
    'who are you',
    'what can you do',
  ]);
  if (greetings.has(clean)) return true;
  return /^(hi|hello|hey)\b/.test(clean) && clean.split(' ').length <= 4;
}

function synthesizeDynamicLocalTelemetryResponse(params: {
  question: string;
  mode: ConsoleMode;
  sliders: VirtualTestConfig;
  localSim: SimulationResponse;
  explanationDepth?: 'concise' | 'standard' | 'detailed';
}): LiveAskResponse {
  const { question, mode, sliders, localSim } = params;
  const o2 = safeFiniteNumber(sliders.O2_pct, 21).toFixed(1);
  const press = safeFiniteNumber(sliders.P_psi, 14.7).toFixed(1);
  const flow = safeFiniteNumber(sliders.Flow_ms, 0.15).toFixed(2);
  const grav = safeFiniteNumber(sliders.g_eff, 0.166).toFixed(3);
  const thick = safeFiniteNumber(sliders.Thickness_mm, 2.0).toFixed(1);
  const spread = safeFiniteNumber(localSim.flameSpread_mms, 0).toFixed(2);
  const materialLoiVal =
    localSim.materialRankings.find(
      (m) => m.code === sliders.material || m.name === sliders.material
    )?.limitingO2_pct ?? 18.0;
  const loi = safeFiniteNumber(materialLoiVal, 18.0).toFixed(1);
  const peakTemp = Math.round(safeFiniteNumber(localSim.peakTemp_K, 1450));
  const minThick = safeFiniteNumber(
    localSim.safeMaterialCheck?.minSafeThickness_mm,
    2.5
  ).toFixed(1);
  const margin = safeFiniteNumber(localSim.safeMaterialCheck?.margin_mm, 0);

  const topMatch = localSim.nearestRuns[0]?.run;
  const matchLine = topMatch
    ? `${topMatch.psiId} / ${topMatch.runCode} (${topMatch.material}, ${safeFiniteNumber(topMatch.O2_pct, 21).toFixed(1)}% O2, spread ${safeFiniteNumber(topMatch.flameSpread_mms, 0).toFixed(2)} mm/s)`
    : 'archival microgravity baselines';

  if (isConversationalGreeting(question)) {
    const greetingSteps = [
      `Hello! I am FLARE's Local Combustion Model. Your active test chamber is set to ${sliders.material} at ${o2}% O2, ${press} psi, ${flow} m/s airflow, and ${grav}g (${thick} mm thickness), predicting ${spread} mm/s (${localSim.hazardStatus}).`,
      `Nearest reference flight run: ${matchLine}. Ask me to compare lunar vs. ISS fire behavior, run a what-if oxygen sweep, audit material thickness compliance (currently ${margin >= 0 ? 'passing' : 'below'} the ${minThick} mm minimum), or decode your active chart.`,
    ];
    return {
      blocked: false,
      answer: greetingSteps.join('\n\n'),
      steps: greetingSteps,
      citations: localSim.assistantReply?.citations ?? [],
      groundedModel: MODEL_LABEL_LOCAL,
      flameSpread_mms: localSim.flameSpread_mms,
      hazardStatus: localSim.hazardStatus,
    };
  }

  const baseSteps = [...(localSim.assistantReply?.steps ?? [])];
  if (baseSteps.length === 0) {
    baseSteps.push(
      `Local physics evaluation for "${question.trim()}" on ${sliders.material} (${o2}% O2, ${press} psi, ${flow} m/s, ${grav}g, ${thick} mm): predicted flame spread is ${spread} mm/s (${localSim.hazardStatus}, peak ${peakTemp} K, LOI ${loi}%).`,
      `Thickness check: ${localSim.safeMaterialCheck?.passed ? 'PASS' : 'FAIL'} relative to ${minThick} mm minimum safe thickness (${margin >= 0 ? `+${margin.toFixed(1)}` : margin.toFixed(1)} mm margin). Closest flight match: ${matchLine}.`
    );
  } else if (mode === 'what-if' || mode === 'risk-audit') {
    baseSteps.unshift(
      `Active chamber baseline (${sliders.material} @ ${o2}% O2, ${press} psi, ${flow} m/s, ${grav}g): ${spread} mm/s (${localSim.hazardStatus}), matched closely against ${matchLine}.`
    );
  }

  return {
    blocked: false,
    answer: baseSteps.join('\n\n'),
    steps: baseSteps,
    citations: localSim.assistantReply?.citations ?? [],
    groundedModel: MODEL_LABEL_LOCAL,
    flameSpread_mms: localSim.flameSpread_mms,
    hazardStatus: localSim.hazardStatus,
  };
}

/**
 * Unified 3-step pipeline for Local Combustion Model:
 *   Step A: Local physics, PSI archive & active chart grounding
 *   Step B: Gemini Flash synthesis with multi-model fallback chain (3.8 Flash -> 3.5 Flash-Lite -> 3.6 Flash)
 *   Step C: Dynamic local telemetry failover under identical attribution
 */
export async function runLocalCombustionModelPipeline(params: {
  question: string;
  mode: ConsoleMode;
  sliders: VirtualTestConfig;
  localSim: SimulationResponse;
  explanationDepth?: 'concise' | 'standard' | 'detailed';
  chartContextSummary?: string;
}): Promise<LiveAskResponse> {
  const { question, mode, sliders, localSim, explanationDepth, chartContextSummary } = params;
  const apiKey = getGeminiApiKey();

  if (!apiKey || typeof fetch !== 'function') {
    return synthesizeDynamicLocalTelemetryResponse(params);
  }

  const topRunsText = localSim.nearestRuns
    .slice(0, 3)
    .map(
      (nr, idx) =>
        `${idx + 1}. ${nr.run.psiId} / ${nr.run.runCode} (${nr.run.material}, ${safeFiniteNumber(nr.run.O2_pct, 21).toFixed(1)}% O2, ${safeFiniteNumber(nr.run.P_psi, 14.7).toFixed(1)} psi, ${safeFiniteNumber(nr.run.Flow_ms, 0).toFixed(2)} m/s, ${safeFiniteNumber(nr.run.g_eff, 0).toFixed(3)}g, spread ${safeFiniteNumber(nr.run.flameSpread_mms, 0).toFixed(2)} mm/s, ${nr.run.outcome})`
    )
    .join('\n');

  const depthInstruction =
    explanationDepth === 'concise'
      ? 'Keep the response crisp and concise (2 short paragraphs).'
      : explanationDepth === 'detailed'
      ? 'Provide thorough engineering depth (3-4 structured paragraphs covering heat balance, convective vs radiative behavior, and material thickness margin).'
      : 'Keep the response clear, grounded, and well-structured (2-3 paragraphs).';

  const loiPct =
    localSim.materialRankings.find(
      (m) => m.code === sliders.material || m.name === sliders.material
    )?.limitingO2_pct ?? 18.0;

  const systemPrompt = [
    'You are the FLARE Local Combustion Model for spaceflight fire safety analysis.',
    'Do not use em-dashes. Use standard hyphens instead. Never fabricate PSI IDs outside those provided.',
    'If the user sends a casual greeting (like Hi or Hello), reply conversationally, summarize the active chamber state in 1 sentence, and suggest helpful engineering questions.',
    `Mode: ${mode}. ${depthInstruction}`,
    `Active Chamber State: material=${sliders.material}, O2=${safeFiniteNumber(sliders.O2_pct, 21).toFixed(1)}%, pressure=${safeFiniteNumber(sliders.P_psi, 14.7).toFixed(1)} psi, airflow=${safeFiniteNumber(sliders.Flow_ms, 0.15).toFixed(2)} m/s, gravity=${safeFiniteNumber(sliders.g_eff, 0.166).toFixed(3)}g, thickness=${safeFiniteNumber(sliders.Thickness_mm, 2.0).toFixed(1)} mm.`,
    `Computed Physics: flameSpread=${safeFiniteNumber(localSim.flameSpread_mms, 0).toFixed(2)} mm/s, regime=${localSim.hazardStatus}, LOI=${safeFiniteNumber(loiPct, 18).toFixed(1)}%, peakTemp=${Math.round(safeFiniteNumber(localSim.peakTemp_K, 1400))} K, minSafeThickness=${safeFiniteNumber(localSim.safeMaterialCheck?.minSafeThickness_mm, 2).toFixed(1)} mm (${localSim.safeMaterialCheck?.passed ? 'PASS' : 'FAIL'}).`,
    topRunsText ? `Nearest Real Flight Runs:\n${topRunsText}` : '',
    chartContextSummary ? `Attached Chart Context:\n${chartContextSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  for (const modelName of GEMINI_MODEL_CHAIN) {
    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 9000) : null;

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: question.trim() || 'Summarize the active test chamber state.' }],
            },
          ],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 700,
          },
        }),
        signal: controller?.signal,
      });

      if (res.status === 404 || res.status === 429 || !res.ok) {
        continue;
      }

      const json = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const parts = json?.candidates?.[0]?.content?.parts;
      const text = Array.isArray(parts)
        ? parts
            .map((p) => (typeof p?.text === 'string' ? p.text : ''))
            .join('\n')
            .trim()
        : '';

      if (!text) {
        continue;
      }

      const cleanText = text.replace(/\u2014/g, ' - ');
      const steps = splitAnswerIntoParagraphs(cleanText);
      if (steps.length === 0) continue;

      return {
        blocked: false,
        answer: cleanText,
        steps,
        citations: localSim.assistantReply?.citations ?? [],
        groundedModel: MODEL_LABEL_LOCAL,
        flameSpread_mms: localSim.flameSpread_mms,
        hazardStatus: localSim.hazardStatus,
      };
    } catch {
      // Advance cleanly to next model in fallback chain
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return synthesizeDynamicLocalTelemetryResponse(params);
}
