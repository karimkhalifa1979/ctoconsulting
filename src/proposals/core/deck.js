// Presentation storyboards (spec section 10): action titles, 3–5 points and speaker notes per slide,
// built from approved bid content and citing it. Claude produces the same structure when configured.
import { topBlocks, blockSentences, textOf } from './html.js';
import { computePricing } from './pricing.js';
import { approvedVersion, usageMode, anonymise, itemHtml } from './library.js';
import { clientShort, retrieve } from './drafting.js';
import { parseSrc } from './html.js';
import { aud, audShort, longDate, splitSentences, truncate, uid, htmlToText } from './util.js';
import { SLIDE_KINDS } from './constants.js';

export const DECK_PROMPT_VERSION = 'deck-2026.09.1';

// Case studies for a bid: those cited in its sections, topped up with the most relevant approved ones.
export function selectedCaseStudies(state, bid, ids) {
  if (ids?.length) return ids.map((id) => state.library.find((i) => i.id === id)).filter(Boolean);
  const cited = new Set();
  for (const s of bid.sections) for (const c of s.citations || []) { const p = parseSrc(c.src); if (p?.kind === 'library') cited.add(p.id); }
  const items = state.library.filter((i) => i.type === 'case_study' && cited.has(i.id) && i.approvedV && !i.retired);
  if (items.length >= 2) return items.slice(0, 4);
  const extra = retrieve(state, bid, `${bid.title} ${bid.requirements.map((r) => r.text).join(' ')}`, { limit: 3, types: ['case_study'] }).map((c) => c.item);
  return [...new Map([...items, ...extra].map((i) => [i.id, i])).values()].slice(0, 3);
}

// Capacity of each layout's placeholders in the CTO master (characters), used to flag overflow (PP-06).
export const CAPACITY = { title: 78, subtitle: 110, point: 120, points: 5, minPoints: 3, notes: 3000, tableRows: 9, teamMembers: 6 };

function sectionSentences(bid, re, n = 6) {
  const s = bid.sections.find((x) => re.test(`${x.key} ${x.title}`));
  if (!s) return { section: null, items: [] };
  const items = [];
  for (const b of topBlocks(s.content)) {
    if (b.name === 'h2' || b.name === 'h3') { items.push({ text: textOf(b), heading: true, cites: [{ src: `sec:${s.id}`, label: s.title }] }); continue; }
    if (!['p', 'ul', 'ol'].includes(b.name)) continue;
    for (const x of blockSentences(b)) if (!x.flag && x.text.split(/\s+/).length >= 5 && !/^This section responds/.test(x.text)) items.push({ text: x.text, cites: x.cites.length ? x.cites : [{ src: `sec:${s.id}`, label: s.title }] });
  }
  return { section: s, items: items.slice(0, n * 3) };
}

const point = (t) => truncate(String(t).replace(/\s+/g, ' ').trim().replace(/\.$/, ''), CAPACITY.point);
const uniq = (arr) => [...new Map(arr.map((x) => [x.text || x, x])).values()];

