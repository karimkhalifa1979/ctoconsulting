// Organisation profile model, questionnaire options and name-based inference.

export const SECTOR_TYPES = [
  { id: 'cth-ncce', label: 'Commonwealth non-corporate entity (department / agency)', gov: 'cth' },
  { id: 'cth-cce', label: 'Commonwealth corporate entity (statutory authority)', gov: 'cth' },
  { id: 'cth-company', label: 'Commonwealth company / GBE', gov: 'cth' },
  { id: 'state-gov', label: 'State or Territory government agency', gov: 'state' },
  { id: 'local-gov', label: 'Local government (council)', gov: 'local' },
  { id: 'listed', label: 'ASX-listed company', gov: '' },
  { id: 'private', label: 'Private company', gov: '' },
  { id: 'nfp', label: 'Not-for-profit / charity', gov: '' },
  { id: 'university', label: 'University / higher education provider', gov: '' },
];

export const INDUSTRIES = [
  { id: 'government-services', label: 'Government services & administration' },
  { id: 'disability-ndis', label: 'Disability services / NDIS' },
  { id: 'health', label: 'Health care & medical' },
  { id: 'aged-care', label: 'Aged care' },
  { id: 'banking', label: 'Banking (ADI)' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'superannuation', label: 'Superannuation' },
  { id: 'financial-services', label: 'Financial services, lending & payments' },
  { id: 'energy', label: 'Energy (electricity, gas, liquid fuels)' },
  { id: 'water', label: 'Water & sewerage' },
  { id: 'telco', label: 'Telecommunications' },
  { id: 'transport', label: 'Transport & logistics' },
  { id: 'education', label: 'Education' },
  { id: 'childcare-community', label: 'Child care & community services' },
  { id: 'retail', label: 'Retail & e-commerce' },
  { id: 'technology', label: 'Technology / SaaS / data services' },
  { id: 'defence', label: 'Defence & defence industry' },
  { id: 'resources', label: 'Mining, resources & agriculture' },
  { id: 'professional-services', label: 'Professional services' },
];

export const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
export const INTERNATIONAL = [
  { id: 'EU', label: 'European Union' },
  { id: 'UK', label: 'United Kingdom' },
  { id: 'US', label: 'United States' },
  { id: 'NZ', label: 'New Zealand' },
];

export const FLAGS = [
  { id: 'turnoverOver3m', label: 'Annual turnover above $3 million', group: 'Scale' },
  { id: 'turnoverOver100m', label: 'Consolidated revenue above $100 million', group: 'Scale' },
  { id: 'largeEntity', label: 'Large entity for climate reporting (e.g. 250+ employees or $50m+ revenue)', group: 'Scale' },
  { id: 'personalInfo', label: 'Collects or holds personal information', group: 'Information' },
  { id: 'healthInfo', label: 'Collects or holds health information / provides a health service', group: 'Information' },
  { id: 'tfn', label: 'Collects tax file numbers (e.g. as an employer)', group: 'Information' },
  { id: 'classified', label: 'Holds security-classified government information', group: 'Information' },
  { id: 'children', label: 'Provides services to children or young people', group: 'Services' },
  { id: 'publicDigital', label: 'Delivers digital services to the public (web / app / portal)', group: 'Services' },
  { id: 'paymentCards', label: 'Stores, processes or transmits payment card data', group: 'Services' },
  { id: 'usesAI', label: 'Develops or uses AI / automated decision-making', group: 'Technology' },
  { id: 'cloud', label: 'Uses public cloud or outsourced hosting', group: 'Technology' },
  { id: 'criticalInfrastructure', label: 'Owns or operates a critical infrastructure asset (SOCI)', group: 'Regulatory' },
  { id: 'apra', label: 'APRA-regulated entity', group: 'Regulatory' },
  { id: 'afsl', label: 'Holds an AFS or credit licence (ASIC-regulated)', group: 'Regulatory' },
  { id: 'aml', label: 'AUSTRAC reporting entity (AML/CTF)', group: 'Regulatory' },
  { id: 'cdr', label: 'Consumer Data Right data holder / accredited recipient', group: 'Regulatory' },
  { id: 'digitalId', label: 'Participates in the Australian Government Digital ID System or uses DVS/FVS', group: 'Regulatory' },
  { id: 'cthContractor', label: 'Contracted service provider to the Commonwealth', group: 'Regulatory' },
  { id: 'ndisProvider', label: 'Registered NDIS provider', group: 'Regulatory' },
  { id: 'usListed', label: 'Listed on a US exchange (SEC registrant)', group: 'Regulatory' },
];

export function emptyProfile(name = '') {
  return {
    name,
    shortName: acronym(name),
    sectorType: 'private',
    industries: [],
    states: [],
    international: [],
    flags: { personalInfo: true, tfn: true, publicDigital: true, cloud: true },
    notes: '',
  };
}

export function acronym(name) {
  const words = String(name || '').replace(/[()]/g, ' ').split(/\s+/).filter((w) => w && !/^(of|the|and|for|&)$/i.test(w));
  if (words.length === 1) return words[0].slice(0, 12);
  return words.map((w) => w[0].toUpperCase()).join('').slice(0, 8);
}

