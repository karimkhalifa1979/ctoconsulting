// Artefacts (Section 8; UC-07, UC-08): choose an artefact from the catalogue, set its parameters
// (ART-009), check completeness (ART-010), preview it, generate it in Word, PowerPoint, PDF, Excel and HTML,
// and manage the library of generated versions with approval, comparison, reproduction from the stored
// snapshot and publication (ART-012 to ART-017). Also scheduled generation (ART-015) and the narrative
// sections reused across artefacts (ART-021).
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, Modal, Drawer, KV } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import Register from '../../ui/Register.jsx';
import ApprovalPanel from '../../ui/Approvals.jsx';
import { RefPicker } from '../../ui/fields.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { downloadFile } from '../../data/client.js';
import { fmtDate, fmtDateTime, label } from '../../lib/format.js';
import { CATALOGUE, catalogueEntry, FORMAT_LABELS, NARRATIVE_KEYS } from '../../../shared/artefacts/catalogue.js';
import { managersOf } from '../../../shared/artefacts/snapshot.js';
import { asArray, sortBy } from '../../../shared/util.js';
import { hasRole } from '../../../shared/access.js';

const GROUPS = [
  { label: 'Phase deliverables', ids: ['strategy', 'masterPlan', 'closeout'] },
  { label: 'Plans', ids: ['blueprint', 'sponsorPack', 'managerBriefing', 'commsPlan', 'keyMessages', 'trainingPlan', 'resistancePlan', 'canPlan', 'coalitionPlan', 'sustainmentPlan'] },
  { label: 'Analysis and reports', ids: ['impactAssessment', 'stakeholderPlan', 'engagementReport', 'engagementBrief', 'riskReport', 'adkarReport', 'readinessReport', 'handoverChecklist', 'lessonsReport'] },
  { label: 'Presentations', ids: ['steeringPack', 'changeOnAPage'] },
];
const GROUP_SCOPE = new Set(['masterPlan', 'impactAssessment', 'commsPlan', 'trainingPlan', 'readinessReport', 'adkarReport', 'resistancePlan', 'canPlan', 'stakeholderPlan', 'keyMessages']);
const VARIANTS = [{ id: 'full', label: 'Full' }, { id: 'sponsor', label: 'Sponsor' }, { id: 'manager', label: 'Manager' }, { id: 'external', label: 'External (no named stakeholders)' }];
const CLASSIFICATIONS = ['UNOFFICIAL', 'OFFICIAL', 'OFFICIAL: Sensitive', 'PROTECTED'];

export default function Artefacts() {
  const { m, ini } = useIniPage();
  const [tab, setTab] = useTab('generate');
  if (!m) return <Spinner />;
  const review = m.artefacts.filter((a) => a.status === 'forReview').length;
  return (
    <>
      <PageHead eyebrow="Outputs" title="Artefacts">
        Generate strategies, plans, packs and reports straight from the data in {ini.initiative?.shortName || ini.initiative?.name}: consistent, current and branded, with every version kept and reproducible.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'generate', label: 'Generate', icon: 'wand' },
        { id: 'library', label: 'Library', count: m.artefacts.length, icon: 'files' },
        { id: 'schedules', label: 'Schedules', count: (m.records.schedule || []).length || null, icon: 'clock' },
        { id: 'narratives', label: 'Narrative sections', count: m.narratives.length, icon: 'edit' },
      ]} />
      {tab === 'generate' && <Generate onGenerated={() => setTab('library')} />}
      {tab === 'library' && <Library />}
      {tab === 'schedules' && <Schedules />}
      {tab === 'narratives' && <Narratives />}
      {review > 0 && tab === 'generate' && <div className="callout small mt-3">{review} artefact version{review > 1 ? 's are' : ' is'} awaiting approval in the library.</div>}
    </>
  );
}

