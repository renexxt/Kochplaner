import test from 'node:test';
import assert from 'node:assert/strict';
import { proposePlan, proposeBeilage, rerollDay, rerollBeilage, mulberry32, seedFrom, recentIds, ShuffleError, weightedOrder } from '../../app/js/core/shuffle.js';
import { emptySlots, setDish, setBeilage, toggleFix } from '../../app/js/core/plan.js';
import { eligibleIds, selectableIds } from '../../app/js/core/normalize.js';
import { loadNorm } from './helpers.mjs';

const START = '2026-11-18';
const plan = (norm, tag, i, start = START, slots = emptySlots(start, 2)) =>
  proposePlan({ norm, startIso: start, slots, history: norm.plan, seed: seedFrom(`${tag}#${i}`) });
const ids = (r) => r.slots.map((s) => s.gericht_id);
const many = (norm, n, tag, start = START) => Array.from({ length: n }, (_, i) => ids(plan(norm, tag, i, start)));
const counts = (runs) => {
  const c = new Map();
  for (const r of runs) for (const id of r) c.set(id, (c.get(id) || 0) + 1);
  return c;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test('F02: 1000 Plaene, je 7 Gerichte, nur aktive, fertige, ohne nie_wieder, keine Wiederholung', () => {
  const norm = loadNorm('kochplaner_test');
  const ok = new Set(eligibleIds(norm));
  assert.equal(ok.size, 32); // 40 Gerichte - 4 inaktiv - 3 nie_wieder - 1 idee
  for (const r of many(norm, 1000, 'valid')) {
    assert.equal(r.length, 7);
    assert.equal(new Set(r).size, 7, 'keine Wiederholung');
    for (const id of r) assert.ok(ok.has(id), id);
  }
});

test('Modus "diaet"/"lecker": eligibleIds filtert ueber den Tag "diät" (Gross-/Kleinschreibung egal)', () => {
  const norm = loadNorm('kochplaner_test');
  const alle = new Set(eligibleIds(norm));
  const diaet = new Set(eligibleIds(norm, 'diaet'));
  const lecker = new Set(eligibleIds(norm, 'lecker'));
  assert.deepEqual(diaet, new Set(['G012', 'G025', 'G028'])); // G012: "Fisch,diät", G025: "...,diät", G028: "...,Diät"
  assert.equal(lecker.size, alle.size - diaet.size);
  for (const id of lecker) assert.ok(!diaet.has(id), id);
  assert.deepEqual(new Set(eligibleIds(norm, 'alle')), alle);
});

test('Modus "diaet": proposePlan waehlt nur Diaet-Gerichte, Modus "lecker" schliesst sie aus', () => {
  const norm = loadNorm('kochplaner_test');
  const diaetIds = ['G012', 'G025', 'G028'];
  for (let i = 0; i < 50; i++) {
    const rDiaet = proposePlan({ norm, startIso: START, slots: emptySlots(START, 2), history: [], seed: i, modus: 'diaet' });
    for (const id of ids(rDiaet)) assert.ok(diaetIds.includes(id), id);
    assert.equal(rDiaet.warnung, 'WENIGER_ALS_7');
    const rLecker = proposePlan({ norm, startIso: START, slots: emptySlots(START, 2), history: [], seed: i, modus: 'lecker' });
    for (const id of ids(rLecker)) assert.ok(!diaetIds.includes(id), id);
  }
});

test('Modus "diaet": rerollDay bleibt innerhalb der Diaet-Gerichte', () => {
  const norm = loadNorm('kochplaner_test');
  const diaetIds = ['G012', 'G025', 'G028'];
  const slots = emptySlots(START, 2);
  for (let i = 0; i < 50; i++) {
    const r = rerollDay({ norm, startIso: START, slots, index: 0, history: [], seed: i, modus: 'diaet' });
    assert.ok(diaetIds.includes(r.slots[0].gericht_id), r.slots[0].gericht_id);
  }
});

// Fuer die Beilage-Tests: ein Teil der Gerichte wird im Speicher zu Beilagen umetikettiert (die Testdatei selbst
// hat keine, siehe D0x-Vorschlag in der PR-Beschreibung). Alle gewaehlten Gerichte sind aktiv/fertig/nicht nie_wieder.
const withTyp = (norm, ids, typ) => ({ ...norm, gerichte: norm.gerichte.map((g) => (ids.includes(g.id) ? { ...g, typ } : g)) });
const BEILAGEN = ['G001', 'G002', 'G003', 'G004', 'G005', 'G006', 'G007', 'G008', 'G009', 'G010'];

test('Beilage: eligibleIds/selectableIds mit typ="beilage" liefern nur die als Beilage markierten Gerichte', () => {
  const norm = withTyp(loadNorm('kochplaner_test'), BEILAGEN, 'beilage');
  assert.deepEqual(new Set(eligibleIds(norm, 'alle', 'beilage')), new Set(BEILAGEN));
  assert.deepEqual(new Set(selectableIds(norm, 'beilage')), new Set(BEILAGEN));
  // Hauptgericht-Pool (Standard) schliesst die Beilagen jetzt aus
  assert.equal(new Set(eligibleIds(norm)).has('G001'), false);
  assert.equal(eligibleIds(norm).length, eligibleIds(loadNorm('kochplaner_test')).length - BEILAGEN.length);
});

test('Beilage: proposeBeilage fuellt nur beilage_id, nie gericht_id, nur aus dem Beilage-Pool, ohne Wiederholung', () => {
  const norm = withTyp(loadNorm('kochplaner_test'), BEILAGEN, 'beilage');
  const r = proposeBeilage({ norm, startIso: START, slots: emptySlots(START, 2), history: [], seed: 1 });
  assert.equal(r.slots.length, 7);
  assert.equal(r.slots.every((s) => s.gericht_id === null), true, 'proposeBeilage ruehrt gericht_id nicht an');
  const chosen = r.slots.map((s) => s.beilage_id);
  assert.equal(new Set(chosen).size, 7, 'keine Wiederholung bei genug Beilagen');
  for (const id of chosen) assert.ok(BEILAGEN.includes(id), id);
});

test('Beilage: proposePlan (Hauptgericht) und proposeBeilage stoeren sich nicht, auch nicht nacheinander auf denselben Slots', () => {
  const norm = withTyp(loadNorm('kochplaner_test'), BEILAGEN, 'beilage');
  const nachHaupt = proposePlan({ norm, startIso: START, slots: emptySlots(START, 2), history: [], seed: 7 }).slots;
  assert.ok(nachHaupt.every((s) => s.beilage_id === null));
  const nachBeilage = proposeBeilage({ norm, startIso: START, slots: nachHaupt, history: [], seed: 8 }).slots;
  // Hauptgericht-Wahl bleibt unveraendert, nur beilage_id kommt dazu
  nachBeilage.forEach((s, i) => assert.equal(s.gericht_id, nachHaupt[i].gericht_id));
  assert.equal(nachBeilage.every((s) => s.beilage_id !== null), true);
  for (const s of nachBeilage) {
    assert.ok(BEILAGEN.includes(s.beilage_id));
    assert.ok(!BEILAGEN.includes(s.gericht_id), 'Hauptgericht ist nie eine Beilage');
  }
});

test('Beilage: rerollBeilage aendert nur die Beilage des einen Tages, gericht_id und andere Tage bleiben unberuehrt', () => {
  const norm = withTyp(loadNorm('kochplaner_test'), BEILAGEN, 'beilage');
  let slots = proposePlan({ norm, startIso: START, slots: emptySlots(START, 2), history: [], seed: 2 }).slots;
  slots = proposeBeilage({ norm, startIso: START, slots, history: [], seed: 3 }).slots;
  const r = rerollBeilage({ norm, startIso: START, slots, index: 2, history: [], seed: 40 });
  assert.equal(r.geaendert, true);
  r.slots.forEach((s, i) => {
    assert.equal(s.gericht_id, slots[i].gericht_id);
    if (i !== 2) assert.equal(s.beilage_id, slots[i].beilage_id);
  });
  assert.notEqual(r.slots[2].beilage_id, slots[2].beilage_id);
});

test('Beilage: ein fixierter Tag wird von rerollBeilage nicht veraendert (wie rerollDay beim Hauptgericht)', () => {
  const norm = withTyp(loadNorm('kochplaner_test'), BEILAGEN, 'beilage');
  let slots = setDish(emptySlots(START, 2), 3, 'G020');
  slots = setBeilage(slots, 3, 'G001');
  slots = toggleFix(slots, 3);
  const r = rerollBeilage({ norm, startIso: START, slots, index: 3, history: [], seed: 5 });
  assert.equal(r.geaendert, false);
  assert.deepEqual(r.slots, slots);
});

test('Beilage: proposeBeilage fuellt eine fehlende Beilage an einem fixierten Tag, ohne "fixiert" zurueckzusetzen', () => {
  // Anders als proposePlan beim Hauptgericht: ein fixierter Tag ohne Beilage bekommt eine, bleibt aber fixiert
  // (fixiert gehoert zum ganzen Tag/Hauptgericht, nicht nur zur Beilage).
  const norm = withTyp(loadNorm('kochplaner_test'), BEILAGEN, 'beilage');
  let slots = setDish(emptySlots(START, 2), 3, 'G020');
  slots = toggleFix(slots, 3);
  assert.equal(slots[3].beilage_id, null);
  const r = proposeBeilage({ norm, startIso: START, slots, history: [], seed: 11 });
  assert.equal(r.slots[3].fixiert, true, 'fixiert bleibt erhalten');
  assert.equal(r.slots[3].gericht_id, 'G020', 'Hauptgericht des fixierten Tages unveraendert');
  assert.ok(BEILAGEN.includes(r.slots[3].beilage_id), 'die zuvor leere Beilage wurde gefuellt');
});

test('Beilage: recentIds mit feld "beilage_id" fuehrt eine eigene Sperrfrist-Historie, unabhaengig vom Hauptgericht', () => {
  const h = [{ datum: '2026-11-10', gericht_id: 'G001', beilage_id: 'G002' }, { datum: '2026-11-12', gericht_id: 'G003', beilage_id: '' }];
  assert.deepEqual([...recentIds(h, START, 21)], ['G001', 'G003']);
  assert.deepEqual([...recentIds(h, START, 21, 'beilage_id')], ['G002']);
});

test('F02: gleicher Seed ergibt denselben Plan, auch bei anderer Reihenfolge der Gerichte; andere Seeds streuen', () => {
  const norm = loadNorm('kochplaner_test');
  const rev = { ...norm, gerichte: norm.gerichte.slice().reverse() };
  const a = ids(plan(norm, 'det', 1));
  assert.deepEqual(ids(plan(norm, 'det', 1)), a);
  assert.deepEqual(ids(plan(rev, 'det', 1)), a);
  assert.equal(new Set(many(norm, 100, 'streuung').map((r) => r.join())).size, 100);
});

test('F02: Favoriten kommen mindestens 1,5-mal so oft vor (1000 Laeufe, ohne Bewertungen)', () => {
  const norm = { ...loadNorm('kochplaner_test'), bewertungen: [] };
  const c = counts(many(norm, 1000, 'fav'));
  const el = norm.gerichte.filter((g) => eligibleIds(norm).includes(g.id));
  const fav = mean(el.filter((g) => g.favorit).map((g) => c.get(g.id) || 0));
  const rest = mean(el.filter((g) => !g.favorit).map((g) => c.get(g.id) || 0));
  assert.ok(fav / rest >= 1.5, `Verhaeltnis ${(fav / rest).toFixed(2)}`);
});

test('F02: Favoriten-Verhaeltnis gilt auch mit Bewertungen', () => {
  const norm = loadNorm('kochplaner_test');
  const c = counts(many(norm, 1000, 'fav2'));
  const el = norm.gerichte.filter((g) => eligibleIds(norm).includes(g.id));
  const fav = mean(el.filter((g) => g.favorit).map((g) => c.get(g.id) || 0));
  const rest = mean(el.filter((g) => !g.favorit).map((g) => c.get(g.id) || 0));
  assert.ok(fav / rest >= 1.5, `Verhaeltnis ${(fav / rest).toFixed(2)}`);
});

test('F23: ein Gericht mit Durchschnitt bis 2 kommt hoechstens 0,75-mal so oft vor wie ein unbewertetes (1000 Laeufe)', () => {
  const norm = loadNorm('kochplaner_test');
  const c = counts(many(norm, 1000, 'low'));
  const low = ['G024', 'G035']; // je 2 Bewertungen, Durchschnitt 2,0 und 1,5, beide vorschlagbar
  for (const id of low) assert.ok(eligibleIds(norm).includes(id), id);
  const rated = new Set(norm.bewertungen.map((b) => b.gericht_id));
  const unrated = norm.gerichte.filter((g) => eligibleIds(norm).includes(g.id) && !rated.has(g.id) && !g.favorit).map((g) => g.id);
  const r = mean(low.map((id) => c.get(id) || 0)) / mean(unrated.map((id) => c.get(id) || 0));
  assert.ok(r <= 0.75, `Verhaeltnis ${r.toFixed(2)}`);
  assert.ok(r > 0.3, `Gericht wird nicht ganz ausgeschlossen: ${r.toFixed(2)}`);
});

test('F02: Gerichte der letzten 21 Tage kommen nicht vor, solange genug andere da sind (Ben und Clara)', () => {
  const norm = loadNorm('profile_ben_clara');
  const start = '2026-11-20';
  const hist = new Set(norm.plan.map((p) => p.gericht_id));
  assert.equal(hist.size, 14);
  assert.deepEqual([...recentIds(norm.plan, start, 21)].sort(), [...hist].sort());
  for (const r of many(norm, 300, 'bc', start)) {
    assert.equal(new Set(r).size, 7);
    for (const id of r) assert.ok(!hist.has(id), `${id} war in den letzten 21 Tagen dran`);
  }
});

test('F02: Sperrfrist genau 21 Tage: Tag -21 zaehlt, Tag -22 nicht, der Starttag selbst nicht', () => {
  const h = [{ datum: '2026-10-28', gericht_id: 'A' }, { datum: '2026-10-27', gericht_id: 'B' }, { datum: '2026-11-18', gericht_id: 'C' },
    { datum: '2026-11-17', gericht_id: 'D' }];
  assert.deepEqual([...recentIds(h, '2026-11-18', 21)].sort(), ['A', 'D']);
});

test('F02: weniger als 7 passende Gerichte (Weber, 6 aktiv, alle in der Sperrfrist): 7 Tage, jedes Gericht mindestens einmal, genau eine Wiederholung', () => {
  const norm = loadNorm('profile_weber');
  for (const r of many(norm, 100, 'weber', '2026-12-30')) {
    assert.equal(r.length, 7);
    assert.equal(new Set(r).size, 6);
  }
  assert.equal(plan(norm, 'weber', 0, '2026-12-30').warnung, 'WENIGER_ALS_7');
});

test('F02: Sperrfrist-Gerichte werden nur gebraucht, wenn sonst weniger als 7 uebrig bleiben', () => {
  // 8 passende Gerichte, 3 davon in der Sperrfrist -> 5 frei, es muessen 2 Sperrfrist-Gerichte einspringen
  const norm = loadNorm('edge_noingredients');
  const hist = ['G001', 'G002', 'G003'].map((gericht_id, i) => ({ datum: `2026-11-1${i}`, gericht_id }));
  for (let i = 0; i < 200; i++) {
    const r = ids(proposePlan({ norm, startIso: START, slots: emptySlots(START, 2), history: hist, seed: i }));
    assert.equal(new Set(r).size, 7);
    for (const free of ['G004', 'G005', 'G006', 'G007', 'G008']) assert.ok(r.includes(free), free);
  }
});

test('F02: drei passende Gerichte ergeben trotzdem 7 Tage mit Warnung', () => {
  const norm = { ...loadNorm('kochplaner_test') };
  norm.gerichte = norm.gerichte.map((g) => ({ ...g, aktiv: ['G001', 'G002', 'G003'].includes(g.id) }));
  const r = plan(norm, 'drei', 0);
  assert.equal(r.slots.length, 7);
  assert.equal(r.warnung, 'WENIGER_ALS_7');
  for (const id of ['G001', 'G002', 'G003']) assert.ok(ids(r).filter((x) => x === id).length >= 2);
});

test('F16: leeres Sheet liefert einen klaren Fehler statt eines Absturzes', () => {
  const norm = loadNorm('edge_empty');
  assert.throws(() => plan(norm, 'leer', 0), (e) => e instanceof ShuffleError && e.code === 'KEINE_GERICHTE');
});

test('F03: fixierte Tage bleiben bei "Alle neu wuerfeln", die uebrigen sind verschieden und andere Gerichte', () => {
  const norm = loadNorm('kochplaner_test');
  for (let i = 0; i < 200; i++) {
    let slots = proposePlan({ norm, startIso: START, slots: emptySlots(START, 2), history: [], seed: i }).slots;
    slots = toggleFix(toggleFix(slots, 2), 5);
    const keep2 = slots[2].gericht_id, keep5 = slots[5].gericht_id;
    const again = proposePlan({ norm, startIso: START, slots, history: [], seed: 1000 + i }).slots;
    assert.equal(again[2].gericht_id, keep2);
    assert.equal(again[5].gericht_id, keep5);
    assert.ok(again[2].fixiert && again[5].fixiert);
    assert.equal(new Set(again.map((s) => s.gericht_id)).size, 7);
  }
});

test('F03: Portionen pro Tag bleiben beim Neuwuerfeln erhalten', () => {
  const norm = loadNorm('kochplaner_test');
  const slots = emptySlots(START, 2).map((s, i) => ({ ...s, portionen: i + 1 }));
  const r = proposePlan({ norm, startIso: START, slots, history: [], seed: 5 }).slots;
  assert.deepEqual(r.map((s) => s.portionen), [1, 2, 3, 4, 5, 6, 7]);
});

test('F03: "Neu wuerfeln" fuer einen Tag aendert nur diesen Tag, nimmt kein Gericht aus den anderen Tagen', () => {
  const norm = loadNorm('kochplaner_test');
  for (let i = 0; i < 200; i++) {
    const slots = proposePlan({ norm, startIso: START, slots: emptySlots(START, 2), history: [], seed: i }).slots;
    const idx = i % 7;
    const r = rerollDay({ norm, startIso: START, slots, index: idx, history: [], seed: 77 + i });
    assert.equal(r.geaendert, true);
    r.slots.forEach((s, j) => { if (j !== idx) assert.deepEqual(s, slots[j]); });
    assert.notEqual(r.slots[idx].gericht_id, slots[idx].gericht_id);
    assert.equal(new Set(r.slots.map((s) => s.gericht_id)).size, 7);
  }
});

test('F03: ein fixierter Tag wird nicht neu gewuerfelt', () => {
  const norm = loadNorm('kochplaner_test');
  let slots = proposePlan({ norm, startIso: START, slots: emptySlots(START, 2), history: [], seed: 3 }).slots;
  slots = toggleFix(slots, 4);
  const r = rerollDay({ norm, startIso: START, slots, index: 4, history: [], seed: 9 });
  assert.equal(r.geaendert, false);
  assert.deepEqual(r.slots, slots);
});

test('Zufallsgenerator: gleicher Seed gleiche Folge, Werte in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 1000; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
  assert.notEqual(seedFrom('a'), seedFrom('b'));
  assert.deepEqual(weightedOrder(['b', 'a', 'c'], () => 1, mulberry32(1)), weightedOrder(['c', 'a', 'b'], () => 1, mulberry32(1)));
});
