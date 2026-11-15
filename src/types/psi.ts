export type ThemeMode = 'normal' | 'light' | 'dark';

export type SidebarState = 'expanded' | 'compact' | 'hidden';

export type QuickScenarioId = 'lunar-cabin' | 'cool-flame' | 'apollo-mir';

export type WorkspaceView =
  | 'overview'
  | 'virtual-lab'
  | 'comparator'
  | 'visual-studio'
  | 'model-console'
  | 'investigations'
  | 'experiment-runs'
  | 'researchers-guide'
  | 'mission-spinoffs'
  | 'import-sync'
  | 'investigation-detail';

export type VizMode =
  | 'safety-map'
  | 'multi-variable'
  | 'material-safety'
  | 'sensor-timeline'
  | 'grouped-bar'
  | 'stacked-bar'
  | 'horizontal-ranked-bar'
  | 'lollipop-dot'
  | 'histogram'
  | 'frequency-distribution'
  | 'range-interval-bar'
  | 'box-quartile'
  | 'scatter-plot'
  | 'bubble-plot'
  | 'correlation-matrix'
  | 'heatmap-matrix'
  | 'multi-series-line'
  | 'area-chart'
  | 'stacked-area'
  | 'step-chart'
  | 'timeline-progression'
  | 'contour-surface'
  | 'polar-radial'
  | 'density-strip'
  | 'residual-deviation';

export type VizFamilyId =
  | 'comparisons'
  | 'distributions'
  | 'relationships'
  | 'time-series'
  | 'spatial-regime';

export type VizAvailabilityStatus = 'recommended' | 'available' | 'unavailable';

export type StudioDatasetSource =
  | 'full-archive'
  | 'selected-comparison'
  | 'virtual-lab-output'
  | 'material-qualification'
  | 'imported-custom';

export type DatasetScope =
  | StudioDatasetSource
  | 'selected-sim'
  | 'single-focus'
  | 'static-runs';

export interface VizDatasetContext {
  scope: DatasetScope;
  activeRuns: PsiRun[];
  selectedRuns: PsiRun[];
  catalogRuns: PsiRun[];
  numericColumnCount: number;
  hasTimeSeries: boolean;
  has2DGrid: boolean;
  hasMaterialMetrics: boolean;
  hasCustomImports: boolean;
}

export interface VizCompatibilityResult {
  status: VizAvailabilityStatus;
  reason: string;
  missingRequirement?: string;
}

export interface VizTechniqueDefinition {
  id: VizMode;
  name: string;
  shortName: string;
  familyId: VizFamilyId;
  familyLabel: string;
  description: string;
  keywords: string[];
  requirementsSummary: string;
  caveatNote?: string;
  evaluateCompatibility: (ctx: VizDatasetContext) => VizCompatibilityResult;
}

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
  facility: 'CIR' | 'MSG' | 'Cygnus' | 'FSL' | 'Virtual';
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
  isVirtual?: boolean;
}

export type CandidateMaterialCode =
  | 'PMMA'
  | 'SIBAL'
  | 'Cotton-Fiberglass'
  | 'PTFE'
  | 'Nomex';

export interface VirtualTestConfig {
  O2_pct: number;
  P_psi: number;
  Flow_ms: number;
  g_eff: number;
  Thickness_mm: number;
  material: CandidateMaterialCode;
  ignitionFlux_Wm2: number;
}

export type ExplanationDepth = 'concise' | 'standard' | 'detailed';

export interface UserAdaptationProfile {
  researcherId: string;
  explanationDepth: ExplanationDepth;
  fuelCounts: Record<string, number>;
  gravityCounts: Record<string, number>;
  chartCounts: Record<string, number>;
  preferredFuels: string[];
  preferredGravities: string[];
  preferredCharts: VizMode[];
  helpfulMessageIds: string[];
  updatedAtUtc: string;
}

export interface ModelFeedbackCorrection {
  id: string;
  messageId: string;
  createdAtUtc: string;
  researcherId: string;
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
  syncedRemote: boolean;
}

export interface EndpointSyncState {
  status: 'local-only' | 'syncing' | 'synced' | 'offline-fallback';
  endpointName: string;
  baseUrl?: string;
  lastSyncAtUtc?: string;
  latencyMs?: number;
  syncedRunsCount?: number;
  syncedCorrectionsCount?: number;
  message: string;
}

export interface LearnedBundleExport {
  exportedAtUtc: string;
  formatVersion: '1.0';
  researcherProfile: UserAdaptationProfile;
  verifiedCorrections: ModelFeedbackCorrection[];
  customImportedRuns: PsiRun[];
  activeEndpoint: {
    id: string;
    name: string;
    baseUrl: string;
    modelId?: string;
  } | null;
}

