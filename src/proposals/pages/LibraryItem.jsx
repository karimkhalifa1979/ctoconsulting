import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useP, useCan } from '../lib/store.jsx';
import { runAi } from '../lib/ai.js';
import { Card, PageHead, Empty } from '../../components/ui.jsx';
import { LibStatus, Person, When, Confirm, OutcomePill, download } from '../components/common.jsx';
import { VersionFields, MetaFields, toVersion, fromVersion } from '../components/LibraryForm.jsx';
import { libTypeLabel } from '../core/constants.js';
import { displayStatus, reviewDue, itemHtml, approvedVersion, latestVersion, usageIndex, usageMode, caseStudySummaryLine } from '../core/library.js';
import { diffText } from '../core/diff.js';
import { htmlToText, fmtDate } from '../core/util.js';

const VSTATUS = { draft: ['', 'Draft'], in_review: ['warn', 'In review'], approved: ['good', 'Approved'], superseded: ['', 'Superseded'], rejected: ['bad', 'Rejected'] };

function Compare({ item, a, b }) {
  const ta = htmlToText(itemHtml(item, item.versions.find((x) => x.v === a)));
  const tb = htmlToText(itemHtml(item, item.versions.find((x) => x.v === b)));
  const ops = diffText(ta, tb);
  return (
    <div className="diff-cols">
      <div><div className="eyebrow">v{a}</div><div className="diff">{ops.filter((o) => o.t !== 'ins').map((o, i) => (o.t === 'del' ? <del key={i}>{o.text}</del> : <span key={i}>{o.text}</span>))}</div></div>
      <div><div className="eyebrow">v{b}</div><div className="diff">{ops.filter((o) => o.t !== 'del').map((o, i) => (o.t === 'ins' ? <ins key={i}>{o.text}</ins> : <span key={i}>{o.text}</span>))}</div></div>
    </div>
  );
}

