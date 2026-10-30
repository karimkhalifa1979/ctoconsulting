// Project tabs built from the registers: scope and quality, RAID, change, resources, lessons and documents.
import { useState } from 'react';
import { useProject } from './Project.jsx';
import { useApi } from '../../lib/hooks.js';
import { Register } from '../../components/Record.jsx';
import RaidView from '../../components/Raid.jsx';
import { Async, Card, Table, Tile, Money, Status, D, Empty } from '../../components/ui.jsx';
import { fmtMoneyShort } from '../../../shared/format.js';

function Subtabs({ tabs, value, onChange }) {
  return <div className="subtabs">{tabs.map(([k, l]) => <button key={k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

const useScope = () => {
  const { id, engId } = useProject();
  return { scope: { engagement_id: engId, project_id: id }, defaults: { project_id: id } };
};

export function Scope() {
  const { scope, defaults } = useScope();
  const [tab, setTab] = useState('deliverables');
  return (
    <div className="stack">
      <Subtabs value={tab} onChange={setTab} tabs={[['deliverables', 'Deliverables'], ['scope', 'Scope statement'], ['quality', 'Quality reviews'], ['benefits', 'Benefits']]} />
      {tab === 'deliverables' && <Register entity="deliverable" scope={scope} defaults={defaults} sub="Product descriptions, acceptance criteria, internal quality review before submission, client acceptance or rejection with evidence (SCP-002..005, QLT-004)." />}
      {tab === 'scope' && <Register entity="scope_item" scope={scope} defaults={defaults} sub="In-scope and out-of-scope statements; approved changes add items (SCP-001)." />}
      {tab === 'quality' && <Register entity="quality_review" scope={scope} defaults={defaults} sub="Peer and quality reviews with findings tracked to closure; a passed review is needed before submission to the client (QLT-001..004)." />}
      {tab === 'benefits' && <Register entity="benefit" scope={scope} defaults={defaults} sub="Benefits this project contributes to, with measures and owners (BEN-001..005)." />}
    </div>
  );
}

export function ProjectRaid() {
  const { id, engId, p } = useProject();
  return <RaidView engagementId={engId} projectId={id} title={p.name} />;
}

export function ProjectChanges() {
  const { id } = useProject();
  const { scope, defaults } = useScope();
  const log = useApi(`/api/projects/${id}/change-log`);
  return (
    <div className="stack">
      <Async q={log}>{(l) => (
        <div className="grid g-3">
          <Tile label="Approved variations" value={fmtMoneyShort(l.approvedVariations)} sub={`${l.rows.filter((r) => r.approved).length} approved changes`} />
          <Tile label="In progress" value={l.rows.filter((r) => ['Draft', 'Submitted', 'Under assessment', 'Awaiting approval'].includes(r.status)).length} sub="Not yet in the baseline (CHG-006)" />
          <Tile label="Schedule impact approved" value={`${l.rows.filter((r) => r.approved).reduce((a, r) => a + (Number(r.impact_schedule_days) || 0), 0)} days`} />
        </div>
      )}</Async>
      <Register entity="change" scope={scope} defaults={defaults} sub="Impact on scope, schedule, cost, price, risk and benefits; priced from the rate cards and routed by change authority (CHG-001..009)." onChanged={log.reload} />
      <Async q={log}>{(l) => (
        <Card title="Change log" flush>
          <Table rows={l.rows} empty="No changes yet." columns={[
            { key: 'ref', label: 'ID' },
            { key: 'title', label: 'Change' },
            { key: 'raised_date', label: 'Raised', render: (r) => <D v={r.raised_date} /> },
            { key: 'status', label: 'Status', render: (r) => <Status v={r.status} /> },
            { key: 'impact_price', label: 'Price impact', num: true, render: (r) => <Money v={r.impact_price} /> },
            { key: 'impact_schedule_days', label: 'Days', num: true },
            { key: 'cumulative', label: 'Cumulative approved', num: true, render: (r) => <Money v={r.cumulative} /> },
          ]} />
        </Card>
      )}</Async>
    </div>
  );
}

export function Resources() {
  const { scope, defaults } = useScope();
  const [tab, setTab] = useState('allocations');
  return (
    <div className="stack">
      <Subtabs value={tab} onChange={setTab} tabs={[['allocations', 'Allocations'], ['requests', 'Resource requests']]} />
      {tab === 'allocations' && <Register entity="allocation" scope={scope} defaults={defaults} sub="Named people or placeholder roles, hours per week, dates and charge-out role; tentative allocations show separately in capacity (RES-004..006)." />}
      {tab === 'requests' && <Register entity="resource_request" scope={scope} defaults={defaults} sub="Role, skills, clearance, dates and hours; the resource manager proposes and fulfils (RES-003, RES-007)." />}
    </div>
  );
}

export function Lessons() {
  const { id } = useProject();
  const { scope, defaults } = useScope();
  const suggest = useApi(`/api/projects/${id}/lessons-suggest`);
  return (
    <div className="stack">
      <Register entity="lesson" scope={scope} defaults={defaults} sub="Capture lessons at any time, at gates and at closure; publish a de-identified summary to the knowledge base (LSN-001..003)." />
      <Card title="Lessons from similar engagements (LSN-004)">
        <Async q={suggest}>{(list) => (!list.length ? <Empty>No published lessons match this project yet.</Empty> : (
          <ul className="list">{list.map((l) => <li key={l.id}><div className="grow"><b>{l.title}</b><div className="small">{l.summary}</div><div className="tiny muted">{l.category}{l.tags?.length ? ` · ${l.tags.join(', ')}` : ''}</div></div></li>)}</ul>
        ))}</Async>
      </Card>
    </div>
  );
}

export function Documents() {
  const { scope, defaults } = useScope();
  return <Register entity="document" scope={scope} defaults={defaults} sub="Links to documents in the Firm repository with version, owner and sensitivity label; uploads are scanned for malware (DOC-001..006)." />;
}
