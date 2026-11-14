import React from 'react';
import {
  X,
  Sliders,
  CheckSquare,
  Square,
  BookOpen,
  Cpu,
  Flame,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { PsiRun, ThemeMode } from '../types/psi';

interface RunInspectorDrawerProps {
  run: PsiRun | null;
  onClose: () => void;
  theme: ThemeMode;
  isSelectedForComparison: boolean;
  onToggleComparison: (runId: string) => void;
  onLoadIntoSimulator: (run: PsiRun) => void;
}

const FACILITY_DESCRIPTIONS: Record<PsiRun['facility'], string> = {
  CIR: 'Combustion Integrated Rack (CIR) — Fluids and Combustion Facility, Multi-User Droplet & Solid Chamber',
  MSG: 'Microgravity Science Glovebox (MSG) — Sealed Forced-Flow Benchtop Wind Tunnel Work Volume',
  Cygnus:
    'Autonomous Pressurized Spacecraft Module — Large-Scale Post-Undocking Cabin Fire Testbed',
  FSL: 'Fluid Science Laboratory (FSL) — Optical Diagnostics & Interferometry Combustion Cell',
};

export const RunInspectorDrawer: React.FC<RunInspectorDrawerProps> = ({
  run,
  onClose,
  theme,
  isSelectedForComparison,
  onToggleComparison,
  onLoadIntoSimulator,
}) => {
  if (!run) return null;

  const isDark = theme === 'dark';
  const drawerSurface = isDark
    ? 'bg-[#121215] border-[#27272A] text-[#FAFAFA]'
    : 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B]';

  const cellSurface = isDark
    ? 'bg-[#09090B] border-[#27272A]'
    : 'bg-zinc-50 border-[#E4E4E7]';

  const statusMeta =
    run.outcome === 'Rapid Flame Spread'
      ? {
          color: 'text-[#EF4444]',
          bg: 'bg-[#EF4444]/10 border-[#EF4444]/30',
          icon: Flame,
        }
      : run.outcome === 'Cool Flame Caution'
      ? {
          color: 'text-[#F59E0B]',
          bg: 'bg-[#F59E0B]/10 border-[#F59E0B]/30',
          icon: AlertTriangle,
        }
      : {
          color: 'text-[#10B981]',
          bg: 'bg-[#10B981]/10 border-[#10B981]/30',
          icon: ShieldCheck,
        };

  const StatusIcon = statusMeta.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Run Detail Inspector: ${run.psiId}`}
    >
      <aside
        className={`w-full max-w-[420px] h-full border-l p-5 flex flex-col justify-between overflow-y-auto shadow-2xl ${drawerSurface}`}
      >
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-zinc-200 dark:border-[#27272A]">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold tracking-tight">
                  {run.psiId}
                </span>
                <span className="text-xs text-zinc-400">·</span>
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  Run {run.runCode}
                </span>
              </div>
              <h2 className="font-display text-base font-semibold mt-1 leading-snug">
                {run.investigationTitle}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Run Detail Inspector"
              className="p-1.5 rounded-[4px] text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Outcome Banner */}
          <div
            className={`p-3 rounded-[5px] border flex items-center justify-between ${statusMeta.bg}`}
          >
            <div className="flex items-center gap-2">
              <StatusIcon className={`w-4 h-4 ${statusMeta.color}`} />
              <span className={`text-xs font-semibold ${statusMeta.color}`}>
                {run.outcome}
              </span>
            </div>
            <span className="font-mono text-xs font-bold tabular-nums">
              {run.flameSpread_mms.toFixed(2)} mm/s
            </span>
          </div>

          {/* Hardware Facility */}
          <div className={`p-3.5 rounded-[5px] border space-y-1 ${cellSurface}`}>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              <Cpu className="w-3.5 h-3.5 text-zinc-400" />
              <span>Hardware Facility: {run.facility}</span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {FACILITY_DESCRIPTIONS[run.facility]}
            </p>
          </div>

          {/* Physical Parameters Grid */}
          <div>
            <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-2">
              Calibrated Environmental & Telemetry Readouts
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className={`p-2.5 rounded-[4px] border ${cellSurface}`}>
                <div className="text-[11px] text-zinc-500">Fuel / Substrate</div>
                <div className="text-xs font-semibold mt-0.5 truncate">
                  {run.material}
                </div>
              </div>
              <div className={`p-2.5 rounded-[4px] border ${cellSurface}`}>
                <div className="text-[11px] text-zinc-500">
                  Oxygen Concentration
                </div>
                <div className="font-mono text-xs font-bold tabular-nums mt-0.5">
                  {run.O2_pct.toFixed(1)}% O₂
                </div>
              </div>
              <div className={`p-2.5 rounded-[4px] border ${cellSurface}`}>
                <div className="text-[11px] text-zinc-500">Cabin Pressure</div>
                <div className="font-mono text-xs font-bold tabular-nums mt-0.5">
                  {run.P_psi.toFixed(1)} psi (
                  {(run.P_psi * 6.89476).toFixed(1)} kPa)
                </div>
              </div>
              <div className={`p-2.5 rounded-[4px] border ${cellSurface}`}>
                <div className="text-[11px] text-zinc-500">
                  Forced Airflow Velocity
                </div>
                <div className="font-mono text-xs font-bold tabular-nums mt-0.5">
                  {run.Flow_ms.toFixed(2)} m/s (
                  {(run.Flow_ms * 100).toFixed(0)} cm/s)
                </div>
              </div>
              <div className={`p-2.5 rounded-[4px] border ${cellSurface}`}>
                <div className="text-[11px] text-zinc-500">
                  Effective Gravity
                </div>
                <div className="font-mono text-xs font-bold tabular-nums mt-0.5">
                  {run.g_eff.toFixed(3)}g
                </div>
              </div>
              <div className={`p-2.5 rounded-[4px] border ${cellSurface}`}>
                <div className="text-[11px] text-zinc-500">
                  Sample Thickness
                </div>
                <div className="font-mono text-xs font-bold tabular-nums mt-0.5">
                  {run.Thickness_mm.toFixed(1)} mm
                </div>
              </div>
              <div className={`p-2.5 rounded-[4px] border ${cellSurface}`}>
                <div className="text-[11px] text-zinc-500">
                  Peak Gas Temperature
                </div>
                <div className="font-mono text-xs font-bold tabular-nums mt-0.5">
                  {run.peakTemp_K} K
                </div>
              </div>
              <div className={`p-2.5 rounded-[4px] border ${cellSurface}`}>
                <div className="text-[11px] text-zinc-500">
                  Radiometer IR Flux
                </div>
                <div className="font-mono text-xs font-bold tabular-nums mt-0.5">
                  {run.radiometerFlux_Wm2.toLocaleString()} W/m²
                </div>
              </div>
            </div>
          </div>

          {/* Empirical Fire-Safety Finding & Verifiable Citation */}
          <div className={`p-3.5 rounded-[5px] border space-y-2 ${cellSurface}`}>
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <BookOpen className="w-3.5 h-3.5 text-zinc-400" />
              <span>Empirical Fire-Safety Finding</span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {run.notes}
            </p>
            <div className="pt-2 border-t border-zinc-200 dark:border-[#27272A] text-[11px] text-zinc-500">
              Archive Record:{' '}
              <span className="font-mono">
                PSI-{run.id.replace('psi-', '').toUpperCase()}/{run.runCode}
              </span>{' '}
              · Cool-Flame Regime:{' '}
              <span className="font-mono font-semibold">
                {run.coolFlameObserved ? 'DETECTED (550K–800K)' : 'NOT OBSERVED'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 mt-4 border-t border-zinc-200 dark:border-[#27272A] flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              onLoadIntoSimulator(run);
              onClose();
            }}
            className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-[4px] transition-colors cursor-pointer ${
              isDark
                ? 'bg-[#FAFAFA] text-[#09090B] hover:bg-zinc-200'
                : 'bg-[#18181B] text-[#FFFFFF] hover:bg-zinc-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Load Parameters into Simulator</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleComparison(run.id)}
            className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-[4px] border transition-colors cursor-pointer ${
              isDark
                ? 'border-[#27272A] text-zinc-200 hover:bg-zinc-800'
                : 'border-[#E4E4E7] text-zinc-800 hover:bg-zinc-100'
            }`}
          >
            {isSelectedForComparison ? (
              <>
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Included in Run Comparator (Click to Remove)</span>
              </>
            ) : (
              <>
                <Square className="w-3.5 h-3.5" />
                <span>Add to Side-by-Side Run Comparator</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </div>
  );
};
