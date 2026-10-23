// Record drawer: details form plus comments with @mentions (WFL-004), attachments (WFL-005) and the
// record's audit history (SEC-05). Any screen can open one through useRecordDrawer().
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import RecordForm, { useLookups } from './RecordForm.jsx';
import { Drawer, Tabs, Empty, Spinner, Badge } from './core.jsx';
import { RefPicker } from './fields.jsx';
import { entity } from '../../shared/schema.js';
import { stripHtml } from '../../shared/util.js';
import { useApp, useToast } from '../state/app.jsx';
import { useIniOptional, useMutator } from '../state/initiative.jsx';
import { downloadFile } from '../data/client.js';
import { fmtDateTime } from '../lib/format.js';
import { rememberRecent } from '../lib/recent.js';

const DrawerCtx = createContext(null);
export const useRecordDrawer = () => useContext(DrawerCtx);

export function RecordDrawerHost({ children }) {
  const [stack, setStack] = useState([]);
  const open = useCallback((spec) => setStack((s) => [...s, spec]), []);
  const close = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const value = useMemo(() => ({ open, close }), [open, close]);
  const top = stack[stack.length - 1];
  return (
    <DrawerCtx.Provider value={value}>
      {children}
      {top && <RecordDrawerView key={`${top.type}:${top.id || 'new'}:${stack.length}`} spec={top} onClose={close} />}
    </DrawerCtx.Provider>
  );
}

function RecordDrawerView({ spec, onClose }) {
  const { api, config, user, settings } = useApp();
  const ini = useIniOptional();
  const [record, setRecord] = useState(spec.record || null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('details');
  const meta = entity(spec.type);
  const fromSet = spec.id && ini?.records?.[spec.type]?.find((r) => r.id === spec.id);

  useEffect(() => {
    if (!spec.id) return;
    if (fromSet) { setRecord(fromSet); return; }
    api.get(spec.type, spec.id).then(setRecord).catch(setError);
  }, [spec.id, fromSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const isNew = !spec.id;
  let title = spec.title;
  if (!title) {
    if (isNew) title = `New ${meta.label.toLowerCase()}`;
    else if (record) {
      try { title = stripHtml(String(meta.title(record) || record.code)); } catch { title = record.code; }
      if (spec.type === 'stakeholder') title = `${record.preferredName || record.givenName} ${record.familyName}`;
    } else title = meta.label;
  }
  const canDiscuss = !isNew && !['comment', 'attachment', 'notification'].includes(spec.type);
  useEffect(() => {
    if (record?.id && !isNew && !['comment', 'attachment', 'notification', 'savedView'].includes(spec.type)) rememberRecent(user?.id, { type: spec.type, id: record.id, code: record.code, title, initiativeId: record.initiativeId });
  }, [record?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Drawer title={title} sub={`${meta.label}${record?.code ? ` · ${record.code}` : ''}`} onClose={onClose} wide={spec.wide}>
      {error && <div className="callout bad">{error.message}</div>}
      {!isNew && !record && !error && <Spinner />}
      {(isNew || record) && (
        <>
          {canDiscuss && (
            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'details', label: 'Details' }, { id: 'comments', label: 'Comments', icon: 'chat' }, { id: 'files', label: 'Attachments', icon: 'paperclip' }, { id: 'history', label: 'History', icon: 'history' }]} />
          )}
          {tab === 'details' && (
            <>
              {spec.before?.(record)}
              <RecordForm type={spec.type} record={record} defaults={spec.defaults} include={spec.include} exclude={spec.exclude} showHidden={spec.showHidden} readOnly={spec.readOnly}
                onSaved={(saved) => { spec.onSaved?.(saved); if (spec.closeOnSave !== false) onClose(); else if (saved) setRecord(saved); }} onCancel={onClose} />
              {spec.after?.(record)}
            </>
          )}
          {tab === 'comments' && <Comments recordType={spec.type} record={record} />}
          {tab === 'files' && <Attachments recordType={spec.type} record={record} />}
          {tab === 'history' && <History recordType={spec.type} record={record} tz={settings.timeZone} />}
        </>
      )}
    </Drawer>
  );
}

function useActivity(recordType, record) {
  const { api } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.op('recordActivity', { recordType, recordId: record.id }).then(setData).catch(setError), [api, recordType, record?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}

function Comments({ recordType, record }) {
  const { user, usersById, config, settings } = useApp();
  const lookups = useLookups();
  const mut = useMutator();
  const { data, error, reload } = useActivity(recordType, record);
  const [body, setBody] = useState('');
  const [mentions, setMentions] = useState([]);
  const post = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    await mut.create('comment', { initiativeId: record.initiativeId || (recordType === 'initiative' ? record.id : null), recordType, recordId: record.id, body, mentions });
    setBody('');
    setMentions([]);
    reload();
  };
  if (error) return <div className="callout bad">{error.message}</div>;
  if (!data) return <Spinner />;
  return (
    <div className="stack">
      {data.comments.length ? (
        <ul className="timeline">
          {data.comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((c) => (
            <li key={c.id} className="done">
              <div className="tl-date">{usersById[c.createdBy]?.name || 'Someone'} · {fmtDateTime(c.createdAt, settings.timeZone)}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
              {c.mentions?.length > 0 && <div className="small muted">Mentioned: {c.mentions.map((m) => usersById[m]?.name || m).join(', ')}</div>}
            </li>
          ))}
        </ul>
      ) : <Empty icon="chat" title="No comments yet">Discuss this record with your team. Mention people to notify them.</Empty>}
      <form onSubmit={post} className="stack-sm">
        <label className="field"><span>Add a comment</span><textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment…" /></label>
        <label className="field"><span>Notify people</span><RefPicker multiple options={lookups.optionsFor('user').filter((u) => u.id !== user.id)} value={mentions} onChange={setMentions} placeholder="Mention someone…" /></label>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}><button type="submit" className="btn btn-primary" disabled={!body.trim()}>Post comment</button></div>
      </form>
    </div>
  );
}

