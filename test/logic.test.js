import assert from 'node:assert/strict';
import { test } from 'node:test';
import { holidayName, inOffice, isBridgeDay, isoWeek, mondayOf, officeShare, resolveDay, weekday } from '../app/logic.js';

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
  { id: 'a', member_id: 'marc', kind: 'absence', status: 'away', note: 'Urlaub', start_date: '2026-12-01', end_date: '2026-12-05', created_at: '1' },
  { id: 'b', member_id: 'luca', kind: 'recurring', status: 'mobile', note: '', start_date: '2026-11-02', repeat: 'weekly', weekday: 4, interval: 2, created_at: '1' },
  { id: 'c', member_id: 'julia', kind: 'recurring', status: 'away', note: '', start_date: '2026-01-01', repeat: 'monthly_nth', weekday: 1, nth: 2, created_at: '1' },
  { id: 'd', member_id: 'julia', kind: 'recurring', status: 'mobile', note: '', start_date: '2026-01-01', repeat: 'monthly_nth', weekday: 4, nth: -1, created_at: '1' },
];

test('override wins for one day only', () => {
  const overrides = [{ member_id: 'marc', date: '2026-12-03', status: 'office', note: null }];
  assert.equal(resolveDay('marc', '2026-12-02', plans, overrides).status, 'away');
  const d3 = resolveDay('marc', '2026-12-03', plans, overrides);
  assert.equal(d3.status, 'office');
  assert.equal(d3.overridden, true);
  assert.equal(resolveDay('marc', '2026-12-04', plans, overrides).status, 'away');
});

test('note-only override keeps planned status', () => {
  const r = resolveDay('marc', '2026-12-02', plans, [{ member_id: 'marc', date: '2026-12-02', status: null, note: 'Paket' }]);
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

test('split day via override (morning office, afternoon mobile)', () => {
  const ov = [{ member_id: 'marc', date: '2026-11-18', status: 'office', status_pm: 'mobile', note: null }];
  const r = resolveDay('marc', '2026-11-18', [], ov);
  assert.equal(r.status, 'office');
  assert.equal(r.statusPm, 'mobile');
  assert.equal(r.split, true);
  assert.equal(inOffice(r), true);
  assert.equal(officeShare(r), 0.5);
});

test('whole-day override covers both halves, even over a half-day plan', () => {
  const plans2 = [{ id: 'h', member_id: 'luca', kind: 'recurring', status: 'mobile', start_date: '2026-11-02', repeat: 'weekly', weekday: 4, interval: 1, half: 'pm', created_at: '1' }];
  assert.deepEqual([resolveDay('luca', '2026-11-20', plans2, []).status, resolveDay('luca', '2026-11-20', plans2, []).statusPm], ['unknown', 'mobile']);
  const r = resolveDay('luca', '2026-11-20', plans2, [{ member_id: 'luca', date: '2026-11-20', status: 'office', status_pm: null }]);
  assert.equal(r.status, 'office');
  assert.equal(r.statusPm, 'office');
  assert.equal(r.split, false);
});

test('afternoon-only override keeps the planned morning', () => {
  const r = resolveDay('marc', '2026-12-02', plans, [{ member_id: 'marc', date: '2026-12-02', status: null, status_pm: 'office' }]);
  assert.equal(r.status, 'away');
  assert.equal(r.statusPm, 'office');
});

test('half-day plan beats whole-day plan of the same kind', () => {
  const p = [
    { id: 'a', member_id: 'julia', kind: 'absence', status: 'away', start_date: '2026-11-23', end_date: '2026-11-27', created_at: '2' },
    { id: 'b', member_id: 'julia', kind: 'single', status: 'office', start_date: '2026-11-25', half: 'am', created_at: '1' },
  ];
  const r = resolveDay('julia', '2026-11-25', p, []);
  assert.equal(r.status, 'office');
  assert.equal(r.statusPm, 'away');
});
