// 552 – Push-Zentrale. Automatisch erzeugt aus push-worker/handler.js – bitte dort ändern.

// app/logic.js
function toISO(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function addDays(iso, n) {
  const d = fromISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}
function weekday(iso) {
  return (fromISO(iso).getUTCDay() + 6) % 7;
}
function mondayOf(iso) {
  return addDays(iso, -weekday(iso));
}
function diffDays(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / 864e5);
}
function todayBerlin(now = /* @__PURE__ */ new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
}
var WEEKDAYS_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
function formatShort(iso) {
  const d = fromISO(iso);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
}
function easterSunday(year) {
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
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return toISO(new Date(Date.UTC(year, month - 1, day)));
}
var cache = /* @__PURE__ */ new Map();
function holidaysBerlin(year) {
  if (cache.has(year)) return cache.get(year);
  const easter = easterSunday(year);
  const list = {
    [`${year}-01-01`]: "Neujahr",
    [`${year}-03-08`]: "Frauentag",
    [addDays(easter, -2)]: "Karfreitag",
    [addDays(easter, 1)]: "Ostermontag",
    [`${year}-05-01`]: "Tag der Arbeit",
    [addDays(easter, 39)]: "Christi Himmelfahrt",
    [addDays(easter, 50)]: "Pfingstmontag",
    [`${year}-10-03`]: "Tag der Deutschen Einheit",
    [`${year}-12-24`]: "Heiligabend",
    [`${year}-12-25`]: "1. Weihnachtstag",
    [`${year}-12-26`]: "2. Weihnachtstag",
    [`${year}-12-31`]: "Silvester"
  };
  cache.set(year, list);
  return list;
}
function holidayName(iso) {
  return holidaysBerlin(Number(iso.slice(0, 4)))[iso] || null;
}
var PLAN = { x: 1e3, y: 330, w: 1180, h: 1020 };
var deskDef = (id, label, rect, chair, notePos) => {
  const [rx, ry, rw, rh] = rect;
  return {
    id,
    label,
    rect,
    chair,
    // [cx, cy] of the chair seat
    notePos,
    // where the note bubble goes (over the chair)
    x: +((rx - PLAN.x) / PLAN.w * 100).toFixed(2),
    y: +((ry - PLAN.y) / PLAN.h * 100).toFixed(2),
    w: +(rw / PLAN.w * 100).toFixed(2),
    h: +(rh / PLAN.h * 100).toFixed(2)
  };
};
var DESKS = [
  deskDef("top", "oben", [1619, 554, 511, 241], [1874, 452], "above"),
  deskDef("bottom_left", "unten links", [1049, 861, 511, 242], [1305, 1218], "below"),
  deskDef("bottom_right", "unten rechts", [1619, 861, 511, 242], [1874, 1218], "below")
];
function daysInMonth(iso) {
  const d = fromISO(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}
function recurringMatches(plan, iso) {
  if (iso < plan.start_date) return false;
  if (plan.end_date && iso > plan.end_date) return false;
  if (weekday(iso) !== plan.weekday) return false;
  if (plan.repeat === "monthly_nth") {
    const day = fromISO(iso).getUTCDate();
    if (plan.nth === -1) return day + 7 > daysInMonth(iso);
    return Math.ceil(day / 7) === plan.nth;
  }
  const weeks = diffDays(mondayOf(plan.start_date), mondayOf(iso)) / 7;
  return weeks % Math.max(1, plan.interval || 1) === 0;
}
function planMatches(plan, iso) {
  if (plan.kind === "recurring") return recurringMatches(plan, iso);
  const end = plan.end_date || plan.start_date;
  return iso >= plan.start_date && iso <= end;
}
var coversHalf = (plan, half) => !plan.half || plan.half === half;
function plannedHalf(personId, iso, plans, half) {
  const mine = plans.filter((p) => p.member_id === personId && coversHalf(p, half) && planMatches(p, iso));
  const order = (a, b) => (b.half ? 1 : 0) - (a.half ? 1 : 0) || String(b.created_at || "").localeCompare(String(a.created_at || ""));
  const fixed = mine.filter((p) => p.kind !== "recurring").sort(order)[0];
  if (fixed) return { status: fixed.status, note: fixed.note || "", source: "plan", plan: fixed };
  const rec = mine.filter((p) => p.kind === "recurring").sort(order)[0];
  if (rec) return { status: rec.status, note: rec.note || "", source: "turnus", plan: rec };
  const holiday = holidayName(iso);
  if (holiday) return { status: "away", note: holiday, source: "holiday" };
  return { status: "unknown", note: "", source: "default" };
}
function planned(personId, iso, plans) {
  const am = plannedHalf(personId, iso, plans, "am");
  const pm = plannedHalf(personId, iso, plans, "pm");
  const lead = am.source !== "default" ? am : pm;
  return {
    status: am.status,
    statusPm: pm.status,
    split: am.status !== pm.status,
    note: am.note || pm.note,
    source: lead.source,
    plan: lead.plan
  };
}

// push-worker/webpush.js
var enc = new TextEncoder();
function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function bytesToB64url(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
}
async function encryptPayload(subscription, payload, { salt, asKeyPair } = {}) {
  const uaPublic = b64urlToBytes(subscription.keys.p256dh);
  const authSecret = b64urlToBytes(subscription.keys.auth);
  salt = salt || crypto.getRandomValues(new Uint8Array(16));
  asKeyPair = asKeyPair || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeyPair.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeyPair.privateKey, 256));
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}
async function vapidHeader(endpoint, vapid2) {
  const pub = b64urlToBytes(vapid2.publicKey);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: vapid2.privateKey
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64url(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1e3) + 12 * 3600,
        sub: vapid2.subject
      })
    )
  );
  const unsigned = `${header}.${claims}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return `vapid t=${unsigned}.${bytesToB64url(sig)}, k=${vapid2.publicKey}`;
}
async function sendPush(subscription, payload, vapid2, ttl = 4 * 3600) {
  const body = await encryptPayload(subscription, JSON.stringify(payload));
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(subscription.endpoint, vapid2),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: "normal"
    },
    body
  });
  return res.status;
}

// push-worker/handler.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
var json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });
var DOG_NAMES = { hazel: "Hazel", koko: "Koko" };
var STATUS_IDS = ["office", "mobile", "away", "kreditnext"];
var PUSH_DEFAULT = { on: true, url: "", morning: true, morningTime: "08:30", notes: true, dogs: true };
var FRESH_MS = 5 * 60 * 1e3;
function sb(env) {
  const base = `${String(env.SUPABASE_URL).replace(/\/$/, "")}/rest/v1/`;
  const headers = { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, "Content-Type": "application/json" };
  const call = async (method, path, body, extra = {}) => {
    const res = await fetch(base + path, { method, headers: { ...headers, ...extra }, body: body === void 0 ? void 0 : JSON.stringify(body) });
    if (!res.ok) throw new Error(`Supabase ${method} ${path.split("?")[0]}: ${res.status} ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
  return {
    get: (path) => call("GET", path),
    upsert: (table, row, onConflict, extra) => call("POST", `${table}?on_conflict=${onConflict}`, row, { Prefer: "resolution=merge-duplicates", ...extra }),
    del: (path) => call("DELETE", path)
  };
}
var enc2 = encodeURIComponent;
async function roomConfig(db, room) {
  const rows = await db.get(`z552_roomconfig?room_id=eq.${enc2(room)}&select=config`);
  const config = rows[0]?.config || {};
  return { config, push: { ...PUSH_DEFAULT, ...config.push || {} } };
}
function vapid(env) {
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || "https://552.gschelens.workers.dev" };
}
async function sendToRoom(env, room, payload, { kind = null, exclude = null, only = null } = {}) {
  const db = sb(env);
  let subs = await db.get(`z552_push?room_id=eq.${enc2(room)}&select=*`);
  subs = subs.filter((s) => (!kind || s.prefs?.[kind] !== false) && (!exclude || s.member_id !== exclude) && (!only || s.member_id === only));
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    try {
      const status = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, vapid(env));
      if (status === 404 || status === 410) {
        await db.del(`z552_push?endpoint=eq.${enc2(s.endpoint)}`);
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
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}
var slotOf = (hhmm) => `${hhmm.slice(0, 2)}:${Number(hhmm.slice(3, 5)) < 30 ? "00" : "30"}`;
async function morningRun(env, now = /* @__PURE__ */ new Date()) {
  const db = sb(env);
  const today = todayBerlin(now);
  if (weekday(today) >= 5 || holidayName(today)) return { skipped: "weekend/holiday" };
  const subs = await db.get("z552_push?select=room_id");
  const rooms = [...new Set(subs.map((s) => s.room_id))];
  const result = {};
  for (const room of rooms) {
    const { push } = await roomConfig(db, room);
    if (!push.on || !push.morning || slotOf(berlinHHMM(now)) !== push.morningTime) continue;
    const [members, plans, overrides] = await Promise.all([
      db.get(`z552_members?room_id=eq.${enc2(room)}&select=id,name`),
      db.get(`z552_plans?room_id=eq.${enc2(room)}&select=*`),
      db.get(`z552_overrides?room_id=eq.${enc2(room)}&date=eq.${today}&select=*`)
    ]);
    let sent = 0;
    for (const m of members) {
      const ov = overrides.find((o) => o.member_id === m.id);
      if (ov && (ov.status || ov.status_pm)) continue;
      if (planned(m.id, today, plans).source !== "default") continue;
      const r = await sendToRoom(
        env,
        room,
        { title: `552 \xB7 Guten Morgen, ${m.name}`, body: "Bist du heute im B\xFCro?", kind: "morning", actions: true, answer: push.url, tag: `morning-${today}`, url: "./" },
        { kind: "morning", only: m.id }
      );
      sent += r.sent;
    }
    result[room] = sent;
  }
  return result;
}
async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (request.method === "GET") return json({ ok: true, publicKey: env.VAPID_PUBLIC_KEY || null });
  if (request.method !== "POST") return json({ error: "Nicht erlaubt" }, 405);
  const body = await request.json().catch(() => ({}));
  const db = sb(env);
  const room = String(body.room || "");
  if (url.pathname.endsWith("/notify")) {
    const { push } = await roomConfig(db, room);
    if (!push.on) return json({ sent: 0, off: true });
    if (body.kind === "note") {
      if (!push.notes) return json({ sent: 0, off: true });
      const [note] = await db.get(`z552_board?room_id=eq.${enc2(room)}&order=created_at.desc&limit=1&select=*`);
      if (!note || Date.now() - Date.parse(note.created_at) > FRESH_MS) return json({ sent: 0, stale: true });
      const title = (note.title || note.text || "").trim().split("\n")[0].slice(0, 60);
      return json(
        await sendToRoom(env, room, { title: `\u{1F4CC} Neue Notiz${note.author_name ? ` von ${note.author_name}` : ""}`, body: title, kind: "notes", tag: `note-${note.id}`, url: "./" }, { kind: "notes", exclude: body.actor })
      );
    }
    if (body.kind === "dog") {
      if (!push.dogs) return json({ sent: 0, off: true });
      const [row] = await db.get(`z552_dogs?room_id=eq.${enc2(room)}&date=eq.${enc2(String(body.date || ""))}&select=*`);
      if (!row || Date.now() - Date.parse(row.updated_at) > FRESH_MS) return json({ sent: 0, stale: true });
      const name = DOG_NAMES[row.dog] || row.dog;
      const when = row.date === todayBerlin() ? "ist heute im B\xFCro" : `kommt am ${WEEKDAYS_LONG[weekday(row.date)]}, ${formatShort(row.date)} ins B\xFCro`;
      return json(await sendToRoom(env, room, { title: `\u{1F43E} ${name} ${when}`, body: "Das K\xF6rbchen ist reserviert.", kind: "dogs", tag: `dog-${row.date}`, url: "./" }, { kind: "dogs", exclude: body.actor }));
    }
    return json({ error: "Unbekannte Art" }, 400);
  }
  if (url.pathname.endsWith("/send")) {
    const { config } = await roomConfig(db, room);
    if (String(body.pin || "") !== String(config.pin || "0552")) return json({ error: "PIN falsch" }, 403);
    const text = String(body.body || "").trim().slice(0, 200);
    if (!text) return json({ error: "Text fehlt" }, 400);
    const title = String(body.title || "").trim().slice(0, 60) || "552";
    return json(await sendToRoom(env, room, { title, body: text, kind: "manual", tag: `manual-${Date.now()}`, url: "./" }, { only: body.to || null }));
  }
  if (url.pathname.endsWith("/test")) {
    const [sub] = await db.get(`z552_push?endpoint=eq.${enc2(String(body.endpoint || ""))}&select=*`);
    if (!sub) return json({ error: "Dieses Handy ist nicht angemeldet" }, 404);
    const status = await sendPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, { title: "552 \xB7 Test", body: "Es klappt! Mitteilungen kommen an. \u{1F389}", tag: "test", url: "./" }, vapid(env));
    return json({ sent: status < 300 ? 1 : 0, status });
  }
  if (url.pathname.endsWith("/answer")) {
    if (!STATUS_IDS.includes(body.status)) return json({ error: "Ung\xFCltiger Status" }, 400);
    const [sub] = await db.get(`z552_push?endpoint=eq.${enc2(String(body.endpoint || ""))}&select=room_id,member_id`);
    if (!sub) return json({ error: "Dieses Handy ist nicht angemeldet" }, 404);
    await db.upsert(
      "z552_overrides",
      { room_id: sub.room_id, member_id: sub.member_id, date: todayBerlin(), status: body.status, status_pm: null, updated_at: (/* @__PURE__ */ new Date()).toISOString() },
      "member_id,date",
      { "x-552-member": sub.member_id }
    );
    return json({ ok: true });
  }
  return json({ error: "Nicht gefunden" }, 404);
}
var handler_default = {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (err) {
      return json({ error: String(err.message || err) }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(morningRun(env, new Date(event.scheduledTime)));
  }
};

// push-worker/entry.js
var entry_default = handler_default;
export {
  entry_default as default
};
