// AI readiness scoring.
import { AI_PILLARS, AI_QUESTIONS, AI_LEVELS, GUARDRAILS, AI_ACTIONS } from '../data/aiReadiness.js';
import { num } from './format.js';
import { avg, countBy } from './calc.js';

export const toIndex = (score) => (score === null ? null : Math.round(((score - 1) / 4) * 100));
export function levelOf(score) {
  if (score === null || score === undefined) return null;
  let lv = AI_LEVELS[0];
  for (const l of AI_LEVELS) if (score >= l.min) lv = l;
  return lv;
}

export function pillarStats(e) {
  const r = e.ai.responses;
  return AI_PILLARS.map((p) => {
    const qs = AI_QUESTIONS.filter((q) => q.pillar === p.id);
    const cur = avg(qs.map((q) => num(r[q.id]?.current)));
    const tgt = avg(qs.filter((q) => num(r[q.id]?.current) !== null).map((q) => num(r[q.id]?.target)));
    const linked = e.questions.filter((q) => p.links.includes(q.id));
    return {
      ...p,
      questions: qs.length,
      scored: qs.filter((q) => num(r[q.id]?.current) !== null).length,
      current: cur,
      target: tgt,
      gap: cur !== null && tgt !== null ? tgt - cur : null,
      index: toIndex(cur),
      targetIndex: toIndex(tgt),
      level: levelOf(cur),
      linkedCurrent: avg(linked.map((q) => num(q.current))),
      stage: cur === null ? null : cur < 2.5 ? 'foundation' : cur < 3.5 ? 'establish' : 'scale',
    };
  });
}

export function aiOverall(e) {
  const r = e.ai.responses;
  const cur = avg(AI_QUESTIONS.map((q) => num(r[q.id]?.current)));
  const tgt = avg(AI_QUESTIONS.filter((q) => num(r[q.id]?.current) !== null).map((q) => num(r[q.id]?.target)));
  const scored = AI_QUESTIONS.filter((q) => num(r[q.id]?.current) !== null).length;
  const g = guardrailSummary(e);
  const uc = useCaseSummary(e);
  return { current: cur, target: tgt, index: toIndex(cur), targetIndex: toIndex(tgt), level: levelOf(cur), targetLevel: levelOf(tgt), scored, total: AI_QUESTIONS.length, guardrails: g, useCases: uc };
}

export function guardrailSummary(e) {
  const statuses = GUARDRAILS.map((g) => e.ai.guardrails[g.id]?.status || 'Not started');
  const applicable = statuses.filter((s) => s !== 'Not applicable');
  const implemented = applicable.filter((s) => s === 'Implemented').length;
  const inProgress = applicable.filter((s) => s === 'In progress').length;
  return {
    counts: countBy(statuses.map((s) => ({ s })), 's'),
    implemented, inProgress,
    applicable: applicable.length,
    pct: applicable.length ? (implemented + inProgress * 0.5) / applicable.length : null,
  };
}

export function useCaseCalc(u) {
  const v = num(u.value), f = num(u.feasibility);
  const priority = v !== null && f !== null ? v * f : null;
  let quadrant = '';
  if (priority !== null) quadrant = v >= 3 ? (f >= 3 ? 'Prioritise now' : 'Build foundations') : (f >= 3 ? 'Opportunistic' : 'Park');
  if (u.riskTier === 'Prohibited') quadrant = 'Do not proceed';
  const net = (num(u.benefit) || 0) - (num(u.cost) || 0);
  return { priority, quadrant, net, needsImpactAssessment: u.riskTier === 'High' };
}

export function useCaseSummary(e) {
  const list = e.ai.useCases.filter((u) => u.name).map((u) => ({ ...u, ...useCaseCalc(u) }));
  return {
    count: list.length,
    byQuadrant: countBy(list, 'quadrant'),
    byStatus: countBy(list, 'status'),
    byTier: countBy(list, 'riskTier'),
    benefit: list.reduce((s, u) => s + (num(u.benefit) || 0), 0),
    cost: list.reduce((s, u) => s + (num(u.cost) || 0), 0),
    list,
  };
}

// Gap-based action plan: actions for each pillar at its current stage, largest gaps first.
export function aiActionPlan(e) {
  return pillarStats(e)
    .filter((p) => p.stage)
    .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0) || (a.current ?? 0) - (b.current ?? 0))
    .map((p) => ({
      pillar: p,
      horizon: p.stage === 'foundation' ? '0–3 months' : p.stage === 'establish' ? '3–12 months' : '12–24 months',
      actions: AI_ACTIONS[p.id][p.stage],
    }));
}
