import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { loadSheetIndex, loadSheet } from '../lib/store.jsx';
import { PageHead, Loading, usePaged, includesAll } from '../components/ui.jsx';
import { downloadCSV, safeName } from '../lib/exporters.js';

function groupOf(name) {
  if (/^requirements|requirements (capture|register)/i.test(name)) return 'Requirement registers';
  if (/obligation|obs/i.test(name)) return 'Obligations';
  if (/trace/i.test(name)) return 'Traceability matrices';
  if (/cons|consolidated|original|mapping/i.test(name)) return 'Consolidation working';
  if (/source/i.test(name)) return 'Source registers';
  if (/pspf|pgpa|ndis/i.test(name)) return 'Framework requirements';
  return 'Reference';
}

export default function RegisterExplorer() {
  const { org, library } = useApp();
  const [index, setIndex] = useState(null);
  const [file, setFile] = useState('');
  const [sheet, setSheet] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => { loadSheetIndex().then((idx) => { setIndex(idx); setFile(idx[0]?.file); }); }, []);
  useEffect(() => { if (file) { setSheet(null); loadSheet(file).then(setSheet); } }, [file]);

  const rows = useMemo(() => (sheet ? sheet.rows.filter((r) => includesAll(r.join(' '), q)) : []), [sheet, q]);
  const [page, pager] = usePaged(rows, 50, [file, q]);
  const cols = sheet ? sheet.headers.map((h, i) => ({ label: h || `Column ${i + 1}`, get: (r) => r[i] })) : [];

  if (!index) return <Loading />;
  const groups = index.reduce((m, s) => ((m[groupOf(s.name)] ||= []).push(s), m), {});

  return (
    <div>
      <PageHead eyebrow="Register explorer" title={library.meta.source}
        actions={sheet && <button className="btn" onClick={() => downloadCSV(rows, cols, `${safeName(sheet.name)}.csv`)}>Export sheet (CSV)</button>}>
        Every worksheet of the uploaded policy requirements register, loaded verbatim against the National Insurance Disability Agency ({index.length} worksheets).
        {org.kind !== 'seed' && ' You are viewing the reference register; the selected organisation’s own register is under Obligations and Policy requirements.'}
      </PageHead>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', alignItems: 'start' }} data-layout="explorer">
        <div className="card" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          {Object.entries(groups).map(([g, list]) => (
            <div key={g}>
              <div className="nav-label" style={{ color: 'var(--ink-3)' }}>{g}</div>
              {list.map((s) => (
                <div key={s.file} className={`req-item ${s.file === file ? 'active' : ''}`} style={{ gridTemplateColumns: '1fr auto' }} onClick={() => setFile(s.file)}>
                  <span className="small" style={{ fontWeight: 600 }}>{s.name}</span><span className="small muted tabular">{s.rows}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="card" style={{ minWidth: 0 }}>
          {!sheet ? <Loading /> : (
            <>
              <div className="card-head">
                <div><h3>{sheet.name}</h3>{sheet.preamble.length > 0 && <p>{sheet.preamble[0]}</p>}</div>
                <input type="search" placeholder="Search this sheet…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 290px)' }}>
                <table className="table">
                  <thead><tr>{sheet.headers.map((h, i) => <th key={i} style={{ minWidth: 140 }}>{h}</th>)}</tr></thead>
                  <tbody>{page.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="small"><div className="clamp-3" title={c}>{c}</div></td>)}</tr>)}</tbody>
                </table>
              </div>
              {pager}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
