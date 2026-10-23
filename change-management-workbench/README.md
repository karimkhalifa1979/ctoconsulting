# Change Management Workbench

A web application for running change management on projects of any size, from a single team's process change to a multi-release enterprise program. It follows the Prosci 3-Phase Process and the ADKAR Model, and was built from the *Change Management Workbench Specification v0.1*.

Prosci® and ADKAR® are registered trademarks of Prosci, Inc. This application refers to the Prosci Methodology descriptively, for alignment, and is not affiliated with or endorsed by Prosci, Inc. Assessments, question sets and the intervention library are organisation-authored defaults, not Prosci's proprietary instruments, and can be replaced in Administration.

## What it covers

**Phase 1, Prepare Approach.** A guided set-up for new initiatives; the case for change, scope and definition of success; objectives and measures; releases and milestones (with Microsoft Project import); change impact by group and aspect, with heatmap and timeline; change characteristics, organisational attributes, PCT health, sponsor and readiness assessments, giving the change risk profile; and the Change Management Strategy, with its recommended planning approach.

**Phase 2, Manage Change.** ADKAR Blueprints, assessments and anonymous survey campaigns, with barrier points; the Master Change Management Plan of Blueprints, Core plans and Extend plans, with coverage warnings, baselines and approvals; stakeholder analysis, engagement plans, the engagement log, quick capture on a phone (also offline), calendars and alerts; sponsorship, people managers, communications and key messages, training, resistance, change agents, feedback and measures.

**Phase 3, Sustain Outcomes.** Performance review, sustainment plan, handover to business owners, lessons learned and closeout. Closed initiatives become read-only.

**Across initiatives.** The stakeholder master shared by every initiative, with imports, duplicate review and privacy requests. Also:

- **Artefacts:** 24 artefacts generated in Word, PowerPoint, PDF, Excel and HTML, with completeness checks, document control, approvals, a library with reproducible snapshots, schedules and bulk generation.
- **Insight and workflow:** role-based dashboards, standard reports and a report builder; a portfolio view of change load; tasks, approvals and notifications in My work.
- **Governance:** administration, the audit trail and retention.
- **Integration:** optional AI assistance, and a REST API with webhooks.

[docs/requirements-coverage.md](docs/requirements-coverage.md) maps every requirement, rule, use case and acceptance criterion in the specification to what was built.

## Try it

### Offline workbench: one file, nothing to install

[`offline/Change_Management_Workbench.html`](offline/Change_Management_Workbench.html) is the whole application in one file. Copy it anywhere and double-click it. It opens in your web browser and runs without a server, an internet connection or Node.js. `npm run build:offline` rebuilds it.

- **Your own data.** The workbench opens with the demonstration data. **Start your own workbench** on the sign-in screen replaces it with an empty workbench for your organisation, with you as its administrator and change management lead.
- **Where data is kept.** Everything stays in the browser on that computer (IndexedDB). Google Chrome, Microsoft Edge and Firefox keep it between sessions. Safari may refuse storage to a file opened from disk; the workbench then says so, keeps working in memory and asks you to back up before you close it.
- **Backups.** **Back up**, in the banner, the user menu or Administration › System, saves everything to one `.json` file: records, configuration, the audit trail and stored files. **Restore from a backup** loads that file in any browser, so a backup also moves the work to another computer. Back up regularly: clearing the browser's site data deletes the workbench.
- **One tab at a time.** If you open a second tab, it offers to take over and the first one stops, so the two never overwrite each other.
- **What needs a server.** There are no emails, single sign-on, AI assistance, API or webhooks. Survey links open in the same browser, for entering responses collected in a meeting or on paper.
- **Access.** There are no passwords, so anyone who can use that browser can open the workbench. Keep the computer account protected.

The rest of this section needs Node.js 22.13 or later.

### Browser-only demonstration

```bash
npm install
npm run dev
```

Open <http://localhost:5173/?mode=standalone> and choose a demonstration user. Everything runs in the browser against fictional data stored in IndexedDB; **Reset demonstration data** starts again. The built app (`npm run build`, then the `dist/` folder) can be hosted on any static web host, where it switches to this mode on its own.

### Server

```bash
npm install
npm run build
npm run seed          # loads the demonstration data into data/cmw.db
CMW_DEMO=1 npm start  # http://localhost:8080
```

With `CMW_DEMO=1` the sign-in page lists the demonstration users. They can also sign in with their email address and the password `Demo-Workbench-2026`. Without demonstration data, the first start creates a break-glass administrator (`CMW_ADMIN_EMAIL`, `CMW_ADMIN_PASSWORD`) and logs its password if none was given.

### Demonstration users

| User | Role |
|---|---|
| Priya Raman | Change management lead (all three initiatives) |
| Tom Nguyen | Change practitioner |
| Grace Okafor | Communications adviser |
| Liam Walsh | Training lead |
| Hannah Brooks | Project director (PM/PMO) |
| Margaret Chen | Primary sponsor |
| Daniel Kowalski | People manager |
| Aisha Rahman | Change agent |
| Robert Taylor | Portfolio change manager |
| Sam Lee | Administrator |
| Fiona Grant | Auditor (read-only) |

## Configuration

