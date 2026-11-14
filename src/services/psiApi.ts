import { PsiRun, SimulationRequest, SimulationResponse } from '../types/psi';
import { BASELINE_PSI_RUNS } from '../data/baselineRuns';
import { runLocalPhysicsSimulation } from '../utils/physicsEngine';
import {
  ImportValidationResult,
  validateAndNormalizeDataset,
} from '../utils/dataImporter';

/**
 * Centralized API adapter for PSI Data Manager.
 * When VITE_API_BASE_URL is configured, routes requests to `${VITE_API_BASE_URL}/api/analyze`.
 * When empty, executes the local deterministic physics engine and citation builder seamlessly.
 */
export async function analyzeCombustionState(
  request: SimulationRequest,
  catalog: PsiRun[] = BASELINE_PSI_RUNS
): Promise<SimulationResponse> {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  const payload = {
    O2_pct: request.O2_pct,
    P_psi: request.P_psi,
    Flow_ms: request.Flow_ms,
    g_eff: request.g_eff,
    Thickness_mm: request.Thickness_mm,
    forecast_10s: true,
    material_check: true,
    question: request.question ?? undefined,
  };

  if (apiBaseUrl) {
    try {
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const remoteData = (await response.json()) as Partial<SimulationResponse>;
        const localFallback = runLocalPhysicsSimulation(request, catalog);
        return {
          ...localFallback,
          ...remoteData,
        };
      }
    } catch {
      // Fall back cleanly to local deterministic physics calculation if external FastAPI backend is offline
    }
  }

  if (request.question) {
    await new Promise((resolve) => setTimeout(resolve, 140));
  }

  return runLocalPhysicsSimulation(request, catalog);
}

export function processCustomDatasetUpload(
  rawContent: string,
  fileName: string
): ImportValidationResult {
  return validateAndNormalizeDataset(rawContent, fileName);
}
