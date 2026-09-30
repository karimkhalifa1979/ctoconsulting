import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useP, useCan, loadAssets } from '../../lib/store.jsx';
import { runAi } from '../../lib/ai.js';
import { Card, Empty } from '../../../components/ui.jsx';
import { Icon, When, Field, download, MIME, safeFile } from '../../components/common.jsx';
import { SLIDE_KINDS } from '../../core/constants.js';
import { overflowIssues, CAPACITY } from '../../core/deck.js';
import { manualChecks } from '../../core/checks.js';
import { uid } from '../../core/util.js';

const initials = (n) => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

// Browser preview of a slide in the CTO master's layouts (PP-04).
export function SlidePreview({ s, n, bid }) {
  const over = s.overflow?.length > 0;
  if (s.layout === 'title' || s.layout === 'section') {
    return <div className={`slide ${s.layout === 'title' ? 'title-slide' : 'section-slide'} ${s.include === false ? 'excluded' : ''}`}><div className="st">{s.title}</div>{s.subtitle && <div className="sub">{s.subtitle}</div>}{over && <span className="ovf">Overflow</span>}</div>;
  }
  return (
    <div className={`slide ${s.include === false ? 'excluded' : ''}`}>
      <div className="bar" />
      <div className="st">{s.title}</div>
      {s.layout === 'timeline' && s.data?.phases?.length ? <div className="tl">{s.data.phases.map((p, i) => <div key={i}>{p.label}</div>)}</div>
        : s.layout === 'team' && s.data?.members?.length ? <div className="team">{s.data.members.map((m, i) => <div className="m" key={i}><i>{initials(m.name)}</i><div><strong>{m.name}</strong><br />{m.role}</div></div>)}</div>
          : s.layout === 'case_study' && s.data?.caseStudy ? <><div className="summary">{s.data.caseStudy.summary}</div><div className="panel"><strong>Outcomes</strong><ul>{(s.points || []).map((p, i) => <li key={i}>{p}</li>)}</ul></div></>
            : <ul>{(s.points || []).map((p, i) => <li key={i}>{p}</li>)}</ul>}
      <div className="foot">CTO Consulting · {bid.ref}</div>
      <div className="num">{n}</div>
      {over && <span className="ovf">Overflow</span>}
    </div>
  );
}

