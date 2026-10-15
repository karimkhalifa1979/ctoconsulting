// Interactive SVG charts. Thin marks, hairline grid, one y-axis per chart, legends for 2+ series,
// a hover layer on every chart, and (through ChartCard) a table twin for accessibility.
import { useEffect, useRef, useState } from 'react';
import { money, pct, quarterLabel } from '../lib/util.js';

// Callback ref so a chart that first renders an empty state still measures its real container.
export function useWidth(initial = 640) {
  const [el, setEl] = useState(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if (!el) return undefined;
    const cw0 = el.getBoundingClientRect().width;
    if (cw0 > 0) setW(Math.round(cw0));
    const ro = new ResizeObserver((entries) => { const cw = entries[0].contentRect.width; if (cw > 0) setW(Math.round(cw)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.5; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}
const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

function Tip({ tip }) {
  if (!tip) return null;
  return <div className="tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 330), top: tip.y + 12 }}>{tip.content}</div>;
}
const tipRow = (label, value, color) => <div key={label} style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}><span>{color && <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: color, marginRight: 6 }} />}{label}</span><strong>{value}</strong></div>;

function YAxis({ ticks, y, x0, x1, fmt }) {
  return (
    <g className="axis">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x0} x2={x1} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth="1" />
          <text x={x0 - 6} y={y(t) + 3.5} textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
    </g>
  );
}

// ---- Annual cash flow: benefits up, costs down, cumulative net line --------------------------
export function CashflowChart({ annual, height = 260 }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const m = { l: 58, r: 14, t: 14, b: 30 };
  const cum = annual.map((a) => a.cum);
  const lo = Math.min(0, ...annual.map((a) => -a.costs), ...cum);
  const hi = Math.max(0, ...annual.map((a) => a.benefits), ...cum);
  const ticks = niceTicks(lo, hi, 5);
  const y = scale(ticks[0], ticks[ticks.length - 1], height - m.b, m.t);
  const band = (W - m.l - m.r) / Math.max(1, annual.length);
  const bw = Math.min(24, band * 0.36);
  const xc = (i) => m.l + band * i + band / 2;
  const path = annual.map((a, i) => `${i ? 'L' : 'M'}${xc(i)},${y(a.cum)}`).join(' ');
  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={W} height={height} role="img" aria-label="Annual benefits, costs and cumulative net cash flow">
        <YAxis ticks={ticks} y={y} x0={m.l} x1={W - m.r} fmt={(v) => money(v)} />
        {annual.map((a, i) => (
          <g key={a.fy}>
            <rect x={xc(i) - bw - 1} y={y(a.benefits)} width={bw} height={Math.max(0, y(0) - y(a.benefits))} fill="var(--ben)" rx="3" />
            <rect x={xc(i) + 1} y={y(0)} width={bw} height={Math.max(0, y(-a.costs) - y(0))} fill="var(--cost)" rx="3" />
            <text className="axis" x={xc(i)} y={height - 10} textAnchor="middle">{a.label}</text>
            <rect x={xc(i) - band / 2} y={m.t} width={band} height={height - m.t - m.b} fill="transparent"
              onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, content: <><strong>{a.label}</strong>{tipRow('Benefits', money(a.benefits), 'var(--ben)')}{tipRow('Costs', money(a.costs), 'var(--cost)')}{tipRow('Net', money(a.net))}{tipRow('Cumulative', money(a.cum), 'var(--net)')}</> })} onMouseLeave={() => setTip(null)} />
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--net)" strokeWidth="2" strokeLinejoin="round" pointerEvents="none" />
        {annual.map((a, i) => <circle key={a.fy} cx={xc(i)} cy={y(a.cum)} r="3.5" fill="var(--net)" stroke="#fff" strokeWidth="2" pointerEvents="none" />)}
      </svg>
      <div className="legend inline"><span><i style={{ background: 'var(--ben)' }} />Benefits</span><span><i style={{ background: 'var(--cost)' }} />Costs</span><span><i className="line" style={{ background: 'var(--net)' }} />Cumulative net cash flow</span></div>
      <Tip tip={tip} />
    </div>
  );
}

