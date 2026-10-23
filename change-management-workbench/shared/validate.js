// Record validation against the entity schema (Section 10.4: mandatory fields and validation rules are
// enforced at entry and on import).
import { fieldsOf, listOptions } from './schema.js';
import { ADKAR_IDS, PLAN_TYPES } from './refdata.js';
import { isIsoDate } from './dates.js';
import { asArray, isEmpty, sanitiseHtml } from './util.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionIds(fd, config, ctx) {
  if (fd.list) return listOptions(fd.list, config).map((o) => o.id);
  if (fd.options) return fd.options.map((o) => o.id);
  if (fd.optionsFrom === 'planTypes') return [...PLAN_TYPES.map((p) => p.id), ...asArray(ctx.customPlans).map((p) => p.id)];
  return null; // validated elsewhere
}

export function validateRecord(type, data, config = {}, { partial = false, ctx = {} } = {}) {
  const errors = [];
  for (const fd of fieldsOf(type, config)) {
    if (fd.system || fd.readOnly) continue;
    const has = Object.prototype.hasOwnProperty.call(data, fd.key);
    if (partial && !has) continue;
    const v = data[fd.key];
    const required = fd.required && !(ctx.optional || []).includes(fd.key);
    if (required && isEmpty(v)) {
      errors.push({ field: fd.key, message: `${fd.label} is required` });
      continue;
    }
    if (isEmpty(v)) continue;
    switch (fd.type) {
      case 'int':
      case 'number':
      case 'money': {
        const n = Number(v);
        if (Number.isNaN(n)) errors.push({ field: fd.key, message: `${fd.label} must be a number` });
        else if (fd.type === 'int' && !Number.isInteger(n)) errors.push({ field: fd.key, message: `${fd.label} must be a whole number` });
        else if (fd.min != null && n < fd.min) errors.push({ field: fd.key, message: `${fd.label} must be at least ${fd.min}` });
        else if (fd.max != null && n > fd.max) errors.push({ field: fd.key, message: `${fd.label} must be at most ${fd.max}` });
        break;
      }
      case 'date':
        if (!isIsoDate(v)) errors.push({ field: fd.key, message: `${fd.label} must be a valid date` });
        break;
      case 'time':
        if (!/^\d{2}:\d{2}$/.test(v)) errors.push({ field: fd.key, message: `${fd.label} must be a time (HH:MM)` });
        break;
      case 'email':
        if (!EMAIL.test(v)) errors.push({ field: fd.key, message: `${fd.label} must be an email address` });
        break;
      case 'select': {
        const ids = optionIds(fd, config, ctx);
        if (ids && !ids.includes(String(v))) errors.push({ field: fd.key, message: `${fd.label} has an unknown value "${v}"` });
        break;
      }
      case 'multi': {
        const ids = optionIds(fd, config, ctx);
        if (!Array.isArray(v)) errors.push({ field: fd.key, message: `${fd.label} must be a list` });
        else if (ids) for (const x of v) if (!ids.includes(String(x))) errors.push({ field: fd.key, message: `${fd.label} has an unknown value "${x}"` });
        break;
      }
      case 'adkar':
        if (!Array.isArray(v)) errors.push({ field: fd.key, message: `${fd.label} must be a list` });
        else for (const x of v) if (!ADKAR_IDS.includes(x)) errors.push({ field: fd.key, message: `${fd.label} has an unknown element "${x}"` });
        break;
      case 'refs':
      case 'users':
        if (!Array.isArray(v)) errors.push({ field: fd.key, message: `${fd.label} must be a list` });
        break;
      case 'table':
        if (!Array.isArray(v)) errors.push({ field: fd.key, message: `${fd.label} must be a list of rows` });
        else v.forEach((row, i) => {
          for (const col of fd.columns || []) if (col.required && isEmpty(row?.[col.key])) errors.push({ field: fd.key, message: `${fd.label} row ${i + 1}: ${col.label} is required` });
        });
        break;
      default:
        break;
    }
  }
  return errors;
}

// Normalises values before storage: numbers, booleans, sanitised rich text.
export function normalise(type, data, config = {}) {
  const out = { ...data };
  for (const fd of fieldsOf(type, config)) {
    if (!(fd.key in out)) continue;
    const v = out[fd.key];
    if (v === '' && !['text', 'textarea', 'richtext'].includes(fd.type)) { out[fd.key] = null; continue; }
    if (['int', 'number', 'money'].includes(fd.type) && v != null && v !== '' && !Number.isNaN(Number(v))) out[fd.key] = Number(v);
    if (fd.type === 'bool' && v != null) out[fd.key] = v === true || v === 'true' || v === 1 || v === 'yes' || v === 'Yes';
    if (fd.type === 'richtext' && typeof v === 'string') out[fd.key] = sanitiseHtml(v);
    if (['multi', 'refs', 'users', 'adkar'].includes(fd.type) && v != null && !Array.isArray(v)) out[fd.key] = String(v).split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  }
  return out;
}
