import {
  DatasetScope,
  PsiRun,
  SimulationResponse,
  StudioDatasetSource,
  VizCompatibilityResult,
  VizDatasetContext,
  VizFamilyId,
  VizMode,
  VizTechniqueDefinition,
} from '../types/psi';

export interface VizFamilyMeta {
  id: VizFamilyId;
  label: string;
  shortLabel: string;
  description: string;
}

export type NumericAxisKey =
  | 'O2_pct'
  | 'P_psi'
  | 'Flow_ms'
  | 'g_eff'
  | 'Thickness_mm'
  | 'flameSpread_mms'
  | 'peakTemp_K'
  | 'radiometerFlux_Wm2';

export type CategoricalGroupKey = 'outcome' | 'facility' | 'material' | 'psiId';

export type AxisVariableKey = NumericAxisKey | CategoricalGroupKey;

export interface AxisColumnMeta {
  key: AxisVariableKey;
  label: string;
  shortLabel: string;
  unit?: string;
  kind: 'numeric' | 'categorical';
  min?: number;
  max?: number;
  format?: (val: number) => string;
}

export const STUDIO_NUMERIC_COLUMNS: Array<
  AxisColumnMeta & {
    key: NumericAxisKey;
    kind: 'numeric';
    min: number;
    max: number;
    format: (v: number) => string;
  }
> = [
  {
    key: 'O2_pct',
    label: 'O₂ Concentration',
    shortLabel: 'O₂ %',
    unit: '%',
    kind: 'numeric',
    min: 14,
    max: 100,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'P_psi',
    label: 'Cabin Pressure',
    shortLabel: 'Pressure psi',
    unit: 'psi',
    kind: 'numeric',
    min: 4.3,
    max: 20.0,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'Flow_ms',
    label: 'Forced Airflow',
    shortLabel: 'Airflow m/s',
    unit: 'm/s',
    kind: 'numeric',
    min: 0.0,
    max: 0.5,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'g_eff',
    label: 'Gravity Level',
    shortLabel: 'Gravity g',
    unit: 'g',
    kind: 'numeric',
    min: 0.0,
    max: 1.0,
    format: (v) => v.toFixed(3),
  },
  {
    key: 'Thickness_mm',
    label: 'Material Thickness',
    shortLabel: 'Thickness mm',
    unit: 'mm',
    kind: 'numeric',
    min: 0.2,
    max: 10.0,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'peakTemp_K',
    label: 'Peak Gas Temperature',
    shortLabel: 'Peak Temp K',
    unit: 'K',
    kind: 'numeric',
    min: 300,
    max: 1900,
    format: (v) => `${Math.round(v)}`,
  },
  {
    key: 'radiometerFlux_Wm2',
    label: 'IR Radiometer Flux',
    shortLabel: 'IR Flux W/m²',
    unit: 'W/m²',
    kind: 'numeric',
    min: 0,
    max: 25000,
    format: (v) => `${Math.round(v)}`,
  },
  {
    key: 'flameSpread_mms',
    label: 'Flame Spread Rate',
    shortLabel: 'Flame Spread mm/s',
    unit: 'mm/s',
    kind: 'numeric',
    min: 0.0,
    max: 5.5,
    format: (v) => v.toFixed(2),
  },
];

export const STUDIO_CATEGORICAL_COLUMNS: Array<
  AxisColumnMeta & { key: CategoricalGroupKey; kind: 'categorical' }
> = [
  { key: 'outcome', label: 'Safety Regime', shortLabel: 'Safety Regime', kind: 'categorical' },
  { key: 'facility', label: 'Hardware Facility', shortLabel: 'Facility', kind: 'categorical' },
  { key: 'material', label: 'Material Substrate', shortLabel: 'Material', kind: 'categorical' },
  { key: 'psiId', label: 'PSI Investigation ID', shortLabel: 'PSI ID', kind: 'categorical' },
];

export const ALL_STUDIO_AXIS_COLUMNS: AxisColumnMeta[] = [
  ...STUDIO_NUMERIC_COLUMNS,
  ...STUDIO_CATEGORICAL_COLUMNS,
];

export function isNumericAxisKey(key: AxisVariableKey): key is NumericAxisKey {
  return STUDIO_NUMERIC_COLUMNS.some((c) => c.key === key);
}

export function getAxisMeta(key: AxisVariableKey): AxisColumnMeta {
  return (
    ALL_STUDIO_AXIS_COLUMNS.find((c) => c.key === key) ??
    STUDIO_NUMERIC_COLUMNS[0]
  );
}

export function getDefaultAxesForTechnique(vizMode: VizMode): {
  xAxis: AxisVariableKey;
  yAxis: NumericAxisKey;
  colorBy: CategoricalGroupKey;
} {
  switch (vizMode) {
    case 'safety-map':
      return { xAxis: 'O2_pct', yAxis: 'Flow_ms', colorBy: 'outcome' };
    case 'contour-surface':
      return { xAxis: 'P_psi', yAxis: 'Thickness_mm', colorBy: 'outcome' };
    case 'scatter-plot':
    case 'bubble-plot':
    case 'density-strip':
      return { xAxis: 'O2_pct', yAxis: 'flameSpread_mms', colorBy: 'outcome' };
    case 'residual-deviation':
      return { xAxis: 'O2_pct', yAxis: 'flameSpread_mms', colorBy: 'material' };
    case 'grouped-bar':
    case 'stacked-bar':
    case 'material-safety':
    case 'frequency-distribution':
      return { xAxis: 'material', yAxis: 'flameSpread_mms', colorBy: 'outcome' };
    case 'horizontal-ranked-bar':
    case 'lollipop-dot':
    case 'range-interval-bar':
      return { xAxis: 'psiId', yAxis: 'flameSpread_mms', colorBy: 'outcome' };
    case 'histogram':
    case 'box-quartile':
      return { xAxis: 'flameSpread_mms', yAxis: 'flameSpread_mms', colorBy: 'outcome' };
    case 'correlation-matrix':
    case 'heatmap-matrix':
      return { xAxis: 'O2_pct', yAxis: 'flameSpread_mms', colorBy: 'facility' };
    case 'sensor-timeline':
    case 'multi-series-line':
    case 'area-chart':
    case 'stacked-area':
    case 'step-chart':
    case 'timeline-progression':
      return { xAxis: 'O2_pct', yAxis: 'peakTemp_K', colorBy: 'outcome' };
    case 'multi-variable':
    case 'polar-radial':
    default:
      return { xAxis: 'O2_pct', yAxis: 'flameSpread_mms', colorBy: 'outcome' };
  }
}

