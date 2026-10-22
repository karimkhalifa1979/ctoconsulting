// Fictional people and organisation structure for the demonstration data set.
// Any resemblance to real people is coincidental.

export const ORG = 'National Insurance Disability Agency';

// Stakeholder groups: [key, name, kind, parentKey, extra]
export const GROUPS = [
  ['psd', 'Participant Services Division', 'division', null],
  ['prb', 'Planning and Review Branch', 'branch', 'psd'],
  ['prt', 'Plan Review Team', 'team', 'prb'],
  ['pq', 'Planning Quality', 'team', 'prb'],
  ['cco', 'Contact Centre Operations Branch', 'branch', 'psd'],
  ['ccg', 'Contact Centre Geelong', 'team', 'cco'],
  ['ccb', 'Contact Centre Brisbane', 'team', 'cco'],
  ['cpb', 'Claims and Payments Branch', 'branch', 'psd'],
  ['cp', 'Claims Processing', 'team', 'cpb'],
  ['pi', 'Payments Integrity', 'team', 'cpb'],
  ['prq', 'Provider Registration and Quality', 'branch', 'psd'],
  ['pic', 'Partners in the Community', 'division', null],
  ['lac', 'LAC Partner Network', 'external', 'pic', { headcount: 1240, organisation: 'Local Area Coordination partners' }],
  ['ecei', 'Early Childhood Partner Network', 'external', 'pic', { headcount: 140, organisation: 'Early childhood partners' }],
  ['pan', 'Participants and Nominees', 'external', null, { headcount: 650000, organisation: 'Participants' }],
  ['leaders', 'People Leaders', 'role', null, { membershipType: 'dynamic', rules: [{ field: 'positionTitle', op: 'contains', value: 'Team Leader' }] }],
  ['csd', 'Corporate Services Division', 'division', null],
  ['fin', 'Finance Branch', 'branch', 'csd'],
  ['fo', 'Finance Officers', 'team', 'fin', { headcount: 120 }],
  ['ap', 'Accounts Payable', 'team', 'fin', { headcount: 45 }],
  ['ict', 'ICT Branch', 'branch', 'csd'],
  ['sd', 'IT Service Desk', 'team', 'ict', { headcount: 40 }],
  ['natoff', 'National Office Staff', 'location', null, { membershipType: 'dynamic', rules: [{ field: 'location', op: 'equals', value: 'Canberra' }], headcount: 1800 }],
  ['regional', 'Regional Offices', 'location', null, { headcount: 2400 }],
  ['ea', 'Executive Assistants', 'role', null, { headcount: 60 }],
  ['budget', 'Budget Holders', 'role', null, { membershipType: 'dynamic', rules: [{ field: 'positionTitle', op: 'contains', value: 'Director' }], headcount: 300 }],
  ['exec', 'Executive Leadership Team', 'forum', null],
];

