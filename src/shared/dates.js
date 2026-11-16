// Date helpers working on plain "YYYY-MM-DD" strings (no time zones involved).

export function toISO(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** 0 = Monday … 6 = Sunday */
export function weekday(iso) {
  return (fromISO(iso).getUTCDay() + 6) % 7;
}

export function mondayOf(iso) {
  return addDays(iso, -weekday(iso));
}

export function diffDays(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / 86400000);
}

export function isoWeek(iso) {
  const thursday = addDays(iso, 3 - weekday(iso));
  const jan4 = `${thursday.slice(0, 4)}-01-04`;
  return 1 + Math.round(diffDays(mondayOf(jan4), mondayOf(thursday)) / 7);
}

/** Today's date in Berlin as ISO string. */
export function todayBerlin(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(now);
}

export function berlinHour(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).format(now),
  );
}

export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function formatShort(iso) {
  const d = fromISO(iso);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
}
