// Converts the source Policy Requirements Register workbook into JSON seed data
// served from public/data/. Run with: npm run seed
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { parseRegister, sheetsFromExcelJs } from '../src/lib/registerParser.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(root, 'data/source/NDIA_ICT_Policy_Requirements_Register_v0.48.xlsx');
const OUT = path.join(root, 'public/data/ndia');

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SOURCE);
const parsed = parseRegister(sheetsFromExcelJs(wb));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'sheets'), { recursive: true });
const write = (file, data) => fs.writeFileSync(path.join(OUT, file), JSON.stringify(data));

write('requirements.json', parsed.requirements);
write('obligations.json', parsed.obligations);
write('exemptions.json', parsed.exemptions);
write('pspf.json', parsed.pspf);
const index = parsed.sheets.map((s, i) => {
  const file = `sheets/${String(i).padStart(2, '0')}.json`;
  write(file, s);
  return { name: s.name, file, rows: s.rows.length, cols: s.headers.length, title: s.title };
});
write('sheets/index.json', index);
write('meta.json', {
  source: path.basename(SOURCE),
  generated: new Date().toISOString(),
  counts: {
    requirements: parsed.requirements.length,
    obligations: parsed.obligations.length,
    exemptions: parsed.exemptions.length,
    pspf: parsed.pspf.length,
    sheets: parsed.sheets.length,
  },
});
console.log('Seed data written to public/data/ndia', {
  requirements: parsed.requirements.length,
  obligations: parsed.obligations.length,
  exemptions: parsed.exemptions.length,
  pspf: parsed.pspf.length,
  sheets: parsed.sheets.length,
});
