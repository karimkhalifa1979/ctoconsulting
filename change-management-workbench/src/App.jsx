// Application root: data mode, providers and routes. Screens are loaded on demand.
import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { createClient } from './data/client.js';
import { AppProvider, DialogProvider, ToastProvider, useApp } from './state/app.jsx';
import { InitiativeProvider } from './state/initiative.jsx';
import { EnterpriseProvider } from './state/enterprise.jsx';
import { RecordDrawerHost } from './ui/RecordDrawer.jsx';
import { Spinner, ErrorBox } from './ui/core.jsx';
import Layout from './Layout.jsx';
import Login from './pages/Login.jsx';

const PublicSurvey = lazy(() => import('./pages/PublicSurvey.jsx'));
const Home = lazy(() => import('./pages/Home.jsx'));
const Work = lazy(() => import('./pages/Work.jsx'));
const Portfolio = lazy(() => import('./pages/Portfolio.jsx'));
const Stakeholders = lazy(() => import('./pages/Stakeholders.jsx'));
const StakeholderProfile = lazy(() => import('./pages/StakeholderProfile.jsx'));
const Lessons = lazy(() => import('./pages/Lessons.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Initiatives = lazy(() => import('./pages/Initiatives.jsx'));
const Admin = lazy(() => import('./pages/admin/Admin.jsx'));
const Help = lazy(() => import('./pages/Help.jsx'));
const Overview = lazy(() => import('./pages/ini/Overview.jsx'));
const Setup = lazy(() => import('./pages/ini/Setup.jsx'));
const Impact = lazy(() => import('./pages/ini/Impact.jsx'));
const Risk = lazy(() => import('./pages/ini/Risk.jsx'));
const Strategy = lazy(() => import('./pages/ini/Strategy.jsx'));
const IniStakeholders = lazy(() => import('./pages/ini/Stakeholders.jsx'));
const Engagement = lazy(() => import('./pages/ini/Engagement.jsx'));
const QuickCapture = lazy(() => import('./pages/ini/QuickCapture.jsx'));
const Adkar = lazy(() => import('./pages/ini/Adkar.jsx'));
const Plan = lazy(() => import('./pages/ini/Plan.jsx'));
const Sponsor = lazy(() => import('./pages/ini/Sponsor.jsx'));
const Managers = lazy(() => import('./pages/ini/Managers.jsx'));
const Comms = lazy(() => import('./pages/ini/Comms.jsx'));
const Training = lazy(() => import('./pages/ini/Training.jsx'));
const Resistance = lazy(() => import('./pages/ini/Resistance.jsx'));
const Agents = lazy(() => import('./pages/ini/Agents.jsx'));
const Measures = lazy(() => import('./pages/ini/Measures.jsx'));
const Sustain = lazy(() => import('./pages/ini/Sustain.jsx'));
const Artefacts = lazy(() => import('./pages/ini/Artefacts.jsx'));
const Dashboards = lazy(() => import('./pages/ini/Dashboards.jsx'));

export default function App() {
  const [api, setApi] = useState(null);
  const [progress, setProgress] = useState('Starting');
  const [error, setError] = useState(null);
  useEffect(() => { createClient({ onProgress: setProgress }).then(setApi).catch(setError); }, []);
  if (error) return <div className="content"><ErrorBox error={error} /></div>;
  if (!api) return <div className="auth-page"><div className="card card-pad" style={{ minWidth: 280 }}><Spinner label={progress} /></div></div>;
  return (
    <ToastProvider>
      <DialogProvider>
        <AppProvider api={api}>
          <EnterpriseProvider>
          <HashRouter>
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route path="/survey/:token" element={<PublicSurvey />} />
                <Route path="/*" element={<Authed />} />
              </Routes>
            </Suspense>
          </HashRouter>
          </EnterpriseProvider>
        </AppProvider>
      </DialogProvider>
    </ToastProvider>
  );
}

function Authed() {
  const { status, error, refresh } = useApp();
  if (status === 'checking') return <div className="auth-page"><div className="card card-pad"><Spinner label="Signing in" /></div></div>;
  if (status === 'signedOut') return <Login notice={error} />;
  if (status === 'error') return <div className="content"><ErrorBox error={{ message: error }} onRetry={refresh} /></div>;
  return (
    <RecordDrawerHost>
      <Routes>
        <Route path="i/:iid/*" element={<InitiativeRoutes />} />
        <Route path="*" element={<Layout><GlobalRoutes /></Layout>} />
      </Routes>
    </RecordDrawerHost>
  );
}

function GlobalRoutes() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route index element={<Home />} />
        <Route path="work" element={<Work />} />
        <Route path="initiatives" element={<Initiatives />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="stakeholders" element={<Stakeholders />} />
        <Route path="stakeholders/:sid" element={<StakeholderProfile />} />
        <Route path="lessons" element={<Lessons />} />
        <Route path="reports" element={<Reports />} />
        <Route path="admin/*" element={<Admin />} />
        <Route path="help" element={<Help />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function InitiativeRoutes() {
  const { iid } = useParams();
  return (
    <InitiativeProvider id={iid}>
      <RecordDrawerHost>
        <Layout initiativeId={iid}>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route index element={<Overview />} />
              <Route path="setup" element={<Setup />} />
              <Route path="impact" element={<Impact />} />
              <Route path="risk" element={<Risk />} />
              <Route path="strategy" element={<Strategy />} />
              <Route path="stakeholders" element={<IniStakeholders />} />
              <Route path="stakeholders/:sid" element={<StakeholderProfile />} />
              <Route path="engagement" element={<Engagement />} />
              <Route path="capture" element={<QuickCapture />} />
              <Route path="adkar" element={<Adkar />} />
              <Route path="plan" element={<Plan />} />
              <Route path="sponsor" element={<Sponsor />} />
              <Route path="managers" element={<Managers />} />
              <Route path="comms" element={<Comms />} />
              <Route path="training" element={<Training />} />
              <Route path="resistance" element={<Resistance />} />
              <Route path="agents" element={<Agents />} />
              <Route path="measures" element={<Measures />} />
              <Route path="sustain" element={<Sustain />} />
              <Route path="artefacts" element={<Artefacts />} />
              <Route path="dashboards" element={<Dashboards />} />
              <Route path="*" element={<Navigate to="." replace />} />
            </Routes>
          </Suspense>
        </Layout>
      </RecordDrawerHost>
    </InitiativeProvider>
  );
}
