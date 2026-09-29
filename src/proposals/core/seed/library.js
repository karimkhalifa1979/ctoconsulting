// Seed content library for the demo. All clients, people and figures are fictitious.

export const CASE_STUDIES = [
  {
    key: 'CS-001', title: 'Azure migration and data centre exit for a regional water utility', client: 'Murray Basin Water', sector: 'Water and utilities',
    services: ['Cloud migration', 'Cyber security'], technologies: ['Microsoft Azure', 'Microsoft Entra ID', 'Terraform'], value: 2400000, start: '2023-02-01', end: '2024-01-31',
    consent: 'yes', confidential: false, referee: 'Chief Information Officer, Murray Basin Water',
    anonymised: 'A regional water utility',
    summary: 'Murray Basin Water needed to exit an end-of-life data centre within 12 months while keeping water treatment and customer billing systems running. CTO Consulting planned and delivered the migration of 142 workloads to an Azure landing zone aligned with the ASD Information Security Manual.',
    challenge: 'The utility ran 142 workloads across two ageing data centres, with a lease expiry that could not be extended and a small internal ICT team.',
    approach: 'We ran a six-week discovery, grouped workloads into 11 migration waves by business criticality and dependency, built an ISM-aligned landing zone with infrastructure as code, and ran cut-overs outside operational peaks with a rehearsed rollback plan for every wave.',
    outcomes: ['142 workloads migrated in 11 months', 'Primary data centre exited three months before lease expiry', 'Hosting costs reduced by 31% in the first year', 'No priority 1 incidents during any cut-over', 'Internal team certified in Azure administration before handover'],
  },
  {
    key: 'CS-002', title: 'Essential Eight uplift to Maturity Level 2 for a state government department', client: 'Department of Regional Transport', sector: 'State government',
    services: ['Cyber security', 'Governance and assurance'], technologies: ['Microsoft Intune', 'Microsoft Defender', 'Application control'], value: 1350000, start: '2024-03-01', end: '2024-12-15',
    consent: 'no', confidential: true, referee: 'Chief Information Security Officer',
    anonymised: 'A New South Wales Government department',
    summary: 'The department was assessed at Essential Eight Maturity Level 1 and had nine months to reach Maturity Level 2 before an audit committee deadline. CTO Consulting led the uplift program across 4,800 endpoints and 310 servers.',
    challenge: 'Application control, patching and privileged access were assessed at Maturity Level 0 or 1, and prior uplift attempts had stalled on business resistance.',
    approach: 'We prioritised mitigation strategies by risk reduction per dollar, piloted application control with volunteer business units, automated patch compliance reporting, and embedded a security champion in each division.',
    outcomes: ['Maturity Level 2 achieved across all eight mitigation strategies in nine months', 'Privileged accounts reduced by 64%', 'Application control enforced on 4,800 endpoints', 'Patch compliance for critical vulnerabilities within 48 hours improved from 38% to 96%'],
  },
  {
    key: 'CS-003', title: 'Secure cloud landing zone for a superannuation fund', client: 'Kestrel Superannuation', sector: 'Financial services',
    services: ['Cloud migration', 'Cyber security', 'Architecture'], technologies: ['AWS', 'AWS Control Tower', 'Terraform', 'Okta'], value: 980000, start: '2024-06-01', end: '2025-02-28',
    consent: 'yes', confidential: false, referee: 'Head of Technology, Kestrel Superannuation',
    anonymised: 'An Australian superannuation fund',
    summary: 'Kestrel Superannuation engaged CTO Consulting to design and build a multi-account AWS landing zone that met APRA CPS 234 expectations before migrating member-facing systems.',
    challenge: 'The fund needed a landing zone that satisfied APRA prudential standards and could be operated by a two-person platform team.',
    approach: 'We designed a multi-account structure with preventive and detective guardrails, mapped every control to CPS 234 and the ISM, and handed over with runbooks and pairing sessions.',
    outcomes: ['Landing zone approved by the fund’s risk committee at first review', '100% of guardrails mapped to CPS 234 control objectives', 'Environment provisioning time reduced from three weeks to two hours'],
  },
  {
    key: 'CS-004', title: 'Digital customer portal for a metropolitan council', client: 'Harbourside City Council', sector: 'Local government',
    services: ['Digital services', 'Service design'], technologies: ['Salesforce Experience Cloud', 'Microsoft Entra External ID'], value: 760000, start: '2023-08-01', end: '2024-05-31',
    consent: 'yes', confidential: false, referee: 'Director Customer Experience, Harbourside City Council',
    anonymised: 'A metropolitan council',
    summary: 'Harbourside City Council wanted residents to lodge and track requests online rather than by phone. CTO Consulting led service design and delivery of a customer portal integrated with the council’s CRM.',
    challenge: 'Two thirds of 180,000 annual customer requests arrived by phone, and residents could not see the status of their requests.',
    approach: 'We ran co-design sessions with 120 residents, including people with disability, delivered in fortnightly releases, and tested every release against WCAG 2.2 AA.',
    outcomes: ['47% of requests lodged online within six months of launch', 'Call centre volumes reduced by 22%', 'WCAG 2.2 AA conformance confirmed by independent audit', 'Resident satisfaction with request handling rose from 61% to 78%'],
  },
  {
    key: 'CS-005', title: 'Records modernisation discovery for a Commonwealth regulator', client: 'National Professional Standards Board', sector: 'Commonwealth government',
    services: ['Architecture', 'Business case', 'Records management'], technologies: ['Microsoft 365', 'Azure'], value: 540000, start: '2025-02-01', end: '2025-07-31',
    consent: 'pending', confidential: true, referee: 'Chief Operating Officer',
    anonymised: 'A Commonwealth regulator',
    summary: 'A Commonwealth regulator engaged CTO Consulting to assess three legacy registry systems and prepare a business case for a consolidated records platform.',
    challenge: 'Registry data was split across three systems with inconsistent identifiers, and the regulator needed a business case aligned with the Digital Investment Framework.',
    approach: 'We profiled 38 million records, interviewed 46 stakeholders, designed a target-state architecture aligned with the PSPF and ISM, and prepared a first-pass business case.',
    outcomes: ['Business case approved for second-pass funding', 'Data quality issues quantified across 38 million records', 'Target-state architecture endorsed by the regulator’s architecture review board'],
  },
  {
    key: 'CS-006', title: 'Data and AI governance framework for a health service', client: 'Northbridge Health Service', sector: 'Health',
    services: ['Data and AI', 'Governance and assurance'], technologies: ['Microsoft Purview', 'Azure Machine Learning'], value: 420000, start: '2025-04-01', end: '2025-10-31',
    consent: 'yes', confidential: false, referee: 'Chief Data Officer, Northbridge Health Service',
    anonymised: 'A Queensland health service',
    summary: 'Northbridge Health Service needed a governance framework before scaling clinical AI pilots. CTO Consulting designed a data and AI governance framework aligned with the Australian Government’s AI ethics principles.',
    challenge: 'Twelve AI pilots were running without consistent risk assessment, and clinicians were unsure which data could be used for model training.',
    approach: 'We established an AI review board, a risk-tiered assessment process and data classification rules, and trained 60 data custodians.',
    outcomes: ['All 12 AI pilots assessed and risk-rated within four months', 'Data classification applied to 94% of clinical data assets', '60 data custodians trained and accredited'],
  },
  {
    key: 'CS-007', title: 'Cloud ERP program assurance for an energy distributor', client: 'Coral Coast Energy', sector: 'Energy and utilities',
    services: ['Program assurance', 'Governance and assurance'], technologies: ['SAP S/4HANA', 'Microsoft Azure'], value: 1100000, start: '2024-01-15', end: '2025-06-30',
    consent: 'no', confidential: true, referee: 'Program Sponsor',
    anonymised: 'A Queensland energy distributor',
    summary: 'CTO Consulting provided independent assurance over an 18-month migration to cloud ERP, reporting to the program board and the audit and risk committee.',
    challenge: 'The program was three months behind schedule with unclear accountability between the systems integrator and the business.',
    approach: 'We ran quarterly health checks, a go-live readiness assessment and a benefits realisation review, and coached the program management office.',
    outcomes: ['Go-live achieved on the re-baselined date with no critical defects', '37 assurance recommendations accepted and closed', 'Benefits tracking established for $14 million of annual benefits'],
  },
  {
    key: 'CS-008', title: 'Change management and capability uplift for a university IT transformation', client: 'Meridian University', sector: 'Education',
    services: ['Change management', 'Digital transformation'], technologies: ['ServiceNow', 'Microsoft 365'], value: 610000, start: '2024-09-01', end: '2025-08-31',
    consent: 'yes', confidential: false, referee: 'Chief Digital Officer, Meridian University',
    anonymised: 'An Australian university',
    summary: 'Meridian University restructured its IT function into product teams. CTO Consulting led organisational change management and uplifted the capability of 180 staff.',
    challenge: 'Staff engagement in the IT division had fallen to 48% and new operating model roles required skills the team did not yet have.',
    approach: 'We used a structured change method with a network of 30 change champions, role-based learning pathways and monthly pulse surveys.',
    outcomes: ['Staff engagement rose from 48% to 71% within a year', '180 staff completed role-based learning pathways', 'Service desk first-contact resolution improved from 54% to 69%'],
  },
  {
    key: 'CS-009', title: 'Cyber incident response retainer for a freight and logistics group', client: 'Tasman Freight Group', sector: 'Transport and logistics',
    services: ['Cyber security', 'Incident response'], technologies: ['Microsoft Sentinel', 'CrowdStrike'], value: 360000, start: '2025-01-01', end: '2025-12-31',
    consent: 'no', confidential: true, referee: 'Group Chief Information Officer',
    anonymised: 'A national freight and logistics group',
    summary: 'CTO Consulting provides a 24/7 cyber incident response retainer, playbooks and quarterly exercises for a national freight group.',
    challenge: 'The group had no tested incident response plan and relied on a single internal security analyst.',
    approach: 'We wrote incident playbooks, ran tabletop exercises with the executive team and provided on-call responders with a one-hour response commitment.',
    outcomes: ['Three live incidents contained within the one-hour response commitment', 'Four executive tabletop exercises completed', 'Mean time to contain reduced from 19 hours to 3 hours'],
  },
  {
    key: 'CS-010', title: 'Enterprise architecture roadmap for a state skills regulator', client: 'Department of Community Futures', sector: 'State government',
    services: ['Architecture', 'Digital transformation'], technologies: ['Microsoft Azure', 'Dynamics 365'], value: 290000, start: '2025-05-01', end: '2025-09-30',
    consent: 'yes', confidential: false, referee: 'Chief Information Officer, Department of Community Futures',
    anonymised: 'A Western Australian Government department',
    summary: 'CTO Consulting developed a three-year enterprise architecture roadmap and investment plan for a skills regulator.',
    challenge: 'The department had 64 applications with overlapping functions and no agreed target state.',
    approach: 'We baselined the application portfolio, defined capability-based target states and sequenced 14 initiatives into a funded roadmap.',
    outcomes: ['Application portfolio reduction of 30% planned over three years', 'Roadmap endorsed by the executive board', 'First two initiatives funded in the next budget cycle'],
  },
];

