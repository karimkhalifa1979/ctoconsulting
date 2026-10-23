// Background jobs on the server: the shared jobs (shared/jobs.js) every minute, and directory
// synchronisation from an HR export (STK-049, INT-002).
import fs from 'node:fs';
import { asArray, parseCsv } from '../shared/util.js';
import { createJobs } from '../shared/jobs.js';

export function startScheduler(service, { log }) {
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

  // Directory synchronisation from an HR export (CSV) runs with the daily jobs when configured.
  const { tick, dailyJobs } = createJobs(service, {
    log,
    retentionAuto: process.env.CMW_RETENTION_AUTO === '1',
    daily: async () => { if (process.env.CMW_HR_SYNC_FILE && fs.existsSync(process.env.CMW_HR_SYNC_FILE)) await hrSync(process.env.CMW_HR_SYNC_FILE); },
  });

  setTimeout(tick, 5000).unref();
  setInterval(tick, 60000).unref();
  return { tick, dailyJobs, hrSync, _asArray: asArray };
}
