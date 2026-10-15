// Default method configuration (spec Appendix C and sections 4, 6, 7).
// Everything here is a starting point: the workspace keeps its own copy in settings,
// and guidance text paraphrases the source framework in original wording (constraint C-02).

export const BTOPP = [
  { id: 'B', short: 'B', name: 'Business strategy', question: 'Does the investment answer a real market need or opportunity, and how sure are we of that?' },
  { id: 'T', short: 'T', name: 'Technology', question: 'Will the capability be configured and connected so the right people get the right information at the right time?' },
  { id: 'O', short: 'O', name: 'Organisation', question: 'Which changes to structure, location, culture and rewards are needed to get value from the capability?' },
  { id: 'Pr', short: 'Pr', name: 'Process', question: 'Which end-to-end processes, management practices and procedures must be redesigned, and when?' },
  { id: 'P', short: 'P', name: 'People', question: 'Do staff, customers and partners have the know-how, motivation and authority to use the capability well?' },
];
export const btoppName = (id) => BTOPP.find((b) => b.id === id)?.name || id;

export const INITIATIVE_TYPES = [
  'Technology delivery', 'Process redesign', 'Training', 'Communication', 'Organisation design', 'Reward or incentive change',
  'Policy', 'Recruitment', 'Marketing', 'Industrial relations', 'Pilot or proof of concept', 'Other',
];

// Pipeline / lifecycle states (INV-08).
export const STATES = [
  { id: 'idea', label: 'Idea', color: '#b9c0ca' },
  { id: 'concept', label: 'In concept definition', color: '#9ec5f4' },
  { id: 'awaiting-initiation', label: 'Awaiting Initiation', color: '#6da7ec' },
  { id: 'definition', label: 'In definition', color: '#3987e5' },
  { id: 'waiting-list', label: 'Waiting list', color: '#eda100' },
  { id: 'active', label: 'Active (delivery)', color: '#256abf' },
  { id: 'harvesting', label: 'Harvesting', color: '#1baf7a' },
  { id: 'completed', label: 'Completed', color: '#0d366b' },
  { id: 'withdrawn', label: 'Withdrawn (resources released)', color: '#7b8796' },
];
export const stateOf = (id) => STATES.find((s) => s.id === id) || STATES[0];
export const LIVE_STATES = ['concept', 'awaiting-initiation', 'definition', 'waiting-list', 'active', 'harvesting'];

// Investment categories (Appendix C.1, INV-02/03).
export const DEFAULT_CATEGORIES = [
  { id: 'mandatory', name: 'Mandatory', freedom: 'Low', discretionary: false, depth: 'light', description: 'Legal, regulatory or code compliance.', path: 'Record the obligation, deadline and least-cost option. Simplified gates; no alignment or financial scoring.', lightFields: ['Obligation reference', 'Compliance deadline', 'Least-cost option'] },
  { id: 'mandated', name: 'Parent- or corporate-mandated', freedom: 'Low', discretionary: false, depth: 'light', description: 'Required by a parent organisation and agreed by the executive.', path: 'Mandate reference; focus on delivery and cost; track benefits where stated.', lightFields: ['Mandate reference', 'Mandating body'] },
  { id: 'sustain', name: 'Sustain', freedom: 'Low to medium', discretionary: false, depth: 'light', description: 'Renewal of obsolete assets to keep equivalent capability.', path: 'Lifecycle policy compliance and consequence-of-deferral analysis.', lightFields: ['Asset', 'Lifecycle policy', 'Consequence of deferral'] },
  { id: 'growth', name: 'Growth of existing services', freedom: 'Medium', discretionary: false, depth: 'light', description: 'Capacity for business-driven volume growth.', path: 'Demand forecast and unit-cost case; lighter value case.', lightFields: ['Demand forecast', 'Unit cost'] },
  { id: 'rnd', name: 'Development or R&D', freedom: 'Medium', discretionary: false, depth: 'light', description: 'Testing and developing capabilities not yet justified on immediate benefit.', path: 'Learning objectives and hypotheses; small tranches; pilot evidence.', lightFields: ['Learning objectives', 'Hypotheses'] },
  { id: 'infrastructure', name: 'Infrastructure or architecture', freedom: 'Medium', discretionary: false, depth: 'light', description: 'Shared assets implementing a target architecture.', path: 'Show the business programs it enables (DEP-06) and architecture conformance.', lightFields: ['Programs enabled', 'Architecture conformance'] },
  { id: 'committed', name: 'Already committed', freedom: 'Varies', discretionary: false, depth: 'light', description: 'Funding committed before adoption of the approach.', path: 'Inventoried now and moved onto the standard path at the next gate.', lightFields: ['Commitment reference'] },
  { id: 'opportunity', name: 'Business opportunity', freedom: 'High', discretionary: true, depth: 'full', description: 'Programs that realise opportunities creating measurable business benefits.', path: 'Full value case and value assessment; full program lifecycle.', lightFields: [] },
];

