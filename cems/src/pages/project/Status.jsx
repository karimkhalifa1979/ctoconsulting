// Weekly status update (STS-001..011, UC-02): ratings by dimension against the calculated ratings,
// narrative rolled forward from last week, system data, submission and review.
import { useEffect, useState } from 'react';
import { useProject } from './Project.jsx';
import { useApi } from '../../lib/hooks.js';
import { post, patch } from '../../lib/api.js';
import { Approvals } from '../../components/Record.jsx';
import { Card, Table, Rag, Status, Badge, DT, Alert, Empty, Field, Money, useAction, useDialog, Loading } from '../../components/ui.jsx';
import { RagStrip } from '../../components/charts.jsx';
import { DIMENSIONS, RAGS, RAG_RANK } from '../../../shared/rag.js';
import { fmtDate, fmtMoneyShort, fmtPct } from '../../../shared/format.js';
import Icon from '../../components/Icon.jsx';

const NARRATIVE = [
  ['executive_summary', 'Executive summary', true],
  ['achievements', 'Achievements this period', true],
  ['next_period', 'Planned for next period', true],
  ['decisions_required', 'Decisions required', false],
  ['escalations', 'Escalations', false],
  ['client_actions', 'Actions for the client', false],
];
const DIMS = [...DIMENSIONS, { key: 'overall', label: 'Overall' }];

