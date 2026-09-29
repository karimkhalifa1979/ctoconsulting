import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from './lib/store.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import Engagement from './pages/Engagement.jsx';
import { Stakeholders, Interviews, Documents } from './pages/Plan.jsx';
import { Capabilities, Processes, Organisation, Decisions, Applications, Suppliers, Locations, Costs } from './pages/Discover.jsx';
import Assessment from './pages/Assessment.jsx';
import AiReadiness from './pages/AiReadiness.jsx';
import Findings from './pages/Findings.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Tom from './pages/Tom.jsx';
import Recommendations from './pages/Recommendations.jsx';
import Transition from './pages/Transition.jsx';
import Benefits from './pages/Benefits.jsx';
import Compare from './pages/Compare.jsx';
import Report from './pages/Report.jsx';
import Reference from './pages/Reference.jsx';

function Ready({ children }) {
  const { ready, eng } = useStore();
  if (!ready || !eng) return <Loading text="Loading engagements…" />;
  return children;
}

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Ready>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/engagement" element={<Engagement />} />
              <Route path="/stakeholders" element={<Stakeholders />} />
              <Route path="/interviews" element={<Interviews />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/capabilities" element={<Capabilities />} />
              <Route path="/processes" element={<Processes />} />
              <Route path="/organisation" element={<Organisation />} />
              <Route path="/decisions" element={<Decisions />} />
              <Route path="/applications" element={<Applications />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/locations" element={<Locations />} />
              <Route path="/costs" element={<Costs />} />
              <Route path="/assessment" element={<Assessment />} />
              <Route path="/ai" element={<AiReadiness />} />
              <Route path="/findings" element={<Findings />} />
              <Route path="/tom" element={<Tom />} />
              <Route path="/recommendations" element={<Recommendations />} />
              <Route path="/transition" element={<Transition />} />
              <Route path="/benefits" element={<Benefits />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/report" element={<Report />} />
              <Route path="/reference" element={<Reference />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Ready>
      </HashRouter>
    </StoreProvider>
  );
}
