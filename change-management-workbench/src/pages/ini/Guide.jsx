// Guided set-up for Phase 1, Prepare Approach (INI-010, USE-04): the inputs the Change Management Strategy
// needs, one step at a time. Each step says why the input matters, holds the fields or register to complete,
// and shows the stage checks it satisfies (RUL-18). It ends by drafting the strategy. Everything is saved as
// the user goes, so they can leave and come back.
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Spinner } from '../../ui/core.jsx';
import RecordForm from '../../ui/RecordForm.jsx';
import Register from '../../ui/Register.jsx';
import { useIniPage, useTab } from '../../lib/hooks.js';
import { CHECKS } from '../../../shared/rules/stages.js';
import { CHECK_LABELS } from '../../../shared/refdata.js';

const STEPS = [
  {
    id: 'basics', title: 'The initiative', checks: ['initiativeBasics'],
    fields: ['name', 'shortName', 'description', 'containerId', 'primarySponsorId', 'businessOwnerId', 'changeLeadId', 'projectManagerId', 'startDate', 'endDate', 'deliveryApproach', 'classification'],
    why: 'Name the change and the people accountable for it. The primary sponsor authorises and champions the change and explains the business reasons for it; the dates and delivery approach frame every plan.',
  },
  {
    id: 'case', title: 'Case for change', checks: ['caseForChange'], fields: ['businessDrivers', 'problemOpportunity', 'whyNow', 'riskOfNotChanging'],
    why: 'People need to know why before they will consider how. The case for change builds Awareness: it is what the sponsor and leaders explain, and it opens the strategy, the plan and the sponsor messages.',
  },
  {
    id: 'success', title: 'Definition of success', checks: ['adoptionDefinition'], fields: ['reasonForChange', 'benefits', 'adoptionDefinition'],
    why: 'Delivering the solution is not the same as succeeding. Describe the benefits to the organisation and what adoption and usage look like in practice: the behaviours, process steps or system use that show people have changed.',
  },
  {
    id: 'objectives', title: 'Objectives and measures', checks: ['objectives', 'successMeasures'], registers: [['objective', 'Objectives'], ['measure', 'Success measures']],
    why: 'Objectives say what the change must achieve; measures say how you will know, across organisational performance (benefits), individual performance (adoption, usage and proficiency) and change management performance. Give each measure a baseline and a target.',
  },
  {
    id: 'scope', title: 'Scope', checks: ['scope'], fields: ['whatIsChanging', 'whatIsNotChanging', 'exclusions'],
    why: 'Saying plainly what is and is not changing heads off rumour and false expectations, and tells the impact assessment which groups and aspects of work to cover.',
  },
  {
    id: 'milestones', title: 'Releases and milestones', checks: ['milestones'], registers: [['milestone', 'Releases and milestones']],
    why: 'Change activities are timed against the project: design sign-off, testing, go-live and hypercare. Engagements can be scheduled relative to a milestone, so they move when it moves.',
  },
  {
    id: 'impact', title: 'Impacted groups', checks: ['impactedGroups', 'impactsAssessed'], registers: [['impactedGroup', 'Impacted groups']], link: { to: 'impact?tab=groups', label: 'Assess the aspects of change for each group' },
    why: 'Who is affected, and how much? Each group is assessed against the aspects of change (processes, systems, tools, job roles, critical behaviours and more); the overall rating flags the high-impact groups that need the most support.',
  },
  {
    id: 'risk', title: 'Change risk', checks: ['riskAssessed'], link: { to: 'risk', label: 'Assess the change and the organisation' },
    why: 'The characteristics of the change and the attributes of the organisation together give the change risk profile, which scales the approach: the riskier the change, the more of the Core and Extend plans it needs.',
  },
  {
    id: 'sponsorship', title: 'Sponsorship and team', checks: ['sponsorshipModel', 'changeTeam'], link: { to: 'strategy', label: 'Record the sponsorship model and the change team' }, also: { to: 'sponsor?tab=coalition', label: 'Add sponsor coalition members' },
    why: 'Active and visible sponsorship is the strongest contributor to success. Record the coalition of leaders the sponsor needs, the gaps to close, and the change team that will do the work.',
  },
];
const DRAFT = { id: 'draft', title: 'Draft the strategy' };

const passes = (id, m) => { try { return !!CHECKS[id]?.(m); } catch { return false; } };

