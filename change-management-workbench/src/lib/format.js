// Display helpers. Dates are DD/MM/YYYY in Australian English (USE-06); numbers use en-AU grouping.
import { fmtDate as fd, fmtDateTime as fdt, diffDays } from '../../shared/dates.js';
import { listLabel, listOptions } from '../../shared/schema.js';
import { personName } from '../../shared/util.js';

// Times are shown in the signed-in person's time zone when they have chosen one (USE-06); otherwise in
// the zone the caller passes (the organisation's).
let personalZone = null;
export const setDisplayTimeZone = (tz) => { personalZone = tz || null; };

export const fmtDate = (iso, opts) => (iso ? fd(String(iso).slice(0, 10), opts) : '');
export const fmtDateTime = (ts, tz) => (ts ? fdt(ts, personalZone || tz) : '');
export const fmtNum = (v, dp = 0) => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-AU', { maximumFractionDigits: dp, minimumFractionDigits: 0 }));
export const fmtMoney = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }));
export const fmtPct = (v) => (v == null ? '—' : `${Math.round(v)}%`);
export const compact = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(Math.round(n * 10) / 10);
};

export function relative(iso, today) {
  if (!iso || !today) return '';
  const d = diffDays(today, String(iso).slice(0, 10));
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

export const label = (list, id, config) => listLabel(list, id, config);
export const options = (list, config) => listOptions(list, config);
export const nameOf = (s) => (s ? personName(s) : '');
export const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const RAG_LABEL = { green: 'On track', amber: 'At risk', red: 'Off track' };
export const SEVERITY_BADGE = { critical: 'critical', high: 'serious', medium: 'warning', low: 'info', extreme: 'critical' };
export const RISK_BADGE = { extreme: 'critical', high: 'serious', medium: 'warning', low: 'good' };
export const STATUS_BADGE = {
  complete: 'good', completed: 'good', locked: 'good', approved: 'good', sent: 'good', done: 'good', accepted: 'good', confirmed: 'good', aligned: 'good', embedded: 'good', met: 'good', resolved: 'good', closed: 'good', published: 'good', go: 'good', onTrack: 'good', active: 'info',
  inProgress: 'info', scheduled: 'info', treating: 'info', monitoring: 'info', open: 'warning', planned: 'info', inReview: 'warning', forReview: 'warning', pending: 'warning', draft: '', notStarted: '', test: 'info',
  rescheduled: 'warning', atRisk: 'warning', partlyMet: 'warning', changesRequested: 'warning', goWithConditions: 'warning', onHold: 'warning',
  cancelled: '', didNotProceed: 'serious', rejected: 'critical', notMet: 'critical', overdue: 'critical', offTrack: 'critical', escalated: 'critical', noGo: 'critical', superseded: '', withdrawn: '', retired: '',
};
