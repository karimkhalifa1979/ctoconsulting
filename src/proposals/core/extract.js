// Rules-based extraction of a client request pack (CR-03, CR-04). Every item links to its source document,
// page and paragraph. Claude does the same job with better recall when the server has an API key;
// this engine is the offline fallback and produces the same structure.
import { CHANNELS } from './constants.js';
import { textSimilarity } from './search.js';
import { uid, splitSentences } from './util.js';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DATE_RE = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b|\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i;
const TIME_RE = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)|\b([01]?\d|2[0-3]):([0-5]\d)\b|\b(noon|midday)\b/i;
const TZ_MAP = [
  [/brisbane time|queensland time/i, 'Australia/Brisbane'],
  [/\bAEDT\b|\bAEST\b|canberra time|sydney time|melbourne time|hobart time/i, 'Australia/Sydney'],
  [/\bACDT\b|adelaide time/i, 'Australia/Adelaide'],
  [/\bACST\b|darwin time/i, 'Australia/Darwin'],
  [/\bAWST\b|perth time/i, 'Australia/Perth'],
];
const CHANNEL_ALIASES = [
  [/austender/i, 'AusTender'], [/buyict|digital marketplace/i, 'BuyICT'], [/etendering|buy\.nsw|tenders\.nsw/i, 'NSW eTendering'],
  [/buying for victoria|tenders\.vic/i, 'Buying for Victoria'], [/qtenders/i, 'QTenders'], [/tenders ?wa/i, 'Tenders WA'], [/sa tenders/i, 'SA Tenders'],
];

const ORG_RE = /\b(Authority|Department|Council|Agency|Commission|Office|Service|Services|Limited|Ltd|Group|University|Corporation|Board|Registry|Fund|Network|Institute|Trust)\b/;

function parseDate(text) {
  const m = text.match(DATE_RE);
  if (!m) return null;
  let d, mo, y;
  if (m[1]) { d = +m[1]; mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; y = +m[3]; } else { d = +m[4]; mo = +m[5]; y = +m[6]; }
  if (!mo || d < 1 || d > 31) return null;
  return { iso: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, index: m.index, raw: m[0] };
}

