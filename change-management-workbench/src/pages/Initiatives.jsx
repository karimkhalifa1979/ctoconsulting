// Initiatives (INI-001, INI-007, INI-008, SUS-007, REC-02, INT-010): every initiative I can see and where
// it sits in the portfolio, program and project hierarchy; creating an initiative from scratch or by
// copying selected registers of another; closing, reopening, legal holds and exporting all of an
// initiative's data in open formats.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, Spinner, ErrorBox, Modal, Rag, RiskBadge, Popover } from '../ui/core.jsx';
import DataGrid from '../ui/DataGrid.jsx';
import { RefPicker } from '../ui/fields.jsx';
import { useLookups } from '../ui/RecordForm.jsx';
import { useRecordDrawer } from '../ui/RecordDrawer.jsx';
import { useApp, useDialog, useToast } from '../state/app.jsx';
import { useMutator } from '../state/initiative.jsx';
import { saveBlob } from '../data/client.js';
import { useTab } from '../lib/hooks.js';
import { fmtDate, fmtPct, label, options, RAG_LABEL } from '../lib/format.js';
import { entity, ENTITIES } from '../../shared/schema.js';
import { hasRole, can } from '../../shared/access.js';
import { asArray, sortBy, toCsv, uniq } from '../../shared/util.js';

// Registers that can be copied into a new initiative (INI-008); stakeholder analysis is opt-in.
const COPY_GROUPS = [
  { label: 'Definition', types: ['milestone', 'objective', 'measure', 'strategy', 'narrative'] },
  { label: 'Impact and risk', types: ['impactedGroup', 'impact', 'risk', 'readinessChecklist'] },
  { label: 'Plans', types: ['blueprint', 'activity', 'keyMessage', 'faq', 'toolkitItem', 'tna', 'trainingIntervention', 'coalitionMember', 'changeAgent', 'sustainmentItem'] },
  { label: 'Stakeholders', types: ['profile'] },
];
const DEFAULT_COPY = ['milestone', 'objective', 'measure', 'strategy', 'impactedGroup', 'impact', 'risk', 'readinessChecklist', 'blueprint', 'activity', 'keyMessage', 'faq', 'toolkitItem', 'trainingIntervention', 'sustainmentItem'];

export default function Initiatives() {
  const { api, user } = useApp();
  const [tab, setTab] = useTab('list');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(null);
  const load = useCallback(() => api.op('initiativeList', {}).then((r) => { setRows(r); setError(null); }).catch(setError), [api]);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!rows) return <Spinner />;
  const canCreate = hasRole(user, 'changeLead');
  return (
    <>
      <PageHead eyebrow="Initiatives" title="Change initiatives" actions={canCreate && <button type="button" className="btn btn-primary" onClick={() => setCreating({})}><Icon name="plus" />New initiative</button>}>
        Every change initiative you can see, where it sits in its portfolio, program and project, and how it is tracking. Open one to work on it.
      </PageHead>
      <Tabs value={tab} onChange={setTab} label="Initiatives" tabs={[
        { id: 'list', label: 'Initiatives', icon: 'layers', count: rows.length },
        { id: 'structure', label: 'Portfolio structure', icon: 'network' },
      ]} />
      {tab === 'list' && <InitiativeGrid rows={rows} reload={load} onCopy={(r) => setCreating({ copyFrom: r.id })} />}
      {tab === 'structure' && <Structure rows={rows} />}
      {creating && <NewInitiative initial={creating} initiatives={rows} onClose={() => setCreating(null)} />}
    </>
  );
}

function containerPath(id, byId) {
  const out = [];
  let c = byId[id];
  const seen = new Set();
  while (c && !seen.has(c.id)) { out.unshift(c.name); seen.add(c.id); c = byId[c.parentId]; }
  return out.join(' › ');
}

