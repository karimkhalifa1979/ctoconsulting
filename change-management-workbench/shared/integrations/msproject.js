// Microsoft Project interchange (PLN-008, INI-006, INT-004): MSPDI XML export of plan activities and
// milestones, and import of milestones from MSPDI XML or CSV. Works in Node and browsers (no DOM needed).
import { escapeXml, parseCsv } from '../util.js';
import { diffDays, isIsoDate, parseAuDate } from '../dates.js';

const tag = (xml, name) => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&') : null;
};

function guessKind(name) {
  const n = String(name || '').toLowerCase();
  if (/go[\s-]?live|cutover|launch/.test(n)) return 'goLive';
  if (/\buat\b|acceptance test/.test(n)) return 'uat';
  if (/design (sign[\s-]?off|approval)/.test(n)) return 'designSignOff';
  if (/hypercare/.test(n)) return 'hypercareExit';
  if (/release/.test(n)) return 'release';
  if (/wave/.test(n)) return 'wave';
  if (/phase/.test(n)) return 'phase';
  return 'other';
}

export function parseMspdi(xml) {
  const out = [];
  const tasks = String(xml || '').match(/<Task>[\s\S]*?<\/Task>/g) || [];
  for (const t of tasks) {
    const name = tag(t, 'Name');
    if (!name) continue;
    const milestone = tag(t, 'Milestone') === '1';
    const summary = tag(t, 'Summary') === '1';
    if (!milestone && !summary) continue;
    const start = (tag(t, 'Start') || '').slice(0, 10);
    const finish = (tag(t, 'Finish') || '').slice(0, 10);
    const date = milestone ? start || finish : finish;
    if (!isIsoDate(date)) continue;
    out.push({ name: name.trim(), date, kind: guessKind(name), externalRef: `msp:${tag(t, 'UID')}`, description: summary ? `Summary task ${start} to ${finish}` : '' });
  }
  return out;
}

// CSV with headers Name, Date[, Type, Reference]. Dates in DD/MM/YYYY or ISO form.
export function parseMilestoneCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n) => head.findIndex((h) => h.includes(n));
  const iName = col('name'), iDate = col('date'), iType = col('type'), iRef = col('ref');
  return rows.slice(1).map((c) => {
    const date = parseAuDate(c[iDate]);
    return { name: (c[iName] || '').trim(), date, kind: (iType >= 0 && c[iType] && c[iType].replace(/\s+/g, '')) || guessKind(c[iName]), externalRef: iRef >= 0 ? c[iRef] || null : null };
  }).filter((x) => x.name && x.date);
}

function hoursBetween(start, end) {
  const days = Math.max(1, (diffDays(start, end) || 0) + 1);
  // Five working days in seven.
  return Math.max(8, Math.round((days * 5) / 7) * 8);
}

export function toMspdi({ initiative, activities = [], milestones = [] }) {
  const tasks = [];
  let uid = 1;
  const uidOf = {};
  const sorted = [...activities].filter((a) => a.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (const a of sorted) uidOf[a.id] = ++uid;
  tasks.push(`<Task><UID>1</UID><ID>1</ID><Name>${escapeXml(initiative.name)} – change activities</Name><Type>1</Type><IsNull>0</IsNull><OutlineNumber>1</OutlineNumber><OutlineLevel>1</OutlineLevel><Summary>1</Summary><Milestone>0</Milestone></Task>`);
  let id = 1;
  for (const a of sorted) {
    id++;
    const end = a.endDate || a.startDate;
    const hours = hoursBetween(a.startDate, end);
    const preds = (a.dependencies || []).filter((d) => uidOf[d]).map((d) => `<PredecessorLink><PredecessorUID>${uidOf[d]}</PredecessorUID><Type>1</Type></PredecessorLink>`).join('');
    tasks.push(`<Task><UID>${uidOf[a.id]}</UID><ID>${id}</ID><Name>${escapeXml(`${a.code ? `${a.code} ` : ''}${a.title}`)}</Name><Type>0</Type><IsNull>0</IsNull><OutlineNumber>1.${id - 1}</OutlineNumber><OutlineLevel>2</OutlineLevel><Start>${a.startDate}T09:00:00</Start><Finish>${end}T17:00:00</Finish><Duration>PT${hours}H0M0S</Duration><DurationFormat>7</DurationFormat><Milestone>0</Milestone><Summary>0</Summary><PercentComplete>${Math.round(Number(a.percentComplete) || (a.status === 'complete' ? 100 : 0))}</PercentComplete><Notes>${escapeXml([a.description, (a.plans || []).join(', '), (a.adkar || []).join(', ')].filter(Boolean).join(' | '))}</Notes>${preds}</Task>`);
  }
  for (const m of milestones.filter((x) => x.date)) {
    id++;
    tasks.push(`<Task><UID>${++uid}</UID><ID>${id}</ID><Name>${escapeXml(m.name)}</Name><Type>0</Type><IsNull>0</IsNull><OutlineNumber>${id}</OutlineNumber><OutlineLevel>1</OutlineLevel><Start>${m.date}T09:00:00</Start><Finish>${m.date}T09:00:00</Finish><Duration>PT0H0M0S</Duration><DurationFormat>7</DurationFormat><Milestone>1</Milestone><Summary>0</Summary></Task>`);
  }
  const start = [...sorted.map((a) => a.startDate), ...milestones.map((m) => m.date)].filter(Boolean).sort()[0] || initiative.startDate || new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project xmlns="http://schemas.microsoft.com/project"><SaveVersion>14</SaveVersion><Name>${escapeXml(initiative.name)}</Name><Title>${escapeXml(initiative.name)} change activities</Title><ScheduleFromStart>1</ScheduleFromStart><StartDate>${start}T09:00:00</StartDate><MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>2400</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth><DefaultStartTime>09:00:00</DefaultStartTime><DefaultFinishTime>17:00:00</DefaultFinishTime><Tasks>${tasks.join('')}</Tasks></Project>\n`;
}