function parseTime(text) {
  const m = text.match(TIME_RE);
  if (!m) return null;
  if (m[6]) return '12:00';
  if (m[4]) return `${m[4].padStart(2, '0')}:${m[5]}`;
  let h = +m[1];
  const mins = m[2] || '00';
  const pm = /p/i.test(m[3]);
  if (pm && h < 12) h += 12;
  if (!pm && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${mins}`;
}

function parseTz(text) {
  for (const [re, tz] of TZ_MAP) if (re.test(text)) return tz;
  return null;
}

function dateLabel(raw) {
  const t = raw.toLowerCase();
  if (/clos|lodg|submission (deadline|due)|responses? (are )?due|due date/.test(t)) return 'Closing date and time';
  if (/question|clarification|enquir/.test(t)) return 'Clarification deadline';
  if (/briefing|site visit|information session|industry/.test(t)) return 'Briefing session';
  if (/presentation|interview|orals|shortlist/.test(t)) return 'Presentation';
  if (/commence|start/.test(t)) return 'Contract start';
  if (/issued|release|published/.test(t)) return 'Request issued';
  if (/award|notif|decision/.test(t)) return 'Award notification';
  return raw.replace(/[:\t].*$/, '').trim().split(/\s+/).slice(0, 6).join(' ');
}

// Heading context: numbered or short title-case lines start a new section.
function headingOf(text) {
  const m = text.match(/^(\d{1,2})\.?\s+([A-Z][A-Za-z ,&/()\-–]{2,70})$/);
  if (m && !/[.:;]$/.test(text)) return m[2].trim();
  return null;
}

function contextOf(heading) {
  const h = (heading || '').toLowerCase();
  if (/submission|lodg|instruction|response format|response requirement/.test(h)) return 'submission';
  if (/key date|timetable|timeline|dates/.test(h)) return 'dates';
  if (/evaluat|assessment criteria|weighting|selection criteria/.test(h)) return 'evaluation';
  if (/pric|commercial|payment|fee|contract/.test(h)) return 'pricing';
  if (/returnable|schedules|attachments|forms/.test(h)) return 'forms';
  if (/background|introduction|overview|about/.test(h)) return 'background';
  if (/scope|services|objectives/.test(h)) return 'scope';
  return 'requirements';
}

const MANDATORY_RE = /\b(must|shall|is required to|are required to|will be required to|mandatory)\b/i;
const DESIRABLE_RE = /\b(should|desirable|highly regard|well regarded|preferred|advantageous|will be favourably)\b/i;
const META_RE = /(each of the following|the following (mandatory|desirable)|a response that does not|respondents must read|forms part of|must read it with|^(mandatory|desirable) requirements\.?$|\b(is|are) (deleted|removed|withdrawn)\b)/i;
// Submission instructions are captured separately and are not response requirements.
const SUBMISSION_RE = /(not exceed \d+ (A4 )?pages|\d+\s*(point|pt) font|file names?|naming convention|lodged (electronically|through|via)|late (responses|submissions)|submitted in (PDF|Word)|closing time is (extended|amended))/i;

export function flattenDocs(docs) {
  const out = [];
  for (const d of docs) {
    let heading = null;
    for (const p of d.pages || []) {
      p.paras.forEach((raw, i) => {
        const text = String(raw || '').trim();
        if (!text) return;
        const h = headingOf(text);
        if (h) heading = h;
        out.push({ docId: d.id, docName: d.name, page: p.n, para: i + 1, text, heading, context: contextOf(heading), isHeading: Boolean(h) });
      });
    }
  }
  return out;
}

const src = (p) => ({ docId: p.docId, page: p.page, para: p.para });

export function extractRequest(docs, { clients = [] } = {}) {
  const paras = flattenDocs(docs);
  const all = paras.map((p) => p.text).join('\n');
  const first = paras.filter((p) => p.page === 1).slice(0, 14);

  // Client: a known client named in the text, else an organisation-like line on page 1.
  let client = null;
  for (const c of clients) {
    const names = [c.name, ...(c.aliases || [])].filter(Boolean);
    const hit = paras.find((p) => names.some((n) => p.text.toLowerCase().includes(n.toLowerCase())));
    if (hit) { client = { value: c.name, clientId: c.id, src: src(hit), confidence: 0.95 }; break; }
  }
  if (!client) {
    const hit = first.find((p) => ORG_RE.test(p.text) && p.text.split(/\s+/).length <= 8 && !/request|reference|quote|tender/i.test(p.text));
    if (hit) client = { value: hit.text.replace(/[.:]$/, ''), clientId: null, src: src(hit), confidence: 0.7 };
  }

  // Reference number.
  let reference = null;
  for (const p of paras.slice(0, 40)) {
    const m = p.text.match(/\b(?:RFQ|RFT|RFP|RFI|ATM|EOI|Tender|Request)\s*(?:reference|ref\.?|no\.?|number|id)[:\s#]*([A-Z0-9][A-Z0-9\-/.]{3,}\d[A-Z0-9\-/]*)/i)
      || p.text.match(/\breference(?: number)?[:\s#]+([A-Z0-9][A-Z0-9\-/.]{3,}\d[A-Z0-9\-/]*)/i);
    if (m) { reference = { value: m[1].replace(/[.,]$/, ''), src: src(p), confidence: 0.9 }; break; }
  }

  // Opportunity title: first title-like line on page 1 that is not the client, the request type or a label.
  let title = null;
  for (const p of first) {
    const t = p.text;
    if (client && t.toLowerCase() === client.value.toLowerCase()) continue;
    if (/^(request for|approach to market|invitation to|tender|addendum)/i.test(t) || /[:\t]/.test(t) || /\d{4}/.test(t)) continue;
    const words = t.split(/\s+/).length;
    if (words >= 2 && words <= 14 && /^[A-Z]/.test(t) && !/[.]$/.test(t)) { title = { value: t, src: src(p), confidence: 0.75 }; break; }
  }

  // Procurement channel.
  let channel = null;
  for (const p of paras) {
    const hit = CHANNEL_ALIASES.find(([re]) => re.test(p.text));
    if (hit) { channel = { value: hit[1], src: src(p), confidence: 0.85 }; break; }
  }
  if (!channel) {
    const direct = CHANNELS.find((c) => all.toLowerCase().includes(c.toLowerCase()));
    if (direct) channel = { value: direct, src: null, confidence: 0.5 };
  }

  // Key dates.
  const dates = [];
  for (const p of paras) {
    if (p.isHeading) continue;
    const cells = p.text.split('\t');
    const dateText = cells.length > 1 ? cells.slice(1).join(' ') : p.text;
    const d = parseDate(dateText);
    if (!d) continue;
    const labelRaw = cells.length > 1 ? cells[0] : p.text;
    if (/^(event|milestone)$/i.test(labelRaw.trim())) continue;
    const label = dateLabel(labelRaw);
    if (/^issued/i.test(p.text) && !/request/i.test(label)) continue;
    const time = parseTime(dateText);
    const tz = parseTz(p.text) || (time ? 'Australia/Sydney' : null);
    const key = `${label}|${d.iso}`;
    if (dates.some((x) => `${x.label}|${x.date}` === key)) continue;
    // Keep the first occurrence of each label (the addendum comparison handles later changes).
    if (dates.some((x) => x.label === label && label !== 'Request issued') && p.context !== 'dates') continue;
    dates.push({ id: uid('dt'), label, date: d.iso, time, tz, text: p.text.replace(/\t/g, ' — '), src: src(p), confidence: cells.length > 1 ? 0.9 : 0.75 });
  }
  // Prefer the key-dates table entry for each label.
  const dedup = [];
  for (const d of dates) {
    const ex = dedup.find((x) => x.label === d.label);
    if (!ex) dedup.push(d);
    else if (ex.date !== d.date && d.label !== 'Request issued') dedup.push({ ...d, label: `${d.label} (also stated)` });
  }

  // Submission instructions.
  const submission = [];
  const addSub = (label, value, p, extra = {}) => {
    if (submission.some((s) => s.label === label)) return;
    submission.push({ id: uid('si'), label, value, src: src(p), ...extra });
  };
  for (const p of paras) {
    for (const s of splitSentences(p.text)) {
      let m;
      if ((m = s.match(/(?:not exceed|maximum of|no more than|limited to|up to)\s+(\d+)\s+(?:A4\s+)?pages?/i)) && !/^(\d+(\.\d+)*\s+)?CVs?\b/i.test(s)) addSub('Page limit', s, p, { number: +m[1] });
      else if ((m = s.match(/(?:not exceed|maximum of|no more than|limited to)\s+([\d,]+)\s+words/i))) addSub('Word limit', s, p, { number: +m[1].replace(/,/g, '') });
      if (/\b(Arial|Calibri|Times New Roman|Helvetica|Verdana|Segoe UI)\b/i.test(s) && /\d+\s*(point|pt)\b/i.test(s)) addSub('Font and layout', s, p);
      if (/nam(ed|ing)[^.]*convention|file names?\b/i.test(s)) addSub('File naming', s, p);
      if (/\b(PDF|Microsoft Word|\.docx|Excel|\.xlsx)\b/.test(s) && /format|submitted in|provided in/i.test(s) && !/returnable schedule \d/i.test(s)) addSub('Format', s, p);
      if (/lodg(ed|ement)|submitted (electronically|via|through)|upload/i.test(s) && p.context !== 'pricing' && !/question/i.test(s)) addSub('Lodgement method', s, p);
      if (/late (responses|submissions|tenders)/i.test(s)) addSub('Late responses', s, p);
      if (/^(\d+(\.\d+)*\s+)?CVs?\b[^.]*\b(\d+|one|two|three)\s+pages?/i.test(s)) addSub('CV length', s, p);
    }
  }

  // Evaluation criteria.
  const criteria = [];
  for (const p of paras) {
    if (p.context !== 'evaluation' || p.isHeading) continue;
    const cells = p.text.split('\t');
    let name = null, weight = null;
    if (cells.length > 1) {
      const w = cells[1].match(/(\d{1,3})\s*%/);
      if (w) { name = cells[0].trim(); weight = +w[1]; }
    } else {
      const m = p.text.match(/^(?:\(?[a-z0-9]{1,3}[).]\s*)?(.{6,90}?)\s*[–\-:(]\s*(\d{1,3})\s*%\)?\.?$/i);
      if (m) { name = m[1].trim(); weight = +m[2]; }
    }
    if (name && !/^criteri(on|a)$/i.test(name)) criteria.push({ id: uid('cr'), name, weight, src: src(p) });
  }

  // Requirements.
  const requirements = [];
  let defaultKind = null;
  const refsSeen = new Map();
  const addReq = (ref, text, kind, category, p, confidence) => {
    let r = ref;
    if (refsSeen.has(r)) { const n = refsSeen.get(r) + 1; refsSeen.set(r, n); r = `${ref}-${n}`; } else refsSeen.set(r, 1);
    requirements.push({ id: uid('rq'), ref: r, text: text.trim(), kind, category, src: src(p), confidence, confirmed: false, compliance: '', sectionIds: [], evidence: '' });
  };
  let auto = 0;
  for (const p of paras) {
    if (p.isHeading) continue;
    const t = p.text;
    if (/mandatory requirements/i.test(t)) defaultKind = 'mandatory';
    if (/desirable requirements|highly regard/i.test(t)) defaultKind = 'desirable';
    if (['submission', 'dates', 'evaluation', 'forms'].includes(p.context)) continue;
    const row = t.match(/^((?:[MDR]|REQ|SR|TR|FR|Q)[-\s]?\d{1,3}[a-z]?)\s*[\t:.\-–]\s*(.+)$/i);
    if (row) {
      const ref = row[1].replace(/\s+/, '').toUpperCase();
      if (/^Q/.test(ref)) continue;
      const body = row[2];
      if (META_RE.test(body)) continue;
      const kind = /^M/.test(ref) ? 'mandatory' : /^D/.test(ref) ? 'desirable' : DESIRABLE_RE.test(body) && !MANDATORY_RE.test(body) ? 'desirable' : MANDATORY_RE.test(body) ? 'mandatory' : defaultKind || 'desirable';
      addReq(ref, body, kind, p.context === 'pricing' ? 'Commercial' : 'Service', p, 0.92);
      continue;
    }
    const clause = (t.match(/^(\d{1,2}(?:\.\d{1,2}){1,3})\s+/) || [])[1];
    const sentences = splitSentences(t.replace(/^\d{1,2}(?:\.\d{1,2}){1,3}\s+/, ''));
    let k = 0;
    for (const s of sentences) {
      if (META_RE.test(s) || SUBMISSION_RE.test(s) || s.split(/\s+/).length < 5) continue;
      const mand = MANDATORY_RE.test(s);
      const des = !mand && DESIRABLE_RE.test(s);
      if (!mand && !des) continue;
      if (/^(Respondents may|Answers will|The Authority will|The Office will)/i.test(s)) continue;
      if (/returnable schedule \d|attachment [a-z]\b/i.test(s) && p.context === 'pricing' && !/rates|price/i.test(s.replace(/pricing schedule/i, ''))) continue;
      k++;
      const ref = clause ? (k > 1 ? `${clause}(${k})` : clause) : `R-${String(++auto).padStart(3, '0')}`;
      addReq(ref, s, mand ? 'mandatory' : 'desirable', p.context === 'pricing' ? 'Commercial' : 'Service', p, clause ? 0.8 : 0.65);
    }
  }
  // Map each requirement to its closest evaluation criterion.
  for (const r of requirements) {
    let best = null, score = 0;
    for (const c of criteria) {
      const s = textSimilarity(r.text, c.name);
      if (s > score) { best = c; score = s; }
    }
    const find = (re) => criteria.find((c) => re.test(c.name))?.id || null;
    if (best && score > 0.12) r.criterionId = best.id;
    else if (r.category === 'Commercial') r.criterionId = find(/price|value|cost/i);
    else if (/experience/i.test(r.text)) r.criterionId = find(/experience/i);
    else if (/personnel|clearance|engagement lead|team|staff/i.test(r.text)) r.criterionId = find(/team|personnel|capabilit/i);
    else r.criterionId = find(/approach|methodolog|solution/i) || find(/understanding/i);
  }

  // Pricing and commercial conditions.
  const pricingParas = paras.filter((p) => p.context === 'pricing' && !p.isHeading);
  const pricingText = pricingParas.map((p) => p.text).join(' ') + ' ' + paras.filter((p) => /pric|rates|capped|fixed price/i.test(p.text)).map((p) => p.text).join(' ');
  const models = [];
  if (/fixed price/i.test(pricingText)) models.push('fixed');
  if (/capped time and materials|capped t&m|not[- ]to[- ]exceed/i.test(pricingText)) models.push('capped');
  if (/\btime and materials\b/i.test(pricingText.replace(/capped time and materials/gi, ''))) models.push('tm');
  if (/retainer/i.test(pricingText)) models.push('retainer');
  const isFormat = (p) => /pricing schedule|price schedule|schedule of rates/i.test(p.text) && /excel|format|complete/i.test(p.text);
  const formatP = paras.find((p) => p.context === 'pricing' && isFormat(p)) || paras.find(isFormat);
  const pricing = {
    format: formatP ? { value: formatP.text.replace(/^\d+(\.\d+)*\s+/, ''), src: src(formatP) } : null,
    models,
    conditions: pricingParas.filter((p) => !/returnable schedule \d – /i.test(p.text) || /must/.test(p.text)).map((p) => ({ text: p.text.replace(/^\d+(\.\d+)*\s+/, ''), src: src(p) })),
    departures: paras.filter((p) => /departure/i.test(p.text)).map((p) => ({ text: p.text.replace(/^\d+(\.\d+)*\s+/, ''), src: src(p) })),
    liability: paras.filter((p) => /liabilit/i.test(p.text)).map((p) => ({ text: p.text.replace(/^\d+(\.\d+)*\s+/, ''), src: src(p) })),
  };

  // Response forms the client requires.
  const forms = [];
  const formOrder = [...paras.filter((p) => p.context === 'forms'), ...paras.filter((p) => p.context !== 'forms')];
  for (const p of formOrder) {
    const m = p.text.match(/\b((?:Returnable\s+)?Schedule|Attachment|Annexure|Form)\s+([A-Z0-9]{1,3})\s*[–\-:]\s*([^.(\t]{3,80})/);
    if (!m) continue;
    const name = `${m[1]} ${m[2]} – ${m[3].replace(/\s+(in|using|on|with|by)\s+the\b.*$/i, '').trim()}`;
    const key = `${m[1].toLowerCase()} ${m[2]}`;
    if (forms.some((f) => f.key === key)) continue;
    forms.push({ id: uid('fm'), key, name, src: src(p) });
  }

  const closing = dedup.find((d) => d.label === 'Closing date and time') || null;
  return {
    mode: 'rules',
    fields: { client, title, reference, channel },
    closing: closing ? { date: closing.date, time: closing.time || '14:00', tz: closing.tz || 'Australia/Sydney', src: closing.src } : null,
    dates: dedup,
    submission,
    criteria,
    requirements,
    pricing,
    forms,
    stats: { paragraphs: paras.length, pages: new Set(paras.map((p) => `${p.docId}:${p.page}`)).size },
  };
}

// Interprets an addendum against the current requirement list (CR-09).
export function interpretAddendum(addendumDocs, currentReqs, currentDates) {
  const ext = extractRequest(addendumDocs);
  const paras = flattenDocs(addendumDocs);
  const changes = [];
  for (const r of ext.requirements) {
    const base = r.ref.replace(/-\d+$/, '');
    const ex = currentReqs.find((c) => c.ref === base);
    if (ex) {
      if (ex.text.trim() !== r.text.trim()) changes.push({ kind: 'changed', ref: base, before: ex, after: { ...r, ref: base } });
    } else changes.push({ kind: 'added', ref: r.ref, before: null, after: r });
  }
  for (const p of paras) {
    const m = p.text.match(/\b(?:requirement\s+)?([MDR]\d{1,3})\b[^.]*\b(deleted|removed|withdrawn|no longer applies)\b/i);
    if (m) {
      const ex = currentReqs.find((c) => c.ref === m[1].toUpperCase());
      if (ex) changes.push({ kind: 'removed', ref: ex.ref, before: ex, after: null, src: { docId: p.docId, page: p.page, para: p.para } });
    }
  }
  const dateChanges = [];
  for (const d of ext.dates) {
    if (d.label === 'Request issued') continue;
    const ex = currentDates.find((c) => c.label === d.label);
    if (ex && (ex.date !== d.date || (d.time && ex.time !== d.time))) dateChanges.push({ label: d.label, before: ex, after: d });
    else if (!ex && d.label !== 'Request issued') dateChanges.push({ label: d.label, before: null, after: d });
  }
  return { changes, dateChanges, submission: ext.submission, extraction: ext };
}