function InitiativeGrid({ rows, reload, onCopy }) {
  const { user, containers, config, refresh } = useApp();
  const navigate = useNavigate();
  const mut = useMutator();
  const toast = useToast();
  const dialog = useDialog();
  const byId = useMemo(() => Object.fromEntries(containers.map((c) => [c.id, c])), [containers]);
  const isLead = hasRole(user, 'changeLead');
  const isAdmin = hasRole(user, 'admin');
  const act = async (fn, done) => { try { await fn(); toast.success(done); await refresh(); reload(); } catch (e) { if (!e.cancelled) toast.error(e); } };
  const close = (r) => act(async () => {
    const reason = await dialog.prompt({ title: `Close ${r.name}`, message: 'Closing makes the initiative read-only (SUS-007). Open engagements are cancelled. Records are kept under the retention schedule.', label: 'Reason (required if the closeout is not approved or handover is incomplete)', required: false, confirmLabel: 'Close initiative' });
    if (reason == null) throw Object.assign(new Error('Cancelled'), { cancelled: true });
    await mut.op('closeInitiative', { id: r.id, reason }, { quiet: true });
  }, `${r.name} closed`);
  const reopen = (r) => act(async () => {
    const reason = await dialog.prompt({ title: `Reopen ${r.name}`, label: 'Why is it being reopened?', confirmLabel: 'Reopen' });
    if (!reason) throw Object.assign(new Error('Cancelled'), { cancelled: true });
    await mut.op('reopenInitiative', { id: r.id, reason }, { quiet: true });
  }, `${r.name} reopened`);
  const hold = (r) => act(async () => {
    const reason = await dialog.prompt({ title: r.legalHold ? `Release the legal hold on ${r.name}` : `Place ${r.name} on legal hold`, message: r.legalHold ? 'Disposal under the retention schedule resumes for this initiative.' : 'Disposal of this initiative\'s records is suspended until the hold is released (REC-02).', label: 'Reason', confirmLabel: r.legalHold ? 'Release hold' : 'Place on hold' });
    if (!reason) throw Object.assign(new Error('Cancelled'), { cancelled: true });
    await mut.op('setLegalHold', { id: r.id, hold: !r.legalHold, reason }, { quiet: true });
  }, r.legalHold ? 'Legal hold released' : 'Legal hold placed');
  const exportData = async (r) => {
    try {
      const data = await mut.op('exportInitiative', { id: r.id }, { quiet: true });
      await saveExport(data, r);
      toast.success('Export downloaded');
    } catch (e) { toast.error(e); }
  };
  const phases = uniq(rows.map((r) => (r.status === 'closed' ? 'Closed' : r.phase)).filter(Boolean));
  const tops = uniq(rows.map((r) => topOf(r.containerId, byId)).filter(Boolean));
  const cols = [
    { key: 'name', label: 'Initiative', render: (r) => <span><strong>{r.name}</strong><span className="sub-line tiny muted">{[r.code, containerPath(r.containerId, byId)].filter(Boolean).join(' · ')}</span></span>, value: (r) => r.name },
    { key: 'phase', label: 'Phase and stage', render: (r) => (r.status === 'closed' ? <span className="muted">Closed {fmtDate(String(r.closedAt || '').slice(0, 10))}</span> : <span>{r.phase}<span className="sub-line tiny muted">{r.stage}</span></span>), value: (r) => r.phase },
    { key: 'status', label: 'Status', render: (r) => <span className="row" style={{ flexWrap: 'nowrap' }}>{r.status === 'closed' ? <Badge>Closed</Badge> : <Rag value={r.rag} text={RAG_LABEL[r.rag]} />}{r.legalHold && <Badge tone="info" icon="lock">Legal hold</Badge>}</span>, value: (r) => (r.status === 'closed' ? 'closed' : r.rag) },
    { key: 'lead', label: 'Change lead', render: (r) => r.leadName || <span className="muted">—</span>, value: (r) => r.leadName },
    { key: 'sponsor', label: 'Primary sponsor', render: (r) => r.sponsorName || <span className="muted">—</span>, value: (r) => r.sponsorName, hidden: true },
    { key: 'dates', label: 'Dates', render: (r) => <span className="nowrap">{fmtDate(r.start)} – {fmtDate(r.end)}</span>, value: (r) => r.start || '' },
    { key: 'risk', label: 'Risk', render: (r) => (r.riskProfile ? <RiskBadge rating={r.riskProfile} /> : <span className="muted">—</span>), value: (r) => ({ high: 3, medium: 2, low: 1 }[r.riskProfile] || 0) },
    { key: 'readiness', label: 'Readiness', align: 'num', render: (r) => fmtPct(r.readiness), value: (r) => r.readiness ?? -1 },
    { key: 'adoption', label: 'Adoption', align: 'num', render: (r) => fmtPct(r.adoption), value: (r) => r.adoption ?? -1, hidden: true },
    { key: 'approach', label: 'Delivery', render: (r) => label('deliveryApproach', r.deliveryApproach, config) || '—', value: (r) => r.deliveryApproach || '', hidden: true },
    {
      key: '_menu', label: '', sortable: false, render: (r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Popover button={({ toggle }) => <button type="button" className="icon-btn" aria-label={`Actions for ${r.name}`} onClick={toggle}><Icon name="more" /></button>}>
            <button type="button" data-close onClick={() => navigate(`/i/${r.id}`)}><Icon name="arrowRight" />Open</button>
            <button type="button" data-close onClick={() => navigate(`/i/${r.id}/dashboards`)}><Icon name="chart" />Dashboards</button>
            {isLead && <button type="button" data-close onClick={() => onCopy(r)}><Icon name="copy" />Copy as a new initiative</button>}
            {(isLead || isAdmin || hasRole(user, 'auditor')) && <button type="button" data-close onClick={() => exportData(r)}><Icon name="download" />Export all data (JSON and CSV)</button>}
            {isLead && r.status !== 'closed' && <button type="button" data-close onClick={() => close(r)}><Icon name="archive" />Close initiative</button>}
            {isAdmin && r.status === 'closed' && <button type="button" data-close onClick={() => reopen(r)}><Icon name="unlock" />Reopen</button>}
            {(isLead || isAdmin) && <button type="button" data-close onClick={() => hold(r)}><Icon name="lock" />{r.legalHold ? 'Release legal hold' : 'Place on legal hold'}</button>}
          </Popover>
        </span>
      ),
    },
  ];
  return (
    <DataGrid id="initiatives" type="initiative" title="Initiatives" rows={rows} columns={cols} onRowClick={(r) => navigate(`/i/${r.id}`)} exportName="Initiatives"
      facets={[
        { key: 'phase', label: 'Phase', options: phases.map((p) => ({ id: p, label: p })), value: (r) => (r.status === 'closed' ? 'Closed' : r.phase) },
        { key: 'rag', label: 'Status', options: ['green', 'amber', 'red'].map((x) => ({ id: x, label: RAG_LABEL[x] })), value: (r) => r.rag },
        ...(tops.length > 1 ? [{ key: 'top', label: 'Portfolio', options: tops.map((t) => ({ id: t, label: byId[t]?.name || t })), value: (r) => topOf(r.containerId, byId) }] : []),
      ]}
      empty={<Empty icon="layers" title="No initiatives">Create an initiative to start: name it, place it in its program or project, and work through the Phase 1 inputs.</Empty>} />
  );
}

