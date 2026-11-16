// Apps-Script-Simulator: laedt backend/Code.gs unveraendert in ein Node-vm und stellt Fake-Dienste bereit
// (SpreadsheetApp, ContentService, PropertiesService, LockService, Utilities, Logger).
// Die Fakes verhalten sich bewusst wie das echte Google Sheets, auch an den unbequemen Stellen:
//  - Datumszellen kommen als Date-Objekt (Mitternacht Europe/Berlin) zurueck, nicht als Text
//  - setValues liest Strings wie getippt: "5" -> Zahl, "2026-11-20" -> Datum, "=1+1" -> Formel, fuehrendes ' erzwingt Text
//  - setValues prueft die Groesse des Bereichs und wirft bei Abweichung
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CODE_GS = path.resolve(HERE, '../../backend/Code.gs');
export const TZ = 'Europe/Berlin';

export const HEADERS = {
  Gerichte: ['id', 'name', 'basis_portionen', 'kcal_pro_portion', 'tags', 'favorit', 'nie_wieder', 'aktiv',
    'reicht_fuer_tage', 'schritte', 'quelle', 'angelegt_am', 'status'],
  Zutaten: ['gericht_id', 'pos', 'name', 'menge', 'einheit', 'einkaufen'],
  Plan: ['woche_start', 'datum', 'gericht_id', 'portionen', 'fixiert', 'geaendert_am'],
  Bewertungen: ['gericht_id', 'datum', 'sterne', 'notiz', 'von'],
  Einstellungen: ['schluessel', 'wert'],
};

// ---- Zeit in Europe/Berlin ------------------------------------------------------------------------------
const fmts = new Map();
function parts(date, tz = TZ) {
  if (!fmts.has(tz)) fmts.set(tz, new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const o = {};
  for (const p of fmts.get(tz).formatToParts(date)) o[p.type] = p.value;
  return o;
}
export function berlinDate(y, mo, d, h = 0, mi = 0, s = 0) {
  let ms = Date.UTC(y, mo - 1, d, h, mi, s);
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(ms));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    ms += Date.UTC(y, mo - 1, d, h, mi, s) - shown;
  }
  return new Date(ms);
}
export function formatDate(date, tz, pattern) {
  const p = parts(date, tz);
  const map = { yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second };
  return pattern.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, lit) => (lit !== undefined ? lit : map[m]));
}

