// Training (TRN-001 to TRN-006): needs analysis by group and role, interventions, sessions with
// enrolment, attendance and completion (entered here or imported from the learning management system),
// proficiency evidence, post-training support, and completion reporting against targets.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, Modal, Kpi, Meter } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import Register from '../../ui/Register.jsx';
import { RefPicker } from '../../ui/fields.jsx';
import { BarChart } from '../../charts/index.jsx';
import { managersOf } from './Managers.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, fmtNum, fmtPct, label } from '../../lib/format.js';
import { asArray, parseCsv, personName, round, sortBy, uniq } from '../../../shared/util.js';
import { parseAuDate } from '../../../shared/dates.js';

export default function Training() {
  const { m, base } = useIniPage();
  const [tab, setTab] = useTab('completion');
  if (!m) return <Spinner />;
  return (
    <>
      <PageHead eyebrow="Core plan · Training Plan" title="Training" actions={<Link className="btn btn-primary" to={`${base}/artefacts?type=trainingPlan`}><Icon name="file" />Training Plan</Link>}>
        Build Knowledge and Ability: what each group needs to learn, how and when they learn it, whether they completed it and whether they can now do it.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'completion', label: 'Completion and proficiency' },
        { id: 'needs', label: 'Needs analysis', count: m.tnas.length },
        { id: 'interventions', label: 'Interventions', count: m.interventions.length },
        { id: 'sessions', label: 'Sessions', count: m.sessions.length },
        { id: 'proficiency', label: 'Proficiency evidence', count: m.proficiency.length },
        { id: 'support', label: 'Post-training support', count: m.supports.length },
      ]} />
      {tab === 'completion' && <Completion />}
      {tab === 'needs' && <Needs />}
      {tab === 'interventions' && <Interventions />}
      {tab === 'sessions' && <Sessions />}
      {tab === 'proficiency' && <Register type="proficiency" title="Proficiency evidence" sub="Assessment results, observed task completion and supervisor sign-off that show people can perform at the required level (TRN-004)." facets={['evidenceType', 'result']} />}
      {tab === 'support' && <Register type="supportArrangement" title="Post-training support" sub="Floor support, help desk, coaching and super users that reinforce Ability after training (TRN-004)." facets={['kind']} />}
    </>
  );
}

// Who must complete which interventions, and who has: the basis of every completion figure here.
export function trainingIndex(m) {
  const enrolled = {};
  const completed = {};
  for (const s of m.sessions) {
    if (s.status === 'cancelled') continue;
    for (const e of asArray(s.enrolments)) {
      (enrolled[e.stakeholderId] ||= new Set()).add(s.interventionId);
      if (e.completed) (completed[e.stakeholderId] ||= new Set()).add(s.interventionId);
    }
  }
  const required = {};
  for (const g of m.groups) {
    const ivs = m.interventions.filter((iv) => asArray(iv.audienceGroupIds).includes(g.id)).map((iv) => iv.id);
    if (!ivs.length) continue;
    for (const sid of g.memberIds) for (const id of ivs) (required[sid] ||= new Set()).add(id);
  }
  const rollup = (people) => {
    let need = 0, done = 0, all = 0;
    for (const sid of people) {
      const req = [...(required[sid] || [])];
      if (!req.length) continue;
      need += req.length;
      const c = req.filter((id) => completed[sid]?.has(id)).length;
      done += c;
      if (c === req.length) all++;
    }
    return { people: people.filter((sid) => required[sid]?.size).length, need, done, all, pct: need ? round((done / need) * 100) : null };
  };
  return { enrolled, completed, required, rollup };
}

