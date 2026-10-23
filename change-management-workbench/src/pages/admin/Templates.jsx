// Artefact templates (ART-024 to ART-029): organisation templates for each artefact and audience, with
// branding, a tagged Word template validated on upload, a PowerPoint theme, test generation with sample data,
// copying, and versioned publication (editing a published template starts a new draft version).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, Empty, Badge, Spinner, ErrorBox, Drawer, KV } from '../../ui/core.jsx';
import DataGrid from '../../ui/DataGrid.jsx';
import { useApp, useDialog, useToast } from '../../state/app.jsx';
import { useMutator } from '../../state/initiative.jsx';
import { downloadFile } from '../../data/client.js';
import { fmtDate, fmtDateTime } from '../../lib/format.js';
import { CATALOGUE, catalogueEntry, FORMAT_LABELS } from '../../../shared/artefacts/catalogue.js';
import { DEFAULT_BRANDING } from '../../../shared/artefacts/ir.js';
import { asArray, bytesToBase64, sortBy } from '../../../shared/util.js';

const STATE_TONE = { draft: '', test: 'info', published: 'good', retired: 'warning' };
const STATE_LABEL = { draft: 'Draft', test: 'Tested', published: 'Published', retired: 'Retired' };
const VARIANTS = { full: 'Full', sponsor: 'Sponsor', manager: 'Manager', external: 'External' };
const FONTS = ['Calibri', 'Aptos', 'Arial', 'Segoe UI', 'Verdana', 'Georgia', 'Times New Roman', 'Public Sans'];

export default function Templates() {
  const { api, refresh } = useApp();
  const mut = useMutator();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => api.list('template', {}).then((r) => { setRows(r.rows); setError(null); }).catch(setError), [api]);
  useEffect(() => { load(); }, [load]);
  const changed = async () => { await load(); refresh(); };
  const create = async () => {
    try {
      const t = await mut.create('template', { name: 'New template', artefactType: '*', variant: 'full', state: 'draft', branding: { ...DEFAULT_BRANDING } }, { quiet: true });
      await changed();
      setOpen(t.id);
    } catch (e) { toast.error(e); }
  };
  const starter = async () => { try { const r = await api.op('starterTemplate', {}); await downloadFile(api, r.blobId, r.filename); } catch (e) { toast.error(e); } };
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!rows) return <Spinner />;
  return (
    <>
      <DataGrid id="admin-templates" type="template" title="Artefact templates" rows={sortBy(rows, (t) => ['published', 'test', 'draft', 'retired'].indexOf(t.state), 'name')} exportName="Artefact templates" onRowClick={(t) => setOpen(t.id)}
        columns={[
          { key: 'name', label: 'Template', render: (t) => <span><strong>{t.name}</strong><span className="sub-line tiny muted">{t.businessUnit || 'Whole organisation'}{t.basedOnId ? ' · copied' : ''}</span></span>, value: (t) => t.name },
          { key: 'artefact', label: 'Artefact', render: (t) => (t.artefactType === '*' ? 'Any artefact (default)' : catalogueEntry(t.artefactType)?.title || t.artefactType), value: (t) => t.artefactType },
          { key: 'variant', label: 'Audience', render: (t) => VARIANTS[t.variant] || 'Full', value: (t) => t.variant || 'full' },
          { key: 'state', label: 'State', render: (t) => <Badge tone={STATE_TONE[t.state]}>{STATE_LABEL[t.state] || t.state}</Badge>, value: (t) => t.state },
          { key: 'version', label: 'Version', align: 'num', render: (t) => t.templateVersion || 1, value: (t) => t.templateVersion || 1 },
          { key: 'word', label: 'Word template', render: (t) => (t.docxTemplateId ? (t.docxValidation?.ok === false ? <Badge tone="critical" icon="alert">Errors</Badge> : asArray(t.docxValidation?.warnings).length ? <Badge tone="warning">Warnings</Badge> : <Badge tone="good" icon="checkCircle">Valid</Badge>) : <span className="muted small">Built-in layout</span>), value: (t) => (t.docxTemplateId ? 1 : 0) },
          { key: 'theme', label: 'PowerPoint theme', render: (t) => (t.pptxThemeId ? <Badge tone="info">Uploaded</Badge> : <span className="muted small">Colours only</span>), value: (t) => (t.pptxThemeId ? 1 : 0), hidden: true },
          { key: 'updated', label: 'Updated', render: (t) => fmtDate(String(t.updatedAt || '').slice(0, 10)), value: (t) => t.updatedAt || '', hidden: true },
        ]}
        facets={[{ key: 'state', label: 'State', options: Object.entries(STATE_LABEL).map(([id, l]) => ({ id, label: l })), value: (t) => t.state }]}
        toolbar={<div className="btn-row"><button type="button" className="btn btn-sm" onClick={starter}><Icon name="download" />Starter Word template</button><Link className="btn btn-sm" to="/help?section=templates">Merge fields</Link><button type="button" className="btn btn-sm btn-primary" onClick={create}><Icon name="plus" />New template</button></div>}
        empty={<Empty icon="file" title="No templates">Without a template, artefacts use the built-in layout with the organisation's colours.</Empty>} />
      {open && <TemplateDetail key={open} id={open} rows={rows} onClose={() => setOpen(null)} onChanged={changed} onOpen={setOpen} />}
    </>
  );
}

