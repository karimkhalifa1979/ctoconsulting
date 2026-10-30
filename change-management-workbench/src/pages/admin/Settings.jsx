// Settings and thresholds (ADM-001, ADM-005, ADM-007, AIA-007, SEC-09, SEC-11, PRT-002): the organisation,
// classification markings, the ADKAR threshold and group rules, impact, risk and RAG thresholds, engagement
// cadence, load limits and alerts, prioritisation and readiness weights, saturation thresholds, change agent
// coverage, blackout periods and public holidays, attachments and AI features.
import { useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { Card, Badge } from '../../ui/core.jsx';
import { useApp } from '../../state/app.jsx';
import { useSaveConfig } from './Admin.jsx';
import { options } from '../../lib/format.js';
import { DEFAULT_SETTINGS } from '../../../shared/refdata.js';
import { defaultHolidays, fmtDate } from '../../../shared/dates.js';
import { asArray, clone, uid } from '../../../shared/util.js';

const get = (o, path) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const put = (o, path, v) => {
  const keys = path.split('.');
  const out = { ...o };
  let cur = out;
  keys.slice(0, -1).forEach((k) => { cur[k] = { ...(cur[k] || {}) }; cur = cur[k]; });
  cur[keys[keys.length - 1]] = v;
  return out;
};
const QUADS = [['manageClosely', 'Manage closely'], ['keepSatisfied', 'Keep satisfied'], ['keepInformed', 'Keep informed'], ['monitor', 'Monitor']];

const SECTIONS = (config) => [
  { id: 'org', title: 'Organisation', fields: [
    { path: 'organisationName', label: 'Organisation name', type: 'text', help: 'Shown on artefacts and in email.' },
    { path: 'timeZone', label: 'Organisation time zone', type: 'tz', help: 'Used for business dates, schedules and deadlines. People can choose their own time zone for display.' },
    { path: 'sessionTimeoutMinutes', label: 'Sign out after inactivity (minutes)', type: 'int', min: 5, max: 720, ref: 'SEC-09' },
  ] },
  { id: 'class', title: 'Security classification', fields: [
    { path: 'classification.default', label: 'Default marking for artefacts', type: 'select', options: options('classification', config), ref: 'ADM-007' },
    { path: 'classification.sensitiveDefault', label: 'Marking when sensitive fields are included', type: 'select', options: options('classification', config), ref: 'RUL-17' },
    { path: 'artefacts.exportWatermark', label: 'Mark downloaded artefacts with the person and time', type: 'bool', ref: 'SEC-11' },
  ] },
  { id: 'adkar', title: 'ADKAR results', fields: [
    { path: 'adkar.threshold', label: 'Barrier point threshold (score at or below)', type: 'number', min: 1, max: 5, step: 0.5, ref: 'RUL-01' },
    { path: 'adkar.groupMethod', label: 'Group barrier point uses', type: 'select', options: [{ id: 'mean', label: 'The mean score of the group' }, { id: 'proportion', label: 'The share of people at or below the threshold' }], ref: 'RUL-02' },
    { path: 'adkar.groupProportion', label: 'Share of people that makes it a barrier (%)', type: 'percent', min: 5, max: 95, showIf: (s) => s.adkar?.groupMethod === 'proportion' },
    { path: 'adkar.minSegment', label: 'Smallest group whose results are shown', type: 'int', min: 3, max: 50, ref: 'RUL-03' },
    { path: 'adkar.staleDays', label: 'Results older than this are flagged (days)', type: 'int', min: 14, max: 730 },
  ] },
  { id: 'impact', title: 'Impact and risk', fields: [
    { path: 'impact.rollup', label: 'Overall impact of a group', type: 'select', options: [{ id: 'highest', label: 'Highest aspect score' }, { id: 'weightedAverage', label: 'Weighted average of aspects' }], ref: 'RUL-20' },
    { path: 'impact.highImpact', label: 'High impact from (0–5)', type: 'number', min: 1, max: 5, step: 0.5 },
    { path: 'risk.lowBelow', label: 'Low risk profile below (0–100)', type: 'int', min: 1, max: 99, ref: 'RSK-003' },
    { path: 'risk.highFrom', label: 'High risk profile from (0–100)', type: 'int', min: 1, max: 100 },
    { path: 'rag.greenFrom', label: 'Green (on track) from (%)', type: 'int', min: 1, max: 100 },
    { path: 'rag.amberFrom', label: 'Amber (at risk) from (%)', type: 'int', min: 0, max: 99 },
    { path: 'readinessThreshold', label: 'Readiness needed for go-live (index)', type: 'int', min: 1, max: 100 },
  ] },
  { id: 'cadence', title: 'Engagement cadence and load', fields: [
    ...QUADS.map(([k, l]) => ({ path: `cadenceDays.${k}`, label: `${l}: engage at least every (days)`, type: 'int', min: 1, max: 365, ref: k === 'manageClosely' ? 'RUL-06' : undefined })),
    ...QUADS.map(([k, l]) => ({ path: `cadenceGroupCredit.${k}`, label: `${l}: communications and group sessions count`, type: 'bool' })),
    { path: 'load.stakeholderMaxPer7Days', label: 'Most engagements for one person in 7 days', type: 'int', min: 1, max: 20, ref: 'STK-027' },
    { path: 'load.groupMaxCommsPer7Days', label: 'Most communications to one group in 7 days', type: 'int', min: 1, max: 30 },
    { path: 'lockBusinessDays', label: 'Lock completed engagements after (business days)', type: 'int', min: 1, max: 60 },
  ] },
  { id: 'alerts', title: 'Alerts', fields: [
    { path: 'alerts.upcomingDays', label: 'Remind owners of engagements this many days ahead', type: 'int', min: 0, max: 30 },
    { path: 'alerts.notEngagedDays', label: 'Flag priority stakeholders not engaged for (days)', type: 'int', min: 7, max: 365 },
    { path: 'alerts.completionGraceBusinessDays', label: 'Unlogged engagements become critical after (business days)', type: 'int', min: 1, max: 30 },
    { path: 'alerts.barrierChangeDays', label: 'Report barrier point changes within (days)', type: 'int', min: 7, max: 180 },
  ] },
  { id: 'weights', title: 'Prioritisation and readiness weights', note: 'Each set of weights should add up to 100.', fields: [
    ...[['influence', 'Influence'], ['impact', 'Impact'], ['gap', 'Engagement gap'], ['barrier', 'ADKAR barrier'], ['role', 'Change role']].map(([k, l]) => ({ path: `priorityWeights.${k}`, label: `Priority: ${l}`, type: 'int', min: 0, max: 100, sum: 'priorityWeights' })),
    ...[['adkar', 'ADKAR results'], ['training', 'Training completion'], ['criteria', 'Readiness criteria'], ['sentiment', 'Sentiment']].map(([k, l]) => ({ path: `readinessWeights.${k}`, label: `Readiness: ${l}`, type: 'int', min: 0, max: 100, sum: 'readinessWeights' })),
  ] },
  { id: 'saturation', title: 'Change saturation and change agents', fields: [
    { path: 'saturation.maxInitiatives', label: 'Most initiatives affecting a group at once', type: 'int', min: 1, max: 20, ref: 'PRT-002' },
    { path: 'saturation.maxAggregateImpact', label: 'Highest combined impact on a group', type: 'number', min: 1, max: 50, step: 0.5 },
    { path: 'saturation.maxHoursPerPersonPerMonth', label: 'Most engagement and training hours a person a month', type: 'number', min: 1, max: 80, step: 0.5 },
    { path: 'agentCoverage.headcountPerAgent', label: 'People per change agent', type: 'int', min: 5, max: 1000, ref: 'CAN-002' },
    { path: 'agentCoverage.minPerGroup', label: 'Fewest change agents in a group', type: 'int', min: 0, max: 20 },
    { path: 'agentCoverage.minPerLocation', label: 'Fewest change agents at a location', type: 'int', min: 0, max: 20 },
    { path: 'agentCoverage.maxPerGroup', label: 'Most change agents in a group', type: 'int', min: 1, max: 200 },
  ] },
  { id: 'files', title: 'Attachments', fields: [
    { path: 'attachments.maxMb', label: 'Largest attachment (MB)', type: 'int', min: 1, max: 200, ref: 'WFL-005' },
    { path: 'attachments.allowed', label: 'Allowed file types (separated by commas)', type: 'csv', ref: 'SEC-10' },
  ] },
  { id: 'ai', title: 'AI assistance', note: 'AI features are advisory: drafts are marked until a person accepts them, sensitive fields are never sent, and prompts and outputs are logged (AIA-004 to AIA-006). Each initiative can also turn AI off.', fields: [
    { path: 'ai.enabled', label: 'AI assistance is available in this organisation', type: 'bool', ref: 'AIA-007' },
    { path: 'ai.features.draftNarrative', label: 'Draft narrative sections such as executive summaries', type: 'bool', showIf: (s) => s.ai?.enabled !== false },
    { path: 'ai.features.summariseEngagement', label: 'Summarise engagement notes and suggest themes', type: 'bool', showIf: (s) => s.ai?.enabled !== false },
    { path: 'ai.features.suggestInterventions', label: 'Suggest interventions for barrier points', type: 'bool', showIf: (s) => s.ai?.enabled !== false },
    { path: 'ai.features.draftCommunication', label: 'Draft communications and key messages', type: 'bool', showIf: (s) => s.ai?.enabled !== false },
  ] },
];

function zones() {
  try { const all = Intl.supportedValuesOf('timeZone'); return [...all.filter((z) => z.startsWith('Australia/')), ...all.filter((z) => !z.startsWith('Australia/'))]; } catch { return ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth', 'Australia/Hobart', 'Australia/Darwin']; }
}

function Field({ f, value, onChange }) {
  const id = `set-${f.path}`;
  const lab = <span>{f.label}{f.ref && <span className="hint"> · {f.ref}</span>}</span>;
  switch (f.type) {
    case 'bool': return <label className="check settings-check"><input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />{lab}</label>;
    case 'select': return <label className="field" htmlFor={id}>{lab}<select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>{f.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>;
    case 'tz': return <label className="field" htmlFor={id}>{lab}<select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)}>{zones().map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</select></label>;
    case 'percent': return <label className="field" htmlFor={id}>{lab}<input id={id} type="number" min={f.min} max={f.max} value={value == null ? '' : Math.round(Number(value) * 100)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value) / 100)} /></label>;
    case 'int': case 'number': return <label className="field" htmlFor={id}>{lab}<input id={id} type="number" min={f.min} max={f.max} step={f.step || 1} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} aria-invalid={value != null && ((f.min != null && value < f.min) || (f.max != null && value > f.max))} /></label>;
    case 'csv': return <label className="field" htmlFor={id}>{lab}<input id={id} value={asArray(value).join(', ')} onChange={(e) => onChange(e.target.value.split(',').map((x) => x.trim().toLowerCase().replace(/^\./, '')).filter(Boolean))} /></label>;
    default: return <label className="field" htmlFor={id}>{lab}<input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></label>;
  }
}

