// The proposal record: its sections, fields and completeness rules. Pure data and logic (tested in scripts/check.mjs).
//
// Proposal = {
//   id, details: { [fieldId]: value }, files: [ProposalFile], team: [TeamMember],
//   createdAt, createdBy, updatedAt, updatedBy
// }
// ProposalFile = { id, name, path, webUrl, note }       — a file chosen from the Proposal library
// TeamMember   = { id, name, path, webUrl, role }       — an active resume, with the person's role on this bid

export const STATUSES = ['Draft', 'In progress', 'In review', 'Submitted', 'Shortlisted', 'Won', 'Lost', 'Withdrawn'];
export const CLOSED = new Set(['Won', 'Lost', 'Withdrawn']);

// Sections in the order they are shown. `fields` sections are rendered from their field list;
// documents, team and review have their own screens.
export const SECTIONS = [
  {
    id: 'overview', label: 'Overview', hint: 'What the opportunity is and where it stands',
    fields: [
      { id: 'title', label: 'Proposal title', type: 'text', required: true, wide: true, placeholder: 'e.g. IT Capability Review' },
      { id: 'client', label: 'Client', type: 'client', required: true, placeholder: 'Choose or type a client', hint: 'Matches the client folder names in Clients' },
      { id: 'status', label: 'Status', type: 'select', options: STATUSES },
      { id: 'type', label: 'Opportunity type', type: 'select', options: ['Request for Quote (RFQ)', 'Request for Tender (RFT)', 'Request for Proposal (RFP)', 'Expression of Interest (EOI)', 'Panel work order', 'Direct approach', 'Other'] },
      { id: 'channel', label: 'Procurement channel', type: 'select', options: ['BuyICT', 'AusTender', 'State or territory portal', 'Direct from client', 'Through a partner / prime', 'Other'] },
      { id: 'reference', label: 'Client reference', type: 'text', placeholder: 'e.g. ATM or RFQ number' },
      { id: 'lead', label: 'Bid lead', type: 'text', placeholder: 'Who is responsible for this proposal' },
      { id: 'value', label: 'Estimated value (AUD, ex GST)', type: 'number', placeholder: 'e.g. 250000' },
    ],
  },
  {
    id: 'client', label: 'Client & contacts', hint: 'Who the client is and who to talk to',
    fields: [
      { id: 'sector', label: 'Sector', type: 'select', options: ['Australian Government', 'State or territory government', 'Local government', 'Higher education', 'Health', 'Not-for-profit', 'Private sector'] },
      { id: 'relationship', label: 'Relationship', type: 'select', options: ['New client', 'Existing client', 'Former client'] },
      { id: 'division', label: 'Division / business unit', type: 'text', wide: true },
      { id: 'contactName', label: 'Contact name', type: 'text' },
      { id: 'contactRole', label: 'Contact role', type: 'text' },
      { id: 'contactEmail', label: 'Contact email', type: 'email' },
      { id: 'contactPhone', label: 'Contact phone', type: 'tel' },
      { id: 'clientNotes', label: 'Background and relationship notes', type: 'textarea', wide: true },
    ],
  },
  {
    id: 'dates', label: 'Key dates', hint: 'Deadlines and the expected timeline',
    fields: [
      { id: 'released', label: 'Released', type: 'date' },
      { id: 'questionsClose', label: 'Questions close', type: 'date' },
      { id: 'dueDate', label: 'Submission due', type: 'date', required: true },
      { id: 'dueTime', label: 'Submission time (client local time)', type: 'time' },
      { id: 'decision', label: 'Expected decision', type: 'date' },
      { id: 'startDate', label: 'Expected start', type: 'date' },
      { id: 'term', label: 'Contract term', type: 'text', wide: true, placeholder: 'e.g. 6 months with two 3-month extension options' },
    ],
  },
  {
    id: 'scope', label: 'Scope & requirements', hint: 'What the client needs and how we will win',
    fields: [
      { id: 'summary', label: 'Requirement summary', type: 'textarea', wide: true, placeholder: 'What the client is asking for, in a few sentences' },
      { id: 'services', label: 'Services', type: 'chips', wide: true, options: ['Strategy & advisory', 'Enterprise architecture', 'Cyber security', 'Program & project management', 'Business analysis', 'IT service management', 'Digital transformation', 'Data & analytics', 'Testing & quality', 'Procurement & sourcing', 'Change management'] },
      { id: 'locations', label: 'Work location', type: 'chips', wide: true, options: ['Canberra', 'Sydney', 'Melbourne', 'Brisbane', 'Adelaide', 'Perth', 'Hobart', 'Darwin', 'Remote'] },
      { id: 'clearance', label: 'Security clearance', type: 'select', options: ['None required', 'Baseline', 'NV1', 'NV2', 'Positive Vetting'] },
      { id: 'pricing', label: 'Pricing model', type: 'select', options: ['Fixed price', 'Time & materials', 'Capped time & materials', 'Milestone-based', 'Panel day rates'] },
      { id: 'criteria', label: 'Evaluation criteria', type: 'textarea', wide: true },
      { id: 'winThemes', label: 'Win themes / key messages', type: 'textarea', wide: true },
    ],
  },
  { id: 'documents', label: 'Supporting documents', hint: 'Files from the Proposal library to reuse' },
  { id: 'team', label: 'Proposed team', hint: 'Active resumes and their roles' },
  { id: 'review', label: 'Review', hint: 'Check everything in one place' },
];

