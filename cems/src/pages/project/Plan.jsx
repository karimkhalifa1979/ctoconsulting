// Project plan (PLN-001..016): work breakdown with WBS numbers, Gantt with baseline and critical
// path, dependencies and rescheduling, milestones, stages and an agile board for iterative work.
import { useMemo, useState } from 'react';
import { useProject } from './Project.jsx';
import { useApi } from '../../lib/hooks.js';
import { post } from '../../lib/api.js';
import { Register, RecordDrawer } from '../../components/Record.jsx';
import { Async, Card, Table, Status, Badge, D, Modal, Seg, Alert, Empty, useAction } from '../../components/ui.jsx';
import { Gantt } from '../../components/charts.jsx';
import { fmtDate } from '../../../shared/format.js';
import { todayIn } from '../../../shared/dates.js';
import Icon from '../../components/Icon.jsx';

export default function Plan() {
  const { id, p, engId, can, reload: reloadProject } = useProject();
  const q = useApi(`/api/projects/${id}/plan`);
  const [view, setView] = useState(p.approach === 'agile' ? 'board' : 'gantt');
  const [critical, setCritical] = useState(false);
  const [stage, setStage] = useState('');
  const [open, setOpen] = useState(null);
  const [resched, setResched] = useState(false);
  const edit = can('plan', 'U');
  const scope = { engagement_id: engId, project_id: id };
  const refresh = () => { q.reload(); reloadProject(); };
  return (
    <Async q={q}>{(plan) => {
      const items = plan.items.filter((t) => !stage || t.stage_id === stage);
      const pushed = plan.items.filter((t) => t.pushed).length;
      return (
        <div className="stack">
          {plan.cycle?.length > 0 && <Alert tone="error">A dependency loop was found between tasks; the critical path cannot be calculated until it is removed.</Alert>}
          {pushed > 0 && <Alert tone="warn">{pushed} task{pushed > 1 ? 's start' : ' starts'} earlier than {pushed > 1 ? 'their' : 'its'} predecessors allow. {edit && <button className="btn btn-xs" onClick={() => setResched(true)}>Review and reschedule</button>}</Alert>}
          <Card title="Work breakdown" sub={`${plan.items.length} items · ${Math.round(plan.percent * 100)}% complete · forecast finish ${fmtDate(plan.projectEnd)} (planned ${fmtDate(p.end_date)})`} flush
            actions={<>
              <select value={stage} onChange={(e) => setStage(e.target.value)} style={{ width: 'auto' }} aria-label="Stage"><option value="">All stages</option>{plan.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <Seg value={view} onChange={setView} options={[{ value: 'gantt', label: 'Gantt' }, { value: 'table', label: 'Table' }, { value: 'board', label: 'Board' }]} />
              {edit && <button className="btn btn-sm btn-primary" onClick={() => setOpen({ id: null })}><Icon name="plus" /> Add item</button>}
            </>}>
            <div className="card-body">
              {view === 'gantt' && (
                <>
                  <label className="check small mb-2"><input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} /> Critical path only</label>
                  <GanttView items={items} milestones={stage ? plan.milestones.filter((m) => m.stage_id === stage) : plan.milestones} critical={critical} onOpen={(t) => setOpen(t._milestone ? { id: t.id, entity: 'milestone' } : { id: t.id })} />
                  <div className="legend mt-2">
                    <span><i className="box" style={{ background: '#2a78d6', height: 10 }} />Task</span>
                    <span><i className="box" style={{ background: '#c62828', height: 10 }} />Critical path</span>
                    <span><i className="box" style={{ background: '#1e8e3e', height: 10 }} />Done</span>
                    <span><i className="box" style={{ background: '#9aa6b4', height: 10 }} />Baseline</span>
                    <span><i className="box" style={{ background: '#0fa3b1', height: 10, width: 2 }} />Today</span>
                  </div>
                </>
              )}
              {view === 'table' && <WbsTable items={items} onOpen={(t) => setOpen({ id: t.id })} />}
              {view === 'board' && <Board items={items} onOpen={(t) => setOpen({ id: t.id })} />}
            </div>
          </Card>
          <Register entity="milestone" scope={scope} defaults={{ project_id: id }} title="Milestones" sub="Baseline, forecast and actual dates; status is derived from the dates, late predecessors and dependencies (PLN-014). Confirm forecasts each week." onChanged={refresh} />
          <Register entity="stage" scope={scope} defaults={{ project_id: id }} title="Stages, phases and iterations" sub="From the delivery profile; gates and their criteria are on the Governance tab (GOV-008)." onChanged={refresh} />
          {open && <RecordDrawer entity={open.entity || 'work_item'} id={open.id} scope={scope} defaults={{ project_id: id, stage_id: stage || plan.stages.find((s) => s.status === 'Active')?.id || null }} onClose={() => setOpen(null)} onSaved={refresh} />}
          {resched && <Reschedule onClose={() => setResched(false)} onDone={() => { setResched(false); refresh(); }} />}
        </div>
      );
    }}</Async>
  );
}

const depthOf = (t) => (t.wbs ? String(t.wbs).split('.').length - 1 : 0);

