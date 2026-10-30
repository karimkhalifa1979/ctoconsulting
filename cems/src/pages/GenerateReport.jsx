// Generate a report (UC-03, RPT-030..039): scope, period, audience and template; readiness checks
// before generation; a client version and an internal version from the same snapshot.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/hooks.js';
import { post } from '../lib/api.js';
import { useSession, canOn } from '../lib/session.jsx';
import { useLookups } from '../components/fields.jsx';
import { PageHead, Card, Field, Alert, Empty, Badge, Loading, useAction } from '../components/ui.jsx';
import { weekEnding, todayIn } from '../../shared/dates.js';
import { fmtDate } from '../../shared/format.js';
import Icon from '../components/Icon.jsx';

const TYPES = ['Weekly status', 'Steering committee', 'Monthly financial', 'Exception', 'End stage', 'End project', 'PID', 'Change request'];
const NARRATIVE = [['key_messages', 'Key messages'], ['summary', 'Engagement summary'], ['decisions_required', 'Decisions required'], ['escalations', 'Escalations']];

export default function GenerateReport() {
  const { me } = useSession();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const lookups = useLookups();
  const engagements = (lookups?.engagements || []).filter((e) => canOn(me, e.id, 'report', 'C') || Object.keys(me.access?.[e.id]?.projects || {}).some((pid) => canOn(me, e.id, 'report', 'C', pid)));
  const [f, setF] = useState({
    engagement_id: params.get('engagement') || '', report_type: 'Weekly status', audience: 'client', scope: params.get('project') ? [params.get('project')] : 'all',
    period_end: weekEnding(todayIn(me.settings.firm?.timezone || 'Australia/Sydney'), me.settings.reporting?.weekEndDow ?? 5), template_id: '', pair: false, internal_template_id: '', formats: ['docx', 'pdf'], narrative: {},
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => { if (!f.engagement_id && engagements.length === 1) set('engagement_id', engagements[0].id); }, [engagements.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const eng = useApi(f.engagement_id ? `/api/e/engagement/${f.engagement_id}` : null);
  const projects = useApi(f.engagement_id ? '/api/e/project' : null, { engagement_id: f.engagement_id });
  const templates = useApi(f.engagement_id ? '/api/templates' : null, { engagement_id: f.engagement_id, status: 'Published' });
  const options = useMemo(() => (templates.data || []).filter((t) => t.report_type === f.report_type && t.audience === f.audience), [templates.data, f.report_type, f.audience]);
  const internal = useMemo(() => (templates.data || []).filter((t) => t.report_type === f.report_type && t.audience === 'internal'), [templates.data, f.report_type]);
  // Preselect the engagement's default template for the type (RPT-008).
  useEffect(() => {
    if (!templates.data) return;
    const def = eng.data?.default_templates?.[f.report_type];
    const pick = options.find((t) => t.id === def) || options[0];
    set('template_id', pick?.id || '');
    set('internal_template_id', internal[0]?.id || '');
  }, [templates.data, f.report_type, f.audience, eng.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const tpl = options.find((t) => t.id === f.template_id);
  // A project manager reports on their own projects, one at a time.
  const engWide = f.engagement_id ? canOn(me, f.engagement_id, 'report', 'C') : true;
  const mine = Object.keys(me.access?.[f.engagement_id]?.projects || {}).filter((pid) => canOn(me, f.engagement_id, 'report', 'C', pid));
  const active = (projects.data || []).filter((p) => ['In delivery', 'Stage boundary', 'Initiation', 'Closing'].includes(p.state) && (engWide || mine.includes(p.id)));
  useEffect(() => { if (!engWide && f.scope === 'all' && active[0]) set('scope', [active[0].id]); }, [engWide, active.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ready, setReady] = useState(null);
  const [run, busy] = useAction();
  useEffect(() => setReady(null), [f.engagement_id, f.scope, f.period_end, f.template_id, f.audience, f.report_type]);
  const body = () => ({ ...f, scope: f.scope === 'all' ? 'all' : f.scope, pair: f.audience === 'client' && f.pair });
  const check = async () => {
    const out = await run(() => post('/api/reports/readiness', body()));
    if (out) setReady(out);
  };
  const generate = async (proceed) => {
    const out = await run(() => post('/api/reports/generate', { ...body(), proceed }), (o) => (o.generated ? 'Draft generated' : null));
    if (!out) return;
    if (!out.generated) { setReady(out.readiness); return; }
    nav(`/reports/${out.report.id}`);
  };
  const projectLevel = tpl?.level === 'project' || !engWide;
  return (
    <>
      <PageHead title="Generate a report" crumbs={<><Link to="/reports">Reports</Link><span>›</span></>}
        sub="Data is frozen in a snapshot when the draft is generated, so the report and its figures can always be reproduced (RPT-030)." />
      <div className="split">
        <Card title="What to generate">
          <div className="form-grid">
            <Field label="Engagement" required full>
              <select value={f.engagement_id} onChange={(e) => setF({ ...f, engagement_id: e.target.value, scope: 'all' })}>
                <option value="">Choose…</option>
                {engagements.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </Field>
            <Field label="Report type"><select value={f.report_type} onChange={(e) => set('report_type', e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Audience" hint="Client versions exclude internal-only data (ACC-003, RPT-021).">
              <select value={f.audience} onChange={(e) => set('audience', e.target.value)}><option value="client">Client</option><option value="internal">Internal</option></select>
            </Field>
            <Field label="Week ending" hint="Financials are as at the last fully approved timesheet week (BR-02)."><input type="date" value={f.period_end} onChange={(e) => set('period_end', e.target.value)} /></Field>
            <Field label="Output"><div className="flex">{['docx', 'pdf'].map((x) => <label key={x} className="check"><input type="checkbox" checked={f.formats.includes(x)} onChange={(e) => set('formats', e.target.checked ? [...f.formats, x] : f.formats.filter((y) => y !== x))} /> {x === 'docx' ? 'Word' : 'PDF'}</label>)}</div></Field>
            <Field label="Template" required full hint={tpl ? `${tpl.scope} template · ${tpl.level}-level · version ${tpl.current?.version_no || ''}` : f.engagement_id ? 'No published template of this type and audience is available.' : ''}>
              <select value={f.template_id} onChange={(e) => set('template_id', e.target.value)} disabled={!options.length}>
                {!options.length && <option value="">None available</option>}
                {options.map((t) => <option key={t.id} value={t.id}>{t.name}{eng.data?.default_templates?.[f.report_type] === t.id ? ' (default)' : ''}</option>)}
              </select>
            </Field>
            {f.audience === 'client' && internal.length > 0 && (
              <Field label="Also generate an internal version" full hint="Same snapshot, internal template: margins, costs and internal commentary (RPT-038).">
                <div className="flex">
                  <label className="check"><input type="checkbox" checked={f.pair} onChange={(e) => set('pair', e.target.checked)} /> Internal pair</label>
                  {f.pair && <select value={f.internal_template_id} onChange={(e) => set('internal_template_id', e.target.value)}>{internal.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
                </div>
              </Field>
            )}
          </div>
          {f.engagement_id && (
            <>
              <h4 className="mt-3 mb-1">Projects in scope</h4>
              {projects.loading ? <Loading /> : !active.length ? <Empty>No projects in delivery.</Empty> : (
                <div className="stack-sm">
                  {!projectLevel && <label className="check"><input type="radio" checked={f.scope === 'all'} onChange={() => set('scope', 'all')} /> All projects in delivery ({active.length})</label>}
                  {active.map((p) => (
                    <label key={p.id} className="check">
                      <input type={projectLevel ? 'radio' : 'checkbox'} checked={f.scope !== 'all' && f.scope.includes(p.id)}
                        onChange={(e) => set('scope', projectLevel ? [p.id] : e.target.checked ? [...(f.scope === 'all' ? [] : f.scope), p.id] : (f.scope === 'all' ? active.map((x) => x.id) : f.scope).filter((x) => x !== p.id))} />
                      {p.code} {p.name}
                    </label>
                  ))}
                </div>
              )}
              <h4 className="mt-3 mb-1">Narrative for this report</h4>
              <p className="small muted">Project narrative comes from each approved status update. Engagement-level text entered here is used where the template asks for it.</p>
              <div className="form-grid">
                {NARRATIVE.map(([k, label]) => (
                  <Field key={k} label={label} full><textarea rows={2} value={f.narrative[k] || ''} onChange={(e) => set('narrative', { ...f.narrative, [k]: e.target.value })} /></Field>
                ))}
              </div>
            </>
          )}
        </Card>
        <div className="stack">
          <Card title="Readiness (RPT-034)" sub="Checks before generation. You can generate with warnings; they are recorded with the report."
            actions={<button className="btn btn-sm" disabled={busy || !f.template_id} onClick={check}>Run checks</button>}>
            {!ready ? <Empty icon="checkCircle">Run the checks to see whether everything the report needs is in place.</Empty> : (
              <div className="stack-sm">
                {ready.ok ? <Alert tone="ok">All checks passed.</Alert> : <Alert tone="warn">{ready.warnings.length} check{ready.warnings.length > 1 ? 's' : ''} need attention.</Alert>}
                {ready.checks.map((c) => (
                  <div key={c.key}>
                    <div className="flex"><Icon name={c.ok ? 'checkCircle' : 'alert'} size={15} /><span className={c.ok ? '' : 'strong'}>{c.label}</span>{!c.ok && <Badge tone="amber">{c.items.length}</Badge>}</div>
                    {!c.ok && <ul className="small" style={{ margin: '4px 0 0 22px', paddingLeft: 14 }}>{c.items.slice(0, 8).map((x, i) => <li key={i}>{x.project_id && c.key === 'status' ? <Link to={`/projects/${x.project_id}/status`}>{x.text}</Link> : x.text}</li>)}{c.items.length > 8 && <li>and {c.items.length - 8} more</li>}</ul>}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <div className="btn-row">
              <button className="btn btn-primary" disabled={busy || !f.template_id || (f.scope !== 'all' && !f.scope.length)} onClick={() => generate(Boolean(ready && !ready.ok))}>
                <Icon name="report" /> {ready && !ready.ok ? 'Generate with warnings' : 'Generate draft'}
              </button>
            </div>
            <p className="tiny muted mt-2">Week ending {fmtDate(f.period_end)}. The draft opens for review: edit report-level narrative, regenerate, submit for approval and issue.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
