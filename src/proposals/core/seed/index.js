// Demo data for the proposal platform. Everything here is fictitious.
// Dates are relative to the seed date so bids are always live.
import { addDays, prng, addBusinessDays, todayISO, htmlWords } from '../util.js';
import { sha256 } from '../sha256.js';
import { CASE_STUDIES, STANDARD_ANSWERS, METHODS, EVIDENCE, PAST_PROPOSALS, CONSULTANTS, TAXONOMY } from './library.js';
import { srwaRfq, srwaDates, odrAtm, ODR_QUESTIONNAIRE, asacRfq, kestrelRfp, tasmanRfp, toPages } from './rfp.js';
import { SRWA_CONTENT } from './content.js';
import { extractRequest } from '../extract.js';
import { emptyBid, appendAudit } from '../commands.js';
import { backSchedule } from '../schedule.js';
import { buildBrief, prefillScorecard } from '../qualify.js';
import { draftSection, executiveSummary, acceptAllAi } from '../drafting.js';
import { citationsIn, parseSrc } from '../html.js';
import { LOSS_REASONS, SLIDE_KINDS } from '../constants.js';
export { SLIDE_KINDS };

const USERS = [
  ['u_priya', 'Priya Raman', 'Platform Administrator', ['admin']],
  ['u_daniel', 'Daniel Whitford', 'Partner, Digital Government', ['partner', 'consultant'], 'daniel'],
  ['u_helen', 'Helen Okafor', 'Partner, Cyber and Risk', ['partner', 'consultant'], 'helen'],
  ['u_sophie', 'Sophie Tran', 'Bid Manager', ['bidManager']],
  ['u_jack', 'Jack Morrison', 'Bid Manager', ['bidManager']],
  ['u_marcus', 'Marcus Lee', 'Principal Consultant, Cloud', ['author', 'consultant'], 'marcus'],
  ['u_aisha', 'Aisha Patel', 'Senior Consultant, Cyber Security', ['author', 'consultant'], 'aisha'],
  ['u_tom', 'Tom Gallagher', 'Director, Quality and Assurance', ['reviewer', 'consultant'], 'tom'],
  ['u_chen', 'Chen Wei', 'Principal Consultant, Data and AI', ['author', 'reviewer', 'consultant'], 'chen'],
  ['u_rebecca', 'Rebecca Stone', 'Commercial Manager', ['commercial']],
  ['u_james', 'James Wu', 'Chief Financial Officer', ['commercial']],
  ['u_nina', 'Nina Kowalski', 'Knowledge and Content Manager', ['librarian']],
  ['u_olivia', 'Olivia Brennan', 'Chief Operating Officer', ['viewer']],
  ['u_sam', 'Sam Taylor', 'Principal Consultant, Program Delivery', ['author', 'consultant'], 'sam'],
  ['u_zara', 'Zara Ahmed', 'Principal Consultant, Architecture', ['author', 'consultant'], 'zara'],
  ['u_ethan', 'Ethan Brooks', 'Senior Consultant, Architecture', ['author', 'consultant'], 'ethan'],
  ['u_oliver', 'Oliver Hughes', 'Senior Consultant, Change Management', ['author', 'consultant'], 'oliver'],
  ['u_liam', 'Liam O’Connor', 'Consultant, Data Engineering', ['consultant'], 'liam'],
  ['u_mia', 'Mia Robinson', 'Senior Consultant, Business Analysis', ['author', 'consultant'], 'mia'],
  ['u_grace', 'Grace Nguyen', 'Analyst, Digital Services', ['consultant'], 'grace'],
  ['u_ben', 'Ben Carter', 'Consultant, Delivery', ['consultant'], 'ben'],
];

const CLIENTS = [
  ['cl_srwa', 'Southern Rivers Water Authority', 'SRWA', 'Water and utilities', 'NSW', 'OFFICIAL: Sensitive'],
  ['cl_odr', 'Office of the Digital Registrar', 'ODR', 'Commonwealth government', 'ACT', 'OFFICIAL: Sensitive'],
  ['cl_kestrel', 'Kestrel Superannuation', 'Kestrel', 'Financial services', 'VIC', 'OFFICIAL'],
  ['cl_harbourside', 'Harbourside City Council', 'Harbourside', 'Local government', 'NSW', 'OFFICIAL'],
  ['cl_asac', 'Australian Skills Assurance Commission', 'ASAC', 'Commonwealth government', 'ACT', 'OFFICIAL: Sensitive'],
  ['cl_tasman', 'Tasman Freight Group', 'Tasman Freight', 'Transport and logistics', 'National', 'OFFICIAL'],
  ['cl_northbridge', 'Northbridge Health Service', 'Northbridge Health', 'Health', 'QLD', 'OFFICIAL: Sensitive'],
  ['cl_coral', 'Coral Coast Energy', 'Coral Coast', 'Energy and utilities', 'QLD', 'OFFICIAL'],
  ['cl_meridian', 'Meridian University', 'Meridian', 'Education', 'SA', 'OFFICIAL'],
  ['cl_murray', 'Murray Basin Water', 'Murray Basin', 'Water and utilities', 'VIC', 'OFFICIAL'],
  ['cl_drt', 'Department of Regional Transport', 'DRT', 'State government', 'NSW', 'OFFICIAL: Sensitive'],
  ['cl_npsb', 'National Professional Standards Board', 'NPSB', 'Commonwealth government', 'ACT', 'OFFICIAL: Sensitive'],
  ['cl_dcf', 'Department of Community Futures', 'DCF', 'State government', 'WA', 'OFFICIAL'],
];

export const DEFAULT_OUTLINE = [
  { key: 'executive_summary', title: 'Executive summary', wordLimit: 500 },
  { key: 'understanding', title: 'Understanding of your requirements', wordLimit: 700 },
  { key: 'approach', title: 'Proposed approach and methodology', wordLimit: 1500 },
  { key: 'delivery_plan', title: 'Delivery plan and timeline', wordLimit: 700 },
  { key: 'governance', title: 'Governance, risk and quality', wordLimit: 700 },
  { key: 'team', title: 'Proposed team', wordLimit: 900 },
  { key: 'experience', title: 'Relevant experience', wordLimit: 1000 },
  { key: 'commercial', title: 'Commercial response', wordLimit: 500, commercial: true },
  { key: 'compliance', title: 'Compliance and corporate obligations', wordLimit: 600, commercial: true },
];

export const SHORT_OUTLINE = [
  { key: 'executive_summary', title: 'Executive summary', wordLimit: 300 },
  { key: 'approach', title: 'Approach and methodology', wordLimit: 900 },
  { key: 'team', title: 'Team and experience', wordLimit: 600 },
  { key: 'commercial', title: 'Pricing and assumptions', wordLimit: 300, commercial: true },
];

export const RECIPES = [
  { id: 'rcp_orals', name: 'Orals or shortlist presentation', use: 'Presenting to the evaluation panel', slides: ['title', 'agenda', 'understanding', 'approach', 'timeline', 'team', 'case_studies', 'why', 'next_steps', 'questions'] },
  { id: 'rcp_summary', name: 'Proposal summary', use: 'Leave-behind or cover deck for a written submission', slides: ['title', 'exec_summary', 'approach', 'team', 'commercial', 'next_steps'] },
  { id: 'rcp_capability', name: 'Capability statement', use: 'Early engagement, panel onboarding', slides: ['who_we_are', 'services', 'sectors', 'case_studies', 'credentials', 'contacts'] },
  { id: 'rcp_kickoff', name: 'Kick-off', use: 'First meeting after award', could: true, slides: ['title', 'objectives', 'scope', 'governance', 'team', 'plan', 'first_30_days'] },
];



export const STYLE_GUIDE = {
  tone: 'Plain, confident Australian English. Active voice. Short sentences. Say what we will do and what the client gets. Evidence every claim.',
  bannedPhrases: ['world-class', 'best-in-class', 'best of breed', 'cutting-edge', 'synergy', 'one-stop shop', 'seamless', 'guarantee', 'lowest total cost of ownership', 'leading provider'],
  preferredTerms: [
    { avoid: 'utilise', use: 'use' }, { avoid: 'in order to', use: 'to' }, { avoid: 'commence', use: 'start' }, { avoid: 'facilitate', use: 'help' },
    { avoid: 'going forward', use: 'from now on' }, { avoid: 'leverage', use: 'use' }, { avoid: 'solutioning', use: 'designing' },
  ],
};

function mkLib(state, spec) {
  const id = `lib_${spec.key.toLowerCase().replace('-', '')}`;
  const item = {
    id, key: spec.key, type: spec.type, title: spec.title, ownerId: spec.ownerId || 'u_nina', createdAt: spec.createdAt, createdBy: spec.ownerId || 'u_nina',
    tags: { sectors: [], offerings: [], technologies: [], capabilities: [], regions: [], ...spec.tags }, clientId: spec.clientId || null, confidential: Boolean(spec.confidential), consent: spec.consent || null,
    reviewDate: spec.reviewDate, expiry: spec.expiry || null, retired: Boolean(spec.retired), approvedV: null, versions: [], source: 'seed', lastReviewed: spec.lastReviewed || null,
  };
  spec.versions.forEach((v, i) => item.versions.push({ v: i + 1, status: v.status || 'approved', by: v.by || item.ownerId, at: v.at || spec.createdAt, approvedBy: v.status && v.status !== 'approved' && v.status !== 'superseded' ? null : 'u_nina', approvedAt: v.at || spec.createdAt, note: v.note || (i ? 'Updated' : 'Created'), ...v.data }));
  const approved = item.versions.filter((v) => v.status === 'approved');
  item.approvedV = approved.length ? approved[approved.length - 1].v : null;
  state.library.push(item);
  return item;
}

function sec(bid, s, order, extra = {}) {
  return {
    id: s.id || `sec_${bid.id.slice(4)}_${s.key}`, key: s.key, title: s.title, order, parentId: null, brief: s.brief || '', wordLimit: s.wordLimit || null, pageLimit: null,
    ownerId: s.ownerId || null, contributors: s.contributors || [], reviewers: s.reviewers || [], due: s.due || null, status: 'not_started', commercial: Boolean(s.commercial),
    content: '', v: 0, versions: [], comments: [], approvals: [], scores: [], citations: [], aiHistory: [], lockedBy: null, updatedAt: null, lastEditedBy: null, ...extra,
  };
}