// Program stage gates (Appendix C.2, GOV-01, section 4.5).
export const GATES = [
  { id: 'G1', name: 'G1 Initiation', short: 'Initiation', stageAfter: 'definition', authority: 'IDB (or delegate for small items)', questions: 'Is this the right thing to explore now? Is there a sponsor? Is the value plausible against other ideas?', criteria: [
    ['g1-chain', 'High-level benefits map with at least one final outcome'],
    ['g1-value', 'Indicative costs and benefits recorded'],
    ['g1-risk', 'First risk scan completed'],
    ['g1-sponsor', 'Business sponsor nominated'],
    ['g1-align', 'Alignment to strategic drivers stated'],
  ] },
  { id: 'G2', name: 'G2 Commitment', short: 'Commitment', stageAfter: 'active', authority: 'IDB', questions: 'Are path, scope and accountabilities clear? Are the benefits worth the full lifecycle cost and risk? Can the organisation absorb the change?', criteria: [
    ['g2-vc', 'Complete, refreshed value case'],
    ['g2-chain', 'Validated benefits map; every initiative leads to an outcome'],
    ['g2-owners', 'Outcome and benefit owners accepted'],
    ['g2-baselines', 'Baselines and measures for every benefit'],
    ['g2-change', 'Change plan covering affected stakeholder groups'],
    ['g2-contingency', 'Contingency plans for high-importance, low-confidence elements'],
    ['g2-drivers', 'Every final outcome linked to a strategic driver'],
  ] },
  { id: 'G3', name: 'G3 Commissioning', short: 'Commissioning', stageAfter: 'harvesting', authority: 'Business sponsor, IDB notified', questions: 'Are the capability, people and processes ready for live use? Are measures live?', criteria: [
    ['g3-accept', 'Capabilities accepted by the sponsor'],
    ['g3-ready', 'People and process readiness confirmed'],
    ['g3-measures', 'Measures live and collecting data'],
  ] },
  { id: 'BR', name: 'Benefits review', short: 'Benefits review', stageAfter: null, authority: 'Business sponsor; exceptions escalate to IDB', questions: 'Are we getting the benefits? What should change?', criteria: [
    ['br-actuals', 'Actuals compared with forecast'],
    ['br-assumptions', 'Assumption status reviewed'],
    ['br-options', 'Options for any shortfall considered'],
  ] },
  { id: 'G4', name: 'G4 Completion', short: 'Completion', stageAfter: 'completed', authority: 'IDB', questions: 'Are all selected paths’ conditions met and benefits flowing steadily? Have operational owners accepted?', criteria: [
    ['g4-paths', 'Conditions for all selected benefits paths met'],
    ['g4-steady', 'Steady-state harvesting for the configured number of periods'],
    ['g4-handover', 'Operational owners have accepted each benefit'],
    ['g4-bau', 'Measures moved into business-as-usual reporting'],
    ['g4-lessons', 'Lessons learned recorded'],
  ] },
];
export const gateOf = (id) => GATES.find((g) => g.id === id);

export const PROJECT_GATES = ['Concept', 'Design', 'Execution', 'Implementation', 'Closed'];

