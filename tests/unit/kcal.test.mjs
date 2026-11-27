import test from 'node:test';
import assert from 'node:assert/strict';
import { berechneKcalProPortion } from '../../app/js/core/kcal.js';
import { normalize } from '../../app/js/core/normalize.js';

// Hilfsfunktion: baut ein normalisiertes Gericht direkt (ohne Umweg ueber ein xlsx), passend zur Form aus normalize.js.
const gericht = (basis_portionen, kcal_pro_portion, zutaten) => ({ basis_portionen, kcal_pro_portion, zutaten });
const zutat = (name, menge, einheit) => ({ name, menge, einheit });

test('F24: bekannte Zutat in g wird direkt ueber Lebensmittel.kcal_je_100g umgerechnet', () => {
  const g = gericht(2, null, [zutat('Reis', 200, 'g')]);
  const lebensmittel = [{ name: 'Reis', kcal_je_100g: 130 }];
  const r = berechneKcalProPortion(g, lebensmittel, []);
  // 200 g * 130 kcal/100g = 260 kcal fuer 2 Portionen -> 130 kcal pro Portion
  assert.deepEqual(r, { kcal_pro_portion: 130, quelle: 'berechnet', ca: false, nicht_zuordenbar: 0 });
});

test('F24: bekannte Zutat in Stück wird erst ueber Richtgewichte in Gramm umgerechnet, dann ueber Lebensmittel', () => {
  const g = gericht(2, null, [zutat('Ei', 4, 'Stück')]);
  const lebensmittel = [{ name: 'Ei', kcal_je_100g: 155 }];
  const richtgewichte = [{ name: 'Ei', einheit: 'Stück', gramm: 55 }];
  const r = berechneKcalProPortion(g, lebensmittel, richtgewichte);
  // 4 Stück * 55 g = 220 g; 220 g * 155 kcal/100g = 341 kcal fuer 2 Portionen -> 170,5 kcal pro Portion
  assert.deepEqual(r, { kcal_pro_portion: 170.5, quelle: 'berechnet', ca: false, nicht_zuordenbar: 0 });
});

test('F24: unbekannte Zutat wird bei der Summe ausgelassen, Ergebnis bekommt "ca." und die Anzahl', () => {
  const g = gericht(1, null, [zutat('Reis', 100, 'g'), zutat('Drachenfrucht', 50, 'g')]);
  const lebensmittel = [{ name: 'Reis', kcal_je_100g: 130 }]; // Drachenfrucht fehlt absichtlich
  const r = berechneKcalProPortion(g, lebensmittel, []);
  assert.equal(r.kcal_pro_portion, 130, 'nur Reis zaehlt, Drachenfrucht wird ausgelassen');
  assert.equal(r.quelle, 'berechnet');
  assert.equal(r.ca, true);
  assert.equal(r.nicht_zuordenbar, 1);
});

test('F24: fehlt das Richtgewicht einer Stueck-Zutat, ist sie auch dann nicht zuordenbar, wenn Lebensmittel sie kennt', () => {
  const g = gericht(1, null, [zutat('Zwiebel', 1, 'Stück')]);
  const lebensmittel = [{ name: 'Zwiebel', kcal_je_100g: 40 }]; // bekannt, aber kein Richtgewicht fuer Stueck vorhanden
  const r = berechneKcalProPortion(g, lebensmittel, []);
  assert.equal(r.kcal_pro_portion, null);
  assert.equal(r.quelle, 'unbekannt');
  assert.equal(r.ca, true);
  assert.equal(r.nicht_zuordenbar, 1);
});

test('F24: kein einziger Treffer ergibt kcal_pro_portion = null mit quelle unbekannt (nicht raten)', () => {
  const g = gericht(1, null, [zutat('Unbekanntes Gemüse', 100, 'g')]);
  const r = berechneKcalProPortion(g, [], []);
  assert.deepEqual(r, { kcal_pro_portion: null, quelle: 'unbekannt', ca: true, nicht_zuordenbar: 1 });
});

