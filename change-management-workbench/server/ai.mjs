// Optional AI assistance (Section 9.6). Capabilities: AIA-001 drafting narrative, AIA-002 summarising
// engagement notes, AIA-003 suggesting interventions, COM-009 drafting communications.
// Mandatory controls applied to every call:
//   AIA-004 output is advisory and returned as a draft for the user to review and accept;
//   AIA-005 sensitive fields are never sent, and no output is about named individuals;
//   AIA-006 prompts and outputs are logged to the audit trail;
//   AIA-007 features can be disabled for the tenant, per initiative and per feature.
import Anthropic from '@anthropic-ai/sdk';
import { AppError, asArray, stripHtml, escapeHtml } from '../shared/util.js';
import { ADKAR, adkarLabel, BARRIER_SIGNS, DEFAULT_LISTS } from '../shared/refdata.js';
import { NARRATIVE_KEYS } from '../shared/artefacts/catalogue.js';
import { listLabel } from '../shared/schema.js';
import { fmtDate } from '../shared/dates.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const client = new Anthropic();

const SYSTEM = `You assist an organisational change management team that follows the Prosci 3-Phase Process and the ADKAR Model.
Write in clear Australian English for a government or enterprise audience: plain language, short sentences, no hype.
Use only the facts provided. Where information is missing, say what is missing rather than inventing it.
Never characterise, judge or infer personal traits of named individuals. Write about groups, the change and the plan.
Your output is a draft that a change practitioner will review, edit and approve before it is used.`;

const FEATURES = {
  draftNarrative: { label: 'Draft narrative', run: draftNarrative },
  summariseEngagement: { label: 'Summarise engagement notes', run: summariseEngagement },
  suggestInterventions: { label: 'Suggest interventions', run: suggestInterventions },
  draftCommunication: { label: 'Draft communication', run: draftCommunication },
};

export async function runFeature(service, actor, feature, body) {
  const f = FEATURES[feature];
  if (!f) throw new AppError(404, 'Unknown AI feature.');
  const config = await service.getConfig();
  const ai = config.settings.ai || {};
  if (ai.enabled === false) throw new AppError(403, 'AI assistance is turned off for this organisation (AIA-007).');
  if (ai.features?.[feature] === false) throw new AppError(403, `${f.label} is turned off by your administrator (AIA-007).`);
  const initiative = await service.initiative(body.initiativeId);
  if (!initiative) throw new AppError(404, 'Initiative not found.');
  service.assertInitiative(actor, initiative);
  if (initiative.aiEnabled === false) throw new AppError(403, 'AI assistance is turned off for this initiative (AIA-007).');
  const model = await service.model(initiative.id);
  const { prompt, schema, effort = 'medium', post } = await f.run(model, body, config);
  const text = await callClaude({ prompt, schema, effort });
  const output = post ? post(text) : text;
  // AIA-006: prompts and outputs are logged for audit.
  await service.audit(actor, { action: 'ai', type: 'ai', initiativeId: initiative.id, recordId: body.recordId || null, summary: `${f.label} (${MODEL})`, prompt: prompt.slice(0, 20000), output: (typeof output === 'string' ? output : JSON.stringify(output)).slice(0, 20000) });
  return { feature, model: MODEL, aiDrafted: true, output };
}