// People: [key, given, family, position, groupKey, managerKey, location, extra]
export const PEOPLE = [
  ['andrew', 'Andrew', 'Fitzgerald', 'Chief Executive Officer', 'exec', null, 'Canberra'],
  ['margaret', 'Margaret', 'Chen', 'Deputy Chief Executive Officer, Participant Services', 'exec', 'andrew', 'Canberra', { preferredName: 'Margaret' }],
  ['kathryn', 'Kathryn', 'Ellis', 'Chief Operating Officer', 'exec', 'andrew', 'Canberra'],
  ['james', 'James', 'Whitfield', 'Chief Information Officer', 'exec', 'kathryn', 'Canberra'],
  ['helen', 'Helen', 'Murphy', 'Chief Financial Officer', 'exec', 'kathryn', 'Canberra'],
  ['rajesh', 'Rajesh', 'Iyer', 'General Manager, Planning and Review', 'prb', 'margaret', 'Canberra'],
  ['louise', 'Louise', 'Barrett', 'General Manager, Contact Centre Operations', 'cco', 'margaret', 'Geelong'],
  ['michael', 'Michael', "O'Brien", 'General Manager, Claims and Payments', 'cpb', 'margaret', 'Canberra'],
  ['sophie', 'Sophie', 'Laurent', 'General Manager, Partners in the Community', 'pic', 'margaret', 'Melbourne'],
  ['neil', 'Neil', 'Patterson', 'Branch Manager, Provider Registration and Quality', 'prq', 'margaret', 'Canberra'],
  ['olivia', 'Olivia', 'Martin', 'Director, Plan Reviews', 'prt', 'rajesh', 'Canberra'],
  ['ahmed', 'Ahmed', 'Hassan', 'Director, Planning Quality', 'pq', 'rajesh', 'Canberra'],
  ['rebecca', 'Rebecca', 'Stone', 'Director, National Partner Management', 'pic', 'sophie', 'Melbourne'],
  ['caroline', 'Caroline', 'Ng', 'Director, Claims Processing', 'cp', 'michael', 'Canberra'],
  ['peter', 'Peter', 'Hall', 'Operations Manager, Contact Centre Geelong', 'ccg', 'louise', 'Geelong'],
  ['meilin', 'Mei Lin', 'Zhang', 'Operations Manager, Contact Centre Brisbane', 'ccb', 'louise', 'Brisbane'],
  ['daniel', 'Daniel', 'Kowalski', 'Team Leader, Claims Processing Team 3', 'cp', 'caroline', 'Canberra'],
  ['jacob', 'Jacob', 'Williams', 'Team Leader, Contact Centre Geelong', 'ccg', 'peter', 'Geelong'],
  ['nina', 'Nina', 'Petrova', 'Team Leader, Plan Review Team 2', 'prt', 'olivia', 'Canberra'],
  ['tarek', 'Tarek', 'Haddad', 'Team Leader, Contact Centre Brisbane', 'ccb', 'meilin', 'Brisbane'],
  ['wendy', 'Wendy', 'Osei', 'Team Leader, Payments Integrity', 'pi', 'michael', 'Canberra'],
  ['kim', 'Kim', 'Tran', 'Senior Planner (subject matter expert)', 'pq', 'ahmed', 'Canberra'],
  ['oscar', 'Oscar', 'Diaz', 'Senior Business Analyst', 'pq', 'ahmed', 'Canberra'],
  ['aisha', 'Aisha', 'Rahman', 'Customer Service Officer', 'ccg', 'jacob', 'Geelong'],
  ['ben', 'Benjamin', 'Carter', 'Regional Manager, Coastal Community Partners', 'lac', null, 'Newcastle', { organisation: 'Coastal Community Partners', employmentType: 'external' }],
  ['fatima', 'Fatima', 'Al-Sayed', 'National Operations Lead, BrightStart Early Childhood', 'ecei', null, 'Sydney', { organisation: 'BrightStart Early Childhood', employmentType: 'external' }],
  ['colin', 'Colin', 'MacDonald', 'Section Secretary, Community and Public Sector Union', null, null, 'Canberra', { organisation: 'Community and Public Sector Union', employmentType: 'external' }],
  ['jennifer', 'Jennifer', 'Wu', 'Senior Assistant Ombudsman', null, null, 'Canberra', { organisation: 'Commonwealth Ombudsman', employmentType: 'external' }],
  ['marcus', 'Marcus', 'Bell', 'Delivery Director', null, null, 'Sydney', { organisation: 'Meridian Case Systems', employmentType: 'contractor' }],
  ['ruth', 'Ruth', 'Anderson', 'Chair, Participant Advisory Council', 'pan', null, 'Adelaide', { organisation: 'Participant Advisory Council', employmentType: 'external' }],
  ['tim', 'Tim', 'Robertson', 'Executive Officer, Disability Advocacy Network', null, null, 'Melbourne', { organisation: 'Disability Advocacy Network', employmentType: 'external' }],
  ['grace_s', 'Grace', 'Okafor', 'Director, Internal Communications', 'csd', 'kathryn', 'Canberra'],
  ['liam_s', 'Liam', 'Walsh', 'Director, Learning and Capability', 'csd', 'kathryn', 'Canberra'],
  ['hannah_s', 'Hannah', 'Brooks', 'Project Director, Case Management Replacement', 'psd', 'margaret', 'Canberra'],
  ['priya_s', 'Priya', 'Raman', 'Change Management Lead', 'psd', 'hannah_s', 'Canberra'],
  ['tom_s', 'Tom', 'Nguyen', 'Change Analyst', 'psd', 'priya_s', 'Canberra'],
  ['diane', 'Diane', 'Foster', 'Director, Accounts Payable', 'ap', 'helen', 'Canberra'],
  ['gareth', 'Gareth', 'Lloyd', 'Director, Financial Operations', 'fo', 'helen', 'Canberra'],
  ['sarah_it', 'Sarah', 'Kaplan', 'Team Leader, IT Service Desk', 'sd', 'james', 'Canberra'],
  ['vanessa', 'Vanessa', 'Price', 'Executive Assistant to the CEO', 'ea', 'andrew', 'Canberra'],
];

// Change agents for the case management initiative: [key, given, family, position, groupKey, managerKey, location]
export const AGENTS = [
  ['ca1', 'Lachlan', 'Moore', 'Planner', 'lac', null, 'Newcastle', { organisation: 'Coastal Community Partners', employmentType: 'external' }],
  ['ca2', 'Priscilla', 'Mensah', 'Local Area Coordinator', 'lac', null, 'Wollongong', { organisation: 'Coastal Community Partners', employmentType: 'external' }],
  ['ca3', 'Hiroshi', 'Tanaka', 'Senior Planner', 'pq', 'ahmed', 'Canberra'],
  ['ca4', 'Bronwyn', 'Kelly', 'Customer Service Officer', 'ccb', 'tarek', 'Brisbane'],
  ['ca5', 'Mohammed', 'Siddiqui', 'Claims Officer', 'cp', 'daniel', 'Canberra'],
  ['ca6', 'Ella', 'Robinson', 'Payments Officer', 'pi', 'wendy', 'Canberra'],
  ['ca7', 'Joshua', 'Pearce', 'Plan Reviewer', 'prt', 'nina', 'Canberra'],
  ['ca8', 'Anika', 'Sharma', 'Early Childhood Coordinator', 'ecei', null, 'Sydney', { organisation: 'BrightStart Early Childhood', employmentType: 'external' }],
  ['ca9', 'Connor', 'Byrne', 'Provider Registration Officer', 'prq', 'neil', 'Canberra'],
  ['ca10', 'Leilani', 'Fuimaono', 'Senior Customer Service Officer', 'ccg', 'jacob', 'Geelong'],
  ['ca11', 'Dimitri', 'Papadopoulos', 'Local Area Coordinator', 'lac', null, 'Geelong', { organisation: 'Coastal Community Partners', employmentType: 'external' }],
];

