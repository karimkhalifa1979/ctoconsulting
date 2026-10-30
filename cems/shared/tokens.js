// Report token catalogue (section 8, Appendix A). Every token is classified client-safe or
// internal-only (RPT-021); custom fields are added at runtime (RPT-020).
// audience: 'client' = client-safe, 'internal' = internal-only, 'configurable' = per engagement setting.

const t = (path, type, audience, desc, example) => ({ path, type, audience, desc, example });

// Tokens available at the top level of every template.
export const GLOBAL_TOKENS = [
  t('report.week_ending', 'date', 'client', 'Week ending date of the reporting period', '30/10/2026'),
  t('report.period_start', 'date', 'client', 'First day of the reporting period', '24/10/2026'),
  t('report.as_at', 'datetime', 'client', 'As-at timestamp of the frozen snapshot (RPT-030)', '30/10/2026 9:12 am'),
  t('report.financials_as_at', 'date', 'client', 'Financial figures as at: end of the latest fully approved timesheet week (BR-02)', '26/10/2026'),
  t('report.version', 'text', 'client', 'Report version number', '2'),
  t('report.prepared_by', 'text', 'client', 'Issuing engagement manager', 'Marcus Chen'),
  t('report.classification', 'text', 'client', 'Protective marking or sensitivity label', 'OFFICIAL: Sensitive'),
  t('report.type', 'text', 'client', 'Report type', 'Weekly status'),
  t('report.audience', 'text', 'client', 'Audience (Client or Internal)', 'Client'),
  t('report.name', 'text', 'client', 'Generated file name', 'DRS_DRS-E001_WeeklyStatus_2026-10-30_v1'),
  t('client.name', 'text', 'client', 'Client name', 'Department of Regional Services'),
  t('client.code', 'text', 'client', 'Client code', 'DRS'),
  t('client.logo', 'image', 'client', 'Client logo from the client record (RPT-010)', '[image]'),
  t('firm.name', 'text', 'client', 'Firm name', 'CTO Consulting'),
  t('engagement.name', 'text', 'client', 'Engagement name', 'Digital Services Transformation'),
  t('engagement.code', 'text', 'client', 'Engagement code', 'DRS-E001'),
  t('engagement.manager', 'text', 'client', 'Engagement manager', 'Marcus Chen'),
  t('engagement.executive', 'text', 'client', 'Engagement executive', 'Olivia Bennett'),
  t('engagement.sponsor', 'text', 'client', 'Client sponsor', 'Rachel Kim'),
  t('engagement.start_date', 'date', 'client', 'Engagement start', '01/07/2026'),
  t('engagement.end_date', 'date', 'client', 'Engagement end', '30/06/2027'),
  t('engagement.overall_rag', 'rag', 'client', 'Engagement health (BR-16)', 'Amber'),
  t('engagement.rag_trend', 'trend', 'client', 'Health movement since the last issued report', '▼ Worse'),
  t('engagement.key_messages', 'rich', 'client', 'Key messages entered at generation (RPT-031)', '• Platform build on track…'),
  t('engagement.summary', 'rich', 'client', 'Engagement summary entered at generation (RPT-031)', '…'),
  t('engagement.decisions_required', 'rich', 'client', 'Decisions required from the client (RPT-031)', '…'),
  t('engagement.escalations', 'rich', 'client', 'Escalations (RPT-031)', '…'),
  t('engagement.project_count', 'number', 'client', 'Number of in-scope projects', '3'),
  t('exception.raised', 'bool', 'client', 'Whether a tolerance breach is forecast', 'Yes'),
  t('exception.summary', 'rich', 'client', 'Summary of forecast tolerance breaches', 'Cost tolerance forecast to be exceeded…'),
  t('changes_since_last.forecast_movement', 'currency', 'internal', 'Change in EAC (cost basis) since the previous issued report', '$12,400'),
  t('changes_since_last.previous_report', 'text', 'client', 'Name of the previous issued report compared against', '…_v1'),
  t('chart.budget_burn', 'chart', 'client', 'Budget burn-down chart (fees for client audiences, cost for internal) (RPT-016)', '[chart]'),
  t('chart.milestone_timeline', 'chart', 'client', 'Milestone timeline chart', '[chart]'),
  t('chart.rag_trend', 'chart', 'client', 'RAG trend chart', '[chart]'),
  t('chart.risk_heatmap', 'chart', 'client', 'Risk heat map', '[chart]'),
  t('chart.po_burn', 'chart', 'client', 'PO burn-down chart', '[chart]'),
];

