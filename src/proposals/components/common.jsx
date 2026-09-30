import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP } from '../lib/store.jsx';
import { initials, fmtDate, fmtZoned, zonedToDate, relTime, aud, daysBetween, todayISO } from '../core/util.js';
import { sectionStatus, stageLabel, roleLabel, LIB_STATUSES, COMPLIANCE } from '../core/constants.js';
import { Drawer, Modal } from '../../components/ui.jsx';

export const ICONS = {
  work: 'M9 11l3 3 8-8 1.4 1.4L12 16.8 7.6 12.4 9 11Zm-6 9V6h2v12h14v2H3Z',
  pipeline: 'M3 5h4v14H3V5Zm7 0h4v9h-4V5Zm7 0h4v6h-4V5Z',
  bids: 'M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h10v-2H8v2Zm0 4h10v-2H8v2Zm0 4h7v-2H8v2Z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
  library: 'M4 3h4v18H4V3Zm5 0h4v18H9V3Zm5.2 1.3 3.8-1 4.6 17.4-3.8 1-4.6-17.4Z',
  people: 'M9 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm-7 9a7 7 0 0 1 14 0v1H2v-1Zm15-9a3 3 0 1 0 0-6v6Zm1 2.1a6 6 0 0 1 4 5.9v2h-4v-2a7.9 7.9 0 0 0-2.1-5.4c.7-.3 1.4-.5 2.1-.5Z',
  rates: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm1 5h-2v1.1c-1.7.3-3 1.5-3 3 0 1.9 1.6 2.6 3.4 3 1.4.3 1.6.6 1.6 1 0 .5-.5.9-1.5.9-1.1 0-1.6-.5-1.7-1.2H7.9c.1 1.6 1.3 2.8 3.1 3.1V18h2v-1.1c1.8-.3 3-1.5 3-3.1 0-2-1.7-2.6-3.5-3-1.3-.3-1.5-.6-1.5-.9 0-.5.5-.8 1.3-.8.9 0 1.3.4 1.4 1h1.9c-.1-1.5-1.2-2.6-2.6-2.9V7Z',
  template: 'M4 4h16v4H4V4Zm0 6h7v10H4V10Zm9 0h7v4h-7v-4Zm0 6h7v4h-7v-4Z',
  chart: 'M3 3h2v16h16v2H3V3Zm4 10h3v5H7v-5Zm5-5h3v10h-3V8Zm5 3h3v7h-3v-7Z',
  content: 'M12 3 2 8l10 5 10-5-10-5Zm-8 9 8 4 8-4v3l-8 4-8-4v-3Z',
  ai: 'M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4L12 2Zm7 12 1 2.3 2.3 1-2.3 1-1 2.3-1-2.3-2.3-1 2.3-1 1-2.3Z',
  users: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4Zm8 0-.9.1c1.2.8 1.9 1.9 1.9 3.4V20h7v-3c0-2.7-5.3-4-8-4Z',
  flow: 'M5 3h6v6H5V3Zm8 12h6v6h-6v-6ZM8 9v4h8v2h2v-4H10V9H8Z',
  slides: 'M3 4h18v12H3V4Zm2 2v8h14V6H5Zm4 12h6v2H9v-2Z',
  settings: 'M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.4 2.9c-.6.3-1.2.6-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5-2.2-1.6ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z',
  plug: 'M16 7V3h-2v4h-4V3H8v4H6v6a5 5 0 0 0 4 4.9V21h4v-3.1a5 5 0 0 0 4-4.9V7h-2Z',
  mail: 'M3 5h18v14H3V5Zm2 2v.5l7 4.5 7-4.5V7H5Zm14 2.8-7 4.5-7-4.5V17h14V9.8Z',
  shield: 'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10l-6 6Z',
  search: 'M10 2a8 8 0 0 1 6.32 12.9l5.39 5.4-1.41 1.4-5.4-5.39A8 8 0 1 1 10 2Zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z',
  bell: 'M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.8V3h-3v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z',
  lock: 'M6 10V8a6 6 0 1 1 12 0v2h1v12H5V10h1Zm2 0h8V8a4 4 0 1 0-8 0v2Z',
  review: 'M3 17.2V21h3.8L17.8 10l-3.8-3.8L3 17.2ZM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8L20.7 7Z',
  approve: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm-1 13.6 6.3-6.3-1.4-1.4-4.9 4.9-2.3-2.3-1.4 1.4 3.7 3.7Z',
  clock: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm1 5h-2v6l5 3 1-1.6-4-2.4V7Z',
  menu: 'M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z',
  down: 'M5 20h14v-2H5v2Zm14-9h-4V3H9v8H5l7 7 7-7Z',
  up: 'M5 20h14v-2H5v2Zm0-10h4v6h6v-6h4l-7-7-7 7Z',
  link: 'M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12ZM8 13h8v-2H8v2Zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10Z',
  cal: 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm-2 8h14v10H5V10Z',
  info: 'M11 7h2v2h-2V7Zm0 4h2v6h-2v-6Zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
  warn: 'M1 21h22L12 2 1 21Zm12-3h-2v-2h2v2Zm0-4h-2v-4h2v4Z',
  back: 'M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2Z',
  doc: 'M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5Z',
  send: 'M2 21 23 12 2 3v7l15 2-15 2v7Z',
  trophy: 'M7 4V2h10v2h4v4a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 15.9V18h3v2H8v-2h3v-2.1A5 5 0 0 1 7.3 12H7a4 4 0 0 1-4-4V4h4Zm0 2H5v2a2 2 0 0 0 2 2V6Zm10 0v4a2 2 0 0 0 2-2V6h-2Z',
  q: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 17h-2v-2h2v2Zm2.1-7.7-.9.9c-.7.7-1.2 1.3-1.2 2.8h-2v-.5c0-1.1.5-2.1 1.2-2.8l1.2-1.3A2 2 0 1 0 10 9H8a4 4 0 1 1 7.1 2.3Z',
  history: 'M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 2 4.9l-1.4 1.4A9 9 0 1 0 13 3Zm-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8H12Z',
};

