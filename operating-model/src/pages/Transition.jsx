import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Stat, Tabs, useTab, Badge, StackBar } from '../components/ui.jsx';
import DataGrid from '../components/DataGrid.jsx';
import { RiskMatrix, VBars, HBar, C, PALETTE } from '../components/charts.jsx';
import { CHANGE_AREAS, ADKAR, RISK_MATRIX_LABELS } from '../data/tomLibrary.js';
import { riskScore, riskRating, countBy, sum, avg } from '../lib/calc.js';
import { parseDate, fmtDate, num } from '../lib/format.js';
import { dimSelect } from './Findings.jsx';

const STATUS_COLORS = { Proposed: '#9aa5b4', Approved: '#2a78d6', 'In delivery': '#0fa3b1', Complete: '#1f9d58', 'On hold': '#f0a020', Cancelled: '#d03b3b' };
const HEAT = ['#f3f5f8', '#fdf0cc', '#fbd9b8', '#f2a67a'];

export function Gantt({ items }) {
  const rows = items.filter((i) => parseDate(i.start) && parseDate(i.end));
  if (!rows.length) return <p className="small muted">Add start and end dates to initiatives to see the roadmap.</p>;
  const min = new Date(Math.min(...rows.map((r) => parseDate(r.start))));
  const max = new Date(Math.max(...rows.map((r) => parseDate(r.end))));
  min.setDate(1); max.setMonth(max.getMonth() + 1, 1);
  const span = max - min || 1;
  const pos = (d) => `${((parseDate(d) - min) / span) * 100}%`;
  const ticks = [];
  for (let d = new Date(min); d <= max; d.setMonth(d.getMonth() + 3)) ticks.push(new Date(d));
  const today = new Date();
  return (
    <div className="gantt">
      <div className="gantt-scale"><div /><div className="ticks">{ticks.map((t) => <span key={t.toISOString()} style={{ left: `${((t - min) / span) * 100}%` }}>{t.toLocaleString('en-AU', { month: 'short', year: '2-digit' })}</span>)}</div></div>
      {rows.map((r) => (
        <div key={r.id} className="gantt-row">
          <div className="gantt-label" title={r.name}><strong>{r.id}</strong> {r.name}</div>
          <div className="gantt-track">
            {ticks.map((t) => <div key={t.toISOString()} className="gantt-grid" style={{ left: `${((t - min) / span) * 100}%` }} />)}
            {today > min && today < max && <div className="gantt-grid" style={{ left: `${((today - min) / span) * 100}%`, background: C.red, width: 2 }} title="Today" />}
            <div className="gantt-bar" style={{ left: pos(r.start), width: `calc(${pos(r.end)} - ${pos(r.start)})`, background: STATUS_COLORS[r.status] || C.blue }} title={`${r.name}: ${fmtDate(r.start)} – ${fmtDate(r.end)} (${r.status})`}>{r.status}</div>
          </div>
        </div>
      ))}
      <div className="legend">{Object.entries(STATUS_COLORS).map(([k, c]) => <span key={k}><i style={{ background: c }} />{k}</span>)}<span><i style={{ background: C.red }} />Today</span></div>
    </div>
  );
}

export const barrierOf = (g) => {
  const vals = ADKAR.map((a) => ({ a, v: num(g[a.id]) })).filter((x) => x.v !== null);
  if (!vals.length) return null;
  // ADKAR is sequential: the first element scoring 3 or less is the barrier point.
  return (vals.find((x) => x.v <= 3) || null)?.a || null;
};
export const impactScore = (g) => sum(CHANGE_AREAS.map((a) => g[a.id]));

