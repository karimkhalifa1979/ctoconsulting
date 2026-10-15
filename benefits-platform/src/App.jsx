import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './lib/store.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MyWork from './pages/MyWork.jsx';
import Ideas from './pages/Ideas.jsx';
import Programs from './pages/Programs.jsx';
import ProgramWorkspace from './pages/program/ProgramWorkspace.jsx';
import Strategy from './pages/Strategy.jsx';
import SimulationPage from './pages/SimulationPage.jsx';
import BusinessCasePage from './pages/BusinessCasePage.jsx';
import ValuePlots from './pages/ValuePlots.jsx';
import BenefitsReport from './pages/BenefitsReport.jsx';
import Selection from './pages/Selection.jsx';
import Dependencies from './pages/Dependencies.jsx';
import Governance from './pages/Governance.jsx';
import VMO from './pages/VMO.jsx';
import Measures from './pages/Measures.jsx';
import Learning from './pages/Learning.jsx';
import Maturity from './pages/Maturity.jsx';
import Settings from './pages/Settings.jsx';
import Guide from './pages/Guide.jsx';

function Gate({ children }) {
  const { ws, error } = useApp();
  if (error) return <div className="content"><div className="callout warn">Could not load the workspace: {error}</div></div>;
  if (!ws) return <Loading text="Loading workspace…" />;
  return children;
}

export default function App() {
  return (
    <AppProvider>
      <Gate>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/my" element={<MyWork />} />
              <Route path="/ideas" element={<Ideas />} />
              <Route path="/programs" element={<Programs />} />
              <Route path="/programs/:id" element={<ProgramWorkspace />} />
              <Route path="/programs/:id/:tab" element={<ProgramWorkspace />} />
              <Route path="/strategy" element={<Strategy />} />
              <Route path="/simulation" element={<SimulationPage />} />
              <Route path="/business-case" element={<BusinessCasePage />} />
              <Route path="/value-plots" element={<ValuePlots />} />
              <Route path="/benefits" element={<BenefitsReport />} />
              <Route path="/selection" element={<Selection />} />
              <Route path="/dependencies" element={<Dependencies />} />
              <Route path="/governance" element={<Governance />} />
              <Route path="/vmo" element={<VMO />} />
              <Route path="/measures" element={<Measures />} />
              <Route path="/learning" element={<Learning />} />
              <Route path="/maturity" element={<Maturity />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </Gate>
    </AppProvider>
  );
}
