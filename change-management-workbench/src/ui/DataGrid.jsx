// Register grid (USE-05): search, facet filters, sorting, column choice, multi-select with bulk edit,
// CSV and Excel export, and saved views that can be shared with others.
import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { AdkarTags, StatusBadge, Popover, Empty } from './core.jsx';
import { FieldControl, selectOptions } from './fields.jsx';
import { fieldsOf, listLabel } from '../../shared/schema.js';
import { asArray, stripHtml, personName } from '../../shared/util.js';
import { fmtDate, fmtDateTime, fmtNum, fmtMoney } from '../lib/format.js';
import { useApp, useDialog, useToast } from '../state/app.jsx';
import { useMutator } from '../state/initiative.jsx';
import { exportTable } from '../lib/export.js';

const STATUS_KEYS = new Set(['status', 'commsStatus', 'confirmationStatus', 'state', 'decision', 'result']);

// Default columns for a record type from the schema's grid fields.
export function schemaColumns(type, { config, lookups, model, include, exclude = [] } = {}) {
  let fields = fieldsOf(type, config).filter((f) => f.grid && !exclude.includes(f.key));
  if (include) fields = include.map((k) => fieldsOf(type, config).find((f) => f.key === k)).filter(Boolean);
  return fields.map((f) => fieldColumn(f, { config, lookups, model }));
}

export function fieldColumn(f, { config, lookups, model } = {}) {
  const opts = ['select', 'multi'].includes(f.type) ? selectOptions(f, { config, model }) : null;
  const optLabel = (v) => opts?.find((o) => o.id === v)?.label ?? (f.list ? listLabel(f.list, v, config) : v);
  const text = (r) => {
    const v = r[f.key];
    if (v == null || v === '') return '';
    switch (f.type) {
      case 'select': return optLabel(v);
      case 'multi': return asArray(v).map(optLabel).join(', ');
      case 'ref': return lookups?.nameOf(f.ref, v) || '';
      case 'refs': return asArray(v).map((x) => lookups?.nameOf(f.ref, x)).filter(Boolean).join(', ');
      case 'user': return lookups?.nameOf('user', v) || '';
      case 'users': return asArray(v).map((x) => lookups?.nameOf('user', x)).filter(Boolean).join(', ');
      case 'date': return v;
      case 'datetime': return v;
      case 'bool': return v ? 'Yes' : 'No';
      case 'adkar': return asArray(v).join(', ');
      case 'richtext': case 'textarea': return stripHtml(v);
      default: return String(v);
    }
  };
  const render = (r) => {
    const v = r[f.key];
    if (r._redacted?.includes(f.key)) return <span className="muted" title="Restricted"><Icon name="lock" size={13} /></span>;
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return <span className="muted">—</span>;
    switch (f.type) {
      case 'select': return STATUS_KEYS.has(f.key) ? <StatusBadge status={v} labelText={optLabel(v)} /> : optLabel(v);
      case 'date': return <span className="nowrap">{fmtDate(v)}</span>;
      case 'datetime': return <span className="nowrap">{fmtDateTime(v, config?.settings?.timeZone)}</span>;
      case 'adkar': return <AdkarTags value={v} />;
      case 'bool': return v ? <Icon name="check" size={15} label="Yes" /> : '';
      case 'int': case 'number': return fmtNum(v, 2);
      case 'money': return fmtMoney(v);
      case 'textarea': case 'richtext': { const t = stripHtml(v); return <span title={t.length > 140 ? t : undefined}>{t.length > 140 ? `${t.slice(0, 139)}…` : t}</span>; }
      default: return text(r);
    }
  };
  const num = ['int', 'number', 'money'].includes(f.type);
  return { key: f.key, label: f.label, render, value: (r) => (num ? (r[f.key] == null ? null : Number(r[f.key])) : text(r)), align: num ? 'num' : undefined, wrap: ['textarea', 'richtext'].includes(f.type), field: f, facet: ['select'].includes(f.type) ? optLabel : null };
}

