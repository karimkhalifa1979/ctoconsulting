import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProposalProvider, useP } from './lib/store.jsx';
import Shell from './components/Shell.jsx';
import { Loading } from '../components/ui.jsx';
import SignIn from './pages/SignIn.jsx';
import MyWork from './pages/MyWork.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Bids from './pages/Bids.jsx';
import NewBid from './pages/NewBid.jsx';
import BidWorkspace from './pages/bid/BidWorkspace.jsx';

const Library = lazy(() => import('./pages/Library.jsx'));
const LibraryItem = lazy(() => import('./pages/LibraryItem.jsx'));
const Consultants = lazy(() => import('./pages/Consultants.jsx'));
const ConsultantProfile = lazy(() => import('./pages/ConsultantProfile.jsx'));
const RateCards = lazy(() => import('./pages/RateCards.jsx'));
const Templates = lazy(() => import('./pages/Templates.jsx'));
const WinLoss = lazy(() => import('./pages/insight/WinLoss.jsx'));
const ContentInsight = lazy(() => import('./pages/insight/ContentInsight.jsx'));
const AiUsage = lazy(() => import('./pages/insight/AiUsage.jsx'));
const Search = lazy(() => import('./pages/Search.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Delegation = lazy(() => import('./pages/Delegation.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/Users.jsx'));
const AdminWorkflows = lazy(() => import('./pages/admin/Workflows.jsx'));
const AdminRecipes = lazy(() => import('./pages/admin/Recipes.jsx'));
const AdminSettings = lazy(() => import('./pages/admin/Settings.jsx'));
const AdminIntegrations = lazy(() => import('./pages/admin/Integrations.jsx'));
const AdminOutbox = lazy(() => import('./pages/admin/Outbox.jsx'));
const AdminAudit = lazy(() => import('./pages/admin/Audit.jsx'));

function Gate() {
  const { backend, view, error } = useP();
  if (error) return <div className="content"><div className="callout warn">Could not start the platform: {error}</div></div>;
  if (!backend) return <Loading text="Starting the CTO Consulting Proposal Platform…" />;
  if (!view) return <SignIn />;
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/work" replace />} />
          <Route path="/work" element={<MyWork />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/bids" element={<Bids />} />
          <Route path="/bids/new" element={<NewBid />} />
          <Route path="/bids/:bidId/*" element={<BidWorkspace />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:itemId" element={<LibraryItem />} />
          <Route path="/consultants" element={<Consultants />} />
          <Route path="/consultants/:id" element={<ConsultantProfile />} />
          <Route path="/profile" element={<ConsultantProfile own />} />
          <Route path="/rates" element={<RateCards />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/insight/winloss" element={<WinLoss />} />
          <Route path="/insight/content" element={<ContentInsight />} />
          <Route path="/insight/ai" element={<AiUsage />} />
          <Route path="/search" element={<Search />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/delegation" element={<Delegation />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/workflows" element={<AdminWorkflows />} />
          <Route path="/admin/recipes" element={<AdminRecipes />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
          <Route path="/admin/integrations" element={<AdminIntegrations />} />
          <Route path="/admin/outbox" element={<AdminOutbox />} />
          <Route path="/admin/audit" element={<AdminAudit />} />
          <Route path="*" element={<Navigate to="/work" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ProposalProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </ProposalProvider>
  );
}
