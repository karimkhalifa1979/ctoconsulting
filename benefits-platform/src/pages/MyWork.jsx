import { useNavigate } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { accountabilities } from '../lib/scoring.js';
import { realisation } from '../lib/finance.js';
import { roleName, gateOf } from '../lib/config.js';
import { PageHead, Card, Pill, Avatar } from '../components/ui.jsx';
import { StatusPill } from './program/Benefits.jsx';
import { fmtDate, todayISO, quarterKey, quarterLabel } from '../lib/util.js';

// "My accountabilities" workspace (ACC-06, NFR-01): everything the current person owns, with due items.
export default function MyWork() {
  const { ws, me, updateProgram } = useApp();
  const nav = useNavigate();
  const mine = ws.programs.flatMap((p) => accountabilities(p, ws).filter((a) => a.personId === me?.id).map((a) => ({ ...a, p })));
  const pending = mine.filter((a) => !a.acceptedAt);
  const myBenefits = ws.programs.flatMap((p) => (p.benefits || []).filter((b) => b.ownerId === me?.id || b.operationalOwnerId === me?.id).map((b) => ({ p, b, r: realisation(p, b, ws) })));
  const lastQ = quarterKey(todayISO());
  const dueActuals = myBenefits.filter(({ p, b }) => !['withdrawn', 'concept', 'definition', 'waiting-list'].includes(p.state) && !(b.actuals || []).some((a) => a.period >= lastQ.replace(/Q\d/, 'Q1')) && b.profile && (b.actuals || []).length);
  const myMeasures = ws.measures.filter((m) => m.ownerId === me?.id);
  const myGates = ws.programs.filter((p) => p.sponsorId === me?.id || p.managerId === me?.id).flatMap((p) => (p.gates || []).filter((g) => !g.decision).map((g) => ({ p, g })));
  const myActions = ws.programs.flatMap((p) => (p.log || []).filter((l) => l.ownerId === me?.id && l.status !== 'closed').map((l) => ({ p, l })));
  const myAssumptions = ws.programs.flatMap((p) => (p.chain?.elements || []).filter((e) => e.kind === 'assumption' && e.assumption?.monitorId === me?.id).map((a) => ({ p, a })));
  const succession = ws.programs.filter((p) => p.succession && !p.succession.acceptedAt && p.succession.to === me?.id);

  return (
    <div className="stack">
      <PageHead eyebrow="Overview" title={<span className="row" style={{ gap: 10 }}><Avatar name={me?.name} />My accountabilities</span>}>
        {me?.name}, {me?.position}. Everything you own — outcomes, benefits, measures, gates and actions — with what is due. Switch “Viewing as” in the top bar to see another person's view.
      </PageHead>
      {succession.map((p) => <div key={p.id} className="callout warn">You have been nominated as the new sponsor of <strong>{p.name}</strong>. <button className="btn btn-sm" onClick={() => nav(`/programs/${p.id}/accountability`)}>Review the handover pack</button></div>)}
      <div className="kpi-grid">
        <div className="card stat accent"><div className="label">Accountabilities</div><div className="value">{mine.length}</div><div className="sub">{pending.length} awaiting your acceptance</div></div>
        <div className="card stat"><div className="label">Benefits owned</div><div className="value">{myBenefits.length}</div><div className="sub">{myBenefits.filter((x) => ['at-risk', 'off-track'].includes(x.r.status)).length} need attention</div></div>
        <div className="card stat"><div className="label">Open actions and risks</div><div className="value">{myActions.length}</div></div>
        <div className="card stat"><div className="label">Upcoming gates</div><div className="value">{myGates.length}</div></div>
      </div>
      <div className="grid g-2" data-layout>
        <Card title="Awaiting your acceptance" subtitle="ACC-04 — accept against specific measurable results">
          {!pending.length ? <div className="empty-sm">Nothing pending.</div> : pending.map((a) => (
            <div key={a.key} className="check-row"><span className="ic sev-warning">!</span><span><strong>{roleName(a.role)}</strong> — {a.objectLabel}<div className="mini">{a.p.name}</div></span>
              <button className="btn btn-sm btn-primary" onClick={() => updateProgram(a.p.id, (x) => { x.acceptances = { ...(x.acceptances || {}), [a.key]: { ...(x.acceptances?.[a.key] || {}), acceptedAt: new Date().toISOString(), by: ws.currentUser, reference: a.objectLabel } }; }, `${me.name} accepted ${roleName(a.role)}: ${a.objectLabel}`, { action: 'accept' })}>Accept</button></div>
          ))}
        </Card>
        <Card title="Benefits I own" subtitle="Realisation against forecast">
          {!myBenefits.length ? <div className="empty-sm">No benefits assigned.</div> : myBenefits.map(({ p, b, r }) => <div key={b.id} className="check-row" style={{ cursor: 'pointer' }} onClick={() => nav(`/programs/${p.id}/benefits`)}><span className="ic">◎</span><span>{b.title}<div className="mini">{p.name}{b.operationalOwnerId === me?.id && b.ownerId !== me?.id ? ' · operational owner' : ''}</div></span><StatusPill status={r.status} /></div>)}
          {dueActuals.length > 0 && <div className="callout warn" style={{ marginTop: 8 }}>Actuals due for {quarterLabel(lastQ)}: {dueActuals.map((x) => x.b.title).join('; ')} (MEA-06).</div>}
        </Card>
      </div>
      <div className="grid g-3" data-layout>
        <Card title="My actions, risks and issues">{!myActions.length ? <div className="empty-sm">None open.</div> : myActions.map(({ p, l }) => <div key={l.id} className="check-row" style={{ cursor: 'pointer' }} onClick={() => nav(`/programs/${p.id}/logs`)}><span className="ic">{l.type === 'risk' ? '!' : '→'}</span><span>{l.title}<div className="mini">{p.code} · {l.type}{l.due ? ` · due ${fmtDate(l.due)}` : ''}</div></span><span /></div>)}</Card>
        <Card title="Gates for my programs">{!myGates.length ? <div className="empty-sm">None scheduled.</div> : myGates.map(({ p, g }) => <div key={g.id} className="check-row" style={{ cursor: 'pointer' }} onClick={() => nav(`/programs/${p.id}/gates`)}><span className="ic">◆</span><span>{gateOf(g.gate)?.name}<div className="mini">{p.name} · {fmtDate(g.planned)}</div></span>{g.planned < todayISO() ? <Pill tone="critical">Overdue</Pill> : <span />}</div>)}</Card>
        <Card title="Assumptions and measures I monitor">
          {myAssumptions.map(({ p, a }) => <div key={a.id} className="check-row"><span className="ic">{a.assumption.status === 'holding' ? '✓' : '!'}</span><span>{a.title}<div className="mini">{p.code} · next review {fmtDate(a.assumption.nextReview)}</div></span><span /></div>)}
          {myMeasures.map((m) => <div key={m.id} className="check-row"><span className="ic">#</span><span>{m.name}<div className="mini">{m.frequency} · {m.source}</div></span><span /></div>)}
          {!myAssumptions.length && !myMeasures.length && <div className="empty-sm">None.</div>}
        </Card>
      </div>
    </div>
  );
}
