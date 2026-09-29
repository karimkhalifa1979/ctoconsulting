// Excel export and import. Toolkit tabs use the same headings and layout as the
// CTO Consulting Operating Model Assessment Toolkit (title rows 1–3, headings on row 5,
// data from row 6), so a completed toolkit workbook can be imported and an exported
// workbook can be re-imported. One column specification per sheet drives both directions.
import ExcelJS from 'exceljs';
import { blankEngagement, normalise, DIMENSIONS, DIM, DIM_BY_NAME, TK, engagementTitle, blankQuestion } from './model.js';
import {
  questionCalc, dimensionStats, overallStats, engagementApproach, daysOutstanding, capabilityCalc, processCalc, orgCalc, orgTargetCalc,
  decisionCheck, appCalc, supplierCalc, locationCalc, costRowTotal, costTotals, recCalc, riskScore, riskRating, sum,
} from './calc.js';
import { AI_QUESTIONS, AI_PILLARS, GUARDRAILS, ETHICS_PRINCIPLES } from '../data/aiReadiness.js';
import { CANVAS_ELEMENTS, CHANGE_AREAS, ADKAR } from '../data/tomLibrary.js';
import { useCaseCalc, pillarStats, aiOverall } from './aiCalc.js';
import { yearLabels, portfolioModel, initiativeModel } from './finance.js';
import { isNum, parseDate, isoDate } from './format.js';

const NAVY = 'FF0B1F3A', TEAL = 'FF0FA3B1', GREY = 'FFEEF3F8', TEAL_SOFT = 'FFE3F5F7';
const dimLabel = (code) => (DIM[code] ? DIM[code].name : code || '');
const dimCode = (v) => {
  const s = String(v || '').trim();
  if (DIM[s]) return s;
  if (DIM_BY_NAME[s]) return DIM_BY_NAME[s].code;
  const m = s.match(/^(D\d\d)\b/);
  return m ? m[1] : s;
};

