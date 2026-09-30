import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP } from '../../lib/store.jsx';
import { platformInfo } from '../../lib/ai.js';
import { Card, PageHead, Stat, BarList } from '../../../components/ui.jsx';
import { Person, When, download, MIME } from '../../components/common.jsx';
import { aiUsage } from '../../core/analytics.js';

const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const ACTION = { draft: 'Section drafts', exec_summary: 'Executive summaries', shorten: 'Shorten', strengthen: 'Strengthen', tailor: 'Tailor case study', check: 'Requirement checks', bulk_answer: 'Questionnaire answers', extract: 'Request extraction', brief: 'Opportunity brief', scorecard: 'Scorecard', metadata: 'Library metadata', storyboard: 'Storyboards', rehearsal: 'Rehearsal packs' };

// AI usage and governance (spec sections 12 and 16): every AI call is logged with model, prompt version and sources.
export default function AiUsage() {
  const { view, query } = useP();
  const [log, setLog] = useState([]);
  const [info, setInfo] = useState(null);
  useEffect(() => { query('aiLog', {}).then((r) => setLog(r || [])); platformInfo().then(setInfo); }, [view.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const u = useMemo(() => aiUsage(view.bids, log), [view.bids, log]);
  const models = [...log.reduce((m, e) => m.set(e.engine === 'claude' ? e.model || 'Claude' : 'Offline engine', (m.get(e.engine === 'claude' ? e.model || 'Claude' : 'Offline engine') || 0) + 1), new Map())].map(([label, value]) => ({ label, value }));
  const exportXlsx = async () => {
    const { tableWorkbook } = await import('../../gen/xlsx.js');
    const bytes = await tableWorkbook([{ name: 'AI log', rows: log, columns: [
      { key: 'at', label: 'When', width: 22 }, { key: 'user', label: 'User', get: (e) => view.users.find((x) => x.id === e.userId)?.name }, { key: 'bid', label: 'Bid', get: (e) => view.bids.find((b) => b.id === e.bidId)?.ref || '' },
      { key: 'action', label: 'Action' }, { key: 'engine', label: 'Engine' }, { key: 'model', label: 'Model' }, { key: 'promptVersion', label: 'Prompt version' }, { key: 'inputChars', label: 'Input chars' }, { key: 'outputChars', label: 'Output chars' },
      { key: 'costUsd', label: 'Cost (USD)' }, { key: 'ms', label: 'Duration (ms)' }, { key: 'ok', label: 'OK' }, { key: 'sources', label: 'Sources', width: 40, get: (e) => (e.sources || []).join(' ') },
    ] }]);
    download(bytes, 'CTO_AI_usage_log.xlsx', MIME.xlsx);
  };
  return (
    <div className="stack">
      <PageHead eyebrow="Insight" title="AI usage" actions={<button className="btn" onClick={exportXlsx}>Export log (.xlsx)</button>}>
        Drafts generated, the share accepted without major edits, extraction corrections and cost per bid. Client data is processed under terms that exclude model training.
      </PageHead>
      <div className="callout small">
        Engine: {info?.claude ? <>Claude via the platform server (<strong>{info.model}</strong>)</> : <>offline drafting engine (no Anthropic API key configured on the server)</>}. Model and prompt version are recorded for every call. AI can be switched off per bid where a client prohibits it.
      </div>
      <div className="grid g-4">
        <Stat label="AI drafts" value={u.drafts} sub={`${u.pending} awaiting human review`} accent />
        <Stat label="Accepted without major edits" value={pct(u.acceptedShare)} sub={`${u.acceptedAsIs} of ${u.reviewed} reviewed drafts`} />
        <Stat label="Extraction corrections" value={u.correctionsPerExtraction == null ? '—' : u.correctionsPerExtraction.toFixed(1)} sub={`per request, across ${u.extractions} bids`} />
        <Stat label="Cost" value={`US$${u.cost.toFixed(2)}`} sub={`${u.calls} calls, ${u.claudeCalls} to Claude`} />
      </div>
      <div className="split">
        <Card title="Calls by action"><BarList items={u.byAction.map((x) => ({ label: ACTION[x.label] || x.label, value: x.value }))} /></Card>
        <Card title="Calls by model"><BarList items={models} color="var(--series-2)" /></Card>
      </div>
      <Card title="By bid" pad={false}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Bid</th><th className="right">Calls</th><th className="right">Claude</th><th className="right">Offline</th><th className="right">Cost (USD)</th><th>AI on this bid</th></tr></thead>
          <tbody>{u.byBid.map((x) => <tr key={x.bid.id}><td><Link to={`/bids/${x.bid.id}`}>{x.bid.ref} {x.bid.title}</Link></td><td className="right tabular">{x.calls}</td><td className="right tabular">{x.claude}</td><td className="right tabular">{x.offline}</td><td className="right tabular">{x.cost.toFixed(2)}</td><td>{x.bid.aiEnabled === false ? <span className="pill bad">Switched off</span> : <span className="pill good">On</span>}</td></tr>)}</tbody>
        </table></div>
      </Card>
      <Card title="Recent AI calls" subtitle="The governance log: who, what, which model and prompt version, and the sources used" pad={false}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Bid</th><th>Engine</th><th>Prompt</th><th>Sources</th></tr></thead>
          <tbody>{[...log].reverse().slice(0, 40).map((e) => <tr key={e.id}><td className="small"><When at={e.at} /></td><td><Person id={e.userId} /></td><td className="small">{ACTION[e.action] || e.action}{e.ok === false ? <span className="pill bad" style={{ marginLeft: 4 }}>failed</span> : null}</td><td className="small">{view.bids.find((b) => b.id === e.bidId)?.ref || '—'}</td><td className="small">{e.engine === 'claude' ? e.model : 'Offline'}</td><td className="mini">{e.promptVersion || '—'}</td><td className="mini">{(e.sources || []).slice(0, 4).join(', ')}{(e.sources || []).length > 4 ? '…' : ''}</td></tr>)}</tbody>
        </table></div>
      </Card>
    </div>
  );
}
