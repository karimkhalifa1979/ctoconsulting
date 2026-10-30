// Sign-in: Microsoft Entra ID single sign-on, or demo personas in non-production environments.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { get, offlineInfo } from '../lib/api.js';
import { useSession } from '../lib/session.jsx';
import { initials } from '../lib/util.js';
import { Alert } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export default function Login() {
  const { signInDemo, notice, me } = useSession();
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [params] = useSearchParams();
  const nav = useNavigate();
  useEffect(() => { get('/api/auth/config').then(setCfg).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { if (me && !params.get('switch')) nav(me.user.external ? '/portal' : '/', { replace: true }); }, [me, nav, params]);
  const go = async (p) => {
    setBusy(p.id);
    setErr(null);
    try {
      const m = await signInDemo(p.id);
      const back = params.get('returnTo');
      nav(m?.user?.external ? '/portal' : back && back !== '/login' ? back : '/', { replace: true });
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const personas = cfg?.personas || [];
  const groups = [
    ['Firm roles', personas.filter((p) => !p.external && p.persona)],
    ['Other team members', personas.filter((p) => !p.external && !p.persona)],
    ['Client portal (external)', personas.filter((p) => p.external)],
  ];
  return (
    <div className="login">
      <aside className="login-side">
        <div className="flex"><div className="brand-mark">CTO</div><div className="brand-text"><strong style={{ color: '#fff' }}>CTO Consulting</strong><span>CEMS</span></div></div>
        <h1>Consulting Engagement Management System</h1>
        <p>One place to set up and govern engagements, plan and deliver projects, manage RAID, change, resources, time and finances, and issue client-ready weekly reports in your own Word templates.</p>
        <ul className="small" style={{ paddingLeft: 18, color: '#a9bad2' }}>
          <li>Engagement-scoped access: you see only the engagements you work on</li>
          <li>Every change is recorded in an immutable audit trail</li>
          <li>Client-safe reporting: internal costs and margins never reach client outputs</li>
        </ul>
        <div style={{ marginTop: 'auto' }} className="small">{offlineInfo() ? 'Offline edition: the data stays in this browser on this computer.' : 'Data is hosted in Australia.'} Sessions end after {30} minutes of inactivity.</div>
      </aside>
      <main className="login-main">
        <h2 className="mb-2">Sign in</h2>
        {notice && <div className="mb-2"><Alert tone="warn">{notice}</Alert></div>}
        {params.get('error') && <div className="mb-2"><Alert tone="error">{params.get('error')}</Alert></div>}
        {err && <div className="mb-2"><Alert tone="error">{err}</Alert></div>}
        {cfg?.oidc && (
          <div className="mb-3">
            <a className="btn btn-navy" href={`/auth/login?returnTo=${encodeURIComponent(params.get('returnTo') || '/')}`}><Icon name="shield" /> Sign in with Microsoft (Entra ID)</a>
            <p className="small muted mt-1">Multi-factor authentication is required.</p>
          </div>
        )}
        {cfg?.mode === 'demo' && (
          <>
            <Alert tone="info">Demo sign-in is enabled in this <b>{cfg.env}</b> environment. Choose a persona to see the system as that person: what they can see and do depends on their engagement roles.</Alert>
            {groups.map(([label, list]) => list.length > 0 && (
              <section key={label} className="mt-3">
                <h3 className="mb-1">{label}</h3>
                <div className="persona-grid">
                  {list.map((p) => (
                    <button key={p.id} className="persona" onClick={() => go(p)} disabled={Boolean(busy)}>
                      <span className={`avatar${p.external ? ' ext' : ''}`}>{initials(p.name)}</span>
                      <span>
                        <span className="who">{p.name}</span> <span className="small muted">{p.title}</span>
                        {p.persona && <span className="what" style={{ display: 'block' }}>{p.persona}</span>}
                        {busy === p.id && <span className="what" style={{ display: 'block' }}>Signing in…</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
        {cfg && cfg.mode !== 'demo' && !cfg.oidc && <Alert tone="error">No sign-in method is configured. Ask your administrator to configure Microsoft Entra ID.</Alert>}
      </main>
    </div>
  );
}
