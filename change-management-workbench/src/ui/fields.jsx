// Field controls driven by the entity schema: one control per field type, plus pickers for references,
// users, ADKAR elements, rich text and table fields.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { listOptions } from '../../shared/schema.js';
import { ADKAR, PLAN_TYPES } from '../../shared/refdata.js';
import { ROLES } from '../../shared/access.js';
import { CATALOGUE, NARRATIVE_KEYS } from '../../shared/artefacts/catalogue.js';
import { asArray, sanitiseHtml } from '../../shared/util.js';
import { fmtDateTime } from '../lib/format.js';

// Options for select and multi fields.
export function selectOptions(fd, { config, model } = {}) {
  if (fd.list) return listOptions(fd.list, config);
  if (fd.options) return fd.options;
  switch (fd.optionsFrom) {
    case 'planTypes': return (model?.planTypes || PLAN_TYPES).map((p) => ({ id: p.id, label: p.label }));
    case 'roles': return ROLES.map((r) => ({ id: r.id, label: r.label }));
    case 'artefactTypes': return [{ id: '*', label: 'Any artefact (default)' }, ...CATALOGUE.map((c) => ({ id: c.id, label: c.title }))];
    case 'narrativeKeys': return NARRATIVE_KEYS;
    case 'collectionNotices': return asArray(config?.settings?.collectionNotices).map((n) => ({ id: n.id, label: `${n.title} (v${n.version})` }));
    default: return [];
  }
}

export function FieldControl({ fd, value, onChange, lookups, config, model, disabled, invalid, id, autoFocus }) {
  const common = { id, disabled, 'aria-invalid': invalid || undefined, className: invalid ? 'invalid' : undefined, autoFocus };
  const set = (v) => onChange(v);
  switch (fd.type) {
    case 'textarea':
      return <textarea {...common} rows={fd.rows || 3} value={value ?? ''} onChange={(e) => set(e.target.value)} />;
    case 'richtext':
      return <RichText id={id} value={value || ''} onChange={set} disabled={disabled} />;
    case 'int':
    case 'number':
    case 'money':
      return <input {...common} type="number" inputMode="decimal" step={fd.type === 'int' ? 1 : 'any'} min={fd.min} max={fd.max} value={value ?? ''} onChange={(e) => set(e.target.value === '' ? null : e.target.value)} />;
    case 'date':
      return <input {...common} type="date" value={value || ''} onChange={(e) => set(e.target.value || null)} />;
    case 'time':
      return <input {...common} type="time" value={value || ''} onChange={(e) => set(e.target.value || null)} />;
    case 'datetime':
      return <input {...common} type="text" readOnly value={value ? fmtDateTime(value, config?.settings?.timeZone) : ''} />;
    case 'bool':
      return <label className="check"><input type="checkbox" id={id} disabled={disabled} checked={!!value} onChange={(e) => set(e.target.checked)} /><span>{fd.checkLabel || 'Yes'}</span></label>;
    case 'select': {
      // Values an administrator has retired are not offered for new entries but still show where used.
      const opts = selectOptions(fd, { config, model }).filter((o) => o.active !== false || o.id === value);
      return (
        <select {...common} value={value ?? ''} onChange={(e) => set(e.target.value || null)}>
          <option value="">{fd.required ? 'Choose…' : '—'}</option>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          {value && !opts.some((o) => o.id === value) && <option value={value}>{value}</option>}
        </select>
      );
    }
    case 'multi':
      return <MultiSelect id={id} options={selectOptions(fd, { config, model }).filter((o) => o.active !== false || asArray(value).includes(o.id))} value={asArray(value)} onChange={set} disabled={disabled} invalid={invalid} />;
    case 'adkar':
      return <AdkarPicker id={id} value={asArray(value)} onChange={set} disabled={disabled} />;
    case 'ref':
      return <RefPicker id={id} options={lookups?.optionsFor(fd.ref) || []} search={lookups?.search?.[fd.ref]} value={value || null} onChange={set} disabled={disabled} invalid={invalid} />;
    case 'refs':
      return <RefPicker id={id} multiple options={lookups?.optionsFor(fd.ref) || []} search={lookups?.search?.[fd.ref]} value={asArray(value)} onChange={set} disabled={disabled} invalid={invalid} />;
    case 'user':
      return <RefPicker id={id} options={lookups?.optionsFor('user') || []} value={value || null} onChange={set} disabled={disabled} invalid={invalid} />;
    case 'users':
      return <RefPicker id={id} multiple options={lookups?.optionsFor('user') || []} value={asArray(value)} onChange={set} disabled={disabled} invalid={invalid} />;
    case 'table':
      return <TableEditor fd={fd} value={asArray(value)} onChange={set} lookups={lookups} config={config} model={model} disabled={disabled} />;
    case 'json':
      return <JsonEditor id={id} value={value} onChange={set} disabled={disabled} />;
    case 'email':
      return <input {...common} type="email" autoComplete="off" value={value ?? ''} onChange={(e) => set(e.target.value)} />;
    case 'phone':
      return <input {...common} type="tel" value={value ?? ''} onChange={(e) => set(e.target.value)} />;
    case 'url':
      return <input {...common} type="url" placeholder="https://" value={value ?? ''} onChange={(e) => set(e.target.value)} />;
    case 'code':
      return <input {...common} type="text" readOnly value={value ?? ''} />;
    default:
      return <input {...common} type="text" value={value ?? ''} onChange={(e) => set(e.target.value)} />;
  }
}

