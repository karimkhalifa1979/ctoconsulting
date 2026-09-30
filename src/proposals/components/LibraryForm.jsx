// Type-aware editor for library item versions (spec section 8). Rich text is edited as plain paragraphs:
// a blank line starts a paragraph and lines starting with "- " become a bulleted list.
import { Field, TagInput, UserSelect } from './common.jsx';
import { useP } from '../lib/store.jsx';
import { escapeHtml, htmlToText } from '../core/util.js';
import { parseHtml, textOf } from '../core/html.js';

export function textToHtml(text) {
  const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b) => {
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li><p>${escapeHtml(l.replace(/^\s*[-•*]\s+/, ''))}</p></li>`).join('')}</ul>`;
    if (/^#{1,3}\s/.test(b)) return `<h3>${escapeHtml(b.replace(/^#+\s*/, ''))}</h3>`;
    return `<p>${escapeHtml(lines.join(' '))}</p>`;
  }).join('');
}

export function htmlToEditable(html) {
  if (!html) return '';
  try {
    const root = parseHtml(html);
    const out = [];
    for (const n of root.children || []) {
      if (n.name === 'ul' || n.name === 'ol') out.push((n.children || []).filter((c) => c.name === 'li').map((li) => `- ${textOf(li).trim()}`).join('\n'));
      else if (/^h[1-4]$/.test(n.name || '')) out.push(`### ${textOf(n).trim()}`);
      else if (n.name) out.push(textOf(n).trim());
      else if (n.text?.trim()) out.push(n.text.trim());
    }
    return out.filter(Boolean).join('\n\n');
  } catch {
    return htmlToText(html);
  }
}

const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/\n|;/).map((x) => x.trim()).filter(Boolean));