function TemplateDetail({ id, rows, onClose, onChanged, onOpen }) {
  const { api } = useApp();
  const mut = useMutator();
  const toast = useToast();
  const dialog = useDialog();
  const t = rows.find((x) => x.id === id);
  const [d, setD] = useState(() => ({ name: t?.name, artefactType: t?.artefactType, variant: t?.variant || 'full', businessUnit: t?.businessUnit || '', notes: t?.notes || '', branding: { ...DEFAULT_BRANDING, ...(t?.branding || {}) } }));
  const [busy, setBusy] = useState('');
  const [test, setTest] = useState(null);
  const [formats, setFormats] = useState(['docx', 'pdf']);
  if (!t) return null;
  const entry = t.artefactType === '*' ? catalogueEntry('strategy') : catalogueEntry(t.artefactType);
  const dirty = JSON.stringify(d) !== JSON.stringify({ name: t.name, artefactType: t.artefactType, variant: t.variant || 'full', businessUnit: t.businessUnit || '', notes: t.notes || '', branding: { ...DEFAULT_BRANDING, ...(t.branding || {}) } });
  const setB = (k, v) => setD((x) => ({ ...x, branding: { ...x.branding, [k]: v } }));
  const run = async (key, fn, done) => { setBusy(key); try { const r = await fn(); if (done) toast.success(done); await onChanged(); return r; } catch (e) { if (!e.cancelled) toast.error(e); return null; } finally { setBusy(''); } };
  const saveDetails = () => run('save', async () => {
    if (t.state === 'published' && !(await dialog.confirm({ title: 'Start a new version?', message: `Changing a published template starts version ${(t.templateVersion || 1) + 1} as a draft. Artefacts keep using version ${t.templateVersion || 1} until the new version is published.`, confirmLabel: 'Save as new draft version' }))) throw Object.assign(new Error('Cancelled'), { cancelled: true });
    return mut.update('template', t.id, { ...d, businessUnit: d.businessUnit || null }, { version: t.version, quiet: true });
  }, 'Template saved');
  const setState = (state, msg) => run('state', () => mut.update('template', t.id, { state }, { version: t.version, quiet: true }), msg);
  const upload = (file) => run('upload', async () => {
    const data = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    const r = await api.op('uploadTemplateFile', { templateId: t.id, filename: file.name, data });
    if (r.report && !r.report.ok) toast.warn('The Word template has errors; see the validation report.');
    return r;
  }, `${file.name} uploaded`);
  const validate = () => run('validate', () => api.op('validateTemplate', { templateId: t.id }), 'Validated');
  const removeDocx = () => run('remove', () => mut.update('template', t.id, { docxTemplateId: null }, { version: t.version, quiet: true }), 'Word template removed; the built-in layout is used');
  const runTest = () => run('test', async () => { const r = await api.op('testTemplate', { templateId: t.id, formats }); setTest(r); return r; }, 'Test documents generated with sample data');
  const copy = () => run('copy', async () => {
    const name = await dialog.prompt({ title: 'Copy template', label: 'Name of the copy', multiline: false, defaultValue: `${t.name} (copy)` });
    if (!name) throw Object.assign(new Error('Cancelled'), { cancelled: true });
    const c = await api.op('copyTemplate', { templateId: t.id, name });
    onOpen(c.id);
    return c;
  }, 'Copied');
  const report = t.docxValidation;
  return (
    <Drawer title={t.name} sub={`Artefact template · version ${t.templateVersion || 1} · ${STATE_LABEL[t.state] || t.state}`} onClose={onClose} wide
      actions={<div className="btn-row">
        {t.state !== 'published' && <button type="button" className="btn btn-sm btn-primary" disabled={!!busy || (t.docxTemplateId && report?.ok === false)} title={t.docxTemplateId && report?.ok === false ? 'Fix the Word template errors first' : ''} onClick={() => setState('published', 'Published: new artefacts use this template')}><Icon name="check" />Publish</button>}
        {t.state === 'published' && <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => setState('retired', 'Retired')}>Retire</button>}
        {t.state === 'retired' && <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => setState('draft', 'Back to draft')}>Back to draft</button>}
        <button type="button" className="btn btn-sm" disabled={!!busy} onClick={copy}><Icon name="copy" />Copy</button>
      </div>}>
      <div className="stack">
        <div className="form-section">
          <h3>Use</h3>
          <div className="form-grid">
            <label className="field"><span>Name</span><input value={d.name || ''} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
            <label className="field"><span>Artefact</span><select value={d.artefactType} onChange={(e) => setD({ ...d, artefactType: e.target.value })}><option value="*">Any artefact (organisation default)</option>{CATALOGUE.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
            <label className="field"><span>Audience</span><select value={d.variant} onChange={(e) => setD({ ...d, variant: e.target.value })}>{Object.entries(VARIANTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field"><span>Business unit (blank for the whole organisation)</span><input value={d.businessUnit} onChange={(e) => setD({ ...d, businessUnit: e.target.value })} /></label>
          </div>
        </div>
        <div className="form-section">
          <h3>Branding</h3>
          <div className="form-grid">
            {[['primary', 'Primary colour'], ['accent', 'Accent colour'], ['secondary', 'Secondary colour'], ['highlight', 'Highlight colour']].map(([k, l]) => (
              <label key={k} className="field"><span>{l}</span><span className="row" style={{ flexWrap: 'nowrap' }}><input type="color" aria-label={l} value={d.branding[k] || '#000000'} onChange={(e) => setB(k, e.target.value)} style={{ width: 44, padding: 2 }} /><input aria-label={`${l} code`} value={d.branding[k] || ''} onChange={(e) => setB(k, e.target.value)} style={{ width: 110 }} /></span></label>
            ))}
            <label className="field"><span>Heading font</span><select value={d.branding.fontHeading} onChange={(e) => setB('fontHeading', e.target.value)}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></label>
            <label className="field"><span>Body font</span><select value={d.branding.fontBody} onChange={(e) => setB('fontBody', e.target.value)}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></label>
            <label className="field" style={{ gridColumn: '1 / -1' }}><span>Footer text</span><input value={d.branding.footer || ''} onChange={(e) => setB('footer', e.target.value)} placeholder="For example: Participant Services · Change Management Office" /></label>
            <label className="field" style={{ gridColumn: '1 / -1' }}><span>Note on the cover</span><input value={d.branding.coverNote || ''} onChange={(e) => setB('coverNote', e.target.value)} /></label>
          </div>
          <div className="brand-preview mt-2" aria-hidden="true">
            <div style={{ background: d.branding.primary, color: '#fff', fontFamily: d.branding.fontHeading }}><span style={{ color: d.branding.accent, fontSize: 10, letterSpacing: '0.1em' }}>ORGANISATION</span><strong>{entry?.title || 'Artefact title'}</strong></div>
            <div style={{ borderTop: `3px solid ${d.branding.accent}`, fontFamily: d.branding.fontBody }}><span style={{ color: d.branding.secondary }}>Heading</span> <span style={{ background: d.branding.highlight, padding: '0 4px' }}>highlight</span></div>
          </div>
          <div className="btn-row mt-3"><button type="button" className="btn btn-primary btn-sm" disabled={!dirty || !!busy || !String(d.name || '').trim()} onClick={saveDetails}><Icon name="check" />{busy === 'save' ? 'Saving…' : 'Save changes'}</button></div>
        </div>
        <div className="form-section">
          <h3>Tagged Word template</h3>
          <p className="small muted" style={{ marginTop: 0 }}>A Word document with your cover, styles, headers and footers, and tags where the data goes. Start from the starter template; see Help › Templates and merge fields for every tag.</p>
          <div className="btn-row">
            <label className="btn btn-sm file-btn"><Icon name="upload" />{t.docxTemplateId ? 'Replace the Word template' : 'Upload a Word template'}<input type="file" accept=".docx" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} /></label>
            {t.docxTemplateId && <><button type="button" className="btn btn-sm" onClick={() => downloadFile(api, t.docxTemplateId, `${t.name}.docx`)}><Icon name="download" />Download</button><button type="button" className="btn btn-sm" disabled={!!busy} onClick={validate}>Validate again</button><button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} onClick={removeDocx}>Remove</button></>}
          </div>
          {t.docxTemplateId && report && (
            <div className={`callout small mt-2 ${report.ok ? (asArray(report.warnings).length ? 'warn' : 'good') : 'bad'}`}>
              <strong>{report.ok ? `Valid: ${report.tags} tags recognised.` : 'The template has errors and cannot be published.'}</strong>
              {asArray(report.errors).map((x) => <div key={x}>{x}</div>)}
              {asArray(report.warnings).map((x) => <div key={x}>{x}</div>)}
            </div>
          )}
        </div>
        <div className="form-section">
          <h3>PowerPoint theme</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Upload a presentation or theme (.pptx) to take its colours and fonts for generated presentations.</p>
          <label className="btn btn-sm file-btn"><Icon name="upload" />{t.pptxThemeId ? 'Replace the theme' : 'Upload a theme'}<input type="file" accept=".pptx" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} /></label>
        </div>
        <div className="form-section">
          <h3>Test with sample data</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Generates {entry?.title || 'the artefact'} from fictional sample data, so you can check the template before publishing it. A draft becomes Tested.</p>
          <div className="row" style={{ gap: 14 }}>
            {asArray(entry?.formats).map((f) => <label key={f} className="check small"><input type="checkbox" checked={formats.includes(f)} onChange={(e) => setFormats(e.target.checked ? [...formats, f] : formats.filter((x) => x !== f))} /><span>{FORMAT_LABELS[f]}</span></label>)}
            <button type="button" className="btn btn-sm" disabled={!!busy || !formats.length} onClick={runTest}><Icon name="play" />{busy === 'test' ? 'Generating…' : 'Generate test documents'}</button>
          </div>
          {test && (
            <div className="mt-2">
              <div className="btn-row">{asArray(test.files).map((f) => <button key={f.blobId} type="button" className="btn btn-sm" onClick={() => downloadFile(api, f.blobId, f.filename)}><Icon name="download" />{FORMAT_LABELS[f.format] || f.format}</button>)}</div>
              {asArray(test.problems).length > 0 && <div className="callout warn small mt-2">{test.problems.map((p) => <div key={p}>{p}</div>)}</div>}
            </div>
          )}
        </div>
        <div className="form-section">
          <h3>Versions</h3>
          <KV items={[['Current version', `${t.templateVersion || 1} (${STATE_LABEL[t.state] || t.state})`], ['Published', t.publishedAt ? fmtDateTime(t.publishedAt) : 'Not yet'], ['Copied from', t.basedOnId ? rows.find((x) => x.id === t.basedOnId)?.name || 'another template' : '']]} />
          {asArray(t.versions).length > 0 && <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>{[...t.versions].reverse().map((v) => <li key={v.templateVersion}>Version {v.templateVersion}{v.publishedAt ? `, published ${fmtDateTime(v.publishedAt)}` : ''}{v.docxTemplateId ? ' · with a Word template' : ''}</li>)}</ul>}
        </div>
      </div>
    </Drawer>
  );
}
