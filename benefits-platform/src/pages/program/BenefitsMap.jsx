// Benefits map: the program's living Results Chain model (section 4.3, RCM-01…24).
// "Results Chain" is used descriptively; the feature carries a neutral name (constraint C-01).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, personName } from '../../lib/store.jsx';
import { BTOPP, INITIATIVE_TYPES, btoppName } from '../../lib/config.js';
import { layout, modelChecks, wording, backtrace, elementStatus, elementRisk, btoppMix, diffChains, snapshot, nextCode, NODE_W, NODE_H, elById, benefitsBehind, upstream, findCycles } from '../../lib/chain.js';
import { financials } from '../../lib/finance.js';
import { Card, ChecksList, Field, TextInput, TextArea, NumberInput, Select, PersonSelect, MultiChips, Pill, Seg, Modal, Guidance, StackBar, DataTable, useToast } from '../../components/ui.jsx';
import { downloadBlob, downloadJSON, downloadCSV, inlineSvg, svgToPng, printHtml, safeName } from '../../lib/exporters.js';
import { money, todayISO, uid, fmtDate, esc } from '../../lib/util.js';
import { sortChecks } from '../../lib/rules.js';

const TONE = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b', progress: '#3987e5', none: '#b9c0ca' };
const BT_COLOR = { B: '#6250d6', T: '#2a78d6', O: '#eb6834', Pr: '#1baf7a', P: '#e87ba4' };

function wrap(text, max = 27, lines = 3) {
  const out = []; let cur = '';
  for (const w of String(text || '').split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > max) { out.push(cur.trim()); cur = w; } else cur = `${cur} ${w}`;
    if (out.length === lines) break;
  }
  if (out.length < lines && cur.trim()) out.push(cur.trim());
  if (out.length === lines && String(text).length > out.join(' ').length + 1) out[lines - 1] = `${out[lines - 1].slice(0, max - 1)}…`;
  return out;
}

