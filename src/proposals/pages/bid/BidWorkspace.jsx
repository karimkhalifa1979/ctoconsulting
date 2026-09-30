import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useP, useBid, usePresence } from '../../lib/store.jsx';
import { Loading } from '../../../components/ui.jsx';
import { StagePill, Closing, Avatar, Icon, OutcomePill } from '../../components/common.jsx';
import { STAGES, GATES } from '../../core/constants.js';
import { aud } from '../../core/util.js';
import { aiPendingCount, unmappedMandatory } from '../../core/workflow.js';
import Overview from './Overview.jsx';

const Request = lazy(() => import('./Request.jsx'));
const Requirements = lazy(() => import('./Requirements.jsx'));
const Qualify = lazy(() => import('./Qualify.jsx'));
const Plan = lazy(() => import('./Plan.jsx'));
const Sections = lazy(() => import('./Sections.jsx'));
const SectionEditor = lazy(() => import('./SectionEditor.jsx'));
const Reviews = lazy(() => import('./Reviews.jsx'));
const Pricing = lazy(() => import('./Pricing.jsx'));
const Approvals = lazy(() => import('./Approvals.jsx'));
const Produce = lazy(() => import('./Produce.jsx'));
const Deck = lazy(() => import('./Deck.jsx'));
const Submission = lazy(() => import('./Submission.jsx'));
const Clarifications = lazy(() => import('./Clarifications.jsx'));
const Activity = lazy(() => import('./Activity.jsx'));
const BidSettings = lazy(() => import('./BidSettings.jsx'));

export function Stepper({ bid }) {
  const stages = bid._d.stages;
  const idx = STAGES.findIndex((s) => s.id === bid.stage);
  const done = bid.stage === 'closed';
  return (
    <div className="stepper" aria-label="Lifecycle stages">
      {STAGES.map((s, i) => {
        const inWf = stages.includes(s.id);
        const gate = GATES.find((g) => (g.id === 'g1' && s.id === 'qualify') || (g.id === 'g3' && s.id === 'approve'));
        const gs = gate ? bid._d.gates[gate.id]?.status : null;
        const cls = !inWf ? 'skip' : done || i < idx ? 'done' : i === idx ? 'current' : '';
        return (
          <div key={s.id} className={`st ${cls}`} aria-current={i === idx ? 'step' : undefined} title={`${s.label}: ${s.what}. Exit: ${s.exit}`}>
            <span>{s.n}</span><strong>{s.label}</strong>
            {gate && inWf && <span className={`gate ${gs === 'passed' ? 'passed' : gs === 'pending' ? 'pending' : gs === 'rejected' ? 'rejected' : ''}`} title={`Gate ${gate.n}: ${gate.label} — ${gs}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function BidWorkspace() {
  const { bidId } = useParams();
  const bid = useBid(bidId);
  const { view } = useP();
  const others = usePresence({ bidId });
  if (!bid) return <div className="callout warn">This bid does not exist or you do not have access to it. Access needs membership of the bid team or a portfolio role, and ethical walls apply.</div>;
  const client = view.clients.find((c) => c.id === bid.clientId);
  const openComments = bid.sections.reduce((n, s) => n + (s.comments || []).filter((c) => c.status === 'open').length, 0);
  const ai = bid.sections.reduce((n, s) => n + aiPendingCount(s.content), 0);
  const unconfirmed = bid.requirements.filter((r) => !r.confirmed && !r.excluded).length;
  const pendingGates = ['g1', 'g2', 'g3'].filter((g) => bid.gates[g]?.status === 'pending' && (g !== 'g1' || bid.stage === 'qualify')).length;
  const tabs = [
    ['', 'Overview'], ['request', 'Request', unconfirmed ? { n: unconfirmed, alert: true } : null], ['requirements', 'Compliance matrix', { n: unmappedMandatory(bid).length || null, alert: true }], ['qualify', 'Qualify'],
    ['plan', 'Plan'], ['sections', 'Sections', { n: bid.sections.length }], ['reviews', 'Reviews'], ['pricing', 'Team and pricing'], ['approvals', 'Approvals', pendingGates ? { n: pendingGates, alert: true } : null],
    ['produce', 'Produce'], ['deck', 'Presentation'], ['submission', 'Submission and outcome'], ['clarifications', 'Clarifications', { n: bid.clarifications.filter((c) => c.status !== 'answered').length || null }], ['activity', 'Audit trail'], ['settings', 'Settings'],
  ];
  return (
    <div>
      <div className="bid-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{bid.ref}{bid.clientRef ? ` · ${bid.clientRef}` : ''}{bid.confidential ? ' · Confidential' : ''}</div>
          <h1>{bid.title}</h1>
          <div className="meta">
            <span>{client?.name}</span>
            <span><Icon name="clock" size={14} /> <Closing closing={bid.closing} /></span>
            <span>{aud(bid.value)} estimated</span>
            {bid.channel && <span>{bid.channel}</span>}
            {!bid.aiEnabled && <span className="pill bad">AI switched off</span>}
            {bid.ethicalWall?.users?.length > 0 && <span className="pill navy" title={bid.ethicalWall.reason}><Icon name="lock" size={12} /> Ethical wall</span>}
          </div>
        </div>
        <div className="row">
          {others.length > 0 && <span className="avatar-stack" title="Also viewing this bid">{[...new Map(others.map((o) => [o.userId, o])).values()].slice(0, 5).map((o) => <Avatar key={o.userId} id={o.userId} online />)}</span>}
          {ai > 0 && <span className="pill ai">{ai} AI passage{ai === 1 ? '' : 's'} to review</span>}
          {openComments > 0 && <span className="pill warn">{openComments} open comment{openComments === 1 ? '' : 's'}</span>}
          {bid.outcome ? <OutcomePill outcome={bid.outcome} /> : <StagePill stage={bid.stage} />}
        </div>
      </div>
      <Stepper bid={bid} />
      <nav className="subnav" aria-label="Bid workspace">
        {tabs.map(([to, label, badge]) => (
          <NavLink key={to} to={to ? `/bids/${bid.id}/${to}` : `/bids/${bid.id}`} end={!to}>{label}{badge?.n ? <span className={`n ${badge.alert ? 'alert' : ''}`}>{badge.n}</span> : null}</NavLink>
        ))}
      </nav>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Overview bid={bid} />} />
          <Route path="request" element={<Request bid={bid} />} />
          <Route path="requirements" element={<Requirements bid={bid} />} />
          <Route path="qualify" element={<Qualify bid={bid} />} />
          <Route path="plan" element={<Plan bid={bid} />} />
          <Route path="sections" element={<Sections bid={bid} />} />
          <Route path="sections/:sectionId" element={<SectionEditor bid={bid} />} />
          <Route path="reviews" element={<Reviews bid={bid} />} />
          <Route path="pricing" element={<Pricing bid={bid} />} />
          <Route path="approvals" element={<Approvals bid={bid} />} />
          <Route path="produce" element={<Produce bid={bid} />} />
          <Route path="deck" element={<Deck bid={bid} />} />
          <Route path="submission" element={<Submission bid={bid} />} />
          <Route path="clarifications" element={<Clarifications bid={bid} />} />
          <Route path="activity" element={<Activity bid={bid} />} />
          <Route path="settings" element={<BidSettings bid={bid} />} />
          <Route path="*" element={<Navigate to={`/bids/${bid.id}`} replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
