// Builds the starter Word templates (RPT-009) into server/seed/templates/.
// Run with: npm run templates
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, HeadingLevel,
  Header, Footer, PageNumber, BorderStyle, Bookmark, VerticalAlign, LineRuleType,
} from 'docx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'server', 'seed', 'templates');
fs.mkdirSync(OUT, { recursive: true });

const NAVY = '0B1F3A', TEAL = '0FA3B1', GREY = 'F3F6FA', LINE = 'CFD7E2';
const FULL = 9638; // A4 content width in twips with 2 cm margins

const run = (text, opts = {}) => new TextRun({ text, ...opts });
const p = (text, opts = {}) => new Paragraph({ spacing: { after: 80 }, ...opts, children: Array.isArray(text) ? text : [run(text, opts.run || {})] });
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(text)] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(text)] });
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run(text)] });
const label = (text) => p([run(text, { bold: true, color: NAVY })], { spacing: { before: 120, after: 40 } });
const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text, width, { header = false, fill, bold = false, align } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    shading: header ? { fill: NAVY, type: ShadingType.CLEAR, color: 'auto' } : fill ? { fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    children: [new Paragraph({ alignment: align, children: [run(text, { bold: header || bold, color: header ? 'FFFFFF' : undefined, size: 18 })] })],
  });
}

// columns: [{ label, width }]; rows: arrays of cell text. A loop row puts {{#each}} in its first cell and {{/each}} in its last.
function table(columns, rows, { headerFill = true, firstColFill = false } = {}) {
  const total = columns.reduce((a, c) => a + c.width, 0);
  const widths = columns.map((c) => Math.round((c.width / total) * FULL));
  return new Table({
    width: { size: FULL, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      ...(headerFill ? [new TableRow({ tableHeader: true, children: columns.map((c, i) => cell(c.label, widths[i], { header: true })) })] : []),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, widths[i], { fill: firstColFill && i === 0 ? GREY : undefined, bold: firstColFill && i === 0 })) })),
    ],
  });
}

const spacer = () => new Paragraph({ spacing: { after: 60 }, children: [] });

function header(extra = []) {
  return new Header({
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [run('{{upper report.classification}}', { bold: true, color: 'B42318', size: 18 })] }),
      new Paragraph({ children: [run('{{client.logo width="3cm"}}'), ...extra] }),
    ],
  });
}

function footer() {
  return new Footer({
    children: [
      new Paragraph({ alignment: AlignmentType.LEFT, border: { top: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 4 } }, children: [run('{{firm.name}} · {{engagement.code}} · Week ending {{date report.week_ending "d MMMM yyyy"}} · Version {{report.version}}', { size: 16, color: '4A5768' })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ size: 16, color: '4A5768', children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [run('{{upper report.classification}}', { bold: true, color: 'B42318', size: 18 })] }),
    ],
  });
}

const styles = {
  default: { document: { run: { font: 'Calibri', size: 21, color: '16212F' }, paragraph: { spacing: { line: 264, lineRule: LineRuleType.AUTO } } } },
  paragraphStyles: [
    { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 44, bold: true, color: NAVY } },
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 30, bold: true, color: NAVY }, paragraph: { spacing: { before: 320, after: 120 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL, space: 2 } } } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 25, bold: true, color: NAVY }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true } },
    { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 22, bold: true, color: '0B7D88' }, paragraph: { spacing: { before: 160, after: 60 }, keepNext: true } },
  ],
};

function doc(title, description, children, { headerExtra } = {}) {
  return new Document({
    creator: 'CTO Consulting', title, description, styles,
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134, header: 567, footer: 567 } } },
      headers: { default: header(headerExtra) }, footers: { default: footer() }, children,
    }],
  });
}

const DIMENSION_ROWS = [
  ['Schedule', '{{rag status.schedule_rag}}', '{{status.schedule_commentary}}'],
  ['Budget', '{{rag status.budget_rag}}', '{{status.budget_commentary}}'],
  ['Scope', '{{rag status.scope_rag}}', '{{status.scope_commentary}}'],
  ['Risks and issues', '{{rag status.risk_rag}}', '{{status.risk_commentary}}'],
  ['Resources', '{{rag status.resource_rag}}', '{{status.resource_commentary}}'],
  ['Quality', '{{rag status.quality_rag}}', '{{status.quality_commentary}}'],
];

