// Client register (CLI-001..003): organisations with their hierarchy, sector and obligations.
import { Link } from 'react-router-dom';
import { useSession } from '../lib/session.jsx';
import { PageHead, Status } from '../components/ui.jsx';
import { Register } from '../components/Record.jsx';

export default function Clients() {
  const { me } = useSession();
  return (
    <>
      <PageHead title="Clients" sub="Departments and agencies, or groups and their subsidiaries; obligations here flow to every engagement (CLI-001..005)." />
      <Register entity="client" canCreate={me.can.clientsWrite} title="Client register" columns={[
        { key: 'code', label: 'Code' },
        { key: 'legal_name', label: 'Client', render: (c) => <Link className="strong" to={`/clients/${c.id}`} onClick={(e) => e.stopPropagation()}>{c.trading_name || c.legal_name}</Link> },
        { key: 'sector', label: 'Sector' },
        { key: 'sector_type', label: 'Type' },
        { key: 'abn', label: 'ABN' },
        { key: 'status', label: 'Status', render: (c) => <Status v={c.status} /> },
      ]} />
    </>
  );
}
