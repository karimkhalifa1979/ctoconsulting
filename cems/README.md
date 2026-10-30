# CEMS — Consulting Engagement Management System

CTO Consulting's system for running client engagements end to end: engagements and their projects,
plans and stage gates, RAID, change control, the weekly status update, timesheets and expenses,
resources, budgets, monthly forecasts, invoicing, and client-ready Word and PDF reports generated
from the Firm's own templates. It is built from the *CEMS Requirements Specification v0.1*
(`docs/CEMS_Requirements_Specification_v0.1.docx`); Release 1 covers the Must requirements.

## Quick start

Requires Node.js 22.13 or later. LibreOffice is optional and adds PDF output for reports.

```bash
cd cems
npm ci
npm run build      # builds the web client into dist/
npm start          # http://localhost:8090
```

The first start seeds a realistic demo firm (about 30 seconds): five engagements across three
clients, roughly sixteen months of history replayed through the real services — timesheets,
weekly status updates, forecast cycles, invoices, issued reports — ending today. Sign in by
choosing a persona on the sign-in page.

For development, run the API and the Vite dev server side by side:

```bash
npm run dev:server   # API on :8090, restarts on change
npm run dev          # web client on :5173, proxies /api to :8090
```

With Docker:

```bash
docker build -t cems .
docker run -p 8090:8090 -v cems-data:/data cems
```

To reset the demo data: `npm run seed -- --reset` (add `--no-pdf` to skip PDF rendering).

## Demo personas

| Persona | Role | Try |
|---|---|---|
| Olivia Bennett | Engagement executive (Partner) | Portfolio and margin; approve the report and the commercial approval waiting for her |
| Marcus Chen | Engagement manager, Digital Services Transformation | Approve Priya's status update (it overrides a calculated Red, BR-06); generate, submit and issue this week's report |
| Jack Thompson | Engagement manager, Clinical Systems Assurance | Milestone fixed price and retainer; approve two status updates |
| Priya Raman | Project manager, Grants platform implementation | The Red project: plan and Gantt, the queried forecast, PO running out, time approvals |
| Tom Walsh | Project manager on two engagements | This week's status update is late: start it, complete it and submit |
| Aisha Mohammed | Team member | Finish this week's timesheet and submit it |
| Lucas Martin | Engagement manager of a restricted engagement | Restricted engagements are hidden even from portfolio roles (ACC-004) |
| Grace Liu | Resource manager | Capacity grid, utilisation, the open critical resource request |
| Daniel Rossi | Finance manager | Forecast cycle (one project queried), invoices, period close, debtors |
| Sophie Turner | PMO lead | Template library (a client template waits for approval), status tracker, data quality |
| Ben Ahmed | System administrator | Users, configuration, jobs and integrations; no engagement content (ACC-009) |
| Arjun Patel | Internal auditor | Audit log with chain verification |
| Rachel Kim, James Wilson, Dr Helen Wu | Client users | The client portal: issued reports, deliverable acceptance, client-owned actions |

## What is in it

| Area | Where in the application |
|---|---|
| Clients, agreements, contacts (CLI) | Clients |
| Engagements: projects, governance, contracts and POs, financials, reports, team and access, closure (ENG) | Engagements |
| Projects: plan and Gantt with critical path, stages and gates, baselines, RAID, changes, weekly status, resources, budget and forecast, earned value, closure (GOV, PLN, SCP, STS, CLS) | Projects |
| RAID across engagements, risk heat maps (RSK, RAI) | RAID |
| Timesheets, expenses, approvals with delegation (TEX, WFL) | Timesheet, Time approvals, Approvals |
| Capacity, utilisation, resource requests and matching (RES) | Resources |
| Forecast cycle, invoices, periods, revenue forecast, cash flow, debtors, financial reports (FIN) | Finance |
| Report templates, token reference, generation with readiness checks, review, issue and distribution (RPT) | Reports |
| Exceptions, data quality, trends, analytics feeds (DSH) | Portfolio, PMO |
| Client portal (CPT) | `/portal` for client users |
| Users, configuration, delivery profiles, custom fields, imports, system health, retention, audit (ADM, DAT, NFR) | Administration |

Every requirement's status and location is listed under **Administration › Requirements**.

## Architecture

- **Server** (`server/`): Node's `http` and built-in `node:sqlite`, no framework. Services in
  `server/lib/` own the business logic (access, entities, workflow, schedule, finance, forecast,
  status, time, billing, reports); routes in `server/routes/` are thin. Records are JSON documents
  in SQLite tables with revision numbers for optimistic concurrency.
- **Shared rules** (`shared/`): the entity schema, permission matrix, reporting calendar, RAG
  derivation, risk matrix, token catalogue and formats, used by both server and client.
- **Client** (`src/`): React and Vite. Registers, forms and record drawers are generated from the
  entity schema; dashboards and workflows have their own pages.
- **Report engine** (`server/lib/reports/`): Word templates with `{{tokens}}`, loops, conditions,
  charts and helpers are validated on upload, rendered from a frozen data snapshot, and converted
  to PDF by LibreOffice in an isolated worker.
- **Jobs** (`server/lib/jobs.mjs`): reminders, cut-offs, escalations, exception alerts, scheduled
  report drafts, the weekly forecast refresh, digests, retention and integration retries.
- **Data** lives in `CEMS_DATA_DIR` (default `./data`): `cems.db` and `files/`. Back up both.

## Security and access

- Access is granted per engagement by membership and role; a membership can be limited to some
  projects, which is how project managers work on their own projects (ACC-001). Portfolio roles
  read across non-restricted engagements; restricted engagements are visible to named members only.
