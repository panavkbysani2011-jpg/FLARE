import {
  DatasetScope,
  PsiRun,
  SimulationResponse,
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

export const VIZ_FAMILIES: VizFamilyMeta[] = [
  {
    id: 'comparisons',
    label: 'Comparisons & Rankings',
    shortLabel: 'Comparisons',
    description: 'Side-by-side run metrics, stacked hazard loads, ranks, targets, and multi-axis profiles',
  },
  {
    id: 'distributions',
    label: 'Distributions & Ranges',
    shortLabel: 'Distributions',
    description: 'Binned histograms, regime/facility frequencies, confidence spans, and quartile summaries',
  },
  {
    id: 'relationships',
    label: 'Relationships & Multi-Variable',
    shortLabel: 'Relationships',
    description: 'Bivariate scatter, 4D bubble projections, Pearson correlation grids, and normalized matrices',
  },
  {
    id: 'time-series',
    label: 'Time & Sequential Progression',
    shortLabel: 'Time & Sequence',
    description: '0–120s sensor timelines, multi-run curves, stacked emission areas, and 10s forecasts',
  },
  {
    id: 'spatial-regime',
    label: 'Spatial, Regime & Multi-Dimensional',
    shortLabel: 'Regime & Spatial',
    description: '2D O₂/airflow maps, pressure-thickness quenching contours, and radial profiles',
  },
];

export const VIZ_TECHNIQUE_REGISTRY: VizTechniqueDefinition[] = [
  // 1. SPATIAL, REGIME & MULTI-DIMENSIONAL
  {
    id: 'safety-map',
    name: 'Oxygen vs. Airflow Safety Regime Map',
    shortName: 'O₂ vs. Airflow Map',
    familyId: 'spatial-regime',
    familyLabel: 'Spatial, Regime & Multi-Dimensional',
    description: 'Interactive 2D O₂ % × Airflow (m/s) boundary-layer heatmap with 0.05–0.20 m/s replenishment zone and archive markers.',
    keywords: ['heatmap', 'grid', 'safety map', 'oxygen', 'airflow', 'regime', '2d', 'spatial', 'interactive'],
    requirementsSummary: 'Requires 2D O₂ × Airflow boundary-layer parameter grid',
    evaluateCompatibility: (ctx) =>
      ctx.has2DGrid
        ? {
            status: 'recommended',
            reason: 'Recommended: Best match for 2D boundary-layer O₂ vs. airflow safety mapping.',
          }
        : {
            status: 'unavailable',
            reason: 'Unavailable: Requires 2D O₂ × Airflow parameter grid.',
            missingRequirement: '2D Parameter Grid',
          },
  },
  {
    id: 'contour-surface',
    name: 'Pressure vs. Thickness Quenching Contour',
    shortName: 'P vs. δ Contour',
    familyId: 'spatial-regime',
    familyLabel: 'Spatial, Regime & Multi-Dimensional',
    description: '2D Cabin Pressure (psi) × Substrate Thickness (mm) contour heatmap identifying the conductive quenching boundary.',
    keywords: ['contour', 'surface', 'heatmap', 'pressure', 'thickness', 'quenching', '2d'],
    requirementsSummary: 'Requires 2D Pressure × Thickness physics sweep grid',
    evaluateCompatibility: (ctx) => {
      if (!ctx.has2DGrid) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Requires 2D Pressure × Thickness physics sweep grid.',
          missingRequirement: '2D Parameter Grid',
        };
      }
      return ctx.activeRuns.length >= 4
        ? {
            status: 'recommended',
            reason: 'Recommended: Maps conductive quenching contours alongside active archive runs.',
          }
        : {
            status: 'available',
            reason: 'Available: Renders Pressure vs. Thickness quenching surface at current O₂ and airflow.',
          };
    },
  },
  {
    id: 'polar-radial',
    name: 'Polar / Radial Multi-Parameter Profile',
    shortName: 'Polar Profile',
    familyId: 'spatial-regime',
    familyLabel: 'Spatial, Regime & Multi-Dimensional',
    description: 'Radial polygon comparing normalized 6-axis cabin telemetry against active runs.',
    keywords: ['polar', 'radial', 'radar', 'spider', 'multi-dimensional', 'envelope'],
    requirementsSummary: 'Requires ≥1 run and ≥4 numeric dimensions (includes analytical distortion caveat)',
    caveatNote:
      'Analytical Caveat: Radial polygon area scales quadratically with radius and depends on axis ordering. Prefer Parallel Coordinates or Bullet Bars for strict quantitative reading.',
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
        reason: 'Available: Polar radial profile ready (see area-distortion caveat before quantitative inference).',
      };
    },
  },

  // 2. COMPARISONS & RANKINGS
  {
    id: 'multi-variable',
    name: 'Parallel Coordinates / Multi-Axis Profiles',
    shortName: 'Parallel Axes',
    familyId: 'comparisons',
    familyLabel: 'Comparisons & Rankings',
    description: 'Overlays selected PSI runs and active simulation across 5 normalized combustion telemetry axes.',
    keywords: ['parallel coordinates', 'multi-variable', 'multi-axis', 'profile', 'compare', 'trajectory'],
    requirementsSummary: 'Requires ≥2 active runs to compare across 5 telemetry axes',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 2) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Select 2 or more runs to compare across axes.',
          missingRequirement: '≥2 Active Runs',
        };
      }
      return ctx.activeRuns.length <= 6
        ? {
            status: 'recommended',
            reason: `Recommended: Ideal multi-axis profile density for ${ctx.activeRuns.length} active runs + simulator.`,
          }
        : {
            status: 'available',
            reason: `Available: Overlays ${ctx.activeRuns.length} active runs across 5 normalized telemetry axes.`,
          };
    },
  },
  {
    id: 'material-safety',
    name: 'Bullet / Target Comparison Bars (Material Safety)',
    shortName: 'Material Bullet Bars',
    familyId: 'comparisons',
    familyLabel: 'Comparisons & Rankings',
    description: '4-panel horizontal bullet target bars + sortable qualification matrix evaluating PMMA, SIBAL, PTFE, and Nomex.',
    keywords: ['bullet', 'target', 'material', 'loi', 'smoke', 'cool flame', 'quench', 'matrix'],
    requirementsSummary: 'Requires spacecraft substrate material metrics & cabin LOI thresholds',
    evaluateCompatibility: (ctx) =>
      ctx.hasMaterialMetrics
        ? {
            status: 'recommended',
            reason: 'Recommended: Bullet target bars compare 5 spacecraft materials against active cabin limits.',
          }
        : {
            status: 'unavailable',
            reason: 'Unavailable: Requires candidate substrate material metrics.',
            missingRequirement: 'Material Metrics',
          },
  },
  {
    id: 'grouped-bar',
    name: 'Grouped Bar Comparison',
    shortName: 'Grouped Bars',
    familyId: 'comparisons',
    familyLabel: 'Comparisons & Rankings',
    description: 'Side-by-side grouped bars comparing O₂ %, Pressure (psi), and Flame Spread across runs.',
    keywords: ['grouped bar', 'bar chart', 'comparison', 'oxygen', 'pressure', 'flame spread'],
    requirementsSummary: 'Requires ≥2 active runs for side-by-side grouped bar comparison',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 2) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Select 2 or more runs to compare side-by-side grouped bars.',
          missingRequirement: '≥2 Active Runs',
        };
      }
      return ctx.activeRuns.length <= 8
        ? {
            status: 'recommended',
            reason: `Recommended: Clear side-by-side grouped comparison across ${ctx.activeRuns.length} runs + simulator.`,
          }
        : {
            status: 'available',
            reason: `Available: Compares top runs and active simulation across grouped telemetry bars.`,
          };
    },
  },
  {
    id: 'stacked-bar',
    name: 'Stacked Hazard Load Bar Chart',
    shortName: 'Stacked Bars',
    familyId: 'comparisons',
    familyLabel: 'Comparisons & Rankings',
    description: 'Decomposes composite fire-risk index (Spread, Smoke Clumping, Toxic Gas, Cool-Flame Risk) across substrates.',
    keywords: ['stacked bar', 'composite', 'material', 'smoke', 'toxic', 'hazard', 'breakdown'],
    requirementsSummary: 'Requires candidate material risk indices or ≥2 active runs',
    evaluateCompatibility: (ctx) => {
      if (!ctx.hasMaterialMetrics && ctx.activeRuns.length < 2) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Requires material metrics or at least 2 active runs.',
          missingRequirement: 'Material Metrics or ≥2 Runs',
        };
      }
      return {
        status: 'available',
        reason: 'Available: Breaks down multi-factor fire hazard loads across candidate materials.',
      };
    },
  },
  {
    id: 'horizontal-ranked-bar',
    name: 'Horizontal Ranked Spread Bars',
    shortName: 'Ranked Bars',
    familyId: 'comparisons',
    familyLabel: 'Comparisons & Rankings',
    description: 'Ranks active PSI runs and simulator state from highest to lowest flame spread against the 0.48 mm/s quench threshold.',
    keywords: ['horizontal', 'ranked', 'ranking', 'bar', 'leaderboard', 'sort', 'threshold'],
    requirementsSummary: 'Requires ≥1 active run with numeric flame spread velocity',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 1) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Requires at least 1 active run to rank.',
          missingRequirement: '≥1 Active Run',
        };
      }
      return ctx.activeRuns.length >= 4
        ? {
            status: 'recommended',
            reason: `Recommended: Ranks ${ctx.activeRuns.length} active runs + simulation against 0.48 mm/s quench bound.`,
          }
        : {
            status: 'available',
            reason: `Available: Ranks ${ctx.activeRuns.length} selected runs + active simulation by flame spread rate.`,
          };
    },
  },
  {
    id: 'lollipop-dot',
    name: 'Lollipop / Dot Delta Comparison',
    shortName: 'Lollipop Dots',
    familyId: 'comparisons',
    familyLabel: 'Comparisons & Rankings',
    description: 'High-precision Cleveland lollipop plot showing run deviations relative to the active simulator baseline.',
    keywords: ['lollipop', 'dot plot', 'cleveland', 'delta', 'comparison', 'baseline'],
    requirementsSummary: 'Requires ≥2 active runs to compare telemetry deltas',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 2) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Select 2 or more runs to compare baseline deltas.',
          missingRequirement: '≥2 Active Runs',
        };
      }
      return {
        status: 'available',
        reason: `Available: Visualizes parameter deltas across ${ctx.activeRuns.length} runs vs. simulator.`,
      };
    },
  },

  // 3. DISTRIBUTIONS & RANGES
  {
    id: 'histogram',
    name: 'Telemetry Distribution Histogram',
    shortName: 'Histogram',
    familyId: 'distributions',
    familyLabel: 'Distributions & Ranges',
    description: 'Binned frequency histogram of Flame Spread, O₂ %, Peak Temp, or Airflow across the active dataset.',
    keywords: ['histogram', 'bins', 'distribution', 'density', 'spread', 'frequency'],
    requirementsSummary: 'Needs at least 4 numeric samples for meaningful distribution bins',
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
            reason: `Recommended: Reveals distribution clustering across ${ctx.activeRuns.length} archive runs.`,
          }
        : {
            status: 'available',
            reason: `Available: Bins ${ctx.activeRuns.length} active numeric samples into intervals.`,
          };
    },
  },
  {
    id: 'frequency-distribution',
    name: 'Regime & Facility Frequency Bars',
    shortName: 'Frequency Bars',
    familyId: 'distributions',
    familyLabel: 'Distributions & Ranges',
    description: 'Categorical frequency distribution of Hazard Outcomes and Orbital Hardware Facilities (CIR, MSG, Cygnus).',
    keywords: ['frequency', 'categorical', 'count', 'regime', 'facility', 'distribution'],
    requirementsSummary: 'Needs at least 3 runs to summarize categorical frequency counts',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 3) {
        return {
          status: 'unavailable',
          reason: `Unavailable: Needs at least 3 runs to summarize outcome and facility frequencies (${ctx.activeRuns.length} active).`,
          missingRequirement: '≥3 Active Runs',
        };
      }
      return ctx.activeRuns.length >= 10
        ? {
            status: 'recommended',
            reason: `Recommended: Summarizes hazard regime and facility counts across ${ctx.activeRuns.length} runs.`,
          }
        : {
            status: 'available',
            reason: `Available: Displays regime and facility frequency bars for ${ctx.activeRuns.length} active runs.`,
          };
    },
  },
  {
    id: 'range-interval-bar',
    name: 'Range & Uncertainty Interval Bars',
    shortName: 'Range / 95% CI',
    familyId: 'distributions',
    familyLabel: 'Distributions & Ranges',
    description: 'Displays flame spread ±95% confidence bounds and thermal cool-flame (550K–800K) operating intervals.',
    keywords: ['range', 'interval', 'confidence', 'ci', 'error bar', 'span', 'temperature'],
    requirementsSummary: 'Requires ≥1 active run with numeric telemetry bounds',
    evaluateCompatibility: (ctx) =>
      ctx.activeRuns.length < 1
        ? {
            status: 'unavailable',
            reason: 'Unavailable: Requires at least 1 active run to plot confidence intervals.',
            missingRequirement: '≥1 Active Run',
          }
        : {
            status: 'available',
            reason: 'Available: Plots spread ±95% confidence intervals and peak temperature spans.',
          },
  },
  {
    id: 'box-quartile',
    name: 'Box & Quartile Summary Plot',
    shortName: 'Box / Quartile',
    familyId: 'distributions',
    familyLabel: 'Distributions & Ranges',
    description: '5-number summary (Min, Q1, Median, Q3, Max) with jittered sample points across combustion parameters.',
    keywords: ['box plot', 'quartile', 'iqr', 'median', 'whisker', 'distribution', 'outliers'],
    requirementsSummary: 'Needs at least 5 numeric samples to compute robust quartiles (Q1–Q3)',
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

  // 4. RELATIONSHIPS & MULTI-VARIABLE VIEWS
  {
    id: 'scatter-plot',
    name: 'Bivariate Parameter Scatter Plot',
    shortName: 'Scatter Plot',
    familyId: 'relationships',
    familyLabel: 'Relationships & Multi-Variable',
    description: 'Interactive X/Y scatter plot with configurable physical axes (O₂, Pressure, Airflow, Thickness, Spread, Temp).',
    keywords: ['scatter', 'xy', 'bivariate', 'relationship', 'correlation', 'regression'],
    requirementsSummary: 'Requires ≥2 active runs and ≥2 numeric columns',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 2 || ctx.numericColumnCount < 2) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Select 2 or more runs with at least 2 numeric columns for scatter analysis.',
          missingRequirement: '≥2 Runs & ≥2 Numeric Columns',
        };
      }
      return ctx.activeRuns.length >= 6
        ? {
            status: 'recommended',
            reason: `Recommended: Explores bivariate trends across ${ctx.activeRuns.length} runs + simulator marker.`,
          }
        : {
            status: 'available',
            reason: `Available: Plots configurable X/Y telemetry for ${ctx.activeRuns.length} active runs.`,
          };
    },
  },
  {
    id: 'bubble-plot',
    name: '4-Variable Radiative Bubble Plot',
    shortName: 'Bubble Plot',
    familyId: 'relationships',
    familyLabel: 'Relationships & Multi-Variable',
    description: 'Encodes O₂ % (X), Airflow m/s (Y), IR Radiometer Flux W/m² (radius), and Hazard Outcome (color).',
    keywords: ['bubble', '4d', 'multi-variable', 'ir flux', 'oxygen', 'airflow', 'scatter'],
    requirementsSummary: 'Requires ≥2 active runs and ≥3 numeric dimensions (X, Y, Z radius)',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 2 || ctx.numericColumnCount < 3) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Requires at least 2 runs and 3 numeric variables (X, Y, and flux radius).',
          missingRequirement: '≥2 Runs & ≥3 Numeric Columns',
        };
      }
      return ctx.activeRuns.length >= 4
        ? {
            status: 'recommended',
            reason: 'Recommended: Projects O₂, Airflow, IR Flux, and Hazard Outcome simultaneously.',
          }
        : {
            status: 'available',
            reason: 'Available: Renders 4-variable radiative bubble view on active selection.',
          };
    },
  },
  {
    id: 'correlation-matrix',
    name: 'Pairwise Pearson Correlation Matrix',
    shortName: 'Correlation Matrix',
    familyId: 'relationships',
    familyLabel: 'Relationships & Multi-Variable',
    description: '6×6 symmetric Pearson r correlation grid across O₂, Pressure, Airflow, Thickness, Temp, and Spread.',
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
    name: 'Run × Parameter Normalized Heatmap',
    shortName: 'Heatmap Matrix',
    familyId: 'relationships',
    familyLabel: 'Relationships & Multi-Variable',
    description: 'Tabular intensity matrix normalizing 6 physical telemetry variables per run alongside the active simulation.',
    keywords: ['heatmap', 'matrix', 'table', 'normalized', 'intensity', 'multi-variable'],
    requirementsSummary: 'Requires ≥2 active runs and ≥3 numeric columns',
    evaluateCompatibility: (ctx) => {
      if (ctx.activeRuns.length < 2 || ctx.numericColumnCount < 3) {
        return {
          status: 'unavailable',
          reason: 'Unavailable: Select 2 or more runs to build a normalized parameter heatmap.',
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
            reason: `Available: Normalized parameter intensity matrix across ${ctx.activeRuns.length} active runs.`,
          };
    },
  },

  // 5. TIME & SEQUENTIAL PROGRESSION
  {
    id: 'sensor-timeline',
    name: 'Temperature & Sensor Line Timeline',
    shortName: 'Sensor Timeline',
    familyId: 'time-series',
    familyLabel: 'Time & Sequential Progression',
    description: '0–120s multi-sensor timeline tracking Gas Temp (K), IR Flux (W/m²), and Visible Emission (%) across cool-flame zones.',
    keywords: ['line chart', 'timeline', 'sensor', 'temperature', 'ir flux', 'cool flame', 'time series'],
    requirementsSummary: 'Requires sequential 0–120s time-series sensor stream',
    evaluateCompatibility: (ctx) =>
      ctx.hasTimeSeries
        ? {
            status: 'recommended',
            reason: 'Recommended: Best view for tracking 550K–800K non-luminous cool-flame sensor divergence.',
          }
        : {
            status: 'unavailable',
            reason: 'Unavailable: Requires sequential time-series data (disabled in Static Archive Snapshot scope).',
            missingRequirement: 'Sequential Time-Series Data',
          },
  },
  {
    id: 'multi-series-line',
    name: 'Multi-Run Thermal Trajectory Line Chart',
    shortName: 'Multi-Series Line',
    familyId: 'time-series',
    familyLabel: 'Time & Sequential Progression',
    description: 'Overlays simulated 0–120s gas temperature trajectories for each active PSI run alongside the current simulation.',
    keywords: ['multi-series', 'line chart', 'burn curve', 'trajectory', 'time series', 'compare'],
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
          reason: 'Unavailable: Select 2 or more runs to overlay multi-run burn trajectories.',
          missingRequirement: '≥2 Active Runs',
        };
      }
      return ctx.activeRuns.length <= 6
        ? {
            status: 'recommended',
            reason: `Recommended: Compares 0–120s thermal evolution across ${ctx.activeRuns.length} active runs.`,
          }
        : {
            status: 'available',
            reason: 'Available: Overlays representative run thermal curves against active simulation.',
          };
    },
  },
  {
    id: 'area-chart',
    name: 'Radiative Flux & CO Accumulation Area Chart',
    shortName: 'Area Chart',
    familyId: 'time-series',
    familyLabel: 'Time & Sequential Progression',
    description: 'Filled area progression of IR Radiometer Flux (W/m²) and Carbon Monoxide yield (ppm) over 0–120s.',
    keywords: ['area chart', 'ir flux', 'co yield', 'radiation', 'time series', 'accumulation'],
    requirementsSummary: 'Requires sequential 0–120s time-series telemetry',
    evaluateCompatibility: (ctx) =>
      ctx.hasTimeSeries
        ? {
            status: 'available',
            reason: 'Available: Tracks continuous IR flux and CO yield envelopes over 120s burn.',
          }
        : {
            status: 'unavailable',
            reason: 'Unavailable: Requires sequential time-series data.',
            missingRequirement: 'Sequential Time-Series Data',
          },
  },
  {
    id: 'stacked-area',
    name: 'Stacked Thermal & Emission Regime Area',
    shortName: 'Stacked Area',
    familyId: 'time-series',
    familyLabel: 'Time & Sequential Progression',
    description: 'Stacked normalized contributions of Gas Heating, Radiative IR Load, and CO Toxicity across burn duration.',
    keywords: ['stacked area', 'cumulative', 'thermal', 'emission', 'co', 'time series'],
    requirementsSummary: 'Requires sequential 0–120s time-series telemetry',
    evaluateCompatibility: (ctx) =>
      ctx.hasTimeSeries
        ? {
            status: 'available',
            reason: 'Available: Visualizes stacked normalized sensor indices across 0–120s duration.',
          }
        : {
            status: 'unavailable',
            reason: 'Unavailable: Requires sequential time-series data.',
            missingRequirement: 'Sequential Time-Series Data',
          },
  },
  {
    id: 'step-chart',
    name: 'Combustion Regime Transition Step Chart',
    shortName: 'Step Chart',
    familyId: 'time-series',
    familyLabel: 'Time & Sequential Progression',
    description: 'Discrete step-after progression highlighting phase transitions (Ignition → Hot Flame → Cool-Flame NTC → Quench).',
    keywords: ['step chart', 'step', 'regime', 'state', 'transition', 'discrete', 'time series'],
    requirementsSummary: 'Requires sequential 0–120s time-series state transitions',
    evaluateCompatibility: (ctx) =>
      ctx.hasTimeSeries
        ? {
            status: 'available',
            reason: 'Available: Captures discrete combustion state transitions and stepped temperature plateaus.',
          }
        : {
            status: 'unavailable',
            reason: 'Unavailable: Requires sequential time-series data.',
            missingRequirement: 'Sequential Time-Series Data',
          },
  },
  {
    id: 'timeline-progression',
    name: '10-Second Flame Radius & Pressure Forecast',
    shortName: '10s Progression',
    familyId: 'time-series',
    familyLabel: 'Time & Sequential Progression',
    description: 'Second-by-second 0–10s cabin growth projection plotting flame front radius (mm) and cabin pressure rise (kPa).',
    keywords: ['progression', 'forecast', '10s', 'radius', 'pressure rise', 'timeline', 'growth'],
    requirementsSummary: 'Requires active time-stepped 10s growth forecast stream',
    evaluateCompatibility: (ctx) =>
      ctx.hasTimeSeries
        ? {
            status: 'available',
            reason: 'Available: Projects second-by-second flame radius growth and cabin pressure rise over 10s.',
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
    activeRuns = selectedRuns.length > 0 ? [selectedRuns[0]] : catalogRuns.slice(0, 1);
  } else if (scope === 'static-runs') {
    activeRuns = selectedRuns.length > 0 ? selectedRuns : catalogRuns.slice(0, 3);
    hasTimeSeries = false;
  } else {
    activeRuns = selectedRuns;
  }

  return {
    scope,
    activeRuns,
    selectedRuns,
    catalogRuns,
    numericColumnCount: 8, // O2_pct, P_psi, Flow_ms, g_eff, Thickness_mm, flameSpread_mms, peakTemp_K, radiometerFlux_Wm2
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

    if (opts.statusFilter === 'recommended' && compatibility.status !== 'recommended') {
      return false;
    }
    if (
      opts.statusFilter === 'available' &&
      compatibility.status === 'unavailable'
    ) {
      return false;
    }
    if (opts.statusFilter === 'unavailable' && compatibility.status !== 'unavailable') {
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
  activeRuns: PsiRun[]
): string {
  const coreTakeaway = (simulation.headlineTakeaway as Record<string, string>)[vizMode];
  if (coreTakeaway) return coreTakeaway;

  const avgSpread =
    activeRuns.length > 0
      ? activeRuns.reduce((acc, r) => acc + r.flameSpread_mms, 0) / activeRuns.length
      : simulation.flameSpread_mms;
  const maxRun = [...activeRuns].sort((a, b) => b.flameSpread_mms - a.flameSpread_mms)[0];

  switch (vizMode) {
    case 'grouped-bar':
      return `Grouped bar comparison across ${activeRuns.length} active runs vs. simulator (${simulation.flameSpread_mms.toFixed(2)} mm/s at ${sliders.O2_pct.toFixed(1)}% O₂, ${sliders.P_psi.toFixed(1)} psi).`;
    case 'stacked-bar':
      return `Composite hazard index stacks Flame Spread, Smoke Clumping, Toxic Gas Yield, and Cool-Flame Risk for 5 candidate substrates under ${sliders.O2_pct.toFixed(1)}% O₂.`;
    case 'horizontal-ranked-bar':
      return maxRun
        ? `${maxRun.psiId} leads active ranking at ${maxRun.flameSpread_mms.toFixed(2)} mm/s vs. simulator ${simulation.flameSpread_mms.toFixed(2)} mm/s (quench limit: 0.48 mm/s).`
        : `Active simulator flame spread is ${simulation.flameSpread_mms.toFixed(2)} mm/s against the 0.48 mm/s self-extinguishing threshold.`;
    case 'lollipop-dot':
      return `Lollipop delta profile anchors active runs to current simulator prediction (${simulation.flameSpread_mms.toFixed(2)} mm/s, mean archive ${avgSpread.toFixed(2)} mm/s).`;
    case 'histogram':
      return `Distribution histogram bins ${activeRuns.length} numeric samples (mean spread ${avgSpread.toFixed(2)} mm/s) alongside active simulation at ${simulation.flameSpread_mms.toFixed(2)} mm/s.`;
    case 'frequency-distribution':
      return `Categorical frequency breakdown across ${activeRuns.length} active runs highlights regime distribution (Rapid Spread, Cool Flame, Self-Quench) by orbital test facility.`;
    case 'range-interval-bar':
      return `Active simulator carries ±${simulation.confidenceInterval_mms.toFixed(2)} mm/s 95% confidence bounds at ${simulation.peakTemp_K}K peak gas temperature.`;
    case 'box-quartile':
      return `Quartile summary across ${activeRuns.length} samples computes Min, Q1, Median, Q3, and Max dispersion across normalized combustion variables.`;
    case 'scatter-plot':
      return `Bivariate scatter across ${activeRuns.length} runs + active operating point (${sliders.O2_pct.toFixed(1)}% O₂ → ${simulation.flameSpread_mms.toFixed(2)} mm/s) isolates parameter sensitivity.`;
    case 'bubble-plot':
      return `4-variable bubble projection maps O₂ %, Airflow, Radiometer IR Flux (radius), and Hazard Outcome across ${activeRuns.length} runs and current simulation.`;
    case 'correlation-matrix':
      return `Pairwise Pearson r matrix across ${activeRuns.length} runs quantifies linear coupling among O₂ %, Pressure, Airflow, Thickness, Peak Temp, and Flame Spread.`;
    case 'heatmap-matrix':
      return `Normalized Run × Parameter intensity matrix compares ${activeRuns.length} active runs and current simulation (${sliders.O2_pct.toFixed(1)}% O₂, ${sliders.Flow_ms.toFixed(2)} m/s) across 6 telemetry columns.`;
    case 'multi-series-line':
      return `Multi-run 0–120s thermal trajectories compare peak temperatures and 550K–800K cool-flame plateaus across ${activeRuns.length} active runs.`;
    case 'area-chart':
      return `0–120s radiative flux and CO accumulation envelopes highlight sustained infrared output and toxic off-gassing even when visible flame dims.`;
    case 'stacked-area':
      return `Stacked normalized thermal, radiative, and CO emission profiles illustrate phase shifts from luminous pyrolysis to low-temperature oxidation.`;
    case 'step-chart':
      return `Discrete step transition profile segments Ignition Ramp, Hot Spread, NTC Cool-Flame Plateau (550K–800K), and Quench phases.`;
    case 'timeline-progression':
      return `10-second growth progression forecasts ${simulation.forecast10s.radius_mm.toFixed(1)} mm flame front radius and +${simulation.forecast10s.pressureRise_kPa.toFixed(2)} kPa cabin pressure rise.`;
    case 'contour-surface':
      return `Pressure × Thickness quenching contour shows minimum safe substrate thickness ≥ ${simulation.safeMaterialCheck.minSafeThickness_mm.toFixed(1)} mm (current ${sliders.Thickness_mm.toFixed(1)} mm: ${simulation.safeMaterialCheck.passed ? 'PASS' : 'FAIL'}).`;
    case 'polar-radial':
      return `Polar 6-axis envelope compares normalized cabin parameters (note quadratic radial area scaling caveat; use Parallel Axes for exact linear reading).`;
    default:
      return `Active simulation predicts ${simulation.flameSpread_mms.toFixed(2)} mm/s flame spread (${simulation.hazardStatus}).`;
  }
}
