import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { useP, useCan, usePresence } from '../../lib/store.jsx';
import { runAi } from '../../lib/ai.js';
import { AiText, EvidenceFlag, Citation, AiEditTracker, CommentHighlights, findQuote } from '../../components/editorExtensions.js';
import { Card, Modal } from '../../../components/ui.jsx';
import { SectionStatus, Person, When, Avatar, Icon, Confirm, Field } from '../../components/common.jsx';
import { sectionChecks } from '../../core/checks.js';
import { aiPendingCount, flagCount, sectionApproval } from '../../core/workflow.js';
import { candidates } from '../../core/drafting.js';
import { Index } from '../../core/search.js';
import { parseSrc } from '../../core/html.js';
import { diffText } from '../../core/diff.js';
import { htmlToText, wordCount, fmtDate, truncate } from '../../core/util.js';
import { libTypeLabel, REVIEW_ROUNDS, COMPLIANCE } from '../../core/constants.js';
import { newerVersionAvailable, approvedVersion } from '../../core/library.js';

function DiffView({ a, b, labels }) {
  const ops = diffText(htmlToText(a), htmlToText(b));
  return (
    <div className="diff-cols">
      <div><div className="eyebrow">{labels[0]}</div><div className="diff">{ops.filter((o) => o.t !== 'ins').map((o, i) => (o.t === 'del' ? <del key={i}>{o.text}</del> : <span key={i}>{o.text}</span>))}</div></div>
      <div><div className="eyebrow">{labels[1]}</div><div className="diff">{ops.filter((o) => o.t !== 'del').map((o, i) => (o.t === 'ins' ? <ins key={i}>{o.text}</ins> : <span key={i}>{o.text}</span>))}</div></div>
    </div>
  );
}

function Toolbar({ editor, editable, onComment, onSuggest, words, limit }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? {
      bold: e.isActive('bold'), italic: e.isActive('italic'), h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }), ul: e.isActive('bulletList'), ol: e.isActive('orderedList'),
      quote: e.isActive('blockquote'), table: e.isActive('table'), undo: e.can().undo(), redo: e.can().redo(), sel: !e.state.selection.empty, ai: e.isActive('aiText'), flag: e.isActive('evidenceFlag'),
    } : {}),
  }) || {};
  if (!editor) return null;
  const B = ({ on, label, title, onClick, disabled }) => <button type="button" className={on ? 'on' : ''} title={title || label} aria-label={title || label} aria-pressed={Boolean(on)} disabled={disabled || !editable} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{label}</button>;
  const c = () => editor.chain().focus();
  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <B label="H2" title="Heading" on={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()} />
      <B label="H3" title="Subheading" on={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()} />
      <span className="sep" />
      <B label={<strong>B</strong>} title="Bold" on={s.bold} onClick={() => c().toggleBold().run()} />
      <B label={<em>I</em>} title="Italic" on={s.italic} onClick={() => c().toggleItalic().run()} />
      <span className="sep" />
      <B label="• List" title="Bulleted list" on={s.ul} onClick={() => c().toggleBulletList().run()} />
      <B label="1. List" title="Numbered list" on={s.ol} onClick={() => c().toggleOrderedList().run()} />
      <B label="❝" title="Quote" on={s.quote} onClick={() => c().toggleBlockquote().run()} />
      <B label="Table" title="Insert a table with a header row" on={s.table} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      {s.table && <><B label="+Row" title="Add row" onClick={() => c().addRowAfter().run()} /><B label="+Col" title="Add column" onClick={() => c().addColumnAfter().run()} /><B label="−Row" title="Delete row" onClick={() => c().deleteRow().run()} /></>}
      <span className="sep" />
      <B label="↶" title="Undo" disabled={!s.undo} onClick={() => c().undo().run()} />
      <B label="↷" title="Redo" disabled={!s.redo} onClick={() => c().redo().run()} />
      <span className="sep" />
      <B label="✓ Accept AI" title={s.sel ? 'Accept the selected AI text as reviewed' : 'Accept all AI text in this section as reviewed'} onClick={() => c().acceptAi().run()} />
      <B label="Clear flag" title="Clear the “needs evidence” flag" disabled={!s.flag} onClick={() => c().clearFlag().run()} />
      <span className="sep" />
      <button type="button" disabled={!s.sel} onMouseDown={(e) => e.preventDefault()} onClick={onComment} title="Comment on the selected text">💬 Comment</button>
      <button type="button" disabled={!s.sel} onMouseDown={(e) => e.preventDefault()} onClick={onSuggest} title="Suggest a replacement for the selected text">✎ Suggest</button>
      <span style={{ marginLeft: 'auto', alignSelf: 'center' }} className={`small ${limit && words > limit ? '' : 'muted'}`}>{words}{limit ? ` / ${limit}` : ''} words</span>
    </div>
  );
}

// The editor can be torn down and recreated when React re-shows a suspended tree; never touch a destroyed one.
const alive = (ed) => Boolean(ed && !ed.destroyed && ed.schema);

