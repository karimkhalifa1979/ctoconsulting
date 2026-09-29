import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Stat, Tabs, useTab, Badge, ScoreButtons, Field, TextArea, TextInput, StackBar, mClass, Progress } from '../components/ui.jsx';
import DataGrid from '../components/DataGrid.jsx';
import { Radar, Gauge, Bubble, HBar, C } from '../components/charts.jsx';
import { AI_PILLARS, AI_QUESTIONS, AI_LEVELS, GUARDRAILS, ETHICS_PRINCIPLES } from '../data/aiReadiness.js';
import { pillarStats, aiOverall, useCaseCalc, aiActionPlan } from '../lib/aiCalc.js';
import { nextId } from '../lib/model.js';
import { fmtScore, fmtMoney, num } from '../lib/format.js';

const TIER_COLORS = { Minimal: '#1f9d58', Limited: '#2a78d6', High: '#eb6834', Prohibited: '#d03b3b' };
const PILLAR_DIM = { STR: 'D01', VAL: 'D04', DAT: 'D12', TEC: 'D11', PPL: 'D08', GOV: 'D07', SEC: 'D15', OPM: 'D17' };
const GUARD_COLORS = { Implemented: '#1f9d58', 'In progress': '#f2c14e', Planned: '#2a78d6', 'Not started': '#cfd7e2', 'Not applicable': '#9aa5b4' };
const ETHICS_STATUS = ['Addressed', 'Partially addressed', 'Not addressed', 'Not applicable'];

