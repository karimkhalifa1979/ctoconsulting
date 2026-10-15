// Business case builder: auto-generates a business case document from the program's data,
// lets people edit the narrative, manages versions and review, and exports to Word and PDF.
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { businessCaseModel, businessCaseHtml, businessCaseDocx, blockHtml, KEY_FIGURES, SECTIONS } from '../lib/businessCase.js';
import { simulate } from '../lib/simulation.js';
import { nextGate } from '../lib/rules.js';
import { GATES } from '../lib/config.js';
import { aiNarrative, aiStatus } from '../lib/ai.js';
import { downloadBlob, printHtml, safeName, svgToPng } from '../lib/exporters.js';
import { Card, Pill, Modal, Field, TextArea, NumberInput, Select, useToast, Guidance } from './ui.jsx';
import { money, pct, ratio, fmtDate, uid, todayISO } from '../lib/util.js';

const STATUS = { draft: ['Draft', 'none'], 'in-review': ['In VMO review', 'warning'], submitted: ['Submitted for gate', 'progress'], locked: ['Locked (approved version)', 'good'] };
const REVIEW_CHECKLIST = [
  'Benefits are worded measurably and each has an owner, measure and baseline',
  'Costs cover the full lifecycle, including change, sustaining and decommissioning',
  'Assumptions are explicit, monitored and reflected in the risk analysis',
  'Alternative options or benefits paths were considered',
  'Uncertainty has been simulated and the downside is understood',
  'Organisation, process and people change is planned and funded',
  'The sponsor has committed to the benefits',
];