function Completion() {
  const { m, base, drawer } = useIniPage();
  const ix = useMemo(() => trainingIndex(m), [m]);
  const groups = m.groups.filter((g) => g.training.applicable);
  const targets = m.interventions.map((iv) => iv.targetCompletion).filter((v) => v != null);
  const target = targets.length ? Math.round(targets.reduce((a, b) => a + b, 0) / targets.length) : 90;
  const everyone = uniq(Object.keys(ix.required));
  const overall = ix.rollup(everyone);
  const changeRole = m.interventions.filter((iv) => iv.forChangeRoles);
  const prof = m.proficiency;
  const proficient = prof.filter((p) => p.result === 'proficient').length;
  const upcoming = m.sessions.filter((s) => s.status === 'scheduled' && s.date >= m.today);
  const changeRoleEnrolments = m.sessions.filter((s) => s.status !== 'cancelled' && changeRole.some((iv) => iv.id === s.interventionId)).flatMap((s) => asArray(s.enrolments));
  const managers = managersOf(m).map((x) => ({ ...x, r: ix.rollup(x.team) })).filter((x) => x.r.need);
  const people = everyone.map((sid) => m.byId.stakeholder[sid]).filter(Boolean);
  const byLocation = Object.entries(people.reduce((acc, s) => { (acc[s.location || 'Not recorded'] ||= []).push(s.id); return acc; }, {})).map(([loc, ids]) => ({ key: loc, label: loc, ...ix.rollup(ids) }));
  const byRole = Object.entries(people.reduce((acc, s) => { (acc[s.positionTitle || 'Not recorded'] ||= []).push(s.id); return acc; }, {})).map(([role, ids]) => ({ key: role, label: role, ...ix.rollup(ids) }));
  const below = (v, t = target) => v != null && v < t;
  return (
    <div className="stack">
      {!changeRole.length && (
        <div className="callout warn small"><strong>No change-role training.</strong> The Training Plan should include training for sponsors and people managers on their roles in the change (TRN-006). <button type="button" className="btn btn-xs" onClick={() => drawer.open({ type: 'trainingIntervention', defaults: { title: 'Leading your team through the change', modality: 'virtual', forChangeRoles: true, targetCompletion: 100 } })}>Add one</button></div>
      )}
      <div className="kpis">
        <Kpi label="Training completion" value={fmtPct(overall.pct)} sub={`${fmtNum(overall.done)} of ${fmtNum(overall.need)} required completions · target ${target}%`} tone={below(overall.pct) ? 'warning' : 'good'} />
        <Kpi label="People fully trained" value={fmtNum(overall.all)} sub={`of ${fmtNum(overall.people)} recorded people in scope`} />
        <Kpi label="Proficient" value={prof.length ? fmtPct((proficient / prof.length) * 100) : '—'} sub={`${proficient} of ${prof.length} with evidence`} />
        <Kpi label="Sessions scheduled" value={upcoming.length} sub={upcoming[0] ? `Next ${fmtDate(upcoming[0].date)}` : 'None scheduled'} />
        <Kpi label="Change-role training" value={changeRoleEnrolments.length ? fmtPct((changeRoleEnrolments.filter((e) => e.completed).length / changeRoleEnrolments.length) * 100) : changeRole.length ? '—' : 'None'} sub={`${changeRoleEnrolments.filter((e) => e.completed).length} of ${changeRoleEnrolments.length} sponsors and managers enrolled`} />
      </div>
      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <Card title="Completion by impacted group" sub={`Required interventions completed by each group's recorded members, against the average completion target of ${target}% (TRN-005).`}>
          {groups.length ? <BarChart data={groups.map((g) => ({ key: g.id, label: g.name, value: g.training.pct ?? 0, sub: `${g.training.completed} of ${g.training.denominator} fully trained` }))} max={100} unit="%" format={(v) => fmtNum(v)} threshold={target} colorOf={(d) => (d.value < target ? 'var(--st-warning)' : 'var(--series-1)')} ariaLabel="Training completion by group" /> : <Empty title="No training targets a group yet" />}
        </Card>
        <Card title="Completion by intervention" flush>
          <table className="tbl">
            <thead><tr><th>Intervention</th><th className="num">Enrolled</th><th className="num">Completed</th><th style={{ width: 160 }}>Against target</th></tr></thead>
            <tbody>
              {m.interventions.map((iv) => {
                const reqPeople = everyone.filter((sid) => ix.required[sid]?.has(iv.id));
                const enrolledIds = uniq(m.sessions.filter((s) => s.interventionId === iv.id && s.status !== 'cancelled').flatMap((s) => asArray(s.enrolments).map((e) => e.stakeholderId)));
                const pool = reqPeople.length ? reqPeople : enrolledIds;
                const done = pool.filter((sid) => ix.completed[sid]?.has(iv.id)).length;
                const pct = pool.length ? round((done / pool.length) * 100) : null;
                return (
                  <tr key={iv.id} className="clickable" onClick={() => drawer.open({ type: 'trainingIntervention', id: iv.id })}>
                    <td><strong>{iv.title}</strong><span className="tiny muted sub-line">{label('trainingModality', iv.modality)}{iv.forChangeRoles ? ' · change roles' : ''}</span></td>
                    <td className="num">{enrolledIds.length}</td>
                    <td className="num">{done}</td>
                    <td>{pct == null ? <span className="muted small">No participants</span> : <div className="meter-row"><Meter value={pct} label={`${pct}% of a ${iv.targetCompletion ?? 90}% target`} tone={pct < (iv.targetCompletion ?? 90) ? 'warn' : 'good'} /><span className="meter-val">{pct}%</span></div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="grid g-2">
        <Card title="By people manager" sub="Completion across each manager's recorded team members" flush>
          {managers.length ? (
            <table className="tbl">
              <thead><tr><th>Manager</th><th className="num">Team in scope</th><th className="num">Fully trained</th><th className="num">Completion</th></tr></thead>
              <tbody>{sortBy(managers, (x) => x.r.pct ?? 0).map((x) => <tr key={x.id}><td><Link to={`${base}/stakeholders/${x.id}`}>{x.name}</Link></td><td className="num">{x.r.people}</td><td className="num">{x.r.all}</td><td className="num">{below(x.r.pct) ? <Badge tone="warning" icon="alert">{fmtPct(x.r.pct)}</Badge> : fmtPct(x.r.pct)}</td></tr>)}</tbody>
            </table>
          ) : <Empty title="No managers with team members in scope" />}
        </Card>
        <Card title="By location and role" flush>
          <table className="tbl">
            <thead><tr><th>Location</th><th className="num">People</th><th className="num">Completion</th></tr></thead>
            <tbody>{sortBy(byLocation, 'label').map((x) => <tr key={x.key}><td>{x.label}</td><td className="num">{x.people}</td><td className="num">{below(x.pct) ? <Badge tone="warning" icon="alert">{fmtPct(x.pct)}</Badge> : fmtPct(x.pct)}</td></tr>)}</tbody>
          </table>
          <table className="tbl" style={{ borderTop: '1px solid var(--line)' }}>
            <thead><tr><th>Role</th><th className="num">People</th><th className="num">Completion</th></tr></thead>
            <tbody>{sortBy(byRole, (x) => -x.people).slice(0, 12).map((x) => <tr key={x.key}><td>{x.label}</td><td className="num">{x.people}</td><td className="num">{below(x.pct) ? <Badge tone="warning" icon="alert">{fmtPct(x.pct)}</Badge> : fmtPct(x.pct)}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function Needs() {
  const { m } = useIniPage();
  const gapRows = m.tnas.map((t) => ({ ...t, gap: t.requiredCapability != null && t.currentCapability != null ? t.requiredCapability - t.currentCapability : null }));
  return (
    <Register type="tna" rows={gapRows} title="Training needs analysis" sub="Knowledge and skills each impacted group and role needs, the current and required capability, and the learning objectives that close the gap (TRN-001)." facets={['priority']}
      append={[
        { key: 'gap', label: 'Gap', align: 'num', render: (t) => (t.gap == null ? '—' : t.gap >= 2 ? <Badge tone="serious">{t.gap}</Badge> : t.gap), value: (t) => t.gap ?? -1 },
        { key: 'ivs', label: 'Interventions', render: (t) => (asArray(t.interventionIds).length ? asArray(t.interventionIds).map((id) => m.byId.trainingIntervention[id]?.title).filter(Boolean).join(', ') : <Badge tone="warning" icon="alert">None</Badge>), value: (t) => asArray(t.interventionIds).length },
      ]} />
  );
}

function Interventions() {
  const { m } = useIniPage();
  return (
    <Register type="trainingIntervention" title="Training interventions" sub="Instructor-led, virtual, eLearning, on-the-job, job aid, simulation and sandbox practice, timed relative to go-live (TRN-002). Mark sponsor and people manager training as change-role training (TRN-006)." facets={['modality']}
      append={[
        { key: 'sessions', label: 'Sessions', align: 'num', render: (iv) => m.sessions.filter((s) => s.interventionId === iv.id && s.status !== 'cancelled').length, value: (iv) => m.sessions.filter((s) => s.interventionId === iv.id).length },
        { key: 'roles', label: 'Change roles', render: (iv) => (iv.forChangeRoles ? <Badge tone="info">Change-role training</Badge> : ''), value: (iv) => (iv.forChangeRoles ? 1 : 0) },
      ]} />
  );
}

function Sessions() {
  const { m, drawer, canDo } = useIniPage();
  const [attendance, setAttendance] = useState(null);
  const [importing, setImporting] = useState(false);
  const rows = sortBy(m.sessions, (s) => s.date || '');
  const cols = [
    { key: 'date', label: 'Date', render: (s) => <span className="nowrap">{fmtDate(s.date)}{s.startTime ? ` ${s.startTime}` : ''}</span>, value: (s) => s.date },
    { key: 'intervention', label: 'Intervention', render: (s) => <strong>{m.byId.trainingIntervention[s.interventionId]?.title || '—'}</strong>, value: (s) => m.byId.trainingIntervention[s.interventionId]?.title },
    { key: 'location', label: 'Location or link', render: (s) => s.location || (s.link ? 'Online' : '—'), value: (s) => s.location },
    { key: 'trainer', label: 'Trainer', render: (s) => s.trainer || '—', value: (s) => s.trainer },
    { key: 'enrolled', label: 'Enrolled', align: 'num', render: (s) => `${asArray(s.enrolments).length}${s.capacity ? ` / ${s.capacity}` : ''}`, value: (s) => asArray(s.enrolments).length },
    { key: 'attended', label: 'Attended', align: 'num', render: (s) => asArray(s.enrolments).filter((e) => e.attended).length, value: (s) => asArray(s.enrolments).filter((e) => e.attended).length },
    { key: 'completed', label: 'Completed', align: 'num', render: (s) => asArray(s.enrolments).filter((e) => e.completed).length, value: (s) => asArray(s.enrolments).filter((e) => e.completed).length },
    { key: 'source', label: 'Source', hidden: true, render: (s) => label('stakeholderSource', s.source), value: (s) => s.source },
    { key: 'status', label: 'Status', render: (s) => <StatusBadge status={s.status === 'completed' ? 'complete' : s.status} labelText={{ scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled' }[s.status]} />, value: (s) => s.status },
    { key: '_a', label: '', sortable: false, render: (s) => canDo('U', 'trainingSession', s) && s.status !== 'cancelled' && <button type="button" className="btn btn-xs" onClick={(e) => { e.stopPropagation(); setAttendance(s); }}>Attendance</button> },
  ];
  return (
    <>
      <DataGrid id="sessions" type="trainingSession" title="Training sessions" rows={rows} columns={cols} onRowClick={(s) => drawer.open({ type: 'trainingSession', id: s.id, wide: true })}
        facets={[{ key: 'status', label: 'Status', options: [{ id: 'scheduled', label: 'Scheduled' }, { id: 'completed', label: 'Completed' }, { id: 'cancelled', label: 'Cancelled' }], value: (s) => s.status }, { key: 'iv', label: 'Intervention', options: m.interventions.map((iv) => ({ id: iv.id, label: iv.title })), value: (s) => s.interventionId }]}
        toolbar={canDo('C', 'trainingSession') && <><button type="button" className="btn btn-sm" onClick={() => setImporting(true)}><Icon name="upload" />Import from LMS</button><button type="button" className="btn btn-sm btn-primary" onClick={() => drawer.open({ type: 'trainingSession', defaults: { status: 'scheduled', source: 'manual' }, wide: true })}><Icon name="plus" />Session</button></>} />
      {attendance && <AttendanceModal session={attendance} onClose={() => setAttendance(null)} />}
      {importing && <LmsImport onClose={() => setImporting(false)} />}
    </>
  );
}

// TRN-003: enrol people, then mark attendance and completion in one pass.
function AttendanceModal({ session, onClose }) {
  const { m, mut, toast, lookups } = useIniPage();
  const iv = m.byId.trainingIntervention[session.interventionId];
  const [rows, setRows] = useState(() => asArray(session.enrolments).map((e) => ({ ...e })));
  const [add, setAdd] = useState([]);
  const suggested = iv ? uniq(m.groups.filter((g) => asArray(iv.audienceGroupIds).includes(g.id)).flatMap((g) => [...g.memberIds])).filter((sid) => !rows.some((r) => r.stakeholderId === sid)) : [];
  const set = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v, ...(k === 'completed' && v ? { attended: true } : {}), ...(k === 'attended' && !v ? { completed: false } : {}) } : r)));
  const save = async () => {
    const all = [...rows, ...add.filter((sid) => !rows.some((r) => r.stakeholderId === sid)).map((sid) => ({ stakeholderId: sid, attended: false, completed: false }))];
    await mut.op('recordAttendance', { sessionId: session.id, enrolments: all });
    toast.success('Attendance saved');
    onClose();
  };
  return (
    <Modal title={`Attendance: ${iv?.title || 'session'} · ${fmtDate(session.date)}`} onClose={onClose} wide
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" onClick={save}>Save attendance</button></>}>
      <div className="row-between mb-2">
        <span className="small muted">{rows.length} enrolled{session.capacity ? ` of ${session.capacity} places` : ''}</span>
        <div className="btn-row">
          <button type="button" className="btn btn-xs" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, attended: true })))}>All attended</button>
          <button type="button" className="btn btn-xs" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, attended: true, completed: true })))}>All completed</button>
        </div>
      </div>
      <div className="scroll-y" style={{ maxHeight: 360 }}>
        <table className="tbl">
          <thead><tr><th>Participant</th><th>Attended</th><th>Completed</th><th className="num">Score</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.stakeholderId}>
                <td>{m.stakeholderName(r.stakeholderId) || r.stakeholderId}</td>
                <td><input type="checkbox" aria-label="Attended" checked={!!r.attended} onChange={(e) => set(i, 'attended', e.target.checked)} /></td>
                <td><input type="checkbox" aria-label="Completed" checked={!!r.completed} onChange={(e) => set(i, 'completed', e.target.checked)} /></td>
                <td className="num"><input type="number" aria-label="Score" style={{ width: 70 }} value={r.score ?? ''} onChange={(e) => set(i, 'score', e.target.value === '' ? null : Number(e.target.value))} /></td>
                <td><button type="button" className="btn btn-xs btn-ghost" aria-label="Remove" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Icon name="x" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="field mt-3">
        <span>Enrol more people</span>
        <RefPicker multiple value={add} onChange={setAdd} options={lookups.optionsFor('stakeholder').filter((o) => !rows.some((r) => r.stakeholderId === o.id))} />
        {suggested.length > 0 && <button type="button" className="btn btn-xs mt-2" onClick={() => setAdd(uniq([...add, ...suggested.slice(0, Math.max(0, (session.capacity || 999) - rows.length))]))}>Add the target audience ({suggested.length} not yet enrolled)</button>}
      </div>
    </Modal>
  );
}

