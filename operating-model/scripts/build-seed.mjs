// Extracts the reference content of the CTO Consulting Operating Model Assessment
// Toolkit workbook into src/data/toolkit.json, which the app uses as its template.
// Usage: npm run seed [path/to/workbook.xlsx]
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = process.argv[2] || path.join(root, 'data/source/CTO_Consulting_Operating_Model_Assessment_Toolkit.xlsx');
const out = path.join(root, 'src/data/toolkit.json');

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(src);

// Plain value of a cell: formulas give their cached result, rich text is flattened.
function val(ws, addr) {
  const v = ws.getCell(addr).value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ('result' in v) return v.result ?? '';
    if ('formula' in v || 'sharedFormula' in v) return '';
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text) return v.text;
  }
  return typeof v === 'string' ? v.trim() : v;
}
const sheet = (n) => {
  const ws = wb.getWorksheet(n);
  if (!ws) throw new Error(`Worksheet not found: ${n}`);
  return ws;
};
const splitList = (s) => String(s || '').split(';').map((x) => x.trim()).filter(Boolean);

// Rows from a header row onwards while the ID column is non-empty.
function rows(ws, first, last, cols, keep = (r) => true) {
  const res = [];
  for (let r = first; r <= last; r++) {
    const o = {};
    for (const [k, c] of Object.entries(cols)) o[k] = val(ws, `${c}${r}`);
    if (keep(o)) res.push(o);
  }
  return res;
}

// Cover
const cover = sheet('Cover');
const coverData = {
  title: val(cover, 'B2'),
  subtitle: val(cover, 'B3'),
  purpose: val(cover, 'B7'),
  steps: rows(cover, 10, 16, { step: 'B', text: 'C' }),
  workbookMap: rows(cover, 20, 39, { phase: 'B', tab: 'C', purpose: 'D' }, (o) => o.tab),
  ragNote: val(cover, 'B56'),
};
const maturityScale = rows(cover, 49, 54, { label: 'B', description: 'C' }).map((o, i) => ({
  level: i < 5 ? i + 1 : 'N/A',
  name: i < 5 ? o.label.replace(/^\d\s*–\s*/, '') : 'Not applicable',
  label: o.label,
  description: o.description,
}));

// Engagement
const eng = sheet('Engagement');
const settings = {
  defaultTarget: Number(val(eng, 'C39')) || 3,
  ragRed: Number(val(eng, 'C40')) || 1.5,
  ragAmber: Number(val(eng, 'C41')) || 0.75,
  priorityThreshold: Number(val(eng, 'C42')) || 3,
  maxLayers: Number(val(eng, 'C43')) || 6,
  expiryWarningDays: Number(val(eng, 'C44')) || 180,
  timeFitThreshold: Number(val(eng, 'C45')) || 3,
};
const settingsHelp = rows(eng, 39, 45, { label: 'B', help: 'D' });
const principleExample = { principle: val(eng, 'B49').replace(/^Example:\s*/, ''), rationale: val(eng, 'C49'), implications: val(eng, 'D49'), status: val(eng, 'E49') };

// Framework
const fw = sheet('Framework');
const dash = sheet('Dashboard');
const shortNames = {};
for (let r = 17; r <= 33; r++) shortNames[val(dash, `B${r}`)] = val(dash, `D${r}`);
const dimensions = rows(fw, 5, 21, {
  code: 'A', name: 'B', definition: 'C', subComponents: 'D', keyQuestion: 'E', canvas: 'F', sevenS: 'G', galbraith: 'H', togaf: 'I', standards: 'J',
}).map((d) => ({ ...d, short: shortNames[d.code] || d.name }));
const approach = rows(fw, 26, 30, { phase: 'A', activities: 'C', tabs: 'D', outputs: 'E' });
const frameworkIntro = val(fw, 'A2');

// Maturity model
const mm = sheet('Maturity Model');
const maturityModel = {};
for (let r = 5; r <= 22; r++) {
  maturityModel[val(mm, `A${r}`)] = ['C', 'D', 'E', 'F', 'G'].map((c) => val(mm, `${c}${r}`));
}

// Assessment questions
const as = sheet('Assessment');
const dimByName = Object.fromEntries(dimensions.map((d) => [d.name, d.code]));
const questions = rows(as, 7, 179, {
  id: 'A', dimension: 'B', sub: 'C', question: 'D', good: 'E', importance: 'F', evidenceToRequest: 'P', stakeholders: 'Q',
}, (o) => /^D\d\d\.\d\d$/.test(o.id)).map((q) => ({ ...q, dim: dimByName[q.dimension], importance: Number(q.importance) || 2 }));

