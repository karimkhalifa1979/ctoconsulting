// SVG charts. Colours and fonts are explicit attributes (no CSS variables) so the same
// components can be rasterised into the PDF report.
export const FONT = 'Inter, Helvetica, Arial, sans-serif';
export const C = {
  navy: '#0b1f3a', navy3: '#1d3d69', teal: '#0fa3b1', tealDark: '#0b7d88', blue: '#2a78d6', orange: '#eb6834', green: '#1baf7a',
  purple: '#8a5cd1', gold: '#f2a900', grey: '#b9c0ca', ink: '#16212f', ink2: '#4a5768', ink3: '#7b8796', line: '#e2e7ee', grid: '#eef1f5',
  red: '#d03b3b', amber: '#f0a020', ok: '#1f9d58',
};
export const SEV_COLORS = { Critical: '#b42323', High: '#e06a3a', Medium: '#f2b33d', Low: '#7fbf8e' };
export const RAG_FILL = { Red: '#d03b3b', Amber: '#f0a020', Green: '#1f9d58', '': '#cfd7e2' };
export const PALETTE = [C.blue, C.orange, C.green, C.purple, C.gold, C.teal, '#d65c8c', '#6b7c93', '#3fb3c9', '#9c6b3f'];

const trunc = (s, n) => {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const niceMax = (v) => {
  if (!v || v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
};
const ticks = (max, n = 4) => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);
const Svg = ({ w, h, children, label }) => (
  <svg className="chart" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label} xmlns="http://www.w3.org/2000/svg" fontFamily={FONT} style={{ width: '100%', height: 'auto', maxWidth: w }}>
    <rect x="0" y="0" width={w} height={h} fill="#ffffff" />
    {children}
  </svg>
);

export function Radar({ labels, series, max = 5, size = 460, levels = 5, label = 'Radar chart' }) {
  const w = size + 160, h = size;
  const cx = w / 2, cy = h / 2 + 4, r = size / 2 - 48;
  const n = labels.length;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const rr = (Math.max(0, v || 0) / max) * r;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  };
  return (
    <Svg w={w} h={h + 24} label={label}>
      {Array.from({ length: levels }, (_, k) => {
        const lv = ((k + 1) / levels) * max;
        const pts = labels.map((_, i) => pt(i, lv).join(',')).join(' ');
        return <polygon key={k} points={pts} fill={k % 2 ? '#fbfcfd' : '#f5f7fa'} stroke={C.line} strokeWidth="1" />;
      }).reverse()}
      {labels.map((_, i) => {
        const [x, y] = pt(i, max);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={C.line} />;
      })}
      {Array.from({ length: levels }, (_, k) => (
        <text key={k} x={cx + 3} y={cy - ((k + 1) / levels) * r + 11} fontSize="9" fill={C.ink3}>{((k + 1) / levels) * max}</text>
      ))}
      {series.map((s) => {
        const pts = s.values.map((v, i) => pt(i, v).join(',')).join(' ');
        return (
          <g key={s.name}>
            <polygon points={pts} fill={s.color} fillOpacity={s.fill ?? 0.16} stroke={s.color} strokeWidth="2.2" strokeDasharray={s.dash} />
            {s.values.map((v, i) => {
              const [x, y] = pt(i, v);
              return v ? <circle key={i} cx={x} cy={y} r="3.2" fill={s.color}><title>{`${labels[i]} — ${s.name}: ${Number(v).toFixed(1)}`}</title></circle> : null;
            })}
          </g>
        );
      })}
      {labels.map((l, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const x = cx + (r + 14) * Math.cos(a), y = cy + (r + 14) * Math.sin(a);
        const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
        return <text key={l} x={x} y={y + 4} fontSize="11" fill={C.ink2} textAnchor={anchor} fontWeight="600">{trunc(l, 24)}</text>;
      })}
      <g transform={`translate(${12}, ${h + 10})`}>
        {series.map((s, i) => (
          <g key={s.name} transform={`translate(${i * 150}, 0)`}>
            <rect width="12" height="12" y="-10" rx="2" fill={s.color} />
            <text x="18" y="0" fontSize="11.5" fill={C.ink2}>{s.name}</text>
          </g>
        ))}
      </g>
    </Svg>
  );
}