// Financial tokens (FIN-049); available at engagement level and inside each project.
export const FIN_TOKENS = [
  t('fin.contract_value', 'currency', 'client', 'Total contract value: original plus approved variations (FIN-003)', '$1,250,000'),
  t('fin.invoiced_to_date', 'currency', 'client', 'Invoiced to date (ex GST)', '$612,300'),
  t('fin.remaining_value', 'currency', 'client', 'Contract value remaining', '$637,700'),
  t('fin.po_value', 'currency', 'client', 'PO value', '$800,000'),
  t('fin.po_consumed_pct', 'percent', 'client', 'PO consumed: (invoiced + approved unbilled) ÷ PO value', '78.4%'),
  t('fin.po_remaining', 'currency', 'client', 'PO funds remaining', '$172,800'),
  t('fin.po_exhaustion_date', 'date', 'client', 'Forecast PO exhaustion date (FIN-027)', '12/03/2027'),
  t('fin.po_exhaustion_before_end', 'bool', 'client', 'PO forecast to run out before the planned end date (BR-05)', 'Yes'),
  t('fin.forecast_fees_at_completion', 'currency', 'client', 'Forecast total fees at completion', '$1,240,000'),
  t('fin.fees_to_date', 'currency', 'client', 'Fees earned to date (recognised revenue)', '$655,000'),
  t('fin.as_at', 'date', 'client', 'Financial figures as at (BR-02)', '26/10/2026'),
  t('fin.spi', 'number', 'configurable', 'Schedule performance index (EV ÷ PV)', '0.96'),
  t('fin.cpi', 'number', 'configurable', 'Cost performance index (EV ÷ AC)', '0.93'),
  t('fin.bac', 'currency', 'internal', 'Budget at completion (cost)', '$740,000'),
  t('fin.actual_cost', 'currency', 'internal', 'Actual cost to date', '$402,100'),
  t('fin.eac', 'currency', 'internal', 'Estimate at completion (cost)', '$772,000'),
  t('fin.etc', 'currency', 'internal', 'Estimate to complete (cost)', '$369,900'),
  t('fin.vac', 'currency', 'internal', 'Variance at completion (BAC − EAC)', '-$32,000'),
  t('fin.budget_consumed_pct', 'percent', 'internal', 'Budget consumed (AC ÷ BAC)', '54.3%'),
  t('fin.forecast_margin_pct', 'percent', 'internal', 'Forecast margin at completion', '37.7%'),
  t('fin.baseline_margin_pct', 'percent', 'internal', 'Baseline (budgeted) margin', '40.8%'),
  t('fin.margin_erosion', 'percent', 'internal', 'Margin erosion: baseline margin % − forecast margin %', '3.1%'),
  t('fin.wip', 'currency', 'internal', 'Work in progress (unbilled revenue)', '$42,700'),
  t('fin.billed_in_advance', 'currency', 'internal', 'Billed in advance (contract liability)', '$0'),
  t('fin.write_downs', 'currency', 'internal', 'Write-downs to date', '$4,500'),
  t('fin.realisation', 'percent', 'internal', 'Realisation: billed value ÷ standard value', '94.2%'),
  t('fin.burn_rate', 'currency', 'internal', 'Average weekly cost over the last four weeks', '$28,400'),
];

