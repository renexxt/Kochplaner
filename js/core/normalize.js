// Rohdaten (wie Apps Script sie liefert) -> normalisiertes Modell. Reine Funktion.
// Schluessel mit Unterstrich sind intern (exakte Brueche) und gehoeren nicht in JSON-Vergleiche.
import { Fr } from './fraction.js';
import { parseAmount, toBool, parseDate, normUnit, cmpStr } from './parse.js';

const lowerKeys = (rec) => {
  const o = {};
  for (const [k, v] of Object.entries(rec || {})) o[String(k).trim().toLowerCase()] = v;
  return o;
};
const str = (v) => (v === null || v === undefined ? '' : String(v));
const collapse = (v) => str(v).split(/\s+/).filter(Boolean).join(' ');
export const numOut = (f) => (f === null ? null : f.isInt() ? Number(f.n) : f.toNumber());

export const DEFAULT_SETTINGS = { standard_portionen: 2, wiederholungssperre_tage: 21 };

export function normalize(raw) {
  raw = raw || {};
  const settings = { ...DEFAULT_SETTINGS };
  for (const r0 of raw.Einstellungen || []) {
    const r = lowerKeys(r0);
    const k = str(r.schluessel).trim().toLowerCase();
    const v = parseAmount(r.wert);
    if (k in settings && v !== null && v.isInt() && v.gte(Fr.ONE)) settings[k] = Number(v.n);
  }

  const zut = new Map();
  (raw.Zutaten || []).forEach((r0, i) => {
    const r = lowerKeys(r0);
    const gid = str(r.gericht_id).trim();
    const name = collapse(r.name);
    if (!gid || !name) return;
    const pos = parseAmount(r.pos);
    const m = parseAmount(r.menge);
    if (!zut.has(gid)) zut.set(gid, []);
    zut.get(gid).push({
      gericht_id: gid, pos: pos !== null ? Number(pos.floor()) : i + 1, name, menge: numOut(m), _menge: m,
      einheit: normUnit(r.einheit), einkaufen: toBool(r.einkaufen, true), _row: i,
    });
  });

  const gerichte = [];
  for (const r0 of raw.Gerichte || []) {
    const r = lowerKeys(r0);
    const gid = str(r.id).trim();
    if (!gid) continue;
    let basis = parseAmount(r.basis_portionen);
    if (basis === null || basis.lte(Fr.ZERO)) basis = Fr.of(settings.standard_portionen);
    let kcal = parseAmount(r.kcal_pro_portion);
    if (kcal !== null && kcal.lte(Fr.ZERO)) kcal = null;
    let tage = parseAmount(r.reicht_fuer_tage);
    tage = tage !== null && tage.gte(Fr.ONE) ? Number(tage.floor()) : 1;
    const z = (zut.get(gid) || []).slice().sort((a, b) => a.pos - b.pos || a._row - b._row);
    gerichte.push({
      id: gid, name: collapse(r.name), basis_portionen: numOut(basis), _basis: basis, kcal_pro_portion: numOut(kcal),
      tags: str(r.tags).split(',').map((t) => t.trim()).filter(Boolean),
      favorit: toBool(r.favorit, false), nie_wieder: toBool(r.nie_wieder, false), aktiv: toBool(r.aktiv, true),
      reicht_fuer_tage: tage, schritte: str(r.schritte), quelle: str(r.quelle), angelegt_am: parseDate(r.angelegt_am),
      status: str(r.status).trim().toLowerCase() === 'idee' ? 'idee' : 'fertig', zutaten: z,
    });
  }

  const plan = [];
  for (const r0 of raw.Plan || []) {
    const r = lowerKeys(r0);
    const d = parseDate(r.datum);
    const gid = str(r.gericht_id).trim();
    const p = parseAmount(r.portionen);
    if (d === null || !gid) continue;
    plan.push({
      woche_start: parseDate(r.woche_start), datum: d, gericht_id: gid,
      portionen: p !== null && p.gte(Fr.ONE) ? Number(p.floor()) : settings.standard_portionen,
      fixiert: toBool(r.fixiert, false),
    });
  }
  plan.sort((a, b) => cmpStr(a.datum, b.datum) || cmpStr(a.gericht_id, b.gericht_id));

  const bew = new Map();
  for (const r0 of raw.Bewertungen || []) {
    const r = lowerKeys(r0);
    const gid = str(r.gericht_id).trim();
    const d = parseDate(r.datum);
    const s = parseAmount(r.sterne);
    if (!gid || d === null || s === null || !s.isInt() || s.lt(Fr.ONE) || s.gt(Fr.of(5))) continue;
    const von = str(r.von).trim();
    bew.set(`${gid}\u0000${d}\u0000${von}`, { gericht_id: gid, datum: d, sterne: Number(s.n), notiz: str(r.notiz), von });
  }
  return { einstellungen: settings, gerichte, plan, bewertungen: [...bew.values()] };
}

// entfernt interne Felder (Unterstrich) fuer JSON-Vergleiche
export function stripInternal(o) {
  if (Array.isArray(o)) return o.map(stripInternal);
  if (o && typeof o === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(o)) if (!k.startsWith('_')) out[k] = stripInternal(v);
    return out;
  }
  return o;
}

export const eligibleIds = (norm) => norm.gerichte.filter((g) => g.aktiv && g.status === 'fertig' && !g.nie_wieder).map((g) => g.id);
export const selectableIds = (norm) => norm.gerichte.filter((g) => g.aktiv && g.status === 'fertig').map((g) => g.id);
