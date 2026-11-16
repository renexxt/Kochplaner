// Einkaufszettel: Skalierung, Addition, Rundung, Sortierung. Exakte Bruchrechnung.
import { Fr, fmtNum, round2 } from './fraction.js';
import { nameKey, displayName, collate, cmpStr } from './parse.js';

export function scaleFactor(portionen, basis) {
  return Fr.of(portionen).div(basis);
}

// tage: [{gericht_id, portionen}] -> { items:[{key,name,einheit,menge,menge_exakt,anzeige}], zeilen:[...] }
export function shoppingList(norm, tage) {
  const gerichte = new Map(norm.gerichte.map((g) => [g.id, g]));
  const groups = new Map();
  const amountless = new Map();
  let order = 0;
  for (const t of tage) {
    const d = gerichte.get(t.gericht_id);
    if (!d) throw new Error('Gericht nicht gefunden: ' + t.gericht_id);
    const scale = scaleFactor(t.portionen, d._basis);
    for (const z of d.zutaten) {
      if (!z.einkaufen) continue;
      const key = nameKey(z.name);
      const disp = displayName(z.name);
      order += 1;
      if (z._menge === null) {
        if (!amountless.has(key)) amountless.set(key, { order, disp });
        continue;
      }
      let amt = z._menge.mul(scale);
      const unit = z.einheit;
      let fam;
      if (unit === 'kg') { fam = 'g'; amt = amt.mul(Fr.of(1000)); }
      else if (unit === 'g') fam = 'g';
      else if (unit === 'l') { fam = 'ml'; amt = amt.mul(Fr.of(1000)); }
      else if (unit === 'ml') fam = 'ml';
      else fam = unit.toLowerCase().replace(/ß/g, 'ss');
      const gk = key + '\u0000' + fam;
      if (!groups.has(gk)) groups.set(gk, { key, name: disp, fam, unit, total: Fr.ZERO, order });
      const g = groups.get(gk);
      g.total = g.total.add(amt);
    }
  }
  const items = [];
  const have = new Set();
  for (const g of groups.values()) {
    have.add(g.key);
    let total = g.total;
    if (g.fam === 'stück') total = new Fr(total.mul(Fr.of(2)).ceil(), 2n); // erst nach dem Addieren auf 0,5 aufrunden
    let val, unit;
    if (g.fam === 'g') [val, unit] = total.gte(Fr.of(1000)) ? [total.div(Fr.of(1000)), 'kg'] : [total, 'g'];
    else if (g.fam === 'ml') [val, unit] = total.gte(Fr.of(1000)) ? [total.div(Fr.of(1000)), 'l'] : [total, 'ml'];
    else [val, unit] = [total, g.unit];
    const line = fmtNum(val) + (unit ? ' ' + unit : '') + ' ' + g.name;
    items.push({
      key: g.key, name: g.name, einheit: unit, menge: round2(val).toNumber(), menge_exakt: Math.round(val.toNumber() * 1e6) / 1e6,
      anzeige: line, _sort: [collate(g.name), collate(g.fam)],
    });
  }
  for (const [key, { disp }] of amountless) {
    if (have.has(key)) continue;
    items.push({ key, name: disp, einheit: '', menge: null, menge_exakt: null, anzeige: disp, _sort: [collate(disp), ''] });
  }
  items.sort((a, b) => cmpStr(a._sort[0], b._sort[0]) || cmpStr(a._sort[1], b._sort[1]));
  for (const i of items) delete i._sort;
  return { items, zeilen: items.map((i) => i.anzeige) };
}

// Tagesansicht: kcal gesamt = kcal pro Portion x Portionen; fehlt kcal, bleibt es leer (nie 0)
export function kcalTotal(gericht, portionen) {
  if (!gericht || gericht.kcal_pro_portion === null || gericht.kcal_pro_portion === undefined) return null;
  return Math.round(gericht.kcal_pro_portion * portionen * 1e4) / 1e4;
}
