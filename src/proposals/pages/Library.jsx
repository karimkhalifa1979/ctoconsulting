import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useP, useCan } from '../lib/store.jsx';
import { runAi } from '../lib/ai.js';
import { ingestFiles } from '../lib/intake.js';
import { Card, PageHead, Modal, Drawer, Empty } from '../../components/ui.jsx';
import { LibStatus, Person, FileDrop, Field, download, MIME } from '../components/common.jsx';
import { VersionFields, MetaFields, toVersion, textToHtml } from '../components/LibraryForm.jsx';
import { LIB_TYPES, LIB_STATUSES, libTypeLabel } from '../core/constants.js';
import { displayStatus, reviewDue, itemSearchDoc, itemHtml, approvedVersion, latestVersion, usageIndex, caseStudySummaryLine } from '../core/library.js';
import { Index } from '../core/search.js';
import { fmtDate, addDays, todayISO } from '../core/util.js';

const MANAGED_ELSEWHERE = { proposal_template: '/templates', presentation_template: '/templates', consultant_profile: '/consultants', rate_card: '/rates' };

function guessType(name, text) {
  if (/case.?stud/i.test(name) || /outcomes?:/i.test(text.slice(0, 400))) return 'case_study';
  if (/iso|certif|insurance|policy|licen|accredit/i.test(name)) return 'evidence';
  if (/method|framework|playbook/i.test(name)) return 'method';
  if (/proposal|response|tender/i.test(name)) return 'past_proposal';
  return 'standard_answer';
}

