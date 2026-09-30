import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useP } from '../lib/store.jsx';
import { Card, PageHead, Empty } from '../../components/ui.jsx';
import { StagePill, LibStatus, SectionStatus } from '../components/common.jsx';
import { Index, highlight } from '../core/search.js';
import { htmlToText, truncate } from '../core/util.js';
import { itemSearchDoc, displayStatus } from '../core/library.js';
import { libTypeLabel } from '../core/constants.js';

const KINDS = { bid: 'Bids', section: 'Sections', requirement: 'Requirements', library: 'Library', consultant: 'Consultants', clarification: 'Clarifications' };

// Global search across everything the user may see: ethical walls and bid membership are already applied by the view.
export default function Search() {
  const { view } = useP();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [kind, setKind] = useState('');
  const docs = useMemo(() => {
    const out = [];
    for (const b of view.bids) {
      const client = view.clients.find((c) => c.id === b.clientId)?.name || '';
      out.push({ id: `bid:${b.id}`, kind: 'bid', title: `${b.ref} ${b.title}`, text: `${client} ${b.clientRef} ${b.offering} ${b.sector} ${b.notes || ''}`, tags: [client], link: `/bids/${b.id}`, bid: b });
      for (const s of b.sections) out.push({ id: `sec:${s.id}`, kind: 'section', title: s.title, text: htmlToText(s.content || ''), tags: [b.ref], link: `/bids/${b.id}/sections/${s.id}`, bid: b, section: s });
      for (const r of b.requirements) out.push({ id: `req:${b.id}:${r.id}`, kind: 'requirement', title: `${r.ref} ${truncate(r.text, 80)}`, text: r.text, tags: [b.ref, r.category || ''], link: `/bids/${b.id}/requirements`, bid: b });
      for (const c of b.clarifications || []) out.push({ id: `cq:${c.id}`, kind: 'clarification', title: `${c.ref} ${truncate(c.question, 80)}`, text: `${c.question} ${c.answer || ''}`, tags: [b.ref], link: `/bids/${b.id}/clarifications`, bid: b });
    }
    for (const i of view.library.filter((x) => !x.retired)) { const d = itemSearchDoc(i, view.settings); out.push({ ...d, id: `lib:${i.id}`, kind: 'library', title: `${i.key} ${d.title}`, link: `/library/${i.id}`, item: i }); }
    for (const c of view.consultants) out.push({ id: `con:${c.id}`, kind: 'consultant', title: c.name, text: `${c.role} ${c.bio}`, tags: [...(c.skills || []), ...(c.certifications || []), ...(c.sectors || [])], link: `/consultants/${c.id}`, con: c });
    return out;
  }, [view]);
  const index = useMemo(() => new Index(docs), [docs]);
  const results = useMemo(() => (q.trim() ? index.search(q, { limit: 120 }).map((r) => ({ ...r.item, score: r.score, coverage: r.coverage })) : []), [index, q]);
  const shown = results.filter((r) => !kind || r.kind === kind);
  const counts = Object.fromEntries(Object.keys(KINDS).map((k) => [k, results.filter((r) => r.kind === k).length]));
  // A window of the text around the first matching word, with matches highlighted.
  const snippet = (text) => {
    const t = String(text || '');
    const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    const at = Math.min(...words.map((w) => t.toLowerCase().indexOf(w)).filter((i) => i >= 0), t.length);
    const start = at > 90 && at < t.length ? t.lastIndexOf(' ', at - 60) + 1 : 0;
    const win = `${start ? '… ' : ''}${truncate(t.slice(start), 260)}`;
    return highlight(win, q).map((p, i) => (p.hit ? <mark key={i} className="hl">{p.t}</mark> : p.t));
  };
  return (
    <div className="stack">
      <PageHead eyebrow="Work" title="Search">Bids, sections, requirements, clarifications, the library and consultants. Results respect bid membership and ethical walls.</PageHead>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); setParams({ q: new FormData(e.target).get('q') }); }} role="search">
        <input name="q" className="searchbox" style={{ minWidth: 360 }} defaultValue={q} key={q} placeholder="For example: Essential Eight application control" aria-label="Search" autoFocus />
        <button className="btn btn-primary">Search</button>
      </form>
      {q && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button className={`chip ${!kind ? 'on' : ''}`} onClick={() => setKind('')}>All {results.length}</button>
          {Object.entries(KINDS).map(([k, l]) => counts[k] ? <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{l} {counts[k]}</button> : null)}
        </div>
      )}
      {!q ? <Empty title="Search the platform">Type words or a phrase. Search matches meaning as well as keywords, so “reduce cloud costs” also finds FinOps content.</Empty>
        : !shown.length ? <Empty title="No results">Try other words.</Empty> : (
          <Card pad={false}>
            {shown.map((r) => (
              <div key={r.id} className="work-item" style={{ gridTemplateColumns: '110px 1fr auto' }}>
                <span className="pill">{KINDS[r.kind].replace(/s$/, '')}</span>
                <div>
                  <div className="t"><Link to={r.link}>{r.title}</Link></div>
                  <div className="d">{snippet(r.text)}</div>
                  <div className="mini">{r.bid && r.kind !== 'bid' ? `${r.bid.ref} ${r.bid.title}` : r.item ? libTypeLabel(r.item.type) : r.con ? r.con.role : ''}</div>
                </div>
                <div>{r.kind === 'bid' ? <StagePill stage={r.bid.stage} /> : r.kind === 'section' ? <SectionStatus status={r.section.status} /> : r.kind === 'library' ? <LibStatus status={displayStatus(r.item, view.settings)} /> : null}</div>
              </div>
            ))}
          </Card>
        )}
    </div>
  );
}