export default function StatusUpdates() {
  const { id, d, can, reload: reloadProject } = useProject();
  const list = useApi(`/api/projects/${id}/status`);
  const [sel, setSel] = useState(null);
  const [nonce, setNonce] = useState(0);
  const [run, busy] = useAction();
  const updates = list.data || [];
  const current = sel || updates[0]?.id || null;
  const start = async () => {
    const su = await run(() => post(`/api/projects/${id}/status/open`), 'Update opened with last week’s narrative carried forward');
    if (su) { await list.reload(); setSel(su.id); setNonce((n) => n + 1); }
  };
  return (
    <div className="split-nav">
      <div className="stack">
        <Card title="Updates" flush actions={can('status', 'C') && <button className="btn btn-sm btn-primary" disabled={busy} onClick={start}><Icon name="plus" /> This week</button>}>
          {list.loading && !list.data ? <Loading /> : !updates.length ? <Empty>No updates yet.</Empty> : (
            <ul className="list selectable">
              {updates.map((u) => (
                <li key={u.id} className={u.id === current ? 'active' : ''} onClick={() => setSel(u.id)}>
                  <Rag v={u.ratings?.overall?.rag} sm />
                  <div className="grow">
                    <div className="strong">Week ending {fmtDate(u.period_end)}{u.version > 1 ? ` · v${u.version}` : ''}</div>
                    <div className="tiny muted">{u.submitted_at ? `Submitted ${fmtDate(u.submitted_at.slice(0, 10))}` : 'Not submitted'}{u.late ? ' · late' : ''}{u.overrides?.length ? ` · ${u.overrides.length} override${u.overrides.length > 1 ? 's' : ''}` : ''}</div>
                  </div>
                  <Status v={u.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        {d.history?.length > 0 && (
          <Card title="Trend" sub="Overall rating by period (STS-007).">
            <RagStrip items={d.history} />
          </Card>
        )}
      </div>
      <div>
        {current ? <Editor key={`${current}:${nonce}`} id={current} onChanged={() => { list.reload(); reloadProject(); }} onSwitch={setSel} /> : <Card><Empty>Start this week’s update, or choose one from the list.</Empty></Card>}
      </div>
    </div>
  );
}

function Editor({ id, onChanged, onSwitch }) {
  const { can, costs } = useProject();
  const q = useApi(`/api/status/${id}`);
  const [su, setSu] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState({});
  const [run, busy] = useAction();
  const dialog = useDialog();
  useEffect(() => { if (q.data) { setSu(q.data); setDirty(false); } }, [q.data]);
  if (!su) return <Card><Loading /></Card>;
  const editable = ['Draft', 'Returned'].includes(su.status) && can('status', 'U');
  const sd = su.system_data || {};
  const setRating = (k, patchObj) => { setSu({ ...su, ratings: { ...su.ratings, [k]: { ...su.ratings?.[k], ...patchObj } } }); setDirty(true); };
  const setField = (k, v) => { setSu({ ...su, [k]: v }); setDirty(true); };
  const save = async (quiet) => {
    const body = { content_rev: su.content_rev || 0, ratings: su.ratings, ...Object.fromEntries(NARRATIVE.map(([k]) => [k, su[k] || ''])) };
    const out = await run(() => patch(`/api/status/${id}`, body), quiet ? null : 'Draft saved');
    if (out) { setDirty(false); q.reload(); }
    return out;
  };
  const submit = async () => {
    setErrors({});
    if (dirty && !(await save(true))) return;
    try {
      await post(`/api/status/${id}/submit`);
      q.reload(); onChanged();
    } catch (e) {
      setErrors(e.details || {});
      await run(() => Promise.reject(e));
    }
  };
  const newVersion = async () => {
    if (!(await dialog({ title: 'Create a new version', message: 'This update was used in an issued report and is locked (STS-011). A new version can be corrected and resubmitted; the issued report keeps the original.', confirm: 'Create version' }))) return;
    const out = await run(() => post(`/api/status/${id}/version`), 'New version created');
    if (out) { onChanged(); onSwitch(out.id); }
  };
  const better = (k) => RAG_RANK[su.ratings?.[k]?.rag] < RAG_RANK[sd.suggested?.[k]?.rag];
  return (
    <div className="stack">
      <Card title={`Status update — week ending ${fmtDate(su.period_end)}${su.version > 1 ? ` (version ${su.version})` : ''}`}
        sub={su.status === 'Draft' ? 'Narrative is carried forward from the last approved update; fields marked “carried over” have not been edited this week (STS-005).' : su.status === 'Reported' ? 'Locked: used in an issued report.' : null}
        actions={<>
          <Status v={su.status} />
          {editable && <button className="btn btn-sm" disabled={busy || !dirty} onClick={() => save()}>Save draft</button>}
          {editable && <button className="btn btn-sm btn-primary" disabled={busy} onClick={submit}><Icon name="send" /> Submit for review</button>}
          {su.status === 'Reported' && can('status', 'U') && <button className="btn btn-sm" disabled={busy} onClick={newVersion}>New version</button>}
        </>}>
        {su.status === 'Returned' && su.review_comment && <Alert tone="warn"><b>Returned by the reviewer:</b> {su.review_comment}</Alert>}
        {su.late && <Alert tone="warn">Submitted after the cut-off.</Alert>}
        {su.reported_unapproved && su.status !== 'Reported' && <Alert tone="info">This update was used in an issued report before it was approved (the report recorded the readiness warning). Submit it for review as usual.</Alert>}
        {su.overrides?.length > 0 && !editable && (
          <Alert tone="info"><b>Ratings better than calculated (BR-06):</b> {su.overrides.map((o) => `${o.dimension} ${o.chosen} vs ${o.calculated} — ${o.justification}`).join('; ')}</Alert>
        )}
        <h3 className="mt-2 mb-1">Ratings</h3>
        <div className="table-wrap">
          <table className="table status-table">
            <thead><tr><th>Dimension</th><th>Calculated</th><th>Your rating</th><th>Commentary {editable && <span className="tiny muted">(required for Amber and Red)</span>}</th></tr></thead>
            <tbody>
              {DIMS.map((dim) => {
                const r = su.ratings?.[dim.key] || {};
                const calc = sd.suggested?.[dim.key];
                const err = errors[`ratings.${dim.key}.commentary`] || errors[`ratings.${dim.key}.justification`];
                return (
                  <tr key={dim.key} className={dim.key === 'overall' ? 'strong' : ''}>
                    <td>{dim.label}</td>
                    <td title={(calc?.reasons || []).join('\n')}><Rag v={calc?.rag} sm /><div className="tiny muted" style={{ maxWidth: 220 }}>{(calc?.reasons || []).slice(0, 2).join('; ')}</div></td>
                    <td>
                      {editable ? (
                        <div className="rag-pick" role="radiogroup" aria-label={`${dim.label} rating`}>
                          {RAGS.map((g) => <button key={g} type="button" role="radio" aria-checked={r.rag === g} className={`rag ${g} ${r.rag === g ? 'on' : 'off'}`} onClick={() => setRating(dim.key, { rag: g })} title={g}>{g[0]}</button>)}
                        </div>
                      ) : <Rag v={r.rag} sm />}
                    </td>
                    <td>
                      {editable ? (
                        <>
                          <textarea rows={2} value={r.commentary || ''} onChange={(e) => setRating(dim.key, { commentary: e.target.value })} className={err ? 'invalid' : ''} />
                          {r.carried && <div className="tiny muted">Carried over from last week</div>}
                          {better(dim.key) && (
                            <div className="mt-1">
                              <div className="tiny flag">Better than the calculated {sd.suggested?.[dim.key]?.rag}: justify the override (BR-06).</div>
                              <textarea rows={2} placeholder="Justification" value={r.justification || ''} onChange={(e) => setRating(dim.key, { justification: e.target.value })} className={errors[`ratings.${dim.key}.justification`] ? 'invalid' : ''} />
                            </div>
                          )}
                          {err && <div className="tiny flag">{err}</div>}
                        </>
                      ) : (
                        <div className="small pre">{r.commentary || <span className="muted">—</span>}{r.justification && <div className="tiny muted mt-1">Override justification: {r.justification}</div>}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h3 className="mt-3 mb-1">Narrative</h3>
        <div className="form-grid">
          {NARRATIVE.map(([k, label, req]) => (
            <Field key={k} label={label} required={req && editable} error={errors[k]} full hint={(su.carried_over || []).includes(k) ? 'Carried over from last week — review and update' : null}>
              {editable ? <textarea rows={k === 'executive_summary' ? 4 : 3} value={su[k] || ''} onChange={(e) => setField(k, e.target.value)} /> : <div className="small pre">{su[k] || <span className="muted">—</span>}</div>}
            </Field>
          ))}
        </div>
      </Card>
      <SystemData sd={sd} costs={costs} />
      {su.status !== 'Draft' && (
        <Card title="Review">
          <Approvals entity="status_update" id={su.id} onDecided={() => { q.reload(); onChanged(); }} />
          {su.submitted_at && <p className="small muted mt-2">Submitted <DT v={su.submitted_at} />{su.approved_at && <> · approved <DT v={su.approved_at} /></>}</p>}
        </Card>
      )}
    </div>
  );
}

// STS-003: data drawn from the system, refreshed on save and at submission.
function SystemData({ sd, costs }) {
  const f = sd.financials || {};
  return (
    <Card title="From the system" sub={`Refreshed when the update is saved or submitted. Financials as at ${fmtDate(f.as_at)} (BR-02).`}>
      <div className="grid g-4">
        <div><div className="tiny muted">Hours recorded this week</div><div className="strong">{Math.round((sd.hours_recorded || 0) * 10) / 10}</div></div>
        <div><div className="tiny muted">Complete</div><div className="strong">{fmtPct(sd.indices?.percent_complete)}</div></div>
        <div><div className="tiny muted">SPI / CPI</div><div className="strong">{sd.indices?.spi?.toFixed(2) ?? '—'} / {sd.indices?.cpi?.toFixed(2) ?? '—'}</div></div>
        <div><div className="tiny muted">Fees at completion</div><div className="strong">{fmtMoneyShort(f.fees_at_completion)}</div></div>
        {costs && <div><div className="tiny muted">EAC / BAC</div><div className="strong"><Money v={f.eac} short /> / <Money v={f.bac} short /></div></div>}
        {costs && <div><div className="tiny muted">Forecast margin</div><div className="strong">{fmtPct(f.forecast_margin, 1)}</div></div>}
        <div><div className="tiny muted">Invoiced</div><div className="strong">{fmtMoneyShort(f.invoiced)}</div></div>
      </div>
      <div className="grid g-2 mt-3">
        <div>
          <h4 className="mb-1">Milestones</h4>
          {!sd.milestones_achieved?.length && !sd.milestones_missed?.length ? <p className="small muted">None achieved or missed this week.</p> : (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {sd.milestones_achieved?.map((m) => <li key={m.name}>Achieved: {m.name} ({fmtDate(m.date)})</li>)}
              {sd.milestones_missed?.map((m) => <li key={m.name} className="neg">Missed: {m.name} (due {fmtDate(m.date)})</li>)}
            </ul>
          )}
          <h4 className="mt-2 mb-1">Next four weeks</h4>
          {!sd.lookahead?.milestones?.length && !sd.lookahead?.deliverables?.length ? <p className="small muted">No milestones or deliverables due.</p> : (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {sd.lookahead.milestones.map((m) => <li key={m.name}>{m.name} — {fmtDate(m.date)} ({m.status})</li>)}
              {sd.lookahead.deliverables.map((x) => <li key={x.title}>Deliverable: {x.title} — {fmtDate(x.date)}</li>)}
            </ul>
          )}
        </div>
        <div>
          <h4 className="mb-1">RAID changes since the last update</h4>
          {!sd.raid_changes?.length ? <p className="small muted">No changes.</p> : (
            <Table compact rows={sd.raid_changes.map((x, i) => ({ ...x, id: i }))} columns={[
              { key: 'change', label: '', render: (x) => <Badge tone={x.change === 'New' ? 'teal' : x.change === 'Closed' ? 'green' : 'grey'}>{x.change}</Badge> },
              { key: 'ref', label: 'ID', render: (x) => <span className="nowrap">{x.ref}</span> }, { key: 'title', label: 'Title' },
            ]} />
          )}
          {(sd.changes_raised?.length > 0 || sd.changes_approved?.length > 0) && (
            <>
              <h4 className="mt-2 mb-1">Change requests</h4>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {sd.changes_raised?.map((c) => <li key={c.ref}>Raised: {c.ref} {c.title} ({c.status})</li>)}
                {sd.changes_approved?.map((c) => <li key={c.ref}>Approved: {c.ref} {c.title}</li>)}
              </ul>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