const P = (...lines) => lines.map((l) => (l.startsWith('<') ? l : `<p>${l}</p>`)).join('');
const UL = (...items) => `<ul>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ul>`;

export const STANDARD_ANSWERS = [
  {
    key: 'SA-001', title: 'Company overview', topic: 'Company overview', variants: ['Describe your organisation', 'Company profile', 'About the respondent', 'organisation size locations services'],
    body: P(
      'CTO Consulting is an Australian-owned digital transformation and technology advisory firm. We help government agencies and regulated organisations plan, deliver and assure complex technology change.',
      'Founded in 2011, we employ 140 consultants across offices in Sydney, Canberra, Melbourne and Brisbane. Our core services are digital strategy and architecture, cloud migration, cyber security, data and AI, program delivery and assurance, and organisational change management.',
      'More than 70% of our work is for Australian Government and state government clients. We hold places on the BuyICT Digital Marketplace Panel 2 and the NSW ICT Services Scheme.',
    ),
  },
  {
    key: 'SA-002', title: 'Quality management', topic: 'Quality', variants: ['quality management system', 'quality assurance', 'ISO 9001 certification'],
    body: P(
      'CTO Consulting operates a quality management system certified to ISO 9001:2015. Every engagement has an independent quality reviewer who is not part of the delivery team.',
      'Deliverables pass a two-stage review before release: a peer review for technical accuracy and a director review for client fit and clarity. We measure client satisfaction at the close of every engagement and report the results to our leadership team each quarter.',
    ),
  },
  {
    key: 'SA-003', title: 'Information security', topic: 'Security', variants: ['information security', 'protect client information', 'ISO 27001', 'security certifications'],
    body: P(
      'CTO Consulting holds ISO/IEC 27001:2022 certification for its information security management system, covering all offices and consulting services.',
      'Client information is stored only in Australian-hosted systems, with multi-factor authentication, device encryption and application control enforced on every staff device. We assess ourselves annually against the Essential Eight and currently operate at Maturity Level 2 across all eight strategies.',
      'Staff complete security awareness training on induction and every year, and all consultants working on government engagements hold or are eligible for an Australian Government security clearance.',
    ),
  },
  {
    key: 'SA-004', title: 'Work health and safety', topic: 'WHS', variants: ['work health and safety', 'WHS management system', 'safety'],
    body: P(
      'Our work health and safety management system is aligned with ISO 45001 and the Work Health and Safety Act 2011. It includes hazard identification, incident reporting and a quarterly WHS committee with staff representatives.',
      'Consultants working at client sites complete the client’s site induction and follow the client’s safety procedures. We have recorded no lost-time injuries in the past five years.',
    ),
  },
  {
    key: 'SA-005', title: 'Insurance', topic: 'Insurance', variants: ['professional indemnity', 'public liability', 'insurance details', 'workers compensation'],
    body: P(
      'CTO Consulting holds professional indemnity insurance of $20 million per claim and in the aggregate, public liability insurance of $20 million per occurrence, and workers compensation insurance as required in each state and territory.',
      'Certificates of currency are available on request and are renewed on 30 June each year.',
    ),
  },
  {
    key: 'SA-006', title: 'Modern slavery', topic: 'Modern slavery', variants: ['modern slavery risks', 'supply chain', 'human rights'],
    body: P(
      'CTO Consulting supports the objectives of the Modern Slavery Act 2018 (Cth). Our supplier code of conduct prohibits forced labour, and we assess the modern slavery risk of every new supplier.',
      'Our supply chain is low risk: it consists mainly of Australian professional services firms and software vendors. We review high-spend suppliers each year and train procurement staff to recognise modern slavery indicators.',
    ),
  },
  {
    key: 'SA-007', title: 'Conflicts of interest', topic: 'Conflicts of interest', variants: ['conflict of interest', 'manage conflicts', 'independence'],
    body: P(
      'Every new engagement passes a conflict check against our client and engagement register before we accept it. Partners must declare personal and commercial interests each year.',
      'Where a potential conflict exists, we put an ethical wall in place: affected staff are excluded from the engagement and its information systems, and the wall is recorded in our conflicts register. We will notify the client promptly if a conflict arises during the engagement.',
    ),
  },
  {
    key: 'SA-008', title: 'Privacy and personal information', topic: 'Privacy', variants: ['privacy', 'personal information', 'Privacy Act', 'Australian Privacy Principles'],
    body: P(
      'CTO Consulting complies with the Privacy Act 1988 and the Australian Privacy Principles. We collect only the personal information needed for an engagement, store it in Australia and delete it when the engagement ends unless the client directs otherwise.',
      'We complete a privacy impact assessment for any engagement that changes how a client handles personal information, and our data breach response plan meets the requirements of the Notifiable Data Breaches scheme.',
    ),
  },
  {
    key: 'SA-009', title: 'Environmental, social and governance commitments', topic: 'ESG', variants: ['environmental social governance', 'sustainability', 'ESG commitments', 'climate'],
    body: P(
      'CTO Consulting has been certified carbon neutral under Climate Active since 2023. We report our emissions each year and have committed to a 50% reduction in Scope 1 and 2 emissions by 2030.',
      'Our social commitments include a Reconciliation Action Plan, pro bono technology advice for community organisations and a target of 40% women in leadership roles, which we currently exceed at 43%.',
    ),
  },
  {
    key: 'SA-010', title: 'Digital accessibility', topic: 'Accessibility', variants: ['accessibility', 'WCAG', 'inclusive design', 'people with disability'],
    body: P(
      'We design and test digital services to meet WCAG 2.2 Level AA. Our service designers include people with lived experience of disability in research and usability testing.',
      'Accessibility is part of our definition of done: every release is tested with automated tools and manually with screen readers and keyboard-only navigation before it goes live.',
    ),
  },
  {
    key: 'SA-011', title: 'Aboriginal and Torres Strait Islander participation', topic: 'Indigenous participation', variants: ['Aboriginal', 'Torres Strait Islander', 'Indigenous business', 'Supply Nation'],
    body: P(
      'CTO Consulting has a formal partnership with Yarran Digital, a Supply Nation certified Aboriginal-owned technology consultancy. Yarran Digital consultants work within our delivery teams on cloud, data and cyber engagements.',
      'On engagements over $500,000 we commit to at least 5% of contract value being delivered by Aboriginal and Torres Strait Islander businesses.',
    ),
  },
  {
    key: 'SA-012', title: 'Security clearances', topic: 'Security clearances', variants: ['security clearance', 'Baseline', 'NV1', 'personnel vetting'],
    body: P(
      'Of our 140 consultants, 96 hold a current Australian Government security clearance: 58 at Baseline, 32 at Negative Vetting Level 1 and 6 at Negative Vetting Level 2.',
      'We sponsor clearances for consultants proposed for government engagements and track clearance expiry centrally. Personnel without a current clearance do not access client systems until the clearance is granted.',
    ),
  },
  {
    key: 'SA-013', title: 'Knowledge transfer and transition to operations', topic: 'Knowledge transfer', variants: ['knowledge transfer', 'transition plan', 'handover', 'capability uplift'],
    body: P(
      'We plan knowledge transfer from the first week of an engagement rather than at the end. Each deliverable has a named client owner who works alongside our consultants.',
      'Before handover we run structured shadowing, reverse shadowing and hypercare periods, and we measure readiness against an agreed operational acceptance checklist.',
    ),
  },
  {
    key: 'SA-014', title: 'Business continuity', topic: 'Business continuity', variants: ['business continuity', 'disaster recovery', 'continuity of service'],
    body: P(
      'Our business continuity plan is tested twice a year. All consulting systems are cloud hosted in Australian regions with geographic redundancy, so staff can work securely from any location.',
      'For every engagement we name a backup for each key person, so the loss of one consultant does not interrupt delivery.',
    ),
  },
];

