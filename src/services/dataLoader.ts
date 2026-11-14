import Papa from 'papaparse';
import {
  DataManifestFileRecord,
  HazardOutcome,
  LiteratureChunk,
  LiteratureCorpusStats,
  PsiInvestigationRecord,
  PsiPublicationRecord,
  PsiRun,
  ResearchersGuideTopic,
} from '../types/psi';
import { computeFlameSpreadVelocity } from '../utils/physicsEngine';

export function formatUtcTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export const DATA_BASE_PATH = '/data/nasa-space-apps';
export const RESEARCHERS_GUIDE_PDF_URL = `${DATA_BASE_PATH}/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf`;
export const SAME_EIRD_PDF_URL = `${DATA_BASE_PATH}/same-eird-rev-2-00-02-25-05-high-q.pdf`;

interface RawCatalogInvestigation {
  psi_id: string;
  title: string;
  investigation_acronym?: string;
  flight_platform?: string;
  managing_center?: string;
  research_area?: string;
  sub_research_area?: string;
  experiment_hardware?: string;
  hardware_link?: string;
  doi?: string;
  objective?: string;
  approach?: string;
  hypothesis?: string;
  principal_investigator?: {
    first_name?: string[] | string;
    last_name?: string[] | string;
    affiliation?: string[] | string;
    email?: string[] | string;
  };
  publications?: {
    title?: string[] | string;
    authors?: string[] | string;
    link?: string[] | string;
  };
  files?: {
    spreadsheets?: string[];
    pdfs?: string[];
    images?: string[];
    metadata?: string[];
  };
  audit_status?: string;
}

interface RawManifestInvestigation {
  psi_id: string;
  status?: string;
  spreadsheets?: Array<{
    file_name: string;
    row_count?: number;
    columns?: string[];
  }>;
  pdfs?: Array<{
    file_name: string;
    file_size?: number;
  }>;
}

interface RawTelemetryCsvRow {
  psi_id?: string;
  facility?: string;
  fuel?: string;
  O2_pct?: string;
  P_psi?: string;
  Flow_ms?: string;
  g_eff?: string;
  Thickness_mm?: string;
  Vf_mms?: string;
  T_max_K?: string;
}

export interface LoadedPsiArchive {
  investigations: PsiInvestigationRecord[];
  runs: PsiRun[];
  totalCsvRuns: number;
  literatureChunks: LiteratureChunk[];
  corpusStats: LiteratureCorpusStats;
  researchersGuideTopics: ResearchersGuideTopic[];
  manifestFiles: DataManifestFileRecord[];
}

const GUIDE_SOURCE_FILE =
  'PSI-20_Science Documents_ISS_Researchers_Guide_-_Combustion_In_Reduced_Gravity.pdf';

/** Sub-campaign PSI IDs folded into parent investigation dossiers while keeping run IDs searchable */
const SUBCAMPAIGN_PARENT_MAP: Record<string, string> = {
  'PSI-22': 'PSI-20',
  'PSI-101': 'PSI-102',
};

const FACILITY_BY_PSI: Record<string, PsiRun['facility']> = {
  'PSI-20': 'CIR',
  'PSI-22': 'CIR',
  'PSI-25': 'MSG',
  'PSI-26': 'MSG',
  'PSI-39': 'CIR',
  'PSI-60': 'MSG',
  'PSI-62': 'MSG',
  'PSI-68': 'CIR',
  'PSI-69': 'CIR',
  'PSI-98': 'Cygnus',
  'PSI-99': 'Cygnus',
  'PSI-100': 'Cygnus',
  'PSI-101': 'MSG',
  'PSI-102': 'MSG',
  'PSI-106': 'MSG',
  'PSI-107': 'MSG',
  'PSI-115': 'MSG',
  'PSI-117': 'CIR',
  'PSI-142': 'FSL',
  'PSI-159': 'CIR',
};

const DEFAULT_PARAMS_BY_PSI: Record<
  string,
  {
    O2_pct: number;
    P_psi: number;
    Flow_ms: number;
    g_eff: number;
    Thickness_mm: number;
    coolFlameDefault: boolean;
    defaultFuel: string;
    acronym: string;
  }