// Column specs: [key, heading, width, options]. options.calc = derived value (export only),
// options.fmt = 'money' | 'pct' | 'date' | 'int', options.out / options.in = value transforms.
const SHEETS = (e) => {
  const s = e.settings;
  const supTotal = sum(e.suppliers.map((x) => x.spend));
  const costTotal = costTotals(e.costs).total;
  const tCostTotal = costTotals(e.targetCosts).total;
  return [
    {
      name: 'Stakeholders', key: 'stakeholders', title: 'Stakeholder Register & Interview Plan', idPrefix: 'S',
      cols: [['id', 'ID', 8], ['name', 'Name', 22], ['role', 'Role / title', 24], ['unit', 'Business unit', 20], ['group', 'Stakeholder group', 28], ['influence', 'Influence', 10], ['interest', 'Interest', 10],
        ['approach', 'Engagement approach', 16, { calc: (r) => engagementApproach(r.influence, r.interest) }], ['dims', 'Dimensions to cover', 16], ['date', 'Interview date', 13, { fmt: 'date' }], ['interviewer', 'Interviewer', 18], ['status', 'Status', 14], ['notes', 'Key themes / notes', 50]],
    },
    {
      name: 'Interview Guides', key: 'interviews', title: 'Interview Guides',
      cols: [['group', 'Stakeholder group', 28], ['n', '#', 5], ['question', 'Interview question', 70], ['dims', 'Dimensions', 14], ['probe', 'Probe / follow-up', 40], ['notes', 'Interview notes', 60]],
    },
    {
      name: 'Document Requests', key: 'documents', title: 'Document & Data Request List',
      cols: [['id', 'Ref', 8], ['document', 'Document / artefact', 50], ['dims', 'Dimension(s)', 14], ['priority', 'Priority', 10], ['owner', 'Likely owner', 22], ['requestedFrom', 'Requested from', 22], ['requested', 'Date requested', 13, { fmt: 'date' }], ['due', 'Date due', 13, { fmt: 'date' }], ['received', 'Date received', 13, { fmt: 'date' }], ['status', 'Status', 16], ['days', 'Days outstanding', 12, { calc: (d) => daysOutstanding(d) }], ['notes', 'Notes', 36]],
    },
    {
      name: 'Capabilities', key: 'capabilities', title: 'Business Capability Assessment',
      cols: [['id', 'ID', 7], ['tier', 'Tier', 11], ['l1', 'Level 1 capability', 28], ['l2', 'Level 2 capability', 30], ['description', 'Description', 44], ['importance', 'Strategic importance', 12], ['differentiation', 'Differentiation', 18], ['current', 'Current maturity (1–5)', 11, { fmt: 'int' }], ['target', 'Target maturity (1–5)', 11, { fmt: 'int' }],
        ['gap', 'Gap', 7, { calc: (c) => capabilityCalc(c).gap }], ['priority', 'Priority score', 9, { calc: (c) => capabilityCalc(c).priority }], ['owner', 'Capability owner', 22], ['systems', 'Key supporting systems', 24], ['sourcing', 'Sourcing model', 15], ['notes', 'Observations', 40],
        ['targetSourcing', 'Target sourcing', 15], ['changeType', 'Change type', 12], ['horizon', 'Horizon', 13]],
    },
    {
      name: 'Processes', key: 'processes', title: 'Value Stream & Process Inventory',
      cols: [['id', 'ID', 7], ['valueStream', 'Value stream', 22], ['l1', 'Level 1 process', 32], ['l2', 'Level 2 process / sub-process', 28], ['owner', 'Process owner', 22], ['units', 'Business units involved', 24], ['documented', 'Documented?', 11], ['standardised', 'Standardised across units?', 12], ['automation', 'Automation level', 18], ['systems', 'Key systems', 22],
        ['volume', 'Monthly volume', 11], ['cycleTime', 'Average cycle time (days)', 11], ['fte', 'FTE effort', 9], ['ftePer1000', 'FTE per 1,000 transactions', 11, { calc: (p) => processCalc(p).ftePer1000 }], ['handoffs', 'Hand-offs (#)', 9], ['painPoints', 'Pain points', 36], ['maturity', 'Maturity (1–5)', 9], ['opportunity', 'Improvement opportunity', 36], ['priority', 'Priority', 10],
        ['targetAutomation', 'Target automation level', 18], ['targetCycleTime', 'Target cycle time (days)', 11], ['targetFte', 'Target FTE effort', 10]],
    },
    {
      name: 'Org Structure', key: 'orgUnits', title: 'Organisation Structure: Spans, Layers & Workforce Mix',
      cols: [['id', 'ID', 7], ['name', 'Business unit / function', 28], ['head', 'Head of unit', 24], ['nature', 'Nature of work', 24], ['perm', 'Permanent FTE', 10], ['fixed', 'Fixed-term FTE', 10], ['contractor', 'Contractor FTE', 10], ['outsourced', 'Outsourced FTE', 10],
        ['total', 'Total FTE', 9, { calc: (u) => orgCalc(u, e).total }], ['cpct', 'Contractor & outsourced %', 11, { calc: (u) => orgCalc(u, e).contractorPct, fmt: 'pct' }], ['managers', 'People managers (#)', 10], ['layers', 'Management layers (CEO = 1)', 11],
        ['span', 'Average span of control', 10, { calc: (u) => orgCalc(u, e).span }], ['range', 'Target span', 9, { calc: (u) => orgCalc(u, e).range?.label || '' }], ['spanA', 'Span assessment', 14, { calc: (u) => orgCalc(u, e).spanAssessment }], ['layersA', 'Layers assessment', 16, { calc: (u) => orgCalc(u, e).layersAssessment }],
        ['cost', 'Annual employee cost ($)', 15, { fmt: 'money' }], ['cpf', 'Cost per employee FTE ($)', 13, { calc: (u) => orgCalc(u, e).costPerFte, fmt: 'money' }], ['vacancies', 'Vacancies (#)', 9], ['notes', 'Observations', 40],
        ['tAction', 'Target action', 13], ['tPerm', 'Target permanent FTE', 10], ['tFixed', 'Target fixed-term FTE', 10], ['tContractor', 'Target contractor FTE', 10], ['tOutsourced', 'Target outsourced FTE', 10], ['tManagers', 'Target people managers (#)', 10], ['tLayers', 'Target management layers', 10],
        ['tSpan', 'Target average span', 10, { calc: (u) => orgTargetCalc(u, e).span }], ['tCost', 'Target annual employee cost ($)', 15, { fmt: 'money' }], ['tNotes', 'Target notes', 36]],
    },
    {
      name: 'Applications', key: 'applications', title: 'Application Portfolio',
      cols: [['id', 'ID', 8], ['name', 'Application name', 28], ['description', 'Description / purpose', 36], ['capabilities', 'Capabilities supported', 30], ['businessOwner', 'Business owner', 20], ['technicalOwner', 'Technical owner', 20], ['vendor', 'Vendor / product (version)', 24], ['hosting', 'Hosting model', 18], ['users', 'Users (#)', 9], ['criticality', 'Business criticality', 12],
        ['cost', 'Annual cost ($)', 13, { fmt: 'money' }], ['supportEnd', 'Support / contract end', 13, { fmt: 'date' }], ['supportStatus', 'Support status', 15], ['businessFit', 'Business fit (1–5)', 9], ['technicalFit', 'Technical fit (1–5)', 9], ['time', 'TIME classification', 12, { calc: (a) => appCalc(a, s).time }], ['days', 'Days to support end', 10, { calc: (a) => appCalc(a, s).days }],
        ['classification', 'Data classification', 14], ['interfaces', 'Interfaces (#)', 9], ['overlap', 'Overlap / duplication', 30], ['notes', 'Observations', 36], ['disposition', 'Target disposition', 14], ['targetCost', 'Target annual cost ($)', 13, { fmt: 'money' }]],
    },
    {
      name: 'Suppliers', key: 'suppliers', title: 'Supplier & Sourcing Register',
      cols: [['id', 'ID', 9], ['name', 'Supplier', 28], ['services', 'Services provided', 36], ['supports', 'Capability / process supported', 28], ['segment', 'Segment', 12], ['spend', 'Annual spend ($)', 13, { fmt: 'money' }], ['pct', '% of total spend', 9, { calc: (x) => supplierCalc(x, supTotal, s).pct, fmt: 'pct' }],
        ['start', 'Contract start', 13, { fmt: 'date' }], ['end', 'Contract end', 13, { fmt: 'date' }], ['days', 'Days to expiry', 9, { calc: (x) => supplierCalc(x, supTotal, s).days }], ['renewal', 'Renewal flag', 12, { calc: (x) => supplierCalc(x, supTotal, s).renewal }],
        ['material', 'Material service provider?', 11], ['singleSource', 'Single source?', 9], ['exitPlan', 'Exit plan in place?', 10], ['dependency', 'Dependency risk', 11, { calc: (x) => supplierCalc(x, supTotal, s).dependency }], ['performance', 'Performance rating (1–5)', 10], ['assurance', 'Security assurance', 22], ['owner', 'Contract owner', 22], ['notes', 'Observations', 36],
        ['targetAction', 'Target action', 13], ['targetSpend', 'Target annual spend ($)', 13, { fmt: 'money' }]],
    },
    {
      name: 'Locations', key: 'locations', title: 'Locations & Property Register',
      cols: [['id', 'ID', 7], ['name', 'Site name', 26], ['city', 'City / state', 18], ['type', 'Site type', 16], ['functions', 'Functions performed', 32], ['fte', 'FTE based at site', 10], ['capacity', 'Workstations / capacity', 11], ['utilisation', 'Average utilisation (%)', 11, { fmt: 'pct' }], ['tenure', 'Tenure', 14], ['leaseExpiry', 'Lease expiry', 13, { fmt: 'date' }],
        ['days', 'Days to lease expiry', 10, { calc: (l) => locationCalc(l, s).days }], ['cost', 'Annual property cost ($)', 14, { fmt: 'money' }], ['cpf', 'Cost per FTE ($)', 12, { calc: (l) => locationCalc(l, s).costPerFte, fmt: 'money' }], ['cpw', 'Cost per workstation ($)', 12, { calc: (l) => locationCalc(l, s).costPerWs, fmt: 'money' }],
        ['critical', 'Critical site?', 9], ['bcp', 'Alternate / BCP site', 26], ['notes', 'Observations', 36], ['targetAction', 'Target action', 13], ['targetFte', 'Target FTE', 10], ['targetCost', 'Target annual property cost ($)', 14, { fmt: 'money' }]],
    },
    {
      name: 'Cost Baseline', key: 'costs', title: 'Cost Baseline',
      cols: [['id', 'ID', 7], ['unit', 'Business unit / function', 28], ['employee', 'Employee costs ($)', 14, { fmt: 'money' }], ['contractor', 'Contractor costs ($)', 14, { fmt: 'money' }], ['technology', 'Technology costs ($)', 14, { fmt: 'money' }], ['property', 'Property costs ($)', 14, { fmt: 'money' }], ['outsourced', 'Outsourced / third-party ($)', 14, { fmt: 'money' }], ['other', 'Other operating ($)', 14, { fmt: 'money' }],
        ['total', 'Total cost ($)', 14, { calc: (c) => costRowTotal(c), fmt: 'money' }], ['pct', '% of total', 9, { calc: (c) => (costTotal ? (costRowTotal(c) || 0) / costTotal : null), fmt: 'pct' }], ['fte', 'FTE', 8], ['cpf', 'Cost per FTE ($)', 12, { calc: (c) => (isNum(c.fte) && Number(c.fte) ? (costRowTotal(c) || 0) / Number(c.fte) : null), fmt: 'money' }],
        ['change', 'Of which change / project spend ($)', 14, { fmt: 'money' }], ['changePct', 'Change spend %', 9, { calc: (c) => (isNum(c.change) && costRowTotal(c) ? c.change / costRowTotal(c) : null), fmt: 'pct' }], ['notes', 'Observations', 36]],
    },
    {
      name: 'Target Cost Model', key: 'targetCosts', title: 'Target Cost Model (steady-state run cost of the target operating model)',
      cols: [['id', 'ID', 7], ['unit', 'Business unit / function', 28], ['employee', 'Employee costs ($)', 14, { fmt: 'money' }], ['contractor', 'Contractor costs ($)', 14, { fmt: 'money' }], ['technology', 'Technology costs ($)', 14, { fmt: 'money' }], ['property', 'Property costs ($)', 14, { fmt: 'money' }], ['outsourced', 'Outsourced / third-party ($)', 14, { fmt: 'money' }], ['other', 'Other operating ($)', 14, { fmt: 'money' }],
        ['total', 'Total cost ($)', 14, { calc: (c) => costRowTotal(c), fmt: 'money' }], ['pct', '% of total', 9, { calc: (c) => (tCostTotal ? (costRowTotal(c) || 0) / tCostTotal : null), fmt: 'pct' }], ['fte', 'FTE', 8], ['notes', 'Observations', 36]],
    },
    {
      name: 'Findings', key: 'findings', title: 'Findings Log',
      cols: [['id', 'ID', 7], ['date', 'Date raised', 12, { fmt: 'date' }], ['dim', 'Dimension', 30, { out: dimLabel, in: dimCode }], ['sub', 'Sub-component', 22], ['finding', 'Finding / observation', 50], ['evidence', 'Evidence source(s)', 30], ['rootCause', 'Root cause', 32], ['impact', 'Business impact', 32], ['severity', 'Severity', 10], ['questions', 'Linked question ID(s)', 14], ['validated', 'Stakeholder validated?', 11], ['owner', 'Finding owner', 18], ['recs', 'Linked recommendation(s)', 14], ['status', 'Status', 11]],
    },
    {
      name: 'Recommendations', key: 'recommendations', title: 'Recommendations & Roadmap',
      cols: [['id', 'ID', 7], ['dim', 'Dimension', 30, { out: dimLabel, in: dimCode }], ['recommendation', 'Recommendation', 56], ['findings', 'Linked finding(s)', 14], ['benefits', 'Expected benefits', 36], ['value', 'Value (1–5)', 8], ['ease', 'Ease (1–5)', 8], ['priority', 'Priority score', 9, { calc: (r) => recCalc(r, s).priority }], ['category', 'Category', 17, { calc: (r) => recCalc(r, s).category }], ['horizon', 'Horizon', 13], ['cost', 'Indicative cost ($)', 14, { fmt: 'money' }], ['owner', 'Accountable owner', 20], ['dependencies', 'Dependencies', 30], ['risks', 'Key risks', 30], ['status', 'Status', 12]],
    },
    {
      name: 'AI Use Cases', key: ['ai', 'useCases'], title: 'AI Use-Case Register',
      cols: [['id', 'ID', 7], ['name', 'Use case', 30], ['area', 'Business area', 20], ['description', 'Description', 44], ['aiType', 'AI type', 26], ['value', 'Value (1–5)', 8], ['feasibility', 'Feasibility (1–5)', 9], ['priority', 'Priority score', 9, { calc: (u) => useCaseCalc(u).priority }], ['quadrant', 'Recommendation', 16, { calc: (u) => useCaseCalc(u).quadrant }], ['riskTier', 'Risk tier', 10], ['dataReadiness', 'Data readiness', 14], ['benefit', 'Estimated annual benefit ($)', 14, { fmt: 'money' }], ['cost', 'Estimated cost ($)', 14, { fmt: 'money' }], ['status', 'Status', 12], ['owner', 'Owner', 20], ['notes', 'Notes', 36]],
    },
    {
      name: 'TOM Options', key: ['tom', 'options'], title: 'Target Operating Model Design Options',
      cols: [['id', 'ID', 7], ['name', 'Option', 36], ['description', 'Description', 56], ['oneOff', 'One-off investment ($)', 15, { fmt: 'money' }], ['runCost', 'Annual run cost ($)', 15, { fmt: 'money' }], ['fte', 'FTE', 8], ['duration', 'Implementation duration (months)', 12], ['risk', 'Delivery risk', 11], ['notes', 'Notes', 40],
        ...e.tom.criteria.map((c) => [`score_${c.id}`, `Score: ${c.name} (${c.weight}%)`, 12, { calc: (o) => o.scores?.[c.id] ?? '' }])],
    },
    {
      name: 'Initiatives', key: 'initiatives', title: 'Initiatives & Solution Components',
      cols: [['id', 'ID', 7], ['name', 'Initiative / solution component', 36], ['type', 'Type', 18], ['dims', 'Dimensions', 14], ['recs', 'Linked recommendations', 16], ['description', 'Description', 50], ['owner', 'Owner', 22], ['start', 'Start', 12, { fmt: 'date' }], ['end', 'End', 12, { fmt: 'date' }], ['status', 'Status', 12], ['rag', 'RAG', 8],
        ['tc', 'Total cost ($)', 14, { calc: (i) => initiativeModel(e, i.id).totalCost, fmt: 'money' }], ['tb', 'Total benefit ($)', 14, { calc: (i) => initiativeModel(e, i.id).totalBenefit, fmt: 'money' }], ['npv', 'NPV ($)', 14, { calc: (i) => initiativeModel(e, i.id).npv, fmt: 'money' }]],
    },
    {
      name: 'Risks', key: 'risks', title: 'Transition & Target-State Risk Register',
      cols: [['id', 'ID', 7], ['title', 'Risk', 44], ['category', 'Category', 18], ['stage', 'Stage', 12], ['dim', 'Dimension', 26, { out: dimLabel, in: dimCode }], ['cause', 'Cause', 32], ['consequence', 'Consequence', 32], ['likelihood', 'Likelihood (1–5)', 10], ['impact', 'Impact (1–5)', 9],
        ['score', 'Inherent score', 9, { calc: (r) => riskScore(r.likelihood, r.impact) }], ['rating', 'Inherent rating', 11, { calc: (r) => riskRating(riskScore(r.likelihood, r.impact)) }], ['mitigation', 'Mitigation', 44], ['residualLikelihood', 'Residual likelihood (1–5)', 10], ['residualImpact', 'Residual impact (1–5)', 10],
        ['rscore', 'Residual score', 9, { calc: (r) => riskScore(r.residualLikelihood, r.residualImpact) }], ['owner', 'Owner', 20], ['status', 'Status', 11], ['initiative', 'Initiative', 10]],
    },
    {
      name: 'Implementation Reqs', key: 'requirements', title: 'Implementation Requirements',
      cols: [['id', 'ID', 8], ['dim', 'Dimension', 26, { out: dimLabel, in: dimCode }], ['category', 'Category', 24], ['requirement', 'Requirement', 60], ['initiative', 'Initiative', 10], ['priority', 'Priority', 12], ['horizon', 'Horizon', 13], ['owner', 'Owner', 22], ['status', 'Status', 12], ['notes', 'Notes', 36]],
    },
    {
      name: 'Change Impact', key: 'changeImpacts', title: 'Change Impact Assessment (0 none – 3 high) and ADKAR Readiness (1–5)',
      cols: [['id', 'ID', 7], ['group', 'Stakeholder group', 34], ['headcount', 'Headcount', 10], ...CHANGE_AREAS.map((a) => [a.id, a.name, 12]), ...ADKAR.map((a) => [a.id, a.name, 11]), ['notes', 'Notes', 40]],
    },
    {
      name: 'Change Activities', key: 'changeActivities', title: 'Change Management Activities',
      cols: [['id', 'ID', 7], ['activity', 'Activity', 50], ['type', 'Type', 18], ['audience', 'Audience', 28], ['timing', 'Timing', 13], ['owner', 'Owner', 22], ['status', 'Status', 12]],
    },
  ];
};

