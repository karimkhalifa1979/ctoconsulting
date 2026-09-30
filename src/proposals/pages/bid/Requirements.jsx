import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP, useCan } from '../../lib/store.jsx';
import { Card, Modal, includesAll } from '../../../components/ui.jsx';
import { SourceLink, Compliance, download, MIME, safeFile, Field, UserSelect, Person } from '../../components/common.jsx';
import { COMPLIANCE } from '../../core/constants.js';
import { complianceWorkbook, fillClientWorkbook } from '../../gen/xlsx.js';
import { textSimilarity } from '../../core/search.js';
import { checkAgainstRequirements } from '../../core/drafting.js';

function EditReq({ bid, req, onClose }) {
  const { dispatch } = useP();
  const [f, setF] = useState(req ? { ...req } : { ref: '', text: '', kind: 'mandatory', category: 'Service', criterionId: '' });
  return (
    <Modal title={req ? `Correct requirement ${req.ref}` : 'Add a requirement'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!f.text.trim()} onClick={async () => { await dispatch('req.upsert', { bidId: bid.id, req: { ...f, criterionId: f.criterionId || null } }, { success: req ? 'Requirement corrected; the correction is recorded' : 'Requirement added' }); onClose(); }}>Save</button></>}>
      <div className="form-grid">
        <Field label="Reference"><input type="text" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="e.g. M12" /></Field>
        <Field label="Type"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="mandatory">Mandatory</option><option value="desirable">Desirable</option></select></Field>
        <Field label="Requirement" full><textarea value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} rows={4} /></Field>
        <Field label="Category"><select value={f.category || ''} onChange={(e) => setF({ ...f, category: e.target.value })}><option>Service</option><option>Commercial</option><option>Submission</option></select></Field>
        <Field label="Evaluation criterion"><select value={f.criterionId || ''} onChange={(e) => setF({ ...f, criterionId: e.target.value })}><option value="">—</option>{bid.criteria.map((c) => <option key={c.id} value={c.id}>{c.name}{c.weight ? ` (${c.weight}%)` : ''}</option>)}</select></Field>
      </div>
      {req?.extracted && req.extracted.text !== f.text && <p className="mini" style={{ marginTop: 8 }}>Extracted text: “{req.extracted.text}”</p>}
    </Modal>
  );
}