function cmp(a, b) {
  if (a == null && b == null) return 0;
  if (a == null || a === '') return 1;
  if (b == null || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en-AU', { numeric: true, sensitivity: 'base' });
}

export default function DataGrid({
  id, type, rows = [], columns, onRowClick, selectable = false, bulkFields = [], bulkActions = [], facets = [], searchKeys,
  defaultSort, pageSize = 50, exportName, toolbar, empty, title, savedViews = true, rowClass, initialFacets = {}, compact = false, onChanged,
}) {
  const { api, user, config } = useApp();
  const toast = useToast();
  const dialog = useDialog();
  const mut = useMutator();
  const gridId = id || type || 'grid';
  const storeKey = `cmw.grid.${gridId}`;
  const stored = useMemo(() => { try { return JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch { return {}; } }, [storeKey]);
  const [q, setQ] = useState('');
  const [facetVals, setFacetVals] = useState(initialFacets);
  const [sort, setSort] = useState(stored.sort || defaultSort || null);
  const [hidden, setHidden] = useState(() => new Set(stored.hidden ?? columns.filter((c) => c.hidden).map((c) => c.key)));
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(0);
  const [views, setViews] = useState([]);

  useEffect(() => { try { localStorage.setItem(storeKey, JSON.stringify({ sort, hidden: [...hidden] })); } catch { /* storage unavailable */ } }, [storeKey, sort, hidden]);
  useEffect(() => { setPage(0); }, [q, facetVals]);
  useEffect(() => {
    if (!savedViews) return;
    api.list('savedView', {}).then((r) => setViews(r.rows.filter((v) => v.entityType === gridId && (v.userId === user.id || v.shared)))).catch(() => {});
  }, [api, gridId, savedViews, user.id]);

  const visibleCols = columns.filter((c) => !hidden.has(c.key));
  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      for (const f of facets) {
        const want = facetVals[f.key];
        if (want == null || want === '') continue;
        const got = f.value(r);
        if (Array.isArray(got) ? !got.includes(want) : String(got ?? '') !== String(want)) return false;
      }
      if (!words.length) return true;
      const hay = (searchKeys ? searchKeys.map((k) => (typeof k === 'function' ? k(r) : r[k])) : [r.code, ...columns.map((c) => (c.value ? c.value(r) : r[c.key]))]).map((x) => stripHtml(String(x ?? ''))).join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, q, facetVals, facets, columns, searchKeys]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const val = col.value || ((r) => r[col.key]);
    const out = [...filtered].sort((a, b) => cmp(val(a), val(b)));
    return sort.dir === 'desc' ? out.reverse() : out;
  }, [filtered, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const shown = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.id));

  const toggleSort = (key) => setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));
  const exportRows = (fmt) => {
    const cols = visibleCols.filter((c) => c.key !== '_actions' && !c.key.startsWith('_'));
    const data = sorted.map((r) => Object.fromEntries(cols.map((c) => [c.label, c.exportValue ? c.exportValue(r) : c.value ? c.value(r) : r[c.key]])));
    exportTable(data, cols.map((c) => c.label), { name: exportName || title || gridId, format: fmt, sheet: title }).catch(toast.error);
  };

  const bulkEdit = async (fd) => {
    let value = null;
    const ok = await dialog.custom((close) => <BulkEditDialog fd={fd} count={selected.size} config={config} onDone={(v) => { value = v; close(true); }} onCancel={() => close(false)} />);
    if (!ok) return;
    const res = await mut.bulk(type, [...selected], { [fd.key]: value });
    const failed = asArray(res).filter((x) => !x.ok);
    if (failed.length) toast.warn(`${asArray(res).length - failed.length} updated; ${failed.length} could not be changed: ${failed[0].error}`);
    else toast.success(`${asArray(res).length} records updated`);
    setSelected(new Set());
    onChanged?.();
  };

  const saveView = async () => {
    const name = await dialog.prompt({ title: 'Save this view', label: 'View name', multiline: false });
    if (!name) return;
    const shared = await dialog.confirm({ title: 'Share the view?', message: 'Shared views are visible to everyone who can see this register.', confirmLabel: 'Share', cancelLabel: 'Keep private' });
    const v = await mut.create('savedView', { name, entityType: gridId, userId: user.id, shared, state: { q, facets: facetVals, sort, hidden: [...hidden] } });
    setViews((vs) => [...vs, v]);
    toast.success(`View “${name}” saved`);
  };
  const applyView = (v) => {
    const s = v.state || {};
    setQ(s.q || '');
    setFacetVals(s.facets || {});
    setSort(s.sort || null);
    setHidden(new Set(s.hidden || []));
  };

  return (
    <div className="card" aria-label={title}>
      <div className="grid-toolbar">
        <input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${title || 'records'}`} style={{ minWidth: 200, flex: '0 1 300px' }} />
        {facets.map((f) => (
          <select key={f.key} aria-label={f.label} value={facetVals[f.key] ?? ''} onChange={(e) => setFacetVals((v) => ({ ...v, [f.key]: e.target.value || null }))}>
            <option value="">{f.label}: all</option>
            {f.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        ))}
        <span className="grow" />
        <span className="small muted">{sorted.length === rows.length ? `${rows.length} ${rows.length === 1 ? 'record' : 'records'}` : `${sorted.length} of ${rows.length}`}</span>
        {toolbar}
        {savedViews && (
          <Popover button={({ toggle }) => <button type="button" className="btn btn-sm" onClick={toggle} aria-haspopup="menu"><Icon name="filter" />Views</button>}>
            <div className="menu-head">Saved views</div>
            {views.map((v) => <button key={v.id} type="button" data-close onClick={() => applyView(v)}><Icon name={v.shared ? 'users' : 'user'} />{v.name}</button>)}
            {!views.length && <div className="menu-head">None yet</div>}
            <hr />
            <button type="button" data-close onClick={saveView}><Icon name="plus" />Save current view…</button>
            <button type="button" data-close onClick={() => { setQ(''); setFacetVals({}); setSort(defaultSort || null); setHidden(new Set(columns.filter((c) => c.hidden).map((c) => c.key))); }}><Icon name="refresh" />Reset</button>
          </Popover>
        )}
        <Popover button={({ toggle }) => <button type="button" className="btn btn-sm" onClick={toggle} aria-haspopup="menu" aria-label="Choose columns"><Icon name="columns" /></button>}>
          <div className="menu-head">Columns</div>
          {columns.map((c) => (
            <label key={c.key} className="check" style={{ padding: '4px 10px', display: 'flex' }}>
              <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => setHidden((h) => { const n = new Set(h); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n; })} />
              <span>{c.label || c.key}</span>
            </label>
          ))}
        </Popover>
        <Popover button={({ toggle }) => <button type="button" className="btn btn-sm" onClick={toggle} aria-haspopup="menu"><Icon name="download" />Export</button>}>
          <button type="button" data-close onClick={() => exportRows('xlsx')}><Icon name="file" />Excel (.xlsx)</button>
          <button type="button" data-close onClick={() => exportRows('csv')}><Icon name="file" />CSV</button>
        </Popover>
      </div>
      {selectable && selected.size > 0 && (
        <div className="bulk-bar" role="region" aria-label="Bulk actions">
          <strong>{selected.size} selected</strong>
          {bulkFields.map((k) => {
            const fd = fieldsOf(type, config).find((f) => f.key === k);
            return fd ? <button key={k} type="button" className="btn btn-sm" onClick={() => bulkEdit(fd)}>Set {fd.label.toLowerCase()}</button> : null;
          })}
          {bulkActions.map((a) => <button key={a.label} type="button" className={`btn btn-sm ${a.danger ? 'btn-danger' : ''}`} onClick={async () => { await a.run([...selected], sorted.filter((r) => selected.has(r.id))); setSelected(new Set()); onChanged?.(); }}>{a.label}</button>)}
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
      {sorted.length === 0 ? (empty || <Empty icon="search" title={rows.length ? 'No records match' : 'Nothing here yet'} />) : (
        <div className="table-wrap" style={{ maxHeight: compact ? 420 : 'none' }}>
          <table className={`tbl grid-table ${compact ? 'tbl-compact' : ''}`}>
            <thead>
              <tr>
                {selectable && <th className="cb"><input type="checkbox" aria-label="Select all on this page" checked={allShownSelected} onChange={() => setSelected((s) => { const n = new Set(s); if (allShownSelected) shown.forEach((r) => n.delete(r.id)); else shown.forEach((r) => n.add(r.id)); return n; })} /></th>}
                {visibleCols.map((c) => (
                  <th key={c.key} className={c.align || ''} style={c.width ? { width: c.width } : undefined} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sortable === false ? c.label : (
                      <button type="button" className="sort" onClick={() => toggleSort(c.key)}>
                        {c.label}{sort?.key === c.key && <Icon name={sort.dir === 'asc' ? 'chevronDown' : 'chevronDown'} size={12} style={{ transform: sort.dir === 'asc' ? 'rotate(180deg)' : undefined }} />}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={`${onRowClick ? 'clickable' : ''} ${selected.has(r.id) ? 'selected' : ''} ${rowClass?.(r) || ''}`}
                  onClick={(e) => { if (onRowClick && !e.target.closest('button, a, input, select, label')) onRowClick(r); }}
                  onKeyDown={(e) => { if (onRowClick && e.key === 'Enter' && e.target === e.currentTarget) onRowClick(r); }} tabIndex={onRowClick ? 0 : undefined}>
                  {selectable && <td className="cb"><input type="checkbox" aria-label={`Select ${r.code || r.id}`} checked={selected.has(r.id)} onChange={() => setSelected((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} /></td>}
                  {visibleCols.map((c) => <td key={c.key} className={`${c.align || ''} ${c.wrap ? 'wrap' : ''}`}>{c.render ? c.render(r) : String(r[c.key] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="pager">
          <span>Page {page + 1} of {pages}</span>
          <button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><Icon name="chevronLeft" /></button>
          <button type="button" className="btn btn-sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><Icon name="chevronRight" /></button>
        </div>
      )}
    </div>
  );
}

function BulkEditDialog({ fd, count, config, onDone, onCancel }) {
  const [v, setV] = useState(fd.type === 'bool' ? false : null);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onDone(v); }}>
      <div className="modal-head"><h2>Set {fd.label.toLowerCase()} for {count} records</h2></div>
      <div className="modal-body">
        <label className="field"><span>{fd.label}</span><FieldControl fd={fd} value={v} onChange={setV} config={config} /></label>
        <p className="small muted mt-2">Each record is updated and audited individually. Records you cannot change are skipped and reported.</p>
      </div>
      <div className="modal-foot"><button type="button" className="btn" onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-primary">Apply</button></div>
    </form>
  );
}

// Facet options for a select field present in the rows.
export function facetFor(fd, rows, { config, model } = {}) {
  const opts = selectOptions(fd, { config, model });
  const present = new Set(rows.map((r) => r[fd.key]).filter((v) => v != null && v !== ''));
  return { key: fd.key, label: fd.label, options: opts.filter((o) => present.has(o.id)), value: (r) => r[fd.key] };
}

export const nameCol = (key, label, lookups, ref = 'stakeholder') => ({ key, label, render: (r) => lookups.nameOf(ref, r[key]) || <span className="muted">—</span>, value: (r) => lookups.nameOf(ref, r[key]) });
export const personCol = (key, label, get) => ({ key, label, render: (r) => { const s = get(r); return s ? personName(s) : <span className="muted">—</span>; }, value: (r) => (get(r) ? personName(get(r)) : '') });
