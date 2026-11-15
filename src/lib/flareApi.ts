/**
 * FLARE Production API Client & Local Combustion Model Pipeline
 * Handles connection health checks, strict /evaluate and /ask response normalization,
 * Gemini Flash synthesis with multi-model fallback, and dynamic local telemetry synthesis.
 */
import {
  ConsoleMode,
  HazardOutcome,
  LiteratureChunk,
  MissionSpinoffCase,
  PsiInvestigationRecord,
  PsiRun,
  SimulationRequest,
  SimulationResponse,
  StructuredDataTable,
  VirtualTestConfig,
} from '../types/psi';
import { MISSION_AND_SPINOFF_CASES } from '../data/missionAndSpinoffCases';
import {
  AssistantArchiveContext,
  computeFlameSpreadVelocity,
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
  dataTable?: StructuredDataTable;
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

const KEYWORD_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'what',
  'which',
  'where',
  'when',
  'how',
  'why',
  'who',
  'show',
  'list',
  'table',
  'give',
  'find',
  'search',
  'compare',
  'versus',
  'about',
  'between',
  'tell',
  'could',
  'would',
  'should',
  'please',
  'does',
  'into',
  'from',
  'that',
  'this',
  'these',
  'those',
  'have',
  'has',
  'had',
  'were',
  'was',
  'been',
  'are',
  'all',
  'can',
  'did',
  'use',
  'using',
  'make',
  'pop',
  'out',
  'get',
  'me',
  'my',
  'you',
  'your',
  'any',
  'based',
]);

const SHORT_DOMAIN_TOKENS = new Set([
  'o2',
  'co',
  '0g',
  '1g',
  'ir',
]);

interface KeywordSignals {
  qLower: string;
  tokens: string[];
  psiIds: string[];
  materials: string[];
  targetO2: number | null;
  targetGravity: 'orbital' | 'lunar' | 'martian' | 'terrestrial' | null;
  asksForGravityCompare: boolean;
  asksForMaterials: boolean;
  asksForMission: boolean;
  asksForInvestigations: boolean;
  asksForGuide: boolean;
  asksForRuns: boolean;
  asksCoolFlame: boolean;
  asksRapidSpread: boolean;
  asksSafeExtinguish: boolean;
}