// Sections shared by the project-level and per-project parts of engagement templates.
function projectSections({ internal = false } = {}) {
  return [
    label('Status by dimension'),
    table([{ label: 'Dimension', width: 22 }, { label: 'Rating', width: 13 }, { label: 'Commentary', width: 65 }], DIMENSION_ROWS, { firstColFill: true }),
    label('Executive summary'),
    p('{{rich status.executive_summary}}'),
    label('Achievements this period'),
    p('{{rich status.achievements}}'),
    label('Planned for next period'),
    p('{{rich status.next_period}}'),
    label('Milestones'),
    table([{ label: 'Milestone', width: 34 }, { label: 'Baseline', width: 14 }, { label: 'Forecast', width: 14 }, { label: 'Actual', width: 14 }, { label: 'Status', width: 24 }],
      [['{{#each milestones filter="key" sort="forecast_date"}}{{name}}', '{{date baseline_date "d MMM yy"}}', '{{date forecast_date "d MMM yy"}}', '{{date actual_date "d MMM yy"}}', '{{status}}{{/each}}']]),
    label('Deliverables in the next four weeks'),
    table([{ label: 'ID', width: 10 }, { label: 'Deliverable', width: 40 }, { label: 'Due', width: 15 }, { label: 'Status', width: 15 }, { label: 'Acceptance', width: 20 }],
      [['{{#each deliverables filter="lookahead" sort="due_date"}}{{id}}', '{{title}}', '{{date due_date "d MMM yy"}}', '{{status}}', '{{acceptance_status}}{{/each}}']]),
    label('Key risks'),
    table([{ label: 'ID', width: 8 }, { label: 'Risk', width: 36 }, { label: 'Rating', width: 12 }, { label: 'Owner', width: 16 }, { label: 'Response', width: 28 }],
      [['{{#each risks filter="reportable" sort="rating desc" limit=5}}{{id}}', '{{title}}', '{{rag rating}}', '{{owner}}', '{{response}}{{/each}}']]),
    label('Key issues'),
    table([{ label: 'ID', width: 8 }, { label: 'Issue', width: 42 }, { label: 'Severity', width: 14 }, { label: 'Owner', width: 18 }, { label: 'Target date', width: 18 }],
      [['{{#each issues filter="reportable" sort="severity desc" limit=5}}{{id}}', '{{title}}', '{{rag severity}}', '{{owner}}', '{{date due_date "d MMM yy"}}{{/each}}']]),
    label('Change requests'),
    table([{ label: 'ID', width: 10 }, { label: 'Change', width: 40 }, { label: 'Status', width: 18 }, { label: 'Price impact', width: 16 }, { label: 'Days', width: 16 }],
      [['{{#each changes filter="open" sort="raised_date"}}{{id}}', '{{title}}', '{{status}}', '{{currency price_impact}}', '{{schedule_impact_days}}{{/each}}']]),
    label('Client actions and dependencies outstanding'),
    table([{ label: 'ID', width: 12 }, { label: 'Item', width: 48 }, { label: 'Owner', width: 20 }, { label: 'Due', width: 20 }],
      [['{{#each actions filter="client,open" sort="due_date"}}{{id}}', '{{title}}', '{{owner}}', '{{date due_date "d MMM yy"}}{{/each}}'],
        ['{{#each dependencies filter="client,open" sort="due_date"}}{{id}}', '{{title}}', '{{owner}}', '{{date due_date "d MMM yy"}}{{/each}}']]),
    label('Financial summary (as at {{date fin.as_at "d MMM yyyy"}})'),
    table([{ label: 'Measure', width: 50 }, { label: 'Value', width: 50 }], [
      ['Contract value', '{{currency fin.contract_value}}'],
      ['Invoiced to date', '{{currency fin.invoiced_to_date}}'],
      ['Remaining value', '{{currency fin.remaining_value}}'],
      ['Forecast fees at completion', '{{currency fin.forecast_fees_at_completion}}'],
      ...(internal ? [['Budget at completion (cost)', '{{currency fin.bac}}'], ['Actual cost', '{{currency fin.actual_cost}}'], ['Estimate at completion (cost)', '{{currency fin.eac}}'], ['Forecast margin', '{{percent fin.forecast_margin_pct 1}}'], ['Margin erosion against baseline', '{{percent fin.margin_erosion 1}}'], ['WIP', '{{currency fin.wip}}'], ['CPI / SPI', '{{number fin.cpi 2}} / {{number fin.spi 2}}']] : []),
    ], { firstColFill: true }),
    p('{{#if exception.raised}}'),
    p([run('Tolerance exception: ', { bold: true, color: 'B42318' })]),
    p('{{rich exception.summary}}'),
    p('{{/if}}'),
  ];
}

