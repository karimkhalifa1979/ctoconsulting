import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP, useCan } from '../../lib/store.jsx';
import { Card, Empty } from '../../../components/ui.jsx';
import { SectionStatus, Person, Avatar } from '../../components/common.jsx';
import { SectionBar } from './Overview.jsx';
import { SECTION_STATUSES } from '../../core/constants.js';
import { aiPendingCount, flagCount, sectionApproval } from '../../core/workflow.js';
import { htmlToText, wordCount, fmtDate, todayISO } from '../../core/util.js';

// All sections of the response with their status, owner, due date and what still needs doing (WF-03).
export default function Sections({ bid }) {
  const { me, view } = useP();
  const can = useCan();
  const [filter, setFilter] = useState('all');
  const [layout, setLayout] = useState('list');
  const today = todayISO();
  const rows = useMemo(() => bid.sections.map((s) => {
    const words = wordCount(htmlToText(s.content || ''));
    const reqs = bid.requirements.filter((r) => (r.sectionIds || []).includes(s.id) && !r.excluded);
    const appr = sectionApproval(bid, s);
    return {
      s, words, reqs, appr, ai: aiPendingCount(s.content), flags: flagCount(s.content), comments: (s.comments || []).filter((c) => c.status === 'open').length,
      overdue: s.due && s.due < today && !['approved', 'locked'].includes(s.status), over: s.wordLimit && words > s.wordLimit, lock: view.locks?.[s.id],
    };
  }), [bid, today, view.locks]);
  const shown = rows.filter((r) => {
    if (filter === 'mine') return r.s.ownerId === me.id || (r.s.contributors || []).includes(me.id);
    if (filter === 'review') return (r.s.reviewers || []).includes(me.id) && r.s.status === 'in_review';
    if (filter === 'attention') return r.overdue || r.ai || r.flags || r.comments || r.over;
    if (SECTION_STATUSES.some((x) => x.id === filter)) return r.s.status === filter;
    return true;
  });
  if (!bid.sections.length) {
    return <Empty title="No response outline yet">{can('planSections', { bid }) ? <>Build the outline from the client’s structure or a standard outline on the <Link to={`/bids/${bid.id}/plan`}>Plan</Link> tab.</> : 'The bid manager has not built the outline yet.'}</Empty>;
  }
  return (
    <div className="stack">
      <Card title="Progress" subtitle={`${bid.sections.length} sections · ${rows.reduce((n, r) => n + r.words, 0).toLocaleString('en-AU')} words`}>
        <SectionBar bid={bid} />
      </Card>
      <div className="filters">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter sections">
          <option value="all">All sections</option>
          <option value="mine">Mine (owner or contributor)</option>
          <option value="review">Waiting for my review</option>
          <option value="attention">Needs attention</option>
          {SECTION_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <div className="row" role="group" aria-label="Layout">
          <button className={`btn btn-sm ${layout === 'list' ? 'btn-navy' : ''}`} aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>List</button>
          <button className={`btn btn-sm ${layout === 'board' ? 'btn-navy' : ''}`} aria-pressed={layout === 'board'} onClick={() => setLayout('board')}>Board</button>
        </div>
        <span className="muted small">{shown.length} shown</span>
      </div>
      {layout === 'list' ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Section</th><th>Status</th><th>Owner</th><th>Due</th><th className="right">Words</th><th>Requirements</th><th>Review</th><th>Attention</th></tr></thead>
              <tbody>
                {shown.map(({ s, words, reqs, appr, ai, flags, comments, overdue, over, lock }) => (
                  <tr key={s.id}>
                    <td className="tabular muted">{s.order}</td>
                    <td style={{ paddingLeft: s.parentId ? 26 : undefined }}>
                      <Link to={`/bids/${bid.id}/sections/${s.id}`} className="strong">{s.title}</Link>
                      {s.commercial && <span className="pill" style={{ marginLeft: 6 }}>Commercial</span>}
                      {lock && <div className="mini">✎ {view.users.find((u) => u.id === lock.userId)?.name} is editing</div>}
                    </td>
                    <td><SectionStatus status={s.status} /></td>
                    <td>{s.ownerId ? <Person id={s.ownerId} /> : <span className="muted">Unassigned</span>}</td>
                    <td className={overdue ? 'strong' : ''} style={overdue ? { color: 'var(--st-critical)' } : undefined}>{s.due ? fmtDate(s.due) : '—'}{overdue ? ' · overdue' : ''}</td>
                    <td className="right tabular" style={over ? { color: 'var(--st-critical)', fontWeight: 700 } : undefined}>{words}{s.wordLimit ? ` / ${s.wordLimit}` : ''}</td>
                    <td className="small">{reqs.length ? reqs.slice(0, 5).map((r) => r.ref).join(', ') + (reqs.length > 5 ? ` +${reqs.length - 5}` : '') : <span className="muted">—</span>}</td>
                    <td>
                      <span className="avatar-stack">{(s.reviewers || []).map((id) => <Avatar key={id} id={id} size="sm" title={`${view.users.find((u) => u.id === id)?.name}${appr.current.some((a) => a.by === id) ? ' approved' : ''}`} />)}</span>
                      {s.status === 'in_review' && <div className="mini">{appr.outstanding.length && appr.outstanding[0] !== 'any' ? `${appr.outstanding.length} to approve` : 'Ready to approve'}</div>}
                    </td>
                    <td className="small">
                      {ai > 0 && <span className="pill ai">{ai} AI</span>} {flags > 0 && <span className="pill warn">{flags} evidence</span>} {comments > 0 && <span className="pill">{comments} comment{comments === 1 ? '' : 's'}</span>}
                      {!ai && !flags && !comments && !overdue && !over && <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="kanban" style={{ gridTemplateColumns: `repeat(${SECTION_STATUSES.length}, minmax(200px, 1fr))` }}>
          {SECTION_STATUSES.map((st) => (
            <div key={st.id} className="kan-col">
              <h4><span>{st.label}</span> <span className="muted">{shown.filter((r) => r.s.status === st.id).length}</span></h4>
              {shown.filter((r) => r.s.status === st.id).map(({ s, words, ai, flags, comments, overdue }) => (
                <Link key={s.id} to={`/bids/${bid.id}/sections/${s.id}`} className="kan-card">
                  <div className="t">{s.title}</div>
                  <div className="c">{s.ownerId ? view.users.find((u) => u.id === s.ownerId)?.name : 'Unassigned'} · due {s.due ? fmtDate(s.due) : '—'}{overdue ? ' (overdue)' : ''}</div>
                  <div className="f">{words}{s.wordLimit ? ` / ${s.wordLimit}` : ''} words{ai ? ` · ${ai} AI` : ''}{flags ? ` · ${flags} evidence flags` : ''}{comments ? ` · ${comments} comments` : ''}</div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
