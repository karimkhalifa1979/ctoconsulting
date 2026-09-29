// AI Readiness framework: eight pillars, 48 diagnostic questions scored on the same
// 1–5 maturity scale as the operating model assessment, responsible AI guardrails,
// ethics principles and a gap-based action library.
//
// References: Australia's AI Ethics Principles; Voluntary AI Safety Standard (10 guardrails)
// and the National AI Centre's Guidance for AI Adoption; ISO/IEC 42001:2023 (AI management
// systems); NIST AI Risk Management Framework 1.0; DTA Policy for the responsible use of AI
// in government (Commonwealth entities); Privacy Act 1988 and the APPs.

export const AI_PILLARS = [
  {
    id: 'STR', name: 'Strategy & Leadership', short: 'Strategy',
    description: 'A clear AI ambition linked to strategy, with accountable leadership, funding and value measures.',
    levels: [
      'No AI ambition or sponsor. Activity is driven by individual enthusiasm.',
      'AI discussed by leaders but no agreed ambition, owner or budget.',
      'Endorsed AI strategy with a named executive sponsor, funding and target outcomes.',
      'AI strategy drives portfolio and investment decisions; value reported to the executive and board.',
      'AI is integral to corporate strategy; leadership continually reshapes the business around AI opportunities.',
    ],
    links: ['D01.03', 'D11.01', 'D11.09'],
  },
  {
    id: 'VAL', name: 'Use Cases & Value', short: 'Use cases',
    description: 'A managed pipeline of prioritised AI use cases that move from pilot to production and realise measured benefits.',
    levels: [
      'No view of AI opportunities. Isolated experiments with no business case.',
      'Some use cases identified; pilots rarely progress to production.',
      'Managed use-case pipeline with consistent prioritisation and business cases; several in production.',
      'Use cases scaled across the organisation with processes redesigned and benefits tracked.',
      'Continuous discovery and scaling of AI value; AI reshapes products, services and business models.',
    ],
    links: ['D04.07', 'D17.06', 'D17.09'],
  },
  {
    id: 'DAT', name: 'Data Foundations', short: 'Data',
    description: 'Trusted, accessible, well-governed data (structured and unstructured) that AI can safely use.',
    levels: [
      'Data is siloed, of unknown quality and without owners.',
      'Some data governance; quality issues known; access for AI is manual and slow.',
      'Data owners, quality measures and a modern data platform in place for priority domains.',
      'Catalogued, lineage-tracked data products serve AI and analytics across the organisation.',
      'Data is a strategic asset continuously curated for AI, with automated quality and privacy controls.',
    ],
    links: ['D12.01', 'D12.02', 'D12.03', 'D12.09'],
  },
  {
    id: 'TEC', name: 'Technology & Platforms', short: 'Technology',
    description: 'Scalable platforms, tooling, integration and engineering practices to build, run and monitor AI.',
    levels: [
      'No approved AI tools; staff use consumer tools (shadow AI).',
      'Some enterprise AI tools licensed; integration and deployment are bespoke.',
      'Approved AI platforms, reference architecture and integration patterns in place.',
      'MLOps / LLMOps pipelines, evaluation and monitoring operate at scale; low technical debt.',
      'Composable AI platform enables rapid, safe deployment; continuous modernisation.',
    ],
    links: ['D11.02', 'D11.04', 'D11.05', 'D11.06'],
  },
  {
    id: 'PPL', name: 'People, Skills & Culture', short: 'People',
    description: 'AI literacy across the workforce, specialist skills, workforce planning and a culture of safe experimentation.',
    levels: [
      'Low AI awareness; no training; staff anxious or unaware of AI implications.',
      'Pockets of enthusiasts; ad hoc training; workforce impacts not considered.',
      'Organisation-wide AI literacy program, specialist roles defined and workforce impacts assessed.',
      'Skills pathways, communities of practice and high adoption; roles redesigned with staff.',
      'AI fluency is pervasive; the workforce continually reskills and co-designs AI-enabled work.',
    ],
    links: ['D08.04', 'D09.07', 'D09.09'],
  },
  {
    id: 'GOV', name: 'Governance, Ethics & Responsible AI', short: 'Governance',
    description: 'Policy, accountability, inventory, impact assessment, transparency and human oversight proportional to risk.',
    levels: [
      'No AI policy or accountability; AI use is not visible.',
      'Draft policy or acceptable-use guidance; no inventory or impact assessment.',
      'Approved AI policy, governance forum, AI inventory and risk-based impact assessments.',
      'Responsible AI embedded in delivery with transparency, contestability and oversight tested.',
      'Governance is adaptive and trusted; the organisation contributes to external standards.',
    ],
    links: ['D07.01', 'D15.01', 'D15.05'],
  },
  {
    id: 'SEC', name: 'Security, Risk & Compliance', short: 'Security & risk',
    description: 'AI-specific security, third-party risk, regulatory compliance, testing, incident management and auditability.',
    levels: [
      'AI risks not identified; vendor AI features adopted without assessment.',
      'AI risks recognised; controls are informal and inconsistent.',
      'AI threats, obligations and vendor risks assessed; testing before deployment.',
      'Continuous monitoring for drift, bias and security; AI incidents managed and reported.',
      'Proactive, intelligence-led AI risk management with independent assurance.',
    ],
    links: ['D15.04', 'D15.07', 'D15.09', 'D13.08'],
  },
  {
    id: 'OPM', name: 'Operating Model & Delivery', short: 'Operating model',
    description: 'How AI is organised, funded, delivered, partnered, adopted and cost-managed.',
    levels: [
      'No defined way of delivering AI; efforts are uncoordinated.',
      'Informal central team or vendor-led pilots; no repeatable delivery method.',
      'Defined AI operating model (e.g. centre of excellence) with a delivery lifecycle and product owners.',
      'Hub-and-spoke model scales delivery; change management and AI FinOps applied consistently.',
      'AI capability embedded across business teams with a lean enabling core and ecosystem partners.',
    ],
    links: ['D06.05', 'D17.02', 'D17.05'],
  },
];