export const isCth = (p) => ['cth-ncce', 'cth-cce', 'cth-company'].includes(p.sectorType);
export const isStateGov = (p) => p.sectorType === 'state-gov';
export const isGov = (p) => isCth(p) || isStateGov(p) || p.sectorType === 'local-gov';
export const inState = (p, s) => (p.states || []).includes(s);
export const hasInd = (p, ...ids) => ids.some((i) => (p.industries || []).includes(i));
export const flag = (p, f) => Boolean(p.flags && p.flags[f]);
export const intl = (p, r) => (p.international || []).includes(r);

// A small directory of well-known Australian organisations used to seed the profile.
const KNOWN = [
  { match: /national (disability insurance|insurance disability) agency|\bndia\b/i, shortName: 'NDIA', sectorType: 'cth-cce', industries: ['government-services', 'disability-ndis'], flags: { healthInfo: true, children: true, usesAI: true, classified: true, digitalId: true, criticalInfrastructure: false, turnoverOver100m: true } },
  { match: /services australia|centrelink|medicare/i, shortName: 'SA', sectorType: 'cth-ncce', industries: ['government-services', 'health'], flags: { healthInfo: true, children: true, digitalId: true, classified: true, paymentCards: true, usesAI: true } },
  { match: /australian taxation office|\bato\b/i, shortName: 'ATO', sectorType: 'cth-ncce', industries: ['government-services'], flags: { classified: true, digitalId: true, usesAI: true, paymentCards: true } },
  { match: /department of home affairs|home affairs/i, shortName: 'DHA', sectorType: 'cth-ncce', industries: ['government-services', 'defence'], flags: { classified: true, digitalId: true, usesAI: true } },
  { match: /department of defence|\bdefence\b/i, shortName: 'Defence', sectorType: 'cth-ncce', industries: ['government-services', 'defence'], flags: { classified: true } },
  { match: /ndis quality and safeguards/i, shortName: 'NDISQSC', sectorType: 'cth-ncce', industries: ['government-services', 'disability-ndis'], flags: { healthInfo: true } },
  { match: /department|agency|commission|authority|office of the|ombudsman|australian (bureau|institute|federal)/i, sectorType: 'cth-ncce', industries: ['government-services'] },
  { match: /commonwealth bank|\bcba\b|westpac|national australia bank|\bnab\b|\banz\b|macquarie bank|bendigo|suncorp bank|ing bank|bank of queensland|\bboq\b/i, sectorType: 'listed', industries: ['banking', 'financial-services', 'insurance'], flags: { apra: true, afsl: true, aml: true, cdr: true, paymentCards: true, criticalInfrastructure: true, turnoverOver100m: true, largeEntity: true, usesAI: true, digitalId: true } },
  { match: /medibank|\bbupa\b|\bnib\b|\bhcf\b|hbf/i, sectorType: 'listed', industries: ['insurance', 'health'], flags: { apra: true, healthInfo: true, paymentCards: true, turnoverOver100m: true, largeEntity: true } },
  { match: /\biag\b|\bqbe\b|suncorp|allianz|insurance australia|\binsurance\b|insurer/i, sectorType: 'listed', industries: ['insurance'], flags: { apra: true, afsl: true, paymentCards: true, turnoverOver100m: true, largeEntity: true } },
  { match: /australiansuper|australian retirement trust|\bunisuper\b|\bhostplus\b|\baware super\b|\bcbus\b|super(annuation)? fund|\bsuper\b/i, sectorType: 'private', industries: ['superannuation', 'financial-services'], flags: { apra: true, afsl: true, aml: true, criticalInfrastructure: true, turnoverOver100m: true, largeEntity: true } },
  { match: /telstra|optus|\btpg\b|vodafone|aussie broadband|\bnbn\b/i, sectorType: 'listed', industries: ['telco'], flags: { criticalInfrastructure: true, paymentCards: true, turnoverOver100m: true, largeEntity: true, children: true } },
  { match: /\bagl\b|origin energy|energyaustralia|ausgrid|endeavour energy|essential energy|ausnet|transgrid|jemena|energy|power|electric/i, sectorType: 'listed', industries: ['energy'], flags: { criticalInfrastructure: true, cdr: true, paymentCards: true, turnoverOver100m: true, largeEntity: true } },
  { match: /sydney water|yarra valley water|water corporation|\bwater\b/i, sectorType: 'state-gov', industries: ['water'], flags: { criticalInfrastructure: true, paymentCards: true } },
  { match: /qantas|virgin australia|transurban|airport|rail|ports?\b|logistics|toll group/i, sectorType: 'listed', industries: ['transport'], flags: { criticalInfrastructure: true, paymentCards: true, turnoverOver100m: true, largeEntity: true } },
  { match: /woolworths|coles|wesfarmers|jb hi-?fi|harvey norman|myer|retail/i, sectorType: 'listed', industries: ['retail'], flags: { paymentCards: true, turnoverOver100m: true, largeEntity: true, criticalInfrastructure: true } },
  { match: /\bbhp\b|rio tinto|fortescue|woodside|santos|mining|resources/i, sectorType: 'listed', industries: ['resources'], flags: { turnoverOver100m: true, largeEntity: true, criticalInfrastructure: true } },
  { match: /university|\btafe\b|institute of technology/i, sectorType: 'university', industries: ['education'], flags: { children: false, turnoverOver100m: true, criticalInfrastructure: true, healthInfo: true } },
  { match: /school|college|grammar|education/i, sectorType: 'nfp', industries: ['education'], flags: { children: true } },
  { match: /hospital|health( service)?|medical|clinic|pathology|ramsay|healthscope/i, sectorType: 'private', industries: ['health'], flags: { healthInfo: true, criticalInfrastructure: true } },
  { match: /aged care|retirement|bolton clarke|regis|estia|opal/i, sectorType: 'private', industries: ['aged-care', 'health'], flags: { healthInfo: true } },
  { match: /\bcouncil\b|shire|city of/i, sectorType: 'local-gov', industries: ['government-services'], flags: { paymentCards: true, children: true } },
  { match: /bae systems|thales|lockheed|boeing|raytheon|\basc\b|austal|defence/i, sectorType: 'private', industries: ['defence'], flags: { classified: true, cthContractor: true, criticalInfrastructure: true, usListed: false } },
  { match: /atlassian|canva|xero|afterpay|software|technologies|tech\b|digital|cloud|data centre|airtrunk|nextdc/i, sectorType: 'private', industries: ['technology'], flags: { usesAI: true, cloud: true, paymentCards: true } },
  { match: /bank|credit union|mutual|finance|capital|payments?|lending|wealth/i, sectorType: 'private', industries: ['financial-services'], flags: { afsl: true, aml: true, paymentCards: true } },
  { match: /foundation|charity|society|association|mission|salvation|vinnies|red cross/i, sectorType: 'nfp', industries: ['childcare-community'] },
  { match: /disability|ndis/i, industries: ['disability-ndis'], flags: { ndisProvider: true, healthInfo: true } },
];

