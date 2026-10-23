// Schema-driven record form (USE-04 consistent forms, Section 10.4 validation at entry). Groups fields
// into sections, marks required and sensitive fields, shows redacted fields as restricted, validates
// before saving and saves only what changed, with the record version for conflict detection.
import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { FieldControl } from './fields.jsx';
import { fieldsOf, entity } from '../../shared/schema.js';
import { validateRecord } from '../../shared/validate.js';
import { useApp } from '../state/app.jsx';
import { useIniOptional, useMutator } from '../state/initiative.jsx';
import { makeLookups } from '../lib/lookups.js';
import { Help } from './core.jsx';
import { useEnterprise } from '../state/enterprise.jsx';

const WIDE = new Set(['textarea', 'richtext', 'table', 'json', 'refs', 'multi', 'adkar', 'users']);

export function useLookups() {
  const { users, initiatives, containers } = useApp();
  const ini = useIniOptional();
  const ent = useEnterprise();
  // Outside an initiative, stakeholders and groups come from the enterprise records.
  useEffect(() => { if (!ini && ent && !ent.records) ent.ensure(); }, [ini, ent]);
  const records = ini?.records || ent?.records || EMPTY;
  return useMemo(() => makeLookups({ records, users, initiatives, containers, model: ini?.model }), [records, ini?.model, users, initiatives, containers]);
}
const EMPTY = {};

export function formFields(type, config, { include, exclude = [], showHidden = [] } = {}) {
  let list = fieldsOf(type, config).filter((f) => !f.system && (!f.hidden || showHidden.includes(f.key)) && !exclude.includes(f.key));
  if (include) list = include.map((k) => list.find((f) => f.key === k) || fieldsOf(type, config).find((f) => f.key === k)).filter(Boolean);
  return list;
}

export default function RecordForm({ type, record, defaults = {}, include, exclude, showHidden, onSaved, onCancel, readOnly: forceReadOnly, saveLabel, extra, compact = false, transform, requiredExtra = [], hideSections = false, groups: groupMap, validate: extraValidate }) {
  const { config, settings } = useApp();
  const ini = useIniOptional();
  const lookups = useLookups();
  const mut = useMutator();
  const meta = entity(type);
  const isNew = !record?.id;
  const initial = useMemo(() => {
    const base = {};
    if (isNew) for (const f of fieldsOf(type, config)) if (f.default !== undefined) base[f.key] = typeof f.default === 'object' ? JSON.parse(JSON.stringify(f.default)) : f.default;
    return { ...base, ...defaults, ...(record || {}) };
  }, [record, isNew]); // eslint-disable-line react-hooks/exhaustive-deps
  const [data, setData] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { setData(initial); setErrors({}); }, [initial]);

  const fields = formFields(type, config, { include, exclude, showHidden });
  const redacted = new Set(record?._redacted || []);
  const readOnly = forceReadOnly || ini?.readOnly;
  const hasFree = fields.some((f) => f.freeText || f.type === 'richtext');

  const sections = useMemo(() => {
    if (hideSections) return [{ name: null, fields }];
    const out = [];
    for (const f of fields) {
      const name = groupMap?.[f.key] || f.group || null;
      let s = out.find((x) => x.name === name);
      if (!s) { s = { name, fields: [] }; out.push(s); }
      s.fields.push(f);
    }
    return out;
  }, [fields, hideSections, groupMap]);

  const set = (k, v) => { setData((d) => ({ ...d, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: null })); };

  const save = async (e) => {
    e?.preventDefault();
    if (readOnly) return;
    let payload = { ...data };
    if (transform) payload = transform(payload);
    const errs = validateRecord(type, payload, config, { ctx: { customPlans: ini?.initiative?.customPlans } }).filter((x) => fields.some((f) => f.key === x.field) || requiredExtra.includes(x.field));
    for (const k of requiredExtra) if (payload[k] == null || payload[k] === '' || (Array.isArray(payload[k]) && !payload[k].length)) errs.push({ field: k, message: `${fields.find((f) => f.key === k)?.label || k} is required` });
    if (extraValidate) errs.push(...extraValidate(payload));
    if (errs.length) {
      setErrors(Object.fromEntries(errs.map((x) => [x.field, x.message])));
      document.getElementById(`f-${type}-${errs[0].field}`)?.focus?.();
      return;
    }
    setSaving(true);
    try {
      let saved;
      if (isNew) {
        const body = { ...payload };
        if ((meta.scope === 'initiative' || meta.scope === 'any') && ini?.id && !body.initiativeId) body.initiativeId = ini.id;
        saved = await mut.create(type, body);
      } else {
        const patch = {};
        for (const [k, v] of Object.entries(payload)) if (JSON.stringify(v ?? null) !== JSON.stringify(record[k] ?? null) && !redacted.has(k)) patch[k] = v;
        if (!Object.keys(patch).length) { onSaved?.(record); return; }
        saved = await mut.update(type, record.id, patch, { version: record.version });
      }
      onSaved?.(saved);
    } catch (err) {
      if (err.details && Array.isArray(err.details)) setErrors(Object.fromEntries(err.details.filter((d) => d.field).map((d) => [d.field, d.message])));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} noValidate>
      {hasFree && !readOnly && settings.privacy?.freeTextGuidance && !compact && (
        <div className="callout small mb-3"><strong>Privacy reminder. </strong>{settings.privacy.freeTextGuidance}</div>
      )}
      {sections.map((s) => (
        <div className="form-section" key={s.name || '_'}>
          {s.name && <h3>{s.name}</h3>}
          <div className="form-grid" style={compact ? { gap: '10px 12px' } : undefined}>
            {s.fields.map((f) => {
              const id = `f-${type}-${f.key}`;
              const wide = WIDE.has(f.type) || f.wide;
              const restricted = redacted.has(f.key);
              const ro = readOnly || f.readOnly || (f.key === 'code');
              return (
                <div className={`field ${wide ? 'span-2' : ''}`} key={f.key}>
                  <label htmlFor={id} className="field-label">
                    {f.label}{f.required && !ro && <em className="req" aria-hidden="true">*</em>}
                    {f.sensitive && <span className="badge" title="Sensitive field: visible only to authorised roles (STK-048)"><Icon name="lock" />Restricted</span>}
                    {f.help && <Help text={f.help} term={f.label} />}
                  </label>
                  {restricted ? (
                    <div className="muted small"><Icon name="eyeOff" size={14} /> You do not have access to this field.</div>
                  ) : (
                    <FieldControl fd={f} id={id} value={data[f.key]} onChange={(v) => set(f.key, v)} lookups={lookups} config={config} model={ini?.model} disabled={ro || saving} invalid={!!errors[f.key]} />
                  )}
                  {errors[f.key] && <span className="err" role="alert">{errors[f.key]}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {extra}
      {!readOnly && (
        <div className="btn-row mt-4" style={{ justifyContent: 'flex-end' }}>
          {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : saveLabel || (isNew ? `Create ${meta.label.toLowerCase()}` : 'Save changes')}</button>
        </div>
      )}
      {readOnly && ini?.readOnly && <div className="callout warn mt-3 small">This initiative is closed and read-only (SUS-007).</div>}
    </form>
  );
}
