import {
  ChatAttachment,
  ChatInlineChartPayload,
  ChatVisualizationOutputMode,
  ConsoleMode,
  DatasetScope,
  DecodedChartContext,
  PsiRun,
  SimulationResponse,
  VirtualTestConfig,
  VizDatasetContext,
  VizMode,
} from '../types/psi';
import {
  AxisVariableKey,
  buildDatasetContext,
  CategoricalGroupKey,
  evaluateAllTechniques,
  getAxisMeta,
  getDefaultAxesForTechnique,
  getTechniqueHeadline,
  NumericAxisKey,
  VIZ_TECHNIQUE_REGISTRY,
} from './vizRegistry';

const TIMELINE_MODES: Set<VizMode> = new Set([
  'sensor-timeline',
  'multi-series-line',
  'area-chart',
  'stacked-area',
  'step-chart',
  'timeline-progression',
]);

function filterAttachedRuns(
  attachments: ChatAttachment[],
  catalogRuns: PsiRun[],
  selectedRuns: PsiRun[]
): PsiRun[] {
  const attachedPsiIds = new Set(
    attachments
      .filter((a) => a.kind === 'psi-investigation' && a.psiId)
      .map((a) => a.psiId!.toLowerCase())
  );
  const attachedRunIds = new Set(
    attachments
      .filter((a) => a.kind === 'psi-investigation' && a.runId)
      .map((a) => a.runId!)
  );

  const matchedPsiRuns = catalogRuns.filter(
    (r) =>
      attachedRunIds.has(r.id) ||
      attachedPsiIds.has(r.psiId.toLowerCase()) ||
      Array.from(attachedPsiIds).some((pid) =>
        r.psiId.toLowerCase().startsWith(pid)
      )
  );

  if (matchedPsiRuns.length > 0) {
    return matchedPsiRuns;
  }

  if (attachments.some((a) => a.kind === 'comparator-runs')) {
    return selectedRuns;
  }

  return [];
}