// ---- Benefit profile: forecast (with plateaus and learning-lag dip) against actuals ------------
export function ProfileChart({ rows, financial, unit, baseline, target, height = 230 }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const m = { l: 58, r: 14, t: 14, b: 30 };
  const vals = rows.flatMap((r) => [r.forecast, r.actual].filter((v) => v !== null && v !== undefined));
  if (!financial) { if (baseline !== undefined) vals.push(Number(baseline)); if (target !== undefined) vals.push(Number(target)); }
  const lo = Math.min(financial ? 0 : Infinity, ...vals); const hi = Math.max(financial ? 0 : -Infinity, ...vals);
  const ticks = niceTicks(lo, hi, 4);
  const y = scale(ticks[0], ticks[ticks.length - 1], height - m.b, m.t);
  const band = (W - m.l - m.r) / Math.max(1, rows.length);
  const xc = (i) => m.l + band * i + band / 2;
  const fmt = (v) => (financial ? money(v) : `${Number(v).toLocaleString('en-AU', { maximumFractionDigits: 1 })}`);
  const step = rows.map((r, i) => `${i ? 'L' : 'M'}${m.l + band * i},${y(r.forecast)} L${m.l + band * (i + 1)},${y(r.forecast)}`).join(' ');
  const area = financial ? `${step} L${m.l + band * rows.length},${y(0)} L${m.l},${y(0)} Z` : null;
  const every = Math.ceil(rows.length / Math.max(1, Math.floor((W - m.l) / 64)));
  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={W} height={height} role="img" aria-label="Benefit profile: forecast and actuals by quarter">
        <YAxis ticks={ticks} y={y} x0={m.l} x1={W - m.r} fmt={fmt} />
        {area && <path d={area} fill="var(--ben)" opacity="0.1" />}
        {!financial && target !== undefined && target !== '' && <g><line x1={m.l} x2={W - m.r} y1={y(Number(target))} y2={y(Number(target))} stroke="var(--ink-3)" strokeDasharray="4 3" /><text className="axis" x={W - m.r} y={y(Number(target)) - 4} textAnchor="end">Target {fmt(target)}</text></g>}
        <path d={step} fill="none" stroke="var(--ben)" strokeWidth="2" />
        {rows.map((r, i) => r.actual !== null && <circle key={r.period} cx={xc(i)} cy={y(r.actual)} r="4.5" fill="var(--net)" stroke="#fff" strokeWidth="2" />)}
        {rows.map((r, i) => (i % every === 0 ? <text key={r.period} className="axis" x={xc(i)} y={height - 10} textAnchor="middle">{quarterLabel(r.period)}</text> : null))}
        {rows.map((r, i) => <rect key={`h${r.period}`} x={m.l + band * i} y={m.t} width={band} height={height - m.t - m.b} fill="transparent" onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, content: <><strong>{quarterLabel(r.period)}</strong>{tipRow('Forecast', fmt(r.forecast), 'var(--ben)')}{r.actual !== null && tipRow('Actual', fmt(r.actual), 'var(--net)')}{r.actual !== null && financial && r.forecast ? tipRow('Realisation', pct(r.actual / r.forecast)) : null}</> })} onMouseLeave={() => setTip(null)} />)}
      </svg>
      <div className="legend inline"><span><i className="line" style={{ background: 'var(--ben)' }} />Forecast{unit ? ` (${unit})` : ''}</span><span><i style={{ background: 'var(--net)', borderRadius: '50%' }} />Actual</span>{!financial && target !== undefined && <span><i className="dash" />Target</span>}</div>
      <Tip tip={tip} />
    </div>
  );
}