function topOf(id, byId) {
  let c = byId[id];
  const seen = new Set();
  while (c?.parentId && byId[c.parentId] && !seen.has(c.id)) { seen.add(c.id); c = byId[c.parentId]; }
  return c?.id || null;
}

// INT-010: the export as one ZIP holding the JSON export and a CSV per register.
async function saveExport(data, r) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const name = `${r.code || 'initiative'} ${r.shortName || r.name}`.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  zip.file(`${name}.json`, JSON.stringify(data, null, 2));
  zip.file('README.txt', [
    `Export of ${r.name} from the Change Management Workbench.`,
    `Exported ${data.exportedAt} by ${data.exportedBy}.`,
    '',
    `${name}.json holds every record in the initiative with the schema of each record type.`,
    'The csv folder holds one file per register with one column per field. Lists are separated by semicolons; structured fields are JSON.',
  ].join('\r\n'));
  for (const [type, list] of Object.entries(data.records || {})) {
    if (!list?.length || !ENTITIES[type]) continue;
    const keys = uniq(['code', ...entity(type).fields.map((f) => f.key), 'createdAt', 'createdBy', 'updatedAt', 'updatedBy']);
    const cols = keys.map((k) => ({ key: k, label: k, get: (row) => (row[k] != null && typeof row[k] === 'object' && !Array.isArray(row[k]) ? JSON.stringify(row[k]) : Array.isArray(row[k]) && row[k].some((x) => x && typeof x === 'object') ? JSON.stringify(row[k]) : row[k]) }));
    zip.file(`csv/${type}.csv`, `﻿${toCsv(list, cols)}`);
  }
  saveBlob(await zip.generateAsync({ type: 'blob' }), `${name} export.zip`);
}

