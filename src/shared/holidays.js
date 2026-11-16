// Public holidays in Berlin and bridge days (Brückentage).
import { addDays, toISO, weekday } from './dates.js';

function easterSunday(year) {
  // Anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toISO(new Date(Date.UTC(year, month - 1, day)));
}

const cache = new Map();

/** Map ISO date -> holiday name for Berlin in the given year. */
export function holidaysBerlin(year) {
  if (cache.has(year)) return cache.get(year);
  const easter = easterSunday(year);
  const list = {
    [`${year}-01-01`]: 'Neujahr',
    [`${year}-03-08`]: 'Frauentag',
    [addDays(easter, -2)]: 'Karfreitag',
    [addDays(easter, 1)]: 'Ostermontag',
    [`${year}-05-01`]: 'Tag der Arbeit',
    [addDays(easter, 39)]: 'Christi Himmelfahrt',
    [addDays(easter, 50)]: 'Pfingstmontag',
    [`${year}-10-03`]: 'Tag der Deutschen Einheit',
    [`${year}-12-25`]: '1. Weihnachtstag',
    [`${year}-12-26`]: '2. Weihnachtstag',
  };
  cache.set(year, list);
  return list;
}

export function holidayName(iso) {
  return holidaysBerlin(Number(iso.slice(0, 4)))[iso] || null;
}

function isOff(iso) {
  return weekday(iso) >= 5 || holidayName(iso) !== null;
}

/**
 * A bridge day is a working day squeezed between a holiday and the weekend
 * (or between two days off), e.g. the Friday after Ascension Day.
 */
export function isBridgeDay(iso) {
  if (isOff(iso)) return false;
  const prev = addDays(iso, -1);
  const next = addDays(iso, 1);
  if (!isOff(prev) || !isOff(next)) return false;
  // at least one neighbour must be a real holiday, not just a weekend
  return holidayName(prev) !== null || holidayName(next) !== null;
}
