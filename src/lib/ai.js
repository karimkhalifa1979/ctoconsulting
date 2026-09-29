// Client for the optional AI endpoints served by server/index.mjs.
// When the server has no API key (or the app is hosted statically), the tool
// falls back to its built-in rules engine.
const BASE = import.meta.env.BASE_URL;

let status = null;
export async function aiStatus() {
  if (status) return status;
  try {
    const r = await fetch(`${BASE}api/health`);
    status = r.ok ? await r.json() : { ai: false };
  } catch {
    status = { ai: false };
  }
  return status;
}

async function post(path, body) {
  const r = await fetch(`${BASE}api/ai/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || `AI request failed (${r.status})`);
  return json;
}

export const aiDiscover = (payload) => post('discover', payload);
export const aiPolicy = (payload) => post('policy', payload);
