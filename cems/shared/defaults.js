// Default reference data and configuration (ADM-003, ADM-004, section 10 business rules).
// Every value here is a recommended default that an administrator can change in Admin → Configuration.

export const FIRM = {
  name: 'CTO Consulting',
  legalName: 'CTO Consulting Pty Ltd',
  abn: '00 000 000 000',
  timezone: 'Australia/Sydney',
  state: 'NSW',
  currency: 'AUD',
};

// Likelihood × consequence matrix (RSK-002), rows by likelihood 1..5, columns by consequence 1..5.
export const RISK_MATRIX = {
  likelihood: [
    { score: 1, label: 'Rare', descriptor: 'May occur only in exceptional circumstances (<5%)' },
    { score: 2, label: 'Unlikely', descriptor: 'Could occur at some time (5–25%)' },
    { score: 3, label: 'Possible', descriptor: 'Might occur during the engagement (25–50%)' },
    { score: 4, label: 'Likely', descriptor: 'Will probably occur (50–80%)' },
    { score: 5, label: 'Almost certain', descriptor: 'Expected to occur (>80%)' },
  ],
  consequence: [
    { score: 1, label: 'Insignificant', descriptor: 'Negligible effect on cost, time or quality' },
    { score: 2, label: 'Minor', descriptor: 'Absorbed within tolerance; <2% cost or <5 days' },
    { score: 3, label: 'Moderate', descriptor: 'Uses a large part of tolerance; 2–5% cost or 5–10 days' },
    { score: 4, label: 'Major', descriptor: 'Breaches tolerance; 5–15% cost or 10–30 days' },
    { score: 5, label: 'Severe', descriptor: 'Threatens viability, reputation or the client relationship' },
  ],
  // grid[likelihood-1][consequence-1]
  grid: [
    ['Low', 'Low', 'Low', 'Medium', 'Medium'],
    ['Low', 'Low', 'Medium', 'Medium', 'High'],
    ['Low', 'Medium', 'Medium', 'High', 'Extreme'],
    ['Medium', 'Medium', 'High', 'High', 'Extreme'],
    ['Medium', 'High', 'High', 'Extreme', 'Extreme'],
  ],
  levels: ['Low', 'Medium', 'High', 'Extreme'],
};

export const RISK_LEVEL_ORDER = { Low: 1, Medium: 2, High: 3, Extreme: 4 };

export const RAG_RULES = {
  spiGreen: 0.95, // SPI at least this is Green (BR-03)
  spiRed: 0.85, // SPI below this is Red
  marginTarget: 0.40, // forecast margin at or above target is Green
  marginFloor: 0.25, // margin below the floor is Red
  resourceLookaheadWeeks: 4,
  engagementHealthRule: 'worst', // BR-16: 'worst' or 'budget_weighted'
};

export const TOLERANCE_DEFAULTS = {
  // BR-04
  cost: { pct: 0.05, note: '+5% of BAC' },
  time: { days: 10, note: '10 business days on the forecast end date or a key milestone' },
  scope: { note: 'No change to contracted deliverables without an approved change request' },
  quality: { note: 'No deliverable rejected more than once' },
  benefits: { note: 'Set at initiation' },
  risk: { note: 'No open Extreme risk without an approved response' },
  sustainability: { note: 'Set at initiation' },
};

export const REPORTING = {
  weekEndDow: 5, // Friday (BR-01)
  statusCutoffDow: 4, statusCutoffTime: '17:00', // Thursday 5:00 pm
  reportIssueDow: 5, reportIssueTime: '17:00', // Friday 5:00 pm
  reminderHoursBefore: 24,
  ragTrendPeriods: 12, // STS-007
  scheduledDraftDow: 5, scheduledDraftTime: '09:00', // RPT-037
  fileName: '{ClientCode}_{EngagementCode}_{ReportType}_{WeekEnding}_v{n}', // RPT-035
};

