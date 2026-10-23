// Privacy and retention (ADM-004, ADM-006, PRV-02 to PRV-06, REC-02): privacy settings, which fields are
// sensitive, collection notices, the retention schedule with a check of what is due and its application,
// legal holds, and finding everything held about a person for access and correction requests.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, Tabs, Badge, Empty, Spinner } from '../../ui/core.jsx';
import { RefPicker } from '../../ui/fields.jsx';
import { useLookups } from '../../ui/RecordForm.jsx';
import { useApp, useDialog, useToast } from '../../state/app.jsx';
import { useMutator } from '../../state/initiative.jsx';
import { saveBlob } from '../../data/client.js';
import { useSaveConfig } from './Admin.jsx';
import { useTab } from '../../lib/hooks.js';
import { fmtDate, fmtDateTime } from '../../lib/format.js';
import { entity, fieldsOf } from '../../../shared/schema.js';
import { hasRole } from '../../../shared/access.js';
import { asArray, clone, uid } from '../../../shared/util.js';

export default function Privacy() {
  const { user } = useApp();
  const [tab, setTab] = useTab('settings');
  const admin = hasRole(user, 'admin');
  return (
    <div className="stack">
      <Tabs value={tab} onChange={setTab} label="Privacy and retention" tabs={[
        { id: 'settings', label: 'Privacy settings', icon: 'lock' },
        { id: 'sensitive', label: 'Sensitive fields', icon: 'eyeOff' },
        { id: 'notices', label: 'Collection notices', icon: 'file' },
        { id: 'retention', label: 'Retention', icon: 'archive' },
        { id: 'holds', label: 'Legal holds', icon: 'scale' },
        { id: 'requests', label: 'Access requests', icon: 'search' },
      ]} />
      {tab === 'settings' && <PrivacySettings readOnly={!admin} />}
      {tab === 'sensitive' && <SensitiveFields readOnly={!admin} />}
      {tab === 'notices' && <Notices readOnly={!admin} />}
      {tab === 'retention' && <Retention readOnly={!admin} />}
      {tab === 'holds' && <Holds />}
      {tab === 'requests' && <Requests />}
    </div>
  );
}

function SaveBar({ dirty, saving, onSave, onUndo, readOnly }) {
  if (readOnly) return <p className="small muted">Your role can view these settings; an administrator changes them.</p>;
  return <div className="btn-row"><button type="button" className="btn" disabled={!dirty || saving} onClick={onUndo}>Undo changes</button><button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={onSave}><Icon name="check" />{saving ? 'Saving…' : 'Save'}</button></div>;
}

function PrivacySettings({ readOnly }) {
  const { settings } = useApp();
  const { save, saving } = useSaveConfig();
  const [p, setP] = useState(() => clone(settings.privacy || {}));
  const dirty = JSON.stringify(p) !== JSON.stringify(settings.privacy || {});
  return (
    <Card title="Privacy settings" sub="Data minimisation and guidance for everyone who records information about people.">
      <div className="stack">
        <label className="check"><input type="checkbox" disabled={readOnly} checked={!!p.groupLevelOnly} onChange={(e) => setP({ ...p, groupLevelOnly: e.target.checked })} /><span><strong>Analyse groups only.</strong> Turns off influence, interest and engagement ratings of named individuals across the organisation (PRV-03, STK-018). Initiatives can also choose this for themselves.</span></label>
        <label className="field"><span>Change practitioners see sensitive fields for</span><select disabled={readOnly} value={p.practitionerSensitiveScope || 'assigned'} onChange={(e) => setP({ ...p, practitionerSensitiveScope: e.target.value })}><option value="assigned">Only the stakeholders they look after</option><option value="all">Every stakeholder in their initiatives</option></select></label>
        <label className="field"><span>Guidance shown with free-text fields (PRV-04)</span><textarea disabled={readOnly} rows={3} value={p.freeTextGuidance || ''} onChange={(e) => setP({ ...p, freeTextGuidance: e.target.value })} /></label>
        <p className="small muted" style={{ margin: 0 }}>Survey results are shown only for groups of {settings.adkar?.minSegment ?? 5} or more; change this under Settings and thresholds › ADKAR results.</p>
        <SaveBar readOnly={readOnly} dirty={dirty} saving={saving} onUndo={() => setP(clone(settings.privacy || {}))} onSave={() => save('settings', { ...settings, privacy: p }, 'Privacy settings saved')} />
      </div>
    </Card>
  );
}

