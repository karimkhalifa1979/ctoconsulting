// Inputs for every field type in the entity schema (shared/schema.js), plus read-only renderers.
import { useEffect, useMemo, useState } from 'react';
import { get, upload, fileUrl } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { fmtDate, fmtMoney, fmtPct, fmtNum } from '../../shared/format.js';
import { LISTS } from '../../shared/defaults.js';
import { Level, Rich, Status, Money } from './ui.jsx';
import Icon from './Icon.jsx';

// ---------- Lookups (labels for reference fields) ----------
const cache = new Map();
export function useLookups({ engagementId, clientId } = {}) {
  const key = `${engagementId || ''}|${clientId || ''}`;
  const [data, setData] = useState(cache.get(key) || null);
  useEffect(() => {
    let live = true;
    if (cache.has(key)) { setData(cache.get(key)); return undefined; }
    Promise.all([
      get('/api/lookups', { engagement_id: engagementId, client_id: clientId }),
      get('/api/e/engagement').catch(() => []),
      get('/api/projects/templates').catch(() => ({ profiles: [] })),
    ]).then(([l, engs, t]) => {
      const out = { ...l, engagements: engs.map((e) => ({ id: e.id, label: `${e.code} ${e.name}`, client_id: e.client_id })), profiles: (t.profiles || []).map((p) => ({ id: p.id, label: p.name })) };
      cache.set(key, out);
      if (live) setData(out);
    }).catch(() => live && setData({}));
    return () => { live = false; };
  }, [key, engagementId, clientId]);
  return data;
}
export const clearLookups = () => cache.clear();

const REF_LIST = {
  project: 'projects', stage: 'stages', milestone: 'milestones', deliverable: 'deliverables', contract: 'contracts', po: 'pos', change: 'changes',
  risk: 'risks', issue: 'issues', work_item: 'work_items', meeting: 'meetings', rate_card: 'rate_cards', agreement: 'agreements', client: 'clients', engagement: 'engagements',
};
export function optionsFor(field, lookups, rec = {}) {
  if (!lookups) return [];
  const t = field.type;
  if (t === 'user' || t === 'users') return (lookups.users || []).filter((u) => !u.external || field.key === 'client_user');
  if (t === 'person') return lookups.people || [];
  if (t === 'contact') return lookups.contacts || [];
  if (t === 'profile') return lookups.profiles || [];
  let target = field.ref;
  if (field.refByKind) target = field.refByKind[rec[field.kindField]];
  let list = lookups[REF_LIST[target]] || [];
  if (rec.project_id && ['stage', 'milestone', 'deliverable', 'work_item'].includes(target)) list = list.filter((x) => !x.project_id || x.project_id === rec.project_id);
  if (field.key === 'parent_id' && target === 'work_item') list = list.filter((x) => x.id !== rec.id);
  return list;
}
export function labelFor(field, value, lookups, rec) {
  if (value === null || value === undefined || value === '') return null;
  const opts = optionsFor(field, lookups, rec);
  const one = (v) => opts.find((o) => o.id === v)?.label || v;
  return Array.isArray(value) ? value.map(one).join(', ') : one(value);
}

