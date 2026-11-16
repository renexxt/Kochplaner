import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredientLine, parseIngredients } from '../../app/js/core/parser.js';

const P = (t) => {
  const r = parseIngredientLine(t);
  return r && { name: r.name, menge: r.menge, einheit: r.einheit, ok: r.ok };
};

test('F12: die fuenf Beispiele aus dem Zieldokument', () => {
  assert.deepEqual(P('200 g Mehl'), { name: 'Mehl', menge: 200, einheit: 'g', ok: true });
  assert.deepEqual(P('1,5 l Milch'), { name: 'Milch', menge: 1.5, einheit: 'l', ok: true });
  assert.deepEqual(P('½ TL Salz'), { name: 'Salz', menge: 0.5, einheit: 'TL', ok: true });
  assert.deepEqual(P('2 Eier'), { name: 'Eier', menge: 2, einheit: 'Stück', ok: true });
  assert.deepEqual(P('1 Dose Tomaten'), { name: 'Tomaten', menge: 1, einheit: 'Dose', ok: true });
  assert.deepEqual(P('Prise Salz'), { name: 'Salz', menge: null, einheit: 'Prise', ok: true });
});

test('F12: weitere Schreibweisen (Diktat ohne Leerzeichen, Zahlwoerter, Brueche, Aufzaehlungszeichen)', () => {
  assert.deepEqual(P('200g Butter'), { name: 'Butter', menge: 200, einheit: 'g', ok: true });
  assert.deepEqual(P('1.5 kg Kartoffeln'), { name: 'Kartoffeln', menge: 1.5, einheit: 'kg', ok: true });
  assert.deepEqual(P('zwei Eier'), { name: 'Eier', menge: 2, einheit: 'Stück', ok: true });
  assert.deepEqual(P('ein Bund Petersilie'), { name: 'Petersilie', menge: 1, einheit: 'Bund', ok: true });
  assert.deepEqual(P('eine halbe Zitrone'), { name: 'Zitrone', menge: 0.5, einheit: 'Stück', ok: true });
  assert.deepEqual(P('1 1/2 EL Öl'), { name: 'Öl', menge: 1.5, einheit: 'EL', ok: true });
  assert.deepEqual(P('2 Esslöffel Honig'), { name: 'Honig', menge: 2, einheit: 'EL', ok: true });
  assert.deepEqual(P('- 100 Gramm Zucker'), { name: 'Zucker', menge: 100, einheit: 'g', ok: true });
  assert.deepEqual(P('1 Packung Hefe'), { name: 'Hefe', menge: 1, einheit: 'Packung', ok: true });
  assert.deepEqual(P('eine Prise Salz'), { name: 'Salz', menge: null, einheit: 'Prise', ok: true });
  assert.deepEqual(P('etwas Pfeffer'), { name: 'Pfeffer', menge: null, einheit: '', ok: true });
  assert.deepEqual(P('Pfeffer nach Geschmack'), { name: 'Pfeffer', menge: null, einheit: '', ok: true });
  assert.deepEqual(P('Salz'), { name: 'Salz', menge: null, einheit: '', ok: true });
  assert.deepEqual(P('200 g mehl'), { name: 'Mehl', menge: 200, einheit: 'g', ok: true });
});

test('F12: unklare Zeilen werden markiert, nicht verworfen', () => {
  for (const t of ['2-3 Zwiebeln', '250 g', 'Mehl g', '200', '5 ml']) {
    const r = parseIngredientLine(t);
    assert.equal(r.ok, false, t);
    assert.ok(r.grund.length > 5, t);
    assert.equal(r.original, t);
  }
  assert.equal(parseIngredientLine('   '), null);
  assert.equal(parseIngredientLine(''), null);
});

test('F12: mehrere Zeilen, Semikolon als Trenner, leere Zeilen werden uebersprungen', () => {
  const r = parseIngredients('200 g Mehl\n\n2 Eier\r\n1,5 l Milch; Prise Salz\n2-3 Zwiebeln');
  assert.deepEqual(r.map((x) => x.name), ['Mehl', 'Eier', 'Milch', 'Salz', 'Zwiebeln']);
  assert.deepEqual(r.map((x) => x.ok), [true, true, true, true, false]);
  assert.equal(r.length, 5);
});