function inferDatasetScopeForChat(params: {
  question: string;
  mode: ConsoleMode;
  attachments: ChatAttachment[];
  catalogRuns: PsiRun[];
  selectedRuns: PsiRun[];
  simulation: SimulationResponse;
}): {
  scope: DatasetScope;
  label: string;
  ctx: VizDatasetContext;
  runIds?: string[];
} {
  const { question, mode, attachments, catalogRuns, selectedRuns, simulation } = params;
  const qLower = question.toLowerCase();

  const wantsTimeSeries =
    mode === 'decoder' ||
    /\b(timeline|cool flame|cool-flame|120s|sensor|radiometer|smoke|visibility|emission|co yield|temperature curve|forecast|10s|step transition)\b/i.test(
      question
    );
  const wantsMaterial =
    mode === 'risk-audit' ||
    /\b(material|materials|nomex|pmma|ptfe|sibal|cotton-fiberglass|quenching)\b/i.test(
      question
    );

  // 1. Check explicit PSI attachments
  const psiAttachments = attachments.filter((a) => a.kind === 'psi-investigation');
  if (psiAttachments.length > 0) {
    const matchedRuns = filterAttachedRuns(attachments, catalogRuns, selectedRuns);
    const scope: DatasetScope =
      matchedRuns.length <= 1 ? 'single-focus' : 'selected-comparison';
    const base = buildDatasetContext(scope, matchedRuns, catalogRuns, simulation);
    const hasTimeSeries = wantsTimeSeries || attachments.some((a) => a.kind === 'virtual-lab');
    const ctx: VizDatasetContext = {
      ...base,
      scope,
      activeRuns: matchedRuns,
      hasTimeSeries,
      has2DGrid: matchedRuns.length >= 2 && attachments.some((a) => a.kind === 'visual-studio'),
      hasMaterialMetrics: wantsMaterial || attachments.some((a) => a.kind === 'virtual-lab'),
    };
    const names = psiAttachments.map((a) => a.psiId ?? a.label).join(' + ');
    return {
      scope,
      label: `Attached Flight Runs (${names})`,
      ctx,
      runIds: matchedRuns.map((r) => r.id),
    };
  }

  // 2. Comparator attachment (static run comparison unless Virtual Test Lab is also attached)
  if (attachments.some((a) => a.kind === 'comparator-runs')) {
    const hasLabAttachment = attachments.some((a) => a.kind === 'virtual-lab');
    const scope: DatasetScope =
      wantsTimeSeries && hasLabAttachment ? 'selected-comparison' : 'static-runs';
    const base = buildDatasetContext(scope, selectedRuns, catalogRuns, simulation);
    const ctx: VizDatasetContext = {
      ...base,
      hasTimeSeries: wantsTimeSeries && hasLabAttachment,
      has2DGrid: attachments.some((a) => a.kind === 'visual-studio'),
      hasMaterialMetrics: wantsMaterial,
    };
    return {
      scope,
      label: `Run Comparator (${selectedRuns.length} Staged Runs)`,
      ctx,
      runIds: selectedRuns.map((r) => r.id),
    };
  }

  // 3. Virtual Test Lab attachment
  if (attachments.some((a) => a.kind === 'virtual-lab')) {
    const ctx = buildDatasetContext(
      'virtual-lab-output',
      selectedRuns,
      catalogRuns,
      simulation
    );
    return {
      scope: 'virtual-lab-output',
      label: 'Virtual Test Lab Current Run & Nearest Matches',
      ctx,
    };
  }

  // 4. Visual Analytics Studio attachment
  if (attachments.some((a) => a.kind === 'visual-studio')) {
    const ctx = buildDatasetContext('full-archive', selectedRuns, catalogRuns, simulation);
    return {
      scope: 'full-archive',
      label: 'Visual Analytics Studio Active Archive',
      ctx,
    };
  }

  // 5. Infer cleanly from question text
  if (wantsMaterial && !wantsTimeSeries) {
    const ctx = buildDatasetContext(
      'material-qualification',
      selectedRuns,
      catalogRuns,
      simulation
    );
    return {
      scope: 'material-qualification',
      label: '5 Spacecraft Materials Comparison',
      ctx,
    };
  }

  if (wantsTimeSeries || mode === 'what-if') {
    const ctx = buildDatasetContext(
      'virtual-lab-output',
      selectedRuns,
      catalogRuns,
      simulation
    );
    return {
      scope: 'virtual-lab-output',
      label:
        mode === 'what-if'
          ? 'What-If Simulation & Nearest Flight Runs'
          : 'Active 120s Burn Sensor Curve & Nearest Runs',
      ctx,
    };
  }

  // Archive / PSI-ID search from text
  const psiMentions = Array.from(
    new Set(
      (question.match(/\bPSI-\d{2,3}\b/gi) ?? []).map((id) => id.toUpperCase())
    )
  );
  if (psiMentions.length === 1 && !qLower.includes('compare')) {
    const matched = catalogRuns.filter((r) =>
      r.psiId.toUpperCase().startsWith(psiMentions[0])
    );
    if (matched.length > 0) {
      const scope: DatasetScope = matched.length <= 1 ? 'single-focus' : 'static-runs';
      const base = buildDatasetContext(scope, matched, catalogRuns, simulation);
      return {
        scope,
        label: `${psiMentions[0]} Flight Test Runs (${matched.length})`,
        ctx: {
          ...base,
          activeRuns: matched,
          hasTimeSeries: false,
          has2DGrid: false,
          hasMaterialMetrics: false,
        },
        runIds: matched.map((r) => r.id),
      };
    }
  }

  const ctx = buildDatasetContext('full-archive', selectedRuns, catalogRuns, simulation);
  return {
    scope: 'full-archive',
    label: 'Full PSI Flight Archive',
    ctx,
  };
}