export const METHODS = [
  {
    key: 'MT-001', title: 'CTO Cloud Migration Framework', offering: 'Cloud migration', phases: ['Discover', 'Plan', 'Build landing zone', 'Migrate in waves', 'Optimise'],
    deliverables: ['Application and dependency inventory', 'Migration wave plan', 'Landing zone design and build', 'Cut-over runbooks', 'Cost optimisation report'],
    body: P(
      'Our cloud migration framework moves workloads in waves sequenced by business criticality, dependencies and contractual exit dates. Every workload is assigned one of six treatments: retire, retain, rehost, replatform, refactor or replace.',
      '<h3>Discover and plan</h3>',
      'We build a complete application and dependency inventory using automated discovery tools and interviews with application owners. The migration wave plan groups workloads so that each wave can be cut over and rolled back independently.',
      '<h3>Landing zone</h3>',
      'We build the landing zone as infrastructure as code, with identity, network segmentation, logging and guardrails in place before the first workload moves. Controls are mapped to the ASD Information Security Manual and the Essential Eight.',
      '<h3>Migrate and optimise</h3>',
      'Each wave follows a rehearsed cut-over runbook with go/no-go criteria and a tested rollback plan. After migration we right-size resources and apply reserved capacity, which typically reduces running costs by 20% to 35%.',
    ),
  },
  {
    key: 'MT-002', title: 'Essential Eight Uplift Method', offering: 'Cyber security', phases: ['Assess', 'Prioritise', 'Implement', 'Evidence', 'Sustain'],
    deliverables: ['Maturity assessment', 'Uplift roadmap', 'Implementation runbooks', 'Evidence pack', 'Sustainment model'],
    body: P(
      'Our Essential Eight uplift method takes organisations to a target maturity level with evidence an auditor will accept.',
      'We start with an assessment against the ASD Essential Eight Maturity Model, using technical testing rather than interviews alone. We then prioritise mitigation strategies by risk reduction and business impact, and implement changes in controlled pilots before rolling them out.',
      'For every mitigation strategy we produce an evidence pack that maps each maturity requirement to configuration, test results and screenshots. A sustainment model with monthly compliance reporting keeps the organisation at its target maturity after we leave.',
    ),
  },
  {
    key: 'MT-003', title: 'Digital Transformation Roadmap method', offering: 'Digital strategy', phases: ['Baseline', 'Target state', 'Options', 'Roadmap', 'Business case'],
    deliverables: ['Current-state baseline', 'Target-state architecture', 'Options analysis', 'Sequenced roadmap', 'Business case'],
    body: P(
      'Our roadmap method links technology investment to measurable business outcomes. We baseline current capabilities, define a capability-based target state and assess options against cost, risk and benefit.',
      'The roadmap sequences initiatives by dependency and value, and the business case follows the Department of Finance Digital Investment Framework or the client’s own investment framework.',
    ),
  },
  {
    key: 'MT-004', title: 'Data and AI Governance method', offering: 'Data and AI', phases: ['Assess', 'Design', 'Establish', 'Operate'],
    deliverables: ['Governance framework', 'AI risk assessment process', 'Data classification rules', 'Custodian training'],
    body: P(
      'Our data and AI governance method establishes clear accountability for data and AI use. It aligns with Australia’s AI Ethics Principles and the Policy for the responsible use of AI in government.',
      'We define decision rights, a risk-tiered assessment for AI use cases, data classification and handling rules, and a review board that meets monthly. Data custodians are trained and accredited before the framework goes live.',
    ),
  },
  {
    key: 'MT-005', title: 'Agile Delivery Framework', offering: 'Program delivery', phases: ['Inception', 'Delivery sprints', 'Release', 'Review'],
    deliverables: ['Delivery plan', 'Product backlog', 'Sprint reports', 'Release notes'],
    body: P(
      'We deliver in two-week sprints with a prioritised backlog owned by the client’s product owner. Every sprint ends with a demonstration of working software and a retrospective.',
      'Program governance uses a monthly steering committee, a risk and issue register reviewed weekly, and burn-up reporting that shows progress against scope and budget.',
    ),
  },
  {
    key: 'MT-006', title: 'Change and Capability Uplift method', offering: 'Change management', phases: ['Impact assessment', 'Change plan', 'Champion network', 'Learning pathways', 'Reinforce'],
    deliverables: ['Change impact assessment', 'Stakeholder and communications plan', 'Champion network', 'Learning pathways', 'Adoption dashboard'],
    body: P(
      'Our change method treats adoption as a measurable outcome. We assess the impact of change on each team, build a network of change champions and design role-based learning pathways.',
      'Monthly pulse surveys and an adoption dashboard show whether people are using new systems and ways of working, so we can act early where adoption lags.',
    ),
  },
  {
    key: 'MT-007', title: 'Benefits realisation approach', offering: 'Program delivery', phases: ['Define', 'Baseline', 'Track', 'Realise'],
    deliverables: ['Benefits map', 'Benefit profiles', 'Benefits register', 'Realisation reports'],
    body: P(
      'We define benefits at the start of a program and trace each one to the initiatives that deliver it. Each benefit has an owner, a measure, a baseline and a target date.',
      'Benefits are reported to the steering committee every month, and a post-implementation review confirms which benefits were realised and what corrective action is needed.',
    ),
  },
];

