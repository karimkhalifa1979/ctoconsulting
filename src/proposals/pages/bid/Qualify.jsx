import { useEffect, useState } from 'react';
import { useP, useCan } from '../../lib/store.jsx';
import { runAi } from '../../lib/ai.js';
import { Card } from '../../../components/ui.jsx';
import { Person, When, GatePill, Icon, TagInput } from '../../components/common.jsx';
import { SCORECARD_FACTORS } from '../../core/constants.js';
import { scoreSummary } from '../../core/qualify.js';
import { hasRole } from '../../core/permissions.js';

export default function Qualify({ bid }) {
  const { view, me, dispatch, backend, toast } = useP();
  const can = useCan();
  const plan = can('planSections', { bid });
  const partner = hasRole(me, 'partner');
  const editable = plan || partner;
  const [busy, setBusy] = useState(null);
  const [brief, setBrief] = useState(bid.brief);
  const [card, setCard] = useState(bid.scorecard);
  const [themes, setThemes] = useState(bid.plan?.winThemes?.length ? bid.plan.winThemes : bid.brief?.winThemes || []);
  const [decision, setDecision] = useState({ decision: 'approve', comment: '', conditions: '', reason: '' });
  useEffect(() => { setBrief(bid.brief); setCard(bid.scorecard); }, [bid.brief, bid.scorecard]);

  const generate = async () => {
    setBusy('Summarising the request and pre-filling the scorecard…');
    try {
      const b = await runAi('brief', { view, bid }, { backend, dispatch });
      await dispatch('brief.set', { bidId: bid.id, brief: b }, { quiet: true });
      const s = await runAi('scorecard', { view, bid: { ...bid, brief: b } }, { backend, dispatch });
      await dispatch('scorecard.set', { bidId: bid.id, scorecard: s }, { success: 'Brief and scorecard pre-filled with evidence. Review them before deciding.' });
      if (!themes.length) setThemes(b.winThemes || []);
    } finally { setBusy(null); }
  };
  useEffect(() => {
    if (!bid.brief && editable && bid.requirements.length && bid.aiEnabled) generate().catch(() => {});
  }, [bid.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = card ? scoreSummary(card.factors || {}) : null;
  const g = bid._d.gates.g1;
  const decisions = bid.gates.g1?.decisions || [];
  const setFactor = (id, patch) => setCard({ ...card, factors: { ...card.factors, [id]: { ...(card.factors?.[id] || {}), ...patch } } });
  const saveCard = () => dispatch('scorecard.set', { bidId: bid.id, scorecard: { ...card, ...scoreSummary(card.factors) } }, { success: 'Scorecard saved' });
  const saveBrief = () => dispatch('brief.set', { bidId: bid.id, brief: { ...brief, winThemes: themes } }, { quiet: true }).then(() => dispatch('plan.update', { bidId: bid.id, winThemes: themes }, { success: 'Brief and win themes saved' }));

  return (
    <div className="stack">
      {busy && <div className="callout"><div className="spinner" style={{ display: 'inline-block', width: 16, height: 16, verticalAlign: 'middle', marginRight: 8 }} />{busy}</div>}
      <div className="split">
        <Card title="Opportunity brief" subtitle="One page: client, need, scope, timing, risks and suggested win themes (CR-06)" actions={editable && <button className="btn btn-sm" onClick={generate} disabled={Boolean(busy) || !bid.aiEnabled}><Icon name="ai" size={14} />{bid.brief ? 'Regenerate' : 'Generate'}</button>}>
          {!brief ? <p className="muted">Extract the request first, then generate the brief.</p> : (
            <div className="stack" style={{ gap: 10 }}>
              <div><div className="mini strong">Client</div>{brief.client}</div>
              <div><div className="mini strong">Need</div>{editable ? <textarea value={brief.need} onChange={(e) => setBrief({ ...brief, need: e.target.value })} rows={4} /> : <p className="small">{brief.need}</p>}</div>
              {brief.scope?.length > 0 && <div><div className="mini strong">Scope</div><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{brief.scope.map((s) => <li key={s}>{s}</li>)}</ul></div>}
              <div><div className="mini strong">Timing</div><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{(brief.timing || []).map((s) => <li key={s}>{s}</li>)}</ul></div>
              <div><div className="mini strong">Requirements</div><p className="small" style={{ margin: 0 }}>{brief.requirements}</p></div>
              <div><div className="mini strong">Risks</div>{brief.risks?.length ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{brief.risks.map((s) => <li key={s}>{s}</li>)}</ul> : <p className="small muted">None identified.</p>}</div>
              <div><div className="mini strong">Win themes</div><TagInput value={themes} onChange={setThemes} disabled={!editable} placeholder="Add a win theme" /></div>
              {editable && <div><button className="btn btn-sm btn-primary" onClick={saveBrief}>Save brief and win themes</button></div>}
            </div>
          )}
        </Card>
        <Card title="Bid/no-bid scorecard" subtitle="Pre-filled with evidence for the partner to decide (CR-07). Scores 1 (poor) to 5 (strong)." actions={card && editable && <button className="btn btn-sm btn-primary" onClick={saveCard}>Save scores</button>}>
          {!card ? <p className="muted">The scorecard is pre-filled when the brief is generated.</p> : (
            <>
              <table className="table">
                <tbody>
                  {SCORECARD_FACTORS.map((f) => {
                    const v = card.factors?.[f.id] || {};
                    return (
                      <tr key={f.id}>
                        <td style={{ width: '42%' }}><strong>{f.label}</strong><div className="mini">{f.hint}</div></td>
                        <td style={{ width: 90 }}>{editable ? <select value={v.score || ''} onChange={(e) => setFactor(f.id, { score: Number(e.target.value) })} aria-label={`${f.label} score`}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select> : <span className="num-big" style={{ fontSize: 20 }}>{v.score}</span>}
                          <div className="hbar" style={{ marginTop: 4 }}><span style={{ width: `${(v.score || 0) * 20}%`, background: v.score >= 4 ? 'var(--st-good)' : v.score >= 3 ? 'var(--st-warning)' : 'var(--st-critical)' }} /></div></td>
                        <td className="small">{editable ? <textarea value={v.evidence || ''} onChange={(e) => setFactor(f.id, { evidence: e.target.value })} rows={2} style={{ minHeight: 44 }} /> : v.evidence}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
                <div><span className="mini">Average</span> <span className="num-big">{summary.average}</span> <span className="mini">/ 5 · total {summary.total} of {summary.max}</span></div>
                <span className={`pill ${summary.recommendation === 'Bid' ? 'good' : summary.recommendation === 'No bid' ? 'bad' : 'warn'}`} style={{ fontSize: 13 }}>Recommendation: {summary.recommendation}</span>
              </div>
            </>
          )}
        </Card>
      </div>
      <Card title="Gate 1: bid/no-bid decision" subtitle="The accountable partner decides. A no-bid archives the bid with its reason." actions={<GatePill status={g.status} />}>
        {decisions.map((d) => (
          <div key={d.id} className={`decision ${d.void ? 'void' : ''}`}>
            <Person id={d.by} />
            <div><strong>{d.decision === 'reject' ? 'No-bid' : d.decision === 'approve_conditions' ? 'Bid, with conditions' : 'Bid'}</strong> · <When at={d.at} />{d.scorecard && <span className="mini"> · scorecard {d.scorecard.average} ({d.scorecard.recommendation})</span>}
              {d.conditions && <div className="small">Conditions: {d.conditions}</div>}{d.comment && <div className="small muted">{d.comment}</div>}</div>
          </div>
        ))}
        {bid.stage === 'qualify' && partner ? (
          <div className="stack" style={{ gap: 10, marginTop: decisions.length ? 12 : 0 }}>
            <div className="row">
              {[['approve', 'Bid'], ['approve_conditions', 'Bid with conditions'], ['reject', 'No-bid']].map(([id, label]) => <label key={id} className="check"><input type="radio" name="g1" checked={decision.decision === id} onChange={() => setDecision({ ...decision, decision: id })} /><span>{label}</span></label>)}
            </div>
            {decision.decision === 'approve_conditions' && <textarea placeholder="Conditions (for example: named lead confirmed before plan is published)" value={decision.conditions} onChange={(e) => setDecision({ ...decision, conditions: e.target.value })} />}
            {decision.decision === 'reject' && <textarea placeholder="Reason for the no-bid (recorded and reported)" value={decision.reason} onChange={(e) => setDecision({ ...decision, reason: e.target.value })} />}
            <textarea placeholder="Comment (optional)" value={decision.comment} onChange={(e) => setDecision({ ...decision, comment: e.target.value })} style={{ minHeight: 50 }} />
            <div><button className={`btn ${decision.decision === 'reject' ? 'btn-danger' : 'btn-primary'}`} onClick={() => dispatch('gate.decide', { bidId: bid.id, gateId: 'g1', ...decision }, { success: decision.decision === 'reject' ? 'No-bid recorded; the bid is archived' : 'Decision to bid recorded' })}>Record decision</button>
              {!bid.scorecard && <span className="mini" style={{ marginLeft: 10 }}>Tip: pre-fill the scorecard first so the decision is evidenced.</span>}</div>
          </div>
        ) : bid.stage === 'qualify' ? <p className="muted small">Waiting for a partner to decide. {view.users.find((u) => u.id === bid.partnerId)?.name} is the accountable partner.</p> : null}
      </Card>
    </div>
  );
}