export const TIMESHEETS = {
  deadlineDow: 1, deadlineTime: '10:00', // Monday 10:00 am for the previous week (TEX-003)
  dailyMaxHours: 12, // TEX-005
  validation: { unassignedTask: 'warn', aboveDailyMax: 'warn', beyondBudget: 'warn', beyondPo: 'warn' },
  dayLength: 7.5, // BR-12
  rounding: 0.25,
  preBaselineInitiationOnly: true, // UC-01: only initiation tasks accept time before a baseline is approved
};

export const FINANCE = {
  fyStartMonth: 7, // FIN-041
  gstRate: 0.10, // BR-13
  poAlerts: [0.75, 0.9, 1.0], // BR-05
  forecastCommentary: { pct: 0.05, amount: 10000 }, // BR-14: whichever is lower
  forecastCycle: { openDay: 3, pmDay: 5, emDay: 6, financeDay: 8 }, // business days (FIN-022)
  agedWip: { days: 60, amount: 10000 }, // FIN-037
  wipBuckets: [30, 60, 90],
  burnRateWeeks: 4,
  defaultPaymentTermsDays: 30,
};

export const ALERTS = {
  contractExpiryDays: [90, 60, 30], // ENG-013
  agreementExpiryDays: 90, // CLI-004
  clearanceExpiryDays: 60, // RES-002
  riskReviewDays: { Extreme: 7, High: 7, Medium: 14, Low: 14 }, // RSK-006
  deliverableReviewDays: 10, // SCP-003, business days
  timeCodeGraceDays: 10, // CLS-005, business days
  approvalEscalationDays: 3, // WFL-001
};

export const SECURITY = {
  sessionIdleMinutes: 30, // NFR-009
  sessionMaxHours: 12,
  uploadMaxMb: 20, // RPT-004
  requireMalwareScan: false, // set true once a scanner is configured
};

// Delegations of authority (ADM-004, CHG-003, GOV-003, FIN-044). Values in AUD excluding GST.
export const AUTHORITY = {
  change: [
    { role: 'project_manager', maxPrice: 10000, maxDays: 5, label: 'Project manager' },
    { role: 'engagement_manager', maxPrice: 50000, maxDays: 15, label: 'Engagement manager' },
    { role: 'engagement_executive', maxPrice: Infinity, maxDays: Infinity, label: 'Steering committee (engagement executive)' },
  ],
  changeClientApprovalTypes: ['scope', 'contract', 'cost'], // client approval required for these types or any price impact
  commercial: { emMaxValue: 250000, marginTarget: 0.40, marginFloor: 0.25 },
  writeDown: [
    { role: 'engagement_manager', max: 5000 },
    { role: 'engagement_executive', max: 25000 },
    { role: 'finance', max: Infinity },
  ],
  rebaselinePctForExecutive: 0.10,
  reportApproval: { client: ['engagement_executive'], internal: [] }, // RPT-040
  templatePublishApproval: true, // RPT-007
};

export const RAID_REPORT_RULES = {
  // RAI-009 default include-in-report rules
  riskLevels: ['High', 'Extreme'],
  issueSeverities: ['High', 'Critical'],
  overdueClientDependencies: true,
  decisionsRequired: true,
};

export const CLOSURE_CHECKLIST = [
  // CLS-001
  { key: 'deliverables', label: 'All deliverables accepted or withdrawn', mandatory: true, auto: true },
  { key: 'raid', label: 'RAID items closed or transferred', mandatory: true, auto: true },
  { key: 'invoice', label: 'Final invoice issued', mandatory: true, auto: true },
  { key: 'time', label: 'Time and costs finalised (no unapproved time)', mandatory: true, auto: true },
  { key: 'people', label: 'People released (allocations ended)', mandatory: true, auto: true },
  { key: 'feedback', label: 'Client feedback obtained', mandatory: false },
  { key: 'lessons', label: 'Lessons recorded', mandatory: true, auto: true },
  { key: 'documents', label: 'Documents archived', mandatory: true },
  { key: 'access', label: 'Client system access revoked', mandatory: true },
];

export const ENGAGEMENT_CLOSURE = [
  // CLS-007
  { key: 'projects', label: 'All projects closed', mandatory: true, auto: true },
  { key: 'final_invoice', label: 'Final invoice issued', mandatory: true, auto: true },
  { key: 'handover', label: 'Handover complete', mandatory: true },
  { key: 'client_data', label: 'Client data returned or destroyed (DAT-004)', mandatory: true },
];

