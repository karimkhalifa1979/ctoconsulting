// Sample data for demo mode (no Azure app registration configured). Names are placeholders, not real clients or people.
import { LISTS } from '../config.js';

const engagement = (extra = {}) => ({
  'Requirements': ['Approach to Market.pdf', 'Statement of Requirement.docx', 'Questions and answers.pdf'],
  'Proposal Drafts': ['Proposal v0.1.docx', 'Proposal v0.2.docx'],
  'Pricing': ['Pricing schedule.xlsx'],
  'Final': ['Proposal - Final.docx', 'Proposal - Final.pdf'],
  ...extra,
});

const CLIENTS = {
  'Example Agency': {
    '202609 Capability Review': engagement({ 'Presentations': ['Orals presentation.pptx'] }),
    '202503 Digital Strategy': {
      'Deliverables': ['Digital strategy.docx', 'Digital strategy - board pack.pptx', 'Investment roadmap.xlsx'],
      'Final': ['Proposal - Final.pdf'],
    },
  },
  'Example University': {
    'IT Service Operations': {
      'Requirements': ['RFQ.pdf', 'Questions and answers.docx'],
      'Response': ['Response.docx', 'Case studies.docx', 'Team CVs.pdf', 'Methodology.docx'],
    },
    'Cyber Uplift': engagement(),
  },
  'Example Department': {
    'Architecture Services': {
      'Inputs': ['Current state architecture.pptx', 'Application inventory.xlsx'],
      'Deliverables': ['Target state architecture.docx', 'Roadmap.pptx', 'Executive summary.pdf'],
    },
    'Metrics': ['Service metrics.xlsx', 'Benefits register.xlsx'],
    'ISO27001': { 'Presentations': ['ISMS overview.pptx'], 'Deliverables': ['Statement of Applicability.xlsx', 'Gap assessment.docx'] },
  },
  'Example Health Service': {
    '': ['Capability statement.pdf', 'Engagement letter.docx'],
    'IT Operating Model': {
      'Deliverables': ['Operating model.docx', 'Operating model.pptx', 'RACI.xlsx'],
      'Workshops': ['Workshop 1 notes.docx', 'Workshop 2 notes.docx'],
    },
  },
  'Example Regulator': { '202608 Solution Architect': engagement() },
  'Example Council': {
    'ERP Selection': {
      'Requirements': ['Business requirements.xlsx', 'Tender.pdf'],
      'Evaluation': ['Evaluation report.docx', 'Scoring.xlsx'],
      'Final': ['Recommendation.pptx'],
    },
  },
};

const RESUMES = {
  '': ['Resume - Consultant A.docx', 'Resume - Consultant B.docx', 'Resume - Consultant C.pdf', 'Resume - Consultant D.docx'],
  'Business Analysts': ['Resume - Analyst A.docx', 'Resume - Analyst B.docx', 'Resume - Analyst C.pdf', 'Resume - Analyst D.docx'],
  'Scrum Masters_Delivery Managers': ['Resume - Delivery Manager A.docx', 'Resume - Scrum Master B.docx', 'Resume - Delivery Manager C.pdf'],
  'Testers': ['Resume - Tester A.docx', 'Resume - Tester B.pdf', 'Resume - Test Lead C.docx'],
  'Architects': ['Resume - Architect A.docx', 'Resume - Architect B.docx', 'Resume - Enterprise Architect C.pdf'],
  'Project Managers': ['Resume - Project Manager A.docx', 'Resume - Program Manager B.docx'],
  'Cyber Security': ['Resume - Security Consultant A.docx', 'Resume - IRAP Assessor B.pdf'],
};

function flatten(tree, path, out) {
  if (Array.isArray(tree)) {
    for (const name of tree) out.push({ name, path });
    return out;
  }
  for (const [k, v] of Object.entries(tree)) flatten(v, k === '' ? path : path ? `${path}/${k}` : k, out);
  return out;
}

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36).toUpperCase();
}

