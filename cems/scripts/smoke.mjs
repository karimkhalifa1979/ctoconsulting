// Smoke check of a running CEMS instance after deployment: the API answers, the web client is
// served and, in demo mode, every persona can sign in and load their home page.
// Usage: npm run smoke [-- https://cems.example.com]   (default http://localhost:8090)
const base = (process.argv[2] || process.env.CEMS_URL || 'http://localhost:8090').replace(/\/$/, '');
let failed = 0;
const check = async (label, fn) => {
  try {
    const detail = await fn();
    console.log(`ok    ${label}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${label} — ${e.message}`);
  }
};
const expectOk = async (res, what) => {
  if (!res.ok) throw new Error(`${what} returned ${res.status}`);
  return res;
};

let config = null;
await check('API answers', async () => {
  config = await (await expectOk(await fetch(`${base}/api/auth/config`), '/api/auth/config')).json();
  return `sign-in ${config.mode}${config.oidc ? ' with Entra ID' : ''}, environment ${config.env}`;
});
await check('web client is served', async () => {
  const html = await (await expectOk(await fetch(`${base}/`), '/')).text();
  if (!html.includes('<div id="root">')) throw new Error('index.html without the application root');
  const csp = (await fetch(`${base}/`)).headers.get('content-security-policy') || '';
  if (!csp.includes("script-src 'self'")) throw new Error('content security policy missing');
});
await check('API description is protected', async () => {
  const res = await fetch(`${base}/api/openapi.json`);
  if (res.status !== 401) throw new Error(`expected 401 without a session, got ${res.status}`);
});

for (const p of config?.personas || []) {
  await check(`sign in as ${p.name} (${p.title})`, async () => {
    const res = await expectOk(await fetch(`${base}/api/auth/demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: p.id }) }), 'demo sign-in');
    const cookie = res.headers.get('set-cookie').split(';')[0];
    const me = await (await expectOk(await fetch(`${base}/api/me`, { headers: { cookie } }), '/api/me')).json();
    const home = p.external ? '/api/portal' : '/api/dash/my-work';
    await expectOk(await fetch(`${base}${home}`, { headers: { cookie } }), home);
    if (!p.external) await expectOk(await fetch(`${base}/api/openapi.json`, { headers: { cookie } }), '/api/openapi.json');
    return `${Object.keys(me.access || {}).length} engagements visible`;
  });
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