// ---- Histogram with percentile markers (simulation) -------------------------------------
export function Histogram({ bins, markers = [], height = 250, format = (v) => money(v), threshold = 0, xLabel = 'Net present value', total }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const m = { l: 44, r: 14, t: 26, b: 34 };
  if (!bins.length) return <div ref={ref} className="empty-sm">No data</div>;
  const x = scale(bins[0].x0, bins[bins.length - 1].x1, m.l, W - m.r);
  const maxC = Math.max(...bins.map((b) => b.count), 1);
  const n = total || bins.reduce((a, b) => a + b.count, 0) || 1;
  const yt = niceTicks(0, (maxC / n) * 100, 4);
  const y = scale(0, yt[yt.length - 1] || 1, height - m.b, m.t);
  const xt = niceTicks(bins[0].x0, bins[bins.length - 1].x1, Math.max(3, Math.floor(W / 110)));
  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={W} height={height} role="img" aria-label={`${xLabel} distribution`}>
        <YAxis ticks={yt} y={y} x0={m.l} x1={W - m.r} fmt={(v) => `${v}%`} />
        {bins.map((b, i) => {
          const share = (b.count / n) * 100;
          const x0 = x(b.x0) + 1; const w = Math.max(1, x(b.x1) - x(b.x0) - 2);
          return <rect key={i} x={x0} y={y(share)} width={w} height={Math.max(0, y(0) - y(share))} rx={Math.min(3, w / 2)} fill={b.x1 <= threshold ? 'var(--series-8)' : b.x0 >= threshold ? 'var(--net)' : '#9aa7b8'}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, content: <><strong>{format(b.x0)} to {format(b.x1)}</strong>{tipRow('Share of iterations', `${share.toFixed(1)}%`)}{tipRow('Iterations', b.count.toLocaleString())}</> })} onMouseLeave={() => setTip(null)} />;
        })}
        {xt.filter((t) => t >= bins[0].x0 && t <= bins[bins.length - 1].x1).map((t) => <text key={t} className="axis" x={x(t)} y={height - 14} textAnchor="middle">{format(t)}</text>)}
        <text className="axis" x={(m.l + W - m.r) / 2} y={height - 1} textAnchor="middle">{xLabel}</text>
        {markers.filter((mk) => Number.isFinite(mk.value) && mk.value >= bins[0].x0 && mk.value <= bins[bins.length - 1].x1).sort((a, b) => a.value - b.value).reduce((acc, mk) => {
          // Raise a label when it would collide with the previous marker's label.
          const prev = acc[acc.length - 1];
          acc.push({ mk, raised: Boolean(prev) && x(mk.value) - x(prev.mk.value) < 30 && !prev.raised });
          return acc;
        }, []).map(({ mk, raised }) => {
          return (
            <g key={mk.label}>
              <line x1={x(mk.value)} x2={x(mk.value)} y1={m.t - 6 - (raised ? 11 : 0)} y2={height - m.b} stroke={mk.color || 'var(--brand-navy)'} strokeWidth={mk.strong ? 2 : 1.25} strokeDasharray={mk.dash ? '4 3' : undefined} />
              <text x={x(mk.value)} y={m.t - 10 - (raised ? 11 : 0)} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={mk.color || 'var(--brand-navy)'}>{mk.label}</text>
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

// ---- Cumulative distribution (S-curve) with a draggable target ----------------------------------
export function CdfChart({ series, height = 250, format = (v) => money(v), target, onTarget, xLabel = 'Net present value' }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const svgRef = useRef(null);
  const m = { l: 44, r: 14, t: 14, b: 34 };
  const all = series.filter((s) => s.sorted?.length);
  if (!all.length) return <div ref={ref} className="empty-sm">No data</div>;
  const lo = Math.min(...all.map((s) => s.sorted[0])); const hi = Math.max(...all.map((s) => s.sorted[s.sorted.length - 1]));
  const x = scale(lo, hi, m.l, W - m.r); const inv = scale(m.l, W - m.r, lo, hi);
  const y = scale(0, 100, height - m.b, m.t);
  const probBelow = (s, v) => { let a = 0; let b = s.sorted.length; while (a < b) { const mid = (a + b) >> 1; if (s.sorted[mid] < v) a = mid + 1; else b = mid; } return a / s.sorted.length; };
  const pathOf = (s) => { const k = Math.max(1, Math.floor(s.sorted.length / 300)); let d = ''; for (let i = 0; i < s.sorted.length; i += k) d += `${d ? 'L' : 'M'}${x(s.sorted[i])},${y((i / (s.sorted.length - 1)) * 100)}`; return `${d}L${x(s.sorted[s.sorted.length - 1])},${y(100)}`; };
  const xt = niceTicks(lo, hi, Math.max(3, Math.floor(W / 110)));
  const drag = (e) => { if (!onTarget || !(e.buttons & 1)) return; const r = svgRef.current.getBoundingClientRect(); onTarget(Math.max(lo, Math.min(hi, inv(e.clientX - r.left)))); };
  return (
    <div className="chart-wrap" ref={ref}>
      <svg ref={svgRef} width={W} height={height} role="img" aria-label={`Cumulative probability of ${xLabel}`} onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); drag(e); }} onPointerMove={(e) => { drag(e); const r = svgRef.current.getBoundingClientRect(); const v = inv(e.clientX - r.left); setTip({ x: e.clientX, y: e.clientY, content: <><strong>{format(v)}</strong>{all.map((s) => tipRow(`P(${xLabel.split(' ')[0]} < this) · ${s.name}`, pct(probBelow(s, v)), s.color))}</> }); }} onPointerLeave={() => setTip(null)} style={{ cursor: onTarget ? 'ew-resize' : 'default', touchAction: 'none' }}>
        <YAxis ticks={[0, 25, 50, 75, 100]} y={y} x0={m.l} x1={W - m.r} fmt={(v) => `${v}%`} />
        {lo < 0 && hi > 0 && <line x1={x(0)} x2={x(0)} y1={m.t} y2={height - m.b} stroke="var(--axis)" />}
        {all.map((s) => <path key={s.name} d={pathOf(s)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />)}
        {xt.filter((t) => t >= lo && t <= hi).map((t) => <text key={t} className="axis" x={x(t)} y={height - 14} textAnchor="middle">{format(t)}</text>)}
        <text className="axis" x={(m.l + W - m.r) / 2} y={height - 1} textAnchor="middle">{xLabel}</text>
        {target !== undefined && target !== null && target >= lo && target <= hi && (
          <g>
            <line x1={x(target)} x2={x(target)} y1={m.t} y2={height - m.b} stroke="var(--brand-navy)" strokeWidth="2" />
            {all.slice(0, 1).map((s) => { const p = probBelow(s, target); return <g key="lbl"><circle cx={x(target)} cy={y(p * 100)} r="5" fill="var(--brand-navy)" stroke="#fff" strokeWidth="2" /><text x={x(target) + (x(target) > W - 170 ? -8 : 8)} y={Math.max(m.t + 10, y(p * 100) - 8)} textAnchor={x(target) > W - 170 ? 'end' : 'start'} fontSize="11.5" fontWeight="700" fill="var(--brand-navy)">{pct(p)} below {format(target)}</text></g>; })}
          </g>
        )}
      </svg>
      {all.length > 1 && <div className="legend inline">{all.map((s) => <span key={s.name}><i className="line" style={{ background: s.color }} />{s.name}</span>)}</div>}
      <Tip tip={tip} />
    </div>
  );
}

// ---- Fan chart of cumulative net cash flow over time --------------------------------------
export function FanChart({ fan, base, height = 270 }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const [hover, setHover] = useState(null);
  const m = { l: 58, r: 14, t: 14, b: 30 };
  if (!fan?.length) return <div ref={ref} className="empty-sm">No data</div>;
  const lo = Math.min(0, ...fan.map((f) => f.p10), ...(base || [])); const hi = Math.max(0, ...fan.map((f) => f.p90), ...(base || []));
  const ticks = niceTicks(lo, hi, 5);
  const y = scale(ticks[0], ticks[ticks.length - 1], height - m.b, m.t);
  const x = scale(0, fan.length - 1, m.l, W - m.r);
  const band = (a, b) => `${fan.map((f, i) => `${i ? 'L' : 'M'}${x(i)},${y(f[a])}`).join(' ')} ${fan.slice().reverse().map((f, i) => `L${x(fan.length - 1 - i)},${y(f[b])}`).join(' ')} Z`;
  const line = (key) => fan.map((f, i) => `${i ? 'L' : 'M'}${x(i)},${y(f[key])}`).join(' ');
  const baseLine = base ? base.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ') : null;
  const every = Math.ceil(fan.length / Math.max(1, Math.floor((W - m.l) / 70)));
  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={W} height={height} role="img" aria-label="Cumulative net cash flow over time: P10 to P90 range" onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left - m.l) / (W - m.l - m.r)) * (fan.length - 1)); if (i < 0 || i >= fan.length) return; setHover(i); const f = fan[i]; setTip({ x: e.clientX, y: e.clientY, content: <><strong>End of {quarterLabel(f.key)}</strong>{tipRow('P90', money(f.p90))}{tipRow('P75', money(f.p75))}{tipRow('Median (P50)', money(f.p50), 'var(--net)')}{tipRow('P25', money(f.p25))}{tipRow('P10', money(f.p10))}{base && tipRow('Base case', money(base[i]))}</> }); }} onMouseLeave={() => { setTip(null); setHover(null); }}>
        <YAxis ticks={ticks} y={y} x0={m.l} x1={W - m.r} fmt={(v) => money(v)} />
        <path d={band('p90', 'p10')} fill="var(--net)" opacity="0.1" />
        <path d={band('p75', 'p25')} fill="var(--net)" opacity="0.18" />
        <path d={line('p50')} fill="none" stroke="var(--net)" strokeWidth="2" />
        {baseLine && <path d={baseLine} fill="none" stroke="var(--brand-navy)" strokeWidth="1.5" strokeDasharray="5 4" />}
        {fan.map((f, i) => (i % every === 0 ? <text key={f.key} className="axis" x={x(i)} y={height - 10} textAnchor="middle">{quarterLabel(f.key).replace('Q', 'Q')}</text> : null))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={height - m.b} stroke="var(--ink-3)" strokeWidth="1" />}
        {hover !== null && <circle cx={x(hover)} cy={y(fan[hover].p50)} r="4.5" fill="var(--net)" stroke="#fff" strokeWidth="2" />}
      </svg>
      <div className="legend inline"><span><i style={{ background: 'var(--net)', opacity: 0.3 }} />P10–P90 range</span><span><i style={{ background: 'var(--net)', opacity: 0.55 }} />P25–P75 range</span><span><i className="line" style={{ background: 'var(--net)' }} />Median</span>{base && <span><i className="dash" style={{ borderTopColor: 'var(--brand-navy)' }} />Base case</span>}</div>
      <Tip tip={tip} />
    </div>
  );
}