function chooseAutoTechnique(params: {
  question: string;
  mode: ConsoleMode;
  suggestedVizMode?: VizMode;
  ctx: VizDatasetContext;
  preferredCharts?: VizMode[];
}): VizMode | null {
  const { question, mode, suggestedVizMode, ctx, preferredCharts } = params;
  const qLower = question.toLowerCase();

  // Pure non-quantitative greetings without attachments -> text-only reply
  const isPureGreeting =
    /^(hi|hello|hey|thanks|thank you|ok|okay|help)\b[!.? ]*$/i.test(
      question.trim()
    ) && ctx.scope !== 'virtual-lab-output';
  if (isPureGreeting) return null;

  const evaluated = evaluateAllTechniques(ctx);
  const isUsable = (id: VizMode) =>
    evaluated.some(
      (e) => e.definition.id === id && e.compatibility.status !== 'unavailable'
    );

  // Topic-driven selection across the 25 techniques
  const candidates: VizMode[] = [];

  if (/\b(histogram|distribution|spread across|bin)\b/i.test(qLower)) {
    candidates.push('histogram', 'frequency-distribution', 'box-quartile');
  } else if (/\b(quartile|box plot|median|variance|range|interval)\b/i.test(qLower)) {
    candidates.push('box-quartile', 'range-interval-bar', 'density-strip');
  } else if (/\b(correlation|pearson|matrix|relationship|versus|vs\.)\b/i.test(qLower)) {
    candidates.push('correlation-matrix', 'scatter-plot', 'bubble-plot');
  } else if (/\b(forecast|10s|growth radius|pressure rise)\b/i.test(qLower)) {
    candidates.push('timeline-progression', 'sensor-timeline');
  } else if (/\b(emission|stacked|smoke|co yield|cool flame|cool-flame|sensor|120s|timeline|temperature)\b/i.test(qLower)) {
    candidates.push('sensor-timeline', 'stacked-area', 'area-chart', 'step-chart');
  } else if (/\b(material|nomex|pmma|ptfe|sibal|cotton-fiberglass|quenching)\b/i.test(qLower)) {
    candidates.push('material-safety', 'stacked-bar', 'grouped-bar');
  } else if (/\b(compare|rank|top|highest|fastest|lowest|what if|what-if)\b/i.test(qLower) || mode === 'what-if') {
    candidates.push('horizontal-ranked-bar', 'grouped-bar', 'multi-variable', 'scatter-plot');
  } else if (/\b(contour|density|heatmap|safety map|airflow|o2|regime|boundary|lunar|mars)\b/i.test(qLower)) {
    candidates.push('safety-map', 'contour-surface', 'scatter-plot');
  } else if (/\b(residual|error|accuracy|confidence)\b/i.test(qLower)) {
    candidates.push('residual-deviation', 'range-interval-bar');
  }

  if (suggestedVizMode) {
    candidates.push(suggestedVizMode);
  }

  const matchedSpecificTopic = candidates.length > 0;
  if (!matchedSpecificTopic && preferredCharts && preferredCharts.length > 0 && mode === 'literature') {
    candidates.push(...preferredCharts);
  }

  if (mode === 'decoder') candidates.push('sensor-timeline', 'scatter-plot');
  if (mode === 'risk-audit') candidates.push('material-safety', 'horizontal-ranked-bar');
  if (mode === 'literature') candidates.push('safety-map', 'grouped-bar', 'horizontal-ranked-bar');

  // Always include safe universal fallbacks
  candidates.push('horizontal-ranked-bar', 'grouped-bar', 'sensor-timeline');

  for (const id of candidates) {
    if (isUsable(id)) return id;
  }

  const firstCompatible = evaluated.find(
    (e) => e.compatibility.status !== 'unavailable'
  );
  return firstCompatible?.definition.id ?? null;
}

