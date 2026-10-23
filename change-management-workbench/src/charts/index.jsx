// Charts (STK-041, IMP-008, ADK-010, RPT-001). Thin marks, rounded data ends anchored to the baseline,
// 2px surface gaps, recessive hairline grids, a legend for two or more series, selective direct
// labels and a hover/focus tooltip on every mark. Every chart has a table equivalent on its screen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ADKAR, adkarLabel } from '../../shared/refdata.js';
import { compact, fmtDate, fmtNum } from '../lib/format.js';
import { addDays, diffDays } from '../../shared/dates.js';

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];
export const SEQ = ['var(--seq-0)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)', 'var(--seq-6)', 'var(--seq-7)'];

// Sequential fill for an impact degree 0–5, and ink that stays legible inside it.
export const impactFill = (d) => (d == null ? 'var(--surface-2)' : SEQ[Math.min(7, Math.round(Number(d)) + 1)]);
export const impactInk = (d) => (d != null && Number(d) >= 3 ? '#ffffff' : 'var(--ink)');
// Diverging fill for ADKAR scores (1–5) around the barrier threshold (3 = neutral midpoint).
export function adkarFill(v, threshold = 3) {
  if (v == null) return 'var(--surface-2)';
  const d = Number(v) - threshold;
  if (d <= -1.5) return 'var(--div-neg-3)';
  if (d <= -0.75) return 'var(--div-neg-2)';
  if (d <= 0) return 'var(--div-neg-1)';
  if (d < 0.75) return 'var(--div-mid)';
  if (d < 1.5) return 'var(--div-pos-1)';
  if (d < 2) return 'var(--div-pos-2)';
  return 'var(--div-pos-3)';
}
export const adkarInk = (v, threshold = 3) => (v != null && (Number(v) - threshold <= -1.5 || Number(v) - threshold >= 2) ? '#ffffff' : 'var(--ink)');

// Axis maximum: the data maximum rounded up to a multiple of a 1-2-2.5-5 step (about four steps).
function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
function niceMax(v) {
  if (!v || v <= 0) return 1;
  const step = v >= 4 ? Math.max(1, niceStep(v / 4)) : niceStep(v / 4);
  return Math.ceil(v / step - 1e-9) * step;
}
// Ticks at the smallest nice step that divides the axis exactly into at most six intervals.
const ticks = (max) => {
  if (!(max > 0)) return [0];
  const p = 10 ** Math.floor(Math.log10(max / 6));
  for (const k of [1, 2, 2.5, 5, 10, 20, 25, 50]) {
    const step = k * p;
    if (Number.isInteger(max) && max >= 2 && !Number.isInteger(+step.toFixed(6))) continue;
    const n = max / step;
    if (n <= 6 + 1e-9 && Math.abs(n - Math.round(n)) < 1e-6) return Array.from({ length: Math.round(n) + 1 }, (_, i) => +(i * step).toFixed(6));
  }
  return [0, max / 2, max];
};

function useTip(initialWidth = 640) {
  const [tip, setTip] = useState(null);
  const [width, setWidth] = useState(initialWidth);
  const box = useRef(null);
  const [el, setEl] = useState(null);
  const ref = useCallback((node) => { box.current = node; setEl(node); }, []);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      if (w > 0) setWidth(Math.max(280, w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  const show = (e, content) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const t = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX ?? t.left + t.width / 2) - rect.left;
    const y = (e.clientY ? Math.min(e.clientY, t.top + 4) : t.top) - rect.top;
    setTip({ x: Math.max(70, Math.min(rect.width - 70, x)), y: Math.max(10, y), content });
  };
  const hide = () => setTip(null);
  const node = tip ? <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">{tip.content}</div> : null;
  return { ref, show, hide, node, width };
}

const TipRow = ({ color, label, value }) => (
  <div className="tip-row">{color && <span className="key" style={{ background: color }} />}<strong>{value}</strong><span className="muted">{label}</span></div>
);

export function Legend({ items, line = false }) {
  if (!items || items.length < 2) return null;
  return (
    <div className="legend" aria-hidden="true">
      {items.map((it) => <span key={it.label}><i className={line ? 'line' : ''} style={{ background: it.color }} />{it.label}</span>)}
    </div>
  );
}

// Rounded data end, square at the baseline (horizontal bars grow to the right).
function hbarPath(x, y, w, h, r = 4) {
  if (w <= 0) return '';
  const rr = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}
function vbarPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// Horizontal bars for one measure across categories.
export function BarChart({ data = [], max, unit = '', color = 'var(--series-1)', format = (v) => fmtNum(v, 1), labelWidth = 170, onSelect, colorOf, ariaLabel, threshold }) {
  const tip = useTip();
  const width = tip.width;
  const barH = 18, gap = 12;
  const top = threshold != null ? 22 : 6;
  const height = top + data.length * (barH + gap) + 18;
  const m = max ?? niceMax(Math.max(...data.map((d) => Number(d.value) || 0), threshold || 0));
  const plotW = width - labelWidth - 56;
  const x = (v) => (Number(v) / m) * plotW;
  return (
    <div className="chart" ref={tip.ref}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel || 'Bar chart'}>
        {ticks(m).map((t) => <line key={t} className="gridline" x1={labelWidth + x(t)} x2={labelWidth + x(t)} y1={0} y2={height - 16} />)}
        {ticks(m).map((t) => <text key={`t${t}`} x={labelWidth + x(t)} y={height - 3} textAnchor="middle">{compact(t)}{unit}</text>)}
        {threshold != null && <g><line x1={labelWidth + x(threshold)} x2={labelWidth + x(threshold)} y1={14} y2={height - 16} stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="4 3" /><text x={labelWidth + x(threshold)} y={11} textAnchor={x(threshold) > plotW - 60 ? 'end' : 'middle'} className="label-2">Target {threshold}{unit}</text></g>}
        {data.map((d, i) => {
          const y = top + i * (barH + gap);
          const w = Math.max(0, x(d.value || 0));
          const fill = colorOf ? colorOf(d) : color;
          return (
            <g key={d.key || d.label} tabIndex={0} role="button" aria-label={`${d.label}: ${format(d.value)}${unit}`}
              onMouseMove={(e) => tip.show(e, <><div className="tip-title">{d.label}</div><TipRow color={fill} value={`${format(d.value)}${unit}`} label={d.sub || ''} /></>)}
              onMouseLeave={tip.hide} onFocus={(e) => tip.show(e, <><div className="tip-title">{d.label}</div><TipRow color={fill} value={`${format(d.value)}${unit}`} label={d.sub || ''} /></>)} onBlur={tip.hide}
              onClick={() => onSelect?.(d)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              <rect x={0} y={y - gap / 2} width={width} height={barH + gap} fill="transparent" />
              <text x={labelWidth - 8} y={y + barH / 2 + 4} textAnchor="end" className="label-2">{d.label.length > Math.round(labelWidth / 6.4) ? `${d.label.slice(0, Math.round(labelWidth / 6.4) - 1)}…` : d.label}</text>
              <path d={hbarPath(labelWidth, y, w, barH)} fill={fill} />
              {d.value != null && <text x={labelWidth + w + 6} y={y + barH / 2 + 4} className="label-strong">{format(d.value)}{unit}</text>}
            </g>
          );
        })}
      </svg>
      {tip.node}
    </div>
  );
}

// Horizontal stacked bars (part-to-whole by row), with 2px surface gaps between segments.
export function StackedBars({ rows = [], series = [], labelWidth = 170, ariaLabel, total: showTotal = true, onSelect }) {
  const tip = useTip();
  const width = tip.width, barH = 18, gap = 12, top = 6;
  const height = top + rows.length * (barH + gap) + 18;
  const totals = rows.map((r) => series.reduce((a, s) => a + (Number(r.values[s.key]) || 0), 0));
  const m = niceMax(Math.max(...totals, 1));
  const plotW = width - labelWidth - 48;
  const sx = (v) => (v / m) * plotW;
  return (
    <div className="chart" ref={tip.ref}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel || 'Stacked bar chart'}>
        {ticks(m).map((t) => <line key={t} className="gridline" x1={labelWidth + sx(t)} x2={labelWidth + sx(t)} y1={0} y2={height - 16} />)}
        {ticks(m).map((t) => <text key={`t${t}`} x={labelWidth + sx(t)} y={height - 3} textAnchor="middle">{compact(t)}</text>)}
        {rows.map((r, i) => {
          const y = top + i * (barH + gap);
          let acc = 0;
          const segs = series.map((s) => ({ s, v: Number(r.values[s.key]) || 0 })).filter((x) => x.v > 0);
          return (
            <g key={r.key || r.label}>
              <text x={labelWidth - 8} y={y + barH / 2 + 4} textAnchor="end" className="label-2">{r.label.length > 26 ? `${r.label.slice(0, 25)}…` : r.label}</text>
              {segs.map(({ s, v }, j) => {
                const x0 = labelWidth + sx(acc);
                const w = Math.max(0, sx(v) - (j < segs.length - 1 ? 2 : 0));
                acc += v;
                const last = j === segs.length - 1;
                const content = <><div className="tip-title">{r.label}</div><TipRow color={s.color} value={fmtNum(v)} label={s.label} /></>;
                return (
                  <g key={s.key} tabIndex={0} role="button" aria-label={`${r.label}, ${s.label}: ${v}`} onMouseMove={(e) => tip.show(e, content)} onMouseLeave={tip.hide} onFocus={(e) => tip.show(e, content)} onBlur={tip.hide} onClick={() => onSelect?.(r, s)}>
                    {last ? <path d={hbarPath(x0, y, w, barH)} fill={s.color} /> : <rect x={x0} y={y} width={w} height={barH} fill={s.color} />}
                  </g>
                );
              })}
              {showTotal && <text x={labelWidth + sx(totals[i]) + 6} y={y + barH / 2 + 4} className="label-strong">{fmtNum(totals[i])}</text>}
            </g>
          );
        })}
      </svg>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      {tip.node}
    </div>
  );
}

