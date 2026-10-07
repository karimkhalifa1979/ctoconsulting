import { CLOSED, daysUntil } from '../lib/proposal.js';

const TONE = { Draft: 'grey', 'In progress': 'blue', 'In review': 'gold', Submitted: 'navy', Shortlisted: 'teal', Won: 'green', Lost: 'red', Withdrawn: 'grey' };

export function StatusBadge({ status }) {
  if (!status) return null;
  return <span className={`badge tone-${TONE[status] || 'grey'}`}>{status}</span>;
}

// "in 5 days" / "today" / "3 days overdue" — only for proposals that are still open.
export function DueLabel({ date, status }) {
  const n = daysUntil(date);
  if (n == null || CLOSED.has(status) || status === 'Submitted' || status === 'Shortlisted') return null;
  if (n < 0) return <span className="due due-late">{-n} day{n === -1 ? '' : 's'} overdue</span>;
  if (n === 0) return <span className="due due-soon">due today</span>;
  return <span className={`due ${n <= 7 ? 'due-soon' : ''}`}>in {n} day{n === 1 ? '' : 's'}</span>;
}
