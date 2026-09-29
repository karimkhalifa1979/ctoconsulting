// Regulatory knowledge base: target policies, applicability rules for every
// obligation source in the reference register, and additional sources that
// the reference register does not cover (financial services, state/territory,
// international and voluntary standards).
import { isCth, isGov, isStateGov, inState, hasInd, flag, intl } from './profile.js';

export const POLICIES = {
  GOV: { title: 'ICT Governance Policy', domain: 'Strategy, Architecture and Governance' },
  AUP: { title: 'ICT Acceptable Use Policy', domain: 'Cyber Security' },
  AAP: { title: 'ICT Authorisation and Accreditation Policy', domain: 'Cyber Security' },
  ASA: { title: 'Business Applications Policy', domain: 'Applications' },
  DEP: { title: 'Digital Experience Policy', domain: 'Digital Services' },
  DRP: { title: 'ICT Disaster Recovery Policy', domain: 'Resilience' },
  CYB: { title: 'Cyber Security Policy', domain: 'Cyber Security' },
  ING: { title: 'ICT Integration Policy', domain: 'Architecture and Integration' },
  SVM: { title: 'ICT Service Management Policy', domain: 'Service Management' },
  INF: { title: 'ICT Infrastructure Management Policy', domain: 'Infrastructure' },
  TPP: { title: 'Technology Portfolio Planning Policy', domain: 'Strategy, Architecture and Governance' },
  TEP: { title: 'Technology Enabled Projects Policy', domain: 'Delivery' },
  INT: { title: 'Insider Threat and Risk Policy', domain: 'Personnel Security' },
  IDM: { title: 'Identity Management Policy', domain: 'Identity and Access' },
};

export const LEVELS = {
  mandatory: { label: 'Mandatory', desc: 'A legal or binding policy obligation that applies to the organisation.' },
  conditional: { label: 'Conditional', desc: 'Applies where the organisation undertakes the triggering activity — confirm scope.' },
  recommended: { label: 'Recommended', desc: 'Better-practice standard or guidance adopted voluntarily.' },
};

const M = (reason) => ['mandatory', reason];
const C = (reason) => ['conditional', reason];
const R = (reason) => ['recommended', reason];

const privacyActApplies = (p) => isCth(p) || flag(p, 'turnoverOver3m') || flag(p, 'healthInfo') || flag(p, 'cthContractor') || flag(p, 'afsl');

const cth = (reason = 'Commonwealth entity — whole-of-government policy applies') => (p) => (isCth(p) ? M(reason) : null);
const cthRec = (reason, recReason = 'Better-practice Australian Government guidance') => (p) =>
  isCth(p) ? M(reason) : isGov(p) ? R(recReason) : null;
const allRec = (reason) => () => R(reason);

