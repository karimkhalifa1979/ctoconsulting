// Tiptap extensions for grounded, reviewable authoring.
import { Mark, Node, Extension, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// AI text stays labelled until a person accepts or edits it (WD-03).
export const AiText = Mark.create({
  name: 'aiText',
  inclusive: false,
  addAttributes() { return { state: { default: 'pending', parseHTML: (el) => el.getAttribute('data-ai') || 'pending', renderHTML: (a) => ({ 'data-ai': a.state }) } }; },
  parseHTML() { return [{ tag: 'span[data-ai]' }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { class: 'ai-text', title: 'AI-generated text awaiting human review' }), 0]; },
  addCommands() {
    return {
      acceptAi: () => ({ tr, state, dispatch }) => {
        const { from, to, empty } = state.selection;
        const type = state.schema.marks.aiText;
        if (dispatch) { tr.setMeta('aiAccept', true); tr.removeMark(empty ? 0 : from, empty ? state.doc.content.size : to, type); }
        return true;
      },
    };
  },
});

// Sentences with no source are flagged "needs evidence" (WD-02).
export const EvidenceFlag = Mark.create({
  name: 'evidenceFlag',
  inclusive: false,
  addAttributes() { return { flag: { default: 'needs-evidence', parseHTML: (el) => el.getAttribute('data-flag'), renderHTML: (a) => ({ 'data-flag': a.flag }) } }; },
  parseHTML() { return [{ tag: 'mark[data-flag]' }]; },
  renderHTML({ HTMLAttributes }) { return ['mark', mergeAttributes(HTMLAttributes, { class: 'flag-ne', title: 'Needs evidence: add a source or rewrite' }), 0]; },
  addCommands() {
    return {
      clearFlag: () => ({ tr, state, dispatch }) => {
        const { from, to, empty } = state.selection;
        const type = state.schema.marks.evidenceFlag;
        if (dispatch) {
          if (empty) {
            // Clear the flag around the cursor.
            const $p = state.doc.resolve(from);
            const start = $p.start(), end = $p.end();
            tr.removeMark(start, end, type);
          } else tr.removeMark(from, to, type);
        }
        return true;
      },
    };
  },
});

// Citation to a library item version, a request clause or a consultant profile.
export const Citation = Node.create({
  name: 'citation',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null, parseHTML: (el) => el.getAttribute('data-src'), renderHTML: (a) => ({ 'data-src': a.src }) },
      label: { default: '', parseHTML: (el) => el.getAttribute('data-label') || el.textContent, renderHTML: (a) => ({ 'data-label': a.label }) },
      kind: { default: null, parseHTML: (el) => el.getAttribute('data-kind'), renderHTML: (a) => (a.kind ? { 'data-kind': a.kind } : {}) },
    };
  },
  parseHTML() { return [{ tag: 'cite[data-src]' }]; },
  renderHTML({ node, HTMLAttributes }) { return ['cite', mergeAttributes(HTMLAttributes, { class: 'cite', title: `Source: ${node.attrs.label}` }), node.attrs.label || 'source']; },
  renderText({ node }) { return ` [${node.attrs.label}]`; },
});

// Editing any paragraph that contains AI text counts as human review of that paragraph.
export const AiEditTracker = Extension.create({
  name: 'aiEditTracker',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('aiEditTracker'),
      appendTransaction(trs, oldState, newState) {
        const type = newState.schema.marks.aiText;
        if (!type) return null;
        const user = trs.filter((t) => t.docChanged && !t.getMeta('aiInsert') && !t.getMeta('aiAccept') && !t.getMeta('preventUpdate') && t.getMeta('addToHistory') !== false);
        if (!user.length) return null;
        let tr = null;
        for (const t of user) {
          for (const step of t.steps) {
            step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
              const from = Math.max(0, Math.min(newStart, newState.doc.content.size));
              const to = Math.max(from, Math.min(newEnd, newState.doc.content.size));
              newState.doc.nodesBetween(from, to, (node, pos) => {
                if (!node.isTextblock) return true;
                let has = false;
                node.descendants((c) => { if (c.marks.some((m) => m.type === type)) has = true; });
                if (has) { tr = tr || newState.tr; tr.removeMark(pos, pos + node.nodeSize, type); }
                return false;
              });
            });
          }
        }
        if (tr) tr.setMeta('aiEdited', true);
        return tr;
      },
    })];
  },
});

// Highlights the text that open comments are anchored to.
export const CommentHighlights = Extension.create({
  name: 'commentHighlights',
  addOptions() { return { getComments: () => [], activeId: () => null }; },
  addProseMirrorPlugins() {
    const opts = this.options;
    return [new Plugin({
      key: new PluginKey('commentHighlights'),
      props: {
        decorations(state) {
          const comments = opts.getComments().filter((c) => c.status === 'open' && c.quote);
          if (!comments.length) return null;
          const decos = [];
          // Build a flat text index of the document to find quotes across text nodes.
          let text = '';
          const map = [];
          state.doc.descendants((node, pos) => {
            if (node.isText) { for (let i = 0; i < node.text.length; i++) { map.push(pos + i); } text += node.text; } else if (node.isBlock && text.length && !text.endsWith('\n')) { text += '\n'; map.push(-1); }
          });
          for (const c of comments) {
            const idx = text.indexOf(c.quote);
            if (idx < 0) continue;
            const from = map[idx], to = map[idx + c.quote.length - 1];
            if (from < 0 || to < 0) continue;
            decos.push(Decoration.inline(from, to + 1, { class: `comment-anchor ${opts.activeId() === c.id ? 'active' : ''}`, 'data-comment': c.id }));
          }
          return DecorationSet.create(state.doc, decos);
        },
      },
    })];
  },
});

// Finds the document range of a quote (for accepting suggestions).
export function findQuote(doc, quote) {
  let text = '';
  const map = [];
  doc.descendants((node, pos) => {
    if (node.isText) { for (let i = 0; i < node.text.length; i++) map.push(pos + i); text += node.text; } else if (node.isBlock && text.length && !text.endsWith('\n')) { text += '\n'; map.push(-1); }
  });
  const idx = text.indexOf(quote);
  if (idx < 0) return null;
  const from = map[idx], to = map[idx + quote.length - 1];
  if (from < 0 || to < 0) return null;
  return { from, to: to + 1 };
}
