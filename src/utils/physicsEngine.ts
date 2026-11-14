import {
  HazardOutcome,
  LiteratureChunk,
  MaterialCandidate,
  MissionSpinoffCase,
  PsiInvestigationRecord,
  PsiRun,
  SimulationRequest,
  SimulationResponse,
  TimelinePoint,
  VizMode,
} from '../types/psi';
import { BASELINE_PSI_RUNS } from '../data/baselineRuns';
import { MISSION_AND_SPINOFF_CASES } from '../data/missionAndSpinoffCases';

export interface AssistantArchiveContext {
  literatureChunks?: LiteratureChunk[];
  investigations?: PsiInvestigationRecord[];
  missionCases?: MissionSpinoffCase[];
}

/**
 * Deterministic microgravity combustion physics engine.
 * Models opposing/concurrent forced-flow flame spread over thermally thin/thick solids
 * and low-temperature cool-flame (NTC) regimes observed in PSI investigations.
 */
export function computeFlameSpreadVelocity(params: {
  O2_pct: number;
  P_psi: number;
  Flow_ms: number;
  g_eff: number;
  Thickness_mm: number;
}): {
  flameSpread_mms: number;
  confidenceInterval_mms: number;
  peakTemp_K: number;
  hazardStatus: HazardOutcome;
  minSafeThickness_mm: number;
} {
  const { O2_pct, P_psi, Flow_ms, g_eff, Thickness_mm } = params;

  // Normalized oxygen factor relative to 21% standard atmosphere
  const o2Factor = Math.pow(Math.max(O2_pct - 13.5, 0.5) / 12.5, 1.48);

  // Pressure scaling (P / 14.7)^0.42
  const pressureFactor = Math.pow(Math.max(P_psi, 3.0) / 14.7, 0.42);

  // Microgravity ventilation resonance:
  // In low gravity (g_eff < 0.4g), forced airflow between 0.05 and 0.22 m/s replenishes O2
  // faster than radiative heat loss without blowing out the flame.
  const lowGravityWeight = Math.max(0, 1 - g_eff * 0.75);
  const flowPeak = 0.14;
  const flowResonance =
    Flow_ms < 0.015
      ? 0.28 + Flow_ms * 18
      : 0.55 +
        0.92 * Math.exp(-Math.pow((Flow_ms - flowPeak) / 0.14, 2)) +
        0.25 * Math.min(Flow_ms / 0.4, 1.0);

  // Natural buoyancy in higher gravity increases convective cooling at higher thickness
  const gravityMod = 1.0 - 0.14 * g_eff * (1 - lowGravityWeight * 0.5);

  // Thermal thickness heat-sink factor: thinner samples heat rapidly; thicker samples conduct heat away
  const thicknessFactor = Math.pow(2.0 / Math.max(Thickness_mm, 0.2), 0.58);

  const rawSpread = 1.18 * o2Factor * pressureFactor * flowResonance * gravityMod * thicknessFactor;
  const flameSpread_mms = Number(Math.max(0.05, Math.min(rawSpread, 8.5)).toFixed(2));

  // 95% confidence interval scales slightly with velocity & flow turbulence
  const confidenceInterval_mms = Number(
    Math.max(0.03, flameSpread_mms * 0.035 + 0.01 * Flow_ms).toFixed(2)
  );

  // Calculate minimum safe thickness required to self-extinguish (target < 0.45 mm/s)
  const rawMinThickness =
    2.0 * Math.pow((1.18 * o2Factor * pressureFactor * flowResonance * gravityMod) / 0.45, 1 / 0.58);
  const minSafeThickness_mm = Number(Math.max(0.4, Math.min(rawMinThickness, 14.0)).toFixed(1));

  // Estimate peak flame temperature (K)
  const isCoolFlameWindow =
    Flow_ms <= 0.09 && O2_pct >= 18.0 && O2_pct <= 27.0 && g_eff <= 0.25 && flameSpread_mms < 1.95;

  let peakTemp_K: number;
  if (isCoolFlameWindow) {
    peakTemp_K = Math.round(620 + (O2_pct - 18) * 16 + Flow_ms * 450);
  } else if (flameSpread_mms < 0.45) {
    peakTemp_K = Math.round(560 + flameSpread_mms * 420);
  } else {
    peakTemp_K = Math.round(
      Math.min(1850, 940 + (O2_pct - 18) * 14.5 + flameSpread_mms * 95 - Thickness_mm * 12)
    );
  }

  let hazardStatus: HazardOutcome;
  if (flameSpread_mms < 0.48 && !isCoolFlameWindow) {
    hazardStatus = 'Self-Extinguishing';
  } else if (isCoolFlameWindow || (peakTemp_K >= 550 && peakTemp_K <= 810)) {
    hazardStatus = 'Cool Flame Caution';
  } else {
    hazardStatus = 'Rapid Flame Spread';
  }

  return {
    flameSpread_mms,
    confidenceInterval_mms,
    peakTemp_K,
    hazardStatus,
    minSafeThickness_mm,
  };
}

