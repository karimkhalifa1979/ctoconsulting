// Builds shared/traceability.js: for each requirement, where it is implemented and its status.
// Evidence comes from the requirement IDs cited in the source next to the code that implements
// them; the reviewed statuses below record what is partial, delivered by hosting and operations,
// a rollout activity, or not started. Run with: npm run traceability
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQS = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'requirements.json'), 'utf8'));
const OUT = path.join(root, 'shared', 'traceability.js');

// Where a cited file lives, in terms a reader of the application recognises.
const PLACES = [
  [/src\/pages\/project\/Status/, 'Project › Status updates'], [/src\/pages\/project\/Plan/, 'Project › Plan'],
  [/src\/pages\/project\/Financials/, 'Project › Financials'], [/src\/pages\/project\/Governance/, 'Project › Governance'],
  [/src\/pages\/project\/Closure/, 'Project › Closure'], [/src\/pages\/project\/Registers/, 'Project registers'],
  [/src\/pages\/project\/Overview/, 'Project › Overview'], [/src\/pages\/project\/Project/, 'Project workspace'],
  [/src\/pages\/engagement\/Financials/, 'Engagement › Financials'], [/src\/pages\/engagement\/More/, 'Engagement › Reports, Team, Closure'],
  [/src\/pages\/engagement\/Registers/, 'Engagement › RAID, Changes, Governance, Contracts'], [/src\/pages\/engagement\/Overview/, 'Engagement › Overview'],
  [/src\/pages\/engagement\/Projects/, 'Engagement › Projects'], [/src\/pages\/engagement\/Engagement/, 'Engagement workspace'],
  [/src\/pages\/Time\.jsx/, 'Timesheet'], [/src\/pages\/TimeApprovals/, 'Time approvals'], [/src\/pages\/GenerateReport/, 'Reports › Generate'],
  [/src\/pages\/ReportDetail/, 'Reports › Report'], [/src\/pages\/TemplateDetail/, 'Reports › Template'], [/src\/pages\/Templates/, 'Reports › Templates'],
  [/src\/pages\/Tokens/, 'Reports › Token reference'], [/src\/pages\/Tracker/, 'Reports › Status tracker'], [/src\/pages\/Reports/, 'Reports'],
  [/src\/pages\/Portfolio/, 'Portfolio'], [/src\/pages\/MyWork/, 'My work'], [/src\/pages\/Approvals/, 'Approvals'], [/src\/pages\/Client/, 'Clients'],
  [/src\/pages\/Resources/, 'Resources'], [/src\/pages\/Finance/, 'Finance'], [/src\/pages\/Pmo/, 'PMO'], [/src\/pages\/Knowledge/, 'Knowledge base'],
  [/src\/pages\/Portal/, 'Client portal'], [/src\/pages\/admin\/Audit/, 'Admin › Audit log'], [/src\/pages\/admin\/Admin/, 'Administration'],
  [/src\/pages\/Raid/, 'RAID'], [/src\/components\/Record/, 'Registers and record forms'], [/src\/components\/Raid/, 'RAID views'],
  [/src\/components\/Invoices/, 'Invoices'], [/src\/components\/Layout/, 'Navigation and notifications'], [/src\/components\/charts/, 'Charts'],
  [/src\/components\/fields/, 'Record forms'], [/server\/lib\/reports\//, 'report engine'], [/server\/seed\//, 'demo data'],
  [/server\/lib\/(\w+)\.mjs/, (m) => `${m[1]} service`], [/server\/routes\/(\w+)\.mjs/, (m) => `${m[1]} API`], [/server\/(\w+)\.mjs/, (m) => `${m[1]} (server)`],
  [/shared\/(\w+)\.js/, (m) => `${m[1]} rules`],
];
const placeOf = (file) => {
  for (const [re, label] of PLACES) { const m = file.match(re); if (m) return typeof label === 'function' ? label(m) : label; }
  return null;
};

// Reviewed statuses. Anything cited in the code and not listed here is Implemented.
const P = 'Partial', N = 'Not started', D = 'Deployment', R = 'Process', O = 'Out of scope', I = 'Implemented', C = 'Configurable';
const REVIEWED = {
  // Implemented without an ID citation in the code.
  'CLI-008': [I, 'Engagement › Governance › Client satisfaction; trend on the client view'],
  'ENG-004': [I, 'Engagement › Contracts and POs (master agreement references, SOWs, work orders, variations)'],
  'ENG-017': [I, 'Engagement › Governance › Growth opportunities; passed to the CRM adapter'],
  'PLN-004': [I, 'Project › Plan: critical path and total float (schedule service), critical tasks highlighted in the Gantt'],
  'PLN-007': [I, 'Project › Plan: Gantt with baseline, and a table view'],
  'TEX-002': [I, 'Timesheet: leave, training, business development, practice development and internal codes (configurable list)'],
  'RSK-005': [I, 'Project › Financials: contingency and management reserve on the budget; drawdowns against risks or changes with approval'],
  'RSK-011': [I, 'Project › Governance: risk management approach in the management approaches'],
  'RAI-006': [I, 'RAID › Decisions register'],
  'BEN-003': [I, 'Benefits register: dis-benefit flag'],
  'DOC-004': [I, 'Attachments tab on every record (scanned, checked by content, audited)'],
  'FIN-009': [I, 'Project › Financials › Budget: cost and fee lines held separately; budgeted margin'],
  'FIN-016': [I, 'Actuals are calculated from approved time on every request; weekly forecast refresh job'],
  'FIN-031': [I, 'Project › Financials: planned value, earned value and actual cost curves, SPI and CPI trend'],
  'FIN-042': [I, 'Amounts held ex GST; GST by tax code; PO consumption compared on the PO’s GST basis (BR-13)'],
  'FIN-048': [I, 'Engagement and project financials: fee burn-up against contract value, PO burn, cost curves, margin trend, revenue by month'],
  'RPT-036': [I, 'Reports › Report › Drafts: every regenerated draft kept with author, time and warnings'],
  'DAT-007': [I, 'Admin › Imports: reconciliation of source rows, imported and rejected rows, and totals'],
  'INT-010': [I, 'PMO › Analytics feeds: governed JSON datasets with the application’s access rules'],
  'INT-015': [I, 'README: system of record for each data object'],
  // Partly delivered.
  'ENG-016': [P, 'New SOWs and variations are recorded and projects can move between engagements of the same client; no one-step renewal'],
  'GOV-013': [P, 'The report engine supports the PID report type; a PID template is authored in the template library'],
  'PLN-002': [P, 'Deliverables carry product descriptions (purpose, quality criteria and method, owner); no product breakdown structure view'],
  'PLN-008': [P, 'Kanban board view of work items; no calendar or timeline view'],
  'PLN-009': [P, 'Work breakdown exports to Excel; Microsoft Project import and export not built'],
  'PLN-017': [P, 'Reschedule preview before applying; forecast scenarios leave the live forecast unchanged'],
  'QLT-006': [P, 'Quality reviews, findings and rejection counts recorded; no consolidated quality measures report'],
  'STK-006': [P, 'Steering committee report type supported by the engine; template authored in the library'],
  'STS-009': [P, 'Tolerance exceptions detected and notified (BR-04); exception report type supported; template authored in the library'],
  'STS-013': [P, 'Responsive layout works at phone widths; not separately usability-tested on devices'],
  'CLS-003': [P, 'End project report type supported; the final position is recorded at closure; template authored in the library'],
  'DOC-003': [P, 'Document register links to the Firm repository; folder provisioning in SharePoint not connected'],
  'DOC-007': [P, 'Global search across engagements, projects and clients; search within each register; attachment contents not indexed'],
  'WFL-003': [P, 'Tolerance exceptions post to an engagement’s Teams channel webhook; approvals are actioned in CEMS'],
  'FIN-002': [P, 'Change requests are priced from effort estimates by role and rate; commercial approval records price, cost and margin'],
  'INT-003': [P, 'Document register holds repository links; issued reports are archived in CEMS; SharePoint provisioning not connected'],
  'INT-004': [P, 'Teams incoming webhooks for exception alerts'],
  'INT-005': [P, 'Accounting adapter interface with retries and an inbound invoice status endpoint; the accounting system is to be confirmed'],
  'INT-006': [P, 'Inbound won-opportunity endpoint and pipeline import; the CRM is to be confirmed'],
  'INT-007': [P, 'People import with validation (Admin › Imports); no live HR feed'],
  'INT-009': [P, 'Excel exports of registers and plans; Microsoft Project not built'],
  'INT-013': [P, 'OpenAPI description at /api/openapi.json and signed webhooks; OAuth 2.0 client credentials to be configured with Entra ID'],
  'NFR-006': [P, 'Strict content security policy, CSRF tokens, parameterised SQL and upload validation; pipeline scanning is set up with the Firm’s CI'],
  'NFR-007': [P, 'Security events are in the audit log and available as webhooks; forwarding to the monitoring platform is configured at deployment'],
  'NFR-012': [P, 'Minimal personal data; de-identification job after retention (DAT-002); access and correction through administrators'],
  'NFR-013': [P, 'Tamper-evident audit log of sign-ins, access changes, exports and distribution'],
  'NFR-018': [P, 'Pages load in about 1.3 seconds against the demo data; load testing is part of go-live'],
  'NFR-019': [P, 'Designed for the stated volumes; to be confirmed by load testing'],
  'NFR-020': [P, 'Dashboards are calculated on request; report generation measured at 3 to 5 seconds'],
  'NFR-021': [P, 'Ratings always carry text, form controls are labelled and keyboard-operable; formal WCAG 2.2 audit and PDF tagging review pending'],
  'NFR-022': [P, 'Responsive layout for tablet and phone, including time entry, approvals, status updates and RAID'],
  'NFR-024': [P, 'Every screen explains itself in context; role-based onboarding guides to be written'],
  'NFR-028': [P, 'Environment set by configuration with a banner outside production; production data masking for test copies not built'],
  'NFR-031': [P, 'Health, job and integration views; platform monitoring and alerting set up at deployment'],
  'NFR-032': [P, 'README, OpenAPI description, token reference and in-app help; user and administrator guides to be written'],
  'NFR-033': [P, 'Dependencies are pinned in package-lock.json; an SBOM is produced with npm sbom'],
  'AIA-002': [P, 'AI drafting is not enabled in this release; reports record whether AI assistance was used'],
  'AIA-003': [C, 'No AI service is connected; the approved service and data region are configuration'],
  // Delivered by hosting and operations rather than application code.
  'NFR-003': [D, 'TLS terminates at the Firm’s gateway; storage encryption and keys in the hosting platform’s key service'],
  'NFR-004': [D, 'Controls aligned at deployment with the Firm’s ISMS'],
  'NFR-014': [D, 'Australian hosting region for production, backups and disaster recovery'],
  'NFR-015': [D, 'Availability target met by the hosting design'],
  'NFR-016': [D, 'Recovery objectives met by database backups and restore procedures'],
  'NFR-017': [D, 'Backup schedule and restore tests in operations'],
  'NFR-029': [D, 'Container image and automated tests support pipeline deployment'],
  // Project and rollout activities.
  'NFR-005': [R, 'Penetration testing before go-live and annually'],
  'NFR-011': [R, 'Privacy impact assessment before go-live'],
  'NFR-023': [R, 'Usability testing of the weekly status update'],
  'TRN-001': [R, 'Pilot with two engagements'], 'TRN-002': [R, 'Parallel weekly reporting for two cycles'], 'TRN-003': [R, 'Data migration with reconciliation sign-off (imports support it)'],
  'TRN-004': [R, 'Role-based training'], 'TRN-005': [R, 'Four weeks of hypercare'], 'TRN-006': [R, 'Adoption tracking from the status tracker and report archive'],
  // Not built in this release.
  'GOV-014': [N, ''], 'PLN-011': [N, ''], 'SCP-006': [N, ''], 'TEX-011': [N, ''], 'RAI-011': [N, ''], 'STK-008': [N, ''], 'STS-012': [N, ''],
  'FIN-007': [N, ''], 'FIN-017': [N, ''], 'FIN-032': [N, ''], 'FIN-043': [N, ''], 'RPT-017': [N, ''], 'RPT-033': [N, 'Reports render as Word and PDF; data exports are Excel'],
  'RPT-039': [N, 'Scheduled drafts run per engagement (RPT-037)'], 'AIA-001': [N, ''], 'AIA-005': [N, ''], 'DAT-006': [N, ''], 'INT-008': [N, ''], 'INT-011': [N, ''], 'INT-012': [N, ''],
  'RSK-012': [O, 'Won’t have in this release'], 'FIN-046': [O, 'Won’t have in this release'],
};

// Collect the files that cite each requirement ID.
const files = [];
const walk = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (!['node_modules', 'dist', 'data', 'templates'].includes(f)) walk(p); } else if (/\.(m?js|jsx)$/.test(f) && f !== 'traceability.js') files.push(p);
  }
};
for (const d of ['server', 'src', 'shared']) walk(path.join(root, d));
const text = new Map(files.map((f) => [path.relative(root, f), fs.readFileSync(f, 'utf8')]));

