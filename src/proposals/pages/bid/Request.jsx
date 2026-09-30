import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useP, useCan } from '../../lib/store.jsx';
import { ingestFiles } from '../../lib/intake.js';
import { runAi } from '../../lib/ai.js';
import { interpretAddendum } from '../../core/extract.js';
import { diffText } from '../../core/diff.js';
import { ACCEPT } from '../../gen/parse.js';
import { Card, Modal } from '../../../components/ui.jsx';
import { FileDrop, SourceLink, Person, When, Confirm, download, Icon } from '../../components/common.jsx';
import { DOC_TYPES, CHANNELS } from '../../core/constants.js';
import { fmtDate, TIMEZONES, relTime } from '../../core/util.js';

function FieldRow({ bid, name, label, item, editable, onSave, render }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(item?.value ?? '');
  const confirmed = bid.extraction?.confirmed?.[name];
  return (
    <tr>
      <td className="strong" style={{ width: 180 }}>{label}</td>
      <td>{edit ? (render ? render(val, setVal) : <input type="text" value={val} onChange={(e) => setVal(e.target.value)} style={{ width: '100%' }} />) : (item?.value || <span className="muted">Not found</span>)}</td>
      <td style={{ width: 150 }}>{item?.src ? <SourceLink bid={bid} src={item.src} /> : <span className="mini">—</span>}{item?.confidence ? <div className="conf">confidence {Math.round(item.confidence * 100)}%</div> : null}</td>
      <td style={{ width: 210 }} className="right">
        {confirmed ? <span className="pill good">Confirmed</span> : <span className="pill warn">To confirm</span>}
        {editable && (edit ? (
          <><button className="btn btn-sm btn-primary" style={{ marginLeft: 6 }} onClick={async () => { await onSave(val); setEdit(false); }}>Save</button><button className="btn btn-sm" onClick={() => setEdit(false)}>Cancel</button></>
        ) : (
          <>{!confirmed && item?.value && <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => onSave(item.value)}>Confirm</button>}<button className="btn btn-sm btn-ghost" onClick={() => { setVal(item?.value ?? ''); setEdit(true); }}>Correct</button></>
        ))}
      </td>
    </tr>
  );
}

