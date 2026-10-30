// Unit tests for the shared business rules: reporting calendar (BR-01), business days, the
// financial year, RAG derivation (BR-03, BR-04, BR-06), risk rating (RSK-002), access grants
// (section 5.2), formatting (NFR-027) and safe rich text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekEnding, weekStart, addBusinessDays, businessDayDiff, fyOf, fyMonths, monthsBetween, holidaySet } from '../shared/dates.js';
import { deriveRag, worstRag, isBetter, engagementHealth } from '../shared/rag.js';
import { riskLevel, rateRisk } from '../shared/risk.js';
import { parseCell, mergeGrants, readOnly, DEFAULT_MATRIX } from '../shared/permissions.js';
import { fmtMoney, fmtDate, fmtPct, fmtMoneyShort } from '../shared/format.js';
import { richToHTML, isBlankRich } from '../shared/markdown.js';
import { PUBLIC_HOLIDAYS } from '../shared/defaults.js';

test('reporting weeks end on Friday and timesheet weeks start on Monday (BR-01)', () => {
  assert.equal(weekEnding('2026-10-27'), '2026-10-30'); // Tuesday → Friday
  assert.equal(weekEnding('2026-10-30'), '2026-10-30'); // Friday stays
  assert.equal(weekEnding('2026-10-31'), '2026-11-06'); // Saturday → next Friday
  assert.equal(weekStart('2026-11-01'), '2026-10-26'); // Sunday → Monday before
  assert.equal(weekStart('2026-10-26'), '2026-10-26');
});

test('business days skip weekends and public holidays', () => {
  const nsw = holidaySet(PUBLIC_HOLIDAYS, 'NSW');
  assert.equal(addBusinessDays('2026-10-30', 1, nsw), '2026-11-02'); // Friday + 1 → Monday
  assert.equal(businessDayDiff('2026-10-26', '2026-10-30', nsw), 4);
  // Christmas Day and Boxing Day 2026 fall on Friday and Saturday; the Monday is a substitute day in NSW.
  const after = addBusinessDays('2026-12-24', 1, nsw);
  assert.ok(after > '2026-12-25', `next business day after 24 Dec is ${after}`);
});

test('the financial year runs July to June', () => {
  assert.equal(fyOf('2026-06-30'), 2026);
  assert.equal(fyOf('2026-07-01'), 2027);
  assert.deepEqual(fyMonths(2027).slice(0, 2), ['2026-07', '2026-08']);
  assert.equal(fyMonths(2027).at(-1), '2027-06');
  assert.deepEqual(monthsBetween('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

const base = { today: '2026-10-30', keyMilestones: [], openRisks: [], openIssues: [], holidays: new Set() };

test('schedule is Red when a key milestone slips beyond the time tolerance (BR-03, BR-04)', () => {
  const late = deriveRag({ ...base, timeToleranceDays: 10, keyMilestones: [{ name: 'Go-live', baseline_date: '2026-11-02', forecast_date: '2026-11-30' }] });
  assert.equal(late.schedule.rag, 'Red');
  const within = deriveRag({ ...base, timeToleranceDays: 10, keyMilestones: [{ name: 'Go-live', baseline_date: '2026-11-02', forecast_date: '2026-11-05' }] });
  assert.equal(within.schedule.rag, 'Amber');
  const missed = deriveRag({ ...base, keyMilestones: [{ name: 'Design', planned_date: '2026-10-01', forecast_date: '2026-10-20' }] });
  assert.equal(missed.schedule.rag, 'Red');
});

test('budget is rated from EAC against BAC, margin and PO exhaustion (BR-03)', () => {
  assert.equal(deriveRag({ ...base, bac: 100000, eac: 104000, costTolerancePct: 0.05 }).budget.rag, 'Amber');
  assert.equal(deriveRag({ ...base, bac: 100000, eac: 107000, costTolerancePct: 0.05 }).budget.rag, 'Red');
  assert.equal(deriveRag({ ...base, bac: 100000, eac: 98000, forecastMargin: 0.45 }).budget.rag, 'Green');
  assert.equal(deriveRag({ ...base, bac: 100000, eac: 98000, forecastMargin: 0.2 }).budget.rag, 'Red');
  assert.equal(deriveRag({ ...base, bac: 100000, eac: 98000, poExhaustsBeforeEnd: true, poExhaustionDate: '2027-01-04' }).budget.rag, 'Red');
});

test('an open Extreme risk makes risks Red and the overall rating is the worst dimension', () => {
  const r = deriveRag({ ...base, openRisks: [{ level: 'Extreme' }] });
  assert.equal(r.risk.rag, 'Red');
  assert.equal(r.overall.rag, 'Red');
  assert.equal(deriveRag(base).overall.rag, 'Green');
  assert.equal(worstRag('Green', 'Amber', 'Green'), 'Amber');
});

test('a chosen rating better than the calculated one is an override needing justification (BR-06)', () => {
  assert.equal(isBetter('Amber', 'Red'), true);
  assert.equal(isBetter('Red', 'Amber'), false);
  assert.equal(isBetter('Amber', 'Amber'), false);
});

test('engagement health is the worst project rating by default (BR-16)', () => {
  assert.equal(engagementHealth([{ rag: 'Green', bac: 1 }, { rag: 'Red', bac: 1 }]), 'Red');
});

test('risks are rated on the likelihood × consequence matrix (RSK-002)', () => {
  assert.equal(riskLevel(5, 5), 'Extreme');
  assert.equal(riskLevel(1, 1), 'Low');
  assert.equal(riskLevel(0, 3), null);
  const r = rateRisk({ likelihood: 4, consequence: 4, residual_likelihood: 2 });
  assert.equal(r.inherent_score, 16);
  assert.equal(r.residual_score, 8);
});

test('access grants: a broader grant wins and portfolio roles are read-only (section 5.2)', () => {
  assert.deepEqual([...parseCell('CRU:own').actions], ['C', 'R', 'U']);
  assert.equal(parseCell('CRU:own').qualifier, 'own');
  const g = mergeGrants(mergeGrants({}, 'RU:own'), 'R');
  assert.equal(g.R, null); // unqualified read wins
  assert.equal(g.U, 'own');
  assert.equal(readOnly('CRUA'), 'R');
  assert.equal(readOnly(''), '');
  // Clients never get write access to plans or budgets (CPT-005).
  assert.ok(!/[CU]/.test(DEFAULT_MATRIX.plan.client));
  assert.equal(DEFAULT_MATRIX.budget.client, '');
});

test('Australian formats: AUD, dd/mm/yyyy and percentages (NFR-027)', () => {
  assert.equal(fmtMoney(1234567), '$1,234,567');
  assert.equal(fmtMoney(-500), '-$500');
  assert.equal(fmtDate('2026-10-30'), '30/10/2026');
  assert.equal(fmtPct(0.4567, 1), '45.7%');
  assert.equal(fmtMoneyShort(2020000), '$2.02m');
});

test('rich text is escaped, so narrative cannot inject markup', () => {
  const html = richToHTML('Hello <script>alert(1)</script> **bold**');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.equal(isBlankRich(' - \n * '), true);
});
