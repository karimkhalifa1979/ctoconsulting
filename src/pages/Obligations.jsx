import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { PageHead, LevelBadge, Drawer, usePaged, includesAll, Linkify } from '../components/ui.jsx';
import { levelMap } from './Dashboard.jsx';
import { downloadCSV, safeName } from '../lib/exporters.js';

export default function Obligations() {
  const { org, data } = useApp();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const source = params.get('source') || '';
  const policy = params.get('policy') || '';
  const level = params.get('level') || '';
  const publisher = params.get('publisher') || '';
  const levels = useMemo(() => levelMap(org), [org]);
  const reqById = useMemo(() => Object.fromEntries(data.requirements.map((r) => [r.id, r])), [data]);
  const setParam = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  const lvl = (o) => o.level || levels[o.name] || 'mandatory';
  const polTitle = (o) => data.policies[o.policyCode]?.title || o.policyCode;
  const sources = useMemo(() => [...new Set(data.obligations.map((o) => o.name))].sort(), [data]);
  const publishers = useMemo(() => [...new Set(data.obligations.map((o) => o.publisher).filter(Boolean))].sort(), [data]);
  const policies = Object.values(data.policies).map((p) => p.title).sort();

  const rows = useMemo(() => data.obligations.filter((o) =>
    (!source || o.name === source) && (!policy || polTitle(o) === policy) && (!level || lvl(o) === level) && (!publisher || o.publisher === publisher)
    && includesAll(`${o.id} ${o.name} ${o.reference} ${o.description} ${o.requirementIds.join(' ')}`, q)),
  [data, source, policy, level, publisher, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const [page, pager] = usePaged(rows, 50, [source, policy, level, publisher, q]);

  const exportCsv = () => downloadCSV(rows, [
    { label: `${org.shortName} Policy Number`, key: 'policyNumber' }, { label: 'Obligation ID', key: 'id' }, { label: 'Policy Requirement ID Mapping', key: 'requirementIds' },
    { label: 'Obligation Name', key: 'name' }, { label: 'Obligation Reference', key: 'reference' }, { label: 'Obligation Description', key: 'description' },
    { label: `Applicability to the ${org.shortName}`, key: 'applicability' }, { label: 'Applicability Level', get: lvl }, { label: 'Obligation Source', key: 'source' },
    { label: 'Publisher', key: 'publisher' }, { label: 'Obligation Type', key: 'type' }, { label: 'Source URLs', key: 'urls' },
  ], `${safeName(org.shortName)}_Obligations.csv`);

  return (
    <div>
      <PageHead eyebrow="Obligations register" title={`Obligations — ${org.shortName}`} actions={<button className="btn dl" onClick={exportCsv}>Export CSV</button>}>
        Every obligation applicable to {org.name}, populated in the format of the register’s Obligations tab and mapped to the policy requirement and target policy that gives effect to it.
      </PageHead>
      <div className="filters">
        <input type="search" placeholder="Search ID, reference, description…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={source} onChange={(e) => setParam('source', e.target.value)} style={{ maxWidth: 260 }}><option value="">All sources ({sources.length})</option>{sources.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={policy} onChange={(e) => setParam('policy', e.target.value)} style={{ maxWidth: 240 }}><option value="">All target policies</option>{policies.map((s) => <option key={s}>{s}</option>)}</select>
        <select value={level} onChange={(e) => setParam('level', e.target.value)}><option value="">All applicability</option><option value="mandatory">Mandatory</option><option value="conditional">Conditional</option><option value="recommended">Recommended</option></select>
        <select value={publisher} onChange={(e) => setParam('publisher', e.target.value)} style={{ maxWidth: 220 }}><option value="">All publishers</option>{publishers.map((s) => <option key={s}>{s}</option>)}</select>
        {(source || policy || level || publisher || q) && <button className="btn btn-sm btn-ghost" onClick={() => { setQ(''); setParams({}, { replace: true }); }}>Clear</button>}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Obligation ID</th><th>Obligation</th><th>Description</th><th>Requirement</th><th>Target policy</th><th>Applicability</th></tr></thead>
            <tbody>
              {page.map((o) => (
                <tr key={o.key} className="clickable" onClick={() => setOpen(o)}>
                  <td className="nowrap"><strong>{o.id}</strong></td>
                  <td style={{ minWidth: 200 }}><div>{o.name}</div><div className="small muted clamp-2">{o.reference}</div></td>
                  <td className="small"><div className="clamp-3">{o.description}</div></td>
                  <td className="small nowrap">{o.requirementIds.join(', ')}</td>
                  <td className="small">{polTitle(o)}</td>
                  <td><LevelBadge level={lvl(o)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pager}
      </div>

      {open && (
        <Drawer title={open.reference || open.id} subtitle={`Obligation ${open.id}`} onClose={() => setOpen(null)}>
          <dl style={{ margin: 0 }}>
            {[
              [`${org.shortName} Policy Number`, open.policyNumber], ['Obligation ID', open.id], ['Obligation Name', open.name], ['Obligation Reference', open.reference],
              ['Obligation Description', open.description], [`Applicability to the ${org.shortName}`, open.applicability], ['Applicability level', <LevelBadge key="l" level={lvl(open)} />],
              ['Obligation Source', open.source], ['Publisher', open.publisher], ['Obligation Type', open.type], ['Source URLs', <Linkify key="u" text={open.urls} />],
            ].map(([k, v]) => <div className="attr" key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}
          </dl>
          <h3 style={{ margin: '20px 0 8px' }}>Mapped policy requirements</h3>
          {open.requirementIds.map((id) => {
            const r = reqById[id];
            return (
              <div key={id} className="card card-pad" style={{ marginBottom: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{id} — {r?.title || 'Not found in register'}</strong>
                  <div className="btn-row">
                    <Link className="btn btn-sm" to={`/requirements?id=${encodeURIComponent(id)}`}>Requirement</Link>
                    <Link className="btn btn-sm" to={`/traceability?id=${encodeURIComponent(id)}`}>Trace</Link>
                  </div>
                </div>
                {r && <p className="small" style={{ margin: '6px 0 0' }}><span className="muted">Suggested target policy:</span> {r.policyTitle} ({r.policyNumber})</p>}
              </div>
            );
          })}
        </Drawer>
      )}
    </div>
  );
}