// ---------- Display ----------
export function FieldValue({ field, value, rec, lookups }) {
  const t = field.type;
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return <span className="muted">—</span>;
  switch (t) {
    case 'date': return fmtDate(value);
    case 'money': return <Money v={Number(value)} decimals={Math.abs(value) < 1000 && value % 1 ? 2 : 0} />;
    case 'percent': return fmtPct(Number(value), 1);
    case 'int': case 'number': return fmtNum(Number(value), Number(value) % 1 ? 2 : 0);
    case 'bool': return value ? 'Yes' : 'No';
    case 'markdown': case 'textarea': return t === 'markdown' ? <Rich text={value} /> : <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>;
    case 'level': return <Level v={value} />;
    case 'scale': case 'scale5': return `${value} / 5`;
    case 'url': return <a href={value} target="_blank" rel="noopener noreferrer">{value}</a>;
    case 'email': return <a href={`mailto:${value}`}>{value}</a>;
    case 'list': case 'tags': return <div className="chips">{value.map((x, i) => <span className="chip" key={i}>{x}</span>)}</div>;
    case 'skills': return <div className="chips">{value.map((s, i) => <span className="chip" key={i}>{s.name} · {s.level}</span>)}</div>;
    case 'expiring': return <div className="chips">{value.map((s, i) => <span className="chip" key={i}>{s.level || s.name}{s.expiry ? ` · to ${fmtDate(s.expiry)}` : ''}</span>)}</div>;
    case 'checklist': return <ul className="list">{value.map((c, i) => <li key={i}><Icon name={c.done ? 'checkCircle' : 'clock'} size={15} /> <span className="grow">{c.text}{c.mandatory ? ' *' : ''}</span>{c.approved !== undefined && <span className="small muted">{c.approved ? 'approved' : 'not approved'}</span>}</li>)}</ul>;
    case 'keydates': return <ul className="list">{value.map((k, i) => <li key={i}><span className="grow">{k.label}</span>{fmtDate(k.date)}</li>)}</ul>;
    case 'conditions': return <ul className="list">{value.map((c, i) => <li key={i}><span className="grow">{c.text}</span><span className="small muted">{c.due ? fmtDate(c.due) : ''}</span>{c.action_id && <Status v="Tracked" />}</li>)}</ul>;
    case 'findings': return <ul className="list">{value.map((f, i) => <li key={i}><span className="badge">{f.severity}</span><span className="grow">{f.text}</span><span className="small muted">{f.resolution}</span></li>)}</ul>;
    case 'measurements': return <ul className="list">{value.map((m, i) => <li key={i}><span>{fmtDate(m.date)}</span><span className="grow">{m.value}</span><span className="small muted">{m.note}</span></li>)}</ul>;
    case 'recipients': return <ul className="list">{value.map((r, i) => <li key={i}><span className="grow">{r.name}</span><span className="small muted">{r.email}</span><span className="badge">{r.kind}</span></li>)}</ul>;
    case 'estimate': return <EstimateView value={value} />;
    case 'rates': return <ul className="list">{value.map((r, i) => <li key={i}><span className="grow">{r.role}{r.person_id ? ` (${labelFor({ type: 'person' }, r.person_id, lookups)})` : ''}</span>{fmtMoney(Number(r.rate))}<span className="small muted">from {fmtDate(r.effective_from)}</span></li>)}</ul>;
    case 'invoicelines': return <InvoiceLines lines={value} />;
    case 'predecessors': return (value || []).map((p) => `${labelFor({ type: 'ref', ref: 'work_item' }, p.id, lookups) || p.id} (${p.type}${p.lag ? ` ${p.lag > 0 ? '+' : ''}${p.lag}d` : ''})`).join(', ');
    case 'links': return <div className="chips">{value.map((l, i) => <span className="chip" key={i}>{l.entity}: {l.ref || l.id}</span>)}</div>;
    case 'onboarding': return Array.isArray(value) ? <div className="chips">{value.map((o, i) => <span className="chip" key={i}>{o.done ? '✓' : '○'} {o.item}</span>)}</div> : <div className="chips">{Object.entries(value).map(([k, v]) => <span className="chip" key={k}>{v ? '✓' : '○'} {k}</span>)}</div>;
    case 'objectives': return <div className="chips">{(value || []).map((o, i) => <span className="chip" key={i}>{o}</span>)}</div>;
    case 'versions': return <ul className="list">{value.map((v, i) => <li key={i}><span className="grow">v{v.version}</span><span className="small muted">{fmtDate(v.at)}</span>{v.file_id && <a href={fileUrl(v.file_id)}>file</a>}</li>)}</ul>;
    case 'image': return <img src={fileUrl(value, true)} alt="" style={{ maxHeight: 60, maxWidth: 200 }} />;
    case 'file': return <a href={fileUrl(value)}><Icon name="download" size={14} /> Download</a>;
    case 'fylimits': return Object.entries(value || {}).map(([fy, v]) => `${fy}: ${fmtMoney(Number(v))}`).join(', ');
    case 'user': case 'users': case 'person': case 'contact': case 'ref': case 'refs': case 'profile': return labelFor(field, value, lookups, rec) || value;
    case 'enum': return field.key === 'status' ? <Status v={value} /> : String(value);
    default: return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

function EstimateView({ value }) {
  const total = (value || []).reduce((a, l) => a + (Number(l.days) || 0) * (Number(l.rate) || 0), 0);
  return (
    <table className="table compact">
      <thead><tr><th>Role</th><th className="num">Days</th><th className="num">Day rate</th><th>Rate source</th><th className="num">Price</th></tr></thead>
      <tbody>{(value || []).map((l, i) => <tr key={i}><td>{l.role}</td><td className="num">{fmtNum(Number(l.days), 1)}</td><td className="num">{fmtMoney(Number(l.rate))}</td><td className="small muted">{l.rate_source}</td><td className="num">{fmtMoney((Number(l.days) || 0) * (Number(l.rate) || 0))}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={4}>Total</td><td className="num">{fmtMoney(total)}</td></tr></tfoot>
    </table>
  );
}
export function InvoiceLines({ lines }) {
  return (
    <table className="table compact">
      <thead><tr><th>Description</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
      <tbody>{(lines || []).map((l, i) => <tr key={i}><td>{l.description}</td><td className="num">{fmtNum(Number(l.qty), 2)}</td><td>{l.unit}</td><td className="num">{fmtMoney(Number(l.rate), { decimals: 2 })}</td><td className="num">{fmtMoney(Number(l.amount), { decimals: 2 })}</td></tr>)}</tbody>
    </table>
  );
}

// ---------- Inputs ----------
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

export function FieldInput({ field, value, onChange, rec, lookups, disabled, engagementId }) {
  const { me } = useSession();
  const t = field.type;
  const lists = me?.settings?.lists || LISTS;
  const common = { disabled, id: `f-${field.key}`, 'aria-label': field.label };
  switch (t) {
    case 'text': case 'abn': case 'email': case 'url':
      return <input type={t === 'email' ? 'email' : t === 'url' ? 'url' : 'text'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...common} />;
    case 'textarea': return <textarea value={value ?? ''} rows={3} onChange={(e) => onChange(e.target.value)} {...common} />;
    case 'markdown': return <MarkdownInput value={value} onChange={onChange} disabled={disabled} />;
    case 'date': return <input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} {...common} />;
    case 'money': case 'number': case 'int':
      return <input type="number" step={t === 'int' ? 1 : 'any'} min={field.min} max={field.max} value={value ?? ''} onChange={(e) => onChange(num(e.target.value))} {...common} />;
    case 'percent':
      return (
        <div className="flex">
          <input type="number" step="0.1" value={value === null || value === undefined ? '' : Math.round(Number(value) * 1000) / 10} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value) / 100)} {...common} />
          <span className="muted">%</span>
        </div>
      );
    case 'bool': return <label className="check"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} disabled={disabled} /> <span>{field.label}</span></label>;
    case 'enum': {
      const opts = field.optionsFn ? field.optionsFn(rec) : field.options || [];
      return (
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} {...common}>
          <option value="">—</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    case 'grade': return <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} {...common}><option value="">—</option>{lists.grades.map((g) => <option key={g}>{g}</option>)}</select>;
    case 'scale': case 'scale5': {
      const labels = t === 'scale' ? (me?.settings?.riskMatrix?.[field.scale] || []).map((x) => `${x.score} ${x.label}`) : ['1 Very low', '2 Low', '3 Medium', '4 High', '5 Very high'];
      return <select value={value ?? ''} onChange={(e) => onChange(num(e.target.value))} {...common}><option value="">—</option>{[1, 2, 3, 4, 5].map((n, i) => <option key={n} value={n}>{labels[i] || n}</option>)}</select>;
    }
    case 'user': case 'person': case 'contact': case 'ref': case 'profile': {
      const opts = optionsFor(field, lookups, rec);
      return (
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} {...common}>
          <option value="">{lookups ? '—' : 'Loading…'}</option>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.label}{o.title ? ` · ${o.title}` : ''}</option>)}
          {value && !opts.some((o) => o.id === value) && <option value={value}>{value}</option>}
        </select>
      );
    }
    case 'users': case 'refs': return <MultiSelect options={optionsFor(field, lookups, rec)} value={value || []} onChange={onChange} disabled={disabled} />;
    case 'list': case 'tags': case 'objectives': return <ListInput value={value || []} onChange={onChange} disabled={disabled} placeholder={t === 'tags' ? 'Add a tag' : 'Add an item'} options={t === 'objectives' ? (lookups?.objectives || []) : null} />;
    case 'checklist': return <RowsInput value={value || []} onChange={onChange} disabled={disabled} cols={[{ key: 'text', label: 'Item', w: '60%' }, { key: 'done', label: 'Done', type: 'bool' }, ...(field.key === 'gate_artefacts' ? [{ key: 'approved', label: 'Approved', type: 'bool' }, { key: 'mandatory', label: 'Mandatory', type: 'bool' }] : [])]} blank={{ text: '', done: false }} />;
    case 'keydates': return <RowsInput value={value || []} onChange={onChange} disabled={disabled} cols={[{ key: 'label', label: 'Key date' }, { key: 'date', label: 'Date', type: 'date' }]} blank={{ label: '', date: '' }} />;
    case 'conditions': return <RowsInput value={value || []} onChange={onChange} disabled={disabled} cols={[{ key: 'text', label: 'Condition or action', w: '55%' }, { key: 'owner', label: 'Owner', type: 'user' }, { key: 'due', label: 'Due', type: 'date' }]} blank={{ text: '' }} lookups={lookups} />;
    case 'findings': return <RowsInput value={value || []} onChange={onChange} disabled={disabled} cols={[{ key: 'severity', label: 'Severity', type: 'enum', options: ['Minor', 'Major', 'Critical'] }, { key: 'text', label: 'Finding', w: '45%' }, { key: 'resolution', label: 'Resolution' }]} blank={{ severity: 'Minor', text: '' }} />;
    case 'measurements': return <RowsInput value={value || []} onChange={onChange} disabled={disabled} cols={[{ key: 'date', label: 'Date', type: 'date' }, { key: 'value', label: 'Measured value' }, { key: 'note', label: 'Note' }]} blank={{ date: '', value: '' }} />;
    case 'recipients': return <RowsInput value={value || []} onChange={onChange} disabled={disabled} cols={[{ key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'kind', label: 'Type', type: 'enum', options: ['client', 'firm'] }]} blank={{ name: '', email: '', kind: 'client' }} />;
    case 'estimate': return <RowsInput value={value || []} onChange={onChange} disabled={disabled} cols={[{ key: 'role', label: 'Role or grade', type: 'enum', options: lists.grades }, { key: 'days', label: 'Days', type: 'number' }, { key: 'rate', label: 'Day rate (blank = rate card)', type: 'number' }]} blank={{ role: 'Consultant', days: 1 }} />;
    case 'rates': return <RowsInput value={value || []} onChange={onChange} disabled={disabled} cols={[{ key: 'role', label: 'Role or grade', type: 'enum', options: lists.grades }, { key: 'person_id', label: 'Named person', type: 'person' }, { key: 'rate', label: 'Rate', type: 'number' }, { key: 'effective_from', label: 'From', type: 'date' }]} blank={{ role: 'Consultant', rate: 0 }} lookups={lookups} />;
    case 'skills': return <RowsInput value={value || []} onChange={onChange} disabled={disabled} cols={[{ key: 'name', label: 'Skill' }, { key: 'level', label: 'Proficiency (1–5)', type: 'number' }]} blank={{ name: '', level: 3 }} />;
    case 'expiring': return <RowsInput value={value || []} onChange={onChange} disabled={disabled} cols={[field.options ? { key: 'level', label: 'Clearance', type: 'enum', options: field.options } : { key: 'name', label: 'Certification' }, { key: 'expiry', label: 'Expiry', type: 'date' }, { key: 'sponsor', label: 'Sponsor / issuer' }]} blank={{ expiry: '' }} />;
    case 'predecessors': return <RowsInput value={value || []} onChange={onChange} disabled={disabled} cols={[{ key: 'id', label: 'Task', type: 'ref', ref: 'work_item' }, { key: 'type', label: 'Type', type: 'enum', options: ['FS', 'SS', 'FF', 'SF'] }, { key: 'lag', label: 'Lag (days)', type: 'number' }]} blank={{ type: 'FS', lag: 0 }} lookups={lookups} rec={rec} />;
    case 'onboarding': {
      const items = Array.isArray(value) ? value : Object.entries(value || {}).map(([item, done]) => ({ item, done }));
      return <RowsInput value={items} onChange={onChange} disabled={disabled} cols={[{ key: 'item', label: 'Requirement' }, { key: 'done', label: 'Done', type: 'bool' }]} blank={{ item: '', done: false }} />;
    }
    case 'fylimits': return <RowsInput value={Object.entries(value || {}).map(([fy, limit]) => ({ fy, limit }))} onChange={(rows) => onChange(Object.fromEntries(rows.filter((r) => r.fy).map((r) => [r.fy, Number(r.limit) || 0])))} disabled={disabled} cols={[{ key: 'fy', label: 'Financial year (e.g. FY2027)' }, { key: 'limit', label: 'Limit', type: 'number' }]} blank={{ fy: '', limit: 0 }} />;
    case 'links': return <FieldValue field={field} value={value} />;
    case 'image': case 'file': return <FileInput value={value} onChange={onChange} disabled={disabled} image={t === 'image'} purpose={field.key === 'logo_file_id' ? 'logo' : field.key === 'receipt_file_id' ? 'receipt' : 'document'} engagementId={engagementId} />;
    case 'level': case 'invoicelines': case 'versions': return <FieldValue field={field} value={value} lookups={lookups} rec={rec} />;
    default: return <input type="text" value={typeof value === 'object' && value ? JSON.stringify(value) : value ?? ''} onChange={(e) => onChange(e.target.value)} {...common} />;
  }
}

