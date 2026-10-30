// Rate resolution (FIN-004, FIN-005, FIN-006).
// Charge-out precedence: named person, engagement, agreement or panel, client, Firm standard.
// Cost rates are per person with effective dates; placeholders use the grade average.
import { LISTS } from '../../shared/defaults.js';

export function createRates(app) {
  const { repos } = app;

  function cardsFor(engagementId, date) {
    const eng = engagementId ? repos.engagement.get(engagementId) : null;
    const cards = repos.rate_card.find({}).filter((c) => c.status !== 'Retired' && c.status !== 'Draft'
      && (!c.effective_from || c.effective_from <= date) && (!c.effective_to || c.effective_to >= date));
    const agreementIds = new Set(eng ? repos.contract.find({ engagement_id: eng.id }).map((k) => k.agreement_id).filter(Boolean) : []);
    if (eng) for (const a of repos.agreement.find({ client_id: eng.client_id })) if (a.status === 'Active') agreementIds.add(a.id);
    const tiers = [
      cards.filter((c) => c.level === 'Engagement' && eng && c.engagement_ref === eng.id),
      cards.filter((c) => c.level === 'Agreement' && agreementIds.has(c.agreement_id)),
      cards.filter((c) => c.level === 'Client' && eng && c.client_id === eng.client_id),
      cards.filter((c) => c.level === 'Firm'),
    ];
    return { eng, tiers };
  }

  function lineRate(card, line, date) {
    let rate = Number(line.rate) || 0;
    if (card.indexation && card.indexation_from && date >= card.indexation_from) rate *= 1 + Number(card.indexation);
    return rate;
  }

  function bestLine(card, match, date) {
    const lines = (card.rates || []).filter(match).filter((l) => !l.effective_from || l.effective_from <= date);
    return lines.sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || '')))[0] || null;
  }

  // Returns the hourly and daily charge-out rate with its source.
  function chargeRate({ engagementId, role, personId, date }) {
    const { eng, tiers } = cardsFor(engagementId, date);
    const dayLength = Number(eng?.day_length) || 7.5;
    const levels = ['Engagement', 'Agreement or panel', 'Client', 'Firm standard'];
    const toResult = (card, line, why) => {
      const r = lineRate(card, line, date);
      const hourly = card.unit === 'hour' ? r : r / dayLength;
      return { hourly, daily: hourly * dayLength, unit: card.unit, source: why, card: card.name };
    };
    if (personId) {
      for (let i = 0; i < tiers.length; i++) {
        for (const card of tiers[i]) {
          const line = bestLine(card, (l) => l.person_id === personId, date);
          if (line) return toResult(card, line, `Named person (${levels[i]} rate card)`);
        }
      }
    }
    const grade = role || (personId ? repos.person.get(personId)?.grade : null);
    for (let i = 0; i < tiers.length; i++) {
      for (const card of tiers[i]) {
        const line = bestLine(card, (l) => !l.person_id && l.role === grade, date);
        if (line) return toResult(card, line, `${levels[i]} rate card`);
      }
    }
    return { hourly: 0, daily: 0, unit: 'day', source: 'No rate found', card: null };
  }

  const costCache = new Map(); // personId -> rates sorted newest first
  function costRate(personId, date) {
    if (!costCache.has(personId)) {
      costCache.set(personId, repos.cost_rate.find({ person_id: personId }).sort((a, b) => b.effective_from.localeCompare(a.effective_from)));
    }
    const row = costCache.get(personId).find((r) => r.effective_from <= date);
    return row ? Number(row.rate) : null;
  }
  const clearCache = () => costCache.clear();

  // Average cost rate of active people in a grade, for placeholder roles (RES-008).
  function gradeCost(grade, date) {
    const people = repos.person.find({}).filter((p) => p.grade === grade && p.active !== false);
    const rates = people.map((p) => costRate(p.id, date)).filter((r) => r !== null);
    if (rates.length) return rates.reduce((a, b) => a + b, 0) / rates.length;
    const idx = LISTS.grades.indexOf(grade);
    return [220, 170, 140, 115, 95, 75, 60][idx] ?? 90;
  }

  function personCost(personId, grade, date) {
    return (personId && costRate(personId, date)) ?? gradeCost(grade || repos.person.get(personId)?.grade, date);
  }

  return { chargeRate, costRate, gradeCost, personCost, clearCache };
}
