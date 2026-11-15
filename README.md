# FLARE — Flight & Lunar Atmosphere Risk Engine

FLARE is an interactive scientific data workbench designed for analyzing, comparing, and interpreting microgravity and reduced-gravity combustion experiment datasets from the Physical Science Informatics (PSI) archive.

## Overview

FLARE provides an integrated environment for researchers, mission planners, and aerospace engineers to evaluate flame propagation, material flammability limits, and fire safety parameters across varying environmental conditions (Earth, Moon, Mars, and orbital microgravity).

### Key Capabilities

- **Visual Analytics Studio**: Multi-dataset visualization engine featuring 10+ analytical techniques across distribution, correlation, composition, and comparative families.
- **Flight & Lunar Risk Engine**: Deterministic combustion physics engine modeling flame spread velocity, extinction boundaries, and material flammability thresholds under variable gravity and oxidizer concentrations.
- **Run Comparator**: Side-by-side comparative inspection of combustion runs with interactive differential metrics and overlay charts.
- **Model Console**: Interactive AI-assisted analysis and interpretation of telemetry, anomalies, and test parameters with dynamic chart rendering.
- **Unified Export Suite**: Export publication-quality reports (PDF, Word DOCX) and datasets (CSV, JSON) directly from any view.

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm

### Installation

```bash
# Install dependencies
npm install

# Start the local development server
npm run dev
```

The application will be accessible at `http://localhost:3000`.

### Production Build

```bash
# Type check and build client bundle
npm run build

# Preview the production build locally
npm run preview
```

## Environment Configuration

Configure an optional external FastAPI backend endpoint by setting `VITE_API_BASE_URL` in `.env`:

```env
VITE_API_BASE_URL=https://your-api-endpoint.com
```

When left empty, FLARE runs seamlessly using its built-in deterministic physics engine and local archive data.

## License

MIT
