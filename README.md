# CTO Consulting — Regulatory & Standards Assessment Tool

A web application for discovering, registering, assessing and reporting an organisation's regulatory obligations and industry standards, branded for **CTO Consulting**.

It ships pre-loaded with the complete *NDIA ICT Policy Requirements Register v0.48* against the organisation **National Insurance Disability Agency**, and can assess any number of additional organisations.

## Features

| # | Capability | Where |
|---|---|---|
| 1 | Enter an organisation name | **Discover obligations** → step 1 |
| 2 | Automatically discover applicable legislation, mandatory policies and standards | Profile inference from the name, a questionnaire, and a rules engine over **152 sources** (105 from the register + 47 catalogue sources: APRA, AML/CTF, state privacy and cyber policies, ISO, NIST, GDPR, DORA…). Optional **Claude research with web search** when an API key is configured |
| 3 | Populate obligations in the register's *Obligations* tab format | **Obligations** (policy number, obligation ID, requirement mapping, name, reference, description, applicability, source, publisher, type, URLs) |
| 4 | Create policy requirements with a suggested target policy | **Policy requirements** — all 41 register attributes, grouped under 14 target policies |
| 5 | Comprehensive control assessment | **Control assessment** — status, maturity (current / target), design & operating effectiveness, per-control testing (ISM, technical and procedural controls), evidence checklist, findings, risk, remediation owner / due date |
| 6 | Assessment report | **Assessment report** — executive summary, results by policy, priority × status heatmap, maturity gaps, findings, remediation plan, detailed results; print/PDF, Word, Excel and CSV |
| 7 | Traceability across obligations, requirements, controls, evidence, roles and all attributes | **Traceability** — trace explorer, full traceability matrix (CSV), source × policy coverage heatmap |
| 8 | Automatically author a policy document from a template | **Policy author** — standard template, or upload an example policy (.docx) whose headings become the template; inline editing; Word / PDF export; optional Claude refinement |
| 9 | Dashboard of all discovered obligations | **Dashboard** |
| 10 | Calendar of upcoming regulatory requirements | **Regulatory calendar** — month and agenda views, statutory dates, reviews, audits, exemption expiries, remediation due dates, event-driven deadlines; `.ics` export |
| 11 | CTO Consulting look and feel | Brand tokens in `src/styles/app.css` (`--brand-*`) |
| 12 | Full register loaded against *National Insurance Disability Agency* | Reference organisation; all 53 worksheets also browsable in **Register explorer** |
| 13 | Multiple organisations | Organisation switcher, **Organisations** page, backup / restore, Excel export, workbook import |

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run build        # builds the app into dist/
npm start            # serves dist/ and the API on http://localhost:8080
```

For development with hot reload run `npm run dev` (and `npm start` in another terminal if you want the AI endpoints; Vite proxies `/api`).

`dist/` is a static site: it can also be hosted on any static host (e.g. GitHub Pages, Azure Static Web Apps, S3). Without the Node server the tool runs on its built-in rules engine.

### AI-assisted discovery and drafting (optional)

Set an Anthropic API key before `npm start`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export CLAUDE_MODEL=claude-opus-5-5   # optional, this is the default
npm start
```

This enables **Research with Claude** in the discovery wizard (web search to confirm the organisation's sector, regulators and jurisdictions, and to propose additional sources) and **Refine** on each policy section.

## Data

- `data/source/NDIA_ICT_Policy_Requirements_Register_v0.48.xlsx` — the source register.
- `npm run seed` regenerates `public/data/ndia/*.json` from the workbook (requirements, obligations, exemptions, PSPF master and every worksheet verbatim).
- Organisations, assessments and policy drafts are stored in the browser (IndexedDB). Use **Organisations → Download backup** to move or share them.
- `npm run check` runs sanity checks on the knowledge base and discovery engine.

## Notes

- Applicability is determined from the organisation profile; always review the profile and the discovered sources. Conditional sources depend on activities that should be confirmed.
- Calendar dates marked *indicative* are set by the regulator each cycle and must be confirmed.
- The tool is a decision-support aid, not legal advice.

## Project structure

```
src/lib/registerParser.js   Workbook parser (shared by the seed script and browser import)
src/lib/profile.js          Organisation profile model and name-based inference
src/lib/catalog.js          Target policies, applicability rules and catalogue sources
src/lib/discovery.js        Discovery and register generation
src/lib/assessment.js       Assessment model and scoring
src/lib/calendar.js         Regulatory calendar
src/lib/policyAuthor.js     Policy document generation and .docx template parsing
src/lib/exporters.js        Excel, Word, CSV and iCalendar exports
src/pages/                  Application screens
server/index.mjs            Static server and optional Claude API endpoints
```
