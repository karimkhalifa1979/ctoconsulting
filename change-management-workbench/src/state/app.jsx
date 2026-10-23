// Application state: the API client, the signed-in session (configuration, users, initiatives,
// notifications), toasts and dialogs. Initiative working sets live in ./initiative.jsx.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { indexBy } from '../../shared/util.js';
import { todayIso } from '../../shared/dates.js';
import { clearRecent } from '../lib/recent.js';
import { setDisplayTimeZone } from '../lib/format.js';

const AppCtx = createContext(null);
const ToastCtx = createContext(null);
const DialogCtx = createContext(null);

export const useApp = () => useContext(AppCtx);
export const useToast = () => useContext(ToastCtx);
export const useDialog = () => useContext(DialogCtx);

export function AppProvider({ api, children }) {
  const [boot, setBoot] = useState(null);
  const [status, setStatus] = useState('checking'); // checking | signedOut | ready | error
  const [error, setError] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const load = useCallback(async () => {
    try {
      const b = await api.bootstrap();
      setBoot(b);
      setNotifications(b.notifications || []);
      setStatus('ready');
      return b;
    } catch (e) {
      if (e.status === 401) {
        setBoot(null);
        setStatus('signedOut');
        setError(e.message === 'Not signed in' || e.message === 'Sign in to continue.' || e.message === 'Choose a demonstration user to continue.' ? null : e.message);
        return null;
      }
      setError(e.message);
      setStatus('error');
      return null;
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  // Poll notifications every minute while signed in (WFL-003).
  useEffect(() => {
    if (status !== 'ready') return undefined;
    const t = setInterval(async () => {
      try { setNotifications(await api.op('listNotifications', {})); } catch (e) { if (e.status === 401) load(); }
    }, 60000);
    return () => clearInterval(t);
  }, [status, api, load]);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch { /* ignore */ }
    clearRecent();
    setBoot(null);
    setStatus('signedOut');
  }, [api]);

  const value = useMemo(() => {
    const config = boot?.config || null;
    setDisplayTimeZone(boot?.user?.timeZone);
    const users = boot?.users || [];
    return {
      api,
      mode: api.mode,
      status,
      error,
      boot,
      user: boot?.user || null,
      config,
      settings: config?.settings || {},
      today: todayIso(config?.settings?.timeZone || 'Australia/Sydney'),
      users,
      usersById: indexBy(users),
      initiatives: boot?.initiatives || [],
      containers: boot?.containers || [],
      templates: boot?.templates || [],
      roles: boot?.roles || [],
      features: boot?.features || {},
      notifications,
      setNotifications,
      refresh: load,
      signOut,
      setBootPart: (patch) => setBoot((b) => (b ? { ...b, ...patch } : b)),
    };
  }, [api, status, error, boot, notifications, load, signOut]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

// --- Toasts -------------------------------------------------------------------------------------
let toastSeq = 0;
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const remove = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((kind, message, opts = {}) => {
    const id = ++toastSeq;
    setItems((xs) => [...xs.slice(-3), { id, kind, message, action: opts.action }]);
    setTimeout(() => remove(id), opts.duration || (kind === 'error' ? 9000 : 4500));
    return id;
  }, [remove]);
  const api = useMemo(() => ({
    success: (m, o) => push('success', m, o),
    info: (m, o) => push('info', m, o),
    warn: (m, o) => push('warning', m, o),
    error: (e, o) => push('error', typeof e === 'string' ? e : e?.message || 'Something went wrong', o),
  }), [push]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-msg">{t.message}</span>
            {t.action && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { t.action.run(); remove(t.id); }}>{t.action.label}</button>}
            <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => remove(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// --- Dialogs (confirm and prompt for reasons) ----------------------------------------------------------
export function DialogProvider({ children }) {
  const [dlg, setDlg] = useState(null);
  const resolver = useRef(null);
  const open = useCallback((d) => new Promise((resolve) => { resolver.current = resolve; setDlg(d); }), []);
  const close = (v) => { resolver.current?.(v); resolver.current = null; setDlg(null); };
  const value = useMemo(() => ({
    confirm: (opts) => open({ kind: 'confirm', ...opts }),
    prompt: (opts) => open({ kind: 'prompt', ...opts }),
    alert: (opts) => open({ kind: 'alert', ...opts }),
    custom: (render, opts = {}) => open({ kind: 'custom', render, ...opts }),
  }), [open]);
  return (
    <DialogCtx.Provider value={value}>
      {children}
      {dlg && <DialogView dlg={dlg} close={close} />}
    </DialogCtx.Provider>
  );
}

function DialogView({ dlg, close }) {
  const [text, setText] = useState(dlg.defaultValue || '');
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('textarea, input, button.btn-primary, button')?.focus();
    const onKey = (e) => { if (e.key === 'Escape') close(dlg.kind === 'confirm' ? false : null); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const required = dlg.required !== false;
  const submit = (e) => {
    e?.preventDefault();
    if (dlg.kind === 'prompt') {
      if (required && !text.trim()) return;
      close(text.trim());
    } else close(true);
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(dlg.kind === 'confirm' ? false : null); }}>
      <div className={`modal ${dlg.wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dlg-title" ref={ref}>
        {dlg.kind === 'custom' ? dlg.render(close) : (
          <form onSubmit={submit}>
            <div className="modal-head"><h2 id="dlg-title">{dlg.title || (dlg.kind === 'prompt' ? 'Reason required' : 'Confirm')}</h2></div>
            <div className="modal-body">
              {dlg.message && <div className="dlg-message">{dlg.message}</div>}
              {dlg.kind === 'prompt' && (
                <label className="field">
                  <span>{dlg.label || 'Reason'}{required && <em className="req" aria-hidden="true">*</em>}</span>
                  {dlg.multiline === false
                    ? <input type="text" value={text} onChange={(e) => setText(e.target.value)} required={required} />
                    : <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} required={required} placeholder={dlg.placeholder || ''} />}
                </label>
              )}
            </div>
            <div className="modal-foot">
              {dlg.kind !== 'alert' && <button type="button" className="btn" onClick={() => close(dlg.kind === 'confirm' ? false : null)}>{dlg.cancelLabel || 'Cancel'}</button>}
              <button type="submit" className={`btn ${dlg.danger ? 'btn-danger-solid' : 'btn-primary'}`} disabled={dlg.kind === 'prompt' && required && !text.trim()}>{dlg.confirmLabel || (dlg.kind === 'alert' ? 'OK' : dlg.kind === 'prompt' ? 'Continue' : 'Confirm')}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