const getRows = (e, key) => (Array.isArray(key) ? key.reduce((o, k) => o?.[k], e) : e[key]) || [];
const setRows = (e, key, rows) => {
  if (Array.isArray(key)) e[key[0]] = { ...e[key[0]], [key[1]]: rows };
  else e[key] = rows;
};

function styleHeader(row, target = []) {
  row.eachCell((c, i) => {
    const isTarget = target.includes(i);
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isTarget ? TEAL : NAVY } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 34;
}
function titleRows(ws, title, sub, e) {
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: NAVY } };
  ws.getCell('A2').value = sub || `${engagementTitle(e)} · exported ${isoDate(new Date())} from the CTO Consulting Operating Model Assessment Tool`;
  ws.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF4A5768' } };
  ws.getCell('A3').value = 'Navy headings = current state · teal headings = target state · calculated columns are values at export time';
  ws.getCell('A3').font = { size: 9, color: { argb: 'FF7B8796' } };
}
function writeCell(cell, v, fmt) {
  if (v === '' || v === null || v === undefined) return;
  if (fmt === 'date') {
    const d = parseDate(v);
    cell.value = d || v;
    if (d) cell.numFmt = 'd mmm yyyy';
    return;
  }
  cell.value = v;
  if (fmt === 'money' && isNum(v)) cell.numFmt = '#,##0';
  if (fmt === 'pct' && isNum(v)) cell.numFmt = '0.0%';
  if (typeof v === 'number' && !Number.isInteger(v) && !fmt) cell.numFmt = '0.00';
}

