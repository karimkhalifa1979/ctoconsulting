// Editable register grid used for every workbook-style tab: inline editing, calculated
// columns, sorting, filtering, totals, a detail drawer, CSV export and paste from Excel.
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Badge, Drawer, Modal, includesAll, downloadBlob, safeFile } from './ui.jsx';
import { fmtMoney, fmtNum, fmtPct, fmtDate, isNum } from '../lib/format.js';
import { nextId } from '../lib/model.js';

const EDITABLE = new Set(['text', 'long', 'number', 'money', 'percent', 'date', 'select', 'score', 'yesno']);
const optionsOf = (c, ctx) => (typeof c.options === 'function' ? c.options(ctx) : c.options) || [];

export function displayValue(c, row, ctx) {
  const v = c.calc ? c.calc(row, ctx) : row[c.key];
  if (c.fmt) return c.fmt(v, row, ctx);
  if (v === null || v === undefined || v === '') return '';
  switch (c.type) {
    case 'money': return fmtMoney(v);
    case 'percent': return fmtPct(v, c.dp ?? 0);
    case 'date': return fmtDate(v);
    case 'number': return fmtNum(v, c.dp ?? 0);
    default:
      if (typeof v === 'number') return fmtNum(v, c.dp ?? (Number.isInteger(v) ? 0 : 1));
      return String(v);
  }
}

function plainValue(c, row, ctx) {
  const v = c.calc ? c.calc(row, ctx) : row[c.key];
  if (c.csv) return c.csv(v, row, ctx);
  if (v === null || v === undefined) return '';
  if (c.type === 'percent' && isNum(v)) return (Number(v) * 100).toFixed(1) + '%';
  if (typeof v === 'number' && !Number.isInteger(v)) return v.toFixed(2);
  return String(v);
}

function CellEditor({ c, value, onChange, ctx, inForm }) {
  const set = (v) => onChange(c.key, v);
  switch (c.type) {
    case 'long':
      return <textarea value={value ?? ''} rows={inForm ? 3 : 1} placeholder={c.placeholder} onChange={(e) => set(e.target.value)} />;
    case 'number':
    case 'money':
      return <input type="number" value={value ?? ''} min={c.min} max={c.max} step={c.step ?? 'any'} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} />;
    case 'percent':
      return <input type="number" value={isNum(value) ? +(Number(value) * 100).toFixed(4) : ''} step="any" onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value) / 100)} />;
    case 'date':
      return <input type="date" value={value ?? ''} onChange={(e) => set(e.target.value)} />;
    case 'select':
    case 'yesno':
    case 'score': {
      const opts = c.type === 'yesno' ? ['Yes', 'No'] : c.type === 'score' ? (c.options ? optionsOf(c, ctx) : [1, 2, 3, 4, 5]) : optionsOf(c, ctx);
      return (
        <select value={value ?? ''} onChange={(e) => {
          const raw = e.target.value;
          set(c.type === 'score' && raw !== '' && raw !== 'N/A' ? Number(raw) : raw);
        }}>
          <option value="" />
          {opts.map((o) => (typeof o === 'object' ? <option key={o.value} value={o.value}>{o.label}</option> : <option key={o} value={o}>{o}</option>))}
          {value !== '' && value !== undefined && value !== null && !opts.some((o) => String(typeof o === 'object' ? o.value : o) === String(value)) && <option value={value}>{value}</option>}
        </select>
      );
    }
    default:
      return <input type="text" value={value ?? ''} placeholder={c.placeholder} onChange={(e) => set(e.target.value)} />;
  }
}

function CalcCell({ c, row, ctx }) {
  const v = c.calc ? c.calc(row, ctx) : row[c.key];
  const text = displayValue(c, row, ctx);
  if (c.badge && v) return <Badge v={v} kind={typeof c.badge === 'string' ? c.badge : undefined}>{text}</Badge>;
  return text;
}