export default function LibraryItem() {
  const { itemId } = useParams();
  const { view, me, dispatch, toast, backend, getFile } = useP();
  const can = useCan();
  const item = view.library.find((i) => i.id === itemId);
  const [edit, setEdit] = useState(null);
  const [meta, setMeta] = useState(null);
  const [cmp, setCmp] = useState([]);
  const [reject, setReject] = useState(false);
  const [retire, setRetire] = useState(false);
  const [mode, setMode] = useState('named');
  const usage = useMemo(() => usageIndex(view.bids).get(itemId), [view.bids, itemId]);
  useEffect(() => { setEdit(null); setMeta(null); setCmp([]); }, [itemId]);
  if (!item) return <Empty title="Item not found">It may have been removed. <Link to="/library">Back to the library</Link></Empty>;

  const owner = item.ownerId === me.id || item.createdBy === me.id;
  const librarian = can('approveLibrary');
  const editable = (owner || librarian || can('configure')) && !item.retired;
  const latest = latestVersion(item);
  const approved = approvedVersion(item);
  const shown = approved || latest;
  const st = displayStatus(item, view.settings);
  const due = reviewDue(item, view.settings);
  const hasAnon = item.confidential && (shown.anonymised?.body || shown.anonymised?.title || item.type === 'case_study');
  const f = shown.fields || {};

  const startEdit = () => setEdit(fromVersion(item, latest));
  const saveEdit = async (submit) => {
    await dispatch('lib.update', { itemId: item.id, version: toVersion(item.type, edit), submit, note: submit ? 'Edited and submitted' : 'Edited' }, { success: submit ? 'Saved and submitted for review' : 'Draft saved' });
    setEdit(null);
  };
  const saveMeta = async () => {
    await dispatch('lib.update', { itemId: item.id, meta }, { success: 'Details saved' });
    setMeta(null);
  };
  const suggest = async () => {
    const r = await runAi('metadata', { view, text: htmlToText(itemHtml(item, shown)) + ' ' + JSON.stringify(f) }, { backend, dispatch });
    const cur = meta || { tags: item.tags || {} };
    const merged = { ...cur, tags: Object.fromEntries(Object.keys(view.taxonomy).map((k) => [k, [...new Set([...(cur.tags?.[k] || []), ...(r.tags?.[k] || [])])]])) };
    setMeta({ ownerId: item.ownerId, reviewDate: item.reviewDate, expiry: item.expiry, confidential: item.confidential, clientId: item.clientId, consent: item.consent, ...merged });
    toast('Suggested tags added from the taxonomy. Confirm and save (CL-02).', 'success');
  };
  const dlFile = async () => { const x = await getFile(shown.fileId || item.fileId); if (x) download(x.bytes, x.name, x.type); else toast('The file is not available in this browser.', 'error'); };

  return (
    <div className="stack">
      <PageHead eyebrow={<><Link to="/library">Content library</Link> · {libTypeLabel(item.type)} · {item.key}</>} title={item.title}
        actions={<div className="row">
          {editable && !edit && <button className="btn" onClick={startEdit}>{['approved', 'superseded'].includes(latest.status) ? 'Start a new version' : 'Edit draft'}</button>}
          {editable && latest.status === 'draft' && !edit && <button className="btn btn-primary" onClick={() => dispatch('lib.submit', { itemId: item.id }, { success: 'Submitted for review' })}>Submit for review</button>}
          {librarian && ['in_review', 'draft'].includes(latest.status) && !edit && <button className="btn btn-primary" onClick={() => dispatch('lib.approve', { itemId: item.id, v: latest.v }, { success: `Approved v${latest.v}` })}>Approve v{latest.v}</button>}
          {librarian && latest.status === 'in_review' && !edit && <button className="btn" onClick={() => setReject(true)}>Send back</button>}
          {librarian && <button className="btn btn-ghost" onClick={() => (item.retired ? dispatch('lib.retire', { itemId: item.id, restore: true }, { success: 'Restored' }) : setRetire(true))}>{item.retired ? 'Restore' : 'Retire'}</button>}
        </div>}>
        <span className="row" style={{ gap: 8 }}><LibStatus status={st} /> Owner <Person id={item.ownerId} /> · {approved ? `v${approved.v} approved` : 'No approved version yet'}{latest.v !== approved?.v ? ` · v${latest.v} ${VSTATUS[latest.status]?.[1].toLowerCase()}` : ''}</span>
      </PageHead>
      {item.retired && <div className="callout">Retired <When at={item.retiredAt} />{item.retiredReason ? `: ${item.retiredReason}` : ''}. Retired content cannot be used in bids or by the AI.</div>}
      {due?.overdue && <div className="callout warn">The review date ({fmtDate(due.date)}) has passed. The owner should review and re-approve this item (CL-05).</div>}
      {latest.reviewNote && latest.status === 'draft' && <div className="callout warn"><strong>Librarian’s note:</strong> {latest.reviewNote}</div>}

      {edit ? (
        <Card title={`Editing v${['approved', 'superseded'].includes(latest.status) ? latest.v + 1 : latest.v} (draft)`} subtitle="Saving creates or updates a draft version. Bids keep using the approved version until the new one is approved (CL-06)."
          actions={<div className="row"><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn" onClick={() => saveEdit(false)}>Save draft</button><button className="btn btn-primary" onClick={() => saveEdit(true)}>Save and submit</button></div>}>
          <VersionFields type={item.type} value={edit} onChange={setEdit} />
        </Card>
      ) : (
        <div className="split-3-2">
          <Card title={`Content · v${shown.v}`} subtitle={shown.approvedBy ? <>Approved by {view.users.find((u) => u.id === shown.approvedBy)?.name} <When at={shown.approvedAt} /></> : null}
            actions={hasAnon ? <div className="row"><button className={`btn btn-sm ${mode === 'named' ? 'btn-navy' : ''}`} onClick={() => setMode('named')}>Named</button><button className={`btn btn-sm ${mode === 'anonymised' ? 'btn-navy' : ''}`} onClick={() => setMode('anonymised')}>Anonymised</button></div> : null}>
            {item.type === 'case_study' && <p className="mini" style={{ marginTop: 0 }}>{caseStudySummaryLine(f)}{f.referee ? ` · Referee: ${f.referee}` : ''}</p>}
            {item.type === 'standard_answer' && shown.variants?.length > 0 && <p className="mini" style={{ marginTop: 0 }}>Also answers: {shown.variants.join(' · ')}</p>}
            {item.type === 'method' && shown.phases?.length > 0 && <p className="mini" style={{ marginTop: 0 }}>Phases: {shown.phases.join(' → ')}</p>}
            {item.type === 'media' && shown.alt && <p className="mini">Alt text: {shown.alt}</p>}
            <div className="doc-preview" style={{ maxHeight: 520 }}><div className="sheet" style={{ padding: 26 }} dangerouslySetInnerHTML={{ __html: itemHtml(item, shown, { mode }) || '<p><em>No text content.</em></p>' }} /></div>
            {(shown.fileId || item.fileId) && <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={dlFile}>Download the original file ({shown.fileName || item.fileName || 'file'})</button>}
          </Card>
          <div className="stack">
            <Card title="Details and tags" actions={editable && !meta ? <div className="row"><button className="btn btn-sm" onClick={suggest}>Suggest tags</button><button className="btn btn-sm" onClick={() => setMeta({ ownerId: item.ownerId, reviewDate: item.reviewDate, expiry: item.expiry, confidential: item.confidential, clientId: item.clientId, consent: item.consent, tags: item.tags || {} })}>Edit</button></div> : meta ? <div className="row"><button className="btn btn-sm" onClick={() => setMeta(null)}>Cancel</button><button className="btn btn-sm btn-primary" onClick={saveMeta}>Save</button></div> : null}>
              {meta ? <MetaFields type={item.type} meta={meta} onChange={setMeta} /> : (
                <dl className="kv">
                  <dt>Review date</dt><dd>{item.reviewDate ? fmtDate(item.reviewDate) : '—'}{due && !due.overdue && due.soon ? ' (due soon)' : ''}</dd>
                  {item.expiry && <><dt>Expiry</dt><dd>{fmtDate(item.expiry)}</dd></>}
                  <dt>Last reviewed</dt><dd>{item.lastReviewed ? fmtDate(item.lastReviewed) : '—'}</dd>
                  <dt>Confidentiality</dt><dd>{item.confidential ? `Confidential to ${view.clients.find((c) => c.id === item.clientId)?.name || 'a client'}; consent to be named: ${item.consent || 'not asked'}` : 'Not confidential'}</dd>
                  {item.confidential && <><dt>Use in other bids</dt><dd>{usageMode(item, null) === 'named' ? 'Named' : usageMode(item, null) === 'anonymised' ? 'Anonymised variant only' : 'Excluded (no anonymised variant)'}</dd></>}
                  {Object.entries(item.tags || {}).filter(([, v]) => v?.length).map(([k, v]) => <Fragment key={k}><dt>{k[0].toUpperCase() + k.slice(1)}</dt><dd>{v.map((x) => <span key={x} className="tag" style={{ marginRight: 4 }}>{x}</span>)}</dd></Fragment>)}
                  {item.nominatedFrom && <><dt>Nominated from</dt><dd><Link to={`/bids/${item.nominatedFrom.bidId}`}>{item.nominatedFrom.ref}</Link>{item.nominatedFrom.outcome ? ` (${item.nominatedFrom.outcome})` : ''}</dd></>}
                  <dt>Source</dt><dd>{item.source || 'manual'}</dd>
                </dl>
              )}
            </Card>
            <Card title="Where it was used" subtitle="Bids that cite this item, and their outcomes (CL-12)" pad={false}>
              {usage?.bids.length ? (
                <>
                  <div style={{ padding: '0 18px 8px' }} className="small">Used in {usage.bids.length} bid{usage.bids.length === 1 ? '' : 's'} · win rate {usage.winRate == null ? '— (none decided)' : `${Math.round(usage.winRate * 100)}% (${usage.won} of ${usage.decided} decided)`}</div>
                  {usage.bids.map((b) => {
                    const vis = view.bids.find((x) => x.id === b.bidId);
                    return <div key={b.bidId} className="work-item" style={{ gridTemplateColumns: '1fr auto' }}><div><div className="t">{vis ? <Link to={`/bids/${b.bidId}/sections/${b.sectionId}`}>{b.ref} {b.title}</Link> : `${b.ref} ${b.title}`}</div><div className="d">Used v{b.v}{approved && b.v < approved.v ? ` · v${approved.v} now approved` : ''}</div></div>{b.outcome ? <OutcomePill outcome={{ result: b.outcome }} /> : <span className="pill">In progress</span>}</div>;
                  })}
                </>
              ) : <p className="muted small" style={{ padding: '0 18px 12px' }}>Not used in a bid yet.</p>}
            </Card>
          </div>
        </div>
      )}

      <Card title="Versions" subtitle="Tick two versions to compare them (CL-06)" pad={false}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th /><th>Version</th><th>Status</th><th>By</th><th>When</th><th>Note</th></tr></thead>
            <tbody>
              {[...item.versions].reverse().map((v) => (
                <tr key={v.v}>
                  <td><input type="checkbox" checked={cmp.includes(v.v)} onChange={(e) => setCmp(e.target.checked ? [...cmp, v.v].slice(-2) : cmp.filter((x) => x !== v.v))} aria-label={`Compare v${v.v}`} /></td>
                  <td className="strong">v{v.v}</td>
                  <td><span className={`pill ${VSTATUS[v.status]?.[0]}`}>{VSTATUS[v.status]?.[1] || v.status}</span></td>
                  <td><Person id={v.by} /></td>
                  <td className="small"><When at={v.at} /></td>
                  <td className="small">{v.note || ''}{v.approvedBy ? ` · approved by ${view.users.find((u) => u.id === v.approvedBy)?.name}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cmp.length === 2 && <div style={{ padding: 14 }}><Compare item={item} a={Math.min(...cmp)} b={Math.max(...cmp)} /></div>}
      </Card>
      {reject && <Confirm title="Send back to the owner?" confirmLabel="Send back" requireText="What needs to change" onClose={() => setReject(false)} onConfirm={(note) => dispatch('lib.reject', { itemId: item.id, note }, { success: 'Sent back to draft' })} />}
      {retire && <Confirm title={`Retire ${item.key}?`} danger confirmLabel="Retire" requireText="Reason" onClose={() => setRetire(false)} onConfirm={(reason) => dispatch('lib.retire', { itemId: item.id, reason }, { success: 'Retired' })}><p>Retired content is removed from search, drafting and bids. Bids that already used it keep their record and are flagged at output checks.</p></Confirm>}
    </div>
  );
}
