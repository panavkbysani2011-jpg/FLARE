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
