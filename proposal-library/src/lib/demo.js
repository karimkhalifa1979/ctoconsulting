// Sample data for demo mode (no Azure app registration configured). Names are placeholders, not real clients or people.
import { LISTS } from '../config.js';

const CLIENTS = {
  'Example Agency': {
    '202609 Capability Review': {
      'Requirements': ['Approach to Market.pdf', 'Statement of Requirement.docx'],
      'Proposal Drafts': ['Proposal v0.3.docx', 'Proposal v0.4.docx'],
      'Pricing': ['Pricing schedule.xlsx'],
      'Final': ['Proposal - Final.pdf', 'Proposal - Final.docx', 'Presentation.pptx'],
    },
  },
  'Example University': {
    'IT Service Operations': {
      'Requirements': ['RFQ.pdf', 'Questions and answers.docx'],
      'Response': ['Response.docx', 'Case studies.docx', 'Team CVs.pdf'],
    },
  },
  'Example Department': {
    'Architecture Services': {
      'Inputs': ['Current state architecture.pptx', 'Application inventory.xlsx'],
      'Deliverables': ['Target state architecture.docx', 'Roadmap.pptx', 'Executive summary.pdf'],
    },
    'Metrics': ['Service metrics.xlsx'],
  },
  'Example Health Service': ['Capability statement.pdf', 'Engagement letter.docx'],
};

const RESUMES = {
  '': ['Resume - Consultant A.docx', 'Resume - Consultant B.docx', 'Resume - Consultant C.pdf'],
  'Business Analysts': ['Resume - Analyst A.docx', 'Resume - Analyst B.docx', 'Resume - Analyst C.pdf'],
  'Scrum Masters_Delivery Managers': ['Resume - Delivery Manager A.docx', 'Resume - Scrum Master B.docx'],
  'Testers': ['Resume - Tester A.docx', 'Resume - Tester B.pdf'],
  'Architects': ['Resume - Architect A.docx', 'Resume - Architect B.docx'],
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

export async function demoFiles(folder, onProgress = () => {}) {
  const tree = folder === LISTS.resumes.folder ? RESUMES : CLIENTS;
  const entries = flatten(tree, '', []);
  await new Promise((r) => setTimeout(r, 400));
  onProgress({ folders: 1, files: entries.length, pending: 0 });
  const base = Date.UTC(2026, 8, 30);
  return entries.map(({ name, path }) => {
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
