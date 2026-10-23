// Define Approach — risk and readiness (RSK-001 to RSK-008): change characteristics and organisational
// attributes give the change risk profile (RUL-13) and recommended approach (RUL-14); PCT health with
// focus suggestions (RSK-004, RSK-005); sponsor assessment (RSK-007); readiness checklists with a
// go/no-go recommendation (RSK-006); and the change risk and issue register (RSK-008).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, Help, Modal, RiskBadge, Meter, KV } from '../../ui/core.jsx';
import Register from '../../ui/Register.jsx';
import { LineChart, PctTriangle, SERIES } from '../../charts/index.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, label, options } from '../../lib/format.js';
import { QUESTION_SETS, READINESS_CHECKLISTS, PLANNING_APPROACHES } from '../../../shared/refdata.js';
import { setScore, riskProfile, latestOf, sponsorScore, riskRating, DEFAULT_RISK_MATRIX } from '../../../shared/rules/risk.js';
import { checklistScore, recommendation } from '../../../shared/rules/readiness.js';
import { asArray, sortBy } from '../../../shared/util.js';

export default function Risk() {
  const { m } = useIniPage();
  const [tab, setTab] = useTab('profile');
  if (!m) return <Spinner />;
  const openRisks = m.risks.filter((r) => r.status !== 'closed').length;
  return (
    <>
      <PageHead eyebrow="Phase 1 · Define Approach" title="Risk and readiness">
        How much change management this initiative needs, how healthy its foundations are, how ready people are, and the risks and issues to manage.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'profile', label: 'Change risk profile' },
        { id: 'pct', label: 'PCT health' },
        { id: 'sponsor', label: 'Sponsor assessment' },
        { id: 'readiness', label: 'Readiness', count: m.checklists.length },
        { id: 'risks', label: 'Risks and issues', count: openRisks },
      ]} />
      {tab === 'profile' && <Profile />}
      {tab === 'pct' && <Pct />}
      {tab === 'sponsor' && <SponsorAssessment />}
      {tab === 'readiness' && <Readiness />}
      {tab === 'risks' && <Risks />}
    </>
  );
}

const itemScore = (a, id) => { const v = a?.scores?.[id]; return typeof v === 'object' && v ? v.score : v; };

// Questionnaire for any organisation-authored question set.
export function QuestionnaireEditor({ kind, assessment, defaults = {}, onClose, title }) {
  const { mut, toast, user, today, config } = useIniPage();
  const set = QUESTION_SETS[kind];
  const [scores, setScores] = useState(() => Object.fromEntries(set.items.map((q) => [q.id, { score: itemScore(assessment, q.id) ?? null, comment: assessment?.scores?.[q.id]?.comment || '' }])));
  const [meta, setMeta] = useState({ round: assessment?.round || defaults.round || 'baseline', date: assessment?.date || today, comment: assessment?.comment || '', method: assessment?.method || 'practitioner' });
  const rated = Object.values(scores).filter((s) => s.score != null).length;
  const preview = setScore({ scores }, set);
  const save = async () => {
    const body = { kind, subjectType: defaults.subjectType || 'initiative', subjectId: defaults.subjectId, round: meta.round, method: meta.method, date: meta.date, assessorId: user.id, scores, comment: meta.comment };
    if (assessment?.id) await mut.update('assessment', assessment.id, body, { version: assessment.version });
    else await mut.create('assessment', body);
    toast.success(`${set.label} saved`);
    onClose();
  };
  return (
    <Modal title={title || `${set.label} assessment`} onClose={onClose} wide footer={<><span className="small muted grow">{rated} of {set.items.length} rated · score {preview ?? '—'}/100</span><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!rated} onClick={save}>Save assessment</button></>}>
      <div className="form-grid mb-3">
        <label className="field"><span>Date</span><input type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} /></label>
        <label className="field"><span>Round</span><select value={meta.round} onChange={(e) => setMeta({ ...meta, round: e.target.value })}>{options('assessmentRound', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      </div>
      <p className="small muted">Rate each item from 1 to 5{set.higherIsRisk ? ' (5 means the highest risk)' : ' (5 means the strongest)'}. These questions are written for this organisation and can be changed by an administrator.</p>
      <div className="stack-sm">
        {set.items.map((q, i) => (
          <fieldset key={q.id} className="scale-q" style={{ border: '1px solid var(--line)' }}>
            <legend className="strong" style={{ padding: '0 4px' }}>{i + 1}. {q.text}</legend>
            {(q.low || q.high) && <div className="row-between tiny muted"><span>1 = {q.low}</span><span>5 = {q.high}</span></div>}
            <div className="scale-opts">
              {[1, 2, 3, 4, 5].map((v) => (
                <label key={v}><input type="radio" name={q.id} checked={scores[q.id].score === v} onChange={() => setScores((s) => ({ ...s, [q.id]: { ...s[q.id], score: v } }))} /><b>{v}</b></label>
              ))}
            </div>
            <input type="text" className="mt-2" style={{ width: '100%' }} placeholder="Evidence or comment (optional)" value={scores[q.id].comment} onChange={(e) => setScores((s) => ({ ...s, [q.id]: { ...s[q.id], comment: e.target.value } }))} aria-label={`Comment on ${q.text}`} />
          </fieldset>
        ))}
      </div>
      <label className="field mt-3"><span>Overall comment</span><textarea rows={2} value={meta.comment} onChange={(e) => setMeta({ ...meta, comment: e.target.value })} /></label>
    </Modal>
  );
}

