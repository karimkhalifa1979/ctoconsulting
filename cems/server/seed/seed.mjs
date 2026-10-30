// Demo data for evaluating CEMS, generated relative to today so the system always looks current.
// Reference data is created first; then about sixteen months of engagement history are replayed on
// the application clock through the real services (approvals, timesheets, status updates, forecast
// cycles, invoicing, report issue), so the seed also exercises the business rules end to end.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newId, nowIso } from '../db.mjs';
import { addDays, weekStart, todayIn, zonedToUtc } from '../../shared/dates.js';
import { setClock } from '../../shared/clock.js';
import { svgToPng } from '../lib/reports/charts.mjs';
import { createKit } from './kit.mjs';
import { buildStories } from './stories.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function seedIfEmpty(app, opts = {}) {
  if (app.db.prepare('SELECT COUNT(*) n FROM users').get().n) return false;
  await seed(app, opts);
  return true;
}

// A valid Australian Business Number built from a nine-digit body.
function abn(body) {
  const b = String(body).padStart(9, '0').slice(-9).split('').map(Number);
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  for (let d1 = 1; d1 <= 9; d1++) {
    for (let d2 = 0; d2 <= 9; d2++) {
      const digits = [d1, d2, ...b];
      if (digits.reduce((a, c, i) => a + (i === 0 ? c - 1 : c) * w[i], 0) % 89 === 0) return `${d1}${d2} ${b.slice(0, 3).join('')} ${b.slice(3, 6).join('')} ${b.slice(6).join('')}`;
    }
  }
  return null;
}

const COST = { Partner: 230, Director: 180, 'Senior Manager': 145, Manager: 120, 'Senior Consultant': 98, Consultant: 78, Analyst: 62 };
const FIRM_RATES = { Partner: 3600, Director: 3000, 'Senior Manager': 2500, Manager: 2050, 'Senior Consultant': 1700, Consultant: 1350, Analyst: 1050 };
const PANEL_RATES = { Partner: 3150, Director: 2700, 'Senior Manager': 2280, Manager: 1880, 'Senior Consultant': 1560, Consultant: 1240, Analyst: 960 };

export const PEOPLE = [
  { key: 'olivia', name: 'Olivia Bennett', grade: 'Partner', practice: 'Strategy & Advisory', state: 'NSW', roles: ['engagement_executive'], title: 'Partner', persona: 'Engagement executive (Partner): portfolio, margin, approvals above engagement manager authority, report approval' },
  { key: 'marcus', name: 'Marcus Chen', grade: 'Director', practice: 'Digital Delivery', state: 'ACT', title: 'Director', persona: 'Engagement manager, Digital Services Transformation: three projects, weekly report, approvals' },
  { key: 'jack', name: 'Jack Thompson', grade: 'Senior Manager', practice: 'Program Assurance', state: 'VIC', title: 'Senior Manager', persona: 'Engagement manager, Clinical Systems Assurance (milestone fixed price and retainer)' },
  { key: 'priya', name: 'Priya Raman', grade: 'Senior Manager', practice: 'Digital Delivery', state: 'ACT', title: 'Senior Manager', persona: 'Project manager, Platform implementation: status update, plan, RAID, changes, timesheet approval' },
  { key: 'tom', name: 'Tom Walsh', grade: 'Manager', practice: 'Program Assurance', state: 'NSW', title: 'Manager', persona: 'Project manager on two engagements (change and adoption; assurance review)' },
  { key: 'aisha', name: 'Aisha Mohammed', grade: 'Senior Consultant', practice: 'Digital Delivery', state: 'ACT', title: 'Senior Consultant', persona: 'Team member: timesheet, assigned tasks and actions' },
  { key: 'liam', name: "Liam O'Connor", grade: 'Consultant', practice: 'Digital Delivery', state: 'NSW', title: 'Consultant' },
  { key: 'noah', name: 'Noah Singh', grade: 'Senior Consultant', practice: 'Digital Delivery', state: 'ACT', title: 'Integration Specialist (contractor)', type: 'Contractor' },
  { key: 'hannah', name: 'Hannah Brooks', grade: 'Analyst', practice: 'Strategy & Advisory', state: 'NSW', title: 'Analyst' },
  { key: 'emily', name: 'Emily Davis', grade: 'Consultant', practice: 'Strategy & Advisory', state: 'VIC', title: 'Change Consultant' },
  { key: 'lucas', name: 'Lucas Martin', grade: 'Manager', practice: 'Cyber Security', state: 'NSW', title: 'Manager, Cyber', persona: 'Engagement manager of a restricted engagement (Project Falcon) and a proposed one' },
  { key: 'chloe', name: 'Chloe Nguyen', grade: 'Senior Consultant', practice: 'Data & AI', state: 'NSW', title: 'Senior Consultant, Data' },
  { key: 'ethan', name: 'Ethan Clarke', grade: 'Consultant', practice: 'Program Assurance', state: 'VIC', title: 'Consultant' },
  { key: 'mia', name: 'Mia Roberts', grade: 'Analyst', practice: 'Program Assurance', state: 'QLD', title: 'Analyst' },
  { key: 'grace', name: 'Grace Liu', grade: 'Senior Manager', practice: 'Strategy & Advisory', state: 'NSW', roles: ['resource_manager'], title: 'Resource Manager', persona: 'Resource manager: capacity, utilisation, resource requests' },
  { key: 'daniel', name: 'Daniel Rossi', grade: 'Senior Manager', practice: null, state: 'NSW', roles: ['finance'], title: 'Finance Manager', persona: 'Finance: rate cards, period close, monthly forecast cycle, invoices, WIP' },
  { key: 'sophie', name: 'Sophie Turner', grade: 'Senior Manager', practice: 'Program Assurance', state: 'NSW', roles: ['pmo'], title: 'PMO Lead', persona: 'PMO: template library, delivery profiles, submission tracker, data quality' },
  { key: 'ben', name: 'Ben Ahmed', roles: ['sysadmin'], title: 'Systems Administrator', persona: 'System administrator: users, configuration, jobs, integrations (no engagement data, ACC-009)', noPerson: true },
  { key: 'arjun', name: 'Arjun Patel', roles: ['auditor'], title: 'Internal Auditor', persona: 'Auditor (read-only): engagements and the immutable audit log', noPerson: true },
];