export const DECISIONS = [
  { id: 'stay', label: 'Stay the course', tone: 'good' },
  { id: 'conditions', label: 'Proceed with conditions', tone: 'good' },
  { id: 'modify', label: 'Modify the program', tone: 'warning' },
  { id: 'delay', label: 'Delay the next stage', tone: 'warning' },
  { id: 'withdraw', label: 'Withdraw (release resources)', tone: 'neutral' },
];
export const decisionOf = (id) => DECISIONS.find((d) => d.id === id);

// The four "ares" (section 4.6).
export const ARES = [
  { id: 'right', short: 'Right things', q: 'Are we doing the right things?', dim: 'Alignment', value: 'What is proposed, for which business outcome, and how do the projects contribute?', risk: 'Error or unclear business judgement in a changing environment.' },
  { id: 'way', short: 'Right way', q: 'Are we doing them the right way?', dim: 'Integration', value: 'How will the work be done, and how does it fit current and future capabilities and architecture?', risk: 'Inconsistency with other programs and existing capabilities.' },
  { id: 'well', short: 'Done well', q: 'Are we getting them done well?', dim: 'Capability / efficiency', value: 'What is the plan, and what resources and funds are needed?', risk: 'Conventional delivery risk: budget, timetable, specification, quality.' },
  { id: 'benefits', short: 'Benefits', q: 'Are we getting the benefits?', dim: 'Benefits', value: 'How will benefits be delivered and what is the program worth?', risk: 'The business environment will not let benefits be harvested.' },
];

// Risk instrument (Appendix C.3). Scored 1 (low risk) to 5 (high risk); weight 1–3.
export const RISK_INSTRUMENT = [
  { are: 'right', id: 'r1', text: 'Clarity of target outcomes', w: 3 },
  { are: 'right', id: 'r2', text: 'Stability of the strategic context', w: 2 },
  { are: 'right', id: 'r3', text: 'Sponsor understanding of the case', w: 2 },
  { are: 'right', id: 'r4', text: 'Dependence on external decisions', w: 2 },
  { are: 'right', id: 'r5', text: 'Market or customer acceptance', w: 3 },
  { are: 'way', id: 'w1', text: 'Outcome clarity for designers', w: 3 },
  { are: 'way', id: 'w2', text: 'Number of focus areas', w: 2 },
  { are: 'way', id: 'w3', text: 'IT maturity', w: 1 },
  { are: 'way', id: 'w4', text: 'Architectural alignment', w: 2 },
  { are: 'way', id: 'w5', text: 'Security', w: 1 },
  { are: 'way', id: 'w6', text: 'IT skills and experience', w: 3 },
  { are: 'way', id: 'w7', text: 'Business experience', w: 3 },
  { are: 'way', id: 'w8', text: 'Program and project management', w: 3 },
  { are: 'way', id: 'w9', text: 'Use of support resources', w: 2 },
  { are: 'way', id: 'w10', text: 'Use of common technology resources', w: 2 },
  { are: 'well', id: 'd1', text: 'Size and duration', w: 2 },
  { are: 'well', id: 'd2', text: 'Technical novelty', w: 2 },
  { are: 'well', id: 'd3', text: 'Confidence in estimates', w: 3 },
  { are: 'well', id: 'd4', text: 'Vendor dependency', w: 2 },
  { are: 'well', id: 'd5', text: 'Availability of scarce skills', w: 3 },
  { are: 'well', id: 'd6', text: 'Delivery track record', w: 2 },
  { are: 'benefits', id: 'b1', text: 'Sponsor commitment and capacity', w: 3 },
  { are: 'benefits', id: 'b2', text: 'Stakeholder acceptance', w: 3 },
  { are: 'benefits', id: 'b3', text: 'Change load on affected areas', w: 3 },
  { are: 'benefits', id: 'b4', text: 'Measurability of benefits', w: 2 },
  { are: 'benefits', id: 'b5', text: 'Reward alignment', w: 2 },
  { are: 'benefits', id: 'b6', text: 'Sensitivity to assumptions', w: 3 },
];

export const ALIGN_SCALE = ['None', 'Minor', 'Moderate', 'Significant', 'Critical'];
export const CONTRIB_TYPES = [
  { id: 'current', label: 'Current objectives and priorities' },
  { id: 'parent', label: 'Parent organisation or wider context' },
  { id: 'future', label: 'Desired future state or vision' },
];
export const BSC = ['Financial', 'Customer', 'Internal process', 'Learning and growth'];

