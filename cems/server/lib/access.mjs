// Engagement-scoped, role-based access (section 5, ACC-001..009, NFR-002), enforced in the
// service and data layers. One AccessContext is built per request.
import { DEFAULT_MATRIX, PORTFOLIO_ROLES, COST_ROLES, mergeGrants, readOnly, parseCell } from '../../shared/permissions.js';
import { todayIn } from '../../shared/dates.js';

const ACTIONS = ['C', 'R', 'U', 'A'];

export function createAccess(app) {
  const { db, settings } = app;
  const memStmt = db.prepare('SELECT * FROM memberships WHERE user_id = ? AND ended_at IS NULL');
  const engStmt = db.prepare("SELECT id, client_id, json_extract(data, '$.restricted') AS restricted, json_extract(data, '$.status') AS status, json_extract(data, '$.manager_id') AS manager_id, json_extract(data, '$.executive_id') AS executive_id FROM engagements WHERE deleted_at IS NULL");

  function contextFor(user) {
    const today = todayIn(settings.tz());
    const memberships = user ? memStmt.all(user.id).filter((m) => (!m.start_date || m.start_date <= today) && (!m.end_date || m.end_date >= today))
      .map((m) => ({ ...m, project_ids: m.project_ids ? JSON.parse(m.project_ids) : null, grants: m.grants ? JSON.parse(m.grants) : [] })) : [];
    const engagements = new Map(engStmt.all().map((e) => [e.id, { ...e, restricted: Boolean(e.restricted) }]));
    return new AccessContext({ user, memberships, engagements, matrix: settings.get('permissions') || DEFAULT_MATRIX });
  }

  return { contextFor };
}

export class AccessContext {
  constructor({ user, memberships, engagements, matrix }) {
    this.user = user;
    this.memberships = memberships;
    this.engagements = engagements;
    this.matrix = matrix;
    this.globalRoles = new Set(user?.roles || []);
    this.isExternal = Boolean(user?.external);
    this.isAdmin = this.globalRoles.has('sysadmin');
    this.byEng = new Map();
    for (const m of memberships) {
      if (!this.byEng.has(m.engagement_id)) this.byEng.set(m.engagement_id, []);
      this.byEng.get(m.engagement_id).push(m);
    }
    this.cache = new Map();
  }

  hasGlobal(role) { return !this.isExternal && this.globalRoles.has(role); }
  rolesOn(engId) { return (this.byEng.get(engId) || []).map((m) => m.role); }
  isMember(engId) { return this.byEng.has(engId); }
  hasRoleAnywhere(role) { return this.memberships.some((m) => m.role === role) || this.hasGlobal(role); }

  // ACC-002, ACC-004, ACC-005: whether the user may know the engagement exists.
  canSeeEngagement(engId) {
    const e = this.engagements.get(engId);
    if (!e) return false;
    if (this.isMember(engId)) return true;
    if (this.isExternal || e.restricted) return false;
    return PORTFOLIO_ROLES.some((r) => this.globalRoles.has(r)) || this.globalRoles.has('resource_manager');
  }

  visibleEngagementIds() {
    return [...this.engagements.keys()].filter((id) => this.canSeeEngagement(id));
  }

