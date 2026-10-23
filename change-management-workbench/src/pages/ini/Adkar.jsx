// ADKAR (ADK-001 to ADK-012): Blueprints for the organisation and each group, assessments by
// practitioners, managers, self-assessment surveys or inference, barrier points (RUL-01, RUL-02) with
// anonymity thresholds (RUL-03), trends, practitioner confirmation and interventions for barrier points.
import { useEffect, useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, Modal, BarrierBadge, Help, KV } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import ApprovalPanel from '../../ui/Approvals.jsx';
import { RefPicker } from '../../ui/fields.jsx';
import { AdkarProfile, Heatmap, HeatScale, adkarFill, adkarInk, LineChart, SERIES } from '../../charts/index.jsx';
import { InterventionPicker } from './Plan.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, label, options } from '../../lib/format.js';
import { ADKAR, ADKAR_DESCRIPTORS, ADKAR_SCORE_SCALE, adkarLabel } from '../../../shared/refdata.js';
import { barrierPoint, flatScores } from '../../../shared/rules/adkar.js';
import { addDays } from '../../../shared/dates.js';
import { asArray, sortBy } from '../../../shared/util.js';

export default function Adkar() {
  const { m } = useIniPage();
  const [tab, setTab] = useTab('results');
  if (!m) return <Spinner />;
  return (
    <>
      <PageHead eyebrow="Phase 2 · Plan and Act / Track Performance" title="ADKAR">
        Where each impacted group is on the ADKAR Model, what is holding them back and what to do about it <Help term="Barrier point" />. Results come from practitioner and manager assessments, self-assessment surveys and inference from engagements.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'results', label: 'Results and barrier points' },
        { id: 'blueprints', label: 'Blueprints', count: m.blueprints.length },
        { id: 'assessments', label: 'Assessments', count: m.assessments.filter((a) => a.kind === 'adkar').length },
        { id: 'surveys', label: 'Survey campaigns', count: m.surveys.filter((s) => (s.kind || 'adkar') === 'adkar').length },
      ]} />
      {tab === 'results' && <Results />}
      {tab === 'blueprints' && <Blueprints />}
      {tab === 'assessments' && <Assessments />}
      {tab === 'surveys' && <Surveys />}
    </>
  );
}

