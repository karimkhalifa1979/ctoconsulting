import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP, useCan } from '../../lib/store.jsx';
import { Card, Modal } from '../../../components/ui.jsx';
import { UserSelect, MultiUser, TagInput, SectionStatus, Blockers, Field, Confirm } from '../../components/common.jsx';
import { DEFAULT_OUTLINE, SHORT_OUTLINE } from '../../core/seed/index.js';
import { textSimilarity } from '../../core/search.js';
import { slug, fmtDate } from '../../core/util.js';
import { defaultSectionDue } from '../../core/schedule.js';

// WF-01: propose an outline from a CTO template or from the client's mandated structure (its evaluation criteria).
function proposeOutline(bid, source) {
  const reqs = bid.requirements.filter((r) => !r.excluded);
  if (source === 'client' && bid.criteria.length) {
    const secs = bid.criteria.map((c) => ({ key: slug(c.name), title: c.name.replace(/^./, (x) => x.toUpperCase()), brief: `Responds to the “${c.name}” criterion${c.weight ? ` (${c.weight}%)` : ''}.`, wordLimit: 600, commercial: /price|value|cost/i.test(c.name), reqIds: reqs.filter((r) => r.criterionId === c.id).map((r) => r.id) }));
    const unassigned = reqs.filter((r) => !r.criterionId);
    if (unassigned.length) secs.push({ key: 'other_requirements', title: 'Other requirements and compliance', brief: 'Requirements not tied to an evaluation criterion.', wordLimit: 500, commercial: false, reqIds: unassigned.map((r) => r.id) });
    return [{ key: 'executive_summary', title: 'Executive summary', wordLimit: 400, reqIds: [] }, ...secs];
  }
  const base = (source === 'short' ? SHORT_OUTLINE : DEFAULT_OUTLINE).map((s) => ({ ...s, reqIds: [] }));
  for (const r of reqs) {
    let best = null, score = 0;
    for (const s of base) {
      if (s.key === 'executive_summary') continue;
      const hint = { understanding: 'understanding needs background objectives', approach: 'approach methodology migration design build deliver', delivery_plan: 'plan timeline transition schedule milestones', governance: 'governance risk quality reporting benefits', team: 'personnel team clearance lead experience staff', experience: 'experience case studies previous similar', commercial: 'price pricing rates invoice payment fixed capped', compliance: 'insurance comply code conduct certification iso modern slavery' }[s.key] || '';
      const sc = textSimilarity(r.text, `${s.title} ${hint}`) + (r.category === 'Commercial' && s.commercial ? 0.3 : 0);
      if (sc > score) { best = s; score = sc; }
    }
    (best || base.find((s) => s.key === 'approach') || base[1]).reqIds.push(r.id);
  }
  return base;
}

function OutlineBuilder({ bid, onClose }) {
  const { dispatch } = useP();
  const [source, setSource] = useState(bid.criteria.length ? 'client' : 'standard');
  const proposal = useMemo(() => proposeOutline(bid, source), [bid, source]);
  const [skip, setSkip] = useState({});
  const apply = async () => {
    const sections = proposal.filter((s) => !skip[s.key]);
    await dispatch('outline.apply', { bidId: bid.id, sections, mode: bid.sections.length ? 'append' : 'replace', source: source === 'client' ? 'client-mandated structure' : `${source} template` }, { success: `Outline built with ${sections.length} sections and requirement mappings` });
    onClose();
  };
  return (
    <Modal title="Build the response outline" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={apply}>Create {proposal.filter((s) => !skip[s.key]).length} sections</button></>}>
      <div className="row" style={{ marginBottom: 10 }}>
        <label className="check"><input type="radio" checked={source === 'client'} onChange={() => setSource('client')} disabled={!bid.criteria.length} /><span>Client’s structure (from the evaluation criteria)</span></label>
        <label className="check"><input type="radio" checked={source === 'standard'} onChange={() => setSource('standard')} /><span>CTO Consulting proposal template</span></label>
        <label className="check"><input type="radio" checked={source === 'short'} onChange={() => setSource('short')} /><span>Short-form response</span></label>
      </div>
      <p className="mini" style={{ marginTop: 0 }}>The platform proposes where each extracted requirement is answered. You can change mappings on the compliance matrix.</p>
      {proposal.map((s) => (
        <label key={s.key} className="check" style={{ padding: '7px 0', borderBottom: '1px dashed var(--line)' }}>
          <input type="checkbox" checked={!skip[s.key]} onChange={() => setSkip({ ...skip, [s.key]: !skip[s.key] })} />
          <span style={{ flex: 1 }}><strong>{s.title}</strong>{s.commercial && <span className="pill teal" style={{ marginLeft: 6 }}>commercial</span>}<div className="mini">{s.reqIds.length ? `Answers ${s.reqIds.map((id) => bid.requirements.find((r) => r.id === id)?.ref).join(', ')}` : 'No requirements mapped'}{s.wordLimit ? ` · ${s.wordLimit} words` : ''}</div></span>
        </label>
      ))}
    </Modal>
  );
}

