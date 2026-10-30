// Engagement memberships (ACC-001, ACC-006, ACC-007, ACC-008): every grant, change and removal is audited.
import { newId, nowIso } from '../db.mjs';
import { todayIn } from '../../shared/dates.js';
import { ROLE_LABEL } from '../../shared/permissions.js';
import { badRequest } from '../http.mjs';

export function createMemberships(app) {
  const { db, audit, settings } = app;
  const row = (m) => (m ? { ...m, project_ids: m.project_ids ? JSON.parse(m.project_ids) : null, grants: m.grants ? JSON.parse(m.grants) : [] } : null);

  function list(engagementId, { includeEnded = false } = {}) {
    return db.prepare(`SELECT * FROM memberships WHERE engagement_id = ? ${includeEnded ? '' : 'AND ended_at IS NULL'} ORDER BY role, created_at`).all(engagementId).map(row);
  }
  const forUser = (userId) => db.prepare('SELECT * FROM memberships WHERE user_id = ? AND ended_at IS NULL').all(userId).map(row);

  function add(ctx, { engagementId, userId, role, projectIds = null, grants = [], startDate = null, endDate = null }) {
    if (!ROLE_LABEL[role]) throw badRequest(`Unknown role ${role}`);
    const user = app.auth.getUser(userId);
    if (!user) throw badRequest('User not found');
    if (user.external && role !== 'client') throw badRequest('External users can only hold the client stakeholder role (ACC-005).');
    if (!user.external && role === 'client') throw badRequest('The client stakeholder role is for external users.');
    const id = newId('mem');
    db.prepare('INSERT INTO memberships (id, engagement_id, user_id, role, project_ids, grants, start_date, end_date, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, engagementId, userId, role, projectIds?.length ? JSON.stringify(projectIds) : null, JSON.stringify(grants || []), startDate, endDate, nowIso(), ctx?.user?.id || null);
    audit.record({
      userId: ctx?.user?.id, ip: ctx?.ip, action: 'grant', entity: 'membership', entityId: id, engagementId,
      summary: `Granted ${ROLE_LABEL[role]} to ${user.name}${endDate ? ` until ${endDate}` : ''}`, after: { user: user.email, role, projectIds, grants, startDate, endDate },
    });
    return row(db.prepare('SELECT * FROM memberships WHERE id = ?').get(id));
  }

  function ensure(ctx, { engagementId, userId, role }) {
    const existing = db.prepare('SELECT * FROM memberships WHERE engagement_id = ? AND user_id = ? AND role = ? AND ended_at IS NULL').get(engagementId, userId, role);
    return existing ? row(existing) : add(ctx, { engagementId, userId, role });
  }

  function update(ctx, id, changes) {
    const cur = row(db.prepare('SELECT * FROM memberships WHERE id = ?').get(id));
    if (!cur) throw badRequest('Membership not found');
    const next = { ...cur, ...changes };
    db.prepare('UPDATE memberships SET role = ?, project_ids = ?, grants = ?, start_date = ?, end_date = ? WHERE id = ?')
      .run(next.role, next.project_ids?.length ? JSON.stringify(next.project_ids) : null, JSON.stringify(next.grants || []), next.start_date || null, next.end_date || null, id);
    audit.record({ userId: ctx?.user?.id, ip: ctx?.ip, action: 'access-change', entity: 'membership', entityId: id, engagementId: cur.engagement_id, summary: `Changed access for ${app.auth.getUser(cur.user_id)?.name}`, before: cur, after: next });
    return next;
  }

  function end(ctx, id, reason = 'Removed') {
    const cur = row(db.prepare('SELECT * FROM memberships WHERE id = ?').get(id));
    if (!cur || cur.ended_at) return cur;
    db.prepare('UPDATE memberships SET ended_at = ? WHERE id = ?').run(nowIso(), id);
    audit.record({ userId: ctx?.user?.id, ip: ctx?.ip, action: 'revoke', entity: 'membership', entityId: id, engagementId: cur.engagement_id, summary: `Removed ${ROLE_LABEL[cur.role]} from ${app.auth.getUser(cur.user_id)?.name}: ${reason}`, before: cur });
    return { ...cur, ended_at: nowIso() };
  }

  function endRole(ctx, { engagementId, userId, role, reason }) {
    for (const m of db.prepare('SELECT id FROM memberships WHERE engagement_id = ? AND user_id = ? AND role = ? AND ended_at IS NULL').all(engagementId, userId, role)) end(ctx, m.id, reason);
  }

  // ACC-006: time-bound access is removed automatically at expiry.
  function expire() {
    const today = todayIn(settings.tz());
    const due = db.prepare('SELECT id FROM memberships WHERE ended_at IS NULL AND end_date IS NOT NULL AND end_date < ?').all(today);
    for (const m of due) end(null, m.id, 'Access period ended (ACC-006)');
    return `${due.length} expired`;
  }

  const usersWithRole = (engagementId, role) => list(engagementId).filter((m) => m.role === role).map((m) => m.user_id);
  const globalUsers = (role) => db.prepare("SELECT id, data FROM users WHERE active = 1 AND external = 0").all().filter((u) => (JSON.parse(u.data).roles || []).includes(role)).map((u) => u.id);

  // Client portal users linked to a client contact (CPT-003).
  function clientUsersForContact(contactId, engagementId) {
    if (!contactId) return [];
    return db.prepare("SELECT id, data FROM users WHERE active = 1 AND external = 1").all()
      .filter((u) => JSON.parse(u.data).contact_id === contactId)
      .map((u) => u.id)
      .filter((uid) => usersWithRole(engagementId, 'client').includes(uid));
  }
  const isClientApprover = (user, rec) => Boolean(user?.external && user.contact_id && user.contact_id === rec.client_approver_id);
  // Client users on the engagement whose contact record is an approver (CPT-003).
  const clientApprovers = (engagementId) => usersWithRole(engagementId, 'client').filter((uid) => {
    const contactId = app.auth.getUser(uid)?.contact_id;
    return contactId && app.repos.contact.get(contactId)?.is_approver;
  });

  // ACC-008: access review report per engagement.
  function accessReview(engagementId) {
    const today = todayIn(settings.tz());
    return list(engagementId, { includeEnded: true }).map((m) => {
      const u = app.auth.getUser(m.user_id);
      const lastLogin = u?.last_login || null;
      return {
        ...m, user_name: u?.name, email: u?.email, external: u?.external, active_user: u?.active, last_login: lastLogin,
        status: m.ended_at ? 'Ended' : m.end_date && m.end_date < today ? 'Expired' : m.start_date && m.start_date > today ? 'Future' : 'Active',
        flags: [
          !u?.active && !m.ended_at ? 'User account disabled' : null,
          m.end_date && !m.ended_at && m.end_date <= today ? 'Past end date' : null,
          !lastLogin && !m.ended_at ? 'Never signed in' : null,
          u?.external && !m.end_date && !m.ended_at ? 'External access with no end date' : null,
        ].filter(Boolean),
      };
    });
  }

  return { list, forUser, add, ensure, update, end, endRole, expire, usersWithRole, globalUsers, clientUsersForContact, isClientApprover, clientApprovers, accessReview };
}