function MarkdownInput({ value, onChange, disabled }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="stack-sm">
      <div className="flex between">
        <span className="hint small muted">Supports **bold**, *italics*, bullets (- item) and numbered lists</span>
        <button type="button" className="btn btn-xs btn-ghost" onClick={() => setPreview((p) => !p)}>{preview ? 'Edit' : 'Preview'}</button>
      </div>
      {preview ? <div className="card card-body"><Rich text={value} /></div> : <textarea className="md" rows={5} value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} />}
    </div>
  );
}

export function MultiSelect({ options, value, onChange, disabled }) {
  const [add, setAdd] = useState('');
  const chosen = value.map((v) => options.find((o) => o.id === v) || { id: v, label: v });
  return (
    <div className="stack-sm">
      <div className="chips">
        {chosen.map((o) => <span className="chip" key={o.id}>{o.label}{!disabled && <button type="button" onClick={() => onChange(value.filter((x) => x !== o.id))} aria-label={`Remove ${o.label}`}>×</button>}</span>)}
        {!chosen.length && <span className="muted small">None</span>}
      </div>
      {!disabled && (
        <select value={add} onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); setAdd(''); }} aria-label="Add">
          <option value="">Add…</option>
          {options.filter((o) => !value.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
    </div>
  );
}

function ListInput({ value, onChange, disabled, placeholder, options }) {
  const [text, setText] = useState('');
  const addItem = () => { const t = text.trim(); if (t && !value.includes(t)) onChange([...value, t]); setText(''); };
  return (
    <div className="stack-sm">
      <div className="chips">{value.map((v, i) => <span className="chip" key={i}>{v}{!disabled && <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>}</span>)}</div>
      {!disabled && (options?.length ? (
        <select value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}><option value="">Add…</option>{options.filter((o) => !value.includes(o)).map((o) => <option key={o}>{o}</option>)}</select>
      ) : (
        <div className="flex">
          <input type="text" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} />
          <button type="button" className="btn btn-sm" onClick={addItem}>Add</button>
        </div>
      ))}
    </div>
  );
}

