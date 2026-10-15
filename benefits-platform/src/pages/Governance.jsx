import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, personName } from '../lib/store.jsx';
import { gateOf, decisionOf } from '../lib/config.js';
import { summaries } from '../lib/portfolio.js';
import { latestValueCase } from '../lib/rules.js';
import { businessCaseModel, blockHtml } from '../lib/businessCase.js';
import { simulate } from '../lib/simulation.js';
import { riskIconSvg } from '../lib/docCharts.js';
import { riskBand } from '../lib/scoring.js';
import { PageHead, Card, Tabs, Pill, Field, TextInput, TextArea, Select, PersonSelect, MultiChips, NumberInput, Modal, Guidance } from '../components/ui.jsx';
import { fmtDate, fmtMonth, todayISO, addMonths, uid, money, esc } from '../lib/util.js';
import { printHtml, downloadCSV } from '../lib/exporters.js';

export default function Governance() {
  const [tab, setTab] = useState('calendar');
  return (
    <div className="stack">
      <PageHead eyebrow="Governance" title="Gates and board">Full-cycle governance: a gate calendar with reminders, an investment decision board that meets regularly rather than once a year, generated board packs, and an auditable decision log.</PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[['calendar', 'Gate calendar'], ['meetings', 'Board meetings'], ['log', 'Decision log'], ['approvals', 'Out-of-session approvals'], ['board', 'Board and policies']]} />
      {tab === 'calendar' && <Calendar />}
      {tab === 'meetings' && <Meetings />}
      {tab === 'log' && <DecisionLog />}
      {tab === 'approvals' && <Approvals />}
      {tab === 'board' && <Board />}
    </div>
  );
}

function Calendar() {
  const { ws } = useApp();
  const nav = useNavigate();
  const today = todayISO();
  const items = ws.programs.flatMap((p) => (p.gates || []).filter((g) => !g.decision).map((g) => ({ p, g }))).sort((a, b) => (a.g.planned < b.g.planned ? -1 : 1));
  const overdue = items.filter((x) => x.g.planned < today);
  const months = {};
  for (const x of items.filter((y) => y.g.planned >= today)) (months[x.g.planned.slice(0, 7)] ||= []).push(x);
  return (
    <div className="stack">
      {overdue.length > 0 && <div className="callout warn"><strong>{overdue.length} overdue gate{overdue.length === 1 ? '' : 's'} (GOV-07):</strong> {overdue.map((x) => `${x.p.code} ${gateOf(x.g.gate)?.short} (${fmtDate(x.g.planned)})`).join('; ')}</div>}
      <Card title="Upcoming gates and benefits reviews" subtitle="Scheduled and event-triggered">
        {Object.entries(months).map(([m, list]) => (
          <div key={m}>
            <div className="agenda-month">{fmtMonth(`${m}-01`)}</div>
            {list.map(({ p, g }) => (
              <div key={g.id} className="agenda-item" style={{ borderLeftColor: g.eventTriggered ? 'var(--st-critical)' : g.gate === 'BR' ? 'var(--series-3)' : 'var(--series-1)', cursor: 'pointer' }} onClick={() => nav(`/programs/${p.id}/gates`)}>
                <span className="date">{fmtDate(g.planned)}</span>
                <span><strong>{gateOf(g.gate)?.name}</strong> — {p.code} {p.name}{g.eventTriggered && <div className="mini sev-error">Event-triggered: {g.eventTriggered}</div>}<div className="mini">Authority: {gateOf(g.gate)?.authority} · sponsor {personName(ws, p.sponsorId)}</div></span>
                <span>{g.planned <= addMonths(today, 1) ? <Pill tone="warning">Within a month</Pill> : null}</span>
              </div>
            ))}
          </div>
        ))}
        {!items.length && <div className="empty-sm">No gates scheduled.</div>}
      </Card>
    </div>
  );
}