// ---- Zellen wie in Google Sheets --------------------------------------------------------------------------
function typed(v) {
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1);
  if (v === '') return '';
  if (/^=/.test(v)) return { formel: v };
  let m;
  if (/^\s*[-+]?\d+([.,]\d+)?\s*$/.test(v)) return Number(v.replace(',', '.'));
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v))) return berlinDate(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(v))) return berlinDate(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
  if (/^true$/i.test(v)) return true;
  if (/^false$/i.test(v)) return false;
  return v;
}
const isEmpty = (v) => v === '' || v === null || v === undefined;

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) {
        const v = this.sheet.grid[this.r - 1 + i]?.[this.c - 1 + j];
        row.push(v === undefined || v === null ? '' : v instanceof Date ? new Date(v.getTime()) : v);
      }
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    if (!Array.isArray(vals) || vals.length !== this.nr) throw new Error(`Die Anzahl der Zeilen in den Daten (${vals?.length}) entspricht nicht der Anzahl der Zeilen im Bereich (${this.nr}).`);
    vals.forEach((row, i) => {
      if (row.length !== this.nc) throw new Error(`Die Anzahl der Spalten in den Daten (${row.length}) entspricht nicht der Anzahl der Spalten im Bereich (${this.nc}).`);
      row.forEach((v, j) => {
        const g = this.sheet.grid;
        while (g.length < this.r + i) g.push([]);
        const line = g[this.r - 1 + i];
        while (line.length < this.c + j) line.push('');
        if (v !== null && v !== undefined && typeof v === 'object' && !(v instanceof Date)) throw new Error('Ungueltiger Zellwert');
        line[this.c - 1 + j] = typed(v);
      });
    });
    return this;
  }
}
class FakeSheet {
  constructor(name) { this.name = name; this.grid = []; this.frozen = 0; this.writes = 0; }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.grid.length - 1; i >= 0; i--) if (this.grid[i].some((v) => !isEmpty(v))) return i + 1;
    return 0;
  }
  getLastColumn() {
    let n = 0;
    for (const row of this.grid) for (let j = row.length - 1; j >= 0; j--) if (!isEmpty(row[j])) { n = Math.max(n, j + 1); break; }
    return n;
  }
  getRange(r, c, nr = 1, nc = 1) { return new FakeRange(this, r, c, nr, nc); }
  setFrozenRows(n) { this.frozen = n; }
  deleteRows(pos, n) {
    if (pos < 1 || n < 1) throw new Error('Ungueltige Zeilen');
    this.grid.splice(pos - 1, n);
  }
}
class FakeBook {
  constructor() { this.sheets = []; this.tz = 'Etc/UTC'; }
  getSpreadsheetTimeZone() { return this.tz; }
  setSpreadsheetTimeZone(tz) { this.tz = tz; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  getSheets() { return this.sheets.slice(); }
  insertSheet(n) {
    if (this.getSheetByName(n)) throw new Error(`Ein Tabellenblatt mit dem Namen "${n}" ist bereits vorhanden.`);
    const s = new FakeSheet(n); this.sheets.push(s); return s;
  }
  deleteSheet(s) {
    if (this.sheets.length < 2) throw new Error('Das letzte Blatt kann nicht geloescht werden');
    this.sheets = this.sheets.filter((x) => x !== s);
  }
}

/** Befuellt ein FakeBook aus rohen Datensaetzen (wie data/golden/*.raw.json): ISO-Daten werden zu Date-Zellen. */
export function seedBook(book, raw, headers = HEADERS) {
  for (const [tab, cols] of Object.entries(headers)) {
    const s = book.insertSheet(tab);
    s.getRange(1, 1, 1, cols.length).setValues([cols]);
    const recs = raw[tab] || [];
    if (recs.length) {
      s.getRange(2, 1, recs.length, cols.length).setValues(recs.map((r) => cols.map((c) => {
        const v = r[c];
        if (v === undefined || v === null) return '';
        // Rohwerte sind schon "wie im Sheet": Strings wie "1,5" bleiben Text (mit ' geschuetzt), ISO-Daten werden Datum
        if (typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/.test(v) && v !== '' && typed(v) !== v) return "'" + v;
        return v;
      })));
    }
  }
  return book;
}

/** Nutzdaten eines Tabs, unabhaengig von Code.gs aus dem Fake gelesen (zum Pruefen des Sheet-Zustands). */
export function dumpBook(book) {
  const out = {};
  for (const s of book.sheets) {
    const rows = s.grid.slice(0, s.getLastRow());
    const header = (rows[0] || []).map((h) => String(h).trim());
    out[s.name] = rows.slice(1).filter((r) => r.some((v) => !isEmpty(v))).map((r) => {
      const rec = {};
      header.forEach((h, i) => {
        if (!h) return;
        const v = r[i];
        rec[h] = isEmpty(v) ? '' : v instanceof Date
          ? (formatDate(v, TZ, 'HH:mm:ss') === '00:00:00' ? formatDate(v, TZ, 'yyyy-MM-dd') : formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss"))
          : v;
      });
      return rec;
    });
  }
  return out;
}

// ---- Simulator ---------------------------------------------------------------------------------------------
export function createAppsScript({ raw = {}, token = 'T'.repeat(64), configured = true, code = fs.readFileSync(CODE_GS, 'utf8'), empty = false } = {}) {
  const book = new FakeBook();
  if (!empty) seedBook(book, raw);
  const props = new Map(configured ? [['TOKEN', token]] : []);
  const state = { lockBusy: false, locked: false, logs: [], calls: [], lockLeaks: 0 };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => book, openById: () => book },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)) }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, mime: 'text/plain', setMimeType(m) { this.mime = m; return this; }, getContent() { return this.text; }, getMimeType() { return this.mime; } }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => { if (state.lockBusy || state.locked) return false; state.locked = true; return true; },
        releaseLock: () => { state.locked = false; },
      }),
    },
    Utilities: { formatDate, getUuid: () => crypto.randomUUID() },
    Logger: { log: (m) => state.logs.push(String(m)) },
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'Code.gs' });

  const out = (o) => ({ status: 200, mime: o.getMimeType(), body: o.getContent() });
  const sim = {
    book, props, state, ctx,
    get(params) { state.calls.push({ methode: 'GET', ...params }); const r = out(ctx.doGet({ parameter: params })); if (state.locked) state.lockLeaks++; return r; },
    post(bodyText) {
      let a = ''; try { a = JSON.parse(bodyText).aktion; } catch { /* egal */ }
      state.calls.push({ methode: 'POST', aktion: a });
      const r = out(ctx.doPost({ postData: { contents: bodyText, type: 'text/plain' } }));
      if (state.locked) state.lockLeaks++;
      return r;
    },
    run: (name) => ctx[name](),
    dump: () => dumpBook(book),
    /** fetch-Ersatz fuer den API-Client. Optionen: latenzMs, fehler ('http500' | 'timeout' | 'kaputt' | 'netz'), anzahl */
    makeFetch(opts = {}) {
      const inj = opts.inj || (opts.inj = { fehler: null, anzahl: 0, latenzMs: 0 });
      return async (url, init = {}) => {
        const wait = (ms, signal) => new Promise((res, rej) => {
          const t = setTimeout(res, ms);
          signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('abgebrochen'), { name: 'AbortError' })); });
        });
        if (inj.latenzMs) await wait(inj.latenzMs, init.signal);
        if (inj.anzahl > 0 && inj.fehler) {
          inj.anzahl--;
          if (inj.fehler === 'netz') throw new TypeError('Failed to fetch');
          if (inj.fehler === 'timeout') { await wait(60000, init.signal); }
          if (inj.fehler === 'http500') return { ok: false, status: 500, text: async () => '<html>Fehler</html>', json: async () => { throw new Error('kein JSON'); } };
          if (inj.fehler === 'kaputt') return { ok: true, status: 200, text: async () => '<html>Anmelden</html>', json: async () => { throw new SyntaxError('Unexpected token <'); } };
        }
        const u = new URL(url);
        const r = (init.method || 'GET') === 'POST' ? sim.post(init.body) : sim.get(Object.fromEntries(u.searchParams));
        return { ok: true, status: r.status, text: async () => r.body, json: async () => JSON.parse(r.body) };
      };
    },
  };
  return sim;
}