export const LISTS = {
  sectors: ['Federal government', 'State government', 'Local government', 'Health', 'Financial services', 'Energy and utilities', 'Education', 'Transport', 'Retail', 'Not-for-profit'],
  engagementTypes: ['advisory', 'delivery', 'managed service', 'capacity'],
  commercialModels: ['T&M', 'Capped T&M', 'Fixed price', 'Milestone fixed price', 'Retainer', 'Outcome-based'],
  approaches: ['predictive', 'agile', 'hybrid'],
  classifications: ['Public', 'Internal', 'Confidential', 'Highly confidential', 'OFFICIAL', 'OFFICIAL: Sensitive', 'PROTECTED'],
  clearances: ['Baseline', 'NV1', 'NV2', 'PV'],
  grades: ['Partner', 'Director', 'Senior Manager', 'Manager', 'Senior Consultant', 'Consultant', 'Analyst'],
  practices: ['Strategy & Advisory', 'Digital Delivery', 'Cyber Security', 'Data & AI', 'Program Assurance'],
  states: ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'],
  workTypes: ['Delivery', 'Workshop', 'Analysis', 'Documentation', 'Project management', 'Quality review', 'Travel'],
  nonProjectCodes: [
    { code: 'LEAVE-AL', label: 'Annual leave', kind: 'leave' },
    { code: 'LEAVE-PL', label: 'Personal leave', kind: 'leave' },
    { code: 'PUBHOL', label: 'Public holiday', kind: 'leave' },
    { code: 'TRAIN', label: 'Training', kind: 'training' },
    { code: 'BD', label: 'Business development', kind: 'bd' },
    { code: 'PRACT', label: 'Practice development', kind: 'practice' },
    { code: 'INT', label: 'Internal projects', kind: 'internal' },
  ],
  expenseTypes: ['Airfare', 'Accommodation', 'Meals', 'Ground transport', 'Materials', 'Other'],
  taxCodes: [{ code: 'GST', rate: 0.1, label: 'GST 10%' }, { code: 'FRE', rate: 0, label: 'GST-free' }, { code: 'INP', rate: 0, label: 'Input taxed' }],
  costTypes: ['labour', 'contractors', 'expenses', 'third-party', 'contingency'],
  riskCategories: ['Commercial', 'Delivery', 'Resourcing', 'Client dependency', 'Technical', 'Security', 'Stakeholder', 'Quality', 'Sustainability'],
  writeReasonCodes: ['Scope absorbed', 'Rework', 'Overrun', 'Rate variance', 'Goodwill', 'Billing cap', 'Recovery (write-up)'],
  lessonCategories: ['Commercial', 'Delivery', 'Governance', 'People', 'Client relationship', 'Technical', 'Quality'],
};

