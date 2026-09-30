import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP } from '../../lib/store.jsx';
import { Card, PageHead, Stat, BarList, Empty } from '../../../components/ui.jsx';
import { OutcomePill, download, MIME } from '../../components/common.jsx';
import { winLoss } from '../../core/analytics.js';
import { audShort, aud, fmtDate } from '../../core/util.js';

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

// Quarterly win rate as a simple column chart with value labels.
function QuarterChart({ rows }) {
  if (!rows.length) return <p className="muted small">No decided bids yet.</p>;
  const h = 150;
  return (
    <div className="row" style={{ alignItems: 'flex-end', gap: 14, height: h + 70, flexWrap: 'nowrap', overflowX: 'auto', paddingTop: 8 }} role="img" aria-label={rows.map((r) => `${r.key}: ${pct(r.rate)} of ${r.total}`).join(', ')}>
      {rows.map((r) => (
        <div key={r.key} style={{ textAlign: 'center', minWidth: 54 }}>
          <div className="mini strong">{pct(r.rate)}</div>
          <div style={{ height: Math.max(4, r.rate * h), background: 'var(--brand-teal)', borderRadius: '4px 4px 0 0', margin: '4px auto 0', width: 34 }} title={`${r.won} won of ${r.total}`} />
          <div className="mini" style={{ marginTop: 4 }}>{r.key.replace(' ', ' ')}</div>
          <div className="mini muted">{r.won}/{r.total}</div>
        </div>
      ))}
    </div>
  );
}

function RateTable({ rows, label }) {
  return (
    <table className="table">
      <thead><tr><th>{label}</th><th className="right">Won</th><th className="right">Lost</th><th className="right">Win rate</th><th className="right">Won value</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.key}><td>{r.key}</td><td className="right tabular">{r.won}</td><td className="right tabular">{r.lost}</td><td className="right tabular strong">{pct(r.rate)}</td><td className="right tabular">{audShort(r.wonValue)}</td></tr>)}</tbody>
    </table>
  );
}

export default function WinLoss() {
  const { view } = useP();
  const [dim, setDim] = useState('bySector');
  const [partner, setPartner] = useState('');
  const bids = useMemo(() => view.bids.filter((b) => !partner || b.partnerId === partner), [view.bids, partner]);
  const w = useMemo(() => winLoss(bids, { clients: view.clients, users: view.users }), [bids, view.clients, view.users]);
  const decided = bids.filter((b) => ['won', 'lost'].includes(b.outcome?.result)).sort((a, b) => (b.outcome.at || '').localeCompare(a.outcome.at || ''));
  const exportXlsx = async () => {
    const { tableWorkbook } = await import('../../gen/xlsx.js');
    const cols = [{ key: 'key', label: 'Group', width: 30 }, { key: 'won', label: 'Won' }, { key: 'lost', label: 'Lost' }, { key: 'rate', label: 'Win rate', get: (r) => Math.round(r.rate * 100) / 100 }, { key: 'wonValue', label: 'Won value (AUD)' }];
    const bytes = await tableWorkbook([
      { name: 'By sector', rows: w.bySector, columns: cols }, { name: 'By client', rows: w.byClient, columns: cols }, { name: 'By offering', rows: w.byOffering, columns: cols }, { name: 'By partner', rows: w.byPartner, columns: cols }, { name: 'By quarter', rows: w.byQuarter, columns: cols },
      { name: 'Loss reasons', rows: w.lossReasons, columns: [{ key: 'label', label: 'Reason', width: 30 }, { key: 'value', label: 'Bids' }] },
      { name: 'Decided bids', rows: decided, columns: [{ key: 'ref', label: 'Reference' }, { key: 'title', label: 'Title', width: 50 }, { key: 'client', label: 'Client', width: 30, get: (b) => view.clients.find((c) => c.id === b.clientId)?.name }, { key: 'result', label: 'Result', get: (b) => b.outcome.result }, { key: 'at', label: 'Date', get: (b) => b.outcome.at }, { key: 'value', label: 'Value (AUD)' }, { key: 'reasons', label: 'Reasons', width: 40, get: (b) => (b.outcome.reasons || []).join('; ') }] },
    ]);
    download(bytes, 'CTO_win_loss.xlsx', MIME.xlsx);
  };
  return (
    <div className="stack">
      <PageHead eyebrow="Insight" title="Win/loss analytics" actions={<div className="row"><select value={partner} onChange={(e) => setPartner(e.target.value)} aria-label="Partner"><option value="">All partners</option>{view.users.filter((u) => u.roles.includes('partner')).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select><button className="btn" onClick={exportXlsx}>Export (.xlsx)</button></div>}>
        Win rate by sector, client, offering, partner and quarter; loss reasons; and time spent in each stage (spec section 12).
      </PageHead>
      <div className="grid g-4">
        <Stat label="Win rate" value={pct(w.rate)} sub={`${w.won} won of ${w.decided} decided`} accent />
        <Stat label="Value won" value={audShort(w.wonValue)} sub={`of ${audShort(w.bidValue)} bid`} />
        <Stat label="No-bid decisions" value={w.noBids} sub="at gate 1" />
        <Stat label="Top loss reason" value={w.lossReasons[0]?.label || '—'} sub={w.lossReasons[0] ? `${w.lossReasons[0].value} bid${w.lossReasons[0].value === 1 ? '' : 's'}` : ''} />
      </div>
      {!w.decided ? <Empty title="No decided bids">Record outcomes on bids to see win/loss analytics.</Empty> : (
        <>
          <div className="split">
            <Card title="Win rate by quarter"><QuarterChart rows={w.byQuarter} /></Card>
            <Card title="Why we lose" subtitle="Loss reasons recorded at outcome"><BarList items={w.lossReasons} color="var(--st-critical)" /></Card>
          </div>
          <Card title="Win rate by…" actions={<div className="row">{[['bySector', 'Sector'], ['byClient', 'Client'], ['byOffering', 'Offering'], ['byPartner', 'Partner']].map(([k, l]) => <button key={k} className={`btn btn-sm ${dim === k ? 'btn-navy' : ''}`} onClick={() => setDim(k)}>{l}</button>)}</div>}>
            <div className="split">
              <BarList items={w[dim].map((r) => ({ label: r.key, value: Math.round(r.rate * 100), hint: `${r.won} of ${r.total}` }))} max={100} format={(v) => `${v}%`} />
              <RateTable rows={w[dim]} label={{ bySector: 'Sector', byClient: 'Client', byOffering: 'Offering', byPartner: 'Partner' }[dim]} />
            </div>
          </Card>
          <div className="split">
            <Card title="Average days in each stage" subtitle="From stage history across all bids">
              <BarList items={w.cycle.filter((c) => c.avg !== null).map((c) => ({ label: c.stage.label, value: Math.round(c.avg * 10) / 10, hint: `${c.n} bids` }))} format={(v) => `${v} d`} />
            </Card>
            <Card title="Recent outcomes" pad={false}>
              {decided.slice(0, 10).map((b) => (
                <div key={b.id} className="work-item" style={{ gridTemplateColumns: '1fr auto' }}>
                  <div><div className="t"><Link to={`/bids/${b.id}`}>{b.ref} {b.title}</Link></div><div className="d">{view.clients.find((c) => c.id === b.clientId)?.name} · {aud(b.outcome.awardedValue || b.value)} · {b.outcome.at ? fmtDate(b.outcome.at) : ''}{b.outcome.reasons?.length ? ` · ${b.outcome.reasons.join(', ')}` : ''}</div></div>
                  <OutcomePill outcome={b.outcome} />
                </div>
              ))}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
