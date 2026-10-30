// Help and glossary (USE-03): getting started by role, the 3-Phase Process and its stages, the ADKAR
// elements and barrier point, the glossary, the template tagging convention and merge fields for template
// authors (ART-025, ART-029), accessibility and keyboard use (USE-02), privacy (PRV-02 to PRV-04) and the
// trademark notice. The methodology descriptions are the organisation's own summaries.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import { Card, PageHead, Empty, Badge, Spinner } from '../ui/core.jsx';
import { useApp, useToast } from '../state/app.jsx';
import { useTab } from '../lib/hooks.js';
import { downloadFile } from '../data/client.js';
import { ADKAR, GLOSSARY, PHASES, STAGES, TRADEMARK_NOTICE } from '../../shared/refdata.js';
import { ROLES } from '../../shared/access.js';
import { asArray } from '../../shared/util.js';

const SECTIONS = [
  { id: 'start', label: 'Getting started' },
  { id: 'process', label: 'The 3-Phase Process' },
  { id: 'adkar', label: 'ADKAR and barrier points' },
  { id: 'glossary', label: 'Glossary' },
  { id: 'templates', label: 'Templates and merge fields' },
  { id: 'access', label: 'Accessibility and keyboard' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'about', label: 'About' },
];

export default function Help() {
  const [section, setSection] = useTab('start', 'section');
  const current = SECTIONS.find((s) => s.id === section) || SECTIONS[0];
  return (
    <>
      <PageHead eyebrow="Help" title="Help and glossary">
        How the workbench supports each part of the change management approach, what its terms mean, and how to work with templates, accessibility features and personal information.
      </PageHead>
      <div className="report-layout">
        <nav className="report-nav" aria-label="Help topics">
          {SECTIONS.map((s) => <button key={s.id} type="button" className={s.id === current.id ? 'active' : ''} aria-current={s.id === current.id ? 'page' : undefined} onClick={() => setSection(s.id)}>{s.label}</button>)}
        </nav>
        <div className="stack help-body" style={{ minWidth: 0 }}>
          {current.id === 'start' && <Start />}
          {current.id === 'process' && <Process />}
          {current.id === 'adkar' && <Adkar />}
          {current.id === 'glossary' && <Glossary />}
          {current.id === 'templates' && <Templates />}
          {current.id === 'access' && <Accessibility />}
          {current.id === 'privacy' && <Privacy />}
          {current.id === 'about' && <About />}
        </div>
      </div>
    </>
  );
}

const ROLE_START = {
  changeLead: ['Create the initiative under Initiatives, then work through Definition and success, Change impact, Stakeholders and Risk and readiness.', 'Generate the Change Management Strategy from Strategy or Artefacts, and submit it for approval.', 'Select the plans in Master plan, build the ADKAR Blueprints and generate the Master Change Management Plan.'],
  practitioner: ['Keep impacts and the stakeholder register current; plan engagements in Engagement and log them as they happen (Quick capture works on a phone).', 'Run ADKAR and readiness assessments and confirm results before they are used in approved artefacts.'],
  commsAdviser: ['Maintain key messages and FAQs, plan communications in the calendar and send them for approval; record when each is sent.'],
  trainingLead: ['Record training needs, interventions and sessions; import attendance and completion, and track proficiency evidence.'],
  pm: ['Keep milestones current (or import them from Microsoft Project); engagements and activities set relative to a milestone move with it. Use the integrated timeline in Master plan.'],
  sponsor: ['Review your sponsor dashboard, confirm the sponsor activities you have delivered, and approve the strategy and plans sent to you.'],
  peopleManager: ['Open your Manager Briefing Pack under Artefacts, review your team\'s impacts and key dates, and log team conversations.'],
  changeAgent: ['Log feedback and local engagements, and see how your groups are tracking.'],
  portfolio: ['Use Portfolio to see the change heatmap and saturation across initiatives, compare initiatives, and find stakeholders several initiatives rely on.'],
  admin: ['Configure reference lists, custom fields, terminology, templates, integrations, retention and users under Administration.'],
  auditor: ['Search and verify the audit trail and review the AI log under Audit and configuration.'],
};