const GIVEN = ['Amelia', 'Noah', 'Olivia', 'Jack', 'Isla', 'William', 'Mia', 'Thomas', 'Charlotte', 'Lucas', 'Ava', 'Henry', 'Grace', 'Oliver', 'Zoe', 'Ethan', 'Chloe', 'Samuel', 'Ruby', 'Leo', 'Harper', 'Arjun', 'Mei', 'Kwame', 'Sienna', 'Rafael', 'Yasmin', 'Declan', 'Ngaio', 'Tariq', 'Anh', 'Jarrah', 'Ivy', 'Mateo', 'Freya', 'Hamish', 'Leila', 'Callum', 'Esther', 'Viktor'];
const FAMILY = ['Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Nguyen', 'Johnson', 'Martin', 'White', 'Anderson', 'Walker', 'Thompson', 'Thomas', 'Lee', 'Ryan', 'Kelly', 'Singh', 'Patel', 'Chen', 'Li', 'Kaur', 'Murray', 'Campbell', 'Clarke', 'Hughes', 'Edwards', 'Jackson', 'Russo', 'Novak', 'Okonkwo', 'Fernandes', 'Hoang', 'Bauer', 'Ivanova', 'Morales', 'Duncan', 'Sato', 'Gallagher', 'Ahmadi'];

// Team members (impacted employees) for each team: [groupKey, count, position, managerKey, location, extra]
export const TEAMS = [
  ['cp', 9, 'Claims Officer', 'daniel', 'Canberra'],
  ['pi', 4, 'Payments Integrity Officer', 'wendy', 'Canberra'],
  ['ccg', 8, 'Customer Service Officer', 'jacob', 'Geelong'],
  ['ccb', 6, 'Customer Service Officer', 'tarek', 'Brisbane'],
  ['prt', 6, 'Plan Reviewer', 'nina', 'Canberra'],
  ['pq', 3, 'Planner', 'ahmed', 'Canberra'],
  ['lac', 8, 'Local Area Coordinator', null, 'Regional NSW', { organisation: 'Coastal Community Partners', employmentType: 'external' }],
  ['ecei', 4, 'Early Childhood Coordinator', null, 'Sydney', { organisation: 'BrightStart Early Childhood', employmentType: 'external' }],
  ['prq', 3, 'Provider Registration Officer', 'neil', 'Canberra'],
  ['fo', 5, 'Finance Officer', 'gareth', 'Canberra'],
  ['ap', 4, 'Accounts Payable Officer', 'diane', 'Canberra'],
];

export function teamMembers(rand) {
  const out = [];
  let n = 0;
  for (const [groupKey, count, position, managerKey, location, extra] of TEAMS) {
    for (let i = 0; i < count; i++) {
      const given = GIVEN[(n * 7 + i * 3) % GIVEN.length];
      const family = FAMILY[(n * 11 + i * 5 + Math.floor(rand() * 3)) % FAMILY.length];
      out.push([`tm${n}`, given, family, position, groupKey, managerKey, location, extra || {}]);
      n++;
    }
  }
  return out;
}

// Demo application users: [key, name, roles, stakeholderKey, initiatives ('all' or keys), title]
export const USERS = [
  ['priya', 'Priya Raman', ['changeLead'], 'priya_s', ['pcmr', 'hwm', 'fss'], 'Change management lead'],
  ['tom', 'Tom Nguyen', ['practitioner'], 'tom_s', ['pcmr', 'hwm'], 'Change practitioner'],
  ['grace', 'Grace Okafor', ['commsAdviser'], 'grace_s', ['pcmr', 'hwm'], 'Communications adviser'],
  ['liam', 'Liam Walsh', ['trainingLead'], 'liam_s', ['pcmr', 'fss'], 'Training lead'],
  ['hannah', 'Hannah Brooks', ['pm'], 'hannah_s', ['pcmr'], 'Project director (PM/PMO)'],
  ['margaret', 'Margaret Chen', ['sponsor'], 'margaret', ['pcmr'], 'Primary sponsor'],
  ['daniel', 'Daniel Kowalski', ['peopleManager'], 'daniel', ['pcmr'], 'People manager'],
  ['aisha', 'Aisha Rahman', ['changeAgent'], 'aisha', ['pcmr'], 'Change agent'],
  ['robert', 'Robert Taylor', ['portfolio'], null, [], 'Portfolio change manager'],
  ['sam', 'Sam Lee', ['admin'], null, [], 'Administrator'],
  ['fiona', 'Fiona Grant', ['auditor'], null, [], 'Auditor (read-only)'],
];
