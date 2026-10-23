// Reference lists and terminology (ADM-001, ADM-003): the values offered in each pick list, and the field
// and screen names used across the workbench. Lists that business rules depend on (statuses, scales and
// quadrants) keep their values and can only be renamed; open lists, such as engagement types, channels
// and impact aspects, can be extended. Values are retired rather than deleted, so records keep them.
import { useMemo, useState } from 'react';
import Icon from '../../ui/Icon.jsx';
import { Card, Tabs, Badge, Empty } from '../../ui/core.jsx';
import { useApp } from '../../state/app.jsx';
import { useSaveConfig } from './Admin.jsx';
import { useTab } from '../../lib/hooks.js';
import { SCREEN_LABELS } from '../../Layout.jsx';
import { DEFAULT_LISTS } from '../../../shared/refdata.js';
import { ENTITIES, entity, fieldsOf } from '../../../shared/schema.js';
import { fieldLabel } from '../../../shared/reportBuilder.js';
import { clone, slug } from '../../../shared/util.js';

const OPEN = new Set(['engagementType', 'channel', 'changeRole', 'impactAspect', 'groupDefinition', 'employmentType', 'relationshipType', 'deliveryApproach', 'milestoneKind', 'responsibleRole', 'trainingModality', 'proficiencyEvidence', 'supportType', 'resistanceForm', 'feedbackChannel', 'feedbackTheme', 'sustainmentMechanism', 'lessonCategory', 'messageFocus', 'toolkitKind', 'budgetCategory', 'classification']);

export default function Lists() {
  const [tab, setTab] = useTab('lists');
  return (
    <div className="stack">
      <Tabs value={tab} onChange={setTab} label="Lists and terminology" tabs={[{ id: 'lists', label: 'Pick lists', icon: 'list' }, { id: 'terms', label: 'Terminology', icon: 'edit' }]} />
      {tab === 'lists' ? <ListEditor /> : <Terminology />}
    </div>
  );
}

function usedBy(listName, config) {
  const out = [];
  for (const [t, e] of Object.entries(ENTITIES)) for (const f of fieldsOf(t, config)) if (f.list === listName) out.push(`${e.label} › ${f.label}`);
  return out;
}

function ListEditor() {
  const { config } = useApp();
  const { save, saving } = useSaveConfig();
  const [lists, setLists] = useState(() => clone(config.lists));
  const [sel, setSel] = useState('engagementType');
  const [q, setQ] = useState('');
  const names = useMemo(() => Object.keys(lists).sort((a, b) => fieldLabel(a).localeCompare(fieldLabel(b))), [lists]);
  const items = lists[sel] || [];
  const open = OPEN.has(sel);
  const changed = (k) => JSON.stringify(lists[k]) !== JSON.stringify(DEFAULT_LISTS[k]);
  const dirty = JSON.stringify(lists) !== JSON.stringify(config.lists);
  const setItems = (next) => setLists((l) => ({ ...l, [sel]: next }));
  const move = (i, d) => { const next = [...items]; const [x] = next.splice(i, 1); next.splice(i + d, 0, x); setItems(next); };
  const add = () => {
    const base = slug('New value').replace(/-/g, '');
    let id = base; let n = 2;
    while (items.some((x) => x.id === id)) id = `${base}${n++}`;
    setItems([...items, { id, label: 'New value', added: true }]);
  };
  const store = () => {
    // Only lists that differ from the defaults are stored, so later improvements to the defaults still apply.
    const overrides = Object.fromEntries(Object.keys(lists).filter((k) => !DEFAULT_LISTS[k] || changed(k)).map((k) => [k, lists[k].map(({ added, ...x }) => x)]));
    save('lists', overrides, 'Lists saved');
  };
  const ql = q.trim().toLowerCase();
  const labelsOk = items.every((x) => String(x.label || '').trim()) && new Set(items.map((x) => x.id)).size === items.length;
  return (
    <div className="report-layout">
      <nav className="report-nav list-nav" aria-label="Pick lists">
        <input type="search" placeholder="Find a list…" aria-label="Find a list" value={q} onChange={(e) => setQ(e.target.value)} />
        {names.filter((k) => !ql || fieldLabel(k).toLowerCase().includes(ql) || lists[k].some((x) => String(x.label).toLowerCase().includes(ql))).map((k) => (
          <button key={k} type="button" className={k === sel ? 'active' : ''} aria-current={k === sel ? 'true' : undefined} onClick={() => setSel(k)}>
            {fieldLabel(k)}{changed(k) && <span className="dot-changed" title="Changed from the default" aria-label="changed" />}
          </button>
        ))}
      </nav>
      <Card title={fieldLabel(sel)} sub={`${open ? 'Open list: add, rename, reorder and retire values.' : 'The values drive business rules, so they can be renamed and reordered but not added or removed.'} Used by: ${usedBy(sel, config).join('; ') || 'calculations and reports'}.`}
        actions={<div className="btn-row">{DEFAULT_LISTS[sel] && changed(sel) && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setItems(clone(DEFAULT_LISTS[sel]))}>Restore defaults</button>}<button type="button" className="btn btn-sm btn-primary" disabled={!dirty || saving || !labelsOk} onClick={store}><Icon name="check" />{saving ? 'Saving…' : 'Save lists'}</button></div>}>
        <table className="tbl tbl-compact">
          <thead><tr><th>Value</th><th>Label shown</th><th>In use</th><th><span className="sr-only">Order</span></th></tr></thead>
          <tbody>
            {items.map((x, i) => (
              <tr key={`${x.id}-${i}`} className={x.active === false ? 'muted' : ''}>
                <td>{x.added ? <input aria-label="Value code" value={x.id} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, id: e.target.value.replace(/[^A-Za-z0-9]/g, '') } : y)))} style={{ width: 140 }} /> : <code className="small">{x.id}</code>}</td>
                <td><input aria-label={`Label for ${x.id}`} value={x.label} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} style={{ width: '100%', minWidth: 220 }} /></td>
                <td>{open ? <label className="check small"><input type="checkbox" checked={x.active !== false} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, active: e.target.checked } : y)))} /><span>{x.active === false ? 'Retired' : 'Offered'}</span></label> : <Badge>Fixed</Badge>}</td>
                <td className="nowrap"><button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chevronDown" style={{ transform: 'rotate(180deg)' }} /></button><button type="button" className="icon-btn" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><Icon name="chevronDown" /></button>{x.added && <button type="button" className="icon-btn" aria-label="Remove new value" onClick={() => setItems(items.filter((_, j) => j !== i))}><Icon name="trash" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {open && <button type="button" className="btn btn-sm mt-2" onClick={add}><Icon name="plus" />Add a value</button>}
        {!labelsOk && <p className="small" style={{ color: 'var(--st-critical-ink)' }}>Every value needs a label and a unique code.</p>}
      </Card>
    </div>
  );
}

