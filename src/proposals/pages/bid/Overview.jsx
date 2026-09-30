import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP } from '../../lib/store.jsx';
import { Card } from '../../../components/ui.jsx';
import { Blockers, Person, GatePill, When, Closing, download, MIME, safeFile, Icon } from '../../components/common.jsx';
import { bidHealth, riskFlags } from '../../core/analytics.js';
import { SECTION_STATUSES, STAGES, GATES, stageLabel, roleLabel } from '../../core/constants.js';
import { can } from '../../core/permissions.js';
import { fmtDate, fmtZoned, zonedToDate, todayISO } from '../../core/util.js';
import { nextStageId } from '../../core/workflow.js';
import { buildIcs } from '../../core/schedule.js';

export function SectionBar({ bid }) {
  const total = bid.sections.length || 1;
  return (
    <div>
      <div className="stackbar" style={{ height: 14 }}>
        {SECTION_STATUSES.map((s) => { const n = bid.sections.filter((x) => x.status === s.id).length; return n ? <span key={s.id} title={`${s.label}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: s.color }} /> : null; })}
      </div>
      <div className="legend">{SECTION_STATUSES.map((s) => { const n = bid.sections.filter((x) => x.status === s.id).length; return n ? <span key={s.id}><i style={{ background: s.color }} />{s.label} <strong className="tabular">{n}</strong></span> : null; })}</div>
    </div>
  );
}

export default function Overview({ bid }) {
  const { view, me, dispatch, query } = useP();
  const [events, setEvents] = useState([]);
  const h = bidHealth(bid);
  const flags = riskFlags(bid);
  const blockers = bid._d.blockers;
  const next = nextStageId(view, bid);
  const canPlan = can(view, me.id, 'planSections', { bid });
  useEffect(() => { query('audit', { bidId: bid.id, limit: 8 }).then((r) => setEvents((r?.events || []).slice(-8).reverse())).catch(() => {}); }, [bid.id, view.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const stage = STAGES.find((s) => s.id === bid.stage);
  const closeAt = bid.closing?.date ? zonedToDate(bid.closing.date, bid.closing.time, bid.closing.tz) : null;
  const today = todayISO();
  const team = [[bid.partnerId, 'Accountable partner'], [bid.bidManagerId, 'Bid manager'], ...(bid.members || []).map((m) => [m.userId, roleLabel(m.role) || m.role])];
  const authors = [...new Set(bid.sections.map((s) => s.ownerId).filter(Boolean))].filter((id) => !team.some(([t]) => t === id));
  return (
    <div className="stack">
      {flags.length > 0 && <div className="callout warn"><strong>At risk:</strong> {flags.join(' · ')}</div>}
      {bid.archived && <div className="callout"><strong>Archived{bid.archived.noBid ? ' (no-bid)' : ''}:</strong> {bid.archived.reason}</div>}
      <div className="split-3-2">
        <div className="stack">
          <Card title={stage ? `Stage ${stage.n}: ${stage.label}` : stageLabel(bid.stage)} subtitle={stage ? `${stage.what}. Owner: ${stage.owner}.` : ''}
            actions={canPlan && next && !['archived', 'closed'].includes(bid.stage) ? <button className="btn btn-primary" disabled={blockers.length > 0} onClick={() => dispatch('bid.advance', { bidId: bid.id }, { success: `Moved to ${stageLabel(next)}` })}>Move to {stageLabel(next)}</button> : null}>
            {stage && <p className="small" style={{ marginTop: 0 }}><strong>Exit condition:</strong> {stage.exit}</p>}
            {blockers.length ? <Blockers items={blockers} title="Still to do before moving on" /> : !['archived', 'closed'].includes(bid.stage) && <div className="callout">All exit conditions for this stage are met.</div>}
          </Card>
          <Card title="Bid health">
            <div className="stat-row" style={{ marginBottom: 14 }}>
              <div><div className="mini">Days to deadline</div><div className="num-big">{h.daysToClose ?? '—'}</div></div>
              <div><div className="mini">Mandatory mapped</div><div className="num-big">{h.coverage === null ? '—' : `${Math.round(h.coverage * 100)}%`}</div></div>
              <div><div className="mini">Avg review score</div><div className="num-big">{h.avgScore === null ? '—' : h.avgScore.toFixed(1)}</div></div>
              <div><div className="mini">Open comments</div><div className="num-big">{h.openComments}</div></div>
            </div>
            {bid.sections.length ? <SectionBar bid={bid} /> : <p className="muted small">No response outline yet. Build it on the Plan tab.</p>}
            <div className="row" style={{ marginTop: 12 }}>
              <Link className="btn btn-sm" to={`/bids/${bid.id}/sections`}>Sections</Link>
              <Link className="btn btn-sm" to={`/bids/${bid.id}/requirements`}>Compliance matrix</Link>
              <Link className="btn btn-sm" to={`/bids/${bid.id}/reviews`}>Review scores</Link>
            </div>
          </Card>
          <Card title="Approval gates" pad={false}>
            {GATES.map((g) => {
              const d = bid._d.gates[g.id];
              return (
                <div key={g.id} className="work-item" style={{ gridTemplateColumns: '26px 1fr auto' }}>
                  <span className={`diamond ${d.status === 'passed' ? 'passed' : d.status === 'pending' ? 'pending' : d.status === 'rejected' ? 'rejected' : ''}`} />
                  <div><div className="t">Gate {g.n}: {g.label}</div><div className="d">{d.reqs.map((r) => `${r.count} × ${roleLabel(r.role)}${r.reasons.length > 1 ? ` (${r.reasons.slice(1).join('; ')})` : ''}`).join(' and ')}</div></div>
                  <div className="row"><GatePill status={d.status} /><Link className="btn btn-sm" to={`/bids/${bid.id}/${g.id === 'g1' ? 'qualify' : 'approvals'}`}>Open</Link></div>
                </div>
              );
            })}
          </Card>
          <Card title="Recent activity" subtitle="From the immutable audit trail" pad={false} actions={<Link className="btn btn-sm" to={`/bids/${bid.id}/activity`}>Full trail</Link>}>
            {events.map((e) => <div key={e.seq} className="work-item" style={{ gridTemplateColumns: '28px 1fr auto' }}><Person id={e.actor} /><div className="small">{e.label}</div><div className="mini"><When at={e.at} /></div></div>)}
          </Card>
        </div>
        <div className="stack">
          <Card title="Key dates" subtitle="Deadlines shown in AEST/AEDT and the client’s time zone" actions={<button className="btn btn-sm dl" onClick={() => download(buildIcs(bid), `${safeFile(bid.ref)}_milestones.ics`, MIME.ics)}><Icon name="cal" size={14} />.ics</button>}>
            <dl className="kv">
              <dt>Closing</dt><dd><strong>{closeAt ? fmtZoned(closeAt, 'Australia/Sydney') : '—'}</strong>{bid.closing?.tz && bid.closing.tz !== 'Australia/Sydney' && <div className="mini">Client time: {fmtZoned(closeAt, bid.closing.tz)}</div>}</dd>
              {(bid.extraction?.dates || []).filter((d) => !/closing/i.test(d.label)).map((d) => <Fragment key={d.id}><dt>{d.label}</dt><dd>{fmtDate(d.date)}{d.time ? ` ${d.time}` : ''}{d.date < today ? <span className="mini"> · past</span> : ''}</dd></Fragment>)}
            </dl>
            <hr className="hr" />
            <div className="mini strong" style={{ marginBottom: 6 }}>Milestones (back-scheduled from the deadline)</div>
            {(bid.plan?.milestones || []).map((m) => (
              <label key={m.id} className="check small" style={{ padding: '3px 0' }}>
                <input type="checkbox" checked={m.done} disabled={!canPlan} onChange={() => dispatch('plan.update', { bidId: bid.id, milestones: bid.plan.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) }, { quiet: true })} />
                <span style={{ flex: 1, textDecoration: m.done ? 'line-through' : 'none', color: !m.done && m.date < today ? 'var(--st-critical)' : undefined }}>{m.label}</span>
                <span className="mini tabular">{fmtDate(m.date)}</span>
              </label>
            ))}
            {canPlan && bid.closing?.date && <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => dispatch('plan.reschedule', { bidId: bid.id, fromToday: true }, { success: 'Milestones back-scheduled from the deadline' })}>Re-plan from today</button>}
          </Card>
          <Card title="Bid team" subtitle="Team membership controls access to this bid">
            {team.map(([id, role]) => <div key={`${id}${role}`} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}><Person id={id} /><span className="mini">{role}</span></div>)}
            {authors.map((id) => <div key={id} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}><Person id={id} /><span className="mini">Section owner</span></div>)}
            {bid.ethicalWall?.users?.length > 0 && <div className="callout" style={{ marginTop: 10 }}><strong>Ethical wall:</strong> {bid.ethicalWall.users.map((u) => view.users.find((x) => x.id === u)?.name).join(', ')} cannot see this bid. {bid.ethicalWall.reason}</div>}
            <Link className="btn btn-sm" style={{ marginTop: 10 }} to={`/bids/${bid.id}/settings`}>Manage team and access</Link>
          </Card>
          {bid.brief && (
            <Card title="Opportunity brief" actions={<Link className="btn btn-sm" to={`/bids/${bid.id}/qualify`}>Open</Link>}>
              <p className="small clamp-3" style={{ marginTop: 0 }}>{bid.brief.need}</p>
              {bid.plan?.winThemes?.length > 0 && <><div className="mini strong">Win themes</div><ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>{bid.plan.winThemes.map((t) => <li key={t}>{t}</li>)}</ul></>}
            </Card>
          )}
          <Card title="Closing" subtitle="Countdown">
            <div className="num-big"><Closing closing={bid.closing} short /></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