export function Icon({ name, size }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden style={size ? { width: size, height: size } : undefined}><path d={ICONS[name] || ICONS.info} /></svg>;
}

const PALETTE = ['#0b1f3a', '#0b7d88', '#1c5cab', '#7a52c7', '#a84517', '#11724f', '#b42318', '#5a6675', '#145b7a'];
export const colourFor = (s) => PALETTE[[...String(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

export function Avatar({ id, name, size = '', title, online }) {
  const { userName } = useP();
  const n = name || userName(id);
  return <span className={`avatar ${size} ${online ? 'presence-dot' : ''}`} style={{ background: colourFor(n) }} title={title || n} aria-label={n}>{initials(n)}</span>;
}

export function Person({ id, sub }) {
  const { userName } = useP();
  if (!id) return <span className="muted">Unassigned</span>;
  return <span className="row" style={{ gap: 7, flexWrap: 'nowrap' }}><Avatar id={id} size="sm" /><span>{userName(id)}{sub && <span className="mini"> {sub}</span>}</span></span>;
}

export function SectionStatus({ status }) {
  const s = sectionStatus(status);
  return <span className="pill"><i style={{ background: s.color }} />{s.label}</span>;
}

export function StagePill({ stage }) {
  const cls = stage === 'closed' ? 'navy' : stage === 'archived' ? '' : ['approve', 'produce', 'submit'].includes(stage) ? 'teal' : 'info';
  return <span className={`pill ${cls}`}>{stageLabel(stage)}</span>;
}

export function GatePill({ status }) {
  const map = { passed: ['good', 'Passed'], pending: ['warn', 'Awaiting decision'], rejected: ['bad', 'Rejected'], not_requested: ['', 'Not requested'], skipped: ['', 'Not in workflow'] };
  const [cls, label] = map[status] || ['', status];
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function LibStatus({ status }) {
  const s = LIB_STATUSES.find((x) => x.id === status) || LIB_STATUSES[0];
  return <span className="pill"><i style={{ background: s.color }} />{s.label}</span>;
}

export function Compliance({ value }) {
  const c = COMPLIANCE.find((x) => x.id === (value || '')) || COMPLIANCE[0];
  return <span className="pill"><i style={{ background: c.color }} />{c.label}</span>;
}

export function OutcomePill({ outcome }) {
  if (!outcome) return null;
  const cls = { won: 'good', lost: 'bad', withdrawn: '', cancelled: '' }[outcome.result];
  return <span className={`pill ${cls}`}>{outcome.result[0].toUpperCase() + outcome.result.slice(1)}</span>;
}

export function Closing({ closing, short = false }) {
  if (!closing?.date) return <span className="muted">No closing date</span>;
  const d = zonedToDate(closing.date, closing.time, closing.tz);
  const days = daysBetween(todayISO(), closing.date);
  const syd = fmtZoned(d, 'Australia/Sydney', { weekday: false });
  const local = closing.tz && closing.tz !== 'Australia/Sydney' ? fmtZoned(d, closing.tz, { weekday: false }) : null;
  if (short) return <span title={`${syd}${local ? ` · client time ${local}` : ''}`}>{fmtDate(closing.date)} <span className={days < 0 ? 'pill bad' : days <= 3 ? 'pill warn' : 'mini'}>{days < 0 ? 'closed' : days === 0 ? 'today' : `${days}d`}</span></span>;
  return <span>{syd}{local && <span className="mini"> · client time {local}</span>}</span>;
}

export function Money({ value, cents }) {
  return <span className="tabular">{aud(value, { cents })}</span>;
}

export function When({ at }) {
  if (!at) return <span className="muted">—</span>;
  return <span title={new Date(at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}>{relTime(at)}</span>;
}

export function UserSelect({ value, onChange, filter = () => true, placeholder = 'Choose…', id, disabled, exclude = [] }) {
  const { users } = useP();
  return (
    <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}>
      <option value="">{placeholder}</option>
      {users.filter((u) => u.active !== false && filter(u) && !exclude.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name} — {u.roles.map(roleLabel).join(', ')}</option>)}
    </select>
  );
}

export function MultiUser({ value = [], onChange, filter = () => true, exclude = [], disabled }) {
  const { users, userName } = useP();
  return (
    <div className="multi">
      {value.map((id) => <span key={id} className="tag">{userName(id)}{!disabled && <button type="button" aria-label={`Remove ${userName(id)}`} onClick={() => onChange(value.filter((x) => x !== id))}>✕</button>}</span>)}
      {!disabled && (
        <select value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])} style={{ maxWidth: 200 }} aria-label="Add person">
          <option value="">+ Add</option>
          {users.filter((u) => u.active !== false && filter(u) && !value.includes(u.id) && !exclude.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      )}
    </div>
  );
}

export function TagInput({ value = [], onChange, options = [], placeholder = 'Add…', disabled }) {
  const [t, setT] = useState('');
  const add = (v) => { const x = v.trim(); if (x && !value.includes(x)) onChange([...value, x]); setT(''); };
  const listId = useRef(`dl_${Math.random().toString(36).slice(2)}`).current;
  return (
    <div className="multi">
      {value.map((v) => <span key={v} className="tag">{v}{!disabled && <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>✕</button>}</span>)}
      {!disabled && <><input type="text" list={listId} value={t} placeholder={placeholder} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(t); } }} onBlur={() => t && add(t)} style={{ width: 170 }} /><datalist id={listId}>{options.filter((o) => !value.includes(o)).map((o) => <option key={o} value={o} />)}</datalist></>}
    </div>
  );
}

