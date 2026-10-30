// Resource management (RES-002, RES-005..011): capacity against demand net of leave and public
// holidays by state, planned and actual utilisation, matching people to requests, team views.
import { addDays, weekStart, todayIn, isBusinessDay, holidaySet, diffDays } from '../../shared/dates.js';
import { forbidden } from '../http.mjs';

export function createResources(app) {
  const { repos, settings } = app;
  const today = () => todayIn(settings.tz());

  function holidaysFor(state) {
    return holidaySet(settings.get('publicHolidays'), state || settings.get('firm').state);
  }

  // Hours a person can work in a date range, net of leave and their state's public holidays.
  function available(person, from, to, leave) {
    const hol = holidaysFor(person.location_state);
    const perDay = (Number(person.standard_hours) || 37.5) * (Number(person.fte) || 1) / 5;
    let h = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!isBusinessDay(d, hol)) continue;
      if (person.available_from && d < person.available_from) continue;
      if (person.available_to && d > person.available_to) continue;
      if (leave.some((l) => l.from <= d && l.to >= d)) continue;
      h += perDay;
    }
    return h;
  }

  function allocated(allocs, from, to, person) {
    const hol = holidaysFor(person?.location_state);
    let confirmed = 0, tentative = 0, billable = 0;
    for (const a of allocs) {
      const s = a.start_date > from ? a.start_date : from;
      const e = a.end_date < to ? a.end_date : to;
      if (s > e) continue;
      let days = 0;
      for (let d = s; d <= e; d = addDays(d, 1)) if (isBusinessDay(d, hol)) days++;
      const h = (Number(a.hours_per_week) || 0) / 5 * days;
      if (a.status === 'Confirmed') confirmed += h; else tentative += h;
      if (a.billable !== false) billable += h;
    }
    return { confirmed, tentative, billable };
  }

  // RES-005: capacity against demand by week, with over- and under-allocation.
  function capacity(ctx, { from = weekStart(today()), weeks = 8, group = 'person', practice, grade } = {}) {
    if (ctx.access.isExternal) throw forbidden();
    const start = weekStart(from);
    const weekStarts = Array.from({ length: Number(weeks) }, (_, i) => addDays(start, i * 7));
    const people = repos.person.find({}).filter((p) => p.active !== false && p.delivery !== false && (!practice || p.practice === practice) && (!grade || p.grade === grade));
    const allocs = repos.allocation.find({});
    const leave = repos.leave.find({});
    const rows = people.map((p) => {
      const pa = allocs.filter((a) => a.person_id === p.id);
      const pl = leave.filter((l) => l.person_id === p.id);
      const cells = weekStarts.map((ws) => {
        const we = addDays(ws, 6);
        const avail = available(p, ws, we, pl);
        const al = allocated(pa, ws, we, p);
        const util = avail ? (al.confirmed + al.tentative) / avail : null;
        return { week: ws, available: avail, confirmed: al.confirmed, tentative: al.tentative, utilisation: util, flag: util == null ? 'Unavailable' : util > 1.05 ? 'Over' : util < 0.6 ? 'Under' : 'OK' };
      });
      return { id: p.id, name: p.name, grade: p.grade, practice: p.practice, location: p.location_state, employment_type: p.employment_type, cells };
    });
    // Unnamed demand: placeholder allocations and open resource requests (RES-008, RES-003).
    const demand = [];
    for (const a of allocs.filter((x) => !x.person_id)) demand.push({ kind: 'Placeholder', role: a.placeholder_role || a.rate_role, project_id: a.project_id, hours_per_week: a.hours_per_week, start_date: a.start_date, end_date: a.end_date });
    for (const r of repos.resource_request.find({}).filter((x) => ['Open', 'Proposed'].includes(x.status))) demand.push({ kind: 'Request', role: r.role, grade: r.grade, project_id: r.project_id, hours_per_week: r.hours_per_week, start_date: r.start_date, end_date: r.end_date, critical: r.critical, id: r.id });
    const vis = new Set(ctx.access.visibleEngagementIds());
    const demandRows = demand.filter((x) => vis.has(repos.project.get(x.project_id)?.engagement_id)).map((x) => ({ ...x, project: repos.project.get(x.project_id)?.name, cells: weekStarts.map((ws) => (x.start_date <= addDays(ws, 6) && x.end_date >= ws ? Number(x.hours_per_week) : 0)) }));
    let grouped = rows;
    if (group === 'grade' || group === 'practice') {
      const key = group === 'grade' ? 'grade' : 'practice';
      const m = new Map();
      for (const r of rows) {
        const g = m.get(r[key]) || { id: r[key], name: r[key] || '—', cells: weekStarts.map((ws) => ({ week: ws, available: 0, confirmed: 0, tentative: 0 })) };
        r.cells.forEach((c, i) => { g.cells[i].available += c.available; g.cells[i].confirmed += c.confirmed; g.cells[i].tentative += c.tentative; });
        m.set(r[key], g);
      }
      grouped = [...m.values()].map((g) => ({ ...g, cells: g.cells.map((c) => ({ ...c, utilisation: c.available ? (c.confirmed + c.tentative) / c.available : null, flag: !c.available ? 'Unavailable' : (c.confirmed + c.tentative) / c.available > 1.05 ? 'Over' : (c.confirmed + c.tentative) / c.available < 0.6 ? 'Under' : 'OK' })) }));
    }
    return { weeks: weekStarts, rows: grouped, demand: demandRows };
  }

  // RES-006: planned (allocations) and actual (approved time) utilisation, billable and non-billable.
  function utilisation(ctx, { from = addDays(today(), -84), to = addDays(weekStart(today()), -1), group = 'person' } = {}) {
    if (ctx.access.isExternal) throw forbidden();
    const people = repos.person.find({}).filter((p) => p.active !== false && p.delivery !== false);
    const entries = repos.time_entries.find({ status: 'Approved' }).filter((t) => t.date >= from && t.date <= to);
    const allocs = repos.allocation.find({});
    const leave = repos.leave.find({});
    const rows = people.map((p) => {
      const avail = available(p, from, to, leave.filter((l) => l.person_id === p.id));
      const mine = entries.filter((t) => t.person_id === p.id);
      const billable = mine.filter((t) => t.billable !== false && t.project_id).reduce((a, t) => a + Number(t.hours), 0);
      const nonBillable = mine.filter((t) => t.billable === false || !t.project_id).filter((t) => !(t.code || '').startsWith('LEAVE') && t.code !== 'PUBHOL').reduce((a, t) => a + Number(t.hours), 0);
      const plan = allocated(allocs.filter((a) => a.person_id === p.id), from, to, p);
      return {
        id: p.id, name: p.name, grade: p.grade, practice: p.practice, available: avail, billable, nonBillable,
        actualUtilisation: avail ? billable / avail : null, totalUtilisation: avail ? (billable + nonBillable) / avail : null,
        plannedUtilisation: avail ? plan.billable / avail : null,
      };
    });
    if (group === 'person') return { from, to, rows };
    const key = group;
    const m = new Map();
    for (const r of rows) {
      const g = m.get(r[key]) || { name: r[key] || '—', available: 0, billable: 0, nonBillable: 0, planned: 0 };
      g.available += r.available; g.billable += r.billable; g.nonBillable += r.nonBillable; g.planned += (r.plannedUtilisation || 0) * r.available;
      m.set(r[key], g);
    }
    return { from, to, rows: [...m.values()].map((g) => ({ ...g, actualUtilisation: g.available ? g.billable / g.available : null, plannedUtilisation: g.available ? g.planned / g.available : null })) };
  }

  // RES-007: candidates ranked by skills, clearance, availability and cost.
  function match(ctx, requestId) {
    const r = repos.resource_request.get(requestId);
    const wanted = String(r.skills || '').toLowerCase().split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const clearanceRank = { None: 0, Baseline: 1, NV1: 2, NV2: 3, PV: 4 };
    const leave = repos.leave.find({});
    const allocs = repos.allocation.find({});
    const costs = ctx.access.canGlobal('costrates.read');
    return repos.person.find({}).filter((p) => p.active !== false && p.delivery !== false).map((p) => {
      const skills = (p.skills || []).map((s) => String(s.name).toLowerCase());
      const skillHits = wanted.filter((w) => skills.some((s) => s.includes(w) || w.includes(s)));
      const clearance = (p.clearances || []).filter((c) => !c.expiry || c.expiry >= r.end_date).map((c) => clearanceRank[c.level] || 0).sort().at(-1) || 0;
      const clearanceOk = clearance >= (clearanceRank[r.clearance] || 0);
      const avail = available(p, r.start_date, r.end_date, leave.filter((l) => l.person_id === p.id));
      const booked = allocated(allocs.filter((a) => a.person_id === p.id), r.start_date, r.end_date, p);
      const weeksN = Math.max(1, diffDays(r.start_date, r.end_date) / 7);
      const freePerWeek = Math.max(0, (avail - booked.confirmed - booked.tentative) / weeksN);
      const fit = Math.min(1, freePerWeek / (Number(r.hours_per_week) || 1));
      const gradeMatch = !r.grade || p.grade === r.grade;
      const score = (wanted.length ? skillHits.length / wanted.length : 0.5) * 40 + (clearanceOk ? 25 : 0) + fit * 25 + (gradeMatch ? 10 : 0);
      return {
        person_id: p.id, name: p.name, grade: p.grade, practice: p.practice, location: p.location_state, skills: skillHits, clearanceOk, freeHoursPerWeek: Math.round(freePerWeek * 10) / 10,
        cost: costs ? app.rates.personCost(p.id, p.grade, r.start_date) : undefined, score: Math.round(score),
      };
    }).sort((a, b) => b.score - a.score).slice(0, 12);
  }

  // RES-011: who is on which project, in what role, at what allocation, with onboarding status.
  function team(ctx, engagementId) {
    const projects = repos.project.find({ engagement_id: engagementId });
    const e = repos.engagement.get(engagementId);
    const reqs = e.onboarding_requirements || [];
    const rows = [];
    for (const p of projects) {
      for (const a of repos.allocation.find({ project_id: p.id })) {
        const person = a.person_id ? repos.person.get(a.person_id) : null;
        const done = a.onboarding || {};
        rows.push({
          allocation_id: a.id, project_id: p.id, project: p.name, person_id: a.person_id, name: person?.name || `${a.placeholder_role} (placeholder)`, role: a.rate_role || person?.grade,
          hours_per_week: a.hours_per_week, fte: (Number(a.hours_per_week) || 0) / (Number(person?.standard_hours) || 37.5), status: a.status, start_date: a.start_date, end_date: a.end_date,
          key_person: a.key_person, onboarding: reqs.map((r) => ({ item: r, done: Boolean(done[r]) })), onboarded: reqs.every((r) => done[r]),
          clearances: person?.clearances || [],
        });
      }
    }
    return { requirements: reqs, rows };
  }

  // RES-002: clearances and certifications expiring within the alert window.
  function expiries(days = settings.get('alerts').clearanceExpiryDays) {
    const horizon = addDays(today(), days);
    const out = [];
    for (const p of repos.person.find({}).filter((x) => x.active !== false)) {
      for (const [kind, list] of [['Clearance', p.clearances], ['Certification', p.certifications]]) {
        for (const c of list || []) if (c.expiry && c.expiry <= horizon) out.push({ person_id: p.id, name: p.name, kind, item: c.level || c.name, expiry: c.expiry, expired: c.expiry < today() });
      }
    }
    return out.sort((a, b) => a.expiry.localeCompare(b.expiry));
  }

  return { capacity, utilisation, match, team, expiries, available, allocated };
}
