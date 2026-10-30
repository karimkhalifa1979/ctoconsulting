// Finance API (section 7): positions, POs, periods, budgets, the forecast cycle, invoices,
// imports and standard financial reports with Excel export (FIN-047, FIN-050).
import { forbidden, notFound, FileResponse, badRequest } from '../http.mjs';
import { toXlsx } from '../lib/xlsx.mjs';
import { parseCsv } from '../lib/xlsx.mjs';
import { MIME } from '../lib/files.mjs';
import { fyOf, todayIn } from '../../shared/dates.js';

export function registerFinanceRoutes(r, app) {
  const { repos, finance, forecast, billing, audit, settings } = app;

  const strip = (ctx, engId, pos) => {
    if (!pos) return pos;
    if (ctx.access.canSeeCosts(engId)) return pos;
    const { forecastMargin, baselineMargin, marginErosion, budgetedMargin, wip, wipAgeing, writeDowns, writeUps, realisation, billedInAdvance, labourCost, labourLines, ...rest } = pos; // eslint-disable-line no-unused-vars
    return { ...rest, labourLines: (labourLines || []).map((l) => ({ ...l, cost: undefined })) };
  };
  const projectAccess = (ctx, id) => {
    const p = repos.project.get(id);
    if (!p || !(ctx.access.can(p.engagement_id, 'budget', 'R', { projectId: id }) || ctx.access.can(p.engagement_id, 'billing', 'R'))) throw notFound();
    return p;
  };

  r.get('/api/finance/project/:id', (ctx) => {
    const p = projectAccess(ctx, ctx.params.id);
    return strip(ctx, p.engagement_id, finance.position(p.id, ctx.query.scenario ? { scenario: JSON.parse(ctx.query.scenario) } : {}));
  }, { internal: true });

  r.get('/api/finance/engagement/:id', (ctx) => {
    if (!(ctx.access.can(ctx.params.id, 'budget', 'R') || ctx.access.can(ctx.params.id, 'billing', 'R'))) throw notFound();
    const pos = finance.engagementPosition(ctx.params.id);
    const out = strip(ctx, ctx.params.id, pos);
    out.projects = pos.projects.map((p) => strip(ctx, ctx.params.id, { ...p, labourLines: undefined, nonLabourLines: undefined, billingForecast: undefined }));
    out.cashFlow = finance.cashFlow([ctx.params.id]);
    out.debtors = finance.debtors([ctx.params.id]);
    return out;
  }, { internal: true });

  r.get('/api/finance/po/:id', (ctx) => {
    const po = repos.po.get(ctx.params.id);
    if (!po || !ctx.access.can(po.engagement_id, 'billing', 'R') && !ctx.access.can(po.engagement_id, 'budget', 'R')) throw notFound();
    return finance.poStatus(po);
  }, { internal: true });

  // ---------- Periods (FIN-041) ----------
  r.get('/api/finance/periods', () => {
    const fy = fyOf(todayIn(settings.tz()));
    const stored = new Map(finance.periods().map((p) => [p.id, p]));
    const months = [];
    for (const y of [fy - 1, fy]) for (let i = 0; i < 12; i++) {
      const m = new Date(Date.UTC(y - 1, 6 + i, 1)).toISOString().slice(0, 7);
      months.push({ id: m, fy: y, status: stored.get(m)?.status || 'open', locked_at: stored.get(m)?.locked_at || null });
    }
    return months;
  }, { internal: true });
  r.post('/api/finance/periods/:id/lock', (ctx) => finance.lockPeriod(ctx, ctx.params.id), { internal: true });
  r.post('/api/finance/periods/:id/unlock', (ctx) => finance.unlockPeriod(ctx, ctx.params.id), { internal: true });

  // ---------- Budgets (FIN-008..011) ----------
  r.get('/api/projects/:id/budgets', (ctx) => forecast.budgetList(ctx, ctx.params.id), { internal: true });
  r.put('/api/projects/:id/budget', (ctx) => forecast.saveDraft(ctx, ctx.params.id, ctx.body), { internal: true });
  r.get('/api/projects/:id/budget/bottom-up', (ctx) => forecast.bottomUp(ctx, ctx.params.id), { internal: true });

  // ---------- Forecasts (FIN-018..028) ----------
  r.get('/api/projects/:id/forecast', (ctx) => forecast.working(ctx, ctx.params.id), { internal: true });
  r.get('/api/projects/:id/forecast/compare', (ctx) => forecast.compare(ctx, ctx.params.id), { internal: true });
  r.get('/api/projects/:id/scenarios', (ctx) => forecast.scenarios(ctx, ctx.params.id), { internal: true });
  r.get('/api/forecast/:id', (ctx) => forecast.getVersion(ctx, ctx.params.id), { internal: true });
  r.patch('/api/forecast/:id', (ctx) => forecast.save(ctx, ctx.params.id, ctx.body), { internal: true });
  r.post('/api/forecast/:id/submit', (ctx) => forecast.submitPM(ctx, ctx.params.id), { internal: true });
  r.post('/api/forecast/:id/decision', (ctx) => forecast.financeDecision(ctx, ctx.params.id, ctx.body), { internal: true });
  r.get('/api/forecast-cycles', () => forecast.listCycles(), { internal: true });
  r.post('/api/forecast-cycles', (ctx) => forecast.openCycle(ctx, ctx.body.period), { internal: true });
  r.get('/api/forecast-cycles/:id', (ctx) => forecast.cycleView(ctx, ctx.params.id), { internal: true });
  r.post('/api/forecast-cycles/:id/engagement-submit', (ctx) => forecast.submitEM(ctx, { cycle_id: ctx.params.id, engagement_id: ctx.body.engagement_id, commentary: ctx.body.commentary }), { internal: true });

  // ---------- Invoices (FIN-035) ----------
  r.post('/api/invoices/draft', (ctx) => billing.draft(ctx, ctx.body), { internal: true });
  r.post('/api/invoices/:id/:action', (ctx) => billing.act(ctx, ctx.params.id, ctx.params.action, ctx.body || {}), { internal: true });

  // TEX-009 / FIN-014: supplier costs exported from the accounting system.
  r.post('/api/finance/import/supplier-costs', (ctx) => {
    const text = ctx.body.toString('utf8');
    const rows = parseCsv(text);
    if (!rows.length) throw badRequest('The CSV has no rows. Expected columns: project_code, supplier, invoice_ref, date, amount, cost_type, description, billable, external_id');
    return billing.importSupplierCosts(ctx, rows);
  }, { internal: true, raw: true });

  // ---------- Portfolio finance (FIN-025, FIN-026, FIN-036, FIN-040) ----------
  r.get('/api/finance/revenue-forecast', (ctx) => finance.revenueForecast(ctx, ctx.query.fy ? Number(ctx.query.fy) : undefined), { internal: true });
  r.get('/api/finance/cash-flow', (ctx) => finance.cashFlow(ctx.query.engagement_id ? [ctx.query.engagement_id] : ctx.access.visibleEngagementIds().filter((id) => ctx.access.can(id, 'billing', 'R'))), { internal: true });
  r.get('/api/finance/accuracy', (ctx) => {
    const ids = ctx.access.visibleEngagementIds().filter((id) => ctx.access.can(id, 'budget', 'R')).flatMap((id) => repos.project.find({ engagement_id: id }).map((p) => p.id));
    return finance.forecastAccuracy(ids).map((x) => ({ ...x, project: repos.project.get(x.projectId)?.name, manager: app.auth.getUser(x.manager)?.name }));
  }, { internal: true });
  r.get('/api/finance/debtors', (ctx) => finance.debtors(ctx.access.visibleEngagementIds().filter((id) => ctx.access.can(id, 'billing', 'R'))), { internal: true });

  // FIN-047 standard financial reports, FIN-050 Excel export.
  r.get('/api/finance/reports/:name', async (ctx) => {
    const report = financialReport(ctx, ctx.params.name, ctx.query);
    if (ctx.query.format === 'xlsx') {
      audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'export', entity: 'finance', summary: `Financial report exported: ${report.title}` });
      return new FileResponse(await toXlsx([{ name: report.title, columns: report.columns, rows: report.rows }]), { type: MIME.xlsx, name: `${report.title.replace(/\W+/g, '_')}.xlsx` });
    }
    return report;
  }, { internal: true });

  function financialReport(ctx, name, q) {
    const engIds = (q.engagement_id ? [q.engagement_id] : ctx.access.visibleEngagementIds()).filter((id) => ctx.access.can(id, 'budget', 'R') || ctx.access.can(id, 'billing', 'R'));
    if (!engIds.length) throw forbidden();
    const costs = engIds.every((id) => ctx.access.canSeeCosts(id));
    const projectRows = engIds.flatMap((id) => repos.project.find({ engagement_id: id }).filter((p) => p.state !== 'Cancelled').map((p) => ({ p, e: repos.engagement.get(id), pos: finance.position(p.id) })));
    const money = (key, label) => ({ key, label, type: 'money' });
    const pct = (key, label) => ({ key, label, type: 'percent' });
    const C = (cols) => cols.filter(Boolean);
    switch (name) {
      case 'project-summary': return {
        title: 'Project financial summary',
        columns: C([{ key: 'engagement', label: 'Engagement' }, { key: 'project', label: 'Project' }, { key: 'model', label: 'Model' }, money('contract', 'Contract value'), costs && money('bac', 'BAC'), costs && money('ac', 'Actual cost'), costs && money('eac', 'EAC'), costs && money('vac', 'VAC'), money('fees', 'Fees at completion'), money('invoiced', 'Invoiced'), costs && money('wip', 'WIP'), costs && pct('margin', 'Forecast margin'), { key: 'as_at', label: 'As at' }]),
        rows: projectRows.map(({ p, e, pos }) => ({ engagement: e.name, project: p.name, model: pos.model, contract: pos.contractValue, bac: pos.bac, ac: pos.ac, eac: pos.eac, vac: pos.vac, fees: pos.eacRevenue, invoiced: pos.invoicedToDate, wip: pos.wip, margin: pos.forecastMargin, as_at: pos.asAt })),
      };
      case 'engagement-pl': {
        if (!costs) throw forbidden('The engagement P&L shows costs and margins (ACC-003).');
        return {
          title: 'Engagement profit and loss',
          columns: [{ key: 'engagement', label: 'Engagement' }, money('revenue', 'Revenue recognised'), money('labour', 'Labour cost'), money('expenses', 'Expenses'), money('third', 'Third-party'), money('gross', 'Gross margin $'), pct('gm', 'Gross margin %'), money('eacRev', 'Revenue at completion'), money('eac', 'Cost at completion'), pct('fm', 'Forecast margin %')],
          rows: engIds.map((id) => { const pos = finance.engagementPosition(id); return { engagement: repos.engagement.get(id).name, revenue: pos.recognised, labour: pos.labourCost, expenses: pos.expenseCost, third: pos.supplierCost, gross: pos.recognised - pos.ac, gm: pos.recognised ? (pos.recognised - pos.ac) / pos.recognised : null, eacRev: pos.eacRevenue, eac: pos.eac, fm: pos.forecastMargin }; }),
        };
      }
      case 'monthly': return {
        title: 'Budget, actual and forecast by month',
        columns: C([{ key: 'month', label: 'Month' }, costs && money('budgetCost', 'Budget cost'), costs && money('actualCost', 'Actual cost'), costs && money('forecastCost', 'Forecast cost'), money('budgetRevenue', 'Budget revenue'), money('actualRevenue', 'Actual revenue'), money('forecastRevenue', 'Forecast revenue'), money('invoiced', 'Invoiced')]),
        rows: finance.rollup(projectRows.map((x) => x.pos)).months,
      };
      case 'po-burn': return {
        title: 'PO and contract burn',
        columns: [{ key: 'engagement', label: 'Engagement' }, { key: 'number', label: 'PO' }, { key: 'gst', label: 'GST basis' }, money('value', 'Value'), money('consumed', 'Consumed'), pct('pct', 'Consumed %'), money('remaining', 'Remaining'), { key: 'exhaustion', label: 'Forecast exhaustion' }, { key: 'before', label: 'Before planned end' }],
        rows: engIds.flatMap((id) => repos.po.find({ engagement_id: id }).map((po) => { const s = finance.poStatus(po); return { engagement: repos.engagement.get(id).name, number: po.number, gst: po.gst_basis, value: s.value, consumed: s.consumed, pct: s.consumedPct, remaining: s.remaining, exhaustion: s.exhaustionDate, before: s.exhaustsBeforeEnd ? 'Yes' : 'No' }; })),
      };
      case 'wip-ageing': {
        if (!costs) throw forbidden('WIP is internal-only.');
        return {
          title: 'WIP ageing',
          columns: [{ key: 'engagement', label: 'Engagement' }, { key: 'project', label: 'Project' }, money('wip', 'WIP'), money('b0', '0–30 days'), money('b1', '31–60 days'), money('b2', '61–90 days'), money('b3', 'Over 90 days'), money('advance', 'Billed in advance')],
          rows: projectRows.map(({ p, e, pos }) => ({ engagement: e.name, project: p.name, wip: pos.wip, b0: pos.wipAgeing['0-30'], b1: pos.wipAgeing['31-60'], b2: pos.wipAgeing['61-90'], b3: pos.wipAgeing['90+'], advance: pos.billedInAdvance })),
        };
      }
      case 'debtors': {
        const d = finance.debtors(engIds);
        return { title: 'Debtor ageing', columns: [{ key: 'number', label: 'Invoice' }, { key: 'engagement', label: 'Engagement' }, { key: 'issue_date', label: 'Issued' }, { key: 'due_date', label: 'Due' }, money('total', 'Amount inc GST'), { key: 'status', label: 'Status' }], rows: d.invoices.map((i) => ({ ...i, engagement: repos.engagement.get(i.engagement_id)?.name })), summary: { receivables: d.receivables, buckets: d.buckets, debtorDays: d.debtorDays } };
      }
      case 'margin': {
        if (!costs) throw forbidden('Margins are restricted (ACC-003).');
        return {
          title: 'Margin by project, engagement, client and practice',
          columns: [{ key: 'client', label: 'Client' }, { key: 'engagement', label: 'Engagement' }, { key: 'practice', label: 'Practice' }, { key: 'project', label: 'Project' }, pct('baseline', 'Baseline margin'), pct('forecast', 'Forecast margin'), pct('erosion', 'Erosion')],
          rows: projectRows.map(({ p, e, pos }) => ({ client: repos.client.get(e.client_id)?.legal_name, engagement: e.name, practice: e.practice, project: p.name, baseline: pos.baselineMargin, forecast: pos.forecastMargin, erosion: pos.marginErosion })),
        };
      }
      case 'utilisation': {
        const u = app.resources.utilisation(ctx, {});
        return { title: 'Utilisation and realisation', columns: [{ key: 'name', label: 'Person' }, { key: 'grade', label: 'Grade' }, { key: 'practice', label: 'Practice' }, { key: 'available', label: 'Available hours' }, { key: 'billable', label: 'Billable hours' }, pct('actualUtilisation', 'Actual utilisation'), pct('plannedUtilisation', 'Planned utilisation')], rows: u.rows };
      }
      case 'forecast-movements': return {
        title: 'Forecast movements',
        columns: C([{ key: 'project', label: 'Project' }, { key: 'period', label: 'Cycle' }, costs && money('eac', 'EAC'), money('revenue', 'Revenue at completion'), costs && pct('margin', 'Margin')]),
        rows: projectRows.flatMap(({ p }) => repos.forecast_versions.find({ project_id: p.id }).filter((v) => v.snapshot && v.kind === 'cycle').map((v) => ({ project: p.name, period: v.cycle_period, eac: v.snapshot.eac, revenue: v.snapshot.eacRevenue, margin: v.snapshot.forecastMargin }))),
      };
      case 'change-impact': return {
        title: 'Financial impact of changes',
        columns: C([{ key: 'engagement', label: 'Engagement' }, { key: 'ref', label: 'Change' }, { key: 'title', label: 'Title' }, { key: 'status', label: 'Status' }, money('price', 'Price impact'), costs && money('cost', 'Cost impact'), { key: 'days', label: 'Schedule days' }]),
        rows: engIds.flatMap((id) => repos.change.find({ engagement_id: id }).map((c) => ({ engagement: repos.engagement.get(id).name, ref: c.ref, title: c.title, status: c.status, price: c.impact_price, cost: c.impact_cost, days: c.impact_schedule_days }))),
      };
      case 'revenue-forecast': {
        const f = finance.revenueForecast(ctx, q.fy ? Number(q.fy) : undefined);
        return { title: `Revenue forecast FY${f.fy}`, columns: [{ key: 'month', label: 'Month' }, money('actual', 'Actual'), money('contracted', 'Contracted forecast'), money('unstarted', 'Signed, not started'), money('pipeline', 'Weighted pipeline')], rows: f.months };
      }
      default: throw notFound('Unknown report');
    }
  }
}