// Editable rows for structured list fields (estimates, rates, checklists, conditions and so on).
export function RowsInput({ value, onChange, disabled, cols, blank, lookups, rec }) {
  const set = (i, k, v) => onChange(value.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="table-wrap">
      <table className="table compact">
        <thead><tr>{cols.map((c) => <th key={c.key} style={c.w ? { width: c.w } : undefined}>{c.label}</th>)}{!disabled && <th />}</tr></thead>
        <tbody>
          {value.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.key}>
                  {c.type === 'bool' ? <input type="checkbox" checked={Boolean(r[c.key])} onChange={(e) => set(i, c.key, e.target.checked)} disabled={disabled} aria-label={c.label} />
                    : c.type === 'enum' ? <select value={r[c.key] ?? ''} onChange={(e) => set(i, c.key, e.target.value)} disabled={disabled} aria-label={c.label}><option value="">—</option>{c.options.map((o) => <option key={o}>{o}</option>)}</select>
                      : ['user', 'person', 'ref'].includes(c.type) ? <select value={r[c.key] ?? ''} onChange={(e) => set(i, c.key, e.target.value || null)} disabled={disabled} aria-label={c.label}><option value="">—</option>{optionsFor({ type: c.type, ref: c.ref }, lookups, rec || {}).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
                        : <input type={c.type === 'date' ? 'date' : c.type === 'number' ? 'number' : 'text'} step="any" value={r[c.key] ?? ''} onChange={(e) => set(i, c.key, c.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} disabled={disabled} aria-label={c.label} />}
                </td>
              ))}
              {!disabled && <td className="actions"><button type="button" className="btn btn-xs btn-ghost" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove row"><Icon name="trash" size={13} /></button></td>}
            </tr>
          ))}
          {!value.length && <tr><td colSpan={cols.length + 1} className="muted small">None</td></tr>}
        </tbody>
      </table>
      {!disabled && <button type="button" className="btn btn-xs mt-1" onClick={() => onChange([...value, { ...blank }])}><Icon name="plus" size={12} /> Add row</button>}
    </div>
  );
}

