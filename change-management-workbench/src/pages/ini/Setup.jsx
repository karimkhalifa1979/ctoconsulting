// Define Success (INI-001 to INI-011): initiative definition, case for change, definition of success and
// scope; objectives and success measures; releases and milestones with Microsoft Project import;
// decisions and assumptions; who has access.
import { useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner } from '../../ui/core.jsx';
import RecordForm from '../../ui/RecordForm.jsx';
import Register from '../../ui/Register.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, label } from '../../lib/format.js';
import { roleLabel } from '../../../shared/access.js';
import { asArray } from '../../../shared/util.js';
import { saveBlob } from '../../data/client.js';

export default function Setup() {
  const { m, ini, canDo } = useIniPage();
  const [tab, setTab] = useTab('definition');
  if (!m) return <Spinner />;
  return (
    <>
      <PageHead eyebrow="Phase 1 · Define Success" title="Definition and success">
        What the change must achieve, why it is needed now, how adoption will be recognised and how success will be measured.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'definition', label: 'Definition' },
        { id: 'success', label: 'Objectives and measures', count: m.objectives.length + m.measures.length },
        { id: 'milestones', label: 'Releases and milestones', count: m.milestones.length },
        { id: 'decisions', label: 'Decisions and assumptions', count: m.decisions.length },
        { id: 'access', label: 'Team and access' },
      ]} />
      {tab === 'definition' && (
        <Card title="Initiative definition" sub="Sections map to the Change Management Strategy and the Master Change Management Plan.">
          <RecordForm type="initiative" record={ini.initiative} readOnly={!canDo('U', 'initiative', ini.initiative)} exclude={['selectedPlans', 'planRationale', 'customPlans', 'coverageAcks', 'closedAt', 'legalHold', 'templateOf']} showHidden={['aiEnabled', 'groupLevelOnly']} saveLabel="Save definition" />
        </Card>
      )}
      {tab === 'success' && (
        <div className="stack">
          <Register type="objective" title="Objectives" sub="What the change must achieve, with the organisational benefits (INI-003)." />
          <Register type="measure" title="Success measures" sub="Organisational, individual and change management performance measures with baselines and targets (INI-004). Record values on the Measurement page." facets={['category', 'subtype']} />
        </div>
      )}
      {tab === 'milestones' && <Milestones />}
      {tab === 'decisions' && <Register type="decision" title="Decisions and assumptions" sub="Who decided what and why (INI-007)." facets={['kind']} defaultSort={{ key: 'date', dir: 'desc' }} />}
      {tab === 'access' && <Access />}
    </>
  );
}

function Milestones() {
  const { m, ini, mut, toast, canDo } = useIniPage();
  const [importing, setImporting] = useState(null);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const format = /\.xml$/i.test(file.name) ? 'mspdi' : 'csv';
    try {
      const res = await mut.op('importMilestones', { initiativeId: ini.id, format, content: text, mode: 'validate' }, { quiet: true });
      setImporting({ format, content: text, report: res.report, name: file.name });
    } catch (err) { toast.error(err); }
  };
  const commit = async () => {
    const res = await mut.op('importMilestones', { initiativeId: ini.id, format: importing.format, content: importing.content, mode: 'commit' });
    toast.success(`${res.created} milestones created, ${res.updated} updated. Dependent engagements and activities were rescheduled where needed.`);
    setImporting(null);
  };
  const exportXml = async () => {
    const { toMspdi } = await import('../../../shared/integrations/msproject.js');
    saveBlob(new Blob([toMspdi({ initiative: ini.initiative, milestones: m.milestones, activities: [] })], { type: 'application/xml' }), `${ini.initiative.shortName || ini.initiative.name} milestones.xml`);
  };
  return (
    <div className="stack">
      <div className="callout small">
        Engagements and activities can be scheduled relative to a milestone. When a milestone date changes, they move with it and their owners are notified (STK-023, AC-04).
      </div>
      <Register type="milestone" title="Releases and milestones" defaultSort={{ key: 'date', dir: 'asc' }} facets={['kind', 'status']}
        toolbar={(
          <>
            {canDo('C', 'milestone') && <label className="btn btn-sm"><Icon name="upload" />Import from Microsoft Project<input type="file" accept=".xml,.csv" hidden onChange={pick} /></label>}
            <button type="button" className="btn btn-sm" onClick={exportXml}><Icon name="download" />Export (MSPDI)</button>
          </>
        )} />
      {importing && (
        <Card title={`Import preview: ${importing.name}`} sub="Nothing is changed until you confirm. Matching is by project reference, then by name (INI-006, PLN-008)." actions={<><button type="button" className="btn" onClick={() => setImporting(null)}>Cancel</button><button type="button" className="btn btn-primary" onClick={commit} disabled={!importing.report.some((r) => r.action !== 'unchanged')}>Apply changes</button></>} flush>
          <table className="tbl">
            <thead><tr><th>Milestone</th><th>Type</th><th>Date</th><th>Action</th></tr></thead>
            <tbody>{importing.report.map((r, i) => (
              <tr key={i}><td>{r.name}</td><td>{label('milestoneKind', r.kind)}</td><td>{r.from && r.action === 'update' ? <>{fmtDate(r.from)} → <strong>{fmtDate(r.date)}</strong></> : fmtDate(r.date)}</td>
                <td><StatusBadge status={r.action === 'create' ? 'planned' : r.action === 'update' ? 'atRisk' : 'complete'} labelText={r.action === 'create' ? 'Create' : r.action === 'update' ? 'Update date' : 'No change'} /></td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Access() {
  const { ini, users, m } = useIniPage();
  const assigned = users.filter((u) => asArray(u.initiativeIds).includes(ini.id) || asArray(u.roles).some((r) => ['portfolio', 'auditor'].includes(r)));
  const team = asArray(m.strategy?.changeTeam);
  return (
    <div className="grid g-2">
      <Card title="People with access" sub="Access is granted per initiative by an administrator; portfolio managers and auditors see every initiative (SEC-02)." flush>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Roles</th><th>Access</th></tr></thead>
          <tbody>{assigned.map((u) => (
            <tr key={u.id}><td>{u.name}<div className="tiny muted">{u.email}</div></td><td className="small">{asArray(u.roles).map(roleLabel).join(', ')}</td><td>{asArray(u.initiativeIds).includes(ini.id) ? <Badge tone="teal">Assigned</Badge> : <Badge>All initiatives</Badge>}</td></tr>
          ))}</tbody>
        </table>
      </Card>
      <Card title="Change team" sub="From the Change Management Strategy (STR-003)." flush>
        {team.length ? (
          <table className="tbl"><thead><tr><th>Role</th><th>Person</th><th className="num">FTE</th></tr></thead>
            <tbody>{team.map((t, i) => <tr key={i}><td>{t.role}<div className="tiny muted">{t.responsibilities}</div></td><td>{t.person}</td><td className="num">{t.allocation ?? '—'}</td></tr>)}</tbody></table>
        ) : <Empty icon="users" title="No change team recorded">Record it in the Strategy.</Empty>}
      </Card>
    </div>
  );
}
