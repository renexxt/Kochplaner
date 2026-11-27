// F24 Ausgaben erfassen: loadAusgaben/saveAusgabe in state.js. Eigene Datei (nicht state.test.mjs), die lokale
// fakeApi dort ist nicht exportiert und wird hier bewusst nicht dupliziert/erweitert, um das geteilte
// Testmuster fuer den Plan/Bewertungen unberuehrt zu lassen.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../app/js/state.js';
import { createStorage } from '../../app/js/adapters/storage.js';
import { ApiError } from '../../app/js/adapters/api.js';
import { encodeSetup } from '../../app/js/core/setupcode.js';
import { fakeClock } from '../../app/js/core/dates.js';
import { golden } from './helpers.mjs';

const TOKEN = 'k'.repeat(16) + 'ABCDEF0123456789'.repeat(3);
const CODE = encodeSetup({ url: 'https://script.example.test/macros/s/X/exec', token: TOKEN });
const memBackend = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const netz = () => new ApiError('NETZWERK', 'Keine Verbindung.');

function fakeApi(ausgaben = []) {
  const api = { calls: [], fail: null, ausgaben: ausgaben.slice() };
  api.client = {
    ping: async () => ({ ok: true }),
    lesen: async () => ({ ok: true, daten: JSON.parse(JSON.stringify(golden('kochplaner_test.raw.json'))) }),
    ausgabenLesen: async () => { if (api.readFail) throw api.readFail; return { ok: true, ausgaben: api.ausgaben.slice() }; },
    ausgabeSpeichern: async (e) => {
      if (api.fail) throw api.fail;
      api.calls.push(['ausgabe', e]);
      api.ausgaben = [...api.ausgaben, { ...e, angelegt_am: '2026-11-14T09:30:00' }];
      return { ok: true };
    },
  };
  return api;
}
function build({ backend = memBackend(), api = fakeApi(), jetzt = '2026-11-14T08:30:00Z' } = {}) {
  const app = createApp({
    storage: createStorage(backend), clock: fakeClock(jetzt), makeClient: () => api.client, seedFor: (n) => 100 + n,
    openUrl: () => {}, copyText: async () => true, shareText: async () => false,
  });
  return { app, api, backend };
}
const connected = async (o = {}) => { const b = build(o); await b.app.init(); await b.app.connect(CODE); return b; };

describe('Zustand: Ausgaben (F24)', () => {
  it('ohne Setup: leere Liste, loadAusgaben tut nichts', async () => {
    const { app } = build(); await app.init();
    assert.deepEqual(app.state.ausgaben, []);
    assert.equal(await app.loadAusgaben(), false);
  });

  it('loadAusgaben laedt die Liste vom Server und merkt sie lokal (Neustart ohne Netz zeigt den letzten Stand)', async () => {
    const api = fakeApi([{ datum: '2026-11-10', betrag: 12.5, beschreibung: 'Brot', angelegt_am: '2026-11-10T08:00:00' }]);
    const b = await connected({ api });
    assert.equal(await b.app.loadAusgaben(), true);
    assert.deepEqual(b.app.state.ausgaben, api.ausgaben);
    assert.equal(b.app.state.ausgabenFehler, null);
    // Neustart (anderes App-Objekt, gleicher Speicher), Server nicht erreichbar: letzter Stand bleibt sichtbar
    const api2 = fakeApi(); api2.readFail = netz();
    const b2 = build({ backend: b.backend, api: api2 });
    await b2.app.init();
    assert.deepEqual(b2.app.state.ausgaben, api.ausgaben, 'Zwischenspeicher');
    assert.equal(await b2.app.loadAusgaben(), false);
    assert.equal(b2.app.state.ausgabenFehler.code, 'NETZWERK');
    assert.deepEqual(b2.app.state.ausgaben, api.ausgaben, 'Fehlschlag loescht den Zwischenspeicher nicht');
  });

  it('saveAusgabe speichert und laedt danach neu; Fehler gehen an die Eingabemaske, nichts wird lokal uebernommen', async () => {
    const b = await connected();
    await b.app.saveAusgabe({ datum: '2026-11-20', betrag: 23.5, beschreibung: 'Wocheneinkauf' });
    assert.equal(b.app.state.ausgaben.length, 1);
    assert.equal(b.app.state.ausgaben[0].beschreibung, 'Wocheneinkauf');
    assert.equal(b.api.calls.at(-1)[0], 'ausgabe');

    b.api.fail = netz();
    await assert.rejects(b.app.saveAusgabe({ datum: '2026-11-21', betrag: 5, beschreibung: 'x' }), (e) => e.code === 'NETZWERK');
    assert.equal(b.app.state.ausgaben.length, 1, 'bei Fehler bleibt die Liste wie zuletzt geladen');
  });

  it('disconnect leert die Ausgaben-Liste und den Speicher dafuer', async () => {
    const b = await connected({ api: fakeApi([{ datum: '2026-11-10', betrag: 1, beschreibung: 'x', angelegt_am: '2026-11-10T08:00:00' }]) });
    await b.app.loadAusgaben();
    assert.equal(b.app.state.ausgaben.length, 1);
    b.app.disconnect();
    assert.deepEqual(b.app.state.ausgaben, []);
    assert.equal(b.backend.getItem('kp.ausgaben'), null);
  });
});
