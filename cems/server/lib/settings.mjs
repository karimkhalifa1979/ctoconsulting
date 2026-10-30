// Business configuration (ADM-003, ADM-004, NFR-030): stored values override the defaults,
// every change is audited, and nothing needs a code release.
import { CONFIG_DEFAULTS } from '../../shared/defaults.js';
import { DEFAULT_MATRIX } from '../../shared/permissions.js';
import { holidaySet } from '../../shared/dates.js';
import { nowIso } from '../db.mjs';

export const SETTINGS_DEFAULTS = { ...CONFIG_DEFAULTS, permissions: DEFAULT_MATRIX };

export function createSettings(db, audit) {
  const cache = new Map();
  const read = db.prepare('SELECT value FROM config WHERE key = ?');

  function get(key) {
    if (cache.has(key)) return cache.get(key);
    const row = read.get(key);
    const value = row ? JSON.parse(row.value) : structuredClone(SETTINGS_DEFAULTS[key]);
    cache.set(key, value);
    return value;
  }

  function set(key, value, ctx) {
    if (!(key in SETTINGS_DEFAULTS)) throw Object.assign(new Error(`Unknown setting ${key}`), { status: 400 });
    const before = get(key);
    db.prepare('INSERT INTO config (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by')
      .run(key, JSON.stringify(value), nowIso(), ctx?.user?.id || null);
    cache.set(key, value);
    audit.record({ userId: ctx?.user?.id, ip: ctx?.ip, action: 'config', entity: 'config', entityId: key, summary: `Changed configuration: ${key}`, before, after: value });
    return value;
  }

  function reset(key, ctx) {
    db.prepare('DELETE FROM config WHERE key = ?').run(key);
    cache.delete(key);
    audit.record({ userId: ctx?.user?.id, ip: ctx?.ip, action: 'config', entity: 'config', entityId: key, summary: `Reset configuration to default: ${key}` });
    return get(key);
  }

  const all = () => Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map((k) => [k, get(k)]));
  const isCustomised = (key) => Boolean(read.get(key));
  const holidays = (state) => holidaySet(get('publicHolidays'), state || get('firm').state);
  const tz = () => get('firm').timezone;

  return { get, set, reset, all, isCustomised, holidays, tz };
}