// 1. Weekly engagement status report — client audience (section 8.9 structure).
function engagementReport({ internal }) {
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [run(internal ? 'Weekly engagement report (internal)' : 'Weekly status report')] }),
    p([run('{{engagement.name}}', { bold: true, size: 30, color: TEAL })]),
    p('{{client.name}} · Week ending {{date report.week_ending "d MMMM yyyy"}} · Version {{report.version}} · Prepared by {{report.prepared_by}}'),
    p([run('Figures as at {{date report.financials_as_at "d MMMM yyyy"}}; snapshot taken {{report.as_at}}.', { italics: true, color: '4A5768', size: 18 })]),
    h1('1. Engagement summary'),
    table([{ label: 'Overall status', width: 30 }, { label: 'Rating', width: 20 }, { label: 'Movement since last report', width: 50 }], [['Engagement health', '{{rag engagement.overall_rag}}', '{{engagement.rag_trend}}']], { firstColFill: true }),
    label('Key messages'),
    p('{{rich engagement.key_messages}}'),
    label('Decisions required from you'),
    p('{{rich engagement.decisions_required}}'),
    label('Escalations'),
    p('{{rich engagement.escalations}}'),
    h1('2. Project summary'),
    table([{ label: 'Project', width: 18 }, { label: 'Manager', width: 12 }, { label: 'Overall', width: 9 }, { label: 'Trend', width: 9 }, { label: 'Schedule', width: 9 }, { label: 'Budget', width: 9 }, { label: 'Scope', width: 8 }, { label: 'Risk', width: 8 }, { label: '% done', width: 7 }, { label: 'Next milestone', width: 21 }],
      [['{{#each engagement.projects}}{{project.name}}', '{{project.manager}}', '{{rag status.overall_rag}}', '{{status.overall_trend}}', '{{rag status.schedule_rag}}', '{{rag status.budget_rag}}', '{{rag status.scope_rag}}', '{{rag status.risk_rag}}', '{{percent project.percent_complete 0}}', '{{project.next_milestone}} ({{date project.next_milestone_date "d MMM"}}){{/each}}']]),
    h1('3. Project reports'),
    p('{{#each engagement.projects}}'),
    h2('{{project.name}}'),
    p([run('{{project.code}} · Manager {{project.manager}} · Stage {{project.stage}} · Forecast end {{date project.end_forecast "d MMM yyyy"}}', { color: '4A5768', size: 18 })]),
    ...projectSections({ internal }),
    p('{{/each}}'),
    h1('4. Engagement RAID and cross-project dependencies'),
    table([{ label: 'ID', width: 10 }, { label: 'Risk', width: 44 }, { label: 'Rating', width: 14 }, { label: 'Owner', width: 16 }, { label: 'Trend', width: 16 }],
      [['{{#each risks filter="reportable" sort="rating desc" limit=8}}{{id}}', '{{title}} ({{project}})', '{{rag rating}}', '{{owner}}', '{{trend}}{{/each}}']]),
    spacer(),
    table([{ label: 'ID', width: 10 }, { label: 'Dependency', width: 44 }, { label: 'Provider', width: 18 }, { label: 'Need by', width: 14 }, { label: 'Status', width: 14 }],
      [['{{#each dependencies filter="open" sort="due_date"}}{{id}}', '{{title}} ({{project}})', '{{provider}}', '{{date due_date "d MMM yy"}}', '{{status}}{{/each}}']]),
    h1('5. Consolidated engagement financials'),
    table([{ label: 'Measure', width: 50 }, { label: 'Value', width: 50 }], [
      ['Total contract value (including approved variations)', '{{currency fin.contract_value}}'],
      ['Invoiced to date', '{{currency fin.invoiced_to_date}}'],
      ['Remaining contract value', '{{currency fin.remaining_value}}'],
      ['Purchase order value', '{{currency fin.po_value}}'],
      ['PO consumed', '{{percent fin.po_consumed_pct 1}}'],
      ['PO funds remaining', '{{currency fin.po_remaining}}'],
      ['Forecast PO exhaustion', '{{date fin.po_exhaustion_date "d MMMM yyyy"}}'],
      ['Forecast fees at completion', '{{currency fin.forecast_fees_at_completion}}'],
      ...(internal ? [['Budget at completion (cost)', '{{currency fin.bac}}'], ['Estimate at completion (cost)', '{{currency fin.eac}}'], ['Variance at completion', '{{currency fin.vac}}'], ['Forecast margin', '{{percent fin.forecast_margin_pct 1}}'], ['Work in progress', '{{currency fin.wip}}'], ['Realisation', '{{percent fin.realisation 1}}'], ['EAC movement since last report', '{{currency changes_since_last.forecast_movement}}']] : []),
    ], { firstColFill: true }),
    p('{{#if fin.po_exhaustion_before_end}}'),
    p([run('Funding alert: ', { bold: true, color: 'B42318' }), run('the purchase order is forecast to run out on {{date fin.po_exhaustion_date "d MMMM yyyy"}}, before the planned end of the engagement.')]),
    p('{{/if}}'),
    p('{{chart "budget_burn" width="16cm"}}'),
    h1('6. Changes since the last report'),
    table([{ label: 'Project', width: 34 }, { label: 'Dimension', width: 22 }, { label: 'From', width: 14 }, { label: 'To', width: 14 }, { label: 'Movement', width: 16 }],
      [['{{#each changes_since_last.rag_movements filter="changed"}}{{project}}', '{{dimension}}', '{{rag from}}', '{{rag to}}', '{{direction}}{{/each}}']]),
    spacer(),
    table([{ label: 'Project', width: 30 }, { label: 'Milestone', width: 34 }, { label: 'Was', width: 12 }, { label: 'Now', width: 12 }, { label: 'Days', width: 12 }],
      [['{{#each changes_since_last.milestone_movements}}{{project}}', '{{name}}', '{{date from "d MMM"}}', '{{date to "d MMM"}}', '{{days}}{{/each}}']]),
    h1('7. Upcoming governance meetings and key dates'),
    table([{ label: 'Date', width: 20 }, { label: 'Meeting or key date', width: 60 }, { label: 'Type', width: 20 }], [['{{#each meetings filter="upcoming" limit=6}}{{date date "EEE d MMM yyyy"}}', '{{title}}', '{{kind}}{{/each}}']]),
    h1('Appendix: RAG trend, risk profile and definitions'),
    p('{{chart "rag_trend" width="16cm"}}'),
    p('{{chart "milestone_timeline" width="16cm"}}'),
    p('{{chart "risk_heatmap" width="11cm"}}'),
    table([{ label: 'Dimension', width: 16 }, { label: 'Green', width: 28 }, { label: 'Amber', width: 28 }, { label: 'Red', width: 28 }], [['{{#each rag_definitions}}{{dimension}}', '{{green}}', '{{amber}}', '{{red}}{{/each}}']], { firstColFill: true }),
  ];
  return doc(internal ? 'Weekly engagement report (internal)' : 'Weekly engagement status report', 'CEMS starter template', children);
}

