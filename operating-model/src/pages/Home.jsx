import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Modal, Field, TextInput, Badge, downloadBlob, safeFile } from '../components/ui.jsx';
import { TK, engagementTitle } from '../lib/model.js';
import { overallStats, maturityName } from '../lib/calc.js';
import { aiOverall } from '../lib/aiCalc.js';
import { fmtDate, fmtScore } from '../lib/format.js';

const PHASES = [
  ['1', 'Mobilise', 'Client details, objectives, scope, hypotheses, design principles and settings.', '/engagement'],
  ['2', 'Plan', 'Register stakeholders, tailor interview guides and issue document requests.', '/stakeholders'],
  ['3', 'Discover', 'Capabilities, processes, structure, decision rights, applications, suppliers, locations and costs.', '/capabilities'],
  ['4', 'Assess', 'Score 157 questions across 17 dimensions, assess AI readiness and log findings.', '/assessment'],
  ['5', 'Analyse', 'Review the dashboard: maturity profile, gaps, RAG, findings and inventory health.', '/dashboard'],
  ['6', 'Design', 'Design the target operating model, prioritise recommendations and plan the transition.', '/tom'],
  ['7', 'Business case', 'Track costs and benefits of initiatives and solution components; NPV, ROI, payback.', '/benefits'],
  ['8', 'Compare & report', 'Compare current and target operating models and download the PDF report.', '/compare'],
];

