import { useEffect, useMemo, useState } from 'react';
import Picker from '../components/Picker.jsx';
import { StatusBadge, DueLabel } from '../components/ProposalBits.jsx';
import { FIELDS, SECTIONS, clientOf, missingRequired, personName, readiness, sectionStatus } from '../lib/proposal.js';
import { extOf } from '../lib/selections.js';
import { fmtDate, fmtDateTime } from '../lib/format.js';

const ROLES = ['Engagement Director', 'Engagement Manager', 'Project Manager', 'Program Manager', 'Delivery Manager', 'Scrum Master', 'Business Analyst', 'Solution Architect', 'Enterprise Architect', 'Cyber Security Consultant', 'Test Lead', 'Change Manager', 'Subject Matter Expert'];
const PURPOSES = ['Case study', 'Previous response', 'Methodology', 'Pricing reference', 'Capability statement', 'Sample deliverable', 'Client requirement'];

export default function ProposalEditor({ initial, isNew, library, clientNames, onSave, onDelete, onDirtyChange }) {
  const [draft, setDraft] = useState(initial);
  const [section, setSection] = useState('overview');
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState({ busy: false, error: null, savedAt: null });

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [section]);

  const update = (fn) => { setDraft((d) => fn(d)); setDirty(true); setState((s) => ({ ...s, error: null })); };
  const setField = (id, value) => update((d) => ({ ...d, details: { ...d.details, [id]: value } }));

  const save = async () => {
    if (!String(draft.details.title || '').trim()) {
      setSection('overview');
      setState({ busy: false, error: 'Give the proposal a title before saving.', savedAt: null });
      return;
    }
    setState({ busy: true, error: null, savedAt: null });
    try {
      const saved = await onSave(draft);
      setDraft(saved);
      setDirty(false);
      setState({ busy: false, error: null, savedAt: new Date().toISOString() });
    } catch (e) {
      setState({ busy: false, error: e.message, savedAt: null });
    }
  };

  const idx = SECTIONS.findIndex((s) => s.id === section);
  const current = SECTIONS[idx];
  const d = draft.details;
  const files = useMemo(() => Object.entries(library.proposalFiles).map(([id, e]) => ({ id, ...e })), [library.proposalFiles]);
  const resumes = useMemo(() => Object.entries(library.activeResumes).map(([id, e]) => ({ id, ...e })), [library.activeResumes]);
  const missing = missingRequired(draft);

  return (
    <div className="editor">
      <div className="page-head">
        <div>
          <div className="eyebrow">{isNew ? 'New proposal' : 'Proposal'}</div>
          <h1>{d.title || 'Untitled proposal'}</h1>
          <div className="row small muted head-meta">
            <StatusBadge status={d.status} />
            {d.client && <span>{d.client}</span>}
            {d.dueDate && <span>Due {fmtDate(d.dueDate)} <DueLabel date={d.dueDate} status={d.status} /></span>}
            {draft.updatedAt && <span>Last saved {fmtDateTime(draft.updatedAt)}{draft.updatedBy ? ` by ${draft.updatedBy}` : ''}</span>}
          </div>
        </div>
        <div className="btn-row no-print">
          {!isNew && <button className="btn btn-danger-ghost" onClick={() => onDelete(draft)}>Delete</button>}
          <button className="btn btn-primary" onClick={save} disabled={state.busy || (!dirty && !isNew)}>
            {state.busy ? 'Saving…' : isNew ? 'Save proposal' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>

      {state.error && <div className="alert alert-error">{state.error}</div>}
      {state.savedAt && !dirty && <div className="alert alert-ok no-print">Proposal saved.</div>}
      {dirty && <div className="alert alert-warn no-print">You have unsaved changes to this proposal.</div>}

      <div className="editor-grid">
        <nav className="card section-nav no-print" aria-label="Proposal sections">
          <ol>
            {SECTIONS.map((s, i) => {
              const st = sectionStatus(draft, s);
              return (
                <li key={s.id}>
                  <button className={`snav ${section === s.id ? 'active' : ''}`} onClick={() => setSection(s.id)} aria-current={section === s.id ? 'step' : undefined}>
                    <span className={`snav-mark st-${st.state}`} aria-hidden>{st.state === 'complete' ? '✓' : i + 1}</span>
                    <span className="snav-text">
                      <span className="snav-label">{s.label}</span>
                      <span className="snav-hint">
                        {st.count != null ? `${st.count} added` : st.total != null ? `${st.filled} of ${st.total} filled` : st.state === 'missing' ? `${missing.length} required missing` : 'Ready to submit'}
                        {st.state === 'missing' && st.total != null && <b className="req-dot"> · required missing</b>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section className="card section-card">
          <div className="card-head">
            <div>
              <h2>{current.label}</h2>
              <p>{current.hint}</p>
            </div>
            <span className="muted small no-print">Step {idx + 1} of {SECTIONS.length}</span>
          </div>
          <div className="card-body">
            {current.fields && <FieldGrid fields={current.fields} values={d} onChange={setField} clientNames={clientNames} />}

            {current.id === 'documents' && (
              <Picker
                available={files}
                chosen={draft.files}
                onAdd={(f) => update((x) => ({ ...x, files: [...x.files, { id: f.id, name: f.name, path: f.path, webUrl: f.webUrl, note: '' }] }))}
                onRemove={(id) => update((x) => ({ ...x, files: x.files.filter((f) => f.id !== id) }))}
                onUpdate={(id, patch) => update((x) => ({ ...x, files: x.files.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))}
                groupOf={(f) => clientOf(f.path)}
                labelOf={(f) => f.name}
                subOf={(f) => f.path.split('/').slice(1).join(' › ') || 'Client folder'}
                featuredGroup={d.client}
                featuredLabel="This client"
                extra={{ key: 'note', label: 'How it will be used', placeholder: 'How it will be used (optional)', list: 'purposes' }}
                noun={{ singular: 'file', plural: 'files' }}
                emptyLibrary={<>No files are selected in the Proposal library yet. <a href="#/proposals">Choose files in the Proposal library</a> first.</>}
              />
            )}

            {current.id === 'team' && (
              <Picker
                available={resumes}
                chosen={draft.team}
                onAdd={(r) => update((x) => ({ ...x, team: [...x.team, { id: r.id, name: r.name, path: r.path, webUrl: r.webUrl, role: '' }] }))}
                onRemove={(id) => update((x) => ({ ...x, team: x.team.filter((m) => m.id !== id) }))}
                onUpdate={(id, patch) => update((x) => ({ ...x, team: x.team.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))}
                groupOf={(r) => r.path || 'General'}
                labelOf={(r) => personName(r.name)}
                subOf={(r) => `${extOf(r.name).toUpperCase() || 'File'} · ${r.name}`}
                extra={{ key: 'role', label: 'Role on this proposal', placeholder: 'Role on this proposal', list: 'roles' }}
                noun={{ singular: 'resume', plural: 'resumes' }}
                emptyLibrary={<>No resumes are marked active yet. <a href="#/resumes">Mark active resumes</a> first.</>}
              />
            )}

            {current.id === 'review' && <Review draft={draft} go={setSection} />}

            <datalist id="roles">{ROLES.map((r) => <option key={r} value={r} />)}</datalist>
            <datalist id="purposes">{PURPOSES.map((r) => <option key={r} value={r} />)}</datalist>
          </div>
          <div className="section-foot no-print">
            <button className="btn" disabled={idx === 0} onClick={() => setSection(SECTIONS[idx - 1].id)}>← {idx > 0 ? SECTIONS[idx - 1].label : 'Back'}</button>
            {idx < SECTIONS.length - 1
              ? <button className="btn btn-navy" onClick={() => setSection(SECTIONS[idx + 1].id)}>Next: {SECTIONS[idx + 1].label} →</button>
              : <button className="btn btn-primary" onClick={save} disabled={state.busy || (!dirty && !isNew)}>{state.busy ? 'Saving…' : 'Save proposal'}</button>}
          </div>
        </section>
      </div>
    </div>
  );
}

function FieldGrid({ fields, values, onChange, clientNames }) {
  return (
    <div className="form-grid">
      {fields.map((f) => {
        const id = `f-${f.id}`;
        const v = values[f.id] ?? (f.type === 'chips' ? [] : '');
        const label = <span className="flabel">{f.label}{f.required && <b className="req" title="Required"> *</b>}</span>;
        if (f.type === 'chips') {
          return (
            <fieldset key={f.id} className={`field ${f.wide ? 'wide' : ''}`}>
              <legend>{label}</legend>
              <div className="chips">
                {f.options.map((o) => {
                  const on = v.includes(o);
                  return <button type="button" key={o} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onChange(f.id, on ? v.filter((x) => x !== o) : [...v, o])}>{o}</button>;
                })}
              </div>
            </fieldset>
          );
        }
        let input;
        if (f.type === 'select') {
          input = (
            <select id={id} value={v} onChange={(e) => onChange(f.id, e.target.value)}>
              <option value="">Select…</option>
              {f.options.map((o) => <option key={o}>{o}</option>)}
            </select>
          );
        } else if (f.type === 'textarea') {
          input = <textarea id={id} rows={4} value={v} placeholder={f.placeholder} onChange={(e) => onChange(f.id, e.target.value)} />;
        } else if (f.type === 'client') {
          input = (
            <>
              <input id={id} type="text" list="client-names" value={v} placeholder={f.placeholder} onChange={(e) => onChange(f.id, e.target.value)} />
              <datalist id="client-names">{clientNames.map((c) => <option key={c} value={c} />)}</datalist>
            </>
          );
        } else {
          input = <input id={id} type={f.type} value={v} placeholder={f.placeholder} min={f.type === 'number' ? 0 : undefined} onChange={(e) => onChange(f.id, e.target.value)} />;
        }
        return (
          <label key={f.id} className={`field ${f.wide ? 'wide' : ''}`} htmlFor={id}>
            {label}
            {input}
            {f.hint && <span className="fhint">{f.hint}</span>}
          </label>
        );
      })}
    </div>
  );
}

function display(f, v) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return <span className="muted">—</span>;
  if (Array.isArray(v)) return v.join(', ');
  if (f.type === 'date') return fmtDate(v);
  if (f.type === 'number') return Number(v).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
  if (f.type === 'email') return <a href={`mailto:${v}`}>{v}</a>;
  return v;
}

function Review({ draft, go }) {
  const checks = readiness(draft);
  const done = checks.filter((c) => c.ok).length;
  const filesByClient = groupBy(draft.files, (f) => clientOf(f.path));
  return (
    <div className="review">
      <div className="readiness">
        <div className="readiness-head">
          <h3>Readiness</h3>
          <span className="muted small tabular">{done} of {checks.length} done</span>
          <button className="btn btn-sm no-print" onClick={() => window.print()}>Print / save as PDF</button>
        </div>
        <div className="meter" aria-hidden><span style={{ width: `${(done / checks.length) * 100}%` }} /></div>
        <ul className="checklist">
          {checks.map((c) => (
            <li key={c.label} className={c.ok ? 'ok' : 'todo'}>
              <span className="tick" aria-hidden>{c.ok ? '✓' : '!'}</span>
              <span>{c.label}</span>
              {!c.ok && <button className="link-btn dark no-print" onClick={() => go(c.section)}>Fix</button>}
            </li>
          ))}
        </ul>
      </div>

      {SECTIONS.filter((s) => s.fields).map((s) => (
        <div key={s.id} className="review-block">
          <div className="review-head"><h3>{s.label}</h3><button className="link-btn dark no-print" onClick={() => go(s.id)}>Edit</button></div>
          <dl className="review-dl">
            {s.fields.map((f) => (
              <div key={f.id} className={f.wide ? 'wide' : ''}>
                <dt>{f.label}</dt>
                <dd>{display(FIELDS[f.id], draft.details[f.id])}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      <div className="review-block">
        <div className="review-head"><h3>Supporting documents ({draft.files.length})</h3><button className="link-btn dark no-print" onClick={() => go('documents')}>Edit</button></div>
        {!draft.files.length ? <p className="muted">None added.</p> : Object.entries(filesByClient).map(([client, list]) => (
          <div key={client} className="review-group">
            <div className="pgroup-title">{client}</div>
            <ul className="review-list">
              {list.map((f) => (
                <li key={f.id}>
                  {f.webUrl && f.webUrl !== '#' ? <a href={f.webUrl} target="_blank" rel="noreferrer">{f.name}</a> : f.name}
                  <span className="muted small"> · {f.path.split('/').slice(1).join(' › ') || 'Client folder'}</span>
                  {f.note && <span className="badge badge-teal">{f.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="review-block">
        <div className="review-head"><h3>Proposed team ({draft.team.length})</h3><button className="link-btn dark no-print" onClick={() => go('team')}>Edit</button></div>
        {!draft.team.length ? <p className="muted">None added.</p> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Role on this proposal</th><th>Resume</th></tr></thead>
            <tbody>
              {draft.team.map((m) => (
                <tr key={m.id}>
                  <td>{personName(m.name)}</td>
                  <td>{m.role || <span className="muted">Not set</span>}</td>
                  <td className="small">{m.webUrl && m.webUrl !== '#' ? <a href={m.webUrl} target="_blank" rel="noreferrer">{m.name}</a> : m.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function groupBy(list, fn) {
  const out = {};
  for (const x of list) (out[fn(x)] ||= []).push(x);
  return Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
}