export function Field({ label, hint, children, full, htmlFor }) {
  return <label className={`field ${full ? 'full' : ''}`} htmlFor={htmlFor}><span>{label}{hint && <span className="hint"> — {hint}</span>}</span>{children}</label>;
}

export function FileDrop({ onFiles, accept, multiple = true, label = 'Drop files here or click to choose', busy }) {
  const [drag, setDrag] = useState(false);
  const input = useRef(null);
  return (
    <div className={`dropzone ${drag ? 'drag' : ''}`} role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); }}>
      <input ref={input} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { if (e.target.files.length) onFiles([...e.target.files]); e.target.value = ''; }} />
      {busy ? <><div className="spinner" /><p style={{ margin: '8px 0 0' }}>{busy === true ? 'Working…' : busy}</p></> : <><Icon name="up" size={22} /><div style={{ marginTop: 6 }}>{label}</div></>}
    </div>
  );
}

export function Confirm({ title, children, confirmLabel = 'Confirm', danger, onConfirm, onClose, requireText, disabled }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy || disabled || (requireText && !text.trim())} onClick={async () => { setBusy(true); try { await onConfirm(text); onClose(); } catch { /* toast shown */ } finally { setBusy(false); } }}>{confirmLabel}</button></>}>
      {children}
      {requireText && <label className="field" style={{ marginTop: 10 }}><span>{requireText}</span><textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus /></label>}
    </Modal>
  );
}

