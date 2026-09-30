// Sample client request documents for the demo data. All organisations and people are fictitious.
// Dates are generated relative to a base date so the demo never goes stale.
import { addDays, longDate, nextWeekday } from '../util.js';

const time = (t) => t;

export function srwaDates(base) {
  const issued = base;
  const closing = nextWeekday(addDays(base, 22), 5);
  return {
    issued, closing, briefing: nextWeekday(addDays(base, 7), 3), questions: nextWeekday(addDays(base, 14), 3),
    presentations: nextWeekday(addDays(closing, 14), 1), commencement: nextWeekday(addDays(closing, 85), 1),
    addendum: addDays(base, 12), closingExtended: addDays(closing, 7),
  };
}

export function srwaRfq(base) {
  const d = srwaDates(base);
  return {
    name: 'SRWA-RFQ-2026-031 Request for Quote.pdf',
    type: 'request',
    pages: [
      [
        'Southern Rivers Water Authority',
        'Request for Quote (RFQ)',
        'Cloud Migration and Cyber Security Uplift Program',
        'RFQ Reference: SRWA-RFQ-2026-031',
        `Issued: ${longDate(d.issued, { weekday: false })}`,
        `Closing time: ${time('2:00 pm')} AEDT, ${longDate(d.closing)}`,
        'Lodgement: electronically through NSW eTendering',
        'This RFQ is issued to suppliers appointed to the Authority’s ICT Professional Services Panel. The Authority is a New South Wales state-owned water utility.',
      ],
      [
        '1. Introduction and background',
        '1.1 Southern Rivers Water Authority (the Authority) provides drinking water and wastewater services to 420,000 customers across the Southern Rivers region of New South Wales.',
        '1.2 The Authority operates 180 business applications from two ageing on-premises data centres. The lease for the primary data centre expires in June 2027 and will not be renewed.',
        '1.3 A 2026 internal audit assessed the Authority at Essential Eight Maturity Level 1 for most mitigation strategies and recommended uplift to Maturity Level 2 by June 2028.',
        '1.4 The Authority is seeking a suitably qualified supplier to plan and deliver the migration of its workloads to a secure cloud landing zone and to uplift its cyber security controls, while building the capability of its internal ICT team.',
        '2. Scope of services',
        '2.1 The services comprise three phases: (a) discovery and migration planning; (b) landing zone build and workload migration; and (c) Essential Eight uplift and transition to operations.',
        '2.2 Lot 1 covers phases (a) and (b). Lot 2 covers phase (c). Respondents may respond to one or both lots.',
        '2.3 The Authority expects the services to commence in January 2027 and to be completed by June 2028.',
        '2.4 Operational technology (SCADA) systems are out of scope, but the supplier must ensure that migration activities do not affect operational technology network segmentation.',
      ],
      [
        '3. Requirements',
        '3.1 Mandatory requirements. Respondents must meet each of the following mandatory requirements. A response that does not meet a mandatory requirement may be excluded from further consideration.',
        'M1\tThe supplier must provide a migration approach that sequences workloads by business criticality and data centre exit dates.',
        'M2\tThe supplier must design and build a cloud landing zone that is hosted in Australia and aligned with the ASD Information Security Manual (ISM).',
        'M3\tAll personnel with access to Authority systems must hold or be able to obtain an Australian Government Baseline security clearance.',
        'M4\tThe supplier must hold current ISO/IEC 27001 certification for its information security management system.',
        'M5\tThe supplier must provide a named engagement lead with at least ten years of experience delivering cloud migration programs.',
        'M6\tThe supplier must uplift the Authority to Essential Eight Maturity Level 2 across all eight mitigation strategies and provide evidence of the maturity achieved.',
        'M7\tThe supplier must maintain professional indemnity insurance of at least $10 million and public liability insurance of at least $20 million.',
        'M8\tThe supplier must provide a transition plan that transfers knowledge to the Authority’s internal team and its managed service provider.',
        'M9\tThe supplier must comply with the Authority’s Supplier Code of Conduct and the Modern Slavery Act 2018 (Cth).',
        'M10\tAll Authority data must remain in Australia at all times, including backups and logs.',
        '3.2 Desirable requirements. The Authority will highly regard respondents who demonstrate the following.',
        'D1\tExperience delivering cloud migrations for water, energy or other regulated utilities.',
        'D2\tA proven approach to organisational change management and staff capability uplift.',
        'D3\tExperience with Microsoft Azure and Microsoft Entra ID in a government context.',
        'D4\tThe ability to engage an Aboriginal or Torres Strait Islander business as a subcontractor or partner.',
        'D5\tA method for measuring and reporting benefits realisation throughout the program.',
        'D6\tInnovative approaches that reduce the Authority’s ongoing cloud running costs.',
      ],
      [
        '4. Evaluation criteria',
        '4.1 Responses will be evaluated against the following criteria and weightings.',
        'Criterion\tWeighting',
        'Understanding of the Authority’s requirements\t15%',
        'Proposed approach and methodology\t30%',
        'Capability and experience of the proposed team\t25%',
        'Relevant experience and case studies\t15%',
        'Value for money\t15%',
        '4.2 Price will be assessed on a whole-of-life basis. The lowest price will not necessarily be accepted.',
        `4.3 Shortlisted respondents may be invited to present to the evaluation panel in the week commencing ${longDate(d.presentations, { weekday: false })}.`,
      ],
      [
        '5. Submission instructions',
        '5.1 Responses must be lodged electronically through NSW eTendering by the closing time. Late responses will not be accepted.',
        '5.2 The response must not exceed 30 A4 pages, excluding the returnable schedules, CVs and case study appendices.',
        '5.3 Responses must use Arial 11 point font with single line spacing and 2 cm margins.',
        '5.4 Files must be named using the convention SRWA-RFQ-2026-031_[Respondent name]_[Document name].',
        '5.5 Responses must be submitted in PDF format, with the pricing schedule also provided in Microsoft Excel format.',
        '5.6 CVs for key personnel must not exceed two pages each.',
        `5.7 Questions about this RFQ must be submitted through NSW eTendering by 5:00 pm AEDT on ${longDate(d.questions)}. Answers will be published to all respondents.`,
        '6. Key dates',
        'Event\tDate',
        `RFQ issued\t${longDate(d.issued, { weekday: false })}`,
        `Industry briefing (online)\t10:00 am AEDT, ${longDate(d.briefing)}`,
        `Deadline for questions\t5:00 pm AEDT, ${longDate(d.questions)}`,
        `RFQ closing time\t2:00 pm AEDT, ${longDate(d.closing)}`,
        `Shortlist presentations\tWeek commencing ${longDate(d.presentations, { weekday: false })}`,
        `Contract commencement\t${longDate(d.commencement, { weekday: false })}`,
      ],
      [
        '7. Pricing and commercial conditions',
        '7.1 Respondents must complete Returnable Schedule 3 – Pricing Schedule in the Excel format provided.',
        '7.2 Lot 1 must be priced as a fixed price with payment against milestones. Lot 2 may be priced as capped time and materials.',
        '7.3 Daily rates must not exceed the respondent’s ICT Professional Services Panel ceiling rates and must be quoted exclusive of GST.',
        '7.4 The Contract will be based on the Authority’s standard Professional Services Agreement. Liability will be capped at two times the contract value.',
        '7.5 Any departures from the Professional Services Agreement must be identified in Returnable Schedule 4 – Statement of Departures. Departures not identified will be taken to be accepted.',
        '7.6 The supplier must be able to invoice monthly in arrears, with payment within 20 business days of a correctly rendered invoice.',
        '8. Returnable schedules',
        '8.1 Respondents must complete and submit the following returnable schedules:',
        'Returnable Schedule 1 – Respondent Details and Declaration',
        'Returnable Schedule 2 – Referees (three referees for similar engagements)',
        'Returnable Schedule 3 – Pricing Schedule',
        'Returnable Schedule 4 – Statement of Departures',
        'Returnable Schedule 5 – Conflict of Interest Declaration',
        'Contact officer: Procurement Team, Southern Rivers Water Authority, procurement@srwa.example.au',
      ],
    ],
  };
}