// Keyed by section so moving between sections starts a fresh editor, lock and save state.
export default function SectionEditor({ bid }) {
  const { sectionId } = useParams();
  return <SectionEditorInner key={sectionId} bid={bid} sectionId={sectionId} />;
}

function SectionEditorInner({ bid, sectionId }) {
  const nav = useNavigate();
  const { view, me, dispatch, toast, backend, userName } = useP();
  const can = useCan();
  const section = bid.sections.find((s) => s.id === sectionId);
  const others = usePresence({ bidId: bid.id, sectionId });
  const [tab, setTab] = useState('ai');
  const [saving, setSaving] = useState('idle');
  const [lock, setLock] = useState('none');
  const [busy, setBusy] = useState(null);
  const [comment, setComment] = useState(null);
  const [activeComment, setActiveComment] = useState(null);
  const [checkRes, setCheckRes] = useState(null);
  const [compare, setCompare] = useState([]);
  const [modal, setModal] = useState(null);
  const [showAi, setShowAi] = useState(true);
  const [q, setQ] = useState('');
  const [html, setHtml] = useState(section?.content || '');
  const saveTimer = useRef(null);
  const pending = useRef(null);
  const commentsRef = useRef(section?.comments || []);
  commentsRef.current = section?.comments || [];
  const activeRef = useRef(null);
  activeRef.current = activeComment;

  const canEditRole = section && can('editSection', { bid, section });
  const closed = ['archived', 'closed'].includes(bid.stage) || Boolean(bid.submission);
  const editable = Boolean(canEditRole && section.status !== 'locked' && !closed && lock === 'mine');
  const holder = section ? view.locks?.[section.id] : null;
  const reviewer = section && (section.reviewers?.includes(me.id) || me.roles.includes('partner')) && can('approveGate', { bid }) && section.ownerId !== me.id;
  const planner = can('planSections', { bid });
  const aiOn = bid.aiEnabled !== false;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, horizontalRule: false, link: { openOnClick: false, autolink: true }, underline: false, strike: false }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: 'Start writing, or use AI assist to draft from the library and the client’s request…' }),
      AiText, EvidenceFlag, Citation, AiEditTracker,
      CommentHighlights.configure({ getComments: () => commentsRef.current, activeId: () => activeRef.current }),
    ],
    content: section?.content || '',
    editable: false,
    editorProps: { attributes: { class: 'pm', 'aria-label': `${section?.title || 'Section'} content`, role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: e, transaction }) => {
      if (transaction.getMeta('preventUpdate')) return;
      const h = e.getHTML();
      setHtml(h);
      clearTimeout(saveTimer.current);
      setSaving('pending');
      pending.current = h;
      saveTimer.current = setTimeout(() => save(h), 1200);
    },
  }, [sectionId]);

  const save = useCallback(async (h, extra = {}) => {
    pending.current = null;
    setSaving('saving');
    try {
      await dispatch('section.save', { bidId: bid.id, sectionId, html: h, coalesce: !extra.ai && !extra.label, ...extra }, { quiet: true });
      setSaving('saved');
    } catch (e) {
      setSaving('error');
      toast(`Not saved: ${e.message}`, 'error');
    }
  }, [bid.id, sectionId, dispatch, toast]);

  const statusLocked = section?.status === 'locked';
  // Section-level locking (MVP): one editor at a time, with a heartbeat. Real-time co-editing replaces this in phase 2.
  useEffect(() => {
    if (!canEditRole || closed || statusLocked) { setLock('none'); return undefined; }
    let active = true;
    const claim = async () => {
      try { await dispatch('section.claim', { bidId: bid.id, sectionId }, { quiet: true }); if (active) setLock('mine'); } catch { if (active) setLock('other'); }
    };
    claim();
    const t = setInterval(claim, 90000);
    return () => {
      active = false; clearInterval(t); clearTimeout(saveTimer.current);
      // Leaving the section flushes any unsaved edit before the lock is released.
      const h = pending.current;
      pending.current = null;
      const flush = h !== null ? dispatch('section.save', { bidId: bid.id, sectionId, html: h, coalesce: true }, { quiet: true }).catch(() => {}) : Promise.resolve();
      flush.then(() => dispatch('section.release', { sectionId }, { quiet: true })).catch(() => {});
    };
  }, [sectionId, canEditRole, closed, statusLocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = alive(editor);
  useEffect(() => { if (alive(editor)) editor.setEditable(editable); }, [editor, live, editable]);
  // Content saved elsewhere (another user, a restore) replaces what is shown when this user is not editing.
  useEffect(() => {
    if (!alive(editor) || !section) return;
    if ((!editable || saving === 'idle' || saving === 'saved') && editor.getHTML() !== section.content && !editor.isFocused) {
      editor.commands.setContent(section.content || '', { emitUpdate: false });
      setHtml(section.content || '');
    }
  }, [section?.content, section?.v, live]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (alive(editor) && editor.isInitialized) editor.view.dispatch(editor.state.tr.setMeta('refreshComments', true)); }, [section?.comments, activeComment, editor]);

  const liveSection = useMemo(() => (section ? { ...section, content: html } : null), [section, html]);
  const checks = useMemo(() => (liveSection ? sectionChecks(view, bid, liveSection) : null), [view, bid, liveSection]);
  const reqs = section ? bid.requirements.filter((r) => (r.sectionIds || []).includes(section.id) && !r.excluded) : [];
  const libIndex = useMemo(() => new Index(candidates(view, bid, { types: ['case_study', 'standard_answer', 'method', 'evidence', 'past_proposal'] })), [view, bid]);
  const results = useMemo(() => (q.trim() ? libIndex.search(q, { limit: 8 }) : libIndex.search(`${section?.title || ''} ${section?.brief || ''} ${reqs.map((r) => r.text).join(' ')}`, { limit: 6 })), [q, libIndex, section?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!section) return <div className="callout warn">Section not found. <Link to={`/bids/${bid.id}/sections`}>Back to sections</Link></div>;

  const insertAi = (resHtml, mode) => {
    const chain = editor.chain().focus().command(({ tr }) => { tr.setMeta('aiInsert', true); return true; });
    if (mode === 'replace') chain.setContent(resHtml).run(); else chain.insertContentAt(editor.state.doc.content.size, resHtml).run();
  };

  const ai = async (action, extra = {}) => {
    if (!aiOn) { toast('AI is switched off for this bid.', 'error'); return; }
    if (!editable && action !== 'check') { toast('Open the section for editing first.', 'error'); return; }
    setBusy(action);
    try {
      const current = editor.getHTML();
      const params = { view, bid, section: liveSection, html: current, reqs, ...extra };
      if (action === 'shorten') params.limit = section.wordLimit || Math.round(wordCount(htmlToText(current)) * 0.8);
      const r = await runAi(action, params, { backend, dispatch });
      if (action === 'check') { setCheckRes(r.results); setTab('reqs'); return; }
      const mode = ['shorten', 'strengthen'].includes(action) || (action === 'draft' && extra.mode === 'replace') || (action === 'exec_summary' && extra.mode === 'replace') ? 'replace' : 'append';
      insertAi(r.html, mode);
      const newHtml = editor.getHTML();
      setHtml(newHtml);
      clearTimeout(saveTimer.current);
      await save(newHtml, { ai: { action, engine: r.engine, model: r.model, promptVersion: r.promptVersion, generatedHtml: r.html, sources: r.sources || [] } });
      toast(`${action === 'draft' ? 'Draft' : action.replace('_', ' ')} added by the ${r.engine === 'claude' ? `Claude (${r.model})` : 'offline engine'}${r.stats ? `: ${r.stats.cited} of ${r.stats.sentences} sentences cited, ${r.stats.flagged} flagged “needs evidence”` : ''}. Review the highlighted AI text.${r.fallbackReason ? ` (${r.fallbackReason})` : ''}`, 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };

  const insertLibrary = (hit) => {
    if (!editable) { toast('Open the section for editing first.', 'error'); return; }
    const c = hit.item;
    const cite = `<cite data-src="lib:${c.item.id}@${c.v}" data-label="${c.item.key}" data-kind="library">${c.item.key}</cite>`;
    const body = c.html.replace(/<\/p>/, `${cite}</p>`);
    editor.chain().focus().insertContentAt(editor.state.selection.to, body).run();
    toast(`Inserted ${c.item.key} v${c.v}${c.mode === 'anonymised' ? ' (anonymised variant)' : ''}. The bid records the exact version used.`, 'success');
  };

  const selectionText = () => { const { from, to } = editor.state.selection; return editor.state.doc.textBetween(from, to, ' ').trim(); };
  const openComment = (suggest) => { const quote = selectionText(); if (!quote) return; setComment({ quote, text: '', suggestion: suggest ? quote : null }); setTab('comments'); };
  const addComment = async () => {
    await dispatch('comment.add', { bidId: bid.id, sectionId, quote: comment.quote, text: comment.text, suggestion: comment.suggestion !== null ? { replacement: comment.suggestion } : null }, { success: comment.suggestion !== null ? 'Suggestion added' : 'Comment added' });
    setComment(null);
  };
  const acceptSuggestion = async (c) => {
    if (!editable) { toast('Open the section for editing to accept suggestions.', 'error'); return; }
    const range = findQuote(editor.state.doc, c.quote);
    if (!range) { toast('The suggested text has changed since the suggestion was made.', 'error'); return; }
    editor.chain().focus().insertContentAt(range, c.suggestion.replacement).run();
    const h = editor.getHTML();
    clearTimeout(saveTimer.current);
    await save(h, { label: 'Accepted suggestion' });
    await dispatch('comment.resolve', { bidId: bid.id, sectionId, commentId: c.id, status: 'accepted' }, { success: 'Suggestion accepted' });
  };

  const approval = sectionApproval(bid, section);
  const openComments = (section.comments || []).filter((c) => c.status === 'open');
  const words = wordCount(htmlToText(html));
  const idx = bid.sections.findIndex((s) => s.id === section.id);
  const prev = bid.sections[idx - 1], next = bid.sections[idx + 1];
  const myScores = (section.scores || []).filter((s) => s.by === me.id);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <Link className="btn btn-sm btn-ghost" to={`/bids/${bid.id}/sections`}><Icon name="back" size={14} />Sections</Link>
          <h2 style={{ margin: 0 }}>{section.title}</h2>
          <SectionStatus status={section.status} />
          <span className="mini">v{section.v} · owner {userName(section.ownerId)} · due {fmtDate(section.due)}</span>
          {others.length > 0 && <span className="avatar-stack" title="Also here">{[...new Map(others.map((o) => [o.userId, o])).values()].map((o) => <Avatar key={o.userId} id={o.userId} online />)}</span>}
        </div>
        <div className="row">
          <span className="mini" aria-live="polite">{saving === 'saving' ? 'Saving…' : saving === 'pending' ? 'Unsaved changes' : saving === 'saved' ? 'All changes saved' : saving === 'error' ? 'Not saved' : ''}</span>
          <label className="check small"><input type="checkbox" checked={showAi} onChange={(e) => setShowAi(e.target.checked)} /><span>Highlight AI text</span></label>
          {canEditRole && ['drafting', 'not_started'].includes(section.status) && <button className="btn btn-primary" onClick={async () => { clearTimeout(saveTimer.current); if (saving === 'pending') await save(editor.getHTML()); dispatch('section.submit', { bidId: bid.id, sectionId }, { success: 'Marked ready for review; reviewers notified' }); }}>Mark ready for review</button>}
          {reviewer && section.status === 'in_review' && <><button className="btn btn-primary" onClick={() => setModal('approve')} disabled={!approval.outstanding.includes(me.id) && section.reviewers?.length > 0}>Approve v{section.v}</button><button className="btn" onClick={() => setModal('changes')}>Request changes</button></>}
          {planner && ['approved', 'locked'].includes(section.status) && !closed && <button className="btn" onClick={() => setModal('reopen')}>Reopen</button>}
        </div>
      </div>
      {section.brief && <div className="callout"><strong>Brief:</strong> {section.brief}{section.wordLimit ? ` · Word limit ${section.wordLimit}` : ''}</div>}
      {section.status === 'locked' && <div className="lock-banner locked"><Icon name="lock" size={16} />Locked by gate {section.lockedBy?.slice(1)} ({section.lockedBy === 'g2' ? 'commercial approval' : 'partner sign-off'}). The approved snapshot cannot change. {planner ? 'Reopening it voids the gate’s approvals and notifies the approvers.' : 'Ask the bid manager to reopen it.'}</div>}
      {lock === 'other' && holder && <div className="lock-banner"><Icon name="lock" size={16} /><span style={{ flex: 1 }}>{userName(holder.userId)} is editing this section, so it is read-only for you (section-level locking). It unlocks when they leave or after 10 minutes of inactivity.</span>{planner && <button className="btn btn-sm" onClick={() => dispatch('section.breakLock', { bidId: bid.id, sectionId }, { success: 'Lock released' }).then(() => setLock('none'))}>Release lock</button>}</div>}
      {checks.ai > 0 && <div className="lock-banner ai"><Icon name="ai" size={16} /><span style={{ flex: 1 }}><strong>{checks.ai} AI passage{checks.ai === 1 ? '' : 's'}</strong> awaiting human review (highlighted in purple). Edit them or choose “Accept AI”. Approval is blocked until none remain (WD-03).</span></div>}
      {!canEditRole && <div className="callout">You can read and comment on this section. Only its owner, contributors, the bid manager and the partner can edit it.</div>}
      <div className="editor-shell">
        <div className="editor-card">
          <Toolbar editor={editor} editable={editable} onComment={() => openComment(false)} onSuggest={() => openComment(true)} words={words} limit={section.wordLimit} />
          <div className={showAi ? '' : 'hide-ai'} onClick={(e) => { const id = e.target.closest?.('[data-comment]')?.getAttribute('data-comment'); if (id) { setActiveComment(id); setTab('comments'); } }}>
            <EditorContent editor={editor} />
          </div>
          <div className="sticky-actions" style={{ justifyContent: 'space-between' }}>
            <div className="row">{prev && <Link className="btn btn-sm" to={`/bids/${bid.id}/sections/${prev.id}`}>← {truncate(prev.title, 28)}</Link>}</div>
            <div className="row small muted">{editable ? 'Editing' : lock === 'other' ? 'Read-only (locked by another user)' : 'Read-only'}{section.lastEditedBy ? ` · last edited by ${userName(section.lastEditedBy)}` : ''} <When at={section.updatedAt} /></div>
            <div className="row">{next && <Link className="btn btn-sm" to={`/bids/${bid.id}/sections/${next.id}`}>{truncate(next.title, 28)} →</Link>}</div>
          </div>
        </div>

        <div className="side-panel">
          <div className="side-tabs" role="tablist">
            {[['ai', 'AI assist'], ['sources', 'Sources'], ['comments', `Comments${openComments.length ? ` (${openComments.length})` : ''}`], ['reqs', 'Reqs'], ['history', 'History'], ['checks', 'Checks']].map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>)}
          </div>

          {tab === 'ai' && (
            <Card title="AI assist" subtitle={aiOn ? 'Drafts use only approved library content and this bid’s documents, and cite every source.' : 'AI is switched off for this bid.'}>
              <div className="stack" style={{ gap: 8 }}>
                {/exec/i.test(`${section.key} ${section.title}`) ? (
                  <button className="btn btn-primary" disabled={!aiOn || !editable || Boolean(busy)} onClick={() => ai('exec_summary', { mode: html.trim() ? 'append' : 'replace' })}><Icon name="ai" size={14} />{busy === 'exec_summary' ? 'Drafting…' : 'Draft executive summary from the other sections'}</button>
                ) : (
                  <button className="btn btn-primary" disabled={!aiOn || !editable || Boolean(busy)} onClick={() => ai('draft', { mode: html.replace(/<p><\/p>/g, '').trim() ? 'append' : 'replace' })}><Icon name="ai" size={14} />{busy === 'draft' ? 'Drafting…' : html.trim() ? 'Draft more and append' : 'Draft this section'}</button>
                )}
                <button className="btn" disabled={!aiOn || !editable || Boolean(busy) || !html.trim()} onClick={() => ai('shorten')}>{busy === 'shorten' ? 'Shortening…' : `Shorten to ${section.wordLimit ? `${section.wordLimit} words` : '80%'}`}</button>
                <button className="btn" disabled={!aiOn || !editable || Boolean(busy) || !html.trim()} onClick={() => ai('strengthen')}>{busy === 'strengthen' ? 'Working…' : 'Strengthen against the evaluation criteria'}</button>
                <button className="btn" disabled={!aiOn || Boolean(busy) || !reqs.length} onClick={() => ai('check')}>{busy === 'check' ? 'Checking…' : `Check against ${reqs.length} linked requirement${reqs.length === 1 ? '' : 's'}`}</button>
                <button className="btn" disabled={!aiOn || !editable || Boolean(busy)} onClick={() => setModal('tailor')}>Tailor a case study to this client</button>
              </div>
              <p className="mini" style={{ marginBottom: 0 }}>AI text is highlighted until a person accepts or edits it. Sentences without a source are flagged “needs evidence”. Every AI call is logged with its model, prompt version and sources.</p>
            </Card>
          )}

          {tab === 'sources' && (
            <>
              <Card title="Sources cited" subtitle="Each citation records the exact library version (CL-06)">
                {!(section.citations || []).length && <p className="muted small">No citations yet.</p>}
                {(section.citations || []).map((c) => {
                  const p = parseSrc(c.src);
                  const item = p?.kind === 'library' ? view.library.find((i) => i.id === p.id) : null;
                  const req = p?.kind === 'request' ? bid.requirements.find((r) => r.id === p.id) : null;
                  const con = p?.kind === 'consultant' ? view.consultants.find((x) => x.id === p.id) : null;
                  return (
                    <div key={c.src} className="src-item">
                      <cite data-kind={p?.kind === 'request' ? 'request' : p?.kind === 'consultant' ? 'consultant' : 'library'}>{c.label}</cite>
                      <div style={{ flex: 1 }}>
                        {item && <><Link to={`/library/${item.id}`}>{item.title}</Link><div className="mini">{libTypeLabel(item.type)} · v{p.v}{item.retired ? ' · retired' : ''}</div>{newerVersionAvailable(item, p.v) && <div className="mini" style={{ color: 'var(--st-serious)' }}>Newer approved version v{item.approvedV} available. Review and update the text.</div>}</>}
                        {req && <><strong>{req.ref}</strong> <span className="small">{truncate(req.text, 110)}</span></>}
                        {con && <><Link to={`/consultants/${con.id}`}>{con.name}</Link><div className="mini">Consultant profile</div></>}
                        {p?.kind === 'document' && <span className="small">Client request document</span>}
                        {p?.kind === 'section' && <span className="small">Section: {bid.sections.find((s) => s.id === p.id)?.title}</span>}
                      </div>
                    </div>
                  );
                })}
              </Card>
              <Card title="Content library" subtitle="Approved content only. Other clients’ confidential items appear anonymised or not at all.">
                <input type="search" placeholder="Search the library" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 10 }} aria-label="Search the library" />
                <div className="stack" style={{ gap: 8 }}>
                  {results.map((r) => (
                    <div key={r.id} className="lib-hit">
                      <div className="h">{r.item.title}</div>
                      <div className="mini">{r.item.item.key} · {libTypeLabel(r.item.item.type)} · v{r.item.v}{r.item.mode === 'anonymised' ? ' · anonymised' : ''}</div>
                      <p className="clamp-3">{truncate(r.item.text, 240)}</p>
                      <div className="row"><button className="btn btn-sm" disabled={!editable} onClick={() => insertLibrary(r)}>Insert with citation</button><Link className="btn btn-sm btn-ghost" to={`/library/${r.item.item.id}`}>Open</Link></div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {tab === 'comments' && (
            <Card title="Comments and suggestions" subtitle="Select text in the section to comment or suggest a change. Use @Name to mention someone.">
              {comment && (
                <div className="comment active" style={{ marginBottom: 10 }}>
                  <div className="q">“{truncate(comment.quote, 160)}”</div>
                  {comment.suggestion !== null && <Field label="Replace with"><textarea value={comment.suggestion} onChange={(e) => setComment({ ...comment, suggestion: e.target.value })} /></Field>}
                  <Field label="Comment"><textarea value={comment.text} onChange={(e) => setComment({ ...comment, text: e.target.value })} placeholder="Add a comment. @Name mentions notify people." autoFocus /></Field>
                  <div className="row" style={{ marginTop: 6 }}><button className="btn btn-sm btn-primary" disabled={!comment.text.trim() && comment.suggestion === null} onClick={addComment}>{comment.suggestion !== null ? 'Suggest' : 'Comment'}</button><button className="btn btn-sm" onClick={() => setComment(null)}>Cancel</button></div>
                </div>
              )}
              {!can('comment', { bid }) && <p className="mini">Your role can read comments but not add them.</p>}
              <CommentList bid={bid} section={section} active={activeComment} setActive={setActiveComment} onAccept={acceptSuggestion} editable={editable} />
            </Card>
          )}

          {tab === 'reqs' && (
            <Card title="Linked requirements" subtitle="Mapped on the compliance matrix">
              {!reqs.length && <p className="muted small">No requirements are mapped to this section.</p>}
              {reqs.map((r) => {
                const res = checkRes?.find((x) => x.reqId === r.id);
                return (
                  <div key={r.id} className="src-item">
                    <strong style={{ minWidth: 42 }}>{r.ref}</strong>
                    <div style={{ flex: 1 }}>
                      <div className="small">{r.text}</div>
                      <div className="row" style={{ marginTop: 4 }}>
                        <select value={r.compliance || ''} onChange={(e) => dispatch('req.update', { bidId: bid.id, reqId: r.id, patch: { compliance: e.target.value } })} aria-label={`Compliance for ${r.ref}`} disabled={!canEditRole && !planner}>{COMPLIANCE.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                        {res && <span className={`pill ${res.status === 'addressed' ? 'good' : res.status === 'partial' ? 'warn' : 'bad'}`}>{res.status} ({Math.round(res.score * 100)}%)</span>}
                      </div>
                      {res?.missing?.length > 0 && res.status !== 'addressed' && <div className="mini">Not yet mentioned: {res.missing.join(', ')}</div>}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {tab === 'history' && (
            <Card title="Version history" subtitle="Compare any two versions, or restore one as a new version (WF-05)">
              {compare.length === 2 && <button className="btn btn-sm btn-primary" style={{ marginBottom: 8 }} onClick={() => setModal('diff')}>Compare v{Math.min(...compare)} and v{Math.max(...compare)}</button>}
              {[...section.versions].reverse().map((v) => (
                <div key={v.v} className="src-item">
                  <input type="checkbox" checked={compare.includes(v.v)} onChange={() => setCompare(compare.includes(v.v) ? compare.filter((x) => x !== v.v) : [...compare.slice(-1), v.v])} aria-label={`Select v${v.v} to compare`} />
                  <div style={{ flex: 1 }}>
                    <strong>v{v.v}</strong> {v.label && <span className="pill teal">{v.label}</span>} {v.ai && <span className="pill ai">AI {v.ai.action}</span>} {(section.approvals || []).some((a) => a.v === v.v && !a.void) && <span className="pill good">approved</span>}
                    <div className="mini">{userName(v.by)} · <When at={v.at} /> · {v.words} words</div>
                    {(bid.snapshots || []).filter((sn) => sn.sections.some((x) => x.id === section.id && x.v === v.v)).map((sn) => <div key={sn.id} className="mini">📌 {sn.label}</div>)}
                  </div>
                  {canEditRole && section.status !== 'locked' && v.v !== section.v && <button className="btn btn-sm btn-ghost" onClick={() => setModal({ restore: v.v })}>Restore</button>}
                </div>
              ))}
              {!section.versions.length && <p className="muted small">No versions yet.</p>}
            </Card>
          )}

          {tab === 'checks' && checks && (
            <Card title="Section checks" subtitle="The full set runs before outputs are marked final">
              <div className="check-row"><span className={`ic ${section.wordLimit && checks.words > section.wordLimit ? 'fail' : 'pass'}`}>{section.wordLimit && checks.words > section.wordLimit ? '✕' : '✓'}</span><div>{checks.words} words{section.wordLimit ? ` of ${section.wordLimit}` : ''}</div></div>
              <div className="check-row"><span className={`ic ${checks.ai ? 'fail' : 'pass'}`}>{checks.ai ? '✕' : '✓'}</span><div>{checks.ai ? `${checks.ai} AI passage(s) awaiting review` : 'No unreviewed AI text'}</div></div>
              <div className="check-row"><span className={`ic ${checks.flags ? 'fail' : 'pass'}`}>{checks.flags ? '✕' : '✓'}</span><div>{checks.flags ? `${checks.flags} sentence(s) flagged “needs evidence”` : 'No evidence flags'}</div></div>
              <div className="check-row"><span className={`ic ${checks.openComments ? 'warn' : 'pass'}`}>{checks.openComments ? '!' : '✓'}</span><div>{checks.openComments ? `${checks.openComments} open comment(s)` : 'No open comments'}</div></div>
              <div className="check-row"><span className={`ic ${checks.spelling.length ? 'warn' : 'pass'}`}>{checks.spelling.length ? '!' : '✓'}</span><div>{checks.spelling.length ? <>Australian English: {checks.spelling.map((s) => `${s.word} → ${s.fix}`).join(', ')}</> : 'Australian English spelling'}</div></div>
              <div className="check-row"><span className={`ic ${checks.style.some((s) => s.kind === 'banned') ? 'fail' : checks.style.length ? 'warn' : 'pass'}`}>{checks.style.some((s) => s.kind === 'banned') ? '✕' : checks.style.length ? '!' : '✓'}</span><div>{checks.style.length ? checks.style.map((s) => (s.kind === 'banned' ? `Banned phrase “${s.phrase}”` : `Use “${s.use}” not “${s.phrase}”`)).join('; ') : 'Style guide followed'}</div></div>
              <div className="check-row"><span className={`ic ${checks.otherClients.some((c) => !c.consented) ? 'fail' : checks.otherClients.length ? 'warn' : 'pass'}`}>{checks.otherClients.some((c) => !c.consented) ? '✕' : checks.otherClients.length ? '!' : '✓'}</span><div>{checks.otherClients.length ? checks.otherClients.map((c) => `${c.name}${c.consented ? ' (consented)' : ' (not consented)'}`).join(', ') : 'No other client names'}</div></div>
            </Card>
          )}

          {reviewer && (
            <ScoreCard bid={bid} section={section} existing={myScores} />
          )}
          {section.approvals?.length > 0 && (
            <Card title="Approvals" subtitle={approval.complete ? 'All required reviewers have approved the current version' : `${approval.outstanding.filter((x) => x !== 'any').length || 1} approval(s) outstanding for v${section.v}`}>
              {section.approvals.map((a) => <div key={a.id} className={`decision ${a.void ? 'void' : ''}`}><Avatar id={a.by} size="sm" /><div className="small"><strong>{userName(a.by)}</strong> approved v{a.v} · <When at={a.at} />{a.void && <div className="mini">Voided: {a.voidReason}</div>}{a.comment && <div className="muted">{a.comment}</div>}</div></div>)}
            </Card>
          )}
        </div>
      </div>

      {modal === 'diff' && compare.length === 2 && (() => {
        const [a, b] = [...compare].sort((x, y) => x - y).map((v) => section.versions.find((x) => x.v === v));
        return <Modal title={`Compare v${a.v} and v${b.v}`} onClose={() => setModal(null)}><div style={{ width: 'min(1000px, 86vw)' }}><DiffView a={a.html} b={b.html} labels={[`v${a.v} · ${userName(a.by)}`, `v${b.v} · ${userName(b.by)}`]} /></div></Modal>;
      })()}
      {modal?.restore && <Confirm title={`Restore v${modal.restore}?`} confirmLabel="Restore as a new version" onClose={() => setModal(null)} onConfirm={async () => { await dispatch('section.restore', { bidId: bid.id, sectionId, v: modal.restore }, { success: `Restored v${modal.restore}` }); }}>The current text is kept in the history. Restoring creates a new version{section.status === 'approved' ? ' and voids the current approval' : ''}.</Confirm>}
      {modal === 'approve' && <Confirm title={`Approve “${section.title}” v${section.v}`} confirmLabel="Approve" onClose={() => setModal(null)} onConfirm={async (text) => dispatch('section.approve', { bidId: bid.id, sectionId, comment: text }, { success: 'Approved' })} requireText={null}>You are signing off this exact version. Any later edit voids your approval and notifies you.</Confirm>}
      {modal === 'changes' && <Confirm title="Request changes" confirmLabel="Send back to the author" onClose={() => setModal(null)} requireText="What needs to change?" onConfirm={(text) => dispatch('section.requestChanges', { bidId: bid.id, sectionId, comment: text }, { success: 'Changes requested; the author was notified' })}>The section returns to drafting.</Confirm>}
      {modal === 'reopen' && <Confirm title={`Reopen “${section.title}”?`} confirmLabel="Reopen" danger onClose={() => setModal(null)} requireText="Reason (recorded in the audit trail)" onConfirm={(text) => dispatch('section.reopen', { bidId: bid.id, sectionId, reason: text }, { success: 'Section reopened; approvals voided and approvers notified' })}>{section.status === 'locked' ? 'The gate that locked this section is reopened and its approvals are voided.' : 'The section’s approvals are voided.'}</Confirm>}
      {modal === 'tailor' && <TailorModal bid={bid} onClose={() => setModal(null)} onPick={(item) => { setModal(null); ai('tailor', { item }); }} />}
      <span hidden>{nav && ''}</span>
    </div>
  );
}

function CommentList({ bid, section, active, setActive, onAccept, editable }) {
  const { dispatch, me, userName } = useP();
  const [reply, setReply] = useState({});
  const [showResolved, setShowResolved] = useState(false);
  const list = (section.comments || []).filter((c) => showResolved || c.status === 'open');
  return (
    <div className="stack" style={{ gap: 8 }}>
      {list.map((c) => (
        <div key={c.id} className={`comment ${active === c.id ? 'active' : ''}`} onClick={() => setActive(c.id)}>
          <div className="row" style={{ justifyContent: 'space-between' }}><span className="row" style={{ gap: 6 }}><Avatar id={c.by} size="sm" /><strong>{userName(c.by)}</strong></span><span className="mini"><When at={c.at} /></span></div>
          {c.kind === 'change-request' && <span className="pill warn">Changes requested</span>}
          {c.quote && <div className="q">“{truncate(c.quote, 140)}”</div>}
          {c.suggestion && <div className="sugg"><del>{truncate(c.quote, 100)}</del> → <ins>{c.suggestion.replacement}</ins></div>}
          {c.text && <div>{c.text}</div>}
          {c.replies.map((r) => <div key={r.id} className="reply"><strong>{userName(r.by)}</strong>: {r.text} <span className="mini"><When at={r.at} /></span></div>)}
          {c.status !== 'open' ? <div className="mini" style={{ marginTop: 6 }}>{c.status} by {userName(c.resolvedBy)}</div> : (
            <div className="row" style={{ marginTop: 8 }}>
              <input type="text" placeholder="Reply…" value={reply[c.id] || ''} onChange={(e) => setReply({ ...reply, [c.id]: e.target.value })} style={{ flex: 1, minWidth: 120 }} onKeyDown={(e) => { if (e.key === 'Enter' && reply[c.id]?.trim()) { dispatch('comment.reply', { bidId: bid.id, sectionId: section.id, commentId: c.id, text: reply[c.id] }); setReply({ ...reply, [c.id]: '' }); } }} />
              {c.suggestion && editable && <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); onAccept(c); }}>Accept</button>}
              {c.suggestion && editable && <button className="btn btn-sm" onClick={() => dispatch('comment.resolve', { bidId: bid.id, sectionId: section.id, commentId: c.id, status: 'rejected' })}>Reject</button>}
              {(!c.suggestion || c.by === me.id) && <button className="btn btn-sm" onClick={() => dispatch('comment.resolve', { bidId: bid.id, sectionId: section.id, commentId: c.id, status: 'resolved' })}>Resolve</button>}
            </div>
          )}
        </div>
      ))}
      {!list.length && <p className="muted small">No open comments.</p>}
      <label className="check small"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /><span>Show resolved</span></label>
    </div>
  );
}

function ScoreCard({ bid, section, existing }) {
  const { dispatch } = useP();
  const [round, setRound] = useState('solution');
  const cur = existing.find((s) => s.round === round);
  const [scores, setScores] = useState(cur?.scores || {});
  const [comment, setComment] = useState(cur?.comment || '');
  useEffect(() => { const c = existing.find((s) => s.round === round); setScores(c?.scores || {}); setComment(c?.comment || ''); }, [round]); // eslint-disable-line react-hooks/exhaustive-deps
  const linked = bid.criteria.filter((c) => bid.requirements.some((r) => r.criterionId === c.id && (r.sectionIds || []).includes(section.id)));
  const crit = linked.length ? linked : bid.criteria;
  if (!crit.length) return null;
  return (
    <Card title="Score this section" subtitle="Against the client’s evaluation criteria, 0 to 10 (WF-09)">
      <select value={round} onChange={(e) => setRound(e.target.value)} aria-label="Review round" style={{ marginBottom: 8 }}>{REVIEW_ROUNDS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      {crit.map((c) => (
        <div key={c.id} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
          <span className="small" style={{ flex: 1 }}>{c.name}{c.weight ? ` (${c.weight}%)` : ''}</span>
          <input type="number" min="0" max="10" value={scores[c.id] ?? ''} onChange={(e) => setScores({ ...scores, [c.id]: e.target.value })} style={{ width: 70 }} aria-label={`Score for ${c.name}`} />
        </div>
      ))}
      <textarea placeholder="Reviewer notes" value={comment} onChange={(e) => setComment(e.target.value)} style={{ minHeight: 50, marginTop: 6 }} />
      <button className="btn btn-sm btn-primary" style={{ marginTop: 6 }} onClick={() => dispatch('review.score', { bidId: bid.id, sectionId: section.id, round, scores, comment }, { success: 'Scores saved' })}>Save scores</button>
    </Card>
  );
}

function TailorModal({ bid, onClose, onPick }) {
  const { view } = useP();
  const items = view.library.filter((i) => i.type === 'case_study' && i.approvedV && !i.retired);
  return (
    <Modal title="Tailor a case study to this client" onClose={onClose}>
      <p className="small" style={{ marginTop: 0 }}>The case study is re-ordered around this bid’s requirements and linked to them. Confidential case studies of other clients are used in their anonymised form.</p>
      {items.map((i) => {
        const v = approvedVersion(i);
        return <button key={i.id} className="menu-item" onClick={() => onPick(i)}><strong>{i.key}</strong> {v.title}<div className="mini">{v.fields?.client} · {v.fields?.sector}{i.confidential && i.consent !== 'yes' ? ' · will be anonymised' : ''}</div></button>;
      })}
    </Modal>
  );
}