// Tokens inside a project context: at the top level of project templates, or inside {{#each engagement.projects}}.
export const PROJECT_TOKENS = [
  t('project.name', 'text', 'client', 'Project name', 'Platform implementation'),
  t('project.code', 'text', 'client', 'Project number', 'DRS-E001-P02'),
  t('project.manager', 'text', 'client', 'Project manager', 'Priya Raman'),
  t('project.stage', 'text', 'client', 'Current stage', 'Build'),
  t('project.state', 'text', 'client', 'Lifecycle state', 'In delivery'),
  t('project.approach', 'text', 'client', 'Delivery approach', 'hybrid'),
  t('project.percent_complete', 'percent', 'client', 'Percent complete', '46%'),
  t('project.start_date', 'date', 'client', 'Planned start', '01/07/2026'),
  t('project.end_baseline', 'date', 'client', 'Baseline end date', '19/03/2027'),
  t('project.end_forecast', 'date', 'client', 'Forecast end date', '26/03/2027'),
  t('project.next_milestone', 'text', 'client', 'Next milestone', 'Release 2'),
  t('project.next_milestone_date', 'date', 'client', 'Forecast date of the next milestone', '14/11/2026'),
  t('status.overall_rag', 'rag', 'client', 'Overall RAG', 'Amber'),
  t('status.overall_trend', 'trend', 'client', 'Overall RAG movement since the last issued report', '► Steady'),
  t('status.schedule_rag', 'rag', 'client', 'Schedule RAG', 'Green'),
  t('status.budget_rag', 'rag', 'client', 'Budget RAG', 'Amber'),
  t('status.scope_rag', 'rag', 'client', 'Scope RAG', 'Green'),
  t('status.risk_rag', 'rag', 'client', 'Risks and issues RAG', 'Amber'),
  t('status.resource_rag', 'rag', 'client', 'Resources RAG', 'Green'),
  t('status.quality_rag', 'rag', 'client', 'Quality RAG', 'Green'),
  t('status.overall_commentary', 'rich', 'client', 'Commentary on the overall rating', '…'),
  t('status.schedule_commentary', 'rich', 'client', 'Schedule commentary', '…'),
  t('status.budget_commentary', 'rich', 'client', 'Budget commentary', '…'),
  t('status.scope_commentary', 'rich', 'client', 'Scope commentary', '…'),
  t('status.risk_commentary', 'rich', 'client', 'Risks and issues commentary', '…'),
  t('status.resource_commentary', 'rich', 'client', 'Resources commentary', '…'),
  t('status.quality_commentary', 'rich', 'client', 'Quality commentary', '…'),
  t('status.executive_summary', 'rich', 'client', 'Executive summary', '…'),
  t('status.achievements', 'rich', 'client', 'Achievements this period', '…'),
  t('status.next_period', 'rich', 'client', 'Planned activities next period', '…'),
  t('status.decisions_required', 'rich', 'client', 'Decisions required', '…'),
  t('status.escalations', 'rich', 'client', 'Escalations', '…'),
  t('status.client_actions', 'rich', 'client', 'Client actions outstanding', '…'),
  t('status.approval_state', 'text', 'internal', 'Status update approval state at generation', 'Approved'),
  t('status.hours_this_period', 'number', 'internal', 'Hours recorded this period', '214'),
  t('exception.raised', 'bool', 'client', 'Whether this project forecasts a tolerance breach', 'No'),
  t('exception.summary', 'rich', 'client', 'Summary of this project’s forecast tolerance breaches', '…'),
];

