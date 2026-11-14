import React, { useState } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  ShieldAlert,
  Database,
  Server,
  Eye,
  EyeOff,
  Activity,
} from 'lucide-react';
import {
  DataManifestFileRecord,
  PsiApiEndpointConfig,
  PsiRun,
  SessionIngestionEvent,
  ThemeMode,
  WorkspaceView,
} from '../types/psi';
import {
  ImportValidationResult,
  SAMPLE_COMBUSTION_CSV,
  SAMPLE_UNRELATED_CSV,
} from '../utils/dataImporter';
import {
  getApiEndpointConfig,
  processCustomDatasetUpload,
  saveApiEndpointConfig,
  testApiEndpointHealth,
} from '../services/psiApi';
import { CollapsibleCard } from './CollapsibleCard';

interface ImportSyncViewProps {
  theme: ThemeMode;
  onImportSuccess: (
    newRuns: PsiRun[],
    meta: { fileName: string; unitConversionsApplied: string[] }
  ) => void;
  manifestFiles: DataManifestFileRecord[];
  sessionEvents: SessionIngestionEvent[];
  isArchiveLoading: boolean;
  onInspectRunFromManifest: (runId: string) => void;
  onNavigateArchiveView: (view: WorkspaceView) => void;
}

function formatByteSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export const ImportSyncView: React.FC<ImportSyncViewProps> = ({
  theme,
  onImportSuccess,
  manifestFiles,
  sessionEvents,
  isArchiveLoading,
  onInspectRunFromManifest,
  onNavigateArchiveView,
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

  // Runtime FastAPI + API Key Endpoint Settings
  const [endpointConfig, setEndpointConfig] = useState<PsiApiEndpointConfig>(() =>
    getApiEndpointConfig()
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingEndpoint, setIsTestingEndpoint] = useState(false);
  const [endpointHealthNotice, setEndpointHealthNotice] = useState<{
    mode: 'remote' | 'offline-fallback';
    ok: boolean;
    message: string;
  } | null>(null);

  const isDark = theme === 'dark';
  const cardSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';
  const subSurface = isDark
    ? 'bg-[#09090B]/70 border-[#27272A]'
    : 'bg-zinc-50/80 border-[#E4E4E7]';

  const handleSaveEndpointConfig = () => {
    const saved = saveApiEndpointConfig(endpointConfig);
    setEndpointConfig(saved);
    setEndpointHealthNotice({
      ok: true,
      mode: saved.baseUrl ? 'remote' : 'offline-fallback',
      message: saved.baseUrl
        ? `Saved runtime FastAPI endpoint: ${saved.baseUrl} (automatic offline fallback remains active if unreachable).`
        : 'Cleared remote endpoint. Operating via Local Physics + Archive Inference Engine.',
    });
  };

  const handleTestEndpoint = async () => {
    setIsTestingEndpoint(true);
    const saved = saveApiEndpointConfig(endpointConfig);
    setEndpointConfig(saved);
    const result = await testApiEndpointHealth(saved);
    setEndpointHealthNotice({
      ok: result.ok,
      mode: result.mode,
      message: result.message,
    });
    setIsTestingEndpoint(false);
  };

  const handleUseOfflineEngine = () => {
    const cleared = saveApiEndpointConfig({
      baseUrl: '',
      apiKeyHeader: endpointConfig.apiKeyHeader,
      apiKeyValue: '',
    });
    setEndpointConfig(cleared);
    setEndpointHealthNotice({
      ok: true,
      mode: 'offline-fallback',
      message:
        'Switched cleanly to Local Physics + Archive Inference Engine (zero external network dependency).',
    });
  };

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
      onImportSuccess(validationResult.parsedRuns, {
        fileName,
        unitConversionsApplied: validationResult.unitConversionsApplied,
      });
      setImportedCommitMessage(
        `Added ${validationResult.parsedRuns.length} normalized runs to Experiment Catalog & Simulator.`
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-lg font-bold tracking-tight">
          Data Import, Unit Normalizer &amp; FastAPI Sync
        </h1>
        <span className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
          Domain-gated CSV/JSON ingestion and live inference endpoint configuration
        </span>
      </div>

      {/* Top Collapsible FastAPI & Model Endpoint Configuration Panel */}
      <CollapsibleCard
        theme={theme}
        title="Model & FastAPI Endpoint Configuration"
        subtitle={
          endpointConfig.baseUrl
            ? `Configured: ${endpointConfig.baseUrl}`
            : 'Offline Fallback Active (Local Physics + Archive Engine)'
        }
        summaryLine={
          endpointConfig.baseUrl
            ? `Live FastAPI Target: ${endpointConfig.baseUrl} (${endpointConfig.apiKeyHeader})`
            : 'No external backend required · Local Physics + Archive Inference Engine Active'
        }
      >
        <div className="space-y-4">
          <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Configure an optional external FastAPI inference endpoint (`POST /api/analyze`, `GET /health`) and API key header for live remote predictions. Leaving the URL empty seamlessly routes all Virtual Test Lab and Model Console requests through the local deterministic combustion engine.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6 space-y-1">
              <label
                htmlFor="psi-api-base-url"
                className="block text-[11px] font-sans font-medium text-zinc-500"
              >
                FastAPI Base URL (Optional — overrides VITE_API_BASE_URL)
              </label>
              <div className="relative">
                <Server className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="psi-api-base-url"
                  type="url"
                  value={endpointConfig.baseUrl}
                  onChange={(e) =>
                    setEndpointConfig((prev) => ({
                      ...prev,
                      baseUrl: e.target.value,
                    }))
                  }
                  placeholder="http://127.0.0.1:8000 (leave blank for local offline engine)"
                  className={`w-full pl-8 pr-3 py-1.5 text-xs font-sans rounded-[4px] border outline-none ${subSurface}`}
                />
              </div>
            </div>

            <div className="md:col-span-2 space-y-1">
              <label
                htmlFor="psi-api-key-header"
                className="block text-[11px] font-sans font-medium text-zinc-500"
              >
                Auth Header
              </label>
              <select
                id="psi-api-key-header"
                value={endpointConfig.apiKeyHeader}
                onChange={(e) =>
                  setEndpointConfig((prev) => ({
                    ...prev,
                    apiKeyHeader: e.target.value as 'X-API-Key' | 'Authorization',
                  }))
                }
                className={`w-full px-2.5 py-1.5 text-xs font-sans rounded-[4px] border outline-none ${cardSurface}`}
              >
                <option value="X-API-Key">X-API-Key</option>
                <option value="Authorization">Authorization</option>
              </select>
            </div>

            <div className="md:col-span-4 space-y-1">
              <label
                htmlFor="psi-api-key-value"
                className="block text-[11px] font-sans font-medium text-zinc-500"
              >
                API Key / Bearer Token (Optional)
              </label>
              <div className="relative">
                <input
                  id="psi-api-key-value"
                  type={showApiKey ? 'text' : 'password'}
                  value={endpointConfig.apiKeyValue}
                  onChange={(e) =>
                    setEndpointConfig((prev) => ({
                      ...prev,
                      apiKeyValue: e.target.value,
                    }))
                  }
                  placeholder="Enter secret token if required..."
                  className={`w-full pl-3 pr-8 py-1.5 text-xs font-sans rounded-[4px] border outline-none ${subSurface}`}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((prev) => !prev)}
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                >
                  {showApiKey ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSaveEndpointConfig}
                className={`px-3.5 py-1.5 text-xs font-sans font-semibold rounded-[4px] border transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-[#FAFAFA] text-[#09090B] border-[#FAFAFA] hover:bg-zinc-200'
                    : 'bg-[#18181B] text-[#FFFFFF] border-[#18181B] hover:bg-zinc-800'
                }`}
              >
                Save Endpoint Config
              </button>

              <button
                type="button"
                disabled={isTestingEndpoint}
                onClick={handleTestEndpoint}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans font-medium rounded-[4px] border transition-colors cursor-pointer disabled:opacity-60 ${
                  isDark
                    ? 'border-[#27272A] text-zinc-200 hover:bg-zinc-800'
                    : 'border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>{isTestingEndpoint ? 'Testing...' : 'Test Endpoint Health'}</span>
              </button>

              <button
                type="button"
                onClick={handleUseOfflineEngine}
                className={`px-3 py-1.5 text-xs font-sans font-medium rounded-[4px] border transition-colors cursor-pointer ${
                  isDark
                    ? 'border-[#27272A] text-zinc-400 hover:bg-zinc-800'
                    : 'border-[#E4E4E7] text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                Reset to Offline Engine
              </button>
            </div>

            {endpointHealthNotice && (
              <div className="flex items-center gap-2 text-xs font-sans">
                <span
                  className={`w-2 h-2 rounded-[2px] ${
                    endpointHealthNotice.mode === 'remote' && endpointHealthNotice.ok
                      ? 'bg-[#10B981]'
                      : 'bg-[#F59E0B]'
                  }`}
                />
                <span className="text-zinc-700 dark:text-zinc-200">
                  {endpointHealthNotice.message}
                </span>
              </div>
            )}
          </div>
        </div>
      </CollapsibleCard>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
      {/* Left 7 Columns: Domain-Gated CSV/JSON Custom Data Importer */}
      <CollapsibleCard
        theme={theme}
        title="Domain-Gated Custom Data Importer"
        subtitle="CSV / JSON telemetry validator & unit normalizer"
        summaryLine={`Buffer: ${fileName} · ${validationResult ? (validationResult.valid ? `${validationResult.parsedRuns.length} runs verified` : 'Blocked non-combustion upload') : 'Ready for CSV/JSON drop'}`}
        className="xl:col-span-7"
      >
        <div className="space-y-4">
          <p className="text-xs font-sans text-zinc-500 dark:text-zinc-400">
            Automatically validates combustion/spacecraft domain headers and
            normalizes pressure (kPa/atm → psi) and airflow (cm/s → m/s).
          </p>

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
                    <span className="font-sans text-[11px] text-zinc-600 dark:text-zinc-300">
                      Matched keys:{' '}
                      <span className="font-mono">
                        {validationResult.detectedKeywords.join(', ')}
                      </span>
                    </span>
                  </div>
                  {validationResult.unitConversionsApplied.length > 0 && (
                    <div className="font-sans text-[11px] text-zinc-600 dark:text-zinc-300 pt-1">
                      Smart Unit Normalizer:{' '}
                      <span className="font-mono tabular-nums">
                        {validationResult.unitConversionsApplied.join(' · ')}
                      </span>
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
        </div>
      </CollapsibleCard>

      {/* Right 5 Columns: Live Public Archive Manifest & Session Ingestion Log */}
      <CollapsibleCard
        theme={theme}
        title="Data Manifest &amp; Ingestion Status"
        subtitle="Live Public Archive"
        summaryLine={
          isArchiveLoading
            ? 'Loading public/data/nasa-space-apps/ assets...'
            : `${manifestFiles.length} archive files loaded · ${sessionEvents.length} session ingestion events`
        }
        className="xl:col-span-5"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 text-xs font-sans text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-2">
              <Database className="w-3.5 h-3.5" />
              <span>
                Files loaded from{' '}
                <span className="font-mono text-zinc-700 dark:text-zinc-300">
                  public/data/nasa-space-apps/
                </span>
              </span>
            </span>
          </div>

          {isArchiveLoading ? (
            <div className={`p-3.5 rounded-[5px] border text-xs font-sans text-zinc-500 ${subSurface}`}>
              Fetching and indexing archive JSON and CSV telemetry files...
            </div>
          ) : (
            <div className="space-y-2.5">
              {manifestFiles.map((file) => (
                <div
                  key={file.id}
                  className={`p-3 rounded-[5px] border ${subSurface}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold truncate">
                      {file.fileName}
                    </span>
                    <div className="flex items-center gap-2 shrink-0 text-[11px] font-sans">
                      <span
                        className={`px-1.5 py-0.5 rounded-[4px] border text-[10px] font-medium ${
                          isDark
                            ? 'border-[#27272A] text-zinc-300'
                            : 'border-[#E4E4E7] text-zinc-700'
                        }`}
                      >
                        {file.format}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[#10B981] font-medium">
                        <span className="w-1.5 h-1.5 rounded-[2px] bg-[#10B981]" />
                        <span>{file.status}</span>
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-xs font-sans text-zinc-600 dark:text-zinc-300">
                    {file.recordLabel}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                    <span>{formatByteSize(file.sizeBytes)}</span>
                    <span>{file.loadedAtUtc}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div
            className={`pt-3 border-t space-y-2.5 ${
              isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
            }`}
          >
            <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Session Ingestion Log
            </div>

            {sessionEvents.length === 0 ? (
              <div className={`p-3 rounded-[5px] border text-xs font-sans text-zinc-500 ${subSurface}`}>
                No archive loads or custom CSV/JSON uploads recorded in this session yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {sessionEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className={`p-3 rounded-[5px] border ${subSurface}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-sans">
                      <span className="inline-flex items-center gap-1.5 font-semibold truncate">
                        <span
                          className={`w-1.5 h-1.5 rounded-[2px] shrink-0 ${
                            evt.eventType === 'archive-error'
                              ? 'bg-[#EF4444]'
                              : 'bg-[#10B981]'
                          }`}
                        />
                        <span className="font-mono truncate">{evt.sourceName}</span>
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-zinc-500 shrink-0">
                        {evt.timestampUtc}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-sans text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {evt.summary}
                    </p>
                    {evt.unitConversions && evt.unitConversions.length > 0 && (
                      <div className="mt-1 text-[11px] font-sans text-zinc-500">
                        Normalizations: {evt.unitConversions.join(' · ')}
                      </div>
                    )}
                    <div
                      className={`mt-2 pt-2 border-t flex items-center justify-between text-[11px] text-zinc-500 ${
                        isDark ? 'border-[#27272A]' : 'border-[#E4E4E7]'
                      }`}
                    >
                      <span className="font-sans">
                        <span className="font-mono tabular-nums font-semibold">
                          +{evt.runsIndexed.toLocaleString()}
                        </span>{' '}
                        Runs Indexed
                      </span>
                      {evt.targetRunId ? (
                        <button
                          type="button"
                          onClick={() => onInspectRunFromManifest(evt.targetRunId!)}
                          className="font-sans font-semibold text-zinc-800 dark:text-zinc-200 hover:underline cursor-pointer"
                        >
                          Inspect Imported Run →
                        </button>
                      ) : evt.targetView ? (
                        <button
                          type="button"
                          onClick={() => onNavigateArchiveView(evt.targetView!)}
                          className="font-sans font-semibold text-zinc-800 dark:text-zinc-200 hover:underline cursor-pointer"
                        >
                          Browse Experiment Runs →
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CollapsibleCard>
      </div>
    </div>
  );
};