function ScoreTable({ assessment, kind }) {
  const set = QUESTION_SETS[kind];
  if (!assessment) return <Empty icon="shield" title="Not assessed yet" />;
  return (
    <table className="tbl tbl-compact">
      <tbody>{set.items.map((q) => {
        const v = itemScore(assessment, q.id);
        const c = assessment.scores?.[q.id]?.comment;
        return (
          <tr key={q.id}>
            <td className="small">{q.text}{c && <div className="tiny muted">{c}</div>}</td>
            <td style={{ width: 90 }}><Meter value={v} max={5} tone={v == null ? '' : set.higherIsRisk ? (v >= 4 ? 'bad' : v >= 3 ? 'warn' : 'good') : (v <= 2 ? 'bad' : v <= 3 ? 'warn' : 'good')} track="track-neutral" label={q.text} /></td>
            <td className="num strong" style={{ width: 30 }}>{v ?? '—'}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}

function Profile() {
  const { m, canDo, base, settings } = useIniPage();
  const [editing, setEditing] = useState(null);
  const r = m.risk;
  const approach = r.recommended;
  const selected = m.strategy?.approach ? PLANNING_APPROACHES.find((p) => p.id === m.strategy.approach) : null;
  const thresholds = settings.risk || { lowBelow: 40, highFrom: 60 };
  const history = sortBy(m.assessments.filter((a) => ['changeCharacteristics', 'orgAttributes'].includes(a.kind)), '-date');
  return (
    <div className="stack">
      <div className="grid g-3">
        <Card title="Change risk profile">
          <div className="hero-figure" style={{ color: r.profile === 'high' ? 'var(--st-serious-ink)' : r.profile === 'medium' ? 'var(--st-warning-ink)' : 'var(--st-good-ink)' }}>{r.profile ? label('riskProfile', r.profile) : '—'}</div>
          <p className="small muted mt-2">Both scores below {thresholds.lowBelow} give a low profile, both {thresholds.highFrom} or above a high profile, anything else medium (RUL-13).</p>
          <KV items={[['Change characteristics', r.ccScore != null ? `${r.ccScore}/100` : 'Not assessed'], ['Organisational attributes', r.oaScore != null ? `${r.oaScore}/100` : 'Not assessed']]} />
        </Card>
        <Card title="Recommended approach" sub="RUL-14">
          {approach ? (
            <>
              <h3>{approach.label}</h3>
              <p className="small">{approach.description}</p>
              {selected && selected.id !== approach.id && <div className="callout warn small">The Strategy uses “{selected.label}”. {m.strategy?.overrideRationale ? `Rationale: ${m.strategy.overrideRationale}` : 'Record the rationale for overriding the recommendation in the Strategy.'}</div>}
              {selected && selected.id === approach.id && <Badge tone="good" icon="checkCircle">Adopted in the Strategy</Badge>}
              <div className="mt-3"><Link className="btn btn-sm" to={`${base}/strategy`}>Open Strategy</Link></div>
            </>
          ) : <Empty icon="route" title="Assess both question sets to get a recommendation" />}
        </Card>
        <Card title="Assessment history" flush>
          {history.length ? (
            <table className="tbl tbl-compact"><tbody>{history.map((a) => <tr key={a.id}><td className="small">{QUESTION_SETS[a.kind].label}<div className="tiny muted">{label('assessmentRound', a.round)} · {fmtDate(a.date)}</div></td><td className="num strong">{setScore(a)}</td></tr>)}</tbody></table>
          ) : <Empty title="No assessments yet" />}
        </Card>
      </div>
      <div className="grid g-2">
        {['changeCharacteristics', 'orgAttributes'].map((kind) => {
          const a = kind === 'changeCharacteristics' ? r.cc : r.oa;
          return (
            <Card key={kind} title={QUESTION_SETS[kind].label} sub={a ? `${label('assessmentRound', a.round)} · ${fmtDate(a.date)} · score ${setScore(a)}/100` : 'Not assessed'}
              actions={canDo('C', 'assessment') && <><button type="button" className="btn btn-sm" onClick={() => setEditing({ kind, assessment: null })}><Icon name="plus" />New</button>{a && <button type="button" className="btn btn-sm" onClick={() => setEditing({ kind, assessment: a })}><Icon name="edit" />Edit</button>}</>}>
              <ScoreTable assessment={a} kind={kind} />
            </Card>
          );
        })}
      </div>
      {editing && <QuestionnaireEditor kind={editing.kind} assessment={editing.assessment} defaults={{ subjectType: 'initiative', subjectId: m.initiative.id, round: editing.assessment ? editing.assessment.round : 'adHoc' }} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Pct() {
  const { m, mut, toast, canDo } = useIniPage();
  const [editing, setEditing] = useState(null);
  const pct = m.risk.pct;
  const latest = latestOf(m.assessments, 'pct');
  const aspects = QUESTION_SETS.pct.aspects;
  const accepted = new Set(asArray(latest?.acceptedFocus).map((f) => f.id));
  const series = aspects.map((a, i) => ({ key: a.id, label: a.label, color: SERIES[i], points: m.risk.pctTrend.map((t) => ({ date: t.date, value: t.aspects[a.id] })) }));
  const accept = async (f, createActivity) => {
    await mut.op('acceptFocus', { assessmentId: latest.id, focus: { id: f.id, title: f.title, text: f.text }, createActivity });
    toast.success(createActivity ? 'Focus area accepted and added to the plan' : 'Focus area accepted');
  };
  return (
    <div className="stack">
      <div className="grid g-main">
        <Card title="PCT health" sub="Success is supported by leadership and sponsorship, project management and change management. A weak corner puts outcomes at risk (RSK-004)." actions={canDo('C', 'assessment') && <button type="button" className="btn btn-sm" onClick={() => setEditing({ assessment: null })}><Icon name="plus" />New PCT assessment</button>}>
          {pct ? (
            <div className="grid g-2" style={{ alignItems: 'center' }}>
              <PctTriangle aspects={pct.aspects} labels={{ leadership: 'Leadership', projectManagement: 'Project management', changeManagement: 'Change management' }} overall={pct.aspects.success} />
              <div>
                <KV items={aspects.map((a) => [a.label, pct.aspects[a.id] != null ? `${pct.aspects[a.id]}/100` : '—'])} />
                <p className="tiny muted mt-2">{label('assessmentRound', pct.round)} · {fmtDate(pct.date)} · overall {pct.overall}/100</p>
              </div>
            </div>
          ) : <Empty icon="shield" title="No PCT assessment yet" />}
        </Card>
        <Card title="Suggested focus areas" sub="From low-scoring items, for your review. Accepting records your decision; you can also add the action to the plan (RSK-005)." flush>
          {m.risk.focus.length === 0 && <Empty icon="checkCircle" title="No focus areas suggested" />}
          {m.risk.focus.map((f) => (
            <div key={f.id} className="alert-item info">
              <Icon name="lightbulb" className="ai-icon" />
              <div className="grow">
                <div className="ai-title">{f.title} {accepted.has(f.id) && <Badge tone="good" icon="checkCircle">Accepted</Badge>}</div>
                <div className="ai-detail">{f.text}</div>
                <div className="tiny muted">Evidence: {f.evidence}</div>
                {!accepted.has(f.id) && latest && canDo('U', 'assessment') && <div className="btn-row mt-1"><button type="button" className="btn btn-xs" onClick={() => accept(f, false)}>Accept</button><button type="button" className="btn btn-xs" onClick={() => accept(f, true)}>Accept and add to plan</button></div>}
              </div>
            </div>
          ))}
        </Card>
      </div>
      {m.risk.pctTrend.length > 1 && <Card title="PCT trend" sub="Each aspect scored 0–100 at each assessment."><LineChart series={series} yMin={0} yMax={100} format={(v) => Math.round(v)} ariaLabel="PCT trend by aspect" /></Card>}
      <Card title="Latest PCT ratings" actions={latest && canDo('U', 'assessment') && <button type="button" className="btn btn-sm" onClick={() => setEditing({ assessment: latest })}><Icon name="edit" />Edit</button>}><ScoreTable assessment={latest} kind="pct" /></Card>
      {editing && <QuestionnaireEditor kind="pct" assessment={editing.assessment} defaults={{ subjectType: 'initiative', subjectId: m.initiative.id, round: 'adHoc' }} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SponsorAssessment() {
  const { m, canDo, lookups } = useIniPage();
  const [editing, setEditing] = useState(null);
  const list = sortBy(m.assessments.filter((a) => a.kind === 'sponsor'), '-date');
  const sponsorId = m.initiative.primarySponsorId;
  return (
    <div className="stack">
      <div className="callout small">Assess the primary sponsor's commitment, capability, availability and visible participation. Results inform the sponsorship gaps and actions in the Strategy (STR-002) and the Sponsor Plan (RSK-007).</div>
      <Card title={`Primary sponsor: ${lookups.nameOf('stakeholder', sponsorId) || 'not recorded'}`} sub={m.risk.sponsorAssessment ? `Score ${m.risk.sponsorScore}/100 · ${fmtDate(m.risk.sponsorAssessment.date)}` : 'Not assessed'}
        actions={canDo('C', 'assessment') && sponsorId && <><button type="button" className="btn btn-sm" onClick={() => setEditing({ assessment: null })}><Icon name="plus" />New assessment</button>{m.risk.sponsorAssessment && <button type="button" className="btn btn-sm" onClick={() => setEditing({ assessment: m.risk.sponsorAssessment })}><Icon name="edit" />Edit</button>}</>}>
        <ScoreTable assessment={m.risk.sponsorAssessment} kind="sponsor" />
      </Card>
      {list.length > 1 && (
        <Card title="Earlier sponsor assessments" flush>
          <table className="tbl"><thead><tr><th>Sponsor</th><th>Date</th><th className="num">Score</th></tr></thead><tbody>{list.map((a) => <tr key={a.id}><td>{lookups.nameOf('stakeholder', a.subjectId)}</td><td>{fmtDate(a.date)}</td><td className="num">{sponsorScore(a)}</td></tr>)}</tbody></table>
        </Card>
      )}
      {editing && <QuestionnaireEditor kind="sponsor" assessment={editing.assessment} defaults={{ subjectType: 'stakeholder', subjectId: sponsorId, round: 'adHoc' }} onClose={() => setEditing(null)} title="Sponsor assessment" />}
    </div>
  );
}

function Readiness() {
  const { m, mut, toast, canDo, today, config, ini } = useIniPage();
  const create = async (kind) => {
    const t = READINESS_CHECKLISTS[kind];
    const ms = m.milestones.find((x) => x.kind === 'goLive' && x.date >= today) || null;
    await mut.create('readinessChecklist', { initiativeId: ini.id, name: `${t.label}${ms ? `: ${ms.name}` : ''}`, kind, milestoneId: ms?.id || null, date: today, items: t.criteria.map((c) => ({ criterion: c, status: null })) });
    toast.success('Checklist created from the template');
  };
  return (
    <div className="stack">
      <div className="row-between">
        <p className="small muted" style={{ margin: 0, maxWidth: 760 }}>Readiness checklists record evidence against criteria. The recommendation combines the criteria with each group's readiness index (threshold {m.settings.readinessThreshold}); the go/no-go decision stays with governance (RSK-006).</p>
        {canDo('C', 'readinessChecklist') && <div className="btn-row"><button type="button" className="btn" onClick={() => create('organisational')}><Icon name="plus" />Organisational checklist</button><button type="button" className="btn btn-primary" onClick={() => create('goLive')}><Icon name="plus" />Go-live checklist</button></div>}
      </div>
      {!m.checklists.length && <Empty icon="checkCircle" title="No readiness checklists yet" />}
      {sortBy(m.checklists, '-date').map((c) => <Checklist key={c.id} c={c} m={m} config={config} />)}
    </div>
  );
}

function Checklist({ c, m, config }) {
  const { mut, canDo, drawer, lookups } = useIniPage();
  const rec = recommendation(c, c.kind === 'goLive' ? m.groups : [], m.settings.readinessThreshold);
  const setStatus = async (i, status) => {
    const items = c.items.map((it, j) => (j === i ? { ...it, status } : it));
    await mut.update('readinessChecklist', c.id, { items }, { version: c.version, quiet: true });
  };
  const editable = canDo('U', 'readinessChecklist');
  return (
    <Card title={c.name} sub={`${label('goNoGo', null) || ''}${fmtDate(c.date)}${c.milestoneId ? ` · ${m.byId.milestone[c.milestoneId]?.name}` : ''} · ${checklistScore(c) ?? '—'}% of criteria met`}
      actions={<>{c.decision ? <StatusBadge status={c.decision} labelText={`Decision: ${label('goNoGo', c.decision, config)}`} /> : rec.decision && <StatusBadge status={rec.decision} labelText={`Recommendation: ${label('goNoGo', rec.decision, config)}`} />}<button type="button" className="btn btn-sm" onClick={() => drawer.open({ type: 'readinessChecklist', id: c.id, wide: true })}><Icon name="edit" />Details and decision</button></>} flush>
      <table className="tbl">
        <thead><tr><th>Criterion</th><th>Owner</th><th>Evidence</th><th style={{ width: 170 }}>Status</th></tr></thead>
        <tbody>{asArray(c.items).map((it, i) => (
          <tr key={i}>
            <td>{it.criterion}</td>
            <td className="small">{lookups.nameOf('user', it.ownerId) || '—'}</td>
            <td className="small">{it.evidence || '—'}</td>
            <td>{editable ? (
              <select aria-label={`Status of ${it.criterion}`} value={it.status || ''} onChange={(e) => setStatus(i, e.target.value || null)}>
                <option value="">Not assessed</option>
                {options('readinessStatus', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            ) : <StatusBadge status={it.status} labelText={label('readinessStatus', it.status, config)} />}</td>
          </tr>
        ))}</tbody>
      </table>
      {c.kind === 'goLive' && rec.reasons?.length > 0 && (
        <div className="card-body">
          <h4>Why: {label('goNoGo', rec.decision, config) || 'not enough information'}</h4>
          <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{rec.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          {c.conditions && <p className="small mt-2"><strong>Conditions: </strong>{c.conditions}</p>}
        </div>
      )}
    </Card>
  );
}

function Risks() {
  const { m, config } = useIniPage();
  const matrix = m.settings.riskMatrix || DEFAULT_RISK_MATRIX;
  const open = m.risks.filter((r) => r.status !== 'closed');
  return (
    <div className="stack">
      <div className="grid g-main">
        <Register type="risk" title="Change risks and issues" sub="Rated with the organisation's risk matrix; linked to stakeholders, groups and ADKAR elements, and to the project risk register where relevant (RSK-008)." facets={['kind', 'status', 'likelihood']}
          append={[{ key: 'rating', label: 'Rating', render: (r) => <RiskBadge rating={r.rating} />, value: (r) => ({ extreme: 4, high: 3, medium: 2, low: 1 })[r.rating] || 0 }]}
          rows={m.risks} bulkFields={['status', 'ownerId', 'dueDate']} defaultSort={{ key: 'rating', dir: 'desc' }} />
        <Card title="Risk matrix" sub="Open risks and issues by likelihood and consequence">
          <table className="heat" aria-label="Risk matrix">
            <thead><tr><th>Likelihood ↓ / consequence →</th>{[1, 2, 3, 4, 5].map((c) => <th key={c} className="col">{c}</th>)}</tr></thead>
            <tbody>{[5, 4, 3, 2, 1].map((l) => (
              <tr key={l}><th scope="row">{label('likelihood', String(l), config)}</th>{[1, 2, 3, 4, 5].map((c) => {
                const rating = riskRating(l, c, matrix);
                const n = open.filter((r) => Number(r.likelihood) === l && Number(r.consequence) === c).length;
                const bg = { low: 'var(--st-good-soft)', medium: 'var(--st-warning-soft)', high: 'var(--st-serious-soft)', extreme: 'var(--st-critical-soft)' }[rating];
                return <td key={c} className="cell" style={{ background: bg, color: 'var(--ink)' }} title={`${rating}: ${n} open`}>{n || ''}<div className="tiny" style={{ fontWeight: 400, color: 'var(--ink-3)' }}>{rating}</div></td>;
              })}</tr>
            ))}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

export { riskProfile };
