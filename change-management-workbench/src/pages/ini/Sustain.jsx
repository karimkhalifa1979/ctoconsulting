// Sustain outcomes (SUS-001 to SUS-007): performance review against success measures with commentary
// and gap analysis, the Sustainment Plan of reinforcement mechanisms, transfer of ownership with the
// handover checklist, lessons learned, and the Change Management Closeout with closure of the initiative.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Tabs, Empty, Badge, StatusBadge, Spinner, Kpi, Rag } from '../../ui/core.jsx';
import Register from '../../ui/Register.jsx';
import ApprovalPanel from '../../ui/Approvals.jsx';
import { RichText, RefPicker } from '../../ui/fields.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { fmtDate, fmtNum, label, options } from '../../lib/format.js';
import { MEASURE_STATUS_LABELS } from '../../../shared/rules/measures.js';
import { addMonths } from '../../../shared/dates.js';
import { asArray } from '../../../shared/util.js';
import { hasRole } from '../../../shared/access.js';

const CATS = ['organisational', 'individual', 'changeManagement'];

export default function Sustain() {
  const { m, base } = useIniPage();
  const [tab, setTab] = useTab('review');
  if (!m) return <Spinner />;
  const pending = m.handoverItems.filter((h) => h.status !== 'accepted').length;
  return (
    <>
      <PageHead eyebrow="Phase 3 · Sustain Outcomes" title="Sustain outcomes" actions={<><Link className="btn" to={`${base}/artefacts?type=sustainmentPlan`}><Icon name="file" />Sustainment Plan</Link><Link className="btn btn-primary" to={`${base}/artefacts?type=closeout`}><Icon name="file" />Closeout</Link></>}>
        Review performance against the definition of success, put reinforcement in place, transfer ownership to the business, capture what was learned and close the initiative.
      </PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'review', label: 'Performance review' },
        { id: 'plan', label: 'Sustainment Plan', count: m.sustainmentItems.length },
        { id: 'handover', label: 'Transfer of ownership', count: pending || null },
        { id: 'lessons', label: 'Lessons learned', count: m.lessons.length },
        { id: 'closeout', label: 'Closeout' },
      ]} />
      {tab === 'review' && <Review />}
      {tab === 'plan' && <SustainmentPlan />}
      {tab === 'handover' && <Handover />}
      {tab === 'lessons' && <Register type="lesson" title="Lessons learned" sub="What worked, what did not and what to do next time, categorised and searchable across initiatives (SUS-004)." facets={['category', 'phase']} defaults={{ date: m.today, phase: 'p3' }} toolbar={<Link className="btn btn-sm" to="/lessons"><Icon name="search" />Search all lessons</Link>} />}
      {tab === 'closeout' && <Closeout />}
    </>
  );
}

// The closeout record holds the review commentary; it is created on first use.
function useCloseout() {
  const { m, mut, ini } = useIniPage();
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!m.closeout && !creating && !ini.readOnly) {
      setCreating(true);
      mut.op('ensureSingleton', { initiativeId: ini.id, type: 'closeout' }, { quiet: true }).catch(() => {});
    }
  }, [m.closeout, creating, ini.readOnly, ini.id, mut]);
  return m.closeout;
}