const q = (pillar, n, sub, question, good) => ({ id: `AI.${pillar}.${String(n).padStart(2, '0')}`, pillar, sub, question, good });

export const AI_QUESTIONS = [
  q('STR', 1, 'AI ambition', 'Is there a clear, executive-endorsed ambition for how AI will create value for the organisation and its customers?', 'A documented AI strategy linked to corporate strategy, with value goals, priority domains and explicit statements of where AI will not be used.'),
  q('STR', 2, 'Executive sponsorship', 'Is there an accountable executive sponsor for AI with the authority and budget to drive adoption?', 'A named senior executive (e.g. an accountable AI official) owns AI outcomes, chairs AI governance and reports to the board.'),
  q('STR', 3, 'Strategic alignment', 'Are AI initiatives explicitly linked to strategic objectives, operating model priorities and business outcomes?', 'Every AI initiative traces to a strategic objective and a measurable business outcome in the portfolio.'),
  q('STR', 4, 'Investment & funding', 'Is there dedicated, sustained funding for AI platforms, skills and use cases rather than ad hoc project funding?', 'Multi-year AI investment envelope with stage-gated funding for use cases and ongoing funding for platforms and skills.'),
  q('STR', 5, 'Board & leadership literacy', 'Do the board and executive understand AI opportunities, risks and their oversight obligations?', 'Directors and executives have completed AI briefings; AI risk and performance are standing agenda items.'),
  q('STR', 6, 'Value measurement', 'Are the benefits of AI defined, measured against baselines and reported?', 'AI value scorecard (efficiency, quality, customer, risk) reported regularly against baselines.'),

  q('VAL', 1, 'Use-case pipeline', 'Is there a managed pipeline of AI use cases sourced from across the business?', 'Single register of AI ideas and use cases with owners, stage and status, refreshed at least quarterly.'),
  q('VAL', 2, 'Prioritisation', 'Are use cases prioritised consistently on value, feasibility and risk?', 'Standard scoring (value, data readiness, technical feasibility, risk tier) used to sequence the pipeline.'),
  q('VAL', 3, 'Business cases', 'Do AI initiatives have business cases with baselines, costs, benefits and success criteria?', 'Lightweight business cases with baseline measures, total cost of ownership and exit criteria for pilots.'),
  q('VAL', 4, 'Pilot to production', 'Can the organisation move successful pilots into production and scale them?', 'Defined path to production with funding, security and support hand-over; most successful pilots scale.'),
  q('VAL', 5, 'Process redesign', 'Are processes redesigned around AI, with human-in-the-loop roles defined, rather than automating the current state?', 'End-to-end process redesign accompanies AI deployment, with clear human decision points and role changes.'),
  q('VAL', 6, 'Benefits realisation', 'Are realised AI benefits tracked after implementation and fed back into prioritisation?', 'Benefits tracked beyond go-live with owners; lessons inform future investment.'),

  q('DAT', 1, 'Data quality', 'Is the quality of data needed for priority AI use cases measured and fit for purpose?', 'Quality dimensions (accuracy, completeness, timeliness) measured for critical data with remediation plans.'),
  q('DAT', 2, 'Access & integration', 'Can data be accessed and integrated securely across systems for analytics and AI?', 'Governed data platform and APIs give secure, timely access to integrated data.'),
  q('DAT', 3, 'Ownership & stewardship', 'Are data owners and stewards accountable for critical data used by AI?', 'Named owners and stewards for each data domain with decision rights over use in AI.'),
  q('DAT', 4, 'Metadata & lineage', 'Is data catalogued with lineage so that AI inputs can be traced and explained?', 'Enterprise data catalogue with business glossary and lineage for AI training and prompt data.'),
  q('DAT', 5, 'Unstructured data & knowledge', 'Are documents, knowledge bases and records curated and accessible for generative AI (e.g. retrieval-augmented generation)?', 'Authoritative content is current, classified and indexed, with access controls respected by AI tools.'),
  q('DAT', 6, 'Privacy & consent', 'Are privacy, consent and secondary-use obligations understood for data used to train or prompt AI?', 'Privacy impact assessments cover AI; APP obligations and consent conditions are enforced in AI pipelines.'),

  q('TEC', 1, 'Cloud & compute', 'Is there scalable cloud and compute capacity suitable for AI workloads?', 'Secure cloud landing zone with access to AI services and elastic compute within data sovereignty requirements.'),
  q('TEC', 2, 'AI platforms & tooling', 'Are approved enterprise AI platforms and tools available, rather than staff relying on unsanctioned tools?', 'Enterprise AI assistants and model platforms are approved, secured and widely available; shadow AI is low.'),
  q('TEC', 3, 'Integration', 'Can AI services be integrated into core applications and workflows through APIs and events?', 'Reusable integration patterns embed AI into line-of-business systems and workflows.'),
  q('TEC', 4, 'MLOps / LLMOps', 'Are there practices and tooling to deploy, version, evaluate, monitor and retrain models and prompts?', 'Automated pipelines with evaluation suites, versioning, monitoring and rollback for models and prompts.'),
  q('TEC', 5, 'Reference architecture', 'Does enterprise architecture include an AI reference architecture, patterns and standards?', 'Published AI reference architecture and design standards applied through architecture governance.'),
  q('TEC', 6, 'Legacy constraints', 'Is technical debt in core systems low enough not to block AI adoption?', 'Core platforms are modern or have a funded modernisation path; data can be exposed without heavy rework.'),

  q('PPL', 1, 'AI literacy', 'Do staff have baseline AI literacy, including safe and responsible use of generative AI?', 'Mandatory AI literacy training with high completion; staff know what AI can and cannot be used for.'),
  q('PPL', 2, 'Specialist capability', 'Does the organisation have, or can it access, data science, ML engineering, AI product and solution design skills?', 'Core specialist roles in place with partner capacity for peaks; skills mapped to SFIA or similar.'),
  q('PPL', 3, 'Learning pathways', 'Are there structured learning pathways and communities of practice for AI?', 'Role-based learning pathways and an active community of practice sharing patterns and lessons.'),
  q('PPL', 4, 'Workforce impact', 'Is the impact of AI on roles, skills and workforce plans assessed and managed with staff and their representatives?', 'Workforce impact assessments inform strategic workforce plans, redeployment and consultation.'),
  q('PPL', 5, 'Experimentation culture', 'Does the culture support safe experimentation, learning from failure and sharing of AI practice?', 'Sandboxes and time for experimentation; failures are shared openly; leaders role-model AI use.'),
  q('PPL', 6, 'Adoption & trust', 'Do staff trust and actively adopt AI tools, with usage measured?', 'Adoption and satisfaction measured; high sustained usage of approved tools.'),

  q('GOV', 1, 'AI policy', 'Is there an approved AI policy, including generative AI acceptable use, communicated to all staff?', 'Board- or executive-approved AI policy and acceptable-use standard, reviewed at least annually.'),
  q('GOV', 2, 'Accountability', 'Are there clear accountabilities and a governance forum for AI decisions and risk acceptance?', 'AI governance committee with terms of reference; accountable owners for each AI system.'),
  q('GOV', 3, 'AI inventory', 'Is there an inventory of AI systems and use cases, including third-party and embedded AI?', 'Complete, current AI register recording purpose, owner, risk tier, data used and vendor.'),
  q('GOV', 4, 'Impact assessment', 'Are AI impact assessments (ethics, fairness, privacy, safety) conducted before deployment, scaled to risk?', 'Risk-tiered AI impact assessment mandatory before deployment and on material change.'),
  q('GOV', 5, 'Transparency & contestability', 'Are people told when AI is used in decisions or interactions, and can they challenge outcomes?', 'Transparency statements, AI disclosures and a clear contest and review pathway.'),
  q('GOV', 6, 'Human oversight', 'Are human oversight and intervention points designed in, proportional to risk?', 'Documented oversight model per AI system with authority and ability to override or stop.'),

  q('SEC', 1, 'AI security', 'Are AI-specific threats (prompt injection, data leakage, model poisoning) addressed in security architecture and testing?', 'AI threat model, secure configuration, red-teaming and data loss prevention for AI tools.'),
  q('SEC', 2, 'Third-party AI risk', 'Are vendor AI features and models assessed in procurement and third-party risk management (data use, IP, residency)?', 'Contract clauses and due diligence cover AI data use, training on client data, IP, residency and exit.'),
  q('SEC', 3, 'Regulatory compliance', 'Are applicable obligations (privacy, anti-discrimination, consumer, sector regulation, emerging AI rules) mapped for AI use?', 'Obligations register includes AI-relevant obligations with controls and horizon scanning for new regulation.'),
  q('SEC', 4, 'Testing & monitoring', 'Are AI systems tested for accuracy, bias, robustness and drift before and after deployment?', 'Pre-deployment testing against acceptance criteria and continuous monitoring with thresholds and alerts.'),
  q('SEC', 5, 'Incident management', 'Do incident, issue and complaint processes cover AI failures and harms?', 'AI incidents classified, escalated and reported; post-incident reviews improve controls.'),
  q('SEC', 6, 'Records & auditability', 'Are records kept (data, models, decisions and prompts or outputs where appropriate) to support audit and assurance?', 'Retention rules for AI artefacts and logs enable independent audit of AI decisions.'),

  q('OPM', 1, 'AI operating model', 'Is there a defined AI operating model (e.g. centre of excellence, hub-and-spoke) with clear roles between central and business teams?', 'Documented AI operating model with RACI between the enabling hub, business spokes, IT and risk.'),
  q('OPM', 2, 'Delivery lifecycle', 'Is there a repeatable AI delivery lifecycle (discover, experiment, build, deploy, monitor) integrated with portfolio governance?', 'Standard lifecycle with stage gates tied to risk tier and portfolio funding decisions.'),
  q('OPM', 3, 'Partnerships', 'Are strategic partnerships (vendors, integrators, research) in place to accelerate AI capability?', 'Deliberate partner ecosystem with clear roles, knowledge transfer and avoidance of lock-in.'),
  q('OPM', 4, 'Product ownership', 'Do AI solutions have business product owners accountable for outcomes and adoption?', 'Each AI product has a business owner, backlog, adoption targets and a benefits owner.'),
  q('OPM', 5, 'Change & adoption', 'Is change management applied to AI deployments (communications, training, process and role changes)?', 'Structured change management with impact assessments and adoption measures for every AI deployment.'),
  q('OPM', 6, 'AI FinOps', 'Are AI consumption costs (tokens, compute, licences) monitored and optimised?', 'Cost visibility per use case with budgets, alerts and unit-cost optimisation.'),
];

