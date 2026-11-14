import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFlameSpreadVelocity,
  runLocalPhysicsSimulation,
} from './physicsEngine';
import {
  SAMPLE_COMBUSTION_CSV,
  SAMPLE_UNRELATED_CSV,
  validateAndNormalizeDataset,
} from './dataImporter';
import { BASELINE_PSI_RUNS } from '../data/baselineRuns';
import {
  VIZ_FAMILIES,
  VIZ_TECHNIQUE_REGISTRY,
  buildDatasetContext,
  evaluateAllTechniques,
  filterTechniques,
} from './vizRegistry';

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
  assert.equal(VIZ_TECHNIQUE_REGISTRY.length, 23);

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
  const ctx3 = buildDatasetContext('selected-sim', BASELINE_PSI_RUNS.slice(0, 3), BASELINE_PSI_RUNS, sim);
  const eval3 = evaluateAllTechniques(ctx3);
  const hist3 = eval3.find((e) => e.definition.id === 'histogram')!;
  const box3 = eval3.find((e) => e.definition.id === 'box-quartile')!;
  const map3 = eval3.find((e) => e.definition.id === 'safety-map')!;
  assert.equal(hist3.compatibility.status, 'unavailable');
  assert.ok(hist3.compatibility.reason.includes('Unavailable: Needs at least 4 numeric samples'));
  assert.equal(box3.compatibility.status, 'unavailable');
  assert.equal(map3.compatibility.status, 'recommended');

  // 2) Full archive (19 runs): histogram/box/correlation unlock as recommended
  const ctxFull = buildDatasetContext('full-archive', BASELINE_PSI_RUNS.slice(0, 3), BASELINE_PSI_RUNS, sim);
  const evalFull = evaluateAllTechniques(ctxFull);
  const histFull = evalFull.find((e) => e.definition.id === 'histogram')!;
  const boxFull = evalFull.find((e) => e.definition.id === 'box-quartile')!;
  const corrFull = evalFull.find((e) => e.definition.id === 'correlation-matrix')!;
  assert.equal(histFull.compatibility.status, 'recommended');
  assert.equal(boxFull.compatibility.status, 'recommended');
  assert.equal(corrFull.compatibility.status, 'recommended');

  // 3) Single focus (1 run): multi-run axis comparisons become unavailable
  const ctx1 = buildDatasetContext('single-focus', BASELINE_PSI_RUNS.slice(0, 1), BASELINE_PSI_RUNS, sim);
  const eval1 = evaluateAllTechniques(ctx1);
  const parallel1 = eval1.find((e) => e.definition.id === 'multi-variable')!;
  assert.equal(parallel1.compatibility.status, 'unavailable');
  assert.ok(parallel1.compatibility.reason.includes('Select 2 or more runs'));

  // 4) Static archive scope (no sequential time-series): timeline techniques become unavailable
  const ctxStatic = buildDatasetContext('static-runs', BASELINE_PSI_RUNS.slice(0, 3), BASELINE_PSI_RUNS, sim);
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
