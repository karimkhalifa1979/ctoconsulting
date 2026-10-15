// Demonstration workspace: "Harbourline Mutual", a fictitious Australian insurer.
// It exercises every lifecycle state, includes the customer information system example from the
// specification's Appendix D (two mutually exclusive benefits paths), and carries a few deliberate
// data-quality issues so the rules engine has something to find.
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, RISK_INSTRUMENT, MATURITY, SIM_DEFAULTS } from './config.js';
import { forecastForQuarter } from './finance.js';
import { mulberry32 } from './simulation.js';
import { quarterRange } from './util.js';

const P = (id, name, position, unit, roles, email) => ({ id, name, position, unit, roles, email: email || `${name.split(' ')[0].toLowerCase()}.${name.split(' ').slice(-1)[0].toLowerCase().replace(/[^a-z]/g, '')}@harbourline.example` });

const PEOPLE = [
  P('p-chen', 'Margaret Chen', 'Chief Executive Officer', 'a-exec', ['IDB chair', 'Corporate sponsor']),
  P('p-okafor', 'David Okafor', 'Chief Financial Officer', 'a-fin', ['IDB member', 'Business sponsor']),
  P('p-raman', 'Priya Raman', 'Chief Operating Officer', 'a-exec', ['IDB member', 'Business sponsor']),
  P('p-whitfield', 'Tom Whitfield', 'Chief Information Officer', 'a-tech', ['IDB member', 'Business sponsor']),
  P('p-santos', 'Michael Santos', 'Chief Risk Officer', 'a-risk', ['IDB member', 'Business sponsor']),
  P('p-martin', 'Sophie Martin', 'Chief Underwriting Officer', 'a-uw', ['IDB member', 'Business sponsor']),
  P('p-nguyen', 'Emily Nguyen', 'Head of Distribution', 'a-sales', ['Business sponsor', 'Outcome owner']),
  P('p-lindqvist', 'Sarah Lindqvist', 'Head of Value Management Office', 'a-exec', ['VMO lead']),
  P('p-karim', 'Aisha Karim', 'Value Analyst', 'a-exec', ['Value analyst']),
  P('p-oneill', 'James O’Neill', 'Program Manager', 'a-tech', ['Program manager']),
  P('p-tan', 'Rebecca Tan', 'Program Manager', 'a-claims', ['Program manager']),
  P('p-brooks', 'Lachlan Brooks', 'Project Manager', 'a-tech', ['Project manager']),
  P('p-murphy', 'Hannah Murphy', 'Contact Centre Manager', 'a-cc', ['Outcome owner', 'Operational owner']),
  P('p-adeyemi', 'Ben Adeyemi', 'Sales Manager', 'a-sales', ['Outcome owner']),
  P('p-grant', 'Olivia Grant', 'HR Business Partner', 'a-people', ['Outcome owner']),
  P('p-kowalski', 'Daniel Kowalski', 'Finance Business Partner', 'a-fin', ['Finance analyst']),
  P('p-liu', 'Grace Liu', 'Change and Communications Lead', 'a-people', ['Change lead']),
  P('p-hayes', 'Robert Hayes', 'Enterprise Architect', 'a-tech', ['Architecture representative']),
  P('p-price', 'Nathan Price', 'Operations Manager', 'a-cc', ['Outcome owner', 'Operational owner']),
  P('p-wong', 'Kevin Wong', 'Claims Operations Manager', 'a-claims', ['Outcome owner', 'Operational owner']),
  P('p-fraser', 'Isla Fraser', 'Internal Auditor', 'a-risk', ['Auditor']),
];

const AREAS = [
  { id: 'a-exec', name: 'Executive Office', head: 'p-chen', absorption: 2 },
  { id: 'a-cc', name: 'Contact Centre', head: 'p-murphy', absorption: 2.4 },
  { id: 'a-claims', name: 'Claims', head: 'p-wong', absorption: 2.4 },
  { id: 'a-uw', name: 'Underwriting', head: 'p-martin', absorption: 2 },
  { id: 'a-sales', name: 'Sales and Distribution', head: 'p-nguyen', absorption: 2 },
  { id: 'a-fin', name: 'Finance', head: 'p-okafor', absorption: 2 },
  { id: 'a-tech', name: 'Technology', head: 'p-whitfield', absorption: 3 },
  { id: 'a-risk', name: 'Risk and Compliance', head: 'p-santos', absorption: 2 },
  { id: 'a-people', name: 'People and Culture', head: 'p-grant', absorption: 2 },
];

const DRIVERS = [
  { id: 'd-cost', name: 'Lower cost to serve', description: 'Reduce the unit cost of servicing customers and claims while protecting service quality.', perspective: 'Financial', type: 'current', weight: 0.35, owner: 'p-okafor', status: 'active', from: '2025-07-01' },
  { id: 'd-growth', name: 'Grow profitable premium', description: 'Grow gross written premium in target segments at or above target margin.', perspective: 'Financial', type: 'current', weight: 0.35, owner: 'p-martin', status: 'active', from: '2025-07-01' },
  { id: 'd-cx', name: 'Customer experience leadership', description: 'Be the easiest insurer to deal with, measured by first-contact resolution and NPS.', perspective: 'Customer', type: 'current', weight: 0.3, owner: 'p-raman', status: 'active', from: '2025-07-01' },
  { id: 'd-resilience', name: 'Group resilience and regulatory standing', description: 'Meet group and prudential expectations for operational resilience and risk management.', perspective: 'Internal process', type: 'parent', weight: 0.6, owner: 'p-santos', status: 'active', from: '2025-07-01' },
  { id: 'd-sustain', name: 'Group 2030 sustainability commitments', description: 'Contribute to the group target of net-zero operations by 2030.', perspective: 'Internal process', type: 'parent', weight: 0.4, owner: 'p-chen', status: 'active', from: '2025-07-01' },
  { id: 'd-data', name: 'Data-driven insurer of the future', description: 'Use data and analytics in every pricing, underwriting and service decision.', perspective: 'Learning and growth', type: 'future', weight: 0.6, owner: 'p-whitfield', status: 'active', from: '2025-07-01' },
  { id: 'd-people', name: 'Engaged, capable workforce', description: 'Equip people with the skills and tools to work in new ways.', perspective: 'Learning and growth', type: 'future', weight: 0.4, owner: 'p-grant', status: 'active', from: '2025-07-01' },
];

const M = (id, name, unit, direction, source, method, frequency, ownerId, quality, baseline, definition, level = 'numeric') => ({ id, name, unit, direction, source, method, frequency, ownerId, quality, baseline, definition, level, formula: '', active: true });
const MEASURES = [
  M('m-qcost', 'Cost of query handling', '$ per year', 'decrease', 'Finance ledger (cost centre 4100)', 'automated', 'Quarterly', 'p-murphy', 4, 9800000, 'Fully loaded contact-centre cost attributable to customer queries.'),
  M('m-prem', 'New premium written through the contact centre', '$ per year', 'increase', 'Policy administration system', 'automated', 'Quarterly', 'p-adeyemi', 4, 0, 'Annualised margin on new policies sold during service calls.'),
  M('m-cph', 'Customers processed per rep-hour', 'customers / rep-hour', 'increase', 'Telephony platform', 'automated', 'Monthly', 'p-murphy', 5, 9.5, 'Completed customer interactions divided by logged-in rep hours.'),
  M('m-fcr', 'First-contact resolution', '%', 'increase', 'Telephony platform and post-call survey', 'survey', 'Monthly', 'p-murphy', 3, 68, 'Share of contacts resolved without a repeat contact within 7 days.'),
  M('m-claimcost', 'Claims handling cost per claim', '$ per claim', 'decrease', 'Finance ledger and claims system', 'automated', 'Quarterly', 'p-wong', 4, 112, 'Handling cost (excluding indemnity) divided by claims finalised.'),
  M('m-leakage', 'Claims leakage', '$ per year', 'decrease', 'Claims file review sample', 'judgement', 'Quarterly', 'p-wong', 2, 5200000, 'Estimated over-payment found by quarterly file review.'),
  M('m-cycle', 'Claim cycle time', 'days', 'decrease', 'Claims system', 'automated', 'Monthly', 'p-wong', 5, 14.5, 'Median days from lodgement to finalisation.'),
  M('m-cnps', 'Claimant NPS', 'NPS points', 'increase', 'Post-claim survey', 'survey', 'Quarterly', 'p-wong', 3, 12, 'Net promoter score of finalised claimants.'),
  M('m-broker', 'Broker-submitted new business', '$ per year', 'increase', 'Policy administration system', 'automated', 'Quarterly', 'p-nguyen', 4, 0, 'Annualised margin on policies submitted through the broker portal.'),
  M('m-rework', 'Underwriting rework', '$ per year', 'decrease', 'Workflow system timesheets', 'manual', 'Quarterly', 'p-martin', 3, 0, 'Underwriter hours spent correcting incomplete broker submissions, valued at standard rates.'),
  M('m-bsat', 'Broker satisfaction', 'score / 10', 'increase', 'Annual broker survey (n≈180)', 'survey', 'Quarterly', 'p-nguyen', 3, 6.1, 'Mean broker rating of ease of doing business.', 'ordinal'),
  M('m-dccost', 'Data centre lease and power cost', '$ per year', 'decrease', 'Finance ledger', 'automated', 'Quarterly', 'p-whitfield', 5, 2100000, 'Lease, power and facilities cost for the primary data centre.'),
  M('m-hwavoid', 'Hardware refresh avoided', '$ per year', 'decrease', 'Asset register', 'manual', 'Annually', 'p-whitfield', 4, 900000, 'Avoided on-premises hardware refresh spend.'),
  M('m-rto', 'Recovery time for critical systems', 'hours', 'decrease', 'Disaster recovery test reports', 'manual', 'Six-monthly', 'p-whitfield', 4, 24, 'Demonstrated recovery time in the last DR test.'),
  M('m-outage', 'Severity-1 outage minutes', 'minutes per year', 'decrease', 'IT service management tool', 'automated', 'Monthly', 'p-santos', 5, 540, 'Minutes of severity-1 outage affecting critical operations.'),
  M('m-findings', 'Open regulatory findings', 'findings', 'decrease', 'Risk register', 'manual', 'Quarterly', 'p-santos', 4, 6, 'Open findings from prudential reviews.'),
  M('m-loss', 'Loss ratio improvement (pricing)', '$ per year', 'increase', 'Actuarial pricing review', 'judgement', 'Six-monthly', 'p-martin', 2, 0, 'Claims cost saved by improved risk selection and pricing, estimated by actuarial review.'),
  M('m-quote', 'Quote turnaround', 'days', 'decrease', 'Underwriting workflow', 'automated', 'Monthly', 'p-martin', 4, 3, 'Median days from submission to quote.'),
  M('m-uwcap', 'Underwriter capacity released', '$ per year', 'increase', 'Workflow system timesheets', 'manual', 'Quarterly', 'p-martin', 3, 0, 'Underwriter hours released by automated triage, valued at standard rates.'),
  M('m-desk', 'Desktop support cost', '$ per year', 'decrease', 'Finance ledger', 'automated', 'Quarterly', 'p-whitfield', 5, 1900000, 'Service desk and field support cost for end-user computing.'),
  M('m-lost', 'Time lost to device issues', '$ per year', 'decrease', 'Service desk tickets × time-loss survey', 'survey', 'Quarterly', 'p-grant', 2, 0, 'Staff time lost to device problems, valued at average salary.'),
  M('m-dex', 'Digital employee experience score', 'score / 100', 'increase', 'Pulse survey (n≈600)', 'survey', 'Quarterly', 'p-grant', 3, 58, 'Composite score from the quarterly pulse survey.', 'ordinal'),
];

// Compact builders ------------------------------------------------------------------
const el = (code, kind, title, extra = {}) => ({ id: `${extra.pid || ''}${code}`, code, kind, title, description: '', final: false, btopp: [], initType: '', ownerId: null, importance: null, confidence: null, contingency: '', progress: 0, expected: 0, validation: 'validated', driverIds: [], ...extra, pid: undefined });
function chain(pid, defs, linkStr, paths = []) {
  const elements = defs.map(([code, kind, title, extra]) => el(code, kind, title, { pid, ...extra }));
  const links = linkStr.split(',').map((s) => s.trim()).filter(Boolean).map((s, i) => {
    const [ft, strength = 'medium', lag = '0'] = s.split(':');
    const [f, t] = ft.split('>');
    return { id: `${pid}L${i + 1}`, from: `${pid}${f}`, to: `${pid}${t}`, strength, lag: Number(lag), description: '' };
  });
  return { elements, links, paths: paths.map((p) => ({ ...p, elementIds: p.elementIds.map((c) => `${pid}${c}`) })), versions: [] };
}
const cost = (id, name, type, btopp, start, months, amount, basis = 'once', extra = {}) => ({ id, name, type, btopp, start, months, amount, basis, ...extra });
const ben = (id, title, type, extra = {}) => ({ id, title, type, description: '', category: '', driverIds: [], dependsOn: [], attribution: 1, actuals: [], reforecasts: [], status: 'active', ...extra });
const gate = (id, g, planned, decision = null, extra = {}) => ({ id, gate: g, planned, held: decision?.date || null, checklist: {}, decision, ...extra });
const dec = (option, date, fundingApproved, rationale, extra = {}) => ({ option, date, fundingApproved, rationale, conditions: '', makers: 'Investment Decision Board', ...extra });
const proj = (id, name, extra) => ({ id, name, sow: '', managerId: 'p-brooks', initiativeIds: [], capabilities: [], btopp: 'T', budget: 0, actual: 0, forecast: 0, status: 'green', gate: 'Concept', state: 'active', milestones: [], estimates: [], ...extra });

// Risk answers built from a per-"are" level so each program has a recognisable profile.
function riskAnswers(levels, seed) {
  const rng = mulberry32(seed);
  const out = {};
  for (const q of RISK_INSTRUMENT) {
    const base = levels[q.are];
    out[q.id] = Math.max(1, Math.min(5, Math.round(base + (rng() - 0.5) * 1.6)));
  }
  return out;
}

