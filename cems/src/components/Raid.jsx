// RAID view used by engagements, projects and the cross-engagement page: a combined list (RAI-008),
// each register with its own fields, and the risk heat maps (RSK-008).
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { download } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { useLookups } from './fields.jsx';
import { Register, RecordDrawer, RecordFlags } from './Record.jsx';
import { Card, Table, Level, Status, D, ErrorBox, Loading, Seg } from './ui.jsx';
import { RiskHeat } from './charts.jsx';
import Icon from './Icon.jsx';

const TYPES = [['risk', 'Risks'], ['issue', 'Issues'], ['assumption', 'Assumptions'], ['dependency', 'Dependencies'], ['decision', 'Decisions'], ['action', 'Actions']];

export default function RaidView({ engagementId, projectId, title = 'RAID' }) {
  const [params, setParams] = useSearchParams();
  const fromLink = params.get('entity');
  const [tab, setTab] = useState(TYPES.some(([t]) => t === fromLink) ? fromLink : 'all');
  const scope = { engagement_id: engagementId, ...(projectId ? { project_id: projectId } : {}) };
  const defaults = projectId ? { project_id: projectId } : {};
  return (
    <div className="stack">
      <div className="subtabs">
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All items</button>
        {TYPES.map(([t, l]) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); if (params.get('open')) { params.delete('open'); params.delete('entity'); setParams(params, { replace: true }); } }}>{l}</button>)}
        <button className={tab === 'heat' ? 'active' : ''} onClick={() => setTab('heat')}>Risk heat map</button>
      </div>
      {tab === 'all' && <Combined scope={scope} title={title} />}
      {tab === 'heat' && <Heat scope={scope} />}
      {TYPES.some(([t]) => t === tab) && <Register key={tab} entity={tab} scope={scope} defaults={defaults} initialOpenOnly={!params.get('open')} />}
    </div>
  );
}

function Combined({ scope, title }) {
  const [f, setF] = useState({ open: '1', overdue: '', escalated: '' });
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const list = useApi('/api/raid', { ...scope, ...f });
  const lookups = useLookups({ engagementId: scope.engagement_id });
  const { me } = useSession();
  const name = (id) => lookups?.users?.find((u) => u.id === id)?.label;
  const projectName = (id) => lookups?.projects?.find((p) => p.id === id)?.label;
  const rows = (list.data || []).filter((r) => !q || `${r.ref} ${r.title}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card title={`${title}: all registers`} sub="One list across risks, issues, assumptions, dependencies, decisions and actions." flush
      actions={!me.user.external && <button className="btn btn-sm" onClick={() => download('/api/raid/export', { ...scope, ...f, format: 'xlsx' })}><Icon name="download" /> Excel</button>}>
      <div className="card-body">
        <div className="filters">
          <input type="search" placeholder="Search RAID" value={q} onChange={(e) => setQ(e.target.value)} />
          <Seg value={f.open} onChange={(v) => setF({ ...f, open: v })} options={[{ value: '1', label: 'Open' }, { value: '', label: 'All' }]} />
          <label className="check small"><input type="checkbox" checked={f.overdue === '1'} onChange={(e) => setF({ ...f, overdue: e.target.checked ? '1' : '' })} /> Overdue or review due</label>
          <label className="check small"><input type="checkbox" checked={f.escalated === '1'} onChange={(e) => setF({ ...f, escalated: e.target.checked ? '1' : '' })} /> Escalated</label>
        </div>
        {list.error ? <ErrorBox error={list.error} /> : list.loading && !list.data ? <Loading /> : (
          <Table rows={rows} onRow={(r) => setOpen(r)} columns={[
            { key: 'type_label', label: 'Register' },
            { key: 'ref', label: 'ID', sort: (r) => r.ref },
            { key: 'title', label: 'Title', render: (r) => <div><div>{r.title}</div><RecordFlags rec={r} /></div> },
            !scope.project_id && { key: 'project_id', label: 'Project', render: (r) => (r.project_id ? <span className="small">{projectName(r.project_id)}</span> : <span className="small muted">Engagement</span>) },
            { key: 'level', label: 'Rating', sort: (r) => r.residual_score || r.inherent_score || ({ Critical: 20, High: 15, Medium: 8, Low: 2 }[r.severity] || 0), render: (r) => <Level v={r.residual_level || r.inherent_level || r.severity} /> },
            { key: 'owner', label: 'Owner', sort: (r) => name(r.owner_id) || r.owner_name, render: (r) => <span className="small">{r.owner_name || name(r.owner_id)}</span> },
            { key: 'due', label: 'Due / review', sort: (r) => r.due_date || r.target_date || r.need_by || r.validate_by || r.next_review || 'z', render: (r) => <D v={r.due_date || r.target_date || r.need_by || r.validate_by || r.next_review} /> },
            { key: 'age_days', label: 'Age', num: true, render: (r) => (r.age_days != null ? `${r.age_days} d` : '—') },
            { key: 'status', label: 'Status', render: (r) => <Status v={r.status} /> },
          ].filter(Boolean)} />
        )}
      </div>
      {open && <RecordDrawer entity={open.type} id={open.id} scope={{ engagement_id: open.engagement_id }} onClose={() => setOpen(null)} onSaved={() => list.reload()} />}
    </Card>
  );
}

function Heat({ scope }) {
  const list = useApi('/api/e/risk', { ...scope, open: '1' });
  const { me } = useSession();
  const [which, setWhich] = useState('residual');
  const [cell, setCell] = useState(null);
  if (list.loading && !list.data) return <Loading />;
  const risks = (list.data || []).filter((r) => r.status === 'Open' && r.kind !== 'Opportunity');
  const grid = (lk, ck) => {
    const g = Array.from({ length: 5 }, () => Array(5).fill(0));
    for (const r of risks) { const l = Number(r[lk] || r.likelihood), c = Number(r[ck] || r.consequence); if (l && c) g[l - 1][c - 1]++; }
    return g;
  };
  const g = which === 'residual' ? grid('residual_likelihood', 'residual_consequence') : grid('likelihood', 'consequence');
  const inCell = cell ? risks.filter((r) => Number(which === 'residual' ? r.residual_likelihood || r.likelihood : r.likelihood) === cell[0] && Number(which === 'residual' ? r.residual_consequence || r.consequence : r.consequence) === cell[1]) : [];
  return (
    <div className="grid g-2">
      <Card title="Risk heat map" sub="Open threats by likelihood and consequence; select a cell to list its risks." actions={<Seg value={which} onChange={setWhich} options={[{ value: 'residual', label: 'Residual' }, { value: 'inherent', label: 'Inherent' }]} />}>
        <RiskHeat grid={g} matrix={me.settings.riskMatrix} onCell={(l, c) => setCell([l, c])} />
      </Card>
      <Card title={cell ? `Risks in this cell (${inCell.length})` : 'Select a cell'}>
        {cell && <ul className="list">{inCell.map((r) => <li key={r.id}><Level v={r.residual_level || r.inherent_level} /><span className="grow">{r.ref} {r.title}</span></li>)}</ul>}
      </Card>
    </div>
  );
}
