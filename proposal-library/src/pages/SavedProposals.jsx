import { useMemo, useState } from 'react';
import { StatusBadge, DueLabel } from '../components/ProposalBits.jsx';
import { CLOSED, STATUSES, daysUntil } from '../lib/proposal.js';
import { fmtDate, fmtAgo } from '../lib/format.js';

const VIEWS = [['open', 'Open'], ['closed', 'Closed'], ['all', 'All']];

export default function SavedProposals({ proposals, onOpen, onDuplicate, onDelete }) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState('open');
  const [status, setStatus] = useState('');

  const all = useMemo(() => Object.values(proposals), [proposals]);
  const open = all.filter((p) => !CLOSED.has(p.details.status));
  const dueSoon = open.filter((p) => { const n = daysUntil(p.details.dueDate); return n != null && n >= 0 && n <= 14 && !['Submitted', 'Shortlisted'].includes(p.details.status); });
  const awaiting = all.filter((p) => ['Submitted', 'Shortlisted'].includes(p.details.status));
  const won = all.filter((p) => p.details.status === 'Won');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((p) => (view === 'open' ? !CLOSED.has(p.details.status) : view === 'closed' ? CLOSED.has(p.details.status) : true))
      .filter((p) => !status || p.details.status === status)
      .filter((p) => !q || [p.details.title, p.details.client, p.details.reference, p.details.lead].join(' ').toLowerCase().includes(q))
      // Soonest deadline first; proposals without a due date go last.
      .sort((a, b) => (a.details.dueDate || '9999').localeCompare(b.details.dueDate || '9999') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [all, query, view, status]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Proposals</div>
          <h1>Saved proposals</h1>
          <p>Every proposal recorded with <b>New proposal</b>, soonest deadline first. Open one to continue editing it.</p>
        </div>
        <a className="btn btn-primary" href="#/new-proposal">+ New proposal</a>
      </div>

      <div className="tiles">
        <Tile label="Open" value={open.length} sub="not yet won, lost or withdrawn" onClick={() => { setView('open'); setStatus(''); }} />
        <Tile label="Due in 14 days" value={dueSoon.length} sub="still to be submitted" accent={dueSoon.length > 0} />
        <Tile label="Awaiting decision" value={awaiting.length} sub="submitted or shortlisted" />
        <Tile label="Won" value={won.length} sub={all.length ? `of ${all.length} recorded` : 'none yet'} onClick={() => { setView('all'); setStatus('Won'); }} />
      </div>

      <section className="card">
        <div className="filters">
          <input type="search" placeholder="Search title, client, reference or bid lead" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search proposals" />
          <div className="seg" role="group" aria-label="Show">
            {VIEWS.map(([id, label]) => <button key={id} className={view === id ? 'on' : ''} aria-pressed={view === id} onClick={() => { setView(id); setStatus(''); }}>{label}</button>)}
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Any status</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table className="table proposals-table">
            <thead>
              <tr><th>Proposal</th><th>Client</th><th>Status</th><th>Submission due</th><th className="num">Docs</th><th className="num">Team</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => onOpen(p.id)}>
                  <td>
                    <a href={`#/proposal/${p.id}`} className="ptitle" onClick={(e) => e.stopPropagation()}>{p.details.title || 'Untitled proposal'}</a>
                    {(p.details.reference || p.details.type) && <div className="muted small">{[p.details.type, p.details.reference].filter(Boolean).join(' · ')}</div>}
                  </td>
                  <td>{p.details.client || <span className="muted">—</span>}</td>
                  <td><StatusBadge status={p.details.status} /></td>
                  <td className="nowrap">{p.details.dueDate ? <>{fmtDate(p.details.dueDate)}<div><DueLabel date={p.details.dueDate} status={p.details.status} /></div></> : <span className="muted">—</span>}</td>
                  <td className="num tabular">{p.files.length}</td>
                  <td className="num tabular">{p.team.length}</td>
                  <td className="small nowrap">{fmtAgo(p.updatedAt)}{p.updatedBy && <div className="muted">{p.updatedBy}</div>}</td>
                  <td className="nowrap actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm btn-ghost" onClick={() => onDuplicate(p)} title="Start a new proposal from a copy of this one">Duplicate</button>
                    <button className="btn btn-sm btn-ghost btn-danger-ghost" onClick={() => onDelete(p)}>Delete</button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={8} className="empty">
                  {all.length ? 'No proposals match these filters.' : <>No proposals yet. <a href="#/new-proposal">Record your first proposal</a>.</>}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Tile({ label, value, sub, accent, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`card tile ${accent ? 'accent' : ''}`} onClick={onClick}>
      <span className="tile-label">{label}</span>
      <span className="tile-value tabular">{value}</span>
      <span className="tile-sub">{sub}</span>
    </Tag>
  );
}
