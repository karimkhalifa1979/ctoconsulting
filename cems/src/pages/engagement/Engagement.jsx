// Engagement workspace (ENG-001..015): overview dashboard and tabs for projects, RAID, change,
// governance, commercial, financials, reports, team and closure.
import { createContext, useContext } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { useApi } from '../../lib/hooks.js';
import { useSession, canOn, costsOn, rolesOn } from '../../lib/session.jsx';
import { post } from '../../lib/api.js';
import { Async, RouteTabs, Rag, Status, Badge, useAction, useDialog } from '../../components/ui.jsx';
import { useLookups } from '../../components/fields.jsx';
import { ROLE_LABEL } from '../../../shared/permissions.js';
import Icon from '../../components/Icon.jsx';
import Overview from './Overview.jsx';
import Projects from './Projects.jsx';
import { EngRaid, EngChanges, Governance, Commercial, Details } from './Registers.jsx';
import Financials from './Financials.jsx';
import { EngReports, Team, Closure } from './More.jsx';

const Ctx = createContext(null);
export const useEngagement = () => useContext(Ctx);

export default function Engagement() {
  const { id } = useParams();
  const { me } = useSession();
  const q = useApi(`/api/dash/engagement/${id}`);
  const lookups = useLookups({ engagementId: id });
  return (
    <Async q={q}>{(d) => {
      const e = d.engagement;
      const can = (fn, act = 'R') => canOn(me, id, fn, act);
      const value = { id, d, e, can, costs: costsOn(me, id), roles: rolesOn(me, id), reload: q.reload, lookups };
      const base = `/engagements/${id}`;
      return (
        <Ctx.Provider value={value}>
          <Header />
          <RouteTabs tabs={[
            { to: base, label: 'Overview', end: true },
            { to: `${base}/projects`, label: 'Projects', count: d.projects.length },
            { to: `${base}/raid`, label: 'RAID' },
            can('change') && { to: `${base}/changes`, label: 'Changes', count: d.changes.length || null },
            { to: `${base}/governance`, label: 'Governance' },
            { to: `${base}/commercial`, label: 'Contracts and POs' },
            (can('budget') || can('billing')) && { to: `${base}/financials`, label: 'Financials' },
            { to: `${base}/reports`, label: 'Reports' },
            { to: `${base}/team`, label: 'Team and access' },
            { to: `${base}/closure`, label: 'Closure' },
            { to: `${base}/details`, label: 'Details' },
          ]} />
          <Routes>
            <Route index element={<Overview />} />
            <Route path="projects" element={<Projects />} />
            <Route path="raid" element={<EngRaid />} />
            <Route path="changes" element={<EngChanges />} />
            <Route path="governance" element={<Governance />} />
            <Route path="commercial" element={<Commercial />} />
            <Route path="financials" element={<Financials />} />
            <Route path="reports" element={<EngReports />} />
            <Route path="team" element={<Team />} />
            <Route path="closure" element={<Closure />} />
            <Route path="details" element={<Details />} />
          </Routes>
        </Ctx.Provider>
      );
    }}</Async>
  );
}

function Header() {
  const { e, d, can, roles, lookups, reload } = useEngagement();
  const [run, busy] = useAction();
  const dialog = useDialog();
  const name = (id) => lookups?.users?.find((u) => u.id === id)?.label;
  const client = lookups?.clients?.find((c) => c.id === e.client_id);
  const next = { Proposed: ['Active'], Active: ['On hold', 'Closing'], 'On hold': ['Active'], Closing: ['Closed', 'Active'], Closed: [] }[e.status] || [];
  const transition = async (to) => {
    const reason = to === 'On hold' ? await dialog({ title: 'Put engagement on hold', input: true, required: true, label: 'Reason' }) : await dialog({ title: `Move engagement to ${to}`, message: to === 'Closed' ? 'All projects must be closed and contractual obligations complete (CLS-007).' : null, confirm: to });
    if (!reason) return;
    const r = await run(() => post(`/api/e/engagement/${e.id}/do/transition`, { to, reason: typeof reason === 'string' ? reason : undefined }), `Engagement ${to.toLowerCase()}`);
    if (r) reload();
  };
  const override = async () => {
    const rag = await dialog({ title: 'Override engagement health (ENG-011)', message: `Calculated health is ${d.health?.rag || 'not rated'}. Enter Green, Amber or Red; leave blank to remove an override.`, input: 'line', label: 'Rating', initial: e.health_override?.rag || '' });
    if (rag === null) return;
    let justification = '';
    if (rag) {
      justification = await dialog({ title: 'Justify the override', input: true, required: true, label: 'Justification' });
      if (!justification) return;
    }
    const v = rag ? rag[0].toUpperCase() + rag.slice(1).toLowerCase() : null;
    const r = await run(() => post(`/api/e/engagement/${e.id}/do/override_health`, { rag: v, justification }), 'Health updated');
    if (r) reload();
  };
  return (
    <div className="ws-head">
      <div className="crumbs"><Link to="/engagements">Engagements</Link><span>›</span>{client && <Link to={`/clients/${client.id}`}>{client.label}</Link>}</div>
      <div className="title">
        <h1>{e.name}</h1>
        <Rag v={d.health?.rag} title={d.health?.overridden ? `Overridden: ${d.health.justification}` : `Rule: ${d.health?.rule || 'worst'}`} />
        {d.health?.overridden && <Badge tone="amber" title={d.health.justification}>Health overridden</Badge>}
        <Status v={e.status} />
        {e.restricted && <Badge tone="red"><Icon name="lock" size={12} /> Restricted</Badge>}
        {e.classification && <Badge tone="gold">{e.classification}</Badge>}
        <span className="flex-1" />
        <div className="btn-row">
          {can('report', 'C') && <Link className="btn btn-sm" to={`/reports/new?engagement=${e.id}`}><Icon name="report" /> Generate report</Link>}
          {roles.includes('engagement_manager') && <button className="btn btn-sm" onClick={override} disabled={busy}>Override health</button>}
          {can('setup', 'U') && next.map((to) => <button key={to} className="btn btn-sm" disabled={busy} onClick={() => transition(to)}>{to === 'Active' && e.status === 'Proposed' ? 'Activate' : to}</button>)}
        </div>
      </div>
      <div className="meta">
        <span>Code <b>{e.code}</b></span>
        <span>Client <b>{client?.label}</b></span>
        <span>Executive <b>{name(e.executive_id)}</b></span>
        <span>Manager <b>{name(e.manager_id)}</b></span>
        <span>Term <b>{e.start_date} → {e.end_date}</b></span>
        <span>Your role <b>{roles.map((r) => ROLE_LABEL[r]).join(', ') || 'Portfolio view'}</b></span>
      </div>
    </div>
  );
}