export const STUDIO_DATASET_SOURCES: Array<{
  id: StudioDatasetSource;
  label: string;
  description: string;
}> = [
  {
    id: 'full-archive',
    label: 'Full PSI Archive',
    description: 'All flight test runs across 18 PSI experiments',
  },
  {
    id: 'selected-comparison',
    label: 'Selected Comparison Runs',
    description: 'Runs picked for side-by-side Run Comparator view',
  },
  {
    id: 'virtual-lab-output',
    label: 'Virtual Test Lab Output',
    description: 'Current virtual test result + nearest real flight runs + 120s sensor curve',
  },
  {
    id: 'material-qualification',
    label: 'Material Safety Comparison',
    description: '5 common spacecraft materials (PMMA, SIBAL, Cotton-Fiberglass, PTFE, Nomex)',
  },
  {
    id: 'imported-custom',
    label: 'Imported Custom CSV/JSON',
    description: 'Your uploaded test rows formatted into matching PSI units',
  },
];

export const VIZ_FAMILIES: VizFamilyMeta[] = [
  {
    id: 'comparisons',
    label: 'Comparisons & Rankings',
    shortLabel: 'Comparisons',
    description: 'Side-by-side bars, stacked indices, ranks, target bullets, and parallel coordinate axes',
  },
  {
    id: 'distributions',
    label: 'Distributions & Ranges',
    shortLabel: 'Distributions',
    description: 'Binned histograms, frequency bars, confidence spans, density strips, and quartile plots',
  },
  {
    id: 'relationships',
    label: 'Relationships & Multi-Variable',
    shortLabel: 'Relationships',
    description: 'Bivariate scatter, multi-metric bubbles, residual plots, Pearson grids, and normalized matrices',
  },
  {
    id: 'time-series',
    label: 'Time & Sequential Progression',
    shortLabel: 'Time & Sequence',
    description: 'Dual-axis sensor lines, multi-series curves, stacked emission areas, step charts, and forecasts',
  },
  {
    id: 'spatial-regime',
    label: 'Spatial, Regime & Multi-Dimensional',
    shortLabel: 'Regime & Spatial',
    description: '2D regime heatmaps, bivariate contour density maps, and polar radial profiles',
  },
];

