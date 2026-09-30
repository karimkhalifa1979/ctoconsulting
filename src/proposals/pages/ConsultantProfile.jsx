import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useP } from '../lib/store.jsx';
import { Card, PageHead, Empty } from '../../components/ui.jsx';
import { Avatar, Field, TagInput, When, FileDrop, download, MIME, safeFile } from '../components/common.jsx';
import { LEVELS, CLEARANCES } from '../core/constants.js';
import { aud, fmtDate, todayISO } from '../core/util.js';
import { availPill } from './Consultants.jsx';

function Photo({ c, editable }) {
  const { getFile, putFile, dispatch, toast } = useP();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u = null;
    if (c.photo) getFile(c.photo).then((f) => { if (f) { u = URL.createObjectURL(new Blob([f.bytes], { type: f.type })); setUrl(u); } });
    else setUrl(null);
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [c.photo, getFile]);
  const upload = async (files) => {
    const f = files[0];
    if (!f) return;
    if (!/\.(png|jpe?g)$/i.test(f.name)) { toast('Use a PNG or JPEG photo.', 'error'); return; }
    const id = await putFile(new Uint8Array(await f.arrayBuffer()), { name: f.name, type: f.type });
    await dispatch('consultant.update', { consultantId: c.id, patch: { photo: id } }, { success: 'Photo updated' });
  };
  return (
    <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
      {url ? <img src={url} alt={`Photo of ${c.name}`} style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover' }} /> : <Avatar name={c.name} size="xl" />}
      {editable && <FileDrop onFiles={upload} accept=".png,.jpg,.jpeg" multiple={false} label="Upload a photo" />}
    </div>
  );
}