// TRN-003: completions exported from the learning management system (CSV). Rows are matched to people
// by email (then name) and to interventions by LMS course ID (then title); a session is created for each
// course and date that does not exist yet.
function LmsImport({ onClose }) {
  const { m, mut, toast, ini } = useIniPage();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const byEmail = Object.fromEntries(m.stakeholders.filter((s) => s.email).map((s) => [s.email.toLowerCase(), s]));
  const byName = Object.fromEntries(m.stakeholders.map((s) => [personName(s).toLowerCase(), s]));
  const byCourse = Object.fromEntries(m.interventions.flatMap((iv) => [[String(iv.lmsCourseId || '').toLowerCase(), iv], [iv.title.toLowerCase(), iv]]).filter(([k]) => k));
  const read = async (file) => {
    const text = await file.text();
    const [head, ...body] = parseCsv(text);
    const idx = (re) => head.findIndex((h) => re.test(String(h).trim()));
    const c = { email: idx(/e-?mail/i), name: idx(/^(name|participant|learner|person)/i), course: idx(/course|intervention|module/i), date: idx(/date/i), attended: idx(/attend/i), completed: idx(/complet|status/i), score: idx(/score|result/i) };
    const yes = (v) => /^(y|yes|true|1|complete|completed|passed|attended)$/i.test(String(v || '').trim());
    setRows(body.filter((r) => r.some((v) => String(v).trim())).map((r, i) => {
      const person = (c.email >= 0 && byEmail[String(r[c.email]).trim().toLowerCase()]) || (c.name >= 0 && byName[String(r[c.name]).trim().toLowerCase()]) || null;
      const iv = c.course >= 0 ? byCourse[String(r[c.course]).trim().toLowerCase()] : null;
      const raw = c.date >= 0 ? String(r[c.date]).trim() : '';
      const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : parseAuDate(raw);
      const completed = c.completed >= 0 ? yes(r[c.completed]) : false;
      return { row: i + 2, person, iv, date, attended: c.attended >= 0 ? yes(r[c.attended]) || completed : completed, completed, score: c.score >= 0 && r[c.score] !== '' && !Number.isNaN(Number(r[c.score])) ? Number(r[c.score]) : null, error: !person ? 'Person not found' : !iv ? 'Course not matched' : !date ? 'Date not recognised' : null };
    }));
  };
  const ok = (rows || []).filter((r) => !r.error);
  const commit = async () => {
    setBusy(true);
    try {
      const groups = {};
      for (const r of ok) (groups[`${r.iv.id}|${r.date}`] ||= []).push(r);
      for (const [key, items] of Object.entries(groups)) {
        const [ivId, date] = key.split('|');
        let sess = m.sessions.find((s) => s.interventionId === ivId && s.date === date && s.status !== 'cancelled');
        if (!sess) sess = await mut.create('trainingSession', { initiativeId: ini.id, interventionId: ivId, date, location: 'Learning management system', trainer: 'LMS', status: 'scheduled', source: 'import', enrolments: [] }, { quiet: true });
        const merged = [...asArray(sess.enrolments)];
        for (const r of items) {
          const e = merged.find((x) => x.stakeholderId === r.person.id);
          if (e) Object.assign(e, { attended: e.attended || r.attended, completed: e.completed || r.completed, score: r.score ?? e.score });
          else merged.push({ stakeholderId: r.person.id, attended: r.attended, completed: r.completed, score: r.score });
        }
        await mut.op('recordAttendance', { sessionId: sess.id, enrolments: merged }, { quiet: true });
      }
      toast.success(`${ok.length} completion records imported into ${Object.keys(groups).length} sessions`);
      onClose();
    } catch (e) {
      toast.error(e);
    } finally { setBusy(false); }
  };
  return (
    <Modal title="Import completions from the learning management system" onClose={onClose} wide
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!ok.length || busy} onClick={commit}>{busy ? 'Importing…' : `Import ${ok.length} rows`}</button></>}>
      <p className="small muted">A CSV export with columns for the learner's email or name, the course ID or title, the date, and attended, completed and score. Dates may be DD/MM/YYYY.</p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files[0] && read(e.target.files[0])} />
      {rows && (
        <div className="scroll-y mt-3" style={{ maxHeight: 340 }}>
          <table className="tbl">
            <thead><tr><th>Row</th><th>Person</th><th>Course</th><th>Date</th><th>Completed</th><th>Check</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.row}><td>{r.row}</td><td>{r.person ? personName(r.person) : '—'}</td><td>{r.iv?.title || '—'}</td><td>{fmtDate(r.date) || '—'}</td><td>{r.completed ? 'Yes' : 'No'}</td><td>{r.error ? <Badge tone="critical" icon="alert">{r.error}</Badge> : <Badge tone="good" icon="check">Ready</Badge>}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
