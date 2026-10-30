// UI primitives used across the client.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';
import { fmtDate, fmtDateTime, fmtMoney, fmtMoneyShort, fmtPct, fmtNum } from '../../shared/format.js';
import { richToHTML } from '../../shared/markdown.js';
import { TREND_LABEL } from '../../shared/rag.js';
import { sortBy } from '../lib/util.js';

// ---------- Text and numbers ----------
export const Money = ({ v, short, decimals = 0 }) => <span className="tabular">{short ? fmtMoneyShort(v) : fmtMoney(v, { decimals })}</span>;
export const Pct = ({ v, d = 0 }) => <span className="tabular">{fmtPct(v, d)}</span>;
export const Num = ({ v, d = 0 }) => <span className="tabular">{fmtNum(v, d)}</span>;
export const D = ({ v }) => <span className="nowrap">{fmtDate(v)}</span>;
export const DT = ({ v }) => <span className="nowrap">{fmtDateTime(v, 'Australia/Sydney')}</span>;
export const Rich = ({ text, empty = '—' }) => (text && String(text).trim()
  ? <div className="rich" dangerouslySetInnerHTML={{ __html: richToHTML(text) }} /> // escaped by richToHTML
  : <span className="muted">{empty}</span>);

// ---------- Status ----------
export function Rag({ v, sm, title }) {
  if (!v) return <span className={`rag none${sm ? ' sm' : ''}`} title={title || 'Not rated'}>{sm ? '' : 'Not rated'}</span>;
  return <span className={`rag ${v}${sm ? ' sm' : ''}`} title={title || v}>{sm ? v[0] : v}</span>;
}
export const RagDot = ({ v, title }) => <span className={`rag-dot ${v || ''}`} title={title || v || 'Not rated'} />;
export const Level = ({ v }) => (v ? <span className={`level ${v}`}>{v}</span> : <span className="muted">—</span>);
export function Trend({ v }) {
  if (!v) return null;
  const cls = v === 'Up' || v === 'Decreasing' ? 'trend-up' : v === 'Down' || v === 'Increasing' ? 'trend-down' : 'muted';
  return <span className={`small ${cls}`}>{TREND_LABEL[v] || v}</span>;
}

const STATUS_TONE = {
  green: ['Approved', 'Accepted', 'Achieved', 'Done', 'Paid', 'Published', 'Issued', 'Signed', 'Active', 'Closed', 'Validated', 'Delivered', 'Made', 'Resolved', 'Implemented', 'Realised', 'Confirmed', 'Fulfilled', 'Complete', 'Reported', 'Pass', 'Invoiced', 'locked', 'In delivery', 'On track'],
  amber: ['Submitted', 'In review', 'In internal review', 'Awaiting approval', 'Pending', 'In progress', 'Under assessment', 'Draft', 'EM review', 'Finance review', 'Submitted (PM)', 'Submitted (EM)', 'Proposed', 'Tentative', 'At risk', 'Required', 'Open', 'Initiation', 'Stage boundary', 'Closing', 'Partially approved', 'Ready to invoice', 'Pass with comments', 'In approval', 'Forecast late', 'Planned', 'Sent to accounting', 'Queried', 'Returned', 'Deferred'],
  red: ['Rejected', 'Overdue', 'Disputed', 'Late', 'Missed', 'Fail', 'Blocked', 'Invalid', 'Cancelled', 'Void', 'Withdrawn', 'Expired', 'Not realised', 'Occurred', 'On hold', 'Superseded'],
};
export function Status({ v }) {
  if (!v) return <span className="muted">—</span>;
  const tone = STATUS_TONE.red.includes(v) ? 'red' : STATUS_TONE.green.includes(v) ? 'green' : STATUS_TONE.amber.includes(v) ? 'amber' : 'grey';
  return <span className={`badge ${tone}`}>{v}</span>;
}
export const Badge = ({ tone = '', children, title }) => <span className={`badge ${tone}`} title={title}>{children}</span>;

export function Meter({ value, max = 1, mark, tone }) {
  const pct = Math.max(0, Math.min(100, ((Number(value) || 0) / (max || 1)) * 100));
  const t = tone || (pct >= 100 ? 'bad' : pct >= 90 ? 'warn' : '');
  return (
    <div className={`meter ${t}`}>
      <span style={{ width: `${pct}%` }} />
      {mark != null && <i className="mark" style={{ left: `${Math.min(100, (mark / (max || 1)) * 100)}%` }} />}
    </div>
  );
}

