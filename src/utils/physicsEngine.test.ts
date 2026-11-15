import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import Papa from 'papaparse';
import {
  buildAssistantReply,
  buildWhatIfSweep,
  computeFlameSpreadVelocity,
  runLocalPhysicsSimulation,
} from './physicsEngine';
import {
  SAMPLE_COMBUSTION_CSV,
  SAMPLE_UNRELATED_CSV,
  validateAndNormalizeDataset,
} from './dataImporter';
import { sanitizeVisiblePsiText } from '../services/dataLoader';
import { MISSION_AND_SPINOFF_CASES } from '../data/missionAndSpinoffCases';
import { PsiRun } from '../types/psi';
import { getPsiSourceLink } from './investigationArtifacts';
import {
  buildCsvDocument,
  HEADER_EXPORT_SECTION_OPTIONS,
} from './exportHelpers';
import {
  generateClientPdfBytes,
  generateWordDocHtml,
} from './exportGenerators';
import { performGlobalSearch } from './globalSearch';
import {
  DEFAULT_APP_SETTINGS,
  formatAirflow,
  formatFlameSpread,
  formatPressure,
  formatTemperature,
  THEME_PRESETS,
} from './themePreferences';
import {
  clearChatHistoryForSession,
  deleteNamedAccount,
  findSavedAccountByFullName,
  generateResearcherIdFromName,
  signInWithFullName,
  signOutAccountSession,
  startGuestSession,
  updateActiveUserProfileDetails,
} from '../services/accountSession';
import {
  LOCAL_MODEL_ID,
  analyzeCombustionState,
  deleteApiEndpointProfile,
  generateChartDecodeInsight,
  generateComparatorInsights,
  getActiveEndpointProfileId,
  getApiEndpointConfig,
  getApiEndpointProfiles,
  ingestRunsToActiveEndpoint,
  runModelConsoleInference,
  saveApiEndpointConfig,
  setActiveEndpointProfileId,
  submitModelFeedback,
  syncCorpusWithEndpoint,
  testApiEndpointHealth,
  upsertApiEndpointProfile,
} from '../services/psiApi';
import {
  buildLearnedProfileBundle,
  getOrCreateUserProfile,
  getVerifiedCorrections,
  recordChartUsage,
  recordFuelUsage,
  recordGravityUsage,
  setExplanationDepth,
  setResearcherId,
} from '../services/userAdaptation';
import {
  appendMessagesToThread,
  createChatThread,
  deriveChatThreadTitle,
  sortThreadsNewestFirst,
} from './chatStorage';
import { resolveChatVisualization } from './chatVisualizations';
import {
  STUDIO_CATEGORICAL_COLUMNS,
  STUDIO_DATASET_SOURCES,
  STUDIO_NUMERIC_COLUMNS,
  VIZ_FAMILIES,
  VIZ_TECHNIQUE_REGISTRY,
  buildDatasetContext,
  evaluateAllTechniques,
  filterTechniques,
  getDefaultAxesForTechnique,
} from './vizRegistry';

function loadRealTestRuns(limit = 25): PsiRun[] {
  const csvPath = path.resolve(
    process.cwd(),
    'public/data/nasa-space-apps/master_psi_telemetry.csv'
  );
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  const picked: PsiRun[] = [];
  const seenPsi = new Set<string>();
  for (let i = 0; i < parsed.data.length && picked.length < limit; i++) {
    const r = parsed.data[i];
    const psiId = (r.psi_id || '').trim().toUpperCase();
    if (!psiId) continue;
    // First pass grabs diverse PSI campaigns across investigations; fallback fills to limit
    if (picked.length < 15 && seenPsi.has(psiId)) continue;
    seenPsi.add(psiId);
    const o2 = Number(r.O2_pct) || 21;
    const p = Number(r.P_psi) || 14.7;
    const flow = Number(r.Flow_ms) || 0.12;
    const g = Number(r.g_eff) || 0;
    const thick = Number(r.Thickness_mm) || 2.0;
    const phys = computeFlameSpreadVelocity({
      O2_pct: o2,
      P_psi: p,
      Flow_ms: flow,
      g_eff: g,
      Thickness_mm: thick,
    });
    const vf = Number(r.Vf_mms) > 0 ? Number(r.Vf_mms) : phys.flameSpread_mms;
    const tMax = Number(r.T_max_K) > 300 ? Math.round(Number(r.T_max_K)) : phys.peakTemp_K;
    picked.push({
      id: `${psiId.toLowerCase()}-t${picked.length}`,
      psiId,
      investigationTitle: `${psiId} Telemetry Test Record`,
      runCode: `TST-${String(picked.length + 1).padStart(3, '0')}`,
      facility: (['CIR', 'MSG', 'Cygnus', 'FSL'].includes(String(r.facility))
        ? r.facility
        : 'CIR') as PsiRun['facility'],
      material: (r.fuel || 'PMMA').trim(),
      O2_pct: o2,
      P_psi: p,
      Flow_ms: flow,
      g_eff: g,
      Thickness_mm: thick,
      flameSpread_mms: Number(vf.toFixed(2)),
      peakTemp_K: tMax,
      radiometerFlux_Wm2: Math.round(tMax * 11.4),
      coolFlameObserved: phys.hazardStatus === 'Cool Flame Caution',
      outcome: phys.hazardStatus,
      notes: 'Loaded from public/data/nasa-space-apps/master_psi_telemetry.csv',
    });
  }
  return picked;
}

const REAL_SAMPLE_RUNS = loadRealTestRuns(25);

test('computeFlameSpreadVelocity calculates lunar exploration risk and safe thickness accurately', () => {
  const lunarResult = computeFlameSpreadVelocity({
    O2_pct: 34.0,
    P_psi: 8.2,
    Flow_ms: 0.12,
    g_eff: 0.166,
    Thickness_mm: 2.0,
  });

  assert.equal(lunarResult.hazardStatus, 'Rapid Flame Spread');
  assert.ok(lunarResult.flameSpread_mms > 1.5, 'Expected elevated flame spread in 34% O2');
  assert.ok(
    lunarResult.minSafeThickness_mm > 2.0,
    '2.0mm should be thinner than minimum safe thickness at 34% O2'
  );
});

test('computeFlameSpreadVelocity detects Self-Extinguishing regime at thick slab and low O2', () => {
  const safeResult = computeFlameSpreadVelocity({
    O2_pct: 17.5,
    P_psi: 14.7,
    Flow_ms: 0.02,
    g_eff: 0.0,
    Thickness_mm: 6.5,
  });

  assert.equal(safeResult.hazardStatus, 'Self-Extinguishing');
  assert.ok(safeResult.flameSpread_mms < 0.48);
});

test('runLocalPhysicsSimulation produces 550K-800K cool flame zones and assistant citations', () => {
  const sim = runLocalPhysicsSimulation({
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.05,
    g_eff: 0.0,
    Thickness_mm: 3.0,
    question: 'Switch to Material Safety Comparison',
  });

  assert.ok(sim.timelineSeries.length > 10);
  assert.ok(sim.timelineSeries.some((pt) => pt.isCoolFlameZone));
  assert.equal(sim.assistantReply?.suggestedVizMode, 'material-safety');
  assert.ok((sim.assistantReply?.citations.length ?? 0) > 0);
});

test('validateAndNormalizeDataset accepts valid combustion CSV and converts kPa to psi and cm/s to m/s', () => {
  const res = validateAndNormalizeDataset(SAMPLE_COMBUSTION_CSV, 'sample_lunar.csv');
  assert.equal(res.valid, true);
  assert.equal(res.parsedRuns.length, 3);
  // 56.5 kPa -> ~8.2 psi, 14.0 cm/s -> 0.14 m/s
  assert.equal(res.parsedRuns[0].P_psi, 8.2);
  assert.equal(res.parsedRuns[0].Flow_ms, 0.14);
  assert.ok(res.unitConversionsApplied.length >= 2);
});

