# CTO Consulting — Benefits Realisation Platform

A web application for managing business benefits across **projects, programs and the portfolio**. It is built from the *Benefits Realisation Platform Specification* and follows the Benefits Realization Approach: benefits maps, the BTOPP business system, the four "ares", progressive stage gates and active benefits management.

It ships with a demo organisation, **Harbourline Mutual**. The demo has 8 programs that cover every lifecycle state, including the Customer Information System worked example from Appendix D of the specification. You can add any number of blank organisations alongside it.

## Headline features

### Cost and benefit simulation (Monte Carlo)

**Simulation lab** (portfolio) and the **Simulation** tab (per program).

- **Many possible futures.** The lab runs up to 20,000 futures. Each cost and benefit line is sampled within its range using PERT, triangular, uniform or normal distributions.
- **Timing and correlation.** Schedule delay is sampled and correlated with cost overrun. Lines move together through a one-factor Gaussian copula.
- **Risk events.** Benefits-map assumptions act as risk events: when an assumption fails, the benefits downstream of it are lost. You can add your own cost, delay or benefit events.
- **What-if levers.** Change benefits, costs, delay, ramp-up speed, learning dip, benefit lifetime and discount rate. In **Live** mode the results update as you drag; **Animate** shows the distribution building up.
- **Charts.** NPV histogram with P10, P50 and P90 markers. A cumulative probability curve with a draggable target ("what is the chance NPV beats $X?"). A cash-flow fan chart over time. A cost–benefit scatter. A tornado chart of value drivers. A risk-event impact table. In the portfolio view, box plots for each program.
- **Scenarios.** Save scenarios, overlay up to three of them, and export results to CSV. Runs are deterministic for a given seed, so a result can be reproduced.

### Automatic business case

**Business case builder**, and the **Business case** tab on each program.

- **Drafted from your data.** The business case is built from the information entered for the program: benefits map, benefits register, costs, value assessment, accountabilities, change plan, gates and the latest simulation. It is structured by the four "ares", with an executive summary, options (benefits paths), financial worth, risk and simulation, accountabilities, recommendation and a cost and valuation appendix.
- **Editable narrative.** Every narrative section is drafted automatically. You can edit it, reset it to the automatic draft, or refine it with AI (optional; see below). AI wording is labelled, and you accept or reject it.
- **Exports.** **Word (.docx)** with a cover page, version history, table of contents, charts, tables, headers and page numbers. Also **Print / PDF** and **HTML**.
- **Value-case workflow.** A business case moves from draft to in review, submitted and locked. You can return it for rework, with review cycles counted. Locked versions keep the exact document and figures, and you can compare versions.

## Coverage of the specification

| Spec area | Where in the app |
|---|---|
| Investment intake and categorisation (INV) | **Ideas and intake**: proposals, overlap detection, triage into a program. **Programs**: kanban by lifecycle state, CSV inventory import |
| Strategy and alignment (STR) | **Strategy and alignment**: drivers (current, parent, future), alignment scoring, driver coverage |
| Benefits map modelling (RCM) | Program → **Benefits map**: a canvas in Results Chain notation (initiatives, intermediate and final outcomes, assumptions, contributions and lags). Supports drag, keyboard editing, auto-layout and fit-to-view. Views: Model, Scorecard, Owners, Risk and Validation. Also: mutually exclusive benefits paths, "where do I fit?" person filter, trace back, versions with diffs, workshop mode, outline view and modelling checks |
| Program definition (PRG) | Program → **Overview**: record, design steps, BTOPP checklist, health, quality checks, status reports, closure |
| Project linkage (PRJ) | Program → **Projects**: statements of work, capabilities, BTOPP, the initiatives each project realises |
| Value cases (VCS) and value assessment (VAL) | Program → **Value assessment** and **Business case**: risk instrument (Appendix C.3), alignment, calibration against benchmarks, Delphi estimation |
| Benefits register and profiles (BEN) | Program → **Benefits**: register, driving variable × coefficient, attribution, lag, learning dip, plateaus, realisation plan, opportunities |
| Measurement (MEA) | **Measure library**: measures, baselines, targets, actuals import; realisation status by quarter |
| Stage gates (GOV) | Program → **Gates**: readiness against gate criteria, blocking rules, decisions (stay the course, proceed with conditions, modify, delay, withdraw) with decision authority, funding released to the next gate only, baselines, pilots |
| Portfolio selection (PFM) | **Selection workbench**: value plots, funds per category, waiting list, simulated selection |
| Interdependencies and capacity (DEP) | **Dependencies and capacity**: dependency register, resource demand, change-load heatmap |
| Accountability (ACC) | Program → **Accountability**: derived accountabilities, seven-plus-one acceptance conditions, acceptance, succession |
| Change management (CHG) | Program → **Change**: stakeholder groups, impact and depth, the four Ps, change plan |
| Decision board support (BRD) | **Gates and board**: calendar, meetings, board packs, decision log, approvals, policies |
| Value management office (VMO) | **Value office workspace**: value-case review queue, exceptions, data quality, analyst coaching, funds, estimating accuracy, knowledge base |
| Reporting (RPT) | **Portfolio dashboard**, **Value plots**, **Benefits realisation**, **My accountabilities**. Charts have a table view; CSV and Excel exports |
| Guidance and quality checks (GDA) | Quality checks across programs, MEDIC wording checks on benefits-map elements, gate readiness, in-page guidance, the **Guide** page |
| Audit, history and learning (HIS) | **Lessons and audit**: audit trail with point-in-time view, lessons learned, recognition |
| Configuration (ADM) | **Settings**: thresholds, categories (Appendix C.1), risk instrument, accountability matrix (Appendix C.4), people, data import and export |
| Maturity (Appendix E) | **Maturity diagnostic** |

