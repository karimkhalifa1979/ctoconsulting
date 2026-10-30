// npm run seed [-- --reset] [-- --no-pdf]: loads the demo data into the configured database.
import fs from 'node:fs';
import { createApp } from '../app.mjs';
import { loadConfig } from '../config.mjs';
import { seed } from './seed.mjs';

const args = new Set(process.argv.slice(2));
const config = loadConfig();
if (args.has('--reset')) {
  for (const f of [config.dbPath, `${config.dbPath}-wal`, `${config.dbPath}-shm`]) fs.rmSync(f, { force: true });
  fs.rmSync(config.filesDir, { recursive: true, force: true });
}
const app = createApp();
if (app.db.prepare('SELECT COUNT(*) n FROM users').get().n) {
  console.error('The database already has data. Run with --reset to replace it with the demo data.');
  process.exit(1);
}
await seed(app, { pdf: !args.has('--no-pdf') });
process.exit(0);
