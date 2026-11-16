import test from 'node:test';
import assert from 'node:assert/strict';
import { weekDays, addDays, diffDays, formatDE, weekdayIndex, todayIso, fakeClock, WOCHENTAGE } from '../../app/js/core/dates.js';
import { golden } from './helpers.mjs';

test('F01: Wochentage und Folgetage stimmen mit dem Orakel ueberein', () => {
  const g = golden('daten.json');
  for (const [start, days] of Object.entries(g)) assert.deepEqual(weekDays(start), days, start);
});

test('F01: Mi 18.11.2026 bis Di 24.11., Fr 20.11. bis Do 26.11.', () => {
  const a = weekDays('2026-11-18');
  assert.equal(a[0].anzeige, 'Mi 18.11.2026');
  assert.equal(a[6].anzeige, 'Di 24.11.2026');
  const b = weekDays('2026-11-20');
  assert.equal(b[0].kurz, 'Fr');
  assert.equal(b[6].anzeige, 'Do 26.11.2026');
});

test('F01: immer genau 7 Folgetage ohne Luecke und Doppel, vier Jahre taeglich (Monats-, Jahres-, Schaltjahr, Zeitumstellung)', () => {
  let d = '2026-01-01';
  let count = 0;
  while (d < '2030-01-01') {
    const w = weekDays(d);
    assert.equal(w.length, 7);
    assert.equal(w[0].datum, d);
    for (let i = 1; i < 7; i++) {
      assert.equal(diffDays(w[i - 1].datum, w[i].datum), 1, `${d} +${i}`);
      assert.equal(weekdayIndex(w[i].datum), (weekdayIndex(w[i - 1].datum) + 1) % 7);
    }
    assert.equal(new Set(w.map((x) => x.datum)).size, 7);
    d = addDays(d, 1);
    count++;
  }
  assert.equal(count, 1461);
});

test('Datumsarithmetik an Grenzen', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2027-02-28', 1), '2027-03-01');
  assert.equal(addDays('2026-10-24', 2), '2026-10-26'); // Zeitumstellung 25.10.2026
  assert.equal(diffDays('2026-10-24', '2026-10-27'), 3);
  assert.equal(diffDays('2027-03-27', '2027-03-29'), 2); // Zeitumstellung 28.03.2027
  assert.equal(formatDE('2026-01-05'), '05.01.2026');
  assert.equal(WOCHENTAGE[weekdayIndex('2026-11-14')], 'Samstag');
});

test('Heute in Europe/Berlin mit Fake-Clock (Sommer-, Winterzeit, Mitternacht)', () => {
  assert.equal(todayIso(fakeClock('2026-11-14T22:59:00Z')), '2026-11-14'); // 23:59 MEZ
  assert.equal(todayIso(fakeClock('2026-11-14T23:01:00Z')), '2026-11-15'); // 00:01 MEZ
  assert.equal(todayIso(fakeClock('2026-07-01T21:59:00Z')), '2026-07-01'); // 23:59 MESZ
  assert.equal(todayIso(fakeClock('2026-07-01T22:01:00Z')), '2026-07-02'); // 00:01 MESZ
  assert.equal(todayIso(fakeClock('2026-10-24T22:30:00Z')), '2026-10-25'); // 00:30 MESZ, Umstellung am Folgetag
  assert.equal(todayIso(fakeClock('2026-10-25T23:30:00Z')), '2026-10-26'); // 00:30 MEZ
  assert.equal(todayIso(fakeClock('2026-12-31T23:30:00Z')), '2027-01-01'); // Jahreswechsel
});