export function AdkarPicker({ value = [], onChange, disabled, id }) {
  const set = new Set(value);
  return (
    <div className="adkar-picker" role="group" aria-label="ADKAR elements" id={id}>
      {ADKAR.map((a) => (
        <button key={a.id} type="button" disabled={disabled} aria-pressed={set.has(a.id)} title={a.outcome}
          onClick={() => { const n = new Set(set); n.has(a.id) ? n.delete(a.id) : n.add(a.id); onChange(ADKAR.map((x) => x.id).filter((x) => n.has(x))); }}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

export function MultiSelect({ options, value = [], onChange, disabled, id }) {
  return <RefPicker id={id} multiple options={options.map((o) => ({ id: o.id, label: o.label }))} value={value} onChange={onChange} disabled={disabled} />;
}

// Combobox for single or multiple references with type-ahead (USE-02: keyboard operable).
// `search`, when given, finds further options on the server as the user types (a large stakeholder master).
export function RefPicker({ options = [], value, onChange, multiple = false, disabled, placeholder = 'Search…', id, invalid, allowCreate, search }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState({ q: '', options: [] });
  const [known, setKnown] = useState({});
  const listId = useId();
  const ref = useRef(null);
  const selected = multiple ? asArray(value) : value ? [value] : [];
  const byId = useMemo(() => ({ ...known, ...Object.fromEntries(options.map((o) => [o.id, o])) }), [options, known]);
  const term = q.trim();
  useEffect(() => {
    if (!search || !open || term.length < 2) return undefined;
    let alive = true;
    const t = setTimeout(() => search(term).then((found) => { if (alive) setRemote({ q: term, options: found }); }).catch(() => { if (alive) setRemote({ q: term, options: [] }); }), 250);
    return () => { alive = false; clearTimeout(t); };
  }, [search, open, term]);
  const searching = !!search && term.length >= 2 && remote.q !== term;
  const matches = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const local = options.filter((o) => (!multiple || !selected.includes(o.id)) && words.every((w) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(w)));
    const seen = new Set(local.map((o) => o.id));
    const more = remote.q === term && term.length >= 2 ? remote.options.filter((o) => !seen.has(o.id) && (!multiple || !selected.includes(o.id))) : [];
    return [...local, ...more].slice(0, 60);
  }, [options, remote, term, q, multiple, selected]);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const choose = (o) => {
    if (!byId[o.id]) setKnown((k) => ({ ...k, [o.id]: o }));
    if (multiple) onChange([...selected, o.id]);
    else { onChange(o.id); setOpen(false); }
    setQ('');
    setActive(0);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (open && matches[active]) { e.preventDefault(); choose(matches[active]); } }
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Backspace' && !q && multiple && selected.length) onChange(selected.slice(0, -1));
  };
  const single = !multiple && value ? byId[value] : null;
  return (
    <div className={`picker ${invalid ? 'invalid' : ''}`} ref={ref}>
      <div className="chip-input" onClick={() => !disabled && ref.current?.querySelector('input')?.focus()}>
        {multiple && selected.map((sid) => (
          <span key={sid} className="chip">{byId[sid]?.label || sid}{!disabled && <button type="button" aria-label={`Remove ${byId[sid]?.label || sid}`} onClick={(e) => { e.stopPropagation(); onChange(selected.filter((x) => x !== sid)); }}>×</button>}</span>
        ))}
        <input
          id={id} type="text" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" disabled={disabled}
          value={open || !single ? q : single.label} placeholder={single ? single.label : selected.length ? '' : placeholder}
          onFocus={() => { setOpen(true); setQ(''); }} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKey}
        />
        {!multiple && value && !disabled && <button type="button" className="link-btn" aria-label="Clear" onClick={(e) => { e.stopPropagation(); onChange(null); }} style={{ color: 'var(--ink-3)', padding: '0 4px' }}>×</button>}
      </div>
      {open && !disabled && (
        <div className="picker-list" role="listbox" id={listId}>
          {matches.map((o, i) => (
            <div key={o.id} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); choose(o); }} onMouseEnter={() => setActive(i)}>
              <span>{o.label}</span>{o.sub && <span className="sub">{o.sub}</span>}
            </div>
          ))}
          {!matches.length && <div className="muted small" style={{ padding: 8 }}>{searching ? 'Searching…' : allowCreate && q ? <button type="button" className="link-btn" onMouseDown={(e) => { e.preventDefault(); allowCreate(q); setQ(''); }}>Create “{q}”</button> : 'No matches'}</div>}
          {matches.length > 0 && searching && <div className="muted tiny" style={{ padding: '4px 8px' }}>Searching the stakeholder master…</div>}
        </div>
      )}
    </div>
  );
}

