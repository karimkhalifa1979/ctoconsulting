import { useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { ARES, ALIGN_SCALE, CONTRIB_TYPES } from '../../lib/config.js';
import { riskScore, alignmentScore, riskBand, calibration } from '../../lib/scoring.js';
import { financials } from '../../lib/finance.js';
import { Card, ChartCard, Field, TextInput, TextArea, Select, Pill, RiskIcon, Guidance, NumberInput } from '../../components/ui.jsx';
import { TrendChart } from '../../components/charts.jsx';
import { fmtDate, money, todayISO, uid } from '../../lib/util.js';

export default function Assessment({ program: p }) {
  const { ws, updateProgram } = useApp();
  const [patterns, setPatterns] = useState(false);
  const risk = riskScore(p, ws);
  const align = alignmentScore(p, ws);
  const calR = calibration(ws, 'risk'); const calA = calibration(ws, 'alignment');
  const cat = ws.categories.find((c) => c.id === p.categoryId);
  const instrument = ws.instrument;
  const setAssess = (path, v, label) => updateProgram(p.id, (x) => {
    x.assessment = x.assessment || {};
    const [a, b, c] = path;
    x.assessment[a] = x.assessment[a] || {};
    if (c !== undefined) { x.assessment[a][b] = { ...(x.assessment[a][b] || {}), [c]: v }; } else x.assessment[a][b] = v;
  }, label, { field: path.join('.') });
  const history = p.assessment?.history || [];
  const t = ws.settings.thresholds;

  return (
    <div className="stack">
      {cat && !cat.discretionary && <Guidance title="Proportionate rigour.">{cat.name} investments do not need a full value assessment (BR-07); alignment and financial scoring are optional. A risk scan is still useful.</Guidance>}
      <div className="kpi-grid">
        <div className="card stat accent"><div className="label">Alignment</div><div className="value">{align.score === null ? '—' : Math.round(align.score)}</div><div className="sub">{align.rated}/{align.total} drivers rated{calA && align.score !== null ? ` · normalised ${Math.round(calA.apply(align.score))}` : ''}</div></div>
        <div className="card stat"><div className="label">Financial worth (NPV)</div><div className="value">{money(financials(p, ws).npv)}</div><div className="sub">see Costs and worth / Simulation</div></div>
        <div className="card stat"><div className="label">Overall risk</div><div className="row" style={{ marginTop: 4 }}><RiskIcon byAre={risk.byAre} ws={ws} size={40} patterns={patterns} /><div><div className="value" style={{ marginTop: 0 }}>{risk.overall === null ? '—' : Math.round(risk.overall)}</div><div className="sub">{risk.incomplete ? `incomplete (${Math.round(risk.unanswered * 100)}% unanswered)` : riskBand(risk.overall, ws).label}{calR && risk.overall !== null ? ` · normalised ${Math.round(calR.apply(risk.overall))}` : ''}</div></div></div></div>
        <div className="card stat"><div className="label">Basis of judgement (VAL-14)</div><div className="value" style={{ fontSize: 18 }}>{p.assessment?.risk?.basis || 'assessor'}</div><div className="sub">{p.assessment?.risk?.assessor || '—'} · {fmtDate(p.assessment?.risk?.date)}</div></div>
      </div>
      <p className="mini" style={{ margin: 0 }}>The three dimensions — alignment, financial worth and risk — are shown side by side and never combined into a single deciding number (VAL-01, principle P4). Scores rest on judgement and are rounded to whole numbers.</p>

      <div className="grid g-2" data-layout>
        <Card title="Alignment instrument (VAL-02)" subtitle="Rate the program’s contribution to each strategic driver (0 none – 4 critical)">
          {CONTRIB_TYPES.map((ct) => {
            const ds = ws.drivers.filter((d) => d.type === ct.id && d.status !== 'retired');
            if (!ds.length) return null;
            return (
              <div key={ct.id} style={{ marginBottom: 12 }}>
                <div className="section-title" style={{ marginTop: 6 }}>{ct.label} <span className="mini">(type weight {ws.settings.typeWeights[ct.id]})</span></div>
                {ds.map((d) => {
                  const b = align.breakdown.find((x) => x.driver.id === d.id);
                  return (
                    <div key={d.id} className="ctrl-row" style={{ gridTemplateColumns: '1fr 160px 50px' }}>
                      <span>{d.name}<div className="mini">weight {d.weight}</div></span>
                      <select value={p.assessment?.alignment?.ratings?.[d.id] ?? ''} onChange={(e) => setAssess(['alignment', 'ratings', d.id], e.target.value === '' ? undefined : Number(e.target.value), `Alignment rating: ${d.name}`)} aria-label={`Contribution to ${d.name}`}>
                        <option value="">Not rated</option>{ALIGN_SCALE.map((l, i) => <option key={l} value={i}>{i} — {l}</option>)}
                      </select>
                      <span className="num">{b ? b.contribution.toFixed(1) : '—'}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className="form-grid" style={{ marginTop: 8 }}>
            <Field label="Basis"><Select value={p.assessment?.alignment?.basis || 'assessor'} onChange={(v) => setAssess(['alignment', 'basis'], v, 'Alignment basis')} options={['assessor', 'Delphi', 'survey']} /></Field>
            <Field label="Assessor(s)"><TextInput value={p.assessment?.alignment?.assessor} onChange={(v) => setAssess(['alignment', 'assessor'], v, 'Alignment assessor')} /></Field>
          </div>
        </Card>

        <Card title="Risk instrument (VAL-05)" subtitle="1 = low risk … 5 = high risk; question weights 1–3" actions={<label className="check mini"><input type="checkbox" checked={patterns} onChange={(e) => setPatterns(e.target.checked)} /> Pattern fills</label>}>
          {ARES.map((a) => (
            <div key={a.id} style={{ marginBottom: 10 }}>
              <div className="section-title" style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between' }}><span>{a.q}</span><span>{risk.byAre[a.id].score === null ? '—' : <Pill tone={{ green: 'good', amber: 'warning', red: 'critical', none: 'none' }[riskBand(risk.byAre[a.id].score, ws).id]}>{Math.round(risk.byAre[a.id].score)} · {riskBand(risk.byAre[a.id].score, ws).label}</Pill>}</span></div>
              {instrument.filter((q) => q.are === a.id).map((q) => (
                <div key={q.id} className="ctrl-row" style={{ gridTemplateColumns: '1fr 190px' }}>
                  <span>{q.text} <span className="mini">(w{q.w})</span></span>
                  <div className="seg" role="radiogroup" aria-label={q.text}>
                    {[1, 2, 3, 4, 5].map((v) => <button key={v} type="button" role="radio" aria-checked={p.assessment?.risk?.answers?.[q.id] === v} className={p.assessment?.risk?.answers?.[q.id] === v ? 'on' : ''} onClick={() => setAssess(['risk', 'answers', q.id], p.assessment?.risk?.answers?.[q.id] === v ? undefined : v, `Risk answer: ${q.text}`)} style={{ padding: '4px 10px' }}>{v}</button>)}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div className="form-grid" style={{ marginTop: 8 }}>
            <Field label="Basis"><Select value={p.assessment?.risk?.basis || 'assessor'} onChange={(v) => setAssess(['risk', 'basis'], v, 'Risk basis')} options={['assessor', 'Delphi', 'survey']} /></Field>
            <Field label="Assessor(s)"><TextInput value={p.assessment?.risk?.assessor} onChange={(v) => setAssess(['risk', 'assessor'], v, 'Risk assessor')} /></Field>
          </div>
          {risk.overall !== null && risk.overall > t.riskRed && (
            <div className="callout warn" style={{ marginTop: 10 }}><strong>High risk (VAL-11).</strong> Classify it:
              <div className="btn-row" style={{ marginTop: 6 }}>
                {[['not-examined', 'Not yet examined → add mitigations'], ['inherent', 'Inherent at this stage → smaller tranche, closer monitoring']].map(([k, l]) => <button key={k} className={`btn btn-sm ${p.assessment?.risk?.classification === k ? 'btn-navy' : ''}`} onClick={() => setAssess(['risk', 'classification'], k, 'Risk classification')}>{l}</button>)}
              </div>
            </div>
          )}
          {p.assessment?.risk?.classification && risk.overall <= t.riskRed && <p className="mini">Classification recorded: {p.assessment.risk.classification}.</p>}
        </Card>
      </div>

      <div className="grid g-2" data-layout>
        <Delphi p={p} />
        <ChartCard title="Assessment history (VAL-10)" subtitle="Re-assessed at each gate and after material change" actions={<button className="btn btn-sm" onClick={() => updateProgram(p.id, (x) => { x.assessment.history = [...(x.assessment.history || []), { date: todayISO(), gate: (x.gates || []).find((g) => !g.decision)?.gate || '—', alignment: align.score === null ? null : Math.round(align.score), risk: risk.overall === null ? null : Math.round(risk.overall), npv: Math.round(financials(x, ws).npv) }]; }, 'Recorded assessment snapshot')}>Record snapshot</button>}
          table={{ columns: [{ label: 'Date', get: (h) => fmtDate(h.date) }, { label: 'Gate', get: (h) => h.gate }, { label: 'Alignment', num: true, get: (h) => h.alignment ?? '—' }, { label: 'Risk', num: true, get: (h) => h.risk ?? '—' }, { label: 'NPV', num: true, get: (h) => (h.npv === undefined ? '—' : money(h.npv)) }], rows: history }}>
          {history.length ? <TrendChart labels={[...history.map((h) => `${h.gate} ${h.date.slice(0, 7)}`), 'Now']} series={[{ name: 'Alignment', color: 'var(--series-1)', values: [...history.map((h) => h.alignment), align.score] }, { name: 'Risk', color: 'var(--series-2)', values: [...history.map((h) => h.risk), risk.overall] }]} /> : <div className="empty-sm">No history yet.</div>}
        </ChartCard>
      </div>
      {(calR || calA) && <Guidance title="Normalisation (VAL-06).">{`Benchmark programs (${ws.programs.filter((x) => x.benchmark).map((x) => x.name).join(', ')}) carry agreed reference scores. A linear calibration from panel scores to reference scores is fitted and applied; raw and normalised scores are both shown.`}</Guidance>}
    </div>
  );
}

function Delphi({ p }) {
  const { updateProgram } = useApp();
  const rounds = p.assessment?.delphi?.rounds || [];
  const spread = (arr) => { const v = arr.filter((x) => Number.isFinite(x)); if (!v.length) return null; const m = v.reduce((a, b) => a + b, 0) / v.length; return { min: Math.min(...v), max: Math.max(...v), mean: m, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)) }; };
  const upd = (fn, label) => updateProgram(p.id, (x) => { x.assessment.delphi = x.assessment.delphi || { rounds: [] }; fn(x.assessment.delphi); }, label, { field: 'delphi' });
  return (
    <Card title="Delphi assessment (VAL-09)" subtitle="Assessors score independently and anonymously; further rounds narrow the spread" actions={<button className="btn btn-sm" onClick={() => upd((d) => { const prev = d.rounds[d.rounds.length - 1]; d.rounds.push({ id: uid('rd'), date: todayISO(), scores: (prev?.scores || [{ assessor: 'Assessor A' }, { assessor: 'Assessor B' }, { assessor: 'Assessor C' }]).map((s) => ({ assessor: s.assessor, alignment: '', risk: '' })) }); }, 'Started Delphi round')}>+ Round</button>}>
      {!rounds.length ? <div className="empty-sm">No Delphi rounds. Use them where judgement varies.</div> : rounds.map((r, ri) => {
        const sa = spread(r.scores.map((s) => Number(s.alignment))); const sr = spread(r.scores.map((s) => Number(s.risk)));
        return (
          <div key={r.id} style={{ marginBottom: 12 }}>
            <div className="section-title" style={{ marginTop: 4 }}>Round {ri + 1} · {fmtDate(r.date)}</div>
            <table className="table compact"><thead><tr><th>Assessor (anonymous)</th><th className="num">Alignment</th><th className="num">Risk</th></tr></thead><tbody>
              {r.scores.map((s, si) => <tr key={si}><td>{s.assessor}</td><td><NumberInput value={s.alignment} onChange={(v) => upd((d) => { d.rounds[ri].scores[si].alignment = v; }, 'Delphi score')} style={{ width: 80 }} /></td><td><NumberInput value={s.risk} onChange={(v) => upd((d) => { d.rounds[ri].scores[si].risk = v; }, 'Delphi score')} style={{ width: 80 }} /></td></tr>)}
              <tr><td className="mini">Spread (min–max · sd)</td><td className="num mini">{sa ? `${sa.min}–${sa.max} · ${sa.sd.toFixed(1)}` : '—'}</td><td className="num mini">{sr ? `${sr.min}–${sr.max} · ${sr.sd.toFixed(1)}` : '—'}</td></tr>
            </tbody></table>
          </div>
        );
      })}
      {rounds.length > 0 && <Field label="Consensus and rationale"><TextArea value={p.assessment?.delphi?.consensus} onChange={(v) => upd((d) => { d.consensus = v; }, 'Delphi consensus')} rows={2} /></Field>}
    </Card>
  );
}
