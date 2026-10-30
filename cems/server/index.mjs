// CEMS server entry point: serves the web client and the API, seeds demo data on first run and
// starts the job scheduler.
import http from 'node:http';
import { createApp } from './app.mjs';
import { seedIfEmpty } from './seed/seed.mjs';

const app = createApp();
if (app.config.seedOnEmpty) await seedIfEmpty(app);
if (app.config.jobs) app.jobs.start();

http.createServer((req, res) => { app.handle(req, res); }).listen(app.config.port, () => {
  console.log(`CTO Consulting CEMS on ${app.config.baseUrl} (env ${app.config.env}, sign-in ${app.config.authMode}${app.config.oidc.enabled ? ' + Entra ID' : ''})`);
});
