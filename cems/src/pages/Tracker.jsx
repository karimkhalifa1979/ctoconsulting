// Status update tracker (STS-008, UC-02): who has submitted for the period, what is late, and
// where ratings were overridden.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { useLookups } from '../components/fields.jsx';
import { PageHead, Card, Async, Table, Status, Rag, Badge, DT, Tile } from '../components/ui.jsx';
import { fmtDate } from '../../shared/format.js';

export default function Tracker() {
  const lookups = useLookups();
  const [eng, setEng] = useState('');
  const [period, setPeriod] = useState('');
  const q = useApi('/api/status/tracker', { engagement_id: eng, period_end: period });
  const name = (id) => lookups?.users?.find((u) => u.id === id)?.label;
  return (
    <>
      <PageHead title="Status update tracker" crumbs={<><Link to="/reports">Reports</Link><span>›</span></>}
        sub="Weekly updates for every project in delivery; the cut-off is set by the Firm’s reporting calendar (BR-17)."
        actions={<>
          <select value={eng} onChange={(e) => setEng(e.target.value)} aria-label="Engagement" style={{ width: 'auto' }}><option value="">All engagements</option>{(lookups?.engagements || []).map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>
          <input type="date" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Week ending" title="Week ending (blank for the current period)" />
        </>} />
      <Async q={q}>{(rows) => {
        const count = (s) => rows.filter((r) => r.status === s).length;
        return (
          <>
            <div className="grid g-5 mb-2">
              <Tile label="Projects" value={rows.length} sub={rows[0] ? `Week ending ${fmtDate(rows[0].period_end)}` : ''} />
              <Tile label="Approved or reported" value={count('Approved') + count('Reported')} tone="good" />
              <Tile label="Submitted, awaiting review" value={count('Submitted')} />
              <Tile label="Draft or not started" value={count('Draft') + count('Not started') + count('Returned')} tone={count('Draft') + count('Not started') ? 'warn' : ''} />
              <Tile label="Late" value={count('Late')} tone={count('Late') ? 'bad' : ''} />
            </div>
            <Card flush>
              <Table rows={rows.map((r) => ({ ...r, id: `${r.project_id}` }))} empty="No projects due an update." columns={[
                { key: 'engagement', label: 'Engagement', render: (r) => <Link to={`/engagements/${r.engagement_id}`}>{r.engagement}</Link> },
                { key: 'project', label: 'Project', render: (r) => <Link className="strong" to={`/projects/${r.project_id}/status`}>{r.project}</Link> },
                { key: 'manager_id', label: 'Project manager', render: (r) => name(r.manager_id) },
                { key: 'status', label: 'Status', render: (r) => <span className="flex"><Status v={r.status} />{r.late && r.status !== 'Late' && <Badge tone="amber">Late</Badge>}</span> },
                { key: 'overall', label: 'Overall', render: (r) => <Rag v={r.overall} sm /> },
                { key: 'overrides', label: 'Overrides', num: true, render: (r) => (r.overrides ? <Badge tone="amber" title="Ratings better than calculated (BR-06)">{r.overrides}</Badge> : '—') },
                { key: 'submitted_at', label: 'Submitted', render: (r) => (r.submitted_at ? <DT v={r.submitted_at} /> : '—') },
                { key: 'cutoff', label: 'Cut-off', render: (r) => <DT v={r.cutoff} /> },
              ]} />
            </Card>
          </>
        );
      }}</Async>
    </>
  );
}