// Grouped columns by period (for example planned and completed engagements per month).
export function ColumnChart({ periods = [], series = [], height = 220, ariaLabel, format = (v) => fmtNum(v) }) {
  const tip = useTip();
  const width = tip.width, left = 34, bottom = 24, top = 10;
  const max = niceMax(Math.max(1, ...periods.flatMap((p) => series.map((s) => Number(p.values[s.key]) || 0))));
  const plotH = height - bottom - top;
  const band = (width - left) / Math.max(1, periods.length);
  const barW = Math.min(24, (band - 10) / Math.max(1, series.length) - 2);
  const y = (v) => top + plotH - (v / max) * plotH;
  return (
    <div className="chart" ref={tip.ref}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel || 'Column chart'}>
        {ticks(max).map((t) => <g key={t}><line className="gridline" x1={left} x2={width} y1={y(t)} y2={y(t)} /><text x={left - 6} y={y(t) + 4} textAnchor="end">{compact(t)}</text></g>)}
        {periods.map((p, i) => {
          const cx = left + i * band + band / 2;
          const groupW = series.length * (barW + 2) - 2;
          const content = <><div className="tip-title">{p.label}</div>{series.map((s) => <TipRow key={s.key} color={s.color} value={format(p.values[s.key] || 0)} label={s.label} />)}</>;
          return (
            <g key={p.key} tabIndex={0} role="button" aria-label={`${p.label}: ${series.map((s) => `${s.label} ${p.values[s.key] || 0}`).join(', ')}`} onMouseMove={(e) => tip.show(e, content)} onMouseLeave={tip.hide} onFocus={(e) => tip.show(e, content)} onBlur={tip.hide}>
              <rect x={cx - band / 2} y={top} width={band} height={plotH} fill="transparent" />
              {series.map((s, j) => {
                const v = Number(p.values[s.key]) || 0;
                const x0 = cx - groupW / 2 + j * (barW + 2);
                return <path key={s.key} d={vbarPath(x0, y(v), barW, top + plotH - y(v))} fill={s.color} />;
              })}
              <text x={cx} y={height - 6} textAnchor="middle">{p.label}</text>
            </g>
          );
        })}
        <line x1={left} x2={width} y1={top + plotH} y2={top + plotH} stroke="var(--axis)" />
      </svg>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      {tip.node}
    </div>
  );
}

