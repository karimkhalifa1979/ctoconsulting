import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LISTS, config, demoMode } from './config.js';
import { initAuth, signIn, signOut } from './lib/auth.js';
import { getMe } from './lib/graph.js';
import { loadCachedScan, loadSelections, resetDemo, saveSelections, scan } from './lib/backend.js';
import { effectiveChanges, emptyDoc } from './lib/selections.js';
import Layout from './components/Layout.jsx';
import Library from './pages/Library.jsx';
import SavedProposals from './pages/SavedProposals.jsx';
import ProposalEditor from './pages/ProposalEditor.jsx';
import { clientOf, duplicateProposal, newProposal, normaliseProposal } from './lib/proposal.js';

// Routes: #/saved-proposals (home), #/new-proposal, #/proposal/<id>, #/proposals (library), #/resumes.
function routeFromHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h === 'proposals' || h === 'resumes' || h === 'new-proposal') return { page: h };
  const m = /^proposal\/(.+)$/.exec(h);
  if (m) return { page: 'proposal', id: decodeURIComponent(m[1]) };
  return { page: 'saved-proposals' };
}
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

  // Leaving a proposal with unsaved edits asks first; cancelling puts the previous address back.
  const editorDirty = useRef(false);
  const lastHash = useRef(window.location.hash);
  const setEditorDirty = useCallback((v) => { editorDirty.current = v; }, []);
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === lastHash.current) return;
      if (editorDirty.current && !window.confirm('Leave this proposal? Your unsaved changes will be lost.')) {
        window.history.replaceState(null, '', lastHash.current || '#/saved-proposals');
        return;
      }
      editorDirty.current = false;
      lastHash.current = window.location.hash;
      setRoute(routeFromHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = useCallback((hash, { replace = false } = {}) => {
    if (replace) {
      window.history.replaceState(null, '', hash);
      lastHash.current = hash;
      setRoute(routeFromHash());
    } else {
      window.location.hash = hash;
    }
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

  // Library screens open with the cached scan when there is one; otherwise they scan the folder now.
  // The proposal editor only uses a cached Clients scan (for client name suggestions) and never starts one.
  const opened = useRef(new Set());
  useEffect(() => {
    const listId = LISTS[route.page] ? route.page : route.page === 'new-proposal' || route.page === 'proposal' ? 'proposals' : null;
    if (!ready || !listId || opened.current.has(listId)) return;
    const library = listId === route.page;
    if (library) opened.current.add(listId);
    loadCachedScan(LISTS[listId].folder).then((cached) => {
      if (cached) {
        opened.current.add(listId);
        setScans((s) => (s[listId]?.files ? s : { ...s, [listId]: { ...cached, loading: false } }));
      } else if (library) {
        runScan(listId);
      }
    });
  }, [ready, route.page, runScan]);

  const changes = useMemo(() => ({
    proposalFiles: effectiveChanges(saved.doc.proposalFiles, pending.proposalFiles),
    activeResumes: effectiveChanges(saved.doc.activeResumes, pending.activeResumes),
  }), [saved.doc, pending]);
  const changeCount = changes.proposalFiles.size + changes.activeResumes.size;

  useEffect(() => {
    const warn = (e) => { if (editorDirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

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

  // Saves one proposal (or deletes it with null) on top of the latest saved file.
  const writeProposal = useCallback(async (id, record) => {
    const { doc } = await saveSelections({ proposals: new Map([[id, record]]) }, auth.user);
    setSaved((s) => ({ ...s, doc }));
    return doc.proposals[id] ? normaliseProposal(doc.proposals[id]) : null;
  }, [auth.user]);

  const saveProposal = async (record) => {
    const saved = await writeProposal(record.id, record);
    if (route.page === 'new-proposal') go(`#/proposal/${encodeURIComponent(record.id)}`, { replace: true });
    return saved;
  };

  const deleteProposal = async (p) => {
    if (!window.confirm(`Delete the proposal "${p.details.title || 'Untitled proposal'}"? This cannot be undone.`)) return;
    try {
      await writeProposal(p.id, null);
      editorDirty.current = false;
      if (route.page !== 'saved-proposals') go('#/saved-proposals');
    } catch (e) {
      window.alert(`Could not delete the proposal: ${e.message}`);
    }
  };

  const duplicate = async (p) => {
    try {
      const copy = duplicateProposal(p, auth.user);
      await writeProposal(copy.id, copy);
      go(`#/proposal/${encodeURIComponent(copy.id)}`);
    } catch (e) {
      window.alert(`Could not duplicate the proposal: ${e.message}`);
    }
  };

  // Client names for the proposal form: folders in a cached Clients scan plus clients of selected files.
  const clientNames = useMemo(() => {
    const names = new Set(Object.values(saved.doc.proposalFiles).map((e) => clientOf(e.path)));
    for (const f of scans.proposals?.files || []) if (f.path) names.add(clientOf(f.path));
    for (const p of Object.values(saved.doc.proposals)) if (p.details?.client) names.add(p.details.client);
    names.delete('(top level)');
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [saved.doc, scans.proposals]);

  // A fresh draft each time New proposal is opened.
  const [draftKey, setDraftKey] = useState(0);
  const draft = useMemo(() => newProposal(auth.user), [auth.user, draftKey]);
  useEffect(() => { if (route.page === 'new-proposal') setDraftKey((k) => k + 1); }, [route.page]);

  if (auth.status !== 'ready') {
    return <SignIn auth={auth} />;
  }

  const list = LISTS[route.page];
  const library = { proposalFiles: saved.doc.proposalFiles, activeResumes: saved.doc.activeResumes };
  const existing = route.page === 'proposal' ? saved.doc.proposals[route.id] : null;
  let page;
  if (list) {
    page = (
      <Library
        key={route.page}
        list={list}
        scan={scans[route.page]}
        saved={saved.doc[list.key]}
        pending={pending[list.key]}
        onToggle={(files, value) => toggle(list.key, files, value)}
        onRescan={() => runScan(route.page)}
      />
    );
  } else if (route.page === 'new-proposal') {
    page = <ProposalEditor key={draft.id} initial={draft} isNew library={library} clientNames={clientNames} onSave={saveProposal} onDirtyChange={setEditorDirty} />;
  } else if (route.page === 'proposal') {
    page = existing
      ? <ProposalEditor key={route.id} initial={normaliseProposal(existing)} library={library} clientNames={clientNames} onSave={saveProposal} onDelete={deleteProposal} onDirtyChange={setEditorDirty} />
      : <div className="card empty-card">{saved.loaded ? <>This proposal was not found. It may have been deleted. <a href="#/saved-proposals">Back to saved proposals</a></> : 'Loading…'}</div>;
  } else {
    page = (
      <SavedProposals
        proposals={Object.fromEntries(Object.entries(saved.doc.proposals).map(([id, p]) => [id, normaliseProposal({ ...p, id })]))}
        onOpen={(id) => go(`#/proposal/${encodeURIComponent(id)}`)}
        onDuplicate={duplicate}
        onDelete={deleteProposal}
      />
    );
  }
  return (
    <Layout
      route={route.page}
      user={auth.user}
      onSignOut={demoMode ? null : signOut}
      onResetDemo={() => {
        if (!window.confirm('Reset the demo? This clears your demo selections and proposals and restores the sample data.')) return;
        resetDemo();
        setPending(emptyPending());
        reloadSelections();
      }}
      counts={{ proposals: Object.keys(saved.doc.proposalFiles).length, resumes: Object.keys(saved.doc.activeResumes).length, saved: Object.keys(saved.doc.proposals).length }}
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
      {page}
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