export default function BenefitsMap({ program: p }) {
  const { ws, updateProgram } = useApp();
  const chain = p.chain;
  const [sel, setSel] = useState(null);
  const [linkFrom, setLinkFrom] = useState(null);
  const [mode, setMode] = useState('model');
  const [audience, setAudience] = useState('detailed');
  const [pathId, setPathId] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [zoom, setZoom] = useState(1);
  const [trace, setTrace] = useState(null);
  const [compareId, setCompareId] = useState('');
  const [outline, setOutline] = useState(false);
  const [panel, setPanel] = useState('element');
  const [drag, setDrag] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, toastNode] = useToast();
  const svgRef = useRef(null);

  const upd = (fn, summary, meta = {}) => updateProgram(p.id, (x) => fn(x.chain, x), summary, meta);
  const L = useMemo(() => layout(chain), [chain]);
  const pos = useMemo(() => {
    const out = { ...L.pos };
    if (drag) out[drag.id] = { x: drag.x, y: drag.y };
    return out;
  }, [L, drag]);
  const W = Math.max(L.w, ...Object.values(pos).map((q) => q.x + NODE_W + 40));
  const H = Math.max(L.h, ...Object.values(pos).map((q) => q.y + NODE_H + 40));
  const canvasRef = useRef(null);
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !canvasRef.current) return;
    fitted.current = true;
    const avail = canvasRef.current.clientWidth - 8;
    if (avail > 0 && W > avail) setZoom(Math.max(0.5, Math.floor((avail / W) * 20) / 20));
  });
  const checks = useMemo(() => modelChecks(p, ws), [p, ws]);
  const mix = btoppMix(p);
  const diff = useMemo(() => {
    if (!compareId) return null;
    const v = chain.versions.find((x) => x.id === compareId);
    return v ? diffChains(v.snapshot, snapshot(chain)) : null;
  }, [compareId, chain]);
  const cycles = useMemo(() => new Set(findCycles(chain).flat()), [chain]);

  // Which elements are emphasised (path shading RCM-09, "where do I fit" RCM-10, backtrace RCM-12).
  const path = chain.paths.find((x) => x.id === pathId);
  const emph = useMemo(() => {
    if (trace) return new Set([trace, ...upstream(chain, trace)]);
    if (path) return new Set(path.elementIds);
    if (personFilter) {
      const mine = chain.elements.filter((e) => e.ownerId === personFilter || e.assumption?.monitorId === personFilter).map((e) => e.id);
      return new Set(mine);
    }
    return null;
  }, [trace, path, personFilter, chain]);
  const visible = (e) => !(audience === 'simplified' && e.kind === 'assumption');

  const addElement = (kind, extra = {}) => {
    const id = uid('el');
    upd((c) => {
      c.elements.push({ id, code: nextCode(c, kind), kind, title: kind === 'initiative' ? 'New initiative' : kind === 'outcome' ? (extra.final ? 'New final outcome increased' : 'New outcome increased') : 'New assumption', description: '', final: false, btopp: kind === 'initiative' ? ['T'] : [], initType: '', ownerId: null, importance: null, confidence: null, contingency: '', progress: 0, expected: 0, validation: 'pending', driverIds: [], ...(kind === 'assumption' ? { assumption: { category: 'external', status: 'holding', frequency: 'Monthly', probFalse: 0.1, simImpact: 0.5 } } : {}), ...extra });
      if (sel && elById(c, sel) && kind !== 'assumption') c.links.push({ id: uid('ln'), from: sel, to: id, strength: 'medium', lag: 0, description: '' });
      if (sel && elById(c, sel) && kind === 'assumption') c.links.push({ id: uid('ln'), from: id, to: sel, strength: 'medium', lag: 0, description: '' });
    }, `Added ${kind}`, { action: 'create', object: 'chain-element', objectId: id });
    setSel(id); setPanel('element');
  };
  const connect = (from, to) => {
    if (from === to) return;
    if (chain.links.some((l) => l.from === from && l.to === to)) { toast('Those elements are already linked'); return; }
    const a = elById(chain, from); const b = elById(chain, to);
    if (b?.kind === 'assumption') { toast('Assumptions are conditions: link from the assumption to the element it conditions'); return; }
    if (a?.kind === 'outcome' && b?.kind === 'initiative') toast('Note: outcome → initiative links are unusual (initiatives are actions you take directly)');
    upd((c) => { c.links.push({ id: uid('ln'), from, to, strength: 'medium', lag: 0, description: '' }); }, `Linked ${a?.code} → ${b?.code}`, { object: 'chain-link' });
  };
  const removeElement = (id) => {
    const e = elById(chain, id);
    if (!e || !window.confirm(`Delete ${e.code} “${e.title}” and its links?`)) return;
    upd((c) => { c.elements = c.elements.filter((x) => x.id !== id); c.links = c.links.filter((l) => l.from !== id && l.to !== id); c.paths.forEach((pa) => { pa.elementIds = pa.elementIds.filter((x) => x !== id); }); }, `Deleted ${e.code}`, { action: 'delete', object: 'chain-element', objectId: id });
    setSel(null);
  };

  const onNodeDown = (e, el) => {
    if (linkFrom) return;
    const pt = toSvg(e);
    const start = pos[el.id];
    setDrag({ id: el.id, x: start.x, y: start.y, dx: pt.x - start.x, dy: pt.y - start.y, moved: false, sx: pt.x, sy: pt.y });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const toSvg = (e) => { const r = svgRef.current.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }; };
  const onMove = (e) => {
    if (!drag) return;
    const pt = toSvg(e);
    const moved = drag.moved || Math.abs(pt.x - drag.sx) + Math.abs(pt.y - drag.sy) > 4;
    setDrag({ ...drag, x: Math.max(0, pt.x - drag.dx), y: Math.max(0, pt.y - drag.dy), moved });
  };
  const onUp = () => {
    if (!drag) return;
    if (drag.moved) upd((c) => { const el = elById(c, drag.id); el.x = Math.round(drag.x); el.y = Math.round(drag.y); el.pinned = true; }, 'Moved element', { field: `pos:${drag.id}` });
    else clickNode(drag.id);
    setDrag(null);
  };
  const clickNode = (id) => {
    if (linkFrom) { connect(linkFrom, id); setLinkFrom(null); return; }
    setSel(id); setPanel('element'); setTrace(null);
  };
  const onKey = (e, el) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickNode(el.id); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel === el.id) removeElement(el.id);
    if (e.key === 'l' && sel === el.id) { setLinkFrom(el.id); toast('Link mode: choose the element this one contributes to'); }
    const step = e.shiftKey ? 40 : 10;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv && sel === el.id) { e.preventDefault(); upd((c) => { const x = elById(c, el.id); x.x = Math.max(0, (pos[el.id].x) + mv[0]); x.y = Math.max(0, (pos[el.id].y) + mv[1]); x.pinned = true; }, 'Moved element', { field: `pos:${el.id}` }); }
  };

  const exportSvg = () => downloadBlob(inlineSvg(svgRef.current), `${safeName(p.name)}_benefits_map.svg`, 'image/svg+xml');
  const exportPng = async () => { const r = svgRef.current.getBoundingClientRect(); downloadBlob(await svgToPng(inlineSvg(svgRef.current), r.width, r.height, 2), `${safeName(p.name)}_benefits_map.png`, 'image/png'); };
  const exportPoster = (size) => {
    const svg = inlineSvg(svgRef.current);
    printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.name)} — benefits map</title><style>@page{size:${size} landscape;margin:12mm}body{font-family:Inter,Arial,sans-serif;margin:0}h1{font-size:20pt;color:#0b1f3a;margin:0 0 4mm}p{color:#4a5768;margin:0 0 6mm}svg{width:100%;height:auto}</style></head><body><h1>${esc(p.code)} ${esc(p.name)} — benefits map</h1><p>${esc(ws.settings.orgName)} · printed ${fmtDate(todayISO())} · Results Chain notation (after Thorp, <em>The Information Paradox</em>)</p>${svg}</body></html>`);
  };

  const selected = sel ? elById(chain, sel) : null;
  const finFull = useMemo(() => financials(p, ws), [p, ws]);

  return (
    <div className="stack">
      <div className="map-toolbar no-print" role="toolbar" aria-label="Benefits map tools">
        <button className="btn btn-sm" onClick={() => addElement('initiative')}>+ Initiative</button>
        <button className="btn btn-sm" onClick={() => addElement('outcome')}>+ Outcome</button>
        <button className="btn btn-sm" onClick={() => addElement('outcome', { final: true, title: 'New final outcome increased' })}>+ Final outcome</button>
        <button className="btn btn-sm" onClick={() => addElement('assumption')}>+ Assumption</button>
        <button className={`btn btn-sm ${linkFrom ? 'btn-navy' : ''}`} disabled={!sel && !linkFrom} onClick={() => { if (linkFrom) setLinkFrom(null); else { setLinkFrom(sel); toast('Choose the element this one contributes to'); } }}>{linkFrom ? 'Cancel link' : '→ Link from selected'}</button>
        <span className="sep" />
        <Seg value={mode} onChange={setMode} label="View" options={[['model', 'Model'], ['scorecard', 'Scorecard'], ['accountability', 'Owners'], ['risk', 'Risk'], ['validation', 'Validation']]} />
        <select value={audience} onChange={(e) => setAudience(e.target.value)} aria-label="Audience view"><option value="detailed">Detailed view</option><option value="business">Business view</option><option value="simplified">Simplified (external)</option></select>
        <select value={pathId} onChange={(e) => { setPathId(e.target.value); setTrace(null); }} aria-label="Shade a benefits path"><option value="">All paths</option>{chain.paths.map((x) => <option key={x.id} value={x.id}>{x.name}{x.selected ? ' ✓' : ''}</option>)}</select>
        <select value={personFilter} onChange={(e) => { setPersonFilter(e.target.value); setTrace(null); }} aria-label="Where do I fit"><option value="">Where do I fit? (person)</option>{ws.people.filter((x) => chain.elements.some((e) => e.ownerId === x.id || e.assumption?.monitorId === x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <span className="sep" />
        <button className="btn btn-sm" onClick={() => setZoom(Math.max(0.4, zoom - 0.1))} aria-label="Zoom out">−</button>
        <span className="mini">{Math.round(zoom * 100)}%</span>
        <button className="btn btn-sm" onClick={() => setZoom(Math.min(1.6, zoom + 0.1))} aria-label="Zoom in">+</button>
        <button className="btn btn-sm" onClick={() => { const avail = (canvasRef.current?.clientWidth || 800) - 8; setZoom(Math.min(1, Math.max(0.4, Math.floor((avail / W) * 20) / 20))); }}>Fit</button>
        <button className="btn btn-sm" onClick={() => upd((c) => { c.elements.forEach((e) => { e.pinned = false; }); }, 'Auto-layout')}>Auto-layout</button>
        <button className={`btn btn-sm ${outline ? 'btn-navy' : ''}`} onClick={() => setOutline(!outline)}>{outline ? 'Canvas' : 'Outline view'}</button>
      </div>

      <div className="map-shell">
        <div>
          {outline ? <OutlineView p={p} onSelect={(id) => { setSel(id); setOutline(false); }} /> : (
            <div className="map-canvas" ref={canvasRef} onPointerMove={onMove} onPointerUp={onUp}>
              <svg ref={svgRef} width={W * zoom} height={H * zoom} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Benefits map for ${p.name}: ${chain.elements.length} elements and ${chain.links.length} contributions. Use Tab to move between elements and Enter to select.`} style={{ fontFamily: 'Inter, Arial, sans-serif' }} onClick={(e) => { if (e.target === svgRef.current) { setSel(null); setTrace(null); } }}>
                <defs>
                  <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5b6b80" /></marker>
                  <marker id="arr-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c98500" /></marker>
                </defs>
                {chain.links.map((l) => {
                  const a = elById(chain, l.from); const b = elById(chain, l.to);
                  if (!a || !b || !pos[a.id] || !pos[b.id] || !visible(a) || !visible(b)) return null;
                  const pa = pos[a.id]; const pb = pos[b.id];
                  const asm = a.kind === 'assumption';
                  let d;
                  if (asm) { const x1 = pa.x + NODE_W / 2; const y1 = pa.y + NODE_H; const x2 = pb.x + NODE_W / 2; const y2 = pb.y; d = `M${x1},${y1} C${x1},${y1 + 20} ${x2},${y2 - 20} ${x2},${y2 - 2}`; } else {
                    const x1 = pa.x + NODE_W; const y1 = pa.y + NODE_H / 2; const x2 = pb.x; const y2 = pb.y + NODE_H / 2;
                    const back = x2 < x1 + 10;
                    d = back ? `M${x1},${y1} C${x1 + 60},${y1 + 90} ${x2 - 60},${y2 + 90} ${x2 - 2},${y2}` : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2 - 2},${y2}`;
                  }
                  const faded = emph && !(emph.has(a.id) && emph.has(b.id));
                  const added = diff?.linksAdded.some((x) => x.from === l.from && x.to === l.to);
                  return (
                    <g key={l.id} className={faded ? 'faded' : ''}>
                      <path d={d} fill="none" stroke={asm ? '#c98500' : added ? '#0ca30c' : cycles.has(l.from) && cycles.has(l.to) ? '#d03b3b' : '#5b6b80'} strokeWidth={asm ? 1.5 : { high: 2.6, medium: 1.8, low: 1.1 }[l.strength] || 1.8} strokeDasharray={asm ? '5 4' : undefined} markerEnd={`url(#${asm ? 'arr-a' : 'arr'})`} />
                      {!asm && mode === 'model' && audience === 'detailed' && l.lag > 0 && (() => { const mx = (pa.x + NODE_W + pb.x) / 2; const my = (pa.y + pb.y) / 2 + NODE_H / 2 - 6; return <text x={mx} y={my} fontSize="9.5" fill="#7b8796" textAnchor="middle">{l.lag} mo</text>; })()}
                    </g>
                  );
                })}
                {chain.elements.filter(visible).map((e) => {
                  const q = pos[e.id]; if (!q) return null;
                  const faded = emph && !emph.has(e.id);
                  const st = elementStatus(e);
                  const isSel = sel === e.id;
                  const added = diff?.added.some((x) => x.id === e.id); const changed = diff?.changed.some((x) => x.after.id === e.id);
                  let fill = e.kind === 'initiative' ? '#e8f1fc' : e.kind === 'assumption' ? '#fff6dc' : e.final ? '#d4f0e5' : '#e6f6f0';
                  let stroke = e.kind === 'initiative' ? '#2a78d6' : e.kind === 'assumption' ? '#c98500' : '#148a61';
                  if (mode === 'scorecard' && st) { stroke = TONE[st.tone]; fill = '#ffffff'; }
                  if (mode === 'validation') stroke = { validated: '#0ca30c', pending: '#b9c0ca', challenged: '#d03b3b' }[e.validation || 'pending'];
                  if (mode === 'risk') { const r = elementRisk(e); stroke = r === 'Contingency plan required' ? (e.contingency ? '#fab219' : '#d03b3b') : r === 'Mitigation plan' ? '#fab219' : r ? '#0ca30c' : '#b9c0ca'; }
                  if (added) stroke = '#0ca30c'; else if (changed) stroke = '#e8a200';
                  const lines = wrap(e.title, e.kind === 'outcome' ? 25 : 27, 2);
                  const shape = e.kind === 'outcome'
                    ? <rect x="0" y="0" width={NODE_W} height={NODE_H} rx={NODE_H / 2} fill={fill} stroke={stroke} strokeWidth={isSel ? 3 : e.final ? 2.5 : 1.5} />
                    : e.kind === 'assumption'
                      ? <path d={`M14,0 H${NODE_W} L${NODE_W - 14},${NODE_H} H0 Z`} fill={fill} stroke={stroke} strokeWidth={isSel ? 3 : 1.5} strokeDasharray="5 3" />
                      : <rect x="0" y="0" width={NODE_W} height={NODE_H} rx="4" fill={fill} stroke={stroke} strokeWidth={isSel ? 3 : 1.5} />;
                  const sub = mode === 'scorecard' ? `${st?.icon || ''} ${st?.label || ''}` : mode === 'accountability' ? `${e.kind === 'assumption' ? 'Monitor' : e.kind === 'initiative' ? 'Delivery' : 'Owner'}: ${personName(ws, e.kind === 'assumption' ? e.assumption?.monitorId : e.ownerId)}` : mode === 'risk' ? (elementRisk(e) ? `${e.importance?.[0]?.toUpperCase()}/${e.confidence?.[0]?.toUpperCase()} · ${elementRisk(e)}` : 'Importance/confidence not rated') : mode === 'validation' ? `${{ validated: '✓ Validated', pending: '○ Pending', challenged: '✕ Challenged' }[e.validation || 'pending']}${e.consensus ? ` · ${e.consensus}` : ''}` : audience === 'detailed' ? (e.kind === 'initiative' ? `${(e.btopp || []).join(' ')}${e.initType ? ` · ${e.initType}` : ''}` : e.kind === 'assumption' ? `${e.assumption?.category || ''} · ${{ holding: '✓ holding', 'at-risk': '! at risk', invalid: '✕ invalid' }[e.assumption?.status || 'holding']}` : e.final ? 'FINAL OUTCOME' : '') : '';
                  return (
                    <g key={e.id} className={`node ${faded ? 'faded' : ''}`} transform={`translate(${q.x},${q.y})`} tabIndex={0} role="button" aria-label={`${e.kind}${e.final ? ' (final)' : ''} ${e.code}: ${e.title}. ${sub}`} aria-pressed={isSel} onPointerDown={(ev) => onNodeDown(ev, e)} onKeyDown={(ev) => onKey(ev, e)}>
                      {e.final && e.kind === 'outcome' && <rect x="-4" y="-4" width={NODE_W + 8} height={NODE_H + 8} rx={NODE_H / 2 + 4} fill="none" stroke={stroke} strokeWidth="1.2" />}
                      {shape}
                      {mode === 'scorecard' && e.kind !== 'assumption' && <rect x="2" y={NODE_H - 6} width={(NODE_W - 4) * Math.min(1, (Number(e.progress) || 0) / 100)} height="4" rx="2" fill={TONE[st?.tone] || '#b9c0ca'} />}
                      <text x="12" y="15" fontSize="10" fontWeight="700" fill="#4a5768">{e.code}</text>
                      {e.kind === 'initiative' && (e.btopp || []).map((b, i) => <g key={b}><rect x={NODE_W - 22 - i * 22} y="5" width="19" height="13" rx="3" fill={BT_COLOR[b]} /><text x={NODE_W - 12.5 - i * 22} y="14.5" fontSize="8.5" fontWeight="700" fill="#fff" textAnchor="middle">{b}</text></g>)}
                      {lines.map((ln, i) => <text key={i} x={e.kind === 'outcome' ? NODE_W / 2 : 12} y={31 + i * 13} fontSize="11.5" fontWeight="600" fill="#16212f" textAnchor={e.kind === 'outcome' ? 'middle' : 'start'}>{ln}</text>)}
                      {sub && <text x={e.kind === 'outcome' ? NODE_W / 2 : 12} y={NODE_H - 9} fontSize="9.5" fill="#4a5768" textAnchor={e.kind === 'outcome' ? 'middle' : 'start'}>{sub.length > 36 ? `${sub.slice(0, 35)}…` : sub}</text>}
                      {e.emergent && <text x={NODE_W - 10} y="15" fontSize="9" fill="#6250d6" textAnchor="end" fontWeight="700">EMERGENT</text>}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
          <div className="map-legend">
            <span><svg width="26" height="14"><rect x="1" y="1" width="24" height="12" rx="2" fill="#e8f1fc" stroke="#2a78d6" /></svg>Initiative (action we take)</span>
            <span><svg width="26" height="14"><rect x="1" y="1" width="24" height="12" rx="6" fill="#e6f6f0" stroke="#148a61" /></svg>Intermediate outcome</span>
            <span><svg width="30" height="16"><rect x="1" y="1" width="28" height="14" rx="7" fill="none" stroke="#148a61" /><rect x="3" y="3" width="24" height="10" rx="5" fill="#d4f0e5" stroke="#148a61" strokeWidth="2" /></svg>Final outcome (benefit)</span>
            <span><svg width="28" height="14"><path d="M5,1 H27 L23,13 H1 Z" fill="#fff6dc" stroke="#c98500" strokeDasharray="3 2" /></svg>Assumption</span>
            <span><svg width="30" height="10"><line x1="0" y1="5" x2="26" y2="5" stroke="#5b6b80" strokeWidth="2.4" /><path d="M24,1 L30,5 L24,9z" fill="#5b6b80" /></svg>Contribution (thicker = stronger)</span>
            {BTOPP.map((b) => <span key={b.id}><i style={{ display: 'inline-block', width: 14, height: 10, borderRadius: 2, background: BT_COLOR[b.id] }} /> {b.id} {b.name}</span>)}
          </div>
          <p className="mini" style={{ marginTop: 6 }}>Keyboard: Tab to an element, Enter to select, arrows to move (Shift for larger steps), L to start a link, Delete to remove. Drag elements to arrange; Auto-layout restores the left-to-right layout. Modelling technique after the Results Chain in Thorp, <em>The Information Paradox</em> (2007).</p>
        </div>

        <div className="stack">
          <div className="tabs sub" role="tablist">
            {[['element', 'Element'], ['checks', `Checks (${checks.length})`], ['paths', 'Paths'], ['versions', 'Versions'], ['workshop', 'Workshop'], ['more', 'More']].map(([k, l]) => <button key={k} role="tab" aria-selected={panel === k} className={panel === k ? 'active' : ''} onClick={() => setPanel(k)}>{l}</button>)}
          </div>
          {panel === 'element' && (selected ? <ElementEditor p={p} el={selected} upd={upd} onDelete={() => removeElement(selected.id)} onTrace={() => setTrace(trace === selected.id ? null : selected.id)} tracing={trace === selected.id} finFull={finFull} onSelect={setSel} /> : <Card><div className="empty-sm">Select an element to edit it, or add one with the toolbar. New elements link from the selected element.</div></Card>)}
          {panel === 'checks' && <Card title="Modelling rules" subtitle="RCM-04 — errors and warnings never stop you saving"><ChecksList checks={sortChecks(checks)} /></Card>}
          {panel === 'paths' && <PathsPanel p={p} upd={upd} sel={sel} onShade={setPathId} />}
          {panel === 'versions' && <VersionsPanel p={p} upd={upd} compareId={compareId} setCompareId={setCompareId} diff={diff} />}
          {panel === 'workshop' && <WorkshopPanel p={p} addElement={addElement} />}
          {panel === 'more' && (
            <Card title="Balance and exports">
              <div className="section-title" style={{ marginTop: 0 }}>BTOPP mix (RCM-05)</div>
              <div className="mini">By number of initiatives</div>
              <StackBar segments={BTOPP.map((b) => ({ label: b.name, value: Math.round((mix.count[b.id] || 0) * 10) / 10, color: BT_COLOR[b.id] }))} />
              <div className="mini" style={{ marginTop: 10 }}>By cost</div>
              <StackBar segments={BTOPP.map((b) => ({ label: b.name, value: mix.cost[b.id] || 0, color: BT_COLOR[b.id] }))} format={(v) => money(v)} />
              <p className="mini">Organisation, process and people: {Math.round(mix.oppShareCount * 100)}% of initiatives, {Math.round(mix.oppShareCost * 100)}% of cost. The source observes that most of the work in so-called IT projects sits here.</p>
              <div className="section-title">Export (RCM-19)</div>
              <div className="btn-row dl">
                <button className="btn btn-sm" onClick={exportSvg} disabled={outline}>SVG</button>
                <button className="btn btn-sm" onClick={exportPng} disabled={outline}>PNG</button>
                <button className="btn btn-sm" onClick={() => downloadJSON(snapshot(chain), `${safeName(p.name)}_benefits_map.json`)}>JSON</button>
                <button className="btn btn-sm" onClick={() => { downloadCSV(chain.elements, [{ label: 'Code', get: (e) => e.code }, { label: 'Type', get: (e) => (e.final ? 'final outcome' : e.kind) }, { label: 'Title', get: (e) => e.title }, { label: 'BTOPP', get: (e) => (e.btopp || []).join(' ') }, { label: 'Owner', get: (e) => personName(ws, e.ownerId) }, { label: 'Importance', get: (e) => e.importance }, { label: 'Confidence', get: (e) => e.confidence }, { label: 'Status', get: (e) => elementStatus(e)?.label }], `${safeName(p.name)}_elements.csv`); downloadCSV(chain.links, [{ label: 'From', get: (l) => elById(chain, l.from)?.code }, { label: 'To', get: (l) => elById(chain, l.to)?.code }, { label: 'Strength', get: (l) => l.strength }, { label: 'Lag (months)', get: (l) => l.lag }, { label: 'Description', get: (l) => l.description }], `${safeName(p.name)}_contributions.csv`); }}>CSV</button>
              </div>
              <div className="btn-row dl" style={{ marginTop: 8 }}>{['A3', 'A2', 'A1', 'A0'].map((s) => <button key={s} className="btn btn-sm" disabled={outline} onClick={() => exportPoster(s)}>{s} poster (PDF)</button>)}</div>
              <p className="hosted-note mini">Downloads and printing are unavailable in this hosted preview.</p>
              <div className="section-title">Pattern library (RCM-20)</div>
              <div className="btn-row">{PATTERNS.map((pt) => <button key={pt.name} className="btn btn-sm" onClick={() => setModal(pt)}>{pt.name}</button>)}</div>
            </Card>
          )}
        </div>
      </div>
      {modal && (
        <Modal title={`Insert pattern: ${modal.name}`} onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={() => {
          upd((c) => {
            const map = {};
            for (const [code, kind, title, extra] of modal.elements) { const id = uid('el'); map[code] = id; c.elements.push({ id, code: nextCode(c, kind), kind, title, description: '', final: false, btopp: [], initType: '', ownerId: null, importance: null, confidence: null, contingency: '', progress: 0, expected: 0, validation: 'pending', driverIds: [], ...(kind === 'assumption' ? { assumption: { category: 'external', status: 'holding', probFalse: 0.1, simImpact: 0.5 } } : {}), ...extra }); }
            for (const [f, t, strength] of modal.links) c.links.push({ id: uid('ln'), from: map[f], to: map[t], strength: strength || 'medium', lag: 0, description: '' });
          }, `Inserted pattern ${modal.name}`);
          setModal(null);
        }}>Insert</button></>}>
          <p>{modal.description}</p>
          <ul>{modal.elements.map(([code, kind, title]) => <li key={code}><strong>{kind}</strong>: {title}</li>)}</ul>
          <p className="mini">Patterns are starting points to adapt in a workshop, not answers.</p>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}

function ElementEditor({ p, el, upd, onDelete, onTrace, tracing, finFull, onSelect }) {
  const { ws } = useApp();
  const chain = p.chain;
  const set = (k, label) => (v) => upd((c) => { elById(c, el.id)[k] = v; }, label || `Edited ${el.code} ${k}`, { object: 'chain-element', objectId: el.id, field: `${el.id}:${k}` });
  const setA = (k) => (v) => upd((c) => { const x = elById(c, el.id); x.assumption = { ...(x.assumption || {}), [k]: v }; }, `Edited assumption ${el.code} ${k}`, { object: 'chain-element', objectId: el.id, field: `${el.id}:a:${k}` });
  const w = el.kind === 'outcome' ? wording(el.title) : null;
  const risk = elementRisk(el);
  const out = chain.links.filter((l) => l.from === el.id); const inc = chain.links.filter((l) => l.to === el.id);
  const behind = el.kind === 'assumption' ? benefitsBehind(p, el.id) : [];
  const var_ = behind.length ? finFull.npv - financials(p, ws, { drop: new Set(behind.map((b) => b.id)) }).npv : 0;
  const trace = el.kind === 'outcome' && tracing ? backtrace(p, el.id) : [];
  const linkedBenefits = (p.benefits || []).filter((b) => b.outcomeId === el.id);
  return (
    <Card title={`${el.code} · ${el.kind === 'outcome' ? (el.final ? 'Final outcome' : 'Intermediate outcome') : el.kind === 'initiative' ? 'Initiative' : 'Assumption'}`} actions={<button className="btn btn-sm btn-danger" onClick={onDelete}>Delete</button>}>
      <div className="stack" style={{ gap: 10 }}>
        <Field label="Title"><TextInput value={el.title} onChange={set('title')} /></Field>
        {w && (w.ok ? <span className="mini pos">✓ Measurable wording (“{w.medic}”)</span> : <span className="mini sev-warning">! {w.vague.length ? `Vague: ${w.vague.join(', ')}. ` : ''}Use MEDIC — maintained, eliminated, decreased, increased or created.</span>)}
        <Field label="Description"><TextArea value={el.description} onChange={set('description')} rows={2} /></Field>
        {el.kind === 'outcome' && <>
          <label className="check"><input type="checkbox" checked={Boolean(el.final)} onChange={(e) => set('final', 'Toggled final outcome')(e.target.checked)} /> Final outcome (benefit to harvest)</label>
          {el.final && <Field label="Strategic drivers (STR-04)"><MultiChips options={ws.drivers.map((d) => [d.id, d.name])} value={el.driverIds || []} onChange={set('driverIds')} /></Field>}
          <Field label="Outcome owner"><PersonSelect ws={ws} value={el.ownerId} onChange={set('ownerId', 'Assigned outcome owner')} /></Field>
          <div className="form-grid"><Field label="Expected by now (%)"><NumberInput value={el.expected} onChange={set('expected')} min={0} max={100} /></Field><Field label="Achieved (%)"><NumberInput value={el.progress} onChange={set('progress')} min={0} max={100} /></Field></div>
          <div className="mini">Benefit records: {linkedBenefits.length ? linkedBenefits.map((b) => b.title).join('; ') : 'none — add one on the Benefits tab'}</div>
          <label className="check"><input type="checkbox" checked={Boolean(el.emergent)} onChange={(e) => set('emergent', 'Marked emergent')(e.target.checked ? { source: '', date: todayISO() } : null)} /> Emergent outcome (not originally targeted, RCM-24)</label>
          {el.emergent && <div className="form-grid"><Field label="Discovered from"><TextInput value={el.emergent.source} onChange={(v) => set('emergent')({ ...el.emergent, source: v })} /></Field><Field label="Date"><input type="date" value={el.emergent.date} onChange={(e) => set('emergent')({ ...el.emergent, date: e.target.value })} /></Field></div>}
          <button className={`btn btn-sm ${tracing ? 'btn-navy' : ''}`} onClick={onTrace}>{tracing ? 'Stop tracing' : 'Trace back (root cause)'}</button>
          {tracing && <div><div className="mini" style={{ marginBottom: 4 }}>Contributors ordered by contribution strength (RCM-12):</div>{trace.map((r) => { const st = elementStatus(r.el); return <div key={r.el.id} className="check-row" style={{ cursor: 'pointer' }} onClick={() => onSelect(r.el.id)}><span className="ic" style={{ color: TONE[st?.tone] }}>{st?.icon}</span><span><strong>{r.el.code}</strong> {r.el.title}<div className="mini">{st?.label} · via {r.via?.code}</div></span><span className="rule">{Math.round(r.weight * 100)}%</span></div>; })}</div>}
        </>}
        {el.kind === 'initiative' && <>
          <Field label="BTOPP elements (RCM-05)"><MultiChips options={BTOPP.map((b) => [b.id, `${b.id} ${b.name}`])} value={el.btopp || []} onChange={set('btopp')} /></Field>
          <div className="form-grid">
            <Field label="Initiative type"><Select value={el.initType} onChange={set('initType')} placeholder="—" options={INITIATIVE_TYPES} /></Field>
            <Field label="Delivered by project (RCM-08)"><Select value={el.projectId} onChange={set('projectId')} placeholder="—" options={p.projects.map((x) => [x.id, x.name])} /></Field>
          </div>
          <Field label="Delivery owner"><PersonSelect ws={ws} value={el.ownerId} onChange={set('ownerId', 'Assigned delivery owner')} /></Field>
          <Field label="Implemented (%)"><NumberInput value={el.progress} onChange={set('progress')} min={0} max={100} /></Field>
          <Field label="Stakeholder groups targeted (CHG-04)"><MultiChips options={(p.stakeholders || []).map((s) => [s.id, s.name])} value={el.targetGroups || []} onChange={set('targetGroups')} /></Field>
        </>}
        {el.kind === 'assumption' && <>
          <div className="form-grid">
            <Field label="Category"><Select value={el.assumption?.category} onChange={setA('category')} options={[['external', 'External (regulation, market, economy)'], ['internal', 'Internal (culture, motivation)']]} /></Field>
            <Field label="Sub-category"><TextInput value={el.assumption?.sub} onChange={setA('sub')} /></Field>
            <Field label="Monitor"><PersonSelect ws={ws} value={el.assumption?.monitorId} onChange={setA('monitorId')} /></Field>
            <Field label="Review frequency"><Select value={el.assumption?.frequency} onChange={setA('frequency')} options={['Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Six-monthly']} /></Field>
            <Field label="Test method" className="full"><TextInput value={el.assumption?.test} onChange={setA('test')} /></Field>
            <Field label="Indicator" className="full"><TextInput value={el.assumption?.indicator} onChange={setA('indicator')} /></Field>
            <Field label="Status"><Select value={el.assumption?.status || 'holding'} onChange={setA('status')} options={[['holding', '✓ Holding'], ['at-risk', '! At risk'], ['invalid', '✕ Invalid']]} /></Field>
            <Field label="Next review"><input type="date" value={el.assumption?.nextReview || ''} onChange={(e) => setA('nextReview')(e.target.value)} /></Field>
            <Field label="Impact if false" className="full"><TextArea rows={2} value={el.assumption?.impact} onChange={setA('impact')} /></Field>
            <Field label="Probability false (simulation)" hint="0–1"><NumberInput value={el.assumption?.probFalse} onChange={setA('probFalse')} min={0} max={1} step={0.05} /></Field>
            <Field label="Benefit lost if false" hint="0–1"><NumberInput value={el.assumption?.simImpact} onChange={setA('simImpact')} min={0} max={1} step={0.05} /></Field>
          </div>
          {behind.length > 0 && <div className={el.assumption?.status === 'holding' ? 'guidance' : 'callout warn'}><strong>Value at risk (RCM-22):</strong> {money(var_)} of NPV across {behind.map((b) => `“${b.title}”`).join(', ')}.{el.assumption?.status !== 'holding' && <> <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => upd((c, x) => { x.gates.push({ id: uid('g'), gate: 'BR', planned: todayISO(), held: null, checklist: {}, decision: null, eventTriggered: `Assumption ${el.code} ${el.assumption?.status}` }); }, `Event-triggered review scheduled (assumption ${el.code})`)}>Schedule event-triggered review</button></>}</div>}
        </>}
        <div className="form-grid">
          <Field label="Importance of contribution"><Select value={el.importance} onChange={set('importance')} placeholder="—" options={[['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} /></Field>
          <Field label="Confidence it can be achieved"><Select value={el.confidence} onChange={set('confidence')} placeholder="—" options={[['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} /></Field>
        </div>
        {risk && <div className="mini">Element risk (7.2.5): <Pill tone={risk === 'Contingency plan required' ? (el.contingency ? 'warning' : 'critical') : risk === 'Mitigation plan' ? 'warning' : 'good'}>{risk}</Pill></div>}
        {(risk === 'Contingency plan required' || el.contingency) && <Field label="Contingency plan (BR-13)"><TextArea rows={2} value={el.contingency} onChange={set('contingency')} /></Field>}
        <div className="form-grid">
          <Field label="Validation (RCM-18)"><Select value={el.validation || 'pending'} onChange={set('validation')} options={[['pending', 'Pending'], ['validated', 'Validated'], ['challenged', 'Challenged']]} /></Field>
          <Field label="Workshop consensus"><Select value={el.consensus} onChange={set('consensus')} placeholder="—" options={['Agreed', 'Needs discussion', 'Parked']} /></Field>
        </div>
        {chain.paths.length > 0 && <Field label="Benefits paths"><MultiChips options={chain.paths.map((x) => [x.id, x.name.split('—')[0].trim()])} value={chain.paths.filter((x) => x.elementIds.includes(el.id)).map((x) => x.id)} onChange={(ids) => upd((c) => { c.paths.forEach((pa) => { const has = pa.elementIds.includes(el.id); if (ids.includes(pa.id) && !has) pa.elementIds.push(el.id); if (!ids.includes(pa.id) && has) pa.elementIds = pa.elementIds.filter((x) => x !== el.id); }); }, 'Changed path membership')} /></Field>}

        <div className="section-title" style={{ margin: '6px 0 0' }}>Contributions</div>
        {[...inc.map((l) => ({ l, dir: 'from', other: elById(chain, l.from) })), ...out.map((l) => ({ l, dir: 'to', other: elById(chain, l.to) }))].map(({ l, dir, other }) => (
          <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 82px 54px 24px', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
            <span title={other?.title}>{dir === 'from' ? '← ' : '→ '}<strong>{other?.code}</strong> {other?.title?.slice(0, 26)}</span>
            <select value={l.strength} onChange={(e) => upd((c) => { c.links.find((x) => x.id === l.id).strength = e.target.value; }, 'Changed contribution strength')} aria-label="Strength"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
            <input type="number" value={l.lag} min={0} onChange={(e) => upd((c) => { c.links.find((x) => x.id === l.id).lag = Number(e.target.value) || 0; }, 'Changed contribution lag', { field: `lag:${l.id}` })} aria-label="Lag in months" title="Expected lag (months)" />
            <button className="btn btn-ghost btn-sm" aria-label="Remove contribution" onClick={() => upd((c) => { c.links = c.links.filter((x) => x.id !== l.id); }, 'Removed contribution')}>✕</button>
          </div>
        ))}
        <select value="" onChange={(e) => { if (!e.target.value) return; upd((c) => { c.links.push(el.kind === 'assumption' ? { id: uid('ln'), from: el.id, to: e.target.value, strength: 'medium', lag: 0, description: '' } : { id: uid('ln'), from: el.id, to: e.target.value, strength: 'medium', lag: 0, description: '' }); }, 'Added contribution'); }} aria-label="Add a contribution">
          <option value="">{el.kind === 'assumption' ? '+ Attach to element…' : '+ Contributes to…'}</option>
          {chain.elements.filter((x) => x.id !== el.id && x.kind !== 'assumption' && !out.some((l) => l.to === x.id)).map((x) => <option key={x.id} value={x.id}>{x.code} {x.title}</option>)}
        </select>
      </div>
    </Card>
  );
}

function PathsPanel({ p, upd, sel, onShade }) {
  const { ws } = useApp();
  const chain = p.chain;
  const [choosing, setChoosing] = useState(null);
  const rows = chain.paths.map((pa) => {
    const f = financials(p, ws, { pathId: pa.id });
    const els = pa.elementIds.map((id) => elById(chain, id)).filter(Boolean);
    const risky = els.filter((e) => e.kind === 'assumption' && e.assumption?.status !== 'holding').length + els.filter((e) => e.confidence === 'low').length;
    const firstBenefit = f.benefitLines.map((l) => l.series.findIndex((v) => v > 0)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
    return { pa, f, risky, firstBenefit };
  });
  return (
    <Card title="Benefits paths (RCM-07)" subtitle="Named routes to final outcomes; compare, select and switch with history" actions={<button className="btn btn-sm" onClick={() => upd((c) => { c.paths.push({ id: uid('path'), name: `Path ${String.fromCharCode(65 + c.paths.length)}`, exclusiveGroup: c.paths[0]?.exclusiveGroup || 'group-1', selected: false, rationale: '', elementIds: sel ? [sel] : [], history: [] }); }, 'Added benefits path')}>+ Path</button>}>
      {!rows.length ? <div className="empty-sm">No paths. Use paths when the same capability can be used in different, possibly incompatible ways.</div> : (
        <>
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Path</th><th className="num">Cost</th><th className="num">NPV</th><th className="num">Risk flags</th><th>First benefit</th></tr></thead>
            <tbody>{rows.map(({ pa, f, risky, firstBenefit }) => <tr key={pa.id} className="clickable" onClick={() => onShade(pa.id)}><td>{pa.selected && <Pill tone="good">Selected</Pill>} <strong>{pa.name}</strong><div className="mini">{pa.exclusiveGroup ? `Exclusive group: ${pa.exclusiveGroup}` : 'Not exclusive'} · {pa.elementIds.length} elements</div></td><td className="num">{money(f.totalCosts)}</td><td className={`num ${f.npv < 0 ? 'neg' : ''}`}>{money(f.npv)}</td><td className="num">{risky}</td><td>{firstBenefit === undefined ? '—' : fmtDate(new Date(Date.UTC(Number(f.startISO.slice(0, 4)), Number(f.startISO.slice(5, 7)) - 1 + firstBenefit, 1)).toISOString())}</td></tr>)}</tbody>
          </table></div>
          {rows.map(({ pa }) => (
            <div key={pa.id} style={{ borderTop: '1px dashed var(--line)', padding: '10px 0' }}>
              <div className="form-grid">
                <Field label="Name"><TextInput value={pa.name} onChange={(v) => upd((c) => { c.paths.find((x) => x.id === pa.id).name = v; }, 'Renamed path', { field: `path:${pa.id}` })} /></Field>
                <Field label="Mutually exclusive group"><TextInput value={pa.exclusiveGroup} onChange={(v) => upd((c) => { c.paths.find((x) => x.id === pa.id).exclusiveGroup = v; }, 'Changed exclusive group', { field: `pathg:${pa.id}` })} /></Field>
              </div>
              <div className="row" style={{ marginTop: 6 }}>{!pa.selected && <button className="btn btn-sm btn-primary" onClick={() => setChoosing({ id: pa.id, rationale: '' })}>Select this path…</button>}{pa.rationale && <span className="mini">Rationale: {pa.rationale}</span>}</div>
              {(pa.history || []).length > 0 && <div className="mini" style={{ marginTop: 4 }}>History: {pa.history.map((h) => `${fmtDate(h.date)} ${h.selected ? 'selected' : 'deselected'} by ${personName(ws, h.by)}`).join('; ')}</div>}
            </div>
          ))}
        </>
      )}
      {choosing && (
        <Modal title="Select benefits path" onClose={() => setChoosing(null)} footer={<><button className="btn" onClick={() => setChoosing(null)}>Cancel</button><button className="btn btn-primary" disabled={!choosing.rationale.trim()} onClick={() => {
          upd((c, x) => {
            const pa = c.paths.find((q) => q.id === choosing.id);
            for (const o of c.paths.filter((q) => q.exclusiveGroup === pa.exclusiveGroup && q.id !== pa.id && q.selected)) { o.selected = false; o.history = [...(o.history || []), { date: todayISO(), selected: false, by: ws.currentUser, rationale: choosing.rationale }]; }
            pa.selected = true; pa.rationale = choosing.rationale; pa.history = [...(pa.history || []), { date: todayISO(), selected: true, by: ws.currentUser, rationale: choosing.rationale }];
            x.materialChangeAt = new Date().toISOString();
          }, 'Benefits path switched');
          setChoosing(null);
        }}>Select path</button></>}>
          <p>Switching paths is a material change: the value case must be refreshed and re-baselined before the next gate (PRG-09).</p>
          <Field label="Rationale"><TextArea value={choosing.rationale} onChange={(v) => setChoosing({ ...choosing, rationale: v })} /></Field>
        </Modal>
      )}
    </Card>
  );
}

function VersionsPanel({ p, upd, compareId, setCompareId, diff }) {
  const { ws } = useApp();
  const [label, setLabel] = useState('');
  const chain = p.chain;
  return (
    <Card title="Versions and baselines (RCM-13)" subtitle="A baseline is taken at each gate; compare any version with the current model">
      <div className="row"><input type="text" placeholder="Version label" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Version label" style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => { upd((c) => { c.versions.push({ id: uid('ver'), label: label || `Version ${c.versions.length + 1}`, date: new Date().toISOString(), by: ws.currentUser, baseline: false, snapshot: snapshot(c) }); }, 'Saved benefits map version'); setLabel(''); }}>Save version</button>
        <button className="btn btn-sm btn-navy" onClick={() => { upd((c) => { c.versions.push({ id: uid('ver'), label: label || `Baseline ${fmtDate(todayISO())}`, date: new Date().toISOString(), by: ws.currentUser, baseline: true, snapshot: snapshot(c) }); }, 'Baselined benefits map'); setLabel(''); }}>Baseline</button></div>
      {!chain.versions.length ? <div className="empty-sm">No saved versions yet.</div> : (
        <div style={{ marginTop: 10 }}>{chain.versions.slice().reverse().map((v) => (
          <div key={v.id} className="check-row"><span className="ic">{v.baseline ? '◆' : '•'}</span><span><strong>{v.label}</strong><div className="mini">{fmtDate(v.date)} · {personName(ws, v.by)} · {v.snapshot.elements.length} elements</div></span>
            <span className="row" style={{ gap: 4 }}><button className={`btn btn-sm ${compareId === v.id ? 'btn-navy' : ''}`} onClick={() => setCompareId(compareId === v.id ? '' : v.id)}>{compareId === v.id ? 'Stop' : 'Compare'}</button><button className="btn btn-sm" onClick={() => { if (window.confirm(`Restore “${v.label}”? The current model is saved as a version first.`)) upd((c) => { c.versions.push({ id: uid('ver'), label: `Before restore of ${v.label}`, date: new Date().toISOString(), by: ws.currentUser, baseline: false, snapshot: snapshot(c) }); c.elements = structuredClone(v.snapshot.elements); c.links = structuredClone(v.snapshot.links); c.paths = structuredClone(v.snapshot.paths || []); }, `Restored version ${v.label}`); }}>Restore</button></span></div>
        ))}</div>
      )}
      {diff && (
        <div className="guidance" style={{ marginTop: 10 }}>
          <strong>Changes since version:</strong> {diff.added.length} added (green outline), {diff.changed.length} changed (amber outline), {diff.removed.length} removed, {diff.linksAdded.length} links added, {diff.linksRemoved.length} links removed.
          {diff.removed.length > 0 && <div className="mini">Removed: {diff.removed.map((e) => `${e.code} ${e.title}`).join('; ')}</div>}
          {diff.changed.length > 0 && <div className="mini">Changed: {diff.changed.map((c) => `${c.after.code} (${c.fields.join(', ')})`).join('; ')}</div>}
        </div>
      )}
    </Card>
  );
}

function WorkshopPanel({ p, addElement }) {
  const { updateProgram } = useApp();
  const w = p.workshop || { date: todayISO(), attendees: '', notes: [], parking: [] };
  const [note, setNote] = useState('');
  const setW = (patch, label) => updateProgram(p.id, (x) => { x.workshop = { ...(x.workshop || w), ...patch }; }, label, { field: `ws:${Object.keys(patch)[0]}` });
  return (
    <Card title="Workshop mode (RCM-17, COL-03)" subtitle="Quick capture during a facilitated session; convert notes into elements">
      <Guidance>Start with a half-day, high-level session: agree final outcomes, keep asking “so what?”, then work backwards. Add detail later to avoid analysis paralysis.</Guidance>
      <div className="form-grid" style={{ marginTop: 10 }}>
        <Field label="Session date"><input type="date" value={w.date} onChange={(e) => setW({ date: e.target.value }, 'Workshop date')} /></Field>
        <Field label="Attendees"><TextInput value={w.attendees} onChange={(v) => setW({ attendees: v }, 'Workshop attendees')} placeholder="Names, comma separated" /></Field>
      </div>
      <form className="row" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; setW({ notes: [...w.notes, { id: uid('n'), text: note.trim() }] }, 'Captured workshop note'); setNote(''); }}>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Capture an idea…" style={{ flex: 1 }} aria-label="Workshop note" />
        <button className="btn btn-sm btn-primary" type="submit">Add</button>
      </form>
      <div style={{ marginTop: 10 }}>{w.notes.map((n) => (
        <div key={n.id} className="sticky-note"><span>{n.text}</span><span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
          {[['initiative', 'I'], ['outcome', 'O'], ['assumption', 'A']].map(([k, l]) => <button key={k} className="btn btn-sm" title={`Convert to ${k}`} onClick={() => { addElement(k, { title: n.text, validation: 'pending', consensus: 'Needs discussion' }); setW({ notes: w.notes.filter((x) => x.id !== n.id) }, `Converted note to ${k}`); }}>{l}</button>)}
          <button className="btn btn-sm" title="Parking lot" onClick={() => setW({ notes: w.notes.filter((x) => x.id !== n.id), parking: [...(w.parking || []), n] }, 'Parked note')}>P</button>
        </span></div>
      ))}</div>
      {(w.parking || []).length > 0 && <><div className="section-title">Parking lot</div>{w.parking.map((n) => <div key={n.id} className="mini">• {n.text}</div>)}</>}
      <p className="mini" style={{ marginTop: 8 }}>Real-time co-editing needs the multi-user server deployment; in this browser edition, project the map on a large display and capture as a group.</p>
    </Card>
  );
}

function OutlineView({ p, onSelect }) {
  const { ws } = useApp();
  const chain = p.chain;
  return (
    <Card title="Outline view" subtitle="Accessible equivalent of the canvas (NFR-04)" pad={false}>
      <DataTable caption="Elements" columns={[
        { label: 'Code', get: (e) => <button className="btn btn-sm btn-ghost" onClick={() => onSelect(e.id)}>{e.code}</button> },
        { label: 'Type', get: (e) => (e.kind === 'outcome' ? (e.final ? 'Final outcome' : 'Outcome') : e.kind === 'initiative' ? 'Initiative' : 'Assumption') },
        { label: 'Title', get: (e) => e.title }, { label: 'BTOPP', get: (e) => (e.btopp || []).map(btoppName).join(', ') },
        { label: 'Owner', get: (e) => personName(ws, e.kind === 'assumption' ? e.assumption?.monitorId : e.ownerId) },
        { label: 'Contributes to', get: (e) => chain.links.filter((l) => l.from === e.id).map((l) => `${elById(chain, l.to)?.code} (${l.strength}${l.lag ? `, ${l.lag} mo` : ''})`).join(', ') || '—' },
        { label: 'Status', get: (e) => elementStatus(e)?.label },
      ]} rows={chain.elements} />
    </Card>
  );
}

const PATTERNS = [
  { name: 'Customer information system', description: 'A single customer view used to cut handling cost (adapted from the source’s customer information system example).', elements: [['I1', 'initiative', 'Implement customer information system', { btopp: ['T'] }], ['O1', 'outcome', 'All customer information accessible to service staff', {}], ['I2', 'initiative', 'Train staff to find information quickly', { btopp: ['P'] }], ['O2', 'outcome', 'Customers processed per hour increased', {}], ['O3', 'outcome', 'Cost of handling queries decreased', { final: true }], ['A1', 'assumption', 'Query volumes remain stable', {}]], links: [['I1', 'O1', 'high'], ['O1', 'O2', 'high'], ['I2', 'O2', 'medium'], ['O2', 'O3', 'high'], ['A1', 'O3']] },
  { name: 'Enterprise system (ERP)', description: 'Common benefits path for an integrated finance and procurement system.', elements: [['I1', 'initiative', 'Implement integrated finance and procurement system', { btopp: ['T'] }], ['I2', 'initiative', 'Redesign procure-to-pay process', { btopp: ['Pr'] }], ['I3', 'initiative', 'Establish shared-services team', { btopp: ['O'] }], ['O1', 'outcome', 'Manual invoice handling decreased', {}], ['O2', 'outcome', 'Month-end close time decreased', {}], ['O3', 'outcome', 'Finance operating cost decreased', { final: true }], ['A1', 'assumption', 'Suppliers adopt e-invoicing', {}]], links: [['I1', 'O1', 'high'], ['I2', 'O1', 'high'], ['I3', 'O3', 'medium'], ['O1', 'O3', 'high'], ['I1', 'O2', 'medium'], ['O2', 'O3', 'low'], ['A1', 'O1']] },
  { name: 'Intranet and knowledge sharing', description: 'Benefits path for a knowledge-sharing intranet.', elements: [['I1', 'initiative', 'Launch intranet with search and expertise directory', { btopp: ['T'] }], ['I2', 'initiative', 'Appoint community-of-practice leads', { btopp: ['O'] }], ['I3', 'initiative', 'Recognise knowledge contributions in reviews', { btopp: ['O', 'P'] }], ['O1', 'outcome', 'Time spent searching for information decreased', {}], ['O2', 'outcome', 'Reuse of existing work increased', {}], ['O3', 'outcome', 'Staff productivity increased', { final: true }]], links: [['I1', 'O1', 'high'], ['I2', 'O2', 'medium'], ['I3', 'O2', 'medium'], ['O1', 'O3', 'medium'], ['O2', 'O3', 'medium']] },
];
