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
  analyzeCombustionState,
  getApiEndpointConfig,
  runModelConsoleInference,
  saveApiEndpointConfig,
  testApiEndpointHealth,
} from '../services/psiApi';
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
  assert.ok(res.reason?.includes('Domain Gatekeeper Rejected'));
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