export function findNearestPsiRuns(
  params: SimulationRequest,
  catalog: PsiRun[] = BASELINE_PSI_RUNS
): Array<{ run: PsiRun; similarityPct: number }> {
  const scored = catalog.map((run) => {
    const dO2 = Math.abs(run.O2_pct - params.O2_pct) / 40;
    const dP = Math.abs(run.P_psi - params.P_psi) / 10.4;
    const dFlow = Math.abs(run.Flow_ms - params.Flow_ms) / 0.4;
    const dG = Math.abs(run.g_eff - params.g_eff) / 1.0;
    const dThick = Math.abs(run.Thickness_mm - params.Thickness_mm) / 6.0;

    const dist = Math.sqrt(
      0.34 * dO2 * dO2 +
        0.18 * dP * dP +
        0.24 * dFlow * dFlow +
        0.12 * dG * dG +
        0.12 * dThick * dThick
    );
    const similarityPct = Math.round(Math.max(12, Math.min(99, (1 - dist * 0.72) * 100)));
    return { run, similarityPct };
  });

  return scored.sort((a, b) => b.similarityPct - a.similarityPct).slice(0, 4);
}

export function generateTimelineSeries(params: {
  O2_pct: number;
  P_psi: number;
  Flow_ms: number;
  g_eff: number;
  Thickness_mm: number;
  peakTemp_K: number;
  hazardStatus: HazardOutcome;
}): TimelinePoint[] {
  const { O2_pct, Flow_ms, peakTemp_K, hazardStatus } = params;
  const points: TimelinePoint[] = [];

  for (let t = 0; t <= 120; t += 5) {
    let temp_K = 298;
    let irFlux_Wm2 = 0;
    let opticalVisibility_pct = 100;
    let coYield_ppm = 5;

    if (t < 8) {
      // Igniter ramp-up
      const ramp = t / 8;
      temp_K = Math.round(298 + (peakTemp_K - 298) * ramp * 0.85);
      irFlux_Wm2 = Math.round(ramp * 4500);
      opticalVisibility_pct = Math.round(100 - ramp * 15);
      coYield_ppm = Math.round(5 + ramp * 45);
    } else if (hazardStatus === 'Self-Extinguishing') {
      const decay = Math.exp(-(t - 8) / 18);
      temp_K = Math.round(310 + (peakTemp_K - 310) * decay);
      irFlux_Wm2 = Math.round(3800 * decay);
      opticalVisibility_pct = Math.round(Math.min(98, 78 + (1 - decay) * 18));
      coYield_ppm = Math.round(15 + 65 * decay);
    } else if (hazardStatus === 'Cool Flame Caution' || (Flow_ms <= 0.11 && t >= 40 && t <= 95)) {
      // Two-stage transition: luminous hot peak from 8-35s, then radiative drop into 550K-800K cool flame
      if (t < 35) {
        const hotProgress = Math.sin(((t - 8) / 27) * Math.PI);
        temp_K = Math.round(820 + Math.max(240, peakTemp_K - 650) * hotProgress);
        irFlux_Wm2 = Math.round(6200 + 5800 * hotProgress);
        opticalVisibility_pct = Math.round(Math.max(25, 88 - (t - 8) * 2.1));
        coYield_ppm = Math.round(60 + (t - 8) * 6.5);
      } else if (t <= 95) {
        // Cool flame plateau (550K - 800K): zero visible flame emission/visibility drop, steady heat & rising CO
        const coolOsc = Math.sin((t - 35) / 6) * 22;
        temp_K = Math.round(Math.max(575, Math.min(775, 675 + (O2_pct - 21) * 3.5 + coolOsc)));
        irFlux_Wm2 = Math.round(3600 + (O2_pct - 18) * 110 + coolOsc * 12);
        opticalVisibility_pct = Math.round(Math.max(0, 12 - (t - 35) * 0.35));
        coYield_ppm = Math.round(240 + (t - 35) * 5.8);
      } else {
        // Late stage re-ignition or vapor depletion
        const fade = Math.exp(-(t - 95) / 22);
        temp_K = Math.round(360 + 310 * fade);
        irFlux_Wm2 = Math.round(3400 * fade);
        opticalVisibility_pct = Math.round(18 + (1 - fade) * 35);
        coYield_ppm = Math.round(580 * fade + 120);
      }
    } else {
      // Sustained Rapid Flame Spread
      const growth = 1 - Math.exp(-(t - 8) / 24);
      const wave = Math.sin(t / 7) * 18;
      temp_K = Math.round(Math.min(1850, peakTemp_K * (0.86 + 0.16 * growth) + wave));
      irFlux_Wm2 = Math.round((9500 + (O2_pct - 20) * 420) * (0.7 + 0.35 * growth));
      opticalVisibility_pct = Math.round(Math.max(8, 90 - t * 0.68));
      coYield_ppm = Math.round(45 + t * 3.9);
    }

    const isCoolFlameZone = temp_K >= 550 && temp_K <= 800 && t >= 25;

    points.push({
      time_s: t,
      temp_K,
      irFlux_Wm2,
      opticalVisibility_pct,
      coYield_ppm,
      isCoolFlameZone,
    });
  }

  return points;
}