const SKILLS = {
  Partner: ['Executive advisory', 'Digital strategy', 'Government transformation'], Director: ['Program management', 'Agile delivery', 'Stakeholder management'],
  'Senior Manager': ['Project management', 'PRINCE2', 'Risk management'], Manager: ['Project management', 'Business analysis', 'Assurance'],
  'Senior Consultant': ['Solution architecture', 'Integration', 'Data migration'], Consultant: ['Business analysis', 'Testing', 'Change management'], Analyst: ['Data analysis', 'Reporting', 'Excel'],
};
const EXTRA_SKILLS = { noah: ['Integration', 'API design', 'Data migration'], chloe: ['Data migration', 'SQL', 'Power BI'], lucas: ['Cyber security', 'Essential Eight', 'ISM'], emily: ['Change management', 'Training design'], aisha: ['Integration', 'Solution architecture', 'Salesforce'] };

function logoPng(text, bg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120" viewBox="0 0 360 120"><rect width="360" height="120" fill="#ffffff"/><rect x="6" y="10" width="100" height="100" rx="18" fill="${bg}"/><text x="56" y="72" font-family="DejaVu Sans, Arial" font-size="30" font-weight="bold" fill="#ffffff" text-anchor="middle">${text.slice(0, 3).toUpperCase()}</text><text x="124" y="56" font-family="DejaVu Sans, Arial" font-size="22" font-weight="bold" fill="#1f2937">${text}</text><text x="124" y="84" font-family="DejaVu Sans, Arial" font-size="13" fill="#4b5563">Client logo (demo)</text></svg>`;
  return svgToPng(svg, 6);
}

