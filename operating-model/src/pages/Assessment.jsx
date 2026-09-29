import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Stat, Badge, ScoreButtons, RagDot, includesAll, mClass } from '../components/ui.jsx';
import { TK, DIMENSIONS, nextId, blankQuestion } from '../lib/model.js';
import { questionCalc, dimensionStats, overallStats, isScored, maturityName } from '../lib/calc.js';
import { fmtScore, isoDate, today } from '../lib/format.js';

const LEVEL_NAMES = ['Initial', 'Developing', 'Defined', 'Managed', 'Optimised'];

const QuestionRow = memo(function QuestionRow({ q, settings, showGood, onPatch, onFinding, onRemove, lists }) {
  const [open, setOpen] = useState(false);
  const c = questionCalc(q, settings);
  const patch = (k) => (v) => onPatch(q.id, { [k]: v });
  return (
    <div className={`q-row ${isScored(q) ? 'scored' : ''}`}>
      <div>
        <div className="qid">{q.id}</div>
        {c.rag && <div className="mt-8"><Badge v={c.rag} /></div>}
      </div>
      <div style={{ minWidth: 0 }}>
        {q.custom ? (
          <div className="stack-sm">
            <input type="text" value={q.sub} placeholder="Sub-component" onChange={(e) => patch('sub')(e.target.value)} />
            <textarea rows={2} value={q.question} placeholder="Assessment question" onChange={(e) => patch('question')(e.target.value)} />
            <textarea rows={2} value={q.good} placeholder="What good looks like" onChange={(e) => patch('good')(e.target.value)} />
          </div>
        ) : (
          <>
            <div className="qsub">{q.sub}</div>
            <div className="qtext">{q.question}</div>
            {showGood && q.good && <div className="good"><strong>What good looks like:</strong> {q.good}</div>}
          </>
        )}
        <textarea rows={2} value={q.observations} placeholder="Observations & findings" onChange={(e) => patch('observations')(e.target.value)} style={{ marginTop: 6 }} />
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <button className="btn btn-xs" onClick={() => setOpen(!open)}>{open ? 'Hide evidence' : 'Evidence & links'}</button>
          <button className="btn btn-xs" onClick={() => onFinding(q)} title="Log a finding linked to this question">+ Finding</button>
          {q.findingIds && <span className="xsmall muted">Findings: {q.findingIds}</span>}
          {q.custom && <button className="btn btn-xs btn-danger" onClick={() => onRemove(q.id)}>Remove question</button>}
        </div>
        {open && (
          <div className="q-detail">
            <label className="field"><span>Evidence reviewed / source</span><textarea rows={2} value={q.evidence} onChange={(e) => patch('evidence')(e.target.value)} /></label>
            <label className="field"><span>Evidence to request</span><textarea rows={2} value={q.evidenceToRequest} onChange={(e) => patch('evidenceToRequest')(e.target.value)} /></label>
            <label className="field"><span>Key stakeholders</span><textarea rows={2} value={q.stakeholders} onChange={(e) => patch('stakeholders')(e.target.value)} /></label>
            <label className="field"><span>Linked finding ID(s)</span><input type="text" value={q.findingIds} onChange={(e) => patch('findingIds')(e.target.value)} placeholder="e.g. F001; F004" /></label>
          </div>
        )}
      </div>
      <div className="q-controls">
        <span className="lbl">Current</span>
        <ScoreButtons value={q.current} onChange={patch('current')} allowNA labels={LEVEL_NAMES} />
        <span className="lbl">Target</span>
        <ScoreButtons value={q.target} onChange={patch('target')} labels={LEVEL_NAMES} />
        <span className="lbl">Importance</span>
        <ScoreButtons value={q.importance} onChange={patch('importance')} max={3} size="sm" labels={['Low', 'Medium', 'High']} />
        <span className="lbl">Confidence</span>
        <select value={q.confidence} onChange={(e) => patch('confidence')(e.target.value)} style={{ width: 130 }}>
          <option value="" />{lists.Confidence.map((x) => <option key={x}>{x}</option>)}
        </select>
        <span className="lbl">Gap</span>
        <span className="strong tabular">{c.gap === null ? '—' : c.gap > 0 ? `+${c.gap}` : c.gap}{c.wgap ? <span className="muted xsmall"> · weighted {c.wgap}</span> : ''}</span>
      </div>
    </div>
  );
});