export interface SimulationRequest {
  O2_pct: number;
  P_psi: number;
  Flow_ms: number;
  g_eff: number;
  Thickness_mm: number;
  material?: CandidateMaterialCode | string;
  ignitionFlux_Wm2?: number;
  forecast_10s?: boolean;
  material_check?: boolean;
  question?: string;
  selectedRunIds?: string[];
  comparatorRuns?: PsiRun[];
  consoleMode?: ConsoleMode;
  activeChartContext?: DecodedChartContext;
  attachments?: ChatAttachment[];
  requestedVizOutput?: ChatVisualizationOutputMode;
  userProfile?: UserAdaptationProfile;
  verifiedCorrections?: ModelFeedbackCorrection[];
}

export type ChatVisualizationOutputMode = 'auto' | 'none' | VizMode;

export type ChatAttachmentKind =
  | 'virtual-lab'
  | 'comparator-runs'
  | 'visual-studio'
  | 'psi-investigation';

export interface ChatAttachment {
  id: string;
  kind: ChatAttachmentKind;
  label: string;
  sublabel?: string;
  psiId?: string;
  runId?: string;
}

export interface ChatInlineChartPayload {
  status: 'rendered' | 'incompatible';
  requestedMode: ChatVisualizationOutputMode;
  resolvedVizMode?: VizMode;
  techniqueName?: string;
  datasetScope: DatasetScope;
  datasetLabel: string;
  runIds?: string[];
  xAxisKey?: string;
  yAxisKey?: string;
  colorByKey?: string;
  headline?: string;
  incompatibilityReason?: string;
  compatibleAlternatives?: Array<{ vizMode: VizMode; name: string }>;
}

export interface ModelConfidenceSummary {
  confidencePct: number;
  validatedRunCount: number;
  nearestDeltaSummary: string;
  physicalTestingRecommendation: 'Avoidable' | 'Recommended';
  rationale: string;
}

export type ConsoleMode = 'decoder' | 'what-if' | 'literature' | 'risk-audit';

export interface DecodedChartContext {
  datasetLabel: string;
  techniqueName: string;
  xAxisLabel: string;
  yAxisLabel: string;
  colorByLabel: string;
  runCount: number;
  anomalies: string[];
  summaryHeadline: string;
}

export interface WhatIfScenarioResult {
  id: string;
  label: string;
  O2_pct: number;
  P_psi: number;
  Flow_ms: number;
  g_eff: number;
  Thickness_mm: number;
  material: CandidateMaterialCode;
  ignitionFlux_Wm2: number;
  flameSpread_mms: number;
  minSafeThickness_mm: number;
  outcome: HazardOutcome;
}

export interface PsiApiEndpointConfig {
  baseUrl: string;
  apiKeyHeader: 'X-API-Key' | 'Authorization';
  apiKeyValue: string;
  modelId?: string;
}

export interface NamedApiEndpointProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyHeader: 'X-API-Key' | 'Authorization';
  apiKeyValue: string;
  modelId?: string;
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
  modelConfidence?: ModelConfidenceSummary;
  nearestRuns: Array<{
    run: PsiRun;
    similarityPct: number;
  }>;
  timelineSeries: TimelinePoint[];
  materialRankings: MaterialCandidate[];
  headlineTakeaway: Record<
    'safety-map' | 'multi-variable' | 'material-safety' | 'sensor-timeline',
    string
  > &
    Partial<Record<VizMode, string>>;
  assistantReply?: {
    steps: string[];
    citations: string[];
    suggestedVizMode?: VizMode;
    recommendedParams?: Partial<VirtualTestConfig>;
    whatIfRows?: WhatIfScenarioResult[];
    inlineChart?: ChatInlineChartPayload;
    endpointLabel?: string;
    appliedCorrectionIds?: string[];
    adaptiveNote?: string;
  };
}

export interface DataManifestFileRecord {
  id: string;
  fileName: string;
  filePath: string;
  format: 'JSON' | 'CSV';
  recordCount: number;
  recordLabel: string;
  sizeBytes: number;
  loadedAtUtc: string;
  status: 'Loaded' | 'Error';
}

export interface SessionIngestionEvent {
  id: string;
  sourceName: string;
  eventType: 'archive-load' | 'custom-upload' | 'archive-error';
  timestampUtc: string;
  runsIndexed: number;
  summary: string;
  targetRunId?: string;
  targetView?: WorkspaceView;
  unitConversions?: string[];
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  timestamp: string;
  mode?: ConsoleMode;
  text?: string;
  steps?: string[];
  citations?: string[];
  suggestedVizMode?: VizMode;
  recommendedParams?: Partial<VirtualTestConfig>;
  whatIfRows?: WhatIfScenarioResult[];
  chartContext?: DecodedChartContext;
  attachments?: ChatAttachment[];
  inlineChart?: ChatInlineChartPayload;
  endpointLabel?: string;
  feedbackStatus?: 'helpful' | 'corrected';
  appliedCorrectionIds?: string[];
  adaptiveNote?: string;
}

export interface ChatThread {
  id: string;
  title: string;
  updatedAt: string;
  updatedAtMs: number;
  messages: AssistantMessage[];
}

export type DataArchiveTab =
  | 'psi-investigations'
  | 'researchers-guide'
  | 'mission-spinoffs';

export interface PsiPublicationRecord {
  title: string;
  authors: string;
  link: string;
}