export default function Requirements({ bid }) {
  const { dispatch, toast } = useP();
  const can = useCan();
  const plan = can('planSections', { bid });
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [edit, setEdit] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const clientFile = useRef(null);
  const sections = bid.sections;
  const title = (id) => sections.find((s) => s.id === id)?.title || '';
  const rows = useMemo(() => bid.requirements.filter((r) => {
    if (kind && r.kind !== kind) return false;
    if (status === 'unmapped' && (r.sectionIds || []).length) return false;
    if (status === 'unconfirmed' && r.confirmed) return false;
    if (status === 'withdrawn' && !r.excluded) return false;
    if (status && !['unmapped', 'unconfirmed', 'withdrawn'].includes(status) && (r.compliance || '') !== status) return false;
    return includesAll(`${r.ref} ${r.text} ${r.category}`, q);
  }), [bid.requirements, q, kind, status]);
  const live = bid.requirements.filter((r) => !r.excluded);
  const mand = live.filter((r) => r.kind === 'mandatory');
  const mapped = mand.filter((r) => (r.sectionIds || []).length);
  const update = (r, patch) => dispatch('req.update', { bidId: bid.id, reqId: r.id, patch }, { quiet: false });
  const autoMap = async () => {
    const map = {};
    for (const r of live.filter((x) => !(x.sectionIds || []).length)) {
      let best = null, score = 0;
      for (const s of sections) { const sc = textSimilarity(r.text, `${s.title} ${s.brief}`); if (sc > score) { best = s; score = sc; } }
      if (best && score > 0.08) map[r.id] = [best.id];
    }
    if (!Object.keys(map).length) { toast('No confident matches. Map the remaining requirements by hand.', 'info'); return; }
    await dispatch('req.bulkMap', { bidId: bid.id, map }, { success: `Suggested sections for ${Object.keys(map).length} requirements. Check them.` });
  };
  const runCoverage = () => {
    const out = live.map((r) => {
      const html = (r.sectionIds || []).map((id) => sections.find((s) => s.id === id)?.content || '').join('');
      return { r, ...(html ? checkAgainstRequirements(html, [r])[0] : { status: 'missing', score: 0, missing: [] }) };
    });
    setCoverage(Object.fromEntries(out.map((x) => [x.r.id, x])));
  };
  const exportXlsx = async () => download(await complianceWorkbook(bid, { name: bid.title }), `${safeFile(bid.clientRef || bid.ref)}_Compliance_Matrix.xlsx`, MIME.xlsx);
  const fillClient = async (file) => {
    try {
      const { bytes, report } = await fillClientWorkbook(new Uint8Array(await file.arrayBuffer()), bid);
      download(bytes, file.name.replace(/\.xlsx$/i, '_completed.xlsx'), MIME.xlsx);
      toast(`Filled ${report.filled} rows on “${report.sheet}” (columns: ${Object.values(report.matched).join(', ')})${report.unmatchedRows.length ? `. ${report.unmatchedRows.length} rows had references not in the matrix.` : ''}`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="stack">
      <div className="stat-row">
        <div className="card stat accent"><div className="label">Requirements</div><div className="value tabular">{live.length}</div><div className="sub">{mand.length} mandatory · {live.length - mand.length} desirable</div></div>
        <div className="card stat"><div className="label">Mandatory mapped</div><div className="value tabular">{mand.length ? Math.round((mapped.length / mand.length) * 100) : 0}%</div><div className="sub">{mand.length - mapped.length} unmapped block gate 3</div></div>
        <div className="card stat"><div className="label">Comply</div><div className="value tabular">{live.filter((r) => r.compliance === 'comply').length}</div><div className="sub">{live.filter((r) => r.compliance === 'partial').length} partial · {live.filter((r) => r.compliance === 'not').length} not comply</div></div>
        <div className="card stat"><div className="label">Unconfirmed</div><div className="value tabular">{live.filter((r) => !r.confirmed).length}</div><div className="sub">Confirm before use (CR-04)</div></div>
      </div>
      <div className="filters">
        <input type="search" placeholder="Search requirements" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search requirements" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type"><option value="">Mandatory and desirable</option><option value="mandatory">Mandatory</option><option value="desirable">Desirable</option></select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Any status</option><option value="unmapped">Not mapped to a section</option><option value="unconfirmed">Unconfirmed</option><option value="withdrawn">Withdrawn by addendum</option>{COMPLIANCE.filter((c) => c.id).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
        <div className="spacer" style={{ flex: 1 }} />
        {plan && <button className="btn" onClick={() => setEdit('new')}>Add requirement</button>}
        {plan && sections.length > 0 && <button className="btn" onClick={autoMap}>Suggest mappings</button>}
        {sections.length > 0 && <button className="btn" onClick={runCoverage}>Check coverage</button>}
        <button className="btn dl" onClick={exportXlsx}>Export to Excel</button>
        <button className="btn dl" onClick={() => clientFile.current?.click()} title="Fill the client’s own compliance workbook">Fill client’s format</button>
        <input ref={clientFile} type="file" hidden accept=".xlsx" onChange={(e) => { if (e.target.files[0]) fillClient(e.target.files[0]); e.target.value = ''; }} />
      </div>
      {!sections.length && <div className="callout">Build the response outline on the <Link to={`/bids/${bid.id}/plan`}>Plan</Link> tab to map requirements to sections.</div>}
      <Card pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th style={{ width: 70 }}>Ref</th><th>Requirement</th><th style={{ width: 90 }}>Type</th><th style={{ width: 220 }}>Response section</th><th style={{ width: 130 }}>Compliance</th><th style={{ width: 150 }}>Owner</th><th style={{ width: 120 }}>Source</th><th style={{ width: 90 }} /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const cov = coverage?.[r.id];
                const owns = sections.some((s) => (r.sectionIds || []).includes(s.id));
                return (
                  <tr key={r.id} style={r.excluded ? { opacity: 0.5 } : undefined}>
                    <td className="strong">{r.ref}{r.changedBy && <div className="pill warn" title="Changed by an addendum">changed</div>}{r.addedBy && <div className="pill good">new</div>}</td>
                    <td>
                      <div style={{ textDecoration: r.excluded ? 'line-through' : 'none' }}>{r.text}</div>
                      <div className="mini">{r.category}{r.criterionId ? ` · ${bid.criteria.find((c) => c.id === r.criterionId)?.name || ''}` : ''}{r.corrected ? ' · corrected' : ''}{!r.confirmed && !r.excluded ? ' · unconfirmed' : ''}{r.excluded ? ' · withdrawn by addendum' : ''}</div>
                      {cov && <div className="mini" style={{ color: cov.status === 'addressed' ? 'var(--st-good)' : cov.status === 'partial' ? '#a86b00' : 'var(--st-critical)' }}>Coverage check: {cov.status}{cov.missing?.length ? ` — not yet mentioned: ${cov.missing.slice(0, 5).join(', ')}` : ''}</div>}
                    </td>
                    <td className="small">{r.kind === 'mandatory' ? <span className="pill info">Mandatory</span> : <span className="pill">Desirable</span>}</td>
                    <td>
                      {(r.sectionIds || []).map((id) => <div key={id} className="tag" style={{ marginBottom: 3 }}><Link to={`/bids/${bid.id}/sections/${id}`}>{title(id)}</Link>{plan && <button onClick={() => update(r, { sectionIds: r.sectionIds.filter((x) => x !== id) })} aria-label="Unmap">✕</button>}</div>)}
                      {plan && sections.length > 0 && <select value="" onChange={(e) => e.target.value && update(r, { sectionIds: [...(r.sectionIds || []), e.target.value] })} aria-label={`Map ${r.ref} to a section`} style={{ maxWidth: 200 }}><option value="">{(r.sectionIds || []).length ? '+ Another section' : 'Map to section…'}</option>{sections.filter((s) => !(r.sectionIds || []).includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>}
                      {!plan && !(r.sectionIds || []).length && <span className="muted small">Not mapped</span>}
                    </td>
                    <td>{plan || owns ? <select value={r.compliance || ''} onChange={(e) => update(r, { compliance: e.target.value })} aria-label={`Compliance for ${r.ref}`}>{COMPLIANCE.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select> : <Compliance value={r.compliance} />}</td>
                    <td>{plan ? <UserSelect value={r.ownerId} onChange={(v) => update(r, { ownerId: v })} placeholder="—" /> : r.ownerId ? <Person id={r.ownerId} /> : '—'}</td>
                    <td><SourceLink bid={bid} src={r.src} /></td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      {plan && !r.confirmed && !r.excluded && <button className="btn btn-sm" onClick={() => dispatch('req.confirm', { bidId: bid.id, ids: [r.id] })}>Confirm</button>}
                      {plan && <button className="btn btn-sm btn-ghost" onClick={() => setEdit(r)}>Edit</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <p className="muted" style={{ padding: 16 }}>No requirements match.</p>}
        </div>
      </Card>
      <Card title="Evaluation criteria" subtitle="Used for review scoring, the heatmap and the rehearsal pack">
        <CriteriaEditor bid={bid} editable={plan} />
      </Card>
      {edit && <EditReq bid={bid} req={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function CriteriaEditor({ bid, editable }) {
  const { dispatch } = useP();
  const [list, setList] = useState(bid.criteria);
  const dirty = JSON.stringify(list) !== JSON.stringify(bid.criteria);
  const total = list.reduce((a, c) => a + (Number(c.weight) || 0), 0);
  return (
    <div>
      <table className="table">
        <thead><tr><th>Criterion</th><th style={{ width: 120 }}>Weighting</th><th style={{ width: 130 }}>Source</th><th style={{ width: 50 }} /></tr></thead>
        <tbody>
          {list.map((c, i) => (
            <tr key={c.id || i}>
              <td>{editable ? <input type="text" className="inline-edit" value={c.name} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /> : c.name}</td>
              <td>{editable ? <input type="number" value={c.weight ?? ''} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))} style={{ width: 80 }} /> : `${c.weight ?? '—'}%`}</td>
              <td><SourceLink bid={bid} src={c.src} /></td>
              <td>{editable && <button className="btn btn-sm btn-ghost" onClick={() => setList(list.filter((_, j) => j !== i))} aria-label="Remove criterion">✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 8 }}>
        <span className={`small ${total && total !== 100 ? '' : 'muted'}`} style={{ color: total && total !== 100 ? 'var(--st-critical)' : undefined }}>Total weighting {total}%</span>
        {editable && <button className="btn btn-sm" onClick={() => setList([...list, { name: '', weight: '' }])}>Add criterion</button>}
        {editable && dirty && <button className="btn btn-sm btn-primary" onClick={() => dispatch('criteria.set', { bidId: bid.id, criteria: list }, { success: 'Evaluation criteria saved' })}>Save criteria</button>}
      </div>
    </div>
  );
}
