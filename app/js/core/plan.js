// Plan-Zustand: 7 Tage, ein Gericht pro Tag, Portionen 1 bis 20, Fixieren. Alles unveraenderlich (gibt neue Arrays zurueck).
import { addDays, weekDays } from './dates.js';

export const MIN_PORTIONEN = 1;
export const MAX_PORTIONEN = 20;
export const TAGE = 7;

export const clampPortionen = (n) => Math.min(MAX_PORTIONEN, Math.max(MIN_PORTIONEN, Math.trunc(Number(n)) || MIN_PORTIONEN));

export function emptySlots(startIso, portionen = 2) {
  return weekDays(startIso).map((d, index) => ({
    index, datum: d.datum, gericht_id: null, beilage_id: null, portionen: clampPortionen(portionen), fixiert: false,
  }));
}

const mapAt = (slots, index, fn) => slots.map((s, i) => (i === index ? fn(s) : s));

export const setPortionen = (slots, index, n) => mapAt(slots, index, (s) => ({ ...s, portionen: clampPortionen(n) }));
export const stepPortionen = (slots, index, delta) => setPortionen(slots, index, slots[index].portionen + delta);
export const setDish = (slots, index, gericht_id) => mapAt(slots, index, (s) => ({ ...s, gericht_id }));
// Beilage eines Tages setzen, unabhaengig vom Hauptgericht (leer/null = keine Beilage an diesem Tag).
export const setBeilage = (slots, index, beilage_id) => mapAt(slots, index, (s) => ({ ...s, beilage_id }));
export const toggleFix = (slots, index) => mapAt(slots, index, (s) => (s.gericht_id ? { ...s, fixiert: !s.fixiert } : s));
export const isComplete = (slots) => slots.length === TAGE && slots.every((s) => s.gericht_id);

// Eingabe fuer shoppingList und Tagesansicht (nur belegte Tage). beilage_id fliesst mit in den Einkaufszettel (shopping.js).
export const slotsToTage = (slots) => slots.filter((s) => s.gericht_id)
  .map((s) => ({ gericht_id: s.gericht_id, portionen: s.portionen, beilage_id: s.beilage_id || null }));

// Zeilen fuer den Tab "Plan": woche_start, datum, gericht_id, portionen, fixiert, geaendert_am, beilage_id
export function slotsToRows(slots, startIso, nowIso) {
  return slots.filter((s) => s.gericht_id).map((s) => ({
    woche_start: startIso, datum: s.datum, gericht_id: s.gericht_id, portionen: s.portionen,
    fixiert: s.fixiert ? 'ja' : 'nein', geaendert_am: nowIso, beilage_id: s.beilage_id || '',
  }));
}

// Plan fuer das 7-Tage-Fenster ab startIso aus normalisierten Plan-Zeilen
export function rowsToSlots(planRows, startIso, defaultPortionen = 2) {
  const slots = emptySlots(startIso, defaultPortionen);
  for (const r of planRows) {
    const i = slots.findIndex((s) => s.datum === r.datum);
    if (i >= 0) {
      slots[i] = {
        ...slots[i], gericht_id: r.gericht_id, beilage_id: r.beilage_id || null,
        portionen: clampPortionen(r.portionen), fixiert: !!r.fixiert,
      };
    }
  }
  return slots;
}

export { addDays };

/**
 * Startdatum fuer ein Geraet ohne eigenen Stand (frisch verbunden): die Planwoche aus dem Sheet,
 * die heute abdeckt (bei mehreren die juengste), sonst die naechste, die innerhalb von 14 Tagen beginnt, sonst heute.
 */
export function defaultStart(planRows, todayIso) {
  const starts = [...new Set((planRows || []).map((r) => r.woche_start || r.datum).filter(Boolean))].sort();
  const covers = starts.filter((s) => s <= todayIso && addDays(s, TAGE - 1) >= todayIso);
  if (covers.length) return covers[covers.length - 1];
  const next = starts.find((s) => s > todayIso && s <= addDays(todayIso, 14));
  return next || todayIso;
}
