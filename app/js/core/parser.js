// Zutaten-Schnellerfassung (F12): eine Zutat pro Zeile -> { name, menge, einheit }. Unklare Zeilen werden markiert, nicht verworfen.
import { parseAmount } from './parse.js';
import { numOut } from './normalize.js';

const UNIT_WORDS = {
  g: 'g', gr: 'g', gramm: 'g', kg: 'kg', kilo: 'kg', kilogramm: 'kg', ml: 'ml', milliliter: 'ml', l: 'l', liter: 'l',
  el: 'EL', esslöffel: 'EL', essloeffel: 'EL', tl: 'TL', teelöffel: 'TL', teeloeffel: 'TL',
  'stück': 'Stück', stueck: 'Stück', stk: 'Stück', st: 'Stück', dose: 'Dose', dosen: 'Dose', bund: 'Bund',
  packung: 'Packung', packungen: 'Packung', pck: 'Packung', pkg: 'Packung', 'päckchen': 'Packung', paeckchen: 'Packung',
  prise: 'Prise', prisen: 'Prise',
};
const WORD_NUM = {
  ein: 1, eine: 1, einen: 1, einem: 1, zwei: 2, drei: 3, vier: 4, 'fünf': 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8,
  neun: 9, zehn: 10, elf: 11, 'zwölf': 12, zwoelf: 12, halbe: 0.5, halber: 0.5, halbes: 0.5, halb: 0.5,
  anderthalb: 1.5, eineinhalb: 1.5,
};
const FRAC = '½¼¾⅓⅔⅛';
const AMOUNT_RE = new RegExp(`^(\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+[${FRAC}]|[${FRAC}]|\\d+(?:[.,]\\d+)?)`);
const RANGE_RE = /^\d+(?:[.,]\d+)?\s*[-–]\s*\d+/;
const LOOSE_QTY_RE = /^(?:(?:eine?r?)\s+)?(prisen?|messerspitze|msp\.?|spritzer|schuss|handvoll|etwas|ein\s+bisschen|ein\s+wenig|nach\s+geschmack)\s+(.+)$/i;
const NACH_GESCHMACK_END = /\s+nach\s+geschmack\.?$/i;
const TRAILING_UNITS = new Set(['g', 'kg', 'ml', 'l', 'el', 'tl', 'stk', 'dose', 'dosen', 'packung']);

const cap = (s) => s.slice(0, 1).toUpperCase() + s.slice(1);
const hasLetter = (s) => /\p{L}/u.test(s);

export function parseIngredientLine(original) {
  let s = String(original ?? '').replace(/\s+/g, ' ').trim().replace(/^[-–—•*·]\s*/, '').replace(/[;,]+$/, '').trim();
  if (s === '') return null;
  const res = { original: String(original), name: '', menge: null, einheit: '', ok: true, grund: '' };
  const fail = (grund) => ({ ...res, ok: false, grund });

  if (RANGE_RE.test(s)) return { ...fail('Bereich statt einer Menge, bitte eine Zahl eintragen'), name: cap(s.replace(RANGE_RE, '').trim()) };

  // 1) Zahl am Anfang
  let amountStr = null;
  let rest = s;
  let lq = null;
  const m = AMOUNT_RE.exec(s);
  if (m) {
    amountStr = m[1];
    rest = s.slice(m[1].length).trim();
  } else {
    // 2) mengenlose Angaben ("Prise Salz", "etwas Pfeffer", "ein bisschen Salz")
    lq = LOOSE_QTY_RE.exec(s);
    // 3) Zahlwort am Anfang ("zwei Eier", "eine Dose Tomaten")
    const w = lq ? null : /^(\p{L}+)\s+(.+)$/u.exec(s);
    if (w && Object.prototype.hasOwnProperty.call(WORD_NUM, w[1].toLowerCase())) {
      amountStr = String(WORD_NUM[w[1].toLowerCase()]);
      rest = w[2];
      const h = /^ein(?:e|en|em)?$/i.test(w[1]) ? /^halb(?:e|er|es)\s+(.+)$/i.exec(rest) : null; // "eine halbe Zitrone"
      if (h) { amountStr = '0.5'; rest = h[1]; }
    }
  }

  if (amountStr !== null) {
    const f = parseAmount(amountStr);
    res.menge = f === null ? null : numOut(f);
    const u = /^(\p{L}+)\.?(?=\s|$)/u.exec(rest);
    const key = u ? u[1].toLowerCase() : '';
    if (u && Object.prototype.hasOwnProperty.call(UNIT_WORDS, key)) {
      res.einheit = UNIT_WORDS[key];
      rest = rest.slice(u[0].length).trim().replace(/^von\s+/i, '');
    } else {
      res.einheit = 'Stück'; // "2 Eier": gezaehlte Dinge zaehlen als Stueck
    }
    res.name = rest;
  } else if (lq) {
    res.einheit = /^prisen?$/i.test(lq[1]) ? 'Prise' : '';
    res.name = lq[2];
  } else {
    res.name = s.replace(NACH_GESCHMACK_END, '');
  }

  res.name = cap(res.name.replace(/\s+/g, ' ').replace(/[.:]+$/, '').trim());
  if (res.name.length < 2 || !hasLetter(res.name)) return fail('Zutatenname fehlt');
  const words = res.name.split(' ');
  if (words.length > 1 && TRAILING_UNITS.has(words[words.length - 1].toLowerCase().replace(/\.$/, ''))) {
    return fail('Die Einheit steht hinter dem Namen, bitte vor den Namen setzen (z. B. 200 g Mehl)');
  }
  // Menge gefunden, aber nicht eindeutig lesbar (z. B. 1.500: 1,5 oder 1500?): markieren statt still ohne Menge speichern
  if (amountStr !== null && res.menge === null) return fail(`Die Menge „${amountStr}“ ist nicht eindeutig. Bitte mit Komma oder ohne Punkt schreiben (z. B. 1500 oder 1,5)`);
  return res;
}

export function parseIngredients(text) {
  return String(text ?? '').split(/\r?\n|;/).map(parseIngredientLine).filter((r) => r !== null);
}
