# Requirements coverage

How the Change Management Workbench meets each requirement in the *Change Management Workbench Specification v0.1*. Every requirement, business rule, use case and acceptance criterion in the specification is listed below, with what was built and where to find it.

| Status | Meaning |
|---|---|
| Done | Built and verified (by automated tests, document validation or browser checks). |
| Partly | Built, with the limitation stated. |
| Deployment | Met by how the service is hosted and operated. What the application provides is noted. |
| Organisational | An organisational or project activity. How the application helps is noted. |
| Not built | Not in this release. |

## Summary

All 347 items: 308 done, 17 partly, 9 deployment, 11 organisational, 2 not built.

The 199 requirements marked Must: 178 done, 7 partly, 9 deployment, 5 organisational.

| Area | Done | Partly | Deployment | Organisational | Not built |
|---|---:|---:|---:|---:|---:|
| Business objectives and requirements | 12 |  |  |  |  |
| Use cases | 9 |  |  |  |  |
| Initiative definition (INI) | 12 |  |  |  |  |
| Change impact (IMP) | 12 |  |  |  |  |
| Risk and readiness (RSK) | 9 | 1 |  |  |  |
| Change Management Strategy (STR) | 8 |  |  |  |  |
| ADKAR Blueprints and assessments (ADK) | 12 |  |  |  |  |
| Master Change Management Plan (PLN) | 10 |  |  |  |  |
| Sponsorship (SPN) | 6 |  |  |  |  |
| People managers (PMG) | 6 |  |  |  |  |
| Communications (COM) | 8 | 1 |  |  |  |
| Training (TRN) | 6 |  |  |  |  |
| Resistance management (RES) | 6 |  |  |  |  |
| Change agent network (CAN) | 5 |  |  |  |  |
| Measurement (MEA) | 6 |  |  |  |  |
| Sustainment and closeout (SUS) | 7 |  |  |  |  |
| Stakeholders (STK) | 48 | 2 |  |  | 1 |
| Artefacts (ART) | 27 | 3 |  |  |  |
| Reporting (RPT) | 6 |  |  |  |  |
| Portfolio (PRT) | 5 |  |  |  |  |
| Workflow (WFL) | 7 |  |  |  |  |
| Integration (INT) | 5 | 4 |  |  | 1 |
| Administration (ADM) | 9 | 1 |  |  |  |
| AI assistance (AIA) | 7 |  |  |  |  |
| Usability (USE) | 5 | 1 |  | 1 |  |
| Performance and capacity (PER) | 3 | 2 |  |  |  |
| Availability (AVL) | 1 |  | 3 |  |  |
| Security (SEC) | 7 |  | 3 | 1 |  |
| Privacy (PRV) | 6 |  |  | 1 |  |
| Records (REC) | 2 | 1 |  |  |  |
| Standards (STD) | 2 | 1 |  |  |  |
| Maintainability (MNT) | 2 |  | 1 | 2 |  |
| Deployment (DEP) |  |  | 2 |  |  |
| Business rules (RUL) | 20 |  |  |  |  |
| Acceptance criteria (AC) | 11 |  |  |  |  |
| Transition (TRA) | 1 |  |  | 6 |  |
| **All** | **308** | **17** | **9** | **11** | **2** |

## Where the application falls short

Requirements that are partly met or not built, with the reason. Deployment and organisational items are in their sections below.

| ID | Priority | Status | What is missing |
|---|---|---|---|
| RSK-009 | Should | Partly | Export to Excel and CSV, a project risk register reference on each risk, and the REST API and webhooks for synchronisation. No built-in connector to a particular project risk tool. |
| COM-007 | Should | Partly | Reach metrics (delivered, opened, viewed, attended) are recorded on each communication and can be written through the API. No live connector to particular email, intranet or collaboration platforms. |
| STK-028 | Should | Partly | Calendar invitations as .ics files with attendees, and Teams notifications through an incoming webhook. Creating Outlook or Teams meetings directly (Microsoft Graph) is not included. |
| STK-035 | Could | Not built | Drafts from forwarded emails or meeting invitations are not built (a Could). |
| STK-047 | Must | Partly | Spreadsheet import with mapping, validation and duplicate decisions, and scheduled synchronisation from an HR or directory export file (CMW_HR_SYNC_FILE). Direct connectors to Microsoft Entra ID or an HR system are not included. |
| ART-005 | Must | Partly | Native, editable text, tables and charts (AC-09 test). An uploaded PowerPoint template supplies the slide master and layout artwork (backgrounds, logos, bands), theme colours, fonts and title colours. Placeholder positions come from the workbench's own layouts rather than the template's. |
| ART-017 | Should | Partly | Publication to a configured folder (CMW_PUBLISH_DIR, for example a synchronised SharePoint library or records share) with metadata, recorded against the artefact. No direct SharePoint, Teams or records-system API. |
| ART-025 | Must | Partly | Word templates are authored in Word with a documented tag convention (starter template provided). PowerPoint templates supply the design (ART-005) but are not tagged; slide content follows the catalogue's deck structure. |
| INT-002 | Should | Partly | People and structure imported from a scheduled HR or directory export file, or a spreadsheet. No direct Workday, SuccessFactors or Entra ID connector. |
| INT-003 | Should | Partly | Calendar invitations (.ics) and Teams notifications by webhook. No Microsoft Graph integration for calendars, attendance or Teams meetings. |
| INT-004 | Should | Partly | Microsoft Project XML and CSV import and export; other tools through the REST API and webhooks. |
| INT-005 | Should | Partly | LMS completion exports imported from CSV, and the REST API. No direct LMS connector. |
| INT-006 | Could | Not built | Built-in surveys cover this need; no connector to Microsoft Forms or Qualtrics (a Could). |
| ADM-009 | Must | Partly | Integrations page with schedules, logs, API clients and webhooks (secrets are hashed and shown once). Deployment secrets (SSO, SMTP, AI keys) live in the hosting platform's secret store. |
| USE-02 | Must | Partly | Built to WCAG 2.2 AA practices. Checked with axe-core 4.10 across 55 views (screens, drawers, dialogs, administration and the survey page) in light and dark modes, with no violations of the WCAG 2.2 A and AA rules it tests. Automated checks cover only part of WCAG; a formal audit with assistive technology is still needed. |
| PER-01 | Must | Partly | Interactions measured within 2 s at the PER-04 data volumes (npm run test:perf). Load testing with concurrent users belongs to deployment testing. |
| PER-04 | Must | Partly | Tested with a 100,000-person master and a 2,000-stakeholder initiative. 200 initiatives, 500,000 engagements and 1,000 concurrent users have not been load tested, and the single-node SQLite store would need scaling for that concurrency. |
| REC-01 | Should | Partly | Approved artefacts and key records are kept as business records under retention rules and can be published to a records folder. No direct records-system integration. |
| STD-02 | Should | Partly | ISO 32000 PDF, tagged, with a PDF/A-2a option. PDF/UA conformance has not been formally validated. |

## Measured performance

`npm run test:perf` grows the demonstration data and times the operations the specification sets limits for (ART-018, PER-01 to PER-05). Results on the development container, in memory and on the server's SQLite storage:

| Check | Limit | Measured |
|---|---|---|
| Master Change Management Plan, Word and PDF, 1,250 stakeholders (161 pages) | 60 s | 27 s |
| Master Change Management Plan, Word and PDF, 2,000 stakeholders and 1,000 activities (240 pages) | 60 s | 8 s |
| Steering committee presentation | 30 s | under 1 s |
| Open an initiative with 2,000 stakeholders | 2 s | 0.4 s |
| Global search over 100,000 stakeholders (first search builds the index) | 2 s | 0.01 to 1.2 s |
| Stakeholder master register, first 5,000 of 100,000 | 2 s | 0.7 to 1.1 s |
| Search the master register / stakeholder picker | 2 s | 0.7 s / under 0.1 s |
| Open another initiative with a 100,000-person master | 2 s | 0.8 s |
| Survey results for 20,000 responses | 2 s | 0.1 s |

These are single-user timings at the specified data volumes; load testing with concurrent users belongs to deployment testing (PER-01, PER-04).

## Business objectives and requirements

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| BO-01 |  | Embed a consistent, ADKAR-aligned change approach across the project. | Done | The 3-Phase Process stage tracker, ADKAR Blueprints, assessments and ADKAR-tagged plans run through every module. |
| BO-02 |  | Maintain a complete, auditable record of stakeholder engagement. | Done | Engagement plans, the engagement log with locking and audit (RUL-08 to RUL-10) and the 360-degree stakeholder profile. |
| BO-03 |  | Reduce the effort required to produce change artefacts. | Done | Artefact engine: 24 catalogue artefacts generated from captured data in Word, PowerPoint, PDF, Excel and HTML. |
| BO-04 |  | Detect barrier points and resistance earlier. | Done | Barrier points (RUL-01, RUL-02), resistance escalation (RUL-12), sentiment trends and alerts. |
| BO-05 |  | Give sponsors and governance forums timely, evidence-based insight. | Done | Sponsor dashboard, steering committee pack, scheduled reports and the reporting feed. |
| BO-06 |  | Protect personal information and meet records obligations. | Done | Field-level security, sensitive-field exclusion, privacy requests, retention, legal holds and the audit trail. |
| BUS-01 |  | The application shall guide users through the Prosci 3-Phase Process and capture the inputs required at each stage. | Done | Initiative › Overview stage tracker (RUL-18) and the Phase 1, 2 and 3 screens; Phase 1 guided set-up. |
| BUS-02 |  | The application shall maintain detailed information about stakeholders, including their analysis, planned engagement and a complete history of how and when they have… | Done | Stakeholder master, initiative profiles, engagement plans and the engagement history (STK-001 to STK-051). |
| BUS-03 |  | The application shall automatically generate change management artefacts, including a Master Change Management Plan aligned to the ADKAR Model, in Word, PowerPoint and… | Done | Initiative › Artefacts: Word, PowerPoint and PDF, including the ADKAR-aligned Master Change Management Plan. |
| BUS-04 |  | The application shall measure and report progress through ADKAR, readiness, adoption and usage, and support corrective action. | Done | Initiative › ADKAR, Measurement and Dashboards; corrective action log. |
| BUS-05 |  | The application shall support multiple concurrent initiatives and provide a consolidated view of the change load on impacted groups. | Done | Portfolio: change heatmap, calendar, change load and saturation by group across initiatives. |
| BUS-06 |  | The application shall protect personal information and support compliance with privacy, security and records obligations. | Done | See SEC, PRV and REC below. |

