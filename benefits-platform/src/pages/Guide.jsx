import { useState } from 'react';
import { ARES, BTOPP, GATES, MEDIC, VAGUE } from '../lib/config.js';
import { PageHead, Card, Tabs, includesAll } from '../components/ui.jsx';

const PRINCIPLES = [
  ['Projects deliver capabilities; programs deliver benefits.', 'Benefits are owned and tracked at program level; projects carry a statement of work.'],
  ['Benefits are a business responsibility.', 'Every program has one accountable business sponsor; delivery roles own capabilities.'],
  ['Look at the whole business system.', 'Programs include organisation, process and people change, not only technology.'],
  ['Value is multidimensional.', 'Alignment, financial worth and risk are shown side by side; ROI alone never decides.'],
  ['Value cases are evergreen.', 'They are versioned and refreshed before every gate and after material change.'],
  ['Commit resources progressively.', 'Funding is released only to the next gate; stopping is a governance success.'],
  ['Every initiative leads to a measurable outcome.', 'Modelling rules and MEDIC wording are applied in the benefits map.'],
  ['Selection is continuous.', 'Intake and portfolio adjustment happen year-round with a ranked waiting list.'],
  ['Treat programs as part of a portfolio.', 'Decisions show their effect on funds, dependencies and constraints.'],
  ['Rigour is proportionate.', 'Investment categories set the depth of analysis; the platform flags excessive review cycles.'],
  ['Visibility is shared.', 'The portfolio is visible across silos, subject to security classification.'],
  ['Support judgement; do not replace it.', 'Scores and optimisers advise; accountable people decide and record why.'],
  ['Plan the change, and be ready to change the plan.', 'Models and paths are versioned; assumption changes trigger re-planning.'],
  ['Not limited to IT.', 'Nothing assumes the investment is technology-led.'],
];
const GLOSSARY = [
  ['Activist accountability', 'Active, continuous ownership of a program and each measurable outcome, rather than being liable to be called to account afterwards.'],
  ['Alignment', 'How far an investment supports strategic drivers, a parent organisation’s objectives and the desired future state.'],
  ['Assumption', 'A condition outside the organisation’s control that an outcome or initiative needs; it represents a risk and is monitored.'],
  ['Benchmark program', 'A reference program with agreed scores, used to normalise assessments.'],
  ['Benefits map', 'This platform’s name for the program’s Results Chain model of initiatives, outcomes, contributions and assumptions.'],
  ['Benefits path', 'A route through the benefits map from initiatives to final outcomes; alternatives may be mutually exclusive.'],
  ['Benefits review', 'A structured comparison of benefits achieved with benefits expected during harvesting.'],
  ['BTOPP', 'The business system: business strategy, technology, organisation, process and people.'],
  ['Business sponsor', 'The senior business executive accountable for delivering a program’s benefits.'],
  ['Capability', 'What a project delivers. It has value only when used as part of a program of change.'],
  ['Change bottleneck', 'Where several programs need more change from the same group than it can absorb.'],
  ['Delphi', 'Anonymous, multi-round expert estimation aimed at a considered consensus.'],
  ['Dis-benefit', 'A negative outcome of change, such as a temporary productivity dip.'],
  ['Emergent benefit', 'A benefit not originally targeted that becomes possible as capabilities are used.'],
  ['Financial worth', 'The monetary value of a program using the organisation’s accepted financial methods.'],
  ['Four “ares”', 'Are we doing the right things? Are we doing them the right way? Are we getting them done well? Are we getting the benefits?'],
  ['Four Ps', 'A communication framework: purpose, picture, plan and part.'],
  ['Learning lag', 'The delay before people use a new capability well, often with a temporary dip in performance.'],
  ['MEDIC', 'Outcome wording: maintained, eliminated, decreased, increased, created.'],
  ['Monte Carlo simulation', 'Running thousands of possible futures, each drawing every uncertain input from its range, to see the spread of outcomes rather than one number.'],
  ['Plateau', 'An intermediate level of benefit in a time-phased profile, usually tied to an intermediate outcome.'],
  ['Progressive resource commitment', 'Releasing resources only to the next stage gate as knowledge grows.'],
  ['P10 / P50 / P90', 'Percentiles of a simulated distribution: 10% of outcomes fall below P10, half below P50, 90% below P90.'],
  ['Seven plus one', 'Conditions for accepting accountability: mandate and scope, authority, competence, resources, lines of accountability, rights and obligations, measures — plus acceptance.'],
  ['Stage gate', 'A decision point to commit resources to the next stage, or modify, delay or stop.'],
  ['Strategic driver', 'One of the few things the organisation must excel at.'],
  ['Value case', 'An evergreen, comparable statement of a program’s value structured by the four “ares”; the business case generated by this platform.'],
  ['Waiting list', 'A ranked queue of valued programs ready to use resources as they become available.'],
];

