// Control assessment model, scoring and helpers.
import { splitList } from './registerParser.js';

export const STATUSES = [
  { id: 'compliant', label: 'Compliant', score: 100, color: 'var(--st-good)', icon: '✓' },
  { id: 'largely', label: 'Largely compliant', score: 75, color: 'var(--st-warning)', icon: '◔' },
  { id: 'partial', label: 'Partially compliant', score: 50, color: 'var(--st-serious)', icon: '◑' },
  { id: 'non', label: 'Non-compliant', score: 0, color: 'var(--st-critical)', icon: '✕' },
  { id: 'na', label: 'Not applicable', score: null, color: 'var(--st-na)', icon: '–' },
  { id: 'none', label: 'Not assessed', score: null, color: 'var(--st-none)', icon: '○' },
];
export const STATUS_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

export const MATURITY = [
  { level: 0, label: '0 — Non-existent', desc: 'No control in place.' },
  { level: 1, label: '1 — Initial', desc: 'Ad hoc, undocumented and person-dependent.' },
  { level: 2, label: '2 — Repeatable', desc: 'Performed consistently but not fully documented.' },
  { level: 3, label: '3 — Defined', desc: 'Documented, approved and communicated.' },
  { level: 4, label: '4 — Managed', desc: 'Measured, monitored and reported.' },
  { level: 5, label: '5 — Optimised', desc: 'Continuously improved using metrics and lessons learned.' },
];

export const EFFECTIVENESS = ['Not tested', 'Effective', 'Partially effective', 'Ineffective'];
export const CONTROL_STATES = ['Not assessed', 'Implemented', 'Partially implemented', 'Not implemented', 'Not applicable'];
export const REMEDIATION_STATES = ['Open', 'In progress', 'Closed', 'Risk accepted'];
export const RISK_LEVELS = ['Critical', 'High', 'Medium', 'Low'];

export function statusOf(a) {
  return STATUS_BY_ID[a?.status || 'none'];
}

// Controls to be tested for a requirement: explicit ISM controls, then technical controls.
export function controlsFor(req) {
  const items = [];
  for (const id of req.ismList || []) items.push({ key: id, label: id, kind: 'ISM control' });
  const tech = String(req.technicalControls || '');
  if (tech && !/^none\b|^nil\b|^n\/a/i.test(tech.trim())) {
    splitList(tech.replace(/;\s*/g, '\n')).forEach((t, i) => items.push({ key: `tc-${i}`, label: t, kind: 'Technical control' }));
  }
  const steps = String(req.processSteps || '');
  if (steps) {
    const parts = steps.split(/\s*(?:^|\s)\d+\.\s+/).map((s) => s.trim()).filter(Boolean);
    (parts.length > 1 ? parts : splitList(steps)).slice(0, 12).forEach((t, i) => items.push({ key: `ps-${i}`, label: t, kind: 'Procedural control' }));
  }
  return items;
}

export function evidenceFor(req) {
  return splitList(req.evidence).slice(0, 15);
}

// Risk rating suggestion from priority and compliance status.
export function suggestRisk(priority, status) {
  const p = { Critical: 3, High: 2, Medium: 1, Low: 0 }[priority] ?? 1;
  const s = { compliant: 0, largely: 1, partial: 2, non: 3 }[status];
  if (s === undefined || s === 0) return '';
  const score = p + s;
  return score >= 5 ? 'Critical' : score >= 4 ? 'High' : score >= 2 ? 'Medium' : 'Low';
}

export function computeStats(requirements, assessments) {
  const stats = { total: requirements.length, assessed: 0, applicable: 0, score: null, byStatus: {}, byPolicy: {}, byPriority: {}, findings: 0 };
  for (const s of STATUSES) stats.byStatus[s.id] = 0;
  let sum = 0, n = 0;
  for (const r of requirements) {
    const a = assessments[r.id];
    const st = statusOf(a);
    stats.byStatus[st.id]++;
    const pol = (stats.byPolicy[r.policyCode] ||= { total: 0, assessed: 0, sum: 0, n: 0, byStatus: {} });
    pol.total++;
    pol.byStatus[st.id] = (pol.byStatus[st.id] || 0) + 1;
    const pr = (stats.byPriority[r.priority || 'Unrated'] ||= {});
    pr[st.id] = (pr[st.id] || 0) + 1;
    if (st.id !== 'none') { stats.assessed++; pol.assessed++; }
    if (st.id !== 'na') stats.applicable++;
    if (st.score !== null) { sum += st.score; n++; pol.sum += st.score; pol.n++; }
    if (['partial', 'non', 'largely'].includes(st.id)) stats.findings++;
  }
  stats.score = n ? Math.round(sum / n) : null;
  for (const p of Object.values(stats.byPolicy)) p.score = p.n ? Math.round(p.sum / p.n) : null;
  stats.coverage = stats.total ? Math.round((stats.assessed / stats.total) * 100) : 0;
  return stats;
}

export function emptyAssessment() {
  return {
    status: 'none', maturity: '', targetMaturity: 3, design: 'Not tested', operating: 'Not tested',
    controls: {}, evidence: {}, evidenceNotes: '', finding: '', recommendation: '', risk: '',
    owner: '', dueDate: '', remediationStatus: 'Open', assessor: '', assessedOn: '', notes: '',
  };
}