// Horizontal bars; optional second value renders as a target marker.
export function HBar({ items, max, width = 560, rowH = 24, labelW = 190, fmt = (v) => v, marker, label = 'Bar chart', valueW = 56 }) {
  const top = max ?? niceMax(Math.max(...items.map((i) => Math.max(i.value || 0, i.marker || 0)), 0));
  const plotW = width - labelW - valueW - 10;
  const h = items.length * rowH + 26;
  return (
    <Svg w={width} h={h} label={label}>
      {ticks(top).map((t) => {
        const x = labelW + (t / top) * plotW;
        return <g key={t}><line x1={x} y1={4} x2={x} y2={h - 20} stroke={C.grid} /><text x={x} y={h - 6} fontSize="9.5" fill={C.ink3} textAnchor="middle">{fmt(t)}</text></g>;
      })}
      {items.map((it, i) => {
        const y = 6 + i * rowH;
        const bw = Math.max(0, ((it.value || 0) / top) * plotW);
        return (
          <g key={it.key || it.label}>
            <text x={labelW - 8} y={y + rowH / 2 + 3} fontSize="11" fill={C.ink2} textAnchor="end">{trunc(it.label, Math.floor(labelW / 6.2))}</text>
            <rect x={labelW} y={y + 4} width={bw} height={rowH - 9} rx="3" fill={it.color || C.blue}><title>{`${it.label}: ${fmt(it.value)}`}</title></rect>
            {marker && it.marker !== undefined && it.marker !== null && (
              <line x1={labelW + (it.marker / top) * plotW} x2={labelW + (it.marker / top) * plotW} y1={y + 1} y2={y + rowH - 2} stroke={C.navy} strokeWidth="2.5"><title>{`${marker}: ${fmt(it.marker)}`}</title></line>
            )}
            <text x={labelW + plotW + 8} y={y + rowH / 2 + 3} fontSize="11" fill={C.ink} fontWeight="600">{it.value === null || it.value === undefined ? '—' : fmt(it.value)}</text>
          </g>
        );
      })}
    </Svg>
  );
}