// MEDIC wording convention (RCM-04, BR-06).
export const MEDIC = ['maintained', 'eliminated', 'decreased', 'increased', 'created', 'reduced', 'raised', 'lowered', 'grown', 'removed', 'sustained', 'established', 'achieved', 'accessible', 'available'];
export const VAGUE = ['improved', 'improve', 'better', 'enhanced', 'enhance', 'optimised', 'optimized', 'optimise', 'streamlined', 'leveraged', 'efficient', 'world-class', 'best practice', 'modernised'];

// Seven plus one conditions (ACC-03).
export const SEVEN_PLUS_ONE = [
  ['mandate', 'Clear mandate and scope'],
  ['authority', 'Sufficient authority and latitude to act'],
  ['competence', 'Requisite competence'],
  ['resources', 'Commensurate resources'],
  ['lines', 'Clear lines of accountability'],
  ['rights', 'Understanding of rights and obligations'],
  ['measures', 'Relevant performance measures'],
  ['acceptance', 'Acceptance (the plus one)'],
];

export const ROLES = [
  ['sponsor', 'Business sponsor'], ['manager', 'Program manager'], ['project-manager', 'Project manager'],
  ['outcome-owner', 'Outcome owner'], ['benefit-owner', 'Benefit owner'], ['delivery-owner', 'Initiative delivery owner'],
  ['assumption-monitor', 'Assumption monitor'], ['change-lead', 'Change lead'], ['operational-owner', 'Operational owner'],
  ['value-analyst', 'Value analyst'],
];
export const roleName = (id) => ROLES.find((r) => r[0] === id)?.[1] || id;

export const PERSON_ROLES = ['IDB member', 'IDB chair', 'VMO lead', 'Value analyst', 'Business sponsor', 'Program manager', 'Project manager', 'Outcome owner', 'Operational owner', 'Change lead', 'Finance analyst', 'Architecture representative', 'Contributor', 'Auditor', 'Administrator'];
export const DELIVERY_ROLES = ['Program manager', 'Project manager'];

// Element risk matrix (section 7.2.5).
export const ELEMENT_RISK = {
  high: { high: 'Monitor', medium: 'Mitigation plan', low: 'Contingency plan required' },
  medium: { high: 'Monitor', medium: 'Monitor', low: 'Mitigation plan' },
  low: { high: 'No action', medium: 'No action', low: 'Monitor' },
};

export const COST_TYPES = [
  { id: 'capital', label: 'Initial capital' },
  { id: 'operating', label: 'Ongoing operating' },
  { id: 'change', label: 'Organisation, process & people (change)' },
  { id: 'sustaining', label: 'Sustaining investment' },
  { id: 'decommissioning', label: 'Decommissioning' },
];
export const BENEFIT_TYPES = [
  { id: 'cash', label: 'Cash-releasing' },
  { id: 'noncash', label: 'Non-cash-releasing financial' },
  { id: 'nonfinancial', label: 'Non-financial' },
];
export const benefitTypeLabel = (id) => BENEFIT_TYPES.find((b) => b.id === id)?.label || id;

export const DEPENDENCY_TYPES = [
  { id: 'sequential', label: 'Sequential dependency' },
  { id: 'overlap', label: 'Overlapping outcomes' },
  { id: 'resource', label: 'Competition for scarce resources' },
  { id: 'bottleneck', label: 'Change bottleneck' },
];

export const DESIGN_STEPS = [
  ['benefits', 'Define benefits and articulate the linkages', 'Agree final outcomes, keep asking "so what?", and link each one to strategic drivers.'],
  ['scope', 'Define the program scope', 'Use the BTOPP checklist so organisation, process and people work is in scope, not just technology.'],
  ['map', 'Map the benefits realisation process', 'Work backwards from outcomes through intermediate outcomes to initiatives; record assumptions.'],
  ['path', 'Select the best path', 'Model alternative benefits paths, compare them on cost, value, risk and time, and record the choice.'],
  ['accountability', 'Define accountabilities', 'Name an owner for each outcome and benefit and test the seven plus one conditions.'],
  ['people', 'Address the people factor', 'Analyse stakeholders, depth and breadth of change, and plan communication with the four Ps.'],
  ['time', 'Recognise the time factor', 'Phase benefits with plateaus and learning lag; plan 60–90 day increments and quick wins.'],
  ['risk', 'Prepare for risk and uncertainty', 'Rate importance and confidence, plan contingencies, and model uncertainty in the simulation lab.'],
];

