// The browser-only workbench's own data: where it is kept, backups and restores, starting an empty
// workbench for an organisation, and going back to the demonstration data. Shown on the sign-in screen,
// in the banner, in the user menu and in Administration › System.
import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { Modal, ErrorBox } from './core.jsx';
import { useApp, useDialog, useToast } from '../state/app.jsx';
import { saveBlob } from '../data/client.js';
import { fmtDateTime } from '../lib/format.js';

export function useWorkbenchStatus(api) {
  const [s, setS] = useState(() => api?.status?.() || null);
  useEffect(() => api?.subscribe?.(setS), [api]);
  return s;
}

export const canBackUp = (user) => !!user?.roles?.some((r) => r === 'admin' || r === 'changeLead');

// Why the data is at risk, if it is.
export function StorageNotice({ status, compact = false }) {
  if (!status) return null;
  if (status.saveError) return <div className="callout bad small" role="alert"><strong>Changes could not be saved in this browser.</strong> {status.saveError}. Back up now so nothing is lost.</div>;
  if (status.persistent) return null;
  return (
    <div className="callout warn small" role="note">
      <strong>This browser is not keeping the workbench.</strong>{' '}
      {compact ? 'Back up before you close it.' : 'It does not let a file opened from disk store data, so the workbench is running in memory and is lost when the tab closes. Back up before you close it, or open the file in Google Chrome, Microsoft Edge or Firefox, which save your work automatically.'}
    </div>
  );
}

export function BackupButton({ className = 'btn', label = 'Back up' }) {
  const { api } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await api.backup();
      saveBlob(blob, filename);
      toast.success(`Backup saved as "${filename}"`);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return <button type="button" className={className} disabled={busy} onClick={run}><Icon name="download" />{busy ? 'Backing up…' : label}</button>;
}

export function RestoreButton({ className = 'btn', label = 'Restore from a backup' }) {
  const { api } = useApp();
  const toast = useToast();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    try {
      const b = await api.readBackup(file);
      const ok = await dialog.confirm({
        title: 'Restore from a backup',
        message: `This backup of ${b.organisation || 'a workbench'} was taken ${fmtDateTime(b.createdAt) || 'at an unknown time'} and holds ${b.records.toLocaleString('en-AU')} records. Restoring replaces everything in this browser with it. Back up first if you need what is here now.`,
        confirmLabel: 'Restore',
        danger: true,
      });
      if (!ok) return;
      setBusy(true);
      await api.restoreBackup(b.data);
      toast.success(`Restored the backup of ${b.organisation || 'the workbench'}`);
    } catch (e) { toast.error(e); setBusy(false); }
  };
  return (
    <label className={`${className} file-btn`} aria-disabled={busy}>
      <Icon name="upload" />{busy ? 'Restoring…' : label}
      <input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pick(f); }} />
    </label>
  );
}

export function LoadDemoButton({ className = 'btn', label = 'Load the demonstration data' }) {
  const { api } = useApp();
  const toast = useToast();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const ok = await dialog.confirm({ title: label, message: 'This replaces everything in this browser with the fictional demonstration data. Back up first if you need what is here now.', confirmLabel: 'Replace', danger: true });
    if (!ok) return;
    setBusy(true);
    try { await api.loadDemo(); toast.success('The demonstration data is loaded'); } catch (e) { toast.error(e); setBusy(false); }
  };
  return <button type="button" className={className} disabled={busy} onClick={run}><Icon name="refresh" />{busy ? 'Loading…' : label}</button>;
}

const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney'; } catch { return 'Australia/Sydney'; } };

export function StartOwnButton({ className = 'btn btn-primary', label = 'Start your own workbench' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Icon name="plus" />{label}</button>
      {open && <StartOwn onClose={() => setOpen(false)} />}
    </>
  );
}

function StartOwn({ onClose }) {
  const { api } = useApp();
  const toast = useToast();
  const [d, setD] = useState({ organisation: '', name: '', email: '', timeZone: browserZone() });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.startOwn(d);
      toast.success(`Your workbench for ${d.organisation.trim()} is ready`);
    } catch (err) { setError(err); setBusy(false); }
  };
  return (
    <Modal title="Start your own workbench" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" form="start-own" className="btn btn-primary" disabled={busy}>{busy ? 'Starting…' : 'Start the workbench'}</button></>}>
      <form id="start-own" className="stack-sm" onSubmit={submit}>
        <p className="small" style={{ margin: 0 }}>An empty workbench for your organisation, kept in this browser on this computer. You become its administrator and change management lead, and can add colleagues in Administration › Users.</p>
        <div className="callout warn small">This replaces what is in this browser now, including the demonstration data. Back up first if you need it.</div>
        <ErrorBox error={error} />
        <label className="field"><span>Organisation</span><input value={d.organisation} onChange={set('organisation')} required autoComplete="organization" /></label>
        <label className="field"><span>Your name</span><input value={d.name} onChange={set('name')} required autoComplete="name" /></label>
        <label className="field"><span>Your work email</span><input type="email" value={d.email} onChange={set('email')} required autoComplete="email" /></label>
        <label className="field"><span>Time zone</span><input value={d.timeZone} onChange={set('timeZone')} required /></label>
      </form>
    </Modal>
  );
}

// The banner above every screen of the browser-only workbench.
export function WorkbenchBanner() {
  const { api, user } = useApp();
  const status = useWorkbenchStatus(api);
  if (!status) return null;
  const own = status.workspace === 'own';
  const atRisk = !status.persistent || !!status.saveError;
  const risk = status.saveError ? ' Changes could not be saved in this browser: back up now.' : !status.persistent ? ' This browser is not keeping it, so back up before you close the tab.' : '';
  return (
    <div className={`mode-banner no-print ${atRisk ? 'warn' : ''}`} role="note">
      <Icon name={atRisk ? 'alert' : 'info'} size={15} />
      {own ? (
        <span><strong>Offline workbench.</strong> Your data is kept in this browser on this computer.{risk}{!atRisk && (status.lastBackupAt ? ` Last backed up ${fmtDateTime(status.lastBackupAt)}.` : ' Not backed up yet.')}</span>
      ) : (
        <span><strong>{status.offline ? 'Offline demonstration.' : 'Browser-only demonstration.'}</strong> Data is fictional and kept in this browser. Changes you make stay on this device.{risk}</span>
      )}
      {canBackUp(user) && (own || atRisk) && <BackupButton className="btn btn-xs" />}
      {!own && <StartOwnButton className="btn btn-xs" />}
      {!own && <LoadDemoButton className="btn btn-xs" label="Reset demonstration data" />}
    </div>
  );
}
