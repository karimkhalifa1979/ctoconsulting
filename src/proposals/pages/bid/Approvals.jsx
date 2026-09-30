import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useP } from '../../lib/store.jsx';
import { Card, Modal } from '../../../components/ui.jsx';
import { GatePill, Person, When, Blockers, Field, Confirm, Icon, Avatar } from '../../components/common.jsx';
import { GATES, DECISIONS, roleLabel } from '../../core/constants.js';
import { can, activeDelegation, authorityOf } from '../../core/permissions.js';
import { gateCoverage, aiPendingCount } from '../../core/workflow.js';
import { aud, fmtDate } from '../../core/util.js';

// A Microsoft Teams adaptive card as approvers receive it (WF-12). Approving from the card uses the same command.
function TeamsCard({ bid, gate, onDecide, disabled }) {
  const p = bid._d.pricing;
  return (
    <div className="teams-card" aria-label="Microsoft Teams approval card preview">
      <div className="tc-head"><span className="tc-app">CTO Proposals</span><span className="mini">Microsoft Teams · adaptive card</span></div>
      <div className="tc-body">
        <div className="strong">Approval needed: gate {gate.n} for {bid.ref}</div>
        <div className="small">{gate.label} — {bid.title}</div>
        <dl className="kv" style={{ marginTop: 8, gridTemplateColumns: '120px 1fr' }}>
          <dt>Price (ex GST)</dt><dd>{aud(p.subtotal)}</dd>
          <dt>Closes</dt><dd>{bid.closing?.date ? fmtDate(bid.closing.date) : '—'}</dd>
          <dt>Snapshot</dt><dd>{bid.gates[gate.id].snapshotId?.slice(-6) || '—'}</dd>
        </dl>
      </div>
      <div className="tc-actions">
        <button className="btn btn-sm btn-primary" disabled={disabled} onClick={() => onDecide('approve')}>Approve</button>
        <button className="btn btn-sm" disabled={disabled} onClick={() => onDecide('reject')}>Reject…</button>
        <Link className="btn btn-sm btn-ghost" to={`/bids/${bid.id}/approvals`}>Open in platform</Link>
      </div>
    </div>
  );
}

