// RAID across every engagement the user can see (RAI-008, DSH-004).
import { useState } from 'react';
import { PageHead } from '../components/ui.jsx';
import { useLookups } from '../components/fields.jsx';
import RaidView from '../components/Raid.jsx';

export default function Raid() {
  const lookups = useLookups();
  const [eng, setEng] = useState('');
  return (
    <>
      <PageHead title="RAID" sub="Risks, assumptions, issues, dependencies, decisions and actions across your engagements."
        actions={<select value={eng} onChange={(e) => setEng(e.target.value)} aria-label="Engagement" style={{ width: 'auto' }}><option value="">All engagements</option>{(lookups?.engagements || []).map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>} />
      <RaidView key={eng} engagementId={eng || undefined} title={eng ? lookups?.engagements?.find((e) => e.id === eng)?.label : 'All engagements'} />
    </>
  );
}