export default function Settings() {
  const { settings, config } = useApp();
  const { save, saving } = useSaveConfig();
  const [d, setD] = useState(() => clone(settings));
  const sections = useMemo(() => SECTIONS(config), [config]);
  const dirty = JSON.stringify(d) !== JSON.stringify(settings);
  const issues = [];
  const sum = (k) => Object.values(d[k] || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  if (sum('priorityWeights') !== 100) issues.push(`Priority weights add up to ${sum('priorityWeights')}, not 100.`);
  if (sum('readinessWeights') !== 100) issues.push(`Readiness weights add up to ${sum('readinessWeights')}, not 100.`);
  if (Number(d.rag?.greenFrom) <= Number(d.rag?.amberFrom)) issues.push('Green must start above amber.');
  if (Number(d.risk?.highFrom) <= Number(d.risk?.lowBelow)) issues.push('The high risk profile must start above the low one.');
  for (const s of sections) for (const f of s.fields) {
    const v = get(d, f.path);
    if (['int', 'number'].includes(f.type) && v != null && ((f.min != null && v < f.min) || (f.max != null && v > f.max))) issues.push(`${f.label} must be between ${f.min} and ${f.max}.`);
  }
  return (
    <div className="stack">
      <div className="sticky-actions row-between">
        <span className="small muted">{dirty ? 'You have unsaved changes.' : 'Changes apply to every initiative once saved, and are recorded in the audit trail.'}</span>
        <div className="btn-row">
          <button type="button" className="btn" disabled={!dirty || saving} onClick={() => setD(clone(settings))}>Undo changes</button>
          <button type="button" className="btn btn-primary" disabled={!dirty || saving || issues.length > 0} onClick={() => save('settings', d, 'Settings saved')}><Icon name="check" />{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      </div>
      {issues.length > 0 && <div className="callout warn small" role="alert">{issues.map((i) => <div key={i}>{i}</div>)}</div>}
      {sections.map((s) => (
        <Card key={s.id} title={s.title} sub={s.note}>
          <div className="form-grid">
            {s.fields.filter((f) => !f.showIf || f.showIf(d)).map((f) => <Field key={f.path} f={f} value={get(d, f.path)} onChange={(v) => setD((x) => put(x, f.path, v))} />)}
          </div>
        </Card>
      ))}
      <Blackouts d={d} setD={setD} />
      <Holidays d={d} setD={setD} />
      <p className="small muted">Defaults shipped with the workbench: {Object.keys(DEFAULT_SETTINGS).length} settings. Privacy, sensitive fields, collection notices and retention are under Privacy and retention.</p>
    </div>
  );
}

// Blackout periods: no engagements or communications are planned in them without a warning (STK-027).
function Blackouts({ d, setD }) {
  const list = asArray(d.blackouts);
  const set = (next) => setD((x) => ({ ...x, blackouts: next }));
  return (
    <Card title="Blackout periods" sub="Times when people should not be asked to take part in change activities. Planned engagements and communications in them are flagged.">
      <table className="tbl tbl-compact">
        <thead><tr><th>Name</th><th>From (DD-MM)</th><th>To (DD-MM)</th><th>Every year</th><th><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>
          {list.map((b, i) => {
            const upd = (patch) => set(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            const show = (mmdd) => (mmdd ? `${mmdd.slice(3, 5)}-${mmdd.slice(0, 2)}` : '');
            const parse = (v) => { const m = /^(\d{1,2})-(\d{1,2})$/.exec(v.trim()); return m ? `${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : v; };
            return (
              <tr key={b.id || i}>
                <td><input aria-label="Name" value={b.name || ''} onChange={(e) => upd({ name: e.target.value })} /></td>
                <td><input aria-label="From" value={show(b.start)} placeholder="20-06" onChange={(e) => upd({ start: parse(e.target.value) })} style={{ width: 90 }} /></td>
                <td><input aria-label="To" value={show(b.end)} placeholder="10-07" onChange={(e) => upd({ end: parse(e.target.value) })} style={{ width: 90 }} /></td>
                <td><input type="checkbox" aria-label="Every year" checked={b.annual !== false} onChange={(e) => upd({ annual: e.target.checked })} /></td>
                <td><button type="button" className="icon-btn" aria-label={`Remove ${b.name}`} onClick={() => set(list.filter((_, j) => j !== i))}><Icon name="trash" /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="btn btn-sm mt-2" onClick={() => set([...list, { id: uid('bo'), name: 'New blackout period', start: '12-22', end: '01-05', annual: true }])}><Icon name="plus" />Add a blackout period</button>
    </Card>
  );
}

// Public holidays for business-day calculations (milestone-relative dates, locking, alerts).
function Holidays({ d, setD }) {
  const custom = asArray(d.holidays);
  const year = new Date().getFullYear();
  const set = (next) => setD((x) => ({ ...x, holidays: next && next.length ? next : null }));
  return (
    <Card title="Public holidays" sub="Used to count business days, for example for milestone-relative dates and engagement locking." actions={custom.length ? <Badge tone="info">Organisation list</Badge> : <Badge>Australian national holidays</Badge>}>
      {!custom.length ? (
        <>
          <p className="small" style={{ marginTop: 0 }}>The national public holidays are used ({defaultHolidays(year, year).map((h) => `${h.name} ${fmtDate(h.date)}`).slice(0, 4).join(', ')} and so on). Add state or territory holidays and organisation shutdown days by starting your own list.</p>
          <button type="button" className="btn btn-sm" onClick={() => set(defaultHolidays(year, year + 3))}><Icon name="plus" />Start from the national holidays for {year}–{year + 3}</button>
        </>
      ) : (
        <>
          <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="tbl tbl-compact">
              <thead><tr><th>Date</th><th>Holiday</th><th><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>{custom.map((h, i) => <tr key={`${h.date}-${i}`}><td><input type="date" aria-label="Date" value={h.date} onChange={(e) => set(custom.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} /></td><td><input aria-label="Name" value={h.name} onChange={(e) => set(custom.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td><td><button type="button" className="icon-btn" aria-label={`Remove ${h.name}`} onClick={() => set(custom.filter((_, j) => j !== i))}><Icon name="trash" /></button></td></tr>)}</tbody>
            </table>
          </div>
          <div className="btn-row mt-2">
            <button type="button" className="btn btn-sm" onClick={() => set([...custom, { date: `${year}-12-31`, name: 'Organisation shutdown day' }])}><Icon name="plus" />Add a day</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => set(null)}>Go back to the national holidays</button>
          </div>
        </>
      )}
    </Card>
  );
}