function extractKeywordSignals(question: string): KeywordSignals {
  const qLower = question.toLowerCase().trim();
  const rawTokens = qLower
    .split(/[^a-z0-9.%-]+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length >= 3 || SHORT_DOMAIN_TOKENS.has(t));

  const expandedSet = new Set<string>();
  for (const tok of rawTokens) {
    if (KEYWORD_STOP_WORDS.has(tok)) continue;
    expandedSet.add(tok);
    if (tok === 'teflon') expandedSet.add('ptfe');
    if (tok === 'acrylic' || tok === 'plexiglass') expandedSet.add('pmma');
    if (tok === 'aramid') expandedSet.add('nomex');
    if (tok === 'moon' || tok === 'lunar') expandedSet.add('lunar');
    if (tok === 'mars' || tok === 'martian') expandedSet.add('martian');
    if (tok === 'oxygen') expandedSet.add('o2');
    if (tok === 'spin-off' || tok === 'spinoff' || tok === 'spinoffs') {
      expandedSet.add('spinoff');
    }
  }
  const tokens = Array.from(expandedSet);

  const psiMatches = Array.from(qLower.matchAll(/\bpsi[-\s]?(\d{1,3})\b/gi)).map(
    (m) => `PSI-${m[1]}`
  );

  const materials: string[] = [];
  if (qLower.includes('pmma') || qLower.includes('acrylic')) materials.push('PMMA');
  if (qLower.includes('sibal')) materials.push('SIBAL');
  if (qLower.includes('cotton') || qLower.includes('fiberglass') || qLower.includes('cfg')) {
    materials.push('Cotton-Fiberglass');
  }
  if (qLower.includes('ptfe') || qLower.includes('teflon')) materials.push('PTFE');
  if (qLower.includes('nomex') || qLower.includes('aramid')) materials.push('Nomex');
  if (qLower.includes('methanol')) materials.push('Methanol');
  if (qLower.includes('heptane')) materials.push('Heptane');
  if (qLower.includes('decane')) materials.push('Decane');
  if (qLower.includes('cellulose') || qLower.includes('kimwipe')) materials.push('Cellulose');

  const o2Match = qLower.match(/(\d+(?:\.\d+)?)\s*%\s*o2|\bo2\s*(?:at|to|=|:)?\s*(\d+(?:\.\d+)?)/);
  const targetO2 = o2Match ? Number(o2Match[1] || o2Match[2]) : null;

  const hasOrbital = /\b(0g|0\.0g|orbital|microgravity|zero-g|iss)\b/.test(qLower);
  const hasLunar = /\b(lunar|moon|0\.166g?)\b/.test(qLower);
  const hasMartian = /\b(martian|mars|0\.38g?)\b/.test(qLower);
  const hasTerrestrial = /\b(terrestrial|earth|1g|1\.0g)\b/.test(qLower);
  const gravityCount =
    Number(hasOrbital) + Number(hasLunar) + Number(hasMartian) + Number(hasTerrestrial);

  const targetGravity: KeywordSignals['targetGravity'] =
    gravityCount === 1
      ? hasOrbital
        ? 'orbital'
        : hasLunar
        ? 'lunar'
        : hasMartian
        ? 'martian'
        : 'terrestrial'
      : null;

  const asksForRuns =
    /\b(run|runs|test|tests|telemetry|experiment|experiments|data points?|saffire|bass|flex|same|sofbull|acmee|bre|feanics|runcode)\b/.test(
      qLower
    ) || psiMatches.length > 0;

  const asksForGravityCompare =
    (gravityCount >= 2 ||
      /\b(gravity|environments?|orbital vs|lunar vs|mars vs|martian vs)\b/.test(qLower)) &&
    !asksForRuns;

  const asksForMaterials =
    (/\b(material|materials|flammability|loi|limiting oxygen|toxicity|toxic|smoke|clumping|rank|safest)\b/.test(
      qLower
    ) ||
      materials.length >= 2) &&
    !asksForRuns;

  const asksForMission =
    /\b(apollo|mir|shuttle|skylab|scba|firefighter|smoke detector|attire|suit|pbi|spinoff|spin-off|sciencecast|glenn|incident|accident|historical|history)\b/.test(
      qLower
    );

  const asksForInvestigations =
    /\b(investigation|investigations|catalog|program|programs|hardware|facility|cir|mdca|fsl|firs|msgs)\b/.test(
      qLower
    );

  const asksForGuide =
    /\b(guide|handbook|manual|chapter|section|page|literature|excerpt|pdf|soot|radiometer|boundary layer|damkohler|stefan)\b/.test(
      qLower
    );

  return {
    qLower,
    tokens,
    psiIds: psiMatches,
    materials,
    targetO2: targetO2 !== null && Number.isFinite(targetO2) ? targetO2 : null,
    targetGravity,
    asksForGravityCompare,
    asksForMaterials,
    asksForMission,
    asksForInvestigations,
    asksForGuide,
    asksForRuns,
    asksCoolFlame: /\b(cool flame|cool-flame|ntc)\b/.test(qLower),
    asksRapidSpread: /\b(rapid|danger|high risk|fast spread|hazardous)\b/.test(qLower),
    asksSafeExtinguish: /\b(self-extinguishing|extinguish|safe|pass)\b/.test(qLower),
  };
}

function scoreKeywordFields(
  fields: Array<{ text: string; weight: number }>,
  tokens: string[]
): number {
  if (tokens.length === 0) return 0;
  let score = 0;
  for (const tok of tokens) {
    for (const field of fields) {
      if (field.text && field.text.includes(tok)) {
        score += field.weight;
      }
    }
  }
  return score;
}

