// Resolves which status a person has on a given day.
// Priority (highest first): day override > absence/single plan > recurring plan > holiday > default.
import { diffDays, fromISO, mondayOf, weekday } from './dates.js';
import { holidayName } from './holidays.js';

export const STATUSES = {
  office: { label: 'Im Büro', color: '#2fa84f' },
  mobile: { label: 'Mobil', color: '#e8b923' },
  away: { label: 'Nicht da', color: '#d64541' },
  unknown: { label: 'Offen', color: '#8a8f98' },
};

export const PERSONS = [
  { id: 'julia', name: 'Julia', desk: 'oben', x: 69.51, y: 29.52, w: 23.79, h: 16.02 },
  { id: 'marc', name: 'Marc', desk: 'unten links', x: 42.97, y: 49.93, w: 23.79, h: 16.09 },
  { id: 'luca', name: 'Luca', desk: 'unten rechts', x: 69.51, y: 49.93, w: 23.79, h: 16.09 },
];

function daysInMonth(iso) {
  const d = fromISO(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Does a recurring plan hit the given date? */
export function recurringMatches(plan, iso) {
  if (iso < plan.start_date) return false;
  if (plan.end_date && iso > plan.end_date) return false;
  if (weekday(iso) !== plan.weekday) return false;
  if (plan.repeat === 'monthly_nth') {
    const day = fromISO(iso).getUTCDate();
    if (plan.nth === -1) return day + 7 > daysInMonth(iso);
    return Math.ceil(day / 7) === plan.nth;
  }
  // weekly, every `interval` weeks counted from the start week
  const weeks = diffDays(mondayOf(plan.start_date), mondayOf(iso)) / 7;
  return weeks % Math.max(1, plan.interval || 1) === 0;
}

/** Does a plan apply on the given date? */
export function planMatches(plan, iso) {
  if (plan.kind === 'recurring') return recurringMatches(plan, iso);
  const end = plan.end_date || plan.start_date;
  return iso >= plan.start_date && iso <= end;
}

/** The status the plans alone would give (no day override). */
export function planned(personId, iso, plans) {
  const mine = plans.filter((p) => p.person === personId && planMatches(p, iso));
  const byNewest = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));
  const fixed = mine.filter((p) => p.kind !== 'recurring').sort(byNewest)[0];
  if (fixed) return { status: fixed.status, note: fixed.note || '', source: 'plan', plan: fixed };
  const rec = mine.filter((p) => p.kind === 'recurring').sort(byNewest)[0];
  if (rec) return { status: rec.status, note: rec.note || '', source: 'turnus', plan: rec };
  const holiday = holidayName(iso);
  if (holiday) return { status: 'away', note: holiday, source: 'holiday' };
  return { status: 'unknown', note: '', source: 'default' };
}

/** Final status shown on the main page. */
export function resolveDay(personId, iso, plans, overrides) {
  const base = planned(personId, iso, plans);
  const ov = overrides.find((o) => o.person === personId && o.date === iso);
  if (ov) {
    return {
      status: ov.status || base.status,
      note: ov.note ?? base.note,
      source: 'override',
      overridden: Boolean(ov.status) && ov.status !== base.status,
      base,
    };
  }
  return { ...base, overridden: false, base };
}
