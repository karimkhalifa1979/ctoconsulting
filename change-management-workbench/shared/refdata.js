// Default reference data and configuration (ADM-001, ADM-005, ADM-008; Appendices B and C).
// All of this content is organisation-authored and aligned to the ADKAR Model and the 3-Phase Process;
// it does not reproduce Prosci instruments. Administrators can change every value without code changes.

export const TRADEMARK_NOTICE = 'Prosci® and ADKAR® are registered trademarks of Prosci, Inc. This application references the Prosci Methodology descriptively for alignment purposes and is not affiliated with, or endorsed by, Prosci, Inc.';

// --- ADKAR -------------------------------------------------------------------------------------

export const ADKAR = [
  { id: 'awareness', code: 'Aw', label: 'Awareness', outcome: 'Understands the nature of the change, why it is happening and the risk of not changing.', captures: 'Case for change, key messages, what is and is not changing, awareness evidence and scores.', plans: ['sponsor', 'peopleManager', 'communications'] },
  { id: 'desire', code: 'De', label: 'Desire', outcome: 'Has made a personal decision to support and take part in the change.', captures: "'What's in it for me', motivators, concerns and objections, sentiment, resistance items.", plans: ['sponsor', 'peopleManager', 'resistance'] },
  { id: 'knowledge', code: 'Kn', label: 'Knowledge', outcome: 'Knows how to change: the skills, behaviours, processes and systems required.', captures: 'Training needs, learning objectives, materials and training completion.', plans: ['training', 'peopleManager'] },
  { id: 'ability', code: 'Ab', label: 'Ability', outcome: 'Can apply the knowledge and perform at the required level in day-to-day work.', captures: 'Proficiency evidence, coaching, practice, support arrangements and usage data.', plans: ['training', 'peopleManager'] },
  { id: 'reinforcement', code: 'Re', label: 'Reinforcement', outcome: 'Has the recognition, measurement and accountability that sustain the change.', captures: 'Reinforcement mechanisms, adoption and usage measures, and sustainment owners.', plans: ['sponsor', 'peopleManager', 'communications', 'sustainment'] },
];
export const ADKAR_IDS = ADKAR.map((a) => a.id);
export const adkarLabel = (id) => ADKAR.find((a) => a.id === id)?.label || id;
export const adkarCode = (id) => ADKAR.find((a) => a.id === id)?.code || id;

// Descriptors for practitioner and manager assessments (ADK-004). Score anchors are configurable.
export const ADKAR_SCORE_SCALE = [
  { value: 1, label: 'Not at all' },
  { value: 2, label: 'To a small extent' },
  { value: 3, label: 'Somewhat (neutral)' },
  { value: 4, label: 'To a large extent' },
  { value: 5, label: 'Fully' },
];

export const ADKAR_DESCRIPTORS = {
  awareness: { 1: 'Cannot say what is changing or why.', 3: 'Knows a change is coming but cannot explain the reasons or the risk of not changing.', 5: 'Can explain what is changing, why now, and the consequences of not changing.' },
  desire: { 1: 'Opposes the change or is actively disengaged.', 3: 'Undecided; open to the change but has unresolved concerns.', 5: 'Has chosen to support and take part in the change, and encourages others.' },
  knowledge: { 1: 'Does not know what they will need to do differently.', 3: 'Knows the broad changes but not the detail of new tasks, processes or systems.', 5: 'Knows exactly how to perform the new tasks, processes and behaviours.' },
  ability: { 1: 'Cannot yet perform the new way of working.', 3: 'Can perform some new tasks with support; productivity has dipped.', 5: 'Performs the new way of working proficiently in day-to-day work.' },
  reinforcement: { 1: 'Has reverted to old ways or sees no reason to continue.', 3: 'Continues mostly in the new way, but recognition and accountability are inconsistent.', 5: 'Recognition, measurement and accountability are in place and the change is sustained.' },
};

// Self-assessment survey statements (one per element), written for this application.
export const ADKAR_SURVEY_ITEMS = [
  { id: 'q-aw', element: 'awareness', text: 'I understand why this change is happening, and what is at risk if we do not change.' },
  { id: 'q-de', element: 'desire', text: 'I have decided to support this change and take part in it.' },
  { id: 'q-kn', element: 'knowledge', text: 'I know what I will need to do differently, and how to do it.' },
  { id: 'q-ab', element: 'ability', text: 'I am able to work in the new way in my day-to-day role.' },
  { id: 'q-re', element: 'reinforcement', text: 'Recognition, measurement and support are in place to help me keep working the new way.' },
];

// --- 3-Phase Process (Table 2) --------------------------------------------------------------------

export const PHASES = [
  { id: 'p1', n: 1, label: 'Prepare Approach', deliverable: 'Change Management Strategy', deliverableArtefact: 'strategy', color: '#2d5a8c' },
  { id: 'p2', n: 2, label: 'Manage Change', deliverable: 'Master Change Management Plan', deliverableArtefact: 'masterPlan', color: '#1f7b8a' },
  { id: 'p3', n: 3, label: 'Sustain Outcomes', deliverable: 'Change Management Closeout', deliverableArtefact: 'closeout', color: '#4a7d34' },
];

export const STAGES = [
  { id: 'defineSuccess', phase: 'p1', label: 'Define Success', purpose: 'Clarify what the change must achieve and how success will be measured.', modules: ['INI'], outputs: 'Objectives, benefits, definition of adoption and usage, success measures', route: 'initiative' },
  { id: 'defineImpact', phase: 'p1', label: 'Define Impact', purpose: 'Identify who will need to work differently, and in what ways.', modules: ['IMP', 'STK'], outputs: 'Impacted groups, impact assessment, stakeholder analysis', route: 'impact' },
  { id: 'defineApproach', phase: 'p1', label: 'Define Approach', purpose: 'Determine what it will take to succeed: risk, sponsorship, team and scale.', modules: ['RSK', 'STR'], outputs: 'Risk profile, PCT results, sponsorship model, Change Management Strategy', route: 'strategy' },
  { id: 'planAct', phase: 'p2', label: 'Plan and Act', purpose: 'Plan and carry out the actions that help people make the transition.', modules: ['ADK', 'PLN', 'SPN', 'PMG', 'COM', 'TRN', 'RES', 'CAN', 'STK'], outputs: 'ADKAR Blueprints, Core and Extend plans, engagement and activity records', route: 'plan' },
  { id: 'trackPerformance', phase: 'p2', label: 'Track Performance', purpose: 'Check progress against plans and intended outcomes.', modules: ['MEA', 'ADK', 'STK', 'RPT'], outputs: 'ADKAR trends, readiness, adoption, engagement coverage', route: 'measures' },
  { id: 'adaptActions', phase: 'p2', label: 'Adapt Actions', purpose: 'Adjust plans and tactics in response to results.', modules: ['MEA', 'RES', 'PLN'], outputs: 'Corrective actions, plan revisions and baselines', route: 'measures' },
  { id: 'reviewPerformance', phase: 'p3', label: 'Review Performance', purpose: 'Establish where the initiative stands against its success measures.', modules: ['SUS', 'MEA'], outputs: 'Performance review', route: 'sustain' },
  { id: 'activateSustainment', phase: 'p3', label: 'Activate Sustainment', purpose: 'Put in place what is needed for the change to stick.', modules: ['SUS'], outputs: 'Sustainment Plan, reinforcement mechanisms', route: 'sustain' },
  { id: 'transferOwnership', phase: 'p3', label: 'Transfer Ownership', purpose: 'Hand responsibility for sustaining outcomes to the business.', modules: ['SUS'], outputs: 'Handover, lessons learned, Change Management Closeout', route: 'sustain' },
];

