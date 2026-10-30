// Custom fields (ADM-002): fields administrators add to core records, with their type, validation, whether
// they are required, whether they show in registers, whether they are sensitive (seen only by permitted
// roles and left out of artefacts by default) and whether templates can use them as merge fields.
import { useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { Card, Badge, Empty, Modal } from '../../ui/core.jsx';
import { useApp, useDialog } from '../../state/app.jsx';
import { useSaveConfig } from './Admin.jsx';
import { entity } from '../../../shared/schema.js';
import { asArray, clone } from '../../../shared/util.js';

const TYPES = ['initiative', 'impactedGroup', 'impact', 'profile', 'stakeholder', 'engagement', 'activity', 'keyMessage', 'trainingIntervention', 'resistance', 'changeAgent', 'risk', 'measure', 'sustainmentItem', 'lesson'];
const FIELD_TYPES = [
  { id: 'text', label: 'Short text' }, { id: 'textarea', label: 'Long text' }, { id: 'int', label: 'Whole number' }, { id: 'number', label: 'Number' },
  { id: 'date', label: 'Date' }, { id: 'bool', label: 'Yes or no' }, { id: 'select', label: 'Choose one from a list' }, { id: 'multi', label: 'Choose several from a list' },
  { id: 'email', label: 'Email address' }, { id: 'url', label: 'Web address' },
];

export default function Fields() {
  const { config } = useApp();
  const { save, saving } = useSaveConfig();
  const dialog = useDialog();
  const [type, setType] = useState('initiative');
  const [editing, setEditing] = useState(null);
  const all = config.customFields || {};
  const list = asArray(all[type]);
  const store = (next) => save('customFields', { ...all, [type]: next }, 'Custom fields saved');
  const remove = async (f) => {
    const ok = await dialog.confirm({ title: `Remove ${f.label}`, message: 'The field disappears from forms, registers and templates. Values already recorded are kept in the records and in the audit trail, and come back if the field is added again with the same code.', confirmLabel: 'Remove field', danger: true });
    if (ok) store(list.filter((x) => x.key !== f.key));
  };
  return (
    <div className="stack">
      <Card title="Custom fields" sub="Add the details your organisation needs to record. Custom fields appear in forms, can be shown in registers, are included in imports and exports, and can be used in templates." flush
        actions={<div className="btn-row"><select aria-label="Record type" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t} value={t}>{entity(t).plural}{asArray(all[t]).length ? ` (${asArray(all[t]).length})` : ''}</option>)}</select><button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing({})}><Icon name="plus" />Add a field</button></div>}>
        {!list.length ? <Empty icon="columns" title={`No custom fields for ${entity(type).plural.toLowerCase()}`}>Add one to capture something the standard fields do not.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Field</th><th>Type</th><th>Rules</th><th>Shown</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.key}>
                  <td><strong>{f.label}</strong><span className="sub-line tiny muted">cf_{f.key.replace(/^cf_/, '')}{f.help ? ` · ${f.help}` : ''}</span></td>
                  <td className="small">{FIELD_TYPES.find((t) => t.id === f.type)?.label || f.type}{['select', 'multi'].includes(f.type) && <span className="sub-line tiny muted">{asArray(f.options).map((o) => o.label).join(', ')}</span>}</td>
                  <td><span className="btn-row">{f.required && <Badge tone="info">Required</Badge>}{f.sensitive && <Badge tone="critical" icon="lock">Sensitive</Badge>}{f.min != null && <Badge>Min {f.min}</Badge>}{f.max != null && <Badge>Max {f.max}</Badge>}</span></td>
                  <td><span className="btn-row">{f.grid && <Badge>Registers</Badge>}{type === 'initiative' && f.mergeField !== false && <Badge tone="good">Templates</Badge>}</span></td>
                  <td className="nowrap"><button type="button" className="btn btn-xs" onClick={() => setEditing(f)}>Edit</button> <button type="button" className="btn btn-xs btn-ghost" onClick={() => remove(f)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editing && <FieldEditor type={type} field={editing} existing={list} saving={saving} onClose={() => setEditing(null)} onSave={async (f) => { const next = editing.key ? list.map((x) => (x.key === editing.key ? f : x)) : [...list, f]; if (await store(next)) setEditing(null); }} />}
    </div>
  );
}

