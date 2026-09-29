import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './lib/store.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Organisations from './pages/Organisations.jsx';
import Discover from './pages/Discover.jsx';
import Obligations from './pages/Obligations.jsx';
import Requirements from './pages/Requirements.jsx';
import Assessment from './pages/Assessment.jsx';
import Report from './pages/Report.jsx';
import Traceability from './pages/Traceability.jsx';
import PolicyAuthor from './pages/PolicyAuthor.jsx';
import CalendarPage from './pages/Calendar.jsx';
import RegisterExplorer from './pages/RegisterExplorer.jsx';

// Pages that need the selected organisation's register render only once it is loaded.
function WithData({ children }) {
  const { data, org, error } = useApp();
  if (error) return <div className="callout warn">Could not load data: {error}</div>;
  if (!org || !data) return <Loading text="Loading organisation register…" />;
  return children;
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<WithData><Dashboard /></WithData>} />
            <Route path="/organisations" element={<WithData><Organisations /></WithData>} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/obligations" element={<WithData><Obligations /></WithData>} />
            <Route path="/requirements" element={<WithData><Requirements /></WithData>} />
            <Route path="/assessment" element={<WithData><Assessment /></WithData>} />
            <Route path="/report" element={<WithData><Report /></WithData>} />
            <Route path="/traceability" element={<WithData><Traceability /></WithData>} />
            <Route path="/policy" element={<WithData><PolicyAuthor /></WithData>} />
            <Route path="/calendar" element={<WithData><CalendarPage /></WithData>} />
            <Route path="/register" element={<WithData><RegisterExplorer /></WithData>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}