test('F24: Zutat ohne Menge ("nach Geschmack") traegt nichts bei und zaehlt nicht als nicht zuordenbar', () => {
  const g = gericht(1, null, [zutat('Salz', null, 'Prise'), zutat('Pfeffer', '', '')]);
  const r = berechneKcalProPortion(g, [{ name: 'Salz', kcal_je_100g: 0 }], []);
  // Keine Zutat mit Menge vorhanden -> nichts berechenbar, aber auch nichts als "nicht zuordenbar" markiert.
  assert.deepEqual(r, { kcal_pro_portion: null, quelle: 'unbekannt', ca: false, nicht_zuordenbar: 0 });
});

test('F24: Zutat ohne Menge zaehlt auch dann nicht mit, wenn andere Zutaten berechnet werden', () => {
  const g = gericht(2, null, [zutat('Reis', 200, 'g'), zutat('Salz', null, 'Prise')]);
  const r = berechneKcalProPortion(g, [{ name: 'Reis', kcal_je_100g: 130 }], []);
  assert.equal(r.kcal_pro_portion, 130);
  assert.equal(r.ca, false);
  assert.equal(r.nicht_zuordenbar, 0, 'Salz ohne Menge ist nicht "nicht zuordenbar"');
});

test('F24: manuell gesetzter Wert bleibt unangetastet, manuell geht vor automatisch', () => {
  const g = gericht(2, 500, [zutat('Irgendwas', 100, 'g')]);
  // Lebensmittel/Richtgewichte wuerden ein anderes Ergebnis liefern, duerfen aber gar nicht erst betrachtet werden.
  const r = berechneKcalProPortion(g, [{ name: 'Irgendwas', kcal_je_100g: 999 }], []);
  assert.deepEqual(r, { kcal_pro_portion: 500, quelle: 'manuell', ca: false, nicht_zuordenbar: 0 });
});

test('F24: kg und l werden wie bei der Skalierung direkt umgerechnet (kg/l * 1000), nicht ueber Richtgewichte', () => {
  const kg = berechneKcalProPortion(gericht(1, null, [zutat('Kartoffeln', 1, 'kg')]), [{ name: 'Kartoffeln', kcal_je_100g: 77 }], []);
  assert.deepEqual(kg, { kcal_pro_portion: 770, quelle: 'berechnet', ca: false, nicht_zuordenbar: 0 });
  const l = berechneKcalProPortion(gericht(1, null, [zutat('Milch', 0.5, 'l')]), [{ name: 'Milch', kcal_je_100g: 64 }], []);
  assert.deepEqual(l, { kcal_pro_portion: 320, quelle: 'berechnet', ca: false, nicht_zuordenbar: 0 });
});

test('F24: Namensabgleich wie beim Einkaufszettel (ohne Gross-/Kleinschreibung, normalisierte Leerzeichen, D06)', () => {
  const g = gericht(1, null, [zutat('  ZWIEBEL   rote ', 100, 'g')]);
  const r = berechneKcalProPortion(g, [{ name: 'zwiebel rote', kcal_je_100g: 40 }], []);
  assert.equal(r.kcal_pro_portion, 40);
  assert.equal(r.quelle, 'berechnet');
});

test('F24: zusammen mit normalize.js - Lebensmittel/Richtgewichte aus Rohdaten gelesen und eingesetzt', () => {
  const norm = normalize({
    Gerichte: [{ id: 'G001', name: 'Testgericht', basis_portionen: 2 }],
    Zutaten: [
      { gericht_id: 'G001', pos: 1, name: 'Reis', menge: 200, einheit: 'g' },
      { gericht_id: 'G001', pos: 2, name: 'Ei', menge: 2, einheit: 'Stk.' },
    ],
    Lebensmittel: [{ name: 'Reis', kcal_je_100g: '130' }, { name: 'Ei', kcal_je_100g: 155 }],
    Richtgewichte: [{ name: 'Ei', einheit: 'STÜCK', gramm: 55 }],
  });
  assert.equal(norm.lebensmittel.length, 2);
  assert.equal(norm.richtgewichte.length, 1);
  assert.equal(norm.richtgewichte[0].einheit, 'Stück', 'Einheit wird wie bei Zutaten normalisiert');
  const r = berechneKcalProPortion(norm.gerichte[0], norm.lebensmittel, norm.richtgewichte);
  // Reis: 200g*130/100=260; Ei: 2*55g=110g, 110*155/100=170.5; Summe 430.5 / 2 Portionen = 215.25
  assert.equal(r.kcal_pro_portion, 215.25);
  assert.equal(r.quelle, 'berechnet');
  assert.equal(r.ca, false);
});
