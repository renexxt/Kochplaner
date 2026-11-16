// Zustandsfaelle aus der unabhaengigen Pruefung (docs/REVIEW.md B2, B3, B8, B13, B15) und Mengen-Schreibweisen (B11, B14)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, fehlerInfo } from '../../app/js/state.js';
import { createStorage } from '../../app/js/adapters/storage.js';
import { ApiError } from '../../app/js/adapters/api.js';
import { encodeSetup } from '../../app/js/core/setupcode.js';
import { parseAmount } from '../../app/js/core/parse.js';
import { parseIngredientLine, parseIngredients } from '../../app/js/core/parser.js';
import { fakeClock } from '../../app/js/core/dates.js';
import { golden } from './helpers.mjs';

const TAIL = 'ABCDEF0123456789'.repeat(3);
const URL1 = 'https://script.example.test/macros/s/X/exec';
const CODE1 = encodeSetup({ url: URL1, token: 'k'.repeat(16) + TAIL });
const CODE1_NEUES_TOKEN = encodeSetup({ url: URL1, token: 'z'.repeat(16) + TAIL });
const CODE2 = encodeSetup({ url: 'https://script.example.test/macros/s/ANDERS/exec', token: 'k'.repeat(16) + TAIL });
const memBackend = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const copy = (x) => JSON.parse(JSON.stringify(x));

/** Schnittstelle, die wirklich speichert: Plan- und Bewertungszeilen landen in raw und kommen beim naechsten Lesen zurueck. */
function liveApi() {
  const api = { raw: copy(golden('kochplaner_test.raw.json')), calls: [], fail: null, gate: null, reads: 0 };
  api.raw.Plan = []; api.raw.Bewertungen = api.raw.Bewertungen || [];
  const maybeFail = () => { if (api.fail) throw api.fail; };
  api.client = {
    ping: async () => ({ ok: true }),
    lesen: async () => {
      api.reads += 1;
      const snap = copy(api.raw); // Stand zum Zeitpunkt der Anfrage ...
      if (api.gate) await api.gate; // ... die Antwort kommt aber spaeter an
      return { ok: true, daten: snap };
    },
    planSpeichern: async (rows) => {
      maybeFail(); api.calls.push(['plan', rows]);
      const dates = new Set(rows.map((r) => r.datum));
      api.raw.Plan = [...api.raw.Plan.filter((r) => !dates.has(r.datum)), ...copy(rows)];
      return { ok: true };
    },
    bewertungSpeichern: async (b) => { maybeFail(); api.calls.push(['bewertung', b]); api.raw.Bewertungen.push(copy(b)); return { ok: true }; },
    gerichtSpeichern: async (g, z, anfrageId) => { maybeFail(); api.calls.push(['gericht', g, z, anfrageId]); return { ok: true, id: g.id || 'G041', neu: !g.id, warnungen: [] }; },
    einstellungSpeichern: async () => ({ ok: true }),
  };
  return api;
}
async function start(api = liveApi(), code = CODE1) {
  const app = createApp({
    storage: createStorage(memBackend()), clock: fakeClock('2026-11-14T08:30:00Z'), makeClient: () => api.client, seedFor: (n) => 100 + n,
    openUrl() {}, copyText: async () => true, shareText: async () => false,
  });
  await app.init(); await app.connect(code);
  return app;
}

describe('B2: verspaetete Leseantwort darf den gespeicherten Plan nicht ueberschreiben', () => {
  it('Lesen startet, Plan wird gespeichert, alte Antwort trifft danach ein: Plan bleibt, es wird neu gelesen', async () => {
    const api = liveApi(); const app = await start(api);
    let freigeben; api.gate = new Promise((r) => { freigeben = r; });
    const lesen = app.refresh(); // Antwort haengt (Stand: leerer Plan)
    app.shuffleAll(); await app.flushSave(); // Speichern laeuft komplett durch
    assert.equal(api.raw.Plan.length, 7);
    freigeben(); await lesen;
    const s = app.state;
    assert.ok(s.slots.every((x) => x.gericht_id), 'alle 7 Tage noch belegt');
    assert.equal(s.norm.plan.length, 7, 'Datenbestand kennt den gespeicherten Plan');
    assert.equal(s.planStatus, 'ok');
    assert.equal(api.reads, 3, 'Verbinden, verworfene Antwort, neuer Versuch');
  });
  it('ohne Zwischenfall wird nur einmal gelesen', async () => {
    const api = liveApi(); const app = await start(api);
    const vorher = api.reads; await app.refresh();
    assert.equal(api.reads, vorher + 1);
  });
});

