// Workflow engine: configurable stages, gates, approval rules and exit conditions (spec sections 5 and 6).
import { STAGES, GATES, stageLabel, gateLabel, roleLabel } from './constants.js';
import { computePricing } from './pricing.js';
import { userOf, hasRole } from './permissions.js';

export const aiPendingCount = (html) => (String(html || '').match(/data-ai="pending"/g) || []).length;
export const flagCount = (html) => (String(html || '').match(/data-flag="needs-evidence"/g) || []).length;

export function workflowOf(state, bid) {
  return state.workflows.find((w) => w.id === bid.workflowId) || state.workflows.find((w) => w.default) || state.workflows[0];
}

export function stagesOf(state, bid) {
  const wf = workflowOf(state, bid);
  const set = new Set(wf?.stages || STAGES.map((s) => s.id));
  return STAGES.filter((s) => set.has(s.id));
}

export function gateEnabled(state, bid, gateId) {
  const wf = workflowOf(state, bid);
  return wf?.gates?.[gateId]?.enabled !== false;
}

function fieldValue(state, bid, field) {
  if (field === 'value') return Number(bid.value) || 0;
  if (field === 'marginPct') {
    const p = computePricing(state, bid);
    return p.marginPct === null ? null : p.marginPct * 100;
  }
  if (field === 'confidential') return bid.confidential ? 1 : 0;
  return null;
}

const OPS = { '>=': (a, b) => a >= b, '>': (a, b) => a > b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '=': (a, b) => a === b };

export function ruleApplies(state, bid, rule) {
  const v = fieldValue(state, bid, rule.field);
  if (v === null || v === undefined) return false;
  return OPS[rule.op]?.(v, Number(rule.value)) || false;
}

// Required approvals for a gate: base approvers from the template, raised by any rule whose condition holds.
export function gateRequirements(state, bid, gateId) {
  const wf = workflowOf(state, bid);
  const base = wf?.gates?.[gateId]?.approvers || [];
  const reqs = base.map((a) => ({ role: a.role, count: Number(a.count) || 1, reasons: ['Workflow template'] }));
  for (const rule of wf?.rules || []) {
    if (rule.gate !== gateId || !ruleApplies(state, bid, rule)) continue;
    const ex = reqs.find((r) => r.role === rule.role);
    if (ex) {
      if (rule.count > ex.count) ex.count = Number(rule.count);
      ex.reasons.push(rule.label);
    } else reqs.push({ role: rule.role, count: Number(rule.count) || 1, reasons: [rule.label] });
  }
  return reqs;
}

// Sections a gate covers: gate 2 covers commercial sections, gate 3 covers the whole response.
export function gateCoverage(bid, gateId) {
  if (gateId === 'g1') return [];
  if (gateId === 'g2') return bid.sections.filter((s) => s.commercial).map((s) => s.id);
  return bid.sections.map((s) => s.id);
}

export function activeDecisions(gate) {
  return (gate?.decisions || []).filter((d) => !d.void && d.requestId === gate.requestId);
}

export function gateState(state, bid, gateId) {
  const enabled = gateEnabled(state, bid, gateId);
  const gate = bid.gates?.[gateId] || { status: 'not_requested', decisions: [] };
  const decisions = activeDecisions(gate);
  const reqs = gateRequirements(state, bid, gateId).map((r) => {
    const have = decisions.filter((d) => d.decision !== 'reject' && d.role === r.role);
    return { ...r, have, met: new Set(have.map((d) => d.onBehalfOf || d.by)).size >= r.count };
  });
  const rejected = decisions.find((d) => d.decision === 'reject') || null;
  return { enabled, gate, status: enabled ? gate.status : 'skipped', decisions, reqs, rejected, allMet: reqs.every((r) => r.met) };
}

export function gatePassed(state, bid, gateId) {
  return !gateEnabled(state, bid, gateId) || bid.gates?.[gateId]?.status === 'passed';
}

export function unmappedMandatory(bid) {
  return bid.requirements.filter((r) => r.kind === 'mandatory' && !r.excluded && !(r.sectionIds || []).length);
}

// Current section approval state: required reviewers must approve the current version.
export function sectionApproval(bid, section) {
  const current = (section.approvals || []).filter((a) => !a.void && a.v === section.v);
  const required = section.reviewers?.length ? section.reviewers : null;
  const approvedBy = new Set(current.map((a) => a.by));
  const outstanding = required ? required.filter((u) => !approvedBy.has(u)) : current.length ? [] : ['any'];
  return { current, required, outstanding, complete: outstanding.length === 0 };
}

