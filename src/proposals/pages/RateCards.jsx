import { useState } from 'react';
import { useP, useCan } from '../lib/store.jsx';
import { Card, PageHead, Modal } from '../../components/ui.jsx';
import { Field, When } from '../components/common.jsx';
import { LEVELS } from '../core/constants.js';
import { aud, fmtDate, todayISO } from '../core/util.js';
import { cardValid } from '../core/pricing.js';

const KINDS = { standard: 'Standard rates', panel: 'Panel or standing offer', client: 'Client contract' };

// Rate cards (PR-04): panel or contract rates override standard rates on the bids that choose them.
export default function RateCards() {
  const { view, dispatch } = useP();
  const can = useCan();
  const manage = can('configure') || view.me.roles.includes('commercial');
  const [edit, setEdit] = useState(null);
  const today = todayISO();
  const used = (id) => view.bids.filter((b) => b.pricing?.rateCardId === id && !['closed', 'archived'].includes(b.stage)).length;
  const std = view.rateCards.find((c) => c.kind === 'standard' && cardValid(c, today));
  return (
    <div className="stack">
      <PageHead eyebrow="Content" title="Rate cards" actions={manage && <button className="btn btn-primary" onClick={() => setEdit({ name: '', kind: 'panel', validFrom: today, validTo: '', rates: LEVELS.map((level) => ({ level, rate: std?.rates.find((r) => r.level === level)?.rate || 0 })) })}>Add rate card</button>}>
        Daily sell rates in AUD, excluding GST. A bid takes rates from its chosen panel or contract card, then a card for its client, then standard rates.
      </PageHead>
      <div className="grid g-2">
        {view.rateCards.map((c) => {
          const valid = cardValid(c, today);
          return (
            <Card key={c.id} title={c.name} subtitle={`${KINDS[c.kind] || c.kind}${c.clientId ? ` · ${view.clients.find((x) => x.id === c.clientId)?.name}` : ''}${c.panel ? ` · ${c.panel}` : ''}`}
              actions={<div className="row"><span className={`pill ${valid ? 'good' : c.status === 'retired' ? '' : 'bad'}`}>{valid ? 'Current' : c.status === 'retired' ? 'Retired' : c.validTo && c.validTo < today ? 'Expired' : 'Not yet valid'}</span>{manage && <button className="btn btn-sm" onClick={() => setEdit({ ...c, rates: LEVELS.map((level) => ({ level, rate: c.rates.find((r) => r.level === level)?.rate || '' })) })}>Edit</button>}</div>}>
              <table className="table">
                <tbody>{LEVELS.map((level) => { const r = c.rates.find((x) => x.level === level); const s = std?.rates.find((x) => x.level === level); return <tr key={level}><td>{level}</td><td className="right tabular">{r ? aud(r.rate) : <span className="muted">—</span>}</td><td className="right mini">{r && s && c.kind !== 'standard' ? `${r.rate < s.rate ? '−' : '+'}${Math.abs(Math.round((r.rate / s.rate - 1) * 100))}% vs standard` : ''}</td></tr>; })}</tbody>
              </table>
              <p className="mini" style={{ marginBottom: 0 }}>Valid {fmtDate(c.validFrom)}{c.validTo ? ` to ${fmtDate(c.validTo)}` : ' with no end date'} · used by {used(c.id)} live bid{used(c.id) === 1 ? '' : 's'} · updated <When at={c.updatedAt} /></p>
            </Card>
          );
        })}
      </div>
      {edit && (
        <Modal title={edit.id ? `Edit ${edit.name}` : 'Add a rate card'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={!edit.name.trim()} onClick={() => dispatch('rateCard.upsert', { card: { ...edit, rates: edit.rates.filter((r) => Number(r.rate) > 0) } }, { success: 'Rate card saved' }).then(() => setEdit(null))}>Save</button></>}>
          <div className="form-grid">
            <Field label="Name" full><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Kind"><select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            {edit.kind === 'client' && <Field label="Client"><select value={edit.clientId || ''} onChange={(e) => setEdit({ ...edit, clientId: e.target.value })}><option value="">Choose…</option>{view.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
            {edit.kind === 'panel' && <Field label="Panel or arrangement"><input value={edit.panel || ''} onChange={(e) => setEdit({ ...edit, panel: e.target.value })} /></Field>}
            <Field label="Valid from"><input type="date" value={edit.validFrom || ''} onChange={(e) => setEdit({ ...edit, validFrom: e.target.value })} /></Field>
            <Field label="Valid to"><input type="date" value={edit.validTo || ''} onChange={(e) => setEdit({ ...edit, validTo: e.target.value || null })} /></Field>
            <Field label="Status"><select value={edit.status || 'approved'} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="approved">Approved</option><option value="retired">Retired</option></select></Field>
          </div>
          <table className="table" style={{ marginTop: 10 }}>
            <thead><tr><th>Level</th><th className="right">Daily rate (AUD ex GST)</th></tr></thead>
            <tbody>{edit.rates.map((r, i) => <tr key={r.level}><td>{r.level}</td><td className="right"><input type="number" min="0" value={r.rate} onChange={(e) => setEdit({ ...edit, rates: edit.rates.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)) })} aria-label={`${r.level} rate`} style={{ width: 120, textAlign: 'right' }} /></td></tr>)}</tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
