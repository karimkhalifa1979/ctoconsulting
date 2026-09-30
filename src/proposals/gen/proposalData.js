// Assembles merge data for a bid: fields, flags, sections, repeating blocks and tables (spec 9.3 step 1).
import { computePricing } from '../core/pricing.js';
import { approvedVersion, usageMode, anonymise, caseStudySummaryLine } from '../core/library.js';
import { PRICING_MODELS, COMPLIANCE } from '../core/constants.js';
import { aud, longDate, zonedToDate, fmtZoned } from '../core/util.js';
import { selectedCaseStudies } from '../core/deck.js';
export { selectedCaseStudies };

const W = 9638;

export function aiDisclosureText(state, bid, aiLog = []) {
  const sections = bid.sections.filter((s) => (s.aiHistory || []).length);
  const claude = aiLog.some((e) => e.bidId === bid.id && e.engine === 'claude') || bid.sections.some((s) => (s.aiHistory || []).some((h) => h.engine === 'claude'));
  if (!sections.length && !(bid.extraction?.mode === 'claude')) return 'CTO Consulting did not use generative AI to prepare this response.';
  const model = claude ? `Anthropic Claude (${state.settings.ai?.model || 'configured model'})` : 'CTO Consulting’s offline drafting engine, which assembles approved library content';
  return `CTO Consulting used ${model} to assist with ${sections.length} of ${bid.sections.length} sections of this response${bid.extraction?.mode === 'claude' ? ' and to extract requirements from the request documents' : ''}. Drafts were grounded in CTO Consulting’s approved content library and cited their sources. Every AI-assisted passage was reviewed, edited where needed and approved by CTO Consulting staff before submission. Client information was processed under terms that exclude model training.`;
}

