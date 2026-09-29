import { useEffect, useRef, useState } from 'react';
import { get, set as idbSet, del } from 'idb-keyval';
import { useApp } from '../lib/store.jsx';
import { PageHead, Card, Toast } from '../components/ui.jsx';
import { buildPolicy, parseDocxTemplate, policyToHtmlDocument, DEFAULT_TEMPLATE } from '../lib/policyAuthor.js';
import { downloadWord, printHtml, safeName } from '../lib/exporters.js';
import { aiStatus, aiPolicy } from '../lib/ai.js';

function Editable({ html, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html;
  }, [html]);
  return <div ref={ref} className="doc-editable" contentEditable suppressContentEditableWarning onBlur={() => onChange(ref.current.innerHTML)} />;
}

const META_FIELDS = [
  ['title', 'Policy title'], ['number', 'Policy number'], ['version', 'Version'], ['status', 'Status'], ['owner', 'Policy owner'],
  ['approver', 'Approved by'], ['effectiveDate', 'Effective date', 'date'], ['reviewDate', 'Next review', 'date'], ['classification', 'Classification'], ['preparedBy', 'Prepared by'],
];

export default function PolicyAuthor() {
  const { org, data, assessments, docs, saveDoc } = useApp();
  const codes = Object.values(data.policies).sort((a, b) => a.title.localeCompare(b.title));
  const [code, setCode] = useState(codes[0]?.code || '');
  const [template, setTemplate] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const doc = docs[code];

  useEffect(() => { aiStatus().then((s) => setAi(s.ai)); get('policyTemplate').then((t) => { if (t) { setTemplate(t.sections); setTemplateName(t.name); } }); }, []);

  const generate = (meta = {}) => {
    const d = buildPolicy({ org, data, code, assessments, meta, template: template || DEFAULT_TEMPLATE });
    saveDoc(code, { ...d, templateName: templateName || 'CTO Consulting standard policy template' });
  };

  const onTemplate = async (file) => {
    try {
      const sections = await parseDocxTemplate(await file.arrayBuffer());
      setTemplate(sections); setTemplateName(file.name);
      await idbSet('policyTemplate', { name: file.name, sections });
      setToast(`Template loaded: ${sections.length} sections`);
    } catch (e) {
      setToast(e.message);
    }
  };
  const resetTemplate = async () => { setTemplate(null); setTemplateName(''); await del('policyTemplate'); };

  const updateSection = (i, html) => saveDoc(code, { ...doc, sections: doc.sections.map((s, j) => (j === i ? { ...s, html } : s)) });
  const updateMeta = (k, v) => saveDoc(code, { ...doc, meta: { ...doc.meta, [k]: v } });
  const refine = async (i) => {
    const s = doc.sections[i];
    setBusy(`Refining “${s.heading}” with Claude…`);
    try {
      const res = await aiPolicy({ orgName: org.name, policyTitle: doc.meta.title, heading: s.heading, html: s.html, context: `${org.name} (${org.shortName}). Policy owner: ${doc.meta.owner}.` });
      if (res.html) updateSection(i, res.html);
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy('');
    }
  };

  const fileBase = doc ? `${safeName(org.shortName)}_${safeName(doc.meta.title)}` : '';

  return (
    <div>
      <PageHead eyebrow="Policy author" title="Author policy documents" actions={doc && <>
        <button className="btn btn-primary dl" onClick={() => downloadWord(policyToHtmlDocument(doc, org, { forWord: true }), `${fileBase}.doc`)}>Download Word</button>
        <button className="btn dl" onClick={() => printHtml(policyToHtmlDocument(doc, org)) || setToast('Allow pop-ups to print')}>Print / PDF</button>
      </>}>
        Automatically drafts a complete policy from the organisation’s policy requirements, obligations, RACI, evidence and review attributes, following your policy template. Edit any section in place.
      </PageHead>

      <div className="author-grid">
        <div className="stack">
          <Card title="Policy">
            <label className="field"><span>Target policy</span>
              <select value={code} onChange={(e) => setCode(e.target.value)}>
                {codes.map((p) => <option key={p.code} value={p.code}>{p.title} ({p.count}){docs[p.code] ? ' ✓' : ''}</option>)}
              </select>
            </label>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => generate(doc?.meta)}>{doc ? 'Regenerate' : 'Generate policy'}</button>
            </div>
            {doc && <p className="small muted" style={{ marginBottom: 0 }}>Regenerating rebuilds all sections from the current register and keeps the document details. Edits are saved automatically.</p>}
          </Card>
          <Card title="Template" subtitle={templateName || 'CTO Consulting standard policy template'}>
            <p className="small" style={{ marginTop: 0 }}>Upload an example policy (.docx). Its heading structure becomes the template: matching headings are populated automatically; other headings are kept as placeholders.</p>
            <div className="btn-row">
              <label className="btn btn-sm">Upload .docx template<input type="file" accept=".docx" hidden onChange={(e) => e.target.files[0] && onTemplate(e.target.files[0])} /></label>
              {template && <button className="btn btn-sm btn-ghost" onClick={resetTemplate}>Use standard</button>}
            </div>
            <ol className="small" style={{ paddingLeft: 18, marginBottom: 0 }}>{(template || DEFAULT_TEMPLATE).map((t, i) => <li key={i}>{t.heading}{t.custom && <span className="muted"> (placeholder)</span>}</li>)}</ol>
          </Card>
          {doc && (
            <Card title="Document details">
              <div className="stack" style={{ gap: 10 }}>
                {META_FIELDS.map(([k, l, type]) => (
                  <label className="field" key={k}><span>{l}</span><input type={type || 'text'} value={doc.meta[k] || ''} onChange={(e) => updateMeta(k, e.target.value)} /></label>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div>
          {busy && <div className="card card-pad" style={{ marginBottom: 12 }}><div className="row"><div className="spinner" style={{ margin: 0 }} />{busy}</div></div>}
          {!doc ? (
            <div className="card empty">
              <h3>No draft yet for this policy</h3>
              <p>{data.policies[code]?.count} requirements will be drafted into {(template || DEFAULT_TEMPLATE).length} sections.</p>
              <button className="btn btn-primary" onClick={() => generate()}>Generate policy</button>
            </div>
          ) : (
            <div className="doc-page">
              <div className="classification">{doc.meta.classification}</div>
              <div className="doc-cover">
                <div className="eyebrow">{org.name}</div>
                <h1>{doc.meta.title}</h1>
                <div className="muted">{doc.meta.number} · Version {doc.meta.version} · {doc.meta.status}</div>
              </div>
              <table><tbody>
                {[['Policy owner', doc.meta.owner], ['Approved by', doc.meta.approver], ['Effective date', doc.meta.effectiveDate], ['Next review', doc.meta.reviewDate], ['Prepared by', doc.meta.preparedBy]].map(([k, v]) => <tr key={k}><td style={{ width: '30%', background: '#eef3f8', fontWeight: 600 }}>{k}</td><td>{v}</td></tr>)}
              </tbody></table>
              {doc.sections.map((s, i) => (
                <div className="doc-section" key={s.id + i}>
                  <h2>{i + 1}. {s.heading}</h2>
                  {ai && <div className="tools no-print"><button className="btn btn-sm btn-navy" onClick={() => refine(i)} disabled={!!busy}>✦ Refine</button></div>}
                  <Editable html={s.html} onChange={(html) => html !== s.html && updateSection(i, html)} />
                </div>
              ))}
              <p className="small muted" style={{ marginTop: 32 }}>Drafted {new Date(doc.meta.generatedAt).toLocaleString()} from {doc.stats.requirements} requirements and {doc.stats.obligations.toLocaleString()} obligations ({doc.stats.sources} sources) using {doc.templateName}.</p>
            </div>
          )}
        </div>
      </div>
      {toast && <Toast text={toast} onDone={() => setToast('')} />}
    </div>
  );
}