// value: { title, body (editable text), topic, variants, fields, anonymised, issuer, offering, phases, deliverables, alt, usageRights }
export function VersionFields({ type, value, onChange, disabled }) {
  const { view } = useP();
  const f = value.fields || {};
  const set = (patch) => onChange({ ...value, ...patch });
  const setF = (patch) => onChange({ ...value, fields: { ...f, ...patch } });
  const tx = view.taxonomy;
  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="form-grid">
        <Field label="Title" full><input value={value.title || ''} onChange={(e) => set({ title: e.target.value })} /></Field>
        {type === 'case_study' && <>
          <Field label="Client"><input list="lf-clients" value={f.client || ''} onChange={(e) => setF({ client: e.target.value })} /><datalist id="lf-clients">{view.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist></Field>
          <Field label="Sector"><select value={f.sector || ''} onChange={(e) => setF({ sector: e.target.value })}><option value="">—</option>{tx.sectors.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Services"><TagInput value={f.services || []} options={tx.offerings} onChange={(v) => setF({ services: v })} /></Field>
          <Field label="Technologies"><TagInput value={f.technologies || []} options={tx.technologies} onChange={(v) => setF({ technologies: v })} /></Field>
          <Field label="Contract value (AUD)"><input type="number" value={f.value || ''} onChange={(e) => setF({ value: Number(e.target.value) || null })} /></Field>
          <Field label="Dates"><div className="row"><input type="date" value={f.start || ''} onChange={(e) => setF({ start: e.target.value })} aria-label="Start" /><input type="date" value={f.end || ''} onChange={(e) => setF({ end: e.target.value })} aria-label="End" /></div></Field>
          <Field label="Summary" full><textarea rows={3} value={f.summary || ''} onChange={(e) => setF({ summary: e.target.value })} /></Field>
          <Field label="Challenge" full><textarea rows={2} value={f.challenge || ''} onChange={(e) => setF({ challenge: e.target.value })} /></Field>
          <Field label="Approach" full><textarea rows={2} value={f.approach || ''} onChange={(e) => setF({ approach: e.target.value })} /></Field>
          <Field label="Measurable outcomes (one per line)" full><textarea rows={4} value={(f.outcomes || []).join('\n')} onChange={(e) => setF({ outcomes: e.target.value.split('\n') })} onBlur={(e) => setF({ outcomes: list(e.target.value) })} /></Field>
          <Field label="Referee"><input value={f.referee || ''} onChange={(e) => setF({ referee: e.target.value })} /></Field>
          <Field label="Anonymised name" hint="Used when the client has not consented to be named (CL-08)"><input value={value.anonymised?.title || f.anonymisedName || ''} placeholder="For example: A NSW Government department" onChange={(e) => set({ anonymised: { ...(value.anonymised || {}), title: e.target.value }, fields: { ...f, anonymisedName: e.target.value } })} /></Field>
        </>}
        {type === 'standard_answer' && <>
          <Field label="Topic"><input value={value.topic || ''} onChange={(e) => set({ topic: e.target.value })} /></Field>
          <Field label="Question variants" hint="Other ways clients ask this question"><TagInput value={value.variants || []} onChange={(v) => set({ variants: v })} placeholder="Add a variant…" /></Field>
        </>}
        {type === 'method' && <>
          <Field label="Offering"><select value={value.offering || ''} onChange={(e) => set({ offering: e.target.value })}><option value="">—</option>{tx.offerings.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Phases"><TagInput value={value.phases || []} onChange={(v) => set({ phases: v })} placeholder="Add a phase…" /></Field>
          <Field label="Deliverables" full><TagInput value={value.deliverables || []} onChange={(v) => set({ deliverables: v })} placeholder="Add a deliverable…" /></Field>
        </>}
        {type === 'evidence' && <Field label="Issuer"><input value={value.issuer || ''} onChange={(e) => set({ issuer: e.target.value })} /></Field>}
        {type === 'past_proposal' && <>
          <Field label="Client"><input value={f.client || ''} onChange={(e) => setF({ client: e.target.value })} /></Field>
          <Field label="Outcome"><select value={f.outcome || ''} onChange={(e) => setF({ outcome: e.target.value })}><option value="">—</option><option value="won">Won</option><option value="lost">Lost</option></select></Field>
          <Field label="Value (AUD)"><input type="number" value={f.value || ''} onChange={(e) => setF({ value: Number(e.target.value) || null })} /></Field>
          <Field label="Evaluator feedback" full><textarea rows={2} value={f.feedback || ''} onChange={(e) => setF({ feedback: e.target.value })} /></Field>
        </>}
        {type === 'media' && <>
          <Field label="Alt text (required)"><input value={value.alt || ''} onChange={(e) => set({ alt: e.target.value })} /></Field>
          <Field label="Usage rights"><input value={value.usageRights || ''} onChange={(e) => set({ usageRights: e.target.value })} placeholder="For example: owned, licensed until 2027" /></Field>
        </>}
        {!['case_study', 'media'].includes(type) && (
          <Field label="Content" hint="Blank line between paragraphs; start lines with “- ” for a list" full><textarea rows={10} value={value.body || ''} onChange={(e) => set({ body: e.target.value })} /></Field>
        )}
        {type !== 'case_study' && !['media'].includes(type) && (
          <Field label="Anonymised variant (optional)" hint="Used for other clients when this item is confidential (CL-08)" full><textarea rows={3} value={value.anonBody || ''} onChange={(e) => set({ anonBody: e.target.value })} /></Field>
        )}
      </div>
    </fieldset>
  );
}

export function MetaFields({ type, meta, onChange, disabled }) {
  const { view } = useP();
  const tags = meta.tags || {};
  const setT = (k, v) => onChange({ ...meta, tags: { ...tags, [k]: v } });
  return (
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="form-grid">
        <Field label="Owner"><UserSelect value={meta.ownerId} onChange={(v) => onChange({ ...meta, ownerId: v })} /></Field>
        <Field label="Review date" hint="The owner is reminded before this date (CL-05)"><input type="date" value={meta.reviewDate || ''} onChange={(e) => onChange({ ...meta, reviewDate: e.target.value })} /></Field>
        {type === 'evidence' && <Field label="Expiry date"><input type="date" value={meta.expiry || ''} onChange={(e) => onChange({ ...meta, expiry: e.target.value || null })} /></Field>}
        <Field label="Client-confidential" hint="Names a client or contains pricing"><label className="check"><input type="checkbox" checked={Boolean(meta.confidential)} onChange={(e) => onChange({ ...meta, confidential: e.target.checked })} /><span>Confidential to a client</span></label></Field>
        {(meta.confidential || type === 'case_study') && <>
          <Field label="Client"><select value={meta.clientId || ''} onChange={(e) => onChange({ ...meta, clientId: e.target.value || null })}><option value="">—</option>{view.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Consent to be named"><select value={meta.consent || 'pending'} onChange={(e) => onChange({ ...meta, consent: e.target.value })}><option value="yes">Yes, the client consents</option><option value="no">No</option><option value="pending">Not yet asked</option></select></Field>
        </>}
        {['sectors', 'offerings', 'technologies', 'capabilities', 'regions'].map((k) => (
          <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><TagInput value={tags[k] || []} options={view.taxonomy[k] || []} onChange={(v) => setT(k, v)} /></Field>
        ))}
      </div>
    </fieldset>
  );
}

// Converts an editable form value into the version fields the command layer stores.
export function toVersion(type, v) {
  const out = { title: v.title?.trim() };
  if (type === 'case_study') { out.fields = { ...(v.fields || {}), outcomes: list(v.fields?.outcomes) }; out.anonymised = v.anonymised || (v.fields?.anonymisedName ? { title: v.fields.anonymisedName } : null); }
  else if (type !== 'media') out.body = textToHtml(v.body);
  if (v.anonBody?.trim()) out.anonymised = { ...(out.anonymised || {}), body: textToHtml(v.anonBody) };
  for (const k of ['topic', 'variants', 'issuer', 'offering', 'phases', 'deliverables', 'alt', 'usageRights', 'fileId', 'fileName']) if (v[k] !== undefined) out[k] = v[k];
  if (type === 'past_proposal') out.fields = v.fields || {};
  return out;
}

export function fromVersion(item, ver) {
  return { ...ver, title: ver?.title || item.title, body: htmlToEditable(ver?.body), anonBody: htmlToEditable(ver?.anonymised?.body), fields: ver?.fields || {} };
}