// Bulk upload (CL-01) with AI-suggested metadata for the librarian to confirm (CL-02).
function BulkImport({ onClose }) {
  const { view, dispatch, putFile, toast, backend, me } = useP();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);
  const onFiles = async (files) => {
    setBusy('Reading files…');
    try {
      const docs = await ingestFiles(files, { putFile, onProgress: setBusy });
      const out = [];
      for (const d of docs) {
        if (d.error) { out.push({ name: d.name, error: d.error }); continue; }
        const text = d.pages.map((p) => p.paras.join('\n\n')).join('\n\n');
        const meta = await runAi('metadata', { view, text }, { backend, dispatch, allowClaude: true }).catch(() => ({ tags: {} }));
        out.push({ name: d.name, include: true, type: guessType(d.name, text), title: d.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), text, tags: meta.tags || {}, fileId: d.fileId, fileName: d.name });
      }
      setRows(out);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const importAll = async () => {
    const items = rows.filter((r) => r.include && !r.error).map((r) => ({
      type: r.type, title: r.title, tags: { sectors: [], offerings: [], technologies: [], capabilities: [], regions: [], ...r.tags }, ownerId: me.id, reviewDate: addDays(todayISO(), 365), fileId: r.fileId, fileName: r.fileName,
      ...(r.type === 'case_study' ? { fields: { summary: r.text.split(/\n\n/)[0]?.slice(0, 600) || '', outcomes: [] }, confidential: true, consent: 'pending' } : { body: textToHtml(r.text.slice(0, 20000)) }),
    }));
    await dispatch('lib.import', { items, source: `bulk upload (${items.length} files)` }, { success: `Imported ${items.length} items as drafts for review` });
    onClose();
  };
  return (
    <Modal title="Bulk import into the library" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>{rows && <button className="btn btn-primary" disabled={!rows.some((r) => r.include && !r.error)} onClick={importAll}>Import {rows.filter((r) => r.include && !r.error).length} as drafts</button>}</>}>
      <div className="modal-wide" />
      {!rows ? (
        <>
          <p className="small">Drop documents or a ZIP of a SharePoint folder export. Each file becomes a draft item. The platform suggests its type and tags from the taxonomy for you to confirm (CL-01, CL-02). Files are virus-scanned first.</p>
          <FileDrop onFiles={onFiles} accept=".pdf,.docx,.pptx,.xlsx,.txt,.md,.zip" busy={busy} label="Drop files or a ZIP here" />
        </>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th /><th>File</th><th>Title</th><th>Type</th><th>Suggested tags</th></tr></thead>
            <tbody>
              {rows.map((r, i) => r.error ? <tr key={i}><td /><td>{r.name}</td><td colSpan={3} className="small" style={{ color: 'var(--st-critical)' }}>{r.error}</td></tr> : (
                <tr key={i}>
                  <td><input type="checkbox" checked={r.include} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} aria-label={`Import ${r.name}`} /></td>
                  <td className="small">{r.name}</td>
                  <td><input value={r.title} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label="Title" /></td>
                  <td><select value={r.type} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} aria-label="Type">{LIB_TYPES.filter((t) => !MANAGED_ELSEWHERE[t.id] && t.id !== 'media').map((t) => <option key={t.id} value={t.id}>{t.one}</option>)}</select></td>
                  <td className="small">{Object.entries(r.tags).flatMap(([k, v]) => v.map((x) => <span key={k + x} className="tag" style={{ marginRight: 4 }}>{x}<button type="button" aria-label={`Remove ${x}`} onClick={() => setRows(rows.map((y, j) => (j === i ? { ...y, tags: { ...y.tags, [k]: y.tags[k].filter((z) => z !== x) } } : y)))}>✕</button></span>)) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function NewItem({ onClose, initialType }) {
  const { dispatch, me } = useP();
  const nav = useNavigate();
  const [type, setType] = useState(initialType || 'standard_answer');
  const [v, setV] = useState({ title: '', body: '', fields: {} });
  const [meta, setMeta] = useState({ ownerId: me.id, reviewDate: addDays(todayISO(), 365), confidential: false, tags: {} });
  const save = async (submit) => {
    const r = await dispatch('lib.create', { item: { type, ...toVersion(type, v), ...meta }, submit }, { success: submit ? 'Created and submitted for review' : 'Draft created' });
    onClose();
    nav(`/library/${r.itemId}`);
  };
  return (
    <Modal title="Add library content" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn" disabled={!v.title?.trim()} onClick={() => save(false)}>Save draft</button><button className="btn btn-primary" disabled={!v.title?.trim()} onClick={() => save(true)}>Submit for review</button></>}>
      <div className="modal-wide" />
      <Field label="Content type"><select value={type} onChange={(e) => setType(e.target.value)}>{LIB_TYPES.filter((t) => !MANAGED_ELSEWHERE[t.id]).map((t) => <option key={t.id} value={t.id}>{t.one}</option>)}</select></Field>
      <VersionFields type={type} value={v} onChange={setV} />
      <h4 style={{ margin: '14px 0 6px' }}>Ownership and tags</h4>
      <MetaFields type={type} meta={meta} onChange={setMeta} />
    </Modal>
  );
}

function Preview({ item, onClose, onSimilar }) {
  const { view } = useP();
  const v = approvedVersion(item) || latestVersion(item);
  const f = v.fields || {};
  return (
    <Drawer title={`${item.key} ${item.title}`} subtitle={`${libTypeLabel(item.type)} · v${v.v}${item.approvedV ? '' : ' (not yet approved)'}`} onClose={onClose}
      actions={<><Link className="btn btn-sm btn-primary" to={`/library/${item.id}`}>Open</Link><button className="btn btn-sm" onClick={() => onSimilar(item)}>Find similar</button></>}>
      <div className="row" style={{ marginBottom: 10 }}><LibStatus status={displayStatus(item, view.settings)} />{item.confidential && <span className="pill warn">Client-confidential{item.consent === 'yes' ? ', consent to name' : ''}</span>}</div>
      {item.type === 'case_study' && <p className="mini">{caseStudySummaryLine(f)}</p>}
      <div className="doc-preview" style={{ maxHeight: 'none' }}><div className="sheet" style={{ padding: 22 }} dangerouslySetInnerHTML={{ __html: itemHtml(item, v) || '<p><em>No text content.</em></p>' }} /></div>
    </Drawer>
  );
}

export default function Library() {
  const { view } = useP();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const type = params.get('type') || '';
  const status = params.get('status') || '';
  const [tag, setTag] = useState('');
  const [owner, setOwner] = useState('');
  const [similar, setSimilar] = useState(null);
  const [preview, setPreview] = useState(null);
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const setParam = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const usage = useMemo(() => usageIndex(view.bids), [view.bids]);
  const docs = useMemo(() => view.library.map((i) => ({ ...itemSearchDoc(i, view.settings), item: i })), [view.library, view.settings]);
  const index = useMemo(() => new Index(docs), [docs]);
  const results = useMemo(() => {
    let base;
    if (similar) base = index.similar(similar.id, { limit: 12 }).map((r) => ({ ...r.item, score: r.score }));
    else if (q.trim()) base = index.search(q, { limit: 200 }).map((r) => ({ ...r.item, score: r.coverage }));
    else base = docs;
    return base.filter((d) => (!type || d.type === type) && (!status || d.status === status) && (!owner || d.item.ownerId === owner) && (!tag || Object.values(d.item.tags || {}).flat().includes(tag)));
  }, [similar, q, index, docs, type, status, owner, tag]);
  const counts = Object.fromEntries(LIB_STATUSES.map((s) => [s.id, docs.filter((d) => d.status === s.id).length]));
  const allTags = [...new Set(view.library.flatMap((i) => Object.values(i.tags || {}).flat()))].sort();
  const exportXlsx = async () => {
    const { tableWorkbook } = await import('../gen/xlsx.js');
    const bytes = await tableWorkbook([{ name: 'Library', rows: results.map((r) => r.item), columns: [
      { key: 'key', label: 'Key', width: 10 }, { key: 'title', label: 'Title', width: 50 }, { key: 'type', label: 'Type', get: (i) => libTypeLabel(i.type) }, { key: 'status', label: 'Status', get: (i) => displayStatus(i, view.settings) },
      { key: 'owner', label: 'Owner', get: (i) => view.users.find((u) => u.id === i.ownerId)?.name || '' }, { key: 'reviewDate', label: 'Review date' }, { key: 'approvedV', label: 'Approved version' },
      { key: 'uses', label: 'Bids used in', get: (i) => usage.get(i.id)?.bids.length || 0 }, { key: 'win', label: 'Win rate', get: (i) => (usage.get(i.id)?.winRate == null ? '' : `${Math.round(usage.get(i.id).winRate * 100)}%`) },
    ] }]);
    download(bytes, 'CTO_content_library.xlsx', MIME.xlsx);
  };

  return (
    <div className="stack">
      <PageHead eyebrow="Content" title="Content library" actions={<div className="row">{can('addLibrary') && <><button className="btn" onClick={() => setBulk(true)}>Bulk import</button><button className="btn btn-primary" onClick={() => setAdding(true)}>Add content</button></>}<button className="btn btn-ghost" onClick={exportXlsx}>Export</button></div>}>
        Approved content is the only content bids and the AI can use. Every item has an owner, a review date and versions (spec section 8).
      </PageHead>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <button className={`chip ${!status ? 'on' : ''}`} onClick={() => setParam('status', '')}>All {docs.length}</button>
        {LIB_STATUSES.map((s) => <button key={s.id} className={`chip ${status === s.id ? 'on' : ''}`} onClick={() => setParam('status', status === s.id ? '' : s.id)}>{s.label} {counts[s.id]}</button>)}
      </div>
      <div className="filters">
        <input className="searchbox" style={{ minWidth: 280 }} placeholder="Search by meaning or keyword, e.g. “reduce cloud costs”" value={q} onChange={(e) => { setQ(e.target.value); setSimilar(null); }} aria-label="Search the library" />
        <select value={type} onChange={(e) => setParam('type', e.target.value)} aria-label="Type"><option value="">All types</option>{LIB_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag"><option value="">All tags</option>{allTags.map((t) => <option key={t}>{t}</option>)}</select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner"><option value="">All owners</option>{[...new Set(view.library.map((i) => i.ownerId))].map((id) => <option key={id} value={id}>{view.users.find((u) => u.id === id)?.name}</option>)}</select>
        {similar && <span className="pill navy">Similar to {similar.key} <button className="linkish" style={{ color: '#fff' }} onClick={() => setSimilar(null)} aria-label="Clear">✕</button></span>}
        <span className="muted small">{results.length} items</span>
      </div>
      {results.length ? (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Key</th><th>Title</th><th>Type</th><th>Status</th><th>Owner</th><th>Review</th><th className="right">Used in</th><th className="right">Win rate</th></tr></thead>
              <tbody>
                {results.map(({ item, status: st, score }) => {
                  const u = usage.get(item.id);
                  const due = reviewDue(item, view.settings);
                  return (
                    <tr key={item.id}>
                      <td className="tabular small">{item.key}</td>
                      <td><button className="linkish strong" style={{ textAlign: 'left' }} onClick={() => setPreview(item)}>{item.title}</button>{item.confidential && <span className="pill warn" style={{ marginLeft: 6 }}>{item.consent === 'yes' ? 'Named with consent' : 'Confidential'}</span>}{score && (q || similar) ? <div className="mini">{similar ? 'similarity' : 'terms matched'} {Math.round(Math.min(1, score) * 100)}%</div> : null}</td>
                      <td className="small">{libTypeLabel(item.type)}</td>
                      <td><LibStatus status={st} /></td>
                      <td><Person id={item.ownerId} /></td>
                      <td className="small" style={due?.overdue ? { color: 'var(--st-critical)', fontWeight: 600 } : undefined}>{due ? fmtDate(due.date) : '—'}</td>
                      <td className="right tabular">{u?.bids.length || 0}</td>
                      <td className="right tabular">{u?.winRate == null ? '—' : `${Math.round(u.winRate * 100)}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : <Empty title="Nothing matches">Try other words or clear the filters.</Empty>}
      {preview && <Preview item={preview} onClose={() => setPreview(null)} onSimilar={(i) => { setSimilar(i); setQ(''); setPreview(null); }} />}
      {adding && <NewItem onClose={() => setAdding(false)} initialType={type && !MANAGED_ELSEWHERE[type] ? type : undefined} />}
      {bulk && <BulkImport onClose={() => setBulk(false)} />}
    </div>
  );
}