export const EVIDENCE = [
  { key: 'EV-001', title: 'ABN registration', issuer: 'Australian Business Register', expiry: null, body: P('CTO Consulting Pty Ltd, ABN 00 123 456 789 (demonstration record), registered for GST since 2011.') },
  { key: 'EV-002', title: 'Certificate of currency: professional indemnity insurance', issuer: 'Demonstration Insurer Pty Ltd', expiry: '2027-06-30', body: P('Professional indemnity insurance of $20 million per claim and in the aggregate, valid to 30 June 2027.') },
  { key: 'EV-003', title: 'Certificate of currency: public liability insurance', issuer: 'Demonstration Insurer Pty Ltd', expiry: '2027-06-30', body: P('Public liability insurance of $20 million per occurrence, valid to 30 June 2027.') },
  { key: 'EV-004', title: 'ISO/IEC 27001:2022 certificate', issuer: 'Demonstration Certification Body', expiry: '2027-03-31', body: P('Certification of CTO Consulting’s information security management system to ISO/IEC 27001:2022, covering all offices and consulting services, valid to 31 March 2027.') },
  { key: 'EV-005', title: 'ISO 9001:2015 certificate', issuer: 'Demonstration Certification Body', expiry: '2026-10-31', body: P('Certification of CTO Consulting’s quality management system to ISO 9001:2015, valid to 31 October 2026. Recertification audit scheduled for October 2026.') },
  { key: 'EV-006', title: 'Audited financial statements FY2025', issuer: 'CTO Consulting', expiry: '2026-12-31', body: P('Audited financial statements for the year ended 30 June 2025, showing revenue of $41.2 million and net assets of $9.8 million.') },
  { key: 'EV-007', title: 'BuyICT Digital Marketplace Panel 2 membership', issuer: 'Digital Transformation Agency', expiry: '2028-06-30', body: P('Panel membership for the BuyICT Digital Marketplace Panel 2 across strategy, cloud, cyber, data and delivery categories.') },
  { key: 'EV-008', title: 'Workers compensation certificate', issuer: 'State insurers', expiry: '2026-11-15', body: P('Workers compensation cover in every state and territory where CTO Consulting employs staff.') },
];

