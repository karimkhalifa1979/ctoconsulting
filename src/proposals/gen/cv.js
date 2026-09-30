// CVs generated from structured consultant profiles in the format each client requires (CL-09, PR-02),
// and the orals rehearsal pack (PP-08).
import { buildDocument, PAGE } from './wordTemplate.js';
import { para, textRun, table } from './ooxml.js';
import { longDate } from '../core/util.js';

const H = (level, text, extra = {}) => para(textRun(text), { style: `Heading${level}`, ...extra });
const P = (text, style) => para(textRun(text), style ? { style } : {});
const bullets = (items) => items.map((t) => para(textRun(t), { style: 'ListBullet' })).join('');
const W = PAGE.text;

function cvCto(c, line, i) {
  const exp = (c.experience || []).slice(0, 5);
  return [
    H(1, c.name, { pageBreakBefore: i > 0 }),
    P(`${line?.role || c.role} | ${c.level}`, 'Subtitle'),
    table({ style: 'CTOTable', widths: [2600, W - 2600], header: ['Summary', ''], cellStyle: 'TableText', rows: [
      ['Proposed role', line?.role || c.role], ['Level', c.level], ['Security clearance', c.clearance || 'None'], ['Years of experience', String(c.years || '')],
      ['Certifications', (c.certifications || []).join(', ') || '—'], ['Sectors', (c.sectors || []).join(', ') || '—'],
    ] }),
    H(2, 'Profile'), P(c.bio || ''),
    H(2, 'Key skills'), bullets(c.skills || []),
    exp.length ? H(2, 'Selected experience') : '',
    ...exp.map((e) => `${para([textRun(`${e.client}`, { bold: true }), textRun(` — ${e.role}${e.period ? ` (${e.period})` : ''}`)])}${P(e.summary || '')}`),
    c.education ? H(2, 'Education') + P(c.education) : '',
  ].join('');
}

function cvShort(c, line, i) {
  return [
    H(1, `${c.name}, ${line?.role || c.role}`, { pageBreakBefore: i > 0 }),
    P(`${c.level} | ${c.clearance && c.clearance !== 'None' ? `${c.clearance} clearance` : 'No clearance'} | ${(c.certifications || []).slice(0, 3).join(', ')}`, 'CoverMeta'),
    P(c.bio || ''),
    H(2, 'Key skills'), P((c.skills || []).join(' · ')),
    (c.experience || []).length ? H(2, 'Recent engagements') + bullets((c.experience || []).slice(0, 3).map((e) => `${e.client}: ${e.summary}`)) : '',
  ].join('');
}

function cvGov(c, line, i) {
  const caps = (c.skills || []).slice(0, 6).map((s) => [s, (c.experience || []).find((e) => new RegExp(s.split(' ')[0], 'i').test(e.summary))?.summary || c.bio.split('. ')[0]]);
  return [
    H(1, c.name, { pageBreakBefore: i > 0 }),
    table({ style: 'CTOTable', widths: [3000, W - 3000], header: ['Item', 'Detail'], cellStyle: 'TableText', rows: [
      ['Proposed role', line?.role || c.role], ['Classification / level', c.level], ['Security clearance held', c.clearance || 'None'], ['Days proposed', line ? String(line.days) : '—'],
      ['Qualifications and certifications', (c.certifications || []).join('; ') || '—'], ['Referees', 'Available on request'],
    ] }),
    H(2, 'Capability against the role'),
    table({ style: 'CTOTable', widths: [3000, W - 3000], header: ['Capability', 'Evidence'], cellStyle: 'TableText', rows: caps }),
    H(2, 'Profile'), P(c.bio || ''),
  ].join('');
}

export async function buildCvPack(people, format = 'cto', { title = 'CVs', client = '', header = '' } = {}) {
  const render = { cto: cvCto, short: cvShort, gov: cvGov }[format] || cvCto;
  const body = [
    P(title, 'Title'), P(client ? `Prepared for ${client} · ${longDate(new Date().toISOString().slice(0, 10), { weekday: false })}` : '', 'Subtitle'),
    ...people.map((p, i) => render(p.consultant, p.line, i + 1)),
  ].join('');
  return buildDocument({ bodyXml: body, title, header: header || title });
}

export async function buildRehearsalPack(bid, clientName, questions) {
  const groups = new Map();
  for (const q of questions) groups.set(q.criterion, [...(groups.get(q.criterion) || []), q]);
  const body = [
    P('Orals rehearsal pack', 'Title'), P(`${bid.title} · ${clientName}`, 'Subtitle'),
    P('Likely panel questions drawn from the evaluation criteria, the risks in the request and our proposed departures. Each question has a suggested answer from the approved response and a named presenter.'),
    ...[...groups.entries()].map(([crit, qs]) => H(1, `${crit}${qs[0].weight ? ` (${qs[0].weight}%)` : ''}`) + table({
      style: 'CTOTable', widths: [3200, 4638, 1800], header: ['Likely question', 'Suggested answer', 'Presenter'], cellStyle: 'TableText',
      rows: qs.map((q) => [q.question, q.answer, q.presenter || '—']),
    })),
  ].join('');
  return buildDocument({ bodyXml: body, title: 'Orals rehearsal pack', header: `${bid.ref} · Rehearsal pack · Internal` });
}