describe('B3: erneutes Verbinden mit gleicher Adresse behaelt ungespeicherte Arbeit', () => {
  async function mitOffenerArbeit() {
    const api = liveApi(); const app = await start(api);
    app.shuffleAll();
    api.fail = new ApiError('TOKEN_FALSCH', 'x');
    await app.flushSave(); // scheitert
    await app.rate(0, 4, 'gut'); // scheitert, bleibt in pending
    assert.equal(app.state.planDirty, true);
    assert.ok(app.state.pending.some((o) => o.typ === 'plan') && app.state.pending.some((o) => o.typ === 'bewertung'));
    api.fail = null; api.calls.length = 0;
    return { api, app, plan: app.state.slots.map((s) => s.gericht_id) };
  }
  it('gleiche Adresse, neues Token: Plan und Bewertung werden nachgeschickt, nichts geht verloren', async () => {
    const { api, app, plan } = await mitOffenerArbeit();
    await app.connect(CODE1_NEUES_TOKEN);
    assert.deepEqual(app.state.slots.map((s) => s.gericht_id), plan);
    assert.equal(app.state.planDirty, false);
    assert.equal(app.state.pending.length, 0);
    assert.deepEqual(api.calls.map((c) => c[0]).sort(), ['bewertung', 'plan']);
    assert.equal(api.raw.Plan.length, 7);
    assert.equal(api.raw.Bewertungen.at(-1).sterne, 4);
  });
  it('andere Adresse (anderes Sheet): offene Arbeit wird verworfen, Plan kommt aus dem neuen Sheet', async () => {
    const { api, app } = await mitOffenerArbeit();
    await app.connect(CODE2);
    assert.equal(app.state.planDirty, false);
    assert.equal(app.state.pending.length, 0);
    assert.equal(api.calls.length, 0, 'nichts ins fremde Sheet geschrieben');
    assert.ok(app.state.slots.every((s) => s.gericht_id === null));
  });
});

describe('B8: Anfrage-Kennung fuer neue Gerichte', () => {
  it('saveDish reicht die Kennung an die Schnittstelle weiter', async () => {
    const api = liveApi(); const app = await start(api);
    await app.saveDish({ name: 'Probe' }, [], 'fabc123');
    assert.equal(api.calls.at(-1)[3], 'fabc123');
  });
});

describe('B15: Einkaufszettel meldet Rechenfehler', () => {
  it('Fehler wird gemerkt und verschwindet, wenn die Berechnung wieder klappt', async () => {
    const api = liveApi(); const app = await start(api);
    app.shuffleAll();
    assert.ok(app.shopping().length > 0);
    assert.equal(app.state.listeFehler, null);
    const gut = app.state.norm.gerichte;
    app.state.norm.gerichte = null; // kaputter Zustand
    assert.deepEqual(app.shopping(), []);
    assert.match(app.state.listeFehler, /Einkaufszettel konnte nicht berechnet werden/);
    app.state.norm.gerichte = gut;
    assert.ok(app.shopping().length > 0);
    assert.equal(app.state.listeFehler, null);
  });
});

describe('B13: Fehlertexte in Alltagssprache', () => {
  it('keine Fachbegriffe in den Meldungen fuer Verbindungsprobleme', () => {
    for (const code of ['NETZWERK', 'ZEITUEBERSCHREITUNG', 'HTTP_FEHLER', 'ANTWORT_UNGUELTIG', 'TOKEN_FALSCH', 'TOKEN_FEHLT', 'BESCHAEFTIGT']) {
      const { meldung } = fehlerInfo(new ApiError(code, 'roh'));
      assert.doesNotMatch(meldung, /Token|Server|Schnittstelle|JSON|HTTP|API/, `${code}: ${meldung}`);
    }
    assert.match(fehlerInfo(new ApiError('NICHT_EINGERICHTET', 'x')).meldung, /„setup“/);
  });
});

describe('B11/B14: Mengen-Schreibweisen', () => {
  const val = (v) => { const f = parseAmount(v); return f === null ? null : Number(f.toString ? f.toString() : f); };
  const gleich = (v, n) => assert.ok(parseAmount(v)?.eq(parseAmount(String(n))), `${v} = ${n}`);
  it('Apostroph vor der Zahl (Tabellen-Textmarke) wird ignoriert', () => { gleich("'200", 200); gleich('’1,5', 1.5); });
  it('Tausenderpunkt ist mehrdeutig und gilt als nicht lesbar, eindeutige Schreibweisen bleiben', () => {
    assert.equal(parseAmount('1.500'), null);
    assert.equal(parseAmount('12.250'), null);
    assert.equal(parseAmount('1.000,5'), null);
    gleich('1,5', 1.5); gleich('1.5', 1.5); gleich('2.25', 2.25); gleich('0.500', 0.5); gleich('1,500.5', 1500.5); gleich('1,500', 1.5);
    assert.equal(val('abc'), null);
  });
  it('Schnellerfassung markiert 1.500 g Mehl als unklar statt still ohne Menge zu speichern', () => {
    const z = parseIngredientLine('1.500 g Mehl');
    assert.equal(z.ok, false); assert.match(z.grund, /nicht eindeutig/); assert.equal(z.menge, null);
    const ok = parseIngredients('1500 g Mehl\n1,5 l Milch');
    assert.ok(ok.every((x) => x.ok)); assert.deepEqual(ok.map((x) => x.menge), [1500, 1.5]);
  });
});