export function demoFileList(folder) {
  const tree = folder === LISTS.resumes.folder ? RESUMES : CLIENTS;
  const base = Date.UTC(2026, 8, 30);
  return flatten(tree, '', []).map(({ name, path }) => {
    const id = 'DEMO' + hash(path + '/' + name);
    const n = parseInt(hash(name), 36);
    return {
      id,
      name,
      path,
      webUrl: '#',
      size: 40_000 + (n % 2_000_000),
      modified: new Date(base - (n % 400) * 86_400_000).toISOString(),
      modifiedBy: 'Demo user',
    };
  });
}

export async function demoFiles(folder, onProgress = () => {}) {
  const files = demoFileList(folder);
  await new Promise((r) => setTimeout(r, 400));
  onProgress({ folders: 1, files: files.length, pending: 0 });
  return files;
}

// Starting point for a demo: some library files selected, some resumes active and one example proposal.
export function demoSeed(today = new Date()) {
  const iso = (days) => new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const stamp = new Date(today.getTime() - 86_400_000).toISOString();
  const entry = (f) => ({ name: f.name, path: f.path, webUrl: f.webUrl, selectedAt: stamp, selectedBy: 'Demo user' });
  const pick = (files, test) => Object.fromEntries(files.filter(test).map((f) => [f.id, entry(f)]));

  const clientFiles = demoFileList(LISTS.proposals.folder);
  const proposalFiles = pick(clientFiles, (f) => /Final|Deliverables|Response/.test(f.path) || /Capability statement|Case studies|Methodology/.test(f.name));
  const resumes = demoFileList(LISTS.resumes.folder);
  const activeResumes = pick(resumes, (f) => !/ (C|D)\.(docx|pdf)$/.test(f.name));

  const byName = (list, name) => list.find((f) => f.name === name && f.id in (list === resumes ? activeResumes : proposalFiles));
  const doc = (name, path, note) => { const f = clientFiles.find((x) => x.name === name && x.path === path); return { id: f.id, name, path, webUrl: '#', note }; };
  const person = (name, role) => { const f = byName(resumes, name); return { id: f.id, name, path: f.path, webUrl: '#', role }; };

  const example = {
    id: 'demo-proposal-1',
    details: {
      title: 'Service Management Uplift',
      client: 'Example University',
      status: 'In progress',
      type: 'Request for Quote (RFQ)',
      channel: 'Direct from client',
      reference: 'RFQ-2026-118',
      lead: 'Demo user',
      value: '180000',
      sector: 'Higher education',
      relationship: 'Existing client',
      division: 'Information Technology Services',
      contactName: 'Client contact (placeholder)',
      contactRole: 'Director, IT Operations',
      released: iso(-9),
      questionsClose: iso(3),
      dueDate: iso(10),
      dueTime: '14:00',
      decision: iso(31),
      startDate: iso(45),
      term: '4 months',
      summary: 'Assess the current IT service management practice and deliver a roadmap and operating model to lift service quality.',
      services: ['IT service management', 'Strategy & advisory', 'Change management'],
      locations: ['Canberra'],
      clearance: 'None required',
      pricing: 'Fixed price',
      winThemes: 'Recent, directly comparable work for the same client; senior team available immediately.',
    },
    files: [
      doc('Response.docx', 'Example University/IT Service Operations/Response', 'Previous response'),
      doc('Case studies.docx', 'Example University/IT Service Operations/Response', 'Case study'),
      doc('Operating model.docx', 'Example Health Service/IT Operating Model/Deliverables', 'Sample deliverable'),
    ],
    team: [
      person('Resume - Delivery Manager A.docx', 'Engagement Manager'),
      person('Resume - Analyst A.docx', 'Business Analyst'),
    ],
    createdAt: stamp, createdBy: 'Demo user', updatedAt: stamp, updatedBy: 'Demo user',
  };
  return { schema: 'cto-proposal-library/v1', updatedAt: stamp, updatedBy: 'Demo user', proposalFiles, activeResumes, proposals: { [example.id]: example } };
}