export function srwaAddendum(base) {
  const d = srwaDates(base);
  return {
    name: 'SRWA-RFQ-2026-031 Addendum 1.pdf',
    type: 'addendum',
    pages: [[
      'Southern Rivers Water Authority',
      'Addendum 1 to RFQ SRWA-RFQ-2026-031',
      'Cloud Migration and Cyber Security Uplift Program',
      `Issued: ${longDate(d.addendum, { weekday: false })}`,
      'This addendum forms part of the RFQ. Respondents must read it with the RFQ.',
      `1. The RFQ closing time is extended to 2:00 pm AEDT, ${longDate(d.closingExtended)}.`,
      'M3\tAll personnel with access to Authority systems must hold a current Australian Government Baseline security clearance at contract commencement.',
      'M11\tThe supplier must provide a 24/7 incident response capability during migration cut-over windows.',
      '4. Desirable requirement D6 is deleted.',
      '5. The response must not exceed 35 A4 pages, excluding the returnable schedules, CVs and case study appendices.',
    ]],
  };
}

export function odrAtm(base) {
  const closing = nextWeekday(addDays(base, 42), 4);
  const questions = addDays(closing, -14);
  return {
    name: 'ODR-2026-118 Approach to Market.pdf',
    type: 'request',
    closing,
    pages: [
      [
        'Office of the Digital Registrar',
        'Approach to Market (ATM)',
        'Digital Records Modernisation Partner',
        'ATM Reference: ODR-2026-118',
        'Published on AusTender',
        `Closing time: 12:00 pm AEDT (Canberra time), ${longDate(closing)}`,
        'The Office of the Digital Registrar (the Office) is a non-corporate Commonwealth entity that maintains national registers of business and professional records.',
      ],
      [
        '1. Background',
        '1.1 The Office holds 60 million records across three legacy registry systems, the oldest of which was implemented in 2004.',
        '1.2 The Office intends to consolidate these registers onto a modern records platform and to retire paper-based processes for 1.2 million annual lodgements.',
        '1.3 The Office is seeking a partner to deliver discovery, target-state architecture and a business case for the modernisation program.',
        '2. Requirements',
        'R1\tThe supplier must deliver a current-state assessment of the three registry systems, including data quality, integration and technical debt.',
        'R2\tThe supplier must design a target-state architecture that complies with the Protective Security Policy Framework and the Information Security Manual.',
        'R3\tThe supplier must prepare a business case consistent with the Department of Finance Digital Investment Framework.',
        'R4\tThe supplier must engage with at least 40 internal and external stakeholders, including registry users with accessibility needs.',
        'R5\tPersonnel must hold or be able to obtain a Negative Vetting Level 1 (NV1) security clearance.',
        'R6\tThe supplier should demonstrate experience modernising records or registry platforms for Commonwealth entities.',
        'R7\tThe supplier should propose an approach to data migration and records retention under the Archives Act 1983.',
      ],
      [
        '3. Evaluation criteria',
        'Criterion\tWeighting',
        'Understanding and approach\t35%',
        'Team capability and clearances\t25%',
        'Experience with Commonwealth registries\t20%',
        'Price and value for money\t20%',
        '4. Submission requirements',
        '4.1 Responses must be lodged through AusTender before the closing time.',
        '4.2 The response must not exceed 20 pages.',
        `4.3 Questions must be submitted by 12:00 pm AEDT on ${longDate(questions)}.`,
        '4.4 The Office intends to issue a work order under the BuyICT Digital Marketplace Panel 2. Rates must not exceed panel ceiling rates.',
        '4.5 The work order will be priced as capped time and materials.',
        'Attachment A – Supplier Questionnaire',
        'Attachment B – Pricing Schedule',
      ],
    ],
  };
}

