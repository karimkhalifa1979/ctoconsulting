// Measurement (MEA-001 to MEA-006): adoption, usage and performance measures against targets by group
// and over time (manual entry or data feeds), the readiness index and its weighted inputs, feedback from
// every channel with theme analysis, surveys and pulse checks, and the corrective action log.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, Modal, Kpi, Rag, Meter } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import Register from '../../ui/Register.jsx';
import { RefPicker } from '../../ui/fields.jsx';
import { LineChart, StackedBars, Sparkline, SERIES } from '../../charts/index.jsx';
import { Surveys } from './Adkar.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, fmtNum, label, options } from '../../lib/format.js';
import { SURVEY_TEMPLATES, adkarLabel } from '../../../shared/refdata.js';
import { MEASURE_STATUS_LABELS } from '../../../shared/rules/measures.js';
import { addDays, parseAuDate } from '../../../shared/dates.js';
import { asArray, parseCsv, sortBy, uid } from '../../../shared/util.js';

const MEASURE_TONE = { onTrack: 'complete', atRisk: 'atRisk', offTrack: 'overdue', noData: 'draft' };

export default function Measures() {
  const { m, base } = useIniPage();
  const [tab, setTab] = useTab('measures');
  if (!m) return <Spinner />;
  const below = m.measures.filter((x) => x.belowThreshold).length;
  return (
    <>
      <PageHead eyebrow="Phase 2 · Track Performance and Adapt Actions" title="Measurement" actions={<Link className="btn btn-primary" to={`${base}/artefacts?type=readinessReport`}><Icon name="file" />Readiness report</Link>}>
        Track whether people are adopting the change, how ready each group is, what people are saying, and the corrective actions taken when performance falls short.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'measures', label: 'Adoption and performance', count: below || null },
        { id: 'readiness', label: 'Readiness index' },
        { id: 'feedback', label: 'Feedback', count: m.feedback.filter((f) => f.status === 'new').length || null },
        { id: 'surveys', label: 'Surveys and pulse checks', count: m.surveys.filter((s) => s.kind && s.kind !== 'adkar').length },
        { id: 'corrective', label: 'Corrective actions', count: m.correctiveActions.filter((c) => ['open', 'inProgress'].includes(c.status)).length || null },
      ]} />
      {tab === 'measures' && <MeasureList />}
      {tab === 'readiness' && <Readiness />}
      {tab === 'feedback' && <Feedback />}
      {tab === 'surveys' && <Surveys kinds={['readiness', 'sentiment', 'trainingEvaluation', 'custom']} createLabel="New survey" Creator={NewSurvey} intro={<>Readiness, sentiment and training evaluation surveys with configurable questions (MEA-001). Responses are anonymous by default and segments under {m.settings.adkar.minSegment} respondents are suppressed (RUL-03). ADKAR self-assessments are on the ADKAR screen.</>} />}
      {tab === 'corrective' && <Corrective />}
    </>
  );
}