// Opens the source paragraph of an extracted item (CR-04).
export function SourceLink({ bid, src, label }) {
  const [open, setOpen] = useState(false);
  if (!src) return <span className="mini">manual</span>;
  const doc = bid.documents.find((d) => d.id === src.docId);
  return (
    <>
      <button className="src-link" onClick={() => setOpen(true)} title={doc ? `${doc.name}, page ${src.page}, paragraph ${src.para}` : 'Source'}>{label || `${doc ? doc.name.replace(/\.[^.]+$/, '').slice(0, 26) : 'doc'} p${src.page} ¶${src.para}`}</button>
      {open && <SourceDrawer bid={bid} src={src} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SourceDrawer({ bid, src, onClose }) {
  const doc = bid.documents.find((d) => d.id === src.docId);
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: 'center' }); }, []);
  return (
    <Drawer title={doc?.name || 'Source document'} subtitle={`Page ${src.page}, paragraph ${src.para}`} onClose={onClose}>
      {!doc ? <p>The source document is no longer attached.</p> : (doc.pages || []).map((p) => (
        <div key={p.n} style={{ marginBottom: 18 }}>
          <div className="eyebrow">Page {p.n}</div>
          {p.paras.map((t, i) => {
            const hit = p.n === src.page && i + 1 === src.para;
            return <p key={i} ref={hit ? ref : null} style={{ margin: '4px 0', padding: '4px 8px', borderRadius: 6, background: hit ? '#fff1a8' : 'transparent', whiteSpace: 'pre-wrap', fontSize: 13 }}><span className="mini" style={{ marginRight: 8 }}>¶{i + 1}</span>{t.replace(/\t/g, '  |  ')}</p>;
          })}
        </div>
      ))}
    </Drawer>
  );
}

export function BidLink({ bid, children }) {
  return <Link to={`/bids/${bid.id}`}>{children || `${bid.ref} ${bid.title}`}</Link>;
}

export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">{tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={value === id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>{label}</button>)}</div>;
}

export function Blockers({ items, title = 'To move on' }) {
  if (!items?.length) return null;
  return <div className="callout warn"><strong>{title}</strong><ul className="blockers">{items.map((b) => <li key={b}>{b}</li>)}</ul></div>;
}

export function Check({ status }) {
  return <span className={`ic ${status}`}>{status === 'pass' ? '✓' : status === 'fail' ? '✕' : '!'}</span>;
}

export function download(bytes, name, type = 'application/octet-stream') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf', ics: 'text/calendar', json: 'application/json', csv: 'text/csv',
};

export function safeFile(s) {
  return String(s || 'file').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 90);
}
