// F25 Ausgaben erfassen: Validierung des Betrags (D03, D59) und Sortierung der Liste.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBetrag, betragGueltig, BETRAG_MAX, sortAusgaben } from '../../app/js/core/expenses.js';

test('parseBetrag: Zahl, Dezimalkomma und -punkt, Leerzeichen am Rand', () => {
  assert.equal(parseBetrag('23,50'), 23.5);
  assert.equal(parseBetrag('23.50'), 23.5);
  assert.equal(parseBetrag('  23,50  '), 23.5);
  assert.equal(parseBetrag(23.5), 23.5);
  assert.equal(parseBetrag('0'), 0);
  assert.equal(parseBetrag(0), 0);
});

test('parseBetrag: leer, nicht lesbar oder falscher Typ ergibt null', () => {
  assert.equal(parseBetrag(''), null);
  assert.equal(parseBetrag('   '), null);
  assert.equal(parseBetrag(null), null);
  assert.equal(parseBetrag(undefined), null);
  assert.equal(parseBetrag('abc'), null);
  assert.equal(parseBetrag('12,50 €'), null);
  assert.equal(parseBetrag(true), null);
  assert.equal(parseBetrag('-5'), null);
  assert.equal(parseBetrag(NaN), null);
});

test('parseBetrag: mehrdeutiger Tausenderpunkt wie bei Mengen/kcal nicht extra geprueft (Backend validiert Bereich, nicht Eindeutigkeit)', () => {
  // Bewusst anders als core/parse.js parseAmount: hier geht es nur um Geldbetraege, keine Bruch-/Mengensyntax.
  assert.equal(parseBetrag('1/2'), null);
  assert.equal(parseBetrag('½'), null);
});

test('betragGueltig: groesser als 0, hoechstens BETRAG_MAX', () => {
  assert.equal(betragGueltig(parseBetrag('23,50')), true);
  assert.equal(betragGueltig(0), false);
  assert.equal(betragGueltig(-5), false);
  assert.equal(betragGueltig(BETRAG_MAX), true);
  assert.equal(betragGueltig(BETRAG_MAX + 0.01), false);
  assert.equal(betragGueltig(null), false);
  assert.equal(betragGueltig(undefined), false);
  assert.equal(betragGueltig(NaN), false);
});

test('sortAusgaben: neueste (angelegt_am) zuerst, Original bleibt unveraendert', () => {
  const l = [
    { datum: '2026-11-10', betrag: 10, beschreibung: 'A', angelegt_am: '2026-11-10T08:00:00' },
    { datum: '2026-11-12', betrag: 20, beschreibung: 'B', angelegt_am: '2026-11-12T08:00:00' },
    { datum: '2026-11-11', betrag: 30, beschreibung: 'C', angelegt_am: '2026-11-11T08:00:00' },
  ];
  const kopie = JSON.stringify(l);
  assert.deepEqual(sortAusgaben(l).map((x) => x.beschreibung), ['B', 'C', 'A']);
  assert.equal(JSON.stringify(l), kopie, 'sortAusgaben aendert die uebergebene Liste nicht');
});

test('sortAusgaben: gleiche angelegt_am-Sekunde (zwei Ausgaben kurz nacheinander) - die zuletzt angelegte Zeile bleibt oben', () => {
  // ausgaben_lesen liefert Zeilen immer in Anlege-Reihenfolge (Append-only); bei Zeitstempel-Gleichstand
  // (Sekundenaufloesung) muss die spaeter angelegte (hinten in der Liste) trotzdem oben erscheinen.
  const l = [
    { datum: '2026-10-05', betrag: 45.9, beschreibung: 'Zuerst', angelegt_am: '2026-11-20T18:00:05' },
    { datum: '2026-11-20', betrag: 12.3, beschreibung: 'Danach', angelegt_am: '2026-11-20T18:00:05' },
  ];
  assert.deepEqual(sortAusgaben(l).map((x) => x.beschreibung), ['Danach', 'Zuerst']);
});