// A consultant's structured profile (CL-09). The consultant maintains it; CVs are generated from it in each client's format.
export default function ConsultantProfile({ own }) {
  const { id } = useParams();
  const { view, me, dispatch, toast } = useP();
  const c = own ? view.consultants.find((x) => x.userId === me.id) : view.consultants.find((x) => x.id === id);
  const [d, setD] = useState(null);
  const [format, setFormat] = useState('cto');
  useEffect(() => setD(null), [c?.id]);
  if (!c) return <Empty title={own ? 'You do not have a consultant profile' : 'Consultant not found'}>{own ? 'Ask the content librarian to create one linked to your account.' : <Link to="/consultants">Back to consultants</Link>}</Empty>;
  const isMe = c.userId === me.id;
  const editable = isMe || me.roles.some((r) => ['librarian', 'admin'].includes(r));
  const f = d || c;
  const set = (patch) => setD({ ...f, ...patch });
  const save = async () => {
    const patch = {};
    for (const k of ['role', 'level', 'skills', 'certifications', 'clearance', 'sectors', 'years', 'bio', 'education', 'experience', 'availability', 'referees']) if (JSON.stringify(f[k]) !== JSON.stringify(c[k])) patch[k] = f[k];
    if (view.seeCost && f.costRate !== c.costRate) patch.costRate = Number(f.costRate) || null;
    await dispatch('consultant.update', { consultantId: c.id, patch }, { success: 'Profile saved' });
    setD(null);
  };
  const cv = async () => {
    try {
      const { buildCvPack } = await import('../gen/cv.js');
      const bytes = await buildCvPack([{ consultant: c, line: { role: c.role, level: c.level } }], format, { title: `Curriculum vitae — ${c.name}`, header: `${c.name} · CTO Consulting` });
      download(bytes, `${safeFile(c.name)}_CV_${format}.docx`, MIME.docx);
    } catch (e) { toast(e.message, 'error'); }
  };
  const bids = view.bids.filter((b) => (b.staffing || []).some((l) => l.consultantId === c.id));
  const stale = c.updatedAt && (Date.now() - Date.parse(c.updatedAt)) / 86400000 > (view.settings.cvStaleMonths || 12) * 30.4;
  const [cls, label] = availPill(c.availability);
  const exp = f.experience || [];
  return (
    <div className="stack">
      <PageHead eyebrow={<><Link to="/consultants">Consultants</Link>{isMe ? ' · My profile' : ''}</>} title={c.name}
        actions={<div className="row">
          <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="CV format">{(view.settings.cvFormats || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <button className="btn" onClick={cv}>Generate CV</button>
          {editable && !d && <button className="btn btn-primary" onClick={() => setD({ ...c })}>Edit profile</button>}
          {d && <><button className="btn" onClick={() => setD(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}
        </div>}>
        {c.role} · {c.level} · last updated <When at={c.updatedAt} />
      </PageHead>
      {stale && <div className="callout warn">This profile has not been updated in over {view.settings.cvStaleMonths || 12} months. {isMe ? 'Please review it before it is used in a CV.' : 'The consultant has been reminded (CL-05).'}</div>}
      <div className="split-3-2">
        <Card title="Profile">
          <fieldset disabled={!d} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="form-grid">
              <Field label="Role"><input value={f.role || ''} onChange={(e) => set({ role: e.target.value })} /></Field>
              <Field label="Level"><select value={f.level} onChange={(e) => set({ level: e.target.value })}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></Field>
              <Field label="Security clearance"><select value={f.clearance || 'None'} onChange={(e) => set({ clearance: e.target.value })}>{CLEARANCES.map((l) => <option key={l}>{l}</option>)}</select></Field>
              <Field label="Years of experience"><input type="number" value={f.years || 0} onChange={(e) => set({ years: Number(e.target.value) })} /></Field>
              <Field label="Skills" full><TagInput value={f.skills || []} disabled={!d} options={[...view.taxonomy.capabilities, ...view.taxonomy.technologies]} onChange={(v) => set({ skills: v })} /></Field>
              <Field label="Certifications" full><TagInput value={f.certifications || []} disabled={!d} onChange={(v) => set({ certifications: v })} /></Field>
              <Field label="Sectors" full><TagInput value={f.sectors || []} disabled={!d} options={view.taxonomy.sectors} onChange={(v) => set({ sectors: v })} /></Field>
              <Field label="Profile summary" full><textarea rows={4} value={f.bio || ''} onChange={(e) => set({ bio: e.target.value })} /></Field>
              <Field label="Education" full><input value={f.education || ''} onChange={(e) => set({ education: e.target.value })} /></Field>
            </div>
          </fieldset>
          <h4 style={{ margin: '16px 0 6px' }}>Engagements</h4>
          <table className="table">
            <thead><tr><th>Client</th><th>Role</th><th>Period</th><th>Summary</th>{d && <th />}</tr></thead>
            <tbody>
              {exp.map((x, i) => (
                <tr key={i}>
                  {['client', 'role', 'period', 'summary'].map((k) => <td key={k}>{d ? <input value={x[k] || ''} onChange={(e) => set({ experience: exp.map((y, j) => (j === i ? { ...y, [k]: e.target.value } : y)) })} aria-label={k} style={{ width: '100%' }} /> : <span className="small">{x[k]}</span>}</td>)}
                  {d && <td><button className="icon-btn" aria-label="Remove engagement" onClick={() => set({ experience: exp.filter((_, j) => j !== i) })}>✕</button></td>}
                </tr>
              ))}
              {!exp.length && <tr><td colSpan={5} className="muted small">No engagements recorded.</td></tr>}
            </tbody>
          </table>
          {d && <button className="btn btn-sm" onClick={() => set({ experience: [...exp, { client: '', role: '', period: '', summary: '' }] })}>Add engagement</button>}
          <p className="mini">Client names in engagements are anonymised automatically in CVs for other clients unless the client has consented to be named.</p>
        </Card>
        <div className="stack">
          <Card><Photo c={c} editable={editable} /></Card>
          <Card title="Availability" subtitle="Used when building bid teams (PR-01)">
            {d ? (
              <div className="form-grid">
                <Field label="Status"><select value={f.availability?.status || 'available'} onChange={(e) => set({ availability: { ...f.availability, status: e.target.value, pct: e.target.value === 'available' ? 100 : e.target.value === 'unavailable' ? 0 : f.availability?.pct || 50 } })}><option value="available">Available</option><option value="partial">Partly available</option><option value="unavailable">Unavailable</option></select></Field>
                {f.availability?.status === 'partial' && <Field label="Percent available"><input type="number" min="0" max="100" value={f.availability?.pct || 50} onChange={(e) => set({ availability: { ...f.availability, pct: Number(e.target.value) } })} /></Field>}
                <Field label="From"><input type="date" value={f.availability?.from || todayISO()} onChange={(e) => set({ availability: { ...f.availability, from: e.target.value } })} /></Field>
                <Field label="Note" full><input value={f.availability?.note || ''} onChange={(e) => set({ availability: { ...f.availability, note: e.target.value } })} /></Field>
              </div>
            ) : <p><span className={`pill ${cls}`}>{label}</span>{c.availability?.from && c.availability.status !== 'available' ? ` from ${fmtDate(c.availability.from)}` : ''}{c.availability?.note ? ` · ${c.availability.note}` : ''}</p>}
          </Card>
          {view.seeCost && (
            <Card title="Cost rate (internal only)" subtitle="Visible to partners, commercial approvers and administrators (PR-08)">
              {d ? <Field label="Daily cost (AUD)"><input type="number" value={f.costRate || ''} onChange={(e) => set({ costRate: e.target.value })} /></Field> : <div className="num-big">{c.costRate ? aud(c.costRate) : '—'}<span className="mini"> per day</span></div>}
            </Card>
          )}
          <Card title="Proposed on" pad={false}>
            {bids.length ? bids.map((b) => { const l = b.staffing.find((x) => x.consultantId === c.id); return <div key={b.id} className="work-item" style={{ gridTemplateColumns: '1fr auto' }}><div><div className="t"><Link to={`/bids/${b.id}/pricing`}>{b.ref} {b.title}</Link></div><div className="d">{l.role} · {l.days} days</div></div><span className={`pill ${l.availability === 'confirmed' ? 'good' : l.availability === 'declined' ? 'bad' : 'warn'}`}>{l.availability || 'pending'}</span></div>; }) : <p className="muted small" style={{ padding: '0 18px 12px' }}>Not on any bid you can see.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