// Jurisdiction cues: state names and capital cities.
const STATE_CUES = [
  [/\bnsw\b|new south wales|sydney|newcastle|wollongong|parramatta/i, 'NSW'],
  [/victoria(n)?\b|\bvic\b|melbourne|geelong/i, 'VIC'],
  [/queensland|\bqld\b|brisbane|gold coast/i, 'QLD'],
  [/western australia|\bwa\b|perth/i, 'WA'],
  [/south australia|adelaide/i, 'SA'],
  [/tasmania|hobart/i, 'TAS'],
  [/\bact government\b|canberra|australian capital territory/i, 'ACT'],
  [/northern territory|darwin/i, 'NT'],
];
const STATE_GOV_CUE = /department|agency|government|commission|authority|office|premier|council|ministry|health service|water|transport for/i;

// Infers a starting profile from an organisation name. Returns { profile, matched: [rationale] }.
export function inferProfile(name) {
  const p = emptyProfile(name);
  const matched = [];
  // The first (most specific) entry decides sector, industries and flags;
  // jurisdiction-only entries (those with states) always contribute their state.
  let primary = null;
  for (const k of KNOWN) {
    if (!k.match.test(name)) continue;
    if (primary) continue;
    primary = k;
    if (k.sectorType) p.sectorType = k.sectorType;
    if (k.shortName) p.shortName = k.shortName;
    p.industries = [...(k.industries || [])];
    Object.assign(p.flags, Object.fromEntries(Object.entries(k.flags || {}).filter(([, v]) => v)));
    matched.push(name.match(k.match)[0]);
  }
  for (const [re, st] of STATE_CUES) if (re.test(name)) p.states = [...new Set([...p.states, st])];
  // A government-style name that also names a state is a state agency, not a Commonwealth one.
  if (p.states.length && (p.sectorType === 'cth-ncce' || (!primary || primary.sectorType !== 'local-gov') && STATE_GOV_CUE.test(name) && !/\b(pty|ltd|limited|inc)\b/i.test(name) && /department|agency|government|commission|authority|office|premier|ministry/i.test(name))) {
    p.sectorType = 'state-gov';
    if (!p.industries.includes('government-services')) p.industries.unshift('government-services');
  }
  if (/education|school/i.test(name) && isGov(p) && !p.industries.includes('education')) p.industries.push('education');
  if (/health/i.test(name) && isGov(p) && !p.industries.includes('health')) { p.industries.push('health'); p.flags.healthInfo = true; }
  if (isCth(p)) {
    Object.assign(p.flags, { personalInfo: true, turnoverOver3m: true });
    p.states = [...STATES];
  }
  if (['listed', 'university'].includes(p.sectorType)) p.flags.turnoverOver3m = true;
  if (p.flags.turnoverOver100m) p.flags.turnoverOver3m = true;
  if (!p.states.length && !isCth(p)) p.states = ['NSW'];
  return { profile: p, matched };
}
