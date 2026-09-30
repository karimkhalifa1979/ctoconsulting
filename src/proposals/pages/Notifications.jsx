import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useP } from '../lib/store.jsx';
import { Card, PageHead, Empty } from '../../components/ui.jsx';
import { When } from '../components/common.jsx';

const KIND = { assignment: 'Assignments', mention: 'Mentions', comment: 'Comments', approval: 'Approvals', gate: 'Gates', stage: 'Stage changes', escalation: 'Escalations', library: 'Library', availability: 'Availability', addendum: 'Addenda', clarification: 'Clarifications' };

// In-app notifications with email and Teams preferences (WF-11, WF-12).
export default function Notifications() {
  const { view, me, dispatch } = useP();
  const nav = useNavigate();
  const [kind, setKind] = useState('');
  const [unread, setUnread] = useState(false);
  const items = [...view.notifications].reverse().filter((n) => (!kind || n.kind === kind) && (!unread || !n.read));
  const prefs = me.prefs || {};
  const setPref = (k, v) => dispatch('user.prefs', { prefs: { [k]: v } }, { success: 'Preferences saved' });
  const kinds = [...new Set(view.notifications.map((n) => n.kind))];
  return (
    <div className="stack">
      <PageHead eyebrow="Work" title="Notifications" actions={<button className="btn" onClick={() => dispatch('notif.read', { all: true }, { success: 'All marked as read' })}>Mark all as read</button>} />
      <div className="split-3-2">
        <div className="stack">
          <div className="filters">
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind"><option value="">All kinds</option>{kinds.map((k) => <option key={k} value={k}>{KIND[k] || k}</option>)}</select>
            <label className="check small"><input type="checkbox" checked={unread} onChange={(e) => setUnread(e.target.checked)} /><span>Unread only</span></label>
            <span className="muted small">{items.length} notifications</span>
          </div>
          {items.length ? (
            <Card pad={false}>
              {items.map((n) => (
                <div key={n.id} className={`notif row-item ${n.read ? '' : 'unread'}`} role="button" tabIndex={0} onClick={() => { if (!n.read) dispatch('notif.read', { ids: [n.id] }, { quiet: true }); if (n.link) nav(n.link); }} onKeyDown={(e) => { if (e.key === 'Enter' && n.link) nav(n.link); }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><strong className="small">{n.title}</strong><span className="mini"><When at={n.at} /></span></div>
                  {n.text && <div className="small muted">{n.text}</div>}
                  <div className="mini">{KIND[n.kind] || n.kind}{n.teams ? ' · also sent to Teams' : ''}</div>
                </div>
              ))}
            </Card>
          ) : <Empty title="Nothing here">You are up to date.</Empty>}
        </div>
        <Card title="Preferences" subtitle="In-app notifications are always on">
          <div className="stack" style={{ gap: 10 }}>
            <label className="check"><input type="checkbox" checked={prefs.email !== false} onChange={(e) => setPref('email', e.target.checked)} /><span>Email me each notification</span></label>
            <label className="check"><input type="checkbox" checked={prefs.digest !== false} onChange={(e) => setPref('digest', e.target.checked)} /><span>Send a daily digest at {view.settings.digestHour ?? 7}:00 (WF-11)</span></label>
            <label className="check"><input type="checkbox" checked={prefs.teams !== false} disabled={!view.settings.teamsEnabled} onChange={(e) => setPref('teams', e.target.checked)} /><span>Send approvals and mentions to Microsoft Teams (WF-12)</span></label>
            <p className="mini" style={{ margin: 0 }}>Tasks overdue by {view.settings.escalationDays ?? 2} days are escalated to the bid manager.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