- **Costs (ACC-003).** Cost rates, margins, WIP and internal notes are shown only to finance,
  engagement executives and engagement managers. Project managers, who own their project's budget
  and forecast, see the project's cost totals (BAC, actual cost, EAC) but never individual rates or
  margins.
- **Client users (CPT-005)** receive only client-visible records and whitelisted fields, enforced in
  the data layer and covered by automated tests. They can update only client-owned actions.
- Sessions end after 30 minutes of inactivity; every state-changing request carries a CSRF token;
  the content security policy allows no inline or third-party script. Uploads are typed by content,
  scanned when ClamAV is configured, and macros are stripped from templates.
- The audit log records every change, approval, access change, export and distribution in a hash
  chain that can be verified under **Administration › Audit log**.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8090` | HTTP port |
| `CEMS_BASE_URL` | `http://localhost:PORT` | Public URL, used in emails and portal links |
| `CEMS_ENV` | `development` (or `production` when `NODE_ENV=production`) | Environment banner and safeguards |
| `CEMS_DATA_DIR` | `./data` | Database and files |
| `CEMS_AUTH_MODE` | `demo` | `demo` (persona sign-in) or `oidc` |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` | | Microsoft Entra ID single sign-on (INT-001) |
| `OIDC_REQUIRE_MFA` | `true` | Reject sign-ins without MFA claims |
| `OIDC_GROUP_ROLES` | `{}` | JSON map of Entra ID group IDs to Firm roles |
| `SCIM_TOKEN` | | Bearer token for SCIM user provisioning (`/scim/v2`) |
| `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`, `M365_SENDER` | | Send email through Microsoft Graph; otherwise messages stay in the outbox |
| `CLAMAV_HOST`, `CLAMAV_PORT` | | Malware scanning of uploads |
| `CEMS_INTEGRATION_KEY` | | Key for inbound integration endpoints (accounting, CRM) |
| `CEMS_SOFFICE` | `soffice` | LibreOffice binary for PDF output |
| `CEMS_JOBS` | `true` | Run the job scheduler |
| `CEMS_SEED` | `true` | Seed demo data when the database is empty |

Firm settings — reporting calendar, RAG rules, tolerances, approval thresholds, timesheet rules,
GST and the financial year, numbering — are edited under **Administration › Configuration**
without a release.

## Report templates

Templates are ordinary Word documents. Put tokens where values belong — `{{engagement.name}}`,
`{{rag status.overall_rag}}`, `{{currency fin.contract_value}}` — repeat rows or paragraphs with
`{{#each risks filter="reportable" sort="rating desc" limit=5}} … {{/each}}`, show content
conditionally with `{{#if …}} … {{else}} … {{/if}}`, and insert charts with `{{chart "rag_trend"}}`.
Existing placeholders, bookmarks and content controls can be mapped to tokens without editing the
file. The full catalogue is under **Reports › Token reference** (also downloadable as Excel).
Starter templates for weekly engagement and project reports and the change request form are
installed with the demo data.

## Integrations and systems of record

| Data | System of record | In CEMS |
|---|---|---|
| Identities, groups, MFA | Microsoft Entra ID | Single sign-on; SCIM provisioning |
| Prospects and pipeline | CRM | Won opportunities create engagements; growth opportunities go back |
| Invoices, payments, general ledger | Accounting system | CEMS drafts and approves invoices, sends them for issue and receives status |
| People and employment | HR system | People import; cost rates maintained by finance |
| Engagements, projects, status, RAID, time, forecasts, reports | CEMS | Analytics feeds for Power BI under **PMO › Analytics feeds** |
| Email | Microsoft 365 | Notifications and report distribution |
| Documents | SharePoint | Document register links; issued reports archived in CEMS |

Every outbound call is logged with an idempotency key and retried with back-off; failures are
visible and retryable under **Administration › System**. Key events (status submitted, report
issued, change approved, threshold breached) can be sent to signed webhooks.

## Operations

- `npm run smoke [-- URL]` checks a running instance: the API, the web client, the security headers
  and, in demo mode, a sign-in for every persona.
- **Administration › System** shows health, scheduled jobs (with *Run now*), the integration log and
  the email outbox.
- Back up `CEMS_DATA_DIR` (for example `sqlite3 data/cems.db ".backup backup.db"` plus `data/files/`).
- `npm sbom --sbom-format cyclonedx` produces a software bill of materials.

## Tests

```bash
npm test
```

Unit tests cover the reporting calendar, business days, the financial year, RAG derivation,
overrides, risk rating, permission grants and formats. API tests run against a freshly seeded
instance and cover sign-in and CSRF, client data isolation (CPT-005), cost visibility (ACC-003),
project-scoped access, override justification (BR-06), future and locked time (BR-08, BR-09), PO
consumption on its GST basis (BR-13), the report approval, issue and locking lifecycle (BR-07),
attachments and upload checks (DOC-004, NFR-008), and verification of the audit chain (NFR-025).

## Requirements traceability

**Administration › Requirements** lists all 372 requirements with their status and where they are
implemented. The list is generated by `npm run traceability` from the requirement IDs cited in the
code next to the implementation, plus the reviewed statuses in `scripts/build-traceability.mjs`.

Of the 235 Must requirements, 210 are implemented or configurable. The other 25 are hosting and
operations items (encryption, Australian hosting, availability, recovery, backups), rollout
activities (pilot, parallel running, migration sign-off, training, hypercare, penetration testing,
privacy impact assessment), or partly met pending go-live work: load and accessibility testing,
user guides, and connection to the accounting system the Firm selects.

Not in this release: Microsoft Project import and export, agile velocity and burn charts,
PowerPoint and Excel report rendering, AI drafting, multi-currency, GL reconciliation, Outlook
calendar suggestions, a requirements register and PMO health checks.
