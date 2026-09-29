// Discovery: evaluates every known source against an organisation profile, then
// generates an organisation-specific obligations register and policy requirements.
import { LIBRARY_RULES, EXTRA_SOURCES, EXTRA_BY_NAME, POLICIES, evaluateSource, extraObligations } from './catalog.js';
import { isCth, hasInd } from './profile.js';
import { policyCodeOf } from './registerParser.js';

const LEVEL_ORDER = { mandatory: 0, conditional: 1, recommended: 2 };

function mostCommon(values) {
  const c = {};
  for (const v of values) if (v) c[v] = (c[v] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

// Metadata for each source name in the library register.
export function librarySourceIndex(library) {
  const bySource = {};
  for (const o of library.obligations) (bySource[o.name] ||= []).push(o);
  const idx = {};
  for (const [name, list] of Object.entries(bySource)) {
    idx[name] = {
      name,
      publisher: mostCommon(list.map((o) => o.publisher)),
      type: mostCommon(list.map((o) => o.type)),
      url: mostCommon(list.map((o) => o.urls.split(/\s+/)[0])),
      count: list.length,
      origin: 'register',
    };
  }
  for (const s of EXTRA_SOURCES) {
    idx[s.name] = { name: s.name, publisher: s.publisher, type: s.type, url: s.url, count: s.obligations.length, origin: 'catalogue' };
  }
  return idx;
}

// Returns every applicable source with its applicability level and rationale.
export function discoverSources(profile, library) {
  const idx = librarySourceIndex(library);
  const out = [];
  for (const name of Object.keys(idx)) {
    const res = evaluateSource(name, profile);
    if (!res) continue;
    // Very large recommended frameworks are proposed but not pre-selected.
    const selected = res.level !== 'recommended' || idx[name].count <= 150;
    out.push({ ...idx[name], ...res, selected });
  }
  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.count - a.count || a.name.localeCompare(b.name));
}

export function orgPrefix(shortName) {
  return String(shortName || 'ORG').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'ORG';
}

// Rewrites template text written for the reference organisation to suit the new organisation.
export function makeGeneraliser(org) {
  const short = org.shortName || org.name;
  const gov = isCth(org.profile);
  const ndis = hasInd(org.profile, 'disability-ndis');
  const client = ['state-gov', 'local-gov'].includes(org.profile.sectorType) || gov ? 'client' : 'customer';
  // "an NDIA" -> "a CBA" / "an ATO": acronyms take the article of their spoken first letter.
  const vowelSound = /^[A-Z0-9]{2,}$/.test(short) ? /^[AEFHILMNORSX8]/.test(short) : /^[aeiou]/i.test(short);
  return (text) => {
    if (!text) return text;
    let t = String(text)
      .replace(/\b([Aa])n NDIA\b/g, (_, a) => `${vowelSound ? `${a}n` : a} ${short}`)
      .replace(/National (Disability Insurance|Insurance Disability) Agency/g, org.name)
      .replace(/\bNDIA\b/g, short);
    if (!gov) t = t.replace(/\bAccountable Authority\b/g, 'Accountable Executive').replace(/\bAPS employees\b/g, 'employees');
    if (!ndis) {
      t = t.replace(/\bNDIS participants\b/g, `${client}s`).replace(/\bparticipants\b/g, `${client}s`).replace(/\bparticipant\b/g, client).replace(/\bParticipant\b/g, client[0].toUpperCase() + client.slice(1));
    }
    return t;
  };
}

// Drops framework references that only apply to Commonwealth or NDIS entities.
function relevantStandards(text, profile) {
  const parts = String(text || '').split(/;\s*/).filter(Boolean);
  const kept = parts.filter((p) => (isCth(profile) || !/PSPF|PGPA|Commonwealth|\bAPS\b|Archives Act|FOI Act|DTA\b/i.test(p))
    && (hasInd(profile, 'disability-ndis') || !/NDIS/i.test(p)));
  return kept.join('; ') || (parts.length ? 'Refer to the applicable sources mapped to this requirement.' : '');
}

const REQ_TEXT_FIELDS = ['title', 'obligationDescription', 'requirement', 'controlObjective', 'threat', 'applicability', 'excluded', 'guidance', 'technicalControls', 'processSteps', 'accountable', 'responsible', 'consulted', 'informed', 'exceptionProcess', 'exceptionAuthority', 'verification', 'evidence', 'relatedPolicies', 'relatedProcedures', 'owner', 'section'];

// Generates obligations and policy requirements for an organisation from the selected sources.
// extras: additional sources proposed by AI research ({ name, publisher, type, url, reason, level, obligations: [{id, reference, description, req}] }).
export function generateRegister(org, selectedSources, library, extras = []) {
  const P = org.prefix;
  const gen = makeGeneraliser(org);
  const today = new Date().toISOString().slice(0, 10);
  const templates = Object.fromEntries(library.requirements.map((r) => [r.id, r]));
  const libBySource = {};
  for (const o of library.obligations) (libBySource[o.name] ||= []).push(o);
  const extraByName = Object.fromEntries(extras.map((e) => [e.name, e]));

  const remapReq = (tid) => {
    const code = policyCodeOf(tid);
    return `${P}-ICT-${code}-${tid.slice(-3)}`;
  };

  const obligations = [];
  const reqLinks = {}; // template id -> [obligation]
  for (const src of selectedSources) {
    let list;
    if (libBySource[src.name]) list = libBySource[src.name];
    else if (EXTRA_BY_NAME[src.name]) list = extraObligations(EXTRA_BY_NAME[src.name]);
    else if (extraByName[src.name]) {
      const e = extraByName[src.name];
      list = (e.obligations || []).map((x) => ({ id: x.id, reference: x.reference, description: x.description, name: e.name, requirementIds: [x.req], source: e.type, publisher: e.publisher, type: e.type, urls: e.url }));
    } else list = [];
    list.forEach((o, i) => {
      const tids = o.requirementIds.filter((t) => templates[t]);
      if (!tids.length) return;
      const code = policyCodeOf(tids[0]);
      const desc = gen(o.description);
      const rec = {
        policyNumber: `${P}-POL-ICT-${code}-001`,
        id: o.id,
        key: `${o.id}#${obligations.length}`,
        requirementIds: tids.map(remapReq),
        name: o.name,
        reference: gen(o.reference),
        description: desc,
        applicability: `Applies because: ${src.reason}. Means for the ${org.shortName}: ${desc}`,
        source: o.source,
        publisher: o.publisher,
        type: o.type,
        urls: o.urls,
        policyCode: code,
        level: src.level,
      };
      obligations.push(rec);
      for (const t of tids) (reqLinks[t] ||= []).push(rec);
      void i;
    });
  }

  const requirements = Object.keys(reqLinks).sort().map((tid) => {
    const t = templates[tid];
    const links = reqLinks[tid];
    const code = policyCodeOf(tid);
    const r = { ...t };
    for (const f of REQ_TEXT_FIELDS) r[f] = gen(t[f]);
    r.otherStandards = relevantStandards(t.otherStandards, org.profile);
    const refs = [...new Set(links.map((o) => o.reference || o.id))];
    const mandatory = links.some((o) => o.level !== 'recommended');
    return {
      ...r,
      id: remapReq(tid),
      templateId: tid,
      policyCode: code,
      policyTitle: POLICIES[code]?.title || gen(t.policyTitle),
      policyNumber: `${P}-POL-ICT-${code}-001`,
      policyDomain: POLICIES[code]?.domain || t.policyDomain,
      obligationRef: refs.slice(0, 12).join('; ') + (refs.length > 12 ? `; +${refs.length - 12} more` : ''),
      type: mandatory ? 'Mandatory' : 'Recommended',
      status: 'Draft',
      dateCaptured: today,
      lastReviewed: '',
      notes: `Generated from requirement template ${tid}. ${links.length} obligation(s) from ${new Set(links.map((o) => o.name)).size} source(s) mapped. Review and tailor before approval.`,
    };
  });
  return { requirements, obligations, exemptions: [] };
}

// Policies present in a requirement set: code -> { code, title, number, count }.
export function policiesOf(requirements) {
  const map = {};
  for (const r of requirements) {
    const code = r.policyCode || policyCodeOf(r.id);
    const m = (map[code] ||= { code, titles: [], numbers: [], count: 0 });
    m.titles.push(r.policyTitle); m.numbers.push(r.policyNumber); m.count++;
  }
  return Object.fromEntries(Object.entries(map).map(([code, m]) => {
    const title = mostCommon(m.titles) || POLICIES[code]?.title || code;
    const expected = m.numbers.find((n) => policyCodeOf(n) === code) || mostCommon(m.numbers);
    return [code, { code, title, number: expected, count: m.count, domain: POLICIES[code]?.domain || '' }];
  }));
}

// Registers that were loaded from a workbook: derive source levels from the rules.
export function sourcesFromObligations(obligations, profile) {
  const groups = {};
  for (const o of obligations) (groups[o.name] ||= []).push(o);
  return Object.entries(groups).map(([name, list]) => {
    const res = evaluateSource(name, profile) || { level: 'conditional', reason: 'Included in the organisation\'s policy requirements register — confirm the triggering activity applies' };
    return {
      name, level: res.level, reason: res.reason, selected: true,
      publisher: mostCommon(list.map((o) => o.publisher)), type: mostCommon(list.map((o) => o.type)),
      url: mostCommon(list.map((o) => (o.urls || '').split(/\s+/)[0])), count: list.length,
      origin: LIBRARY_RULES[name] ? 'register' : EXTRA_BY_NAME[name] ? 'catalogue' : 'register',
    };
  }).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.count - a.count);
}