function MeasureList() {
  const { m, config, base, canDo } = useIniPage();
  const [sel, setSel] = useState(null);
  const [record, setRecord] = useState(null);
  const [importing, setImporting] = useState(false);
  const cats = ['individual', 'organisational', 'changeManagement'];
  const counts = Object.fromEntries(['onTrack', 'atRisk', 'offTrack', 'noData'].map((k) => [k, m.measures.filter((x) => x.status === k).length]));
  const cols = [
    { key: 'name', label: 'Measure', render: (x) => <span><strong>{x.name}</strong><span className="tiny muted sub-line">{label('measureSubtype', x.subtype, config) || label('measureCategory', x.category, config)}</span></span>, value: (x) => x.name },
    { key: 'category', label: 'Category', hidden: true, render: (x) => label('measureCategory', x.category, config), value: (x) => x.category },
    { key: 'baseline', label: 'Baseline', align: 'num', render: (x) => (x.baseline != null ? `${fmtNum(x.baseline, 2)}${x.unit || ''}` : '—'), value: (x) => x.baseline },
    { key: 'latest', label: 'Latest', align: 'num', render: (x) => (x.latest != null ? <span><strong>{fmtNum(x.latest, 2)}{x.unit || ''}</strong><span className="tiny muted sub-line">{fmtDate(x.latestDate)}</span></span> : '—'), value: (x) => x.latest },
    { key: 'target', label: 'Target', align: 'num', render: (x) => `${fmtNum(x.target, 2)}${x.unit || ''}`, value: (x) => x.target },
    { key: 'trend', label: 'Trend', sortable: false, render: (x) => (x.series.length > 1 ? <Sparkline values={x.series.map((v) => Number(v.value))} label={`${x.name} trend`} /> : '—') },
    { key: 'progress', label: 'Progress to target', render: (x) => (x.progress != null ? <Meter value={Math.max(0, Math.min(100, x.progress))} label={`${x.progress}%`} tone={x.status === 'onTrack' ? 'good' : x.status === 'offTrack' ? 'bad' : 'warning'} /> : '—'), value: (x) => x.progress ?? -1 },
    { key: 'status', label: 'Status', render: (x) => <StatusBadge status={MEASURE_TONE[x.status]} labelText={`${MEASURE_STATUS_LABELS[x.status]}${x.belowThreshold ? ' · below threshold' : ''}`} />, value: (x) => ['offTrack', 'atRisk', 'noData', 'onTrack'].indexOf(x.status) },
    { key: 'owner', label: 'Owner', render: (x) => m.userName(x.ownerId) || '—', value: (x) => m.userName(x.ownerId) },
    { key: '_r', label: '', sortable: false, render: (x) => canDo('C', 'measureValue') && <button type="button" className="btn btn-xs" onClick={(e) => { e.stopPropagation(); setRecord(x); }}>Record value</button> },
  ];
  return (
    <div className="stack">
      {m.alerts.filter((a) => a.kind === 'measureBelowThreshold').map((a) => <div key={a.id} className="callout bad small"><strong>{a.title}.</strong> {a.detail}</div>)}
      <div className="kpis">
        {Object.entries(counts).map(([k, n]) => <Kpi key={k} label={MEASURE_STATUS_LABELS[k]} value={n} tone={k === 'offTrack' && n ? 'bad' : k === 'atRisk' && n ? 'warning' : ''} />)}
      </div>
      <DataGrid id="measures" type="measure" title="Success measures" rows={sortBy(m.measures, (x) => cats.indexOf(x.category), 'name')} columns={cols} onRowClick={(x) => setSel(x.id)}
        facets={[{ key: 'category', label: 'Category', options: options('measureCategory', config), value: (x) => x.category }, { key: 'status', label: 'Status', options: Object.entries(MEASURE_STATUS_LABELS).map(([id, l]) => ({ id, label: l })), value: (x) => x.status }]}
        toolbar={<>{canDo('C', 'measureValue') && <button type="button" className="btn btn-sm" onClick={() => setImporting(true)}><Icon name="upload" />Import values</button>}<Link className="btn btn-sm" to={`${base}/setup?tab=success`}><Icon name="edit" />Define measures</Link></>}
        empty={<Empty icon="target" title="No success measures yet">Define organisational, individual and change management measures in Setup (INI-004).</Empty>} />
      {sel && <MeasureDetail id={sel} onClose={() => setSel(null)} onRecord={(x) => setRecord(x)} />}
      {record && <RecordValue measure={record} onClose={() => setRecord(null)} />}
      {importing && <ImportValues onClose={() => setImporting(false)} />}
    </div>
  );
}

