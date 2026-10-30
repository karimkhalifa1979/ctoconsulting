// Engagement tabs built from the registers: RAID, change, governance, commercial and details.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEngagement } from './Engagement.jsx';
import { useApi } from '../../lib/hooks.js';
import { Register, RecordView, RecordDrawer } from '../../components/Record.jsx';
import RaidView from '../../components/Raid.jsx';
import { Card, Tile, Table, Money, Status, D, Async, Meter, Empty } from '../../components/ui.jsx';
import { fmtMoneyShort, fmtPct, fmtDate } from '../../../shared/format.js';
import Icon from '../../components/Icon.jsx';

export function EngRaid() {
  const { id } = useEngagement();
  return <RaidView engagementId={id} title="Engagement RAID" />;
}

export function EngChanges() {
  const { id } = useEngagement();
  const log = useApi(`/api/engagements/${id}/change-log`);
  return (
    <div className="stack">
      <Async q={log}>{(l) => (
        <div className="grid g-3">
          <Tile label="Original contract value" value={fmtMoneyShort(l.original)} />
          <Tile label="Approved variations (CHG-007)" value={fmtMoneyShort(l.approvedVariations)} sub={`${l.rows.filter((r) => r.approved).length} approved changes`} />
          <Tile label="Current contract value" value={fmtMoneyShort(l.current)} />
        </div>
      )}</Async>
      <Register entity="change" scope={{ engagement_id: id }} title="Change requests" sub="Priced from the rate cards; routed by change authority; approved changes update baselines and create a draft variation (CHG-001..009)." onChanged={log.reload} />
      <Async q={log}>{(l) => (
        <Card title="Change log" sub="Cumulative approved variations against the original contract value." flush>
          <Table rows={l.rows} columns={[
            { key: 'ref', label: 'ID' },
            { key: 'title', label: 'Change', render: (r) => (r.project_id ? <Link to={`/projects/${r.project_id}/changes?open=${r.id}&entity=change`}>{r.title}</Link> : r.title) },
            { key: 'raised_date', label: 'Raised', render: (r) => <D v={r.raised_date} /> },
            { key: 'status', label: 'Status', render: (r) => <Status v={r.status} /> },
            { key: 'impact_price', label: 'Price impact', num: true, render: (r) => <Money v={r.impact_price} /> },
            { key: 'impact_schedule_days', label: 'Days', num: true },
            { key: 'cumulative', label: 'Cumulative approved', num: true, render: (r) => <Money v={r.cumulative} /> },
            { key: 'contract_value_after', label: 'Contract value after', num: true, render: (r) => <Money v={r.contract_value_after} /> },
          ]} />
        </Card>
      )}</Async>
    </div>
  );
}

export function Governance() {
  const { id } = useEngagement();
  const [tab, setTab] = useState('stakeholders');
  const scope = { engagement_id: id };
  const tabs = [['stakeholders', 'Stakeholders'], ['comms', 'Communication plan'], ['meetings', 'Meetings'], ['distribution', 'Distribution lists'], ['scope', 'Scope statement'], ['documents', 'Documents'], ['lessons', 'Lessons'], ['benefits', 'Benefits'], ['satisfaction', 'Client satisfaction'], ['growth', 'Growth opportunities']];
  return (
    <div className="stack">
      <div className="subtabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'stakeholders' && <Stakeholders scope={scope} />}
      {tab === 'comms' && <Register entity="comm_plan" scope={scope} sub="Who needs what information, when and how; last delivered updates when a report is distributed (STK-002, STK-003)." />}
      {tab === 'meetings' && <Register entity="meeting" scope={scope} sub="Steering committees, project boards and workshops with agendas and minutes (STK-005)." />}
      {tab === 'distribution' && <Register entity="distribution_list" scope={scope} sub="Recipients for each report type; reports are distributed only to the list unless an exception is authorised (STK-004, RPT-046)." />}
      {tab === 'scope' && <Register entity="scope_item" scope={scope} sub="In and out of scope statements by project; approved changes add items (SCP-001)." />}
      {tab === 'documents' && <Register entity="document" scope={scope} sub="Links to the Firm repository with versions and sensitivity labels (DOC-001..006)." />}
      {tab === 'lessons' && <Register entity="lesson" scope={scope} sub="Lessons from every project; publish a summary to the Firm knowledge base (LSN-001..005)." />}
      {tab === 'benefits' && <Register entity="benefit" scope={scope} sub="Benefits and dis-benefits with owners, measures and the review plan (BEN-001..005)." />}
      {tab === 'satisfaction' && <Register entity="satisfaction" scope={scope} sub="Client satisfaction, including the reporting and governance score (OBJ-7)." />}
      {tab === 'growth' && <Register entity="opportunity" scope={scope} sub="Opportunities identified during delivery, passed to the CRM (ENG-015)." />}
    </div>
  );
}

