import { useState } from 'react';
import { useP, useCan } from '../../lib/store.jsx';
import { Card, PageHead } from '../../../components/ui.jsx';
import { Field, TagInput, Confirm, FileDrop, download, MIME } from '../../components/common.jsx';
import { LEVELS } from '../../core/constants.js';

const TAXONOMY_LABELS = { sectors: 'Sectors', offerings: 'Offerings', technologies: 'Technologies', capabilities: 'Capabilities', regions: 'Regions' };

// Platform settings: thresholds, cost rates, AI, style guide, taxonomy (CL-03) and data management.
export default function Settings() {
  const { view, me, dispatch, reset, exportAll, importAll, toast, mode } = useP();
  const can = useCan();
  const admin = me.roles.includes('admin');
  const configure = can('configure');
  const s = view.settings;
  const [d, setD] = useState(null);
  const [tax, setTax] = useState(null);
  const [style, setStyle] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const f = d || s;
  const set = (patch) => setD({ ...f, ...patch });
  const save = async () => {
    const patch = {};
    for (const k of ['orgName', 'website', 'orgAbn', 'gstRate', 'marginThreshold', 'secondPartnerThreshold', 'escalationDays', 'expiryReminderDays', 'cvStaleMonths', 'teamsEnabled', 'digestHour', 'ai', 'costRates']) if (JSON.stringify(f[k]) !== JSON.stringify(s[k])) patch[k] = f[k];
    await dispatch('settings.update', { patch }, { success: 'Settings saved' });
    setD(null);
  };
  const exportJson = async () => {
    const st = await exportAll();
    download(new Blob([JSON.stringify(st, null, 1)], { type: MIME.json }), `cto-proposals-export-${new Date().toISOString().slice(0, 10)}.json`);
  };
  const importJson = async (files) => {
    try {
      const st = JSON.parse(await files[0].text());
      if (!st.bids || !st.users) throw new Error('This is not a platform export.');
      await importAll(st);
      toast('Data imported', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
  const sg = style || s.styleGuide;
  const tx = tax || view.taxonomy;
  return (
    <div className="stack">
      <PageHead eyebrow="Administration" title="Settings" />
      <Card title="Organisation and thresholds" actions={admin && d ? <div className="row"><button className="btn btn-sm" onClick={() => setD(null)}>Discard</button><button className="btn btn-sm btn-primary" onClick={save}>Save</button></div> : null}>
        <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            <Field label="Organisation name"><input value={f.orgName} onChange={(e) => set({ orgName: e.target.value })} /></Field>
            <Field label="Website"><input value={f.website} onChange={(e) => set({ website: e.target.value })} /></Field>
            <Field label="ABN"><input value={f.orgAbn} onChange={(e) => set({ orgAbn: e.target.value })} /></Field>
            <Field label="GST rate" hint="Prices are AUD with GST shown separately"><input type="number" step="0.01" value={f.gstRate} onChange={(e) => set({ gstRate: Number(e.target.value) })} /></Field>
            <Field label="Margin threshold (%)" hint="Default when a workflow has no margin rule (PR-05)"><input type="number" value={f.marginThreshold} onChange={(e) => set({ marginThreshold: Number(e.target.value) })} /></Field>
            <Field label="Second partner above (AUD)"><input type="number" value={f.secondPartnerThreshold} onChange={(e) => set({ secondPartnerThreshold: Number(e.target.value) })} /></Field>
            <Field label="Escalate overdue tasks after (days)" hint="WF-11"><input type="number" value={f.escalationDays} onChange={(e) => set({ escalationDays: Number(e.target.value) })} /></Field>
            <Field label="Remind owners before expiry (days)" hint="CL-05"><input type="number" value={f.expiryReminderDays} onChange={(e) => set({ expiryReminderDays: Number(e.target.value) })} /></Field>
            <Field label="Profiles out of date after (months)"><input type="number" value={f.cvStaleMonths} onChange={(e) => set({ cvStaleMonths: Number(e.target.value) })} /></Field>
            <Field label="Daily digest hour"><input type="number" min="0" max="23" value={f.digestHour} onChange={(e) => set({ digestHour: Number(e.target.value) })} /></Field>
            <Field label="Microsoft Teams notifications"><label className="check"><input type="checkbox" checked={Boolean(f.teamsEnabled)} onChange={(e) => set({ teamsEnabled: e.target.checked })} /><span>Send approval cards and mentions to Teams</span></label></Field>
          </div>
        </fieldset>
      </Card>
      <div className="split">
        <Card title="Cost rates (internal only)" subtitle="Default daily cost per level when a consultant has no individual cost rate. Administrators only (PR-08).">
          {view.seeCost && f.costRates ? (
            <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
              <table className="table"><tbody>{LEVELS.map((l) => <tr key={l}><td>{l}</td><td className="right"><input type="number" value={f.costRates[l] || ''} onChange={(e) => set({ costRates: { ...f.costRates, [l]: Number(e.target.value) } })} style={{ width: 110, textAlign: 'right' }} aria-label={`${l} cost`} /></td></tr>)}</tbody></table>
            </fieldset>
          ) : <p className="muted small">Restricted.</p>}
        </Card>
        <Card title="AI" subtitle="Spec section 16: AI governance">
          <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="form-grid">
              <Field label="Claude model" hint="Used by the server when an API key is configured" full><input value={f.ai?.model || ''} onChange={(e) => set({ ai: { ...f.ai, model: e.target.value } })} /></Field>
              <Field label="AI on for new bids"><label className="check"><input type="checkbox" checked={f.ai?.defaultOn !== false} onChange={(e) => set({ ai: { ...f.ai, defaultOn: e.target.checked } })} /><span>On by default</span></label></Field>
              <Field label="Zero data retention"><label className="check"><input type="checkbox" checked={Boolean(f.ai?.zeroRetention)} onChange={(e) => set({ ai: { ...f.ai, zeroRetention: e.target.checked } })} /><span>Required</span></label></Field>
              <Field label="Processing region" full><input value={f.ai?.region || ''} onChange={(e) => set({ ai: { ...f.ai, region: e.target.value } })} /></Field>
            </div>
          </fieldset>
          <p className="mini">Every AI call is logged with the user, model, prompt version, sources and cost. Only approved library content and the bid’s own documents are sent; content confidential to another client is excluded.</p>
        </Card>
      </div>
      <Card title="Style guide" subtitle="Used by AI drafting and the output checks" actions={configure && style ? <div className="row"><button className="btn btn-sm" onClick={() => setStyle(null)}>Discard</button><button className="btn btn-sm btn-primary" onClick={() => dispatch('settings.update', { patch: { styleGuide: style } }, { success: 'Style guide saved' }).then(() => setStyle(null))}>Save</button></div> : null}>
        <fieldset disabled={!configure} style={{ border: 0, padding: 0, margin: 0 }}>
          <Field label="Tone" full><textarea rows={2} value={sg.tone} onChange={(e) => setStyle({ ...sg, tone: e.target.value })} /></Field>
          <Field label="Banned phrases (fail the checks)" full><TagInput value={sg.bannedPhrases} disabled={!configure} onChange={(v) => setStyle({ ...sg, bannedPhrases: v })} /></Field>
          <Field label="Preferred terms (warnings)" full>
            <table className="table"><tbody>{sg.preferredTerms.map((t, i) => <tr key={i}><td>Avoid <input value={t.avoid} onChange={(e) => setStyle({ ...sg, preferredTerms: sg.preferredTerms.map((x, j) => (j === i ? { ...x, avoid: e.target.value } : x)) })} aria-label="Avoid" /></td><td>use <input value={t.use} onChange={(e) => setStyle({ ...sg, preferredTerms: sg.preferredTerms.map((x, j) => (j === i ? { ...x, use: e.target.value } : x)) })} aria-label="Use" /></td><td>{configure && <button className="icon-btn" aria-label="Remove" onClick={() => setStyle({ ...sg, preferredTerms: sg.preferredTerms.filter((_, j) => j !== i) })}>✕</button>}</td></tr>)}</tbody></table>
            {configure && <button className="btn btn-sm" onClick={() => setStyle({ ...sg, preferredTerms: [...sg.preferredTerms, { avoid: '', use: '' }] })}>Add term</button>}
          </Field>
        </fieldset>
      </Card>
      <Card title="Library taxonomy" subtitle="Administrator-managed lists used for tagging, search filters and metadata suggestions (CL-03)" actions={configure && tax ? <div className="row"><button className="btn btn-sm" onClick={() => setTax(null)}>Discard</button><button className="btn btn-sm btn-primary" onClick={() => dispatch('taxonomy.set', { taxonomy: tax }, { success: 'Taxonomy saved' }).then(() => setTax(null))}>Save</button></div> : null}>
        <div className="form-grid">
          {Object.entries(TAXONOMY_LABELS).map(([k, l]) => <Field key={k} label={l} full><TagInput value={tx[k] || []} disabled={!configure} onChange={(v) => setTax({ ...tx, [k]: v })} /></Field>)}
        </div>
        <p className="mini">Clients are maintained from the bids that name them ({view.clients.length} clients).</p>
      </Card>
      <Card title="Records retention" subtitle="Applied by the server’s retention job">
        <dl className="kv">{Object.entries(s.retention || {}).map(([k, v]) => [<dt key={`${k}t`}>{k.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase())}</dt>, <dd key={`${k}d`}>{v}</dd>])}</dl>
      </Card>
      {admin && (
        <Card title="Data" subtitle={mode === 'server' ? 'Stored on the platform server (Australian hosting in production).' : 'This demonstration keeps its data in this browser (IndexedDB).'}>
          <div className="row">
            <button className="btn" onClick={exportJson}>Export all data (.json)</button>
            <div style={{ minWidth: 260 }}><FileDrop onFiles={importJson} accept=".json" multiple={false} label="Import an export (.json)" /></div>
            <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>Reset demonstration data</button>
          </div>
        </Card>
      )}
      {confirmReset && <Confirm title="Reset all data?" danger confirmLabel="Reset" requireText="Type RESET to confirm" onClose={() => setConfirmReset(false)} onConfirm={async (t) => { if (t.trim() !== 'RESET') { toast('Type RESET to confirm.', 'error'); throw new Error('not confirmed'); } await reset(); toast('Demonstration data restored', 'success'); }}><p>All bids, library changes, outputs and the audit trail are replaced with the fictitious demonstration data.</p></Confirm>}
    </div>
  );
}
