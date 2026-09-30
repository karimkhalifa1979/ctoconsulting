import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useP, useCan } from '../../lib/store.jsx';
import { Card } from '../../../components/ui.jsx';
import { Closing, Field, OutcomePill, When, Blockers, Person } from '../../components/common.jsx';
import { OUTPUT_KINDS, LOSS_REASONS, CHANNELS, LIB_TYPES } from '../../core/constants.js';
import { aud, fmtZoned, zonedToDate, todayISO } from '../../core/util.js';

const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export default function Submission({ bid }) {
  const { dispatch, userName } = useP();
  const can = useCan();
  const rec = can('recordSubmission', { bid });
  const planner = can('planSections', { bid });
  const finals = bid.outputs.filter((o) => o.final);
  const [sub, setSub] = useState({ outputIds: finals.map((o) => o.id), at: localNow(), method: bid.channel || '', receipt: '', notes: '' });
  const [out, setOut] = useState({ result: bid.submission ? 'won' : 'withdrawn', at: todayISO(), reasons: [], debrief: '', feedback: '', awardedValue: bid._d.pricing.subtotal || bid.value || '', orals: '' });
  const [nominate, setNominate] = useState({ sectionIds: [], type: 'standard_answer' });
  const gatesOpen = ['g2', 'g3'].filter((g) => bid._d.gates[g].enabled && bid._d.gates[g].status !== 'passed');
  const blockers = [
    ...gatesOpen.map((g) => `Gate ${g.slice(1)} has not passed (WF-08).`),
    ...(!finals.length ? ['No output is marked final yet. Mark the files to submit as final on the Produce tab.'] : []),
    ...(!['produce', 'submit'].includes(bid.stage) && !bid.submission ? [`The bid is at the ${bid.stage} stage; the submission is recorded at Produce or Submit.`] : []),
  ];
  const closeAt = bid.closing?.date ? zonedToDate(bid.closing.date, bid.closing.time, bid.closing.tz) : null;
  const s = bid.submission;
  const late = s && closeAt && new Date(s.at) > closeAt;

  return (
    <div className="stack">
      <div className="split">
        <Card title="Submission" subtitle={bid.closing ? <>Closes <Closing closing={bid.closing} /> ({fmtZoned(closeAt, bid.closing.tz)} client time)</> : 'No closing date recorded'}>
          {s ? (
            <div className="stack">
              <div className={`callout ${late ? 'warn' : 'good'}`}>Submitted <When at={s.at} /> via {s.method || 'the client channel'}{s.receipt ? `, receipt ${s.receipt}` : ''}.{late ? ' The recorded time is after the closing time.' : ''}</div>
              <dl className="kv">
                <dt>Recorded by</dt><dd>{userName(s.by)} <When at={s.recordedAt} /></dd>
                <dt>Files submitted</dt><dd>{s.outputIds.map((id) => bid.outputs.find((o) => o.id === id)?.name).join(', ')}</dd>
                <dt>Read-only snapshot</dt><dd>{bid.snapshots.find((x) => x.id === s.snapshotId)?.label} ({s.snapshotId?.slice(-6)})</dd>
                {s.notes && <><dt>Notes</dt><dd>{s.notes}</dd></>}
              </dl>
              <p className="mini">The submitted files and the snapshot are immutable. Later changes to the bid do not alter what was submitted.</p>
            </div>
          ) : rec ? (
            <div className="stack">
              <Blockers items={blockers} title="Before recording the submission" />
              <Field label="Final files submitted" full>
                {finals.length ? finals.map((o) => <label key={o.id} className="check"><input type="checkbox" checked={sub.outputIds.includes(o.id)} onChange={(e) => setSub({ ...sub, outputIds: e.target.checked ? [...sub.outputIds, o.id] : sub.outputIds.filter((x) => x !== o.id) })} /><span>{o.name} <span className="mini">{OUTPUT_KINDS[o.kind]}</span></span></label>) : <p className="muted small">None yet. <Link to={`/bids/${bid.id}/produce`}>Produce</Link></p>}
              </Field>
              <div className="form-grid">
                <Field label="Submitted at (your local time)"><input type="datetime-local" value={sub.at} onChange={(e) => setSub({ ...sub, at: e.target.value })} /></Field>
                <Field label="Method"><input list="channels" value={sub.method} onChange={(e) => setSub({ ...sub, method: e.target.value })} /><datalist id="channels">{CHANNELS.map((c) => <option key={c} value={c} />)}</datalist></Field>
                <Field label="Receipt number"><input value={sub.receipt} onChange={(e) => setSub({ ...sub, receipt: e.target.value })} placeholder="From the portal’s confirmation" /></Field>
                <Field label="Notes"><input value={sub.notes} onChange={(e) => setSub({ ...sub, notes: e.target.value })} /></Field>
              </div>
              <div><button className="btn btn-primary" disabled={blockers.length > 0 || !sub.outputIds.length} onClick={() => dispatch('bid.submit', { bidId: bid.id, ...sub, at: new Date(sub.at).toISOString() }, { success: 'Submission recorded; team notified' })}>Record submission</button></div>
            </div>
          ) : <p className="muted small">The bid manager records the submission.</p>}
        </Card>

        <Card title="Outcome" subtitle="Win/loss analysis uses the result and the loss reasons">
          {bid.outcome ? (
            <div className="stack">
              <div className="row"><OutcomePill outcome={bid.outcome} /> <span className="small">recorded by {userName(bid.outcome.recordedBy)} <When at={bid.outcome.recordedAt} /></span></div>
              <dl className="kv">
                <dt>Date</dt><dd>{bid.outcome.at}</dd>
                {bid.outcome.awardedValue ? <><dt>Awarded value</dt><dd>{aud(bid.outcome.awardedValue)}</dd></> : null}
                {bid.outcome.reasons?.length ? <><dt>Reasons</dt><dd>{bid.outcome.reasons.join(', ')}</dd></> : null}
                {bid.outcome.debrief && <><dt>Debrief</dt><dd>{bid.outcome.debrief}</dd></>}
                {bid.outcome.feedback && <><dt>Client feedback</dt><dd>{bid.outcome.feedback}</dd></>}
              </dl>
            </div>
          ) : rec && (s || true) ? (
            <div className="stack">
              {!s && <p className="mini">Before submission, only “withdrawn” or “cancelled” can be recorded.</p>}
              <div className="form-grid">
                <Field label="Result"><select value={out.result} onChange={(e) => setOut({ ...out, result: e.target.value })}>{['won', 'lost', 'withdrawn', 'cancelled'].map((r) => <option key={r} value={r} disabled={!s && ['won', 'lost'].includes(r)}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select></Field>
                <Field label="Date"><input type="date" value={out.at} onChange={(e) => setOut({ ...out, at: e.target.value })} /></Field>
                {out.result === 'won' && <Field label="Awarded value (ex GST)"><input type="number" value={out.awardedValue} onChange={(e) => setOut({ ...out, awardedValue: e.target.value })} /></Field>}
              </div>
              {['lost', 'withdrawn', 'cancelled'].includes(out.result) && (
                <Field label={out.result === 'lost' ? 'Loss reasons (at least one)' : 'Reasons'} full>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{LOSS_REASONS.map((r) => <label key={r} className="chip"><input type="checkbox" checked={out.reasons.includes(r)} onChange={(e) => setOut({ ...out, reasons: e.target.checked ? [...out.reasons, r] : out.reasons.filter((x) => x !== r) })} /> {r}</label>)}</div>
                </Field>
              )}
              <Field label="Debrief notes" full><textarea rows={3} value={out.debrief} onChange={(e) => setOut({ ...out, debrief: e.target.value })} /></Field>
              <Field label="Client feedback and scores" full><textarea rows={2} value={out.feedback} onChange={(e) => setOut({ ...out, feedback: e.target.value })} /></Field>
              <div><button className="btn btn-primary" disabled={(!s && ['won', 'lost'].includes(out.result)) || (out.result === 'lost' && !out.reasons.length)} onClick={() => dispatch('bid.outcome', { bidId: bid.id, ...out }, { success: 'Outcome recorded' })}>Record outcome</button></div>
            </div>
          ) : <p className="muted small">The outcome is recorded after submission.</p>}
        </Card>
      </div>

      {bid.outcome && planner && (
        <Card title="Nominate sections for the library" subtitle="Strong sections become reusable content after the librarian reviews and anonymises them (CL-11)">
          <div className="stack" style={{ gap: 4 }}>
            {bid.sections.map((x) => (
              <label key={x.id} className="check">
                <input type="checkbox" disabled={Boolean(x.nominated)} checked={nominate.sectionIds.includes(x.id) || Boolean(x.nominated)} onChange={(e) => setNominate({ ...nominate, sectionIds: e.target.checked ? [...nominate.sectionIds, x.id] : nominate.sectionIds.filter((y) => y !== x.id) })} />
                <span>{x.title}{x.nominated ? <> · <Link to={`/library/${x.nominated}`}>nominated</Link></> : ''}{(x.scores || []).length ? <span className="mini"> · avg score {(x.scores.flatMap((sc) => Object.values(sc.scores)).reduce((a, b) => a + b, 0) / Math.max(1, x.scores.flatMap((sc) => Object.values(sc.scores)).length)).toFixed(1)}</span> : null}</span>
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <select value={nominate.type} onChange={(e) => setNominate({ ...nominate, type: e.target.value })} aria-label="Content type">{LIB_TYPES.filter((t) => ['standard_answer', 'method', 'past_proposal'].includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.one}</option>)}</select>
            <button className="btn btn-primary" disabled={!nominate.sectionIds.length} onClick={() => dispatch('bid.nominate', { bidId: bid.id, ...nominate }, { success: 'Nominated; the librarian has been notified' }).then(() => setNominate({ ...nominate, sectionIds: [] }))}>Nominate {nominate.sectionIds.length || ''} section{nominate.sectionIds.length === 1 ? '' : 's'}</button>
          </div>
        </Card>
      )}
      {bid.stageHistory?.length > 0 && (
        <Card title="Stage history" pad={false}>
          <div className="table-wrap"><table className="table"><tbody>{bid.stageHistory.map((h, i) => <tr key={i}><td className="strong">{h.stage}</td><td><When at={h.at} /></td><td><Person id={h.by} /></td><td className="small">{h.note || ''}</td></tr>)}</tbody></table></div>
        </Card>
      )}
    </div>
  );
}
