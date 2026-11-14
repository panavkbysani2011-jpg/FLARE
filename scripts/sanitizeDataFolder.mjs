import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');
const OLD_BASE = path.join(PUBLIC_DATA, 'Nasa space apps - DATA', 'Nasa space apps');
const OLD_NASA = path.join(OLD_BASE, 'nasa');

const TARGET_DIR = path.join(PUBLIC_DATA, 'nasa-space-apps');
const TARGET_PROCESSED = path.join(TARGET_DIR, 'processed');
const TARGET_METADATA = path.join(TARGET_DIR, 'metadata');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function toKebabFilename(name) {
  const ext = path.extname(name).toLowerCase();
  const stem = path.basename(name, path.extname(name));
  const kebab = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${kebab}${ext}`;
}

function main() {
  if (!fs.existsSync(OLD_BASE)) {
    console.log('Old folder already removed or not found:', OLD_BASE);
    return;
  }

  ensureDir(TARGET_DIR);
  ensureDir(TARGET_PROCESSED);
  ensureDir(TARGET_METADATA);

  // 1. Move ISS Researcher's Guide PDF
  const guidePdfName =
    'np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf';
  const oldGuidePdf = path.join(OLD_BASE, guidePdfName);
  if (fs.existsSync(oldGuidePdf)) {
    fs.copyFileSync(oldGuidePdf, path.join(TARGET_DIR, guidePdfName));
    console.log('Copied ISS Researcher Guide PDF');
  }

  // 2. Move core JSON/CSV files and SAME EIRD PDF
  const directFiles = [
    ['master_psi_telemetry.csv', 'master_psi_telemetry.csv'],
    ['psi_runs_catalog.json', 'psi_runs_catalog.json'],
    ['psi_inventory_manifest.json', 'psi_inventory_manifest.json'],
    ['SAME EIRD Rev 2.00 02-25-05 HIgh Q.pdf', 'same-eird-rev-2-00-02-25-05-high-q.pdf'],
  ];

  for (const [srcName, dstName] of directFiles) {
    const srcPath = path.join(OLD_NASA, srcName);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(TARGET_DIR, dstName));
      console.log(`Copied ${srcName} -> ${dstName}`);
    }
  }

  // 3. Move all ZIP metadata files to metadata/ with kebab-case filenames
  const nasaEntries = fs.readdirSync(OLD_NASA);
  for (const entry of nasaEntries) {
    if (entry.toLowerCase().endsWith('.zip')) {
      const kebab = toKebabFilename(entry);
      fs.copyFileSync(path.join(OLD_NASA, entry), path.join(TARGET_METADATA, kebab));
    }
  }
  console.log('Copied metadata zip archives to metadata/');

  // 4. Audit & downsample psi_literature_chunks.json (> 15 MB)
  const rawChunksPath = path.join(OLD_NASA, 'psi_literature_chunks.json');
  if (fs.existsSync(rawChunksPath)) {
    const stats = fs.statSync(rawChunksPath);
    console.log(
      `Raw psi_literature_chunks.json size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`
    );
    const rawChunks = JSON.parse(fs.readFileSync(rawChunksPath, 'utf8'));

    const chunksByPsiId = {};
    const docStatsMap = new Map();
    const seenTextSignatures = new Set();

    const guideSourceFile =
      'PSI-20_Science Documents_ISS_Researchers_Guide_-_Combustion_In_Reduced_Gravity.pdf';
    const guideSourceFileDup =
      'PSI-22_Science Documents_ISS Researchers Guide - Combustion In Reduced Gravity.pdf';

    const guideChunks = [];
    const curatedOtherChunks = [];
    const perPsiCount = {};

    // First collect all corpus stats & all 190 guide chunks
    for (const chunk of rawChunks) {
      const psiId = String(chunk.psi_id || 'UNKNOWN');
      const src = String(chunk.source_file || 'unknown');
      chunksByPsiId[psiId] = (chunksByPsiId[psiId] || 0) + 1;

      if (!docStatsMap.has(src)) {
        docStatsMap.set(src, {
          source_file: src,
          psi_id: psiId,
          chunk_count: 0,
          max_page: 0,
        });
      }
      const ds = docStatsMap.get(src);
      ds.chunk_count += 1;
      if (typeof chunk.page_number === 'number' && chunk.page_number > ds.max_page) {
        ds.max_page = chunk.page_number;
      }

      if (src === guideSourceFile) {
        guideChunks.push(chunk);
        const sig = String(chunk.text || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 140);
        if (sig) seenTextSignatures.add(sig);
      }
    }

    // Rank/select informative chunks per PSI investigation (reports, science docs, >220 chars, non-duplicate)
    const perSourceCount = {};
    for (const chunk of rawChunks) {
      const psiId = String(chunk.psi_id || 'UNKNOWN');
      const src = String(chunk.source_file || '');
      if (src === guideSourceFile || src === guideSourceFileDup) continue;

      const textClean = String(chunk.text || '').replace(/\s+/g, ' ').trim();
      if (textClean.length < 180) continue;

      const sig = textClean.slice(0, 140);
      if (seenTextSignatures.has(sig)) continue;

      // Prioritize Final Reports & Science Documents & Dissertations, plus balanced coverage per PSI ID
      const isReportOrScience =
        src.includes('Reports_') ||
        src.includes('Science Documents_') ||
        src.includes('Dissertation');

      const psiTotal = perPsiCount[psiId] || 0;
      const srcTotal = perSourceCount[src] || 0;

      // Keep up to 60 chunks per PSI ID and 25 per source doc (prioritizing pages >= 3 for substance)
      if (psiTotal >= 65 || srcTotal >= 25) continue;
      if (chunk.page_number <= 2 && isReportOrScience === false && psiTotal > 5) continue;

      seenTextSignatures.add(sig);
      perPsiCount[psiId] = psiTotal + 1;
      perSourceCount[src] = srcTotal + 1;
      curatedOtherChunks.push(chunk);
    }

    const compactChunks = [...guideChunks, ...curatedOtherChunks];

    const summaryPayload = {
      generatedAt: new Date().toISOString(),
      rawSizeBytes: stats.size,
      rawSizeMB: Number((stats.size / (1024 * 1024)).toFixed(2)),
      totalRawChunks: rawChunks.length,
      totalSourceDocuments: docStatsMap.size,
      compactChunkCount: compactChunks.length,
      guideChunkCount: guideChunks.length,
      chunksByPsiId,
      topDocuments: Array.from(docStatsMap.values())
        .sort((a, b) => b.chunk_count - a.chunk_count)
        .slice(0, 60),
    };

    fs.writeFileSync(
      path.join(TARGET_PROCESSED, 'psi_literature_summary.json'),
      JSON.stringify(summaryPayload, null, 2),
      'utf8'
    );

    fs.writeFileSync(
      path.join(TARGET_DIR, 'psi_literature_chunks.json'),
      JSON.stringify(compactChunks),
      'utf8'
    );

    const newSize = fs.statSync(path.join(TARGET_DIR, 'psi_literature_chunks.json')).size;
    console.log(
      `Wrote compact psi_literature_chunks.json: ${compactChunks.length} chunks (${(
        newSize /
        (1024 * 1024)
      ).toFixed(2)} MB)`
    );
  }

  // 5. Remove old directory with spaces
  fs.rmSync(path.join(PUBLIC_DATA, 'Nasa space apps - DATA'), {
    recursive: true,
    force: true,
  });
  console.log('Removed old folder with spaces: Nasa space apps - DATA');
}

main();
