import {
  ExplanationDepth,
  LearnedBundleExport,
  ModelFeedbackCorrection,
  PsiRun,
  SimulationRequest,
  SimulationResponse,
  UserAdaptationProfile,
  VizMode,
} from '../types/psi';

export const USER_PROFILE_STORAGE_KEY = 'psi_researcher_profile_v1';
export const VERIFIED_CORRECTIONS_STORAGE_KEY = 'psi_verified_corrections_v1';

const MAX_STORED_CORRECTIONS = 100;

function readStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Ignore storage restriction errors cleanly
  }
  return null;
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore quota or storage restriction errors cleanly
  }
}

function topSortedKeys(counts: Record<string, number>, limit = 3): string[] {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function generateDefaultResearcherId(): string {
  const token = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RES-${token}`;
}

export function classifyGravityRegime(g_eff: number): string {
  if (Math.abs(g_eff) < 0.03) return 'Microgravity (0g)';
  if (Math.abs(g_eff - 0.166) <= 0.04) return 'Lunar (0.166g)';
  if (Math.abs(g_eff - 0.378) <= 0.05) return 'Martian (0.378g)';
  if (g_eff >= 0.9) return 'Earth (1.0g)';
  return `Partial (${g_eff.toFixed(2)}g)`;
}

function refreshDerivedPreferences(
  profile: UserAdaptationProfile
): UserAdaptationProfile {
  return {
    ...profile,
    preferredFuels: topSortedKeys(profile.fuelCounts, 3),
    preferredGravities: topSortedKeys(profile.gravityCounts, 3),
    preferredCharts: topSortedKeys(profile.chartCounts, 3) as VizMode[],
    updatedAtUtc: new Date().toISOString(),
  };
}

export function getOrCreateUserProfile(): UserAdaptationProfile {
  const raw = readStorage(USER_PROFILE_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<UserAdaptationProfile>;
      if (parsed && typeof parsed.researcherId === 'string' && parsed.researcherId.trim()) {
        const normalized: UserAdaptationProfile = refreshDerivedPreferences({
          researcherId: parsed.researcherId.trim(),
          explanationDepth:
            parsed.explanationDepth === 'concise' ||
            parsed.explanationDepth === 'detailed'
              ? parsed.explanationDepth
              : 'standard',
          fuelCounts: parsed.fuelCounts && typeof parsed.fuelCounts === 'object' ? parsed.fuelCounts : {},
          gravityCounts:
            parsed.gravityCounts && typeof parsed.gravityCounts === 'object'
              ? parsed.gravityCounts
              : {},
          chartCounts:
            parsed.chartCounts && typeof parsed.chartCounts === 'object'
              ? parsed.chartCounts
              : {},
          preferredFuels: Array.isArray(parsed.preferredFuels) ? parsed.preferredFuels : [],
          preferredGravities: Array.isArray(parsed.preferredGravities)
            ? parsed.preferredGravities
            : [],
          preferredCharts: Array.isArray(parsed.preferredCharts)
            ? (parsed.preferredCharts as VizMode[])
            : [],
          helpfulMessageIds: Array.isArray(parsed.helpfulMessageIds)
            ? parsed.helpfulMessageIds
            : [],
          updatedAtUtc: parsed.updatedAtUtc ?? new Date().toISOString(),
        });
        return normalized;
      }
    } catch {
      // Recover cleanly with fresh default profile
    }
  }

  const fresh: UserAdaptationProfile = {
    researcherId: generateDefaultResearcherId(),
    explanationDepth: 'standard',
    fuelCounts: {},
    gravityCounts: {},
    chartCounts: {},
    preferredFuels: [],
    preferredGravities: [],
    preferredCharts: [],
    helpfulMessageIds: [],
    updatedAtUtc: new Date().toISOString(),
  };
  writeStorage(USER_PROFILE_STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

export function saveUserProfile(
  profile: UserAdaptationProfile
): UserAdaptationProfile {
  const refreshed = refreshDerivedPreferences(profile);
  writeStorage(USER_PROFILE_STORAGE_KEY, JSON.stringify(refreshed));
  return refreshed;
}

export function setResearcherId(researcherId: string): UserAdaptationProfile {
  const profile = getOrCreateUserProfile();
  const cleaned = researcherId.trim() || generateDefaultResearcherId();
  return saveUserProfile({ ...profile, researcherId: cleaned });
}

export function setExplanationDepth(
  depth: ExplanationDepth
): UserAdaptationProfile {
  const profile = getOrCreateUserProfile();
  return saveUserProfile({ ...profile, explanationDepth: depth });
}

export function recordFuelUsage(material: string): UserAdaptationProfile {
  const cleaned = material.trim();
  if (!cleaned) return getOrCreateUserProfile();
  const profile = getOrCreateUserProfile();
  return saveUserProfile({
    ...profile,
    fuelCounts: {
      ...profile.fuelCounts,
      [cleaned]: (profile.fuelCounts[cleaned] ?? 0) + 1,
    },
  });
}

export function recordGravityUsage(g_eff: number): UserAdaptationProfile {
  const regime = classifyGravityRegime(g_eff);
  const profile = getOrCreateUserProfile();
  return saveUserProfile({
    ...profile,
    gravityCounts: {
      ...profile.gravityCounts,
      [regime]: (profile.gravityCounts[regime] ?? 0) + 1,
    },
  });
}

export function recordChartUsage(vizMode: VizMode): UserAdaptationProfile {
  const profile = getOrCreateUserProfile();
  return saveUserProfile({
    ...profile,
    chartCounts: {
      ...profile.chartCounts,
      [vizMode]: (profile.chartCounts[vizMode] ?? 0) + 1,
    },
  });
}

export function recordHelpfulFeedback(
  messageId: string
): UserAdaptationProfile {
  const profile = getOrCreateUserProfile();
  if (profile.helpfulMessageIds.includes(messageId)) {
    return profile;
  }
  return saveUserProfile({
    ...profile,
    helpfulMessageIds: [messageId, ...profile.helpfulMessageIds].slice(0, 100),
  });
}

export function getVerifiedCorrections(): ModelFeedbackCorrection[] {
  const raw = readStorage(VERIFIED_CORRECTIONS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is ModelFeedbackCorrection =>
        Boolean(c) &&
        typeof c === 'object' &&
        typeof (c as ModelFeedbackCorrection).id === 'string' &&
        typeof (c as ModelFeedbackCorrection).correctionNote === 'string'
    );
  } catch {
    return [];
  }
}

function writeVerifiedCorrections(
  corrections: ModelFeedbackCorrection[]
): ModelFeedbackCorrection[] {
  const trimmed = corrections.slice(0, MAX_STORED_CORRECTIONS);
  writeStorage(VERIFIED_CORRECTIONS_STORAGE_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function saveVerifiedCorrection(
  input: Omit<
    ModelFeedbackCorrection,
    'id' | 'createdAtUtc' | 'researcherId' | 'syncedRemote'
  > & { researcherId?: string; syncedRemote?: boolean }
): ModelFeedbackCorrection {
  const profile = getOrCreateUserProfile();
  const created: ModelFeedbackCorrection = {
    id: `corr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    messageId: input.messageId,
    createdAtUtc: new Date().toISOString(),
    researcherId: input.researcherId?.trim() || profile.researcherId,
    question: input.question,
    material: input.material,
    O2_pct: input.O2_pct,
    P_psi: input.P_psi,
    Flow_ms: input.Flow_ms,
    g_eff: input.g_eff,
    Thickness_mm: input.Thickness_mm,
    predictedSpread_mms: input.predictedSpread_mms,
    correctedSpread_mms: input.correctedSpread_mms,
    correctedMinSafeThickness_mm: input.correctedMinSafeThickness_mm,
    correctedOutcome: input.correctedOutcome,
    correctionNote: input.correctionNote.trim(),
    syncedRemote: Boolean(input.syncedRemote),
  };
  const existing = getVerifiedCorrections();
  writeVerifiedCorrections([created, ...existing]);
  return created;
}

