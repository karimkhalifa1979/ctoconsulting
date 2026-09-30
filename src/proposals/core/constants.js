// Reference data for the proposal platform: roles, capabilities, lifecycle, statuses and content types.

export const ROLES = [
  { id: 'admin', label: 'Administrator', short: 'Admin', desc: 'Manages users, roles, workflow templates, integrations and AI settings' },
  { id: 'partner', label: 'Partner', short: 'Partner', desc: 'Accountable for the bid. Makes the bid/no-bid decision and gives final approval' },
  { id: 'bidManager', label: 'Bid manager', short: 'Bid manager', desc: 'Creates the workspace, plans the response, assigns sections, runs the timetable, generates outputs and records submission' },
  { id: 'author', label: 'Author', short: 'Author', desc: 'Writes assigned sections using the library and AI, and resolves comments' },
  { id: 'reviewer', label: 'Reviewer', short: 'Reviewer', desc: 'Comments on and scores sections against the evaluation criteria. Requests changes' },
  { id: 'commercial', label: 'Commercial approver', short: 'Commercial', desc: 'Approves pricing, rates, margin, terms and commercial risk' },
  { id: 'librarian', label: 'Content librarian', short: 'Librarian', desc: 'Curates the library: approves, tags, versions and retires content' },
  { id: 'consultant', label: 'Consultant', short: 'Consultant', desc: 'Maintains their own profile and CV. Confirms availability when proposed for a team' },
  { id: 'viewer', label: 'Viewer', short: 'Viewer', desc: 'Read-only access to dashboards and bids, for leadership' },
];
export const roleLabel = (id) => ROLES.find((r) => r.id === id)?.label || id;

// Roles that see every bid (portfolio access), subject to ethical walls.
export const PORTFOLIO_ROLES = ['admin', 'partner', 'viewer'];

// Permissions matrix (spec section 4). 'yes' = allowed; 'team' = only on bids where the user is a team member; 'own' = only their own items.
export const CAPABILITIES = [
  { id: 'createBid', label: 'Create a bid', grants: { admin: 'yes', partner: 'yes', bidManager: 'yes' } },
  { id: 'decideBid', label: 'Decide bid/no-bid', grants: { partner: 'yes' } },
  { id: 'planSections', label: 'Plan and assign sections', grants: { admin: 'yes', partner: 'team', bidManager: 'team' } },
  { id: 'editSection', label: 'Edit section content', grants: { partner: 'team', bidManager: 'team', author: 'own' } },
  { id: 'comment', label: 'Comment and suggest', grants: { partner: 'team', bidManager: 'team', author: 'team', reviewer: 'team', commercial: 'team' } },
  { id: 'approveGate', label: 'Approve a gate', grants: { partner: 'team', reviewer: 'team', commercial: 'team' } },
  { id: 'seeCost', label: 'See cost rates and margin', grants: { admin: 'yes', partner: 'team', commercial: 'team' } },
  { id: 'generateOutputs', label: 'Generate outputs', grants: { partner: 'team', bidManager: 'team', author: 'team' } },
  { id: 'recordSubmission', label: 'Record submission and outcome', grants: { partner: 'team', bidManager: 'team' } },
  { id: 'addLibrary', label: 'Add content to the library', grants: { admin: 'yes', partner: 'yes', bidManager: 'yes', author: 'yes', librarian: 'yes' } },
  { id: 'approveLibrary', label: 'Approve library content', grants: { librarian: 'yes' } },
  { id: 'configure', label: 'Configure workflows and templates', grants: { admin: 'yes', librarian: 'yes' } },
  { id: 'viewDashboards', label: 'View dashboards', grants: { admin: 'yes', partner: 'yes', bidManager: 'yes', author: 'own', commercial: 'yes', librarian: 'yes', viewer: 'yes' } },
];
export const MATRIX_ROLES = ['admin', 'partner', 'bidManager', 'author', 'reviewer', 'commercial', 'librarian', 'viewer'];

export const STAGES = [
  { id: 'intake', n: 1, label: 'Intake', owner: 'Bid manager', what: 'Opportunity registered. Client documents uploaded', exit: 'Request documents attached' },
  { id: 'qualify', n: 2, label: 'Qualify', owner: 'Partner', what: 'AI summarises the request and extracts requirements. Bid/no-bid scorecard is pre-filled', exit: 'Gate 1: bid/no-bid' },
  { id: 'plan', n: 3, label: 'Plan', owner: 'Bid manager', what: 'Win themes, response outline, section owners, deadlines, proposed team', exit: 'Plan published to the team' },
  { id: 'author', n: 4, label: 'Author', owner: 'Authors', what: 'Sections drafted with AI and the library. Pricing and team built', exit: 'All sections marked ready for review' },
  { id: 'review', n: 5, label: 'Review', owner: 'Reviewers', what: 'Structured reviews scored against evaluation criteria', exit: 'All sections approved' },
  { id: 'approve', n: 6, label: 'Approve', owner: 'Commercial approver, Partner', what: 'Commercial review, then final partner review', exit: 'Gate 2: commercial approval and Gate 3: partner sign-off' },
  { id: 'produce', n: 7, label: 'Produce', owner: 'Bid manager', what: 'Word proposal, PowerPoint deck and PDFs generated. Automated checks run', exit: 'Checks pass and outputs are marked final' },
  { id: 'submit', n: 8, label: 'Submit', owner: 'Bid manager', what: "Submitted through the client's channel. Time, files and receipt recorded", exit: 'Submission recorded' },
  { id: 'outcome', n: 9, label: 'Outcome', owner: 'Partner, Bid manager', what: 'Clarifications, orals, award decision, debrief', exit: 'Win or loss recorded with reasons' },
];
export const stageIndex = (id) => STAGES.findIndex((s) => s.id === id);
export const stageLabel = (id) => (id === 'archived' ? 'Archived (no-bid)' : id === 'closed' ? 'Closed' : STAGES.find((s) => s.id === id)?.label || id);