export function Tile({ label, value, sub, tone, title }) {
  return (
    <div className={`tile ${tone || ''}`} title={title}>
      <div className="label">{label}</div>
      <div className="value">{value ?? '—'}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

// ---------- Layout ----------
export function Card({ title, sub, actions, children, flush, foot, className = '', id }) {
  return (
    <section className={`card ${className}`} id={id}>
      {(title || actions) && (
        <div className="card-head">
          <div>{typeof title === 'string' ? <h3>{title}</h3> : title}{sub && <p>{sub}</p>}</div>
          {actions && <div className="btn-row">{actions}</div>}
        </div>
      )}
      <div className={`card-body${flush ? ' flush' : ''}`}>{children}</div>
      {foot && <div className="card-foot">{foot}</div>}
    </section>
  );
}

export function PageHead({ title, eyebrow, sub, actions, crumbs }) {
  return (
    <div className="page-head">
      <div className="flex-1">
        {crumbs && <div className="crumbs">{crumbs}</div>}
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="btn-row">{actions}</div>}
    </div>
  );
}

export function Empty({ children = 'Nothing to show.', icon = 'inbox' }) {
  return <div className="empty"><Icon name={icon} />{children}</div>;
}
export function Loading({ label = 'Loading…' }) {
  return <div className="empty"><Icon name="refresh" />{label}</div>;
}
export function ErrorBox({ error, retry }) {
  if (!error) return null;
  return (
    <div className="alert error">
      <Icon name="alert" />
      <div className="flex-1">
        <div>{error.message || String(error)}</div>
        {error.details && typeof error.details === 'object' && (
          <ul>{Object.entries(error.details).filter(([k]) => !k.startsWith('_')).map(([k, v]) => <li key={k}><b>{k}</b>: {Array.isArray(v) ? v.join('; ') : String(v)}</li>)}</ul>
        )}
      </div>
      {retry && <button className="btn btn-sm" onClick={retry}>Retry</button>}
    </div>
  );
}
export function Alert({ tone = 'info', children, icon }) {
  return <div className={`alert ${tone}`}><Icon name={icon || (tone === 'error' ? 'alert' : tone === 'warn' ? 'alert' : tone === 'ok' ? 'checkCircle' : 'info')} /><div className="flex-1">{children}</div></div>;
}

// Wraps a loaded resource: shows loading and errors, renders children(data) when ready.
export function Async({ q, children, empty }) {
  if (q.error) return <ErrorBox error={q.error} retry={q.reload} />;
  if (q.loading && !q.data) return <Loading />;
  if (!q.data) return empty || null;
  return children(q.data);
}

export function KV({ items }) {
  return (
    <dl className="kv">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v ?? <span className="muted">—</span>}</dd></div>
      ))}
    </dl>
  );
}

