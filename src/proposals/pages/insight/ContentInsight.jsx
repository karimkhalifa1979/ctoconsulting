import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useP } from '../../lib/store.jsx';
import { Card, PageHead, Stat, BarList, Donut } from '../../../components/ui.jsx';
import { LibStatus, Person, download, MIME } from '../../components/common.jsx';
import { contentInsight } from '../../core/analytics.js';
import { libTypeLabel, LIB_STATUSES } from '../../core/constants.js';
import { fmtDate } from '../../core/util.js';
import { reviewDue } from '../../core/library.js';

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

// Content insight (spec section 12): most-used items and their win rates, expiring items, and library gaps.
export default function ContentInsight() {
  const { view } = useP();
  const c = useMemo(() => contentInsight(view.library, view.bids, view.settings), [view.library, view.bids, view.settings]);
  const statusCounts = LIB_STATUSES.map((s) => ({ label: s.label, value: c.items.filter((x) => x.status === s.id).length, color: s.color })).filter((x) => x.value);
  const exportXlsx = async () => {
    const { tableWorkbook } = await import('../../gen/xlsx.js');
    const bytes = await tableWorkbook([
      { name: 'Most used', rows: c.used, columns: [{ key: 'key', label: 'Key', get: (x) => x.item.key }, { key: 'title', label: 'Title', width: 50, get: (x) => x.item.title }, { key: 'type', label: 'Type', get: (x) => libTypeLabel(x.item.type) }, { key: 'uses', label: 'Bids', get: (x) => x.usage.bids.length }, { key: 'win', label: 'Win rate', get: (x) => (x.usage.winRate == null ? '' : Math.round(x.usage.winRate * 100) / 100) }] },
      { name: 'Due for review', rows: c.due, columns: [{ key: 'key', label: 'Key', get: (x) => x.item.key }, { key: 'title', label: 'Title', width: 50, get: (x) => x.item.title }, { key: 'owner', label: 'Owner', get: (x) => view.users.find((u) => u.id === x.item.ownerId)?.name }, { key: 'date', label: 'Review or expiry', get: (x) => reviewDue(x.item, view.settings)?.date }] },
      { name: 'Library gaps', rows: c.gaps, columns: [{ key: 'bid', label: 'Bid', get: (g) => g.bid.ref }, { key: 'ref', label: 'Requirement', get: (g) => g.req.ref }, { key: 'text', label: 'Text', width: 70, get: (g) => g.req.text }, { key: 'best', label: 'Closest item', width: 40, get: (g) => g.best || '' }] },
    ]);
    download(bytes, 'CTO_content_insight.xlsx', MIME.xlsx);
  };
  return (
    <div className="stack">
      <PageHead eyebrow="Insight" title="Content insight" actions={<button className="btn" onClick={exportXlsx}>Export (.xlsx)</button>}>
        Which content wins, what needs review, and what the library is missing for live bids.
      </PageHead>
      <div className="grid g-4">
        <Stat label="Library items" value={c.items.length} sub={`${c.items.filter((x) => x.status === 'approved').length} approved`} accent />
        <Stat label="Used in bids" value={c.used.length} sub="items cited at least once" />
        <Stat label="Win rate when reused" value={pct(c.reuseWin)} sub="bids citing library content" />
        <Stat label="Due for review" value={c.due.length} sub="expiring or past review date" />
      </div>
      <div className="split">
        <Card title="Most used content" subtitle="Bids citing each item, and the win rate of those bids (CL-12)" pad={false}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Item</th><th>Type</th><th className="right">Bids</th><th className="right">Win rate</th></tr></thead>
              <tbody>{c.used.slice(0, 12).map((x) => <tr key={x.item.id}><td><Link to={`/library/${x.item.id}`}>{x.item.key} {x.item.title}</Link></td><td className="small">{libTypeLabel(x.item.type)}</td><td className="right tabular">{x.usage.bids.length}</td><td className="right tabular strong">{pct(x.usage.winRate)}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
        <div className="stack">
          <Card title="Library by status"><Donut items={statusCounts} center={c.items.length} sub="items" /></Card>
          <Card title="Library by type"><BarList items={[...c.byType].map(([k, v]) => ({ label: libTypeLabel(k, false), value: v })).sort((a, b) => b.value - a.value)} /></Card>
        </div>
      </div>
      <Card title="Due for review or expiring" subtitle="Owners are reminded before the date (CL-05)" pad={false}>
        {c.due.length ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Item</th><th>Status</th><th>Owner</th><th>Date</th></tr></thead>
            <tbody>{c.due.map((x) => { const d = reviewDue(x.item, view.settings); return <tr key={x.item.id}><td><Link to={`/library/${x.item.id}`}>{x.item.key} {x.item.title}</Link></td><td><LibStatus status={x.status} /></td><td><Person id={x.item.ownerId} /></td><td className="small" style={d?.overdue ? { color: 'var(--st-critical)', fontWeight: 600 } : undefined}>{d ? fmtDate(d.date) : '—'}{d?.overdue ? ' (overdue)' : ''}</td></tr>; })}</tbody>
          </table></div>
        ) : <p className="muted small" style={{ padding: '0 18px 14px' }}>Nothing is due.</p>}
      </Card>
      <Card title="Library gaps" subtitle="Requirements in live bids with no strong match in the approved library. Candidates for new standard answers or case studies." pad={false}>
        {c.gaps.length ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Bid</th><th>Requirement</th><th>Closest library item</th></tr></thead>
            <tbody>{c.gaps.slice(0, 30).map((g) => <tr key={`${g.bid.id}${g.req.id}`}><td className="small"><Link to={`/bids/${g.bid.id}/requirements`}>{g.bid.ref}</Link></td><td className="small"><strong>{g.req.ref}</strong> {g.req.text}</td><td className="small">{g.best || <span className="muted">No match</span>}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="muted small" style={{ padding: '0 18px 14px' }}>Every live requirement has a strong library match.</p>}
      </Card>
    </div>
  );
}
