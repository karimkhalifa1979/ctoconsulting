import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP, useCan, loadAssets } from '../../lib/store.jsx';
import { runAi } from '../../lib/ai.js';
import { pdfAvailable, renderPdf } from '../../lib/render.js';
import { Card, Modal, Empty } from '../../../components/ui.jsx';
import { Check, When, Field, FileDrop, Confirm, Icon, download, MIME, safeFile } from '../../components/common.jsx';
import { OUTPUT_KINDS } from '../../core/constants.js';
import { outputChecks, checksPass, manualChecks } from '../../core/checks.js';
import { selectedCaseStudies } from '../../core/deck.js';
import { citationsIn, parseSrc } from '../../core/html.js';
import { questionsFromDoc } from '../../core/drafting.js';
import { htmlToText, fmtDate } from '../../core/util.js';

export function ChecksList({ bid, checks }) {
  return (
    <div>
      {checks.map((c) => (
        <div key={c.id} className="check-row">
          <Check status={c.status} />
          <div>
            <strong>{c.label}</strong> <span className="muted">{c.detail}</span>
            {c.items?.length > 0 && (
              <ul>
                {c.items.slice(0, 12).map((it, i) => (
                  <li key={i}>
                    {it.sectionId ? <Link to={`/bids/${bid.id}/sections/${it.sectionId}`}>{it.text}</Link> : it.reqId ? <Link to={`/bids/${bid.id}/requirements?req=${it.reqId}`}>{it.text}</Link> : it.text}
                    {it.level === 'warn' && <span className="mini"> (warning)</span>}
                  </li>
                ))}
                {c.items.length > 12 && <li className="muted">and {c.items.length - 12} more</li>}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const summary = (checks) => {
  if (!checks) return <span className="muted small">Not checked</span>;
  const f = checks.filter((c) => c.status === 'fail').length, w = checks.filter((c) => c.status === 'warn').length;
  return f ? <span className="pill bad">{f} failed</span> : w ? <span className="pill warn">Passed, {w} warning{w === 1 ? '' : 's'}</span> : <span className="pill good">All passed</span>;
};

// Which library item versions the sections cite (recorded with each output, WD-11).
function libraryVersions(view, bid) {
  const seen = new Map();
  for (const s of bid.sections) {
    for (const c of citationsIn(s.content)) {
      const p = parseSrc(c.src);
      if (p?.kind !== 'library') continue;
      const item = view.library.find((i) => i.id === p.id);
      seen.set(`${p.id}@${p.v}`, { itemId: p.id, key: item?.key || c.label, v: p.v });
    }
  }
  return [...seen.values()];
}

function Preview({ output, onClose }) {
  const { getFile } = useP();
  const [html, setHtml] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const f = await getFile(output.fileId);
        if (!f) throw new Error('The file is not available in this browser.');
        const { docxToHtml } = await import('../../gen/docxPreview.js');
        setHtml(await docxToHtml(f.bytes));
      } catch (e) { setErr(e.message); }
    })();
  }, [output.fileId, getFile]);
  return (
    <Modal title={`Preview: ${output.name}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <p className="mini">A browser preview of the generated Word file. Page breaks, the contents page and page numbers are finalised when Word or the PDF render updates the fields.</p>
      {err ? <div className="callout warn">{err}</div> : html === null ? <div className="spinner" /> : <div className="doc-preview"><div className="sheet" dangerouslySetInnerHTML={{ __html: html }} /></div>}
    </Modal>
  );
}

function Returnables({ bid }) {
  const { view, dispatch, backend, toast } = useP();
  const forms = bid.documents.filter((d) => ['form', 'qa', 'request'].includes(d.type) && questionsFromDoc(d).length);
  const [docId, setDocId] = useState(forms.find((d) => d.type === 'form')?.id || forms[0]?.id || '');
  const saved = bid.returnables?.[docId];
  const [rows, setRows] = useState(saved?.answers || null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setRows(bid.returnables?.[docId]?.answers || null); }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!forms.length) return null;
  const doc = bid.documents.find((d) => d.id === docId);
  const answer = async () => {
    setBusy(true);
    try {
      const questions = questionsFromDoc(doc);
      const r = await runAi('bulk_answer', { view, bid, questions }, { backend, dispatch });
      setRows(r.answers.map((x) => ({ id: x.id, ref: x.ref, question: x.text, answer: x.answer ? htmlToText(x.answer.html) : '', itemId: x.answer?.itemId || null, key: x.answer?.key || null, v: x.answer?.v || null, confidence: x.confidence, status: 'draft', src: x.src })));
      toast(`${r.answers.length} questions answered from standard answers. Review each answer; low-confidence answers need a person to write them.`, 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const save = () => dispatch('returnable.set', { bidId: bid.id, docId, answers: rows }, { success: 'Answers saved' });
  const exportDocx = async () => {
    const { buildDocument } = await import('../../gen/wordTemplate.js');
    const { para, textRun, table } = await import('../../gen/ooxml.js');
    const body = [
      para(textRun(`Response to ${doc.name}`), { style: 'Title' }),
      para(textRun(`${bid.title} · ${bid.ref}`), { style: 'Subtitle' }),
      table({ style: 'CTOTable', widths: [900, 3600, 5138], header: ['Ref', 'Question', 'Response'], rows: rows.map((r) => [r.ref, r.question, r.answer || 'To be answered']) }),
    ].join('');
    const bytes = await buildDocument({ bodyXml: body, title: `Response to ${doc.name}`, header: `${bid.ref} · ${doc.name}` });
    download(bytes, `${safeFile(doc.name.replace(/\.[^.]+$/, ''))} - response.docx`, MIME.docx);
  };
  const band = (c) => (c >= 0.7 ? ['good', 'High'] : c >= 0.45 ? ['warn', 'Medium'] : ['bad', 'Low']);
  return (
    <Card title="Questionnaire returnables" subtitle="Bulk-answer a client questionnaire from approved standard answers, with a confidence score per answer (spec 9.1)"
      actions={<div className="row"><select value={docId} onChange={(e) => setDocId(e.target.value)} aria-label="Questionnaire">{forms.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><button className="btn btn-sm btn-primary" disabled={busy || bid.aiEnabled === false} onClick={answer}>{busy ? 'Answering…' : rows ? 'Answer again' : 'Answer from standard answers'}</button></div>}>
      {bid.aiEnabled === false && <div className="callout small">AI is switched off for this bid.</div>}
      {rows ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ref</th><th style={{ width: '32%' }}>Question</th><th>Answer</th><th>Confidence</th><th>Accept</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="tabular">{r.ref}</td>
                    <td className="small">{r.question}</td>
                    <td><textarea rows={3} style={{ width: '100%' }} value={r.answer} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, answer: e.target.value, status: 'draft' } : x)))} aria-label={`Answer to ${r.ref}`} />{r.key && <div className="mini">From {r.key} v{r.v}</div>}</td>
                    <td>{r.confidence === null ? '—' : <span className={`pill ${band(r.confidence)[0]}`}>{band(r.confidence)[1]} · {Math.round(r.confidence * 100)}%</span>}</td>
                    <td><input type="checkbox" checked={r.status === 'accepted'} disabled={!r.answer.trim()} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, status: e.target.checked ? 'accepted' : 'draft' } : x)))} aria-label={`Accept answer ${r.ref}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={save}>Save answers</button>
            <button className="btn" onClick={exportDocx} disabled={rows.some((r) => r.status !== 'accepted')} title={rows.some((r) => r.status !== 'accepted') ? 'Accept every answer first' : ''}>Download response (.docx)</button>
            <span className="mini">{rows.filter((r) => r.status === 'accepted').length} of {rows.length} accepted{saved ? ` · saved ${fmtDate(saved.at.slice(0, 10))}` : ''}</span>
          </div>
        </>
      ) : <p className="muted small">{questionsFromDoc(doc).length} questions found in {doc.name}.</p>}
    </Card>
  );
}

export default function Produce({ bid }) {
  const { view, dispatch, toast, putFile, getFile, query, client } = useP();
  const can = useCan();
  const [templateId, setTemplateId] = useState(view.templates.find((t) => t.kind === 'word' && t.default)?.id || '');
  const defaultCs = useMemo(() => selectedCaseStudies(view, bid).map((c) => c.id), [view, bid]);
  const [caseStudyIds, setCaseStudyIds] = useState(null);
  const [busy, setBusy] = useState(null);
  const [preview, setPreview] = useState(null);
  const [open, setOpen] = useState(null);
  const [upload, setUpload] = useState(null);
  const [pdfOk, setPdfOk] = useState(false);
  const [remove, setRemove] = useState(null);
  useEffect(() => { pdfAvailable().then(setPdfOk); }, []);
  const gen = can('generateOutputs', { bid });
  const closed = ['archived'].includes(bid.stage);
  const templates = view.templates.filter((t) => t.kind === 'word' && t.status === 'approved');
  const tpl = templates.find((t) => t.id === templateId) || templates[0];
  const csIds = caseStudyIds || defaultCs;
  const caseStudies = view.library.filter((i) => i.type === 'case_study' && i.approvedV && !i.retired);
  const gatesOpen = ['g2', 'g3'].filter((g) => bid._d.gates[g].enabled && bid._d.gates[g].status !== 'passed');
  const outputs = [...bid.outputs].reverse();

  const generate = async () => {
    setBusy('docx');
    try {
      const [{ generateProposal, templateBytesFor }, assets, ai] = await Promise.all([import('../../gen/generate.js'), loadAssets(), query('aiLog', { bidId: bid.id })]);
      const templateBytes = await templateBytesFor(tpl, async (id) => (await getFile(id))?.bytes);
      const res = await generateProposal(view, bid, { templateBytes, assets, aiLog: ai || [], caseStudyIds: csIds });
      const name = `${safeFile(bid.ref)}_${safeFile(client(bid.clientId)?.shortName || client(bid.clientId)?.name || 'proposal')}_proposal_v${bid.outputs.filter((o) => o.kind === 'docx').length + 1}.docx`;
      const fileId = await putFile(res.bytes, { name, type: MIME.docx, bidId: bid.id });
      const models = [...new Set((ai || []).filter((e) => e.ok !== false).map((e) => (e.engine === 'claude' ? e.model : 'offline engine')).filter(Boolean))];
      const r = await dispatch('output.add', {
        bidId: bid.id,
        output: {
          kind: 'docx', name, fileId, size: res.bytes.length, templateId: tpl?.id, templateName: tpl?.name, templateVersion: tpl?.version,
          libraryVersions: libraryVersions(view, bid), aiModel: models.join(', ') || null, checks: res.checks, pages: res.report.pages, pagesEstimated: true,
        },
      }, { quiet: true });
      const fails = res.checks.filter((c) => c.status === 'fail').length;
      toast(`Generated ${name}: ${fails ? `${fails} check${fails === 1 ? '' : 's'} failed` : 'all checks passed'}.`, fails ? 'info' : 'success');
      setOpen(r.outputId);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };

  const rerun = async (o) => {
    setBusy(o.id);
    try {
      const f = await getFile(o.fileId);
      if (!f) throw new Error('The file is not available in this browser.');
      let checks;
      if (o.manual) {
        const { inspectOfficeFile } = await import('../../gen/inspect.js');
        checks = manualChecks(view, bid, await inspectOfficeFile(f.bytes));
      } else {
        // Content checks run against the current sections; file-level checks (structure, properties) come from generation.
        const { inspectTemplate } = await import('../../gen/wordMerge.js');
        const ins = await inspectTemplate(f.bytes).catch(() => null);
        const fresh = outputChecks(view, bid, bid.sections, { pages: o.pages, pagesEstimated: o.pagesEstimated, unresolved: (ins?.placeholders || []).map((t) => t.tag) });
        checks = fresh.map((c) => (['structure', 'properties'].includes(c.id) ? (o.checks || []).find((x) => x.id === c.id) || c : c));
      }
      await dispatch('output.checks', { bidId: bid.id, outputId: o.id, checks }, { success: 'Checks re-run' });
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };

  const pdf = async (o, pdfa) => {
    setBusy(`${o.id}:${pdfa ? 'a' : 'p'}`);
    try {
      const f = await getFile(o.fileId);
      const r = await renderPdf(f.bytes, { pdfa, name: o.name });
      const name = o.name.replace(/\.(docx|pptx)$/i, pdfa ? '_PDF-A.pdf' : '.pdf');
      const fileId = await putFile(r.bytes, { name, type: MIME.pdf, bidId: bid.id });
      await dispatch('output.add', { bidId: bid.id, output: { kind: pdfa ? 'pdfa' : o.kind === 'pptx' || o.kind === 'manual-pptx' ? 'deck-pdf' : 'pdf', name, fileId, size: r.bytes.length, templateId: o.templateId, templateName: o.templateName, templateVersion: o.templateVersion, contentVersions: o.contentVersions, libraryVersions: o.libraryVersions, aiModel: o.aiModel, snapshotId: o.snapshotId, pages: r.pages, pagesEstimated: false, sourceOutputId: o.id, manual: o.manual, checks: o.checks ? o.checks.map((c) => (c.id === 'pages' ? { ...c } : c)) : null } }, { quiet: true });
      if (o.checks && r.pages && !o.final) {
        const checks = outputChecks(view, bid, bid.sections, { pages: r.pages, bodyPages: r.bodyPages, pagesEstimated: false });
        const pageCheck = checks.find((c) => c.id === 'pages');
        if (pageCheck) await dispatch('output.checks', { bidId: bid.id, outputId: o.id, checks: o.checks.map((c) => (c.id === 'pages' ? pageCheck : c)), pages: r.bodyPages || r.pages }, { quiet: true });
      }
      toast(`${pdfa ? 'PDF/A' : 'PDF'} rendered: ${r.pages} pages.`, 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };

  const onManual = async (files) => {
    const f = files[0];
    if (!f) return;
    setBusy('manual');
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const { inspectOfficeFile } = await import('../../gen/inspect.js');
      const scan = await inspectOfficeFile(bytes);
      const checks = manualChecks(view, bid, scan);
      const fileId = await putFile(bytes, { name: f.name, type: scan.kind === 'docx' ? MIME.docx : MIME.pptx, bidId: bid.id });
      const src = bid.outputs.find((o) => o.id === upload.sourceId);
      await dispatch('output.add', { bidId: bid.id, output: { kind: scan.kind === 'docx' ? 'manual-docx' : 'manual-pptx', name: f.name, fileId, size: bytes.length, manual: true, sourceOutputId: src?.id || null, templateId: src?.templateId, templateName: src?.templateName, templateVersion: src?.templateVersion, contentVersions: src?.contentVersions, libraryVersions: src?.libraryVersions, aiModel: src?.aiModel, note: upload.note, checks } }, { quiet: true });
      toast(`Recorded ${f.name} as a manual output against the approved snapshot.`, 'success');
      setUpload(null);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };

  const dl = async (o) => {
    const f = await getFile(o.fileId);
    if (!f) { toast('The file is not available in this browser.', 'error'); return; }
    download(f.bytes, o.name, f.type);
  };

  const excel = async () => {
    const { complianceWorkbook } = await import('../../gen/xlsx.js');
    download(await complianceWorkbook(bid, client(bid.clientId)), `${safeFile(bid.ref)}_compliance_matrix.xlsx`, MIME.xlsx);
  };

  const selected = bid.outputs.find((o) => o.id === open);
  return (
    <div className="stack">
      {gatesOpen.length > 0 ? (
        <div className="callout">Drafts can be generated at any time for review. Outputs can be marked final only after gate {gatesOpen.map((g) => g.slice(1)).join(' and ')} {gatesOpen.length > 1 ? 'have' : 'has'} passed (WF-08). <Link to={`/bids/${bid.id}/approvals`}>Approvals</Link></div>
      ) : <div className="callout good">Gates 2 and 3 have passed. Generate from the approved snapshot, resolve any failed checks and mark the files final.</div>}
      <div className="split-3-2">
        <Card title="Word proposal" subtitle="Merges approved sections, case studies, the team and the price into a CTO Consulting template (spec 9.3)">
          {gen && !closed ? (
            <div className="stack">
              <div className="form-grid">
                <Field label="Template">
                  <select value={tpl?.id || ''} onChange={(e) => setTemplateId(e.target.value)}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.version}{t.builtIn ? ', built in' : ''})</option>)}</select>
                </Field>
                <Field label="Word limit and page limit" hint="Counted per section and on the render">
                  <div className="small">{(bid.extraction?.submission || []).filter((x) => x.label === 'Page limit').map((x) => x.value).pop() || 'No page limit recorded'}</div>
                </Field>
              </div>
              <Field label={`Case studies (${csIds.length} selected)`} hint="Anonymised automatically where the client has not consented to be named" full>
                <div className="stack" style={{ gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                  {caseStudies.map((i) => <label key={i.id} className="check small"><input type="checkbox" checked={csIds.includes(i.id)} onChange={(e) => setCaseStudyIds(e.target.checked ? [...csIds, i.id] : csIds.filter((x) => x !== i.id))} /><span>{i.key} {i.title}{i.clientId === bid.clientId ? ' (this client)' : ''}</span></label>)}
                </div>
              </Field>
              <div className="row"><button className="btn btn-primary" disabled={busy === 'docx'} onClick={generate}>{busy === 'docx' ? 'Generating…' : 'Generate proposal (.docx)'}</button><span className="mini">Records the template version, content versions and AI model used (WD-11).</span></div>
            </div>
          ) : <p className="muted small">{closed ? 'This bid is archived.' : 'Only the bid team can generate outputs.'}</p>}
        </Card>
        <Card title="Other outputs">
          <div className="stack" style={{ gap: 8 }}>
            <button className="btn" onClick={excel}>Compliance matrix (.xlsx)</button>
            <Link className="btn" to={`/bids/${bid.id}/requirements`}>Fill the client’s compliance schedule…</Link>
            <Link className="btn" to={`/bids/${bid.id}/pricing`}>Pricing schedule and CV pack…</Link>
            <Link className="btn" to={`/bids/${bid.id}/deck`}>Presentation deck…</Link>
            {gen && <button className="btn btn-ghost" onClick={() => setUpload({ sourceId: outputs.find((o) => ['docx', 'pptx'].includes(o.kind))?.id || '', note: '' })}><Icon name="up" size={14} />Upload a final edit (Word or PowerPoint)</button>}
            <p className="mini" style={{ margin: 0 }}>PDF and PDF/A are rendered on the server from the same file{pdfOk ? '.' : '. The server’s LibreOffice renderer is not connected in this mode.'}</p>
          </div>
        </Card>
      </div>

      <Card title="Outputs" subtitle="Every generated or uploaded file, with its provenance and check results" pad={false}>
        {outputs.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>File</th><th>Kind</th><th>Generated</th><th>Template</th><th>Checks</th><th>Status</th><th /></tr></thead>
              <tbody>
                {outputs.map((o) => (
                  <tr key={o.id} className={open === o.id ? 'selected' : ''}>
                    <td><button className="linkish strong" onClick={() => setOpen(open === o.id ? null : o.id)}>{o.name}</button>{o.note && <div className="mini">{o.note}</div>}{o.sourceOutputId && <div className="mini">From {bid.outputs.find((x) => x.id === o.sourceOutputId)?.name || 'an earlier output'}</div>}</td>
                    <td className="small">{OUTPUT_KINDS[o.kind] || o.kind}{o.pages ? <div className="mini">{o.pages} pages{o.pagesEstimated ? ' (est.)' : ''}</div> : null}</td>
                    <td className="small"><When at={o.at} /><div className="mini">{view.users.find((u) => u.id === o.by)?.name}</div></td>
                    <td className="small">{o.templateName ? `${o.templateName} v${o.templateVersion}` : '—'}</td>
                    <td>{summary(o.checks)}</td>
                    <td>{o.submitted ? <span className="pill navy">Submitted</span> : o.final ? <span className="pill good">Final</span> : <span className="pill">Draft</span>}</td>
                    <td className="nowrap">
                      <button className="btn btn-sm" onClick={() => dl(o)}>Download</button>
                      {['docx', 'manual-docx'].includes(o.kind) && <button className="btn btn-sm btn-ghost" onClick={() => setPreview(o)}>Preview</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No outputs yet">Generate the Word proposal above.</Empty>}
      </Card>

      {selected && (
        <Card title={selected.name} subtitle={`${OUTPUT_KINDS[selected.kind] || selected.kind} · ${selected.manual ? 'uploaded' : 'generated'} by ${view.users.find((u) => u.id === selected.by)?.name}`}
          actions={<div className="row">
            {gen && !selected.final && selected.checks && <button className="btn btn-sm" disabled={busy === selected.id} onClick={() => rerun(selected)}>{busy === selected.id ? 'Checking…' : 'Re-run checks'}</button>}
            {gen && pdfOk && ['docx', 'manual-docx', 'pptx', 'manual-pptx'].includes(selected.kind) && <><button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => pdf(selected, false)}>{busy === `${selected.id}:p` ? 'Rendering…' : 'Render PDF'}</button>{['docx', 'manual-docx'].includes(selected.kind) && <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => pdf(selected, true)}>{busy === `${selected.id}:a` ? 'Rendering…' : 'Render PDF/A'}</button>}</>}
            {gen && !selected.final && <button className="btn btn-sm btn-primary" disabled={gatesOpen.length > 0 || (selected.checks && !checksPass(selected.checks))} title={gatesOpen.length ? 'Gates 2 and 3 must pass first' : selected.checks && !checksPass(selected.checks) ? 'Resolve the failed checks first' : ''} onClick={() => dispatch('output.markFinal', { bidId: bid.id, outputId: selected.id }, { success: 'Marked final' })}>Mark final</button>}
            {gen && selected.final && !selected.submitted && <button className="btn btn-sm" onClick={() => dispatch('output.markFinal', { bidId: bid.id, outputId: selected.id, final: false }, { success: 'No longer final' })}>Unmark final</button>}
            {gen && !selected.final && !selected.submitted && <button className="btn btn-sm btn-ghost" onClick={() => setRemove(selected)}>Remove</button>}
          </div>}>
          <div className="split">
            <div>
              <div className="eyebrow">Pre-final checks (WD-07)</div>
              {selected.checks ? <ChecksList bid={bid} checks={selected.checks} /> : <p className="muted small">No automated checks for this file type.</p>}
            </div>
            <div>
              <div className="eyebrow">Provenance (WD-11)</div>
              <dl className="kv">
                <dt>Template</dt><dd>{selected.templateName ? `${selected.templateName}, version ${selected.templateVersion}` : '—'}</dd>
                <dt>Snapshot</dt><dd>{selected.snapshotId ? `${bid.snapshots.find((s) => s.id === selected.snapshotId)?.label || ''} (${selected.snapshotId.slice(-6)})` : 'Working content (no gate snapshot yet)'}</dd>
                <dt>Content versions</dt><dd>{(selected.contentVersions || []).length} sections: {(selected.contentVersions || []).slice(0, 6).map((cv) => `${bid.sections.find((s) => s.id === cv.sectionId)?.title.split(' ').slice(0, 3).join(' ') || cv.sectionId} v${cv.v}`).join(', ')}{(selected.contentVersions || []).length > 6 ? '…' : ''}</dd>
                <dt>Library versions</dt><dd>{(selected.libraryVersions || []).map((l) => `${l.key} v${l.v}`).join(', ') || '—'}</dd>
                <dt>AI model</dt><dd>{selected.aiModel || 'No AI used'}</dd>
                <dt>Size</dt><dd>{Math.round((selected.size || 0) / 1024)} KB</dd>
                {selected.final && <><dt>Marked final</dt><dd><When at={selected.finalAt} /> by {view.users.find((u) => u.id === selected.finalBy)?.name}</dd></>}
              </dl>
            </div>
          </div>
        </Card>
      )}

      <Returnables bid={bid} />

      {preview && <Preview output={preview} onClose={() => setPreview(null)} />}
      {upload && (
        <Modal title="Upload a final edit" onClose={() => setUpload(null)} footer={<button className="btn" onClick={() => setUpload(null)}>Cancel</button>}>
          <p className="small">Use this when the final polish was done in Word or PowerPoint (WD-09, PP-07). The upload is recorded as a manual output against the approved snapshot, and its text is checked again for placeholders, tracked changes, comments and other clients’ names.</p>
          <Field label="Edited from">
            <select value={upload.sourceId} onChange={(e) => setUpload({ ...upload, sourceId: e.target.value })}><option value="">Not based on a generated file</option>{outputs.filter((o) => ['docx', 'pptx'].includes(o.kind)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          </Field>
          <Field label="What changed"><input value={upload.note} onChange={(e) => setUpload({ ...upload, note: e.target.value })} placeholder="For example: final layout pass and signature page added" /></Field>
          <FileDrop accept=".docx,.pptx" multiple={false} onFiles={onManual} busy={busy === 'manual' ? 'Checking the file…' : null} label="Drop the final .docx or .pptx here" />
        </Modal>
      )}
      {remove && <Confirm title={`Remove ${remove.name}?`} danger confirmLabel="Remove" onClose={() => setRemove(null)} onConfirm={() => dispatch('output.remove', { bidId: bid.id, outputId: remove.id }, { success: 'Output removed' })}><p>The file is removed from this bid’s outputs. The audit trail keeps the record that it existed.</p></Confirm>}
    </div>
  );
}

