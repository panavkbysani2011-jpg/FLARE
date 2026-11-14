# PSI Data Manager — Architectural, UI/UX, Visualization & Model-Engine Upgrade Checklist

## Global Non-Negotiable Constraints
- [x] **Zero Agency Branding**: Never display NASA logos, agency branding, or the word "NASA" anywhere in visible UI text, titles, badges, or labels (refer strictly to "PSI" / Physical Science Informatics). *(Static recursive `Select-String` & unit test confirmed 0 occurrences in `.tsx` UI files and display labels; runtime CSV/JSON data from `public/data/nasa-space-apps/` not inspected word-for-word at runtime.)*
- [x] **Zero Pill Badges**: Zero `rounded-full` pill shapes across buttons, status tags, tabs, or filters; use rectangular controls (`4px`–`6px` radius) and quiet inline status dots/text. *(Verified 0 `rounded-full` matches across `src/` via unit test & `Select-String`.)*
- [x] **Monochrome Chrome + Data-Only Semantic Color**: Monochrome chrome (`#18181B`/`#FFFFFF` in Normal/Light; `#FAFAFA`/`#09090B` in Dark; 1px hairline `#E4E4E7`/`#27272A`). Emerald (`#10B981`), Amber (`#F59E0B`), Coral Red (`#EF4444`) strictly for safety regimes and chart data values. *(Applied in components; visual screenshot audit pending.)*
- [x] **Typography Hierarchy**: `Space Grotesk` headings (`font-display`), `Inter` (400, 500, 600) UI controls/chart axes/prose (`font-sans`), `JetBrains Mono` with `tabular-nums` strictly for numeric readouts, coordinates, and PSI IDs. *(Applied in CSS/components; visual browser font check pending.)*
- [x] **Frontend-Ready Backend Contract**: Route predictions, CIs, telemetry decoding, sweeps, telemetry chart analysis, and custom data validation through `src/services/psiApi.ts` with offline local physics/archive fallback when `VITE_API_BASE_URL` / configured endpoint is empty. *(Offline fallback verified via `tsx` unit tests; live remote FastAPI server integration unverified offline.)*
- [x] **Preserve All Real Loaded Data**: Preserve 18 real PSI investigations, 1,619 calibrated runs (`public/data/nasa-space-apps/`), SAFFIRE-II / ISS literature chunks, 50-page ISS Researcher's Guide PDF, 8 historical fire & Earth spin-off case records, and 3-mode theme switcher (`Normal | Light | Dark`).

---

## Phase 1: Collapsible Hierarchical Left Navigation & Anti-Congestion Shell
- [x] **Hideable & Collapsible Left Sidebar (`src/components/LeftSidebar.tsx`)**:
  - [x] Fixed/sticky left rail (`sticky top-0 h-screen`) with prominent collapse/hide toggle button (`PanelLeftClose` / `PanelLeftOpen`) + `[` keyboard shortcut.
  - [x] Support 3 states: **Expanded** (`240px` full tree), **Compact Icon Rail** (`64px` icons with hover tooltips), **Fully Hidden** (`0px` leaving subtle floating expand control in top-left header).
  - [x] Exact hierarchical expandable navigation tree:
    - [x] `Virtual Test Lab` (nested: `Run Comparator`)
    - [x] `Visual Analytics Studio`
    - [x] `Model Console`
    - [x] `Data Archive` (expandable parent -> nested: `PSI Investigations (18)`, `Experiment Runs (1,619)`, `ISS Researcher's Guide`, `Mission & Spin-Off Cases (8)`)
    - [x] `Data Import & Sync`
  - [x] Bottom footer single-line status (`18 PSI Investigations • 1,619 Runs • Ready`) with zero chat button.
- [x] **Ultra-Minimal Global Top Header (`src/components/HeaderBar.tsx`)**:
  - [x] 52px height: Left sidebar expand/collapse trigger + dynamic breadcrumb (`PSI Data Manager / Section / Sub-page`); Right `Export Safety Brief` outline button + `Normal | Light | Dark` rectangular theme toggle.
  - [x] Remove right-hand slide-over chat drawer (`RightAssistantPanel.tsx`) completely; zero environment sliders or presets in global top bar.
- [x] **Universal Progressive Disclosure (`src/components/CollapsibleCard.tsx`)**:
  - [x] Reusable `Hide / Show` collapse toggle component for major control cards, KPI bars, filter rails, and equation blocks collapsing cleanly into compact single summary lines.
- [x] **Phase 1 Build & Type Check**: `npx.cmd tsc --noEmit` & `npm.cmd run build` clean.

---