// Vertical grouped or stacked bars.
export function VBars({ categories, series, stacked = false, width = 620, height = 280, fmt = (v) => v, yMax, label = 'Column chart', legend = true, line }) {
  const padL = 58, padR = 16, padT = 14, padB = legend ? 58 : 36;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const totals = categories.map((_, i) => (stacked ? series.reduce((s, x) => s + Math.max(0, x.values[i] || 0), 0) : Math.max(...series.map((x) => x.values[i] || 0), 0)));
  const negs = categories.map((_, i) => (stacked ? series.reduce((s, x) => s + Math.min(0, x.values[i] || 0), 0) : Math.min(...series.map((x) => x.values[i] || 0), 0)));
  const lineVals = line ? line.values : [];
  const hi = yMax ?? niceMax(Math.max(...totals, ...lineVals, 0));
  const loRaw = Math.min(...negs, ...lineVals, 0);
  const lo = loRaw < 0 ? -niceMax(-loRaw) : 0;
  const span = hi - lo || 1;
  const y = (v) => padT + ((hi - v) / span) * plotH;
  const groupW = plotW / Math.max(1, categories.length);
  const barW = stacked ? Math.min(46, groupW * 0.56) : Math.min(28, (groupW * 0.76) / Math.max(1, series.length));
  const tickVals = [];
  const step = niceMax(span / 5);
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) tickVals.push(t);
  return (
    <Svg w={width} h={height} label={label}>
      {tickVals.map((t) => (
        <g key={t}>
          <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? C.ink3 : C.grid} />
          <text x={padL - 6} y={y(t) + 3} fontSize="9.5" fill={C.ink3} textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
      {categories.map((cat, i) => {
        const gx = padL + i * groupW;
        let pos = 0, neg = 0;
        return (
          <g key={cat}>
            {series.map((s, k) => {
              const v = s.values[i] || 0;
              let x, top, h;
              if (stacked) {
                x = gx + (groupW - barW) / 2;
                if (v >= 0) { top = y(pos + v); h = y(pos) - y(pos + v); pos += v; } else { top = y(neg); h = y(neg + v) - y(neg); neg += v; }
              } else {
                x = gx + (groupW - barW * series.length) / 2 + k * barW;
                top = v >= 0 ? y(v) : y(0);
                h = Math.abs(y(v) - y(0));
              }
              return <rect key={s.name} x={x} y={top} width={Math.max(1, barW - (stacked ? 0 : 2))} height={Math.max(0, h)} fill={s.color} rx="2"><title>{`${cat} — ${s.name}: ${fmt(v)}`}</title></rect>;
            })}
            <text x={gx + groupW / 2} y={height - padB + 14} fontSize="10" fill={C.ink2} textAnchor="middle">{trunc(cat, Math.max(6, Math.floor(groupW / 6)))}</text>
          </g>
        );
      })}
      {line && (
        <g>
          <polyline fill="none" stroke={line.color || C.navy} strokeWidth="2.5" points={line.values.map((v, i) => `${padL + i * groupW + groupW / 2},${y(v)}`).join(' ')} />
          {line.values.map((v, i) => <circle key={i} cx={padL + i * groupW + groupW / 2} cy={y(v)} r="3.5" fill={line.color || C.navy}><title>{`${categories[i]} — ${line.name}: ${fmt(v)}`}</title></circle>)}
        </g>
      )}
      {legend && (
        <g transform={`translate(${padL}, ${height - 18})`}>
          {[...series, ...(line ? [{ name: line.name, color: line.color || C.navy, isLine: true }] : [])].map((s, i) => (
            <g key={s.name} transform={`translate(${i * Math.min(170, plotW / Math.max(1, series.length + (line ? 1 : 0)))}, 0)`}>
              {s.isLine ? <line x1="0" x2="14" y1="-4" y2="-4" stroke={s.color} strokeWidth="2.5" /> : <rect width="12" height="12" y="-10" rx="2" fill={s.color} />}
              <text x="18" y="0" fontSize="10.5" fill={C.ink2}>{trunc(s.name, 24)}</text>
            </g>
          ))}
        </g>
      )}
    </Svg>
  );
}

export function Donut({ items, size = 200, center, sub, label = 'Donut chart', legendW = 190 }) {
  const total = items.reduce((a, b) => a + (b.value || 0), 0);
  const r = size / 2 - 18, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let off = 0;
  const w = size + legendW;
  return (
    <Svg w={w} h={Math.max(size, items.length * 20 + 20)} label={label}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef2f7" strokeWidth="24" />
      {total > 0 && items.filter((i) => i.value).map((it) => {
        const len = (it.value / total) * circ;
        const el = (
          <circle key={it.label} cx={cx} cy={cy} r={r} fill="none" stroke={it.color} strokeWidth="24" strokeDasharray={`${Math.max(0, len - 1.5)} ${circ}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cy})`}>
            <title>{`${it.label}: ${it.display ?? it.value} (${Math.round((it.value / total) * 100)}%)`}</title>
          </circle>
        );
        off += len;
        return el;
      })}
      <text x={cx} y={cy + 2} textAnchor="middle" fontSize="22" fontWeight="700" fill={C.navy}>{center ?? total}</text>
      {sub && <text x={cx} y={cy + 20} textAnchor="middle" fontSize="10.5" fill={C.ink3}>{sub}</text>}
      {items.map((it, i) => (
        <g key={it.label} transform={`translate(${size + 8}, ${18 + i * 20})`}>
          <rect width="11" height="11" y="-9" rx="2" fill={it.color} />
          <text x="17" y="0" fontSize="11" fill={C.ink2}>{trunc(it.label, 22)}</text>
          <text x={legendW - 12} y="0" fontSize="11" fill={C.ink} fontWeight="600" textAnchor="end">{it.display ?? it.value}</text>
        </g>
      ))}
    </Svg>
  );
}

// Two-axis prioritisation matrix (e.g. value × ease) with quadrant labels.
export function Bubble({ points, xLabel, yLabel, xMax = 5, yMax = 5, xMin = 0, yMin = 0, threshold = 3, quadrants, size = 460, label = 'Prioritisation matrix', showLabels = true }) {
  const pad = { l: 48, r: 16, t: 16, b: 44 };
  const w = size, h = size * 0.82;
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const x = (v) => pad.l + ((v - xMin) / (xMax - xMin)) * pw;
  const y = (v) => pad.t + ((yMax - v) / (yMax - yMin)) * ph;
  const tx = x(threshold - 0.5 < xMin ? threshold : threshold - 0.5), ty = y(threshold - 0.5 < yMin ? threshold : threshold - 0.5);
  // Jitter points that share a cell so they stay visible.
  const seen = {};
  const pts = points.map((p) => {
    const k = `${p.x}|${p.y}`;
    const n = (seen[k] = (seen[k] || 0) + 1) - 1;
    const ang = n * 2.3, rad = n ? 9 + n * 2 : 0;
    return { ...p, dx: Math.cos(ang) * rad, dy: Math.sin(ang) * rad };
  });
  return (
    <Svg w={w} h={h} label={label}>
      <rect x={tx} y={pad.t} width={x(xMax) - tx} height={ty - pad.t} fill="#e9f7ef" />
      <rect x={pad.l} y={pad.t} width={tx - pad.l} height={ty - pad.t} fill="#eef4fc" />
      <rect x={tx} y={ty} width={x(xMax) - tx} height={y(yMin) - ty} fill="#fdf6e6" />
      <rect x={pad.l} y={ty} width={tx - pad.l} height={y(yMin) - ty} fill="#f4f5f7" />
      {quadrants && (
        <g fontSize="10.5" fontWeight="700" fill={C.ink3}>
          <text x={x(xMax) - 6} y={pad.t + 14} textAnchor="end">{quadrants[1]}</text>
          <text x={pad.l + 6} y={pad.t + 14}>{quadrants[0]}</text>
          <text x={x(xMax) - 6} y={y(yMin) - 6} textAnchor="end">{quadrants[3]}</text>
          <text x={pad.l + 6} y={y(yMin) - 6}>{quadrants[2]}</text>
        </g>
      )}
      {Array.from({ length: xMax - xMin + 1 }, (_, i) => xMin + i).map((v) => <text key={`x${v}`} x={x(v)} y={h - pad.b + 14} fontSize="10" fill={C.ink3} textAnchor="middle">{v}</text>)}
      {Array.from({ length: yMax - yMin + 1 }, (_, i) => yMin + i).map((v) => <text key={`y${v}`} x={pad.l - 8} y={y(v) + 3} fontSize="10" fill={C.ink3} textAnchor="end">{v}</text>)}
      <line x1={pad.l} x2={x(xMax)} y1={y(yMin)} y2={y(yMin)} stroke={C.ink3} />
      <line x1={pad.l} x2={pad.l} y1={pad.t} y2={y(yMin)} stroke={C.ink3} />
      <text x={pad.l + pw / 2} y={h - 8} fontSize="11" fill={C.ink2} textAnchor="middle" fontWeight="600">{xLabel}</text>
      <text transform={`translate(12, ${pad.t + ph / 2}) rotate(-90)`} fontSize="11" fill={C.ink2} textAnchor="middle" fontWeight="600">{yLabel}</text>
      {pts.map((p) => (
        <g key={p.id || p.label}>
          <circle cx={x(p.x) + p.dx} cy={y(p.y) + p.dy} r={p.r || 7} fill={p.color || C.blue} fillOpacity="0.8" stroke="#fff" strokeWidth="1.5"><title>{`${p.id ? `${p.id} ` : ''}${p.label} (${xLabel} ${p.x}, ${yLabel} ${p.y})`}</title></circle>
          {showLabels && p.id && <text x={x(p.x) + p.dx} y={y(p.y) + p.dy + 3} fontSize="8" fill="#fff" textAnchor="middle" fontWeight="700">{String(p.id).replace(/^[A-Z]+0*/, '')}</text>}
        </g>
      ))}
    </Svg>
  );
}

// Current → target per item on a shared scale.
export function Dumbbell({ items, max = 5, min = 1, width = 600, rowH = 24, labelW = 200, fromName = 'Current', toName = 'Target', label = 'Current versus target' }) {
  const plotW = width - labelW - 24;
  const h = items.length * rowH + 44;
  const x = (v) => labelW + ((v - min) / (max - min)) * plotW;
  return (
    <Svg w={width} h={h} label={label}>
      {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((v) => (
        <g key={v}><line x1={x(v)} x2={x(v)} y1={4} y2={h - 38} stroke={C.grid} /><text x={x(v)} y={h - 26} fontSize="9.5" fill={C.ink3} textAnchor="middle">{v}</text></g>
      ))}
      {items.map((it, i) => {
        const y = 10 + i * rowH + rowH / 2;
        const hasF = it.from !== null && it.from !== undefined, hasT = it.to !== null && it.to !== undefined;
        return (
          <g key={it.label}>
            <text x={labelW - 8} y={y + 4} fontSize="11" fill={C.ink2} textAnchor="end">{trunc(it.label, Math.floor(labelW / 6.2))}</text>
            {hasF && hasT && <line x1={x(it.from)} x2={x(it.to)} y1={y} y2={y} stroke={it.to >= it.from ? '#9ed8c0' : '#f0b3b3'} strokeWidth="5" strokeLinecap="round" />}
            {hasF && <circle cx={x(it.from)} cy={y} r="6" fill={C.orange}><title>{`${it.label} — ${fromName}: ${Number(it.from).toFixed(1)}`}</title></circle>}
            {hasT && <circle cx={x(it.to)} cy={y} r="6" fill={C.teal}><title>{`${it.label} — ${toName}: ${Number(it.to).toFixed(1)}`}</title></circle>}
          </g>
        );
      })}
      <g transform={`translate(${labelW}, ${h - 8})`}>
        <circle cx="5" cy="-4" r="5" fill={C.orange} /><text x="14" y="0" fontSize="11" fill={C.ink2}>{fromName}</text>
        <circle cx="105" cy="-4" r="5" fill={C.teal} /><text x="114" y="0" fontSize="11" fill={C.ink2}>{toName}</text>
      </g>
    </Svg>
  );
}

export function Gauge({ value, max = 100, label, sub, color, size = 240 }) {
  const w = size, h = size * 0.62;
  const r = w / 2 - 22, cx = w / 2, cy = h - 12;
  const v = Math.max(0, Math.min(max, value ?? 0));
  const ang = Math.PI * (1 - v / max);
  const x = cx + r * Math.cos(ang), y = cy - r * Math.sin(ang);
  const col = color || (value === null || value === undefined ? C.grey : v >= 70 ? C.ok : v >= 45 ? C.amber : C.red);
  return (
    <Svg w={w} h={h + 6} label={`${label}: ${value ?? 'not assessed'}`}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#e7ebf0" strokeWidth="18" strokeLinecap="round" />
      {v > 0 && <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`} fill="none" stroke={col} strokeWidth="18" strokeLinecap="round" />}
      <text x={cx} y={cy - 20} textAnchor="middle" fontSize="34" fontWeight="700" fill={C.navy}>{value === null || value === undefined ? '—' : Math.round(value)}</text>
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="11" fill={C.ink3}>{sub || label}</text>
    </Svg>
  );
}

// Bridge from a starting total through deltas to an end total.
export function Waterfall({ steps, width = 640, height = 300, fmt = (v) => v, label = 'Waterfall' }) {
  const padL = 64, padR = 12, padT = 16, padB = 62;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  let run = 0;
  const bars = steps.map((s) => {
    if (s.total) { run = s.value; return { ...s, from: 0, to: s.value }; }
    const from = run; run += s.value;
    return { ...s, from, to: run };
  });
  const hi = niceMax(Math.max(...bars.map((b) => Math.max(b.from, b.to)), 0));
  const loRaw = Math.min(...bars.map((b) => Math.min(b.from, b.to)), 0);
  const lo = loRaw < 0 ? -niceMax(-loRaw) : 0;
  const span = hi - lo || 1;
  const y = (v) => padT + ((hi - v) / span) * plotH;
  const bw = plotW / Math.max(1, bars.length);
  return (
    <Svg w={width} h={height} label={label}>
      {ticks(hi, 4).map((t) => <g key={t}><line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={C.grid} /><text x={padL - 6} y={y(t) + 3} fontSize="9.5" fill={C.ink3} textAnchor="end">{fmt(t)}</text></g>)}
      {bars.map((b, i) => {
        const top = y(Math.max(b.from, b.to)), h = Math.abs(y(b.from) - y(b.to));
        const col = b.total ? C.navy3 : b.value < 0 ? C.green : C.orange;
        return (
          <g key={b.label}>
            <rect x={padL + i * bw + bw * 0.15} y={top} width={bw * 0.7} height={Math.max(1, h)} fill={b.color || col} rx="2"><title>{`${b.label}: ${fmt(b.value)}`}</title></rect>
            <text x={padL + i * bw + bw / 2} y={top - 4} fontSize="9.5" fill={C.ink} textAnchor="middle" fontWeight="600">{b.total ? fmt(b.value) : `${b.value > 0 ? '+' : ''}${fmt(b.value)}`}</text>
            <text x={padL + i * bw + bw / 2} y={height - padB + 14} fontSize="9.5" fill={C.ink2} textAnchor="middle">{trunc(b.label, Math.max(8, Math.floor(bw / 5.8)))}</text>
            {i < bars.length - 1 && <line x1={padL + i * bw + bw * 0.85} x2={padL + (i + 1) * bw + bw * 0.15} y1={y(b.to)} y2={y(b.to)} stroke={C.ink3} strokeDasharray="3 2" />}
          </g>
        );
      })}
      <g transform={`translate(${padL}, ${height - 16})`} fontSize="10.5" fill={C.ink2}>
        <rect width="11" height="11" y="-9" fill={C.navy3} rx="2" /><text x="16" y="0">Total</text>
        <rect x="70" width="11" height="11" y="-9" fill={C.orange} rx="2" /><text x="86" y="0">Increase</text>
        <rect x="160" width="11" height="11" y="-9" fill={C.green} rx="2" /><text x="176" y="0">Decrease</text>
      </g>
    </Svg>
  );
}

const RISK_CELL = (score) => (score >= 20 ? '#e07676' : score >= 12 ? '#f2a67a' : score >= 5 ? '#f7d774' : '#a8d8b4');
export function RiskMatrix({ risks, title, size = 320, likelihoodLabels, impactLabels }) {
  const pad = { l: 64, b: 54, t: title ? 24 : 8, r: 8 };
  const cell = (size - pad.l - pad.r) / 5;
  const w = size, h = pad.t + cell * 5 + pad.b;
  const counts = {};
  for (const r of risks) if (r.l && r.i) counts[`${r.l}|${r.i}`] = [...(counts[`${r.l}|${r.i}`] || []), r.id];
  return (
    <Svg w={w} h={h} label={title || 'Risk matrix'}>
      {title && <text x={pad.l} y={16} fontSize="12" fontWeight="700" fill={C.navy}>{title}</text>}
      {[1, 2, 3, 4, 5].map((l) => [1, 2, 3, 4, 5].map((i) => {
        const ids = counts[`${l}|${i}`] || [];
        const x = pad.l + (i - 1) * cell, y = pad.t + (5 - l) * cell;
        return (
          <g key={`${l}${i}`}>
            <rect x={x} y={y} width={cell - 2} height={cell - 2} fill={RISK_CELL(l * i)} fillOpacity={ids.length ? 1 : 0.4} rx="3"><title>{`Likelihood ${l} × Impact ${i}: ${ids.join(', ') || 'none'}`}</title></rect>
            {ids.length > 0 && <text x={x + cell / 2 - 1} y={y + cell / 2 + 5} fontSize="15" fontWeight="700" fill={C.navy} textAnchor="middle">{ids.length}</text>}
          </g>
        );
      }))}
      {[1, 2, 3, 4, 5].map((l) => <text key={`l${l}`} x={pad.l - 6} y={pad.t + (5 - l) * cell + cell / 2 + 3} fontSize="9" fill={C.ink3} textAnchor="end">{likelihoodLabels ? trunc(likelihoodLabels[l - 1], 11) : l}</text>)}
      {[1, 2, 3, 4, 5].map((i) => <text key={`i${i}`} x={pad.l + (i - 1) * cell + cell / 2} y={pad.t + 5 * cell + 12} fontSize="9" fill={C.ink3} textAnchor="middle">{impactLabels ? trunc(impactLabels[i - 1], 11) : i}</text>)}
      <text x={pad.l + (5 * cell) / 2} y={h - 8} fontSize="10.5" fill={C.ink2} textAnchor="middle" fontWeight="600">Impact</text>
      <text transform={`translate(11, ${pad.t + (5 * cell) / 2}) rotate(-90)`} fontSize="10.5" fill={C.ink2} textAnchor="middle" fontWeight="600">Likelihood</text>
    </Svg>
  );
}
