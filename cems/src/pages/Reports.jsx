// Reports home: the archive of generated reports (RPT-047) with links to generate, track status
// updates, manage templates and look up tokens.
import { Link } from 'react-router-dom';
import { useSession, canAnywhere } from '../lib/session.jsx';
import { PageHead } from '../components/ui.jsx';
import { ReportList } from '../components/Reports.jsx';
import Icon from '../components/Icon.jsx';

export default function Reports() {
  const { me } = useSession();
  return (
    <>
      <PageHead title="Reports" sub="Generated from approved status updates and live financials, frozen in a snapshot, reviewed, issued and distributed."
        actions={<>
          <Link className="btn btn-sm" to="/reports/tracker"><Icon name="activity" /> Status tracker</Link>
          <Link className="btn btn-sm" to="/reports/templates"><Icon name="file" /> Templates</Link>
          <Link className="btn btn-sm" to="/reports/tokens"><Icon name="book" /> Token reference</Link>
          {canAnywhere(me, 'report', 'C') && <Link className="btn btn-sm btn-primary" to="/reports/new"><Icon name="plus" /> Generate report</Link>}
        </>} />
      <ReportList title="Report archive" sub="Search by engagement, type, status and period; issued versions are locked and kept with their snapshots." />
    </>
  );
}
