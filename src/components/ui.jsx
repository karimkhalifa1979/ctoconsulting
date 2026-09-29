import { useEffect, useMemo, useState } from 'react';
import { STATUSES, statusOf } from '../lib/assessment.js';

export function Card({ title, subtitle, actions, children, pad = true, className = '' }) {
  return (
    <div className={`card ${className}`}>
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

export function Stat({ label, value, sub, accent }) {
  return (
    <div className={`card stat ${accent ? 'accent' : ''}`}>
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

export const LevelBadge = ({ level }) => <span className={`badge lvl-${level}`}>{level ? level[0].toUpperCase() + level.slice(1) : '—'}</span>;
export const PriorityBadge = ({ p }) => (p ? <span className={`badge pri-${p}`}>{p}</span> : null);

export function StatusBadge({ a, status }) {
  const s = status ? STATUSES.find((x) => x.id === status) : statusOf(a);
  return (
    <span className="badge" title={s.label}>
      <span className="dot" style={{ background: s.color }} aria-hidden />
      {s.label}
    </span>
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

// Horizontal bar list — single series magnitude, values labelled at the end.
export function BarList({ items, max, color = 'var(--series-1)', onClick, format = (v) => v, limit }) {
  const [bind, tip] = useTip();
  const top = Math.max(1, max ?? Math.max(...items.map((i) => i.value), 1));
  const list = limit ? items.slice(0, limit) : items;
  return (
    <div className="barlist">
      {list.map((it) => (
        <div key={it.key || it.label} className="bl-row" style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={() => onClick?.(it)} {...bind(`${it.label}: ${format(it.value)}${it.hint ? ` — ${it.hint}` : ''}`)}>
          <div className="bl-label">{it.label}</div>
          <div className="bl-track"><div className="bl-fill" style={{ width: `${(it.value / top) * 100}%`, background: it.color || color }} /></div>
          <div className="bl-val">{format(it.value)}</div>
        </div>
      ))}
      {tip}
    </div>
  );
}

// Stacked status bar with a legend; segments separated by a 2px surface gap.
export function StatusBar({ counts, total, showLegend = true, height = 14 }) {
  const [bind, tip] = useTip();
  const t = total || Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return (
    <div>
      <div className="stackbar" style={{ height }}>
        {STATUSES.filter((s) => counts[s.id]).map((s) => (
          <span key={s.id} style={{ width: `${(counts[s.id] / t) * 100}%`, background: s.color }} {...bind(`${s.label}: ${counts[s.id]} (${Math.round((counts[s.id] / t) * 100)}%)`)} />
        ))}
      </div>
      {showLegend && (
        <div className="legend">
          {STATUSES.filter((s) => counts[s.id]).map((s) => (
            <span key={s.id}><i style={{ background: s.color }} />{s.label} <strong className="tabular">{counts[s.id]}</strong></span>
          ))}
        </div>
      )}
      {tip}
    </div>
  );
}

// Semi-circular gauge for a 0–100 score.
export function Gauge({ value, label = 'Compliance score', size = 190 }) {
  const v = value ?? 0;
  const r = 78, cx = 100, cy = 96;
  const ang = Math.PI * (1 - v / 100);
  const x = cx + r * Math.cos(ang), y = cy - r * Math.sin(ang);
  const color = value === null ? 'var(--st-none)' : v >= 85 ? 'var(--st-good)' : v >= 65 ? 'var(--st-warning)' : v >= 40 ? 'var(--st-serious)' : 'var(--st-critical)';
  return (
    <svg className="gauge" viewBox="0 0 200 120" width={size} role="img" aria-label={`${label}: ${value ?? 'not assessed'}`}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#e7ebf0" strokeWidth="14" strokeLinecap="round" />
      {value !== null && v > 0 && <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />}
      <text x={cx} y={cy - 12} textAnchor="middle" fontSize="30" fontWeight="700" fill="var(--brand-navy)">{value === null ? '—' : `${v}%`}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="11" fill="var(--ink-3)">{label}</text>
    </svg>
  );
}

// Donut for a handful of categories (≤ 3 categorical slots).
export function Donut({ items, size = 150, center, sub }) {
  const [bind, tip] = useTip();
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = 52, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="row" style={{ gap: 18, flexWrap: 'nowrap' }}>
      <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={items.map((i) => `${i.label} ${i.value}`).join(', ')}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eef2f7" strokeWidth="18" />
        {items.map((it) => {
          const len = (it.value / total) * c;
          const seg = (
            <circle key={it.label} cx="70" cy="70" r={r} fill="none" stroke={it.color} strokeWidth="18"
              strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" {...bind(`${it.label}: ${it.value} (${Math.round((it.value / total) * 100)}%)`)} />
          );
          offset += len;
          return seg;
        })}
        <text x="70" y="68" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--brand-navy)" fontFamily="var(--font-head)">{center ?? total}</text>
        <text x="70" y="86" textAnchor="middle" fontSize="10" fill="var(--ink-3)">{sub}</text>
      </svg>
      <div className="legend" style={{ flexDirection: 'column', gap: 8, marginTop: 0 }}>
        {items.map((it) => (
          <span key={it.label}><i style={{ background: it.color }} />{it.label} <strong className="tabular">{it.value.toLocaleString()}</strong></span>
        ))}
      </div>
      {tip}
    </div>
  );
}

export function Drawer({ title, subtitle, onClose, children, actions }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
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

export function Modal({ title, onClose, children, footer }) {
  return (
    <div className="overlay modal-center" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
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
  const pager = (
    <div className="pager">
      <span>{rows.length ? `${current * pageSize + 1}–${Math.min(rows.length, (current + 1) * pageSize)} of ${rows.length.toLocaleString()}` : 'No results'}</span>
      <div className="btn-row">
        <button className="btn btn-sm" disabled={current === 0} onClick={() => setPage(0)}>«</button>
        <button className="btn btn-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
        <span>Page {current + 1} of {pages}</span>
        <button className="btn btn-sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button>
        <button className="btn btn-sm" disabled={current >= pages - 1} onClick={() => setPage(pages - 1)}>»</button>
      </div>
    </div>
  );
  return [slice, pager];
}

export function Loading({ text = 'Loading…' }) {
  return <div className="empty"><div className="spinner" /><p>{text}</p></div>;
}

export function Empty({ title, children }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}

export function Toast({ text, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [onDone]);
  return <div className="toast" role="status">{text}</div>;
}

export function Linkify({ text }) {
  const parts = String(text || '').split(/(https?:\/\/[^\s;,]+)/g);
  return parts.map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a> : p));
}

export function includesAll(hay, q) {
  if (!q) return true;
  const h = hay.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => h.includes(w));
}