// Supplier questionnaire used to demonstrate bulk answering of returnables from standard answers.
export const ODR_QUESTIONNAIRE = {
  name: 'Attachment A – Supplier Questionnaire.docx',
  type: 'form',
  pages: [[
    'Attachment A – Supplier Questionnaire',
    'Q1\tDescribe your organisation, including its size, locations and core services.',
    'Q2\tDescribe your quality management system and any certifications held.',
    'Q3\tDescribe how you protect client information, including your information security certifications.',
    'Q4\tDescribe your work health and safety management system.',
    'Q5\tProvide details of your professional indemnity and public liability insurance.',
    'Q6\tDescribe how you identify and address modern slavery risks in your operations and supply chain.',
    'Q7\tDescribe how you manage conflicts of interest.',
    'Q8\tDescribe your approach to privacy and the handling of personal information.',
    'Q9\tDescribe your environmental, social and governance commitments.',
    'Q10\tDescribe your approach to digital accessibility.',
    'Q11\tDescribe your experience with quantum-resistant cryptography migration.',
  ]],
};

export function asacRfq(base, closing) {
  return {
    name: 'ASAC-RFQ-2026-044 Request for Quote.pdf',
    type: 'request',
    pages: [
      [
        'Australian Skills Assurance Commission',
        'Request for Quote under the BuyICT Digital Marketplace Panel 2',
        'Essential Eight Uplift Services',
        'RFQ Reference: ASAC-RFQ-2026-044',
        `Closing time: 12:00 pm AEDT, ${longDate(closing)}`,
        '1. Background',
        '1.1 The Commission has 900 staff and was assessed at Essential Eight Maturity Level 1 in its most recent self-assessment.',
        '2. Requirements',
        'R1\tThe supplier must assess the Commission against the Essential Eight Maturity Model and report current maturity for each mitigation strategy.',
        'R2\tThe supplier must implement application control and restrict administrative privileges to reach Maturity Level 2.',
        'R3\tThe supplier must provide an evidence pack suitable for review by the Commission’s internal auditor.',
        'R4\tPersonnel must hold a current Baseline security clearance.',
        'R5\tThe supplier should provide knowledge transfer to the Commission’s ICT operations team.',
      ],
      [
        '3. Evaluation criteria',
        'Criterion\tWeighting',
        'Methodology and approach\t40%',
        'Team capability\t30%',
        'Price\t30%',
        '4. Submission instructions',
        '4.1 Responses must be lodged through BuyICT by the closing time.',
        '4.2 The response must not exceed 12 pages.',
        '4.3 The work order will be priced as capped time and materials.',
      ],
    ],
  };
}