function refineAxesForQuestion(
  vizMode: VizMode,
  question: string,
  chartContext?: DecodedChartContext | null
): {
  xAxisKey: AxisVariableKey;
  yAxisKey: NumericAxisKey;
  colorByKey: CategoricalGroupKey;
} {
  const defaults = getDefaultAxesForTechnique(vizMode);
  const qLower = question.toLowerCase();

  let xAxisKey: AxisVariableKey = defaults.xAxis;
  let yAxisKey: NumericAxisKey = defaults.yAxis;
  const colorByKey: CategoricalGroupKey = defaults.colorBy;

  if (chartContext?.xAxisLabel?.toLowerCase().includes('airflow')) {
    xAxisKey = 'Flow_ms';
  } else if (qLower.includes('airflow') || qLower.includes('flow') || qLower.includes('ventilation')) {
    xAxisKey = 'Flow_ms';
  } else if (qLower.includes('thickness') || qLower.includes('quench')) {
    xAxisKey = 'Thickness_mm';
  } else if (qLower.includes('pressure') || qLower.includes('psi')) {
    xAxisKey = 'P_psi';
  } else if (qLower.includes('gravity') || qLower.includes('lunar') || qLower.includes('mars')) {
    xAxisKey = 'g_eff';
  }

  if (qLower.includes('temp') || qLower.includes('550k') || qLower.includes('800k')) {
    yAxisKey = 'peakTemp_K';
  } else if (qLower.includes('heat') || qLower.includes('radiometer') || qLower.includes('glow')) {
    yAxisKey = 'radiometerFlux_Wm2';
  }

  return { xAxisKey, yAxisKey, colorByKey };
}

