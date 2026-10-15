import { useState } from 'react';
import { useApp, personName } from '../../lib/store.jsx';
import { Card, Select, PersonSelect, Seg, TextArea } from '../../components/ui.jsx';
import { fmtDate, todayISO, uid } from '../../lib/util.js';

const TYPES = [['risk', 'Risks'], ['issue', 'Issues'], ['change', 'Change requests'], ['decision', 'Decisions'], ['action', 'Actions']];
const LEVELS = [['project', 'Project'], ['program', 'Program'], ['vmo', 'VMO'], ['idb', 'Board (IDB)']];

export default function Logs({ program: p }) {
  const { ws, updateProgram, mutate } = useApp();
  const [type, setType] = useState('risk');
  const [comment, setComment] = useState('');
  const rows = (p.log || []).filter((l) => l.type === type);
  const upd = (id, k, v) => updateProgram(p.id, (x) => { x.log.find((l) => l.id === id)[k] = v; }, `Log ${type}: ${k}`, { field: `log:${id}:${k}` });
  const comments = (ws.comments || []).filter((c) => c.programId === p.id);
  return (
    <div className="stack">
      <Card title="Program logs (PRG-07)" subtitle="Risks, issues, change requests, decisions and actions — escalating project → program → VMO → board" actions={<>
        <Seg value={type} onChange={setType} options={TYPES.map(([k, l]) => [k, `${l} (${(p.log || []).filter((x) => x.type === k).length})`])} label="Log type" />
        <button className="btn btn-sm btn-primary" onClick={() => updateProgram(p.id, (x) => { x.log.push({ id: uid('log'), type, title: `New ${type}`, detail: '', ownerId: x.managerId, date: todayISO(), due: '', status: 'open', likelihood: 'medium', impact: 'medium', level: 'program' }); }, `Added ${type}`)}>+ Add</button>
      </>} pad={false}>
        {!rows.length ? <div className="empty-sm">Nothing logged.</div> : (
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Title and detail</th><th>Owner</th>{type === 'risk' && <><th>Likelihood</th><th>Impact</th></>}<th>Raised</th><th>Due</th><th>Level</th><th>Status</th></tr></thead>
            <tbody>{rows.map((l) => (
              <tr key={l.id}>
                <td style={{ minWidth: 280 }}><input className="inline-input" style={{ fontWeight: 600 }} value={l.title} onChange={(e) => upd(l.id, 'title', e.target.value)} aria-label="Title" /><textarea rows={2} value={l.detail || ''} onChange={(e) => upd(l.id, 'detail', e.target.value)} aria-label="Detail" style={{ minHeight: 40, marginTop: 4 }} />{l.source && <div className="mini">Raised automatically ({l.source.split(':')[0]})</div>}</td>
                <td><PersonSelect ws={ws} value={l.ownerId} onChange={(v) => upd(l.id, 'ownerId', v)} /></td>
                {type === 'risk' && <><td><Select value={l.likelihood} onChange={(v) => upd(l.id, 'likelihood', v)} options={['low', 'medium', 'high']} /></td><td><Select value={l.impact} onChange={(v) => upd(l.id, 'impact', v)} options={['low', 'medium', 'high']} /></td></>}
                <td className="nowrap">{fmtDate(l.date)}</td>
                <td><input type="date" value={l.due || ''} onChange={(e) => upd(l.id, 'due', e.target.value)} aria-label="Due" /></td>
                <td><Select value={l.level} onChange={(v) => upd(l.id, 'level', v)} options={LEVELS} />{l.level === 'idb' && <div className="mini">On the next board agenda</div>}</td>
                <td><Select value={l.status} onChange={(v) => upd(l.id, 'status', v)} options={['open', 'in progress', 'closed']} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      <div className="grid g-2" data-layout>
        <Card title="Lessons learned (HIS-03)" subtitle="Captured at gates, withdrawal and completion; surfaced for similar programs" actions={<button className="btn btn-sm" onClick={() => mutate('Captured lesson', (d) => { d.lessons.push({ id: uid('les'), programId: p.id, gate: (p.gates || []).filter((g) => g.decision).pop()?.gate || '—', date: todayISO(), context: '', lesson: 'New lesson', tags: [] }); })}>+ Lesson</button>}>
          {ws.lessons.filter((l) => l.programId === p.id).map((l) => {
            const i = ws.lessons.indexOf(l);
            return <div key={l.id} style={{ borderBottom: '1px dashed var(--line)', padding: '8px 0' }}><TextArea rows={2} value={l.lesson} onChange={(v) => mutate('Edited lesson', (d) => { d.lessons[i].lesson = v; }, { field: `les:${l.id}` })} /><div className="row mini" style={{ marginTop: 4 }}><span>{l.gate} · {fmtDate(l.date)}</span><input type="text" value={l.tags.join(', ')} placeholder="tags" onChange={(e) => mutate('Edited lesson tags', (d) => { d.lessons[i].tags = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); }, { field: `lest:${l.id}` })} aria-label="Tags" /></div></div>;
          })}
          {!ws.lessons.some((l) => l.programId === p.id) && <div className="empty-sm">No lessons yet.</div>}
        </Card>
        <Card title="Discussion (COL-01)" subtitle="Comments with @mentions">
          {comments.map((c) => <div key={c.id} className="check-row"><span className="ic">💬</span><span>{c.text}<div className="mini">{personName(ws, c.by)} · {fmtDate(c.date)}{c.resolved ? ' · resolved' : ''}</div></span><span>{!c.resolved && <button className="btn btn-ghost btn-sm" onClick={() => mutate('Resolved comment', (d) => { d.comments.find((x) => x.id === c.id).resolved = true; })}>Resolve</button>}</span></div>)}
          <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (!comment.trim()) return; mutate('Commented', (d) => { d.comments.push({ id: uid('cm'), programId: p.id, text: comment.trim(), by: d.currentUser, date: todayISO(), mentions: ws.people.filter((x) => comment.includes(`@${x.name.split(' ')[0]}`)).map((x) => x.id) }); }); setComment(''); }}>
            <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment — use @FirstName to mention" style={{ flex: 1 }} aria-label="Comment" />
            <button className="btn btn-sm btn-primary" type="submit">Post</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
