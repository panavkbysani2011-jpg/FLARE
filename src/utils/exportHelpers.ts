import {
  AssistantMessage,
  PsiRun,
  SimulationResponse,
  VirtualTestConfig,
  VizMode,
} from '../types/psi';

export type HeaderExportSectionId =
  | 'virtual-chamber'
  | 'material-limits'
  | 'comparison-matrix'
  | 'visual-chart'
  | 'console-notes';

export type HeaderExportFormat = 'md' | 'json';

export interface ActiveChartExportSnapshot {
  vizMode: VizMode;
  techniqueName: string;
  datasetLabel: string;
  xAxisKey: string;
  xAxisLabel: string;
  xAxisUnit?: string;
  yAxisKey: string;
  yAxisLabel: string;
  yAxisUnit?: string;
  colorByKey: string;
  colorByLabel: string;
  headline: string;
  plottedRuns: PsiRun[];
  getAxisValue?: (run: PsiRun, key: string) => number | string;
}

export const HEADER_EXPORT_SECTION_OPTIONS: Array<{
  id: HeaderExportSectionId;
  label: string;
}> = [
  {
    id: 'virtual-chamber',
    label: 'Virtual Test Chamber Settings & Predictions',
  },
  {
    id: 'material-limits',
    label: 'Material Qualification & Quenching Limits',
  },
  {
    id: 'comparison-matrix',
    label: 'Selected Comparison Runs Matrix',
  },
  {
    id: 'visual-chart',
    label: 'Visual Analytics Active Chart Summary',
  },
  {
    id: 'console-notes',
    label: 'Model Console Session Notes & Citations',
  },
];

export function triggerFileDownload(
  content: string,
  fileName: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string | number | boolean | undefined | null): string {
  const raw = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function buildCsvDocument(
  headers: string[],
  rows: Array<Array<string | number | boolean | undefined | null>>
): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return lines.join('\n');
}

function runRowsToCsv(
  runs: PsiRun[],
  extraSelectedIds?: string[]
): string {
  const hasSelectionCol = Array.isArray(extraSelectedIds);
  const headers = [
    ...(hasSelectionCol ? ['Selected_In_Comparator'] : []),
    'PSI_ID',
    'Run_Code',
    'Investigation_Title',
    'Facility',
    'Material',
    'O2_pct',
    'Pressure_psi',
    'Airflow_ms',
    'Gravity_g',
    'Thickness_mm',
    'Peak_Temp_K',
    'IR_Heat_Flux_Wm2',
    'Flame_Spread_mms',
    'Outcome',
    'Cool_Flame_Observed',
    'Notes',
  ];

  const rows = runs.map((r) => [
    ...(hasSelectionCol
      ? [extraSelectedIds!.includes(r.id) ? 'Yes' : 'No']
      : []),
    r.psiId,
    r.runCode,
    r.investigationTitle,
    r.facility,
    r.material,
    r.O2_pct.toFixed(1),
    r.P_psi.toFixed(1),
    r.Flow_ms.toFixed(2),
    r.g_eff.toFixed(3),
    r.Thickness_mm.toFixed(2),
    r.peakTemp_K,
    r.radiometerFlux_Wm2,
    r.flameSpread_mms.toFixed(2),
    r.outcome,
    r.coolFlameObserved ? 'Yes' : 'No',
    r.notes,
  ]);

  return buildCsvDocument(headers, rows);
}

/**
 * Tier 1 Multi-Select Header Export (bundles ONLY the checked sections as .md or .json).
 */
