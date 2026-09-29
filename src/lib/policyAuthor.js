// Policy document authoring: builds a structured policy from the organisation's
// policy requirements, obligations and assessment results, following a template.
import { splitList } from './registerParser.js';
import { POLICIES } from './catalog.js';
import { isGov } from './profile.js';
import { computeStats } from './assessment.js';

// Default template, modelled on Australian Government policy document structure.
export const DEFAULT_TEMPLATE = [
  { id: 'purpose', heading: 'Purpose' },
  { id: 'scope', heading: 'Scope' },
  { id: 'statement', heading: 'Policy statement' },
  { id: 'authority', heading: 'Legislative and regulatory context' },
  { id: 'requirements', heading: 'Policy requirements' },
  { id: 'roles', heading: 'Roles and responsibilities' },
  { id: 'exceptions', heading: 'Exceptions and exemptions' },
  { id: 'compliance', heading: 'Compliance, monitoring and reporting' },
  { id: 'breaches', heading: 'Breaches of this policy' },
  { id: 'related', heading: 'Related documents' },
  { id: 'definitions', heading: 'Definitions' },
  { id: 'review', heading: 'Policy review' },
  { id: 'traceability', heading: 'Appendix A — Requirements traceability' },
];

const SECTION_MATCHERS = [
  ['purpose', /purpose|objective|introduction|overview|background/i],
  ['scope', /scope|applicab|who (this|the) policy applies/i],
  ['statement', /policy statement|principles|commitment/i],
  ['authority', /legislat|authorit|regulatory|obligation|mandate|framework/i],
  ['requirements', /requirement|policy detail|provisions|controls|standards|policy (content|body)/i],
  ['roles', /role|responsibilit|accountab/i],
  ['exceptions', /exception|exemption|variation|waiver/i],
  ['compliance', /compliance|monitor|reporting|assurance|measur/i],
  ['breaches', /breach|non-?compliance|consequence|misconduct/i],
  ['related', /related|reference|supporting|associated/i],
  ['definitions', /definition|glossary|terms|acronym/i],
  ['review', /review|version|history|document control|approval/i],
  ['traceability', /trace|appendix|attachment|mapping/i],
];

const PURPOSE = {
  GOV: 'govern information and communications technology (ICT) so that investment, risk, security and performance are directed and controlled in line with statutory duties and organisational strategy',
  AUP: 'set clear expectations for the authorised, lawful, secure and respectful use of ICT resources, information and accounts',
  AAP: 'ensure every ICT system is assessed and formally authorised to operate on the basis of an understood and accepted security risk',
  ASA: 'govern the lifecycle, security and lawful operation of the business applications that support the delivery of services',
  DEP: 'deliver digital services that are user-centred, accessible, inclusive, secure and trusted',
  DRP: 'ensure critical ICT services and information can be recovered within agreed objectives following disruption, including cyber incidents',
  CYB: 'protect information, systems and services from cyber threats through risk-based governance and a defined control baseline',
  ING: 'ensure system integrations and information exchanges are lawful, secure, interoperable and well governed',
  SVM: 'manage ICT services so they deliver value, meet agreed service levels and are secure and resilient throughout their lifecycle',
  INF: 'manage ICT infrastructure, hosting and facilities securely, resiliently and sustainably across its lifecycle',
  TPP: 'plan and govern the technology portfolio so that investments align to strategy, manage risk and technical debt, and realise benefits',
  TEP: 'govern technology-enabled projects so they are assured, secure by design and deliver intended outcomes and benefits',
  INT: 'deter, detect and respond to insider threats while protecting the rights, privacy and wellbeing of personnel',
  IDM: 'establish trusted identities and ensure access to information and systems is appropriate, authenticated and continuously governed',
};

