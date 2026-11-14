import { HazardOutcome, PsiRun } from '../types/psi';
import { computeFlameSpreadVelocity } from './physicsEngine';

export interface ImportValidationResult {
  valid: boolean;
  reason?: string;
  detectedKeywords: string[];
  unitConversionsApplied: string[];
  parsedRuns: PsiRun[];
}

const DOMAIN_KEYWORDS = [
  'o2',
  'oxygen',
  'pressure',
  'psi',
  'kpa',
  'atm',
  'flow',
  'velocity',
  'airflow',
  'temp',
  'temperature',
  'fuel',
  'material',
  'gravity',
  'smoke',
  'soot',
  'flame',
  'spread',
  'combustion',
];

export const SAMPLE_COMBUSTION_CSV = `run_id,investigation,facility,fuel_material,oxygen_pct,cabin_pressure_kpa,airflow_cms,gravity_g,thickness_mm,notes
PSI-161-A,SoFIE-MIST Lunar Sweep,CIR,PMMA Acrylic Sheet,34.0,56.5,14.0,0.166,1.8,Exploration 56.5 kPa (8.2 psi) cabin test with 14 cm/s forced ventilation
PSI-161-B,SoFIE-MIST Lunar Sweep,CIR,SIBAL Cotton-Fiberglass,32.0,62.0,9.5,0.166,2.4,Reduced flow 9.5 cm/s boundary layer cool-flame transition check
PSI-162-C,ACME-CFI Extended,MSG,n-Decane Film,23.5,101.3,6.0,0.000,3.6,Zero-g quiescent radiative quenching into 695K cool flame`;

export const SAMPLE_UNRELATED_CSV = `employee_id,department,quarterly_sales_usd,office_location,hire_date,bonus_tier
EMP-901,Enterprise SaaS,142500,Chicago,2024-03-11,Tier-1
EMP-902,Customer Success,98400,Austin,2023-08-22,Tier-2
EMP-903,Field Marketing,115000,Seattle,2025-01-15,Tier-1`;

function parseCsvRows(rawText: string): Array<Record<string, string>> {
  const lines = rawText
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row;
  });
}

