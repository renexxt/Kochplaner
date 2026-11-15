// Bewertungen: Durchschnitt, Rangliste, Shuffle-Gewichte (Festlegungen D11 bis D13).
import { Fr } from './fraction.js';
import { collate, cmpStr } from './parse.js';

export function ratingStats(norm) {
  const by = new Map();
  for (const b of norm.bewertungen) {
    if (!by.has(b.gericht_id)) by.set(b.gericht_id, []);
    by.get(b.gericht_id).push(b.sterne);
  }
  const out = new Map();
  for (const [gid, v] of by) {
    const sum = v.reduce((a, b) => a + b, 0);
    out.set(gid, { anzahl: v.length, _avg: Fr.of(sum, v.length), durchschnitt: Math.round((sum / v.length) * 1e4) / 1e4 });
  }
  return out;
}

export function ranking(norm) {
  const stats = ratingStats(norm);
  const names = new Map(norm.gerichte.map((g) => [g.id, g.name]));
  const rows = [...stats].filter(([gid, s]) => s.anzahl >= 2 && names.has(gid));
  rows.sort((a, b) => -a[1]._avg.cmp(b[1]._avg) || b[1].anzahl - a[1].anzahl
    || cmpStr(collate(names.get(a[0])), collate(names.get(b[0]))) || cmpStr(a[0], b[0]));
  const n = rows.length;
  const k = Math.min(5, Math.ceil(n / 2));
  const m = Math.min(5, Math.floor(n / 2));
  return {
    alle: rows.map(([gericht_id, s]) => ({ gericht_id, anzahl: s.anzahl, durchschnitt: s.durchschnitt })),
    beste: rows.slice(0, k).map((r) => r[0]),
    schwaechste: m ? rows.slice(n - m).reverse().map((r) => r[0]) : [],
  };
}

// Gewicht = 1, Favorit x2, Durchschnitt >= 4 x1,5, Durchschnitt <= 2 x0,5 (die beiden letzten erst ab 2 Bewertungen)
export function weights(norm) {
  const stats = ratingStats(norm);
  const out = {};
  for (const g of norm.gerichte) {
    let w = Fr.ONE;
    if (g.favorit) w = w.mul(Fr.of(2));
    const s = stats.get(g.id);
    if (s && s.anzahl >= 2) {
      if (s._avg.gte(Fr.of(4))) w = w.mul(Fr.of(3, 2));
      if (s._avg.lte(Fr.of(2))) w = w.mul(Fr.of(1, 2));
    }
    out[g.id] = w.toNumber();
  }
  return out;
}

// Bewertung speichern (F22): gleiche (Gericht, Datum, von) ueberschreibt
export function upsertRating(list, { gericht_id, datum, sterne, notiz = '', von = '' }) {
  if (!Number.isInteger(sterne) || sterne < 1 || sterne > 5) throw new RangeError('Sterne 1 bis 5');
  const i = list.findIndex((b) => b.gericht_id === gericht_id && b.datum === datum && b.von === von);
  const rec = { gericht_id, datum, sterne, notiz, von };
  if (i >= 0) { const c = list.slice(); c[i] = rec; return c; }
  return [...list, rec];
}