// Stakeholders (example only), interview guides, document requests
const sh = sheet('Stakeholders');
const stakeholderExample = rows(sh, 6, 6, { name: 'B', role: 'C', unit: 'D', group: 'E', influence: 'F', interest: 'G', dims: 'I', date: 'J', interviewer: 'K', status: 'L', notes: 'M' })[0];
const ig = sheet('Interview Guides');
const igRows = rows(ig, 6, 80, { group: 'A', n: 'B', question: 'C', dims: 'D', probe: 'E' }, (o) => o.question);
// Numbered rows are questions; a merged row holds the opening and closing guidance.
const interviewGuides = igRows.filter((o) => typeof o.n === 'number').map((o) => ({ ...o, dims: splitList(o.dims) }));
const interviewNote = igRows.find((o) => typeof o.n !== 'number')?.question || '';
const dr = sheet('Document Requests');
const documentRequests = rows(dr, 6, 89, { ref: 'A', document: 'B', dims: 'C', priority: 'D', owner: 'E', status: 'J' }, (o) => o.document)
  .map((o) => ({ ...o, dims: splitList(o.dims) }));

// Inventories
const cap = sheet('Capabilities');
const capabilities = rows(cap, 6, 76, { id: 'A', tier: 'B', l1: 'C', l2: 'D', description: 'E' }, (o) => o.l2 || o.l1);
const pr = sheet('Processes');
const processes = rows(pr, 6, 65, { id: 'A', valueStream: 'B', l1: 'C', l2: 'D' }, (o) => o.l1);
const drs = sheet('Decision Rights');
const rapidRoles = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'].map((c) => val(drs, `${c}5`));
const decisions = rows(drs, 6, 36, { id: 'A', decision: 'B' }, (o) => o.decision);
const examples = {
  orgUnit: rows(sheet('Org Structure'), 6, 6, { name: 'B', head: 'C', nature: 'D', perm: 'E', fixed: 'F', contractor: 'G', outsourced: 'H', managers: 'K', layers: 'L', cost: 'Q', vacancies: 'S', notes: 'T' })[0],
  application: rows(sheet('Applications'), 6, 6, { name: 'B', description: 'C', capabilities: 'D', businessOwner: 'E', technicalOwner: 'F', vendor: 'G', hosting: 'H', users: 'I', criticality: 'J', cost: 'K', supportEnd: 'L', supportStatus: 'M', businessFit: 'N', technicalFit: 'O', classification: 'R', interfaces: 'S', overlap: 'T', notes: 'U' })[0],
  supplier: rows(sheet('Suppliers'), 6, 6, { name: 'B', services: 'C', supports: 'D', segment: 'E', spend: 'F', start: 'H', end: 'I', material: 'L', singleSource: 'M', exitPlan: 'N', performance: 'P', assurance: 'Q', owner: 'R', notes: 'S' })[0],
  location: rows(sheet('Locations'), 6, 6, { name: 'B', city: 'C', type: 'D', functions: 'E', fte: 'F', capacity: 'G', utilisation: 'H', tenure: 'I', leaseExpiry: 'J', cost: 'L', critical: 'O', bcp: 'P', notes: 'Q' })[0],
  cost: rows(sheet('Cost Baseline'), 6, 6, { unit: 'B', employee: 'C', contractor: 'D', technology: 'E', property: 'F', outsourced: 'G', other: 'H', fte: 'K', change: 'M', notes: 'O' })[0],
  finding: rows(sheet('Findings'), 6, 6, { date: 'B', dimension: 'C', sub: 'D', finding: 'E', evidence: 'F', rootCause: 'G', impact: 'H', severity: 'I', questions: 'J', validated: 'K', owner: 'L', recs: 'M', status: 'N' })[0],
  recommendation: rows(sheet('Recommendations'), 6, 6, { dimension: 'B', recommendation: 'C', findings: 'D', benefits: 'E', value: 'F', ease: 'G', horizon: 'J', cost: 'K', owner: 'L', dependencies: 'M', risks: 'N', status: 'O' })[0],
};

// Lists
const ls = sheet('Lists');
const lists = {};
const listCols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC'];
for (const c of listCols) {
  const name = val(ls, `${c}1`);
  if (!name) continue;
  const items = [];
  for (let r = 2; r <= 18; r++) {
    const v = val(ls, `${c}${r}`);
    if (v !== '') items.push(v);
  }
  lists[name] = items;
}
const spanBenchmarks = rows(ls, 2, 5, { nature: 'AE', min: 'AF', max: 'AG' });
const spanNote = val(ls, 'AE7');
const importanceWeights = rows(ls, 2, 4, { importance: 'AI', weight: 'AJ' });

const toolkit = {
  meta: { source: path.basename(src), generated: new Date().toISOString().slice(0, 10), questions: questions.length },
  cover: coverData,
  maturityScale,
  settings,
  settingsHelp,
  principleExample,
  frameworkIntro,
  dimensions,
  approach,
  maturityModel,
  questions,
  stakeholderExample,
  interviewGuides,
  interviewNote,
  documentRequests,
  capabilities,
  processes,
  rapidRoles,
  decisions,
  examples,
  lists,
  spanBenchmarks,
  spanNote,
  importanceWeights,
};
writeFileSync(out, JSON.stringify(toolkit, null, 1));
console.log(`Wrote ${path.relative(root, out)}: ${dimensions.length} dimensions, ${questions.length} questions, ${interviewGuides.length} interview questions, ${documentRequests.length} document requests, ${capabilities.length} capabilities, ${processes.length} processes, ${decisions.length} decisions`);
