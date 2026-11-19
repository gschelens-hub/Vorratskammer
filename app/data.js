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
let actorId = null;
/** Who is signed in on this device; sent along with every change so the log shows a name. */
export function setActor(id) {
  actorId = id || null;
}
function sb() {
  if (client) return client;
  if (!(window.supabase && window.supabase.createClient)) {
    throw new DbError('Die Datenbank-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen und neu laden.');
  }
  // Every database request tells the server who is signed in on this device (for the change log).
  const withActor = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!actorId || !url.includes('/rest/v1/')) return fetch(input, init);
    const headers = new Headers(init.headers || (typeof input === 'string' ? undefined : input.headers));
    headers.set('x-552-member', actorId);
    return fetch(input, { ...init, headers });
  };
  client = window.supabase.createClient(SB_URL, SB_KEY, { global: { fetch: withActor } });
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

/**
 * Until update-v7.sql has been run, the columns for split days do not exist yet.
 * Whole-day entries are then saved without them; split days get a clear message.
 */
async function withoutNewColumn(column, row, save) {
  try {
    return await save(row);
  } catch (err) {
    if (!String(err.message).includes(column)) throw err;
    if (row[column]) throw new DbError('Geteilte Tage gehen erst nach dem Supabase-Update v7 (update-v7.sql).');
    const { [column]: _drop, ...rest } = row;
    return save(rest);
  }
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
    // dogs: tolerant, so the app still works before update-v5.sql has been run
    const dogsQuery = db.from('z552_dogs').select('*').eq('room_id', room).gte('date', from).lte('date', to)
      .then(({ data, error }) => (error ? [] : data || []));
    const [members, plans, overrides, guests, board, dogs] = await Promise.all([
      q(db.from('z552_members').select('*').eq('room_id', room).order('created_at')),
      q(db.from('z552_plans').select('*').eq('room_id', room).order('start_date')),
      q(db.from('z552_overrides').select('*').eq('room_id', room).gte('date', from).lte('date', to)),
      q(db.from('z552_guests').select('*').eq('room_id', room).gte('date', from).lte('date', to)),
      q(db.from('z552_board').select('*').eq('room_id', room).order('created_at')),
      dogsQuery,
    ]);
    return { members, plans, overrides, guests, board, dogs };
  },

  setOverride: (room, row) =>
    withoutNewColumn('status_pm', row, (r) =>
      q(sb().from('z552_overrides').upsert({ ...r, room_id: room, updated_at: new Date().toISOString() }, { onConflict: 'member_id,date' })),
    ),
  clearOverride: (room, memberId, date) =>
    q(sb().from('z552_overrides').delete().eq('room_id', room).eq('member_id', memberId).eq('date', date)),
  setGuest: (room, row) => q(sb().from('z552_guests').upsert({ ...row, room_id: room }, { onConflict: 'room_id,date,desk' })),
  clearGuest: (room, date, desk) => q(sb().from('z552_guests').delete().eq('room_id', room).eq('date', date).eq('desk', desk)),
  savePlan(room, plan) {
    const { id, ...row } = plan;
    return withoutNewColumn('half', row, (r) =>
      id ? q(sb().from('z552_plans').update(r).eq('id', id).eq('room_id', room)) : q(sb().from('z552_plans').insert({ ...r, room_id: room })),
    );
  },
  deletePlan: (room, id) => q(sb().from('z552_plans').delete().eq('id', id).eq('room_id', room)),
  addNote: (room, note) => q(sb().from('z552_board').insert({ ...note, room_id: room })),
  deleteNote: (room, id) => q(sb().from('z552_board').delete().eq('id', id).eq('room_id', room)),

  async getLog(room, since) {
    const { data, error } = await sb()
      .from('z552_log')
      .select('*')
      .eq('room_id', room)
      .gte('at', since)
      .order('at', { ascending: false })
      .limit(3000);
    if (error) throw new DbError('Das Logbuch ist noch nicht eingerichtet (update-v6.sql in Supabase ausführen).');
    return data || [];
  },
  setDog(room, date, dog) {
    if (!dog) return q(sb().from('z552_dogs').delete().eq('room_id', room).eq('date', date));
    return q(sb().from('z552_dogs').upsert({ room_id: room, date, dog, updated_at: new Date().toISOString() }, { onConflict: 'room_id,date' }));
  },
  async getConfig(room) {
    const rows = await q(sb().from('z552_roomconfig').select('config').eq('room_id', room).limit(1));
    return rows[0]?.config || null;
  },
  saveConfig: (room, config) =>
    q(sb().from('z552_roomconfig').upsert({ room_id: room, config, updated_at: new Date().toISOString() }, { onConflict: 'room_id' })),
  /** Uploads a Störer image/GIF to the shared "stoerer" bucket (folder 552/). */
  async uploadImage(room, which, file) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `552/${which}_${room}_${Date.now()}.${ext}`;
    const { error } = await sb().storage.from('stoerer').upload(path, file, { upsert: true, contentType: file.type || 'image/*' });
    if (error) throw new DbError(error.message || 'Upload fehlgeschlagen');
    const { data } = sb().storage.from('stoerer').getPublicUrl(path);
    return { url: data.publicUrl, path };
  },
  removeImage(path) {
    if (path) sb().storage.from('stoerer').remove([path]).catch(() => {});
  },

  /** Live updates: calls onChange whenever something in this room changes. Returns an unsubscribe function. */
  subscribe(room, onChange) {
    const db = sb();
    const ch = db.channel('z552:' + room);
    for (const table of ['z552_members', 'z552_plans', 'z552_overrides', 'z552_guests', 'z552_board', 'z552_roomconfig', 'z552_dogs']) {
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
// Demo change log: compares the store before and after each change, like the database trigger does.
const DEMO_KEYS = {
  z552_members: ['members', (x) => x.id],
  z552_plans: ['plans', (x) => x.id],
  z552_overrides: ['overrides', (x) => x.member_id + x.date],
  z552_guests: ['guests', (x) => x.room_id + x.date + x.desk],
  z552_board: ['board', (x) => x.id],
  z552_dogs: ['dogs', (x) => x.room_id + x.date],
};
function demoMutate(fn) {
  const d = demoDb();
  const before = JSON.parse(JSON.stringify(d));
  fn(d);
  const at = new Date().toISOString();
  const actor = d.members.find((m) => m.id === actorId);
  const log = (d.log = d.log || []);
  const add = (tbl, op, o, n) =>
    log.push({ id: log.length + 1, room_id: (n || o).room_id, at, actor_id: actorId, actor_name: actor?.name || null, tbl, op, old_row: o || null, new_row: n || null });
  for (const [tbl, [key, id]] of Object.entries(DEMO_KEYS)) {
    const a = new Map((before[key] || []).map((x) => [id(x), x]));
    const b = new Map((d[key] || []).map((x) => [id(x), x]));
    for (const [k, n] of b) {
      const o = a.get(k);
      if (!o) add(tbl, 'INSERT', null, n);
      else if (JSON.stringify({ ...o, last_seen: 0, updated_at: 0 }) !== JSON.stringify({ ...n, last_seen: 0, updated_at: 0 })) add(tbl, 'UPDATE', o, n);
    }
    for (const [k, o] of a) if (!b.has(k)) add(tbl, 'DELETE', o, null);
  }
  for (const room of Object.keys(d.config || {})) {
    const o = before.config?.[room];
    const n = d.config[room];
    if (JSON.stringify(o) !== JSON.stringify(n)) add('z552_roomconfig', o ? 'UPDATE' : 'INSERT', o ? { room_id: room, config: o } : null, { room_id: room, config: n });
  }
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  d.log = log.filter((e) => e.at >= cutoff);
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
    { id: uid(), room_id: code, title: 'Toner fast leer', text: 'Der Drucker im Flur meldet „Toner niedrig“. Ich bestelle bis Mittwoch nach – falls jemand vorher druckt: Ersatzkartusche liegt im Schrank unten links.', color: 'yellow', author_id: m, author_name: 'Marc', created_at: now },
    { id: uid(), room_id: code, title: 'Pflanzen gießen', text: 'Montag und Donnerstag, jeweils eine Kanne. Die Orchidee nur einmal pro Woche.', color: 'green', author_id: j, author_name: 'Julia', created_at: now },
    { id: uid(), room_id: code, title: 'Weihnachtsfeier 12.12.', text: 'Bitte bis Freitag eintragen, wer kommt und ob vegetarisch.', color: 'pink', author_id: l, author_name: 'Luca', created_at: now },
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
      dogs: (d.dogs || []).filter(inRange),
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
  setDog: async (room, date, dog) =>
    demoMutate((d) => {
      d.dogs = (d.dogs || []).filter((x) => !(x.room_id === room && x.date === date));
      if (dog) d.dogs.push({ room_id: room, date, dog });
    }),
  getConfig: async (room) => demoDb().config?.[room] || null,
  getLog: async (room, since) =>
    (demoDb().log || [])
      .filter((e) => e.room_id === room && e.at >= since)
      .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id),
  saveConfig: async (room, config) =>
    demoMutate((d) => {
      d.config = d.config || {};
      d.config[room] = config;
    }),
  uploadImage: (room, which, file) =>
    new Promise((resolve, reject) => {
      if (file.size > 2 * 1024 * 1024) return reject(new DbError('Im Demo-Modus max. 2 MB'));
      const r = new FileReader();
      r.onload = () => resolve({ url: r.result, path: '' });
      r.onerror = () => reject(new DbError('Datei nicht lesbar'));
      r.readAsDataURL(file);
    }),
  removeImage() {},
  subscribe(room, onChange) {
    const l = () => onChange('demo');
    demoListeners.add(l);
    return () => demoListeners.delete(l);
  },
};

export const db = isDemo ? demo : live;