// ---------- Tabs ----------
export function RouteTabs({ tabs }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {tabs.filter(Boolean).map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          {t.label}{t.count ? <span className="count">{t.count}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
}
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.filter(Boolean).map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}{t.count ? <span className="count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
export function Seg({ options, value, onChange }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => <button key={o.value} type="button" className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

// ---------- Table ----------
// columns: [{ key, label, render(row), sort (key or fn), className, num }]
export function Table({ columns, rows, onRow, empty = 'No records.', rowKey = 'id', initialSort, compact, rowClass, selectable, selected, onSelect, foot }) {
  const [sort, setSort] = useState(initialSort || null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const by = col?.sort === false ? null : typeof col?.sort === 'function' ? col.sort : col?.key;
    return by ? sortBy(rows, by, sort.dir) : rows;
  }, [rows, sort, columns]);
  if (!rows?.length) return <Empty>{empty}</Empty>;
  const allSelected = selectable && rows.every((r) => selected?.has(r[rowKey]));
  return (
    <div className="table-wrap">
      <table className={`table${compact ? ' compact' : ''}`}>
        <thead>
          <tr>
            {selectable && <th className="cb"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={(e) => onSelect(e.target.checked ? new Set(rows.map((r) => r[rowKey])) : new Set())} /></th>}
            {columns.map((c) => (
              <th key={c.key} className={`${c.sort === false ? '' : 'sortable'} ${c.num ? 'num' : ''} ${c.className || ''}`}
                onClick={() => c.sort !== false && setSort((s) => ({ key: c.key, dir: s?.key === c.key ? -s.dir : 1 }))}
                aria-sort={sort?.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>
                {c.label}{sort?.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r[rowKey] ?? i} className={`${onRow ? 'clickable' : ''} ${selected?.has(r[rowKey]) ? 'selected' : ''} ${rowClass ? rowClass(r) : ''}`} onClick={onRow ? () => onRow(r) : undefined}>
              {selectable && (
                <td className="cb" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label="Select row" checked={selected?.has(r[rowKey]) || false} onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(r[rowKey]); else s.delete(r[rowKey]); onSelect(s); }} />
                </td>
              )}
              {columns.map((c) => <td key={c.key} className={`${c.num ? 'num' : ''} ${c.className || ''}`}>{c.render ? c.render(r) : r[c.key] ?? <span className="muted">—</span>}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && <tfoot><tr>{selectable && <td />}{foot}</tr></tfoot>}
      </table>
    </div>
  );
}

// ---------- Overlays ----------
function useEscape(onClose) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

export function Drawer({ title, sub, onClose, children, footer, wide, actions }) {
  useEscape(onClose);
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className={`drawer${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'}>
        <div className="drawer-head">
          <div className="grow">{typeof title === 'string' ? <h2>{title}</h2> : title}{sub && <div className="small muted mt-1">{sub}</div>}</div>
          {actions}
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEscape(onClose);
  return (
    <>
      <div className="overlay top" onClick={onClose} />
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </>
  );
}

// Asks for confirmation, optionally with text input (required for rejections, overrides, withdrawals).
// dialog({ title, message, input: true, required, label, initial, confirm, danger }) resolves to the
// entered text (or true without input), or null when cancelled.
const DialogContext = createContext(null);
export const useDialog = () => useContext(DialogContext);
export function DialogProvider({ children }) {
  const [dlg, setDlg] = useState(null);
  const [text, setText] = useState('');
  const resolver = useRef(null);
  const open = useCallback((opts) => new Promise((resolve) => { resolver.current = resolve; setText(opts.initial || ''); setDlg(opts); }), []);
  const close = (v) => { resolver.current?.(v); setDlg(null); };
  return (
    <DialogContext.Provider value={open}>
      {children}
      {dlg && (
        <Modal title={dlg.title} onClose={() => close(null)} footer={(
          <>
            <button className="btn" onClick={() => close(null)}>Cancel</button>
            <button className={`btn ${dlg.danger ? 'btn-danger' : 'btn-primary'}`} disabled={dlg.input && dlg.required && !text.trim()} onClick={() => close(dlg.input ? text.trim() : true)}>{dlg.confirm || 'Confirm'}</button>
          </>
        )}>
          {dlg.message && <div className="mb-2">{dlg.message}</div>}
          {dlg.input && (
            <div className="field">
              <label>{dlg.label || 'Reason'} {dlg.required && <span className="req">*</span>}</label>
              {dlg.input === 'line' ? <input type="text" autoFocus value={text} onChange={(e) => setText(e.target.value)} /> : <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} />}
            </div>
          )}
        </Modal>
      )}
    </DialogContext.Provider>
  );
}

// ---------- Toasts ----------
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs) => [...xs, { id, message: message?.message || String(message), tone: message instanceof Error ? 'error' : tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'error' || message instanceof Error ? 8000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <span>{t.message}</span>
            <button onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Runs an async action with busy state and toasts; returns the action's result.
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, ok) => {
    setBusy(true);
    try {
      const out = await fn();
      if (ok) toast(typeof ok === 'function' ? ok(out) : ok, 'ok');
      return out;
    } catch (err) {
      toast(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return [run, busy];
}

export function Field({ label, required, hint, error, children, full, className = '' }) {
  return (
    <div className={`field${error ? ' invalid' : ''}${full ? ' full' : ''} ${className}`}>
      {label && <label>{label}{required && <span className="req">*</span>}</label>}
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err">{error}</span>}
    </div>
  );
}