export const GATES = [
  { id: 'g1', n: 1, label: 'Bid / no-bid', stage: 'qualify', desc: 'Partner decides whether to bid, from the scorecard and opportunity brief' },
  { id: 'g2', n: 2, label: 'Commercial approval', stage: 'approve', desc: 'Price, rates, margin, terms and commercial risk approved' },
  { id: 'g3', n: 3, label: 'Partner sign-off', stage: 'approve', desc: 'Final partner review of the whole response' },
];
export const gateLabel = (id) => GATES.find((g) => g.id === id)?.label || id;

export const SECTION_STATUSES = [
  { id: 'not_started', label: 'Not started', desc: 'owner assigned', color: 'var(--st-none)' },
  { id: 'drafting', label: 'Drafting', desc: 'author and AI write', color: 'var(--series-1)' },
  { id: 'in_review', label: 'In review', desc: 'reviewers score', color: 'var(--st-warning)' },
  { id: 'approved', label: 'Approved', desc: 'version signed off', color: 'var(--st-good)' },
  { id: 'locked', label: 'Locked', desc: 'gate snapshot', color: 'var(--brand-navy)' },
];
export const sectionStatus = (id) => SECTION_STATUSES.find((s) => s.id === id) || SECTION_STATUSES[0];

export const DECISIONS = [
  { id: 'approve', label: 'Approve' },
  { id: 'approve_conditions', label: 'Approve with conditions' },
  { id: 'reject', label: 'Reject' },
];

export const COMPLIANCE = [
  { id: '', label: 'Not assessed', color: 'var(--st-none)' },
  { id: 'comply', label: 'Comply', color: 'var(--st-good)' },
  { id: 'partial', label: 'Partial', color: 'var(--st-warning)' },
  { id: 'not', label: 'Not comply', color: 'var(--st-critical)' },
];

export const LIB_TYPES = [
  { id: 'proposal_template', label: 'Proposal templates', one: 'Proposal template', formats: '.docx, .dotx', meta: ['Template type', 'Section map', 'Placeholders', 'Brand version'] },
  { id: 'presentation_template', label: 'Presentation templates', one: 'Presentation template', formats: '.pptx, .potx', meta: ['Slide layouts', 'Placeholder map', 'Brand version'] },
  { id: 'case_study', label: 'Case studies', one: 'Case study', formats: 'Structured form plus .docx or .pdf', meta: ['Client', 'Sector', 'Services', 'Technologies', 'Value', 'Dates', 'Outcomes', 'Referee', 'Consent'] },
  { id: 'consultant_profile', label: 'Consultant profiles', one: 'Consultant profile', formats: 'Structured form, generated .docx', meta: ['Role', 'Level', 'Skills', 'Certifications', 'Clearance', 'Sectors', 'Availability', 'Rate band'] },
  { id: 'rate_card', label: 'Rate cards', one: 'Rate card', formats: 'Structured table, .xlsx import', meta: ['Valid from and to', 'Client or panel', 'Currency', 'GST treatment'] },
  { id: 'standard_answer', label: 'Standard answers', one: 'Standard answer', formats: 'Rich text', meta: ['Topic', 'Question variants', 'Owner', 'Last reviewed'] },
  { id: 'method', label: 'Methods and offerings', one: 'Method or offering', formats: 'Rich text, images', meta: ['Offering', 'Phases', 'Deliverables'] },
  { id: 'evidence', label: 'Corporate evidence', one: 'Corporate evidence', formats: 'PDF', meta: ['Issuer', 'Expiry date'] },
  { id: 'past_proposal', label: 'Past proposals', one: 'Past proposal', formats: '.docx, .pdf', meta: ['Outcome', 'Client', 'Value', 'Evaluator feedback'] },
  { id: 'media', label: 'Media', one: 'Media item', formats: 'PNG, JPG, SVG', meta: ['Usage rights', 'Alt text'] },
];
export const libTypeLabel = (id, one = true) => { const t = LIB_TYPES.find((x) => x.id === id); return t ? (one ? t.one : t.label) : id; };