function MeasureDetail({ id, onClose, onRecord }) {
  const { m, drawer, canDo, mut, toast } = useIniPage();
  const x = m.measures.find((y) => y.id === id);
  const [raising, setRaising] = useState(false);
  if (!x) return null;
  const groups = Object.keys(x.groupLatest);
  const series = [
    { key: 'all', label: 'All groups', color: SERIES[0], points: x.series.map((v) => ({ date: v.date, value: Number(v.value) })) },
    ...groups.map((g, i) => ({ key: g, label: m.groupsById[g]?.name || 'Group', color: SERIES[(i + 1) % SERIES.length], points: x.values.filter((v) => v.groupId === g).map((v) => ({ date: v.date, value: Number(v.value) })) })),
  ].filter((s) => s.points.length);
  const higher = (x.direction || 'higher') === 'higher';
  return (
    <Modal title={x.name} onClose={onClose} wide footer={<>
      <button type="button" className="btn" onClick={() => drawer.open({ type: 'measure', id: x.id })}><Icon name="edit" />Edit measure</button>
      {canDo('C', 'correctiveAction') && x.status !== 'onTrack' && x.status !== 'noData' && <button type="button" className="btn" onClick={() => setRaising(true)}><Icon name="zap" />Raise corrective action</button>}
      {canDo('C', 'measureValue') && <button type="button" className="btn btn-primary" onClick={() => onRecord(x)}>Record value</button>}
    </>}>
      <p className="small muted">Target {fmtNum(x.target, 2)}{x.unit} ({higher ? 'higher is better' : 'lower is better'}){x.threshold != null ? ` · alert threshold ${fmtNum(x.threshold, 2)}${x.unit}` : ''}{x.dataSource ? ` · source: ${x.dataSource}` : ''}</p>
      {series.length ? <LineChart series={series} unit={x.unit === '%' ? '%' : ''} threshold={Number(x.target)} thresholdLabel="Target" yMin={0} yMax={x.unit === '%' ? 100 : undefined} format={(v) => fmtNum(v, 2)} ariaLabel={`${x.name} over time`} /> : <Empty title="No values recorded yet" />}
      {groups.length > 0 && (
        <table className="tbl mt-3">
          <thead><tr><th>Group</th><th className="num">Latest</th><th>Date</th><th>Against target</th></tr></thead>
          <tbody>{groups.map((g) => { const v = x.groupLatest[g]; const ok = higher ? v.value >= x.target : v.value <= x.target; return <tr key={g}><td>{m.groupsById[g]?.name}</td><td className="num">{fmtNum(v.value, 2)}{x.unit}</td><td>{fmtDate(v.date)}</td><td>{ok ? <Badge tone="good" icon="checkCircle">Meets target</Badge> : <Badge tone="warning" icon="alert">Gap {fmtNum(Math.abs(x.target - v.value), 2)}{x.unit}</Badge>}</td></tr>; })}</tbody>
        </table>
      )}
      <h3 className="mt-3">Values</h3>
      <div className="scroll-y" style={{ maxHeight: 220 }}>
        <table className="tbl">
          <thead><tr><th>Date</th><th>Group</th><th className="num">Value</th><th>Source</th><th>Note</th><th /></tr></thead>
          <tbody>{[...x.values].reverse().map((v) => (
            <tr key={v.id}><td>{fmtDate(v.date)}</td><td>{m.groupsById[v.groupId]?.name || 'All'}</td><td className="num">{fmtNum(v.value, 2)}{x.unit}</td><td>{v.source === 'feed' ? 'Data feed' : 'Manual'}</td><td className="small">{v.note}</td>
              <td>{canDo('D', 'measureValue', v) && <button type="button" className="btn btn-xs btn-ghost" aria-label="Delete value" onClick={async () => { await mut.remove('measureValue', v.id); toast.success('Value deleted'); }}><Icon name="trash" /></button>}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {raising && <RaiseCorrective defaults={{ measureId: x.id, gap: `${x.name}: latest ${fmtNum(x.latest, 2)}${x.unit} against a target of ${fmtNum(x.target, 2)}${x.unit}.`, groupId: asArray(x.groupIds)[0] || '' }} onClose={() => setRaising(false)} />}
    </Modal>
  );
}

function RecordValue({ measure, onClose }) {
  const { m, mut, toast, ini, today } = useIniPage();
  const [d, setD] = useState({ date: today, value: '', groupId: '', note: '' });
  const save = async () => {
    await mut.create('measureValue', { initiativeId: ini.id, measureId: measure.id, date: d.date, value: Number(d.value), groupId: d.groupId || null, source: 'manual', note: d.note });
    toast.success('Value recorded');
    onClose();
  };
  return (
    <Modal title={`Record a value: ${measure.name}`} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={d.value === '' || !d.date} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <label className="field"><span>Date</span><input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></label>
        <label className="field"><span>Value{measure.unit ? ` (${measure.unit})` : ''}</span><input type="number" step="any" value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} autoFocus /></label>
      </div>
      <label className="field"><span>Impacted group (blank for all groups)</span><select value={d.groupId} onChange={(e) => setD({ ...d, groupId: e.target.value })}><option value="">All groups</option>{m.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <label className="field"><span>Note</span><input type="text" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></label>
    </Modal>
  );
}

// MEA-003: values from a data feed such as a system usage log, as CSV (measure, date, value, group).
function ImportValues({ onClose }) {
  const { m, mut, toast, ini } = useIniPage();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const byName = Object.fromEntries(m.measures.flatMap((x) => [[x.name.toLowerCase(), x], [String(x.code || '').toLowerCase(), x]]));
  const groupByName = Object.fromEntries(m.groups.map((g) => [g.name.toLowerCase(), g]));
  const read = async (file) => {
    const [head, ...body] = parseCsv(await file.text());
    const ix = (re) => head.findIndex((h) => re.test(String(h).trim()));
    const c = { measure: ix(/measure|metric|kpi/i), date: ix(/date|period/i), value: ix(/value|result|count|rate/i), group: ix(/group|team|unit/i) };
    setRows(body.map((r, i) => {
      const measure = c.measure >= 0 ? byName[String(r[c.measure]).trim().toLowerCase()] : null;
      const raw = c.date >= 0 ? String(r[c.date]).trim() : '';
      const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : parseAuDate(raw);
      const value = c.value >= 0 && r[c.value] !== '' ? Number(String(r[c.value]).replace(/[%,$\s]/g, '')) : NaN;
      const gname = c.group >= 0 ? String(r[c.group] || '').trim() : '';
      const group = gname ? groupByName[gname.toLowerCase()] : null;
      return { row: i + 2, measure, date, value, group, error: !measure ? 'Measure not matched' : !date ? 'Date not recognised' : Number.isNaN(value) ? 'Value is not a number' : gname && !group ? 'Group not matched' : null };
    }));
  };
  const ok = (rows || []).filter((r) => !r.error);
  const commit = async () => {
    setBusy(true);
    try {
      for (const r of ok) await mut.create('measureValue', { initiativeId: ini.id, measureId: r.measure.id, date: r.date, value: r.value, groupId: r.group?.id || null, source: 'feed', note: 'Imported from data feed' }, { quiet: true });
      toast.success(`${ok.length} values imported`);
      onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal title="Import measure values" onClose={onClose} wide footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!ok.length || busy} onClick={commit}>{busy ? 'Importing…' : `Import ${ok.length} values`}</button></>}>
      <p className="small muted">CSV with columns for the measure (name or ID), the date (DD/MM/YYYY or YYYY-MM-DD), the value and, optionally, the impacted group. Scheduled feeds can post the same rows to the API.</p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files[0] && read(e.target.files[0])} />
      {rows && (
        <div className="scroll-y mt-3" style={{ maxHeight: 320 }}>
          <table className="tbl">
            <thead><tr><th>Row</th><th>Measure</th><th>Date</th><th className="num">Value</th><th>Group</th><th>Check</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.row}><td>{r.row}</td><td>{r.measure?.name || '—'}</td><td>{fmtDate(r.date) || '—'}</td><td className="num">{Number.isNaN(r.value) ? '—' : fmtNum(r.value, 2)}</td><td>{r.group?.name || 'All'}</td><td>{r.error ? <Badge tone="critical" icon="alert">{r.error}</Badge> : <Badge tone="good" icon="check">Ready</Badge>}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// MEA-005: readiness index by group from weighted inputs.
function Readiness() {
  const { m, settings, base, user } = useIniPage();
  const w = { adkar: 40, training: 25, criteria: 20, sentiment: 15, ...settings.readinessWeights };
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const parts = [
    { key: 'adkar', label: 'ADKAR', color: SERIES[0] },
    { key: 'training', label: 'Training completion', color: SERIES[1] },
    { key: 'criteria', label: 'Readiness criteria', color: SERIES[2] },
    { key: 'sentiment', label: 'Sentiment', color: SERIES[3] },
  ];
  const rows = m.groups.map((g) => {
    const c = g.readiness.components || {};
    const den = parts.reduce((a, p) => a + (c[p.key] != null ? w[p.key] : 0), 0) || 1;
    return { key: g.id, label: g.name, g, values: Object.fromEntries(parts.map((p) => [p.key, c[p.key] != null ? Math.round((c[p.key] * w[p.key]) / den) : 0])) };
  });
  return (
    <div className="stack">
      <div className="callout small">The readiness index combines ADKAR scores, training completion, readiness criteria and sentiment with weights of {parts.map((p) => `${p.label.toLowerCase()} ${Math.round((w[p.key] / total) * 100)}%`).join(', ')}. Missing inputs are left out and the others re-weighted; sentiment alone does not produce an index. {user.roles?.includes('admin') && <Link to="/admin/settings">Change the weights</Link>}</div>
      <div className="grid g-2">
        <Card title="Readiness index by group" sub="Each bar is the index; segments show how much each input contributes">
          <StackedBars rows={rows.filter((r) => r.g.readiness.index != null)} series={parts} ariaLabel="Readiness index by group and input" />
          {rows.some((r) => r.g.readiness.index == null) && <p className="small muted mt-2">No index yet for {rows.filter((r) => r.g.readiness.index == null).map((r) => r.label).join(', ')}: record an ADKAR assessment, training or readiness criteria.</p>}
        </Card>
        <Card title="Inputs by group" flush>
          <table className="tbl">
            <thead><tr><th>Group</th><th className="num">ADKAR</th><th className="num">Training</th><th className="num">Criteria</th><th className="num">Sentiment</th><th>Index</th></tr></thead>
            <tbody>{m.groups.map((g) => { const c = g.readiness.components || {}; return (
              <tr key={g.id}><td>{g.name}</td>{parts.map((p) => <td key={p.key} className="num">{c[p.key] != null ? fmtNum(c[p.key]) : <span className="muted">—</span>}</td>)}<td><Rag value={g.rag} text={g.readiness.index != null ? String(g.readiness.index) : 'No data'} /></td></tr>
            ); })}</tbody>
          </table>
          <div className="card-pad small"><Link to={`${base}/risk?tab=readiness`}>Readiness checklists and go/no-go</Link> · <Link to={`${base}/adkar`}>ADKAR results</Link> · <Link to={`${base}/training`}>Training completion</Link></div>
        </Card>
      </div>
    </div>
  );
}

// MEA-002: feedback from any channel, with analysis by theme.
function Feedback() {
  const { m, config, mut, toast, canDo, today } = useIniPage();
  const [period, setPeriod] = useState(90);
  const from = addDays(today, -period);
  const recent = m.feedback.filter((f) => !period || f.date >= from);
  const themes = useMemo(() => {
    const out = {};
    for (const f of recent) for (const t of asArray(f.themes).length ? asArray(f.themes) : ['other']) {
      const e = (out[t] ||= { key: t, label: label('feedbackTheme', t, config), values: { positive: 0, neutral: 0, negative: 0, unknown: 0 } });
      const s = f.sentiment;
      e.values[['veryPositive', 'positive'].includes(s) ? 'positive' : ['veryNegative', 'negative'].includes(s) ? 'negative' : s === 'neutral' || s === 'mixed' ? 'neutral' : 'unknown']++;
    }
    return sortBy(Object.values(out), (x) => -Object.values(x.values).reduce((a, b) => a + b, 0));
  }, [recent, config]);
  const convert = async (f, to) => {
    await mut.op('convertFeedback', { id: f.id, to });
    toast.success(to === 'faq' ? 'FAQ drafted from the feedback' : 'Resistance item raised from the feedback');
  };
  return (
    <div className="stack">
      <Card title="Feedback by theme and sentiment" actions={<select aria-label="Period" value={period} onChange={(e) => setPeriod(Number(e.target.value))}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option><option value={0}>All time</option></select>}>
        {themes.length ? <StackedBars rows={themes} series={[{ key: 'positive', label: 'Positive', color: 'var(--div-pos-2)' }, { key: 'neutral', label: 'Neutral or mixed', color: 'var(--div-mid)' }, { key: 'negative', label: 'Negative', color: 'var(--div-neg-2)' }, { key: 'unknown', label: 'Not rated', color: 'var(--series-muted)' }]} ariaLabel="Feedback by theme and sentiment" /> : <Empty title="No feedback in this period" />}
      </Card>
      <Register type="feedback" title="Feedback" sub="Feedback from engagements, surveys, change agents, the feedback mailbox and the service desk, with source, group, theme, sentiment and ADKAR element (MEA-002)." defaults={{ date: today, status: 'new', channel: 'mailbox' }} facets={['channel', 'status', 'sentiment']} bulkFields={['status']}
        append={[{ key: '_c', label: '', sortable: false, render: (f) => f.status !== 'actioned' && f.status !== 'closed' && canDo('C', 'resistance') && (
          <span className="btn-row" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn btn-xs" onClick={() => convert(f, 'resistance')}>Raise resistance</button>
            <button type="button" className="btn btn-xs" onClick={() => convert(f, 'faq')}>Draft FAQ</button>
          </span>
        ) }]} />
    </div>
  );
}

function Corrective() {
  const { m, canDo } = useIniPage();
  const [raising, setRaising] = useState(false);
  const gaps = [
    ...m.measures.filter((x) => x.status === 'offTrack' || x.belowThreshold).map((x) => ({ id: `m:${x.id}`, text: `${x.name} is below ${x.belowThreshold ? 'its alert threshold' : 'target'} (${fmtNum(x.latest, 2)}${x.unit} against ${fmtNum(x.target, 2)}${x.unit}).`, defaults: { measureId: x.id, gap: `${x.name}: ${fmtNum(x.latest, 2)}${x.unit} against a target of ${fmtNum(x.target, 2)}${x.unit}.` } })),
    ...m.groups.filter((g) => g.barrierPoint && g.barrierPoint !== 'none' && g.high).map((g) => ({ id: `g:${g.id}`, text: `${g.name} has a barrier point at ${adkarLabel(g.barrierPoint)}.`, defaults: { groupId: g.id, adkar: [g.barrierPoint], gap: `${g.name}: ADKAR barrier point at ${adkarLabel(g.barrierPoint)}.` } })),
  ].filter((x) => !m.correctiveActions.some((c) => (x.defaults.measureId && c.measureId === x.defaults.measureId && c.status !== 'done') || (x.defaults.groupId && c.groupId === x.defaults.groupId && c.status !== 'done' && asArray(c.adkar).includes(x.defaults.adkar?.[0]))));
  return (
    <div className="stack">
      {gaps.length > 0 && (
        <Card title="Performance gaps without a corrective action" sub="Measures off track and high-impact groups with a barrier point">
          {gaps.map((x) => <div key={x.id} className="row-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}><span className="small">{x.text}</span>{canDo('C', 'correctiveAction') && <button type="button" className="btn btn-xs btn-primary" onClick={() => setRaising(x.defaults)}>Raise action</button>}</div>)}
        </Card>
      )}
      <Register type="correctiveAction" title="Corrective action log" sub="Each performance gap linked to its actions, owners, due dates and the plan revisions that resulted (MEA-004)." facets={['status']} bulkFields={['status', 'ownerId']} defaults={{ status: 'open' }}
        append={[{ key: 'acts', label: 'Plan revisions', render: (c) => asArray(c.activityIds).length ? asArray(c.activityIds).map((id) => m.byId.activity[id]?.code).filter(Boolean).join(', ') : '—', value: (c) => asArray(c.activityIds).length }]} />
      {raising && <RaiseCorrective defaults={raising} onClose={() => setRaising(false)} />}
    </div>
  );
}

export function RaiseCorrective({ defaults = {}, onClose }) {
  const { m, mut, toast, ini, user, users, today } = useIniPage();
  const [d, setD] = useState({ gap: '', action: '', ownerId: user.id, dueDate: addDays(today, 14), groupId: '', adkar: [], createActivity: true, ...defaults });
  const save = async () => {
    await mut.op('raiseCorrectiveAction', { initiativeId: ini.id, ...d, groupId: d.groupId || null });
    toast.success(d.createActivity ? 'Corrective action raised and added to the plan' : 'Corrective action raised');
    onClose();
  };
  return (
    <Modal title="Raise a corrective action" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!d.gap.trim() || !d.action.trim()} onClick={save}>Raise</button></>}>
      <label className="field"><span>Performance gap</span><textarea rows={2} value={d.gap} onChange={(e) => setD({ ...d, gap: e.target.value })} /></label>
      <label className="field"><span>Action</span><textarea rows={3} value={d.action} onChange={(e) => setD({ ...d, action: e.target.value })} autoFocus /></label>
      <div className="form-grid">
        <label className="field"><span>Owner</span><select value={d.ownerId} onChange={(e) => setD({ ...d, ownerId: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="field"><span>Due</span><input type="date" value={d.dueDate} onChange={(e) => setD({ ...d, dueDate: e.target.value })} /></label>
      </div>
      <label className="field"><span>Impacted group</span><select value={d.groupId || ''} onChange={(e) => setD({ ...d, groupId: e.target.value })}><option value="">—</option>{m.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={d.createActivity} onChange={(e) => setD({ ...d, createActivity: e.target.checked })} /><span>Add an activity to the plan for this action</span></label>
    </Modal>
  );
}

// MEA-001: a readiness, sentiment, training evaluation or custom survey with editable questions.
function NewSurvey({ onClose }) {
  const { m, mut, toast, ini, today, config } = useIniPage();
  const [d, setD] = useState({ kind: 'readiness', title: 'Readiness pulse check', groupIds: m.groups.filter((g) => g.high).map((g) => g.id), opensAt: today, closesAt: addDays(today, 14), anonymous: true, intro: 'This short survey asks how ready you feel for the change. It takes about three minutes.' });
  const [questions, setQuestions] = useState(() => SURVEY_TEMPLATES.readiness.map((q) => ({ ...q })));
  const setKind = (kind) => {
    setD({ ...d, kind, title: { readiness: 'Readiness pulse check', sentiment: 'Sentiment pulse', trainingEvaluation: 'Training evaluation', custom: 'Survey' }[kind] });
    setQuestions(SURVEY_TEMPLATES[kind].map((q) => ({ ...q })));
  };
  const invited = m.groups.filter((g) => d.groupIds.includes(g.id)).reduce((a, g) => a + (Number(g.headcount) || 0), 0);
  const save = async () => {
    await mut.create('survey', { initiativeId: ini.id, ...d, questions: questions.filter((q) => q.text.trim()), status: 'draft', invited, minSegment: m.settings.adkar.minSegment, responseTarget: 60, collectionNoticeId: 'cn-survey' });
    toast.success('Survey created as a draft');
    onClose();
  };
  return (
    <Modal title="New survey" onClose={onClose} wide footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!d.groupIds.length || !questions.some((q) => q.text.trim())} onClick={save}>Create draft</button></>}>
      <div className="form-grid">
        <label className="field"><span>Type</span><select value={d.kind} onChange={(e) => setKind(e.target.value)}>{options('surveyKind', config).filter((o) => o.id !== 'adkar').map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        <label className="field"><span>Title</span><input type="text" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
      </div>
      <label className="field"><span>Introduction</span><textarea rows={2} value={d.intro} onChange={(e) => setD({ ...d, intro: e.target.value })} /></label>
      <label className="field"><span>Impacted groups</span><RefPicker multiple options={m.groups.map((g) => ({ id: g.id, label: g.name, sub: `${g.headcount} people` }))} value={d.groupIds} onChange={(v) => setD({ ...d, groupIds: v })} /></label>
      <div className="form-grid">
        <label className="field"><span>Opens</span><input type="date" value={d.opensAt} onChange={(e) => setD({ ...d, opensAt: e.target.value })} /></label>
        <label className="field"><span>Closes</span><input type="date" value={d.closesAt} onChange={(e) => setD({ ...d, closesAt: e.target.value })} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={d.anonymous} onChange={(e) => setD({ ...d, anonymous: e.target.checked })} /><span>Anonymous responses (recommended)</span></label>
      <h3 className="mt-3">Questions</h3>
      {questions.map((q, i) => (
        <div key={q.id} className="row" style={{ gap: 8, marginBottom: 6 }}>
          <select aria-label="Question type" value={q.type} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} style={{ width: 150 }}><option value="scale">Rating 1–5</option><option value="text">Open text</option></select>
          <input type="text" aria-label={`Question ${i + 1}`} style={{ flex: 1 }} value={q.text} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          <button type="button" className="btn btn-xs btn-ghost" aria-label="Remove question" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}><Icon name="x" /></button>
        </div>
      ))}
      <button type="button" className="btn btn-xs" onClick={() => setQuestions([...questions, { id: `q-${uid().slice(0, 6)}`, type: 'scale', text: '' }])}><Icon name="plus" />Add question</button>
    </Modal>
  );
}