const SENS_TYPES = ['profile', 'stakeholder', 'engagement', 'assessment', 'resistance', 'feedback'];

function SensitiveFields({ readOnly }) {
  const { settings, config } = useApp();
  const { save, saving } = useSaveConfig();
  const [s, setS] = useState(() => clone(settings.sensitiveFields || {}));
  const dirty = JSON.stringify(s) !== JSON.stringify(settings.sensitiveFields || {});
  return (
    <Card title="Sensitive fields" sub="Field-level security (ADM-004, SEC-02): sensitive fields are seen and changed only by change management leads and, for their stakeholders, change practitioners. They are left out of artefacts and exports unless deliberately included, and every view is audited.">
      <div className="grid g-2">
        {SENS_TYPES.map((t) => {
          const fields = fieldsOf(t, { ...config, settings: { ...settings, sensitiveFields: {} } }).filter((f) => !f.system && !f.hidden && !f.readOnly && !['json'].includes(f.type));
          const chosen = asArray(s[t]);
          return (
            <fieldset key={t} className="fieldset">
              <legend>{entity(t).plural}</legend>
              <div className="col-picker" style={{ maxHeight: 200 }}>
                {fields.map((f) => <label key={f.key} className="check small"><input type="checkbox" disabled={readOnly} checked={chosen.includes(f.key)} onChange={(e) => setS({ ...s, [t]: e.target.checked ? [...chosen, f.key] : chosen.filter((k) => k !== f.key) })} /><span>{f.label}</span></label>)}
              </div>
            </fieldset>
          );
        })}
      </div>
      <div className="mt-3"><SaveBar readOnly={readOnly} dirty={dirty} saving={saving} onUndo={() => setS(clone(settings.sensitiveFields || {}))} onSave={() => save('settings', { ...settings, sensitiveFields: s }, 'Sensitive fields saved')} /></div>
    </Card>
  );
}

