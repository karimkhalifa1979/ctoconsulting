import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Stat, Badge, Tabs, useTab, StackBar, CompareStat, mClass, Legend } from '../components/ui.jsx';
import DataGrid from '../components/DataGrid.jsx';
import { Bubble, Donut, VBars, C, PALETTE } from '../components/charts.jsx';
import { TK } from '../lib/model.js';
import {
  capabilityCalc, processCalc, orgCalc, orgTargetCalc, orgTotals, decisionCheck, appCalc, supplierCalc, locationCalc,
  costRowTotal, costTotals, COST_TYPES, countBy, sum, avg, inventorySummary,
} from '../lib/calc.js';
import { fmtMoney, fmtNum, fmtPct, fmtScore, num, isNum } from '../lib/format.js';

const HML = ['High', 'Medium', 'Low'];
const YNP = ['Yes', 'No', 'Partial'];
const TIME_COLORS = { Invest: '#1f9d58', Tolerate: '#f2c14e', Migrate: '#eb6834', Eliminate: '#d03b3b' };

/* ---------------- Capabilities ---------------- */
export function Capabilities() {
  const { eng, set } = useStore();
  const [tab, setTab] = useTab('map');
  const [mode, setMode] = useState('current');
  const caps = eng.capabilities.map((c) => ({ ...c, ...capabilityCalc(c) }));
  const tiers = ['Strategic', 'Core', 'Enabling'];
  const top = caps.filter((c) => c.priority).sort((a, b) => b.priority - a.priority).slice(0, 12);
  const val = (c) => (mode === 'current' ? num(c.current) : mode === 'target' ? num(c.target) : c.gap);
  const tone = (c) => {
    if (mode === 'gap') {
      const g = c.gap;
      return g === null ? 'm0' : g >= 2 ? 'm1' : g >= 1 ? 'm3' : 'm5';
    }
    return mClass(val(c));
  };
  return (
    <div className="stack">
      <PageHead eyebrow="Step 3 · Discover" title="Business capability assessment">
        Generic Level 1 / Level 2 capability model — rename, add or remove capabilities to reflect the client. Priority score = importance weight (High 3, Medium 2, Low 1) × maturity shortfall.
      </PageHead>
      <div className="grid g-4">
        <Stat label="Capabilities" value={caps.filter((c) => c.l2 || c.l1).length} sub={`${caps.filter((c) => isNum(c.current)).length} assessed`} accent />
        <Stat label="High importance" value={caps.filter((c) => c.importance === 'High').length} sub={`${caps.filter((c) => c.differentiation === 'Differentiating').length} differentiating`} />
        <Stat label="Average maturity" value={fmtScore(avg(caps.map((c) => num(c.current))))} sub={`Target ${fmtScore(avg(caps.map((c) => num(c.target))))}`} />
        <Stat label="Gaps of 2+ levels" value={caps.filter((c) => c.gap >= 2).length} sub="Priority uplift candidates" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'map', label: 'Capability heat map' }, { id: 'register', label: 'Register', count: caps.length }, { id: 'priority', label: 'Priorities' }]} />
      {tab === 'map' && (
        <Card title="Capability heat map" actions={
          <div className="chips">{[['current', 'Current maturity'], ['target', 'Target maturity'], ['gap', 'Gap']].map(([k, l]) => <button key={k} className={`chip ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}>{l}</button>)}</div>
        }>
          {tiers.map((t) => {
            const l1s = [...new Set(caps.filter((c) => c.tier === t).map((c) => c.l1))];
            if (!l1s.length) return null;
            return (
              <div key={t} style={{ marginBottom: 16 }}>
                <div className="section-title" style={{ fontSize: 13 }}>{t} capabilities</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
                  {l1s.map((l1) => (
                    <div key={l1} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 8, background: 'var(--surface-2)' }}>
                      <div className="strong small" style={{ color: 'var(--brand-navy)', marginBottom: 6 }}>{l1}</div>
                      <div className="stack-sm" style={{ gap: 4 }}>
                        {caps.filter((c) => c.tier === t && c.l1 === l1).map((c) => (
                          <div key={c.id} className={tone(c)} style={{ borderRadius: 6, padding: '4px 8px', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 6, border: c.importance === 'High' ? '1.5px solid #0b1f3a55' : '1px solid transparent' }}
                            title={`${c.id} ${c.l2}\nImportance: ${c.importance || '—'} · Current ${c.current || '—'} → Target ${c.target || '—'}\n${c.description}`}>
                            <span className="clamp-2">{c.l2 || c.l1}</span>
                            <strong className="tabular">{mode === 'gap' ? (c.gap === null ? '' : c.gap > 0 ? `+${c.gap}` : c.gap) : (val(c) ?? '')}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <Legend items={mode === 'gap'
            ? [{ label: 'Gap ≥ 2', color: 'var(--m1)' }, { label: 'Gap 1', color: 'var(--m3)' }, { label: 'No gap', color: 'var(--m5)' }, { label: 'Not assessed', color: '#f1f3f6' }]
            : [1, 2, 3, 4, 5].map((n) => ({ label: `${n} ${['Initial', 'Developing', 'Defined', 'Managed', 'Optimised'][n - 1]}`, color: `var(--m${n})` }))} />
          <p className="xsmall muted mt-8">Outlined boxes are high-importance capabilities.</p>
        </Card>
      )}
      {tab === 'register' && (
        <Card pad={false}>
          <DataGrid rows={eng.capabilities} onChange={(r) => set('capabilities', r)} idPrefix="C" idWidth={2} entity="capability" titleKey="l2" filters={['tier', 'l1', 'importance']}
            columns={[
              { key: 'tier', label: 'Tier', type: 'select', options: eng.lists['Capability tier'], width: 100 },
              { key: 'l1', label: 'Level 1 capability', width: 170 },
              { key: 'l2', label: 'Level 2 capability', width: 190 },
              { key: 'description', label: 'Description', type: 'long', width: 240 },
              { key: 'importance', label: 'Strategic importance', type: 'select', options: HML, width: 100 },
              { key: 'differentiation', label: 'Differentiation', type: 'select', options: eng.lists.Differentiation, width: 140 },
              { key: 'current', label: 'Current (1–5)', type: 'score', width: 70 },
              { key: 'target', label: 'Target (1–5)', type: 'score', width: 70 },
              { key: 'gap', label: 'Gap', calc: (c) => capabilityCalc(c).gap, width: 55 },
              { key: 'priority', label: 'Priority score', calc: (c) => capabilityCalc(c).priority, width: 70 },
              { key: 'owner', label: 'Capability owner', width: 150 },
              { key: 'systems', label: 'Key supporting systems', width: 160 },
              { key: 'sourcing', label: 'Sourcing model', type: 'select', options: eng.lists['Sourcing model'], width: 120 },
              { key: 'notes', label: 'Observations', type: 'long', width: 220 },
              { key: 'targetSourcing', label: 'Target sourcing', type: 'select', options: eng.lists['Sourcing model'], width: 120, group: 'target', section: 'Target state' },
              { key: 'changeType', label: 'Change type', type: 'select', options: eng.lists['Capability change type'], width: 100, group: 'target', section: 'Target state' },
              { key: 'horizon', label: 'Horizon', type: 'select', options: eng.lists.Horizon, width: 120, group: 'target', section: 'Target state' },
            ]} />
        </Card>
      )}
      {tab === 'priority' && (
        <div className="grid g-2">
          <Card title="Highest-priority capabilities" subtitle="Importance weight × maturity shortfall">
            <table className="table compact">
              <thead><tr><th>ID</th><th>Capability</th><th>Importance</th><th className="num">Current</th><th className="num">Target</th><th className="num">Score</th></tr></thead>
              <tbody>{top.map((c) => <tr key={c.id}><td>{c.id}</td><td>{c.l2}<div className="xsmall muted">{c.l1}</div></td><td><Badge v={c.importance} kind="importance" /></td><td className="num">{c.current}</td><td className="num">{c.target}</td><td className="num strong">{c.priority}</td></tr>)}</tbody>
            </table>
          </Card>
          <Card title="Sourcing: current → target">
            <table className="table compact">
              <thead><tr><th>Sourcing model</th><th className="num">Current</th><th className="num">Target</th></tr></thead>
              <tbody>{eng.lists['Sourcing model'].map((s) => <tr key={s}><td>{s}</td><td className="num">{caps.filter((c) => c.sourcing === s).length}</td><td className="num">{caps.filter((c) => (c.targetSourcing || c.sourcing) === s).length}</td></tr>)}</tbody>
            </table>
            <div className="section-title mt-16" style={{ fontSize: 13 }}>Change type</div>
            <StackBar segments={eng.lists['Capability change type'].map((t, i) => ({ label: t, value: caps.filter((c) => c.changeType === t).length, color: PALETTE[i] }))} />
          </Card>
        </div>
      )}
    </div>
  );
}

/* ---------------- Processes ---------------- */
export function Processes() {
  const { eng, set } = useStore();
  const procs = eng.processes;
  const streams = [...new Set(procs.map((p) => p.valueStream).filter(Boolean))];
  const inv = inventorySummary(eng).processes;
  return (
    <div className="stack">
      <PageHead eyebrow="Step 3 · Discover" title="Value stream & process inventory">
        Generic end-to-end value streams and Level 1 processes. Add Level 2 sub-processes as rows and record performance data where available.
      </PageHead>
      <div className="grid g-4">
        <Stat label="Processes" value={inv.total} sub={`${streams.length} value streams`} accent />
        <Stat label="Documented" value={fmtPct(inv.total ? inv.documented / inv.total : null)} sub={`${inv.documented} fully documented`} />
        <Stat label="Average maturity" value={fmtScore(inv.avgMaturity)} sub="Process maturity (1–5)" />
        <Card><div className="small strong mb-8">Automation level</div><StackBar segments={eng.lists['Automation level'].map((a, i) => ({ label: a, value: inv.automation[a] || 0, color: ['#e07676', '#f2c14e', '#1f9d58'][i] }))} /></Card>
      </div>
      <Card pad={false}>
        <DataGrid rows={procs} onChange={(r) => set('processes', r)} idPrefix="P" idWidth={2} entity="process" titleKey="l1" filters={['valueStream', 'automation', 'priority']}
          columns={[
            { key: 'valueStream', label: 'Value stream', width: 160 },
            { key: 'l1', label: 'Level 1 process', width: 200 },
            { key: 'l2', label: 'Level 2 process / sub-process', width: 170 },
            { key: 'owner', label: 'Process owner', width: 150 },
            { key: 'units', label: 'Business units involved', width: 160 },
            { key: 'documented', label: 'Documented?', type: 'select', options: YNP, width: 90 },
            { key: 'standardised', label: 'Standardised across units?', type: 'select', options: YNP, width: 90 },
            { key: 'automation', label: 'Automation level', type: 'select', options: eng.lists['Automation level'], width: 140 },
            { key: 'systems', label: 'Key systems', width: 150 },
            { key: 'volume', label: 'Monthly volume', type: 'number', width: 90, total: 'sum' },
            { key: 'cycleTime', label: 'Avg cycle time (days)', type: 'number', width: 80, dp: 1 },
            { key: 'fte', label: 'FTE effort', type: 'number', width: 80, dp: 1, total: 'sum' },
            { key: 'ftePer1000', label: 'FTE per 1,000 transactions', calc: (p) => processCalc(p).ftePer1000, fmt: (v) => (v === null ? '' : fmtNum(v, 2)), width: 90 },
            { key: 'handoffs', label: 'Hand-offs (#)', type: 'number', width: 70 },
            { key: 'painPoints', label: 'Pain points', type: 'long', width: 200 },
            { key: 'maturity', label: 'Maturity (1–5)', type: 'score', width: 70 },
            { key: 'opportunity', label: 'Improvement opportunity', type: 'long', width: 200 },
            { key: 'priority', label: 'Priority', type: 'select', options: HML, width: 90 },
            { key: 'targetAutomation', label: 'Target automation', type: 'select', options: eng.lists['Automation level'], width: 140, group: 'target', section: 'Target state' },
            { key: 'targetCycleTime', label: 'Target cycle time (days)', type: 'number', width: 80, group: 'target', section: 'Target state' },
            { key: 'targetFte', label: 'Target FTE', type: 'number', width: 80, dp: 1, group: 'target', total: 'sum', section: 'Target state' },
          ]} />
      </Card>
    </div>
  );
}

/* ---------------- Organisation structure ---------------- */
export function Organisation() {
  const { eng, set } = useStore();
  const cur = orgTotals(eng), tgt = orgTotals(eng, true);
  const natures = eng.spanBenchmarks.map((b) => b.nature);
  const units = eng.orgUnits.map((u) => ({ ...u, c: orgCalc(u, eng), t: orgTargetCalc(u, eng) }));
  return (
    <div className="stack">
      <PageHead eyebrow="Step 3 · Discover" title="Organisation structure: spans, layers & workforce mix">
        One row per business unit or function, from the HR system extract. Average span ≈ (employee + contractor FTE − 1) ÷ people managers. Teal columns hold the target structure designed in the TOM.
      </PageHead>
      <div className="grid g-5">
        <CompareStat label="Total FTE" from={fmtNum(cur.total)} to={fmtNum(tgt.total)} fromRaw={cur.total} toRaw={tgt.total} better="lower" />
        <CompareStat label="People managers" from={fmtNum(cur.managers)} to={fmtNum(tgt.managers)} fromRaw={cur.managers} toRaw={tgt.managers} better="lower" />
        <CompareStat label="Average span" from={fmtNum(cur.span, 1)} to={fmtNum(tgt.span, 1)} fromRaw={cur.span} toRaw={tgt.span} better="higher" />
        <CompareStat label="Deepest layers" from={cur.maxLayers || '—'} to={tgt.maxLayers || '—'} fromRaw={cur.maxLayers} toRaw={tgt.maxLayers} better="lower" sub={`Maximum allowed: ${eng.settings.maxLayers}`} />
        <CompareStat label="Employee cost" from={fmtMoney(cur.cost, { compact: true })} to={fmtMoney(tgt.cost, { compact: true })} fromRaw={cur.cost} toRaw={tgt.cost} better="lower" fmtDelta={(d) => fmtMoney(d, { compact: true })} />
      </div>
      <Card title="Structure by business unit" subtitle={`Contractor & outsourced: ${fmtPct(cur.contractorPct)} current → ${fmtPct(tgt.contractorPct)} target · ${cur.spanIssues} units outside span range · ${cur.layerIssues} exceed maximum layers`} pad={false}>
        <DataGrid rows={eng.orgUnits} onChange={(r) => set('orgUnits', r)} idPrefix="O" idWidth={2} entity="business unit" titleKey="name" example={TK.examples.orgUnit}
          ctx={eng} newRow={() => ({ tAction: 'Retain' })}
          columns={[
            { key: 'name', label: 'Business unit / function', width: 190 },
            { key: 'head', label: 'Head of unit', width: 160 },
            { key: 'nature', label: 'Nature of work', type: 'select', options: natures, width: 170 },
            { key: 'perm', label: 'Permanent FTE', type: 'number', width: 80, total: 'sum' },
            { key: 'fixed', label: 'Fixed-term FTE', type: 'number', width: 80, total: 'sum' },
            { key: 'contractor', label: 'Contractor FTE', type: 'number', width: 80, total: 'sum' },
            { key: 'outsourced', label: 'Outsourced FTE', type: 'number', width: 80, total: 'sum' },
            { key: 'total', label: 'Total FTE', calc: (u, e) => orgCalc(u, e).total, width: 70, total: 'sum' },
            { key: 'cpct', label: 'Contractor & outsourced %', calc: (u, e) => orgCalc(u, e).contractorPct, type: 'percent', width: 90 },
            { key: 'managers', label: 'People managers (#)', type: 'number', width: 80, total: 'sum' },
            { key: 'layers', label: 'Management layers (CEO = 1)', type: 'number', width: 80 },
            { key: 'span', label: 'Average span', calc: (u, e) => orgCalc(u, e).span, dp: 1, width: 70 },
            { key: 'range', label: 'Target span', calc: (u, e) => orgCalc(u, e).range?.label || '', width: 70 },
            { key: 'spanA', label: 'Span assessment', calc: (u, e) => orgCalc(u, e).spanAssessment, badge: true, width: 110 },
            { key: 'layersA', label: 'Layers assessment', calc: (u, e) => orgCalc(u, e).layersAssessment, badge: true, width: 120 },
            { key: 'cost', label: 'Annual employee cost ($)', type: 'money', width: 120, total: 'sum' },
            { key: 'cpf', label: 'Cost per employee FTE', calc: (u, e) => orgCalc(u, e).costPerFte, type: 'money', width: 100 },
            { key: 'vacancies', label: 'Vacancies (#)', type: 'number', width: 70, total: 'sum' },
            { key: 'notes', label: 'Observations', type: 'long', width: 220 },
            { key: 'tAction', label: 'Target action', type: 'select', options: eng.lists['Org unit target action'], width: 110, group: 'target', section: 'Target structure' },
            { key: 'tPerm', label: 'Target permanent FTE', type: 'number', width: 80, group: 'target', total: 'sum', section: 'Target structure' },
            { key: 'tFixed', label: 'Target fixed-term FTE', type: 'number', width: 80, group: 'target', total: 'sum', section: 'Target structure' },
            { key: 'tContractor', label: 'Target contractor FTE', type: 'number', width: 80, group: 'target', total: 'sum', section: 'Target structure' },
            { key: 'tOutsourced', label: 'Target outsourced FTE', type: 'number', width: 80, group: 'target', total: 'sum', section: 'Target structure' },
            { key: 'tTotal', label: 'Target total FTE', calc: (u, e) => (u.tAction === 'Disestablish' ? 0 : orgTargetCalc(u, e).total), width: 70, group: 'target', total: 'sum', section: 'Target structure' },
            { key: 'tManagers', label: 'Target managers', type: 'number', width: 80, group: 'target', total: 'sum', section: 'Target structure' },
            { key: 'tLayers', label: 'Target layers', type: 'number', width: 70, group: 'target', section: 'Target structure' },
            { key: 'tSpan', label: 'Target span', calc: (u, e) => orgTargetCalc(u, e).span, dp: 1, width: 70, group: 'target', section: 'Target structure' },
            { key: 'tSpanA', label: 'Target span assessment', calc: (u, e) => orgTargetCalc(u, e).spanAssessment, badge: true, width: 110, group: 'target', section: 'Target structure' },
            { key: 'tCost', label: 'Target employee cost ($)', type: 'money', width: 120, group: 'target', total: 'sum', section: 'Target structure' },
            { key: 'tNotes', label: 'Target notes', type: 'long', width: 200, group: 'target', section: 'Target structure' },
          ]} />
      </Card>
      <div className="grid g-2">
        <Card title="Span of control against benchmark" subtitle="Current (orange) and target (teal) span; shaded band is the benchmark range for the nature of work">
          <table className="table compact">
            <tbody>
              {units.filter((u) => u.c.span !== null || u.t.span !== null).map((u) => {
                const maxS = 22;
                const pos = (v) => `${Math.min(100, (v / maxS) * 100)}%`;
                return (
                  <tr key={u.id}>
                    <td style={{ width: '38%' }}>{u.name}<div className="xsmall muted">{u.nature}</div></td>
                    <td>
                      <div style={{ position: 'relative', height: 22, background: '#f1f4f8', borderRadius: 4 }}>
                        {u.c.range && <div style={{ position: 'absolute', left: pos(u.c.range.min), width: `calc(${pos(u.c.range.max)} - ${pos(u.c.range.min)})`, top: 0, bottom: 0, background: '#d9f0e1' }} />}
                        {u.c.span !== null && <div title={`Current ${u.c.span.toFixed(1)}`} style={{ position: 'absolute', left: pos(u.c.span), top: 4, width: 12, height: 12, borderRadius: 6, background: C.orange, transform: 'translateX(-6px)' }} />}
                        {u.t.span !== null && <div title={`Target ${u.t.span.toFixed(1)}`} style={{ position: 'absolute', left: pos(u.t.span), top: 4, width: 12, height: 12, borderRadius: 6, background: C.teal, transform: 'translateX(-6px)' }} />}
                      </div>
                    </td>
                    <td className="num small">{fmtNum(u.c.span, 1)} → {fmtNum(u.t.span, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <Card title="Workforce mix by business unit" subtitle="Current FTE by employment type">
          <VBars categories={units.filter((u) => u.c.total).map((u) => u.name)}
            series={[['perm', 'Permanent', C.navy3], ['fixed', 'Fixed-term', C.blue], ['contractor', 'Contractor', C.orange], ['outsourced', 'Outsourced', C.gold]].map(([k, n, col]) => ({ name: n, color: col, values: units.filter((u) => u.c.total).map((u) => num(u[k]) || 0) }))}
            stacked height={300} fmt={(v) => fmtNum(v)} />
        </Card>
      </div>
    </div>
  );
}

/* ---------------- Decision rights (RAPID) ---------------- */
const RAPID_COLORS = { R: '#2a78d6', A: '#8a5cd1', P: '#6b7c93', I: '#9aa5b4', D: '#0b1f3a' };
export function Decisions() {
  const { eng, set } = useStore();
  const [view, setView] = useState('current');
  const roles = eng.rapidRoles;
  const codes = eng.lists['RAPID code'];
  const decs = eng.decisions;
  const upd = (i, patch) => set('decisions', decs.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const setRole = (i, role, v) => {
    const map = { ...(decs[i][view] || {}) };
    if (v) map[role] = v; else delete map[role];
    upd(i, { [view]: map });
  };
  const renameRole = (k, name) => {
    const old = roles[k];
    set('rapidRoles', roles.map((r, j) => (j === k ? name : r)));
    set('decisions', decs.map((d) => {
      const fix = (m) => { const n = { ...m }; if (old in n) { n[name] = n[old]; delete n[old]; } return n; };
      return { ...d, current: fix(d.current || {}), target: fix(d.target || {}) };
    }));
  };
  const checks = decs.map((d) => decisionCheck(d[view]));
  const load = roles.map((r) => ({ role: r, D: decs.filter((d) => d[view]?.[r] === 'D').length, A: decs.filter((d) => d[view]?.[r] === 'A').length }));
  const days = view === 'current' ? 'days' : 'targetDays';
  return (
    <div className="stack">
      <PageHead eyebrow="Step 3 · Discover" title="Decision rights matrix (RAPID)"
        actions={<div className="chips">{[['current', 'Current state (as observed)'], ['target', 'Target state (designed)']].map(([k, l]) => <button key={k} className={`chip ${view === k ? 'on' : ''}`} onClick={() => setView(k)}>{l}</button>)}</div>}>
        R = Recommend · A = Agree (must sign off) · P = Perform · I = Input · D = Decide (exactly one per decision). Role headings can be renamed.
      </PageHead>
      <div className="grid g-4">
        <Stat label="Key decisions" value={decs.filter((d) => d.decision).length} sub={`${checks.filter((c) => c.check).length} mapped`} accent />
        <Stat label="Decisions with issues" value={checks.filter((c) => c.check && c.check !== 'OK').length} sub={`${checks.filter((c) => c.check === 'No decider').length} no decider · ${checks.filter((c) => c.check === 'Multiple deciders').length} multiple`} />
        <Stat label="Not in delegations" value={decs.filter((d) => d.documented === 'No').length} sub="Not documented in delegations" />
        <Stat label="Average decision time" value={`${fmtNum(avg(decs.map((d) => num(d[days]))), 0)} days`} sub={view === 'current' ? `Target ${fmtNum(avg(decs.map((d) => num(d.targetDays))), 0)} days` : 'Target state'} />
      </div>
      <Card pad={false} title={view === 'current' ? 'Current decision rights' : 'Target decision rights'} actions={
        <button className="btn btn-sm btn-primary" onClick={() => set('decisions', [...decs, { id: `DEC${String(decs.length + 1).padStart(2, '0')}`, decision: '', current: {}, target: {}, documented: '', days: '', targetDays: '', notes: '' }])}>+ Add decision</button>
      }>
        <div className="dg-wrap">
          <table className="dg">
            <thead>
              <tr>
                <th className="sticky">ID</th>
                <th style={{ minWidth: 260 }}>Key decision</th>
                {roles.map((r, k) => (
                  <th key={k} style={{ minWidth: 70, padding: 3 }}><input value={r} onChange={(e) => renameRole(k, e.target.value)} style={{ fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', padding: 3 }} aria-label={`Role ${k + 1}`} /></th>
                ))}
                <th className="calc">Decide roles</th><th className="calc">Check</th>
                <th>In delegations?</th><th>{view === 'current' ? 'Typical decision time (days)' : 'Target decision time (days)'}</th><th style={{ minWidth: 200 }}>Observations</th><th />
              </tr>
            </thead>
            <tbody>
              {decs.map((d, i) => (
                <tr key={d.id + i}>
                  <td className="sticky idcell">{d.id}</td>
                  <td><input value={d.decision} onChange={(e) => upd(i, { decision: e.target.value })} /></td>
                  {roles.map((r) => {
                    const v = d[view]?.[r] || '';
                    return (
                      <td key={r} style={{ padding: 2, background: v ? `${RAPID_COLORS[v]}18` : undefined }}>
                        <select value={v} onChange={(e) => setRole(i, r, e.target.value)} style={{ fontWeight: 700, color: RAPID_COLORS[v], textAlign: 'center' }}>
                          <option value="" />
                          {codes.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                    );
                  })}
                  <td className="calc">{checks[i].deciders ?? ''}</td>
                  <td className="calc">{checks[i].check && <Badge v={checks[i].check} />}</td>
                  <td><select value={d.documented || ''} onChange={(e) => upd(i, { documented: e.target.value })}><option value="" />{YNP.map((x) => <option key={x}>{x}</option>)}</select></td>
                  <td><input type="number" value={d[days] ?? ''} onChange={(e) => upd(i, { [days]: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
                  <td><input value={d.notes || ''} onChange={(e) => upd(i, { notes: e.target.value })} /></td>
                  <td className="rowtools">
                    <button className="icon-btn" title="Copy current to target" onClick={() => upd(i, { target: { ...(d.current || {}) } })}>⇢</button>
                    <button className="icon-btn danger" title="Delete" onClick={() => window.confirm(`Delete ${d.id}?`) && set('decisions', decs.filter((_, k) => k !== i))}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dg-foot"><span>⇢ copies a decision's current RAPID assignment to the target as a starting point.</span></div>
      </Card>
      <Card title="Decision load by role" subtitle="Decide (D) and Agree (A) rights held by each role — roles with many A rights are common bottlenecks">
        <VBars categories={load.map((l) => l.role)} series={[{ name: 'Decide (D)', color: C.navy, values: load.map((l) => l.D) }, { name: 'Agree (A)', color: C.purple, values: load.map((l) => l.A) }]} height={260} width={900} />
      </Card>
    </div>
  );
}

/* ---------------- Applications ---------------- */
export function Applications() {
  const { eng, set } = useStore();
  const s = eng.settings;
  const inv = inventorySummary(eng).apps;
  const pts = inv.list.filter((a) => isNum(a.businessFit) && isNum(a.technicalFit)).map((a) => ({
    id: a.id, label: a.name, x: Number(a.technicalFit), y: Number(a.businessFit), color: TIME_COLORS[a.time], r: 5 + Math.min(10, Math.sqrt((num(a.cost) || 0) / 40000)),
  }));
  const targetCost = sum(eng.applications.map((a) => (a.disposition === 'Retire' || a.disposition === 'Consolidate' ? 0 : isNum(a.targetCost) ? a.targetCost : a.cost)));
  return (
    <div className="stack">
      <PageHead eyebrow="Step 3 · Discover" title="Application portfolio">
        TIME classification from business and technical fit (threshold {s.timeFitThreshold}): Invest = high / high, Migrate = high business / low technical, Tolerate = low business / high technical, Eliminate = low / low.
      </PageHead>
      <div className="grid g-5">
        <Stat label="Applications" value={inv.count} sub={`${fmtMoney(inv.cost, { compact: true })} a year`} accent />
        <Stat label="End of life" value={inv.eol} sub={`${inv.expiring} support ending within ${s.expiryWarningDays} days`} />
        <Stat label="Critical applications" value={inv.criticality.Critical || 0} sub={`${inv.criticality.High || 0} high criticality`} />
        <Stat label="Eliminate or migrate" value={(inv.time.Eliminate || 0) + (inv.time.Migrate || 0)} sub="TIME candidates for change" />
        <CompareStat label="Portfolio run cost" from={fmtMoney(inv.cost, { compact: true })} to={fmtMoney(targetCost, { compact: true })} fromRaw={inv.cost} toRaw={targetCost} better="lower" fmtDelta={(d) => fmtMoney(d, { compact: true })} sub="Target reflects dispositions" />
      </div>
      <div className="grid g-2">
        <Card title="TIME quadrant" subtitle="Bubble size reflects annual cost">
          <Bubble points={pts} xLabel="Technical fit" yLabel="Business fit" xMin={1} yMin={1} threshold={s.timeFitThreshold} quadrants={['Migrate', 'Invest', 'Eliminate', 'Tolerate']} size={520} />
        </Card>
        <Card title="Classification & disposition">
          <Donut items={['Invest', 'Tolerate', 'Migrate', 'Eliminate'].map((t) => ({ label: t, value: inv.time[t] || 0, color: TIME_COLORS[t] }))} center={inv.count} sub="applications" />
          <div className="section-title mt-16" style={{ fontSize: 13 }}>Target disposition</div>
          <StackBar segments={eng.lists['Application disposition'].map((d, i) => ({ label: d, value: inv.disposition[d] || 0, color: PALETTE[i] }))} />
          <div className="section-title mt-16" style={{ fontSize: 13 }}>Hosting</div>
          <StackBar segments={eng.lists['Hosting model'].map((d, i) => ({ label: d, value: inv.hosting[d] || 0, color: PALETTE[i + 3] }))} />
        </Card>
      </div>
      <Card pad={false} title="Register">
        <DataGrid rows={eng.applications} onChange={(r) => set('applications', r)} idPrefix="A" idWidth={3} entity="application" titleKey="name" example={TK.examples.application}
          filters={['criticality', 'time', 'disposition']} ctx={s} newRow={() => ({})}
          columns={[
            { key: 'name', label: 'Application name', width: 190 },
            { key: 'description', label: 'Description / purpose', type: 'long', width: 220 },
            { key: 'capabilities', label: 'Capabilities supported', width: 180 },
            { key: 'businessOwner', label: 'Business owner', width: 140 },
            { key: 'technicalOwner', label: 'Technical owner', width: 140 },
            { key: 'vendor', label: 'Vendor / product (version)', width: 160 },
            { key: 'hosting', label: 'Hosting model', type: 'select', options: eng.lists['Hosting model'], width: 150 },
            { key: 'users', label: 'Users (#)', type: 'number', width: 80 },
            { key: 'criticality', label: 'Business criticality', type: 'select', options: eng.lists['Business criticality'], width: 100 },
            { key: 'cost', label: 'Annual cost ($)', type: 'money', width: 110, total: 'sum' },
            { key: 'supportEnd', label: 'Support / contract end', type: 'date', width: 130 },
            { key: 'supportStatus', label: 'Support status', type: 'select', options: eng.lists['Support status'], width: 130 },
            { key: 'businessFit', label: 'Business fit (1–5)', type: 'score', width: 70 },
            { key: 'technicalFit', label: 'Technical fit (1–5)', type: 'score', width: 70 },
            { key: 'time', label: 'TIME', calc: (a, st) => appCalc(a, st).time, badge: true, width: 90 },
            { key: 'days', label: 'Days to support end', calc: (a, st) => appCalc(a, st).days, width: 80 },
            { key: 'expiry', label: 'Expiry flag', calc: (a, st) => appCalc(a, st).expiry, badge: true, width: 90 },
            { key: 'classification', label: 'Data classification', type: 'select', options: eng.lists['Data classification'], width: 120 },
            { key: 'interfaces', label: 'Interfaces (#)', type: 'number', width: 70 },
            { key: 'overlap', label: 'Overlap / duplication', width: 180 },
            { key: 'notes', label: 'Observations', type: 'long', width: 200 },
            { key: 'disposition', label: 'Target disposition', type: 'select', options: eng.lists['Application disposition'], width: 120, group: 'target', section: 'Target state' },
            { key: 'targetCost', label: 'Target annual cost ($)', type: 'money', width: 110, group: 'target', total: 'sum', section: 'Target state' },
          ]} />
      </Card>
    </div>
  );
}

/* ---------------- Suppliers ---------------- */
export function Suppliers() {
  const { eng, set } = useStore();
  const s = eng.settings;
  const inv = inventorySummary(eng).suppliers;
  const total = inv.spend;
  const targetSpend = sum(eng.suppliers.map((x) => (x.targetAction === 'Exit' || x.targetAction === 'Insource' ? 0 : isNum(x.targetSpend) ? x.targetSpend : x.spend)));
  const segColors = { Strategic: C.navy3, Leverage: C.blue, Bottleneck: C.orange, 'Non-critical': C.grey };
  return (
    <div className="stack">
      <PageHead eyebrow="Step 3 · Discover" title="Supplier & sourcing register">
        Dependency risk: High = single source with no complete exit plan; Medium = single source with an exit plan, or a material service provider without a complete exit plan.
      </PageHead>
      <div className="grid g-5">
        <Stat label="Suppliers" value={inv.count} sub={`${fmtMoney(total, { compact: true })} annual spend`} accent />
        <Stat label="High dependency risk" value={inv.dependency.High || 0} sub={`${inv.dependency.Medium || 0} medium`} />
        <Stat label="Material service providers" value={inv.material} sub={`${inv.noExit} without a complete exit plan`} />
        <Stat label="Renewal decisions due" value={inv.renewals} sub={`Within ${s.expiryWarningDays} days or expired`} />
        <CompareStat label="Supplier spend" from={fmtMoney(total, { compact: true })} to={fmtMoney(targetSpend, { compact: true })} fromRaw={total} toRaw={targetSpend} better="lower" fmtDelta={(d) => fmtMoney(d, { compact: true })} />
      </div>
      <div className="grid g-2">
        <Card title="Spend by segment (Kraljic)">
          <Donut items={Object.keys(segColors).map((k) => ({ label: k, value: sum(inv.list.filter((x) => x.segment === k).map((x) => x.spend)), display: fmtMoney(sum(inv.list.filter((x) => x.segment === k).map((x) => x.spend)), { compact: true }), color: segColors[k] }))} center={fmtMoney(total, { compact: true })} sub="annual spend" />
        </Card>
        <Card title="Dependency risk">
          <StackBar segments={['High', 'Medium', 'Low'].map((k, i) => ({ label: k, value: inv.dependency[k] || 0, color: ['#d03b3b', '#f0a020', '#1f9d58'][i] }))} />
          <table className="table compact mt-16">
            <thead><tr><th>High-risk supplier</th><th className="num">Spend</th><th>Exit plan</th></tr></thead>
            <tbody>{inv.list.filter((x) => x.dependency === 'High').map((x) => <tr key={x.id}><td>{x.name}</td><td className="num">{fmtMoney(x.spend, { compact: true })}</td><td>{x.exitPlan || '—'}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
      <Card pad={false} title="Register">
        <DataGrid rows={eng.suppliers} onChange={(r) => set('suppliers', r)} idPrefix="SUP" idWidth={3} entity="supplier" titleKey="name" example={TK.examples.supplier}
          filters={['segment', 'dependency', 'targetAction']} ctx={{ total, s }}
          columns={[
            { key: 'name', label: 'Supplier', width: 190 },
            { key: 'services', label: 'Services provided', type: 'long', width: 220 },
            { key: 'supports', label: 'Capability / process supported', width: 180 },
            { key: 'segment', label: 'Segment', type: 'select', options: eng.lists['Supplier segment (Kraljic)'], width: 110 },
            { key: 'spend', label: 'Annual spend ($)', type: 'money', width: 110, total: 'sum' },
            { key: 'pct', label: '% of total spend', calc: (x, c) => supplierCalc(x, c.total, c.s).pct, type: 'percent', dp: 1, width: 80 },
            { key: 'start', label: 'Contract start', type: 'date', width: 130 },
            { key: 'end', label: 'Contract end', type: 'date', width: 130 },
            { key: 'days', label: 'Days to expiry', calc: (x, c) => supplierCalc(x, c.total, c.s).days, width: 80 },
            { key: 'renewal', label: 'Renewal flag', calc: (x, c) => supplierCalc(x, c.total, c.s).renewal, badge: true, width: 100 },
            { key: 'material', label: 'Material service provider?', type: 'yesno', width: 90 },
            { key: 'singleSource', label: 'Single source?', type: 'yesno', width: 80 },
            { key: 'exitPlan', label: 'Exit plan in place?', type: 'select', options: YNP, width: 90 },
            { key: 'dependency', label: 'Dependency risk', calc: (x, c) => supplierCalc(x, c.total, c.s).dependency, badge: 'risk', width: 90 },
            { key: 'performance', label: 'Performance (1–5)', type: 'score', width: 70 },
            { key: 'assurance', label: 'Security assurance', type: 'select', options: eng.lists['Security assurance'], width: 170 },
            { key: 'owner', label: 'Contract owner', width: 150 },
            { key: 'notes', label: 'Observations', type: 'long', width: 200 },
            { key: 'targetAction', label: 'Target action', type: 'select', options: eng.lists['Supplier target action'], width: 110, group: 'target', section: 'Target state' },
            { key: 'targetSpend', label: 'Target annual spend ($)', type: 'money', width: 110, group: 'target', total: 'sum', section: 'Target state' },
          ]} />
      </Card>
    </div>
  );
}

/* ---------------- Locations ---------------- */
export function Locations() {
  const { eng, set } = useStore();
  const s = eng.settings;
  const inv = inventorySummary(eng).locations;
  const tLocs = eng.locations.filter((l) => l.targetAction !== 'Exit');
  const tCost = sum(tLocs.map((l) => (isNum(l.targetCost) ? l.targetCost : l.cost)));
  return (
    <div className="stack">
      <PageHead eyebrow="Step 3 · Discover" title="Locations & property register">
        One row per site. Utilisation is average occupied workstations ÷ capacity, entered as a percentage.
      </PageHead>
      <div className="grid g-5">
        <Stat label="Sites" value={inv.count} sub={`${inv.critical} critical`} accent />
        <Stat label="Property cost" value={fmtMoney(inv.cost, { compact: true })} sub={`${fmtMoney(inv.fte ? inv.cost / inv.fte : null)} per FTE`} />
        <Stat label="Average utilisation" value={fmtPct(inv.utilisation)} sub={`${fmtNum(inv.capacity)} workstations`} />
        <Stat label="Leases expiring" value={inv.expiring} sub={`Within ${s.expiryWarningDays} days`} />
        <CompareStat label="Sites / property cost" from={`${inv.count} · ${fmtMoney(inv.cost, { compact: true })}`} to={`${tLocs.length} · ${fmtMoney(tCost, { compact: true })}`} fromRaw={inv.cost} toRaw={tCost} better="lower" fmtDelta={(d) => fmtMoney(d, { compact: true })} />
      </div>
      <Card pad={false} title="Register">
        <DataGrid rows={eng.locations} onChange={(r) => set('locations', r)} idPrefix="L" idWidth={2} entity="site" titleKey="name" example={TK.examples.location} ctx={s} filters={['type', 'tenure', 'targetAction']}
          columns={[
            { key: 'name', label: 'Site name', width: 180 },
            { key: 'city', label: 'City / state', width: 130 },
            { key: 'type', label: 'Site type', type: 'select', options: eng.lists['Site type'], width: 140 },
            { key: 'functions', label: 'Functions performed', type: 'long', width: 200 },
            { key: 'fte', label: 'FTE based at site', type: 'number', width: 80, total: 'sum' },
            { key: 'capacity', label: 'Workstations / capacity', type: 'number', width: 90, total: 'sum' },
            { key: 'utilisation', label: 'Average utilisation (%)', type: 'percent', width: 90 },
            { key: 'tenure', label: 'Tenure', type: 'select', options: eng.lists.Tenure, width: 130 },
            { key: 'leaseExpiry', label: 'Lease expiry', type: 'date', width: 130 },
            { key: 'days', label: 'Days to lease expiry', calc: (l, st) => locationCalc(l, st).days, width: 80 },
            { key: 'expiry', label: 'Expiry flag', calc: (l, st) => locationCalc(l, st).expiry, badge: true, width: 90 },
            { key: 'cost', label: 'Annual property cost ($)', type: 'money', width: 120, total: 'sum' },
            { key: 'cpf', label: 'Cost per FTE ($)', calc: (l, st) => locationCalc(l, st).costPerFte, type: 'money', width: 100 },
            { key: 'cpw', label: 'Cost per workstation ($)', calc: (l, st) => locationCalc(l, st).costPerWs, type: 'money', width: 100 },
            { key: 'critical', label: 'Critical site?', type: 'yesno', width: 80 },
            { key: 'bcp', label: 'Alternate / BCP site', width: 170 },
            { key: 'notes', label: 'Observations', type: 'long', width: 200 },
            { key: 'targetAction', label: 'Target action', type: 'select', options: eng.lists['Location target action'], width: 110, group: 'target', section: 'Target state' },
            { key: 'targetFte', label: 'Target FTE', type: 'number', width: 80, group: 'target', total: 'sum', section: 'Target state' },
            { key: 'targetCost', label: 'Target annual cost ($)', type: 'money', width: 120, group: 'target', total: 'sum', section: 'Target state' },
          ]} />
      </Card>
    </div>
  );
}

/* ---------------- Cost baseline ---------------- */
const costCols = (withChange) => [
  { key: 'unit', label: 'Business unit / function', width: 190 },
  ...COST_TYPES.map((t) => ({ key: t.key, label: `${t.label} ($)`, type: 'money', width: 120, total: 'sum' })),
  { key: 'total', label: 'Total cost ($)', calc: (c) => costRowTotal(c), type: 'money', width: 120, total: 'sum' },
  { key: 'pct', label: '% of total', calc: (c, ctx) => (ctx.total ? (costRowTotal(c) || 0) / ctx.total : null), type: 'percent', dp: 1, width: 70 },
  { key: 'fte', label: 'FTE', type: 'number', width: 70, total: 'sum' },
  { key: 'cpf', label: 'Cost per FTE ($)', calc: (c) => (num(c.fte) ? (costRowTotal(c) || 0) / num(c.fte) : null), type: 'money', width: 110 },
  ...(withChange ? [
    { key: 'change', label: 'Of which change / project spend ($)', type: 'money', width: 130, total: 'sum' },
    { key: 'changePct', label: 'Change spend %', calc: (c) => (num(c.change) !== null && costRowTotal(c) ? num(c.change) / costRowTotal(c) : null), type: 'percent', dp: 1, width: 80 },
  ] : []),
  { key: 'notes', label: 'Observations', type: 'long', width: 200 },
];

export function Costs() {
  const { eng, set } = useStore();
  const [tab, setTab] = useTab('baseline');
  const cur = costTotals(eng.costs), tgt = costTotals(eng.targetCosts);
  const copy = () => {
    if (eng.targetCosts.length && !window.confirm('Replace the target cost model with a copy of the current baseline?')) return;
    set('targetCosts', eng.costs.map((c, i) => ({ ...structuredClone(c), id: `TC${String(i + 1).padStart(2, '0')}` })));
  };
  const units = [...new Set([...eng.costs.map((c) => c.unit), ...eng.targetCosts.map((c) => c.unit)])].filter(Boolean);
  return (
    <div className="stack">
      <PageHead eyebrow="Step 3 · Discover" title="Cost baseline">
        Annual operating cost by business unit / function and cost type (latest full financial year), reconciled to the general ledger. The target cost model describes the run cost of the target operating model.
      </PageHead>
      <div className="grid g-4">
        <CompareStat label="Annual operating cost" from={fmtMoney(cur.total, { compact: true })} to={fmtMoney(tgt.total, { compact: true })} fromRaw={cur.total} toRaw={tgt.total} better="lower" fmtDelta={(d, f) => `${fmtMoney(d, { compact: true })} (${f ? ((d / f) * 100).toFixed(1) : 0}%)`} />
        <CompareStat label="FTE" from={fmtNum(cur.fte)} to={fmtNum(tgt.fte)} fromRaw={cur.fte} toRaw={tgt.fte} better="lower" />
        <CompareStat label="Cost per FTE" from={fmtMoney(cur.perFte)} to={fmtMoney(tgt.perFte)} fromRaw={cur.perFte} toRaw={tgt.perFte} better="lower" fmtDelta={(d) => fmtMoney(d)} />
        <Stat label="Change / project spend" value={fmtMoney(cur.change, { compact: true })} sub={`${fmtPct(cur.changePct, 1)} of operating cost`} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'baseline', label: 'Current baseline', count: eng.costs.length }, { id: 'target', label: 'Target cost model', count: eng.targetCosts.length }, { id: 'compare', label: 'Comparison' }]} />
      {tab === 'baseline' && (
        <>
          <Card pad={false}>
            <DataGrid rows={eng.costs} onChange={(r) => set('costs', r)} idPrefix="CB" idWidth={2} entity="cost line" titleKey="unit" example={TK.examples.cost} ctx={{ total: cur.total }} columns={costCols(true)} />
          </Card>
          <Card title="Cost by business unit and type">
            <VBars categories={eng.costs.map((c) => c.unit)} series={COST_TYPES.map((t, i) => ({ name: t.label, color: PALETTE[i], values: eng.costs.map((c) => num(c[t.key]) || 0) }))} stacked height={320} width={960} fmt={(v) => fmtMoney(v, { compact: true })} />
          </Card>
        </>
      )}
      {tab === 'target' && (
        <Card pad={false} title="Target cost model" subtitle="Annual run cost of the target operating model at steady state" actions={<button className="btn btn-sm" onClick={copy}>Copy current baseline</button>}>
          <DataGrid rows={eng.targetCosts} onChange={(r) => set('targetCosts', r)} idPrefix="TC" idWidth={2} entity="cost line" titleKey="unit" ctx={{ total: tgt.total }} columns={costCols(false)} emptyText="No target cost model yet — copy the current baseline and adjust it." />
        </Card>
      )}
      {tab === 'compare' && (
        <div className="grid g-2">
          <Card title="By cost type">
            <table className="table compact">
              <thead><tr><th>Cost type</th><th className="num">Current</th><th className="num">Target</th><th className="num">Change</th></tr></thead>
              <tbody>
                {COST_TYPES.map((t) => {
                  const d = tgt.byType[t.key] - cur.byType[t.key];
                  return <tr key={t.key}><td>{t.label}</td><td className="num">{fmtMoney(cur.byType[t.key], { compact: true })}</td><td className="num">{fmtMoney(tgt.byType[t.key], { compact: true })}</td><td className="num" style={{ color: d > 0 ? C.red : C.ok }}>{fmtMoney(d, { compact: true })}</td></tr>;
                })}
              </tbody>
              <tfoot><tr><td>Total</td><td className="num">{fmtMoney(cur.total, { compact: true })}</td><td className="num">{fmtMoney(tgt.total, { compact: true })}</td><td className="num">{fmtMoney(tgt.total - cur.total, { compact: true })}</td></tr></tfoot>
            </table>
          </Card>
          <Card title="By business unit">
            <table className="table compact">
              <thead><tr><th>Business unit</th><th className="num">Current</th><th className="num">Target</th><th className="num">Change</th></tr></thead>
              <tbody>
                {units.map((u) => {
                  const a = sum(eng.costs.filter((c) => c.unit === u).map(costRowTotal));
                  const b = sum(eng.targetCosts.filter((c) => c.unit === u).map(costRowTotal));
                  return <tr key={u}><td>{u}</td><td className="num">{a ? fmtMoney(a, { compact: true }) : '—'}</td><td className="num">{b ? fmtMoney(b, { compact: true }) : '—'}</td><td className="num" style={{ color: b - a > 0 ? C.red : C.ok }}>{fmtMoney(b - a, { compact: true })}</td></tr>;
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