// Readiness levels by average score (1–5). Index = (average − 1) ÷ 4 × 100.
export const AI_LEVELS = [
  { level: 1, name: 'AI Aware', min: 1, description: 'Interest in AI but no strategy, governance or foundations. Experimentation is ad hoc and unsanctioned (shadow) AI use is likely.' },
  { level: 2, name: 'AI Exploring', min: 1.8, description: 'Early pilots and pockets of capability. Foundations such as data, policy, platforms and skills are incomplete, so pilots rarely scale.' },
  { level: 3, name: 'AI Operational', min: 2.6, description: 'Strategy, policy and approved platforms are in place, with a small number of governed use cases in production.' },
  { level: 4, name: 'AI Scaling', min: 3.4, description: 'AI is delivered through a repeatable operating model at scale, benefits are measured and responsible AI practices are embedded.' },
  { level: 5, name: 'AI Transforming', min: 4.2, description: 'AI is core to how the organisation creates value, with continuous innovation and mature, trusted governance.' },
];

// Voluntary AI Safety Standard guardrails (Australian Government, 2024), cross-referenced to
// ISO/IEC 42001 and the NIST AI RMF core functions.
export const GUARDRAILS = [
  { id: 'G01', title: 'Accountability', text: 'Establish, implement and publish an accountability process including governance, internal capability and a strategy for regulatory compliance.', nist: 'Govern', iso: 'Clauses 5 (Leadership) and 6 (Planning)' },
  { id: 'G02', title: 'Risk management', text: 'Establish and implement a risk management process to identify and mitigate risks.', nist: 'Map · Manage', iso: 'Clause 6.1 and 8.2 (AI risk assessment)' },
  { id: 'G03', title: 'Data governance & security', text: 'Protect AI systems, and implement data governance measures to manage data quality and provenance.', nist: 'Manage', iso: 'Annex A.7 (Data for AI systems)' },
  { id: 'G04', title: 'Testing & monitoring', text: 'Test AI models and systems to evaluate model performance and monitor the system once deployed.', nist: 'Measure', iso: 'Annex A.6 (AI system life cycle)' },
  { id: 'G05', title: 'Human oversight', text: 'Enable human control or intervention in an AI system to achieve meaningful human oversight.', nist: 'Manage', iso: 'Annex A.9 (Use of AI systems)' },
  { id: 'G06', title: 'Transparency to users', text: 'Inform end-users regarding AI-enabled decisions, interactions with AI and AI-generated content.', nist: 'Govern · Map', iso: 'Annex A.8 (Information for interested parties)' },
  { id: 'G07', title: 'Contestability', text: 'Establish processes for people impacted by AI systems to challenge use or outcomes.', nist: 'Govern', iso: 'Annex A.8' },
  { id: 'G08', title: 'Supply chain transparency', text: 'Be transparent with other organisations across the AI supply chain about data, models and systems to help them effectively address risks.', nist: 'Govern', iso: 'Annex A.10 (Third-party relationships)' },
  { id: 'G09', title: 'Records', text: 'Keep and maintain records to allow third parties to assess compliance with guardrails.', nist: 'Govern', iso: 'Clause 7.5 (Documented information)' },
  { id: 'G10', title: 'Stakeholder engagement', text: 'Engage stakeholders and evaluate their needs and circumstances, with a focus on safety, diversity, inclusion and fairness.', nist: 'Map', iso: 'Annex A.5 (Assessing impacts of AI systems)' },
];

