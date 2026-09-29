import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Stat, StackBar } from '../components/ui.jsx';
import DataGrid from '../components/DataGrid.jsx';
import { VBars, SEV_COLORS } from '../components/charts.jsx';
import { TK, DIMENSIONS, DIM_BY_NAME } from '../lib/model.js';
import { countBy } from '../lib/calc.js';
import { isoDate, today } from '../lib/format.js';

export const dimSelect = DIMENSIONS.map((d) => ({ value: d.code, label: `${d.code} ${d.name}` }));
const SEV = ['Critical', 'High', 'Medium', 'Low'];

export default function Findings() {
  const { eng, set } = useStore();
  const f = eng.findings;
  const sev = countBy(f, 'severity');
  const status = countBy(f, 'status');
  const example = { ...TK.examples.finding, dim: DIM_BY_NAME[TK.examples.finding.dimension]?.code };
  return (
    <div className="stack">
      <PageHead eyebrow="Step 4 · Assess" title="Findings log">
        Record each finding with its evidence, root cause and impact. Link findings to assessment question IDs and to recommendations, and validate them with stakeholders.
      </PageHead>
      <div className="grid g-4">
        <Stat label="Findings" value={f.length} sub={`${status.Validated || 0} validated · ${status.Closed || 0} closed`} accent />
        <Stat label="Open critical & high" value={f.filter((x) => (x.severity === 'Critical' || x.severity === 'High') && x.status !== 'Closed').length} sub={`${sev.Critical || 0} critical`} />
        <Stat label="Stakeholder validated" value={`${f.filter((x) => x.validated === 'Yes').length} of ${f.length}`} sub={`${f.filter((x) => x.validated === 'Pending').length} pending`} />
        <Card><div className="small strong mb-8">Severity</div><StackBar segments={SEV.map((s) => ({ label: s, value: sev[s] || 0, color: SEV_COLORS[s] }))} /></Card>
      </div>
      <Card title="Findings by dimension and severity">
        <VBars categories={DIMENSIONS.map((d) => d.code)} stacked height={260} width={1000}
          series={SEV.map((s) => ({ name: s, color: SEV_COLORS[s], values: DIMENSIONS.map((d) => f.filter((x) => x.dim === d.code && x.severity === s).length) }))} />
      </Card>
      <Card pad={false} title="Log">
        <DataGrid rows={f} onChange={(r) => set('findings', r)} idPrefix="F" idWidth={3} entity="finding" titleKey="finding" example={example}
          filters={['dim', 'severity', 'status', 'validated']} newRow={() => ({ date: isoDate(today()), severity: 'Medium', status: 'Open', validated: 'Pending' })}
          columns={[
            { key: 'date', label: 'Date raised', type: 'date', width: 130 },
            { key: 'dim', label: 'Dimension', type: 'select', options: dimSelect, width: 210 },
            { key: 'sub', label: 'Sub-component', width: 150 },
            { key: 'finding', label: 'Finding / observation', type: 'long', width: 320 },
            { key: 'evidence', label: 'Evidence source(s)', type: 'long', width: 200 },
            { key: 'rootCause', label: 'Root cause', type: 'long', width: 220 },
            { key: 'impact', label: 'Business impact', type: 'long', width: 220 },
            { key: 'severity', label: 'Severity', type: 'select', options: eng.lists['Severity / criticality'], width: 100 },
            { key: 'questions', label: 'Linked question ID(s)', width: 120 },
            { key: 'validated', label: 'Stakeholder validated?', type: 'select', options: eng.lists.Validation, width: 100 },
            { key: 'owner', label: 'Finding owner', width: 140 },
            { key: 'recs', label: 'Linked recommendation(s)', width: 130 },
            { key: 'status', label: 'Status', type: 'select', options: eng.lists['Finding status'], width: 110 },
          ]} />
      </Card>
    </div>
  );
}