// ---- PV of costs against PV of benefits, one dot per iteration ------------------------------------
export function CostBenefitScatter({ pvC, pvB, n, base, height = 270, limit = 1500 }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const m = { l: 58, r: 14, t: 14, b: 36 };
  const k = Math.max(1, Math.floor(n / limit));
  const pts = [];
  for (let i = 0; i < n; i += k) pts.push([pvC[i], pvB[i]]);
  if (!pts.length) return <div ref={ref} className="empty-sm">No data</div>;
  const maxV = Math.max(...pts.map((p) => Math.max(p[0], p[1])), base ? Math.max(base.pvB, base.pvC) : 0);
  const minC = Math.min(...pts.map((p) => p[0])); const minB = Math.min(0, ...pts.map((p) => p[1]));
  const xt = niceTicks(Math.min(minC, 0), maxV, 5); const yt = niceTicks(minB, maxV, 5);
  const x = scale(xt[0], xt[xt.length - 1], m.l, W - m.r); const y = scale(yt[0], yt[yt.length - 1], height - m.b, m.t);
  const d0 = Math.max(xt[0], yt[0]); const d1 = Math.min(xt[xt.length - 1], yt[yt.length - 1]);
  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={W} height={height} role="img" aria-label="Present value of costs against present value of benefits for each iteration; points above the diagonal have positive NPV">
        <YAxis ticks={yt} y={y} x0={m.l} x1={W - m.r} fmt={(v) => money(v)} />
        {xt.map((t) => <text key={t} className="axis" x={x(t)} y={height - 18} textAnchor="middle">{money(t)}</text>)}
        <text className="axis" x={(m.l + W - m.r) / 2} y={height - 3} textAnchor="middle">Present value of costs →</text>
        <text className="axis" transform={`translate(12 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle">Present value of benefits →</text>
        <line x1={x(d0)} y1={y(d0)} x2={x(d1)} y2={y(d1)} stroke="var(--brand-navy)" strokeWidth="1.25" />
        <text x={x(d1) - 4} y={y(d1) + 14} textAnchor="end" fontSize="10.5" fill="var(--brand-navy)" fontWeight="600">Break-even (NPV = 0)</text>
        {pts.map((p, i) => <circle key={i} cx={x(p[0])} cy={y(p[1])} r="2.4" fill={p[1] >= p[0] ? 'var(--net)' : 'var(--series-8)'} opacity="0.45" />)}
        {base && <circle cx={x(base.pvC)} cy={y(base.pvB)} r="6" fill="var(--brand-gold)" stroke="#fff" strokeWidth="2" onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, content: <><strong>Base case</strong>{tipRow('PV costs', money(base.pvC))}{tipRow('PV benefits', money(base.pvB))}</> })} onMouseLeave={() => setTip(null)} />}
      </svg>
      <div className="legend inline"><span><i style={{ background: 'var(--net)', borderRadius: '50%' }} />NPV positive</span><span><i style={{ background: 'var(--series-8)', borderRadius: '50%' }} />NPV negative</span><span><i style={{ background: 'var(--brand-gold)', borderRadius: '50%' }} />Base case</span></div>
      <Tip tip={tip} />
    </div>
  );
}

// ---- Tornado (swing) chart --------------------------------------------------------------------
export function Tornado({ rows, base, height }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const rowH = 26;
  const H = height || rows.length * rowH + 40;
  const labelW = Math.min(250, W * 0.42);
  const m = { l: labelW + 8, r: 16, t: 8, b: 26 };
  if (!rows.length) return <div ref={ref} className="empty-sm">No uncertain inputs</div>;
  const lo = Math.min(base, ...rows.map((r) => Math.min(r.low, r.high))); const hi = Math.max(base, ...rows.map((r) => Math.max(r.low, r.high)));
  const xt = niceTicks(lo, hi, Math.max(2, Math.floor((W - m.l - m.r) / 90)));
  const x = scale(xt[0], xt[xt.length - 1], m.l, W - m.r);
  const every = Math.ceil(64 / Math.max(1, x(xt[1] ?? xt[0]) - x(xt[0]) || 64));
  const maxChars = Math.max(8, Math.floor(labelW / 6.4));
  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={W} height={H} role="img" aria-label="Tornado chart: NPV range when each input moves between its low and high value">
        {xt.map((t, i) => <g key={t} className="axis"><line x1={x(t)} x2={x(t)} y1={m.t} y2={H - m.b} stroke="var(--grid)" />{i % every === 0 && <text x={x(t)} y={H - 8} textAnchor="middle">{money(t)}</text>}</g>)}
        {rows.map((r, i) => {
          const yy = m.t + i * rowH;
          const a = Math.min(r.low, r.high); const b = Math.max(r.low, r.high);
          return (
            <g key={r.id} onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, content: <><strong>{r.label}</strong>{r.program && <div className="mini" style={{ color: '#c9d5e6' }}>{r.program}</div>}{tipRow('NPV at downside', money(r.low))}{tipRow('NPV at upside', money(r.high))}{tipRow('Swing', money(r.swing))}{r.prob !== undefined && tipRow('Probability', pct(r.prob))}</> })} onMouseLeave={() => setTip(null)}>
              <rect x="0" y={yy} width={W} height={rowH} fill="transparent" />
              <text x={labelW} y={yy + rowH / 2 + 4} textAnchor="end" fontSize="11.5" fill="var(--ink-2)">{r.label.length > maxChars ? `${r.label.slice(0, maxChars - 1)}…` : r.label}</text>
              <rect x={x(a)} y={yy + 5} width={Math.max(1, x(Math.min(b, base)) - x(a))} height={rowH - 10} fill="var(--series-8)" rx="3" opacity={a < base ? 1 : 0} />
              <rect x={x(Math.max(a, base))} y={yy + 5} width={Math.max(1, x(b) - x(Math.max(a, base)))} height={rowH - 10} fill="var(--net)" rx="3" opacity={b > base ? 1 : 0} />
            </g>
          );
        })}
        <line x1={x(base)} x2={x(base)} y1={m.t - 4} y2={H - m.b} stroke="var(--brand-navy)" strokeWidth="2" />
      </svg>
      <div className="legend inline"><span><i style={{ background: 'var(--series-8)' }} />Downside (NPV falls)</span><span><i style={{ background: 'var(--net)' }} />Upside (NPV rises)</span><span><i className="line" style={{ background: 'var(--brand-navy)' }} />Base case {money(base)}</span></div>
      <Tip tip={tip} />
    </div>
  );
}

// ---- Value plot: financial worth vs risk or alignment, bubble = cost (VAL-08) --------------------
const BAND_COLOR = { high: 'var(--series-1)', medium: 'var(--series-2)', low: 'var(--series-3)', none: '#9aa7b8' };
export function ValuePlot({ points, xLabel, xKey, height = 380, onOpen, invertX = false, benchmarks = [] }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const m = { l: 62, r: 20, t: 18, b: 40 };
  const pts = points.filter((p) => Number.isFinite(p[xKey]) && Number.isFinite(p.npv));
  const ys = pts.map((p) => p.npv);
  const yt = niceTicks(Math.min(0, ...ys), Math.max(0, ...ys), 5);
  const y = scale(yt[0], yt[yt.length - 1], height - m.b, m.t);
  const x = scale(0, 100, m.l, W - m.r);
  const maxCost = Math.max(...pts.map((p) => p.cost || 0), 1);
  const r = (c) => 6 + 20 * Math.sqrt((c || 0) / maxCost);
  const good = invertX ? [0, 35] : [65, 100];
  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={W} height={height} role="img" aria-label={`Value plot: financial worth against ${xLabel}`}>
        <rect x={x(good[0])} y={m.t} width={x(good[1]) - x(good[0])} height={y(0) - m.t} fill="var(--brand-teal-soft)" opacity="0.6" />
        <YAxis ticks={yt} y={y} x0={m.l} x1={W - m.r} fmt={(v) => money(v)} />
        {[0, 25, 50, 75, 100].map((t) => <text key={t} className="axis" x={x(t)} y={height - 22} textAnchor="middle">{t}</text>)}
        <text className="axis" x={(m.l + W - m.r) / 2} y={height - 5} textAnchor="middle">{xLabel} (0–100){invertX ? ' — lower is better' : ' — higher is better'}</text>
        <text className="axis" transform={`translate(12 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle">Financial worth (NPV)</text>
        <text className="vp-band" x={x(good[0]) + 6} y={m.t + 14}>Sweet spot</text>
        {benchmarks.map((b) => <g key={b.label}><rect x={x(b.x) - 5} y={y(b.npv) - 5} width="10" height="10" transform={`rotate(45 ${x(b.x)} ${y(b.npv)})`} fill="none" stroke="var(--brand-navy)" strokeWidth="1.5" /><text x={x(b.x) + 9} y={y(b.npv) + 4} fontSize="10" fill="var(--brand-navy)">{b.label}</text></g>)}
        {pts.sort((a, b) => (b.cost || 0) - (a.cost || 0)).map((p) => (
          <g key={p.id} style={{ cursor: onOpen ? 'pointer' : 'default' }} onClick={() => onOpen?.(p)} tabIndex={onOpen ? 0 : undefined} onKeyDown={(e) => e.key === 'Enter' && onOpen?.(p)}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, content: <><strong>{p.code} {p.name}</strong>{tipRow('NPV', money(p.npv))}{tipRow(xLabel, Math.round(p[xKey]))}{tipRow('Lifetime cost', money(p.cost))}{tipRow('Selection band', p.band || '—')}{p.state && tipRow('State', p.state)}</> })} onMouseLeave={() => setTip(null)}>
            <circle cx={x(p[xKey])} cy={y(p.npv)} r={r(p.cost)} fill={BAND_COLOR[p.band || 'none']} opacity="0.75" stroke="#fff" strokeWidth="2" />
            <text x={x(p[xKey])} y={y(p.npv) + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff" pointerEvents="none">{p.code?.replace('PRG-', '')}</text>
          </g>
        ))}
      </svg>
      <div className="legend inline"><span><i style={{ background: BAND_COLOR.high, borderRadius: '50%' }} />High band</span><span><i style={{ background: BAND_COLOR.medium, borderRadius: '50%' }} />Medium band</span><span><i style={{ background: BAND_COLOR.low, borderRadius: '50%' }} />Low band</span><span><i style={{ background: BAND_COLOR.none, borderRadius: '50%' }} />Unbanded</span>{benchmarks.length > 0 && <span><i style={{ background: 'none', border: '1.5px solid var(--brand-navy)', transform: 'rotate(45deg)' }} />Benchmark</span>}<span className="mini">Bubble size = lifetime cost</span></div>
      <Tip tip={tip} />
    </div>
  );
}

