export type ThemeMode = 'normal' | 'light' | 'dark';

export type WorkspaceView = 'overview' | 'catalog' | 'comparator' | 'import-sync';

export type VizMode =
  | 'safety-map'
  | 'multi-variable'
  | 'material-safety'
  | 'sensor-timeline';

export type HazardOutcome =
  | 'Rapid Flame Spread'
  | 'Cool Flame Caution'
  | 'Self-Extinguishing';

export type EnvironmentPresetId = 'orbital' | 'lunar' | 'martian' | 'terrestrial';

export interface EnvironmentPreset {
  id: EnvironmentPresetId;
  label: string;
  shortGravity: string;
  O2_pct: number;
  P_psi: number;
  Flow_ms: number;
  g_eff: number;
  Thickness_mm: number;
  description: string;
}

export interface PsiRun {
  id: string;
  psiId: string;
  investigationTitle: string;
  runCode: string;
  facility: 'CIR' | 'MSG' | 'Cygnus' | 'FSL';
  material: string;
  O2_pct: number;
  P_psi: number;
  Flow_ms: number;
  g_eff: number;
  Thickness_mm: number;
  flameSpread_mms: number;
  peakTemp_K: number;
  radiometerFlux_Wm2: number;
  coolFlameObserved: boolean;
  outcome: HazardOutcome;
  notes: string;
  isCustom?: boolean;
}

export interface SimulationRequest {
  O2_pct: number;
  P_psi: number;
  Flow_ms: number;
  g_eff: number;
  Thickness_mm: number;
  forecast_10s?: boolean;
  material_check?: boolean;
  question?: string;
  selectedRunIds?: string[];
}

export interface TimelinePoint {
  time_s: number;
  temp_K: number;
  irFlux_Wm2: number;
  opticalVisibility_pct: number;
  coYield_ppm: number;
  isCoolFlameZone: boolean;
}

export interface MaterialCandidate {
  name: string;
  code: string;
  flameSpreadIndex: number; // 0-100 normalized risk or actual mm/s
  flameSpread_mms: number;
  smokeClumpingIndex: number; // 0-100
  toxicGasYieldIndex: number; // 0-100
  coolFlameRiskIndex: number; // 0-100
  limitingO2_pct: number;
  status: HazardOutcome;
}

export interface SimulationResponse {
  flameSpread_mms: number;
  confidenceInterval_mms: number;
  hazardStatus: HazardOutcome;
  peakTemp_K: number;
  forecast10s: {
    radius_mm: number;
    pressureRise_kPa: number;
  };
  safeMaterialCheck: {
    minSafeThickness_mm: number;
    passed: boolean;
    margin_mm: number;
  };
  nearestRuns: Array<{
    run: PsiRun;
    similarityPct: number;
  }>;
  timelineSeries: TimelinePoint[];
  materialRankings: MaterialCandidate[];
  headlineTakeaway: Record<VizMode, string>;
  assistantReply?: {
    steps: string[];
    citations: string[];
    suggestedVizMode?: VizMode;
  };
}

export interface SyncChangelogEntry {
  id: string;
  psiId: string;
  title: string;
  facility: 'CIR' | 'MSG' | 'Cygnus' | 'FSL';
  runsAdded: number;
  syncedAt: string;
  summary: string;
  sampleRun?: PsiRun;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  timestamp: string;
  text?: string;
  steps?: string[];
  citations?: string[];
  suggestedVizMode?: VizMode;
}
