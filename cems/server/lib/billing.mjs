// Invoicing (FIN-034..039, TEX-006, TEX-009): draft invoices with timesheet-extract supporting detail,
// review by the engagement manager and finance, issue through the accounting system, status sync.
import { addDays, todayIn, monthOf } from '../../shared/dates.js';
import { badRequest, forbidden, notFound, unprocessable } from '../http.mjs';
import { nowIso } from '../db.mjs';

const r2 = (v) => Math.round(v * 100) / 100;

export function createBilling(app) {
  const { repos, settings, finance, entities, audit, notify, integrations } = app;
  const today = () => todayIn(settings.tz());
  const gst = () => settings.get('finance').gstRate;
  const sys = (ctx) => ({ ...ctx, system: true });

  // FIN-035: prepares a draft invoice for a project up to a date from unbilled approved time,
  // billable expenses and supplier costs, and billing events ready to invoice.
  function draft(ctx, { project_id: projectId, period_to: periodTo = today(), po_id: poId = null }) {
    const p = repos.project.get(projectId);
    if (!p) throw notFound();
    if (!ctx.access.can(p.engagement_id, 'billing', 'C') && !ctx.access.can(p.engagement_id, 'billing', 'U')) throw forbidden('Finance prepares invoices.');
    const e = repos.engagement.get(p.engagement_id);
    const d = finance.load(projectId);
    const model = finance.projectModel(d);
    const valued = finance.valueEntries(d, periodTo).filter((t) => !t.invoice_id && t.billable !== false && t.hours > 0);
    const arrs = finance.arrangements(d);
    const tmStages = new Set(arrs.filter((a) => a.model === 'T&M' || a.model === 'Capped T&M').flatMap((a) => [...a.stageIds]));
    const tmMain = ['T&M', 'Capped T&M'].includes(arrs[0].model);
    const tmEntries = valued.filter((t) => (t.stage_id ? tmStages.has(t.stage_id) : tmMain));
    const lines = [];
    const detail = [];
    const byPerson = new Map();
    for (const t of tmEntries) {
      const k = `${t.person_id}|${t.role}`;
      const g = byPerson.get(k) || { person: repos.person.get(t.person_id)?.name, role: t.role, hours: 0, days: 0, amount: 0, ids: [] };
      g.hours += t.hours; g.days += t.billableDays || 0; g.amount += t.revenueValue; g.ids.push(t.id);
      byPerson.set(k, g);
      detail.push({ date: t.date, person: g.person, hours: t.hours, days: t.billableDays, task: t.task_id ? repos.work_item.get(t.task_id)?.name : null });
    }
    const daily = (e.billing_unit || 'day') === 'day';
    for (const g of byPerson.values()) {
      const qty = daily ? Math.round(g.days * 100) / 100 : g.hours;
      lines.push({ description: `${g.person} — ${g.role}`, qty, unit: daily ? 'day' : 'hour', rate: qty ? r2(g.amount / qty) : 0, amount: r2(g.amount), source: 'time', ids: g.ids });
    }
    // FIN-039: billing caps.
    const cap = arrs[0].model === 'Capped T&M' ? arrs[0].cap : null;
    if (cap) {
      const billed = repos.invoice.find({ engagement_id: e.id }).filter((i) => i.project_id === projectId && !['Void', 'Draft'].includes(i.status)).reduce((a, i) => a + Number(i.amount), 0);
      const room = Math.max(0, cap - billed);
      const total = lines.reduce((a, l) => a + l.amount, 0);
      if (total > room) lines.push({ description: `Billing cap adjustment (cap $${cap.toLocaleString('en-AU')})`, qty: 1, unit: 'each', rate: r2(room - total), amount: r2(room - total), source: 'cap' });
    }
    const markup = Number(e.expense_markup) || 0;
    for (const x of d.expenses.filter((y) => y.status === 'Approved' && y.billable && !y.invoice_id && y.date <= periodTo)) {
      lines.push({ description: `Expense: ${x.category} — ${x.description}${markup ? ` (+${(markup * 100).toFixed(0)}% mark-up)` : ''}`, qty: 1, unit: 'each', rate: r2(x.amount * (1 + markup)), amount: r2(x.amount * (1 + markup)), source: 'expense', ids: [x.id] });
    }
    for (const x of d.supplier.filter((y) => y.billable && !y.invoice_id && y.date <= periodTo)) {
      lines.push({ description: `Third-party: ${x.supplier} ${x.invoice_ref || ''}`.trim(), qty: 1, unit: 'each', rate: r2(x.amount * (1 + markup)), amount: r2(x.amount * (1 + markup)), source: 'supplier', ids: [x.id] });
    }
    for (const b of d.billing.filter((y) => y.status === 'Ready to invoice' || (y.status === 'Planned' && ['Instalment', 'Recurring fee'].includes(y.kind) && y.planned_date <= periodTo))) {
      lines.push({ description: b.description, qty: 1, unit: 'each', rate: Number(b.amount), amount: r2(Number(b.amount)), source: 'billing_event', ids: [b.id] });
    }
    if (model === 'Retainer' && !d.billing.length) {
      const fee = Number(p.retainer_fee) || 0;
      const month = monthOf(periodTo);
      const already = repos.invoice.find({ engagement_id: e.id }).some((i) => i.project_id === projectId && i.retainer_month === month && i.status !== 'Void');
      if (fee && !already) lines.push({ description: `Retainer fee ${month}`, qty: 1, unit: 'month', rate: fee, amount: fee, source: 'retainer', month });
    }
    if (!lines.length) throw unprocessable('There is nothing to invoice for this project and period.');
    const funding = repos.funding.find({ engagement_id: e.id }).filter((f) => f.project_id === projectId);
    const po = poId ? repos.po.get(poId) : funding.filter((f) => f.instrument_kind === 'po').map((f) => repos.po.get(f.instrument_id)).find((x) => x?.status === 'Active');
    const sow = funding.filter((f) => f.instrument_kind === 'contract').map((f) => repos.contract.get(f.instrument_id))[0];
    const amount = r2(lines.reduce((a, l) => a + l.amount, 0));
    const tax = r2(amount * gst());
    const fromDate = detail.map((x) => x.date).sort()[0] || periodTo;
    const inv = entities.create(sys(ctx), 'invoice', {
      engagement_id: e.id, project_id: projectId, po_id: po?.id || null, contract_id: sow?.id || null, period_from: fromDate, period_to: periodTo,
      lines: lines.map(({ ids, ...l }) => l), amount, gst: tax, total: r2(amount + tax), status: 'Draft', supporting_detail: detail.sort((a, b) => a.date.localeCompare(b.date)),
      po_number: po?.number || null, sow_reference: sow?.reference || null, retainer_month: lines.find((l) => l.source === 'retainer')?.month || null,
      line_sources: lines.map((l) => ({ source: l.source, ids: l.ids || [] })),
    });
    claim(inv.id, lines);
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'create', entity: 'invoice', entityId: inv.id, engagementId: e.id, summary: `Draft invoice $${amount.toLocaleString('en-AU')} ex GST prepared for ${p.name}` });
    notify.send([e.manager_id], { kind: 'invoice', title: `Draft invoice to review: ${p.name}`, body: `$${amount.toLocaleString('en-AU')} ex GST`, link: `/engagements/${e.id}/financials?tab=invoices`, engagementId: e.id });
    return entities.get(ctx, 'invoice', inv.id);
  }

  function claim(invoiceId, lines, release = false) {
    for (const l of lines) {
      const repo = l.source === 'time' ? repos.time_entries : l.source === 'expense' ? repos.expense : l.source === 'supplier' ? repos.supplier_cost : l.source === 'billing_event' ? repos.billing_event : null;
      if (!repo) continue;
      for (const id of l.ids || []) {
        const changes = { invoice_id: release ? null : invoiceId };
        if (l.source === 'billing_event') changes.status = release ? 'Ready to invoice' : 'Invoiced';
        repo.patch(id, changes, null);
      }
    }
    finance.clearMemo();
  }

  // Draft → EM review → Finance review → Approved → Sent to accounting → Issued → Paid / Overdue / Disputed.
  async function act(ctx, id, action, body = {}) {
    const inv = repos.invoice.get(id);
    if (!inv) throw notFound();
    const engId = inv.engagement_id;
    const isFin = ctx.access.hasGlobal('finance') || ctx.access.can(engId, 'billing', 'A');
    const isEm = ctx.access.rolesOn(engId).includes('engagement_manager');
    const move = (status, summary, extra = {}) => entities.patch(ctx, 'invoice', id, { status, ...extra }, summary);
    switch (action) {
      case 'submit':
        if (inv.status !== 'Draft') throw badRequest('Only drafts are submitted for review.');
        move('EM review', 'Invoice sent to the engagement manager for review');
        notify.send([repos.engagement.get(engId).manager_id], { kind: 'invoice', title: `Invoice review: ${repos.project.get(inv.project_id)?.name}`, link: `/engagements/${engId}/financials?tab=invoices`, mandatory: true });
        break;
      case 'em_approve':
        if (inv.status !== 'EM review') throw badRequest('Not awaiting engagement manager review.');
        if (!isEm && !ctx.access.can(engId, 'billing', 'U')) throw forbidden();
        move('Finance review', 'Invoice reviewed by the engagement manager', { em_reviewed_by: ctx.user.id, em_comment: body.comment || null });
        notify.send(app.memberships.globalUsers('finance'), { kind: 'invoice', title: `Invoice ready for finance review`, link: '/finance/invoices', mandatory: true });
        break;
      case 'finance_approve':
        if (inv.status !== 'Finance review') throw badRequest('Not awaiting finance review.');
        if (!isFin) throw forbidden('Finance approves invoices.');
        move('Approved', 'Invoice approved by finance', { finance_approved_by: ctx.user.id });
        break;
      case 'send': {
        if (inv.status !== 'Approved') throw badRequest('Approve the invoice first.');
        if (!isFin) throw forbidden();
        move('Sent to accounting', 'Invoice sent to the accounting system');
        const res = await integrations.call({ system: 'accounting', operation: 'create-invoice', key: `invoice:${id}`, payload: { id }, fn: () => accountingCreate(id) });
        if (!res.ok) throw badRequest(`The accounting system did not accept the invoice: ${res.error}. It will be retried.`);
        const terms = Number(repos.client.get(repos.engagement.get(engId).client_id)?.payment_terms_days) || settings.get('finance').defaultPaymentTermsDays;
        move('Issued', `Invoice issued as ${res.response.number}`, { number: res.response.number, external_id: res.response.id, issue_date: today(), due_date: addDays(today(), terms), sent_at: nowIso() });
        app.integrations.emitEvent('invoice.issued', { id, number: res.response.number });
        break;
      }
      case 'mark_paid':
        if (!isFin) throw forbidden();
        move('Paid', 'Invoice marked paid', { paid_date: body.date || today(), paid_amount: inv.total });
        break;
      case 'dispute':
        if (!isFin && !isEm) throw forbidden();
        if (!body.reason) throw badRequest('Give a reason.');
        move('Disputed', `Invoice disputed: ${body.reason}`, { dispute_reason: body.reason });
        break;
      case 'void':
        if (!isFin) throw forbidden();
        if (['Issued', 'Paid'].includes(inv.status)) throw badRequest('Issued invoices are credited in the accounting system, not voided here.');
        move('Void', 'Invoice voided');
        claim(id, inv.line_sources || [], true);
        break;
      case 'return':
        if (!['EM review', 'Finance review'].includes(inv.status)) throw badRequest('Nothing to return.');
        move('Draft', `Invoice returned: ${body.reason || ''}`);
        break;
      default:
        throw notFound('Unknown invoice action');
    }
    finance.clearMemo();
    return entities.get(ctx, 'invoice', id);
  }

  // Simulated accounting adapter (INT-005): returns the invoice number the ledger would assign.
  function accountingCreate(id) {
    const n = app.sequence('accounting', 'invoice');
    return { id: `ACC-${id.slice(-6).toUpperCase()}`, number: `INV-${new Date().getFullYear()}-${String(1000 + n).padStart(5, '0')}` };
  }

  // FIN-036: status sync — past-due issued invoices become Overdue (paid status comes from the ledger).
  function syncStatuses() {
    let n = 0;
    for (const inv of repos.invoice.find({ status: 'Issued' })) {
      if (inv.due_date && inv.due_date < today()) { repos.invoice.patch(inv.id, { status: 'Overdue' }, null); n++; }
    }
    return `${n} overdue`;
  }

  // TEX-009 / FIN-014: supplier costs from the accounting system (CSV export), idempotent by external id.
  function importSupplierCosts(ctx, rows) {
    if (!ctx.access.hasGlobal('finance')) throw forbidden();
    const results = { created: 0, skipped: 0, errors: [] };
    rows.forEach((r, i) => {
      const project = repos.project.find({}).find((p) => p.code === r.project_code || p.id === r.project_id);
      if (!project) { results.errors.push({ row: i + 2, error: `Unknown project ${r.project_code}` }); return; }
      const ext = r.external_id || `${r.supplier}|${r.invoice_ref}|${r.amount}|${r.date}`;
      if (repos.supplier_cost.find({ project_id: project.id }).some((x) => x.external_id === ext)) { results.skipped++; return; }
      if (!r.date || !Number(r.amount)) { results.errors.push({ row: i + 2, error: 'Date and amount are required' }); return; }
      entities.create(sys(ctx), 'supplier_cost', { project_id: project.id, supplier: r.supplier, invoice_ref: r.invoice_ref, date: r.date, cost_type: r.cost_type || 'third-party', description: r.description, amount: Number(r.amount), billable: ['yes', 'true', '1'].includes(String(r.billable).toLowerCase()), source: 'Accounting import', external_id: ext });
      results.created++;
    });
    audit.record({ userId: ctx.user.id, ip: ctx.ip, action: 'import', entity: 'supplier_cost', summary: `Supplier costs imported: ${results.created} created, ${results.skipped} duplicates skipped, ${results.errors.length} errors` });
    finance.clearMemo();
    return results;
  }

  return { draft, act, syncStatuses, importSupplierCosts };
}
