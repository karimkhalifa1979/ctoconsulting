import { useState } from 'react';
import { useP, useCan } from '../../lib/store.jsx';
import { Card, PageHead, Modal } from '../../../components/ui.jsx';
import { Field, Confirm } from '../../components/common.jsx';
import { SLIDE_KINDS } from '../../core/constants.js';

// Deck recipes (PP-02): an ordered list of slides, each mapped to a layout in the master.
export default function Recipes() {
  const { view, dispatch } = useP();
  const can = useCan();
  const manage = can('configure');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const move = (i, d) => { const s = [...edit.slides]; const j = i + d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; setEdit({ ...edit, slides: s }); };
  return (
    <div className="stack">
      <PageHead eyebrow="Administration" title="Deck recipes" actions={manage && <button className="btn btn-primary" onClick={() => setEdit({ name: '', use: '', slides: [{ kind: 'title', layout: 'title' }] })}>Add recipe</button>}>
        The bid manager picks a recipe and includes or excludes slides. The AI writes the storyboard for the slides in this order.
      </PageHead>
      <div className="grid g-2">
        {view.recipes.map((r) => (
          <Card key={r.id} title={<>{r.name}{r.could && <span className="pill" style={{ marginLeft: 8 }}>Could</span>}</>} subtitle={r.use}
            actions={manage && <div className="row"><button className="btn btn-sm" onClick={() => setEdit(JSON.parse(JSON.stringify(r)))}>Edit</button><button className="btn btn-sm btn-ghost" onClick={() => setDel(r)}>Delete</button></div>}>
            <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>{r.slides.map((s) => <li key={s.id}>{s.title || SLIDE_KINDS[s.kind]?.title} <span className="mini">({s.layout}{s.optional ? ', optional' : ''})</span></li>)}</ol>
          </Card>
        ))}
      </div>
      {edit && (
        <Modal title={edit.id ? `Edit ${edit.name}` : 'Add a recipe'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={() => dispatch('recipe.upsert', { recipe: edit }, { success: 'Recipe saved' }).then(() => setEdit(null))}>Save</button></>}>
          <div className="form-grid">
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Typical use"><input value={edit.use} onChange={(e) => setEdit({ ...edit, use: e.target.value })} /></Field>
          </div>
          <table className="table" style={{ marginTop: 10 }}>
            <thead><tr><th>#</th><th>Slide</th><th>Layout</th><th>Optional</th><th /></tr></thead>
            <tbody>
              {edit.slides.map((s, i) => (
                <tr key={i}>
                  <td className="tabular">{i + 1}</td>
                  <td><select value={s.kind} onChange={(e) => setEdit({ ...edit, slides: edit.slides.map((x, j) => (j === i ? { ...x, kind: e.target.value, layout: SLIDE_KINDS[e.target.value].layout, title: SLIDE_KINDS[e.target.value].title } : x)) })} aria-label="Slide">{Object.entries(SLIDE_KINDS).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}</select></td>
                  <td className="small">{s.layout || SLIDE_KINDS[s.kind]?.layout}</td>
                  <td><input type="checkbox" checked={Boolean(s.optional)} onChange={(e) => setEdit({ ...edit, slides: edit.slides.map((x, j) => (j === i ? { ...x, optional: e.target.checked } : x)) })} aria-label="Optional" /></td>
                  <td className="nowrap"><button className="icon-btn" aria-label="Move up" onClick={() => move(i, -1)}>↑</button><button className="icon-btn" aria-label="Move down" onClick={() => move(i, 1)}>↓</button><button className="icon-btn" aria-label="Remove slide" onClick={() => setEdit({ ...edit, slides: edit.slides.filter((_, j) => j !== i) })}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-sm" onClick={() => setEdit({ ...edit, slides: [...edit.slides, { kind: 'approach', layout: 'content', title: SLIDE_KINDS.approach.title }] })}>Add slide</button>
        </Modal>
      )}
      {del && <Confirm title={`Delete ${del.name}?`} danger confirmLabel="Delete" onClose={() => setDel(null)} onConfirm={() => dispatch('recipe.delete', { id: del.id }, { success: 'Deleted' })}><p>Existing storyboards built from this recipe are kept.</p></Confirm>}
    </div>
  );
}
