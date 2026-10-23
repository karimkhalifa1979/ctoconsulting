// A register of one record type inside an initiative: grid, facets, bulk edit, create and open in a
// drawer. Most simple registers (milestones, decisions, risks, FAQs, lessons …) are one of these.
import { useMemo } from 'react';
import Icon from './Icon.jsx';
import DataGrid, { schemaColumns, facetFor } from './DataGrid.jsx';
import { useRecordDrawer } from './RecordDrawer.jsx';
import { useLookups } from './RecordForm.jsx';
import { ImportButton } from './ImportWizard.jsx';
import { useApp } from '../state/app.jsx';
import { useIni } from '../state/initiative.jsx';
import { can } from '../../shared/access.js';
import { entity, fieldsOf } from '../../shared/schema.js';

// Registers whose records are not kept as spreadsheet rows.
const NO_IMPORT = new Set(['schedule', 'narrative', 'toolkitItem']);

export default function Register({
  type, rows: givenRows, filter, title, sub, columns: givenColumns, include, exclude, prepend = [], append = [], facets: facetKeys, defaults, formInclude, formExclude,
  bulkFields, bulkActions, toolbar, onOpen, createLabel, canCreate: canCreateProp, defaultSort, empty, id, rowClass, compact, drawerWide, after, before, importable,
}) {
  const { user, config } = useApp();
  const ini = useIni();
  const lookups = useLookups();
  const drawer = useRecordDrawer();
  const meta = entity(type);
  const rows = useMemo(() => {
    const base = givenRows || ini.records[type] || [];
    return filter ? base.filter(filter) : base;
  }, [givenRows, ini.records, type, filter]);
  const columns = useMemo(() => [
    ...prepend,
    ...(givenColumns || [{ key: 'code', label: 'ID', render: (r) => <span className="code">{r.code}</span>, value: (r) => r.code, width: 80 }, ...schemaColumns(type, { config, lookups, model: ini.model, include, exclude })]),
    ...append,
  ], [givenColumns, prepend, append, type, config, lookups, ini.model, include, exclude]);
  const facets = useMemo(() => {
    const keys = facetKeys || fieldsOf(type, config).filter((f) => f.grid && f.type === 'select').map((f) => f.key).slice(0, 3);
    return keys.map((k) => fieldsOf(type, config).find((f) => f.key === k)).filter(Boolean).map((f) => facetFor(f, rows, { config, model: ini.model })).filter((f) => f.options.length > 1);
  }, [facetKeys, type, config, rows, ini.model]);
  const canCreate = canCreateProp ?? (!ini.readOnly && can(user, 'C', type, { ...(defaults || {}), type }));
  const open = (r) => (onOpen ? onOpen(r) : drawer.open({ type, id: r.id, include: formInclude, exclude: formExclude, wide: drawerWide, after, before }));
  const create = () => drawer.open({ type, defaults, include: formInclude, exclude: formExclude, wide: drawerWide, after, before });
  const editable = !ini.readOnly && can(user, 'U', type, null);
  const canImport = canCreate && (importable ?? !NO_IMPORT.has(type));
  return (
    <div className="stack">
      {(title || canCreate) && (
        <div className="row-between">
          <div>{title && <h2>{title}</h2>}{sub && <p className="small muted" style={{ margin: '2px 0 0' }}>{sub}</p>}</div>
          {canCreate && <div className="btn-row">{canImport && <ImportButton type={type} initiativeId={ini.id} />}<button type="button" className="btn btn-primary" onClick={create}><Icon name="plus" />{createLabel || `Add ${meta.label.toLowerCase()}`}</button></div>}
        </div>
      )}
      <DataGrid id={id || `${type}`} type={type} title={title || meta.plural} rows={rows} columns={columns} facets={facets} onRowClick={open}
        selectable={editable && !!(bulkFields?.length || bulkActions?.length)} bulkFields={editable ? bulkFields : []} bulkActions={bulkActions} toolbar={toolbar}
        defaultSort={defaultSort} empty={empty} exportName={`${ini.initiative?.shortName || ''} ${meta.plural}`.trim()} rowClass={rowClass} compact={compact} />
    </div>
  );
}
