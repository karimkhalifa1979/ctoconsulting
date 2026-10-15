import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp, personName } from '../lib/store.jsx';
import { summaries } from '../lib/portfolio.js';
import { PageHead, Card, Pill, Select, Guidance } from '../components/ui.jsx';
import BusinessCaseBuilder from '../components/BusinessCaseBuilder.jsx';
import { fmtDate, money } from '../lib/util.js';

const STATUS = { draft: ['Draft', 'none'], 'in-review': ['In review', 'warning'], submitted: ['Submitted', 'progress'], locked: ['Locked', 'good'] };

export default function BusinessCasePage() {
  const { ws } = useApp();
  const nav = useNavigate();
  const s = summaries(ws);
  const list = ws.programs.filter((p) => p.state !== 'withdrawn');
  const [id, setId] = useState(list.find((p) => p.id === 'prg-cis')?.id || list[0]?.id || '');
  const program = ws.programs.find((p) => p.id === id);
  return (
    <div className="stack">
      <PageHead eyebrow="Value" title="Business case builder" actions={<Link className="btn" to="/programs">+ New program</Link>}>
        Generate a complete business case from what has been entered — strategy, benefits map, benefits register, costs, value assessment, accountabilities and the Monte Carlo simulation. The narrative is drafted for you and stays editable; the numbers stay linked to live data until the version is locked at a gate.
      </PageHead>
      <Card pad={false} title="Value cases across the portfolio" subtitle="Evergreen: refreshed before every gate (VCS-02)">
        <div className="table-wrap"><table className="table compact">
          <thead><tr><th>Program</th><th>Sponsor</th><th>Latest version</th><th>Status</th><th>Created</th><th className="num">Review cycles</th><th className="num">NPV now</th><th /></tr></thead>
          <tbody>{list.map((p) => {
            const vc = s.get(p.id).vc;
            return (
              <tr key={p.id} className={`clickable ${p.id === id ? 'selected' : ''}`} onClick={() => setId(p.id)}>
                <td><strong>{p.code}</strong> {p.name}</td><td>{personName(ws, p.sponsorId)}</td><td>{vc ? `v${vc.version} · ${vc.gate}` : '—'}</td>
                <td>{vc ? <Pill tone={STATUS[vc.status][1]}>{STATUS[vc.status][0]}</Pill> : <Pill tone="none">Not started</Pill>}</td>
                <td>{vc ? fmtDate(vc.createdAt) : '—'}</td><td className="num">{vc?.reviewCycles ?? '—'}</td><td className="num">{money(s.get(p.id).fin.npv)}</td>
                <td><button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); nav(`/programs/${p.id}/business-case`); }}>Open in program</button></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </Card>
      <div className="row"><span className="mini">Showing:</span><Select value={id} onChange={setId} options={list.map((p) => [p.id, `${p.code} ${p.name}`])} aria-label="Program" /></div>
      {program ? <BusinessCaseBuilder program={program} /> : <Guidance>Create a program first.</Guidance>}
    </div>
  );
}