**Calculations (section 7.2):**

- NPV over monthly periods, IRR, payback, benefit–cost ratio and ROI.
- Benefit profiles.
- Risk score per "are" and overall.
- Alignment score.
- Linear calibration.
- Change load.

`npm run check` verifies these against hand-worked values and against the demo data.

**Naming:** following constraint C-01 of the specification, the product calls the model a **benefits map**. "Results Chain" is used only to describe the notation, with attribution.

## Getting started

Requires Node.js 20+.

```bash
cd benefits-platform
npm install
npm run build        # builds the app into dist/
npm start            # serves dist/ and the API on http://localhost:8081
```

For development with hot reload:

- Run `npm run dev` (http://localhost:5174).
- For the AI endpoint, also run `npm start` in a second terminal; Vite proxies `/api` to it.

`dist/` is a static site and can be hosted on any static host. Without the Node server, everything works except AI refinement.

Use **Viewing as** in the top bar to act as different people. For example, the board chair can record gate decisions, and an outcome owner can accept an accountability. This shows the role-based rules at work.

### AI-assisted narrative (optional)

Set an Anthropic API key before `npm start`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export CLAUDE_MODEL=claude-opus-5-5   # optional, this is the default
npm start
```

This enables **Refine with AI** on each business case section, which uses Claude. The prompt keeps every figure, name and date exactly as given and never adds facts. Set `DISABLE_AI=1` to switch AI off.

## Offline version

```bash
npm run build:offline   # writes dist-offline/CTO_Benefits_Realisation_Platform.html
```

This builds the whole app into **one HTML file** (about 2.5 MB). The file holds every script, style, font and icon. Double-click it to open it in a browser; there is no server, no install, and no internet connection needed. Everything works offline, including the simulation, business cases (Word, PDF and HTML), and Excel and CSV import and export. The one exception is **Refine with AI**, which needs the server.

- **Where your data is saved.** Your work is saved in the browser that opens the file. Use the same browser each time, and keep the file in the same place.
- **Browser support.** Chrome and Edge are recommended. Some browsers don't let a local file save data; the app then shows a warning so you can download a backup before closing.
- **Moving work.** **Settings → Data → Download backup** moves work between computers, browsers, and the online and offline versions.

## Data

- **Storage.** Organisations are stored in the browser (IndexedDB, with an in-memory fallback). Each organisation is a separate workspace.
- **Backups.** **Settings → Data** downloads a JSON backup and restores from one. It also exports all data to Excel, creates blank workspaces and resets the demo.
- **Audit.** Every change is written to the audit trail with who, when, what, and the before and after values.

## Project structure

```
benefits-platform/
  server/index.mjs        static server + /api/ai/narrative (Anthropic SDK)
  vite.offline.config.js  single-file offline build (npm run build:offline)
  scripts/check.mjs       calculation and demo-data checks (npm run check)
  src/lib/
    config.js             defaults from Appendix C (categories, gates, risk instrument, scales)
    finance.js            benefit and cost series, NPV, IRR, payback, sensitivity, realisation
    simulation.js         Monte Carlo engine (sampling, correlation, events, fan, tornado)
    businessCase.js       business case model, HTML and Word generation
    chain.js              benefits map traversal, checks, layout, versions
    scoring.js            risk, alignment, calibration, change load, accountabilities, health
    rules.js              business rules, quality checks, gate readiness
    seed.js               Harbourline Mutual demo organisation
    store.jsx             workspace state, persistence, audit trail
  src/components/         UI kit, charts, simulation lab, business case builder
  src/pages/              portfolio, governance and program pages
```

## Scope notes

This is a single-user browser edition: each browser holds its own data, and the people listed under **Viewing as** are simulated. The following parts of the specification would need a hosted back end and are not included:

- Real-time co-editing.
- Single sign-on and server-enforced permissions.
- E-mail and calendar notifications.
- Live integrations with finance and project tools (section 9). In their place, the app imports and exports CSV, Excel and JSON.
