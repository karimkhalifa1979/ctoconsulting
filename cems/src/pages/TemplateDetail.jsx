// A report template (RPT-003..027): versions, upload with scanning and sanitising, validation
// with locations, mapping of existing placeholders to tokens, preview with sample or live data,
// approval and publication, cloning and retirement.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { post, patch, upload, download } from '../lib/api.js';
import { useLookups } from '../components/fields.jsx';
import { Approvals } from '../components/Record.jsx';
import { PageHead, Card, Async, Table, Status, Badge, DT, Alert, Empty, Field, Modal, KV, Loading, useAction, useDialog } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import { REPORT_TYPES } from './Templates.jsx';

export default function TemplateDetail() {
  const { id } = useParams();
  const q = useApi(`/api/templates/${id}`);
  const [sel, setSel] = useState(null);
  return (
    <Async q={q}>{(t) => {
      const vid = sel || t.draft_version_id || t.current_version_id || t.versions[0]?.id;
      return (
        <>
          <PageHead title={t.name} crumbs={<><Link to="/reports">Reports</Link><span>›</span><Link to="/reports/templates">Templates</Link><span>›</span></>}
            sub={<>{t.report_type} · {t.scope}{t.client ? ` (${t.client})` : ''}{t.engagement ? ` (${t.engagement})` : ''} · {t.level}-level · {t.audience} audience</>}
            actions={<Actions t={t} reload={q.reload} onUploaded={(v) => { setSel(v.id); q.reload(); }} />} />
          <div className="flex mb-2"><Status v={t.status} />{t.cloned_from && <Badge tone="grey">Cloned</Badge>}{t.description && <span className="small muted">{t.description}</span>}</div>
          <div className="split-nav">
            <div className="stack">
              <Card title="Versions" flush>
                {!t.versions.length ? <Empty>No file uploaded yet.</Empty> : (
                  <ul className="list selectable">
                    {t.versions.map((v) => (
                      <li key={v.id} className={v.id === vid ? 'active' : ''} onClick={() => setSel(v.id)}>
                        <div className="grow">
                          <div className="strong">Version {v.version_no}{v.id === t.current_version_id && t.status === 'Published' ? ' · current' : ''}</div>
                          <div className="tiny muted">{v.file_name} · <DT v={v.uploaded_at} /></div>
                          <div className="tiny">{v.ok ? <span className="pos">Valid</span> : <span className="neg">{v.errors} error{v.errors === 1 ? '' : 's'}</span>}{v.warnings ? ` · ${v.warnings} warnings` : ''} · scan {v.scan || '—'}</div>
                        </div>
                        <Status v={v.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Approval">
                {vid ? <Approvals entity="template_version" id={vid} onDecided={q.reload} /> : <Empty>Nothing to approve.</Empty>}
              </Card>
            </div>
            {vid ? <Version key={vid} id={vid} t={t} reload={q.reload} /> : <Card><Empty>Upload a Word (.docx) template to begin. See the token reference for what you can use.</Empty></Card>}
          </div>
        </>
      );
    }}</Async>
  );
}

function Actions({ t, reload, onUploaded }) {
  const nav = useNavigate();
  const file = useRef(null);
  const [run, busy] = useAction();
  const dialog = useDialog();
  const [cloning, setCloning] = useState(false);
  const [editing, setEditing] = useState(false);
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const out = await run(() => upload(`/api/templates/${t.id}/upload`, f), (o) => `Version ${o.version.version_no} uploaded: ${o.version.validation.ok ? 'valid' : `${o.version.validation.errors.length} errors to fix`}`);
    if (out) onUploaded(out.version);
  };
  const retire = async () => {
    if (!(await dialog({ title: 'Retire template', message: 'Retired templates cannot be used for new reports; issued reports keep their link to it (RPT-006).', confirm: 'Retire', danger: true }))) return;
    const out = await run(() => post(`/api/templates/${t.id}/retire`), 'Template retired');
    if (out) reload();
  };
  return (
    <>
      {t.can?.manage && t.status !== 'Retired' && <><input ref={file} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={onFile} /><button className="btn btn-sm btn-primary" disabled={busy} onClick={() => file.current?.click()}><Icon name="upload" /> Upload new version</button></>}
      {t.can?.manage && <button className="btn btn-sm" onClick={() => setEditing(true)}><Icon name="edit" /> Details</button>}
      <button className="btn btn-sm" onClick={() => setCloning(true)}><Icon name="copy" /> Clone</button>
      {t.can?.manage && t.status !== 'Retired' && <button className="btn btn-sm btn-danger" disabled={busy} onClick={retire}>Retire</button>}
      {cloning && <Clone t={t} onClose={() => setCloning(false)} onDone={(c) => nav(`/reports/templates/${c.id}`)} />}
      {editing && <EditMeta t={t} onClose={() => setEditing(false)} onDone={() => { setEditing(false); reload(); }} />}
    </>
  );
}

function EditMeta({ t, onClose, onDone }) {
  const [run, busy] = useAction();
  const [f, setF] = useState({ name: t.name, description: t.description || '', report_type: t.report_type, level: t.level, audience: t.audience });
  const save = async () => {
    const out = await run(() => patch(`/api/templates/${t.id}`, f), 'Template updated; versions revalidated');
    if (out) onDone();
  };
  return (
    <Modal title="Template details" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Name" full><input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Description" full><textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Report type"><select value={f.report_type} onChange={(e) => setF({ ...f, report_type: e.target.value })}>{REPORT_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Level"><select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option value="engagement">Engagement</option><option value="project">Project</option></select></Field>
        <Field label="Audience"><select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="client">Client</option><option value="internal">Internal</option></select></Field>
      </div>
    </Modal>
  );
}

function Clone({ t, onClose, onDone }) {
  const lookups = useLookups();
  const [run, busy] = useAction();
  const [f, setF] = useState({ name: `${t.name} (copy)`, scope: 'Engagement', engagement_id: '', client_id: '' });
  const go = async () => {
    const out = await run(() => post(`/api/templates/${t.id}/clone`, f), 'Template cloned');
    if (out) onDone(out);
  };
  return (
    <Modal title="Clone template (RPT-011)" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.name} onClick={go}>Clone</button></>}>
      <div className="form-grid">
        <Field label="Name" full><input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Scope"><select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}><option>Firm</option><option>Client</option><option>Engagement</option></select></Field>
        {f.scope === 'Client' && <Field label="Client"><select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}><option value="">Choose…</option>{(lookups?.clients || []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>}
        {f.scope === 'Engagement' && <Field label="Engagement"><select value={f.engagement_id} onChange={(e) => setF({ ...f, engagement_id: e.target.value })}><option value="">Choose…</option>{(lookups?.engagements || []).map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select></Field>}
      </div>
    </Modal>
  );
}

function Version({ id, t, reload }) {
  const q = useApi(`/api/template-versions/${id}`);
  const [run, busy] = useAction();
  const [tab, setTab] = useState('validation');
  const v = q.data;
  if (!v) return <Card><Loading /></Card>;
  const val = v.validation || { errors: [], warnings: [], tokens: [] };
  const submit = async () => {
    const out = await run(() => post(`/api/template-versions/${id}/submit`), (o) => (o.status === 'Published' ? 'Published' : 'Submitted to the PMO for approval'));
    if (out) { q.reload(); reload(); }
  };
  const revalidate = async () => {
    const out = await run(() => post(`/api/template-versions/${id}/revalidate`), 'Revalidated');
    if (out) q.reload();
  };
  const editable = t.can?.manage && ['Draft'].includes(v.status);
  return (
    <div className="stack">
      <Card title={`Version ${v.version_no}`} sub={`${v.file_name} · ${Math.round((v.size || 0) / 1024)} KB · uploaded ${new Date(v.uploaded_at).toLocaleString('en-AU')}`}
        actions={<>
          <button className="btn btn-sm" onClick={() => download(`/api/template-versions/${id}/download`)}><Icon name="download" /> Word file</button>
          {t.can?.manage && <button className="btn btn-sm" disabled={busy} onClick={revalidate}>Revalidate</button>}
          {editable && <button className="btn btn-sm btn-primary" disabled={busy || !val.ok} onClick={submit} title={val.ok ? '' : 'Fix validation errors first (RPT-025)'}>Submit for publication</button>}
        </>}>
        <div className="flex flex-wrap mb-2">
          <Status v={v.status} />
          {val.ok ? <Badge tone="green">Valid</Badge> : <Badge tone="red">{val.errors.length} errors</Badge>}
          {val.warnings.length > 0 && <Badge tone="amber">{val.warnings.length} warnings</Badge>}
          <Badge tone="grey">{val.tokens?.length || 0} tokens</Badge>
          <Badge tone={v.scan?.status === 'clean' ? 'green' : 'amber'}>Malware scan: {v.scan?.status || 'not run'}</Badge>
          {v.sanitised?.length > 0 && <Badge tone="gold" title={v.sanitised.join(', ')}>Sanitised: {v.sanitised.length} item{v.sanitised.length > 1 ? 's' : ''} removed</Badge>}
        </div>
        {v.rejection && <Alert tone="warn">Returned by the PMO: {v.rejection}</Alert>}
        <div className="subtabs">
          {[['validation', 'Validation'], ['tokens', 'Tokens used'], ['mapping', `Placeholder mapping${v.fields?.length ? ` (${v.fields.length})` : ''}`], ['preview', 'Preview']].map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {tab === 'validation' && <Validation val={val} />}
        {tab === 'tokens' && (
          <Table compact rows={(val.tokens || []).map((x, i) => ({ ...x, id: i }))} empty="No tokens found." columns={[
            { key: 'token', label: 'Token', render: (x) => <span className="mono">{x.token}</span> },
            { key: 'kind', label: 'Kind' },
            { key: 'where', label: 'Where' },
          ]} />
        )}
        {tab === 'mapping' && <Mapping v={v} editable={editable} onSaved={q.reload} />}
        {tab === 'preview' && <Preview id={id} t={t} />}
      </Card>
    </div>
  );
}

// RPT-025/026: errors block publication, each with where it is in the document.
function Validation({ val }) {
  if (val.ok && !val.warnings.length) return <Alert tone="ok">No problems found. Every token is recognised and permitted for this audience.</Alert>;
  return (
    <div className="stack-sm">
      {val.errors.map((e, i) => (
        <div key={i} className="alert error"><Icon name="alert" /><div className="flex-1"><div>{e.message}</div><div className="tiny">{e.where || ''}{e.code ? ` · ${e.code}` : ''}</div></div></div>
      ))}
      {val.warnings.map((w, i) => (
        <div key={`w${i}`} className="alert warn"><Icon name="info" /><div className="flex-1"><div>{w.message || w}</div>{w.where && <div className="tiny">{w.where}</div>}</div></div>
      ))}
    </div>
  );
}

// RPT-024: existing placeholders, bookmarks and content controls mapped to tokens without editing the file.
function Mapping({ v, editable, onSaved }) {
  const tokens = useApi('/api/templates/tokens');
  const [rows, setRows] = useState(() => (v.fields || []).map((f) => ({ ...f, token: v.mappings?.find((m) => m.kind === f.kind && m.key === f.key)?.token || '' })));
  const [run, busy] = useAction();
  useEffect(() => { setRows((v.fields || []).map((f) => ({ ...f, token: v.mappings?.find((m) => m.kind === f.kind && m.key === f.key)?.token || '' }))); }, [v]);
  const save = async () => {
    const out = await run(() => post(`/api/template-versions/${v.id}/mappings`, { mappings: rows.filter((r) => r.token).map((r) => ({ kind: r.kind, key: r.key, token: r.token })) }), 'Mappings saved and revalidated');
    if (out) onSaved();
  };
  if (!v.fields?.length) return <Empty>No placeholders, bookmarks or content controls were found. Put tokens such as {'{{engagement.name}}'} directly in the document.</Empty>;
  const options = (tokens.data || []).filter((x) => !['collection', 'helper', 'condition'].includes(x.type) && !x.token.startsWith(' ')).map((x) => x.token.replace(/^\{\{|\}\}$/g, ''));
  return (
    <>
      <p className="small muted">Map fields already in the document to tokens; the file itself is not changed.</p>
      <datalist id="token-options">{options.map((o) => <option key={o} value={o} />)}</datalist>
      <Table compact rows={rows.map((r, i) => ({ ...r, id: i }))} columns={[
        { key: 'kind', label: 'Field type' },
        { key: 'key', label: 'Name or text', render: (r) => <span className="mono">{r.key}</span> },
        { key: 'text', label: 'Current content', render: (r) => <span className="small muted">{r.text}</span> },
        { key: 'token', label: 'Token', sort: false, render: (r) => (editable ? <input type="text" list="token-options" value={r.token} placeholder="for example engagement.name" onChange={(e) => setRows(rows.map((x, j) => (j === r.id ? { ...x, token: e.target.value } : x)))} /> : <span className="mono">{r.token || '—'}</span>) },
      ]} />
      {editable && <div className="btn-row mt-2"><button className="btn btn-sm btn-primary" disabled={busy} onClick={save}>Save mappings</button></div>}
    </>
  );
}

// RPT-027: preview with sample data, or with live data from a chosen project.
function Preview({ id, t }) {
  const lookups = useLookups();
  const projects = useApi('/api/e/project', {});
  const [project, setProject] = useState('');
  const q = useApi(`/api/template-versions/${id}/preview`, { project_id: project || undefined, format: 'html' });
  return (
    <div className="stack-sm">
      <div className="filters">
        <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Preview data" style={{ width: 'auto' }}>
          <option value="">Sample data</option>
          {(projects.data || []).filter((p) => !t.engagement_id || p.engagement_id === t.engagement_id).map((p) => <option key={p.id} value={p.id}>Live: {lookups?.engagements?.find((e) => e.id === p.engagement_id)?.label?.split(' ')[0]} · {p.name}</option>)}
        </select>
        <button className="btn btn-sm" onClick={() => download(`/api/template-versions/${id}/preview`, { project_id: project || undefined, format: 'docx' })}><Icon name="download" /> Word</button>
        <button className="btn btn-sm" onClick={() => download(`/api/template-versions/${id}/preview`, { project_id: project || undefined, format: 'pdf' })}><Icon name="download" /> PDF</button>
      </div>
      <Async q={q}>{(d) => (
        <>
          {d.warnings?.length > 0 && <Alert tone="warn">{d.warnings.slice(0, 5).join('; ')}</Alert>}
          <div className="doc-preview card card-body" dangerouslySetInnerHTML={{ __html: d.html }} />
        </>
      )}</Async>
      <KV items={[['Preview data', project ? 'Live data for the chosen project, using the current reporting period' : 'Built-in sample data covering every token']]} />
    </div>
  );
}
