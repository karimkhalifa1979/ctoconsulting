import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp, exportOrgBackup, SEED_ID } from '../lib/store.jsx';
import { PageHead, Card, Modal, Toast } from '../components/ui.jsx';
import { SECTOR_TYPES, INDUSTRIES, FLAGS } from '../lib/profile.js';
import { dataQuality } from '../lib/discovery.js';
import { exportRegisterXlsx, downloadBlob, safeName } from '../lib/exporters.js';
import { computeStats } from '../lib/assessment.js';

const KIND = { seed: ['Reference register', 'badge-navy'], generated: ['Discovered', 'badge-teal'], imported: ['Imported workbook', ''] };

export default function Organisations() {
  const { orgs, org, data, assessments, library, selectOrg, deleteOrg, restoreBackup } = useApp();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState('');
  const issues = useMemo(() => dataQuality(data), [data]);
  const stats = useMemo(() => computeStats(data.requirements, assessments), [data, assessments]);

  const backup = async () => {
    const b = await exportOrgBackup(org);
    downloadBlob(JSON.stringify(b), `${safeName(org.shortName)}_assessment_backup.json`, 'application/json');
  };
  const restore = async (file) => {
    try {
      const r = await restoreBackup(JSON.parse(await file.text()));
      setToast(`Restored ${r.name}`);
    } catch (e) {
      setToast(`Restore failed: ${e.message}`);
    }
  };

  return (
    <div className="stack">
      <PageHead eyebrow="Organisations" title="Organisations under assessment"
        actions={<>
          <label className="btn">Restore backup<input type="file" accept=".json" hidden onChange={(e) => e.target.files[0] && restore(e.target.files[0])} /></label>
          <Link className="btn btn-primary" to="/discover">+ New organisation</Link>
        </>}>
        Each organisation has its own obligations register, policy requirements, control assessments, policy documents and calendar. Data is stored in this browser — use Backup to move or share it.
      </PageHead>

      <div className="grid g-3">
        {orgs.map((o) => {
          const [kind, cls] = KIND[o.kind] || KIND.generated;
          const active = o.id === org.id;
          return (
            <div key={o.id} className="card card-pad" style={{ borderColor: active ? 'var(--brand-teal)' : undefined, boxShadow: active ? '0 0 0 2px var(--brand-teal-soft)' : undefined }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className={`badge ${cls}`}>{kind}</span>
                {active && <span className="badge badge-teal">Selected</span>}
              </div>
              <h2 style={{ marginTop: 10 }}>{o.name}</h2>
              <div className="small muted">{o.shortName} · {SECTOR_TYPES.find((s) => s.id === o.profile?.sectorType)?.label}</div>
              <div className="row small" style={{ marginTop: 10, gap: 16 }}>
                <span><strong className="tabular">{(o.sources || []).filter((s) => s.selected !== false).length}</strong> sources</span>
                <span><strong className="tabular">{o.counts?.obligations?.toLocaleString() ?? '—'}</strong> obligations</span>
                <span><strong className="tabular">{o.counts?.requirements ?? '—'}</strong> requirements</span>
              </div>
              {o.source && <div className="small muted" style={{ marginTop: 6 }}>Source: {o.source}</div>}
              <div className="btn-row" style={{ marginTop: 14 }}>
                <button className="btn btn-sm btn-primary" onClick={() => { selectOrg(o.id); nav('/dashboard'); }}>Open</button>
                {o.id !== SEED_ID && o.kind === 'generated' && <Link className="btn btn-sm" to={`/discover?org=${o.id}`}>Re-run discovery</Link>}
                {o.id !== SEED_ID && <button className="btn btn-sm btn-danger" onClick={() => setConfirm(o)}>Delete</button>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid g-2">
        <Card title={`Profile — ${org.name}`} subtitle="Drives which obligations apply"
          actions={org.kind === 'generated' ? <Link className="btn btn-sm" to={`/discover?org=${org.id}`}>Edit profile</Link> : null}>
          <dl style={{ margin: 0 }}>
            <div className="attr"><dt>Organisation type</dt><dd>{SECTOR_TYPES.find((s) => s.id === org.profile?.sectorType)?.label}</dd></div>
            <div className="attr"><dt>Industries</dt><dd>{(org.profile?.industries || []).map((i) => INDUSTRIES.find((x) => x.id === i)?.label).join(', ') || '—'}</dd></div>
            <div className="attr"><dt>Jurisdictions</dt><dd>{[...(org.profile?.states || []), ...(org.profile?.international || [])].join(', ') || '—'}</dd></div>
            <div className="attr"><dt>Characteristics</dt><dd>{FLAGS.filter((f) => org.profile?.flags?.[f.id]).map((f) => f.label).join('; ') || '—'}</dd></div>
            {org.aiSummary && <div className="attr"><dt>AI research summary</dt><dd>{org.aiSummary}</dd></div>}
            <div className="attr"><dt>Assessment progress</dt><dd>{stats.assessed} of {stats.total} requirements assessed · score {stats.score ?? '—'}%</dd></div>
          </dl>
          {org.kind === 'seed' && <p className="small muted">Loaded from <strong>{library.meta.source}</strong>: {library.meta.counts.requirements} requirements, {library.meta.counts.obligations.toLocaleString()} obligations, {library.meta.counts.exemptions} exemptions, {library.meta.counts.pspf} PSPF requirements and all {library.meta.counts.sheets} worksheets (see Register explorer).</p>}
        </Card>
        <Card title="Export & backup" subtitle={org.name}>
          <div className="stack">
            <div>
              <button className="btn btn-primary" onClick={() => exportRegisterXlsx(org, data, assessments)}>Export register to Excel</button>
              <p className="small muted" style={{ margin: '6px 0 0' }}>Requirements (41 attributes), Obligations, Exemptions, Applicable Sources and Control Assessment sheets, in the same layout as the source register.</p>
            </div>
            <div>
              <button className="btn" onClick={backup}>Download backup (.json)</button>
              <p className="small muted" style={{ margin: '6px 0 0' }}>Profile, register, assessments and authored policies — restore on another device with “Restore backup”.</p>
            </div>
          </div>
          <h3 style={{ marginTop: 20 }}>Register data quality</h3>
          {issues.length ? (
            <ul className="small" style={{ paddingLeft: 18 }}>{issues.map((i) => <li key={i.text}><span className={`badge pri-${i.severity === 'High' ? 'Critical' : i.severity}`}>{i.severity}</span> {i.text}</li>)}</ul>
          ) : <p className="small muted">No data quality issues detected.</p>}
        </Card>
      </div>

      {confirm && (
        <Modal title="Delete organisation" onClose={() => setConfirm(null)}
          footer={<><button className="btn" onClick={() => setConfirm(null)}>Cancel</button><button className="btn btn-primary" style={{ background: 'var(--st-critical)', borderColor: 'var(--st-critical)' }} onClick={async () => { await deleteOrg(confirm.id); setConfirm(null); }}>Delete permanently</button></>}>
          <p>Delete <strong>{confirm.name}</strong> and all of its obligations, requirements, assessments and policy documents from this browser? Download a backup first if you may need it.</p>
        </Modal>
      )}
      {toast && <Toast text={toast} onDone={() => setToast('')} />}
    </div>
  );
}