export const VIZ_TECHNIQUE_REGISTRY: VizTechniqueDefinition[] = [
  // 1. SPATIAL, REGIME & MULTI-DIMENSIONAL
  {
    id: 'safety-map',
    name: '2D Regime Heatmap',
    shortName: '2D Heatmap',
    familyId: 'spatial-regime',
    familyLabel: 'Spatial, Regime & Multi-Dimensional',
    description:
      'Continuous 2D parameter grid colored by modeled safety regime with clickable coordinate sampling and overlaid archive points.',
    keywords: ['heatmap', '2d', 'regime', 'grid', 'contour', 'spatial', 'interactive'],
    requirementsSummary: 'Requires continuous 2D numeric X × Y parameter grid',
    evaluateCompatibility: (ctx) =>
      ctx.has2DGrid
        ? {
            status: 'recommended',
            reason: 'Recommended: Direct 2D numeric grid mapping with overlaid dataset points.',
          }
        : {
            status: 'unavailable',
            reason: 'Unavailable: Requires a 2D numeric parameter grid.',
            missingRequirement: '2D Parameter Grid',
          },
  },
  {
    id: 'contour-surface',
    name: 'Contour Density Map',
    shortName: 'Contour Map',
    familyId: 'spatial-regime',
    familyLabel: 'Spatial, Regime & Multi-Dimensional',
    description:
      '2D response contour map resolving boundary transitions across two user-selected continuous variables.',
    keywords: ['contour', 'density', 'surface', 'heatmap', '2d', 'boundary', 'threshold'],
    requirementsSummary: 'Requires continuous 2D numeric X × Y sweep grid',
    evaluateCompatibility: (ctx) => {
      if (!ctx.has2DGrid) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Requires a continuous 2D numeric parameter grid.',
          missingRequirement: '2D Parameter Grid',
        };
      }
      return ctx.activeRuns.length >= 4
        ? {
            status: 'recommended',
            reason: 'Recommended: Resolves boundary contours alongside active dataset runs.',
          }
        : {
            status: 'available',
            reason: 'Available: Renders continuous X × Y contour surface for active test state.',
          };
    },
  },
  {
    id: 'polar-radial',
    name: 'Polar Radial Profile',
    shortName: 'Polar Profile',
    familyId: 'spatial-regime',
    familyLabel: 'Spatial, Regime & Multi-Dimensional',
    description:
      'Normalized multi-axis radial polygon comparing telemetry shapes across records with explicit quadratic area caveat.',
    keywords: ['polar', 'radial', 'radar', 'spider', 'multi-dimensional', 'envelope'],
    requirementsSummary: 'Requires ≥1 run and ≥4 numeric dimensions',
    caveatNote:
      'Analytical Caveat: Radial polygon area scales quadratically with radius and depends on axis ordering. Prefer Parallel Coordinates or Bullet Target Chart for strict quantitative comparison.',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 1 || ctx.numericColumnCount < 4) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Requires at least 1 run and 4 numeric telemetry dimensions.',
          missingRequirement: '≥1 Run & ≥4 Numeric Columns',
        };
      }
      return {
        status: 'available',
        reason: 'Available: Polar radial profile ready (see area-distortion caveat).',
      };
    },
  },

  // 2. COMPARISONS & RANKINGS
  {
    id: 'multi-variable',
    name: 'Parallel Coordinates',
    shortName: 'Parallel Coords',
    familyId: 'comparisons',
    familyLabel: 'Comparisons & Rankings',
    description:
      'Multi-axis vertical polyline overlay comparing multiple normalized numeric dimensions simultaneously.',
    keywords: ['parallel coordinates', 'multi-variable', 'multi-axis', 'profile', 'compare'],
    requirementsSummary: 'Requires ≥2 active runs to compare across telemetry axes',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 2) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Select 2 or more runs to compare across axes.',
          missingRequirement: '≥2 Active Runs',
        };
      }
      return ctx.activeRuns.length <= 8
        ? {
            status: 'recommended',
            reason: `Recommended: High-clarity parallel coordinate density for ${ctx.activeRuns.length} runs.`,
          }
        : {
            status: 'available',
            reason: `Available: Overlays representative runs across 5 normalized telemetry axes.`,
          };
    },
  },
  {
    id: 'material-safety',
    name: 'Bullet Target Chart',
    shortName: 'Bullet Chart',
    familyId: 'comparisons',
    familyLabel: 'Comparisons & Rankings',
    description:
      'Multi-panel horizontal bullet bars against threshold markers plus sortable numeric qualification matrix.',
    keywords: ['bullet', 'target', 'threshold', 'benchmark', 'qualification', 'matrix'],
    requirementsSummary: 'Requires target qualification metrics in active scope',
    evaluateCompatibility: (ctx) =>
      ctx.hasMaterialMetrics
        ? {
            status: 'recommended',
            reason: 'Recommended: Horizontal bullet target bars compare candidates against safety thresholds.',
          }
        : {
            status: 'unavailable',
            reason: 'Unavailable: Requires target benchmark metrics.',
            missingRequirement: 'Target Benchmark Metrics',
          },
  },
  {
    id: 'grouped-bar',
    name: 'Grouped Bar Chart',
    shortName: 'Grouped Bar',
    familyId: 'comparisons',
    familyLabel: 'Comparisons & Rankings',
    description:
      'Side-by-side multi-metric bar clusters grouped by run or chosen categorical column.',
    keywords: ['grouped bar', 'bar chart', 'comparison', 'cluster', 'categories'],
    requirementsSummary: 'Requires ≥2 active runs for side-by-side grouped comparison',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 2) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Needs at least 2 active records for side-by-side grouped bars.',
          missingRequirement: '≥2 Active Records',
        };
      }
      return ctx.activeRuns.length <= 12
        ? {
            status: 'recommended',
            reason: `Recommended: Clear side-by-side grouped comparison across ${ctx.activeRuns.length} records.`,
          }
        : {
            status: 'available',
            reason: 'Available: Aggregates grouped metrics across top categories or runs.',
          };
    },
  },
  {
    id: 'stacked-bar',
    name: 'Stacked Bar Chart',
    shortName: 'Stacked Bar',
    familyId: 'comparisons',
    familyLabel: 'Comparisons & Rankings',
    description:
      'Part-to-whole stacked bar decomposition across normalized multi-component hazard indices.',
    keywords: ['stacked bar', 'composite', 'part-to-whole', 'breakdown', 'components'],
    requirementsSummary: 'Requires multi-component metrics or ≥2 active records',
    evaluateCompatibility: (ctx) => {
      if (!ctx.hasMaterialMetrics && ctx.activeRuns.length < 2) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Requires multi-component metrics or ≥2 active records.',
          missingRequirement: 'Component Metrics or ≥2 Records',
        };
      }
      return {
        status: 'available',
        reason: 'Available: Decomposes stacked multi-factor component loads.',
      };
    },
  },
  {
    id: 'horizontal-ranked-bar',
    name: 'Horizontal Ranked Bar Chart',
    shortName: 'Ranked Bar',
    familyId: 'comparisons',
    familyLabel: 'Comparisons & Rankings',
    description:
      'Sorted horizontal ranking bars ordering records by the selected Y-axis metric against benchmark thresholds.',
    keywords: ['horizontal', 'ranked', 'ranking', 'bar', 'leaderboard', 'sort'],
    requirementsSummary: 'Requires ≥1 record with numeric metric values',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 1) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Requires at least 1 active record to rank.',
          missingRequirement: '≥1 Active Record',
        };
      }
      return ctx.activeRuns.length >= 4
        ? {
            status: 'recommended',
            reason: `Recommended: Ranks ${ctx.activeRuns.length} records on the mapped metric axis.`,
          }
        : {
            status: 'available',
            reason: `Available: Ranks ${ctx.activeRuns.length} active records against reference state.`,
          };
    },
  },
  {
    id: 'lollipop-dot',
    name: 'Cleveland Lollipop Plot',
    shortName: 'Lollipop Plot',
    familyId: 'comparisons',
    familyLabel: 'Comparisons & Rankings',
    description:
      'Precision stem-and-dot delta plot measuring deviation from the mean or active virtual test baseline.',
    keywords: ['lollipop', 'dot plot', 'cleveland', 'delta', 'deviation', 'baseline'],
    requirementsSummary: 'Requires ≥2 active records to compare baseline deltas',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 2) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Needs 2 or more records to plot baseline deltas.',
          missingRequirement: '≥2 Active Records',
        };
      }
      return {
        status: 'available',
        reason: `Available: Plots precision deltas relative to active test reference.`,
      };
    },
  },

  // 3. DISTRIBUTIONS & RANGES
  {
    id: 'histogram',
    name: 'Telemetry Histogram',
    shortName: 'Histogram',
    familyId: 'distributions',
    familyLabel: 'Distributions & Ranges',
    description:
      'Equal-width binned frequency histogram for any mapped numeric variable with mean/median & test-state overlay.',
    keywords: ['histogram', 'bins', 'distribution', 'density', 'frequency'],
    requirementsSummary: 'Needs at least 4 numeric samples for distribution bins',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 4) {
        return {
          status: 'unavailable',
          reason: `Unavailable: Needs at least 4 numeric samples for distribution bins (${ctx.activeRuns.length} in active scope).`,
          missingRequirement: '≥4 Numeric Samples',
        };
      }
      return ctx.activeRuns.length >= 10
        ? {
            status: 'recommended',
            reason: `Recommended: Reveals distribution clustering across ${ctx.activeRuns.length} samples.`,
          }
        : {
            status: 'available',
            reason: `Available: Bins ${ctx.activeRuns.length} active samples into intervals.`,
          };
    },
  },
  {
    id: 'frequency-distribution',
    name: 'Frequency Distribution Bars',
    shortName: 'Frequency Bars',
    familyId: 'distributions',
    familyLabel: 'Distributions & Ranges',
    description:
      'Categorical count distribution broken down by the mapped Group-By variable and primary category.',
    keywords: ['frequency', 'categorical', 'count', 'group', 'distribution'],
    requirementsSummary: 'Needs at least 3 records to summarize categorical frequencies',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 3) {
        return {
          status: 'unavailable',
          reason: `Unavailable: Needs at least 3 runs to summarize categorical counts (${ctx.activeRuns.length} active).`,
          missingRequirement: '≥3 Active Runs',
        };
      }
      return ctx.activeRuns.length >= 10
        ? {
            status: 'recommended',
            reason: `Recommended: Summarizes category & group frequencies across ${ctx.activeRuns.length} records.`,
          }
        : {
            status: 'available',
            reason: `Available: Displays categorical count bars for ${ctx.activeRuns.length} records.`,
          };
    },
  },
  {
    id: 'range-interval-bar',
    name: 'Confidence Interval Range Plot',
    shortName: 'CI Range Plot',
    familyId: 'distributions',
    familyLabel: 'Distributions & Ranges',
    description:
      'Horizontal range bars displaying point estimates and ±95% uncertainty spans alongside threshold bounds.',
    keywords: ['range', 'interval', 'confidence', 'ci', 'error bar', 'span', 'uncertainty'],
    requirementsSummary: 'Requires ≥1 active record with numeric telemetry',
    evaluateCompatibility: (ctx) =>
      ctx.activeRuns.length < 1
        ? {
            status: 'unavailable',
            reason: 'Unavailable: Requires at least 1 active record to plot confidence spans.',
            missingRequirement: '≥1 Active Record',
          }
        : {
            status: 'available',
            reason: 'Available: Plots spread ±95% confidence bounds and thermal intervals.',
          },
  },
  {
    id: 'box-quartile',
    name: 'Box & Quartile Distribution',
    shortName: 'Box Plot',
    familyId: 'distributions',
    familyLabel: 'Distributions & Ranges',
    description:
      'Five-number summary (Min, Q1, Median, Q3, Max) across telemetry columns with active virtual test markers.',
    keywords: ['box plot', 'quartile', 'iqr', 'median', 'whisker', 'distribution', 'outliers'],
    requirementsSummary: 'Needs at least 5 numeric samples to compute quartiles (Q1–Q3)',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 5) {
        return {
          status: 'unavailable',
          reason: `Unavailable: Needs at least 5 numeric samples for quartile (Q1–Q3) summary (${ctx.activeRuns.length} in active scope).`,
          missingRequirement: '≥5 Numeric Samples',
        };
      }
      return ctx.activeRuns.length >= 10
        ? {
            status: 'recommended',
            reason: `Recommended: Summarizes median, IQR, and range across ${ctx.activeRuns.length} runs.`,
          }
        : {
            status: 'available',
            reason: `Available: Computes Q1–Q3 quartiles across ${ctx.activeRuns.length} active runs.`,
          };
    },
  },
  {
    id: 'density-strip',
    name: 'Bivariate Density Strip Plot',
    shortName: 'Density Strip',
    familyId: 'distributions',
    familyLabel: 'Distributions & Ranges',
    description:
      'Grouped dot/strip distribution showing every observation grouped by category along any mapped numeric metric.',
    keywords: ['strip plot', 'dot distribution', 'jitter', 'beeswarm', 'density', 'category'],
    requirementsSummary: 'Requires ≥4 records across ≥1 category',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 4) {
        return {
          status: 'unavailable',
          reason: `Unavailable: Needs at least 4 observations for strip density (${ctx.activeRuns.length} active).`,
          missingRequirement: '≥4 Records',
        };
      }
      return {
        status: ctx.activeRuns.length >= 12 ? 'recommended' : 'available',
        reason: `Plots all individual records grouped by category along mapped numeric axis.`,
      };
    },
  },

  // 4. RELATIONSHIPS & MULTI-VARIABLE VIEWS
  {
    id: 'scatter-plot',
    name: 'Multi-Axis Scatter Plot',
    shortName: 'Scatter Plot',
    familyId: 'relationships',
    familyLabel: 'Relationships & Multi-Variable',
    description:
      'Interactive X vs. Y scatter plot with user-mapped axes, categorical color encoding, and click-to-inspect markers.',
    keywords: ['scatter', 'xy', 'bivariate', 'multi-axis', 'relationship', 'correlation'],
    requirementsSummary: 'Requires ≥2 active runs and ≥2 numeric columns',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 2 || ctx.numericColumnCount < 2) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Needs 2 or more records with ≥2 numeric columns.',
          missingRequirement: '≥2 Records & ≥2 Numeric Columns',
        };
      }
      return ctx.activeRuns.length >= 6
        ? {
            status: 'recommended',
            reason: `Recommended: Explores bivariate trends across ${ctx.activeRuns.length} runs.`,
          }
        : {
            status: 'available',
            reason: `Available: Plots configurable X/Y telemetry for ${ctx.activeRuns.length} records.`,
          };
    },
  },
  {
    id: 'bubble-plot',
    name: 'Bubble Multi-Metric Plot',
    shortName: 'Bubble Plot',
    familyId: 'relationships',
    familyLabel: 'Relationships & Multi-Variable',
    description:
      '4-dimensional scatter projection encoding X-axis, Y-axis, area radius (IR Flux / Spread), and color group.',
    keywords: ['bubble', '4d', 'multi-variable', 'multi-metric', 'scatter', 'size'],
    requirementsSummary: 'Requires ≥2 active records and ≥3 numeric dimensions',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 2 || ctx.numericColumnCount < 3) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Requires at least 2 records and 3 numeric variables.',
          missingRequirement: '≥2 Records & ≥3 Numeric Columns',
        };
      }
      return ctx.activeRuns.length >= 4
        ? {
            status: 'recommended',
            reason: 'Recommended: Projects X, Y, size-encoded flux, and category simultaneously.',
          }
        : {
            status: 'available',
            reason: 'Available: Renders 4-metric bubble projection on active scope.',
          };
    },
  },
  {
    id: 'correlation-matrix',
    name: 'Correlation Matrix',
    shortName: 'Correlation Matrix',
    familyId: 'relationships',
    familyLabel: 'Relationships & Multi-Variable',
    description:
      '6×6 symmetric Pearson r correlation heatmap quantifying linear coupling across numeric telemetry variables.',
    keywords: ['correlation', 'matrix', 'pearson', 'covariance', 'grid', 'relationships'],
    requirementsSummary: 'Needs at least 4 active runs and ≥3 numeric columns for Pearson r',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 4 || ctx.numericColumnCount < 3) {
        return {
          status: 'unavailable',
          reason: `Unavailable: Needs at least 4 runs to compute pairwise Pearson correlation (${ctx.activeRuns.length} in active scope).`,
          missingRequirement: '≥4 Runs & ≥3 Numeric Columns',
        };
      }
      return ctx.activeRuns.length >= 8
        ? {
            status: 'recommended',
            reason: `Recommended: Quantifies pairwise parameter correlations across ${ctx.activeRuns.length} runs.`,
          }
        : {
            status: 'available',
            reason: `Available: Computes 6×6 Pearson r grid across ${ctx.activeRuns.length} runs.`,
          };
    },
  },
  {
    id: 'heatmap-matrix',
    name: 'Normalized Matrix Heatmap',
    shortName: 'Matrix Heatmap',
    familyId: 'relationships',
    familyLabel: 'Relationships & Multi-Variable',
    description:
      'Row × column normalized intensity table comparing 6 physical telemetry variables across active records.',
    keywords: ['heatmap', 'matrix', 'table', 'normalized', 'intensity', 'multi-variable'],
    requirementsSummary: 'Requires ≥2 active runs and ≥3 numeric columns',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 2 || ctx.numericColumnCount < 3) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Select 2 or more runs to build a normalized matrix heatmap.',
          missingRequirement: '≥2 Runs & ≥3 Numeric Columns',
        };
      }
      return ctx.activeRuns.length >= 4
        ? {
            status: 'recommended',
            reason: `Recommended: High-density Run × Parameter matrix for ${ctx.activeRuns.length} runs.`,
          }
        : {
            status: 'available',
            reason: `Available: Normalized parameter matrix across ${ctx.activeRuns.length} runs.`,
          };
    },
  },
  {
    id: 'residual-deviation',
    name: 'Residual Spread Deviation Plot',
    shortName: 'Residual Plot',
    familyId: 'relationships',
    familyLabel: 'Relationships & Multi-Variable',
    description:
      'Model-vs-observed residual plot displaying signed error between empirical archive runs and physics predictions.',
    keywords: ['residual', 'error', 'deviation', 'model fit', 'validation', 'calibration'],
    requirementsSummary: 'Requires ≥3 records to evaluate model residuals',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 3) {
        return {
          status: 'unavailable',
          reason: `Unavailable: Needs at least 3 runs to evaluate model residuals (${ctx.activeRuns.length} active).`,
          missingRequirement: '≥3 Active Runs',
        };
      }
      return {
        status: ctx.activeRuns.length >= 8 ? 'recommended' : 'available',
        reason: `Evaluates physics model error distribution across ${ctx.activeRuns.length} archive records.`,
      };
    },
  },

  // 5. TIME & SEQUENTIAL PROGRESSION
  {
    id: 'sensor-timeline',
    name: 'Dual-Axis Sensor Line Chart',
    shortName: 'Sensor Line',
    familyId: 'time-series',
    familyLabel: 'Time & Sequential Progression',
    description:
      '0–120s sequential sensor curves tracking gas temperature, IR radiometer flux, and optical visibility.',
    keywords: ['line chart', 'dual-axis', 'timeline', 'sensor', 'time series'],
    requirementsSummary: 'Requires sequential 0–120s time-series sensor stream',
    evaluateCompatibility: (ctx) =>
      ctx.hasTimeSeries
        ? {
            status: 'recommended',
            reason: 'Recommended: Tracks synchronized thermal, IR, and optical time series.',
          }
        : {
            status: 'unavailable',
            reason: 'Unavailable: Requires sequential time-series data (disabled in Static Snapshot / Material scopes).',
            missingRequirement: 'Sequential Time-Series Data',
          },
  },
  {
    id: 'multi-series-line',
    name: 'Multi-Series Line Chart',
    shortName: 'Multi-Series Line',
    familyId: 'time-series',
    familyLabel: 'Time & Sequential Progression',
    description:
      'Multi-run 0–120s sequential curves overlaying multiple records against the active modeled state.',
    keywords: ['multi-series', 'line chart', 'trajectory', 'time series', 'compare'],
    requirementsSummary: 'Requires sequential time-series data and ≥2 active runs',
    evaluateCompatibility: (ctx) => {
      if (!ctx.hasTimeSeries) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Requires sequential time-series data.',
          missingRequirement: 'Sequential Time-Series Data',
        };
      }
      if (ctx.activeRuns.length < 2) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Select 2 or more runs to overlay multi-series trajectories.',
          missingRequirement: '≥2 Active Runs',
        };
      }
      return ctx.activeRuns.length <= 6
        ? {
            status: 'recommended',
            reason: `Recommended: Overlays sequential trajectories across ${ctx.activeRuns.length} runs.`,
          }
        : {
            status: 'available',
            reason: 'Available: Overlays representative run trajectories against active test.',
          };
    },
  },
  {
    id: 'area-chart',
    name: 'Area Progression Chart',
    shortName: 'Area Chart',
    familyId: 'time-series',
    familyLabel: 'Time & Sequential Progression',
    description:
      'Dual-axis filled area progression tracking cumulative radiative IR flux and gas evolution over 0–120s.',
    keywords: ['area chart', 'progression', 'accumulation', 'time series'],
    requirementsSummary: 'Requires sequential 0–120s time-series telemetry',
    evaluateCompatibility: (ctx) =>
      ctx.hasTimeSeries
        ? {
            status: 'available',
            reason: 'Available: Tracks continuous flux and emission envelopes over 120s.',
          }
        : {
            status: 'unavailable',
            reason: 'Unavailable: Requires sequential time-series data.',
            missingRequirement: 'Sequential Time-Series Data',
          },
  },
  {
    id: 'stacked-area',
    name: 'Stacked Area Chart',
    shortName: 'Stacked Area',
    familyId: 'time-series',
    familyLabel: 'Time & Sequential Progression',
    description:
      'Part-to-whole stacked normalized progression of thermal, radiative, and toxic gas channels over duration.',
    keywords: ['stacked area', 'cumulative', 'time series', 'proportion'],
    requirementsSummary: 'Requires sequential 0–120s time-series telemetry',
    evaluateCompatibility: (ctx) =>
      ctx.hasTimeSeries
        ? {
            status: 'available',
            reason: 'Available: Visualizes stacked normalized channel proportions over 0–120s.',
          }
        : {
            status: 'unavailable',
            reason: 'Unavailable: Requires sequential time-series data.',
            missingRequirement: 'Sequential Time-Series Data',
          },
  },
  {
    id: 'step-chart',
    name: 'Step Transition Chart',
    shortName: 'Step Chart',
    familyId: 'time-series',
    familyLabel: 'Time & Sequential Progression',
    description:
      'Discrete step-after progression isolating regime state jumps across burn duration.',
    keywords: ['step chart', 'step', 'state transition', 'discrete', 'time series'],
    requirementsSummary: 'Requires sequential 0–120s time-series state transitions',
    evaluateCompatibility: (ctx) =>
      ctx.hasTimeSeries
        ? {
            status: 'available',
            reason: 'Available: Captures discrete regime step transitions and plateaus.',
          }
        : {
            status: 'unavailable',
            reason: 'Unavailable: Requires sequential time-series data.',
            missingRequirement: 'Sequential Time-Series Data',
          },
  },
  {
    id: 'timeline-progression',
    name: 'Forecast Progression Chart',
    shortName: 'Forecast Chart',
    familyId: 'time-series',
    familyLabel: 'Time & Sequential Progression',
    description:
      '10-second growth forecast plotting expanding flame radius alongside modeled cabin pressure delta.',
    keywords: ['progression', 'forecast', '10s', 'growth', 'line', 'area'],
    requirementsSummary: 'Requires active time-stepped forecast stream',
    evaluateCompatibility: (ctx) =>
      ctx.hasTimeSeries
        ? {
            status: 'available',
            reason: 'Available: Projects 0–10s forward radius and pressure delta curves.',
          }
        : {
            status: 'unavailable',
            reason: 'Unavailable: Requires sequential time-series forecast stream.',
            missingRequirement: 'Sequential Time-Series Data',
          },
  },
];

