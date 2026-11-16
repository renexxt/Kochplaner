import test from 'node:test';
import assert from 'node:assert/strict';
import { shoppingList, kcalTotal } from '../../app/js/core/shopping.js';
import { weekDays } from '../../app/js/core/dates.js';
import { golden, readJson, loadNorm } from './helpers.mjs';

const scen = readJson('data', 'scenarios.json');
const gold = golden('einkauf.json');
const normCache = new Map();
const normOf = (datei) => {
  const stem = datei.replace(/\.xlsx$/, '');
  if (!normCache.has(stem)) normCache.set(stem, loadNorm(stem));
  return normCache.get(stem);
};

for (const s of scen) {
  test(`F06 Einkaufszettel stimmt mit dem Orakel: ${s.id}`, () => {
    const norm = normOf(s.datei);
    const got = shoppingList(norm, s.tage);
    const exp = gold[s.id].einkauf;
    assert.equal(got.items.length, exp.items.length, 'Anzahl Eintraege');
    got.items.forEach((it, i) => {
      const e = exp.items[i];
      assert.equal(it.key, e.key, `Eintrag ${i}`);
      assert.equal(it.einheit, e.einheit, e.anzeige);
      if (e.menge === null) assert.equal(it.menge, null, e.anzeige);
      else {
        assert.ok(Math.abs(it.menge - e.menge) <= 0.01, `${e.anzeige}: ${it.menge}`);
        assert.ok(Math.abs(it.menge_exakt - e.menge_exakt) <= 0.01, `${e.anzeige}: exakt ${it.menge_exakt}`);
      }
    });
    assert.deepEqual(got.zeilen, exp.zeilen, 'Zeilen (Reihenfolge und Text)');
  });

  test(`F04 Tagesansicht und kcal stimmen mit dem Orakel: ${s.id}`, () => {
    const norm = normOf(s.datei);
    const days = weekDays(s.start);
    s.tage.forEach((t, i) => {
      const g = norm.gerichte.find((x) => x.id === t.gericht_id);
      const e = gold[s.id].tage[i];
      assert.equal(days[i].anzeige, e.anzeige);
      assert.equal(g.name, e.name);
      assert.equal(g.kcal_pro_portion, e.kcal_pro_portion);
      assert.equal(kcalTotal(g, t.portionen), e.kcal_gesamt);
    });
  });
}

test('F05: Portionen 2 -> 5 -> 2 liefert exakt die Ausgangswerte, kcal pro Portion bleibt gleich (alle Gerichte)', () => {
  const norm = loadNorm('kochplaner_test');
  for (const g of norm.gerichte) {
    const a = shoppingList(norm, [{ gericht_id: g.id, portionen: 2 }]);
    const b = shoppingList(norm, [{ gericht_id: g.id, portionen: 5 }]);
    const c = shoppingList(norm, [{ gericht_id: g.id, portionen: 2 }]);
    assert.deepEqual(a, c, g.id);
    // Zutaten ohne Menge skalieren nicht: sie stehen in beiden Listen unveraendert
    const noAmt = (l) => l.items.filter((i) => i.menge === null).map((i) => i.anzeige);
    assert.deepEqual(noAmt(a), noAmt(b), g.id);
    assert.equal(kcalTotal(g, 5) === null ? null : kcalTotal(g, 5) / 5, g.kcal_pro_portion);
  }
});

test('F05: Skalierung hat nur Faktor portionen / basis, Probe an G001 und G037', () => {
  const norm = loadNorm('kochplaner_test');
  const l1 = shoppingList(norm, [{ gericht_id: 'G001', portionen: 5 }]).zeilen;
  assert.ok(l1.includes('625 g Spaghetti'));
  assert.ok(l1.includes('2,5 Stück Zwiebel'));
  const l2 = shoppingList(norm, [{ gericht_id: 'G037', portionen: 6 }]).zeilen; // Basis 6
  assert.ok(l2.includes('900 g Rindfleisch'));
  assert.ok(l2.includes('1 kg Kartoffeln'));
  assert.ok(l2.includes('2 l Gemüsebrühe'));
});

test('F06: Handrechnung (nicht aus dem Orakel)', () => {
  const norm = loadNorm('kochplaner_test');
  const z = shoppingList(norm, [['G005', 2], ['G037', 3], ['G009', 2], ['G034', 4], ['G013', 2], ['G023', 4], ['G029', 2]]
    .map(([gericht_id, portionen]) => ({ gericht_id, portionen }))).zeilen;
  assert.ok(z.includes('3,2 kg Kartoffeln'));
  assert.ok(z.includes('4,1 l Gemüsebrühe'));
  assert.ok(!z.some((l) => l.includes('Wasser')));
  const s = shoppingList(norm, [['G001', 3], ['G004', 3], ['G015', 3], ['G002', 1], ['G026', 5], ['G010', 1], ['G021', 3]]
    .map(([gericht_id, portionen]) => ({ gericht_id, portionen }))).zeilen;
  assert.ok(s.includes('5 Stück Zwiebel')); // 1,5 + 0,75 + 2,5 = 4,75 -> 5
  assert.ok(s.includes('18,5 Stück Eier'));
});

test('Unbekanntes Gericht im Plan gibt einen klaren Fehler', () => {
  const norm = loadNorm('kochplaner_test');
  assert.throws(() => shoppingList(norm, [{ gericht_id: 'X999', portionen: 2 }]), /nicht gefunden/);
});

test('Leere Plaene und Gerichte ohne Zutaten brechen nichts', () => {
  const norm = loadNorm('edge_noingredients');
  assert.deepEqual(shoppingList(norm, []).zeilen, []);
  assert.ok(shoppingList(norm, [{ gericht_id: 'G004', portionen: 2 }]).zeilen.length === 0);
});