function Meetings() {
  const { ws, mutate } = useApp();
  const [open, setOpen] = useState(ws.meetings.find((m) => m.status === 'planned')?.id || ws.meetings[0]?.id);
  const [busy, setBusy] = useState(false);
  const m = ws.meetings.find((x) => x.id === open);
  const idx = ws.meetings.indexOf(m);
  const upd = (fn, label) => mutate(label, (d) => fn(d.meetings[idx]), { object: 'meeting', objectId: m?.id, field: label });
  const suggestAgenda = () => {
    const horizon = addMonths(m.date, 1);
    const gates = ws.programs.flatMap((p) => (p.gates || []).filter((g) => !g.decision && g.gate !== 'BR' && g.planned <= horizon).map((g) => ({ id: uid('it'), type: 'gate', programId: p.id, gateId: g.id, note: gateOf(g.gate)?.name })));
    const esc2 = ws.programs.flatMap((p) => (p.log || []).filter((l) => l.level === 'idb' && l.status !== 'closed').map((l) => ({ id: uid('it'), type: 'escalation', programId: p.id, note: l.title })));
    const adj = ws.programs.some((p) => p.state === 'waiting-list') ? [{ id: uid('it'), type: 'portfolio', note: 'Waiting list and released funds' }] : [];
    upd((x) => { const have = new Set(x.items.map((i) => `${i.type}:${i.gateId || i.note}`)); x.items.push(...[...gates, ...esc2, ...adj].filter((i) => !have.has(`${i.type}:${i.gateId || i.note}`))); }, 'Agenda built from pending submissions (BRD-02)');
  };
  const boardPack = () => {
    setBusy(true);
    setTimeout(() => {
      const s = summaries(ws);
      const parts = m.items.map((it, i) => {
        const p = ws.programs.find((x) => x.id === it.programId);
        if (!p) return `<h2>${i + 1}. ${esc(it.note || it.type)}</h2><p>${esc(it.type === 'portfolio' ? `Waiting list: ${ws.programs.filter((x) => x.state === 'waiting-list').map((x) => `${x.code} ${x.name} (NPV ${money(s.get(x.id).fin.npv)})`).join('; ')}` : '')}</p>`;
        const x = s.get(p.id);
        let summary = '';
        if (it.type === 'gate') {
          const sim = simulate([p], ws, { ...(p.simSettings || {}), iterations: 2000 });
          const model = businessCaseModel(ws, p, { vc: latestValueCase(p), sim });
          summary = model.sections[0].blocks.map(blockHtml).join('');
        } else summary = `<p>${esc(it.note || '')}</p>`;
        return `<h2>${i + 1}. ${esc(it.type === 'gate' ? 'Gate decision' : it.type === 'escalation' ? 'Escalation' : 'Review')}: ${esc(p.code)} ${esc(p.name)}</h2>
<table class="kv"><tbody><tr><td>Sponsor</td><td>${esc(personName(ws, p.sponsorId))}</td></tr><tr><td>Item</td><td>${esc(it.note || '')}</td></tr><tr><td>NPV · BCR</td><td>${esc(money(x.fin.npv))} · ${x.fin.bcr ? x.fin.bcr.toFixed(2) : '—'}</td></tr><tr><td>Alignment · risk</td><td>${x.align.score === null ? '—' : Math.round(x.align.score)} · ${x.risk.overall === null ? '—' : Math.round(x.risk.overall)}</td></tr></tbody></table>
<div style="float:right;margin:0 0 8px 12px">${riskIconSvg(x.risk.byAre, (v) => riskBand(v, ws), 96)}</div>${summary}<div style="clear:both"></div>`;
      }).join('\n');
      printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.title)} — board pack</title><style>@page{size:A4;margin:16mm}body{font-family:Calibri,Arial,sans-serif;font-size:10.5pt;color:#1b2533;max-width:820px;margin:20px auto}h1{color:#0b1f3a}h2{color:#0b1f3a;border-bottom:1px solid #d9dee5;margin-top:24px;page-break-before:auto}table{border-collapse:collapse;width:100%;margin:6px 0}td,th{border:1px solid #c9d1db;padding:4px 7px;vertical-align:top}table.kv td:first-child{background:#eef3f8;font-weight:600;width:30%}.figs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.fig{border:1px solid #d9dee5;border-top:3px solid #0fa3b1;padding:6px}.fig .l{font-size:7.5pt;text-transform:uppercase;color:#6b7684}.fig .v{font-weight:700;color:#0b1f3a}.fig .s{font-size:8pt;color:#6b7684}.callout{border-left:4px solid #0fa3b1;background:#e3f5f7;padding:8px 10px}</style></head><body><div style="color:#0b1f3a;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:9pt">${esc(ws.settings.orgName)}</div><h1>${esc(m.title)}</h1><p>${fmtDate(m.date)} · Chair ${esc(personName(ws, ws.board.chairId))} · Quorum ${ws.board.quorum}</p><h2>Agenda</h2><ol>${m.items.map((it) => `<li>${esc(ws.programs.find((p) => p.id === it.programId)?.name || '')} — ${esc(it.note || it.type)}</li>`).join('')}</ol>${parts}<p style="font-size:8.5pt;color:#6b7684;margin-top:24px">Generated by the CTO Consulting Benefits Realisation Platform. Board views focus on portfolio and program value, not project task detail (BRD-05).</p></body></html>`);
      setBusy(false);
    }, 30);
  };
  return (
    <div className="split-wide">
      <Card title="Meetings" actions={<button className="btn btn-sm btn-primary" onClick={() => { const id = uid('mtg'); mutate('Board meeting scheduled', (d) => { d.meetings.push({ id, date: addMonths(todayISO(), 1), title: `${d.board.name} — ${fmtMonth(addMonths(todayISO(), 1))}`, status: 'planned', items: [], conflicts: '', minutes: '', decisions: [] }); }); setOpen(id); }}>+ Meeting</button>}>
        {ws.meetings.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((x) => <div key={x.id} className="check-row" style={{ cursor: 'pointer', background: x.id === open ? 'var(--brand-teal-soft)' : undefined }} onClick={() => setOpen(x.id)}><span className="ic">{x.status === 'held' ? '✓' : '○'}</span><span><strong>{x.title}</strong><div className="mini">{fmtDate(x.date)} · {x.items.length} items</div></span><span /></div>)}
      </Card>
      {m ? (
        <div className="stack">
          <Card title={m.title} subtitle={`${fmtDate(m.date)} · ${m.status}`} actions={<>
            <button className="btn btn-sm" onClick={suggestAgenda}>Build agenda</button>
            <button className="btn btn-sm btn-primary dl" onClick={boardPack} disabled={busy || !m.items.length}>{busy ? 'Preparing…' : 'Board pack (PDF)'}</button>
            {m.status !== 'held' && <button className="btn btn-sm" onClick={() => upd((x) => { x.status = 'held'; }, 'Meeting held')}>Mark held</button>}
          </>}>
            <div className="form-grid"><Field label="Title"><TextInput value={m.title} onChange={(v) => upd((x) => { x.title = v; }, 'Meeting title')} /></Field><Field label="Date"><input type="date" value={m.date} onChange={(e) => upd((x) => { x.date = e.target.value; }, 'Meeting date')} /></Field></div>
            <div className="section-title">Agenda (BRD-02)</div>
            {m.items.map((it, i) => <div key={it.id} className="check-row"><span className="ic">{i + 1}</span><span><Pill tone={it.type === 'gate' ? 'progress' : it.type === 'escalation' ? 'warning' : 'none'}>{it.type}</Pill> {ws.programs.find((p) => p.id === it.programId)?.name || ''} — {it.note}</span><button className="btn btn-ghost btn-sm" aria-label="Remove" onClick={() => upd((x) => { x.items.splice(i, 1); }, 'Agenda item removed')}>✕</button></div>)}
            {!m.items.length && <div className="empty-sm">No items — use Build agenda to pull in gate submissions, escalations and portfolio adjustments.</div>}
            <div className="section-title">Conflicts of interest declared</div>
            <TextArea value={m.conflicts} onChange={(v) => upd((x) => { x.conflicts = v; }, 'Conflicts declared')} rows={2} />
            <div className="section-title">Minutes</div>
            <TextArea value={m.minutes} onChange={(v) => upd((x) => { x.minutes = v; }, 'Minutes')} rows={3} />
          </Card>
          <Card title="Board decisions and actions (BRD-03)" actions={<button className="btn btn-sm" onClick={() => upd((x) => { x.decisions.push({ id: uid('bd'), text: '', ownerId: null, due: addMonths(m.date, 1), vote: 'Consensus' }); }, 'Board decision added')}>+ Decision</button>}>
            {m.decisions.map((d, i) => <div key={d.id} className="form-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px dashed var(--line)', paddingBottom: 8, marginBottom: 8 }}>
              <Field label="Decision / action"><TextInput value={d.text} onChange={(v) => upd((x) => { x.decisions[i].text = v; }, 'Decision text')} /></Field>
              <Field label="Owner"><PersonSelect ws={ws} value={d.ownerId} onChange={(v) => upd((x) => { x.decisions[i].ownerId = v; }, 'Decision owner')} /></Field>
              <Field label="Due"><input type="date" value={d.due || ''} onChange={(e) => upd((x) => { x.decisions[i].due = e.target.value; }, 'Decision due')} /></Field>
              <Field label="Consensus or vote"><TextInput value={d.vote} onChange={(v) => upd((x) => { x.decisions[i].vote = v; }, 'Decision vote')} /></Field>
            </div>)}
            {!m.decisions.length && <div className="empty-sm">No decisions recorded. Gate decisions are recorded on each program's Gates tab.</div>}
          </Card>
        </div>
      ) : <Card><div className="empty-sm">No meetings.</div></Card>}
    </div>
  );
}