function program(base) {
  return {
    classification: 'Internal', horizonYears: 10, tolerances: { cost: 0.1, time: 3, benefits: 0.1, risk: 65 },
    designSteps: {}, btoppChecklist: {}, projects: [], costs: [], benefits: [], chain: { elements: [], links: [], paths: [], versions: [] },
    stakeholders: [], comms: [], log: [], gates: [], valueCases: [], acceptances: {}, statusReports: [], demand: [], increments: [],
    assessment: { alignment: { ratings: {}, basis: 'assessor' }, risk: { answers: {}, basis: 'assessor' }, delphi: { rounds: [] }, history: [] },
    simSettings: { ...SIM_DEFAULTS }, simScenarios: [], comments: [], areas: [], driverIds: [],
    ...base,
  };
}

// Actuals as forecast × a ratio sequence (deterministic).
function withActuals(prog, benefitId, from, to, ratios) {
  const b = prog.benefits.find((x) => x.id === benefitId);
  b.actuals = quarterRange(from, to).map((q, i) => {
    const f = forecastForQuarter(prog, b, q);
    const r = ratios[Math.min(i, ratios.length - 1)];
    const base = Number(b.baseline?.value) || 0;
    const value = b.type === 'nonfinancial' ? base + (f - base) * r : f * r;
    return { period: q, value: Math.round(value * (b.type === 'nonfinancial' ? 10 : 1)) / (b.type === 'nonfinancial' ? 10 : 1), provenance: b.type === 'nonfinancial' ? 'Survey import' : 'Finance ledger import' };
  });
}