export function exportHeaderBundle(params: {
  sections: HeaderExportSectionId[];
  format: HeaderExportFormat;
  config: VirtualTestConfig;
  simulation: SimulationResponse;
  selectedRuns: PsiRun[];
  activeChart: ActiveChartExportSnapshot;
  consoleMessages: AssistantMessage[];
}): void {
  const {
    sections,
    format,
    config,
    simulation,
    selectedRuns,
    activeChart,
    consoleMessages,
  } = params;
  if (sections.length === 0) return;

  const timestampIso = new Date().toISOString();
  const stamp = Date.now();

  if (format === 'json') {
    const payload: Record<string, unknown> = {
      exportedAt: timestampIso,
      includedSections: sections,
    };

    if (sections.includes('virtual-chamber')) {
      payload.virtualTestChamber = {
        settings: config,
        predictions: {
          flameSpread_mms: simulation.flameSpread_mms,
          confidenceInterval_mms: simulation.confidenceInterval_mms,
          hazardStatus: simulation.hazardStatus,
          peakTemp_K: simulation.peakTemp_K,
          forecast10s: simulation.forecast10s,
          modelConfidence: simulation.modelConfidence ?? null,
        },
      };
    }

    if (sections.includes('material-limits')) {
      payload.materialQualification = {
        activeThicknessCheck: simulation.safeMaterialCheck,
        materials: simulation.materialRankings,
      };
    }

    if (sections.includes('comparison-matrix')) {
      payload.comparisonRunsMatrix = selectedRuns;
    }

    if (sections.includes('visual-chart')) {
      payload.visualAnalyticsSummary = {
        vizMode: activeChart.vizMode,
        techniqueName: activeChart.techniqueName,
        datasetLabel: activeChart.datasetLabel,
        axes: {
          x: `${activeChart.xAxisLabel}${activeChart.xAxisUnit ? ` (${activeChart.xAxisUnit})` : ''}`,
          y: `${activeChart.yAxisLabel}${activeChart.yAxisUnit ? ` (${activeChart.yAxisUnit})` : ''}`,
          colorBy: activeChart.colorByLabel,
        },
        plottedRunCount: activeChart.plottedRuns.length,
        headline: activeChart.headline,
      };
    }

    if (sections.includes('console-notes')) {
      payload.modelConsoleSession = consoleMessages.map((m) => ({
        role: m.role,
        mode: m.mode,
        timestamp: m.timestamp,
        text: m.text ?? null,
        steps: m.steps ?? null,
        citations: m.citations ?? [],
      }));
    }

    triggerFileDownload(
      JSON.stringify(payload, null, 2),
      `psi-custom-export-${stamp}.json`,
      'application/json;charset=utf-8'
    );
    return;
  }

  // Markdown bundle
  const lines: string[] = [
    '# PSI Data Manager — Custom Export Report',
    `Generated: ${timestampIso}`,
    `Included Sections: ${sections.length}`,
    '',
  ];

  if (sections.includes('virtual-chamber')) {
    lines.push(
      '## Virtual Test Chamber Settings & Predictions',
      `- Material: ${config.material}`,
      `- Oxygen Concentration: ${config.O2_pct.toFixed(1)}% O2`,
      `- Cabin Pressure: ${config.P_psi.toFixed(1)} psi`,
      `- Forced Airflow Speed: ${config.Flow_ms.toFixed(2)} m/s`,
      `- Effective Gravity: ${config.g_eff.toFixed(3)}g`,
      `- Sample Thickness: ${config.Thickness_mm.toFixed(1)} mm`,
      `- Ignition Heat Flux: ${config.ignitionFlux_Wm2.toLocaleString()} W/m2`,
      `- Predicted Flame Spread Speed: ${simulation.flameSpread_mms.toFixed(2)} ± ${simulation.confidenceInterval_mms.toFixed(2)} mm/s (95% CI)`,
      `- Safety Outcome: ${simulation.hazardStatus} (Peak Gas Temp: ${simulation.peakTemp_K} K)`,
      `- 10s Growth Forecast: ${simulation.forecast10s.radius_mm.toFixed(1)} mm radius (+${simulation.forecast10s.pressureRise_kPa.toFixed(2)} kPa cabin rise)`,
      simulation.modelConfidence
        ? `- Model Confidence: ${simulation.modelConfidence.confidencePct.toFixed(1)}% (${simulation.modelConfidence.validatedRunCount} nearby PSI runs · Physical Test: ${simulation.modelConfidence.physicalTestingRecommendation})`
        : '- Model Confidence: Local physics estimate',
      ''
    );
  }

  if (sections.includes('material-limits')) {
    lines.push(
      '## Material Qualification & Quenching Limits',
      `- Active Thickness Check (${config.material}): ${simulation.safeMaterialCheck.passed ? 'PASS' : 'FAIL'} (Configured ${config.Thickness_mm.toFixed(1)} mm vs. minimum ${simulation.safeMaterialCheck.minSafeThickness_mm.toFixed(1)} mm)`,
      '',
      '| Material | Code | Flame Speed (mm/s) | Limiting O2 (%) | Smoke Index | Toxic Gas Index | Cool-Flame Risk | Safety Status |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
      ...simulation.materialRankings.map(
        (m) =>
          `| ${m.name} | ${m.code} | ${m.flameSpread_mms.toFixed(2)} | ${m.limitingO2_pct.toFixed(1)}% | ${m.smokeClumpingIndex.toFixed(1)} | ${m.toxicGasYieldIndex.toFixed(1)} | ${m.coolFlameRiskIndex.toFixed(1)} | ${m.status} |`
      ),
      ''
    );
  }

  if (sections.includes('comparison-matrix')) {
    lines.push('## Selected Comparison Runs Matrix');
    if (selectedRuns.length === 0) {
      lines.push('- No comparison runs currently selected.', '');
    } else {
      lines.push(
        '| PSI ID | Run Code | Material | Facility | O2 % | Pressure (psi) | Airflow (m/s) | Spread (mm/s) | Outcome |',
        '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |',
        ...selectedRuns.map(
          (r) =>
            `| ${r.psiId} | ${r.runCode} | ${r.material} | ${r.facility} | ${r.O2_pct.toFixed(1)}% | ${r.P_psi.toFixed(1)} | ${r.Flow_ms.toFixed(2)} | ${r.flameSpread_mms.toFixed(2)} | ${r.outcome} |`
        ),
        ''
      );
    }
  }

  if (sections.includes('visual-chart')) {
    lines.push(
      '## Visual Analytics Active Chart Summary',
      `- Chart Type: ${activeChart.techniqueName} (${activeChart.vizMode})`,
      `- Active Dataset: ${activeChart.datasetLabel} (${activeChart.plottedRuns.length.toLocaleString()} runs plotted)`,
      `- Mapped Axes: X = ${activeChart.xAxisLabel} | Y = ${activeChart.yAxisLabel} | Color = ${activeChart.colorByLabel}`,
      `- Takeaway: ${activeChart.headline}`,
      ''
    );
  }

  if (sections.includes('console-notes')) {
    lines.push('## Model Console Session Notes & Citations');
    if (consoleMessages.length === 0) {
      lines.push('- No Model Console questions asked in this session yet.', '');
    } else {
      consoleMessages.forEach((msg, idx) => {
        if (msg.role === 'user') {
          lines.push(`### Entry ${idx + 1} — Question (${msg.mode ?? 'general'})`, `${msg.text ?? ''}`, '');
        } else {
          lines.push(
            `### Entry ${idx + 1} — Model Response (${msg.mode ?? 'general'})`,
            ...(msg.steps ?? []).map((s) => `- ${s}`),
            msg.citations && msg.citations.length > 0
              ? `- Cited Experiments: ${msg.citations.join(', ')}`
              : '- Cited Experiments: None',
            ''
          );
        }
      });
    }
  }

  triggerFileDownload(
    lines.join('\n'),
    `psi-custom-report-${stamp}.md`,
    'text/markdown;charset=utf-8'
  );
}

