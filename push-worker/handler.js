// 552 – Push-Zentrale (Cloudflare Worker).
// Sends: morning reminder (cron), new pinboard note, dog in the basket, manual messages from the developer menu.
// Build a single file for the Cloudflare dashboard with: ./scripts/make-push-worker.sh
import { formatShort, planned, todayBerlin, weekday, WEEKDAYS_LONG, holidayName } from '../app/logic.js';
import { sendPush } from './webpush.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const DOG_NAMES = { hazel: 'Hazel', koko: 'Koko' };
const STATUS_IDS = ['office', 'mobile', 'away', 'kreditnext'];
const PUSH_DEFAULT = { on: true, url: '', morning: true, morningTime: '08:30', notes: true, dogs: true };
const FRESH_MS = 5 * 60 * 1000; // only announce things created in the last 5 minutes

function sb(env) {
  const base = `${String(env.SUPABASE_URL).replace(/\/$/, '')}/rest/v1/`;
  const headers = { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, 'Content-Type': 'application/json' };
  const call = async (method, path, body, extra = {}) => {
    const res = await fetch(base + path, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]}: ${res.status} ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
  return {
    get: (path) => call('GET', path),
    upsert: (table, row, onConflict, extra) =>
      call('POST', `${table}?on_conflict=${onConflict}`, row, { Prefer: 'resolution=merge-duplicates', ...extra }),
    del: (path) => call('DELETE', path),
  };
}
const enc = encodeURIComponent;

async function roomConfig(db, room) {
  const rows = await db.get(`z552_roomconfig?room_id=eq.${enc(room)}&select=config`);
  const config = rows[0]?.config || {};
  return { config, push: { ...PUSH_DEFAULT, ...(config.push || {}) } };
}

function vapid(env) {
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || 'https://552.gschelens.workers.dev' };
}

/** Sends one message to the devices of a room. kind = 'morning' | 'notes' | 'dogs' | null (manual, ignores preferences). */
export async function sendToRoom(env, room, payload, { kind = null, exclude = null, only = null } = {}) {
  const db = sb(env);
  let subs = await db.get(`z552_push?room_id=eq.${enc(room)}&select=*`);
  subs = subs.filter((s) => (!kind || s.prefs?.[kind] !== false) && (!exclude || s.member_id !== exclude) && (!only || s.member_id === only));
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    try {
      const status = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, vapid(env));
      if (status === 404 || status === 410) {
        await db.del(`z552_push?endpoint=eq.${enc(s.endpoint)}`); // device unsubscribed
        failed++;
      } else if (status < 300) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}

