// Administration (ADM-001 to ADM-010, SEC-05, PRV-05 to PRV-07, AIA-006, AIA-007): settings and thresholds,
// users and roles, reference lists and terminology, custom fields, the intervention library and question
// sets, artefact templates, integrations, privacy and retention, the audit trail and AI log, and system
// health with configuration promotion. Administrators change configuration; auditors and change
// management leads see what their role allows.
import { lazy, Suspense, useCallback, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { PageHead, Spinner } from '../../ui/core.jsx';
import { useApp, useToast } from '../../state/app.jsx';
import { hasRole } from '../../../shared/access.js';

const Settings = lazy(() => import('./Settings.jsx'));
const Users = lazy(() => import('./Users.jsx'));
const Lists = lazy(() => import('./Lists.jsx'));
const Fields = lazy(() => import('./Fields.jsx'));
const Library = lazy(() => import('./Library.jsx'));
const Templates = lazy(() => import('./Templates.jsx'));
const Integrations = lazy(() => import('./Integrations.jsx'));
const Privacy = lazy(() => import('./Privacy.jsx'));
const Audit = lazy(() => import('./Audit.jsx'));
const System = lazy(() => import('./System.jsx'));

const AREAS = [
  { path: 'settings', label: 'Settings and thresholds', icon: 'settings', roles: ['admin'], el: <Settings /> },
  { path: 'users', label: 'Users and roles', icon: 'users', roles: ['admin', 'auditor'], el: <Users /> },
  { path: 'lists', label: 'Lists and terminology', icon: 'list', roles: ['admin'], el: <Lists /> },
  { path: 'fields', label: 'Custom fields', icon: 'columns', roles: ['admin'], el: <Fields /> },
  { path: 'library', label: 'Interventions and assessments', icon: 'target', roles: ['admin'], el: <Library /> },
  { path: 'templates', label: 'Artefact templates', icon: 'file', roles: ['admin'], el: <Templates /> },
  { path: 'integrations', label: 'Integrations and API', icon: 'link', roles: ['admin'], el: <Integrations /> },
  { path: 'privacy', label: 'Privacy and retention', icon: 'lock', roles: ['admin', 'auditor'], el: <Privacy /> },
  { path: 'audit', label: 'Audit trail and AI log', icon: 'history', roles: ['admin', 'auditor', 'changeLead'], el: <Audit /> },
  { path: 'system', label: 'System and promotion', icon: 'database', roles: ['admin'], el: <System /> },
];

export default function Admin() {
  const { user } = useApp();
  const areas = AREAS.filter((a) => hasRole(user, ...a.roles));
  if (!areas.length) return <PageHead title="Administration">Your role does not include administration.</PageHead>;
  return (
    <>
      <PageHead eyebrow="Administration" title={hasRole(user, 'admin') ? 'Administration' : 'Audit and configuration'}>
        {hasRole(user, 'admin') ? 'Configure the workbench for your organisation. Every change is recorded in the audit trail, and configuration can be exported and imported to promote it between environments.' : 'The audit trail and the configuration your role can see.'}
      </PageHead>
      <div className="report-layout admin-layout">
        <nav className="report-nav" aria-label="Administration areas">
          {areas.map((a) => <NavLink key={a.path} to={`/admin/${a.path}`} className={({ isActive }) => (isActive ? 'active' : '')}><Icon name={a.icon} />{a.label}</NavLink>)}
        </nav>
        <div style={{ minWidth: 0 }}>
          <Suspense fallback={<Spinner />}>
            <Routes>
              {areas.map((a) => <Route key={a.path} path={`${a.path}/*`} element={a.el} />)}
              {/* Absolute: a relative path inside a splat route resolves against the whole URL and loops. */}
              <Route path="*" element={<Navigate to={`/admin/${areas[0].path}`} replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </>
  );
}

// Saves one configuration area and reloads the session so every screen uses it (ADM-010: audited).
export function useSaveConfig() {
  const { api, refresh } = useApp();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const save = useCallback(async (key, value, done = 'Saved') => {
    setSaving(true);
    try {
      await api.op('setConfig', { key, value });
      await refresh();
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(e);
      return false;
    } finally { setSaving(false); }
  }, [api, refresh, toast]);
  return { save, saving };
}
