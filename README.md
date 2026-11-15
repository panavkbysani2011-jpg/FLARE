# FLARE - Flight & Lunar Atmosphere Risk Engine

[![Live Application](https://img.shields.io/badge/Live%20App-flare--up--tau.vercel.app-10B981?style=flat&logo=vercel)](https://flare-up-tau.vercel.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Live Workbench URL:** [https://flare-up-tau.vercel.app/](https://flare-up-tau.vercel.app/)

FLARE is a browser-based fire safety workbench for testing how spacecraft cabin materials behave in reduced gravity, varying oxygen levels, cabin pressures, and forced airflow - calibrated against 1,616 experimental microgravity combustion runs from NASA's Physical Science Informatics (PSI) archive.

## What FLARE Does

Fire behaves differently in orbit and on the Moon than it does on Earth. Without strong buoyant convection, flames can burn at lower temperatures ("cool flames"), spread unexpectedly under weak ventilation, and linger near extinction boundaries. FLARE pulls real flight measurements and deterministic combustion equations into one workspace so engineers and researchers can explore those boundaries interactively.

### Key Features

- **Virtual Test Lab** (`src/components/VirtualTestLab.tsx`, `src/utils/physicsEngine.ts`): Tune cabin oxygen (`O2 %`), total pressure, forced airflow, gravity presets (`0g` Orbital, `0.166g` Lunar, `0.38g` Martian, `1.0g` Terrestrial), material thickness, and ignition heat flux across `PMMA`, `SIBAL`, `Cotton-Fiberglass`, `PTFE`, and `Nomex`. Computes flame spread speed, safety regime classification, 10s growth forecasts, minimum safe thickness margins, and an 8-material polymer qualification table.
- **Visual Analytics Studio** (`src/components/VisualAnalyticsStudio.tsx`, `src/components/VizTechniqueRenderer.tsx`): Interactive exploration across 25 chart modes in 5 analytical families using Recharts, Plotly, and ECharts, wrapped in mathematical domain zoom/pan (`InteractiveChartViewport.tsx`) with scroll-safe zoom locking by default and magnetic point snapping.
- **Run Comparator** (`src/components/RunComparator.tsx`): Pin up to 4 real PSI flight runs or virtual test runs side-by-side to compare telemetry deltas and overlaid profiles.
- **Model Console** (`src/components/ModelConsoleView.tsx`, `src/lib/flareApi.ts`, `src/services/psiApi.ts`): Conversational analysis across four modes (`What-If`, `Risk Audit`, `Literature`, `Chart Decoder`) with local persistent thread history, voice dictation, inline chart cards, user correction memory, remote backend support (`Active Combustion Model`), and built-in offline inference (`Local Combustion Model`).
- **Data Archive & Import/Sync** (`src/components/CatalogView.tsx`, `src/components/ExperimentRunsView.tsx`, `src/components/ImportSyncView.tsx`): Browse 18 PSI investigations, filter all 1,616 calibrated runs, search indexed sections of the *ISS Researcher's Guide to Combustion*, review historical spacecraft fire and Earth spin-off case studies, import custom CSV/JSON runs with automatic SI/spacecraft unit conversion, and export reports to PDF, Word (`.doc`), CSV, or JSON directly in the browser.

## Local Setup & Environment Variables

### Prerequisites

- Node.js 18 or newer
- `npm`

### Running Locally

```bash
# Install dependencies
npm install

# Start the development server at http://localhost:3000
npm run dev
```

### Environment Variables (`.env`)

Create a `.env` file in the repository root if you want to connect a remote combustion API endpoint or enable optional Gemini Flash synthesis inside the Local Combustion Model:

```env
VITE_IGNIS_API_URL=https://your-backend-endpoint.example.com
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

- `VITE_IGNIS_API_URL`: Optional URL of a live combustion inference server (`/health`, `/evaluate`, `/ask`). When omitted or unreachable, FLARE automatically falls back to offline physics and local archive retrieval.
- `VITE_GEMINI_API_KEY`: Optional Google Gemini API key used by `Local Combustion Model` response synthesis. Can also be configured or overridden at runtime inside **Settings -> General** (stored only in your browser's `localStorage`).

### Scripts

```bash
npm run lint      # TypeScript type-check (tsc --noEmit)
npm test          # Node unit test suite (tsx --test src/utils/physicsEngine.test.ts)
npm run build     # Production Vite build to dist/
npm run preview   # Preview the production bundle locally
```

## Project Structure

- `src/components/` - React workspace views, interactive charts, virtual chamber controls, settings, and crash recovery boundary.
- `src/lib/flareApi.ts` - Live backend health checks, response normalization, and Local Combustion Model synthesis pipeline.
- `src/services/` - Dataset loading, agency/path sanitization, unified endpoint adapter, local account profiles, and user correction feedback loop.
- `src/utils/` - Deterministic microgravity combustion equations, unit converters, CSV/JSON importer, client-side PDF/Word/CSV exporters, and test suite.
- `public/data/` - Pre-processed PSI experiment catalogs, telemetry CSV/JSON records, and public ISS combustion reference PDFs.

## Data & Media Attribution

- **Experimental Datasets & Literature:** Empirical microgravity combustion telemetry, investigation metadata, and run benchmarks are sourced from NASA's open-science **Physical Science Informatics (PSI)** repository ([psi.nasa.gov](https://psi.nasa.gov/), `CC0-1.0`), along with NASA's *A Researcher's Guide to Combustion Science in Reduced Gravity* (`NP-2015-10-034-JSC`) and the *Smoke Aerosol Measurement Experiment (SAME) EIRD*.
- **Imagery:** The landing page microgravity flame visual (`public/images/hero-flame.png`) uses public-domain NASA spaceflight combustion photography as non-endorsed public-domain media.
- **Affiliation Disclaimer:** FLARE is an independent 2026 NASA Space Apps Challenge project and is not affiliated with or endorsed by NASA. No official NASA insignias, worm wordmarks, or Space Apps emblems are used in the application interface or brand assets.

## Super Intelligence (SI) Usage Disclosure

- **Development & Scaffolding:** Google Gemini was used for frontend/backend code scaffolding, TypeScript/UI debugging, and initial architectural brainstorming.
- **Scientific Grounding (Non-SI):** All combustion physics, flame-spread calculations, and experimental benchmarks are driven by deterministic fluid-mechanics equations and verified NASA PSI flight data - not generated by SI.

## License

Licensed under the [MIT License](./LICENSE). Copyright (c) 2026 FLARE Team.
