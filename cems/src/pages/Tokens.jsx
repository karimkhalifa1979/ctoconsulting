// Token reference (RPT-012..020): every field, collection, helper and condition a template can
// use, with its audience; internal-only tokens are rejected in client templates.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { download } from '../lib/api.js';
import { PageHead, Card, Async, Table, Badge } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

export default function Tokens() {
  const q = useApi('/api/templates/tokens');
  const [s, setS] = useState('');
  const [type, setType] = useState('');
  const [aud, setAud] = useState('');
  return (
    <>
      <PageHead title="Token reference" crumbs={<><Link to="/reports">Reports</Link><span>›</span></>}
        sub="Type tokens into a Word template between double braces. Loops repeat paragraphs or table rows; conditions show content only when data is present."
        actions={<button className="btn btn-sm" onClick={() => download('/api/templates/tokens', { format: 'xlsx' })}><Icon name="download" /> Excel</button>} />
      <Card title="How tokens work">
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li><span className="mono">{'{{engagement.name}}'}</span> inserts a value; formats follow the Firm’s settings (dates, currency, percentages).</li>
          <li><span className="mono">{'{{#each engagement.projects}} … {{/each}}'}</span> repeats for each project; inside, use project tokens such as <span className="mono">{'{{project.name}}'}</span>.</li>
          <li><span className="mono">{'{{#each risks filter="open" sort="rating" limit=5}}'}</span> filters, sorts and limits a collection; put the tags in table cells to repeat rows.</li>
          <li><span className="mono">{'{{#if exception.raised}} … {{else}} … {{/if}}'}</span> shows content conditionally.</li>
          <li><span className="mono">{'{{chart "rag_trend"}}'}</span> inserts a chart image; <span className="mono">{'{{rag status.overall_rag}}'}</span> inserts a coloured rating.</li>
        </ul>
      </Card>
      <div className="filters mb-2 mt-2">
        <input type="search" placeholder="Search tokens and descriptions" value={s} onChange={(e) => setS(e.target.value)} style={{ minWidth: 300 }} />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type" style={{ width: 'auto' }}><option value="">All types</option>{[...new Set((q.data || []).map((r) => r.type))].sort().map((t) => <option key={t}>{t}</option>)}</select>
        <select value={aud} onChange={(e) => setAud(e.target.value)} aria-label="Audience" style={{ width: 'auto' }}><option value="">Any audience</option><option value="client">Client and internal</option><option value="internal">Internal only</option></select>
      </div>
      <Async q={q}>{(rows) => {
        const shown = rows.filter((r) => (!type || r.type === type) && (!aud || r.audience === aud) && (!s || `${r.token} ${r.description}`.toLowerCase().includes(s.toLowerCase())));
        return (
          <Card flush>
            <Table rows={shown.map((r, i) => ({ ...r, id: i }))} columns={[
              { key: 'token', label: 'Token', render: (r) => <span className="mono" style={{ whiteSpace: 'pre' }}>{r.token}</span> },
              { key: 'type', label: 'Type' },
              { key: 'audience', label: 'Audience', render: (r) => (r.audience === 'internal' ? <Badge tone="gold">Internal only</Badge> : <Badge>Client</Badge>) },
              { key: 'description', label: 'Description', render: (r) => <span className="small">{r.description}</span> },
              { key: 'example', label: 'Example', render: (r) => <span className="mono small">{r.example}</span> },
            ]} />
          </Card>
        );
      }}</Async>
    </>
  );
}
