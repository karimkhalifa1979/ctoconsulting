// Regulatory calendar: statutory and reporting dates for applicable sources,
// plus organisation-specific review, audit, exemption and remediation dates.
import { POLICIES } from './catalog.js';

// Recurring and one-off regulatory dates, keyed to the source they belong to.
// indicative: the regulator sets the exact date each cycle — confirm before relying on it.
export const REG_EVENTS = [
  { source: 'PGPA Act 2013', title: 'Publish corporate plan (PGPA Rule s16E)', rule: { type: 'annual', m: 8, d: 31 }, category: 'Reporting', desc: 'Corporate plan must be published by the last day of the second month of the reporting period and provided to the responsible Minister and Finance Minister.' },
  { source: 'PGPA Act 2013', title: 'Annual report to responsible Minister (PGPA Act s46)', rule: { type: 'annual', m: 10, d: 15 }, category: 'Reporting', desc: 'Annual report, including annual performance statements and financial statements, provided to the responsible Minister by the 15th day of the fourth month after year end.' },
  { source: 'PGPA Act 2013', title: 'Financial year end — close annual performance and compliance records', rule: { type: 'annual', m: 6, d: 30 }, category: 'Reporting', desc: 'Reporting period closes; capture evidence for annual performance statements and compliance reporting.' },
  { source: 'Protective Security Policy Framework (PSPF) Release 2025', title: 'PSPF annual security report to Home Affairs and Minister', rule: { type: 'annual', m: 9, d: 30 }, category: 'Reporting', indicative: true, desc: 'Annual protective security self-assessment covering the financial year, approved by the Accountable Authority. Home Affairs confirms the reporting window each year.' },
  { source: 'Protective Security Policy Framework (PSPF) Release 2025', title: 'PSPF reporting period closes — capture maturity evidence', rule: { type: 'annual', m: 6, d: 30 }, category: 'Review', desc: 'Freeze and evidence the PSPF and cyber security maturity position as at 30 June.' },
  { source: 'Essential Eight Maturity Model', title: 'Essential Eight maturity self-assessment', rule: { type: 'annual', m: 7, d: 31 }, category: 'Review', indicative: true, desc: 'Assess Essential Eight maturity for inclusion in annual security reporting.' },
  { source: 'Information Security Manual (ISM)', title: 'ISM quarterly update — review control changes', rule: { type: 'months', months: [3, 6, 9, 12], d: 15 }, category: 'Review', indicative: true, desc: 'ASD publishes ISM updates quarterly. Review changed controls and update the control baseline and SSPs.' },
  { source: 'Privacy Act 1988 and Australian Privacy Principles', title: 'Automated decision-making transparency obligations commence (APP 1.7–1.9)', rule: { type: 'once', date: '2026-12-10' }, category: 'Commencement', desc: 'Privacy policies must describe the kinds of personal information used in, and decisions made by, substantially automated decision-making (Privacy and Other Legislation Amendment Act 2024).' },
  { source: 'Privacy Act 1988 and Australian Privacy Principles', title: 'Children\'s Online Privacy Code registration deadline (OAIC)', rule: { type: 'once', date: '2026-12-10' }, category: 'Commencement', desc: 'OAIC must register the Children\'s Online Privacy Code; assess applicability to online services likely to be accessed by children.' },
  { source: 'Privacy Code', title: 'Privacy management plan — annual review (APP Code s9)', rule: { type: 'annual', m: 6, d: 30 }, category: 'Review', indicative: true, desc: 'Measure and document performance against the privacy management plan at least annually.' },
  { source: 'Freedom of Information Act 1982', title: 'FOI statistics return to OAIC', rule: { type: 'months', months: [1, 4, 7, 10], d: 28 }, category: 'Reporting', indicative: true, desc: 'Quarterly FOI statistical return; annual return aligned with the OAIC annual report cycle.' },
  { source: 'Archives Act 1983', title: 'NAA Check-up information management survey', rule: { type: 'annual', m: 9, d: 30 }, category: 'Reporting', indicative: true, desc: 'Annual National Archives information management maturity self-assessment. NAA confirms the survey window each year.' },
  { source: 'Commonwealth Fraud and Corruption Control Framework 2024', title: 'Commonwealth fraud and corruption census return (AIC)', rule: { type: 'annual', m: 9, d: 30 }, category: 'Reporting', indicative: true, desc: 'Annual fraud and corruption data collection by the Australian Institute of Criminology.' },
  { source: 'Security of Critical Infrastructure Act 2018', title: 'CIRMP annual report to regulator (within 90 days of 30 June)', rule: { type: 'annual', m: 9, d: 28 }, category: 'Reporting', desc: 'Board-approved annual report on the critical infrastructure risk management program.' },
  { source: 'Security of Critical Infrastructure Act 2018', title: 'Register of Critical Infrastructure Assets — confirm details current', rule: { type: 'annual', m: 7, d: 31 }, category: 'Review', indicative: true, desc: 'Notify material changes to operational and ownership information within 30 days of the change.' },
  { source: 'APRA CPS 234 Information Security', title: 'Annual review and test of information security response plans (CPS 234)', rule: { type: 'annual', m: 6, d: 30 }, category: 'Review', indicative: true, desc: 'Plans must be reviewed and tested at least annually; align to the entity\'s planning cycle.' },
  { source: 'APRA CPS 230 Operational Risk Management', title: 'Annual BCP review and testing program (CPS 230)', rule: { type: 'annual', m: 6, d: 30 }, category: 'Review', indicative: true, desc: 'Review the business continuity plan annually and execute the systematic testing program.' },
  { source: 'AML/CTF Act 2006 and Rules', title: 'AUSTRAC annual compliance report (calendar year)', rule: { type: 'annual', m: 3, d: 31 }, category: 'Reporting', desc: 'Compliance report for the period 1 January – 31 December lodged with AUSTRAC by 31 March.' },
  { source: 'Modern Slavery Act 2018', title: 'Modern slavery statement due (30 June reporting period)', rule: { type: 'annual', m: 12, d: 31 }, category: 'Reporting', desc: 'Statement due within six months of the end of the reporting period.' },
  { source: 'Mandatory climate-related financial disclosures (AASB S2)', title: 'Group 3 entities — first sustainability reporting year begins', rule: { type: 'once', date: '2027-07-01' }, category: 'Commencement', desc: 'Mandatory climate-related financial disclosures extend to Group 3 entities for financial years commencing on or after 1 July 2027.' },
  { source: 'ASX Listing Rules and Corporate Governance Principles', title: 'Appendix 4E preliminary final report (30 June balance date)', rule: { type: 'annual', m: 8, d: 31 }, category: 'Reporting', desc: 'Lodge within two months of year end.' },
  { source: 'Corporations Act 2001 — directors\' duties and records', title: 'Annual financial report lodgement (large proprietary companies)', rule: { type: 'annual', m: 10, d: 31 }, category: 'Reporting', indicative: true, desc: 'Within four months of year end for large proprietary companies (three months for disclosing entities).' },
  { source: 'Consumer Data Right information security and conformance', title: 'CDR Rule 9.4 report to ACCC and OAIC', rule: { type: 'months', months: [1, 7], d: 30 }, category: 'Reporting', desc: 'Six-monthly reports for periods ending 31 December and 30 June, due within 30 days.' },
  { source: 'PCI DSS v4.0.1', title: 'Quarterly external ASV vulnerability scan (PCI DSS 11.3.2)', rule: { type: 'months', months: [1, 4, 7, 10], d: 15 }, category: 'Audit', indicative: true, desc: 'Passing external scans at least once every three months.' },
  { source: 'PCI DSS v4.0.1', title: 'Annual PCI DSS assessment (ROC / SAQ and AOC)', rule: { type: 'annual', m: 11, d: 30 }, category: 'Audit', indicative: true, desc: 'Annual validation to acquirer / card brands; date set by the organisation\'s compliance cycle.' },
  { source: 'NSW Cyber Security Policy', title: 'NSW Cyber Security Policy annual maturity report', rule: { type: 'annual', m: 8, d: 31 }, category: 'Reporting', indicative: true, desc: 'Report policy compliance and Essential Eight maturity to Cyber Security NSW.' },
  { source: 'Victorian Privacy and Data Protection Act 2014 and VPDSS', title: 'OVIC attestation / Protective Data Security Plan', rule: { type: 'annual', m: 8, d: 31 }, category: 'Reporting', indicative: true, desc: 'Annual attestation to OVIC; the Protective Data Security Plan is submitted every two years.' },
  { source: 'Queensland Information Security Policy (IS18:2018)', title: 'ISMS annual attestation to Queensland Government CISO', rule: { type: 'annual', m: 9, d: 30 }, category: 'Reporting', indicative: true, desc: 'Annual information security attestation.' },
  { source: 'South Australian Cyber Security Framework (SACSF)', title: 'SACSF annual compliance report', rule: { type: 'annual', m: 9, d: 30 }, category: 'Reporting', indicative: true, desc: 'Annual reporting against the SA Cyber Security Framework.' },
  { source: 'Defence Industry Security Program (DISP)', title: 'DISP Annual Security Report', rule: { type: 'annual', m: 7, d: 31 }, category: 'Reporting', indicative: true, desc: 'Due on the anniversary of DISP membership.' },
  { source: 'Australian Energy Sector Cyber Security Framework (AESCSF)', title: 'AESCSF annual self-assessment', rule: { type: 'annual', m: 10, d: 31 }, category: 'Reporting', indicative: true, desc: 'AEMO confirms the annual assessment window.' },
  { source: 'ISO/IEC 27001:2022 Information security management systems', title: 'ISMS internal audit and management review', rule: { type: 'annual', m: 3, d: 31 }, category: 'Audit', indicative: true, desc: 'Annual internal audit and management review ahead of certification surveillance audit.' },
  { source: 'My Health Records Act 2012', title: 'Review My Health Record security and access policy (Rule 42)', rule: { type: 'annual', m: 6, d: 30 }, category: 'Review', indicative: true, desc: 'Policy must be reviewed at least annually and when material changes occur.' },
  { source: 'EU Digital Operational Resilience Act (DORA)', title: 'DORA register of information submission', rule: { type: 'annual', m: 4, d: 30 }, category: 'Reporting', indicative: true, desc: 'Submit the register of ICT third-party arrangements to the competent authority.' },
  { source: 'NDIS Act 2013', title: 'Quarterly performance report to Disability Reform Ministerial Council', rule: { type: 'months', months: [1, 4, 7, 10], d: 31 }, category: 'Reporting', indicative: true, desc: 'NDIS quarterly report — ICT systems must produce accurate scheme data for reporting.' },
];