// 2. Weekly project status report — client audience, project level.
function projectReport() {
  return doc('Weekly project status report', 'CEMS starter template', [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [run('Project status report')] }),
    p([run('{{project.name}}', { bold: true, size: 30, color: TEAL })]),
    p('{{client.name}} · {{engagement.name}} · Week ending {{date report.week_ending "d MMMM yyyy"}} · Version {{report.version}}'),
    table([{ label: 'Overall', width: 25 }, { label: 'Rating', width: 25 }, { label: 'Trend', width: 25 }, { label: '% complete', width: 25 }], [['{{project.stage}}', '{{rag status.overall_rag}}', '{{status.overall_trend}}', '{{percent project.percent_complete 0}}']]),
    p('{{rich status.overall_commentary}}'),
    ...projectSections({ internal: false }),
    h2('Budget burn and milestones'),
    p('{{chart "budget_burn" width="16cm"}}'),
    p('{{chart "milestone_timeline" width="16cm"}}'),
    h2('RAG trend'),
    p('{{chart "rag_trend" width="16cm"}}'),
  ]);
}

// 4. Change request and contract variation for signature (CHG-005).
function changeRequest() {
  return doc('Change request', 'CEMS starter template', [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [run('Change request and contract variation')] }),
    p([run('{{change.id}} — {{change.title}}', { bold: true, size: 28, color: TEAL })]),
    table([{ label: 'Item', width: 35 }, { label: 'Detail', width: 65 }], [
      ['Client', '{{client.name}}'], ['Engagement', '{{engagement.name}} ({{engagement.code}})'], ['Project', '{{project.name}}'], ['Change type', '{{change.type}}'],
      ['Requested by', '{{change.requester}}'], ['Date raised', '{{date change.raised_date "d MMMM yyyy"}}'], ['Status', '{{change.status}}'], ['Variation number', '{{change.variation_ref}}'],
    ], { headerFill: false, firstColFill: true }),
    h1('Description'), p('{{rich change.description}}'),
    h1('Reason'), p('{{rich change.reason}}'),
    h1('Impact on scope'), p('{{rich change.scope_impact}}'),
    h1('Price and schedule'),
    table([{ label: 'Role', width: 40 }, { label: 'Days', width: 20 }, { label: 'Day rate', width: 20 }, { label: 'Amount', width: 20 }], [['{{#each change.estimate}}{{role}}', '{{days}}', '{{currency rate}}', '{{currency amount}}{{/each}}']]),
    p([run('Total price impact: {{currency change.price_impact}} (excluding GST). Schedule impact: {{change.schedule_impact_days}} business days.', { bold: true })]),
    h1('Approval'),
    p('The parties agree to vary the statement of work as described above. All other terms are unchanged.'),
    table([{ label: 'For the client', width: 50 }, { label: 'For {{firm.name}}', width: 50 }], [['Name:', 'Name: {{engagement.executive}}'], ['Signature:', 'Signature:'], ['Date:', 'Date:']]),
  ]);
}

