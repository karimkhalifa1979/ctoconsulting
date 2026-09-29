// Engagement data model. An engagement holds everything captured for one client:
// the workbook tabs (engagement, plan, discover, assess, analyse, recommend) plus
// AI readiness, target operating model design, transition planning and the business case.
import toolkit from '../data/toolkit.json';
import { AI_QUESTIONS, GUARDRAILS, ETHICS_PRINCIPLES } from '../data/aiReadiness.js';
import { CANVAS_ELEMENTS, DEFAULT_CRITERIA } from '../data/tomLibrary.js';

export const SCHEMA_VERSION = 1;
export const TK = toolkit;
export const DIMENSIONS = toolkit.dimensions;
export const DIM = Object.fromEntries(DIMENSIONS.map((d) => [d.code, d]));
export const DIM_BY_NAME = Object.fromEntries(DIMENSIONS.map((d) => [d.name, d]));

// Dropdown lists added by this tool on top of the workbook's Lists tab.
export const EXTRA_LISTS = {
  'Application disposition': ['Retain', 'Invest', 'Migrate', 'Replace', 'Consolidate', 'Retire'],
  'Supplier target action': ['Retain', 'Renegotiate', 'Consolidate', 'Exit', 'Insource', 'New'],
  'Location target action': ['Retain', 'Consolidate', 'Expand', 'Relocate', 'Exit', 'New'],
  'Org unit target action': ['Retain', 'Resize', 'Merge', 'Split', 'New', 'Disestablish'],
  'Capability change type': ['New', 'Uplift', 'Maintain', 'Reduce', 'Retire'],
  'Business criticality': ['Critical', 'High', 'Medium', 'Low'],
  'Capability tier': ['Strategic', 'Core', 'Enabling'],
  'Confidence': ['High', 'Medium', 'Low'],
  'Structural archetype': [
    'Functional', 'Divisional – by product or service', 'Divisional – by region', 'Divisional – by customer segment', 'Matrix',
    'Hub-and-spoke (federated)', 'Shared services and centres of excellence', 'Product / platform aligned', 'Network / ecosystem',
  ],
  'Risk category': ['Strategic', 'Financial', 'Operational', 'People & culture', 'Technology', 'Data & privacy', 'Cyber security', 'Regulatory & compliance', 'Supplier', 'Delivery / transition', 'Benefits realisation', 'Reputation'],
  'Risk stage': ['Transition', 'Target state'],
  'Risk status': ['Open', 'Mitigating', 'Accepted', 'Closed'],
  'Requirement category': ['People & skills', 'Organisation & roles', 'Process', 'Technology & applications', 'Data & information', 'Governance & decision rights', 'Facilities & locations', 'Suppliers & partners', 'Funding & finance', 'Policy & compliance'],
  'Requirement priority': ['Must have', 'Should have', 'Could have'],
  'Requirement status': ['Not started', 'In progress', 'Complete', 'Blocked'],
  'Initiative type': ['Solution component', 'Project', 'Program', 'Business change', 'Technology', 'Process improvement', 'Organisation design', 'AI use case'],
  'Initiative status': ['Proposed', 'Approved', 'In delivery', 'Complete', 'On hold', 'Cancelled'],
  'Cost type': ['Internal labour', 'Contractors & consultants', 'Software & licences', 'Cloud & hosting', 'Hardware & infrastructure', 'Training & change', 'Property & facilities', 'Redundancy & transition', 'Other'],
  'Cost category': ['Capex', 'Opex'],
  'Cost nature': ['One-off', 'Recurring'],
  'Benefit type': ['Cost reduction', 'Cost avoidance', 'Revenue growth', 'Productivity (time released)', 'Customer experience', 'Risk reduction', 'Compliance', 'Employee experience', 'Quality', 'Other'],
  'Benefit class': ['Cashable', 'Non-cashable', 'Non-financial'],
  'Benefit status': ['Not started', 'On track', 'At risk', 'Off track', 'Realised'],
  'Change activity type': ['Communication', 'Engagement', 'Sponsorship', 'Training', 'Coaching', 'Resistance management', 'Reinforcement'],
  'Activity status': ['Planned', 'In progress', 'Complete'],
  'AI type': ['Generative AI assistant / copilot', 'Generative AI content', 'Predictive analytics / machine learning', 'Natural language processing', 'Computer vision', 'Intelligent automation (RPA + AI)', 'Agentic AI', 'Recommendation / optimisation'],
  'AI risk tier': ['Minimal', 'Limited', 'High', 'Prohibited'],
  'Use case status': ['Idea', 'Assessing', 'Pilot', 'Production', 'Scaled', 'Retired'],
  'Guardrail status': ['Not started', 'Planned', 'In progress', 'Implemented', 'Not applicable'],
  'Data readiness': ['Ready', 'Partially ready', 'Not ready', 'Unknown'],
};

export const DEFAULT_SETTINGS = {
  ...toolkit.settings,
  currency: 'AUD',
  startYear: new Date().getFullYear(),
  years: 5,
  discountRate: 7,
  riskAdjustBenefits: true,
  includeNonCashable: true,
};