test('validateAndNormalizeDataset rejects unrelated non-combustion CSV files', () => {
  const res = validateAndNormalizeDataset(SAMPLE_UNRELATED_CSV, 'sales_q4.csv');
  assert.equal(res.valid, false);
  assert.ok(res.reason?.includes('File Not Accepted'));
});

test('VIZ_TECHNIQUE_REGISTRY spans all 5 analytical families and evaluates compatibility dynamically', () => {
  assert.equal(VIZ_FAMILIES.length, 5);
  assert.ok(VIZ_TECHNIQUE_REGISTRY.length >= 25);
  assert.ok(
    !VIZ_TECHNIQUE_REGISTRY.some(
      (t) =>
        t.name.includes('Oxygen vs. Airflow Safety Map') ||
        t.name.includes('Material Safety Bullet Bars')
    )
  );

  const familySet = new Set(VIZ_TECHNIQUE_REGISTRY.map((t) => t.familyId));
  assert.equal(familySet.size, 5);

  const sim = runLocalPhysicsSimulation({
    O2_pct: 34.0,
    P_psi: 8.2,
    Flow_ms: 0.12,
    g_eff: 0.166,
    Thickness_mm: 2.0,
  });

  // 1) Default 3 selected runs: histogram/box/correlation are unavailable with clear messages
  const ctx3 = buildDatasetContext('selected-sim', REAL_SAMPLE_RUNS.slice(0, 3), REAL_SAMPLE_RUNS, sim);
  const eval3 = evaluateAllTechniques(ctx3);
  const hist3 = eval3.find((e) => e.definition.id === 'histogram')!;
  const box3 = eval3.find((e) => e.definition.id === 'box-quartile')!;
  const map3 = eval3.find((e) => e.definition.id === 'safety-map')!;
  assert.equal(hist3.compatibility.status, 'unavailable');
  assert.ok(hist3.compatibility.reason.includes('Unavailable: Needs at least 4 numeric samples'));
  assert.equal(box3.compatibility.status, 'unavailable');
  assert.equal(map3.compatibility.status, 'recommended');

  // 2) Full archive: histogram/box/correlation unlock as recommended
  const ctxFull = buildDatasetContext('full-archive', REAL_SAMPLE_RUNS.slice(0, 3), REAL_SAMPLE_RUNS, sim);
  const evalFull = evaluateAllTechniques(ctxFull);
  const histFull = evalFull.find((e) => e.definition.id === 'histogram')!;
  const boxFull = evalFull.find((e) => e.definition.id === 'box-quartile')!;
  const corrFull = evalFull.find((e) => e.definition.id === 'correlation-matrix')!;
  assert.equal(histFull.compatibility.status, 'recommended');
  assert.equal(boxFull.compatibility.status, 'recommended');
  assert.equal(corrFull.compatibility.status, 'recommended');

  // 3) Single focus (1 run): multi-run axis comparisons become unavailable
  const ctx1 = buildDatasetContext('single-focus', REAL_SAMPLE_RUNS.slice(0, 1), REAL_SAMPLE_RUNS, sim);
  const eval1 = evaluateAllTechniques(ctx1);
  const parallel1 = eval1.find((e) => e.definition.id === 'multi-variable')!;
  assert.equal(parallel1.compatibility.status, 'unavailable');
  assert.ok(parallel1.compatibility.reason.includes('Select 2 or more runs'));

  // 4) Static archive scope (no sequential time-series): timeline techniques become unavailable
  const ctxStatic = buildDatasetContext('static-runs', REAL_SAMPLE_RUNS.slice(0, 3), REAL_SAMPLE_RUNS, sim);
  const evalStatic = evaluateAllTechniques(ctxStatic);
  const timelineStatic = evalStatic.find((e) => e.definition.id === 'sensor-timeline')!;
  assert.equal(timelineStatic.compatibility.status, 'unavailable');
  assert.ok(timelineStatic.compatibility.reason.includes('Requires sequential time-series data'));

  // 5) Search & status filter helper
  const filteredUnavailable = filterTechniques(eval3, {
    searchQuery: 'histogram',
    statusFilter: 'unavailable',
    familyFilter: 'distributions',
  });
  assert.equal(filteredUnavailable.length, 1);
  assert.equal(filteredUnavailable[0].definition.id, 'histogram');
});

test('resolveChatVisualization validates none, auto, and incompatible requests with alternatives', () => {
  const sliders = {
    O2_pct: 34.0,
    P_psi: 8.2,
    Flow_ms: 0.12,
    g_eff: 0.166,
    Thickness_mm: 2.0,
    material: 'PMMA' as const,
    ignitionFlux_Wm2: 25000,
    sampleGeometry: 'Thin Slab' as const,
    customMaterialLabel: '',
  };
  const simulation = runLocalPhysicsSimulation(sliders, REAL_SAMPLE_RUNS);
  const selected = REAL_SAMPLE_RUNS.slice(0, 3);

  const noneChart = resolveChatVisualization({
    question: 'Explain why oxygen increases flame speed.',
    mode: 'literature',
    requestedVizOutput: 'none',
    attachments: [],
    selectedRuns: selected,
    catalogRuns: REAL_SAMPLE_RUNS,
    simulation,
    sliders,
  });
  assert.equal(noneChart, undefined);

  const autoChart = resolveChatVisualization({
    question: 'Compare oxygen vs airflow safety boundary across lunar runs.',
    mode: 'decoder',
    requestedVizOutput: 'auto',
    attachments: [
      {
        id: 'att-lab',
        kind: 'virtual-lab',
        label: 'Virtual Test Lab Current Run',
      },
    ],
    selectedRuns: selected,
    catalogRuns: REAL_SAMPLE_RUNS,
    simulation,
    sliders,
  });
  assert.ok(autoChart && autoChart.status === 'rendered');
  assert.ok(
    autoChart.resolvedVizMode &&
      autoChart.headline &&
      autoChart.headline.length > 5
  );

  const incompatibleChart = resolveChatVisualization({
    question: 'Plot these selected historical runs as a sensor timeline.',
    mode: 'literature',
    requestedVizOutput: 'sensor-timeline',
    attachments: [
      {
        id: 'att-comp',
        kind: 'comparator-runs',
        label: 'Run Comparator',
      },
    ],
    selectedRuns: selected,
    catalogRuns: REAL_SAMPLE_RUNS,
    simulation,
    sliders,
  });
  assert.ok(incompatibleChart && incompatibleChart.status === 'incompatible');
  assert.ok(
    incompatibleChart.incompatibilityReason &&
      incompatibleChart.incompatibilityReason.length > 10
  );
  assert.ok(
    incompatibleChart.compatibleAlternatives &&
      incompatibleChart.compatibleAlternatives.length > 0
  );
  assert.ok(
    !incompatibleChart.compatibleAlternatives.some(
      (alt) => alt.vizMode === 'sensor-timeline'
    )
  );
});

test('chatStorage derives titles cleanly and maintains newest-first thread order', () => {
  const firstThread = createChatThread('New Chat');
  const olderThread = {
    ...createChatThread('Older Inquiry'),
    updatedAtMs: firstThread.updatedAtMs - 60_000,
  };

  assert.equal(deriveChatThreadTitle('   Compare   PSI-122  and  PSI-138  '), 'Compare PSI-122 and PSI-138');
  const longTitle = deriveChatThreadTitle('A'.repeat(70));
  assert.ok(longTitle.endsWith('...') && longTitle.length <= 46);

  const ordered = sortThreadsNewestFirst([olderThread, firstThread]);
  assert.equal(ordered[0].id, firstThread.id);

  const updatedList = appendMessagesToThread(ordered, olderThread.id, [
    {
      id: 'msg-u1',
      role: 'user',
      text: 'Why does low gravity sustain cool flames?',
      mode: 'literature',
      timestamp: '10:00',
    },
  ]);
  assert.equal(updatedList[0].id, olderThread.id);
  assert.equal(updatedList[0].messages.length, 1);

  const autoTitled = appendMessagesToThread(ordered, firstThread.id, [
    {
      id: 'msg-u2',
      role: 'user',
      text: 'Summarize Nomex vs PMMA ignition limits',
      mode: 'risk-audit',
      timestamp: '10:05',
    },
  ]);
  const renamedFirst = autoTitled.find((t) => t.id === firstThread.id)!;
  assert.equal(renamedFirst.title, 'Summarize Nomex vs PMMA ignition limits');
});

