// Change Management Strategy (STR-001 to STR-008): the Phase 1 deliverable. Summary, sponsorship model,
// change team and RACI, governance, planning approach (recommended by risk profile, RUL-14) with an
// override rationale, integration with the project approach, anticipated resistance, budget and approval.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon.jsx';
import { Card, PageHead, Spinner, StatusBadge, Empty, KV } from '../../ui/core.jsx';
import RecordForm from '../../ui/RecordForm.jsx';
import ApprovalPanel from '../../ui/Approvals.jsx';
import { useIniPage } from '../../lib/hooks.js';
import { fmtDate, fmtMoney, label } from '../../lib/format.js';
import { PLANNING_APPROACHES } from '../../../shared/refdata.js';
import { asArray, sum } from '../../../shared/util.js';

const GROUPS = {
  summary: 'Summary of the change',
  approach: 'Planning approach', overrideRationale: 'Planning approach', integrationApproach: 'Planning approach', phaseMapping: 'Planning approach',
  sponsorshipGaps: 'Sponsorship model', sponsorshipActions: 'Sponsorship model',
  changeTeam: 'Change team and responsibilities', raci: 'Change team and responsibilities', governance: 'Governance',
  anticipatedResistance: 'Resistance and special tactics', specialTactics: 'Resistance and special tactics', assumptions: 'Resistance and special tactics',
  budget: 'Budget and resources',
};

export default function Strategy() {
  const { m, mut, ini, canDo, base, users } = useIniPage();
  const [ensuring, setEnsuring] = useState(false);
  const strategy = m?.strategy;
  useEffect(() => {
    if (m && !strategy && !ensuring && canDo('C', 'strategy')) {
      setEnsuring(true);
      mut.op('ensureSingleton', { initiativeId: ini.id, type: 'strategy' }, { quiet: true }).catch(() => {});
    }
  }, [m, strategy]); // eslint-disable-line react-hooks/exhaustive-deps
  const sponsorUser = useMemo(() => users.find((u) => u.stakeholderId && u.stakeholderId === m?.initiative.primarySponsorId), [users, m]);
  if (!m) return <Spinner />;
  if (!strategy) return <Empty icon="route" title="No Change Management Strategy yet">{canDo('C', 'strategy') ? 'Creating…' : 'The change management lead has not started the Strategy.'}</Empty>;
  const rec = m.risk.recommended;
  const total = sum(asArray(strategy.budget), (b) => b.amount);
  const effort = sum(asArray(strategy.budget), (b) => b.effortDays);
  const validate = (d) => (rec && d.approach && d.approach !== rec.id && !String(d.overrideRationale || '').trim() ? [{ field: 'overrideRationale', message: `Explain why the approach differs from the recommended “${rec.label}” (RUL-14)` }] : []);
  return (
    <>
      <PageHead eyebrow="Phase 1 deliverable · Define Approach" title="Change Management Strategy"
        actions={<Link className="btn btn-primary" to={`${base}/artefacts?type=strategy`}><Icon name="file" />Generate document</Link>}>
        The approach to the people side of this change: scale, sponsorship, team, governance and how change activities integrate with the project.
      </PageHead>
      <div className="grid g-main">
        <Card title="Strategy" sub={strategy.approvedVersion ? `Approved version ${strategy.approvedVersion}${strategy.baselineAt ? ` · baselined ${fmtDate(strategy.baselineAt)}` : ''}` : 'Draft'}>
          <RecordForm type="strategy" record={strategy} groups={GROUPS} validate={validate} readOnly={!canDo('U', 'strategy', strategy)} saveLabel="Save Strategy" />
        </Card>
        <div className="stack">
          <Card title="Status and approval">
            <div className="mb-3"><StatusBadge status={strategy.status} labelText={{ draft: 'Draft', forReview: 'For review', approved: 'Approved' }[strategy.status] || strategy.status} /></div>
            <ApprovalPanel subjectType="strategy" subjectId={strategy.id} label="Change Management Strategy" canSubmit={canDo('U', 'strategy', strategy)} defaultApprovers={sponsorUser ? [sponsorUser.id] : []} />
          </Card>
          <Card title="Recommended approach" sub="From the change risk profile (RUL-14)">
            {rec ? (
              <>
                <KV items={[['Risk profile', label('riskProfile', m.risk.profile)], ['Recommended', rec.label], ['Selected', strategy.approach ? PLANNING_APPROACHES.find((p) => p.id === strategy.approach)?.label : 'Not selected']]} />
                {strategy.approach && strategy.approach !== rec.id && <div className={`callout ${strategy.overrideRationale ? '' : 'warn'} small mt-2`}>{strategy.overrideRationale ? <>Override rationale: {strategy.overrideRationale}</> : 'Record why the selected approach differs from the recommendation.'}</div>}
                <p className="small muted mt-2">{rec.description}</p>
                <Link className="btn btn-sm" to={`${base}/risk`}>Risk profile</Link>
              </>
            ) : <Empty icon="shield" title="Assess the change risk profile first" />}
          </Card>
          <Card title="Budget summary" flush>
            <table className="tbl tbl-compact">
              <tbody>{asArray(strategy.budget).map((b, i) => <tr key={i}><td>{label('budgetCategory', b.category)}<div className="tiny muted">{b.period}{b.notes ? ` · ${b.notes}` : ''}</div></td><td className="num">{fmtMoney(b.amount)}</td><td className="num">{b.effortDays ?? '—'} d</td></tr>)}</tbody>
              <tfoot><tr><td>Total</td><td className="num">{fmtMoney(total)}</td><td className="num">{effort} d</td></tr></tfoot>
            </table>
          </Card>
          <Card title="Sponsor coalition" flush actions={<Link to={`${base}/sponsor?tab=coalition`} className="btn btn-sm">Sponsorship</Link>}>
            {m.coalition.length ? (
              <table className="tbl tbl-compact"><tbody>{m.coalition.map((c) => <tr key={c.id}><td>{m.stakeholderName(c.stakeholderId)}<div className="tiny muted">{c.area}</div></td><td><StatusBadge status={c.status === 'aligned' ? 'aligned' : c.status === 'atRisk' ? 'atRisk' : 'inProgress'} labelText={{ aligned: 'Aligned', inProgress: 'In progress', atRisk: 'At risk' }[c.status]} /></td></tr>)}</tbody></table>
            ) : <Empty icon="star" title="No coalition recorded" />}
          </Card>
        </div>
      </div>
    </>
  );
}

