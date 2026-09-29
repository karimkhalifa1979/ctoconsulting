import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { PageHead, Card, PriorityBadge, StatusBadge, usePaged, includesAll, useTip } from '../components/ui.jsx';
import { controlsFor, evidenceFor, statusOf, CONTROL_STATES } from '../lib/assessment.js';
import { splitList } from '../lib/registerParser.js';
import { downloadCSV, safeName } from '../lib/exporters.js';

const SEQ = ['transparent', 'var(--seq-100)', 'var(--seq-200)', 'var(--seq-300)', 'var(--seq-400)', 'var(--seq-500)', 'var(--seq-600)'];

function Node({ cls = '', title, children }) {
  return <div className={`trace-node ${cls}`}>{title && <strong>{title}</strong>}{children}</div>;
}

function Explorer({ data, assessments, reqId, setReqId, oblByReq }) {
  const [q, setQ] = useState('');
  const req = data.requirements.find((r) => r.id === reqId) || data.requirements[0];
  const obls = oblByReq[req.id] || [];
  const bySource = obls.reduce((m, o) => ((m[o.name] ||= []).push(o), m), {});
  const a = assessments[req.id] || {};
  const controls = controlsFor(req);
  const evidence = evidenceFor(req);
  const exemptions = (data.exemptions || []).filter((e) => e.requirementId === req.id);
  const options = data.requirements.filter((r) => includesAll(`${r.id} ${r.title}`, q)).slice(0, 400);

  return (
    <div className="stack">
      <div className="filters" style={{ marginBottom: 0 }}>
        <input type="search" placeholder="Find a requirement…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={req.id} onChange={(e) => setReqId(e.target.value)} style={{ minWidth: 360, maxWidth: '100%' }}>
          {options.map((r) => <option key={r.id} value={r.id}>{r.id} — {r.title}</option>)}
        </select>
        <Link className="btn btn-sm" to={`/assessment?id=${encodeURIComponent(req.id)}`}>Assess</Link>
      </div>
      <div className="card card-pad" style={{ overflowX: 'auto' }}>
        <div className="trace">
          <div className="trace-col">
            <h4>Obligations <span>{obls.length}</span></h4>
            {Object.entries(bySource).map(([src, list]) => (
              <Node key={src} title={src}>
                <div className="small muted">{list.length} obligation{list.length > 1 ? 's' : ''}</div>
                <div className="small">{list.slice(0, 6).map((o) => o.id).join(', ')}{list.length > 6 ? ` +${list.length - 6}` : ''}</div>
              </Node>
            ))}
            {!obls.length && <Node title="No obligations mapped" />}
          </div>
          <div className="trace-col">
            <h4>Policy requirement</h4>
            <Node cls="req" title={`${req.id}`}>
              <div style={{ fontWeight: 600, margin: '2px 0 4px' }}>{req.title}</div>
              <div className="small">{req.requirement}</div>
              <div className="row small" style={{ marginTop: 6 }}><PriorityBadge p={req.priority} /><span className="badge">{req.type}</span></div>
            </Node>
            <Node title="Control objective"><div className="small">{req.controlObjective}</div></Node>
            <Node title="Threat / risk"><div className="small">{req.threat}</div><div className="small muted">Risk if unmet: {req.riskRating}</div></Node>
          </div>
          <div className="trace-col">
            <h4>Controls <span>{controls.length}</span></h4>
            {controls.slice(0, 14).map((c) => (
              <Node cls="ctrl" key={c.key} title={c.kind}>
                <div className="small">{c.label}</div>
                {a.controls?.[c.key] && a.controls[c.key] !== CONTROL_STATES[0] && <div className="small muted">{a.controls[c.key]}</div>}
              </Node>
            ))}
            {controls.length > 14 && <div className="small muted">+{controls.length - 14} more</div>}
            <Node cls="ctrl" title="Control category"><div className="small">{req.controlCategory}</div><div className="small muted">{req.otherStandards}</div></Node>
          </div>
          <div className="trace-col">
            <h4>Evidence required <span>{evidence.length}</span></h4>
            {evidence.map((e, i) => (
              <Node cls="ev" key={i}><div className="small">{a.evidence?.[i]?.provided ? '✓ ' : ''}{e}</div>{a.evidence?.[i]?.ref && <div className="small muted">{a.evidence[i].ref}</div>}</Node>
            ))}
            <Node cls="ev" title="Verification"><div className="small">{req.verification}</div><div className="small muted">Audit: {req.auditFrequency}</div></Node>
          </div>
          <div className="trace-col">
            <h4>Roles (RACI)</h4>
            <Node cls="role" title="Accountable"><div className="small">{req.accountable}</div></Node>
            <Node cls="role" title="Responsible"><div className="small">{req.responsible}</div></Node>
            <Node cls="role" title="Consulted"><div className="small">{req.consulted || '—'}</div></Node>
            <Node cls="role" title="Informed"><div className="small">{req.informed || '—'}</div></Node>
            <Node cls="role" title="Owner (SME)"><div className="small">{req.owner}</div></Node>
          </div>
          <div className="trace-col">
            <h4>Policy, lifecycle &amp; assurance</h4>
            <Node cls="asm" title="Target policy"><div className="small">{req.policyTitle}</div><div className="small muted">{req.policyNumber} · {req.section}</div></Node>
            <Node cls="asm" title="Assessment"><StatusBadge a={a} />{a.risk && <div className="small" style={{ marginTop: 4 }}>Risk: {a.risk}</div>}{a.finding && <div className="small muted">{a.finding}</div>}</Node>
            <Node cls="asm" title="Exceptions"><div className="small">{req.exceptionsPermitted} — {req.exceptionAuthority}</div>{exemptions.map((e) => <div key={e.id} className="small" style={{ marginTop: 4 }}><strong>{e.id}</strong> {e.status}, expires {e.expiryDate}</div>)}</Node>
            <Node cls="asm" title="Related documents"><div className="small">{splitList(req.relatedPolicies).slice(0, 4).join('; ')}</div><div className="small muted">{splitList(req.relatedProcedures).slice(0, 3).join('; ')}</div></Node>
            <Node cls="asm" title="Review"><div className="small">{req.reviewFrequency} · {req.status}</div><div className="small muted">Last reviewed {req.lastReviewed || '—'}</div></Node>
          </div>
        </div>
      </div>
      <Card title={`Obligations mapped to ${req.id}`} pad={false}>
        <div className="table-wrap"><table className="table"><thead><tr><th>ID</th><th>Source</th><th>Reference</th><th>Description</th></tr></thead>
          <tbody>{obls.slice(0, 100).map((o) => <tr key={o.key}><td className="nowrap">{o.id}</td><td className="small">{o.name}</td><td className="small">{o.reference}</td><td className="small"><div className="clamp-2">{o.description}</div></td></tr>)}</tbody></table></div>
      </Card>
    </div>
  );
}

