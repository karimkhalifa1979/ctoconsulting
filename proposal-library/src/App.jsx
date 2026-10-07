import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LISTS, config, demoMode } from './config.js';
import { initAuth, signIn, signOut } from './lib/auth.js';
import { getMe } from './lib/graph.js';
import { loadCachedScan, loadSelections, resetDemo, saveSelections, scan } from './lib/backend.js';
import { effectiveChanges, emptyDoc } from './lib/selections.js';
import Layout from './components/Layout.jsx';
import Library from './pages/Library.jsx';

const routeFromHash = () => (window.location.hash.replace(/^#\/?/, '') === 'resumes' ? 'resumes' : 'proposals');
const emptyPending = () => ({ proposalFiles: new Map(), activeResumes: new Map() });

export default function App() {
  const [auth, setAuth] = useState(demoMode ? { status: 'ready', user: 'Demo user' } : { status: 'loading' });
  const [route, setRoute] = useState(routeFromHash);
  const [saved, setSaved] = useState({ doc: emptyDoc(), location: '', loaded: false, error: null });
  const [pending, setPending] = useState(emptyPending);
  const [scans, setScans] = useState({});
  const [saving, setSaving] = useState({ busy: false, error: null, at: null });

  // Sign-in (SharePoint mode).
  useEffect(() => {
    if (demoMode) return;
    initAuth()
      .then(async (account) => {
        if (!account) { setAuth({ status: 'signed-out' }); return; }
        const me = await getMe().catch(() => null);
        setAuth({ status: 'ready', user: me?.displayName || account.name || account.username, email: me?.mail || account.username });
      })
      .catch((e) => setAuth({ status: 'error', error: e.message }));
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const ready = auth.status === 'ready';

  const reloadSelections = useCallback(() => {
    loadSelections()
      .then(({ doc, location }) => setSaved({ doc, location, loaded: true, error: null }))
      .catch((e) => setSaved((s) => ({ ...s, loaded: true, error: e.message })));
  }, []);
  useEffect(() => { if (ready) reloadSelections(); }, [ready, reloadSelections]);

  const runScan = useCallback((listId) => {
    const { folder } = LISTS[listId];
    setScans((s) => ({ ...s, [listId]: { ...s[listId], loading: true, error: null, progress: null } }));
    scan(folder, (progress) => setScans((s) => ({ ...s, [listId]: { ...s[listId], progress } })))
      .then((r) => setScans((s) => ({ ...s, [listId]: { ...r, loading: false, error: null } })))
      .catch((e) => setScans((s) => ({ ...s, [listId]: { ...s[listId], loading: false, error: e.message } })));
  }, []);

  // Open with the cached scan when there is one; otherwise scan the folder now.
  const opened = useRef(new Set());
  useEffect(() => {
    if (!ready || opened.current.has(route)) return;
    opened.current.add(route);
    setScans((s) => ({ ...s, [route]: { loading: true } }));
    loadCachedScan(LISTS[route].folder).then((cached) => {
      if (cached) setScans((s) => ({ ...s, [route]: { ...cached, loading: false } }));
      else runScan(route);
    });
  }, [ready, route, runScan]);

  const changes = useMemo(() => ({
    proposalFiles: effectiveChanges(saved.doc.proposalFiles, pending.proposalFiles),
    activeResumes: effectiveChanges(saved.doc.activeResumes, pending.activeResumes),
  }), [saved.doc, pending]);
  const changeCount = changes.proposalFiles.size + changes.activeResumes.size;

  useEffect(() => {
    if (!changeCount) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changeCount]);

  const toggle = useCallback((key, files, value) => {
    setPending((p) => {
      const map = new Map(p[key]);
      for (const f of files) map.set(f.id, value ? f : null);
      return { ...p, [key]: map };
    });
  }, []);

  const save = async () => {
    setSaving({ busy: true, error: null, at: null });
    try {
      const { doc } = await saveSelections(changes, auth.user);
      setSaved((s) => ({ ...s, doc }));
      setPending(emptyPending());
      setSaving({ busy: false, error: null, at: new Date().toISOString() });
    } catch (e) {
      setSaving({ busy: false, error: e.message, at: null });
    }
  };

  if (auth.status !== 'ready') {
    return <SignIn auth={auth} />;
  }

  const list = LISTS[route];
  return (
    <Layout
      route={route}
      user={auth.user}
      onSignOut={demoMode ? null : signOut}
      onResetDemo={() => {
        if (!window.confirm('Clear all demo selections?')) return;
        resetDemo();
        setPending(emptyPending());
        reloadSelections();
      }}
      counts={{ proposals: Object.keys(saved.doc.proposalFiles).length, resumes: Object.keys(saved.doc.activeResumes).length }}
      location={saved.location}
      changeCount={changeCount}
      saving={saving}
      onSave={save}
      onDiscard={() => { setPending(emptyPending()); setSaving({ busy: false, error: null, at: null }); }}
    >
      {saved.error && (
        <div className="alert alert-error">
          Could not load the saved selections: {saved.error} <button className="btn btn-sm" onClick={reloadSelections}>Retry</button>
        </div>
      )}
      <Library
        key={route}
        list={list}
        scan={scans[route]}
        saved={saved.doc[list.key]}
        pending={pending[list.key]}
        onToggle={(files, value) => toggle(list.key, files, value)}
        onRescan={() => runScan(route)}
      />
    </Layout>
  );
}

function SignIn({ auth }) {
  return (
    <div className="signin">
      <div className="signin-card card">
        <div className="brand brand-light">
          <div className="brand-mark" aria-hidden>CTO</div>
          <div className="brand-text"><strong>CTO Consulting</strong><span>Proposal Library</span></div>
        </div>
        <h1>Sign in to continue</h1>
        <p className="muted">
          Use your CTO Consulting Microsoft 365 account. The app reads the <b>{config.clientsPath}</b> and{' '}
          <b>{config.resumesPath.split('/').slice(-1)[0]}</b> resume folders from the CTO Consulting SharePoint library, using your own access.
        </p>
        {auth.status === 'error' && <div className="alert alert-error">{auth.error}</div>}
        <button className="btn btn-primary btn-lg" disabled={auth.status === 'loading'} onClick={signIn}>
          {auth.status === 'loading' ? 'Checking sign-in…' : 'Sign in with Microsoft'}
        </button>
      </div>
    </div>
  );
}