// Indicative public holidays by state (ADM-003). Confirm each year against official sources.
const ALL = ['ALL'];
export const PUBLIC_HOLIDAYS = [
  ['2025-01-01', "New Year's Day", ALL], ['2025-01-27', 'Australia Day', ALL], ['2025-03-03', 'Labour Day', ['WA']],
  ['2025-03-10', 'Canberra Day', ['ACT']], ['2025-03-10', 'Labour Day', ['VIC']], ['2025-03-10', 'Adelaide Cup Day', ['SA']], ['2025-03-10', 'Eight Hours Day', ['TAS']],
  ['2025-04-18', 'Good Friday', ALL], ['2025-04-21', 'Easter Monday', ALL], ['2025-04-25', 'Anzac Day', ALL],
  ['2025-05-05', 'Labour Day', ['QLD']], ['2025-05-05', 'May Day', ['NT']], ['2025-06-02', 'Reconciliation Day', ['ACT']], ['2025-06-02', 'Western Australia Day', ['WA']],
  ['2025-06-09', "King's Birthday", ['NSW', 'VIC', 'ACT', 'SA', 'TAS', 'NT']], ['2025-08-04', 'Picnic Day', ['NT']],
  ['2025-09-26', 'AFL Grand Final Friday', ['VIC']], ['2025-09-29', "King's Birthday", ['WA']],
  ['2025-10-06', 'Labour Day', ['NSW', 'ACT', 'SA']], ['2025-10-06', "King's Birthday", ['QLD']], ['2025-11-04', 'Melbourne Cup', ['VIC']],
  ['2025-12-25', 'Christmas Day', ALL], ['2025-12-26', 'Boxing Day', ALL],
  ['2026-01-01', "New Year's Day", ALL], ['2026-01-26', 'Australia Day', ALL], ['2026-03-02', 'Labour Day', ['WA']],
  ['2026-03-09', 'Canberra Day', ['ACT']], ['2026-03-09', 'Labour Day', ['VIC']], ['2026-03-09', 'Adelaide Cup Day', ['SA']], ['2026-03-09', 'Eight Hours Day', ['TAS']],
  ['2026-04-03', 'Good Friday', ALL], ['2026-04-06', 'Easter Monday', ALL], ['2026-04-27', 'Anzac Day (observed)', ['WA']],
  ['2026-05-04', 'Labour Day', ['QLD']], ['2026-05-04', 'May Day', ['NT']], ['2026-06-01', 'Reconciliation Day', ['ACT']], ['2026-06-01', 'Western Australia Day', ['WA']],
  ['2026-06-08', "King's Birthday", ['NSW', 'VIC', 'ACT', 'SA', 'TAS', 'NT']], ['2026-08-03', 'Picnic Day', ['NT']],
  ['2026-09-25', 'AFL Grand Final Friday', ['VIC']], ['2026-09-28', "King's Birthday", ['WA']],
  ['2026-10-05', 'Labour Day', ['NSW', 'ACT', 'SA']], ['2026-10-05', "King's Birthday", ['QLD']], ['2026-11-03', 'Melbourne Cup', ['VIC']],
  ['2026-12-25', 'Christmas Day', ALL], ['2026-12-28', 'Boxing Day (observed)', ALL],
  ['2027-01-01', "New Year's Day", ALL], ['2027-01-26', 'Australia Day', ALL], ['2027-03-01', 'Labour Day', ['WA']],
  ['2027-03-08', 'Canberra Day', ['ACT']], ['2027-03-08', 'Labour Day', ['VIC']], ['2027-03-08', 'Adelaide Cup Day', ['SA']], ['2027-03-08', 'Eight Hours Day', ['TAS']],
  ['2027-03-26', 'Good Friday', ALL], ['2027-03-29', 'Easter Monday', ALL], ['2027-04-26', 'Anzac Day (observed)', ['WA', 'ACT']],
  ['2027-05-03', 'Labour Day', ['QLD']], ['2027-05-03', 'May Day', ['NT']], ['2027-05-31', 'Reconciliation Day', ['ACT']], ['2027-06-07', 'Western Australia Day', ['WA']],
  ['2027-06-14', "King's Birthday", ['NSW', 'VIC', 'ACT', 'SA', 'TAS', 'NT']], ['2027-08-02', 'Picnic Day', ['NT']],
  ['2027-09-24', 'AFL Grand Final Friday', ['VIC']], ['2027-09-27', "King's Birthday", ['WA']],
  ['2027-10-04', 'Labour Day', ['NSW', 'ACT', 'SA']], ['2027-10-04', "King's Birthday", ['QLD']], ['2027-11-02', 'Melbourne Cup', ['VIC']],
  ['2027-12-27', 'Christmas Day (observed)', ALL], ['2027-12-28', 'Boxing Day (observed)', ALL],
].map(([date, name, states]) => ({ date, name, states }));