function berlinHHMM(date) {
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
/** "08:47" -> "08:30": the half-hour slot a cron run belongs to. */
const slotOf = (hhmm) => `${hhmm.slice(0, 2)}:${Number(hhmm.slice(3, 5)) < 30 ? '00' : '30'}`;

/** Morning reminder for everyone who has nothing entered or planned for today. */
export async function morningRun(env, now = new Date()) {
  const db = sb(env);
  const today = todayBerlin(now);
  if (weekday(today) >= 5 || holidayName(today)) return { skipped: 'weekend/holiday' };
  const subs = await db.get('z552_push?select=room_id');
  const rooms = [...new Set(subs.map((s) => s.room_id))];
  const result = {};
  for (const room of rooms) {
    const { push } = await roomConfig(db, room);
    if (!push.on || !push.morning || slotOf(berlinHHMM(now)) !== push.morningTime) continue;
    const [members, plans, overrides] = await Promise.all([
      db.get(`z552_members?room_id=eq.${enc(room)}&select=id,name`),
      db.get(`z552_plans?room_id=eq.${enc(room)}&select=*`),
      db.get(`z552_overrides?room_id=eq.${enc(room)}&date=eq.${today}&select=*`),
    ]);
    let sent = 0;
    for (const m of members) {
      const ov = overrides.find((o) => o.member_id === m.id);
      if (ov && (ov.status || ov.status_pm)) continue; // already entered
      if (planned(m.id, today, plans).source !== 'default') continue; // planned (vacation, rota …)
      const r = await sendToRoom(
        env,
        room,
        { title: `552 · Guten Morgen, ${m.name}`, body: 'Bist du heute im Büro?', kind: 'morning', actions: true, answer: push.url, tag: `morning-${today}`, url: './' },
        { kind: 'morning', only: m.id },
      );
      sent += r.sent;
    }
    result[room] = sent;
  }
  return result;
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method === 'GET') return json({ ok: true, publicKey: env.VAPID_PUBLIC_KEY || null });
  if (request.method !== 'POST') return json({ error: 'Nicht erlaubt' }, 405);
  const body = await request.json().catch(() => ({}));
  const db = sb(env);
  const room = String(body.room || '');

  if (url.pathname.endsWith('/notify')) {
    const { push } = await roomConfig(db, room);
    if (!push.on) return json({ sent: 0, off: true });
    if (body.kind === 'note') {
      if (!push.notes) return json({ sent: 0, off: true });
      const [note] = await db.get(`z552_board?room_id=eq.${enc(room)}&order=created_at.desc&limit=1&select=*`);
      if (!note || Date.now() - Date.parse(note.created_at) > FRESH_MS) return json({ sent: 0, stale: true });
      const title = (note.title || note.text || '').trim().split('\n')[0].slice(0, 60);
      return json(
        await sendToRoom(env, room, { title: `📌 Neue Notiz${note.author_name ? ` von ${note.author_name}` : ''}`, body: title, kind: 'notes', tag: `note-${note.id}`, url: './' }, { kind: 'notes', exclude: body.actor }),
      );
    }
    if (body.kind === 'dog') {
      if (!push.dogs) return json({ sent: 0, off: true });
      const [row] = await db.get(`z552_dogs?room_id=eq.${enc(room)}&date=eq.${enc(String(body.date || ''))}&select=*`);
      if (!row || Date.now() - Date.parse(row.updated_at) > FRESH_MS) return json({ sent: 0, stale: true });
      const name = DOG_NAMES[row.dog] || row.dog;
      const when = row.date === todayBerlin() ? 'ist heute im Büro' : `kommt am ${WEEKDAYS_LONG[weekday(row.date)]}, ${formatShort(row.date)} ins Büro`;
      return json(await sendToRoom(env, room, { title: `🐾 ${name} ${when}`, body: 'Das Körbchen ist reserviert.', kind: 'dogs', tag: `dog-${row.date}`, url: './' }, { kind: 'dogs', exclude: body.actor }));
    }
    return json({ error: 'Unbekannte Art' }, 400);
  }

  if (url.pathname.endsWith('/send')) {
    const { config } = await roomConfig(db, room);
    if (String(body.pin || '') !== String(config.pin || '0552')) return json({ error: 'PIN falsch' }, 403);
    const text = String(body.body || '').trim().slice(0, 200);
    if (!text) return json({ error: 'Text fehlt' }, 400);
    const title = String(body.title || '').trim().slice(0, 60) || '552';
    return json(await sendToRoom(env, room, { title, body: text, kind: 'manual', tag: `manual-${Date.now()}`, url: './' }, { only: body.to || null }));
  }

  if (url.pathname.endsWith('/test')) {
    const [sub] = await db.get(`z552_push?endpoint=eq.${enc(String(body.endpoint || ''))}&select=*`);
    if (!sub) return json({ error: 'Dieses Handy ist nicht angemeldet' }, 404);
    const status = await sendPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, { title: '552 · Test', body: 'Es klappt! Mitteilungen kommen an. 🎉', tag: 'test', url: './' }, vapid(env));
    return json({ sent: status < 300 ? 1 : 0, status });
  }

  if (url.pathname.endsWith('/answer')) {
    // answer from the buttons in the morning reminder
    if (!STATUS_IDS.includes(body.status)) return json({ error: 'Ungültiger Status' }, 400);
    const [sub] = await db.get(`z552_push?endpoint=eq.${enc(String(body.endpoint || ''))}&select=room_id,member_id`);
    if (!sub) return json({ error: 'Dieses Handy ist nicht angemeldet' }, 404);
    await db.upsert(
      'z552_overrides',
      { room_id: sub.room_id, member_id: sub.member_id, date: todayBerlin(), status: body.status, status_pm: null, updated_at: new Date().toISOString() },
      'member_id,date',
      { 'x-552-member': sub.member_id },
    );
    return json({ ok: true });
  }

  return json({ error: 'Nicht gefunden' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (err) {
      return json({ error: String(err.message || err) }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(morningRun(env, new Date(event.scheduledTime)));
  },
};