function Matrix({ org, data, assessments }) {
  const [q, setQ] = useState('');
  const [policy, setPolicy] = useState('');
  const reqById = useMemo(() => Object.fromEntries(data.requirements.map((r) => [r.id, r])), [data]);
  const rows = useMemo(() => {
    const out = [];
    for (const o of data.obligations) for (const id of o.requirementIds) {
      const r = reqById[id];
      if (!r || (policy && r.policyCode !== policy)) continue;
      out.push({ o, r, key: `${o.key}|${id}` });
    }
    return out.filter((x) => includesAll(`${x.o.id} ${x.o.name} ${x.o.reference} ${x.r.id} ${x.r.title} ${x.r.ismControls}`, q));
  }, [data, reqById, policy, q]);
  const [page, pager] = usePaged(rows, 50, [q, policy]);
  const exportCsv = () => downloadCSV(rows, [
    { label: 'Obligation ID', get: (x) => x.o.id }, { label: 'Obligation Source', get: (x) => x.o.name }, { label: 'Obligation Reference', get: (x) => x.o.reference },
    { label: 'Obligation Description', get: (x) => x.o.description }, { label: 'Requirement ID', get: (x) => x.r.id }, { label: 'Requirement Title', get: (x) => x.r.title },
    { label: 'Policy Requirement', get: (x) => x.r.requirement }, { label: 'Target Policy', get: (x) => x.r.policyTitle }, { label: 'Policy Number', get: (x) => x.r.policyNumber },
    { label: 'Control Category', get: (x) => x.r.controlCategory }, { label: 'Control Objective', get: (x) => x.r.controlObjective }, { label: 'Linked ISM Controls', get: (x) => x.r.ismControls },
    { label: 'Technical Controls', get: (x) => x.r.technicalControls }, { label: 'Verification Method', get: (x) => x.r.verification }, { label: 'Evidence Required', get: (x) => x.r.evidence },
    { label: 'Audit Frequency', get: (x) => x.r.auditFrequency }, { label: 'Accountable', get: (x) => x.r.accountable }, { label: 'Responsible', get: (x) => x.r.responsible },
    { label: 'Related Policies', get: (x) => x.r.relatedPolicies }, { label: 'Review Frequency', get: (x) => x.r.reviewFrequency }, { label: 'Assessment Status', get: (x) => statusOf(assessments[x.r.id]).label },
  ], `${safeName(org.shortName)}_Traceability_Matrix.csv`);
  return (
    <div>
      <div className="filters">
        <input type="search" placeholder="Search obligations, requirements, ISM controls…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={policy} onChange={(e) => setPolicy(e.target.value)}><option value="">All target policies</option>{Object.values(data.policies).map((p) => <option key={p.code} value={p.code}>{p.title}</option>)}</select>
        <button className="btn" onClick={exportCsv}>Export full matrix (CSV)</button>
      </div>
      <div className="card">
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Obligation</th><th>Requirement</th><th>Target policy</th><th>Controls</th><th>Evidence</th><th>Accountable</th><th>Audit</th><th>Status</th></tr></thead>
          <tbody>{page.map(({ o, r, key }) => (
            <tr key={key}>
              <td style={{ minWidth: 180 }}><strong>{o.id}</strong><div className="small muted">{o.name}</div><div className="small clamp-2">{o.reference}</div></td>
              <td style={{ minWidth: 200 }}><Link to={`/traceability?id=${encodeURIComponent(r.id)}`}><strong>{r.id}</strong></Link><div className="small">{r.title}</div></td>
              <td className="small">{r.policyTitle}</td>
              <td className="small" style={{ minWidth: 160 }}><div>{r.controlCategory}</div><div className="muted clamp-2">{r.ismList?.join(', ') || r.ismControls}</div></td>
              <td className="small" style={{ minWidth: 200 }}><div className="clamp-3">{r.evidence}</div></td>
              <td className="small">{r.accountable}</td>
              <td className="small">{r.auditFrequency}</td>
              <td><StatusBadge a={assessments[r.id]} /></td>
            </tr>
          ))}</tbody>
        </table></div>
        {pager}
      </div>
    </div>
  );
}

