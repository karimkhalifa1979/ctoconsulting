import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP } from '../lib/store.jsx';
import { myWork, isActive, riskFlags } from '../core/analytics.js';
import { teamRole } from '../core/permissions.js';
import { Card, PageHead, Empty } from '../../components/ui.jsx';
import { Icon, Closing, StagePill, When, Avatar } from '../components/common.jsx';
import { fmtDate, todayISO, daysBetween } from '../core/util.js';

const KIND = {
  section: ['review', 'var(--series-1)', '#e3eefc'], review: ['approve', '#a86b00', '#fff4d9'], approval: ['shield', '#a52a2a', '#fbe3e3'], mention: ['users', '#6230b5', '#f1e9fd'],
  availability: ['clock', '#0b7d88', 'var(--brand-teal-soft)'], library: ['library', '#11724f', '#e3f5e4'], stage: ['flow', 'var(--brand-navy)', '#e6ecf5'],
};

export default function MyWork() {
  const { view, me, dispatch } = useP();
  const [note, setNote] = useState({});
  const items = useMemo(() => myWork(view, me.id), [view, me.id]);
  const open = items.filter((i) => !i.done);
  const overdue = open.filter((i) => i.overdue);
  const approvals = open.filter((i) => i.kind === 'approval');
  const reviews = open.filter((i) => i.kind === 'review');
  const myBids = view.bids.filter((b) => isActive(b) && teamRole(b, me.id)).sort((a, b) => (a.closing?.date || '9').localeCompare(b.closing?.date || '9'));
  const hour = Number(new Date().toLocaleString('en-AU', { hour: 'numeric', hour12: false, timeZone: 'Australia/Sydney' }));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const recent = [...view.notifications].reverse().slice(0, 6);
  return (
    <div className="stack">
      <PageHead eyebrow="My work" title={`${greeting}, ${me.name.split(' ')[0]}`}>Sections, reviews and approvals assigned to you, sorted by due date with overdue items first.</PageHead>
      <div className="stat-row">
        <div className="card stat accent"><div className="label">Open items</div><div className="value tabular">{open.length}</div><div className="sub">Assigned to you</div></div>
        <div className="card stat"><div className="label">Overdue</div><div className="value tabular" style={{ color: overdue.length ? 'var(--st-critical)' : undefined }}>{overdue.length}</div><div className="sub">Escalated to the bid manager after {view.settings.escalationDays} days</div></div>
        <div className="card stat"><div className="label">Approvals waiting</div><div className="value tabular">{approvals.length}</div><div className="sub">Gates you can decide</div></div>
        <div className="card stat"><div className="label">Reviews waiting</div><div className="value tabular">{reviews.length}</div><div className="sub">Sections ready for your review</div></div>
      </div>
      <div className="split-3-2">
        <Card title="Assigned to me" subtitle={`${open.length} open${items.length > open.length ? ` · ${items.length - open.length} waiting on others` : ''}`} pad={false}>
          {!items.length && <Empty title="Nothing assigned to you">When a bid manager assigns you a section, review or approval it appears here.</Empty>}
          {items.map((it, i) => {
            const [icon, fg, bg] = KIND[it.kind] || KIND.section;
            const days = it.due ? daysBetween(todayISO(), it.due) : null;
            if (it.kind === 'availability') {
              const a = it.availability;
              return (
                <div key={`a${i}`} className="work-item" style={{ gridTemplateColumns: '34px 1fr' }}>
                  <span className="ic" style={{ background: bg, color: fg }}><Icon name={icon} /></span>
                  <div>
                    <div className="t">{it.title}</div>
                    <div className="d">{it.detail} · closes {fmtDate(a.closing?.date)}</div>
                    <div className="row" style={{ marginTop: 8 }}>
                      <input type="text" placeholder="Note for the bid manager (optional)" value={note[a.lineId] || ''} onChange={(e) => setNote({ ...note, [a.lineId]: e.target.value })} style={{ flex: 1, minWidth: 180 }} />
                      <button className="btn btn-sm btn-primary" onClick={() => dispatch('staffing.respond', { bidId: a.bidId, lineId: a.lineId, response: 'confirmed', note: note[a.lineId] }, { success: 'Availability confirmed' })}>Confirm availability</button>
                      <button className="btn btn-sm" onClick={() => dispatch('staffing.respond', { bidId: a.bidId, lineId: a.lineId, response: 'declined', note: note[a.lineId] }, { success: 'Declined' })}>Decline</button>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <Link key={`${it.link}${i}`} to={it.link} className={`work-item ${it.overdue ? 'overdue' : ''}`} style={it.done ? { opacity: 0.6 } : undefined}>
                <span className="ic" style={{ background: bg, color: fg }}><Icon name={icon} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{it.title}</div>
                  <div className="d clamp-2">{it.bid ? `${it.bid.ref} · ${it.bid.title} · ` : ''}{it.detail}</div>
                </div>
                <div className="right small due" style={{ whiteSpace: 'nowrap' }}>{it.due ? (<>{fmtDate(it.due)}<div className="mini">{it.overdue ? `${-days} days overdue` : days === 0 ? 'due today' : days > 0 ? `in ${days} days` : ''}</div></>) : ''}</div>
              </Link>
            );
          })}
        </Card>
        <div className="stack">
          <Card title="My bids" subtitle="Active bids where you are on the team" pad={false}>
            {!myBids.length && <Empty title="No active bids">You are not on the team for any active bid.</Empty>}
            {myBids.map((b) => {
              const flags = riskFlags(b);
              return (
                <Link key={b.id} to={`/bids/${b.id}`} className="work-item" style={{ gridTemplateColumns: '1fr auto' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="t clamp-2">{b.title}</div>
                    <div className="d">{b.ref} · {view.clients.find((c) => c.id === b.clientId)?.name}</div>
                    {flags.length > 0 && <div className="mini" style={{ color: 'var(--st-critical)' }}>{flags.join(' · ')}</div>}
                  </div>
                  <div className="right"><StagePill stage={b.stage} /><div className="mini" style={{ marginTop: 4 }}><Closing closing={b.closing} short /></div></div>
                </Link>
              );
            })}
          </Card>
          <Card title="Recent notifications" pad={false} actions={<Link className="btn btn-sm" to="/notifications">All</Link>}>
            {!recent.length && <Empty title="No notifications" />}
            {recent.map((n) => (
              <Link key={n.id} to={n.link || '/notifications'} className="work-item" style={{ gridTemplateColumns: '28px 1fr' }}>
                <Avatar name={n.title} size="sm" />
                <div style={{ minWidth: 0 }}><div className="t small" style={{ fontWeight: n.read ? 500 : 700 }}>{n.title}</div><div className="d"><When at={n.at} /></div></div>
              </Link>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