function addTable(wb, e, spec) {
  const ws = wb.addWorksheet(spec.name, { views: [{ state: 'frozen', ySplit: 5, xSplit: 2 }] });
  titleRows(ws, spec.title, null, e);
  ws.columns = spec.cols.map(([, , w]) => ({ width: w || 14 }));
  const head = ws.getRow(5);
  spec.cols.forEach(([, h], i) => { head.getCell(i + 1).value = h; });
  const targetIdx = spec.cols.map(([k, h], i) => (/^(Target|target)/.test(h) || k.startsWith('t') && /^t[A-Z]/.test(k) ? i + 1 : null)).filter(Boolean);
  styleHeader(head, targetIdx);
  const rows = getRows(e, spec.key);
  rows.forEach((r, k) => {
    const row = ws.getRow(6 + k);
    spec.cols.forEach(([key, , , o = {}], i) => {
      let v = o.calc ? o.calc(r) : r[key];
      if (o.out) v = o.out(v);
      writeCell(row.getCell(i + 1), v, o.fmt);
      if (o.calc) row.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } };
    });
    row.alignment = { vertical: 'top', wrapText: true };
  });
  return ws;
}

export async function exportWorkbook(e) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CTO Consulting Operating Model Assessment Tool';
  wb.created = new Date();
  const s = e.settings;

  // Cover
  const cover = wb.addWorksheet('Cover');
  cover.columns = [{ width: 4 }, { width: 28 }, { width: 90 }];
  cover.getCell('B2').value = 'Operating Model Assessment Toolkit';
  cover.getCell('B2').font = { bold: true, size: 20, color: { argb: NAVY } };
  cover.getCell('B3').value = 'CTO Consulting  |  Business Analysis Practice';
  cover.getCell('B3').font = { size: 12, color: { argb: TEAL } };
  cover.getCell('B4').value = `Client: ${e.details.client || '—'}   |   Status: ${e.details.status}   |   Version: ${e.details.version}`;
  cover.getCell('B6').value = 'Purpose';
  cover.getCell('B6').font = { bold: true };
  cover.getCell('C6').value = TK.cover.purpose;
  cover.getCell('C6').alignment = { wrapText: true, vertical: 'top' };
  cover.getRow(6).height = 90;
  cover.getCell('B8').value = 'Exported';
  cover.getCell('C8').value = new Date().toLocaleString('en-AU');
  cover.getCell('B9').value = 'Source';
  cover.getCell('C9').value = 'CTO Consulting Operating Model Assessment Tool (www.ctoconsulting.com.au). Re-import this workbook into the tool to continue working.';

  // Engagement
  const en = wb.addWorksheet('Engagement');
  en.columns = [{ width: 3 }, { width: 44 }, { width: 70 }, { width: 70 }, { width: 14 }];
  en.getCell('B1').value = 'Engagement Details';
  en.getCell('B1').font = { bold: true, size: 16, color: { argb: NAVY } };
  const det = [['Client organisation', e.details.client], ['Industry / sector', e.details.industry], ['Engagement name', e.details.name], ['Client sponsor', e.details.sponsor], ['CTO Consulting engagement lead', e.details.lead], ['Assessment team', e.details.team], ['Start date', parseDate(e.details.startDate) || ''], ['Target completion date', parseDate(e.details.endDate) || ''], ['Workbook version', e.details.version], ['Engagement status', e.details.status]];
  en.getCell('B4').value = 'Engagement details'; en.getCell('B4').font = { bold: true, color: { argb: TEAL } };
  det.forEach(([l, v], i) => { en.getCell(`B${5 + i}`).value = l; writeCell(en.getCell(`C${5 + i}`), v, v instanceof Date ? 'date' : undefined); });
  en.getCell('B16').value = 'Engagement objectives'; en.getCell('B16').font = { bold: true, color: { argb: TEAL } };
  for (let i = 0; i < 5; i++) { en.getCell(`B${17 + i}`).value = `Objective ${i + 1}`; en.getCell(`C${17 + i}`).value = e.objectives[i] || ''; }
  en.getCell('B23').value = 'Scope'; en.getCell('B23').font = { bold: true, color: { argb: TEAL } };
  [['In-scope business units / functions', e.scope.units], ['In-scope locations / geographies', e.scope.locations], ['Dimensions in scope', e.scope.dimensions], ['Out of scope', e.scope.outOfScope], ['Key constraints and assumptions', e.scope.constraints]].forEach(([l, v], i) => { en.getCell(`B${24 + i}`).value = l; en.getCell(`C${24 + i}`).value = v || ''; });
  en.getCell('B30').value = 'Key hypotheses to test'; en.getCell('B30').font = { bold: true, color: { argb: TEAL } };
  for (let i = 0; i < 5; i++) { en.getCell(`B${31 + i}`).value = `Hypothesis ${i + 1}`; en.getCell(`C${31 + i}`).value = e.hypotheses[i] || ''; }
  en.getCell('B37').value = 'Assessment settings'; en.getCell('B37').font = { bold: true, color: { argb: TEAL } };
  const sh = en.getRow(38); ['', 'Setting', 'Value', 'How it is used'].forEach((v, i) => { if (i) sh.getCell(i + 1).value = v; });
  ['defaultTarget', 'ragRed', 'ragAmber', 'priorityThreshold', 'maxLayers', 'expiryWarningDays', 'timeFitThreshold'].forEach((k, i) => {
    en.getCell(`B${39 + i}`).value = TK.settingsHelp[i].label; en.getCell(`C${39 + i}`).value = s[k]; en.getCell(`D${39 + i}`).value = TK.settingsHelp[i].help;
  });
  en.getCell('B47').value = 'Operating model design principles (agreed with the client)'; en.getCell('B47').font = { bold: true, color: { argb: TEAL } };
  const ph = en.getRow(48); ['Principle', 'Rationale', 'Implications for operating model design', 'Status'].forEach((v, i) => { ph.getCell(i + 2).value = v; });
  styleHeader(ph);
  e.principles.forEach((p, i) => { const r = en.getRow(49 + i); r.getCell(2).value = p.principle; r.getCell(3).value = p.rationale; r.getCell(4).value = p.implications; r.getCell(5).value = p.status; r.alignment = { wrapText: true, vertical: 'top' }; });
  for (let r = 5; r <= 46; r++) en.getCell(`C${r}`).alignment = { wrapText: true, vertical: 'top' };

  const specs = SHEETS(e);
  const bySheet = Object.fromEntries(specs.map((x) => [x.name, x]));
  addTable(wb, e, bySheet.Stakeholders);
  addTable(wb, e, bySheet['Interview Guides']);
  addTable(wb, e, bySheet['Document Requests']);

  // Assessment with dimension header rows, as in the toolkit
  const as = wb.addWorksheet('Assessment', { views: [{ state: 'frozen', ySplit: 5, xSplit: 1 }] });
  titleRows(as, 'Operating Model Maturity Assessment', null, e);
  const aCols = [['ID', 9], ['Dimension', 26], ['Sub-component', 22], ['Assessment question', 56], ['What good looks like', 50], ['Importance (1–3)', 10], ['Current maturity (1–5 / N/A)', 11], ['Target maturity (1–5)', 10], ['Gap', 7], ['Weighted gap', 9], ['RAG', 8], ['Evidence confidence', 11], ['Evidence reviewed / source', 32], ['Observations & findings', 50], ['Linked finding ID(s)', 14], ['Evidence to request', 36], ['Key stakeholders', 26]];
  as.columns = aCols.map(([, w]) => ({ width: w }));
  aCols.forEach(([h], i) => { as.getRow(5).getCell(i + 1).value = h; });
  styleHeader(as.getRow(5));
  let rr = 6;
  const RAGF = { Red: 'FFF6D5D5', Amber: 'FFFDEBD0', Green: 'FFD9F0E1' };
  for (const d of DIMENSIONS) {
    const hr = as.getRow(rr++);
    hr.getCell(1).value = `${d.code}  ${d.name}`;
    hr.getCell(4).value = d.definition;
    hr.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D3D69' } }; });
    for (const q of e.questions.filter((x) => x.dim === d.code)) {
      const c = questionCalc(q, s);
      const row = as.getRow(rr++);
      [q.id, d.name, q.sub, q.question, q.good, q.importance, q.current, q.target, c.gap, c.wgap, c.rag, q.confidence, q.evidence, q.observations, q.findingIds, q.evidenceToRequest, q.stakeholders].forEach((v, i) => writeCell(row.getCell(i + 1), v));
      if (c.rag) row.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RAGF[c.rag] } };
      row.alignment = { wrapText: true, vertical: 'top' };
    }
  }

  addTable(wb, e, bySheet.Capabilities);
  addTable(wb, e, bySheet.Processes);
  addTable(wb, e, bySheet['Org Structure']);

  // Decision rights: current and target RAPID
  for (const [name, view, days] of [['Decision Rights', 'current', 'days'], ['Decision Rights (Target)', 'target', 'targetDays']]) {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5, xSplit: 2 }] });
    titleRows(ws, view === 'current' ? 'Decision Rights Matrix (RAPID)' : 'Target Decision Rights Matrix (RAPID)', 'R = Recommend | A = Agree | P = Perform | I = Input | D = Decide (exactly one per decision)', e);
    const heads = ['ID', 'Key decision', ...e.rapidRoles, 'Decide roles (#)', 'Check', 'Documented in delegations?', view === 'current' ? 'Typical decision time (days)' : 'Target decision time (days)', 'Observations'];
    ws.columns = heads.map((h, i) => ({ width: i === 1 ? 44 : i === heads.length - 1 ? 40 : 11 }));
    heads.forEach((h, i) => { ws.getRow(5).getCell(i + 1).value = h; });
    styleHeader(ws.getRow(5), view === 'target' ? heads.map((_, i) => i + 1) : []);
    e.decisions.forEach((d, k) => {
      const chk = decisionCheck(d[view]);
      const vals = [d.id, d.decision, ...e.rapidRoles.map((r) => d[view]?.[r] || ''), chk.deciders ?? '', chk.check, d.documented, d[days], d.notes];
      vals.forEach((v, i) => writeCell(ws.getRow(6 + k).getCell(i + 1), v));
    });
  }

  addTable(wb, e, bySheet.Applications);
  addTable(wb, e, bySheet.Suppliers);
  addTable(wb, e, bySheet.Locations);
  addTable(wb, e, bySheet['Cost Baseline']);
  addTable(wb, e, bySheet['Target Cost Model']);
  addTable(wb, e, bySheet.Findings);

  // Dashboard (values)
  const db = wb.addWorksheet('Dashboard');
  titleRows(db, 'Operating Model Assessment Dashboard', `Client: ${e.details.client || '—'}   |   Status: ${e.details.status}   |   Version: ${e.details.version}`, e);
  const o = overallStats(e);
  const metrics = [['Overall current maturity (1–5)', o.current], ['Overall target maturity (assessed questions)', o.target], ['Average maturity gap', o.gap], ['Overall RAG', o.rag], ['Assessment questions scored', o.pctScored], ['Stakeholder interviews completed', `${o.interviewsDone} of ${o.interviewsTotal}`], ['Documents received', `${o.docsReceived} of ${o.docsTotal}`], ['Open critical and high findings', o.openCritHigh]];
  db.columns = [{ width: 8 }, { width: 44 }, { width: 22 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }];
  metrics.forEach(([l, v], i) => { db.getCell(`B${5 + i}`).value = l; writeCell(db.getCell(`C${5 + i}`), typeof v === 'number' ? +v.toFixed(2) : v, l.includes('scored') ? 'pct' : undefined); });
  const dh = db.getRow(15);
  ['Code', 'Dimension', 'Short name', 'Questions (#)', 'Scored (#)', '% complete', 'Avg current', 'Avg target', 'Avg gap', 'Priority index', 'RAG', 'Critical', 'High', 'Medium', 'Low', 'Recs (#)'].forEach((h, i) => { dh.getCell(i + 1).value = h; });
  styleHeader(dh);
  dimensionStats(e).forEach((d, k) => {
    const r = db.getRow(16 + k);
    [d.code, d.name, d.short, d.questions, d.scored, d.pct, d.current, d.target, d.gap, d.priority, d.rag, d.sev.Critical, d.sev.High, d.sev.Medium, d.sev.Low, d.recs].forEach((v, i) => writeCell(r.getCell(i + 1), typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(2) : v, i === 5 ? 'pct' : undefined));
  });

  // Current vs Target
  const cvt = wb.addWorksheet('Current vs Target', { views: [{ state: 'frozen', ySplit: 5 }] });
  titleRows(cvt, 'Current vs Target Operating Model', null, e);
  const cvtCols = [['Code', 7], ['Dimension', 30], ['Current maturity', 10], ['Target maturity', 10], ['Gap', 7], ['RAG', 8], ['Current state summary', 50], ['Target state description', 50], ['Key shifts (from → to)', 40], ['Design principles applied', 20], ['Key enablers & dependencies', 36], ['Linked recommendations', 18]];
  cvt.columns = cvtCols.map(([, w]) => ({ width: w }));
  cvtCols.forEach(([h], i) => { cvt.getRow(5).getCell(i + 1).value = h; });
  styleHeader(cvt.getRow(5), [4, 8, 9]);
  dimensionStats(e).forEach((d, k) => {
    const t = e.tom.dimensions[d.code] || {};
    const r = cvt.getRow(6 + k);
    [d.code, d.name, d.current && +d.current.toFixed(2), d.designTarget && +d.designTarget.toFixed(2), d.gap && +d.gap.toFixed(2), d.rag, t.currentSummary, t.targetDescription, t.shifts, t.principles, t.enablers, t.recs].forEach((v, i) => writeCell(r.getCell(i + 1), v));
    r.alignment = { wrapText: true, vertical: 'top' };
  });

  addTable(wb, e, bySheet.Recommendations);

  // AI readiness
  const ai = wb.addWorksheet('AI Readiness', { views: [{ state: 'frozen', ySplit: 5 }] });
  const ao = aiOverall(e);
  titleRows(ai, 'AI Readiness Assessment', `AI readiness index ${ao.index ?? '—'} / 100 (${ao.level?.name || 'not assessed'}) · target ${ao.targetIndex ?? '—'}`, e);
  const aiCols = [['ID', 11], ['Pillar', 26], ['Sub-component', 22], ['Question', 60], ['What good looks like', 50], ['Current (1–5)', 9], ['Target (1–5)', 9], ['Gap', 7], ['Evidence', 30], ['Notes', 36]];
  ai.columns = aiCols.map(([, w]) => ({ width: w }));
  aiCols.forEach(([h], i) => { ai.getRow(5).getCell(i + 1).value = h; });
  styleHeader(ai.getRow(5));
  AI_QUESTIONS.forEach((q, k) => {
    const r = e.ai.responses[q.id] || {};
    const row = ai.getRow(6 + k);
    const gap = isNum(r.current) && isNum(r.target) ? r.target - r.current : '';
    [q.id, AI_PILLARS.find((p) => p.id === q.pillar).name, q.sub, q.question, q.good, r.current, r.target, gap, r.evidence, r.notes].forEach((v, i) => writeCell(row.getCell(i + 1), v));
    row.alignment = { wrapText: true, vertical: 'top' };
  });
  const ps = wb.addWorksheet('AI Pillar Summary');
  titleRows(ps, 'AI Readiness by Pillar', null, e);
  ps.columns = [{ width: 10 }, { width: 34 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 18 }];
  ['Pillar', 'Name', 'Current', 'Target', 'Gap', 'Index', 'Level'].forEach((h, i) => { ps.getRow(5).getCell(i + 1).value = h; });
  styleHeader(ps.getRow(5));
  pillarStats(e).forEach((p, k) => [p.id, p.name, p.current && +p.current.toFixed(2), p.target && +p.target.toFixed(2), p.gap && +p.gap.toFixed(2), p.index, p.level?.name].forEach((v, i) => writeCell(ps.getRow(6 + k).getCell(i + 1), v)));
  addTable(wb, e, bySheet['AI Use Cases']);
  const gr = wb.addWorksheet('AI Guardrails');
  titleRows(gr, 'Responsible AI Guardrails & Ethics Principles', 'Voluntary AI Safety Standard guardrails and Australia\'s AI Ethics Principles', e);
  gr.columns = [{ width: 7 }, { width: 28 }, { width: 70 }, { width: 16 }, { width: 22 }, { width: 36 }, { width: 36 }];
  ['ID', 'Guardrail / principle', 'Description', 'Status', 'Owner', 'Evidence', 'Notes'].forEach((h, i) => { gr.getRow(5).getCell(i + 1).value = h; });
  styleHeader(gr.getRow(5));
  [...GUARDRAILS.map((g) => [g.id, g.title, g.text, e.ai.guardrails[g.id]?.status, e.ai.guardrails[g.id]?.owner, e.ai.guardrails[g.id]?.evidence, e.ai.guardrails[g.id]?.notes]),
    ...ETHICS_PRINCIPLES.map((p) => [p.id, p.title, p.text, e.ai.ethics[p.id]?.status, '', '', e.ai.ethics[p.id]?.notes])]
    .forEach((vals, k) => { vals.forEach((v, i) => writeCell(gr.getRow(6 + k).getCell(i + 1), v)); gr.getRow(6 + k).alignment = { wrapText: true, vertical: 'top' }; });

  // TOM canvas and options
  const tc = wb.addWorksheet('TOM Canvas');
  titleRows(tc, 'Target Operating Model Canvas', `Vision: ${e.tom.vision || '—'}`, e);
  tc.columns = [{ width: 16 }, { width: 30 }, { width: 60 }, { width: 60 }, { width: 40 }];
  ['Element', 'Name', 'Current state', 'Target state', 'Key shifts'].forEach((h, i) => { tc.getRow(5).getCell(i + 1).value = h; });
  styleHeader(tc.getRow(5), [4, 5]);
  CANVAS_ELEMENTS.forEach((c, k) => { const v = e.tom.canvas[c.id] || {}; [c.id, c.name, v.current, v.target, v.shifts].forEach((x, i) => writeCell(tc.getRow(6 + k).getCell(i + 1), x)); tc.getRow(6 + k).alignment = { wrapText: true, vertical: 'top' }; });
  tc.getCell('A15').value = 'Structural archetype'; tc.getCell('B15').value = e.tom.archetype || '';
  tc.getCell('A16').value = 'Rationale'; tc.getCell('B16').value = e.tom.archetypeRationale || '';
  addTable(wb, e, bySheet['TOM Options']);

  // Business case
  addTable(wb, e, bySheet.Initiatives);
  const labels = yearLabels(s);
  for (const [name, key, fields] of [
    ['Cost Lines', 'costLines', [['id', 'ID', 8], ['initiativeId', 'Initiative', 10], ['description', 'Cost item', 40], ['category', 'Capex / Opex', 11], ['costType', 'Cost type', 22], ['nature', 'One-off / recurring', 13]]],
    ['Benefit Lines', 'benefitLines', [['id', 'ID', 8], ['initiativeId', 'Initiative', 10], ['description', 'Benefit', 40], ['type', 'Benefit type', 22], ['class', 'Class', 14], ['kpi', 'Measure / KPI', 28], ['baseline', 'Baseline', 11], ['target', 'Target', 11], ['unit', 'Unit', 12], ['owner', 'Benefit owner', 20], ['confidence', 'Confidence (%)', 11], ['status', 'Status', 12]]],
  ]) {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5, xSplit: 3 }] });
    titleRows(ws, name === 'Cost Lines' ? 'Initiative Costs by Financial Year' : 'Initiative Benefits by Financial Year', `Financial years ${labels[0]}–${labels[labels.length - 1]} (AUD)`, e);
    const heads = [...fields.map((f) => f[1]), ...labels.map((l) => `Planned ${l}`), ...labels.map((l) => `Actual ${l}`)];
    ws.columns = [...fields.map((f) => ({ width: f[2] })), ...labels.map(() => ({ width: 13 })), ...labels.map(() => ({ width: 13 }))];
    heads.forEach((h, i) => { ws.getRow(5).getCell(i + 1).value = h; });
    styleHeader(ws.getRow(5), labels.map((_, i) => fields.length + labels.length + i + 1));
    e[key].forEach((l, k) => {
      const row = ws.getRow(6 + k);
      [...fields.map((f) => l[f[0]]), ...labels.map((_, i) => l.planned?.[i]), ...labels.map((_, i) => l.actual?.[i])].forEach((v, i) => writeCell(row.getCell(i + 1), v, i >= fields.length ? 'money' : undefined));
    });
  }
  const bc = wb.addWorksheet('Business Case Summary');
  const pm = portfolioModel(e);
  titleRows(bc, 'Business Case Summary', `Discount rate ${s.discountRate}% · benefits ${s.riskAdjustBenefits ? 'risk-adjusted' : 'unadjusted'} · non-cashable ${s.includeNonCashable ? 'included' : 'excluded'}`, e);
  bc.columns = [{ width: 30 }, ...labels.map(() => ({ width: 14 })), { width: 16 }];
  ['', ...labels, 'Total'].forEach((h, i) => { bc.getRow(5).getCell(i + 1).value = h; });
  styleHeader(bc.getRow(5));
  [['Costs', pm.cost], ['Benefits', pm.benefit], ['Net benefit', pm.net], ['Cumulative net', pm.cumulative]].forEach(([l, arr], k) => {
    const row = bc.getRow(6 + k);
    row.getCell(1).value = l;
    arr.forEach((v, i) => writeCell(row.getCell(i + 2), Math.round(v), 'money'));
    if (l !== 'Cumulative net') writeCell(row.getCell(labels.length + 2), Math.round(sum(arr)), 'money');
  });
  [['NPV', pm.npv, 'money'], ['ROI', pm.roi, 'pct'], ['Benefit–cost ratio', pm.bcr && +pm.bcr.toFixed(2)], ['Payback (years)', pm.payback === null ? 'Not within horizon' : +pm.payback.toFixed(1)], ['IRR', pm.irr, 'pct']].forEach(([l, v, f], k) => {
    bc.getCell(`A${12 + k}`).value = l; writeCell(bc.getCell(`B${12 + k}`), typeof v === 'number' && f === 'money' ? Math.round(v) : v, f);
  });

  addTable(wb, e, bySheet.Risks);
  addTable(wb, e, bySheet['Implementation Reqs']);
  addTable(wb, e, bySheet['Change Impact']);
  addTable(wb, e, bySheet['Change Activities']);

  // Lists
  const li = wb.addWorksheet('Lists');
  const listNames = Object.keys(e.lists);
  listNames.forEach((n, i) => {
    li.getColumn(i + 1).width = Math.min(34, Math.max(12, n.length + 2));
    li.getRow(1).getCell(i + 1).value = n;
    (e.lists[n] || []).forEach((v, k) => { li.getRow(2 + k).getCell(i + 1).value = v; });
  });
  styleHeader(li.getRow(1));

  // Full engagement data for lossless re-import (hidden).
  const data = wb.addWorksheet('_data');
  data.state = 'veryHidden';
  const json = JSON.stringify(e);
  for (let i = 0, k = 1; i < json.length; i += 30000, k++) data.getCell(`A${k}`).value = json.slice(i, i + 30000);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ------------------------------ Import ------------------------------ */

