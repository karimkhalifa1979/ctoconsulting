# CTO Consulting — Operating Model Assessment Tool

A web-based tool for assessing any organisation's operating model, designing its target operating model (TOM), building the business case and producing a branded PDF report. It is built from the **CTO Consulting Operating Model Assessment Toolkit** workbook (`data/source/`) and reproduces every tab and formula in it, then adds AI readiness, TOM design, transition planning, benefits tracking and current-vs-target comparison.

## Quick start

**No install:** open `release/CTO_Operating_Model_Assessment_Tool.html` in Chrome, Edge or Firefox. It runs entirely in the browser, works offline, and opens with a fully populated demo engagement (*Tallowood Water Services*, a fictional water utility). Data is saved in that browser.

**From source** (Node.js 20+):

```bash
cd operating-model
npm install
npm run dev            # development server with hot reload
npm run build          # static site in dist/ (host on any static web server)
npm run build:single   # one self-contained HTML file in dist-single/
npm run check          # formula and business-case sanity checks
npm run seed           # re-extract reference content from the toolkit workbook
```

A sample output is in `docs/Sample_Operating_Model_Assessment_Report.pdf`, and a screen tour of every part of the tool is in `docs/CTO_Operating_Model_Assessment_Tool_Screen_Tour.pdf`.

## Features

| Requirement | Where in the tool |
|---|---|
| Assess any organisation's operating model | **Engagements** (multiple clients, duplicate, backup/restore) · **Engagement setup** (details, objectives, scope, hypotheses, design principles, settings) · **Plan** (stakeholder register & influence/interest map, 72-question interview guides for 10 groups, 69 document requests) · **Discover** (capability heat map, process inventory, org structure spans & layers, RAPID decision rights, application portfolio with TIME, supplier register with dependency risk, locations, cost baseline) · **Maturity assessment** (157 questions, 17 dimensions, five-level maturity model, evidence and confidence) · **Findings** · **Recommendations** (value × ease, horizons) |
| PDF report summarising all findings | **Report (PDF)** — choose sections, then download a branded, paginated PDF with cover, contents, executive summary (auto-written), maturity profile, dimension-by-dimension findings, current-state analysis, AI readiness, TOM, comparison, business case, roadmap, change and risk, and appendices |
| AI readiness | **AI readiness** — 48-question diagnostic across 8 pillars, readiness index (0–100) and level, cross-checks against the main assessment, AI use-case register with value × feasibility × risk-tier prioritisation, Voluntary AI Safety Standard guardrails (with ISO/IEC 42001 and NIST AI RMF references), Australia's AI Ethics Principles, and a gap-based action plan that feeds recommendations and initiatives |
| Tools to design a new target operating model | **TOM designer** — vision, structural archetype selector (with fit, strengths and watch-outs), Operating Model Canvas (POLISM) current → target, target state and key shifts for each dimension with a pattern library, weighted design-options appraisal · target columns in the org structure, RAPID, capabilities, processes, applications, suppliers, locations and a target cost model |
| Track benefits and costs of initiatives / solution components | **Benefits & costs** — initiative register, cost lines (capex/opex, one-off/recurring) and benefit lines (cashable, non-cashable, non-financial; KPI baseline → target; confidence) by financial year; NPV, ROI, BCR, IRR, payback; planned vs actual realisation tracking. Initiatives can be created from recommendations and AI use cases |
| Dashboard of the assessment | **Dashboard** — plain-language summary, maturity heat map, radar, gap chart, strengths and priority gaps, Operating Model Canvas view, findings by severity, recommendation profile and current-state health cards |
| Compare target vs current (costs, benefits, risks, implementation, change) | **Current vs target** — key measures, maturity dumbbell and state-by-state narrative, run-cost bridge and investment profile, benefits and KPI baselines → targets, current-state exposure vs inherent/residual risk heat maps, implementation requirements, change impact heat map with ADKAR barriers and interventions. **Transition & change** holds the roadmap, requirements, change impact, change activities and risk register |

Also: Excel export in the toolkit's layout (re-importable), import of a completed toolkit workbook, CSV export and paste-from-Excel on every register, editable dropdown lists, undo, and automatic saving.

## How data is stored

Everything is stored in the browser (IndexedDB, falling back to localStorage). Nothing is sent to a server. Use **Engagements → Backup** (JSON) or **Excel workbook** to move or share an engagement, and **Import** to load it elsewhere.

## Calculations (from the workbook)

- Gap = target − current; weighted gap = max(0, gap) × importance; RAG Red ≥ 1.5, Amber ≥ 0.75 (configurable).
- Averages exclude unscored and N/A questions; dimension target averages only assessed questions.
- Recommendation category from Value and Ease against the prioritisation threshold (Quick win, Strategic initiative, Fill-in, Deprioritise).
- Span of control = (permanent + fixed-term + contractor FTE − 1) ÷ people managers, assessed against the nature-of-work benchmark; layers against the maximum.
- TIME = business fit × technical fit against the threshold; supplier dependency risk from single source, material provider and exit plan; expiry warnings from the warning period.
- Business case: end-of-year discounting at the engagement discount rate; benefits optionally risk-adjusted by confidence; non-financial benefits excluded from NPV.

## Project structure

```
data/source/                 The toolkit workbook
scripts/build-seed.mjs       Extracts the workbook's reference content into src/data/toolkit.json
scripts/check.mjs            Calculation checks
src/data/                    Toolkit content, AI readiness framework, TOM library, demo engagement
src/lib/model.js             Engagement data model
src/lib/calc.js              Workbook formulas and aggregates
src/lib/finance.js           NPV, ROI, payback, IRR
src/lib/aiCalc.js            AI readiness scoring
src/lib/compare.js           Current vs target model
src/lib/narrative.js         Auto-written executive summary
src/lib/pdf.js               PDF report
src/lib/excel.js             Excel export / import
src/components/              Layout, editable data grid, SVG charts, UI
src/pages/                   Application screens
```

Brand colours and fonts are defined as tokens at the top of `src/styles/app.css` (shared with the CTO Consulting regulatory assessment tool in the repository root). The PDF embeds Inter and Montserrat (SIL Open Font License, see `src/assets/fonts/`).

The tool is a decision-support aid; assessments and business cases should be validated with the client.