## Phase 2: Dedicated "Visual Analytics Studio" (Generic Techniques + Dynamic Axes)
- [x] **Generic Visualization Technique Registry (`src/utils/vizRegistry.ts`)**:
  - [x] Rename all techniques strictly by analytical/visualization method (zero domain scenario names like "Oxygen vs. Airflow Safety Map" or "Material Safety Bullet Bars").
  - [x] Provide **25+ techniques** across the analytical families (`2D Regime Heatmap`, `Parallel Coordinates`, `Multi-Axis Scatter Plot`, `Grouped Bar Chart`, `Stacked Bar Chart`, `Horizontal Ranked Bar Chart`, `Bullet Target Chart`, `Cleveland Lollipop Plot`, `Box & Quartile Distribution`, `Telemetry Histogram`, `Frequency Distribution Bars`, `Confidence Interval Range Plot`, `Multi-Series Line Chart`, `Dual-Axis Sensor Line Chart`, `Area Progression Chart`, `Stacked Area Chart`, `Regime Step Transition Chart`, `Contour Density Map`, `Correlation Matrix`, `Normalized Matrix Heatmap`, `Bubble Multi-Metric Plot`, `Polar Radial Profile`, `Cumulative Distribution Curve`, `Residual Spread Deviation Plot`, `Bivariate Density Strip Plot`, etc.).
- [x] **Clean 3-Part Collapsible Top Control Strip (`src/components/VisualAnalyticsStudio.tsx`)**:
  - [x] Control 1 — **Active Dataset Source Dropdown**: `Full PSI Archive (1,619 runs)`, `Selected Comparison Runs`, `Virtual Test Lab Output`, `Material Qualification Dataset`, `Imported Custom CSV/JSON`.
  - [x] Control 2 — **Generic Visualization Technique Searchable Popover Dropdown**: Floating popover (never pushing page down), instant search box, status tabs (`All`, `Recommended`, `Available`, `Unavailable`), single-line rows (`Technique Name`, `Family`, right-aligned status / unavailability reason).
  - [x] Control 3 — **Dynamic Variable / Axis Mapper**: `X-Axis`, `Y-Axis`, and `Color / Group-By` dropdowns populated from active dataset numeric & categorical columns with smart defaults per technique and free remapping.
- [x] **Interactive Chart Polish & Zero Overlaps (`src/components/VizTechniqueRenderer.tsx`)**:
  - [x] Legends cleanly above chart area (never overlapping heatmap cells or curves).
  - [x] Offset active point labels cleanly without colliding with markers/lines.
  - [x] Translucent `backdrop-blur-md` tooltips with `tabular-nums` numbers.
  - [x] Shared hover highlighting (brushing & linking) across chart series and legends.
  - [x] `"Decode This View in Model Console"` action button forwarding current chart configuration and anomalies to Model Console.
- [x] **Phase 2 Build, Type & Test Check**: `npx.cmd tsc --noEmit`, `npm.cmd run build`, `npx.cmd tsx --test src/utils/physicsEngine.test.ts` clean.

---

## Phase 3: "Virtual Test Lab" & "Run Comparator"
- [x] **Virtual Test Lab Engine (`src/utils/physicsEngine.ts` + `src/services/psiApi.ts`)**:
  - [x] Compute material-aware flame spread speed (`PMMA`, `SIBAL`, `Cotton-Fiberglass`, `PTFE`, `Nomex`) with 95% confidence interval, 10-second flame growth & cabin pressure rise forecast, minimum safe quenching thickness, Model Confidence & Accuracy Score validated against `N` nearby historical PSI runs, and physical testing recommendation (`Avoidable` vs `Recommended`).
- [x] **Dedicated Virtual Test Lab View (`src/components/VirtualTestLab.tsx`)**:
  - [x] Collapsible Test Chamber Configuration Panel: Mission Gravity Presets (`0g Orbital`, `0.166g Lunar`, `0.38g Martian`, `1.0g Terrestrial`), O2 %, Cabin Pressure (psi), Forced Airflow (m/s), Candidate Material selector, Material Thickness (mm), Ignition Flux (kW/m²), prominent primary `"Run Virtual Test"` button.
  - [x] Collapsible Virtual Test Results & Model Accuracy Report card with quick actions: `"Inspect in Visual Analytics Studio"`, `"Analyze Result in Model Console"`, `"Add Virtual Run to Comparator"`.
  - [x] Collapsible Governing Equations & Material Qualification Matrix below report (aligned horizontal bullet bars + sortable qualification rows, zero radar charts).
- [x] **Enhanced Run Comparator (`src/components/RunComparator.tsx`)**:
  - [x] Full-width side-by-side matrix for up to 4 selected historical or virtual runs with percentage deltas relative to reference run.
  - [x] Collapsible extra telemetry columns toggle (zero right-edge clipping) + interactive multi-axis trajectory comparison chart below.
