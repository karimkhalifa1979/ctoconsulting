import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useP } from '../lib/store.jsx';
import { ingestFiles } from '../lib/intake.js';
import { extractRequest } from '../core/extract.js';
import { ACCEPT } from '../gen/parse.js';
import { Card, PageHead } from '../../components/ui.jsx';
import { Field, FileDrop, UserSelect, Tabs } from '../components/common.jsx';
import { hasRole, can } from '../core/permissions.js';
import { CHANNELS, PRICING_MODELS } from '../core/constants.js';
import { TIMEZONES, addDays, todayISO } from '../core/util.js';

const BASE = import.meta.env.BASE_URL;

export default function NewBid() {
  const { view, me, dispatch, putFile, toast, backend } = useP();
  const nav = useNavigate();
  const [mode, setMode] = useState('docs');
  const [busy, setBusy] = useState(null);
  const [docs, setDocs] = useState([]);
  const [ext, setExt] = useState(null);
  const [f, setF] = useState({
    title: '', clientId: '', newClient: '', value: '', date: addDays(todayISO(), 21), time: '14:00', tz: 'Australia/Sydney', workflowId: view.workflows.find((w) => w.default)?.id,
    partnerId: hasRole(me, 'partner') ? me.id : '', bidManagerId: hasRole(me, 'bidManager') ? me.id : '', channel: '', clientRef: '', offering: '', confidential: false, aiEnabled: view.settings.ai?.defaultOn !== false, source: 'manual',
  });
  const allowed = can(backend.state || { users: view.users }, me.id, 'createBid') || me.roles.some((r) => ['admin', 'partner', 'bidManager'].includes(r));
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });

  const onDocs = async (files) => {
    setBusy('Reading documents…');
    try {
      const parsed = await ingestFiles(files, { putFile, onProgress: setBusy });
      const ok = parsed.filter((d) => !d.error);
      for (const d of parsed.filter((x) => x.error)) toast(`${d.name}: ${d.error}`, 'error');
      if (!ok.length) return;
      const all = [...docs, ...ok];
      setDocs(all);
      const e = extractRequest(all.filter((d) => d.type !== 'form').map((d, i) => ({ ...d, id: `tmp${i}` })), { clients: view.clients });
      setExt(e);
      const fl = e.fields;
      setF((prev) => ({
        ...prev, source: 'documents', title: prev.title || fl.title?.value || '', clientRef: prev.clientRef || fl.reference?.value || '', channel: prev.channel || fl.channel?.value || '',
        clientId: prev.clientId || fl.client?.clientId || '', newClient: prev.newClient || (!fl.client?.clientId ? fl.client?.value || '' : ''),
        date: e.closing?.date || prev.date, time: e.closing?.time || prev.time, tz: e.closing?.tz || prev.tz,
      }));
    } finally { setBusy(null); }
  };

  const onEmail = async (files) => {
    setBusy('Reading the email…');
    try {
      const parsed = await ingestFiles(files, { putFile });
      const d = parsed[0];
      if (!d || d.error) { toast(d?.error || 'Could not read the email.', 'error'); return; }
      const subject = d.meta?.subject || d.pages[0]?.paras.find((p) => /^Subject:/.test(p))?.replace(/^Subject:\s*/, '') || '';
      const e = extractRequest([{ ...d, id: 'tmp0' }], { clients: view.clients });
      setDocs([{ ...d, type: 'other' }]);
      setF((prev) => ({ ...prev, source: 'email', title: prev.title || e.fields.title?.value || subject.replace(/^(fw|fwd|re):\s*/i, ''), clientId: prev.clientId || e.fields.client?.clientId || '', clientRef: prev.clientRef || e.fields.reference?.value || '', date: e.closing?.date || prev.date, time: e.closing?.time || prev.time }));
      toast('Details pre-filled from the email. Check them before creating the bid.', 'success');
    } finally { setBusy(null); }
  };

  const create = async () => {
    const r = await dispatch('bid.create', {
      title: f.title, clientId: f.clientId || null, newClient: f.clientId ? null : { name: f.newClient }, value: Number(f.value) || 0,
      closing: f.date ? { date: f.date, time: f.time, tz: f.tz } : null, workflowId: f.workflowId, partnerId: f.partnerId, bidManagerId: f.bidManagerId,
      channel: f.channel, clientRef: f.clientRef, offering: f.offering, confidential: f.confidential, aiEnabled: f.aiEnabled, source: f.source,
    });
    const stored = [];
    for (const d of docs) {
      try {
        const res = await dispatch('doc.add', { bidId: r.bidId, doc: { name: d.name, type: d.type, size: d.size, mime: d.mime, fileId: d.fileId, pages: d.pages, hash: d.hash, warnings: d.warnings, ocr: d.ocr } }, { quiet: true });
        stored.push({ ...d, id: res.docId });
      } catch (e) { toast(`${d.name}: ${e.message}`, 'error'); }
    }
    const reqDocs = stored.filter((d) => ['request', 'addendum', 'qa'].includes(d.type));
    if (reqDocs.length) {
      const e = extractRequest(reqDocs, { clients: view.clients });
      await dispatch('extraction.set', { bidId: r.bidId, extraction: { ...e, mode: 'rules' }, requirements: e.requirements, docIds: reqDocs.map((d) => d.id), replaceCriteria: true }, { quiet: true }).catch(() => {});
    }
    toast(`Created ${r.ref}`, 'success');
    nav(`/bids/${r.bidId}${docs.length ? '/request' : ''}`);
  };

  if (!allowed) return <div className="callout warn">Your role cannot create bids. Partners, bid managers and administrators create bids.</div>;
  return (
    <div className="stack">
      <PageHead eyebrow="Intake" title="New bid">Register an opportunity. Start from the client’s request documents to have the title, client, reference, channel and closing time filled in for you.</PageHead>
      <Tabs tabs={[['docs', 'From request documents'], ['email', 'From a forwarded email'], ['manual', 'Enter details']]} value={mode} onChange={setMode} />
      <div className="split-3-2">
        <Card title="Opportunity details">
          <div className="form-grid">
            <Field label="Opportunity title" full><input type="text" value={f.title} onChange={set('title')} placeholder="e.g. Cloud Migration and Cyber Security Uplift Program" /></Field>
            <Field label="Client">
              <select value={f.clientId} onChange={set('clientId')}><option value="">New client…</option>{[...view.clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </Field>
            {!f.clientId ? <Field label="New client name"><input type="text" value={f.newClient} onChange={set('newClient')} /></Field> : <Field label="Client reference"><input type="text" value={f.clientRef} onChange={set('clientRef')} /></Field>}
            {!f.clientId && <Field label="Client reference"><input type="text" value={f.clientRef} onChange={set('clientRef')} /></Field>}
            <Field label="Estimated value (AUD, ex GST)"><input type="number" min="0" step="10000" value={f.value} onChange={set('value')} /></Field>
            <Field label="Closing date"><input type="date" value={f.date} onChange={set('date')} /></Field>
            <Field label="Closing time"><input type="time" value={f.time} onChange={set('time')} /></Field>
            <Field label="Client’s time zone"><select value={f.tz} onChange={set('tz')}>{TIMEZONES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
            <Field label="Procurement channel"><select value={f.channel} onChange={set('channel')}><option value="">—</option>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Accountable partner"><UserSelect value={f.partnerId} onChange={set('partnerId')} filter={(u) => u.roles.includes('partner')} /></Field>
            <Field label="Bid manager"><UserSelect value={f.bidManagerId} onChange={set('bidManagerId')} filter={(u) => u.roles.includes('bidManager') || u.roles.includes('partner')} /></Field>
            <Field label="Workflow template"><select value={f.workflowId} onChange={set('workflowId')}>{view.workflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
            <Field label="Offering"><select value={f.offering} onChange={set('offering')}><option value="">—</option>{view.taxonomy.offerings.map((o) => <option key={o}>{o}</option>)}</select></Field>
            <label className="check full"><input type="checkbox" checked={f.confidential} onChange={set('confidential')} /><span>Confidential bid (you can add an ethical wall after creating it)</span></label>
            <label className="check full"><input type="checkbox" checked={f.aiEnabled} onChange={set('aiEnabled')} /><span>Allow AI assistance on this bid (switch off where the client prohibits AI)</span></label>
          </div>
          <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => nav(-1)}>Cancel</button>
            <button className="btn btn-primary" disabled={!f.title || (!f.clientId && !f.newClient) || !f.partnerId || !f.bidManagerId} onClick={create}>Create bid{docs.length ? ` with ${docs.length} document${docs.length === 1 ? '' : 's'}` : ''}</button>
          </div>
        </Card>
        <div className="stack">
          {mode === 'docs' && (
            <Card title="Client request documents" subtitle="PDF, Word, Excel, PowerPoint, emails or a ZIP pack, up to 200 MB per bid">
              <FileDrop accept={ACCEPT} onFiles={onDocs} busy={busy} label="Drop the request pack here" />
              {docs.length > 0 && <ul className="small" style={{ paddingLeft: 18 }}>{docs.map((d) => <li key={d.name}>{d.name} <span className="mini">· {d.type} · {d.pages.length} pages{d.warnings.length ? ` · ${d.warnings[0]}` : ''}</span></li>)}</ul>}
              {ext && <div className="callout" style={{ marginTop: 10 }}>Found {ext.requirements.length} requirements, {ext.dates.length} key dates and {ext.criteria.length} evaluation criteria. You will confirm them on the Request tab after the bid is created.</div>}
              <p className="mini" style={{ marginTop: 10 }}>No request to hand? Try the fictitious samples: <a className="dl" href={`${BASE}samples/HCC-RFQ-2026-19 Customer Portal Discovery.pdf`} download>Harbourside RFQ (PDF)</a> · <a className="dl" href={`${BASE}samples/SRWA-RFQ-2026-031 Request for Quote.pdf`} download>Southern Rivers RFQ (PDF)</a></p>
            </Card>
          )}
          {mode === 'email' && (
            <Card title="Forwarded email" subtitle="Drop an email (.eml or .msg) forwarded to the bid mailbox">
              <FileDrop accept=".eml,.msg" multiple={false} onFiles={onEmail} busy={busy} label="Drop an .eml or .msg file" />
              <p className="mini" style={{ marginTop: 10 }}>In production, emails forwarded to the bid mailbox create draft bids automatically through Microsoft Graph (CR-10).</p>
            </Card>
          )}
          {mode === 'manual' && (
            <Card title="What happens next">
              <ol className="small" style={{ paddingLeft: 18, lineHeight: 1.8 }}>
                <li>The bid starts at Intake. Upload the client’s request documents.</li>
                <li>Requirements, dates and evaluation criteria are extracted for you to confirm.</li>
                <li>The partner records the bid/no-bid decision at gate 1.</li>
                <li>Milestones are back-scheduled from the closing date.</li>
              </ol>
              <p className="mini">Pricing models available: {PRICING_MODELS.map((m) => m.label.toLowerCase()).join(', ')}.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
