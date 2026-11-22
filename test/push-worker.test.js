import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { morningRun } from '../push-worker/handler.js';
import { bytesToB64url } from '../push-worker/webpush.js';

// --- fake Supabase + push service --------------------------------------------------------
function setup({ config = {}, overrides = [], plans = [], board = [], dogs = [] } = {}) {
  const db = {
    z552_roomconfig: [{ room_id: 'R', config: { pin: '0552', push: { url: 'https://w.example', ...config } } }],
    z552_members: [{ id: 'j', room_id: 'R', name: 'Julia' }, { id: 'm', room_id: 'R', name: 'Marc' }],
    z552_push: [
      { endpoint: 'https://push.example/j', room_id: 'R', member_id: 'j', p256dh: '', auth: '', prefs: { morning: true, notes: true, dogs: true } },
      { endpoint: 'https://push.example/m', room_id: 'R', member_id: 'm', p256dh: '', auth: '', prefs: { morning: true, notes: false, dogs: true } },
    ],
    z552_plans: plans, z552_overrides: overrides, z552_board: board, z552_dogs: dogs,
  };
  const pushed = [];
  const upserts = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.host === 'push.example') {
      assert.match(init.headers.Authorization, /^vapid t=.+, k=/);
      pushed.push(url.pathname.slice(1));
      return new Response(null, { status: 201 });
    }
    const table = url.pathname.split('/').pop();
    if ((init.method || 'GET') === 'POST') {
      upserts.push({ table, row: JSON.parse(init.body), actor: init.headers['x-552-member'] });
      return new Response('', { status: 201 });
    }
    let rows = db[table] || [];
    for (const [k, v] of url.searchParams) {
      if (v.startsWith('eq.')) rows = rows.filter((r) => String(r[k]) === v.slice(3));
    }
    if (url.searchParams.get('order') === 'created_at.desc') rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return new Response(JSON.stringify(rows), { status: 200 });
  };
  return { db, pushed, upserts };
}
// real keys so the payload encryption runs
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPub = bytesToB64url(await crypto.subtle.exportKey('raw', ua.publicKey));
const env = {
  SUPABASE_URL: 'https://sb.example', SUPABASE_KEY: 'anon',
  VAPID_PUBLIC_KEY: bytesToB64url(await crypto.subtle.exportKey('raw', keys.publicKey)),
  VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', keys.privateKey)).d,
};
const withKeys = (s) => { for (const p of s.db.z552_push) { p.p256dh = uaPub; p.auth = bytesToB64url(crypto.getRandomValues(new Uint8Array(16))); } return s; };
const post = (path, body) => worker.fetch(new Request('https://w.example' + path, { method: 'POST', body: JSON.stringify(body) }), env).then((r) => r.json());
const monday0830 = new Date('2026-11-23T07:30:00Z'); // 08:30 Berlin, Monday

test('morning reminder: only people without entry or plan, only at the configured time', async () => {
  const s = withKeys(setup({ overrides: [{ room_id: 'R', member_id: 'j', date: '2026-11-23', status: 'office' }] }));
  await morningRun(env, monday0830);
  assert.deepEqual(s.pushed, ['m']);
  s.pushed.length = 0;
  await morningRun(env, new Date('2026-11-23T08:00:00Z')); // 09:00 -> not the configured slot
  assert.deepEqual(s.pushed, []);
});

test('morning reminder respects a planned vacation, a switched-off reminder and weekends', async () => {
  const plans = [{ id: 'p', room_id: 'R', member_id: 'm', kind: 'absence', status: 'away', start_date: '2026-11-23', end_date: '2026-11-27' }];
  let s = withKeys(setup({ plans }));
  await morningRun(env, monday0830);
  assert.deepEqual(s.pushed, ['j']);
  s = withKeys(setup({ config: { morning: false } }));
  await morningRun(env, monday0830);
  assert.deepEqual(s.pushed, []);
  s = withKeys(setup());
  await morningRun(env, new Date('2026-11-22T07:30:00Z')); // Sunday
  assert.deepEqual(s.pushed, []);
});

test('new note goes to the others with notes switched on', async () => {
  const s = withKeys(setup({ board: [{ id: 'n1', room_id: 'R', title: 'Kuchen!', author_name: 'Julia', created_at: new Date().toISOString() }] }));
  const r = await post('/notify', { room: 'R', kind: 'note', actor: 'j' });
  assert.equal(r.sent, 0); // Marc has notes off, Julia wrote it
  s.db.z552_push[1].prefs.notes = true;
  assert.equal((await post('/notify', { room: 'R', kind: 'note', actor: 'j' })).sent, 1);
  assert.deepEqual(s.pushed, ['m']);
});

test('dog push, stale entries are ignored', async () => {
  const s = withKeys(setup({ dogs: [{ room_id: 'R', date: '2026-11-24', dog: 'hazel', updated_at: new Date().toISOString() }] }));
  assert.equal((await post('/notify', { room: 'R', kind: 'dog', date: '2026-11-24', actor: 'm' })).sent, 1);
  s.db.z552_dogs[0].updated_at = '2020-01-01T00:00:00Z';
  assert.equal((await post('/notify', { room: 'R', kind: 'dog', date: '2026-11-24', actor: 'm' })).stale, true);
});

test('manual message needs the PIN; answer button writes the status with the person as actor', async () => {
  const s = withKeys(setup());
  assert.equal((await post('/send', { room: 'R', pin: '1111', body: 'Hallo' })).error, 'PIN falsch');
  assert.equal((await post('/send', { room: 'R', pin: '0552', body: 'Hallo', to: 'm' })).sent, 1);
  assert.equal((await post('/send', { room: 'R', pin: '0552', body: 'Hallo alle' })).sent, 2);
  await post('/answer', { endpoint: 'https://push.example/m', status: 'mobile' });
  assert.equal(s.upserts[0].table, 'z552_overrides');
  assert.equal(s.upserts[0].row.status, 'mobile');
  assert.equal(s.upserts[0].actor, 'm');
});

test('global switch off blocks note pushes', async () => {
  withKeys(setup({ config: { on: false }, board: [{ id: 'n', room_id: 'R', title: 'x', created_at: new Date().toISOString() }] }));
  assert.equal((await post('/notify', { room: 'R', kind: 'note' })).off, true);
});