export function resolveChatVisualization(params: {
  question: string;
  mode: ConsoleMode;
  requestedVizOutput: ChatVisualizationOutputMode;
  attachments: ChatAttachment[];
  chartContext?: DecodedChartContext | null;
  selectedRuns: PsiRun[];
  catalogRuns: PsiRun[];
  simulation: SimulationResponse;
  sliders: VirtualTestConfig;
  suggestedVizMode?: VizMode;
  preferredCharts?: VizMode[];
}): ChatInlineChartPayload | undefined {
  const {
    question,
    mode,
    requestedVizOutput,
    attachments,
    chartContext,
    selectedRuns,
    catalogRuns,
    simulation,
    sliders,
    suggestedVizMode,
    preferredCharts,
  } = params;

  if (requestedVizOutput === 'none') {
    return undefined;
  }

  const scoped = inferDatasetScopeForChat({
    question,
    mode,
    attachments,
    catalogRuns,
    selectedRuns,
    simulation,
  });

  const evaluated = evaluateAllTechniques(scoped.ctx);

  // Explicit chart mode chosen by the user: validate strict compatibility
  if (requestedVizOutput !== 'auto') {
    const selectedEval = evaluated.find(
      (e) => e.definition.id === requestedVizOutput
    );
    const definition =
      selectedEval?.definition ??
      VIZ_TECHNIQUE_REGISTRY.find((t) => t.id === requestedVizOutput);
    const compatibility = selectedEval?.compatibility ?? {
      status: 'unavailable' as const,
      reason: 'Selected technique requires matching dataset structure.',
    };

    // Additional semantic guard: time-series requested on explicit static historical/material comparisons
    const wantsStaticComparatorOrMaterial =
      (scoped.scope === 'static-runs' || scoped.scope === 'material-qualification') &&
      TIMELINE_MODES.has(requestedVizOutput);

    if (compatibility.status === 'unavailable' || wantsStaticComparatorOrMaterial) {
      const compatibleAlternatives = evaluated
        .filter((e) => e.compatibility.status !== 'unavailable')
        .sort((a, b) => {
          const scoreA = a.compatibility.status === 'recommended' ? 0 : 1;
          const scoreB = b.compatibility.status === 'recommended' ? 0 : 1;
          return scoreA - scoreB;
        })
        .slice(0, 5)
        .map((e) => ({
          vizMode: e.definition.id,
          name: e.definition.shortName,
        }));

      const plainReason = wantsStaticComparatorOrMaterial
        ? `${definition?.name ?? 'This chart'} needs a 0–120 second sensor timeline, whereas your request compares static run summaries (${scoped.label}) without a time series.`
        : `${definition?.name ?? 'This chart'} cannot display the active question data (${scoped.label}): ${compatibility.reason.replace(/^Unavailable:\s*/i, '')}`;

      return {
        status: 'incompatible',
        requestedMode: requestedVizOutput,
        techniqueName: definition?.name ?? requestedVizOutput,
        datasetScope: scoped.scope,
        datasetLabel: scoped.label,
        runIds: scoped.runIds,
        incompatibilityReason: plainReason,
        compatibleAlternatives,
      };
    }

    const axes = refineAxesForQuestion(requestedVizOutput, question, chartContext);
    const xMeta = getAxisMeta(axes.xAxisKey);
    const yMeta = getAxisMeta(axes.yAxisKey);
    const colorMeta = getAxisMeta(axes.colorByKey);
    const headline = getTechniqueHeadline(
      requestedVizOutput,
      simulation,
      sliders,
      scoped.ctx.activeRuns,
      {
        xAxisLabel: xMeta.label,
        yAxisLabel: yMeta.label,
        colorByLabel: colorMeta.label,
      }
    );

    return {
      status: 'rendered',
      requestedMode: requestedVizOutput,
      resolvedVizMode: requestedVizOutput,
      techniqueName: definition?.name ?? requestedVizOutput,
      datasetScope: scoped.scope,
      datasetLabel: scoped.label,
      runIds: scoped.runIds,
      xAxisKey: axes.xAxisKey,
      yAxisKey: axes.yAxisKey,
      colorByKey: axes.colorByKey,
      headline,
    };
  }

  // 'auto': Pick best compatible chart for trends, comparisons, distributions, or safety boundaries
  const autoId = chooseAutoTechnique({
    question,
    mode,
    suggestedVizMode,
    ctx: scoped.ctx,
    preferredCharts,
  });

  if (!autoId) {
    return undefined;
  }

  const def = VIZ_TECHNIQUE_REGISTRY.find((t) => t.id === autoId);
  const axes = refineAxesForQuestion(autoId, question, chartContext);
  const xMeta = getAxisMeta(axes.xAxisKey);
  const yMeta = getAxisMeta(axes.yAxisKey);
  const colorMeta = getAxisMeta(axes.colorByKey);
  const headline = getTechniqueHeadline(
    autoId,
    simulation,
    sliders,
    scoped.ctx.activeRuns,
    {
      xAxisLabel: xMeta.label,
      yAxisLabel: yMeta.label,
      colorByLabel: colorMeta.label,
    }
  );

  return {
    status: 'rendered',
    requestedMode: 'auto',
    resolvedVizMode: autoId,
    techniqueName: def?.name ?? autoId,
    datasetScope: scoped.scope,
    datasetLabel: scoped.label,
    runIds: scoped.runIds,
    xAxisKey: axes.xAxisKey,
    yAxisKey: axes.yAxisKey,
    colorByKey: axes.colorByKey,
    headline,
  };
}

export function reconstructRunsForInlineChart(
  payload: ChatInlineChartPayload,
  selectedRuns: PsiRun[],
  catalogRuns: PsiRun[],
  simulation: SimulationResponse
): PsiRun[] {
  if (payload.runIds && payload.runIds.length > 0) {
    const idSet = new Set(payload.runIds);
    const matched = catalogRuns.filter((r) => idSet.has(r.id));
    if (matched.length > 0) return matched;
  }
  const ctx = buildDatasetContext(
    payload.datasetScope,
    selectedRuns,
    catalogRuns,
    simulation
  );
  return ctx.activeRuns;
}
