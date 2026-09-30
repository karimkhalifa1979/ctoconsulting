# CTO Consulting — Regulatory Assessment Tool and Proposal Platform

Two web applications branded for **CTO Consulting** ([www.ctoconsulting.com.au](https://www.ctoconsulting.com.au)), built from one codebase:

- **Regulatory & Standards Assessment Tool** (`index.html`) — discovers, registers, assesses and reports an organisation's regulatory obligations and industry standards. Described below.
- **Proposal Platform** (`proposals.html`) — takes a bid from the client's request to a submitted Word proposal and PowerPoint deck. See [Proposal Platform](#proposal-platform).

## Regulatory & Standards Assessment Tool

A web application for discovering, registering, assessing and reporting an organisation's regulatory obligations and industry standards.

It ships pre-loaded with the complete *NDIA ICT Policy Requirements Register v0.48* against the organisation **National Insurance Disability Agency**, and can assess any number of additional organisations.

### Features

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

## Proposal Platform

Implements the *Proposal Authoring Platform — Functional & Technical Specification* (v0.1): one workspace per bid, nine lifecycle stages and three approval gates, a governed content library, grounded AI drafting with citations, and on-brand Word and PowerPoint outputs that are checked before submission. Open `/proposals.html`, or follow the link at the foot of the assessment tool's sidebar.

All clients, people, bids and documents in the demonstration data are fictitious.

### Try it

```bash
npm install
npm run build
npm start                     # http://localhost:8080/proposals.html
```

Choose a person on the sign-in screen to see their role's view — for example **Sophie Tran** (bid manager), **Marcus Lee** (author), **Rebecca Stone** (commercial approver, sees margin), **Daniel Whitford** (partner), **Nina Kowalski** (content librarian) or **Priya Raman** (administrator). The seeded bids cover every stage:

| Bid | Stage | Shows |
|---|---|---|
| Southern Rivers Water Authority — cloud migration and cyber uplift | Author | Section editor, AI text awaiting review, comments and suggestions, addendum, compliance matrix |
| Office of the Digital Registrar | Qualify | Draft extraction to confirm, opportunity brief, bid/no-bid scorecard, questionnaire returnable |
| Kestrel Superannuation | Approve | Gate 2 awaiting a second commercial approval because margin is below threshold |
| Australian Skills Assurance Commission | Produce | All gates passed: generate, check, mark final, submit and record the outcome |
| Harbourside City Council | Intake | A new request to extract |
| Tasman Freight Group | Confidential | Ethical wall: hidden from the excluded consultant |

Fictitious sample request packs to try intake with are in `public/samples/` (PDF and Word).

### Modes

- **Server mode** (`npm start`): the Node server owns the data in `data/proposals/` (git-ignored). Every command runs on the server with the signed-in user's permissions; reads are filtered by bid membership, ethical walls and cost redaction; changes and presence stream to every open browser; reminders, escalations and the daily digest run on a timer; PDFs are rendered with LibreOffice.
- **Browser mode** (static hosting or `npm run dev` without the server): the same command layer runs in the browser against IndexedDB, so the full workflow can be demonstrated anywhere. Data stays on that device.

### Configuration

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables Claude for drafting, executive summaries, shorten, strengthen, case study tailoring and storyboards. Without it the offline engines produce the same structures. |
| `CLAUDE_MODEL` | Model used by both tools (default in `server/index.mjs`). |
| `PROPOSALS_DATA_DIR` | Where the server keeps proposal state and files (default `data/proposals`). |
| `DEMO_SIGNIN=0` | Turns off the demonstration sign-in picker (for use once Entra ID is connected). |
| `PORT` | Server port (default 8080). |

PDF and PDF/A export and page counting need LibreOffice (`soffice`) and Poppler (`pdftotext`) on the server host.

### How the specification maps to the platform

| Area | Requirements | Where |
|---|---|---|
| Lifecycle and gates | 9 stages, gates 1–3, stage exit conditions, configurable workflows (WF-06), value and margin rules | Bid workspace stepper and Overview; Approvals; Qualify; Administration → Workflow templates |
| Intake and requirements | CR-01…CR-10: upload packs (PDF, Word, Excel, PowerPoint, email, ZIP) with virus scan; extraction of fields, dates, submission rules, requirements and criteria with source links; confirm/correct; addenda with change review; compliance matrix and client-format schedules | New bid; Request; Compliance matrix |
| Planning and authoring | WF-01…WF-05, WF-16: outline from the client's structure or templates; owners, reviewers, due dates, limits; section editor with locking, presence, comments, @mentions, suggestions, version history, compare and restore; clarifications register | Plan; Sections; section editor; Clarifications |
| Review and approval | WF-07…WF-10, WF-14: decisions with conditions and the exact snapshot; edits after approval void approvals; score heatmap; My work; delegation | Reviews; Approvals; My work; Delegate my approvals |
| Notifications | WF-11, WF-12: in-app, email and Teams cards, daily digest, escalations | Notifications; Administration → Notification outbox |
| Content library | CL-01…CL-12: bulk import with suggested metadata, taxonomy, lifecycle, owners and review dates, versions, semantic search and find similar, confidentiality and anonymised variants, consultant profiles and CVs, template validation, nominations, usage and win rate | Content library; Consultants; Templates; Submission → Nominate |
| AI drafting and outputs | WD-01…WD-11: grounded drafts with citations, “needs evidence” flags, AI text labelled until reviewed and blocking approval, other AI actions, Word templates with the tag syntax, pre-final checks linked to sections, PDF and PDF/A, manual re-upload, client returnables, provenance | Section editor; Produce |
| Presentations | PP-01…PP-08: masters and layout mapping, recipes, AI storyboard, outline editor and preview, native PowerPoint rendering, overflow flags, re-upload, rehearsal pack | Presentation; Templates; Administration → Deck recipes |
| Team and pricing | PR-01…PR-08: consultant search, CVs in client formats, four pricing models, rate cards with panel precedence, discounts, expenses, AUD with GST, margin view and threshold rule, registers, Excel schedules; cost data restricted by role | Team and pricing; Rate cards |
| Insight | Dashboards: My work, pipeline, bid health, win/loss, content insight, AI usage; every view exports | My work; Pipeline; Overview; Insight |
| Governance | Audit trail with a SHA-256 hash chain (WF-15), AI call log with model, prompt version and sources, per-bid AI switch and disclosure, session limits (30 minutes idle, 12 hours) | Audit trail; AI usage; bid Settings |

### Integrations

In this build, Microsoft Entra ID sign-in is represented by the demonstration sign-in; email and Teams messages are generated and queued in the notification outbox with Teams approval cards previewed in the app; SharePoint folders are imported as ZIP exports; calendars use `.ics` files. Administration → Integrations lists each integration, its status and the settings needed to connect it. Section editing uses the specification's MVP approach (section-level locking with presence); real-time co-editing is its Phase 2.

### Checks

```bash
npm run check:proposals   # 86 domain checks: permissions, redaction, gates, voiding, locking, outputs, audit tampering
npm run check:server      # API checks: sessions, server-side permissions, walls, files, virus scan, AI grounding, PDF/A
```

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
server/index.mjs            Static server, Claude endpoints and the Proposal Platform API

src/proposals/core/         Proposal Platform domain: commands, permissions, workflow, pricing, extraction,
                            drafting, checks, analytics, audit (pure JavaScript, shared by browser and server)
src/proposals/gen/          Word template engine, PowerPoint rendering, Excel, CVs, document parsing
src/proposals/pages/        Proposal Platform screens
src/proposals/lib/          Browser and server backends, AI client, rendering client
server/proposals.mjs        Proposal Platform API: sessions, commands, files, events, jobs, PDF rendering
server/proposalsAi.mjs      Grounded Claude drafting with citations, and offline fallbacks
scripts/check-proposals*.mjs  Domain and server checks
```