function DecisionLog() {
  const { ws } = useApp();
  const rows = [
    ...ws.programs.flatMap((p) => (p.gates || []).filter((g) => g.decision).map((g) => ({ date: g.decision.date, kind: gateOf(g.gate)?.name, program: `${p.code} ${p.name}`, decision: decisionOf(g.decision.option)?.label + (g.decision.option === 'withdraw' ? ' — resources released' : ''), rationale: g.decision.rationale, conditions: g.decision.conditions, makers: g.decision.makers, funding: g.decision.fundingApproved, superseded: Boolean(g.decision.supersededBy) }))),
    ...ws.meetings.flatMap((m) => m.decisions.map((d) => ({ date: m.date, kind: 'Board decision', program: m.title, decision: d.text, rationale: m.minutes, conditions: '', makers: `${ws.board.name} (${d.vote})`, funding: null }))),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <Card title="Decision log (RP-05, RPT-10)" subtitle="Board and gate decisions with rationale and conditions — suitable for audit" pad={false} actions={<button className="btn btn-sm dl" onClick={() => downloadCSV(rows, [{ label: 'Date', get: (r) => r.date }, { label: 'Type', get: (r) => r.kind }, { label: 'Program / meeting', get: (r) => r.program }, { label: 'Decision', get: (r) => r.decision }, { label: 'Rationale', get: (r) => r.rationale }, { label: 'Conditions', get: (r) => r.conditions }, { label: 'Decision makers', get: (r) => r.makers }, { label: 'Funding released', get: (r) => r.funding ?? '' }], 'decision_log.csv')}>Export CSV</button>}>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Date</th><th>Type</th><th>Program / meeting</th><th>Decision</th><th>Rationale and conditions</th><th>Decision makers</th><th className="num">Funding</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} style={r.superseded ? { opacity: 0.55 } : undefined}><td className="nowrap">{fmtDate(r.date)}</td><td>{r.kind}</td><td>{r.program}</td><td><strong>{r.decision}</strong>{r.superseded && <div className="mini">Superseded</div>}</td><td className="small">{r.rationale}{r.conditions && <div className="mini">Conditions: {r.conditions}</div>}</td><td className="small">{r.makers}</td><td className="num">{r.funding === null ? '' : money(r.funding)}</td></tr>)}</tbody>
      </table></div>
    </Card>
  );
}