// ---- Programs --------------------------------------------------------------------------
function cis() {
  const pid = 'cis-';
  const p = program({
    id: 'prg-cis', code: 'PRG-001', name: 'Customer Information System', state: 'definition', stateSince: '2026-05-20',
    categoryId: 'opportunity', portfolioId: 'pf-enterprise', sponsorId: 'p-raman', managerId: 'p-oneill', analystId: 'p-karim', changeLeadId: 'p-liu',
    purpose: 'Give service representatives a single view of each customer during a call, and use it either to cut the cost of handling queries or to grow revenue by cross-selling.',
    problem: 'Customer information is spread across seven policy and claims systems. Representatives put callers on hold to search, repeat contacts are high and cross-sell opportunities are missed.',
    scope: 'Customer information system for the contact centre, plus the training, process, reward and workforce changes needed to realise value through the selected benefits path.',
    areas: ['a-cc', 'a-sales', 'a-people', 'a-tech'], driverIds: ['d-cost', 'd-growth', 'd-cx'],
    startDate: '2026-07-01', endDate: '2028-06-30', costLow: 6500000, costHigh: 9800000,
    selection: 'selected', band: 'high',
    architecture: 'Conforms to the customer data platform target state; reuses the integration hub. One managed non-conformance: interim screen-scraping of the legacy marine policy system until 2028.',
    designSteps: { benefits: 'done', scope: 'done', map: 'done', path: 'in-progress', accountability: 'in-progress', people: 'in-progress', time: 'done', risk: 'in-progress' },
    btoppChecklist: {
      B: { answer: 'Market research shows 38% of callers hold only one product; cross-sell potential is real but conversion by phone is untested (assumption A1).', initiative: 'Pilot phone cross-sell with 20 reps before Commitment.' },
      T: { answer: 'CIS consolidates seven sources through the integration hub; screen-pop on call arrival.', initiative: 'I1 Implement customer information system.' },
      O: { answer: 'Reward scheme currently favours call volume; workforce plan needed for path A.', initiative: 'I4/I8 reward scheme revisions; I5 work reallocation; I6 severance arrangements.' },
      Pr: { answer: 'Downstream fulfilment processes still re-key data captured on the call.', initiative: 'I3 Streamline downstream processes.' },
      P: { answer: '220 reps need training in the new desktop and, for path B, in needs-based selling.', initiative: 'I2 and I7 training.' },
    },
    tolerances: { cost: 0.1, time: 3, benefits: 0.1, risk: 65 },
  });
  p.chain = chain(pid, [
    ['I1', 'initiative', 'Implement customer information system', { btopp: ['T'], initType: 'Technology delivery', ownerId: 'p-brooks', importance: 'high', confidence: 'medium', progress: 0, projectId: 'cis-p1' }],
    ['O1', 'outcome', 'All customer information accessible to service reps', { ownerId: 'p-murphy', importance: 'high', confidence: 'high' }],
    ['I2', 'initiative', 'Train service reps to access information quickly', { btopp: ['P'], initType: 'Training', ownerId: 'p-liu', importance: 'medium', confidence: 'high', projectId: 'cis-p2', targetGroups: ['cis-s1'] }],
    ['I3', 'initiative', 'Streamline downstream processes', { btopp: ['Pr'], initType: 'Process redesign', ownerId: 'p-price', importance: 'high', confidence: 'medium', projectId: 'cis-p3' }],
    ['I4', 'initiative', 'Revise reward scheme to favour short customer moments', { btopp: ['O'], initType: 'Reward or incentive change', ownerId: 'p-grant', importance: 'medium', confidence: 'medium', targetGroups: ['cis-s1', 'cis-s2'] }],
    ['O2', 'outcome', 'Customers processed per rep-hour increased', { ownerId: 'p-murphy', importance: 'high', confidence: 'medium' }],
    ['I5', 'initiative', 'Reallocate work across contact-centre teams', { btopp: ['O'], initType: 'Organisation design', ownerId: 'p-price', importance: 'medium', confidence: 'high' }],
    ['I6', 'initiative', 'Negotiate severance and redeployment arrangements', { btopp: ['O'], initType: 'Industrial relations', ownerId: 'p-grant', importance: 'high', confidence: 'low', contingency: 'Natural attrition (18% a year) achieves 70% of the reduction over 24 months if no agreement is reached.', targetGroups: ['cis-s5'] }],
    ['O3', 'outcome', 'Number of service reps decreased', { ownerId: 'p-price', importance: 'high', confidence: 'medium' }],
    ['O4', 'outcome', 'Operating costs of query handling decreased', { final: true, ownerId: 'p-raman', driverIds: ['d-cost'], importance: 'high', confidence: 'medium' }],
    ['I7', 'initiative', 'Train reps to identify policy opportunities', { btopp: ['P'], initType: 'Training', ownerId: 'p-adeyemi', importance: 'high', confidence: 'medium', targetGroups: ['cis-s1', 'cis-s3'] }],
    ['I8', 'initiative', 'Revise reward scheme to favour yield', { btopp: ['O'], initType: 'Reward or incentive change', ownerId: 'p-grant', importance: 'medium', confidence: 'medium', targetGroups: ['cis-s1', 'cis-s3'] }],
    ['O5', 'outcome', 'New policy opportunities identified increased', { ownerId: 'p-adeyemi', importance: 'high', confidence: 'medium' }],
    ['O6', 'outcome', 'Yield per service rep increased', { ownerId: 'p-adeyemi', importance: 'high', confidence: 'low', contingency: 'Fall back to path A at the first benefits review if conversion stays under 4%.' }],
    ['O7', 'outcome', 'New premium revenue increased', { final: true, ownerId: 'p-raman', driverIds: ['d-growth'], importance: 'high', confidence: 'low', contingency: 'Switch to path A (cost) with the same CIS capability.' }],
    ['O8', 'outcome', 'First-contact resolution increased', { final: true, ownerId: 'p-murphy', driverIds: ['d-cx'], importance: 'medium', confidence: 'high' }],
    ['A1', 'assumption', 'Existing customers will buy new policies by phone', { assumption: { category: 'external', sub: 'Market', monitorId: 'p-adeyemi', test: 'Pilot with 20 reps for 8 weeks', indicator: 'Phone conversion rate in pilot ≥ 6%', frequency: 'Monthly', status: 'at-risk', impact: 'Path B revenue falls by more than half; switch to path A.', nextReview: '2026-11-10', probFalse: 0.4, simImpact: 0.6 } }],
    ['A2', 'assumption', 'Union agrees redeployment and severance terms', { assumption: { category: 'internal', sub: 'Industrial relations', monitorId: 'p-grant', test: 'Formal consultation under the enterprise agreement', indicator: 'In-principle agreement by March 2027', frequency: 'Monthly', status: 'holding', impact: 'Rep reduction delayed 12–18 months; cost savings fall by about a third.', nextReview: '2026-09-30', probFalse: 0.2, simImpact: 0.35 } }],
    ['A3', 'assumption', 'Call volumes stay within ±10% of forecast', { assumption: { category: 'external', sub: 'Economy', monitorId: 'p-murphy', test: 'Monthly volume tracking', indicator: 'Rolling 3-month volume vs forecast', frequency: 'Monthly', status: 'holding', impact: 'Savings scale with volume.', nextReview: '2026-12-15', probFalse: 0.15, simImpact: 0.15 } }],
  ], 'I1>O1:high:0, I2>O2:medium:2, I3>O2:high:3, I4>O2:medium:2, O1>O2:high:1, O2>O3:high:6, I5>O3:medium:3, I6>O3:high:3, O3>O4:high:3, O1>O5:high:1, I7>O5:high:2, O5>O6:high:3, I8>O6:medium:3, O6>O7:high:3, O1>O8:medium:2, A1>O6, A2>I6, A3>O4', [
    { id: 'cis-pathA', name: 'Path A — reduce the cost of handling queries', exclusiveGroup: 'cis-use', selected: true, rationale: 'Lower risk and faster value; path B depends on assumption A1, which the pilot has not yet confirmed. Revisit at the first benefits review.', elementIds: ['I1', 'O1', 'I2', 'I3', 'I4', 'O2', 'I5', 'I6', 'O3', 'O4', 'O8', 'A2', 'A3'], history: [{ date: '2026-08-12', selected: true, by: 'p-raman', rationale: 'Selected after path comparison workshop.' }] },
    { id: 'cis-pathB', name: 'Path B — grow revenue through cross-selling', exclusiveGroup: 'cis-use', selected: false, rationale: 'Higher upside but rests on A1 (phone conversion).', elementIds: ['I1', 'O1', 'I7', 'I8', 'O5', 'O6', 'A1', 'O7', 'O8'], history: [] },
  ]);
  p.chain.elements.find((e) => e.code === 'O4').progress = 0;
  for (const e of p.chain.elements) if (['I6', 'O6', 'O7'].includes(e.code)) e.validation = 'pending';
  p.projects = [
    proj('cis-p1', 'CIS platform build and integration', { sow: 'Deliver and integrate the customer information system with screen-pop for the contact centre.', managerId: 'p-brooks', initiativeIds: ['cis-I1'], btopp: 'T', budget: 3200000, actual: 0, forecast: 3200000, start: '2027-01-01', end: '2027-12-31', baselineEnd: '2027-12-31', status: 'green', gate: 'Design', capabilities: [{ id: 'cis-cap1', name: 'Single customer view with screen-pop' }], milestones: [{ name: 'Vendor selected', date: '2026-12-15', done: false }, { name: 'Pilot release', date: '2027-07-31', done: false }, { name: 'Full release', date: '2027-12-15', done: false }], estimates: [{ gate: 'Concept', cost: 2800000, months: 10, type: 'preliminary' }, { gate: 'Design', cost: 3200000, months: 12, type: 'refined' }] }),
    proj('cis-p2', 'Rep training', { sow: 'Train 220 reps in the new desktop (and, for path B, needs-based selling).', managerId: 'p-liu', initiativeIds: ['cis-I2', 'cis-I7'], btopp: 'P', budget: 420000, start: '2027-09-01', end: '2027-12-31', baselineEnd: '2027-12-31', gate: 'Concept' }),
    proj('cis-p3', 'Downstream process redesign', { sow: 'Remove re-keying from fulfilment; redesign query routing.', managerId: 'p-price', initiativeIds: ['cis-I3', 'cis-I5'], btopp: 'Pr', budget: 360000, start: '2027-04-01', end: '2027-12-31', baselineEnd: '2027-12-31', gate: 'Concept' }),
  ];
  p.costs = [
    cost('cis-c1', 'CIS platform build and integration', 'capital', 'T', '2027-01-01', 12, 3200000, 'once', { projectId: 'cis-p1', uncertainty: { low: -0.1, high: 0.45 } }),
    cost('cis-c2', 'Program definition and cross-sell pilot', 'capital', 'B', '2026-07-01', 6, 450000),
    cost('cis-c3', 'CIS licences and hosting', 'operating', 'T', '2027-07-01', 0, 380000, 'annual'),
    cost('cis-c4', 'Rep training', 'change', 'P', '2027-09-01', 4, 420000, 'once', { projectId: 'cis-p2' }),
    cost('cis-c5', 'Downstream process redesign', 'change', 'Pr', '2027-04-01', 9, 360000, 'once', { projectId: 'cis-p3', pathId: 'cis-pathA' }),
    cost('cis-c6', 'Reward scheme redesign', 'change', 'O', '2027-06-01', 6, 120000),
    cost('cis-c7', 'Severance and redeployment', 'change', 'O', '2028-01-01', 6, 900000, 'once', { pathId: 'cis-pathA', uncertainty: { low: -0.2, high: 0.3 } }),
    cost('cis-c8', 'Sales coaching and lead management', 'change', 'P', '2028-01-01', 6, 350000, 'once', { pathId: 'cis-pathB' }),
    cost('cis-c9', 'Sustaining upgrade (year 4)', 'sustaining', 'T', '2030-07-01', 6, 600000),
    cost('cis-c10', 'Change management and communications', 'change', 'P', '2026-10-01', 24, 480000),
    cost('cis-c11', 'Decommission legacy enquiry screens', 'decommissioning', 'T', '2028-04-01', 3, 150000),
  ];
  p.benefits = [
    ben('cis-b1', 'Operating costs of query handling decreased', 'cash', { category: 'Cost reduction', outcomeId: 'cis-O4', driverIds: ['d-cost'], areaId: 'a-cc', ownerId: 'p-raman', measureId: 'm-qcost', baseline: { value: 9800000, date: '2026-06-30', source: 'FY26 ledger' }, target: 6810000, unit: '$ per year', valuation: { driverName: 'Queries handled per year', driverValue: 1150000, coefficientName: 'Saving per query ($)', coefficient: 2.6, source: 'Telephony volumes FY26; activity-based costing', evidence: 'Benchmark from two peer insurers; time-and-motion study March 2026.' }, dependsOn: ['cis-p1', 'cis-p3'], profile: { lagMonths: 1, dipPct: 0.08, dipMonths: 3, plateaus: [{ after: 0, pct: 0.4 }, { after: 6, pct: 0.75 }, { after: 12, pct: 1 }], ramp: 'step', lifetimeYears: 8 }, attribution: 0.8, uncertainty: { low: -0.35, high: 0.1 }, mechanism: 'Faster calls (O2) let the contact centre handle the same volume with fewer reps (O3).' }),
    ben('cis-b2', 'New premium revenue increased', 'cash', { category: 'Revenue', outcomeId: 'cis-O7', driverIds: ['d-growth'], areaId: 'a-sales', ownerId: 'p-raman', measureId: 'm-prem', baseline: { value: 0, date: '2026-06-30', source: 'No cross-sell today' }, target: 2945000, unit: '$ per year', valuation: { driverName: 'Additional policies per year', driverValue: 9500, coefficientName: 'Annual margin per policy ($)', coefficient: 310, source: 'Product margin model', evidence: 'Assumes 6% phone conversion (pilot pending).' }, dependsOn: ['cis-p1', 'cis-p2'], profile: { lagMonths: 2, dipPct: 0, dipMonths: 0, plateaus: [{ after: 0, pct: 0.25 }, { after: 9, pct: 0.6 }, { after: 18, pct: 1 }], ramp: 'linear', lifetimeYears: 8 }, uncertainty: { low: -0.55, high: 0.25 }, mechanism: 'Reps use the single view to spot gaps in cover and offer suitable products.' }),
    ben('cis-b3', 'Customers processed per rep-hour increased', 'nonfinancial', { category: 'Productivity', outcomeId: 'cis-O2', driverIds: ['d-cost'], areaId: 'a-cc', ownerId: 'p-murphy', measureId: 'm-cph', baseline: { value: 9.5, date: '2026-06-30', source: 'Telephony platform' }, target: 12, unit: 'customers / rep-hour', dependsOn: ['cis-p1', 'cis-p2'], profile: { lagMonths: 0, dipPct: 0.1, dipMonths: 2, plateaus: [{ after: 0, pct: 0.5 }, { after: 6, pct: 1 }], lifetimeYears: 8 } }),
    ben('cis-b4', 'First-contact resolution increased', 'nonfinancial', { category: 'Customer experience', outcomeId: 'cis-O8', driverIds: ['d-cx'], areaId: 'a-cc', ownerId: 'p-murphy', measureId: 'm-fcr', baseline: { value: 68, date: '2026-06-30', source: 'Post-call survey' }, target: 82, unit: '%', dependsOn: ['cis-p1'], profile: { lagMonths: 1, plateaus: [{ after: 0, pct: 0.5 }, { after: 6, pct: 1 }], lifetimeYears: 8 } }),
    ben('cis-b5', 'Temporary productivity dip while reps learn the new desktop', 'nonfinancial', { disbenefit: true, category: 'Dis-benefit', areaId: 'a-cc', ownerId: 'p-murphy', measureId: 'm-cph', baseline: { value: 9.5 }, target: 8.6, unit: 'customers / rep-hour', mitigation: 'Phase go-live by team; floor-walkers for two weeks; defer the reward-scheme change until week 6.', dependsOn: ['cis-p1'], profile: { plateaus: [{ after: 0, pct: 1 }], lifetimeYears: 0.25 }, attribution: 0 }),
  ];
  p.stakeholders = [
    { id: 'cis-s1', name: 'Contact-centre service reps', areaId: 'a-cc', size: 220, role: 'Primary users; workforce reduces under path A', impact: 'high', share: 0.9, current: 'neutral', desired: 'proponent', influence: 'medium', ownerId: 'p-murphy', depth: 'cultural', breadth: 'group', changes: ['process', 'system', 'skills', 'rewards', 'role'], from: '2027-Q2', to: '2028-Q2', readiness: { other: 'no', culture: 'partial', rewards: 'no', info: 'partial', gainloss: 'no', leaders: 'yes' } },
    { id: 'cis-s2', name: 'Team leaders', areaId: 'a-cc', size: 24, role: 'Coach new ways of working', impact: 'high', share: 1, current: 'proponent', desired: 'proponent', influence: 'high', ownerId: 'p-murphy', depth: 'structural', breadth: 'group', changes: ['process', 'role'], from: '2027-Q2', to: '2028-Q1', readiness: { other: 'partial', culture: 'yes', rewards: 'partial', info: 'yes', gainloss: 'yes', leaders: 'yes' } },
    { id: 'cis-s3', name: 'Sales team', areaId: 'a-sales', size: 40, role: 'Receive leads (path B)', impact: 'medium', share: 0.5, current: 'proponent', desired: 'proponent', influence: 'medium', ownerId: 'p-adeyemi', depth: 'technical', breadth: 'group', changes: ['process'], from: '2027-Q4', to: '2028-Q2', readiness: {} },
    { id: 'cis-s4', name: 'Fulfilment operations', areaId: 'a-cc', size: 60, role: 'Downstream processes redesigned', impact: 'medium', share: 0.6, current: 'neutral', desired: 'proponent', influence: 'low', ownerId: 'p-price', depth: 'structural', breadth: 'group', changes: ['process', 'role'], from: '2027-Q2', to: '2027-Q4', readiness: {} },
    { id: 'cis-s5', name: 'Union delegates', areaId: 'a-people', size: 6, role: 'Consultation on workforce change', impact: 'high', share: 1, current: 'opposed', desired: 'neutral', influence: 'high', ownerId: 'p-grant', depth: 'cultural', breadth: 'individual', changes: ['role', 'rewards'], from: '2026-Q4', to: '2027-Q4', readiness: {} },
  ];
  p.comms = [
    { id: 'cis-k1', audience: 'cis-s1', purpose: 'Customers wait while we search seven systems; we can fix that and make every call easier.', picture: 'One screen with the customer’s whole story when the phone rings.', plan: 'Pilot team from July 2027; everyone trained by December 2027.', part: 'Help design the screens, join the pilot, and tell us what slows you down.', channel: 'Team huddles and intranet', date: '2026-11-15', ownerId: 'p-murphy', feedback: '' },
    { id: 'cis-k2', audience: 'cis-s5', purpose: 'Explain why the work model must change and the options being considered.', picture: 'A smaller, more skilled team with redeployment pathways.', plan: 'Formal consultation from November 2026.', part: 'Shape the redeployment and severance terms.', channel: 'Formal consultation meetings', date: '2026-11-01', ownerId: 'p-grant', feedback: 'Delegates asked for redeployment into the claims team to be explored first.' },
  ];
  p.log = [
    { id: 'cis-l1', type: 'risk', title: 'Vendor integration capacity constrained in 2027', detail: 'Preferred vendor also delivering for two other insurers.', ownerId: 'p-oneill', date: '2026-08-20', due: '2026-12-15', status: 'open', likelihood: 'medium', impact: 'high', level: 'program' },
    { id: 'cis-l2', type: 'risk', title: 'Industrial action over workforce change', detail: 'Linked to assumption A2.', ownerId: 'p-grant', date: '2026-08-20', status: 'open', likelihood: 'low', impact: 'high', level: 'vmo' },
    { id: 'cis-l3', type: 'decision', title: 'Path A selected for Commitment submission', detail: 'Path B kept as an option pending the cross-sell pilot.', ownerId: 'p-raman', date: '2026-08-12', status: 'closed', level: 'program' },
    { id: 'cis-l4', type: 'action', title: 'Run 8-week cross-sell pilot to test assumption A1', ownerId: 'p-adeyemi', date: '2026-09-01', due: '2026-11-10', status: 'open', level: 'program' },
    { id: 'cis-l5', type: 'issue', title: 'Marine policy system has no API', detail: 'Interim screen-scraping approved as managed non-conformance.', ownerId: 'p-hayes', date: '2026-07-28', status: 'closed', level: 'project' },
  ];
  p.gates = [
    gate('cis-g1', 'G1', '2026-05-20', dec('stay', '2026-05-20', 450000, 'Strong alignment to cost and experience drivers; sponsor committed. Fund definition and the cross-sell pilot only.', { conditions: 'Test assumption A1 before Commitment.', costLow: 5800000, costHigh: 10500000, valueCaseVersion: 1 })),
    gate('cis-g2', 'G2', '2026-11-25'),
  ];
  p.increments = [
    { id: 'cis-i1', name: 'Increment 1 — cross-sell pilot (20 reps)', start: '2026-09-01', end: '2026-11-10', expectedValue: 0, realisedValue: 0, quickWin: false, note: 'Learning increment: tests A1.' },
    { id: 'cis-i2', name: 'Increment 2 — screen-pop for top 5 call types', start: '2027-07-01', end: '2027-09-30', expectedValue: 180000, realisedValue: null, quickWin: true },
  ];
  p.demand = [{ roleId: 'r-data', from: '2027-Q1', to: '2027-Q4', fte: 2 }, { roleId: 'r-ba', from: '2026-Q3', to: '2027-Q4', fte: 3 }, { roleId: 'r-change', from: '2027-Q2', to: '2028-Q1', fte: 1.5 }];
  p.assessment = {
    alignment: { ratings: { 'd-cost': 4, 'd-growth': 2, 'd-cx': 3, 'd-resilience': 0, 'd-sustain': 0, 'd-data': 2, 'd-people': 2 }, basis: 'Delphi', assessor: 'Assessment panel (4)', date: '2026-08-28' },
    risk: { answers: riskAnswers({ right: 2.4, way: 2.6, well: 3, benefits: 3.4 }, 11), basis: 'Delphi', assessor: 'Assessment panel (4)', date: '2026-08-28', classification: null },
    delphi: { rounds: [
      { id: 'cis-r1', date: '2026-08-14', scores: [{ assessor: 'Assessor A', alignment: 62, risk: 58 }, { assessor: 'Assessor B', alignment: 71, risk: 44 }, { assessor: 'Assessor C', alignment: 55, risk: 61 }, { assessor: 'Assessor D', alignment: 68, risk: 50 }] },
      { id: 'cis-r2', date: '2026-08-28', scores: [{ assessor: 'Assessor A', alignment: 64, risk: 54 }, { assessor: 'Assessor B', alignment: 67, risk: 49 }, { assessor: 'Assessor C', alignment: 61, risk: 55 }, { assessor: 'Assessor D', alignment: 66, risk: 52 }] },
    ], consensus: 'Panel converged after two rounds; residual disagreement on delivery risk (vendor capacity).' },
    history: [{ date: '2026-05-20', gate: 'G1', alignment: 58, risk: 57 }],
  };
  p.simSettings = { ...SIM_DEFAULTS, customEvents: [
    { id: 'cis-e1', name: 'Vendor delivery slip', kind: 'delay', prob: 0.2, impact: 4 },
    { id: 'cis-e2', name: 'Integration rework', kind: 'cost', prob: 0.25, impact: 450000, month: '2027-09-01' },
  ] };
  p.acceptances = {
    'sponsor:prg-cis:p-raman': { acceptedAt: '2026-05-21T09:12:00Z', conditions: { mandate: 'met', authority: 'met', competence: 'met', resources: 'partly', lines: 'met', rights: 'met', measures: 'met', acceptance: 'met' } },
    'manager:prg-cis:p-oneill': { acceptedAt: '2026-05-22T10:00:00Z', conditions: {} },
    'outcome-owner:cis-O1:p-murphy': { acceptedAt: '2026-08-20T08:30:00Z', conditions: { mandate: 'met', authority: 'met', competence: 'met', resources: 'met', lines: 'met', rights: 'met', measures: 'met', acceptance: 'met' } },
    'outcome-owner:cis-O3:p-price': { conditions: { mandate: 'met', authority: 'partly', competence: 'met', resources: 'not', lines: 'met', rights: 'partly', measures: 'met', acceptance: 'partly' }, notes: 'Needs authority over workforce planning shared with HR.' },
    'benefit-owner:cis-b1:p-raman': { acceptedAt: '2026-08-21T11:00:00Z', conditions: {} },
  };
  return p;
}