export default function Transition() {
  const { eng, set } = useStore();
  const [tab, setTab] = useTab('roadmap');
  const risks = eng.risks.map((r) => ({ ...r, score: riskScore(r.likelihood, r.impact), rscore: riskScore(r.residualLikelihood, r.residualImpact) }));
  const reqs = eng.requirements;
  const ci = eng.changeImpacts;
  const initOpts = eng.initiatives.map((i) => ({ value: i.id, label: `${i.id} ${i.name}` }));
  const impacted = sum(ci.filter((g) => impactScore(g) >= 12).map((g) => g.headcount));

  return (
    <div className="stack">
      <PageHead eyebrow="Step 5 · Design" title="Transition & change">
        Plan the move from the current to the target operating model: the initiative roadmap, implementation requirements, change impacts and readiness (ADKAR), change activities and transition risks.
      </PageHead>
      <div className="grid g-5">
        <Stat label="Initiatives" value={eng.initiatives.length} sub={`${eng.initiatives.filter((i) => i.status === 'In delivery').length} in delivery`} accent />
        <Stat label="Implementation requirements" value={reqs.length} sub={`${reqs.filter((r) => r.priority === 'Must have').length} must have · ${reqs.filter((r) => r.status === 'Complete').length} complete`} />
        <Stat label="Heavily impacted people" value={impacted.toLocaleString()} sub="Groups with impact score ≥ 12 of 24" />
        <Stat label="Change activities" value={eng.changeActivities.length} sub={`${eng.changeActivities.filter((a) => a.status === 'Complete').length} complete`} />
        <Stat label="High & extreme risks" value={risks.filter((r) => r.score >= 12).length} sub={`${risks.filter((r) => r.rscore >= 12).length} after mitigation`} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'roadmap', label: 'Roadmap' }, { id: 'requirements', label: 'Implementation requirements', count: reqs.length }, { id: 'impact', label: 'Change impact & readiness', count: ci.length },
        { id: 'activities', label: 'Change activities', count: eng.changeActivities.length }, { id: 'risks', label: 'Risks', count: risks.length },
      ]} />

      {tab === 'roadmap' && (
        <>
          <Card title="Initiative roadmap" subtitle="From Benefits & costs: initiatives with start and end dates"><Gantt items={eng.initiatives} /></Card>
          <Card title="Recommendations by horizon">
            <VBars categories={eng.lists.Horizon} series={['Quick win', 'Strategic initiative', 'Fill-in', 'Deprioritise'].map((c, i) => ({ name: c, color: ['#1f9d58', '#2a78d6', '#f2b33d', '#9aa5b4'][i], values: eng.lists.Horizon.map((h) => eng.recommendations.filter((r) => r.horizon === h && (Number(r.value) >= eng.settings.priorityThreshold ? (Number(r.ease) >= eng.settings.priorityThreshold ? 'Quick win' : 'Strategic initiative') : (Number(r.ease) >= eng.settings.priorityThreshold ? 'Fill-in' : 'Deprioritise')) === c).length) }))} stacked height={260} width={760} />
          </Card>
        </>
      )}

      {tab === 'requirements' && (
        <>
          <div className="grid g-2">
            <Card title="By category"><HBar items={eng.lists['Requirement category'].map((c, i) => ({ label: c, value: reqs.filter((r) => r.category === c).length, color: PALETTE[i % PALETTE.length] }))} width={560} labelW={200} /></Card>
            <Card title="By horizon and status">
              <VBars categories={eng.lists.Horizon} series={eng.lists['Requirement status'].map((s, i) => ({ name: s, color: ['#cfd7e2', '#f2c14e', '#1f9d58', '#d03b3b'][i], values: eng.lists.Horizon.map((h) => reqs.filter((r) => r.horizon === h && r.status === s).length) }))} stacked height={240} width={560} />
            </Card>
          </div>
          <Card pad={false} title="Requirements register" subtitle="What must be in place — people, process, technology, data, governance, facilities, suppliers, funding — to implement the target operating model">
            <DataGrid rows={reqs} onChange={(r) => set('requirements', r)} idPrefix="IR" idWidth={3} entity="requirement" titleKey="requirement" filters={['category', 'priority', 'horizon', 'status']}
              newRow={() => ({ status: 'Not started', priority: 'Must have' })}
              columns={[
                { key: 'dim', label: 'Dimension', type: 'select', options: dimSelect, width: 190 },
                { key: 'category', label: 'Category', type: 'select', options: eng.lists['Requirement category'], width: 180 },
                { key: 'requirement', label: 'Requirement', type: 'long', width: 360 },
                { key: 'initiative', label: 'Initiative', type: 'select', options: initOpts, width: 170 },
                { key: 'priority', label: 'Priority', type: 'select', options: eng.lists['Requirement priority'], width: 110 },
                { key: 'horizon', label: 'Horizon', type: 'select', options: eng.lists.Horizon, width: 120 },
                { key: 'owner', label: 'Owner', width: 150 },
                { key: 'status', label: 'Status', type: 'select', options: eng.lists['Requirement status'], width: 110 },
                { key: 'notes', label: 'Notes', type: 'long', width: 200 },
              ]} />
          </Card>
        </>
      )}

      {tab === 'impact' && (
        <>
          <Card title="Change impact heat map" subtitle="Degree of change for each stakeholder group (0 none – 3 high); click a cell to change it">
            <div className="table-wrap">
              <table className="table compact heat">
                <thead><tr><th>Stakeholder group</th><th className="num">People</th>{CHANGE_AREAS.map((a) => <th key={a.id} className="center">{a.name}</th>)}<th className="num">Score /24</th><th>ADKAR barrier</th></tr></thead>
                <tbody>
                  {ci.map((g, i) => {
                    const b = barrierOf(g);
                    return (
                      <tr key={g.id}>
                        <td className="strong">{g.group}</td>
                        <td className="num">{Number(g.headcount || 0).toLocaleString()}</td>
                        {CHANGE_AREAS.map((a) => {
                          const v = num(g[a.id]) || 0;
                          return <td key={a.id} className="cell" style={{ background: HEAT[v], cursor: 'pointer' }} title="Click to cycle 0–3" onClick={() => set('changeImpacts', ci.map((x, k) => (k === i ? { ...x, [a.id]: (v + 1) % 4 } : x)))}>{['–', 'L', 'M', 'H'][v]}</td>;
                        })}
                        <td className="num strong">{impactScore(g)}</td>
                        <td>{b ? <Badge v="At risk">{b.name}</Badge> : <Badge v="On track">Ready</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="grid g-2">
            <Card title="ADKAR readiness by group" subtitle="Average of Awareness, Desire, Knowledge, Ability, Reinforcement (1–5)">
              <HBar items={ci.map((g) => ({ label: g.group, value: +(avg(ADKAR.map((a) => num(g[a.id]))) || 0).toFixed(1), color: (avg(ADKAR.map((a) => num(g[a.id]))) || 0) < 2.5 ? C.red : (avg(ADKAR.map((a) => num(g[a.id]))) || 0) < 3.5 ? C.amber : C.ok }))} max={5} fmt={(v) => Number(v).toFixed(1)} width={600} labelW={240} />
            </Card>
            <Card title="Interventions for the barrier points">
              {ADKAR.map((a) => {
                const groups = ci.filter((g) => barrierOf(g)?.id === a.id);
                return (
                  <div key={a.id} style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
                    <div className="row between"><strong className="small">{a.name} <span className="muted">{a.of}</span></strong><span className="xsmall muted">{groups.length} groups</span></div>
                    <div className="small">{a.interventions}</div>
                    {groups.length > 0 && <div className="xsmall muted">{groups.map((g) => g.group).join(' · ')}</div>}
                  </div>
                );
              })}
            </Card>
          </div>
          <Card pad={false} title="Impact & readiness register">
            <DataGrid rows={ci} onChange={(r) => set('changeImpacts', r)} idPrefix="CI" idWidth={2} entity="stakeholder group" titleKey="group"
              newRow={() => Object.fromEntries([...CHANGE_AREAS.map((a) => [a.id, 0]), ...ADKAR.map((a) => [a.id, 3])])}
              columns={[
                { key: 'group', label: 'Stakeholder group', width: 220 },
                { key: 'headcount', label: 'People', type: 'number', width: 80, total: 'sum' },
                ...CHANGE_AREAS.map((a) => ({ key: a.id, label: a.name, type: 'score', options: [0, 1, 2, 3], width: 80, section: 'Impact (0–3)' })),
                { key: 'score', label: 'Impact score', calc: (g) => impactScore(g), width: 70 },
                ...ADKAR.map((a) => ({ key: a.id, label: a.name, type: 'score', width: 80, section: 'ADKAR readiness (1–5)', group: 'target' })),
                { key: 'barrier', label: 'Barrier point', calc: (g) => barrierOf(g)?.name || 'Ready', width: 110 },
                { key: 'notes', label: 'Notes', type: 'long', width: 220 },
              ]} />
          </Card>
        </>
      )}

      {tab === 'activities' && (
        <>
          <Card><StackBar segments={eng.lists['Change activity type'].map((t, i) => ({ label: t, value: eng.changeActivities.filter((a) => a.type === t).length, color: PALETTE[i] }))} /></Card>
          <Card pad={false} title="Change management plan">
            <DataGrid rows={eng.changeActivities} onChange={(r) => set('changeActivities', r)} idPrefix="CA" idWidth={2} entity="activity" titleKey="activity" filters={['type', 'timing', 'status']} newRow={() => ({ status: 'Planned' })}
              columns={[
                { key: 'activity', label: 'Activity', type: 'long', width: 340 },
                { key: 'type', label: 'Type', type: 'select', options: eng.lists['Change activity type'], width: 150 },
                { key: 'audience', label: 'Audience', width: 220 },
                { key: 'timing', label: 'Timing', type: 'select', options: eng.lists.Horizon, width: 120 },
                { key: 'owner', label: 'Owner', width: 160 },
                { key: 'status', label: 'Status', type: 'select', options: eng.lists['Activity status'], width: 110 },
              ]} />
          </Card>
        </>
      )}

      {tab === 'risks' && (
        <>
          <div className="grid g-3">
            <Card title="Inherent risk"><RiskMatrix risks={risks.map((r) => ({ id: r.id, l: num(r.likelihood), i: num(r.impact) }))} likelihoodLabels={RISK_MATRIX_LABELS.likelihood} impactLabels={RISK_MATRIX_LABELS.impact} size={330} /></Card>
            <Card title="Residual risk (after mitigation)"><RiskMatrix risks={risks.map((r) => ({ id: r.id, l: num(r.residualLikelihood), i: num(r.residualImpact) }))} likelihoodLabels={RISK_MATRIX_LABELS.likelihood} impactLabels={RISK_MATRIX_LABELS.impact} size={330} /></Card>
            <Card title="By category and stage">
              <table className="table compact"><tbody>{Object.entries(countBy(risks, 'category')).sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{v}</td></tr>)}</tbody></table>
              <div className="mt-8 small">Transition: {risks.filter((r) => r.stage === 'Transition').length} · Target state: {risks.filter((r) => r.stage === 'Target state').length}</div>
            </Card>
          </div>
          <Card pad={false} title="Risk register">
            <DataGrid rows={eng.risks} onChange={(r) => set('risks', r)} idPrefix="RK" idWidth={2} entity="risk" titleKey="title" filters={['category', 'stage', 'status']} newRow={() => ({ status: 'Open', stage: 'Transition' })}
              columns={[
                { key: 'title', label: 'Risk', type: 'long', width: 280 },
                { key: 'category', label: 'Category', type: 'select', options: eng.lists['Risk category'], width: 160 },
                { key: 'stage', label: 'Stage', type: 'select', options: eng.lists['Risk stage'], width: 110 },
                { key: 'dim', label: 'Dimension', type: 'select', options: dimSelect, width: 180 },
                { key: 'cause', label: 'Cause', type: 'long', width: 200 },
                { key: 'consequence', label: 'Consequence', type: 'long', width: 200 },
                { key: 'likelihood', label: 'Likelihood (1–5)', type: 'score', width: 70 },
                { key: 'impact', label: 'Impact (1–5)', type: 'score', width: 70 },
                { key: 'rating', label: 'Inherent rating', calc: (r) => riskRating(riskScore(r.likelihood, r.impact)), badge: true, width: 90 },
                { key: 'mitigation', label: 'Mitigation', type: 'long', width: 260 },
                { key: 'residualLikelihood', label: 'Residual likelihood', type: 'score', width: 70, group: 'target' },
                { key: 'residualImpact', label: 'Residual impact', type: 'score', width: 70, group: 'target' },
                { key: 'rrating', label: 'Residual rating', calc: (r) => riskRating(riskScore(r.residualLikelihood, r.residualImpact)), badge: true, width: 90 },
                { key: 'owner', label: 'Owner', width: 150 },
                { key: 'status', label: 'Status', type: 'select', options: eng.lists['Risk status'], width: 110 },
                { key: 'initiative', label: 'Initiative', type: 'select', options: initOpts, width: 160 },
              ]} />
          </Card>
        </>
      )}
    </div>
  );
}
