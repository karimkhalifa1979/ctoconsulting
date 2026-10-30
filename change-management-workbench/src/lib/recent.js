// Recently viewed initiatives and records for the Home screen (Section 5.4). Kept per person in this
// browser only, limited to the last 15, and cleared on sign-out.
const PREFIX = 'cmw.recent.';
const LIMIT = 15;

export function recentItems(userId) {
  if (!userId) return [];
  try { return JSON.parse(localStorage.getItem(PREFIX + userId) || '[]'); } catch { return []; }
}

export function rememberRecent(userId, item) {
  if (!userId || !item?.id || !item?.type) return;
  try {
    const list = recentItems(userId).filter((x) => !(x.type === item.type && x.id === item.id));
    list.unshift({ type: item.type, id: item.id, code: item.code || '', title: String(item.title || '').slice(0, 140), initiativeId: item.initiativeId || null, at: new Date().toISOString() });
    localStorage.setItem(PREFIX + userId, JSON.stringify(list.slice(0, LIMIT)));
  } catch { /* storage unavailable */ }
}

export function clearRecent() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k); } catch { /* storage unavailable */ }
}
