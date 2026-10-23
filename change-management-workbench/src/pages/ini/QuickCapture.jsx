// Quick capture on a mobile device (STK-034): stakeholder, date, type, summary and sentiment, flagged
// for completion later. Captures made without a connection are kept on the device and sent when the
// connection returns; a client id prevents duplicates if a send is retried.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Spinner, Badge } from '../../ui/core.jsx';
import { RefPicker } from '../../ui/fields.jsx';
import { useIniPage } from '../../lib/hooks.js';
import { fmtDate, options } from '../../lib/format.js';
import { uid } from '../../../shared/util.js';

const OUTBOX = 'cmw.outbox';
const readOutbox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]'); } catch { return []; } };
const writeOutbox = (x) => { try { localStorage.setItem(OUTBOX, JSON.stringify(x)); } catch { /* storage unavailable */ } };

export default function QuickCapture() {
  const { m, ini, api, mut, toast, today, lookups, config, base } = useIniPage();
  const blank = () => ({ stakeholderIds: [], groupIds: [], actualDate: today, engagementType: 'oneToOne', summary: '', sentiment: '' });
  const [d, setD] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [outbox, setOutbox] = useState(readOutbox);
  const [recent, setRecent] = useState([]);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));

  const flush = useCallback(async () => {
    const items = readOutbox();
    if (!items.length || !navigator.onLine) return;
    const left = [];
    for (const it of items) {
      try { await api.op('quickCapture', it); } catch (e) { if (e.status === 0) left.push(it); }
    }
    writeOutbox(left);
    setOutbox(left);
    if (items.length > left.length) { toast.success(`${items.length - left.length} saved capture(s) sent`); await mut.refresh(); }
  }, [api, toast, mut]);
  useEffect(() => {
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [flush]);

  if (!m) return <Spinner />;
  const valid = (d.stakeholderIds.length || d.groupIds.length) && d.summary.trim() && d.actualDate && d.engagementType;
  const submit = async (e) => {
    e.preventDefault();
    const payload = { initiativeId: ini.id, ...d, sentiment: d.sentiment || null, clientId: uid() };
    setBusy(true);
    try {
      const res = await api.op('quickCapture', payload);
      setRecent((r) => [{ ...payload, code: res.engagement?.code }, ...r].slice(0, 5));
      toast.success('Captured. Complete the details later from the engagement log.');
      setD(blank());
      await mut.refresh();
    } catch (err) {
      if (err.status === 0) {
        const next = [...readOutbox(), payload];
        writeOutbox(next);
        setOutbox(next);
        setD(blank());
        toast.warn('No connection: saved on this device and will be sent when you are back online.');
      } else toast.error(err);
    } finally { setBusy(false); }
  };
  const toComplete = m.engagements.filter((e) => e.quickCapture && e.status !== 'cancelled');
  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <PageHead eyebrow={ini.initiative.shortName || ini.initiative.name} title="Quick capture">Record a conversation in a few seconds. It is flagged for you to complete later.</PageHead>
      {outbox.length > 0 && <div className="callout warn small mb-3"><Icon name="clock" size={14} /> {outbox.length} capture(s) waiting to be sent. <button type="button" className="btn btn-xs" onClick={flush}>Send now</button></div>}
      <Card>
        <form onSubmit={submit} className="stack">
          <label className="field"><span>Who did you talk to?</span><RefPicker multiple options={lookups.optionsFor('stakeholder')} value={d.stakeholderIds} onChange={(v) => set('stakeholderIds', v)} placeholder="Start typing a name…" /></label>
          <label className="field"><span>Or which group?</span><RefPicker multiple options={lookups.optionsFor('stakeholderGroup')} value={d.groupIds} onChange={(v) => set('groupIds', v)} /></label>
          <div className="form-grid">
            <label className="field"><span>Date</span><input type="date" value={d.actualDate} max={today} onChange={(e) => set('actualDate', e.target.value)} /></label>
            <label className="field"><span>Type</span><select value={d.engagementType} onChange={(e) => set('engagementType', e.target.value)}>{options('engagementType', config).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          </div>
          <label className="field"><span>What happened?</span><textarea rows={4} value={d.summary} onChange={(e) => set('summary', e.target.value)} placeholder="Key points, concerns, commitments" /></label>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small strong" style={{ color: 'var(--ink-2)', marginBottom: 6 }}>How did they seem? (optional)</legend>
            <div className="seg" role="group" style={{ display: 'flex', flexWrap: 'wrap' }}>
              {options('sentiment', config).map((o) => <button key={o.id} type="button" aria-pressed={d.sentiment === o.id} onClick={() => set('sentiment', d.sentiment === o.id ? '' : o.id)} style={{ flex: '1 1 auto' }}>{o.label}</button>)}
            </div>
          </fieldset>
          <button type="submit" className="btn btn-primary" style={{ padding: '12px 16px', fontSize: 15 }} disabled={!valid || busy}><Icon name="check" />{busy ? 'Saving…' : 'Capture'}</button>
        </form>
      </Card>
      {recent.length > 0 && <Card title="Just captured" flush><ul className="small" style={{ margin: 0, padding: '10px 18px 10px 34px' }}>{recent.map((r) => <li key={r.clientId}>{r.code || 'Saved'} · {fmtDate(r.actualDate)} · {r.summary.slice(0, 60)}</li>)}</ul></Card>}
      <p className="small mt-3"><Badge tone="warning" icon="mobile">{toComplete.length} to complete</Badge> <Link to={`${base}/engagement?tab=log`}>Complete quick captures in the engagement log</Link></p>
    </div>
  );
}