function AddendumReview({ bid, doc, onClose }) {
  const { dispatch } = useP();
  const r = interpretAddendum([doc], bid.requirements, bid.extraction?.dates || []);
  const [accept, setAccept] = useState(() => Object.fromEntries([...r.changes.map((c, i) => [`c${i}`, true]), ...r.dateChanges.map((d, i) => [`d${i}`, true]), ...r.submission.map((s, i) => [`s${i}`, true])]));
  const subChanges = r.submission.filter((s) => { const ex = bid.extraction?.submission?.find((x) => x.label === s.label); return !ex || ex.value !== s.value; });
  const apply = async () => {
    await dispatch('addendum.apply', {
      bidId: bid.id, docId: doc.id,
      changes: r.changes.map((c, i) => ({ ...c, accept: accept[`c${i}`] })),
      dateChanges: r.dateChanges.map((d, i) => ({ ...d, accept: accept[`d${i}`] })),
      submission: subChanges.map((s, i) => ({ ...s, accept: accept[`s${i}`] })),
    }, { success: 'Addendum applied; owners of affected sections were notified' });
    onClose();
  };
  const toggle = (k) => setAccept({ ...accept, [k]: !accept[k] });
  return (
    <Modal title={`Compare addendum: ${doc.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Not now</button><button className="btn btn-primary" onClick={apply}>Apply selected changes</button></>}>
      <p className="small" style={{ marginTop: 0 }}>The addendum was compared with the current requirements and dates (CR-09). Accepted changes update the compliance matrix, mark changed requirements for re-confirmation and notify the owners of affected sections.</p>
      {!r.changes.length && !r.dateChanges.length && !subChanges.length && <div className="callout">No changes to requirements, dates or submission instructions were found.</div>}
      {r.changes.map((c, i) => (
        <label key={`c${i}`} className="check" style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
          <input type="checkbox" checked={accept[`c${i}`]} onChange={() => toggle(`c${i}`)} />
          <div className="small">
            <span className={`pill ${c.kind === 'added' ? 'good' : c.kind === 'removed' ? 'bad' : 'warn'}`}>{c.kind}</span> <strong>{c.ref}</strong>
            {c.kind === 'changed' ? <div className="diff" style={{ marginTop: 4 }}>{diffText(c.before.text, c.after.text).map((o, j) => (o.t === 'eq' ? <span key={j}>{o.text}</span> : o.t === 'ins' ? <ins key={j}>{o.text}</ins> : <del key={j}>{o.text}</del>))}</div> : <div style={{ marginTop: 4 }}>{(c.after || c.before).text}</div>}
          </div>
        </label>
      ))}
      {r.dateChanges.map((d, i) => (
        <label key={`d${i}`} className="check" style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
          <input type="checkbox" checked={accept[`d${i}`]} onChange={() => toggle(`d${i}`)} />
          <span className="small"><span className="pill info">date</span> <strong>{d.label}</strong>: {d.before ? `${fmtDate(d.before.date)} ${d.before.time || ''} → ` : ''}<strong>{fmtDate(d.after.date)} {d.after.time || ''}</strong></span>
        </label>
      ))}
      {subChanges.map((s, i) => (
        <label key={`s${i}`} className="check" style={{ padding: '8px 0' }}>
          <input type="checkbox" checked={accept[`s${i}`]} onChange={() => toggle(`s${i}`)} />
          <span className="small"><span className="pill info">instruction</span> <strong>{s.label}</strong>: {s.value}</span>
        </label>
      ))}
    </Modal>
  );
}

export default function Request({ bid }) {
  const { view, dispatch, putFile, getFile, toast, backend } = useP();
  const can = useCan();
  const [busy, setBusy] = useState(null);
  const [addendum, setAddendum] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [dateEdit, setDateEdit] = useState(null);
  const plan = can('planSections', { bid });
  const ex = bid.extraction;

  const extract = async (docIds) => {
    const docs = bid.documents.filter((d) => (docIds ? docIds.includes(d.id) : ['request', 'addendum', 'qa'].includes(d.type)));
    if (!docs.length) { toast('Upload the request documents first.', 'error'); return; }
    setBusy('Extracting requirements, dates and evaluation criteria…');
    try {
      const t0 = Date.now();
      const r = await runAi('extract', { view, bid, docs }, { backend, dispatch });
      await dispatch('extraction.set', { bidId: bid.id, extraction: { ...r, mode: r.engine === 'claude' ? 'claude' : 'rules', model: r.model || null, ms: Date.now() - t0 }, requirements: r.requirements, docIds: docs.map((d) => d.id), replaceCriteria: !bid.criteria.length }, { success: `Extracted ${r.requirements.length} requirements` });
    } finally { setBusy(null); }
  };

  const onFiles = async (files) => {
    setBusy('Scanning and reading files…');
    try {
      const parsed = await ingestFiles(files, { putFile, bidId: bid.id, onProgress: setBusy });
      const added = [];
      for (const d of parsed) {
        if (d.error) { toast(`${d.name}: ${d.error}`, 'error'); continue; }
        try {
          const r = await dispatch('doc.add', { bidId: bid.id, doc: { name: d.name, type: d.type, size: d.size, mime: d.mime, fileId: d.fileId, pages: d.pages, hash: d.hash, warnings: d.warnings, ocr: d.ocr } }, { quiet: true });
          added.push({ ...d, id: r.docId });
          for (const w of d.warnings) toast(`${d.name}: ${w}`, 'info');
        } catch (e) { toast(`${d.name}: ${e.message}`, 'error'); }
      }
      if (!added.length) return;
      toast(`Uploaded ${added.length} document${added.length === 1 ? '' : 's'}`, 'success');
      const add = added.find((d) => d.type === 'addendum');
      if (add && ex) setAddendum(add);
      else if (added.some((d) => d.type === 'request') && !ex) await extract();
    } finally { setBusy(null); }
  };

  const confirm = (field, value, extra = {}) => dispatch('extraction.confirm', { bidId: bid.id, field, value, ...extra }, { quiet: false });
  const unconfirmedReqs = bid.requirements.filter((r) => !r.confirmed && !r.excluded).length;
  const since = ex?.at ? Math.round((Date.now() - new Date(ex.at)) / 60000) : null;
  const clients = [...view.clients].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="stack">
      <Card title="Client documents" subtitle="Request, addenda, Q&A and response forms. Every file is virus-scanned and parsed with page and paragraph positions (CR-01, CR-02)."
        actions={plan && ex && <button className="btn" onClick={() => extract()} disabled={Boolean(busy)}><Icon name="ai" size={14} />Re-run extraction</button>}>
        {plan && <FileDrop accept={ACCEPT} onFiles={onFiles} busy={busy} label="Drop request documents, addenda or a ZIP pack (PDF, Word, Excel, PowerPoint, .eml, .msg)" />}
        {bid.documents.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead><tr><th>Document</th><th>Type</th><th>Version</th><th>Pages</th><th>Scan</th><th>Uploaded</th><th /></tr></thead>
              <tbody>
                {bid.documents.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.name}</strong>{(d.warnings || []).map((w) => <div key={w} className="mini" style={{ color: 'var(--st-serious)' }}>{w}</div>)}{d.appliedAt && <div className="mini">Addendum applied {relTime(d.appliedAt)}</div>}</td>
                    <td>{DOC_TYPES.find((t) => t.id === d.type)?.label || d.type}</td>
                    <td>v{d.version || 1}</td>
                    <td className="tabular">{d.pages?.length || 0}</td>
                    <td><span className="pill good">Clean</span></td>
                    <td><Person id={d.by} /><div className="mini"><When at={d.uploadedAt} /></div></td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      {d.fileId && <button className="btn btn-sm dl" onClick={async () => { const f = await getFile(d.fileId); if (f) download(f.bytes, d.name, f.type); else toast('The original file is not stored in this workspace.', 'error'); }}>Download</button>}
                      {d.type === 'addendum' && ex && plan && <button className="btn btn-sm" onClick={() => setAddendum(d)}>Compare</button>}
                      {plan && <button className="btn btn-sm btn-ghost btn-danger" onClick={() => setRemoving(d)} aria-label={`Remove ${d.name}`}>Remove</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!bid.documents.length && !plan && <p className="muted">No documents yet.</p>}
      </Card>

      {ex && (
        <>
          <div className={`callout ${ex.status === 'confirmed' ? '' : 'warn'}`}>
            <strong>{ex.status === 'confirmed' ? 'Compliance matrix confirmed' : 'Check the extracted items'}</strong>
            {' '}— extracted {relTime(ex.at)} by the {ex.mode === 'claude' ? `Claude (${ex.model || 'model'})` : 'rules engine'} from {ex.docIds?.length || bid.documents.length} document(s).
            {' '}{ex.corrections?.length || 0} correction{ex.corrections?.length === 1 ? '' : 's'} recorded.
            {ex.status !== 'confirmed' && <> Confirm or correct each item before it is used (CR-04). {unconfirmedReqs} requirement{unconfirmedReqs === 1 ? '' : 's'} still to confirm on the <Link to={`/bids/${bid.id}/requirements`}>compliance matrix</Link>.</>}
            {ex.status === 'confirmed' && ex.confirmedAt && <> Confirmed {Math.round((new Date(ex.confirmedAt) - new Date(ex.at)) / 60000)} minutes after extraction (target: under 1 hour).</>}
            {plan && ex.status !== 'confirmed' && <div style={{ marginTop: 8 }}><button className="btn btn-primary btn-sm" onClick={() => dispatch('extraction.complete', { bidId: bid.id, confirmAll: true }, { success: 'Compliance matrix confirmed' })}>Confirm all remaining items{since !== null ? ` (${since} min since extraction)` : ''}</button></div>}
          </div>

          <Card title="Opportunity details" subtitle="Client, title, reference and procurement channel" pad={false}>
            <div className="table-wrap"><table className="table"><tbody>
              <FieldRow bid={bid} name="client" label="Client" item={ex.fields.client} editable={plan} onSave={(v) => confirm('client', v, { clientId: clients.find((c) => c.name === v)?.id || bid.clientId })}
                render={(v, setV) => <select value={v} onChange={(e) => setV(e.target.value)}>{clients.map((c) => <option key={c.id}>{c.name}</option>)}</select>} />
              <FieldRow bid={bid} name="title" label="Opportunity title" item={ex.fields.title} editable={plan} onSave={(v) => confirm('title', v)} />
              <FieldRow bid={bid} name="reference" label="Reference number" item={ex.fields.reference} editable={plan} onSave={(v) => confirm('reference', v)} />
              <FieldRow bid={bid} name="channel" label="Procurement channel" item={ex.fields.channel} editable={plan} onSave={(v) => confirm('channel', v)} render={(v, setV) => <select value={v} onChange={(e) => setV(e.target.value)}><option value="">—</option>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select>} />
            </tbody></table></div>
          </Card>

          <Card title="Key dates" subtitle="With time zones. The closing time drives back-scheduling of milestones." pad={false}>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Event</th><th>Date</th><th>Time</th><th>Time zone</th><th>Source</th><th /></tr></thead>
              <tbody>
                {ex.dates.map((d) => {
                  const editing = dateEdit?.id === d.id;
                  const confirmed = ex.confirmed?.[`date:${d.id}`] || d.confirmed;
                  return (
                    <tr key={d.id}>
                      <td>{editing ? <input type="text" value={dateEdit.label} onChange={(e) => setDateEdit({ ...dateEdit, label: e.target.value })} /> : <strong>{d.label}</strong>}{d.changedBy && <div className="mini">Changed by addendum</div>}</td>
                      <td>{editing ? <input type="date" value={dateEdit.date} onChange={(e) => setDateEdit({ ...dateEdit, date: e.target.value })} /> : fmtDate(d.date)}</td>
                      <td>{editing ? <input type="time" value={dateEdit.time || ''} onChange={(e) => setDateEdit({ ...dateEdit, time: e.target.value })} /> : d.time || '—'}</td>
                      <td>{editing ? <select value={dateEdit.tz || ''} onChange={(e) => setDateEdit({ ...dateEdit, tz: e.target.value })}><option value="">—</option>{TIMEZONES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select> : d.tz ? TIMEZONES.find(([id]) => id === d.tz)?.[1] || d.tz : '—'}</td>
                      <td><SourceLink bid={bid} src={d.src} /></td>
                      <td className="right" style={{ whiteSpace: 'nowrap' }}>
                        {editing ? <><button className="btn btn-sm btn-primary" onClick={async () => { await confirm(`date:${d.id}`, { label: dateEdit.label, date: dateEdit.date, time: dateEdit.time, tz: dateEdit.tz }); if (/closing/i.test(dateEdit.label)) await confirm('closing', { date: dateEdit.date, time: dateEdit.time, tz: dateEdit.tz }); setDateEdit(null); }}>Save</button><button className="btn btn-sm" onClick={() => setDateEdit(null)}>Cancel</button></> : (
                          <>{confirmed ? <span className="pill good">Confirmed</span> : plan && <button className="btn btn-sm" onClick={async () => { await confirm(`date:${d.id}`, {}); if (/closing/i.test(d.label)) await confirm('closing', { date: d.date, time: d.time, tz: d.tz }); }}>Confirm</button>}
                            {plan && <button className="btn btn-sm btn-ghost" onClick={() => setDateEdit({ ...d })}>Correct</button>}
                            {plan && <button className="btn btn-sm btn-ghost btn-danger" onClick={() => dispatch('extraction.confirm', { bidId: bid.id, field: `date:${d.id}`, remove: true })} aria-label="Remove date">✕</button>}</>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </Card>

          <div className="split">
            <Card title="Submission instructions" subtitle="Checked again before outputs are marked final" pad={false}>
              {ex.submission.map((s) => (
                <div key={s.id} className="work-item" style={{ gridTemplateColumns: '1fr auto' }}>
                  <div><div className="t">{s.label}{s.number ? `: ${s.number}` : ''}</div><div className="d">{s.value}</div><SourceLink bid={bid} src={s.src} />{s.changedBy && <span className="mini"> · changed by addendum</span>}</div>
                  <div>{ex.confirmed?.[`sub:${s.id}`] ? <span className="pill good">Confirmed</span> : plan && <button className="btn btn-sm" onClick={() => confirm(`sub:${s.id}`, {})}>Confirm</button>}</div>
                </div>
              ))}
              {!ex.submission.length && <p className="muted small" style={{ padding: 16 }}>No submission instructions found.</p>}
            </Card>
            <div className="stack">
              <Card title="Pricing and commercial conditions">
                {ex.pricing?.format && <p className="small" style={{ marginTop: 0 }}><strong>Pricing schedule:</strong> {ex.pricing.format.value} <SourceLink bid={bid} src={ex.pricing.format.src} /></p>}
                {ex.pricing?.models?.length > 0 && <p className="small"><strong>Pricing models requested:</strong> {ex.pricing.models.map((m) => ({ fixed: 'fixed price with milestones', capped: 'capped time and materials', tm: 'time and materials', retainer: 'retainer' }[m])).join(', ')}</p>}
                {(ex.pricing?.departures || []).map((d) => <p key={d.text} className="small"><strong>Departures:</strong> {d.text} <SourceLink bid={bid} src={d.src} /></p>)}
                {(ex.pricing?.liability || []).map((d) => <p key={d.text} className="small"><strong>Liability:</strong> {d.text} <SourceLink bid={bid} src={d.src} /></p>)}
              </Card>
              <Card title="Response forms the client requires" subtitle="Import them as templates so answers go straight into the client’s format (CR-08)">
                {ex.forms.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{ex.forms.map((f) => <li key={f.id}>{f.name} <SourceLink bid={bid} src={f.src} /></li>)}</ul> : <p className="muted small">None found.</p>}
                <p className="mini" style={{ marginBottom: 0 }}>Upload a client Word form on the Templates page, or a client compliance workbook on the Produce tab.</p>
              </Card>
            </div>
          </div>
        </>
      )}
      {!ex && bid.documents.length > 0 && plan && <div className="callout warn">Requirements have not been extracted yet. <button className="btn btn-sm btn-primary" onClick={() => extract()} disabled={Boolean(busy)}>Extract now</button></div>}
      {addendum && <AddendumReview bid={bid} doc={bid.documents.find((d) => d.id === addendum.id) || addendum} onClose={() => setAddendum(null)} />}
      {removing && <Confirm title={`Remove ${removing.name}?`} danger confirmLabel="Remove" onClose={() => setRemoving(null)} onConfirm={() => dispatch('doc.remove', { bidId: bid.id, docId: removing.id }, { success: 'Document removed' })}>Unconfirmed requirements extracted from this document are removed too. This is recorded in the audit trail.</Confirm>}
    </div>
  );
}