/**
 * Tier 2 (Virtual Test Lab): Export active chamber settings, prediction, confidence, and nearest runs.
 */
export function exportVirtualTestReport(
  config: VirtualTestConfig,
  simulation: SimulationResponse
): void {
  const conf = simulation.modelConfidence;
  const lines = [
    '# PSI Virtual Test Lab — Test Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Chamber Test Settings',
    `- Candidate Material: ${config.material}`,
    `- Oxygen Concentration: ${config.O2_pct.toFixed(1)}% O2`,
    `- Cabin Pressure: ${config.P_psi.toFixed(1)} psi`,
    `- Forced Airflow Velocity: ${config.Flow_ms.toFixed(2)} m/s`,
    `- Effective Gravity: ${config.g_eff.toFixed(3)}g`,
    `- Sample Thickness: ${config.Thickness_mm.toFixed(1)} mm`,
    `- Ignition Heat Flux: ${config.ignitionFlux_Wm2.toLocaleString()} W/m2`,
    '',
    '## Predicted Results & Model Confidence',
    `- Predicted Flame Spread Rate: ${simulation.flameSpread_mms.toFixed(2)} ± ${simulation.confidenceInterval_mms.toFixed(2)} mm/s (95% CI)`,
    `- Safety Regime: ${simulation.hazardStatus}`,
    `- Peak Gas Temperature: ${simulation.peakTemp_K} K`,
    `- 10-Second Flame Growth: ${simulation.forecast10s.radius_mm.toFixed(1)} mm radius (+${simulation.forecast10s.pressureRise_kPa.toFixed(2)} kPa cabin rise)`,
    `- Safe Quenching Thickness Check: ${simulation.safeMaterialCheck.passed ? 'PASS' : 'FAIL'} (minimum ${simulation.safeMaterialCheck.minSafeThickness_mm.toFixed(1)} mm required; ${simulation.safeMaterialCheck.margin_mm >= 0 ? '+' : ''}${simulation.safeMaterialCheck.margin_mm.toFixed(1)} mm margin)`,
    conf
      ? `- Model Confidence Score: ${conf.confidencePct.toFixed(1)}% (${conf.validatedRunCount} nearby PSI runs · Physical Testing: ${conf.physicalTestingRecommendation})`
      : '- Model Confidence Score: Baseline estimate',
    conf ? `- Grounding Summary: ${conf.rationale}` : '',
    '',
    '## Nearest Reference Flight Runs',
    ...simulation.nearestRuns.map(
      ({ run, similarityPct }) =>
        `- ${run.psiId} (${run.runCode}, ${run.material}, ${run.facility}) — ${similarityPct}% match: ${run.O2_pct.toFixed(1)}% O2, ${run.P_psi.toFixed(1)} psi, ${run.Flow_ms.toFixed(2)} m/s -> ${run.flameSpread_mms.toFixed(2)} mm/s [${run.outcome}]`
    ),
  ].filter(Boolean);

  triggerFileDownload(
    lines.join('\n'),
    `psi-virtual-test-report-${Date.now()}.md`,
    'text/markdown;charset=utf-8'
  );
}