test('psiApi multi-profile endpoint manager persists, switches active model, and falls back to local model', () => {
  const store = new Map<string, string>();
  const hadWindow = 'window' in globalThis;
  const prevWindow = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    assert.equal(getActiveEndpointProfileId(), LOCAL_MODEL_ID);
    const { profiles: afterAdd, saved } = upsertApiEndpointProfile(
      {
        name: 'Lab FastAPI',
        baseUrl: 'http://127.0.0.1:8000',
        apiKeyHeader: 'X-API-Key',
        apiKeyValue: 'test-secret',
        modelId: 'psi-v2',
      },
      true
    );
    assert.equal(afterAdd.length, 1);
    assert.equal(getActiveEndpointProfileId(), saved.id);
    assert.equal(getApiEndpointProfiles().length, 1);

    setActiveEndpointProfileId(LOCAL_MODEL_ID);
    assert.equal(getActiveEndpointProfileId(), LOCAL_MODEL_ID);

    setActiveEndpointProfileId(saved.id);
    const afterDelete = deleteApiEndpointProfile(saved.id);
    assert.equal(afterDelete.length, 0);
    assert.equal(getActiveEndpointProfileId(), LOCAL_MODEL_ID);
  } finally {
    if (hadWindow) {
      (globalThis as Record<string, unknown>).window = prevWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  }
});

test('Virtual Test Lab accounts for material, ignition flux, and model confidence scoring', () => {
  const baseParams = {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.15,
    g_eff: 0.0,
    Thickness_mm: 1.5,
  };

  const pmma = computeFlameSpreadVelocity({ ...baseParams, material: 'PMMA', ignitionFlux_Wm2: 25000 });
  const cotton = computeFlameSpreadVelocity({ ...baseParams, material: 'Cotton-Fiberglass', ignitionFlux_Wm2: 25000 });
  const nomex = computeFlameSpreadVelocity({ ...baseParams, material: 'Nomex', ignitionFlux_Wm2: 25000 });
  assert.ok(nomex.flameSpread_mms < cotton.flameSpread_mms, 'Nomex must spread slower than Cotton-Fiberglass');
  assert.ok(cotton.flameSpread_mms <= pmma.flameSpread_mms, 'Cotton-Fiberglass must not exceed PMMA spread rate');

  // Below 5000 W/m2 clamp floors identically; active igniter range 12k vs 38k W/m2 scales spread velocity monotonically
  const clampedLow = computeFlameSpreadVelocity({ ...baseParams, material: 'PMMA', ignitionFlux_Wm2: 1200 });
  const floorFlux = computeFlameSpreadVelocity({ ...baseParams, material: 'PMMA', ignitionFlux_Wm2: 5000 });
  assert.equal(clampedLow.flameSpread_mms, floorFlux.flameSpread_mms);

  const lowFlux = computeFlameSpreadVelocity({ ...baseParams, material: 'PMMA', ignitionFlux_Wm2: 12000 });
  const highFlux = computeFlameSpreadVelocity({ ...baseParams, material: 'PMMA', ignitionFlux_Wm2: 38000 });
  assert.ok(highFlux.flameSpread_mms > lowFlux.flameSpread_mms, 'Higher ignition flux must increase flame spread speed');

  const nominalSim = runLocalPhysicsSimulation(baseParams, REAL_SAMPLE_RUNS);
  assert.ok(nominalSim.modelConfidence, 'nominalSim.modelConfidence must be populated');
  assert.ok(
    nominalSim.modelConfidence.confidencePct >= 40 && nominalSim.modelConfidence.confidencePct <= 99.5
  );
  assert.ok(nominalSim.modelConfidence.validatedRunCount >= 1);
  assert.ok(nominalSim.modelConfidence.physicalTestingRecommendation.length > 0);
  assert.ok(nominalSim.modelConfidence.rationale.length > 10);

  const extremeSim = runLocalPhysicsSimulation(
    {
      O2_pct: 55.0,
      P_psi: 4.5,
      Flow_ms: 0.45,
      g_eff: 0.38,
      Thickness_mm: 0.3,
    },
    REAL_SAMPLE_RUNS
  );
  assert.ok(extremeSim.modelConfidence, 'extremeSim.modelConfidence must be populated');
  assert.ok(
    extremeSim.modelConfidence.confidencePct <= nominalSim.modelConfidence.confidencePct,
    'Sparse extreme operating points should not score higher confidence than well-sampled 21% O2 archive points'
  );
  assert.equal(extremeSim.modelConfidence.physicalTestingRecommendation, 'Recommended');
});

test('Model Console supports all 4 operational modes and offline FastAPI health fallback', async () => {
  const health = await testApiEndpointHealth({
    baseUrl: '',
    apiKeyHeader: 'X-API-Key',
    apiKeyValue: '',
  });
  assert.equal(health.ok, true);
  assert.equal(health.mode, 'offline-fallback');

  const params = {
    O2_pct: 32.0,
    P_psi: 8.2,
    Flow_ms: 0.12,
    g_eff: 0.166,
    Thickness_mm: 1.8,
  };
  const sim = runLocalPhysicsSimulation(params, REAL_SAMPLE_RUNS);

  const sweep = buildWhatIfSweep(params, 'Test hypothetical 36% O2');
  assert.ok(sweep.length >= 4);

  const decoderReq = {
    ...params,
    consoleMode: 'decoder' as const,
    activeChartContext: {
      datasetLabel: 'Full PSI Archive',
      techniqueName: '2D Regime Heatmap',
      xAxisLabel: 'O₂ %',
      yAxisLabel: 'Airflow m/s',
      colorByLabel: 'Safety Regime',
      runCount: REAL_SAMPLE_RUNS.length,
      anomalies: ['Cool-flame transition cluster at 0.04 m/s'],
      summaryHeadline: 'Test chart decode context',
    },
  };
  const decoderReply = buildAssistantReply('Decode the current chart', sim, decoderReq);
  assert.ok(decoderReply.steps.join(' ').includes('2D Regime Heatmap'));
  assert.ok(decoderReply.citations.length >= 1);

  const whatIfRes = await runModelConsoleInference({
    question: 'Test hypothetical 36% O2 vs 26% O2 sweep',
    mode: 'what-if',
    request: { ...params, consoleMode: 'what-if' },
    catalog: REAL_SAMPLE_RUNS,
  });
  assert.ok(whatIfRes.assistantReply, 'whatIfRes.assistantReply must be populated');
  assert.ok((whatIfRes.assistantReply.whatIfRows?.length ?? 0) >= 4);
  assert.ok(
    whatIfRes.assistantReply.recommendedParams,
    'What-if response should include applyable recommendedParams'
  );

  const riskAuditReply = buildAssistantReply('Audit quenching safety margin', sim, {
    ...params,
    consoleMode: 'risk-audit',
  });
  assert.ok(riskAuditReply.steps.join(' ').length > 40);

  const literatureReply = buildAssistantReply('SAFFIRE-II PMMA oxygen index correlation', sim, {
    ...params,
    consoleMode: 'literature',
  });
  assert.ok(literatureReply.citations.length >= 1);
});

