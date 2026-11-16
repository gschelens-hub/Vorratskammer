// 552 – Cloudflare Worker: JSON API in front of Supabase, static assets, cron jobs.
import { berlinHour, todayBerlin, weekday } from '../src/shared/dates.js';
import { holidayName } from '../src/shared/holidays.js';
import { PERSONS, planned } from '../src/shared/resolve.js';
import { sendPush } from './push.js';
import { db } from './supabase.js';

const PERSON_IDS = PERSONS.map((p) => p.id);
const STATUS_IDS = ['office', 'mobile', 'away'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

function check(cond, message) {
  if (!cond) throw new HttpError(400, message);
}

function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, max);
}

function pinOk(request, env) {
  const given = request.headers.get('X-Room-Pin') || '';
  const expected = env.ROOM_PIN || '';
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function validatePlan(body) {
  const kind = body.kind;
  check(['absence', 'single', 'recurring'].includes(kind), 'Ungültige Art');
  check(PERSON_IDS.includes(body.person), 'Ungültige Person');
  check(STATUS_IDS.includes(body.status), 'Ungültiger Status');
  check(ISO.test(body.start_date || ''), 'Startdatum fehlt');
  const plan = {
    person: body.person,
    kind,
    status: body.status,
    note: cleanText(body.note, 60),
    start_date: body.start_date,
    end_date: null,
    repeat: null,
    weekday: null,
    interval: 1,
    nth: null,
  };
  if (kind === 'absence') {
    check(ISO.test(body.end_date || '') && body.end_date >= body.start_date, 'Enddatum ungültig');
    plan.end_date = body.end_date;
  }
  if (kind === 'recurring') {
    check(['weekly', 'monthly_nth'].includes(body.repeat), 'Ungültige Wiederholung');
    check(Number.isInteger(body.weekday) && body.weekday >= 0 && body.weekday <= 4, 'Ungültiger Wochentag');
    plan.repeat = body.repeat;
    plan.weekday = body.weekday;
    if (body.repeat === 'weekly') {
      check(Number.isInteger(body.interval) && body.interval >= 1 && body.interval <= 8, 'Ungültiger Rhythmus');
      plan.interval = body.interval;
    } else {
      check([1, 2, 3, 4, -1].includes(body.nth), 'Ungültige Woche im Monat');
      plan.nth = body.nth;
    }
    if (body.end_date) {
      check(ISO.test(body.end_date) && body.end_date >= body.start_date, 'Enddatum ungültig');
      plan.end_date = body.end_date;
    }
  }
  return plan;
}

async function handleApi(request, env, url) {
  const store = db(env);
  const path = url.pathname.replace(/^\/api/, '');
  const method = request.method;
  const body = ['POST', 'PUT', 'DELETE'].includes(method) ? await request.json().catch(() => ({})) : {};

  // Public endpoints (no PIN): VAPID key and the answer from a notification button.
  if (path === '/push/key' && method === 'GET') {
    return json({ publicKey: env.VAPID_PUBLIC_KEY || null });
  }
  if (path === '/push/answer' && method === 'POST') {
    check(STATUS_IDS.includes(body.status), 'Ungültiger Status');
    const subs = await store.select('push_subscriptions', `endpoint=eq.${encodeURIComponent(body.endpoint || '')}`);
    if (!subs.length) throw new HttpError(403, 'Unbekanntes Gerät');
    const date = todayBerlin();
    await store.upsert('overrides', { person: subs[0].person, date, status: body.status, updated_at: new Date().toISOString() }, 'person,date');
    return json({ ok: true, person: subs[0].person, date });
  }

  if (!pinOk(request, env)) throw new HttpError(401, 'PIN falsch');

  if (path === '/data' && method === 'GET') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    check(ISO.test(from || '') && ISO.test(to || ''), 'Zeitraum fehlt');
    const range = `date=gte.${from}&date=lte.${to}`;
    const [plans, overrides, guests, board] = await Promise.all([
      store.select('plans', 'order=start_date.asc'),
      store.select('overrides', range),
      store.select('guests', range),
      store.select('board_notes', 'order=created_at.asc'),
    ]);
    return json({ plans, overrides, guests, board, today: todayBerlin() });
  }

  if (path === '/override' && method === 'PUT') {
    check(PERSON_IDS.includes(body.person), 'Ungültige Person');
    check(ISO.test(body.date || ''), 'Datum fehlt');
    check(body.status === null || STATUS_IDS.includes(body.status), 'Ungültiger Status');
    const row = {
      person: body.person,
      date: body.date,
      status: body.status,
      note: body.note === null || body.note === undefined ? null : cleanText(body.note, 60),
      updated_at: new Date().toISOString(),
    };
    const [saved] = await store.upsert('overrides', row, 'person,date');
    return json(saved);
  }
  if (path === '/override' && method === 'DELETE') {
    check(PERSON_IDS.includes(body.person) && ISO.test(body.date || ''), 'Ungültige Angaben');
    await store.remove('overrides', `person=eq.${body.person}&date=eq.${body.date}`);
    return json({ ok: true });
  }

  if (path === '/guest' && method === 'PUT') {
    check(PERSON_IDS.includes(body.desk), 'Ungültiger Tisch');
    check(ISO.test(body.date || ''), 'Datum fehlt');
    const guest_name = cleanText(body.guest_name, 40);
    check(guest_name, 'Name fehlt');
    const [saved] = await store.upsert(
      'guests',
      { date: body.date, desk: body.desk, guest_name, booked_by: cleanText(body.booked_by, 20) },
      'date,desk',
    );
    return json(saved);
  }
  if (path === '/guest' && method === 'DELETE') {
    check(PERSON_IDS.includes(body.desk) && ISO.test(body.date || ''), 'Ungültige Angaben');
    await store.remove('guests', `date=eq.${body.date}&desk=eq.${body.desk}`);
    return json({ ok: true });
  }

  if (path === '/plans' && method === 'POST') {
    const [saved] = await store.insert('plans', validatePlan(body));
    return json(saved, 201);
  }
  const planMatch = path.match(/^\/plans\/([0-9a-f-]{36})$/);
  if (planMatch && method === 'PUT') {
    const [saved] = await store.update('plans', `id=eq.${planMatch[1]}`, validatePlan(body));
    return json(saved);
  }
  if (planMatch && method === 'DELETE') {
    await store.remove('plans', `id=eq.${planMatch[1]}`);
    return json({ ok: true });
  }

  if (path === '/board' && method === 'POST') {
    const text = cleanText(body.text, 140);
    check(text, 'Text fehlt');
    const color = ['yellow', 'pink', 'blue', 'green'].includes(body.color) ? body.color : 'yellow';
    const [saved] = await store.insert('board_notes', { text, author: cleanText(body.author, 20), color });
    return json(saved, 201);
  }
  const boardMatch = path.match(/^\/board\/([0-9a-f-]{36})$/);
  if (boardMatch && method === 'DELETE') {
    await store.remove('board_notes', `id=eq.${boardMatch[1]}`);
    return json({ ok: true });
  }

  if (path === '/push/subscribe' && method === 'POST') {
    check(PERSON_IDS.includes(body.person), 'Ungültige Person');
    const sub = body.subscription || {};
    check(/^https:\/\//.test(sub.endpoint || '') && sub.keys?.p256dh && sub.keys?.auth, 'Ungültiges Abo');
    await store.upsert(
      'push_subscriptions',
      { endpoint: sub.endpoint, person: body.person, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      'endpoint',
    );
    return json({ ok: true });
  }
  if (path === '/push/subscribe' && method === 'DELETE') {
    await store.remove('push_subscriptions', `endpoint=eq.${encodeURIComponent(body.endpoint || '')}`);
    return json({ ok: true });
  }
  if (path === '/push/test' && method === 'POST') {
    const sent = await sendReminders(env, { onlyEndpoint: body.endpoint, force: true });
    return json({ sent });
  }

  throw new HttpError(404, 'Nicht gefunden');
}

/** Morning reminder: asks everyone who has not set a status for today yet. */
export async function sendReminders(env, { onlyEndpoint = null, force = false } = {}) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return 0;
  const store = db(env);
  const today = todayBerlin();
  if (!force && (weekday(today) >= 5 || holidayName(today))) return 0;

  const [subs, plans, overrides] = await Promise.all([
    store.select('push_subscriptions'),
    store.select('plans'),
    store.select('overrides', `date=eq.${today}`),
  ]);
  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || 'mailto:admin@example.com',
  };

  let sent = 0;
  for (const s of subs) {
    if (onlyEndpoint && s.endpoint !== onlyEndpoint) continue;
    if (!force) {
      const hasOverride = overrides.some((o) => o.person === s.person && o.status);
      const plan = planned(s.person, today, plans);
      if (hasOverride || plan.source !== 'default') continue;
    }
    const name = PERSONS.find((p) => p.id === s.person)?.name || '';
    const payload = {
      title: '552 · Guten Morgen' + (name ? `, ${name}` : ''),
      body: 'Bist du heute im Büro?',
      date: today,
      url: '/',
    };
    try {
      const status = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, vapid);
      if (status === 404 || status === 410) {
        await store.remove('push_subscriptions', `endpoint=eq.${encodeURIComponent(s.endpoint)}`);
      } else if (status < 300) {
        sent++;
      } else {
        console.warn('Push failed', status, s.person);
      }
    } catch (err) {
      console.warn('Push error', err.message);
    }
  }
  return sent;
}

/** Keeps the Supabase project active so it is not paused for inactivity. */
async function heartbeat(env) {
  await db(env).update('heartbeat', 'id=eq.1', { beat_at: new Date().toISOString() });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        const status = err.status || 500;
        if (status === 500) console.error(err);
        return json({ error: status === 500 ? 'Serverfehler' : err.message }, status);
      }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        await heartbeat(env);
        // Two UTC cron times cover 8:30 Berlin in summer and winter time; only the matching one sends.
        if (event.cron !== '17 3 * * *' && berlinHour(new Date(event.scheduledTime)) === 8) {
          await sendReminders(env);
        }
      })(),
    );
  },
};