// Content types whose text the drafting engine can draw on.
export const DRAFTABLE_TYPES = ['case_study', 'standard_answer', 'method', 'past_proposal', 'evidence'];

export const LIB_STATUSES = [
  { id: 'draft', label: 'Draft', color: 'var(--st-none)' },
  { id: 'in_review', label: 'In review', color: 'var(--st-warning)' },
  { id: 'approved', label: 'Approved', color: 'var(--st-good)' },
  { id: 'expiring', label: 'Expiring', color: 'var(--st-serious)' },
  { id: 'retired', label: 'Retired', color: 'var(--st-na)' },
];

export const PRICING_MODELS = [
  { id: 'tm', label: 'Time and materials', desc: 'Days × daily rate, invoiced monthly in arrears' },
  { id: 'fixed', label: 'Fixed price with milestones', desc: 'Fixed total paid against milestone acceptance' },
  { id: 'capped', label: 'Capped time and materials', desc: 'Time and materials up to a not-to-exceed cap' },
  { id: 'retainer', label: 'Retainer', desc: 'A monthly fee for a committed capacity' },
];

export const LEVELS = ['Partner', 'Director', 'Principal Consultant', 'Senior Consultant', 'Consultant', 'Analyst'];
export const CLEARANCES = ['None', 'Baseline', 'NV1', 'NV2', 'PV'];

export const CHANNELS = ['AusTender', 'BuyICT', 'NSW eTendering', 'Buying for Victoria', 'QTenders', 'Tenders WA', 'SA Tenders', 'Direct approach', 'Client portal', 'Email'];

export const LOSS_REASONS = ['Price', 'Capability or experience', 'Incumbent advantage', 'Relationship', 'Compliance or late submission', 'Scope or approach', 'Team or availability', 'Client cancelled'];

export const SCORECARD_FACTORS = [
  { id: 'strategic', label: 'Strategic fit', hint: 'Alignment with our offerings, sectors and growth plan' },
  { id: 'relationship', label: 'Relationship', hint: 'Existing relationship, access to the buyer, past work' },
  { id: 'capability', label: 'Capability match', hint: 'Library evidence: case studies, methods, people' },
  { id: 'competition', label: 'Competitive position', hint: 'Incumbent, likely competitors, differentiation' },
  { id: 'capacity', label: 'Capacity to deliver', hint: 'Availability of the proposed team and bid team' },
  { id: 'risk', label: 'Risk (higher is lower risk)', hint: 'Commercial terms, delivery, reputational risk' },
  { id: 'value', label: 'Value', hint: 'Contract value, margin potential, follow-on work' },
];

export const REVIEW_ROUNDS = [
  { id: 'solution', label: 'Solution review' },
  { id: 'red', label: 'Red team' },
  { id: 'gold', label: 'Gold team' },
];

export const DOC_TYPES = [
  { id: 'request', label: 'Request' },
  { id: 'addendum', label: 'Addendum' },
  { id: 'qa', label: 'Q&A' },
  { id: 'form', label: 'Response form' },
  { id: 'other', label: 'Other' },
];

export const OUTPUT_KINDS = {
  docx: 'Word proposal', pdf: 'PDF', pdfa: 'PDF/A', pptx: 'PowerPoint deck', 'deck-pdf': 'Deck PDF', xlsx: 'Excel', cv: 'CV pack',
  'manual-docx': 'Word (final edit, re-uploaded)', 'manual-pptx': 'PowerPoint (final edit, re-uploaded)', rehearsal: 'Rehearsal pack',
};

// Slide kinds used by deck recipes and their default layout in the CTO master.
export const SLIDE_KINDS = {
  title: { title: 'Title', layout: 'title' }, agenda: { title: 'Agenda', layout: 'content' }, understanding: { title: 'Our understanding of your needs', layout: 'content' },
  approach: { title: 'Our approach', layout: 'content' }, timeline: { title: 'Timeline', layout: 'timeline' }, team: { title: 'Your team', layout: 'team' },
  case_studies: { title: 'Relevant case studies', layout: 'case_study' }, why: { title: 'Why CTO Consulting', layout: 'content' }, next_steps: { title: 'Next steps', layout: 'content' },
  questions: { title: 'Questions', layout: 'section' }, exec_summary: { title: 'Executive summary', layout: 'content' }, commercial: { title: 'Commercial summary', layout: 'table' },
  who_we_are: { title: 'Who we are', layout: 'content' }, services: { title: 'Services', layout: 'content' }, sectors: { title: 'Sectors', layout: 'content' },
  credentials: { title: 'Credentials', layout: 'content' }, contacts: { title: 'Contacts', layout: 'content' }, objectives: { title: 'Objectives', layout: 'content' },
  scope: { title: 'Scope', layout: 'content' }, governance: { title: 'Governance', layout: 'content' }, plan: { title: 'Plan', layout: 'timeline' }, first_30_days: { title: 'First 30 days', layout: 'content' },
};
