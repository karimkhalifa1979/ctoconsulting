// Lessons learned across initiatives (SUS-004, PRT-005): search every initiative's lessons by keyword,
// category and phase, read what worked, what did not and what to do next time, and use them when planning
// a new initiative.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import { Card, PageHead, Empty, Spinner, ErrorBox, Drawer, KV } from '../ui/core.jsx';
import DataGrid from '../ui/DataGrid.jsx';
import { BarChart } from '../charts/index.jsx';
import { useApp } from '../state/app.jsx';
import { fmtDate, fmtNum, label, options } from '../lib/format.js';
import { sortBy, uniq, truncate } from '../../shared/util.js';

const PHASES = { p1: 'Prepare Approach', p2: 'Manage Change', p3: 'Sustain Outcomes' };

export default function Lessons() {
  const { api, config } = useApp();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [category, setCategory] = useState('');
  const load = useCallback(() => api.op('searchLessons', {}).then((r) => { setRows(sortBy(r, '-date')); setError(null); }).catch(setError), [api]);
  useEffect(() => { load(); }, [load]);
  const cats = useMemo(() => options('lessonCategory', config), [config]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!rows) return <Spinner />;
  const inis = uniq(rows.map((l) => l.initiativeName).filter(Boolean)).sort();
  const shown = category ? rows.filter((l) => l.category === category) : rows;
  const byCat = cats.map((c) => ({ key: c.id, label: c.label, value: rows.filter((l) => l.category === c.id).length })).filter((d) => d.value);
  return (
    <>
      <PageHead eyebrow="Enterprise" title="Lessons learned">
        What worked, what did not and what to do next time, from every initiative. Search before you plan: the same lessons tend to recur.
      </PageHead>
      <div className="grid g-side">
        <Card title="By category" sub={`${rows.length} lessons from ${inis.length} initiative${inis.length === 1 ? '' : 's'}. Select a bar to filter.`}>
          {byCat.length ? <BarChart data={byCat} format={(v) => fmtNum(v)} labelWidth={190} onSelect={(d) => setCategory(category === d.key ? '' : d.key)} ariaLabel="Lessons by category" /> : <Empty icon="lightbulb" title="No lessons yet" />}
          {category && <button type="button" className="btn btn-sm btn-ghost mt-2" onClick={() => setCategory('')}><Icon name="x" />Show every category</button>}
        </Card>
        <DataGrid id="lessons-all" type="lesson" title="Lessons learned" rows={shown} exportName="Lessons learned" onRowClick={(l) => setOpen(l)}
          searchKeys={['title', 'whatWorked', 'whatDidNot', 'recommendation', 'tags', 'initiativeName']}
          columns={[
            { key: 'title', label: 'Lesson', render: (l) => <span><strong>{l.title}</strong><span className="sub-line small muted" style={{ whiteSpace: 'normal', maxWidth: 520 }}>{truncate(l.recommendation || l.whatWorked || l.whatDidNot || '', 160)}</span></span>, value: (l) => l.title },
            { key: 'category', label: 'Category', render: (l) => label('lessonCategory', l.category, config), value: (l) => l.category },
            { key: 'phase', label: 'Phase', render: (l) => PHASES[l.phase] || '—', value: (l) => l.phase || '' },
            { key: 'initiative', label: 'Initiative', render: (l) => l.initiativeName || '—', value: (l) => l.initiativeName },
            { key: 'date', label: 'Date', render: (l) => <span className="nowrap">{fmtDate(l.date)}</span>, value: (l) => l.date || '' },
          ]}
          facets={[
            { key: 'phase', label: 'Phase', options: Object.entries(PHASES).map(([id, l]) => ({ id, label: l })), value: (l) => l.phase },
            ...(inis.length > 1 ? [{ key: 'ini', label: 'Initiative', options: inis.map((x) => ({ id: x, label: x })), value: (l) => l.initiativeName }] : []),
          ]}
          empty={<Empty icon="lightbulb" title="No lessons match">Lessons are recorded in each initiative's Sustainment and closeout area.</Empty>} />
      </div>
      {open && <LessonDetail l={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function LessonDetail({ l, onClose }) {
  const { config } = useApp();
  return (
    <Drawer title={l.title} sub={`Lesson learned · ${l.code}`} onClose={onClose}>
      <div className="stack">
        <KV items={[
          ['Initiative', l.initiativeName],
          ['Category', label('lessonCategory', l.category, config)],
          ['Phase', PHASES[l.phase]],
          ['Date', fmtDate(l.date)],
          ['Tags', l.tags],
        ]} />
        {[['What worked', l.whatWorked], ['What did not work', l.whatDidNot], ['Recommendation', l.recommendation]].map(([h, t]) => t && (
          <div key={h} className="form-section"><h3>{h}</h3><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{t}</p></div>
        ))}
        {l.canOpen && <div className="btn-row"><Link className="btn btn-sm" to={`/i/${l.initiativeId}/sustain?tab=lessons&open=lesson:${l.id}`}><Icon name="external" />Open in {l.initiativeName}</Link></div>}
        {!l.canOpen && <p className="small muted">You are not assigned to {l.initiativeName}; lessons are shared so every initiative can learn from them.</p>}
        <div className="callout small">Use it when planning: record it in your initiative as a risk, a plan activity or a decision.</div>
      </div>
    </Drawer>
  );
}