export const READINESS_QUESTIONS = [
  ['other', 'Is other change already under way for this group?'],
  ['culture', 'Does the change fit the culture and values of the group?'],
  ['rewards', 'Do rewards reinforce (rather than obstruct) the change?'],
  ['info', 'Are information and training needs understood and planned?'],
  ['gainloss', 'Do individuals understand what they stand to gain or lose?'],
  ['leaders', 'Are local leaders visibly sponsoring the change?'],
];

export const MATURITY = [
  { are: 'right', items: ['The organisation has a clear vision and strategy, and its strategic drivers are widely understood.', 'Every initiative is clearly linked to strategic drivers.', 'Expected outcomes and benefits of initiatives are clear and credible.', 'Committed funds are not left unspent through delays while valuable opportunities wait.', 'Transformation programs are not starved by a proliferation of small projects.'] },
  { are: 'way', items: ['Processes make sure all four "ares" are addressed for every investment.', 'Agreed principles guide program and project decisions.', 'Current programs, projects and initiatives are aligned and reinforce one another.', 'An architecture exists, its principles are followed, and proven technologies are used.'] },
  { are: 'well', items: ['Standard processes exist for designing and managing projects and programs.', 'The organisation has the competencies and experience its initiatives need.', 'Plans are validated, risks are managed, and monitoring and control are in place.', 'Most initiatives deliver on time and budget; overruns, delays and cancellations are known and tracked.'] },
  { are: 'benefits', items: ['The organisation gets the results it expects from its programs and projects.', 'The initiatives needed to realise benefits are clear, understood and achievable.', 'Every program has a committed sponsor, and affected areas assign adequate resources.', 'Benefit efforts are adjusted and sustained when the environment changes.', 'Benefit commitments are remembered after approval, and value is salvaged when an initiative stops early.', 'The organisation knows what share of expected benefits it actually achieves.'] },
];

export const DEFAULT_SETTINGS = {
  currency: 'AUD',
  locale: 'en-AU',
  discountRate: 0.07,
  fyStartMonth: 7,
  horizonYears: 10,
  precision: 1000,
  mode: 'portfolio',
  terms: { program: 'program', programs: 'programs', board: 'Investment Decision Board', boardShort: 'IDB', vmo: 'Value Management Office', map: 'benefits map' },
  thresholds: {
    riskAmber: 35, riskRed: 65, onTrack: 0.9, atRisk: 0.75, reviewCycles: 3, changeEffortMin: 0.15, oppMin: 0.5,
    steadyPeriods: 2, postHandoverMonths: 12, alignmentChange: 10, sponsorAcceptDays: 10, contingency: 0.1,
    unansweredMax: 0.2, analysisParalysisDays: 180, varianceTolerance: 0.1,
  },
  areWeights: { right: 1, way: 1, well: 1, benefits: 1 },
  typeWeights: { current: 0.5, parent: 0.2, future: 0.3 },
  healthWeights: { delivery: 0.25, benefits: 0.3, assumptions: 0.15, risk: 0.15, readiness: 0.15 },
  ai: true,
};

export const SIM_DEFAULTS = {
  iterations: 5000,
  seed: 20261015,
  dist: 'pert',
  benefitScale: 1, benefitLow: -0.3, benefitHigh: 0.15,
  costScale: 1, costLow: -0.05, costHigh: 0.35,
  delayMonths: 0, delayLow: 0, delayHigh: 9,
  rampScale: 1, lifetimeYears: null, dipScale: 1,
  correlation: 0.5, lineCorrelation: 0.6,
  events: true, customEvents: [], eventOverrides: {},
  discountRate: null,
  horizonYears: null,
  lineOverrides: {},
};