function SectionModal({ bid, section, onClose }) {
  const { dispatch } = useP();
  const [f, setF] = useState(section ? { ...section } : { title: '', brief: '', wordLimit: '', ownerId: null, contributors: [], reviewers: [], due: defaultSectionDue(bid) || '', commercial: false });
  const walled = bid.ethicalWall?.users || [];
  const save = async () => {
    const patch = { title: f.title, brief: f.brief, wordLimit: f.wordLimit, ownerId: f.ownerId, contributors: f.contributors, reviewers: f.reviewers, due: f.due, commercial: f.commercial };
    if (section) await dispatch('section.update', { bidId: bid.id, sectionId: section.id, patch }, { success: 'Section updated' });
    else await dispatch('section.add', { bidId: bid.id, section: patch }, { success: 'Section added' });
    onClose();
  };
  return (
    <Modal title={section ? `Section: ${section.title}` : 'Add a section'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!f.title?.trim()} onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Title" full><input type="text" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Brief for the author" full><textarea value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} /></Field>
        <Field label="Owner"><UserSelect value={f.ownerId} onChange={(v) => setF({ ...f, ownerId: v })} exclude={walled} filter={(u) => u.roles.some((r) => ['author', 'partner', 'bidManager'].includes(r))} /></Field>
        <Field label="Due date"><input type="date" value={f.due || ''} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
        <Field label="Word limit"><input type="number" min="0" value={f.wordLimit || ''} onChange={(e) => setF({ ...f, wordLimit: e.target.value })} /></Field>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.commercial} onChange={(e) => setF({ ...f, commercial: e.target.checked })} /><span>Commercial section (covered by gate 2)</span></label>
        <Field label="Contributors" full><MultiUser value={f.contributors} onChange={(v) => setF({ ...f, contributors: v })} exclude={walled} filter={(u) => u.roles.some((r) => ['author', 'partner', 'bidManager'].includes(r))} /></Field>
        <Field label="Reviewers" hint="all must approve the current version" full><MultiUser value={f.reviewers} onChange={(v) => setF({ ...f, reviewers: v })} exclude={walled} filter={(u) => u.roles.some((r) => ['reviewer', 'partner', 'commercial'].includes(r))} /></Field>
      </div>
    </Modal>
  );
}