export async function seed(app, opts = {}) {
  const { pdf = true, reports = true, quiet = false } = opts;
  const log = (...a) => { if (!quiet) console.log('[seed]', ...a); };
  const started = Date.now();
  const { db, entities, settings } = app;
  const tz = settings.tz();
  const T = todayIn(tz);
  const users = {};
  const people = {};
  const kit = createKit(app, { T, users, people, log });
  const { as } = kit;
  const origin = addDays(weekStart(T), -7 * 60); // reference data predates the oldest engagement
  log(`Seeding demo data relative to ${T}…`);

  try {
    setClock(zonedToUtc(origin, '09:00', tz));
    const addUser = ({ email, name, title, roles = [], external = false, client_id = null, contact_id = null, persona = null }) => {
      const id = newId('usr');
      const now = nowIso();
      db.prepare('INSERT INTO users (id, email, name, data, active, external, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)')
        .run(id, email, name, JSON.stringify({ roles, title, client_id, contact_id, persona, notify_pref: 'immediate' }), external ? 1 : 0, now, now);
      app.audit.record({ action: 'create', entity: 'user', entityId: id, summary: `User ${name} provisioned${roles.length ? ` with ${roles.join(', ')}` : ''}` });
      return id;
    };
    const emailOf = (name) => `${name.toLowerCase().replace(/[^a-z ]/g, '').replace(/ /g, '.')}@ctoconsulting.com.au`;

    // ---------- People, users and cost rates (RES-001, FIN-005) ----------
    for (const p of PEOPLE) users[p.key] = addUser({ email: emailOf(p.name), name: p.name, title: p.title, roles: p.roles || [], persona: p.persona || null });
    for (const p of PEOPLE.filter((x) => !x.noPerson)) {
      people[p.key] = entities.create(as('grace'), 'person', {
        name: p.name, email: emailOf(p.name), user_id: users[p.key], role_title: p.title, grade: p.grade, practice: p.practice, location_state: p.state, employment_type: p.type || 'Employee',
        standard_hours: 37.5, fte: 1, active: true, skills: [...new Set([...(SKILLS[p.grade] || []), ...(EXTRA_SKILLS[p.key] || [])])].map((s, i) => ({ name: s, level: Math.max(2, 5 - (i % 3)) })),
        certifications: p.key === 'priya' ? [{ name: 'PRINCE2 Practitioner', expiry: addDays(T, 400) }] : p.key === 'lucas' ? [{ name: 'CISSP', expiry: addDays(T, 45) }] : p.key === 'marcus' ? [{ name: 'SAFe Program Consultant', expiry: addDays(T, 210) }] : [],
        clearances: ['marcus', 'priya', 'aisha', 'noah', 'liam', 'tom', 'hannah', 'emily', 'chloe', 'olivia'].includes(p.key)
          ? [{ level: p.key === 'noah' ? 'NV1' : 'Baseline', expiry: p.key === 'liam' ? addDays(T, 40) : addDays(T, 900), sponsor: 'Department of Regional Services' }] : [],
      }).id;
    }
    for (const p of PEOPLE.filter((x) => !x.noPerson)) {
      const base = p.type === 'Contractor' ? 125 : COST[p.grade];
      entities.create(as('daniel'), 'cost_rate', { person_id: people[p.key], rate: base, basis: p.type === 'Contractor' ? 'Contractor rate' : 'Fully loaded salary cost', effective_from: '2025-07-01' });
      if (p.type !== 'Contractor') entities.create(as('daniel'), 'cost_rate', { person_id: people[p.key], rate: Math.round(base * 1.03 * 100) / 100, basis: 'Fully loaded salary cost', effective_from: '2026-07-01' });
    }

    // ---------- Clients, contacts and agreements (CLI-001..005) ----------
    const logo = (text, color) => {
      const png = logoPng(text, color);
      return png ? app.files.save(png, { name: `${text}-logo.png`, mime: 'image/png', purpose: 'logo', scan: 'generated' }).id : null;
    };
    const C = {};
    const client = (key, data) => { C[key] = entities.create(as('olivia'), 'client', data); return C[key]; };
    client('drs', {
      code: 'DRS', legal_name: 'Department of Regional Services', trading_name: 'Department of Regional Services', abn: abn(381024556), sector: 'Federal government', sector_type: 'Government', status: 'Active',
      relationship_owner: users.olivia, addresses: '1 Constitution Avenue, Canberra ACT 2600', billing_entity: 'Department of Regional Services, Accounts Payable', payment_terms_days: 20,
      logo_file_id: logo('DRS', '#1f4e79'), clearance_requirements: 'Baseline clearance for all personnel; NV1 for work on the payments system', data_classification: 'OFFICIAL: Sensitive',
      reporting_frequency: 'Weekly', reporting_requirements: 'Weekly status report to the Deputy Secretary and the PMO; monthly steering committee pack', invoicing_rules: 'PO number on every invoice; lodge through the e-invoicing (Peppol) network; payment within 20 days',
      internal_notes: 'Strategic account: target three new engagements this financial year. Panel rates apply.',
    });
    client('rga', { code: 'RGA', legal_name: 'Regional Grants Agency', abn: abn(552190334), sector: 'Federal government', sector_type: 'Government', parent_id: C.drs.id, status: 'Active', payment_terms_days: 20 });
    client('hhg', {
      code: 'HHG', legal_name: 'Harbour Health Group Ltd', trading_name: 'Harbour Health', abn: abn(640118227), sector: 'Health', sector_type: 'Private', status: 'Active', relationship_owner: users.olivia,
      payment_terms_days: 30, logo_file_id: logo('Harbour', '#0f766e'), reporting_frequency: 'Weekly', data_classification: 'Confidential', invoicing_rules: 'Milestone invoices on written acceptance; retainer monthly in advance',
    });
    client('mcp', { code: 'MCP', legal_name: 'Meridian Capital Partners Pty Ltd', trading_name: 'Meridian Capital', abn: abn(773512098), sector: 'Financial services', sector_type: 'Private', status: 'Active', payment_terms_days: 14, data_classification: 'Highly confidential', internal_notes: 'Insider list maintained for Project Falcon.' });
    client('cca', { code: 'CCA', legal_name: 'Coastal Councils Alliance', abn: abn(218906543), sector: 'Local government', sector_type: 'Government', status: 'Active', payment_terms_days: 30, logo_file_id: logo('Coastal', '#9a3412') });
    const contact = (c, name, title, role, approver = false, domain = 'example.gov.au') => entities.create(as('olivia'), 'contact', {
      client_id: c.id, name, title, role, email: `${name.toLowerCase().replace(/^dr /, '').replace(/[^a-z ]/g, '').replace(/ /g, '.')}@${c.code.toLowerCase()}.${domain}`, is_approver: approver, relationship_owner: users.olivia,
    });
    const K = {
      rachel: contact(C.drs, 'Rachel Kim', 'Deputy Secretary, Grants and Programs', 'Sponsor', true),
      james: contact(C.drs, 'James Wilson', 'Director, Program Management Office', 'Client PMO lead'),
      anika: contact(C.drs, 'Dr Anika Rao', 'Chief Information Officer', 'Senior supplier'),
      sam: contact(C.drs, 'Sam Patel', 'Finance Business Partner', 'Finance'),
      helen: contact(C.hhg, 'Dr Helen Wu', 'Chief Medical Information Officer', 'Sponsor', true, 'example.com.au'),
      mark: contact(C.hhg, 'Mark Evans', 'Clinical Systems Program Director', 'Client lead', false, 'example.com.au'),
      victoria: contact(C.mcp, 'Victoria Hale', 'Managing Partner', 'Sponsor', true, 'example.com.au'),
      peter: contact(C.cca, 'Peter Grant', 'Chief Executive', 'Sponsor', true),
    };
    // External portal users (CPT-001), each linked to a client contact.
    users.rachel = addUser({ email: K.rachel.email, name: 'Rachel Kim', title: 'Deputy Secretary (client)', external: true, client_id: C.drs.id, contact_id: K.rachel.id, persona: 'Client sponsor (portal): issued reports, deliverable acceptance, change approval' });
    users.james = addUser({ email: K.james.email, name: 'James Wilson', title: 'Client PMO Director', external: true, client_id: C.drs.id, contact_id: K.james.id, persona: 'Client PMO (portal): reports, client-owned actions and dependencies' });
    users.helen = addUser({ email: K.helen.email, name: 'Dr Helen Wu', title: 'CMIO (client)', external: true, client_id: C.hhg.id, contact_id: K.helen.id, persona: 'Client approver (portal) for Harbour Health' });

    const panel = entities.create(as('olivia'), 'agreement', { client_id: C.drs.id, kind: 'Panel arrangement', reference: 'DMP-2024-117', title: 'Digital Marketplace Panel standing offer', start_date: '2024-07-01', expiry_date: addDays(T, 75), alert_days: 90, status: 'Active', liability_cap: 5000000, key_terms: 'Panel rates are ceiling rates; 20-day payment terms; IP vests in the Commonwealth' });
    entities.create(as('olivia'), 'agreement', { client_id: C.hhg.id, kind: 'Master agreement', reference: 'HHG-MSA-2025', title: 'Master services agreement', start_date: '2025-02-01', expiry_date: addDays(T, 520), status: 'Active', liability_cap: 2000000 });

    // ---------- Rate cards (FIN-004, FIN-006) ----------
    const rateLines = (map, from) => Object.entries(map).map(([role, rate]) => ({ role, rate, effective_from: from }));
    entities.create(as('daniel'), 'rate_card', { name: 'Firm standard rates', level: 'Firm', unit: 'day', currency: 'AUD', effective_from: '2025-07-01', status: 'Approved', rates: rateLines(FIRM_RATES, '2025-07-01'), indexation: 0.03, indexation_from: '2026-07-01' });
    entities.create(as('daniel'), 'rate_card', { name: 'DRS Digital Marketplace panel rates', level: 'Agreement', client_id: C.drs.id, agreement_id: panel.id, unit: 'day', currency: 'AUD', effective_from: '2024-07-01', status: 'Approved', rates: rateLines(PANEL_RATES, '2024-07-01') });

    // ---------- Report template library (RPT-001..008) ----------
    const tplDir = path.join(HERE, 'templates');
    const T_ = {};
    const library = [
      ['weeklyClient', 'weekly-engagement-client.docx', { name: 'Weekly engagement status (client)', description: 'Firm-branded weekly report across all projects in an engagement, safe for client distribution.', report_type: 'Weekly status', scope: 'Firm', level: 'engagement', audience: 'client' }],
      ['weeklyInternal', 'weekly-engagement-internal.docx', { name: 'Weekly engagement status (internal)', description: 'Internal version with cost, margin, WIP and earned value.', report_type: 'Weekly status', scope: 'Firm', level: 'engagement', audience: 'internal' }],
      ['weeklyProject', 'weekly-project-client.docx', { name: 'Weekly project status (client)', description: 'One-project report for project boards.', report_type: 'Weekly status', scope: 'Firm', level: 'project', audience: 'client' }],
      ['change', 'change-request.docx', { name: 'Change request and variation', description: 'Change request form used for variations (CHG-005).', report_type: 'Change request', scope: 'Firm', level: 'project', audience: 'client' }],
    ];
    for (const [key, file, meta] of library) {
      const t = app.reports.createTemplate(as('sophie'), meta);
      const { version } = await app.reports.upload(as('sophie'), t.id, fs.readFileSync(path.join(tplDir, file)), file);
      app.reports.submitTemplate(as('sophie'), version.id);
      kit.approve('sophie', 'template_version', version.id, { comment: 'Checked against the Firm style guide; validation clean.' });
      T_[key] = t.id;
    }

    // ---------- Engagement stories, replayed in date order ----------
    await buildStories(app, kit, { T, users, people, C, K, panel, T_, pdf, reports, log, tplDir });
    await kit.run();

    // ---------- Final touches at the real time ----------
    setClock(null);
    for (const job of ['invoice-sync', 'po-alerts', 'contract-expiry', 'clearance-expiry', 'raid-reviews', 'tolerance-monitor', 'access-expiry', 'approval-escalation', 'timesheet-deadline', 'status-cutoff', 'forecast-refresh']) {
      await app.jobs.run(job);
    }
    // People have read their older notifications; the last week stays unread.
    db.prepare('UPDATE notifications SET read_at = created_at WHERE created_at < ? AND read_at IS NULL').run(new Date(Date.now() - 6 * 86400000).toISOString());
    await app.notify.processOutbox();
    // Recent sign-ins for the access review (ACC-008); one client user has never signed in.
    for (const [key, id] of Object.entries(users)) {
      if (key === 'james') continue;
      const data = JSON.parse(db.prepare('SELECT data FROM users WHERE id = ?').get(id).data);
      data.last_login = new Date(Date.now() - (1 + (key.length % 5)) * 86400000).toISOString();
      db.prepare('UPDATE users SET data = ? WHERE id = ?').run(JSON.stringify(data), id);
    }
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded_at', ?)").run(new Date().toISOString());
    app.finance.clearMemo();
    log(`Demo data ready in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  } finally {
    setClock(null);
  }
}