function Start() {
  const { user } = useApp();
  const mine = asArray(user?.roles);
  return (
    <>
      <Card title="Start here">
        <p style={{ marginTop: 0 }}>The workbench follows a structured, three-phase approach to managing the people side of change. Everything you record (impacts, stakeholders, engagements, assessments and plans) feeds the dashboards and the documents it generates, so they always agree with each other.</p>
        <ol className="steps">
          <li><strong>Prepare Approach.</strong> Define success, the impact on each group and the approach, and generate the Change Management Strategy.</li>
          <li><strong>Manage Change.</strong> Build the ADKAR Blueprints and plans, act on them, track performance and adapt, and generate the Master Change Management Plan and status packs.</li>
          <li><strong>Sustain Outcomes.</strong> Review performance, activate sustainment, hand over ownership and generate the Change Management Closeout.</li>
        </ol>
      </Card>
      <Card title="What to do first, by role" flush>
        <ul className="link-list">
          {ROLES.filter((r) => ROLE_START[r.id]).sort((a, b) => (mine.includes(b.id) ? 1 : 0) - (mine.includes(a.id) ? 1 : 0)).map((r) => (
            <li key={r.id} className="role-help">
              <div style={{ padding: '10px 16px' }}>
                <div className="row"><strong>{r.label}</strong>{mine.includes(r.id) && <Badge tone="info">Your role</Badge>}</div>
                <div className="small muted">{r.description}</div>
                <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{ROLE_START[r.id].map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Process() {
  return PHASES.map((p) => (
    <Card key={p.id} title={`Phase ${p.n}: ${p.label}`} sub={`Deliverable: ${p.deliverable}`} flush>
      <table className="tbl">
        <thead><tr><th>Stage</th><th>Purpose</th><th>What it produces</th><th>Where</th></tr></thead>
        <tbody>
          {STAGES.filter((s) => s.phase === p.id).map((s) => (
            <tr key={s.id}><td><strong>{s.label}</strong></td><td className="small">{s.purpose}</td><td className="small">{s.outputs}</td><td className="small">{asArray(s.modules).join(', ')}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="card-pad small muted">Each initiative's overview shows its progress through these stages, from the inputs and approvals each stage needs.</div>
    </Card>
  ));
}

function Adkar() {
  const { settings } = useApp();
  const t = settings.adkar?.threshold ?? 3;
  return (
    <>
      <Card title="The five elements">
        <p style={{ marginTop: 0 }}>Individual change is described through five outcomes, achieved in order. Assessments score each element from 1 to 5.</p>
        <table className="tbl">
          <thead><tr><th>Element</th><th>The outcome</th><th>What the workbench records</th></tr></thead>
          <tbody>{ADKAR.map((a) => <tr key={a.id}><td><strong>{a.label}</strong></td><td className="small">{a.outcome}</td><td className="small">{a.captures}</td></tr>)}</tbody>
        </table>
      </Card>
      <Card title="Barrier points">
        <p style={{ marginTop: 0 }}>The barrier point is the first element, in order, scored at or below {t} (the threshold set by your organisation). Because each element builds on the one before, effort goes to the barrier point first: there is little value in training people (Knowledge) who do not yet want the change (Desire).</p>
        <p style={{ marginBottom: 0 }}>For a group, the barrier point uses the {settings.adkar?.groupMethod === 'proportion' ? `share of people scoring at or below the threshold (${Math.round((settings.adkar?.groupProportion ?? 0.3) * 100)}% or more)` : 'mean score of its members'}. Results for fewer than {settings.adkar?.minSegment ?? 5} people are not shown, so no individual can be identified.</p>
      </Card>
    </>
  );
}

function Glossary() {
  const [q, setQ] = useState('');
  const terms = Object.entries(GLOSSARY).sort(([a], [b]) => a.localeCompare(b));
  const ql = q.trim().toLowerCase();
  const shown = terms.filter(([k, v]) => !ql || k.toLowerCase().includes(ql) || v.toLowerCase().includes(ql));
  return (
    <Card title="Glossary" sub="Select the help icon next to a term anywhere in the workbench to see its definition." flush actions={<input type="search" aria-label="Search the glossary" placeholder="Search terms…" value={q} onChange={(e) => setQ(e.target.value)} />}>
      {!shown.length ? <Empty icon="search" title="No matching terms" /> : (
        <dl className="glossary">
          {shown.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
    </Card>
  );
}

function Templates() {
  const { api, user } = useApp();
  const toast = useToast();
  const [cat, setCat] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api.op('fieldCatalogue', {}).then(setCat).catch(() => setCat(false)); }, [api]);
  const starter = async () => {
    try { const r = await api.op('starterTemplate', {}); await downloadFile(api, r.blobId, r.filename); } catch (e) { toast.error(e); }
  };
  const copy = (tag) => { try { navigator.clipboard.writeText(tag); toast.success(`Copied ${tag}`); } catch { /* clipboard unavailable */ } };
  const ql = q.trim().toLowerCase();
  const fields = useMemo(() => (cat ? cat.fields.filter((f) => !ql || f.field.toLowerCase().includes(ql) || f.label.toLowerCase().includes(ql)) : []), [cat, ql]);
  return (
    <>
      <Card title="Tagged Word templates" sub="An organisation template supplies the cover, styles, headers, footers and branding; tags in it are replaced with the initiative's data when an artefact is generated."
        actions={<div className="btn-row"><button type="button" className="btn btn-sm" onClick={starter}><Icon name="download" />Starter template</button>{user?.roles?.includes('admin') && <Link className="btn btn-sm" to="/admin/templates">Manage templates</Link>}</div>}>
        <table className="tbl">
          <thead><tr><th>Write</th><th>To get</th></tr></thead>
          <tbody>{asArray(cat?.syntax).map((x) => <tr key={x.tag}><td><code>{x.tag}</code></td><td className="small">{x.meaning}</td></tr>)}</tbody>
        </table>
        <p className="small muted" style={{ marginBottom: 0 }}>Type each tag in one go, so Word keeps it in a single run of text. Templates are checked when they are uploaded: unknown tags and unbalanced sections are reported before the template can be used, and an unknown tag that remains shows as [Unknown field: …] in the document.</p>
      </Card>
      {cat === null ? <Spinner /> : cat === false ? <Card title="Merge fields"><p className="small">The field catalogue is not available.</p></Card> : (
        <>
          <Card title="Merge fields" sub="Select a tag to copy it." flush actions={<input type="search" aria-label="Search merge fields" placeholder="Search fields…" value={q} onChange={(e) => setQ(e.target.value)} />}>
            <div className="table-wrap">
              <table className="tbl tbl-compact">
                <thead><tr><th>Tag</th><th>Contains</th><th>Format</th><th>Comes from</th></tr></thead>
                <tbody>{fields.map((f) => <tr key={f.field}><td><button type="button" className="tag-btn" onClick={() => copy(`{{${f.field}}}`)}>{`{{${f.field}}}`}</button></td><td className="small">{f.label}</td><td className="small">{f.format}</td><td className="small muted">{f.source}</td></tr>)}</tbody>
              </table>
            </div>
          </Card>
          <Card title="Repeating tables and sections" sub="Use these in a table row to repeat it, or between {{#each …}} and {{/each}} tags." flush>
            <div className="table-wrap">
              <table className="tbl tbl-compact">
                <thead><tr><th>Collection</th><th>Fields</th></tr></thead>
                <tbody>{cat.collections.map((c) => <tr key={c.collection}><td><strong>{c.label}</strong><span className="sub-line tiny muted">{`{{#each ${c.collection}}}`} · {c.source}</span></td><td className="small">{c.fields.map((f) => <button key={f.field} type="button" className="tag-btn" onClick={() => copy(`{{${f.field}}}`)} title={f.label}>{f.field.split('.')[1]}</button>)}</td></tr>)}</tbody>
              </table>
            </div>
          </Card>
          <div className="grid g-2">
            <Card title="Generated content" flush><ul className="tag-list">{cat.blocks.map((b) => <li key={b.tag}><button type="button" className="tag-btn" onClick={() => copy(b.tag)}>{b.tag}</button><span className="small muted">{b.label}</span></li>)}</ul></Card>
            <Card title="Conditions for {{#if …}}" flush><ul className="tag-list">{cat.conditions.map((c) => <li key={c.tag}><button type="button" className="tag-btn" onClick={() => copy(`{{#if ${c.tag}}}`)}>{c.tag}</button><span className="small muted">{c.label}</span></li>)}</ul></Card>
          </div>
        </>
      )}
    </>
  );
}

function Accessibility() {
  return (
    <>
      <Card title="Accessibility">
        <p style={{ marginTop: 0 }}>The workbench is designed to conform to the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA: every function works with a keyboard, screen readers announce page regions, tables, charts and status changes, colour is never the only way information is shown, and text and controls meet the contrast requirements in the light and dark themes. Charts have a text alternative and their figures are always available in a table. Generated Word, PDF and PowerPoint documents are produced with headings, alternative text, table headers and reading order so they are accessible too.</p>
        <p style={{ marginBottom: 0 }}>If something is hard to use with your assistive technology, tell your administrator so it can be fixed.</p>
      </Card>
      <Card title="Keyboard" flush>
        <table className="tbl">
          <thead><tr><th>Keys</th><th>Does</th></tr></thead>
          <tbody>
            {[
              ['Ctrl K (Cmd K on a Mac)', 'Search everything you can see'],
              ['Tab, Shift Tab', 'Move between controls'],
              ['Enter or Space', 'Open the selected row, cell or button'],
              ['Escape', 'Close a menu, dialog or side panel'],
              ['Arrow keys', 'Move through search results and choices in a picker'],
            ].map(([k, d]) => <tr key={k}><td><kbd>{k}</kbd></td><td className="small">{d}</td></tr>)}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function Privacy() {
  const { settings } = useApp();
  return (
    <>
      <Card title="Personal information">
        <p style={{ marginTop: 0 }}>The workbench holds information about the people affected by change so that it can be managed well. It is used only for managing the change and is handled under the Privacy Act 1988 and the organisation's privacy policy.</p>
        <ul className="small" style={{ paddingLeft: 18 }}>
          <li><strong>Recording notes:</strong> {settings.privacy?.freeTextGuidance}</li>
          <li><strong>Sensitive fields</strong> such as current engagement level and sentiment are visible only to the roles allowed to see them, are left out of documents unless deliberately included, and every view or inclusion is recorded in the audit trail.</li>
          <li><strong>Survey results</strong> are shown only for groups of {settings.adkar?.minSegment ?? 5} or more people.</li>
          {settings.privacy?.groupLevelOnly && <li><strong>Group-level analysis only:</strong> your organisation has turned off ratings of named individuals.</li>}
          <li><strong>Access and correction:</strong> a change management lead or administrator can find everything held about a person, export it and correct it, from the stakeholder's profile.</li>
          <li><strong>Retention:</strong> records are kept, de-identified or deleted according to the retention schedule set by the organisation, unless a legal hold applies.</li>
        </ul>
      </Card>
      <Card title="Collection notices" sub="Shown to people when information about them is first collected, and on surveys." flush>
        {asArray(settings.collectionNotices).map((n) => <div key={n.id} className="card-pad" style={{ borderTop: '1px solid var(--line)' }}><strong>{n.title}</strong> <span className="tiny muted">version {n.version}</span><p className="small" style={{ margin: '4px 0 0' }}>{n.text}</p></div>)}
      </Card>
    </>
  );
}

function About() {
  const { mode, settings } = useApp();
  return (
    <Card title="About the Change Management Workbench">
      <p style={{ marginTop: 0 }}>A platform for planning, delivering and measuring the people side of change for {settings.organisationName || 'the organisation'}, from one-team changes to enterprise programs.</p>
      <p>{mode === 'server' ? 'You are using the shared server: changes are saved for everyone with access.' : 'You are using the browser-only demonstration: data is fictional and stays in this browser.'}</p>
      <p className="small muted" style={{ marginBottom: 0 }}>{TRADEMARK_NOTICE}</p>
    </Card>
  );
}
