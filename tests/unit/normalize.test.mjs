import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, stripInternal } from '../../app/js/core/normalize.js';
import { parseAmount, toBool, parseDate, normUnit, nameKey, displayName, collate } from '../../app/js/core/parse.js';
import { Fr } from '../../app/js/core/fraction.js';
import { golden, FILES } from './helpers.mjs';

for (const stem of FILES) {
  test(`Normalisierung stimmt mit dem Orakel ueberein: ${stem}`, () => {
    const got = stripInternal(normalize(golden(`${stem}.raw.json`)));
    assert.deepEqual(got, golden(`${stem}.norm.json`));
  });
}

test('Zahlen tolerant lesen', () => {
  const eq = (v, n, d = 1) => assert.ok(parseAmount(v)?.eq(Fr.of(n, d)), String(v));
  eq('1,5', 3, 2); eq('1.5', 3, 2); eq(1.5, 3, 2); eq('½', 1, 2); eq('1½', 3, 2); eq('1 1/2', 3, 2); eq('1/4', 1, 4);
  eq(' 250 ', 250); eq(0.4, 2, 5); eq('0,75', 3, 4);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('viel'), null);
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount(true), null);
});

test('ja/nein in beliebiger Schreibweise, Standardwerte bei leer', () => {
  for (const v of ['ja', 'Ja', 'JA', ' ja ', 'x', true, 1]) assert.equal(toBool(v, false), true, String(v));
  for (const v of ['nein', 'Nein', 'NEIN', false, 0]) assert.equal(toBool(v, true), false, String(v));
  assert.equal(toBool('', true), true);
  assert.equal(toBool('', false), false);
  assert.equal(toBool('vielleicht', true), true);
});

test('Datum: ISO und TT.MM.JJJJ, ungueltig wird null', () => {
  assert.equal(parseDate('2026-11-18'), '2026-11-18');
  assert.equal(parseDate('2026-11-18T09:30:00'), '2026-11-18');
  assert.equal(parseDate('18.11.2026'), '2026-11-18');
  assert.equal(parseDate('5.1.2027'), '2027-01-05');
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('gestern'), null);
});

test('Einheiten, Namen und Sortierschluessel', () => {
  assert.deepEqual(['ML', 'el', 'Stk.', 'Gramm', 'Liter', 'Dosen', 'Scheibe'].map(normUnit), ['ml', 'EL', 'Stück', 'g', 'l', 'Dose', 'Scheibe']);
  assert.equal(nameKey('  zwiebel '), nameKey('Zwiebel'));
  assert.equal(nameKey('Rote   Zwiebel'), 'rote zwiebel');
  assert.equal(nameKey('Soße'), nameKey('SOSSE'));
  assert.equal(displayName(' zwiebel '), 'Zwiebel');
  assert.equal(displayName('TK-Spinat'), 'TK-Spinat');
  assert.deepEqual(['Zucker', 'Äpfel', 'Öl', 'Olive', 'Apfelsaft'].sort((a, b) => (collate(a) < collate(b) ? -1 : 1)),
    ['Äpfel', 'Apfelsaft', 'Öl', 'Olive', 'Zucker']);
});

test('Fehlende Werte fallen auf Standardwerte, Zeilen ohne id oder Name werden ignoriert', () => {
  const n = normalize({ Gerichte: [{ ID: 'A1', Name: ' Test ' }, { id: '' }], Zutaten: [{ gericht_id: 'A1', name: ' ', menge: 1 }, { gericht_id: 'A1', name: 'X' }] });
  assert.equal(n.gerichte.length, 1);
  assert.equal(n.gerichte[0].name, 'Test');
  assert.equal(n.gerichte[0].basis_portionen, 2);
  assert.equal(n.gerichte[0].aktiv, true);
  assert.equal(n.gerichte[0].favorit, false);
  assert.equal(n.gerichte[0].status, 'fertig');
  assert.equal(n.gerichte[0].kcal_pro_portion, null);
  assert.equal(n.gerichte[0].zutaten.length, 1);
  assert.equal(n.gerichte[0].zutaten[0].einkaufen, true);
  assert.equal(n.gerichte[0].zutaten[0].menge, null);
  assert.deepEqual(n.einstellungen, { standard_portionen: 2, wiederholungssperre_tage: 21 });
});
