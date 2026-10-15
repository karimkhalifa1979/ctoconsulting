import { Children, isValidElement, useEffect, useId, useMemo, useState } from 'react';
import { ARES } from '../lib/config.js';
import { riskBand } from '../lib/scoring.js';
import { initials } from '../lib/util.js';

export function Card({ title, subtitle, actions, children, pad = true, className = '', id }) {
  return (
    <div className={`card ${className}`} id={id}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="btn-row">{actions}</div>}
        </div>
      )}
      <div className={pad ? 'card-body' : ''}>{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, accent, title }) {
  return (
    <div className={`card stat ${accent ? 'accent' : ''}`} title={title}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function PageHead({ eyebrow, title, children, actions }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="btn-row no-print">{actions}</div>}
    </div>
  );
}

// Status shown with icon + label + colour (RPT-07: never colour alone).
const TONE_ICON = { good: '✓', warning: '!', serious: '▲', critical: '✕', progress: '◐', none: '○', navy: '•', teal: '•' };
export function Pill({ tone = 'none', icon, children, title }) {
  return <span className={`pill ${tone}`} title={title}><span className="ic" aria-hidden>{icon ?? TONE_ICON[tone]}</span>{children}</span>;
}

export function Avatar({ name, sm }) {
  return <span className={`avatar ${sm ? 'sm' : ''}`} aria-hidden title={name}>{initials(name)}</span>;
}

export function PersonChip({ ws, id }) {
  const p = ws.people.find((x) => x.id === id);
  if (!p) return <span className="muted">—</span>;
  return <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Avatar name={p.name} sm /><span>{p.name}</span></span>;
}