// Blockers that stop a bid manager requesting gate 2 or gate 3.
export function gatePreconditions(state, bid, gateId) {
  const out = [];
  if (!gateEnabled(state, bid, gateId)) return ['This gate is not part of the bid’s workflow.'];
  const covered = bid.sections.filter((s) => gateCoverage(bid, gateId).includes(s.id));
  const stages = stagesOf(state, bid).map((s) => s.id);
  if (gateId === 'g2') {
    if (!(bid.staffing || []).length) out.push('Build the team and pricing before requesting commercial approval.');
    const p = computePricing(state, bid);
    for (const i of p.issues) out.push(`Pricing: ${i}`);
  }
  if (gateId === 'g3' && gateEnabled(state, bid, 'g2') && bid.gates?.g2?.status !== 'passed') out.push('Gate 2 (commercial approval) must pass first.');
  if (stages.includes('review')) {
    const notApproved = covered.filter((s) => !['approved', 'locked'].includes(s.status));
    if (notApproved.length) out.push(`${notApproved.length} section${notApproved.length === 1 ? ' is' : 's are'} not yet approved: ${notApproved.map((s) => s.title).slice(0, 4).join(', ')}${notApproved.length > 4 ? '…' : ''}`);
  }
  const ai = covered.filter((s) => aiPendingCount(s.content));
  if (ai.length) out.push(`Unreviewed AI text remains in: ${ai.map((s) => s.title).join(', ')}. A person must accept or edit it (WD-03).`);
  if (gateId === 'g3') {
    const um = unmappedMandatory(bid);
    if (um.length) out.push(`${um.length} mandatory requirement${um.length === 1 ? ' is' : 's are'} not mapped to a response section (${um.slice(0, 5).map((r) => r.ref).join(', ')}${um.length > 5 ? '…' : ''}).`);
  }
  return out;
}

export function nextStageId(state, bid) {
  const list = stagesOf(state, bid).map((s) => s.id);
  const i = list.indexOf(bid.stage);
  if (i < 0) return null;
  return i === list.length - 1 ? 'closed' : list[i + 1];
}

// Exit conditions for the current stage (spec section 5 table).
export function stageBlockers(state, bid) {
  const out = [];
  const stages = stagesOf(state, bid).map((s) => s.id);
  switch (bid.stage) {
    case 'intake':
      if (!bid.documents.some((d) => d.type === 'request' || d.type === 'form')) out.push('Attach the client’s request documents.');
      break;
    case 'qualify':
      if (gateEnabled(state, bid, 'g1') && bid.gates?.g1?.status !== 'passed') out.push('Gate 1: a partner must record the bid/no-bid decision.');
      break;
    case 'plan':
      if (!bid.sections.length) out.push('Build the response outline.');
      if (bid.sections.some((s) => !s.ownerId)) out.push('Every section needs an owner.');
      if (bid.sections.some((s) => !s.due)) out.push('Every section needs a due date.');
      if (!bid.plan?.published) out.push('Publish the plan to the team.');
      break;
    case 'author': {
      const notReady = bid.sections.filter((s) => !['in_review', 'approved', 'locked'].includes(s.status));
      if (notReady.length) out.push(`${notReady.length} section${notReady.length === 1 ? ' is' : 's are'} not marked ready for review.`);
      if (!(bid.staffing || []).length) out.push('Build the proposed team and pricing.');
      break;
    }
    case 'review': {
      const notApproved = bid.sections.filter((s) => !['approved', 'locked'].includes(s.status));
      if (notApproved.length) out.push(`${notApproved.length} section${notApproved.length === 1 ? ' is' : 's are'} not approved by reviewers.`);
      break;
    }
    case 'approve':
      for (const g of ['g2', 'g3']) if (!gatePassed(state, bid, g)) out.push(`Gate ${g.slice(1)}: ${gateLabel(g).toLowerCase()} has not passed.`);
      break;
    case 'produce':
      if (!bid.outputs.some((o) => o.final && ['docx', 'manual-docx'].includes(o.kind))) out.push('Mark a checked Word proposal as final.');
      break;
    case 'submit':
      if (!bid.submission) out.push('Record the submission.');
      break;
    case 'outcome':
      if (!bid.outcome) out.push('Record the outcome (win or loss with reasons).');
      break;
    default:
      break;
  }
  if (!stages.includes(bid.stage) && !['archived', 'closed'].includes(bid.stage)) out.push(`Stage ${stageLabel(bid.stage)} is not part of this workflow.`);
  return out;
}

// Users eligible to decide a gate for a given role, honouring delegations.
export function eligibleApprovers(state, bid, gateId) {
  const reqs = gateRequirements(state, bid, gateId);
  const out = [];
  for (const r of reqs) {
    for (const u of state.users) {
      if (u.active === false || !hasRole(u, r.role)) continue;
      if (bid.ethicalWall?.users?.includes(u.id)) continue;
      const onTeam = bid.partnerId === u.id || bid.bidManagerId === u.id || (bid.members || []).some((m) => m.userId === u.id) || bid.sections.some((s) => s.reviewers?.includes(u.id));
      if (gateId === 'g1' ? hasRole(u, 'partner') : onTeam) out.push({ userId: u.id, role: r.role });
    }
  }
  return out;
}

export function describeReq(r) {
  return `${r.count} × ${roleLabel(r.role)}`;
}

export function approverNames(state, ids) {
  return ids.map((id) => userOf(state, id)?.name || id).join(', ');
}

export { STAGES, GATES };