// ---- Box plot of NPV per program (portfolio simulation) ---------------------------------------
export function BoxPlot({ rows, height }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const rowH = 30; const H = height || rows.length * rowH + 34;
  const labelW = Math.min(230, W * 0.36);
  const m = { l: labelW + 10, r: 16, t: 6, b: 26 };
  const vals = rows.flatMap((r) => [r.stats?.p10, r.stats?.p90]).filter(Number.isFinite);
  if (!vals.length) return <div ref={ref} className="empty-sm">No data</div>;
  const xt = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals), Math.max(3, Math.floor((W - labelW) / 100)));
  const x = scale(xt[0], xt[xt.length - 1], m.l, W - m.r);
  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={W} height={H} role="img" aria-label="NPV range per program: whiskers P10–P90, box P25–P75, line median">
        {xt.map((t) => <g key={t} className="axis"><line x1={x(t)} x2={x(t)} y1={m.t} y2={H - m.b} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} /><text x={x(t)} y={H - 8} textAnchor="middle">{money(t)}</text></g>)}
        {rows.map((r, i) => {
          const s = r.stats; if (!s) return null;
          const yy = m.t + i * rowH + rowH / 2;
          return (
            <g key={r.program.id} onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, content: <><strong>{r.program.code} {r.program.name}</strong>{tipRow('P10', money(s.p10))}{tipRow('P50', money(s.p50))}{tipRow('P90', money(s.p90))}{tipRow('P(NPV > 0)', pct(r.probPositive))}</> })} onMouseLeave={() => setTip(null)}>
              <rect x="0" y={yy - rowH / 2} width={W} height={rowH} fill="transparent" />
              <text x={labelW} y={yy + 4} textAnchor="end" fontSize="11.5" fill="var(--ink-2)">{`${r.program.code} ${r.program.name}`.slice(0, 38)}</text>
              <line x1={x(s.p10)} x2={x(s.p90)} y1={yy} y2={yy} stroke="var(--ink-3)" strokeWidth="1.5" />
              <rect x={x(s.p25)} y={yy - 8} width={Math.max(2, x(s.p75) - x(s.p25))} height="16" rx="3" fill="var(--net)" opacity="0.3" />
              <line x1={x(s.p50)} x2={x(s.p50)} y1={yy - 9} y2={yy + 9} stroke="var(--net)" strokeWidth="2.5" />
            </g>
          );
        })}
      </svg>
      <div className="legend inline"><span><i className="line" style={{ background: 'var(--ink-3)' }} />P10–P90</span><span><i style={{ background: 'var(--net)', opacity: 0.4 }} />P25–P75</span><span><i className="line" style={{ background: 'var(--net)' }} />Median NPV</span></div>
      <Tip tip={tip} />
    </div>
  );
}