function GanttView({ items, milestones, critical, onOpen }) {
  const rows = useMemo(() => items.map((t) => ({
    ...t, depth: depthOf(t), children: t.summary,
    start_date: t.summary ? t.rollup_start : t.start_date, finish_date: t.summary ? t.rollup_finish : t.finish_date,
    percent_complete: t.summary ? t.rollup_pct : t.percent_complete,
  })), [items]);
  if (!rows.length && !milestones.length) return <Empty>No work items yet.</Empty>;
  return <Gantt items={rows} milestones={milestones} today={todayIn('Australia/Sydney')} onOpen={onOpen} criticalOnly={critical} />;
}

function WbsTable({ items, onOpen }) {
  const { lookups } = useProject();
  const name = (id) => lookups?.users?.find((u) => u.id === id)?.label;
  const stage = (id) => lookups?.stages?.find((s) => s.id === id)?.label;
  return (
    <Table rows={items} onRow={onOpen} rowClass={(t) => (t.summary ? 'strong' : t.overdue ? 'overdue' : '')} columns={[
      { key: 'wbs', label: 'WBS', sort: (t) => String(t.wbs).split('.').map((n) => n.padStart(4, '0')).join('.') },
      { key: 'name', label: 'Name', render: (t) => <span style={{ paddingLeft: depthOf(t) * 14 }}>{t.name}{t.critical && !t.summary && <Badge tone="red">Critical</Badge>}{t.change_id && <Badge tone="amber" title="Linked to a change request">Change</Badge>}</span> },
      { key: 'kind', label: 'Type' },
      { key: 'stage_id', label: 'Stage', render: (t) => <span className="small">{stage(t.stage_id)}</span> },
      { key: 'start_date', label: 'Start', render: (t) => <D v={t.summary ? t.rollup_start : t.start_date} /> },
      { key: 'finish_date', label: 'Finish', render: (t) => <span className={t.overdue ? 'neg' : ''}><D v={t.summary ? t.rollup_finish : t.finish_date} /></span> },
      { key: 'finish_variance_days', label: 'Var. (BD)', num: true, render: (t) => (t.finish_variance_days ? <span className={t.finish_variance_days > 0 ? 'neg' : 'pos'}>{t.finish_variance_days > 0 ? '+' : ''}{t.finish_variance_days}</span> : '—') },
      { key: 'float', label: 'Float', num: true, render: (t) => (t.summary || t.float == null ? '—' : `${t.float} d`) },
      { key: 'percent_complete', label: '%', num: true, render: (t) => `${Math.round((t.summary ? t.rollup_pct : t.percent_complete || 0) * 100)}%` },
      { key: 'status', label: 'Status', render: (t) => (t.summary ? '' : <Status v={t.status} />) },
      { key: 'assignees', label: 'Assigned', sort: false, render: (t) => <span className="small">{(t.assignees || []).map(name).filter(Boolean).join(', ')}</span> },
    ]} />
  );
}

const COLUMNS = ['Not started', 'In progress', 'Blocked', 'Done'];

function Board({ items, onOpen }) {
  const { lookups } = useProject();
  const name = (id) => lookups?.users?.find((u) => u.id === id)?.label;
  const cards = items.filter((t) => !t.summary);
  if (!cards.length) return <Empty>No work items yet.</Empty>;
  return (
    <div className="board">
      {COLUMNS.map((c) => {
        const list = cards.filter((t) => (t.status || 'Not started') === c);
        return (
          <div key={c} className="board-col">
            <div className="board-head"><Status v={c} /><span className="muted small">{list.length}</span></div>
            {list.map((t) => (
              <button key={t.id} className="board-card" onClick={() => onOpen(t)}>
                <div className="small muted">{t.wbs} · {t.kind}{t.estimate_points ? ` · ${t.estimate_points} pts` : ''}</div>
                <div>{t.name}</div>
                <div className="tiny muted mt-1">{t.finish_date ? `Due ${fmtDate(t.finish_date)}` : ''}{t.assignees?.length ? ` · ${t.assignees.map(name).filter(Boolean).join(', ')}` : ''}</div>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Reschedule({ onClose, onDone }) {
  const { id } = useProject();
  const q = useApi(`/api/projects/${id}/reschedule`);
  const [run, busy] = useAction();
  const apply = async () => {
    const out = await run(() => post(`/api/projects/${id}/reschedule`), 'Plan rescheduled');
    if (out) onDone();
  };
  return (
    <Modal title="Reschedule from dependencies (PLN-003)" wide onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !q.data?.length} onClick={apply}>Apply new dates</button></>}>
      <Async q={q}>{(rows) => (!rows.length ? <Empty>No tasks need to move.</Empty> : (
        <Table compact rows={rows} columns={[
          { key: 'name', label: 'Task' },
          { key: 'from', label: 'Current', render: (r) => `${fmtDate(r.from[0])} – ${fmtDate(r.from[1])}` },
          { key: 'to', label: 'From dependencies', render: (r) => `${fmtDate(r.to[0])} – ${fmtDate(r.to[1])}` },
        ]} />
      ))}</Async>
    </Modal>
  );
}