// Four-quadrant risk icon (VAL-07): one quadrant per "are", coloured by band, with a text alternative
// and an optional pattern for colour-blind / print use.
export function RiskIcon({ byAre, size = 34, ws, patterns = false, showLabel = false }) {
  const q = [['right', 0, 0], ['way', 1, 0], ['well', 0, 1], ['benefits', 1, 1]];
  const h = size / 2;
  const text = ARES.map((a) => `${a.short}: ${byAre?.[a.id]?.score === null || byAre?.[a.id]?.score === undefined ? 'not assessed' : `${Math.round(byAre[a.id].score)} (${riskBand(byAre[a.id].score, ws).label})`}`).join('; ');
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap', display: 'inline-flex' }}>
      <svg className="riskicon" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Risk profile — ${text}`}>
        <title>{text}</title>
        <defs>
          <pattern id="rp-amber" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#fab219" /><line x1="0" y1="0" x2="0" y2="4" stroke="#7a5600" strokeWidth="1" /></pattern>
          <pattern id="rp-red" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="4" height="4" fill="#d03b3b" /><line x1="0" y1="0" x2="0" y2="4" stroke="#fff" strokeWidth="1.4" /></pattern>
        </defs>
        {q.map(([id, cx, cy]) => {
          const b = riskBand(byAre?.[id]?.score, ws);
          const fill = patterns && b.id === 'amber' ? 'url(#rp-amber)' : patterns && b.id === 'red' ? 'url(#rp-red)' : b.hex;
          return <rect key={id} x={cx * h + 1} y={cy * h + 1} width={h - 2} height={h - 2} rx="2" fill={fill} />;
        })}
      </svg>
      {showLabel && <span className="mini">{ARES.map((a) => `${a.short[0]}${a.short.split(' ')[1]?.[0] || ''}:${byAre?.[a.id]?.score === null || byAre?.[a.id]?.score === undefined ? '–' : Math.round(byAre[a.id].score)}`).join(' ')}</span>}
    </span>
  );
}

export function Meter({ value, color = 'var(--brand-teal)', label }) {
  return <div className="meter" role="meter" aria-valuenow={Math.round(value ?? 0)} aria-valuemin={0} aria-valuemax={100} aria-label={label}><span style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, background: color }} /></div>;
}

export function Help({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: 'relative' }}>
      <button type="button" className="help" aria-label="Guidance" aria-expanded={open} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)}>?</button>
      {open && <span className="tip" style={{ position: 'absolute', left: 22, top: -4, width: 300, pointerEvents: 'none' }}>{children}</span>}
    </span>
  );
}

export function Guidance({ title, children }) {
  return <div className="guidance">{title && <strong>{title} </strong>}{children}</div>;
}

export function ChecksList({ checks, limit, empty = 'No issues found.' }) {
  const list = limit ? checks.slice(0, limit) : checks;
  if (!checks.length) return <div className="empty-sm">✓ {empty}</div>;
  const icon = { error: '✕', warning: '!', info: 'i' };
  return (
    <div>
      {list.map((c, i) => (
        <div className="check-row" key={i}>
          <span className={`ic sev-${c.severity}`} aria-label={c.severity}>{icon[c.severity]}</span>
          <span>{c.text}{c.program && <span className="mini"> — {c.program}</span>}</span>
          <span className="rule">{c.rule}</span>
        </div>
      ))}
      {limit && checks.length > limit && <div className="mini" style={{ paddingTop: 6 }}>+ {checks.length - limit} more</div>}
    </div>
  );
}

// A single form control is wrapped in a <label>. Groups of buttons or several inputs get a
// labelled role="group" instead, so the caption doesn't become the first button's name.
const CONTROL_TAGS = new Set(['input', 'textarea', 'select']);
export function Field({ label, hint, children, className = '' }) {
  const id = useId();
  const caption = <span id={id}>{label}{hint && <span className="hint"> — {hint}</span>}</span>;
  const kids = Children.toArray(children);
  const isControl = (c) => isValidElement(c) && (CONTROL_TAGS.has(c.type) || CONTROLS.has(c.type));
  const single = kids.filter(isControl).length === 1 && kids.every((c) => isControl(c) || !isValidElement(c) || c.type === 'span');
  if (single) return <label className={`field ${className}`}>{caption}{children}</label>;
  return <div className={`field ${className}`} role="group" aria-labelledby={id}>{caption}{children}</div>;
}

export function TextInput({ value, onChange, ...rest }) {
  return <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export function TextArea({ value, onChange, rows = 3, ...rest }) {
  return <textarea value={value ?? ''} rows={rows} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export function NumberInput({ value, onChange, step = 'any', ...rest }) {
  return <input type="number" value={value ?? ''} step={step} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} {...rest} />;
}
export function DateInput({ value, onChange, ...rest }) {
  return <input type="date" value={value ? String(value).slice(0, 10) : ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export function Select({ value, onChange, options, placeholder, ...rest }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o.id ?? o} value={o.id ?? o}>{o.label ?? o.name ?? o}</option>))}
    </select>
  );
}
export function PersonSelect({ ws, value, onChange, placeholder = '— Unassigned —', ...rest }) {
  return <Select value={value} onChange={onChange} placeholder={placeholder} options={ws.people.map((p) => [p.id, `${p.name} · ${p.position}`])} {...rest} />;
}
const CONTROLS = new Set([TextInput, TextArea, NumberInput, DateInput, Select, PersonSelect]);
export function MultiChips({ options, value = [], onChange }) {
  return (
    <div className="chips">
      {options.map(([id, label]) => (
        <button key={id} type="button" className={`chip ${value.includes(id) ? 'on' : ''}`} aria-pressed={value.includes(id)} onClick={() => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])}>{label}</button>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, sub }) {
  return (
    <div className={`tabs ${sub ? 'sub' : ''}`} role="tablist">
      {tabs.map(([id, label, extra]) => (
        <button key={id} role="tab" aria-selected={value === id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>{label}{extra ? <span className="mini" style={{ marginLeft: 6 }}>{extra}</span> : null}</button>
      ))}
    </div>
  );
}

export function Seg({ options, value, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([id, l]) => <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{l}</button>)}
    </div>
  );
}

export function useTip() {
  const [tip, setTip] = useState(null);
  const bind = (text) => ({
    onMouseMove: (e) => setTip({ text, x: e.clientX + 14, y: e.clientY + 12 }),
    onMouseLeave: () => setTip(null),
    onFocus: (e) => { const r = e.currentTarget.getBoundingClientRect?.(); if (r) setTip({ text, x: r.right + 6, y: r.top }); },
    onBlur: () => setTip(null),
  });
  const node = tip ? <div className="tip" style={{ left: Math.min(tip.x, window.innerWidth - 330), top: Math.min(tip.y, window.innerHeight - 80) }}>{typeof tip.text === 'string' ? tip.text : tip.text}</div> : null;
  return [bind, node];
}

export function BarList({ items, max, color = 'var(--series-1)', onClick, format = (v) => v, limit }) {
  const [bind, tip] = useTip();
  const top = Math.max(1e-9, max ?? Math.max(...items.map((i) => Math.abs(i.value)), 1));
  const list = limit ? items.slice(0, limit) : items;
  return (
    <div className="barlist">
      {list.map((it) => (
        <div key={it.key || it.label} className="bl-row" style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={() => onClick?.(it)} {...bind(`${it.label}: ${format(it.value)}${it.hint ? ` — ${it.hint}` : ''}`)}>
          <div className="bl-label">{it.label}</div>
          <div className="bl-track"><div className="bl-fill" style={{ width: `${(Math.abs(it.value) / top) * 100}%`, background: it.color || color }} /></div>
          <div className="bl-val" style={{ minWidth: 48 }}>{format(it.value)}</div>
        </div>
      ))}
      {tip}
    </div>
  );
}

export function StackBar({ segments, height = 14, showLegend = true, format = (v) => v }) {
  const [bind, tip] = useTip();
  const t = segments.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div>
      <div className="stackbar" style={{ height }}>
        {segments.filter((s) => s.value > 0).map((s) => <span key={s.label} style={{ width: `${(s.value / t) * 100}%`, background: s.color }} {...bind(`${s.label}: ${format(s.value)} (${Math.round((s.value / t) * 100)}%)`)} />)}
      </div>
      {showLegend && <div className="legend">{segments.filter((s) => s.value > 0).map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label} <strong className="tabular">{format(s.value)}</strong></span>)}</div>}
      {tip}
    </div>
  );
}

export function Drawer({ title, subtitle, onClose, children, actions, width }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" style={width ? { width: `min(${width}px, 100%)` } : undefined} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <div>{subtitle && <div className="eyebrow">{subtitle}</div>}<h2>{title}</h2></div>
          <div className="btn-row">{actions}<button className="btn" onClick={onClose} aria-label="Close">✕</button></div>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay modal-center" onClick={onClose}>
      <div className="modal" style={wide ? { width: 'min(880px, calc(100% - 32px))' } : undefined} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="card-head"><h3>{title}</h3><button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="card-body">{children}</div>
        {footer && <div className="card-head" style={{ borderTop: '1px solid var(--line)', borderBottom: 0, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function usePaged(rows, pageSize = 50, deps = []) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), deps); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = useMemo(() => rows.slice(current * pageSize, current * pageSize + pageSize), [rows, current, pageSize]);
  const pager = rows.length > pageSize ? (
    <div className="pager">
      <span>{`${current * pageSize + 1}–${Math.min(rows.length, (current + 1) * pageSize)} of ${rows.length.toLocaleString()}`}</span>
      <div className="btn-row">
        <button className="btn btn-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
        <span>Page {current + 1} of {pages}</span>
        <button className="btn btn-sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button>
      </div>
    </div>
  ) : null;
  return [slice, pager];
}

export function Loading({ text = 'Loading…' }) {
  return <div className="empty"><div className="spinner" /><p>{text}</p></div>;
}
export function Empty({ title, children, action }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}
export function Toast({ text, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [onDone]);
  return <div className="toast" role="status">{text}</div>;
}
export function useToast() {
  const [msg, setMsg] = useState(null);
  return [(m) => setMsg(m), msg ? <Toast text={msg} onDone={() => setMsg(null)} /> : null];
}

export function includesAll(hay, q) {
  if (!q) return true;
  const h = hay.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => h.includes(w));
}

// Accessible data-table twin for a chart (RPT-07, NFR-04).
export function DataTable({ columns, rows, caption }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
      <table className="table compact">
        {caption && <caption className="mini" style={{ textAlign: 'left', padding: '4px 0' }}>{caption}</caption>}
        <thead><tr>{columns.map((c) => <th key={c.label} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{columns.map((c) => <td key={c.label} className={c.num ? 'num' : ''}>{c.get(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// Chart card with a "Table" toggle so every chart has an accessible equivalent.
export function ChartCard({ title, subtitle, actions, table, children, className }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card title={title} subtitle={subtitle} className={className} actions={<>{actions}{table && <button className="btn btn-sm data-table-toggle" aria-pressed={showTable} onClick={() => setShowTable(!showTable)}>{showTable ? 'Chart' : 'Table'}</button>}</>}>
      {showTable && table ? <DataTable {...table} /> : children}
    </Card>
  );
}