// Data quality observations for a register.
export function dataQuality(data) {
  const issues = [];
  const mism = data.requirements.filter((r) => r.policyNumber && policyCodeOf(r.policyNumber) && policyCodeOf(r.policyNumber) !== r.policyCode);
  if (mism.length) issues.push({ severity: 'Medium', text: `${mism.length} requirement(s) carry a Policy Number that does not match their Requirement ID policy code (e.g. ${mism[0].id} → ${mism[0].policyNumber}). The tool groups them by Requirement ID.` });
  const reqIds = new Set(data.requirements.map((r) => r.id));
  const orphan = data.obligations.filter((o) => !o.requirementIds.some((id) => reqIds.has(id)));
  if (orphan.length) issues.push({ severity: 'High', text: `${orphan.length} obligation(s) are not mapped to any policy requirement.` });
  const unmapped = data.requirements.filter((r) => !data.obligations.some((o) => o.requirementIds.includes(r.id)));
  if (unmapped.length) issues.push({ severity: 'Low', text: `${unmapped.length} requirement(s) have no obligations mapped in the Obligations register (${unmapped.slice(0, 3).map((r) => r.id).join(', ')}${unmapped.length > 3 ? '…' : ''}).` });
  const typo = data.requirements.find((r) => /Accrediatiobn/.test(r.policyTitle));
  if (typo) issues.push({ severity: 'Low', text: `Policy title typo: "${typo.policyTitle}".` });
  const noEvidence = data.requirements.filter((r) => !r.evidence);
  if (noEvidence.length) issues.push({ severity: 'Medium', text: `${noEvidence.length} requirement(s) have no Evidence / Artefacts Required.` });
  return issues;
}