// Mandatory inputs per stage (RUL-18). Each check id is evaluated by shared/rules/stages.js.
export const STAGE_CHECKS = {
  defineSuccess: ['initiativeBasics', 'caseForChange', 'objectives', 'successMeasures', 'adoptionDefinition', 'scope', 'milestones'],
  defineImpact: ['impactedGroups', 'impactsAssessed', 'stakeholdersAnalysed'],
  defineApproach: ['riskAssessed', 'pctBaseline', 'sponsorshipModel', 'changeTeam', 'strategyApproved'],
  planAct: ['orgBlueprint', 'groupBaselines', 'planActivities', 'engagementsPlanned', 'planApproved'],
  trackPerformance: ['followUpAssessment', 'engagementsLogged', 'measureValues'],
  adaptActions: ['coverageAcknowledged', 'correctiveActionsTracked'],
  reviewPerformance: ['performanceReview'],
  activateSustainment: ['sustainmentPlan'],
  transferOwnership: ['handoverAccepted', 'lessonsCaptured', 'closeoutApproved'],
};

export const CHECK_LABELS = {
  initiativeBasics: 'Primary sponsor, change lead and dates recorded',
  caseForChange: 'Case for change captured',
  objectives: 'At least one objective recorded',
  successMeasures: 'Success measures with targets recorded',
  adoptionDefinition: 'Adoption and usage defined',
  scope: 'Scope of the change recorded',
  milestones: 'Key milestones recorded',
  impactedGroups: 'Impacted groups identified',
  impactsAssessed: 'Every impacted group has an impact assessment',
  stakeholdersAnalysed: 'Stakeholders registered and analysed',
  riskAssessed: 'Change characteristics and organisational attributes assessed',
  pctBaseline: 'PCT baseline completed',
  sponsorshipModel: 'Sponsorship model defined',
  changeTeam: 'Change team structure recorded',
  strategyApproved: 'Change Management Strategy approved',
  orgBlueprint: 'Organisation-level ADKAR Blueprint created',
  groupBaselines: 'Baseline ADKAR assessment for every impacted group',
  planActivities: 'Plan activities scheduled',
  engagementsPlanned: 'Engagements planned for priority stakeholders',
  planApproved: 'Master Change Management Plan approved',
  followUpAssessment: 'ADKAR assessment repeated after baseline',
  engagementsLogged: 'Engagements logged against the plan',
  measureValues: 'Adoption and usage measures tracked',
  coverageAcknowledged: 'Plan coverage warnings resolved or acknowledged',
  correctiveActionsTracked: 'Corrective actions logged with owners',
  performanceReview: 'Performance review against success measures completed',
  sustainmentPlan: 'Sustainment Plan with owners in place',
  handoverAccepted: 'Handover accepted by sustainment owners',
  lessonsCaptured: 'Lessons learned captured',
  closeoutApproved: 'Change Management Closeout approved',
};

// --- Plans (Table 3) --------------------------------------------------------------------------------

export const PLAN_TYPES = [
  { id: 'blueprint', label: 'ADKAR Blueprint', category: 'foundation', adkar: ['awareness', 'desire', 'knowledge', 'ability', 'reinforcement'], purpose: 'Desired outcomes, barriers and actions for each ADKAR element, by impacted group.', module: 'ADK' },
  { id: 'sponsor', label: 'Sponsor Plan', category: 'core', adkar: ['awareness', 'desire', 'reinforcement'], purpose: 'Enables the primary sponsor and coalition to participate actively and visibly, build support among peers and communicate directly with employees.', module: 'SPN' },
  { id: 'peopleManager', label: 'People Manager Plan', category: 'core', adkar: ['awareness', 'desire', 'knowledge', 'ability', 'reinforcement'], purpose: 'Prepares people managers to act as communicator, liaison, advocate, resistance manager and coach (CLARC) for their teams.', module: 'PMG' },
  { id: 'communications', label: 'Communications Plan', category: 'core', adkar: ['awareness', 'reinforcement'], purpose: 'Audiences, key messages, senders, channels, timing and frequency.', module: 'COM' },
  { id: 'training', label: 'Training Plan', category: 'core', adkar: ['knowledge', 'ability'], purpose: 'Training needs, interventions, schedules and proficiency.', module: 'TRN' },
  { id: 'resistance', label: 'Resistance Management Plan', category: 'extend', adkar: ['desire'], purpose: 'Prevention of, and response to, resistance, including roles and escalation.', module: 'RES' },
  { id: 'changeAgent', label: 'Change Agent Network Plan', category: 'extend', adkar: [], purpose: 'Activities of change agents who represent impacted groups.', module: 'CAN' },
  { id: 'sponsorCoalition', label: 'Sponsor Coalition Plan', category: 'extend', adkar: [], purpose: 'Alignment of coalition members with the change and its outcomes.', module: 'SPN' },
  { id: 'sustainment', label: 'Sustainment Plan', category: 'extend', adkar: ['reinforcement'], purpose: 'Reinforcement activities and transfer of ownership to business owners.', module: 'SUS' },
];
export const CORE_PLANS = ['sponsor', 'peopleManager', 'communications', 'training'];
export const EXTEND_PLANS = ['resistance', 'changeAgent', 'sponsorCoalition', 'sustainment'];

// Planning approach by risk profile (RUL-14).
export const PLANNING_APPROACHES = [
  { id: 'blueprint', label: 'Blueprint-led', description: 'ADKAR Blueprint, with a Communications Plan as needed.', plans: ['blueprint', 'communications'] },
  { id: 'core', label: 'Blueprint plus Core plans', description: 'ADKAR Blueprint plus the Sponsor, People Manager, Communications and Training plans.', plans: ['blueprint', ...CORE_PLANS] },
  { id: 'full', label: 'Blueprint plus Core and Extend plans', description: 'ADKAR Blueprint, Core plans, a Resistance Management Plan and other Extend plans as needed.', plans: ['blueprint', ...CORE_PLANS, 'resistance', 'changeAgent', 'sponsorCoalition', 'sustainment'] },
];
export const APPROACH_BY_RISK = { low: 'blueprint', medium: 'core', high: 'full' };

