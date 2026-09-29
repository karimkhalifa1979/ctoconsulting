import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Tabs, useTab, Field, TextArea, Select, Badge, mClass, RagDot, CompareStat, NumberInput } from '../components/ui.jsx';
import DataGrid from '../components/DataGrid.jsx';
import { HBar, C, PALETTE } from '../components/charts.jsx';
import { CANVAS_ELEMENTS, ARCHETYPES, TOM_PATTERNS } from '../data/tomLibrary.js';
import { DIMENSIONS, DIM } from '../lib/model.js';
import { dimensionStats, orgTotals, costTotals, inventorySummary, sum, overallStats, avg } from '../lib/calc.js';
import { fmtScore, fmtMoney, fmtNum, num } from '../lib/format.js';
import { optionScore } from '../lib/compare.js';

export default function Tom() {
  const { eng, set, setPath } = useStore();
  const [tab, setTab] = useTab('vision');
  const [dim, setDim] = useState(DIMENSIONS[0].code);
  const t = eng.tom;
  const dims = dimensionStats(eng);
  const arch = ARCHETYPES[t.archetype];
  const options = t.options.map((o) => ({ ...o, score: optionScore(o, t.criteria) })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const cur = orgTotals(eng), tgt = orgTotals(eng, true);
  const cc = costTotals(eng.costs), tc = costTotals(eng.targetCosts);
  const inv = inventorySummary(eng);
  const td = t.dimensions[dim] || {};
  const setTd = (k) => (v) => setPath(['tom', 'dimensions', dim, k], v);
  const st = dims.find((d) => d.code === dim);
  const applyPattern = (p) => {
    const add = (a, b, sep) => (a ? `${a}${sep}${b}` : b);
    setPath(['tom', 'dimensions', dim], { ...td, targetDescription: add(td.targetDescription, p.target, ' '), shifts: add(td.shifts, p.shift, '\n') });
  };
  const completion = DIMENSIONS.filter((d) => t.dimensions[d.code]?.targetDescription).length;

  return (
    <div className="stack">
      <PageHead eyebrow="Step 5 · Design" title="Target operating model designer">
        Tools to design the target operating model: vision and structural archetype, the Operating Model Canvas, the target state and key shifts for each dimension (with a pattern library), and a weighted appraisal of design options against the agreed principles.
      </PageHead>
      <div className="grid g-5">
        <CompareStat label="Maturity" from={fmtScore(overallStats(eng).current)} to={fmtScore(avg(dims.map((d) => d.designTarget)))} fromRaw={overallStats(eng).current} toRaw={avg(dims.map((d) => d.designTarget))} />
        <CompareStat label="FTE" from={fmtNum(cur.total)} to={fmtNum(tgt.total)} fromRaw={cur.total} toRaw={tgt.total} better="lower" />
        <CompareStat label="Layers / span" from={`${cur.maxLayers} / ${fmtNum(cur.span, 1)}`} to={`${tgt.maxLayers} / ${fmtNum(tgt.span, 1)}`} />
        <CompareStat label="Run cost" from={fmtMoney(cc.total, { compact: true })} to={fmtMoney(tc.total, { compact: true })} fromRaw={cc.total} toRaw={tc.total} better="lower" fmtDelta={(d) => fmtMoney(d, { compact: true })} />
        <CompareStat label="Target states described" from="" to={`${completion} / 17`} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'vision', label: 'Vision & archetype' }, { id: 'canvas', label: 'Operating Model Canvas' }, { id: 'target', label: 'Target state by dimension', count: `${completion}/17` },
        { id: 'options', label: 'Design options appraisal', count: t.options.length }, { id: 'structure', label: 'Structure, sourcing & footprint' },
      ]} />

      {tab === 'vision' && (
        <div className="grid g-2">
          <Card title="Target operating model vision">
            <TextArea rows={5} value={t.vision} onChange={(v) => setPath(['tom', 'vision'], v)} placeholder="One or two sentences describing how the organisation will operate in the future and the value it will deliver." />
            <div className="section-title mt-16" style={{ fontSize: 13 }}>Design principles</div>
            {eng.principles.length ? eng.principles.map((p) => <div key={p.id} className="small" style={{ padding: '5px 0', borderBottom: '1px dashed var(--line)' }}><strong>{p.id} {p.principle}</strong> <Badge v={p.status} /><div className="muted">{p.implications}</div></div>)
              : <p className="small muted">No principles yet — <Link to="/engagement?tab=principles">add them in Engagement setup</Link>.</p>}
          </Card>
          <Card title="Structural archetype">
            <Field label="Selected archetype"><Select value={t.archetype} onChange={(v) => setPath(['tom', 'archetype'], v)} options={Object.keys(ARCHETYPES)} /></Field>
            {arch && <dl className="kv mt-8"><dt>When it fits</dt><dd>{arch.when}</dd><dt>Strengths</dt><dd>{arch.pros}</dd><dt>Watch-outs</dt><dd>{arch.cons}</dd></dl>}
            <Field label="Rationale for the choice" className="mt-16"><TextArea rows={4} value={t.archetypeRationale} onChange={(v) => setPath(['tom', 'archetypeRationale'], v)} /></Field>
            <details className="mt-16"><summary className="small strong" style={{ cursor: 'pointer' }}>Compare all archetypes</summary>
              <table className="table compact mt-8"><tbody>{Object.entries(ARCHETYPES).map(([k, a]) => <tr key={k}><td className="strong">{k}</td><td className="small">{a.when}</td></tr>)}</tbody></table>
            </details>
          </Card>
        </div>
      )}

      {tab === 'canvas' && (
        <>
          <div className="canvas">
            {CANVAS_ELEMENTS.map((c) => {
              const v = t.canvas[c.id] || {};
              const ds = dims.filter((d) => c.dims.includes(d.code));
              return (
                <div key={c.id} className={`cell ${c.id === 'value' ? 'value' : ''}`} style={{ gridArea: c.id }}>
                  <h4><span>{c.name}</span><span>{ds.map((d) => <RagDot key={d.code} rag={d.rag} />)}</span></h4>
                  <div className="xsmall" style={{ opacity: 0.8 }}>{c.prompt}</div>
                  <div className="lbl">Current</div>
                  <textarea rows={3} value={v.current || ''} onChange={(e) => setPath(['tom', 'canvas', c.id, 'current'], e.target.value)} />
                  <div className="lbl">Target</div>
                  <textarea rows={3} value={v.target || ''} onChange={(e) => setPath(['tom', 'canvas', c.id, 'target'], e.target.value)} />
                  <div className="lbl">Key shifts</div>
                  <input type="text" value={v.shifts || ''} onChange={(e) => setPath(['tom', 'canvas', c.id, 'shifts'], e.target.value)} />
                  <div className="xsmall" style={{ marginTop: 4, opacity: 0.75 }}>{ds.map((d) => `${d.code} ${d.short} ${fmtScore(d.current)}→${fmtScore(d.designTarget)}`).join(' · ')}</div>
                </div>
              );
            })}
          </div>
          <p className="xsmall muted">Operating Model Canvas (POLISM): Processes, Organisation, Locations, Information, Suppliers and Management system, serving the value proposition. Dots show the RAG of the related dimensions.</p>
        </>
      )}

      {tab === 'target' && (
        <div className="grid g-12">
          <Card title="Dimensions" pad={false}>
            {dims.map((d) => (
              <div key={d.code} onClick={() => setDim(d.code)} className="row between" style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid var(--line)', background: d.code === dim ? 'var(--brand-teal-soft)' : undefined }}>
                <span className="small"><strong>{d.code}</strong> {d.short}</span>
                <span className="row" style={{ gap: 6 }}>{t.dimensions[d.code]?.targetDescription ? '✓' : ''}<span className={`badge ${mClass(d.current)}`}>{fmtScore(d.current)}</span><RagDot rag={d.rag} /></span>
              </div>
            ))}
          </Card>
          <div className="stack">
            <Card title={`${dim} · ${DIM[dim].name}`} subtitle={`${DIM[dim].keyQuestion} · Current ${fmtScore(st.current)} → assessed target ${fmtScore(st.target)} · ${st.findings} findings`}>
              <div className="form-grid">
                <Field label="Current state summary" className="full"><TextArea rows={3} value={td.currentSummary} onChange={setTd('currentSummary')} /></Field>
                <Field label="Target state description" className="full"><TextArea rows={4} value={td.targetDescription} onChange={setTd('targetDescription')} /></Field>
                <Field label="Key shifts (from → to)" className="full"><TextArea rows={3} value={td.shifts} onChange={setTd('shifts')} /></Field>
                <Field label="Design principles applied" hint="e.g. DP01; DP04"><input type="text" value={td.principles || ''} onChange={(e) => setTd('principles')(e.target.value)} /></Field>
                <Field label="Design target maturity" hint="optional override of the assessed target"><NumberInput value={td.targetOverride} min={1} max={5} step={0.1} onChange={setTd('targetOverride')} /></Field>
                <Field label="Key enablers & dependencies" className="full"><TextArea rows={2} value={td.enablers} onChange={setTd('enablers')} /></Field>
                <Field label="Linked recommendations" className="full"><input type="text" value={td.recs || ''} onChange={(e) => setTd('recs')(e.target.value)} /></Field>
              </div>
              <div className="btn-row mt-8">
                <button className="btn btn-sm" onClick={() => setTd('currentSummary')(eng.questions.filter((q) => q.dim === dim && q.observations).map((q) => q.observations).join(' '))}>Fill current state from observations</button>
                <button className="btn btn-sm" onClick={() => setTd('recs')(eng.recommendations.filter((r) => r.dim === dim).map((r) => r.id).join('; '))}>Link this dimension's recommendations</button>
              </div>
            </Card>
            <Card title="Pattern library" subtitle="Common target-state patterns for this dimension — insert, then tailor">
              {(TOM_PATTERNS[dim] || []).map((p) => (
                <div key={p.name} className="row between" style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <div className="small"><strong>{p.name}</strong><div>{p.target}</div><div className="muted">{p.shift}</div></div>
                  <button className="btn btn-xs" style={{ flex: 'none' }} onClick={() => applyPattern(p)}>Insert</button>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}

      {tab === 'options' && (
        <div className="stack">
          <div className="grid g-2">
            <Card title="Evaluation criteria & weights" subtitle={`Weights total ${sum(t.criteria.map((c) => c.weight))}%`} pad={false}>
              <DataGrid rows={t.criteria} onChange={(r) => setPath(['tom', 'criteria'], r)} idPrefix="K" idWidth={1} entity="criterion" titleKey="name" maxHeight={360}
                columns={[{ key: 'name', label: 'Criterion', width: 200 }, { key: 'weight', label: 'Weight (%)', type: 'number', width: 80, total: 'sum' }, { key: 'description', label: 'Description', type: 'long', width: 260 }]} />
            </Card>
            <Card title="Weighted score by option" subtitle="Score 1–5 per criterion × weight">
              <HBar items={options.map((o, i) => ({ label: o.name, value: o.score === null ? 0 : +o.score.toFixed(2), color: o.id === t.preferredOption ? C.teal : PALETTE[i % PALETTE.length] }))} max={5} fmt={(v) => Number(v).toFixed(2)} width={560} labelW={240} />
              <Field label="Preferred option" className="mt-8"><Select value={t.preferredOption} onChange={(v) => setPath(['tom', 'preferredOption'], v)} options={t.options.map((o) => ({ value: o.id, label: o.name }))} /></Field>
            </Card>
          </div>
          <Card title="Options" pad={false} actions={<button className="btn btn-sm btn-primary" onClick={() => setPath(['tom', 'options'], [...t.options, { id: `OPT${t.options.length + 1}`, name: `Option ${t.options.length + 1}`, description: '', scores: {} }])}>+ Add option</button>}>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th style={{ minWidth: 240 }}>Option</th>{t.criteria.map((c) => <th key={c.id} className="center" title={c.description}>{c.name}<div className="xsmall">{c.weight}%</div></th>)}<th className="num">Weighted</th><th className="num">One-off $</th><th className="num">Run cost $</th><th className="num">FTE</th><th className="num">Months</th><th>Risk</th><th /></tr></thead>
                <tbody>
                  {t.options.map((o, i) => {
                    const upd = (patch) => setPath(['tom', 'options'], t.options.map((x, k) => (k === i ? { ...x, ...patch } : x)));
                    const sc = optionScore(o, t.criteria);
                    return (
                      <tr key={o.id} style={o.id === t.preferredOption ? { background: 'var(--brand-teal-soft)' } : undefined}>
                        <td><input type="text" value={o.name} onChange={(e) => upd({ name: e.target.value })} className="strong" /><textarea rows={2} value={o.description || ''} onChange={(e) => upd({ description: e.target.value })} placeholder="Description" style={{ marginTop: 4 }} /></td>
                        {t.criteria.map((c) => (
                          <td key={c.id} className="center"><select value={o.scores?.[c.id] ?? ''} onChange={(e) => upd({ scores: { ...o.scores, [c.id]: e.target.value === '' ? '' : Number(e.target.value) } })} style={{ width: 56 }} className={mClass(o.scores?.[c.id])}><option value="" />{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></td>
                        ))}
                        <td className="num strong">{sc === null ? '—' : sc.toFixed(2)}</td>
                        <td><input type="number" value={o.oneOff ?? ''} onChange={(e) => upd({ oneOff: e.target.value === '' ? '' : Number(e.target.value) })} style={{ width: 110 }} /></td>
                        <td><input type="number" value={o.runCost ?? ''} onChange={(e) => upd({ runCost: e.target.value === '' ? '' : Number(e.target.value) })} style={{ width: 110 }} /></td>
                        <td><input type="number" value={o.fte ?? ''} onChange={(e) => upd({ fte: e.target.value === '' ? '' : Number(e.target.value) })} style={{ width: 70 }} /></td>
                        <td><input type="number" value={o.duration ?? ''} onChange={(e) => upd({ duration: e.target.value === '' ? '' : Number(e.target.value) })} style={{ width: 60 }} /></td>
                        <td><select value={o.risk || ''} onChange={(e) => upd({ risk: e.target.value })}><option value="" />{['Low', 'Medium', 'High'].map((x) => <option key={x}>{x}</option>)}</select></td>
                        <td><button className="icon-btn danger" onClick={() => window.confirm(`Delete ${o.name}?`) && setPath(['tom', 'options'], t.options.filter((_, k) => k !== i))}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'structure' && (
        <div className="grid g-2">
          <Card title="Target organisation" actions={<Link className="btn btn-xs" to="/organisation">Design in Org structure</Link>} pad={false}>
            <table className="table compact">
              <thead><tr><th>Unit</th><th>Action</th><th className="num">FTE</th><th className="num">Target FTE</th><th className="num">Target span</th></tr></thead>
              <tbody>{eng.orgUnits.map((u) => {
                const f = (p) => ['Perm', 'Fixed', 'Contractor', 'Outsourced'].reduce((s, k) => s + (num(u[p ? `t${k}` : k.toLowerCase()]) || 0), 0);
                const sp = num(u.tManagers) ? ((num(u.tPerm) || 0) + (num(u.tFixed) || 0) + (num(u.tContractor) || 0) - 1) / num(u.tManagers) : null;
                return <tr key={u.id}><td>{u.name}</td><td><Badge v={u.tAction} /></td><td className="num">{fmtNum(f(false))}</td><td className="num">{u.tAction === 'Disestablish' ? 0 : fmtNum(f(true))}</td><td className="num">{fmtNum(sp, 1)}</td></tr>;
              })}</tbody>
            </table>
          </Card>
          <Card title="Target decision rights" actions={<Link className="btn btn-xs" to="/decisions">Design RAPID</Link>}>
            <p className="small">Design target RAPID assignments on the Decision rights page (target view). Every key decision should have exactly one decider.</p>
            <dl className="kv"><dt>Decisions with a target</dt><dd>{eng.decisions.filter((d) => Object.keys(d.target || {}).length).length} of {eng.decisions.length}</dd></dl>
          </Card>
          <Card title="Technology target (applications)" actions={<Link className="btn btn-xs" to="/applications">Set dispositions</Link>}>
            <table className="table compact"><tbody>{Object.entries(inv.apps.disposition).map(([k, v]) => <tr key={k}><td><Badge v={k} /></td><td className="num">{v}</td></tr>)}</tbody></table>
          </Card>
          <Card title="Sourcing and footprint" actions={<><Link className="btn btn-xs" to="/suppliers">Suppliers</Link><Link className="btn btn-xs" to="/locations">Locations</Link></>}>
            <table className="table compact">
              <thead><tr><th>Supplier action</th><th className="num">#</th><th>Site action</th><th className="num">#</th></tr></thead>
              <tbody>{Array.from({ length: 6 }).map((_, i) => {
                const sa = eng.lists['Supplier target action'][i], la = eng.lists['Location target action'][i];
                return <tr key={i}><td>{sa}</td><td className="num">{eng.suppliers.filter((s) => s.targetAction === sa).length}</td><td>{la}</td><td className="num">{eng.locations.filter((l) => l.targetAction === la).length}</td></tr>;
              })}</tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
