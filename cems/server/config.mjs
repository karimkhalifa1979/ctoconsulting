// Environment configuration. Business configuration (thresholds, workflows, templates)
// lives in the database and is edited in the app (NFR-030); this file covers deployment settings.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bool = (v, d = false) => (v === undefined ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

export function loadConfig(overrides = {}) {
  const { env: envOverrides, ...settings } = overrides;
  const env = { ...process.env, ...envOverrides };
  const dataDir = overrides.dataDir || env.CEMS_DATA_DIR || path.join(ROOT, 'data');
  const cfg = {
    env: env.CEMS_ENV || (env.NODE_ENV === 'production' ? 'production' : 'development'), // NFR-028
    port: Number(env.PORT) || 8090,
    baseUrl: env.CEMS_BASE_URL || `http://localhost:${Number(env.PORT) || 8090}`,
    dataDir,
    dbPath: overrides.dbPath || env.CEMS_DB || path.join(dataDir, 'cems.db'),
    filesDir: path.join(dataDir, 'files'),
    distDir: path.join(ROOT, 'dist'),
    // demo: sign in as a seeded persona; oidc: Microsoft Entra ID single sign-on (INT-001)
    authMode: env.CEMS_AUTH_MODE || 'demo',
    cookieSecure: bool(env.CEMS_COOKIE_SECURE, (env.CEMS_BASE_URL || '').startsWith('https://')),
    oidc: {
      issuer: env.OIDC_ISSUER || '',
      clientId: env.OIDC_CLIENT_ID || '',
      clientSecret: env.OIDC_CLIENT_SECRET || '',
      redirectUri: env.OIDC_REDIRECT_URI || '',
      scopes: env.OIDC_SCOPES || 'openid profile email',
      requireMfa: bool(env.OIDC_REQUIRE_MFA, true),
      // JSON map of Entra group object IDs to Firm-wide roles, e.g. {"<guid>":"finance"}
      groupRoles: safeJson(env.OIDC_GROUP_ROLES, {}),
      autoProvision: bool(env.OIDC_AUTO_PROVISION, true),
    },
    scimToken: env.SCIM_TOKEN || '',
    integrationKey: env.CEMS_INTEGRATION_KEY || '',
    m365: {
      tenantId: env.M365_TENANT_ID || '',
      clientId: env.M365_CLIENT_ID || '',
      clientSecret: env.M365_CLIENT_SECRET || '',
      sender: env.M365_SENDER || '',
    },
    clamav: { host: env.CLAMAV_HOST || '', port: Number(env.CLAMAV_PORT) || 3310 },
    soffice: env.CEMS_SOFFICE || 'soffice',
    jobs: bool(env.CEMS_JOBS, true),
    seedOnEmpty: bool(env.CEMS_SEED, true),
    logLevel: env.CEMS_LOG || 'info',
    ...settings,
  };
  cfg.oidc.enabled = Boolean(cfg.oidc.issuer && cfg.oidc.clientId);
  cfg.m365.enabled = Boolean(cfg.m365.tenantId && cfg.m365.clientId && cfg.m365.clientSecret && cfg.m365.sender);
  return cfg;
}

function safeJson(s, d) {
  try { return s ? JSON.parse(s) : d; } catch { return d; }
}
