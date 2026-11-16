// Tolerantes Lesen von Sheet-Zellen: Zahlen, ja/nein, Datum, Einheiten, Namen.
import { Fr } from './fraction.js';

const VULGAR = [['½', Fr.of(1, 2)], ['¼', Fr.of(1, 4)], ['¾', Fr.of(3, 4)], ['⅓', Fr.of(1, 3)], ['⅔', Fr.of(2, 3)], ['⅛', Fr.of(1, 8)]];

// Zahl, Text mit Komma oder Punkt, Bruch (1/2, ½, 1 1/2, 1½) -> Fr oder null
export function parseAmount(v) {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Fr.parseDecimal(String(v)) : null;
  let s = String(v).trim().replace(/^['’]/, ''); // fuehrender Apostroph (Tabellen-Textmarke) zaehlt nicht
  if (s === '') return null;
  let total = Fr.ZERO;
  for (const [ch, fr] of VULGAR) {
    if (s.includes(ch)) { s = s.split(ch).join(' '); total = total.add(fr); }
  }
  s = s.trim();
  if (s) {
    for (const p of s.split(/\s+/)) {
      const m = /^(\d+)\/(\d+)$/.exec(p);
      if (m && BigInt(m[2]) !== 0n) { total = total.add(Fr.of(m[1], m[2])); continue; }
      // Punkt UND Komma: nur die englische Schreibweise 1,500.5 ist eindeutig. 1.500 (Punkt, genau drei Ziffern) ist mehrdeutig
      // (1,5 oder 1500) und gilt als unklar, damit nichts still falsch gelesen wird.
      if (p.includes('.') && p.includes(',') && !/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(p)) return null;
      if (/^[1-9]\d{0,2}\.\d{3}$/.test(p)) return null;
      const p2 = p.includes('.') ? p.replace(/,/g, '') : p.replace(/,/g, '.');
      if (!/^\d+(\.\d+)?$/.test(p2)) return null;
      total = total.add(Fr.parseDecimal(p2));
    }
  }
  return total;
}

export function toBool(v, dflt) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = v === null || v === undefined ? '' : String(v).trim().toLowerCase();
  if (['ja', 'j', 'yes', 'y', 'true', 'wahr', '1', 'x'].includes(s)) return true;
  if (['nein', 'n', 'no', 'false', 'falsch', '0'].includes(s)) return false;
  return dflt;
}

const isoOf = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
};

// "2026-11-18", "2026-11-18T09:30:00" oder "18.11.2026" -> "2026-11-18", sonst null
export function parseDate(v) {
  const s = v === null || v === undefined ? '' : String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return isoOf(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) return isoOf(+m[3], +m[2], +m[1]);
  return null;
}

export const UNIT_MAP = {
  g: 'g', gr: 'g', gramm: 'g', kg: 'kg', ml: 'ml', l: 'l', liter: 'l', el: 'EL', tl: 'TL',
  'stück': 'Stück', stueck: 'Stück', stk: 'Stück', st: 'Stück', dose: 'Dose', dosen: 'Dose', bund: 'Bund',
  packung: 'Packung', pkg: 'Packung', 'päckchen': 'Packung', prise: 'Prise',
};

export function normUnit(u) {
  const raw = u === null || u === undefined ? '' : String(u).trim();
  const key = raw.replace(/\.+$/, '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(UNIT_MAP, key) ? UNIT_MAP[key] : raw;
}

const collapse = (n) => String(n).split(/\s+/).filter(Boolean).join(' ');
const casefold = (s) => s.toLowerCase().replace(/ß/g, 'ss');

export const nameKey = (n) => casefold(collapse(n));
export function displayName(n) {
  const s = collapse(n);
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}
// Deutsche Sortierung (DIN 5007-1): ae wie a, oe wie o, ue wie u, ss wie sz, Gross wie klein
export function collate(s) {
  return casefold(String(s)).normalize('NFKD').replace(/\p{M}/gu, '');
}
// Vergleich fuer Array.sort ohne localeCompare (auf jedem Geraet gleich)
export const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
