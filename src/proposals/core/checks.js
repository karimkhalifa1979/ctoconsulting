// Content checks and pre-final output checks (spec 9.3, WD-07). Each failure links to the section to fix.
import { htmlToText, htmlWords } from './util.js';
import { aiPendingCount, flagCount, unmappedMandatory, gatePassed } from './workflow.js';
import { citationsIn, parseSrc } from './html.js';
import { usageMode, approvedVersion, newerVersionAvailable } from './library.js';

const Z_STEMS = 'organi|reali|recogni|prioriti|optimi|minimi|maximi|standardi|customi|utili|authori|summari|categori|capitali|emphasi|finali|visuali|moderni|centrali|mobili|operationali|synchroni|monetiz|apologi|criti|characteri|speciali|stabili|normali|legali|incentivi|contextuali|operationali';
const Z_RE = new RegExp(`\\b(${Z_STEMS})z(e|es|ed|ing|ation|ations|er|ers)\\b`, 'gi');
const US_WORDS = {
  analyze: 'analyse', analyzed: 'analysed', analyzing: 'analysing', catalog: 'catalogue', center: 'centre', centers: 'centres', color: 'colour', colors: 'colours',
  favor: 'favour', favorable: 'favourable', behavior: 'behaviour', behaviors: 'behaviours', honor: 'honour', defense: 'defence', fulfill: 'fulfil', fulfillment: 'fulfilment',
  enroll: 'enrol', enrollment: 'enrolment', modeling: 'modelling', modeled: 'modelled', traveling: 'travelling', canceled: 'cancelled', labeled: 'labelled', labeling: 'labelling',
  aging: 'ageing', gray: 'grey', judgement: null, license: null, program: null, practicing: 'practising', skeptical: 'sceptical', artifact: 'artefact', artifacts: 'artefacts',
  mold: 'mould', percent: 'per cent', enrolling: 'enrolling', counseling: 'counselling', leveraging: null,
};

export function spellingIssues(text) {
  const out = [];
  const seen = new Set();
  let m;
  Z_RE.lastIndex = 0;
  while ((m = Z_RE.exec(text))) {
    const w = m[0];
    const fix = w.replace(/z(e|es|ed|ing|ation|ations|er|ers)$/i, (x, s) => `s${s}`).replace(/Z(E|ES|ED|ING|ATION|ATIONS)$/, (x, s) => `S${s}`);
    if (!seen.has(w.toLowerCase())) { seen.add(w.toLowerCase()); out.push({ word: w, fix }); }
  }
  for (const w of text.match(/\b[A-Za-z]+\b/g) || []) {
    const fix = US_WORDS[w.toLowerCase()];
    if (fix && !seen.has(w.toLowerCase())) { seen.add(w.toLowerCase()); out.push({ word: w, fix }); }
  }
  return out;
}

