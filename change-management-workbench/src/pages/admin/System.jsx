// System and promotion (MNT-03, ADM-010): storage and service health with an integrity check of the audit
// trail, and export and import of configuration and templates to promote changes between environments
// (for example from test to production). Configuration changes are audited.
import { useCallback, useEffect, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { Card, Badge, Spinner, ErrorBox, KV } from '../../ui/core.jsx';
import { useApp, useDialog, useToast } from '../../state/app.jsx';
import { saveBlob } from '../../data/client.js';
import { fmtDateTime } from '../../lib/format.js';

export default function System() {
  return (
    <div className="stack">
      <Health />
      <Promotion />
    </div>
  );
}

function Health() {
  const { api } = useApp();
  const [h, setH] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => { setH(null); api.op('systemHealth', {}).then(setH).catch(setError); }, [api]);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!h) return <Spinner label="Checking health" />;
  const stats = h.stats || {};
  return (
    <Card title="Health" sub="Storage, the audit trail and the service version." actions={<button type="button" className="btn btn-sm" onClick={load}><Icon name="refresh" />Check again</button>}>
      <KV items={[
        ['Mode', h.mode === 'server' ? 'Server' : 'Browser-only demonstration'],
        ['Storage', h.mode === 'server' ? h.storage || 'Unknown' : 'This browser (IndexedDB)'],
        ['Version', h.version],
        ['Checked', fmtDateTime(h.time)],
        ['Records', stats.records != null ? Number(stats.records).toLocaleString('en-AU') : null],
        ['Files', stats.blobs != null ? `${Number(stats.blobs).toLocaleString('en-AU')}${stats.blobBytes != null ? ` (${(stats.blobBytes / 1048576).toFixed(1)} MB)` : ''}` : null],
        ['Audit events', stats.audit != null ? Number(stats.audit).toLocaleString('en-AU') : h.audit?.checked != null ? Number(h.audit.checked).toLocaleString('en-AU') : null],
        ['Encryption at rest', stats.encrypted == null ? null : stats.encrypted ? 'On' : 'Off (set CMW_DATA_KEY on the server)'],
        ['Audit trail', h.audit?.ok ? <Badge tone="good" icon="checkCircle">Intact</Badge> : <Badge tone="critical" icon="alert">Broken at event {h.audit?.brokenAt}</Badge>],
      ]} />
    </Card>
  );
}

function Promotion() {
  const { api, refresh } = useApp();
  const toast = useToast();
  const dialog = useDialog();
  const [busy, setBusy] = useState('');
  const [includeTemplates, setIncludeTemplates] = useState(true);
  const doExport = async () => {
    setBusy('export');
    try {
      const bundle = await api.op('exportConfig', {});
      saveBlob(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }), `workbench-configuration-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success('Configuration exported');
    } catch (e) { toast.error(e); } finally { setBusy(''); }
  };
  const doImport = async (file) => {
    let bundle;
    try { bundle = JSON.parse(await file.text()); } catch { toast.error('The file is not a configuration export.'); return; }
    if (bundle?.format !== 'cmw-config') { toast.error('The file is not a configuration export.'); return; }
    const ok = await dialog.confirm({ title: 'Import configuration', message: `Settings, lists, custom fields, the intervention library, question sets and readiness checklists${includeTemplates ? `, and ${bundle.templates?.length || 0} templates,` : ''} are replaced with those exported on ${fmtDateTime(bundle.exportedAt)}. Records are not changed. The import is recorded in the audit trail.`, confirmLabel: 'Import', danger: true });
    if (!ok) return;
    setBusy('import');
    try {
      const r = await api.op('importConfig', { bundle, includeTemplates });
      await refresh();
      toast.success(`Configuration imported${includeTemplates ? ` with ${r.templates} templates` : ''}`);
    } catch (e) { toast.error(e); } finally { setBusy(''); }
  };
  return (
    <Card title="Promote configuration" sub="Export the configuration from one environment and import it into another, so changes can be tested before they reach production (ADM-010). Records and audit events are never included.">
      <div className="stack">
        <div className="btn-row"><button type="button" className="btn" disabled={!!busy} onClick={doExport}><Icon name="download" />{busy === 'export' ? 'Exporting…' : 'Export configuration'}</button></div>
        <div className="row" style={{ gap: 14 }}>
          <label className="btn file-btn"><Icon name="upload" />{busy === 'import' ? 'Importing…' : 'Import configuration'}<input type="file" accept=".json,application/json" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) doImport(f); }} /></label>
          <label className="check"><input type="checkbox" checked={includeTemplates} onChange={(e) => setIncludeTemplates(e.target.checked)} /><span>Include artefact templates</span></label>
        </div>
      </div>
    </Card>
  );
}