export function markCorrectionSynced(
  correctionId: string
): ModelFeedbackCorrection[] {
  const next = getVerifiedCorrections().map((c) =>
    c.id === correctionId ? { ...c, syncedRemote: true } : c
  );
  return writeVerifiedCorrections(next);
}

/**
 * Matches verified user corrections against current physical test conditions & optional question text.
 */
export function findMatchingCorrections(
  conditions: {
    O2_pct: number;
    P_psi: number;
    Flow_ms: number;
    g_eff: number;
    Thickness_mm: number;
    material?: string;
    question?: string;
  },
  corrections: ModelFeedbackCorrection[] = getVerifiedCorrections()
): Array<{ correction: ModelFeedbackCorrection; matchPct: number }> {
  if (corrections.length === 0) return [];
  const matTarget = (conditions.material ?? '').toLowerCase().trim();
  const qTokens = new Set(
    (conditions.question ?? '')
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((t) => t.length >= 3)
  );

  return corrections
    .map((corr) => {
      const dO2 = Math.abs(corr.O2_pct - conditions.O2_pct) / 20;
      const dP = Math.abs(corr.P_psi - conditions.P_psi) / 8;
      const dFlow = Math.abs(corr.Flow_ms - conditions.Flow_ms) / 0.2;
      const dG = Math.abs(corr.g_eff - conditions.g_eff) / 0.5;
      const dThick = Math.abs(corr.Thickness_mm - conditions.Thickness_mm) / 3.0;
      const sameMaterial =
        matTarget && corr.material.toLowerCase().includes(matTarget) ? 0 : 0.35;

      const dist = Math.sqrt(
        0.34 * dO2 * dO2 +
          0.14 * dP * dP +
          0.2 * dFlow * dFlow +
          0.14 * dG * dG +
          0.1 * dThick * dThick +
          0.08 * sameMaterial * sameMaterial
      );

      let lexicalBoost = 0;
      if (qTokens.size > 0) {
        const corrTokens = `${corr.question} ${corr.correctionNote}`
          .toLowerCase()
          .split(/[^a-z0-9-]+/)
          .filter((t) => t.length >= 3);
        const hits = corrTokens.filter((t) => qTokens.has(t)).length;
        lexicalBoost = Math.min(10, hits * 3.5);
      }

      const matchPct = Math.round(
        Math.max(0, Math.min(99, (1 - dist * 0.65) * 100 + lexicalBoost))
      );
      return { correction: corr, matchPct };
    })
    .filter((entry) => entry.matchPct >= 70)
    .sort((a, b) => b.matchPct - a.matchPct);
}

