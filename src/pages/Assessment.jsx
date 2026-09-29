import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { PageHead, PriorityBadge, StatusBar, includesAll } from '../components/ui.jsx';
import { STATUSES, MATURITY, EFFECTIVENESS, CONTROL_STATES, REMEDIATION_STATES, RISK_LEVELS, statusOf, controlsFor, evidenceFor, suggestRisk, computeStats, emptyAssessment } from '../lib/assessment.js';

function Section({ n, title, children, hint }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head"><h3><span className="badge badge-navy" style={{ marginRight: 8 }}>{n}</span>{title}</h3>{hint && <span className="small muted">{hint}</span>}</div>
      <div className="card-body">{children}</div>
    </div>
  );
}

function AssessmentForm({ req, saved, onSave, onNext, onPrev, index, total }) {
  const [a, setA] = useState(() => ({ ...emptyAssessment(), ...saved }));
  const [showDetail, setShowDetail] = useState(false);
  const initial = useRef(JSON.stringify(a));
  const pending = useRef(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  useEffect(() => {
    if (JSON.stringify(a) === initial.current) return undefined;
    pending.current = a;
    const t = setTimeout(() => { saveRef.current(a); pending.current = null; }, 350);
    return () => clearTimeout(t);
  }, [a]);
  // Flush an unsaved edit when moving to another requirement.
  useEffect(() => () => { if (pending.current) saveRef.current(pending.current); }, []);

  const set = (patch) => setA((x) => ({ ...x, ...patch }));
  const controls = useMemo(() => controlsFor(req), [req]);
  const evidence = useMemo(() => evidenceFor(req), [req]);
  const setStatus = (status) => set({
    status,
    assessedOn: a.assessedOn || new Date().toISOString().slice(0, 10),
    risk: a.risk || suggestRisk(req.priority, status),
  });
  const ctrlDone = controls.filter((c) => (a.controls[c.key] || 'Not assessed') !== 'Not assessed').length;
  const evDone = evidence.filter((_, i) => a.evidence[i]?.provided).length;

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="eyebrow">{req.id} · {req.policyTitle}</div>
            <h2>{req.title}</h2>
            <div className="row small" style={{ marginTop: 6 }}><PriorityBadge p={req.priority} /><span className="badge">{req.controlCategory || 'Control'}</span><span className="muted">{req.obligationRef}</span></div>
          </div>
          <div className="btn-row">
            <button className="btn btn-sm" onClick={onPrev} disabled={index === 0}>← Previous</button>
            <span className="small muted tabular">{index + 1} / {total}</span>
            <button className="btn btn-sm btn-primary" onClick={onNext} disabled={index >= total - 1}>Next →</button>
          </div>
        </div>
        <p style={{ margin: '12px 0 4px' }}>{req.requirement}</p>
        <p className="small muted" style={{ margin: 0 }}><strong>Control objective:</strong> {req.controlObjective}</p>
        <button className="btn btn-sm btn-ghost" style={{ paddingLeft: 0, marginTop: 6, whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setShowDetail(!showDetail)}>{showDetail ? '▾ Hide' : '▸ Show'} implementation guidance, verification method and RACI</button>
        {showDetail && (
          <dl style={{ margin: '6px 0 0' }}>
            {[['Implementation guidance', req.guidance], ['Technical controls required', req.technicalControls], ['Process / procedural steps', req.processSteps], ['Verification method', req.verification], ['Audit frequency', req.auditFrequency], ['Accountable', req.accountable], ['Responsible', req.responsible], ['Threat / risk addressed', req.threat], ['Linked ISM controls', req.ismControls]].map(([k, v]) => (
              <div className="attr" key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>
            ))}
          </dl>
        )}
      </div>

      <Section n="1" title="Compliance status">
        <div className="status-picker">
          {STATUSES.map((s) => (
            <button key={s.id} className={a.status === s.id ? 'on' : ''} onClick={() => setStatus(s.id)} aria-pressed={a.status === s.id}>
              <i style={{ background: s.color }} />{s.label}
            </button>
          ))}
        </div>
      </Section>

      <Section n="2" title="Maturity and effectiveness">
        <div className="grid g-4">
          <label className="field"><span>Current maturity</span>
            <select value={a.maturity} onChange={(e) => set({ maturity: e.target.value })}><option value="">Select…</option>{MATURITY.map((m) => <option key={m.level} value={m.level} title={m.desc}>{m.label}</option>)}</select>
          </label>
          <label className="field"><span>Target maturity</span>
            <select value={a.targetMaturity} onChange={(e) => set({ targetMaturity: e.target.value })}>{MATURITY.map((m) => <option key={m.level} value={m.level}>{m.label}</option>)}</select>
          </label>
          <label className="field"><span>Design effectiveness</span>
            <select value={a.design} onChange={(e) => set({ design: e.target.value })}>{EFFECTIVENESS.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label className="field"><span>Operating effectiveness</span>
            <select value={a.operating} onChange={(e) => set({ operating: e.target.value })}>{EFFECTIVENESS.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
        </div>
        {a.maturity !== '' && Number(a.maturity) < Number(a.targetMaturity) && <p className="small" style={{ margin: '10px 0 0', color: 'var(--st-critical)' }}>Maturity gap: {Number(a.targetMaturity) - Number(a.maturity)} level(s) below target.</p>}
      </Section>

      <Section n="3" title="Control testing" hint={`${ctrlDone} of ${controls.length} controls assessed`}>
        {controls.length ? controls.map((c) => (
          <div className="ctrl-row" key={c.key}>
            <div><div className="kind">{c.kind}</div>{c.label}</div>
            <select value={a.controls[c.key] || 'Not assessed'} onChange={(e) => set({ controls: { ...a.controls, [c.key]: e.target.value } })} aria-label={`Status of ${c.label}`}>
              {CONTROL_STATES.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
        )) : <p className="muted small">No discrete controls listed — assess against the requirement and verification method.</p>}
      </Section>

      <Section n="4" title="Evidence" hint={`${evDone} of ${evidence.length} artefacts provided`}>
        {evidence.map((ev, i) => {
          const e = a.evidence[i] || {};
          return (
            <div className="ctrl-row" key={i} style={{ gridTemplateColumns: '1fr 260px' }}>
              <label className="check"><input type="checkbox" checked={!!e.provided} onChange={(x) => set({ evidence: { ...a.evidence, [i]: { ...e, item: ev, provided: x.target.checked } } })} />{ev}</label>
              <input type="text" placeholder="Reference / location" value={e.ref || ''} onChange={(x) => set({ evidence: { ...a.evidence, [i]: { ...e, item: ev, ref: x.target.value } } })} />
            </div>
          );
        })}
        <label className="field" style={{ marginTop: 12 }}><span>Evidence notes</span><textarea value={a.evidenceNotes} onChange={(e) => set({ evidenceNotes: e.target.value })} placeholder="Documents reviewed, interviews held, samples tested…" /></label>
      </Section>

      <Section n="5" title="Findings and remediation">
        <div className="grid g-2">
          <label className="field"><span>Finding</span><textarea value={a.finding} onChange={(e) => set({ finding: e.target.value })} placeholder="Describe the gap or observation" /></label>
          <label className="field"><span>Recommendation</span><textarea value={a.recommendation} onChange={(e) => set({ recommendation: e.target.value })} placeholder="Action required to close the gap" /></label>
        </div>
        <div className="grid g-4" style={{ marginTop: 12 }}>
          <label className="field"><span>Risk rating <span className="hint">{suggestRisk(req.priority, a.status) && `(suggested: ${suggestRisk(req.priority, a.status)})`}</span></span>
            <select value={a.risk} onChange={(e) => set({ risk: e.target.value })}><option value="">—</option>{RISK_LEVELS.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label className="field"><span>Remediation owner</span><input type="text" value={a.owner} onChange={(e) => set({ owner: e.target.value })} placeholder={req.owner} /></label>
          <label className="field"><span>Due date</span><input type="date" value={a.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></label>
          <label className="field"><span>Remediation status</span><select value={a.remediationStatus} onChange={(e) => set({ remediationStatus: e.target.value })}>{REMEDIATION_STATES.map((x) => <option key={x}>{x}</option>)}</select></label>
        </div>
      </Section>

      <Section n="6" title="Assessment record">
        <div className="grid g-3">
          <label className="field"><span>Assessor</span><input type="text" value={a.assessor} onChange={(e) => set({ assessor: e.target.value })} /></label>
          <label className="field"><span>Assessed on</span><input type="date" value={a.assessedOn} onChange={(e) => set({ assessedOn: e.target.value })} /></label>
          <div className="field"><span>Saved</span><span className="small muted" style={{ paddingTop: 8 }}>{saved?.updatedAt ? new Date(saved.updatedAt).toLocaleString() : 'Not yet saved'} · saves automatically</span></div>
        </div>
        <label className="field" style={{ marginTop: 12 }}><span>Assessor notes</span><textarea value={a.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
      </Section>
    </div>
  );
}

export default function Assessment() {
  const { org, data, assessments, updateAssessment } = useApp();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [policy, setPolicy] = useState('');
  const [status, setStatus] = useState('');
  const list = useMemo(() => data.requirements.filter((r) => (!policy || r.policyCode === policy) && (!status || statusOf(assessments[r.id]).id === status)
    && includesAll(`${r.id} ${r.title} ${r.requirement}`, q)), [data, policy, status, q, assessments]);
  const stats = useMemo(() => computeStats(policy ? data.requirements.filter((r) => r.policyCode === policy) : data.requirements, assessments), [data, assessments, policy]);
  const currentId = params.get('id') || list[0]?.id;
  const req = data.requirements.find((r) => r.id === currentId);
  const idx = list.findIndex((r) => r.id === currentId);
  const go = (i) => list[i] && setParams({ id: list[i].id });

  return (
    <div>
      <PageHead eyebrow="Control assessment" title={`Assess controls — ${org.shortName}`} actions={<Link className="btn" to="/report">View report</Link>}>
        Assess each policy requirement and its mapped controls: compliance status, maturity, design and operating effectiveness, control tests, evidence, findings and remediation.
      </PageHead>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>{stats.assessed} of {stats.total} assessed ({stats.coverage}%) · compliance score {stats.score ?? '—'}%</strong>
        </div>
        <div style={{ marginTop: 10 }}><StatusBar counts={stats.byStatus} total={stats.total} /></div>
      </div>
      <div className="workspace">
        <div className="card">
          <div className="card-body" style={{ paddingBottom: 8 }}>
            <input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <select value={policy} onChange={(e) => setPolicy(e.target.value)} style={{ flex: 1, minWidth: 0 }}><option value="">All policies</option>{Object.values(data.policies).map((p) => <option key={p.code} value={p.code}>{p.title}</option>)}</select>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ flex: 1, minWidth: 0 }}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            </div>
          </div>
          <div className="req-list">
            {list.map((r) => {
              const s = statusOf(assessments[r.id]);
              return (
                <div key={r.id} className={`req-item ${r.id === currentId ? 'active' : ''}`} onClick={() => setParams({ id: r.id })}>
                  <span className="sdot" style={{ background: s.color }} title={s.label} />
                  <div><div className="t">{r.title}</div><div className="m">{r.id} · {r.priority} · {s.label}</div></div>
                </div>
              );
            })}
            {!list.length && <p className="muted small" style={{ padding: 16 }}>No requirements match.</p>}
          </div>
        </div>
        <div>
          {req ? (
            <AssessmentForm key={req.id} req={req} saved={assessments[req.id]} onSave={(a) => updateAssessment(req.id, a)}
              index={Math.max(0, idx)} total={list.length} onNext={() => go(idx + 1)} onPrev={() => go(idx - 1)} />
          ) : <div className="card empty">Select a requirement to assess.</div>}
        </div>
      </div>
    </div>
  );
}