function cellVal(c) {
  let v = c?.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isoDate(new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  if (typeof v === 'object') {
    if ('result' in v) v = v.result;
    else if (v.richText) v = v.richText.map((t) => t.text).join('');
    else if (v.text) v = v.text;
    else if ('formula' in v || 'sharedFormula' in v) return '';
    if (v instanceof Date) return isoDate(new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
    if (v === null || v === undefined || typeof v === 'object') return '';
  }
  return typeof v === 'string' ? v.trim() : v;
}
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function headerMap(ws, row = 5) {
  const map = {};
  ws.getRow(row).eachCell((c, col) => { const h = norm(cellVal(c)); if (h) map[h] = col; });
  return map;
}

function readTable(ws, spec, existing = []) {
  const hm = headerMap(ws);
  const colOf = Object.fromEntries(spec.cols.map(([key, h]) => [key, hm[norm(h)]]));
  const idCol = colOf.id || colOf.group || 1;
  const contentKeys = spec.cols.filter(([k, , , o = {}]) => !o.calc && k !== 'id').map(([k]) => k);
  const out = [];
  for (let r = 6; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const idv = cellVal(row.getCell(idCol));
    if (String(idv).toLowerCase() === 'example') continue;
    if (/^total/i.test(String(cellVal(row.getCell(2))))) continue;
    const o = {};
    let has = false;
    for (const [key, , , opt = {}] of spec.cols) {
      if (opt.calc || !colOf[key]) continue;
      let v = cellVal(row.getCell(colOf[key]));
      if (opt.in) v = opt.in(v);
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && opt.fmt === 'date') v = v.slice(0, 10);
      o[key] = v;
      if (key !== 'id' && v !== '' && contentKeys.includes(key)) has = true;
    }
    if (!has) continue;
    const base = existing.find((x) => x.id && x.id === o.id) || {};
    out.push({ ...base, ...o });
  }
  return out;
}

export async function importWorkbook(arrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const has = (n) => !!wb.getWorksheet(n);
  if (!has('Assessment') && !has('_data')) throw new Error('This does not look like an Operating Model Assessment Toolkit workbook (no Assessment tab).');

  let e = blankEngagement();
  const dataWs = wb.getWorksheet('_data');
  if (dataWs) {
    let json = '';
    for (let r = 1; r <= dataWs.rowCount; r++) json += String(cellVal(dataWs.getCell(`A${r}`)) || '');
    try { e = normalise(JSON.parse(json)); } catch { /* fall back to visible sheets */ }
  }
  const imported = [];

  // Engagement tab
  const en = wb.getWorksheet('Engagement');
  if (en) {
    const g = (a) => cellVal(en.getCell(a));
    const keys = ['client', 'industry', 'name', 'sponsor', 'lead', 'team', 'startDate', 'endDate', 'version', 'status'];
    keys.forEach((k, i) => { const v = g(`C${5 + i}`); if (v !== '') e.details[k] = String(v); });
    e.objectives = [0, 1, 2, 3, 4].map((i) => String(g(`C${17 + i}`) || e.objectives[i] || ''));
    ['units', 'locations', 'dimensions', 'outOfScope', 'constraints'].forEach((k, i) => { const v = g(`C${24 + i}`); if (v !== '') e.scope[k] = String(v); });
    e.hypotheses = [0, 1, 2, 3, 4].map((i) => String(g(`C${31 + i}`) || e.hypotheses[i] || ''));
    ['defaultTarget', 'ragRed', 'ragAmber', 'priorityThreshold', 'maxLayers', 'expiryWarningDays', 'timeFitThreshold'].forEach((k, i) => { const v = g(`C${39 + i}`); if (isNum(v)) e.settings[k] = Number(v); });
    const pr = [];
    for (let r = 49; r <= Math.max(49, en.rowCount); r++) {
      const p = String(g(`B${r}`) || '');
      if (!p || /^example/i.test(p)) continue;
      pr.push({ id: `DP${String(pr.length + 1).padStart(2, '0')}`, principle: p, rationale: String(g(`C${r}`) || ''), implications: String(g(`D${r}`) || ''), status: String(g(`E${r}`) || 'Proposed') });
    }
    if (pr.length) e.principles = pr;
    imported.push('engagement');
  }

  const specs = SHEETS(e);
  for (const spec of specs) {
    const ws = wb.getWorksheet(spec.name);
    if (!ws) continue;
    const existing = getRows(e, spec.key);
    const rows = readTable(ws, spec, existing);
    if (spec.name === 'Interview Guides') {
      if (!rows.length) continue;
      const merged = rows.map((r, i) => ({ id: `IG${String(i + 1).padStart(3, '0')}`, notes: '', ...(existing.find((x) => x.group === r.group && String(x.n) === String(r.n)) || {}), ...r }));
      setRows(e, spec.key, merged);
    } else if (['Capabilities', 'Processes', 'Document Requests'].includes(spec.name)) {
      if (rows.length) setRows(e, spec.key, rows);
    } else if (spec.name === 'TOM Options') {
      setRows(e, spec.key, rows.map((r) => {
        const scores = {};
        const hm = headerMap(ws);
        const rowIdx = [...Array(ws.rowCount).keys()].map((k) => k + 6).find((k) => cellVal(ws.getRow(k).getCell(1)) === r.id);
        for (const c of e.tom.criteria) {
          const col = hm[norm(`Score: ${c.name} (${c.weight}%)`)];
          if (col && rowIdx) { const v = cellVal(ws.getRow(rowIdx).getCell(col)); if (isNum(v)) scores[c.id] = Number(v); }
        }
        return { ...r, scores: { ...(r.scores || {}), ...scores } };
      }));
    } else {
      setRows(e, spec.key, rows);
    }
    imported.push(spec.name);
  }

  // Assessment: rows whose ID looks like D01.01
  const as = wb.getWorksheet('Assessment');
  if (as) {
    const hm = headerMap(as);
    const col = (h) => hm[norm(h)];
    const qs = [];
    for (let r = 6; r <= as.rowCount; r++) {
      const row = as.getRow(r);
      const id = String(cellVal(row.getCell(1)));
      if (!/^D\d\d\.\d+$/.test(id)) continue;
      const dim = id.slice(0, 3);
      const tmpl = e.questions.find((x) => x.id === id) || TK.questions.find((x) => x.id === id);
      const q = { ...(tmpl ? blankQuestion(tmpl, e.settings) : blankQuestion({ id, dim, custom: true }, e.settings)), ...(e.questions.find((x) => x.id === id) || {}) };
      const read = (h) => (col(h) ? cellVal(row.getCell(col(h))) : undefined);
      const setIf = (k, h, f = (x) => x) => { const v = read(h); if (v !== undefined) q[k] = f(v); };
      setIf('sub', 'Sub-component'); setIf('question', 'Assessment question'); setIf('good', 'What good looks like');
      setIf('importance', 'Importance (1–3)', (v) => (isNum(v) ? Number(v) : v));
      setIf('current', 'Current maturity (1–5 / N/A)', (v) => (isNum(v) ? Number(v) : String(v).toUpperCase() === 'N/A' ? 'N/A' : ''));
      setIf('target', 'Target maturity (1–5)', (v) => (isNum(v) ? Number(v) : ''));
      setIf('confidence', 'Evidence confidence'); setIf('evidence', 'Evidence reviewed / source'); setIf('observations', 'Observations & findings');
      setIf('findingIds', 'Linked finding ID(s)'); setIf('evidenceToRequest', 'Evidence to request'); setIf('stakeholders', 'Key stakeholders');
      q.dim = dim;
      if (!tmpl) q.custom = true;
      qs.push(q);
    }
    if (qs.length) e.questions = qs;
    imported.push('Assessment');
  }

  // Decision rights (current and target)
  for (const [name, view, daysKey] of [['Decision Rights', 'current', 'days'], ['Decision Rights (Target)', 'target', 'targetDays']]) {
    const ws = wb.getWorksheet(name);
    if (!ws) continue;
    const heads = [];
    ws.getRow(5).eachCell((c, i) => { heads[i] = String(cellVal(c)); });
    const roleCols = [];
    for (let i = 3; i < heads.length; i++) if (heads[i] && !/decide roles|check|documented|decision time|observations/i.test(heads[i])) roleCols.push(i);
    if (view === 'current' && roleCols.length) e.rapidRoles = roleCols.map((i) => heads[i]);
    const find = (re) => heads.findIndex((h) => h && re.test(h));
    const decs = [];
    for (let r = 6; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const id = String(cellVal(row.getCell(1)));
      const decision = String(cellVal(row.getCell(2)));
      if (!id || id.toLowerCase() === 'example' || !decision) continue;
      const map = {};
      roleCols.forEach((i) => { const v = String(cellVal(row.getCell(i))).toUpperCase(); if ('RAPID'.includes(v) && v) map[heads[i]] = v; });
      const existing = e.decisions.find((d) => d.id === id) || { id, decision, current: {}, target: {}, documented: '', days: '', targetDays: '', notes: '' };
      const dIdx = find(/documented/i), tIdx = find(/decision time/i), oIdx = find(/observations/i);
      decs.push({ ...existing, decision, [view]: map, ...(dIdx > 0 ? { documented: String(cellVal(row.getCell(dIdx))) } : {}), ...(tIdx > 0 ? { [daysKey]: cellVal(row.getCell(tIdx)) } : {}), ...(oIdx > 0 ? { notes: String(cellVal(row.getCell(oIdx))) } : {}) });
    }
    if (decs.length) {
      e.decisions = view === 'current' ? decs : e.decisions.map((d) => decs.find((x) => x.id === d.id) ? { ...d, target: decs.find((x) => x.id === d.id).target, targetDays: decs.find((x) => x.id === d.id).targetDays } : d);
      imported.push(name);
    }
  }

  // Current vs Target → TOM target state by dimension
  const cvt = wb.getWorksheet('Current vs Target');
  if (cvt) {
    const hm = headerMap(cvt);
    for (let r = 6; r <= cvt.rowCount; r++) {
      const code = String(cellVal(cvt.getRow(r).getCell(1)));
      if (!DIM[code]) continue;
      const g = (h) => (hm[norm(h)] ? String(cellVal(cvt.getRow(r).getCell(hm[norm(h)]))) : undefined);
      const cur = e.tom.dimensions[code] || {};
      const next = { ...cur };
      [['currentSummary', 'Current state summary'], ['targetDescription', 'Target state description'], ['shifts', 'Key shifts (from → to)'], ['principles', 'Design principles applied'], ['enablers', 'Key enablers & dependencies'], ['recs', 'Linked recommendations']].forEach(([k, h]) => { const v = g(h); if (v !== undefined) next[k] = v; });
      e.tom.dimensions[code] = next;
    }
    imported.push('Current vs Target');
  }

  // AI readiness responses, guardrails and canvas from this tool's exports
  const ai = wb.getWorksheet('AI Readiness');
  if (ai) {
    for (let r = 6; r <= ai.rowCount; r++) {
      const row = ai.getRow(r);
      const id = String(cellVal(row.getCell(1)));
      if (!e.ai.responses[id]) continue;
      e.ai.responses[id] = { current: cellVal(row.getCell(6)), target: cellVal(row.getCell(7)), evidence: String(cellVal(row.getCell(9))), notes: String(cellVal(row.getCell(10))) };
    }
    imported.push('AI Readiness');
  }
  const gr = wb.getWorksheet('AI Guardrails');
  if (gr) {
    for (let r = 6; r <= gr.rowCount; r++) {
      const row = gr.getRow(r);
      const id = String(cellVal(row.getCell(1)));
      if (e.ai.guardrails[id]) e.ai.guardrails[id] = { status: String(cellVal(row.getCell(4))), owner: String(cellVal(row.getCell(5))), evidence: String(cellVal(row.getCell(6))), notes: String(cellVal(row.getCell(7))) };
      if (e.ai.ethics[id]) e.ai.ethics[id] = { status: String(cellVal(row.getCell(4))), notes: String(cellVal(row.getCell(7))) };
    }
  }
  const tc = wb.getWorksheet('TOM Canvas');
  if (tc) {
    for (let r = 6; r <= 12; r++) {
      const id = String(cellVal(tc.getRow(r).getCell(1)));
      if (e.tom.canvas[id]) e.tom.canvas[id] = { current: String(cellVal(tc.getRow(r).getCell(3))), target: String(cellVal(tc.getRow(r).getCell(4))), shifts: String(cellVal(tc.getRow(r).getCell(5))) };
    }
    const arch = String(cellVal(tc.getCell('B15')));
    if (arch) e.tom.archetype = arch;
    const rat = String(cellVal(tc.getCell('B16')));
    if (rat) e.tom.archetypeRationale = rat;
  }

  // Cost and benefit lines with year columns
  for (const [name, key, fields] of [
    ['Cost Lines', 'costLines', [['id', 'ID'], ['initiativeId', 'Initiative'], ['description', 'Cost item'], ['category', 'Capex / Opex'], ['costType', 'Cost type'], ['nature', 'One-off / recurring']]],
    ['Benefit Lines', 'benefitLines', [['id', 'ID'], ['initiativeId', 'Initiative'], ['description', 'Benefit'], ['type', 'Benefit type'], ['class', 'Class'], ['kpi', 'Measure / KPI'], ['baseline', 'Baseline'], ['target', 'Target'], ['unit', 'Unit'], ['owner', 'Benefit owner'], ['confidence', 'Confidence (%)'], ['status', 'Status']]],
  ]) {
    const ws = wb.getWorksheet(name);
    if (!ws) continue;
    const heads = [];
    ws.getRow(5).eachCell((c, i) => { heads[i] = String(cellVal(c)); });
    const pl = heads.map((h, i) => (h && /^Planned /.test(h) ? i : null)).filter(Boolean);
    const ac = heads.map((h, i) => (h && /^Actual /.test(h) ? i : null)).filter(Boolean);
    const lines = [];
    for (let r = 6; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const o = {};
      fields.forEach(([k, h]) => { const i = heads.findIndex((x) => x === h); if (i > 0) o[k] = cellVal(row.getCell(i)); });
      if (!o.description && !o.id) continue;
      o.planned = pl.map((i) => cellVal(row.getCell(i)));
      o.actual = ac.map((i) => cellVal(row.getCell(i)));
      lines.push(o);
    }
    e[key] = lines;
    imported.push(name);
  }

  e.kind = 'client';
  const summary = `${e.details.client || 'client'} — ${imported.length} tabs read, ${e.questions.filter((q) => q.current !== '').length} questions scored.`;
  return { engagement: normalise(e), summary };
}
