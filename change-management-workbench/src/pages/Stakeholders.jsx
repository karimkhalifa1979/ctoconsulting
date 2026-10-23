// Stakeholder master (STK-001 to STK-004, STK-046, STK-047, INT-009, PRT-005): one record for each person
// and stakeholder group, reused by every initiative. Find, add and edit stakeholders, maintain groups,
// import from spreadsheets with duplicate detection, and review and merge possible duplicates.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, Spinner, ErrorBox, Seg } from '../ui/core.jsx';
import DataGrid from '../ui/DataGrid.jsx';
import ImportWizard from '../ui/ImportWizard.jsx';
import { useLookups } from '../ui/RecordForm.jsx';
import { useRecordDrawer } from '../ui/RecordDrawer.jsx';
import { useApp, useDialog, useToast } from '../state/app.jsx';
import { useMutator } from '../state/initiative.jsx';
import { useEnterprise } from '../state/enterprise.jsx';
import { useTab } from '../lib/hooks.js';
import { fmtDate, label } from '../lib/format.js';
import { can, hasRole } from '../../shared/access.js';
import { asArray, personName, sortBy, uniq } from '../../shared/util.js';

export default function Stakeholders() {
  const { api, user } = useApp();
  const ent = useEnterprise();
  const [tab, setTab] = useTab('people');
  const [index, setIndex] = useState({});
  const [dupCount, setDupCount] = useState(null);
  const loadIndex = useCallback(() => api.op('stakeholderInitiatives', {}).then(setIndex).catch(() => setIndex({})), [api]);
  useEffect(() => { ent.ensure(); loadIndex(); api.op('duplicateScan', {}).then((d) => setDupCount(d.length)).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => { ent.refresh(); loadIndex(); };
  const people = (ent.records?.stakeholder || []).filter((s) => !s.mergedInto);
  const groups = ent.records?.stakeholderGroup || [];
  const canImport = can(user, 'C', 'stakeholder');
  return (
    <>
      <PageHead eyebrow="Enterprise" title="Stakeholders">
        The stakeholder master: one record for each person and group, shared by every initiative. Each initiative adds its own analysis in its stakeholder register; details kept here are the same everywhere.
      </PageHead>
      <Tabs value={tab} onChange={setTab} label="Stakeholders" tabs={[
        { id: 'people', label: 'People', icon: 'users', count: people.length || null },
        { id: 'groups', label: 'Stakeholder groups', icon: 'layers', count: groups.length || null },
        canImport && { id: 'import', label: 'Import', icon: 'upload' },
        { id: 'duplicates', label: 'Possible duplicates', icon: 'copy', count: dupCount || null },
      ]} />
      {!ent.records ? <Spinner label="Loading the stakeholder master" /> : (
        <>
          {tab === 'people' && <People people={people} index={index} refresh={refresh} />}
          {tab === 'groups' && <Groups groups={groups} refresh={refresh} />}
          {tab === 'import' && canImport && <Import refresh={refresh} />}
          {tab === 'duplicates' && <Duplicates refresh={refresh} onCount={setDupCount} />}
        </>
      )}
    </>
  );
}

function People({ people, index, refresh }) {
  const { user, config, initiatives } = useApp();
  const lookups = useLookups();
  const drawer = useRecordDrawer();
  const navigate = useNavigate();
  const iniName = useMemo(() => Object.fromEntries(initiatives.map((i) => [i.id, i.shortName || i.name])), [initiatives]);
  const orgs = uniq(people.map((s) => s.organisation).filter(Boolean)).sort();
  const editable = can(user, 'U', 'stakeholder');
  const cols = [
    { key: 'name', label: 'Name', render: (s) => <span><strong>{s.deidentified ? 'De-identified stakeholder' : personName(s)}</strong><span className="sub-line tiny muted">{s.positionTitle}</span></span>, value: (s) => `${s.familyName} ${s.givenName}` },
    { key: 'org', label: 'Organisation', render: (s) => <span>{s.organisation}<span className="sub-line tiny muted">{s.businessUnit && s.businessUnit !== s.organisation ? s.businessUnit : ''}</span></span>, value: (s) => s.organisation },
    { key: 'location', label: 'Location', render: (s) => s.location || <span className="muted">—</span>, value: (s) => s.location || '' },
    { key: 'type', label: 'Type', render: (s) => label('employmentType', s.employmentType, config), value: (s) => s.employmentType, hidden: true },
    { key: 'manager', label: 'Manager', render: (s) => lookups.nameOf('stakeholder', s.managerId) || <span className="muted">—</span>, value: (s) => lookups.nameOf('stakeholder', s.managerId) },
    { key: 'initiatives', label: 'Initiatives', render: (s) => <span className="btn-row">{asArray(index[s.id]).map((id) => <Badge key={id}>{iniName[id] || 'Initiative'}</Badge>)}</span>, value: (s) => asArray(index[s.id]).length },
    { key: 'status', label: 'Status', render: (s) => (s.status === 'active' ? <Badge tone="good">Active</Badge> : <Badge>{label('stakeholderStatus', s.status, config)}</Badge>), value: (s) => s.status },
    { key: 'source', label: 'Source', render: (s) => label('stakeholderSource', s.source, config), value: (s) => s.source, hidden: true },
    { key: 'email', label: 'Email', render: (s) => s.email || <span className="muted">—</span>, value: (s) => s.email || '', hidden: true },
    { key: 'updated', label: 'Updated', render: (s) => fmtDate(String(s.updatedAt || '').slice(0, 10)), value: (s) => s.updatedAt || '', hidden: true },
  ];
  return (
    <DataGrid id="stakeholder-master" type="stakeholder" title="Stakeholders" rows={sortBy(people, 'familyName', 'givenName')} columns={cols} exportName="Stakeholder master"
      searchKeys={[(s) => personName(s), 'positionTitle', 'organisation', 'businessUnit', 'location', 'email', 'code']}
      onRowClick={(s) => navigate(`/stakeholders/${s.id}`)} selectable={editable} bulkFields={editable ? ['status', 'location', 'businessUnit', 'employmentType'] : []} onChanged={refresh}
      facets={[
        { key: 'status', label: 'Status', options: ['active', 'inactive', 'left'].map((x) => ({ id: x, label: label('stakeholderStatus', x, config) })), value: (s) => s.status },
        { key: 'type', label: 'Type', options: ['employee', 'contractor', 'external'].map((x) => ({ id: x, label: label('employmentType', x, config) })), value: (s) => s.employmentType },
        ...(orgs.length > 1 ? [{ key: 'org', label: 'Organisation', options: orgs.map((o) => ({ id: o, label: o })), value: (s) => s.organisation }] : []),
        { key: 'ini', label: 'Initiative', options: [{ id: 'none', label: 'In no initiative' }, ...initiatives.map((i) => ({ id: i.id, label: i.shortName || i.name }))], value: (s) => (asArray(index[s.id]).length ? asArray(index[s.id]) : ['none']) },
      ]}
      toolbar={can(user, 'C', 'stakeholder') && <button type="button" className="btn btn-sm btn-primary" onClick={() => drawer.open({ type: 'stakeholder', defaults: { status: 'active', source: 'manual', employmentType: 'employee' }, onSaved: refresh })}><Icon name="plus" />Add stakeholder</button>}
      empty={<Empty icon="users" title="No stakeholders">Add stakeholders one by one, import them from a spreadsheet, or synchronise them from the HR system.</Empty>} />
  );
}

function Groups({ groups, refresh }) {
  const { api, user, config } = useApp();
  const drawer = useRecordDrawer();
  const [members, setMembers] = useState(null);
  useEffect(() => {
    api.list('membership', {}).then((r) => {
      const today = new Date().toISOString().slice(0, 10);
      const out = {};
      for (const m of r.rows) if (!m.to || m.to >= today) out[m.groupId] = (out[m.groupId] || 0) + 1;
      setMembers(out);
    }).catch(() => setMembers({}));
  }, [api, groups]);
  const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
  const path = (g) => { const out = []; let c = byId[g.parentId]; const seen = new Set(); while (c && !seen.has(c.id)) { out.unshift(c.name); seen.add(c.id); c = byId[c.parentId]; } return out.join(' › '); };
  const kinds = uniq(groups.map((g) => g.kind).filter(Boolean));
  return (
    <DataGrid id="stakeholder-groups" type="stakeholderGroup" title="Stakeholder groups" rows={sortBy(groups, (g) => path(g), 'name')} exportName="Stakeholder groups"
      onRowClick={(g) => drawer.open({ type: 'stakeholderGroup', id: g.id, onSaved: refresh })}
      columns={[
        { key: 'name', label: 'Group', render: (g) => <span><strong>{g.name}</strong><span className="sub-line tiny muted">{path(g)}</span></span>, value: (g) => g.name },
        { key: 'kind', label: 'Kind', render: (g) => cap(g.kind), value: (g) => g.kind || '' },
        { key: 'membership', label: 'Membership', render: (g) => (g.membershipType === 'dynamic' ? <Badge tone="info" title="Members are worked out from rules, for example business unit and location">Rule-based</Badge> : 'Listed members'), value: (g) => g.membershipType },
        { key: 'members', label: 'Members recorded', align: 'num', render: (g) => (g.membershipType === 'dynamic' ? '—' : members ? members[g.id] || 0 : '…'), value: (g) => members?.[g.id] || 0 },
        { key: 'headcount', label: 'Headcount', align: 'num', render: (g) => (g.headcount != null ? Number(g.headcount).toLocaleString('en-AU') : '—'), value: (g) => g.headcount ?? -1 },
        { key: 'org', label: 'Organisation', render: (g) => g.organisation || '—', value: (g) => g.organisation || '', hidden: true },
      ]}
      facets={kinds.length > 1 ? [{ key: 'kind', label: 'Kind', options: kinds.map((k) => ({ id: k, label: cap(k) })), value: (g) => g.kind }] : []}
      toolbar={can(user, 'C', 'stakeholderGroup') && <button type="button" className="btn btn-sm btn-primary" onClick={() => drawer.open({ type: 'stakeholderGroup', defaults: { membershipType: 'static', kind: 'team' }, onSaved: refresh })}><Icon name="plus" />Add group</button>}
      empty={<Empty icon="layers" title="No stakeholder groups">Groups such as divisions, branches, teams, roles and external forums let initiatives engage and analyse people together.</Empty>} />
  );
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');

function Import({ refresh }) {
  const [type, setType] = useState('stakeholder');
  return (
    <div className="stack">
      <Seg label="What to import" options={[{ id: 'stakeholder', label: 'Stakeholders' }, { id: 'stakeholderGroup', label: 'Stakeholder groups' }]} value={type} onChange={setType} />
      <ImportWizard key={type} type={type} onDone={refresh} />
    </div>
  );
}

// STK-046 / STK-047: review possible duplicates; merging keeps the history of both records.
function Duplicates({ refresh, onCount }) {
  const { api, user, config } = useApp();
  const mut = useMutator();
  const toast = useToast();
  const dialog = useDialog();
  const [pairs, setPairs] = useState(null);
  const [error, setError] = useState(null);
  const [swapped, setSwapped] = useState({});
  const load = useCallback(() => api.op('duplicateScan', {}).then((d) => { setPairs(d); onCount(d.length); setError(null); }).catch(setError), [api, onCount]);
  useEffect(() => { load(); }, [load]);
  const canMerge = hasRole(user, 'changeLead', 'admin');
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!pairs) return <Spinner label="Looking for duplicates" />;
  const merge = async (p) => {
    const [keep, dup] = swapped[p.id] ? [p.merge, p.keep] : [p.keep, p.merge];
    const ok = await dialog.confirm({ title: 'Merge stakeholders', message: `${dup.name} (${dup.code}) will be merged into ${keep.name} (${keep.code}). Every engagement, profile, relationship and other reference is moved to the kept record, gaps in its details are filled from the other, and the merged record is kept as inactive for the audit trail.`, confirmLabel: 'Merge' });
    if (!ok) return;
    try {
      const r = await mut.op('mergeStakeholders', { keepId: keep.id, mergeId: dup.id }, { quiet: true });
      toast.success(`Merged; ${r.updated} records now point to ${keep.name}`);
      refresh();
      load();
    } catch (e) { toast.error(e); }
  };
  const dismiss = async (p) => {
    try { await mut.op('dismissDuplicate', { aId: p.keep.id, bId: p.merge.id }, { quiet: true }); toast.success('Marked as different people'); load(); } catch (e) { toast.error(e); }
  };
  const side = (x, keep) => (
    <div className={`dup-side ${keep ? 'keep' : ''}`}>
      <div className="row-between"><Badge tone={keep ? 'good' : ''}>{keep ? 'Keep' : 'Merge into the kept record'}</Badge><span className="tiny muted">{x.code}</span></div>
      <h4><Link to={`/stakeholders/${x.id}`}>{x.name}</Link></h4>
      <div>{x.positionTitle || <span className="muted">No position</span>}</div>
      <div className="muted">{[x.organisation, x.businessUnit !== x.organisation ? x.businessUnit : ''].filter(Boolean).join(' · ')}</div>
      <div>{x.email || <span className="muted">No email</span>}</div>
      <div className="tiny muted mt-1">Source: {label('stakeholderSource', x.source, config)} · updated {fmtDate(String(x.updatedAt || '').slice(0, 10))}</div>
    </div>
  );
  return (
    <Card title="Possible duplicates" sub="Records that share an email address, or a name and organisation. The record from the HR system, or with an email address, is suggested as the one to keep." flush
      actions={<button type="button" className="btn btn-sm" onClick={load}><Icon name="refresh" />Check again</button>}>
      {!pairs.length ? <Empty icon="checkCircle" title="No possible duplicates">New records and imports are checked as they are entered.</Empty> : pairs.map((p) => {
        const [a, b] = swapped[p.id] ? [p.merge, p.keep] : [p.keep, p.merge];
        return (
          <div key={p.id} className="dup-pair">
            {side(a, true)}
            <div className="dup-arrow">
              <span className="btn-row" style={{ flexDirection: 'column' }}>{p.reasons.map((r) => <Badge key={r} tone="warning">{r}</Badge>)}</span>
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => setSwapped({ ...swapped, [p.id]: !swapped[p.id] })}><Icon name="refresh" />Swap</button>
              {canMerge && <button type="button" className="btn btn-sm btn-primary" onClick={() => merge(p)}>Merge</button>}
              <button type="button" className="btn btn-xs" onClick={() => dismiss(p)}>Not a duplicate</button>
            </div>
            {side(b, false)}
          </div>
        );
      })}
      {!canMerge && pairs.length > 0 && <div className="card-pad small muted">A change management lead or administrator merges duplicates.</div>}
    </Card>
  );
}