export function buildStoryboard(state, bid, recipe, { include = null, caseStudyIds = null } = {}) {
  const client = clientShort(state, bid);
  const clientFull = state.clients.find((c) => c.id === bid.clientId)?.name || client;
  const p = computePricing(state, bid);
  const partner = state.users.find((u) => u.id === bid.partnerId);
  const bm = state.users.find((u) => u.id === bid.bidManagerId);
  const lead = (bid.staffing || []).find((l) => l.keyPerson && l.consultantId) || (bid.staffing || []).find((l) => l.consultantId);
  const leadName = state.consultants.find((c) => c.id === lead?.consultantId)?.name;
  const slides = [];
  const add = (kind, s) => slides.push({ id: uid('sl'), kind, layout: SLIDE_KINDS[kind]?.layout || 'content', include: include ? include.includes(kind) : true, points: [], notes: '', sources: [], ...s });
  const kinds = recipe.slides.map((s) => s.kind);
  for (const kind of kinds) {
    switch (kind) {
      case 'title':
        add(kind, { title: bid.title, subtitle: `Presentation to ${clientFull}${bid.closing?.date ? ` · ${longDate(bid.closing.date, { weekday: false })}` : ''}`, notes: `Thank the panel. Introduce ${partner?.name || 'the engagement partner'} and the team. Set out the agenda and the time allowed for questions.` });
        break;
      case 'agenda':
        add(kind, { title: 'Agenda', points: [...new Set(kinds.filter((k) => !['title', 'agenda', 'questions'].includes(k)).map((k) => SLIDE_KINDS[k]?.title).filter(Boolean))].slice(0, 7), notes: 'Walk through the agenda in under a minute.' });
        break;
      case 'understanding': {
        const u = sectionSentences(bid, /understand/i);
        const pts = uniq([...u.items.filter((x) => !x.heading), ...bid.requirements.filter((r) => r.kind === 'mandatory').slice(0, 3).map((r) => ({ text: r.text, cites: [{ src: `req:${r.id}`, label: r.ref }] }))]).slice(0, 4);
        add(kind, { title: `What ${client} needs, and why it matters now`, points: pts.map((x) => point(x.text)), sources: pts.flatMap((x) => x.cites || []), notes: u.items.slice(0, 6).map((x) => x.text).join(' ') || bid.brief?.need || '' });
        break;
      }
      case 'approach': case 'exec_summary': case 'objectives': case 'scope': case 'governance': case 'first_30_days': {
        const re = { approach: /approach|method/i, exec_summary: /exec/i, objectives: /understand|objective/i, scope: /scope|approach/i, governance: /governance|risk/i, first_30_days: /transition|plan|delivery/i }[kind];
        const u = sectionSentences(bid, re);
        const heads = u.items.filter((x) => x.heading);
        const body = u.items.filter((x) => !x.heading);
        const pts = (heads.length >= 3 ? heads : body).slice(0, 5);
        const first = body[0]?.text || '';
        const titles = { approach: `A phased approach that ${/secur|risk/i.test(first) ? 'builds security in from day one' : 'reduces delivery risk'}`, exec_summary: `Why ${client} can choose CTO Consulting with confidence`, objectives: 'What we will achieve together', scope: 'What is in scope', governance: 'Governance that keeps the program on track', first_30_days: 'Our first 30 days' };
        add(kind, { title: titles[kind], points: pts.map((x) => point(x.text)), sources: pts.flatMap((x) => x.cites || []), notes: body.slice(0, 5).map((x) => x.text).join(' ') });
        break;
      }
      case 'timeline': case 'plan': {
        const ms = p.milestones.length ? p.milestones.map((m) => ({ label: m.label, detail: `${m.pct}%` })) : (bid.plan?.milestones || []).filter((m) => !['gate1', 'plan'].includes(m.key)).map((m) => ({ label: m.label, detail: m.date }));
        const table = bid.sections.find((s) => /delivery|timeline|plan/i.test(s.title));
        const rows = [];
        if (table) {
          const m = table.content.match(/<table[\s\S]*?<\/table>/);
          if (m) for (const tr of m[0].match(/<tr>[\s\S]*?<\/tr>/g) || []) { const cells = (tr.match(/<t[dh]>[\s\S]*?<\/t[dh]>/g) || []).map((c) => htmlToText(c)); if (!/<th>/.test(tr) && cells.length >= 2) rows.push({ label: cells[0], detail: cells[1] }); }
        }
        const phases = rows.length ? rows : ms;
        add(kind, { title: phases.length ? `${phases.length} phases, each with a clear exit point` : 'Timeline', points: phases.slice(0, 6).map((x) => point(`${x.label}: ${x.detail}`)), data: { phases: phases.slice(0, 6) }, sources: table ? [{ src: `sec:${table.id}`, label: table.title }] : [], notes: 'Explain how each phase ends with an agreed exit point, and how the timeline protects the key deadline.' });
        break;
      }
      case 'team': {
        const members = (bid.staffing || []).filter((l) => l.include !== false).map((l) => { const c = state.consultants.find((x) => x.id === l.consultantId); return { name: c?.name || 'To be named', role: l.role, level: l.level, clearance: c?.clearance || '', bio: truncate(splitSentences(c?.bio || '')[0] || '', 140), consultantId: c?.id || null, photo: c?.photo || null }; });
        add(kind, { title: leadName ? `An experienced, cleared team led by ${leadName}` : 'Your team', points: members.slice(0, 5).map((m) => `${m.name}, ${m.role}`), data: { members: members.slice(0, CAPACITY.teamMembers) }, sources: members.filter((m) => m.consultantId).map((m) => ({ src: `con:${m.consultantId}`, label: m.name })), notes: members.map((m) => `${m.name} (${m.role}): ${m.bio}`).join(' ') });
        break;
      }
      case 'case_studies': {
        for (const cs of selectedCaseStudies(state, bid, caseStudyIds).slice(0, 3)) {
          const v = approvedVersion(cs);
          const f = v.fields || {};
          const mode = usageMode(cs, bid.clientId);
          const label = v.anonymised?.title || f.anonymisedName || 'A previous client';
          const a = (t) => anonymise(t || '', f.client, label, mode === 'anonymised');
          const who = mode === 'anonymised' ? label : f.client;
          add(kind, { title: truncate(`${who}: ${(f.outcomes || [])[0] || a(v.title)}`, CAPACITY.title), points: (f.outcomes || []).slice(0, 4).map((o) => point(a(o))), data: { caseStudy: { title: a(v.title), client: who, sector: f.sector, summary: a(f.summary), services: (f.services || []).join(', '), value: f.value ? audShort(f.value) : '' } }, sources: [{ src: `lib:${cs.id}@${v.v}`, label: cs.key }], notes: `${a(f.summary)} ${a(f.approach || '')}`.trim() });
        }
        break;
      }
      case 'why': {
        const themes = bid.plan?.winThemes?.length ? bid.plan.winThemes : bid.brief?.winThemes || [];
        add(kind, { title: `${themes.length || 3} reasons to choose CTO Consulting`, points: themes.slice(0, 5).map(point), notes: 'Tie each reason to the evaluation criteria and to evidence the panel has already seen.' });
        break;
      }
      case 'commercial': {
        add(kind, { title: `${p.model === 'fixed' ? 'A fixed price' : p.model === 'capped' ? 'A capped price' : 'Transparent pricing'} of ${aud(p.subtotal)} excluding GST`, points: [`Pricing model: ${p.model === 'fixed' ? 'fixed price with milestones' : p.model === 'capped' ? 'capped time and materials' : p.model === 'retainer' ? 'retainer' : 'time and materials'}`, `Total excluding GST: ${aud(p.subtotal)}`, `GST: ${aud(p.gst)}`, `Total including GST: ${aud(p.total)}`], data: { lines: p.lines.map((l) => ({ role: l.role || l.level, amount: l.sell })), milestones: p.milestones }, notes: 'Walk through the pricing model and payment milestones. Do not discuss cost or margin.' });
        break;
      }
      case 'next_steps':
        add(kind, { title: 'Next steps', points: ['Answer any questions from the panel', bid.extraction?.dates?.find((d) => /contract start/i.test(d.label)) ? `Confirm the contract start date of ${longDate(bid.extraction.dates.find((d) => /contract start/i.test(d.label)).date, { weekday: false })}` : 'Confirm the contract start date', 'Mobilise the named team within two weeks of award', `Hold a kick-off workshop with ${client}’s leadership team`], notes: 'Close with a clear ask and thank the panel.' });
        break;
      case 'questions':
        add(kind, { title: 'Questions', subtitle: `${partner?.name || ''} · ${partner?.email || ''}`, notes: 'Use the rehearsal pack for likely questions and named presenters.' });
        break;
      case 'who_we_are': {
        const sa = state.library.find((i) => i.key === 'SA-001');
        const sents = sa ? splitSentences(htmlToText(itemHtml(sa))).slice(0, 4) : [];
        add(kind, { title: 'An Australian firm that delivers complex technology change', points: sents.map(point), sources: sa ? [{ src: `lib:${sa.id}@${sa.approvedV}`, label: sa.key }] : [], notes: sents.join(' ') });
        break;
      }
      case 'services':
        add(kind, { title: 'Services across the technology lifecycle', points: (state.taxonomy.offerings || []).slice(0, 5), notes: 'Tailor the emphasis to the client’s priorities.' });
        break;
      case 'sectors':
        add(kind, { title: 'Deep experience in regulated sectors', points: (state.taxonomy.sectors || []).slice(0, 5), notes: '' });
        break;
      case 'credentials': {
        const ev = state.library.filter((i) => i.type === 'evidence' && i.approvedV && !i.retired).slice(0, 5);
        add(kind, { title: 'Certified, insured and panel-approved', points: ev.map((i) => point(i.title)), sources: ev.map((i) => ({ src: `lib:${i.id}@${i.approvedV}`, label: i.key })), notes: '' });
        break;
      }
      case 'contacts':
        add(kind, { title: 'Contacts', points: [partner && `${partner.name}, ${partner.title} — ${partner.email}`, bm && `${bm.name}, ${bm.title} — ${bm.email}`].filter(Boolean), notes: '' });
        break;
      default:
        add(kind, { title: SLIDE_KINDS[kind]?.title || kind, points: [], notes: '' });
    }
  }
  for (const s of slides) s.overflow = overflowIssues(s);
  return { recipeId: recipe.id, recipeName: recipe.name, slides, generatedAt: new Date().toISOString(), engine: 'offline', promptVersion: DECK_PROMPT_VERSION };
}

