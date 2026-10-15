import { useNavigate, useParams, Link } from 'react-router-dom';
import { useApp, personName, categoryOf } from '../../lib/store.jsx';
import { summaries } from '../../lib/portfolio.js';
import { Empty, Pill, RiskIcon, Tabs } from '../../components/ui.jsx';
import { StatePill, HealthPill } from '../Programs.jsx';
import { money, ratio, fmtDate, months } from '../../lib/util.js';
import Overview from './Overview.jsx';
import BenefitsMap from './BenefitsMap.jsx';
import Projects from './Projects.jsx';
import Benefits from './Benefits.jsx';
import Financials from './Financials.jsx';
import Assessment from './Assessment.jsx';
import Gates from './Gates.jsx';
import Accountability from './Accountability.jsx';
import Change from './Change.jsx';
import Logs from './Logs.jsx';
import SimulationLab from '../../components/SimulationLab.jsx';
import BusinessCaseBuilder from '../../components/BusinessCaseBuilder.jsx';

const TABS = [
  ['overview', 'Overview'], ['map', 'Benefits map'], ['projects', 'Projects'], ['benefits', 'Benefits'], ['financials', 'Costs and worth'],
  ['simulation', 'Simulation'], ['assessment', 'Value assessment'], ['business-case', 'Business case'], ['gates', 'Gates'],
  ['accountability', 'Accountability'], ['change', 'Change'], ['logs', 'Logs'],
];

export default function ProgramWorkspace() {
  const { id, tab = 'overview' } = useParams();
  const nav = useNavigate();
  const { ws } = useApp();
  const program = ws.programs.find((p) => p.id === id);
  if (!program) return <Empty title="Program not found" action={<Link className="btn" to="/programs">Back to programs</Link>} />;
  const s = summaries(ws).get(program.id);
  const cat = categoryOf(ws, program.categoryId);
  const tabs = TABS.map(([k, l]) => [k, l, k === 'overview' && (s.errors || s.warnings) ? `${s.errors ? `✕${s.errors}` : ''}${s.warnings ? ` !${s.warnings}` : ''}` : null]);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow"><Link to="/programs">Programs</Link> / {program.code}</div>
          <div className="prog-head">
            <h1>{program.name}</h1>
            <StatePill state={program.state} />
            {cat && <Pill tone={cat.discretionary ? 'navy' : 'none'} icon="◆">{cat.name}</Pill>}
            {program.benchmark && <Pill tone="teal" icon="◇">Benchmark</Pill>}
          </div>
          <p className="muted" style={{ margin: '4px 0 0' }}>Sponsor <strong>{personName(ws, program.sponsorId)}</strong> · Program manager {personName(ws, program.managerId)}{program.analystId ? ` · Value analyst ${personName(ws, program.analystId)}` : ''}</p>
        </div>
      </div>
      <div className="kpi-grid">
        <div className="card stat"><div className="label">NPV {s.fin.path ? '(selected path)' : ''}</div><div className="value" style={{ color: s.fin.npv < 0 ? '#a52a2a' : undefined }}>{money(s.fin.npv)}</div><div className="sub">BCR {ratio(s.fin.bcr)} · IRR {s.fin.irr === null ? 'n/a' : `${(s.fin.irr * 100).toFixed(1)}%`}</div></div>
        <div className="card stat"><div className="label">Lifetime cost</div><div className="value">{money(s.fin.totalCosts)}</div><div className="sub">Estimate range {money(Number(program.costLow) || null)}–{money(Number(program.costHigh) || null)}</div></div>
        <div className="card stat"><div className="label">Payback</div><div className="value" style={{ fontSize: 22 }}>{months(s.fin.paybackMonths)}</div><div className="sub">from {fmtDate(s.fin.startISO)}</div></div>
        <div className="card stat"><div className="label">Risk profile</div><div className="row" style={{ marginTop: 4 }}><RiskIcon byAre={s.risk.byAre} ws={ws} size={38} /><div><div className="value" style={{ fontSize: 22, marginTop: 0 }}>{s.risk.overall === null ? '—' : Math.round(s.risk.overall)}</div><div className="sub">{s.risk.incomplete ? 'incomplete' : 'overall risk'}</div></div></div></div>
        <div className="card stat"><div className="label">Alignment</div><div className="value">{s.align.score === null ? '—' : Math.round(s.align.score)}</div><div className="sub">{(program.driverIds || []).length} drivers linked</div></div>
        <div className="card stat"><div className="label">Health</div><div style={{ marginTop: 6 }}><HealthPill score={s.health.score} /></div><div className="sub">{s.next ? `Next: ${s.next.gate} · ${fmtDate(s.next.planned)}` : 'No gate scheduled'}</div></div>
      </div>
      <Tabs tabs={tabs} value={tab} onChange={(t) => nav(`/programs/${id}/${t}`)} />
      {tab === 'overview' && <Overview program={program} />}
      {tab === 'map' && <BenefitsMap program={program} />}
      {tab === 'projects' && <Projects program={program} />}
      {tab === 'benefits' && <Benefits program={program} />}
      {tab === 'financials' && <Financials program={program} />}
      {tab === 'simulation' && <SimulationLab programs={[program]} scopeLabel={program.name} />}
      {tab === 'assessment' && <Assessment program={program} />}
      {tab === 'business-case' && <BusinessCaseBuilder program={program} />}
      {tab === 'gates' && <Gates program={program} />}
      {tab === 'accountability' && <Accountability program={program} />}
      {tab === 'change' && <Change program={program} />}
      {tab === 'logs' && <Logs program={program} />}
    </div>
  );
}
