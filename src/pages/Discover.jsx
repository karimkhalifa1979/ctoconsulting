import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp, SEED_ID } from '../lib/store.jsx';
import { PageHead, Card, LevelBadge, Loading, includesAll } from '../components/ui.jsx';
import { SECTOR_TYPES, INDUSTRIES, STATES, INTERNATIONAL, FLAGS, inferProfile, emptyProfile } from '../lib/profile.js';
import { discoverSources, generateRegister, orgPrefix, sourcesFromObligations, librarySourceIndex } from '../lib/discovery.js';
import { ALL_SOURCE_NAMES, LEVELS } from '../lib/catalog.js';
import { aiStatus, aiDiscover } from '../lib/ai.js';
import { parseRegister, sheetsFromExcelJs } from '../lib/registerParser.js';

const STEPS = ['Organisation', 'Profile', 'Applicable obligations', 'Generate register'];

function slug(s) {
  return `${String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${Date.now().toString(36)}`;
}

function Toggle({ on, onClick, children }) {
  return <button type="button" className={`chip ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}>{children}</button>;
}

export default function Discover() {
  const { library, orgs, createOrg } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const editing = orgs.find((o) => o.id === params.get('org') && o.id !== SEED_ID);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(editing?.name || '');
  const [profile, setProfile] = useState(editing?.profile || emptyProfile(''));
  const [matched, setMatched] = useState([]);
  const [sources, setSources] = useState([]);
  const [ai, setAi] = useState({ available: false });
  const [aiResult, setAiResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => { aiStatus().then((s) => setAi({ available: s.ai, model: s.model })); }, []);

  if (!library) return <Loading />;

  const setP = (patch) => setProfile((p) => ({ ...p, ...patch }));
  const toggleIn = (key, v) => setProfile((p) => ({ ...p, [key]: p[key].includes(v) ? p[key].filter((x) => x !== v) : [...p[key], v] }));
  const setFlag = (f, v) => setProfile((p) => ({ ...p, flags: { ...p.flags, [f]: v } }));

  const startFromName = () => {
    if (!name.trim()) return;
    if (!editing) {
      const inf = inferProfile(name.trim());
      setProfile(inf.profile);
      setMatched(inf.matched);
    }
    setStep(1);
  };

  const runAi = async () => {
    setErr(''); setBusy('Researching the organisation with Claude (web search)… this can take a minute.');
    try {
      const res = await aiDiscover({
        name: name.trim(),
        profile,
        catalogue: ALL_SOURCE_NAMES(),
        templates: library.requirements.map((r) => ({ id: r.id, title: r.title })),
        profileOptions: { sectorType: SECTOR_TYPES.map((s) => s.id), industries: INDUSTRIES.map((i) => i.id), states: STATES, international: INTERNATIONAL.map((i) => i.id), flags: FLAGS.map((f) => f.id) },
      });
      setAiResult(res);
      if (res.profile) {
        const valid = (list, allowed) => (Array.isArray(list) ? list.filter((x) => allowed.includes(x)) : undefined);
        setProfile((p) => ({
          ...p,
          sectorType: SECTOR_TYPES.some((s) => s.id === res.profile.sectorType) ? res.profile.sectorType : p.sectorType,
          industries: valid(res.profile.industries, INDUSTRIES.map((i) => i.id)) || p.industries,
          states: valid(res.profile.states, STATES) || p.states,
          international: valid(res.profile.international, INTERNATIONAL.map((i) => i.id)) || p.international,
          flags: { ...p.flags, ...Object.fromEntries(Object.entries(res.profile.flags || {}).filter(([k]) => FLAGS.some((f) => f.id === k))) },
        }));
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const runDiscovery = () => {
    const found = discoverSources(profile, library);
    const byName = Object.fromEntries(found.map((s) => [s.name, s]));
    if (aiResult) {
      const idx = librarySourceIndex(library);
      for (const c of aiResult.catalogue || []) {
        if (byName[c.name]) byName[c.name].aiReason = c.reason;
        else {
          const meta = idx[c.name];
          if (meta) byName[c.name] = { ...meta, level: c.level, reason: c.reason, origin: 'ai', selected: true };
        }
      }
      for (const a of aiResult.additional || []) {
        byName[a.name] = { name: a.name, publisher: a.publisher, type: a.type, url: a.url, count: a.obligations.length, level: a.level, reason: a.reason, origin: 'ai', selected: true };
      }
    }
    if (editing) {
      const prev = Object.fromEntries((editing.sources || []).map((s) => [s.name, s.selected !== false]));
      for (const s of Object.values(byName)) if (s.name in prev) s.selected = prev[s.name];
    }
    const order = { mandatory: 0, conditional: 1, recommended: 2 };
    setSources(Object.values(byName).sort((a, b) => order[a.level] - order[b.level] || b.count - a.count));
    setStep(2);
  };

  const selected = sources.filter((s) => s.selected);
  const totalObl = selected.reduce((a, s) => a + s.count, 0);

  const generate = async () => {
    setBusy('Generating obligations register and policy requirements…');
    await new Promise((r) => setTimeout(r, 30));
    const shortName = profile.shortName || name;
    const org = {
      id: editing?.id || slug(name),
      name: name.trim(),
      shortName,
      prefix: editing?.prefix || orgPrefix(shortName),
      kind: 'generated',
      profile: { ...profile, name: name.trim() },
      createdAt: editing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      aiSummary: aiResult?.summary || editing?.aiSummary || '',
      sources,
    };
    const register = generateRegister(org, selected, library, (aiResult?.additional || []).filter((a) => selected.some((s) => s.name === a.name)));
    await createOrg(org, register);
    setBusy('');
    nav('/dashboard');
  };

  const importWorkbook = async (file) => {
    setErr(''); setBusy('Reading workbook…');
    try {
      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const parsed = parseRegister(sheetsFromExcelJs(wb));
      if (!parsed.requirements.length) throw new Error('No "Requirement ID" worksheet was found — the workbook must follow the Policy Requirements Register format.');
      const orgName = name.trim() || file.name.replace(/\.xlsx$/i, '');
      const { profile: p } = inferProfile(orgName);
      const shortName = parsed.requirements[0].id.split('-')[0] || p.shortName;
      const org = {
        id: slug(orgName), name: orgName, shortName, prefix: orgPrefix(shortName), kind: 'imported', source: file.name,
        profile: { ...p, shortName }, createdAt: new Date().toISOString(),
        sources: sourcesFromObligations(parsed.obligations, p),
      };
      await createOrg(org, { requirements: parsed.requirements, obligations: parsed.obligations, exemptions: parsed.exemptions });
      nav('/dashboard');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const grouped = ['mandatory', 'conditional', 'recommended'].map((l) => ({ level: l, items: sources.filter((s) => s.level === l && includesAll(`${s.name} ${s.reason} ${s.publisher}`, q)) }));

  return (
    <div>
      <PageHead eyebrow="Discovery" title={editing ? `Re-run discovery — ${editing.name}` : 'Discover regulatory obligations'}>
        Enter an organisation, confirm its profile, and the tool identifies every applicable law, mandatory policy and standard, then builds its obligations register and policy requirements with suggested target policies.
      </PageHead>

      <div className="steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`step ${i < step ? 'done' : ''} ${i === step ? 'current' : ''}`}><span className="n">{i < step ? '✓' : i + 1}</span>{s}</div>
        ))}
      </div>

      {err && <div className="callout warn" style={{ marginBottom: 16 }}>{err}</div>}
      {busy && <div className="card card-pad" style={{ marginBottom: 16 }}><div className="row"><div className="spinner" style={{ margin: 0 }} /> {busy}</div></div>}

      {step === 0 && (
        <div className="grid g-2">
          <Card title="Organisation name" subtitle="The profile is inferred from the name and can be refined on the next step">
            <div className="stack">
              <label className="field"><span>Organisation name</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Commonwealth Bank of Australia" onKeyDown={(e) => e.key === 'Enter' && startFromName()} autoFocus />
              </label>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={startFromName} disabled={!name.trim()}>Continue</button>
              </div>
              <p className="small muted" style={{ margin: 0 }}>Try: “Commonwealth Bank of Australia”, “Sydney Water”, “Department of Health Victoria”, “Acme Software Pty Ltd”.</p>
            </div>
          </Card>
          <Card title="Already have a register?" subtitle="Import a workbook in the Policy Requirements Register format">
            <p className="small">Upload an .xlsx with a <strong>Requirements</strong> sheet (41 attributes) and an <strong>Obligations</strong> sheet. Everything is loaded against the organisation name entered on the left (or the file name).</p>
            <label className="btn">
              Import workbook (.xlsx)
              <input type="file" accept=".xlsx" hidden onChange={(e) => e.target.files[0] && importWorkbook(e.target.files[0])} />
            </label>
          </Card>
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <Card title={`Profile — ${name}`} subtitle={matched.length ? `Inferred from the name (matched “${matched.join(', ')}”). Review every answer: applicability depends on it.` : 'No known match — complete the profile below.'}
            actions={ai.available ? <button className="btn btn-navy" onClick={runAi} disabled={!!busy}>✦ Research with Claude</button> : <span className="small muted" title="Start the Node server with ANTHROPIC_API_KEY to enable AI research">AI research not configured</span>}>
            {aiResult?.summary && <div className="callout" style={{ marginBottom: 16 }}><strong>AI research summary:</strong> {aiResult.summary}</div>}
            <div className="grid g-3">
              <label className="field"><span>Short name / acronym <span className="hint">(used in IDs and documents)</span></span>
                <input type="text" value={profile.shortName} onChange={(e) => setP({ shortName: e.target.value })} />
              </label>
              <label className="field span-2"><span>Organisation type</span>
                <select value={profile.sectorType} onChange={(e) => setP({ sectorType: e.target.value })}>
                  {SECTOR_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            </div>
            <hr className="hr" />
            <div className="field"><span>Industries</span><div className="chips">{INDUSTRIES.map((i) => <Toggle key={i.id} on={profile.industries.includes(i.id)} onClick={() => toggleIn('industries', i.id)}>{i.label}</Toggle>)}</div></div>
            <hr className="hr" />
            <div className="grid g-2">
              <div className="field"><span>Australian jurisdictions of operation</span><div className="chips">{STATES.map((s) => <Toggle key={s} on={profile.states.includes(s)} onClick={() => toggleIn('states', s)}>{s}</Toggle>)}</div></div>
              <div className="field"><span>International operations</span><div className="chips">{INTERNATIONAL.map((s) => <Toggle key={s.id} on={profile.international.includes(s.id)} onClick={() => toggleIn('international', s.id)}>{s.label}</Toggle>)}</div></div>
            </div>
            <hr className="hr" />
            <div className="grid g-3">
              {['Scale', 'Information', 'Services', 'Technology', 'Regulatory'].map((g) => (
                <div key={g} className="field"><span>{g}</span>
                  {FLAGS.filter((f) => f.group === g).map((f) => (
                    <label key={f.id} className="check small"><input type="checkbox" checked={!!profile.flags[f.id]} onChange={(e) => setFlag(f.id, e.target.checked)} />{f.label}</label>
                  ))}
                </div>
              ))}
            </div>
          </Card>
          <div className="btn-row">
            <button className="btn" onClick={() => setStep(0)}>Back</button>
            <button className="btn btn-primary" onClick={runDiscovery}>Discover applicable obligations →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <div className="grid g-4">
            {['mandatory', 'conditional', 'recommended'].map((l) => (
              <div key={l} className="card stat accent"><div className="label">{LEVELS[l].label}</div><div className="value tabular">{sources.filter((s) => s.level === l).length}</div><div className="sub">{LEVELS[l].desc}</div></div>
            ))}
            <div className="card stat accent"><div className="label">Selected</div><div className="value tabular">{selected.length} sources</div><div className="sub">{totalObl.toLocaleString()} obligations</div></div>
          </div>
          <div className="filters">
            <input type="search" placeholder="Search sources…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn btn-sm" onClick={() => setSources(sources.map((s) => ({ ...s, selected: true })))}>Select all</button>
            <button className="btn btn-sm" onClick={() => setSources(sources.map((s) => ({ ...s, selected: s.level !== 'recommended' })))}>Mandatory &amp; conditional only</button>
          </div>
          {grouped.map((g) => g.items.length > 0 && (
            <Card key={g.level} title={<span className="row"><LevelBadge level={g.level} /> {g.items.length} source{g.items.length > 1 ? 's' : ''}</span>} pad={false}>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th style={{ width: 36 }} /><th>Source</th><th>Why it applies</th><th>Publisher</th><th className="nowrap">Obligations</th></tr></thead>
                  <tbody>
                    {g.items.map((s) => (
                      <tr key={s.name} className="clickable" onClick={() => setSources(sources.map((x) => (x.name === s.name ? { ...x, selected: !x.selected } : x)))}>
                        <td><input type="checkbox" checked={!!s.selected} readOnly aria-label={`Include ${s.name}`} /></td>
                        <td><strong>{s.name}</strong>{s.origin === 'ai' && <span className="badge badge-teal" style={{ marginLeft: 6 }}>AI</span>}{s.origin === 'catalogue' && <span className="badge" style={{ marginLeft: 6 }}>Catalogue</span>}</td>
                        <td className="small">{s.reason}{s.aiReason && <div className="muted">AI: {s.aiReason}</div>}</td>
                        <td className="small muted">{s.publisher}</td>
                        <td className="tabular">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
          <div className="btn-row">
            <button className="btn" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)} disabled={!selected.length}>Continue →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <Card title="Generate the organisation register">
          <GeneratePreview org={{ name, shortName: profile.shortName, prefix: editing?.prefix || orgPrefix(profile.shortName), profile }} selected={selected} library={library} aiResult={aiResult} />
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-primary" onClick={generate} disabled={!!busy}>{editing ? 'Regenerate register (assessments kept)' : 'Create organisation'}</button>
          </div>
        </Card>
      )}
    </div>
  );
}

function GeneratePreview({ org, selected, library, aiResult }) {
  const preview = useMemo(() => generateRegister(org, selected, library, aiResult?.additional || []), [org, selected, library, aiResult]);
  const byPolicy = {};
  for (const r of preview.requirements) byPolicy[r.policyTitle] = (byPolicy[r.policyTitle] || 0) + 1;
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>The register for <strong>{org.name}</strong> will contain <strong>{preview.obligations.length.toLocaleString()}</strong> obligations from <strong>{selected.length}</strong> sources, consolidated into <strong>{preview.requirements.length}</strong> policy requirements across <strong>{Object.keys(byPolicy).length}</strong> suggested target policies. Every requirement is created with the full set of register attributes (control objective, threat, implementation guidance, RACI, verification, evidence, audit and review cycles), tailored to the organisation.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Suggested target policy</th><th>Policy number</th><th>Requirements</th></tr></thead>
          <tbody>
            {Object.entries(byPolicy).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
              <tr key={t}><td>{t}</td><td className="muted">{preview.requirements.find((r) => r.policyTitle === t)?.policyNumber}</td><td className="tabular">{n}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