/**
 * Tier 2 (Run Comparator): Export comparison table as clean CSV.
 */
export function exportComparisonRunsCsv(selectedRuns: PsiRun[]): void {
  if (selectedRuns.length === 0) return;
  const csv = runRowsToCsv(selectedRuns);
  triggerFileDownload(
    csv,
    `psi-run-comparison-${Date.now()}.csv`,
    'text/csv;charset=utf-8'
  );
}

/**
 * Tier 2 (Visual Analytics Studio): Export active plotted data & axis mapping as CSV or JSON.
 */
export function exportStudioChartData(params: {
  snapshot: ActiveChartExportSnapshot;
  simulation: SimulationResponse;
  format: 'csv' | 'json';
}): void {
  const { snapshot, simulation, format } = params;
  const stamp = Date.now();
  const isMaterialMode =
    snapshot.vizMode === 'material-safety' || snapshot.vizMode === 'stacked-bar';
  const isTimelineMode =
    snapshot.vizMode === 'sensor-timeline' ||
    snapshot.vizMode === 'area-chart' ||
    snapshot.vizMode === 'stacked-area' ||
    snapshot.vizMode === 'step-chart' ||
    snapshot.vizMode === 'timeline-progression';

  if (format === 'json') {
    const payload = {
      exportedAt: new Date().toISOString(),
      chartTechnique: snapshot.techniqueName,
      vizMode: snapshot.vizMode,
      dataset: snapshot.datasetLabel,
      axes: {
        x: { key: snapshot.xAxisKey, label: snapshot.xAxisLabel, unit: snapshot.xAxisUnit ?? '' },
        y: { key: snapshot.yAxisKey, label: snapshot.yAxisLabel, unit: snapshot.yAxisUnit ?? '' },
        colorBy: { key: snapshot.colorByKey, label: snapshot.colorByLabel },
      },
      summary: snapshot.headline,
      plottedSeries: isMaterialMode
        ? simulation.materialRankings
        : isTimelineMode
        ? simulation.timelineSeries
        : snapshot.plottedRuns.map((r) => ({
            id: r.id,
            psiId: r.psiId,
            runCode: r.runCode,
            material: r.material,
            facility: r.facility,
            outcome: r.outcome,
            xValue: snapshot.getAxisValue ? snapshot.getAxisValue(r, snapshot.xAxisKey) : r.O2_pct,
            yValue: snapshot.getAxisValue ? snapshot.getAxisValue(r, snapshot.yAxisKey) : r.flameSpread_mms,
            colorGroup: snapshot.getAxisValue ? snapshot.getAxisValue(r, snapshot.colorByKey) : r.outcome,
            O2_pct: r.O2_pct,
            P_psi: r.P_psi,
            Flow_ms: r.Flow_ms,
            g_eff: r.g_eff,
            Thickness_mm: r.Thickness_mm,
            peakTemp_K: r.peakTemp_K,
            radiometerFlux_Wm2: r.radiometerFlux_Wm2,
            flameSpread_mms: r.flameSpread_mms,
          })),
    };

    triggerFileDownload(
      JSON.stringify(payload, null, 2),
      `psi-chart-${snapshot.vizMode}-${stamp}.json`,
      'application/json;charset=utf-8'
    );
    return;
  }

  // CSV format matching the active chart's primary plotted series
  let csv = '';
  if (isMaterialMode) {
    csv = buildCsvDocument(
      [
        'Material',
        'Code',
        'Flame_Spread_mms',
        'Limiting_O2_pct',
        'Smoke_Clumping_Index',
        'Toxic_Gas_Yield_Index',
        'Cool_Flame_Risk_Index',
        'Safety_Status',
      ],
      simulation.materialRankings.map((m) => [
        m.name,
        m.code,
        m.flameSpread_mms.toFixed(2),
        m.limitingO2_pct.toFixed(1),
        m.smokeClumpingIndex.toFixed(1),
        m.toxicGasYieldIndex.toFixed(1),
        m.coolFlameRiskIndex.toFixed(1),
        m.status,
      ])
    );
  } else if (isTimelineMode) {
    csv = buildCsvDocument(
      ['Time_s', 'Gas_Temp_K', 'IR_Radiometer_Wm2', 'Optical_Visibility_pct', 'CO_Yield_ppm', 'Cool_Flame_Zone'],
      simulation.timelineSeries.map((pt) => [
        pt.time_s,
        pt.temp_K,
        pt.irFlux_Wm2,
        pt.opticalVisibility_pct,
        pt.coYield_ppm,
        pt.isCoolFlameZone ? 'Yes' : 'No',
      ])
    );
  } else {
    const headers = [
      'PSI_ID',
      'Run_Code',
      `X_${snapshot.xAxisLabel.replace(/\s+/g, '_')}`,
      `Y_${snapshot.yAxisLabel.replace(/\s+/g, '_')}`,
      `Group_${snapshot.colorByLabel.replace(/\s+/g, '_')}`,
      'Material',
      'Facility',
      'O2_pct',
      'Pressure_psi',
      'Airflow_ms',
      'Gravity_g',
      'Thickness_mm',
      'Peak_Temp_K',
      'IR_Heat_Flux_Wm2',
      'Flame_Spread_mms',
      'Outcome',
    ];
    csv = buildCsvDocument(
      headers,
      snapshot.plottedRuns.map((r) => [
        r.psiId,
        r.runCode,
        snapshot.getAxisValue ? snapshot.getAxisValue(r, snapshot.xAxisKey) : r.O2_pct,
        snapshot.getAxisValue ? snapshot.getAxisValue(r, snapshot.yAxisKey) : r.flameSpread_mms,
        snapshot.getAxisValue ? snapshot.getAxisValue(r, snapshot.colorByKey) : r.outcome,
        r.material,
        r.facility,
        r.O2_pct.toFixed(1),
        r.P_psi.toFixed(1),
        r.Flow_ms.toFixed(2),
        r.g_eff.toFixed(3),
        r.Thickness_mm.toFixed(2),
        r.peakTemp_K,
        r.radiometerFlux_Wm2,
        r.flameSpread_mms.toFixed(2),
        r.outcome,
      ])
    );
  }

  triggerFileDownload(
    csv,
    `psi-chart-${snapshot.vizMode}-${stamp}.csv`,
    'text/csv;charset=utf-8'
  );
}

/**
 * Tier 2 (Experiment Runs Catalog): Export currently filtered runs as CSV.
 */
export function exportFilteredRunsCsv(
  filteredRuns: PsiRun[],
  selectedRunIds: string[]
): void {
  if (filteredRuns.length === 0) return;
  const csv = runRowsToCsv(filteredRuns, selectedRunIds);
  triggerFileDownload(
    csv,
    `psi-filtered-runs-${Date.now()}.csv`,
    'text/csv;charset=utf-8'
  );
}