// Delivery profiles (ADM-002): terminology, lifecycle stages, gate criteria and mandatory artefacts.
export const DELIVERY_PROFILES = [
  {
    id: 'prince2', name: 'PRINCE2-aligned (predictive)', approach: 'predictive',
    terminology: { stage: 'Stage', board: 'Project board', sponsor: 'Executive' },
    roleSet: ['Executive', 'Senior user', 'Senior supplier', 'Project assurance', 'Change authority', 'Project manager'],
    stages: [
      { name: 'Initiation', kind: 'stage', gate: { criteria: ['Business justification confirmed', 'PID approved', 'Tolerances agreed'], artefacts: ['Project initiation document', 'Risk register', 'Baseline plan'] } },
      { name: 'Delivery stage 1', kind: 'stage', gate: { criteria: ['Stage products accepted', 'Business justification confirmed', 'Next stage plan approved'], artefacts: ['End stage report', 'Next stage plan'] } },
      { name: 'Delivery stage 2', kind: 'stage', gate: { criteria: ['Stage products accepted', 'Business justification confirmed'], artefacts: ['End stage report'] } },
      { name: 'Closure', kind: 'stage', gate: { criteria: ['Acceptance confirmed', 'Lessons recorded'], artefacts: ['End project report', 'Lessons report'] } },
    ],
  },
  {
    id: 'pmbok', name: 'PMBOK-aligned (predictive)', approach: 'predictive',
    terminology: { stage: 'Phase', board: 'Steering committee', sponsor: 'Sponsor' },
    roleSet: ['Sponsor', 'Steering committee member', 'Project manager', 'Business owner', 'Quality assurance'],
    stages: [
      { name: 'Initiating', kind: 'phase', gate: { criteria: ['Charter approved'], artefacts: ['Project charter'] } },
      { name: 'Planning', kind: 'phase', gate: { criteria: ['Baselines approved'], artefacts: ['Project management plan', 'Schedule baseline', 'Cost baseline'] } },
      { name: 'Executing', kind: 'phase', gate: { criteria: ['Deliverables accepted'], artefacts: ['Acceptance records'] } },
      { name: 'Closing', kind: 'phase', gate: { criteria: ['Closure checklist complete'], artefacts: ['Closure report'] } },
    ],
  },
  {
    id: 'agile', name: 'Agile (Scrum)', approach: 'agile',
    terminology: { stage: 'Release', board: 'Steering committee', sponsor: 'Product owner' },
    roleSet: ['Sponsor', 'Product owner', 'Scrum master', 'Delivery lead'],
    stages: [
      { name: 'Inception', kind: 'release', gate: { criteria: ['Product vision and backlog agreed'], artefacts: ['Product vision', 'Initial backlog'] } },
      { name: 'Release 1', kind: 'release', gate: { criteria: ['Release accepted'], artefacts: ['Release notes'] } },
      { name: 'Release 2', kind: 'release', gate: { criteria: ['Release accepted'], artefacts: ['Release notes'] } },
    ],
  },
  {
    id: 'hybrid', name: 'Hybrid (governed stages, agile delivery)', approach: 'hybrid',
    terminology: { stage: 'Stage', board: 'Steering committee', sponsor: 'Sponsor' },
    roleSet: ['Sponsor', 'Steering committee member', 'Product owner', 'Project manager', 'Delivery lead'],
    stages: [
      { name: 'Discovery', kind: 'stage', gate: { criteria: ['Problem and outcomes agreed', 'Business justification confirmed'], artefacts: ['Discovery report'] } },
      { name: 'Design', kind: 'stage', gate: { criteria: ['Design approved'], artefacts: ['Solution design', 'Release plan'] } },
      { name: 'Build', kind: 'stage', gate: { criteria: ['Releases accepted', 'Business justification confirmed'], artefacts: ['Test summary report'] } },
      { name: 'Transition', kind: 'stage', gate: { criteria: ['Operational acceptance', 'Lessons recorded'], artefacts: ['Handover pack', 'End project report'] } },
    ],
  },
];

