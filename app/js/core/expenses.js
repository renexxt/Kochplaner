// Ausgaben erfassen (F24): eigenstaendig, nicht an einen bestimmten Einkaufszettel oder Plan gebunden.
// Validierung des Betrags wie bei Mengen/kcal (D03): Dezimalkomma oder -punkt, kein Tausenderpunkt.
import { cmpStr } from './parse.js';

export const BETRAG_MAX = 100000;

/** "23,50", "23.5", 23.5 -> Zahl; "", null, nicht lesbar, negativ -> null. */
export function parseBetrag(v) {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  if (typeof v === 'number' && Number.isNaN(v)) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const norm = s.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(norm)) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** true, wenn n ein gueltiger Betrag ist: Zahl, groesser als 0, hoechstens BETRAG_MAX. */
export const betragGueltig = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= BETRAG_MAX;

/** Zuletzt erfasste Ausgaben zuerst (nach angelegt_am, als Zeitstempel-Text sortierbar). Aendert die Liste nicht.
 *  cmpStr statt localeCompare (D10): auf jedem Geraet dasselbe Ergebnis. angelegt_am hat nur Sekundenaufloesung
 *  (wie geaendert_am im Protokoll): zwei Ausgaben in derselben Sekunde brauchen den urspruenglichen Index als
 *  Tiebreaker, sonst landet bei einer Zeitstempel-Gleichheit die zuerst angelegte wieder oben (Bug, per E2E-Test
 *  F24 gefunden: ausgaben_lesen liefert Zeilen immer in Anlege-Reihenfolge, das ist die verlaessliche Grundlage). */
export function sortAusgaben(list) {
  return list
    .map((a, i) => ({ a, i }))
    .sort((p, q) => cmpStr(String(q.a.angelegt_am || q.a.datum), String(p.a.angelegt_am || p.a.datum)) || (q.i - p.i))
    .map((x) => x.a);
}
