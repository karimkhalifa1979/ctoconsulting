// Portfolio view and change saturation (PRT-001 to PRT-005).
import { asArray, mean, round, sortBy } from '../util.js';
import { periodRange, addDays } from '../dates.js';
import { impactWindow } from './impact.js';
import { overallRag } from '../model.js';

export function groupKey(g) {
  return g.stakeholderGroupId || `name:${String(g.name || '').trim().toLowerCase()}`;
}

export function portfolioView(models, { from, to, unit = 'month', settings = {} } = {}) {
  const sat = { maxInitiatives: 3, maxAggregateImpact: 10, maxHoursPerPersonPerMonth: 12, ...(settings.saturation || {}) };
  const periods = periodRange(from, to, unit);
  const groups = {};
  for (const m of models) {
    const msById = Object.fromEntries(m.milestones.map((x) => [x.id, x]));
    for (const g of m.groups) {
      const key = groupKey(g);
      const entry = (groups[key] ||= { key, name: g.name, headcount: 0, initiatives: new Set(), cells: Object.fromEntries(periods.map((p) => [p.key, { period: p.key, initiatives: [], impact: 0, hours: 0, items: [] }])) });
      entry.headcount = Math.max(entry.headcount, Number(g.headcount) || 0);
      entry.initiatives.add(m.initiative.id);
      for (const p of periods) {
        const cell = entry.cells[p.key];
        const active = g.impacts.filter((i) => {
          const w = impactWindow(i, msById);
          return w.from && w.from <= p.end && (w.to || w.from) >= p.start;
        });
        const maxDeg = active.length ? Math.max(...active.map((i) => Number(i.degree) || 0)) : 0;
        // Engagement hours per person for engagements aimed at the group's stakeholder group.
        const engHours = m.engagements.filter((e) => e.status !== 'cancelled' && e.date && e.date >= p.start && e.date <= p.end && g.stakeholderGroupId && asArray(e.groupIds).includes(g.stakeholderGroupId))
          .reduce((a, e) => a + (Number(e.durationMinutes) || 60) / 60, 0);
        const trainingHours = m.interventions.filter((iv) => asArray(iv.audienceGroupIds).includes(g.id)).filter((iv) => m.sessions.some((s) => s.interventionId === iv.id && s.date >= p.start && s.date <= p.end))
          .reduce((a, iv) => a + (Number(iv.durationHours) || 0), 0);
        if (maxDeg > 0 || engHours > 0 || trainingHours > 0) {
          cell.initiatives.push(m.initiative.id);
          cell.impact += maxDeg;
          cell.hours += engHours + trainingHours;
          cell.items.push({ initiativeId: m.initiative.id, initiative: m.initiative.shortName || m.initiative.name, impact: maxDeg, hours: round(engHours + trainingHours, 1), aspects: active.map((i) => i.aspect) });
        }
      }
    }
  }
  const monthScale = unit === 'week' ? 0.25 : unit === 'quarter' ? 3 : 1;
  const rows = sortBy(Object.values(groups), 'name').map((g) => ({
    ...g,
    initiatives: [...g.initiatives],
    cells: periods.map((p) => {
      const c = g.cells[p.key];
      const reasons = [];
      if (c.initiatives.length > sat.maxInitiatives) reasons.push(`${c.initiatives.length} initiatives (limit ${sat.maxInitiatives})`);
      if (c.impact > sat.maxAggregateImpact) reasons.push(`aggregate impact ${c.impact} (limit ${sat.maxAggregateImpact})`);
      if (c.hours > sat.maxHoursPerPersonPerMonth * monthScale) reasons.push(`${round(c.hours, 1)} hours per person (limit ${round(sat.maxHoursPerPersonPerMonth * monthScale, 1)})`);
      return { ...c, hours: round(c.hours, 1), saturated: reasons.length > 0, reasons };
    }),
  }));
  return { periods, rows, thresholds: sat };
}

// PRT-003: compare initiatives by risk profile, readiness and adoption.
export function initiativeComparison(models) {
  return models.map((m) => {
    const individual = m.measures.filter((x) => x.category === 'individual' && x.progress != null);
    return {
      id: m.initiative.id,
      name: m.initiative.name,
      shortName: m.initiative.shortName,
      status: m.initiative.status,
      phase: m.stageStatus.currentPhase?.label,
      stage: m.stageStatus.current?.label,
      riskProfile: m.risk.profile,
      pct: m.risk.pct?.overall ?? null,
      readiness: m.kpis.readinessAvg,
      adoption: individual.length ? round(mean(individual.map((x) => Math.min(100, Math.max(0, x.progress))))) : null,
      engagementCoverage: m.kpis.engagementCoverage,
      highImpactGroups: m.kpis.highImpactGroups,
      headcount: m.kpis.headcount,
      rag: overallRag(m),
      start: m.initiative.startDate,
      end: m.initiative.endDate,
      goLives: m.milestones.filter((x) => x.kind === 'goLive').map((x) => ({ name: x.name, date: x.date })),
    };
  });
}

// PRT-004: stakeholders engaged by several initiatives and their combined load.
export function sharedStakeholders(models, today) {
  const by = {};
  for (const m of models) {
    for (const p of m.profiles.filter((x) => x.person)) {
      const e = (by[p.stakeholderId] ||= { stakeholderId: p.stakeholderId, name: p.name, position: p.positionTitle, initiatives: [], upcoming: 0, last30: 0 });
      e.initiatives.push({ id: m.initiative.id, name: m.initiative.shortName || m.initiative.name, quadrant: p.quadrant, cadenceDays: p.cadenceDays });
      e.upcoming += m.engagements.filter((x) => x.open && x.plannedDate >= today && x.plannedDate <= addDays(today, 30) && asArray(x.stakeholderIds).includes(p.stakeholderId)).length;
      e.last30 += p.history.filter((x) => x.done && x.actualDate >= addDays(today, -30)).length;
    }
  }
  return sortBy(Object.values(by).filter((x) => x.initiatives.length > 1), '-upcoming', 'name');
}