function claims() {
  const pid = 'clm-';
  const p = program({
    id: 'prg-claims', code: 'PRG-002', name: 'Claims Digitisation', state: 'active', stateSince: '2025-11-18',
    categoryId: 'opportunity', portfolioId: 'pf-enterprise', sponsorId: 'p-raman', managerId: 'p-tan', analystId: 'p-karim', changeLeadId: 'p-liu',
    purpose: 'Digitise motor and home claims end to end so claims are finalised faster, at lower cost and with less leakage.',
    problem: 'Claims are handled on a 15-year-old platform with paper-based assessment; cycle times and leakage are above industry median.',
    scope: 'New claims platform, integration, assessor mobile tools, process redesign, team restructure and decommissioning of the legacy platform.',
    areas: ['a-claims', 'a-cc', 'a-tech'], driverIds: ['d-cost', 'd-cx', 'd-data'],
    startDate: '2026-01-01', endDate: '2028-03-31', costLow: 7800000, costHigh: 10200000, selection: 'selected', band: 'high',
    architecture: 'SaaS claims platform aligned to target architecture; depends on the cloud landing zone from the Data Centre Exit program.',
    designSteps: { benefits: 'done', scope: 'done', map: 'done', path: 'done', accountability: 'done', people: 'done', time: 'done', risk: 'done' },
  });
  p.chain = chain(pid, [
    ['I1', 'initiative', 'Implement digital claims platform', { btopp: ['T'], initType: 'Technology delivery', ownerId: 'p-brooks', importance: 'high', confidence: 'medium', progress: 45, projectId: 'clm-p1' }],
    ['I2', 'initiative', 'Redesign claims triage and assessment process', { btopp: ['Pr'], initType: 'Process redesign', ownerId: 'p-wong', importance: 'high', confidence: 'high', progress: 30, projectId: 'clm-p3' }],
    ['I3', 'initiative', 'Restructure claims teams around complexity', { btopp: ['O'], initType: 'Organisation design', ownerId: 'p-wong', importance: 'medium', confidence: 'medium', progress: 0 }],
    ['I4', 'initiative', 'Train assessors in mobile assessment', { btopp: ['P'], initType: 'Training', ownerId: 'p-liu', importance: 'medium', confidence: 'high', progress: 10, projectId: 'clm-p4', targetGroups: ['clm-s1'] }],
    ['O1', 'outcome', 'Straight-through processing of simple claims increased', { ownerId: 'p-wong', importance: 'high', confidence: 'medium', expected: 0, progress: 0 }],
    ['O2', 'outcome', 'Claim cycle time decreased', { final: true, ownerId: 'p-wong', driverIds: ['d-cx'], importance: 'high', confidence: 'medium' }],
    ['O3', 'outcome', 'Claims handling cost per claim decreased', { final: true, ownerId: 'p-raman', driverIds: ['d-cost'], importance: 'high', confidence: 'medium' }],
    ['O4', 'outcome', 'Claims leakage decreased', { final: true, ownerId: 'p-wong', driverIds: ['d-cost', 'd-data'], importance: 'medium', confidence: 'low', contingency: 'Commission an external leakage review in the first harvest year.' }],
    ['O5', 'outcome', 'Claimant NPS increased', { final: true, ownerId: 'p-wong', driverIds: ['d-cx'], importance: 'medium', confidence: 'medium' }],
    ['A1', 'assumption', 'Repairer network adopts digital quoting', { assumption: { category: 'external', sub: 'Market', monitorId: 'p-wong', test: 'Repairer onboarding rate', indicator: '≥ 70% of repairers quoting digitally by month 6', frequency: 'Monthly', status: 'holding', impact: 'Cycle-time and leakage benefits halve.', nextReview: '2026-08-31', probFalse: 0.2, simImpact: 0.4 } }],
    ['A2', 'assumption', 'Cloud landing zone available by Q1 2027', { assumption: { category: 'internal', sub: 'Dependency', monitorId: 'p-whitfield', test: 'Data Centre Exit milestone', indicator: 'Landing zone accepted', frequency: 'Fortnightly', status: 'at-risk', impact: 'Go-live slips one quarter.', nextReview: '2026-10-30', probFalse: 0.35, simImpact: 0.1 } }],
  ], 'I1>O1:high:1, I2>O1:high:2, O1>O2:high:3, O1>O3:high:3, I3>O3:medium:3, I4>O1:medium:1, O1>O4:medium:6, O2>O5:medium:3, A1>O2, A1>O4, A2>I1');
  p.projects = [
    proj('clm-p1', 'Claims platform', { sow: 'Configure and deploy the SaaS claims platform for motor and home.', managerId: 'p-brooks', initiativeIds: ['clm-I1'], btopp: 'T', budget: 4600000, actual: 2350000, forecast: 5150000, start: '2026-01-01', end: '2027-06-30', baselineEnd: '2027-06-30', forecastEnd: '2027-08-31', status: 'amber', gate: 'Execution', capabilities: [{ id: 'clm-cap1', name: 'Digital lodgement and triage' }, { id: 'clm-cap2', name: 'Mobile assessment' }], milestones: [{ name: 'Design complete', date: '2026-05-30', done: true }, { name: 'Motor release', date: '2027-03-31', done: false }, { name: 'Home release', date: '2027-08-31', done: false }], estimates: [{ gate: 'Concept', cost: 4100000, months: 16, type: 'preliminary' }, { gate: 'Design', cost: 4600000, months: 18, type: 'refined' }, { gate: 'Execution', cost: 4600000, months: 18, type: 'fixed price' }] }),
    proj('clm-p2', 'Integration with policy, finance and repairer systems', { managerId: 'p-brooks', initiativeIds: ['clm-I1'], btopp: 'T', budget: 900000, actual: 350000, forecast: 900000, start: '2026-04-01', end: '2027-03-31', baselineEnd: '2027-03-31', status: 'green', gate: 'Execution' }),
    proj('clm-p3', 'Claims process redesign', { managerId: 'p-wong', initiativeIds: ['clm-I2'], btopp: 'Pr', budget: 600000, actual: 210000, forecast: 600000, start: '2026-04-01', end: '2027-06-30', baselineEnd: '2027-06-30', status: 'green', gate: 'Execution' }),
    proj('clm-p4', 'Assessor training and change', { managerId: 'p-liu', initiativeIds: ['clm-I4'], btopp: 'P', budget: 850000, actual: 160000, forecast: 850000, start: '2026-07-01', end: '2027-12-31', baselineEnd: '2027-12-31', status: 'green', gate: 'Design' }),
  ];
  p.costs = [
    cost('clm-c1', 'Claims platform', 'capital', 'T', '2026-01-01', 18, 4600000, 'once', { projectId: 'clm-p1', uncertainty: { low: -0.05, high: 0.5 } }),
    cost('clm-c2', 'Integration', 'capital', 'T', '2026-04-01', 12, 900000, 'once', { projectId: 'clm-p2' }),
    cost('clm-c3', 'Platform subscription and support', 'operating', 'T', '2027-07-01', 0, 550000, 'annual'),
    cost('clm-c4', 'Assessor training and change', 'change', 'P', '2026-07-01', 18, 850000, 'once', { projectId: 'clm-p4' }),
    cost('clm-c5', 'Claims process redesign', 'change', 'Pr', '2026-04-01', 15, 600000, 'once', { projectId: 'clm-p3' }),
    cost('clm-c6', 'Team restructure', 'change', 'O', '2027-04-01', 6, 300000),
    cost('clm-c7', 'Decommission legacy claims platform', 'decommissioning', 'T', '2027-10-01', 4, 250000),
  ];
  p.benefits = [
    ben('clm-b1', 'Claims handling cost per claim decreased', 'cash', { category: 'Cost reduction', outcomeId: 'clm-O3', driverIds: ['d-cost'], areaId: 'a-claims', ownerId: 'p-raman', measureId: 'm-claimcost', baseline: { value: 112, date: '2025-06-30', source: 'FY25 ledger' }, target: 74, unit: '$ per claim', valuation: { driverName: 'Claims finalised per year', driverValue: 64000, coefficientName: 'Saving per claim ($)', coefficient: 38, source: 'Claims system FY25' }, dependsOn: ['clm-p1', 'clm-p3'], profile: { lagMonths: 2, dipPct: 0.1, dipMonths: 3, plateaus: [{ after: 0, pct: 0.5 }, { after: 6, pct: 0.8 }, { after: 12, pct: 1 }], lifetimeYears: 8 }, uncertainty: { low: -0.3, high: 0.1 }, mechanism: 'Straight-through processing of simple claims and complexity-based teams.' }),
    ben('clm-b2', 'Claims leakage decreased', 'cash', { category: 'Cost reduction', outcomeId: 'clm-O4', driverIds: ['d-cost', 'd-data'], areaId: 'a-claims', ownerId: 'p-wong', measureId: 'm-leakage', baseline: { value: 5200000, date: '2025-06-30', source: 'File review FY25' }, target: 4100000, unit: '$ per year', annualValue: 1100000, dependsOn: ['clm-p1'], profile: { lagMonths: 3, plateaus: [{ after: 0, pct: 0.3 }, { after: 9, pct: 0.7 }, { after: 18, pct: 1 }], ramp: 'linear', lifetimeYears: 8 }, uncertainty: { low: -0.5, high: 0.2 } }),
    ben('clm-b3', 'Claim cycle time decreased', 'nonfinancial', { category: 'Customer experience', outcomeId: 'clm-O2', driverIds: ['d-cx'], areaId: 'a-claims', ownerId: 'p-wong', measureId: 'm-cycle', baseline: { value: 14.5, date: '2025-06-30', source: 'Claims system' }, target: 6, unit: 'days', dependsOn: ['clm-p1'], profile: { lagMonths: 1, plateaus: [{ after: 0, pct: 0.5 }, { after: 6, pct: 1 }], lifetimeYears: 8 } }),
    ben('clm-b4', 'Claimant NPS increased', 'nonfinancial', { category: 'Customer experience', outcomeId: 'clm-O5', driverIds: ['d-cx'], areaId: 'a-claims', ownerId: 'p-wong', measureId: 'm-cnps', baseline: { value: 12, date: '2025-06-30', source: 'Post-claim survey' }, target: 30, unit: 'NPS points', dependsOn: ['clm-p1'], profile: { lagMonths: 3, plateaus: [{ after: 0, pct: 0.4 }, { after: 9, pct: 1 }], lifetimeYears: 8 } }),
    ben('clm-b5', 'Claims-related query handling cost decreased', 'cash', { category: 'Cost reduction', outcomeId: 'clm-O1', driverIds: ['d-cost'], areaId: 'a-cc', ownerId: 'p-murphy', measureId: 'm-qcost', baseline: { value: 9800000, date: '2025-06-30', source: 'FY25 ledger' }, annualValue: 420000, dependsOn: ['clm-p1'], profile: { lagMonths: 3, plateaus: [{ after: 0, pct: 1 }], lifetimeYears: 8 }, attribution: 0.25, mechanism: 'Fewer “where is my claim?” calls to the contact centre.' }),
  ];
  p.stakeholders = [
    { id: 'clm-s1', name: 'Claims assessors', areaId: 'a-claims', size: 140, role: 'Primary users', impact: 'high', share: 0.85, current: 'neutral', desired: 'proponent', influence: 'medium', ownerId: 'p-wong', depth: 'structural', breadth: 'group', changes: ['process', 'system', 'skills', 'role'], from: '2026-Q3', to: '2027-Q4', readiness: { other: 'partial', culture: 'yes', rewards: 'partial', info: 'yes', gainloss: 'partial', leaders: 'yes' } },
    { id: 'clm-s2', name: 'Contact-centre claims line', areaId: 'a-cc', size: 60, role: 'Fewer status calls; new triage scripts', impact: 'medium', share: 0.6, current: 'neutral', desired: 'proponent', influence: 'low', ownerId: 'p-murphy', depth: 'technical', breadth: 'group', changes: ['process', 'system'], from: '2027-Q1', to: '2027-Q4', readiness: {} },
    { id: 'clm-s3', name: 'Repairer network', areaId: 'a-claims', size: 320, role: 'External partners adopting digital quoting', impact: 'high', share: 0.4, current: 'neutral', desired: 'proponent', influence: 'high', ownerId: 'p-wong', depth: 'technical', breadth: 'external', changes: ['process', 'system'], from: '2027-Q1', to: '2027-Q3', readiness: {} },
  ];
  p.log = [
    { id: 'clm-l1', type: 'issue', title: 'Platform release slipped two months (vendor resourcing)', ownerId: 'p-tan', date: '2026-09-10', status: 'open', level: 'program', detail: 'Benefit profiles moved accordingly; cost forecast +12% on the platform project.' },
    { id: 'clm-l2', type: 'risk', title: 'Repairer onboarding slower than planned', ownerId: 'p-wong', date: '2026-06-02', status: 'open', likelihood: 'medium', impact: 'medium', level: 'program' },
    { id: 'clm-l3', type: 'change', title: 'Descope home contents mobile assessment to release 2', ownerId: 'p-tan', date: '2026-09-15', status: 'open', level: 'vmo', detail: 'Contains cost growth; value case update required (PRG-09).' },
  ];
  p.materialChangeAt = '2026-09-15';
  p.gates = [
    gate('clm-g1', 'G1', '2025-06-18', dec('stay', '2025-06-18', 380000, 'Clear cost and experience case; fund definition.', { costLow: 7000000, costHigh: 11000000, valueCaseVersion: 1 })),
    gate('clm-g2', 'G2', '2025-11-18', dec('conditions', '2025-11-18', 4200000, 'Benefits worth the lifecycle cost; risk acceptable with the landing-zone dependency managed.', { conditions: 'Release funding for the platform and process work to the motor release only. Report landing-zone status monthly.', costLow: 7800000, costHigh: 10200000, valueCaseVersion: 2 })),
    gate('clm-g3a', 'G3', '2027-03-31', null, { title: 'G3 Commissioning — motor release' }),
  ];
  p.statusReports = [
    { id: 'clm-r1', date: '2026-08-31', period: 'August 2026', delivery: 'amber', benefits: 'green', assumptions: 'amber', risks: 'amber', readiness: 'green', commentary: 'Vendor resourcing has slipped the motor release; recovery plan agreed. Benefit timing re-forecast by two months.' },
    { id: 'clm-r2', date: '2026-09-30', period: 'September 2026', delivery: 'amber', benefits: 'green', assumptions: 'amber', risks: 'amber', readiness: 'green', commentary: 'Descope of home contents mobile assessment proposed to contain cost.' },
  ];
  p.demand = [{ roleId: 'r-data', from: '2026-Q1', to: '2027-Q2', fte: 2 }, { roleId: 'r-ba', from: '2026-Q1', to: '2027-Q3', fte: 3 }, { roleId: 'r-change', from: '2026-Q3', to: '2027-Q4', fte: 1.5 }, { roleId: 'r-arch', from: '2026-Q1', to: '2026-Q4', fte: 0.5 }];
  p.assessment = {
    alignment: { ratings: { 'd-cost': 4, 'd-growth': 1, 'd-cx': 4, 'd-resilience': 1, 'd-sustain': 1, 'd-data': 3, 'd-people': 2 }, basis: 'assessor', assessor: 'Aisha Karim', date: '2025-11-04' },
    risk: { answers: riskAnswers({ right: 1.8, way: 2.4, well: 3.2, benefits: 2.6 }, 22), basis: 'assessor', assessor: 'Aisha Karim', date: '2025-11-04' },
    delphi: { rounds: [] }, history: [{ date: '2025-06-18', gate: 'G1', alignment: 68, risk: 46 }, { date: '2025-11-18', gate: 'G2', alignment: 72, risk: 42 }],
  };
  p.acceptances = {
    'sponsor:prg-claims:p-raman': { acceptedAt: '2025-06-20T09:00:00Z', conditions: {} },
    'manager:prg-claims:p-tan': { acceptedAt: '2025-06-25T09:00:00Z', conditions: {} },
    'outcome-owner:clm-O2:p-wong': { acceptedAt: '2025-11-10T09:00:00Z', conditions: {} },
    'benefit-owner:clm-b1:p-raman': { acceptedAt: '2025-11-10T09:00:00Z', conditions: {} },
    'benefit-owner:clm-b2:p-wong': { acceptedAt: '2025-11-10T09:00:00Z', conditions: {} },
  };
  return p;
}

