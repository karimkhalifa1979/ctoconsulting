// Reference content for target operating model (TOM) design and transition planning.

// Operating Model Canvas (POLISM) elements with the value proposition they serve,
// mapped to the 17 assessment dimensions.
export const CANVAS_ELEMENTS = [
  { id: 'value', name: 'Value proposition & customers', short: 'Value proposition', dims: ['D01', 'D02', 'D03'], prompt: 'Who does the organisation serve, what value does it deliver to each segment, and through which channels?' },
  { id: 'processes', name: 'Value delivery chains & processes', short: 'Processes', dims: ['D04', 'D05'], prompt: 'Which end-to-end value streams and capabilities deliver the proposition, and how does work flow?' },
  { id: 'organisation', name: 'Organisation & people', short: 'Organisation', dims: ['D06', 'D08', 'D09'], prompt: 'How are people and work organised, what roles and skills are needed, and what culture is required?' },
  { id: 'locations', name: 'Locations & physical assets', short: 'Locations', dims: ['D14'], prompt: 'Where is work done, and which sites and physical assets are required?' },
  { id: 'information', name: 'Information & technology', short: 'Information', dims: ['D11', 'D12'], prompt: 'Which applications, data and technology support the work, and how is information used?' },
  { id: 'suppliers', name: 'Suppliers & partners', short: 'Suppliers', dims: ['D13'], prompt: 'Which work is sourced externally, from whom, and how are partners managed?' },
  { id: 'management', name: 'Management system', short: 'Management system', dims: ['D07', 'D10', 'D15', 'D16', 'D17'], prompt: 'How is the organisation governed, planned, measured, funded, risk-managed and changed?' },
];

export const DEFAULT_CRITERIA = [
  { id: 'K1', name: 'Strategic alignment', weight: 20, description: 'Enables the strategy and the agreed design principles.' },
  { id: 'K2', name: 'Customer & service outcomes', weight: 20, description: 'Improves customer experience, service quality and access.' },
  { id: 'K3', name: 'Cost & value for money', weight: 15, description: 'Reduces run cost or improves value for the cost incurred.' },
  { id: 'K4', name: 'Risk, control & resilience', weight: 15, description: 'Strengthens control, compliance and operational resilience.' },
  { id: 'K5', name: 'Ease & speed of implementation', weight: 10, description: 'Achievable with available capacity, funding and time (5 = easiest).' },
  { id: 'K6', name: 'Workforce & culture', weight: 10, description: 'Supports engagement, capability and the desired culture.' },
  { id: 'K7', name: 'Scalability & flexibility', weight: 10, description: 'Adapts to growth, demand volatility and future change.' },
];

export const ARCHETYPES = {
  'Functional': { when: 'Stable environment, a narrow portfolio and a need for deep specialist expertise and efficiency.', pros: 'Economies of scale; professional depth; clear career paths.', cons: 'Silos and slow cross-functional hand-offs; weak end-to-end customer ownership.' },
  'Divisional – by product or service': { when: 'Distinct products or services with different markets, economics or regulation.', pros: 'Clear accountability for results; speed within each product line.', cons: 'Duplicated functions; inconsistent customer experience across products.' },
  'Divisional – by region': { when: 'Geographically dispersed customers with materially different local needs or regulation.', pros: 'Local responsiveness; strong regional accountability.', cons: 'Duplication; variable practices; harder to standardise.' },
  'Divisional – by customer segment': { when: 'Segments with distinct needs where a tailored end-to-end experience is a source of value.', pros: 'Customer centricity; clear segment ownership.', cons: 'Product and capability duplication across segments.' },
  'Matrix': { when: 'Need to balance two dimensions (e.g. product and region) that are both critical.', pros: 'Balances competing priorities; shares scarce expertise.', cons: 'Dual reporting, ambiguity and slower decisions without strong decision rights.' },
  'Hub-and-spoke (federated)': { when: 'Common standards and platforms are needed while business units retain local delivery.', pros: 'Consistency with local responsiveness; scalable capability building.', cons: 'Requires clear decision rights and funding rules between hub and spokes.' },
  'Shared services and centres of excellence': { when: 'Transactional or specialist work that is common across units and benefits from scale.', pros: 'Lower cost; standardised processes; concentrated expertise.', cons: 'Risk of distance from the business; needs strong service management.' },
  'Product / platform aligned': { when: 'Digital or service products that need persistent cross-functional teams and fast iteration.', pros: 'End-to-end ownership; speed; continuous improvement.', cons: 'Requires mature product management, funding by value stream and architecture discipline.' },
  'Network / ecosystem': { when: 'Value is created with partners and the organisation orchestrates rather than owns delivery.', pros: 'Flexibility; access to external capability; variable cost.', cons: 'Dependency and third-party risk; needs strong partner governance.' },
};