// Repeating collections (RPT-013) and the fields of each item.
const item = (key, type, desc, audience = 'client') => ({ key, type, desc, audience });
export const COLLECTIONS = {
  'engagement.projects': {
    desc: 'In-scope projects; inside the loop every project token is available (RPT-019)', audience: 'client', context: 'project', fields: [],
    filters: ['all', 'active'], sorts: ['name', 'overall_rag', 'end_forecast'],
  },
  milestones: {
    desc: 'Milestones with baseline, forecast and actual dates', audience: 'client',
    fields: [item('name', 'text', 'Milestone'), item('project', 'text', 'Project'), item('kind', 'text', 'Type'), item('key', 'bool', 'Key milestone'), item('planned_date', 'date', 'Planned'), item('baseline_date', 'date', 'Baseline'), item('forecast_date', 'date', 'Forecast'), item('actual_date', 'date', 'Actual'), item('status', 'text', 'Status'), item('variance_days', 'number', 'Variance in days (forecast − baseline)')],
    filters: ['all', 'key', 'lookahead', 'last_period', 'open', 'missed', 'achieved'], sorts: ['forecast_date', 'baseline_date', 'name', 'variance_days'],
  },
  deliverables: {
    desc: 'Deliverables with due date and acceptance status', audience: 'client',
    fields: [item('id', 'text', 'Deliverable ID'), item('title', 'text', 'Title'), item('project', 'text', 'Project'), item('owner', 'text', 'Owner'), item('due_date', 'date', 'Forecast due date'), item('baseline_date', 'date', 'Baseline date'), item('status', 'text', 'Status'), item('acceptance_status', 'text', 'Acceptance status'), item('version', 'text', 'Version')],
    filters: ['all', 'lookahead', 'last_period', 'open', 'submitted', 'accepted'], sorts: ['due_date', 'title', 'status'],
  },
  risks: {
    desc: 'Risks (client audiences receive client-visible items only)', audience: 'client', raid: true,
    fields: [item('id', 'text', 'Risk ID'), item('title', 'text', 'Title'), item('description', 'text', 'Cause, event and effect'), item('project', 'text', 'Project'), item('category', 'text', 'Category'), item('rating', 'rag', 'Current rating (Low, Medium, High, Extreme)'), item('inherent_rating', 'text', 'Inherent rating'), item('score', 'number', 'Rating score'), item('trend', 'text', 'Trend'), item('owner', 'text', 'Owner'), item('response', 'text', 'Response strategy and actions'), item('due_date', 'date', 'Next review due'), item('status', 'text', 'Status'), item('kind', 'text', 'Threat or opportunity')],
    filters: ['reportable', 'open', 'high', 'all', 'new'], sorts: ['rating', 'score', 'id', 'due_date'],
  },
  issues: {
    desc: 'Issues (client audiences receive client-visible items only)', audience: 'client', raid: true,
    fields: [item('id', 'text', 'Issue ID'), item('title', 'text', 'Title'), item('description', 'text', 'Description'), item('project', 'text', 'Project'), item('severity', 'rag', 'Severity'), item('priority', 'text', 'Priority'), item('owner', 'text', 'Owner'), item('due_date', 'date', 'Target resolution date'), item('status', 'text', 'Status'), item('resolution', 'text', 'Resolution')],
    filters: ['reportable', 'open', 'high', 'overdue', 'all'], sorts: ['severity', 'due_date', 'id'],
  },
  dependencies: {
    desc: 'Dependencies with owner, need-by date and status', audience: 'client', raid: true,
    fields: [item('id', 'text', 'Dependency ID'), item('title', 'text', 'Dependency'), item('project', 'text', 'Project'), item('direction', 'text', 'Inbound or outbound'), item('type', 'text', 'Type'), item('provider', 'text', 'Provider'), item('owner', 'text', 'Owner'), item('due_date', 'date', 'Need-by date'), item('status', 'text', 'Status'), item('overdue', 'bool', 'Overdue')],
    filters: ['reportable', 'open', 'client', 'overdue', 'cross_project', 'all'], sorts: ['due_date', 'id'],
  },
  actions: {
    desc: 'Actions with owner, due date and status', audience: 'client', raid: true,
    fields: [item('id', 'text', 'Action ID'), item('title', 'text', 'Action'), item('project', 'text', 'Project'), item('owner', 'text', 'Owner'), item('owner_org', 'text', 'Firm or client'), item('due_date', 'date', 'Due date'), item('status', 'text', 'Status'), item('overdue', 'bool', 'Overdue')],
    filters: ['reportable', 'open', 'client', 'overdue', 'all'], sorts: ['due_date', 'id'],
  },
  decisions: {
    desc: 'Decisions required and made', audience: 'client', raid: true,
    fields: [item('id', 'text', 'Decision ID'), item('title', 'text', 'Decision'), item('project', 'text', 'Project'), item('owner', 'text', 'Decision-maker'), item('due_date', 'date', 'Needed by'), item('status', 'text', 'Status'), item('decision_date', 'date', 'Date decided'), item('rationale', 'text', 'Rationale')],
    filters: ['reportable', 'required', 'made', 'all'], sorts: ['due_date', 'id'],
  },
  assumptions: {
    desc: 'Assumptions log', audience: 'client', raid: true,
    fields: [item('id', 'text', 'Assumption ID'), item('title', 'text', 'Assumption'), item('project', 'text', 'Project'), item('owner', 'text', 'Owner'), item('due_date', 'date', 'Validate by'), item('status', 'text', 'Status')],
    filters: ['open', 'all'], sorts: ['due_date', 'id'],
  },
  changes: {
    desc: 'Change requests with price and schedule impact', audience: 'client',
    fields: [item('id', 'text', 'Change ID'), item('title', 'text', 'Title'), item('project', 'text', 'Project'), item('type', 'text', 'Type'), item('status', 'text', 'Status'), item('raised_date', 'date', 'Date raised'), item('price_impact', 'currency', 'Price impact'), item('schedule_impact_days', 'number', 'Schedule impact in days'), item('cost_impact', 'currency', 'Cost impact', 'internal'), item('margin', 'percent', 'Margin on change', 'internal')],
    filters: ['all', 'open', 'pending', 'approved', 'raised_this_period', 'approved_this_period'], sorts: ['raised_date', 'id', 'price_impact'],
  },
  people: {
    desc: 'Team members with role and allocation (RES-011)', audience: 'client',
    fields: [item('name', 'text', 'Name'), item('role', 'text', 'Role'), item('project', 'text', 'Project'), item('hours_per_week', 'number', 'Hours per week'), item('fte', 'percent', 'Allocation (% of full time)'), item('status', 'text', 'Tentative or confirmed'), item('start_date', 'date', 'Start'), item('end_date', 'date', 'End')],
    filters: ['all', 'confirmed', 'joining', 'leaving'], sorts: ['name', 'project'],
  },
  fin_lines: {
    desc: 'Financial lines by month: fees for every audience, cost lines internal-only', audience: 'client',
    fields: [item('month', 'text', 'Month'), item('fees_budget', 'currency', 'Fees — budget'), item('fees_actual', 'currency', 'Fees — actual'), item('fees_forecast', 'currency', 'Fees — forecast'), item('cost_budget', 'currency', 'Cost — budget', 'internal'), item('cost_actual', 'currency', 'Cost — actual', 'internal'), item('cost_forecast', 'currency', 'Cost — forecast', 'internal')],
    filters: ['all', 'fy', 'to_date', 'remaining'], sorts: ['month'],
  },
  meetings: {
    desc: 'Upcoming governance meetings and key dates', audience: 'client',
    fields: [item('date', 'date', 'Date'), item('title', 'text', 'Meeting or key date'), item('kind', 'text', 'Type')],
    filters: ['upcoming', 'all'], sorts: ['date'],
  },
  rag_definitions: {
    desc: 'RAG definitions for the appendix (BR-03)', audience: 'client',
    fields: [item('dimension', 'text', 'Dimension'), item('green', 'text', 'Green'), item('amber', 'text', 'Amber'), item('red', 'text', 'Red')],
    filters: ['all'], sorts: [],
  },
  'changes_since_last.rag_movements': {
    desc: 'RAG movements since the previous issued report (up, down, steady)', audience: 'client',
    fields: [item('project', 'text', 'Project'), item('dimension', 'text', 'Dimension'), item('from', 'rag', 'Previous rating'), item('to', 'rag', 'Current rating'), item('direction', 'text', 'Up, down or steady')],
    filters: ['all', 'changed'], sorts: ['project'],
  },
  'changes_since_last.new_risks': {
    desc: 'Risks raised since the previous issued report', audience: 'client',
    fields: [item('id', 'text', 'Risk ID'), item('title', 'text', 'Title'), item('rating', 'rag', 'Rating'), item('project', 'text', 'Project')], filters: ['all'], sorts: ['rating'],
  },
  'changes_since_last.closed_risks': {
    desc: 'Risks closed since the previous issued report', audience: 'client',
    fields: [item('id', 'text', 'Risk ID'), item('title', 'text', 'Title'), item('rating', 'rag', 'Rating'), item('project', 'text', 'Project')], filters: ['all'], sorts: ['rating'],
  },
  'changes_since_last.milestone_movements': {
    desc: 'Milestone forecast date movements since the previous issued report', audience: 'client',
    fields: [item('project', 'text', 'Project'), item('name', 'text', 'Milestone'), item('from', 'date', 'Previous forecast'), item('to', 'date', 'Current forecast'), item('days', 'number', 'Movement in days')], filters: ['all'], sorts: ['days'],
  },
};