function DecideModal({ bid, gate, decision: initial, onBehalfOf, onClose }) {
  const { dispatch, userName } = useP();
  const [decision, setDecision] = useState(initial || 'approve');
  const [conditions, setConditions] = useState('');
  const [comment, setComment] = useState('');
  const [sectionIds, setSectionIds] = useState([]);
  const covered = bid.sections.filter((s) => gateCoverage(bid, gate.id).includes(s.id));
  const go = async () => {
    await dispatch('gate.decide', { bidId: bid.id, gateId: gate.id, decision, conditions, comment, sectionIds, onBehalfOf: onBehalfOf || undefined }, { success: decision === 'reject' ? `Gate ${gate.n} rejected` : `Gate ${gate.n} approval recorded` });
    onClose();
  };
  return (
    <Modal title={`Gate ${gate.n}: ${gate.label}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className={`btn ${decision === 'reject' ? 'btn-danger' : 'btn-primary'}`} onClick={go} disabled={(decision === 'approve_conditions' && !conditions.trim()) || (decision === 'reject' && !comment.trim())}>Record decision</button></>}>
      {onBehalfOf && <div className="callout small">You are deciding as delegate for <strong>{userName(onBehalfOf)}</strong>. The audit trail records both names (WF-14).</div>}
      <p className="small">You are approving snapshot <strong>{bid.gates[gate.id].snapshotId?.slice(-6)}</strong>: {covered.length} section{covered.length === 1 ? '' : 's'} at their locked versions{gate.id === 'g2' ? ', the team and the price' : ''}. Your decision is recorded with the exact version approved (WF-07).</p>
      <div className="stack" style={{ gap: 6 }}>
        {DECISIONS.map((d) => <label key={d.id} className="check"><input type="radio" name="decision" checked={decision === d.id} onChange={() => setDecision(d.id)} /><span><strong>{d.label}</strong>{d.hint ? <span className="mini"> — {d.hint}</span> : null}</span></label>)}
      </div>
      {decision === 'approve_conditions' && <Field label="Conditions (required)" full><textarea rows={3} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="For example: confirm the travel budget with the client before submission." /></Field>}
      <Field label={decision === 'reject' ? 'Reason (required)' : 'Comment (optional)'} full><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      {decision === 'reject' && (
        <Field label="Return these sections to drafting" hint="Other sections are unlocked but stay approved" full>
          <div className="stack" style={{ gap: 4, maxHeight: 200, overflowY: 'auto' }}>
            {covered.map((s) => <label key={s.id} className="check small"><input type="checkbox" checked={sectionIds.includes(s.id)} onChange={(e) => setSectionIds(e.target.checked ? [...sectionIds, s.id] : sectionIds.filter((x) => x !== s.id))} /><span>{s.title}</span></label>)}
          </div>
        </Field>
      )}
    </Modal>
  );
}

function SnapshotModal({ bid, snap, onClose }) {
  const { userName } = useP();
  return (
    <Modal title={snap.label} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <p className="small">Taken <When at={snap.at} /> by {userName(snap.by)}. Content hashes prove the approved text has not changed (WF-05).</p>
      {snap.pricing && <p className="small">Price at snapshot: {aud(snap.pricing.subtotal)} ex GST ({aud(snap.pricing.total)} inc GST).</p>}
      <table className="table">
        <thead><tr><th>Section</th><th>Version</th><th>Now</th><th>Content hash</th></tr></thead>
        <tbody>
          {snap.sections.map((s) => {
            const now = bid.sections.find((x) => x.id === s.id);
            return <tr key={s.id}><td>{s.title}</td><td className="tabular">v{s.v}</td><td className="tabular">{now ? (now.v === s.v ? <span className="pill good">Same</span> : <span className="pill warn">v{now.v}</span>) : <span className="muted">Deleted</span>}</td><td className="mini" style={{ fontFamily: 'monospace' }}>{s.hash.slice(0, 16)}…</td></tr>;
          })}
        </tbody>
      </table>
    </Modal>
  );
}

export default function Approvals({ bid }) {
  const { view, me, dispatch, userName } = useP();
  const [deciding, setDeciding] = useState(null);
  const [reopen, setReopen] = useState(null);
  const [snap, setSnap] = useState(null);
  const planner = can(view, me.id, 'planSections', { bid });
  const closed = Boolean(bid.submission) || ['closed', 'archived'].includes(bid.stage);
  // Approvers who delegated to me and are on this gate's eligible list.
  const delegators = (view.delegators || []).map((id) => view.users.find((u) => u.id === id)).filter((u) => u && activeDelegation(u, new Date().toISOString())?.toUserId === me.id && authorityOf(me) >= authorityOf(u));

  return (
    <div className="stack">
      <div className="callout small">
        Gate 1 (bid/no-bid) is decided on the <Link to={`/bids/${bid.id}/qualify`}>Qualify</Link> tab: <GatePill status={bid._d.gates.g1.status} />.
        Requesting gate 2 or 3 takes a named snapshot and locks the covered sections. An edit after approval voids the approval and notifies the approvers (WF-08).
      </div>
      {GATES.filter((g) => g.id !== 'g1').map((g) => {
        const d = bid._d.gates[g.id];
        const gate = bid.gates[g.id];
        if (!d.enabled) return <Card key={g.id} title={`Gate ${g.n}: ${g.label}`}><p className="muted small">This gate is not part of the bid’s workflow template.</p></Card>;
        const decisions = [...(gate.decisions || [])].reverse();
        const mine = d.eligible.includes(me.id) && gate.status === 'pending' && !decisions.some((x) => !x.void && x.requestId === gate.requestId && (x.onBehalfOf || x.by) === me.id);
        const onBehalf = delegators.filter((u) => d.eligible.includes(u.id) && gate.status === 'pending' && !decisions.some((x) => !x.void && x.requestId === gate.requestId && (x.onBehalfOf || x.by) === u.id));
        const covered = bid.sections.filter((s) => gateCoverage(bid, g.id).includes(s.id));
        const aiLeft = covered.filter((s) => aiPendingCount(s.content));
        return (
          <div key={g.id} className="gate-card">
            <div className="gh">
              <h3 style={{ margin: 0 }}><span className={`diamond ${gate.status}`} />Gate {g.n}: {g.label}</h3>
              <div className="row">
                <GatePill status={d.status} />
                {planner && !closed && ['not_requested', 'rejected'].includes(gate.status) && <button className="btn btn-primary" disabled={d.preconditions.length > 0} onClick={() => dispatch('gate.request', { bidId: bid.id, gateId: g.id }, { success: `Gate ${g.n} requested; approvers notified by email and Teams` })}>{gate.status === 'rejected' ? 'Request again' : 'Request approval'}</button>}
                {planner && !closed && gate.status === 'pending' && <button className="btn" onClick={() => dispatch('gate.withdraw', { bidId: bid.id, gateId: g.id }, { success: 'Request withdrawn; sections unlocked' })}>Withdraw request</button>}
                {planner && !closed && gate.status === 'passed' && <button className="btn" onClick={() => setReopen(g)}>Reopen…</button>}
              </div>
            </div>
            <div style={{ padding: '14px 18px' }} className="split">
              <div>
                <div className="eyebrow">Required approvals</div>
                {d.reqs.map((r) => (
                  <div key={r.role} className="req-row">
                    <span className={`pill ${r.met ? 'good' : ''}`}>{r.have.length} / {r.count}</span>
                    <strong>{roleLabel(r.role)}</strong>
                    <span className="mini">{r.reasons.join('; ')}</span>
                    <span className="avatar-stack">{r.have.map((id) => <Avatar key={id} id={id} size="sm" />)}</span>
                  </div>
                ))}
                <div className="mini" style={{ marginTop: 8 }}>Eligible on this bid: {d.eligible.map((id) => userName(id)).join(', ') || 'none — add approvers to the bid team'}</div>
                {g.id === 'g2' && bid._d.seeCost && bid._d.marginBelow && <div className="callout warn small" style={{ marginTop: 8 }}>Margin {(bid._d.pricing.marginPct * 100).toFixed(1)}% is below the {bid._d.marginThreshold}% threshold, so an additional commercial approval is required (PR-05).</div>}
                <div className="mini" style={{ marginTop: 8 }}>Covers {covered.length} section{covered.length === 1 ? '' : 's'}{g.id === 'g2' ? ' marked commercial, plus the team and price' : ''}.</div>
                {['not_requested', 'rejected'].includes(gate.status) && !closed && <div style={{ marginTop: 10 }}><Blockers items={d.preconditions} title="Before this gate can be requested" /></div>}
                {gate.status === 'pending' && aiLeft.length > 0 && <div className="callout warn small" style={{ marginTop: 10 }}>Approval is blocked while unreviewed AI text remains in {aiLeft.map((s) => s.title).join(', ')} (WD-03).</div>}
              </div>
              <div>
                {gate.status === 'pending' && (mine || onBehalf.length > 0) && (
                  <div className="stack" style={{ gap: 10 }}>
                    <div className="eyebrow">Your decision</div>
                    {mine && <div className="row"><button className="btn btn-primary" onClick={() => setDeciding({ gate: g, decision: 'approve' })}>Approve</button><button className="btn" onClick={() => setDeciding({ gate: g, decision: 'approve_conditions' })}>Approve with conditions</button><button className="btn btn-danger" onClick={() => setDeciding({ gate: g, decision: 'reject' })}>Reject</button></div>}
                    {onBehalf.map((u) => <div key={u.id} className="row"><span className="small">As delegate for {u.name}:</span><button className="btn btn-sm" onClick={() => setDeciding({ gate: g, decision: 'approve', onBehalfOf: u.id })}>Decide…</button></div>)}
                    {mine && <TeamsCard bid={bid} gate={g} onDecide={(dec) => setDeciding({ gate: g, decision: dec })} />}
                  </div>
                )}
                {gate.status === 'pending' && !mine && !onBehalf.length && <p className="small muted">Waiting for {d.reqs.filter((r) => !r.met).map((r) => `${r.count - r.have.length} × ${roleLabel(r.role)}`).join(' and ')}. Requested <When at={gate.requestedAt} /> by {userName(gate.requestedBy)}.</p>}
                {gate.status === 'passed' && <p className="small">Passed <When at={gate.passedAt} />. Outputs generated from snapshot {gate.snapshotId?.slice(-6)} can be marked final.</p>}
                {gate.snapshotId && <button className="btn btn-sm btn-ghost" onClick={() => setSnap(bid.snapshots.find((x) => x.id === gate.snapshotId))}><Icon name="doc" size={14} />View snapshot {gate.snapshotId.slice(-6)}</button>}
              </div>
            </div>
            {decisions.length > 0 && (
              <div style={{ padding: '0 18px 12px' }}>
                <div className="eyebrow">Decisions</div>
                {decisions.map((x) => (
                  <div key={x.id} className={`decision ${x.void ? 'void' : ''}`}>
                    <Avatar id={x.by} size="sm" />
                    <div>
                      <strong>{userName(x.by)}</strong>{x.onBehalfOf ? ` for ${userName(x.onBehalfOf)}` : ''} · {roleLabel(x.role)} · <span className={`pill ${x.decision === 'reject' ? 'bad' : 'good'}`}>{DECISIONS.find((dd) => dd.id === x.decision)?.label}</span> <span className="mini"><When at={x.at} /> · snapshot {x.snapshotId?.slice(-6)}</span>
                      {x.conditions && <div className="small">Conditions: {x.conditions}</div>}
                      {x.comment && <div className="small">“{x.comment}”</div>}
                      {x.void && <div className="mini">Voided: {x.voidReason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(gate.history || []).length > 0 && <div style={{ padding: '0 18px 14px' }} className="mini">{gate.history.map((h, i) => <div key={i}>{h.event === 'reopened' ? 'Reopened' : h.event} <When at={h.at} /> by {userName(h.by)}: {h.reason}</div>)}</div>}
          </div>
        );
      })}
      <Card title="Snapshots" subtitle="Named, read-only snapshots taken at each gate request and at submission" pad={false}>
        {bid.snapshots.length ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Snapshot</th><th>Taken</th><th>By</th><th className="right">Sections</th><th className="right">Price ex GST</th><th /></tr></thead>
            <tbody>{[...bid.snapshots].reverse().map((s) => <tr key={s.id}><td>{s.label}<div className="mini">{s.id.slice(-6)}{s.passedAt ? ' · gate passed' : ''}</div></td><td><When at={s.at} /></td><td><Person id={s.by} /></td><td className="right tabular">{s.sections.length}</td><td className="right tabular">{s.pricing ? aud(s.pricing.subtotal) : '—'}</td><td><button className="btn btn-sm" onClick={() => setSnap(s)}>View</button></td></tr>)}</tbody>
          </table></div>
        ) : <p className="muted small" style={{ padding: '0 18px 14px' }}>No snapshots yet.</p>}
      </Card>
      {deciding && <DecideModal bid={bid} gate={deciding.gate} decision={deciding.decision} onBehalfOf={deciding.onBehalfOf} onClose={() => setDeciding(null)} />}
      {reopen && <Confirm title={`Reopen gate ${reopen.n}?`} confirmLabel="Reopen gate" danger requireText="Reason for reopening" onClose={() => setReopen(null)} onConfirm={(reason) => dispatch('gate.reopen', { bidId: bid.id, gateId: reopen.id, reason }, { success: `Gate ${reopen.n} reopened; approvers notified` })}>
        <p>Reopening voids the existing approvals{reopen.id === 'g2' ? ' (and gate 3, which depends on it)' : ''}, unlocks the sections and notifies the approvers. Give the reason.</p>
      </Confirm>}
      {snap && <SnapshotModal bid={bid} snap={snap} onClose={() => setSnap(null)} />}
    </div>
  );
}
