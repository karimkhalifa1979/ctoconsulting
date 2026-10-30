import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './lib/session.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';

const MyWork = lazy(() => import('./pages/MyWork.jsx'));
const Approvals = lazy(() => import('./pages/Approvals.jsx'));
const Portfolio = lazy(() => import('./pages/Portfolio.jsx'));
const Engagements = lazy(() => import('./pages/Engagements.jsx'));
const Engagement = lazy(() => import('./pages/engagement/Engagement.jsx'));
const Project = lazy(() => import('./pages/project/Project.jsx'));
const Time = lazy(() => import('./pages/Time.jsx'));
const TimeApprovals = lazy(() => import('./pages/TimeApprovals.jsx'));
const Raid = lazy(() => import('./pages/Raid.jsx'));
const Knowledge = lazy(() => import('./pages/Knowledge.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const ReportDetail = lazy(() => import('./pages/ReportDetail.jsx'));
const GenerateReport = lazy(() => import('./pages/GenerateReport.jsx'));
const Tracker = lazy(() => import('./pages/Tracker.jsx'));
const Templates = lazy(() => import('./pages/Templates.jsx'));
const TemplateDetail = lazy(() => import('./pages/TemplateDetail.jsx'));
const Tokens = lazy(() => import('./pages/Tokens.jsx'));
const Clients = lazy(() => import('./pages/Clients.jsx'));
const ClientDetail = lazy(() => import('./pages/ClientDetail.jsx'));
const Resources = lazy(() => import('./pages/Resources.jsx'));
const Finance = lazy(() => import('./pages/Finance.jsx'));
const Pmo = lazy(() => import('./pages/Pmo.jsx'));
const Admin = lazy(() => import('./pages/admin/Admin.jsx'));
const Audit = lazy(() => import('./pages/admin/Audit.jsx'));
const Requirements = lazy(() => import('./pages/admin/Requirements.jsx'));
const Portal = lazy(() => import('./pages/Portal.jsx'));

function NotFound() {
  return <div className="empty"><h2>Page not found</h2><p>The page may have moved, or you may not have access to it.</p></div>;
}

export default function App() {
  const { me } = useSession();
  const loc = useLocation();
  if (me === undefined) return <Loading label="Starting CEMS…" />;
  if (loc.pathname === '/login') return <Login />;
  if (!me) return <Navigate to={`/login?returnTo=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (me.user.external) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/portal/*" element={<Portal />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<MyWork />} />
          <Route path="my-work" element={<Navigate to="/" replace />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="engagements" element={<Engagements />} />
          <Route path="engagements/:id/*" element={<Engagement />} />
          <Route path="projects/:id/*" element={<Project />} />
          <Route path="time" element={<Time />} />
          <Route path="time/approvals" element={<TimeApprovals />} />
          <Route path="raid" element={<Raid />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/new" element={<GenerateReport />} />
          <Route path="reports/tracker" element={<Tracker />} />
          <Route path="reports/templates" element={<Templates />} />
          <Route path="reports/templates/:id" element={<TemplateDetail />} />
          <Route path="reports/tokens" element={<Tokens />} />
          <Route path="reports/:id" element={<ReportDetail />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="resources/*" element={<Resources />} />
          <Route path="finance/*" element={<Finance />} />
          <Route path="pmo/*" element={<Pmo />} />
          <Route path="admin/audit" element={<Audit />} />
          <Route path="admin/requirements" element={<Requirements />} />
          <Route path="admin/*" element={<Admin />} />
          <Route path="portal/*" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