export default function BusinessCaseBuilder({ program: p }) {
  const { ws, updateProgram, me } = useApp();
  const versions = (p.valueCases || []).slice().sort((a, b) => b.version - a.version);
  const [vcId, setVcId] = useState(versions[0]?.id || null);
  useEffect(() => { if (!versions.some((v) => v.id === vcId)) setVcId(versions[0]?.id || null); }, [p.id, versions.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const vc = versions.find((v) => v.id === vcId) || null;
  const locked = vc?.status === 'locked';
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');
  const [modal, setModal] = useState(null);
  const [ai, setAi] = useState(null);
  const [suggest, setSuggest] = useState({});
  const [toast, toastNode] = useToast();
  useEffect(() => { aiStatus().then(setAi); }, []);

  const sim = useMemo(() => simulate([p], ws, { ...(p.simSettings || {}), iterations: Math.min(5000, p.simSettings?.iterations || 5000) }), [p, ws]);
  const live = useMemo(() => businessCaseModel(ws, p, { vc, sim }), [ws, p, vc, sim]);
  const model = locked && vc?.doc ? vc.doc : live;
  const canAi = ai?.ai && ws.settings.ai && !['Confidential'].includes(p.classification);
  const isVmo = (me?.roles || []).some((r) => /VMO|IDB chair/.test(r));

  const ensureDraft = (fn, label) => {
    if (vc && !locked) { updateProgram(p.id, (x) => fn(x.valueCases.find((v) => v.id === vc.id)), label, { object: 'value-case', objectId: vc.id, field: label }); return; }
    const id = uid('vc');
    const prev = versions[0];
    updateProgram(p.id, (x) => {
      const draft = { id, version: (prev?.version || 0) + 1, gate: nextGate(x)?.gate || prev?.gate || 'G2', createdAt: new Date().toISOString(), status: 'draft', narrative: { ...(prev?.narrative || {}) }, reviewCycles: 0, reviewComments: [], author: ws.currentUser };
      fn(draft);
      x.valueCases = [...(x.valueCases || []), draft];
    }, `Value case v${(prev?.version || 0) + 1} started`, { action: 'create', object: 'value-case', objectId: id });
    setVcId(id);
  };
  const newVersion = () => {
    const id = uid('vc'); const prev = versions[0];
    updateProgram(p.id, (x) => { x.valueCases = [...(x.valueCases || []), { id, version: (prev?.version || 0) + 1, gate: nextGate(x)?.gate || 'G2', createdAt: new Date().toISOString(), status: 'draft', narrative: { ...(prev?.narrative || {}) }, reviewCycles: 0, reviewComments: [], author: ws.currentUser, fundingRequested: prev?.fundingRequested, conditions: prev?.conditions }]; }, `Value case v${(prev?.version || 0) + 1} created (refresh)`, { action: 'create', object: 'value-case', objectId: id });
    setVcId(id);
  };
  const setStatus = (status, extra = {}) => updateProgram(p.id, (x) => { const v = x.valueCases.find((y) => y.id === vc.id); v.status = status; Object.assign(v, extra); }, `Value case v${vc.version} → ${STATUS[status][0]}`, { action: status === 'locked' ? 'approve' : 'update', object: 'value-case', objectId: vc.id });

  const exportDocx = async () => {
    setBusy('docx');
    try { downloadBlob(await businessCaseDocx(model, svgToPng), `${safeName(p.code)}_${safeName(p.name)}_Business_Case_v${vc?.version || 'draft'}.docx`); toast('Word document downloaded'); } catch (e) { toast(`Export failed: ${e.message}`); }
    setBusy('');
  };
  const exportPdf = () => { if (!printHtml(businessCaseHtml(model))) toast('Allow pop-ups to print or save as PDF'); };
  const exportHtml = () => downloadBlob(businessCaseHtml(model), `${safeName(p.code)}_Business_Case.html`, 'text/html');

  const refine = async (b) => {
    setSuggest((s) => ({ ...s, [b.key]: { loading: true } }));
    try {
      const r = await aiNarrative({ section: model.sections.find((s) => s.blocks.includes(b))?.heading || b.key, text: b.text, program: p.name, org: ws.settings.orgName, context: JSON.stringify(model.key) });
      setSuggest((s) => ({ ...s, [b.key]: { text: r.text } }));
    } catch (e) { setSuggest((s) => ({ ...s, [b.key]: { error: e.message } })); }
  };

  const renderBlock = (b, i) => {
    if (b.t !== 'narr') return <div key={i} dangerouslySetInnerHTML={{ __html: blockHtml(b) }} />;
    const sg = suggest[b.key];
    if (editing?.key === b.key) {
      return (
        <div key={i} className="narr" style={{ boxShadow: '0 0 0 2px var(--brand-teal)' }}>
          <TextArea value={editing.text} onChange={(v) => setEditing({ ...editing, text: v })} rows={Math.max(5, Math.ceil(editing.text.length / 95))} aria-label="Edit narrative" />
          <div className="btn-row" style={{ margin: '6px 0' }}>
            <button className="btn btn-sm btn-primary" onClick={() => { ensureDraft((v) => { v.narrative = { ...(v.narrative || {}), [b.key]: editing.text }; }, `Edited narrative: ${b.key}`); setEditing(null); }}>Save</button>
            <button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
            <span className="mini">Separate paragraphs with a blank line. Figures in tables stay linked to live data.</span>
          </div>
        </div>
      );
    }
    return (
      <div key={i} className={`narr ${b.auto ? '' : 'edited'}`}>
        {!locked && <div className="narr-tools no-print">
          <button className="btn btn-sm" onClick={() => setEditing({ key: b.key, text: b.text })}>Edit</button>
          {!b.auto && <button className="btn btn-sm" title="Discard edits and use the auto-draft" onClick={() => ensureDraft((v) => { delete v.narrative[b.key]; }, `Reset narrative: ${b.key}`)}>Auto-draft</button>}
          {canAi && <button className="btn btn-sm" onClick={() => refine(b)}>Refine with AI</button>}
        </div>}
        <div dangerouslySetInnerHTML={{ __html: blockHtml(b) }} />
        {!b.auto && <div className="mini no-print" style={{ color: '#8a6100' }}>Edited by a person{b.autoText && b.autoText !== b.text ? ' — auto-draft available' : ''}</div>}
        {sg && (
          <div className="guidance no-print" style={{ margin: '6px 0' }}>
            <span className="ai-label">AI suggestion</span>{sg.loading ? ' Drafting…' : sg.error ? ` ${sg.error}` : <> <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{sg.text}</div><div className="btn-row" style={{ marginTop: 6 }}><button className="btn btn-sm btn-primary" onClick={() => { ensureDraft((v) => { v.narrative = { ...(v.narrative || {}), [b.key]: sg.text }; v.aiAssisted = [...new Set([...(v.aiAssisted || []), b.key])]; }, `Accepted AI suggestion: ${b.key}`); setSuggest((s) => ({ ...s, [b.key]: null })); }}>Accept</button><button className="btn btn-sm" onClick={() => setSuggest((s) => ({ ...s, [b.key]: null }))}>Reject</button></div></>}
          </div>
        )}
      </div>
    );
  };

  const flagCycles = (vc?.reviewCycles || 0) > ws.settings.thresholds.reviewCycles;
  return (
    <div className="stack">
      <Card className="no-print bc-tools" title="Business case builder" subtitle="Generated from the program's benefits map, register, cost model, assessments and simulation — edit the narrative, keep the numbers live" actions={<>
        <select value={vcId || ''} onChange={(e) => setVcId(e.target.value)} aria-label="Version">{!versions.length && <option value="">Unsaved draft</option>}{versions.map((v) => <option key={v.id} value={v.id}>v{v.version} · {v.gate} · {STATUS[v.status]?.[0]}</option>)}</select>
        <button className="btn btn-sm" onClick={newVersion}>New version</button>
        <button className="btn btn-sm btn-primary dl" onClick={exportDocx} disabled={busy === 'docx'}>{busy === 'docx' ? 'Building…' : 'Download Word'}</button>
        <button className="btn btn-sm dl" onClick={exportPdf}>Print / PDF</button>
        <button className="btn btn-sm dl" onClick={exportHtml}>HTML</button>
      </>}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
          <div className="row">
            {vc ? <Pill tone={STATUS[vc.status][1]}>{STATUS[vc.status][0]}</Pill> : <Pill tone="none">Not yet saved — edits create version 1</Pill>}
            {vc && <span className="mini">v{vc.version} · {vc.gate} · created {fmtDate(vc.createdAt)} · {vc.reviewCycles || 0} review cycle{vc.reviewCycles === 1 ? '' : 's'}</span>}
            {flagCycles && <Pill tone="warning">Over {ws.settings.thresholds.reviewCycles} review cycles (BR-23) — consider a decision</Pill>}
            {vc?.aiAssisted?.length > 0 && <span className="ai-label">AI-assisted sections: {vc.aiAssisted.length}</span>}
          </div>
          {vc && !locked && (
            <div className="btn-row">
              {vc.status === 'draft' && <button className="btn btn-sm" onClick={() => setStatus('in-review')}>Submit for VMO review</button>}
              {vc.status === 'in-review' && <><button className="btn btn-sm" onClick={() => setModal({ kind: 'return', text: '' })} disabled={!isVmo} title={isVmo ? '' : 'VMO only'}>Return for revision</button><button className="btn btn-sm" onClick={() => setStatus('submitted', { submittedAt: new Date().toISOString(), figures: live.key })} disabled={!isVmo} title={isVmo ? '' : 'VMO only'}>Accept for gate</button></>}
              {vc.status === 'submitted' && <button className="btn btn-sm btn-navy" onClick={() => { if (window.confirm('Lock this version as the one reviewed at the gate? It becomes read-only (BR-08).')) setStatus('locked', { lockedAt: new Date().toISOString(), figures: live.key, doc: live }); }}>Lock for gate</button>}
              <button className="btn btn-sm" onClick={() => setModal({ kind: 'settings' })}>Funding and conditions</button>
              <button className="btn btn-sm" onClick={() => setModal({ kind: 'checklist' })}>Review checklist</button>
            </div>
          )}
          {versions.length > 1 && <button className="btn btn-sm" onClick={() => setModal({ kind: 'compare' })}>Compare versions</button>}
        </div>
        {locked && <p className="mini" style={{ marginBottom: 0 }}>This version is locked{vc.doc ? ' and shown exactly as reviewed' : ' (imported without a stored snapshot — showing current data)'}. Create a new version to refresh it — value cases are evergreen and refreshed before every gate.</p>}
        <p className="hosted-note mini">Downloads and printing are unavailable in this hosted preview; the installed version exports Word, PDF and HTML.</p>
      </Card>

      <div className="bc-layout">
        <nav className="bc-toc card" aria-label="Business case contents" style={{ padding: '10px 0' }}>
          {model.sections.map((s) => <a key={s.id} href={`#bc-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`bc-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{s.number}. {s.heading.replace(/\?.*$/, '?')}</a>)}
        </nav>
        <article className="bc-doc">
          <div style={{ textAlign: 'center', color: '#b42318', fontWeight: 700, fontSize: 11.5, letterSpacing: '0.08em' }}>{model.meta.classification}</div>
          <div className="cover"><div className="org">{model.meta.org}</div><h1>{model.meta.title}</h1><div className="muted">{model.meta.code} · Version {model.meta.version} · {model.meta.status} · {model.meta.date}</div></div>
          <table className="kv"><tbody>{[['Business sponsor', model.meta.sponsor], ['Program manager', model.meta.manager], ['Gate', model.meta.gate], ['Prepared by', model.meta.preparedBy]].map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
          {model.sections.map((s) => (
            <section key={s.id}>
              <h2 id={`bc-${s.id}`} style={{ scrollMarginTop: 80 }}>{s.number}. {s.heading}</h2>
              {s.blocks.map(renderBlock)}
            </section>
          ))}
        </article>
      </div>

      {modal?.kind === 'return' && (
        <Modal title="Return for revision" onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" disabled={!modal.text.trim()} onClick={() => { updateProgram(p.id, (x) => { const v = x.valueCases.find((y) => y.id === vc.id); v.status = 'draft'; v.reviewCycles = (v.reviewCycles || 0) + 1; v.reviewComments = [...(v.reviewComments || []), { date: todayISO(), by: ws.currentUser, text: modal.text }]; }, `Value case v${vc.version} returned for revision`); setModal(null); }}>Return</button></>}>
          <p>The review-cycle counter increases; cases beyond {ws.settings.thresholds.reviewCycles} cycles are flagged to the VMO lead to avoid analysis paralysis.</p>
          <Field label="Review comments"><TextArea value={modal.text} onChange={(v) => setModal({ ...modal, text: v })} /></Field>
          {(vc.reviewComments || []).length > 0 && <><div className="section-title">Earlier comments</div>{vc.reviewComments.map((c, i) => <div key={i} className="mini">• {fmtDate(c.date)} — {c.text}</div>)}</>}
        </Modal>
      )}
      {modal?.kind === 'settings' && (
        <Modal title="Funding requested and conditions" onClose={() => setModal(null)} footer={<button className="btn btn-primary" onClick={() => setModal(null)}>Done</button>}>
          <div className="form-grid">
            <Field label="Gate"><Select value={vc.gate} onChange={(v) => ensureDraft((x) => { x.gate = v; }, 'Value case gate')} options={GATES.map((g) => [g.id, g.name])} /></Field>
            <Field label="Funding requested to the next gate" hint={`default ${money(live.key.fundingRequested)}`}><NumberInput value={vc.fundingRequested} onChange={(v) => ensureDraft((x) => { x.fundingRequested = v === '' ? undefined : v; }, 'Funding requested')} /></Field>
            <Field label="Proposed conditions" className="full"><TextArea value={vc.conditions} onChange={(v) => ensureDraft((x) => { x.conditions = v; }, 'Proposed conditions')} /></Field>
          </div>
        </Modal>
      )}
      {modal?.kind === 'checklist' && (
        <Modal title="VMO quality review checklist (VCS-06)" onClose={() => setModal(null)} footer={<button className="btn btn-primary" onClick={() => setModal(null)}>Done</button>}>
          <Guidance>The VMO acts as coach, not methodology police: use the checklist to focus the conversation.</Guidance>
          <div style={{ marginTop: 10 }}>{REVIEW_CHECKLIST.map((c) => <label key={c} className="check" style={{ padding: '6px 0' }}><input type="checkbox" checked={Boolean(vc.checklist?.[c])} onChange={(e) => ensureDraft((x) => { x.checklist = { ...(x.checklist || {}), [c]: e.target.checked }; }, 'Review checklist')} /> {c}</label>)}</div>
          <p className="mini">{Object.values(vc.checklist || {}).filter(Boolean).length} of {REVIEW_CHECKLIST.length} confirmed.</p>
        </Modal>
      )}
      {modal?.kind === 'compare' && (
        <Modal title="Compare value-case versions (VCS-02)" wide onClose={() => setModal(null)} footer={<button className="btn btn-primary" onClick={() => setModal(null)}>Close</button>}>
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Key figure</th>{versions.slice().reverse().map((v) => <th key={v.id} className="num">v{v.version} ({v.gate})<div className="mini" style={{ textTransform: 'none' }}>{fmtDate(v.lockedAt || v.createdAt)}</div></th>)}<th className="num">Current data</th></tr></thead>
            <tbody>{KEY_FIGURES.map(([k, l, f]) => <tr key={k}><td>{l}</td>{versions.slice().reverse().map((v) => <td key={v.id} className="num">{fmt(v.figures?.[k], f)}</td>)}<td className="num"><strong>{fmt(live.key[k], f)}</strong></td></tr>)}</tbody>
          </table></div>
          <p className="mini">Figures are captured when a version is accepted for a gate or locked; estimate ranges are expected to narrow as the program progresses (VCS-03). Gate decision history for this case is on the Gates tab (VCS-09).</p>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}

function fmt(v, f) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return f === 'money' ? money(v) : f === 'pct' ? pct(v, 1) : f === 'ratio' ? ratio(v) : Math.round(v).toLocaleString('en-AU');
}
