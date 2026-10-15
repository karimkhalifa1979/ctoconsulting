import { useState } from 'react';
import { useApp, personName } from '../../lib/store.jsx';
import { SEVEN_PLUS_ONE, roleName, DELIVERY_ROLES } from '../../lib/config.js';
import { accountabilities } from '../../lib/scoring.js';
import { upstream, chainOf } from '../../lib/chain.js';
import { realisation } from '../../lib/finance.js';
import { Card, Pill, Modal, Field, TextArea, PersonSelect, Guidance, Avatar } from '../../components/ui.jsx';
import { fmtDate, daysBetween, todayISO, uid } from '../../lib/util.js';
import { downloadCSV } from '../../lib/exporters.js';

export default function Accountability({ program: p }) {
  const { ws, updateProgram, me } = useApp();
  const rows = accountabilities(p, ws);
  const [assess, setAssess] = useState(null);
  const [succ, setSucc] = useState(false);
  const chair = ws.board?.chairId;
  const due = ws.settings.thresholds.sponsorAcceptDays;

  const accept = (r) => updateProgram(p.id, (x) => { x.acceptances = { ...(x.acceptances || {}), [r.key]: { ...(x.acceptances?.[r.key] || {}), acceptedAt: new Date().toISOString(), by: ws.currentUser, reference: r.objectLabel } }; }, `${r.person?.name} accepted accountability: ${roleName(r.role)} — ${r.objectLabel}`, { action: 'accept', object: 'accountability', objectId: r.key });

  // Reach vs authority (ACC-10).
  const chain = chainOf(p);
  const mismatches = rows.filter((r) => r.role === 'outcome-owner' && r.person).map((r) => {
    const up = upstream(chain, r.objectId);
    const areas = new Set();
    for (const id of up) { const e = chain.elements.find((x) => x.id === id); for (const g of e?.targetGroups || []) { const s = p.stakeholders.find((y) => y.id === g); if (s?.areaId) areas.add(s.areaId); } }
    const owned = new Set([r.person.unit, ...ws.areas.filter((a) => a.head === r.person.id).map((a) => a.id)]);
    const exec = r.person.unit === 'a-exec';
    const outside = [...areas].filter((a) => !owned.has(a));
    return !exec && outside.length ? { r, outside } : null;
  }).filter(Boolean);

  return (
    <div className="stack">
      <Guidance title="The bucks start here.">Each program has exactly one accountable business sponsor. Delivery roles are accountable for capabilities; business owners are accountable for outcomes and benefits. Accountability is accepted formally, against specific measurable results.</Guidance>
      {p.succession && !p.succession.acceptedAt && <div className="callout warn"><strong>Sponsor succession in progress.</strong> Until {personName(ws, p.succession.to)} accepts, accountability sits with the board chair, {personName(ws, chair)} (BR-17). Acceptance due by {fmtDate(p.succession.dueBy)}.</div>}
      <Card title="Accountabilities" subtitle="ACC-02/03/04 — assignments, seven-plus-one conditions and formal acceptance" pad={false} actions={<>
        <button className="btn btn-sm" onClick={() => setSucc(true)} disabled={Boolean(p.succession && !p.succession.acceptedAt)}>Change sponsor (succession)…</button>
        <button className="btn btn-sm dl" onClick={() => downloadCSV(rows.filter((r) => ['outcome-owner', 'benefit-owner'].includes(r.role)), [{ label: 'Person', get: (r) => r.person?.name }, { label: 'Role', get: (r) => roleName(r.role) }, { label: 'Result', get: (r) => r.objectLabel }, { label: 'Accepted', get: (r) => r.acceptedAt || '' }, { label: 'Realisation status', get: (r) => { const b = p.benefits.find((x) => x.id === r.objectId); return b ? realisation(p, b, ws).status : ''; } }], `${p.code}_outcome_owner_performance.csv`)}>Export owner performance (ACC-12)</button>
      </>}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Role</th><th>Accountable for</th><th>Person</th><th>Seven plus one</th><th>Acceptance</th></tr></thead>
          <tbody>{rows.map((r) => {
            const pendingDays = !r.acceptedAt && p.stateSince ? daysBetween(p.stateSince, todayISO()) : 0;
            const deliveryOnly = r.person && ['benefit-owner', 'outcome-owner'].includes(r.role) && (r.person.roles || []).length && r.person.roles.every((x) => DELIVERY_ROLES.includes(x));
            return (
              <tr key={r.key}>
                <td><strong>{roleName(r.role)}</strong></td>
                <td className="small">{r.objectLabel}</td>
                <td><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Avatar name={r.person?.name} sm />{r.person?.name}</span>{deliveryOnly && <div className="mini sev-warning">Delivery role only (ACC-07)</div>}</td>
                <td><button className="btn btn-sm" onClick={() => setAssess(r)}>{r.unmet ? <Pill tone="critical">{r.unmet} not met</Pill> : r.partly ? <Pill tone="warning">{r.partly} partly met</Pill> : Object.keys(r.conditions).length ? <Pill tone="good">All met</Pill> : <Pill tone="none">Assess</Pill>}</button></td>
                <td>{r.acceptedAt ? <Pill tone="good">Accepted {fmtDate(r.acceptedAt)}</Pill> : r.personId === ws.currentUser ? <button className="btn btn-sm btn-primary" onClick={() => accept(r)}>Accept accountability</button> : <><Pill tone={pendingDays > due ? 'warning' : 'none'}>Pending{pendingDays > due ? ' — escalate' : ''}</Pill><div className="mini">Only {r.person?.name?.split(' ')[0]} can accept</div></>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <div className="card-body mini">Viewing as {me?.name}. Switch “Viewing as” in the top bar to accept on behalf of yourself as another person (demonstration).</div>
      </Card>

      {mismatches.length > 0 && <Card title="Reach versus authority (ACC-10)" subtitle="Outcome owners whose organisational span does not cover the areas the contributing initiatives affect">{mismatches.map(({ r, outside }) => <div key={r.key} className="check-row"><span className="ic sev-warning">!</span><span><strong>{r.person.name}</strong> owns “{r.objectLabel}” but the change reaches {outside.map((a) => ws.areas.find((x) => x.id === a)?.name).join(', ')}.</span><span className="rule">ACC-10</span></div>)}</Card>}

      <Card title="Accountability web (ACC-11)" subtitle="Who is accountable to whom, and for what">
        <div className="web">
          <div className="web-col"><div className="web-node"><div className="r">Investment Decision Board</div>{personName(ws, chair)} (chair)<div className="mini">Value of the portfolio</div></div></div>
          <div className="web-col"><div className="web-node" style={{ borderColor: 'var(--brand-teal)' }}><div className="r">Business sponsor</div>{personName(ws, p.sponsorId)}<div className="mini">Achievement of the program's agreed benefits</div></div>
            {rows.filter((r) => r.role === 'change-lead').map((r) => <div key={r.key} className="web-node"><div className="r">Change lead</div>{r.person?.name}</div>)}</div>
          <div className="web-col"><div className="web-node"><div className="r">Program manager</div>{personName(ws, p.managerId)}<div className="mini">Overall program management</div></div>
            {rows.filter((r) => r.role === 'project-manager').map((r) => <div key={r.key} className="web-node"><div className="r">Project manager</div>{r.person?.name}<div className="mini">{r.objectLabel}</div></div>)}</div>
          <div className="web-col">{rows.filter((r) => r.role === 'outcome-owner' || r.role === 'benefit-owner').map((r) => <div key={r.key} className="web-node"><div className="r">{roleName(r.role)}</div>{r.person?.name}<div className="mini">{r.objectLabel}</div></div>)}</div>
        </div>
      </Card>

      {(p.successionHistory || []).length > 0 && <Card title="Succession history">{p.successionHistory.map((h, i) => <div key={i} className="check-row"><span className="ic">↪</span><span>{personName(ws, h.from)} → {personName(ws, h.to)} · accepted {fmtDate(h.acceptedAt)}<div className="mini">Fresh eyes: {h.freshEyes}</div></span><span /></div>)}</Card>}

      {assess && <AssessModal p={p} r={assess} onClose={() => setAssess(null)} />}
      {succ && <Succession p={p} onClose={() => setSucc(false)} />}
      {p.succession && !p.succession.acceptedAt && <SuccessionInProgress p={p} />}
    </div>
  );
}

function AssessModal({ p, r, onClose }) {
  const { updateProgram } = useApp();
  const [c, setC] = useState({ ...r.conditions });
  const [notes, setNotes] = useState(r.notes || '');
  return (
    <Modal title={`Seven plus one — ${r.person?.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => {
      const unmet = SEVEN_PLUS_ONE.filter(([k]) => c[k] === 'not');
      updateProgram(p.id, (x) => {
        x.acceptances = { ...(x.acceptances || {}), [r.key]: { ...(x.acceptances?.[r.key] || {}), conditions: c, notes } };
        for (const [k, label] of unmet) {
          const title = `Accountability condition not met: ${label} (${r.person?.name}, ${r.objectLabel})`;
          if (!x.log.some((l) => l.title === title)) x.log.push({ id: uid('log'), type: 'risk', title, detail: notes, ownerId: x.sponsorId, date: todayISO(), status: 'open', likelihood: 'medium', impact: 'medium', level: 'program', source: `ACC-03:${k}` });
        }
      }, `Assessed seven-plus-one for ${r.person?.name}`);
      onClose();
    }}>Save</button></>}>
      <p className="mini">{roleName(r.role)} — {r.objectLabel}. Unmet conditions are raised as risks in the program log.</p>
      {SEVEN_PLUS_ONE.map(([k, label]) => (
        <div key={k} className="ctrl-row" style={{ gridTemplateColumns: '1fr 230px' }}>
          <span>{label}</span>
          <div className="seg" role="radiogroup" aria-label={label}>{[['met', 'Met'], ['partly', 'Partly'], ['not', 'Not met']].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={c[k] === v} className={c[k] === v ? 'on' : ''} onClick={() => setC({ ...c, [k]: v })}>{l}</button>)}</div>
        </div>
      ))}
      <Field label="Notes"><TextArea value={notes} onChange={setNotes} /></Field>
    </Modal>
  );
}

function handoverPack(p, ws) {
  const chain = chainOf(p);
  return [
    ['Current stage', p.state],
    ['Outcomes due (current and next stage)', chain.elements.filter((e) => e.kind === 'outcome').map((e) => `${e.code} ${e.title} (${e.progress || 0}% achieved)`).join('; ')],
    ['Open commitments', (p.log || []).filter((l) => ['action', 'decision'].includes(l.type) && l.status !== 'closed').map((l) => `${l.title}${l.due ? ` (due ${fmtDate(l.due)})` : ''}`).join('; ') || 'None'],
    ['Open risks', (p.log || []).filter((l) => l.type === 'risk' && l.status !== 'closed').map((l) => l.title).join('; ') || 'None'],
    ['Assumptions', chain.elements.filter((e) => e.kind === 'assumption').map((a) => `${a.title} — ${a.assumption?.status}`).join('; ') || 'None'],
    ['Stakeholder positions', (p.stakeholders || []).map((s) => `${s.name}: ${s.current} → ${s.desired}`).join('; ') || 'None'],
    ['Pending decisions', (p.gates || []).filter((g) => !g.decision).map((g) => `${g.gate} ${fmtDate(g.planned)}`).join('; ') || 'None'],
  ];
}

function Succession({ p, onClose }) {
  const { ws, updateProgram } = useApp();
  const [to, setTo] = useState('');
  const [commentary, setCommentary] = useState('');
  return (
    <Modal title="Start sponsor succession (ACC-08)" wide onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!to || to === p.sponsorId} onClick={() => { updateProgram(p.id, (x) => { x.succession = { from: x.sponsorId, to, startedAt: todayISO(), dueBy: new Date(Date.now() + ws.settings.thresholds.sponsorAcceptDays * 1.4 * 86400000).toISOString().slice(0, 10), commentary, pack: handoverPack(x, ws) }; }, 'Sponsor succession started'); onClose(); }}>Start succession</button></>}>
      <p>The platform compiles a handover pack. Until the incoming sponsor accepts, accountability reverts to the board chair and the program is flagged on dashboards.</p>
      <Field label="Incoming sponsor"><PersonSelect ws={ws} value={to} onChange={setTo} /></Field>
      <table className="table compact kv" style={{ marginTop: 10 }}><tbody>{handoverPack(p, ws).map(([k, v]) => <tr key={k}><td>{k}</td><td className="small">{v}</td></tr>)}</tbody></table>
      <Field label="Outgoing sponsor commentary"><TextArea value={commentary} onChange={setCommentary} /></Field>
    </Modal>
  );
}

function SuccessionInProgress({ p }) {
  const { ws, updateProgram } = useApp();
  const s = p.succession;
  const [fresh, setFresh] = useState(s.freshEyes || '');
  const isIncoming = ws.currentUser === s.to;
  return (
    <Card title="Sponsor handover" subtitle={`${personName(ws, s.from)} → ${personName(ws, s.to)} · started ${fmtDate(s.startedAt)}`}>
      <table className="table compact kv"><tbody>{s.pack.map(([k, v]) => <tr key={k}><td>{k}</td><td className="small">{v}</td></tr>)}<tr><td>Outgoing commentary</td><td className="small">{s.commentary || '—'}</td></tr></tbody></table>
      <Field label="Incoming sponsor’s “fresh eyes” review"><TextArea value={fresh} onChange={setFresh} disabled={!isIncoming} /></Field>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn btn-primary" disabled={!isIncoming || !fresh.trim()} onClick={() => updateProgram(p.id, (x) => { const prev = x.sponsorId; x.sponsorId = s.to; x.successionHistory = [...(x.successionHistory || []), { from: prev, to: s.to, acceptedAt: new Date().toISOString(), freshEyes: fresh, confirmedBy: ws.board?.chairId }]; x.acceptances = { ...(x.acceptances || {}), [`sponsor:${x.id}:${s.to}`]: { acceptedAt: new Date().toISOString(), conditions: {} } }; x.succession = null; }, `New sponsor ${personName(ws, s.to)} accepted accountability`, { action: 'accept' })}>Accept sponsorship</button>
        {!isIncoming && <span className="mini">Switch “Viewing as” to {personName(ws, s.to)} to complete the review and accept.</span>}
      </div>
    </Card>
  );
}