const Row = memo(function Row({ row, index, columns, ctx, onCell, onOpen, onDuplicate, onDelete, idKey }) {
  const change = useCallback((key, v) => onCell(index, key, v), [index, onCell]);
  return (
    <tr>
      <td className="sticky idcell">{row[idKey]}</td>
      {columns.map((c) => {
        const calc = !!c.calc || c.readOnly || !EDITABLE.has(c.type || 'text');
        return (
          <td key={c.key} className={`${calc ? 'calc' : ''} ${c.group === 'target' ? 'target' : ''}`} style={{ minWidth: c.width || 110, maxWidth: c.maxWidth }}>
            {calc ? <CalcCell c={c} row={row} ctx={ctx} /> : <CellEditor c={c} value={row[c.key]} onChange={change} ctx={ctx} />}
          </td>
        );
      })}
      <td className="rowtools">
        <button className="icon-btn" title="Open details" onClick={() => onOpen(index)}>⤢</button>
        {onDuplicate && <button className="icon-btn" title="Duplicate" onClick={() => onDuplicate(index)}>⧉</button>}
        {onDelete && <button className="icon-btn danger" title="Delete" onClick={() => onDelete(index)}>✕</button>}
      </td>
    </tr>
  );
});

function parseTsv(text) {
  return text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '').map((l) => l.split('\t'));
}