function Results() {
  const { m, mut, toast, canDo, drawer, settings, config } = useIniPage();
  const [sel, setSel] = useState(m.groups.find((g) => g.barrierPoint && g.barrierPoint !== 'none')?.id || m.groups[0]?.id);
  const [interventions, setInterventions] = useState(null);
  const g = m.groupsById[sel];
  const threshold = settings.adkar.threshold;
  const visible = g ? g.adkarResults.filter((r) => !r.suppressed) : [];
  const trend = ADKAR.map((el, i) => ({ key: el.id, label: el.label, color: SERIES[i], points: visible.filter((r) => r.scores[el.id] != null).map((r) => ({ date: r.date, value: r.scores[el.id] })) }));
  const confirm = async (r) => { await mut.op('confirmAssessment', { id: r.id }); toast.success('Result confirmed for use in approved artefacts (ADK-012)'); };
  return (
    <div className="stack">
      <Card title="Current results by group" sub={`Latest visible result for each group. The barrier point is the first element scored at or below ${threshold}, or where ${Math.round(settings.adkar.groupProportion * 100)}% or more of responses are at or below ${threshold} (RUL-02).`}
        actions={<HeatScale steps={['var(--div-neg-3)', 'var(--div-neg-1)', 'var(--div-mid)', 'var(--div-pos-1)', 'var(--div-pos-3)']} labels={['1', '5']} />}>
        <Heatmap rows={m.groups.map((x) => ({ key: x.id, label: x.name, x }))} cols={[...ADKAR.map((a) => ({ key: a.id, label: a.label })), { key: '_bp', label: 'Barrier point' }]}
          value={(r, c) => (c.key === '_bp' ? (r.x.barrierPoint ? (r.x.barrierPoint === 'none' ? 'None' : adkarLabel(r.x.barrierPoint)) : null) : r.x.adkar?.scores?.[c.key] ?? null)}
          fill={(v, r, c) => (c.key === '_bp' ? (v === 'None' ? 'var(--st-good-soft)' : 'var(--st-critical-soft)') : adkarFill(v, threshold))} ink={(v, r, c) => (c.key === '_bp' ? 'var(--ink)' : adkarInk(v, threshold))}
          format={(v) => (typeof v === 'number' ? v.toFixed(1) : v)} onCell={(r) => setSel(r.key)} caption="ADKAR results by impacted group" />
      </Card>
      {g && (
        <div className="grid g-main">
          <Card title={g.name} sub={g.adkar ? `${label('assessmentRound', g.adkar.round, config)} · ${label('assessmentMethod', g.adkar.method, config) || g.adkar.method} · ${fmtDate(g.adkar.date)}${g.adkar.n ? ` · ${g.adkar.n} responses` : ''}` : 'Not yet assessed'}
            actions={<><select aria-label="Group" value={sel} onChange={(e) => setSel(e.target.value)}>{m.groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>{canDo('C', 'activity') && <button type="button" className="btn btn-sm btn-primary" onClick={() => setInterventions(g.id)}><Icon name="lightbulb" />Interventions</button>}</>}>
            {g.adkar ? (
              <div className="grid g-2" style={{ alignItems: 'start' }}>
                <AdkarProfile scores={g.adkar.scores} barrier={g.barrierPoint} threshold={threshold} compare={g.adkarPrev?.scores} compareLabel={g.adkarPrev ? label('assessmentRound', g.adkarPrev.round, config) : undefined} currentLabel={label('assessmentRound', g.adkar.round, config)} height={200} />
                <div className="stack-sm">
                  <div><BarrierBadge element={g.barrierPoint} /> {g.barrierChanged && <Badge tone="warning" icon="alert">Changed recently</Badge>}</div>
                  {g.barrierPoint && g.barrierPoint !== 'none' && <p className="small">{ADKAR.find((a) => a.id === g.barrierPoint)?.outcome}</p>}
                  <KV items={[['Readiness index', g.readiness.index ?? '—'], ['Training completion', g.training.applicable ? `${g.training.pct ?? 0}%` : 'Not applicable'], ['Sentiment (90 days)', g.sentimentMean ?? '—'], ['Change agents', g.agentCoverage.applicable ? `${g.agentCoverage.count} of ${g.agentCoverage.target}` : 'Not applicable']]} />
                </div>
              </div>
            ) : <Empty icon="target" title="No ADKAR result yet" />}
          </Card>
          <Card title="Results over time" flush>
            <table className="tbl tbl-compact">
              <thead><tr><th>Round</th><th>Method</th><th className="num">n</th><th>Barrier</th><th /></tr></thead>
              <tbody>{sortBy(g.adkarResults, '-date').map((r) => (
                <tr key={r.id}>
                  <td>{label('assessmentRound', r.round, config)}<div className="tiny muted">{fmtDate(r.date)}</div></td>
                  <td className="small">{label('assessmentMethod', r.method, config) || r.method}</td>
                  <td className="num">{r.n ?? '—'}</td>
                  <td>{r.suppressed ? <Badge icon="eyeOff" title={`Fewer than ${settings.adkar.minSegment} respondents (RUL-03)`}>Suppressed</Badge> : <BarrierBadge element={r.barrierPoint} />}</td>
                  <td className="right">{r.source === 'group' && !r.confirmed && !r.suppressed && canDo('U', 'assessment') ? <button type="button" className="btn btn-xs" onClick={() => confirm(r)}>Confirm</button> : r.confirmed ? <Icon name="checkCircle" size={14} label="Confirmed" /> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        </div>
      )}
      {g && visible.length > 1 && <Card title={`Trend: ${g.name}`} sub="Mean score per element at each visible result."><LineChart series={trend} yMin={1} yMax={5} threshold={threshold} thresholdLabel={`Threshold ${threshold}`} format={(v) => Number(v).toFixed(1)} ariaLabel={`ADKAR trend for ${g.name}`} /></Card>}
      {interventions && <InterventionPicker groupId={interventions} onClose={() => setInterventions(null)} />}
    </div>
  );
}

function Blueprints() {
  const { m, canDo, mut, toast, ini, users } = useIniPage();
  const [edit, setEdit] = useState(null);
  const org = m.blueprints.find((b) => b.scope === 'organisation');
  const create = async (scope, groupId) => {
    const g = groupId ? m.groupsById[groupId] : null;
    const rec = await mut.create('blueprint', { initiativeId: ini.id, name: g ? `${g.name} Blueprint` : 'Organisation ADKAR Blueprint', scope, impactedGroupId: groupId || null, status: 'draft', elements: Object.fromEntries(ADKAR.map((a) => [a.id, { desiredOutcome: org?.elements?.[a.id]?.desiredOutcome || '', indicators: '', barriers: '', rootCauses: '', measures: '' }])) });
    toast.success('Blueprint created');
    setEdit(rec.id);
  };
  const missing = m.groups.filter((g) => !m.blueprints.some((b) => b.impactedGroupId === g.id));
  const sponsorUser = users.find((u) => u.stakeholderId && u.stakeholderId === m.initiative.primarySponsorId);
  return (
    <div className="stack">
      <div className="row-between">
        <p className="small muted" style={{ margin: 0, maxWidth: 760 }}>The organisation-level Blueprint is the first activity of Plan and Act; group Blueprints tailor the desired outcome, indicators, barriers, root causes and measures for each element (ADK-001 to ADK-003).</p>
        {canDo('C', 'blueprint') && (
          <div className="btn-row">
            {!org && <button type="button" className="btn btn-primary" onClick={() => create('organisation')}><Icon name="plus" />Organisation Blueprint</button>}
            {missing.length > 0 && <select aria-label="Create a group Blueprint" value="" onChange={(e) => e.target.value && create('group', e.target.value)}><option value="">Add a group Blueprint…</option>{missing.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
          </div>
        )}
      </div>
      {!m.blueprints.length && <Empty icon="target" title="No Blueprints yet" />}
      {sortBy(m.blueprints, (b) => (b.scope === 'organisation' ? 0 : 1), 'name').map((b) => (
        <Card key={b.id} title={b.name} sub={b.scope === 'organisation' ? 'Organisation' : m.groupsById[b.impactedGroupId]?.name}
          actions={<><StatusBadge status={b.status} labelText={b.status === 'approved' ? 'Approved' : 'Draft'} />{canDo('U', 'blueprint') && <button type="button" className="btn btn-sm" onClick={() => setEdit(b.id)}><Icon name="edit" />Edit</button>}</>} flush>
          <table className="tbl">
            <thead><tr><th>Element</th><th>Desired outcome</th><th>Indicators</th><th>Barriers and root causes</th><th>Measures</th></tr></thead>
            <tbody>{ADKAR.map((a) => {
              const e = b.elements?.[a.id] || {};
              return <tr key={a.id}><td><strong>{a.label}</strong></td><td style={{ whiteSpace: 'normal', minWidth: 220 }}>{e.desiredOutcome || '—'}</td><td style={{ whiteSpace: 'normal' }} className="small">{e.indicators || '—'}</td><td style={{ whiteSpace: 'normal' }} className="small">{[e.barriers, e.rootCauses].filter(Boolean).join(' Root causes: ') || '—'}</td><td style={{ whiteSpace: 'normal' }} className="small">{e.measures || '—'}</td></tr>;
            })}</tbody>
          </table>
          <div className="card-body"><ApprovalPanel subjectType="blueprint" subjectId={b.id} label={b.name} canSubmit={canDo('U', 'blueprint')} defaultApprovers={sponsorUser ? [sponsorUser.id] : []} compact /></div>
        </Card>
      ))}
      {edit && <BlueprintEditor id={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function BlueprintEditor({ id, onClose }) {
  const { records, mut, toast } = useIniPage();
  const b = asArray(records.blueprint).find((x) => x.id === id);
  const [name, setName] = useState(b?.name || '');
  const [els, setEls] = useState(() => b?.elements || {});
  if (!b) return null;
  const set = (el, k, v) => setEls((x) => ({ ...x, [el]: { ...(x[el] || {}), [k]: v } }));
  const save = async () => {
    await mut.update('blueprint', b.id, { name, elements: els }, { version: b.version });
    toast.success('Blueprint saved');
    onClose();
  };
  const cols = [['desiredOutcome', 'Desired outcome'], ['indicators', 'Indicators'], ['barriers', 'Barriers'], ['rootCauses', 'Root causes'], ['measures', 'Measures']];
  return (
    <Modal title={`Edit ${b.name}`} onClose={onClose} wide footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" onClick={save}>Save Blueprint</button></>}>
      <label className="field mb-3"><span>Name</span><input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
      {b.status === 'approved' && <div className="callout warn small mb-3">This Blueprint is approved. Saving changes creates a new draft that needs approval again.</div>}
      {ADKAR.map((a) => (
        <fieldset key={a.id} className="scale-q" style={{ border: '1px solid var(--line)' }}>
          <legend className="strong">{a.label}</legend>
          <p className="tiny muted" style={{ margin: '0 0 6px' }}>{a.outcome}</p>
          <div className="form-grid">
            {cols.map(([k, l]) => <label key={k} className={`field ${k === 'desiredOutcome' ? 'span-2' : ''}`}><span>{l}</span><textarea rows={2} value={els[a.id]?.[k] || ''} onChange={(e) => set(a.id, k, e.target.value)} /></label>)}
          </div>
        </fieldset>
      ))}
    </Modal>
  );
}

function Assessments() {
  const { m, canDo, config, usersById, drawer, lookups } = useIniPage();
  const [editor, setEditor] = useState(null);
  const subjectName = (a) => (a.subjectType === 'group' ? m.groupsById[a.subjectId]?.name : a.subjectType === 'stakeholder' ? lookups.nameOf('stakeholder', a.subjectId) : a.subjectType === 'team' ? `Team of ${lookups.nameOf('stakeholder', a.subjectId)}` : 'Whole initiative');
  const rows = sortBy(m.assessments.filter((a) => a.kind === 'adkar'), '-date');
  const cols = [
    { key: 'date', label: 'Date', render: (a) => fmtDate(a.date), value: (a) => a.date },
    { key: 'subject', label: 'Subject', render: (a) => <span>{subjectName(a) || '—'} <Badge>{{ group: 'Group', stakeholder: 'Individual', team: 'Team', initiative: 'Initiative' }[a.subjectType] || a.subjectType}</Badge></span>, value: (a) => subjectName(a) },
    { key: 'round', label: 'Round', render: (a) => label('assessmentRound', a.round, config), value: (a) => a.round },
    { key: 'method', label: 'Method', render: (a) => label('assessmentMethod', a.method, config), value: (a) => a.method },
    { key: 'scores', label: 'Scores (A D K A R)', render: (a) => (a._redacted?.includes('scores') ? <span className="muted"><Icon name="lock" size={13} /> Restricted</span> : <span className="tabular">{ADKAR.map((el) => { const v = flatScores(a.scores)[el.id]; return v == null ? '–' : Number(v).toFixed(1); }).join('  ')}</span>), value: (a) => '' },
    { key: 'barrier', label: 'Barrier', render: (a) => (a._redacted?.includes('scores') ? '—' : <BarrierBadge element={barrierPoint(flatScores(a.scores), m.settings.adkar.threshold)} />), value: (a) => barrierPoint(flatScores(a.scores)) },
    { key: 'n', label: 'Responses', align: 'num', render: (a) => a.respondents ?? '—', value: (a) => a.respondents },
    { key: 'confirmed', label: 'Confirmed', render: (a) => (a.confirmed ? <Icon name="checkCircle" size={14} label="Confirmed" /> : <span className="muted">No</span>), value: (a) => (a.confirmed ? 1 : 0) },
    { key: 'assessor', label: 'Assessor', hidden: true, render: (a) => usersById[a.assessorId]?.name || '—', value: (a) => usersById[a.assessorId]?.name },
  ];
  return (
    <div className="stack">
      <div className="row-between">
        <p className="small muted" style={{ margin: 0, maxWidth: 760 }}>Individual scores are sensitive and visible only to authorised roles; group results are shared (AC-08). Survey segments with fewer than {m.settings.adkar.minSegment} respondents are suppressed (RUL-03).</p>
        {canDo('C', 'assessment') && <div className="btn-row"><button type="button" className="btn" onClick={() => setEditor({ subjectType: 'stakeholder' })}><Icon name="user" />Assess an individual</button><button type="button" className="btn btn-primary" onClick={() => setEditor({ subjectType: 'group' })}><Icon name="users" />Assess a group</button></div>}
      </div>
      <DataGrid id="adkarAssessments" title="ADKAR assessments" rows={rows} columns={cols} onRowClick={(a) => drawer.open({ type: 'assessment', id: a.id })}
        facets={[{ key: 'subjectType', label: 'Subject', options: [{ id: 'group', label: 'Groups' }, { id: 'stakeholder', label: 'Individuals' }, { id: 'team', label: 'Teams' }], value: (a) => a.subjectType }, { key: 'round', label: 'Round', options: options('assessmentRound', config), value: (a) => a.round }]} />
      {editor && <AdkarScorer subjectType={editor.subjectType} onClose={() => setEditor(null)} />}
    </div>
  );
}

// Practitioner or manager ADKAR assessment with descriptors for each score (ADK-004).
export function AdkarScorer({ subjectType, subjectId: initialSubject, onClose }) {
  const { m, ini, mut, toast, lookups, user, today, config, settings } = useIniPage();
  const [subjectId, setSubjectId] = useState(initialSubject || null);
  const [scores, setScores] = useState(() => Object.fromEntries(ADKAR.map((a) => [a.id, { score: null, comment: '' }])));
  const [meta, setMeta] = useState({ round: 'adHoc', method: 'practitioner', date: today, comment: '' });
  const flat = Object.fromEntries(ADKAR.map((a) => [a.id, scores[a.id].score]));
  const bp = barrierPoint(flat, settings.adkar.threshold);
  const save = async () => {
    await mut.create('assessment', { initiativeId: ini.id, kind: 'adkar', subjectType, subjectId, round: meta.round, method: meta.method, date: meta.date, assessorId: user.id, scores: subjectType === 'group' ? flat : scores, comment: meta.comment, confirmed: meta.method === 'practitioner' });
    toast.success('ADKAR assessment saved');
    onClose();
  };
  const subjectOptions = subjectType === 'group' ? m.groups.map((g) => ({ id: g.id, label: g.name })) : lookups.optionsFor('stakeholder');
  return (
    <Modal title={`ADKAR assessment: ${subjectType === 'group' ? 'impacted group' : 'individual'}`} onClose={onClose} wide footer={<><span className="grow small">{bp ? <>Barrier point: <BarrierBadge element={bp} /></> : 'Rate at least one element'}</span><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!subjectId || !Object.values(flat).some((v) => v != null)} onClick={save}>Save assessment</button></>}>
      <div className="form-grid mb-3">
        <label className="field span-2"><span>{subjectType === 'group' ? 'Impacted group' : 'Stakeholder'}</span><RefPicker options={subjectOptions} search={subjectType === 'group' ? undefined : lookups.search?.stakeholder} value={subjectId} onChange={setSubjectId} /></label>
        <label className="field"><span>Round</span><select value={meta.round} onChange={(e) => setMeta({ ...meta, round: e.target.value })}>{options('assessmentRound', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        <label className="field"><span>Method</span><select value={meta.method} onChange={(e) => setMeta({ ...meta, method: e.target.value })}>{options('assessmentMethod', config).filter((o) => o.id !== 'self').map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        <label className="field"><span>Date</span><input type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></label>
      </div>
      {subjectType === 'stakeholder' && <div className="callout small mb-3"><Icon name="lock" size={13} /> Individual ADKAR scores are sensitive personal information. Record observations about the change, not judgements about the person.</div>}
      {ADKAR.map((a) => (
        <fieldset key={a.id} className="scale-q" style={{ border: '1px solid var(--line)' }}>
          <legend className="strong">{a.label}</legend>
          <div className="scale-opts">
            {ADKAR_SCORE_SCALE.map((o) => (
              <label key={o.value} title={ADKAR_DESCRIPTORS[a.id][o.value] || o.label}><input type="radio" name={a.id} checked={scores[a.id].score === o.value} onChange={() => setScores((s) => ({ ...s, [a.id]: { ...s[a.id], score: o.value } }))} /><b>{o.value}</b><span className="tiny">{o.label}</span></label>
            ))}
          </div>
          <div className="tiny muted mt-1">{ADKAR_DESCRIPTORS[a.id][scores[a.id].score] || `1: ${ADKAR_DESCRIPTORS[a.id][1]} · 5: ${ADKAR_DESCRIPTORS[a.id][5]}`}</div>
          <input type="text" className="mt-2" style={{ width: '100%' }} placeholder="Evidence (optional)" value={scores[a.id].comment} onChange={(e) => setScores((s) => ({ ...s, [a.id]: { ...s[a.id], comment: e.target.value } }))} aria-label={`Evidence for ${a.label}`} />
        </fieldset>
      ))}
      <label className="field mt-2"><span>Overall comment</span><textarea rows={2} value={meta.comment} onChange={(e) => setMeta({ ...meta, comment: e.target.value })} /></label>
    </Modal>
  );
}

// Survey campaigns of any kind (ADK-005, MEA-001); the ADKAR screen lists ADKAR campaigns and the
// Measurement screen lists the others.
export function Surveys({ kinds = ['adkar'], intro, createLabel = 'New ADKAR campaign', Creator = NewCampaign }) {
  const { m, mut, toast, canDo, dialog, today, config } = useIniPage();
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState(null);
  const [translating, setTranslating] = useState(null);
  const link = (s) => `${location.origin}${location.pathname}#/survey/${s.token}`;
  const act = async (name, payload, msg) => { const r = await mut.op(name, payload); toast.success(typeof msg === 'function' ? msg(r) : msg); };
  const emailed = (r, sent, recorded) => (r?.emailed ? `${sent} ${r.emailed.toLocaleString('en-AU')} ${r.emailed === 1 ? 'person' : 'people'}` : recorded);
  const list = m.surveys.filter((s) => kinds.includes(s.kind || 'adkar'));
  return (
    <div className="stack">
      <div className="row-between">
        <p className="small muted" style={{ margin: 0, maxWidth: 760 }}>{intro || <>Self-assessment campaigns use organisation-authored statements, one per ADKAR element. Responses are anonymous by default; results for segments under {m.settings.adkar.minSegment} respondents are suppressed but included in higher-level totals (RUL-03).</>}</p>
        {canDo('C', 'survey') && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" />{createLabel}</button>}
      </div>
      {!list.length && <Empty icon="chart" title="No campaigns yet" />}
      {sortBy(list, '-opensAt').map((s) => (
        <Card key={s.id} title={s.title} sub={`${s.kind && s.kind !== 'adkar' ? label('surveyKind', s.kind, config) : label('assessmentRound', s.round, config) || ''} · ${fmtDate(s.opensAt)} to ${fmtDate(s.closesAt)} · ${asArray(s.groupIds).map((g) => m.groupsById[g]?.name).filter(Boolean).join(', ')}`}
          actions={<StatusBadge status={s.status === 'open' ? 'inProgress' : s.status === 'closed' ? 'complete' : s.status === 'scheduled' ? 'scheduled' : 'draft'} labelText={label('surveyStatus', s.status, config)} />}>
          <div className="row-between">
            <div className="row small" style={{ gap: 16 }}>
              <span><strong>{s.responses}</strong> responses{s.invited ? ` of ${s.invited.toLocaleString('en-AU')} invited` : ''}</span>
              {s.responseRate != null && <span>{s.responseRate}% response (target {s.responseTarget ?? 60}%)</span>}
              {asArray(s.reminders).length > 0 && <span>{s.reminders.length} reminder(s) sent</span>}
            </div>
            <div className="btn-row">
              {s.status === 'draft' && canDo('U', 'survey') && s.opensAt > today && <button type="button" className="btn btn-sm" onClick={() => act('scheduleSurvey', { id: s.id }, `Scheduled to open on ${fmtDate(s.opensAt)}`)}><Icon name="clock" />Schedule for {fmtDate(s.opensAt)}</button>}
              {s.status === 'scheduled' && <span className="small muted">Opens {fmtDate(s.opensAt)}, when the link is emailed to the groups</span>}
              {['draft', 'scheduled'].includes(s.status) && canDo('U', 'survey') && <button type="button" className="btn btn-sm btn-primary" onClick={() => act('openSurvey', { id: s.id }, (r) => emailed(r, 'Survey opened and emailed to', 'Survey opened'))}>{s.status === 'scheduled' ? 'Open now' : 'Open survey'}</button>}
              {s.status === 'open' && (
                <>
                  <button type="button" className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(link(s)); toast.success('Survey link copied'); }}><Icon name="link" />Copy link</button>
                  <a className="btn btn-sm" href={link(s)} target="_blank" rel="noreferrer"><Icon name="external" />Open</a>
                  {canDo('U', 'survey') && <button type="button" className="btn btn-sm" onClick={() => act('sendSurveyReminder', { id: s.id }, (r) => emailed(r, 'Reminder emailed to', 'Reminder recorded'))}>Send reminder</button>}
                  {canDo('U', 'survey') && <button type="button" className="btn btn-sm" onClick={async () => { const d = await dialog.prompt({ title: 'Extend the campaign', label: 'New closing date (YYYY-MM-DD)', multiline: false, defaultValue: addDays(s.closesAt || today, 7) }); if (d) act('extendSurvey', { id: s.id, closesAt: d }, 'Campaign extended'); }}>Extend</button>}
                  {canDo('U', 'survey') && <button type="button" className="btn btn-sm" onClick={async () => { if (await dialog.confirm({ title: 'Close and aggregate', message: 'Closing stops new responses and stores aggregated results for each group, suppressing small segments.' })) act('closeSurvey', { id: s.id }, 'Survey closed and results stored'); }}>Close</button>}
                </>
              )}
              {s.status !== 'closed' && canDo('U', 'survey') && <button type="button" className="btn btn-sm" onClick={() => setTranslating(s)}><Icon name="globe" />Languages{asArray(s.languages).length ? ` (${s.languages.length})` : ''}</button>}
              {s.responses > 0 && <button type="button" className="btn btn-sm" onClick={async () => setResults(await mut.op('surveyResults', { id: s.id }, { quiet: true }))}><Icon name="chart" />Results</button>}
            </div>
          </div>
        </Card>
      ))}
      {creating && <Creator onClose={() => setCreating(false)} />}
      {results && <SurveyResults data={results} onClose={() => setResults(null)} />}
      {translating && <SurveyLanguages survey={translating} onClose={() => setTranslating(null)} />}
    </div>
  );
}

// USE-07: survey content in other languages. Respondents choose a language on the survey page; anything
// left blank is shown in English.
const BLANK_LANGUAGE = { code: '', label: '', title: '', intro: '', notice: '', questions: {}, scale: ['', '', '', '', ''], submit: '', thanks: '' };
function SurveyLanguages({ survey, onClose }) {
  const { mut, toast, settings } = useIniPage();
  const notice = asArray(settings?.collectionNotices).find((n) => n.id === survey.collectionNoticeId)?.text;
  const langs = asArray(survey.languages);
  const [code, setCode] = useState(langs[0]?.code || '');
  const [d, setD] = useState(() => ({ ...BLANK_LANGUAGE, ...(langs[0] || {}) }));
  const pick = (c) => { setCode(c); setD({ ...BLANK_LANGUAGE, ...(langs.find((l) => l.code === c) || {}) }); };
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const codeOk = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(d.code.trim());
  const write = async (languages, msg) => { await mut.update('survey', survey.id, { languages }, { version: survey.version }); toast.success(msg); onClose(); };
  const save = () => { const entry = { ...d, code: d.code.trim(), label: d.label.trim() }; return write([...langs.filter((l) => l.code !== code && l.code !== entry.code), entry], `${entry.label} saved`); };
  const questions = asArray(survey.questions);
  return (
    <Modal title={`Languages: ${survey.title}`} wide onClose={onClose}
      footer={<>{code && <button type="button" className="btn" onClick={() => write(langs.filter((l) => l.code !== code), 'Language removed')}><Icon name="trash" />Remove this language</button>}<span className="grow" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!codeOk || !d.label.trim()} onClick={save}>Save</button></>}>
      <p className="small muted">Respondents can answer in any language added here. Anything left blank is shown in English, and each response records the language it was given in.</p>
      <div className="form-grid">
        <label className="field"><span>Language</span><select value={code} onChange={(e) => pick(e.target.value)}>{langs.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}<option value="">Add a language…</option></select></label>
        <div />
        <label className="field"><span>Language code</span><input type="text" value={d.code} placeholder="For example: vi" onChange={(e) => set('code', e.target.value)} aria-invalid={!!d.code && !codeOk} />{d.code && !codeOk && <span className="err">Use a language code such as vi, ar or zh-Hant.</span>}</label>
        <label className="field"><span>Name shown to respondents</span><input type="text" value={d.label} placeholder="For example: Tiếng Việt (Vietnamese)" onChange={(e) => set('label', e.target.value)} /></label>
        <label className="field span-2"><span>Title</span><input type="text" value={d.title} placeholder={survey.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="field span-2"><span>Introduction</span><textarea rows={3} value={d.intro} placeholder={survey.intro || ''} onChange={(e) => set('intro', e.target.value)} /></label>
        {notice && <label className="field span-2"><span>How your information is used (collection notice, PRV-02)</span><textarea rows={3} value={d.notice} placeholder={notice} onChange={(e) => set('notice', e.target.value)} /></label>}
      </div>
      <h3 className="mt-4">Questions</h3>
      <div className="stack-sm">{questions.map((q, i) => <label key={q.id} className="field"><span>{i + 1}. {q.text}</span><textarea rows={2} value={d.questions?.[q.id] || ''} onChange={(e) => set('questions', { ...d.questions, [q.id]: e.target.value })} /></label>)}</div>
      <h3 className="mt-4">Answer scale and buttons</h3>
      <div className="form-grid">
        {ADKAR_SCORE_SCALE.map((o, i) => <label key={o.value} className="field"><span>{o.value}: {o.label}</span><input type="text" value={d.scale?.[i] || ''} onChange={(e) => set('scale', Object.assign([...(d.scale || BLANK_LANGUAGE.scale)], { [i]: e.target.value }))} /></label>)}
        <label className="field"><span>Submit my response</span><input type="text" value={d.submit} onChange={(e) => set('submit', e.target.value)} /></label>
        <label className="field span-2"><span>Thank-you message</span><input type="text" value={d.thanks} placeholder="Your response has been recorded. You can close this page." onChange={(e) => set('thanks', e.target.value)} /></label>
      </div>
    </Modal>
  );
}

function NewCampaign({ onClose }) {
  const { m, ini, mut, toast, today, config } = useIniPage();
  const [d, setD] = useState({ title: 'ADKAR pulse check', round: 'adHoc', groupIds: m.groups.filter((g) => g.high).map((g) => g.id), opensAt: today, closesAt: addDays(today, 14), anonymous: true });
  const save = async () => { await mut.op('createAdkarCampaign', { initiativeId: ini.id, ...d }); toast.success('Campaign created as a draft'); onClose(); };
  return (
    <Modal title="New ADKAR campaign" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!d.groupIds.length} onClick={save}>Create draft</button></>}>
      <div className="stack">
        <label className="field"><span>Title</span><input type="text" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
        <label className="field"><span>Round</span><select value={d.round} onChange={(e) => setD({ ...d, round: e.target.value })}>{options('assessmentRound', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        <label className="field"><span>Impacted groups</span><RefPicker multiple options={m.groups.map((g) => ({ id: g.id, label: g.name, sub: `${g.headcount} people` }))} value={d.groupIds} onChange={(v) => setD({ ...d, groupIds: v })} /></label>
        <div className="form-grid"><label className="field"><span>Opens</span><input type="date" value={d.opensAt} onChange={(e) => setD({ ...d, opensAt: e.target.value })} /></label><label className="field"><span>Closes</span><input type="date" value={d.closesAt} onChange={(e) => setD({ ...d, closesAt: e.target.value })} /></label></div>
        <label className="check"><input type="checkbox" checked={d.anonymous} onChange={(e) => setD({ ...d, anonymous: e.target.checked })} /><span>Anonymous responses (recommended)</span></label>
      </div>
    </Modal>
  );
}

export function SurveyResults({ data, onClose }) {
  const { m } = useIniPage();
  const qs = asArray(data.survey.questions).filter((q) => q.type !== 'text');
  const segs = Object.entries(data.segments);
  return (
    <Modal title={`Results: ${data.survey.title}`} onClose={onClose} wide footer={<button type="button" className="btn" onClick={onClose}>Close</button>}>
      <p className="small muted">{data.overall.n} responses{data.responseRate != null ? ` · ${data.responseRate}% response rate` : ''}. Segments with fewer than {data.minSegment} responses are suppressed.</p>
      <table className="tbl">
        <thead><tr><th>Statement</th><th className="num">All</th>{segs.map(([g, s]) => <th key={g} className="num">{m.groupsById[g]?.name || 'Not stated'} <span className="tiny muted">(n={s.n})</span></th>)}</tr></thead>
        <tbody>{qs.map((q) => (
          <tr key={q.id}><td style={{ whiteSpace: 'normal', minWidth: 260 }}>{q.text}</td><td className="num">{data.overall.questions?.[q.id]?.mean ?? '—'}</td>{segs.map(([g, s]) => <td key={g} className="num">{s.suppressed ? <span className="muted" title="Suppressed (RUL-03)">—</span> : s.questions?.[q.id]?.mean ?? '—'}</td>)}</tr>
        ))}</tbody>
      </table>
    </Modal>
  );
}