export function buildDatasetContext(
  scope: DatasetScope,
  selectedRuns: PsiRun[],
  catalogRuns: PsiRun[],
  simulation: SimulationResponse
): VizDatasetContext {
  let activeRuns: PsiRun[];
  let hasTimeSeries = simulation.timelineSeries.length > 0;
  let has2DGrid = true;
  let hasMaterialMetrics = simulation.materialRankings.length > 0;

  if (scope === 'full-archive') {
    activeRuns = catalogRuns;
  } else if (scope === 'single-focus') {
    activeRuns =
      selectedRuns.length > 0 ? [selectedRuns[0]] : catalogRuns.slice(0, 1);
  } else if (scope === 'static-runs') {
    activeRuns = selectedRuns.length > 0 ? selectedRuns : catalogRuns.slice(0, 3);
    hasTimeSeries = false;
  } else if (scope === 'virtual-lab-output') {
    activeRuns = simulation.nearestRuns.map((n) => n.run);
  } else if (scope === 'material-qualification') {
    activeRuns = simulation.materialRankings.map((m, idx) => ({
      id: `mat-${m.code.toLowerCase()}`,
      psiId: m.code,
      investigationTitle: `${m.name} Qualification Profile`,
      runCode: `MAT-${idx + 1}`,
      facility: idx % 2 === 0 ? 'CIR' : 'MSG',
      material: m.name,
      O2_pct: m.limitingO2_pct,
      P_psi: 14.7,
      Flow_ms: 0.12,
      g_eff: 0.166,
      Thickness_mm: simulation.safeMaterialCheck.minSafeThickness_mm,
      flameSpread_mms: m.flameSpread_mms,
      peakTemp_K: Math.round(700 + m.flameSpreadIndex * 10),
      radiometerFlux_Wm2: Math.round(4000 + m.coolFlameRiskIndex * 140),
      coolFlameObserved: m.coolFlameRiskIndex >= 65,
      outcome: m.status,
      notes: `Material qualification row (LOI ${m.limitingO2_pct.toFixed(1)}% O2)`,
    }));
    hasTimeSeries = false;
    has2DGrid = false;
  } else if (scope === 'imported-custom') {
    activeRuns = catalogRuns.filter((r) => Boolean(r.isCustom));
    hasTimeSeries = false;
    has2DGrid = activeRuns.length > 0;
    hasMaterialMetrics = false;
  } else {
    // 'selected-sim' or 'selected-comparison'
    activeRuns = selectedRuns;
  }

  return {
    scope,
    activeRuns,
    selectedRuns,
    catalogRuns,
    numericColumnCount: 8,
    hasTimeSeries,
    has2DGrid,
    hasMaterialMetrics,
    hasCustomImports: catalogRuns.some((r) => Boolean(r.isCustom)),
  };
}