test('Studio datasets, dynamic axes, PSI links, and zero NASA/pill compliance checks pass', () => {
  assert.equal(STUDIO_DATASET_SOURCES.length, 5);
  assert.ok(STUDIO_NUMERIC_COLUMNS.length >= 8);
  assert.ok(STUDIO_CATEGORICAL_COLUMNS.length >= 4);

  const heatmapAxes = getDefaultAxesForTechnique('safety-map');
  assert.equal(heatmapAxes.xAxis, 'O2_pct');
  assert.equal(heatmapAxes.yAxis, 'Flow_ms');

  for (const caseItem of MISSION_AND_SPINOFF_CASES) {
    assert.ok(
      !/nasa/i.test(caseItem.sourceDisplayUrl),
      `Visible sourceDisplayUrl "${caseItem.sourceDisplayUrl}" must not contain NASA branding`
    );
    assert.ok(caseItem.sourceUrl.startsWith('https://'));
  }

  for (const run of REAL_SAMPLE_RUNS.slice(0, 5)) {
    const portalLink = getPsiSourceLink(run);
    assert.equal(portalLink.href, 'https://psi.nasa.gov/');
    assert.ok(!/nasa/i.test(portalLink.displayPath));
  }

  // Verify no rounded-full pill badges or guessed /investigations/ URLs remain in src/
  const srcRoot = path.resolve(process.cwd(), 'src');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(srcRoot);

  for (const file of files) {
    if (file.endsWith('physicsEngine.test.ts')) continue;
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!text.includes('rounded-full'), `Disallowed rounded-full pill class found in ${file}`);
    assert.ok(
      !text.includes('psi.nasa.gov/investigations/'),
      `Guessed 404 psi.nasa.gov/investigations/ URL found in ${file}`
    );
    assert.ok(
      !/#3B82F6|selection:bg-sky-/i.test(text),
      `Disallowed blue/sky chrome accent found in ${file}`
    );
  }
});

test('sanitizeVisiblePsiText scrubs agency branding and control chars from loaded catalog & chunks', () => {
  const catalogPath = path.resolve(
    process.cwd(),
    'public/data/nasa-space-apps/psi_runs_catalog.json'
  );
  const chunksPath = path.resolve(
    process.cwd(),
    'public/data/nasa-space-apps/psi_literature_chunks.json'
  );
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as {
    investigations: Array<{
      title?: string;
      objective?: string;
      hypothesis?: string;
      experiment_hardware?: string;
      managing_center?: string;
      publications?: { title?: string[]; authors?: string[] };
    }>;
  };
  for (const inv of catalog.investigations) {
    for (const raw of [
      inv.title,
      inv.objective,
      inv.hypothesis,
      inv.experiment_hardware,
      inv.managing_center,
      ...(inv.publications?.title ?? []),
    ]) {
      const cleaned = sanitizeVisiblePsiText(raw);
      assert.ok(
        !/\bnasa\b/i.test(cleaned),
        `Sanitized investigation text must not expose NASA branding: ${cleaned}`
      );
    }
  }

  const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf8')) as Array<{ text: string }>;
  for (const ch of chunks.slice(0, 60)) {
    const cleaned = sanitizeVisiblePsiText(ch.text);
    assert.ok(!/\bnasa\b/i.test(cleaned), `Chunk text must not expose NASA: ${cleaned}`);
    assert.ok(!/[\u0000-\u001f]/.test(cleaned), 'Control bell chars must be stripped');
  }
});

test('validateAndNormalizeDataset handles explicit psi/ms, quoted CSV, JSON payload, material physics, and agency scrubbing', () => {
  const quotedCsv = [
    'run_id,investigation,facility,fuel_material,oxygen_pct,p_psi,flow_ms,gravity_g,thickness_mm,notes',
    'PSI-Q1,"SAFFIRE, Lunar Array",Cygnus,Nomex,24.0,30.0,0.18,0.166,2.0,"NASA GRC benchmark, high pressure 30 psi"',
    'PSI-Q2,"ACME Low Pressure",CIR,PMMA,32.0,2.0,0.08,0.0,1.5,"Explicit low psi test"',
  ].join('\n');

  const csvRes = validateAndNormalizeDataset(quotedCsv, 'quoted.csv');
  assert.equal(csvRes.valid, true);
  assert.equal(csvRes.parsedRuns.length, 2);
  assert.equal(csvRes.parsedRuns[0].P_psi, 30.0);
  assert.equal(csvRes.parsedRuns[1].P_psi, 2.0);
  assert.equal(csvRes.parsedRuns[0].Flow_ms, 0.18);
  assert.ok(csvRes.parsedRuns[0].flameSpread_mms < 0.8);
  assert.ok(!/\bnasa\b/i.test(csvRes.parsedRuns[0].notes));

  const jsonPayload = JSON.stringify({
    runs: [
      {
        psiId: 'PSI-JSON-1',
        material: 'PMMA',
        O2_pct: 34.0,
        P_psi: 8.2,
        Flow_ms: 0.14,
        g_eff: 0.166,
        Thickness_mm: 2.0,
      },
    ],
  });
  const jsonRes = validateAndNormalizeDataset(jsonPayload, 'custom.json');
  assert.equal(jsonRes.valid, true);
  assert.equal(jsonRes.parsedRuns.length, 1);
  assert.equal(jsonRes.parsedRuns[0].psiId, 'PSI-JSON-1');
  assert.equal(jsonRes.parsedRuns[0].P_psi, 8.2);
});

