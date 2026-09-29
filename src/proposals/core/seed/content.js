// Hand-written section content for the showcase bid (Southern Rivers Water Authority).
// Citations point at seeded library item versions and request clauses.

const lib = (key, v = 1) => `<cite data-src="lib:lib_${key.toLowerCase().replace('-', '')}@${v}" data-label="${key}" data-kind="library">${key}</cite>`;
const req = (ref) => `<cite data-src="req:rq_srwa_${ref}" data-label="${ref}" data-kind="request">${ref}</cite>`;
const con = (id, name) => `<cite data-src="con:${id}" data-label="${name}" data-kind="consultant">${name}</cite>`;
const ai = (t) => `<span data-ai="pending">${t}</span>`;
const flag = (t) => `<mark data-flag="needs-evidence">${t}</mark>`;

export const SRWA_CONTENT = {
  executive_summary: {
    v1: `<p>${ai('CTO Consulting is pleased to respond to Southern Rivers Water Authority’s request for a Cloud Migration and Cyber Security Uplift Program.')}${req('M1')}</p>`
      + `<p>${ai('The Authority must exit its primary data centre before the lease expires in June 2027 while lifting its Essential Eight maturity to Maturity Level 2.')}${req('M6')} ${ai('Our cloud migration framework moves workloads in waves sequenced by business criticality, dependencies and contractual exit dates.')}${lib('MT-001')}</p>`
      + `<p>${ai('We have done this before for a regional water utility: 142 workloads were migrated in 11 months and the primary data centre was exited three months before lease expiry.')}${lib('CS-001', 2)}</p>`
      + `<h3>${ai('Why CTO Consulting')}</h3><ul><li><p>${ai('A proven, low-risk migration method with a rehearsed rollback for every wave.')}${lib('MT-001')}</p></li><li><p>${ai('Evidence-based Essential Eight uplift that an auditor will accept.')}${lib('MT-002')}</p></li><li><p>${ai(flag('The lowest total cost of ownership of any respondent.'))}</p></li></ul>`,
  },
  understanding: {
    v1: '<p>Southern Rivers Water Authority provides drinking water and wastewater services to 420,000 customers and runs 180 business applications from two ageing data centres.'
      + `${req('M1')} The lease for the primary data centre expires in June 2027, which sets a hard deadline for the migration program.</p>`
      + '<p>A 2026 internal audit found the Authority at Essential Eight Maturity Level 1 for most mitigation strategies and recommended uplift to Maturity Level 2 by June 2028.'
      + `${req('M6')} The Authority also wants its internal ICT team to operate the new environment with confidence once the program ends.${req('M8')}</p>`
      + '<h3>What success looks like</h3><ul><li><p>Every workload migrated or retired before the data centre lease ends, with no unplanned outage to customer billing or water operations.</p></li>'
      + '<li><p>Maturity Level 2 achieved and evidenced across all eight mitigation strategies.</p></li><li><p>An internal team and managed service provider ready to run the landing zone from day one of transition.</p></li></ul>'
      + `<p>We understand that operational technology is out of scope, but that migration must not weaken the segmentation between corporate and operational technology networks.${req('2.4')}</p>`,
  },
  approach: {
    v1: `<p>${ai('Our cloud migration framework moves workloads in waves sequenced by business criticality, dependencies and contractual exit dates.')}${lib('MT-001')}</p>`,
    v3: '<p>Our approach combines the CTO Cloud Migration Framework with our Essential Eight Uplift Method, so that security controls are built into the landing zone rather than added afterwards.'
      + `${lib('MT-001')}${lib('MT-002')}</p>`
      + '<h3>Phase 1: discover and plan (weeks 1–8)</h3>'
      + '<p>We will build a complete application and dependency inventory using automated discovery tools and interviews with application owners. Every workload is assigned one of six treatments: retire, retain, rehost, replatform, refactor or replace.'
      + `${lib('MT-001')} The migration wave plan groups workloads so that each wave can be cut over and rolled back independently, and it sequences waves by business criticality and the June 2027 data centre exit date.${req('M1')}</p>`
      + '<h3>Phase 2: landing zone and migration (weeks 6–40)</h3>'
      + `<p>We will build the landing zone in Microsoft Azure’s Australia East and Australia Southeast regions as infrastructure as code, with identity, network segmentation, logging and guardrails in place before the first workload moves.${lib('MT-001')}${req('M2')} Controls are mapped to the ASD Information Security Manual and the Essential Eight.${req('M2')}</p>`
      + `<p>All Authority data, including backups and logs, will stay in Australian regions. Azure Policy will deny resource creation outside Australian regions.${req('M10')}</p>`
      + '<p>Each wave follows a rehearsed cut-over runbook with go/no-go criteria and a tested rollback plan. Cut-overs will be scheduled with the Authority’s operations team so that no change touches the segmentation between corporate and operational technology networks.'
      + `${req('2.4')}</p>`
      + '<h3>Phase 3: optimise</h3>'
      + `<p>After migration we right-size resources and apply reserved capacity, which typically reduces running costs by 20% to 35%.${lib('MT-001')}${req('D6')}</p>`,
  },
  essential_eight: {
    v1: '<p>We will take the Authority from Maturity Level 1 to Maturity Level 2 across all eight mitigation strategies, with evidence that the Authority’s auditors will accept.'
      + `${req('M6')}${lib('MT-002')}</p>`
      + '<p>We start with an assessment against the ASD Essential Eight Maturity Model, using technical testing rather than interviews alone. We then prioritise mitigation strategies by risk reduction and business impact, and implement changes in controlled pilots before rolling them out.'
      + `${lib('MT-002')}</p>`
      + '<p>For every mitigation strategy we produce an evidence pack that maps each maturity requirement to configuration, test results and screenshots. A sustainment model with monthly compliance reporting keeps the Authority at Maturity Level 2 after we leave.'
      + `${lib('MT-002')}</p>`
      + '<p>We have delivered this outcome before: for a New South Wales Government department we achieved Maturity Level 2 across all eight mitigation strategies in nine months and enforced application control on 4,800 endpoints.'
      + `${lib('CS-002')}</p>`
      + `<p>CTO Consulting holds ISO/IEC 27001:2022 certification for its information security management system, covering all offices and consulting services.${lib('SA-003', 2)}${lib('EV-004')}${req('M4')}</p>`,
  },
  delivery_plan: {
    v1: '<p>The program runs for 18 months from contract commencement, with the data centre exit completed four months before the lease expires.</p>'
      + '<table><tbody><tr><th><p>Phase</p></th><th><p>Timing</p></th><th><p>Key deliverables</p></th></tr>'
      + '<tr><td><p>Discover and plan</p></td><td><p>Months 1–2</p></td><td><p>Inventory, wave plan, landing zone design</p></td></tr>'
      + '<tr><td><p>Landing zone build</p></td><td><p>Months 2–4</p></td><td><p>Landing zone, guardrails, identity integration</p></td></tr>'
      + '<tr><td><p>Migration waves 1–8</p></td><td><p>Months 4–10</p></td><td><p>Migrated workloads, cut-over reports</p></td></tr>'
      + '<tr><td><p>Essential Eight uplift</p></td><td><p>Months 3–16</p></td><td><p>Maturity Level 2 evidence packs</p></td></tr>'
      + '<tr><td><p>Transition to operations</p></td><td><p>Months 15–18</p></td><td><p>Runbooks, training, hypercare</p></td></tr></tbody></table>',
  },
  team: {
    v1: `<p>Our team combines cloud migration, cyber security and change management specialists who have worked together on utility programs.${lib('SA-012')}</p>`
      + `<h3>Sam Taylor — Engagement lead</h3><p>Sam is a program director with 18 years of experience, including 12 years delivering cloud migration programs for utilities and government.${con('con_sam', 'Sam Taylor')}${req('M5')}</p>`
      + `<h3>Marcus Lee — Lead cloud architect</h3><p>Marcus led the Azure migration and data centre exit for Murray Basin Water and holds the Azure Solutions Architect Expert certification.${con('con_marcus', 'Marcus Lee')}${req('D3')}</p>`
      + '<p>All proposed personnel hold a current Baseline clearance or higher.</p>',
  },
  experience: {
    v1: `<h3>Azure migration and data centre exit for a regional water utility</h3><p>Murray Basin Water needed to exit an end-of-life data centre within 12 months while keeping water treatment and customer billing systems running.${lib('CS-001', 2)}${req('D1')}</p>`
      + `<ul><li><p>142 workloads migrated in 11 months.${lib('CS-001', 2)}</p></li><li><p>Primary data centre exited three months before lease expiry.${lib('CS-001', 2)}</p></li><li><p>Hosting costs reduced by 31% in the first year.${lib('CS-001', 2)}</p></li></ul>`
      + `<h3>Essential Eight uplift for a New South Wales Government department</h3><p>We led the uplift from Maturity Level 1 to Maturity Level 2 across 4,800 endpoints and 310 servers in nine months.${lib('CS-002')}</p>`
      + `<h3>Change and capability uplift for a university IT transformation</h3><p>Meridian University restructured its IT function into product teams, and staff engagement rose from 48% to 71% within a year.${lib('CS-008')}${req('D2')}</p>`,
  },
  commercial: {
    v1: '<p>We offer Lot 1 as a fixed price with payment against four milestones, and Lot 2 as capped time and materials. All rates are within our ICT Professional Services Panel ceiling rates and exclude GST.'
      + `${req('7.2')}${req('7.3')}</p><p>Our pricing assumptions and proposed departures are set out in the pricing schedule.</p>`,
  },
  compliance: {
    v1: `<p>CTO Consulting holds professional indemnity insurance of $20 million per claim and in the aggregate, and public liability insurance of $20 million per occurrence.${lib('SA-005')}${lib('EV-002')}${req('M7')}</p>`
      + `<p>We comply with the Modern Slavery Act 2018 (Cth), and our supplier code of conduct prohibits forced labour.${lib('SA-006')}${req('M9')} We will comply with the Authority’s Supplier Code of Conduct.${req('M9')}</p>`
      + `<p>CTO Consulting has a formal partnership with Yarran Digital, a Supply Nation certified Aboriginal-owned technology consultancy, whose consultants will work within our delivery team.${lib('SA-011')}${req('D4')}</p>`,
  },
};
