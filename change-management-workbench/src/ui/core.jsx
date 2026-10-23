// Small presentational components shared by every screen.
import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { STATUS_BADGE, RISK_BADGE, RAG_LABEL, initials } from '../lib/format.js';
import { ADKAR, GLOSSARY, adkarLabel } from '../../shared/refdata.js';
import { sanitiseHtml } from '../../shared/util.js';
import { Link } from 'react-router-dom';

export function PageHead({ eyebrow, title, children, actions }) {
  return (
    <header className="page-head">
      <div className="grow">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <div className="mt-1" style={{ color: 'var(--ink-2)', maxWidth: 860 }}>{children}</div>}
      </div>
      {actions && <div className="btn-row no-print">{actions}</div>}
    </header>
  );
}

export function Card({ title, sub, actions, children, flush = false, className = '', id, icon }) {
  return (
    <section className={`card ${className}`} id={id} aria-labelledby={title && id ? `${id}-h` : undefined}>
      {(title || actions) && (
        <div className="card-head">
          <div className="grow">
            {title && <h2 id={id ? `${id}-h` : undefined}>{icon && <Icon name={icon} size={17} />}{title}</h2>}
            {sub && <p>{sub}</p>}
          </div>
          {actions && <div className="btn-row">{actions}</div>}
        </div>
      )}
      <div className={`card-body ${flush ? 'flush' : ''}`}>{children}</div>
    </section>
  );
}

export function Empty({ icon = 'info', title, children, action }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      {title && <h3>{title}</h3>}
      {children && <div className="small">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--line-strong)" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="var(--brand-teal)" strokeWidth="3" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
        </path>
      </svg>
      <div className="small">{label}…</div>
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="callout bad" role="alert">
      <h4>{error.status === 403 ? 'Access restricted' : error.status === 404 ? 'Not found' : 'Something went wrong'}</h4>
      <div>{error.message || String(error)}</div>
      {onRetry && <button type="button" className="btn btn-sm mt-2" onClick={onRetry}>Try again</button>}
    </div>
  );
}

