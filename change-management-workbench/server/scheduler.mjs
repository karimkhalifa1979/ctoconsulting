// Background jobs: scheduled artefact generation (ART-015), engagement locking (RUL-10), the daily cadence
// check and notifications (RUL-06, AC-03), measure alerts (MEA-006), survey closure (ADK-007),
// directory synchronisation (STK-049, INT-002) and the retention report (ADM-006).
import fs from 'node:fs';
import { asArray, parseCsv } from '../shared/util.js';
import { cadenceKey, cadenceNotice, measureKey, measureNotice } from '../shared/service/notices.js';

export function startScheduler(service, { log }) {
  let running = false;
  let lastHourly = 0;
  let lastDaily = '';

  async function jobState() {
    return (await service.driver.getConfig('jobState')) || {};
  }

  async function dailyJobs() {
    const state = await jobState();
    const today = await service.today();
    const notified = state.cadenceNotified || {};
    const measureNotified = state.measureNotified || {};
    for (const ini of await service.driver.list('initiative')) {
      if (ini.status === 'closed') continue;
      const m = await service.model(ini.id);
      // AC-03: stakeholders overdue for engagement are flagged and the relationship owner is notified,
      // once per overdue episode.
      for (const p of m.profiles) {
        if (!p.cadence?.overdue) continue;
        const key = cadenceKey(p);
        if (notified[key]) continue;
        notified[key] = today;
        await service.notify([p.relationshipOwnerId, p.delegateId], cadenceNotice(ini, p));
      }
      // MEA-006: measures below threshold.
      for (const x of m.measures) {
        if (!x.belowThreshold) continue;
        const key = measureKey(x);
        if (measureNotified[key]) continue;
        measureNotified[key] = today;
        await service.notify([x.ownerId, ini.changeLeadId], measureNotice(ini, x));
      }
      // Surveys past their closing date are closed and aggregated.
      for (const s of m.surveys) if (s.status === 'open' && s.closesAt && s.closesAt < today) await service.ops.closeSurvey(service.SYSTEM, { id: s.id });
    }
    await service.driver.setConfig('jobState', { ...state, cadenceNotified: notified, measureNotified, lastDaily: today });
    // Directory synchronisation from an HR export (CSV) when configured.
    if (process.env.CMW_HR_SYNC_FILE && fs.existsSync(process.env.CMW_HR_SYNC_FILE)) await hrSync(process.env.CMW_HR_SYNC_FILE);
    // Retention: report what is due; apply automatically only when configured.
    const ret = await service.ops.applyRetention(service.SYSTEM, { dryRun: process.env.CMW_RETENTION_AUTO !== '1' });
    if (ret.actions.length) log('info', `Retention: ${ret.actions.length} action(s) ${ret.dryRun ? 'due (dry run)' : 'applied'}`);
  }

  // STK-049: synchronise enterprise attributes from the authoritative source and flag leavers and movers.
  async function hrSync(file) {
    const rows = parseCsv(fs.readFileSync(file, 'utf8'));
    if (rows.length < 2) return;
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (n) => head.indexOf(n);
    const stakeholders = await service.driver.list('stakeholder');
    let updated = 0, leavers = 0;
    for (const r of rows.slice(1)) {
      const email = String(r[col('email')] || '').trim().toLowerCase();
      const s = stakeholders.find((x) => x.email?.toLowerCase() === email || (r[col('employeeid')] && x.sourceId === r[col('employeeid')]));
      if (!s) continue;
      const patch = {};
      const map = { position: 'positionTitle', location: 'location', businessunit: 'businessUnit', costcentre: 'costCentre' };
      for (const [k, f] of Object.entries(map)) if (col(k) >= 0 && r[col(k)] && r[col(k)] !== s[f]) patch[f] = r[col(k)];
      if (col('manageremail') >= 0) {
        const mgr = stakeholders.find((x) => x.email?.toLowerCase() === String(r[col('manageremail')]).toLowerCase());
        if (mgr && mgr.id !== s.managerId) patch.managerId = mgr.id;
      }
      if (col('status') >= 0 && /left|terminated|inactive/i.test(r[col('status')]) && s.status !== 'left') { patch.status = 'left'; patch.leftDate = await service.today(); leavers++; }
      if (Object.keys(patch).length) {
        await service.update(service.SYSTEM, 'stakeholder', s.id, { ...patch, source: s.source === 'manual' ? 'hr' : s.source }, { system: true, reason: 'HR synchronisation' });
        updated++;
      }
    }
    log('info', `HR synchronisation: ${updated} stakeholders updated, ${leavers} leavers flagged`);
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      await service.ops.runSchedules(service.SYSTEM, {});
      if (Date.now() - lastHourly > 3600000) {
        lastHourly = Date.now();
        await service.ops.lockDueEngagements(service.SYSTEM, {});
      }
      const today = await service.today();
      const hour = Number(new Intl.DateTimeFormat('en-AU', { timeZone: (await service.getConfig()).settings.timeZone, hour: '2-digit', hour12: false }).format(new Date()));
      if (lastDaily !== today && hour >= 6) {
        const state = await jobState();
        if (state.lastDaily !== today) await dailyJobs();
        lastDaily = today;
      }
    } catch (e) {
      log('error', 'Scheduled job failed', e.stack || e.message);
    } finally {
      running = false;
    }
  }

  setTimeout(tick, 5000).unref();
  setInterval(tick, 60000).unref();
  return { tick, dailyJobs, hrSync, _asArray: asArray };
}