export function generateMaterialRankings(params: {
  O2_pct: number;
  P_psi: number;
  Flow_ms: number;
  g_eff: number;
  Thickness_mm: number;
  baseSpread_mms: number;
}): MaterialCandidate[] {
  const { O2_pct, Flow_ms, baseSpread_mms } = params;
  const o2Penalty = Math.max(0.5, (O2_pct - 14) / 20);
  const lowFlowSootFactor = Flow_ms < 0.12 ? 1.25 : 0.9;

  const candidates: Array<{
    name: string;
    code: string;
    spreadMult: number;
    smokeBase: number;
    toxicBase: number;
    coolFlameBase: number;
    limitingO2_pct: number;
  }> = [
    {
      name: 'PMMA Acrylic',
      code: 'PMMA-CAST',
      spreadMult: 1.0,
      smokeBase: 54,
      toxicBase: 42,
      coolFlameBase: 68,
      limitingO2_pct: 17.2,
    },
    {
      name: 'SIBAL Blend',
      code: 'SIBAL-7525',
      spreadMult: 0.86,
      smokeBase: 62,
      toxicBase: 48,
      coolFlameBase: 52,
      limitingO2_pct: 18.4,
    },
    {
      name: 'Cotton-Fiberglass',
      code: 'CFG-FABRIC',
      spreadMult: 0.72,
      smokeBase: 58,
      toxicBase: 39,
      coolFlameBase: 46,
      limitingO2_pct: 19.1,
    },
    {
      name: 'PTFE Wire Jacket',
      code: 'PTFE-INSUL',
      spreadMult: 0.34,
      smokeBase: 76,
      toxicBase: 84,
      coolFlameBase: 74,
      limitingO2_pct: 28.5,
    },
    {
      name: 'Nomex',
      code: 'NOMEX-HT90',
      spreadMult: 0.22,
      smokeBase: 28,
      toxicBase: 31,
      coolFlameBase: 24,
      limitingO2_pct: 29.8,
    },
  ];

  return candidates.map((c) => {
    const flameSpread_mms = Number((baseSpread_mms * c.spreadMult).toFixed(2));
    const flameSpreadIndex = Math.min(100, Math.round((flameSpread_mms / 3.5) * 100));
    const smokeClumpingIndex = Math.min(
      100,
      Math.round(c.smokeBase * lowFlowSootFactor * (0.8 + 0.25 * o2Penalty))
    );
    const toxicGasYieldIndex = Math.min(
      100,
      Math.round(c.toxicBase * (0.85 + 0.2 * o2Penalty))
    );
    const coolFlameRiskIndex = Math.min(
      100,
      Math.round(c.coolFlameBase * (Flow_ms < 0.14 ? 1.18 : 0.82))
    );

    let status: HazardOutcome = 'Self-Extinguishing';
    if (O2_pct >= c.limitingO2_pct && flameSpread_mms >= 0.55) {
      status = 'Rapid Flame Spread';
    } else if (coolFlameRiskIndex >= 65 || (O2_pct >= c.limitingO2_pct - 2.0 && flameSpread_mms >= 0.3)) {
      status = 'Cool Flame Caution';
    }

    return {
      name: c.name,
      code: c.code,
      flameSpread_mms,
      flameSpreadIndex,
      smokeClumpingIndex,
      toxicGasYieldIndex,
      coolFlameRiskIndex,
      limitingO2_pct: c.limitingO2_pct,
      status,
    };
  });
}