export default function Plan({ bid }) {
  const { dispatch, userName } = useP();
  const can = useCan();
  const plan = can('planSections', { bid });
  const [builder, setBuilder] = useState(false);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [themes, setThemes] = useState(bid.plan?.winThemes || []);
  const [milestones, setMilestones] = useState(bid.plan?.milestones || []);
  const move = (i, dir) => {
    const ids = bid.sections.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    dispatch('section.reorder', { bidId: bid.id, ids }, { quiet: true });
  };
  const missing = bid.sections.filter((s) => !s.ownerId || !s.due);
  const reqCount = (s) => bid.requirements.filter((r) => (r.sectionIds || []).includes(s.id)).length;
  return (
    <div className="stack">
      {bid.plan?.published ? <div className="callout">The plan was published {fmtDate(bid.plan.publishedAt)} by {userName(bid.plan.publishedBy)}. Owners and reviewers were notified. Changes to owners or reviewers notify the people affected.</div> : plan && <Blockers title="Before publishing the plan" items={[...(!bid.sections.length ? ['Build the response outline.'] : []), ...(missing.length ? [`${missing.length} section(s) need an owner and a due date.`] : [])]} />}
      <Card title="Response outline" subtitle="Each section has one owner, a due date, a word limit, reviewers and its linked client requirements (WF-02)"
        actions={plan && <>{<button className="btn" onClick={() => setBuilder(true)}>{bid.sections.length ? 'Add from template' : 'Build outline'}</button>}<button className="btn" onClick={() => setEdit('new')}>Add section</button>{!bid.plan?.published && <button className="btn btn-primary" disabled={!bid.sections.length || missing.length > 0} onClick={() => dispatch('plan.publish', { bidId: bid.id }, { success: 'Plan published. Section owners and reviewers have been notified.' })}>Publish plan</button>}</>} pad={false}>
        {!bid.sections.length ? <div className="empty"><h3>No outline yet</h3><p>Build it from the client’s structure or a CTO Consulting template. The platform proposes where each requirement is answered.</p>{plan && <button className="btn btn-primary" onClick={() => setBuilder(true)}>Build outline</button>}</div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th style={{ width: 60 }} /><th>Section</th><th>Owner</th><th>Reviewers</th><th>Due</th><th className="right">Words</th><th className="right">Reqs</th><th>Status</th><th /></tr></thead>
              <tbody>
                {bid.sections.map((s, i) => (
                  <tr key={s.id}>
                    <td className="nowrap">{plan && <><button className="btn btn-sm btn-ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button><button className="btn btn-sm btn-ghost" disabled={i === bid.sections.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button></>}</td>
                    <td><Link to={`/bids/${bid.id}/sections/${s.id}`}><strong>{s.title}</strong></Link>{s.commercial && <span className="pill teal" style={{ marginLeft: 6 }}>commercial</span>}{s.brief && <div className="mini clamp-2">{s.brief}</div>}</td>
                    <td>{plan ? <UserSelect value={s.ownerId} onChange={(v) => dispatch('section.update', { bidId: bid.id, sectionId: s.id, patch: { ownerId: v } })} exclude={bid.ethicalWall?.users || []} filter={(u) => u.roles.some((r) => ['author', 'partner', 'bidManager'].includes(r))} placeholder="Choose owner…" /> : userName(s.ownerId)}</td>
                    <td className="small">{(s.reviewers || []).map(userName).join(', ') || <span className="muted">—</span>}</td>
                    <td>{plan ? <input type="date" value={s.due || ''} onChange={(e) => dispatch('section.update', { bidId: bid.id, sectionId: s.id, patch: { due: e.target.value } }, { quiet: true })} /> : fmtDate(s.due)}</td>
                    <td className="right tabular">{s.wordLimit || '—'}</td>
                    <td className="right tabular">{reqCount(s)}</td>
                    <td><SectionStatus status={s.status} /></td>
                    <td className="right nowrap">{plan && <><button className="btn btn-sm btn-ghost" onClick={() => setEdit(s)}>Edit</button><button className="btn btn-sm btn-ghost btn-danger" onClick={() => setDel(s)} aria-label={`Delete ${s.title}`}>✕</button></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="split">
        <Card title="Win themes" subtitle="Used by drafting, the executive summary and the presentation">
          <TagInput value={themes} onChange={setThemes} disabled={!plan} placeholder="Add a win theme" />
          {plan && JSON.stringify(themes) !== JSON.stringify(bid.plan?.winThemes || []) && <button className="btn btn-sm btn-primary" style={{ marginTop: 10 }} onClick={() => dispatch('plan.update', { bidId: bid.id, winThemes: themes }, { success: 'Win themes saved' })}>Save win themes</button>}
        </Card>
        <Card title="Milestones" subtitle="Back-scheduled from the submission deadline (WF-13)" actions={plan && bid.closing?.date && <button className="btn btn-sm" onClick={() => dispatch('plan.reschedule', { bidId: bid.id, sectionDues: true }, { success: 'Milestones and missing section due dates back-scheduled' }).then(() => setMilestones([]))}>Back-schedule</button>}>
          {(milestones.length ? milestones : bid.plan?.milestones || []).map((m, i) => (
            <div key={m.id} className="row" style={{ justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dashed var(--line)' }}>
              <span className="small">{m.label}</span>
              {plan ? <input type="date" value={m.date} onChange={(e) => { const list = [...(milestones.length ? milestones : bid.plan.milestones)]; list[i] = { ...m, date: e.target.value }; setMilestones(list); }} /> : <span className="small tabular">{fmtDate(m.date)}</span>}
            </div>
          ))}
          {plan && milestones.length > 0 && <button className="btn btn-sm btn-primary" style={{ marginTop: 10 }} onClick={() => dispatch('plan.update', { bidId: bid.id, milestones }, { success: 'Milestones saved' }).then(() => setMilestones([]))}>Save milestones</button>}
        </Card>
      </div>
      {builder && <OutlineBuilder bid={bid} onClose={() => setBuilder(false)} />}
      {edit && <SectionModal bid={bid} section={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {del && <Confirm title={`Delete “${del.title}”?`} danger confirmLabel="Delete section" onClose={() => setDel(null)} onConfirm={() => dispatch('section.delete', { bidId: bid.id, sectionId: del.id, force: true }, { success: 'Section deleted' })}>{del.content ? 'This section has content. Its version history is deleted with it; the deletion is recorded in the audit trail.' : 'Requirements mapped to it become unmapped.'}</Confirm>}
    </div>
  );
}