- [x] **Phase 3 Build, Type & Test Check**: `npx.cmd tsc --noEmit`, `npm.cmd run build`, `npx.cmd tsx --test src/utils/physicsEngine.test.ts` clean.

---

## Phase 4: Full-Page "Model Console" (Core Intelligence Engine)
- [x] **Backend & Local Inference Contract (`src/services/psiApi.ts`)**:
  - [x] Support configurable FastAPI base URL (`VITE_API_BASE_URL` or runtime config) + optional API key headers (`X-API-Key` / `Authorization`), health-check verification, Telemetry & Chart Decoding, Hypothetical What-If Sweeps, Literature & Archive Synthesis, and Pre-Test Risk Audit via clean fallback offline engine.
- [x] **Dedicated Full-Page Model Console (`src/components/ModelConsoleView.tsx`)**:
  - [x] Framed around trained **Combustion Prediction & Decoding Model** (never "AI Assistant" or "Chatbot").
  - [x] Top/Left Context Strip displaying current Virtual Test parameters, active dataset count, and backend mode (`Local Physics + Archive Inference Engine` or `Live FastAPI Endpoint`).
  - [x] Four rectangular operational mode tabs + prompt starters:
    1. `Telemetry & Chart Decoder`
    2. `Hypothetical "What-If" Sweep` (with comparative sensitivity sweeps + `"Apply Parameters to Virtual Test Lab"` button)
    3. `Literature & Archive Synthesis` (cites SAFFIRE-II / PSI reports, 50-page ISS Researcher's Guide, historical incidents)
    4. `Pre-Test Risk Audit` (evaluates material thickness & atmosphere against spacecraft fire safety bounds)
  - [x] Clickable inline PSI run/investigation badges (`Open Investigation`) and `"Apply Parameters to Virtual Test Lab"` action buttons on responses.
- [x] **Phase 4 Build & Type Check**: `npx.cmd tsc --noEmit` & `npm.cmd run build` clean.

---

## Phase 5: Unified "Data Archive", Full-Page Investigation Details, Link Fixes & API Configuration
- [x] **Fix All Broken `psi.nasa.gov` Links & Agency Strings (`src/services/dataLoader.ts`, `src/utils/investigationArtifacts.ts`, `src/data/missionAndSpinoffCases.ts`)**:
  - [x] Eliminate guessed `/investigations/psi-XX` 404 URLs; preserve manifest/catalog `doi` (`https://doi.org/...`), `hardware_link`, and `publications.link`; link portal searches cleanly to `https://psi.nasa.gov/` with label e.g. `Official PSI Portal (Search: PSI-20 / BRE) ↗`.
  - [x] Audit every visible UI string/display label across all components & data files so `"NASA"` never appears in visible UI text.
- [x] **Unified Data Archive Sub-Views (`src/components/CatalogView.tsx`, `src/components/ExperimentRunsView.tsx`)**:
  - [x] Render dedicated clean sub-views directly from nested sidebar links: `PSI Investigations (18)`, `Experiment Runs (1,619)`, `ISS Researcher's Guide`, `Mission & Spin-Off Cases (8)`, each with collapsible filter rails / control headers (`Hide / Show` toggle).
  - [x] Ensure ISS Researcher's Guide includes direct button to open `/data/nasa-space-apps/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf`.
- [x] **Full-Page Investigation & Run Detail View (`src/components/PsiInvestigationDetailView.tsx`)**:
  - [x] Top breadcrumb (`<- Back to Data Archive / PSI-XX`), `"Load Parameters into Virtual Test Lab"` primary button, collapsible sections (`CollapsibleCard` Hide/Show toggles on all 4 secondary sections), calibrated telemetry tables, non-raw document summaries, verified bottom source bar (DOI, publication, hardware links, official PSI portal search link).
- [x] **Data Import & Sync + Model Endpoint Configuration (`src/components/ImportSyncView.tsx`)**:
  - [x] Preserve CSV/JSON uploader & unit normalizer, add collapsible `"Model & FastAPI Endpoint Configuration"` card with base URL, API key input, live ping/test button, and offline-safe persistence.
- [x] **Final Full-Workspace Wiring & Verification**:
  - [x] Wire all views, sidebar states, Visual Studio -> Model Console decode flow, Virtual Test Lab <-> Comparator / Visual Studio / Model Console flows in `src/App.tsx`.
  - [x] Expand unit tests in `src/utils/physicsEngine.test.ts` covering Virtual Test Lab confidence scoring, Model Console 4 operational modes, 25+ Viz Registry generic methods & dynamic axis mapping, and link/UI branding/pill compliance audits.
  - [x] Run `npx.cmd tsc --noEmit`, `npm.cmd run build`, and `npx.cmd tsx --test src/utils/physicsEngine.test.ts` and verify zero errors.
