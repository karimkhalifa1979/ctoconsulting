import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Stat, Badge, StackBar, TextArea, includesAll } from '../components/ui.jsx';
import DataGrid from '../components/DataGrid.jsx';
import { TK, DIMENSIONS, DIM, nextId } from '../lib/model.js';
import { engagementApproach, daysOutstanding, countBy } from '../lib/calc.js';
import { fmtDate, isoDate, today, daysFromToday } from '../lib/format.js';

const dimOptions = DIMENSIONS.map((d) => d.code);

export function Stakeholders() {
  const { eng, set } = useStore();
  const rows = eng.stakeholders;
  const named = rows.filter((r) => r.name);
  const byStatus = countBy(named, 'status');
  const quadrant = (inf, int) => engagementApproach(inf, int);
  const quads = ['Keep satisfied', 'Manage closely', 'Monitor', 'Keep informed'];
  return (
    <div className="stack">
      <PageHead eyebrow="Step 2 · Plan" title="Stakeholder register & interview plan">
        Register everyone to be interviewed or engaged. The engagement approach is derived from influence and interest.
      </PageHead>
      <div className="grid g-4">
        <Stat label="Stakeholders" value={named.length} sub={`${Object.keys(countBy(named, 'group')).length} stakeholder groups`} accent />
        <Stat label="Interviews completed" value={`${byStatus.Completed || 0} of ${named.length}`} sub={`${byStatus.Scheduled || 0} scheduled`} />
        <Stat label="Manage closely" value={named.filter((r) => quadrant(r.influence, r.interest) === 'Manage closely').length} sub="High influence and interest" />
        <Stat label="Next interview" value={(() => { const n = named.filter((r) => r.date && daysFromToday(r.date) >= 0 && r.status !== 'Completed').sort((a, b) => a.date.localeCompare(b.date))[0]; return n ? fmtDate(n.date) : '—'; })()} sub={(() => { const n = named.filter((r) => r.date && daysFromToday(r.date) >= 0 && r.status !== 'Completed').sort((a, b) => a.date.localeCompare(b.date))[0]; return n ? n.name : 'None scheduled'; })()} />
      </div>
      <div className="grid g-21">
        <Card title="Register" pad={false}>
          <DataGrid rows={rows} onChange={(r) => set('stakeholders', r)} idPrefix="S" idWidth={2} entity="stakeholder" titleKey="name"
            example={TK.stakeholderExample} filters={['group', 'status']} newRow={() => ({ status: 'Not scheduled' })}
            columns={[
              { key: 'name', label: 'Name', width: 150 },
              { key: 'role', label: 'Role / title', width: 170 },
              { key: 'unit', label: 'Business unit', width: 140 },
              { key: 'group', label: 'Stakeholder group', type: 'select', options: eng.lists['Stakeholder group'], width: 190 },
              { key: 'influence', label: 'Influence', type: 'select', options: eng.lists['High / Medium / Low'], width: 90 },
              { key: 'interest', label: 'Interest', type: 'select', options: eng.lists['High / Medium / Low'], width: 90 },
              { key: 'approach', label: 'Engagement approach', calc: (r) => engagementApproach(r.influence, r.interest), badge: true, width: 130 },
              { key: 'dims', label: 'Dimensions to cover', width: 130, help: 'e.g. D04; D06' },
              { key: 'date', label: 'Interview date', type: 'date', width: 130 },
              { key: 'interviewer', label: 'Interviewer', width: 130 },
              { key: 'status', label: 'Status', type: 'select', options: eng.lists['Interview status'], width: 120 },
              { key: 'notes', label: 'Key themes / notes', type: 'long', width: 260 },
            ]} />
        </Card>
        <div className="stack">
          <Card title="Influence / interest map">
            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr', gridTemplateRows: '1fr 1fr 22px', gap: 6, minHeight: 320 }}>
              <div style={{ gridRow: '1 / 3', writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'center', fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>Influence →</div>
              {quads.map((qd) => {
                const people = named.filter((r) => quadrant(r.influence, r.interest) === qd || (qd === 'Monitor' && !quadrant(r.influence, r.interest)));
                const bg = { 'Manage closely': '#fdecec', 'Keep satisfied': '#fdf3e9', 'Keep informed': '#eaf2fc', Monitor: '#f3f5f8' }[qd];
                return (
                  <div key={qd} style={{ background: bg, borderRadius: 8, padding: 8, fontSize: 12 }}>
                    <div className="strong" style={{ color: 'var(--brand-navy)', marginBottom: 4 }}>{qd} <span className="muted">({people.length})</span></div>
                    {people.slice(0, 8).map((p) => <div key={p.id} className="clamp-2">{p.name}</div>)}
                    {people.length > 8 && <div className="muted">+{people.length - 8} more</div>}
                  </div>
                );
              })}
              <div />
              <div style={{ gridColumn: '2 / 4', textAlign: 'center', fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>Interest →</div>
            </div>
          </Card>
          <Card title="Interview progress">
            <StackBar segments={eng.lists['Interview status'].map((s, i) => ({ label: s, value: byStatus[s] || 0, color: ['#b9c0ca', '#2a78d6', '#1f9d58', '#e07676'][i] }))} />
          </Card>
        </div>
      </div>
    </div>
  );
}

export function Interviews() {
  const { eng, set } = useStore();
  const groups = [...new Set(eng.interviews.map((g) => g.group))];
  const [group, setGroup] = useState(groups[0]);
  const [dim, setDim] = useState('');
  const [q, setQ] = useState('');
  const list = eng.interviews.filter((g) => g.group === group && (!dim || g.dims.includes(dim) || g.dims.includes('All')) && includesAll(`${g.question} ${g.probe} ${g.notes}`, q));
  const people = eng.stakeholders.filter((s) => s.group === group && s.name);
  const update = (id, patch) => set('interviews', eng.interviews.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const addQuestion = () => {
    const n = Math.max(0, ...eng.interviews.filter((g) => g.group === group).map((g) => Number(g.n) || 0)) + 1;
    set('interviews', [...eng.interviews, { id: nextId(eng.interviews, 'IG', 3), group, n, question: '', dims: '', probe: '', notes: '', custom: true }]);
  };
  return (
    <div className="stack">
      <PageHead eyebrow="Step 2 · Plan" title="Interview guides">
        Core questions for ten stakeholder groups, mapped to dimensions. Tailor them before each interview and record notes against each question.
      </PageHead>
      <div className="callout navy small">{TK.interviewNote}</div>
      <div className="chips">
        {groups.map((g) => <button key={g} className={`chip ${g === group ? 'on' : ''}`} onClick={() => setGroup(g)}>{g} ({eng.interviews.filter((x) => x.group === g).length})</button>)}
      </div>
      <div className="grid g-21">
        <Card title={group} subtitle={`${list.length} questions`} actions={<button className="btn btn-sm btn-primary" onClick={addQuestion}>+ Add question</button>} pad={false}>
          <div className="filters" style={{ padding: '12px 16px 0' }}>
            <input type="search" placeholder="Search questions and notes…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={dim} onChange={(e) => setDim(e.target.value)}>
              <option value="">All dimensions</option>
              {DIMENSIONS.map((d) => <option key={d.code} value={d.code}>{d.code} {d.short}</option>)}
            </select>
          </div>
          {list.map((g) => (
            <div key={g.id} className="q-row" style={{ gridTemplateColumns: '40px minmax(0,1fr)' }}>
              <div className="qid">{g.n}</div>
              <div>
                {g.custom
                  ? <TextArea rows={2} value={g.question} onChange={(v) => update(g.id, { question: v })} placeholder="Interview question" />
                  : <div className="qtext">{g.question}</div>}
                <div className="row" style={{ gap: 6, margin: '4px 0' }}>
                  {String(g.dims).split(';').map((x) => x.trim()).filter(Boolean).map((x) => <span key={x} className="badge badge-teal" title={DIM[x]?.name}>{x} {DIM[x]?.short || ''}</span>)}
                  {g.custom && <input type="text" style={{ maxWidth: 200 }} value={g.dims} placeholder="Dimensions e.g. D04; D06" onChange={(e) => update(g.id, { dims: e.target.value })} />}
                </div>
                {g.custom
                  ? <input type="text" value={g.probe} placeholder="Probe / follow-up" onChange={(e) => update(g.id, { probe: e.target.value })} />
                  : g.probe && <div className="small muted"><strong>Probe:</strong> {g.probe}</div>}
                <div className="mt-8"><TextArea rows={2} value={g.notes} onChange={(v) => update(g.id, { notes: v })} placeholder="Interview notes" /></div>
                {g.custom && <button className="btn btn-xs btn-danger mt-8" onClick={() => set('interviews', eng.interviews.filter((x) => x.id !== g.id))}>Remove question</button>}
              </div>
            </div>
          ))}
          {!list.length && <div className="empty">No questions match.</div>}
        </Card>
        <div className="stack">
          <Card title="Stakeholders in this group">
            {people.length ? (
              <table className="table compact">
                <tbody>{people.map((p) => <tr key={p.id}><td className="strong">{p.name}<div className="xsmall muted">{p.role}</div></td><td className="nowrap">{fmtDate(p.date)}</td><td><Badge v={p.status} /></td></tr>)}</tbody>
              </table>
            ) : <p className="small muted">No stakeholders registered for this group yet.</p>}
          </Card>
          <Card title="Coverage by dimension" subtitle="Questions in this guide per dimension">
            <div className="chips">
              {DIMENSIONS.map((d) => {
                const n = eng.interviews.filter((g) => g.group === group && (g.dims.includes(d.code) || g.dims.includes('All'))).length;
                return <span key={d.code} className={`badge ${n ? 'badge-teal' : ''}`} title={d.name}>{d.code} · {n}</span>;
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function Documents() {
  const { eng, set } = useStore();
  const rows = eng.documents;
  const counts = countBy(rows, 'status');
  const overdue = rows.filter((d) => d.due && !d.received && daysFromToday(d.due) < 0 && d.status !== 'Not available').length;
  const colors = { 'Not requested': '#cfd7e2', Requested: '#2a78d6', Received: '#1f9d58', 'Partially received': '#f2c14e', 'Not available': '#e07676' };
  const requestAll = () => {
    const t = isoDate(today());
    const due = new Date(today()); due.setDate(due.getDate() + 14);
    set('documents', rows.map((d) => (d.status === 'Not requested' ? { ...d, status: 'Requested', requested: t, due: isoDate(due) } : d)));
  };
  const coverage = useMemo(() => DIMENSIONS.map((d) => {
    const ds = rows.filter((x) => String(x.dims).includes(d.code));
    return { d, total: ds.length, received: ds.filter((x) => x.status === 'Received' || x.status === 'Partially received').length };
  }), [rows]);
  return (
    <div className="stack">
      <PageHead eyebrow="Step 2 · Plan" title="Document & data request list"
        actions={<button className="btn" onClick={requestAll} disabled={!counts['Not requested']}>Mark {counts['Not requested'] || 0} unrequested as requested today</button>}>
        Pre-populated with the artefacts typically needed for an operating model assessment. Remove items that do not apply and add client-specific requests.
      </PageHead>
      <div className="grid g-4">
        <Stat label="Documents received" value={`${counts.Received || 0} of ${rows.length}`} sub={`${counts['Partially received'] || 0} partially received`} accent />
        <Stat label="Outstanding" value={(counts.Requested || 0) + (counts['Partially received'] || 0)} sub={`${overdue} overdue`} />
        <Stat label="Not available" value={counts['Not available'] || 0} sub="Absence may itself be a finding" />
        <Card><StackBar segments={eng.lists['Document status'].map((s) => ({ label: s, value: counts[s] || 0, color: colors[s] }))} /></Card>
      </div>
      <Card title="Requests" pad={false}>
        <DataGrid rows={rows} onChange={(r) => set('documents', r)} idPrefix="DR" idWidth={2} entity="document" titleKey="document" filters={['priority', 'status']}
          newRow={() => ({ status: 'Not requested', priority: 'Medium' })}
          columns={[
            { key: 'document', label: 'Document / artefact', width: 300, type: 'long' },
            { key: 'dims', label: 'Dimension(s)', width: 110 },
            { key: 'priority', label: 'Priority', type: 'select', options: eng.lists['High / Medium / Low'], width: 90 },
            { key: 'owner', label: 'Likely owner', width: 150 },
            { key: 'requestedFrom', label: 'Requested from', width: 150 },
            { key: 'requested', label: 'Date requested', type: 'date', width: 130 },
            { key: 'due', label: 'Date due', type: 'date', width: 130 },
            { key: 'received', label: 'Date received', type: 'date', width: 130 },
            { key: 'status', label: 'Status', type: 'select', options: eng.lists['Document status'], width: 140 },
            { key: 'days', label: 'Days outstanding', calc: (d) => daysOutstanding(d), width: 90 },
            { key: 'notes', label: 'Notes', type: 'long', width: 220 },
          ]} />
      </Card>
      <Card title="Evidence coverage by dimension" subtitle="Documents received or partially received, of those requested for each dimension">
        <div className="dim-tiles">
          {coverage.map(({ d, total, received }) => (
            <div key={d.code} className="dim-tile m0" style={{ background: total && received / total >= 0.7 ? '#e3f4ea' : total && received / total >= 0.4 ? '#fff4d9' : '#fbe3e3', cursor: 'default' }}>
              <div className="t">{d.code} · {d.short}</div>
              <div className="v">{received}/{total}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export { dimOptions };
