// PDF rendering through LibreOffice in an isolated, serialised worker (RPT-032, NFR-008):
// tagged PDF output for accessibility; HTML preview through mammoth.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import mammoth from 'mammoth';

let queue = Promise.resolve();
let available = null;

export function sofficeAvailable(bin = 'soffice') {
  if (available !== null) return Promise.resolve(available);
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 20_000 }, (err, out) => {
      available = !err && /LibreOffice/i.test(String(out));
      resolve(available);
    });
  });
}

// Converts a .docx buffer to a tagged PDF buffer; conversions run one at a time.
export function docxToPdf(buffer, { bin = 'soffice', timeoutMs = 120_000 } = {}) {
  const job = queue.then(() => new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cems-pdf-'));
    const input = path.join(dir, 'report.docx');
    fs.writeFileSync(input, buffer);
    const profile = `file://${path.join(dir, 'profile')}`;
    const filter = 'pdf:writer_pdf_Export:{"UseTaggedPDF":{"type":"boolean","value":"true"},"ExportBookmarks":{"type":"boolean","value":"true"}}';
    execFile(bin, [`-env:UserInstallation=${profile}`, '--headless', '--norestore', '--convert-to', filter, '--outdir', dir, input], { timeout: timeoutMs }, (err) => {
      const out = path.join(dir, 'report.pdf');
      try {
        if (err || !fs.existsSync(out)) reject(new Error(`PDF conversion failed${err ? `: ${err.message}` : ''}`));
        else resolve(fs.readFileSync(out));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }));
  queue = job.catch(() => {});
  return job;
}

export async function docxToHtml(buffer) {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const res = await mammoth.convertToHtml({ buffer, arrayBuffer }, {
    styleMap: ['p[style-name=\'Title\'] => h1.doc-title:fresh', 'p[style-name=\'Heading 1\'] => h2:fresh', 'p[style-name=\'Heading 2\'] => h3:fresh', 'table => table.doc-table'],
  });
  return { html: res.value, messages: res.messages.slice(0, 20).map((m) => m.message) };
}
