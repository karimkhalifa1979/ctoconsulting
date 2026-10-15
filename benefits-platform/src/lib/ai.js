// Client for the optional AI endpoints in server/index.mjs (GDA-03). Suggestions are always
// labelled and need a person to accept them; without a server key the app runs rules-only.
const BASE = import.meta.env.BASE_URL;

let status = null;
export async function aiStatus() {
  if (status) return status;
  if (import.meta.env.VITE_OFFLINE) return (status = { ai: false, offline: true });
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

export const aiNarrative = (payload) => post('narrative', payload);
export const aiSuggest = (payload) => post('suggest', payload);
