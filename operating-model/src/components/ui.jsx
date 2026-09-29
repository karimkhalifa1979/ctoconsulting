import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isNum } from '../lib/format.js';

export function Card({ title, subtitle, actions, children, pad = true, className = '', style }) {
  return (
    <div className={`card ${className}`} style={style}>
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

export function Stat({ label, value, sub, accent, onClick }) {
  return (
    <div className={`card stat ${accent ? 'accent' : ''}`} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

// Current → target comparison tile. `better` says whether a lower or higher target is an improvement.
export function CompareStat({ label, from, to, fromRaw, toRaw, better = 'higher', fmtDelta, sub }) {
  let delta = null, tone = '';
  if (isNum(fromRaw) && isNum(toRaw)) {
    const d = Number(toRaw) - Number(fromRaw);
    delta = fmtDelta ? fmtDelta(d, Number(fromRaw)) : (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toLocaleString('en-AU', { maximumFractionDigits: 1 });
    if (d !== 0) tone = (better === 'higher') === d > 0 ? 'good' : 'bad';
  }
  return (
    <div className="card cmp">
      <div className="label">{label}</div>
      <div className="vals">
        <span className="from">{from}</span><span className="arrow">→</span><span className="to">{to}</span>
        {delta && <span className={`delta ${tone}`}>{delta}</span>}
      </div>
      {sub && <div className="small muted">{sub}</div>}
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

// Tabs whose selection is kept in the URL (?tab=) so views can be linked to.
export function useTab(defaultTab) {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || defaultTab;
  const setTab = (t) => {
    const p = new URLSearchParams(params);
    p.set('tab', t);
    setParams(p, { replace: true });
  };
  return [tab, setTab];
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs no-print" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}{t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

const TONES = {
  Red: 'bad', Amber: 'warn', Green: 'good',
  Critical: 'bad', High: 'warn', Medium: 'mid', Low: 'good', Extreme: 'bad',
  Eliminate: 'bad', Migrate: 'warn', Tolerate: 'mid', Invest: 'good',
  Expired: 'bad', Expiring: 'warn', 'Decision due': 'warn',
  OK: 'good', 'No decider': 'bad', 'Multiple deciders': 'warn',
  'Within range': 'good', 'Above range': 'warn', 'Below range': 'warn', 'Exceeds maximum': 'bad', 'Within maximum': 'good',
  'Quick win': 'good', 'Strategic initiative': 'info', 'Fill-in': 'mid', Deprioritise: 'neutral',
  Implemented: 'good', 'In progress': 'mid', Planned: 'info', 'Not started': 'neutral', 'Not applicable': 'neutral', Blocked: 'bad',
  Realised: 'good', 'On track': 'good', 'At risk': 'warn', 'Off track': 'bad',
  Complete: 'good', Completed: 'good', Received: 'good', 'Partially received': 'mid', Requested: 'info', 'Not available': 'bad', 'Not requested': 'neutral',
  Scheduled: 'info', Cancelled: 'neutral', 'Not scheduled': 'neutral',
  Open: 'warn', Validated: 'info', Closed: 'good', Mitigating: 'mid', Accepted: 'neutral',
  Proposed: 'neutral', Endorsed: 'info', Approved: 'info', 'In delivery': 'mid', 'On hold': 'warn', Rejected: 'neutral',
  'Manage closely': 'bad', 'Keep satisfied': 'warn', 'Keep informed': 'info', Monitor: 'neutral',
  'Prioritise now': 'good', 'Build foundations': 'info', Opportunistic: 'mid', Park: 'neutral', 'Do not proceed': 'bad',
  Retain: 'good', Retire: 'bad', Replace: 'warn', Consolidate: 'mid', Exit: 'bad', Renegotiate: 'mid', Insource: 'info', New: 'info', Expand: 'info', Relocate: 'mid', Resize: 'mid', Merge: 'mid', Split: 'mid', Disestablish: 'bad', Uplift: 'info', Maintain: 'neutral', Reduce: 'mid',
  'Must have': 'bad', 'Should have': 'warn', 'Could have': 'neutral',
  Ready: 'good', 'Partially ready': 'mid', 'Not ready': 'bad', Unknown: 'neutral',
};
const KIND_TONES = {
  risk: { High: 'bad', Medium: 'warn', Low: 'good' },
  tier: { Prohibited: 'bad', High: 'bad', Limited: 'mid', Minimal: 'good' },
  importance: { High: 'info', Medium: 'neutral', Low: 'neutral' },
};
export const toneOf = (v, kind) => (kind && KIND_TONES[kind]?.[v]) || TONES[v] || 'neutral';

export function Badge({ v, kind, children, title }) {
  if (!v && !children) return null;
  return <span className={`badge t-${toneOf(v, kind)}`} title={title}>{children ?? v}</span>;
}

export const RAG_COLORS = { Red: '#d03b3b', Amber: '#f0a020', Green: '#1f9d58' };
export function RagDot({ rag }) {
  return <span className="rag-dot" style={{ background: RAG_COLORS[rag] || '#cfd7e2' }} title={rag || 'Not assessed'} />;
}

export const mClass = (v) => (isNum(v) ? `m${Math.min(5, Math.max(1, Math.round(Number(v))))}` : 'm0');

export function ScoreButtons({ value, onChange, allowNA = false, size, max = 5, min = 1, labels }) {
  const opts = [];
  for (let i = min; i <= max; i++) opts.push(i);
  return (
    <div className={`scores ${size || ''}`} role="radiogroup">
      {opts.map((n) => (
        <button key={n} type="button" role="radio" aria-checked={Number(value) === n && value !== ''}
          className={`${Number(value) === n && value !== '' ? `on m${n}` : ''}`} title={labels?.[n - min] || String(n)}
          onClick={() => onChange(Number(value) === n && value !== '' ? '' : n)}>{n}</button>
      ))}
      {allowNA && (
        <button type="button" className={`wide ${value === 'N/A' ? 'on na' : ''}`} onClick={() => onChange(value === 'N/A' ? '' : 'N/A')} title="Not applicable">N/A</button>
      )}
    </div>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}{hint && <span className="hint"> · {hint}</span>}</span>
      {children}
    </label>
  );
}

export function TextInput({ value, onChange, ...rest }) {
  return <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export function TextArea({ value, onChange, rows = 3, ...rest }) {
  return <textarea rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export function NumberInput({ value, onChange, ...rest }) {
  return <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} {...rest} />;
}
export function Select({ value, onChange, options, placeholder = '—', ...rest }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      <option value="">{placeholder}</option>
      {options.map((o) => (typeof o === 'object'
        ? <option key={o.value} value={o.value}>{o.label}</option>
        : <option key={o} value={o}>{o}</option>))}
      {value && !options.some((o) => (typeof o === 'object' ? String(o.value) === String(value) : String(o) === String(value))) && <option value={value}>{value}</option>}
    </select>
  );
}

// Shared hover tooltip that follows the pointer.
export function useTip() {
  const [tip, setTip] = useState(null);
  const bind = (text) => ({
    onMouseMove: (e) => setTip({ text, x: e.clientX + 14, y: e.clientY + 12 }),
    onMouseLeave: () => setTip(null),
  });
  const node = tip ? <div className="tip" style={{ left: Math.min(tip.x, window.innerWidth - 330), top: tip.y }}>{tip.text}</div> : null;
  return [bind, node];
}

export function BarList({ items, max, color = 'var(--series-1)', format = (v) => v, onClick }) {
  const [bind, tip] = useTip();
  const top = Math.max(1e-9, max ?? Math.max(...items.map((i) => Math.abs(i.value) || 0), 1));
  return (
    <div className="barlist">
      {items.map((it) => (
        <div key={it.key || it.label} className="bl-row" style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={() => onClick?.(it)} {...bind(`${it.label}: ${format(it.value)}${it.hint ? ` — ${it.hint}` : ''}`)}>
          <div className="bl-label">{it.label}</div>
          <div className="bl-track"><div className="bl-fill" style={{ width: `${Math.max(0, (it.value || 0) / top) * 100}%`, background: it.color || color }} /></div>
          <div className="bl-val">{format(it.value)}</div>
        </div>
      ))}
      {tip}
    </div>
  );
}

export function StackBar({ segments, height = 14, legend = true }) {
  const [bind, tip] = useTip();
  const total = segments.reduce((s, x) => s + (x.value || 0), 0);
  return (
    <div>
      <div className="stackbar" style={{ height }}>
        {total > 0 && segments.filter((s) => s.value).map((s) => (
          <span key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} {...bind(`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`)} />
        ))}
      </div>
      {legend && (
        <div className="legend">
          {segments.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label} <strong className="tabular">{s.value || 0}</strong></span>)}
        </div>
      )}
      {tip}
    </div>
  );
}

export function Progress({ value, color }) {
  return <div className="progress"><i style={{ width: `${Math.max(0, Math.min(1, value || 0)) * 100}%`, background: color }} /></div>;
}

export function Legend({ items }) {
  return <div className="legend">{items.map((i) => <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>)}</div>;
}

export function Drawer({ title, subtitle, onClose, children, actions }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div>
            {subtitle && <div className="eyebrow">{subtitle}</div>}
            <h2>{title}</h2>
          </div>
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
    <div className="overlay modal-center" onMouseDown={onClose}>
      <div className="modal" style={wide ? { width: 'min(900px, calc(100% - 32px))' } : undefined} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="card-head"><h3>{title}</h3><button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="card-body">{children}</div>
        {footer && <div className="card-head" style={{ borderTop: '1px solid var(--line)', borderBottom: 0, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Loading({ text = 'Loading…' }) {
  return <div className="empty"><div className="spinner" /><p>{text}</p></div>;
}

export function Empty({ title, children, action }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}

export function Toast({ text, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [onDone, text]);
  return <div className="toast" role="status">{text}</div>;
}

export function includesAll(hay, q) {
  if (!q) return true;
  const h = String(hay).toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => h.includes(w));
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeFile = (s) => String(s || 'engagement').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'engagement';
