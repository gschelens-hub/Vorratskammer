// API client. Talks to the Worker (/api/*) or, in demo mode (?demo), to a local in-browser store.
import { addDays, mondayOf, todayBerlin } from './shared/dates.js';

const LS = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  },
};
export { LS };

export const isDemo = new URLSearchParams(location.search).has('demo') || LS.get('552.demo') === '1';
if (new URLSearchParams(location.search).has('demo')) LS.set('552.demo', '1');

export class AuthError extends Error {}

async function http(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Room-Pin': LS.get('552.pin', '') },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new AuthError(data.error || 'PIN falsch');
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

// ---------- demo store ----------
function demoLoad() {
  try {
    const raw = LS.get('552.demoData');
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const today = todayBerlin();
  const mon = mondayOf(today);
  const data = {
    plans: [
      { id: uid(), person: 'luca', kind: 'recurring', status: 'mobile', note: 'Homeoffice', start_date: addDays(mon, -28), end_date: null, repeat: 'weekly', weekday: 4, interval: 1, nth: null, created_at: '2026-01-01' },
      { id: uid(), person: 'marc', kind: 'absence', status: 'away', note: 'Urlaub', start_date: addDays(mon, 9), end_date: addDays(mon, 11), repeat: null, weekday: null, interval: 1, nth: null, created_at: '2026-01-02' },
      { id: uid(), person: 'julia', kind: 'recurring', status: 'away', note: 'Fortbildung', start_date: addDays(mon, -14), end_date: null, repeat: 'monthly_nth', weekday: 2, interval: 1, nth: 2, created_at: '2026-01-03' },
    ],
    overrides: [
      { person: 'julia', date: mon, status: 'office', note: 'ab 10 Uhr da' },
      { person: 'marc', date: mon, status: 'office', note: null },
      { person: 'luca', date: mon, status: 'mobile', note: 'Kundentermin' },
      { person: 'julia', date: addDays(mon, 1), status: 'office', note: null },
      { person: 'marc', date: addDays(mon, 1), status: 'office', note: null },
      { person: 'luca', date: addDays(mon, 1), status: 'office', note: null },
    ],
    guests: [{ date: addDays(mon, 4), desk: 'luca', guest_name: 'Praktikantin Mia', booked_by: 'Julia' }],
    board: [
      { id: uid(), text: 'Drucker: Toner fast leer', author: 'Marc', color: 'yellow', created_at: '2026-01-01' },
      { id: uid(), text: 'Pflanzen gießen nicht vergessen', author: 'Julia', color: 'green', created_at: '2026-01-02' },
    ],
  };
  demoSave(data);
  return data;
}
function demoSave(data) {
  LS.set('552.demoData', JSON.stringify(data));
}
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
}

const demo = {
  async data(from, to) {
    const d = demoLoad();
    const inRange = (x) => x.date >= from && x.date <= to;
    return { plans: d.plans, overrides: d.overrides.filter(inRange), guests: d.guests.filter(inRange), board: d.board, today: todayBerlin() };
  },
  async setOverride(row) {
    const d = demoLoad();
    d.overrides = d.overrides.filter((o) => !(o.person === row.person && o.date === row.date));
    d.overrides.push(row);
    demoSave(d);
  },
  async clearOverride(person, date) {
    const d = demoLoad();
    d.overrides = d.overrides.filter((o) => !(o.person === person && o.date === date));
    demoSave(d);
  },
  async setGuest(row) {
    const d = demoLoad();
    d.guests = d.guests.filter((g) => !(g.date === row.date && g.desk === row.desk));
    d.guests.push(row);
    demoSave(d);
  },
  async clearGuest(date, desk) {
    const d = demoLoad();
    d.guests = d.guests.filter((g) => !(g.date === date && g.desk === desk));
    demoSave(d);
  },
  async savePlan(plan) {
    const d = demoLoad();
    if (plan.id) d.plans = d.plans.map((p) => (p.id === plan.id ? { ...p, ...plan } : p));
    else d.plans.push({ ...plan, id: uid(), created_at: new Date().toISOString() });
    demoSave(d);
  },
  async deletePlan(id) {
    const d = demoLoad();
    d.plans = d.plans.filter((p) => p.id !== id);
    demoSave(d);
  },
  async addNote(note) {
    const d = demoLoad();
    d.board.push({ ...note, id: uid(), created_at: new Date().toISOString() });
    demoSave(d);
  },
  async deleteNote(id) {
    const d = demoLoad();
    d.board = d.board.filter((n) => n.id !== id);
    demoSave(d);
  },
};

const live = {
  data: (from, to) => http('GET', `/data?from=${from}&to=${to}`),
  setOverride: (row) => http('PUT', '/override', row),
  clearOverride: (person, date) => http('DELETE', '/override', { person, date }),
  setGuest: (row) => http('PUT', '/guest', row),
  clearGuest: (date, desk) => http('DELETE', '/guest', { date, desk }),
  savePlan: (plan) => (plan.id ? http('PUT', `/plans/${plan.id}`, plan) : http('POST', '/plans', plan)),
  deletePlan: (id) => http('DELETE', `/plans/${id}`),
  addNote: (note) => http('POST', '/board', note),
  deleteNote: (id) => http('DELETE', `/board/${id}`),
  pushKey: () => http('GET', '/push/key'),
  pushSubscribe: (person, subscription) => http('POST', '/push/subscribe', { person, subscription }),
  pushUnsubscribe: (endpoint) => http('DELETE', '/push/subscribe', { endpoint }),
  pushTest: (endpoint) => http('POST', '/push/test', { endpoint }),
};

export const api = isDemo ? demo : live;