export function buildProposalData(state, bid, { assets = {}, caseStudyIds = null, aiLog = [], now = new Date() } = {}) {
  const client = state.clients.find((c) => c.id === bid.clientId) || { name: '' };
  const user = (id) => state.users.find((u) => u.id === id) || {};
  const partner = user(bid.partnerId), bm = user(bid.bidManagerId);
  const p = computePricing(state, bid);
  const closing = bid.closing?.date ? zonedToDate(bid.closing.date, bid.closing.time, bid.closing.tz) : null;
  const model = PRICING_MODELS.find((m) => m.id === p.model)?.label || p.model;
  const fields = {
    'client.name': client.name, 'client.short_name': client.shortName || client.name, 'client.abn': client.abn || '', 'client.sector': client.sector || '',
    'bid.title': bid.title, 'bid.reference': bid.clientRef || bid.ref, 'bid.client_reference': bid.clientRef || '—', 'bid.internal_reference': bid.ref, 'bid.value': aud(bid.value),
    'submission.due': closing ? fmtZoned(closing, bid.closing.tz) : 'To be confirmed', 'submission.due_date': bid.closing?.date ? longDate(bid.closing.date) : '', 'submission.due_time': bid.closing?.time || '', 'submission.timezone': bid.closing?.tz || '', 'submission.channel': bid.channel || '',
    'partner.name': partner.name || '', 'partner.title': partner.title || '', 'partner.email': partner.email || '', 'bid_manager.name': bm.name || '', 'bid_manager.email': bm.email || '',
    'org.name': state.settings.orgName || 'CTO Consulting', 'org.website': state.settings.website || 'www.ctoconsulting.com.au', 'org.abn': state.settings.orgAbn || '', today: longDate(now.toISOString().slice(0, 10)),
    'pricing.model': model, 'pricing.total_ex_gst': aud(p.subtotal, { cents: true }), 'pricing.gst': aud(p.gst, { cents: true }), 'pricing.total_inc_gst': aud(p.total, { cents: true }),
    'ai.disclosure': typeof bid.aiDisclosure === 'string' && bid.aiDisclosure.trim() ? bid.aiDisclosure.trim() : aiDisclosureText(state, bid, aiLog),
  };
  const pr = bid.pricing || {};
  const flags = {
    ...(bid.flags || {}),
    confidential: bid.flags?.confidential !== false,
    has_assumptions: (pr.assumptions || []).length > 0, has_departures: (pr.departures || []).length > 0, has_risks: (pr.risks || []).length > 0,
    pricing_fixed: p.model === 'fixed' && p.milestones.length > 0, pricing_tm: p.model === 'tm', pricing_capped: p.model === 'capped', pricing_retainer: p.model === 'retainer',
    ai_disclosure: Boolean(bid.aiDisclosure),
  };
  const sections = [...bid.sections].sort((a, b) => a.order - b.order).map((s) => ({ id: s.id, key: s.key, title: s.title, level: s.parentId ? 2 : 1, html: s.content || '' }));

  const caseStudies = selectedCaseStudies(state, bid, caseStudyIds).map((item) => {
    const v = approvedVersion(item);
    const f = v?.fields || {};
    const mode = usageMode(item, bid.clientId);
    const label = v?.anonymised?.title || f.anonymisedName || 'A previous client';
    const a = (t) => anonymise(t || '', f.client, label, mode === 'anonymised');
    return {
      id: item.id, title: a(v?.title || item.title), client: mode === 'anonymised' ? label : f.client, sector: f.sector || '', summary: a(f.summary), challenge: a(f.challenge), approach: a(f.approach),
      summary_line: [mode === 'anonymised' ? label : f.client, caseStudySummaryLine(f)].filter(Boolean).join(' · '), value: f.value ? aud(f.value) : '', period: f.start && f.end ? `${f.start.slice(0, 4)}–${f.end.slice(0, 4)}` : '',
      referee: mode === 'anonymised' ? 'Available on request' : f.referee || '', outcomes: (f.outcomes || []).map((o) => ({ text: a(o) })), mode, v: v?.v,
    };
  });

  const team = (bid.staffing || []).filter((l) => l.include !== false).map((l) => {
    const c = state.consultants.find((x) => x.id === l.consultantId);
    return {
      name: c?.name || 'To be named', role: l.role || c?.role || '', level: l.level, clearance: c?.clearance || 'To be confirmed', bio: c?.bio || 'To be named before contract commencement.',
      certifications: (c?.certifications || []).join(', ') || '—', skills: (c?.skills || []).join(', '), days: l.days, photo: c?.photoBytes ? { bytes: c.photoBytes, alt: `Photo of ${c.name}`, widthPx: 90 } : null, named: Boolean(c),
    };
  });
  const sectionTitle = (id) => bid.sections.find((s) => s.id === id)?.title || '';
  const reqs = bid.requirements.filter((r) => !r.excluded);
  const money = (n) => aud(n, { cents: false });

  const pricingRows = p.lines.map((l) => [l.role || l.level, l.level, { text: String(l.days), align: 'right' }, { text: money(l.rate), align: 'right' }, { text: money(l.sell), align: 'right' }]);
  const total = (label, value, bold = false) => [{ text: label, bold }, '', '', '', { text: money(value), align: 'right', bold }];
  if (p.discount) pricingRows.push(total(`Discount (${pr.discountPct}%)`, -p.discount));
  if (p.model === 'retainer') pricingRows.push(total(`Monthly fee × ${p.months} months`, p.labourNet));
  if (p.contingency) pricingRows.push(total(`Delivery contingency (${pr.contingencyPct}%)`, p.contingency));
  for (const e of pr.expenses || []) pricingRows.push(total(`Expenses: ${e.label}`, e.amount));
  pricingRows.push(total('Total (excluding GST)', p.subtotal, true), total(`GST (${Math.round(p.gstRate * 100)}%)`, p.gst), total('Total (including GST)', p.total, true));
  if (p.model === 'capped') pricingRows.push(total('Not-to-exceed cap (excluding GST)', p.cap, true));

  const tables = {
    compliance_matrix: {
      caption: 'Compliance matrix', empty: 'No requirements recorded.',
      columns: [{ label: 'Ref', width: 800 }, { label: 'Requirement', width: 4138 }, { label: 'Type', width: 1100 }, { label: 'Response section', width: 2200 }, { label: 'Compliance', width: 1400 }],
      rows: reqs.map((r) => [r.ref, r.text, r.kind === 'mandatory' ? 'Mandatory' : 'Desirable', (r.sectionIds || []).map(sectionTitle).join('; ') || '—', COMPLIANCE.find((c) => c.id === (r.compliance || ''))?.label || 'Not assessed']),
    },
    pricing: {
      caption: `Pricing (${model})`, empty: 'Pricing to be confirmed.',
      columns: [{ label: 'Role', width: 3000 }, { label: 'Level', width: 2100 }, { label: p.model === 'retainer' ? 'Days per month' : 'Days', width: 1100, align: 'right' }, { label: 'Day rate (ex GST)', width: 1700, align: 'right' }, { label: 'Amount (ex GST)', width: 1738, align: 'right' }],
      rows: p.lines.length ? pricingRows : [],
    },
    team: {
      caption: 'Proposed team', empty: 'Team to be confirmed.',
      columns: [{ label: 'Name', width: 2300 }, { label: 'Role', width: 3000 }, { label: 'Level', width: 1900 }, { label: 'Clearance', width: 1300 }, { label: 'Days', width: 1138, align: 'right' }],
      rows: team.map((t) => [t.named ? t.name : 'To be named', t.role, t.level, t.clearance, { text: String(t.days), align: 'right' }]),
    },
    milestones: {
      caption: 'Payment milestones',
      columns: [{ label: 'Milestone', width: 5638 }, { label: 'Share', width: 1500, align: 'right' }, { label: 'Amount (ex GST)', width: 2500, align: 'right' }],
      rows: p.milestones.map((m) => [m.label, { text: `${m.pct}%`, align: 'right' }, { text: money(m.amount), align: 'right' }]),
    },
    departures: { caption: 'Statement of departures', columns: [{ label: 'Clause', width: 2000 }, { label: 'Proposed departure', width: 4138 }, { label: 'Rationale', width: 3500 }], rows: (pr.departures || []).map((d) => [d.clause, d.departure, d.rationale]) },
    assumptions: { caption: 'Pricing assumptions', columns: [{ label: '#', width: 600 }, { label: 'Assumption', width: 9038 }], rows: (pr.assumptions || []).map((a, i) => [String(i + 1), a.text]) },
    risks: { caption: 'Commercial risks', columns: [{ label: 'Risk', width: 3800 }, { label: 'Rating', width: 1300 }, { label: 'Mitigation', width: 4538 }], rows: (pr.risks || []).map((r) => [r.text, r.rating, r.mitigation]) },
  };
  for (const t of Object.values(tables)) if (t.columns.reduce((a, c) => a + c.width, 0) !== W) t.columns[t.columns.length - 1].width += W - t.columns.reduce((a, c) => a + c.width, 0);
  flags.has_case_studies = caseStudies.length > 0;

  return {
    fields, flags, sections,
    lists: { case_studies: caseStudies, team, assumptions: (pr.assumptions || []).map((a) => ({ text: a.text })), risks: (pr.risks || []).map((r) => ({ text: r.text, rating: r.rating, mitigation: r.mitigation })), departures: (pr.departures || []).map((d) => ({ ...d })), milestones: p.milestones.map((m) => ({ label: m.label, pct: `${m.pct}%`, amount: money(m.amount) })), requirements: reqs.map((r) => ({ ref: r.ref, text: r.text, kind: r.kind, compliance: r.compliance, sections: (r.sectionIds || []).map(sectionTitle).join('; ') })) },
    tables,
    images: { cto_logo: assets.logoColor ? { bytes: assets.logoColor, alt: 'CTO Consulting logo', widthPx: 300 } : null, client_logo: assets.clientLogo ? { bytes: assets.clientLogo, alt: `${client.name} logo`, widthPx: 160 } : null },
    caseStudies,
  };
}