async function callClaude({ prompt, schema, effort }) {
  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
      ...(process.env.CLAUDE_INFERENCE_GEO ? { inference_geo: process.env.CLAUDE_INFERENCE_GEO } : {}),
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new AppError(422, 'The AI service declined this request. Draft the content manually.');
    if (msg.stop_reason === 'max_tokens') throw new AppError(502, 'The AI draft was cut short. Try again with a narrower request.');
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!schema) return text;
    try {
      return JSON.parse(text);
    } catch {
      throw new AppError(502, 'The AI service returned an unreadable response. Try again.');
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new AppError(429, 'The AI service is busy. Try again in a minute.');
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AppError(503, 'The AI service credentials are not valid. Contact your administrator.');
    if (e instanceof Anthropic.BadRequestError) throw new AppError(502, `The AI service rejected the request: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new AppError(503, 'Could not reach the AI service. Check the network and try again.');
    if (e instanceof Anthropic.APIError) throw new AppError(502, `AI service error (${e.status}).`);
    throw e;
  }
}

// Non-sensitive context about the initiative (AIA-005: no engagement levels, sentiment, priority scores,
// individual ADKAR scores or private notes).
function context(m) {
  const lines = [];
  const i = m.initiative;
  lines.push(`Initiative: ${i.name}`);
  if (i.description) lines.push(`Description: ${i.description}`);
  for (const [k, label] of [['businessDrivers', 'Business drivers'], ['problemOpportunity', 'Problem or opportunity'], ['whyNow', 'Why now'], ['riskOfNotChanging', 'Risk of not changing'], ['whatIsChanging', 'What is changing'], ['whatIsNotChanging', 'What is not changing'], ['adoptionDefinition', 'What adoption looks like']]) {
    if (i[k]) lines.push(`${label}: ${stripHtml(i[k])}`);
  }
  if (m.objectives.length) lines.push(`Objectives: ${m.objectives.map((o) => o.title).join('; ')}`);
  if (m.milestones.length) lines.push(`Key dates: ${m.milestones.map((x) => `${x.name} ${fmtDate(x.date)}`).join('; ')}`);
  if (m.risk.profile) lines.push(`Change risk profile: ${m.risk.profile}`);
  lines.push(`Impacted groups (${m.groups.length}): ${m.groups.map((g) => `${g.name} (headcount ${g.headcount || 'n/a'}, overall impact ${g.overall ?? 'n/a'}/5${g.barrierPoint && g.barrierPoint !== 'none' ? `, ADKAR barrier point ${adkarLabel(g.barrierPoint)}` : ''}${g.readiness.index != null ? `, readiness ${g.readiness.index}/100` : ''})`).join('; ')}`);
  const p = m.progress.overall;
  lines.push(`Plan progress: ${p.complete} of ${p.total} activities complete; ${m.kpis.activitiesOverdue} overdue.`);
  if (m.kpis.engagementCoverage != null) lines.push(`Engagement coverage: ${m.kpis.engagementCoverage}% of stakeholders engaged within their required cadence.`);
  const topRisks = m.risks.filter((r) => r.status !== 'closed' && ['high', 'extreme'].includes(r.rating)).slice(0, 5);
  if (topRisks.length) lines.push(`Top risks: ${topRisks.map((r) => `${r.title} (${r.rating})`).join('; ')}`);
  return lines.join('\n');
}

async function draftNarrative(m, { key, instructions }) {
  const section = NARRATIVE_KEYS.find((n) => n.id === key) || { label: key || 'Narrative' };
  return {
    prompt: `Draft the "${section.label}" section for this initiative's change management artefacts.\n\n<facts>\n${context(m)}\n</facts>\n\n${instructions ? `Additional instructions from the practitioner: ${instructions}\n\n` : ''}Write 2–4 short paragraphs (or a short bulleted list where that reads better). Return plain text; separate paragraphs with a blank line and start bullet lines with "- ".`,
    effort: 'medium',
    post: (t) => toHtml(t),
  };
}

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'themes', 'concerns', 'questions', 'adkarElements', 'actions'],
  properties: {
    summary: { type: 'string', description: 'Neutral summary of what was discussed and agreed, 3–6 sentences.' },
    themes: { type: 'array', items: { type: 'string', enum: DEFAULT_LISTS.feedbackTheme.map((t) => t.id) } },
    concerns: { type: 'array', items: { type: 'string' }, description: 'Concerns or objections raised about the change, stated neutrally.' },
    questions: { type: 'array', items: { type: 'string' } },
    adkarElements: { type: 'array', items: { type: 'string', enum: ADKAR.map((a) => a.id) } },
    actions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string' } } } },
  },
};

async function summariseEngagement(m, { notes }) {
  const text = stripHtml(notes || '');
  if (text.length < 20) throw new AppError(422, 'Add the engagement notes to summarise.');
  return {
    prompt: `Summarise these engagement notes for the record and suggest the themes, concerns, questions, ADKAR elements addressed and follow-up actions. A practitioner will confirm each suggestion.\n\nThemes must come from this list: ${DEFAULT_LISTS.feedbackTheme.map((t) => `${t.id} (${t.label})`).join(', ')}.\nADKAR elements: ${ADKAR.map((a) => `${a.id} (${a.label}: ${a.outcome})`).join(' ')}\n\nDo not describe individuals' attitudes, emotions or personal characteristics.\n\n<notes>\n${text.slice(0, 30000)}\n</notes>`,
    schema: SUMMARY_SCHEMA,
    effort: 'low',
  };
}

const INTERVENTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['activities'],
  properties: {
    activities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'plan', 'role', 'timing'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          plan: { type: 'string', enum: ['sponsor', 'peopleManager', 'communications', 'training', 'resistance', 'changeAgent', 'sustainment'] },
          role: { type: 'string', enum: DEFAULT_LISTS.responsibleRole.map((r) => r.id) },
          timing: { type: 'string', description: 'When to run it relative to the key dates, in a few words.' },
        },
      },
    },
  },
};

async function suggestInterventions(m, { groupId }, config) {
  const g = m.groupsById[groupId];
  if (!g) throw new AppError(404, 'Impacted group not found.');
  const el = g.barrierPoint && g.barrierPoint !== 'none' ? g.barrierPoint : 'reinforcement';
  const existing = m.activities.filter((a) => a.status !== 'cancelled' && (!asArray(a.groupIds).length || asArray(a.groupIds).includes(g.id)) && asArray(a.adkar).includes(el)).map((a) => a.title);
  const library = config.interventions.filter((iv) => iv.element === el).map((iv) => `- ${iv.title}: ${iv.description}`).join('\n');
  return {
    prompt: `Suggest 3–5 practical activities to help the impacted group "${g.name}" move past its ADKAR barrier point.\n\n<facts>\n${context(m)}\nGroup: ${g.name}; headcount ${g.headcount}; barrier point ${adkarLabel(el)}${g.barrierPoint === 'none' ? ' (no barrier: suggest reinforcement)' : ''}.\nTypical signs of a ${adkarLabel(el)} barrier: ${BARRIER_SIGNS[el]}\nImpacts: ${g.impacts.map((i) => `${listLabel('impactAspect', i.aspect)} ${i.degree}/5${i.description ? ` – ${stripHtml(i.description)}` : ''}`).join('; ') || 'not recorded'}\nWhat's in it for them: ${stripHtml(g.wiifm || 'not recorded')}\nAnticipated concerns: ${stripHtml(g.concerns || 'not recorded')}\nAdoption challenge: ${stripHtml(g.adoptionChallenge || 'not recorded')}\nAlready planned for this element: ${existing.join('; ') || 'nothing'}\n</facts>\n\nThe organisation's intervention library for ${adkarLabel(el)}:\n${library}\n\nTailor the activities to this group; do not repeat activities already planned.`,
    schema: INTERVENTION_SCHEMA,
    effort: 'medium',
    post: (out) => ({ element: el, activities: asArray(out.activities) }),
  };
}

async function draftCommunication(m, { keyMessageIds = [], audienceGroupIds = [], channel, objective }) {
  const messages = m.keyMessages.filter((k) => keyMessageIds.includes(k.id));
  if (!messages.length) throw new AppError(422, 'Choose at least one approved key message to draft from (COM-009).');
  const groups = audienceGroupIds.map((id) => m.groupsById[id]).filter(Boolean);
  return {
    prompt: `Draft a ${channel || 'email'} communication for the audience below, built only from the approved key messages.\n\n<facts>\n${context(m)}\n</facts>\n\nObjective: ${objective || 'Inform the audience about the change'}\nAudience: ${groups.map((g) => `${g.name} (impact ${g.overall ?? 'n/a'}/5; what's in it for them: ${stripHtml(g.wiifm || 'not recorded')})`).join('; ') || 'all impacted staff'}\n\nApproved key messages:\n${messages.map((k) => `- ${k.title}: ${stripHtml(k.text)}`).join('\n')}\n\nReturn a subject line on the first line starting with "Subject:", then the body as plain paragraphs separated by blank lines. Keep it under 300 words. End with where to get help.`,
    effort: 'medium',
    post: (t) => {
      const [first, ...rest] = String(t).split('\n');
      const subject = first.replace(/^subject:\s*/i, '').trim();
      return { subject, html: toHtml(rest.join('\n').trim()) };
    },
  };
}

function toHtml(text) {
  const blocks = String(text || '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b) => {
    const lines = b.split('\n');
    if (lines.every((l) => /^[-•]\s+/.test(l.trim()))) return `<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(/^[-•]\s+/, ''))}</li>`).join('')}</ul>`;
    return `<p>${escapeHtml(b.replace(/\n/g, ' '))}</p>`;
  }).join('');
}
