// Projects in the engagement and project creation from a template (GOV-001, PLN-015, LSN-004).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEngagement } from './Engagement.jsx';
import { useApi } from '../../lib/hooks.js';
import { post } from '../../lib/api.js';
import { Card, Table, Rag, Status, D, Pct, Modal, Field, Alert, useAction, Empty } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import { LISTS } from '../../../shared/defaults.js';

export default function Projects() {
  const { d, can, lookups } = useEngagement();
  const [creating, setCreating] = useState(false);
  const name = (id) => lookups?.users?.find((u) => u.id === id)?.label;
  return (
    <>
      <Card title="Projects" sub="Each project has its own plan, RAID, change control, status reporting and financials." flush
        actions={(can('setup', 'C') || can('setup', 'U')) && <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New project</button>}>
        <Table rows={d.projects} columns={[
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Project', render: (p) => <Link className="strong" to={`/projects/${p.id}`}>{p.name}</Link> },
          { key: 'manager_id', label: 'Project manager', render: (p) => name(p.manager_id) },
          { key: 'approach', label: 'Approach' },
          { key: 'state', label: 'State', render: (p) => <Status v={p.state} /> },
          { key: 'stage', label: 'Current stage', render: (p) => p.stage || '—' },
          { key: 'rag', label: 'Overall', render: (p) => <Rag v={p.rag} /> },
          { key: 'percent', label: '% done', num: true, render: (p) => <Pct v={p.percent} /> },
          { key: 'start_date', label: 'Start', render: (p) => <D v={p.start_date} /> },
          { key: 'end_date', label: 'End', render: (p) => <D v={p.end_date} /> },
        ]} />
      </Card>
      {creating && <NewProject onClose={() => setCreating(false)} />}
    </>
  );
}

function NewProject({ onClose }) {
  const { id, lookups, reload } = useEngagement();
  const t = useApi('/api/projects/templates');
  const nav = useNavigate();
  const [run, busy] = useAction();
  const [f, setF] = useState({ template_id: '', name: '', manager_id: '', start_date: '', end_date: '', profile_id: '', approach: '', size: '', commercial_model: 'T&M', fixed_price: '' });
  const [created, setCreated] = useState(null);
  const set = (k, v) => setF({ ...f, [k]: v });
  const tpl = t.data?.templates?.find((x) => x.id === f.template_id);
  const create = async () => {
    const body = { ...f, engagement_id: id, fixed_price: f.fixed_price ? Number(f.fixed_price) : undefined };
    for (const k of Object.keys(body)) if (body[k] === '') delete body[k];
    const out = await run(() => post('/api/projects', body), 'Project created');
    if (out) { reload(); setCreated(out); }
  };
  if (created) {
    return (
      <Modal title="Project created" onClose={() => nav(`/projects/${created.project.id}`)} footer={<button className="btn btn-primary" onClick={() => nav(`/projects/${created.project.id}`)}>Open project</button>}>
        <Alert tone="ok">{created.project.code} {created.project.name} was created with its delivery profile’s stages and gates{tpl ? `, the template’s tasks, milestones, deliverables and standard risks` : ''}. Next: commercial approval, then the baseline (UC-01).</Alert>
        <h4 className="mt-3 mb-1">Lessons from similar engagements (LSN-004)</h4>
        {!created.suggestedLessons?.length ? <Empty>No published lessons match yet.</Empty> : (
          <ul className="list">{created.suggestedLessons.map((l) => <li key={l.id}><div className="grow"><b>{l.title}</b><div className="small">{l.summary}</div><div className="tiny muted">{l.category} · {(l.tags || []).join(', ')}</div></div></li>)}</ul>
        )}
      </Modal>
    );
  }
  return (
    <Modal title="New project" wide onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.manager_id || !(f.name || tpl)} onClick={create}>Create project</button></>}>
      <div className="form-grid">
        <Field label="Template" hint="Brings stages, gates, standard tasks, milestones, deliverables and risks (GOV-001).">
          <select value={f.template_id} onChange={(e) => set('template_id', e.target.value)}>
            <option value="">Blank project</option>
            {(t.data?.templates || []).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.durationWeeks} weeks, {x.approach})</option>)}
          </select>
        </Field>
        <Field label="Project name" required={!tpl}><input type="text" value={f.name} placeholder={tpl?.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Project manager" required><select value={f.manager_id} onChange={(e) => set('manager_id', e.target.value)}><option value="">Choose…</option>{(lookups?.users || []).filter((u) => !u.external).map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></Field>
        <Field label="Delivery profile" hint={tpl ? `Template default: ${tpl.profile}` : 'PRINCE2-aligned by default'}>
          <select value={f.profile_id} onChange={(e) => set('profile_id', e.target.value)}><option value="">{tpl ? 'Template default' : 'Default'}</option>{(t.data?.profiles || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </Field>
        <Field label="Start date"><input type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
        <Field label="End date" hint="Defaults to the template duration"><input type="date" value={f.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
        <Field label="Classification (GOV-010)"><select value={f.size} onChange={(e) => set('size', e.target.value)}><option value="">{tpl ? `Template default (${tpl.size})` : 'Medium'}</option><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large (earned value mandatory)</option></select></Field>
        <Field label="Commercial model (FIN-001)"><select value={f.commercial_model} onChange={(e) => set('commercial_model', e.target.value)}>{LISTS.commercialModels.map((m) => <option key={m}>{m}</option>)}</select></Field>
        {['Fixed price', 'Milestone fixed price', 'Outcome-based'].includes(f.commercial_model) && <Field label="Fixed price (ex GST)"><input type="number" value={f.fixed_price} onChange={(e) => set('fixed_price', e.target.value)} /></Field>}
      </div>
      {tpl && (
        <div className="mt-3 small">
          <b>{tpl.name}</b>: {tpl.tasks.length} tasks · {tpl.milestones.length} milestones · standard risks: {tpl.risks.join(', ')}
        </div>
      )}
    </Modal>
  );
}
