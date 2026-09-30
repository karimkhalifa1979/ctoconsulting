// End-to-end Word generation for a bid (spec 9.3): assemble, merge, check.
import { mergeTemplate } from './wordMerge.js';
import { buildWordTemplate } from './wordTemplate.js';
import { buildProposalData } from './proposalData.js';
import { outputChecks, otherClientNames, clientConsented } from '../core/checks.js';

export async function templateBytesFor(template, loadFile) {
  if (!template || template.builtIn) return buildWordTemplate(template?.builtIn === 'short' ? 'short' : 'proposal');
  const bytes = await loadFile(template.fileId);
  if (!bytes) throw new Error(`The file for template “${template.name}” is missing.`);
  return bytes;
}

export async function generateProposal(state, bid, { templateBytes, assets = {}, aiLog = [], caseStudyIds = null, now = new Date() } = {}) {
  const data = buildProposalData(state, bid, { assets, caseStudyIds, aiLog, now });
  const names = otherClientNames(state, bid).map((n) => {
    const canonical = state.clients.find((c) => c.id === n.clientId)?.name || n.name;
    return { name: n.name, allowed: clientConsented(state, bid, canonical) };
  });
  const res = await mergeTemplate(templateBytes, data, { title: bid.title, otherClientNames: names, personalNames: state.users.map((u) => u.name), now: now.toISOString() });
  const checks = outputChecks(state, bid, bid.sections, res.report);
  return { ...res, checks, data };
}