// --- Reference lists (Appendix C, extended where noted) ------------------------------------------

const L = (...items) => items.map((x) => (Array.isArray(x) ? { id: x[0], label: x[1], ...(x[2] || {}) } : x));

export const DEFAULT_LISTS = {
  impactDegree: L(['0', '0 None', { value: 0 }], ['1', '1 Very low', { value: 1 }], ['2', '2 Low', { value: 2 }], ['3', '3 Moderate', { value: 3 }], ['4', '4 High', { value: 4 }], ['5', '5 Very high', { value: 5 }]),
  influence: L(['low', 'Low', { value: 1 }], ['medium', 'Medium', { value: 2 }], ['high', 'High', { value: 3 }]),
  interest: L(['low', 'Low', { value: 1 }], ['medium', 'Medium', { value: 2 }], ['high', 'High', { value: 3 }]),
  quadrant: L(['manageClosely', 'Manage closely'], ['keepSatisfied', 'Keep satisfied'], ['keepInformed', 'Keep informed'], ['monitor', 'Monitor']),
  engagementLevel: L(['unaware', 'Unaware', { value: 1 }], ['resistant', 'Resistant', { value: 2 }], ['neutral', 'Neutral', { value: 3 }], ['supportive', 'Supportive', { value: 4 }], ['leading', 'Leading', { value: 5 }]),
  engagementApproach: L(['inform', 'Inform'], ['consult', 'Consult'], ['involve', 'Involve'], ['collaborate', 'Collaborate'], ['empower', 'Empower']),
  sentiment: L(['veryPositive', 'Very positive', { value: 2 }], ['positive', 'Positive', { value: 1 }], ['neutral', 'Neutral', { value: 0 }], ['negative', 'Negative', { value: -1 }], ['veryNegative', 'Very negative', { value: -2 }]),
  engagementStatus: L(['planned', 'Planned'], ['scheduled', 'Scheduled'], ['rescheduled', 'Rescheduled'], ['completed', 'Completed'], ['locked', 'Locked'], ['cancelled', 'Cancelled'], ['didNotProceed', 'Did not proceed']),
  engagementType: L(['oneToOne', 'One-to-one meeting'], ['briefing', 'Briefing'], ['workshop', 'Workshop'], ['townHall', 'Town hall'], ['focusGroup', 'Focus group'], ['demonstration', 'Demonstration'], ['siteVisit', 'Site visit'], ['email', 'Email'], ['intranet', 'Intranet article'], ['newsletter', 'Newsletter'], ['video', 'Video'], ['collabPost', 'Collaboration-platform post'], ['survey', 'Survey'], ['training', 'Training session'], ['coaching', 'Coaching session'], ['teamConversation', 'Team conversation'], ['other', 'Other']),
  channel: L(['inPerson', 'In person'], ['virtual', 'Virtual meeting'], ['phone', 'Phone'], ['written', 'Written'], ['digital', 'Digital']),
  cadence: L(['oneOff', 'One-off', { days: 0 }], ['weekly', 'Weekly', { days: 7 }], ['fortnightly', 'Fortnightly', { days: 14 }], ['monthly', 'Monthly', { months: 1 }], ['quarterly', 'Quarterly', { months: 3 }], ['milestoneTriggered', 'Milestone-triggered']),
  outcomeRating: L(['notMet', 'Not met', { value: 0 }], ['partlyMet', 'Partly met', { value: 1 }], ['met', 'Met', { value: 2 }]),
  attendance: L(['invited', 'Invited'], ['attended', 'Attended'], ['apologies', 'Apologies'], ['noResponse', 'No response']),
  changeRole: L(['primarySponsor', 'Primary sponsor'], ['coalitionMember', 'Sponsor coalition member'], ['steeringCommittee', 'Steering committee member'], ['businessOwner', 'Business owner'], ['peopleManager', 'People manager'], ['changeAgent', 'Change agent'], ['sme', 'Subject matter expert'], ['impactedEmployee', 'Impacted employee'], ['influencer', 'Influencer or opinion leader'], ['employeeRep', 'Employee representative'], ['externalParty', 'External party'], ['regulator', 'Regulator'], ['vendor', 'Vendor or partner']),
  riskProfile: L(['low', 'Low'], ['medium', 'Medium'], ['high', 'High']),
  rag: L(['red', 'Red'], ['amber', 'Amber'], ['green', 'Green']),
  artefactStatus: L(['draft', 'Draft'], ['forReview', 'For review'], ['approved', 'Approved'], ['superseded', 'Superseded']),
  impactAspect: L(['processes', 'Processes'], ['systems', 'Systems'], ['tools', 'Tools'], ['jobRoles', 'Job roles'], ['criticalBehaviours', 'Critical behaviours'], ['mindsets', 'Mindsets, attitudes and beliefs'], ['reportingStructure', 'Reporting structure'], ['performanceReviews', 'Performance reviews'], ['compensation', 'Compensation'], ['location', 'Location']),
  groupDefinition: L(['orgUnit', 'Organisational unit'], ['role', 'Role'], ['location', 'Location'], ['employmentType', 'Employment type'], ['external', 'External category']),
  employmentType: L(['employee', 'Employee'], ['contractor', 'Contractor'], ['external', 'External']),
  stakeholderStatus: L(['active', 'Active'], ['inactive', 'Inactive'], ['left', 'Left the organisation']),
  stakeholderSource: L(['manual', 'Manual'], ['import', 'Import'], ['hr', 'HR synchronisation'], ['directory', 'Directory synchronisation']),
  relationshipType: L(['reportsTo', 'Reports to'], ['influences', 'Influences'], ['isInfluencedBy', 'Is influenced by'], ['represents', 'Represents'], ['worksCloselyWith', 'Works closely with']),
  deliveryApproach: L(['predictive', 'Predictive'], ['agile', 'Agile'], ['hybrid', 'Hybrid']),
  initiativeStatus: L(['draft', 'Draft'], ['active', 'Active'], ['closing', 'Closing'], ['closed', 'Closed (read-only)']),
  containerKind: L(['portfolio', 'Portfolio'], ['program', 'Program'], ['project', 'Project']),
  measureCategory: L(['organisational', 'Organisational performance (benefits)'], ['individual', 'Individual performance (adoption, usage, proficiency)'], ['changeManagement', 'Change management performance']),
  measureSubtype: L(['benefit', 'Benefit'], ['speedOfAdoption', 'Speed of adoption'], ['ultimateUtilisation', 'Ultimate utilisation'], ['proficiency', 'Proficiency'], ['usage', 'Usage'], ['activityDelivery', 'Delivery of change activities'], ['engagementCoverage', 'Engagement coverage'], ['other', 'Other']),
  frequency: L(['weekly', 'Weekly'], ['fortnightly', 'Fortnightly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['once', 'Once'], ['continuous', 'Continuous (data feed)']),
  milestoneKind: L(['release', 'Release'], ['wave', 'Wave'], ['phase', 'Phase'], ['designSignOff', 'Design sign-off'], ['uat', 'User acceptance testing'], ['goLive', 'Go-live'], ['hypercareExit', 'Hypercare exit'], ['governance', 'Governance decision'], ['other', 'Other milestone']),
  activityStatus: L(['notStarted', 'Not started'], ['inProgress', 'In progress'], ['complete', 'Complete'], ['onHold', 'On hold'], ['cancelled', 'Cancelled']),
  commsStatus: L(['draft', 'Draft'], ['inReview', 'In review'], ['approved', 'Approved'], ['scheduled', 'Scheduled'], ['sent', 'Sent'], ['cancelled', 'Cancelled']),
  responsibleRole: L(['sponsor', 'Sponsor'], ['peopleManager', 'People manager'], ['changeTeam', 'Change team'], ['projectTeam', 'Project team'], ['trainingTeam', 'Training team'], ['communications', 'Communications'], ['changeAgents', 'Change agents'], ['businessOwner', 'Business owner']),
  trainingModality: L(['instructorLed', 'Instructor-led'], ['virtual', 'Virtual'], ['eLearning', 'eLearning'], ['onTheJob', 'On-the-job'], ['jobAid', 'Job aid'], ['simulation', 'Simulation'], ['sandbox', 'Sandbox practice']),
  proficiencyEvidence: L(['assessment', 'Assessment result'], ['observed', 'Observed task completion'], ['supervisor', 'Supervisor sign-off']),
  supportType: L(['floorSupport', 'Floor support'], ['helpDesk', 'Help desk'], ['coaching', 'Coaching'], ['superUsers', 'Super users'], ['knowledgeBase', 'Knowledge base']),
  severity: L(['low', 'Low', { value: 1 }], ['medium', 'Medium', { value: 2 }], ['high', 'High', { value: 3 }], ['critical', 'Critical', { value: 4 }]),
  resistanceStatus: L(['open', 'Open'], ['monitoring', 'Monitoring'], ['escalated', 'Escalated'], ['resolved', 'Resolved']),
  resistanceForm: L(['openOpposition', 'Open opposition'], ['quietNonCompliance', 'Quiet non-compliance'], ['lowParticipation', 'Low participation'], ['workarounds', 'Workarounds'], ['rumours', 'Rumours and negative talk'], ['delay', 'Delay or stalling'], ['escalation', 'Escalation to senior leaders'], ['other', 'Other']),
  likelihood: L(['1', '1 Rare', { value: 1 }], ['2', '2 Unlikely', { value: 2 }], ['3', '3 Possible', { value: 3 }], ['4', '4 Likely', { value: 4 }], ['5', '5 Almost certain', { value: 5 }]),
  consequence: L(['1', '1 Insignificant', { value: 1 }], ['2', '2 Minor', { value: 2 }], ['3', '3 Moderate', { value: 3 }], ['4', '4 Major', { value: 4 }], ['5', '5 Severe', { value: 5 }]),
  riskRating: L(['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['extreme', 'Extreme']),
  riskStatus: L(['open', 'Open'], ['treating', 'Being treated'], ['monitoring', 'Monitoring'], ['closed', 'Closed']),
  riskKind: L(['risk', 'Risk'], ['issue', 'Issue']),
  feedbackChannel: L(['engagement', 'Engagement'], ['survey', 'Survey'], ['changeAgent', 'Change agent'], ['mailbox', 'Feedback mailbox'], ['serviceDesk', 'Service desk'], ['other', 'Other']),
  feedbackTheme: L(['timing', 'Timing and workload'], ['training', 'Training and support'], ['system', 'System performance and usability'], ['process', 'Process clarity'], ['communication', 'Communication'], ['leadership', 'Leadership and sponsorship'], ['roles', 'Roles and job security'], ['customer', 'Customer or participant impact'], ['other', 'Other']),
  feedbackStatus: L(['new', 'New'], ['reviewed', 'Reviewed'], ['actioned', 'Actioned'], ['closed', 'Closed']),
  surveyKind: L(['adkar', 'ADKAR self-assessment'], ['readiness', 'Readiness'], ['sentiment', 'Sentiment pulse'], ['trainingEvaluation', 'Training evaluation'], ['custom', 'Custom']),
  surveyStatus: L(['draft', 'Draft'], ['scheduled', 'Scheduled'], ['open', 'Open'], ['closed', 'Closed']),
  assessmentMethod: L(['practitioner', 'Change practitioner assessment'], ['manager', 'People manager assessment'], ['self', 'Self-assessment survey'], ['inferred', 'Inferred from engagement observations']),
  assessmentRound: L(['baseline', 'Baseline'], ['preGoLive', 'Pre-go-live'], ['postGoLive', 'Post-go-live'], ['sustainment', 'Sustainment'], ['adHoc', 'Ad hoc']),
  readinessStatus: L(['met', 'Met', { value: 2 }], ['partlyMet', 'Partly met', { value: 1 }], ['notMet', 'Not met', { value: 0 }], ['notApplicable', 'Not applicable']),
  goNoGo: L(['go', 'Go'], ['goWithConditions', 'Go with conditions'], ['noGo', 'No go']),
  sustainmentMechanism: L(['recognition', 'Recognition'], ['measurement', 'Measurement and reporting'], ['performanceObjectives', 'Alignment of performance objectives'], ['accountability', 'Accountability'], ['correctiveAction', 'Corrective action'], ['ongoingSupport', 'Ongoing support']),
  handoverStatus: L(['pending', 'Pending'], ['accepted', 'Accepted'], ['declined', 'Declined']),
  lessonCategory: L(['governance', 'Governance and decision-making'], ['sponsorship', 'Sponsorship'], ['stakeholders', 'Stakeholder engagement'], ['communications', 'Communications'], ['training', 'Training and capability'], ['resistance', 'Resistance management'], ['planning', 'Planning and integration'], ['measurement', 'Measurement'], ['tools', 'Tools and systems'], ['other', 'Other']),
  taskStatus: L(['open', 'Open'], ['inProgress', 'In progress'], ['done', 'Done'], ['cancelled', 'Cancelled']),
  taskPriority: L(['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['urgent', 'Urgent']),
  messageFocus: L(['businessReasons', 'Business reasons for the change'], ['personalImpacts', 'Personal or role impacts'], ['howTo', 'How-to and practical detail'], ['progress', 'Progress and celebration']),
  messageStatus: L(['draft', 'Draft'], ['inReview', 'In review'], ['approved', 'Approved'], ['retired', 'Retired']),
  toolkitKind: L(['talkingPoints', 'Talking points'], ['faq', 'FAQs'], ['conversationGuide', 'Team conversation guide'], ['impactSummary', 'Impact summary'], ['trainingSchedule', 'Training schedule'], ['other', 'Other']),
  decisionKind: L(['decision', 'Decision'], ['assumption', 'Assumption']),
  confirmationStatus: L(['notReviewed', 'Not reviewed'], ['confirmed', 'Confirmed'], ['changesRequested', 'Changes requested']),
  budgetCategory: L(['changeTeam', 'Change team'], ['communications', 'Communications'], ['training', 'Training'], ['events', 'Events and engagement'], ['agents', 'Change agent network'], ['tools', 'Tools and licences'], ['contingency', 'Contingency'], ['other', 'Other']),
  priority: L(['low', 'Low'], ['medium', 'Medium'], ['high', 'High']),
  impactLevel: L(['group', 'Group'], ['role', 'Role'], ['process', 'Process']),
  timingMode: L(['fixed', 'Fixed date and time'], ['window', 'Date window'], ['milestone', 'Relative to a milestone']),
  agentStatus: L(['active', 'Active'], ['onLeave', 'On leave'], ['inactive', 'Inactive']),
  approvalStatus: L(['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['withdrawn', 'Withdrawn']),
  classification: L(['UNOFFICIAL', 'UNOFFICIAL'], ['OFFICIAL', 'OFFICIAL'], ['OFFICIAL: Sensitive', 'OFFICIAL: Sensitive'], ['PROTECTED', 'PROTECTED']),
  salience: L(['low', 'Low'], ['medium', 'Medium'], ['high', 'High']),
  scheduleFrequency: L(['daily', 'Daily'], ['weekly', 'Weekly'], ['fortnightly', 'Fortnightly'], ['monthly', 'Monthly']),
};

// --- Assessment question sets (RSK-001, RSK-002, RSK-004, RSK-007; ADM-008) -----------------------
// Rated 1–5. For risk sets a higher score means greater risk; for PCT and sponsor sets a higher score means healthier.

export const QUESTION_SETS = {
  changeCharacteristics: {
    label: 'Change characteristics',
    higherIsRisk: true,
    items: [
      { id: 'cc1', text: 'Scope of the change', low: 'One work group', high: 'Organisation-wide, across many units' },
      { id: 'cc2', text: 'Number of people who will need to work differently', low: 'Fewer than 50', high: 'Several thousand' },
      { id: 'cc3', text: 'Variety of groups affected', low: 'One group, affected in the same way', high: 'Many groups, each affected differently' },
      { id: 'cc4', text: 'Degree of change to processes', low: 'Minor adjustments', high: 'Processes redesigned end to end' },
      { id: 'cc5', text: 'Degree of change to systems and tools', low: 'Cosmetic or none', high: 'Core systems replaced' },
      { id: 'cc6', text: 'Degree of change to job roles', low: 'No change to roles', high: 'Roles created, removed or substantially changed' },
      { id: 'cc7', text: 'Change to reporting lines, headcount, performance measures or pay', low: 'None', high: 'Significant changes' },
      { id: 'cc8', text: 'Timeframe for the change', low: 'Generous; allows for adjustment', high: 'Compressed and fixed' },
      { id: 'cc9', text: 'Nature of the change', low: 'Incremental improvement', high: 'Radical or transformational' },
      { id: 'cc10', text: 'Impact on customers, participants or external parties', low: 'None noticeable', high: 'Significant and visible' },
    ],
  },
  orgAttributes: {
    label: 'Organisational attributes',
    higherIsRisk: true,
    items: [
      { id: 'oa1', text: 'Perceived need for change among the people affected', low: 'Widely understood and accepted', high: 'Not recognised' },
      { id: 'oa2', text: 'Legacy of past changes', low: 'Past changes mostly succeeded', high: 'Past changes mostly failed or were abandoned' },
      { id: 'oa3', text: 'Current change load on the affected groups', low: 'Little other change underway', high: 'Several concurrent changes; groups are saturated' },
      { id: 'oa4', text: 'Capacity to absorb change (time, resources, operational pressure)', low: 'Ample capacity', high: 'No spare capacity; peak operational pressure' },
      { id: 'oa5', text: 'Senior leadership change capability and alignment', low: 'Experienced, aligned and visible', high: 'Inexperienced or divided' },
      { id: 'oa6', text: 'People manager change capability', low: 'Managers are skilled at leading change', high: 'Managers are unprepared to lead change' },
      { id: 'oa7', text: 'Culture and openness to new ways of working', low: 'Open and adaptable', high: 'Resistant; strong attachment to the status quo' },
      { id: 'oa8', text: 'Shared vision and direction across the organisation', low: 'Clear and widely shared', high: 'Unclear or contested' },
      { id: 'oa9', text: 'Funding and resources for change management', low: 'Fully funded', high: 'Not funded' },
      { id: 'oa10', text: 'How reinforcement and accountability usually work', low: 'Changes are measured, recognised and sustained', high: 'Changes drift; no follow-through' },
    ],
  },
  pct: {
    label: 'PCT health',
    higherIsRisk: false,
    aspects: [
      { id: 'success', label: 'Success' },
      { id: 'leadership', label: 'Leadership / sponsorship' },
      { id: 'projectManagement', label: 'Project management' },
      { id: 'changeManagement', label: 'Change management' },
    ],
    items: [
      { id: 'pc1', aspect: 'success', text: 'The reason for the change, its objectives and benefits are clearly defined.' },
      { id: 'pc2', aspect: 'success', text: 'Success measures are agreed, measurable and owned.' },
      { id: 'pc3', aspect: 'success', text: 'What adoption and usage will look like in practice is defined.' },
      { id: 'pc4', aspect: 'leadership', text: 'A primary sponsor with the authority to make the change happen is in place.' },
      { id: 'pc5', aspect: 'leadership', text: 'The sponsor participates actively and visibly throughout the initiative.' },
      { id: 'pc6', aspect: 'leadership', text: 'Senior leaders across the affected areas support the change and are aligned.' },
      { id: 'pc7', aspect: 'leadership', text: 'Leadership decisions are made in time for the project and change work.' },
      { id: 'pc8', aspect: 'projectManagement', text: 'The solution, scope and schedule are defined and stable.' },
      { id: 'pc9', aspect: 'projectManagement', text: 'Project governance and resourcing are effective.' },
      { id: 'pc10', aspect: 'projectManagement', text: 'Delivery of the technical solution is on track.' },
      { id: 'pc11', aspect: 'changeManagement', text: 'Change management is resourced with skilled practitioners.' },
      { id: 'pc12', aspect: 'changeManagement', text: 'Impacted groups and stakeholders have been identified and analysed.' },
      { id: 'pc13', aspect: 'changeManagement', text: 'Change plans are integrated with the project schedule.' },
      { id: 'pc14', aspect: 'changeManagement', text: 'People managers are equipped to lead their teams through the change.' },
    ],
  },
  sponsor: {
    label: 'Sponsor assessment',
    higherIsRisk: false,
    items: [
      { id: 'sp1', text: 'Commitment: personally committed to the change and its outcomes.' },
      { id: 'sp2', text: 'Capability: understands what the sponsor role requires and how to lead change.' },
      { id: 'sp3', text: 'Availability: has time for sponsor activities in their schedule.' },
      { id: 'sp4', text: 'Competing priorities: the change is a top priority for the sponsor (5 = few competing priorities).' },
      { id: 'sp5', text: 'Participates actively and visibly with the project and with employees.' },
      { id: 'sp6', text: 'Builds a coalition of support among peers and senior leaders.' },
      { id: 'sp7', text: 'Communicates directly with employees about why the change matters.' },
    ],
  },
};

// Starting questions for readiness, sentiment and training evaluation surveys (MEA-001). Organisation-
// authored and editable per survey; scale questions are rated 1 (strongly disagree) to 5 (strongly agree).
export const SURVEY_TEMPLATES = {
  readiness: [
    { id: 'r1', type: 'scale', text: 'I understand what is changing for me and my team, and when.' },
    { id: 'r2', type: 'scale', text: 'My manager has talked with our team about how the change affects us.' },
    { id: 'r3', type: 'scale', text: 'I know where to go for help and support once the change happens.' },
    { id: 'r4', type: 'scale', text: 'I have had the training I need to work in the new way.' },
    { id: 'r5', type: 'scale', text: 'I feel ready to work in the new way from the go-live date.' },
    { id: 'r6', type: 'text', text: 'What would help you feel more ready?' },
  ],
  sentiment: [
    { id: 's1', type: 'scale', text: 'Overall, I feel positive about this change.' },
    { id: 's2', type: 'scale', text: 'I believe the change will make our work better.' },
    { id: 's3', type: 'scale', text: 'I feel heard when I raise questions or concerns about the change.' },
    { id: 's4', type: 'text', text: 'What is your biggest concern about the change at the moment?' },
  ],
  trainingEvaluation: [
    { id: 't1', type: 'scale', text: 'The training was relevant to the work I do.' },
    { id: 't2', type: 'scale', text: 'I can now perform the tasks covered in the training.' },
    { id: 't3', type: 'scale', text: 'The training was well timed for when I need to use the new skills.' },
    { id: 't4', type: 'scale', text: 'I know where to find job aids and support after the training.' },
    { id: 't5', type: 'text', text: 'What could be improved?' },
  ],
  custom: [
    { id: 'c1', type: 'scale', text: 'Statement rated from 1 (strongly disagree) to 5 (strongly agree).' },
    { id: 'c2', type: 'text', text: 'Open question.' },
  ],
};

// Focus-area suggestions for low-scoring items (RSK-005). Each rule fires when the matching item
// (or PCT aspect) scores at or below `when`; suggestions are offered for practitioner acceptance.
export const FOCUS_RULES = [
  { set: 'pct', aspect: 'leadership', when: 60, title: 'Strengthen sponsorship', text: 'Brief the primary sponsor on the sponsor role, agree a sponsor roadmap of visible activities and identify coalition members whose support is needed.' },
  { set: 'pct', aspect: 'success', when: 60, title: 'Clarify the definition of success', text: 'Run a session with the sponsor and business owner to agree objectives, success measures with baselines and targets, and what adoption looks like.' },
  { set: 'pct', aspect: 'projectManagement', when: 60, title: 'Stabilise the project foundation', text: 'Escalate scope or schedule instability to governance; agree change-impacting milestones with the project manager and integrate the plans.' },
  { set: 'pct', aspect: 'changeManagement', when: 60, title: 'Resource and integrate change management', text: 'Confirm change team resourcing, complete the impact assessment and integrate change activities into the project schedule.' },
  { set: 'orgAttributes', item: 'oa3', when: 4, title: 'Manage change saturation', text: 'Review the portfolio change heatmap with the affected groups and negotiate timing with other initiatives; avoid peak periods.' },
  { set: 'orgAttributes', item: 'oa6', when: 4, title: 'Build people manager capability', text: 'Add manager briefings and coaching to the People Manager Plan before employee communications begin.' },
  { set: 'orgAttributes', item: 'oa2', when: 4, title: 'Acknowledge the legacy of past change', text: 'Address what went wrong last time in early communications and show how this change will be different.' },
  { set: 'orgAttributes', item: 'oa1', when: 4, title: 'Build the case for change', text: 'Sponsor-led communications on the business reasons and the risk of not changing; test understanding in early pulse checks.' },
  { set: 'changeCharacteristics', item: 'cc8', when: 4, title: 'Plan for a compressed timeframe', text: 'Front-load Awareness and Desire activities, and plan floor support and hypercare to absorb the productivity dip.' },
  { set: 'changeCharacteristics', item: 'cc6', when: 4, title: 'Prepare for role change resistance', text: 'Consult employee representatives early, plan one-to-one conversations and include a Resistance Management Plan.' },
  { set: 'sponsor', item: 'sp3', when: 2, title: 'Protect sponsor time', text: 'Agree a small number of high-value sponsor moments and schedule them in the sponsor\'s diary now.' },
  { set: 'sponsor', item: 'sp6', when: 2, title: 'Build the sponsor coalition', text: 'Map senior leaders across affected areas and agree one-to-one alignment conversations for the primary sponsor.' },
];

// Readiness checklists (RSK-006).
export const READINESS_CHECKLISTS = {
  organisational: {
    label: 'Organisational readiness',
    criteria: [
      'Impacted groups have confirmed the impacts for their area',
      'The case for change has been communicated by the sponsor',
      'People managers understand their role and have been briefed',
      'A change agent network is in place for each impacted group',
      'Major concerns raised in engagements have been answered',
      'Resistance hot spots have documented responses',
    ],
  },
  goLive: {
    label: 'Go-live readiness',
    criteria: [
      'Training completion is at or above target for every impacted group',
      'Key users can perform critical tasks proficiently',
      'Floor support, help desk and escalation arrangements are in place',
      'Go-live date, what to expect and where to get help have been communicated',
      'People managers are equipped to support their teams in the first weeks',
      'The sponsor has delivered the go-live message',
      'Updated procedures and job aids are published',
      'Readiness index for every impacted group is at or above the threshold',
    ],
  },
};

// Default ADKAR intervention library (ADK-011; Appendix B), expanded into individual actions.
export const BARRIER_SIGNS = {
  awareness: 'People cannot explain why the change is happening or the risk of not changing; the change is ignored; rumours circulate.',
  desire: 'Open or quiet resistance; low participation; personal benefits unclear; competing priorities.',
  knowledge: "Uncertainty about how to perform new tasks; errors in training assessments; many 'how do I' questions.",
  ability: 'People can describe the new way of working but cannot yet perform it; productivity dips; frequent requests for help; workarounds.',
  reinforcement: 'People revert to old ways; usage declines after go-live; workarounds persist.',
};

export const INTERVENTIONS = [
  { id: 'iv-aw-1', element: 'awareness', title: 'Sponsor-led explanation of the business reasons', description: 'The primary sponsor explains why the change is happening, why now and the risk of not changing, in person or by video.', role: 'sponsor', plan: 'sponsor', type: 'townHall' },
  { id: 'iv-aw-2', element: 'awareness', title: 'Manager-led team discussion on why the change is needed now', description: 'People managers lead a team conversation using a conversation guide and the approved key messages.', role: 'peopleManager', plan: 'peopleManager', type: 'teamConversation' },
  { id: 'iv-aw-3', element: 'awareness', title: 'Case-for-change briefing', description: 'Change team briefing on what is and is not changing, with time for questions.', role: 'changeTeam', plan: 'communications', type: 'briefing' },
  { id: 'iv-aw-4', element: 'awareness', title: 'Publish and promote FAQs', description: 'Publish answers to the questions being asked, and point people to them through several channels.', role: 'communications', plan: 'communications', type: 'intranet' },
  { id: 'iv-aw-5', element: 'awareness', title: 'Repeat consistent messages through several channels', description: 'Schedule the same core messages through email, intranet, team meetings and collaboration channels.', role: 'communications', plan: 'communications', type: 'email' },
  { id: 'iv-de-1', element: 'desire', title: 'One-to-one conversations to surface concerns', description: 'Managers hold one-to-one conversations to understand individual concerns and personal impacts.', role: 'peopleManager', plan: 'peopleManager', type: 'oneToOne' },
  { id: 'iv-de-2', element: 'desire', title: 'Address personal impacts and benefits', description: "Explain 'what's in it for me' for the group, and answer personal impact questions directly.", role: 'peopleManager', plan: 'peopleManager', type: 'teamConversation' },
  { id: 'iv-de-3', element: 'desire', title: 'Involve people in design or testing', description: 'Invite representatives to design workshops, testing or pilots so they shape the solution.', role: 'changeTeam', plan: 'changeAgent', type: 'workshop' },
  { id: 'iv-de-4', element: 'desire', title: 'Resolve root causes of resistance', description: 'Investigate root causes in the resistance register and agree targeted responses with owners.', role: 'changeTeam', plan: 'resistance', type: 'focusGroup' },
  { id: 'iv-de-5', element: 'desire', title: 'Visible sponsor commitment', description: 'The sponsor visits the affected areas, listens to concerns and restates commitment to the change.', role: 'sponsor', plan: 'sponsor', type: 'siteVisit' },
  { id: 'iv-de-6', element: 'desire', title: 'Align incentives and consequences', description: 'Work with the business owner to align performance objectives and recognition with the new way of working.', role: 'businessOwner', plan: 'sponsor', type: 'oneToOne' },
  { id: 'iv-de-7', element: 'desire', title: 'Peer advocates', description: 'Change agents and early adopters share their experience with their peers.', role: 'changeAgents', plan: 'changeAgent', type: 'collabPost' },
  { id: 'iv-kn-1', element: 'knowledge', title: 'Role-based training timed close to use', description: 'Deliver role-based training within two to three weeks of the people needing the new skills.', role: 'trainingTeam', plan: 'training', type: 'training' },
  { id: 'iv-kn-2', element: 'knowledge', title: 'Demonstrations', description: 'Live or recorded demonstrations of the new process or system for each impacted group.', role: 'trainingTeam', plan: 'training', type: 'demonstration' },
  { id: 'iv-kn-3', element: 'knowledge', title: 'Job aids and quick reference guides', description: 'Publish task-based job aids for the most common and most critical tasks.', role: 'trainingTeam', plan: 'training', type: 'intranet' },
  { id: 'iv-kn-4', element: 'knowledge', title: 'Practice environment', description: 'Provide a sandbox so people can practise before go-live.', role: 'projectTeam', plan: 'training', type: 'training' },
  { id: 'iv-kn-5', element: 'knowledge', title: 'Knowledge base articles', description: "Create knowledge base articles answering the most frequent 'how do I' questions.", role: 'trainingTeam', plan: 'training', type: 'intranet' },
  { id: 'iv-ab-1', element: 'ability', title: 'Hands-on practice sessions', description: 'Supervised practice of real tasks in the new way of working.', role: 'trainingTeam', plan: 'training', type: 'workshop' },
  { id: 'iv-ab-2', element: 'ability', title: 'Coaching by people managers', description: 'Managers observe and coach team members on the new tasks in the first weeks.', role: 'peopleManager', plan: 'peopleManager', type: 'coaching' },
  { id: 'iv-ab-3', element: 'ability', title: 'Floor support and super users', description: 'Place floor walkers and super users in each location for the first weeks after go-live.', role: 'projectTeam', plan: 'training', type: 'siteVisit' },
  { id: 'iv-ab-4', element: 'ability', title: 'Time allowed to practise', description: 'Managers adjust workloads and targets so people have time to build proficiency.', role: 'peopleManager', plan: 'peopleManager', type: 'teamConversation' },
  { id: 'iv-ab-5', element: 'ability', title: 'Remove practical barriers', description: 'Resolve access, equipment and data issues that stop people performing the new tasks.', role: 'projectTeam', plan: 'training', type: 'other' },
  { id: 'iv-re-1', element: 'reinforcement', title: 'Recognise and celebrate success', description: 'Recognise individuals and teams who adopt the change; share success stories.', role: 'sponsor', plan: 'sponsor', type: 'newsletter' },
  { id: 'iv-re-2', element: 'reinforcement', title: 'Measure and report usage', description: 'Publish adoption and usage measures by group, and discuss them in management meetings.', role: 'businessOwner', plan: 'sustainment', type: 'briefing' },
  { id: 'iv-re-3', element: 'reinforcement', title: 'Build accountability into performance objectives', description: 'Include the new behaviours in performance objectives and conversations.', role: 'peopleManager', plan: 'peopleManager', type: 'oneToOne' },
  { id: 'iv-re-4', element: 'reinforcement', title: 'Retire old processes and systems', description: 'Decommission old systems, forms and workarounds so people cannot revert.', role: 'projectTeam', plan: 'sustainment', type: 'other' },
  { id: 'iv-re-5', element: 'reinforcement', title: 'Take corrective action', description: 'Follow up where usage is low with targeted coaching and support.', role: 'peopleManager', plan: 'sustainment', type: 'coaching' },
  { id: 'iv-re-6', element: 'reinforcement', title: 'Establish clear sustainment ownership', description: 'Confirm business owners for each outcome and measure before the change team steps back.', role: 'businessOwner', plan: 'sustainment', type: 'briefing' },
];

// --- Rules and thresholds (ADM-005) -----------------------------------------------------------------

export const DEFAULT_SETTINGS = {
  organisationName: 'National Insurance Disability Agency',
  timeZone: 'Australia/Sydney',
  locale: 'en-AU',
  adkar: { threshold: 3, groupMethod: 'mean', groupProportion: 0.3, minSegment: 5, staleDays: 90 },
  impact: { rollup: 'highest', highImpact: 4, aspectWeights: {} },
  risk: { lowBelow: 40, highFrom: 60 },
  cadenceDays: { manageClosely: 14, keepSatisfied: 30, keepInformed: 30, monitor: 90 },
  // Whether communications and group sessions without recorded attendance count towards a member's cadence.
  cadenceGroupCredit: { manageClosely: false, keepSatisfied: false, keepInformed: true, monitor: true },
  load: { stakeholderMaxPer7Days: 3, groupMaxCommsPer7Days: 5 },
  blackouts: [
    { id: 'eofy', name: 'End of financial year', start: '06-20', end: '07-10', annual: true },
    { id: 'xmas', name: 'Christmas shutdown', start: '12-22', end: '01-05', annual: true },
  ],
  lockBusinessDays: 10,
  alerts: { upcomingDays: 5, notEngagedDays: 45, completionGraceBusinessDays: 5, barrierChangeDays: 30 },
  priorityWeights: { influence: 30, impact: 25, gap: 20, barrier: 15, role: 10 },
  readinessWeights: { adkar: 40, training: 25, criteria: 20, sentiment: 15 },
  readinessThreshold: 70,
  rag: { greenFrom: 75, amberFrom: 50 },
  saturation: { maxInitiatives: 3, maxAggregateImpact: 10, maxHoursPerPersonPerMonth: 12 },
  agentCoverage: { headcountPerAgent: 50, minPerGroup: 1, minPerLocation: 1, maxPerGroup: 25 },
  sessionTimeoutMinutes: 30,
  privacy: { groupLevelOnly: false, practitionerSensitiveScope: 'assigned', freeTextGuidance: 'Do not record sensitive information such as health details, union membership, religious beliefs or criminal records. Record observations about the change, not judgements about the person.' },
  attachments: { maxMb: 20, allowed: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'msg', 'eml', 'vsdx', 'zip'] },
  ai: { enabled: true, features: { draftNarrative: true, summariseEngagement: true, suggestInterventions: true, draftCommunication: true } },
  classification: { default: 'OFFICIAL', sensitiveDefault: 'OFFICIAL: Sensitive' },
  artefacts: { exportWatermark: false },
  holidays: null, // null means the computed Australian national public holidays
  retention: {
    stakeholderPersonalInfo: { years: 7, action: 'deidentify', after: 'initiativeClosure' },
    engagement: { years: 7, action: 'deidentify', after: 'initiativeClosure' },
    surveyResponse: { years: 2, action: 'delete', after: 'surveyClose' },
    artefactDraft: { years: 2, action: 'delete', after: 'created' },
    artefactApproved: { years: 10, action: 'retain', after: 'approval' },
    auditEvent: { years: 7, action: 'retain', after: 'created' },
  },
  sensitiveFields: {
    profile: ['currentEngagement', 'desiredEngagement', 'priorityOverride', 'privateNotes'],
    engagement: ['sentiments'],
    assessment: ['scores'],
    resistance: ['description', 'evidence'],
    stakeholder: ['engagementAdjustments'],
  },
  stageChecks: STAGE_CHECKS,
  collectionNotices: [
    { id: 'cn-standard', title: 'Standard change engagement notice', version: '1.0', text: 'We collect your name, contact details and your feedback about this change so that we can plan how to support you through it. Your information is used only for managing this change, is held securely and is handled in accordance with the Privacy Act 1988 and our privacy policy. You can ask to access or correct the information we hold about you.' },
    { id: 'cn-survey', title: 'Anonymous survey notice', version: '1.0', text: 'This survey is anonymous. We do not record your name or contact details. Results are reported only for groups of five or more people, so individual answers cannot be identified. Taking part is voluntary.' },
  ],
  terminology: {},
};

export const GLOSSARY = {
  'ADKAR Model': "Prosci's model of individual change: Awareness, Desire, Knowledge, Ability and Reinforcement. Each element is an outcome an individual must achieve for a change to succeed.",
  'ADKAR Blueprint': 'Captures, for the organisation or an impacted group, the desired outcome, barriers and actions for each ADKAR element. It is the first activity of the Plan and Act stage.',
  'Barrier point': 'The first ADKAR element, in sequence, scored at or below the threshold (default 3). Because the elements build on each other, interventions focus on the barrier point first.',
  CLARC: 'The five roles of people managers in change: communicator, liaison, advocate, resistance manager and coach.',
  'PCT Model': 'Success at the centre of a triangle supported by leadership/sponsorship, project management and change management. A weakness in any corner puts outcomes at risk.',
  'Power/interest quadrant': 'Stakeholders rated for influence and interest are placed in one of four quadrants: manage closely, keep satisfied, keep informed or monitor.',
  'Engagement gap': 'The number of levels between a stakeholder\'s current and desired engagement (unaware, resistant, neutral, supportive, leading). A gap of two or more, or a current level of resistant, flags priority attention.',
  'IAP2 Spectrum': 'Engagement approach: inform, consult, involve, collaborate or empower.',
  'Change saturation': 'The point at which the volume of change exceeds a group\'s capacity to adopt it.',
  'Core plans': 'Sponsor, People Manager, Communications and Training plans.',
  'Extend plans': 'Resistance Management, Change Agent Network, Sponsor Coalition, Sustainment and custom plans, used as needed.',
  'Preferred sender': 'Business reasons are best delivered by the primary sponsor or a senior leader; personal and role impacts by the recipient\'s direct people manager.',
  'Readiness index': 'A 0–100 score for an impacted group combining ADKAR scores, training completion, readiness criteria and sentiment, using configurable weights.',
  '10 Aspects of Change Impact': 'Processes, systems, tools, job roles, critical behaviours, mindsets/attitudes/beliefs, reporting structure, performance reviews, compensation and location.',
  'Risk profile': 'Low, medium or high, from the change characteristics and organisational attributes assessments. It drives the recommended scale of change management.',
  WIIFM: "'What's in it for me': the personal benefit of the change for a stakeholder or group.",
};
