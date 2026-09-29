import { useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { PageHead, Gauge, StatusBar, PriorityBadge, StatusBadge, LevelBadge } from '../components/ui.jsx';
import { STATUSES, MATURITY, computeStats, statusOf, controlsFor, evidenceFor } from '../lib/assessment.js';
import { exportRegisterXlsx, downloadWord, downloadCSV, safeName } from '../lib/exporters.js';

const RISK_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3, '': 4 };
const PRI_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const SEQ = ['#f4f7fb', 'var(--seq-100)', 'var(--seq-200)', 'var(--seq-300)', 'var(--seq-400)', 'var(--seq-500)', 'var(--seq-600)'];

// Resolve CSS custom properties so exported HTML renders outside the app.
function resolveVars(html) {
  const cs = getComputedStyle(document.documentElement);
  return html.replace(/var\((--[a-z0-9-]+)\)/g, (_, v) => cs.getPropertyValue(v).trim() || '#999');
}

export default function Report() {
  const { org, data, assessments } = useApp();
  const [scope, setScope] = useState('');
  const [detail, setDetail] = useState(true);
  const ref = useRef(null);
  const reqs = useMemo(() => data.requirements.filter((r) => !scope || r.policyCode === scope), [data, scope]);
  const stats = useMemo(() => computeStats(reqs, assessments), [reqs, assessments]);
  const policies = Object.values(data.policies).filter((p) => !scope || p.code === scope).sort((a, b) => a.title.localeCompare(b.title));
  const today = new Date().toISOString().slice(0, 10);
  const scopeTitle = scope ? data.policies[scope]?.title : 'All target policies';

  const findings = reqs.filter((r) => ['non', 'partial', 'largely'].includes(statusOf(assessments[r.id]).id))
    .sort((a, b) => RISK_ORDER[assessments[a.id].risk || ''] - RISK_ORDER[assessments[b.id].risk || ''] || (PRI_ORDER[a.priority] ?? 4) - (PRI_ORDER[b.priority] ?? 4));
  const remediation = reqs.filter((r) => assessments[r.id]?.dueDate && assessments[r.id]?.remediationStatus !== 'Closed')
    .sort((a, b) => assessments[a.id].dueDate.localeCompare(assessments[b.id].dueDate));
  const priorities = ['Critical', 'High', 'Medium', 'Low'].filter((p) => stats.byPriority[p]);
  const heatMax = Math.max(1, ...priorities.flatMap((p) => STATUSES.map((s) => stats.byPriority[p]?.[s.id] || 0)));
  const byRisk = ['Critical', 'High', 'Medium', 'Low'].map((r) => [r, findings.filter((f) => assessments[f.id].risk === r).length]);
  const ranked = policies.map((p) => ({ ...p, s: stats.byPolicy[p.code] })).filter((p) => p.s?.score !== null && p.s?.score !== undefined).sort((a, b) => a.s.score - b.s.score);
  const maturityRows = policies.map((p) => {
    const rs = reqs.filter((r) => r.policyCode === p.code && assessments[r.id]?.maturity !== undefined && assessments[r.id]?.maturity !== '');
    const cur = rs.length ? rs.reduce((a, r) => a + Number(assessments[r.id].maturity), 0) / rs.length : null;
    const tgt = rs.length ? rs.reduce((a, r) => a + Number(assessments[r.id].targetMaturity ?? 3), 0) / rs.length : null;
    return { ...p, n: rs.length, cur, tgt };
  }).filter((m) => m.n);
  const sources = (org.sources || []).filter((s) => s.selected !== false);

  const exportWord = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Assessment report — ${org.name}</title><style>
body{font-family:Calibri,Arial,sans-serif;color:#16212f;font-size:10.5pt}h1,h2,h3{color:#0b1f3a}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #cfd7e2;padding:5px 7px;text-align:left;vertical-align:top;font-size:9.5pt}th{background:#0b1f3a;color:#fff}
.report-cover{background:#0b1f3a;color:#fff;padding:24px}.report-cover h1{color:#fff}.badge{font-weight:600}.muted{color:#7b8796}.stackbar{display:none}.no-word{display:none}</style></head><body>${resolveVars(ref.current.innerHTML)}</body></html>`;
    downloadWord(html, `${safeName(org.shortName)}_Assessment_Report.doc`);
  };
  const exportCsv = () => downloadCSV(reqs, [
    { label: 'Requirement ID', key: 'id' }, { label: 'Requirement', key: 'title' }, { label: 'Target Policy', key: 'policyTitle' }, { label: 'Priority', key: 'priority' },
    { label: 'Status', get: (r) => statusOf(assessments[r.id]).label }, { label: 'Maturity', get: (r) => assessments[r.id]?.maturity ?? '' },
    { label: 'Target Maturity', get: (r) => assessments[r.id]?.targetMaturity ?? '' }, { label: 'Design', get: (r) => assessments[r.id]?.design ?? '' },
    { label: 'Operating', get: (r) => assessments[r.id]?.operating ?? '' }, { label: 'Risk', get: (r) => assessments[r.id]?.risk ?? '' },
    { label: 'Finding', get: (r) => assessments[r.id]?.finding ?? '' }, { label: 'Recommendation', get: (r) => assessments[r.id]?.recommendation ?? '' },
    { label: 'Owner', get: (r) => assessments[r.id]?.owner ?? '' }, { label: 'Due Date', get: (r) => assessments[r.id]?.dueDate ?? '' },
  ], `${safeName(org.shortName)}_Assessment_Results.csv`);

  return (
    <div>
      <PageHead eyebrow="Assessment report" title="Control assessment report" actions={<>
        <select value={scope} onChange={(e) => setScope(e.target.value)}><option value="">All target policies</option>{Object.values(data.policies).map((p) => <option key={p.code} value={p.code}>{p.title}</option>)}</select>
        <label className="check small"><input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} />Detailed results</label>
        <button className="btn btn-primary" onClick={() => window.print()}>Print / PDF</button>
        <button className="btn" onClick={exportWord}>Word</button>
        <button className="btn" onClick={() => exportRegisterXlsx(org, data, assessments)}>Excel</button>
        <button className="btn" onClick={exportCsv}>CSV</button>
      </>}>
        A formal report of the assessment results, suitable for executives, audit committees and regulators.
      </PageHead>

      <div className="card card-pad report" ref={ref}>
        <div className="report-cover">
          <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7fd6de', fontWeight: 700 }}>CTO Consulting</div>
          <h1 style={{ marginTop: 8 }}>Regulatory Compliance Assessment Report</h1>
          <div style={{ fontSize: 18, marginTop: 6 }}>{org.name}</div>
          <div style={{ marginTop: 14, color: '#b9c9de' }}>Scope: {scopeTitle} · Report date: {today} · Requirements in scope: {reqs.length}</div>
        </div>

        {!stats.assessed && <div className="callout warn" style={{ marginTop: 16 }}>No requirements in scope have been assessed yet. Use Control assessment to record results — this report updates automatically.</div>}

        <section>
          <h2>1. Executive summary</h2>
          <div className="row" style={{ alignItems: 'center', gap: 28, marginTop: 10 }}>
            <Gauge value={stats.score} size={210} />
            <div style={{ flex: 1, minWidth: 260 }}>
              <p style={{ marginTop: 0 }}>
                {stats.assessed} of {stats.total} policy requirements ({stats.coverage}%) have been assessed{stats.score !== null ? `, with an overall compliance score of ${stats.score}%` : ''}.
                {' '}{stats.byStatus.compliant} are compliant, {stats.byStatus.largely} largely compliant, {stats.byStatus.partial} partially compliant and {stats.byStatus.non} non-compliant{stats.byStatus.na ? `; ${stats.byStatus.na} are not applicable` : ''}.
                {findings.length ? ` ${findings.length} findings were raised (${byRisk.filter(([, n]) => n).map(([r, n]) => `${n} ${r.toLowerCase()} risk`).join(', ') || 'unrated'}).` : ''}
                {ranked.length > 1 ? ` The lowest-scoring areas are ${ranked.slice(0, 3).map((p) => `${p.title} (${p.s.score}%)`).join(', ')}.` : ''}
              </p>
              <StatusBar counts={stats.byStatus} total={stats.total} />
            </div>
          </div>
        </section>

        <section>
          <h2>2. Scope and methodology</h2>
          <p>The assessment covers {reqs.length} policy requirements consolidated from {data.obligations.length.toLocaleString()} obligations across {sources.length} applicable legislative, regulatory and standards sources. Each requirement was assessed for compliance status, capability maturity, design and operating effectiveness of its controls, and supporting evidence.</p>
          <div className="grid g-2">
            <table className="table"><thead><tr><th>Compliance status</th><th>Score</th></tr></thead><tbody>
              {STATUSES.filter((s) => s.score !== null).map((s) => <tr key={s.id}><td><StatusBadge status={s.id} /></td><td>{s.score}%</td></tr>)}
              <tr><td><StatusBadge status="na" /></td><td>Excluded</td></tr></tbody></table>
            <table className="table"><thead><tr><th>Maturity level</th><th>Description</th></tr></thead><tbody>
              {MATURITY.map((m) => <tr key={m.level}><td className="nowrap">{m.label}</td><td className="small">{m.desc}</td></tr>)}</tbody></table>
          </div>
        </section>

        <section>
          <h2>3. Results by target policy</h2>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Policy</th><th>Requirements</th><th>Assessed</th><th>Score</th><th style={{ width: '34%' }}>Status distribution</th></tr></thead>
            <tbody>{policies.map((p) => { const s = stats.byPolicy[p.code] || { total: 0, assessed: 0, byStatus: {} }; return (
              <tr key={p.code}><td><strong>{p.title}</strong><div className="small muted">{p.number}</div></td><td className="tabular">{s.total}</td><td className="tabular">{s.assessed}</td><td className="tabular"><strong>{s.score ?? '—'}{s.score !== null && s.score !== undefined ? '%' : ''}</strong></td><td><StatusBar counts={s.byStatus} total={s.total} showLegend={false} height={12} /></td></tr>
            ); })}</tbody>
          </table></div>
        </section>

        <section>
          <h2>4. Priority × compliance heatmap</h2>
          <div className="table-wrap"><table className="table heat">
            <thead><tr><th>Priority</th>{STATUSES.map((s) => <th key={s.id}>{s.label}</th>)}</tr></thead>
            <tbody>{priorities.map((p) => (
              <tr key={p}><td><PriorityBadge p={p} /></td>{STATUSES.map((s) => { const n = stats.byPriority[p]?.[s.id] || 0; const step = n ? Math.min(6, 1 + Math.floor((n / heatMax) * 5.99)) : 0; return (
                <td key={s.id} className="cell" style={{ background: SEQ[step], color: step >= 4 ? '#fff' : 'var(--ink)' }} title={`${p} · ${s.label}: ${n}`}>{n}</td>
              ); })}</tr>
            ))}</tbody>
          </table></div>
        </section>

        {maturityRows.length > 0 && (
          <section>
            <h2>5. Capability maturity</h2>
            <table className="table"><thead><tr><th>Policy</th><th>Assessed</th><th>Average current</th><th>Average target</th><th>Gap</th></tr></thead>
              <tbody>{maturityRows.map((m) => <tr key={m.code}><td>{m.title}</td><td className="tabular">{m.n}</td><td className="tabular">{m.cur.toFixed(1)}</td><td className="tabular">{m.tgt.toFixed(1)}</td><td className="tabular" style={{ color: m.tgt - m.cur > 0.05 ? 'var(--st-critical)' : 'var(--st-good)' }}>{(m.tgt - m.cur).toFixed(1)}</td></tr>)}</tbody></table>
          </section>
        )}

        <section>
          <h2>{maturityRows.length ? 6 : 5}. Key findings</h2>
          {findings.length ? (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Requirement</th><th>Status</th><th>Risk</th><th>Finding</th><th>Recommendation</th><th>Owner / due</th></tr></thead>
              <tbody>{findings.map((r) => { const a = assessments[r.id]; return (
                <tr key={r.id}><td><strong>{r.id}</strong><div className="small">{r.title}</div></td><td><StatusBadge a={a} /></td><td>{a.risk ? <PriorityBadge p={a.risk} /> : '—'}</td><td className="small">{a.finding || '—'}</td><td className="small">{a.recommendation || '—'}</td><td className="small">{a.owner || '—'}<div className="muted">{a.dueDate}</div></td></tr>
              ); })}</tbody>
            </table></div>
          ) : <p className="muted">No findings recorded.</p>}
        </section>

        <section>
          <h2>{maturityRows.length ? 7 : 6}. Remediation plan</h2>
          {remediation.length ? (
            <table className="table"><thead><tr><th>Due</th><th>Requirement</th><th>Action</th><th>Owner</th><th>Status</th></tr></thead>
              <tbody>{remediation.map((r) => { const a = assessments[r.id]; return (
                <tr key={r.id}><td className="nowrap tabular" style={{ color: a.dueDate < today ? 'var(--st-critical)' : undefined }}>{a.dueDate}{a.dueDate < today ? ' (overdue)' : ''}</td><td>{r.id} — {r.title}</td><td className="small">{a.recommendation || a.finding}</td><td>{a.owner}</td><td>{a.remediationStatus}</td></tr>
              ); })}</tbody></table>
          ) : <p className="muted">No remediation actions with due dates.</p>}
        </section>

        {detail && (
          <section>
            <h2>{maturityRows.length ? 8 : 7}. Detailed control results</h2>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Requirement</th><th>Policy</th><th>Priority</th><th>Status</th><th>Maturity</th><th>Design / operating</th><th>Controls</th><th>Evidence</th></tr></thead>
              <tbody>{reqs.map((r) => { const a = assessments[r.id] || {}; const ctrls = controlsFor(r); const ev = evidenceFor(r); return (
                <tr key={r.id}><td><strong>{r.id}</strong><div className="small">{r.title}</div></td><td className="small">{data.policies[r.policyCode]?.title}</td><td><PriorityBadge p={r.priority} /></td><td><StatusBadge a={a} /></td>
                  <td className="tabular">{a.maturity !== undefined && a.maturity !== '' ? `${a.maturity} → ${a.targetMaturity}` : '—'}</td><td className="small">{a.design || '—'} / {a.operating || '—'}</td>
                  <td className="tabular small">{ctrls.filter((c) => a.controls?.[c.key] === 'Implemented').length}/{ctrls.length} implemented</td>
                  <td className="tabular small">{ev.filter((_, i) => a.evidence?.[i]?.provided).length}/{ev.length}</td></tr>
              ); })}</tbody>
            </table></div>
          </section>
        )}

        <section>
          <h2>Appendix — Applicable obligation sources</h2>
          <table className="table"><thead><tr><th>Source</th><th>Applicability</th><th>Publisher</th></tr></thead>
            <tbody>{sources.map((s) => <tr key={s.name}><td>{s.name}</td><td><LevelBadge level={s.level} /></td><td className="small">{s.publisher}</td></tr>)}</tbody></table>
          <p className="small muted">Prepared by CTO Consulting using the Regulatory Assessment Tool. Results reflect the evidence available at the assessment date.</p>
        </section>
      </div>
    </div>
  );
}
