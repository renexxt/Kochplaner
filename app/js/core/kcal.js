// Automatische Kalorienberechnung aus den Zutaten eines Gerichts ueber die Tabs "Lebensmittel" und "Richtgewichte".
// Reine Funktion: nimmt ein normalisiertes Gericht und die normalisierten Lebensmittel/Richtgewichte (aus normalize.js)
// und gibt kcal_pro_portion zurueck. Manuell im Sheet eingetragene Werte gehen immer vor (siehe ZIELDOKUMENT.md F24).
import { nameKey } from './parse.js';

// g/ml direkt ohne Dichte-Annahme (1 ml = 1 g), kg/l wie in shopping.js per 1000 umgerechnet. Alle anderen Einheiten
// (Stück, EL, TL, Dose, Bund, Packung, Prise, auch unbekannte) muessen ueber "Richtgewichte" in Gramm umgerechnet werden.
const GRAMM_DIREKT = { g: 1, kg: 1000, ml: 1, l: 1000 };

function indexByName(lebensmittel) {
  const map = new Map();
  for (const l of lebensmittel || []) {
    const key = nameKey(l.name);
    if (key && !map.has(key)) map.set(key, l);
  }
  return map;
}

function indexByNameEinheit(richtgewichte) {
  const map = new Map();
  for (const r of richtgewichte || []) {
    const key = nameKey(r.name) + '\u0000' + r.einheit;
    if (!map.has(key)) map.set(key, r);
  }
  return map;
}

/**
 * Berechnet kcal_pro_portion fuer ein Gericht aus seiner Zutatenliste, wenn kein manueller Wert gesetzt ist.
 *
 * gericht: normalisiertes Gericht { kcal_pro_portion, basis_portionen, zutaten: [{name, menge, einheit}] } (app/js/core/normalize.js)
 * lebensmittel: [{name, kcal_je_100g}], richtgewichte: [{name, einheit, gramm}] (ebenfalls aus normalize.js)
 *
 * Rueckgabe: { kcal_pro_portion, quelle: 'manuell'|'berechnet'|'unbekannt', ca: boolean, nicht_zuordenbar: number }
 * - quelle 'manuell': kcal_pro_portion unangetastet aus dem Gericht uebernommen.
 * - quelle 'berechnet': aus mindestens einer Zutat berechnet; ca = true, wenn dabei Zutaten ausgelassen wurden.
 * - quelle 'unbekannt': keine einzige Zutat konnte zugeordnet werden (kcal_pro_portion = null).
 * Zutaten ohne Menge ("nach Geschmack") tragen nichts zur Summe bei und zaehlen nicht als nicht zuordenbar.
 */
export function berechneKcalProPortion(gericht, lebensmittel, richtgewichte) {
  const manuell = gericht && gericht.kcal_pro_portion;
  if (manuell !== null && manuell !== undefined && manuell !== '') {
    return { kcal_pro_portion: gericht.kcal_pro_portion, quelle: 'manuell', ca: false, nicht_zuordenbar: 0 };
  }
  const lmByName = indexByName(lebensmittel);
  const rgByNameEinheit = indexByNameEinheit(richtgewichte);
  let summeKcal = 0;
  let nichtZuordenbar = 0;
  let gefunden = false;
  for (const z of (gericht && gericht.zutaten) || []) {
    const menge = z.menge;
    if (menge === null || menge === undefined || menge === '') continue; // ohne Menge: zaehlt nicht mit, auch nicht als unbekannt
    let gramm;
    if (Object.prototype.hasOwnProperty.call(GRAMM_DIREKT, z.einheit)) {
      gramm = Number(menge) * GRAMM_DIREKT[z.einheit];
    } else {
      const rg = rgByNameEinheit.get(nameKey(z.name) + '\u0000' + z.einheit);
      if (!rg) { nichtZuordenbar += 1; continue; }
      gramm = Number(menge) * Number(rg.gramm);
    }
    const lm = lmByName.get(nameKey(z.name));
    if (!lm) { nichtZuordenbar += 1; continue; }
    summeKcal += (gramm * Number(lm.kcal_je_100g)) / 100;
    gefunden = true;
  }
  if (!gefunden) return { kcal_pro_portion: null, quelle: 'unbekannt', ca: nichtZuordenbar > 0, nicht_zuordenbar: nichtZuordenbar };
  const basis = gericht.basis_portionen > 0 ? gericht.basis_portionen : 1;
  const kcal_pro_portion = Math.round((summeKcal / basis) * 1e4) / 1e4;
  return { kcal_pro_portion, quelle: 'berechnet', ca: nichtZuordenbar > 0, nicht_zuordenbar: nichtZuordenbar };
}
