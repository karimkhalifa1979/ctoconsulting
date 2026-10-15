// Benefits management maturity diagnostic (VMO-07, Appendix E): a four "ares" report card.
import { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { ARES, MATURITY, PERSON_ROLES } from '../lib/config.js';
import { PageHead, Card, ChartCard, Select, Field, Modal, Guidance, Pill } from '../components/ui.jsx';
import { TrendChart } from '../components/charts.jsx';
import { fmtDate, todayISO, uid } from '../lib/util.js';

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

export default function Maturity() {
  const { ws, mutate } = useApp();
  const [taking, setTaking] = useState(false);
  const [round, setRound] = useState('');
  const rounds = [...new Set(ws.maturity.map((r) => r.date))].sort();
  const current = round || rounds[rounds.length - 1];
  const resp = ws.maturity.filter((r) => r.date === current);
  const areScore = (list, are) => mean(list.flatMap((r) => Object.entries(r.answers).filter(([k]) => k.startsWith(`${are}-`)).map(([, v]) => Number(v))));
  const itemScore = (list, key) => mean(list.map((r) => Number(r.answers[key])).filter(Number.isFinite));
  const byRole = useMemo(() => [...new Set(resp.map((r) => r.role))].map((role) => ({ role, scores: ARES.map((a) => areScore(resp.filter((r) => r.role === role), a.id)) })), [resp]); // eslint-disable-line react-hooks/exhaustive-deps
  const tone = (v) => (v === null ? 'none' : v >= 3.75 ? 'good' : v >= 2.75 ? 'warning' : 'critical');

  return (
    <div className="stack">
      <PageHead eyebrow="Governance" title="Maturity diagnostic" actions={<>
        {rounds.length > 0 && <Select value={current} onChange={setRound} options={rounds.map((d) => [d, `Survey ${fmtDate(d)}`])} aria-label="Survey round" />}
        <button className="btn btn-primary" onClick={() => setTaking(true)}>Take the survey</button>
      </>}>
        A four “ares” report card on how well the organisation manages benefits today — the first practical step in adopting the approach. Distribute it to a cross-section of people, aggregate the results, and track them over time. Statements paraphrase the source’s question list; respondents rate each from 1 (strongly disagree) to 5 (strongly agree).
      </PageHead>
      <div className="kpi-grid">
        {ARES.map((a) => { const v = areScore(resp, a.id); return <div key={a.id} className="card stat"><div className="label">{a.q}</div><div className="value">{v === null ? '—' : v.toFixed(1)}<span className="mini"> / 5</span></div><Pill tone={tone(v)}>{v === null ? 'No responses' : v >= 3.75 ? 'Strength' : v >= 2.75 ? 'Developing' : 'Weakness'}</Pill></div>; })}
        <div className="card stat accent"><div className="label">Respondents</div><div className="value">{resp.length}</div><div className="sub">{fmtDate(current)}</div></div>
      </div>
      <div className="grid g-2" data-layout>
        <ChartCard title="Trend by “are”" subtitle="Average rating per survey round" table={{ columns: [{ label: 'Round', get: (d) => fmtDate(d) }, ...ARES.map((a) => ({ label: a.short, num: true, get: (d) => areScore(ws.maturity.filter((r) => r.date === d), a.id)?.toFixed(2) ?? '—' }))], rows: rounds }}>
          <TrendChart labels={rounds.map((d) => d.slice(0, 7))} series={ARES.map((a, i) => ({ name: a.short, color: `var(--series-${i + 1})`, values: rounds.map((d) => areScore(ws.maturity.filter((r) => r.date === d), a.id)) }))} yMin={1} yMax={5} fmt={(v) => v.toFixed(1)} height={240} />
        </ChartCard>
        <Card title="By role" subtitle="Where perceptions differ, the conversation is worth having" pad={false}>
          <div className="table-wrap"><table className="table compact"><thead><tr><th>Role</th>{ARES.map((a) => <th key={a.id} className="num">{a.short}</th>)}</tr></thead>
            <tbody>{byRole.map((r) => <tr key={r.role}><td>{r.role}</td>{r.scores.map((v, i) => <td key={i} className="num"><Pill tone={tone(v)}>{v === null ? '—' : v.toFixed(1)}</Pill></td>)}</tr>)}</tbody></table></div>
        </Card>
      </div>
      <Card title="Statement detail" subtitle={`Survey of ${fmtDate(current)}`} pad={false}>
        <div className="table-wrap"><table className="table compact"><thead><tr><th>“Are”</th><th>Statement</th><th className="num">Average</th>{rounds.length > 1 && <th className="num">Change</th>}</tr></thead>
          <tbody>{MATURITY.flatMap((g) => g.items.map((text, k) => {
            const key = `${g.are}-${k}`; const v = itemScore(resp, key);
            const prevRound = rounds[rounds.indexOf(current) - 1];
            const pv = prevRound ? itemScore(ws.maturity.filter((r) => r.date === prevRound), key) : null;
            return <tr key={key}><td className="mini">{ARES.find((a) => a.id === g.are).short}</td><td>{text}</td><td className="num"><Pill tone={tone(v)}>{v === null ? '—' : v.toFixed(1)}</Pill></td>{rounds.length > 1 && <td className="num">{pv === null || v === null ? '—' : `${v - pv >= 0 ? '+' : ''}${(v - pv).toFixed(1)}`}</td>}</tr>;
          }))}</tbody></table></div>
      </Card>
      {taking && <Survey onClose={() => setTaking(false)} onSubmit={(rec) => { mutate('Maturity survey response recorded', (d) => { d.maturity.push(rec); }, { action: 'create', object: 'maturity' }); setTaking(false); setRound(rec.date); }} />}
    </div>
  );
}

function Survey({ onClose, onSubmit }) {
  const { ws, me } = useApp();
  const [f, setF] = useState({ role: me?.roles?.[0] || 'Contributor', unitId: me?.unit || ws.areas[0]?.id, answers: {} });
  const total = MATURITY.reduce((a, g) => a + g.items.length, 0);
  const answered = Object.keys(f.answers).length;
  return (
    <Modal title="Benefits management maturity survey" wide onClose={onClose} footer={<><span className="mini" style={{ marginRight: 'auto' }}>{answered} of {total} answered</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={answered < total} onClick={() => onSubmit({ id: uid('mat'), date: todayISO(), role: f.role, unitId: f.unitId, answers: f.answers })}>Submit</button></>}>
      <Guidance>Where you can, think of a recent example. Responses are aggregated by “are”, role and business unit.</Guidance>
      <div className="form-grid" style={{ marginTop: 10 }}>
        <Field label="Your role"><Select value={f.role} onChange={(v) => setF({ ...f, role: v })} options={PERSON_ROLES} /></Field>
        <Field label="Business unit"><Select value={f.unitId} onChange={(v) => setF({ ...f, unitId: v })} options={ws.areas.map((a) => [a.id, a.name])} /></Field>
      </div>
      {MATURITY.map((g) => (
        <div key={g.are}>
          <div className="section-title">{ARES.find((a) => a.id === g.are).q}</div>
          {g.items.map((text, k) => { const key = `${g.are}-${k}`; return (
            <div key={key} className="ctrl-row" style={{ gridTemplateColumns: '1fr 220px' }}><span>{text}</span>
              <div className="seg" role="radiogroup" aria-label={text}>{[1, 2, 3, 4, 5].map((v) => <button key={v} type="button" role="radio" aria-checked={f.answers[key] === v} className={f.answers[key] === v ? 'on' : ''} onClick={() => setF({ ...f, answers: { ...f.answers, [key]: v } })}>{v}</button>)}</div></div>
          ); })}
        </div>
      ))}
    </Modal>
  );
}
