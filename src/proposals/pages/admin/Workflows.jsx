import { useState } from 'react';
import { useP, useCan } from '../../lib/store.jsx';
import { Card, PageHead, Modal } from '../../../components/ui.jsx';
import { Field, Confirm } from '../../components/common.jsx';
import { STAGES, GATES, ROLES, REVIEW_ROUNDS, roleLabel } from '../../core/constants.js';
import { aud } from '../../core/util.js';

const REQUIRED = ['intake', 'produce', 'submit', 'outcome'];
const APPROVER_ROLES = ROLES.filter((r) => ['partner', 'commercial', 'reviewer'].includes(r.id));
const FIELDS = { value: 'Estimated value (AUD)', marginPct: 'Margin (%)' };

// Workflow templates (WF-06): stages, gates, required approver roles and conditional rules.
export default function Workflows() {
  const { view, dispatch } = useP();
  const can = useCan();
  const manage = can('configure');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const inUse = (id) => view.bids.filter((b) => b.workflowId === id && !['closed', 'archived'].includes(b.stage)).length;
  const blank = { name: '', description: '', stages: STAGES.map((s) => s.id), gates: { g1: { enabled: true, approvers: [{ role: 'partner', count: 1 }] }, g2: { enabled: true, approvers: [{ role: 'commercial', count: 1 }] }, g3: { enabled: true, approvers: [{ role: 'partner', count: 1 }] } }, rules: [], reviewRounds: ['solution', 'red'] };
  const setGate = (g, patch) => setEdit({ ...edit, gates: { ...edit.gates, [g]: { ...edit.gates[g], ...patch } } });
  return (
    <div className="stack">
      <PageHead eyebrow="Administration" title="Workflow templates" actions={manage && <button className="btn btn-primary" onClick={() => setEdit(blank)}>Add workflow</button>}>
        Each bid follows one template. Stages and gates can be switched off for lighter responses, and rules add approvers, for example a second partner above a value.
      </PageHead>
      {view.workflows.map((w) => (
        <Card key={w.id} title={<>{w.name}{w.default && <span className="pill navy" style={{ marginLeft: 8 }}>Default</span>}</>} subtitle={`${w.description} · used by ${inUse(w.id)} live bid${inUse(w.id) === 1 ? '' : 's'}`}
          actions={manage && <div className="row"><button className="btn btn-sm" onClick={() => setEdit(JSON.parse(JSON.stringify(w)))}>Edit</button><button className="btn btn-sm btn-ghost" onClick={() => dispatch('workflow.upsert', { workflow: { ...w, id: undefined, name: `${w.name} (copy)`, default: false } }, { success: 'Copied' })}>Copy</button>{!w.default && <button className="btn btn-sm btn-ghost" onClick={() => setDel(w)}>Delete</button>}</div>}>
          <div className="stepper" style={{ marginBottom: 12 }}>
            {STAGES.map((s) => <div key={s.id} className={`st ${w.stages.includes(s.id) ? 'done' : 'skip'}`}><span>{s.n}</span><strong>{s.label}</strong></div>)}
          </div>
          <div className="grid g-3">
            {GATES.map((g) => <div key={g.id}><div className="eyebrow">Gate {g.n}: {g.label}</div><div className="small">{w.gates[g.id]?.enabled === false ? 'Off' : w.gates[g.id].approvers.map((a) => `${a.count} × ${roleLabel(a.role)}`).join(' and ')}</div></div>)}
          </div>
          {w.rules?.length > 0 && <ul className="small" style={{ marginBottom: 0 }}>{w.rules.map((r) => <li key={r.id}>{r.label || `Gate ${r.gate.slice(1)}: ${FIELDS[r.field]} ${r.op} ${r.field === 'value' ? aud(r.value) : `${r.value}%`} → ${r.count} × ${roleLabel(r.role)}`}</li>)}</ul>}
          <div className="mini" style={{ marginTop: 8 }}>Review rounds: {(w.reviewRounds || []).map((r) => REVIEW_ROUNDS.find((x) => x.id === r)?.label).join(', ')}</div>
        </Card>
      ))}
      {edit && (
        <Modal title={edit.id ? `Edit ${edit.name}` : 'Add a workflow template'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={() => dispatch('workflow.upsert', { workflow: edit }, { success: 'Workflow saved' }).then(() => setEdit(null))}>Save</button></>}>
          <div className="modal-wide" />
          <div className="form-grid">
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Default for new bids"><label className="check"><input type="checkbox" checked={Boolean(edit.default)} onChange={(e) => setEdit({ ...edit, default: e.target.checked })} /><span>Default</span></label></Field>
            <Field label="Description" full><input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Stages" hint="Intake, Produce, Submit and Outcome are always required" full>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{STAGES.map((s) => <label key={s.id} className="chip"><input type="checkbox" disabled={REQUIRED.includes(s.id)} checked={edit.stages.includes(s.id)} onChange={(e) => setEdit({ ...edit, stages: e.target.checked ? [...edit.stages, s.id] : edit.stages.filter((x) => x !== s.id) })} /> {s.n}. {s.label}</label>)}</div>
            </Field>
          </div>
          {GATES.map((g) => (
            <div key={g.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><strong>Gate {g.n}: {g.label}</strong><label className="check small"><input type="checkbox" disabled={g.id === 'g3'} checked={edit.gates[g.id]?.enabled !== false} onChange={(e) => setGate(g.id, { enabled: e.target.checked })} /><span>Enabled{g.id === 'g3' ? ' (required)' : ''}</span></label></div>
              {(edit.gates[g.id]?.approvers || []).map((a, i) => (
                <div key={i} className="row" style={{ marginTop: 6 }}>
                  <input type="number" min="1" max="5" value={a.count} onChange={(e) => setGate(g.id, { approvers: edit.gates[g.id].approvers.map((x, j) => (j === i ? { ...x, count: Number(e.target.value) } : x)) })} style={{ width: 60 }} aria-label="Count" /> ×
                  <select value={a.role} onChange={(e) => setGate(g.id, { approvers: edit.gates[g.id].approvers.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })} aria-label="Role">{APPROVER_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
                  <button className="icon-btn" aria-label="Remove approver" onClick={() => setGate(g.id, { approvers: edit.gates[g.id].approvers.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setGate(g.id, { approvers: [...(edit.gates[g.id]?.approvers || []), { role: 'partner', count: 1 }] })}>Add approver role</button>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
            <strong>Rules</strong> <span className="mini">Add approvals when a condition holds</span>
            {edit.rules.map((r, i) => {
              const set = (patch) => setEdit({ ...edit, rules: edit.rules.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <div key={i} className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                  <select value={r.gate} onChange={(e) => set({ gate: e.target.value })} aria-label="Gate">{GATES.map((g) => <option key={g.id} value={g.id}>Gate {g.n}</option>)}</select>
                  when <select value={r.field} onChange={(e) => set({ field: e.target.value })} aria-label="Field">{Object.entries(FIELDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <select value={r.op} onChange={(e) => set({ op: e.target.value })} aria-label="Operator"><option value=">=">≥</option><option value="<">&lt;</option></select>
                  <input type="number" value={r.value} onChange={(e) => set({ value: e.target.value })} style={{ width: 120 }} aria-label="Value" />
                  need <input type="number" min="1" max="5" value={r.count} onChange={(e) => set({ count: e.target.value })} style={{ width: 55 }} aria-label="Count" /> ×
                  <select value={r.role} onChange={(e) => set({ role: e.target.value })} aria-label="Role">{APPROVER_ROLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
                  <input value={r.label} placeholder="Label" onChange={(e) => set({ label: e.target.value })} style={{ minWidth: 220 }} aria-label="Label" />
                  <button className="icon-btn" aria-label="Remove rule" onClick={() => setEdit({ ...edit, rules: edit.rules.filter((_, j) => j !== i) })}>✕</button>
                </div>
              );
            })}
            <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setEdit({ ...edit, rules: [...edit.rules, { gate: 'g3', field: 'value', op: '>=', value: 1000000, role: 'partner', count: 2, label: '' }] })}>Add rule</button>
          </div>
          <Field label="Review rounds" full><div className="row" style={{ gap: 6 }}>{REVIEW_ROUNDS.map((r) => <label key={r.id} className="chip"><input type="checkbox" checked={(edit.reviewRounds || []).includes(r.id)} onChange={(e) => setEdit({ ...edit, reviewRounds: e.target.checked ? [...(edit.reviewRounds || []), r.id] : edit.reviewRounds.filter((x) => x !== r.id) })} /> {r.label}</label>)}</div></Field>
        </Modal>
      )}
      {del && <Confirm title={`Delete ${del.name}?`} danger confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={() => dispatch('workflow.delete', { id: del.id }, { success: 'Deleted' })}><p>Bids that finished under this workflow keep their history.</p></Confirm>}
    </div>
  );
}
