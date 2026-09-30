import { useState } from 'react';

import { useP } from '../lib/store.jsx';
import { Avatar } from '../components/common.jsx';
import { ROLES, roleLabel } from '../core/constants.js';

const BASE = import.meta.env.BASE_URL;

export default function SignIn() {
  const { backend, signIn, toast } = useP();
  const [busy, setBusy] = useState(null);
  const users = backend?.mode === 'server' ? backend.session.users || [] : backend?.state?.users || [];
  const groups = ROLES.map((r) => ({ role: r, users: users.filter((u) => u.roles[0] === r.id && u.active !== false) })).filter((g) => g.users.length);
  const go = async (id) => {
    setBusy(id);
    try { await signIn(id); } catch (e) { toast(e.message, 'error'); setBusy(null); }
  };
  return (
    <div className="signin">
      <div className="box">
        <div className="left">
          <img src={`${BASE}brand/logo-white.png`} alt="CTO Consulting" style={{ width: 220 }} />
          <h1>Proposal Platform</h1>
          <p style={{ margin: 0 }}>One workspace per bid: the client’s request, requirements, team, sections, pricing, approvals and outputs — from intake to a submitted Word proposal and client presentation.</p>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Governed content library with versions and expiry</li>
            <li>AI drafts grounded in approved content, with citations</li>
            <li>Three approval gates with a complete audit trail</li>
            <li>On-brand Word and PowerPoint outputs, checked before submission</li>
          </ul>
          <p className="small" style={{ marginTop: 'auto', color: '#8fa3bf' }}>All clients, people and bids in the demonstration data are fictitious.</p>
        </div>
        <div className="right">
          <h2 style={{ marginBottom: 4 }}>Sign in</h2>
          <p className="muted small" style={{ marginTop: 0 }}>{backend?.mode === 'server' ? 'Shared server workspace.' : 'This demonstration keeps its data in this browser.'} In production, sign-in uses Microsoft Entra ID with MFA (spec sections 13 and 16).</p>
          <button className="ms" onClick={() => toast('Entra ID single sign-on is not connected in this demonstration. Choose a person below.', 'info')}>
            <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden><rect width="10" height="10" fill="#f25022" /><rect x="11" width="10" height="10" fill="#7fba00" /><rect y="11" width="10" height="10" fill="#00a4ef" /><rect x="11" y="11" width="10" height="10" fill="#ffb900" /></svg>
            Sign in with Microsoft
          </button>
          {(
            <div style={{ marginTop: 18 }}>
              <div className="eyebrow">Demonstration sign-in — choose a person to see their role’s view</div>
              {groups.map((g) => (
                <div key={g.role.id} style={{ marginTop: 12 }}>
                  <div className="mini strong" style={{ marginBottom: 6 }}>{g.role.label}</div>
                  <div className="user-pick">
                    {g.users.map((u) => (
                      <button key={u.id} onClick={() => go(u.id)} disabled={Boolean(busy)} aria-label={`Sign in as ${u.name}`}>
                        <Avatar id={u.id} name={u.name} />
                        <span><strong className="small">{u.name}</strong><div className="r">{u.title}</div><div className="r">{u.roles.map(roleLabel).join(', ')}</div></span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