function broker() {
  const pid = 'brk-';
  const p = program({
    id: 'prg-broker', code: 'PRG-003', name: 'Broker Portal Renewal', state: 'harvesting', stateSince: '2025-06-20',
    categoryId: 'opportunity', portfolioId: 'pf-enterprise', sponsorId: 'p-nguyen', managerId: 'p-oneill', analystId: 'p-karim',
    purpose: 'Make it easy for brokers to quote and bind commercial policies online, growing broker-submitted business and cutting underwriting rework.',
    scope: 'Broker portal, submission data standards, broker onboarding and underwriting process changes.',
    areas: ['a-sales', 'a-uw'], driverIds: ['d-growth', 'd-cx'], startDate: '2024-07-01', endDate: '2025-06-30', costLow: 2300000, costHigh: 2900000,
    selection: 'selected', band: 'medium', benchmark: true, reference: { risk: 38, alignment: 60 },
    designSteps: Object.fromEntries(['benefits', 'scope', 'map', 'path', 'accountability', 'people', 'time', 'risk'].map((k) => [k, 'done'])),
  });
  p.chain = chain(pid, [
    ['I1', 'initiative', 'Deliver broker quote-and-bind portal', { btopp: ['T'], initType: 'Technology delivery', ownerId: 'p-brooks', progress: 100 }],
    ['I2', 'initiative', 'Onboard and train brokers', { btopp: ['P'], initType: 'Training', ownerId: 'p-nguyen', progress: 100 }],
    ['I3', 'initiative', 'Introduce mandatory submission data standard', { btopp: ['Pr'], initType: 'Process redesign', ownerId: 'p-martin', progress: 100 }],
    ['O1', 'outcome', 'Complete broker submissions increased', { ownerId: 'p-martin', progress: 82, expected: 90 }],
    ['O2', 'outcome', 'Broker-submitted new business increased', { final: true, ownerId: 'p-nguyen', driverIds: ['d-growth'], progress: 71, expected: 85 }],
    ['O3', 'outcome', 'Underwriting rework decreased', { final: true, ownerId: 'p-martin', driverIds: ['d-cost'], progress: 95, expected: 90 }],
    ['O4', 'outcome', 'Broker satisfaction increased', { final: true, ownerId: 'p-nguyen', driverIds: ['d-cx'], progress: 70, expected: 80 }],
    ['A1', 'assumption', 'Competitor portals do not leapfrog ours within two years', { assumption: { category: 'external', sub: 'Market', monitorId: 'p-nguyen', indicator: 'Broker survey ranking', frequency: 'Six-monthly', status: 'at-risk', impact: 'Volume growth stalls.', nextReview: '2026-12-01', probFalse: 0.35, simImpact: 0.3 } }],
  ], 'I1>O1:high, I2>O1:medium, I3>O1:high, O1>O2:high:3, O1>O3:high:1, O1>O4:medium:3, A1>O2');
  p.projects = [proj('brk-p1', 'Broker portal', { managerId: 'p-brooks', initiativeIds: ['brk-I1'], btopp: 'T', budget: 1800000, actual: 1880000, forecast: 1880000, start: '2024-07-01', end: '2025-06-30', baselineEnd: '2025-06-30', acceptedDate: '2025-06-20', status: 'green', gate: 'Closed', state: 'complete', capabilities: [{ id: 'brk-cap1', name: 'Quote and bind online', accepted: '2025-06-20' }] })];
  p.costs = [
    cost('brk-c1', 'Broker portal build', 'capital', 'T', '2024-07-01', 12, 1880000, 'once', { projectId: 'brk-p1' }),
    cost('brk-c2', 'Broker onboarding', 'change', 'P', '2025-03-01', 6, 250000),
    cost('brk-c3', 'Submission process redesign', 'change', 'Pr', '2024-10-01', 9, 200000),
    cost('brk-c4', 'Portal hosting and support', 'operating', 'T', '2025-07-01', 0, 220000, 'annual'),
  ];
  p.benefits = [
    ben('brk-b1', 'Broker-submitted new business increased', 'cash', { category: 'Revenue', outcomeId: 'brk-O2', driverIds: ['d-growth'], areaId: 'a-sales', ownerId: 'p-nguyen', measureId: 'm-broker', baseline: { value: 0, date: '2024-06-30', source: 'Policy admin' }, unit: '$ per year', valuation: { driverName: 'Additional broker policies per year', driverValue: 3800, coefficientName: 'Annual margin per policy ($)', coefficient: 260 }, dependsOn: ['brk-p1'], profile: { lagMonths: 0, plateaus: [{ after: 0, pct: 0.5 }, { after: 6, pct: 0.8 }, { after: 12, pct: 1 }], lifetimeYears: 7 }, uncertainty: { low: -0.3, high: 0.15 } }),
    ben('brk-b2', 'Underwriting rework decreased', 'noncash', { category: 'Productivity', outcomeId: 'brk-O3', driverIds: ['d-cost'], areaId: 'a-uw', ownerId: 'p-martin', measureId: 'm-rework', baseline: { value: 0, date: '2024-06-30', source: 'Timesheets' }, unit: '$ per year', valuation: { driverName: 'Rework hours avoided per year', driverValue: 6500, coefficientName: 'Cost per underwriter hour ($)', coefficient: 85 }, dependsOn: ['brk-p1'], profile: { plateaus: [{ after: 0, pct: 0.6 }, { after: 6, pct: 1 }], lifetimeYears: 7 } }),
    ben('brk-b3', 'Broker satisfaction increased', 'nonfinancial', { category: 'Customer experience', outcomeId: 'brk-O4', driverIds: ['d-cx'], areaId: 'a-sales', ownerId: 'p-nguyen', measureId: 'm-bsat', baseline: { value: 6.1, date: '2024-06-30', source: 'Broker survey' }, target: 7.8, unit: 'score / 10', dependsOn: ['brk-p1'], profile: { plateaus: [{ after: 0, pct: 0.4 }, { after: 6, pct: 0.8 }, { after: 12, pct: 1 }], lifetimeYears: 7 } }),
  ];
  withActuals(p, 'brk-b1', '2025-Q3', '2026-Q3', [0.92, 0.88, 0.84, 0.82, 0.85]);
  withActuals(p, 'brk-b2', '2025-Q3', '2026-Q3', [1.04, 1.01, 0.98, 1.02, 1.03]);
  withActuals(p, 'brk-b3', '2025-Q3', '2026-Q3', [0.9, 0.85, 0.78, 0.74, 0.72]);
  p.benefits[0].reforecasts = [{ date: '2026-04-15', reason: 'Two competitors launched portals; volume growth slower. Plateau 3 moved out six months.', by: 'p-nguyen' }];
  p.gates = [
    gate('brk-g1', 'G1', '2024-04-10', dec('stay', '2024-04-10', 180000, 'Fund definition.')),
    gate('brk-g2', 'G2', '2024-06-26', dec('stay', '2024-06-26', 2350000, 'Committed.', { costLow: 2300000, costHigh: 2900000 })),
    gate('brk-g3', 'G3', '2025-06-20', dec('stay', '2025-06-20', 0, 'Portal accepted; brokers onboarded.')),
    gate('brk-br1', 'BR', '2026-04-15', dec('modify', '2026-04-15', 120000, 'Volume below forecast; competitors launched portals. Add broker incentive campaign; re-forecast plateau 3.', { conditions: 'Report broker volume monthly to the sponsor.' })),
    gate('brk-br2', 'BR', '2026-10-28'),
  ];
  p.log = [{ id: 'brk-l1', type: 'action', title: 'Broker incentive campaign (Q3–Q4 2026)', ownerId: 'p-nguyen', date: '2026-04-20', due: '2026-12-31', status: 'open', level: 'program' }];
  p.assessment = {
    alignment: { ratings: { 'd-cost': 2, 'd-growth': 3, 'd-cx': 3, 'd-resilience': 0, 'd-sustain': 0, 'd-data': 1, 'd-people': 1 }, basis: 'assessor', assessor: 'Aisha Karim', date: '2024-06-12' },
    risk: { answers: riskAnswers({ right: 2.2, way: 2.2, well: 2.4, benefits: 2.8 }, 33), basis: 'assessor', assessor: 'Aisha Karim', date: '2024-06-12' },
    delphi: { rounds: [] }, history: [{ date: '2024-06-26', gate: 'G2', alignment: 60, risk: 38 }],
  };
  p.stakeholders = [{ id: 'brk-s1', name: 'Commercial brokers', areaId: 'a-sales', size: 420, role: 'Portal users', impact: 'medium', share: 0.5, current: 'proponent', desired: 'proponent', influence: 'high', ownerId: 'p-nguyen', depth: 'technical', breadth: 'external', changes: ['process', 'system'], from: '2025-Q1', to: '2025-Q4', readiness: {} }];
  p.acceptances = { 'sponsor:prg-broker:p-nguyen': { acceptedAt: '2024-04-12T09:00:00Z', conditions: {} }, 'benefit-owner:brk-b1:p-nguyen': { acceptedAt: '2024-06-20T09:00:00Z', conditions: {} }, 'benefit-owner:brk-b2:p-martin': { acceptedAt: '2024-06-20T09:00:00Z', conditions: {} }, 'benefit-owner:brk-b3:p-nguyen': { acceptedAt: '2024-06-20T09:00:00Z', conditions: {} } };
  return p;
}

function resilience() {
  const pid = 'res-';
  const p = program({
    id: 'prg-resilience', code: 'PRG-004', name: 'Operational Resilience Uplift', state: 'active', stateSince: '2025-07-15',
    categoryId: 'mandatory', portfolioId: 'pf-enterprise', sponsorId: 'p-santos', managerId: 'p-tan', analystId: 'p-karim',
    purpose: 'Meet prudential expectations for operational risk management and resilience of critical operations.',
    scope: 'Critical operations mapping, tolerance setting, service-provider contract remediation and scenario testing.',
    areas: ['a-risk', 'a-tech', 'a-claims', 'a-cc'], driverIds: ['d-resilience'], startDate: '2025-07-01', endDate: '2027-06-30', costLow: 2400000, costHigh: 3100000,
    selection: 'selected', band: 'high',
    light: { 'Obligation reference': 'APRA Prudential Standard CPS 230 Operational Risk Management', 'Compliance deadline': '2027-06-30 (board-approved remediation plan)', 'Least-cost option': 'Remediate contracts at renewal where possible; reuse the existing risk system rather than buying a resilience tool.' },
  });
  p.chain = chain(pid, [
    ['I1', 'initiative', 'Map critical operations and set tolerance levels', { btopp: ['Pr'], initType: 'Process redesign', ownerId: 'p-santos', progress: 100 }],
    ['I2', 'initiative', 'Remediate material service-provider contracts', { btopp: ['B'], initType: 'Policy', ownerId: 'p-okafor', progress: 60 }],
    ['I3', 'initiative', 'Run severe-but-plausible scenario tests', { btopp: ['T', 'Pr'], initType: 'Process redesign', ownerId: 'p-whitfield', progress: 40 }],
    ['O1', 'outcome', 'Critical operations maintained within tolerance', { final: true, ownerId: 'p-santos', driverIds: ['d-resilience'], progress: 55, expected: 60 }],
    ['O2', 'outcome', 'Open regulatory findings eliminated', { final: true, ownerId: 'p-santos', driverIds: ['d-resilience'], progress: 50, expected: 60 }],
  ], 'I1>O1:high, I2>O2:high, I3>O1:high, I1>O2:medium');
  p.costs = [
    cost('res-c1', 'Resilience tooling and DR uplift', 'capital', 'T', '2025-07-01', 18, 1600000),
    cost('res-c2', 'Process mapping and testing', 'change', 'Pr', '2025-07-01', 18, 700000),
    cost('res-c3', 'Ongoing testing and monitoring', 'operating', 'T', '2027-01-01', 0, 200000, 'annual'),
  ];
  p.projects = [proj('res-p1', 'Resilience uplift', { managerId: 'p-brooks', btopp: 'T', budget: 2300000, actual: 1550000, forecast: 2350000, start: '2025-07-01', end: '2027-03-31', baselineEnd: '2027-03-31', status: 'green', gate: 'Execution' })];
  p.benefits = [
    ben('res-b1', 'Severity-1 outage minutes decreased', 'nonfinancial', { category: 'Resilience', outcomeId: 'res-O1', driverIds: ['d-resilience'], areaId: 'a-tech', ownerId: 'p-whitfield', measureId: 'm-outage', baseline: { value: 540, date: '2025-06-30', source: 'ITSM' }, target: 120, unit: 'minutes per year', profile: { startDate: '2026-01-01', plateaus: [{ after: 0, pct: 0.4 }, { after: 12, pct: 1 }], lifetimeYears: 8 } }),
    ben('res-b2', 'Open regulatory findings eliminated', 'nonfinancial', { category: 'Compliance', outcomeId: 'res-O2', driverIds: ['d-resilience'], areaId: 'a-risk', ownerId: 'p-santos', measureId: 'm-findings', baseline: { value: 6, date: '2025-06-30', source: 'Risk register' }, target: 0, unit: 'findings', profile: { startDate: '2026-01-01', plateaus: [{ after: 0, pct: 0.3 }, { after: 9, pct: 0.7 }, { after: 18, pct: 1 }], lifetimeYears: 8 } }),
  ];
  withActuals(p, 'res-b1', '2026-Q1', '2026-Q3', [0.9, 0.95, 1.0]);
  withActuals(p, 'res-b2', '2026-Q1', '2026-Q3', [1, 1, 0.9]);
  p.gates = [gate('res-g1', 'G1', '2025-06-25', dec('stay', '2025-06-25', 2400000, 'Mandatory: least-cost option approved under delegated authority.', { makers: 'CFO (delegated authority)', costLow: 2400000, costHigh: 3100000 })), gate('res-g3', 'G3', '2027-04-30')];
  p.assessment = { alignment: { ratings: { 'd-resilience': 4 }, basis: 'assessor' }, risk: { answers: riskAnswers({ right: 1.4, way: 2.2, well: 2.6, benefits: 1.8 }, 44), basis: 'assessor', assessor: 'Aisha Karim', date: '2025-06-20' }, delphi: { rounds: [] }, history: [] };
  p.demand = [{ roleId: 'r-arch', from: '2025-Q3', to: '2026-Q4', fte: 0.5 }];
  p.stakeholders = [{ id: 'res-s1', name: 'Critical operations owners', areaId: 'a-risk', size: 18, role: 'Own tolerances and testing', impact: 'medium', share: 1, current: 'proponent', desired: 'proponent', influence: 'high', ownerId: 'p-santos', depth: 'technical', breadth: 'group', changes: ['process'], from: '2025-Q3', to: '2027-Q2', readiness: {} }];
  p.acceptances = { 'sponsor:prg-resilience:p-santos': { acceptedAt: '2025-06-26T09:00:00Z', conditions: {} } };
  return p;
}