The server reads these environment variables. Everything else, including lists, terminology, custom fields, thresholds, rules, templates and retention, is configured in the application under **Audit and configuration**. It can be exported and imported to promote it between environments.

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default 8080). |
| `PUBLIC_URL` | The address people use, for links in emails and survey invitations. |
| `CMW_DB` | Database file (default `data/cmw.db`). |
| `CMW_DATA_KEY` | Base64 256-bit key to encrypt data at rest (AES-256-GCM), for example from `openssl rand -base64 32`. Keep it in a key vault: data cannot be read without it. |
| `CMW_DEMO` | `1` to show demonstration sign-in, and to load the demonstration data into an empty database. |
| `CMW_SEED` | `demo` to load the demonstration data into an empty database without demonstration sign-in. |
| `CMW_ADMIN_EMAIL`, `CMW_ADMIN_PASSWORD` | The break-glass administrator created on first start. |
| `COOKIE_SECURE`, `TRUST_PROXY` | `1` behind a TLS-terminating reverse proxy (secure cookies; client addresses from `X-Forwarded-For`). |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` | Single sign-on with OpenID Connect, for example Microsoft Entra ID. |
| `OIDC_SCOPES`, `OIDC_ROLE_CLAIM`, `OIDC_ROLE_MAP` | Scopes to request; the claim that carries roles or groups (default `roles`); a JSON map from those values to application roles. |
| `OIDC_JIT`, `OIDC_SYNC_ROLES` | `1` to create users on their first sign-in, and to update their roles from the identity provider at each sign-in. |
| `SMTP_URL`, `MAIL_FROM` | Email for notifications, scheduled distribution and survey invitations, for example `smtps://user:password@smtp.example.org`. `LOG_EMAIL=1` logs emails that would have been sent. |
| `TEAMS_WEBHOOK_URL` | Microsoft Teams incoming webhook for approvals, resistance and leaver alerts. |
| `CMW_PUBLISH_DIR` | Folder that artefacts are published to, for example a synchronised SharePoint library or a records share. |
| `CMW_HR_SYNC_FILE` | HR or directory export (CSV) read each day to update stakeholders and flag leavers and movers. Matching uses `email` or `employeeid`; the columns read are `position`, `location`, `businessunit`, `costcentre`, `manageremail` and `status`. |
| `CMW_RETENTION_AUTO` | `1` to apply the retention schedule each day. Otherwise the job only reports what is due. |
| `CMW_SCAN_COMMAND` | The organisation's malware scanner for uploads. It reads the file on standard input and exits 0 when clean and 1 when infected, for example `clamdscan --no-summary -`. Uploads are refused if it cannot run. |
| `CMW_SCOPE_THRESHOLD` | Stakeholder master size above which each initiative holds only the stakeholders it uses (default 5,000). |
| `API_RATE_PER_MIN`, `USER_RATE_PER_MIN` | Request limits per API client (default 600) and per signed-in user (default 1,200). |
| `ANTHROPIC_API_KEY` | Turns on AI assistance. Administrators can still turn it off for the organisation, an initiative or a feature. `CLAUDE_MODEL` chooses the model; `CLAUDE_INFERENCE_GEO` keeps inference in a region; `DISABLE_AI=1` turns it off. |
| `LOG_REQUESTS` | `1` to log each request. |

The REST API is described at `/api/v1/openapi.json`. API clients and webhooks are set up under **Audit and configuration › Integrations and API**.

## How it is built

- `shared/`: the domain, used unchanged by the server and the browser. It holds the entity schema, the business rules (`shared/rules/`, RUL-01 to RUL-20), the derived model and the service. The service covers access control, validation, the audit trail and every operation. It also holds the artefact engine: data snapshot, format-neutral content, then the Word, PowerPoint, PDF, Excel and HTML renderers.
- `server/`: a Node.js HTTP server with sessions, OpenID Connect, API clients, the REST API and SQLite storage (`node:sqlite`, optionally encrypted). It also runs the background jobs: schedules, locking, cadence and measure alerts, survey opening and closing, HR synchronisation and retention.
- `src/`: the React client, built with Vite. It talks to the server's API, or runs the shared service in the browser for the demonstration and the offline workbench. `scripts/single-file.mjs` puts the offline build into one HTML file.

Because the rules, model and renderers are the same code in both places, a figure on a screen and in a generated document always agree.

### Large organisations

Each initiative's working set holds its own records and the enterprise records it uses. Once the stakeholder master grows past `CMW_SCOPE_THRESHOLD`, an initiative holds only the people it uses:

- people its records refer to
- members of its groups and their sub-groups
- those people's direct managers
- people linked to users
- the other end of each recorded relationship

Stakeholder pickers then also search the whole master on the server as you type. The master register loads its first 5,000 people and searches the rest on the server. Individual survey responses never leave the server; screens get counts, and results come aggregated with small groups suppressed.

## Tests

```bash
npm test            # business rules, acceptance criteria AC-01 to AC-11, service controls
npm run test:perf   # scale and timing checks for ART-018 and PER-01 to PER-05
CMW_PERF_DRIVER=sqlite npm run test:perf   # the same on the server's SQLite storage
```

The scale test grows the demonstration data to 2,000 stakeholders and 1,000 activities in one initiative, a 20,000-response survey and a 100,000-person stakeholder master. It then times each check against its limit; the results are in the [coverage document](docs/requirements-coverage.md#measured-performance).

## Deploying

- Run one deployment, with its own database, per organisation; this isolates each tenant's data. Host it in an Australian region where data must stay onshore.
- Put it behind a reverse proxy that terminates TLS 1.2 or later; set `PUBLIC_URL`, `COOKIE_SECURE=1` and `TRUST_PROXY=1`.
- Set `CMW_DATA_KEY` for encryption at rest, and keep the key in the organisation's key management service.
- Back up the database file (`cmw.db` with its `-wal` file) at least hourly to meet the recovery point objective, and test restores.
- Configure single sign-on, and keep local accounts for break-glass administration only.
- The SQLite store suits a single server node. Serving 1,000 concurrent users or several nodes would need a shared database behind the same storage interface (`server/db.mjs`).