// PP-06: flag text that would not fit its placeholder, instead of shrinking it.
export function overflowIssues(slide) {
  const out = [];
  if ((slide.title || '').length > CAPACITY.title) out.push(`Title is ${slide.title.length} characters; the title placeholder fits ${CAPACITY.title}.`);
  if (['content'].includes(slide.layout)) {
    if ((slide.points || []).length > (slide.kind === 'agenda' ? 7 : CAPACITY.points)) out.push(`${slide.points.length} points; the layout fits ${CAPACITY.points}.`);
    if ((slide.points || []).length && slide.points.length < CAPACITY.minPoints && !['questions', 'title'].includes(slide.kind)) out.push(`Only ${slide.points.length} point${slide.points.length === 1 ? '' : 's'}; aim for 3 to 5.`);
  }
  (slide.points || []).forEach((p, i) => { if (p.length > CAPACITY.point) out.push(`Point ${i + 1} is ${p.length} characters; points fit ${CAPACITY.point}.`); });
  if ((slide.subtitle || '').length > CAPACITY.subtitle) out.push('Subtitle is too long for its placeholder.');
  if (slide.data?.members?.length > CAPACITY.teamMembers) out.push(`${slide.data.members.length} team members; the team layout fits ${CAPACITY.teamMembers}.`);
  if (slide.layout === 'content' && !slide.points?.length && !['questions', 'title'].includes(slide.kind)) out.push('No points yet.');
  return out;
}