const GLOSSARY = {
  'Accountable Authority': 'The person or group of persons responsible for, and with control over, the entity\'s operations (PGPA Act s12).',
  'Accountable Executive': 'The senior executive accountable for the organisation\'s operations and for approving this policy.',
  'CISO': 'Chief Information Security Officer — the executive responsible for cyber security strategy and risk.',
  'CSO': 'Chief Security Officer — the senior executive responsible for protective security.',
  'Essential Eight': 'ASD\'s prioritised set of eight mitigation strategies and maturity model.',
  'ISM': 'Information Security Manual — ASD\'s cyber security framework of principles and controls.',
  'PSPF': 'Protective Security Policy Framework — the Australian Government\'s protective security policy.',
  'PGPA Act': 'Public Governance, Performance and Accountability Act 2013 (Cth).',
  'Personal information': 'Information or an opinion about an identified individual, or an individual who is reasonably identifiable (Privacy Act 1988 s6).',
  'Sensitive information': 'A subset of personal information, including health information, that attracts additional protections under the Privacy Act.',
  'Protected information': 'Information protected from disclosure by legislation, including secrecy provisions.',
  'Data breach': 'Unauthorised access to, disclosure of, or loss of information.',
  'MFA': 'Multi-factor authentication — authentication using two or more different factors.',
  'Privileged access': 'Access that allows a user to change system configuration, security settings or other users\' access.',
  'Critical infrastructure asset': 'An asset specified in the Security of Critical Infrastructure Act 2018.',
  'RTO / RPO': 'Recovery Time Objective and Recovery Point Objective — the maximum tolerable downtime and data loss.',
  'Third party': 'Any supplier, contractor, service provider or partner that accesses, stores or processes the organisation\'s information or systems.',
  'Record': 'Information created, received or kept as evidence of business activity.',
  'Artificial intelligence (AI)': 'An engineered system that generates outputs such as predictions, content, recommendations or decisions.',
  'Exception': 'An approved, time-limited departure from a requirement of this policy.',
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const count = (arr) => arr.reduce((m, v) => (v ? ((m[v] = (m[v] || 0) + 1), m) : m), {});
const top = (arr, n = 1) => Object.entries(count(arr)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

function roleList(text) {
  return splitList(String(text || '').replace(/\s*;\s*/g, ';')).map((r) => r.replace(/\.$/, '').trim()).filter((r) => r.length > 2 && r.length < 90);
}

export function sectionIdForHeading(heading) {
  for (const [id, re] of SECTION_MATCHERS) if (re.test(heading)) return id;
  return null;
}

export function buildPolicy({ org, data, code, assessments, meta = {}, template = DEFAULT_TEMPLATE }) {
  const reqs = data.requirements.filter((r) => r.policyCode === code);
  const reqIds = new Set(reqs.map((r) => r.id));
  const obls = data.obligations.filter((o) => o.requirementIds.some((id) => reqIds.has(id)));
  const pol = data.policies?.[code] || { title: POLICIES[code]?.title || code, number: '' };
  const title = meta.title || pol.title;
  const name = org.name;
  const short = org.shortName || org.name;
  const gov = isGov(org.profile || {});
  const sources = Object.values(obls.reduce((m, o) => {
    const s = (m[o.name] ||= { name: o.name, publisher: o.publisher, count: 0, url: (o.urls || '').split(/\s+/)[0] });
    s.count++; return m;
  }, {})).sort((a, b) => b.count - a.count);
  const levelOf = Object.fromEntries((org.sources || []).map((s) => [s.name, s.level]));
  const today = new Date().toISOString().slice(0, 10);
  const reviewFreq = top(reqs.map((r) => r.reviewFrequency))[0] || 'Annual';
  const nextReview = meta.reviewDate || (() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); })();
  const owner = meta.owner || top(reqs.map((r) => r.owner))[0] || 'Chief Information Officer';
  const approver = meta.approver || top(reqs.map((r) => r.accountable))[0] || (gov ? 'Accountable Authority' : 'Chief Executive Officer');

  // Group requirements by policy section / clause, preserving register order.
  const groups = [];
  const gIndex = {};
  for (const r of reqs) {
    const sec = (r.section || 'General requirements').replace(/^\d+\.\s*/, '');
    if (!(sec in gIndex)) { gIndex[sec] = groups.length; groups.push({ section: sec, items: [] }); }
    groups[gIndex[sec]].items.push(r);
  }
  const reqSectionNo = template.findIndex((t) => t.id === 'requirements') + 1;

  const gen = {
    purpose: () => `<p>The purpose of the ${esc(title)} is to ${esc(PURPOSE[code] || 'establish the minimum requirements for this policy domain')}.</p>
<p>This policy gives effect to ${sources.length} legislative, regulatory and standards source${sources.length === 1 ? '' : 's'} applicable to ${esc(name)}, consolidated into ${reqs.length} policy requirement${reqs.length === 1 ? '' : 's'}. It establishes what ${esc(short)} must do; supporting standards, procedures and guidelines describe how.</p>`,
    scope: () => {
      const apps = uniq(reqs.map((r) => r.applicability)).slice(0, 4);
      const excl = uniq(reqs.map((r) => r.excluded).filter((x) => !/^(none|nil|n\/a)\.?$/i.test(String(x).trim()))).slice(0, 3);
      return `<p>This policy applies to all ${esc(short)} personnel (including employees, contractors, consultants and third parties acting on behalf of ${esc(short)}), and to all information, ICT systems, services and facilities owned, operated or managed by or for ${esc(short)}.</p>
${apps.length ? `<p>In particular, the requirements apply to:</p><ul>${apps.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
${excl.length ? `<p><strong>Out of scope:</strong></p><ul>${excl.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}`;
    },
    statement: () => `<p>${esc(name)} is committed to meeting its legal, regulatory and policy obligations. To achieve this, ${esc(short)} will:</p>
<ul>${groups.map((g) => `<li>${esc(g.items[0].controlObjective || g.section)}</li>`).slice(0, 12).join('')}</ul>`,
    authority: () => `<p>This policy is made under the authority of the ${esc(approver)} and supports compliance with the following sources:</p>
<table><thead><tr><th>Source</th><th>Publisher</th><th>Applicability</th><th>Obligations</th></tr></thead><tbody>
${sources.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.publisher)}</td><td>${esc((levelOf[s.name] || 'mandatory').replace(/^./, (c) => c.toUpperCase()))}</td><td>${s.count}</td></tr>`).join('')}
</tbody></table>`,
    requirements: () => groups.map((g, gi) => `<h3>${reqSectionNo}.${gi + 1} ${esc(g.section)}</h3>
${g.items.map((r, ri) => `<p class="clause"><strong>${reqSectionNo}.${gi + 1}.${ri + 1} ${esc(r.title)}.</strong> ${esc(r.requirement)}</p>
<p class="clause-meta">Requirement ${esc(r.id)} · ${esc(r.priority || '')}${r.type ? ` · ${esc(r.type)}` : ''}${r.obligationRef ? ` · Basis: ${esc(r.obligationRef)}` : ''}</p>`).join('\n')}`).join('\n'),
    roles: () => {
      const roles = {};
      for (const r of reqs) {
        for (const role of roleList(r.accountable)) ((roles[role] ||= { a: [], r: [] }).a).push(r.title);
        for (const role of roleList(r.responsible)) ((roles[role] ||= { a: [], r: [] }).r).push(r.title);
      }
      const rows = Object.entries(roles).sort((a, b) => (b[1].a.length * 2 + b[1].r.length) - (a[1].a.length * 2 + a[1].r.length)).slice(0, 12);
      return `<table><thead><tr><th>Role</th><th>Responsibilities under this policy</th></tr></thead><tbody>
${rows.map(([role, v]) => `<tr><td><strong>${esc(role)}</strong></td><td>${v.a.length ? `Accountable for: ${esc(uniq(v.a).slice(0, 5).join('; '))}${v.a.length > 5 ? '; and related requirements' : ''}.` : ''} ${v.r.length ? `Responsible for: ${esc(uniq(v.r).slice(0, 5).join('; '))}${v.r.length > 5 ? '; and related requirements' : ''}.` : ''}</td></tr>`).join('')}
<tr><td><strong>All personnel</strong></td><td>Comply with this policy and supporting procedures, complete required training and report suspected breaches or incidents promptly.</td></tr>
</tbody></table>`;
    },
    exceptions: () => {
      const none = reqs.filter((r) => /^no\b/i.test(r.exceptionsPermitted || '')).length;
      const proc = top(reqs.filter((r) => !/^no\b/i.test(r.exceptionsPermitted || '')).map((r) => r.exceptionProcess))[0];
      const auth = top(reqs.map((r) => r.exceptionAuthority))[0];
      const ex = (data.exemptions || []).filter((e) => reqIds.has(e.requirementId));
      return `<p>${none} of ${reqs.length} requirements in this policy are mandatory and do not permit exceptions, because they give effect to legislation or binding government policy.</p>
${proc ? `<p>Where an exception is permitted: ${esc(proc)}</p>` : ''}
<p>Exceptions must be risk assessed, time-limited, approved by the ${esc(auth || approver)}, recorded in the exemptions register and reviewed at least annually.</p>
${ex.length ? `<p>Current approved exemptions:</p><ul>${ex.map((e) => `<li>${esc(e.id)} — ${esc(e.requirementTitle)} (${esc(e.status)}, expires ${esc(e.expiryDate)})</li>`).join('')}</ul>` : ''}`;
    },
    compliance: () => {
      const methods = uniq(reqs.flatMap((r) => splitList(r.verification))).slice(0, 8);
      const freqs = count(reqs.map((r) => (r.auditFrequency || '').split(/[;(]/)[0].trim()));
      const stats = computeStats(reqs, assessments || {});
      return `<p>Compliance with this policy will be verified through:</p><ul>${methods.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
<p>Audit cadence across requirements: ${Object.entries(freqs).map(([k, v]) => `${esc(k)} (${v})`).join(', ')}.</p>
${stats.assessed ? `<p>At the most recent assessment, ${stats.assessed} of ${stats.total} requirements were assessed with an overall compliance score of ${stats.score ?? '—'}%. Findings are tracked to closure in the remediation plan.</p>` : ''}
<p>The policy owner will report compliance to the ${esc(approver)} at least annually${gov ? ' and through statutory reporting (including annual protective security reporting where applicable)' : ''}.</p>`;
    },
    breaches: () => `<p>Failure to comply with this policy may expose ${esc(short)} to legal, regulatory, security and reputational harm. Suspected breaches must be reported to the policy owner or through the incident reporting process.</p>
<p>Breaches may result in removal of access, disciplinary action under ${gov ? 'the APS Code of Conduct or relevant employment arrangements' : 'the organisation\'s code of conduct and employment arrangements'}, termination of contracts, or referral to law enforcement or regulators where required by law.</p>`,
    related: () => {
      const pols = uniq(reqs.flatMap((r) => splitList(r.relatedPolicies))).slice(0, 15);
      const procs = uniq(reqs.flatMap((r) => splitList(r.relatedProcedures))).slice(0, 15);
      return `${pols.length ? `<p><strong>Related policies</strong></p><ul>${pols.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
${procs.length ? `<p><strong>Supporting procedures and guidelines</strong></p><ul>${procs.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}`;
    },
    definitions: () => {
      const text = reqs.map((r) => `${r.requirement} ${r.title} ${r.accountable} ${r.responsible}`).join(' ');
      const terms = Object.entries(GLOSSARY).filter(([t]) => new RegExp(t.split(/[ (/]/)[0], 'i').test(text) || ['Exception', 'Third party'].includes(t));
      return `<table><thead><tr><th>Term</th><th>Definition</th></tr></thead><tbody>${terms.map(([t, d]) => `<tr><td><strong>${esc(t)}</strong></td><td>${esc(d)}</td></tr>`).join('')}</tbody></table>`;
    },
    review: () => {
      const triggers = uniq(reqs.flatMap((r) => splitList(r.reviewTriggers))).slice(0, 8);
      return `<p>This policy will be reviewed ${esc(reviewFreq.toLowerCase())} by the policy owner, and earlier if any of the following occur:</p><ul>${triggers.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
<p>Next scheduled review: <strong>${esc(nextReview)}</strong>.</p>`;
    },
    traceability: () => `<table class="small"><thead><tr><th>Clause</th><th>Requirement</th><th>Obligation references</th><th>Controls</th><th>Evidence</th></tr></thead><tbody>
${groups.flatMap((g, gi) => g.items.map((r, ri) => `<tr><td>${reqSectionNo}.${gi + 1}.${ri + 1}</td><td>${esc(r.id)} — ${esc(r.title)}</td><td>${esc(r.obligationRef)}</td><td>${esc(r.ismList?.join(', ') || r.ismControls)}</td><td>${esc(r.evidence)}</td></tr>`)).join('')}
</tbody></table>`,
  };

  const sections = template.map((t, i) => ({
    id: t.id + (t.custom ? `-${i}` : ''),
    key: t.id,
    heading: t.heading,
    html: gen[t.id] ? gen[t.id]() : `<p><em>[${esc(t.heading)} — content to be authored. This heading comes from your uploaded template.]</em></p>`,
  }));

  return {
    meta: {
      title, number: meta.number || pol.number, version: meta.version || '0.1 (Draft)', status: meta.status || 'Draft for consultation',
      owner, approver, effectiveDate: meta.effectiveDate || today, reviewDate: nextReview,
      classification: meta.classification || (gov ? 'OFFICIAL' : 'Internal'), preparedBy: meta.preparedBy || 'CTO Consulting',
      generatedAt: new Date().toISOString(),
    },
    sections,
    stats: { requirements: reqs.length, obligations: obls.length, sources: sources.length },
  };
}

// Reads heading structure from a .docx template so generated policies follow the organisation's format.
export async function parseDocxTemplate(arrayBuffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(arrayBuffer);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('Not a valid Word document (.docx)');
  const stylesXml = (await zip.file('word/styles.xml')?.async('string')) || '';
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const styles = new DOMParser().parseFromString(stylesXml || '<x/>', 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const styleNames = {};
  for (const s of styles.getElementsByTagNameNS(W, 'style')) {
    const id = s.getAttributeNS(W, 'styleId');
    const nm = s.getElementsByTagNameNS(W, 'name')[0]?.getAttributeNS(W, 'val');
    if (id) styleNames[id] = nm || id;
  }
  const headings = [];
  for (const p of doc.getElementsByTagNameNS(W, 'p')) {
    const styleId = p.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') || '';
    const styleName = styleNames[styleId] || styleId;
    const m = styleName.match(/heading\s*(\d)/i);
    const outline = p.getElementsByTagNameNS(W, 'outlineLvl')[0]?.getAttributeNS(W, 'val');
    const level = m ? Number(m[1]) : outline !== undefined && outline !== null && outline !== '' ? Number(outline) + 1 : 0;
    if (!level || level > 2) continue;
    const text = [...p.getElementsByTagNameNS(W, 't')].map((t) => t.textContent).join('').replace(/^\s*(\d+(\.\d+)*\.?|[A-Z]\.)\s+/, '').trim();
    if (text) headings.push({ level, text });
  }
  if (!headings.length) throw new Error('No headings found — the template must use Word heading styles');
  const top = headings.filter((h) => h.level === Math.min(...headings.map((x) => x.level)));
  const used = new Set();
  const template = top.map((h) => {
    const id = sectionIdForHeading(h.text);
    if (id && !used.has(id)) { used.add(id); return { id, heading: h.text }; }
    return { id: 'custom', heading: h.text, custom: true };
  });
  if (!used.has('requirements')) template.splice(Math.min(4, template.length), 0, { id: 'requirements', heading: 'Policy requirements' });
  return template;
}

export function policyToHtmlDocument(doc, org, { forWord = false } = {}) {
  const m = doc.meta;
  const body = doc.sections.map((s, i) => `<h2>${i + 1}. ${esc(s.heading)}</h2>\n${s.html}`).join('\n');
  return `<!DOCTYPE html><html${forWord ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"' : ''}><head><meta charset="utf-8"><title>${esc(m.title)}</title>
<style>
body{font-family:Calibri,'Segoe UI',Arial,sans-serif;color:#1b2533;line-height:1.5;font-size:11pt;max-width:820px;margin:24px auto;padding:0 24px}
.cover{border-bottom:4px solid #0FA3B1;padding-bottom:16px;margin-bottom:24px}
.brand{color:#0B1F3A;font-weight:700;letter-spacing:.04em;font-size:10pt;text-transform:uppercase}
.classification{text-align:center;font-weight:700;color:#b42318;font-size:10pt;margin-bottom:8px}
h1{color:#0B1F3A;font-size:22pt;margin:8px 0 4px}h2{color:#0B1F3A;font-size:14pt;border-bottom:1px solid #d9dee5;padding-bottom:4px;margin-top:28px}
h3{color:#0F6E78;font-size:12pt;margin-top:18px}
table{border-collapse:collapse;width:100%;margin:8px 0 16px;font-size:10pt}th,td{border:1px solid #c9d1db;padding:6px 8px;vertical-align:top;text-align:left}th{background:#0B1F3A;color:#fff}
table.meta td:first-child{background:#eef3f8;font-weight:600;width:32%}
.clause{margin:10px 0 2px}.clause-meta{margin:0 0 10px;color:#5b6675;font-size:9pt}table.small{font-size:8.5pt}
</style></head><body>
<div class="classification">${esc(m.classification)}</div>
<div class="cover"><div class="brand">${esc(org.name)}</div><h1>${esc(m.title)}</h1><div>${esc(m.number)} · Version ${esc(m.version)} · ${esc(m.status)}</div></div>
<table class="meta"><tbody>
<tr><td>Policy number</td><td>${esc(m.number)}</td></tr><tr><td>Version</td><td>${esc(m.version)}</td></tr>
<tr><td>Status</td><td>${esc(m.status)}</td></tr><tr><td>Policy owner</td><td>${esc(m.owner)}</td></tr>
<tr><td>Approved by</td><td>${esc(m.approver)}</td></tr><tr><td>Effective date</td><td>${esc(m.effectiveDate)}</td></tr>
<tr><td>Next review</td><td>${esc(m.reviewDate)}</td></tr><tr><td>Classification</td><td>${esc(m.classification)}</td></tr>
<tr><td>Prepared by</td><td>${esc(m.preparedBy)}</td></tr></tbody></table>
${body}
<h2>Document history</h2><table><thead><tr><th>Version</th><th>Date</th><th>Author</th><th>Description</th></tr></thead>
<tbody><tr><td>${esc(m.version)}</td><td>${esc(m.effectiveDate)}</td><td>${esc(m.preparedBy)}</td><td>Generated from the ${esc(org.shortName || org.name)} policy requirements register</td></tr></tbody></table>
<div class="classification">${esc(m.classification)}</div>
</body></html>`;
}
