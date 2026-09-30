import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useP, useCan } from '../../lib/store.jsx';
import { Card, Modal, Empty } from '../../../components/ui.jsx';
import { Field, Confirm, download, MIME, safeFile } from '../../components/common.jsx';
import { fmtDate, todayISO } from '../../core/util.js';

const STATUS = { draft: ['', 'Draft'], asked: ['warn', 'Asked'], answered: ['good', 'Answered'] };

// Register of clarification questions to the client, their answers and the sections they affect (WF-16).
export default function Clarifications({ bid }) {
  const { dispatch } = useP();
  const can = useCan();
  const edit = can('comment', { bid });
  const planner = can('planSections', { bid });
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [filter, setFilter] = useState('all');
  const qaDeadline = (bid.extraction?.dates || []).find((d) => /question|clarification|enquir/i.test(d.label));
  const rows = bid.clarifications.filter((c) => filter === 'all' || c.status === filter);

  const save = async () => {
    await dispatch('clar.upsert', { bidId: bid.id, clar: form }, { success: form.id ? 'Clarification updated' : 'Clarification added' });
    setForm(null);
  };
  const exportXlsx = async () => {
    const { tableWorkbook } = await import('../../gen/xlsx.js');
    const title = (id) => bid.sections.find((s) => s.id === id)?.title || '';
    const bytes = await tableWorkbook([{ name: 'Clarifications', rows: bid.clarifications, columns: [
      { key: 'ref', label: 'Ref', width: 8 }, { key: 'question', label: 'Question', width: 60 }, { key: 'askedAt', label: 'Asked', width: 12 },
      { key: 'answer', label: 'Answer', width: 60 }, { key: 'answeredAt', label: 'Answered', width: 12 }, { key: 'sections', label: 'Affected sections', width: 40, get: (r) => (r.sectionIds || []).map(title).join('; ') }, { key: 'status', label: 'Status', width: 10 },
    ] }]);
    download(bytes, `${safeFile(bid.ref)}_clarifications.xlsx`, MIME.xlsx);
  };

  return (
    <div className="stack">
      <div className="filters">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Status"><option value="all">All ({bid.clarifications.length})</option>{Object.entries(STATUS).map(([k, [, l]]) => <option key={k} value={k}>{l} ({bid.clarifications.filter((c) => c.status === k).length})</option>)}</select>
        {edit && <button className="btn btn-primary" onClick={() => setForm({ question: '', askedAt: '', answer: '', sectionIds: [] })}>Add question</button>}
        <button className="btn" onClick={exportXlsx} disabled={!bid.clarifications.length}>Export (.xlsx)</button>
        {qaDeadline && <span className="small">Questions close {fmtDate(qaDeadline.date)}{qaDeadline.date < todayISO() ? ' (passed)' : ''}</span>}
      </div>
      {rows.length ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ref</th><th style={{ width: '32%' }}>Question</th><th>Asked</th><th style={{ width: '32%' }}>Answer</th><th>Affected sections</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="strong">{c.ref}</td>
                    <td className="small">{c.question}</td>
                    <td className="small">{c.askedAt ? fmtDate(c.askedAt) : '—'}</td>
                    <td className="small">{c.answer || <span className="muted">Awaiting answer</span>}{c.answeredAt && <div className="mini">{fmtDate(c.answeredAt)}</div>}</td>
                    <td className="small">{(c.sectionIds || []).map((id) => { const s = bid.sections.find((x) => x.id === id); return s ? <div key={id}><Link to={`/bids/${bid.id}/sections/${id}`}>{s.title}</Link></div> : null; })}</td>
                    <td><span className={`pill ${STATUS[c.status]?.[0]}`}>{STATUS[c.status]?.[1]}</span></td>
                    <td className="nowrap">{edit && <button className="btn btn-sm" onClick={() => setForm({ ...c })}>Edit</button>}{planner && <button className="btn btn-sm btn-ghost" onClick={() => setDel(c)}>Delete</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <Empty title="No clarifications">Record questions sent to the client, and their answers. When an answer arrives, the owners of the affected sections are notified.</Empty>}
      {form && (
        <Modal title={form.id ? `Edit ${form.ref}` : 'Add a clarification question'} onClose={() => setForm(null)} footer={<><button className="btn" onClick={() => setForm(null)}>Cancel</button><button className="btn btn-primary" disabled={!form.question.trim()} onClick={save}>Save</button></>}>
          <Field label="Question" full><textarea rows={3} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /></Field>
          <div className="form-grid">
            <Field label="Date asked" hint="Leave empty while drafting"><input type="date" value={form.askedAt || ''} onChange={(e) => setForm({ ...form, askedAt: e.target.value })} /></Field>
            <Field label="Date answered"><input type="date" value={form.answeredAt || ''} onChange={(e) => setForm({ ...form, answeredAt: e.target.value })} /></Field>
          </div>
          <Field label="Client’s answer" full><textarea rows={3} value={form.answer || ''} onChange={(e) => setForm({ ...form, answer: e.target.value })} /></Field>
          <Field label="Affected sections" hint="Their owners are notified when the answer is recorded" full>
            <div className="stack" style={{ gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              {bid.sections.map((s) => <label key={s.id} className="check small"><input type="checkbox" checked={(form.sectionIds || []).includes(s.id)} onChange={(e) => setForm({ ...form, sectionIds: e.target.checked ? [...(form.sectionIds || []), s.id] : form.sectionIds.filter((x) => x !== s.id) })} /><span>{s.title}</span></label>)}
            </div>
          </Field>
        </Modal>
      )}
      {del && <Confirm title={`Delete ${del.ref}?`} danger confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={() => dispatch('clar.delete', { bidId: bid.id, id: del.id }, { success: 'Deleted' })}><p>{del.question}</p></Confirm>}
    </div>
  );
}
