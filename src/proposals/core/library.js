// Content library helpers: lifecycle, versions, confidentiality and usage (spec section 8).
import { escapeHtml, htmlToText, addDays, todayISO, daysBetween } from './util.js';
import { aud } from './util.js';

export const latestVersion = (item) => item.versions[item.versions.length - 1];
export const versionOf = (item, v) => item.versions.find((x) => x.v === v) || null;
export const approvedVersion = (item) => (item.approvedV ? versionOf(item, item.approvedV) : null);

export function reviewDue(item, settings, today = todayISO()) {
  const days = settings?.expiryReminderDays ?? 30;
  const dates = [item.expiry, item.reviewDate].filter(Boolean);
  if (!dates.length) return null;
  const next = dates.sort()[0];
  return { date: next, overdue: next < today, soon: next <= addDays(today, days), days: daysBetween(today, next) };
}

// CL-04: draft, in review, approved, expiring, retired. Expiring is derived from the review/expiry date.
export function displayStatus(item, settings, today = todayISO()) {
  if (item.retired) return 'retired';
  const latest = latestVersion(item);
  if (!item.approvedV) return latest?.status === 'in_review' ? 'in_review' : 'draft';
  const due = reviewDue(item, settings, today);
  if (due && (due.overdue || due.soon)) return 'expiring';
  return 'approved';
}

export const isUsable = (item) => !item.retired && Boolean(item.approvedV) && !(item.expiry && item.expiry < todayISO());

// How an item may be used in a bid for a given client: named, anonymised or excluded (CL-08).
export function usageMode(item, clientId) {
  if (!item.confidential) return 'named';
  if (item.clientId && item.clientId === clientId) return 'named';
  if (item.consent === 'yes') return 'named';
  const v = approvedVersion(item);
  if (v?.anonymised?.body || v?.anonymised?.title || item.type === 'case_study') return 'anonymised';
  return 'excluded';
}

function caseStudyHtml(f, { anonymised, label }) {
  const client = anonymised ? label : f.client;
  const parts = [];
  if (f.summary) parts.push(`<p>${escapeHtml(anonymise(f.summary, f.client, label, anonymised))}</p>`);
  if (f.challenge) parts.push(`<p>${escapeHtml(anonymise(f.challenge, f.client, label, anonymised))}</p>`);
  if (f.approach) parts.push(`<p>${escapeHtml(anonymise(f.approach, f.client, label, anonymised))}</p>`);
  if (f.outcomes?.length) parts.push(`<p>Outcomes for ${escapeHtml(client)}:</p><ul>${f.outcomes.map((o) => `<li><p>${escapeHtml(anonymise(o, f.client, label, anonymised))}</p></li>`).join('')}</ul>`);
  return parts.join('');
}

export function anonymise(text, name, label, on = true) {
  if (!on || !name) return text;
  const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const lower = label ? label.charAt(0).toLowerCase() + label.slice(1) : 'the client';
  return String(text).replace(re, (m, off, s) => (off === 0 || /[.!?]\s*$/.test(s.slice(0, off)) ? label : lower));
}

// Body HTML of a version, in named or anonymised form.
export function itemHtml(item, v = approvedVersion(item) || latestVersion(item), { mode = 'named' } = {}) {
  if (!v) return '';
  const anonymised = mode === 'anonymised';
  if (item.type === 'case_study') return caseStudyHtml(v.fields || {}, { anonymised, label: v.anonymised?.title || v.fields?.anonymisedName || 'The client' });
  if (anonymised && v.anonymised?.body) return v.anonymised.body;
  return v.body || '';
}

export function itemTitle(item, v = approvedVersion(item) || latestVersion(item), mode = 'named') {
  if (mode === 'anonymised' && item.type === 'case_study') {
    const f = v?.fields || {};
    return anonymise(v?.title || item.title, f.client, v?.anonymised?.title || 'The client', true);
  }
  return v?.title || item.title;
}

export function itemText(item, v, opts) {
  return htmlToText(itemHtml(item, v, opts));
}

export function itemSearchDoc(item, settings) {
  const v = approvedVersion(item) || latestVersion(item);
  const f = v?.fields || {};
  const tags = Object.values(item.tags || {}).flat();
  const extra = [f.client, f.sector, ...(f.services || []), ...(f.technologies || []), ...(v?.variants || []), v?.topic, f.offering].filter(Boolean);
  return { id: item.id, title: itemTitle(item, v), text: `${htmlToText(itemHtml(item, v))} ${extra.join(' ')}`, tags: [...tags, ...extra], type: item.type, status: displayStatus(item, settings) };
}

// CL-06: a bid records the version it used; flag where a newer approved version exists.
export function newerVersionAvailable(item, usedV) {
  return Boolean(item?.approvedV && usedV && item.approvedV > usedV);
}

// CL-12: where each item was used and the win rate of bids that used it.
export function usageIndex(bids) {
  const map = new Map();
  for (const b of bids) {
    const seen = new Set();
    for (const s of b.sections || []) {
      for (const c of s.citations || []) {
        if (c.kind !== 'library') continue;
        const key = c.refId;
        if (seen.has(key)) continue;
        seen.add(key);
        const e = map.get(key) || { itemId: key, bids: [], won: 0, lost: 0, decided: 0 };
        e.bids.push({ bidId: b.id, ref: b.ref, title: b.title, v: c.v, outcome: b.outcome?.result || null, sectionId: s.id });
        if (b.outcome?.result === 'won') { e.won++; e.decided++; }
        if (b.outcome?.result === 'lost') { e.lost++; e.decided++; }
        map.set(key, e);
      }
    }
  }
  for (const e of map.values()) e.winRate = e.decided ? e.won / e.decided : null;
  return map;
}

export function caseStudySummaryLine(f) {
  return [f.sector, (f.services || []).join(', '), f.value ? aud(f.value) : null, f.start && f.end ? `${f.start.slice(0, 4)}–${f.end.slice(0, 4)}` : null].filter(Boolean).join(' · ');
}
