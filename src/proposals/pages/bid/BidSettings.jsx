import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useP, useCan } from '../../lib/store.jsx';
import { Card } from '../../../components/ui.jsx';
import { Field, UserSelect, MultiUser, Confirm, Person, Icon } from '../../components/common.jsx';
import { CHANNELS, ROLES, roleLabel } from '../../core/constants.js';
import { TIMEZONES } from '../../core/util.js';
import { aiDisclosureText } from '../../gen/proposalData.js';

const MEMBER_ROLES = ['member', 'partner', 'commercial', 'reviewer', 'author', 'viewer'];

export default function BidSettings({ bid }) {
  const { view, me, dispatch, toast } = useP();
  const can = useCan();
  const nav = useNavigate();
  const planner = can('planSections', { bid });
  const wallOwner = bid.partnerId === me.id || me.roles.includes('admin');
  const [d, setD] = useState(null);
  const [members, setMembers] = useState(bid.members || []);
  const [wall, setWall] = useState({ users: bid.ethicalWall?.users || [], reason: bid.ethicalWall?.reason || '' });
  const [flag, setFlag] = useState('');
  const [archive, setArchive] = useState(false);
  useEffect(() => { setMembers(bid.members || []); setWall({ users: bid.ethicalWall?.users || [], reason: bid.ethicalWall?.reason || '' }); setD(null); }, [bid.members, bid.ethicalWall]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = d || { title: bid.title, value: bid.value, closing: bid.closing || { date: '', time: '14:00', tz: 'Australia/Sydney' }, channel: bid.channel, clientRef: bid.clientRef, offering: bid.offering, sector: bid.sector, workflowId: bid.workflowId, partnerId: bid.partnerId, bidManagerId: bid.bidManagerId, confidential: Boolean(bid.confidential), notes: bid.notes || '' };
  const set = (patch) => setD({ ...f, ...patch });
  const saveDetails = async () => {
    const patch = { ...f, value: Number(f.value) || 0, closing: f.closing?.date ? f.closing : null };
    await dispatch('bid.update', { bidId: bid.id, patch }, { success: 'Bid details saved' });
    setD(null);
  };
  const flags = bid.flags || {};
  const disclosureDefault = aiDisclosureText(view, bid, []);
  const ro = !planner;

  return (
    <div className="stack">
      {ro && <div className="callout small"><Icon name="lock" size={12} /> Only the bid manager, the accountable partner and administrators can change these settings.</div>}
      <Card title="Bid details" actions={d && planner ? <div className="row"><button className="btn btn-sm" onClick={() => setD(null)}>Discard</button><button className="btn btn-sm btn-primary" onClick={saveDetails}>Save</button></div> : null}>
        <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            <Field label="Opportunity title" full><input value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label="Client reference"><input value={f.clientRef || ''} onChange={(e) => set({ clientRef: e.target.value })} /></Field>
            <Field label="Estimated value (AUD ex GST)"><input type="number" value={f.value || ''} onChange={(e) => set({ value: e.target.value })} /></Field>
            <Field label="Closing date"><input type="date" value={f.closing?.date || ''} onChange={(e) => set({ closing: { ...f.closing, date: e.target.value } })} /></Field>
            <Field label="Closing time (client time zone)"><input type="time" value={f.closing?.time || ''} onChange={(e) => set({ closing: { ...f.closing, time: e.target.value } })} /></Field>
            <Field label="Client time zone"><select value={f.closing?.tz || 'Australia/Sydney'} onChange={(e) => set({ closing: { ...f.closing, tz: e.target.value } })}>{TIMEZONES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></Field>
            <Field label="Submission channel"><input list="bs-channels" value={f.channel || ''} onChange={(e) => set({ channel: e.target.value })} /><datalist id="bs-channels">{CHANNELS.map((c) => <option key={c} value={c} />)}</datalist></Field>
            <Field label="Offering"><select value={f.offering || ''} onChange={(e) => set({ offering: e.target.value })}><option value="">—</option>{view.taxonomy.offerings.map((o) => <option key={o}>{o}</option>)}</select></Field>
            <Field label="Sector"><select value={f.sector || ''} onChange={(e) => set({ sector: e.target.value })}><option value="">—</option>{view.taxonomy.sectors.map((o) => <option key={o}>{o}</option>)}</select></Field>
            <Field label="Workflow template" hint="Stages, gates and approval rules (WF-06)"><select value={f.workflowId} onChange={(e) => set({ workflowId: e.target.value })}>{view.workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
            <Field label="Accountable partner"><UserSelect value={f.partnerId} onChange={(v) => set({ partnerId: v })} filter={(u) => u.roles.includes('partner')} /></Field>
            <Field label="Bid manager"><UserSelect value={f.bidManagerId} onChange={(v) => set({ bidManagerId: v })} filter={(u) => u.roles.some((r) => ['bidManager', 'partner'].includes(r))} /></Field>
            <Field label="Confidential opportunity" hint="Hidden from portfolio viewers"><label className="check"><input type="checkbox" checked={f.confidential} onChange={(e) => set({ confidential: e.target.checked })} /><span>Confidential</span></label></Field>
            <Field label="Notes" full><textarea rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          </div>
        </fieldset>
      </Card>

      <div className="split">
        <Card title="Bid team" subtitle="Team members see the bid; roles decide what they can do on it" actions={planner && JSON.stringify(members) !== JSON.stringify(bid.members || []) ? <button className="btn btn-sm btn-primary" onClick={() => dispatch('bid.members', { bidId: bid.id, members }, { success: 'Team updated; new members notified' })}>Save team</button> : null}>
          <div className="stack" style={{ gap: 6 }}>
            <div className="row"><Person id={bid.partnerId} /><span className="pill navy">Accountable partner</span></div>
            <div className="row"><Person id={bid.bidManagerId} /><span className="pill navy">Bid manager</span></div>
            {members.map((m, i) => (
              <div key={m.userId} className="row" style={{ justifyContent: 'space-between' }}>
                <Person id={m.userId} sub={view.users.find((u) => u.id === m.userId)?.roles.map(roleLabel).join(', ')} />
                <div className="row">
                  <select value={m.role} disabled={ro} onChange={(e) => setMembers(members.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} aria-label="Role on this bid">{MEMBER_ROLES.map((r) => <option key={r} value={r}>{ROLES.find((x) => x.id === r)?.label || 'Member'}</option>)}</select>
                  {!ro && <button className="icon-btn" aria-label="Remove" onClick={() => setMembers(members.filter((_, j) => j !== i))}>✕</button>}
                </div>
              </div>
            ))}
            {!ro && <UserSelect value="" placeholder="Add a person…" exclude={[bid.partnerId, bid.bidManagerId, ...members.map((m) => m.userId), ...(bid.ethicalWall?.users || [])]} onChange={(v) => v && setMembers([...members, { userId: v, role: 'member' }])} />}
            <p className="mini" style={{ margin: 0 }}>Section owners and reviewers are also part of the team for the sections they are assigned.</p>
          </div>
        </Card>
        <Card title="Ethical wall" subtitle="People behind the wall cannot see or search this bid, even with a portfolio role">
          <fieldset disabled={!wallOwner} style={{ border: 0, padding: 0, margin: 0 }}>
            <Field label="Excluded people" full><MultiUser value={wall.users} onChange={(v) => setWall({ ...wall, users: v })} exclude={[bid.partnerId, me.id]} /></Field>
            <Field label="Reason" full><input value={wall.reason} onChange={(e) => setWall({ ...wall, reason: e.target.value })} placeholder="For example: conflict of interest from a current engagement" /></Field>
            {wallOwner && <button className="btn btn-primary" disabled={JSON.stringify(wall.users) === JSON.stringify(bid.ethicalWall?.users || []) && wall.reason === (bid.ethicalWall?.reason || '')} onClick={() => dispatch('bid.ethicalWall', { bidId: bid.id, ...wall }, { success: wall.users.length ? 'Ethical wall set' : 'Ethical wall removed' })}>Save ethical wall</button>}
          </fieldset>
          {!wallOwner && <p className="mini">Only the accountable partner or an administrator can change the ethical wall.</p>}
        </Card>
      </div>

      <div className="split">
        <Card title="AI on this bid" subtitle="Switch AI off where the client prohibits its use (spec 16, AI governance)">
          <label className="check"><input type="checkbox" checked={bid.aiEnabled !== false} disabled={ro} onChange={(e) => dispatch('bid.update', { bidId: bid.id, patch: { aiEnabled: e.target.checked } }, { success: e.target.checked ? 'AI enabled' : 'AI switched off for this bid' })} /><span>Allow AI drafting, storyboards and analysis on this bid</span></label>
          <Field label="AI disclosure statement" hint="Included in the proposal where the template uses {{#if ai_disclosure}}; leave empty to use the default" full>
            <textarea rows={3} disabled={ro} defaultValue={bid.aiDisclosure || ''} placeholder={disclosureDefault} onBlur={(e) => { if (e.target.value !== (bid.aiDisclosure || '')) dispatch('bid.update', { bidId: bid.id, patch: { aiDisclosure: e.target.value } }, { success: 'Disclosure saved' }); }} />
          </Field>
        </Card>
        <Card title="Template conditions" subtitle="Custom flags used by {{#if …}} blocks in Word templates, such as lot_1 or lot_2">
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(flags).map(([k, v]) => <label key={k} className="chip"><input type="checkbox" checked={Boolean(v)} disabled={ro} onChange={(e) => dispatch('bid.update', { bidId: bid.id, patch: { flags: { ...flags, [k]: e.target.checked } } }, { quiet: true }).catch((err) => toast(err.message, 'error'))} /> {k}</label>)}
            {!Object.keys(flags).length && <span className="muted small">No custom flags.</span>}
          </div>
          {!ro && <div className="row" style={{ marginTop: 10 }}><input value={flag} onChange={(e) => setFlag(e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())} placeholder="new_flag" aria-label="New flag" /><button className="btn btn-sm" disabled={!flag} onClick={() => dispatch('bid.update', { bidId: bid.id, patch: { flags: { ...flags, [flag]: true } } }, { success: `Flag ${flag} added` }).then(() => setFlag(''))}>Add flag</button></div>}
        </Card>
      </div>

      {planner && !['archived', 'closed'].includes(bid.stage) && (
        <Card title="Archive this bid" subtitle="For opportunities that will not proceed. The bid and its audit trail are kept.">
          <button className="btn btn-danger" onClick={() => setArchive(true)}>Archive bid…</button>
        </Card>
      )}
      {archive && <Confirm title="Archive this bid?" danger confirmLabel="Archive" requireText="Reason" onClose={() => setArchive(false)} onConfirm={(reason) => dispatch('bid.archive', { bidId: bid.id, reason }, { success: 'Bid archived' }).then(() => nav('/bids'))}><p>The bid moves to Archived. Its content, outputs and audit trail are retained.</p></Confirm>}
    </div>
  );
}