export function styleIssues(text, styleGuide = {}) {
  const out = [];
  for (const phrase of styleGuide.bannedPhrases || []) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text)) out.push({ kind: 'banned', phrase });
  }
  for (const t of styleGuide.preferredTerms || []) {
    const re = new RegExp(`\\b${t.avoid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text)) out.push({ kind: 'preferred', phrase: t.avoid, use: t.use });
  }
  return out;
}

// Names of other clients (and client-named case studies) that must not appear in this bid.
export function otherClientNames(state, bid) {
  const names = [];
  for (const c of state.clients) {
    if (c.id === bid.clientId) continue;
    for (const n of [c.name, ...(c.aliases || [])]) if (n && n.length > 3) names.push({ name: n, clientId: c.id });
  }
  for (const i of state.library) {
    const f = approvedVersion(i)?.fields;
    if (i.type === 'case_study' && f?.client && i.clientId !== bid.clientId && !names.some((x) => x.name === f.client)) names.push({ name: f.client, clientId: i.clientId, itemId: i.id });
  }
  return names;
}

// A client has consented to be named if an approved case study for them may be used with their name.
export function clientConsented(state, bid, clientName) {
  return state.library.some((i) => i.type === 'case_study' && i.approvedV && !i.retired && approvedVersion(i)?.fields?.client === clientName && usageMode(i, bid.clientId) === 'named');
}

export function otherClientHits(state, bid, section) {
  const text = htmlToText(section.content);
  const hits = [];
  const seen = new Set();
  for (const n of otherClientNames(state, bid)) {
    const re = new RegExp(`\\b${n.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (!re.test(text)) continue;
    const client = state.clients.find((c) => c.id === n.clientId);
    const canonical = client?.name || n.name;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    // Naming a client who has consented (through an approved, named case study) is allowed but flagged for a human check.
    hits.push({ ...n, name: canonical, consented: clientConsented(state, bid, canonical) });
  }
  return hits;
}

// Lightweight checks shown while authoring (section sidebar).
export function sectionChecks(state, bid, section) {
  const text = htmlToText(section.content);
  const words = htmlWords(section.content);
  return {
    words,
    overLimit: section.wordLimit ? words > section.wordLimit : false,
    ai: aiPendingCount(section.content),
    flags: flagCount(section.content),
    spelling: spellingIssues(text),
    style: styleIssues(text, state.settings.styleGuide),
    otherClients: otherClientHits(state, bid, section),
    openComments: (section.comments || []).filter((c) => c.status === 'open').length,
  };
}

const res = (id, label, status, detail, items = []) => ({ id, label, status, detail, items });

// Pre-final checks for a generated proposal. `render` is the generator's report on the actual .docx.
export function outputChecks(state, bid, sections, render = {}) {
  const out = [];
  const included = sections;
  const byId = new Map(bid.sections.map((s) => [s.id, s]));

  // 1. Every mandatory requirement maps to answered content.
  const unmapped = unmappedMandatory(bid);
  const unanswered = bid.requirements.filter((r) => r.kind === 'mandatory' && !r.excluded && (r.sectionIds || []).length && !(r.sectionIds || []).some((id) => {
    const s = included.find((x) => x.id === id);
    return s && htmlWords(s.content) > 10;
  }));
  out.push(res('mandatory', 'Every mandatory requirement maps to answered content', unmapped.length || unanswered.length ? 'fail' : 'pass',
    unmapped.length || unanswered.length ? `${unmapped.length} unmapped, ${unanswered.length} mapped to empty sections.` : `${bid.requirements.filter((r) => r.kind === 'mandatory').length} mandatory requirements answered.`,
    [...unmapped.map((r) => ({ text: `${r.ref} is not mapped to a section`, reqId: r.id })), ...unanswered.map((r) => ({ text: `${r.ref} maps to a section with no content`, reqId: r.id, sectionId: r.sectionIds[0] }))]));

  // 2. Word and page limits.
  const over = included.filter((s) => s.wordLimit && htmlWords(s.content) > s.wordLimit);
  out.push(res('words', 'Section word limits are met', over.length ? 'fail' : 'pass', over.length ? `${over.length} section(s) over their word limit.` : 'All sections are within their word limits.',
    over.map((s) => ({ text: `${s.title}: ${htmlWords(s.content)} words (limit ${s.wordLimit})`, sectionId: s.id }))));
  const pageLimit = (bid.extraction?.submission || []).filter((x) => x.label === 'Page limit').map((x) => x.number).filter(Boolean).pop();
  if (pageLimit) {
    const pages = render.bodyPages ?? render.pages;
    const est = render.pagesEstimated;
    out.push(res('pages', 'Page limit is met', pages == null ? 'warn' : pages > pageLimit ? 'fail' : 'pass',
      pages == null ? `Limit ${pageLimit} pages. Page count not available.` : `${pages} page${pages === 1 ? '' : 's'} against a limit of ${pageLimit}${est ? ' (estimated; render the PDF on the server for an exact count)' : ' (counted on the rendered PDF)'}.`));
  }

  // 3. Placeholders and references.
  const unresolved = render.unresolved || [];
  const empty = render.emptyFields || [];
  out.push(res('placeholders', 'No empty or unresolved placeholders remain', unresolved.length ? 'fail' : empty.length ? 'warn' : 'pass',
    unresolved.length ? `${unresolved.length} unresolved tag(s).` : empty.length ? `${empty.length} field(s) resolved to an empty value.` : 'All template tags resolved.',
    [...unresolved.map((t) => ({ text: `Unresolved: ${t}` })), ...empty.map((t) => ({ text: `Empty value: ${t}` }))]));
  const refIssues = [];
  for (const s of included) {
    for (const c of citationsIn(s.content)) {
      const p = parseSrc(c.src);
      if (p?.kind !== 'library') continue;
      const item = state.library.find((i) => i.id === p.id);
      if (!item) refIssues.push({ text: `${s.title}: cites a library item that no longer exists (${c.label})`, sectionId: s.id, level: 'fail' });
      else if (item.retired) refIssues.push({ text: `${s.title}: cites retired item ${item.key}`, sectionId: s.id, level: 'fail' });
      else if (item.expiry && item.expiry < new Date().toISOString().slice(0, 10)) refIssues.push({ text: `${s.title}: cites expired item ${item.key}`, sectionId: s.id, level: 'fail' });
      else if (newerVersionAvailable(item, p.v)) refIssues.push({ text: `${s.title}: ${item.key} v${p.v} used; v${item.approvedV} is now approved`, sectionId: s.id, level: 'warn' });
    }
  }
  for (const b of render.brokenRefs || []) refIssues.push({ text: `Broken reference: ${b}`, level: 'fail' });
  out.push(res('references', 'No broken references or outdated sources', refIssues.some((x) => x.level === 'fail') ? 'fail' : refIssues.length ? 'warn' : 'pass',
    refIssues.length ? `${refIssues.length} source issue(s).` : 'All cited sources are current and approved.', refIssues));

  // 4. Comments, tracked changes, AI review and evidence flags.
  const open = included.flatMap((s) => (s.comments || []).filter((c) => c.status === 'open').map((c) => ({ text: `${s.title}: open ${c.suggestion ? 'suggestion' : 'comment'} “${(c.text || '').slice(0, 60)}”`, sectionId: s.id })));
  if (render.trackedChanges) open.push({ text: 'The template contains tracked changes' });
  if (render.comments) open.push({ text: 'The template contains Word comments' });
  out.push(res('comments', 'No comments or tracked changes remain', open.length ? 'fail' : 'pass', open.length ? `${open.length} open item(s).` : 'No open comments, suggestions or tracked changes.', open));
  const ai = included.filter((s) => aiPendingCount(s.content)).map((s) => ({ text: `${s.title}: ${aiPendingCount(s.content)} unreviewed AI passage(s)`, sectionId: s.id }));
  const flags = included.filter((s) => flagCount(s.content)).map((s) => ({ text: `${s.title}: ${flagCount(s.content)} sentence(s) flagged “needs evidence”`, sectionId: s.id }));
  out.push(res('ai', 'All AI text reviewed and evidence flags resolved', ai.length || flags.length ? 'fail' : 'pass', ai.length || flags.length ? `${ai.length + flags.length} section(s) need attention.` : 'No unreviewed AI text or evidence flags.', [...ai, ...flags]));

  // 5. Other clients' names and confidential content.
  const names = [];
  for (const s of included) for (const h of otherClientHits(state, bid, s)) names.push({ text: `${s.title}: mentions “${h.name}”${h.consented ? ' (named case study with consent)' : ''}`, sectionId: s.id, level: h.consented ? 'warn' : 'fail' });
  for (const n of render.otherClientNames || []) names.push({ text: `Generated document mentions “${n}”`, level: 'fail' });
  out.push(res('confidential', 'No other client’s name or confidential content appears', names.some((n) => n.level === 'fail') ? 'fail' : names.length ? 'warn' : 'pass',
    names.length ? `${names.length} mention(s) found.` : 'No other client names found.', names));

  // 6. Australian English and the style guide.
  const spell = [];
  const style = [];
  for (const s of included) {
    const t = htmlToText(s.content);
    for (const x of spellingIssues(t)) spell.push({ text: `${s.title}: “${x.word}” → “${x.fix}”`, sectionId: s.id });
    for (const x of styleIssues(t, state.settings.styleGuide)) style.push({ text: x.kind === 'banned' ? `${s.title}: banned phrase “${x.phrase}”` : `${s.title}: use “${x.use}” instead of “${x.phrase}”`, sectionId: s.id, level: x.kind === 'banned' ? 'fail' : 'warn' });
  }
  out.push(res('spelling', 'Australian English spelling and the style guide are followed', style.some((x) => x.level === 'fail') ? 'fail' : spell.length || style.length ? 'warn' : 'pass',
    spell.length || style.length ? `${spell.length} spelling and ${style.length} style issue(s).` : 'No issues found.', [...spell, ...style]));

  // 7. Structure and accessibility.
  const struct = [];
  let prev = 0;
  for (const h of render.headings || []) {
    if (prev && h.level > prev + 1) struct.push({ text: `Heading “${h.text}” skips from level ${prev} to ${h.level}` });
    prev = h.level;
  }
  for (const img of render.images || []) if (!img.alt) struct.push({ text: `An image has no alt text (${img.name || 'image'})` });
  for (const t of render.tables || []) if (!t.header) struct.push({ text: `Table “${t.caption || 'untitled'}” has no header row` });
  out.push(res('structure', 'Headings in order, images have alt text, tables have header rows', struct.length ? 'fail' : 'pass', struct.length ? `${struct.length} issue(s).` : `${(render.headings || []).length} headings, ${(render.tables || []).length} tables and ${(render.images || []).length} images checked.`, struct));

  // 8. Document properties and hidden text.
  const props = [];
  if (render.hiddenText) props.push({ text: 'Hidden text found in the document' });
  for (const p of render.personalProperties || []) props.push({ text: `Document property contains personal data: ${p}` });
  out.push(res('properties', 'Document properties and hidden text are cleaned', props.length ? 'fail' : 'pass', props.length ? `${props.length} issue(s).` : 'Properties set to CTO Consulting; no hidden text.', props));

  // 9. Approvals (informational for drafts; enforced when marking final).
  const gates = ['g2', 'g3'].filter((g) => !gatePassed(state, bid, g));
  out.push(res('approvals', 'Required approvals are in place', gates.length ? 'warn' : 'pass', gates.length ? `Gate ${gates.map((g) => g.slice(1)).join(' and ')} not yet passed. This output can be reviewed but not marked final.` : 'Gates 2 and 3 have passed.'));
  void byId;
  return out;
}

export const checksPass = (checks) => !checks.some((c) => c.status === 'fail');
