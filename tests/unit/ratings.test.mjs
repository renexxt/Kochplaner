import test from 'node:test';
import assert from 'node:assert/strict';
import { ratingStats, ranking, weights, upsertRating } from '../../app/js/core/ratings.js';
import { golden, FILES, loadNorm } from './helpers.mjs';

for (const stem of FILES) {
  test(`F22/F23 Statistik, Rangliste und Gewichte stimmen mit dem Orakel: ${stem}`, () => {
    const norm = loadNorm(stem);
    const g = golden(`${stem}.bewertung.json`);
    const stats = {};
    for (const [id, s] of ratingStats(norm)) stats[id] = { anzahl: s.anzahl, durchschnitt: s.durchschnitt };
    assert.deepEqual(stats, g.statistik);
    assert.deepEqual(ranking(norm), g.rangliste);
    assert.deepEqual(weights(norm), g.gewichte);
  });
}

test('F23: Einzelbewertung ohne Wirkung, Gewichte multiplizieren sich', () => {
  const w = weights(loadNorm('kochplaner_test'));
  assert.equal(w.G011, 1); // nur eine 5-Sterne-Bewertung
  assert.equal(w.G003, 3); // Favorit x2, Durchschnitt 4,67 x1,5
  assert.equal(w.G001, 2); // Favorit, Durchschnitt 3,33
  assert.equal(w.G024, 0.5); // Durchschnitt 2,0
  assert.equal(w.G002, 1);
});

test('F22: erneutes Bewerten desselben Tages ueberschreibt, zwei Personen zaehlen getrennt', () => {
  let l = [];
  l = upsertRating(l, { gericht_id: 'G001', datum: '2026-11-14', sterne: 3, von: 'René' });
  l = upsertRating(l, { gericht_id: 'G001', datum: '2026-11-14', sterne: 5, notiz: 'besser', von: 'René' });
  assert.equal(l.length, 1);
  assert.equal(l[0].sterne, 5);
  l = upsertRating(l, { gericht_id: 'G001', datum: '2026-11-14', sterne: 2, von: 'Partnerin' });
  assert.equal(l.length, 2);
  assert.throws(() => upsertRating(l, { gericht_id: 'G001', datum: '2026-11-14', sterne: 6 }), RangeError);
  assert.throws(() => upsertRating(l, { gericht_id: 'G001', datum: '2026-11-14', sterne: 0 }), RangeError);
});