function Attachments({ recordType, record }) {
  const { api, settings } = useApp();
  const toast = useToast();
  const mut = useMutator();
  const { data, error, reload } = useActivity(recordType, record);
  const [busy, setBusy] = useState(false);
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await api.upload({ recordType, recordId: record.id, file });
      toast.success(`${file.name} attached`);
      await mut.refresh();
      reload();
    } catch (err) {
      toast.error(err);
    } finally { setBusy(false); }
  };
  if (error) return <div className="callout bad">{error.message}</div>;
  if (!data) return <Spinner />;
  return (
    <div className="stack">
      <div className="row-between">
        <span className="small muted">Up to {settings.attachments?.maxMb || 20} MB. Allowed: {(settings.attachments?.allowed || []).join(', ')}. Files are scanned before they are stored (SEC-10).</span>
        <label className="btn btn-sm"><Icon name="upload" />{busy ? 'Uploading…' : 'Attach a file'}<input type="file" hidden onChange={upload} disabled={busy} /></label>
      </div>
      {data.attachments.length ? (
        <table className="tbl"><thead><tr><th>File</th><th className="num">Size</th><th>Scan</th><th /></tr></thead>
          <tbody>{data.attachments.map((a) => (
            <tr key={a.id}>
              <td><button type="button" className="link-btn" onClick={() => downloadFile(api, a.blobId, a.filename).catch(toast.error)}>{a.filename}</button></td>
              <td className="num">{Math.max(1, Math.round(a.size / 1024))} KB</td>
              <td className="small muted">{a.scan}</td>
              <td className="right"><button type="button" className="btn btn-xs btn-danger" onClick={async () => { await mut.op('removeAttachment', { id: a.id }); reload(); }}>Remove</button></td>
            </tr>
          ))}</tbody></table>
      ) : <Empty icon="paperclip" title="No attachments">Attach agendas, minutes, presentations or evidence.</Empty>}
    </div>
  );
}

function History({ recordType, record, tz }) {
  const { data, error } = useActivity(recordType, record);
  if (error) return <div className="callout bad">{error.message}</div>;
  if (!data) return <Spinner />;
  if (!data.history.length) return <Empty icon="history" title="No history recorded" />;
  return (
    <ul className="timeline">
      {data.history.map((h) => (
        <li key={h.seq} className="done">
          <div className="tl-date">{fmtDateTime(h.ts, tz)} · {h.userName}</div>
          <div className="tl-title">{h.summary} {h.action === 'lockedEdit' && <Badge tone="warning" icon="lock">Edited after locking</Badge>}</div>
          {h.reason && <div className="small">Reason: {h.reason}</div>}
          {h.changes?.length > 0 && (
            <ul className="small muted" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {h.changes.slice(0, 12).map((c, i) => <li key={i}>{c.field}: {c.sensitive ? 'restricted value changed' : `${c.from ?? '—'} → ${c.to ?? '—'}`}</li>)}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
