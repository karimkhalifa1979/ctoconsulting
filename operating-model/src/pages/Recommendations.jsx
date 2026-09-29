import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Stat, Tabs, useTab, Badge } from '../components/ui.jsx';
import DataGrid from '../components/DataGrid.jsx';
import { Bubble } from '../components/charts.jsx';
import { TK, DIM, DIM_BY_NAME, nextId } from '../lib/model.js';
import { recCalc, recProfile, CATEGORIES, sum, dimShort } from '../lib/calc.js';
import { fmtMoney } from '../lib/format.js';
import { dimSelect } from './Findings.jsx';

export const CAT_COLORS = { 'Quick win': '#1f9d58', 'Strategic initiative': '#2a78d6', 'Fill-in': '#f2b33d', Deprioritise: '#9aa5b4' };

export default function Recommendations() {
  const { eng, set, update, notify } = useStore();
  const [tab, setTab] = useTab('register');
  const s = eng.settings;
  const recs = eng.recommendations.map((r) => ({ ...r, ...recCalc(r, s) }));
  const prof = recProfile(eng);
  const example = { ...TK.examples.recommendation, dim: DIM_BY_NAME[TK.examples.recommendation.dimension]?.code };

  const toInitiative = (r) => {
    if (eng.initiatives.some((i) => String(i.recs).includes(r.id))) { notify(`${r.id} is already linked to an initiative.`); return; }
    const id = nextId(eng.initiatives, 'I', 2);
    update((e) => ({
      ...e,
      initiatives: [...e.initiatives, { id, name: r.recommendation.slice(0, 70), type: 'Project', dims: r.dim, recs: r.id, description: r.recommendation, owner: r.owner, start: '', end: '', status: 'Proposed', rag: '' }],
      costLines: r.cost ? [...e.costLines, { id: nextId(e.costLines, 'CL', 3), initiativeId: id, description: 'Indicative cost (from recommendation)', category: 'Opex', costType: 'Other', nature: 'One-off', planned: [Number(r.cost) || 0], actual: [] }] : e.costLines,
    }));
    notify(`Initiative ${id} created in Benefits & costs from ${r.id}.`);
  };

  return (
    <div className="stack">
      <PageHead eyebrow="Step 5 · Design" title="Recommendations & roadmap">
        Score Value (benefit and strategic impact) and Ease (cost, complexity, risk, time; 5 = easiest) from 1 to 5. The category is derived from the prioritisation threshold ({s.priorityThreshold}).
      </PageHead>
      <div className="grid g-4">
        <Stat label="Recommendations" value={recs.length} sub={`${recs.filter((r) => r.status === 'Endorsed' || r.status === 'In progress' || r.status === 'Complete').length} endorsed or underway`} accent />
        <Stat label="Quick wins" value={recs.filter((r) => r.category === 'Quick win').length} sub={`${recs.filter((r) => r.category === 'Strategic initiative').length} strategic initiatives`} />
        <Stat label="Indicative cost" value={fmtMoney(sum(recs.map((r) => r.cost)), { compact: true })} sub="Total of all recommendations" />
        <Stat label="Next 3 months" value={recs.filter((r) => r.horizon === eng.lists.Horizon[0]).length} sub={`${recs.filter((r) => r.horizon === eng.lists.Horizon[1]).length} in 3–12 months`} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'register', label: 'Register', count: recs.length }, { id: 'matrix', label: 'Prioritisation matrix' }, { id: 'roadmap', label: 'Roadmap by horizon' }]} />
      {tab === 'register' && (
        <Card pad={false}>
          <DataGrid rows={eng.recommendations} onChange={(r) => set('recommendations', r)} idPrefix="R" idWidth={3} entity="recommendation" titleKey="recommendation" example={example}
            filters={['dim', 'category', 'horizon', 'status']} ctx={s} newRow={() => ({ status: 'Proposed' })}
            columns={[
              { key: 'dim', label: 'Dimension', type: 'select', options: dimSelect, width: 200 },
              { key: 'recommendation', label: 'Recommendation', type: 'long', width: 340 },
              { key: 'findings', label: 'Linked finding(s)', width: 110 },
              { key: 'benefits', label: 'Expected benefits', type: 'long', width: 220 },
              { key: 'value', label: 'Value (1–5)', type: 'score', width: 70 },
              { key: 'ease', label: 'Ease (1–5)', type: 'score', width: 70 },
              { key: 'priority', label: 'Priority score', calc: (r, st) => recCalc(r, st).priority, width: 70 },
              { key: 'category', label: 'Category', calc: (r, st) => recCalc(r, st).category, badge: true, width: 130 },
              { key: 'horizon', label: 'Horizon', type: 'select', options: eng.lists.Horizon, width: 120 },
              { key: 'cost', label: 'Indicative cost ($)', type: 'money', width: 120, total: 'sum' },
              { key: 'owner', label: 'Accountable owner', width: 150 },
              { key: 'dependencies', label: 'Dependencies', type: 'long', width: 180 },
              { key: 'risks', label: 'Key risks', type: 'long', width: 180 },
              { key: 'status', label: 'Status', type: 'select', options: eng.lists['Recommendation status'], width: 110 },
            ]} />
        </Card>
      )}
      {tab === 'matrix' && (
        <div className="grid g-21">
          <Card title="Value × ease" subtitle="Numbers are recommendation IDs; colour shows the category">
            <Bubble points={recs.filter((r) => r.priority).map((r) => ({ id: r.id, label: r.recommendation, x: Number(r.ease), y: Number(r.value), color: CAT_COLORS[r.category], r: 9 }))}
              xLabel="Ease (5 = easiest)" yLabel="Value" xMin={1} yMin={1} threshold={s.priorityThreshold} quadrants={['Strategic initiatives', 'Quick wins', 'Deprioritise', 'Fill-ins']} size={620} />
          </Card>
          <Card title="Recommendation profile" subtitle="Category by horizon">
            <table className="table compact">
              <thead><tr><th>Category</th>{prof.horizons.map((h) => <th key={h} className="num">{h}</th>)}<th className="num">Total</th></tr></thead>
              <tbody>
                {CATEGORIES.map((c) => (
                  <tr key={c}><td><Badge v={c} /></td>{prof.horizons.map((h) => <td key={h} className="num">{prof.matrix[c][h] || ''}</td>)}<td className="num strong">{sum(Object.values(prof.matrix[c]))}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td>{prof.horizons.map((h) => <td key={h} className="num">{sum(CATEGORIES.map((c) => prof.matrix[c][h]))}</td>)}<td className="num">{sum(CATEGORIES.map((c) => sum(Object.values(prof.matrix[c]))))}</td></tr></tfoot>
            </table>
            {prof.unassigned > 0 && <p className="small muted mt-8">Recommendations without a category or horizon: {prof.unassigned}</p>}
          </Card>
        </div>
      )}
      {tab === 'roadmap' && (
        <div className="grid g-4">
          {eng.lists.Horizon.map((h) => {
            const list = recs.filter((r) => r.horizon === h).sort((a, b) => (b.priority || 0) - (a.priority || 0));
            return (
              <div key={h} className="card" style={{ background: 'var(--surface-2)' }}>
                <div className="card-head"><div><h3>{h}</h3><p>{list.length} recommendations · {fmtMoney(sum(list.map((r) => r.cost)), { compact: true })}</p></div></div>
                <div className="card-body stack-sm">
                  {list.map((r) => (
                    <div key={r.id} className="card" style={{ padding: 10, borderLeft: `4px solid ${CAT_COLORS[r.category] || '#cfd7e2'}` }}>
                      <div className="row between"><strong className="small">{r.id} · {dimShort(r.dim)}</strong><Badge v={r.status} /></div>
                      <div className="small mt-8 clamp-3" title={r.recommendation}>{r.recommendation}</div>
                      <div className="row between mt-8">
                        <span className="xsmall muted">{r.owner || 'No owner'} · {fmtMoney(r.cost, { compact: true })}</span>
                        <button className="btn btn-xs" onClick={() => toInitiative(r)} title="Create an initiative in Benefits & costs">→ Initiative</button>
                      </div>
                    </div>
                  ))}
                  {!list.length && <p className="small muted">None</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="xsmall muted">Dimension key: {Object.values(DIM).map((d) => `${d.code} ${d.short}`).join(' · ')}</p>
    </div>
  );
}