// PP-08: likely panel questions from the evaluation criteria and risks, with suggested answers and presenters.
export function rehearsalPack(state, bid) {
  const qs = [];
  const presenterFor = (sectionIds) => {
    const s = bid.sections.find((x) => sectionIds.includes(x.id));
    return state.users.find((u) => u.id === s?.ownerId)?.name || state.users.find((u) => u.id === bid.partnerId)?.name;
  };
  for (const c of bid.criteria) {
    const reqs = bid.requirements.filter((r) => r.criterionId === c.id && !r.excluded);
    const sids = [...new Set(reqs.flatMap((r) => r.sectionIds || []))];
    const answerFrom = bid.sections.filter((s) => sids.includes(s.id)).flatMap((s) => topBlocks(s.content).filter((b) => b.name === 'p').flatMap((b) => blockSentences(b).map((x) => x.text))).filter((t) => t.split(/\s+/).length > 7 && !/^This section responds/.test(t)).slice(0, 2).join(' ');
    const name = c.name.replace(/^./, (x) => x.toLowerCase());
    qs.push({ criterion: c.name, weight: c.weight, question: /price|value|cost/i.test(c.name) ? 'How confident are you in your price, and what could cause it to change?' : /understand/i.test(c.name) ? 'What do you see as the biggest challenge in this program?' : /approach|method/i.test(c.name) ? 'What is the biggest risk in your approach, and how will you manage it?' : /team|personnel|capabil/i.test(c.name) ? 'Who exactly will do the work, and what happens if a key person leaves?' : /experience|case/i.test(c.name) ? 'Which of your past projects is most like ours, and what went wrong on it?' : `What is the biggest risk to ${name}, and how will you manage it?`, answer: answerFrom || 'Draft an answer from the approved sections.', presenter: presenterFor(sids) });
  }
  for (const r of bid.brief?.risks || []) qs.push({ criterion: 'Risk', weight: null, question: `The request implies a risk: “${r}” How will you handle it?`, answer: 'Explain the mitigation and point to the pricing assumptions and risk register.', presenter: state.users.find((u) => u.id === bid.partnerId)?.name });
  for (const d of bid.pricing?.departures || []) qs.push({ criterion: 'Commercial', weight: null, question: `Why do you propose a departure from ${d.clause}?`, answer: d.rationale || '', presenter: state.users.find((u) => u.id === bid.partnerId)?.name });
  return qs;
}