// 5. A client-supplied style template without CEMS tokens (RPT-026 mapping demonstration).
async function clientSupplied() {
  const d = new Document({
    creator: 'Department of Regional Services', title: 'DRS project status report', styles,
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run('OFFICIAL: Sensitive', { bold: true, color: 'B42318' })] })] }) },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [run('DRS Project Status Report')] }),
        p('Reporting week ending: [Week ending date]'),
        p('Vendor: [Supplier name]'),
        p([run('Program: '), new Bookmark({ id: 'ProgramName', children: [run('Program name')] })]),
        h1('Overall status'),
        p('CONTROL_OVERALL'),
        h1('Summary for the Department'),
        p('CONTROL_SUMMARY'),
        h1('Next steps'),
        p('[Next steps]'),
      ],
    }],
  });
  const buf = await Packer.toBuffer(d);
  // Wrap two placeholder paragraphs in Word content controls with tags.
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file('word/document.xml').async('string');
  const sdt = (tag, title, placeholder) => `<w:sdt><w:sdtPr><w:alias w:val="${title}"/><w:tag w:val="${tag}"/><w:showingPlcHdr/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>${placeholder}</w:t></w:r></w:p></w:sdtContent></w:sdt>`;
  xml = xml.replace(/<w:p>(?:(?!<w:p>).)*?CONTROL_OVERALL(?:(?!<w:p>).)*?<\/w:p>/s, sdt('OverallStatus', 'Overall status', 'Click to enter the overall status.'));
  xml = xml.replace(/<w:p>(?:(?!<w:p>).)*?CONTROL_SUMMARY(?:(?!<w:p>).)*?<\/w:p>/s, sdt('ExecSummary', 'Executive summary', 'Click to enter the summary.'));
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const outputs = [
  ['weekly-engagement-client.docx', engagementReport({ internal: false })],
  ['weekly-engagement-internal.docx', engagementReport({ internal: true })],
  ['weekly-project-client.docx', projectReport()],
  ['change-request.docx', changeRequest()],
];
for (const [name, d] of outputs) {
  fs.writeFileSync(path.join(OUT, name), await Packer.toBuffer(d));
  console.log(`Wrote ${name}`);
}
fs.writeFileSync(path.join(OUT, 'client-supplied-drs.docx'), await clientSupplied());
console.log('Wrote client-supplied-drs.docx');