export function kestrelRfp(base, closing) {
  return {
    name: 'Kestrel Superannuation RFP – Data and AI Governance.docx',
    type: 'request',
    pages: [
      [
        'Kestrel Superannuation',
        'Request for Proposal',
        'Data and AI Governance Framework',
        'Reference: KS-RFP-2026-07',
        `Proposals are due by 5:00 pm AEDT, ${longDate(closing)}`,
        '1. Background',
        '1.1 Kestrel Superannuation manages $38 billion on behalf of 410,000 members and is regulated by APRA.',
        '1.2 The fund is piloting AI in member services and investment operations and needs a governance framework before scaling.',
        '2. Requirements',
        'R1\tThe supplier must design a data and AI governance framework aligned with APRA Prudential Standard CPS 230 and Prudential Practice Guide CPG 235.',
        'R2\tThe supplier must establish a risk-tiered assessment process for AI use cases.',
        'R3\tThe supplier must define data classification and handling rules for member data.',
        'R4\tThe supplier must train and accredit data custodians across the fund.',
        'R5\tThe supplier should offer an advisory retainer for twelve months after the framework is adopted.',
      ],
      [
        '3. Evaluation criteria',
        'Criterion\tWeighting',
        'Approach and methodology\t40%',
        'Experience in financial services\t25%',
        'Team\t15%',
        'Price\t20%',
        '4. Submission',
        '4.1 Proposals must be emailed to the fund’s procurement team and must not exceed 15 pages.',
        '4.2 Rates must be quoted under the fund’s master services agreement.',
      ],
    ],
  };
}

export function tasmanRfp(base, closing) {
  return {
    name: 'Tasman Freight – Confidential RFP – Technology Due Diligence.pdf',
    type: 'request',
    pages: [[
      'Tasman Freight Group',
      'Strictly confidential – Request for Proposal',
      'Technology Due Diligence for a Proposed Acquisition',
      'Reference: TFG-CONF-2026-03',
      `Proposals are due by 3:00 pm AEST (Brisbane time), ${longDate(closing)}`,
      'R1\tThe supplier must assess the target company’s IT environment, cyber security posture and technology risks.',
      'R2\tThe supplier must estimate one-off integration costs and ongoing run costs.',
      'R3\tThe supplier must sign the Group’s confidentiality deed before receiving data room access.',
      'R4\tThe supplier must deliver its final report within six weeks of engagement.',
      'R5\tThe supplier should identify quick wins for the first 100 days after completion.',
    ]],
  };
}

export function harbourRfq(base) {
  const closing = nextWeekday(addDays(base, 29), 3);
  return {
    name: 'Harbourside City Council RFQ – Customer Portal Discovery.pdf',
    type: 'request',
    pages: [
      [
        'Harbourside City Council',
        'Request for Quotation',
        'Customer Portal Discovery and Roadmap',
        'RFQ Reference: HCC-RFQ-2026-19',
        `Closing time: 2:00 pm AEDT, ${longDate(closing)}`,
        'Quotations must be lodged through the Council’s eProcurement portal.',
        '1. Background',
        '1.1 The Council receives 180,000 customer requests each year, two thirds of them by phone. It launched an online portal in 2024 and now wants to extend it to planning, rates and waste services.',
        '1.2 The Council is seeking a supplier to complete discovery, service design and a three-year roadmap for the next phase of its customer portal.',
      ],
      [
        '2. Requirements',
        'R1\tThe supplier must engage at least 60 residents in research, including people with disability and culturally and linguistically diverse residents.',
        'R2\tThe supplier must assess the current portal and CRM integration and identify technical debt.',
        'R3\tThe supplier must deliver a prioritised three-year roadmap with cost estimates.',
        'R4\tAll designs must meet WCAG 2.2 Level AA.',
        'R5\tThe supplier should demonstrate experience delivering customer portals for local government.',
        '3. Evaluation criteria',
        'Criterion\tWeighting',
        'Understanding and approach\t40%',
        'Relevant experience\t30%',
        'Price\t30%',
        '4. Submission',
        '4.1 The quotation must not exceed 10 pages.',
        '4.2 Quotations must be lodged through the Council’s eProcurement portal by the closing time.',
        '4.3 The engagement will be priced as a fixed price.',
      ],
    ],
  };
}

export const toPages = (doc) => doc.pages.map((paras, i) => ({ n: i + 1, paras }));