function Coverage({ data }) {
  const [bind, tip] = useTip();
  const policies = Object.values(data.policies).sort((a, b) => a.code.localeCompare(b.code));
  const counts = {};
  for (const o of data.obligations) {
    const m = (counts[o.name] ||= { total: 0 });
    m.total++;
    m[o.policyCode] = (m[o.policyCode] || 0) + 1;
  }
  const rows = Object.entries(counts).sort((a, b) => b[1].total - a[1].total).slice(0, 40);
  const max = Math.max(1, ...rows.flatMap(([, m]) => policies.map((p) => m[p.code] || 0)));
  const step = (n) => (n ? Math.min(6, 1 + Math.floor(Math.log(n + 1) / Math.log(max + 1) * 5.99)) : 0);
  return (
    <Card title="Obligation coverage — source × target policy" subtitle="How each source's obligations are distributed across policies (top 40 sources; darker = more obligations)" pad={false}>
      <div className="table-wrap">
        <table className="table heat">
          <thead><tr><th>Source</th>{policies.map((p) => <th key={p.code} title={p.title}>{p.code}</th>)}<th>Total</th></tr></thead>
          <tbody>{rows.map(([src, m]) => (
            <tr key={src}><td className="small" style={{ minWidth: 240 }}>{src}</td>
              {policies.map((p) => { const n = m[p.code] || 0; const s = step(n); return <td key={p.code} className="cell small" style={{ background: SEQ[s], color: s >= 4 ? '#fff' : 'var(--ink)' }} {...bind(`${src} → ${p.title}: ${n}`)}>{n || ''}</td>; })}
              <td className="cell">{m.total}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {tip}
    </Card>
  );
}

export default function Traceability() {
  const { org, data, assessments } = useApp();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'explorer');
  const oblByReq = useMemo(() => {
    const m = {};
    for (const o of data.obligations) for (const id of o.requirementIds) (m[id] ||= []).push(o);
    return m;
  }, [data]);
  const reqId = params.get('id') || data.requirements[0]?.id;

  return (
    <div>
      <PageHead eyebrow="Traceability" title={`Traceability — ${org.shortName}`}>
        End-to-end traceability from obligation sources to policy requirements, controls, evidence, roles, target policies, exemptions and assessment results.
      </PageHead>
      <div className="tabs">
        {[['explorer', 'Trace explorer'], ['matrix', 'Traceability matrix'], ['coverage', 'Coverage heatmap']].map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'explorer' && <Explorer data={data} assessments={assessments} reqId={reqId} setReqId={(id) => setParams({ id })} oblByReq={oblByReq} />}
      {tab === 'matrix' && <Matrix org={org} data={data} assessments={assessments} />}
      {tab === 'coverage' && <Coverage data={data} />}
      {org.kind === 'seed' && <p className="small muted" style={{ marginTop: 16 }}>The source workbook's per-policy traceability and consolidation worksheets are available verbatim in the <Link to="/register">Register explorer</Link>.</p>}
    </div>
  );
}