// Formatting helpers (RPT-012) and block helpers (RPT-013, RPT-014).
export const HELPERS = {
  date: { args: '[pattern]', desc: 'Formats a date, e.g. {{date report.week_ending "d MMMM yyyy"}}' },
  datetime: { args: '', desc: 'Formats a timestamp in Australian time' },
  currency: { args: '[decimals]', desc: 'AUD currency, e.g. {{currency fin.eac}}' },
  percent: { args: '[decimals]', desc: 'Percentage, e.g. {{percent fin.po_consumed_pct 1}}' },
  number: { args: '[decimals]', desc: 'Number with thousands separators' },
  upper: { args: '', desc: 'UPPER CASE text' },
  lower: { args: '', desc: 'lower case text' },
  title: { args: '', desc: 'Title Case text' },
  yesno: { args: '', desc: 'Yes or No' },
  rag: { args: '', desc: 'Coloured RAG cell or shape that always carries its text label (RPT-015)' },
  rich: { args: '', desc: 'Rich-text narrative with bullets and emphasis in the template’s styles (RPT-018)' },
  chart: { args: '"name" [width="16cm"]', desc: 'Standard chart rendered as an image (RPT-016)' },
  image: { args: '[width="4cm"]', desc: 'Image token such as client.logo' },
};
export const BLOCKS = ['each', 'if', 'unless'];
export const CHARTS = ['budget_burn', 'milestone_timeline', 'rag_trend', 'risk_heatmap', 'po_burn'];

const index = new Map();
for (const tk of [...GLOBAL_TOKENS, ...FIN_TOKENS]) index.set(tk.path, { ...tk, context: 'global' });
for (const tk of PROJECT_TOKENS) if (!index.has(tk.path)) index.set(tk.path, { ...tk, context: 'project' });

export function lookupToken(path) {
  return index.get(path) || null;
}

export function allTokens(customFields = []) {
  const custom = customFields.map((c) => t(`custom.${c.key}`, c.type || 'text', c.audience === 'internal' ? 'internal' : 'client', `Custom field: ${c.label} (${c.entity})`, ''));
  return [...GLOBAL_TOKENS, ...FIN_TOKENS, ...PROJECT_TOKENS, ...custom];
}

// Whether a token is allowed for an audience; configurable tokens depend on the engagement setting.
export function allowedFor(audience, tokenAudience, { clientShowsEvm = false } = {}) {
  if (audience !== 'client') return true;
  if (tokenAudience === 'internal') return false;
  if (tokenAudience === 'configurable') return clientShowsEvm;
  return true;
}