const STATUS_ICON = { good: 'checkCircle', warning: 'alert', serious: 'alert', critical: 'octagon', info: 'info' };
export function Badge({ tone = '', icon, children, title }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`} title={title}>{icon && <Icon name={icon} />}{children}</span>;
}

// A status value with its label; status colours always come with an icon (never colour alone).
export function StatusBadge({ status, labelText, tone }) {
  if (!status && !labelText) return <span className="muted">—</span>;
  const t = tone ?? STATUS_BADGE[status] ?? '';
  return <Badge tone={t} icon={STATUS_ICON[t]}>{labelText || status}</Badge>;
}

export function RiskBadge({ rating }) {
  if (!rating) return <span className="muted">—</span>;
  const t = RISK_BADGE[rating];
  return <Badge tone={t} icon={STATUS_ICON[t]}>{rating[0].toUpperCase() + rating.slice(1)}</Badge>;
}

export function Rag({ value, text }) {
  const cls = value ? `rag-${value}` : 'rag-none';
  return <span className={`rag ${cls}`}><span className="rag-dot" aria-hidden="true" />{text ?? (value ? RAG_LABEL[value] : 'No data')}</span>;
}

export function AdkarTags({ value = [], all = false }) {
  const set = new Set(value || []);
  const items = all ? ADKAR : ADKAR.filter((a) => set.has(a.id));
  if (!items.length) return <span className="muted">—</span>;
  return (
    <span className="adkar-tags" aria-label={`ADKAR: ${items.filter((a) => set.has(a.id)).map((a) => a.label).join(', ') || 'none'}`}>
      {items.map((a) => <span key={a.id} className={`adkar-tag ${set.has(a.id) ? 'on' : ''}`} title={a.label}>{a.code}</span>)}
    </span>
  );
}

export function BarrierBadge({ element }) {
  if (!element) return <span className="muted">Not assessed</span>;
  if (element === 'none') return <Badge tone="good" icon="checkCircle">No barrier point</Badge>;
  return <Badge tone="critical" icon="octagon">{adkarLabel(element)}</Badge>;
}

export function Avatar({ name, size = '' }) {
  return <span className={`avatar ${size}`} aria-hidden="true">{initials(name)}</span>;
}

const KPI_TONE = { bad: 'critical', warn: 'warning' };
export function Kpi({ label, value, unit, sub, to, tone: givenTone, onClick, title }) {
  const tone = KPI_TONE[givenTone] || givenTone;
  const inner = (
    <>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value" style={tone ? { color: `var(--st-${tone}-ink, var(--ink))` } : undefined}>{value ?? '—'}{unit && value != null && <small>{unit}</small>}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </>
  );
  if (to) return <Link className="kpi" to={to} title={title}>{inner}</Link>;
  if (onClick) return <button type="button" className="kpi" onClick={onClick} style={{ textAlign: 'left', cursor: 'pointer' }} title={title}>{inner}</button>;
  return <div className="kpi" title={title}>{inner}</div>;
}

const METER_TONE = { warning: 'warn', critical: 'bad', serious: 'bad' };
export function Meter({ value, max = 100, tone: givenTone, label, track = '' }) {
  const tone = METER_TONE[givenTone] || givenTone;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (Number(value) / max) * 100));
  return (
    <div className={`meter ${tone || ''} ${track}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value ?? 0} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tabs({ tabs, value, onChange, label = 'Sections' }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.filter(Boolean).map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.icon && <Icon name={t.icon} size={15} />}{t.label}{t.count != null && <span className="pill-count">{typeof t.count === 'number' ? t.count.toLocaleString('en-AU') : t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// Context help from the glossary (USE-03).
export function Help({ term, text }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const content = text || GLOSSARY[term];
  if (!content) return null;
  return (
    <span className="pop-wrap" style={{ display: 'inline-flex' }}>
      <button type="button" className="link-btn" aria-expanded={open} aria-controls={id} aria-label={`What is ${term || 'this'}?`} onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)} style={{ color: 'var(--ink-3)', display: 'inline-flex' }}>
        <Icon name="question" size={14} />
      </button>
      {open && (
        <span id={id} role="tooltip" className="menu" style={{ left: 0, right: 'auto', width: 300, padding: '10px 12px', fontWeight: 400, fontSize: 12.5, color: 'var(--ink-2)', textTransform: 'none', letterSpacing: 0 }}>
          {term && <strong style={{ display: 'block', color: 'var(--ink)', marginBottom: 2 }}>{term}</strong>}
          {content}
        </span>
      )}
    </span>
  );
}

// Popover menu with keyboard dismissal.
export function Popover({ button, children, align = 'right', width }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="pop-wrap" ref={ref}>
      {button({ open, toggle: () => setOpen((o) => !o), close: () => setOpen(false) })}
      {open && <div className="menu" style={{ [align]: 0, ...(align === 'left' ? { right: 'auto' } : {}), ...(width ? { width } : {}) }} onClick={(e) => { if (e.target.closest('[data-close]')) setOpen(false); }}>{typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}</div>}
    </div>
  );
}

export function Drawer({ title, sub, onClose, children, footer, wide = false, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'} tabIndex={-1} ref={ref}>
        <div className="drawer-head">
          <div className="grow">
            {sub && <div className="eyebrow">{sub}</div>}
            <h2>{title}</h2>
          </div>
          {actions}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}

export function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head row-between"><h2>{title}</h2><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Seg({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

export function KV({ items }) {
  return (
    <dl className="kv">
      {items.filter(Boolean).filter((x) => x[1] != null && x[1] !== '' && x[1] !== false).map(([k, v]) => [<dt key={`k-${k}`}>{k}</dt>, <dd key={`v-${k}`}>{v}</dd>])}
    </dl>
  );
}

export function Prose({ html }) {
  if (!html) return <span className="muted">—</span>;
  return <div className="prose" dangerouslySetInnerHTML={{ __html: sanitiseHtml(html) }} />;
}

export function Section({ title, children, actions }) {
  return (
    <div className="form-section">
      <div className="row-between mb-2"><h3 style={{ margin: 0 }}>{title}</h3>{actions}</div>
      {children}
    </div>
  );
}