## Use cases

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| UC-01 |  | Set up a change initiative and define success (Change management lead) | Done | Initiatives › New initiative › Guided set-up |
| UC-02 |  | Assess change impact for impacted groups (Change practitioner) | Done | Initiative › Change impact |
| UC-03 |  | Register and analyse stakeholders (Change practitioner) | Done | Stakeholders and the initiative register |
| UC-04 |  | Plan stakeholder engagement (Change practitioner) | Done | Initiative › Engagement › Engagement plan |
| UC-05 |  | Log a stakeholder engagement (Practitioner, sponsor, people manager or change agent) | Done | Initiative › Engagement (log, quick capture) |
| UC-06 |  | Run an ADKAR assessment and act on barrier points (Change practitioner) | Done | Initiative › ADKAR (assessments, campaigns, interventions) |
| UC-07 |  | Generate the Master Change Management Plan (Change management lead) | Done | Initiative › Artefacts › Master Change Management Plan |
| UC-08 |  | Produce a steering committee pack (Change management lead or PMO) | Done | Initiative › Artefacts › Steering Committee Pack |
| UC-09 |  | Transfer ownership and close out (Change management lead) | Done | Initiative › Sustainment and closeout |

## Initiative definition (INI)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| INI-001 | Must | The application shall allow authorised users to create a change initiative within a project or program, capturing name, identifier, description, parent project or… | Done | Initiatives › New initiative; Definition and success. |
| INI-002 | Must | The application shall capture the case for change: business drivers, the problem or opportunity, why the change is needed now, and the risks of not changing. | Done | Initiative › Definition and success › Case for change; guided set-up step 2. |
| INI-003 | Must | The application shall capture the definition of success: the reason for the change, project objectives and organisational benefits, with each objective linked to one or… | Done | Objectives with organisational benefits, linked to success measures. |
| INI-004 | Must | The application shall classify each success measure as organisational performance (benefits), individual performance (adoption, usage and proficiency) or change… | Done | Success measures classified as organisational, individual or change management performance. |
| INI-005 | Must | The application shall record the scope of the change, including what is changing, what is not changing, and any exclusions. | Done | Definition › Scope: what is changing, what is not, exclusions. |
| INI-006 | Must | The application shall record releases, waves, phases and key milestones (for example, design sign-off, user acceptance testing, go-live and hypercare exit), entered… | Done | Releases and milestones; import from Microsoft Project XML or CSV (shared/msproject.js). |
| INI-007 | Should | The application shall support a hierarchy of portfolio, program, project, initiative and release or wave. | Done | Portfolio, program and project containers above initiatives; releases and waves as milestones. |
| INI-008 | Should | The application shall allow an initiative to be created from a template or copied from an existing initiative, copying selected registers and configuration but excluding… | Done | New initiative › Copy an existing initiative, choosing the registers to copy; assessments of named people are optional. |
| INI-009 | Must | The application shall show the initiative's progress through each stage of the 3-Phase Process, based on configurable mandatory inputs and approvals for each stage… | Done | Overview › progress through the 3-Phase Process, from configurable stage checks (shared/rules/stages.js). |
| INI-010 | Should | The application shall provide a guided set-up wizard for Phase 1 inputs, with contextual help explaining the purpose of each input. | Done | Initiative › Guided set-up: nine Phase 1 steps, each explaining why it matters, ending with the draft strategy. |
| INI-011 | Must | The application shall capture what adoption and usage of the change look like in practice: the specific behaviours, process steps or system usage that show the change… | Done | Definition › What adoption and usage look like. |
| INI-012 | Should | The application shall record key decisions and assumptions with date, decision-maker, rationale and links to the records affected. | Done | Definition and success › Decisions and assumptions (date, decision-maker, rationale, linked records). |

## Change impact (IMP)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| IMP-001 | Must | The application shall maintain a register of impacted groups for each initiative, each defined by organisational unit, role, location, employment type or external… | Done | Initiative › Change impact › Impacted groups. |
| IMP-002 | Must | For each impacted group, the application shall support assessment against the 10 Aspects of Change Impact: processes, systems, tools, job roles, critical behaviours… | Done | Ten aspects of change impact (configurable list). |
| IMP-003 | Must | For each impacted group and aspect, the application shall capture the current state, the future state, a description of the change and the degree of impact on a… | Done | Current state, future state, description and degree of impact (0 to 5, configurable). |
| IMP-004 | Must | The application shall calculate an overall impact rating for each impacted group using a configurable method (default: highest aspect score) and flag high-impact groups… | Done | Overall rating by highest aspect or weighted average, with high-impact flag (RUL-20, shared/rules/impact.js). |
| IMP-005 | Must | The application shall record when each impact will be felt (by release, wave, milestone or date range) and the expected duration of the transition. | Done | When felt (release or milestone, or a date range) and expected transition in weeks. |
| IMP-006 | Should | The application shall link impacts to the project deliverables, processes or system components that cause them. | Done | Caused by: the deliverables, processes or system components behind each impact. |
| IMP-007 | Should | The application shall record the adoption challenge for each impacted group: the obstacles to adoption that are expected. | Done | Adoption challenge for each impacted group. |
| IMP-008 | Must | The application shall display an impact heatmap (impacted groups by aspect) and an impact timeline (impacted groups by period) that highlights concurrent impacts. | Done | Change impact › Heatmap and Timeline (concurrent impacts highlighted). |
| IMP-009 | Should | The application shall allow impacts to be captured at role or process level and rolled up to group level. | Done | Impacts captured at role or process level roll up to the group. |
| IMP-010 | Should | The application shall allow business representatives to review and confirm the impacts for their area, recording confirmation status, reviewer and date. | Done | Change impact › Business confirmation (status, reviewer and date). |
| IMP-011 | Must | For each impacted group, the application shall record 'what's in it for me' and anticipated concerns, for reuse in key messages, Blueprints and resistance planning. | Done | What's in it for me and anticipated concerns per group, reused in messages, Blueprints and artefacts. |
| IMP-012 | Must | The application shall import impacts from a structured spreadsheet template and export the impact register to Excel. | Done | Import from a spreadsheet template on the impact registers; export to Excel and CSV. |