export default function Home() {
  const { index, eng, open, create, createDemoEngagement, duplicate, removeEngagement, importEngagement, loadEngagement, notify } = useStore();
  const nav = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const [client, setClient] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);
  const o = overallStats(eng);
  const ai = aiOverall(eng);

  const doCreate = async () => {
    await create({ client: client.trim(), name: name.trim() });
    setNewOpen(false); setClient(''); setName('');
    notify('New engagement created from the toolkit template.');
    nav('/engagement');
  };

  const exportJson = async (id) => {
    const e = await loadEngagement(id);
    if (!e) return;
    downloadBlob(new Blob([JSON.stringify({ format: 'cto-omat', version: 1, engagement: e }, null, 1)], { type: 'application/json' }), `${safeFile(engagementTitle(e))}_backup.json`);
  };

  const exportExcel = async () => {
    setBusy('excel');
    try {
      const { exportWorkbook } = await import('../lib/excel.js');
      const blob = await exportWorkbook(eng);
      downloadBlob(blob, `${safeFile(engagementTitle(eng))}_Operating_Model_Assessment.xlsx`);
    } catch (err) {
      notify(`Excel export failed: ${err.message}`);
    } finally { setBusy(''); }
  };

  const onFile = async (ev) => {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    setBusy('import');
    try {
      if (/\.json$/i.test(f.name)) {
        const data = JSON.parse(await f.text());
        const e = data.engagement || data;
        if (!e.details || !e.questions) throw new Error('This file is not an engagement backup.');
        await importEngagement(e);
        notify(`Imported ${engagementTitle(e)}.`);
      } else {
        const { importWorkbook } = await import('../lib/excel.js');
        const { engagement, summary } = await importWorkbook(await f.arrayBuffer());
        await importEngagement(engagement);
        notify(`Imported workbook: ${summary}`);
      }
      nav('/dashboard');
    } catch (err) {
      notify(`Import failed: ${err.message}`);
    } finally { setBusy(''); }
  };

  return (
    <div className="stack">
      <div className="hero">
        <div className="eyebrow" style={{ color: '#9fe3ea' }}>CTO Consulting · Business Analysis Practice</div>
        <h1>Operating Model Assessment Toolkit</h1>
        <p style={{ maxWidth: 900, marginTop: 8 }}>{TK.cover.purpose}</p>
        <div className="kpis">
          <div><strong>{engagementTitle(eng)}</strong><span>Open engagement · {eng.details.status}</span></div>
          <div><strong>{fmtScore(o.current)} <small style={{ fontSize: 14 }}>/ 5</small></strong><span>Current maturity {o.current ? `· ${maturityName(o.current)}` : ''}</span></div>
          <div><strong>{Math.round(o.pctScored * 100)}%</strong><span>Questions scored</span></div>
          <div><strong>{o.findings}</strong><span>Findings</span></div>
          <div><strong>{ai.index ?? '—'}</strong><span>AI readiness index</span></div>
        </div>
        <div className="btn-row" style={{ marginTop: 18, position: 'relative', zIndex: 1 }}>
          <Link className="btn btn-primary" to="/dashboard">Open dashboard</Link>
          <button className="btn" onClick={() => setNewOpen(true)}>+ New engagement</button>
          <Link className="btn" to="/report">Download report (PDF)</Link>
        </div>
      </div>

      <div>
        <div className="section-title">How to use the toolkit</div>
        <div className="phase-steps">
          {PHASES.map(([n, t, d, to]) => (
            <Link key={n} className="phase-step" to={to}><div className="n">STEP {n}</div><strong>{t}</strong><p>{d}</p></Link>
          ))}
        </div>
      </div>

      <Card title="Engagements" subtitle="Each engagement is a complete, independent assessment of one organisation. Data is saved automatically in this browser."
        actions={<>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>{busy === 'import' ? 'Importing…' : 'Import (.xlsx or .json)'}</button>
          <button className="btn btn-sm" onClick={createDemoEngagement}>Add demo engagement</button>
          <button className="btn btn-sm btn-primary" onClick={() => setNewOpen(true)}>+ New engagement</button>
        </>} pad={false}>
        <input ref={fileRef} type="file" accept=".xlsx,.json" hidden onChange={onFile} />
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Client</th><th>Engagement</th><th>Status</th><th>Last updated</th><th /></tr></thead>
            <tbody>
              {index.map((i) => (
                <tr key={i.id} style={i.id === eng.id ? { background: 'var(--brand-teal-soft)' } : undefined}>
                  <td className="strong">{i.client || 'Untitled'} {i.kind === 'demo' && <Badge v="Demo">Demo</Badge>} {i.id === eng.id && <Badge v="Open" kind="x">Open</Badge>}</td>
                  <td>{i.name}</td>
                  <td><Badge v={i.status}>{i.status}</Badge></td>
                  <td className="nowrap">{fmtDate(i.updatedAt)}</td>
                  <td className="nowrap right">
                    <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                      {i.id !== eng.id && <button className="btn btn-xs" onClick={() => open(i.id)}>Open</button>}
                      <button className="btn btn-xs" onClick={() => duplicate(i.id)}>Duplicate</button>
                      <button className="btn btn-xs" onClick={() => exportJson(i.id)}>Backup</button>
                      <button className="btn btn-xs btn-danger" onClick={() => { if (window.confirm(`Delete ${i.client || i.name || 'this engagement'}? This cannot be undone. Download a backup first if you may need it.`)) removeEngagement(i.id); }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid g-3">
        <Card title="Export the open engagement">
          <p className="small muted">Download everything captured for <strong>{engagementTitle(eng)}</strong>.</p>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={exportExcel} disabled={!!busy}>{busy === 'excel' ? 'Building workbook…' : 'Excel workbook (toolkit format)'}</button>
            <button className="btn" onClick={() => exportJson(eng.id)}>JSON backup</button>
            <Link className="btn" to="/report">PDF report</Link>
          </div>
        </Card>
        <Card title="Import a completed toolkit workbook">
          <p className="small muted">Already working in the Excel toolkit? Import a completed <em>CTO Consulting Operating Model Assessment Toolkit</em> workbook (or a workbook exported from this tool) to create an engagement from it.</p>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={!!busy}>Choose workbook…</button>
        </Card>
        <Card title="About the framework">
          <p className="small muted">{TK.frameworkIntro} {TK.questions.length} questions, a five-level maturity model and an eight-pillar AI readiness assessment.</p>
          <Link className="btn" to="/reference">Framework & maturity model</Link>
        </Card>
      </div>

      {newOpen && (
        <Modal title="New engagement" onClose={() => setNewOpen(false)}
          footer={<><button className="btn" onClick={() => setNewOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={doCreate} disabled={!client.trim()}>Create engagement</button></>}>
          <div className="stack">
            <p className="small muted">A new engagement starts from the toolkit template: 157 assessment questions, 72 interview questions, 69 document requests, 56 capabilities, 40 processes and 21 key decisions, ready to tailor.</p>
            <Field label="Client organisation"><TextInput value={client} onChange={setClient} autoFocus placeholder="e.g. Example Health Service" /></Field>
            <Field label="Engagement name" hint="optional"><TextInput value={name} onChange={setName} placeholder="e.g. Operating model review 2026" /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