export const FIELDS = Object.fromEntries(SECTIONS.flatMap((s) => (s.fields || []).map((f) => [f.id, f])));

const newId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export function newProposal(user) {
  return { id: newId(), details: { status: 'Draft', lead: user || '' }, files: [], team: [], createdAt: null, createdBy: null, updatedAt: null, updatedBy: null };
}

export function duplicateProposal(p, user) {
  const copy = JSON.parse(JSON.stringify(p));
  return { ...copy, id: newId(), details: { ...copy.details, title: `Copy of ${copy.details.title || 'proposal'}`, status: 'Draft', lead: user || copy.details.lead }, createdAt: null, createdBy: null, updatedAt: null, updatedBy: null };
}

const filled = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');

// Per-section progress for the section navigation.
// state: 'complete' (all required filled, and something entered), 'missing' (a required field is empty), 'partial', 'empty'.
export function sectionStatus(p, section) {
  if (section.id === 'documents') return { state: p.files.length ? 'complete' : 'empty', count: p.files.length };
  if (section.id === 'team') return { state: p.team.length ? 'complete' : 'empty', count: p.team.length };
  if (section.id === 'review') return { state: missingRequired(p).length ? 'missing' : 'complete' };
  const fields = section.fields || [];
  const n = fields.filter((f) => filled(p.details[f.id])).length;
  if (fields.some((f) => f.required && !filled(p.details[f.id]))) return { state: 'missing', filled: n, total: fields.length };
  return { state: n === 0 ? 'empty' : n === fields.length ? 'complete' : 'partial', filled: n, total: fields.length };
}

export function missingRequired(p) {
  return Object.values(FIELDS).filter((f) => f.required && !filled(p.details[f.id]));
}

// Review checklist: required details plus the things a proposal normally needs.
export function readiness(p) {
  return [
    ...Object.values(FIELDS).filter((f) => f.required).map((f) => ({ label: f.label, ok: filled(p.details[f.id]), section: SECTIONS.find((s) => s.fields?.includes(f)).id })),
    { label: 'At least one supporting document', ok: p.files.length > 0, section: 'documents' },
    { label: 'At least one team member', ok: p.team.length > 0, section: 'team' },
    { label: 'A role for every team member', ok: p.team.length > 0 && p.team.every((m) => filled(m.role)), section: 'team' },
  ];
}

export function normaliseProposal(raw) {
  return {
    ...raw,
    details: raw?.details && typeof raw.details === 'object' ? raw.details : {},
    files: Array.isArray(raw?.files) ? raw.files : [],
    team: Array.isArray(raw?.team) ? raw.team : [],
  };
}

// "Clients/<client>/..." — the client is the first folder under Clients.
export const clientOf = (path) => (path || '').split('/')[0] || '(top level)';

// "Resume - Jane Citizen.docx" -> "Jane Citizen"
export function personName(fileName) {
  return (fileName || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^(resume|cv|curriculum vitae)\s*[-–_:]\s*/i, '')
    .replace(/[\s\-–_]+(resume|cv)$/i, '')
    .trim() || fileName;
}

// Days from today until an ISO date (negative when past); null without a date.
export function daysUntil(isoDate, today = new Date()) {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const due = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - now) / 86_400_000);
}
