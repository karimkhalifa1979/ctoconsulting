// Keyword and semantic-style search over library items, sections, requirements and bids.
// BM25 ranking with light stemming plus a domain synonym map approximates semantic matching
// when no embedding model is configured; "find similar" uses TF-IDF cosine similarity.

const STOP = new Set(('a an and are as at be by for from has have in into is it its of on or that the their this to was were will with we our you your they them us '
  + 'can could should would may might must shall also such any all each other than then there these those which who whom what when where how not no '
  + 'been being do does did about over under more most very per via within across including include includes provide provides provided').split(' '));

// Light suffix stemming, tuned for English proposal text.
export function stem(w) {
  if (w.length <= 4) return w;
  return w
    .replace(/(isation|ization)s?$/, 'ise')
    .replace(/(ational)$/, 'ate')
    .replace(/(ities|ity)$/, '')
    .replace(/(iveness|ives|ive)$/, 'iv')
    .replace(/(ments|ment)$/, '')
    .replace(/(ings|ing)$/, '')
    .replace(/(ied|ies)$/, 'y')
    .replace(/(ed|es)$/, '')
    .replace(/([^s])s$/, '$1')
    .replace(/(ise|ize)$/, 'is');
}

export function tokens(text, { keepStop = false } = {}) {
  return String(text || '').toLowerCase().normalize('NFKD')
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && (keepStop || !STOP.has(t)) && !(t.length === 1 && !/\d/.test(t)))
    .map(stem);
}

// Domain synonyms: each group expands to its members at reduced weight.
const GROUPS = [
  'cloud aws azure gcp hosting migration landing zone iaas paas saas',
  'cyber security securit essential eight e8 ism asd infosec threat vulnerability penetration',
  'data analytics insight reporting warehouse lakehouse bi dashboard',
  'ai artificial intelligence machine learning ml genai model automation',
  'governance assurance compliance risk audit control framework',
  'change adoption training communication stakeholder engagement',
  'agile scrum sprint iterative delivery kanban',
  'digital online portal website customer experience cx ux service design',
  'record information management archive edrms document',
  'architecture enterprise roadmap blueprint target state',
  'procurement vendor supplier sourcing market approach contract',
  'privacy personal information app pia',
  'identity iam access authentication mfa sso entra',
  'network infrastructure datacentre data centre server',
  'program programme project portfolio pmo delivery',
  'erp finance payroll hr sap oracle',
  'crm salesforce dynamics customer relationship',
  'health hospital clinical patient',
  'water utility utilities energy asset',
  'government agency department council public sector commonwealth state local',
  'modernis legacy replace upgrade transform transformation',
  'resilience continuity disaster recovery backup',
  'integration api interface middleware',
];
const SYN = new Map();
for (const g of GROUPS) {
  const words = g.split(' ').map(stem);
  for (const w of words) SYN.set(w, [...new Set([...(SYN.get(w) || []), ...words.filter((x) => x !== w)])]);
}

export function expand(queryTokens) {
  const out = new Map();
  for (const t of queryTokens) out.set(t, Math.max(out.get(t) || 0, 1));
  for (const t of queryTokens) for (const s of SYN.get(t) || []) if (!out.has(s)) out.set(s, 0.45);
  return out;
}

export class Index {
  constructor(docs, { fields = { title: 2.2, text: 1, tags: 1.4 } } = {}) {
    this.docs = [];
    this.df = new Map();
    this.avgLen = 0;
    for (const d of docs) {
      const tf = new Map();
      let len = 0;
      for (const [field, w] of Object.entries(fields)) {
        for (const t of tokens(Array.isArray(d[field]) ? d[field].join(' ') : d[field])) {
          tf.set(t, (tf.get(t) || 0) + w);
          len += 1;
        }
      }
      this.docs.push({ id: d.id, ref: d, tf, len });
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
      this.avgLen += len;
    }
    this.avgLen = this.docs.length ? this.avgLen / this.docs.length : 1;
    this.N = this.docs.length;
  }

  idf(t) {
    const n = this.df.get(t) || 0;
    return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
  }

  search(query, { limit = 20, filter, semantic = true, minScore = 0 } = {}) {
    const q = tokens(query);
    if (!q.length) return [];
    const terms = semantic ? expand(q) : new Map(q.map((t) => [t, 1]));
    const k1 = 1.4, b = 0.72;
    const out = [];
    for (const d of this.docs) {
      if (filter && !filter(d.ref)) continue;
      let score = 0;
      const matched = [];
      for (const [t, w] of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        score += w * this.idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / this.avgLen)));
        if (w === 1) matched.push(t);
      }
      if (score > minScore) out.push({ id: d.id, item: d.ref, score, matched, coverage: matched.length / q.length });
    }
    out.sort((a, b2) => b2.score - a.score);
    return out.slice(0, limit);
  }

  vector(tf) {
    const v = new Map();
    let norm = 0;
    for (const [t, f] of tf) {
      const w = (1 + Math.log(f)) * this.idf(t);
      v.set(t, w);
      norm += w * w;
    }
    return { v, norm: Math.sqrt(norm) || 1 };
  }

  similar(id, { limit = 6, filter } = {}) {
    const base = this.docs.find((d) => d.id === id);
    if (!base) return [];
    const a = this.vector(base.tf);
    const out = [];
    for (const d of this.docs) {
      if (d.id === id || (filter && !filter(d.ref))) continue;
      const bv = this.vector(d.tf);
      let dot = 0;
      for (const [t, w] of a.v) { const w2 = bv.v.get(t); if (w2) dot += w * w2; }
      const score = dot / (a.norm * bv.norm);
      if (score > 0.04) out.push({ id: d.id, item: d.ref, score });
    }
    out.sort((x, y) => y.score - x.score);
    return out.slice(0, limit);
  }
}

// Normalised similarity between two short texts (0..1), used for matching requirements and answers.
export function textSimilarity(a, b) {
  const ta = new Set(tokens(a)), tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.sqrt(ta.size * tb.size);
}

export function highlight(text, query) {
  const q = tokens(query);
  if (!q.length) return [{ t: text }];
  const parts = String(text).split(/(\b)/);
  return parts.map((p) => ({ t: p, hit: q.includes(stem(p.toLowerCase())) }));
}