export const PAST_PROPOSALS = [
  { key: 'PP-001', title: 'Proposal: Azure migration program (Murray Basin Water)', client: 'Murray Basin Water', outcome: 'won', value: 2400000, feedback: 'Strongest migration methodology and a credible wave plan. Team experience with utilities was a differentiator.' },
  { key: 'PP-002', title: 'Proposal: Cyber uplift services (Department of Regional Transport)', client: 'Department of Regional Transport', outcome: 'won', value: 1350000, feedback: 'Clear evidence approach for Essential Eight maturity. Pricing was competitive.' },
  { key: 'PP-003', title: 'Proposal: Enterprise service management (Meridian University)', client: 'Meridian University', outcome: 'lost', value: 1800000, feedback: 'Well written, but the incumbent’s platform experience scored higher. Price was 12% above the preferred respondent.' },
  { key: 'PP-004', title: 'Proposal: Data platform build (Northbridge Health Service)', client: 'Northbridge Health Service', outcome: 'lost', value: 2100000, feedback: 'Strong governance content. Evaluators wanted more hands-on engineering experience in the team.' },
];

// Consultant profiles. Cost rates are internal and restricted to partners, commercial approvers and administrators.
export const CONSULTANTS = [
  { key: 'daniel', name: 'Daniel Whitford', role: 'Partner, Digital Government', level: 'Partner', skills: ['Digital strategy', 'Program leadership', 'Government relations'], certs: ['GAICD', 'MSP Practitioner'], clearance: 'NV1', sectors: ['Commonwealth government', 'State government'], years: 24, cost: 1650, bio: 'Daniel leads CTO Consulting’s digital government practice. He has 24 years of experience leading transformation programs for Commonwealth and state agencies, including three whole-of-agency digital strategies.' },
  { key: 'helen', name: 'Helen Okafor', role: 'Partner, Cyber and Risk', level: 'Partner', skills: ['Cyber security strategy', 'Essential Eight', 'Risk management'], certs: ['CISSP', 'CISM', 'IRAP Assessor'], clearance: 'NV2', sectors: ['State government', 'Financial services', 'Energy and utilities'], years: 21, cost: 1650, bio: 'Helen leads CTO Consulting’s cyber and risk practice. She is an IRAP assessor and has led Essential Eight uplift programs for 11 government and critical infrastructure organisations.' },
  { key: 'marcus', name: 'Marcus Lee', role: 'Principal Consultant, Cloud', level: 'Principal Consultant', skills: ['Cloud migration', 'Microsoft Azure', 'AWS', 'Landing zones', 'Terraform'], certs: ['Azure Solutions Architect Expert', 'AWS Solutions Architect Professional'], clearance: 'Baseline', sectors: ['Water and utilities', 'Financial services', 'State government'], years: 16, cost: 1180, bio: 'Marcus is a cloud architect with 16 years of experience. He led the Azure migration and data centre exit for Murray Basin Water and designed the AWS landing zone for Kestrel Superannuation.' },
  { key: 'aisha', name: 'Aisha Patel', role: 'Senior Consultant, Cyber Security', level: 'Senior Consultant', skills: ['Essential Eight', 'Microsoft Defender', 'Application control', 'Incident response'], certs: ['OSCP', 'Microsoft Cybersecurity Architect'], clearance: 'NV1', sectors: ['State government', 'Transport and logistics'], years: 9, cost: 880, bio: 'Aisha is a cyber security engineer who implemented application control across 4,800 endpoints for a NSW Government department and runs incident response exercises for critical infrastructure clients.' },
  { key: 'tom', name: 'Tom Gallagher', role: 'Director, Quality and Assurance', level: 'Director', skills: ['Program assurance', 'Quality review', 'Benefits realisation'], certs: ['PMP', 'Gateway Reviewer'], clearance: 'Baseline', sectors: ['Energy and utilities', 'Health', 'State government'], years: 20, cost: 1420, bio: 'Tom leads quality and independent assurance at CTO Consulting. He is an accredited Gateway reviewer and led assurance of a cloud ERP program for an energy distributor.' },
  { key: 'chen', name: 'Chen Wei', role: 'Principal Consultant, Data and AI', level: 'Principal Consultant', skills: ['Data governance', 'AI governance', 'Microsoft Purview', 'Analytics'], certs: ['CDMP', 'Azure Data Engineer'], clearance: 'Baseline', sectors: ['Health', 'Financial services'], years: 14, cost: 1180, bio: 'Chen designs data and AI governance frameworks. He led the AI governance framework for Northbridge Health Service and advises on responsible AI in government.' },
  { key: 'liam', name: 'Liam O’Connor', role: 'Consultant, Data Engineering', level: 'Consultant', skills: ['Data engineering', 'Azure Data Factory', 'Power BI', 'Data migration'], certs: ['Azure Data Engineer'], clearance: 'Baseline', sectors: ['Water and utilities', 'Education'], years: 5, cost: 690, bio: 'Liam is a data engineer who builds data pipelines and reporting on Azure. He supported data migration for Murray Basin Water.' },
  { key: 'ethan', name: 'Ethan Brooks', role: 'Senior Consultant, Architecture', level: 'Senior Consultant', skills: ['Enterprise architecture', 'TOGAF', 'Integration', 'Business case'], certs: ['TOGAF 10'], clearance: 'NV1', sectors: ['Commonwealth government', 'Transport and logistics'], years: 11, cost: 880, bio: 'Ethan is an enterprise architect who developed the architecture roadmap for the Department of Community Futures and target-state designs for Commonwealth registries.' },
  { key: 'grace', name: 'Grace Nguyen', role: 'Analyst, Digital Services', level: 'Analyst', skills: ['Service design', 'User research', 'Accessibility testing'], certs: ['CPACC'], clearance: 'Baseline', sectors: ['Local government', 'Education'], years: 3, cost: 520, bio: 'Grace is a service designer and accessibility tester who ran co-design sessions with 120 residents for Harbourside City Council.' },
  { key: 'oliver', name: 'Oliver Hughes', role: 'Senior Consultant, Change Management', level: 'Senior Consultant', skills: ['Change management', 'Training design', 'Stakeholder engagement'], certs: ['Prosci Certified', 'CCMP'], clearance: 'None', sectors: ['Education', 'Water and utilities'], years: 10, cost: 860, bio: 'Oliver leads organisational change. He led change management for the Meridian University IT transformation, lifting staff engagement from 48% to 71%.' },
  { key: 'zara', name: 'Zara Ahmed', role: 'Principal Consultant, Architecture', level: 'Principal Consultant', skills: ['Solution architecture', 'Records management', 'Microsoft 365', 'PSPF'], certs: ['TOGAF 10', 'Microsoft 365 Enterprise Administrator'], clearance: 'NV1', sectors: ['Commonwealth government', 'State government'], years: 15, cost: 1180, bio: 'Zara is a solution architect specialising in records and registry platforms. She led the target-state architecture for a Commonwealth regulator’s records modernisation.' },
  { key: 'ben', name: 'Ben Carter', role: 'Consultant, Delivery', level: 'Consultant', skills: ['Project management', 'Agile delivery', 'Jira'], certs: ['PRINCE2 Practitioner', 'Professional Scrum Master'], clearance: 'Baseline', sectors: ['Local government', 'State government'], years: 6, cost: 700, bio: 'Ben is a delivery lead who ran fortnightly releases for the Harbourside City Council customer portal.' },
  { key: 'mia', name: 'Mia Robinson', role: 'Senior Consultant, Business Analysis', level: 'Senior Consultant', skills: ['Business analysis', 'Process design', 'Requirements'], certs: ['CBAP'], clearance: 'Baseline', sectors: ['Health', 'Financial services'], years: 8, cost: 840, bio: 'Mia is a business analyst experienced in health and financial services process redesign.' },
  { key: 'sam', name: 'Sam Taylor', role: 'Principal Consultant, Program Delivery', level: 'Principal Consultant', skills: ['Program management', 'Cloud migration', 'Vendor management', 'Benefits realisation'], certs: ['MSP Practitioner', 'PMP'], clearance: 'Baseline', sectors: ['Water and utilities', 'Energy and utilities'], years: 18, cost: 1180, bio: 'Sam is a program director with 18 years of experience, including 12 years delivering cloud migration programs for utilities and government. Sam led delivery of the Murray Basin Water data centre exit.' },
];

export const TAXONOMY = {
  sectors: ['Commonwealth government', 'State government', 'Local government', 'Water and utilities', 'Energy and utilities', 'Health', 'Education', 'Financial services', 'Transport and logistics'],
  offerings: ['Digital strategy', 'Cloud migration', 'Cyber security', 'Data and AI', 'Program delivery', 'Program assurance', 'Change management', 'Architecture', 'Digital services'],
  technologies: ['Microsoft Azure', 'AWS', 'Microsoft 365', 'Microsoft Entra ID', 'Microsoft Defender', 'Microsoft Intune', 'Microsoft Purview', 'Microsoft Sentinel', 'Terraform', 'SAP S/4HANA', 'Salesforce', 'ServiceNow', 'Dynamics 365', 'Power BI', 'Okta', 'CrowdStrike'],
  capabilities: ['Essential Eight', 'ISM alignment', 'Landing zones', 'Business case', 'Service design', 'Accessibility', 'Benefits realisation', 'Incident response', 'Records management', 'AI governance', 'Knowledge transfer'],
  regions: ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT', 'National'],
};