  // Effective grants on an engagement (optionally narrowed to one project).
  grants(engId, projectId = null) {
    const key = `${engId}|${projectId || ''}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const g = {};
    const e = this.engagements.get(engId);
    if (e && this.canSeeEngagement(engId)) {
      for (const m of this.byEng.get(engId) || []) {
        // A membership limited to some projects is read-only elsewhere in the engagement.
        const scoped = m.project_ids && m.project_ids.length && (!projectId || !m.project_ids.includes(projectId));
        for (const [fn, cells] of Object.entries(this.matrix)) {
          const cell = cells[m.role] || '';
          g[fn] = mergeGrants(g[fn] || {}, scoped ? readOnly(cell) : cell);
        }
      }
      if (!e.restricted && !this.isExternal) {
        for (const role of this.globalRoles) {
          for (const [fn, cells] of Object.entries(this.matrix)) {
            let cell = '';
            if (role === 'engagement_executive') cell = readOnly(cells.engagement_executive);
            else if (role === 'auditor') cell = readOnly(cells.auditor);
            else if (role === 'finance' || role === 'pmo') cell = cells[role] || '';
            else if (role === 'resource_manager') cell = ['resources', 'dashboards', 'setup'].includes(fn) ? cells.resource_manager || '' : '';
            if (cell) g[fn] = mergeGrants(g[fn] || {}, cell);
          }
        }
      }
    }
    this.cache.set(key, g);
    return g;
  }

  // can(engId, 'raid', 'U', { projectId, own, shared, issued })
  can(engId, fn, action, opts = {}) {
    if (!engId) return false;
    const g = this.grants(engId, opts.projectId)[fn];
    if (!g || !(action in g)) return false;
    const q = g[action];
    if (q === null) return true;
    if (q === 'own') return Boolean(opts.own);
    if (q === 'shared') return Boolean(opts.shared);
    if (q === 'issued') return Boolean(opts.issued);
    if (q === 'rates') return opts.costRates !== true;
    return false;
  }

  qualifier(engId, fn, action, projectId) {
    const g = this.grants(engId, projectId)[fn];
    return g && action in g ? g[action] : undefined;
  }

  // ACC-003: cost rates, salary-derived costs, margins and internal commercial notes.
  canSeeCosts(engId) {
    if (this.isExternal) return false;
    const e = this.engagements.get(engId);
    if (!e || !this.canSeeEngagement(engId)) return false;
    for (const m of this.byEng.get(engId) || []) if (COST_ROLES.includes(m.role) || (m.grants || []).includes('costs')) return true;
    return !e.restricted && (this.globalRoles.has('finance') || this.globalRoles.has('engagement_executive'));
  }

  // Firm-level (not engagement) permissions.
  canGlobal(what) {
    if (this.isExternal) return false;
    const g = this.globalRoles;
    switch (what) {
      case 'people.read': return true;
      case 'people.write': return g.has('resource_manager');
      case 'costrates.read': return g.has('finance') || g.has('engagement_executive') || this.hasRoleAnywhere('engagement_manager') || this.hasRoleAnywhere('engagement_executive');
      case 'costrates.write': return g.has('finance');
      case 'ratecards.read': return g.has('finance') || g.has('engagement_executive') || g.has('auditor') || ['engagement_manager', 'project_manager', 'resource_manager', 'engagement_executive', 'finance'].some((r) => this.hasRoleAnywhere(r));
      case 'ratecards.write': return g.has('finance');
      case 'clients.write': return g.has('finance') || g.has('engagement_executive') || this.hasRoleAnywhere('engagement_manager');
      case 'engagements.create': return g.has('engagement_executive') || this.hasRoleAnywhere('engagement_manager') || g.has('pmo');
      case 'templates.library': return g.has('pmo');
      case 'templates.read': return true;
      case 'config.delivery': return g.has('pmo');
      case 'admin.users': return g.has('sysadmin');
      case 'admin.system': return g.has('sysadmin');
      case 'audit.read': return g.has('auditor') || g.has('sysadmin') || g.has('pmo');
      case 'finance.periods': return g.has('finance');
      case 'finance.portfolio': return g.has('finance') || g.has('engagement_executive') || g.has('auditor');
      case 'portfolio': return PORTFOLIO_ROLES.some((r) => g.has(r)) || this.memberships.length > 0;
      case 'pmo': return g.has('pmo');
      case 'export.bulk': return g.has('pmo') || g.has('finance') || g.has('auditor') || this.hasRoleAnywhere('engagement_manager'); // NFR-010
      default: return false;
    }
  }

  // Engagement roles summary for the client UI.
  // Memberships limited to some projects add per-project grants under `projects`.
  summary() {
    const roles = {};
    const fnsOf = (g) => {
      const fns = {};
      for (const [fn, grants] of Object.entries(g)) {
        const acts = ACTIONS.filter((a) => a in grants).map((a) => (grants[a] ? `${a}:${grants[a]}` : a));
        if (acts.length) fns[fn] = acts;
      }
      return fns;
    };
    for (const id of this.visibleEngagementIds()) {
      const projects = {};
      for (const m of this.byEng.get(id) || []) for (const pid of m.project_ids || []) projects[pid] ||= fnsOf(this.grants(id, pid));
      roles[id] = { roles: this.rolesOn(id), costs: this.canSeeCosts(id), fns: fnsOf(this.grants(id)), projects };
    }
    return roles;
  }
}

export { parseCell };
