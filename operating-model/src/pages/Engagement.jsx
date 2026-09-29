import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Tabs, useTab, Field, TextInput, TextArea, NumberInput, Select } from '../components/ui.jsx';
import DataGrid from '../components/DataGrid.jsx';
import { TK, DIMENSIONS } from '../lib/model.js';
import { yearLabels } from '../lib/finance.js';

const DETAIL_FIELDS = [
  ['client', 'Client organisation'], ['industry', 'Industry / sector'], ['name', 'Engagement name'], ['sponsor', 'Client sponsor'],
  ['lead', 'CTO Consulting engagement lead'], ['team', 'Assessment team'],
];

export default function Engagement() {
  const { eng, set, setPath } = useStore();
  const [tab, setTab] = useTab('details');
  const d = eng.details;
  const s = eng.settings;
  const setD = (k) => (v) => setPath(['details', k], v);
  const setS = (k) => (v) => setPath(['settings', k], v);

  return (
    <div>
      <PageHead eyebrow="Step 1 · Mobilise" title="Engagement setup">
        Complete this first. Settings drive calculations across the tool: default target maturity, RAG thresholds, prioritisation, span and layer checks, expiry warnings, TIME classification and the business case.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'details', label: 'Engagement details' },
        { id: 'scope', label: 'Objectives & scope' },
        { id: 'hypotheses', label: 'Hypotheses' },
        { id: 'principles', label: 'Design principles', count: eng.principles.length },
        { id: 'settings', label: 'Assessment settings' },
      ]} />

      {tab === 'details' && (
        <Card title="Engagement details">
          <div className="form-grid">
            {DETAIL_FIELDS.map(([k, label]) => (
              <Field key={k} label={label} className={k === 'team' ? 'full' : ''}><TextInput value={d[k]} onChange={setD(k)} /></Field>
            ))}
            <Field label="Start date"><input type="date" value={d.startDate || ''} onChange={(e) => setD('startDate')(e.target.value)} /></Field>
            <Field label="Target completion date"><input type="date" value={d.endDate || ''} onChange={(e) => setD('endDate')(e.target.value)} /></Field>
            <Field label="Workbook version"><TextInput value={d.version} onChange={setD('version')} /></Field>
            <Field label="Engagement status"><Select value={d.status} onChange={setD('status')} options={eng.lists['Engagement status']} /></Field>
          </div>
        </Card>
      )}

      {tab === 'scope' && (
        <div className="grid g-2">
          <Card title="Engagement objectives">
            <div className="stack-sm">
              {eng.objectives.map((o, i) => (
                <Field key={i} label={`Objective ${i + 1}`}>
                  <TextArea rows={2} value={o} onChange={(v) => set('objectives', eng.objectives.map((x, k) => (k === i ? v : x)))} />
                </Field>
              ))}
              <button className="btn btn-sm" onClick={() => set('objectives', [...eng.objectives, ''])}>+ Add objective</button>
            </div>
          </Card>
          <Card title="Scope">
            <div className="stack-sm">
              <Field label="In-scope business units / functions"><TextArea rows={2} value={eng.scope.units} onChange={(v) => setPath(['scope', 'units'], v)} /></Field>
              <Field label="In-scope locations / geographies"><TextArea rows={2} value={eng.scope.locations} onChange={(v) => setPath(['scope', 'locations'], v)} /></Field>
              <Field label="Dimensions in scope"><TextInput value={eng.scope.dimensions} onChange={(v) => setPath(['scope', 'dimensions'], v)} /></Field>
              <Field label="Out of scope"><TextArea rows={2} value={eng.scope.outOfScope} onChange={(v) => setPath(['scope', 'outOfScope'], v)} /></Field>
              <Field label="Key constraints and assumptions"><TextArea rows={3} value={eng.scope.constraints} onChange={(v) => setPath(['scope', 'constraints'], v)} /></Field>
            </div>
          </Card>
        </div>
      )}

      {tab === 'hypotheses' && (
        <Card title="Key hypotheses to test" subtitle="State what you expect to find; confirm or reject each one with evidence during the assessment.">
          <div className="stack-sm">
            {eng.hypotheses.map((h, i) => (
              <Field key={i} label={`Hypothesis ${i + 1}`}>
                <TextArea rows={2} value={h} onChange={(v) => set('hypotheses', eng.hypotheses.map((x, k) => (k === i ? v : x)))} />
              </Field>
            ))}
            <button className="btn btn-sm" onClick={() => set('hypotheses', [...eng.hypotheses, ''])}>+ Add hypothesis</button>
          </div>
        </Card>
      )}

      {tab === 'principles' && (
        <Card title="Operating model design principles (agreed with the client)" subtitle="Principles are used to test design choices in the TOM designer and options appraisal." pad={false}>
          <DataGrid rows={eng.principles} onChange={(rows) => set('principles', rows)} idPrefix="DP" idWidth={2} entity="principle" titleKey="principle"
            example={TK.principleExample} newRow={() => ({ status: 'Proposed' })}
            columns={[
              { key: 'principle', label: 'Principle', width: 220 },
              { key: 'rationale', label: 'Rationale', type: 'long', width: 300 },
              { key: 'implications', label: 'Implications for operating model design', type: 'long', width: 340 },
              { key: 'status', label: 'Status', type: 'select', options: eng.lists['Principle status'], width: 120 },
            ]} />
        </Card>
      )}

      {tab === 'settings' && (
        <div className="grid g-2">
          <Card title="Assessment settings" subtitle="From the workbook's Engagement tab">
            <table className="table">
              <thead><tr><th>Setting</th><th style={{ width: 120 }}>Value</th><th>How it is used</th></tr></thead>
              <tbody>
                {[['defaultTarget', 1, 5, 1], ['ragRed', 0, 5, 0.05], ['ragAmber', 0, 5, 0.05], ['priorityThreshold', 1, 5, 1], ['maxLayers', 1, 15, 1], ['expiryWarningDays', 0, 1000, 1], ['timeFitThreshold', 1, 5, 1]].map(([k, min, max, step], i) => (
                  <tr key={k}>
                    <td className="strong">{TK.settingsHelp[i].label}</td>
                    <td><NumberInput value={s[k]} min={min} max={max} step={step} onChange={setS(k)} /></td>
                    <td className="small muted">{TK.settingsHelp[i].help}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="btn-row mt-8">
              <button className="btn btn-sm" onClick={() => {
                if (window.confirm(`Set the target maturity of every scored question to ${s.defaultTarget}?`)) set('questions', eng.questions.map((q) => ({ ...q, target: q.current === 'N/A' ? q.target : s.defaultTarget })));
              }}>Apply default target to all questions</button>
            </div>
          </Card>
          <div className="stack">
            <Card title="Business case settings" subtitle="Used by Benefits & costs and the comparison">
              <div className="form-grid">
                <Field label="First financial year starts (July)" hint={`first year: ${yearLabels(s)[0]}`}><NumberInput value={s.startYear} min={2000} max={2100} onChange={setS('startYear')} /></Field>
                <Field label="Horizon (years)"><NumberInput value={s.years} min={1} max={10} onChange={setS('years')} /></Field>
                <Field label="Discount rate (% per year)"><NumberInput value={s.discountRate} min={0} max={30} step={0.1} onChange={setS('discountRate')} /></Field>
                <Field label="Currency"><TextInput value={s.currency} onChange={setS('currency')} /></Field>
                <label className="check full"><input type="checkbox" checked={!!s.riskAdjustBenefits} onChange={(e) => setS('riskAdjustBenefits')(e.target.checked)} />Risk-adjust benefits by their confidence (%)</label>
                <label className="check full"><input type="checkbox" checked={!!s.includeNonCashable} onChange={(e) => setS('includeNonCashable')(e.target.checked)} />Include non-cashable (productivity) benefits in NPV and ROI</label>
              </div>
            </Card>
            <Card title="Span-of-control benchmarks" subtitle={TK.spanNote}>
              <table className="table compact">
                <thead><tr><th>Nature of work</th><th>Span min</th><th>Span max</th></tr></thead>
                <tbody>
                  {eng.spanBenchmarks.map((b, i) => (
                    <tr key={b.nature}>
                      <td>{b.nature}</td>
                      <td><NumberInput value={b.min} onChange={(v) => set('spanBenchmarks', eng.spanBenchmarks.map((x, k) => (k === i ? { ...x, min: v } : x)))} /></td>
                      <td><NumberInput value={b.max} onChange={(v) => set('spanBenchmarks', eng.spanBenchmarks.map((x, k) => (k === i ? { ...x, max: v } : x)))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="Dimensions">
              <p className="small muted">All {DIMENSIONS.length} dimensions are assessed by default. Mark questions N/A on the assessment to exclude them from averages.</p>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
