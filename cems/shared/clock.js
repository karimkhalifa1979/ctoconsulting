// Application clock. Business rules read the time from here so the demo seed can replay history
// with realistic dates (approvals, deadlines, late flags); in normal running it is the system clock.
let offsetMs = 0;

export const now = () => new Date(Date.now() + offsetMs);

// Sets the clock to an instant (Date, ISO string or epoch ms); null returns to the system clock.
export function setClock(instant) {
  offsetMs = instant == null ? 0 : new Date(instant).getTime() - Date.now();
}
