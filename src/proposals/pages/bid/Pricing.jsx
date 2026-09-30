import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP, useCan } from '../../lib/store.jsx';
import { Card, Drawer, Modal } from '../../../components/ui.jsx';
import { Avatar, Icon, Field, Confirm, download, MIME, safeFile } from '../../components/common.jsx';
import { computePricing, rateFor } from '../../core/pricing.js';
import { LEVELS, PRICING_MODELS, CLEARANCES } from '../../core/constants.js';
import { aud, uid, todayISO, fmtDate } from '../../core/util.js';

const CLEAR_RANK = Object.fromEntries(CLEARANCES.map((c, i) => [c, i]));
const AVAIL = { pending: ['warn', 'Awaiting confirmation'], confirmed: ['good', 'Confirmed'], declined: ['bad', 'Declined'] };
const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);

// Consultant search (PR-01): skill, certification, clearance, sector and availability.
function FindPeople({ bid, onPick, onClose, taken }) {
  const { view } = useP();
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const [clearance, setClearance] = useState('None');
  const [avail, setAvail] = useState(false);
  const [level, setLevel] = useState('');
  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/[,\s]+/).filter(Boolean);
    return view.consultants.map((c) => {
      const hay = [c.name, c.role, ...(c.skills || []), ...(c.certifications || []), ...(c.sectors || []), c.bio].join(' ').toLowerCase();
      const hits = terms.filter((t) => hay.includes(t)).length;
      const skillHits = terms.filter((t) => [...(c.skills || []), ...(c.certifications || [])].some((s) => s.toLowerCase().includes(t))).length;
      return { c, score: hits + skillHits + ((c.sectors || []).includes(bid.sector) ? 0.5 : 0) };
    }).filter(({ c, score }) => (!terms.length || score >= terms.length)
      && (!sector || (c.sectors || []).includes(sector))
      && (CLEAR_RANK[c.clearance || 'None'] >= CLEAR_RANK[clearance])
      && (!avail || c.availability?.status !== 'unavailable')
      && (!level || c.level === level))
      .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));
  }, [q, sector, clearance, avail, level, view.consultants, bid.sector]);
  return (
    <Drawer title="Find consultants" subtitle="Search by skill, certification, clearance, sector and availability" onClose={onClose}>
      <div className="stack">
        <input className="searchbox" autoFocus placeholder="Skills or certifications, e.g. Azure, Essential Eight, CISSP" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Skills or certifications" />
        <div className="form-grid">
          <Field label="Sector"><select value={sector} onChange={(e) => setSector(e.target.value)}><option value="">Any sector</option>{view.taxonomy.sectors.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Minimum clearance"><select value={clearance} onChange={(e) => setClearance(e.target.value)}>{CLEARANCES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Level"><select value={level} onChange={(e) => setLevel(e.target.value)}><option value="">Any level</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></Field>
          <Field label="Availability"><label className="check"><input type="checkbox" checked={avail} onChange={(e) => setAvail(e.target.checked)} /><span>Hide unavailable people</span></label></Field>
        </div>
        <div className="mini">{results.length} consultant{results.length === 1 ? '' : 's'}</div>
        {results.map(({ c }) => (
          <div key={c.id} className="lib-hit">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row"><Avatar name={c.name} /><div><div className="h">{c.name}</div><div className="mini">{c.role} · {c.level} · {c.years} years · clearance {c.clearance}</div></div></div>
              <button className="btn btn-sm btn-primary" disabled={taken.includes(c.id)} onClick={() => onPick(c)}>{taken.includes(c.id) ? 'In team' : 'Propose'}</button>
            </div>
            <p>{(c.skills || []).join(' · ')}</p>
            <div className="mini">{(c.certifications || []).join(', ')}{c.sectors?.length ? ` · ${c.sectors.join(', ')}` : ''}</div>
            <div className="mini" style={{ marginTop: 4 }}>
              <span className={`pill ${c.availability?.status === 'available' ? 'good' : c.availability?.status === 'partial' ? 'warn' : 'bad'}`}>{c.availability?.status === 'available' ? 'Available' : c.availability?.status === 'partial' ? `${c.availability.pct}% available` : 'Unavailable'}</span>
              {c.availability?.from && c.availability.status !== 'available' ? ` from ${fmtDate(c.availability.from)}` : ''}{c.availability?.note ? ` · ${c.availability.note}` : ''}
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  );
}

function Register({ title, subtitle, items, onChange, columns, disabled, addLabel }) {
  const set = (i, k, v) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <Card title={title} subtitle={subtitle} pad={false} actions={!disabled && <button className="btn btn-sm" onClick={() => onChange([...items, { id: uid('rg'), ...Object.fromEntries(columns.map((c) => [c.key, c.default || ''])) }])}>{addLabel}</button>}>
      {items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr>{columns.map((c) => <th key={c.key} style={{ width: c.width }}>{c.label}</th>)}<th /></tr></thead>
            <tbody>
              {items.map((x, i) => (
                <tr key={x.id}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      {c.options ? <select value={x[c.key] || ''} disabled={disabled} onChange={(e) => set(i, c.key, e.target.value)} aria-label={c.label}>{c.options.map((o) => <option key={o}>{o}</option>)}</select>
                        : <textarea rows={c.rows || 2} value={x[c.key] || ''} disabled={disabled} onChange={(e) => set(i, c.key, e.target.value)} aria-label={c.label} style={{ width: '100%' }} />}
                    </td>
                  ))}
                  <td>{!disabled && <button className="icon-btn" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted small" style={{ padding: '0 18px 14px' }}>None recorded.</p>}
    </Card>
  );
}

export default function Pricing({ bid }) {
  const { view, me, dispatch, toast, client, getFile } = useP();
  const can = useCan();
  const [staffing, setStaffing] = useState(bid.staffing || []);
  const [pricing, setPricing] = useState(bid.pricing);
  const [dirty, setDirty] = useState(false);
  const [finding, setFinding] = useState(false);
  const [reopen, setReopen] = useState(null);
  const [cvModal, setCvModal] = useState(false);
  const [busy, setBusy] = useState(null);
  useEffect(() => { if (!dirty) { setStaffing(bid.staffing || []); setPricing(bid.pricing); } }, [bid.staffing, bid.pricing]); // eslint-disable-line react-hooks/exhaustive-deps

  const planner = can('planSections', { bid });
  const seeCost = bid._d.seeCost;
  const commercial = seeCost && (me.roles.includes('commercial') || me.roles.includes('partner'));
  const locked = ['g2', 'g3'].find((g) => ['pending', 'passed'].includes(bid.gates[g]?.status)) || null;
  const closed = Boolean(bid.submission) || ['closed', 'archived'].includes(bid.stage);
  const canEdit = planner && !locked && !closed;
  const canRegisters = (planner || commercial) && !closed;
  const draftBid = useMemo(() => ({ ...bid, staffing, pricing }), [bid, staffing, pricing]);
  const p = useMemo(() => computePricing(view, draftBid), [view, draftBid]);
  const threshold = bid._d.marginThreshold;
  const cardsFor = view.rateCards.filter((c) => c.status !== 'retired' && (c.kind !== 'client' || c.clientId === bid.clientId));

  const setLine = (i, patch) => { setStaffing(staffing.map((l, j) => (j === i ? { ...l, ...patch } : l))); setDirty(true); };
  const setP = (patch) => { setPricing({ ...pricing, ...patch }); setDirty(true); };
  const addPerson = (c) => {
    setStaffing([...staffing, { id: uid('st'), consultantId: c.id, role: c.role.split(',')[0], level: c.level, days: 20, include: true, keyPerson: false }]);
    setDirty(true);
    toast(`${c.name} added. Save to ask them to confirm availability.`, 'success');
  };
  const addRole = () => { setStaffing([...staffing, { id: uid('st'), consultantId: null, role: 'Consultant (to be named)', level: 'Consultant', days: 10, include: true }]); setDirty(true); };

  const save = async () => {
    const staffChanged = JSON.stringify(staffing) !== JSON.stringify(bid.staffing || []);
    const patch = {};
    for (const k of ['model', 'rateCardId', 'discountPct', 'contingencyPct', 'expenses', 'milestones', 'cap', 'retainerMonths', 'assumptions', 'risks', 'departures', 'notes']) {
      if (JSON.stringify(pricing[k]) !== JSON.stringify(bid.pricing[k])) patch[k] = pricing[k];
    }
    try {
      if (staffChanged) await dispatch('staffing.set', { bidId: bid.id, staffing, reopen: reopen?.confirmed }, { quiet: true });
      if (Object.keys(patch).length) await dispatch('pricing.update', { bidId: bid.id, patch, reopen: reopen?.confirmed }, { quiet: true });
      setDirty(false);
      toast('Team and pricing saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const excel = async (kind) => {
    setBusy(kind);
    try {
      const mod = await import('../../gen/xlsx.js');
      const cl = client(bid.clientId);
      if (kind === 'schedule') {
        const bytes = await mod.pricingWorkbook(view, bid, cl, { includeCost: false });
        download(bytes, `${safeFile(bid.ref)}_pricing_schedule.xlsx`, MIME.xlsx);
      } else if (kind === 'internal') {
        const bytes = await mod.pricingWorkbook(view, bid, cl, { includeCost: true });
        download(bytes, `${safeFile(bid.ref)}_pricing_INTERNAL_margin.xlsx`, MIME.xlsx);
      } else {
        const doc = bid.documents.find((d) => d.id === kind);
        const f = await getFile(doc.fileId);
        if (!f) throw new Error('The client’s file is not available in this browser.');
        const { bytes, report } = await mod.fillClientPricing(f.bytes, view, bid);
        download(bytes, `${safeFile(doc.name.replace(/\.xlsx$/i, ''))} - CTO Consulting.xlsx`, MIME.xlsx);
        toast(`Filled “${report.sheet}”: ${report.filled} pre-listed row${report.filled === 1 ? '' : 's'} matched, ${report.added} added.${report.unmatched.length ? ` Not matched: ${report.unmatched.join(', ')}.` : ''}`, 'success');
      }
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const xlsxDocs = bid.documents.filter((d) => /\.xlsx$/i.test(d.name) && d.fileId && /pric|schedule|rate/i.test(d.name));

  const lineRate = (l) => rateFor(view, draftBid, l);
  const totalDays = staffing.filter((l) => l.include !== false).reduce((n, l) => n + (Number(l.days) || 0), 0);
  const model = PRICING_MODELS.find((m) => m.id === pricing.model) || PRICING_MODELS[0];

  return (
    <div className="stack">
      {locked && !reopen?.confirmed && (
        <div className="lock-banner locked"><Icon name="lock" size={16} /><span style={{ flex: 1 }}>Pricing is locked because gate {locked.slice(1)} {bid.gates[locked]?.status === 'passed' ? 'has passed' : 'is awaiting approval'}. The registers can still be edited. Changing the price reopens commercial approval.</span>
          {planner && !closed && <button className="btn btn-sm" onClick={() => setReopen({ open: true })}>Change pricing…</button>}</div>
      )}
      {closed && <div className="callout">The bid has been submitted. Team and pricing are read-only.</div>}
      {dirty && <div className="sticky-actions" style={{ justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 5 }}><span className="small">You have unsaved changes to the team or pricing.</span><div className="row"><button className="btn" onClick={() => { setStaffing(bid.staffing || []); setPricing(bid.pricing); setDirty(false); }}>Discard</button><button className="btn btn-primary" onClick={save}>Save changes</button></div></div>}

      <Card title="Proposed team" subtitle={`${staffing.length} line${staffing.length === 1 ? '' : 's'} · ${totalDays} days${pricing.model === 'retainer' ? ' per month' : ''}. Named consultants are asked to confirm their availability.`} pad={false}
        actions={(canEdit || reopen?.confirmed) && <div className="row"><button className="btn btn-sm" onClick={addRole}>Add unnamed role</button><button className="btn btn-sm btn-primary" onClick={() => setFinding(true)}><Icon name="search" size={14} />Find consultants</button></div>}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Person</th><th>Role on this bid</th><th>Level</th><th className="right">Days</th><th className="right">Day rate</th><th className="right">Amount</th>{seeCost && <th className="right">Cost</th>}<th>Availability</th><th>Key</th><th>In price</th><th /></tr></thead>
            <tbody>
              {staffing.map((l, i) => {
                const c = view.consultants.find((x) => x.id === l.consultantId);
                const r = lineRate(l);
                const pl = p.lines.find((x) => x.id === l.id);
                const ed = canEdit || reopen?.confirmed;
                return (
                  <tr key={l.id} style={l.include === false ? { opacity: 0.5 } : undefined}>
                    <td>{c ? <Link to={`/consultants/${c.id}`} className="row" style={{ gap: 7, flexWrap: 'nowrap' }}><Avatar name={c.name} size="sm" />{c.name}</Link> : <span className="muted">To be named</span>}</td>
                    <td><input value={l.role} disabled={!ed} onChange={(e) => setLine(i, { role: e.target.value })} aria-label="Role" style={{ minWidth: 180 }} /></td>
                    <td><select value={l.level} disabled={!ed} onChange={(e) => setLine(i, { level: e.target.value })} aria-label="Level">{LEVELS.map((x) => <option key={x}>{x}</option>)}</select></td>
                    <td className="right"><input type="number" min="0" value={l.days} disabled={!ed} onChange={(e) => setLine(i, { days: e.target.value })} aria-label="Days" style={{ width: 70, textAlign: 'right' }} /></td>
                    <td className="right tabular" title={r.source}>
                      {ed ? <input type="number" min="0" placeholder={String(r.rate)} value={l.rateOverride || ''} onChange={(e) => setLine(i, { rateOverride: e.target.value })} aria-label="Rate override" style={{ width: 90, textAlign: 'right' }} /> : aud(r.rate)}
                      <div className="mini rate-src" title={l.rateOverride ? 'Manual override' : r.source}>{l.rateOverride ? 'Manual override' : r.source}</div>
                    </td>
                    <td className="right tabular">{aud(pl?.sell || 0)}</td>
                    {seeCost && <td className="right tabular">{pl?.cost != null ? aud(pl.cost) : '—'}<div className="mini">{pl?.costRate ? `${aud(pl.costRate)}/day` : ''}</div></td>}
                    <td>{l.consultantId ? <><span className={`pill ${AVAIL[l.availability]?.[0] || ''}`}>{AVAIL[l.availability]?.[1] || 'Not asked yet'}</span>{l.availabilityNote && <div className="mini">{l.availabilityNote}</div>}{c?.availability?.status && c.availability.status !== 'available' && <div className="mini" style={{ color: 'var(--st-critical)' }}>Profile: {c.availability.status === 'partial' ? `${c.availability.pct}% available` : 'unavailable'}{c.availability.from ? ` from ${fmtDate(c.availability.from)}` : ''}</div>}</> : <span className="muted small">—</span>}</td>
                    <td><input type="checkbox" checked={Boolean(l.keyPerson)} disabled={!ed} onChange={(e) => setLine(i, { keyPerson: e.target.checked })} aria-label="Key person" /></td>
                    <td><input type="checkbox" checked={l.include !== false} disabled={!ed} onChange={(e) => setLine(i, { include: e.target.checked })} aria-label="Include in price" /></td>
                    <td>{ed && <button className="icon-btn" aria-label={`Remove ${c?.name || l.role}`} onClick={() => { setStaffing(staffing.filter((_, j) => j !== i)); setDirty(true); }}>✕</button>}</td>
                  </tr>
                );
              })}
              {!staffing.length && <tr><td colSpan={11} className="muted small">No team yet. Find consultants by skill, clearance and availability, or add unnamed roles.</td></tr>}
            </tbody>
          </table>
        </div>
        {staffing.some((l) => l.consultantId) && <div className="row" style={{ padding: '10px 18px' }}><button className="btn btn-sm" onClick={() => setCvModal(true)}>Generate CV pack…</button><span className="mini">CVs are generated from each consultant’s structured profile in the format the client requires (PR-02).</span></div>}
      </Card>

      <div className="split-3-2">
        <div className="stack">
          <Card title="Pricing model" subtitle={model.desc}>
            <div className="form-grid">
              <Field label="Model"><select value={pricing.model} disabled={!(canEdit || reopen?.confirmed)} onChange={(e) => setP({ model: e.target.value })}>{PRICING_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></Field>
              <Field label="Rate card" hint="Panel or contract rates override standard rates (PR-04)"><select value={pricing.rateCardId || ''} disabled={!(canEdit || reopen?.confirmed)} onChange={(e) => setP({ rateCardId: e.target.value || null })}><option value="">Standard rates</option>{cardsFor.map((c) => <option key={c.id} value={c.id}>{c.name}{c.validTo && c.validTo < todayISO() ? ' (expired)' : ''}</option>)}</select></Field>
              <Field label="Discount (%)"><input type="number" min="0" max="100" step="0.5" value={pricing.discountPct || 0} disabled={!(canEdit || reopen?.confirmed)} onChange={(e) => setP({ discountPct: Number(e.target.value) })} /></Field>
              {pricing.model === 'fixed' && <Field label="Contingency (%)" hint="Added to the fixed price for delivery risk"><input type="number" min="0" max="50" step="0.5" value={pricing.contingencyPct || 0} disabled={!(canEdit || reopen?.confirmed)} onChange={(e) => setP({ contingencyPct: Number(e.target.value) })} /></Field>}
              {pricing.model === 'capped' && <Field label="Cap (AUD ex GST)"><input type="number" min="0" step="1000" value={pricing.cap || ''} disabled={!(canEdit || reopen?.confirmed)} onChange={(e) => setP({ cap: Number(e.target.value) || null })} /></Field>}
              {pricing.model === 'retainer' && <Field label="Term (months)"><input type="number" min="1" max="60" value={pricing.retainerMonths || 12} disabled={!(canEdit || reopen?.confirmed)} onChange={(e) => setP({ retainerMonths: Number(e.target.value) })} /></Field>}
            </div>
            {pricing.model === 'fixed' && (
              <div style={{ marginTop: 14 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><strong className="small">Payment milestones</strong>{(canEdit || reopen?.confirmed) && <button className="btn btn-sm" onClick={() => setP({ milestones: [...(pricing.milestones || []), { id: uid('mi'), label: '', pct: 0 }] })}>Add milestone</button>}</div>
                <table className="table"><thead><tr><th>Milestone</th><th className="right">% of fixed price</th><th className="right">Amount</th><th /></tr></thead><tbody>
                  {(pricing.milestones || []).map((m, i) => (
                    <tr key={m.id}>
                      <td><input value={m.label} disabled={!(canEdit || reopen?.confirmed)} onChange={(e) => setP({ milestones: pricing.milestones.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} aria-label="Milestone" style={{ width: '100%' }} /></td>
                      <td className="right"><input type="number" min="0" max="100" value={m.pct} disabled={!(canEdit || reopen?.confirmed)} onChange={(e) => setP({ milestones: pricing.milestones.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) } : x)) })} aria-label="Percent" style={{ width: 70, textAlign: 'right' }} /></td>
                      <td className="right tabular">{aud(p.milestones[i]?.amount || 0)}</td>
                      <td>{(canEdit || reopen?.confirmed) && <button className="icon-btn" aria-label="Remove milestone" onClick={() => setP({ milestones: pricing.milestones.filter((_, j) => j !== i) })}>✕</button>}</td>
                    </tr>
                  ))}
                </tbody></table>
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><strong className="small">Expenses (ex GST)</strong>{(canEdit || reopen?.confirmed) && <button className="btn btn-sm" onClick={() => setP({ expenses: [...(pricing.expenses || []), { id: uid('ex'), label: '', amount: 0 }] })}>Add expense</button>}</div>
              {(pricing.expenses || []).length ? <table className="table"><tbody>
                {pricing.expenses.map((x, i) => (
                  <tr key={x.id}>
                    <td><input value={x.label} disabled={!(canEdit || reopen?.confirmed)} onChange={(e) => setP({ expenses: pricing.expenses.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} aria-label="Expense" style={{ width: '100%' }} /></td>
                    <td className="right"><input type="number" min="0" value={x.amount} disabled={!(canEdit || reopen?.confirmed)} onChange={(e) => setP({ expenses: pricing.expenses.map((y, j) => (j === i ? { ...y, amount: Number(e.target.value) } : y)) })} aria-label="Amount" style={{ width: 110, textAlign: 'right' }} /></td>
                    <td>{(canEdit || reopen?.confirmed) && <button className="icon-btn" aria-label="Remove expense" onClick={() => setP({ expenses: pricing.expenses.filter((_, j) => j !== i) })}>✕</button>}</td>
                  </tr>
                ))}
              </tbody></table> : <p className="muted small">No expenses.</p>}
            </div>
          </Card>
        </div>
        <div className="stack">
          <Card title="Price" subtitle="AUD. GST is shown separately (PR-04).">
            <dl className="kv">
              <dt>Labour ({p.days} days{p.model === 'retainer' ? '/month' : ''})</dt><dd className="tabular">{aud(p.labour)}{p.model === 'retainer' ? ' per month' : ''}</dd>
              {p.discount > 0 && <><dt>Discount ({pricing.discountPct}%)</dt><dd className="tabular">−{aud(p.discount)}</dd></>}
              {p.model === 'retainer' && <><dt>Retainer ({p.months} months)</dt><dd className="tabular">{aud(p.labourNet)}</dd></>}
              {p.contingency > 0 && <><dt>Contingency ({pricing.contingencyPct}%)</dt><dd className="tabular">{aud(p.contingency)}</dd></>}
              <dt>Professional fees</dt><dd className="tabular">{aud(p.fees)}</dd>
              {p.expenses > 0 && <><dt>Expenses</dt><dd className="tabular">{aud(p.expenses)}</dd></>}
              <dt className="strong">Total ex GST</dt><dd className="tabular strong">{aud(p.subtotal)}</dd>
              <dt>GST ({Math.round(p.gstRate * 100)}%)</dt><dd className="tabular">{aud(p.gst)}</dd>
              <dt className="strong">Total inc GST</dt><dd className="tabular strong">{aud(p.total)}</dd>
              {p.model === 'capped' && <><dt>Not-to-exceed cap</dt><dd className="tabular">{aud(p.cap)}</dd></>}
            </dl>
            {bid.value > 0 && <p className="mini" style={{ marginBottom: 0 }}>Estimated value at intake: {aud(bid.value)} ({p.subtotal > bid.value ? `${aud(p.subtotal - bid.value)} above` : `${aud(bid.value - p.subtotal)} below`}).</p>}
            {p.issues.length > 0 && <div className="callout warn" style={{ marginTop: 10 }}>{p.issues.join(' ')}</div>}
          </Card>
          {seeCost ? (
            <Card title="Margin (internal only)" subtitle="Visible to partners, commercial approvers and administrators (PR-08). Never included in client outputs.">
              <div className="stat-row">
                <div><div className="mini">Labour cost</div><div className="num-big">{aud(p.labourCost)}</div></div>
                <div><div className="mini">Margin</div><div className="num-big" style={{ color: p.marginPct !== null && p.marginPct * 100 < threshold ? 'var(--st-critical)' : undefined }}>{pct(p.marginPct)}</div></div>
              </div>
              <div className="hbar" style={{ marginTop: 12, position: 'relative' }}><span style={{ width: `${Math.max(0, Math.min(100, (p.marginPct || 0) * 100 / 0.6))}%`, background: p.marginPct !== null && p.marginPct * 100 < threshold ? 'var(--st-critical)' : undefined }} /></div>
              <p className="small" style={{ marginBottom: 0 }}>Threshold {threshold}%. {p.marginPct !== null && p.marginPct * 100 < threshold ? <strong>Below threshold: gate 2 needs an additional commercial approval.</strong> : 'At or above threshold: the standard commercial approval applies.'}</p>
            </Card>
          ) : <div className="callout small">Cost rates and margin are restricted to partners, commercial approvers and administrators (PR-08).</div>}
          <Card title="Pricing schedule" subtitle="Excel, in CTO Consulting’s format or the client’s own (PR-07)">
            <div className="stack" style={{ gap: 8 }}>
              <button className="btn" disabled={busy || !staffing.length} onClick={() => excel('schedule')}>{busy === 'schedule' ? 'Building…' : 'Download pricing schedule (.xlsx)'}</button>
              {xlsxDocs.map((d) => <button key={d.id} className="btn" disabled={busy || !staffing.length} onClick={() => excel(d.id)}>{busy === d.id ? 'Filling…' : `Fill the client’s “${d.name}”`}</button>)}
              {seeCost && <button className="btn btn-ghost" disabled={busy || !staffing.length} onClick={() => excel('internal')}>Internal workbook with cost and margin</button>}
              {!xlsxDocs.length && <p className="mini" style={{ margin: 0 }}>To fill the client’s own pricing schedule, add their Excel file to the bid’s documents on the Request tab.</p>}
            </div>
          </Card>
        </div>
      </div>

      <Register title="Assumptions" subtitle="Carried into the proposal’s commercial section (PR-06)" items={pricing.assumptions || []} disabled={!canRegisters} addLabel="Add assumption"
        onChange={(v) => setP({ assumptions: v })} columns={[{ key: 'text', label: 'Assumption' }]} />
      <Register title="Commercial risks" items={pricing.risks || []} disabled={!canRegisters} addLabel="Add risk"
        onChange={(v) => setP({ risks: v })} columns={[{ key: 'text', label: 'Risk', width: '40%' }, { key: 'rating', label: 'Rating', options: ['Low', 'Medium', 'High'], default: 'Medium', width: 110 }, { key: 'mitigation', label: 'Mitigation' }]} />
      <Register title="Departures from the client’s terms" items={pricing.departures || []} disabled={!canRegisters} addLabel="Add departure"
        onChange={(v) => setP({ departures: v })} columns={[{ key: 'clause', label: 'Clause', width: 170, rows: 1 }, { key: 'departure', label: 'Proposed departure' }, { key: 'rationale', label: 'Rationale' }]} />

      {finding && <FindPeople bid={bid} taken={staffing.map((l) => l.consultantId).filter(Boolean)} onPick={addPerson} onClose={() => setFinding(false)} />}
      {reopen?.open && !reopen.confirmed && (
        <Confirm title="Change locked pricing?" confirmLabel="Unlock pricing" danger onClose={() => setReopen((r) => (r?.confirmed ? r : null))} onConfirm={() => { setReopen({ confirmed: true }); toast('Pricing unlocked for editing. Saving will reopen commercial approval.', 'info'); }}>
          <p>Pricing was locked when gate {locked?.slice(1)} was requested. Saving a change reopens gate 2{bid.gates.g3?.status !== 'not_requested' ? ' and gate 3' : ''}: existing commercial approvals are voided and approvers are notified.</p>
        </Confirm>
      )}
      {cvModal && <CvPack bid={bid} staffing={staffing} onClose={() => setCvModal(false)} />}
    </div>
  );
}

function CvPack({ bid, staffing, onClose }) {
  const { view, client, toast } = useP();
  const [format, setFormat] = useState(bid.cvFormat || 'cto');
  const [busy, setBusy] = useState(false);
  const people = staffing.filter((l) => l.consultantId && l.include !== false).map((l) => ({ line: l, consultant: view.consultants.find((c) => c.id === l.consultantId) })).filter((x) => x.consultant);
  const stale = people.filter((x) => x.consultant.updatedAt && (Date.now() - Date.parse(x.consultant.updatedAt)) / 86400000 > 365);
  const go = async () => {
    setBusy(true);
    try {
      const { buildCvPack } = await import('../../gen/cv.js');
      const cl = client(bid.clientId);
      const bytes = await buildCvPack(people, format, { title: `Curricula vitae — ${bid.title}`, client: cl?.name || '', header: `${bid.ref} · Curricula vitae` });
      download(bytes, `${safeFile(bid.ref)}_CVs_${format}.docx`, MIME.docx);
      onClose();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Generate CV pack" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !people.length} onClick={go}>{busy ? 'Generating…' : `Generate ${people.length} CV${people.length === 1 ? '' : 's'}`}</button></>}>
      <Field label="Format">
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="cto">CTO Consulting standard (two pages)</option>
          <option value="short">Short profile (half a page each)</option>
          <option value="gov">Government panel format (capability against requirements)</option>
        </select>
      </Field>
      <ul className="small">{people.map((x) => <li key={x.line.id}>{x.consultant.name} — {x.line.role}</li>)}</ul>
      {stale.length > 0 && <div className="callout warn small">Profiles not updated in 12 months: {stale.map((x) => x.consultant.name).join(', ')}. Ask them to review their profile before submission (CL-05).</div>}
    </Modal>
  );
}

