import React, { useState } from 'react';
import {
  X,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  ShieldAlert,
} from 'lucide-react';
import { PsiRun, ThemeMode } from '../types/psi';
import {
  ImportValidationResult,
  SAMPLE_COMBUSTION_CSV,
  SAMPLE_UNRELATED_CSV,
} from '../utils/dataImporter';
import { processCustomDatasetUpload } from '../services/psiApi';

interface ImportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onImportSuccess: (newRuns: PsiRun[]) => void;
}

export const ImportDataModal: React.FC<ImportDataModalProps> = ({
  isOpen,
  onClose,
  theme,
  onImportSuccess,
}) => {
  const [rawText, setRawText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('custom_dataset.csv');
  const [validationResult, setValidationResult] =
    useState<ImportValidationResult | null>(null);

  if (!isOpen) return null;

  const handleValidate = (content: string, name: string) => {
    setRawText(content);
    setFileName(name);
    const result = processCustomDatasetUpload(content, name);
    setValidationResult(result);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      handleValidate(content, file.name);
    };
    reader.readAsText(file);
  };

  const handleCommitImport = () => {
    if (validationResult && validationResult.valid && validationResult.parsedRuns.length > 0) {
      onImportSuccess(validationResult.parsedRuns);
      onClose();
    }
  };

  const modalSurface =
    theme === 'dark'
      ? 'bg-[#1E293B] border-white/15 text-[#F8FAFC]'
      : 'bg-white border-slate-300 text-[#0F172A]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Domain-Gated Custom Data Importer"
    >
      <div
        className={`w-full max-w-2xl border rounded-[6px] p-5 shadow-2xl max-h-[90vh] overflow-y-auto ${modalSurface}`}
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-white/10">
          <div>
            <h2 className="font-display text-base font-bold">
              Import Custom Combustion Dataset
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Domain Relevance Gatekeeper & Automatic Unit Normalizer (kPa/atm → psi, cm/s → m/s)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Import Modal"
            className="p-1.5 rounded-[4px] text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* One-Click Test Buttons + File Input */}
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() =>
              handleValidate(SAMPLE_COMBUSTION_CSV, 'sofie_lunar_sweep_mixed_units.csv')
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[4px] bg-[#0284C7] dark:bg-[#38BDF8] text-white dark:text-slate-950 hover:opacity-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Load Sample Combustion CSV</span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleValidate(SAMPLE_UNRELATED_CSV, 'enterprise_quarterly_sales.csv')
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[4px] border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Test Unrelated File Rejection</span>
          </button>

          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[4px] border border-slate-300 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload .CSV / .JSON File</span>
            <input
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        {/* Raw Input Editor / Inspector */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-mono text-slate-500 dark:text-slate-400">
              Source Buffer: {fileName}
            </span>
            <button
              type="button"
              onClick={() => handleValidate(rawText, fileName)}
              className="text-xs font-medium text-[#0284C7] dark:text-[#38BDF8] hover:underline cursor-pointer"
            >
              Re-validate Buffer
            </button>
          </div>
          <textarea
            rows={4}
            value={rawText}
            onChange={(e) => handleValidate(e.target.value, fileName)}
            placeholder="Paste CSV or JSON combustion telemetry here, or click 'Load Sample Combustion CSV' above..."
            className={`w-full p-2.5 text-xs font-mono rounded-[4px] border focus:outline-none focus:border-[#0284C7] ${
              theme === 'dark'
                ? 'bg-[#0F172A] border-white/10 text-slate-200'
                : 'bg-slate-50 border-slate-300 text-slate-800'
            }`}
          />
        </div>

        {/* Validation Feedback */}
        {validationResult && (
          <div className="mt-4">
            {!validationResult.valid ? (
              <div className="p-3.5 rounded-[4px] border border-[#EF4444]/40 bg-[#EF4444]/10 text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-[#EF4444]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Domain Relevance Gatekeeper Blocked Import</span>
                </div>
                <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                  {validationResult.reason}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-[4px] border border-[#10B981]/40 bg-[#10B981]/10 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-[#10B981]">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Domain Verified ({validationResult.parsedRuns.length} Runs Normalized)
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      Matched keys: {validationResult.detectedKeywords.join(', ')}
                    </span>
                  </div>
                  {validationResult.unitConversionsApplied.length > 0 && (
                    <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 pt-1">
                      Smart Unit Normalizer: {validationResult.unitConversionsApplied.join(' · ')}
                    </div>
                  )}
                </div>

                {/* Normalized Preview Table */}
                <div className="border border-slate-200 dark:border-white/10 rounded-[4px] overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-100/70 dark:bg-slate-900/60 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        <th className="py-2 px-2.5">PSI ID</th>
                        <th className="py-2 px-2.5">Material</th>
                        <th className="py-2 px-2.5">O₂ %</th>
                        <th className="py-2 px-2.5">Pressure (psi)</th>
                        <th className="py-2 px-2.5">Airflow (m/s)</th>
                        <th className="py-2 px-2.5">Gravity</th>
                        <th className="py-2 px-2.5">Spread (mm/s)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-white/5 font-mono tabular-nums">
                      {validationResult.parsedRuns.map((r) => (
                        <tr key={r.id}>
                          <td className="py-1.5 px-2.5 font-semibold text-[#0284C7] dark:text-[#38BDF8]">
                            {r.psiId}
                          </td>
                          <td className="py-1.5 px-2.5 font-sans">{r.material}</td>
                          <td className="py-1.5 px-2.5">{r.O2_pct.toFixed(1)}%</td>
                          <td className="py-1.5 px-2.5">{r.P_psi.toFixed(1)} psi</td>
                          <td className="py-1.5 px-2.5">{r.Flow_ms.toFixed(2)} m/s</td>
                          <td className="py-1.5 px-2.5">{r.g_eff.toFixed(3)}g</td>
                          <td className="py-1.5 px-2.5 font-semibold">
                            {r.flameSpread_mms.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-5 pt-3.5 border-t border-slate-200 dark:border-white/10 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-[4px] border border-slate-300 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!validationResult?.valid}
            onClick={handleCommitImport}
            className={`px-4 py-1.5 text-xs font-semibold rounded-[4px] transition-colors cursor-pointer ${
              validationResult?.valid
                ? 'bg-[#0284C7] dark:bg-[#38BDF8] text-white dark:text-slate-950 hover:opacity-95'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
            }`}
          >
            Add Normalized Runs to Catalog
          </button>
        </div>
      </div>
    </div>
  );
};
