import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { PageHead, PriorityBadge, StatusBadge, Drawer, usePaged, includesAll, Linkify } from '../components/ui.jsx';
import { REQ_FIELDS } from '../lib/registerParser.js';
import { downloadCSV, safeName } from '../lib/exporters.js';

export function RequirementDetail({ req, obligations, assessment }) {
  const groups = [...new Set(REQ_FIELDS.map((f) => f.group))];
  return (
    <div>
      <div className="callout" style={{ marginBottom: 18 }}>
        <strong>Suggested target policy:</strong> {req.policyTitle} <span className="muted">({req.policyNumber})</span>
        {req.templateId && <div className="small muted">Generated from requirement template {req.templateId}</div>}
        <div style={{ marginTop: 6 }}><StatusBadge a={assessment} /></div>
      </div>
      {groups.map((g) => (
        <div className="attr-group" key={g}>
          <h4>{g}</h4>
          <dl style={{ margin: 0 }}>
            {REQ_FIELDS.filter((f) => f.group === g).map((f) => (
              <div className="attr" key={f.key}><dt>{f.label}</dt><dd>{f.key === 'priority' || f.key === 'riskRating' ? <PriorityBadge p={req[f.key]} /> : <Linkify text={req[f.key] || '—'} />}</dd></div>
            ))}
          </dl>
        </div>
      ))}
      <div className="attr-group">
        <h4>Mapped obligations ({obligations.length})</h4>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>ID</th><th>Source</th><th>Reference</th></tr></thead>
            <tbody>
              {obligations.slice(0, 60).map((o) => <tr key={o.key}><td className="nowrap">{o.id}</td><td className="small">{o.name}</td><td className="small">{o.reference}</td></tr>)}
            </tbody>
          </table>
          {obligations.length > 60 && <p className="small muted">…and {obligations.length - 60} more — see Traceability.</p>}
        </div>
      </div>
    </div>
  );
}

export default function Requirements() {
  const { org, data, assessments } = useApp();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [policy, setPolicy] = useState('');
  const [priority, setPriority] = useState('');
  const openId = params.get('id');
  const open = data.requirements.find((r) => r.id === openId);
  const oblByReq = useMemo(() => {
    const m = {};
    for (const o of data.obligations) for (const id of o.requirementIds) (m[id] ||= []).push(o);
    return m;
  }, [data]);

  const rows = useMemo(() => data.requirements.filter((r) => (!policy || r.policyCode === policy) && (!priority || r.priority === priority)
    && includesAll(`${r.id} ${r.title} ${r.requirement} ${r.obligationRef} ${r.controlCategory} ${r.section}`, q)), [data, policy, priority, q]);
  const [page, pager] = usePaged(rows, 40, [policy, priority, q]);
  const policies = Object.values(data.policies).sort((a, b) => a.title.localeCompare(b.title));

  const exportCsv = () => downloadCSV(rows, [...REQ_FIELDS.map((f) => ({ label: f.label, key: f.key })), { label: 'Mapped Obligations', get: (r) => (oblByReq[r.id] || []).length }], `${safeName(org.shortName)}_Policy_Requirements.csv`);

  return (
    <div>
      <PageHead eyebrow="Policy requirements" title={`Policy requirements — ${org.shortName}`} actions={<button className="btn" onClick={exportCsv}>Export CSV</button>}>
        Requirements consolidate the obligations into enforceable policy statements, each with a suggested target policy and the full set of register attributes.
      </PageHead>

      <div className="grid g-6" style={{ marginBottom: 16 }}>
        {policies.map((p) => (
          <button key={p.code} className="card stat" style={{ textAlign: 'left', cursor: 'pointer', borderColor: policy === p.code ? 'var(--brand-teal)' : undefined }} onClick={() => setPolicy(policy === p.code ? '' : p.code)}>
            <div className="label">{p.code}</div>
            <div className="value tabular" style={{ fontSize: 22 }}>{p.count}</div>
            <div className="sub clamp-2">{p.title}</div>
          </button>
        ))}
      </div>

      <div className="filters">
        <input type="search" placeholder="Search requirements…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={policy} onChange={(e) => setPolicy(e.target.value)}><option value="">All target policies</option>{policies.map((p) => <option key={p.code} value={p.code}>{p.title}</option>)}</select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">All priorities</option>{['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}</select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Requirement ID</th><th>Requirement</th><th>Suggested target policy</th><th>Priority</th><th>Obligations</th><th>Assessment</th></tr></thead>
            <tbody>
              {page.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setParams({ id: r.id })}>
                  <td className="nowrap"><strong>{r.id}</strong></td>
                  <td><div style={{ fontWeight: 600 }}>{r.title}</div><div className="small muted clamp-2">{r.requirement}</div></td>
                  <td className="small">{r.policyTitle}<div className="muted">{r.policyNumber}</div></td>
                  <td><PriorityBadge p={r.priority} /></td>
                  <td className="tabular">{(oblByReq[r.id] || []).length}</td>
                  <td><StatusBadge a={assessments[r.id]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pager}
      </div>

      {open && (
        <Drawer title={open.title} subtitle={open.id} onClose={() => setParams({})}
          actions={<><Link className="btn btn-sm btn-primary" to={`/assessment?id=${encodeURIComponent(open.id)}`}>Assess</Link><Link className="btn btn-sm" to={`/traceability?id=${encodeURIComponent(open.id)}`}>Trace</Link></>}>
          <RequirementDetail req={open} obligations={oblByReq[open.id] || []} assessment={assessments[open.id]} />
        </Drawer>
      )}
    </div>
  );
}
