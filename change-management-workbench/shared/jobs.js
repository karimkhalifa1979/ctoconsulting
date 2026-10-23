// Background jobs, shared by the server's scheduler and the browser-only workbench: scheduled artefact
// generation (ART-015), engagement locking (RUL-10), the daily cadence check and notifications (RUL-06,
// AC-03), measure alerts (MEA-006), survey opening and closure (ADK-007) and the retention report (ADM-006).
import { cadenceKey, cadenceNotice, measureKey, measureNotice } from './service/notices.js';

export function createJobs(service, { log = () => {}, retentionAuto = false, daily = null } = {}) {
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
      // Scheduled surveys open (and are emailed) on their opening date; surveys past their closing date are
      // closed and aggregated (ADK-007).
      for (const s of m.surveys) if (s.status === 'scheduled' && s.opensAt && s.opensAt <= today) await service.ops.openSurvey(service.SYSTEM, { id: s.id });
      for (const s of m.surveys) if (s.status === 'open' && s.closesAt && s.closesAt < today) await service.ops.closeSurvey(service.SYSTEM, { id: s.id });
    }
    await service.driver.setConfig('jobState', { ...state, cadenceNotified: notified, measureNotified, lastDaily: today });
    if (daily) await daily();
    // Retention: report what is due; apply automatically only when configured.
    const ret = await service.ops.applyRetention(service.SYSTEM, { dryRun: !retentionAuto });
    if (ret.actions.length) log('info', `Retention: ${ret.actions.length} action(s) ${ret.dryRun ? 'due (dry run)' : 'applied'}`);
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

  return { tick, dailyJobs };
}
