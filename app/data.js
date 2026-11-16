// 552 – data layer. Supabase (anon key, room-scoped like the vacation app) or a local demo store (?demo).
import { SB_KEY, SB_URL } from './config.js';
import { addDays, DEFAULT_MEMBERS, mondayOf, todayBerlin } from './logic.js';

export const LS = {
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

const params = new URLSearchParams(location.search);
if (params.has('demo')) LS.set('552.demo', '1');
export const isDemo = LS.get('552.demo') === '1';

export const rnd = () => Math.random().toString(36).slice(2, 8);
export const newMemberId = () => 'm_' + rnd() + rnd();
const WORDS = ['BUERO', 'KAFFEE', 'PFLANZE', 'FENSTER', 'ZIMMER', 'DRUCKER', 'SCHREIBTISCH', 'TEAM'];
export const newRoomCode = () => `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${1000 + Math.floor(Math.random() * 9000)}`;

export class DbError extends Error {}

// ---------------- Supabase ----------------
let client = null;
function sb() {
  if (client) return client;
  if (!(window.supabase && window.supabase.createClient)) {
    throw new DbError('Die Datenbank-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen und neu laden.');
  }
  client = window.supabase.createClient(SB_URL, SB_KEY);
  return client;
}

async function q(promise) {
  const { data, error } = await promise;
  if (error) {
    console.error(error);
    throw new DbError(error.message || 'Datenbankfehler');
  }
  return data;
}

const live = {
  async findRoom(code) {
    const rows = await q(sb().from('z552_rooms').select('*').eq('code', code).limit(1));
    return rows[0] || null;
  },
  async createRoom(code, name) {
    await q(sb().from('z552_rooms').insert({ code, name }));
    const members = DEFAULT_MEMBERS.map((m) => ({ id: newMemberId(), room_id: code, name: m.name, desk: m.desk }));
    await q(sb().from('z552_members').insert(members));
    return { code, name };
  },
  members: (room) => q(sb().from('z552_members').select('*').eq('room_id', room).order('created_at')),
  addMember: (room, m) => q(sb().from('z552_members').insert({ ...m, room_id: room })),
  updateMember: (room, id, patch) => q(sb().from('z552_members').update(patch).eq('id', id).eq('room_id', room)),
  deleteMember: (room, id) => q(sb().from('z552_members').delete().eq('id', id).eq('room_id', room)),
  touch: (room, id) =>
    q(sb().from('z552_members').update({ last_seen: new Date().toISOString() }).eq('id', id).eq('room_id', room).select('id')),

  async load(room, from, to) {
    const db = sb();
    const [members, plans, overrides, guests, board] = await Promise.all([
      q(db.from('z552_members').select('*').eq('room_id', room).order('created_at')),
      q(db.from('z552_plans').select('*').eq('room_id', room).order('start_date')),
      q(db.from('z552_overrides').select('*').eq('room_id', room).gte('date', from).lte('date', to)),
      q(db.from('z552_guests').select('*').eq('room_id', room).gte('date', from).lte('date', to)),
      q(db.from('z552_board').select('*').eq('room_id', room).order('created_at')),
    ]);
    return { members, plans, overrides, guests, board };
  },

  setOverride: (room, row) =>
    q(sb().from('z552_overrides').upsert({ ...row, room_id: room, updated_at: new Date().toISOString() }, { onConflict: 'member_id,date' })),
  clearOverride: (room, memberId, date) =>
    q(sb().from('z552_overrides').delete().eq('room_id', room).eq('member_id', memberId).eq('date', date)),
  setGuest: (room, row) => q(sb().from('z552_guests').upsert({ ...row, room_id: room }, { onConflict: 'room_id,date,desk' })),
  clearGuest: (room, date, desk) => q(sb().from('z552_guests').delete().eq('room_id', room).eq('date', date).eq('desk', desk)),
  savePlan(room, plan) {
    const { id, ...row } = plan;
    if (id) return q(sb().from('z552_plans').update(row).eq('id', id).eq('room_id', room));
    return q(sb().from('z552_plans').insert({ ...row, room_id: room }));
  },
  deletePlan: (room, id) => q(sb().from('z552_plans').delete().eq('id', id).eq('room_id', room)),
  addNote: (room, note) => q(sb().from('z552_board').insert({ ...note, room_id: room })),
  deleteNote: (room, id) => q(sb().from('z552_board').delete().eq('id', id).eq('room_id', room)),

  /** Live updates: calls onChange whenever something in this room changes. Returns an unsubscribe function. */
  subscribe(room, onChange) {
    const db = sb();
    const ch = db.channel('z552:' + room);
    for (const table of ['z552_members', 'z552_plans', 'z552_overrides', 'z552_guests', 'z552_board']) {
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `room_id=eq.${room}` }, () => onChange(table));
      ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `room_id=eq.${room}` }, () => onChange(table));
      // Supabase cannot filter DELETE events, so listen to all and simply reload.
      ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, () => onChange(table));
    }
    ch.subscribe();
    return () => db.removeChannel(ch);
  },
};

// ---------------- Demo (local only) ----------------
function demoDb() {
  try {
    const raw = LS.get('552.demoDb');
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { rooms: {}, members: [], plans: [], overrides: [], guests: [], board: [] };
}
function demoSave(d) {
  LS.set('552.demoDb', JSON.stringify(d));
}
function demoMutate(fn) {
  const d = demoDb();
  fn(d);
  demoSave(d);
  demoListeners.forEach((l) => l());
}
const demoListeners = new Set();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : rnd() + rnd() + rnd());