// Obligations with deadlines triggered by an event rather than a date.
export const EVENT_DEADLINES = [
  { source: 'Notifiable Data Breaches Scheme', title: 'Assess suspected eligible data breach', deadline: 'Within 30 days', desc: 'Notify the OAIC and affected individuals as soon as practicable once an eligible breach is confirmed.' },
  { source: 'Cyber Security Act 2024 and Cyber Security (Ransomware Payment Reporting) Rules 2025', title: 'Report a ransomware or cyber extortion payment', deadline: 'Within 72 hours', desc: 'Report to ASD after making, or becoming aware of, the payment.' },
  { source: 'Security of Critical Infrastructure Act 2018', title: 'Report a critical cyber security incident (significant impact)', deadline: 'Within 12 hours', desc: 'Report to ASD; relevant-impact incidents within 72 hours.' },
  { source: 'APRA CPS 234 Information Security', title: 'Notify APRA of a material information security incident', deadline: 'Within 72 hours', desc: 'Material control weaknesses must be notified within 10 business days.' },
  { source: 'APRA CPS 230 Operational Risk Management', title: 'Notify APRA of disruption to a critical operation outside tolerance', deadline: 'Within 24 hours', desc: 'Also notify when a business continuity plan is activated.' },
  { source: 'EU General Data Protection Regulation (GDPR)', title: 'Notify supervisory authority of a personal data breach', deadline: 'Within 72 hours', desc: 'Notify affected data subjects without undue delay where high risk.' },
  { source: 'UK GDPR and Data Protection Act 2018', title: 'Notify the ICO of a notifiable breach', deadline: 'Within 72 hours', desc: '' },
  { source: 'EU NIS2 Directive', title: 'Early warning of a significant incident', deadline: 'Within 24 hours', desc: 'Incident notification within 72 hours; final report within one month.' },
  { source: 'Sarbanes-Oxley Act s404 (ITGC)', title: 'Disclose a material cybersecurity incident (Form 8-K Item 1.05)', deadline: 'Within 4 business days', desc: 'From the determination of materiality.' },
  { source: 'NSW Privacy and Personal Information Protection Act 1998 (incl. MNDB scheme)', title: 'Assess suspected eligible data breach (MNDB)', deadline: 'Within 30 days', desc: 'Notify the NSW Privacy Commissioner immediately once confirmed.' },
  { source: 'National Anti-Corruption Commission Act 2022 and mandatory referral obligations', title: 'Refer serious or systemic corrupt conduct', deadline: 'As soon as reasonably practicable', desc: 'Mandatory referral by agency heads and PID officers.' },
  { source: 'ASX Listing Rules and Corporate Governance Principles', title: 'Continuous disclosure of material information (LR 3.1)', deadline: 'Immediately', desc: 'Including material cyber incidents.' },
];