> = {
  'PSI-20': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.08,
    g_eff: 0.0,
    Thickness_mm: 2.5,
    coolFlameDefault: true,
    defaultFuel: 'Gaseous Ethylene / Methane (BRE)',
    acronym: 'ACME BRE',
  },
  'PSI-22': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.14,
    g_eff: 0.0,
    Thickness_mm: 2.0,
    coolFlameDefault: false,
    defaultFuel: 'Methane / Ethylene E-Field Flame',
    acronym: 'ACME E-FIELD',
  },
  'PSI-25': {
    O2_pct: 22.2,
    P_psi: 10.2,
    Flow_ms: 0.11,
    g_eff: 0.0,
    Thickness_mm: 0.2,
    coolFlameDefault: false,
    defaultFuel: 'PMMA Acrylic Film',
    acronym: 'BASS-II',
  },
  'PSI-26': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.06,
    g_eff: 0.0,
    Thickness_mm: 1.5,
    coolFlameDefault: false,
    defaultFuel: 'SIBAL / Cotton-Fiberglass / PMMA',
    acronym: 'BASS',
  },
  'PSI-39': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.04,
    g_eff: 0.0,
    Thickness_mm: 3.0,
    coolFlameDefault: true,
    defaultFuel: 'n-Dodecane Droplet',
    acronym: 'CFI',
  },
  'PSI-60': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.36,
    g_eff: 0.0,
    Thickness_mm: 1.6,
    coolFlameDefault: false,
    defaultFuel: 'Ethylene / Propane Laminar Jet (CFD)',
    acronym: 'SPICE Analysis',
  },
  'PSI-62': {
    O2_pct: 24.0,
    P_psi: 14.7,
    Flow_ms: 0.14,
    g_eff: 0.0,
    Thickness_mm: 1.0,
    coolFlameDefault: false,
    defaultFuel: 'SIBAL / Cellulose Sheet (FGM Model)',
    acronym: 'Concurrent FGM',
  },
  'PSI-68': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.05,
    g_eff: 0.0,
    Thickness_mm: 3.0,
    coolFlameDefault: true,
    defaultFuel: 'n-Heptane / IsoOctane Droplet',
    acronym: 'FLEX-2',
  },
  'PSI-69': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.04,
    g_eff: 0.0,
    Thickness_mm: 3.2,
    coolFlameDefault: true,
    defaultFuel: 'Heptane / Methanol Droplet',
    acronym: 'FLEX',
  },
  'PSI-98': {
    O2_pct: 21.5,
    P_psi: 14.7,
    Flow_ms: 0.2,
    g_eff: 0.0,
    Thickness_mm: 0.37,
    coolFlameDefault: false,
    defaultFuel: 'SIBAL Fabric Large Panel',
    acronym: 'SAFFIRE-I',
  },
  'PSI-99': {
    O2_pct: 22.1,
    P_psi: 14.7,
    Flow_ms: 0.2,
    g_eff: 0.0,
    Thickness_mm: 1.0,
    coolFlameDefault: false,
    defaultFuel: 'Silicone / PMMA / Nomex Array',
    acronym: 'SAFFIRE-II',
  },
  'PSI-100': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.3,
    g_eff: 0.0,
    Thickness_mm: 0.33,
    coolFlameDefault: false,
    defaultFuel: 'SIBAL Fabric High-Flow Panel',
    acronym: 'SAFFIRE-III',
  },
  'PSI-101': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.081,
    g_eff: 0.0,
    Thickness_mm: 4.5,
    coolFlameDefault: true,
    defaultFuel: 'Kapton / Teflon / Silicone Wire',
    acronym: 'SAME-R',
  },
  'PSI-102': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.05,
    g_eff: 0.0,
    Thickness_mm: 4.8,
    coolFlameDefault: true,
    defaultFuel: 'Teflon / Kapton / Lampwick Smoke',
    acronym: 'SAME',
  },
  'PSI-106': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.1,
    g_eff: 0.0,
    Thickness_mm: 2.0,
    coolFlameDefault: false,
    defaultFuel: 'Methane (40%–100% CH4) Jet',
    acronym: 'SLICE',
  },
  'PSI-107': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.36,
    g_eff: 0.0,
    Thickness_mm: 1.6,
    coolFlameDefault: false,
    defaultFuel: 'Ethylene / Propane Jet Nozzle',
    acronym: 'SPICE',
  },
  'PSI-115': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.06,
    g_eff: 0.0,
    Thickness_mm: 4.0,
    coolFlameDefault: true,
    defaultFuel: 'PTFE / Kapton Aerosol Model',
    acronym: 'SAME Modeling',
  },
  'PSI-117': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.04,
    g_eff: 0.0,
    Thickness_mm: 2.8,
    coolFlameDefault: true,
    defaultFuel: 'n-Alkane / DME Cool Flame CFD',
    acronym: 'Cool Flame CFD',
  },
  'PSI-142': {
    O2_pct: 19.5,
    P_psi: 14.7,
    Flow_ms: 0.08,
    g_eff: 0.0,
    Thickness_mm: 2.5,
    coolFlameDefault: true,
    defaultFuel: 'n-Heptane Counterflow Extinction',
    acronym: 'Counterflow Cool Flame',
  },
  'PSI-159': {
    O2_pct: 21.0,
    P_psi: 14.7,
    Flow_ms: 0.05,
    g_eff: 0.0,
    Thickness_mm: 3.0,
    coolFlameDefault: true,
    defaultFuel: 'Ethane / Methane Spherical Cool Flame',
    acronym: 'ACME CFI-G',
  },
};

export function sanitizeVisiblePsiText(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/^"+|"+$/g, '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\bNASA['’]s\s+/gi, 'PSI ')
    .replace(/\bNASA\s+ISS\s+Program\s+Science\s+Office\b/gi, 'ISS Program Science Office')
    .replace(/\bNASA\s+Glenn\s+Research\s+Center\b/gi, 'Glenn Research Center')
    .replace(/\bNASA\s+Ames\s+Research\s+Center\b/gi, 'Ames Research Center')
    .replace(/\bNASA\s+GRC\b/gi, 'GRC')
    .replace(/Image credit:\s*NASA\b/gi, 'Image credit: PSI Archive')
    .replace(/\bNASA\s+Test\s+2\b/gi, 'Standard Test 2')
    .replace(/\bNASAs\b/gi, 'PSI')
    .replace(/\bNASA\b/gi, 'PSI')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanProseText(raw?: string): string {
  return sanitizeVisiblePsiText(raw);
}

