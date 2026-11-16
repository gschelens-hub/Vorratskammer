import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isoWeek, mondayOf, weekday } from '../src/shared/dates.js';
import { holidayName, isBridgeDay } from '../src/shared/holidays.js';
import { resolveDay } from '../src/shared/resolve.js';

test('dates', () => {
  assert.equal(weekday('2026-11-16'), 0);
  assert.equal(mondayOf('2026-11-22'), '2026-11-16');
  assert.equal(isoWeek('2026-11-16'), 47);
  assert.equal(isoWeek('2027-01-01'), 53);
});

test('Berlin holidays and bridge days', () => {
  assert.equal(holidayName('2026-04-03'), 'Karfreitag');
  assert.equal(holidayName('2026-05-14'), 'Christi Himmelfahrt');
  assert.equal(holidayName('2026-03-09'), null);
  assert.equal(isBridgeDay('2026-05-15'), true); // Friday after Ascension
  assert.equal(isBridgeDay('2026-05-13'), false);
});

const plans = [
  { id: 'a', person: 'marc', kind: 'absence', status: 'away', note: 'Urlaub', start_date: '2026-12-01', end_date: '2026-12-05', created_at: '1' },
  { id: 'b', person: 'luca', kind: 'recurring', status: 'mobile', note: '', start_date: '2026-11-02', repeat: 'weekly', weekday: 4, interval: 2, created_at: '1' },
  { id: 'c', person: 'julia', kind: 'recurring', status: 'away', note: '', start_date: '2026-01-01', repeat: 'monthly_nth', weekday: 1, nth: 2, created_at: '1' },
  { id: 'd', person: 'julia', kind: 'recurring', status: 'mobile', note: '', start_date: '2026-01-01', repeat: 'monthly_nth', weekday: 4, nth: -1, created_at: '1' },
];

test('override wins for one day only', () => {
  const overrides = [{ person: 'marc', date: '2026-12-03', status: 'office', note: null }];
  assert.equal(resolveDay('marc', '2026-12-02', plans, overrides).status, 'away');
  const d3 = resolveDay('marc', '2026-12-03', plans, overrides);
  assert.equal(d3.status, 'office');
  assert.equal(d3.overridden, true);
  assert.equal(resolveDay('marc', '2026-12-04', plans, overrides).status, 'away');
});

test('note-only override keeps planned status', () => {
  const r = resolveDay('marc', '2026-12-02', plans, [{ person: 'marc', date: '2026-12-02', status: null, note: 'Paket' }]);
  assert.equal(r.status, 'away');
  assert.equal(r.note, 'Paket');
});

test('recurring rules', () => {
  assert.equal(resolveDay('luca', '2026-11-06', plans, []).status, 'mobile');
  assert.equal(resolveDay('luca', '2026-11-13', plans, []).status, 'unknown'); // every 2nd week
  assert.equal(resolveDay('luca', '2026-11-20', plans, []).status, 'mobile');
  assert.equal(resolveDay('julia', '2026-11-10', plans, []).status, 'away'); // 2nd Tuesday
  assert.equal(resolveDay('julia', '2026-11-17', plans, []).status, 'unknown');
  assert.equal(resolveDay('julia', '2026-11-27', plans, []).status, 'mobile'); // last Friday
  assert.equal(resolveDay('julia', '2026-11-20', plans, []).status, 'unknown');
});

test('holiday defaults to away', () => {
  const r = resolveDay('marc', '2026-12-25', [], []);
  assert.equal(r.status, 'away');
  assert.equal(r.source, 'holiday');
});