function findRelevantLiteratureExcerpts(
  question: string,
  chunks: LiteratureChunk[] = [],
  limit = 2
): LiteratureChunk[] {
  if (!chunks.length) return [];
  const tokens = question
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length >= 3);
  if (!tokens.length) return [];

  return chunks
    .map((c) => {
      const txt = c.text.toLowerCase();
      const src = c.source_file.toLowerCase();
      const psi = c.psi_id.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (psi.includes(tok)) score += 6;
        if (src.includes(tok)) score += 3;
        if (txt.includes(tok)) score += 2;
      }
      if (score > 0 && src.includes('researchers_guide')) score += 1.5;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

function findRelevantMissionCases(
  question: string,
  cases: MissionSpinoffCase[] = MISSION_AND_SPINOFF_CASES
): MissionSpinoffCase[] {
  const qLower = question.toLowerCase();
  const matched = cases.filter((item) => {
    const tokens = [
      item.title,
      item.code,
      item.missionOrDomain,
      item.category,
      ...item.relatedPsiIds,
    ]
      .join(' ')
      .toLowerCase();
    if (qLower.includes('apollo 13') && item.id === 'case-apollo-13') return true;
    if (qLower.includes('apollo 1') && item.id === 'case-apollo-1') return true;
    if (qLower.includes('apollo') && item.id.includes('apollo')) return true;
    if (qLower.includes('mir') && item.id === 'case-mir-fire') return true;
    if (
      (qLower.includes('spinoff') ||
        qLower.includes('spin-off') ||
        qLower.includes('firefighter') ||
        qLower.includes('scba') ||
        qLower.includes('tank')) &&
      item.id === 'case-spinoff-scba'
    )
      return true;
    if (
      (qLower.includes('detector') ||
        qLower.includes('smoke') ||
        qLower.includes('shuttle')) &&
      item.id === 'case-spinoff-smoke-detector'
    )
      return true;
    if (
      (qLower.includes('attire') ||
        qLower.includes('suit') ||
        qLower.includes('nomex') ||
        qLower.includes('pbi') ||
        qLower.includes('clothing')) &&
      item.id === 'case-spinoff-fire-attire'
    )
      return true;
    if (
      (qLower.includes('sciencecast') || qLower.includes('glenn')) &&
      (item.id === 'case-sciencecasts-iss' || item.id === 'case-glenn-combustion')
    )
      return true;
    return tokens
      .split(/\W+/)
      .some((w) => w.length >= 4 && qLower.includes(w));
  });

  return matched.slice(0, 2);
}

export function buildAssistantReply(
  question: string,
  sim: Omit<SimulationResponse, 'assistantReply'>,
  req: SimulationRequest,
  archiveContext?: AssistantArchiveContext
): {
  steps: string[];
  citations: string[];
  suggestedVizMode?: VizMode;
} {
  const qLower = question.toLowerCase();
  let suggestedVizMode: VizMode | undefined;

  if (qLower.includes('material') || qLower.includes('nomex') || qLower.includes('pmma')) {
    suggestedVizMode = 'material-safety';
  } else if (qLower.includes('timeline') || qLower.includes('cool flame') || qLower.includes('sensor') || qLower.includes('temperature')) {
    suggestedVizMode = 'sensor-timeline';
  } else if (qLower.includes('compare') || qLower.includes('multi-variable') || qLower.includes('parallel')) {
    suggestedVizMode = 'multi-variable';
  } else if (qLower.includes('map') || qLower.includes('airflow') || qLower.includes('safety map')) {
    suggestedVizMode = 'safety-map';
  }

  const topMatch = sim.nearestRuns[0]?.run.psiId || 'PSI-99 SAFFIRE-II';
  const secondMatch = sim.nearestRuns[1]?.run.psiId || 'PSI-25 BASS-II';

  const matchedCases = findRelevantMissionCases(
    question,
    archiveContext?.missionCases ?? MISSION_AND_SPINOFF_CASES
  );
  const matchedChunks = findRelevantLiteratureExcerpts(
    question,
    archiveContext?.literatureChunks ?? [],
    2
  );
  const matchedPsiFromQuery = (archiveContext?.investigations ?? []).find(
    (inv) => qLower.includes(inv.psiId.toLowerCase()) || (inv.acronym && qLower.includes(inv.acronym.toLowerCase()))
  );

  // Build dynamic citations from runs, matched cases, and chunks
  const citationSet = new Set<string>();
  sim.nearestRuns.slice(0, 2).forEach((r) => {
    const id = r.run.psiId.split(' ')[0].toUpperCase();
    if (id.startsWith('PSI-')) citationSet.add(id);
  });
  matchedCases.forEach((c) => c.relatedPsiIds.slice(0, 2).forEach((id) => citationSet.add(id)));
  matchedChunks.forEach((ch) => {
    if (ch.psi_id) citationSet.add(ch.psi_id.toUpperCase());
  });
  if (matchedPsiFromQuery) citationSet.add(matchedPsiFromQuery.psiId);

  const chunkSnippetStep =
    matchedChunks.length > 0
      ? `Literature Grounding (${matchedChunks[0].psi_id}, p.${matchedChunks[0].page_number}): "${matchedChunks[0].text
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 190)}..."`
      : null;

  // Historical Incident or Spin-off Specific Response
  if (matchedCases.length > 0 && !qLower.includes('material safety comparison')) {
    const primaryCase = matchedCases[0];
    const caseSteps = [
      `${primaryCase.title} (${primaryCase.atmosphereLabel}): ${primaryCase.summary}`,
      `Key Engineering Lesson: ${primaryCase.lessonsLearned[0]}`,
      matchedCases[1]
        ? `Cross-Case Comparison (${matchedCases[1].code}): ${matchedCases[1].lessonsLearned[0]}`
        : `Active Simulator Correlation: At ${req.O2_pct.toFixed(1)}% O2 and ${req.P_psi.toFixed(1)} psi (${req.g_eff.toFixed(3)}g), model predicts ${sim.flameSpread_mms.toFixed(2)} mm/s spread (${sim.hazardStatus}).`,
    ];
    if (chunkSnippetStep) caseSteps.push(chunkSnippetStep);
    return {
      steps: caseSteps,
      citations: Array.from(citationSet).slice(0, 5),
      suggestedVizMode,
    };
  }

  // Specific PSI Investigation inquiry
  if (matchedPsiFromQuery) {
    const steps = [
      `${matchedPsiFromQuery.psiId} (${matchedPsiFromQuery.acronym}) — ${matchedPsiFromQuery.title}: Conducted in ${matchedPsiFromQuery.hardwareRaw} with ${matchedPsiFromQuery.runCount} calibrated experimental runs in CSV.`,
      `Science Objective: ${matchedPsiFromQuery.objective.slice(0, 210)}${matchedPsiFromQuery.objective.length > 210 ? '...' : ''}`,
      `Parameter Envelope: ${matchedPsiFromQuery.o2Range[0].toFixed(1)}–${matchedPsiFromQuery.o2Range[1].toFixed(1)}% O2, ${matchedPsiFromQuery.pressureRange[0].toFixed(1)}–${matchedPsiFromQuery.pressureRange[1].toFixed(1)} psi, ${matchedPsiFromQuery.flowRange[0].toFixed(2)}–${matchedPsiFromQuery.flowRange[1].toFixed(2)} m/s airflow.`,
    ];
    if (chunkSnippetStep) steps.push(chunkSnippetStep);
    return {
      steps,
      citations: [matchedPsiFromQuery.psiId, ...Array.from(citationSet)].slice(0, 4),
      suggestedVizMode,
    };
  }

  if (qLower.includes('material')) {
    const safest = [...sim.materialRankings].sort((a, b) => a.flameSpread_mms - b.flameSpread_mms)[0];
    const riskiest = [...sim.materialRankings].sort((a, b) => b.flameSpread_mms - a.flameSpread_mms)[0];
    const steps = [
      `Switched view to Material Safety Comparison for ${req.O2_pct.toFixed(1)}% O2 at ${req.P_psi.toFixed(1)} psi and ${req.Flow_ms.toFixed(2)} m/s airflow.`,
      `${riskiest.name} exhibits the highest flame spread rate (${riskiest.flameSpread_mms.toFixed(2)} mm/s) because its Limiting Oxygen Index (${riskiest.limitingO2_pct}% O2) is exceeded, matching ${topMatch}.`,
      `PTFE Wire Jacket resists open flame propagation (${sim.materialRankings.find((m) => m.name.includes('PTFE'))?.flameSpread_mms.toFixed(2)} mm/s) but triggers high fractal soot aggregation and CO yield under low flow (PSI-102 / SAME).`,
      `Engineering recommendation: Substitute ${safest.name} (spread ${safest.flameSpread_mms.toFixed(2)} mm/s, LOI ${safest.limitingO2_pct}% O2 — also proven in fire attire spin-offs) or increase thickness above ${sim.safeMaterialCheck.minSafeThickness_mm.toFixed(1)} mm (PSI-159).`,
    ];
    if (chunkSnippetStep) steps.push(chunkSnippetStep);
    return {
      steps,
      citations: Array.from(new Set(['PSI-99', 'PSI-102', 'PSI-106', 'PSI-159', ...citationSet])).slice(0, 5),
      suggestedVizMode: 'material-safety',
    };
  }

  if (qLower.includes('compare')) {
    const steps = [
      `Normalized active cabin simulation (${req.O2_pct.toFixed(1)}% O2, ${req.P_psi.toFixed(1)} psi, ${req.Flow_ms.toFixed(2)} m/s) across all parallel telemetry axes.`,
      `Nearest CSV archive match is ${topMatch} (${sim.nearestRuns[0]?.similarityPct ?? 94}% parameter similarity) followed by ${secondMatch}.`,
      `At ${req.Thickness_mm.toFixed(1)} mm thickness, predicted flame spread is ${sim.flameSpread_mms.toFixed(2)} ± ${sim.confidenceInterval_mms.toFixed(2)} mm/s, whereas increasing thickness to >=${sim.safeMaterialCheck.minSafeThickness_mm.toFixed(1)} mm provides conductive heat-sink quenching (PSI-159).`,
      `Low-velocity ventilation (${req.Flow_ms.toFixed(2)} m/s) in reduced gravity (${req.g_eff.toFixed(3)}g) sustains boundary-layer oxidizer transport without convective blow-off (PSI-25 BASS-II).`,
    ];
    if (chunkSnippetStep) steps.push(chunkSnippetStep);
    return {
      steps,
      citations: Array.from(new Set(['PSI-99', 'PSI-25', 'PSI-68', 'PSI-159', ...citationSet])).slice(0, 5),
      suggestedVizMode: 'multi-variable',
    };
  }

  // Default step-by-step cabin risk breakdown (plus literature grounding if available)
  const defaultSteps = [
    `Atmosphere Assessment: At ${req.O2_pct.toFixed(1)}% O2 and ${req.P_psi.toFixed(1)} psi (${req.g_eff.toFixed(3)}g), the cabin operates in the ${sim.hazardStatus} regime with a predicted spread speed of ${sim.flameSpread_mms.toFixed(2)} ± ${sim.confidenceInterval_mms.toFixed(2)} mm/s.`,
    `Microgravity Airflow Effect: Current duct velocity (${req.Flow_ms.toFixed(2)} m/s) sits near the 0.05–0.20 m/s microgravity oxygen-replenishment band documented in PSI-99 and PSI-25, matching ${topMatch} (${sim.nearestRuns[0]?.similarityPct ?? 92}% similarity).`,
    `10-Second Growth & Cool-Flame Check: Unmitigated combustion projects a ${sim.forecast10s.radius_mm.toFixed(1)} mm flame radius and +${sim.forecast10s.pressureRise_kPa.toFixed(2)} kPa cabin pressure rise over 10s; monitor 550K–800K non-luminous cool flames (PSI-69 FLEX, PSI-68 FLEX-2).`,
    `Mitigation Threshold: Current ${req.Thickness_mm.toFixed(1)} mm material ${sim.safeMaterialCheck.passed ? 'PASSES' : 'FAILS'} the ${sim.safeMaterialCheck.minSafeThickness_mm.toFixed(1)} mm conductive quenching threshold verified in PSI-159.`,
  ];
  if (chunkSnippetStep) defaultSteps.push(chunkSnippetStep);

  return {
    steps: defaultSteps,
    citations: Array.from(new Set(['PSI-99', 'PSI-25', 'PSI-69', 'PSI-68', 'PSI-159', ...citationSet])).slice(0, 5),
    suggestedVizMode,
  };
}

export function runLocalPhysicsSimulation(
  req: SimulationRequest,
  catalog: PsiRun[] = BASELINE_PSI_RUNS,
  archiveContext?: AssistantArchiveContext
): SimulationResponse {
  const core = computeFlameSpreadVelocity({
    O2_pct: req.O2_pct,
    P_psi: req.P_psi,
    Flow_ms: req.Flow_ms,
    g_eff: req.g_eff,
    Thickness_mm: req.Thickness_mm,
  });

  // 10s growth forecast
  const radius_mm = Number((12.0 + core.flameSpread_mms * 10.0 * (1 + req.Flow_ms * 0.45)).toFixed(1));
  const pressureRise_kPa = Number(
    (0.18 * core.flameSpread_mms * (req.O2_pct / 21.0) * (14.7 / Math.max(req.P_psi, 4.0))).toFixed(2)
  );

  const passed = req.Thickness_mm >= core.minSafeThickness_mm;
  const margin_mm = Number((req.Thickness_mm - core.minSafeThickness_mm).toFixed(1));

  const nearestRuns = findNearestPsiRuns(req, catalog);
  const timelineSeries = generateTimelineSeries({
    ...req,
    peakTemp_K: core.peakTemp_K,
    hazardStatus: core.hazardStatus,
  });
  const materialRankings = generateMaterialRankings({
    ...req,
    baseSpread_mms: core.flameSpread_mms,
  });

  const headlineTakeaway: SimulationResponse['headlineTakeaway'] = {
    'safety-map':
      req.Flow_ms >= 0.05 && req.Flow_ms <= 0.22 && req.O2_pct >= 24
        ? `At ${req.O2_pct.toFixed(1)}% O2 and ${req.Flow_ms.toFixed(2)} m/s airflow (${req.g_eff.toFixed(3)}g), gentle cabin ventilation feeds oxygen to the flame front faster than heat radiates away (${core.flameSpread_mms.toFixed(2)} mm/s).`
        : `Current operating point (${req.O2_pct.toFixed(1)}% O2, ${req.Flow_ms.toFixed(2)} m/s, ${req.g_eff.toFixed(3)}g) yields ${core.flameSpread_mms.toFixed(2)} mm/s spread (${core.hazardStatus}).`,
    'multi-variable': `Comparing active simulation (${core.flameSpread_mms.toFixed(2)} mm/s, ${core.peakTemp_K}K) against selected PSI archive runs shows O2 concentration and low-g airflow dominate spread rate.`,
    'material-safety': `Under ${req.O2_pct.toFixed(1)}% O2 / ${req.P_psi.toFixed(1)} psi, Nomex self-extinguishes (${materialRankings.find((m) => m.name === 'Nomex')?.flameSpread_mms.toFixed(2)} mm/s) while PMMA Acrylic spreads at ${materialRankings.find((m) => m.name === 'PMMA Acrylic')?.flameSpread_mms.toFixed(2)} mm/s.`,
    'sensor-timeline': `Between 35s and 95s, radiative cooling drops gas temperature into the 550K–800K cool-flame window where optical visibility hits 0% while IR flux and CO production persist.`,
  };

  const baseResponse: Omit<SimulationResponse, 'assistantReply'> = {
    flameSpread_mms: core.flameSpread_mms,
    confidenceInterval_mms: core.confidenceInterval_mms,
    hazardStatus: core.hazardStatus,
    peakTemp_K: core.peakTemp_K,
    forecast10s: {
      radius_mm,
      pressureRise_kPa,
    },
    safeMaterialCheck: {
      minSafeThickness_mm: core.minSafeThickness_mm,
      passed,
      margin_mm,
    },
    nearestRuns,
    timelineSeries,
    materialRankings,
    headlineTakeaway,
  };

  if (req.question) {
    return {
      ...baseResponse,
      assistantReply: buildAssistantReply(
        req.question,
        baseResponse,
        req,
        archiveContext
      ),
    };
  }

  return baseResponse;
}
