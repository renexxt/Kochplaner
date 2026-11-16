// Nur lesende Pruefung gegen die ECHTE Schnittstelle (Apps-Script-URL + Token). Schreibt nichts, aendert nichts.
// Aufruf:  KP_URL="https://script.google.com/macros/s/.../exec" KP_TOKEN="..." node tests/contract/live.mjs
// Auch als Modul nutzbar (liveChecks), damit dieselben Pruefungen gegen Mock und Simulator laufen.
import { createClient, ApiError } from '../../app/js/adapters/api.js';

const TABS = { Gerichte: ['id', 'name', 'basis_portionen', 'kcal_pro_portion', 'favorit', 'nie_wieder', 'aktiv', 'status'],
  Zutaten: ['gericht_id', 'pos', 'name', 'menge', 'einheit', 'einkaufen'],
  Plan: ['woche_start', 'datum', 'gericht_id', 'portionen', 'fixiert'],
  Bewertungen: ['gericht_id', 'datum', 'sterne', 'notiz'],
  Einstellungen: ['schluessel', 'wert'] };
// Echte Datumszellen kommen als JJJJ-MM-TT (ggf. mit Uhrzeit ohne Zone). Von Hand getippter Text wie 13.09.2026 bleibt Text und wird von der App gelesen (D17).
const ISO = /^(\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?|\d{1,2}\.\d{1,2}\.\d{4})$/;

/** Liefert eine Liste {name, ok, detail}. Wirft nie. */
export async function liveChecks({ url, token, fetchImpl = globalThis.fetch, timeoutMs = 30000 }) {
  const out = [];
  const check = async (name, fn) => {
    try { const detail = await fn(); out.push({ name, ok: true, detail: detail ?? '' }); }
    catch (e) { out.push({ name, ok: false, detail: (e && e.message) || String(e) }); }
  };
  const api = createClient({ url, token, fetchImpl, timeoutMs });
  const must = (c, m) => { if (!c) throw new Error(m); };

  await check('ping mit richtigem Token', async () => { const r = await api.ping(); must(r.ok === true, 'ok fehlt'); return `Antwort ${JSON.stringify(r).slice(0, 80)}`; });
  await check('falsches Token wird abgelehnt (TOKEN_FALSCH)', async () => {
    try { await createClient({ url, token: token + 'x', fetchImpl, timeoutMs, retries: 0 }).lesen(); } catch (e) {
      must(e instanceof ApiError && e.code === 'TOKEN_FALSCH', 'falscher Fehlercode: ' + (e.code || e.message)); return;
    }
    throw new Error('falsches Token wurde akzeptiert');
  });
  await check('kein Token wird abgelehnt (TOKEN_FEHLT)', async () => {
    try { await createClient({ url, token: '', fetchImpl, timeoutMs, retries: 0 }).lesen(); } catch (e) {
      must(e instanceof ApiError && ['TOKEN_FEHLT', 'SETUP_FEHLT'].includes(e.code), 'falscher Fehlercode: ' + (e.code || e.message)); return;
    }
    throw new Error('Anfrage ohne Token wurde akzeptiert');
  });
  let daten = null;
  await check('lesen liefert alle 5 Tabs mit den erwarteten Spalten', async () => {
    const r = await api.lesen(); must(r.ok === true && r.daten, 'keine Daten'); daten = r.daten;
    const fehl = [];
    for (const [tab, cols] of Object.entries(TABS)) {
      if (!Array.isArray(daten[tab])) { fehl.push('Tab fehlt: ' + tab); continue; }
      if (daten[tab].length) for (const c of cols) if (!(c in daten[tab][0])) fehl.push(`${tab}.${c}`);
    }
    must(!fehl.length, 'fehlt: ' + fehl.join(', '));
    return Object.entries(TABS).map(([t]) => `${t}=${daten[t].length}`).join(' ');
  });
  await check('Datumsfelder als JJJJ-MM-TT oder TT.MM.JJJJ (keine UTC-Zeitstempel mit Z)', async () => {
    must(daten, 'vorher kein lesen');
    const bad = [];
    for (const [tab, col] of [['Plan', 'datum'], ['Plan', 'woche_start'], ['Bewertungen', 'datum'], ['Gerichte', 'angelegt_am']])
      for (const row of daten[tab] || []) { const v = row[col]; if (v !== '' && v != null && !ISO.test(String(v))) bad.push(`${tab}.${col}=${v}`); }
    must(!bad.length, bad.slice(0, 5).join('; '));
  });
  await check('Einstellungen enthalten standard_portionen und wiederholungssperre_tage', async () => {
    must(daten, 'vorher kein lesen');
    const keys = (daten.Einstellungen || []).map((r) => r.schluessel);
    must(keys.includes('standard_portionen') && keys.includes('wiederholungssperre_tage'), 'Schluessel fehlen, vorhanden: ' + keys.join(','));
  });
  await check('Gericht-Nummern sind eindeutig, Zutaten verweisen auf vorhandene Gerichte', async () => {
    must(daten, 'vorher kein lesen');
    const ids = daten.Gerichte.map((g) => g.id); must(new Set(ids).size === ids.length, 'doppelte Nummern');
    const set = new Set(ids); const waise = daten.Zutaten.filter((z) => !set.has(z.gericht_id));
    must(!waise.length, waise.length + ' Zutaten ohne Gericht');
  });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.KP_URL, token = process.env.KP_TOKEN;
  if (!url || !token) { console.error('KP_URL und KP_TOKEN setzen (Apps-Script-URL und Token).'); process.exit(2); }
  const res = await liveChecks({ url, token });
  for (const r of res) console.log(`${r.ok ? 'OK    ' : 'FEHLER'} ${r.name}${r.detail ? ' – ' + r.detail : ''}`);
  const bad = res.filter((r) => !r.ok).length;
  console.log(bad ? `\n${bad} Pruefung(en) fehlgeschlagen.` : '\nAlle Pruefungen bestanden (nur lesend, nichts veraendert).');
  process.exit(bad ? 1 : 0);
}
