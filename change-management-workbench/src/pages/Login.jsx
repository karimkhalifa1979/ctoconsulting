// Sign-in (INT-001, SEC-01): single sign-on when configured, local break-glass accounts, and the
// demonstration users when demo mode is on.
import { useEffect, useState } from 'react';
import { useApp } from '../state/app.jsx';
import { Avatar, ErrorBox } from '../ui/core.jsx';
import Icon from '../ui/Icon.jsx';
import { PHASES, TRADEMARK_NOTICE } from '../../shared/refdata.js';

export default function Login({ notice }) {
  const { api, refresh } = useApp();
  const [opts, setOpts] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.authOptions().then(setOpts).catch(setError); }, [api]);

  const signIn = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await api.login(email, password); await refresh(); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const demo = async (id) => {
    setBusy(true);
    try { await api.demoLogin(id); await refresh(); } catch (err) { setError(err); setBusy(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-side">
          <div className="row"><span className="brand-mark"><svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true"><path d="M12 42c6-15 15-22 26-22 6 0 10 2 13 4" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" /><circle cx="47" cy="42" r="6" fill="#f2a900" /></svg></span><span className="small" style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}>CTO Consulting</span></div>
          <h1>Change Management Workbench</h1>
          <p>Plan, run, track and report the people side of change, from a single impacted team to an enterprise portfolio. Aligned to the ADKAR Model and the 3-Phase Process.</p>
          <div className="phases">
            {PHASES.map((p) => <div key={p.id}><b style={{ background: p.color }}>{p.n}</b><span><strong style={{ color: '#fff' }}>{p.label}</strong> · {p.deliverable}</span></div>)}
          </div>
          <p className="tiny" style={{ marginTop: 'auto', color: '#8fa3bf' }}>{TRADEMARK_NOTICE}</p>
        </div>
        <div className="auth-main">
          <div>
            <h2>Sign in{opts?.organisation ? ` to ${opts.organisation}` : ''}</h2>
            {opts?.standalone && <p className="small muted mt-1">This is a browser-only demonstration with fictional data. Choose a person to see the workbench through their role.</p>}
          </div>
          {notice && <div className="callout warn small">{notice}</div>}
          <ErrorBox error={error} />
          {opts?.sso && <a className="btn btn-navy" href={api.ssoUrl('/')}><Icon name="key" />Sign in with your organisation account</a>}
          {opts?.local && (
            <form onSubmit={signIn} className="stack-sm">
              <label className="field"><span>Work email</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
              <label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
              {opts?.sso && <p className="tiny muted">Local accounts are for break-glass access only.</p>}
            </form>
          )}
          {opts?.demo && opts.demoUsers?.length > 0 && (
            <div className="stack-sm">
              <h3>{opts.standalone ? 'Demonstration users' : 'Or use a demonstration user'}</h3>
              <div className="demo-users">
                {opts.demoUsers.map((u) => (
                  <button key={u.id} type="button" className="demo-user" onClick={() => demo(u.id)} disabled={busy}>
                    <Avatar name={u.name} />
                    <span className="grow"><strong style={{ display: 'block' }}>{u.name}</strong><span className="small muted">{u.title || u.roles.join(', ')}</span></span>
                  </button>
                ))}
              </div>
              {!opts.standalone && <p className="tiny muted">Demonstration accounts also accept the password Demo-Workbench-2026.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