function rankKeywordMissionCases(
  signals: KeywordSignals,
  cases: MissionSpinoffCase[]
): Array<{ item: MissionSpinoffCase; score: number }> {
  return cases
    .map((item) => {
      let score = scoreKeywordFields(
        [
          { text: item.title.toLowerCase(), weight: 5 },
          { text: item.code.toLowerCase(), weight: 5 },
          { text: item.missionOrDomain.toLowerCase(), weight: 4 },
          { text: item.category.toLowerCase(), weight: 3 },
          { text: item.summary.toLowerCase(), weight: 2 },
          { text: item.lessonsLearned.join(' ').toLowerCase(), weight: 2 },
          { text: item.relatedPsiIds.join(' ').toLowerCase(), weight: 4 },
        ],
        signals.tokens
      );
      if (signals.qLower.includes('apollo 13') && item.id === 'case-apollo-13') score += 15;
      if (signals.qLower.includes('apollo 1') && item.id === 'case-apollo-1') score += 15;
      if (signals.qLower.includes('apollo') && item.id.includes('apollo')) score += 8;
      if (signals.qLower.includes('mir') && item.id === 'case-mir-fire') score += 15;
      if (
        (signals.qLower.includes('scba') || signals.qLower.includes('firefighter')) &&
        item.id === 'case-spinoff-scba'
      ) {
        score += 12;
      }
      if (
        (signals.qLower.includes('detector') || signals.qLower.includes('shuttle')) &&
        item.id === 'case-spinoff-smoke-detector'
      ) {
        score += 12;
      }
      if (
        (signals.qLower.includes('attire') ||
          signals.qLower.includes('pbi') ||
          signals.qLower.includes('garment') ||
          signals.qLower.includes('clothing')) &&
        item.id === 'case-spinoff-fire-attire'
      ) {
        score += 10;
      }
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

function rankKeywordInvestigations(
  signals: KeywordSignals,
  investigations: PsiInvestigationRecord[]
): Array<{ item: PsiInvestigationRecord; score: number }> {
  return investigations
    .map((item) => {
      let score = scoreKeywordFields(
        [
          { text: item.psiId.toLowerCase(), weight: 8 },
          { text: item.acronym.toLowerCase(), weight: 7 },
          { text: item.title.toLowerCase(), weight: 5 },
          { text: item.facility.toLowerCase(), weight: 4 },
          { text: item.fuels.join(' ').toLowerCase(), weight: 4 },
          { text: item.researchArea.toLowerCase(), weight: 3 },
          { text: item.objective.toLowerCase(), weight: 2 },
          { text: item.dominantOutcome.toLowerCase(), weight: 3 },
          { text: item.flightPlatform.toLowerCase(), weight: 3 },
        ],
        signals.tokens
      );
      for (const pid of signals.psiIds) {
        if (item.psiId.toUpperCase() === pid.toUpperCase()) score += 18;
      }
      if (signals.asksCoolFlame && item.dominantOutcome === 'Cool Flame Caution') score += 4;
      if (signals.asksRapidSpread && item.dominantOutcome === 'Rapid Flame Spread') score += 4;
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

function rankKeywordLiterature(
  signals: KeywordSignals,
  chunks: LiteratureChunk[]
): Array<{ item: LiteratureChunk; score: number }> {
  const scored = chunks
    .map((item) => {
      let score = scoreKeywordFields(
        [
          { text: item.psi_id.toLowerCase(), weight: 6 },
          { text: item.source_file.toLowerCase(), weight: 4 },
          { text: item.text.toLowerCase(), weight: 3 },
        ],
        signals.tokens
      );
      if (score > 0 && item.source_file.toLowerCase().includes('researchers_guide')) {
        score += 2;
      }
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const seenPages = new Set<string>();
  const diverse: Array<{ item: LiteratureChunk; score: number }> = [];
  for (const entry of scored) {
    const key = `${entry.item.source_file}:${entry.item.page_number}`;
    if (seenPages.has(key)) continue;
    seenPages.add(key);
    diverse.push(entry);
    if (diverse.length >= 5) break;
  }
  return diverse;
}

function rankKeywordFlightRuns(
  signals: KeywordSignals,
  runs: PsiRun[]
): { topRuns: Array<{ item: PsiRun; score: number }>; totalMatches: number } {
  const scored = runs
    .map((item) => {
      let score = scoreKeywordFields(
        [
          { text: item.psiId.toLowerCase(), weight: 6 },
          { text: item.runCode.toLowerCase(), weight: 7 },
          { text: item.material.toLowerCase(), weight: 5 },
          { text: item.facility.toLowerCase(), weight: 4 },
          { text: item.investigationTitle.toLowerCase(), weight: 4 },
          { text: item.outcome.toLowerCase(), weight: 4 },
          { text: item.notes.toLowerCase(), weight: 2 },
        ],
        signals.tokens
      );
      for (const pid of signals.psiIds) {
        if (item.psiId.toUpperCase().includes(pid.toUpperCase())) score += 16;
      }
      for (const mat of signals.materials) {
        if (item.material.toLowerCase().includes(mat.toLowerCase())) score += 9;
      }
      if (signals.asksCoolFlame && (item.coolFlameObserved || item.outcome === 'Cool Flame Caution')) {
        score += 9;
      }
      if (signals.asksRapidSpread && item.outcome === 'Rapid Flame Spread') score += 8;
      if (signals.asksSafeExtinguish && item.outcome === 'Self-Extinguishing') score += 8;
      if (signals.targetGravity === 'lunar' && Math.abs(item.g_eff - 0.166) <= 0.08) score += 8;
      if (signals.targetGravity === 'orbital' && item.g_eff <= 0.05) score += 7;
      if (signals.targetGravity === 'martian' && Math.abs(item.g_eff - 0.38) <= 0.12) score += 8;
      if (signals.targetGravity === 'terrestrial' && item.g_eff >= 0.8) score += 8;
      if (signals.targetO2 !== null && Math.abs(item.O2_pct - signals.targetO2) <= 2.5) {
        score += 7;
      }
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected: Array<{ item: PsiRun; score: number }> = [];
  const usedIds = new Set<string>();
  const psiCounts = new Map<string, number>();

  for (const entry of scored) {
    const psiKey = entry.item.psiId.split(' ')[0];
    if ((psiCounts.get(psiKey) ?? 0) >= 2 && scored.length > 8) continue;
    usedIds.add(entry.item.id);
    psiCounts.set(psiKey, (psiCounts.get(psiKey) ?? 0) + 1);
    selected.push(entry);
    if (selected.length >= 8) break;
  }

  if (selected.length < 6) {
    for (const entry of scored) {
      if (usedIds.has(entry.item.id)) continue;
      usedIds.add(entry.item.id);
      selected.push(entry);
      if (selected.length >= 8) break;
    }
  }

  return { topRuns: selected, totalMatches: scored.length };
}

function resolveCandidateMaterialForQuery(
  signals: KeywordSignals,
  fallback: VirtualTestConfig['material']
): VirtualTestConfig['material'] {
  if (signals.materials.includes('Nomex')) return 'Nomex';
  if (signals.materials.includes('PTFE')) return 'PTFE';
  if (signals.materials.includes('Cotton-Fiberglass')) return 'Cotton-Fiberglass';
  if (signals.materials.includes('SIBAL')) return 'SIBAL';
  if (signals.materials.includes('PMMA')) return 'PMMA';
  return fallback;
}

/**
 * Deterministic keyword-driven codebase analyzer and structured table presenter.
 * Activated whenever Gemini inference is unavailable, throttled, or offline.
 */
export function buildKeywordFallbackResponse(params: {
  question: string;
  mode: ConsoleMode;
  sliders: VirtualTestConfig;
  localSim: SimulationResponse;
  explanationDepth?: 'concise' | 'standard' | 'detailed';
  catalog?: PsiRun[];
  archiveContext?: AssistantArchiveContext;
}): LiveAskResponse {
  const { question, mode, sliders, localSim, catalog, archiveContext } = params;
  const o2 = safeFiniteNumber(sliders.O2_pct, 21).toFixed(1);
  const press = safeFiniteNumber(sliders.P_psi, 14.7).toFixed(1);
  const flow = safeFiniteNumber(sliders.Flow_ms, 0.15).toFixed(2);
  const grav = safeFiniteNumber(sliders.g_eff, 0.166).toFixed(3);
  const thick = safeFiniteNumber(sliders.Thickness_mm, 2.0).toFixed(1);
  const spread = safeFiniteNumber(localSim.flameSpread_mms, 0).toFixed(2);
  const peakTemp = Math.round(safeFiniteNumber(localSim.peakTemp_K, 1450));
  const minThick = safeFiniteNumber(localSim.safeMaterialCheck?.minSafeThickness_mm, 2.5).toFixed(1);
  const margin = safeFiniteNumber(localSim.safeMaterialCheck?.margin_mm, 0);

  const topMatch = localSim.nearestRuns[0]?.run;
  const matchLine = topMatch
    ? `${topMatch.psiId} / ${topMatch.runCode} (${topMatch.material}, ${safeFiniteNumber(topMatch.O2_pct, 21).toFixed(1)}% O2, spread ${safeFiniteNumber(topMatch.flameSpread_mms, 0).toFixed(2)} mm/s)`
    : 'archival microgravity baselines';

  if (isConversationalGreeting(question)) {
    const greetingSteps = [
      `Hello! I am FLARE's Local Combustion Model. Your active test chamber is set to ${sliders.material} at ${o2}% O2, ${press} psi, ${flow} m/s airflow, and ${grav}g (${thick} mm thickness), predicting ${spread} mm/s (${localSim.hazardStatus}).`,
      `Nearest reference flight run: ${matchLine}. Ask me to compare materials (Nomex vs PMMA), search SAFFIRE/BASS/FLEX flight runs, inspect Apollo/Mir mission cases, or search the ISS Researcher's Guide.`,
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

  const signals = extractKeywordSignals(question);
  const keywordLabel = signals.tokens.slice(0, 5).join(', ') || sliders.material;
  const runPool =
    catalog && catalog.length > 0
      ? catalog
      : localSim.nearestRuns.map((nr) => nr.run);
  const missionPool = archiveContext?.missionCases ?? MISSION_AND_SPINOFF_CASES;
  const invPool = archiveContext?.investigations ?? [];
  const chunkPool = archiveContext?.literatureChunks ?? [];

  const matchedMissions = rankKeywordMissionCases(signals, missionPool);
  const matchedInvs = rankKeywordInvestigations(signals, invPool);
  const matchedChunks = rankKeywordLiterature(signals, chunkPool);
  const { topRuns: matchedRuns, totalMatches: totalRunMatches } = rankKeywordFlightRuns(
    signals,
    runPool
  );

  const topMissionScore = matchedMissions[0]?.score ?? 0;
  const topInvScore = matchedInvs[0]?.score ?? 0;
  const topChunkScore = matchedChunks[0]?.score ?? 0;
  const topRunScore = matchedRuns[0]?.score ?? 0;

  // 1. Historical Mission & Spin-Off Cases
  if (
    matchedMissions.length > 0 &&
    (signals.asksForMission ||
      (topMissionScore >= 14 &&
        !signals.asksForMaterials &&
        !signals.asksForGravityCompare &&
        !signals.asksForRuns))
  ) {
    const topCases = matchedMissions.slice(0, 6).map((m) => m.item);
    const dataTable: StructuredDataTable = {
      title: `Matched Mission & Spin-Off Cases (${topCases.length} found)`,
      subtitle: `Keyword search: ${keywordLabel}`,
      columns: ['Code', 'Title', 'Category', 'Atmosphere', 'Related PSI', 'Key Lesson'],
      rows: topCases.map((c) => [
        c.code,
        c.title,
        c.category,
        c.atmosphereLabel,
        c.relatedPsiIds.slice(0, 3).join(', ') || '-',
        (c.lessonsLearned[0] ?? c.summary).replace(/\s+/g, ' ').slice(0, 120),
      ]),
    };
    const lead = topCases[0];
    const citations = Array.from(
      new Set([
        ...topCases.flatMap((c) => c.relatedPsiIds),
        ...(localSim.assistantReply?.citations ?? []),
      ])
    ).slice(0, 6);
    const steps = [
      `Archive Keyword Fallback [${keywordLabel}]: Matched ${matchedMissions.length} historical mission or spin-off record(s), led by ${lead.code} (${lead.title}, ${lead.yearOrEra}).`,
      `Primary Engineering Finding (${lead.atmosphereLabel}): ${lead.summary.replace(/\s+/g, ' ').slice(0, 220)}${lead.summary.length > 220 ? '...' : ''}`,
      `Active Chamber Comparison: Current test chamber (${sliders.material} at ${o2}% O2, ${press} psi, ${grav}g) predicts ${spread} mm/s (${localSim.hazardStatus}, ${minThick} mm minimum safe thickness).`,
    ];
    return {
      blocked: false,
      answer: steps.join('\n\n'),
      steps,
      citations,
      groundedModel: MODEL_LABEL_LOCAL,
      flameSpread_mms: localSim.flameSpread_mms,
      hazardStatus: localSim.hazardStatus,
      dataTable,
    };
  }

  // 2. Cross-Gravity Cabin Comparison
  if (signals.asksForGravityCompare && !signals.asksForMaterials) {
    const evalMaterial = resolveCandidateMaterialForQuery(signals, sliders.material);
    const evalO2 = signals.targetO2 ?? sliders.O2_pct;
    const envs = [
      { label: '0g Orbital (ISS)', g: 0.0 },
      { label: '0.166g Lunar Cabin', g: 0.166 },
      { label: '0.38g Martian Habitat', g: 0.38 },
      { label: '1.0g Terrestrial Sea-Level', g: 1.0 },
    ];
    const evaluated = envs.map((env) => ({
      ...env,
      out: computeFlameSpreadVelocity({
        O2_pct: evalO2,
        P_psi: sliders.P_psi,
        Flow_ms: sliders.Flow_ms,
        g_eff: env.g,
        Thickness_mm: sliders.Thickness_mm,
        material: evalMaterial,
        ignitionFlux_Wm2: sliders.ignitionFlux_Wm2,
      }),
    }));
    const fastest = [...evaluated].sort((a, b) => b.out.flameSpread_mms - a.out.flameSpread_mms)[0];
    const slowest = [...evaluated].sort((a, b) => a.out.flameSpread_mms - b.out.flameSpread_mms)[0];
    const dataTable: StructuredDataTable = {
      title: `Cross-Gravity Comparison (${evalMaterial} · ${evalO2.toFixed(1)}% O2 · ${press} psi)`,
      subtitle: `Keyword search: ${keywordLabel}`,
      columns: ['Environment', 'Gravity (g)', 'Airflow (m/s)', 'Spread (mm/s)', 'Safe Min (mm)', 'Safety Result'],
      rows: evaluated.map((e) => [
        e.label,
        e.g.toFixed(3),
        flow,
        e.out.flameSpread_mms.toFixed(2),
        e.out.minSafeThickness_mm.toFixed(1),
        e.out.hazardStatus,
      ]),
    };
    const steps = [
      `Archive Keyword Fallback [${keywordLabel}]: Computed multi-gravity flame spread across Orbital (0g), Lunar (0.166g), Martian (0.38g), and Earth (1.0g) for ${evalMaterial} at ${evalO2.toFixed(1)}% O2 and ${press} psi.`,
      `Peak Spread Environment: ${fastest.label} reaches ${fastest.out.flameSpread_mms.toFixed(2)} mm/s (${fastest.out.hazardStatus}) vs ${slowest.out.flameSpread_mms.toFixed(2)} mm/s in ${slowest.label} due to reduced buoyant dilution sharpening the forced-flow boundary layer.`,
      `Design Margin: Minimum safe thickness ranges from ${Math.min(...evaluated.map((e) => e.out.minSafeThickness_mm)).toFixed(1)} mm to ${Math.max(...evaluated.map((e) => e.out.minSafeThickness_mm)).toFixed(1)} mm under ${flow} m/s cabin ventilation.`,
    ];
    return {
      blocked: false,
      answer: steps.join('\n\n'),
      steps,
      citations: Array.from(new Set(['PSI-99', 'PSI-25', 'PSI-69', ...(localSim.assistantReply?.citations ?? [])])).slice(0, 5),
      groundedModel: MODEL_LABEL_LOCAL,
      flameSpread_mms: localSim.flameSpread_mms,
      hazardStatus: localSim.hazardStatus,
      dataTable,
    };
  }

  // 3. Candidate Material Flammability & LOI Comparison
  if (signals.asksForMaterials && localSim.materialRankings.length > 0 && !signals.asksForRuns) {
    const ordered = [...localSim.materialRankings].sort((a, b) => {
      const aMention = signals.materials.some(
        (m) => a.name.toLowerCase().includes(m.toLowerCase()) || a.code.toLowerCase().includes(m.toLowerCase())
      )
        ? 1
        : 0;
      const bMention = signals.materials.some(
        (m) => b.name.toLowerCase().includes(m.toLowerCase()) || b.code.toLowerCase().includes(m.toLowerCase())
      )
        ? 1
        : 0;
      if (aMention !== bMention) return bMention - aMention;
      return a.flameSpread_mms - b.flameSpread_mms;
    });
    const dataTable: StructuredDataTable = {
      title: `Material Flammability & LOI Comparison (${o2}% O2 · ${press} psi · ${grav}g)`,
      subtitle: `Keyword search: ${keywordLabel}`,
      columns: ['Material', 'Code', 'LOI (%)', 'Spread (mm/s)', 'Cool Flame', 'Toxic Yield', 'Safety Result'],
      rows: ordered.map((m) => [
        m.name,
        m.code,
        m.limitingO2_pct.toFixed(1),
        m.flameSpread_mms.toFixed(2),
        m.coolFlameRiskIndex,
        m.toxicGasYieldIndex,
        m.status,
      ]),
    };
    const safest = [...ordered].sort((a, b) => b.limitingO2_pct - a.limitingO2_pct)[0];
    const fastest = [...ordered].sort((a, b) => b.flameSpread_mms - a.flameSpread_mms)[0];
    const steps = [
      `Archive Keyword Fallback [${keywordLabel}]: Evaluated ${ordered.length} spacecraft qualification materials at ${o2}% O2, ${press} psi, ${flow} m/s airflow, and ${grav}g.`,
      `Highest Oxygen Resistance: ${safest.name} (LOI ${safest.limitingO2_pct.toFixed(1)}%, spread ${safest.flameSpread_mms.toFixed(2)} mm/s, ${safest.status}) vs ${fastest.name} (${fastest.flameSpread_mms.toFixed(2)} mm/s, LOI ${fastest.limitingO2_pct.toFixed(1)}%).`,
      `Secondary Hazard Check: Monitor PTFE fluoropolymer off-gassing toxicity (index ${ordered.find((x) => x.code.includes('PTFE'))?.toxicGasYieldIndex ?? 84}/100) and PMMA low-flow cool-flame stabilization when ventilation drops below 0.12 m/s.`,
    ];
    return {
      blocked: false,
      answer: steps.join('\n\n'),
      steps,
      citations: Array.from(new Set(['PSI-99', 'PSI-25', 'PSI-159', ...(localSim.assistantReply?.citations ?? [])])).slice(0, 5),
      groundedModel: MODEL_LABEL_LOCAL,
      flameSpread_mms: localSim.flameSpread_mms,
      hazardStatus: localSim.hazardStatus,
      dataTable,
    };
  }

  // 4. PSI Investigations Overview
  if (
    matchedInvs.length > 0 &&
    (signals.asksForInvestigations ||
      (!signals.asksForRuns && !signals.asksForGuide && topInvScore >= 8 && topRunScore < topInvScore + 3))
  ) {
    const topInvs = matchedInvs.slice(0, 6).map((x) => x.item);
    const dataTable: StructuredDataTable = {
      title: `Matched PSI Investigations (${topInvs.length} of ${matchedInvs.length})`,
      subtitle: `Keyword search: ${keywordLabel}`,
      columns: ['PSI ID', 'Acronym', 'Facility', 'Fuels', 'O2 (%)', 'Spread (mm/s)', 'Regime'],
      rows: topInvs.map((inv) => [
        inv.psiId,
        inv.acronym || '-',
        inv.facility,
        inv.fuels.slice(0, 2).join(', ') || '-',
        `${inv.o2Range[0].toFixed(1)}-${inv.o2Range[1].toFixed(1)}`,
        `${inv.spreadRange[0].toFixed(2)}-${inv.spreadRange[1].toFixed(2)}`,
        inv.dominantOutcome,
      ]),
    };
    const leadInv = topInvs[0];
    const steps = [
      `Archive Keyword Fallback [${keywordLabel}]: Matched ${matchedInvs.length} PSI investigation(s) in the catalog, led by ${leadInv.psiId} (${leadInv.acronym || leadInv.title}) on ${leadInv.facility}.`,
      `Investigation Objective: ${leadInv.objective.replace(/\s+/g, ' ').slice(0, 210)}${leadInv.objective.length > 210 ? '...' : ''}`,
      `Observed Flight Envelope (${leadInv.runCount} runs): O2 ${leadInv.o2Range[0].toFixed(1)}-${leadInv.o2Range[1].toFixed(1)}%, spread ${leadInv.spreadRange[0].toFixed(2)}-${leadInv.spreadRange[1].toFixed(2)} mm/s (dominant outcome: ${leadInv.dominantOutcome}).`,
    ];
    return {
      blocked: false,
      answer: steps.join('\n\n'),
      steps,
      citations: Array.from(new Set([...topInvs.map((i) => i.psiId), ...(localSim.assistantReply?.citations ?? [])])).slice(0, 6),
      groundedModel: MODEL_LABEL_LOCAL,
      flameSpread_mms: localSim.flameSpread_mms,
      hazardStatus: localSim.hazardStatus,
      dataTable,
    };
  }

  // 5. ISS Researcher's Guide & Archive Literature Excerpts
  if (
    matchedChunks.length > 0 &&
    (signals.asksForGuide || (topChunkScore > topRunScore && !signals.asksForRuns))
  ) {
    const topChunks = matchedChunks.slice(0, 5).map((x) => x.item);
    const dataTable: StructuredDataTable = {
      title: `Matched Researcher's Guide & Literature (${topChunks.length} excerpts)`,
      subtitle: `Keyword search: ${keywordLabel}`,
      columns: ['PSI / Source', 'Page', 'Matched Archive Excerpt'],
      rows: topChunks.map((ch) => [
        `${ch.psi_id.toUpperCase()} (${ch.source_file.replace(/_/g, ' ').slice(0, 32)})`,
        `p.${ch.page_number}`,
        ch.text.replace(/\s+/g, ' ').trim().slice(0, 155),
      ]),
    };
    const leadCh = topChunks[0];
    const citations = Array.from(
      new Set([
        ...topChunks.map((c) => c.psi_id.toUpperCase()),
        ...(localSim.assistantReply?.citations ?? []),
      ])
    ).slice(0, 6);
    const steps = [
      `Archive Keyword Fallback [${keywordLabel}]: Found ${topChunks.length} high-relevance literature section(s), led by ${leadCh.psi_id.toUpperCase()} (page ${leadCh.page_number} of ${leadCh.source_file}).`,
      `Technical Excerpt: "${leadCh.text.replace(/\s+/g, ' ').trim().slice(0, 230)}..."`,
      `Active Chamber Link: Current test point (${sliders.material}, ${o2}% O2, ${press} psi, ${grav}g) predicts ${spread} mm/s (${localSim.hazardStatus}, peak ${peakTemp} K).`,
    ];
    return {
      blocked: false,
      answer: steps.join('\n\n'),
      steps,
      citations,
      groundedModel: MODEL_LABEL_LOCAL,
      flameSpread_mms: localSim.flameSpread_mms,
      hazardStatus: localSim.hazardStatus,
      dataTable,
    };
  }

  // 6. Flight Experiment Runs Search (or Nearest Reference Baseline fallback)
  const fallbackRuns =
    matchedRuns.length > 0
      ? matchedRuns.map((m) => m.item)
      : localSim.nearestRuns.slice(0, 6).map((nr) => nr.run);

  const hasWhatIfAlready =
    mode === 'what-if' && (localSim.assistantReply?.whatIfRows?.length ?? 0) > 0;
  const shouldIncludeRunTable =
    fallbackRuns.length > 0 && (!hasWhatIfAlready || matchedRuns.length > 0);

  const spreadVals = fallbackRuns.map((r) => safeFiniteNumber(r.flameSpread_mms, 0));
  const minSpread = spreadVals.length ? Math.min(...spreadVals).toFixed(2) : spread;
  const maxSpread = spreadVals.length ? Math.max(...spreadVals).toFixed(2) : spread;
  const safeCount = fallbackRuns.filter((r) => r.outcome === 'Self-Extinguishing').length;
  const coolCount = fallbackRuns.filter((r) => r.outcome === 'Cool Flame Caution' || r.coolFlameObserved).length;

  const dataTable: StructuredDataTable | undefined = shouldIncludeRunTable
    ? {
        title:
          matchedRuns.length > 0
            ? `Matched Flight Experiment Runs (Top ${fallbackRuns.length} of ${totalRunMatches})`
            : `Nearest Reference Flight Runs (${fallbackRuns.length} matched to chamber)`,
        subtitle: `Keyword search: ${keywordLabel}`,
        columns: [
          'Run Code',
          'PSI ID',
          'Material',
          'O2 (%)',
          'Press (psi)',
          'Flow (m/s)',
          'Gravity (g)',
          'Spread (mm/s)',
          'Safety Result',
        ],
        rows: fallbackRuns.map((r) => [
          r.runCode,
          r.psiId,
          r.material,
          safeFiniteNumber(r.O2_pct, 21).toFixed(1),
          safeFiniteNumber(r.P_psi, 14.7).toFixed(1),
          safeFiniteNumber(r.Flow_ms, 0.15).toFixed(2),
          safeFiniteNumber(r.g_eff, 0).toFixed(3),
          safeFiniteNumber(r.flameSpread_mms, 0).toFixed(2),
          r.outcome,
        ]),
      }
    : undefined;

  const citations = Array.from(
    new Set([
      ...fallbackRuns.map((r) => r.psiId.split(' ')[0].toUpperCase()),
      ...(localSim.assistantReply?.citations ?? []),
    ])
  ).slice(0, 6);

  const steps: string[] = [];
  if (matchedRuns.length > 0) {
    steps.push(
      `Archive Keyword Fallback [${keywordLabel}]: Found ${totalRunMatches} matching flight run(s) across ${runPool.length.toLocaleString()} loaded tests. Tabulated the top ${fallbackRuns.length} representative runs spanning ${minSpread}-${maxSpread} mm/s (${safeCount} Self-Extinguishing, ${coolCount} Cool Flame flagged).`
    );
  } else if (matchedChunks.length > 0) {
    const ch = matchedChunks[0].item;
    steps.push(
      `Archive Keyword Fallback [${keywordLabel}]: Matched literature excerpt in ${ch.psi_id.toUpperCase()} p.${ch.page_number}: "${ch.text.replace(/\s+/g, ' ').trim().slice(0, 190)}..."`
    );
  } else {
    steps.push(
      `Local Physics Evaluation [${sliders.material}]: At ${o2}% O2, ${press} psi, ${flow} m/s airflow, ${grav}g, and ${thick} mm thickness, predicted spread is ${spread} mm/s (${localSim.hazardStatus}, peak ${peakTemp} K).`
    );
  }

  steps.push(
    `Thickness & Reference Check: ${localSim.safeMaterialCheck?.passed ? 'PASS' : 'FAIL'} against ${minThick} mm safe minimum (${margin >= 0 ? `+${margin.toFixed(1)}` : margin.toFixed(1)} mm margin). Nearest baseline: ${matchLine}.`
  );

  return {
    blocked: false,
    answer: steps.join('\n\n'),
    steps,
    citations,
    groundedModel: MODEL_LABEL_LOCAL,
    flameSpread_mms: localSim.flameSpread_mms,
    hazardStatus: localSim.hazardStatus,
    ...(dataTable ? { dataTable } : {}),
  };
}

function synthesizeDynamicLocalTelemetryResponse(params: {
  question: string;
  mode: ConsoleMode;
  sliders: VirtualTestConfig;
  localSim: SimulationResponse;
  explanationDepth?: 'concise' | 'standard' | 'detailed';
  catalog?: PsiRun[];
  archiveContext?: AssistantArchiveContext;
}): LiveAskResponse {
  return buildKeywordFallbackResponse(params);
}

/**
 * Unified 3-step pipeline for Local Combustion Model:
 *   Step A: Local physics, PSI archive & active chart grounding
 *   Step B: Gemini Flash synthesis with multi-model fallback chain (3.8 Flash -> 3.5 Flash-Lite -> 3.6 Flash)
 *   Step C: Keyword-driven archive analyzer & structured table failover under identical attribution
 */
export async function runLocalCombustionModelPipeline(params: {
  question: string;
  mode: ConsoleMode;
  sliders: VirtualTestConfig;
  localSim: SimulationResponse;
  explanationDepth?: 'concise' | 'standard' | 'detailed';
  chartContextSummary?: string;
  catalog?: PsiRun[];
  archiveContext?: AssistantArchiveContext;
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
