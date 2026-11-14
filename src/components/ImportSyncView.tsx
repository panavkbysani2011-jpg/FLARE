import React, { useState } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  ShieldAlert,
  RefreshCw,
  Database,
} from 'lucide-react';
import { PsiRun, SyncChangelogEntry, ThemeMode } from '../types/psi';
import {
  ImportValidationResult,
  SAMPLE_COMBUSTION_CSV,
  SAMPLE_UNRELATED_CSV,
} from '../utils/dataImporter';
import { processCustomDatasetUpload } from '../services/psiApi';

interface ImportSyncViewProps {
  theme: ThemeMode;
  onImportSuccess: (newRuns: PsiRun[]) => void;
  syncEntries: SyncChangelogEntry[];
  hasSimulatedNewSync: boolean;
  onSimulateNewSync: () => void;
  onSelectRunFromSync: (psiId: string) => void;
}

export const ImportSyncView: React.FC<ImportSyncViewProps> = ({
  theme,
  onImportSuccess,
  syncEntries,
  hasSimulatedNewSync,
  onSimulateNewSync,
  onSelectRunFromSync,
}) => {
  const [rawText, setRawText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('custom_dataset.csv');
  const [isNormalizing, setIsNormalizing] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [validationResult, setValidationResult] =
    useState<ImportValidationResult | null>(null);
  const [importedCommitMessage, setImportedCommitMessage] = useState<
    string | null
  >(null);

  const isDark = theme === 'dark';
  const cardSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const triggerValidationWithSkeleton = (content: string, name: string) => {
    setImportedCommitMessage(null);
    setRawText(content);
    setFileName(name);
    setIsNormalizing(true);
    const result = processCustomDatasetUpload(content, name);
    setTimeout(() => {
      setValidationResult(result);
      setIsNormalizing(false);
    }, 300);
  };

  const handleFileUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      triggerValidationWithSkeleton(content, file.name);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFileUpload(file);
  };

  const handleCommitImport = () => {
    if (
      validationResult &&
      validationResult.valid &&
      validationResult.parsedRuns.length > 0
    ) {
      onImportSuccess(validationResult.parsedRuns);
      setImportedCommitMessage(
        `Added ${validationResult.parsedRuns.length} normalized runs to Experiment Catalog & Simulator.`
      );
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
      {/* Left 7 Columns: Domain-Gated CSV/JSON Custom Data Importer */}
      <section
        className={`xl:col-span-7 border rounded-[6px] p-5 space-y-4 ${cardSurface}`}
      >
        <div className="pb-3 border-b border-zinc-200 dark:border-[#27272A]">
          <h2 className="font-display text-base font-semibold">
            Domain-Gated Custom Data Importer
          </h2>
          <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400 mt-0.5">
            Automatically validates combustion/spacecraft domain headers and
            normalizes pressure (kPa/atm → psi) and airflow (cm/s → m/s).
          </p>
        </div>

        {/* Primary Visual Element: Drag-and-Drop Upload Zone */}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`w-full py-6 px-4 rounded-[5px] border-2 border-dashed flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${
            isDragging
              ? isDark
                ? 'border-zinc-200 bg-zinc-900/70'
                : 'border-zinc-900 bg-zinc-100/80'
              : isDark
              ? 'border-[#27272A] bg-[#09090B]/60 hover:border-zinc-600'
              : 'border-zinc-300 bg-zinc-50/70 hover:border-zinc-500'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-[4px] flex items-center justify-center mb-2 ${
              isDark
                ? 'bg-[#FAFAFA] text-[#09090B]'
                : 'bg-[#18181B] text-[#FFFFFF]'
            }`}
          >
            <Upload className="w-4 h-4" />
          </div>
          <span className="text-xs font-sans font-semibold">
            Drop .CSV or .JSON combustion telemetry here, or click to browse
          </span>
          <span className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400 mt-1">
            Supports raw PSI spreadsheets, thermocouple logs, and mixed-unit
            pressure/flow arrays
          </span>
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={(e) => handleFileUpload(e.target.files?.[0])}
            className="hidden"
          />
        </label>

        {/* Secondary Compact Outline Buttons Below Drag-and-Drop Zone */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11px] font-sans text-zinc-500 dark:text-zinc-400">
            Quick Verification Presets:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                triggerValidationWithSkeleton(
                  SAMPLE_COMBUSTION_CSV,
                  'sofie_lunar_sweep_mixed_units.csv'
                )
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium rounded-[4px] border transition-colors cursor-pointer ${
                isDark
                  ? 'border-[#27272A] bg-transparent text-zinc-200 hover:bg-zinc-800'
                  : 'border-[#E4E4E7] bg-white text-zinc-800 hover:bg-zinc-100'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Load Sample Combustion CSV</span>
            </button>

            <button
              type="button"
              onClick={() =>
                triggerValidationWithSkeleton(
                  SAMPLE_UNRELATED_CSV,
                  'enterprise_quarterly_sales.csv'
                )
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-sans font-medium rounded-[4px] border transition-colors cursor-pointer ${
                isDark
                  ? 'border-[#27272A] bg-transparent text-zinc-300 hover:bg-zinc-800'
                  : 'border-[#E4E4E7] bg-white text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-[#F59E0B]" />
              <span>Test Unrelated File Rejection</span>
            </button>
          </div>
        </div>

        {/* Raw Input Buffer */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-sans text-zinc-500 dark:text-zinc-400">
              Source Buffer:{' '}
              <span className="font-mono text-zinc-700 dark:text-zinc-200">
                {fileName}
              </span>
            </span>
            <button
              type="button"
              onClick={() => triggerValidationWithSkeleton(rawText, fileName)}
              className="text-xs font-sans font-medium underline cursor-pointer"
            >
              Re-validate Buffer
            </button>
          </div>
          <textarea
            rows={3}
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              const res = processCustomDatasetUpload(e.target.value, fileName);
              setValidationResult(res);
            }}
            placeholder="Paste CSV or JSON combustion telemetry here..."
            className={`w-full p-2.5 text-xs font-mono rounded-[4px] border focus:outline-none ${
              isDark
                ? 'bg-[#09090B] border-[#27272A] text-zinc-200 focus:border-zinc-500'
                : 'bg-zinc-50 border-[#E4E4E7] text-zinc-800 focus:border-zinc-500'
            }`}
          />
        </div>

        {/* Skeleton Loading Transition (300ms) */}
        {isNormalizing && (
          <div
            className={`p-4 rounded-[4px] border space-y-2.5 animate-pulse ${
              isDark
                ? 'bg-[#09090B] border-[#27272A]'
                : 'bg-zinc-50 border-[#E4E4E7]'
            }`}
          >
            <div className="h-3.5 w-48 bg-zinc-300 dark:bg-zinc-800 rounded" />
            <div className="h-3 w-full bg-zinc-200 dark:bg-zinc-800/70 rounded" />
            <div className="h-3 w-4/5 bg-zinc-200 dark:bg-zinc-800/70 rounded" />
          </div>
        )}

        {/* Validation Status & Normalized Preview */}
        {!isNormalizing && validationResult && (
          <div>
            {!validationResult.valid ? (
              <div className="p-3.5 rounded-[4px] border border-[#EF4444]/40 bg-[#EF4444]/10 text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-sans font-semibold text-[#EF4444]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Domain Relevance Gatekeeper Blocked Import</span>
                </div>
                <p className="font-sans text-zinc-700 dark:text-zinc-200 leading-relaxed">
                  {validationResult.reason}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-[4px] border border-[#10B981]/40 bg-[#10B981]/10 text-xs space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-sans font-semibold text-[#10B981]">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Domain Verified ({validationResult.parsedRuns.length}{' '}
                        Runs Normalized)
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                      Matched keys:{' '}
                      {validationResult.detectedKeywords.join(', ')}
                    </span>
                  </div>
                  {validationResult.unitConversionsApplied.length > 0 && (
                    <div className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300 pt-1">
                      Smart Unit Normalizer:{' '}
                      {validationResult.unitConversionsApplied.join(' · ')}
                    </div>
                  )}
                </div>

                {/* Normalized Preview Table */}
                <div
                  className={`border rounded-[4px] overflow-x-auto ${
                    isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                  }`}
                >
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr
                        className={`border-b font-sans text-[11px] font-semibold text-zinc-500 ${
                          isDark
                            ? 'bg-[#09090B] border-[#27272A]'
                            : 'bg-zinc-50 border-[#E4E4E7]'
                        }`}
                      >
                        <th className="py-2 px-2.5">PSI ID</th>
                        <th className="py-2 px-2.5">Material</th>
                        <th className="py-2 px-2.5">O₂ %</th>
                        <th className="py-2 px-2.5">Pressure (psi)</th>
                        <th className="py-2 px-2.5">Airflow (m/s)</th>
                        <th className="py-2 px-2.5">Gravity</th>
                        <th className="py-2 px-2.5">Spread (mm/s)</th>
                      </tr>
                    </thead>
                    <tbody
                      className={`divide-y font-mono tabular-nums ${
                        isDark ? 'divide-[#27272A]' : 'divide-[#E4E4E7]'
                      }`}
                    >
                      {validationResult.parsedRuns.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2 px-2.5 font-semibold">
                            {r.psiId}
                          </td>
                          <td className="py-2 px-2.5 font-sans">
                            {r.material}
                          </td>
                          <td className="py-2 px-2.5">
                            {r.O2_pct.toFixed(1)}%
                          </td>
                          <td className="py-2 px-2.5">
                            {r.P_psi.toFixed(1)} psi
                          </td>
                          <td className="py-2 px-2.5">
                            {r.Flow_ms.toFixed(2)} m/s
                          </td>
                          <td className="py-2 px-2.5">
                            {r.g_eff.toFixed(3)}g
                          </td>
                          <td className="py-2 px-2.5 font-semibold">
                            {r.flameSpread_mms.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between pt-2">
                  {importedCommitMessage ? (
                    <span className="text-xs font-sans font-medium text-[#10B981]">
                      {importedCommitMessage}
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={handleCommitImport}
                    className={`px-4 py-2 text-xs font-sans font-semibold rounded-[4px] transition-colors cursor-pointer ${
                      isDark
                        ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200'
                        : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800'
                    }`}
                  >
                    Add Normalized Runs to Catalog
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Right 5 Columns: PSI Archive Sync Changelog Feed */}
      <section
        className={`xl:col-span-5 border rounded-[6px] p-5 space-y-4 ${cardSurface}`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-[#27272A]">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-zinc-500" />
            <h2 className="font-display text-base font-semibold">
              PSI Archive Sync Log
            </h2>
          </div>
          <span className="font-mono text-[11px] text-zinc-400">
            Schema v3.4
          </span>
        </div>

        <button
          type="button"
          disabled={hasSimulatedNewSync}
          onClick={onSimulateNewSync}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-sans font-semibold rounded-[4px] border transition-colors cursor-pointer ${
            hasSimulatedNewSync
              ? 'border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981] cursor-default'
              : isDark
              ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA] hover:bg-zinc-200'
              : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B] hover:bg-zinc-800'
          }`}
        >
          {hasSimulatedNewSync ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Synced PSI-164 SOFIE-MIST (31 Runs Added)</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Simulate Syncing New Investigation (PSI-164)</span>
            </>
          )}
        </button>

        <div className="space-y-3">
          {syncEntries.map((entry) => (
            <div
              key={entry.id}
              className={`p-3.5 rounded-[5px] border ${
                isDark
                  ? 'bg-[#09090B]/70 border-[#27272A]'
                  : 'bg-zinc-50/80 border-[#E4E4E7]'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold">{entry.psiId}</span>
                <span className="text-zinc-400">{entry.syncedAt}</span>
              </div>
              <h3 className="mt-1 text-xs font-sans font-semibold">
                {entry.title}
              </h3>
              <p className="mt-1 text-xs font-sans text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {entry.summary}
              </p>
              <div
                className={`mt-2.5 pt-2 border-t flex items-center justify-between text-[11px] text-zinc-500 ${
                  isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                }`}
              >
                <span className="font-mono">
                  Facility: {entry.facility} · +{entry.runsAdded} Runs
                </span>
                <button
                  type="button"
                  onClick={() => onSelectRunFromSync(entry.psiId)}
                  className="font-sans font-semibold text-zinc-800 dark:text-zinc-200 hover:underline cursor-pointer"
                >
                  Inspect Run Details →
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