// Minimal rich-text editor (bold, italic, lists, links). Output is sanitised on save by the service.
export function RichText({ value, onChange, disabled, id, minHeight }) {
  const ref = useRef(null);
  const last = useRef(value);
  useEffect(() => {
    if (ref.current && value !== last.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = sanitiseHtml(value || '');
      last.current = value;
    }
  }, [value]);
  useEffect(() => { if (ref.current) ref.current.innerHTML = sanitiseHtml(value || ''); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cmd = (c, arg) => {
    ref.current?.focus();
    document.execCommand(c, false, arg);
    emit();
  };
  const emit = () => {
    const html = ref.current?.innerHTML || '';
    last.current = html;
    onChange(html === '<br>' ? '' : html);
  };
  const tools = [['bold', 'B', 'Bold'], ['italic', 'I', 'Italic'], ['insertUnorderedList', '•', 'Bulleted list'], ['insertOrderedList', '1.', 'Numbered list']];
  return (
    <div className="rte">
      {!disabled && (
        <div className="rte-bar" role="toolbar" aria-label="Formatting">
          {tools.map(([c, l, t]) => <button key={c} type="button" title={t} aria-label={t} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd(c)}>{l}</button>)}
          <button type="button" title="Link" aria-label="Insert link" onMouseDown={(e) => e.preventDefault()} onClick={() => { const url = window.prompt('Link address (https://…)'); if (url && /^https?:\/\//.test(url)) cmd('createLink', url); }}><Icon name="link" size={14} /></button>
        </div>
      )}
      <div id={id} ref={ref} className="rte-body prose" contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-multiline="true" onInput={emit} onBlur={emit} style={minHeight ? { minHeight } : undefined} />
    </div>
  );
}

export function TableEditor({ fd, value = [], onChange, lookups, config, model, disabled }) {
  const cols = fd.columns || [];
  const update = (i, key, v) => onChange(value.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  return (
    <div className="card" style={{ boxShadow: 'none' }}>
      <div className="table-wrap">
        <table className="tbl tbl-compact">
          <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}{c.required && <em className="req">*</em>}</th>)}{!disabled && <th className="cb" />}</tr></thead>
          <tbody>
            {value.map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key} style={{ minWidth: c.type === 'bool' ? 60 : 140 }}>
                    <FieldControl fd={c} value={row?.[c.key]} onChange={(v) => update(i, c.key, v)} lookups={lookups} config={config} model={model} disabled={disabled || c.readOnly} />
                  </td>
                ))}
                {!disabled && <td><button type="button" className="icon-btn" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><Icon name="trash" /></button></td>}
              </tr>
            ))}
            {!value.length && <tr><td colSpan={cols.length + 1} className="muted small">No rows yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {!disabled && <div style={{ padding: 8 }}><button type="button" className="btn btn-sm" onClick={() => onChange([...value, {}])}><Icon name="plus" />Add row</button></div>}
    </div>
  );
}

function JsonEditor({ value, onChange, disabled, id }) {
  const [text, setText] = useState(() => (value == null ? '' : JSON.stringify(value, null, 2)));
  const [err, setErr] = useState(null);
  return (
    <div>
      <textarea id={id} rows={5} className={err ? 'invalid' : ''} disabled={disabled} value={text} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value.trim()) { setErr(null); onChange(null); return; }
          try { onChange(JSON.parse(e.target.value)); setErr(null); } catch { setErr('Not valid JSON yet'); }
        }} />
      {err && <div className="err small">{err}</div>}
    </div>
  );
}