export default function Deck({ bid }) {
  const { view, dispatch, toast, backend, putFile, getFile, client } = useP();
  const can = useCan();
  const gen = can('generateOutputs', { bid });
  const [recipeId, setRecipeId] = useState(bid.deck?.recipeId || view.recipes[0]?.id);
  const recipe = view.recipes.find((r) => r.id === recipeId) || view.recipes[0];
  const [include, setInclude] = useState(null);
  const [deck, setDeck] = useState(bid.deck || null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null);
  const [sel, setSel] = useState(0);
  const [masterId, setMasterId] = useState(view.templates.find((t) => t.kind === 'pptx' && t.default)?.id || '');
  const [mode, setMode] = useState('outline');
  useEffect(() => { if (!dirty) setDeck(bid.deck || null); }, [bid.deck]); // eslint-disable-line react-hooks/exhaustive-deps
  const incl = include || recipe.slides.map((s) => s.kind);
  const masters = view.templates.filter((t) => t.kind === 'pptx' && t.status === 'approved');
  const master = masters.find((t) => t.id === masterId) || masters[0];
  const slides = deck?.slides || [];
  const shown = slides.filter((s) => s.include !== false);
  const overflowCount = shown.filter((s) => s.overflow?.length).length;

  const storyboard = async () => {
    setBusy('story');
    try {
      const r = await runAi('storyboard', { view, bid, recipe, include: incl }, { backend, dispatch });
      const d = { ...r, recipeId: recipe.id, recipeName: recipe.name, engine: r.engine || 'offline' };
      await dispatch('deck.update', { bidId: bid.id, deck: d, label: `Generated a ${recipe.name.toLowerCase()} storyboard (${d.slides.filter((s) => s.include !== false).length} slides)` }, { quiet: true });
      setDeck(d); setDirty(false); setSel(0);
      toast(`Storyboard drafted with ${d.slides.length} slides. Edit the outline, then render.`, 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };

  const edit = (i, patch) => {
    const next = slides.map((s, j) => (j === i ? { ...s, ...patch } : s)).map((s) => ({ ...s, overflow: overflowIssues(s) }));
    setDeck({ ...deck, slides: next }); setDirty(true);
  };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    setDeck({ ...deck, slides: next }); setDirty(true); setSel(j);
  };
  const addSlide = () => {
    const s = { id: uid('sl'), kind: 'custom', layout: 'content', include: true, title: 'New slide', points: [], notes: '', sources: [] };
    s.overflow = overflowIssues(s);
    setDeck({ ...deck, slides: [...slides.slice(0, sel + 1), s, ...slides.slice(sel + 1)] }); setDirty(true); setSel(sel + 1);
  };
  const save = () => dispatch('deck.update', { bidId: bid.id, deck, label: 'Edited the presentation outline' }, { success: 'Outline saved' }).then(() => setDirty(false));

  const render = async () => {
    setBusy('render');
    try {
      if (dirty) await save();
      const assets = await loadAssets();
      const cl = client(bid.clientId);
      let bytes;
      if (!master || master.builtIn) {
        const photos = {};
        for (const m of shown.flatMap((s) => s.data?.members || [])) {
          const c = view.consultants.find((x) => x.id === m.consultantId);
          if (c?.photo) { const f = await getFile(c.photo); if (f) photos[c.id] = f.bytes; }
        }
        const { renderDeck } = await import('../../gen/pptx.js');
        bytes = await renderDeck(deck, { title: bid.title, client: cl?.name, assets, photos });
      } else {
        const f = await getFile(master.fileId);
        if (!f) throw new Error(`The file for master “${master.name}” is missing.`);
        const { renderIntoMaster } = await import('../../gen/pptxTemplate.js');
        bytes = await renderIntoMaster(f.bytes, deck, master.mapping);
      }
      const text = shown.map((s) => [s.title, s.subtitle, ...(s.points || []), s.data?.caseStudy?.summary].filter(Boolean).join('\n')).join('\n');
      const checks = [
        { id: 'overflow', label: 'No text overflows its placeholder', status: overflowCount ? 'fail' : 'pass', detail: overflowCount ? `${overflowCount} slide(s) flagged (PP-06).` : 'All text fits its placeholders.', items: shown.filter((s) => s.overflow?.length).map((s) => ({ text: `${s.title}: ${s.overflow.join(' ')}` })) },
        ...manualChecks(view, bid, { text, trackedChanges: false, comments: false, hiddenText: false, personal: [] }).filter((c) => c.id !== 'placeholders' && c.id !== 'comments' && c.id !== 'properties'),
      ];
      const name = `${safeFile(bid.ref)}_${safeFile(recipe.name)}_v${bid.outputs.filter((o) => o.kind === 'pptx').length + 1}.pptx`;
      const fileId = await putFile(bytes, { name, type: MIME.pptx, bidId: bid.id });
      await dispatch('output.add', { bidId: bid.id, output: { kind: 'pptx', name, fileId, size: bytes.length, templateId: master?.id, templateName: master?.name || 'CTO Consulting presentation master', templateVersion: master?.version || 1, aiModel: deck.engine === 'claude' ? deck.model : 'offline engine', checks, pages: shown.length, pagesEstimated: false, note: `${recipe.name}, ${shown.length} slides` } }, { quiet: true });
      download(bytes, name, MIME.pptx);
      toast(`Rendered ${shown.length} slides with native, editable PowerPoint objects. Saved to Produce.`, 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };

  const rehearsal = async () => {
    setBusy('rehearsal');
    try {
      const r = await runAi('rehearsal', { view, bid }, { backend, dispatch });
      const { buildRehearsalPack } = await import('../../gen/cv.js');
      const bytes = await buildRehearsalPack(bid, client(bid.clientId)?.name || '', r.questions);
      const name = `${safeFile(bid.ref)}_rehearsal_pack.docx`;
      const fileId = await putFile(bytes, { name, type: MIME.docx, bidId: bid.id });
      await dispatch('output.add', { bidId: bid.id, output: { kind: 'rehearsal', name, fileId, size: bytes.length, note: `${r.questions.length} likely panel questions with suggested answers and presenters` } }, { quiet: true });
      download(bytes, name, MIME.docx);
      toast(`Rehearsal pack with ${r.questions.length} likely questions.`, 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };

  const cur = slides[sel];
  return (
    <div className="stack">
      <div className="split-3-2">
        <Card title="Recipe" subtitle="Choose the kind of presentation and the slides to include (PP-02)">
          <div className="form-grid">
            <Field label="Recipe"><select value={recipe.id} onChange={(e) => { setRecipeId(e.target.value); setInclude(null); }}>{view.recipes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.could ? ' (optional)' : ''}</option>)}</select></Field>
            <Field label="Typical use"><div className="small">{recipe.use}</div></Field>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {recipe.slides.map((s) => <label key={s.id} className="chip"><input type="checkbox" checked={incl.includes(s.kind)} onChange={(e) => setInclude(e.target.checked ? [...incl, s.kind] : incl.filter((k) => k !== s.kind))} /> {SLIDE_KINDS[s.kind]?.title || s.kind}</label>)}
          </div>
          {gen && <div className="row" style={{ marginTop: 12 }}><button className="btn btn-primary" disabled={busy === 'story' || bid.aiEnabled === false} onClick={storyboard}>{busy === 'story' ? 'Writing storyboard…' : deck ? 'Write a new storyboard' : 'Write storyboard with AI'}</button><span className="mini">Action titles, 3–5 points and speaker notes from approved content, citing sources (PP-03).</span></div>}
          {bid.aiEnabled === false && <div className="callout small" style={{ marginTop: 8 }}>AI is switched off for this bid. Build the outline by hand: add slides below.</div>}
        </Card>
        <Card title="Render" subtitle="Native, editable PowerPoint objects in the CTO master (PP-05)">
          <div className="stack" style={{ gap: 8 }}>
            <Field label="Master template"><select value={master?.id || ''} onChange={(e) => setMasterId(e.target.value)}>{masters.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>)}</select></Field>
            {overflowCount > 0 && <div className="callout warn small">{overflowCount} slide{overflowCount === 1 ? '' : 's'} would overflow a placeholder. Shorten the text rather than shrinking it (PP-06).</div>}
            <button className="btn btn-primary" disabled={!deck || !gen || busy === 'render'} onClick={render}>{busy === 'render' ? 'Rendering…' : `Render deck (${shown.length} slides)`}</button>
            <button className="btn" disabled={!gen || busy === 'rehearsal' || bid.aiEnabled === false} onClick={rehearsal}>{busy === 'rehearsal' ? 'Preparing…' : 'Rehearsal pack (.docx)'}</button>
            <p className="mini" style={{ margin: 0 }}>Rendered decks, their PDF copies and decks finalised in PowerPoint are listed on the <Link to={`/bids/${bid.id}/produce`}>Produce</Link> tab.</p>
          </div>
        </Card>
      </div>

      {!deck ? <Empty title="No storyboard yet">Choose a recipe and write the storyboard. The deck uses the same approved content, team and price as the proposal, so they never disagree.</Empty> : (
        <Card title={`${deck.recipeName || 'Storyboard'} · ${shown.length} of ${slides.length} slides`} subtitle={<>Drafted by the {deck.engine === 'claude' ? `Claude (${deck.model})` : 'offline engine'} <When at={deck.generatedAt} />{deck.updatedAt && deck.updatedAt !== deck.generatedAt ? <> · edited <When at={deck.updatedAt} /></> : null}</>}
          actions={<div className="row"><button className={`btn btn-sm ${mode === 'outline' ? 'btn-navy' : ''}`} onClick={() => setMode('outline')}>Outline</button><button className={`btn btn-sm ${mode === 'grid' ? 'btn-navy' : ''}`} onClick={() => setMode('grid')}>All slides</button>{dirty && <button className="btn btn-sm btn-primary" onClick={save}>Save outline</button>}</div>}>
          {mode === 'grid' ? (
            <div className="slides">{slides.map((s, i) => <button key={s.id} className="linkish" style={{ textAlign: 'left' }} onClick={() => { setSel(i); setMode('outline'); }}><SlidePreview s={s} n={i + 1} bid={bid} /></button>)}</div>
          ) : (
            <div className="deck-editor">
              <ol className="deck-list">
                {slides.map((s, i) => (
                  <li key={s.id} className={`${i === sel ? 'on' : ''} ${s.include === false ? 'off' : ''}`}>
                    <button className="linkish" onClick={() => setSel(i)}><span className="mini">{SLIDE_KINDS[s.kind]?.title || 'Custom'}</span><br />{s.title}</button>
                    {s.overflow?.length > 0 && <span className="pill bad" title={s.overflow.join(' ')}>!</span>}
                  </li>
                ))}
                {gen && <li><button className="btn btn-sm" onClick={addSlide}>+ Add slide</button></li>}
              </ol>
              {cur && (
                <div className="stack">
                  <SlidePreview s={cur} n={sel + 1} bid={bid} />
                  {cur.overflow?.length > 0 && <div className="callout warn small">{cur.overflow.join(' ')}</div>}
                  <div className="row">
                    <label className="check"><input type="checkbox" checked={cur.include !== false} disabled={!gen} onChange={(e) => edit(sel, { include: e.target.checked })} /><span>Include this slide</span></label>
                    <button className="btn btn-sm" disabled={!gen || sel === 0} onClick={() => move(sel, -1)}>Move up</button>
                    <button className="btn btn-sm" disabled={!gen || sel === slides.length - 1} onClick={() => move(sel, 1)}>Move down</button>
                    {cur.kind === 'custom' && gen && <button className="btn btn-sm btn-ghost" onClick={() => { setDeck({ ...deck, slides: slides.filter((_, j) => j !== sel) }); setDirty(true); setSel(Math.max(0, sel - 1)); }}>Delete</button>}
                  </div>
                  <Field label={`Action title (${(cur.title || '').length}/${CAPACITY.title})`} full><input value={cur.title} disabled={!gen} onChange={(e) => edit(sel, { title: e.target.value })} /></Field>
                  {['title', 'section'].includes(cur.layout) ? <Field label="Subtitle" full><input value={cur.subtitle || ''} disabled={!gen} onChange={(e) => edit(sel, { subtitle: e.target.value })} /></Field>
                    : <Field label={`Points, one per line (${(cur.points || []).length}; aim for 3 to ${CAPACITY.points})`} full><textarea rows={6} value={(cur.points || []).join('\n')} disabled={!gen} onChange={(e) => edit(sel, { points: e.target.value.split('\n').map((x) => x.replace(/^[•\-*]\s*/, '')).filter((x, i, a) => x.trim() || i < a.length - 1) })} /></Field>}
                  <Field label="Speaker notes" full><textarea rows={4} value={cur.notes || ''} disabled={!gen} onChange={(e) => edit(sel, { notes: e.target.value })} /></Field>
                  {cur.sources?.length > 0 && <div className="mini">Sources: {cur.sources.map((x) => x.label).join(', ')}</div>}
                </div>
              )}
            </div>
          )}
        </Card>
      )}
      {!gen && <div className="callout small">Only the bid team can edit and render the presentation. <Icon name="lock" size={12} /></div>}
    </div>
  );
}
