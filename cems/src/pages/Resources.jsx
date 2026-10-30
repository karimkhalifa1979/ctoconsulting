// Resource management (RES-001..011): capacity against allocations by week, utilisation, people
// and skills, resource requests with candidate matching, clearance expiries, leave and cost rates.
import { useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { post } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { Register } from '../components/Record.jsx';
import { PageHead, RouteTabs, Card, Async, Table, Badge, D, Seg, Modal, Meter, Empty, Alert, Money, useAction } from '../components/ui.jsx';
import { fmtPct, fmtDate, fmtNum } from '../../shared/format.js';
import { addDays, todayIn, weekStart } from '../../shared/dates.js';

export default function Resources() {
  const { me } = useSession();
  return (
    <>
      <PageHead title="Resources" sub="Capacity, allocations and utilisation across the Firm; tentative allocations are shown separately from confirmed ones (RES-004)." />
      <RouteTabs tabs={[
        { to: '/resources', label: 'Capacity', end: true },
        { to: '/resources/utilisation', label: 'Utilisation' },
        { to: '/resources/requests', label: 'Requests' },
        { to: '/resources/people', label: 'People and skills' },
        { to: '/resources/leave', label: 'Leave' },
        { to: '/resources/expiries', label: 'Clearance expiries' },
        me.can.costRates && { to: '/resources/rates', label: 'Cost rates' },
      ]} />
      <Routes>
        <Route index element={<Capacity />} />
        <Route path="utilisation" element={<Utilisation />} />
        <Route path="requests" element={<Requests />} />
        <Route path="people" element={<Register entity="person" title="People" sub="Grade, practice, location, employment type, standard hours, skills, clearances and certifications (RES-001, RES-002)." />} />
        <Route path="leave" element={<Register entity="leave" title="Leave" sub="Planned leave reduces availability in capacity and forecasts (RES-005)." />} />
        <Route path="expiries" element={<Expiries />} />
        <Route path="rates" element={<Register entity="cost_rate" title="Cost rates" sub="Salary-derived hourly cost by person or grade, effective-dated; visible to finance only (FIN-005, ACC-003)." />} />
      </Routes>
    </>
  );
}

function Capacity() {
  const [f, setF] = useState({ weeks: 8, group: 'person', from: weekStart(todayIn('Australia/Sydney')) });
  const q = useApi('/api/resources/capacity', f);
  const cls = (c) => (c.flag === 'Over' ? 'cap-over' : c.flag === 'Under' ? 'cap-under' : c.flag === 'Unavailable' ? 'cap-na' : 'cap-ok');
  return (
    <div className="stack">
      <div className="filters">
        <Seg value={f.group} onChange={(v) => setF({ ...f, group: v })} options={[{ value: 'person', label: 'By person' }, { value: 'grade', label: 'By grade' }, { value: 'practice', label: 'By practice' }]} />
        <Seg value={String(f.weeks)} onChange={(v) => setF({ ...f, weeks: Number(v) })} options={[{ value: '8', label: '8 weeks' }, { value: '13', label: '13 weeks' }, { value: '26', label: '26 weeks' }]} />
        <button className="btn btn-sm" onClick={() => setF({ ...f, from: addDays(f.from, -7 * 4) })}>‹ Earlier</button>
        <button className="btn btn-sm" onClick={() => setF({ ...f, from: weekStart(todayIn('Australia/Sydney')) })}>This week</button>
        <button className="btn btn-sm" onClick={() => setF({ ...f, from: addDays(f.from, 7 * 4) })}>Later ›</button>
      </div>
      <Async q={q}>{(d) => (
        <>
          <Card title="Allocated against available hours" sub="Each cell is confirmed plus tentative hours as a share of available hours (after leave and public holidays)." flush>
            <div className="table-wrap">
              <table className="table compact cap-table">
                <thead><tr><th>{f.group === 'person' ? 'Person' : f.group === 'grade' ? 'Grade' : 'Practice'}</th>{d.weeks.map((w) => <th key={w} className="num">{fmtDate(w).slice(0, 6)}</th>)}</tr></thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.id || r.name}>
                      <td className="nowrap"><span className="strong">{r.name}</span>{r.grade && f.group === 'person' && <div className="tiny muted">{r.grade}{r.practice ? ` · ${r.practice}` : ''}</div>}</td>
                      {r.cells.map((c) => (
                        <td key={c.week} className={`num ${cls(c)}`} title={`Available ${fmtNum(c.available)} h · confirmed ${fmtNum(c.confirmed)} h · tentative ${fmtNum(c.tentative)} h`}>
                          {c.utilisation == null ? '—' : fmtPct(c.utilisation)}{c.tentative > 0 && <sup title="Includes tentative hours">t</sup>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-foot legend">
              <span><i className="box cap-ok" />60–105% allocated</span>
              <span><i className="box cap-under" />Under 60%</span>
              <span><i className="box cap-over" />Over-allocated</span>
              <span><i className="box cap-na" />No availability</span>
              <span><sup>t</sup> includes tentative</span>
            </div>
          </Card>
          <Card title="Unfilled demand" sub="Placeholder allocations and open resource requests, hours per week (RES-003, RES-008)." flush>
            <Table rows={d.demand.map((x, i) => ({ ...x, id: x.id || `p${i}` }))} empty="No unfilled demand." columns={[
              { key: 'kind', label: 'Type', render: (x) => <Badge tone={x.kind === 'Request' ? 'teal' : 'grey'}>{x.kind}</Badge> },
              { key: 'role', label: 'Role', render: (x) => <span>{x.role}{x.critical && <Badge tone="red">Critical</Badge>}</span> },
              { key: 'project', label: 'Project', render: (x) => <Link to={`/projects/${x.project_id}/resources`}>{x.project}</Link> },
              { key: 'start_date', label: 'From', render: (x) => <D v={x.start_date} /> },
              { key: 'end_date', label: 'To', render: (x) => <D v={x.end_date} /> },
              ...d.weeks.map((w, i) => ({ key: w, label: fmtDate(w).slice(0, 6), num: true, sort: false, render: (x) => (x.cells[i] ? fmtNum(x.cells[i]) : '') })),
            ]} />
          </Card>
        </>
      )}</Async>
    </div>
  );
}

function Utilisation() {
  const [group, setGroup] = useState('person');
  const q = useApi('/api/resources/utilisation', { group });
  return (
    <Async q={q}>{(d) => (
      <Card title="Utilisation" sub={`Billable hours from approved time against available hours, ${fmtDate(d.from)} to ${fmtDate(d.to)}; the mark shows planned utilisation from allocations (RES-006).`} flush
        actions={<Seg value={group} onChange={setGroup} options={[{ value: 'person', label: 'Person' }, { value: 'grade', label: 'Grade' }, { value: 'practice', label: 'Practice' }]} />}>
        <Table rows={d.rows.map((r) => ({ ...r, id: r.id || r.name }))} initialSort={{ key: 'actualUtilisation', dir: -1 }} columns={[
          { key: 'name', label: group === 'person' ? 'Person' : group === 'grade' ? 'Grade' : 'Practice', render: (r) => <span><span className="strong">{r.name}</span>{r.grade && group === 'person' && <div className="tiny muted">{r.grade}</div>}</span> },
          { key: 'actualUtilisation', label: 'Billable utilisation', sort: (r) => r.actualUtilisation ?? -1, render: (r) => <div className="flex" style={{ minWidth: 220 }}><div className="flex-1"><Meter value={r.actualUtilisation || 0} mark={r.plannedUtilisation} tone={r.actualUtilisation < 0.6 ? 'warn' : ''} /></div><span className="small tabular">{fmtPct(r.actualUtilisation)}</span></div> },
          { key: 'plannedUtilisation', label: 'Planned', num: true, render: (r) => fmtPct(r.plannedUtilisation) },
          { key: 'billable', label: 'Billable hours', num: true, render: (r) => fmtNum(r.billable) },
          { key: 'nonBillable', label: 'Non-billable', num: true, render: (r) => fmtNum(r.nonBillable) },
          { key: 'available', label: 'Available', num: true, render: (r) => fmtNum(r.available) },
        ]} />
      </Card>
    )}</Async>
  );
}

function Requests() {
  const [matching, setMatching] = useState(null);
  const [key, setKey] = useState(0);
  return (
    <>
      <Register key={key} entity="resource_request" title="Resource requests" sub="Requests from project managers; match candidates by skills, clearance, availability and cost, then propose or fulfil (RES-003, RES-007)." initialOpenOnly
        columns={[
          { key: 'ref', label: 'ID' },
          { key: 'role', label: 'Role', render: (r) => <span>{r.role}{r.critical && <Badge tone="red">Critical</Badge>}</span> },
          { key: 'skills', label: 'Skills', render: (r) => <span className="small">{r.skills}</span> },
          { key: 'clearance', label: 'Clearance' },
          { key: 'start_date', label: 'From', render: (r) => <D v={r.start_date} /> },
          { key: 'end_date', label: 'To', render: (r) => <D v={r.end_date} /> },
          { key: 'hours_per_week', label: 'Hours / week', num: true },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={r.status === 'Open' ? 'amber' : r.status === 'Fulfilled' ? 'green' : ''}>{r.status}</Badge> },
          { key: 'match', label: '', sort: false, render: (r) => (['Open', 'Proposed'].includes(r.status) ? <button className="btn btn-xs" onClick={(e) => { e.stopPropagation(); setMatching(r); }}>Find people</button> : null) },
        ]} />
      {matching && <Match req={matching} onClose={() => setMatching(null)} onDone={() => { setMatching(null); setKey((k) => k + 1); }} />}
    </>
  );
}

function Match({ req, onClose, onDone }) {
  const q = useApi(`/api/resources/requests/${req.id}/match`);
  const [run, busy] = useAction();
  const act = async (personId, action) => {
    const out = await run(() => post(`/api/e/resource_request/${req.id}/do/${action}`, { person_id: personId }), action === 'fulfil' ? 'Request fulfilled and allocation created' : 'Person proposed');
    if (out !== undefined) onDone();
  };
  return (
    <Modal title={`Candidates for ${req.role}`} wide onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <p className="small muted">{req.skills || 'No skills specified'} · clearance {req.clearance || 'none'} · {fmtDate(req.start_date)} to {fmtDate(req.end_date)} · {req.hours_per_week} h/week</p>
      <Async q={q}>{(rows) => (!rows.length ? <Empty>No candidates.</Empty> : (
        <Table compact rows={rows.map((r) => ({ ...r, id: r.person_id }))} columns={[
          { key: 'score', label: 'Fit', num: true, render: (r) => <b>{r.score}</b> },
          { key: 'name', label: 'Person', render: (r) => <span>{r.name}<div className="tiny muted">{r.grade}{r.practice ? ` · ${r.practice}` : ''}{r.location ? ` · ${r.location}` : ''}</div></span> },
          { key: 'skills', label: 'Matching skills', sort: false, render: (r) => <span className="small">{r.skills.join(', ') || '—'}</span> },
          { key: 'clearanceOk', label: 'Clearance', render: (r) => (r.clearanceOk ? <Badge tone="green">Meets</Badge> : <Badge tone="red">Below</Badge>) },
          { key: 'freeHoursPerWeek', label: 'Free h/week', num: true },
          r0(rows) && { key: 'cost', label: 'Cost rate', num: true, render: (r) => <Money v={r.cost} decimals={2} /> },
          { key: 'act', label: '', sort: false, render: (r) => <span className="flex"><button className="btn btn-xs" disabled={busy} onClick={() => act(r.person_id, 'propose')}>Propose</button><button className="btn btn-xs btn-primary" disabled={busy} onClick={() => act(r.person_id, 'fulfil')}>Fulfil</button></span> },
        ].filter(Boolean)} />
      ))}</Async>
      <Alert tone="info">Fulfilling creates a confirmed allocation on the project and notifies the project manager.</Alert>
    </Modal>
  );
}
const r0 = (rows) => rows.some((r) => r.cost !== undefined);

function Expiries() {
  const q = useApi('/api/resources/expiries');
  return (
    <Card title="Clearances and certifications expiring" sub="Within the alert window; people with expired clearances cannot be allocated where the engagement requires them (RES-002)." flush>
      <Async q={q}>{(rows) => (
        <Table rows={rows.map((r, i) => ({ ...r, id: i }))} empty="Nothing expiring." columns={[
          { key: 'name', label: 'Person' },
          { key: 'kind', label: 'Type' },
          { key: 'item', label: 'Clearance or certification' },
          { key: 'expiry', label: 'Expiry', render: (r) => <span className={r.expired ? 'neg strong' : ''}><D v={r.expiry} />{r.expired ? ' (expired)' : ''}</span> },
        ]} />
      )}</Async>
    </Card>
  );
}