function setContent(s, html, by, at, { label = null, ai = null } = {}) {
  s.v += 1;
  s.content = html;
  s.versions.push({ v: s.v, html, by, at, label, words: htmlWords(html), hash: sha256Safe(html), ai });
  s.updatedAt = at;
  s.lastEditedBy = by;
  s.citations = citationsIn(html).map((c) => { const p = parseSrc(c.src); return { src: c.src, label: c.label, kind: p?.kind || 'other', refId: p?.id || null, v: p?.v || null }; })
    .filter((c, i, arr) => arr.findIndex((x) => x.src === c.src) === i);
  if (s.status === 'not_started') s.status = 'drafting';
}

// Clean an offline draft as if a reviewer had accepted it: drop flagged gaps and AI labels.
function reviewed(html) {
  return acceptAllAi(String(html)
    .replace(/<span data-ai="pending"><mark data-flag="needs-evidence">[\s\S]*?<\/mark><\/span>/g, '')
    .replace(/<mark data-flag="needs-evidence">[\s\S]*?<\/mark>/g, ''))
    .replace(/<li><p>\s*<\/p><\/li>/g, '').replace(/<ul><\/ul>/g, '').replace(/<p>\s*<\/p>/g, '').replace(/<p><strong>[^<]*<\/strong>\s*<\/p>/g, '').replace(/<h3>[^<]*<\/h3>$/, '');
}

const sha256Safe = (s) => sha256(String(s || ''));

// A wall-clock time in Sydney (AEST offset) as an ISO timestamp.
function at(day, hour = 10, min = 0) {
  return new Date(`${day}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00+10:00`).toISOString();
}