export default function Guide() {
  const [tab, setTab] = useState('approach');
  const [q, setQ] = useState('');
  return (
    <div className="stack">
      <PageHead eyebrow="Configure" title="Method guide">Guidance in context for the Benefits Realization Approach as implemented here. Wording is original and paraphrases the source; “Results Chain” is used descriptively (Results Chain™ is a trademark of Fujitsu Consulting (Canada) Inc.).</PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[['approach', 'The approach'], ['modelling', 'Benefits mapping'], ['lifecycle', 'Lifecycle and gates'], ['calc', 'Calculations'], ['sim', 'Simulation'], ['glossary', 'Glossary']]} />
      {tab === 'approach' && (
        <div className="grid g-2" data-layout>
          <Card title="Why benefits need managing">
            <p>Technology on its own delivers only a capability. Value appears when the capability is combined with changes to strategy, organisation, processes and people — and when the whole effort is managed from concept to cash, not just from design to delivery. Three premises follow: benefits do not just happen, they rarely happen as planned, and realising them is a continuous process that can and must be managed.</p>
            <div className="section-title">Cornerstones</div>
            <ul>
              <li><strong>Program management</strong> — blended programs across the business system deliver benefits.</li>
              <li><strong>Portfolio management</strong> — select and keep rebalancing a mix of programs within real constraints.</li>
              <li><strong>Full-cycle governance</strong> — stage gates, progressive commitment and evergreen value cases.</li>
              <li><strong>Activist accountability</strong> — a named sponsor owns the benefits; owners accept specific results.</li>
              <li><strong>Relevant measurement</strong> — measure outcomes, tie each measure to an accountable person.</li>
              <li><strong>Proactive management of change</strong> — design organisation, process and people change in from the start.</li>
            </ul>
          </Card>
          <Card title="Design principles">{PRINCIPLES.map(([a, b], i) => <div key={i} className="check-row"><span className="ic">P{i + 1}</span><span><strong>{a}</strong><div className="mini">{b}</div></span><span /></div>)}</Card>
          <Card title="The four “ares”" className="span-2">
            <table className="table compact"><thead><tr><th>Question</th><th>Value perspective</th><th>Risk perspective</th></tr></thead><tbody>{ARES.map((a) => <tr key={a.id}><td><strong>{a.q}</strong><div className="mini">{a.dim}</div></td><td>{a.value}</td><td>{a.risk}</td></tr>)}</tbody></table>
          </Card>
        </div>
      )}
      {tab === 'modelling' && (
        <div className="grid g-2" data-layout>
          <Card title="Building a benefits map">
            <ol>
              <li>Agree the final outcomes and link each to a strategic driver. Keep asking “so what?” until every capability traces to an end benefit.</li>
              <li>Work backwards through intermediate outcomes to the initiatives that cause them — across all BTOPP elements, not just technology.</li>
              <li>Record assumptions: the conditions you need but do not control. Give each a monitor and an indicator.</li>
              <li>Model alternative benefits paths where the same capability can be used in different ways; compare and choose.</li>
              <li>Name an owner for every outcome and test the seven-plus-one conditions.</li>
              <li>Validate with stakeholders, then baseline the model for the next gate. Keep it living: version it and display it.</li>
            </ol>
            <div className="section-title">Modelling rules</div>
            <ul><li>Every initiative leads to at least one outcome.</li><li>Every map ends in at least one final outcome.</li><li>Outcomes are worded to be measurable (MEDIC).</li><li>Orphans and circular contributions are flagged.</li></ul>
          </Card>
          <Card title="BTOPP — design questions">{BTOPP.map((b) => <div key={b.id} className="check-row"><span className="ic">{b.id}</span><span><strong>{b.name}</strong><div className="mini">{b.question}</div></span><span /></div>)}
            <div className="section-title">MEDIC wording</div>
            <p className="small">Use verbs such as <strong>{MEDIC.slice(0, 5).join(', ')}</strong>. Avoid vague words — {VAGUE.slice(0, 7).join(', ')} — that cannot be measured. “Claim cycle time decreased” is measurable; “Claims process improved” is not.</p>
          </Card>
        </div>
      )}
      {tab === 'lifecycle' && (
        <Card title="Default program lifecycle (GOV-01)" subtitle="Gates are configurable per investment category; resources are committed only to the next gate">
          <table className="table"><thead><tr><th>Gate</th><th>Key questions</th><th>Minimum evidence</th><th>Default authority</th></tr></thead><tbody>{GATES.map((g) => <tr key={g.id}><td><strong>{g.name}</strong></td><td>{g.questions}</td><td><ul style={{ margin: 0, paddingLeft: 16 }}>{g.criteria.map(([id, t]) => <li key={id}>{t}</li>)}</ul></td><td>{g.authority}</td></tr>)}</tbody></table>
          <p className="mini">Decision options at every gate: stay the course, proceed with conditions, modify, delay, or withdraw. Projects follow their own gates (Concept, Design, Execution, Implementation); a project’s Implementation gate is the program’s Commissioning decision.</p>
        </Card>
      )}
      {tab === 'calc' && (
        <div className="grid g-2" data-layout>
          <Card title="Financial worth (7.2.3)"><ul>
            <li>Benefit per month = driving variable × coefficient × profile realisation × attribution share ÷ 12.</li>
            <li>Profiles start after the capabilities they depend on are delivered (plus any lag), may dip during learning, then rise through plateaus; they end after the benefit lifetime.</li>
            <li>NPV = Σ net(t) ÷ (1 + r)^(t/12), monthly periods, end-of-period discounting.</li>
            <li>IRR solves NPV = 0 on annual net flows; “not applicable” if flows never change sign.</li>
            <li>Payback is the first month cumulative net cash flow returns to zero or above.</li>
            <li>BCR = PV benefits ÷ PV costs. ROI = (total benefits − total costs) ÷ total costs, undiscounted.</li>
            <li>Cash-releasing and non-cash-releasing benefits are reported separately; non-financial benefits never add into money totals.</li>
          </ul></Card>
          <Card title="Scores (7.2.1, 7.2.2, 7.2.4–7.2.6)"><ul>
            <li>Risk per “are”: R(a) = 100 × Σ w(s − 1) ÷ Σ w(5 − 1). Overall risk is the relevance-weighted mean. Green &lt; 35, amber 35–65, red &gt; 65.</li>
            <li>Alignment = 100 × Σ T(t) × Σ W(d) × contribution ÷ 4 across current, parent and future-state drivers.</li>
            <li>Benefit status: on track at ≥ 90% of forecast, at risk 75–90%, off track below 75%.</li>
            <li>Element risk combines importance and confidence; high importance with low confidence needs a contingency plan before Commitment.</li>
            <li>Change load = Σ impact (1–3) × share of group affected, compared with each area’s absorption threshold.</li>
            <li>All calculations are deterministic and covered by automated checks (<code>npm run check</code>).</li>
          </ul></Card>
        </div>
      )}
      {tab === 'sim' && (
        <div className="grid g-2" data-layout>
          <Card title="What the simulation does">
            <p>A single business-case figure hides how uncertain it is. The simulation lab runs thousands of possible futures. In each one:</p>
            <ul>
              <li>every cost and benefit line takes a value from its range (downside, most likely, upside) using a PERT, triangular, uniform or normal distribution;</li>
              <li>lines in the same group move partly together (a shared common factor), as they usually do in reality;</li>
              <li>benefit timing slips by a sampled delay, which is correlated with cost overrun — late programs tend to cost more;</li>
              <li>risk events may occur: an assumption in the benefits map proves false and the benefits downstream of it are cut, or a custom event adds cost or delay.</li>
            </ul>
            <p>The results show the distribution of NPV, the chance of a positive NPV, the range of cumulative cash flow over time, and which inputs matter most.</p>
          </Card>
          <Card title="Reading and using the results">
            <ul>
              <li><strong>Expected NPV</strong> is the average over all futures — a risk-adjusted value. It is usually below the base case because downside ranges and risk events are asymmetric.</li>
              <li><strong>P10–P90</strong> is the range in which eight in ten futures fall. A wide range signals that more information (a pilot, a firmer quote) could be valuable before committing.</li>
              <li><strong>The S-curve</strong> answers “what is the chance NPV falls below X?” — drag across it.</li>
              <li><strong>The tornado</strong> ranks inputs by how far they swing NPV; focus estimation and mitigation effort at the top.</li>
              <li><strong>What-if levers</strong> shift the most likely values (for example, benefits 20% lower or six months late); <strong>uncertainty</strong> controls set how wide the spread is.</li>
              <li>Save scenarios to compare options side by side. The program’s saved settings flow into its business case.</li>
            </ul>
          </Card>
        </div>
      )}
      {tab === 'glossary' && (
        <Card title="Glossary" actions={<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search glossary" />}>
          {GLOSSARY.filter(([t, d]) => includesAll(`${t} ${d}`, q)).map(([t, d]) => <div key={t} className="attr"><dt>{t}</dt><dd>{d}</dd></div>)}
        </Card>
      )}
    </div>
  );
}