function dcExit() {
  const pid = 'dcx-';
  const p = program({
    id: 'prg-dcx', code: 'PRG-005', name: 'Data Centre Exit to Cloud', state: 'active', stateSince: '2025-09-10',
    categoryId: 'infrastructure', portfolioId: 'pf-enterprise', sponsorId: 'p-whitfield', managerId: 'p-oneill', analystId: 'p-karim',
    purpose: 'Exit the primary data centre before the lease ends, moving workloads to a secure cloud landing zone that other programs build on.',
    scope: 'Landing zone, workload migration, dual running, data centre decommissioning and operations team reskilling.',
    areas: ['a-tech'], driverIds: ['d-cost', 'd-sustain', 'd-resilience', 'd-data'], startDate: '2025-09-01', endDate: '2027-12-31', costLow: 9500000, costHigh: 12500000,
    selection: 'selected', band: 'medium',
    light: { 'Programs enabled': 'Claims Digitisation (landing zone), Pricing Analytics (data platform)', 'Architecture conformance': 'Implements the cloud target state (ADR-014).' },
  });
  p.chain = chain(pid, [
    ['I1', 'initiative', 'Build secure cloud landing zone', { btopp: ['T'], initType: 'Technology delivery', ownerId: 'p-hayes', progress: 80 }],
    ['I2', 'initiative', 'Migrate 140 workloads', { btopp: ['T'], initType: 'Technology delivery', ownerId: 'p-brooks', progress: 35 }],
    ['I3', 'initiative', 'Reskill operations team for cloud operations', { btopp: ['P'], initType: 'Training', ownerId: 'p-whitfield', progress: 25 }],
    ['O1', 'outcome', 'Landing zone available to other programs', { ownerId: 'p-hayes', progress: 80, expected: 100 }],
    ['O2', 'outcome', 'Data centre lease and power costs eliminated', { final: true, ownerId: 'p-whitfield', driverIds: ['d-cost', 'd-sustain'] }],
    ['O3', 'outcome', 'Recovery time for critical systems decreased', { final: true, ownerId: 'p-whitfield', driverIds: ['d-resilience'] }],
    ['O4', 'outcome', 'Hardware refresh eliminated', { final: true, ownerId: 'p-whitfield', driverIds: ['d-cost'] }],
  ], 'I1>O1:high, O1>I2:high, I2>O2:high:3, I2>O3:high:1, I2>O4:high, I3>O3:medium');
  p.projects = [proj('dcx-p1', 'Landing zone and migration', { managerId: 'p-brooks', btopp: 'T', budget: 5200000, actual: 2900000, forecast: 5400000, start: '2025-09-01', end: '2027-08-31', baselineEnd: '2027-06-30', forecastEnd: '2027-08-31', status: 'amber', gate: 'Execution', capabilities: [{ id: 'dcx-cap1', name: 'Landing zone' }, { id: 'dcx-cap2', name: 'Migrated workloads' }] })];
  p.costs = [
    cost('dcx-c1', 'Landing zone and migration', 'capital', 'T', '2025-09-01', 24, 5200000, 'once', { projectId: 'dcx-p1', uncertainty: { low: -0.05, high: 0.3 } }),
    cost('dcx-c2', 'Cloud consumption', 'operating', 'T', '2026-07-01', 0, 1400000, 'annual', { uncertainty: { low: -0.15, high: 0.35 } }),
    cost('dcx-c3', 'Dual running', 'operating', 'T', '2026-01-01', 18, 900000),
    cost('dcx-c4', 'Data centre decommissioning', 'decommissioning', 'T', '2027-07-01', 6, 600000),
    cost('dcx-c5', 'Operations reskilling', 'change', 'P', '2026-01-01', 12, 250000),
  ];
  p.benefits = [
    ben('dcx-b1', 'Data centre lease and power costs eliminated', 'cash', { category: 'Cost reduction', outcomeId: 'dcx-O2', driverIds: ['d-cost', 'd-sustain'], areaId: 'a-tech', ownerId: 'p-whitfield', measureId: 'm-dccost', baseline: { value: 2100000, date: '2025-06-30', source: 'Ledger' }, target: 0, unit: '$ per year', annualValue: 2100000, profile: { startDate: '2027-10-01', plateaus: [{ after: 0, pct: 1 }], lifetimeYears: 10 }, uncertainty: { low: -0.05, high: 0.05 } }),
    ben('dcx-b2', 'Hardware refresh avoided', 'cash', { category: 'Cost avoidance', outcomeId: 'dcx-O4', driverIds: ['d-cost'], areaId: 'a-tech', ownerId: 'p-whitfield', measureId: 'm-hwavoid', baseline: { value: 900000, date: '2025-06-30', source: 'Asset register' }, unit: '$ per year', annualValue: 900000, profile: { startDate: '2027-01-01', plateaus: [{ after: 0, pct: 1 }], lifetimeYears: 10 } }),
    ben('dcx-b3', 'Recovery time for critical systems decreased', 'nonfinancial', { category: 'Resilience', outcomeId: 'dcx-O3', driverIds: ['d-resilience'], areaId: 'a-tech', ownerId: 'p-whitfield', measureId: 'm-rto', baseline: { value: 24, date: '2025-06-30', source: 'DR test' }, target: 4, unit: 'hours', dependsOn: ['dcx-p1'], profile: { plateaus: [{ after: 0, pct: 1 }], lifetimeYears: 10 } }),
  ];
  p.gates = [
    gate('dcx-g1', 'G1', '2025-08-20', dec('stay', '2025-08-20', 5600000, 'Infrastructure enabling two business programs; lease exit date is fixed.', { costLow: 9500000, costHigh: 12500000 })),
    gate('dcx-g3', 'G3', '2027-09-15'),
  ];
  p.valueCasesStale = true;
  p.demand = [{ roleId: 'r-data', from: '2025-Q4', to: '2027-Q2', fte: 2 }, { roleId: 'r-arch', from: '2025-Q3', to: '2027-Q2', fte: 1 }];
  p.assessment = { alignment: { ratings: { 'd-cost': 3, 'd-sustain': 3, 'd-resilience': 3, 'd-data': 2, 'd-people': 1 }, basis: 'assessor' }, risk: { answers: riskAnswers({ right: 1.6, way: 2, well: 3.4, benefits: 1.8 }, 55), basis: 'assessor', assessor: 'Aisha Karim', date: '2025-08-10' }, delphi: { rounds: [] }, history: [] };
  p.stakeholders = [{ id: 'dcx-s1', name: 'Infrastructure operations team', areaId: 'a-tech', size: 35, role: 'Run cloud operations', impact: 'high', share: 1, current: 'neutral', desired: 'proponent', influence: 'medium', ownerId: 'p-whitfield', depth: 'structural', breadth: 'group', changes: ['skills', 'role', 'process'], from: '2026-Q1', to: '2027-Q4', readiness: {} }];
  p.acceptances = { 'sponsor:prg-dcx:p-whitfield': { acceptedAt: '2025-08-21T09:00:00Z', conditions: {} } };
  return p;
}

function pricing() {
  const pid = 'prc-';
  const p = program({
    id: 'prg-pricing', code: 'PRG-006', name: 'Pricing Analytics and AI-assisted Underwriting', state: 'waiting-list', stateSince: '2026-08-20',
    categoryId: 'opportunity', portfolioId: 'pf-enterprise', sponsorId: 'p-martin', managerId: 'p-tan', analystId: 'p-karim',
    purpose: 'Improve risk selection and pricing with modern analytics and AI-assisted triage, lowering the loss ratio and speeding up quotes.',
    scope: 'Pricing models, data platform, underwriting triage, model risk governance and underwriter capability.',
    areas: ['a-uw', 'a-risk', 'a-tech'], driverIds: ['d-growth', 'd-data'], startDate: '2027-01-01', endDate: '2028-06-30', costLow: 5200000, costHigh: 7600000,
    selection: 'queued', waitRank: 1, band: 'high',
  });
  p.chain = chain(pid, [
    ['I1', 'initiative', 'Build pricing data platform and models', { btopp: ['T'], initType: 'Technology delivery', ownerId: 'p-hayes', importance: 'high', confidence: 'medium' }],
    ['I2', 'initiative', 'Introduce AI-assisted underwriting triage', { btopp: ['T', 'Pr'], initType: 'Technology delivery', ownerId: 'p-martin', importance: 'high', confidence: 'medium' }],
    ['I3', 'initiative', 'Establish model risk governance', { btopp: ['O'], initType: 'Policy', ownerId: 'p-santos', importance: 'medium', confidence: 'high' }],
    ['I4', 'initiative', 'Upskill underwriters in data-driven pricing', { btopp: ['P'], initType: 'Training', ownerId: 'p-martin', importance: 'medium', confidence: 'medium' }],
    ['O1', 'outcome', 'Pricing accuracy increased', { ownerId: 'p-martin' }],
    ['O2', 'outcome', 'Loss ratio decreased', { final: true, ownerId: 'p-martin', driverIds: ['d-growth'] }],
    ['O3', 'outcome', 'Quote turnaround time decreased', { final: true, ownerId: 'p-martin', driverIds: ['d-cx'] }],
    ['O4', 'outcome', 'Underwriter capacity increased', { ownerId: 'p-martin', final: true, driverIds: ['d-data'] }],
    ['A1', 'assumption', 'Historical data quality sufficient for model training', { assumption: { category: 'internal', sub: 'Data', monitorId: 'p-hayes', indicator: 'Data quality score ≥ 85%', frequency: 'Monthly', status: 'at-risk', impact: 'Model accuracy and loss-ratio benefit fall sharply.', nextReview: '2026-11-30', probFalse: 0.35, simImpact: 0.5 } }],
    ['A2', 'assumption', 'Regulators accept AI-assisted pricing with explainability controls', { assumption: { category: 'external', sub: 'Regulation', monitorId: 'p-santos', indicator: 'Regulatory guidance and peer experience', frequency: 'Quarterly', status: 'holding', impact: 'AI triage limited to advisory use.', nextReview: '2026-12-31', probFalse: 0.15, simImpact: 0.3 } }],
  ], 'I1>O1:high:3, I3>O1:medium, I4>O1:medium, O1>O2:high:6, I2>O3:high:2, I2>O4:high:2, A1>O1, A2>I2');
  p.costs = [
    cost('prc-c1', 'Pricing models and data platform', 'capital', 'T', '2027-01-01', 12, 2400000, 'once', { uncertainty: { low: -0.1, high: 0.5 } }),
    cost('prc-c2', 'AI triage build', 'capital', 'T', '2027-01-01', 9, 800000),
    cost('prc-c3', 'Platform and model operations', 'operating', 'T', '2027-10-01', 0, 600000, 'annual'),
    cost('prc-c4', 'Underwriter upskilling', 'change', 'P', '2027-04-01', 12, 450000),
    cost('prc-c5', 'Model risk governance', 'change', 'O', '2027-01-01', 6, 150000),
  ];
  p.benefits = [
    ben('prc-b1', 'Loss ratio decreased', 'cash', { category: 'Margin', outcomeId: 'prc-O2', driverIds: ['d-growth'], areaId: 'a-uw', ownerId: 'p-martin', measureId: 'm-loss', baseline: { value: 0, date: '2026-06-30', source: 'Actuarial review' }, unit: '$ per year', valuation: { driverName: 'Gross written premium in scope ($)', driverValue: 420000000, coefficientName: 'Loss-ratio improvement', coefficient: 0.006, source: 'Pricing review 2026', evidence: 'Peer results range 0.3–1.0 points.' }, profile: { startDate: '2028-01-01', plateaus: [{ after: 0, pct: 0.3 }, { after: 6, pct: 0.6 }, { after: 12, pct: 1 }], ramp: 'linear', lifetimeYears: 7 }, uncertainty: { low: -0.6, high: 0.3 } }),
    ben('prc-b2', 'Underwriter capacity released', 'noncash', { category: 'Productivity', outcomeId: 'prc-O4', driverIds: ['d-data'], areaId: 'a-uw', ownerId: 'p-martin', measureId: 'm-uwcap', baseline: { value: 0 }, unit: '$ per year', valuation: { driverName: 'Underwriter hours released', driverValue: 9000, coefficientName: 'Cost per hour ($)', coefficient: 95 }, profile: { startDate: '2027-10-01', plateaus: [{ after: 0, pct: 0.5 }, { after: 6, pct: 1 }], lifetimeYears: 7 } }),
    ben('prc-b3', 'Quote turnaround time decreased', 'nonfinancial', { category: 'Customer experience', outcomeId: 'prc-O3', driverIds: ['d-cx'], areaId: 'a-uw', ownerId: 'p-martin', measureId: 'm-quote', baseline: { value: 3, date: '2026-06-30', source: 'Workflow' }, target: 0.5, unit: 'days', profile: { startDate: '2027-10-01', plateaus: [{ after: 0, pct: 1 }], lifetimeYears: 7 } }),
  ];
  p.gates = [gate('prc-g1', 'G1', '2026-03-18', dec('stay', '2026-03-18', 300000, 'Strong strategic fit; define fully.', { costLow: 5200000, costHigh: 7600000 })), gate('prc-g2', 'G2', '2027-01-20')];
  p.demand = [{ roleId: 'r-data', from: '2027-Q1', to: '2027-Q4', fte: 3 }, { roleId: 'r-arch', from: '2027-Q1', to: '2027-Q2', fte: 0.5 }];
  p.assessment = {
    alignment: { ratings: { 'd-cost': 1, 'd-growth': 4, 'd-cx': 2, 'd-data': 4, 'd-people': 2 }, basis: 'Delphi', assessor: 'Assessment panel (3)', date: '2026-08-10' },
    risk: { answers: riskAnswers({ right: 2.6, way: 3.2, well: 3.6, benefits: 3.4 }, 66), basis: 'Delphi', assessor: 'Assessment panel (3)', date: '2026-08-10', classification: 'inherent' },
    delphi: { rounds: [{ id: 'prc-r1', date: '2026-08-10', scores: [{ assessor: 'Assessor A', alignment: 72, risk: 66 }, { assessor: 'Assessor B', alignment: 78, risk: 58 }, { assessor: 'Assessor C', alignment: 69, risk: 71 }] }], consensus: '' },
    history: [{ date: '2026-03-18', gate: 'G1', alignment: 70, risk: 62 }],
  };
  p.acceptances = { 'sponsor:prg-pricing:p-martin': { acceptedAt: '2026-03-19T09:00:00Z', conditions: {} } };
  return p;
}