// Australia's AI Ethics Principles.
export const ETHICS_PRINCIPLES = [
  { id: 'E1', title: 'Human, societal and environmental wellbeing', text: 'AI systems should benefit individuals, society and the environment.' },
  { id: 'E2', title: 'Human-centred values', text: 'AI systems should respect human rights, diversity and the autonomy of individuals.' },
  { id: 'E3', title: 'Fairness', text: 'AI systems should be inclusive and accessible, and should not involve or result in unfair discrimination.' },
  { id: 'E4', title: 'Privacy protection and security', text: 'AI systems should respect and uphold privacy rights and data protection, and ensure the security of data.' },
  { id: 'E5', title: 'Reliability and safety', text: 'AI systems should reliably operate in accordance with their intended purpose.' },
  { id: 'E6', title: 'Transparency and explainability', text: 'There should be transparency and responsible disclosure so people can understand when they are being significantly impacted by AI.' },
  { id: 'E7', title: 'Contestability', text: 'When an AI system significantly impacts a person, community, group or environment, there should be a timely process to allow people to challenge its use or outputs.' },
  { id: 'E8', title: 'Accountability', text: 'People responsible for the different phases of the AI system lifecycle should be identifiable and accountable for its outcomes, and human oversight should be enabled.' },
];

// Actions by pillar, by stage: foundation (average below 2.5), establish (2.5 to 3.5), scale (3.5+).
export const AI_ACTIONS = {
  STR: {
    foundation: ['Agree an AI ambition statement and three to five priority value domains with the executive.', 'Appoint an accountable executive sponsor for AI and define their mandate.', 'Run an AI briefing for the board and executive covering opportunities, risks and oversight duties.'],
    establish: ['Publish an AI strategy linked to corporate objectives, with a multi-year investment envelope.', 'Define an AI value scorecard and baseline measures for priority domains.'],
    scale: ['Embed AI value targets in business unit plans and executive performance agreements.', 'Review the AI strategy annually against market and regulatory developments.'],
  },
  VAL: {
    foundation: ['Run use-case discovery workshops across business units and create a single AI use-case register.', 'Adopt a simple value / feasibility / risk scoring model to select two or three lighthouse pilots.'],
    establish: ['Introduce lightweight AI business cases with baselines and pilot exit criteria.', 'Define the path from pilot to production (funding, security review, support hand-over).'],
    scale: ['Redesign end-to-end processes around AI with human-in-the-loop roles.', 'Track realised AI benefits beyond go-live and recycle savings into the pipeline.'],
  },
  DAT: {
    foundation: ['Identify the critical data domains for priority use cases and appoint data owners.', 'Measure data quality for those domains and start remediation.', 'Complete privacy impact assessments for data proposed for AI use.'],
    establish: ['Stand up a governed data platform with secure access for analytics and AI.', 'Curate and classify authoritative knowledge content for generative AI retrieval.'],
    scale: ['Implement an enterprise data catalogue with lineage for AI inputs.', 'Automate data quality monitoring and privacy controls in AI pipelines.'],
  },
  TEC: {
    foundation: ['Provide an approved, secured enterprise AI assistant to reduce shadow AI.', 'Confirm the cloud landing zone and data residency position for AI services.'],
    establish: ['Publish an AI reference architecture and integration patterns.', 'Introduce evaluation, versioning and monitoring (MLOps / LLMOps) for models and prompts.'],
    scale: ['Build a reusable AI platform (models, retrieval, guardrails, observability) for rapid delivery.', 'Prioritise modernisation of legacy systems that block AI adoption.'],
  },
  PPL: {
    foundation: ['Launch mandatory AI literacy and safe-use training for all staff.', 'Assess current specialist AI skills and gaps against SFIA or a similar framework.'],
    establish: ['Create role-based AI learning pathways and a community of practice.', 'Assess workforce impacts of priority use cases and consult staff and their representatives.'],
    scale: ['Integrate AI skills into strategic workforce planning, recruitment and reward.', 'Measure adoption and trust, and redesign roles with staff participation.'],
  },
  GOV: {
    foundation: ['Approve an AI policy and generative AI acceptable-use standard.', 'Create an inventory of AI systems in use, including vendor-embedded AI.', 'Establish an AI governance forum with clear decision rights and risk acceptance.'],
    establish: ['Introduce a risk-tiered AI impact assessment before deployment.', 'Publish an AI transparency statement and define contest and review pathways.'],
    scale: ['Embed responsible AI checks into the delivery lifecycle and assurance program.', 'Seek independent assessment against ISO/IEC 42001 or equivalent.'],
  },
  SEC: {
    foundation: ['Add AI threats (prompt injection, data leakage) to the security threat model.', 'Update procurement and third-party risk questionnaires for AI features and data use.', 'Map AI-relevant obligations into the obligations register.'],
    establish: ['Define pre-deployment testing standards for accuracy, bias and robustness.', 'Extend incident and complaint management to cover AI failures and harms.'],
    scale: ['Implement continuous monitoring for drift, bias and misuse with alert thresholds.', 'Red-team high-risk AI systems and commission independent assurance.'],
  },
  OPM: {
    foundation: ['Define an initial AI operating model: a small enabling hub with business champions.', 'Agree a standard AI delivery lifecycle with stage gates proportional to risk.'],
    establish: ['Assign business product owners to every AI solution with adoption targets.', 'Apply structured change management to each AI deployment.'],
    scale: ['Evolve to a hub-and-spoke model with capability embedded in business teams.', 'Introduce AI FinOps: unit-cost visibility, budgets and optimisation.'],
  },
};