export interface EvaluatedVizTechnique {
  definition: VizTechniqueDefinition;
  compatibility: VizCompatibilityResult;
}

export function evaluateAllTechniques(
  ctx: VizDatasetContext
): EvaluatedVizTechnique[] {
  return VIZ_TECHNIQUE_REGISTRY.map((definition) => ({
    definition,
    compatibility: definition.evaluateCompatibility(ctx),
  }));
}

export function filterTechniques(
  evaluated: EvaluatedVizTechnique[],
  opts: {
    searchQuery: string;
    statusFilter: 'all' | 'recommended' | 'available' | 'unavailable';
    familyFilter: VizFamilyId | 'all';
  }
): EvaluatedVizTechnique[] {
  const q = opts.searchQuery.trim().toLowerCase();

  return evaluated.filter(({ definition, compatibility }) => {
    if (opts.familyFilter !== 'all' && definition.familyId !== opts.familyFilter) {
      return false;
    }

    if (
      opts.statusFilter === 'recommended' &&
      compatibility.status !== 'recommended'
    ) {
      return false;
    }
    if (
      opts.statusFilter === 'available' &&
      compatibility.status === 'unavailable'
    ) {
      return false;
    }
    if (
      opts.statusFilter === 'unavailable' &&
      compatibility.status !== 'unavailable'
    ) {
      return false;
    }

    if (!q) return true;

    const haystack = [
      definition.name,
      definition.shortName,
      definition.familyLabel,
      definition.description,
      definition.requirementsSummary,
      compatibility.reason,
      ...definition.keywords,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}

export function getTechniqueHeadline(
  vizMode: VizMode,
  simulation: SimulationResponse,
  sliders: {
    O2_pct: number;
    P_psi: number;
    Flow_ms: number;
    g_eff: number;
    Thickness_mm: number;
  },
  activeRuns: PsiRun[],
  axes?: { xAxisLabel?: string; yAxisLabel?: string; colorByLabel?: string }
): string {
  const axisSuffix =
    axes?.xAxisLabel && axes?.yAxisLabel
      ? ` [${axes.xAxisLabel} vs. ${axes.yAxisLabel}${
          axes.colorByLabel ? ` · Grouped by ${axes.colorByLabel}` : ''
        }]`
      : '';

  if (!axes?.xAxisLabel && (simulation.headlineTakeaway as Record<string, string>)[vizMode]) {
    return (simulation.headlineTakeaway as Record<string, string>)[vizMode];
  }

  const avgSpread =
    activeRuns.length > 0
      ? activeRuns.reduce((acc, r) => acc + r.flameSpread_mms, 0) /
        activeRuns.length
      : simulation.flameSpread_mms;
  const maxRun = [...activeRuns].sort(
    (a, b) => b.flameSpread_mms - a.flameSpread_mms
  )[0];

  switch (vizMode) {
    case 'safety-map':
      return `2D Regime Heatmap${axisSuffix}: Virtual state yields ${simulation.flameSpread_mms.toFixed(2)} mm/s (${simulation.hazardStatus}) across ${activeRuns.length} mapped dataset points.`;
    case 'contour-surface':
      return `Contour Density Map${axisSuffix}: Minimum safe quenching thickness ≥ ${simulation.safeMaterialCheck.minSafeThickness_mm.toFixed(1)} mm (${sliders.Thickness_mm.toFixed(1)} mm active: ${simulation.safeMaterialCheck.passed ? 'PASS' : 'FAIL'}).`;
    case 'grouped-bar':
      return `Grouped Bar Chart${axisSuffix}: Comparing ${activeRuns.length} records against virtual state (${simulation.flameSpread_mms.toFixed(2)} mm/s at ${sliders.O2_pct.toFixed(1)}% O₂).`;
    case 'stacked-bar':
      return `Stacked Bar Chart: Combined hazard score across 5 spacecraft materials at ${sliders.O2_pct.toFixed(1)}% O₂ and ${sliders.P_psi.toFixed(1)} psi.`;
    case 'horizontal-ranked-bar':
      return maxRun
        ? `Horizontal Ranked Bar Chart${axisSuffix}: ${maxRun.psiId} peaks at ${maxRun.flameSpread_mms.toFixed(2)} mm/s vs. your virtual test (${simulation.flameSpread_mms.toFixed(2)} mm/s).`
        : `Horizontal Ranked Bar Chart: Current flame speed is ${simulation.flameSpread_mms.toFixed(2)} mm/s against 0.48 mm/s self-extinguishing limit.`;
    case 'lollipop-dot':
      return `Cleveland Lollipop Plot${axisSuffix}: Difference compared to current test speed (${simulation.flameSpread_mms.toFixed(2)} mm/s; dataset average ${avgSpread.toFixed(2)} mm/s).`;
    case 'histogram':
      return `Distribution Histogram${axisSuffix}: How values cluster across n = ${activeRuns.length} runs relative to current test settings.`;
    case 'frequency-distribution':
      return `Frequency Distribution Bars: Count of runs in each category across n = ${activeRuns.length} runs grouped by ${axes?.colorByLabel ?? 'Fire Safety Result'}.`;
    case 'range-interval-bar':
      return `Confidence Interval Range Plot: Current test carries ±${simulation.confidenceInterval_mms.toFixed(2)} mm/s uncertainty around ${simulation.peakTemp_K} K peak temperature.`;
    case 'box-quartile':
      return `Box & Quartile Distribution: Range summary (Min, Q1, Median, Q3, Max) over n = ${activeRuns.length} runs.`;
    case 'density-strip':
      return `Bivariate Density Strip Plot${axisSuffix}: Individual spread of points per category across n = ${activeRuns.length} runs.`;
    case 'scatter-plot':
      return `Multi-Axis Scatter Plot${axisSuffix}: Comparing n = ${activeRuns.length} test runs alongside your current virtual test (${simulation.flameSpread_mms.toFixed(2)} mm/s).`;
    case 'bubble-plot':
      return `Bubble Multi-Metric Plot${axisSuffix}: Maps X and Y columns, heat glow size (bubble area), and group across n = ${activeRuns.length} runs.`;
    case 'correlation-matrix':
      return `Correlation Matrix: Shows which measurements rise and fall together across n = ${activeRuns.length} runs.`;
    case 'heatmap-matrix':
      return `Matrix Heatmap: Color grid comparing columns across ${activeRuns.length} runs and current virtual test.`;
    case 'residual-deviation':
      return `Prediction Error Plot${axisSuffix}: Shows difference between real spaceflight test runs and model predictions.`;
    case 'sensor-timeline':
      return `Dual-Axis Sensor Line Chart: Synchronized 0–120s temperature (K), heat glow (W/m²), and visibility (%) curves.`;
    case 'multi-series-line':
      return `Multi-Series Line Chart: Overlays 0–120s burn temperature curves across ${activeRuns.length} selected runs.`;
    case 'area-chart':
      return `Area Progression Chart: Tracks cumulative 0–120s heat radiation and CO smoke emission.`;
    case 'stacked-area':
      return `Stacked Area Chart: Relative share of heat, radiation, and CO gas load over 0–120s.`;
    case 'step-chart':
      return `Step Transition Chart: Stage shifts (Ignition → Hot Flame → 550K–800K Cool Flame → Quench).`;
    case 'timeline-progression':
      return `Forecast Progression Chart: 10s growth forecast reaches ${simulation.forecast10s.radius_mm.toFixed(1)} mm radius and +${simulation.forecast10s.pressureRise_kPa.toFixed(2)} kPa cabin pressure.`;
    case 'polar-radial':
      return `Polar Radial Profile: Scaled radial comparison (note radial area distorts proportions; Parallel Coordinates gives stricter reading).`;
    case 'multi-variable':
      return `Parallel Coordinates: Multi-column overlay across ${activeRuns.length} test runs and current virtual setup.`;
    case 'material-safety':
      return `Bullet Target Chart: Checks 5 spacecraft materials against oxygen, smoke, toxic gas, and cool-flame limits.`;
    default:
      return `Active model predicts ${simulation.flameSpread_mms.toFixed(2)} mm/s flame spread (${simulation.hazardStatus}).`;
  }
}
