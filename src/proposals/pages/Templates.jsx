import { useEffect, useState } from 'react';
import { useP, useCan, loadAssets } from '../lib/store.jsx';
import { Card, PageHead, Modal } from '../../components/ui.jsx';
import { Field, FileDrop, When, Person, Confirm, download, MIME, safeFile } from '../components/common.jsx';
import { SLIDE_KINDS } from '../core/constants.js';

const TAG_HELP = [
  ['Field', '{{client.name}}, {{bid.reference}}, {{submission.due}}', 'A single value'],
  ['Section', '{{section:executive_summary}} or {{section:*}}', 'Approved content of a response section (or all sections in order)'],
  ['Repeating block', '{{#case_studies}} … {{/case_studies}}', 'One block per selected item'],
  ['Table', '{{table:compliance_matrix}}, {{table:pricing}}, {{table:team}}', 'A table in the template’s table style'],
  ['Image', '{{image:client_logo}}', 'An image with alt text'],
  ['Condition', '{{#if lot_2}} … {{/if}}', 'Content shown only when the condition is true'],
];

function Issues({ issues }) {
  if (!issues?.length) return <div className="callout good small">No problems found. Every tag uses the tag syntax and a known field (CL-10).</div>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {issues.map((i, n) => <div key={n} className={`callout small ${i.level === 'error' ? 'warn' : ''}`}><strong>{i.level === 'error' ? 'Error' : 'Warning'}:</strong> {i.message}</div>)}
    </div>
  );
}

