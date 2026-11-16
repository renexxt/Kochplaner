import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySlots, clampPortionen, setPortionen, stepPortionen, setDish, toggleFix, isComplete, slotsToTage, slotsToRows, rowsToSlots }
  from '../../app/js/core/plan.js';
import { shoppingList } from '../../app/js/core/shopping.js';
import { normalize } from '../../app/js/core/normalize.js';
import { golden, loadNorm } from './helpers.mjs';

test('F05: Portionen bleiben zwischen 1 und 20', () => {
  assert.equal(clampPortionen(0), 1);
  assert.equal(clampPortionen(-3), 1);
  assert.equal(clampPortionen(21), 20);
  assert.equal(clampPortionen('7'), 7);
  assert.equal(clampPortionen(2.9), 2);
  assert.equal(clampPortionen('abc'), 1);
  let s = emptySlots('2026-11-18', 2);
  s = stepPortionen(s, 0, -5);
  assert.equal(s[0].portionen, 1);
  for (let i = 0; i < 30; i++) s = stepPortionen(s, 0, +1);
  assert.equal(s[0].portionen, 20);
  assert.equal(s[1].portionen, 2); // andere Tage unberuehrt
});

test('Plan: 7 Tage, Zustand wird nie veraendert (unveraenderlich)', () => {
  const a = emptySlots('2026-12-30', 4);
  assert.equal(a.length, 7);
  assert.deepEqual(a.map((s) => s.datum), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04', '2027-01-05']);
  const b = setDish(a, 0, 'G001');
  assert.equal(a[0].gericht_id, null);
  assert.equal(b[0].gericht_id, 'G001');
  assert.equal(isComplete(b), false);
});

test('F03: Fixieren geht nur bei belegten Tagen, zweimal Tippen loest es wieder', () => {
  let s = emptySlots('2026-11-18', 2);
  assert.equal(toggleFix(s, 0)[0].fixiert, false);
  s = setDish(s, 0, 'G001');
  s = toggleFix(s, 0);
  assert.equal(s[0].fixiert, true);
  assert.equal(toggleFix(s, 0)[0].fixiert, false);
});

test('F05: 2 -> 5 -> 2 ueber den Plan liefert denselben Einkaufszettel wie vorher', () => {
  const norm = loadNorm('kochplaner_test');
  let s = emptySlots('2026-11-18', 2);
  ['G001', 'G004', 'G007', 'G012', 'G022', 'G028', 'G031'].forEach((g, i) => { s = setDish(s, i, g); });
  const before = shoppingList(norm, slotsToTage(s));
  let t = s;
  for (let i = 0; i < 7; i++) t = setPortionen(t, i, 5);
  assert.notDeepEqual(shoppingList(norm, slotsToTage(t)).zeilen, before.zeilen);
  for (let i = 0; i < 7; i++) t = setPortionen(t, i, 2);
  assert.deepEqual(shoppingList(norm, slotsToTage(t)), before);
});

test('F10: Plan speichern und wieder laden (Zeilen fuer den Tab Plan) ist verlustfrei', () => {
  let s = emptySlots('2026-11-20', 2);
  ['G001', 'G004', 'G007', 'G012', 'G022', 'G028', 'G031'].forEach((g, i) => { s = setDish(s, i, g); });
  s = setPortionen(s, 3, 5);
  s = toggleFix(s, 1);
  const rows = slotsToRows(s, '2026-11-20', '2026-11-14T09:30:00');
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[0], { woche_start: '2026-11-20', datum: '2026-11-20', gericht_id: 'G001', portionen: 2, fixiert: 'nein', geaendert_am: '2026-11-14T09:30:00' });
  // wie das Sheet sie zurueckliefert (Text), dann normalisieren und wieder in Slots
  const norm = normalize({ Plan: rows });
  const back = rowsToSlots(norm.plan, '2026-11-20', 2);
  assert.deepEqual(back, s);
});

test('F10: Historie aus dem Sheet (Ben und Clara) fuellt genau die belegten Tage', () => {
  const norm = loadNorm('profile_ben_clara');
  const s = rowsToSlots(norm.plan, '2026-11-13', 2); // zweite Woche der Historie
  assert.equal(isComplete(s), true);
  assert.deepEqual(s[0].gericht_id, norm.plan[7].gericht_id);
  const none = rowsToSlots(norm.plan, '2026-11-20', 2); // danach nichts geplant
  assert.equal(none.every((x) => x.gericht_id === null), true);
  assert.equal(golden('profile_ben_clara.norm.json').plan.length, 14);
});