/**
 * Applies verified researcher corrections and personal explanation-depth adaptation
 * to simulation predictions and assistant replies without overriding valid explicit schema bounds.
 */
export function applyCorrectionsAndProfileToSimulation(
  baseSim: SimulationResponse,
  req: SimulationRequest,
  profile: UserAdaptationProfile = req.userProfile ?? getOrCreateUserProfile(),
  corrections: ModelFeedbackCorrection[] = req.verifiedCorrections ??
    getVerifiedCorrections()
): SimulationResponse {
  const matches = findMatchingCorrections(
    {
      O2_pct: req.O2_pct,
      P_psi: req.P_psi,
      Flow_ms: req.Flow_ms,
      g_eff: req.g_eff,
      Thickness_mm: req.Thickness_mm,
      material: req.material,
      question: req.question,
    },
    corrections
  );

  let nextSim: SimulationResponse = baseSim;
  const appliedIds: string[] = [];

  if (matches.length > 0) {
    const primary = matches[0];
    const weight =
      primary.matchPct >= 90 ? 1.0 : primary.matchPct >= 80 ? 0.78 : 0.5;
    appliedIds.push(primary.correction.id);

    let calibratedSpread = baseSim.flameSpread_mms;
    if (
      typeof primary.correction.correctedSpread_mms === 'number' &&
      Number.isFinite(primary.correction.correctedSpread_mms)
    ) {
      calibratedSpread = Number(
        (
          baseSim.flameSpread_mms * (1 - weight) +
          primary.correction.correctedSpread_mms * weight
        ).toFixed(2)
      );
    }

    const minSafe =
      typeof primary.correction.correctedMinSafeThickness_mm === 'number' &&
      Number.isFinite(primary.correction.correctedMinSafeThickness_mm)
        ? Number(
            (
              baseSim.safeMaterialCheck.minSafeThickness_mm * (1 - weight) +
              primary.correction.correctedMinSafeThickness_mm * weight
            ).toFixed(1)
          )
        : baseSim.safeMaterialCheck.minSafeThickness_mm;

    const calibratedHazard =
      primary.matchPct >= 82 && primary.correction.correctedOutcome
        ? primary.correction.correctedOutcome
        : calibratedSpread < 0.45
        ? 'Self-Extinguishing'
        : baseSim.hazardStatus;

    nextSim = {
      ...baseSim,
      flameSpread_mms: calibratedSpread,
      hazardStatus: calibratedHazard,
      safeMaterialCheck: {
        minSafeThickness_mm: minSafe,
        passed: req.Thickness_mm >= minSafe,
        margin_mm: Number((req.Thickness_mm - minSafe).toFixed(1)),
      },
      modelConfidence: baseSim.modelConfidence
        ? {
            ...baseSim.modelConfidence,
            rationale: `${baseSim.modelConfidence.rationale} Calibrated using verified researcher note (${primary.matchPct}% condition match): "${primary.correction.correctionNote}".`,
          }
        : undefined,
    };
  }

  if (!nextSim.assistantReply) {
    return nextSim;
  }

  const correctionSteps = matches.slice(0, 2).map((m) => {
    const spreadTxt =
      typeof m.correction.correctedSpread_mms === 'number'
        ? ` (Verified spread: ${m.correction.correctedSpread_mms.toFixed(2)} mm/s)`
        : '';
    return `Verified Correction Applied (${m.matchPct}% match · ${m.correction.researcherId}): ${m.correction.correctionNote}${spreadTxt}`;
  });

  const combinedSteps = [...correctionSteps, ...nextSim.assistantReply.steps];
  let adaptedSteps = combinedSteps;
  if (profile.explanationDepth === 'concise') {
    adaptedSteps = combinedSteps.slice(0, correctionSteps.length > 0 ? 3 : 2);
  } else if (profile.explanationDepth === 'detailed') {
    const fuelPref = profile.preferredFuels[0];
    const gravPref = profile.preferredGravities[0];
    const depthLine = `Detailed Profile Note (${profile.researcherId}): Tailored for detailed review${
      fuelPref || gravPref
        ? ` across your common test focus (${[fuelPref, gravPref].filter(Boolean).join(', ')})`
        : ''
    }. Margin to quenching boundary is ${nextSim.safeMaterialCheck.margin_mm >= 0 ? '+' : ''}${nextSim.safeMaterialCheck.margin_mm.toFixed(1)} mm with ${nextSim.modelConfidence?.confidencePct.toFixed(1) ?? '90.0'}% confidence.`;
    adaptedSteps = [...combinedSteps, depthLine];
  }

  const prefParts: string[] = [`Profile ${profile.researcherId}`];
  if (profile.preferredFuels[0]) prefParts.push(`Top fuel: ${profile.preferredFuels[0]}`);
  if (profile.preferredGravities[0]) prefParts.push(profile.preferredGravities[0]);
  if (matches.length > 0) {
    prefParts.push(`${matches.length} verified correction${matches.length === 1 ? '' : 's'} applied`);
  }

  return {
    ...nextSim,
    assistantReply: {
      ...nextSim.assistantReply,
      steps: adaptedSteps,
      appliedCorrectionIds: appliedIds.length > 0 ? appliedIds : undefined,
      adaptiveNote: prefParts.join(' · '),
    },
  };
}

export function buildLearnedProfileBundle(
  customRuns: PsiRun[],
  activeEndpoint: LearnedBundleExport['activeEndpoint']
): LearnedBundleExport {
  return {
    exportedAtUtc: new Date().toISOString(),
    formatVersion: '1.0',
    researcherProfile: getOrCreateUserProfile(),
    verifiedCorrections: getVerifiedCorrections(),
    customImportedRuns: customRuns,
    activeEndpoint,
  };
}