export interface PsiInvestigationRecord {
  psiId: string;
  acronym: string;
  title: string;
  facility: PsiRun['facility'];
  hardwareRaw: string;
  flightPlatform: string;
  managingCenter: string;
  researchArea: string;
  subResearchArea: string;
  doi: string;
  objective: string;
  approach: string;
  hypothesis: string;
  principalInvestigators: string[];
  affiliations: string[];
  publications: PsiPublicationRecord[];
  spreadsheets: string[];
  pdfs: string[];
  auditStatus: string;
  runCount: number;
  fuels: string[];
  o2Range: [number, number];
  pressureRange: [number, number];
  flowRange: [number, number];
  spreadRange: [number, number];
  dominantOutcome: HazardOutcome;
  representativeRun: PsiRun;
  psiSourceUrl: string;
  psiPortalLabel?: string;
  hardwareLink?: string;
  doiUrl?: string;
}

export interface LiteratureChunk {
  chunk_id: string;
  psi_id: string;
  source_file: string;
  page_number: number;
  chunk_index: number;
  char_count: number;
  text: string;
}

export interface LiteratureCorpusStats {
  rawSizeMB: number;
  totalRawChunks: number;
  totalSourceDocuments: number;
  compactChunkCount: number;
  guideChunkCount: number;
}

export interface ResearchersGuideTopic {
  id: string;
  sectionNumber: string;
  title: string;
  category:
    | 'Environment & Physics'
    | 'Droplet & Cool Flames'
    | 'Solid Flammability'
    | 'Gaseous & Soot'
    | 'ISS Facilities';
  pageRange: string;
  startPage: number;
  summary: string;
  keyTakeaways: string[];
  chunks: LiteratureChunk[];
  pdfUrl: string;
}

export interface MissionSpinoffCase {
  id: string;
  category:
    | 'Historical Spacecraft Fire'
    | 'ISS Program & Science'
    | 'Terrestrial Spin-Off';
  code: string;
  title: string;
  yearOrEra: string;
  missionOrDomain: string;
  atmosphereLabel: string;
  summary: string;
  engineeringParameters: Array<{ label: string; value: string }>;
  lessonsLearned: string[];
  relatedPsiIds: string[];
  sourceTitle: string;
  sourceDisplayUrl: string;
  sourceUrl: string;
  simulatableEnvironment?: {
    label: string;
    O2_pct: number;
    P_psi: number;
    Flow_ms: number;
    g_eff: number;
    Thickness_mm: number;
  };
}

export type MeasurementUnits = 'spacecraft' | 'metric-si';

export type DefaultStartingWorkspace =
  | 'overview'
  | 'virtual-lab'
  | 'model-console';

export type DefaultExportFormat = 'pdf' | 'doc' | 'csv' | 'json';

export type ExportFileFormat = 'pdf' | 'doc' | 'csv' | 'json' | 'md';

export type ThemeSetting = ThemeMode | 'system';

export type ContrastMode = 'default' | 'strong';

export type FontFamilyId =
  | 'inter'
  | 'space-grotesk'
  | 'ibm-plex-sans'
  | 'opendyslexic-atkinson'
  | 'jetbrains-mono';

export type FontSizePx = 13 | 14 | 15 | 16;

export type ThemePresetId =
  | 'monochrome-default'
  | 'obsidian-amber'
  | 'deep-ocean-teal'
  | 'slate-cobalt'
  | 'forest-emerald'
  | 'warm-paper-sand'
  | 'arctic-ice-blue'
  | 'solarized-dusk'
  | 'crimson-lab'
  | 'high-contrast-carbon';

export interface CustomThemeColors {
  background?: string;
  foreground?: string;
  accent?: string;
}

export interface AppSettings {
  units: MeasurementUnits;
  defaultWorkspace: DefaultStartingWorkspace;
  defaultExportFormat: DefaultExportFormat;
  themeSetting: ThemeSetting;
  contrast: ContrastMode;
  fontFamily: FontFamilyId;
  fontSizePx: FontSizePx;
  presetId: ThemePresetId;
  customColors: CustomThemeColors;
}

export interface UserProfileDetails {
  fullName: string;
  researcherId: string;
  email: string;
  bio: string;
}

export interface AccountSession {
  mode: 'named' | 'guest';
  fullName: string;
  researcherId: string;
  isAuthenticated: boolean;
}

export interface SavedUserAccountWorkspace {
  researcherId: string;
  fullName: string;
  email: string;
  bio: string;
  settings: AppSettings;
  adaptationProfile: UserAdaptationProfile;
  verifiedCorrections: ModelFeedbackCorrection[];
  chatThreads: ChatThread[];
  activeChatThreadId: string | null;
  customRuns: PsiRun[];
  updatedAtUtc: string;
}

export interface GlobalSearchResult {
  id: string;
  kind: 'investigation' | 'run' | 'guide';
  title: string;
  subtitle: string;
  meta: string;
  run?: PsiRun;
  investigation?: PsiInvestigationRecord;
  guideTopicId?: string;
  guideSearchHint?: string;
}