// STK-001: power and interest grid alongside the stakeholder register.
function Stakeholders({ scope }) {
  const list = useApi('/api/e/stakeholder', scope);
  const quad = (s) => ((s.influence || 0) >= 3 ? ((s.interest || 0) >= 3 ? 'Manage closely' : 'Keep satisfied') : (s.interest || 0) >= 3 ? 'Keep informed' : 'Monitor');
  const groups = ['Keep satisfied', 'Manage closely', 'Monitor', 'Keep informed'];
  return (
    <div className="stack">
      <Card title="Power and interest" sub="Placement from influence and interest scores; gaps between current and desired engagement show where to act.">
        <div className="grid g-2">
          {groups.map((g) => (
            <div key={g} className="card card-body" style={{ background: g === 'Manage closely' ? '#fff7f0' : 'var(--surface-2)' }}>
              <h4 className="mb-1">{g}</h4>
              <div className="chips">{(list.data || []).filter((s) => quad(s) === g).map((s) => <span key={s.id} className="chip" title={`${s.current_level} → ${s.desired_level}`}>{s.name}{s.current_level !== s.desired_level ? ' ↗' : ''}</span>)}</div>
            </div>
          ))}
        </div>
      </Card>
      <Register entity="stakeholder" scope={scope} onChanged={list.reload} />
    </div>
  );
}

export function Commercial() {
  const { id, e, d } = useEngagement();
  const [tab, setTab] = useState('contracts');
  const scope = { engagement_id: id };
  return (
    <div className="stack">
      <div className="subtabs">
        {[['contracts', 'Contracts, SOWs and variations'], ['pos', 'Purchase orders'], ['funding', 'Funding allocations'], ['agreements', 'Master agreements and panels'], ['rates', 'Rate cards']].map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'contracts' && <Register entity="contract" scope={scope} sub="Contract value is the original plus signed variations (FIN-003); key dates alert at 90, 60 and 30 days (ENG-013)." />}
      {tab === 'pos' && (
        <>
          {d.fin?.po?.length > 0 && (
            <div className="grid g-3">
              {d.fin.po.map((p) => (
                <Card key={p.id} title={`PO ${p.number}`} sub={`${fmtMoneyShort(p.value)} ${p.gst_basis === 'inclusive' ? 'GST-inclusive' : 'ex GST'} · valid to ${fmtDate(p.valid_to)}`}>
                  <Meter value={p.consumedPct || 0} />
                  <div className="small mt-1">{fmtPct(p.consumedPct, 1)} consumed (<Money v={p.invoiced} /> invoiced + <Money v={p.unbilled} /> unbilled, on the PO’s own GST basis — BR-13)</div>
                  <div className="small">Remaining <b><Money v={p.remaining} /></b>{p.exhaustionDate && <> · forecast to run out <b>{fmtDate(p.exhaustionDate)}</b></>}</div>
                  {p.exhaustsBeforeEnd && <div className="small flag mt-1"><Icon name="alert" size={13} /> Runs out before the planned end ({fmtDate(p.plannedEnd)})</div>}
                  {p.fyLimits?.length > 0 && <div className="tiny muted mt-1">{p.fyLimits.map((f) => `${f.fy}: ${fmtMoneyShort(f.invoiced)} of ${fmtMoneyShort(f.limit)}`).join(' · ')}</div>}
                </Card>
              ))}
            </div>
          )}
          <Register entity="po" scope={scope} sub="Consumption is invoiced plus approved unbilled value, compared on each PO’s own GST basis (BR-05, BR-13)." />
        </>
      )}
      {tab === 'funding' && <Register entity="funding" scope={scope} sub="SOW and PO value allocated to projects; allocations cannot exceed the instrument (ENG-006)." />}
      {tab === 'agreements' && <Register entity="agreement" scope={{ client_id: e.client_id }} sub="Client-level agreements, panels and standing offers (CLI-004)." />}
      {tab === 'rates' && <Register entity="rate_card" scope={{}} rowFilter={(r) => r.level === 'Firm' || r.client_id === e.client_id || r.engagement_ref === id} sub="Charge-out precedence: named person, engagement, agreement or panel, client, Firm standard (FIN-004)." defaults={{ level: 'Engagement', engagement_ref: id, client_id: e.client_id }} />}
    </div>
  );
}

export function Details() {
  const { id, e, lookups, reload } = useEngagement();
  const q = useApi(`/api/e/engagement/${id}`);
  const [editing, setEditing] = useState(false);
  return (
    <Card title="Engagement record" sub="Objectives, governance, reporting obligations, billing rules and security requirements (ENG-001, ENG-007, ENG-014, FIN-039)."
      actions={q.data?._can?.update && <button className="btn btn-sm btn-navy" onClick={() => setEditing(true)}><Icon name="edit" /> Edit</button>}>
      {q.data ? <RecordView entity="engagement" rec={q.data} lookups={lookups} /> : <Empty>Loading…</Empty>}
      {editing && <RecordDrawer entity="engagement" id={e.id} startEditing onClose={() => setEditing(false)} onSaved={() => { q.reload(); reload(); }} />}
    </Card>
  );
}