// ---- Small multi-series line chart (trends) ----------------------------------------------------
export function TrendChart({ labels, series, height = 200, yMin = 0, yMax = 100, fmt = (v) => Math.round(v) }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const m = { l: 40, r: 70, t: 12, b: 26 };
  const ticks = niceTicks(yMin, yMax, 4);
  const y = scale(ticks[0], ticks[ticks.length - 1], height - m.b, m.t);
  const x = scale(0, Math.max(1, labels.length - 1), m.l, W - m.r);
  return (
    <div className="chart-wrap" ref={ref}>
      <svg width={W} height={height} role="img" aria-label={`Trend of ${series.map((s) => s.name).join(', ')}`}>
        <YAxis ticks={ticks} y={y} x0={m.l} x1={W - m.r} fmt={fmt} />
        {labels.map((l, i) => <text key={l + i} className="axis" x={x(i)} y={height - 8} textAnchor="middle">{l}</text>)}
        {series.map((s) => {
          const pts = s.values.map((v, i) => [i, v]).filter((p) => Number.isFinite(p[1]));
          const last = pts[pts.length - 1];
          return (
            <g key={s.name}>
              <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0])},${y(p[1])}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" />
              {pts.map((p) => <circle key={p[0]} cx={x(p[0])} cy={y(p[1])} r="4" fill={s.color} stroke="#fff" strokeWidth="2" onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, content: <><strong>{labels[p[0]]}</strong>{tipRow(s.name, fmt(p[1]), s.color)}</> })} onMouseLeave={() => setTip(null)} />)}
              {last && series.length <= 4 && <text x={x(last[0]) + 8} y={y(last[1]) + 4} fontSize="10.5" fill="var(--ink-2)">{s.name.length > 11 ? `${s.name.slice(0, 10)}…` : s.name}</text>}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && <div className="legend inline">{series.map((s) => <span key={s.name}><i className="line" style={{ background: s.color }} />{s.name}</span>)}</div>}
      <Tip tip={tip} />
    </div>
  );
}