// Word template upload, validation and preview with sample data (WD-05, CL-10).
function WordUpload({ existing, onClose }) {
  const { putFile, dispatch, toast } = useP();
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(null);
  const [name, setName] = useState(existing?.name || '');
  const [preview, setPreview] = useState(null);
  const onFiles = async (files) => {
    const f = files[0];
    if (!f) return;
    setBusy('Validating tags…');
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const { inspectTemplate, mergeTemplate } = await import('../gen/wordMerge.js');
      const ins = await inspectTemplate(bytes);
      let html = null;
      if (!ins.issues.some((i) => i.level === 'error')) {
        setBusy('Previewing with sample data…');
        const { sampleData } = await import('../gen/proposalData.js');
        const { docxToHtml } = await import('../gen/docxPreview.js');
        const merged = await mergeTemplate(bytes, sampleData(await loadAssets()), { title: 'Sample' });
        html = await docxToHtml(merged.bytes);
      }
      setRes({ bytes, fileName: f.name, ...ins });
      setPreview(html);
      if (!name) setName(f.name.replace(/\.(docx|dotx)$/i, ''));
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const save = async () => {
    const fileId = await putFile(res.bytes, { name: res.fileName, type: MIME.docx });
    await dispatch('template.upsert', { template: { id: existing?.id, kind: 'word', name, fileId, fileName: res.fileName, placeholders: res.placeholders.map((p) => p.tag), issues: res.issues } }, { success: res.issues.some((i) => i.level === 'error') ? 'Saved as invalid: fix the errors and upload again' : 'Template saved and available to bids' });
    onClose();
  };
  return (
    <Modal title={existing ? `New version of ${existing.name}` : 'Upload a Word template'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>{res && <button className="btn btn-primary" disabled={!name.trim()} onClick={save}>{res.issues.some((i) => i.level === 'error') ? 'Save as invalid' : 'Save template'}</button>}</>}>
      <div className="modal-wide" />
      {!res ? <FileDrop onFiles={onFiles} accept=".docx,.dotx" multiple={false} busy={busy} label="Drop a .docx or .dotx template" /> : (
        <div className="stack">
          <Field label="Template name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="small">{res.placeholders.length} tags found: {[...new Set(res.placeholders.map((p) => p.tag))].slice(0, 30).join(' ')}</div>
          <Issues issues={res.issues} />
          {preview && <><div className="eyebrow">Preview with sample data</div><div className="doc-preview"><div className="sheet" dangerouslySetInnerHTML={{ __html: preview }} /></div></>}
        </div>
      )}
    </Modal>
  );
}

// PowerPoint master upload and layout mapping (PP-01).
function PptUpload({ existing, onClose }) {
  const { putFile, dispatch, toast, getFile } = useP();
  const [info, setInfo] = useState(existing?.layouts?.length ? { layouts: existing.layouts, issues: [] } : null);
  const [bytes, setBytes] = useState(null);
  const [fileName, setFileName] = useState(existing?.fileName || '');
  const [mapping, setMapping] = useState(existing?.mapping || {});
  const [name, setName] = useState(existing?.name || '');
  const [mod, setMod] = useState(null);
  const load = async () => { const m = await import('../gen/pptxTemplate.js'); setMod(m); return m; };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onFiles = async (files) => {
    const f = files[0];
    if (!f) return;
    try {
      const b = new Uint8Array(await f.arrayBuffer());
      const m = mod || (await load());
      const ins = await m.inspectPptxTemplate(b);
      setInfo(ins); setBytes(b); setFileName(f.name); setMapping(m.suggestMapping(ins.layouts));
      if (!name) setName(f.name.replace(/\.(pptx|potx)$/i, ''));
    } catch (e) { toast(e.message, 'error'); }
  };
  const issues = info && mod ? [...(info.issues || []), ...mod.validateMapping(info.layouts, mapping)] : [];
  const testRender = async () => {
    try {
      const b = bytes || (await getFile(existing.fileId))?.bytes;
      const sample = { slides: Object.entries(SLIDE_KINDS).slice(0, 8).map(([k, v], i) => ({ id: `s${i}`, kind: k, layout: v.layout, include: true, title: `${v.title}: a sample action title`, subtitle: 'Sample subtitle', points: ['First sample point', 'Second sample point', 'Third sample point'], notes: 'Sample speaker notes.' })) };
      const out = await mod.renderIntoMaster(b, sample, mapping);
      download(out, `${safeFile(name)}_test_render.pptx`, MIME.pptx);
    } catch (e) { toast(e.message, 'error'); }
  };
  const save = async () => {
    const fileId = bytes ? await putFile(bytes, { name: fileName, type: MIME.pptx }) : existing.fileId;
    await dispatch('template.upsert', { template: { id: existing?.id, kind: 'pptx', name, fileId, fileName, layouts: info.layouts, mapping, issues } }, { success: issues.some((i) => i.level === 'error') ? 'Saved as invalid' : 'Master saved and available to decks' });
    onClose();
  };
  return (
    <Modal title={existing ? `Master: ${existing.name}` : 'Upload a PowerPoint master'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>{info && <><button className="btn" disabled={issues.some((i) => i.level === 'error')} onClick={testRender}>Test render</button><button className="btn btn-primary" disabled={!name.trim()} onClick={save}>Save</button></>}</>}>
      <div className="modal-wide" />
      {!info ? <FileDrop onFiles={onFiles} accept=".pptx,.potx" multiple={false} label="Drop a .pptx or .potx master" /> : (
        <div className="stack">
          <Field label="Master name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <p className="small">Map each deck layout to one of the master’s {info.layouts.length} layouts. Each needs the placeholders shown.</p>
          <table className="table">
            <thead><tr><th>Deck layout</th><th>Needs</th><th>Master layout</th><th>Placeholders</th></tr></thead>
            <tbody>
              {(mod?.DECK_LAYOUTS || []).map((dl) => {
                const l = info.layouts.find((x) => x.file === mapping[dl.id]);
                return (
                  <tr key={dl.id}>
                    <td className="strong">{dl.label}</td>
                    <td className="small">{dl.needs.join(', ')}</td>
                    <td><select value={mapping[dl.id] || ''} onChange={(e) => setMapping({ ...mapping, [dl.id]: e.target.value })} aria-label={`${dl.label} layout`}><option value="">Choose…</option>{info.layouts.map((x) => <option key={x.file} value={x.file}>{x.name}</option>)}</select></td>
                    <td className="small">{l ? l.placeholders.map((p) => p.kind).join(', ') || 'none' : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Issues issues={issues} />
          {!bytes && existing && <FileDrop onFiles={onFiles} accept=".pptx,.potx" multiple={false} label="Replace the master file (creates a new version)" />}
        </div>
      )}
    </Modal>
  );
}

export default function Templates() {
  const { view, dispatch, getFile, toast } = useP();
  const can = useCan();
  const manage = can('configure');
  const [upload, setUpload] = useState(null);
  const [retire, setRetire] = useState(null);
  const [preview, setPreview] = useState(null);
  const templates = view.templates.filter((t) => t.status !== 'retired');
  const dl = async (t) => {
    try {
      if (t.builtIn) {
        if (t.kind === 'word') {
          const { buildWordTemplate } = await import('../gen/wordTemplate.js');
          const assets = await loadAssets();
          download(await buildWordTemplate(t.builtIn === 'short' ? 'short' : 'proposal', { logoPng: assets.logoColor }), `${safeFile(t.name)}.docx`, MIME.docx);
        } else {
          const { renderDeck } = await import('../gen/pptx.js');
          const sample = { slides: Object.entries(SLIDE_KINDS).slice(0, 10).map(([k, v], i) => ({ id: `s${i}`, kind: k, layout: v.layout, include: true, title: v.title, subtitle: 'Sample', points: ['First point', 'Second point', 'Third point'], notes: '', data: v.layout === 'timeline' ? { phases: [{ label: 'Discover', detail: 'Weeks 1–4' }, { label: 'Design', detail: 'Weeks 5–8' }, { label: 'Deliver', detail: 'Weeks 9–20' }] } : null })) };
          download(await renderDeck(sample, { title: 'CTO Consulting master', assets: await loadAssets() }), `${safeFile(t.name)}.pptx`, MIME.pptx);
        }
        return;
      }
      const f = await getFile(t.fileId);
      if (!f) throw new Error('The template file is not available in this browser.');
      download(f.bytes, t.fileName || `${safeFile(t.name)}.${t.kind === 'word' ? 'docx' : 'pptx'}`, f.type);
    } catch (e) { toast(e.message, 'error'); }
  };
  const previewWord = async (t) => {
    try {
      const [{ templateBytesFor }, { mergeTemplate }, { sampleData }, { docxToHtml }, assets] = await Promise.all([import('../gen/generate.js'), import('../gen/wordMerge.js'), import('../gen/proposalData.js'), import('../gen/docxPreview.js'), loadAssets()]);
      const bytes = await templateBytesFor(t, async (id) => (await getFile(id))?.bytes);
      const merged = await mergeTemplate(bytes, sampleData(assets), { title: 'Sample' });
      setPreview({ t, html: await docxToHtml(merged.bytes) });
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="stack">
      <PageHead eyebrow="Content" title="Templates" actions={manage && <div className="row"><button className="btn" onClick={() => setUpload({ kind: 'pptx' })}>Upload PowerPoint master</button><button className="btn btn-primary" onClick={() => setUpload({ kind: 'word' })}>Upload Word template</button></div>}>
        Ordinary Word and PowerPoint files that use named styles and placeholder tags. Designers keep full control of the cover, styles, headers and footers.
      </PageHead>
      <Card pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Template</th><th>Kind</th><th>Version</th><th>Status</th><th>Uploaded</th><th /></tr></thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td className="strong">{t.name}{t.default && <span className="pill navy" style={{ marginLeft: 6 }}>Default</span>}{t.builtIn && <div className="mini">Built in · brand {t.brandVersion}</div>}{t.issues?.length > 0 && <div className="mini" style={{ color: t.issues.some((i) => i.level === 'error') ? 'var(--st-critical)' : undefined }}>{t.issues.length} validation issue{t.issues.length === 1 ? '' : 's'}</div>}</td>
                  <td>{t.kind === 'word' ? 'Word proposal' : 'PowerPoint master'}</td>
                  <td className="tabular">v{t.version}</td>
                  <td><span className={`pill ${t.status === 'approved' ? 'good' : 'bad'}`}>{t.status === 'approved' ? 'Available' : 'Invalid'}</span></td>
                  <td className="small"><When at={t.uploadedAt} /><div><Person id={t.by} /></div></td>
                  <td className="nowrap">
                    <button className="btn btn-sm" onClick={() => dl(t)}>Download</button>
                    {t.kind === 'word' && t.status === 'approved' && <button className="btn btn-sm btn-ghost" onClick={() => previewWord(t)}>Preview</button>}
                    {manage && !t.builtIn && <button className="btn btn-sm btn-ghost" onClick={() => setUpload({ kind: t.kind, existing: t })}>{t.kind === 'word' ? 'New version' : 'Mapping'}</button>}
                    {manage && !t.default && t.status === 'approved' && <button className="btn btn-sm btn-ghost" onClick={() => dispatch('template.upsert', { template: { ...t, default: true } }, { success: 'Default template changed' })}>Make default</button>}
                    {manage && !t.builtIn && <button className="btn btn-sm btn-ghost" onClick={() => setRetire(t)}>Retire</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Tag syntax" subtitle="Tags are validated on upload against the syntax and field list (CL-10). Download a built-in template to start from a working example.">
        <table className="table"><thead><tr><th>Tag type</th><th>Example</th><th>Filled with</th></tr></thead><tbody>{TAG_HELP.map(([a, b, c]) => <tr key={a}><td className="strong">{a}</td><td style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{b}</td><td className="small">{c}</td></tr>)}</tbody></table>
        <FieldList />
      </Card>
      {upload?.kind === 'word' && <WordUpload existing={upload.existing} onClose={() => setUpload(null)} />}
      {upload?.kind === 'pptx' && <PptUpload existing={upload.existing} onClose={() => setUpload(null)} />}
      {retire && <Confirm title={`Retire ${retire.name}?`} danger confirmLabel="Retire" onClose={() => setRetire(null)} onConfirm={() => dispatch('template.remove', { id: retire.id }, { success: 'Template retired' })}><p>Outputs already generated keep their record of this template and version.</p></Confirm>}
      {preview && <Modal title={`Preview: ${preview.t.name}`} onClose={() => setPreview(null)} footer={<button className="btn" onClick={() => setPreview(null)}>Close</button>}><p className="mini">Merged with sample data.</p><div className="doc-preview"><div className="sheet" dangerouslySetInnerHTML={{ __html: preview.html }} /></div></Modal>}
    </div>
  );
}

function FieldList() {
  const [lists, setLists] = useState(null);
  useEffect(() => { import('../gen/wordMerge.js').then((m) => setLists({ fields: Object.keys(m.FIELDS), blocks: m.BLOCKS, tables: m.TABLES, images: m.IMAGES, conditions: m.CONDITIONS })); }, []);
  if (!lists) return null;
  return (
    <details style={{ marginTop: 10 }}>
      <summary className="small strong">All fields, blocks, tables, images and conditions</summary>
      <div className="small" style={{ marginTop: 8, lineHeight: 1.8 }}>
        <div><strong>Fields:</strong> {lists.fields.map((f) => <code key={f} style={{ marginRight: 8 }}>{`{{${f}}}`}</code>)}</div>
        <div><strong>Blocks:</strong> {Object.entries(lists.blocks).map(([b, fs]) => <span key={b} style={{ marginRight: 12 }}><code>{`{{#${b}}}`}</code> ({fs.join(', ')})</span>)}</div>
        <div><strong>Tables:</strong> {lists.tables.map((t) => <code key={t} style={{ marginRight: 8 }}>{`{{table:${t}}}`}</code>)}</div>
        <div><strong>Images:</strong> {lists.images.map((t) => <code key={t} style={{ marginRight: 8 }}>{`{{image:${t}}}`}</code>)}</div>
        <div><strong>Conditions:</strong> {lists.conditions.map((t) => <code key={t} style={{ marginRight: 8 }}>{`{{#if ${t}}}`}</code>)}</div>
      </div>
    </details>
  );
}
