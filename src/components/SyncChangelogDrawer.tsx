import React from 'react';
import { X, RefreshCw, CheckCircle2, Database } from 'lucide-react';
import { SyncChangelogEntry, ThemeMode } from '../types/psi';

interface SyncChangelogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  entries: SyncChangelogEntry[];
  hasSimulatedNewSync: boolean;
  onSimulateNewSync: () => void;
  onSelectRunFromSync: (psiId: string) => void;
}

export const SyncChangelogDrawer: React.FC<SyncChangelogDrawerProps> = ({
  isOpen,
  onClose,
  theme,
  entries,
  hasSimulatedNewSync,
  onSimulateNewSync,
  onSelectRunFromSync,
}) => {
  if (!isOpen) return null;

  const panelSurface =
    theme === 'dark'
      ? 'bg-[#1E293B] border-white/10 text-[#F8FAFC]'
      : theme === 'light'
      ? 'bg-white border-[#CBD5E1] text-[#020617]'
      : 'bg-white border-[#E5E7EB] text-[#0F172A]';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="PSI Archive Sync Changelog"
    >
      <div
        className={`w-full max-w-md h-full border-l p-5 flex flex-col justify-between overflow-y-auto shadow-xl ${panelSurface}`}
      >
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#0284C7] dark:text-[#38BDF8]" />
              <h2 className="font-display text-base font-bold">
                New PSI Data Available
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Sync Log"
              className="p-1 rounded-[4px] text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Automated telemetry ingestion feed from the Physical Science Informatics (PSI) microgravity combustion repository.
          </p>

          <div className="mt-4">
            <button
              type="button"
              disabled={hasSimulatedNewSync}
              onClick={onSimulateNewSync}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-[4px] border transition-colors duration-150 cursor-pointer ${
                hasSimulatedNewSync
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-[#10B981] cursor-default'
                  : 'border-[#0284C7] dark:border-[#38BDF8] bg-[#0284C7] dark:bg-[#38BDF8] text-white dark:text-slate-950 hover:opacity-95'
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
          </div>

          <div className="mt-5 space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`p-3.5 rounded-[5px] border ${
                  theme === 'dark'
                    ? 'bg-[#0F172A]/70 border-white/10'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-[#0284C7] dark:text-[#38BDF8]">
                    {entry.psiId}
                  </span>
                  <span className="text-slate-400">{entry.syncedAt}</span>
                </div>
                <h3 className="mt-1 text-xs font-semibold">{entry.title}</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {entry.summary}
                </p>
                <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  <span>
                    Facility: {entry.facility} · +{entry.runsAdded} Runs
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectRunFromSync(entry.psiId);
                      onClose();
                    }}
                    className="text-[#0284C7] dark:text-[#38BDF8] hover:underline font-medium cursor-pointer"
                  >
                    Inspect in Catalog →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-white/10 text-[11px] font-mono text-slate-400 flex items-center justify-between">
          <span>Archive Schema v3.4</span>
          <span>Unit Normalization: Enabled</span>
        </div>
      </div>
    </div>
  );
};