// Project templates (GOV-001, PLN-015, ADM-007). Task offsets are business days from the project start.
export const PROJECT_TEMPLATES = [
  {
    id: 'discovery', name: 'Discovery', profile: 'hybrid', approach: 'predictive', engagementType: 'advisory', size: 'small', durationWeeks: 8,
    tasks: [
      { name: 'Mobilise and confirm scope', stage: 0, start: 0, days: 5, initiation: true },
      { name: 'Stakeholder interviews', stage: 0, start: 5, days: 10 },
      { name: 'Current state assessment', stage: 0, start: 5, days: 15 },
      { name: 'Future state options', stage: 1, start: 20, days: 10 },
      { name: 'Discovery report', stage: 1, start: 28, days: 10, deliverable: true },
    ],
    risks: ['SME availability', 'Scope creep'],
    milestones: [{ name: 'Discovery report accepted', offset: 40, kind: 'payment', key: true }],
  },
  {
    id: 'business-case', name: 'Business case', profile: 'prince2', approach: 'predictive', engagementType: 'advisory', size: 'medium', durationWeeks: 12,
    tasks: [
      { name: 'Initiation and PID', stage: 0, start: 0, days: 10, initiation: true },
      { name: 'Options analysis', stage: 1, start: 10, days: 15 },
      { name: 'Cost-benefit analysis', stage: 1, start: 15, days: 15 },
      { name: 'Draft business case', stage: 2, start: 30, days: 15, deliverable: true },
      { name: 'Final business case', stage: 2, start: 45, days: 10, deliverable: true },
    ],
    risks: ['SME availability', 'Delayed data access', 'Scope creep'],
    milestones: [{ name: 'Draft business case', offset: 45, kind: 'delivery', key: true }, { name: 'Final business case accepted', offset: 55, kind: 'payment', key: true }],
  },
  {
    id: 'implementation', name: 'Implementation', profile: 'hybrid', approach: 'hybrid', engagementType: 'delivery', size: 'large', durationWeeks: 26,
    tasks: [
      { name: 'Mobilisation', stage: 0, start: 0, days: 10, initiation: true },
      { name: 'Requirements and design', stage: 1, start: 10, days: 25 },
      { name: 'Sprint 1', stage: 2, start: 35, days: 10 },
      { name: 'Sprint 2', stage: 2, start: 45, days: 10 },
      { name: 'Sprint 3', stage: 2, start: 55, days: 10 },
      { name: 'User acceptance testing', stage: 2, start: 65, days: 15, deliverable: true },
      { name: 'Deployment and hypercare', stage: 3, start: 80, days: 20 },
      { name: 'Handover', stage: 3, start: 100, days: 10, deliverable: true },
    ],
    risks: ['Key person dependency', 'Delayed system access', 'Scope creep', 'SME availability'],
    milestones: [{ name: 'Design approved', offset: 35, kind: 'delivery', key: true }, { name: 'Go-live', offset: 80, kind: 'payment', key: true }, { name: 'Handover complete', offset: 110, kind: 'payment', key: true }],
  },
  {
    id: 'assurance', name: 'Assurance review', profile: 'prince2', approach: 'predictive', engagementType: 'advisory', size: 'small', durationWeeks: 6,
    tasks: [
      { name: 'Review planning', stage: 0, start: 0, days: 5, initiation: true },
      { name: 'Document review', stage: 1, start: 5, days: 10 },
      { name: 'Interviews', stage: 1, start: 8, days: 10 },
      { name: 'Findings and report', stage: 2, start: 18, days: 10, deliverable: true },
    ],
    risks: ['Access to documents', 'SME availability'],
    milestones: [{ name: 'Assurance report issued', offset: 28, kind: 'payment', key: true }],
  },
  {
    id: 'agile-delivery', name: 'Agile delivery', profile: 'agile', approach: 'agile', engagementType: 'delivery', size: 'medium', durationWeeks: 16,
    tasks: [
      { name: 'Inception', stage: 0, start: 0, days: 10, initiation: true },
      { name: 'Sprint 1', stage: 1, start: 10, days: 10 },
      { name: 'Sprint 2', stage: 1, start: 20, days: 10 },
      { name: 'Sprint 3', stage: 2, start: 30, days: 10 },
      { name: 'Sprint 4', stage: 2, start: 40, days: 10 },
    ],
    risks: ['Product owner availability', 'Scope creep'],
    milestones: [{ name: 'Release 1', offset: 30, kind: 'delivery', key: true }, { name: 'Release 2', offset: 50, kind: 'delivery', key: true }],
  },
];