// Months between occurrences, read from the first clause ("Annual; test quarterly" -> 12).
export function frequencyMonths(text) {
  const first = String(text || '').toLowerCase().split(/[;,(]/)[0];
  if (!first || /continuous|triggered|ad[- ]hoc|real[- ]time/.test(first)) return null;
  if (/biennial|two years|2 years/.test(first)) return 24;
  if (/six|6 months|biannual|half[- ]year/.test(first)) return 6;
  if (/quarter/.test(first)) return 3;
  if (/monthly/.test(first)) return 1;
  if (/annual|year/.test(first)) return 12;
  return null;
}

const iso = (d) => d.toISOString().slice(0, 10);
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, Math.min(d, new Date(Date.UTC(y, m, 0)).getUTCDate())));
function addMonths(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return iso(utc(y, m + n, d));
}

export function buildEvents({ org, data, assessments, docs, today = new Date(), horizonMonths = 18 }) {
  const start = iso(new Date(today.getTime() - 90 * 86400000));
  const end = addMonths(iso(today), horizonMonths);
  const events = [];
  const inRange = (d) => d >= start && d <= end;
  const selected = new Set((org.sources || []).filter((s) => s.selected !== false).map((s) => s.name));
  const y0 = today.getUTCFullYear();

  for (const ev of REG_EVENTS) {
    if (!selected.has(ev.source)) continue;
    const dates = [];
    if (ev.rule.type === 'once') dates.push(ev.rule.date);
    else {
      const months = ev.rule.type === 'annual' ? [ev.rule.m] : ev.rule.months;
      for (let y = y0 - 1; y <= y0 + 2; y++) for (const m of months) dates.push(iso(utc(y, m, ev.rule.d)));
    }
    for (const date of dates.filter(inRange)) {
      events.push({ id: `${ev.title}|${date}`, date, title: ev.title, category: ev.category, source: ev.source, desc: ev.desc, indicative: !!ev.indicative, kind: 'regulatory' });
    }
  }

  // Requirement reviews and control audits, grouped per policy and date.
  const groups = {};
  const push = (key, base) => {
    const g = (groups[key] ||= { ...base, items: [] });
    return g;
  };
  for (const r of data.requirements) {
    const pol = data.policies?.[r.policyCode]?.title || POLICIES[r.policyCode]?.title || r.policyCode;
    const reviewMonths = frequencyMonths(r.reviewFrequency) || 12;
    const anchor = r.lastReviewed || r.dateCaptured;
    if (/^\d{4}-\d{2}-\d{2}$/.test(anchor || '')) {
      let d = addMonths(anchor, reviewMonths);
      let guard = 0;
      while (d < start && guard++ < 40) d = addMonths(d, reviewMonths);
      for (let k = 0; k < 6 && d <= end; k++, d = addMonths(d, reviewMonths)) {
        push(`rev|${r.policyCode}|${d}`, { date: d, title: `Requirement review — ${pol}`, category: 'Review', policyCode: r.policyCode, kind: 'review', desc: 'Scheduled review of policy requirements (Review Frequency).' }).items.push(r.id);
      }
    }
    const auditMonths = frequencyMonths(r.auditFrequency);
    const auditAnchor = r.dateCaptured;
    if (auditMonths && auditMonths >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(auditAnchor || '')) {
      let d = addMonths(auditAnchor, auditMonths);
      let guard = 0;
      while (d < start && guard++ < 80) d = addMonths(d, auditMonths);
      for (let k = 0; k < 8 && d <= end; k++, d = addMonths(d, auditMonths)) {
        push(`aud|${r.policyCode}|${d}`, { date: d, title: `Control audit — ${pol}`, category: 'Audit', policyCode: r.policyCode, kind: 'audit', desc: 'Control verification due under the requirement\'s Audit Frequency.' }).items.push(r.id);
      }
    }
  }
  for (const [key, g] of Object.entries(groups)) {
    events.push({ ...g, id: key, title: `${g.title} (${g.items.length} requirement${g.items.length === 1 ? '' : 's'})` });
  }

  for (const e of data.exemptions || []) {
    if (/^\d{4}/.test(e.expiryDate || '')) events.push({ id: `exp|${e.id}`, date: e.expiryDate, title: `Exemption expires — ${e.id}: ${e.requirementTitle}`, category: 'Exemption', kind: 'exemption', desc: e.description, policyCode: '' });
    if (/^\d{4}/.test(e.nextReview || '')) events.push({ id: `exr|${e.id}`, date: e.nextReview, title: `Exemption review — ${e.id}: ${e.requirementTitle}`, category: 'Exemption', kind: 'exemption', desc: `${e.status} · ${e.reviewFrequency} review`, policyCode: '' });
  }

  for (const [reqId, a] of Object.entries(assessments || {})) {
    if (a.dueDate && a.remediationStatus !== 'Closed') {
      const r = data.requirements.find((x) => x.id === reqId);
      events.push({ id: `rem|${reqId}`, date: a.dueDate, title: `Remediation due — ${reqId}${r ? `: ${r.title}` : ''}`, category: 'Remediation', kind: 'remediation', desc: a.recommendation || a.finding || '', owner: a.owner, policyCode: r?.policyCode });
    }
  }

  for (const [code, doc] of Object.entries(docs || {})) {
    if (doc?.meta?.reviewDate) events.push({ id: `doc|${code}`, date: doc.meta.reviewDate, title: `Policy document review — ${doc.meta.title || code}`, category: 'Review', kind: 'policy', desc: 'Scheduled review of the authored policy document.', policyCode: code });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function eventDeadlinesFor(org) {
  const selected = new Set((org.sources || []).filter((s) => s.selected !== false).map((s) => s.name));
  return EVENT_DEADLINES.filter((e) => selected.has(e.source));
}

// iCalendar export.
export function toICS(events, orgName) {
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CTO Consulting//Regulatory Assessment//EN', `X-WR-CALNAME:${esc(`${orgName} regulatory calendar`)}`];
  for (const e of events) {
    const d = e.date.replace(/-/g, '');
    const next = new Date(`${e.date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    lines.push('BEGIN:VEVENT', `UID:${esc(e.id)}@ctoconsulting`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${iso(next).replace(/-/g, '')}`,
      `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(`${e.category}${e.source ? ` · ${e.source}` : ''}${e.indicative ? ' · Indicative date — confirm with regulator' : ''}\n${e.desc || ''}`)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