export default function Guide() {
  const { m, ini, canDo, base } = useIniPage();
  const [stepId, setStep] = useTab(STEPS[0].id, 'step');
  if (!m) return <Spinner />;
  const all = [...STEPS, DRAFT];
  const index = Math.max(0, all.findIndex((s) => s.id === stepId));
  const step = all[index];
  const done = (s) => !!s.checks && s.checks.every((c) => passes(c, m));
  const complete = STEPS.filter(done).length;
  const go = (i) => { setStep(all[Math.min(Math.max(i, 0), all.length - 1)].id); window.scrollTo?.(0, 0); };
  const editable = canDo('U', 'initiative', ini.initiative);
  return (
    <>
      <PageHead eyebrow="Phase 1 · Prepare Approach" title="Guided set-up" actions={<Link className="btn" to={`${base}/setup`}><Icon name="list" />Full definition</Link>}>
        Work through the inputs the Change Management Strategy needs, in order. Each step explains why it matters. Your work is saved as you go, so you can leave and come back.
      </PageHead>
      <div className="guide">
        <nav className="guide-steps" aria-label="Set-up steps">
          <ol>
            {all.map((s, i) => (
              <li key={s.id}>
                <button type="button" className={`${i === index ? 'active' : ''} ${done(s) ? 'done' : ''}`} aria-current={i === index ? 'step' : undefined} onClick={() => go(i)}>
                  <Icon name={s === DRAFT ? 'file' : done(s) ? 'checkCircle' : 'circle'} /><span>{i + 1}. {s.title}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="small muted">{complete} of {STEPS.length} steps complete</p>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={complete} aria-label="Set-up progress"><span style={{ width: `${Math.round((complete / STEPS.length) * 100)}%` }} /></div>
        </nav>
        <div className="stack" style={{ minWidth: 0 }}>
          {step === DRAFT ? <Draft done={done} go={go} base={base} /> : (
            <>
              <Card title={`${index + 1}. ${step.title}`}>
                <div className="callout small"><strong>Why this matters. </strong>{step.why}</div>
                <ul className="check-list guide-checks">
                  {step.checks.map((c) => { const ok = passes(c, m); return <li key={c} className={ok ? 'ok' : 'no'}><Icon name={ok ? 'checkCircle' : 'circle'} /><span>{CHECK_LABELS[c] || c}</span></li>; })}
                </ul>
                {step.fields && (
                  <RecordForm key={`${step.id}:${ini.initiative.version}`} type="initiative" record={ini.initiative} include={step.fields} readOnly={!editable} hideSections
                    saveLabel={index < STEPS.length - 1 ? 'Save and continue' : 'Save and review'} onSaved={() => go(index + 1)} />
                )}
                {(step.link || step.also) && (
                  <div className="btn-row mt-3">
                    {step.link && <Link className="btn btn-primary" to={`${base}/${step.link.to}`}>{step.link.label}<Icon name="arrowRight" /></Link>}
                    {step.also && <Link className="btn" to={`${base}/${step.also.to}`}>{step.also.label}</Link>}
                  </div>
                )}
              </Card>
              {step.registers?.map(([type, title]) => <Card key={type} flush><div className="card-pad"><Register type={type} title={title} /></div></Card>)}
            </>
          )}
          <div className="row-between">
            <button type="button" className="btn" disabled={index === 0} onClick={() => go(index - 1)}><Icon name="chevronLeft" />Back</button>
            {step !== DRAFT && !step.fields && <button type="button" className="btn btn-primary" onClick={() => go(index + 1)}>Next<Icon name="chevronRight" /></button>}
          </div>
        </div>
      </div>
    </>
  );
}

function Draft({ done, go, base }) {
  const open = STEPS.map((s, i) => ({ s, i })).filter(({ s }) => !done(s));
  return (
    <Card title={`${STEPS.length + 1}. ${DRAFT.title}`} sub="Generate the Change Management Strategy from what you have entered. The completeness check lists anything still missing, and you can generate a draft with placeholders and complete it later.">
      {open.length ? (
        <>
          <p className="small">Still to complete:</p>
          <ul className="link-list">{open.map(({ s, i }) => <li key={s.id}><button type="button" className="link-btn" onClick={() => go(i)}>{i + 1}. {s.title}</button></li>)}</ul>
        </>
      ) : <div className="callout good small">Every Phase 1 input the strategy draws on is in place.</div>}
      <div className="btn-row mt-3">
        <Link className="btn btn-primary" to={`${base}/artefacts?type=strategy`}><Icon name="file" />Draft the Change Management Strategy</Link>
        <Link className="btn" to={`${base}/strategy`}>Review the strategy record</Link>
      </div>
    </Card>
  );
}
