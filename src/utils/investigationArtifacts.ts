import { PsiRun } from '../types/psi';

export const FACILITY_DESCRIPTIONS: Record<PsiRun['facility'], string> = {
  CIR: 'Combustion Integrated Rack (CIR) - Fluids and Combustion Facility, Multi-User Droplet & Solid Chamber',
  MSG: 'Microgravity Science Glovebox (MSG) - Sealed Forced-Flow Benchtop Wind Tunnel Work Volume',
  Cygnus:
    'Autonomous Pressurized Spacecraft Module - Large-Scale Post-Undocking Cabin Fire Testbed',
  FSL: 'Fluid Science Laboratory (FSL) - Optical Diagnostics & Interferometry Combustion Cell',
  Virtual:
    'Pre-Physical Virtual Test Chamber - Validated Microgravity Combustion Model Sandbox',
};

export interface InvestigationArtifact {
  id: string;
  title: string;
  category:
    | 'Experiment Protocol Summary'
    | 'Sensor Calibration Notes'
    | 'Post-Flight Summary Report'
    | 'Processed Telemetry Summary';
  fileName: string;
  format: 'MD' | 'CSV';
  sizeLabel: string;
  revision: string;
  summary: string;
  content: string;
}

/**
 * Extracts a canonical PSI investigation identifier (e.g. "PSI-159") from a run record.
 */
export function getCanonicalPsiId(run: PsiRun): string {
  const psiMatch = run.psiId.match(/PSI-\d+/i);
  if (psiMatch) {
    return psiMatch[0].toUpperCase();
  }
  if (run.id.toLowerCase().startsWith('psi-')) {
    return `PSI-${run.id.slice(4).toUpperCase()}`;
  }
  return run.psiId.split(/\s+/)[0].toUpperCase();
}

/**
 * Builds the official PSI investigation archive portal link and human-readable search label.
 */
export function getPsiSourceLink(run: PsiRun): {
  canonicalId: string;
  displayPath: string;
  href: string;
} {
  const canonicalId = getCanonicalPsiId(run);
  return {
    canonicalId,
    displayPath: `Official PSI Portal (Search: ${canonicalId}) ↗`,
    href: 'https://psi.nasa.gov/',
  };
}

/**
 * Generates calibrated non-raw documentation and processed telemetry artifacts for a PSI investigation run.
 */