function Notices({ readOnly }) {
  const { settings } = useApp();
  const { save, saving } = useSaveConfig();
  const [list, setList] = useState(() => clone(asArray(settings.collectionNotices)));
  const dirty = JSON.stringify(list) !== JSON.stringify(asArray(settings.collectionNotices));
  const upd = (i, patch) => setList(list.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  const newVersion = (n) => {
    const [maj, min] = String(n.version || '1.0').split('.').map(Number);
    setList([...list, { ...n, id: uid('cn'), version: `${maj}.${(min || 0) + 1}`, replaces: n.id }]);
  };
  return (
    <Card title="Collection notices" sub="Shown when information about a person is first collected and on surveys; each stakeholder record keeps which notice applied and when (PRV-02). To change the wording of a notice people have already seen, add a new version so the record of what they were told stays accurate.">
      <div className="stack">
        {list.map((n, i) => (
          <fieldset key={n.id} className="fieldset">
            <legend>{n.title || 'Notice'} · version {n.version}</legend>
            <div className="form-grid">
              <label className="field"><span>Title</span><input disabled={readOnly} value={n.title} onChange={(e) => upd(i, { title: e.target.value })} /></label>
              <label className="field"><span>Version</span><input disabled={readOnly} value={n.version} onChange={(e) => upd(i, { version: e.target.value })} style={{ width: 100 }} /></label>
              <label className="field" style={{ gridColumn: '1 / -1' }}><span>Text</span><textarea disabled={readOnly} rows={4} value={n.text} onChange={(e) => upd(i, { text: e.target.value })} /></label>
            </div>
            {!readOnly && <div className="btn-row mt-2"><button type="button" className="btn btn-sm" onClick={() => newVersion(n)}><Icon name="copy" />New version</button>{n.replaces && <Badge>Replaces an earlier version</Badge>}</div>}
          </fieldset>
        ))}
        {!readOnly && <div><button type="button" className="btn btn-sm" onClick={() => setList([...list, { id: uid('cn'), title: 'New notice', version: '1.0', text: '' }])}><Icon name="plus" />Add a notice</button></div>}
        <SaveBar readOnly={readOnly} dirty={dirty} saving={saving} onUndo={() => setList(clone(asArray(settings.collectionNotices)))} onSave={() => save('settings', { ...settings, collectionNotices: list }, 'Collection notices saved')} />
      </div>
    </Card>
  );
}

const RET_LABELS = {
  stakeholderPersonalInfo: 'Stakeholder personal information', engagement: 'Engagement records', surveyResponse: 'Survey responses',
  artefactDraft: 'Draft and superseded artefacts', artefactApproved: 'Approved artefacts', auditEvent: 'Audit events',
};
const AFTER = { initiativeClosure: 'after the initiative closes', surveyClose: 'after the survey closes', created: 'after creation', approval: 'after approval' };
const ACTIONS = { retain: 'Keep', deidentify: 'De-identify', delete: 'Delete securely' };

function Retention({ readOnly }) {
  const { api, settings } = useApp();
  const { save, saving } = useSaveConfig();
  const toast = useToast();
  const dialog = useDialog();
  const [r, setR] = useState(() => clone(settings.retention || {}));
  const [due, setDue] = useState(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(r) !== JSON.stringify(settings.retention || {});
  const check = async (dryRun = true) => {
    if (!dryRun && !(await dialog.confirm({ title: 'Apply the retention schedule', message: 'The actions listed are carried out now and recorded in the disposal record. Deleted and de-identified information cannot be recovered. Initiatives on legal hold are skipped.', confirmLabel: 'Apply now', danger: true }))) return;
    setBusy(true);
    try { const res = await api.op('applyRetention', { dryRun }); setDue(res); if (!dryRun) toast.success(`${res.actions.filter((a) => a.kind !== 'skip').length} actions applied`); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <>
      <Card title="Retention schedule" sub="How long each kind of record is kept and what happens afterwards (ADM-006, PRV-06). Approved artefacts are kept as business records (REC-01).">
        <table className="tbl">
          <thead><tr><th>Records</th><th>Keep for (years)</th><th>Then</th><th>Counted from</th></tr></thead>
          <tbody>
            {Object.entries(r).map(([k, v]) => (
              <tr key={k}>
                <td><strong>{RET_LABELS[k] || k}</strong></td>
                <td><input type="number" aria-label={`Years for ${RET_LABELS[k] || k}`} disabled={readOnly} min={0} max={100} value={v.years} onChange={(e) => setR({ ...r, [k]: { ...v, years: Number(e.target.value) } })} style={{ width: 80 }} /></td>
                <td><select aria-label={`Action for ${RET_LABELS[k] || k}`} disabled={readOnly || ['artefactApproved', 'auditEvent'].includes(k)} value={v.action} onChange={(e) => setR({ ...r, [k]: { ...v, action: e.target.value } })}>{Object.entries(ACTIONS).filter(([a]) => a !== 'deidentify' || ['stakeholderPersonalInfo', 'engagement'].includes(k)).map(([a, l]) => <option key={a} value={a}>{l}</option>)}</select></td>
                <td className="small">{AFTER[v.after] || v.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3"><SaveBar readOnly={readOnly} dirty={dirty} saving={saving} onUndo={() => setR(clone(settings.retention || {}))} onSave={() => save('settings', { ...settings, retention: r }, 'Retention schedule saved')} /></div>
      </Card>
      <Card title="What is due" sub="The scheduler checks every night; on the server it applies the schedule automatically only when that is configured." actions={!readOnly && <div className="btn-row"><button type="button" className="btn btn-sm" disabled={busy || dirty} onClick={() => check(true)}><Icon name="search" />Check what is due</button>{due?.actions?.some((a) => a.kind !== 'skip') && <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => check(false)}>Apply now</button>}</div>} flush>
        {!due ? <div className="card-pad small muted">{readOnly ? 'An administrator runs this check.' : dirty ? 'Save the schedule first.' : 'Check to see which records have reached the end of their retention period.'}</div> : !due.actions.length ? <Empty icon="checkCircle" title="Nothing is due">No records have reached the end of their retention period.</Empty> : (
          <table className="tbl tbl-compact">
            <thead><tr><th>Action</th><th>Detail</th></tr></thead>
            <tbody>{due.actions.map((a, i) => <tr key={i}><td><Badge tone={a.kind === 'delete' ? 'critical' : a.kind === 'deidentify' ? 'warning' : ''}>{a.kind === 'skip' ? 'Skipped' : ACTIONS[a.kind] || a.kind}</Badge></td><td className="small">{a.detail}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function Holds() {
  const { api, user } = useApp();
  const mut = useMutator();
  const toast = useToast();
  const dialog = useDialog();
  const [rows, setRows] = useState(null);
  const load = useCallback(() => api.op('initiativeList', {}).then(setRows).catch(() => setRows([])), [api]);
  useEffect(() => { load(); }, [load]);
  const can = hasRole(user, 'admin', 'changeLead');
  const toggle = async (r) => {
    const reason = await dialog.prompt({ title: r.legalHold ? `Release the hold on ${r.name}` : `Place ${r.name} on legal hold`, label: 'Reason', confirmLabel: r.legalHold ? 'Release' : 'Place on hold' });
    if (!reason) return;
    try { await mut.op('setLegalHold', { id: r.id, hold: !r.legalHold, reason }, { quiet: true }); toast.success(r.legalHold ? 'Hold released' : 'Hold placed'); load(); } catch (e) { toast.error(e); }
  };
  return (
    <Card title="Legal holds" sub="While a hold applies, none of the initiative's records are de-identified or deleted under the retention schedule (REC-02)." flush>
      {!rows ? <Spinner /> : (
        <table className="tbl">
          <thead><tr><th>Initiative</th><th>Status</th><th>Hold</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td><strong>{r.name}</strong></td><td className="small">{r.status === 'closed' ? `Closed ${fmtDate(String(r.closedAt || '').slice(0, 10))}` : 'Active'}</td><td>{r.legalHold ? <Badge tone="info" icon="lock">On hold</Badge> : <span className="muted small">None</span>}</td><td>{can && <button type="button" className="btn btn-xs" onClick={() => toggle(r)}>{r.legalHold ? 'Release' : 'Place on hold'}</button>}</td></tr>)}</tbody>
        </table>
      )}
    </Card>
  );
}

// PRV-05: find everything held about one person, to answer access and correction requests.
function Requests() {
  const { api, user } = useApp();
  const lookups = useLookups();
  const toast = useToast();
  const [sid, setSid] = useState(null);
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const allowed = hasRole(user, 'admin', 'changeLead');
  const search = async () => {
    setBusy(true); setFound(null);
    try { setFound(await api.op('personalInformation', { stakeholderId: sid })); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const exportJson = () => saveBlob(new Blob([JSON.stringify(found, null, 2)], { type: 'application/json' }), `Personal information ${found.stakeholder.code}.json`);
  if (!allowed) return <Card title="Access and correction requests"><p className="small">A change management lead or administrator searches for personal information.</p></Card>;
  const counts = found ? Object.entries(found.records.reduce((a, r) => ({ ...a, [r.label]: (a[r.label] || 0) + 1 }), {})) : [];
  return (
    <Card title="Access and correction requests" sub="Find every record that holds information about a person, across all initiatives, to give them a copy or correct it (PRV-05). Searches are recorded in the audit trail.">
      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field" style={{ minWidth: 320, flex: 1 }}><span>Person</span><RefPicker value={sid} onChange={setSid} options={lookups.optionsFor('stakeholder')} search={lookups.search?.stakeholder} placeholder="Search by name" /></label>
        <button type="button" className="btn btn-primary" disabled={!sid || busy} onClick={search}><Icon name="search" />{busy ? 'Searching…' : 'Find personal information'}</button>
      </div>
      {found && (
        <div className="mt-3 stack-sm">
          <p style={{ margin: 0 }}><strong>{found.records.length} records</strong> refer to {found.stakeholder.preferredName || found.stakeholder.givenName} {found.stakeholder.familyName} ({found.stakeholder.code}).</p>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{counts.map(([k, n]) => <li key={k}>{k}: {n}</li>)}</ul>
          <div className="btn-row"><button type="button" className="btn btn-sm" onClick={exportJson}><Icon name="download" />Export everything (JSON)</button><Link className="btn btn-sm" to={`/stakeholders/${found.stakeholder.id}`}>Open the profile to correct or de-identify</Link></div>
          <p className="tiny muted" style={{ margin: 0 }}>Searched {fmtDateTime(new Date().toISOString())}.</p>
        </div>
      )}
    </Card>
  );
}
