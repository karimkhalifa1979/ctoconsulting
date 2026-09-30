import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP, useCan } from '../lib/store.jsx';
import { Card, PageHead, Modal, Empty } from '../../components/ui.jsx';
import { Avatar, Field, TagInput, UserSelect } from '../components/common.jsx';
import { LEVELS, CLEARANCES } from '../core/constants.js';
import { fmtDate } from '../core/util.js';

const CLEAR_RANK = Object.fromEntries(CLEARANCES.map((c, i) => [c, i]));
export const availPill = (a) => (a?.status === 'available' ? ['good', 'Available'] : a?.status === 'partial' ? ['warn', `${a.pct}% available`] : ['bad', 'Unavailable']);

// Consultant directory (PR-01): search by skill, certification, clearance, sector and availability.
export default function Consultants() {
  const { view, dispatch } = useP();
  const can = useCan();
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const [clearance, setClearance] = useState('None');
  const [level, setLevel] = useState('');
  const [avail, setAvail] = useState(false);
  const [adding, setAdding] = useState(null);
  const now = Date.now();
  const staleMonths = view.settings.cvStaleMonths || 12;
  const rows = useMemo(() => {
    const terms = q.toLowerCase().split(/[,\s]+/).filter(Boolean);
    return view.consultants.filter((c) => {
      const hay = [c.name, c.role, ...(c.skills || []), ...(c.certifications || []), ...(c.sectors || [])].join(' ').toLowerCase();
      return terms.every((t) => hay.includes(t)) && (!sector || (c.sectors || []).includes(sector)) && CLEAR_RANK[c.clearance || 'None'] >= CLEAR_RANK[clearance] && (!level || c.level === level) && (!avail || c.availability?.status !== 'unavailable');
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [q, sector, clearance, level, avail, view.consultants]);
  const committed = (id) => view.bids.filter((b) => !['closed', 'archived'].includes(b.stage) && (b.staffing || []).some((l) => l.consultantId === id)).length;
  const manage = can('approveLibrary') || can('configure');
  return (
    <div className="stack">
      <PageHead eyebrow="Content" title="Consultants" actions={manage && <button className="btn btn-primary" onClick={() => setAdding({ name: '', role: '', level: 'Consultant', skills: [], certifications: [], clearance: 'None', sectors: [], years: 0, bio: '' })}>Add consultant</button>}>
        Structured profiles that generate CVs in each client’s required format (CL-09). Consultants maintain their own profiles.
      </PageHead>
      <div className="filters">
        <input className="searchbox" style={{ minWidth: 260 }} placeholder="Skills, certifications or names" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search consultants" />
        <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector"><option value="">Any sector</option>{view.taxonomy.sectors.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={clearance} onChange={(e) => setClearance(e.target.value)} aria-label="Minimum clearance">{CLEARANCES.map((c) => <option key={c} value={c}>{c === 'None' ? 'Any clearance' : `${c} or higher`}</option>)}</select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level"><option value="">Any level</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
        <label className="check small"><input type="checkbox" checked={avail} onChange={(e) => setAvail(e.target.checked)} /><span>Hide unavailable</span></label>
        <span className="muted small">{rows.length} people</span>
      </div>
      {rows.length ? (
        <div className="grid g-3 consultant-grid">
          {rows.map((c) => {
            const [cls, label] = availPill(c.availability);
            const stale = c.updatedAt && (now - Date.parse(c.updatedAt)) / 86400000 > staleMonths * 30.4;
            return (
              <Link key={c.id} to={`/consultants/${c.id}`} className="card kan-card" style={{ padding: 16 }}>
                <div className="row" style={{ flexWrap: 'nowrap' }}><Avatar name={c.name} /><div><div className="t" style={{ margin: 0 }}>{c.name}</div><div className="c">{c.role}</div></div></div>
                <div className="mini" style={{ margin: '8px 0 4px' }}>{c.level} · {c.years} years · clearance {c.clearance}</div>
                <div className="small">{(c.skills || []).slice(0, 5).join(' · ')}</div>
                <div className="f"><span className={`pill ${cls}`}>{label}</span><span>{committed(c.id) ? `${committed(c.id)} live bid${committed(c.id) === 1 ? '' : 's'}` : ''}{stale ? ' · profile out of date' : ''}</span></div>
              </Link>
            );
          })}
        </div>
      ) : <Empty title="No one matches">Loosen the filters.</Empty>}
      {adding && (
        <Modal title="Add a consultant profile" onClose={() => setAdding(null)} footer={<><button className="btn" onClick={() => setAdding(null)}>Cancel</button><button className="btn btn-primary" disabled={!adding.name.trim()} onClick={() => dispatch('consultant.create', { consultant: adding }, { success: 'Profile added' }).then(() => setAdding(null))}>Add</button></>}>
          <div className="form-grid">
            <Field label="Name"><input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} /></Field>
            <Field label="Platform user" hint="Lets them edit their own profile"><UserSelect value={adding.userId} onChange={(v) => setAdding({ ...adding, userId: v })} /></Field>
            <Field label="Role"><input value={adding.role} onChange={(e) => setAdding({ ...adding, role: e.target.value })} /></Field>
            <Field label="Level"><select value={adding.level} onChange={(e) => setAdding({ ...adding, level: e.target.value })}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></Field>
            <Field label="Clearance"><select value={adding.clearance} onChange={(e) => setAdding({ ...adding, clearance: e.target.value })}>{CLEARANCES.map((l) => <option key={l}>{l}</option>)}</select></Field>
            <Field label="Years of experience"><input type="number" value={adding.years} onChange={(e) => setAdding({ ...adding, years: e.target.value })} /></Field>
            <Field label="Skills" full><TagInput value={adding.skills} options={[...view.taxonomy.capabilities, ...view.taxonomy.technologies]} onChange={(v) => setAdding({ ...adding, skills: v })} /></Field>
          </div>
          <p className="mini">Last reviewed {fmtDate(new Date().toISOString().slice(0, 10))}. The consultant completes the rest of their profile.</p>
        </Modal>
      )}
    </div>
  );
}