const TERM_TYPES = ['initiative', 'impactedGroup', 'impact', 'profile', 'stakeholder', 'engagement', 'activity', 'keyMessage', 'trainingIntervention', 'resistance', 'changeAgent', 'risk', 'measure', 'sustainmentItem', 'lesson'];

function Terminology() {
  const { settings, config } = useApp();
  const { save, saving } = useSaveConfig();
  const [terms, setTerms] = useState(() => ({ ...(settings.terminology || {}) }));
  const [type, setType] = useState('screens');
  const dirty = JSON.stringify(terms) !== JSON.stringify(settings.terminology || {});
  const set = (k, v) => setTerms((t) => { const n = { ...t }; if (v.trim()) n[k] = v; else delete n[k]; return n; });
  const rows = type === 'screens'
    ? Object.entries(SCREEN_LABELS).map(([k, l]) => ({ key: `screen.${k}`, base: l, where: 'Navigation' }))
    : entity(type).fields.concat(asCustom(config, type)).filter((f) => !f.hidden && !f.system).map((f) => ({ key: `${type}.${f.key}`, base: f.label, where: f.group || entity(type).label }));
  return (
    <Card title="Terminology" sub="Use your organisation's own words. A blank name keeps the standard one. Licensed methodology terms can be used where your organisation holds the licence." flush
      actions={<div className="btn-row"><select aria-label="What to rename" value={type} onChange={(e) => setType(e.target.value)}><option value="screens">Screens in the navigation</option>{TERM_TYPES.map((t) => <option key={t} value={t}>Fields: {entity(t).plural}</option>)}</select><button type="button" className="btn btn-sm btn-primary" disabled={!dirty || saving} onClick={() => save('settings', { ...settings, terminology: terms }, 'Terminology saved')}><Icon name="check" />{saving ? 'Saving…' : 'Save'}</button></div>}>
      {!rows.length ? <Empty icon="edit" title="Nothing to rename" /> : (
        <table className="tbl tbl-compact">
          <thead><tr><th>Standard name</th><th>Your name</th><th>Where</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.key}><td>{r.base}</td><td><input aria-label={`Name for ${r.base}`} value={terms[r.key] || ''} placeholder={r.base} onChange={(e) => set(r.key, e.target.value)} style={{ width: '100%', minWidth: 220 }} /></td><td className="small muted">{r.where}</td></tr>)}</tbody>
        </table>
      )}
    </Card>
  );
}
const asCustom = (config, type) => (config.customFields?.[type] || []).map((cf) => ({ ...cf, key: cf.key.startsWith('cf_') ? cf.key : `cf_${cf.key}` }));