// Sample data for previewing templates (WD-05).
export function sampleData(assets = {}) {
  return {
    fields: { 'client.name': 'Sample Client Authority', 'client.short_name': 'Authority', 'client.abn': '00 000 000 000', 'client.sector': 'State government', 'bid.title': 'Sample Transformation Program', 'bid.reference': 'SAMPLE-2026-001', 'bid.client_reference': 'SAMPLE-2026-001', 'bid.internal_reference': 'CTO-2026-000', 'bid.value': '$1,000,000', 'submission.due': 'Friday 30 October 2026, 2:00 pm AEDT', 'submission.due_date': 'Friday 30 October 2026', 'submission.due_time': '14:00', 'submission.timezone': 'Australia/Sydney', 'submission.channel': 'NSW eTendering', 'partner.name': 'Sample Partner', 'partner.title': 'Partner', 'partner.email': 'partner@example.com', 'bid_manager.name': 'Sample Bid Manager', 'bid_manager.email': 'bids@example.com', 'org.name': 'CTO Consulting', 'org.website': 'www.ctoconsulting.com.au', 'org.abn': '00 123 456 789', today: longDate(new Date().toISOString().slice(0, 10)), 'pricing.model': 'Fixed price with milestones', 'pricing.total_ex_gst': '$500,000.00', 'pricing.gst': '$50,000.00', 'pricing.total_inc_gst': '$550,000.00', 'ai.disclosure': 'Sample AI disclosure statement.' },
    flags: { confidential: true, has_assumptions: true, has_departures: true, has_case_studies: true, pricing_fixed: true, ai_disclosure: true, lot_2: true },
    sections: [
      { id: 's1', key: 'executive_summary', title: 'Executive summary', level: 1, html: '<p>This is sample content for the <strong>executive summary</strong>. It shows how section text takes the template’s named styles.</p><ul><li><p>A bullet point</p></li><li><p>Another bullet point</p></li></ul>' },
      { id: 's2', key: 'approach', title: 'Proposed approach', level: 1, html: '<h2>Phase 1</h2><p>Sample paragraph.</p><ol><li><p>First step</p></li><li><p>Second step</p></li></ol><table><tbody><tr><th><p>Phase</p></th><th><p>Timing</p></th></tr><tr><td><p>Discover</p></td><td><p>Months 1–2</p></td></tr></tbody></table>' },
    ],
    lists: {
      case_studies: [{ title: 'Sample case study', client: 'Sample client', sector: 'State government', summary: 'A short summary of the engagement.', summary_line: 'State government · Cloud migration · $1.2M · 2024–2025', outcomes: [{ text: 'Outcome one' }, { text: 'Outcome two' }] }],
      team: [{ name: 'Sample Consultant', role: 'Engagement lead', level: 'Principal Consultant', clearance: 'Baseline', bio: 'A short biography.', certifications: 'Certification', skills: 'Skill', days: 40 }],
      assumptions: [{ text: 'A sample assumption.' }], risks: [{ text: 'Sample risk', rating: 'Low', mitigation: 'Sample mitigation' }], departures: [{ clause: '1.1', departure: 'Sample departure', rationale: 'Sample rationale' }], milestones: [{ label: 'Milestone 1', pct: '50%', amount: '$250,000' }], requirements: [],
    },
    tables: {
      compliance_matrix: { caption: 'Compliance matrix', columns: [{ label: 'Ref', width: 900 }, { label: 'Requirement', width: 5538 }, { label: 'Type', width: 1200 }, { label: 'Compliance', width: 2000 }], rows: [['M1', 'Sample mandatory requirement', 'Mandatory', 'Comply']] },
      pricing: { caption: 'Pricing', columns: [{ label: 'Role', width: 3638 }, { label: 'Days', width: 2000, align: 'right' }, { label: 'Rate', width: 2000, align: 'right' }, { label: 'Amount', width: 2000, align: 'right' }], rows: [['Principal Consultant', { text: '100', align: 'right' }, { text: '$2,300', align: 'right' }, { text: '$230,000', align: 'right' }]] },
      team: { caption: 'Team', columns: [{ label: 'Name', width: 4819 }, { label: 'Role', width: 4819 }], rows: [['Sample Consultant', 'Engagement lead']] },
      milestones: { caption: 'Milestones', columns: [{ label: 'Milestone', width: 6638 }, { label: 'Amount', width: 3000, align: 'right' }], rows: [['Milestone 1', { text: '$250,000', align: 'right' }]] },
      departures: { caption: 'Departures', columns: [{ label: 'Clause', width: 2000 }, { label: 'Departure', width: 7638 }], rows: [['1.1', 'Sample departure']] },
      assumptions: { caption: 'Assumptions', columns: [{ label: 'Assumption', width: 9638 }], rows: [['Sample assumption']] },
      risks: { caption: 'Risks', columns: [{ label: 'Risk', width: 9638 }], rows: [['Sample risk']] },
    },
    images: { cto_logo: assets.logoColor ? { bytes: assets.logoColor, alt: 'CTO Consulting logo', widthPx: 300 } : null },
  };
}