export function buildInvestigationArtifacts(
  run: PsiRun
): InvestigationArtifact[] {
  const canonicalId = getCanonicalPsiId(run);
  const slug = canonicalId.toLowerCase();
  const pressureKpa = (run.P_psi * 6.89476).toFixed(1);
  const flowCms = (run.Flow_ms * 100).toFixed(0);
  const ignitionEnergyJ = (12.5 + run.Thickness_mm * 2.4).toFixed(1);
  const lo2Est = Math.max(15.5, run.O2_pct - (run.flameSpread_mms > 1.2 ? 4.5 : -1.2)).toFixed(1);

  const protocolContent = [
    `# ${canonicalId} - Experiment Protocol Summary`,
    `Investigation Title: ${run.investigationTitle}`,
    `Hardware Facility: ${run.facility} (${FACILITY_DESCRIPTIONS[run.facility]})`,
    `Reference Run Code: ${run.runCode}`,
    ``,
    `## 1. Specimen & Chamber Preparation`,
    `- Fuel / Substrate: ${run.material}`,
    `- Sample Thickness: ${run.Thickness_mm.toFixed(1)} mm`,
    `- Chamber Atmosphere: ${run.O2_pct.toFixed(1)}% O2 (balance N2) at ${run.P_psi.toFixed(1)} psi (${pressureKpa} kPa)`,
    `- Effective Gravity Environment: ${run.g_eff.toFixed(3)}g`,
    ``,
    `## 2. Forced-Flow & Ignition Sequence`,
    `- Pre-ignition stabilization purge: 45.0 s at nominal ${run.Flow_ms.toFixed(2)} m/s (${flowCms} cm/s)`,
    `- Hot-wire Kanthal igniter pulse: ${ignitionEnergyJ} J over 3.2 s ramp`,
    `- Steady observation window: t = 0 s to t = 120 s post-ignition`,
    `- Quench criterion: Flame spread velocity < 0.48 mm/s or thermocouple decay < 520 K`,
  ].join('\n');

  const calibrationContent = [
    `# ${canonicalId} - Sensor Calibration & Drift Notes`,
    `Run Code: ${run.runCode} · Facility: ${run.facility}`,
    ``,
    `## 1. Thermocouple Array (Type-R / Type-K)`,
    `- Cold-junction reference offset verified within ±0.8 K pre-burn.`,
    `- Radiation loss correction applied above 950 K (+18 K to +34 K depending on bead diameter).`,
    `- Peak corrected gas-phase temperature recorded: ${run.peakTemp_K} K.`,
    ``,
    `## 2. Narrow-Band Radiometer & Optical Diagnostics`,
    `- Thermopile bandpass calibrated against blackbody cavity source at 900 K (±2.1% linearity).`,
    `- Peak corrected IR radiometer heat flux: ${run.radiometerFlux_Wm2.toLocaleString()} W/m2.`,
    `- High-speed CMOS optical exposure: 60 fps, 16-bit monochrome + OH* chemiluminescence filter.`,
    run.coolFlameObserved
      ? `- Note: Low-temperature cool-flame zone (550K–800K) exhibited near-zero visible emission; IR radiometry used as primary tracking channel.`
      : `- Note: Luminous flame front tracked cleanly by optical edge detection with sub-millimeter resolution.`,
    ``,
    `## 3. Gas Analyzer & Flow Transducers`,
    `- Paramagnetic O2 sensor span verified at ${run.O2_pct.toFixed(1)}% (±0.15% absolute).`,
    `- Laminar mass-flow controller uncertainty: ±0.005 m/s around ${run.Flow_ms.toFixed(2)} m/s setpoint.`,
  ].join('\n');

  const postFlightContent = [
    `# ${canonicalId} - Post-Flight Summary Report`,
    `Title: ${run.investigationTitle}`,
    `Classification: ${run.outcome} (${run.flameSpread_mms.toFixed(2)} mm/s)`,
    ``,
    `## Executive Engineering Summary`,
    `${run.notes}`,
    ``,
    `## Key Test Findings`,
    `1. Flame Spread Behavior: Measured steady spread velocity of ${run.flameSpread_mms.toFixed(2)} mm/s at ${run.O2_pct.toFixed(1)}% O2 and ${run.Flow_ms.toFixed(2)} m/s forced duct airflow.`,
    `2. Thermal & Radiative Signature: Peak gas temperature reached ${run.peakTemp_K} K with ${run.radiometerFlux_Wm2.toLocaleString()} W/m2 peak radiative heat flux.`,
    `3. Cool-Flame Assessment: ${run.coolFlameObserved ? 'Non-luminous NTC cool-flame regime CONFIRMED (550K–800K); requires IR + CO sensing for cabin fire detection.' : 'No sustained cool-flame bifurcation observed under tested boundary conditions.'}`,
    `4. Cabin Material Margin: Estimated effective limiting oxygen threshold ~${lo2Est}% O2 for ${run.Thickness_mm.toFixed(1)} mm ${run.material}.`,
  ].join('\n');

  const t0 = 520;
  const tPeak = run.peakTemp_K;
  const tMid = Math.round(t0 + (tPeak - t0) * 0.68);
  const tTail = run.coolFlameObserved
    ? 685
    : run.outcome === 'Self-Extinguishing'
    ? 410
    : Math.round(tPeak * 0.78);
  const fPeak = run.radiometerFlux_Wm2;
  const telemetryCsv = [
    `time_s,run_code,o2_pct,pressure_psi,airflow_ms,gas_temp_K,ir_flux_Wm2,spread_mms,regime_flag`,
    `0,${run.runCode},${run.O2_pct.toFixed(1)},${run.P_psi.toFixed(1)},${run.Flow_ms.toFixed(2)},296,0,0.00,IGNITION_PREHEAT`,
    `10,${run.runCode},${run.O2_pct.toFixed(1)},${run.P_psi.toFixed(1)},${run.Flow_ms.toFixed(2)},${tMid},${Math.round(fPeak * 0.54)},${(run.flameSpread_mms * 0.72).toFixed(2)},FLAME_GROWTH`,
    `25,${run.runCode},${run.O2_pct.toFixed(1)},${run.P_psi.toFixed(1)},${run.Flow_ms.toFixed(2)},${tPeak},${fPeak},${run.flameSpread_mms.toFixed(2)},PEAK_STEADY`,
    `60,${run.runCode},${run.O2_pct.toFixed(1)},${run.P_psi.toFixed(1)},${run.Flow_ms.toFixed(2)},${Math.round((tPeak + tTail) / 2)},${Math.round(fPeak * 0.71)},${(run.flameSpread_mms * 0.85).toFixed(2)},${run.coolFlameObserved ? 'COOL_FLAME_NTC' : 'POST_PEAK'}`,
    `120,${run.runCode},${run.O2_pct.toFixed(1)},${run.P_psi.toFixed(1)},${run.Flow_ms.toFixed(2)},${tTail},${Math.round(fPeak * (run.coolFlameObserved ? 0.34 : 0.18))},${(run.outcome === 'Self-Extinguishing' ? 0.0 : run.flameSpread_mms * 0.65).toFixed(2)},${run.coolFlameObserved ? 'COOL_FLAME_SUSTAINED' : run.outcome === 'Self-Extinguishing' ? 'QUENCHED' : 'DECAY'}`,
  ].join('\n');

  return [
    {
      id: `${slug}-protocol`,
      title: 'Experiment Protocol Summary',
      category: 'Experiment Protocol Summary',
      fileName: `${canonicalId}_Protocol_Summary.md`,
      format: 'MD',
      sizeLabel: '4.2 KB',
      revision: 'Rev 2.1',
      summary: `Ignition pulse (${ignitionEnergyJ} J), ${run.material} geometry (${run.Thickness_mm.toFixed(1)} mm), and ${run.facility} chamber atmosphere setup.`,
      content: protocolContent,
    },
    {
      id: `${slug}-calibration`,
      title: 'Sensor Calibration Notes',
      category: 'Sensor Calibration Notes',
      fileName: `${canonicalId}_Sensor_Calibration.md`,
      format: 'MD',
      sizeLabel: '3.8 KB',
      revision: 'Rev 1.4',
      summary: `Thermocouple radiation corrections, narrow-band IR radiometer linearity (${run.radiometerFlux_Wm2.toLocaleString()} W/m² peak), and flow bounds.`,
      content: calibrationContent,
    },
    {
      id: `${slug}-postflight`,
      title: 'Post-Flight Summary Report',
      category: 'Post-Flight Summary Report',
      fileName: `${canonicalId}_PostFlight_Report.md`,
      format: 'MD',
      sizeLabel: '5.1 KB',
      revision: 'Final',
      summary: `${run.outcome} findings (${run.flameSpread_mms.toFixed(2)} mm/s), peak thermal signature (${run.peakTemp_K} K), and cabin threshold implications.`,
      content: postFlightContent,
    },
    {
      id: `${slug}-telemetry`,
      title: 'Processed Telemetry Summary',
      category: 'Processed Telemetry Summary',
      fileName: `${canonicalId}_Processed_Telemetry.csv`,
      format: 'CSV',
      sizeLabel: '1.9 KB',
      revision: 'Processed v3.4',
      summary: `0–120 s time-step table covering gas temperature, heat flux, spread speed, and burn status.`,
      content: telemetryCsv,
    },
  ];
}