function Approvals() {
  const { ws, mutate, me } = useApp();
  const [f, setF] = useState(null);
  const list = ws.approvals || [];
  return (
    <div className="stack">
      <Guidance title="Out-of-session decisions (BRD-07).">Board members approve electronically; the decision is recorded when the quorum ({ws.board.quorum}) is reached.</Guidance>
      <Card title="Requests" actions={<button className="btn btn-sm btn-primary" onClick={() => setF({ title: '', detail: '', programId: '' })}>+ Request approval</button>}>
        {!list.length ? <div className="empty-sm">No out-of-session requests.</div> : list.map((a, i) => {
          const yes = Object.values(a.votes || {}).filter((v) => v === 'approve').length;
          const done = yes >= ws.board.quorum;
          const member = ws.board.members.includes(ws.currentUser);
          return (
            <div key={a.id} className="check-row" style={{ gridTemplateColumns: '22px 1fr auto' }}><span className="ic">{done ? '✓' : '○'}</span>
              <span><strong>{a.title}</strong><div className="mini">{a.detail} · raised {fmtDate(a.date)} by {personName(ws, a.by)} · {yes}/{ws.board.quorum} approvals{done ? ' — decided' : ''}</div><div className="mini">{Object.entries(a.votes || {}).map(([pid, v]) => `${personName(ws, pid)}: ${v}`).join('; ')}</div></span>
              <span className="row">{!done && member && !a.votes?.[ws.currentUser] && <><button className="btn btn-sm btn-primary" onClick={() => mutate('Out-of-session vote: approve', (d) => { d.approvals[i].votes = { ...(d.approvals[i].votes || {}), [d.currentUser]: 'approve' }; })}>Approve</button><button className="btn btn-sm" onClick={() => mutate('Out-of-session vote: reject', (d) => { d.approvals[i].votes = { ...(d.approvals[i].votes || {}), [d.currentUser]: 'reject' }; })}>Reject</button></>}{!member && !done && <span className="mini">Only board members vote (viewing as {me?.name})</span>}</span>
            </div>
          );
        })}
      </Card>
      {f && <Modal title="Request out-of-session approval" onClose={() => setF(null)} footer={<><button className="btn" onClick={() => setF(null)}>Cancel</button><button className="btn btn-primary" disabled={!f.title.trim()} onClick={() => { mutate('Out-of-session approval requested', (d) => { d.approvals = [...(d.approvals || []), { id: uid('ap'), ...f, date: todayISO(), by: d.currentUser, votes: {} }]; }); setF(null); }}>Send to board</button></>}>
        <Field label="Decision requested"><TextInput value={f.title} onChange={(v) => setF({ ...f, title: v })} /></Field>
        <Field label="Detail"><TextArea value={f.detail} onChange={(v) => setF({ ...f, detail: v })} /></Field>
        <Field label="Program"><Select value={f.programId} onChange={(v) => setF({ ...f, programId: v })} placeholder="—" options={ws.programs.map((p) => [p.id, `${p.code} ${p.name}`])} /></Field>
      </Modal>}
    </div>
  );
}

