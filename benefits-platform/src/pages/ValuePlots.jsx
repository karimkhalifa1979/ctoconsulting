import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, categoryOf } from '../lib/store.jsx';
import { summaries } from '../lib/portfolio.js';
import { ARES } from '../lib/config.js';
import { PageHead, ChartCard, Card, Select, RiskIcon, Seg, Guidance } from '../components/ui.jsx';
import { ValuePlot } from '../components/charts.jsx';
import { money } from '../lib/util.js';

export default function ValuePlots() {
  const { ws, mutate } = useApp();
  const nav = useNavigate();
  const s = summaries(ws);
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('live');
  const [norm, setNorm] = useState('raw');
  const progs = ws.programs.filter((p) => (!cat || p.categoryId === cat) && (status === 'all' ? p.state !== 'withdrawn' : status === 'live' ? !['withdrawn', 'completed'].includes(p.state) : p.state === status));
  const pts = progs.map((p) => { const x = s.get(p.id); return { id: p.id, code: p.code, name: p.name, npv: x.fin.npv, risk: norm === 'norm' && x.riskNorm !== null ? x.riskNorm : x.risk.overall, align: norm === 'norm' && x.alignNorm !== null ? x.alignNorm : x.align.score, cost: x.lifetimeCost, band: p.band, state: p.state }; });
  const bench = ws.programs.filter((p) => p.benchmark && p.reference);
  const table = { columns: [{ label: 'Program', get: (r) => `${r.code} ${r.name}` }, { label: 'NPV', num: true, get: (r) => money(r.npv) }, { label: 'Risk', num: true, get: (r) => (r.risk === null ? '—' : Math.round(r.risk)) }, { label: 'Alignment', num: true, get: (r) => (r.align === null ? '—' : Math.round(r.align)) }, { label: 'Cost', num: true, get: (r) => money(r.cost) }], rows: pts };
  return (
    <div className="stack">
      <PageHead eyebrow="Value" title="Value plots">Financial worth plotted against overall risk and against alignment (VAL-08). Benchmark programs anchor the scales; assign programs to high, medium or low selection bands and open any program from the plot.</PageHead>
      <div className="filters">
        <Select value={cat} onChange={setCat} placeholder="All categories" options={ws.categories.map((c) => [c.id, c.name])} aria-label="Category" />
        <Select value={status} onChange={setStatus} options={[['live', 'Live programs'], ['all', 'All (excl. withdrawn)'], ['waiting-list', 'Waiting list'], ['definition', 'In definition'], ['active', 'Active'], ['harvesting', 'Harvesting']]} aria-label="Status" />
        <Seg value={norm} onChange={setNorm} options={[['raw', 'Raw scores'], ['norm', 'Normalised to benchmarks']]} label="Scores" />
      </div>
      {norm === 'norm' && !s.calR && <Guidance>Normalisation needs at least two benchmark programs with reference scores.</Guidance>}
      <div className="grid g-2" data-layout>
        <ChartCard title="Financial worth against overall risk" subtitle="Lower risk is better — the sweet spot is top left" table={table}>
          <ValuePlot points={pts} xKey="risk" xLabel="Overall risk" invertX onOpen={(p) => nav(`/programs/${p.id}/assessment`)} benchmarks={bench.map((b) => ({ label: `${b.code} ref`, x: Number(b.reference.risk), npv: s.get(b.id).fin.npv }))} />
        </ChartCard>
        <ChartCard title="Financial worth against alignment" subtitle="Higher alignment is better — the sweet spot is top right" table={table}>
          <ValuePlot points={pts} xKey="align" xLabel="Alignment" onOpen={(p) => nav(`/programs/${p.id}/assessment`)} benchmarks={bench.map((b) => ({ label: `${b.code} ref`, x: Number(b.reference.alignment), npv: s.get(b.id).fin.npv }))} />
        </ChartCard>
      </div>
      <Card title="Programs, risk icons and selection bands" pad={false}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Program</th><th>Category</th><th className="num">NPV</th><th>Risk profile</th>{ARES.map((a) => <th key={a.id} className="num">{a.short}</th>)}<th className="num">Alignment</th><th>Selection band</th></tr></thead>
          <tbody>{progs.map((p) => { const x = s.get(p.id); return (
            <tr key={p.id}><td><strong>{p.code}</strong> {p.name}</td><td>{categoryOf(ws, p.categoryId)?.name}</td><td className="num">{money(x.fin.npv)}</td><td><RiskIcon byAre={x.risk.byAre} ws={ws} size={26} /></td>
              {ARES.map((a) => <td key={a.id} className="num">{x.risk.byAre[a.id].score === null ? '—' : Math.round(x.risk.byAre[a.id].score)}</td>)}
              <td className="num">{x.align.score === null ? '—' : Math.round(x.align.score)}</td>
              <td><Select value={p.band} onChange={(v) => mutate(`Selection band for ${p.code}: ${v}`, (d) => { d.programs.find((y) => y.id === p.id).band = v || null; })} placeholder="—" options={[['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} /></td></tr>
          ); })}</tbody>
        </table></div>
      </Card>
    </div>
  );
}