test('psiApi remote HTTP endpoint adapter authenticates, validates schema, and falls back on 500/bad JSON', async () => {
  let mode: 'ok' | 'bad-json' | 'error' = 'ok';
  let seenHeader = '';

  const server = http.createServer((req, res) => {
    seenHeader = String(req.headers['x-api-key'] ?? '');
    if (req.url === '/health') {
      res.writeHead(mode === 'error' ? 500 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: mode !== 'error' }));
      return;
    }
    if (req.url === '/api/analyze') {
      if (mode === 'error') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ detail: 'boom' }));
        return;
      }
      if (mode === 'bad-json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ flameSpread_mms: 'not-a-number', hazardStatus: 'Invalid' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ flameSpread_mms: 4.32, hazardStatus: 'Rapid Flame Spread' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const store = new Map<string, string>();
  const origWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    },
  };

  try {
    saveApiEndpointConfig({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKeyHeader: 'X-API-Key',
      apiKeyValue: 'secret-test-key',
    });
    assert.equal(getApiEndpointConfig().apiKeyValue, 'secret-test-key');

    const healthOk = await testApiEndpointHealth();
    assert.equal(healthOk.ok, true);
    assert.equal(healthOk.mode, 'remote');
    assert.equal(seenHeader, 'secret-test-key');

    const reqParams = {
      O2_pct: 34.0,
      P_psi: 8.2,
      Flow_ms: 0.12,
      g_eff: 0.166,
      Thickness_mm: 2.0,
    };
    const remoteRes = await analyzeCombustionState(reqParams, REAL_SAMPLE_RUNS);
    assert.equal(remoteRes.flameSpread_mms, 4.32);

    mode = 'bad-json';
    const localExpected = runLocalPhysicsSimulation(reqParams, REAL_SAMPLE_RUNS);
    const sanitizedRes = await analyzeCombustionState(reqParams, REAL_SAMPLE_RUNS);
    assert.equal(sanitizedRes.flameSpread_mms, localExpected.flameSpread_mms);
    assert.equal(sanitizedRes.hazardStatus, localExpected.hazardStatus);

    mode = 'error';
    const healthErr = await testApiEndpointHealth();
    assert.equal(healthErr.ok, false);
    assert.equal(healthErr.mode, 'offline-fallback');
    const fallbackRes = await analyzeCombustionState(reqParams, REAL_SAMPLE_RUNS);
    assert.equal(fallbackRes.flameSpread_mms, localExpected.flameSpread_mms);
  } finally {
    if (origWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = origWindow;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('typography hierarchy avoids monospace on legends, prose, statuses, and referenced data assets exist on disk', () => {
  const rootDir = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
  const readComp = (relPath: string) =>
    fs.readFileSync(path.join(rootDir, 'src', 'components', relPath), 'utf8');

  const studio = readComp('VisualAnalyticsStudio.tsx');
  assert.ok(!/className="font-mono[^"]*">\s*\{activeTechnique\.definition\.familyLabel\}/.test(studio));
  assert.ok(!/text-\[11px\] font-mono shrink-0 whitespace-nowrap/.test(studio));
  assert.ok(!/font-mono[^"]*">\s*\{similarityPct\}% match/.test(studio));

  const renderer = readComp('VizTechniqueRenderer.tsx');
  assert.ok(!/<Legend[\s\S]{0,160}JetBrains Mono/.test(renderer), 'Chart legends must use Inter, not JetBrains Mono');
  assert.ok(!/<YAxis[\s\S]{0,180}dataKey="name"[\s\S]{0,180}tick=\{\{[^}]*JetBrains Mono/.test(renderer));
  assert.ok(!/font-mono[^"]*">\s*n = \{activeRuns/.test(renderer));
  assert.ok(!/font-mono font-semibold whitespace-nowrap">\{row\.psiId\}/.test(renderer));
  assert.ok(!/<span className="font-mono[^"]*">\s*Dashed Line =/.test(renderer));
  assert.ok(!/<span className="font-mono[^"]*">\s*Dashed Rule =/.test(renderer));
  assert.ok(!/<span className="font-mono[^"]*">\s*Zero Line = Exact Calibration Fit/.test(renderer));
  assert.ok(!/<span className="font-mono[^"]*">\s*Shaded Band:/.test(renderer));
  assert.ok(!/text-right font-mono font-bold">\s*<span className=\{passes/.test(renderer));

  const consoleView = readComp('ModelConsoleView.tsx');
  assert.ok(!/font-mono text-zinc-500 mb-1">\s*<span>OPERATOR QUERY/.test(consoleView));
  assert.ok(!/<span className="font-mono[^"]*">\s*\{msg\.mode\}/.test(consoleView));
  assert.ok(!/font-mono text-zinc-500 \$\{subSurface\}">\s*Executing Combustion Model Inference/.test(consoleView));
  assert.ok(!/"font-mono tabular-nums">\{msg\.timestamp\}/.test(consoleView));
  assert.ok(!/"font-mono text-\[11px\] text-zinc-500 tabular-nums">\s*\{msg\.timestamp\}/.test(consoleView));

  const catalog = readComp('CatalogView.tsx');
  assert.ok(!/<span className="font-mono[^"]*">\s*Source:/.test(catalog));
  assert.ok(!/<span className="font-mono font-semibold">\s*ISS Researcher's Guide/.test(catalog));
  assert.ok(!/text-\[11px\] font-mono[^"]*">\s*<span className="truncate">\s*Official Reference:/.test(catalog));
  assert.ok(!/font-mono text-\[11px\] font-semibold mt-0\.5 leading-snug">\s*\{param\.value\}/.test(catalog));
  assert.ok(!/className="font-mono[^"]*">\s*\{inv\.psiId\} · \{inv\.acronym\}/.test(catalog));

  const detail = readComp('PsiInvestigationDetailView.tsx');
  assert.ok(!/<span className="font-mono[^"]*">\s*Facility:/.test(detail));
  assert.ok(!/<span className="font-mono font-semibold[^"]*">\s*\{run\.coolFlameObserved/.test(detail));
  assert.ok(!/font-mono text-\[11px\][^"]*">\s*Center: \{investigationRecord\.managingCenter\}/.test(detail));
  assert.ok(!/font-mono font-bold tracking-tight">\s*\{investigationRecord\s*\?/.test(detail));
  assert.ok(!/font-mono text-\[10px\][^"]*">\s*\{art\.format\}/.test(detail));

  const sync = readComp('ImportSyncView.tsx');
  assert.ok(!/<span className="font-mono[^"]*">\s*Matched keys:/.test(sync));
  assert.ok(!/<div className="font-mono[^"]*">\s*Smart Unit Normalizer:/.test(sync));
  assert.ok(!/<span className="font-mono">\s*Facility: \{entry\.facility\}/.test(sync));
  assert.ok(!/<input[\s\S]{0,220}className=\{`[^`]*font-mono[^`]*`\}/.test(sync));
  assert.ok(!/text-xs font-mono">\s*<span className="font-bold">\{entry\.psiId\}/.test(sync));

  const runsView = readComp('ExperimentRunsView.tsx');
  assert.ok(!/<span className="font-mono[^"]*">\s*Showing\b/.test(runsView));
  assert.ok(!/font-mono text-xs">\s*<button[\s\S]{0,400}Page \{safePage\}/.test(runsView));

  const testLab = readComp('VirtualTestLab.tsx');
  assert.ok(!/<span className="font-mono text-\[10px\] text-zinc-500">\s*\[\{mat\.code\}\]/.test(testLab));
  assert.ok(!/font-mono text-zinc-500 tabular-nums">\s*\{confidence\.nearestDeltaSummary\}/.test(testLab));
  assert.ok(!/font-mono tabular-nums">\{lastRunTimestamp\}/.test(testLab));
  assert.ok(!/flex justify-between font-mono/.test(testLab));
  assert.ok(!/font-mono text-\[11px\] text-zinc-500 tabular-nums">\s*LOI/.test(testLab));
  assert.ok(!/font-mono text-\[10px\] text-zinc-500 tabular-nums shrink-0">\s*LOI/.test(testLab));

  const comparator = readComp('RunComparator.tsx');
  assert.ok(!/contentStyle=\{\{[\s\S]{0,260}JetBrains Mono/.test(comparator));

  const loaderSrc = fs.readFileSync(path.join(rootDir, 'src', 'services', 'dataLoader.ts'), 'utf8');
  const refMatches = Array.from(loaderSrc.matchAll(/\$\{DATA_BASE_PATH\}\/([a-zA-Z0-9_.\-/]+)/g)).map((m) => m[1]);
  assert.ok(refMatches.length >= 7, 'Expected all referenced static dataset files in dataLoader.ts');
  for (const rel of refMatches) {
    const absPath = path.join(rootDir, 'public', 'data', 'nasa-space-apps', rel);
    assert.ok(fs.existsSync(absPath), `Missing public data asset: ${absPath}`);
    assert.ok(fs.statSync(absPath).size > 0, `Empty public data asset: ${absPath}`);
  }
});

test('zero hardcoded mock runs, simulated syncs, or fake UTC timestamps remain in app runtime', () => {
  const rootDir = path.resolve(
    import.meta.dirname ??
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
    '..',
    '..'
  );
  assert.ok(
    !fs.existsSync(path.join(rootDir, 'src', 'data', 'baselineRuns.ts')),
    'src/data/baselineRuns.ts placeholder file must be deleted'
  );

  const srcFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if ((full.endsWith('.ts') || full.endsWith('.tsx')) && !full.endsWith('.test.ts')) {
        srcFiles.push(full);
      }
    }
  };
  walk(path.join(rootDir, 'src'));

  const forbidden = [
    /PSI-164/i,
    /BASELINE_PSI_RUNS/,
    /INITIAL_SYNC_CHANGELOG/,
    /SIMULATED_NEW_SYNC_ENTRY/,
    /Simulate Syncing New Investigation/i,
    /Today,\s*06:40 UTC/,
    /Yesterday,\s*19:15 UTC/,
    /3 days ago/,
    /data\/baselineRuns/,
  ];

  for (const file of srcFiles) {
    const txt = fs.readFileSync(file, 'utf8');
    for (const rx of forbidden) {
      assert.ok(!rx.test(txt), `Forbidden mock/simulated pattern ${rx} found in ${file}`);
    }
  }

  // Empty catalog fallback should remain finite and safe prior to async load completion
  const emptySim = runLocalPhysicsSimulation(
    { O2_pct: 34.0, P_psi: 8.2, Flow_ms: 0.12, g_eff: 0.166, Thickness_mm: 2.0 },
    []
  );
  assert.ok(Number.isFinite(emptySim.flameSpread_mms));
  assert.equal(emptySim.nearestRuns.length, 0);
  assert.equal(emptySim.modelConfidence?.validatedRunCount, 0);
});

test('full-screen landing view, inside-app overview guide, sidebar logo return, blank console composer, unique bar labels, and zero leaks hold', () => {
  const rootDir = path.resolve(
    import.meta.dirname ??
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
    '..',
    '..'
  );
  const readFile = (...segs: string[]) =>
    fs.readFileSync(path.join(rootDir, ...segs), 'utf8');

  const appSrc = readFile('src', 'App.tsx');
  assert.ok(
    appSrc.includes('useState<boolean>(true)') && appSrc.includes('<LandingView'),
    'App must open on dedicated full-screen LandingView first'
  );
  assert.ok(
    appSrc.includes("useState<WorkspaceView>('overview')"),
    'App main shell must default to inside-app Overview page'
  );
  assert.ok(
    appSrc.includes('onReturnToLanding={() => setShowLanding(true)}'),
    'LeftSidebar must receive onReturnToLanding callback to return to LandingView'
  );
  assert.ok(
    appSrc.includes('loadChatThreads') && appSrc.includes('createChatThread'),
    'Model Console must initialize persistent localStorage chat threads with fresh empty welcome thread'
  );

  const landingSrc = readFile('src', 'components', 'LandingView.tsx');
  assert.ok(landingSrc.includes('18') && landingSrc.includes('Space Flight Experiments'), 'LandingView must render 18 Space Flight Experiments stat');
  assert.ok(landingSrc.includes('1616') && landingSrc.includes('Calibrated Test Runs'), 'LandingView must render 1616 Calibrated Test Runs stat');
  assert.ok(landingSrc.includes('979') && landingSrc.includes('Guide &amp; Report Sections'), 'LandingView must render 979 Guide & Report Sections stat');
  assert.ok(landingSrc.includes('missionCasesCount') && landingSrc.includes('Fire History &amp; Spin-Off Cases'), 'LandingView must render 8 Fire History & Spin-Off Cases stat');
  assert.ok(landingSrc.includes('Open PSI Data Manager') && landingSrc.includes('Try Lunar Cabin Scenario'), 'LandingView must include hero CTAs');
  assert.ok(
    landingSrc.includes('<HeroFlameCanvas') &&
      landingSrc.includes('min-h-screen') &&
      landingSrc.includes('flex-col justify-between') &&
      !landingSrc.includes('spherical-flame-pulse'),
    'LandingView hero must fill min-h-screen with centered content and render HeroFlameCanvas'
  );
  assert.ok(
    fs.existsSync(path.join(rootDir, 'public', 'images', 'hero-flame.png')),
    'Hero flame photograph must exist at public/images/hero-flame.png'
  );
  const heroCanvasSrc = readFile('src', 'components', 'HeroFlameCanvas.tsx');
  assert.ok(
    heroCanvasSrc.includes('IMAGE_CANDIDATES') &&
      heroCanvasSrc.includes('mix-blend-lighten') &&
      heroCanvasSrc.includes('hero-flame-ambient') &&
      heroCanvasSrc.includes('PARTICLE_COUNT = 54') &&
      !heroCanvasSrc.includes('tileSrcW') &&
      heroCanvasSrc.includes("removeEventListener('mousemove'"),
    'HeroFlameCanvas must render crisp un-sliced whole flame image with ambient CSS motion and 54 cursor-reactive embers'
  );

  // Two-tier export system verification
  assert.equal(HEADER_EXPORT_SECTION_OPTIONS.length, 5, 'Header Export checklist must offer 5 selectable sections');
  const sampleCsv = buildCsvDocument(
    ['Run', 'Notes'],
    [['PSI-101', 'Microgravity "cool flame", steady']]
  );
  assert.equal(
    sampleCsv,
    'Run,Notes\nPSI-101,"Microgravity ""cool flame"", steady"',
    'buildCsvDocument must RFC-4180 quote cells with commas or quotes'
  );
  const headerSrc = readFile('src', 'components', 'HeaderBar.tsx');
  assert.ok(
    headerSrc.includes('Download Selected') && !headerSrc.includes('Export Safety Brief'),
    'HeaderBar must replace Export Safety Brief with interactive multi-select Export dropdown'
  );
  assert.ok(readFile('src', 'components', 'VirtualTestLab.tsx').includes('Export Test'));
  assert.ok(readFile('src', 'components', 'RunComparator.tsx').includes('Export Comparison'));
  assert.ok(readFile('src', 'components', 'VisualAnalyticsStudio.tsx').includes('Export Chart'));
  assert.ok(!readFile('src', 'components', 'VisualAnalyticsStudio.tsx').includes('Chart export format'));
  assert.ok(readFile('src', 'components', 'ExperimentRunsView.tsx').includes('Export Data'));
  assert.ok(readFile('src', 'components', 'PsiInvestigationDetailView.tsx').includes('Export Data'));
  assert.ok(readFile('src', 'components', 'ModelConsoleView.tsx').includes('Export Chat'));

  const overviewSrc = readFile('src', 'components', 'OverviewView.tsx');
  assert.ok(overviewSrc.includes('How to Use This Platform'), 'OverviewView must include 3-step guide section');
  assert.ok(overviewSrc.includes('What Is Inside Each Section'), 'OverviewView must include 6 section cards');
  assert.ok(overviewSrc.includes('Quick-Start Examples'), 'OverviewView must include 3 quick-start cards');

  const sidebarSrc = readFile('src', 'components', 'LeftSidebar.tsx');
  assert.ok(sidebarSrc.includes('onClick={onReturnToLanding}') && sidebarSrc.includes('>Overview<'), 'LeftSidebar must rename top item to Overview and return to LandingView on logo click');

  const consoleSrc = readFile('src', 'components', 'ModelConsoleView.tsx');
  const formIdx = consoleSrc.indexOf('<form');
  const mapIdx = consoleSrc.indexOf('messages.map(');
  assert.ok(
    formIdx > 0 && mapIdx > 0 && mapIdx < formIdx,
    'Gemini-style Model Console renders message stream above bottom composer'
  );
  assert.ok(
    consoleSrc.includes('<textarea') && consoleSrc.includes('rounded-2xl'),
    'Model Console uses floating rounded-2xl composer bar'
  );
  assert.ok(
    consoleSrc.includes('w-[240px]') && consoleSrc.includes('New Chat'),
    'Model Console includes 240px collapsible Chat History drawer with + New Chat'
  );
  assert.ok(
    consoleSrc.includes('SpeechRecognition') &&
      consoleSrc.includes('webkitSpeechRecognition'),
    'Model Console supports Web Speech API voice dictation'
  );
  assert.ok(
    !consoleSrc.includes('>API Config<'),
    'Model Console removes standalone header API Config button'
  );
  const importSyncSrc = readFile('src', 'components', 'ImportSyncView.tsx');
  assert.ok(
    !importSyncSrc.includes('Remote Model Endpoint'),
    'Data Import & Sync removes duplicate Remote Model Endpoint panel'
  );

  const rendererSrc = readFile('src', 'components', 'VizTechniqueRenderer.tsx');
  assert.ok(
    rendererSrc.includes('${shortPsi} · ${runCode}'),
    'Horizontal Ranked Bar chart must label Y-axis ticks with both PSI ID and runCode'
  );

  // Ensure components and engine expose zero internal filesystem paths, zero rounded-full pills, and zero agency/workspace leaks
  const componentsDir = path.join(rootDir, 'src', 'components');
  for (const name of fs.readdirSync(componentsDir)) {
    if (!name.endsWith('.tsx')) continue;
    const text = readFile('src', 'components', name);
    assert.ok(!/rounded-full/.test(text), `Forbidden rounded-full class found in ${name}`);
    assert.ok(!/public\/data\/nasa-space-apps/i.test(text), `Internal public path leaked in ${name}`);
    assert.ok(!/\bnasa-space-apps\b/i.test(text), `Internal folder slug leaked in ${name}`);
    assert.ok(!/Antigravity/i.test(text), `Workspace tool name leaked in ${name}`);
  }
  const engineSrc = readFile('src', 'utils', 'physicsEngine.ts');
  assert.ok(!/public\/data\/nasa-space-apps/i.test(engineSrc), 'Internal public path leaked in physicsEngine.ts');
  assert.ok(!/Antigravity/i.test(engineSrc), 'Workspace tool name leaked in physicsEngine.ts');

  const apiModalSrc = readFile('src', 'components', 'ApiSettingsModal.tsx');
  assert.ok(
    !apiModalSrc.includes('Researcher Profile ID') &&
      !apiModalSrc.includes('Reply Detail Depth'),
    'ApiSettingsModal must focus strictly on Remote Model Endpoints and API keys'
  );
  const settingsModalSrc = readFile('src', 'components', 'SettingsModal.tsx');
  assert.ok(
    settingsModalSrc.includes('General Preferences') &&
      settingsModalSrc.includes('Researcher Profile') &&
      settingsModalSrc.includes('Appearance &amp; Accessibility') &&
      settingsModalSrc.includes('Keyboard Shortcuts') &&
      settingsModalSrc.includes('Account &amp; Learned Memory'),
    'SettingsModal must expose 5 settings categories cleanly'
  );
  assert.ok(
    consoleSrc.includes('Reply Detail Depth') &&
      consoleSrc.includes('Brief') &&
      consoleSrc.includes('Standard') &&
      consoleSrc.includes('Deep') &&
      consoleSrc.includes('Helpful') &&
      consoleSrc.includes('Correct / Teach Model'),
    'ModelConsoleView must render Reply Detail Depth in model popover plus inline Helpful and Correct / Teach Model actions'
  );
  const landingWithAuth = readFile('src', 'components', 'LandingView.tsx');
  assert.ok(
    landingWithAuth.includes('Sign In') &&
      sidebarSrc.includes('Settings') &&
      sidebarSrc.includes('Ctrl+K'),
    'LandingView and LeftSidebar must expose Sign In gate, Settings footer, and Ctrl+K global search'
  );
});

test('unified psiApi handshake, run ingestion, per-user adaptation, and closed-loop feedback learning work end-to-end', async () => {
  const capturedPaths: string[] = [];
  let capturedSyncBody: Record<string, unknown> | null = null;
  let capturedIngestBody: Record<string, unknown> | null = null;
  let capturedFeedbackBody: Record<string, unknown> | null = null;
  let capturedAnalyzeBody: Record<string, unknown> | null = null;

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      capturedPaths.push(req.url ?? '');

      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.url === '/sync-corpus') {
        capturedSyncBody = parsed;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'synced' }));
        return;
      }
      if (req.url === '/ingest-runs') {
        capturedIngestBody = parsed;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ingested: true }));
        return;
      }
      if (req.url === '/feedback') {
        capturedFeedbackBody = parsed;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ accepted: true }));
        return;
      }
      if (req.url === '/api/analyze') {
        capturedAnalyzeBody = parsed;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            flameSpread_mms: 2.41,
            hazardStatus: 'Rapid Flame Spread',
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });

  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve())
  );
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  const store = new Map<string, string>();
  const origWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    },
  };

  try {
    setResearcherId('RES-ALPHA');
    setExplanationDepth('detailed');
    recordFuelUsage('Nomex');
    recordFuelUsage('Nomex');
    recordGravityUsage(0.166);
    recordChartUsage('scatter-plot');

    const profile = getOrCreateUserProfile();
    assert.equal(profile.researcherId, 'RES-ALPHA');
    assert.equal(profile.explanationDepth, 'detailed');
    assert.equal(profile.preferredFuels[0], 'Nomex');
    assert.equal(profile.preferredGravities[0], 'Lunar (0.166g)');
    assert.equal(profile.preferredCharts[0], 'scatter-plot');

    upsertApiEndpointProfile(
      {
        name: 'Lab FastAPI',
        baseUrl: `http://127.0.0.1:${port}`,
        apiKeyHeader: 'X-API-Key',
        apiKeyValue: 'sync-key',
      },
      true
    );

    const customRun: PsiRun = {
      ...REAL_SAMPLE_RUNS[0],
      id: 'custom-sync-1',
      psiId: 'CUS-999',
      isCustom: true,
    };

    const syncRes = await syncCorpusWithEndpoint({
      catalogRuns: [customRun, ...REAL_SAMPLE_RUNS.slice(0, 5)],
      investigations: [],
      literatureChunksCount: 120,
    });
    assert.equal(syncRes.status, 'synced');
    assert.ok(capturedPaths.includes('/health') && capturedPaths.includes('/sync-corpus'));
    assert.equal((capturedSyncBody as { researcher_id?: string } | null)?.researcher_id, 'RES-ALPHA');

    const ingestRes = await ingestRunsToActiveEndpoint({
      runs: [customRun],
      fileName: 'lab_batch.csv',
      unitConversionsApplied: ['kPa -> psi'],
    });
    assert.equal(ingestRes.syncedRemote, true);
    assert.equal((capturedIngestBody as { source_file?: string } | null)?.source_file, 'lab_batch.csv');

    const feedbackRes = await submitModelFeedback({
      kind: 'corrected',
      messageId: 'ast-1',
      question: 'Nomex lunar cabin flame spread',
      material: 'Nomex',
      O2_pct: 32.0,
      P_psi: 8.2,
      Flow_ms: 0.12,
      g_eff: 0.166,
      Thickness_mm: 2.0,
      predictedSpread_mms: 0.9,
      correctedSpread_mms: 0.32,
      correctedOutcome: 'Self-Extinguishing',
      correctionNote: 'Verified aramid weave self-extinguishes under 32% O2 at 2.0 mm.',
    });
    assert.equal(feedbackRes.remoteSynced, true);
    assert.equal(getVerifiedCorrections().length, 1);
    assert.equal(getVerifiedCorrections()[0].syncedRemote, true);
    assert.equal((capturedFeedbackBody as { feedback_type?: string } | null)?.feedback_type, 'correction');

    // Remote /api/analyze receives user_profile & verified_corrections automatically
    await runModelConsoleInference({
      question: 'Evaluate Nomex lunar cabin spread rate',
      mode: 'literature',
      request: {
        O2_pct: 32.0,
        P_psi: 8.2,
        Flow_ms: 0.12,
        g_eff: 0.166,
        Thickness_mm: 2.0,
        material: 'Nomex',
      },
      catalog: REAL_SAMPLE_RUNS,
    });
    const analyzePayload = capturedAnalyzeBody as {
      user_profile?: { researcherId?: string };
      verified_corrections?: unknown[];
    } | null;
    assert.equal(analyzePayload?.user_profile?.researcherId, 'RES-ALPHA');
    assert.ok(
      Array.isArray(analyzePayload?.verified_corrections) &&
        analyzePayload.verified_corrections.length >= 1
    );

    // Offline local fallback applies saved verified correction + detailed depth automatically
    setActiveEndpointProfileId(LOCAL_MODEL_ID);
    const offlineRecalled = await runModelConsoleInference({
      question: 'Evaluate Nomex lunar cabin spread rate',
      mode: 'literature',
      request: {
        O2_pct: 32.0,
        P_psi: 8.2,
        Flow_ms: 0.12,
        g_eff: 0.166,
        Thickness_mm: 2.0,
        material: 'Nomex',
      },
      catalog: REAL_SAMPLE_RUNS,
    });
    assert.equal(offlineRecalled.flameSpread_mms, 0.32);
    assert.equal(offlineRecalled.hazardStatus, 'Self-Extinguishing');
    assert.ok(
      offlineRecalled.assistantReply?.steps.some((s) =>
        s.includes('Verified Correction Applied')
      )
    );

    const chartCtx = generateChartDecodeInsight({
      datasetLabel: 'Full Archive',
      techniqueName: 'Scatter Plot',
      xAxisLabel: 'O2 %',
      yAxisLabel: 'Spread mm/s',
      colorByLabel: 'Safety Result',
      plottedRuns: REAL_SAMPLE_RUNS,
      simulation: offlineRecalled,
      summaryHeadline: 'Test insight',
    });
    assert.ok(chartCtx.anomalies.length >= 1);

    const comparatorSummary = await generateComparatorInsights(
      REAL_SAMPLE_RUNS.slice(0, 3)
    );
    assert.ok(comparatorSummary.highlights.length >= 2);

    const bundle = buildLearnedProfileBundle([customRun], null);
    assert.equal(bundle.researcherProfile.researcherId, 'RES-ALPHA');
    assert.equal(bundle.verifiedCorrections.length, 1);
    assert.equal(bundle.customImportedRuns.length, 1);
  } finally {
    if (origWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = origWindow;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('sign-in gate, deterministic IDs, guest isolation, account lifecycle, unified PDF/DOC export, unit conversion, and global search work cleanly', () => {
  const localMap = new Map<string, string>();
  const sessionMap = new Map<string, string>();
  const origWindow = (globalThis as { window?: unknown }).window;

  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => localMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        localMap.set(k, String(v));
      },
      removeItem: (k: string) => {
        localMap.delete(k);
      },
    },
    sessionStorage: {
      getItem: (k: string) => sessionMap.get(k) ?? null,
      setItem: (k: string, v: string) => {
        sessionMap.set(k, String(v));
      },
      removeItem: (k: string) => {
        sessionMap.delete(k);
      },
    },
  };

  try {
    // 1. Deterministic Researcher ID formatting & normalization
    const id1 = generateResearcherIdFromName('Achalesh Kooloth');
    const id2 = generateResearcherIdFromName('  achalesh   kooloth ');
    assert.equal(id1, id2);
    assert.match(id1, /^RES-AK-\d{4}$/);

    // 2. Named account sign-in & returning profile confirmation lookup
    const firstLogin = signInWithFullName('Achalesh Kooloth');
    assert.equal(firstLogin.isReturning, false);
    assert.equal(firstLogin.session.researcherId, id1);

    const updatedProfile = updateActiveUserProfileDetails(
      firstLogin.session,
      {
        fullName: 'Achalesh Kooloth',
        email: 'achalesh@lab.org',
        bio: 'Microgravity flammability researcher',
      },
      []
    );
    assert.equal(updatedProfile.workspace.email, 'achalesh@lab.org');

    signOutAccountSession();
    const returningLookup = findSavedAccountByFullName('Achalesh Kooloth');
    assert.ok(returningLookup !== null);
    assert.equal(returningLookup?.researcherId, id1);
    assert.equal(returningLookup?.email, 'achalesh@lab.org');

    const secondLogin = signInWithFullName('Achalesh Kooloth');
    assert.equal(secondLogin.isReturning, true);
    assert.equal(secondLogin.workspace.bio, 'Microgravity flammability researcher');

    // Clear chat history without touching account identity
    const cleared = clearChatHistoryForSession(secondLogin.session);
    assert.equal(cleared.threads.length, 1);
    assert.equal(cleared.threads[0].messages.length, 0);

    // 3. Guest session isolation & Delete Account check
    const guest = startGuestSession();
    assert.equal(guest.session.mode, 'guest');
    assert.equal(guest.session.researcherId, 'GUEST-SESSION');
    // Returning lookup for Achalesh remains intact even after starting guest session
    assert.ok(findSavedAccountByFullName('Achalesh Kooloth') !== null);

    // Delete named account permanently
    deleteNamedAccount(id1);
    assert.equal(findSavedAccountByFullName('Achalesh Kooloth'), null);

    // 4. Appearance presets & Measurement unit conversion verification
    assert.equal(THEME_PRESETS.length, 10);
    assert.equal(DEFAULT_APP_SETTINGS.units, 'spacecraft');
    assert.equal(formatPressure(14.7, 'spacecraft'), '14.7 psi');
    assert.equal(formatPressure(14.7, 'metric-si'), '101.4 kPa');
    assert.equal(formatTemperature(300, 'spacecraft'), '300 K');
    assert.equal(formatTemperature(300, 'metric-si'), '27 °C');
    assert.equal(formatFlameSpread(2.5, 'spacecraft'), '2.50 mm/s');
    assert.equal(formatFlameSpread(2.5, 'metric-si'), '0.250 cm/s');
    assert.equal(formatAirflow(0.15, 'spacecraft'), '0.15 m/s');
    assert.equal(formatAirflow(0.15, 'metric-si'), '15.0 cm/s');

    // 5. Pure client-side binary PDF & Word DOC generator verification
    const pdfBytes = generateClientPdfBytes({
      title: 'Virtual Test Lab Report',
      subtitle: 'PMMA Acrylic · Lunar Cabin',
      generatedAtIso: '2026-11-15T00:00:00Z',
      sections: [
        {
          heading: 'Chamber Conditions',
          keyValues: [
            { label: 'Oxygen', value: '34.0% O2' },
            { label: 'Flame Spread', value: '2.18 mm/s' },
          ],
          table: {
            headers: ['PSI ID', 'Material', 'Outcome'],
            rows: [['PSI-99', 'PMMA', 'Rapid Flame Spread']],
          },
        },
      ],
    });
    const pdfText = new TextDecoder().decode(pdfBytes);
    assert.ok(pdfText.startsWith('%PDF-1.4'));
    assert.ok(pdfText.includes('/Type /Page'));
    assert.ok(pdfText.includes('xref') && pdfText.includes('%%EOF'));
    assert.ok(pdfText.includes('Virtual Test Lab Report'));
    assert.ok(pdfText.includes('PSI-99 | PMMA | Rapid Flame Spread'));

    const docHtml = generateWordDocHtml({
      title: 'Comparison Report',
      generatedAtIso: '2026-11-15T00:00:00Z',
      sections: [{ heading: 'Summary', paragraphs: ['Verified spaceflight run match.'] }],
    });
    assert.ok(
      docHtml.includes('urn:schemas-microsoft-com:office:word') &&
        docHtml.includes('Comparison Report')
    );

    // 6. Unified Global Search across Investigations, Runs & ISS Guide
    const searchRes = performGlobalSearch({
      query: 'BASS',
      investigations: [
        {
          psiId: 'PSI-25',
          acronym: 'BASS-II',
          title: 'Burning and Suppression of Solids - II',
          facility: 'MSG',
          hardwareRaw: 'MSG / MWA',
          flightPlatform: 'ISS',
          managingCenter: 'Glenn Research Center',
          researchArea: 'Combustion',
          subResearchArea: 'Solid',
          doi: '',
          objective: 'Evaluate opposed and concurrent flame spread.',
          approach: '',
          hypothesis: '',
          principalInvestigators: [],
          affiliations: [],
          publications: [],
          spreadsheets: [],
          pdfs: [],
          auditStatus: 'Verified',
          runCount: 120,
          fuels: ['PMMA'],
          o2Range: [15, 21],
          pressureRange: [14.7, 14.7],
          flowRange: [0.05, 0.3],
          spreadRange: [0.5, 3.0],
          dominantOutcome: 'Self-Extinguishing',
          representativeRun: REAL_SAMPLE_RUNS[1],
          psiSourceUrl: '',
        },
      ],
      runs: [
        ...REAL_SAMPLE_RUNS,
        {
          ...REAL_SAMPLE_RUNS[0],
          id: 'run-bass-search-test',
          psiId: 'PSI-25',
          runCode: 'BASS-II-01',
          investigationTitle: 'Burning and Suppression of Solids - II',
        },
      ],
      guideTopics: [
        {
          id: 'guide-sec-bass',
          sectionNumber: '3.2',
          title: 'BASS Solid Flammability Screening',
          category: 'Solid Flammability',
          pageRange: '14-18',
          startPage: 14,
          summary: 'Microgravity flame spread thresholds measured on ISS.',
          keyTakeaways: ['Low-flow extinction boundary'],
          chunks: [],
          pdfUrl: '',
        },
      ],
    });
    assert.equal(searchRes.investigations.length, 1);
    assert.equal(searchRes.runs.length, 1);
    assert.equal(searchRes.guide.length, 1);
  } finally {
    if (origWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = origWindow;
    }
  }
});
