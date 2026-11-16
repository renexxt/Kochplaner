// Fehlerfaelle des Clients gegen beide Backends: HTTP 500, Zeitueberschreitung, kaputte Antwort, kein Netz, Latenz, falsches Token
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startBackend, KINDS } from './harness.mjs';
import { ApiError, createClient } from '../../app/js/adapters/api.js';

const SAVE = { gericht_id: 'G011', datum: '2026-11-10', sterne: 4, von: 'René' };

for (const kind of KINDS) {
  describe(`Client-Fehlerfaelle gegen ${kind}`, () => {
    let be;
    before(async () => { be = await startBackend(kind); });
    after(async () => { await be.stop(); });
    beforeEach(async () => { await be.reset(); });

    it('HTTP 500 beim Lesen: ein erneuter Versuch, dann Erfolg', async () => {
      await be.inject({ modus: 'http500', anzahl: 1 });
      const api = be.client();
      const r = await api.lesen();
      assert.equal(r.daten.Gerichte.length, 40);
      assert.equal(be.fetch.calls.length, 2);
    });

    it('HTTP 500 zweimal beim Lesen: Fehler HTTP_FEHLER nach genau 2 Versuchen', async () => {
      await be.inject({ modus: 'http500', anzahl: 5 });
      const api = be.client();
      await assert.rejects(api.lesen(), (e) => e instanceof ApiError && e.code === 'HTTP_FEHLER' && e.status === 500 && e.vorruebergehend && /500/.test(e.message));
      assert.equal(be.fetch.calls.length, 2);
    });

    it('HTTP 500 beim Schreiben: Fehler, kein automatischer Wiederholversuch, nichts geschrieben', async () => {
      await be.inject({ modus: 'http500', anzahl: 1 });
      const api = be.client();
      const n0 = (await be.dump()).Bewertungen.length;
      await assert.rejects(api.bewertungSpeichern(SAVE), (e) => e.code === 'HTTP_FEHLER');
      assert.equal(be.fetch.calls.length, 1);
      assert.equal((await be.dump()).Bewertungen.length, n0);
      // danach geht es wieder
      assert.equal((await api.bewertungSpeichern(SAVE)).ok, true);
    });

    it('keine Antwort (Zeitueberschreitung): ZEITUEBERSCHREITUNG nach dem eingestellten Limit', async () => {
      await be.inject({ modus: 'timeout', anzahl: 5, ms: 3000 });
      const api = be.client({ timeoutMs: 250, retries: 0 });
      const t0 = Date.now();
      await assert.rejects(api.lesen(), (e) => e.code === 'ZEITUEBERSCHREITUNG' && /antwortet nicht/.test(e.meldung) && e.vorruebergehend);
      const dt = Date.now() - t0;
      assert.ok(dt >= 200 && dt < 1500, `Dauer ${dt} ms`);
    });

    it('Zeitueberschreitung beim Lesen mit Wiederholung: zweiter Versuch klappt', async () => {
      await be.inject({ modus: 'timeout', anzahl: 1, ms: 3000 });
      const api = be.client({ timeoutMs: 250, retries: 1 });
      assert.equal((await api.lesen()).ok, true);
      assert.equal(be.fetch.calls.length, 2);
    });

    it('2 Sekunden Latenz: Antwort kommt, Limit 5 s reicht; Limit 1 s schlaegt fehl', async () => {
      await be.inject({ modus: 'latenz', ms: 2000, anzahl: null });
      const t0 = Date.now();
      assert.equal((await be.client({ timeoutMs: 5000 }).ping()).ok, true);
      const dt = Date.now() - t0;
      assert.ok(dt >= 1900 && dt < 3500, `Dauer ${dt} ms`);
      await assert.rejects(be.client({ timeoutMs: 1000, retries: 0 }).ping(), (e) => e.code === 'ZEITUEBERSCHREITUNG');
    });

    it('Antwort ist kein JSON (z. B. Anmeldeseite): ANTWORT_UNGUELTIG, nicht wiederholt', async () => {
      await be.inject({ modus: 'kaputt', anzahl: 5 });
      const api = be.client();
      await assert.rejects(api.lesen(), (e) => e.code === 'ANTWORT_UNGUELTIG' && /Setup-Code/.test(e.meldung) && !e.vorruebergehend);
      assert.equal(be.fetch.calls.length, 1);
    });

    it('kein Netz: NETZWERK, Lesen mit einem erneuten Versuch', async () => {
      if (kind === 'mock') {
        const api = createClient({ url: 'http://127.0.0.1:9/exec', token: be.token, retryDelayMs: 5 });
        await assert.rejects(api.lesen(), (e) => e.code === 'NETZWERK' && /Internet/.test(e.meldung) && e.vorruebergehend);
      } else {
        await be.inject({ modus: 'netz', anzahl: 5 });
        const api = be.client();
        await assert.rejects(api.lesen(), (e) => e.code === 'NETZWERK');
        assert.equal(be.fetch.calls.length, 2);
      }
    });

    it('falsches Token: TOKEN_FALSCH, nicht wiederholt, verstaendliche Meldung', async () => {
      const api = be.client({ token: 'nope' });
      await assert.rejects(api.lesen(), (e) => e.code === 'TOKEN_FALSCH' && /Token/.test(e.meldung) && !e.vorruebergehend);
      assert.equal(be.fetch.calls.length, 1);
    });

    it('Eingabefehler werden nicht wiederholt und tragen das Feld', async () => {
      const api = be.client();
      await assert.rejects(api.bewertungSpeichern({ ...SAVE, sterne: 9 }), (e) => e.code === 'EINGABE_UNGUELTIG' && e.feld === 'sterne' && !e.vorruebergehend);
      assert.equal(be.fetch.calls.length, 1);
    });

    it('ohne URL gibt der Client sofort einen verstaendlichen Fehler', () => {
      assert.throws(() => createClient({ url: '', token: 'x' }), (e) => e.code === 'SETUP_FEHLT' && /Setup-Code/.test(e.meldung));
    });

    it('nach einem Fehler laeuft der Client normal weiter', async () => {
      await be.inject({ modus: 'http500', anzahl: 1 });
      const api = be.client({ retries: 0 });
      await assert.rejects(api.ping());
      assert.equal((await api.ping()).ok, true);
    });
  });
}
