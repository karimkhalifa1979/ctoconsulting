// Project workspace: overview, plan, scope, RAID, change, weekly status, resources, financials,
// governance, lessons, documents and closure.
import { createContext, useContext } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { useSession, canOn, costsOn, rolesOn } from '../../lib/session.jsx';
import { post } from '../../lib/api.js';
import { Async, RouteTabs, Rag, Status, Badge, useAction, useDialog } from '../../components/ui.jsx';
import { useLookups } from '../../components/fields.jsx';
import Overview from './Overview.jsx';
import Plan from './Plan.jsx';
import StatusUpdates from './Status.jsx';
import Financials from './Financials.jsx';
import { Scope, ProjectRaid, ProjectChanges, Resources, Lessons, Documents } from './Registers.jsx';
import Governance from './Governance.jsx';
import Closure from './Closure.jsx';

const Ctx = createContext(null);
export const useProject = () => useContext(Ctx);

const NEXT = {
  Proposed: ['Initiation', 'On hold', 'Cancelled'],
  Initiation: ['In delivery', 'On hold', 'Cancelled'],
  'In delivery': ['Stage boundary', 'On hold', 'Closing', 'Cancelled'],
  'Stage boundary': ['In delivery', 'On hold', 'Closing', 'Cancelled'],
  'On hold': ['In delivery', 'Cancelled'],
  Closing: ['In delivery'],
  Closed: ['Archived'],
  Cancelled: ['Archived'],
};

export default function Project() {
  const { id } = useParams();
  const { me } = useSession();
  const q = useApi(`/api/dash/project/${id}`);
  return (
    <Async q={q}>{(d) => <Workspace d={d} me={me} reload={q.reload} id={id} />}</Async>
  );
}

function Workspace({ d, me, reload, id }) {
  const p = d.project;
  const engId = p.engagement_id;
  const lookups = useLookups({ engagementId: engId });
  const can = (fn, act = 'R') => canOn(me, engId, fn, act, id);
  const value = { id, d, p, engId, can, costs: costsOn(me, engId), roles: rolesOn(me, engId), reload, lookups };
  const base = `/projects/${id}`;
  return (
    <Ctx.Provider value={value}>
      <Header />
      <RouteTabs tabs={[
        { to: base, label: 'Overview', end: true },
        { to: `${base}/plan`, label: 'Plan' },
        { to: `${base}/scope`, label: 'Scope and quality' },
        { to: `${base}/raid`, label: 'RAID' },
        can('change') && { to: `${base}/changes`, label: 'Changes' },
        can('status') && { to: `${base}/status`, label: 'Status updates' },
        { to: `${base}/resources`, label: 'Resources' },
        (can('budget') || can('billing')) && { to: `${base}/financials`, label: 'Financials' },
        { to: `${base}/governance`, label: 'Governance' },
        { to: `${base}/lessons`, label: 'Lessons' },
        { to: `${base}/documents`, label: 'Documents' },
        { to: `${base}/closure`, label: 'Closure' },
      ]} />
      <Routes>
        <Route index element={<Overview />} />
        <Route path="plan" element={<Plan />} />
        <Route path="scope" element={<Scope />} />
        <Route path="raid" element={<ProjectRaid />} />
        <Route path="changes" element={<ProjectChanges />} />
        <Route path="status" element={<StatusUpdates />} />
        <Route path="resources" element={<Resources />} />
        <Route path="financials" element={<Financials />} />
        <Route path="governance" element={<Governance />} />
        <Route path="lessons" element={<Lessons />} />
        <Route path="documents" element={<Documents />} />
        <Route path="closure" element={<Closure />} />
      </Routes>
    </Ctx.Provider>
  );
}

function Header() {
  const { p, d, engId, can, lookups, reload } = useProject();
  const [run, busy] = useAction();
  const dialog = useDialog();
  const name = (uid) => lookups?.users?.find((u) => u.id === uid)?.label;
  const eng = lookups?.engagements?.find((e) => e.id === engId);
  const manage = can('setup', 'U');
  const options = (NEXT[p.state] || []).filter((to) => manage || (can('plan', 'U') && ['Stage boundary', 'On hold', 'Closing'].includes(to)));
  const transition = async (to) => {
    let body = { to };
    if (to === 'On hold') {
      const reason = await dialog({ title: 'Put the project on hold', input: true, required: true, label: 'Reason' });
      if (!reason) return;
      const restart = await dialog({ title: 'Expected restart', input: 'line', label: 'Date (yyyy-mm-dd), optional' });
      if (restart === null) return;
      body = { to, reason, expected_restart: restart || null };
    } else if (to === 'Cancelled') {
      const reason = await dialog({ title: 'Cancel the project (CLS-006)', message: 'The financial position is recorded and time codes close after the grace period.', input: true, required: true, label: 'Reason', confirm: 'Cancel project', danger: true });
      if (!reason) return;
      body = { to, reason };
    } else if (!(await dialog({ title: `Move to ${to}`, message: to === 'In delivery' && p.state === 'Initiation' ? 'The baseline must be approved first (UC-01).' : to === 'Initiation' ? 'Commercial approval is needed first (GOV-003).' : null, confirm: to }))) return;
    const out = await run(() => post(`/api/projects/${p.id}/transition`, body), `Project moved to ${to}`);
    if (out) reload();
  };
  return (
    <div className="ws-head">
      <div className="crumbs">
        <Link to="/engagements">Engagements</Link><span>›</span>
        <Link to={`/engagements/${engId}`}>{eng?.label || 'Engagement'}</Link><span>›</span>
        <Link to={`/engagements/${engId}/projects`}>Projects</Link>
      </div>
      <div className="title">
        <h1>{p.name}</h1>
        <Rag v={d.rag} title={d.rag_period ? `Week ending ${d.rag_period}` : 'Not yet rated'} />
        <Status v={p.state} />
        {p.baseline_pending && <Badge tone="amber">Baseline awaiting approval</Badge>}
        {p.state === 'On hold' && p.on_hold_reason && <Badge tone="amber" title={p.on_hold_reason}>On hold{p.expected_restart ? ` to ${p.expected_restart}` : ''}</Badge>}
        <span className="flex-1" />
        <div className="btn-row">
          {can('report', 'C') && <Link className="btn btn-sm" to={`/reports/new?engagement=${engId}&project=${p.id}`}>Generate report</Link>}
          {options.map((to) => <button key={to} className={`btn btn-sm ${to === 'Cancelled' ? 'btn-danger' : ''}`} disabled={busy} onClick={() => transition(to)}>{to}</button>)}
        </div>
      </div>
      <div className="meta">
        <span>Number <b>{p.code}</b></span>
        <span>Manager <b>{name(p.manager_id)}</b></span>
        <span>Approach <b>{p.approach}</b></span>
        <span>Stage <b>{d.stage || '—'}</b></span>
        <span>Planned <b>{p.start_date} → {p.end_date}</b></span>
        <span>Complete <b>{Math.round((d.percent || 0) * 100)}%</b></span>
      </div>
    </div>
  );
}