export default function DataGrid({
  rows, onChange, columns, ctx, idKey = 'id', idPrefix, idWidth = 3, newRow, titleKey, entity = 'row',
  filters = [], exportName, example, emptyText, canAdd = true, canDelete = true, maxHeight, toolbar, onAdded,
}) {
  const [q, setQ] = useState('');
  const [f, setF] = useState({});
  const [sort, setSort] = useState(null);
  const [openIdx, setOpenIdx] = useState(null);
  const [showExample, setShowExample] = useState(false);
  const [paste, setPaste] = useState(null);
  const latest = useRef({ rows, onChange });
  latest.current = { rows, onChange };

  const gridCols = columns.filter((c) => !c.hide);

  const onCell = useCallback((i, key, v) => {
    const { rows: rs, onChange: oc } = latest.current;
    const next = rs.slice();
    next[i] = { ...next[i], [key]: v };
    oc(next);
  }, []);
  const onDelete = useCallback((i) => {
    const { rows: rs, onChange: oc } = latest.current;
    const r = rs[i];
    if (!window.confirm(`Delete ${entity} ${r[idKey] || ''}${titleKey && r[titleKey] ? ` — ${String(r[titleKey]).slice(0, 60)}` : ''}?`)) return;
    oc(rs.filter((_, k) => k !== i));
  }, [entity, idKey, titleKey]);
  const onDuplicate = useCallback((i) => {
    const { rows: rs, onChange: oc } = latest.current;
    const copy = { ...structuredClone(rs[i]), [idKey]: idPrefix ? nextId(rs, idPrefix, idWidth) : rs[i][idKey] };
    const next = rs.slice();
    next.splice(i + 1, 0, copy);
    oc(next);
  }, [idKey, idPrefix, idWidth]);
  const onOpen = useCallback((i) => setOpenIdx(i), []);

  const add = () => {
    const r = { ...(newRow ? newRow(ctx) : {}), [idKey]: idPrefix ? nextId(rows, idPrefix, idWidth) : '' };
    onChange([...rows, r]);
    onAdded?.(r);
    setTimeout(() => {
      const el = document.querySelector('.dg-wrap');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  };

  const view = useMemo(() => {
    let idx = rows.map((_, i) => i);
    if (q) {
      idx = idx.filter((i) => includesAll(
        [rows[i][idKey], ...columns.map((c) => plainValue(c, rows[i], ctx))].join(' '), q,
      ));
    }
    for (const [k, val] of Object.entries(f)) {
      if (!val) continue;
      const c = columns.find((x) => x.key === k);
      idx = idx.filter((i) => String(c?.calc ? c.calc(rows[i], ctx) : rows[i][k]) === val);
    }
    if (sort) {
      const c = columns.find((x) => x.key === sort.key);
      const val = (i) => (sort.key === idKey ? rows[i][idKey] : c?.calc ? c.calc(rows[i], ctx) : rows[i][sort.key]);
      idx.sort((a, b) => {
        const x = val(a), y = val(b);
        const nx = isNum(x) ? Number(x) : null, ny = isNum(y) ? Number(y) : null;
        let r;
        if (nx !== null && ny !== null) r = nx - ny;
        else if (x === '' || x === null || x === undefined) r = 1;
        else if (y === '' || y === null || y === undefined) r = -1;
        else r = String(x).localeCompare(String(y), undefined, { numeric: true });
        return sort.dir === 'asc' ? r : -r;
      });
    }
    return idx;
  }, [rows, q, f, sort, columns, ctx, idKey]);

  const toggleSort = (key) => setSort((s) => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));

  const hasTotals = gridCols.some((c) => c.total);
  const totalOf = (c) => {
    const vis = view.map((i) => rows[i]);
    if (typeof c.total === 'function') return c.total(vis, ctx);
    const vals = vis.map((r) => (c.calc ? c.calc(r, ctx) : r[c.key])).filter(isNum).map(Number);
    if (!vals.length) return '';
    const v = c.total === 'avg' ? vals.reduce((a, b) => a + b, 0) / vals.length : vals.reduce((a, b) => a + b, 0);
    return c.type === 'money' ? fmtMoney(v) : c.type === 'percent' ? fmtPct(v) : fmtNum(v, c.total === 'avg' ? 1 : c.dp ?? 0);
  };

  const exportCsv = () => {
    const head = [idKey === 'id' ? 'ID' : idKey, ...columns.map((c) => c.label)];
    const lines = [head, ...view.map((i) => [rows[i][idKey], ...columns.map((c) => plainValue(c, rows[i], ctx))])];
    const csv = lines.map((l) => l.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `${safeFile(exportName || entity)}.csv`);
  };

  const applyPaste = () => {
    const data = parseTsv(paste || '');
    if (!data.length) return setPaste(null);
    const editable = columns.filter((c) => !c.calc && !c.readOnly && EDITABLE.has(c.type || 'text'));
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const header = data[0].map(norm);
    const matched = header.map((h) => editable.find((c) => norm(c.label) === h || norm(c.key) === h));
    const useHeader = matched.filter(Boolean).length >= Math.max(1, Math.ceil(header.length / 2));
    const map = useHeader ? matched : editable.slice(0, data[0].length);
    const body = useHeader ? data.slice(1) : data;
    let current = rows;
    const added = body.map((cells) => {
      const r = { ...(newRow ? newRow(ctx) : {}), [idKey]: idPrefix ? nextId(current, idPrefix, idWidth) : '' };
      cells.forEach((cell, k) => {
        const c = map[k];
        if (!c) return;
        const t = cell.trim();
        if (['number', 'money', 'score'].includes(c.type)) r[c.key] = t === '' ? '' : (isNum(t.replace(/[$,%\s]/g, '')) ? Number(t.replace(/[$,%\s]/g, '')) : t);
        else if (c.type === 'percent') { const n = Number(t.replace(/[%\s]/g, '')); r[c.key] = t === '' ? '' : (t.includes('%') || n > 1 ? n / 100 : n); }
        else r[c.key] = t;
      });
      current = [...current, r];
      return r;
    });
    onChange([...rows, ...added]);
    setPaste(null);
  };

  const filterCols = filters.map((k) => columns.find((c) => c.key === k)).filter(Boolean);
  const openRow = openIdx !== null ? rows[openIdx] : null;

  return (
    <div>
      <div className="filters" style={{ padding: '12px 14px 0' }}>
        <input type="search" placeholder={`Search ${rows.length} ${entity}s…`} value={q} onChange={(e) => setQ(e.target.value)} />
        {filterCols.map((c) => {
          const vals = [...new Set(rows.map((r) => String(c.calc ? c.calc(r, ctx) : r[c.key] ?? '')).filter(Boolean))].sort();
          return (
            <select key={c.key} value={f[c.key] || ''} onChange={(e) => setF({ ...f, [c.key]: e.target.value })} aria-label={c.label}>
              <option value="">{c.label}: all</option>
              {vals.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          );
        })}
        <div style={{ flex: 1 }} />
        {toolbar}
        {example && <label className="check small"><input type="checkbox" checked={showExample} onChange={(e) => setShowExample(e.target.checked)} />Example row</label>}
        <button className="btn btn-sm" onClick={() => setPaste('')} title="Paste rows copied from Excel">Paste from Excel</button>
        <button className="btn btn-sm" onClick={exportCsv}>CSV</button>
        {canAdd && <button className="btn btn-sm btn-primary" onClick={add}>+ Add {entity}</button>}
      </div>
      <div className="dg-wrap" style={{ marginTop: 12, maxHeight }}>
        <table className="dg">
          <thead>
            <tr>
              <th className="sticky" onClick={() => toggleSort(idKey)}>ID{sort?.key === idKey && <span className="sort">{sort.dir === 'asc' ? '▲' : '▼'}</span>}</th>
              {gridCols.map((c) => (
                <th key={c.key} className={`${c.calc || c.readOnly ? 'calc' : ''} ${c.group === 'target' ? 'target' : ''}`} onClick={() => toggleSort(c.key)} title={c.help || c.label}>
                  {c.label}{sort?.key === c.key && <span className="sort">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {showExample && example && (
              <tr style={{ fontStyle: 'italic', color: 'var(--ink-3)' }}>
                <td className="sticky idcell">Example</td>
                {gridCols.map((c) => <td key={c.key} className="calc" style={{ whiteSpace: 'normal', maxWidth: 260 }}>{displayValue(c, example, ctx)}</td>)}
                <td />
              </tr>
            )}
            {view.map((i) => (
              <Row key={`${rows[i][idKey]}|${i}`} row={rows[i]} index={i} columns={gridCols} ctx={ctx} idKey={idKey}
                onCell={onCell} onOpen={onOpen} onDuplicate={canAdd ? onDuplicate : null} onDelete={canDelete ? onDelete : null} />
            ))}
            {!view.length && (
              <tr><td colSpan={gridCols.length + 2} className="empty">{rows.length ? 'No rows match the filters.' : (emptyText || `No ${entity}s yet. Add one or paste from Excel.`)}</td></tr>
            )}
          </tbody>
          {hasTotals && view.length > 0 && (
            <tfoot>
              <tr>
                <td className="sticky">Total</td>
                {gridCols.map((c) => <td key={c.key} style={{ textAlign: c.type === 'money' || c.type === 'number' ? 'right' : undefined }}>{c.total ? totalOf(c) : ''}</td>)}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="dg-foot">
        <span>{view.length === rows.length ? `${rows.length} ${entity}${rows.length === 1 ? '' : 's'}` : `${view.length} of ${rows.length} ${entity}s shown`}</span>
        <span>Grey columns are calculated · teal columns describe the target state · ⤢ opens all fields</span>
      </div>

      {openRow && (
        <Drawer title={`${openRow[idKey] || ''}${titleKey && openRow[titleKey] ? ` · ${openRow[titleKey]}` : ''}`} subtitle={entity} onClose={() => setOpenIdx(null)}>
          <div className="form-grid">
            {openIdx !== null && idPrefix && (
              <label className="field"><span>ID</span><input type="text" value={openRow[idKey] ?? ''} onChange={(e) => onCell(openIdx, idKey, e.target.value)} /></label>
            )}
            {columns.map((c, k) => {
              const prevGroup = k > 0 ? columns[k - 1].section : null;
              const calc = !!c.calc || c.readOnly || !EDITABLE.has(c.type || 'text');
              return [
                c.section && c.section !== prevGroup ? <div key={`s-${c.key}`} className="form-group-title">{c.section}</div> : null,
                <label key={c.key} className={`field ${c.type === 'long' || c.full ? 'full' : ''}`}>
                  <span>{c.label}{c.help && <span className="hint"> · {c.help}</span>}</span>
                  {calc
                    ? <div className="small" style={{ padding: '7px 10px', background: 'var(--surface-2)', borderRadius: 8, minHeight: 34 }}><CalcCell c={c} row={openRow} ctx={ctx} /></div>
                    : <CellEditor c={c} value={openRow[c.key]} onChange={(key, v) => onCell(openIdx, key, v)} ctx={ctx} inForm />}
                </label>,
              ];
            })}
          </div>
        </Drawer>
      )}

      {paste !== null && (
        <Modal title="Paste rows from Excel" onClose={() => setPaste(null)} wide
          footer={<><button className="btn" onClick={() => setPaste(null)}>Cancel</button><button className="btn btn-primary" onClick={applyPaste} disabled={!paste.trim()}>Add rows</button></>}>
          <p className="small muted">Copy cells in Excel and paste them below. If the first row contains column headings that match this register, columns are matched by name; otherwise values fill the editable columns in order: {columns.filter((c) => !c.calc && !c.readOnly && EDITABLE.has(c.type || 'text')).map((c) => c.label).join(', ')}.</p>
          <textarea rows={10} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste here…" autoFocus />
        </Modal>
      )}
    </div>
  );
}