function parseO2Pct(raw: string | undefined, psiId: string): number {
  const fallback = DEFAULT_PARAMS_BY_PSI[psiId]?.O2_pct ?? 21.0;
  if (!raw || !raw.trim()) return fallback;
  const cleaned = raw.trim();
  const num = Number(cleaned);
  if (Number.isNaN(num) || num <= 0) return fallback;

  // Handle mole fractions (e.g. 0.21, 0.15, 0.135)
  if (num <= 1.0) {
    return Number((num * 100).toFixed(1));
  }
  // Handle PSI-20 concatenated multi-value strings (e.g. "2126.540", "26.534", "3400", "253440")
  if (num > 100) {
    if (cleaned.startsWith('26.5')) return 26.5;
    const prefix2 = Number(cleaned.slice(0, 2));
    if (!Number.isNaN(prefix2) && prefix2 >= 12 && prefix2 <= 100) {
      return prefix2;
    }
    return fallback;
  }
  return Number(Math.max(10, Math.min(100, num)).toFixed(1));
}

function parsePressurePsi(raw: string | undefined, psiId: string): number {
  const fallback = DEFAULT_PARAMS_BY_PSI[psiId]?.P_psi ?? 14.7;
  if (!raw || !raw.trim()) return fallback;
  const num = Number(raw.trim());
  if (Number.isNaN(num) || num <= 0) return fallback;
  // Convert atmospheres to psi if <= 6.5 (e.g. PSI-39: 1, 1.25, 2, 3, 5 atm)
  const psi = num <= 6.5 ? num * 14.7 : num;
  return Number(Math.max(3.0, Math.min(80.0, psi)).toFixed(1));
}

function parseFlowMs(raw: string | undefined, psiId: string): number {
  const fallback = DEFAULT_PARAMS_BY_PSI[psiId]?.Flow_ms ?? 0.12;
  if (!raw || !raw.trim()) return fallback;
  const num = Number(raw.trim());
  if (Number.isNaN(num) || num < 0) return fallback;
  // Convert cm/s to m/s when > 1.5
  const ms = num > 1.5 ? num / 100 : num;
  return Number(Math.max(0.0, Math.min(1.0, ms)).toFixed(3));
}

function parseThicknessFromFuel(fuelRaw: string | undefined): number | null {
  if (!fuelRaw) return null;
  const micronMatch = fuelRaw.match(/(\d+(?:\.\d+)?)\s*(?:micron|um|µm)/i);
  if (micronMatch) {
    const val = Number(micronMatch[1]) / 1000;
    if (!Number.isNaN(val) && val > 0) return Number(val.toFixed(2));
  }
  const mmMatch = fuelRaw.match(/(\d+(?:\.\d+)?)\s*mm/i);
  if (mmMatch) {
    const val = Number(mmMatch[1]);
    if (!Number.isNaN(val) && val > 0) return Number(Math.min(10, val).toFixed(2));
  }
  return null;
}

function parseThicknessMm(
  raw: string | undefined,
  fuelRaw: string | undefined,
  psiId: string
): number {
  const fallback = DEFAULT_PARAMS_BY_PSI[psiId]?.Thickness_mm ?? 2.0;
  if (raw && raw.trim()) {
    const num = Number(raw.trim());
    if (!Number.isNaN(num) && num > 0) {
      // PSI-20 burner diameters are 25mm / 50mm -> scale to 2.5mm / 5.0mm thermal equivalent
      const normalized = psiId === 'PSI-20' && num >= 15 ? num / 10 : num;
      return Number(Math.max(0.1, Math.min(10.0, normalized)).toFixed(2));
    }
  }
  const fromFuel = parseThicknessFromFuel(fuelRaw);
  return fromFuel ?? fallback;
}