// Common consulting risks used to seed registers (RSK-010).
export const RISK_LIBRARY = [
  { key: 'SME availability', title: 'Client subject-matter experts unavailable', cause: 'Client SMEs have competing operational priorities', event: 'SMEs are not available for workshops and reviews', effect: 'Delays to analysis and deliverables', category: 'Client dependency', likelihood: 3, consequence: 3, response: 'reduce', actions: 'Agree SME calendar at mobilisation; escalate through the sponsor' },
  { key: 'Scope creep', title: 'Scope creep through informal requests', cause: 'Stakeholders request additional analysis outside the SOW', event: 'Unplanned work is absorbed without change control', effect: 'Effort overrun and margin erosion', category: 'Commercial', likelihood: 3, consequence: 4, response: 'reduce', actions: 'Log every request; apply change control; weekly scope check' },
  { key: 'Key person dependency', title: 'Key person dependency', cause: 'Critical knowledge sits with one team member', event: 'Key person leaves or is unavailable', effect: 'Delivery slows and quality drops', category: 'Resourcing', likelihood: 2, consequence: 4, response: 'reduce', actions: 'Pair key roles; document decisions; nominate a backup' },
  { key: 'Delayed system access', title: 'Delayed access to client systems', cause: 'Client onboarding and clearance processes are slow', event: 'Team cannot access systems when planned', effect: 'Idle time and schedule slippage', category: 'Client dependency', likelihood: 3, consequence: 3, response: 'reduce', actions: 'Lodge access requests before mobilisation; track as a client dependency' },
  { key: 'Delayed data access', title: 'Delayed access to client data', cause: 'Data custodians need approvals', event: 'Data is not available when planned', effect: 'Analysis compressed into later weeks', category: 'Client dependency', likelihood: 3, consequence: 3, response: 'reduce', actions: 'Agree data request schedule; escalate early' },
  { key: 'Access to documents', title: 'Incomplete access to documents', cause: 'Documents are spread across teams', event: 'Reviewers cannot see all evidence', effect: 'Findings are qualified or delayed', category: 'Client dependency', likelihood: 2, consequence: 3, response: 'reduce', actions: 'Issue document request list in week one' },
  { key: 'Product owner availability', title: 'Product owner not available for sprint ceremonies', cause: 'Product owner role is part-time', event: 'Backlog is not refined ahead of sprints', effect: 'Velocity drops; rework increases', category: 'Client dependency', likelihood: 3, consequence: 3, response: 'reduce', actions: 'Agree a delegate; protect ceremony time' },
  { key: 'Fixed price overrun', title: 'Fixed-price effort overrun', cause: 'Estimates assumed ideal conditions', event: 'Effort exceeds the priced estimate', effect: 'Margin erosion on fixed-price work', category: 'Commercial', likelihood: 2, consequence: 4, response: 'reduce', actions: 'Track EAC weekly; manage scope tightly; use contingency' },
];

export const CONFIG_DEFAULTS = {
  firm: FIRM,
  riskMatrix: RISK_MATRIX,
  ragRules: RAG_RULES,
  tolerances: TOLERANCE_DEFAULTS,
  reporting: REPORTING,
  timesheets: TIMESHEETS,
  finance: FINANCE,
  alerts: ALERTS,
  security: SECURITY,
  authority: AUTHORITY,
  raidReportRules: RAID_REPORT_RULES,
  closureChecklist: CLOSURE_CHECKLIST,
  engagementClosure: ENGAGEMENT_CLOSURE,
  lists: LISTS,
  publicHolidays: PUBLIC_HOLIDAYS,
  riskLibrary: RISK_LIBRARY,
  numbering: { client: '{NAME3}', engagement: '{CLIENT}-E{SEQ:3}', project: '{ENGAGEMENT}-P{SEQ:2}' }, // ADM-006
  retention: { years: 7, personalInfoYears: 7 }, // DAT-001, DAT-002
  ai: { enabled: false, provider: 'Approved AI service (not configured)', dataResidency: 'Australia' }, // AIA-003
};