export function validateAndNormalizeDataset(
  rawContent: string,
  fileName: string = 'custom_upload.csv'
): ImportValidationResult {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return {
      valid: false,
      reason: 'The uploaded file is empty. Please provide a valid CSV or JSON combustion dataset.',
      detectedKeywords: [],
      unitConversionsApplied: [],
      parsedRuns: [],
    };
  }

  let rows: Array<Record<string, unknown>> = [];

  try {
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      rows = Array.isArray(parsed) ? parsed : parsed.runs || parsed.data || [parsed];
    } else {
      rows = parseCsvRows(trimmed);
    }
  } catch {
    return {
      valid: false,
      reason: `Unable to parse "${fileName}". Ensure the file is well-formed CSV or JSON.`,
      detectedKeywords: [],
      unitConversionsApplied: [],
      parsedRuns: [],
    };
  }

  if (!rows.length || typeof rows[0] !== 'object' || rows[0] === null) {
    return {
      valid: false,
      reason: `No valid data rows found in "${fileName}".`,
      detectedKeywords: [],
      unitConversionsApplied: [],
      parsedRuns: [],
    };
  }

  const headerKeys = Object.keys(rows[0]).map((k) => k.toLowerCase());
  const detectedKeywords = DOMAIN_KEYWORDS.filter((kw) =>
    headerKeys.some((hk) => hk.includes(kw))
  );

  // Domain Relevance Gatekeeper: require at least 2 combustion/spacecraft domain headers
  if (detectedKeywords.length < 2) {
    return {
      valid: false,
      reason: `Domain Gatekeeper Rejected "${fileName}": Found headers [${Object.keys(rows[0]).join(
        ', '
      )}], which do not match microgravity combustion, fire safety, or cabin atmosphere telemetry (expected fields such as oxygen/o2, pressure/psi/kpa, airflow/velocity, fuel/material, temperature, or gravity).`,
      detectedKeywords,
      unitConversionsApplied: [],
      parsedRuns: [],
    };
  }

  const unitConversionsSet = new Set<string>();

  const parsedRuns: PsiRun[] = rows.map((rawRow, idx) => {
    const entries = Object.entries(rawRow).map(([k, v]) => [k.toLowerCase(), v] as const);
    const getVal = (patterns: string[]): string | number | undefined => {
      const found = entries.find(([k]) => patterns.some((p) => k.includes(p)));
      return found ? (found[1] as string | number) : undefined;
    };
    const getKeyName = (patterns: string[]): string => {
      const found = entries.find(([k]) => patterns.some((p) => k.includes(p)));
      return found ? found[0] : '';
    };

    // O2 %
    const rawO2 = Number(getVal(['o2', 'oxygen']) ?? 21.0);
    const O2_pct = Number(Math.max(14.0, Math.min(85.0, isNaN(rawO2) ? 21.0 : rawO2)).toFixed(1));

    // Pressure (auto-convert kPa or atm to psi)
    const pKey = getKeyName(['pressure', 'psi', 'kpa', 'atm']);
    const rawP = Number(getVal(['pressure', 'psi', 'kpa', 'atm']) ?? 14.7);
    let P_psi = isNaN(rawP) ? 14.7 : rawP;
    if (pKey.includes('kpa') || P_psi > 25) {
      P_psi = Number((P_psi * 0.145038).toFixed(1));
      unitConversionsSet.add('Pressure: kPa → psi (×0.145038)');
    } else if (pKey.includes('atm') || P_psi <= 2.5) {
      P_psi = Number((P_psi * 14.6959).toFixed(1));
      unitConversionsSet.add('Pressure: atm → psi (×14.6959)');
    } else {
      P_psi = Number(P_psi.toFixed(1));
    }

    // Airflow (auto-convert cm/s to m/s)
    const flowKey = getKeyName(['flow', 'velocity', 'airflow', 'cms']);
    const rawFlow = Number(getVal(['flow', 'velocity', 'airflow', 'cms']) ?? 0.12);
    let Flow_ms = isNaN(rawFlow) ? 0.12 : rawFlow;
    if (flowKey.includes('cm') || Flow_ms > 1.0) {
      Flow_ms = Number((Flow_ms / 100).toFixed(2));
      unitConversionsSet.add('Airflow Velocity: cm/s → m/s (÷100)');
    } else {
      Flow_ms = Number(Flow_ms.toFixed(2));
    }

    // Gravity
    const rawG = Number(getVal(['gravity', 'g_eff', 'gravity_g']) ?? 0.0);
    const g_eff = Number(Math.max(0, Math.min(1.0, isNaN(rawG) ? 0.0 : rawG)).toFixed(3));

    // Thickness
    const rawThick = Number(getVal(['thick', 'thickness']) ?? 2.0);
    const Thickness_mm = Number(
      Math.max(0.2, Math.min(10.0, isNaN(rawThick) ? 2.0 : rawThick)).toFixed(1)
    );

    const computed = computeFlameSpreadVelocity({
      O2_pct,
      P_psi,
      Flow_ms,
      g_eff,
      Thickness_mm,
    });

    const rawSpread = Number(getVal(['spread', 'flame_spread']));
    const flameSpread_mms =
      !isNaN(rawSpread) && rawSpread > 0
        ? Number(rawSpread.toFixed(2))
        : computed.flameSpread_mms;

    const rawTemp = Number(getVal(['temp', 'temperature']));
    const peakTemp_K =
      !isNaN(rawTemp) && rawTemp > 250 ? Math.round(rawTemp) : computed.peakTemp_K;

    const runIdStr = String(getVal(['run_id', 'psi_id', 'id']) || `PSI-CUST-${idx + 1}`);
    const invTitle = String(
      getVal(['investigation', 'title']) || 'Custom Imported Combustion Run'
    );
    const material = String(getVal(['fuel', 'material']) || 'PMMA Composite');
    const facilityRaw = String(getVal(['facility']) || 'CIR').toUpperCase();
    const facility: PsiRun['facility'] =
      facilityRaw === 'MSG' || facilityRaw === 'CYGNUS' || facilityRaw === 'FSL'
        ? (facilityRaw === 'CYGNUS' ? 'Cygnus' : (facilityRaw as PsiRun['facility']))
        : 'CIR';

    const outcome: HazardOutcome = computed.hazardStatus;

    return {
      id: `custom-${Date.now()}-${idx}`,
      psiId: runIdStr,
      investigationTitle: invTitle,
      runCode: `IMP-0${idx + 1}`,
      facility,
      material,
      O2_pct,
      P_psi,
      Flow_ms,
      g_eff,
      Thickness_mm,
      flameSpread_mms,
      peakTemp_K,
      radiometerFlux_Wm2: Math.round(peakTemp_K * 11.5),
      coolFlameObserved: outcome === 'Cool Flame Caution',
      outcome,
      notes: String(getVal(['notes', 'comment']) || 'Normalized and imported via Domain Gatekeeper.'),
      isCustom: true,
    };
  });

  return {
    valid: true,
    detectedKeywords,
    unitConversionsApplied: Array.from(unitConversionsSet),
    parsedRuns,
  };
}