export default function AiReadiness() {
  const { eng, setPath, update, notify } = useStore();
  const [tab, setTab] = useTab('overview');
  const ps = pillarStats(eng);
  const o = aiOverall(eng);
  const r = eng.ai.responses;
  const uc = eng.ai.useCases.map((u) => ({ ...u, ...useCaseCalc(u) }));
  const plan = aiActionPlan(eng);

  const addRec = (pillar, text, horizon) => {
    const id = nextId(eng.recommendations, 'R', 3);
    update((e) => ({ ...e, recommendations: [...e.recommendations, { id, dim: PILLAR_DIM[pillar.id], recommendation: text, findings: '', benefits: `AI readiness: ${pillar.name}`, value: 4, ease: 3, horizon, cost: '', owner: '', dependencies: '', risks: '', status: 'Proposed' }] }));
    notify(`Added ${id} to Recommendations.`);
  };
  const toInitiative = (u) => {
    if (eng.initiatives.some((i) => String(i.description).includes(u.id))) { notify(`${u.id} already has an initiative.`); return; }
    const id = nextId(eng.initiatives, 'I', 2);
    update((e) => ({
      ...e,
      initiatives: [...e.initiatives, { id, name: `AI: ${u.name}`, type: 'AI use case', dims: 'D11; D12', recs: '', description: `${u.description} (use case ${u.id})`, owner: u.owner, start: '', end: '', status: 'Proposed', rag: '' }],
      costLines: num(u.cost) ? [...e.costLines, { id: nextId(e.costLines, 'CL', 3), initiativeId: id, description: `${u.name} — build`, category: 'Capex', costType: 'Contractors & consultants', nature: 'One-off', planned: [Number(u.cost)], actual: [] }] : e.costLines,
      benefitLines: num(u.benefit) ? [...e.benefitLines, { id: nextId(e.benefitLines, 'BL', 3), initiativeId: id, description: `${u.name} — annual benefit`, type: 'Productivity (time released)', class: 'Non-cashable', kpi: '', baseline: '', target: '', unit: '', owner: u.owner, confidence: 60, status: 'Not started', planned: [0, Number(u.benefit), Number(u.benefit), Number(u.benefit), Number(u.benefit)], actual: [] }] : e.benefitLines,
    }));
    notify(`Initiative ${id} created in Benefits & costs.`);
  };

  return (
    <div className="stack">
      <PageHead eyebrow="Step 4 · Assess" title="AI readiness">
        Assess the organisation's readiness to adopt AI safely and at scale across eight pillars, prioritise AI use cases, check responsible AI guardrails and generate a gap-based action plan.
        Aligned to Australia's AI Ethics Principles, the Voluntary AI Safety Standard, ISO/IEC 42001 and the NIST AI RMF.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'questions', label: 'Readiness diagnostic', count: `${o.scored}/${o.total}` },
        { id: 'usecases', label: 'Use cases', count: uc.length },
        { id: 'guardrails', label: 'Guardrails & ethics' },
        { id: 'plan', label: 'Action plan' },
      ]} />

      {tab === 'overview' && (
        <>
          <div className="grid g-4">
            <Card><div className="center"><Gauge value={o.index} label="AI readiness index" sub="AI readiness index (0–100)" /></div><div className="center small muted">Target {o.targetIndex ?? '—'} · {o.scored} of {o.total} questions scored</div></Card>
            <Card title={o.level ? `Level ${o.level.level}: ${o.level.name}` : 'Not yet assessed'}>
              <p className="small">{o.level?.description || 'Score the readiness diagnostic to calculate the level.'}</p>
              {o.targetLevel && <p className="small muted">Target: Level {o.targetLevel.level} — {o.targetLevel.name}</p>}
            </Card>
            <Stat label="Guardrails in place" value={`${o.guardrails.implemented} / ${o.guardrails.applicable}`} sub={`${o.guardrails.inProgress} in progress`} />
            <Stat label="AI use cases" value={o.useCases.count} sub={`${o.useCases.byQuadrant['Prioritise now'] || 0} to prioritise now · ${fmtMoney(o.useCases.benefit, { compact: true })} estimated benefit`} />
          </div>
          <div className="grid g-2">
            <Card title="Readiness by pillar" subtitle="Current (orange) versus target (teal), 1–5">
              <Radar labels={ps.map((p) => p.short)} series={[{ name: 'Current', color: C.orange, values: ps.map((p) => p.current || 0) }, { name: 'Target', color: C.teal, values: ps.map((p) => p.target || 0), fill: 0.08 }]} size={420} />
            </Card>
            <Card title="Pillar scores" subtitle="Linked operating model questions give a cross-check from the main assessment" pad={false}>
              <table className="table">
                <thead><tr><th>Pillar</th><th className="num">Current</th><th className="num">Target</th><th className="num">Gap</th><th>Level</th><th className="num">OM check</th></tr></thead>
                <tbody>
                  {ps.map((p) => (
                    <tr key={p.id}>
                      <td className="strong">{p.name}<div className="xsmall muted">{p.description}</div></td>
                      <td className="num"><span className={`badge ${mClass(p.current)}`}>{fmtScore(p.current)}</span></td>
                      <td className="num">{fmtScore(p.target)}</td>
                      <td className="num strong">{fmtScore(p.gap)}</td>
                      <td className="nowrap small">{p.level?.name || '—'}</td>
                      <td className="num" title={`Average current score of ${p.links.join(', ')} in the operating model assessment`}>{fmtScore(p.linkedCurrent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
          <div className="grid g-2">
            <Card title="AI context">
              <div className="form-grid">
                <Field label="AI strategy" className="full"><TextArea rows={2} value={eng.ai.context.aiStrategy} onChange={(v) => setPath(['ai', 'context', 'aiStrategy'], v)} /></Field>
                <Field label="Accountable AI executive / official"><TextInput value={eng.ai.context.accountableOfficial} onChange={(v) => setPath(['ai', 'context', 'accountableOfficial'], v)} /></Field>
                <Field label="Known AI systems (inventory)"><TextInput value={eng.ai.context.aiInventoryCount} onChange={(v) => setPath(['ai', 'context', 'aiInventoryCount'], v)} /></Field>
                <Field label="Generative AI policy status" className="full"><TextInput value={eng.ai.context.genAiPolicy} onChange={(v) => setPath(['ai', 'context', 'genAiPolicy'], v)} /></Field>
                <Field label="Notes" className="full"><TextArea rows={2} value={eng.ai.context.notes} onChange={(v) => setPath(['ai', 'context', 'notes'], v)} /></Field>
              </div>
            </Card>
            <Card title="Readiness levels">
              <table className="table compact">
                <tbody>{AI_LEVELS.map((l) => (
                  <tr key={l.level} style={o.level?.level === l.level ? { background: 'var(--brand-teal-soft)' } : undefined}>
                    <td className="nowrap"><span className={`badge m${l.level}`}>{l.level}</span> <strong>{l.name}</strong></td>
                    <td className="small">{l.description}</td>
                  </tr>
                ))}</tbody>
              </table>
              <div className="section-title mt-16" style={{ fontSize: 13 }}>Guardrail status</div>
              <StackBar segments={Object.keys(GUARD_COLORS).map((k) => ({ label: k, value: o.guardrails.counts[k] || 0, color: GUARD_COLORS[k] }))} />
            </Card>
          </div>
        </>
      )}

      {tab === 'questions' && AI_PILLARS.map((p) => {
        const st = ps.find((x) => x.id === p.id);
        const linked = eng.questions.filter((q) => p.links.includes(q.id));
        return (
          <div key={p.id} className="card dim-block">
            <div className="dim-head" style={{ cursor: 'default' }}>
              <span className="code">AI.{p.id}</span>
              <h3>{p.name}</h3>
              <span className="small muted">{st.scored}/{st.questions} scored</span>
              <span className={`badge ${mClass(st.current)}`}>Current {fmtScore(st.current)}</span>
              <span className="badge badge-navy">Target {fmtScore(st.target)}</span>
            </div>
            <div style={{ padding: '0 18px 12px' }}>
              <p className="small" style={{ color: 'var(--ink-2)' }}>{p.description}</p>
              <div className="maturity-strip">{p.levels.map((t, i) => <div key={i} className={`m${i + 1}`}><strong>{i + 1} · {AI_LEVELS[i].name}</strong>{t}</div>)}</div>
              {linked.length > 0 && (
                <p className="xsmall muted mt-8">Cross-check with the operating model assessment: {linked.map((q) => `${q.id} ${q.sub} (${q.current === '' ? '—' : q.current})`).join(' · ')}</p>
              )}
            </div>
            {AI_QUESTIONS.filter((q) => q.pillar === p.id).map((q) => {
              const v = r[q.id] || {};
              const set = (k) => (val) => setPath(['ai', 'responses', q.id, k], val);
              return (
                <div key={q.id} className="q-row">
                  <div className="qid">{q.id.replace('AI.', '')}</div>
                  <div>
                    <div className="qsub">{q.sub}</div>
                    <div className="qtext">{q.question}</div>
                    <div className="good"><strong>What good looks like:</strong> {q.good}</div>
                    <div className="grid g-2" style={{ gap: 8 }}>
                      <input type="text" value={v.evidence || ''} placeholder="Evidence" onChange={(e) => set('evidence')(e.target.value)} />
                      <input type="text" value={v.notes || ''} placeholder="Notes" onChange={(e) => set('notes')(e.target.value)} />
                    </div>
                  </div>
                  <div className="q-controls">
                    <span className="lbl">Current</span><ScoreButtons value={v.current ?? ''} onChange={set('current')} />
                    <span className="lbl">Target</span><ScoreButtons value={v.target ?? ''} onChange={set('target')} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {tab === 'usecases' && (
        <>
          <div className="grid g-21">
            <Card title="Use-case prioritisation" subtitle="Value × feasibility; colour shows risk tier. Numbers are use-case IDs.">
              <Bubble points={uc.filter((u) => u.priority).map((u) => ({ id: u.id, label: u.name, x: Number(u.feasibility), y: Number(u.value), color: TIER_COLORS[u.riskTier] || C.grey, r: 7 + Math.min(10, Math.sqrt((num(u.benefit) || 0) / 30000)) }))}
                xLabel="Feasibility (data, technology, skills)" yLabel="Value" xMin={1} yMin={1} quadrants={['Build foundations', 'Prioritise now', 'Park', 'Opportunistic']} size={600} />
              <div className="legend">{Object.entries(TIER_COLORS).map(([k, c]) => <span key={k}><i style={{ background: c }} />{k} risk</span>)}</div>
            </Card>
            <Card title="Pipeline">
              <div className="stack-sm">
                {['Prioritise now', 'Build foundations', 'Opportunistic', 'Park', 'Do not proceed'].map((qd) => {
                  const list = uc.filter((u) => u.quadrant === qd);
                  if (!list.length) return null;
                  return (
                    <div key={qd}>
                      <div className="row between"><Badge v={qd} /><span className="xsmall muted">{list.length}</span></div>
                      {list.map((u) => (
                        <div key={u.id} className="row between small" style={{ padding: '4px 0', borderBottom: '1px dashed var(--line)' }}>
                          <span>{u.id} · {u.name} {u.needsImpactAssessment && <Badge v="High" kind="tier">Impact assessment</Badge>}</span>
                          <button className="btn btn-xs" onClick={() => toInitiative(u)}>→ Initiative</button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
          <Card pad={false} title="Use-case register">
            <DataGrid rows={eng.ai.useCases} onChange={(rows) => setPath(['ai', 'useCases'], rows)} idPrefix="UC" idWidth={2} entity="use case" titleKey="name" filters={['aiType', 'riskTier', 'status']}
              newRow={() => ({ status: 'Idea', riskTier: 'Limited' })}
              columns={[
                { key: 'name', label: 'Use case', width: 200 },
                { key: 'area', label: 'Business area', width: 150 },
                { key: 'description', label: 'Description', type: 'long', width: 260 },
                { key: 'aiType', label: 'AI type', type: 'select', options: eng.lists['AI type'], width: 200 },
                { key: 'value', label: 'Value (1–5)', type: 'score', width: 70 },
                { key: 'feasibility', label: 'Feasibility (1–5)', type: 'score', width: 70 },
                { key: 'priority', label: 'Priority', calc: (u) => useCaseCalc(u).priority, width: 60 },
                { key: 'quadrant', label: 'Recommendation', calc: (u) => useCaseCalc(u).quadrant, badge: true, width: 130 },
                { key: 'riskTier', label: 'Risk tier', type: 'select', options: eng.lists['AI risk tier'], width: 100, help: 'High: significant effect on people (e.g. eligibility, employment, safety) — impact assessment and human oversight required' },
                { key: 'dataReadiness', label: 'Data readiness', type: 'select', options: eng.lists['Data readiness'], width: 120 },
                { key: 'benefit', label: 'Est. annual benefit ($)', type: 'money', width: 120, total: 'sum' },
                { key: 'cost', label: 'Est. cost ($)', type: 'money', width: 110, total: 'sum' },
                { key: 'status', label: 'Status', type: 'select', options: eng.lists['Use case status'], width: 100 },
                { key: 'owner', label: 'Owner', width: 150 },
                { key: 'notes', label: 'Notes', type: 'long', width: 200 },
              ]} />
          </Card>
        </>
      )}

      {tab === 'guardrails' && (
        <div className="stack">
          <Card title="Responsible AI guardrails" subtitle="Voluntary AI Safety Standard (Australian Government) with ISO/IEC 42001 and NIST AI RMF cross-references. The National AI Centre's Guidance for AI Adoption builds on these guardrails." pad={false}>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th style={{ width: 40 }}>#</th><th>Guardrail</th><th style={{ width: 150 }}>Status</th><th style={{ width: 170 }}>Owner</th><th>Evidence / notes</th></tr></thead>
                <tbody>
                  {GUARDRAILS.map((g) => {
                    const v = eng.ai.guardrails[g.id] || {};
                    const set = (k) => (e) => setPath(['ai', 'guardrails', g.id, k], e.target.value);
                    return (
                      <tr key={g.id}>
                        <td className="strong">{g.id}</td>
                        <td><strong>{g.title}</strong><div className="small">{g.text}</div><div className="xsmall muted">NIST AI RMF: {g.nist} · ISO/IEC 42001: {g.iso}</div></td>
                        <td><select value={v.status || ''} onChange={set('status')}><option value="" />{eng.lists['Guardrail status'].map((s) => <option key={s}>{s}</option>)}</select>{v.status && <div className="mt-8"><Badge v={v.status} /></div>}</td>
                        <td><input type="text" value={v.owner || ''} onChange={set('owner')} /></td>
                        <td><textarea rows={2} value={v.evidence || ''} onChange={set('evidence')} placeholder="Evidence" /><input type="text" value={v.notes || ''} onChange={set('notes')} placeholder="Notes" style={{ marginTop: 4 }} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Australia's AI Ethics Principles" subtitle="How well current AI practices address each principle" pad={false}>
            <table className="table">
              <thead><tr><th>Principle</th><th style={{ width: 200 }}>Status</th><th>Notes</th></tr></thead>
              <tbody>
                {ETHICS_PRINCIPLES.map((p) => {
                  const v = eng.ai.ethics[p.id] || {};
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.title}</strong><div className="small muted">{p.text}</div></td>
                      <td><select value={v.status || ''} onChange={(e) => setPath(['ai', 'ethics', p.id, 'status'], e.target.value)}><option value="" />{ETHICS_STATUS.map((s) => <option key={s}>{s}</option>)}</select></td>
                      <td><input type="text" value={v.notes || ''} onChange={(e) => setPath(['ai', 'ethics', p.id, 'notes'], e.target.value)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === 'plan' && (
        <div className="stack">
          <div className="callout small">Actions are selected for each pillar according to its current stage — <strong>foundation</strong> (below 2.5), <strong>establish</strong> (2.5–3.5) or <strong>scale</strong> (3.5 and above) — and ordered by the size of the gap to target. Add any action to the recommendations register.</div>
          <Card title="Gap by pillar">
            <HBar items={ps.map((p) => ({ label: p.name, value: p.gap ?? 0, color: (p.gap ?? 0) >= 1.5 ? C.red : (p.gap ?? 0) >= 0.75 ? C.amber : C.ok }))} max={4} fmt={(v) => Number(v).toFixed(1)} width={760} labelW={240} />
          </Card>
          {plan.map(({ pillar, horizon, actions }) => (
            <Card key={pillar.id} title={`${pillar.name}`} subtitle={`Current ${fmtScore(pillar.current)} → target ${fmtScore(pillar.target)} · stage: ${pillar.stage} · suggested horizon ${horizon}`}>
              <Progress value={(pillar.current || 0) / 5} />
              <ul className="list-plain mt-8">
                {actions.map((a) => (
                  <li key={a} className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                    <span className="small">{a}</span>
                    <button className="btn btn-xs" onClick={() => addRec(pillar, a, horizon)} style={{ flex: 'none' }}>+ Recommendation</button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {!plan.length && <div className="empty">Score the readiness diagnostic to generate the action plan.</div>}
        </div>
      )}
    </div>
  );
}
