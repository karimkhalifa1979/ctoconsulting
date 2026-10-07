export function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export const fmtDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '');
export const fmtDateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '');

export function fmtAgo(iso) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDate(iso);
}

export const TYPE_GROUPS = [
  { id: 'word', label: 'Word', exts: ['doc', 'docx', 'docm', 'dotx', 'rtf'] },
  { id: 'pdf', label: 'PDF', exts: ['pdf'] },
  { id: 'ppt', label: 'PowerPoint', exts: ['ppt', 'pptx', 'pptm', 'potx'] },
  { id: 'excel', label: 'Excel', exts: ['xls', 'xlsx', 'xlsm', 'csv'] },
];
export function typeGroup(ext) {
  return TYPE_GROUPS.find((g) => g.exts.includes(ext))?.id || 'other';
}
