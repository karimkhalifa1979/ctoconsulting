// Interventions and assessments (ADM-008, ADM-001): the intervention library suggested for each ADKAR
// barrier point, the assessment question sets (change characteristics, organisational attributes, PCT and
// sponsor), the readiness checklists and the risk rating matrix. All content is the organisation's own.
import { useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { Card, Tabs, Badge, Empty, Modal } from '../../ui/core.jsx';
import { useApp, useDialog } from '../../state/app.jsx';
import { useSaveConfig } from './Admin.jsx';
import { useTab } from '../../lib/hooks.js';
import { options, label } from '../../lib/format.js';
import { ADKAR, PLAN_TYPES, QUESTION_SETS } from '../../../shared/refdata.js';
import { DEFAULT_RISK_MATRIX } from '../../../shared/rules/risk.js';
import { asArray, clone, uid } from '../../../shared/util.js';

export default function Library() {
  const [tab, setTab] = useTab('interventions');
  return (
    <div className="stack">
      <Tabs value={tab} onChange={setTab} label="Interventions and assessments" tabs={[
        { id: 'interventions', label: 'Intervention library', icon: 'target' },
        { id: 'questions', label: 'Question sets', icon: 'list' },
        { id: 'readiness', label: 'Readiness checklists', icon: 'checkCircle' },
        { id: 'matrix', label: 'Risk matrix', icon: 'grid' },
      ]} />
      {tab === 'interventions' && <Interventions />}
      {tab === 'questions' && <QuestionSets />}
      {tab === 'readiness' && <Readiness />}
      {tab === 'matrix' && <RiskMatrix />}
    </div>
  );
}

function Interventions() {
  const { config } = useApp();
  const { save, saving } = useSaveConfig();
  const dialog = useDialog();
  const [list, setList] = useState(() => clone(asArray(config.interventions)));
  const [editing, setEditing] = useState(null);
  const dirty = JSON.stringify(list) !== JSON.stringify(config.interventions);
  const remove = async (iv) => { if (await dialog.confirm({ title: `Remove "${iv.title}"`, message: 'It will no longer be suggested. Activities already created from it are not affected.', confirmLabel: 'Remove', danger: true })) setList(list.filter((x) => x.id !== iv.id)); };
  return (
    <>
      <Card title="Intervention library" sub="Suggested when a group's barrier point is identified (ADK-010), and added to plans as activities when accepted." flush
        actions={<div className="btn-row"><button type="button" className="btn btn-sm" onClick={() => setEditing({ element: 'awareness', type: 'briefing', role: 'sponsor', plan: 'sponsor' })}><Icon name="plus" />Add an intervention</button><button type="button" className="btn btn-sm btn-primary" disabled={!dirty || saving} onClick={() => save('interventions', list, 'Intervention library saved')}><Icon name="check" />Save library</button></div>}>
        {ADKAR.map((a) => {
          const items = list.filter((iv) => iv.element === a.id);
          return (
            <div key={a.id} className="lib-group">
              <h3>{a.label} <span className="tiny muted">({items.length})</span></h3>
              {!items.length ? <p className="small muted">No interventions for {a.label.toLowerCase()}.</p> : (
                <table className="tbl tbl-compact">
                  <tbody>{items.map((iv) => (
                    <tr key={iv.id}>
                      <td style={{ width: '42%' }}><strong>{iv.title}</strong><span className="sub-line small muted" style={{ whiteSpace: 'normal' }}>{iv.description}</span></td>
                      <td className="small">{label('responsibleRole', iv.role, config)}</td>
                      <td className="small">{PLAN_TYPES.find((p) => p.id === iv.plan)?.label || iv.plan}</td>
                      <td className="small">{label('engagementType', iv.type, config)}</td>
                      <td className="nowrap"><button type="button" className="btn btn-xs" onClick={() => setEditing(iv)}>Edit</button> <button type="button" className="btn btn-xs btn-ghost" onClick={() => remove(iv)}>Remove</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          );
        })}
      </Card>
      {editing && <InterventionEditor iv={editing} onClose={() => setEditing(null)} onDone={(iv) => { setList(editing.id ? list.map((x) => (x.id === editing.id ? iv : x)) : [...list, { ...iv, id: uid('iv') }]); setEditing(null); }} />}
    </>
  );
}

function InterventionEditor({ iv, onClose, onDone }) {
  const { config } = useApp();
  const [d, setD] = useState(() => ({ ...iv }));
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={iv.id ? 'Edit intervention' : 'New intervention'} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!String(d.title || '').trim()} onClick={() => onDone(d)}>Done</button></>}>
      <div className="form-grid">
        <label className="field" style={{ gridColumn: '1 / -1' }}><span>Intervention</span><input value={d.title || ''} onChange={(e) => set('title', e.target.value)} /></label>
        <label className="field" style={{ gridColumn: '1 / -1' }}><span>What it involves</span><textarea rows={3} value={d.description || ''} onChange={(e) => set('description', e.target.value)} /></label>
        <label className="field"><span>ADKAR element</span><select value={d.element} onChange={(e) => set('element', e.target.value)}>{ADKAR.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
        <label className="field"><span>Who delivers it</span><select value={d.role} onChange={(e) => set('role', e.target.value)}>{options('responsibleRole', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        <label className="field"><span>Plan it belongs to</span><select value={d.plan} onChange={(e) => set('plan', e.target.value)}>{PLAN_TYPES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label className="field"><span>Activity type</span><select value={d.type} onChange={(e) => set('type', e.target.value)}>{options('engagementType', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      </div>
    </Modal>
  );
}

function QuestionSets() {
  const { config } = useApp();
  const { save, saving } = useSaveConfig();
  const [sets, setSets] = useState(() => clone(config.questionSets));
  const [sel, setSel] = useState(Object.keys(config.questionSets)[0]);
  const set = sets[sel];
  const dirty = JSON.stringify(sets) !== JSON.stringify(config.questionSets);
  const upd = (items) => setSets((s) => ({ ...s, [sel]: { ...s[sel], items } }));
  const store = () => save('questionSets', Object.fromEntries(Object.entries(sets).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(QUESTION_SETS[k]))), 'Question sets saved');
  return (
    <Card title="Assessment question sets" sub="Each item is scored from 1 to 5 between the two descriptions. Changes apply to new assessments; completed assessments keep their answers, and scores use the items they answered." flush
      actions={<div className="btn-row"><select aria-label="Question set" value={sel} onChange={(e) => setSel(e.target.value)}>{Object.entries(sets).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>{QUESTION_SETS[sel] && JSON.stringify(set) !== JSON.stringify(QUESTION_SETS[sel]) && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSets((s) => ({ ...s, [sel]: clone(QUESTION_SETS[sel]) }))}>Restore defaults</button>}<button type="button" className="btn btn-sm btn-primary" disabled={!dirty || saving || set.items.some((i) => !String(i.text).trim())} onClick={store}><Icon name="check" />Save</button></div>}>
      <div className="card-pad small muted" style={{ paddingBottom: 0 }}>{set.higherIsRisk ? 'A higher score means more risk.' : 'A higher score means a stronger position.'}{set.aspects ? ` Items are grouped into: ${set.aspects.map((a) => a.label).join(', ')}.` : ''}</div>
      <div className="table-wrap">
        <table className="tbl tbl-compact">
          <thead><tr><th>Item</th><th>Scores 1 when</th><th>Scores 5 when</th>{set.aspects && <th>Aspect</th>}<th><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>
            {set.items.map((it, i) => (
              <tr key={it.id}>
                <td><input aria-label={`Item ${i + 1}`} value={it.text} onChange={(e) => upd(set.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} style={{ width: '100%', minWidth: 240 }} /></td>
                <td><input aria-label="Scores 1 when" value={it.low || ''} onChange={(e) => upd(set.items.map((x, j) => (j === i ? { ...x, low: e.target.value } : x)))} /></td>
                <td><input aria-label="Scores 5 when" value={it.high || ''} onChange={(e) => upd(set.items.map((x, j) => (j === i ? { ...x, high: e.target.value } : x)))} /></td>
                {set.aspects && <td><select aria-label="Aspect" value={it.aspect || ''} onChange={(e) => upd(set.items.map((x, j) => (j === i ? { ...x, aspect: e.target.value } : x)))}>{set.aspects.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></td>}
                <td><button type="button" className="icon-btn" aria-label={`Remove item ${i + 1}`} disabled={set.items.length <= 3} onClick={() => upd(set.items.filter((_, j) => j !== i))}><Icon name="trash" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-pad"><button type="button" className="btn btn-sm" onClick={() => upd([...set.items, { id: uid(sel.slice(0, 3)), text: '', low: '', high: '', ...(set.aspects ? { aspect: set.aspects[0].id } : {}) }])}><Icon name="plus" />Add an item</button></div>
    </Card>
  );
}

function Readiness() {
  const { config } = useApp();
  const { save, saving } = useSaveConfig();
  const [lists, setLists] = useState(() => clone(config.readinessChecklists));
  const dirty = JSON.stringify(lists) !== JSON.stringify(config.readinessChecklists);
  return (
    <Card title="Readiness checklists" sub="The criteria an initiative checks before go-live (RSK-010). Each initiative's checklist starts from these." actions={<button type="button" className="btn btn-sm btn-primary" disabled={!dirty || saving} onClick={() => save('readinessChecklists', lists, 'Readiness checklists saved')}><Icon name="check" />Save</button>}>
      <div className="grid g-2">
        {Object.entries(lists).map(([k, c]) => (
          <fieldset key={k} className="fieldset">
            <legend>{c.label}</legend>
            <div className="stack-sm">
              {asArray(c.criteria).map((t, i) => <div key={i} className="row" style={{ flexWrap: 'nowrap' }}><input aria-label={`${c.label} criterion ${i + 1}`} value={t} onChange={(e) => setLists((l) => ({ ...l, [k]: { ...c, criteria: c.criteria.map((x, j) => (j === i ? e.target.value : x)) } }))} style={{ flex: 1 }} /><button type="button" className="icon-btn" aria-label="Remove criterion" onClick={() => setLists((l) => ({ ...l, [k]: { ...c, criteria: c.criteria.filter((_, j) => j !== i) } }))}><Icon name="trash" /></button></div>)}
              <div><button type="button" className="btn btn-sm" onClick={() => setLists((l) => ({ ...l, [k]: { ...c, criteria: [...asArray(c.criteria), ''] } }))}><Icon name="plus" />Add a criterion</button></div>
            </div>
          </fieldset>
        ))}
      </div>
    </Card>
  );
}

const RATINGS = ['low', 'medium', 'high', 'extreme'];
const RATING_TONE = { low: 'good', medium: 'warning', high: 'serious', extreme: 'critical' };

function RiskMatrix() {
  const { settings, config } = useApp();
  const { save, saving } = useSaveConfig();
  const current = settings.riskMatrix || DEFAULT_RISK_MATRIX;
  const [m, setM] = useState(() => clone(current));
  const dirty = JSON.stringify(m) !== JSON.stringify(current);
  const likelihood = options('likelihood', config);
  const consequence = options('consequence', config);
  return (
    <Card title="Risk rating matrix" sub="The rating of a change risk or issue from its likelihood and consequence (RSK-008)."
      actions={<div className="btn-row"><button type="button" className="btn btn-sm btn-ghost" onClick={() => setM(clone(DEFAULT_RISK_MATRIX))}>Restore defaults</button><button type="button" className="btn btn-sm btn-primary" disabled={!dirty || saving} onClick={() => save('riskMatrix', m, 'Risk matrix saved')}><Icon name="check" />Save</button></div>}>
      <div className="table-wrap">
        <table className="tbl risk-matrix">
          <thead><tr><th>Likelihood ↓ / Consequence →</th>{consequence.map((c) => <th key={c.id} className="center">{c.label}</th>)}</tr></thead>
          <tbody>
            {[...likelihood].reverse().map((l) => {
              const li = Number(l.id) - 1;
              return (
                <tr key={l.id}>
                  <th scope="row">{l.label}</th>
                  {consequence.map((c) => {
                    const ci = Number(c.id) - 1;
                    const v = m[li]?.[ci] || 'low';
                    return <td key={c.id} className={`center rm-${v}`}><select aria-label={`Rating for ${l.label} and ${c.label}`} value={v} onChange={(e) => setM(m.map((row, i) => (i === li ? row.map((x, j) => (j === ci ? e.target.value : x)) : row)))}>{RATINGS.map((r) => <option key={r} value={r}>{label('riskRating', r, config)}</option>)}</select></td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="legend mt-2">{RATINGS.map((r) => <Badge key={r} tone={RATING_TONE[r]}>{label('riskRating', r, config)}</Badge>)}</div>
    </Card>
  );
}
