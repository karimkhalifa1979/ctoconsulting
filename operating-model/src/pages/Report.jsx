import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Field, TextInput, downloadBlob, safeFile } from '../components/ui.jsx';
import { REPORT_SECTIONS } from '../lib/pdf-sections.js';
import { executiveSummary } from '../lib/narrative.js';
import { overallStats, maturityName } from '../lib/calc.js';
import { aiOverall } from '../lib/aiCalc.js';
import { engagementTitle } from '../lib/model.js';
import { fmtScore, fmtDate } from '../lib/format.js';

export default function Report() {
  const { eng, setPath, notify } = useStore();
  const rep = eng.report || {};
  const sections = rep.sections || REPORT_SECTIONS.filter((s) => s.default).map((s) => s.id);
  const [busy, setBusy] = useState('');
  const [url, setUrl] = useState(null);
  const summary = executiveSummary(eng);
  const o = overallStats(eng);
  const ai = aiOverall(eng);
  const setR = (k) => (v) => setPath(['report', k], v);
  const toggle = (id) => setR('sections')(sections.includes(id) ? sections.filter((x) => x !== id) : REPORT_SECTIONS.map((s) => s.id).filter((x) => x === id || sections.includes(x)));

  const opts = {
    title: rep.title || 'Operating Model Assessment Report', subtitle: rep.subtitle || 'Operating Model Assessment',
    preparedBy: rep.preparedBy || eng.details.lead || 'CTO Consulting', preparedFor: rep.preparedFor || eng.details.sponsor, classification: rep.classification ?? 'Commercial in confidence', sections,
  };
  const generate = async (open) => {
    setBusy('Starting…');
    try {
      const { generateReport } = await import('../lib/pdf.js');
      const blob = await generateReport(eng, opts, setBusy);
      const name = `${safeFile(engagementTitle(eng))}_Operating_Model_Assessment_Report.pdf`;
      if (open) {
        if (url) URL.revokeObjectURL(url);
        setUrl(URL.createObjectURL(blob));
      } else downloadBlob(blob, name);
      notify(open ? 'Report preview ready.' : `Downloaded ${name}`);
    } catch (err) {
      console.error(err);
      notify(`Report failed: ${err.message}`);
    } finally { setBusy(''); }
  };

  return (
    <div className="stack">
      <PageHead eyebrow="Step 7 · Report" title="Assessment report (PDF)"
        actions={<>
          <button className="btn" onClick={() => generate(true)} disabled={!!busy}>Preview</button>
          <button className="btn btn-primary" onClick={() => generate(false)} disabled={!!busy}>{busy || 'Download PDF report'}</button>
        </>}>
        Summarises every finding and analysis into a branded CTO Consulting report: executive summary, maturity profile, findings, current-state analysis, AI readiness, the target operating model, the current-vs-target comparison, the business case, recommendations, roadmap, change and risk.
      </PageHead>
      <div className="grid g-12">
        <div className="stack">
          <Card title="Report details">
            <div className="stack-sm">
              <Field label="Title"><TextInput value={rep.title ?? ''} placeholder="Operating Model Assessment Report" onChange={setR('title')} /></Field>
              <Field label="Prepared by"><TextInput value={rep.preparedBy ?? ''} placeholder={eng.details.lead || 'CTO Consulting'} onChange={setR('preparedBy')} /></Field>
              <Field label="Prepared for"><TextInput value={rep.preparedFor ?? ''} placeholder={eng.details.sponsor} onChange={setR('preparedFor')} /></Field>
              <Field label="Classification marking"><TextInput value={rep.classification ?? 'Commercial in confidence'} onChange={setR('classification')} /></Field>
            </div>
          </Card>
          <Card title="Sections" subtitle={`${sections.length} of ${REPORT_SECTIONS.length} selected`} actions={<><button className="btn btn-xs" onClick={() => setR('sections')(REPORT_SECTIONS.map((s) => s.id))}>All</button><button className="btn btn-xs" onClick={() => setR('sections')(REPORT_SECTIONS.filter((s) => s.default).map((s) => s.id))}>Default</button></>}>
            <div className="section-list">
              {REPORT_SECTIONS.map((s) => <label key={s.id}><input type="checkbox" checked={sections.includes(s.id)} onChange={() => toggle(s.id)} /><span className="small">{s.title}</span></label>)}
            </div>
          </Card>
        </div>
        <div className="stack">
          {url ? (
            <Card title="Preview" actions={<button className="btn btn-xs" onClick={() => setUrl(null)}>Close preview</button>} pad={false}>
              <iframe title="Report preview" src={url} style={{ width: '100%', height: '80vh', border: 0 }} />
            </Card>
          ) : (
            <div className="report-preview card" style={{ padding: 20 }}>
              <div className="report-cover">
                <div className="eyebrow" style={{ color: '#9fe3ea' }}>CTO Consulting · {opts.subtitle}</div>
                <h1>{opts.title}</h1>
                <h2 style={{ color: '#dce7f5', marginTop: 6 }}>{eng.details.client || 'Client'}</h2>
                <p style={{ color: '#c3d3e8', marginTop: 12 }}>{eng.details.name} · {fmtDate(new Date())} · Version {eng.details.version} · {opts.classification}</p>
              </div>
              <h2 className="mt-16">Executive summary</h2>
              <div className="callout mt-8">{summary.headline}</div>
              <div className="grid g-4 mt-16">
                <div className="card stat"><div className="label">Current maturity</div><div className="value">{fmtScore(o.current)}</div><div className="sub">{maturityName(o.current)}</div></div>
                <div className="card stat"><div className="label">Target</div><div className="value">{fmtScore(o.target)}</div></div>
                <div className="card stat"><div className="label">Findings</div><div className="value">{o.findings}</div></div>
                <div className="card stat"><div className="label">AI readiness</div><div className="value">{ai.index ?? '—'}</div></div>
              </div>
              {summary.paragraphs.map((p, i) => <p key={i} className="mt-8" style={{ color: 'var(--ink-2)' }}>{p}</p>)}
              <h3 className="mt-16">Priority areas</h3>
              <ul className="list-plain">{summary.bullets.map((b) => <li key={b} className="small">{b}</li>)}</ul>
              <p className="small muted mt-16">This is a summary of the first section. Use Preview to view the full PDF here, or Download PDF report to save it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