// Applicability rules for every obligation source in the reference register (keyed by Obligation Name).
export const LIBRARY_RULES = {
  'Protective Security Policy Framework (PSPF) Release 2025': (p) =>
    isCth(p) ? M('Commonwealth entity — PSPF requirements apply (mandatory for non-corporate entities; applied to corporate entities by direction and adopted in policy)')
      : flag(p, 'cthContractor') ? C('Contracted service providers must meet the PSPF requirements flowed down in Commonwealth contracts')
        : isStateGov(p) ? R('Better-practice protective security framework for government') : null,
  'PSPF Directions 2024': (p) => (isCth(p) ? M('Protective Security Directions issued under the PSPF bind Commonwealth entities') : flag(p, 'cthContractor') ? C('Directions flowed down through Commonwealth contracts') : null),
  'Protective Security Directions, PSPF Standards and Commonwealth Technology Standard': cth('Commonwealth entity — PSPF Directions and Commonwealth Technology Standard apply'),
  'Information Security Manual (ISM)': (p) =>
    isCth(p) ? M('Commonwealth entity — ISM controls are applied through the PSPF')
      : flag(p, 'cthContractor') || flag(p, 'classified') ? C('Required where systems process Commonwealth or classified information')
        : R('Australian Signals Directorate cyber security control framework — recommended baseline'),
  'Information Security Manual (ISM) - Risk Management Framework': (p) => (isCth(p) ? M('Systems must be authorised using the ISM risk management framework') : R('Structured system authorisation approach from the ISM')),
  'Information Security Registered Assessors Program (IRAP)': (p) => (isCth(p) ? M('IRAP assessments support system authorisation and cloud assurance for Commonwealth entities') : flag(p, 'cthContractor') ? C('IRAP assessment required for services provided to the Commonwealth') : null),
  'Essential Eight Maturity Model': (p) => (isCth(p) ? M('Commonwealth entities must implement the Essential Eight (PSPF requirement)') : R('ASD-recommended baseline mitigation strategies for all organisations')),
  'ACSC Strategies to Mitigate Cyber Security Incidents': allRec('ASD guidance for prioritising cyber mitigations'),
  'ASD / ACSC cyber incident reporting and response guidance': allRec('ASD guidance on reporting and responding to cyber incidents'),
  'ASD threat intelligence, advisories and partner programs': allRec('Leverage ASD threat intelligence and partnership programs'),
  'ASD Cloud Shared Responsibility Model': (p) => (flag(p, 'cloud') ? R('Organisation uses cloud services — shared responsibility must be understood') : null),
  '2023-2030 Australian Cyber Security Strategy': allRec('National cyber security strategy sets expectations for all organisations'),
  'Australian Government Gateway Security Standard 2025 and ASD Gateway Security Guidance': cthRec('Commonwealth entities must use compliant gateways', 'Gateway security better practice'),
  'Hosting Certification Framework (HCF) / Secure Cloud': (p) => (isCth(p) ? M('Commonwealth entities must use certified hosting for sensitive data') : flag(p, 'cthContractor') ? C('Hosting Commonwealth data requires HCF-certified providers') : null),
  'Whole-of-Government Cloud Computing Policy': cthRec('Commonwealth cloud policy applies to cloud adoption decisions', 'Cloud adoption better practice'),
  'Gatekeeper Public Key Infrastructure Framework': (p) => (isCth(p) ? C('Applies where Gatekeeper-accredited PKI/certificates are used') : null),

  'PGPA Act 2013': cth('Public Governance, Performance and Accountability Act applies to all Commonwealth entities'),
  'PGPA Rule 2014': cth('PGPA Rule prescribes governance, risk, fraud and reporting duties for Commonwealth entities'),
  'Commonwealth Risk Management Policy': cthRec('Commonwealth Risk Management Policy applies to non-corporate entities and is better practice for corporate entities'),
  'Commonwealth Fraud and Corruption Control Framework 2024': cth('Fraud and Corruption Control Framework applies under PGPA Rule s10'),
  'Fraud and Corruption': cth('Commonwealth Fraud Prevention Centre guidance supports PGPA fraud duties'),
  'Commonwealth Procurement Rules and PGPA procurement controls': cth('Commonwealth Procurement Rules apply to procurement by Commonwealth entities'),
  'Budget Process Operational Rules and Commonwealth Budget process': cth('Budget Process Operational Rules apply to new policy proposals'),
  'Public Service Act 1999 Cth': (p) => (p.sectorType === 'cth-ncce' || p.sectorType === 'cth-cce' ? M('Entity engages APS employees under the Public Service Act') : null),
  'APS Employment Code Conduct': (p) => (p.sectorType === 'cth-ncce' || p.sectorType === 'cth-cce' ? M('APS Code of Conduct applies to APS employees') : null),
  'Public Interest Disclosure Act 2013 and Commonwealth Ombudsman agency guidance': (p) => (isCth(p) ? M('PID Act applies to Commonwealth public sector agencies') : flag(p, 'cthContractor') ? C('Contracted service providers are covered by the PID Act') : null),
  'National Anti-Corruption Commission Act 2022 and mandatory referral obligations': (p) => (isCth(p) ? M('Agency heads must refer serious or systemic corrupt conduct to the NACC') : flag(p, 'cthContractor') ? C('Contracted service providers are within NACC jurisdiction') : null),
  'Australian Government Investigations Standard 2022': cth('AGIS applies to Commonwealth investigations'),
  'NDIA Accountable Authority Instructions': (p) => (/ndia/i.test(p.shortName || '') && isCth(p) ? M('Accountable Authority Instructions issued under PGPA s20A') : null),

  'Archives Act 1983': cth('Commonwealth records must be managed under the Archives Act'),
  'National Archives Information Management Standard for Australian Government': cth('NAA Information Management Standard applies to Commonwealth agencies'),
  'National Archives Building Trust in the Public Record Policy and Information Management Standard': cth('Building Trust in the Public Record policy applies to Commonwealth agencies'),
  'Freedom of Information Act 1982': cth('FOI Act gives the public a right to access Commonwealth documents'),
  'Administrative Review Tribunal Act 2024': (p) => (isCth(p) ? C('Applies where the entity makes reviewable administrative decisions') : null),
  'Electronic Transactions Act 1999': (p) => (isCth(p) ? M('Electronic transactions under Commonwealth law must meet ETA requirements') : C('Applies to electronic transactions and signatures under Commonwealth laws')),
  'Data Availability and Transparency Act 2022': (p) => (isCth(p) ? C('Applies where the entity shares public sector data under the DATA Scheme') : null),
  'Data Act 2022': (p) => (isCth(p) ? C('Applies where the entity is a data custodian or accredited user under the DATA Scheme') : null),
  'Australian Government Data Governance Framework': cthRec('Australian Government data governance expectations'),
  'OAIC Guidelines on Data Matching in Australian Government Administration': (p) => (isCth(p) ? C('Applies where the entity conducts data-matching programs') : null),
  'Australian Government protective markings and information classification requirements': (p) => (isCth(p) || flag(p, 'classified') ? M('Government information must be classified and marked') : null),

  'Privacy Act 1988 and Australian Privacy Principles': (p) => (privacyActApplies(p) ? M(isCth(p) ? 'Commonwealth agency — bound by the Australian Privacy Principles' : 'APP entity (turnover above $3m, health service provider or contracted to the Commonwealth)') : flag(p, 'personalInfo') ? R('Small-business exemption may apply — APPs remain better practice') : null),
  'Australian Privacy Principle': (p) => (privacyActApplies(p) ? M('APP entity — Australian Privacy Principles apply') : null),
  'Privacy Amendment 2024': (p) => (privacyActApplies(p) ? M('Privacy and Other Legislation Amendment Act 2024 amends APP entity obligations') : null),
  'Privacy Regulations 2025': (p) => (privacyActApplies(p) ? M('Privacy Regulations 2025 prescribe APP entity requirements') : null),
  'Notifiable Data Breaches Scheme': (p) => (privacyActApplies(p) ? M('Eligible data breaches must be notified to the OAIC and affected individuals') : null),
  'Notifiable Data Breaches scheme': (p) => (privacyActApplies(p) ? M('Eligible data breaches must be notified to the OAIC and affected individuals') : null),
  'Privacy Code': (p) => (isCth(p) ? M('Australian Government Agencies Privacy Code applies to Commonwealth agencies') : null),
  'AG Agencies Privacy Code': (p) => (isCth(p) ? M('Australian Government Agencies Privacy Code applies to Commonwealth agencies') : null),
  'TFN Rule': (p) => (flag(p, 'tfn') ? M('Tax file number recipients must comply with the Privacy (TFN) Rule 2015') : null),
  'Healthcare Identifiers Act 2010': (p) => (flag(p, 'healthInfo') && (hasInd(p, 'health', 'aged-care', 'disability-ndis')) ? C('Applies where healthcare identifiers are collected, used or disclosed') : null),

  'NDIS Act 2013': (p) => (hasInd(p, 'disability-ndis') ? (isCth(p) ? M('Entity administers or regulates the NDIS under the NDIS Act') : C('NDIS providers are subject to NDIS Act obligations, including protected information')) : null),
  'NDIS (Protection and Disclosure of Information) Rules 2013': (p) => (hasInd(p, 'disability-ndis') && isCth(p) ? M('Protected NDIS information must be handled under the PDI Rules') : null),
  'NDIS Quality and Safeguards Commission provider rules, Practice Standards and Code of Conduct': (p) => (flag(p, 'ndisProvider') ? M('Registered NDIS providers must meet the Practice Standards and Code of Conduct') : hasInd(p, 'disability-ndis') ? C('Applies to NDIS provider interactions and integrations') : null),

  'Security of Critical Infrastructure Act 2018': (p) => (flag(p, 'criticalInfrastructure') ? M('Responsible entity for a critical infrastructure asset — SOCI obligations apply') : isCth(p) ? C('Applies to systems of government significance or where critical data services are provided') : null),
  'Cyber Security Act 2024 and Cyber Security (Ransomware Payment Reporting) Rules 2025': (p) =>
    flag(p, 'turnoverOver3m') && !isGov(p) ? M('Reporting business entity (turnover above $3m) — ransomware payments must be reported within 72 hours')
      : flag(p, 'criticalInfrastructure') ? M('Responsible entity for a critical infrastructure asset — ransomware payment reporting applies')
        : isGov(p) ? C('Government entities are generally excluded from ransomware reporting; Cyber Incident Review Board cooperation may apply') : null,
  'Consumer Data Right information security and conformance': (p) => (flag(p, 'cdr') ? M('CDR participant — Schedule 2 information security controls apply') : null),
  'PCI DSS v4.0.1': (p) => (flag(p, 'paymentCards') ? M('Card payments are processed — PCI DSS is required by card schemes and acquirers') : null),
  'Digital ID Act 2024': (p) => (flag(p, 'digitalId') ? C('Participant in or relying party of the Australian Government Digital ID System') : null),
  'Identity Verification Services Act 2023': (p) => (flag(p, 'digitalId') ? C('Applies where the Document or Face Verification Services are used') : null),

  'Digital Experience': cthRec('DTA Digital Experience Policy applies to Commonwealth digital services'),
  'Digital Service Standard v2.0': (p) => (isCth(p) ? M('Digital Service Standard applies to new and significantly changed Commonwealth services') : flag(p, 'publicDigital') && isGov(p) ? R('Better-practice digital service design') : null),
  'Digital Access Standard': cthRec('Digital Access Standard applies to Commonwealth digital services'),
  'Digital Inclusion Standard': cthRec('Digital Inclusion Standard applies to Commonwealth digital services'),
  'Digital Performance Standard': cthRec('Digital Performance Standard applies to Commonwealth digital services'),
  'Web Content Accessibility Guidelines 2.2 and Australian Government accessibility standard': (p) => (isCth(p) ? M('Commonwealth digital content must meet WCAG 2.2 AA') : flag(p, 'publicDigital') ? R('WCAG supports Disability Discrimination Act compliance for public digital services') : null),
  'Australian Government Architecture Digital Portal Standard': cth(),
  'Australian Government Architecture Security Standards': cth(),
  'Australian Government Architecture Web Content Management Standard': cth(),
  'Australian Government Architecture and Investment Oversight Framework': cth(),
  'AGA Application Programming Interfaces Standard': cthRec('AGA API Standard applies to Commonwealth APIs', 'API design better practice'),
  'Australian Government Branding Guidelines': cth(),
  'Australian Government Style Manual': cthRec('Style Manual applies to Commonwealth content', 'Plain-language content better practice'),
  'Multicultural Access and Equity Policy and Australian Government Language Services Guidelines': cth(),
  'Responsible AI': (p) => (isCth(p) ? M('Policy for the responsible use of AI in government applies to Commonwealth entities') : flag(p, 'usesAI') ? R('Responsible AI better practice') : null),
  'ICT Investment IOF': cth('Investment Oversight Framework applies to digital and ICT investments'),
  'Assurance Framework for Digital and ICT Investments': cth('DTA Assurance Framework applies to digital and ICT-enabled investments'),
  'Benefits Management Policy for Digital and ICT-Enabled Investments': cth('Benefits Management Policy applies to digital and ICT-enabled investments'),
  'Digital Investment Plan Policy and Guidebook': cth('Digital Investment Plan policy applies to Commonwealth entities'),
  'Digital Sourcing policies, BuyICT and sourcing framework': cth('Digital Sourcing Framework applies to ICT procurement'),
  'ICT Procurement Sourcing': cth('ICT procurement sourcing rules apply'),
  'Digital and ICT Reuse Policy and Reuse Standard': cth('Digital and ICT Reuse Policy applies'),
  'Environmentally Sustainable Procurement Policy and APS Net Zero 2030 technology obligations': cth('APS Net Zero 2030 and ESP Policy apply'),
  'Commonwealth Child Safe Framework': (p) => (isCth(p) ? M('Commonwealth Child Safe Framework applies to non-corporate entities and is adopted by corporate entities') : null),

  'Disability Discrimination Act 1992': (p) => M(flag(p, 'publicDigital') ? 'Goods, services and facilities (including digital) must not discriminate on the basis of disability' : 'Employers and service providers must not discriminate on the basis of disability'),
  'Age Discrimination Act 2004': () => M('Applies to all Australian employers and service providers'),
  'Sex Discrimination Act 1984': () => M('Applies to all Australian employers — includes positive duty to prevent sexual harassment'),
  'Racial Discrimination Act 1975': () => M('Applies to all Australian employers and service providers'),
  'AHRC Act 1986': () => M('Australian Human Rights Commission Act applies to employers'),
  'Fair Work Act 2009 Cth': (p) => (isStateGov(p) || p.sectorType === 'local-gov' ? C('State public sector employment may be covered by state industrial law') : M('National workplace relations system employer')),
  'Work Health and Safety Act 2011': () => M('Persons conducting a business or undertaking owe WHS duties'),
  'WHS Psychosocial Code': () => M('Psychosocial hazards must be managed under WHS laws and codes of practice'),
  'Copyright Act 1968 Cth': () => M('Use of copyright material through ICT must comply with the Copyright Act'),
  'Criminal Code Act 1995': () => M('Computer offences and misuse of information are criminal offences'),
  'TIA Act 1979': () => M('Interception of and access to communications is regulated by the TIA Act'),
  'Online Safety Act 2021 Cth': (p) => (flag(p, 'publicDigital') ? C('Applies to online services provided to Australians and to user conduct') : R('Online safety expectations for ICT users')),
  'Surveillance Laws': () => M('State and territory surveillance devices laws regulate monitoring'),
  'Workplace Surveillance NSW': (p) => (inState(p, 'NSW') ? M('Workplace Surveillance Act 2005 (NSW) — notice required for computer surveillance') : null),
  'Workplace Privacy ACT': (p) => (inState(p, 'ACT') ? M('Workplace Privacy Act 2011 (ACT) — notice required for workplace surveillance') : null),

  'CIS Critical Security Controls v8.1': allRec('Industry-recognised prioritised security controls'),
  'CIS Benchmarks': allRec('Secure configuration benchmarks for hardening'),
  'MITRE ATT&CK': allRec('Threat-informed defence framework'),
  'OWASP ASVS and OWASP SAMM': (p) => (flag(p, 'publicDigital') || hasInd(p, 'technology') ? R('Application security verification and software assurance') : null),
  'FIPS 140-3 and NIST SP 800-57 cryptographic standards': allRec('Cryptographic module and key management standards'),
  'NIST SP 800-63-4 Digital Identity Guidelines and SP 800-207 Zero Trust Architecture': allRec('Digital identity and zero trust architecture guidance'),
  'Federation, authorization, provisioning and passkey technical standards': allRec('Open identity federation and authentication standards'),
};

