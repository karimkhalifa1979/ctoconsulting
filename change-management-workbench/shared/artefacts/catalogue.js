// Standard artefact catalogue (Section 8.2, Table 11). Formats: docx = Word, pdf = PDF, pptx = PowerPoint,
// xlsx = Excel extract, html = HTML for intranet publication (ART-030).

export const FORMAT_LABELS = { docx: 'Word (.docx)', pptx: 'PowerPoint (.pptx)', pdf: 'PDF', xlsx: 'Excel (.xlsx)', html: 'HTML' };

const A = (id, title, purpose, link, formats, sources, extra = {}) => ({
  id, title, purpose, link, formats: [...formats, 'html'], sources,
  defaultFormats: extra.defaultFormats || formats.filter((f) => f !== 'xlsx' && f !== 'pptx').slice(0, 2).concat(formats.includes('pptx') && !formats.includes('docx') ? ['pptx'] : []),
  summaryDeck: !!extra.summaryDeck,
  deliverable: extra.deliverable || null,
  params: extra.params || [],
  release: extra.release || 1,
});

export const CATALOGUE = [
  A('strategy', 'Change Management Strategy', 'Approach, risk profile, sponsorship model and scale of change management', 'Phase 1 deliverable', ['docx', 'pdf', 'pptx'], ['INI', 'IMP', 'RSK', 'STR', 'STK'], { summaryDeck: true, deliverable: 'p1', defaultFormats: ['docx', 'pdf'] }),
  A('masterPlan', 'Master Change Management Plan', 'Integrated, ADKAR-aligned plan (structure in Section 8.5)', 'Phase 2 deliverable', ['docx', 'pdf', 'pptx'], ['ADK', 'PLN', 'SPN', 'PMG', 'COM', 'TRN', 'RES', 'CAN', 'STK'], { summaryDeck: true, deliverable: 'p2', defaultFormats: ['docx', 'pdf', 'pptx'] }),
  A('blueprint', 'ADKAR Blueprint', 'Outcomes, barriers and actions for each ADKAR element, for the organisation or a group', 'Plan and Act', ['docx', 'pdf', 'pptx'], ['ADK'], { params: ['blueprintId'] }),
  A('impactAssessment', 'Change Impact Assessment', 'Impacts by group and aspect, with heatmap and impact timeline', 'Define Impact', ['docx', 'pdf', 'pptx'], ['IMP'], { summaryDeck: true }),
  A('stakeholderPlan', 'Stakeholder Analysis and Engagement Plan', 'Register summary, analysis maps and engagement schedule', 'Define Impact; Plan and Act', ['docx', 'pdf'], ['STK']),
  A('engagementReport', 'Stakeholder Engagement Report', 'Planned versus actual engagements, coverage, sentiment and actions for a period', 'Track Performance', ['docx', 'pdf', 'xlsx'], ['STK'], { params: ['from', 'to'] }),
  A('engagementBrief', 'Stakeholder Engagement Brief', 'One-page brief on a stakeholder before a meeting', 'Plan and Act', ['docx', 'pdf'], ['STK'], { params: ['stakeholderId'] }),
  A('sponsorPack', 'Sponsor Plan and Sponsor Briefing Pack', 'Sponsor activities; briefing on messages, status and requested actions', 'Core plan', ['docx', 'pdf', 'pptx'], ['SPN', 'COM', 'MEA'], { defaultFormats: ['pptx', 'docx'], release: 2 }),
  A('managerBriefing', 'People Manager Plan and Manager Briefing Pack', 'Manager enablement; team-specific impacts, dates, messages and FAQs', 'Core plan', ['docx', 'pdf', 'pptx'], ['PMG', 'IMP', 'COM', 'TRN'], { params: ['managerId', 'groupId'], defaultFormats: ['pptx', 'docx'], release: 2 }),
  A('commsPlan', 'Communications Plan and Calendar', 'Communication items, senders, channels and timing', 'Core plan', ['docx', 'pdf', 'xlsx'], ['COM']),
  A('keyMessages', 'Key Messages and FAQs', 'Approved messages by audience, and FAQs', 'Core plan', ['docx', 'pdf'], ['COM']),
  A('trainingPlan', 'Training Plan and Training Needs Analysis', 'Training needs, interventions, schedule and targets', 'Core plan', ['docx', 'pdf', 'xlsx'], ['TRN'], { release: 2 }),
  A('resistancePlan', 'Resistance Management Plan', 'Anticipated resistance, prevention and response', 'Extend plan', ['docx', 'pdf'], ['RES'], { release: 2 }),
  A('canPlan', 'Change Agent Network Plan', 'Network structure, coverage and activities', 'Extend plan', ['docx', 'pdf'], ['CAN'], { release: 2 }),
  A('coalitionPlan', 'Sponsor Coalition Plan', 'Actions to align coalition members', 'Extend plan', ['docx', 'pdf'], ['SPN'], { release: 2 }),
  A('riskReport', 'Change Risk and PCT Assessment Report', 'Risk profile and initiative health over time', 'Define Approach', ['docx', 'pdf'], ['RSK'], { release: 2 }),
  A('adkarReport', 'ADKAR Assessment Report', 'Results, barrier points and trends by group', 'Track Performance', ['docx', 'pdf', 'pptx'], ['ADK']),
  A('readinessReport', 'Readiness Report', 'Readiness criteria, ADKAR status, training completion and go/no-go recommendation', 'Track Performance', ['docx', 'pdf', 'pptx'], ['RSK', 'ADK', 'TRN', 'MEA']),
  A('steeringPack', 'Steering Committee Pack', 'Progress, readiness, risks, resistance and decisions required', 'Track Performance; Adapt Actions', ['pptx', 'pdf'], ['All'], { defaultFormats: ['pptx', 'pdf'] }),
  A('changeOnAPage', 'Change on a Page', 'Single-page or single-slide summary of the change', 'All phases', ['pptx', 'pdf', 'docx'], ['INI', 'IMP', 'PLN'], { defaultFormats: ['pptx', 'pdf'] }),
  A('sustainmentPlan', 'Sustainment Plan', 'Reinforcement mechanisms and owners', 'Activate Sustainment', ['docx', 'pdf'], ['SUS'], { release: 2 }),
  A('handoverChecklist', 'Handover Checklist', 'Transfer of ownership to business owners', 'Transfer Ownership', ['docx', 'pdf'], ['SUS'], { release: 2 }),
  A('lessonsReport', 'Lessons Learned Report', 'Lessons by category, with recommendations', 'Phase 3', ['docx', 'pdf'], ['SUS'], { release: 2 }),
  A('closeout', 'Change Management Closeout', 'Performance review, sustainment status, handover and lessons', 'Phase 3 deliverable', ['docx', 'pdf', 'pptx'], ['SUS', 'MEA', 'All'], { summaryDeck: true, deliverable: 'p3', defaultFormats: ['docx', 'pdf'] }),
];

export const catalogueEntry = (id) => CATALOGUE.find((c) => c.id === id) || null;

// Narrative sections that practitioners can write once and reuse across artefacts (ART-021).
export const NARRATIVE_KEYS = [
  { id: 'executiveSummary', label: 'Executive summary', usedIn: ['strategy', 'masterPlan', 'steeringPack', 'closeout'] },
  { id: 'approachNarrative', label: 'Change management approach', usedIn: ['strategy', 'masterPlan'] },
  { id: 'statusCommentary', label: 'Status commentary for the period', usedIn: ['steeringPack', 'sponsorPack', 'engagementReport'] },
  { id: 'decisionsRequired', label: 'Decisions and support required', usedIn: ['steeringPack', 'sponsorPack', 'masterPlan'] },
  { id: 'nextPeriod', label: 'Priorities for the next period', usedIn: ['steeringPack'] },
  { id: 'readinessCommentary', label: 'Readiness commentary', usedIn: ['readinessReport', 'masterPlan'] },
  { id: 'closeoutSummary', label: 'Closeout summary', usedIn: ['closeout'] },
  { id: 'managerGuidance', label: 'How managers can support their teams', usedIn: ['managerBriefing'] },
];