export const CHANGE_AREAS = [
  { id: 'process', name: 'Processes' },
  { id: 'systems', name: 'Systems & tools' },
  { id: 'roles', name: 'Roles & responsibilities' },
  { id: 'skills', name: 'Skills & capabilities' },
  { id: 'structure', name: 'Organisation structure' },
  { id: 'location', name: 'Location & ways of working' },
  { id: 'culture', name: 'Culture & behaviours' },
  { id: 'measures', name: 'Performance measures' },
];
export const IMPACT_LEVELS = [
  { v: 0, label: 'None' }, { v: 1, label: 'Low' }, { v: 2, label: 'Medium' }, { v: 3, label: 'High' },
];

export const ADKAR = [
  { id: 'awareness', name: 'Awareness', of: 'of the need for change', interventions: 'Sponsor-led case for change; leader briefings and town halls; explain what is changing and why now.' },
  { id: 'desire', name: 'Desire', of: 'to support the change', interventions: 'Equip managers as change leaders; address "what\'s in it for me"; involve staff in design; manage resistance early.' },
  { id: 'knowledge', name: 'Knowledge', of: 'of how to change', interventions: 'Role-based training; job aids and process walk-throughs; clear guidance on new decision rights.' },
  { id: 'ability', name: 'Ability', of: 'to implement new skills and behaviours', interventions: 'Coaching, practice environments, super-users and floor-walkers; time to build proficiency.' },
  { id: 'reinforcement', name: 'Reinforcement', of: 'to sustain the change', interventions: 'Recognition, measures and consequences aligned to new ways of working; retire old processes and systems.' },
];

