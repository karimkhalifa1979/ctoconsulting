import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP } from '../../lib/store.jsx';
import { Card, Empty, Stat } from '../../../components/ui.jsx';
import { SectionStatus, Person, When, download, MIME, safeFile } from '../../components/common.jsx';
import { REVIEW_ROUNDS } from '../../core/constants.js';
import { sectionApproval } from '../../core/workflow.js';

// Colour for a 0–10 score: red (weak) through amber to green (strong).
export function heat(v) {
  if (v === null || v === undefined) return { background: '#f3f5f8', color: 'var(--ink-3)' };
  const stops = [[0, [180, 35, 24]], [5, [230, 162, 25]], [7, [120, 180, 90]], [10, [23, 128, 61]]];
  let i = 0;
  while (i < stops.length - 2 && v > stops[i + 1][0]) i++;
  const [a, ca] = stops[i], [b, cb] = stops[i + 1];
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  const c = ca.map((x, k) => Math.round(x + (cb[k] - x) * t));
  const light = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114 > 150;
  return { background: `rgb(${c.join(',')})`, color: light ? '#1f2937' : '#fff' };
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Review heatmap (WF-09): average reviewer scores per section against each evaluation criterion.
export default function Reviews({ bid }) {
  const { view } = useP();
  const [round, setRound] = useState('all');
  const [current, setCurrent] = useState(false);
  const criteria = bid.criteria || [];
  const grid = useMemo(() => bid.sections.map((s) => {
    const scores = (s.scores || []).filter((x) => (round === 'all' || x.round === round) && (!current || x.v === s.v));
    const cells = criteria.map((c) => avg(scores.map((x) => x.scores[c.id]).filter((v) => typeof v === 'number')));
    const weighted = (() => {
      const pairs = criteria.map((c, i) => [cells[i], Number(c.weight) || 0]).filter(([v]) => v !== null);
      const w = pairs.reduce((n, [, x]) => n + x, 0);
      return pairs.length ? (w ? pairs.reduce((n, [v, x]) => n + v * x, 0) / w : avg(pairs.map(([v]) => v))) : null;
    })();
    return { s, scores, cells, weighted, reviewers: [...new Set(scores.map((x) => x.by))] };
  }), [bid, criteria, round, current]);
  const colAvg = criteria.map((c, i) => avg(grid.map((g) => g.cells[i]).filter((v) => v !== null)));
  const overall = avg(grid.map((g) => g.weighted).filter((v) => v !== null));
  const weakest = grid.filter((g) => g.weighted !== null).sort((a, b) => a.weighted - b.weighted).slice(0, 3);
  const reviewers = [...new Set(bid.sections.flatMap((s) => [...(s.reviewers || []), ...(s.scores || []).map((x) => x.by)]))];
  const comments = bid.sections.flatMap((s) => (s.scores || []).filter((x) => x.comment && (round === 'all' || x.round === round)).map((x) => ({ ...x, section: s })));

  const exportCsv = () => {
    const head = ['Section', ...criteria.map((c) => `${c.name}${c.weight ? ` (${c.weight}%)` : ''}`), 'Weighted'];
    const rows = grid.map((g) => [g.s.title, ...g.cells.map((v) => (v === null ? '' : v.toFixed(1))), g.weighted === null ? '' : g.weighted.toFixed(1)]);
    const csv = [head, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download(new Blob([csv], { type: MIME.csv }), `${safeFile(bid.ref)}_review_scores.csv`);
  };

  if (!bid.sections.length) return <Empty title="Nothing to review yet">Build the response outline first.</Empty>;
  if (!criteria.length) return <Empty title="No evaluation criteria">Add the client’s evaluation criteria on the <Link to={`/bids/${bid.id}/requirements`}>Compliance matrix</Link> tab, so reviewers can score each section against them.</Empty>;
  return (
    <div className="stack">
      <div className="filters">
        <select value={round} onChange={(e) => setRound(e.target.value)} aria-label="Review round">
          <option value="all">All review rounds</option>
          {REVIEW_ROUNDS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <label className="check small"><input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} /><span>Only scores of the current version</span></label>
        <button className="btn btn-sm" onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="stat-row">
        <Stat label="Weighted average" value={overall === null ? '—' : overall.toFixed(1)} sub="out of 10" accent />
        <Stat label="Sections scored" value={`${grid.filter((g) => g.scores.length).length} / ${bid.sections.length}`} />
        <Stat label="Reviewers" value={new Set(grid.flatMap((g) => g.reviewers)).size} />
        <Stat label="Weakest section" value={weakest[0] ? weakest[0].weighted.toFixed(1) : '—'} sub={weakest[0]?.s.title} />
      </div>
      <Card title="Score heatmap" subtitle="Average reviewer score (0–10) for each section against each evaluation criterion. Weak cells show where to strengthen the response before submission." pad={false}
        actions={<span className="heat-legend">0 {[0, 2.5, 5, 7, 8.5, 10].map((v) => <span key={v} style={{ background: heat(v).background }} />)} 10</span>}>
        <div className="table-wrap">
          <table className="table heatmap">
            <thead><tr><th>Section</th>{criteria.map((c) => <th key={c.id} className="center" title={c.description || c.name}>{c.name}{c.weight ? <div className="mini">{c.weight}%</div> : null}</th>)}<th className="center">Weighted</th><th>Scored by</th></tr></thead>
            <tbody>
              {grid.map((g) => (
                <tr key={g.s.id}>
                  <td><Link to={`/bids/${bid.id}/sections/${g.s.id}`}>{g.s.title}</Link> <SectionStatus status={g.s.status} /></td>
                  {g.cells.map((v, i) => <td key={criteria[i].id} className="hm" style={heat(v)} title={v === null ? 'Not scored' : `${criteria[i].name}: ${v.toFixed(1)}`}>{v === null ? '·' : v.toFixed(1)}</td>)}
                  <td className="hm" style={heat(g.weighted)}>{g.weighted === null ? '·' : g.weighted.toFixed(1)}</td>
                  <td className="small">{g.reviewers.map((id) => view.users.find((u) => u.id === id)?.name.split(' ')[0]).join(', ') || <span className="muted">—</span>}</td>
                </tr>
              ))}
              <tr>
                <td className="strong">Criterion average</td>
                {colAvg.map((v, i) => <td key={criteria[i].id} className="hm" style={heat(v)}>{v === null ? '·' : v.toFixed(1)}</td>)}
                <td className="hm" style={heat(overall)}>{overall === null ? '·' : overall.toFixed(1)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <div className="split">
        <Card title="Reviewer progress" subtitle="Assigned reviews and approvals of the current version" pad={false}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Reviewer</th><th className="right">Assigned</th><th className="right">Approved</th><th className="right">Scored</th></tr></thead>
              <tbody>
                {reviewers.map((id) => {
                  const assigned = bid.sections.filter((s) => (s.reviewers || []).includes(id));
                  const approved = assigned.filter((s) => sectionApproval(bid, s).current.some((a) => a.by === id));
                  const scored = bid.sections.filter((s) => (s.scores || []).some((x) => x.by === id && (round === 'all' || x.round === round)));
                  return <tr key={id}><td><Person id={id} /></td><td className="right tabular">{assigned.length}</td><td className="right tabular">{approved.length}</td><td className="right tabular">{scored.length}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Reviewer comments" subtitle="Notes left with scores" pad={false}>
          {comments.length ? comments.slice(-12).reverse().map((c) => (
            <div key={c.id} className="work-item" style={{ gridTemplateColumns: '1fr auto' }}>
              <div><div className="t"><Link to={`/bids/${bid.id}/sections/${c.section.id}`}>{c.section.title}</Link></div><div className="d">“{c.comment}” — {view.users.find((u) => u.id === c.by)?.name}, {REVIEW_ROUNDS.find((r) => r.id === c.round)?.label.toLowerCase()}</div></div>
              <div className="mini"><When at={c.at} /></div>
            </div>
          )) : <p className="muted small" style={{ padding: '0 18px' }}>No comments with scores yet. Reviewers score sections from the section editor (Checks tab).</p>}
        </Card>
      </div>
    </div>
  );
}