export default function Assessment() {
  const { eng, set, update, notify } = useStore();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [dimF, setDimF] = useState(params.get('dim') || '');
  const [ragF, setRagF] = useState('');
  const [unscored, setUnscored] = useState(false);
  const [showGood, setShowGood] = useState(true);
  const [openDims, setOpenDims] = useState(() => new Set([params.get('dim') || DIMENSIONS[0].code]));
  const s = eng.settings;
  const stats = useMemo(() => dimensionStats(eng), [eng]);
  const o = overallStats(eng);
  const latest = useRef(eng);
  latest.current = eng;

  const onPatch = useCallback((id, patch) => {
    update((e) => ({ ...e, questions: e.questions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  }, [update]);
  const onRemove = useCallback((id) => {
    if (window.confirm(`Remove custom question ${id}?`)) update((e) => ({ ...e, questions: e.questions.filter((x) => x.id !== id) }));
  }, [update]);
  const onFinding = useCallback((qq) => {
    const e = latest.current;
    const id = nextId(e.findings, 'F', 3);
    const f = { id, date: isoDate(today()), dim: qq.dim, sub: qq.sub, finding: qq.observations || '', evidence: qq.evidence || '', rootCause: '', impact: '', severity: 'Medium', questions: qq.id, validated: 'Pending', owner: '', recs: '', status: 'Open' };
    update((x) => ({
      ...x,
      findings: [...x.findings, f],
      questions: x.questions.map((y) => (y.id === qq.id ? { ...y, findingIds: [y.findingIds, id].filter(Boolean).join('; ') } : y)),
    }));
    notify(`Finding ${id} logged against ${qq.id}. Complete it on the Findings page.`);
  }, [update, notify]);

  const addQuestion = (dim) => {
    const qs = eng.questions.filter((x) => x.dim === dim);
    const n = Math.max(0, ...qs.map((x) => Number(String(x.id).split('.')[1]) || 0)) + 1;
    const id = `${dim}.${String(n).padStart(2, '0')}`;
    const nq = blankQuestion({ id, dim, sub: '', question: '', good: '', importance: 2, custom: true }, s);
    const idx = eng.questions.map((x) => x.dim).lastIndexOf(dim);
    const next = [...eng.questions];
    next.splice(idx + 1, 0, nq);
    set('questions', next);
    setOpenDims(new Set([...openDims, dim]));
  };

  const toggle = (code) => {
    const n = new Set(openDims);
    if (n.has(code)) n.delete(code); else n.add(code);
    setOpenDims(n);
  };
  const filtering = q || ragF || unscored;

  return (
    <div className="stack">
      <PageHead eyebrow="Step 4 · Assess" title="Operating model maturity assessment"
        actions={<>
          <button className="btn btn-sm" onClick={() => setOpenDims(new Set(DIMENSIONS.map((d) => d.code)))}>Expand all</button>
          <button className="btn btn-sm" onClick={() => setOpenDims(new Set())}>Collapse all</button>
        </>}>
        Score current and target maturity for each question (1–5, or N/A) against the maturity model and “what good looks like”. Importance: 1 = low, 2 = medium, 3 = high. Gap = target − current; weighted gap = gap × importance (shortfalls only).
      </PageHead>
      <div className="grid g-5">
        <Stat label="Current maturity" value={fmtScore(o.current)} sub={maturityName(o.current)} accent />
        <Stat label="Target maturity" value={fmtScore(o.target)} sub="Assessed questions" />
        <Stat label="Average gap" value={fmtScore(o.gap)} sub={<Badge v={o.rag}>{o.rag || 'Not assessed'}</Badge>} />
        <Stat label="Scored" value={`${o.scored} / ${o.total}`} sub={`${Math.round(o.pctScored * 100)}% complete`} />
        <Stat label="RAG" value={<span className="row" style={{ gap: 10, fontSize: 18 }}><span style={{ color: '#d03b3b' }}>● {o.ragCounts.Red || 0}</span><span style={{ color: '#f0a020' }}>● {o.ragCounts.Amber || 0}</span><span style={{ color: '#1f9d58' }}>● {o.ragCounts.Green || 0}</span></span>} sub={`Red ≥ ${s.ragRed}, Amber ≥ ${s.ragAmber}`} />
      </div>
      <div className="card" style={{ padding: '10px 14px', position: 'sticky', top: 60, zIndex: 20 }}>
        <div className="filters" style={{ marginBottom: 0 }}>
          <input type="search" placeholder="Search questions, observations and evidence…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={dimF} onChange={(e) => { setDimF(e.target.value); if (e.target.value) setOpenDims(new Set([e.target.value])); }}>
            <option value="">All dimensions</option>
            {DIMENSIONS.map((d) => <option key={d.code} value={d.code}>{d.code} {d.name}</option>)}
          </select>
          <select value={ragF} onChange={(e) => setRagF(e.target.value)}>
            <option value="">Any RAG</option>{['Red', 'Amber', 'Green'].map((x) => <option key={x}>{x}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={unscored} onChange={(e) => setUnscored(e.target.checked)} />Unscored only</label>
          <label className="check"><input type="checkbox" checked={showGood} onChange={(e) => setShowGood(e.target.checked)} />Show “what good looks like”</label>
        </div>
      </div>

      {DIMENSIONS.filter((d) => !dimF || d.code === dimF).map((d) => {
        const st = stats.find((x) => x.code === d.code);
        const qs = eng.questions.filter((x) => x.dim === d.code
          && (!q || includesAll(`${x.id} ${x.sub} ${x.question} ${x.observations} ${x.evidence}`, q))
          && (!ragF || questionCalc(x, s).rag === ragF)
          && (!unscored || !isScored(x)));
        if (filtering && !qs.length) return null;
        const isOpen = openDims.has(d.code) || filtering;
        const mm = TK.maturityModel[d.code] || [];
        return (
          <div key={d.code} className="card dim-block">
            <div className="dim-head" onClick={() => toggle(d.code)}>
              <span className="code">{d.code}</span>
              <h3>{d.name}</h3>
              <span className="small muted">{st.scored}/{st.questions} scored</span>
              <div className="meter" title={`${Math.round(st.pct * 100)}% scored`}><i style={{ width: `${st.pct * 100}%` }} /></div>
              <span className={`badge ${mClass(st.current)}`}>Current {fmtScore(st.current)}</span>
              <span className="badge badge-navy">Target {fmtScore(st.target)}</span>
              <span className="row" style={{ gap: 6 }}><RagDot rag={st.rag} /><span className="small strong">{st.gap === null ? '—' : `Gap ${fmtScore(st.gap)}`}</span></span>
              <span className="muted">{isOpen ? '▾' : '▸'}</span>
            </div>
            {isOpen && (
              <>
                <div style={{ padding: '0 18px 12px' }}>
                  <p className="small" style={{ color: 'var(--ink-2)' }}>{d.definition} <em className="muted">Key question: {d.keyQuestion}</em></p>
                  <div className="maturity-strip">
                    {mm.map((txt, i) => <div key={i} className={`m${i + 1}`}><strong>{i + 1} · {LEVEL_NAMES[i]}</strong>{txt}</div>)}
                  </div>
                </div>
                {qs.map((x) => (
                  <QuestionRow key={x.id} q={x} settings={s} showGood={showGood} onPatch={onPatch} onFinding={onFinding} onRemove={onRemove} lists={eng.lists} />
                ))}
                {!filtering && (
                  <div style={{ padding: '10px 18px', borderTop: '1px solid var(--line)' }}>
                    <button className="btn btn-sm" onClick={() => addQuestion(d.code)}>+ Add a question to {d.code}</button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