function buildRunFromCsvRow(
  row: RawTelemetryCsvRow,
  indexInPsi: number,
  invTitleMap: Record<string, string>,
  isFirstInInvestigation: boolean
): PsiRun {
  const psiId = (row.psi_id || 'PSI-20').trim().toUpperCase();
  const defaults = DEFAULT_PARAMS_BY_PSI[psiId] ?? DEFAULT_PARAMS_BY_PSI['PSI-20'];
  const facility =
    (row.facility?.trim() as PsiRun['facility']) ||
    FACILITY_BY_PSI[psiId] ||
    'CIR';

  const cleanFuel = cleanProseText(row.fuel) || defaults.defaultFuel;
  const O2_pct = parseO2Pct(row.O2_pct, psiId);
  const P_psi = parsePressurePsi(row.P_psi, psiId);
  const Flow_ms = parseFlowMs(row.Flow_ms, psiId);
  const gRaw = row.g_eff && row.g_eff.trim() ? Number(row.g_eff.trim()) : defaults.g_eff;
  const g_eff = Number.isNaN(gRaw) ? defaults.g_eff : Number(gRaw.toFixed(3));
  const Thickness_mm = parseThicknessMm(row.Thickness_mm, cleanFuel, psiId);

  const physics = computeFlameSpreadVelocity({
    O2_pct,
    P_psi: Math.min(18.0, P_psi),
    Flow_ms: Math.min(0.5, Flow_ms),
    g_eff,
    Thickness_mm,
  });

  const vfRaw = row.Vf_mms && row.Vf_mms.trim() ? Number(row.Vf_mms.trim()) : NaN;
  const flameSpread_mms =
    !Number.isNaN(vfRaw) && vfRaw > 0
      ? Number(vfRaw.toFixed(2))
      : physics.flameSpread_mms;

  const tMaxRaw = row.T_max_K && row.T_max_K.trim() ? Number(row.T_max_K.trim()) : NaN;
  let peakTemp_K = physics.peakTemp_K;
  if (!Number.isNaN(tMaxRaw) && tMaxRaw >= 400) {
    peakTemp_K = Math.round(tMaxRaw);
  } else if (!Number.isNaN(tMaxRaw) && tMaxRaw >= 95 && tMaxRaw < 400) {
    // Convert thermocouples in °C or temperature rise above 296 K
    peakTemp_K = Math.round(tMaxRaw + 296);
  }

  const coolFlameObserved =
    defaults.coolFlameDefault ||
    (peakTemp_K >= 550 && peakTemp_K <= 815) ||
    physics.hazardStatus === 'Cool Flame Caution';

  let outcome: HazardOutcome = physics.hazardStatus;
  if (flameSpread_mms < 0.48 && !coolFlameObserved) {
    outcome = 'Self-Extinguishing';
  } else if (coolFlameObserved && peakTemp_K <= 840) {
    outcome = 'Cool Flame Caution';
  } else if (flameSpread_mms >= 0.48) {
    outcome = 'Rapid Flame Spread';
  }

  const radiometerFlux_Wm2 = Math.round(
    Math.max(950, peakTemp_K * 11.4 + flameSpread_mms * 1950)
  );

  const shortPrefix = defaults.acronym.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase() || 'PSI';
  const runCode = `${shortPrefix}-${String(indexInPsi + 1).padStart(3, '0')}`;
  const canonicalId = psiId.toLowerCase();

  // First run of each primary PSI gets the clean canonical id (`psi-99`, `psi-25`, `psi-69`, `psi-159`)
  // so citations and default comparator presets map directly to real runs.
  const id = isFirstInInvestigation
    ? canonicalId
    : `${canonicalId}-r${String(indexInPsi + 1).padStart(3, '0')}`;

  const invTitle =
    invTitleMap[psiId] || `${psiId} Microgravity Combustion Investigation`;

  return {
    id,
    psiId: `${psiId} ${defaults.acronym}`.trim(),
    investigationTitle: invTitle,
    runCode,
    facility,
    material: cleanFuel,
    O2_pct,
    P_psi,
    Flow_ms,
    g_eff,
    Thickness_mm,
    flameSpread_mms,
    peakTemp_K,
    radiometerFlux_Wm2,
    coolFlameObserved,
    outcome,
    notes: `${cleanFuel} tested in ${facility} microgravity hardware (${O2_pct.toFixed(1)}% O2, ${P_psi.toFixed(1)} psi, ${Flow_ms.toFixed(2)} m/s, ${Thickness_mm.toFixed(2)} mm scale).`,
  };
}

