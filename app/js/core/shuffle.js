// Gewichteter Zufallsvorschlag mit festem Seed. Reine Funktionen, kein Date.now, kein Math.random.
import { eligibleIds } from './normalize.js';
import { weights as ratingWeights } from './ratings.js';
import { addDays, diffDays } from './dates.js';
import { cmpStr } from './parse.js';

export class ShuffleError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Mulberry32: kleiner, schneller, deterministischer Zufallsgenerator
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Zeichenkette -> Seed (z. B. "2026-11-18#1")
export function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Gewichtete Reihenfolge ohne Zuruecklegen (Efraimidis/Spirakis): gleichwertig zu "ziehe nacheinander proportional zum Gewicht"
export function weightedOrder(ids, weightOf, rng) {
  const keyed = [...ids].sort(cmpStr).map((id) => ({ id, k: -Math.log(1 - rng()) / Math.max(weightOf(id), 1e-9) }));
  keyed.sort((a, b) => a.k - b.k || cmpStr(a.id, b.id));
  return keyed.map((x) => x.id);
}

function fisherYates(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Gerichte, die in den letzten `sperre` Tagen vor dem Start gekocht wurden. feld: 'gericht_id' (Standard) oder
// 'beilage_id', damit die Sperrfrist fuer Beilagen unabhaengig von der des Hauptgerichts gefuehrt werden kann.
export function recentIds(history, startIso, sperre, feld = 'gericht_id') {
  const out = new Set();
  for (const h of history || []) {
    const diff = diffDays(h.datum, startIso); // > 0: liegt vor dem Start
    if (diff >= 1 && diff <= sperre && h[feld]) out.add(h[feld]);
  }
  return out;
}

const wOf = (norm) => {
  const w = ratingWeights(norm);
  return (id) => w[id] ?? 1;
};

// slots: [{index, datum, gericht_id|null, portionen, fixiert}] -> neue slots (fixierte Tage bleiben)
export function proposePlan({ norm, startIso, slots, history = [], seed, rng, modus = 'alle' }) {
  rng = rng || mulberry32(seed ?? 1);
  const eligible = eligibleIds(norm, modus);
  if (eligible.length === 0) throw new ShuffleError('KEINE_GERICHTE', 'Keine passenden Gerichte vorhanden.');
  const weightOf = wOf(norm);
  const sperre = norm.einstellungen.wiederholungssperre_tage;
  const recent = recentIds(history, startIso, sperre);
  const lockedIds = new Set(slots.filter((s) => s.fixiert && s.gericht_id).map((s) => s.gericht_id));
  const open = slots.filter((s) => !(s.fixiert && s.gericht_id));
  const k = open.length;

  const A = eligible.filter((id) => !recent.has(id) && !lockedIds.has(id));
  const B = eligible.filter((id) => recent.has(id) && !lockedIds.has(id));
  let seq = [...weightedOrder(A, weightOf, rng), ...weightedOrder(B, weightOf, rng)];
  while (seq.length < k) seq = seq.concat(weightedOrder(eligible, weightOf, rng)); // zu wenige Gerichte: Wiederholung unvermeidbar
  const chosen = fisherYates(seq.slice(0, k), rng);

  let ci = 0;
  const next = slots.map((s) => (s.fixiert && s.gericht_id ? { ...s } : { ...s, gericht_id: chosen[ci++], fixiert: false }));
  return { slots: next, warnung: eligible.length < 7 ? 'WENIGER_ALS_7' : null };
}

/**
 * Verallgemeinerung von proposePlan fuer ein beliebiges Slot-Feld (gericht_id oder beilage_id), damit Haupt- und
 * Beilage unabhaengig gewuerfelt werden koennen. proposePlan bleibt unveraendert (eigene Funktion, nicht nur ein
 * Aufruf hiervon) als bestehender, bewaehrter Pfad fuer das Hauptgericht; proposeBeilage nutzt dieselbe Logik
 * fuer die Beilage. "fixiert" bleibt eine Eigenschaft des ganzen Tages: ein fixierter Tag ohne Beilage bekommt
 * trotzdem eine, ein fixierter Tag mit Beilage bleibt unveraendert; fixiert wird dabei nie zurueckgesetzt
 * (anders als bei gericht_id, wo proposePlan einen zuvor leeren fixierten Tag bewusst entsperrt).
 */
export function proposeField({ norm, startIso, slots, history = [], seed, rng, modus = 'alle', typ = 'hauptgericht', feld = 'gericht_id' }) {
  rng = rng || mulberry32(seed ?? 1);
  const eligible = eligibleIds(norm, modus, typ);
  if (eligible.length === 0) throw new ShuffleError('KEINE_GERICHTE', 'Keine passenden Gerichte vorhanden.');
  const weightOf = wOf(norm);
  const sperre = norm.einstellungen.wiederholungssperre_tage;
  const recent = recentIds(history, startIso, sperre, feld);
  const lockedIds = new Set(slots.filter((s) => s.fixiert && s[feld]).map((s) => s[feld]));
  const open = slots.filter((s) => !(s.fixiert && s[feld]));
  const k = open.length;

  const A = eligible.filter((id) => !recent.has(id) && !lockedIds.has(id));
  const B = eligible.filter((id) => recent.has(id) && !lockedIds.has(id));
  let seq = [...weightedOrder(A, weightOf, rng), ...weightedOrder(B, weightOf, rng)];
  while (seq.length < k) seq = seq.concat(weightedOrder(eligible, weightOf, rng));
  const chosen = fisherYates(seq.slice(0, k), rng);

  let ci = 0;
  const next = slots.map((s) => (s.fixiert && s[feld] ? { ...s } : { ...s, [feld]: chosen[ci++] }));
  return { slots: next, warnung: eligible.length < 7 ? 'WENIGER_ALS_7' : null };
}

// "Beilage alle wuerfeln": wie proposePlan, aber fuer beilage_id/typ=beilage.
export function proposeBeilage({ norm, startIso, slots, history = [], seed, rng, modus = 'alle' }) {
  return proposeField({ norm, startIso, slots, history, seed, rng, modus, typ: 'beilage', feld: 'beilage_id' });
}

// Neu wuerfeln fuer genau einen Tag. feld/typ: wie proposeField, damit Haupt- (Standard) und Beilage getrennte
// "Neu wuerfeln"-Vorgaenge sind (siehe rerollBeilage).
export function rerollDay({ norm, startIso, slots, index, history = [], seed, rng, modus = 'alle', typ = 'hauptgericht', feld = 'gericht_id' }) {
  rng = rng || mulberry32(seed ?? 1);
  const cur = slots[index];
  if (cur.fixiert) return { slots, geaendert: false };
  const eligible = eligibleIds(norm, modus, typ);
  if (eligible.length === 0) throw new ShuffleError('KEINE_GERICHTE', 'Keine passenden Gerichte vorhanden.');
  const weightOf = wOf(norm);
  const recent = recentIds(history, startIso, norm.einstellungen.wiederholungssperre_tage, feld);
  const others = new Set(slots.filter((s, i) => i !== index && s[feld]).map((s) => s[feld]));
  const tiers = [
    eligible.filter((id) => !recent.has(id) && !others.has(id) && id !== cur[feld]),
    eligible.filter((id) => recent.has(id) && !others.has(id) && id !== cur[feld]),
    eligible.filter((id) => !others.has(id) && id !== cur[feld]),
    eligible.filter((id) => id !== cur[feld]),
  ];
  const pool = tiers.find((t) => t.length > 0);
  if (!pool) return { slots, geaendert: false };
  const pick = weightedOrder(pool, weightOf, rng)[0];
  const next = slots.map((s, i) => (i === index ? { ...s, [feld]: pick } : s));
  return { slots: next, geaendert: true };
}

// "Beilage neu wuerfeln" fuer genau einen Tag: wie rerollDay, aber fuer beilage_id/typ=beilage.
export function rerollBeilage({ norm, startIso, slots, index, history = [], seed, rng, modus = 'alle' }) {
  return rerollDay({ norm, startIso, slots, index, history, seed, rng, modus, typ: 'beilage', feld: 'beilage_id' });
}

export { addDays };
