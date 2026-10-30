// SVG charts: line (with crosshair), bars, risk heat map, RAG strip, Gantt and sparkline.
// Categorical slots follow the validated order blue, orange, aqua, violet; status colours are kept
// for RAG and always carry a letter or label.
import { useMemo, useRef, useState } from 'react';
import { fmtMoneyShort, fmtDate } from '../../shared/format.js';
import { addDays, diffDays, monthOf, addMonths } from '../../shared/dates.js';

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#6250d6', '#64748b'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks.at(-1) < max) ticks.push(ticks.at(-1) + step);
  return ticks;
}

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div style={{ position: 'absolute', left: tip.x, top: tip.y, transform: `translate(${tip.flip ? 'calc(-100% - 12px)' : '12px'}, -50%)`, background: '#fff', border: '1px solid var(--line)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', padding: '6px 10px', fontSize: 12, pointerEvents: 'none', zIndex: 5, minWidth: 140 }}>
      <div style={{ color: 'var(--ink-3)', marginBottom: 2 }}>{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 12, height: 0, borderTop: `2px ${r.dashed ? 'dashed' : 'solid'} ${r.color}` }} />
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>{r.value}</b>
          <span style={{ color: 'var(--ink-3)' }}>{r.name}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ series, box }) {
  return (
    <div className="legend">
      {series.map((s) => <span key={s.name}><i className={box ? 'box' : ''} style={{ background: box ? s.color : 'transparent', borderTop: box ? 0 : `2px ${s.dashed ? 'dashed' : 'solid'} ${s.color}`, height: box ? 10 : 0 }} />{s.name}</span>)}
    </div>
  );
}

// series: [{ name, color, dashed, values: [number|null] }] over categories (x labels).
export function LineChart({ categories, series, height = 220, format = fmtMoneyShort, labelX = (x) => x, markX }) {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const W = 640, H = height, pad = { l: 52, r: 14, t: 10, b: 26 };
  const max = Math.max(1, ...series.flatMap((s) => s.values.filter((v) => v != null)));
  const ticks = niceTicks(max);
  const top = ticks.at(-1);
  const x = (i) => pad.l + (categories.length <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (categories.length - 1));
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const every = Math.ceil(categories.length / 8);
  const onMove = (e) => {
    const box = ref.current.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(categories.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (categories.length - 1))));
    setTip({ i, x: (x(i) / W) * box.width, y: e.clientY - box.top, flip: x(i) > W * 0.6, title: labelX(categories[i]), rows: series.filter((s) => s.values[i] != null).map((s) => ({ name: s.name, color: s.color, dashed: s.dashed, value: format(s.values[i]) })) });
  };
  return (
    <div style={{ position: 'relative' }}>
      <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.name).join(', ')} onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />)}</g>
        {ticks.map((t) => <text key={t} x={pad.l - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>)}
        {categories.map((c, i) => (i % every === 0 ? <text key={c} x={x(i)} y={H - 8} textAnchor="middle">{labelX(c)}</text> : null))}
        {markX != null && categories.indexOf(markX) >= 0 && <line x1={x(categories.indexOf(markX))} x2={x(categories.indexOf(markX))} y1={pad.t} y2={H - pad.b} stroke="#0fa3b1" strokeWidth="1" />}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)]));
          const segs = [];
          let cur = [];
          for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }
          if (cur.length) segs.push(cur);
          return segs.map((seg, k) => <polyline key={`${s.name}${k}`} points={seg.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />);
        })}
        {tip && <line x1={x(tip.i)} x2={x(tip.i)} y1={pad.t} y2={H - pad.b} stroke="#7b8796" strokeWidth="1" />}
        {tip && series.map((s) => (s.values[tip.i] == null ? null : <circle key={s.name} cx={x(tip.i)} cy={y(s.values[tip.i])} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />))}
      </svg>
      <Tooltip tip={tip} />
      {series.length > 1 && <Legend series={series} />}
    </div>
  );
}

