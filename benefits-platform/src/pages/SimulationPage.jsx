import { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { PageHead, Seg, Select, Card, Guidance } from '../components/ui.jsx';
import SimulationLab from '../components/SimulationLab.jsx';

export default function SimulationPage() {
  const { ws } = useApp();
  const candidates = ws.programs.filter((p) => !['withdrawn'].includes(p.state) && (p.costs.length || p.benefits.length));
  const [scope, setScope] = useState('portfolio');
  const [programId, setProgramId] = useState(candidates.find((p) => p.id === 'prg-cis')?.id || candidates[0]?.id || '');
  const [chosen, setChosen] = useState(() => candidates.filter((p) => p.selection !== 'not-selected' && p.state !== 'completed').map((p) => p.id));
  const programs = useMemo(() => (scope === 'portfolio' ? ws.programs.filter((p) => chosen.includes(p.id)) : ws.programs.filter((p) => p.id === programId)), [ws.programs, scope, chosen, programId]);
  return (
    <div className="stack">
      <PageHead eyebrow="Value" title="Simulation lab">
        Play with costs, benefits, timing and risk to see their effect on value. A Monte Carlo simulation runs thousands of possible futures — each varying every cost and benefit within its range, shifting benefit timing, and letting risks occur — and shows the spread of outcomes, not just one number.
      </PageHead>
      <Card>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Seg value={scope} onChange={setScope} options={[['portfolio', 'Portfolio'], ['program', 'Single program']]} label="Scope" />
          {scope === 'program' ? (
            <Select value={programId} onChange={setProgramId} options={candidates.map((p) => [p.id, `${p.code} ${p.name}`])} aria-label="Program" />
          ) : (
            <div className="chips" style={{ flex: 1, justifyContent: 'flex-end' }}>
              {candidates.map((p) => <button key={p.id} type="button" className={`chip ${chosen.includes(p.id) ? 'on' : ''}`} aria-pressed={chosen.includes(p.id)} onClick={() => setChosen(chosen.includes(p.id) ? chosen.filter((x) => x !== p.id) : [...chosen, p.id])}>{p.code} {p.name}</button>)}
            </div>
          )}
        </div>
        {scope === 'portfolio' && <p className="mini" style={{ margin: '8px 0 0' }}>Portfolio runs share one timeline (from the earliest program start) and sample each program's lines together, so you see aggregate value and which programs carry the uncertainty. Settings are saved with the workspace; single-program settings are saved with the program and used by its business case.</p>}
      </Card>
      {programs.length ? <SimulationLab programs={programs} portfolio={scope === 'portfolio'} scopeLabel={scope === 'portfolio' ? `Portfolio (${programs.length} programs)` : programs[0].name} settingsKey={scope} /> : <Guidance>Select at least one program.</Guidance>}
    </div>
  );
}
