import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Card, PageHead, Tabs, useTab } from '../components/ui.jsx';
import { TK, DIMENSIONS } from '../lib/model.js';
import { AI_PILLARS, GUARDRAILS } from '../data/aiReadiness.js';

const LEVELS = ['1 – Initial', '2 – Developing', '3 – Defined', '4 – Managed', '5 – Optimised'];

export default function Reference() {
  const { eng, set } = useStore();
  const [tab, setTab] = useTab('framework');
  const [list, setList] = useState(Object.keys(eng.lists)[0]);
  const items = eng.lists[list] || [];
  const setItems = (arr) => set('lists', { ...eng.lists, [list]: arr });
  return (
    <div className="stack">
      <PageHead eyebrow="Reference" title="Framework, maturity model & lists">{TK.frameworkIntro}</PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'framework', label: 'Framework (17 dimensions)' }, { id: 'maturity', label: 'Maturity model' }, { id: 'approach', label: 'Assessment approach' }, { id: 'ai', label: 'AI readiness framework' }, { id: 'lists', label: 'Dropdown lists' }]} />
      {tab === 'framework' && (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Code</th><th>Dimension</th><th>Definition</th><th>Sub-components</th><th>Key question</th><th>Canvas</th><th>7S</th><th>Galbraith</th><th>TOGAF / BIZBOK</th><th>Standards & references</th><th className="num">Qs</th></tr></thead>
              <tbody>{DIMENSIONS.map((d) => <tr key={d.code}><td className="strong">{d.code}</td><td className="strong">{d.name}</td><td className="small">{d.definition}</td><td className="small">{d.subComponents}</td><td className="small">{d.keyQuestion}</td><td className="small">{d.canvas}</td><td className="small">{d.sevenS}</td><td className="small">{d.galbraith}</td><td className="small">{d.togaf}</td><td className="small">{d.standards}</td><td className="num">{eng.questions.filter((q) => q.dim === d.code).length}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      )}
      {tab === 'maturity' && (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Code</th><th>Dimension</th>{LEVELS.map((l, i) => <th key={l} className={`m${i + 1}`}>{l}</th>)}</tr></thead>
              <tbody>
                <tr><td>All</td><td className="strong">Generic scale</td>{TK.maturityModel.All.map((t, i) => <td key={i} className="small">{t}</td>)}</tr>
                {DIMENSIONS.map((d) => <tr key={d.code}><td className="strong">{d.code}</td><td className="strong">{d.name}</td>{(TK.maturityModel[d.code] || []).map((t, i) => <td key={i} className="small">{t}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <div className="card-body small muted">{TK.cover.ragNote} N/A questions are excluded from averages.</div>
        </Card>
      )}
      {tab === 'approach' && (
        <div className="grid g-2">
          <Card title="Assessment approach" pad={false}>
            <table className="table compact"><thead><tr><th>Phase</th><th>Key activities</th><th>Outputs</th></tr></thead>
              <tbody>{TK.approach.map((a) => <tr key={a.phase}><td className="strong nowrap">{a.phase}</td><td className="small">{a.activities}<div className="xsmall muted">Tabs: {a.tabs}</div></td><td className="small">{a.outputs}</td></tr>)}</tbody></table>
          </Card>
          <Card title="How to use the toolkit" pad={false}>
            <table className="table compact"><tbody>{TK.cover.steps.map((s) => <tr key={s.step}><td className="strong nowrap">{s.step}</td><td className="small">{s.text}</td></tr>)}</tbody></table>
          </Card>
        </div>
      )}
      {tab === 'ai' && (
        <div className="grid g-2">
          <Card title="Eight pillars" pad={false}><table className="table compact"><tbody>{AI_PILLARS.map((p) => <tr key={p.id}><td className="strong">{p.name}</td><td className="small">{p.description}</td></tr>)}</tbody></table></Card>
          <Card title="Guardrails (Voluntary AI Safety Standard)" pad={false}><table className="table compact"><tbody>{GUARDRAILS.map((g) => <tr key={g.id}><td className="strong">{g.id} {g.title}</td><td className="small">{g.text}</td></tr>)}</tbody></table></Card>
        </div>
      )}
      {tab === 'lists' && (
        <div className="grid g-12">
          <Card title="Lists" pad={false}>
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {Object.keys(eng.lists).map((k) => <div key={k} onClick={() => setList(k)} className="small" style={{ padding: '7px 14px', cursor: 'pointer', borderBottom: '1px solid var(--line)', background: k === list ? 'var(--brand-teal-soft)' : undefined }}>{k} <span className="muted">({eng.lists[k].length})</span></div>)}
            </div>
          </Card>
          <Card title={list} subtitle="Dropdown values for this engagement. Renaming a value does not change entries already recorded.">
            <div className="stack-sm">
              {items.map((v, i) => (
                <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
                  <input type="text" value={v} onChange={(e) => setItems(items.map((x, k) => (k === i ? e.target.value : x)))} />
                  <button className="icon-btn" onClick={() => i > 0 && setItems(items.map((x, k) => (k === i - 1 ? items[i] : k === i ? items[i - 1] : x)))}>↑</button>
                  <button className="icon-btn danger" onClick={() => setItems(items.filter((_, k) => k !== i))}>✕</button>
                </div>
              ))}
              <button className="btn btn-sm" onClick={() => setItems([...items, ''])}>+ Add value</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