export function Donut({ items, size = 140, center, sub }) {
  const [tip, setTip] = useState(null);
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = 52; const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="row" style={{ gap: 18, flexWrap: 'nowrap' }}>
      <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={items.map((i) => `${i.label} ${i.value}`).join(', ')}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eef2f7" strokeWidth="18" />
        {items.map((it) => {
          const len = (it.value / total) * c;
          const seg = <circle key={it.label} cx="70" cy="70" r={r} fill="none" stroke={it.color} strokeWidth="18" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, content: `${it.label}: ${it.display ?? it.value} (${Math.round((it.value / total) * 100)}%)` })} onMouseLeave={() => setTip(null)} />;
          offset += len;
          return seg;
        })}
        <text x="70" y="68" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--brand-navy)" fontFamily="var(--font-head)">{center ?? total}</text>
        <text x="70" y="86" textAnchor="middle" fontSize="10" fill="var(--ink-3)">{sub}</text>
      </svg>
      <div className="legend" style={{ flexDirection: 'column', gap: 7, marginTop: 0 }}>
        {items.map((it) => <span key={it.label}><i style={{ background: it.color }} />{it.label} <strong className="tabular">{it.display ?? it.value.toLocaleString()}</strong></span>)}
      </div>
      <Tip tip={tip} />
    </div>
  );
}
