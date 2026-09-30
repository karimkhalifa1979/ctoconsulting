// PDF and PDF/A rendering runs on the server (LibreOffice), so pages are counted on the real render (WD-08, 9.3).
import { platformInfo } from './ai.js';

const BASE = import.meta.env.BASE_URL;

export async function pdfAvailable() {
  return (await platformInfo()).pdf;
}

export async function renderPdf(bytes, { pdfa = false, name = 'document.docx' } = {}) {
  const r = await fetch(`${BASE}api/p/render?format=${pdfa ? 'pdfa' : 'pdf'}`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name) },
    body: bytes,
  });
  if (!r.ok) {
    let msg = `PDF rendering failed (${r.status}).`;
    try { msg = (await r.json()).error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return {
    bytes: new Uint8Array(await r.arrayBuffer()),
    pages: Number(r.headers.get('X-Page-Count')) || null,
    bodyPages: Number(r.headers.get('X-Body-Pages')) || null,
  };
}
