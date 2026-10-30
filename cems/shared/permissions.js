// Roles (section 5.1) and the indicative permissions matrix (section 5.3).
// C = create, R = read, U = update, A = approve. A qualifier after ':' narrows the grant:
//   own    — the user's own records or assigned items
//   shared — records flagged client-visible
//   rates  — charge-out rates only (no cost rates)
//   issued — issued items only
// The matrix is configuration (ADM-004): administrators can change it without a release.

export const ROLES = [
  { id: 'engagement_executive', label: 'Engagement executive', short: 'EE', desc: 'Partner or director accountable for the client relationship and commercial outcome' },
  { id: 'engagement_manager', label: 'Engagement manager', short: 'EM', desc: 'Runs the engagement day to day, across all its projects' },
  { id: 'project_manager', label: 'Project manager', short: 'PM', desc: 'Manages one or more projects in an engagement' },
  { id: 'team_member', label: 'Team member', short: 'TM', desc: 'Consultant, contractor or subcontractor' },
  { id: 'resource_manager', label: 'Resource manager', short: 'RM', desc: "Manages the Firm's capacity" },
  { id: 'finance', label: 'Finance', short: 'FIN', desc: 'Finance officer and finance manager' },
  { id: 'pmo', label: 'PMO', short: 'PMO', desc: 'Owns delivery standards and portfolio insight' },
  { id: 'client', label: 'Client stakeholder', short: 'CL', desc: 'Client sponsor, approver or team member (external)' },
  { id: 'auditor', label: 'Auditor (read-only)', short: 'AUD', desc: 'Internal or external assurance' },
];
export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.id, r.label]));

// Firm-wide roles held on the user record (not per engagement).
export const GLOBAL_ROLES = [
  { id: 'engagement_executive', label: 'Engagement executive (portfolio read)' },
  { id: 'pmo', label: 'PMO (portfolio)' },
  { id: 'finance', label: 'Finance (portfolio)' },
  { id: 'resource_manager', label: 'Resource manager (Firm capacity)' },
  { id: 'auditor', label: 'Auditor (portfolio read, audit log)' },
  { id: 'sysadmin', label: 'System administrator (no engagement content — ACC-009)' },
];

// ACC-002: roles with portfolio-wide read access.
export const PORTFOLIO_ROLES = ['engagement_executive', 'pmo', 'finance', 'auditor'];
// ACC-003: roles that see cost rates, salary-derived costs, margins and internal commercial notes.
export const COST_ROLES = ['finance', 'engagement_executive', 'engagement_manager'];

export const FUNCTIONS = [
  { id: 'setup', label: 'Client and engagement set-up' },
  { id: 'plan', label: 'Project plan and schedule' },
  { id: 'raid', label: 'RAID registers' },
  { id: 'governance', label: 'Stakeholders, communications and governance' },
  { id: 'change', label: 'Change requests' },
  { id: 'time', label: 'Timesheets and expenses' },
  { id: 'time_approve', label: 'Timesheet and expense approval' },
  { id: 'resources', label: 'Resource requests and allocations' },
  { id: 'rates', label: 'Rate cards and cost rates' },
  { id: 'budget', label: 'Budgets and forecasts' },
  { id: 'billing', label: 'Invoicing, revenue and WIP' },
  { id: 'status', label: 'Weekly status update' },
  { id: 'templates', label: 'Report templates' },
  { id: 'report', label: 'Weekly report: generate and issue' },
  { id: 'dashboards', label: 'Dashboards' },
  { id: 'config', label: 'Delivery profiles and configuration' },
];

const R = ['engagement_executive', 'engagement_manager', 'project_manager', 'team_member', 'resource_manager', 'finance', 'pmo', 'client', 'auditor'];
const row = (...vals) => Object.fromEntries(R.map((r, i) => [r, vals[i] ?? '']));

export const DEFAULT_MATRIX = {
  //                 EE        EM          PM         TM          RM          FIN        PMO        CLIENT       AUD
  setup: row('RA', 'CRU', 'R', '', 'R', 'R', 'R', '', 'R'),
  plan: row('R', 'CRUA', 'CRU', 'RU:own', 'R', 'R', 'R', 'R:shared', 'R'),
  raid: row('R', 'CRU', 'CRU', 'CR', 'R', 'R', 'R', 'R:shared', 'R'),
  governance: row('R', 'CRU', 'CRU', 'R', 'R', 'R', 'R', '', 'R'),
  change: row('RA', 'CRUA', 'CRU', 'C', '', 'R', 'R', 'RA:shared', 'R'),
  time: row('CRU:own', 'CRU:own', 'CRU:own', 'CRU:own', 'CRU:own', 'R', '', '', 'R'),
  time_approve: row('', 'A', 'A', '', '', 'R', '', '', 'R'),
  resources: row('R', 'CRU', 'CRU', 'R', 'CRUA', 'R', 'R', '', 'R'),
  rates: row('R', 'R:rates', 'R:rates', '', 'R:rates', 'CRUA', '', '', 'R'),
  budget: row('RA', 'CRU', 'CRU', '', 'R', 'RA', 'R', '', 'R'),
  billing: row('R', 'RU', 'R', '', '', 'CRUA', '', 'R:issued', 'R'),
  status: row('R', 'RA', 'CRU', '', '', 'R', 'R', '', 'R'),
  templates: row('R', 'CRU', 'R', '', '', '', 'CRUA', '', 'R'),
  report: row('RA', 'CRUA', 'CR', '', '', '', 'R', 'R:issued', 'R'),
  dashboards: row('R', 'R', 'R', 'R:own', 'R', 'R', 'R', '', 'R'),
  config: row('', '', '', '', '', '', 'CRU', '', ''),
};

// Parses a matrix cell like 'CRU:own' into { actions: Set, qualifier }.
export function parseCell(cell) {
  const [acts = '', qualifier = null] = String(cell || '').split(':');
  return { actions: new Set(acts.split('')), qualifier };
}

// Merges grants: a broader grant (no qualifier) wins over a qualified one for the same action.
export function mergeGrants(target, cell) {
  const { actions, qualifier } = parseCell(cell);
  for (const a of actions) {
    if (!a) continue;
    const prev = target[a];
    if (prev === undefined || (prev !== null && qualifier === null)) target[a] = qualifier;
  }
  return target;
}

// Read-only projection used for portfolio-wide read access (ACC-002).
export function readOnly(cell) {
  const { actions, qualifier } = parseCell(cell);
  return actions.has('R') || actions.has('A') ? (qualifier ? `R:${qualifier}` : 'R') : '';
}
