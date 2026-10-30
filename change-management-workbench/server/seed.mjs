// Loads the demonstration data set (shared/seed/demo.js) into the server database.
//   npm run seed              load into an empty database
//   npm run seed -- --reset   delete the database first
// Every demonstration account uses the password Demo-Workbench-2026.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.mjs';
import { createService } from '../shared/service/index.js';
import { hashPassword } from './auth.mjs';
import { seedDemo } from '../shared/seed/demo.js';

export { seedDemo };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const file = process.env.CMW_DB || path.join(root, 'data', 'cmw.db');
  if (process.argv.includes('--reset')) for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
  const driver = openDatabase(file);
  if (!driver.isEmpty()) {
    console.error(`${file} already holds data. Run "npm run seed -- --reset" to replace it with the demonstration data set.`);
    process.exit(1);
  }
  const service = createService({ driver, env: { mode: 'server' } });
  const t0 = Date.now();
  const { counts, users } = await seedDemo(service, { setPassword: (id, pw) => driver.credentials.set(id, hashPassword(pw)) });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`Loaded ${total} demonstration records into ${file} in ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
  console.log('Sign in with any of these accounts (password Demo-Workbench-2026):');
  for (const u of Object.values(users)) console.log(`  ${u.email.padEnd(42)} ${u.demoTitle || ''}`);
  driver.close();
}