const out = {};
const counts = {};
for (const r of REQS) {
  const cited = [...text.entries()].filter(([, t]) => new RegExp(`\\b${r.id}\\b`).test(t)).map(([f]) => f);
  const places = [...new Set(cited.map(placeOf).filter(Boolean))];
  // Screens first, then services, so the reader sees where to look in the application.
  places.sort((a, b) => Number(/service|API|rules|engine|server|data/.test(a)) - Number(/service|API|rules|engine|server|data/.test(b)));
  const [status, note] = REVIEWED[r.id] || (cited.length ? [I, ''] : [N, '']);
  const where = note || places.slice(0, 4).join('; ');
  out[r.id] = { status, where };
  counts[status] = (counts[status] || 0) + 1;
}

const body = Object.entries(out).map(([id, v]) => `  '${id}': { status: '${v.status}', where: ${JSON.stringify(v.where)} },`).join('\n');
fs.writeFileSync(OUT, `// Requirements traceability: implementation status and location for each requirement ID.
// Generated by scripts/build-traceability.mjs from the IDs cited in the code and the reviewed
// statuses in that script. Do not edit by hand.
export const TRACEABILITY = {
${body}
};
`);
console.log(`Wrote ${Object.keys(out).length} requirements:`, JSON.stringify(counts));
const musts = REQS.filter((r) => r.priority === 'M');
const mustCounts = {};
for (const r of musts) mustCounts[out[r.id].status] = (mustCounts[out[r.id].status] || 0) + 1;
console.log(`Musts (${musts.length}):`, JSON.stringify(mustCounts));