function demoSeed(d, code, members) {
  const mon = mondayOf(todayBerlin());
  const [j, m, l] = members.map((x) => x.id);
  const now = new Date().toISOString();
  d.plans.push(
    { id: uid(), room_id: code, member_id: l, kind: 'recurring', status: 'mobile', note: 'Homeoffice', start_date: addDays(mon, -28), end_date: null, repeat: 'weekly', weekday: 4, interval: 1, nth: null, created_at: now },
    { id: uid(), room_id: code, member_id: m, kind: 'absence', status: 'away', note: 'Urlaub', start_date: addDays(mon, 9), end_date: addDays(mon, 11), repeat: null, weekday: null, interval: 1, nth: null, created_at: now },
  );
  d.overrides.push(
    { room_id: code, member_id: j, date: mon, status: 'office', note: 'ab 10 Uhr da' },
    { room_id: code, member_id: m, date: mon, status: 'office', note: null },
    { room_id: code, member_id: l, date: mon, status: 'mobile', note: 'Kundentermin' },
    { room_id: code, member_id: j, date: addDays(mon, 1), status: 'office', note: null },
    { room_id: code, member_id: m, date: addDays(mon, 1), status: 'office', note: null },
    { room_id: code, member_id: l, date: addDays(mon, 1), status: 'office', note: null },
  );
  d.guests.push({ room_id: code, date: addDays(mon, 4), desk: 'bottom_right', guest_name: 'Praktikantin Mia', booked_by: 'Julia' });
  d.board.push(
    { id: uid(), room_id: code, text: 'Drucker: Toner fast leer', color: 'yellow', author_id: m, author_name: 'Marc', created_at: now },
    { id: uid(), room_id: code, text: 'Pflanzen gießen nicht vergessen', color: 'green', author_id: j, author_name: 'Julia', created_at: now },
  );
}

const demo = {
  async findRoom(code) {
    return demoDb().rooms[code] || null;
  },
  async createRoom(code, name) {
    demoMutate((d) => {
      d.rooms[code] = { code, name };
      const members = DEFAULT_MEMBERS.map((m, i) => ({ id: newMemberId(), room_id: code, name: m.name, desk: m.desk, created_at: `2026-01-0${i + 1}` }));
      d.members.push(...members);
      demoSeed(d, code, members);
    });
    return { code, name };
  },
  members: async (room) => demoDb().members.filter((m) => m.room_id === room),
  addMember: async (room, m) => demoMutate((d) => d.members.push({ ...m, room_id: room, created_at: new Date().toISOString() })),
  updateMember: async (room, id, patch) =>
    demoMutate((d) => (d.members = d.members.map((m) => (m.id === id && m.room_id === room ? { ...m, ...patch } : m)))),
  deleteMember: async (room, id) =>
    demoMutate((d) => {
      d.members = d.members.filter((m) => m.id !== id);
      d.plans = d.plans.filter((p) => p.member_id !== id);
      d.overrides = d.overrides.filter((o) => o.member_id !== id);
    }),
  touch: async (room, id) => demoDb().members.filter((m) => m.id === id && m.room_id === room),
  async load(room, from, to) {
    const d = demoDb();
    const r = (x) => x.room_id === room;
    const inRange = (x) => r(x) && x.date >= from && x.date <= to;
    return {
      members: d.members.filter(r),
      plans: d.plans.filter(r),
      overrides: d.overrides.filter(inRange),
      guests: d.guests.filter(inRange),
      board: d.board.filter(r),
    };
  },
  setOverride: async (room, row) =>
    demoMutate((d) => {
      d.overrides = d.overrides.filter((o) => !(o.member_id === row.member_id && o.date === row.date));
      d.overrides.push({ ...row, room_id: room });
    }),
  clearOverride: async (room, memberId, date) =>
    demoMutate((d) => (d.overrides = d.overrides.filter((o) => !(o.member_id === memberId && o.date === date)))),
  setGuest: async (room, row) =>
    demoMutate((d) => {
      d.guests = d.guests.filter((g) => !(g.room_id === room && g.date === row.date && g.desk === row.desk));
      d.guests.push({ ...row, room_id: room });
    }),
  clearGuest: async (room, date, desk) =>
    demoMutate((d) => (d.guests = d.guests.filter((g) => !(g.room_id === room && g.date === date && g.desk === desk)))),
  savePlan: async (room, plan) =>
    demoMutate((d) => {
      if (plan.id) d.plans = d.plans.map((p) => (p.id === plan.id ? { ...p, ...plan } : p));
      else d.plans.push({ ...plan, id: uid(), room_id: room, created_at: new Date().toISOString() });
    }),
  deletePlan: async (room, id) => demoMutate((d) => (d.plans = d.plans.filter((p) => p.id !== id))),
  addNote: async (room, note) =>
    demoMutate((d) => d.board.push({ ...note, id: uid(), room_id: room, created_at: new Date().toISOString() })),
  deleteNote: async (room, id) => demoMutate((d) => (d.board = d.board.filter((n) => n.id !== id))),
  subscribe(room, onChange) {
    const l = () => onChange('demo');
    demoListeners.add(l);
    return () => demoListeners.delete(l);
  },
};

export const db = isDemo ? demo : live;