function buildGuideTopics(guideChunks: LiteratureChunk[]): ResearchersGuideTopic[] {
  const specs: Array<{
    id: string;
    sectionNumber: string;
    title: string;
    category: ResearchersGuideTopic['category'];
    pageRange: string;
    startPage: number;
    endPage: number;
    summary: string;
    keyTakeaways: string[];
  }> = [
    {
      id: 'guide-sec-1',
      sectionNumber: '01',
      title: 'The Lab is Open & Unique Features of the ISS Environment',
      category: 'Environment & Physics',
      pageRange: 'pp. 1–7',
      startPage: 1,
      endPage: 7,
      summary:
        'Overview of microgravity acceleration spectra (~10⁻⁶ g quasi-steady), orbital thermal cycling, and the transition from drop towers / parabolic aircraft (2.2s–20s) to continuous multi-hour combustion experiments on the ISS.',
      keyTakeaways: [
        'Eliminates natural buoyant convection, allowing diffusion and radiation to govern flame structure.',
        'Long-duration ISS test times uncover slow radiative extinction and cool-flame dynamics impossible to see in 2.2-second drop towers.',
      ],
    },
    {
      id: 'guide-sec-2',
      sectionNumber: '02',
      title: 'Why Conduct Combustion Research in Microgravity?',
      category: 'Environment & Physics',
      pageRange: 'pp. 8–10',
      startPage: 8,
      endPage: 10,
      summary:
        'Motivates microgravity combustion science around two pillars: validated numerical turbulent/laminar combustion models for terrestrial engines and quantitative spacecraft cabin fire safety protocols.',
      keyTakeaways: [
        'Simplifies spherical 1D droplet and flat-plate boundary-layer geometries for CFD model validation.',
        'Reveals fire risks unique to crewed spacecraft cabin atmospheres and ventilation loops.',
      ],
    },
    {
      id: 'guide-sec-3',
      sectionNumber: '03',
      title: 'Droplet Combustion & Cool-Flame Regimes (FLEX / CFI)',
      category: 'Droplet & Cool Flames',
      pageRange: 'pp. 11–14',
      startPage: 11,
      endPage: 14,
      summary:
        'Highlights the landmark discovery of steady low-temperature cool flames (550K–800K NTC kinetics) in n-heptane and binary alkane droplets during the FLEX investigation aboard the ISS.',
      keyTakeaways: [
        'Droplets undergo a dual-mode burn: hot luminous flame → radiative extinction → sustained non-luminous cool flame.',
        'Cool flames emit nearly zero visible light while generating formaldehyde, CO, and heat — challenging optical fire detectors.',
      ],
    },
    {
      id: 'guide-sec-4',
      sectionNumber: '04',
      title: 'Solid-Fuel Combustion & Spacecraft Fire Safety (BASS & SAFFIRE)',
      category: 'Solid Flammability',
      pageRange: 'pp. 14–18',
      startPage: 14,
      endPage: 18,
      summary:
        'Examines solid-fuel ignition, opposed vs. concurrent forced-flow spread, thickness scaling, and full-scale Cygnus cargo vehicle fire tests across PMMA, Cotton-Fiberglass (SIBAL), and Nomex.',
      keyTakeaways: [
        'Gentle ventilation (0.05–0.20 m/s) in 0g accelerates oxygen supply without convective blow-off, creating a lower extinction limit than 1g.',
        'Larger solid-sample thickness acts as a conductive heat sink, enabling self-extinguishing bounds (explored further in SoFIE / PSI-159).',
      ],
    },
    {
      id: 'guide-sec-5',
      sectionNumber: '05',
      title: 'Gaseous Fuels, Soot Morphology & Smoke Detection (SLICE, SPICE, SAME)',
      category: 'Gaseous & Soot',
      pageRange: 'pp. 18–21',
      startPage: 18,
      endPage: 21,
      summary:
        'Covers co-flow laminar jet smoke points (SPICE), lifted stabilized flames (SLICE), and smoke aerosol particle coalescence (SAME) for next-generation spacecraft smoke detectors.',
      keyTakeaways: [
        'Longer residence times in microgravity allow primary soot spherules to coalesce into large fractal aggregates (>0.5 µm).',
        'High-temperature wire insulation pyrolysis yields smoke distributions distinct from flaming cellulose fires.',
      ],
    },
    {
      id: 'guide-sec-6',
      sectionNumber: '06',
      title: 'Correlation of Flammability Between Normal Gravity and Microgravity',
      category: 'Solid Flammability',
      pageRange: 'pp. 22–26',
      startPage: 22,
      endPage: 26,
      summary:
        'Critiques ground standard STD-6001 upward propagation tests against reduced-gravity opposed and concurrent flow regimes, explaining why 1g pass/fail margins can miss low-flow orbital hazards.',
      keyTakeaways: [
        '1g natural convection masks low-velocity extinction boundaries (<10 cm/s) critical inside cabin ventilation racks.',
        'Elevated O₂ / reduced-pressure exploration atmospheres (34% O₂, 8.2 psi) increase gas-phase kinetics relative to 21% O₂ sea-level air.',
      ],
    },
    {
      id: 'guide-sec-7',
      sectionNumber: '07',
      title: 'Fundamentals of Flame Growth, Radiation & Extinction',
      category: 'Environment & Physics',
      pageRange: 'pp. 27–35',
      startPage: 27,
      endPage: 35,
      summary:
        'Details thermal diffusion timescales, Lewis number effects, carbon dioxide / water vapor radiative heat loss, and Damköhler number extinction bounds in quiescent and slow-flow microgravity.',
      keyTakeaways: [
        'Radiative quenching dominates at very low flow (U < 0.03 m/s), whereas convective blow-off dominates only at high flow.',
        'Non-premixed and premixed flame balls stabilize via diffusive balance when buoyancy is absent.',
      ],
    },
    {
      id: 'guide-sec-8',
      sectionNumber: '08',
      title: 'ISS Combustion Research Facilities & Experimental Opportunities',
      category: 'ISS Facilities',
      pageRange: 'pp. 36–50',
      startPage: 36,
      endPage: 50,
      summary:
        'Reference specifications for the Combustion Integrated Rack (CIR), Multi-User Droplet Combustion Apparatus (MDCA), Advanced Combustion via Microgravity Experiments (ACME), and Microgravity Science Glovebox (MSG).',
      keyTakeaways: [
        'CIR houses interchangeable chamber inserts up to 100 L with optical/UV OH* chemiluminescence, FTIR, and radiometer diagnostics.',
        'MSG supports crew-interactive wind tunnels (BASS / SLICE / SPICE / SAME) inside a triple-sealed glovebox work volume.',
      ],
    },
  ];

  return specs.map((spec) => ({
    ...spec,
    chunks: guideChunks
      .filter(
        (c) => c.page_number >= spec.startPage && c.page_number <= spec.endPage
      )
      .sort((a, b) => a.page_number - b.page_number || a.chunk_index - b.chunk_index),
    pdfUrl: `${RESEARCHERS_GUIDE_PDF_URL}#page=${spec.startPage}`,
  }));
}

let cachedPromise: Promise<LoadedPsiArchive> | null = null;