// --- Generate ---------------------------------------------------------------------------------------
function Generate() {
  const { m, templates } = useIniPage();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const type = params.get('type') || 'masterPlan';
  const entry = catalogueEntry(type) || CATALOGUE[0];
  const pick = (id) => { const p = new URLSearchParams(params); p.set('type', id); p.delete('managerId'); p.delete('stakeholderId'); setParams(p, { replace: true }); };
  const latest = (id) => sortBy(m.artefacts.filter((a) => a.artefactType === id), '-createdAt')[0];
  const ql = q.trim().toLowerCase();
  return (
    <div className="artefact-layout">
      <nav className="artefact-nav" aria-label="Artefact catalogue">
        <input type="search" placeholder="Find an artefact…" aria-label="Find an artefact" value={q} onChange={(e) => setQ(e.target.value)} />
        {GROUPS.map((g) => {
          const items = g.ids.map(catalogueEntry).filter((e) => e && (!ql || e.title.toLowerCase().includes(ql) || e.purpose.toLowerCase().includes(ql)));
          if (!items.length) return null;
          return (
            <div key={g.label}>
              <div className="nav-group-label">{g.label}</div>
              {items.map((e) => {
                const last = latest(e.id);
                return (
                  <button key={e.id} type="button" className={e.id === entry.id ? 'active' : ''} aria-current={e.id === entry.id ? 'page' : undefined} onClick={() => pick(e.id)}>
                    <span className="nav-title">{e.title}</span>
                    <span className="nav-sub">{e.formats.map((f) => f.toUpperCase()).join(' · ')}{last ? ` · v${last.versionLabel}` : ''}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
      <GeneratePanel key={entry.id} entry={entry} templates={templates} />
    </div>
  );
}

function GeneratePanel({ entry, templates }) {
  const { m, mut, toast, user, api, ini, base } = useIniPage();
  const [search] = useSearchParams();
  const formats = entry.formats;
  const [p, setP] = useState(() => ({
    formats: entry.defaultFormats.filter((f) => formats.includes(f)),
    variant: 'full', watermark: true, includeSensitive: false, pdfa: false, groupIds: [], plans: [], templateId: '', classification: '',
    managerId: search.get('managerId') || '', stakeholderId: search.get('stakeholderId') || '', blueprintId: search.get('blueprintId') || '',
    from: search.get('from') || '', to: search.get('to') || '',
  }));
  const [gaps, setGaps] = useState(null);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const managers = useMemo(() => managersOf(m), [m]);
  const set = (k, v) => { setP((x) => ({ ...x, [k]: v })); setGaps(null); };
  const canSensitive = hasRole(user, 'changeLead', 'practitioner');
  const options = templates.filter((t) => t.state === 'published' && (t.artefactType === entry.id || t.artefactType === '*'));
  const payload = () => {
    const out = { formats: p.formats, variant: p.variant, watermark: p.watermark, includeSensitive: canSensitive && p.includeSensitive, pdfa: p.formats.includes('pdf') && p.pdfa };
    for (const k of ['templateId', 'classification', 'managerId', 'stakeholderId', 'blueprintId', 'from', 'to']) if (p[k]) out[k] = p[k];
    if (GROUP_SCOPE.has(entry.id) && p.groupIds.length) out.groupIds = p.groupIds;
    if (entry.id === 'masterPlan' && p.plans.length) out.plans = p.plans;
    return out;
  };
  const check = async () => {
    setBusy('check');
    try { const r = await api.op('checkCompleteness', { initiativeId: ini.id, artefactType: entry.id, params: payload() }); setGaps(r.gaps); } catch (e) { toast.error(e); } finally { setBusy(''); }
  };
  const doPreview = async () => {
    setBusy('preview');
    try { const r = await api.op('previewArtefact', { initiativeId: ini.id, artefactType: entry.id, params: payload() }); setPreview(r.html); setGaps(r.gaps); } catch (e) { toast.error(e); } finally { setBusy(''); }
  };
  const generate = async (proceed = false) => {
    if (!p.formats.length) { toast.warn('Choose at least one format.'); return; }
    setBusy('generate');
    try {
      const r = await mut.op('generateArtefact', { initiativeId: ini.id, artefactType: entry.id, params: payload(), proceed }, { quiet: true });
      if (r.needsDecision) { setGaps(r.gaps); toast.warn('Some content is missing. Resolve it, or generate with marked placeholders.'); return; }
      setResult(r.artefact);
      setGaps(r.gaps);
      toast.success(`${r.artefact.title} v${r.artefact.versionLabel} generated`);
    } catch (e) { toast.error(e); } finally { setBusy(''); }
  };
  const bulk = async (scope) => {
    setBusy('bulk');
    try {
      const r = await mut.op('bulkGenerate', { initiativeId: ini.id, artefactType: entry.id, scope, formats: p.formats.filter((f) => f !== 'html'), params: { variant: p.variant, watermark: p.watermark } }, { quiet: true });
      toast.success(`${r.count} packs generated`);
      await downloadFile(api, r.blobId, r.filename);
    } catch (e) { toast.error(e); } finally { setBusy(''); }
  };
  const warnings = (gaps || []).filter((g) => g.severity !== 'info');
  const fixHref = (g) => (g.fix?.page ? `#${base}/${g.fix.page}${g.fix.tab ? `?tab=${g.fix.tab}` : ''}` : null);
  return (
    <div className="stack" style={{ minWidth: 0 }}>
      <Card title={entry.title} sub={entry.purpose} actions={entry.deliverable ? <Badge tone="info" icon="flag">{{ p1: 'Phase 1', p2: 'Phase 2', p3: 'Phase 3' }[entry.deliverable]} deliverable</Badge> : null}>
        <div className="form-grid">
          {entry.id === 'managerBriefing' && (
            <label className="field"><span>People manager</span>
              <RefPicker value={p.managerId || null} onChange={(v) => set('managerId', v || '')} options={managers.map((x) => ({ id: x.id, label: x.name, sub: `${x.team.length} team member${x.team.length === 1 ? '' : 's'} · ${x.groups.map((g) => m.groupsById[g]?.name).join(', ')}` }))} placeholder="Choose a manager" />
            </label>
          )}
          {entry.id === 'engagementBrief' && (
            <label className="field"><span>Stakeholder</span>
              <RefPicker value={p.stakeholderId || null} onChange={(v) => set('stakeholderId', v || '')} options={sortBy(m.profiles.filter((x) => x.person), (x) => (x.isPriority ? 0 : 1), 'name').map((x) => ({ id: x.stakeholderId, label: x.name, sub: `${x.positionTitle || ''}${x.isPriority ? ' · priority' : ''}` }))} placeholder="Choose a stakeholder" />
            </label>
          )}
          {entry.id === 'blueprint' && (
            <label className="field"><span>Blueprint</span>
              <select value={p.blueprintId} onChange={(e) => set('blueprintId', e.target.value)}><option value="">Organisation Blueprint</option>{m.blueprints.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </label>
          )}
          {entry.id === 'engagementReport' && (
            <>
              <label className="field"><span>From</span><input type="date" value={p.from} onChange={(e) => set('from', e.target.value)} /></label>
              <label className="field"><span>To</span><input type="date" value={p.to} onChange={(e) => set('to', e.target.value)} /></label>
            </>
          )}
          {GROUP_SCOPE.has(entry.id) && (
            <label className="field"><span>Impacted groups (blank for all)</span><RefPicker multiple value={p.groupIds} onChange={(v) => set('groupIds', v)} options={m.groups.map((g) => ({ id: g.id, label: g.name }))} placeholder="All impacted groups" /></label>
          )}
          {entry.id === 'masterPlan' && (
            <label className="field"><span>Plans (blank for every selected plan)</span><RefPicker multiple value={p.plans} onChange={(v) => set('plans', v)} options={m.planTypes.filter((x) => m.selectedPlans.includes(x.id)).map((x) => ({ id: x.id, label: x.label }))} placeholder="All selected plans" /></label>
          )}
          <label className="field"><span>Audience variant</span><select value={p.variant} onChange={(e) => set('variant', e.target.value)}>{VARIANTS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
          <label className="field"><span>Template</span><select value={p.templateId} onChange={(e) => set('templateId', e.target.value)}><option value="">Organisation default</option>{options.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.templateVersion || 1})</option>)}</select></label>
          <label className="field"><span>Security classification</span><select value={p.classification} onChange={(e) => set('classification', e.target.value)}><option value="">{p.includeSensitive ? 'OFFICIAL: Sensitive (default)' : `${ini.initiative?.classification || 'OFFICIAL'} (initiative)`}</option>{CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        </div>
        <fieldset className="fieldset mt-3">
          <legend>Formats</legend>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            {formats.map((f) => <label key={f} className="check"><input type="checkbox" checked={p.formats.includes(f)} onChange={(e) => set('formats', e.target.checked ? [...p.formats, f] : p.formats.filter((x) => x !== f))} /><span>{FORMAT_LABELS[f]}</span></label>)}
          </div>
        </fieldset>
        <fieldset className="fieldset mt-2">
          <legend>Options</legend>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <label className="check"><input type="checkbox" checked={p.watermark} onChange={(e) => set('watermark', e.target.checked)} /><span>Draft watermark</span></label>
            {p.formats.includes('pdf') && <label className="check"><input type="checkbox" checked={p.pdfa} onChange={(e) => set('pdfa', e.target.checked)} /><span>PDF/A-2 for archiving</span></label>}
            <label className="check" title={canSensitive ? '' : 'Only change management leads and practitioners can include sensitive fields'}>
              <input type="checkbox" disabled={!canSensitive} checked={canSensitive && p.includeSensitive} onChange={(e) => set('includeSensitive', e.target.checked)} />
              <span>Include sensitive fields {canSensitive ? '(adds a handling caveat; recorded in the audit log)' : '(not permitted for your role)'}</span>
            </label>
          </div>
        </fieldset>
        <div className="btn-row mt-3">
          <button type="button" className="btn" onClick={check} disabled={!!busy}><Icon name="checkCircle" />{busy === 'check' ? 'Checking…' : 'Check completeness'}</button>
          <button type="button" className="btn" onClick={doPreview} disabled={!!busy}><Icon name="eye" />{busy === 'preview' ? 'Preparing…' : 'Preview'}</button>
          <button type="button" className="btn btn-primary" onClick={() => generate(false)} disabled={!!busy || !p.formats.length}><Icon name="wand" />{busy === 'generate' ? 'Generating…' : 'Generate'}</button>
          {entry.id === 'managerBriefing' && <button type="button" className="btn" onClick={() => bulk('managers')} disabled={!!busy}><Icon name="files" />{busy === 'bulk' ? 'Generating…' : 'One pack per manager (ZIP)'}</button>}
          {entry.id === 'engagementBrief' && <button type="button" className="btn" onClick={() => bulk('priority')} disabled={!!busy}><Icon name="files" />{busy === 'bulk' ? 'Generating…' : 'One brief per priority stakeholder (ZIP)'}</button>}
        </div>
      </Card>
      {gaps && (
        <Card title={gaps.length ? `Completeness: ${warnings.length} to resolve, ${gaps.length - warnings.length} for information` : 'Completeness: nothing missing'} sub={warnings.length ? 'Resolve these, or generate with clearly marked placeholders.' : undefined} flush>
          {gaps.length ? (
            <ul className="gap-list">
              {gaps.map((g) => (
                <li key={g.id} className={g.severity}>
                  <Icon name={g.severity === 'info' ? 'info' : 'alert'} label={g.severity === 'info' ? 'Information' : 'Warning'} />
                  <span>{g.message}</span>
                  {fixHref(g) && <a className="btn btn-xs" href={fixHref(g)}>{g.fix.label || 'Resolve'}</a>}
                </li>
              ))}
            </ul>
          ) : <div className="card-pad small">Everything this artefact needs is recorded.</div>}
          {warnings.length > 0 && <div className="card-pad"><button type="button" className="btn btn-sm btn-primary" onClick={() => generate(true)} disabled={!!busy}>Generate with placeholders</button></div>}
        </Card>
      )}
      {result && <GeneratedFiles a={result} onClose={() => setResult(null)} />}
      {preview && (
        <Modal title={`Preview: ${entry.title}`} wide onClose={() => setPreview(null)} footer={<><button type="button" className="btn" onClick={() => setPreview(null)}>Close</button><button type="button" className="btn btn-primary" onClick={() => { setPreview(null); generate(false); }}>Generate</button></>}>
          <iframe title={`Preview of ${entry.title}`} className="preview-frame" sandbox="" srcDoc={preview} />
        </Modal>
      )}
    </div>
  );
}

function GeneratedFiles({ a, onClose }) {
  const { api } = useIniPage();
  return (
    <Card title={`${a.title} v${a.versionLabel} is ready`} sub="Stored in the artefact library with its data snapshot and template version." actions={<button type="button" className="btn btn-sm btn-ghost" aria-label="Dismiss" onClick={onClose}><Icon name="x" /></button>}>
      <div className="btn-row">{asArray(a.files).map((f) => <button key={f.blobId} type="button" className="btn" onClick={() => downloadFile(api, f.blobId, f.filename)}><Icon name="download" />{FORMAT_LABELS[f.format] || f.format}</button>)}</div>
      {a.includesSensitive && <p className="small mt-2"><Badge tone="critical" icon="lock">Includes sensitive fields</Badge> A handling caveat is shown in the artefact and the inclusion is recorded in the audit log.</p>}
    </Card>
  );
}

// --- Library ----------------------------------------------------------------------------------------
function Library() {
  const { m, config, usersById, api } = useIniPage();
  const [params, setParams] = useSearchParams();
  const [open, setOpenState] = useState(() => params.get('artefact'));
  const setOpen = (id) => {
    setOpenState(id);
    if (!id && params.get('artefact')) { const p = new URLSearchParams(params); p.delete('artefact'); setParams(p, { replace: true }); }
  };
  const rows = sortBy(m.artefacts, '-createdAt');
  const cols = [
    { key: 'title', label: 'Artefact', render: (a) => <span><strong>{a.title}</strong><span className="tiny muted sub-line">{scopeLabel(a, m)}</span></span>, value: (a) => a.title },
    { key: 'version', label: 'Version', render: (a) => `v${a.versionLabel}`, value: (a) => a.versionLabel },
    { key: 'status', label: 'Status', render: (a) => <StatusBadge status={a.status} labelText={label('artefactStatus', a.status, config)} />, value: (a) => a.status },
    { key: 'created', label: 'Generated', render: (a) => <span className="nowrap">{fmtDate(String(a.createdAt).slice(0, 10))}</span>, value: (a) => a.createdAt },
    { key: 'by', label: 'By', render: (a) => usersById[a.createdBy]?.name || (a.createdBy === 'system' ? 'Schedule' : '—'), value: (a) => usersById[a.createdBy]?.name || '' },
    { key: 'files', label: 'Files', sortable: false, render: (a) => <span className="btn-row" onClick={(e) => e.stopPropagation()}>{asArray(a.files).map((f) => <button key={f.blobId} type="button" className="btn btn-xs" title={`Download ${f.filename}`} onClick={() => downloadFile(api, f.blobId, f.filename)}>{f.format.toUpperCase()}</button>)}</span> },
    { key: 'flags', label: 'Notes', render: (a) => <span className="btn-row">{a.includesSensitive && <Badge tone="critical" icon="lock">Sensitive</Badge>}{asArray(a.gaps).some((g) => g.severity !== 'info') && <Badge tone="warning" icon="alert">Placeholders</Badge>}{a.aiUnreviewed && <Badge tone="warning">AI draft</Badge>}{asArray(a.published).length > 0 && <Badge tone="info" icon="external">Published</Badge>}</span>, value: (a) => (a.includesSensitive ? 1 : 0) },
  ];
  return (
    <div className="stack">
      <div>
        <h2>Artefact library</h2>
        <p className="small muted" style={{ margin: '2px 0 0' }}>Every generated version, with the data snapshot and template version it came from. Open one to submit it for approval, compare it with another version, reproduce it or publish it.</p>
      </div>
      <DataGrid id="artefacts" type="artefact" title="Artefact library" rows={rows} columns={cols} onRowClick={(a) => setOpen(a.id)}
        facets={[{ key: 'type', label: 'Artefact', options: CATALOGUE.filter((e) => rows.some((a) => a.artefactType === e.id)).map((e) => ({ id: e.id, label: e.title })), value: (a) => a.artefactType }, { key: 'status', label: 'Status', options: ['draft', 'forReview', 'approved', 'superseded'].map((s) => ({ id: s, label: label('artefactStatus', s, config) })), value: (a) => a.status }]}
        empty={<Empty icon="files" title="No artefacts generated yet">Generate one from the catalogue; every version is kept here with the data it was generated from.</Empty>} />
      {open && <ArtefactDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

const scopeLabel = (a, m) => {
  const p = a.params || {};
  const bits = [];
  if (p.managerId) bits.push(`for ${m.stakeholderName(p.managerId)}`);
  if (p.stakeholderId) bits.push(`on ${m.stakeholderName(p.stakeholderId)}`);
  if (asArray(p.groupIds).length) bits.push(asArray(p.groupIds).map((g) => m.groupsById[g]?.name).filter(Boolean).join(', '));
  if (p.from || p.to) bits.push(`${fmtDate(p.from)} – ${fmtDate(p.to)}`);
  if (p.variant && p.variant !== 'full') bits.push(`${p.variant} variant`);
  return bits.join(' · ') || 'Whole initiative';
};

function ArtefactDetail({ id, onClose }) {
  const { m, mut, toast, api, user, users, settings, canDo, config, templates } = useIniPage();
  const a = m.artefacts.find((x) => x.id === id);
  const [repro, setRepro] = useState(null);
  const [cmp, setCmp] = useState(null);
  const [busy, setBusy] = useState('');
  if (!a) return null;
  const siblings = sortBy(m.artefacts.filter((x) => x.artefactType === a.artefactType && x.id !== a.id && JSON.stringify(x.params?.scopeKey ?? null) === JSON.stringify(a.params?.scopeKey ?? null)), '-createdAt');
  const lead = users.find((u) => u.id === m.initiative.changeLeadId);
  const reproduce = async () => { setBusy('repro'); try { setRepro(await api.op('reproduceArtefact', { id: a.id })); } catch (e) { toast.error(e); } finally { setBusy(''); } };
  const compare = async (bId) => { if (!bId) return; setBusy('cmp'); setCmp(null); try { setCmp(await api.op('compareArtefacts', { aId: bId, bId: a.id })); } catch (e) { toast.error(e); } finally { setBusy(''); } };
  const publish = async (destination) => { try { await mut.op('publishArtefact', { id: a.id, destination }, { quiet: true }); toast.success('Published and the location recorded'); } catch (e) { toast.error(e); } };
  const dc = a.docControl || {};
  return (
    <Drawer title={`${a.title} v${a.versionLabel}`} sub={`${label('artefactStatus', a.status, config)} · generated ${fmtDateTime(a.createdAt, settings.timeZone)}`} onClose={onClose} wide>
      <div className="stack">
        <div className="btn-row">{asArray(a.files).map((f) => <button key={f.blobId} type="button" className="btn btn-sm" onClick={() => downloadFile(api, f.blobId, f.filename)}><Icon name="download" />{FORMAT_LABELS[f.format] || f.format}</button>)}</div>
        <KV items={[
          ['Scope', scopeLabel(a, m)],
          ['Data snapshot taken', fmtDateTime(a.snapshotAt, settings.timeZone)],
          ['Template', a.templateId ? `${templates.find((t) => t.id === a.templateId)?.name || 'Organisation template'} v${a.templateVersion || 1}` : 'Built-in layout'],
          ['Classification', dc.classification],
          ['Formats', asArray(a.files).map((f) => FORMAT_LABELS[f.format] || f.format).join(', ')],
          ['Sensitive fields', a.includesSensitive ? 'Included (handling caveat shown; inclusion audited)' : 'Excluded'],
          ['Placeholders', asArray(a.gaps).filter((g) => g.severity !== 'info').map((g) => g.message).join(' ') || 'None'],
        ]} />
        <div className="form-section">
          <h3>Review and approval</h3>
          {a.status === 'approved' && <p className="small muted">Approved versions cannot be changed. Generating again creates the next minor version for review (RUL-16).</p>}
          <ApprovalPanel subjectType="artefact" subjectId={a.id} label={`${a.title} v${a.versionLabel}`} canSubmit={a.status === 'draft' && canDo('U', 'artefact', a)} defaultApprovers={lead ? [lead.id] : []} />
        </div>
        <div className="form-section">
          <h3>Reproduce from the stored snapshot</h3>
          <p className="small muted">Regenerates this version from the data snapshot and template version that produced it, and checks the content matches (AC-10).</p>
          <button type="button" className="btn btn-sm" onClick={reproduce} disabled={!!busy}><Icon name="refresh" />{busy === 'repro' ? 'Reproducing…' : 'Reproduce and compare'}</button>
          {repro && (
            <div className="mt-2">
              {repro.matches ? <Badge tone="good" icon="checkCircle">Content matches the stored version</Badge> : <Badge tone="critical" icon="alert">Content differs</Badge>}
              <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{repro.comparison.map((c) => <li key={c.format}>{FORMAT_LABELS[c.format] || c.format}: {c.matches ? 'matches' : 'differs'} <button type="button" className="btn btn-xs btn-ghost" onClick={() => { const f = repro.files.find((x) => x.format === c.format); if (f) downloadFile(api, f.blobId, f.filename); }}>Download reproduction</button></li>)}</ul>
            </div>
          )}
        </div>
        <div className="form-section">
          <h3>Compare with another version</h3>
          {siblings.length ? (
            <>
              <select aria-label="Version to compare with" defaultValue="" onChange={(e) => compare(e.target.value)}><option value="" disabled>Choose a version…</option>{siblings.map((x) => <option key={x.id} value={x.id}>v{x.versionLabel} · {fmtDate(String(x.createdAt).slice(0, 10))} · {label('artefactStatus', x.status, config)}</option>)}</select>
              {busy === 'cmp' && <Spinner label="Comparing" />}
              {cmp && (cmp.changes.length ? (
                <table className="tbl mt-2"><thead><tr><th>Area</th><th>Change</th><th>Detail</th></tr></thead><tbody>{cmp.changes.slice(0, 80).map((c, i) => <tr key={i}><td>{c.area}</td><td>{c.change}</td><td className="small">{c.detail}</td></tr>)}</tbody></table>
              ) : <p className="small mt-2">No differences in the underlying data between v{cmp.from} and v{cmp.to}.</p>)}
            </>
          ) : <p className="small muted">This is the only version of this artefact for this scope.</p>}
        </div>
        <div className="form-section">
          <h3>Publish</h3>
          {asArray(a.published).length > 0 && <ul className="small" style={{ margin: '0 0 8px', paddingLeft: 18 }}>{a.published.map((pb, i) => <li key={i}>{pb.path || pb.destination} · {fmtDateTime(pb.at, settings.timeZone)} by {pb.by}</li>)}</ul>}
          {hasRole(user, 'changeLead') ? (
            <div className="btn-row">
              <button type="button" className="btn btn-sm" onClick={() => publish('library')}><Icon name="external" />Publish to the library</button>
              {asArray(settings.integrations?.publishTargets).map((t) => <button key={t.id} type="button" className="btn btn-sm" onClick={() => publish(t.id)}>{t.label}</button>)}
            </div>
          ) : <p className="small muted">A change management lead publishes artefacts.</p>}
        </div>
      </div>
    </Drawer>
  );
}

// --- Schedules -------------------------------------------------------------------------------------
function Schedules() {
  const { mut, toast, users, canDo, settings } = useIniPage();
  const run = async (s) => {
    try {
      const res = asArray(await mut.op('runSchedules', { id: s.id, force: true }, { quiet: true }))[0];
      if (res?.error) toast.error(res.error); else toast.success(`Generated; ${res?.recipients ?? 0} recipient${res?.recipients === 1 ? '' : 's'} notified`);
    } catch (e) { toast.error(e); }
  };
  return (
    <Register type="schedule" title="Scheduled generation" sub="Generate artefacts on a schedule (for example the Steering Committee Pack each Friday at 3 pm) and send them to recipients, who receive only what their access allows. Scheduled artefacts never include sensitive fields (ART-015, RPT-006)."
      defaults={{ kind: 'artefact', artefactType: 'steeringPack', frequency: 'weekly', dayOfWeek: '5', time: '15:00', active: true, recipients: users.filter((u) => u.roles?.includes('changeLead')).map((u) => u.id).slice(0, 1) }}
      formExclude={['kind', 'reportId', 'params', 'lastRunAt', 'nextRunAt']}
      facets={['frequency']}
      columns={[
        { key: 'name', label: 'Schedule', render: (s) => <strong>{s.name}</strong>, value: (s) => s.name },
        { key: 'artefact', label: 'Artefact', render: (s) => catalogueEntry(s.artefactType)?.title || '—', value: (s) => catalogueEntry(s.artefactType)?.title || '' },
        { key: 'when', label: 'When', render: (s) => whenLabel(s), value: (s) => `${s.frequency}${s.dayOfWeek}${s.time}` },
        { key: 'recipients', label: 'Recipients', render: (s) => asArray(s.recipients).length, value: (s) => asArray(s.recipients).length, align: 'right' },
        { key: 'active', label: 'Active', render: (s) => (s.active === false ? <Badge>Paused</Badge> : <Badge tone="good">Active</Badge>), value: (s) => (s.active === false ? 0 : 1) },
        { key: 'last', label: 'Last run', render: (s) => (s.lastRunAt ? fmtDateTime(s.lastRunAt, settings.timeZone) : '—'), value: (s) => s.lastRunAt || '' },
        { key: 'next', label: 'Next run', render: (s) => (s.active !== false && s.nextRunAt ? fmtDateTime(s.nextRunAt, settings.timeZone) : '—'), value: (s) => s.nextRunAt || '' },
        { key: '_run', label: '', sortable: false, render: (s) => canDo('U', 'schedule', s) && <span onClick={(e) => e.stopPropagation()}><button type="button" className="btn btn-xs" onClick={() => run(s)}>Run now</button></span> },
      ]}
      empty={<Empty icon="clock" title="No schedules">Schedule the Steering Committee Pack to be generated before each meeting.</Empty>} />
  );
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function whenLabel(s) {
  const t = s.time || '15:00';
  if (s.frequency === 'daily') return `Daily at ${t}`;
  if (s.frequency === 'monthly') return `Monthly${s.dayOfMonth ? ` on day ${s.dayOfMonth}` : ''} at ${t}`;
  return `${s.frequency === 'fortnightly' ? 'Fortnightly' : 'Weekly'} on ${DAYS[Number(s.dayOfWeek ?? 5)]} at ${t}`;
}

// --- Narratives (ART-021) -----------------------------------------------------------------------------
function Narratives() {
  const { m, mut, toast, canDo } = useIniPage();
  const accept = async (n) => {
    await mut.op('acceptAiDraft', { type: 'narrative', id: n.id });
    toast.success('Accepted; it no longer carries the AI-drafted marking');
  };
  const missing = NARRATIVE_KEYS.filter((k) => !m.narratives.some((n) => n.key === k.id));
  return (
    <div className="stack">
      <Register type="narrative" title="Narrative sections" sub="Write once, reuse everywhere: executive summaries, status commentary and decisions required appear in every artefact that uses them (ART-021)."
        columns={[
          { key: 'key', label: 'Section', render: (n) => <strong>{NARRATIVE_KEYS.find((k) => k.id === n.key)?.label || n.key}</strong>, value: (n) => n.key },
          { key: 'title', label: 'Title', render: (n) => n.title, value: (n) => n.title },
          { key: 'used', label: 'Used in', render: (n) => <span className="sub-line" style={{ maxWidth: 320 }}>{(NARRATIVE_KEYS.find((k) => k.id === n.key)?.usedIn || []).map((id) => catalogueEntry(id)?.title).filter(Boolean).join(', ')}</span>, value: (n) => n.key },
          { key: 'updated', label: 'Updated', render: (n) => fmtDate(String(n.updatedAt || n.createdAt).slice(0, 10)), value: (n) => n.updatedAt || n.createdAt },
          { key: 'ai', label: '', sortable: false, render: (n) => (n.aiDrafted ? <span className="btn-row" onClick={(e) => e.stopPropagation()}><Badge tone="warning">AI draft, not yet accepted</Badge>{canDo('U', 'narrative', n) && <button type="button" className="btn btn-xs" onClick={() => accept(n)}>Accept</button>}</span> : '') },
        ]} />
      {missing.length > 0 && <div className="callout small">Not yet written: {missing.map((k) => k.label.toLowerCase()).join(', ')}. Artefacts that use them fall back to text generated from the data.</div>}
    </div>
  );
}