// Additional sources not present in the reference register.
// Each obligation is mapped to a requirement template in the requirement library (req).
export const EXTRA_SOURCES = [
  {
    name: 'APRA CPS 234 Information Security', publisher: 'Australian Prudential Regulation Authority', type: 'Prudential standard', source: 'Prudential standards',
    url: 'https://www.apra.gov.au/information-security', rule: (p) => (flag(p, 'apra') ? M('APRA-regulated entity — CPS 234 is binding') : null),
    obligations: [
      ['CPS234-01', 'CPS 234 para 13', 'The Board is ultimately responsible for the information security of the entity and must ensure it maintains information security commensurate with threats.', 'NDIA-ICT-CYB-001'],
      ['CPS234-02', 'CPS 234 paras 15–16', 'Clearly define information-security roles and responsibilities of the Board, senior management, governing bodies and individuals.', 'NDIA-ICT-CYB-001'],
      ['CPS234-03', 'CPS 234 paras 17–19', 'Maintain an information security capability commensurate with the size and extent of threats, including assessing third-party capability.', 'NDIA-ICT-CYB-011'],
      ['CPS234-04', 'CPS 234 paras 20–23', 'Classify information assets by criticality and sensitivity and implement controls to protect them.', 'NDIA-ICT-CYB-007'],
      ['CPS234-05', 'CPS 234 paras 24–26', 'Maintain an information security policy framework and implement controls commensurate with vulnerabilities, threats and asset criticality.', 'NDIA-ICT-CYB-003'],
      ['CPS234-06', 'CPS 234 paras 27–30', 'Test the effectiveness of controls through a systematic testing program commensurate with change and threat.', 'NDIA-ICT-CYB-013'],
      ['CPS234-07', 'CPS 234 paras 23–24', 'Maintain plans to respond to information security incidents and review and test them annually.', 'NDIA-ICT-CYB-010'],
      ['CPS234-08', 'CPS 234 paras 35–36', 'Notify APRA within 72 hours of a material information security incident, and within 10 business days of a material control weakness.', 'NDIA-ICT-CYB-010'],
      ['CPS234-09', 'CPS 234 paras 31–34', 'Internal audit must review the design and operating effectiveness of information security controls, including third-party controls.', 'NDIA-ICT-CYB-013'],
    ],
  },
  {
    name: 'APRA CPS 230 Operational Risk Management', publisher: 'Australian Prudential Regulation Authority', type: 'Prudential standard', source: 'Prudential standards',
    url: 'https://www.apra.gov.au/operational-risk-management', rule: (p) => (flag(p, 'apra') ? M('APRA-regulated entity — CPS 230 is binding from 1 July 2025') : null),
    obligations: [
      ['CPS230-01', 'CPS 230 paras 20–23', 'Maintain an operational risk management framework, with Board oversight of operational risk, controls and resilience.', 'NDIA-ICT-DRP-001'],
      ['CPS230-02', 'CPS 230 paras 30–33', 'Maintain and test internal controls designed to ensure operational risk is managed within appetite.', 'NDIA-ICT-SVM-002'],
      ['CPS230-03', 'CPS 230 paras 34–36', 'Identify critical operations and set tolerance levels for maximum disruption, data loss and minimum service levels.', 'NDIA-ICT-DRP-002'],
      ['CPS230-04', 'CPS 230 paras 37–42', 'Maintain a credible business continuity plan and a systematic testing program, reviewed annually.', 'NDIA-ICT-DRP-010'],
      ['CPS230-05', 'CPS 230 paras 47–55', 'Maintain a service provider management policy, register of material arrangements and formal agreements with material service providers.', 'NDIA-ICT-CYB-011'],
      ['CPS230-06', 'CPS 230 para 42', 'Notify APRA within 24 hours of a disruption to a critical operation outside tolerance and when a BCP is activated.', 'NDIA-ICT-DRP-006'],
      ['CPS230-07', 'CPS 230 paras 38–39', 'Undertake scenario analysis of severe but plausible disruptions, including cyber attacks and loss of a service provider.', 'NDIA-ICT-DRP-010'],
    ],
  },
  {
    name: 'APRA CPS 510 Governance', publisher: 'Australian Prudential Regulation Authority', type: 'Prudential standard', source: 'Prudential standards',
    url: 'https://www.apra.gov.au/governance', rule: (p) => (flag(p, 'apra') ? M('APRA-regulated entity — CPS 510 governance requirements apply') : null),
    obligations: [
      ['CPS510-01', 'CPS 510 Board composition and charter', 'The Board must have a charter and be responsible for the entity\'s governance, including oversight of technology and risk.', 'NDIA-ICT-GOV-003'],
      ['CPS510-02', 'CPS 510 Board Audit Committee', 'Establish a Board Audit Committee overseeing internal and external audit, including technology audit.', 'NDIA-ICT-GOV-026'],
      ['CPS510-03', 'CPS 510 Board Risk Committee', 'Establish a Board Risk Committee overseeing the risk management framework, including cyber and technology risk.', 'NDIA-ICT-CYB-001'],
    ],
  },
  {
    name: 'Corporations Act 2001 — directors\' duties and records', publisher: 'Australian Securities and Investments Commission', type: 'Legislation', source: 'Commonwealth legislation',
    url: 'https://www.legislation.gov.au/C2004A00818/latest', rule: (p) => (['listed', 'private', 'nfp', 'cth-company'].includes(p.sectorType) ? M('Company registered under the Corporations Act') : null),
    obligations: [
      ['CORP-01', 's180 Care and diligence', 'Directors and officers must exercise care and diligence, which ASIC and the courts have held extends to oversight of cyber security risk.', 'NDIA-ICT-CYB-001'],
      ['CORP-02', 's286 Financial records', 'Keep written financial records that correctly record transactions and allow true and fair financial statements; retain for 7 years.', 'NDIA-ICT-AUP-009'],
      ['CORP-03', 's1317AA Whistleblower protections', 'Protect eligible whistleblowers; public companies and large proprietary companies must have a whistleblower policy.', 'NDIA-ICT-INT-004'],
      ['CORP-04', 's912A (AFS licensees)', 'AFS licensees must have adequate risk management systems and resources, including cyber resilience (ASIC v RI Advice).', 'NDIA-ICT-CYB-003'],
    ],
  },
  {
    name: 'ASX Listing Rules and Corporate Governance Principles', publisher: 'ASX Limited', type: 'Listing rules', source: 'Market rules',
    url: 'https://www.asx.com.au/about/regulation/rules-guidance-notes-and-waivers/asx-listing-rules-guidance-notes-and-waivers', rule: (p) => (p.sectorType === 'listed' ? M('ASX-listed entity') : null),
    obligations: [
      ['ASX-01', 'Listing Rule 3.1 Continuous disclosure', 'Immediately disclose information a reasonable person would expect to have a material effect on price, including material cyber incidents.', 'NDIA-ICT-CYB-010'],
      ['ASX-02', 'CGP Recommendation 7.1–7.2', 'Maintain a risk committee and review the risk management framework at least annually, including cyber risk.', 'NDIA-ICT-CYB-001'],
      ['ASX-03', 'CGP Recommendation 7.3', 'Disclose the structure and role of the internal audit function, or how risk and controls are evaluated.', 'NDIA-ICT-CYB-013'],
      ['ASX-04', 'CGP Recommendation 7.4', 'Disclose material exposure to environmental and social risks and how they are managed.', 'NDIA-ICT-INF-016'],
    ],
  },
  {
    name: 'AML/CTF Act 2006 and Rules', publisher: 'AUSTRAC', type: 'Legislation', source: 'Commonwealth legislation',
    url: 'https://www.austrac.gov.au/business/legislation', rule: (p) => (flag(p, 'aml') ? M('AUSTRAC reporting entity providing designated services') : null),
    obligations: [
      ['AML-01', 'AML/CTF program', 'Develop, maintain and comply with an AML/CTF program approved by senior management with Board oversight.', 'NDIA-ICT-GOV-003'],
      ['AML-02', 'Customer due diligence', 'Verify customer identity and conduct ongoing customer due diligence using reliable and independent data.', 'NDIA-ICT-IDM-004'],
      ['AML-03', 'Transaction monitoring and reporting', 'Monitor transactions and report suspicious matters, threshold transactions and international funds transfers to AUSTRAC.', 'NDIA-ICT-ING-016'],
      ['AML-04', 'Record keeping', 'Retain transaction and customer identification records for 7 years.', 'NDIA-ICT-IDM-015'],
      ['AML-05', 'Annual compliance report', 'Submit an annual compliance report to AUSTRAC by 31 March for the previous calendar year.', 'NDIA-ICT-CYB-013'],
    ],
  },
  {
    name: 'Spam Act 2003', publisher: 'Australian Communications and Media Authority', type: 'Legislation', source: 'Commonwealth legislation',
    url: 'https://www.acma.gov.au/spam', rule: (p) => (flag(p, 'publicDigital') && !isGov(p) ? M('Sends commercial electronic messages') : null),
    obligations: [
      ['SPAM-01', 's16 Consent', 'Only send commercial electronic messages with consent (express or inferred).', 'NDIA-ICT-AUP-015'],
      ['SPAM-02', 's17 Identification', 'Commercial electronic messages must identify the sender and how to contact them.', 'NDIA-ICT-DEP-004'],
      ['SPAM-03', 's18 Unsubscribe', 'Include a functional unsubscribe facility and action requests within 5 business days.', 'NDIA-ICT-DEP-002'],
    ],
  },
  {
    name: 'Telecommunications Act 1997 and data retention obligations', publisher: 'Department of Home Affairs / ACMA', type: 'Legislation', source: 'Commonwealth legislation',
    url: 'https://www.homeaffairs.gov.au/about-us/our-portfolios/national-security/lawful-access-telecommunications', rule: (p) => (hasInd(p, 'telco') ? M('Carrier or carriage service provider') : null),
    obligations: [
      ['TEL-01', 'Part 5-1A TIA Act — data retention', 'Retain prescribed telecommunications data for two years and protect it through encryption and access control.', 'NDIA-ICT-CYB-007'],
      ['TEL-02', 'Part 13 Telecommunications Act', 'Protect the confidentiality of communications and personal information of customers.', 'NDIA-ICT-AUP-007'],
      ['TEL-03', 'Telecommunications (Customer Communications) — identity verification', 'Apply multi-factor identity verification before high-risk customer transactions such as SIM swaps.', 'NDIA-ICT-IDM-004'],
      ['TEL-04', 'Emergency call service determination', 'Maintain emergency call service availability and notify outages as required.', 'NDIA-ICT-SVM-012'],
    ],
  },
  {
    name: 'Scams Prevention Framework Act 2025', publisher: 'Australian Competition and Consumer Commission / Treasury', type: 'Legislation', source: 'Commonwealth legislation',
    url: 'https://treasury.gov.au/scams-prevention-framework', rule: (p) => (hasInd(p, 'banking', 'telco') || (hasInd(p, 'technology') && flag(p, 'publicDigital')) ? C('Designated sectors (banks, telcos, digital platforms) must meet SPF principles once sector codes commence') : null),
    obligations: [
      ['SPF-01', 'Governance principle', 'Implement scam prevention governance, policies and annual certification by senior officers.', 'NDIA-ICT-CYB-001'],
      ['SPF-02', 'Prevent, detect and disrupt', 'Take reasonable steps to prevent, detect and disrupt scams, including acting on actionable scam intelligence.', 'NDIA-ICT-ING-016'],
      ['SPF-03', 'Report', 'Report actionable scam intelligence to the ACCC.', 'NDIA-ICT-CYB-009'],
      ['SPF-04', 'Respond', 'Provide accessible internal dispute resolution for scam complaints.', 'NDIA-ICT-DEP-015'],
    ],
  },
  {
    name: 'My Health Records Act 2012', publisher: 'Australian Digital Health Agency', type: 'Legislation', source: 'Commonwealth legislation',
    url: 'https://www.legislation.gov.au/C2012A00063/latest', rule: (p) => (hasInd(p, 'health', 'aged-care') && flag(p, 'healthInfo') ? C('Healthcare provider organisation registered to access My Health Record') : null),
    obligations: [
      ['MHR-01', 'Rule 42 Security and access policy', 'Maintain a written security and access policy for My Health Record access, reviewed at least annually.', 'NDIA-ICT-IDM-006'],
      ['MHR-02', 's75 Data breach notification', 'Notify the System Operator and OAIC of unauthorised access to My Health Record information.', 'NDIA-ICT-IDM-014'],
      ['MHR-03', 'Rule 44 Training', 'Train staff before they access the My Health Record system.', 'NDIA-ICT-CYB-012'],
    ],
  },
  {
    name: 'Aged Care Act 2024 and Strengthened Aged Care Quality Standards', publisher: 'Department of Health, Disability and Ageing / Aged Care Quality and Safety Commission', type: 'Legislation', source: 'Commonwealth legislation',
    url: 'https://www.health.gov.au/our-work/aged-care-act', rule: (p) => (hasInd(p, 'aged-care') ? M('Registered aged care provider') : null),
    obligations: [
      ['ACA-01', 'Standard 2 — governance', 'Governing body is accountable for quality and safety, including information management and digital systems.', 'NDIA-ICT-GOV-003'],
      ['ACA-02', 'Record keeping and information management', 'Maintain accurate, secure and accessible care records and protect personal information.', 'NDIA-ICT-AUP-009'],
      ['ACA-03', 'Incident management (SIRS)', 'Manage and report serious incidents through an effective incident management system.', 'NDIA-ICT-SVM-011'],
      ['ACA-04', 'Continuity of care', 'Maintain business continuity arrangements so critical care is not disrupted by system outages.', 'NDIA-ICT-DRP-002'],
    ],
  },
  {
    name: 'Modern Slavery Act 2018', publisher: 'Attorney-General\'s Department', type: 'Legislation', source: 'Commonwealth legislation',
    url: 'https://modernslaveryregister.gov.au/', rule: (p) => (flag(p, 'turnoverOver100m') ? M('Consolidated revenue above $100m — annual modern slavery statement required') : null),
    obligations: [
      ['MSA-01', 's16 Modern slavery statement', 'Publish an annual modern slavery statement within six months of the end of the reporting period.', 'NDIA-ICT-TEP-010'],
      ['MSA-02', 's16(1)(c) Supply chain risk', 'Assess modern slavery risks in operations and supply chains, including ICT hardware and services.', 'NDIA-ICT-SVM-006'],
      ['MSA-03', 's16(1)(e) Effectiveness', 'Assess and report the effectiveness of actions taken.', 'NDIA-ICT-TEP-010'],
    ],
  },
  {
    name: 'Mandatory climate-related financial disclosures (AASB S2)', publisher: 'Australian Accounting Standards Board / ASIC', type: 'Legislation', source: 'Commonwealth legislation',
    url: 'https://asic.gov.au/regulatory-resources/sustainability-reporting/', rule: (p) => (flag(p, 'largeEntity') && !isGov(p) ? M('Large entity required to prepare sustainability reports under the Corporations Act') : null),
    obligations: [
      ['CLIM-01', 'AASB S2 Governance', 'Disclose governance processes used to monitor climate-related risks and opportunities.', 'NDIA-ICT-INF-016'],
      ['CLIM-02', 'AASB S2 Metrics', 'Disclose scope 1 and 2 (and later scope 3) greenhouse gas emissions, including data-centre and ICT energy.', 'NDIA-ICT-INF-016'],
      ['CLIM-03', 'Records', 'Retain records supporting sustainability disclosures for 7 years.', 'NDIA-ICT-INF-006'],
    ],
  },
  {
    name: 'Australian Consumer Law', publisher: 'Australian Competition and Consumer Commission', type: 'Legislation', source: 'Commonwealth legislation',
    url: 'https://consumer.gov.au/australian-consumer-law', rule: (p) => (!isGov(p) ? M('Supplies goods or services to consumers') : null),
    obligations: [
      ['ACL-01', 's18 Misleading or deceptive conduct', 'Digital content, apps and online representations must not be misleading or deceptive (including privacy and security claims).', 'NDIA-ICT-DEP-004'],
      ['ACL-02', 'Unfair contract terms', 'Standard-form consumer and small business contracts, including online terms, must not contain unfair terms.', 'NDIA-ICT-TEP-010'],
    ],
  },
  {
    name: 'NSW Privacy and Personal Information Protection Act 1998 (incl. MNDB scheme)', publisher: 'Information and Privacy Commission NSW', type: 'Legislation', source: 'NSW legislation',
    url: 'https://www.ipc.nsw.gov.au/privacy', rule: (p) => ((isStateGov(p) || p.sectorType === 'local-gov') && inState(p, 'NSW') ? M('NSW public sector agency') : null),
    obligations: [
      ['NSWP-01', 'Information Protection Principles', 'Collect, store, use and disclose personal information in accordance with the 12 IPPs.', 'NDIA-ICT-AUP-006'],
      ['NSWP-02', 'Part 6A Mandatory notification of data breach', 'Assess suspected eligible data breaches within 30 days and notify the Privacy Commissioner and affected individuals.', 'NDIA-ICT-IDM-014'],
      ['NSWP-03', 's59ZD Data breach policy', 'Publish a data breach policy and maintain an internal register of eligible data breaches.', 'NDIA-ICT-CYB-010'],
      ['NSWP-04', 's33 Privacy management plan', 'Prepare and implement a privacy management plan.', 'NDIA-ICT-AUP-005'],
    ],
  },
  {
    name: 'NSW Health Records and Information Privacy Act 2002', publisher: 'Information and Privacy Commission NSW', type: 'Legislation', source: 'NSW legislation',
    url: 'https://www.ipc.nsw.gov.au/privacy/health-privacy', rule: (p) => (inState(p, 'NSW') && flag(p, 'healthInfo') ? M('Holds health information in NSW') : null),
    obligations: [
      ['HRIP-01', 'Health Privacy Principles', 'Handle health information in accordance with the 15 Health Privacy Principles.', 'NDIA-ICT-ING-006'],
      ['HRIP-02', 'HPP 5 Retention and security', 'Protect health information by reasonable security safeguards and retain for prescribed periods.', 'NDIA-ICT-CYB-007'],
      ['HRIP-03', 'HPP 7–8 Access and amendment', 'Provide individuals with access to and correction of their health information.', 'NDIA-ICT-IDM-013'],
    ],
  },
  {
    name: 'NSW Cyber Security Policy', publisher: 'Cyber Security NSW', type: 'Mandatory policy', source: 'NSW Government policy',
    url: 'https://www.digital.nsw.gov.au/policy/cyber-security/cyber-security-policy', rule: (p) => (isStateGov(p) && inState(p, 'NSW') ? M('NSW Government agency — mandatory requirements apply') : p.sectorType === 'local-gov' && inState(p, 'NSW') ? R('Recommended for NSW local councils') : null),
    obligations: [
      ['NSWC-01', 'Mandatory requirement 1 — governance', 'Implement cyber security governance, including a CISO or equivalent and a cyber risk register.', 'NDIA-ICT-CYB-001'],
      ['NSWC-02', 'Mandatory requirement 2 — culture', 'Build a cyber-aware culture with annual awareness training.', 'NDIA-ICT-CYB-012'],
      ['NSWC-03', 'Mandatory requirement 3 — Essential Eight', 'Implement the Essential Eight and report maturity annually.', 'NDIA-ICT-CYB-004'],
      ['NSWC-04', 'Mandatory requirement 4 — incident response', 'Maintain and test a cyber incident response plan and report incidents to Cyber Security NSW.', 'NDIA-ICT-CYB-010'],
      ['NSWC-05', 'Annual reporting', 'Report compliance with the policy and Essential Eight maturity to Cyber Security NSW annually and attest in the annual report.', 'NDIA-ICT-CYB-013'],
    ],
  },
  {
    name: 'NSW State Records Act 1998', publisher: 'Museums of History NSW (State Archives)', type: 'Legislation', source: 'NSW legislation',
    url: 'https://staterecords.nsw.gov.au/recordkeeping', rule: (p) => ((isStateGov(p) || p.sectorType === 'local-gov') && inState(p, 'NSW') ? M('NSW public office') : null),
    obligations: [
      ['NSWSR-01', 's12 Records management program', 'Establish and maintain a records management program in conformity with standards.', 'NDIA-ICT-AUP-009'],
      ['NSWSR-02', 's21 Disposal', 'Only dispose of State records in accordance with approved retention and disposal authorities.', 'NDIA-ICT-INF-006'],
    ],
  },
  {
    name: 'Victorian Privacy and Data Protection Act 2014 and VPDSS', publisher: 'Office of the Victorian Information Commissioner', type: 'Legislation', source: 'Victorian legislation',
    url: 'https://ovic.vic.gov.au/data-protection/', rule: (p) => ((isStateGov(p) || p.sectorType === 'local-gov') && inState(p, 'VIC') ? M('Victorian public sector organisation') : null),
    obligations: [
      ['VPDSS-01', 'Information Privacy Principles', 'Handle personal information in accordance with the 10 IPPs.', 'NDIA-ICT-AUP-006'],
      ['VPDSS-02', 'Victorian Protective Data Security Standards', 'Implement the 12 VPDSS across governance, information, personnel, ICT and physical security.', 'NDIA-ICT-CYB-003'],
      ['VPDSS-03', 'Protective Data Security Plan', 'Submit a Protective Data Security Plan to OVIC every two years and an attestation annually.', 'NDIA-ICT-CYB-013'],
      ['VPDSS-04', 'Incident notification', 'Notify OVIC of information security incidents that affect public sector information.', 'NDIA-ICT-CYB-010'],
    ],
  },
  {
    name: 'Victorian Health Records Act 2001', publisher: 'Health Complaints Commissioner (VIC)', type: 'Legislation', source: 'Victorian legislation',
    url: 'https://hcc.vic.gov.au/public/health-records', rule: (p) => (inState(p, 'VIC') && flag(p, 'healthInfo') ? M('Holds health information in Victoria') : null),
    obligations: [
      ['VHR-01', 'Health Privacy Principles', 'Handle health information in accordance with the 11 HPPs.', 'NDIA-ICT-ING-006'],
      ['VHR-02', 'HPP 4 Data security and retention', 'Protect health information and retain for at least 7 years (or to age 25 for children).', 'NDIA-ICT-CYB-007'],
    ],
  },
  {
    name: 'Victorian Public Records Act 1973', publisher: 'Public Record Office Victoria', type: 'Legislation', source: 'Victorian legislation',
    url: 'https://prov.vic.gov.au/recordkeeping-government', rule: (p) => ((isStateGov(p) || p.sectorType === 'local-gov') && inState(p, 'VIC') ? M('Victorian public office') : null),
    obligations: [
      ['VPR-01', 's13 Records management', 'Make and keep full and accurate records and manage them per PROV standards.', 'NDIA-ICT-AUP-009'],
      ['VPR-02', 'Disposal', 'Dispose of records only under approved Retention and Disposal Authorities.', 'NDIA-ICT-INF-006'],
    ],
  },
  {
    name: 'Queensland Information Privacy Act 2009 (QPPs and MNDB)', publisher: 'Office of the Information Commissioner Queensland', type: 'Legislation', source: 'Queensland legislation',
    url: 'https://www.oic.qld.gov.au/information-for/information-privacy', rule: (p) => ((isStateGov(p) || p.sectorType === 'local-gov') && inState(p, 'QLD') ? M('Queensland government agency') : null),
    obligations: [
      ['QIP-01', 'Queensland Privacy Principles', 'Handle personal information in accordance with the QPPs (commenced 1 July 2025).', 'NDIA-ICT-AUP-006'],
      ['QIP-02', 'Chapter 3A Mandatory notification of data breach', 'Assess and notify eligible data breaches to the Information Commissioner and affected individuals.', 'NDIA-ICT-IDM-014'],
      ['QIP-03', 'Data breach policy', 'Publish a data breach policy and maintain a register of eligible data breaches.', 'NDIA-ICT-CYB-010'],
    ],
  },
  {
    name: 'Queensland Information Security Policy (IS18:2018)', publisher: 'Queensland Government Customer and Digital Group', type: 'Mandatory policy', source: 'Queensland Government policy',
    url: 'https://www.forgov.qld.gov.au/information-and-communication-technology/qgea-policies-standards-and-guidelines/information-security-policy-is18-2018', rule: (p) => (isStateGov(p) && inState(p, 'QLD') ? M('Queensland Government department') : null),
    obligations: [
      ['IS18-01', 'Policy requirement 1', 'Implement an ISMS based on ISO/IEC 27001.', 'NDIA-ICT-CYB-001'],
      ['IS18-02', 'Policy requirement 2', 'Apply information security controls commensurate with classification (QGISCF).', 'NDIA-ICT-CYB-007'],
      ['IS18-03', 'Annual attestation', 'Provide an annual ISMS attestation to the Queensland Government CISO.', 'NDIA-ICT-CYB-013'],
    ],
  },
  {
    name: 'WA Privacy and Responsible Information Sharing Act 2024', publisher: 'Office of the Information Commissioner WA', type: 'Legislation', source: 'Western Australian legislation',
    url: 'https://www.wa.gov.au/government/privacy-and-responsible-information-sharing', rule: (p) => ((isStateGov(p) || p.sectorType === 'local-gov') && inState(p, 'WA') ? M('WA public entity') : null),
    obligations: [
      ['PRIS-01', 'Information Privacy Principles', 'Handle personal information in accordance with the IPPs.', 'NDIA-ICT-AUP-006'],
      ['PRIS-02', 'Notifiable information breaches', 'Notify the Information Commissioner and affected individuals of notifiable information breaches.', 'NDIA-ICT-IDM-014'],
      ['PRIS-03', 'Responsible information sharing', 'Share information only under the responsible information sharing framework with appropriate safeguards.', 'NDIA-ICT-ING-005'],
    ],
  },
  {
    name: 'South Australian Cyber Security Framework (SACSF)', publisher: 'Department of the Premier and Cabinet SA', type: 'Mandatory policy', source: 'South Australian Government policy',
    url: 'https://www.dpc.sa.gov.au/resources-and-publications/sa-cyber-security-framework', rule: (p) => (isStateGov(p) && inState(p, 'SA') ? M('South Australian Government agency') : null),
    obligations: [
      ['SACSF-01', 'Governance', 'Maintain cyber security governance, accountability and reporting to the agency head.', 'NDIA-ICT-CYB-001'],
      ['SACSF-02', 'Controls', 'Implement the SACSF control baseline, including Essential Eight strategies.', 'NDIA-ICT-CYB-004'],
      ['SACSF-03', 'Reporting', 'Report compliance with the SACSF annually.', 'NDIA-ICT-CYB-013'],
    ],
  },
  {
    name: 'ACT Information Privacy Act 2014', publisher: 'ACT Ombudsman / OAIC', type: 'Legislation', source: 'ACT legislation',
    url: 'https://www.legislation.act.gov.au/a/2014-24/', rule: (p) => (isStateGov(p) && inState(p, 'ACT') ? M('ACT public sector agency') : null),
    obligations: [
      ['ACTIP-01', 'Territory Privacy Principles', 'Handle personal information in accordance with the TPPs.', 'NDIA-ICT-AUP-006'],
      ['ACTIP-02', 'TPP 11 Security', 'Take reasonable steps to protect personal information from misuse, interference and loss.', 'NDIA-ICT-CYB-007'],
    ],
  },
  {
    name: 'Tasmanian Personal Information Protection Act 2004', publisher: 'Ombudsman Tasmania', type: 'Legislation', source: 'Tasmanian legislation',
    url: 'https://www.legislation.tas.gov.au/view/html/inforce/current/act-2004-046', rule: (p) => ((isStateGov(p) || p.sectorType === 'local-gov') && inState(p, 'TAS') ? M('Tasmanian personal information custodian') : null),
    obligations: [
      ['TASP-01', 'Personal Information Protection Principles', 'Handle personal information in accordance with the PIPPs.', 'NDIA-ICT-AUP-006'],
      ['TASP-02', 'PIPP 4 Data security', 'Protect personal information against misuse, loss and unauthorised access.', 'NDIA-ICT-CYB-007'],
    ],
  },
  {
    name: 'Northern Territory Information Act 2002', publisher: 'Office of the Information Commissioner NT', type: 'Legislation', source: 'NT legislation',
    url: 'https://legislation.nt.gov.au/Legislation/INFORMATION-ACT-2002', rule: (p) => ((isStateGov(p) || p.sectorType === 'local-gov') && inState(p, 'NT') ? M('NT public sector organisation') : null),
    obligations: [
      ['NTIA-01', 'Information Privacy Principles', 'Handle personal information in accordance with the IPPs.', 'NDIA-ICT-AUP-006'],
      ['NTIA-02', 'Records management', 'Maintain records management standards and disposal schedules.', 'NDIA-ICT-AUP-009'],
    ],
  },
  {
    name: 'State and Territory Child Safe Standards', publisher: 'State and territory child safety regulators', type: 'Legislation', source: 'State and territory legislation',
    url: 'https://www.childsafety.gov.au/resources/national-principles-child-safe-organisations', rule: (p) => (flag(p, 'children') && !isCth(p) ? M('Provides services to children — state Child Safe Standards apply') : null),
    obligations: [
      ['CSS-01', 'Governance and culture', 'Embed child safety in leadership, governance and culture.', 'NDIA-ICT-SVM-015'],
      ['CSS-02', 'Online safety', 'Ensure physical and online environments promote safety and minimise risk of harm to children.', 'NDIA-ICT-SVM-015'],
      ['CSS-03', 'Records and reporting', 'Keep records of concerns and complaints and report as required.', 'NDIA-ICT-INT-017'],
    ],
  },
  {
    name: 'Australian Energy Sector Cyber Security Framework (AESCSF)', publisher: 'Australian Energy Market Operator', type: 'Industry framework', source: 'Energy sector framework',
    url: 'https://aemo.com.au/initiatives/major-programs/cyber-security/aescsf-framework-and-resources', rule: (p) => (hasInd(p, 'energy') ? M('Energy market participant — AESCSF self-assessment expected') : null),
    obligations: [
      ['AESCSF-01', 'Security profile target', 'Achieve the AESCSF security profile appropriate to criticality (SP-1 to SP-3).', 'NDIA-ICT-CYB-003'],
      ['AESCSF-02', 'Annual self-assessment', 'Complete the annual AESCSF self-assessment program.', 'NDIA-ICT-CYB-013'],
      ['AESCSF-03', 'OT security', 'Apply cyber controls to operational technology environments and segment IT/OT networks.', 'NDIA-ICT-INF-008'],
    ],
  },
  {
    name: 'Defence Industry Security Program (DISP)', publisher: 'Department of Defence', type: 'Membership requirement', source: 'Defence security',
    url: 'https://www.defence.gov.au/business-industry/industry-governance/industry-regulators/defence-industry-security-program', rule: (p) => (hasInd(p, 'defence') && !isCth(p) ? M('Defence supplier — DISP membership required for Defence contracts') : null),
    obligations: [
      ['DISP-01', 'Governance', 'Appoint a Chief Security Officer and Security Officer and maintain security policies.', 'NDIA-ICT-GOV-004'],
      ['DISP-02', 'Cyber security', 'Implement the Essential Eight (at least ML1) or ISM controls for systems handling Defence information.', 'NDIA-ICT-CYB-004'],
      ['DISP-03', 'Personnel security', 'Ensure personnel hold appropriate AGSVA clearances.', 'NDIA-ICT-INT-005'],
      ['DISP-04', 'Annual Security Report', 'Submit an Annual Security Report to Defence.', 'NDIA-ICT-CYB-013'],
    ],
  },
  {
    name: 'Higher Education Standards Framework (TEQSA)', publisher: 'Tertiary Education Quality and Standards Agency', type: 'Legislative instrument', source: 'Commonwealth legislation',
    url: 'https://www.teqsa.gov.au/how-we-regulate/higher-education-standards-framework-2021', rule: (p) => (p.sectorType === 'university' ? M('Registered higher education provider') : null),
    obligations: [
      ['HESF-01', 'Standard 7.3 Information management', 'Information systems must be secure, accurate and protect personal information.', 'NDIA-ICT-CYB-007'],
      ['HESF-02', 'Standard 6.2 Corporate monitoring', 'The governing body must monitor risks, including cyber and academic integrity risks.', 'NDIA-ICT-CYB-001'],
    ],
  },
  {
    name: 'ISO/IEC 27001:2022 Information security management systems', publisher: 'International Organization for Standardization', type: 'International standard', source: 'Voluntary standard',
    url: 'https://www.iso.org/standard/27001', rule: allRec('International benchmark for information security management'),
    obligations: [
      ['ISO27001-01', 'Clause 5 Leadership', 'Top management demonstrates leadership and commitment to the ISMS and establishes an information security policy.', 'NDIA-ICT-CYB-001'],
      ['ISO27001-02', 'Clause 6.1 Risk assessment and treatment', 'Define and apply an information security risk assessment and treatment process and Statement of Applicability.', 'NDIA-ICT-AAP-003'],
      ['ISO27001-03', 'Annex A 5.19–5.23 Supplier relationships', 'Manage information security in supplier relationships and cloud services.', 'NDIA-ICT-CYB-011'],
      ['ISO27001-04', 'Annex A 5.24–5.28 Incident management', 'Plan, assess, respond to and learn from information security incidents.', 'NDIA-ICT-CYB-010'],
      ['ISO27001-05', 'Annex A 8 Technological controls', 'Implement technological controls including access, cryptography, logging and vulnerability management.', 'NDIA-ICT-CYB-003'],
      ['ISO27001-06', 'Clause 9 Performance evaluation', 'Monitor, measure, internally audit and conduct management review of the ISMS.', 'NDIA-ICT-CYB-013'],
    ],
  },
  {
    name: 'ISO 22301:2019 Business continuity management systems', publisher: 'International Organization for Standardization', type: 'International standard', source: 'Voluntary standard',
    url: 'https://www.iso.org/standard/75106.html', rule: allRec('International benchmark for business continuity'),
    obligations: [
      ['ISO22301-01', 'Clause 8.2 BIA and risk assessment', 'Conduct a business impact analysis and risk assessment to set recovery priorities and objectives.', 'NDIA-ICT-DRP-002'],
      ['ISO22301-02', 'Clause 8.4 Business continuity plans', 'Establish and document business continuity plans and procedures.', 'NDIA-ICT-DRP-006'],
      ['ISO22301-03', 'Clause 8.5 Exercise programme', 'Exercise and test business continuity procedures at planned intervals.', 'NDIA-ICT-DRP-010'],
    ],
  },
  {
    name: 'ISO 31000:2018 Risk management', publisher: 'International Organization for Standardization', type: 'International standard', source: 'Voluntary standard',
    url: 'https://www.iso.org/standard/65694.html', rule: allRec('International risk management guideline'),
    obligations: [
      ['ISO31000-01', 'Framework', 'Integrate risk management into governance, strategy and decision-making.', 'NDIA-ICT-AAP-003'],
      ['ISO31000-02', 'Process', 'Identify, analyse, evaluate, treat, monitor and communicate risk.', 'NDIA-ICT-TPP-004'],
    ],
  },
  {
    name: 'ISO/IEC 42001:2023 AI management systems', publisher: 'International Organization for Standardization', type: 'International standard', source: 'Voluntary standard',
    url: 'https://www.iso.org/standard/81230.html', rule: (p) => (flag(p, 'usesAI') ? R('Organisation develops or uses AI') : null),
    obligations: [
      ['ISO42001-01', 'Clause 5 AI policy', 'Establish an AI policy and roles for responsible AI.', 'NDIA-ICT-TPP-015'],
      ['ISO42001-02', 'Clause 6.1.4 AI system impact assessment', 'Assess the impacts of AI systems on individuals and society.', 'NDIA-ICT-SVM-014'],
      ['ISO42001-03', 'Annex A.6 AI lifecycle', 'Manage the AI system lifecycle including data quality, verification and monitoring.', 'NDIA-ICT-DEP-016'],
    ],
  },
  {
    name: 'Voluntary AI Safety Standard (Australia)', publisher: 'Department of Industry, Science and Resources', type: 'National guidance', source: 'Australian Government guidance',
    url: 'https://www.industry.gov.au/publications/voluntary-ai-safety-standard', rule: (p) => (flag(p, 'usesAI') && !isCth(p) ? R('Organisation develops or deploys AI') : null),
    obligations: [
      ['VAISS-01', 'Guardrail 1 Accountability', 'Establish, implement and publish an accountability process for AI, including governance and strategy.', 'NDIA-ICT-TPP-015'],
      ['VAISS-02', 'Guardrail 2 Risk management', 'Establish a risk management process to identify and mitigate AI risks.', 'NDIA-ICT-SVM-014'],
      ['VAISS-03', 'Guardrail 6 Transparency', 'Inform end users about AI-enabled decisions, interactions and AI-generated content.', 'NDIA-ICT-AUP-004'],
      ['VAISS-04', 'Guardrail 5 Human oversight', 'Enable human control or intervention in AI systems.', 'NDIA-ICT-DEP-016'],
    ],
  },
  {
    name: 'NIST Cybersecurity Framework 2.0', publisher: 'National Institute of Standards and Technology (NIST)', type: 'International framework', source: 'Voluntary standard',
    url: 'https://www.nist.gov/cyberframework', rule: allRec('Widely used outcome-based cyber security framework'),
    obligations: [
      ['CSF-01', 'GOVERN (GV)', 'Establish and monitor cyber risk strategy, expectations and policy.', 'NDIA-ICT-CYB-001'],
      ['CSF-02', 'IDENTIFY / PROTECT (ID, PR)', 'Understand assets and risks and use safeguards to manage cyber risk.', 'NDIA-ICT-CYB-003'],
      ['CSF-03', 'DETECT (DE)', 'Find and analyse possible attacks and compromises.', 'NDIA-ICT-CYB-009'],
      ['CSF-04', 'RESPOND / RECOVER (RS, RC)', 'Take action regarding detected incidents and restore affected assets.', 'NDIA-ICT-CYB-010'],
    ],
  },
  {
    name: 'SOC 2 Trust Services Criteria', publisher: 'AICPA', type: 'Assurance standard', source: 'Voluntary standard',
    url: 'https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services', rule: (p) => (hasInd(p, 'technology') ? R('Service organisation providing technology services to customers') : null),
    obligations: [
      ['SOC2-01', 'CC1 Control environment', 'Demonstrate commitment to integrity and oversight of internal control.', 'NDIA-ICT-CYB-001'],
      ['SOC2-02', 'CC6 Logical and physical access', 'Restrict logical and physical access to systems and data.', 'NDIA-ICT-CYB-005'],
      ['SOC2-03', 'CC7–CC8 System operations and change', 'Detect and respond to security events and manage change.', 'NDIA-ICT-SVM-008'],
    ],
  },
  {
    name: 'EU General Data Protection Regulation (GDPR)', publisher: 'European Union', type: 'Foreign legislation', source: 'International legislation',
    url: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj', rule: (p) => (intl(p, 'EU') ? M('Offers goods or services to, or monitors, individuals in the EU') : null),
    obligations: [
      ['GDPR-01', 'Art. 5–6 Principles and lawful basis', 'Process personal data lawfully, fairly and transparently with a lawful basis.', 'NDIA-ICT-AUP-006'],
      ['GDPR-02', 'Art. 15–22 Data subject rights', 'Facilitate access, rectification, erasure, portability and objection rights within one month.', 'NDIA-ICT-IDM-013'],
      ['GDPR-03', 'Art. 25 Data protection by design', 'Implement data protection by design and by default.', 'NDIA-ICT-AUP-005'],
      ['GDPR-04', 'Art. 32 Security of processing', 'Implement appropriate technical and organisational security measures.', 'NDIA-ICT-CYB-003'],
      ['GDPR-05', 'Art. 33–34 Breach notification', 'Notify the supervisory authority within 72 hours of becoming aware of a personal data breach.', 'NDIA-ICT-IDM-014'],
      ['GDPR-06', 'Art. 44–49 International transfers', 'Transfer personal data outside the EU only with appropriate safeguards.', 'NDIA-ICT-ING-005'],
    ],
  },
  {
    name: 'UK GDPR and Data Protection Act 2018', publisher: 'Information Commissioner\'s Office (UK)', type: 'Foreign legislation', source: 'International legislation',
    url: 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/', rule: (p) => (intl(p, 'UK') ? M('Processes personal data of individuals in the UK') : null),
    obligations: [
      ['UKGDPR-01', 'Art. 5 Principles', 'Process personal data in accordance with the UK GDPR principles.', 'NDIA-ICT-AUP-006'],
      ['UKGDPR-02', 'Art. 33 Breach notification', 'Report notifiable breaches to the ICO within 72 hours.', 'NDIA-ICT-IDM-014'],
      ['UKGDPR-03', 'Art. 32 Security', 'Implement appropriate security measures.', 'NDIA-ICT-CYB-003'],
    ],
  },
  {
    name: 'New Zealand Privacy Act 2020', publisher: 'Office of the Privacy Commissioner (NZ)', type: 'Foreign legislation', source: 'International legislation',
    url: 'https://www.privacy.org.nz/privacy-act-2020/', rule: (p) => (intl(p, 'NZ') ? M('Carries on business in New Zealand') : null),
    obligations: [
      ['NZPA-01', 'Information Privacy Principles', 'Handle personal information in accordance with the 13 IPPs.', 'NDIA-ICT-AUP-006'],
      ['NZPA-02', 'Part 6 Notifiable privacy breaches', 'Notify the Privacy Commissioner and affected individuals of serious privacy breaches as soon as practicable.', 'NDIA-ICT-IDM-014'],
    ],
  },
  {
    name: 'US HIPAA Security and Privacy Rules', publisher: 'US Department of Health and Human Services', type: 'Foreign legislation', source: 'International legislation',
    url: 'https://www.hhs.gov/hipaa/index.html', rule: (p) => (intl(p, 'US') && flag(p, 'healthInfo') ? M('Covered entity or business associate handling US protected health information') : null),
    obligations: [
      ['HIPAA-01', '§164.308 Administrative safeguards', 'Conduct risk analysis and implement security management processes.', 'NDIA-ICT-AAP-003'],
      ['HIPAA-02', '§164.312 Technical safeguards', 'Implement access control, audit controls, integrity and transmission security.', 'NDIA-ICT-CYB-005'],
      ['HIPAA-03', '§164.404 Breach notification', 'Notify affected individuals within 60 days of discovery of a breach of unsecured PHI.', 'NDIA-ICT-IDM-014'],
    ],
  },
  {
    name: 'Sarbanes-Oxley Act s404 (ITGC)', publisher: 'US Securities and Exchange Commission', type: 'Foreign legislation', source: 'International legislation',
    url: 'https://www.sec.gov/', rule: (p) => (flag(p, 'usListed') ? M('SEC registrant — ICFR and IT general controls must be assessed') : null),
    obligations: [
      ['SOX-01', 's404 ICFR', 'Management must assess the effectiveness of internal control over financial reporting, including IT general controls.', 'NDIA-ICT-CYB-013'],
      ['SOX-02', 'ITGC — change and access', 'Maintain effective change management and logical access controls over financial systems.', 'NDIA-ICT-SVM-008'],
      ['SOX-03', 'SEC Form 8-K Item 1.05', 'Disclose material cybersecurity incidents within four business days of determining materiality.', 'NDIA-ICT-CYB-010'],
    ],
  },
  {
    name: 'EU Digital Operational Resilience Act (DORA)', publisher: 'European Union', type: 'Foreign legislation', source: 'International legislation',
    url: 'https://eur-lex.europa.eu/eli/reg/2022/2554/oj', rule: (p) => (intl(p, 'EU') && hasInd(p, 'banking', 'insurance', 'financial-services', 'superannuation') ? M('EU financial entity or critical ICT third-party provider') : null),
    obligations: [
      ['DORA-01', 'Art. 5–16 ICT risk management', 'Maintain an ICT risk management framework approved by the management body.', 'NDIA-ICT-CYB-001'],
      ['DORA-02', 'Art. 17–23 Incident reporting', 'Classify and report major ICT-related incidents to competent authorities.', 'NDIA-ICT-CYB-010'],
      ['DORA-03', 'Art. 24–27 Resilience testing', 'Conduct digital operational resilience testing, including TLPT for significant entities.', 'NDIA-ICT-DRP-010'],
      ['DORA-04', 'Art. 28–30 Third-party risk', 'Manage ICT third-party risk and maintain a register of information on ICT contracts.', 'NDIA-ICT-CYB-011'],
    ],
  },
  {
    name: 'EU NIS2 Directive', publisher: 'European Union', type: 'Foreign legislation', source: 'International legislation',
    url: 'https://eur-lex.europa.eu/eli/dir/2022/2555/oj', rule: (p) => (intl(p, 'EU') && (flag(p, 'criticalInfrastructure') || hasInd(p, 'energy', 'transport', 'health', 'water', 'telco', 'technology')) ? C('Essential or important entity operating in the EU') : null),
    obligations: [
      ['NIS2-01', 'Art. 20 Governance', 'Management bodies approve and oversee cyber risk management measures and undertake training.', 'NDIA-ICT-CYB-001'],
      ['NIS2-02', 'Art. 21 Risk management measures', 'Implement cyber risk management measures including supply chain security and MFA.', 'NDIA-ICT-CYB-003'],
      ['NIS2-03', 'Art. 23 Reporting', 'Provide an early warning within 24 hours and an incident notification within 72 hours of significant incidents.', 'NDIA-ICT-CYB-010'],
    ],
  },
  {
    name: 'EU Artificial Intelligence Act', publisher: 'European Union', type: 'Foreign legislation', source: 'International legislation',
    url: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj', rule: (p) => (intl(p, 'EU') && flag(p, 'usesAI') ? C('Provides or deploys AI systems in the EU market') : null),
    obligations: [
      ['EUAI-01', 'Art. 5 Prohibited practices', 'Do not place on the market or use prohibited AI practices.', 'NDIA-ICT-TPP-015'],
      ['EUAI-02', 'Art. 26 Deployer obligations', 'Deployers of high-risk AI must ensure human oversight, monitoring and log retention.', 'NDIA-ICT-SVM-014'],
      ['EUAI-03', 'Art. 50 Transparency', 'Inform people when they interact with AI systems or AI-generated content.', 'NDIA-ICT-AUP-004'],
    ],
  },
];

export const EXTRA_BY_NAME = Object.fromEntries(EXTRA_SOURCES.map((s) => [s.name, s]));

// Build library obligation records (same shape as the register's Obligations tab) for an extra source.
export function extraObligations(src) {
  return src.obligations.map(([id, reference, description, req]) => ({
    id, reference, description, name: src.name, requirementIds: [req], source: src.source,
    publisher: src.publisher, type: src.type, urls: src.url, applicability: '',
  }));
}

export function evaluateSource(name, profile) {
  const rule = LIBRARY_RULES[name] || EXTRA_BY_NAME[name]?.rule;
  if (!rule) return null;
  const res = rule(profile);
  return res ? { level: res[0], reason: res[1] } : null;
}

export const ALL_SOURCE_NAMES = () => [...Object.keys(LIBRARY_RULES), ...EXTRA_SOURCES.map((s) => s.name)];
