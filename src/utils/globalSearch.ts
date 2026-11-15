import {
  GlobalSearchResult,
  LiteratureChunk,
  PsiInvestigationRecord,
  PsiRun,
  ResearchersGuideTopic,
} from '../types/psi';

export function performGlobalSearch(params: {
  query: string;
  investigations: PsiInvestigationRecord[];
  runs: PsiRun[];
  guideTopics: ResearchersGuideTopic[];
  literatureChunks?: LiteratureChunk[];
  limitPerGroup?: number;
}): {
  investigations: GlobalSearchResult[];
  runs: GlobalSearchResult[];
  guide: GlobalSearchResult[];
  all: GlobalSearchResult[];
} {
  const {
    query,
    investigations,
    runs,
    guideTopics,
    literatureChunks = [],
    limitPerGroup = 4,
  } = params;

  const q = query.trim().toLowerCase();
  if (!q) {
    return { investigations: [], runs: [], guide: [], all: [] };
  }

  const matchedInvestigations: GlobalSearchResult[] = investigations
    .filter(
      (inv) =>
        inv.psiId.toLowerCase().includes(q) ||
        inv.acronym.toLowerCase().includes(q) ||
        inv.title.toLowerCase().includes(q) ||
        inv.facility.toLowerCase().includes(q) ||
        inv.objective.toLowerCase().includes(q) ||
        inv.fuels.some((f) => f.toLowerCase().includes(q))
    )
    .slice(0, limitPerGroup)
    .map((inv) => ({
      id: `inv-${inv.psiId}`,
      kind: 'investigation',
      title: `${inv.psiId} · ${inv.acronym}`,
      subtitle: inv.title,
      meta: `${inv.facility} · ${inv.runCount} runs`,
      investigation: inv,
      run: inv.representativeRun,
    }));

  const matchedRuns: GlobalSearchResult[] = runs
    .filter(
      (r) =>
        r.psiId.toLowerCase().includes(q) ||
        r.runCode.toLowerCase().includes(q) ||
        r.material.toLowerCase().includes(q) ||
        r.facility.toLowerCase().includes(q) ||
        r.investigationTitle.toLowerCase().includes(q) ||
        r.notes.toLowerCase().includes(q)
    )
    .slice(0, limitPerGroup)
    .map((run) => ({
      id: `run-${run.id}`,
      kind: 'run',
      title: `${run.psiId} · ${run.runCode}`,
      subtitle: `${run.material} · ${run.facility}`,
      meta: `${run.O2_pct.toFixed(0)}% O2 · ${run.flameSpread_mms.toFixed(2)} mm/s`,
      run,
    }));

  const matchedTopics: GlobalSearchResult[] = guideTopics
    .filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.sectionNumber.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.keyTakeaways.some((k) => k.toLowerCase().includes(q))
    )
    .slice(0, limitPerGroup)
    .map((topic) => ({
      id: `guide-${topic.id}`,
      kind: 'guide',
      title: `Sec ${topic.sectionNumber} · ${topic.title}`,
      subtitle: topic.summary,
      meta: `${topic.category} · Pages ${topic.pageRange}`,
      guideTopicId: topic.id,
      guideSearchHint: topic.title,
    }));

  if (matchedTopics.length < limitPerGroup && literatureChunks.length > 0) {
    const needed = limitPerGroup - matchedTopics.length;
    const seenTexts = new Set(matchedTopics.map((g) => g.title.toLowerCase()));
    literatureChunks
      .filter(
        (c) =>
          c.text.toLowerCase().includes(q) ||
          c.psi_id.toLowerCase().includes(q)
      )
      .slice(0, needed)
      .forEach((chunk) => {
        const title = `${chunk.psi_id} Guide Excerpt (p.${chunk.page_number})`;
        if (!seenTexts.has(title.toLowerCase())) {
          matchedTopics.push({
            id: `chunk-${chunk.chunk_id}`,
            kind: 'guide',
            title,
            subtitle: chunk.text.slice(0, 120),
            meta: `${chunk.source_file} · Page ${chunk.page_number}`,
            guideSearchHint: q,
          });
        }
      });
  }

  return {
    investigations: matchedInvestigations,
    runs: matchedRuns,
    guide: matchedTopics,
    all: [...matchedInvestigations, ...matchedRuns, ...matchedTopics],
  };
}