// INI-007: portfolio › program › project › initiative.
function Structure({ rows }) {
  const { user, containers, config, refresh } = useApp();
  const drawer = useRecordDrawer();
  const children = useMemo(() => {
    const out = {};
    for (const c of sortBy(containers, 'name')) (out[c.parentId || 'root'] ||= []).push(c);
    return out;
  }, [containers]);
  const inis = useMemo(() => {
    const out = {};
    for (const r of rows) (out[r.containerId || 'none'] ||= []).push(r);
    return out;
  }, [rows]);
  const canEdit = can(user, 'C', 'container');
  const node = (c, depth) => (
    <li key={c.id}>
      <div className="tree-row" style={{ paddingLeft: depth * 22 }}>
        <Icon name={c.kind === 'portfolio' ? 'grid' : c.kind === 'program' ? 'layers' : 'briefcase'} />
        {canEdit ? <button type="button" className="link-btn" onClick={() => drawer.open({ type: 'container', id: c.id, onSaved: refresh })}><strong>{c.name}</strong></button> : <strong>{c.name}</strong>}
        <Badge>{label('containerKind', c.kind, config)}</Badge>
        {c.owner && <span className="small muted">{c.owner}</span>}
        {canEdit && c.kind !== 'project' && <button type="button" className="btn btn-xs btn-ghost" onClick={() => drawer.open({ type: 'container', defaults: { parentId: c.id, kind: c.kind === 'portfolio' ? 'program' : 'project' }, onSaved: refresh })}><Icon name="plus" />Add {c.kind === 'portfolio' ? 'program' : 'project'}</button>}
      </div>
      <ul className="tree">
        {(children[c.id] || []).map((x) => node(x, depth + 1))}
        {(inis[c.id] || []).map((r) => <InitiativeLeaf key={r.id} r={r} depth={depth + 1} />)}
      </ul>
    </li>
  );
  const unplaced = inis.none || [];
  return (
    <Card title="Portfolio structure" sub="Portfolios contain programs, programs contain projects, and initiatives sit within a program or project (INI-007)." flush
      actions={canEdit && <button type="button" className="btn btn-sm" onClick={() => drawer.open({ type: 'container', defaults: { kind: 'portfolio' }, onSaved: refresh })}><Icon name="plus" />Add portfolio</button>}>
      {!containers.length && !rows.length ? <Empty icon="network" title="No structure yet">Add a portfolio, then its programs and projects.</Empty> : (
        <ul className="tree tree-root">
          {(children.root || []).map((c) => node(c, 0))}
          {unplaced.length > 0 && (
            <li>
              <div className="tree-row"><Icon name="info" /><strong>Not yet placed in a program or project</strong></div>
              <ul className="tree">{unplaced.map((r) => <InitiativeLeaf key={r.id} r={r} depth={1} />)}</ul>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

function InitiativeLeaf({ r, depth }) {
  return (
    <li>
      <div className="tree-row" style={{ paddingLeft: depth * 22 }}>
        <Icon name="flag" />
        <Link to={`/i/${r.id}`}>{r.name}</Link>
        {r.status === 'closed' ? <Badge>Closed</Badge> : <Rag value={r.rag} text={RAG_LABEL[r.rag]} />}
        <span className="small muted">{r.status === 'closed' ? '' : `${r.phase} · ${r.stage}`}</span>
      </div>
    </li>
  );
}

// INI-001 / INI-008: create an initiative, optionally copying selected registers of another.
function NewInitiative({ initial, initiatives, onClose }) {
  const { user, users, containers, config, settings, refresh } = useApp();
  const lookups = useLookups();
  const mut = useMutator();
  const toast = useToast();
  const navigate = useNavigate();
  const [d, setD] = useState({ name: '', shortName: '', description: '', containerId: '', deliveryApproach: 'predictive', startDate: '', endDate: '', primarySponsorId: null, businessOwnerId: null, projectManagerId: null, changeLeadId: user.id, classification: settings.classification?.default || 'OFFICIAL' });
  const [mode, setMode] = useState(initial.copyFrom ? 'copy' : 'blank');
  const [source, setSource] = useState(initial.copyFrom || initiatives[0]?.id || '');
  const [include, setInclude] = useState(DEFAULT_COPY);
  const [assessments, setAssessments] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const stakeholders = lookups.optionsFor('stakeholder');
  const leads = users.filter((u) => u.roles?.includes('changeLead') && u.status !== 'left').map((u) => ({ id: u.id, label: u.name, sub: u.email }));
  const valid = d.name.trim() && (!d.startDate || !d.endDate || d.startDate <= d.endDate);
  const submit = async () => {
    setBusy(true);
    try {
      const data = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== '' && v != null));
      const r = await mut.op('createInitiative', { data, copyFrom: mode === 'copy' && source ? { initiativeId: source, include, includeAssessments: assessments } : undefined }, { quiet: true });
      await refresh();
      const copied = Object.values(r.copied || {}).reduce((a, b) => a + b, 0);
      toast.success(`${r.initiative.name} created${copied ? ` with ${copied} records copied` : ''}`);
      navigate(`/i/${r.initiative.id}/setup`);
    } catch (e) { toast.error(e); setBusy(false); }
  };
  return (
    <Modal title="New change initiative" wide onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!valid || busy} onClick={submit}>{busy ? 'Creating…' : 'Create initiative'}</button></>}>
      <div className="stack">
        <div className="seg" role="radiogroup" aria-label="Start from">
          <button type="button" role="radio" aria-checked={mode === 'blank'} aria-pressed={mode === 'blank'} onClick={() => setMode('blank')}>Start from scratch</button>
          <button type="button" role="radio" aria-checked={mode === 'copy'} aria-pressed={mode === 'copy'} onClick={() => setMode('copy')} disabled={!initiatives.length}>Copy an existing initiative</button>
        </div>
        <div className="form-grid">
          <label className="field" style={{ gridColumn: '1 / -1' }}><span>Name <span aria-hidden="true">*</span></span><input value={d.name} onChange={(e) => set('name', e.target.value)} required aria-required="true" placeholder="For example: Participant Case Management Replacement" /></label>
          <label className="field"><span>Short name</span><input value={d.shortName} onChange={(e) => set('shortName', e.target.value)} placeholder="Used in menus and file names" /></label>
          <label className="field"><span>Program or project</span>
            <select value={d.containerId} onChange={(e) => set('containerId', e.target.value)}><option value="">Not yet placed</option>{sortBy(containers, 'name').map((c) => <option key={c.id} value={c.id}>{c.name} ({label('containerKind', c.kind, config)})</option>)}</select>
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}><span>Description</span><textarea rows={2} value={d.description} onChange={(e) => set('description', e.target.value)} /></label>
          <label className="field"><span>Change management lead</span><RefPicker value={d.changeLeadId} onChange={(v) => set('changeLeadId', v)} options={leads} /></label>
          <label className="field"><span>Project manager</span><RefPicker value={d.projectManagerId} onChange={(v) => set('projectManagerId', v)} options={lookups.optionsFor('user')} placeholder="Choose a person" /></label>
          <label className="field"><span>Primary sponsor</span><RefPicker value={d.primarySponsorId} onChange={(v) => set('primarySponsorId', v)} options={stakeholders} placeholder="Choose a stakeholder" /></label>
          <label className="field"><span>Business owner</span><RefPicker value={d.businessOwnerId} onChange={(v) => set('businessOwnerId', v)} options={stakeholders} placeholder="Choose a stakeholder" /></label>
          <label className="field"><span>Start date</span><input type="date" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} /></label>
          <label className="field"><span>End date</span><input type="date" value={d.endDate} onChange={(e) => set('endDate', e.target.value)} aria-invalid={!!(d.startDate && d.endDate && d.startDate > d.endDate)} /></label>
          <label className="field"><span>Delivery approach</span><select value={d.deliveryApproach} onChange={(e) => set('deliveryApproach', e.target.value)}>{options('deliveryApproach', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          <label className="field"><span>Security classification</span><select value={d.classification} onChange={(e) => set('classification', e.target.value)}>{options('classification', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        </div>
        {d.startDate && d.endDate && d.startDate > d.endDate && <p className="small" style={{ color: 'var(--st-critical-ink)', margin: 0 }}>The end date is before the start date.</p>}
        {mode === 'copy' && (
          <fieldset className="fieldset">
            <legend>Copy from</legend>
            <label className="field"><span>Initiative</span><select value={source} onChange={(e) => setSource(e.target.value)}>{initiatives.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
            <div className="copy-groups mt-2">
              {COPY_GROUPS.map((g) => (
                <div key={g.label}>
                  <div className="nav-group-label" style={{ padding: '6px 0 4px' }}>{g.label}</div>
                  {g.types.map((t) => <label key={t} className="check small"><input type="checkbox" checked={include.includes(t)} onChange={(e) => setInclude(e.target.checked ? [...include, t] : include.filter((x) => x !== t))} /><span>{entity(t).plural}</span></label>)}
                  {g.label === 'Stakeholders' && <label className="check small"><input type="checkbox" checked={assessments} onChange={(e) => setAssessments(e.target.checked)} /><span>Assessments of named stakeholders (ADKAR, readiness)</span></label>}
                </div>
              ))}
            </div>
            <p className="small muted mt-2">Copied plans start again as drafts: activities are not started, communications are unsent and approvals are not carried over. Stakeholder analysis and assessments are copied only when you select them.</p>
          </fieldset>
        )}
        <p className="small muted" style={{ margin: 0 }}>After creating it you go to Definition and success to record the case for change, objectives and milestones.</p>
      </div>
    </Modal>
  );
}