export const pad = (n, w) => String(n).padStart(w, '0');
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Next sequential ID for a register, e.g. F001 → F002.
export function nextId(rows, prefix, width = 3) {
  let max = 0;
  for (const r of rows || []) {
    const m = String(r.id || '').match(/(\d+)$/);
    if (String(r.id || '').startsWith(prefix) && m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${pad(max + 1, width)}`;
}

export const zeros = (n) => Array.from({ length: n }, () => 0);

export function blankQuestion(q, settings = DEFAULT_SETTINGS) {
  return {
    id: q.id, dim: q.dim, sub: q.sub, question: q.question, good: q.good,
    importance: q.importance ?? 2, current: '', target: settings.defaultTarget ?? 3,
    confidence: '', evidence: '', observations: '', findingIds: '',
    evidenceToRequest: q.evidenceToRequest || '', stakeholders: q.stakeholders || '', custom: !!q.custom,
  };
}

export function blankEngagement({ client = '', name = '' } = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  const now = new Date().toISOString();
  return {
    id: uid(),
    schema: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    kind: 'client',
    details: {
      client, industry: '', name: name || (client ? `${client} operating model assessment` : ''), sponsor: '', lead: '', team: '',
      startDate: '', endDate: '', version: '0.1', status: 'Mobilising',
    },
    objectives: ['', '', '', '', ''],
    scope: { units: '', locations: '', dimensions: 'All 17 dimensions', outOfScope: '', constraints: '' },
    hypotheses: ['', '', '', '', ''],
    settings,
    lists: { ...structuredClone(toolkit.lists), ...structuredClone(EXTRA_LISTS) },
    spanBenchmarks: structuredClone(toolkit.spanBenchmarks),
    principles: [],
    stakeholders: [],
    interviews: toolkit.interviewGuides.map((g, i) => ({ id: `IG${pad(i + 1, 3)}`, group: g.group, n: g.n, question: g.question, dims: g.dims.join('; '), probe: g.probe, notes: '' })),
    documents: toolkit.documentRequests.map((d) => ({
      id: d.ref, document: d.document, dims: d.dims.join('; '), priority: d.priority, owner: d.owner,
      requestedFrom: '', requested: '', due: '', received: '', status: d.status || 'Not requested', notes: '',
    })),
    questions: toolkit.questions.map((q) => blankQuestion(q, settings)),
    capabilities: toolkit.capabilities.map((c) => ({
      id: c.id, tier: c.tier, l1: c.l1, l2: c.l2, description: c.description, importance: '', differentiation: '',
      current: '', target: '', owner: '', systems: '', sourcing: '', notes: '', targetSourcing: '', changeType: '', horizon: '',
    })),
    processes: toolkit.processes.map((p) => ({
      id: p.id, valueStream: p.valueStream, l1: p.l1, l2: p.l2, owner: '', units: '', documented: '', standardised: '', automation: '',
      systems: '', volume: '', cycleTime: '', fte: '', handoffs: '', painPoints: '', maturity: '', opportunity: '', priority: '',
      targetAutomation: '', targetCycleTime: '', targetFte: '',
    })),
    orgUnits: [],
    rapidRoles: [...toolkit.rapidRoles],
    decisions: toolkit.decisions.map((d) => ({ id: d.id, decision: d.decision, current: {}, target: {}, documented: '', days: '', targetDays: '', notes: '' })),
    applications: [],
    suppliers: [],
    locations: [],
    costs: [],
    targetCosts: [],
    findings: [],
    recommendations: [],
    ai: {
      responses: Object.fromEntries(AI_QUESTIONS.map((q) => [q.id, { current: '', target: '', evidence: '', notes: '' }])),
      useCases: [],
      guardrails: Object.fromEntries(GUARDRAILS.map((g) => [g.id, { status: '', owner: '', evidence: '', notes: '' }])),
      ethics: Object.fromEntries(ETHICS_PRINCIPLES.map((p) => [p.id, { status: '', notes: '' }])),
      context: { aiStrategy: '', accountableOfficial: '', aiInventoryCount: '', genAiPolicy: '', notes: '' },
    },
    tom: {
      vision: '',
      archetype: '',
      archetypeRationale: '',
      canvas: Object.fromEntries(CANVAS_ELEMENTS.map((c) => [c.id, { current: '', target: '', shifts: '' }])),
      dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d.code, { currentSummary: '', targetDescription: '', shifts: '', principles: '', enablers: '', recs: '', targetOverride: '' }])),
      criteria: structuredClone(DEFAULT_CRITERIA),
      options: [],
      preferredOption: '',
    },
    initiatives: [],
    costLines: [],
    benefitLines: [],
    risks: [],
    requirements: [],
    changeImpacts: [],
    changeActivities: [],
    report: {},
  };
}

// Bring older or imported engagements up to the current shape without losing data.
export function normalise(e) {
  const base = blankEngagement();
  const out = { ...base, ...e };
  out.details = { ...base.details, ...(e.details || {}) };
  out.scope = { ...base.scope, ...(e.scope || {}) };
  out.settings = { ...base.settings, ...(e.settings || {}) };
  out.lists = { ...base.lists, ...(e.lists || {}) };
  out.ai = { ...base.ai, ...(e.ai || {}) };
  out.ai.responses = { ...base.ai.responses, ...(e.ai?.responses || {}) };
  out.ai.guardrails = { ...base.ai.guardrails, ...(e.ai?.guardrails || {}) };
  out.ai.ethics = { ...base.ai.ethics, ...(e.ai?.ethics || {}) };
  out.ai.context = { ...base.ai.context, ...(e.ai?.context || {}) };
  out.tom = { ...base.tom, ...(e.tom || {}) };
  out.tom.canvas = { ...base.tom.canvas, ...(e.tom?.canvas || {}) };
  out.tom.dimensions = { ...base.tom.dimensions, ...(e.tom?.dimensions || {}) };
  for (const k of ['objectives', 'hypotheses']) {
    const a = [...(e[k] || [])];
    while (a.length < 5) a.push('');
    out[k] = a;
  }
  out.schema = SCHEMA_VERSION;
  return out;
}

export const engagementTitle = (e) => e?.details?.client || e?.details?.name || 'Untitled engagement';
