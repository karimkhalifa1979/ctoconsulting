import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/store.jsx';
import { PageHead, Card, Modal } from '../components/ui.jsx';
import { buildEvents, eventDeadlinesFor, toICS } from '../lib/calendar.js';
import { downloadBlob, safeName } from '../lib/exporters.js';

const CATEGORIES = ['Reporting', 'Commencement', 'Review', 'Audit', 'Exemption', 'Remediation'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n) => String(n).padStart(2, '0');
const monthLabel = (y, m) => new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function CalendarPage() {
  const { org, data, assessments, docs } = useApp();
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const [view, setView] = useState('month');
  const [ym, setYm] = useState([now.getFullYear(), now.getMonth()]);
  const [cats, setCats] = useState(new Set(CATEGORIES));
  const [open, setOpen] = useState(null);
  const all = useMemo(() => buildEvents({ org, data, assessments, docs }), [org, data, assessments, docs]);
  const events = all.filter((e) => cats.has(e.category));
  const deadlines = eventDeadlinesFor(org);
  const byDate = events.reduce((m, e) => ((m[e.date] ||= []).push(e), m), {});
  const overdue = events.filter((e) => e.date < today && ['remediation', 'exemption'].includes(e.kind));

  const [y, m] = ym;
  const first = new Date(Date.UTC(y, m, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(y, m, 1 - offset + i)));
  const shift = (d) => setYm(([yy, mm]) => { const t = new Date(Date.UTC(yy, mm + d, 1)); return [t.getUTCFullYear(), t.getUTCMonth()]; });
  const toggle = (c) => setCats((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  const upcoming = events.filter((e) => e.date >= today);
  const months = upcoming.reduce((acc, e) => ((acc[e.date.slice(0, 7)] ||= []).push(e), acc), {});

  return (
    <div>
      <PageHead eyebrow="Regulatory calendar" title={`Upcoming obligations — ${org.shortName}`}
        actions={<button className="btn dl" onClick={() => downloadBlob(toICS(events, org.name), `${safeName(org.shortName)}_regulatory_calendar.ics`, 'text/calendar')}>Export to Outlook / Google (.ics)</button>}>
        Statutory reporting and commencement dates for the organisation’s applicable sources, plus requirement reviews, control audits, exemption expiries and remediation due dates from the register and assessment.
      </PageHead>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px', alignItems: 'start' }} data-layout="calendar">
        <div className="card">
          <div className="card-head" style={{ flexWrap: 'wrap' }}>
            <div className="btn-row">
              <button className="btn btn-sm" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
              <h3 style={{ minWidth: 150, textAlign: 'center' }}>{view === 'month' ? monthLabel(y, m) : 'Next 18 months'}</h3>
              <button className="btn btn-sm" onClick={() => shift(1)} aria-label="Next month">›</button>
              <button className="btn btn-sm" onClick={() => setYm([now.getFullYear(), now.getMonth()])}>Today</button>
            </div>
            <div className="btn-row">
              <div className="tabs" style={{ margin: 0, border: 0 }}>
                <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button>
                <button className={view === 'agenda' ? 'active' : ''} onClick={() => setView('agenda')}>Agenda</button>
              </div>
            </div>
          </div>
          <div className="card-body" style={{ paddingBottom: 6 }}>
            <div className="chips">
              {CATEGORIES.map((c) => (
                <button key={c} className={`chip ${cats.has(c) ? 'on' : ''}`} onClick={() => toggle(c)} aria-pressed={cats.has(c)}>
                  <span className={`cat-${c}`} style={{ display: 'inline-block', width: 10, height: 10, borderLeft: '10px solid', marginRight: 6, verticalAlign: 'middle' }} />{c} ({all.filter((e) => e.category === c).length})
                </button>
              ))}
            </div>
          </div>
          {view === 'month' ? (
            <div style={{ padding: '10px 16px 16px', overflowX: 'auto' }}>
              <div className="cal-grid" style={{ minWidth: 640 }}>
                {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
                {cells.map((d) => {
                  const key = d.toISOString().slice(0, 10);
                  const evs = byDate[key] || [];
                  return (
                    <div key={key} className={`cal-cell ${d.getUTCMonth() !== m ? 'out' : ''} ${key === today ? 'today' : ''}`}>
                      <div className="d">{d.getUTCDate()}</div>
                      {evs.slice(0, 4).map((e) => <div key={e.id} className={`cal-ev cat-${e.category}`} onClick={() => setOpen(e)} title={e.title}>{e.title}</div>)}
                      {evs.length > 4 && <div className="small muted" style={{ cursor: 'pointer' }} onClick={() => setOpen({ list: evs, date: key })}>+{evs.length - 4} more</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="card-body">
              {Object.entries(months).map(([mk, list]) => (
                <div key={mk}>
                  <div className="agenda-month">{monthLabel(Number(mk.slice(0, 4)), Number(mk.slice(5)) - 1)}</div>
                  {list.map((e) => (
                    <div key={e.id} className={`agenda-item cat-${e.category}`} onClick={() => setOpen(e)} style={{ cursor: 'pointer' }}>
                      <div className="date">{new Date(`${e.date}T00:00:00Z`).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', timeZone: 'UTC' })}</div>
                      <div><div style={{ fontWeight: 600 }}>{e.title}</div><div className="small muted">{e.source || e.desc}</div></div>
                      <div className="btn-row"><span className="badge">{e.category}</span>{e.indicative && <span className="badge" title="Date set by regulator each cycle — confirm">Indicative</span>}</div>
                    </div>
                  ))}
                </div>
              ))}
              {!upcoming.length && <p className="muted">No upcoming items for the selected categories.</p>}
            </div>
          )}
        </div>

        <div className="stack">
          {overdue.length > 0 && (
            <Card title={`Overdue (${overdue.length})`}>
              {overdue.map((e) => <div key={e.id} className="small" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => setOpen(e)}><span className="badge pri-Critical">{e.date}</span> {e.title}</div>)}
            </Card>
          )}
          <Card title="Next 30 days">
            {upcoming.filter((e) => e.date <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)).map((e) => (
              <div key={e.id} className="small" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => setOpen(e)}><span className="badge badge-navy tabular">{e.date}</span> {e.title}</div>
            ))}
          </Card>
          <Card title="Event-driven deadlines" subtitle="Triggered by an incident or event rather than a date">
            {deadlines.map((d) => (
              <div key={d.title} style={{ marginBottom: 10 }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><strong className="small">{d.title}</strong><span className="badge pri-High nowrap">{d.deadline}</span></div>
                <div className="small muted">{d.source}</div>
              </div>
            ))}
            {!deadlines.length && <p className="small muted">None for the applicable sources.</p>}
          </Card>
          <p className="small muted">Dates marked <em>indicative</em> are set by the regulator each cycle; confirm them before relying on them. Review and audit dates come from each requirement’s Review Frequency, Audit Frequency and Last Reviewed attributes.</p>
        </div>
      </div>

      {open && (
        <Modal title={open.list ? `Events on ${open.date}` : open.title} onClose={() => setOpen(null)}>
          {open.list ? open.list.map((e) => <div key={e.id} className="cal-ev" style={{ whiteSpace: 'normal' }} onClick={() => setOpen(e)}>{e.title}</div>) : (
            <dl style={{ margin: 0 }}>
              <div className="attr"><dt>Date</dt><dd>{open.date}{open.indicative ? ' (indicative — confirm with the regulator)' : ''}</dd></div>
              <div className="attr"><dt>Category</dt><dd>{open.category}</dd></div>
              {open.source && <div className="attr"><dt>Source</dt><dd>{open.source}</dd></div>}
              {open.desc && <div className="attr"><dt>Details</dt><dd>{open.desc}</dd></div>}
              {open.owner && <div className="attr"><dt>Owner</dt><dd>{open.owner}</dd></div>}
              {open.items && <div className="attr"><dt>Requirements</dt><dd>{open.items.map((id) => <Link key={id} to={`/requirements?id=${encodeURIComponent(id)}`} style={{ marginRight: 8 }}>{id}</Link>)}</dd></div>}
            </dl>
          )}
        </Modal>
      )}
    </div>
  );
}