function FieldEditor({ type, field, existing, saving, onClose, onSave }) {
  const isNew = !field.key;
  const [f, setF] = useState(() => ({ type: 'text', grid: false, required: false, sensitive: false, mergeField: true, options: [], ...clone(field) }));
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const key = isNew ? (f.key || String(f.label || '').replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/).map((w, i) => (i ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('')) : f.key;
  const clash = isNew && (existing.some((x) => x.key === key) || entity(type).fields.some((x) => x.key === key || x.key === `cf_${key}`));
  const needsOptions = ['select', 'multi'].includes(f.type);
  const valid = String(f.label || '').trim() && key && /^[a-zA-Z][a-zA-Z0-9]*$/.test(key) && !clash && (!needsOptions || asArray(f.options).filter((o) => o.label.trim()).length >= 2);
  const done = () => onSave({
    key, label: f.label.trim(), type: f.type, required: !!f.required, grid: !!f.grid, sensitive: !!f.sensitive, help: f.help?.trim() || undefined, group: 'Additional details',
    ...(type === 'initiative' ? { mergeField: f.mergeField !== false } : {}),
    ...(needsOptions ? { options: asArray(f.options).filter((o) => o.label.trim()).map((o) => ({ id: o.id || o.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'), label: o.label.trim() })) } : {}),
    ...(['int', 'number'].includes(f.type) ? { min: f.min === '' || f.min == null ? undefined : Number(f.min), max: f.max === '' || f.max == null ? undefined : Number(f.max) } : {}),
  });
  return (
    <Modal title={isNew ? `New field for ${entity(type).plural.toLowerCase()}` : `Edit ${field.label}`} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!valid || saving} onClick={done}>{saving ? 'Saving…' : 'Save field'}</button></>}>
      <div className="stack">
        <div className="form-grid">
          <label className="field"><span>Label</span><input value={f.label || ''} onChange={(e) => set('label', e.target.value)} placeholder="For example: Funding source" /></label>
          <label className="field"><span>Code</span><input value={key} disabled={!isNew} onChange={(e) => set('key', e.target.value.replace(/[^A-Za-z0-9]/g, ''))} aria-invalid={clash} /><span className="hint">{clash ? 'This code is already used.' : 'Stored as cf_' + (key || '…') + '; cannot change later.'}</span></label>
          <label className="field"><span>Type</span><select value={f.type} disabled={!isNew} onChange={(e) => set('type', e.target.value)}>{FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
          <label className="field"><span>Help text</span><input value={f.help || ''} onChange={(e) => set('help', e.target.value)} placeholder="Shown next to the field" /></label>
          {['int', 'number'].includes(f.type) && <><label className="field"><span>Smallest value</span><input type="number" value={f.min ?? ''} onChange={(e) => set('min', e.target.value)} /></label><label className="field"><span>Largest value</span><input type="number" value={f.max ?? ''} onChange={(e) => set('max', e.target.value)} /></label></>}
        </div>
        {needsOptions && (
          <fieldset className="fieldset">
            <legend>Choices</legend>
            <div className="stack-sm">
              {asArray(f.options).map((o, i) => <div key={i} className="row"><input aria-label={`Choice ${i + 1}`} value={o.label} onChange={(e) => set('options', f.options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={{ flex: 1 }} /><button type="button" className="icon-btn" aria-label="Remove choice" onClick={() => set('options', f.options.filter((_, j) => j !== i))}><Icon name="trash" /></button></div>)}
              <div><button type="button" className="btn btn-sm" onClick={() => set('options', [...asArray(f.options), { label: '' }])}><Icon name="plus" />Add a choice</button></div>
            </div>
          </fieldset>
        )}
        <div className="stack-sm">
          <label className="check"><input type="checkbox" checked={!!f.required} onChange={(e) => set('required', e.target.checked)} /><span>Required. Existing records need it the next time they are edited.</span></label>
          <label className="check"><input type="checkbox" checked={!!f.grid} onChange={(e) => set('grid', e.target.checked)} /><span>Show as a column in registers</span></label>
          <label className="check"><input type="checkbox" checked={!!f.sensitive} onChange={(e) => set('sensitive', e.target.checked)} /><span>Sensitive: only roles permitted to see sensitive fields can see or change it, it is left out of artefacts unless deliberately included, and viewing it is audited</span></label>
          {type === 'initiative' && <label className="check"><input type="checkbox" checked={f.mergeField !== false} onChange={(e) => set('mergeField', e.target.checked)} /><span>Available to templates as {`{{initiative.cf_${key || '…'}}}`}</span></label>}
        </div>
      </div>
    </Modal>
  );
}
