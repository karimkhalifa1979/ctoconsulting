import { useMemo, useState } from 'react';
import FolderTree from '../components/FolderTree.jsx';
import { buildTree, inFolder } from '../lib/tree.js';
import { extOf, isSelected, missingEntries } from '../lib/selections.js';
import { TYPE_GROUPS, fmtAgo, fmtDate, fmtSize, typeGroup } from '../lib/format.js';

const PAGE = 100;
const SHOW = [['all', 'All'], ['selected', 'Selected'], ['unselected', 'Not selected']];

export default function Library({ list, scan, saved, pending, onToggle, onRescan }) {
  const [folder, setFolder] = useState('');
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState(new Set());
  const [show, setShow] = useState('all');
  const [sort, setSort] = useState({ by: 'name', dir: 1 });
  const [page, setPage] = useState(0);

  const files = useMemo(() => (scan?.files || []).map((f) => ({ ...f, ext: extOf(f.name) })), [scan?.files]);
  const sel = (id) => isSelected(saved, pending, id);
  const missing = useMemo(() => missingEntries(saved, files), [saved, files]);
  const tree = useMemo(() => buildTree(files, (id) => isSelected(saved, pending, id)), [files, saved, pending]);
  const selectedCount = files.filter((f) => sel(f.id)).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = show === 'selected' && scan?.files ? [...files, ...missing.filter((m) => sel(m.id))] : files;
    const out = pool.filter((f) => {
      if (!inFolder(f, folder)) return false;
      if (types.size && !types.has(typeGroup(f.ext))) return false;
      if (show === 'selected' && !sel(f.id)) return false;
      if (show === 'unselected' && sel(f.id)) return false;
      if (q && !`${f.name} ${f.path}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const key = { name: (f) => f.name.toLowerCase(), folder: (f) => f.path.toLowerCase(), modified: (f) => f.modified || '', size: (f) => f.size ?? -1 }[sort.by];
    return out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * sort.dir);
  }, [files, missing, folder, types, show, query, sort, saved, pending, scan?.files]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE, current * PAGE + PAGE);
  const shownSelected = rows.filter((f) => sel(f.id)).length;
  const reset = (fn) => (...a) => { fn(...a); setPage(0); };

  const sortBy = (by) => setSort((s) => ({ by, dir: s.by === by ? -s.dir : by === 'modified' ? -1 : 1 }));
  const th = (by, label) => (
    <th aria-sort={sort.by === by ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button className="th-sort" onClick={() => sortBy(by)}>{label}{sort.by === by ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</button>
    </th>
  );

  const loading = scan?.loading;
  const p = scan?.progress;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{list.eyebrow}</div>
          <h1>{list.title}</h1>
          <p>{list.intro}</p>
        </div>
        <div className="head-side">
          <div className="stat-inline"><span className="tabular">{selectedCount}</span> of <span className="tabular">{files.length}</span> {list.selectLabel === 'Active' ? 'active' : 'selected'}</div>
          <div className="row small muted">
            <span>{loading ? (p ? `Scanning… ${p.folders} folders, ${p.files} files` : 'Loading…') : `Indexed ${fmtAgo(scan?.scannedAt)}`}</span>
            <button className="btn btn-sm" onClick={onRescan} disabled={loading} title={`Re-read /${list.folder} from SharePoint`}>Rescan folder</button>
          </div>
        </div>
      </div>

      {scan?.error && <div className="alert alert-error">Could not read <b>/{list.folder}</b>: {scan.error}</div>}
      {missing.length > 0 && !loading && (
        <div className="alert alert-warn">
          {missing.length} saved {missing.length === 1 ? 'file is' : 'files are'} no longer in this folder (deleted or moved).{' '}
          <button className="link-btn dark" onClick={() => { setShow('selected'); setFolder(''); setPage(0); }}>Review</button>
        </div>
      )}

      <div className="workspace">
        <aside className="card tree-card">
          <div className="card-head"><h3>Folders</h3></div>
          <div className="tree-scroll">
            {files.length ? <FolderTree root={tree} rootLabel={list.rootLabel} value={folder} onChange={reset(setFolder)} /> : <p className="muted small pad">{loading ? 'Reading folders…' : 'No files found.'}</p>}
          </div>
        </aside>

        <section className="card files-card">
          <div className="filters">
            <input type="search" placeholder="Search file or folder names" value={query} onChange={(e) => reset(setQuery)(e.target.value)} aria-label="Search files" />
            <div className="seg" role="group" aria-label="Show">
              {SHOW.map(([id, label]) => (
                <button key={id} className={show === id ? 'on' : ''} aria-pressed={show === id} onClick={() => reset(setShow)(id)}>
                  {id === 'selected' && list.selectLabel === 'Active' ? 'Active' : id === 'unselected' && list.selectLabel === 'Active' ? 'Inactive' : label}
                </button>
              ))}
            </div>
            <div className="chips" role="group" aria-label="File type">
              {[...TYPE_GROUPS, { id: 'other', label: 'Other' }].map((g) => {
                const on = types.has(g.id);
                return (
                  <button key={g.id} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => reset(setTypes)((t) => { const n = new Set(t); if (on) n.delete(g.id); else n.add(g.id); return n; })}>{g.label}</button>
                );
              })}
            </div>
          </div>

          <div className="bulk">
            <span className="muted small">
              {folder ? <><b>/{folder}</b> · </> : null}{rows.length} file{rows.length === 1 ? '' : 's'} shown · {shownSelected} {list.selectLabel === 'Active' ? 'active' : 'selected'}
            </span>
            <div className="btn-row">
              <button className="btn btn-sm" disabled={!rows.length || shownSelected === rows.length} onClick={() => onToggle(rows, true)}>
                {list.selectLabel === 'Active' ? 'Mark all shown active' : 'Select all shown'}
              </button>
              <button className="btn btn-sm" disabled={!shownSelected} onClick={() => onToggle(rows.filter((f) => sel(f.id)), false)}>
                {list.selectLabel === 'Active' ? 'Mark all shown inactive' : 'Clear all shown'}
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="col-check"><span className="sr-only">{list.selectLabel}</span></th>
                  {th('name', 'Name')}
                  {th('folder', 'Folder')}
                  {th('modified', 'Modified')}
                  {th('size', 'Size')}
                </tr>
              </thead>
              <tbody>
                {visible.map((f) => {
                  const on = sel(f.id);
                  const changed = pending.has(f.id) && Boolean(pending.get(f.id)) !== Boolean(saved[f.id]);
                  return (
                    <tr key={f.id} className={on ? 'selected' : ''}>
                      <td className="col-check">
                        <input type="checkbox" checked={on} onChange={(e) => onToggle([f], e.target.checked)} aria-label={`${list.selectLabel}: ${f.name}`} />
                      </td>
                      <td>
                        <div className="file-name">
                          <span className={`ext ext-${typeGroup(f.ext)}`}>{f.ext || '—'}</span>
                          {f.webUrl && f.webUrl !== '#' ? <a href={f.webUrl} target="_blank" rel="noreferrer">{f.name}</a> : <span>{f.name}</span>}
                          {changed && <span className="badge badge-gold">unsaved</span>}
                          {f.missing && <span className="badge badge-red">not in folder</span>}
                        </div>
                      </td>
                      <td className="muted small folder-cell">{f.path || <i>(top level)</i>}</td>
                      <td className="nowrap small" title={f.modifiedBy ? `by ${f.modifiedBy}` : undefined}>{fmtDate(f.modified)}</td>
                      <td className="nowrap small tabular">{fmtSize(f.size)}</td>
                    </tr>
                  );
                })}
                {!visible.length && (
                  <tr><td colSpan={5} className="empty">{loading && !files.length ? 'Reading the folder from SharePoint…' : 'No files match these filters.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="pager">
              <span>{current * PAGE + 1}–{Math.min(rows.length, (current + 1) * PAGE)} of {rows.length}</span>
              <div className="btn-row">
                <button className="btn btn-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
                <button className="btn btn-sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