// SUS-001: organisational, individual and change management performance with commentary and gaps.
function Review() {
  const { m, mut, toast, canDo, config } = useIniPage();
  const co = useCloseout();
  const [draft, setDraft] = useState(null);
  const editable = co && canDo('U', 'closeout', co) && co.status !== 'approved';
  const reviews = Object.fromEntries(asArray(co?.measureReviews).map((r) => [r.measureId, r]));
  const rows = (draft || reviews);
  const set = (id, k, v) => setDraft({ ...(draft || reviews), [id]: { ...(draft || reviews)[id], measureId: id, [k]: v } });
  const save = async () => {
    const list = m.measures.map((x) => ({ measureId: x.id, actual: x.latest, gap: x.target != null && x.latest != null ? Math.round((x.target - x.latest) * 100) / 100 : null, commentary: rows[x.id]?.commentary || '', gapAnalysis: rows[x.id]?.gapAnalysis || '' }));
    await mut.update('closeout', co.id, { measureReviews: list }, { version: co.version });
    setDraft(null);
    toast.success('Performance review saved');
  };
  const done = m.activities.filter((a) => a.status === 'complete').length;
  const live = m.activities.filter((a) => a.status !== 'cancelled').length;
  return (
    <div className="stack">
      <div className="kpis">
        {CATS.map((c) => {
          const xs = m.measures.filter((x) => x.category === c);
          const met = xs.filter((x) => x.status === 'onTrack').length;
          return <Kpi key={c} label={label('measureCategory', c, config).replace(/ \(.*\)/, '')} value={xs.length ? `${met} of ${xs.length}` : '—'} sub="measures meeting target" tone={xs.length && met < xs.length ? 'warning' : xs.length ? 'good' : ''} />;
        })}
        <Kpi label="Change activities delivered" value={live ? `${Math.round((done / live) * 100)}%` : '—'} sub={`${done} of ${live} activities complete`} />
      </div>
      {!co && <Spinner label="Preparing the review" />}
      {co && CATS.map((c) => {
        const xs = m.measures.filter((x) => x.category === c);
        if (!xs.length) return null;
        return (
          <Card key={c} title={label('measureCategory', c, config)} flush>
            <table className="tbl">
              <thead><tr><th>Measure</th><th className="num">Baseline</th><th className="num">Actual</th><th className="num">Target</th><th>Result</th><th style={{ width: '30%' }}>Commentary</th><th style={{ width: '24%' }}>Gap analysis</th></tr></thead>
              <tbody>{xs.map((x) => (
                <tr key={x.id}>
                  <td><strong>{x.name}</strong><span className="tiny muted sub-line">{x.latestDate ? `as at ${fmtDate(x.latestDate)}` : 'no values'}</span></td>
                  <td className="num">{x.baseline != null ? `${fmtNum(x.baseline, 2)}${x.unit || ''}` : '—'}</td>
                  <td className="num"><strong>{x.latest != null ? `${fmtNum(x.latest, 2)}${x.unit || ''}` : '—'}</strong></td>
                  <td className="num">{fmtNum(x.target, 2)}{x.unit || ''}</td>
                  <td><StatusBadge status={x.status === 'onTrack' ? 'complete' : x.status === 'offTrack' ? 'overdue' : x.status === 'atRisk' ? 'atRisk' : 'draft'} labelText={x.status === 'onTrack' ? 'Target met' : MEASURE_STATUS_LABELS[x.status]} /></td>
                  <td>{editable ? <textarea aria-label={`Commentary for ${x.name}`} rows={2} style={{ width: '100%' }} value={rows[x.id]?.commentary || ''} onChange={(e) => set(x.id, 'commentary', e.target.value)} /> : <span className="small">{rows[x.id]?.commentary || '—'}</span>}</td>
                  <td>{x.status === 'onTrack' ? <span className="small muted">No gap</span> : editable ? <textarea aria-label={`Gap analysis for ${x.name}`} rows={2} style={{ width: '100%' }} placeholder="Why the gap, and what will close it" value={rows[x.id]?.gapAnalysis || ''} onChange={(e) => set(x.id, 'gapAnalysis', e.target.value)} /> : <span className="small">{rows[x.id]?.gapAnalysis || '—'}</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        );
      })}
      {co && !m.measures.length && <Empty icon="target" title="No success measures">Define success measures in Setup to review performance (INI-004).</Empty>}
      {draft && <div className="sticky-actions"><button type="button" className="btn" onClick={() => setDraft(null)}>Discard</button><button type="button" className="btn btn-primary" onClick={save}>Save review</button></div>}
    </div>
  );
}

// SUS-002: reinforcement mechanisms with owners and review dates; flags mechanisms not yet covered.
function SustainmentPlan() {
  const { m, config, today } = useIniPage();
  const covered = new Set(m.sustainmentItems.map((s) => s.mechanism));
  const missing = options('sustainmentMechanism', config).filter((o) => !covered.has(o.id));
  const due = m.sustainmentItems.filter((s) => s.reviewDate && s.reviewDate <= today && s.status !== 'embedded');
  return (
    <div className="stack">
      {missing.length > 0 && <div className="callout small">Reinforcement mechanisms not yet in the plan: {missing.map((o) => o.label.toLowerCase()).join(', ')}. Not every change needs all six, but each should be considered.</div>}
      {due.length > 0 && <div className="callout warn small"><strong>Reviews due:</strong> {due.map((s) => `${label('sustainmentMechanism', s.mechanism, config)} (${fmtDate(s.reviewDate)})`).join(', ')}.</div>}
      <Register type="sustainmentItem" title="Sustainment Plan" sub="Recognition, measurement and reporting, aligned performance objectives, accountability, corrective action and ongoing support, each with an owner and review date (SUS-002)." facets={['mechanism', 'status']} bulkFields={['status']} defaults={{ status: 'planned', frequency: 'monthly' }} />
    </div>
  );
}

// SUS-003: sustainment owners for each group and measure, the handover checklist and acceptance.
function Handover() {
  const { m, mut, toast, canDo, lookups, user, today } = useIniPage();
  const accept = async (h) => {
    await mut.update('handoverItem', h.id, { status: 'accepted', acceptedBy: lookups.nameOf('stakeholder', h.ownerId) || user.name, acceptedDate: today, transferDate: h.transferDate || today }, { version: h.version });
    toast.success('Handover accepted');
  };
  const setOwner = async (type, rec, ownerId) => {
    await mut.update(type, rec.id, { sustainmentOwnerId: ownerId || null }, { version: rec.version, quiet: true });
    toast.success('Sustainment owner nominated');
  };
  const people = lookups.optionsFor('stakeholder');
  const accepted = m.handoverItems.filter((h) => h.status === 'accepted').length;
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Handover items accepted" value={`${accepted} of ${m.handoverItems.length}`} tone={accepted < m.handoverItems.length ? 'warning' : 'good'} />
        <Kpi label="Groups with an owner" value={`${m.groups.filter((g) => g.sustainmentOwnerId).length} of ${m.groups.length}`} />
        <Kpi label="Measures with an owner" value={`${m.measures.filter((x) => x.sustainmentOwnerId).length} of ${m.measures.length}`} />
      </div>
      <div className="grid g-2">
        <Card title="Sustainment owners by group" flush>
          <table className="tbl"><tbody>{m.groups.map((g) => (
            <tr key={g.id}><td style={{ width: '45%' }}><strong>{g.name}</strong></td><td>{canDo('U', 'impactedGroup', g) ? <RefPicker options={people} search={lookups.search?.stakeholder} value={g.sustainmentOwnerId || null} onChange={(v) => setOwner('impactedGroup', g, v)} placeholder="Nominate an owner" /> : lookups.nameOf('stakeholder', g.sustainmentOwnerId) || '—'}</td></tr>
          ))}</tbody></table>
        </Card>
        <Card title="Sustainment owners by measure" flush>
          <table className="tbl"><tbody>{m.measures.map((x) => (
            <tr key={x.id}><td style={{ width: '45%' }}><strong>{x.name}</strong>{x.postCloseoutMonths ? <span className="tiny muted sub-line">Tracked {x.postCloseoutMonths} months after closeout</span> : null}</td><td>{canDo('U', 'measure', x) ? <RefPicker options={people} search={lookups.search?.stakeholder} value={x.sustainmentOwnerId || null} onChange={(v) => setOwner('measure', x, v)} placeholder="Nominate an owner" /> : lookups.nameOf('stakeholder', x.sustainmentOwnerId) || '—'}</td></tr>
          ))}</tbody></table>
        </Card>
      </div>
      <Register type="handoverItem" title="Handover checklist" sub="What the business takes over, who accepts it and when ownership transfers." facets={['status']} defaults={{ status: 'pending' }}
        append={[{ key: '_acc', label: '', sortable: false, render: (h) => h.status !== 'accepted' && canDo('U', 'handoverItem', h) && <button type="button" className="btn btn-xs btn-primary" onClick={(e) => { e.stopPropagation(); accept(h); }}>Record acceptance</button> }]} />
    </div>
  );
}

// SUS-005 to SUS-007: the closeout record, its approval, the closeout artefacts and closure.
function Closeout() {
  const { m, mut, toast, dialog, canDo, ini, base, user, users, settings } = useIniPage();
  const co = useCloseout();
  const [d, setD] = useState(null);
  if (!co) return <Spinner label="Preparing the closeout" />;
  const editable = canDo('U', 'closeout', co) && co.status === 'draft';
  const val = d || co;
  const save = async () => { await mut.update('closeout', co.id, d, { version: co.version }); setD(null); toast.success('Closeout saved'); };
  const closed = ini.initiative?.status === 'closed';
  const close = async () => {
    const ok = await dialog.confirm({ title: 'Close this initiative', message: 'Closing makes every record read-only and cancels open engagements. Sustainment owners can continue to record values for measures tracked after closeout. An administrator can reopen it.', confirmLabel: 'Close initiative', danger: true });
    if (!ok) return;
    try {
      await mut.op('closeInitiative', { id: ini.id }, { quiet: true });
    } catch (e) {
      if (e.status !== 422) { toast.error(e); return; }
      const reason = await dialog.prompt({ title: 'Close anyway?', message: e.message, label: 'Reason for closing now' });
      if (!reason) return;
      await mut.op('closeInitiative', { id: ini.id, reason });
    }
    toast.success('Initiative closed and made read-only');
  };
  const reopen = async () => {
    const reason = await dialog.prompt({ title: 'Reopen the initiative', label: 'Reason', message: 'Reopening is recorded in the audit trail.' });
    if (reason) { await mut.op('reopenInitiative', { id: ini.id, reason }); toast.success('Initiative reopened'); }
  };
  const tracked = m.measures.filter((x) => x.postCloseoutMonths > 0);
  const lead = users.find((u) => u.id === m.initiative.changeLeadId);
  const sponsorUser = users.find((u) => u.stakeholderId === m.initiative.primarySponsorId);
  return (
    <div className="grid g-2" style={{ alignItems: 'start' }}>
      <Card title="Change Management Closeout" sub={`Status: ${{ draft: 'Draft', forReview: 'For review', approved: 'Approved' }[co.status]}`} actions={<Rag value={val.overallRag} text={val.overallRag ? label('rag', val.overallRag) : 'Not rated'} />}>
        <div className="stack">
          <label className="field"><span>Performance summary</span>{editable ? <RichText ariaLabel="Performance summary" value={val.performanceSummary} onChange={(v) => setD({ ...val, performanceSummary: v })} /> : <div className="prose small" dangerouslySetInnerHTML={{ __html: co.performanceSummary || '<p>—</p>' }} />}</label>
          <label className="field"><span>Overall result</span><select disabled={!editable} value={val.overallRag || ''} onChange={(e) => setD({ ...val, overallRag: e.target.value })}><option value="">Not rated</option>{options('rag').map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          <label className="field"><span>Sustainment status</span><textarea rows={2} disabled={!editable} value={val.sustainmentStatus || ''} onChange={(e) => setD({ ...val, sustainmentStatus: e.target.value })} /></label>
          <label className="field"><span>Handover status</span><textarea rows={2} disabled={!editable} value={val.handoverStatus || ''} onChange={(e) => setD({ ...val, handoverStatus: e.target.value })} placeholder={`${m.handoverItems.filter((h) => h.status === 'accepted').length} of ${m.handoverItems.length} handover items accepted`} /></label>
          <label className="field"><span>Recommendations</span><textarea rows={3} disabled={!editable} value={val.recommendations || ''} onChange={(e) => setD({ ...val, recommendations: e.target.value })} /></label>
          {d && <div className="btn-row"><button type="button" className="btn" onClick={() => setD(null)}>Discard</button><button type="button" className="btn btn-primary" onClick={save}>Save closeout</button></div>}
          <div className="form-section">
            <h3>Approval</h3>
            <ApprovalPanel subjectType="closeout" subjectId={co.id} label="Change Management Closeout" canSubmit={editable && !d} defaultApprovers={[sponsorUser?.id, lead?.id].filter(Boolean)} compact />
          </div>
        </div>
      </Card>
      <div className="stack">
        <Card title="Closeout artefacts" sub="The closeout report (Word and PDF) and the closeout presentation (PowerPoint), generated from the data above (SUS-005).">
          <div className="btn-row">
            <Link className="btn btn-primary" to={`${base}/artefacts?type=closeout`}><Icon name="file" />Generate closeout</Link>
            <Link className="btn" to={`${base}/artefacts?type=lessonsReport`}><Icon name="file" />Lessons learned report</Link>
            <Link className="btn" to={`${base}/artefacts?type=handoverChecklist`}><Icon name="file" />Handover checklist</Link>
          </div>
        </Card>
        <Card title="After closeout" sub="Measures sustainment owners keep tracking (SUS-006)">
          {tracked.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{tracked.map((x) => <li key={x.id}>{x.name}: {x.postCloseoutMonths} months, owner {m.stakeholderName(x.sustainmentOwnerId) || <em>not nominated</em>}{m.initiative.closedAt ? `, until ${fmtDate(addMonths(String(m.initiative.closedAt).slice(0, 10), x.postCloseoutMonths))}` : ''}</li>)}</ul> : <p className="small muted">No measures are set to be tracked after closeout. Set "Track after closeout (months)" on a measure.</p>}
        </Card>
        <Card title={closed ? 'This initiative is closed' : 'Close the initiative'} sub={closed ? `Closed ${fmtDate(String(m.initiative.closedAt || '').slice(0, 10))}. Records are read-only and kept for ${settings.retention?.engagement?.years ?? 7} years (SUS-007).` : 'Closing makes the initiative read-only and retains it under the retention rules (SUS-007).'}>
          {!closed && (
            <>
              <ul className="small" style={{ margin: '0 0 10px', paddingLeft: 18 }}>
                <li>{co.status === 'approved' ? <Badge tone="good" icon="checkCircle">Closeout approved</Badge> : <Badge tone="warning" icon="alert">Closeout not yet approved</Badge>}</li>
                <li>{m.handoverItems.every((h) => h.status === 'accepted') ? <Badge tone="good" icon="checkCircle">All handover items accepted</Badge> : <Badge tone="warning" icon="alert">{m.handoverItems.filter((h) => h.status !== 'accepted').length} handover items pending</Badge>}</li>
              </ul>
              {hasRole(user, 'changeLead') && <button type="button" className="btn btn-danger" onClick={close}><Icon name="lock" />Close initiative</button>}
            </>
          )}
          {closed && hasRole(user, 'admin') && <button type="button" className="btn" onClick={reopen}><Icon name="unlock" />Reopen</button>}
        </Card>
      </div>
    </div>
  );
}