function workplace() {
  const pid = 'wpm-';
  const p = program({
    id: 'prg-workplace', code: 'PRG-007', name: 'Workplace Modernisation', state: 'completed', stateSince: '2025-11-12',
    categoryId: 'sustain', portfolioId: 'pf-enterprise', sponsorId: 'p-okafor', managerId: 'p-oneill', analystId: 'p-karim',
    purpose: 'Replace end-of-life desktops and collaboration tools on the four-year lifecycle policy.',
    scope: 'Device refresh, collaboration suite, self-service support and digital skills.', areas: ['a-people', 'a-tech'], driverIds: ['d-people', 'd-cost'],
    startDate: '2023-10-01', endDate: '2025-09-30', costLow: 2300000, costHigh: 2700000, selection: 'selected', band: 'medium', benchmark: true, reference: { risk: 25, alignment: 45 },
    light: { Asset: '1,450 end-user devices', 'Lifecycle policy': 'Four-year refresh', 'Consequence of deferral': 'Out-of-support operating system from October 2025; rising support cost.' },
    completion: { date: '2025-11-12', handoverNote: 'Benefits handed to the Head of Technology Operations and People and Culture.', postHandoverUntil: '2026-11-30' },
  });
  p.chain = chain(pid, [
    ['I1', 'initiative', 'Refresh devices and collaboration suite', { btopp: ['T'], ownerId: 'p-brooks', progress: 100 }],
    ['I2', 'initiative', 'Digital skills program for staff', { btopp: ['P'], ownerId: 'p-grant', progress: 100 }],
    ['O1', 'outcome', 'Desktop support cost decreased', { final: true, ownerId: 'p-whitfield', driverIds: ['d-cost'], progress: 98, expected: 100 }],
    ['O2', 'outcome', 'Digital employee experience increased', { final: true, ownerId: 'p-grant', driverIds: ['d-people'], progress: 88, expected: 100 }],
  ], 'I1>O1:high, I1>O2:medium, I2>O2:high');
  p.projects = [proj('wpm-p1', 'Device refresh', { btopp: 'T', budget: 2100000, actual: 2060000, forecast: 2060000, start: '2023-10-01', end: '2024-12-31', baselineEnd: '2024-12-31', acceptedDate: '2024-12-20', status: 'green', gate: 'Closed', state: 'complete' })];
  p.costs = [
    cost('wpm-c1', 'Device refresh and collaboration suite', 'capital', 'T', '2023-10-01', 15, 2060000),
    cost('wpm-c2', 'Digital skills program', 'change', 'P', '2024-04-01', 9, 300000),
    cost('wpm-c3', 'Collaboration suite licences (incremental)', 'operating', 'T', '2025-01-01', 48, 150000, 'annual'),
  ];
  p.benefits = [
    ben('wpm-b1', 'Desktop support cost decreased', 'cash', { category: 'Cost reduction', outcomeId: 'wpm-O1', driverIds: ['d-cost'], areaId: 'a-tech', ownerId: 'p-whitfield', operationalOwnerId: 'p-whitfield', bau: true, measureId: 'm-desk', baseline: { value: 1900000, date: '2023-06-30', source: 'Ledger' }, target: 1250000, unit: '$ per year', annualValue: 650000, profile: { startDate: '2025-01-01', plateaus: [{ after: 0, pct: 0.7 }, { after: 6, pct: 1 }], lifetimeYears: 4 } }),
    ben('wpm-b2', 'Time lost to device issues decreased', 'noncash', { category: 'Productivity', outcomeId: 'wpm-O2', driverIds: ['d-people'], areaId: 'a-people', ownerId: 'p-grant', operationalOwnerId: 'p-grant', bau: true, measureId: 'm-lost', baseline: { value: 0 }, unit: '$ per year', annualValue: 400000, profile: { startDate: '2025-01-01', plateaus: [{ after: 0, pct: 1 }], lifetimeYears: 4 } }),
    ben('wpm-b3', 'Digital employee experience score increased', 'nonfinancial', { category: 'Workforce', outcomeId: 'wpm-O2', driverIds: ['d-people'], areaId: 'a-people', ownerId: 'p-grant', operationalOwnerId: 'p-grant', bau: true, measureId: 'm-dex', baseline: { value: 58, date: '2023-06-30', source: 'Pulse survey' }, target: 75, unit: 'score / 100', profile: { startDate: '2025-01-01', plateaus: [{ after: 0, pct: 0.6 }, { after: 6, pct: 1 }], lifetimeYears: 4 } }),
  ];
  withActuals(p, 'wpm-b1', '2025-Q1', '2026-Q3', [0.95, 0.98, 1.02, 1.0, 1.03, 0.99, 1.01]);
  withActuals(p, 'wpm-b2', '2025-Q1', '2026-Q3', [0.8, 0.9, 0.95, 0.93, 0.97, 0.96, 0.98]);
  withActuals(p, 'wpm-b3', '2025-Q1', '2026-Q3', [0.7, 0.82, 0.86, 0.88, 0.9, 0.91, 0.9]);
  p.gates = [
    gate('wpm-g1', 'G1', '2023-08-15', dec('stay', '2023-08-15', 2460000, 'Sustain: lifecycle policy compliance.', { makers: 'CFO (delegated authority)' })),
    gate('wpm-g3', 'G3', '2024-12-20', dec('stay', '2024-12-20', 0, 'Devices deployed; support model live.')),
    gate('wpm-g4', 'G4', '2025-11-12', dec('stay', '2025-11-12', 0, 'Completion approved; post-handover tracking for 12 months.')),
  ];
  p.assessment = { alignment: { ratings: { 'd-cost': 2, 'd-people': 3, 'd-sustain': 1 }, basis: 'assessor' }, risk: { answers: riskAnswers({ right: 1.4, way: 1.8, well: 2, benefits: 1.8 }, 77), basis: 'assessor' }, delphi: { rounds: [] }, history: [] };
  p.acceptances = Object.fromEntries(p.benefits.flatMap((b) => [[`operational-owner:${b.id}:${b.operationalOwnerId}`, { acceptedAt: '2025-11-10T09:00:00Z', conditions: {} }], [`benefit-owner:${b.id}:${b.ownerId}`, { acceptedAt: '2023-08-20T09:00:00Z', conditions: {} }]]));
  p.acceptances['sponsor:prg-workplace:p-okafor'] = { acceptedAt: '2023-08-16T09:00:00Z', conditions: {} };
  return p;
}

function policyAdmin() {
  const p = program({
    id: 'prg-pas', code: 'PRG-008', name: 'Legacy Policy Administration Replacement', state: 'withdrawn', stateSince: '2026-02-26',
    categoryId: 'opportunity', portfolioId: 'pf-enterprise', sponsorId: 'p-martin', managerId: 'p-tan', analystId: 'p-karim',
    purpose: 'Replace the commercial lines policy administration system.', scope: 'Policy administration platform, product rebuild and data migration.',
    areas: ['a-uw', 'a-tech'], driverIds: ['d-growth', 'd-data'], startDate: '2025-10-01', endDate: '2028-06-30', costLow: 11000000, costHigh: 17500000, selection: 'not-selected', band: 'low',
    withdrawal: { date: '2026-02-26', reason: 'Re-estimation at Commitment raised lifetime cost by 45% and the vendor roadmap no longer met product requirements. Prospective value fell below zero.', valueRealised: 'Product rules catalogue and data-cleansing scripts reused by the Pricing Analytics program.', salvage: 'Data-cleansing assets; product rules catalogue.', released: 4200000, lessons: 'Validate vendor roadmaps with reference sites before Initiation.' },
  });
  p.costs = [cost('pas-c1', 'Platform and migration', 'capital', 'T', '2025-10-01', 30, 12500000, 'once'), cost('pas-c2', 'Operating', 'operating', 'T', '2028-07-01', 0, 1100000, 'annual')];
  p.benefits = [ben('pas-b1', 'Product launch time decreased', 'noncash', { annualValue: 1600000, ownerId: 'p-martin', profile: { startDate: '2028-07-01', plateaus: [{ after: 0, pct: 1 }], lifetimeYears: 8 } })];
  p.chain = chain('pas-', [['I1', 'initiative', 'Replace policy administration platform', { btopp: ['T'] }], ['O1', 'outcome', 'Product launch time decreased', { final: true, driverIds: ['d-growth'] }]], 'I1>O1:high');
  p.gates = [
    gate('pas-g1', 'G1', '2025-09-24', dec('stay', '2025-09-24', 900000, 'Explore replacement options.')),
    gate('pas-g2', 'G2', '2026-02-26', dec('withdraw', '2026-02-26', 0, 'Prospective value below zero after re-estimation; vendor roadmap mismatch. $4.2m returned to the business-opportunity pool. Recorded as a governance success.', { conditions: '' })),
  ];
  p.assessment = { alignment: { ratings: { 'd-growth': 2, 'd-data': 2 }, basis: 'assessor' }, risk: { answers: riskAnswers({ right: 3, way: 3.6, well: 4.2, benefits: 3.4 }, 88), basis: 'assessor' }, delphi: { rounds: [] }, history: [] };
  return p;
}

