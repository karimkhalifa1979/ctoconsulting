// Firm knowledge base of published lessons (LSN-003..005): searchable across engagements with
// client-confidential details removed; restricted engagements are not named.
import { useState } from 'react';
import { useApi, useDebounced } from '../lib/hooks.js';
import { PageHead, Card, Async, Empty, Badge, D } from '../components/ui.jsx';

export default function Knowledge() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const search = useDebounced(q, 300);
  const list = useApi('/api/knowledge/lessons', { q: search });
  return (
    <>
      <PageHead title="Knowledge base" sub="Lessons published from every engagement. Summaries are reviewed to remove client-confidential detail before publication (LSN-003)." />
      <div className="filters mb-2">
        <input type="search" placeholder="Search lessons, tags and summaries" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 320 }} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" style={{ width: 'auto' }}>
          <option value="">All categories</option>
          {[...new Set((list.data || []).map((l) => l.category).filter(Boolean))].sort().map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <Async q={list}>{(rows) => {
        const shown = rows.filter((l) => !cat || l.category === cat);
        return !shown.length ? <Card><Empty>No published lessons match.</Empty></Card> : (
          <div className="grid g-2">
            {shown.map((l) => (
              <Card key={l.id} title={l.title} sub={<>{l.category}{l.sector ? ` · ${l.sector}` : ''}{l.engagement_type ? ` · ${l.engagement_type}` : ''} · <D v={l.date} /></>}>
                <p className="pre">{l.summary}</p>
                <div className="chips mt-1">{(l.tags || []).map((t) => <Badge key={t} tone="teal">{t}</Badge>)}</div>
                <div className="tiny muted mt-2">Source: {l.source}</div>
              </Card>
            ))}
          </div>
        );
      }}</Async>
    </>
  );
}