// Lines over dates with a crosshair that snaps to the nearest date and lists every series.
export function LineChart({ series = [], yMin = 0, yMax, height = 230, unit = '', threshold, thresholdLabel, ariaLabel, format = (v) => fmtNum(v, 2), dateFormat = (d) => fmtDate(d, { short: true }) }) {
  const tip = useTip();
  const [hover, setHover] = useState(null);
  const width = tip.width, left = 38, right = 96, top = 12, bottom = 24;
  const dates = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort(), [series]);
  if (!dates.length) return <div className="muted small">No data yet.</div>;
  const minD = dates[0], maxD = dates[dates.length - 1];
  const span = Math.max(1, diffDays(minD, maxD));
  const vals = series.flatMap((s) => s.points.map((p) => Number(p.value))).filter((v) => Number.isFinite(v));
  const top0 = yMax ?? niceMax(Math.max(...vals, threshold ?? 0));
  const plotW = width - left - right, plotH = height - top - bottom;
  const x = (d) => left + (dates.length === 1 ? plotW / 2 : (diffDays(minD, d) / span) * plotW);
  const y = (v) => top + plotH - ((Number(v) - yMin) / (top0 - yMin)) * plotH;
  const tks = ticks(top0 - yMin).map((t) => t + yMin);
  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * width;
    let best = dates[0];
    for (const d of dates) if (Math.abs(x(d) - px) < Math.abs(x(best) - px)) best = d;
    setHover(best);
    tip.show(e, <><div className="tip-title">{fmtDate(best)}</div>{series.map((s) => { const p = s.points.find((q) => q.date === best); return p ? <TipRow key={s.key} color={s.color} value={`${format(p.value)}${unit}`} label={s.label} /> : null; })}</>);
  };
  // Direct end labels only where they do not collide (otherwise the legend and tooltip carry them).
  const endY = series.map((s) => {
    const pts = s.points.filter((p) => Number.isFinite(Number(p.value))).sort((a, b) => a.date.localeCompare(b.date));
    return pts.length ? { key: s.key, y: y(pts[pts.length - 1].value) } : null;
  }).filter(Boolean).sort((a, b) => a.y - b.y);
  const labelled = new Set();
  if (series.length <= 4) {
    for (let k = 0; k < endY.length; k++) {
      const tooClose = (k > 0 && endY[k].y - endY[k - 1].y < 13) || (k < endY.length - 1 && endY[k + 1].y - endY[k].y < 13);
      if (!tooClose) labelled.add(endY[k].key);
    }
  }
  return (
    <div className="chart" ref={tip.ref}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel || 'Line chart'} onMouseMove={onMove} onMouseLeave={() => { setHover(null); tip.hide(); }}>
        {tks.map((t) => <g key={t}><line className="gridline" x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} /><text x={left - 6} y={y(t) + 4} textAnchor="end">{compact(t)}</text></g>)}
        {dates.length > 1 && [minD, maxD].map((d) => <text key={d} x={x(d)} y={height - 6} textAnchor="middle">{dateFormat(d)}</text>)}
        {dates.length === 1 && <text x={x(minD)} y={height - 6} textAnchor="middle">{dateFormat(minD)}</text>}
        {threshold != null && <g><line x1={left} x2={left + plotW} y1={y(threshold)} y2={y(threshold)} stroke="var(--ink-3)" strokeWidth="1.5" /><text x={left + plotW + 6} y={y(threshold) + 4} className="label-2">{thresholdLabel || `Threshold ${threshold}`}</text></g>}
        {hover && <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + plotH} stroke="var(--axis)" />}
        {series.map((s) => {
          const pts = s.points.filter((p) => Number.isFinite(Number(p.value))).sort((a, b) => a.date.localeCompare(b.date));
          if (!pts.length) return null;
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date)},${y(p.value)}`).join(' ');
          const last = pts[pts.length - 1];
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={hover === p.date ? 5 : 3.2} fill={s.color} stroke="var(--chart-surface)" strokeWidth="2" />)}
              {labelled.has(s.key) && <text x={x(last.date) + 8} y={y(last.value) + 4} className="label-strong">{format(last.value)}{unit}</text>}
            </g>
          );
        })}
        <line x1={left} x2={left + plotW} y1={top + plotH} y2={top + plotH} stroke="var(--axis)" />
      </svg>
      <Legend line items={series.map((s) => ({ label: s.label, color: s.color }))} />
      {tip.node}
    </div>
  );
}

export function Sparkline({ values = [], width = 90, height = 24, color = 'var(--series-1)', label }) {
  const v = values.filter((x) => Number.isFinite(Number(x))).map(Number);
  if (v.length < 2) return null;
  const min = Math.min(...v), max = Math.max(...v);
  const y = (n) => height - 3 - ((n - min) / (max - min || 1)) * (height - 6);
  const d = v.map((n, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1)) * (width - 4) + 2},${y(n)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label || 'Trend'}>
      <path d={d} fill="none" stroke="var(--series-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width - 2} cy={y(v[v.length - 1])} r="3" fill={color} />
    </svg>
  );
}

// ADKAR profile for one result: five columns against the barrier threshold; the barrier point is
// flagged with its label (status colour is never the only cue).
export function AdkarProfile({ scores = {}, barrier, threshold = 3, height = 170, compare, compareLabel = 'Previous', currentLabel = 'Current' }) {
  const tip = useTip(360);
  const width = tip.width, left = 26, bottom = 22, top = 10;
  const plotH = height - top - bottom;
  const band = (width - left) / 5;
  const barW = Math.min(compare ? 16 : 24, band / 3);
  const y = (v) => top + plotH - ((Number(v) - 0) / 5) * plotH;
  return (
    <div className="chart" ref={tip.ref}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`ADKAR profile: ${ADKAR.map((a) => `${a.label} ${scores[a.id] ?? 'not rated'}`).join(', ')}${barrier && barrier !== 'none' ? `; barrier point ${adkarLabel(barrier)}` : ''}`}>
        {[1, 2, 3, 4, 5].map((t) => <g key={t}><line className="gridline" x1={left} x2={width} y1={y(t)} y2={y(t)} /><text x={left - 6} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
        <line x1={left} x2={width} y1={y(threshold)} y2={y(threshold)} stroke="var(--ink-3)" strokeWidth="1.5" />
        {ADKAR.map((a, i) => {
          const cx = left + i * band + band / 2;
          const v = scores[a.id];
          const isBarrier = barrier === a.id;
          const fill = isBarrier ? 'var(--st-critical)' : 'var(--series-1)';
          const prev = compare?.[a.id];
          const content = <><div className="tip-title">{a.label}{isBarrier ? ' · barrier point' : ''}</div><TipRow color={fill} value={v ?? '—'} label={currentLabel} />{compare && <TipRow color="var(--series-muted)" value={prev ?? '—'} label={compareLabel} />}</>;
          return (
            <g key={a.id} tabIndex={0} role="button" aria-label={`${a.label} ${v ?? 'not rated'}${isBarrier ? ', barrier point' : ''}`} onMouseMove={(e) => tip.show(e, content)} onMouseLeave={tip.hide} onFocus={(e) => tip.show(e, content)} onBlur={tip.hide}>
              <rect x={cx - band / 2} y={top} width={band} height={plotH} fill="transparent" />
              {compare && prev != null && <path d={vbarPath(cx - barW - 1, y(prev), barW, top + plotH - y(prev))} fill="var(--series-muted)" />}
              {v != null && <path d={vbarPath(compare ? cx + 1 : cx - barW / 2, y(v), barW, top + plotH - y(v))} fill={fill} />}
              {v != null && <text x={compare ? cx + 1 + barW / 2 : cx} y={y(v) - 4} textAnchor="middle" className="label-strong">{Number(v).toFixed(1)}</text>}
              <text x={cx} y={height - 6} textAnchor="middle" className={isBarrier ? 'label-strong' : ''}>{a.code}</text>
            </g>
          );
        })}
        <line x1={left} x2={width} y1={top + plotH} y2={top + plotH} stroke="var(--axis)" />
      </svg>
      {compare && <Legend items={[{ label: compareLabel, color: 'var(--series-muted)' }, { label: currentLabel, color: 'var(--series-1)' }]} />}
      {tip.node}
    </div>
  );
}

// Table heatmap: rows × columns with a colour function and the value printed in each cell.
export function Heatmap({ rows = [], cols = [], value, fill, ink, format = (v) => v, rowHeader = 'Group', onCell, caption, cellTitle }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="heat">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead><tr><th scope="col">{rowHeader}</th>{cols.map((c) => <th key={c.key} scope="col" className="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              {cols.map((c) => {
                const v = value(r, c);
                const empty = v == null || v === '';
                return (
                  <td key={c.key} className={`cell ${empty ? 'empty' : ''}`} style={empty ? undefined : { background: fill(v, r, c), color: ink ? ink(v, r, c) : 'var(--ink)' }}
                    title={cellTitle ? cellTitle(r, c, v) : `${r.label} · ${c.label}: ${empty ? 'not assessed' : format(v)}`} tabIndex={onCell ? 0 : undefined}
                    onClick={onCell ? () => onCell(r, c, v) : undefined} onKeyDown={onCell ? (e) => { if (e.key === "Enter") onCell(r, c, v); } : undefined}>
                    {empty ? '–' : format(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HeatScale({ steps, labels }) {
  return (
    <span className="heat-scale" aria-hidden="true">
      <span>{labels[0]}</span>{steps.map((s, i) => <i key={i} style={{ background: s }} />)}<span>{labels[1]}</span>
    </span>
  );
}

const LEVELS = ['low', 'medium', 'high'];
// Power/interest grid (RUL-04): each dot is a stakeholder; priority stakeholders are emphasised.
export function PowerInterestGrid({ profiles = [], onSelect }) {
  const tip = useTip();
  const cells = {};
  for (const p of profiles) {
    if (!p.influence || !p.interest) continue;
    const k = `${p.influence}:${p.interest}`;
    (cells[k] ||= []).push(p);
  }
  const pos = (p) => {
    const list = cells[`${p.influence}:${p.interest}`];
    const i = list.indexOf(p);
    const n = list.length;
    const cols = Math.ceil(Math.sqrt(n));
    const cx = (LEVELS.indexOf(p.interest) + 0.5) / 3;
    const cy = 1 - (LEVELS.indexOf(p.influence) + 0.5) / 3;
    const step = 0.26 / Math.max(1, cols);
    const ox = ((i % cols) - (cols - 1) / 2) * step;
    const oy = (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * step * 1.3;
    return { left: `${(cx + ox) * 100}%`, top: `${(cy + oy) * 100}%` };
  };
  return (
    <div>
      <div className="chart" ref={tip.ref}>
        <div className="quad" role="group" aria-label="Power and interest grid">
          <div className="q"><h4>Keep satisfied</h4></div>
          <div className="q"><h4>Manage closely</h4></div>
          <div className="q"><h4>Monitor</h4></div>
          <div className="q"><h4>Keep informed</h4></div>
          {profiles.filter((p) => p.influence && p.interest).map((p) => {
            const color = p.isPriority ? 'var(--series-2)' : 'var(--series-1)';
            const content = <><div className="tip-title">{p.name}</div><div className="small">{p.positionTitle || p.organisation}</div><div className="small">Influence {p.influence} · interest {p.interest}{p.priority != null ? ` · priority ${p.priority}` : ''}</div></>;
            return (
              <button key={p.id} type="button" className="dot-person" style={{ ...pos(p), background: color }} aria-label={`${p.name}: influence ${p.influence}, interest ${p.interest}${p.isPriority ? ', priority' : ''}`}
                onMouseMove={(e) => tip.show(e, content)} onMouseLeave={tip.hide} onFocus={(e) => tip.show(e, content)} onBlur={tip.hide} onClick={() => onSelect?.(p)}>
                {p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}
              </button>
            );
          })}
        </div>
        {tip.node}
      </div>
      <div className="quad-axis"><span>Interest: low</span><span>medium</span><span>high →</span></div>
      <div className="legend"><span><i style={{ background: 'var(--series-2)' }} />Priority stakeholder</span><span><i style={{ background: 'var(--series-1)' }} />Other stakeholder</span><span className="muted">Vertical axis: influence (low at the bottom, high at the top)</span></div>
    </div>
  );
}

const ENG_LEVELS = ['unaware', 'resistant', 'neutral', 'supportive', 'leading'];
const ENG_LABEL = { unaware: 'Unaware', resistant: 'Resistant', neutral: 'Neutral', supportive: 'Supportive', leading: 'Leading' };
// Engagement gap (dumbbell): current versus desired engagement for each stakeholder (RUL-05).
export function GapChart({ profiles = [], onSelect, labelWidth = 170 }) {
  const tip = useTip();
  const rows = profiles.filter((p) => p.currentEngagement && p.desiredEngagement);
  const width = tip.width, rowH = 24, top = 22;
  const height = top + rows.length * rowH + 6;
  const plotW = width - labelWidth - 30;
  const x = (lvl) => labelWidth + (ENG_LEVELS.indexOf(lvl) / (ENG_LEVELS.length - 1)) * plotW;
  if (!rows.length) return <div className="muted small">No engagement levels recorded.</div>;
  return (
    <div className="chart" ref={tip.ref}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Engagement gap chart">
        {ENG_LEVELS.map((l) => <g key={l}><line className="gridline" x1={x(l)} x2={x(l)} y1={top - 4} y2={height} /><text x={x(l)} y={12} textAnchor="middle">{ENG_LABEL[l]}</text></g>)}
        {rows.map((p, i) => {
          const y = top + i * rowH + rowH / 2;
          const c = x(p.currentEngagement), d = x(p.desiredEngagement);
          const content = <><div className="tip-title">{p.name}</div><TipRow color="var(--seq-2)" value={ENG_LABEL[p.currentEngagement]} label="current" /><TipRow color="var(--seq-6)" value={ENG_LABEL[p.desiredEngagement]} label="desired" /><div className="small">Gap {p.gap ?? 0}{p.priorityFlag ? ' · priority' : ''}</div></>;
          return (
            <g key={p.id} tabIndex={0} role="button" aria-label={`${p.name}: current ${p.currentEngagement}, desired ${p.desiredEngagement}`} onMouseMove={(e) => tip.show(e, content)} onMouseLeave={tip.hide} onFocus={(e) => tip.show(e, content)} onBlur={tip.hide} onClick={() => onSelect?.(p)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              <rect x={0} y={y - rowH / 2} width={width} height={rowH} fill="transparent" />
              <text x={labelWidth - 10} y={y + 4} textAnchor="end" className={p.priorityFlag ? 'label-strong' : 'label-2'}>{p.name.length > 24 ? `${p.name.slice(0, 23)}…` : p.name}</text>
              <line x1={c} x2={d} y1={y} y2={y} stroke="var(--seq-3)" strokeWidth="2" />
              <circle cx={c} cy={y} r="5" fill="var(--seq-2)" stroke="var(--chart-surface)" strokeWidth="2" />
              <circle cx={d} cy={y} r="5" fill="var(--seq-6)" stroke="var(--chart-surface)" strokeWidth="2" />
            </g>
          );
        })}
      </svg>
      <Legend items={[{ label: 'Current engagement', color: 'var(--seq-2)' }, { label: 'Desired engagement', color: 'var(--seq-6)' }]} />
      {tip.node}
    </div>
  );
}

// Influence network (STK-042): a deterministic force layout of stakeholders and their relationships.
export function NetworkGraph({ nodes = [], edges = [], onSelect, height = 460 }) {
  const tip = useTip(760);
  const width = tip.width;
  const layout = useMemo(() => {
    const n = nodes.length;
    const pos = nodes.map((nd, i) => ({ id: nd.id, x: width / 2 + Math.cos((i / n) * 2 * Math.PI) * (width / 3), y: height / 2 + Math.sin((i / n) * 2 * Math.PI) * (height / 3), vx: 0, vy: 0 }));
    const idx = Object.fromEntries(pos.map((p, i) => [p.id, i]));
    const links = edges.filter((e) => idx[e.from] != null && idx[e.to] != null);
    for (let it = 0; it < 260; it++) {
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = pos[i], b = pos[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        const d2 = Math.max(80, dx * dx + dy * dy);
        const f = 2600 / d2;
        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      for (const l of links) {
        const a = pos[idx[l.from]], b = pos[idx[l.to]];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - 90) * 0.02;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      for (const p of pos) {
        p.vx += (width / 2 - p.x) * 0.004; p.vy += (height / 2 - p.y) * 0.004;
        p.x = Math.max(30, Math.min(width - 30, p.x + p.vx * 0.5)); p.y = Math.max(24, Math.min(height - 24, p.y + p.vy * 0.5));
        p.vx *= 0.6; p.vy *= 0.6;
      }
    }
    return { pos, idx, links };
  }, [nodes, edges, height, width]);
  const deg = {};
  for (const l of layout.links) { deg[l.from] = (deg[l.from] || 0) + 1; deg[l.to] = (deg[l.to] || 0) + 1; }
  const groups = [...new Set(nodes.map((n) => n.group))];
  return (
    <div className="chart" ref={tip.ref}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Influence network">
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="14" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--line-strong)" /></marker></defs>
        {layout.links.map((l, i) => {
          const a = layout.pos[layout.idx[l.from]], b = layout.pos[layout.idx[l.to]];
          return <line key={i} className="net-edge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={l.strength === 'strong' ? 2.4 : l.strength === 'weak' ? 1 : 1.6} markerEnd={l.directed ? 'url(#arrow)' : undefined}><title>{l.label}</title></line>;
        })}
        {nodes.map((nd) => {
          const p = layout.pos[layout.idx[nd.id]];
          const r = 6 + Math.min(10, (deg[nd.id] || 0) * 1.6);
          const color = SERIES[Math.max(0, groups.indexOf(nd.group)) % 8];
          const content = <><div className="tip-title">{nd.label}</div><div className="small">{nd.sub}</div><div className="small">{deg[nd.id] || 0} relationship(s)</div></>;
          return (
            <g key={nd.id} className="net-node" transform={`translate(${p.x},${p.y})`} tabIndex={0} role="button" aria-label={`${nd.label}, ${deg[nd.id] || 0} relationships`}
              onMouseMove={(e) => tip.show(e, content)} onMouseLeave={tip.hide} onFocus={(e) => tip.show(e, content)} onBlur={tip.hide} onClick={() => onSelect?.(nd)}>
              <circle r={r} fill={color} />
              <text y={r + 12} textAnchor="middle">{nd.label.split(' ')[0]} {nd.label.split(' ').slice(-1)[0][0]}.</text>
            </g>
          );
        })}
      </svg>
      <Legend items={groups.map((g, i) => ({ label: g, color: SERIES[i % 8] }))} />
      {tip.node}
    </div>
  );
}

// Gantt view of plan activities by plan, with milestones and today.
export function Gantt({ groups = [], milestones = [], today, onSelect }) {
  const tip = useTip();
  const items = groups.flatMap((g) => g.items);
  const dates = [...items.flatMap((i) => [i.start, i.end]), ...milestones.map((m) => m.date), today].filter(Boolean).sort();
  if (!items.length) return <div className="muted small" style={{ padding: 12 }}>No dated activities.</div>;
  const start = `${dates[0].slice(0, 7)}-01`;
  const endD = addDays(`${dates[dates.length - 1].slice(0, 7)}-01`, 32);
  const span = Math.max(30, diffDays(start, endD));
  const pct = (d) => `${(diffDays(start, d) / span) * 100}%`;
  const months = [];
  for (let d = start; d < endD;) { months.push(d); const [y, m] = d.split('-').map(Number); d = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`; }
  return (
    <div className="gantt" ref={tip.ref} style={{ position: 'relative' }}>
      <div className="gantt-inner">
        <div className="gantt-head"><div className="g-label" style={{ fontWeight: 600 }}>Activity</div><div className="g-months">{months.map((m) => <span key={m} style={{ left: pct(m) }}>{new Date(`${m}T00:00:00Z`).toLocaleDateString('en-AU', { month: 'short', year: '2-digit', timeZone: 'UTC' })}</span>)}</div></div>
        {groups.map((g) => (
          <div key={g.key}>
            <div className="gantt-row group-row"><div className="g-label">{g.label} <span className="muted small">({g.items.length})</span></div><div className="g-track" /></div>
            {g.items.map((it) => {
              const s = it.start || it.end, e = it.end || it.start;
              const content = <><div className="tip-title">{it.label}</div><div className="small">{fmtDate(s)} – {fmtDate(e)}</div><div className="small">{it.statusLabel}{it.pct != null ? ` · ${it.pct}%` : ''}</div></>;
              return (
                <div className="gantt-row" key={it.id}>
                  <div className="g-label" title={it.label}>{it.label}</div>
                  <div className="g-track">
                    {s && (
                      <button type="button" className={`gantt-bar ${it.state || ''}`} style={{ left: pct(s), width: `max(6px, ${(Math.max(1, diffDays(s, e) + 1) / span) * 100}%)`, border: 0, padding: 0 }}
                        aria-label={`${it.label}: ${fmtDate(s)} to ${fmtDate(e)}, ${it.statusLabel}`} onMouseMove={(ev) => tip.show(ev, content)} onMouseLeave={tip.hide} onFocus={(ev) => tip.show(ev, content)} onBlur={tip.hide} onClick={() => onSelect?.(it)}>
                        {it.pct > 0 && it.pct < 100 && <span className="prog" style={{ width: `${it.pct}%` }} />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 300, right: 0, pointerEvents: 'none' }}>
          {milestones.filter((m) => m.date >= start && m.date <= endD).map((m) => <div key={m.id} className="gantt-ms" style={{ left: pct(m.date) }}><span>{m.name}</span></div>)}
          {today >= start && today <= endD && <div className="gantt-today" style={{ left: pct(today) }} title="Today" />}
        </div>
      </div>
      <div className="legend" style={{ padding: '6px 10px' }}><span><i style={{ background: 'var(--series-1)' }} />Planned or in progress</span><span><i style={{ background: 'var(--st-good)' }} />Complete</span><span><i style={{ background: 'var(--st-critical)' }} />Overdue</span><span><i style={{ background: 'var(--brand-gold)' }} />Milestone</span><span><i style={{ background: 'var(--brand-teal)' }} />Today</span></div>
      {tip.node}
    </div>
  );
}

// Month calendar of events (engagements, communications, milestones).
export function MonthCalendar({ month, events = [], today, onSelect, blackout }) {
  const first = `${month}-01`;
  const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const startD = addDays(first, -dow);
  const days = Array.from({ length: 42 }, (_, i) => addDays(startD, i));
  const byDay = {};
  for (const e of events) (byDay[e.date] ||= []).push(e);
  return (
    <div className="cal" role="grid" aria-label={`Calendar for ${new Date(`${first}T00:00:00Z`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`}>
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-head" role="columnheader">{d}</div>)}
      {days.map((d) => {
        const evs = byDay[d] || [];
        const other = d.slice(0, 7) !== month;
        return (
          <div key={d} role="gridcell" className={`cal-day ${other ? 'other' : ''} ${d === today ? 'today' : ''} ${blackout?.(d) ? 'blackout' : ''}`} aria-label={`${fmtDate(d)}: ${evs.length} item(s)`}>
            <div className="cal-num">{Number(d.slice(8))}</div>
            {evs.slice(0, 5).map((e) => <button key={e.id} type="button" className={`cal-ev ${e.cls || ''}`} title={`${e.time ? `${e.time} ` : ''}${e.label}`} onClick={() => onSelect?.(e)}>{e.time && <b>{e.time} </b>}{e.label}</button>)}
            {evs.length > 5 && <div className="tiny muted">+{evs.length - 5} more</div>}
          </div>
        );
      })}
    </div>
  );
}

// PCT Model triangle: three corners scored 0–100 with success at the centre (RSK-004).
export function PctTriangle({ aspects = {}, labels = {}, overall }) {
  const status = (v) => (v == null ? 'na' : v >= 75 ? 'good' : v >= 50 ? 'warning' : 'critical');
  const pts = { top: [180, 22], left: [28, 228], right: [332, 228] };
  const keys = Object.keys(labels);
  const corner = [pts.top, pts.left, pts.right];
  return (
    <svg viewBox="-70 -34 500 330" role="img" aria-label={`PCT health: ${keys.map((k) => `${labels[k]} ${aspects[k] ?? 'not rated'}`).join(', ')}; overall ${overall ?? 'not rated'}`} style={{ width: '100%', maxWidth: 420 }}>
      <polygon points="180,22 28,228 332,228" fill="var(--surface-2)" stroke="var(--line-strong)" strokeWidth="1.5" />
      <circle cx="180" cy="160" r="34" fill="var(--brand-teal-soft)" stroke="var(--brand-teal)" />
      <text x="180" y="156" textAnchor="middle" style={{ fill: 'var(--ink-2)', fontSize: 10.5 }}>Success</text>
      <text x="180" y="172" textAnchor="middle" style={{ fill: 'var(--ink)', fontSize: 15, fontWeight: 700 }}>{overall ?? '—'}</text>
      {keys.slice(0, 3).map((k, i) => {
        const [x, y] = corner[i];
        const v = aspects[k];
        const st = status(v);
        const col = st === 'na' ? 'var(--st-na)' : `var(--st-${st})`;
        return (
          <g key={k}>
            <circle cx={x} cy={y} r="20" fill={col} stroke="var(--chart-surface)" strokeWidth="3" />
            <text x={x} y={y + 4} textAnchor="middle" style={{ fill: st === 'warning' ? '#0b0b0b' : '#fff', fontSize: 12, fontWeight: 700 }}>{v ?? '–'}</text>
            <text x={x} y={i === 0 ? y - 26 : y + 36} textAnchor="middle" style={{ fill: 'var(--ink-2)', fontSize: 11, fontWeight: 600 }}>{labels[k]}</text>
          </g>
        );
      })}
    </svg>
  );
}