// ---- Workspace -----------------------------------------------------------------------
export function demoWorkspace() {
  const programs = [cis(), claims(), broker(), resilience(), dcExit(), pricing(), workplace(), policyAdmin()];
  // Value cases with snapshots of the figures at the time.
  const vc = (p, version, gateId, createdAt, status, extra = {}) => ({ id: `${p.id}-vc${version}`, version, gate: gateId, createdAt, status, narrative: {}, reviewCycles: extra.reviewCycles ?? 1, reviewComments: extra.reviewComments || [], figures: extra.figures || null, lockedAt: status === 'locked' ? createdAt : null, author: 'p-karim' });
  const byId = Object.fromEntries(programs.map((p) => [p.id, p]));
  byId['prg-cis'].valueCases = [
    vc(byId['prg-cis'], 1, 'G1', '2026-05-12T09:00:00Z', 'locked', { figures: { npv: 4100000, costLow: 5800000, costHigh: 10500000, alignment: 58, risk: 57 } }),
    vc(byId['prg-cis'], 2, 'G2', '2026-09-30T09:00:00Z', 'in-review', { reviewCycles: 2, reviewComments: [{ date: '2026-10-06', by: 'p-lindqvist', text: 'Show path B as an option with the pilot results; strengthen the people section for the union consultation.' }] }),
  ];
  byId['prg-claims'].valueCases = [vc(byId['prg-claims'], 1, 'G1', '2025-06-05T09:00:00Z', 'locked'), vc(byId['prg-claims'], 2, 'G2', '2025-11-04T09:00:00Z', 'locked')];
  byId['prg-broker'].valueCases = [vc(byId['prg-broker'], 1, 'G2', '2024-06-12T09:00:00Z', 'locked'), vc(byId['prg-broker'], 2, 'BR', '2026-04-08T09:00:00Z', 'locked')];
  byId['prg-dcx'].valueCases = [vc(byId['prg-dcx'], 1, 'G1', '2025-08-08T09:00:00Z', 'locked')];
  byId['prg-pricing'].valueCases = [vc(byId['prg-pricing'], 1, 'G1', '2026-03-05T09:00:00Z', 'locked'), vc(byId['prg-pricing'], 2, 'G2', '2026-08-15T09:00:00Z', 'draft', { reviewCycles: 4, reviewComments: [{ date: '2026-08-30', by: 'p-lindqvist', text: 'Loss-ratio estimate still rests on one peer study.' }, { date: '2026-09-21', by: 'p-okafor', text: 'Need a downside case at 0.3 points.' }] })];
  byId['prg-workplace'].valueCases = [vc(byId['prg-workplace'], 1, 'G1', '2023-08-01T09:00:00Z', 'locked')];
  byId['prg-pas'].valueCases = [vc(byId['prg-pas'], 1, 'G1', '2025-09-10T09:00:00Z', 'locked'), vc(byId['prg-pas'], 2, 'G2', '2026-02-10T09:00:00Z', 'locked')];

  const rng = mulberry32(7);
  const maturity = [];
  for (const [date, lift] of [['2025-10-15', 0], ['2026-08-20', 0.55]]) {
    for (let i = 0; i < 8; i++) {
      const answers = {};
      MATURITY.forEach((g) => g.items.forEach((_, k) => {
        const base = { right: 3.1, way: 2.6, well: 2.9, benefits: 2.2 }[g.are];
        answers[`${g.are}-${k}`] = Math.max(1, Math.min(5, Math.round(base + lift + (rng() - 0.5) * 2)));
      }));
      maturity.push({ id: `mat-${date}-${i}`, date, role: ['IDB member', 'Business sponsor', 'Program manager', 'Value analyst', 'Project manager', 'Outcome owner', 'Finance analyst', 'Contributor'][i], unitId: AREAS[i % AREAS.length].id, answers });
    }
  }

  return {
    id: 'demo', name: 'Harbourline Mutual', kind: 'demo', createdAt: '2026-10-14T00:00:00Z', version: 1,
    settings: { ...DEFAULT_SETTINGS, orgName: 'Harbourline Mutual' },
    currentUser: 'p-lindqvist',
    people: PEOPLE, areas: AREAS, drivers: DRIVERS,
    strategyVersions: [{ id: 'sv-1', date: '2025-07-01', label: 'Strategy 2025–2028 (v1)', drivers: DRIVERS, typeWeights: DEFAULT_SETTINGS.typeWeights }],
    categories: DEFAULT_CATEGORIES,
    portfolios: [{ id: 'pf-enterprise', name: 'Enterprise portfolio', board: 'Investment Decision Board', parentId: null, riskAppetite: 'No more than 30% of discretionary funding in programs with overall risk above 65. Portfolio expected NPV must remain positive at P10.' }],
    allocations: [
      { id: 'al-1', fy: 2027, categoryId: 'opportunity', amount: 9000000 }, { id: 'al-2', fy: 2027, categoryId: 'mandatory', amount: 1800000 },
      { id: 'al-3', fy: 2027, categoryId: 'sustain', amount: 1500000 }, { id: 'al-4', fy: 2027, categoryId: 'infrastructure', amount: 4500000 },
      { id: 'al-5', fy: 2027, categoryId: 'growth', amount: 1200000 }, { id: 'al-6', fy: 2027, categoryId: 'rnd', amount: 600000 },
      { id: 'al-7', fy: 2027, categoryId: 'mandated', amount: 400000 }, { id: 'al-8', fy: 2027, categoryId: 'committed', amount: 0 },
    ],
    reserve: { 2027: 1200000 },
    measures: MEASURES,
    programs,
    ideas: [
      { id: 'idea-1', title: 'Self-service claims lodgement app', problem: 'Customers want to lodge simple claims from their phone at any time.', outcome: 'Claim cycle time decreased and contact-centre claims calls decreased', areas: ['a-claims', 'a-cc'], costLow: 400000, costHigh: 900000, proposer: 'p-wong', category: 'opportunity', status: 'new', createdAt: '2026-10-02', reason: '', analystId: null, driverIds: ['d-cx'] },
      { id: 'idea-2', title: 'Telematics-based motor pricing', problem: 'Usage-based pricing could attract low-risk drivers.', outcome: 'Loss ratio decreased for motor', areas: ['a-uw'], costLow: 1500000, costHigh: 3000000, proposer: 'p-martin', category: 'rnd', status: 'returned', createdAt: '2026-07-14', reason: 'Clarify how this relates to the Pricing Analytics program on the waiting list, and the data partnership needed.', analystId: 'p-karim', driverIds: ['d-growth', 'd-data'] },
      { id: 'idea-3', title: 'Automate reinsurance bordereaux reconciliation', problem: 'Finance spends 3 FTE reconciling bordereaux manually each quarter.', outcome: 'Reconciliation effort decreased', areas: ['a-fin'], costLow: 250000, costHigh: 450000, proposer: 'p-kowalski', category: 'growth', status: 'new', createdAt: '2026-09-22', reason: '', analystId: null, driverIds: ['d-cost'] },
      { id: 'idea-4', title: 'Privacy reform readiness', problem: 'Proposed privacy reforms require changes to consent, retention and individual rights processes.', outcome: 'Privacy obligations maintained under the reformed law', areas: ['a-risk', 'a-tech'], costLow: 600000, costHigh: 1200000, proposer: 'p-santos', category: 'mandatory', status: 'accepted', createdAt: '2026-08-05', reason: 'Accepted into concept definition; lightweight mandatory path.', analystId: 'p-karim', driverIds: ['d-resilience'] },
      { id: 'idea-5', title: 'Chatbot for policy queries', problem: 'Simple policy queries tie up reps.', outcome: 'Query handling cost decreased', areas: ['a-cc'], costLow: 300000, costHigh: 600000, proposer: 'p-price', category: 'opportunity', status: 'declined', createdAt: '2026-06-30', reason: 'Overlaps the Customer Information System (path A). Revisit after CIS commissioning.', analystId: 'p-karim', driverIds: ['d-cost'] },
    ],
    dependencies: [
      { id: 'dep-1', type: 'sequential', from: 'prg-dcx', to: 'prg-claims', description: 'Claims platform needs the cloud landing zone.', severity: 'high', ownerId: 'p-whitfield', resolution: 'Landing-zone milestone tracked fortnightly; interim hosting option costed.' },
      { id: 'dep-2', type: 'sequential', from: 'prg-dcx', to: 'prg-pricing', description: 'Pricing data platform runs in the landing zone.', severity: 'medium', ownerId: 'p-hayes', resolution: '' },
      { id: 'dep-3', type: 'overlap', from: 'prg-cis', to: 'prg-claims', description: 'Both claim savings on cost of query handling (measure m-qcost).', severity: 'medium', ownerId: 'p-lindqvist', resolution: 'Attribution split 80/25 — exceeds 100%; VMO to resolve.' },
      { id: 'dep-4', type: 'bottleneck', from: 'prg-cis', to: 'prg-claims', description: 'Contact centre absorbs change from both programs in 2027.', severity: 'high', ownerId: 'p-murphy', resolution: 'Sequence CIS rollout after claims-line changes settle.' },
      { id: 'dep-5', type: 'resource', from: 'prg-pricing', to: 'prg-cis', description: 'Data engineers demanded by Pricing, CIS, Claims and DC Exit in H1 2027.', severity: 'high', ownerId: 'p-lindqvist', resolution: '' },
    ],
    resources: [
      { id: 'r-data', name: 'Data engineers', capacity: 6 },
      { id: 'r-ba', name: 'Business analysts', capacity: 8 },
      { id: 'r-change', name: 'Change managers', capacity: 3 },
      { id: 'r-arch', name: 'Solution architects', capacity: 2 },
    ],
    board: { name: 'Investment Decision Board', chairId: 'p-chen', members: ['p-chen', 'p-okafor', 'p-raman', 'p-whitfield', 'p-santos', 'p-martin'], quorum: 4, cadence: 'Monthly (third Thursday)', tor: 'Owns the enterprise portfolio. Reviews value cases, selects programs, assigns sponsors, approves funding progressively at gates and arbitrates conflicts. Does not manage projects or choose technology solutions.', delegations: 'Non-discretionary categories under $3m: CFO. Benefits reviews: business sponsor with exceptions escalated.' },
    meetings: [
      { id: 'mtg-1', date: '2026-09-17', title: 'IDB — September 2026', status: 'held', items: [{ id: 'it-1', type: 'review', programId: 'prg-claims', note: 'Variance report: platform slip' }, { id: 'it-2', type: 'portfolio', note: 'Waiting list: Pricing Analytics ranked first' }], conflicts: 'Sophie Martin declared an interest in the Pricing Analytics item and did not vote.', minutes: 'Board noted the Claims Digitisation slip and accepted the recovery plan. Pricing Analytics confirmed as first call on released funds.', decisions: [{ id: 'bd-1', text: 'Accept Claims recovery plan; value case update due before G3.', ownerId: 'p-tan', due: '2026-11-30', vote: 'Consensus' }] },
      { id: 'mtg-2', date: '2026-11-19', title: 'IDB — November 2026', status: 'planned', items: [{ id: 'it-3', type: 'gate', programId: 'prg-cis', gateId: 'cis-g2', note: 'G2 Commitment' }, { id: 'it-4', type: 'escalation', programId: 'prg-claims', note: 'Attribution overlap on query-handling cost (VMO recommendation attached)' }], conflicts: '', minutes: '', decisions: [] },
    ],
    policies: [
      { id: 'pol-1', title: 'Planning guidelines FY27', type: 'Planning guidelines', version: '1.0', date: '2026-04-30', text: 'Discretionary proposals need a sponsor at EGM level, a high-level benefits map and an indicative value range. Sustain items follow lifecycle policy.' },
      { id: 'pol-2', title: 'Risk appetite for the portfolio', type: 'Risk appetite', version: '1.1', date: '2026-06-30', text: 'No more than 30% of discretionary funding in programs with overall risk above 65; the portfolio must be NPV-positive at P10 in the simulation.' },
      { id: 'pol-3', title: 'Value assessment criteria', type: 'Assessment criteria', version: '2.0', date: '2025-07-01', text: 'Alignment, financial worth and risk shown separately; no composite index used for selection.' },
    ],
    lessons: [
      { id: 'les-1', programId: 'prg-pas', gate: 'G2', date: '2026-02-26', context: 'Withdrawal at Commitment', lesson: 'Validate vendor roadmaps with reference sites before Initiation, not at Commitment.', tags: ['vendor', 'estimation', 'withdrawal'] },
      { id: 'les-2', programId: 'prg-broker', gate: 'BR', date: '2026-04-15', context: 'Benefits review', lesson: 'Model competitor response as an explicit assumption with a monitor; it was implicit in the value case.', tags: ['assumptions', 'market', 'benefits review'] },
      { id: 'les-3', programId: 'prg-workplace', gate: 'G4', date: '2025-11-12', context: 'Completion', lesson: 'Survey-based productivity benefits need a baseline survey before deployment starts.', tags: ['measurement', 'baseline', 'survey'] },
      { id: 'les-4', programId: 'prg-claims', gate: 'G2', date: '2025-11-18', context: 'Commitment', lesson: 'Releasing funding to the first release only kept the vendor focused and gave a natural checkpoint.', tags: ['progressive commitment', 'funding'] },
    ],
    maturity,
    scenarios: [
      { id: 'sc-1', name: 'Approved FY27 plan', createdAt: '2026-06-30', approved: true, selections: { 'prg-cis': 'selected', 'prg-claims': 'selected', 'prg-broker': 'selected', 'prg-resilience': 'selected', 'prg-dcx': 'selected', 'prg-pricing': 'queued', 'prg-workplace': 'selected', 'prg-pas': 'not-selected' } },
      { id: 'sc-2', name: 'Pull Pricing forward, defer CIS', createdAt: '2026-09-17', approved: false, selections: { 'prg-cis': 'queued', 'prg-claims': 'selected', 'prg-broker': 'selected', 'prg-resilience': 'selected', 'prg-dcx': 'selected', 'prg-pricing': 'selected', 'prg-workplace': 'selected', 'prg-pas': 'not-selected' } },
    ],
    portfolioSim: { ...SIM_DEFAULTS, iterations: 3000 },
    recognitions: [{ id: 'rec-1', date: '2026-03-10', personId: 'p-martin', text: 'Recommended withdrawing the policy administration replacement at Commitment, releasing $4.2m for higher-value work.' }],
    comments: [],
    audit: [{ id: 'au-0', ts: '2026-10-14T00:00:00Z', actor: 'system', action: 'create', object: 'workspace', objectId: 'demo', summary: 'Demonstration workspace loaded' }],
    instrument: RISK_INSTRUMENT,
  };
}

export function blankWorkspace(name = 'New organisation') {
  return {
    id: `ws_${Date.now().toString(36)}`, name, kind: 'user', createdAt: new Date().toISOString(), version: 1,
    settings: { ...DEFAULT_SETTINGS, orgName: name }, currentUser: 'p-me',
    people: [{ id: 'p-me', name: 'You', position: 'Value Management Office lead', unit: 'a-exec', roles: ['VMO lead'], email: '' }],
    areas: [{ id: 'a-exec', name: 'Executive Office', head: 'p-me', absorption: 2 }],
    drivers: [], strategyVersions: [], categories: DEFAULT_CATEGORIES,
    portfolios: [{ id: 'pf-enterprise', name: 'Enterprise portfolio', board: 'Investment Decision Board', parentId: null, riskAppetite: '' }],
    allocations: [], reserve: {}, measures: [], programs: [], ideas: [], dependencies: [], resources: [],
    board: { name: 'Investment Decision Board', chairId: 'p-me', members: ['p-me'], quorum: 3, cadence: 'Monthly', tor: '', delegations: '' },
    meetings: [], policies: [], lessons: [], maturity: [], scenarios: [], portfolioSim: { ...SIM_DEFAULTS, iterations: 3000 }, recognitions: [], comments: [],
    audit: [{ id: 'au-0', ts: new Date().toISOString(), actor: 'p-me', action: 'create', object: 'workspace', summary: 'Workspace created' }],
    instrument: RISK_INSTRUMENT,
  };
}

export { program as newProgramShape };