## Risk and readiness (RSK)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| RSK-001 | Must | The application shall provide a configurable change characteristics assessment (for example, the scale and type of change, the number and variety of groups affected, the… | Done | Initiative › Risk and readiness › Change characteristics (organisation-authored, configurable questions). |
| RSK-002 | Must | The application shall provide a configurable organisational attributes assessment (for example, the perceived need for change, the legacy of past changes, current change… | Done | Organisational attributes assessment (configurable questions). |
| RSK-003 | Must | The application shall calculate a change risk profile (default: low, medium or high) from the two assessments using configurable thresholds and display the result on a… | Done | Change risk profile and risk grid with configurable thresholds (RUL-13). |
| RSK-004 | Must | The application shall provide a configurable PCT health assessment covering success, leadership/sponsorship, project management and change management, support a baseline… | Done | PCT health assessment with baseline and later rounds. |
| RSK-005 | Should | The application shall suggest areas of focus from low-scoring assessment items using a configurable rules library, for practitioner review and acceptance. | Done | Suggested focus areas from low-scoring items (configurable rules library), accepted by the practitioner. |
| RSK-006 | Must | The application shall provide configurable readiness assessments (for example, organisational readiness and go-live readiness checklists) with criteria, owners… | Done | Readiness checklists (organisational and go-live) with criteria, owners, evidence and go/no-go. |
| RSK-007 | Should | The application shall provide a sponsor assessment that captures the sponsor's commitment, capability, availability and competing priorities against the expectations of… | Done | Sponsor assessment. |
| RSK-008 | Must | The application shall maintain a register of change risks and issues (risks to adoption) with cause, consequence, likelihood, rating, treatment, owner and status, using… | Done | Change risks and issues register using the configurable risk matrix. |
| RSK-009 | Should | The application shall export change risks to, or synchronise them with, the project risk register. | Partly | Export to Excel and CSV, a project risk register reference on each risk, and the REST API and webhooks for synchronisation. No built-in connector to a particular project risk tool. |
| RSK-010 | Must | The application shall retain every assessment version with its date and assessor, for trend reporting. | Done | Every assessment version is kept with date and assessor; trends across rounds. |

## Change Management Strategy (STR)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| STR-001 | Must | The application shall consolidate Phase 1 inputs into a Change Management Strategy comprising: a summary of the change, the definition of success, the impact summary… | Done | Initiative › Strategy consolidates the Phase 1 inputs. |
| STR-002 | Must | The application shall capture the sponsorship model: the primary sponsor, sponsor coalition members and their areas, sponsorship gaps and the actions to address them. | Done | Sponsorship model: primary sponsor, coalition, gaps and actions. |
| STR-003 | Must | The application shall capture the change team structure: roles, people, allocation, reporting lines and responsibilities, including a RACI for key change deliverables. | Done | Change team, allocation, reporting lines and RACI. |
| STR-004 | Should | The application shall recommend a planning approach based on the risk profile (default: Blueprint-led for low risk; Blueprint plus Core plans for medium risk; Blueprint… | Done | Recommended planning approach by risk profile, with override rationale (RUL-14). |
| STR-005 | Must | The application shall record how change activities integrate with the project lifecycle (predictive phases, agile releases or iterations, or hybrid) and map change… | Done | Integration approach and change activities mapped to project phases, releases or iterations. |
| STR-006 | Must | The application shall support review and approval of the strategy by nominated approvers (default: primary sponsor and change management lead), recording comments… | Done | Strategy approval by nominated approvers with comments and decisions. |
| STR-007 | Must | The application shall generate the Change Management Strategy in Word and PDF, and a summary presentation in PowerPoint (Section 8). | Done | Change Management Strategy in Word and PDF, with a summary presentation in PowerPoint. |
| STR-008 | Should | The application shall capture the change management budget and resource estimates by activity category and period. | Done | Budget and resource estimates by category and period. |

## ADKAR Blueprints and assessments (ADK)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| ADK-001 | Must | The application shall allow users to create an ADKAR Blueprint for the organisation as a whole and additional Blueprints for impacted groups with distinct needs. | Done | Initiative › ADKAR › Blueprints for the organisation and impacted groups. |
| ADK-002 | Must | For each ADKAR element in a Blueprint, the application shall capture: the desired outcome for the group; observable indicators that the outcome has been achieved… | Done | Per element: desired outcome, indicators, barriers and root causes, actions, roles and dates. |
| ADK-003 | Must | The application shall allow Blueprint actions to be tagged to one or more plans (Sponsor, People Manager, Communications, Training, Resistance Management, Change Agent… | Done | Blueprint actions tagged to plans and created as plan activities. |
| ADK-004 | Must | The application shall support ADKAR assessments of individuals, teams and impacted groups, scoring each element from 1 to 5 with configurable descriptors and recording… | Done | ADKAR assessments of individuals, teams and groups (1 to 5, configurable descriptors). |
| ADK-005 | Must | The application shall automatically identify, and display prominently, the barrier point: the first element in ADKAR sequence scored at or below a configurable threshold… | Done | Barrier point shown prominently (RUL-01, shared/rules/adkar.js; AC-01 test). |
| ADK-006 | Must | The application shall support assessment by the change practitioner, by people managers for their teams, by self-assessment survey, and by inference from engagement… | Done | Method recorded: practitioner, people manager, self-assessment survey or inferred. |
| ADK-007 | Should | The application shall support assessment campaigns: select target groups, schedule distribution, issue survey links, send reminders, track response rates and close the… | Done | Campaigns: target groups, scheduled opening, link emailed on opening and with reminders (server with email), response rates, automatic closing. |
| ADK-008 | Must | The application shall support anonymous self-assessment and suppress results for any reporting segment with fewer respondents than a configurable minimum (default 5)… | Done | Anonymous self-assessment; segments under the minimum (default 5) suppressed (RUL-03; AC-02 test). Raw responses never reach the browser. |
| ADK-009 | Must | The application shall aggregate assessments to team and group level (mean, distribution and percentage of respondents at or below the threshold for each element) and… | Done | Aggregation to team and group (mean, distribution, percentage at or below threshold). |
| ADK-010 | Must | The application shall display ADKAR heatmaps (groups by element) and trends across assessment rounds (for example, baseline, pre-go-live, post-go-live and sustainment). | Done | ADKAR heatmap and trends across rounds. |
| ADK-011 | Should | The application shall suggest interventions for each barrier point from a configurable intervention library (default content in Appendix B), which users can accept into… | Done | Interventions suggested for each barrier point from the configurable library, accepted into the plan. |
| ADK-012 | Should | The application shall require practitioner confirmation of assessment results before they are included in approved artefacts. | Done | Practitioner confirmation before results appear in approved artefacts. |

## Master Change Management Plan (PLN)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| PLN-001 | Must | The application shall maintain one Master Change Management Plan per initiative, composed of the ADKAR Blueprint(s), the selected Core plans and any Extend plans. | Done | Initiative › Master plan: Blueprints, Core plans and Extend plans. |
| PLN-002 | Must | The application shall allow the change management lead to select the plans to include, record the rationale, and add custom plan types with configurable fields. | Done | Plan selection with rationale; custom plan types. |
| PLN-003 | Must | Each plan activity shall capture: identifier, title, description, plan, ADKAR element(s) targeted, target stakeholders and groups, owner, sender or deliverer, channel or… | Done | Activity fields: plan, ADKAR elements, audience, owner, deliverer, channel, dates or milestone-relative timing, dependencies, effort, cost and more. |
| PLN-004 | Must | The application shall display the integrated plan as a timeline aligned to project milestones, filterable by plan, impacted group, ADKAR element, owner and status. | Done | Integrated timeline against milestones, filterable by plan, group, ADKAR element, owner and status. |
| PLN-005 | Must | The application shall check plan coverage and warn when an impacted group has no activity addressing an ADKAR element; a high-impact group has no People Manager Plan… | Done | Coverage warnings (RUL-15; AC-11 test). |
| PLN-006 | Must | The application shall support baselining the plan, comparing the current plan with the baseline, and recording each change with a reason. | Done | Baseline, comparison with the baseline and a change log with reasons. |
| PLN-007 | Must | The application shall support review and approval of the plan and of each component plan, with version control. | Done | Plan and component approvals with versions. |
| PLN-008 | Should | The application shall import and export plan activities in Excel and Microsoft Project-compatible formats, and synchronise milestones with project scheduling tools… | Done | Import and export in Excel and Microsoft Project XML; milestone synchronisation through the REST API. |
| PLN-009 | Must | The application shall track activity status and show progress (planned versus completed) by plan, ADKAR element and impacted group. | Done | Planned versus completed by plan, ADKAR element and group. |
| PLN-010 | Must | The application shall generate the Master Change Management Plan artefact with the structure defined in Section 8.5. | Done | Master Change Management Plan artefact (Section 8.5 structure). |

## Sponsorship (SPN)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| SPN-001 | Must | The application shall maintain a Sponsor Plan of sponsor activities that demonstrate active and visible participation, building a coalition of support, and direct… | Done | Initiative › Sponsorship › Sponsor roadmap. |
| SPN-002 | Should | The application shall maintain a Sponsor Coalition Plan identifying coalition members, their areas of influence, current and desired levels of support, and actions for… | Done | Sponsor coalition with current and desired support and alignment actions. |
| SPN-003 | Must | The application shall generate sponsor briefing packs (PowerPoint) and talking points (Word) from current data, including key messages, readiness, barrier points, top… | Done | Sponsor briefing pack in PowerPoint and talking points in Word and PDF. |
| SPN-004 | Should | The application shall provide a sponsor dashboard summarising readiness, adoption, top risks and resistance, and upcoming sponsor activities. | Done | Initiative › Dashboards › Sponsor view. |
| SPN-005 | Should | The application shall allow sponsors or their delegates to confirm completion of sponsor activities and record observations through a simplified interface or an… | Done | Sponsors confirm completed activities and record observations. |
| SPN-006 | Must | The application shall report sponsor activity completion and highlight overdue sponsor commitments to the change management lead. | Done | Completion reporting and overdue sponsor commitments alerted to the change lead. |

## People managers (PMG)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| PMG-001 | Must | The application shall maintain a People Manager Plan describing how people managers will be engaged, prepared and supported to act as communicator, liaison, advocate… | Done | Initiative › People managers › People Manager Plan (CLARC roles). |
| PMG-002 | Must | The application shall identify the people managers of impacted employees from the reporting hierarchy and show each manager the impacts, key dates and actions relevant… | Done | Managers of impacted employees from the reporting hierarchy; manager dashboard and team-specific views. |
| PMG-003 | Should | The application shall track each people manager's own ADKAR status and readiness to lead their team through the change. | Done | Each manager's own ADKAR status and readiness to lead. |
| PMG-004 | Should | The application shall provide a manager toolkit area for each initiative (talking points, FAQs, team conversation guides, impact summaries and training schedules), with… | Done | Manager toolkit with versions and access records. |
| PMG-005 | Must | The application shall allow people managers to log team conversations, coaching sessions and feedback, and to complete team-level ADKAR assessments. | Done | Managers log team conversations, coaching and feedback, and complete team-level ADKAR assessments. |
| PMG-006 | Should | The application shall generate a manager briefing pack for each team (impacts, key dates, key messages, training requirements and FAQs) in Word, PDF and PowerPoint. | Done | Manager briefing pack per team in Word, PDF and PowerPoint (bulk generation available). |

## Communications (COM)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| COM-001 | Must | The application shall maintain a Communications Plan in which each item records: audience (stakeholders and groups), objective, ADKAR element(s), key messages, sender… | Done | Initiative › Communications plan items. |
| COM-002 | Must | The application shall maintain a key message library by audience and ADKAR element, with versioning and approval, reusable across communications, engagements, toolkits… | Done | Key message library with versions and approval; messages in other languages. |
| COM-003 | Should | The application shall propose senders using preferred-sender rules (RUL-11) and allow users to override the proposal. | Done | Preferred sender proposed (RUL-11), overridable. |
| COM-004 | Must | The application shall provide a communications calendar by audience that highlights clashes, blackout periods and overload. | Done | Communications calendar by audience with clashes, blackout periods and overload (RUL-07). |
| COM-005 | Must | The application shall support a configurable review and approval workflow for communication content (for example, author, communications adviser, change management lead… | Done | Configurable review and approval of communication content. |
| COM-006 | Must | The application shall maintain an FAQ library sourced from questions captured in engagements and feedback, with answer, owner, approval and publication status. | Done | FAQ library sourced from engagements and feedback, with owner, approval and publication. |
| COM-007 | Should | The application shall record distribution and reach metrics (for example, delivered, opened, viewed or attended) through integration with email, intranet and… | Partly | Reach metrics (delivered, opened, viewed, attended) are recorded on each communication and can be written through the API. No live connector to particular email, intranet or collaboration platforms. |
| COM-008 | Must | When a communication is sent, the application shall record it in the engagement history of each recipient stakeholder or group. | Done | Sending a communication records it in each recipient's engagement history. |
| COM-009 | Could | The application shall provide AI assistance to draft communication content from approved key messages and audience profiles, subject to the controls in Section 9.6. | Done | AI drafting from approved key messages and audience profiles, when AI is enabled (server with an Anthropic API key). |

## Training (TRN)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| TRN-001 | Must | The application shall support a training needs analysis by impacted group and role: knowledge and skills required, current capability, gap, learning objectives and… | Done | Initiative › Training › Needs analysis. |
| TRN-002 | Must | The application shall maintain training interventions with modality (instructor-led, virtual, eLearning, on-the-job, job aid, simulation or sandbox practice), duration… | Done | Interventions with modality, duration, prerequisites and audience. |
| TRN-003 | Must | The application shall record training sessions (date, location or link, trainer and capacity), enrolments, attendance and completion, entered directly or imported from… | Done | Sessions, enrolments, attendance and completion; import of LMS completion exports (CSV). |
| TRN-004 | Should | The application shall record proficiency evidence (for example, assessment results, observed task completion or supervisor sign-off) and post-training support (for… | Done | Proficiency evidence and post-training support. |
| TRN-005 | Must | The application shall report training completion and proficiency by group, role, manager and location against targets. | Done | Completion and proficiency by group, role, manager and location against targets. |
| TRN-006 | Should | The application shall include training for sponsors and people managers on their change roles in the Training Plan. | Done | Change-role training for sponsors and managers, with a completeness warning. |

## Resistance management (RES)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| RES-001 | Must | The application shall maintain a Resistance Management Plan covering anticipated sources and forms of resistance, root causes, prevention actions and the roles… | Done | Initiative › Resistance › Resistance Management Plan. |
| RES-002 | Must | The application shall maintain a register of observed resistance recording: source (individual or group), description, evidence, root cause, related ADKAR barrier point… | Done | Register of observed resistance with root cause, barrier point, severity, response and escalation. |
| RES-003 | Must | The application shall allow resistance items to be raised from engagement records, feedback, surveys or assessments, preserving the link to the source. | Done | Raised from engagements, feedback, surveys or assessments, keeping the link to the source. |
| RES-004 | Must | The application shall flag high-influence stakeholders who are resistant or opposed for priority attention and escalation (RUL-12). | Done | High-influence resistant stakeholders flagged and escalated (RUL-12). |
| RES-005 | Should | The application shall report resistance trends by group, root cause and ADKAR element over time. | Done | Trends by group, root cause and ADKAR element. |
| RES-006 | Must | The application shall treat resistance records about named individuals as sensitive, applying the access and artefact rules in STK-048 and RUL-17. | Done | Resistance about named people is sensitive (STK-048, RUL-17). |

## Change agent network (CAN)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| CAN-001 | Should | The application shall maintain a change agent register recording assigned groups and locations, role description, time commitment and manager endorsement. | Done | Initiative › Change agents register. |
| CAN-002 | Should | The application shall show change agent coverage (agents per impacted group, per location and per headcount) against configurable targets, highlighting gaps. | Done | Coverage per group, location and headcount against targets. |
| CAN-003 | Should | The application shall manage change agent network activities (briefings, meetings and tasks) and capture the feedback agents report, linked to groups and ADKAR elements. | Done | Network activities and agent feedback linked to groups and ADKAR elements. |
| CAN-004 | Should | The application shall give change agents role-appropriate access to log feedback and engagements for their assigned groups. | Done | Change agent role: feedback and engagements for assigned groups only. |
| CAN-005 | Could | The application shall record change agent activity levels and recognition. | Done | Activity levels and recognition. |

## Measurement (MEA)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| MEA-001 | Must | The application shall provide survey and pulse-check capability, or integrate with the organisation's survey tool, for ADKAR self-assessments, readiness, sentiment and… | Done | Built-in surveys and pulse checks (public link, anonymous by default, other languages). |
| MEA-002 | Must | The application shall capture feedback from any channel (engagements, surveys, change agents, a feedback mailbox or the service desk) with source, group, theme… | Done | Feedback from any channel with theme and sentiment. |
| MEA-003 | Must | The application shall track the adoption and usage measures defined under INI-004 (for example, speed of adoption, ultimate utilisation and proficiency) against targets… | Done | Adoption and usage measures against targets. |
| MEA-004 | Must | The application shall maintain a corrective action log linking performance gaps to actions, owners, due dates and resulting plan revisions. | Done | Corrective action log linked to gaps, owners and plan revisions. |
| MEA-005 | Should | The application shall calculate a readiness index for each group from configurable weighted inputs (for example, ADKAR scores, training completion, readiness criteria… | Done | Readiness index from configurable weighted inputs. |
| MEA-006 | Should | The application shall alert owners when a measure falls below its target or threshold. | Done | Owners alerted when a measure falls below its threshold (daily job). |

## Sustainment and closeout (SUS)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| SUS-001 | Must | The application shall support a performance review of the initiative against its success measures (organisational, individual and change management performance), with… | Done | Initiative › Sustainment and closeout › Performance review. |
| SUS-002 | Must | The application shall maintain a Sustainment Plan of reinforcement mechanisms (for example, recognition, measurement and reporting, alignment of performance objectives… | Done | Sustainment Plan of reinforcement mechanisms. |
| SUS-003 | Must | The application shall support transfer of ownership: nominating sustainment owners for each group and measure, managing a handover checklist, and recording acceptance… | Done | Sustainment owners, handover checklist and acceptance. |
| SUS-004 | Must | The application shall capture lessons learned (what worked, what did not, and recommendations) with categories, and make them searchable across initiatives. | Done | Lessons learned, searchable across initiatives (Lessons learned). |
| SUS-005 | Must | The application shall generate the Change Management Closeout (Word and PDF) and a closeout presentation (PowerPoint). | Done | Closeout in Word and PDF, and a closeout presentation. |
| SUS-006 | Should | The application shall allow sustainment owners to continue tracking post-closeout measures for a configurable period. | Done | Post-closeout tracking of measures for a configurable period. |
| SUS-007 | Must | The application shall make an initiative read-only on closure and retain it in accordance with retention rules. | Done | Closed initiatives are read-only and kept under the retention rules. |

## Stakeholders (STK)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| STK-001 | Must | The application shall maintain a stakeholder register containing individual stakeholders and stakeholder groups. | Done | Stakeholders (enterprise master of people and groups) and each initiative's register. |
| STK-002 | Must | For each individual stakeholder the application shall capture, at minimum: given name, family name, preferred name, position title, organisation, business unit or team… | Done | Individual stakeholder fields, including manager, employment type, source and status. |
| STK-003 | Must | The application shall allow a stakeholder to hold one or more change roles in each initiative, selected from a configurable list (default: primary sponsor, sponsor… | Done | Change roles per initiative from a configurable list. |
| STK-004 | Must | The application shall support stakeholder groups that are hierarchical (for example, division, branch and team) and either static (maintained manually) or dynamic… | Done | Hierarchical groups, static or rule-based (dynamic). |
| STK-005 | Should | The application shall allow an individual to belong to many groups and retain membership history with effective dates. | Done | Many groups per person, with effective dates. |
| STK-006 | Must | The application shall hold enterprise-level attributes (identity, position and contact details) once per stakeholder, and initiative-specific attributes (role, analysis… | Done | Enterprise attributes held once; initiative profiles hold role, analysis and plan. |
| STK-007 | Must | The application shall assign a relationship owner, and optionally a delegate, for each stakeholder in each initiative. | Done | Relationship owner and delegate per initiative. |
| STK-008 | Should | The application shall capture engagement preferences for each stakeholder: preferred channels, availability, language and any engagement adjustments the stakeholder has… | Done | Preferred channels, availability, language and engagement adjustments (sensitive, recorded with consent). |
| STK-009 | Must | The application shall capture each stakeholder's interests, concerns, expectations and priorities in relation to the change, and what is in it for them. | Done | Interests, concerns, expectations, priorities and what's in it for them. |
| STK-010 | Should | The application shall record relationships between stakeholders (reports to, influences, is influenced by, represents, works closely with) to support influence analysis. | Done | Relationships: reports to, influences, is influenced by, represents, works closely with. |
| STK-011 | Must | For each initiative, the application shall capture each stakeholder's influence and interest on configurable scales (default: low, medium, high) and derive their… | Done | Influence and interest on configurable scales; power/interest quadrant (RUL-04). |
| STK-012 | Must | The application shall capture each stakeholder's degree of impact, defaulting to the overall impact rating of their impacted group, with the ability to override it with… | Done | Degree of impact defaults from the group; override with a reason. |
| STK-013 | Must | The application shall capture current and desired engagement levels on a configurable scale (default: unaware, resistant, neutral, supportive, leading) and calculate the… | Done | Current and desired engagement levels; engagement gap (RUL-05). |
| STK-014 | Must | The application shall show each stakeholder's latest ADKAR assessment and current barrier point on their profile, with the assessment history (Section 6.5). | Done | Profile shows the latest ADKAR assessment, barrier point and history. |
| STK-015 | Should | The application shall calculate a stakeholder priority score from configurable weighted factors (for example, influence, impact, engagement gap, barrier point and role)… | Done | Priority score from configurable weights; override with justification. |
| STK-016 | Could | The application shall support optional salience analysis (power, legitimacy and urgency). | Done | Optional salience analysis (power, legitimacy, urgency). |
| STK-017 | Must | The application shall record the date and author of every analysis rating and retain the history, so that movement over time can be reported. | Done | Rating history with date and author. |
| STK-018 | Must | The application shall allow analysis to be performed at group level only, without ratings of named individuals, where the organisation's privacy settings require it. | Done | Group-level-only analysis setting (organisation and initiative). |
| STK-019 | Must | The application shall determine the required engagement cadence for each stakeholder from configurable rules (default: by power/interest quadrant, RUL-06). | Done | Required cadence from configurable rules (RUL-06). |
| STK-020 | Must | The application shall allow users to create an engagement plan for each stakeholder or stakeholder group, made up of one or more planned engagement items. | Done | Initiative › Engagement › Engagement plan. |
| STK-021 | Must | Each planned engagement item shall capture: objective; ADKAR element(s) targeted; engagement level (inform, consult, involve, collaborate or empower); engagement type… | Done | Planned item: objective, ADKAR elements, engagement level, type, channel, sender, timing, cadence and more. |
| STK-022 | Must | The application shall support recurring engagements defined by a cadence rule (for example, fortnightly until go-live), generating individual occurrences that can be… | Done | Recurring engagements generate occurrences that can be rescheduled individually. |
| STK-023 | Should | The application shall support milestone-relative scheduling (for example, ten business days before the Release 2 go-live), so that engagement dates move when milestone… | Done | Milestone-relative scheduling in business days (AC-04 test). |
| STK-024 | Should | The application shall propose a sender for each engagement using preferred-sender rules (RUL-11) and allow users to override the proposal. | Done | Preferred sender proposed (RUL-11), overridable. |
| STK-025 | Should | The application shall warn when planned engagements would exceed a configurable load for a stakeholder or group in a period, or fall within configured blackout periods… | Done | Load and blackout warnings (RUL-07). |
| STK-026 | Must | The application shall flag stakeholders whose engagement plan does not meet their required cadence (RUL-06). | Done | Stakeholders outside their cadence are flagged and owners told (AC-03 test). |
| STK-027 | Must | The application shall allow one planned engagement to target multiple stakeholders and groups (for example, a town hall), resolving the audience to individual members… | Done | One engagement for many stakeholders and groups; the audience resolves to members. |
| STK-028 | Should | The application shall create calendar invitations and online meetings (for example, in Microsoft Outlook and Teams) from planned engagements, subject to the user's… | Partly | Calendar invitations as .ics files with attendees, and Teams notifications through an incoming webhook. Creating Outlook or Teams meetings directly (Microsoft Graph) is not included. |
| STK-029 | Must | The application shall allow users to log an engagement while it happens or afterwards, either against a planned engagement item (so that planned and actual can be… | Done | Log against a planned item or as unplanned; live or afterwards. |
| STK-030 | Must | Each engagement record shall capture: actual date, start time and duration; engagement type and channel; location or meeting link; stakeholders and groups engaged… | Done | Engagement record fields, including concerns, sentiment, outcome and follow-up. |
| STK-031 | Must | The application shall record attendance for group engagements (invited, attended, apologies, no response), entered manually or imported from meeting platforms or sign-in… | Done | Attendance entered in the record or imported from a meeting attendance report or sign-in sheet (CSV). |
| STK-032 | Must | The application shall create tasks from actions agreed during an engagement, assign them to owners and track them to completion. | Done | Tasks from agreed actions, tracked in My work. |
| STK-033 | Must | The application shall allow a concern raised in an engagement to be converted into a resistance item, a change risk or issue, or an FAQ entry, preserving the link to the… | Done | A concern converts to a resistance item, a change risk or an FAQ, keeping the link. |
| STK-034 | Should | The application shall support quick capture of an engagement on a mobile device with minimum fields (stakeholder, date, type, summary and sentiment), flagging the record… | Done | Quick capture on a phone, flagged for completion; works offline and synchronises later. |
| STK-035 | Could | The application shall create draft engagement records from forwarded emails or meeting invitations (for example, through a dedicated mailbox or a Microsoft 365 add-in)… | Not built | Drafts from forwarded emails or meeting invitations are not built (a Could). |
| STK-036 | Must | The application shall manage engagement status (planned, scheduled, rescheduled, completed, locked, cancelled, did not proceed) in accordance with the lifecycle in… | Done | Engagement lifecycle statuses and allowed transitions. |
| STK-037 | Must | The application shall record who created and last changed each engagement record and when, and lock completed records after a configurable period, after which edits… | Done | Created and changed by and when; locking after a configurable period (RUL-10). |
| STK-038 | Must | The application shall record the observed sentiment of each stakeholder at each engagement and calculate a sentiment trend for each stakeholder and group. | Done | Observed sentiment per engagement; trends for people and groups. |
| STK-039 | Must | The application shall present a 360-degree stakeholder profile showing, in date order, all planned and completed engagements, communications received, training and… | Done | 360-degree stakeholder profile in date order. |
| STK-040 | Must | The application shall provide engagement calendar and timeline views across stakeholders and groups, filterable by initiative, group, owner, ADKAR element, engagement… | Done | Initiative › Engagement › Calendar and timeline, with filters. |
| STK-041 | Must | The application shall provide a power/interest grid, an engagement gap chart (current versus desired), a sentiment trend chart and an ADKAR heatmap by stakeholder group. | Done | Power/interest grid, engagement gap chart, sentiment trend and ADKAR heatmap. |
| STK-042 | Should | The application shall provide an influence network visualisation based on recorded stakeholder relationships. | Done | Influence network from recorded relationships. |
| STK-043 | Must | The application shall report engagement coverage: the proportion of stakeholders engaged within their required cadence; planned versus completed engagements by period… | Done | Engagement coverage reporting. |
| STK-044 | Must | The application shall generate alerts for: upcoming engagements (configurable lead time); overdue engagements and actions; stakeholders outside their required cadence… | Done | Alerts for upcoming and overdue engagements and actions, cadence, sentiment and more. |
| STK-045 | Should | The application shall generate a one-page stakeholder engagement brief for a selected stakeholder (profile, interests and concerns, analysis, recent engagements, open… | Done | Stakeholder Engagement Brief in Word or PDF (bulk for priority stakeholders). |
| STK-046 | Must | The application shall detect potential duplicate stakeholders when records are created or imported (for example, matching on email address, name and organisation) and… | Done | Duplicate detection on create and import (AC-06 test); duplicate review and merge. |
| STK-047 | Must | The application shall support bulk import of stakeholders and groups from spreadsheet templates, HR systems and directory services (for example, Microsoft Entra ID)… | Partly | Spreadsheet import with mapping, validation and duplicate decisions, and scheduled synchronisation from an HR or directory export file (CMW_HR_SYNC_FILE). Direct connectors to Microsoft Entra ID or an HR system are not included. |
| STK-048 | Must | The application shall allow designated fields (by default: engagement level, sentiment, individual ADKAR scores, priority score, resistance notes and private notes) to… | Done | Designated sensitive fields restricted by role (field-level security). |
| STK-049 | Should | The application shall synchronise enterprise attributes (name, position, manager, location and status) from the authoritative source on a configurable schedule, flag… | Done | Scheduled synchronisation from the authoritative export; leavers and movers flagged (RUL-19). |
| STK-050 | Must | The application shall support privacy obligations for stakeholder personal information, including recording the collection notice provided, responding to access and… | Done | Collection notices, access and correction requests, and de-identification (Audit and configuration › Privacy). |
| STK-051 | Must | The application shall export the stakeholder register, analysis and engagement log to Excel and CSV, applying field-level security. | Done | Excel and CSV export of registers, analysis and the engagement log, applying field-level security. |

## Artefacts (ART)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| ART-001 | Must | The application shall generate change management artefacts in Microsoft Word (.docx), Microsoft PowerPoint (.pptx) and PDF formats from information captured in the… | Done | Initiative › Artefacts: Word, PowerPoint and PDF (plus Excel and HTML). |
| ART-002 | Must | The application shall provide the standard artefact catalogue (Section 8.2) in the formats indicated. | Done | Catalogue of 24 artefacts in the Section 8.2 formats (shared/artefacts/catalogue.js). |
| ART-003 | Must | The application shall generate the Master Change Management Plan with the ADKAR-aligned structure defined in Section 8.5. | Done | Master Change Management Plan with the Section 8.5 structure. |
| ART-004 | Must | Generated Word documents shall use native Word styles for headings, lists, captions and tables; include an automatically generated table of contents; carry document… | Done | Native Word styles, contents field, document control, page numbers, headers and footers (AC-09 test). Contents page numbers are worked out for documents up to about 200 pages; Word fills them in beyond that. |
| ART-005 | Must | Generated PowerPoint presentations shall use the organisation's slide master and layouts, with native, editable text, tables and charts rather than images of text. | Partly | Native, editable text, tables and charts (AC-09 test). An uploaded PowerPoint template supplies the slide master and layout artwork (backgrounds, logos, bands), theme colours, fonts and title colours. Placeholder positions come from the workbench's own layouts rather than the template's. |
| ART-006 | Must | Generated PDF documents shall contain searchable text and bookmarks that match the document headings. | Done | Searchable text and bookmarks matching the headings. |
| ART-007 | Should | The application shall offer PDF/A-2 output for archiving and tagged PDF output for accessibility. | Done | Tagged PDF, with a PDF/A-2a option. |
| ART-008 | Must | The application shall embed charts and visuals in artefacts, including the impact heatmap, power/interest grid, engagement gap chart, ADKAR heatmap, integrated timeline… | Done | Impact heatmap, power/interest grid, gap chart, ADKAR heatmap, timeline and more, as native charts. |
| ART-009 | Must | Users shall be able to set generation parameters: initiative; scope (the whole initiative, or selected impacted groups, stakeholders, plans or date range); template… | Done | Parameters: scope (groups, stakeholders, plans, dates), template, formats, variant, sensitive inclusion. |
| ART-010 | Must | Before generating, the application shall check completeness against the template's requirements and list missing or out-of-date content (for example, no primary sponsor… | Done | Completeness check before generating, with placeholders if the user proceeds (AC-07 test). |
| ART-011 | Must | The application shall apply document control automatically: title, initiative, version number, status (draft, for review, approved), generation date and time, generated… | Done | Document control applied automatically (title, version, status, dates, author, snapshot, classification). |
| ART-012 | Must | The application shall store every generated artefact in an artefact library with its metadata, parameters, template version and a snapshot of the source data, so that it… | Done | Artefact library with metadata, parameters, template version and data snapshot; reproduction matches (AC-10 test). |
| ART-013 | Should | The application shall compare two versions of the same artefact and summarise the underlying data changes (for example, stakeholders added, activities changed or scores… | Done | Compare two versions and summarise the data changes. |
| ART-014 | Must | The application shall support review and approval of artefacts (submit, comment, approve or reject), mark the approved version, and prevent changes to approved versions. | Done | Submit, comment, approve or reject; approved versions cannot change. |
| ART-015 | Should | The application shall support scheduled generation (for example, a weekly status pack each Friday at 3 pm local time) and distribution to nominated recipients or… | Done | Scheduled generation at wall-clock times in the organisation's time zone, distributed to nominated recipients. |
| ART-016 | Should | The application shall support bulk generation (for example, one manager briefing pack per people manager, or one engagement brief per priority stakeholder), delivered as… | Done | Bulk generation as a ZIP (for example, one manager pack per manager). |
| ART-017 | Should | The application shall publish artefacts to configured repositories (for example, SharePoint, Teams or the organisation's records management system) with metadata, and… | Partly | Publication to a configured folder (CMW_PUBLISH_DIR, for example a synchronised SharePoint library or records share) with metadata, recorded against the artefact. No direct SharePoint, Teams or records-system API. |
| ART-018 | Must | The application shall generate a Master Change Management Plan of up to 150 pages (for an initiative with up to 2,000 stakeholders and 1,000 activities) within 60… | Done | Measured with npm run test:perf: a 161-page plan in 27 s and a 240-page plan in 8 s for 2,000 stakeholders and 1,000 activities; the presentation in under 1 s. |
| ART-019 | Must | Generated artefacts shall meet accessibility requirements: logical heading structure, alternative text for images and charts, header rows on tables, sufficient colour… | Done | Logical headings, alternative text for charts, table header rows, contrast and tagged PDF reading order. |
| ART-020 | Must | The application shall exclude sensitive fields from generated artefacts by default, show a handling caveat on any artefact that includes them, and record each inclusion… | Done | Sensitive fields excluded by default; handling caveat and audit when included (AC-08 test). |
| ART-021 | Must | The application shall allow narrative sections (for example, an executive summary or practitioner commentary) to be written in the application with rich-text editing and… | Done | Initiative › Artefacts › Narratives with rich text, placed into artefacts. |
| ART-022 | Must | Where AI assistance is enabled, generated artefacts shall identify any AI-drafted content that has not yet been reviewed and accepted by a user (Section 9.6). | Done | AI-drafted content is marked until a user accepts it. |
| ART-023 | Must | The application shall allow authorised administrators to create and maintain templates for each format using the organisation's branding: logos, colours, fonts, cover… | Done | Audit and configuration › Artefact templates: logos, colours, fonts, cover, headers, footers and classification marks. |
| ART-024 | Must | Templates shall support merge fields, repeating sections (for example, one section per impacted group), repeating table rows, conditional sections (for example, include… | Done | Merge fields, repeating sections and rows, and conditional sections in Word templates. |
| ART-025 | Must | Word and PowerPoint templates shall be authored in Microsoft Word and PowerPoint using a documented tagging convention (for example, content controls or placeholder… | Partly | Word templates are authored in Word with a documented tag convention (starter template provided). PowerPoint templates supply the design (ART-005) but are not tagged; slide content follows the catalogue's deck structure. |
| ART-026 | Must | The application shall version templates; support draft, test and published states; allow test generation with sample data; and record which template version produced… | Done | Template versions; draft, test and published states; test generation with sample data; version recorded per artefact. |
| ART-027 | Should | The application shall support template variants by audience and by business unit, and allow templates to be copied. | Done | Variants by audience and business unit; templates can be copied. |
| ART-028 | Should | The application shall validate templates on upload and report unknown merge fields and structural errors. | Done | Uploaded Word templates are validated for unknown merge fields and structure. |
| ART-029 | Must | The application shall provide a field catalogue describing every available merge field, its source and its format, for template authors. | Done | Field catalogue of every merge field, including custom fields. |
| ART-030 | Could | The application shall generate additional formats on request (for example, Excel workbooks for registers, or HTML for intranet publication). | Done | Excel workbooks for registers and HTML for intranet publication. |

## Reporting (RPT)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| RPT-001 | Must | The application shall provide role-based dashboards for change management leads, sponsors, project managers, people managers and portfolio change managers. | Done | Role-based dashboards: change lead, sponsor, project manager, people manager and portfolio. |
| RPT-002 | Must | Standard reports shall include at least: stakeholder engagement coverage; planned versus actual engagements; engagement gap; ADKAR heatmap and trends; impact heatmap and… | Done | Reports: 15 standard reports. |
| RPT-003 | Must | Users shall be able to filter reports, drill down from aggregate figures to the underlying records (subject to access rights), and export report data to Excel and CSV. | Done | Filter, drill down to records (with access rights) and export to Excel and CSV. |
| RPT-004 | Should | The application shall provide an ad hoc report builder for authorised users. | Done | Reports › Report builder. |
| RPT-005 | Should | The application shall expose reporting data to enterprise business intelligence tools (for example, Power BI) through a secure, read-only data feed or API that enforces… | Done | Read-only reporting feed over the REST API for BI tools, applying access rights. |
| RPT-006 | Should | The application shall allow dashboards and reports to be scheduled and distributed by email or to collaboration channels. | Done | Scheduled reports distributed by email or to Teams. |

## Portfolio (PRT)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| PRT-001 | Should | The application shall provide a consolidated view of all initiatives and their impacts on each impacted group over time (a change heatmap and calendar). | Done | Portfolio › Change heatmap and calendar across initiatives. |
| PRT-002 | Should | The application shall calculate the change load on each group for each period (for example, the number of initiatives, aggregate impact, and planned engagement and… | Done | Change load and saturation per group and period (configurable thresholds). |
| PRT-003 | Should | The application shall allow portfolio change managers to compare initiatives by risk profile, readiness and adoption. | Done | Compare initiatives by risk, readiness and adoption. |
| PRT-004 | Should | The application shall identify stakeholders engaged by several initiatives and show their combined engagement load. | Done | Stakeholders engaged by several initiatives and their combined load. |
| PRT-005 | Should | The application shall support enterprise reuse of the stakeholder master, key message libraries, templates, the intervention library and lessons learned across… | Done | Shared stakeholder master, enterprise key messages, templates, intervention library and lessons. |

## Workflow (WFL)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| WFL-001 | Must | The application shall provide configurable approval workflows for the strategy, plans, communications and artefacts. | Done | Configurable approvals for the strategy, plans, communications and artefacts. |
| WFL-002 | Must | The application shall provide task management: create, assign, prioritise and track tasks linked to any record, with a personal 'my tasks' view. | Done | Tasks linked to any record; My work. |
| WFL-003 | Must | The application shall notify users in the application and by email (and optionally through Microsoft Teams) of assignments, approvals, due and overdue items and alerts… | Done | In-app, email (SMTP) and Teams notifications, with personal preferences. |
| WFL-004 | Should | The application shall support comments and @mentions on records, with notifications. | Done | Comments and @mentions with notifications. |
| WFL-005 | Must | The application shall support file attachments on records, with malware scanning, file type restrictions and size limits. | Done | Attachments with allowed types, size limits, built-in checks and the organisation's scanner (CMW_SCAN_COMMAND). |
| WFL-006 | Must | The application shall provide global search across all records the user is authorised to view. | Done | Global search (Ctrl K) over records the user may see. |
| WFL-007 | Must | The application shall prevent lost updates when two users edit the same record (for example, through optimistic concurrency control with a clear conflict message). | Done | Optimistic concurrency with a clear conflict message. |

## Integration (INT)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| INT-001 | Must | The application shall support single sign-on through the organisation's identity provider using SAML 2.0 or OpenID Connect (for example, Microsoft Entra ID). | Done | Single sign-on with OpenID Connect (for example Microsoft Entra ID), with role mapping. SAML is not included; the requirement allows either. |
| INT-002 | Should | The application shall import organisational structure and people data from the HR system of record or directory (for example, Workday, SAP SuccessFactors or Microsoft… | Partly | People and structure imported from a scheduled HR or directory export file, or a spreadsheet. No direct Workday, SuccessFactors or Entra ID connector. |
| INT-003 | Should | The application shall integrate with Microsoft 365: Outlook calendars (create invitations and, where permitted, read attendance), Teams (online meetings and… | Partly | Calendar invitations (.ics) and Teams notifications by webhook. No Microsoft Graph integration for calendars, attendance or Teams meetings. |
| INT-004 | Should | The application shall integrate with project and work management tools (for example, Microsoft Project, Jira, Azure DevOps or Smartsheet) to synchronise releases and… | Partly | Microsoft Project XML and CSV import and export; other tools through the REST API and webhooks. |
| INT-005 | Should | The application shall integrate with the learning management system to import courses, enrolments, completions and assessment results. | Partly | LMS completion exports imported from CSV, and the REST API. No direct LMS connector. |
| INT-006 | Could | The application shall integrate with the organisation's survey tool (for example, Microsoft Forms or Qualtrics) where built-in surveys are not used. | Not built | Built-in surveys cover this need; no connector to Microsoft Forms or Qualtrics (a Could). |
| INT-007 | Must | The application shall provide a documented, versioned REST API (OpenAPI 3) for reading and writing core entities, secured with OAuth 2.0, rate-limited and audited. | Done | REST API documented in OpenAPI 3 (/api/v1/openapi.json), OAuth 2.0 client credentials, rate limited and audited. |
| INT-008 | Could | The application shall publish events for key changes (for example, engagement completed, barrier point changed or plan approved) through webhooks. | Done | Signed webhooks for key events. |
| INT-009 | Must | The application shall provide spreadsheet import templates, with validation and error reporting, for all major registers. | Done | Spreadsheet import with templates, validation and error reporting on the stakeholder master and every initiative register, plan activities and the engagement log. |
| INT-010 | Must | The application shall export all of an initiative's data in an open, documented format (for example, JSON and CSV) to support portability and exit. | Done | Export of all of an initiative's data as JSON and CSV. |

## Administration (ADM)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| ADM-001 | Must | Administrators shall be able to configure reference data without code changes, including impact aspects and scales, engagement levels, the sentiment scale, stakeholder… | Done | Audit and configuration › Lists and terminology, and Settings. |
| ADM-002 | Must | Administrators shall be able to add custom fields to core entities, defining type, validation, whether mandatory, visibility, sensitivity and availability as a template… | Done | Custom fields with type, validation, mandatory, visibility, sensitivity and merge-field availability. |
| ADM-003 | Should | Administrators shall be able to configure terminology (field and screen labels) to match organisational language, including the use of licensed Prosci terms where… | Done | Terminology for field and screen labels. |
| ADM-004 | Must | Administrators shall manage users, roles, groups and initiative-level permissions, including field-level security for sensitive fields. | Done | Users and roles, initiative access and field-level security. |
| ADM-005 | Must | Administrators shall configure workflows, notification rules, cadence rules, alert thresholds and saturation thresholds. | Done | Workflows, notifications, cadence rules, alert and saturation thresholds. |
| ADM-006 | Must | Administrators shall configure retention, archiving and de-identification rules for each entity type. | Done | Retention, archiving and de-identification rules by entity, with a disposal record. |
| ADM-007 | Must | Administrators shall configure security classification labels and default markings for artefacts. | Done | Security classification labels and default markings. |
| ADM-008 | Must | Administrators shall maintain the intervention library, assessment question sets and readiness checklists. | Done | Intervention library, question sets and readiness checklists. |
| ADM-009 | Must | Administrators shall manage integrations, including schedules, logs and credentials held in a secure vault. | Partly | Integrations page with schedules, logs, API clients and webhooks (secrets are hashed and shown once). Deployment secrets (SSO, SMTP, AI keys) live in the hosting platform's secret store. |
| ADM-010 | Should | The application shall audit configuration changes and support promotion of configuration between environments through export and import. | Done | Configuration changes audited; export and import of configuration and templates between environments. |

## AI assistance (AIA)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| AIA-001 | Could | Where enabled, the application shall provide AI assistance to draft narrative content (for example, executive summaries, key messages, FAQs and engagement summaries)… | Done | AI drafting of narratives, key messages, FAQs and engagement summaries (server with an Anthropic API key). |
| AIA-002 | Could | Where enabled, the application shall summarise engagement notes and suggest themes, concerns and ADKAR elements for the user to confirm. | Done | Summaries of engagement notes with suggested themes, concerns and ADKAR elements to confirm. |
| AIA-003 | Could | Where enabled, the application shall suggest interventions for barrier points and draft plan activities for the user to accept or reject. | Done | Suggested interventions and draft activities to accept or reject. |
| AIA-004 | Must | AI features shall be advisory only: AI-generated content shall be reviewed and accepted by a user before it is saved as a record or included in an approved artefact, and… | Done | AI output is advisory; it must be accepted before it is saved or appears unmarked in an approved artefact. |
| AIA-005 | Must | AI features shall not make or automate decisions about individual stakeholders, shall not infer personal characteristics, and shall exclude sensitive fields from AI… | Done | No decisions about individuals; sensitive fields are never sent. |
| AIA-006 | Must | AI processing shall use services approved by the organisation, keep data within approved jurisdictions, not use the organisation's data to train models, and log prompts… | Done | AI log of prompts and outputs; inference region set with CLAUDE_INFERENCE_GEO; data use governed by the organisation's agreement with the provider. |
| AIA-007 | Must | Administrators shall be able to enable or disable AI features for the tenant, for individual initiatives and for individual features. | Done | AI on or off for the tenant, each initiative and each feature. |

## Usability (USE)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| USE-01 | Must | The application shall be web-based and responsive, supporting current versions of Microsoft Edge, Google Chrome, Apple Safari and Mozilla Firefox on desktop and tablet… | Done | Responsive web application; capture, survey and approval screens checked at phone width. Verified in Chromium; confirm Edge, Safari and Firefox in testing. |
| USE-02 | Must | All user interfaces, surveys and forms shall conform to WCAG 2.2 Level AA. | Partly | Built to WCAG 2.2 AA practices. Checked with axe-core 4.10 across 55 views (screens, drawers, dialogs, administration and the survey page) in light and dark modes, with no violations of the WCAG 2.2 A and AA rules it tests. Automated checks cover only part of WCAG; a formal audit with assistive technology is still needed. |
| USE-03 | Should | The application shall provide contextual help explaining methodology concepts (for example, barrier point, ADKAR Blueprint and CLARC) where they are used. | Done | Contextual help on methodology terms and a glossary (Help and glossary). |
| USE-04 | Should | A trained change practitioner shall be able to set up an initiative and generate a draft Change Management Strategy within two hours of completing role-based training. | Organisational | Supported by the guided set-up and draft strategy; to be measured in the pilot (TRA-02). |
| USE-05 | Should | Grid views shall support inline editing, bulk editing, saved views and keyboard navigation. | Done | Inline editing, bulk editing, saved views and keyboard navigation in grids. |
| USE-06 | Must | The application shall default to Australian English and the DD/MM/YYYY date format, and display dates and times in each user's time zone. | Done | Australian English, DD/MM/YYYY, and each user's time zone. |
| USE-07 | Should | The application shall support additional languages for survey and communication content. | Done | Surveys in other languages (respondents choose); communications and key messages carry content in other languages. |

## Performance and capacity (PER)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| PER-01 | Must | 95% of page loads and user interactions shall complete within 2 seconds, and 99% within 4 seconds, under expected peak load. | Partly | Interactions measured within 2 s at the PER-04 data volumes (npm run test:perf). Load testing with concurrent users belongs to deployment testing. |
| PER-02 | Should | Searches shall return results within 2 seconds for registers of up to 100,000 stakeholder records. | Done | Searches measured well under 2 s over 100,000 stakeholders (global search, master register and pickers). |
| PER-03 | Must | Artefact generation shall meet the times specified in ART-018. | Done | See ART-018. |
| PER-04 | Must | The application shall support at least 200 concurrent initiatives, 100,000 stakeholder records, 500,000 engagement records and 1,000 concurrent users without breaching… | Partly | Tested with a 100,000-person master and a 2,000-stakeholder initiative. 200 initiatives, 500,000 engagements and 1,000 concurrent users have not been load tested, and the single-node SQLite store would need scaling for that concurrency. |
| PER-05 | Should | The survey capability shall support at least 20,000 responses per campaign. | Done | Results for a 20,000-response campaign measured at about 0.1 s. |

## Availability (AVL)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| AVL-01 | Must | The application shall be available 99.5% of the time each month, excluding scheduled maintenance performed outside 7 am to 7 pm on local business days with at least five… | Deployment | Hosting and operations. |
| AVL-02 | Must | The recovery point objective shall be no more than one hour and the recovery time objective no more than four hours. | Deployment | Hosting and operations; the database is a single SQLite file (plus WAL) suited to frequent backups. |
| AVL-03 | Must | Backups shall be encrypted, retained for at least 35 days and restore-tested at least quarterly. | Deployment | Hosting and operations; data at rest can be encrypted with a customer-managed key. |
| AVL-04 | Could | Mobile quick capture shall work with intermittent connectivity and synchronise when connectivity returns. | Done | Quick capture keeps an outbox while offline and sends it when the connection returns. |

## Security (SEC)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| SEC-01 | Must | Users shall authenticate through single sign-on, with multi-factor authentication enforced by the identity provider; local accounts shall be limited to break-glass… | Done | Single sign-on (MFA enforced by the identity provider); local accounts only for break-glass administration. |
| SEC-02 | Must | Access shall be controlled by role, by record (initiative and group) and by field, applying least privilege. | Done | Role, record (initiative, group, team, assignment) and field-level access (shared/access.js). |
| SEC-03 | Must | Data shall be encrypted in transit using TLS 1.2 or higher (TLS 1.3 preferred) and at rest using AES-256, with keys managed in a hardware-backed key management service. | Deployment | AES-256-GCM encryption at rest with a 256-bit key (CMW_DATA_KEY); TLS is provided by the hosting reverse proxy; hardware-backed key management at deployment. |
| SEC-04 | Should | The application shall support customer-managed encryption keys. | Done | Customer-managed encryption key (CMW_DATA_KEY). |
| SEC-05 | Must | The application shall log authentication events, access to sensitive fields, record creation, change and deletion, exports, artefact generation and configuration… | Done | Tamper-evident audit trail of sign-ins, sensitive access, changes, exports, generation and configuration. |
| SEC-06 | Must | Development shall follow secure development practices aligned with the OWASP Application Security Verification Standard (ASVS) Level 2. Independent penetration testing… | Organisational | Secure development and penetration testing are organisational; the application includes CSRF defence, rate limits and least-privilege access. |
| SEC-07 | Must | For Australian Government deployments, hosting and controls shall align with the Information Security Manual at the required classification, the service shall hold a… | Deployment | Hosting and assessment (ISM, IRAP); artefacts carry PSPF classification marks. |
| SEC-08 | Must | The organisation's data, backups and logs shall be stored and processed in Australia unless otherwise approved by the organisation. | Deployment | Hosting choice; the application stores everything in its own database, and AI inference can be kept in-region. |
| SEC-09 | Must | Sessions shall time out after a configurable period of inactivity (default 30 minutes). | Done | Configurable inactivity timeout (default 30 minutes). |
| SEC-10 | Must | Uploaded files shall be scanned for malware and restricted to an allowed list of file types. | Done | Allowed file types, built-in checks and the organisation's scanner (CMW_SCAN_COMMAND); refused if the scanner cannot run. |
| SEC-11 | Should | Exports and bulk downloads shall be restricted by role and logged; exported artefacts shall optionally carry a watermark identifying the user and time. | Done | Exports restricted by role and logged; optional watermark with user and time. |

## Privacy (PRV)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| PRV-01 | Must | A privacy impact assessment shall be completed, and its recommendations addressed, before go-live. | Organisational | A privacy impact assessment by the organisation before go-live. |
| PRV-02 | Must | The application shall support collection notices, including displaying them on surveys and recording which notice applied to each stakeholder. | Done | Collection notices shown on surveys (and translatable), and recorded for each stakeholder. |
| PRV-03 | Must | The application shall support data minimisation, including a setting that disables ratings of named individuals (STK-018). | Done | Data minimisation, including disabling ratings of named individuals. |
| PRV-04 | Must | The application shall not be configured to collect sensitive information as defined in the Privacy Act 1988 (for example, health information or union membership) unless… | Done | Sensitive information is not collected by the default configuration; privacy reminders on free-text fields. |
| PRV-05 | Must | The application shall allow authorised users to find all personal information held about an individual across initiatives, export it and correct it, in order to respond… | Done | Find, export and correct all personal information about a person across initiatives. |
| PRV-06 | Must | The application shall apply configured retention, de-identification and secure deletion rules to personal information. | Done | Retention, de-identification and deletion rules applied, with a disposal record. |
| PRV-07 | Must | The application shall provide the logs and reports needed to assess and respond to a suspected data breach, including under the Notifiable Data Breaches scheme. | Done | Audit trail search and export (SIEM), sensitive-access log and disposal record for breach assessment. |

## Records (REC)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| REC-01 | Should | Approved artefacts and key records shall be managed as business records and retained in accordance with the applicable records authority, with integration to the records… | Partly | Approved artefacts and key records are kept as business records under retention rules and can be published to a records folder. No direct records-system integration. |
| REC-02 | Should | The application shall support legal holds that suspend the disposal of specified records. | Done | Legal holds suspend disposal. |
| REC-03 | Must | The application shall retain the full version history of approved strategies, plans and artefacts. | Done | Full version history of approved strategies, plans and artefacts. |

## Standards (STD)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| STD-01 | Must | Word and PowerPoint outputs shall conform to ISO/IEC 29500 (Office Open XML) and open without repair in current Microsoft 365 desktop, web and mobile applications. | Done | Office Open XML output, validated with open-source readers and LibreOffice. Confirm that files open without repair in Microsoft 365 during template testing (TRA-04). |
| STD-02 | Should | PDF outputs shall conform to ISO 32000, with PDF/A-2 (ISO 19005-2) and PDF/UA (ISO 14289) options (ART-007). | Partly | ISO 32000 PDF, tagged, with a PDF/A-2a option. PDF/UA conformance has not been formally validated. |
| STD-03 | Must | APIs shall use JSON over HTTPS, be documented in OpenAPI 3 and be versioned, with at least six months' notice of deprecation. | Done | JSON over HTTPS, OpenAPI 3, versioned under /api/v1. Deprecation notice is an operational commitment. |

## Maintainability (MNT)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| MNT-01 | Must | The application shall favour configuration over customisation, so that product upgrades do not break configuration or templates. | Done | Lists, fields, rules, thresholds, terminology and templates are configuration, kept separate from the code. |
| MNT-02 | Must | Separate development, test, training and production environments shall be available, with controlled promotion of configuration and templates. | Deployment | Environments are a deployment matter; configuration and templates promote by export and import (ADM-010). |
| MNT-03 | Must | The application shall provide health monitoring, alerting and error logging for the operations team. | Done | Health endpoint (/api/health), structured JSON logs and the System page. |
| MNT-04 | Should | Changes affecting users or templates shall be notified at least two weeks in advance, with release notes. | Organisational | Release management. |
| MNT-05 | Should | Support shall be available at least during Australian business hours, with a response time of one hour for priority 1 incidents. | Organisational | Support arrangements. |

## Deployment (DEP)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| DEP-01 | Must | The application shall be deployable as a cloud service in Australian regions, either as multi-tenant software as a service or as a single-tenant deployment, and shall… | Deployment | A single-tenant Node.js service with SQLite, deployable in an Australian cloud region. Multi-tenant SaaS and horizontal scaling would need a shared database, which is not included. |
| DEP-02 | Must | Where delivered as multi-tenant software as a service, each tenant's data shall be logically isolated and the isolation independently tested. | Deployment | A separate deployment and database for each tenant isolates their data. |

## Business rules (RUL)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| RUL-01 |  | Barrier point (individual). Scores are recorded from 1 to 5 for Awareness, Desire, Knowledge, Ability and Reinforcement. The barrier point is the first element, in that… | Done | shared/rules/adkar.js; AC-01 test |
| RUL-02 |  | Barrier point (group). For each element, the group score is the mean of individual scores (configurable: median). The group barrier point is the first element where the… | Done | shared/rules/adkar.js (mean or median) |
| RUL-03 |  | Anonymity threshold. Survey-based results are not displayed or exported for any segment with fewer respondents than the minimum (default 5); they contribute only to… | Done | shared/rules/adkar.js; AC-02 test; raw responses stay on the server |
| RUL-04 |  | Power/interest quadrant. High influence and high interest: manage closely. High influence and medium or low interest: keep satisfied. Medium or low influence and high… | Done | shared/rules/stakeholders.js |
| RUL-05 |  | Engagement gap. The gap is the number of levels between the current and desired engagement levels on the engagement scale. A gap of two or more levels, or a current… | Done | shared/rules/stakeholders.js |
| RUL-06 |  | Required cadence. Maximum interval between completed engagements: manage closely, 14 days; keep satisfied, 30 days; keep informed, 30 days; monitor, 90 days. A… | Done | shared/rules/stakeholders.js; daily job; AC-03 test |
| RUL-07 |  | Engagement load. A warning is shown when a stakeholder would have more than three planned engagements in any seven-day period, when a group would receive more than five… | Done | shared/rules/engagements.js, shared/rules/alerts.js |
| RUL-08 |  | Completion. An engagement can be set to completed only when its actual date, type, at least one stakeholder or group, a discussion summary and an outcome rating are… | Done | shared/rules/engagements.js and the engagement hook; AC-05 test |
| RUL-09 |  | Cancellation and rescheduling. A reason is mandatory, and the original date is retained in the record history. | Done | Engagement hook: reason required, original date kept |
| RUL-10 |  | Locking. Completed engagement records lock after a configurable period (default ten business days). Later edits require a reason and are written to the audit log. | Done | Daily job locks after the configured business days; later edits need a reason |
| RUL-11 |  | Preferred sender. Messages about the business reasons for the change default to the primary sponsor or a senior leader; messages about personal or role impacts default… | Done | shared/rules/engagements.js (proposeSender) |
| RUL-12 |  | Escalation of resistance. A high-influence stakeholder whose current engagement level is 'resistant', or whose observed sentiment is negative in two consecutive… | Done | shared/rules/stakeholders.js, alerts |
| RUL-13 |  | Change risk profile. Both assessments are scored so that a higher score means greater risk, and normalised to a 0–100 scale. Both scores below 40: low risk. Both scores… | Done | shared/rules/risk.js |
| RUL-14 |  | Planning approach. Recommendation by risk profile: low, ADKAR Blueprint (with a Communications Plan as needed); medium, Blueprint plus Core plans; high, Blueprint plus… | Done | shared/rules/risk.js, Strategy |
| RUL-15 |  | Plan coverage. Coverage warnings (PLN-005) are evaluated whenever a plan, assessment or impact changes, and before the Master Change Management Plan is submitted for… | Done | shared/rules/plan.js; AC-11 test |
| RUL-16 |  | Artefact versioning. Draft generations are numbered 0.1, 0.2 and so on. Approval sets the next major version (1.0, 2.0). Regenerating after approval creates the next… | Done | Artefact versioning in the artefact operations |
| RUL-17 |  | Sensitive content. Fields classified as sensitive are excluded from artefacts by default. Only users with the required permission can include them; inclusion adds a… | Done | shared/access.js and the artefact snapshot; AC-08 test |
| RUL-18 |  | Stage completion. A stage of the 3-Phase Process is shown as complete when all mandatory inputs configured for the stage are captured and any required approvals are… | Done | shared/rules/stages.js |
| RUL-19 |  | Leavers and movers. When a stakeholder is marked as having left, their future engagements are flagged for cancellation or reassignment. When a user leaves, their… | Done | Stakeholder and user leaver operations |
| RUL-20 |  | Impact roll-up. The overall impact for a group is its highest aspect score (configurable: weighted average). A group with an overall impact of 4 or more is flagged as… | Done | shared/rules/impact.js |

## Acceptance criteria (AC)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| AC-01 |  | Given an individual assessment with Awareness 4, Desire 3, Knowledge 2, Ability 2 and Reinforcement 1, and a threshold of 3, when the assessment is saved, then the… | Done | Verified by test/rules.test.mjs. |
| AC-02 |  | Given a team with four survey responses and a minimum segment size of 5, when a user views or exports the team's results, then the results are suppressed with an… | Done | Verified by test/rules.test.mjs. |
| AC-03 |  | Given a 'manage closely' stakeholder whose last completed engagement was 15 days ago and a required cadence of 14 days, when the daily cadence check runs, then the… | Done | Verified by test/rules.test.mjs. |
| AC-04 |  | Given an engagement scheduled ten business days before a go-live milestone of 01/03/2027 (that is, on 15/02/2027), when the go-live moves to 15/03/2027, then the… | Done | Verified by test/rules.test.mjs, test/service.test.mjs. |
| AC-05 |  | Given a scheduled engagement, when a user logs it with the actual date, type, participants, summary and outcome rating, then its status becomes completed, it appears in… | Done | Verified by test/rules.test.mjs, test/service.test.mjs. |
| AC-06 |  | Given an existing stakeholder with the email address jane.citizen@example.gov.au, when a user imports a record with the same email address, then the import report flags… | Done | Verified by test/rules.test.mjs, test/service.test.mjs. |
| AC-07 |  | Given an initiative with no primary sponsor recorded, when a user generates the Change Management Strategy, then the completeness check lists 'Primary sponsor not… | Done | Verified by test/service.test.mjs. |
| AC-08 |  | Given individual ADKAR scores classified as sensitive and a user without permission to include sensitive fields, when the user generates the Master Change Management… | Done | Verified by test/service.test.mjs. |
| AC-09 |  | Given a generated Master Change Management Plan and Steering Committee Pack, when they are opened in current Microsoft 365 desktop applications, then they open without… | Done | Verified by test/service.test.mjs. |
| AC-10 |  | Given an approved artefact, when a user regenerates it from its stored data snapshot and template version, then the content of the regenerated artefact matches the… | Done | Verified by test/service.test.mjs. |
| AC-11 |  | Given an impacted group whose barrier point is Knowledge and no open plan activity for that group tagged to Knowledge, when the plan coverage check runs, then a coverage… | Done | Verified by test/rules.test.mjs. |

## Transition (TRA)

| ID | Priority | Requirement | Status | How it is met |
|---|---|---|---|---|
| TRA-01 | Must | Existing stakeholder registers, engagement logs, impact assessments and plans held in spreadsheets shall be migrated using import templates, with field mapping… | Done | Import templates with field mapping, validation and error reports for stakeholders, groups, impacts, risks, plans, engagement logs and the other registers. |
| TRA-02 | Must | The application shall be piloted on one initiative before wider rollout, with success criteria agreed in advance. | Organisational | Pilot on one initiative. |
| TRA-03 | Must | Role-based training shall be provided for practitioners (about one day), people managers and change agents (about 30 minutes), sponsors (a short briefing) and… | Organisational | Role-based training; the Help and glossary and the guided set-up support it. |
| TRA-04 | Must | Existing corporate Word and PowerPoint templates shall be adapted to the template tagging convention and tested with representative data before go-live. | Organisational | Adapt corporate templates using the starter template and the tag convention (Artefact templates). |
| TRA-05 | Should | During the pilot, generated artefacts shall be compared with manually produced equivalents to confirm completeness and quality. | Organisational | Compare generated artefacts with manual equivalents during the pilot. |
| TRA-06 | Should | A hypercare period of at least four weeks shall follow each rollout wave, with defined support and issue triage. | Organisational | Hypercare after each wave. |
| TRA-07 | Should | The rollout of the application shall itself be managed using the ADKAR Model, with a lightweight Blueprint and sponsor and people manager actions. | Organisational | The rollout can itself be run as an initiative in the workbench. |
