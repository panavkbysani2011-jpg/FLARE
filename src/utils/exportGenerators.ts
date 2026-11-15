import {
  AssistantMessage,
  ChatThread,
  ExportFileFormat,
  MeasurementUnits,
  PsiRun,
  SimulationResponse,
  VirtualTestConfig,
} from '../types/psi';
import {
  ActiveChartExportSnapshot,
  buildCsvDocument,
  exportHeaderBundle,
  exportStudioChartData,
  HeaderExportFormat,
  HeaderExportSectionId,
  runRowsToCsv,
  triggerFileDownload,
} from './exportHelpers';
import {
  formatAirflow,
  formatFlameSpread,
  formatPressure,
  formatPressureRiseKpa,
  formatTemperature,
} from './themePreferences';

export interface ExportTableBlock {
  headers: string[];
  rows: string[][];
}

export interface ExportSectionBlock {
  heading: string;
  keyValues?: Array<{ label: string; value: string }>;
  paragraphs?: string[];
  bullets?: string[];
  table?: ExportTableBlock;
}

export interface ExportDocumentSpec {
  title: string;
  subtitle?: string;
  generatedAtIso: string;
  sections: ExportSectionBlock[];
}

export function triggerBinaryDownload(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string
): void {
  const safeCopy = new Uint8Array(bytes.byteLength);
  safeCopy.set(bytes);
  const blob = new Blob([safeCopy.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toAsciiPdfSafe(raw: string): string {
  return raw
    .replace(/\u2082/g, '2')
    .replace(/\u00b2/g, '2')
    .replace(/\u00b1/g, '+/-')
    .replace(/\u00b0/g, ' deg ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2022/g, '*')
    .replace(/\u00b7/g, '|')
    .replace(/\u0394/g, 'Delta ')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function escapePdfLiteral(raw: string): string {
  return toAsciiPdfSafe(raw)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapTextLines(raw: string, maxChars: number): string[] {
  const clean = toAsciiPdfSafe(raw).replace(/\s+/g, ' ').trim();
  if (!clean) return [''];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
    while (current.length > maxChars) {
      lines.push(current.slice(0, maxChars));
      current = current.slice(maxChars);
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates a self-contained, valid multi-page binary PDF (%PDF-1.4) directly in the client browser.
 */
export function generateClientPdfBytes(doc: ExportDocumentSpec): Uint8Array {
  const PAGE_WIDTH = 612;
  const PAGE_HEIGHT = 792;
  const MARGIN_X = 46;
  const TOP_Y = 742;
  const BOTTOM_Y = 54;

  interface DrawCommand {
    font: 'F1' | 'F2';
    size: number;
    x: number;
    y: number;
    text: string;
    gray?: number;
    ruleBelowY?: number;
  }

  const pages: DrawCommand[][] = [[]];
  let cursorY = TOP_Y;

  const ensureSpace = (neededPt: number) => {
    if (cursorY - neededPt < BOTTOM_Y) {
      pages.push([]);
      cursorY = TOP_Y;
    }
  };

  const pushCommand = (cmd: DrawCommand) => {
    pages[pages.length - 1].push(cmd);
  };

  // Document Banner Header on Page 1
  pushCommand({
    font: 'F2',
    size: 16,
    x: MARGIN_X,
    y: cursorY,
    text: doc.title,
    gray: 0.08,
  });
  cursorY -= 19;

  if (doc.subtitle) {
    for (const line of wrapTextLines(doc.subtitle, 84)) {
      pushCommand({
        font: 'F1',
        size: 10,
        x: MARGIN_X,
        y: cursorY,
        text: line,
        gray: 0.32,
      });
      cursorY -= 14;
    }
  }

  pushCommand({
    font: 'F1',
    size: 8.5,
    x: MARGIN_X,
    y: cursorY,
    text: `Generated: ${doc.generatedAtIso}  |  FLARE - Flight & Lunar Atmosphere Risk Engine`,
    gray: 0.42,
    ruleBelowY: cursorY - 6,
  });
  cursorY -= 20;

  // Sections
  for (const section of doc.sections) {
    ensureSpace(34);
    pushCommand({
      font: 'F2',
      size: 12,
      x: MARGIN_X,
      y: cursorY,
      text: section.heading,
      gray: 0.1,
      ruleBelowY: cursorY - 4,
    });
    cursorY -= 18;

    if (section.keyValues && section.keyValues.length > 0) {
      for (const kv of section.keyValues) {
        const lines = wrapTextLines(`${kv.label}: ${kv.value}`, 88);
        ensureSpace(lines.length * 13 + 3);
        lines.forEach((line, idx) => {
          pushCommand({
            font: idx === 0 ? 'F2' : 'F1',
            size: 9.5,
            x: MARGIN_X + 4,
            y: cursorY,
            text: line,
            gray: 0.16,
          });
          cursorY -= 13;
        });
      }
      cursorY -= 4;
    }

    if (section.paragraphs && section.paragraphs.length > 0) {
      for (const p of section.paragraphs) {
        const lines = wrapTextLines(p, 90);
        ensureSpace(lines.length * 13 + 6);
        for (const line of lines) {
          pushCommand({
            font: 'F1',
            size: 9.5,
            x: MARGIN_X + 2,
            y: cursorY,
            text: line,
            gray: 0.18,
          });
          cursorY -= 13;
        }
        cursorY -= 3;
      }
    }

    if (section.bullets && section.bullets.length > 0) {
      for (const bullet of section.bullets) {
        const lines = wrapTextLines(bullet, 84);
        ensureSpace(lines.length * 13 + 3);
        lines.forEach((line, idx) => {
          pushCommand({
            font: 'F1',
            size: 9.5,
            x: MARGIN_X + (idx === 0 ? 6 : 16),
            y: cursorY,
            text: idx === 0 ? `- ${line}` : line,
            gray: 0.18,
          });
          cursorY -= 13;
        });
      }
      cursorY -= 4;
    }

    if (section.table && section.table.rows.length > 0) {
      const headerStr = section.table.headers.join(' | ');
      const headerLines = wrapTextLines(headerStr, 92);
      ensureSpace(headerLines.length * 12 + 16);
      for (const hl of headerLines) {
        pushCommand({
          font: 'F2',
          size: 8.5,
          x: MARGIN_X + 2,
          y: cursorY,
          text: hl,
          gray: 0.12,
        });
        cursorY -= 12;
      }
      cursorY -= 2;

      for (const row of section.table.rows) {
        const rowStr = row.join(' | ');
        const rowLines = wrapTextLines(rowStr, 94);
        ensureSpace(rowLines.length * 11.5 + 3);
        for (const rl of rowLines) {
          pushCommand({
            font: 'F1',
            size: 8.2,
            x: MARGIN_X + 2,
            y: cursorY,
            text: rl,
            gray: 0.22,
          });
          cursorY -= 11.5;
        }
      }
      cursorY -= 6;
    }

    cursorY -= 6;
  }

  // Assemble valid PDF-1.4 objects
  const objects: string[] = [];
  const totalPages = pages.length;
  // Obj 1: Catalog, Obj 2: Pages, Obj 3: F1 Helvetica, Obj 4: F2 Helvetica-Bold
  const pageObjStart = 5;
  const pageRefs = Array.from(
    { length: totalPages },
    (_, i) => `${pageObjStart + i * 2} 0 R`
  ).join(' ');

  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${totalPages} >>\nendobj\n`
  );
  objects.push(
    `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`
  );
  objects.push(
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`
  );

  for (let pIdx = 0; pIdx < totalPages; pIdx += 1) {
    const pageObjId = pageObjStart + pIdx * 2;
    const contentObjId = pageObjId + 1;
    const cmds = pages[pIdx];

    const streamParts: string[] = [];
    for (const cmd of cmds) {
      const gray = cmd.gray ?? 0.1;
      streamParts.push(
        `BT /${cmd.font} ${cmd.size.toFixed(1)} Tf ${gray.toFixed(2)} g 1 0 0 1 ${cmd.x.toFixed(1)} ${cmd.y.toFixed(1)} Tm (${escapePdfLiteral(cmd.text)}) Tj ET`
      );
      if (typeof cmd.ruleBelowY === 'number') {
        streamParts.push(
          `0.78 G 0.6 w ${MARGIN_X} ${cmd.ruleBelowY.toFixed(1)} m ${PAGE_WIDTH - MARGIN_X} ${cmd.ruleBelowY.toFixed(1)} l S`
        );
      }
    }

    // Footer line + page number on every page
    streamParts.push(
      `0.85 G 0.5 w ${MARGIN_X} 36 m ${PAGE_WIDTH - MARGIN_X} 36 l S`
    );
    streamParts.push(
      `BT /F1 8.0 Tf 0.45 g 1 0 0 1 ${MARGIN_X} 24 Tm (${escapePdfLiteral(`FLARE - Flight & Lunar Atmosphere Risk Engine  |  Page ${pIdx + 1} of ${totalPages}`)}) Tj ET`
    );

    const streamBody = `${streamParts.join('\n')}\n`;
    const encoder = new TextEncoder();
    const streamLen = encoder.encode(streamBody).byteLength;

    objects.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjId} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamBody}endstream\nendobj\n`
    );
  }

  const encoder = new TextEncoder();
  const headerStr = '%PDF-1.4\n';
  const chunks: Uint8Array[] = [encoder.encode(headerStr)];
  const offsets: number[] = [0];
  let byteCursor = chunks[0].byteLength;

  for (const objStr of objects) {
    offsets.push(byteCursor);
    const bytes = encoder.encode(objStr);
    chunks.push(bytes);
    byteCursor += bytes.byteLength;
  }

  const xrefStart = byteCursor;
  const xrefRows = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets
      .slice(1)
      .map((off) => `${String(off).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefStart),
    '%%EOF\n',
  ].join('\n');

  chunks.push(encoder.encode(xrefRows));

  const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(totalLength);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  return out;
}

/**
 * Generates clean HTML wrapped in Microsoft Word MIME envelope (.doc).
 */
export function generateWordDocHtml(doc: ExportDocumentSpec): string {
  const sectionHtml = doc.sections
    .map((sec) => {
      const kvHtml =
        sec.keyValues && sec.keyValues.length > 0
          ? `<table style="width:100%;border-collapse:collapse;margin:8px 0 12px 0;">
              ${sec.keyValues
                .map(
                  (kv) => `<tr>
                    <td style="width:36%;padding:5px 8px;border:1px solid #d4d4d8;background:#f4f4f5;font-weight:600;font-size:10pt;color:#18181b;">${escapeHtml(kv.label)}</td>
                    <td style="padding:5px 8px;border:1px solid #d4d4d8;font-size:10pt;color:#27272a;">${escapeHtml(kv.value)}</td>
                  </tr>`
                )
                .join('')}
             </table>`
          : '';

      const paraHtml =
        sec.paragraphs && sec.paragraphs.length > 0
          ? sec.paragraphs
              .map(
                (p) =>
                  `<p style="margin:6px 0;font-size:10.5pt;line-height:1.45;color:#27272a;">${escapeHtml(p)}</p>`
              )
              .join('')
          : '';

      const bulletsHtml =
        sec.bullets && sec.bullets.length > 0
          ? `<ul style="margin:6px 0 10px 18px;padding:0;font-size:10pt;color:#27272a;">
              ${sec.bullets
                .map((b) => `<li style="margin:3px 0;">${escapeHtml(b)}</li>`)
                .join('')}
             </ul>`
          : '';

      const tableHtml =
        sec.table && sec.table.rows.length > 0
          ? `<table style="width:100%;border-collapse:collapse;margin:8px 0 12px 0;">
              <thead>
                <tr>
                  ${sec.table.headers
                    .map(
                      (h) =>
                        `<th style="padding:6px 7px;border:1px solid #a1a1aa;background:#18181b;color:#ffffff;font-size:9.5pt;text-align:left;">${escapeHtml(h)}</th>`
                    )
                    .join('')}
                </tr>
              </thead>
              <tbody>
                ${sec.table.rows
                  .map(
                    (row, idx) => `<tr style="background:${idx % 2 === 0 ? '#ffffff' : '#fafafa'};">
                      ${row
                        .map(
                          (cell) =>
                            `<td style="padding:5px 7px;border:1px solid #d4d4d8;font-size:9pt;color:#18181b;">${escapeHtml(cell)}</td>`
                        )
                        .join('')}
                    </tr>`
                  )
                  .join('')}
              </tbody>
             </table>`
          : '';

      return `<section style="margin-top:16px;">
        <h2 style="font-size:13pt;color:#09090b;border-bottom:1.5px solid #18181b;padding-bottom:4px;margin:0 0 8px 0;">${escapeHtml(sec.heading)}</h2>
        ${kvHtml}
        ${paraHtml}
        ${bulletsHtml}
        ${tableHtml}
      </section>`;
    })
    .join('\n');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(doc.title)}</title>
<style>
  @page { margin: 0.75in; }
  body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; color: #18181b; margin: 0; }
</style>
</head>
<body>
  <div style="border-bottom:2px solid #09090b;padding-bottom:10px;margin-bottom:14px;">
    <div style="font-size:9pt;text-transform:uppercase;letter-spacing:1px;color:#52525b;">FLARE - Flight &amp; Lunar Atmosphere Risk Engine</div>
    <h1 style="font-size:18pt;margin:4px 0 4px 0;color:#09090b;">${escapeHtml(doc.title)}</h1>
    ${
      doc.subtitle
        ? `<div style="font-size:10.5pt;color:#3f3f46;margin-bottom:4px;">${escapeHtml(doc.subtitle)}</div>`
        : ''
    }
    <div style="font-size:9pt;color:#52525b;">Generated: ${escapeHtml(doc.generatedAtIso)}</div>
  </div>
  ${sectionHtml}
</body>
</html>`;
}

function downloadDocumentSpec(
  doc: ExportDocumentSpec,
  baseFileName: string,
  format: 'doc' | 'pdf'
): void {
  if (format === 'doc') {
    const html = generateWordDocHtml(doc);
    triggerFileDownload(
      html,
      `${baseFileName}.doc`,
      'application/msword;charset=utf-8'
    );
  } else {
    const pdfBytes = generateClientPdfBytes(doc);
    triggerBinaryDownload(pdfBytes, `${baseFileName}.pdf`, 'application/pdf');
  }
}

/* ---------- Unified Workspace Exporters ---------- */

export function buildVirtualTestExportDoc(
  config: VirtualTestConfig,
  simulation: SimulationResponse,
  units: MeasurementUnits
): ExportDocumentSpec {
  const conf = simulation.modelConfidence;
  return {
    title: 'FLARE - Flight & Lunar Atmosphere Risk Engine · Virtual Test Lab Report',
    subtitle: `${config.material} · ${config.O2_pct.toFixed(1)}% O2 · ${formatPressure(config.P_psi, units)} · ${config.g_eff.toFixed(3)}g`,
    generatedAtIso: new Date().toISOString(),
    sections: [
      {
        heading: 'Test Chamber Settings',
        keyValues: [
          { label: 'Candidate Material', value: config.material },
          { label: 'Oxygen Concentration', value: `${config.O2_pct.toFixed(1)}% O2` },
          { label: 'Cabin Pressure', value: formatPressure(config.P_psi, units) },
          { label: 'Forced Airflow', value: formatAirflow(config.Flow_ms, units) },
          { label: 'Effective Gravity', value: `${config.g_eff.toFixed(3)}g` },
          { label: 'Sample Thickness', value: `${config.Thickness_mm.toFixed(1)} mm` },
          {
            label: 'Ignition Heat Flux',
            value: `${config.ignitionFlux_Wm2.toLocaleString()} W/m2`,
          },
        ],
      },
      {
        heading: 'Predicted Fire Behavior & Model Confidence',
        keyValues: [
          { label: 'Safety Outcome', value: simulation.hazardStatus },
          {
            label: 'Flame Spread Speed',
            value: `${formatFlameSpread(simulation.flameSpread_mms, units)} (+/- ${formatFlameSpread(simulation.confidenceInterval_mms, units)} 95% CI)`,
          },
          {
            label: 'Peak Gas Temperature',
            value: formatTemperature(simulation.peakTemp_K, units),
          },
          {
            label: '10s Flame Growth & Pressure Rise',
            value: `${simulation.forecast10s.radius_mm.toFixed(1)} mm radius (${formatPressureRiseKpa(simulation.forecast10s.pressureRise_kPa, units)})`,
          },
          {
            label: 'Safe Thickness Check',
            value: `${simulation.safeMaterialCheck.passed ? 'PASS' : 'FAIL'} (minimum ${simulation.safeMaterialCheck.minSafeThickness_mm.toFixed(1)} mm)`,
          },
          {
            label: 'Model Confidence',
            value: conf
              ? `${conf.confidencePct.toFixed(1)}% (${conf.validatedRunCount} nearby runs · Physical Test: ${conf.physicalTestingRecommendation})`
              : 'Local physics estimate',
          },
        ],
        paragraphs: conf ? [conf.rationale] : undefined,
      },
      {
        heading: 'Nearest Flight Reference Runs',
        table: {
          headers: ['PSI ID', 'Run Code', 'Material', 'O2 %', 'Pressure', 'Airflow', 'Flame Spread', 'Match', 'Outcome'],
          rows: simulation.nearestRuns.map(({ run, similarityPct }) => [
            run.psiId,
            run.runCode,
            run.material,
            `${run.O2_pct.toFixed(1)}%`,
            formatPressure(run.P_psi, units),
            formatAirflow(run.Flow_ms, units),
            formatFlameSpread(run.flameSpread_mms, units),
            `${similarityPct}%`,
            run.outcome,
          ]),
        },
      },
    ],
  };
}

export function exportVirtualTestFormatted(params: {
  config: VirtualTestConfig;
  simulation: SimulationResponse;
  units: MeasurementUnits;
  format: 'doc' | 'pdf' | 'json';
}): void {
  const { config, simulation, units, format } = params;
  const baseName = `FLARE-Safety-Report-${Date.now()}`;

  if (format === 'json') {
    triggerFileDownload(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          measurementUnits: units,
          config,
          simulation,
        },
        null,
        2
      ),
      `${baseName}.json`,
      'application/json;charset=utf-8'
    );
    return;
  }

  const doc = buildVirtualTestExportDoc(config, simulation, units);
  downloadDocumentSpec(doc, baseName, format);
}

export function exportComparisonFormatted(params: {
  selectedRuns: PsiRun[];
  units: MeasurementUnits;
  format: 'csv' | 'doc' | 'pdf' | 'json';
}): void {
  const { selectedRuns, units, format } = params;
  if (selectedRuns.length === 0) return;
  const baseName = `FLARE-Comparison-${Date.now()}`;

  if (format === 'csv') {
    triggerFileDownload(
      runRowsToCsv(selectedRuns),
      `${baseName}.csv`,
      'text/csv;charset=utf-8'
    );
    return;
  }

  if (format === 'json') {
    triggerFileDownload(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          measurementUnits: units,
          comparedRuns: selectedRuns,
        },
        null,
        2
      ),
      `${baseName}.json`,
      'application/json;charset=utf-8'
    );
    return;
  }

  const doc: ExportDocumentSpec = {
    title: 'FLARE - Flight & Lunar Atmosphere Risk Engine · Run Comparison Matrix',
    subtitle: `${selectedRuns.length} flight & virtual runs compared side-by-side`,
    generatedAtIso: new Date().toISOString(),
    sections: [
      {
        heading: 'Compared Runs Matrix',
        table: {
          headers: [
            'PSI ID',
            'Run Code',
            'Material',
            'Facility',
            'O2 %',
            'Pressure',
            'Airflow',
            'Gravity',
            'Peak Temp',
            'Flame Spread',
            'Outcome',
          ],
          rows: selectedRuns.map((r) => [
            r.psiId,
            r.runCode,
            r.material,
            r.facility,
            `${r.O2_pct.toFixed(1)}%`,
            formatPressure(r.P_psi, units),
            formatAirflow(r.Flow_ms, units),
            `${r.g_eff.toFixed(3)}g`,
            formatTemperature(r.peakTemp_K, units),
            formatFlameSpread(r.flameSpread_mms, units),
            r.outcome,
          ]),
        },
      },
    ],
  };

  downloadDocumentSpec(doc, baseName, format);
}

export function exportStudioChartFormatted(params: {
  snapshot: ActiveChartExportSnapshot;
  simulation: SimulationResponse;
  format: 'csv' | 'json' | 'doc' | 'pdf';
}): void {
  const { snapshot, simulation, format } = params;
  if (format === 'csv' || format === 'json') {
    exportStudioChartData({ snapshot, simulation, format });
    return;
  }

  const baseName = `FLARE-Chart-${snapshot.vizMode}-${Date.now()}`;
  const doc: ExportDocumentSpec = {
    title: `Visual Analytics - ${snapshot.techniqueName}`,
    subtitle: `${snapshot.datasetLabel} (${snapshot.plottedRuns.length.toLocaleString()} plotted runs)`,
    generatedAtIso: new Date().toISOString(),
    sections: [
      {
        heading: 'Chart Axis & Summary',
        keyValues: [
          { label: 'Chart Technique', value: `${snapshot.techniqueName} (${snapshot.vizMode})` },
          {
            label: 'X-Axis',
            value: `${snapshot.xAxisLabel}${snapshot.xAxisUnit ? ` (${snapshot.xAxisUnit})` : ''}`,
          },
          {
            label: 'Y-Axis',
            value: `${snapshot.yAxisLabel}${snapshot.yAxisUnit ? ` (${snapshot.yAxisUnit})` : ''}`,
          },
          { label: 'Color Grouping', value: snapshot.colorByLabel },
        ],
        paragraphs: [snapshot.headline],
      },
      {
        heading: `Plotted Data Snapshot (${Math.min(snapshot.plottedRuns.length, 40)} shown)`,
        table: {
          headers: ['PSI ID', 'Run Code', 'Material', 'X Value', 'Y Value', 'Group', 'Outcome'],
          rows: snapshot.plottedRuns.slice(0, 40).map((r) => [
            r.psiId,
            r.runCode,
            r.material,
            String(
              snapshot.getAxisValue
                ? snapshot.getAxisValue(r, snapshot.xAxisKey)
                : r.O2_pct.toFixed(1)
            ),
            String(
              snapshot.getAxisValue
                ? snapshot.getAxisValue(r, snapshot.yAxisKey)
                : r.flameSpread_mms.toFixed(2)
            ),
            String(
              snapshot.getAxisValue
                ? snapshot.getAxisValue(r, snapshot.colorByKey)
                : r.outcome
            ),
            r.outcome,
          ]),
        },
      },
    ],
  };

  downloadDocumentSpec(doc, baseName, format);
}

export function exportRunsDataFormatted(params: {
  runs: PsiRun[];
  selectedRunIds?: string[];
  title: string;
  units: MeasurementUnits;
  format: 'csv' | 'json' | 'doc' | 'pdf';
}): void {
  const { runs, selectedRunIds, title, units, format } = params;
  if (runs.length === 0) return;
  const baseName = `FLARE-Runs-Export-${Date.now()}`;

  if (format === 'csv') {
    triggerFileDownload(
      runRowsToCsv(runs, selectedRunIds),
      `${baseName}.csv`,
      'text/csv;charset=utf-8'
    );
    return;
  }

  if (format === 'json') {
    triggerFileDownload(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          title,
          totalRuns: runs.length,
          runs,
        },
        null,
        2
      ),
      `${baseName}.json`,
      'application/json;charset=utf-8'
    );
    return;
  }

  const doc: ExportDocumentSpec = {
    title,
    subtitle: `${runs.length.toLocaleString()} experimental runs (top ${Math.min(runs.length, 60)} tabulated)`,
    generatedAtIso: new Date().toISOString(),
    sections: [
      {
        heading: 'Experiment Runs Summary Table',
        table: {
          headers: ['PSI ID', 'Run Code', 'Material', 'Facility', 'O2 %', 'Pressure', 'Airflow', 'Spread', 'Outcome'],
          rows: runs.slice(0, 60).map((r) => [
            r.psiId,
            r.runCode,
            r.material,
            r.facility,
            `${r.O2_pct.toFixed(1)}%`,
            formatPressure(r.P_psi, units),
            formatAirflow(r.Flow_ms, units),
            formatFlameSpread(r.flameSpread_mms, units),
            r.outcome,
          ]),
        },
      },
    ],
  };

  downloadDocumentSpec(doc, baseName, format);
}

export function exportChatThreadFormatted(params: {
  thread: ChatThread | null;
  virtualConfig: VirtualTestConfig;
  simulation: SimulationResponse;
  units: MeasurementUnits;
  format: 'doc' | 'pdf' | 'md' | 'json';
}): void {
  const { thread, virtualConfig, simulation, units, format } = params;
  const messages = thread?.messages ?? [];
  const threadTitle = thread?.title || 'Model Console Session';
  const baseName = `FLARE-Chat-Export-${Date.now()}`;

  if (format === 'json') {
    triggerFileDownload(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          threadTitle,
          chamberContext: virtualConfig,
          predictedSpread_mms: simulation.flameSpread_mms,
          messages,
        },
        null,
        2
      ),
      `${baseName}.json`,
      'application/json;charset=utf-8'
    );
    return;
  }

  if (format === 'md') {
    const mdLines = [
      `# FLARE - Flight & Lunar Atmosphere Risk Engine · ${threadTitle}`,
      `Generated: ${new Date().toISOString()}`,
      `Active Chamber: ${virtualConfig.material} · ${virtualConfig.O2_pct.toFixed(1)}% O2 · ${formatPressure(virtualConfig.P_psi, units)} · ${formatFlameSpread(simulation.flameSpread_mms, units)}`,
      '',
    ];
    if (messages.length === 0) {
      mdLines.push('_No messages in this conversation yet._');
    } else {
      messages.forEach((m, idx) => {
        if (m.role === 'user') {
          mdLines.push(`## Message ${idx + 1} - Researcher (${m.timestamp})`, m.text ?? '', '');
        } else {
          mdLines.push(
            `## Message ${idx + 1} - Model Response (${m.timestamp})`,
            ...(m.steps ?? []).map((s) => `- ${s}`)
          );
          if (m.dataTable && m.dataTable.columns.length > 0 && m.dataTable.rows.length > 0) {
            mdLines.push(
              '',
              `### ${m.dataTable.title}`,
              `| ${m.dataTable.columns.join(' | ')} |`,
              `| ${m.dataTable.columns.map(() => '---').join(' | ')} |`,
              ...m.dataTable.rows.map((row) => `| ${row.map((c) => String(c)).join(' | ')} |`)
            );
          }
          if (m.citations && m.citations.length > 0) {
            mdLines.push(`- Cited Experiments: ${m.citations.join(', ')}`);
          }
          mdLines.push('');
        }
      });
    }
    triggerFileDownload(
      mdLines.filter((l) => l !== undefined).join('\n'),
      `${baseName}.md`,
      'text/markdown;charset=utf-8'
    );
    return;
  }

  const doc: ExportDocumentSpec = {
    title: `FLARE - Flight & Lunar Atmosphere Risk Engine · ${threadTitle}`,
    subtitle: `${virtualConfig.material} · ${virtualConfig.O2_pct.toFixed(1)}% O2 · ${formatPressure(virtualConfig.P_psi, units)} · ${formatFlameSpread(simulation.flameSpread_mms, units)}`,
    generatedAtIso: new Date().toISOString(),
    sections:
      messages.length === 0
        ? [
            {
              heading: 'Conversation Log',
              paragraphs: ['No messages recorded in this conversation yet.'],
            },
          ]
        : messages.map((m, idx) => ({
            heading:
              m.role === 'user'
                ? `${idx + 1}. Researcher Prompt (${m.timestamp})`
                : `${idx + 1}. Model Response (${m.timestamp})`,
            paragraphs: m.role === 'user' && m.text ? [m.text] : undefined,
            bullets: m.role === 'assistant' ? m.steps : undefined,
            table:
              m.role === 'assistant' && m.dataTable && m.dataTable.columns.length > 0 && m.dataTable.rows.length > 0
                ? {
                    headers: m.dataTable.columns,
                    rows: m.dataTable.rows.map((row) => row.map((c) => String(c))),
                  }
                : undefined,
            keyValues:
              m.citations && m.citations.length > 0
                ? [{ label: 'Cited Runs', value: m.citations.join(', ') }]
                : undefined,
          })),
  };

  downloadDocumentSpec(doc, baseName, format);
}

export function exportHeaderBundleFormatted(params: {
  sections: HeaderExportSectionId[];
  format: HeaderExportFormat;
  config: VirtualTestConfig;
  simulation: SimulationResponse;
  selectedRuns: PsiRun[];
  activeChart: ActiveChartExportSnapshot;
  consoleMessages: AssistantMessage[];
  units: MeasurementUnits;
}): void {
  const {
    sections,
    format,
    config,
    simulation,
    selectedRuns,
    activeChart,
    consoleMessages,
    units,
  } = params;
  if (sections.length === 0) return;

  if (format === 'md' || format === 'json') {
    exportHeaderBundle({
      sections,
      format,
      config,
      simulation,
      selectedRuns,
      activeChart,
      consoleMessages,
    });
    return;
  }

  const docSections: ExportSectionBlock[] = [];
  if (sections.includes('virtual-chamber')) {
    const vtl = buildVirtualTestExportDoc(config, simulation, units);
    docSections.push(...vtl.sections.slice(0, 2));
  }
  if (sections.includes('material-limits')) {
    docSections.push({
      heading: 'Material Qualification & Quenching Limits',
      table: {
        headers: ['Material', 'Code', 'Spread Rate', 'Limiting O2 %', 'Smoke Index', 'Status'],
        rows: simulation.materialRankings.map((m) => [
          m.name,
          m.code,
          formatFlameSpread(m.flameSpread_mms, units),
          `${m.limitingO2_pct.toFixed(1)}%`,
          m.smokeClumpingIndex.toFixed(1),
          m.status,
        ]),
      },
    });
  }
  if (sections.includes('comparison-matrix')) {
    docSections.push({
      heading: 'Selected Comparison Runs Matrix',
      table:
        selectedRuns.length > 0
          ? {
              headers: ['PSI ID', 'Run Code', 'Material', 'O2 %', 'Pressure', 'Spread', 'Outcome'],
              rows: selectedRuns.map((r) => [
                r.psiId,
                r.runCode,
                r.material,
                `${r.O2_pct.toFixed(1)}%`,
                formatPressure(r.P_psi, units),
                formatFlameSpread(r.flameSpread_mms, units),
                r.outcome,
              ]),
            }
          : {
              headers: ['Status'],
              rows: [['No comparison runs currently selected.']],
            },
    });
  }
  if (sections.includes('visual-chart')) {
    docSections.push({
      heading: 'Visual Analytics Active Chart Summary',
      keyValues: [
        { label: 'Chart Type', value: `${activeChart.techniqueName} (${activeChart.vizMode})` },
        { label: 'Active Dataset', value: `${activeChart.datasetLabel} (${activeChart.plottedRuns.length} runs)` },
        { label: 'Axes', value: `X=${activeChart.xAxisLabel} | Y=${activeChart.yAxisLabel} | Color=${activeChart.colorByLabel}` },
      ],
      paragraphs: [activeChart.headline],
    });
  }
  if (sections.includes('console-notes')) {
    docSections.push({
      heading: 'Model Console Session Notes & Citations',
      bullets:
        consoleMessages.length === 0
          ? ['No Model Console messages recorded in this session yet.']
          : consoleMessages.flatMap((msg, idx) =>
              msg.role === 'user'
                ? [`[${idx + 1} Prompt] ${msg.text ?? ''}`]
                : (msg.steps ?? []).map((s) => `[${idx + 1} Model] ${s}`)
            ),
    });
  }

  downloadDocumentSpec(
    {
      title: 'FLARE - Flight & Lunar Atmosphere Risk Engine · Custom Export Bundle',
      subtitle: `${sections.length} selected workspace section(s)`,
      generatedAtIso: new Date().toISOString(),
      sections: docSections,
    },
    `FLARE-Custom-Bundle-${Date.now()}`,
    format
  );
}

export function getExportFormatLabel(fmt: ExportFileFormat): string {
  switch (fmt) {
    case 'pdf':
      return 'PDF Report (.pdf)';
    case 'doc':
      return 'Word Document (.doc)';
    case 'csv':
      return 'CSV Table (.csv)';
    case 'json':
      return 'JSON Data (.json)';
    case 'md':
      return 'Markdown (.md)';
  }
}

export function createCsvDownloadFromBuildHelper(
  headers: string[],
  rows: Array<Array<string | number>>
): string {
  return buildCsvDocument(headers, rows);
}