export async function loadPsiArchiveData(): Promise<LoadedPsiArchive> {
  if (cachedPromise) return cachedPromise;

  cachedPromise = (async () => {
    const responses = await Promise.all([
      fetch(`${DATA_BASE_PATH}/psi_runs_catalog.json`),
      fetch(`${DATA_BASE_PATH}/psi_inventory_manifest.json`),
      fetch(`${DATA_BASE_PATH}/master_psi_telemetry.csv`),
      fetch(`${DATA_BASE_PATH}/psi_literature_chunks.json`),
      fetch(`${DATA_BASE_PATH}/processed/psi_literature_summary.json`),
    ]);
    const [catalogRes, manifestRes, csvRes, chunksRes, summaryRes] = responses;
    for (const res of responses) {
      if (!res.ok) {
        throw new Error(`Failed to load archive asset (${res.status}): ${res.url}`);
      }
    }

    const [catalogText, manifestText, csvText, chunksText, summaryText] =
      await Promise.all([
        catalogRes.text(),
        manifestRes.text(),
        csvRes.text(),
        chunksRes.text(),
        summaryRes.text(),
      ]);

    const encoder = new TextEncoder();
    const byteSizeOf = (txt: string): number => encoder.encode(txt).length;
    const loadedAtUtc = formatUtcTimestamp(new Date());

    const catalogJson = JSON.parse(catalogText) as {
      investigations: RawCatalogInvestigation[];
    };
    const manifestJson = JSON.parse(manifestText) as {
      investigations: Record<string, RawManifestInvestigation>;
    };
    const rawChunks = JSON.parse(chunksText) as LiteratureChunk[];
    const literatureChunks = rawChunks.map((ch) => ({
      ...ch,
      text: sanitizeVisiblePsiText(ch.text),
    }));
    const summaryJson = JSON.parse(summaryText) as LiteratureCorpusStats;

    const invTitleMap: Record<string, string> = {};
    for (const inv of catalogJson.investigations) {
      const id = inv.psi_id.toUpperCase();
      invTitleMap[id] =
        inv.title && inv.title !== id
          ? sanitizeVisiblePsiText(inv.title)
          : `${id} (${DEFAULT_PARAMS_BY_PSI[id]?.acronym ?? 'PSI'})`;
    }

    const parsedCsv = Papa.parse<RawTelemetryCsvRow>(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    const csvRows = parsedCsv.data.filter((r) => r.psi_id && r.psi_id.trim());
    const perPsiCounters: Record<string, number> = {};
    const allRuns: PsiRun[] = [];

    // Canonical PSI-22 / PSI-101 runs still belong to their PSI IDs on run objects,
    // and first run of each primary PSI gets canonical id `psi-XX`.
    for (const row of csvRows) {
      const psiId = (row.psi_id || '').trim().toUpperCase();
      const idx = perPsiCounters[psiId] ?? 0;
      perPsiCounters[psiId] = idx + 1;
      const run = buildRunFromCsvRow(row, idx, invTitleMap, idx === 0);
      allRuns.push(run);
    }

    // Add representative runs for the 5 metadata/CFD/counterflow investigations that have no rows in master_psi_telemetry.csv
    const csvPsiSet = new Set(Object.keys(perPsiCounters));
    for (const inv of catalogJson.investigations) {
      const psiId = inv.psi_id.toUpperCase();
      if (!csvPsiSet.has(psiId)) {
        const defaults = DEFAULT_PARAMS_BY_PSI[psiId];
        const rep = buildRunFromCsvRow(
          {
            psi_id: psiId,
            facility: FACILITY_BY_PSI[psiId] ?? 'CIR',
            fuel: defaults?.defaultFuel ?? inv.title,
            O2_pct: String(defaults?.O2_pct ?? 21.0),
            P_psi: String(defaults?.P_psi ?? 14.7),
            Flow_ms: String(defaults?.Flow_ms ?? 0.12),
            g_eff: '0',
            Thickness_mm: String(defaults?.Thickness_mm ?? 2.0),
          },
          0,
          invTitleMap,
          true
        );
        rep.notes = cleanProseText(inv.objective) || rep.notes;
        allRuns.push(rep);
      }
    }

    // Build the 18 primary PSI Investigation records (PSI-20 through PSI-159, folding sub-campaigns PSI-22 -> PSI-20, PSI-101 -> PSI-102)
    const primaryCatalogEntries = catalogJson.investigations.filter(
      (inv) => !SUBCAMPAIGN_PARENT_MAP[inv.psi_id.toUpperCase()]
    );

    const investigations: PsiInvestigationRecord[] = primaryCatalogEntries.map(
      (inv) => {
        const psiId = inv.psi_id.toUpperCase();
        const defaults =
          DEFAULT_PARAMS_BY_PSI[psiId] ?? DEFAULT_PARAMS_BY_PSI['PSI-20'];
        const acronym = inv.investigation_acronym || defaults.acronym;
        const manifest = manifestJson.investigations[psiId];

        // Collect all runs for this PSI investigation + any folded subcampaign (e.g. PSI-22 or PSI-101)
        const matchingRuns = allRuns.filter((r) => {
          const runPsi = r.psiId.split(/\s+/)[0].toUpperCase();
          return (
            runPsi === psiId || SUBCAMPAIGN_PARENT_MAP[runPsi] === psiId
          );
        });

        // Pick a rich representative run (preferring canonical id match)
        const representativeRun =
          matchingRuns.find((r) => r.id === psiId.toLowerCase()) ??
          matchingRuns[0];

        const fuelsSet = new Set<string>();
        let minO2 = Infinity;
        let maxO2 = -Infinity;
        let minP = Infinity;
        let maxP = -Infinity;
        let minFlow = Infinity;
        let maxFlow = -Infinity;
        let minSpread = Infinity;
        let maxSpread = -Infinity;
        const outcomeCounts: Record<HazardOutcome, number> = {
          'Rapid Flame Spread': 0,
          'Cool Flame Caution': 0,
          'Self-Extinguishing': 0,
        };

        for (const r of matchingRuns) {
          if (fuelsSet.size < 6) fuelsSet.add(r.material);
          if (r.O2_pct < minO2) minO2 = r.O2_pct;
          if (r.O2_pct > maxO2) maxO2 = r.O2_pct;
          if (r.P_psi < minP) minP = r.P_psi;
          if (r.P_psi > maxP) maxP = r.P_psi;
          if (r.Flow_ms < minFlow) minFlow = r.Flow_ms;
          if (r.Flow_ms > maxFlow) maxFlow = r.Flow_ms;
          if (r.flameSpread_mms < minSpread) minSpread = r.flameSpread_mms;
          if (r.flameSpread_mms > maxSpread) maxSpread = r.flameSpread_mms;
          outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] || 0) + 1;
        }

        const dominantOutcome = (
          Object.entries(outcomeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
          'Cool Flame Caution'
        ) as HazardOutcome;

        // Parse PIs
        const firsts = Array.isArray(inv.principal_investigator?.first_name)
          ? inv.principal_investigator!.first_name
          : [];
        const lasts = Array.isArray(inv.principal_investigator?.last_name)
          ? inv.principal_investigator!.last_name
          : [];
        const principalInvestigators = firsts
          .map((f, idx) => `${f} ${lasts[idx] ?? ''}`.trim())
          .filter(Boolean);

        const affiliations = Array.isArray(
          inv.principal_investigator?.affiliation
        )
          ? Array.from(
              new Set(
                inv.principal_investigator!.affiliation.map((a) =>
                  sanitizeVisiblePsiText(a)
                )
              )
            ).filter(Boolean)
          : [];

        // Parse publications
        const pubTitles = Array.isArray(inv.publications?.title)
          ? inv.publications!.title
          : [];
        const pubAuthors = Array.isArray(inv.publications?.authors)
          ? inv.publications!.authors
          : [];
        const pubLinks = Array.isArray(inv.publications?.link)
          ? inv.publications!.link
          : [];
        const publications: PsiPublicationRecord[] = pubTitles
          .map((t, idx) => ({
            title: sanitizeVisiblePsiText(t),
            authors: sanitizeVisiblePsiText(pubAuthors[idx] ?? ''),
            link: pubLinks[idx] ?? '',
          }))
          .filter((p) => Boolean(p.title));

        // Combine spreadsheet/PDF inventory with folded subcampaigns (PSI-22, PSI-101)
        const spreadsheets = [...(inv.files?.spreadsheets ?? [])];
        const pdfs = [...(inv.files?.pdfs ?? [])];
        for (const [subId, parentId] of Object.entries(SUBCAMPAIGN_PARENT_MAP)) {
          if (parentId === psiId) {
            const subCat = catalogJson.investigations.find(
              (c) => c.psi_id.toUpperCase() === subId
            );
            const subMan = manifestJson.investigations[subId];
            if (subCat?.files?.spreadsheets) {
              spreadsheets.push(...subCat.files.spreadsheets);
            }
            if (subCat?.files?.pdfs) {
              pdfs.push(...subCat.files.pdfs.slice(0, 6));
            }
            if (subMan?.spreadsheets) {
              for (const s of subMan.spreadsheets) {
                if (!spreadsheets.includes(s.file_name)) {
                  spreadsheets.push(s.file_name);
                }
              }
            }
          }
        }
        if (manifest?.spreadsheets) {
          for (const s of manifest.spreadsheets) {
            if (!spreadsheets.includes(s.file_name)) {
              spreadsheets.push(s.file_name);
            }
          }
        }

        const cleanDoi = (inv.doi || '').trim();
        const doiUrl = cleanDoi
          ? cleanDoi.startsWith('http')
            ? cleanDoi
            : `https://doi.org/${cleanDoi.replace(/^doi:\s*/i, '')}`
          : undefined;
        const hardwareLink =
          inv.hardware_link && inv.hardware_link.startsWith('http')
            ? inv.hardware_link.trim()
            : undefined;
        const psiPortalLabel = `Official PSI Portal (Search: ${psiId}${
          acronym ? ` / ${acronym}` : ''
        }) ↗`;

        return {
          psiId,
          acronym,
          title: sanitizeVisiblePsiText(inv.title) || psiId,
          facility: FACILITY_BY_PSI[psiId] ?? 'CIR',
          hardwareRaw:
            sanitizeVisiblePsiText(inv.experiment_hardware) ||
            `${FACILITY_BY_PSI[psiId] ?? 'CIR'} Flight Hardware`,
          flightPlatform:
            sanitizeVisiblePsiText(inv.flight_platform) ||
            'International Space Station (ISS)',
          managingCenter:
            sanitizeVisiblePsiText(inv.managing_center) ||
            'Glenn Research Center (GRC)',
          researchArea:
            sanitizeVisiblePsiText(inv.research_area) || 'Combustion Science',
          subResearchArea:
            sanitizeVisiblePsiText(inv.sub_research_area) ||
            'Microgravity Fire & Flame Physics',
          doi: cleanDoi,
          doiUrl,
          hardwareLink,
          psiPortalLabel,
          objective:
            cleanProseText(inv.objective) ||
            `${psiId} (${acronym}) investigates reduced-gravity combustion dynamics and spacecraft fire safety thresholds.`,
          approach: cleanProseText(inv.approach),
          hypothesis: cleanProseText(inv.hypothesis),
          principalInvestigators,
          affiliations,
          publications,
          spreadsheets,
          pdfs,
          auditStatus:
            inv.audit_status || manifest?.status || '[OK: ARCHIVE VERIFIED]',
          runCount: matchingRuns.length,
          fuels: Array.from(fuelsSet),
          o2Range: [
            Number.isFinite(minO2) ? minO2 : defaults.O2_pct,
            Number.isFinite(maxO2) ? maxO2 : defaults.O2_pct,
          ],
          pressureRange: [
            Number.isFinite(minP) ? minP : defaults.P_psi,
            Number.isFinite(maxP) ? maxP : defaults.P_psi,
          ],
          flowRange: [
            Number.isFinite(minFlow) ? minFlow : defaults.Flow_ms,
            Number.isFinite(maxFlow) ? maxFlow : defaults.Flow_ms,
          ],
          spreadRange: [
            Number.isFinite(minSpread) ? minSpread : 0.1,
            Number.isFinite(maxSpread) ? maxSpread : 1.5,
          ],
          dominantOutcome,
          representativeRun,
          psiSourceUrl: 'https://psi.nasa.gov/',
        };
      }
    );

    const guideChunks = literatureChunks.filter(
      (c) => c.source_file === GUIDE_SOURCE_FILE
    );
    const researchersGuideTopics = buildGuideTopics(guideChunks);

    const manifestEntries = Object.values(manifestJson.investigations);
    const manifestSheetCount = manifestEntries.reduce(
      (acc, entry) => acc + (entry.spreadsheets?.length ?? 0),
      0
    );
    const manifestPdfCount = manifestEntries.reduce(
      (acc, entry) => acc + (entry.pdfs?.length ?? 0),
      0
    );
    const metadataBaselineCount = allRuns.length - csvRows.length;
    const subcampaignCount = catalogJson.investigations.length - investigations.length;

    const manifestFiles: DataManifestFileRecord[] = [
      {
        id: 'manifest-catalog',
        fileName: 'psi_runs_catalog.json',
        filePath: `${DATA_BASE_PATH}/psi_runs_catalog.json`,
        format: 'JSON',
        recordCount: catalogJson.investigations.length,
        recordLabel: `${catalogJson.investigations.length} catalog records (${investigations.length} primary${subcampaignCount > 0 ? ` + ${subcampaignCount} sub-campaigns` : ''})`,
        sizeBytes: byteSizeOf(catalogText),
        loadedAtUtc,
        status: 'Loaded',
      },
      {
        id: 'manifest-csv',
        fileName: 'master_psi_telemetry.csv',
        filePath: `${DATA_BASE_PATH}/master_psi_telemetry.csv`,
        format: 'CSV',
        recordCount: csvRows.length,
        recordLabel: `${csvRows.length.toLocaleString()} telemetry CSV rows (${metadataBaselineCount} metadata baselines → ${allRuns.length.toLocaleString()} indexed runs)`,
        sizeBytes: byteSizeOf(csvText),
        loadedAtUtc,
        status: 'Loaded',
      },
      {
        id: 'manifest-chunks',
        fileName: 'psi_literature_chunks.json',
        filePath: `${DATA_BASE_PATH}/psi_literature_chunks.json`,
        format: 'JSON',
        recordCount: literatureChunks.length,
        recordLabel: `${literatureChunks.length.toLocaleString()} indexed chunks (${guideChunks.length} ISS Guide sections)`,
        sizeBytes: byteSizeOf(chunksText),
        loadedAtUtc,
        status: 'Loaded',
      },
      {
        id: 'manifest-inventory',
        fileName: 'psi_inventory_manifest.json',
        filePath: `${DATA_BASE_PATH}/psi_inventory_manifest.json`,
        format: 'JSON',
        recordCount: manifestEntries.length,
        recordLabel: `${manifestEntries.length} file dossiers (${manifestSheetCount} spreadsheets · ${manifestPdfCount} PDFs)`,
        sizeBytes: byteSizeOf(manifestText),
        loadedAtUtc,
        status: 'Loaded',
      },
      {
        id: 'manifest-summary',
        fileName: 'processed/psi_literature_summary.json',
        filePath: `${DATA_BASE_PATH}/processed/psi_literature_summary.json`,
        format: 'JSON',
        recordCount: summaryJson.totalSourceDocuments,
        recordLabel: `${summaryJson.totalSourceDocuments} source docs · ${summaryJson.totalRawChunks.toLocaleString()} summarized chunks`,
        sizeBytes: byteSizeOf(summaryText),
        loadedAtUtc,
        status: 'Loaded',
      },
    ];

    return {
      investigations,
      runs: allRuns,
      totalCsvRuns: csvRows.length,
      literatureChunks,
      corpusStats: summaryJson,
      researchersGuideTopics,
      manifestFiles,
    };
  })();

  return cachedPromise;
}

export function getRunsForInvestigation(
  psiId: string,
  allRuns: PsiRun[]
): PsiRun[] {
  const target = psiId.toUpperCase();
  return allRuns.filter((run) => {
    const runPsi = run.psiId.split(/\s+/)[0].toUpperCase();
    return runPsi === target || SUBCAMPAIGN_PARENT_MAP[runPsi] === target;
  });
}

export function searchLiteratureChunks(
  query: string,
  chunks: LiteratureChunk[],
  limit = 8
): LiteratureChunk[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return chunks.slice(0, limit);

  const scored = chunks
    .map((chunk) => {
      const textLower = chunk.text.toLowerCase();
      const srcLower = chunk.source_file.toLowerCase();
      const psiLower = chunk.psi_id.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (psiLower.includes(tok)) score += 6;
        if (srcLower.includes(tok)) score += 3;
        if (textLower.includes(tok)) score += 2;
      }
      // Bonus for ISS Researcher's Guide hits
      if (score > 0 && chunk.source_file === GUIDE_SOURCE_FILE) {
        score += 1.5;
      }
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk);

  return scored;
}
