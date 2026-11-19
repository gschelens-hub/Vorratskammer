// 552 – shared logic: dates, Berlin holidays, status resolution.
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

// Public holidays in Berlin (plus 24.12./31.12. as days off, like the vacation app) and bridge days.

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
    [`${year}-12-24`]: 'Heiligabend',
    [`${year}-12-25`]: '1. Weihnachtstag',
    [`${year}-12-26`]: '2. Weihnachtstag',
    [`${year}-12-31`]: 'Silvester',
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

// Resolves which status a person has on a given day.
// Priority (highest first): day override > absence/single plan > recurring plan > holiday > default.

export const STATUSES = {
  office: { label: 'Im Büro', color: '#2fa84f' },
  mobile: { label: 'Mobil', color: '#e8b923' },
  away: { label: 'Nicht da', color: '#d64541' },
  unknown: { label: 'Offen', color: '#8a8f98' },
  // extra status, only for selected members (default: Julia); desk is striped green/red
  kreditnext: { label: 'KreditNext', color: '#2fa84f', striped: true },
};

// Floor plan of the furniture, in the pixel units of the original drawing (design/buero-552.png).
// Only the desks with their chairs are drawn; PLAN is the visible section.
export const PLAN = { x: 1000, y: 330, w: 1180, h: 1020 };

const deskDef = (id, label, rect, chair, notePos) => {
  const [rx, ry, rw, rh] = rect;
  return {
    id,
    label,
    rect,
    chair, // [cx, cy] of the chair seat
    notePos, // where the note bubble goes (over the chair)
    x: +(((rx - PLAN.x) / PLAN.w) * 100).toFixed(2),
    y: +(((ry - PLAN.y) / PLAN.h) * 100).toFixed(2),
    w: +((rw / PLAN.w) * 100).toFixed(2),
    h: +((rh / PLAN.h) * 100).toFixed(2),
  };
};

export const DESKS = [
  deskDef('top', 'oben', [1619, 554, 511, 241], [1874, 452], 'above'),
  deskDef('bottom_left', 'unten links', [1049, 861, 511, 242], [1305, 1218], 'below'),
  deskDef('bottom_right', 'unten rechts', [1619, 861, 511, 242], [1874, 1218], 'below'),
];

// Members a new room starts with.
export const DEFAULT_MEMBERS = [
  { name: 'Julia', desk: 'top' },
  { name: 'Marc', desk: 'bottom_left' },
  { name: 'Luca', desk: 'bottom_right' },
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

/** Does a plan cover this half of the day? (plan.half: null = whole day, 'am' = morning, 'pm' = afternoon) */
const coversHalf = (plan, half) => !plan.half || plan.half === half;

/** The status the plans alone give for one half of the day ('am' or 'pm'). */
export function plannedHalf(personId, iso, plans, half) {
  const mine = plans.filter((p) => p.member_id === personId && coversHalf(p, half) && planMatches(p, iso));
  // half-specific entries beat whole-day ones of the same kind, otherwise the newest wins
  const order = (a, b) => (b.half ? 1 : 0) - (a.half ? 1 : 0) || String(b.created_at || '').localeCompare(String(a.created_at || ''));
  const fixed = mine.filter((p) => p.kind !== 'recurring').sort(order)[0];
  if (fixed) return { status: fixed.status, note: fixed.note || '', source: 'plan', plan: fixed };
  const rec = mine.filter((p) => p.kind === 'recurring').sort(order)[0];
  if (rec) return { status: rec.status, note: rec.note || '', source: 'turnus', plan: rec };
  const holiday = holidayName(iso);
  if (holiday) return { status: 'away', note: holiday, source: 'holiday' };
  return { status: 'unknown', note: '', source: 'default' };
}

/** The status the plans alone would give (no day override); status = morning, statusPm = afternoon. */
export function planned(personId, iso, plans) {
  const am = plannedHalf(personId, iso, plans, 'am');
  const pm = plannedHalf(personId, iso, plans, 'pm');
  const lead = am.source !== 'default' ? am : pm;
  return {
    status: am.status,
    statusPm: pm.status,
    split: am.status !== pm.status,
    note: am.note || pm.note,
    source: lead.source,
    plan: lead.plan,
  };
}

/**
 * Final status shown on the main page.
 * status = morning (or whole day), statusPm = afternoon, split = the two differ.
 * Override row: status = morning/whole day, status_pm = afternoon if different (null = like the morning).
 */
export function resolveDay(personId, iso, plans, overrides) {
  const base = planned(personId, iso, plans);
  const ov = overrides.find((o) => o.member_id === personId && o.date === iso);
  if (ov) {
    const am = ov.status || base.status;
    const pm = ov.status_pm || (ov.status ? ov.status : base.statusPm);
    return {
      status: am,
      statusPm: pm,
      split: am !== pm,
      note: ov.note ?? base.note,
      source: 'override',
      overridden: am !== base.status || pm !== base.statusPm,
      base,
    };
  }
  return { ...base, overridden: false, base };
}

/** Is the person in the office in at least one half of the day? */
export const inOffice = (info) => info.status === 'office' || info.statusPm === 'office';
/** Office share of the day: 0, 0.5 or 1. */
export const officeShare = (info) => (info.status === 'office' ? 0.5 : 0) + (info.statusPm === 'office' ? 0.5 : 0);