function FileInput({ value, onChange, disabled, image, purpose, engagementId }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const onFile = async (f) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      const r = await upload('/api/files', f, { 'x-purpose': purpose, ...(engagementId ? { 'x-engagement-id': engagementId } : {}) });
      onChange(r.id);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="stack-sm">
      {value && (image ? <img src={fileUrl(value, true)} alt="" style={{ maxHeight: 70, maxWidth: 220, border: '1px solid var(--line)', borderRadius: 6 }} /> : <a href={fileUrl(value)}>Current file</a>)}
      {!disabled && <input type="file" accept={image ? 'image/png,image/jpeg,image/gif' + (purpose === 'receipt' ? ',application/pdf' : '') : undefined} onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} />}
      {busy && <span className="small muted">Uploading and scanning…</span>}
      {err && <span className="err small">{err}</span>}
    </div>
  );
}

export const isVisible = (field, rec) => !field.hidden && (!field.showIf || field.showIf(rec));
export const useFieldGroups = (fields) => useMemo(() => {
  const groups = [];
  for (const f of fields) {
    const g = f.group || '';
    let grp = groups.find((x) => x.name === g);
    if (!grp) { grp = { name: g, fields: [] }; groups.push(grp); }
    grp.fields.push(f);
  }
  return groups;
}, [fields]);