// Grouped or stacked columns: series: [{ name, color, values }].
export function BarChart({ categories, series, height = 220, format = fmtMoneyShort, stacked, labelX = (x) => x }) {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const W = 640, H = height, pad = { l: 52, r: 10, t: 10, b: 26 };
  const totals = categories.map((_, i) => (stacked ? series.reduce((a, s) => a + Math.max(0, s.values[i] || 0), 0) : Math.max(0, ...series.map((s) => s.values[i] || 0))));
  const ticks = niceTicks(Math.max(1, ...totals));
  const top = ticks.at(-1);
  const band = (W - pad.l - pad.r) / Math.max(1, categories.length);
  const groupW = Math.min(stacked ? 24 : 24 * series.length + 2 * (series.length - 1), band * 0.7);
  const barW = stacked ? groupW : (groupW - 2 * (series.length - 1)) / series.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const every = Math.ceil(categories.length / 10);
  const show = (e, i) => {
    const box = ref.current.getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, flip: e.clientX - box.left > box.width * 0.6, title: labelX(categories[i]), rows: series.map((s) => ({ name: s.name, color: s.color, value: format(s.values[i] || 0) })) });
  };
  return (
    <div style={{ position: 'relative' }}>
      <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.name).join(', ')} onPointerLeave={() => setTip(null)}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />)}</g>
        {ticks.map((t) => <text key={t} x={pad.l - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>)}
        {categories.map((c, i) => {
          const gx = pad.l + band * i + (band - groupW) / 2;
          let acc = 0;
          return (
            <g key={c} onPointerMove={(e) => show(e, i)}>
              <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
              {series.map((s, k) => {
                const v = Math.max(0, s.values[i] || 0);
                if (!v) return null;
                const yTop = y(acc + v);
                const h = y(acc) - yTop - (stacked && acc > 0 ? 2 : 0);
                const rx = stacked ? (k === series.length - 1 ? 3 : 0) : 3;
                const r = <path key={s.name} d={roundedTop(stacked ? gx : gx + k * (barW + 2), yTop, barW, Math.max(0, h), rx)} fill={s.color} />;
                if (stacked) acc += v;
                return r;
              })}
              {i % every === 0 && <text x={pad.l + band * i + band / 2} y={H - 8} textAnchor="middle">{labelX(c)}</text>}
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
      {series.length > 1 && <Legend series={series} box />}
    </div>
  );
}
const roundedTop = (x, y, w, h, r) => {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
};

export function Sparkline({ values, width = 120, height = 28, color = SERIES[0] }) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return null;
  const max = Math.max(...v), min = Math.min(...v);
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * (width - 4) + 2},${height - 2 - ((x - min) / (max - min || 1)) * (height - 4)}`).join(' ');
  return <svg width={width} height={height} aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// RSK-008: 5×5 likelihood × consequence heat map with counts.
const LEVEL_BG = { Low: '#dcefe2', Medium: '#fff1c2', High: '#ffd8bf', Extreme: '#f3b4b4' };
export function RiskHeat({ grid, matrix, onCell }) {
  const L = matrix?.likelihood?.map((x) => x.label) || ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
  const C = matrix?.consequence?.map((x) => x.label) || ['Insignificant', 'Minor', 'Moderate', 'Major', 'Severe'];
  const level = (l, c) => matrix?.grid?.[l][c] || 'Medium';
  return (
    <div>
      <div className="heat" style={{ gridTemplateColumns: '92px repeat(5, 1fr)' }}>
        {[4, 3, 2, 1, 0].map((l) => (
          <div key={l} style={{ display: 'contents' }}>
            <div className="axis-l">{L[l]}</div>
            {[0, 1, 2, 3, 4].map((c) => {
              const n = grid?.[l]?.[c] || 0;
              const lv = level(l, c);
              return (
                <button key={c} type="button" className="cell" title={`${L[l]} × ${C[c]}: ${lv}, ${n} risk${n === 1 ? '' : 's'}`} onClick={() => onCell?.(l + 1, c + 1)}
                  style={{ background: LEVEL_BG[lv], border: n ? '2px solid rgba(11,31,58,0.55)' : '1px solid transparent', cursor: onCell ? 'pointer' : 'default' }}>
                  {n || ''}
                </button>
              );
            })}
          </div>
        ))}
        <div />
        {C.map((c) => <div key={c} className="axis-b">{c}</div>)}
      </div>
      <div className="legend">{Object.entries(LEVEL_BG).map(([k, v]) => <span key={k}><i className="box" style={{ background: v }} />{k}</span>)}</div>
    </div>
  );
}

// STS-007: RAG history strip with the letter in each cell (colour is never the only cue).
export function RagStrip({ items, label = (x) => fmtDate(x.period_end), dimension = 'overall' }) {
  return (
    <div className="rag-strip" role="list">
      {items.map((x, i) => {
        const v = x[dimension];
        return <span key={i} role="listitem" title={`${label(x)}: ${v || 'not rated'}`} className={`rag sm ${v || 'none'}`} style={{ width: 22, height: 22 }}>{v ? v[0] : ''}</span>;
      })}
    </div>
  );
}

// Gantt for the work breakdown: bars on current dates, baseline underneath, milestones as diamonds.
export function Gantt({ items, milestones = [], today, onOpen, criticalOnly }) {
  const rows = criticalOnly ? items.filter((t) => t.critical || t.children) : items;
  const dates = [...items.flatMap((t) => [t.start_date, t.finish_date, t.baseline_start, t.baseline_finish]), ...milestones.flatMap((m) => [m.forecast_date || m.planned_date, m.baseline_date]), today].filter(Boolean).sort();
  if (!dates.length) return null;
  const start = addDays(dates[0], -3);
  const end = addDays(dates.at(-1), 7);
  const span = Math.max(1, diffDays(start, end));
  const pos = (d) => `${(diffDays(start, d) / span) * 100}%`;
  const width = (a, b) => `${Math.max(0.4, ((diffDays(a, b) + 1) / span) * 100)}%`;
  const months = [];
  for (let m = monthOf(start); m <= monthOf(end); m = addMonths(m, 1)) months.push(m);
  return (
    <div className="gantt">
      <div className="gantt-grid">
        <div className="gantt-row gantt-head">
          <div className="name">Work item</div>
          <div className="bars">{months.map((m) => <span key={m} className="month" style={{ left: pos(`${m}-01` < start ? start : `${m}-01`) }}>{monthLabel(m)}</span>)}</div>
        </div>
        {rows.map((t) => (
          <div key={t.id} className={`gantt-row ${t.children ? 'wp' : ''}`}>
            <div className="name" style={{ paddingLeft: 10 + (t.depth || 0) * 14 }} title={t.name}>
              <a href="#open" onClick={(e) => { e.preventDefault(); onOpen?.(t); }}>{t.wbs ? `${t.wbs} ` : ''}{t.name}</a>
            </div>
            <div className="bars">
              {today && <span className="today" style={{ left: pos(today) }} />}
              {t.baseline_start && t.baseline_finish && <span className="base" style={{ left: pos(t.baseline_start), width: width(t.baseline_start, t.baseline_finish) }} title={`Baseline ${fmtDate(t.baseline_start)} – ${fmtDate(t.baseline_finish)}`} />}
              {t.start_date && t.finish_date && (
                <span className={`bar ${t.children ? 'wp' : t.status === 'Done' ? 'done' : t.critical ? 'critical' : ''}`} style={{ left: pos(t.start_date), width: width(t.start_date, t.finish_date) }}
                  title={`${t.name}: ${fmtDate(t.start_date)} – ${fmtDate(t.finish_date)} · ${Math.round((t.percent_complete || 0) * 100)}%${t.critical ? ' · critical path' : ''}${t.float != null ? ` · float ${t.float} d` : ''}`}>
                  {!t.children && <span className="pct" style={{ width: `${Math.round((t.percent_complete || 0) * 100)}%` }} />}
                </span>
              )}
            </div>
          </div>
        ))}
        {milestones.map((m) => (
          <div key={m.id} className="gantt-row">
            <div className="name" title={m.name}><a href="#open" onClick={(e) => { e.preventDefault(); onOpen?.({ ...m, _milestone: true }); }}>◆ {m.name}</a></div>
            <div className="bars">
              {today && <span className="today" style={{ left: pos(today) }} />}
              {m.baseline_date && <span className="ms" style={{ left: pos(m.baseline_date), background: 'transparent', border: '2px solid #9aa6b4' }} title={`Baseline ${fmtDate(m.baseline_date)}`} />}
              <span className={`ms ${m.status === 'Achieved' ? 'Achieved' : ['Missed', 'Forecast late'].includes(m.status) ? 'late' : m.status === 'At risk' ? 'risk' : ''}`} style={{ left: pos(m.actual_date || m.forecast_date || m.planned_date) }} title={`${m.name}: ${m.status} · ${fmtDate(m.actual_date || m.forecast_date || m.planned_date)}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Monthly financial series from a position's months[] (cumulative or per month).
export function useFinSeries(months, { cumulative = true, costs = true, revenue = true } = {}) {
  return useMemo(() => {
    const cats = (months || []).map((m) => m.month);
    const acc = (key) => { let a = 0; return (months || []).map((m) => { a += m[key] || 0; return cumulative ? a : m[key] || 0; }); };
    const out = [];
    if (revenue) {
      out.push({ name: 'Budgeted fees', color: SERIES[0], values: acc('budgetRevenue') });
      const act = acc('actualRevenue');
      const fc = acc('forecastRevenue');
      const lastActual = (months || []).reduce((k, m, i) => (m.actualRevenue ? i : k), -1);
      out.push({ name: 'Fees earned', color: SERIES[1], values: act.map((v, i) => (i <= lastActual ? v : null)) });
      out.push({ name: 'Forecast fees', color: SERIES[1], dashed: true, values: act.map((v, i) => (i >= lastActual ? v + (fc[i] - (fc[lastActual] || 0)) : null)) });
    }
    if (costs) {
      out.push({ name: 'Budget cost', color: SERIES[3], values: acc('budgetCost') });
      const lastActual = (months || []).reduce((k, m, i) => (m.actualCost ? i : k), -1);
      const act = acc('actualCost');
      const fc = acc('forecastCost');
      out.push({ name: 'Actual cost', color: SERIES[2], values: act.map((v, i) => (i <= lastActual ? v : null)) });
      out.push({ name: 'Forecast cost', color: SERIES[2], dashed: true, values: act.map((v, i) => (i >= lastActual ? v + (fc[i] - (fc[lastActual] || 0)) : null)) });
    }
    return { categories: cats, series: out };
  }, [months, cumulative, costs, revenue]);
}