export function buildSeed({ now = new Date() } = {}) {
  const today = todayISO(now);
  const d = (n) => addDays(today, n);
  const ts = (n, h = 10, m = 0) => at(d(n), h, m);
  const rnd = prng(20260929);
  const state = {
    schema: 1, version: 1, createdAt: now.toISOString(), seededAt: now.toISOString(),
    settings: {
      orgName: 'CTO Consulting', website: 'www.ctoconsulting.com.au', orgAbn: '00 123 456 789', gstRate: 0.1, marginThreshold: 25, secondPartnerThreshold: 1000000,
      escalationDays: 2, expiryReminderDays: 30, cvStaleMonths: 12, teamsEnabled: true, digestHour: 7,
      costRates: { Partner: 1650, Director: 1420, 'Principal Consultant': 1180, 'Senior Consultant': 880, Consultant: 700, Analyst: 520 },
      ai: { model: 'claude-opus-5-5', defaultOn: true, promptVersion: 'draft-2026.09.2', zeroRetention: true, region: 'Australia (configure an in-country endpoint where clients require it)' },
      styleGuide: STYLE_GUIDE,
      cvFormats: [
        { id: 'cto', name: 'CTO Consulting standard CV (2 pages)', desc: 'Profile, skills, clearance, certifications and up to five engagements' },
        { id: 'short', name: 'One-page profile', desc: 'Profile, key skills and three engagements' },
        { id: 'gov', name: 'Government capability format', desc: 'Capability statements against the role, clearance and referee details' },
      ],
      retention: { requestDocuments: '7 years', outputs: '7 years', audit: '7 years', aiLogs: '2 years', personalInformation: 'Until the consultant leaves plus 2 years' },
    },
    users: [], clients: [], taxonomy: TAXONOMY, workflows: [], recipes: [], templates: [], library: [], consultants: [], rateCards: [], bids: [],
    notifications: [], outbox: [], aiLog: [], audit: [], locks: {}, jobs: {},
  };

  // People.
  for (const [id, name, title, roles, consultantKey] of USERS) {
    const email = `${name.toLowerCase().replace(/[’']/g, '').split(' ').join('.')}@demo.ctoconsulting.com.au`;
    state.users.push({ id, name, email, title, roles, active: true, consultantId: consultantKey ? `con_${consultantKey}` : null, prefs: { email: true, digest: true } });
  }
  for (const c of CONSULTANTS) {
    const user = state.users.find((u) => u.consultantId === `con_${c.key}`);
    state.consultants.push({
      id: `con_${c.key}`, userId: user?.id || null, name: c.name, role: c.role, level: c.level, skills: c.skills, certifications: c.certs, clearance: c.clearance, sectors: c.sectors, years: c.years,
      availability: c.key === 'zara' ? { status: 'partial', pct: 50, from: d(21) } : c.key === 'ethan' ? { status: 'unavailable', pct: 0, from: d(45), note: 'Committed to a long engagement' } : { status: 'available', pct: 100, from: today },
      rateBand: c.level, costRate: c.cost, bio: c.bio, education: '', photo: null,
      experience: CASE_STUDIES.filter((cs) => cs.summary.includes(c.name.split(' ')[0]) || c.bio.includes(cs.client)).map((cs) => ({ client: cs.client, role: c.role, period: `${cs.start.slice(0, 4)}–${cs.end.slice(0, 4)}`, summary: cs.title })),
      updatedAt: c.key === 'liam' ? ts(-420) : ts(-rnd.int(10, 200)),
    });
  }
  for (const [id, name, shortName, sector, jurisdiction, confidentiality] of CLIENTS) state.clients.push({ id, name, shortName, sector, jurisdiction, confidentiality, abn: '', aliases: shortName !== name ? [shortName].filter((a) => a.length > 4) : [] });

  // Workflow templates (WF-06).
  state.workflows.push(
    { id: 'wf_standard', name: 'Standard proposal', description: 'Nine stages and three gates. The default for most tenders.', default: true, stages: ['intake', 'qualify', 'plan', 'author', 'review', 'approve', 'produce', 'submit', 'outcome'], gates: { g1: { enabled: true, approvers: [{ role: 'partner', count: 1 }] }, g2: { enabled: true, approvers: [{ role: 'commercial', count: 1 }] }, g3: { enabled: true, approvers: [{ role: 'partner', count: 1 }] } }, rules: [{ id: 'rl_value', gate: 'g3', field: 'value', op: '>=', value: 1000000, role: 'partner', count: 2, label: 'Bids of $1M or more need a second partner' }, { id: 'rl_margin', gate: 'g2', field: 'marginPct', op: '<', value: 25, role: 'commercial', count: 2, label: 'Margin below 25% needs a second commercial approval' }], reviewRounds: ['solution', 'red'] },
    { id: 'wf_short', name: 'Short-form response', description: 'For panel work orders and short responses: no separate plan or review stage.', default: false, stages: ['intake', 'qualify', 'author', 'approve', 'produce', 'submit', 'outcome'], gates: { g1: { enabled: true, approvers: [{ role: 'partner', count: 1 }] }, g2: { enabled: true, approvers: [{ role: 'commercial', count: 1 }] }, g3: { enabled: true, approvers: [{ role: 'partner', count: 1 }] } }, rules: [{ id: 'rl_margin_s', gate: 'g2', field: 'marginPct', op: '<', value: 25, role: 'commercial', count: 2, label: 'Margin below 25% needs a second commercial approval' }], reviewRounds: ['solution'] },
    { id: 'wf_strategic', name: 'Strategic pursuit', description: 'Must-win bids over $2M: two partners at bid/no-bid and sign-off, partner on commercial approval, gold team review.', default: false, stages: ['intake', 'qualify', 'plan', 'author', 'review', 'approve', 'produce', 'submit', 'outcome'], gates: { g1: { enabled: true, approvers: [{ role: 'partner', count: 2 }] }, g2: { enabled: true, approvers: [{ role: 'commercial', count: 1 }, { role: 'partner', count: 1 }] }, g3: { enabled: true, approvers: [{ role: 'partner', count: 2 }] } }, rules: [{ id: 'rl_margin_x', gate: 'g2', field: 'marginPct', op: '<', value: 30, role: 'commercial', count: 2, label: 'Margin below 30% needs a second commercial approval' }], reviewRounds: ['solution', 'red', 'gold'] },
  );

  // Deck recipes (PP-02).
  for (const r of RECIPES) state.recipes.push({ id: r.id, name: r.name, use: r.use, could: Boolean(r.could), slides: r.slides.map((k, i) => ({ id: `${r.id}_${i}`, kind: k, title: SLIDE_KINDS[k].title, layout: SLIDE_KINDS[k].layout, optional: ['agenda', 'questions', 'contacts'].includes(k) })) });

  // Templates (WD-05, PP-01). Built-in templates are generated in the browser from code.
  state.templates.push(
    { id: 'tpl_word_default', kind: 'word', name: 'CTO Consulting proposal', builtIn: 'proposal', version: 3, status: 'approved', default: true, brandVersion: '2026.1', uploadedAt: ts(-120), by: 'u_nina', placeholders: [], issues: [] },
    { id: 'tpl_word_short', kind: 'word', name: 'CTO Consulting short-form response', builtIn: 'short', version: 2, status: 'approved', default: false, brandVersion: '2026.1', uploadedAt: ts(-120), by: 'u_nina', placeholders: [], issues: [] },
    { id: 'tpl_ppt_master', kind: 'pptx', name: 'CTO Consulting presentation master', builtIn: 'master', version: 2, status: 'approved', default: true, brandVersion: '2026.1', uploadedAt: ts(-120), by: 'u_nina', layouts: [], mapping: {}, issues: [] },
  );

  // Rate cards (PR-04).
  const fy = today.slice(5, 7) >= '07' ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const rates = (a) => ['Partner', 'Director', 'Principal Consultant', 'Senior Consultant', 'Consultant', 'Analyst'].map((level, i) => ({ level, rate: a[i] }));
  state.rateCards.push(
    { id: 'rc_std', name: `CTO Consulting standard rates FY${fy}–${String(fy + 1).slice(2)}`, kind: 'standard', clientId: null, panel: '', currency: 'AUD', gst: 'exclusive', validFrom: `${fy}-07-01`, validTo: `${fy + 1}-06-30`, status: 'approved', rates: rates([3300, 2900, 2450, 1950, 1550, 1150]) },
    { id: 'rc_buyict', name: 'BuyICT Digital Marketplace Panel 2 ceiling rates', kind: 'panel', clientId: null, panel: 'BuyICT Digital Marketplace Panel 2', currency: 'AUD', gst: 'exclusive', validFrom: `${fy - 1}-07-01`, validTo: `${fy + 2}-06-30`, status: 'approved', rates: rates([2900, 2600, 2250, 1800, 1450, 1050]) },
    { id: 'rc_nsw', name: 'ICT Professional Services Panel (NSW) ceiling rates', kind: 'panel', clientId: null, panel: 'NSW ICT Professional Services Panel', currency: 'AUD', gst: 'exclusive', validFrom: `${fy - 1}-07-01`, validTo: `${fy + 1}-12-31`, status: 'approved', rates: rates([3000, 2700, 2300, 1850, 1450, 1100]) },
    { id: 'rc_kestrel', name: 'Kestrel Superannuation master services agreement rates', kind: 'client', clientId: 'cl_kestrel', panel: '', currency: 'AUD', gst: 'exclusive', validFrom: `${fy - 1}-01-01`, validTo: `${fy + 1}-12-31`, status: 'approved', rates: rates([2400, 2100, 1500, 1150, 900, 700]) },
  );

  // Content library.
  const clientByName = (n) => state.clients.find((c) => c.name === n)?.id || null;
  const created = ts(-400);
  for (const cs of CASE_STUDIES) {
    const fields = { client: cs.client, sector: cs.sector, services: cs.services, technologies: cs.technologies, value: cs.value, start: cs.start, end: cs.end, outcomes: cs.outcomes, referee: cs.referee, summary: cs.summary, challenge: cs.challenge, approach: cs.approach, anonymisedName: cs.anonymised };
    const versions = [{ data: { title: cs.title, fields, anonymised: { title: cs.anonymised } } }];
    if (cs.key === 'CS-001') {
      versions[0].status = 'superseded';
      versions.push({ at: ts(-60), note: 'Added first-year cost outcome and internal team certification', data: { title: cs.title, fields: { ...fields }, anonymised: { title: cs.anonymised } } });
      versions[0].data.fields = { ...fields, outcomes: fields.outcomes.slice(0, 3) };
    }
    mkLib(state, { key: cs.key, type: 'case_study', title: cs.title, createdAt: created, ownerId: cs.key === 'CS-003' ? 'u_marcus' : 'u_nina', clientId: clientByName(cs.client), confidential: cs.confidential, consent: cs.consent, reviewDate: d(cs.key === 'CS-007' ? -12 : rnd.int(60, 330)), lastReviewed: d(-rnd.int(20, 200)), tags: { sectors: [cs.sector], offerings: cs.services.filter((s) => TAXONOMY.offerings.includes(s)), technologies: cs.technologies.filter((t) => TAXONOMY.technologies.includes(t)), regions: [state.clients.find((c) => c.name === cs.client)?.jurisdiction].filter(Boolean) }, versions });
  }
  for (const sa of STANDARD_ANSWERS) {
    const versions = [{ data: { title: sa.title, body: sa.body, topic: sa.topic, variants: sa.variants } }];
    if (sa.key === 'SA-003') { versions[0].status = 'superseded'; versions.push({ at: ts(-45), note: 'Updated to ISO/IEC 27001:2022', data: { title: sa.title, body: sa.body, topic: sa.topic, variants: sa.variants } }); versions[0].data.body = sa.body.replace('27001:2022', '27001:2013'); }
    mkLib(state, { key: sa.key, type: 'standard_answer', title: sa.title, createdAt: created, ownerId: sa.key === 'SA-003' ? 'u_helen' : 'u_nina', reviewDate: d(sa.key === 'SA-005' ? 18 : rnd.int(40, 300)), lastReviewed: d(-rnd.int(20, 300)), tags: { capabilities: [] }, versions });
  }
  for (const m of METHODS) mkLib(state, { key: m.key, type: 'method', title: m.title, createdAt: created, ownerId: m.key === 'MT-002' ? 'u_helen' : m.key === 'MT-001' ? 'u_marcus' : 'u_nina', reviewDate: d(rnd.int(60, 300)), tags: { offerings: [m.offering].filter((o) => TAXONOMY.offerings.includes(o)) }, versions: [{ data: { title: m.title, body: m.body, offering: m.offering, phases: m.phases, deliverables: m.deliverables } }] });
  for (const e of EVIDENCE) {
    const expiry = e.expiry ? (e.key === 'EV-005' ? d(24) : e.key === 'EV-008' ? d(47) : e.key === 'EV-006' ? d(95) : d(rnd.int(180, 600))) : null;
    mkLib(state, { key: e.key, type: 'evidence', title: e.title, createdAt: created, ownerId: 'u_nina', expiry, reviewDate: expiry || d(300), versions: [{ data: { title: e.title, body: e.body, issuer: e.issuer } }] });
  }
  mkLib(state, { key: 'EV-009', type: 'evidence', title: 'ISO/IEC 27001:2013 certificate (superseded)', createdAt: ts(-900), ownerId: 'u_nina', expiry: d(-200), reviewDate: d(-200), retired: true, versions: [{ data: { title: 'ISO/IEC 27001:2013 certificate (superseded)', body: '<p>Certification to ISO/IEC 27001:2013. Replaced by the 2022 certificate.</p>', issuer: 'Demonstration Certification Body' } }] });
  for (const p of PAST_PROPOSALS) mkLib(state, { key: p.key, type: 'past_proposal', title: p.title, createdAt: created, ownerId: 'u_nina', clientId: clientByName(p.client), confidential: true, consent: 'no', reviewDate: d(rnd.int(100, 400)), versions: [{ data: { title: p.title, body: `<p>Outcome: ${p.outcome}. Contract value $${p.value.toLocaleString('en-AU')}.</p><p>Evaluator feedback: ${p.feedback}</p>`, fields: { outcome: p.outcome, client: p.client, value: p.value, feedback: p.feedback } } }] });
  mkLib(state, { key: 'TP-001', type: 'proposal_template', title: 'CTO Consulting proposal (Word template)', createdAt: created, ownerId: 'u_nina', reviewDate: d(200), versions: [{ data: { title: 'CTO Consulting proposal (Word template)', body: '<p>The default Word template. Uses the tag syntax in section 9.2 of the specification. Managed under Templates.</p>', templateId: 'tpl_word_default' } }] });
  mkLib(state, { key: 'PT-001', type: 'presentation_template', title: 'CTO Consulting presentation master', createdAt: created, ownerId: 'u_nina', reviewDate: d(200), versions: [{ data: { title: 'CTO Consulting presentation master', body: '<p>Master with title, content, two-column, timeline, team, case study, table and section layouts.</p>', templateId: 'tpl_ppt_master' } }] });
  mkLib(state, { key: 'MD-001', type: 'media', title: 'CTO Consulting logo', createdAt: created, ownerId: 'u_nina', reviewDate: d(300), versions: [{ data: { title: 'CTO Consulting logo', body: '<p>Primary logo on navy and on white. Usage: all proposals and presentations.</p>', alt: 'CTO Consulting logo', usageRights: 'Owned by CTO Consulting' } }] });
  // Drafts in the pipeline.
  mkLib(state, { key: 'CS-011', type: 'case_study', title: 'Microsoft 365 records migration for a regional council', createdAt: ts(-3), ownerId: 'u_marcus', clientId: 'cl_harbourside', confidential: false, consent: 'pending', reviewDate: d(365), tags: { sectors: ['Local government'], offerings: ['Cloud migration'] }, versions: [{ status: 'draft', by: 'u_marcus', at: ts(-3), data: { title: 'Microsoft 365 records migration for a regional council', fields: { client: 'Harbourside City Council', sector: 'Local government', services: ['Cloud migration', 'Records management'], technologies: ['Microsoft 365'], value: 180000, start: d(-300), end: d(-120), outcomes: ['2.1 million records migrated to Microsoft 365'], summary: 'We migrated the council’s records to Microsoft 365 with retention labels applied.', referee: '', anonymisedName: 'A metropolitan council' }, anonymised: { title: 'A metropolitan council' } } }] });
  mkLib(state, { key: 'SA-015', type: 'standard_answer', title: 'Cloud cost optimisation', createdAt: ts(-2), ownerId: 'u_marcus', reviewDate: d(365), versions: [{ status: 'in_review', by: 'u_marcus', at: ts(-2), data: { title: 'Cloud cost optimisation', topic: 'Cloud costs', variants: ['reduce cloud running costs', 'FinOps'], body: '<p>We apply FinOps practices from the first migration wave: tagging for cost allocation, right-sizing after two weeks of telemetry, and reserved capacity once usage is stable.</p><p>Our clients typically reduce cloud running costs by 20% to 35% in the first year after migration.</p>' } }] });

  // ---------- Live bids ----------
  const extract = (docs) => extractRequest(docs, { clients: state.clients });
  const mkDoc = (bidKey, doc, n, by, when) => ({ id: `doc_${bidKey}_${n}`, name: doc.name, type: doc.type, size: 180000 + n * 24000, mime: doc.name.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf', fileId: null, hash: sha256Safe(JSON.stringify(doc.pages)), version: 1, uploadedAt: when, by, scan: 'clean', pages: toPages(doc), textLength: JSON.stringify(doc.pages).length, sample: true });
  const baseBid = (o) => ({ ...emptyBid(), ...o, aiEnabled: o.aiEnabled ?? true });
  const applyExtraction = (bid, ext, when, by, idPrefix, { confirmed = true } = {}) => {
    bid.criteria = ext.criteria.map((c, i) => ({ ...c, id: `cr_${idPrefix}_${i + 1}` }));
    const critMap = new Map(ext.criteria.map((c, i) => [c.id, `cr_${idPrefix}_${i + 1}`]));
    bid.requirements = ext.requirements.map((r) => ({ ...r, id: `rq_${idPrefix}_${r.ref}`, criterionId: critMap.get(r.criterionId) || null, confirmed, confirmedBy: confirmed ? by : null, confirmedAt: confirmed ? when : null, extracted: { text: r.text, kind: r.kind } }));
    const dates = ext.dates.map((x, i) => ({ ...x, id: `dt_${idPrefix}_${i}` }));
    const submission = ext.submission.map((x, i) => ({ ...x, id: `si_${idPrefix}_${i}` }));
    const mark = { by, at: when };
    const confirmedMap = confirmed ? Object.fromEntries([...['client', 'title', 'reference', 'channel', 'closing'].map((k) => [k, mark]), ...dates.map((x) => [`date:${x.id}`, mark]), ...submission.map((x) => [`sub:${x.id}`, mark])]) : {};
    bid.extraction = { status: confirmed ? 'confirmed' : 'draft', mode: 'rules', model: null, at: when, by, docIds: bid.documents.map((x) => x.id), fields: ext.fields, closing: ext.closing, dates, submission, pricing: ext.pricing, forms: ext.forms, confirmed: confirmedMap, corrections: [], confirmedAt: confirmed ? when : null };
  };
  const gatePass = (bid, gateId, deciders, when, snapLabel) => {
    const snap = { id: `snap_${bid.id.slice(4)}_${gateId}`, label: snapLabel || `Gate ${gateId.slice(1)}`, gateId, at: when, by: bid.bidManagerId, sections: bid.sections.map((s) => ({ id: s.id, title: s.title, v: s.v, status: s.status, hash: sha256Safe(s.content) })), pricingHash: sha256Safe(JSON.stringify(bid.pricing)), passedAt: when };
    bid.snapshots.push(snap);
    bid.gates[gateId] = { status: 'passed', requestId: snap.id, snapshotId: snap.id, requestedAt: when, requestedBy: bid.bidManagerId, passedAt: when, decisions: deciders.map(([by, role], i) => ({ id: `dc_${bid.id.slice(4)}_${gateId}_${i}`, requestId: snap.id, by, role, decision: 'approve', conditions: '', comment: 'Approved.', at: when, snapshotId: snap.id })) };
  };
  const stages = (bid, list) => { bid.stageHistory = list.map(([stage, when]) => ({ stage, at: when, by: bid.bidManagerId })); bid.stage = list[list.length - 1][0]; };

  // A. Southern Rivers Water Authority: Author stage, the showcase bid.
  {
    const base = d(-6);
    const dates = srwaDates(base);
    const bid = baseBid({ id: 'bid_srwa', ref: `CTO-${today.slice(0, 4)}-041`, title: 'Cloud Migration and Cyber Security Uplift Program', clientId: 'cl_srwa', workflowId: 'wf_standard', value: 1450000, closing: { date: dates.closing, time: '14:00', tz: 'Australia/Sydney' }, partnerId: 'u_helen', bidManagerId: 'u_sophie', channel: 'NSW eTendering', clientRef: 'SRWA-RFQ-2026-031', offering: 'Cloud migration', sector: 'Water and utilities', createdAt: ts(-6, 9), createdBy: 'u_sophie', source: 'email', flags: { lot_2: true } });
    bid.members = [{ userId: 'u_daniel', role: 'partner' }, { userId: 'u_rebecca', role: 'commercial' }, { userId: 'u_james', role: 'commercial' }, { userId: 'u_tom', role: 'reviewer' }, { userId: 'u_chen', role: 'reviewer' }];
    bid.documents.push(mkDoc('srwa', srwaRfq(base), 1, 'u_sophie', ts(-6, 9, 20)));
    const ext = extract(bid.documents);
    applyExtraction(bid, ext, ts(-6, 9, 40), 'u_sophie', 'srwa');
    bid.extraction.corrections.push({ field: 'date:dt_srwa_0', from: { label: 'Request issued' }, to: { label: 'RFQ issued' }, by: 'u_sophie', at: ts(-6, 9, 50) });
    bid.extraction.confirmedAt = ts(-6, 10, 25);
    stages(bid, [['intake', ts(-6, 9)], ['qualify', ts(-6, 9, 40)], ['plan', ts(-5, 15)], ['author', ts(-4, 11)]]);
    bid.brief = buildBrief(state, bid);
    bid.scorecard = null;
    const ownerOf = { executive_summary: 'u_helen', understanding: 'u_marcus', approach: 'u_marcus', essential_eight: 'u_aisha', delivery_plan: 'u_sam', transition: 'u_oliver', governance: 'u_sam', team: 'u_sam', experience: 'u_marcus', commercial: 'u_sophie', compliance: 'u_sophie' };
    const outline = [
      { key: 'executive_summary', title: 'Executive summary', wordLimit: 500, reviewers: ['u_daniel'], brief: 'Lead with the June 2027 exit deadline and Maturity Level 2. Three win themes. Draft last.' },
      { key: 'understanding', title: 'Understanding of the Authority’s requirements', wordLimit: 600, reviewers: ['u_tom'], brief: 'Show we understand the data centre deadline, the audit finding and the capability goal.' },
      { key: 'approach', title: 'Proposed approach and methodology', wordLimit: 1400, contributors: ['u_aisha'], reviewers: ['u_tom', 'u_chen'], brief: 'Wave planning, landing zone, data sovereignty and OT segmentation.' },
      { key: 'essential_eight', title: 'Essential Eight uplift (Lot 2)', wordLimit: 800, reviewers: ['u_tom'], brief: 'Assessment method, prioritisation and the evidence pack.' },
      { key: 'delivery_plan', title: 'Delivery plan and timeline', wordLimit: 600, reviewers: ['u_tom'] },
      { key: 'transition', title: 'Transition, knowledge transfer and change management', wordLimit: 700, reviewers: ['u_chen'], brief: 'Shadowing, reverse shadowing, champions and training for the internal team and MSP.' },
      { key: 'governance', title: 'Governance, risk and benefits realisation', wordLimit: 600, reviewers: ['u_tom'] },
      { key: 'team', title: 'Proposed team and key personnel', wordLimit: 900, reviewers: ['u_daniel'], brief: 'Name the engagement lead (M5). Clearances (M3).' },
      { key: 'experience', title: 'Relevant experience and case studies', wordLimit: 900, reviewers: ['u_tom'] },
      { key: 'commercial', title: 'Commercial response and pricing', wordLimit: 400, reviewers: ['u_rebecca'], commercial: true },
      { key: 'compliance', title: 'Compliance, insurance and corporate obligations', wordLimit: 500, reviewers: ['u_rebecca'], commercial: true },
    ];
    const due = addBusinessDays(dates.closing, -7);
    bid.sections = outline.map((s, i) => sec(bid, { ...s, ownerId: ownerOf[s.key], due: s.key === 'delivery_plan' ? d(-1) : s.key === 'executive_summary' ? addBusinessDays(dates.closing, -4) : due }, i + 1));
    const S = Object.fromEntries(bid.sections.map((s) => [s.key, s]));
    const map = { M1: ['approach'], M2: ['approach'], M10: ['approach'], '2.4': ['approach', 'understanding'], M6: ['essential_eight'], M4: ['essential_eight', 'compliance'], M8: ['transition'], D2: ['transition'], D5: ['governance'], M3: ['team'], M5: ['team'], D3: ['team'], D1: ['experience'], M7: ['compliance'], M9: ['compliance'], D4: ['compliance'], '7.2': ['commercial'], '7.3': ['commercial'], D6: ['approach'] };
    for (const r of bid.requirements) r.sectionIds = (map[r.ref] || []).map((k) => S[k].id);
    for (const r of bid.requirements) { r.compliance = map[r.ref] ? 'comply' : ''; r.ownerId = r.sectionIds.length ? bid.sections.find((s) => s.id === r.sectionIds[0]).ownerId : null; }
    bid.requirements.find((r) => r.ref === 'D6').compliance = 'partial';
    // Content and statuses.
    setContent(S.executive_summary, SRWA_CONTENT.executive_summary.v1, 'u_helen', ts(-1, 16), { ai: { action: 'draft', engine: 'offline' } });
    S.executive_summary.aiHistory.push({ at: ts(-1, 16), by: 'u_helen', action: 'draft', engine: 'offline', model: null, promptVersion: 'draft-2026.09.2', v: 1, text: 'CTO Consulting is pleased to respond', sources: [] });
    setContent(S.understanding, SRWA_CONTENT.understanding.v1, 'u_marcus', ts(-3, 14));
    S.understanding.status = 'in_review';
    S.understanding.comments.push(
      { id: 'cm_srwa_1', quote: 'with confidence once the program ends', text: 'Can we quantify this? The criteria reward measurable outcomes. @Marcus', by: 'u_tom', at: ts(-1, 11), status: 'open', replies: [{ id: 'rp_1', text: 'Good point — I will add the certification numbers from Murray Basin.', by: 'u_marcus', at: ts(-1, 12), mentions: [] }], mentions: ['u_marcus'], v: 1, suggestion: null },
      { id: 'cm_srwa_2', quote: 'sets a hard deadline for the migration program', text: 'Tighter wording.', by: 'u_tom', at: ts(-1, 11, 5), status: 'open', replies: [], mentions: [], v: 1, suggestion: { replacement: 'sets a fixed deadline for the migration' } },
    );
    S.understanding.scores.push({ id: 'sc_1', by: 'u_tom', round: 'solution', scores: { cr_srwa_1: 7, cr_srwa_2: 6 }, comment: 'Clear, but add outcomes.', at: ts(-1, 11), v: 1 });
    setContent(S.approach, SRWA_CONTENT.approach.v1, 'u_marcus', ts(-4, 15), { label: null, ai: { action: 'draft', engine: 'offline' } });
    S.approach.aiHistory.push({ at: ts(-4, 15), by: 'u_marcus', action: 'draft', engine: 'offline', model: null, promptVersion: 'draft-2026.09.2', v: 1, text: 'Our cloud migration framework moves workloads in waves sequenced by business criticality, dependencies and contractual exit dates.', sources: ['lib:lib_mt001@1'] });
    setContent(S.approach, SRWA_CONTENT.approach.v3.replace('Phase 3: optimise', 'Phase 3: optimisation'), 'u_marcus', ts(-3, 10), { label: 'Ready for review' });
    setContent(S.approach, SRWA_CONTENT.approach.v3, 'u_aisha', ts(-2, 12));
    S.approach.status = 'approved';
    S.approach.approvals.push({ id: 'ap_1', by: 'u_tom', v: 3, at: ts(-1, 9), comment: 'Strong and specific.', decision: 'approve' }, { id: 'ap_2', by: 'u_chen', v: 3, at: ts(-1, 10), comment: '', decision: 'approve' });
    S.approach.versions[2].label = 'Approved';
    S.approach.scores.push({ id: 'sc_2', by: 'u_tom', round: 'solution', scores: { cr_srwa_2: 9, cr_srwa_3: 7 }, comment: '', at: ts(-1, 9), v: 3 }, { id: 'sc_3', by: 'u_chen', round: 'solution', scores: { cr_srwa_2: 8 }, comment: '', at: ts(-1, 10), v: 3 });
    setContent(S.essential_eight, SRWA_CONTENT.essential_eight.v1, 'u_aisha', ts(-2, 16));
    S.essential_eight.status = 'in_review';
    S.essential_eight.scores.push({ id: 'sc_4', by: 'u_tom', round: 'solution', scores: { cr_srwa_2: 8, cr_srwa_4: 8 }, comment: '', at: ts(0, 9), v: 1 });
    setContent(S.delivery_plan, SRWA_CONTENT.delivery_plan.v1, 'u_sam', ts(-2, 10));
    setContent(S.team, SRWA_CONTENT.team.v1, 'u_sam', ts(-1, 15));
    setContent(S.experience, SRWA_CONTENT.experience.v1, 'u_marcus', ts(-3, 16));
    S.experience.status = 'approved';
    S.experience.approvals.push({ id: 'ap_3', by: 'u_tom', v: 1, at: ts(-2, 9), comment: '', decision: 'approve' });
    S.experience.scores.push({ id: 'sc_5', by: 'u_tom', round: 'solution', scores: { cr_srwa_4: 9 }, comment: 'Excellent utility match.', at: ts(-2, 9), v: 1 });
    setContent(S.commercial, SRWA_CONTENT.commercial.v1, 'u_sophie', ts(-1, 10));
    setContent(S.compliance, SRWA_CONTENT.compliance.v1, 'u_sophie', ts(-2, 11));
    S.compliance.status = 'in_review';
    bid.plan = { winThemes: ['A proven, low-risk migration method with a rehearsed rollback for every wave', 'Evidence-based cyber uplift that an auditor will accept', 'Capability left behind: the Authority’s team runs what we build'], published: true, publishedAt: ts(-4, 11), publishedBy: 'u_sophie', milestones: backSchedule(dates.closing, base).map((m) => ({ ...m, done: ['gate1', 'plan'].includes(m.key) })) };
    bid.staffing = [
      { id: 'st_srwa_1', consultantId: 'con_sam', role: 'Engagement lead', level: 'Principal Consultant', days: 120, include: true, keyPerson: true, availability: 'confirmed' },
      { id: 'st_srwa_2', consultantId: 'con_marcus', role: 'Lead cloud architect', level: 'Principal Consultant', days: 110, include: true, keyPerson: true, availability: 'confirmed' },
      { id: 'st_srwa_3', consultantId: 'con_aisha', role: 'Cyber security lead', level: 'Senior Consultant', days: 100, include: true, keyPerson: true, availability: 'pending' },
      { id: 'st_srwa_4', consultantId: 'con_liam', role: 'Data migration engineer', level: 'Consultant', days: 80, include: true, availability: 'pending' },
      { id: 'st_srwa_5', consultantId: 'con_oliver', role: 'Change and training lead', level: 'Senior Consultant', days: 45, include: true, availability: 'confirmed' },
      { id: 'st_srwa_6', consultantId: 'con_helen', role: 'Engagement partner', level: 'Partner', days: 12, include: true, availability: 'confirmed' },
      { id: 'st_srwa_7', consultantId: null, role: 'Cloud engineer (to be named)', level: 'Consultant', days: 120, include: true, availability: null },
    ];
    bid.pricing = { ...bid.pricing, model: 'fixed', rateCardId: 'rc_nsw', discountPct: 0, contingencyPct: 10, expenses: [{ id: 'ex_1', label: 'Travel to regional sites', amount: 18000 }], milestones: [{ id: 'mi_1', label: 'Discovery and wave plan accepted', pct: 15 }, { id: 'mi_2', label: 'Landing zone accepted', pct: 25 }, { id: 'mi_3', label: 'Migration waves complete', pct: 40 }, { id: 'mi_4', label: 'Transition to operations complete', pct: 20 }], assumptions: [{ id: 'as_1', text: 'The Authority provides access to application owners within five business days of request.' }, { id: 'as_2', text: 'Azure consumption costs are paid directly by the Authority.' }, { id: 'as_3', text: 'Up to 180 applications are in scope; additional applications are priced as a variation.' }], risks: [{ id: 'rk_1', text: 'Undocumented dependencies extend migration waves', rating: 'Medium', mitigation: 'Automated discovery plus a 10% contingency in the fixed price.' }, { id: 'rk_2', text: 'Clearance delays for new team members', rating: 'Low', mitigation: 'All named personnel already hold Baseline or higher.' }], departures: [{ id: 'dp_1', clause: 'Clause 14.2 (Liability)', departure: 'Liability capped at one times the contract value rather than two times.', rationale: 'Aligns with the NSW Government ICT purchasing framework standard cap.' }] };
    bid.clarifications = [
      { id: 'cq_1', ref: 'Q1', question: 'Are the Authority’s SCADA historian servers in scope for migration, given OT systems are out of scope?', askedAt: d(-4), answer: 'No. Historian servers remain on premises and are out of scope.', answeredAt: d(-2), sectionIds: [S.approach.id, S.understanding.id], status: 'answered', by: 'u_marcus', at: ts(-4) },
      { id: 'cq_2', ref: 'Q2', question: 'Can Lot 2 be priced as a fixed price rather than capped time and materials?', askedAt: d(-1), answer: '', answeredAt: null, sectionIds: [S.commercial.id], status: 'asked', by: 'u_sophie', at: ts(-1) },
    ];
    gatePass(bid, 'g1', [['u_helen', 'partner']], ts(-5, 15), 'Gate 1: bid/no-bid');
    bid.gates.g1.decisions[0].comment = 'Strong fit with our utility and cyber practices. Bid.';
    bid.gates.g2 = { status: 'not_requested', decisions: [] };
    bid.gates.g3 = { status: 'not_requested', decisions: [] };
    state.bids.push(bid);
    bid.scorecard = prefillScorecard(state, bid);
  }

  // B. Office of the Digital Registrar: Qualify stage with a draft extraction awaiting confirmation.
  {
    const doc = odrAtm(d(-2));
    const bid = baseBid({ id: 'bid_odr', ref: `CTO-${today.slice(0, 4)}-043`, title: 'Digital Records Modernisation Partner', clientId: 'cl_odr', workflowId: 'wf_standard', value: 850000, closing: { date: doc.closing, time: '12:00', tz: 'Australia/Sydney' }, partnerId: 'u_daniel', bidManagerId: 'u_jack', channel: 'AusTender', clientRef: 'ODR-2026-118', offering: 'Architecture', sector: 'Commonwealth government', createdAt: ts(-2, 10), createdBy: 'u_jack', source: 'crm' });
    bid.members = [{ userId: 'u_zara', role: 'author' }, { userId: 'u_ethan', role: 'author' }, { userId: 'u_tom', role: 'reviewer' }, { userId: 'u_rebecca', role: 'commercial' }];
    bid.documents.push(mkDoc('odr', doc, 1, 'u_jack', ts(-2, 10, 15)), mkDoc('odr', ODR_QUESTIONNAIRE, 2, 'u_jack', ts(-2, 10, 16)));
    applyExtraction(bid, extract([bid.documents[0]]), ts(-2, 10, 30), 'u_jack', 'odr', { confirmed: false });
    stages(bid, [['intake', ts(-2, 10)], ['qualify', ts(-2, 10, 30)]]);
    bid.pricing.rateCardId = 'rc_buyict';
    bid.pricing.model = 'capped';
    bid.plan.milestones = backSchedule(doc.closing, d(-2));
    bid.gates.g1 = { status: 'pending', decisions: [], requestId: 'g1' };
    state.bids.push(bid);
    bid.brief = buildBrief(state, bid);
    bid.scorecard = prefillScorecard(state, bid);
  }

  // C. Kestrel Superannuation: Approve stage; low margin needs a second commercial approval.
  {
    const closing = addBusinessDays(today, 7);
    const bid = baseBid({ id: 'bid_kestrel', ref: `CTO-${today.slice(0, 4)}-037`, title: 'Data and AI Governance Framework', clientId: 'cl_kestrel', workflowId: 'wf_standard', value: 640000, closing: { date: closing, time: '17:00', tz: 'Australia/Melbourne' }, partnerId: 'u_daniel', bidManagerId: 'u_sophie', channel: 'Email', clientRef: 'KS-RFP-2026-07', offering: 'Data and AI', sector: 'Financial services', createdAt: ts(-21, 9), createdBy: 'u_sophie' });
    bid.members = [{ userId: 'u_chen', role: 'author' }, { userId: 'u_mia', role: 'author' }, { userId: 'u_tom', role: 'reviewer' }, { userId: 'u_rebecca', role: 'commercial' }, { userId: 'u_james', role: 'commercial' }];
    bid.documents.push(mkDoc('kestrel', kestrelRfp(d(-21), closing), 1, 'u_sophie', ts(-21, 9, 10)));
    applyExtraction(bid, extract(bid.documents), ts(-21, 9, 30), 'u_sophie', 'kestrel');
    bid.staffing = [
      { id: 'st_k_1', consultantId: 'con_chen', role: 'Lead data and AI governance advisor', level: 'Principal Consultant', days: 45, include: true, keyPerson: true, availability: 'confirmed' },
      { id: 'st_k_2', consultantId: 'con_mia', role: 'Business analyst', level: 'Senior Consultant', days: 40, include: true, availability: 'confirmed' },
      { id: 'st_k_3', consultantId: 'con_daniel', role: 'Engagement partner', level: 'Partner', days: 5, include: true, availability: 'confirmed' },
      { id: 'st_k_4', consultantId: 'con_liam', role: 'Data engineer', level: 'Consultant', days: 20, include: true, availability: 'confirmed' },
    ];
    bid.pricing = { ...bid.pricing, model: 'tm', rateCardId: 'rc_kestrel', assumptions: [{ id: 'as_k1', text: 'Framework design covers member services and investment operations only.' }], risks: [{ id: 'rk_k1', text: 'Client master services agreement rates reduce margin below threshold', rating: 'Medium', mitigation: 'Second commercial approval; propose rate review at renewal.' }], departures: [] };
    const outline = [
      { key: 'executive_summary', title: 'Executive summary', wordLimit: 350, ownerId: 'u_chen', reviewers: ['u_tom'] },
      { key: 'approach', title: 'Approach and methodology', wordLimit: 700, ownerId: 'u_chen', reviewers: ['u_tom'] },
      { key: 'training', title: 'Data custodian training and accreditation', wordLimit: 400, ownerId: 'u_mia', reviewers: ['u_tom'] },
      { key: 'experience', title: 'Experience in financial services', wordLimit: 500, ownerId: 'u_chen', reviewers: ['u_tom'] },
      { key: 'team', title: 'Team', wordLimit: 500, ownerId: 'u_mia', reviewers: ['u_tom'] },
      { key: 'commercial', title: 'Advisory retainer and pricing', wordLimit: 300, ownerId: 'u_sophie', reviewers: ['u_rebecca'], commercial: true },
    ];
    bid.sections = outline.map((s, i) => sec(bid, { ...s, due: addBusinessDays(closing, -6) }, i + 1));
    const S = Object.fromEntries(bid.sections.map((s) => [s.key, s]));
    const map = { R1: 'approach', R2: 'approach', R3: 'approach', R4: 'training', R5: 'commercial' };
    for (const r of bid.requirements) { r.sectionIds = map[r.ref] ? [S[map[r.ref]].id] : r.category === 'Commercial' ? [S.commercial.id] : []; r.compliance = 'comply'; }
    for (const r of bid.requirements) if (!r.sectionIds.length && r.kind === 'mandatory') r.sectionIds = [S.approach.id];
    bid.plan = { winThemes: ['Responsible data and AI governance that enables innovation', 'Built for APRA-regulated funds'], published: true, publishedAt: ts(-18), publishedBy: 'u_sophie', milestones: backSchedule(closing, d(-21)).map((m) => ({ ...m, done: m.date <= today })) };
    state.bids.push(bid);
    for (const s of bid.sections.filter((x) => x.key !== 'executive_summary')) setContent(s, reviewed(draftSection(state, bid, s).html), s.ownerId, ts(-9, 11));
    setContent(S.executive_summary, reviewed(executiveSummary(state, bid, S.executive_summary).html), 'u_chen', ts(-7, 15));
    for (const s of bid.sections) { s.status = 'approved'; s.approvals.push({ id: `ap_k_${s.key}`, by: s.reviewers[0], v: s.v, at: ts(-4, 12), comment: '', decision: 'approve' }); s.scores.push({ id: `sc_k_${s.key}`, by: 'u_tom', round: 'red', scores: Object.fromEntries(bid.criteria.slice(0, 2).map((c, i) => [c.id, 6 + ((s.order + i) % 4)])), comment: '', at: ts(-4, 12), v: s.v }); }
    stages(bid, [['intake', ts(-21, 9)], ['qualify', ts(-21, 9, 30)], ['plan', ts(-20, 14)], ['author', ts(-18, 10)], ['review', ts(-7, 16)], ['approve', ts(-2, 10)]]);
    gatePass(bid, 'g1', [['u_daniel', 'partner']], ts(-20, 14), 'Gate 1: bid/no-bid');
    // Gate 2 requested; one of two commercial approvals given.
    const snap = { id: 'snap_kestrel_g2', label: 'Gate 2 request: Commercial approval', gateId: 'g2', at: ts(-2, 10), by: 'u_sophie', sections: bid.sections.map((s) => ({ id: s.id, title: s.title, v: s.v, status: s.status, hash: sha256Safe(s.content) })), pricingHash: sha256Safe(JSON.stringify(bid.pricing)) };
    bid.snapshots.push(snap);
    bid.gates.g2 = { status: 'pending', requestId: snap.id, snapshotId: snap.id, requestedAt: ts(-2, 10), requestedBy: 'u_sophie', decisions: [{ id: 'dc_k_g2_1', requestId: snap.id, by: 'u_rebecca', role: 'commercial', decision: 'approve_conditions', conditions: 'Propose a rate review at the MSA renewal.', comment: 'Margin is below threshold because of MSA rates. Acceptable for a strategic client.', at: ts(-1, 15), snapshotId: snap.id }] };
    bid.gates.g3 = { status: 'not_requested', decisions: [] };
    S.commercial.status = 'locked';
    S.commercial.lockedBy = 'g2';
    bid.pricingLocked = 'g2';
  }

  // D. Harbourside City Council: just registered (Intake).
  state.bids.push(baseBid({ id: 'bid_harbourside', ref: `CTO-${today.slice(0, 4)}-044`, title: 'Customer Portal Discovery and Roadmap', clientId: 'cl_harbourside', workflowId: 'wf_short', value: 280000, closing: { date: addBusinessDays(today, 22), time: '14:00', tz: 'Australia/Sydney' }, partnerId: 'u_daniel', bidManagerId: 'u_jack', channel: 'Direct approach', clientRef: '', offering: 'Digital services', sector: 'Local government', createdAt: ts(0, 8), createdBy: 'u_jack', source: 'manual', stage: 'intake', stageHistory: [{ stage: 'intake', at: ts(0, 8), by: 'u_jack' }], plan: { winThemes: [], published: false, milestones: backSchedule(addBusinessDays(today, 22), today) } }));

  // E. Australian Skills Assurance Commission: all gates passed, ready to produce outputs.
  {
    const closing = addBusinessDays(today, 3);
    const bid = baseBid({ id: 'bid_asac', ref: `CTO-${today.slice(0, 4)}-035`, title: 'Essential Eight Uplift Services', clientId: 'cl_asac', workflowId: 'wf_standard', value: 1100000, closing: { date: closing, time: '12:00', tz: 'Australia/Sydney' }, partnerId: 'u_helen', bidManagerId: 'u_sophie', channel: 'BuyICT', clientRef: 'ASAC-RFQ-2026-044', offering: 'Cyber security', sector: 'Commonwealth government', createdAt: ts(-24, 9), createdBy: 'u_sophie' });
    bid.members = [{ userId: 'u_aisha', role: 'author' }, { userId: 'u_tom', role: 'reviewer' }, { userId: 'u_daniel', role: 'partner' }, { userId: 'u_rebecca', role: 'commercial' }];
    bid.documents.push(mkDoc('asac', asacRfq(d(-24), closing), 1, 'u_sophie', ts(-24, 9, 10)));
    applyExtraction(bid, extract(bid.documents), ts(-24, 9, 40), 'u_sophie', 'asac');
    bid.staffing = [
      { id: 'st_a_1', consultantId: 'con_aisha', role: 'Essential Eight lead', level: 'Senior Consultant', days: 90, include: true, keyPerson: true, availability: 'confirmed' },
      { id: 'st_a_2', consultantId: 'con_helen', role: 'Engagement partner and IRAP assessor', level: 'Partner', days: 12, include: true, keyPerson: true, availability: 'confirmed' },
      { id: 'st_a_3', consultantId: 'con_tom', role: 'Quality and assurance director', level: 'Director', days: 10, include: true, availability: 'confirmed' },
      { id: 'st_a_4', consultantId: 'con_ben', role: 'Delivery lead', level: 'Consultant', days: 70, include: true, availability: 'confirmed' },
      { id: 'st_a_5', consultantId: null, role: 'Security engineer (to be named)', level: 'Consultant', days: 120, include: true, availability: null },
    ];
    bid.pricing = { ...bid.pricing, model: 'capped', rateCardId: 'rc_buyict', cap: 520000, assumptions: [{ id: 'as_a1', text: 'The Commission provides administrative access to its Intune and Defender tenants.' }, { id: 'as_a2', text: 'Application control pilots run with no more than three business units.' }], risks: [], departures: [] };
    const outline = [
      { key: 'executive_summary', title: 'Executive summary', wordLimit: 350, ownerId: 'u_helen', reviewers: ['u_daniel'] },
      { key: 'approach', title: 'Methodology and approach', wordLimit: 900, ownerId: 'u_aisha', reviewers: ['u_tom'] },
      { key: 'evidence', title: 'Evidence and assurance', wordLimit: 400, ownerId: 'u_aisha', reviewers: ['u_tom'] },
      { key: 'team', title: 'Team capability and clearances', wordLimit: 600, ownerId: 'u_aisha', reviewers: ['u_daniel'] },
      { key: 'transition', title: 'Knowledge transfer', wordLimit: 300, ownerId: 'u_aisha', reviewers: ['u_tom'] },
      { key: 'commercial', title: 'Pricing and assumptions', wordLimit: 250, ownerId: 'u_sophie', reviewers: ['u_rebecca'], commercial: true },
    ];
    bid.sections = outline.map((s, i) => sec(bid, { ...s, due: addBusinessDays(closing, -8) }, i + 1));
    const S = Object.fromEntries(bid.sections.map((s) => [s.key, s]));
    const map = { R1: 'approach', R2: 'approach', R3: 'evidence', R4: 'team', R5: 'transition' };
    for (const r of bid.requirements) { r.sectionIds = map[r.ref] ? [S[map[r.ref]].id] : r.category === 'Commercial' ? [S.commercial.id] : [S.approach.id]; r.compliance = 'comply'; r.ownerId = 'u_aisha'; }
    bid.plan = { winThemes: ['Evidence-based cyber uplift that an auditor will accept', 'A cleared, available team ready to start on day one'], published: true, publishedAt: ts(-22), publishedBy: 'u_sophie', milestones: backSchedule(closing, d(-24)).map((m) => ({ ...m, done: m.key !== 'submit' && m.key !== 'produce' })) };
    state.bids.push(bid);
    for (const s of bid.sections.filter((x) => x.key !== 'executive_summary')) setContent(s, reviewed(draftSection(state, bid, s).html), s.ownerId, ts(-12, 11));
    setContent(S.commercial, '<p>We propose capped time and materials with a cap of $520,000 (excluding GST), invoiced monthly in arrears against timesheets. All rates are at or below our BuyICT Digital Marketplace Panel 2 ceiling rates.</p><p>Our pricing assumptions are listed in the pricing schedule.</p>', 'u_sophie', ts(-11, 11));
    setContent(S.executive_summary, reviewed(executiveSummary(state, bid, S.executive_summary).html), 'u_helen', ts(-9, 15));
    for (const s of bid.sections) { s.status = 'locked'; s.lockedBy = 'g3'; s.approvals.push({ id: `ap_a_${s.key}`, by: s.reviewers[0], v: s.v, at: ts(-7, 12), comment: '', decision: 'approve' }); }
    stages(bid, [['intake', ts(-24, 9)], ['qualify', ts(-24, 9, 40)], ['plan', ts(-23, 11)], ['author', ts(-22, 10)], ['review', ts(-9, 16)], ['approve', ts(-5, 10)], ['produce', ts(-2, 15)]]);
    gatePass(bid, 'g1', [['u_helen', 'partner']], ts(-23, 11), 'Gate 1: bid/no-bid');
    gatePass(bid, 'g2', [['u_rebecca', 'commercial']], ts(-4, 14), 'Gate 2: commercial approval');
    gatePass(bid, 'g3', [['u_helen', 'partner'], ['u_daniel', 'partner']], ts(-2, 15), 'Gate 3: partner sign-off');
    bid.pricingLocked = 'g3';
  }

  // F. Tasman Freight Group: confidential bid behind an ethical wall (Plan stage).
  {
    const closing = addBusinessDays(today, 12);
    const bid = baseBid({ id: 'bid_tasman', ref: `CTO-${today.slice(0, 4)}-042`, title: 'Technology Due Diligence for a Proposed Acquisition', clientId: 'cl_tasman', workflowId: 'wf_short', value: 420000, closing: { date: closing, time: '15:00', tz: 'Australia/Brisbane' }, partnerId: 'u_helen', bidManagerId: 'u_jack', channel: 'Email', clientRef: 'TFG-CONF-2026-03', offering: 'Architecture', sector: 'Transport and logistics', createdAt: ts(-3, 9), createdBy: 'u_jack', confidential: true });
    bid.members = [{ userId: 'u_zara', role: 'author' }, { userId: 'u_rebecca', role: 'commercial' }];
    bid.ethicalWall = { users: ['u_ethan'], reason: 'Ethan Brooks previously advised the acquisition target. Excluded to manage a conflict of interest.', setBy: 'u_helen', at: ts(-3, 10) };
    bid.documents.push(mkDoc('tasman', tasmanRfp(d(-3), closing), 1, 'u_jack', ts(-3, 9, 10)));
    applyExtraction(bid, extract(bid.documents), ts(-3, 9, 30), 'u_jack', 'tasman');
    bid.sections = SHORT_OUTLINE.map((s, i) => sec(bid, { ...s, ownerId: s.key === 'commercial' ? 'u_jack' : 'u_zara', reviewers: [], due: addBusinessDays(closing, -4) }, i + 1));
    stages(bid, [['intake', ts(-3, 9)], ['qualify', ts(-3, 9, 30)], ['author', ts(-2, 10)]]);
    gatePass(bid, 'g1', [['u_helen', 'partner']], ts(-2, 10), 'Gate 1: bid/no-bid');
    bid.plan = { winThemes: [], published: true, publishedAt: ts(-2, 10), milestones: backSchedule(closing, d(-3)) };
    for (const r of bid.requirements) r.sectionIds = [bid.sections[1].id];
    state.bids.push(bid);
  }

  // ---------- Historical bids (analytics, content reuse, win rates) ----------
  const TITLES = {
    'Cloud migration': ['Cloud Migration Program', 'Data Centre Exit and Cloud Transition', 'Azure Landing Zone Build'],
    'Cyber security': ['Essential Eight Uplift', 'Cyber Security Strategy and Roadmap', 'Security Operations Uplift'],
    'Data and AI': ['Data Strategy and Governance', 'AI Governance Framework', 'Analytics Platform Discovery'],
    'Digital strategy': ['Digital Transformation Roadmap', 'ICT Strategic Plan'],
    'Program assurance': ['Independent Program Assurance', 'Program Health Check'],
    'Change management': ['Change Management Services', 'Capability Uplift Program'],
    Architecture: ['Enterprise Architecture Roadmap', 'Target State Architecture'],
    'Digital services': ['Customer Portal Discovery', 'Service Design and Delivery'],
  };
  const OFFERING_ITEMS = {
    'Cloud migration': ['MT-001', 'CS-001', 'CS-003', 'SA-013'], 'Cyber security': ['MT-002', 'CS-002', 'CS-009', 'SA-003'], 'Data and AI': ['MT-004', 'CS-006', 'SA-008'],
    'Digital strategy': ['MT-003', 'CS-010', 'SA-001'], 'Program assurance': ['CS-007', 'MT-007', 'SA-002'], 'Change management': ['MT-006', 'CS-008', 'SA-013'],
    Architecture: ['MT-003', 'CS-005', 'CS-010'], 'Digital services': ['CS-004', 'SA-010', 'MT-005'],
  };
  const histClients = ['cl_murray', 'cl_drt', 'cl_meridian', 'cl_northbridge', 'cl_coral', 'cl_npsb', 'cl_dcf', 'cl_harbourside', 'cl_kestrel', 'cl_srwa', 'cl_asac', 'cl_odr', 'cl_tasman'];
  const partnersFor = (off) => (['Cyber security', 'Cloud migration', 'Program assurance'].includes(off) ? 'u_helen' : 'u_daniel');
  const reasonsPool = ['Price', 'Price', 'Price', 'Incumbent advantage', 'Incumbent advantage', 'Capability or experience', 'Relationship', 'Scope or approach', 'Team or availability'];
  for (let i = 0; i < 24; i++) {
    const offering = rnd.pick(Object.keys(TITLES));
    const clientId = histClients[i % histClients.length];
    const client = state.clients.find((c) => c.id === clientId);
    const created = -rnd.int(45, 660);
    const r = rnd();
    const result = i === 3 || i === 17 ? 'nobid' : r < 0.46 ? 'won' : r < 0.93 ? 'lost' : 'withdrawn';
    const value = Math.round(Math.exp(Math.log(150000) + rnd() * (Math.log(3400000) - Math.log(150000))) / 10000) * 10000;
    const partnerId = partnersFor(offering);
    const bidManagerId = rnd.chance(0.55) ? 'u_sophie' : 'u_jack';
    const id = `bid_h${String(i + 1).padStart(2, '0')}`;
    const refYear = d(created).slice(0, 4);
    const bid = baseBid({ id, ref: `CTO-${refYear}-${String(100 - i).padStart(3, '0')}`, title: rnd.pick(TITLES[offering]), clientId, workflowId: value < 300000 ? 'wf_short' : 'wf_standard', value, partnerId, bidManagerId, channel: rnd.pick(['AusTender', 'BuyICT', 'NSW eTendering', 'QTenders', 'Direct approach']), clientRef: `${client.shortName.replace(/\s/g, '').toUpperCase().slice(0, 5)}-${refYear}-${rnd.int(10, 99)}`, offering, sector: client.sector, createdAt: ts(created, 9), createdBy: bidManagerId, historical: true });
    let t = created;
    const hist = [['intake', ts(t, 9)]];
    t += rnd.int(1, 4); hist.push(['qualify', ts(t, 11)]);
    if (result === 'nobid') {
      t += rnd.int(1, 4); hist.push(['archived', ts(t, 15)]);
      bid.archived = { reason: rnd.pick(['Insufficient capacity in the required timeframe', 'Poor strategic fit and strong incumbent', 'Unacceptable liability terms']), at: ts(t, 15), by: partnerId, fromStage: 'qualify', noBid: true };
      bid.gates.g1 = { status: 'rejected', requestId: 'g1', decisions: [{ id: `dc_${id}_g1`, requestId: 'g1', by: partnerId, role: 'partner', decision: 'reject', comment: bid.archived.reason, at: ts(t, 15) }] };
      stages(bid, hist);
      state.bids.push(bid);
      continue;
    }
    for (const [stage, lo, hi] of [['plan', 1, 4], ['author', 1, 4], ['review', 7, 18], ['approve', 3, 8], ['produce', 2, 5], ['submit', 1, 3], ['outcome', 0, 1]]) { t += rnd.int(lo, hi); hist.push([stage, ts(t, 10 + rnd.int(0, 6))]); }
    const submittedDay = t;
    bid.closing = { date: d(submittedDay), time: '14:00', tz: 'Australia/Sydney' };
    t += rnd.int(18, 60);
    hist.push(['closed', ts(Math.min(t, -1), 16)]);
    stages(bid, hist);
    const items = OFFERING_ITEMS[offering];
    const keys = rnd.shuffle(items).slice(0, 3);
    const outline = (value < 300000 ? SHORT_OUTLINE : DEFAULT_OUTLINE).slice(0, value < 300000 ? 4 : 6);
    bid.sections = outline.map((s, k) => sec(bid, { ...s, ownerId: rnd.pick(['u_marcus', 'u_aisha', 'u_chen', 'u_zara', 'u_sam', 'u_oliver']), due: d(submittedDay - 5) }, k + 1));
    bid.sections.forEach((s, k) => {
      const key = keys[k % keys.length];
      const item = state.library.find((x) => x.key === key);
      const v = item.versions.filter((x) => x.at <= ts(created + 5)).map((x) => x.v).pop() || 1;
      const html = `<p>${s.title} for ${client.name}, drawing on ${item.title.toLowerCase()}.<cite data-src="lib:${item.id}@${v}" data-label="${item.key}" data-kind="library">${item.key}</cite></p>`;
      setContent(s, html, s.ownerId, ts(created + 8, 12));
      if (rnd.chance(0.6)) s.aiHistory.push({ at: ts(created + 7, 12), by: s.ownerId, action: 'draft', engine: rnd.chance(0.7) ? 'claude' : 'offline', model: 'claude-opus-5-5', promptVersion: 'draft-2026.03.1', v: 1, text: rnd.chance(0.72) ? `${s.title} for ${client.name}, drawing on ${item.title.toLowerCase()}.` : `An earlier draft of ${s.title.toLowerCase()} that the author substantially rewrote before review.`, sources: [`lib:${item.id}@${v}`] });
      s.status = 'locked';
      s.lockedBy = 'g3';
    });
    bid.requirements = Array.from({ length: rnd.int(8, 24) }, (_, k) => ({ id: `rq_${id}_${k}`, ref: `R${k + 1}`, text: `Requirement ${k + 1}`, kind: k % 3 ? 'mandatory' : 'desirable', sectionIds: [bid.sections[k % bid.sections.length].id], confirmed: true, compliance: 'comply' }));
    bid.extraction = { status: 'confirmed', mode: rnd.chance(0.7) ? 'claude' : 'rules', at: ts(created + 1, 10), confirmedAt: ts(created + 1, 10 + rnd.int(0, 1), rnd.int(10, 55)), corrections: Array.from({ length: rnd.int(0, 5) }, () => ({ field: 'req', by: bidManagerId })), dates: [], submission: [], fields: {}, pricing: {}, forms: [], confirmed: {} };
    gatePass(bid, 'g1', [[partnerId, 'partner']], ts(created + 2, 15));
    gatePass(bid, 'g2', [[rnd.pick(['u_rebecca', 'u_james']), 'commercial']], ts(submittedDay - 3, 15));
    gatePass(bid, 'g3', value >= 1000000 && bid.workflowId === 'wf_standard' ? [['u_helen', 'partner'], ['u_daniel', 'partner']] : [[partnerId, 'partner']], ts(submittedDay - 2, 15));
    bid.outputs = [{ id: `out_${id}_1`, kind: 'docx', name: `${bid.clientRef}_CTO_Consulting_Proposal.docx`, fileId: null, templateId: 'tpl_word_default', templateName: 'CTO Consulting proposal', templateVersion: 2, snapshotId: bid.gates.g3.snapshotId, contentVersions: bid.sections.map((s) => ({ sectionId: s.id, v: s.v })), aiModel: 'claude-opus-5-5', checks: null, final: true, submitted: true, at: ts(submittedDay - 1, 12), by: bidManagerId }];
    bid.submission = { at: `${d(submittedDay)}T13:${String(rnd.int(10, 55)).padStart(2, '0')}`, method: bid.channel, receipt: `RCPT-${rnd.int(100000, 999999)}`, notes: '', outputIds: [bid.outputs[0].id], by: bidManagerId, recordedAt: ts(submittedDay, 14), snapshotId: bid.gates.g3.snapshotId };
    const reasons = result === 'lost' ? [...new Set([rnd.pick(reasonsPool), ...(rnd.chance(0.3) ? [rnd.pick(reasonsPool)] : [])])] : [];
    bid.outcome = { result, at: d(Math.min(t, -1)), reasons, debrief: result === 'won' ? rnd.pick(['Strongest methodology and relevant utility experience.', 'Team capability scored highest; price competitive.', 'Clear evidence approach and named key personnel.']) : result === 'lost' ? rnd.pick(['Price was above the preferred respondent.', 'Incumbent retained on continuity grounds.', 'Evaluators wanted more hands-on engineering experience.']) : 'Client withdrew the opportunity.', feedback: '', awardedValue: result === 'won' ? value : null, recordedBy: partnerId, recordedAt: ts(Math.min(t, -1), 16) };
    bid.staffing = [{ id: `st_${id}`, consultantId: rnd.pick(['con_marcus', 'con_aisha', 'con_chen', 'con_zara', 'con_sam']), role: 'Lead consultant', level: 'Principal Consultant', days: Math.round(value / 4000), include: true }];
    bid.pricing = { ...bid.pricing, model: rnd.pick(['tm', 'fixed', 'capped']), rateCardId: 'rc_std' };
    state.bids.push(bid);
    // AI usage log for historical drafting.
    for (const s of bid.sections) for (const h of s.aiHistory) state.aiLog.push({ id: `ai_${s.id}`, at: h.at, userId: h.by, bidId: id, sectionId: s.id, action: 'draft', engine: h.engine, model: h.engine === 'claude' ? 'claude-opus-5-5' : null, promptVersion: h.promptVersion, inputChars: rnd.int(8000, 30000), outputChars: rnd.int(1500, 6000), inputTokens: h.engine === 'claude' ? rnd.int(3000, 9000) : null, outputTokens: h.engine === 'claude' ? rnd.int(600, 1800) : null, costUsd: h.engine === 'claude' ? Math.round(rnd.int(4, 18)) / 100 : 0, ms: rnd.int(8000, 42000), ok: true, sources: h.sources });
    if (bid.extraction.mode === 'claude') state.aiLog.push({ id: `ai_ext_${id}`, at: bid.extraction.at, userId: bidManagerId, bidId: id, action: 'extract', engine: 'claude', model: 'claude-opus-5-5', promptVersion: 'extract-2026.03.1', inputChars: rnd.int(60000, 300000), outputChars: rnd.int(8000, 20000), inputTokens: rnd.int(20000, 90000), outputTokens: rnd.int(3000, 7000), costUsd: rnd.int(40, 160) / 100, ms: rnd.int(30000, 90000), ok: true, sources: [] });
  }
  // Live-bid AI log entries.
  state.aiLog.push(
    { id: 'ai_srwa_ext', at: ts(-6, 9, 40), userId: 'u_sophie', bidId: 'bid_srwa', action: 'extract', engine: 'offline', model: null, promptVersion: 'extract-rules-1', inputChars: 9000, outputChars: 7000, costUsd: 0, ms: 420, ok: true, sources: [] },
    { id: 'ai_srwa_d1', at: ts(-4, 15), userId: 'u_marcus', bidId: 'bid_srwa', sectionId: 'sec_srwa_approach', action: 'draft', engine: 'offline', model: null, promptVersion: 'draft-2026.09.2', inputChars: 22000, outputChars: 1400, costUsd: 0, ms: 380, ok: true, sources: ['lib:lib_mt001@1'] },
    { id: 'ai_srwa_d2', at: ts(-1, 16), userId: 'u_helen', bidId: 'bid_srwa', sectionId: 'sec_srwa_executive_summary', action: 'draft', engine: 'offline', model: null, promptVersion: 'draft-2026.09.2', inputChars: 18000, outputChars: 1800, costUsd: 0, ms: 310, ok: true, sources: ['lib:lib_mt001@1', 'lib:lib_cs001@2'] },
  );
  state.bids.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  // Seeded audit trail for the live bids (hash chained like every later event).
  const events = [];
  const live = state.bids.filter((b) => !b.historical);
  for (const b of live) {
    const name = (id) => state.users.find((u) => u.id === id)?.name;
    events.push({ at: b.createdAt, actor: b.createdBy, action: 'bid.create', label: `Created bid ${b.ref}: ${b.title}`, bidId: b.id });
    for (const doc of b.documents) events.push({ at: doc.uploadedAt, actor: doc.by, action: 'doc.add', label: `Uploaded ${doc.type} document ${doc.name}`, bidId: b.id });
    if (b.extraction) events.push({ at: b.extraction.at, actor: b.extraction.by || b.bidManagerId, action: 'extraction.set', label: `Extracted ${b.requirements.length} requirements, ${b.extraction.dates.length} dates and ${b.criteria.length} evaluation criteria (rules engine)`, bidId: b.id });
    if (b.extraction?.status === 'confirmed') events.push({ at: b.extraction.confirmedAt || b.extraction.at, actor: b.bidManagerId, action: 'extraction.complete', label: `Confirmed the compliance matrix (${b.requirements.length} requirements)`, bidId: b.id });
    if (b.ethicalWall?.users?.length) events.push({ at: b.ethicalWall.at, actor: b.ethicalWall.setBy, action: 'bid.ethicalWall', label: `Set an ethical wall excluding ${b.ethicalWall.users.map(name).join(', ')}`, bidId: b.id });
    for (const g of ['g1', 'g2', 'g3']) for (const dc of b.gates[g]?.decisions || []) events.push({ at: dc.at, actor: dc.by, action: 'gate.decide', label: g === 'g1' ? 'Gate 1: decision to bid' : `Gate ${g.slice(1)}: ${dc.decision === 'approve' ? 'approved' : 'approved with conditions'} by ${name(dc.by)}`, bidId: b.id });
    if (b.plan?.publishedAt) events.push({ at: b.plan.publishedAt, actor: b.bidManagerId, action: 'plan.publish', label: 'Published the plan to the section owners', bidId: b.id });
    for (const s of b.sections) {
      for (const v of s.versions) events.push({ at: v.at, actor: v.by, action: 'section.save', label: v.ai ? `AI draft for “${s.title}” (offline engine) — pending human review` : `Edited “${s.title}” (v${v.v})`, bidId: b.id });
      for (const a of s.approvals) events.push({ at: a.at, actor: a.by, action: 'section.approve', label: `Approved “${s.title}” v${a.v}`, bidId: b.id });
      for (const c of s.comments) events.push({ at: c.at, actor: c.by, action: 'comment.add', label: `${c.suggestion ? 'Suggested an edit' : 'Commented'} on “${s.title}”`, bidId: b.id });
    }
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  for (const e of events) appendAudit(state, { ...e, actorName: state.users.find((u) => u.id === e.actor)?.name, objectType: 'bid', objectId: e.bidId });

  // Welcome notifications.
  const note = (userId, kind, title, text, bidId, link, when) => state.notifications.push({ id: `nt_seed_${state.notifications.length}`, userId, at: when, kind, title, text, bidId, link, read: false });
  note('u_james', 'approval', 'Approval needed: gate 2 for Kestrel Superannuation', 'Rebecca Stone approved with conditions. The margin is below 25%, so a second commercial approval is required.', 'bid_kestrel', '/bids/bid_kestrel/approvals', ts(-1, 15));
  note('u_marcus', 'mention', 'Tom Gallagher mentioned you in Understanding of the Authority’s requirements', 'Can we quantify this? The criteria reward measurable outcomes.', 'bid_srwa', '/bids/bid_srwa/sections/sec_srwa_understanding', ts(-1, 11));
  note('u_liam', 'availability', 'Please confirm availability: Southern Rivers Water Authority', 'You are proposed as Data migration engineer (80 days).', 'bid_srwa', '/work', ts(-2, 9));
  note('u_aisha', 'availability', 'Please confirm availability: Southern Rivers Water Authority', 'You are proposed as Cyber security lead (100 days).', 'bid_srwa', '/work', ts(-2, 9));
  note('u_daniel', 'review', 'Bid/no-bid decision needed: Office of the Digital Registrar', 'The scorecard is pre-filled. Record gate 1 at the Qualify stage.', 'bid_odr', '/bids/bid_odr/qualify', ts(-2, 11));
  note('u_nina', 'library', 'Library item for review: Cloud cost optimisation', 'Marcus Lee submitted SA-015 v1 for approval.', null, '/library/lib_sa015', ts(-2, 12));
  note('u_sophie', 'info', 'Welcome to the CTO Consulting Proposal Platform', 'Your bids in flight are on My work and Pipeline.', null, '/work', ts(0, 8));
  return state;
}