function Board() {
  const { ws, mutate } = useApp();
  const b = ws.board;
  const set = (k) => (v) => mutate(`Board ${k}`, (d) => { d.board[k] = v; }, { field: `board:${k}` });
  return (
    <div className="grid g-2" data-layout>
      <Card title="Board configuration (BRD-01)" subtitle="Cross-functional, with IT as an equal member">
        <div className="form-grid">
          <Field label="Name"><TextInput value={b.name} onChange={set('name')} /></Field>
          <Field label="Chair"><PersonSelect ws={ws} value={b.chairId} onChange={set('chairId')} /></Field>
          <Field label="Members" className="full"><MultiChips options={ws.people.map((p) => [p.id, p.name])} value={b.members} onChange={set('members')} /></Field>
          <Field label="Quorum"><NumberInput value={b.quorum} onChange={set('quorum')} /></Field>
          <Field label="Cadence"><TextInput value={b.cadence} onChange={set('cadence')} /></Field>
          <Field label="Terms of reference" className="full"><TextArea value={b.tor} onChange={set('tor')} /></Field>
          <Field label="Delegations (GOV-11)" className="full"><TextArea value={b.delegations} onChange={set('delegations')} rows={2} /></Field>
        </div>
      </Card>
      <Card title="Board policies (BRD-06)" subtitle="Versioned library" actions={<button className="btn btn-sm" onClick={() => mutate('Policy added', (d) => { d.policies.push({ id: uid('pol'), title: 'New policy', type: 'Planning guidelines', version: '1.0', date: todayISO(), text: '' }); })}>+ Policy</button>}>
        {ws.policies.map((p, i) => <div key={p.id} style={{ borderBottom: '1px dashed var(--line)', padding: '8px 0' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><input className="inline-input" style={{ fontWeight: 600, maxWidth: 320 }} value={p.title} onChange={(e) => mutate('Policy title', (d) => { d.policies[i].title = e.target.value; }, { field: `pol:${p.id}` })} aria-label="Policy title" /><span className="row mini">v{p.version} · {fmtDate(p.date)} <button className="btn btn-sm" onClick={() => mutate(`Policy ${p.title} new version`, (d) => { const v = d.policies[i]; d.policyHistory = [...(d.policyHistory || []), { ...v }]; v.version = (Number(v.version) + 0.1).toFixed(1); v.date = todayISO(); })}>New version</button></span></div>
          <div className="mini">{p.type}</div>
          <TextArea value={p.text} onChange={(v) => mutate('Policy text', (d) => { d.policies[i].text = v; }, { field: `polt:${p.id}` })} rows={2} />
        </div>)}
      </Card>
    </div>
  );
}