// Target-state design patterns by dimension. Selecting a pattern appends its target description
// and key shift to the dimension's target state, which the consultant then tailors.
export const TOM_PATTERNS = {
  D01: [
    { name: 'Explicit strategic choices', target: 'A small number of prioritised strategic objectives with measures, and explicit choices on segments, services and channels that the operating model is designed to deliver.', shift: 'Broad, unprioritised aspirations → explicit choices and measurable objectives' },
    { name: 'Strategy-to-execution cascade', target: 'Strategy cascades into business unit plans, the investment portfolio, budgets and individual objectives with quarterly review.', shift: 'Annual plan disconnected from delivery → integrated, quarterly strategy-to-execution cycle' },
    { name: 'Design principles as decision tests', target: 'Six to ten endorsed operating model design principles are used to test every structural, process and investment decision.', shift: 'Implicit design choices → principle-led design decisions' },
  ],
  D02: [
    { name: 'Journey ownership', target: 'Priority customer journeys have named end-to-end owners, measured experience targets and cross-functional improvement teams.', shift: 'Functional service silos → owned, measured end-to-end journeys' },
    { name: 'Digital by default, assisted by choice', target: 'Self-service digital channels handle routine interactions, with assisted channels focused on complex and vulnerable customers.', shift: 'Channel mix driven by history → deliberate digital-first channel strategy' },
    { name: 'Voice of customer loop', target: 'Customer feedback, complaints and analytics feed a closed-loop improvement process reviewed by the executive.', shift: 'Feedback collected but rarely used → insight-driven service change' },
  ],
  D03: [
    { name: 'Owned service catalogue', target: 'A complete service catalogue with an accountable owner, cost and performance for each service, managed through a lifecycle.', shift: 'Partial view of services → owned, costed and managed catalogue' },
    { name: 'Portfolio rationalisation', target: 'The portfolio is reviewed annually on value and cost; low-value variants are retired.', shift: 'Accumulated complexity → rationalised, value-based portfolio' },
  ],
  D04: [
    { name: 'End-to-end process ownership', target: 'Value streams have end-to-end process owners who manage performance, standards and improvement across business units.', shift: 'Functional process fragments → end-to-end value stream ownership' },
    { name: 'Standardise, then automate', target: 'Common processes are standardised across units and high-volume, rules-based steps are automated with embedded controls.', shift: 'Local variation and manual effort → standard, automated processes' },
    { name: 'Data-driven process improvement', target: 'Process mining and KPIs expose bottlenecks; continuous improvement teams act on them.', shift: 'Anecdotal pain points → measured, continuously improved processes' },
  ],
  D05: [
    { name: 'Capability-based planning', target: 'An endorsed capability map with owners and maturity targets directs investment, architecture and sourcing decisions.', shift: 'Project-by-project investment → capability-based planning' },
    { name: 'Differentiate vs commodity sourcing', target: 'Differentiating capabilities are built in-house; commodity capabilities are shared or sourced.', shift: 'Uniform in-house delivery → deliberate sourcing by differentiation' },
  ],
  D06: [
    { name: 'Lean spans and layers', target: 'Spans of control are within benchmark ranges for the nature of work and no reporting line exceeds the agreed maximum layers.', shift: 'Narrow spans and deep hierarchies → lean, benchmarked structure' },
    { name: 'Shared services and centres of excellence', target: 'Transactional corporate services are consolidated into shared services; scarce expertise is concentrated in centres of excellence.', shift: 'Duplicated functions in each unit → consolidated shared services and CoEs' },
    { name: 'Clear role accountability', target: 'Every role has a clear purpose, accountabilities and decision rights, with shadow functions removed.', shift: 'Ambiguous, overlapping roles → clear accountabilities' },
  ],
  D07: [
    { name: 'Streamlined governance', target: 'A rationalised committee structure with clear terms of reference, no overlap and decisions made at the lowest appropriate level.', shift: 'Overlapping committees and escalation → streamlined, devolved governance' },
    { name: 'Refreshed delegations and decision rights', target: 'Delegations align with the structure and risk appetite; each key decision has exactly one decider (RAPID).', shift: 'Outdated delegations and unclear deciders → clear, system-enforced decision rights' },
    { name: 'Effective three lines', target: 'First-line ownership of risk, an independent second line and risk-based internal audit operate as a coordinated assurance model.', shift: 'Blurred risk roles → coordinated three lines' },
  ],
  D08: [
    { name: 'Strategic workforce planning', target: 'A three-to-five-year workforce plan links demand, skills and supply to the business plan, with critical roles and succession covered.', shift: 'Reactive recruitment → strategic workforce planning' },
    { name: 'Skills-based workforce', target: 'A skills framework underpins recruitment, development, deployment and reward.', shift: 'Position-based management → skills-based workforce' },
  ],
  D09: [
    { name: 'Defined behaviours, role-modelled', target: 'A small set of target behaviours is role-modelled by leaders and reinforced through hiring, performance and recognition.', shift: 'Stated values not lived → reinforced target behaviours' },
    { name: 'Psychological safety and accountability', target: 'Teams speak up, escalate early and own outcomes; culture is measured and acted on.', shift: 'Low trust and blame → safety with clear accountability' },
  ],
  D10: [
    { name: 'Balanced, cascaded KPIs', target: 'A balanced KPI framework cascades from the strategy to teams, with automated, trusted reporting and regular performance forums.', shift: 'Lagging, manual financial reporting → balanced, automated performance insight' },
    { name: 'Integrated planning', target: 'Strategy, workforce, financial and investment planning run as one integrated cycle.', shift: 'Disconnected planning processes → integrated planning cycle' },
  ],
  D11: [
    { name: 'Rationalised application portfolio', target: 'Applications are classified (TIME) and rationalised; duplicated and end-of-life systems are retired onto strategic platforms.', shift: 'Fragmented, ageing portfolio → rationalised strategic platforms' },
    { name: 'Cloud and integration platform', target: 'Workloads run on a secure cloud platform with an API and integration layer enabling reuse.', shift: 'Point-to-point, on-premises estate → cloud and API-led integration' },
    { name: 'Product-based technology delivery', target: 'Technology is delivered by persistent product teams aligned to value streams, with business product owners.', shift: 'Project-based IT delivery → business-aligned product teams' },
    { name: 'Governed AI and automation', target: 'An AI and automation platform delivers a prioritised use-case pipeline under responsible AI governance, with benefits measured.', shift: 'Ad hoc experiments and shadow AI → governed, scaled AI and automation' },
  ],
  D12: [
    { name: 'Data governance with owners', target: 'Data domains have accountable owners and stewards; critical data elements have measured quality.', shift: 'Unowned, siloed data → governed data domains' },
    { name: 'Single source of truth and self-service', target: 'A governed data platform provides trusted single sources of truth and self-service analytics.', shift: 'Manual extracts and conflicting numbers → trusted self-service insight' },
    { name: 'AI-ready data', target: 'Data and knowledge content is catalogued, lineage-tracked, privacy-assessed and accessible for AI use cases.', shift: 'Data not fit for AI → AI-ready data foundations' },
  ],
  D13: [
    { name: 'Segmented supplier management', target: 'Suppliers are segmented (Kraljic); strategic suppliers have relationship plans, performance reviews and tested exit plans.', shift: 'Transactional contracts → segmented, actively managed suppliers' },
    { name: 'Reduced concentration risk', target: 'Material service providers meet resilience obligations with exit plans; single-source dependencies are mitigated.', shift: 'Unmanaged dependency → resilient, diversified sourcing' },
  ],
  D14: [
    { name: 'Hybrid workplace, consolidated footprint', target: 'A hybrid workplace model with a consolidated, well-utilised footprint aligned to customers and talent.', shift: 'Historical, under-utilised footprint → consolidated hybrid workplace' },
    { name: 'Resilient critical sites', target: 'Critical sites have tested alternate arrangements; lease events are used to reshape the footprint.', shift: 'Untested site resilience → tested, resilient footprint' },
  ],
  D15: [
    { name: 'Integrated risk and compliance', target: 'An integrated risk, compliance and assurance framework with an obligations register, control library and appetite-driven decisions.', shift: 'Fragmented, reactive compliance → integrated, appetite-driven risk management' },
    { name: 'Cyber and operational resilience', target: 'Cyber maturity meets target (e.g. Essential Eight) and critical operations are mapped, tolerances set and resilience tested.', shift: 'Immature cyber and untested continuity → tested operational resilience' },
  ],
  D16: [
    { name: 'Cost-to-serve transparency', target: 'Costs are visible by business unit, capability and service; cost-to-serve informs decisions.', shift: 'General ledger view only → cost-to-serve transparency' },
    { name: 'Value-based funding', target: 'Funding is allocated to value streams and products with benefits tracked, rather than incremental budgets.', shift: 'Incremental budgeting → value-based funding' },
  ],
  D17: [
    { name: 'Strategic portfolio management', target: 'A single prioritised change portfolio linked to strategy, with capacity-aware sequencing and dynamic reprioritisation.', shift: 'Uncoordinated projects → strategically managed portfolio' },
    { name: 'Benefits-led delivery', target: 'Benefits are defined, owned, baselined and tracked beyond project close.', shift: 'Output-focused delivery → benefits-led change' },
    { name: 'Structured change management', target: 'Change impact assessments, stakeholder engagement, training and adoption measures are applied to all major change.', shift: 'Change "done to" staff → structured, measured adoption' },
  ],
};

export const RISK_MATRIX_LABELS = {
  likelihood: ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'],
  impact: ['Insignificant', 'Minor', 'Moderate', 'Major', 'Severe'],
};
