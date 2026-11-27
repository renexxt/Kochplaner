import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startBackend, KINDS, TOKEN, stable } from './harness.mjs';
import { ApiError } from '../../app/js/adapters/api.js';
import { golden } from '../unit/helpers.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { dataFile } from './harness.mjs';

const rejects = async (p, code, feld) => {
  await assert.rejects(p, (e) => {
    assert.ok(e instanceof ApiError, 'ApiError erwartet, bekam ' + e);
    assert.equal(e.code, code, e.message);
    if (feld) assert.equal(e.feld, feld);
    return true;
  });
};
const tab = async (be, name) => (await be.dump())[name];
const STAMP = '2026-11-14T09:30:00';
const plan7 = (start, ids, extra = {}) => ids.map((g, i) => {
  const d = new Date(Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8) + i)).toISOString().slice(0, 10);
  return { datum: d, gericht_id: g, portionen: 2, fixiert: 'nein', woche_start: start, geaendert_am: STAMP, ...extra };
});

for (const kind of KINDS) {
  describe(`Protokoll gegen ${kind}`, () => {
    let be, api;
    before(async () => { be = await startBackend(kind); });
    after(async () => { await be.stop(); });
    beforeEach(async () => { await be.reset(); api = be.client(); });

    it('ping liefert Version 1', async () => {
      const r = await api.ping();
      assert.equal(r.ok, true);
      assert.equal(r.version, 1);
      assert.match(r.zeit, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    });

    it('lesen liefert alle 7 Tabs, identisch mit den Rohdaten der Testdatei (Datum als Text, leer = "", "1,5" bleibt Text)', async () => {
      const r = await api.lesen();
      assert.deepEqual(Object.keys(r.daten), ['Gerichte', 'Zutaten', 'Plan', 'Bewertungen', 'Einstellungen', 'Lebensmittel', 'Richtgewichte']);
      // golden('...raw.json') enthaelt alle Tabs der xlsx-Datei (auch "Ausgaben"), lesen() bewusst nur die obigen 7 (KP.LESEN_TABS).
      const { Ausgaben, ...rohRest } = golden('kochplaner_test.raw.json');
      assert.deepEqual(r.daten, rohRest);
      assert.equal(r.daten.Gerichte.length, 40);
      assert.equal(r.daten.Zutaten.length, 299);
      for (const b of r.daten.Bewertungen) assert.match(b.datum, /^\d{4}-\d{2}-\d{2}$/);
    });

    it('Token: falsch, fehlend, leer', async () => {
      await rejects(be.client({ token: 'falsch' }).lesen(), 'TOKEN_FALSCH');
      await rejects(be.client({ token: '' }).ping(), 'TOKEN_FEHLT');
      const bad = await be.rawPost(JSON.stringify({ token: 'falsch', aktion: 'ping' }));
      assert.deepEqual(bad, { ok: false, fehler: { code: 'TOKEN_FALSCH', meldung: 'Das Token stimmt nicht.' } });
      const none = await be.rawPost(JSON.stringify({ aktion: 'ping' }));
      assert.equal(none.fehler.code, 'TOKEN_FEHLT');
      const empty = await be.rawPost(JSON.stringify({ token: '', aktion: 'lesen' }));
      assert.equal(empty.fehler.code, 'TOKEN_FEHLT');
      const almost = await be.rawPost(JSON.stringify({ token: TOKEN.slice(0, -1), aktion: 'lesen' }));
      assert.equal(almost.fehler.code, 'TOKEN_FALSCH');
      const longer = await be.rawPost(JSON.stringify({ token: TOKEN + 'x', aktion: 'lesen' }));
      assert.equal(longer.fehler.code, 'TOKEN_FALSCH');
    });

    it('falsches Token schreibt nichts', async () => {
      const before = stable(await be.dump());
      const r = await be.rawPost(JSON.stringify({ token: 'x', aktion: 'bewertung_speichern', gericht_id: 'G001', datum: '2026-11-01', sterne: 5 }));
      assert.equal(r.fehler.code, 'TOKEN_FALSCH');
      assert.deepEqual(stable(await be.dump()), before);
    });

    it('GET ping und lesen mit Token, GET schreibt nie', async () => {
      assert.equal((await be.rawGet({ token: TOKEN, action: 'ping' })).ok, true);
      const r = await be.rawGet({ token: TOKEN, action: 'lesen' });
      assert.equal(r.daten.Gerichte.length, 40);
      assert.equal((await be.rawGet({ token: TOKEN, action: 'plan_speichern' })).fehler.code, 'NUR_POST');
      assert.equal((await be.rawGet({ action: 'lesen' })).fehler.code, 'TOKEN_FEHLT');
    });

    it('unbekannte Aktion, kaputtes JSON, kein Objekt', async () => {
      assert.equal((await be.rawPost(JSON.stringify({ token: TOKEN, aktion: 'loeschen' }))).fehler.code, 'AKTION_UNBEKANNT');
      assert.equal((await be.rawPost(JSON.stringify({ token: TOKEN }))).fehler.code, 'AKTION_UNBEKANNT');
      assert.equal((await be.rawPost('{kaputt')).fehler.code, 'ANFRAGE_UNGUELTIG');
      assert.equal((await be.rawPost('')).fehler.code, 'ANFRAGE_UNGUELTIG');
      assert.equal((await be.rawPost('[1,2]')).fehler.code, 'ANFRAGE_UNGUELTIG');
      assert.equal((await be.rawPost('"text"')).fehler.code, 'ANFRAGE_UNGUELTIG');
    });

    // ---------------------------------------------------------------- Plan
    it('plan_speichern: 7 Tage schreiben, lesen, Upsert ohne Duplikate, Tag leeren', async () => {
      const ids = ['G001', 'G004', 'G007', 'G012', 'G022', 'G028', 'G031'];
      const r = await api.planSpeichern(plan7('2026-11-18', ids));
      assert.deepEqual(r, { ok: true, geschrieben: 7, geloescht: 0 });
      let p = (await api.lesen()).daten.Plan;
      assert.equal(p.length, 7);
      assert.deepEqual(p[0], { woche_start: '2026-11-18', datum: '2026-11-18', gericht_id: 'G001', portionen: 2, fixiert: 'nein', geaendert_am: STAMP, beilage_id: '' });
      assert.deepEqual(p.map((x) => x.datum), ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']);

      // Upsert: Tag 3 bekommt 5 Portionen und fixiert, Tag 5 ein anderes Gericht
      const upd = plan7('2026-11-18', ids);
      upd[2] = { ...upd[2], portionen: 5, fixiert: 'ja', geaendert_am: '2026-11-15T10:00:00' };
      upd[4] = { ...upd[4], gericht_id: 'G003' };
      const r2 = await api.planSpeichern([upd[2], upd[4]]);
      assert.equal(r2.geschrieben, 2);
      p = (await api.lesen()).daten.Plan;
      assert.equal(p.length, 7, 'keine Duplikate');
      assert.deepEqual(p[2], { woche_start: '2026-11-18', datum: '2026-11-20', gericht_id: 'G007', portionen: 5, fixiert: 'ja', geaendert_am: '2026-11-15T10:00:00', beilage_id: '' });
      assert.equal(p[4].gericht_id, 'G003');
      assert.equal(p[0].geaendert_am, STAMP, 'andere Tage unveraendert');

      // Tag leeren
      const r3 = await api.planSpeichern([{ datum: '2026-11-19', gericht_id: '' }, { datum: '2026-11-21', gericht_id: '' }]);
      assert.deepEqual(r3, { ok: true, geschrieben: 0, geloescht: 2 });
      p = (await api.lesen()).daten.Plan;
      assert.deepEqual(p.map((x) => x.datum), ['2026-11-18', '2026-11-20', '2026-11-22', '2026-11-23', '2026-11-24']);
      // Loeschen eines Tages, der gar nicht da ist, ist kein Fehler
      assert.equal((await api.planSpeichern([{ datum: '2026-12-31', gericht_id: '' }])).geloescht, 0);
    });

    it('plan_speichern: neue Woche daneben, ueberlappende Tage werden ersetzt (woche_start wandert mit)', async () => {
      await api.planSpeichern(plan7('2026-11-18', ['G001', 'G004', 'G007', 'G012', 'G022', 'G028', 'G031']));
      await api.planSpeichern(plan7('2026-11-20', ['G002', 'G003', 'G005', 'G006', 'G008', 'G009', 'G010']));
      const p = (await api.lesen()).daten.Plan;
      assert.equal(p.length, 9);
      assert.deepEqual(p.map((x) => x.datum), ['2026-11-18', '2026-11-19', ...['20', '21', '22', '23', '24', '25', '26'].map((d) => '2026-11-' + d)]);
      assert.equal(p[0].woche_start, '2026-11-18');
      assert.equal(p[2].woche_start, '2026-11-20');
      assert.equal(p[2].gericht_id, 'G002');
    });

    it('plan_speichern: Standardwerte (woche_start = Datum, geaendert_am = Serverzeit, fixiert = nein)', async () => {
      await api.planSpeichern([{ datum: '2026-11-18', gericht_id: 'G001', portionen: '3' }]);
      const p = (await api.lesen()).daten.Plan[0];
      assert.equal(p.woche_start, '2026-11-18');
      assert.equal(p.fixiert, 'nein');
      assert.equal(p.portionen, 3);
      assert.match(p.geaendert_am, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    });

    it('plan_speichern: Eingabefehler, nichts wird geschrieben (alles oder nichts)', async () => {
      const ok = { datum: '2026-11-18', gericht_id: 'G001', portionen: 2 };
      const cases = [
        [[], 'EINGABE_UNGUELTIG', 'zeilen'],
        [null, 'EINGABE_UNGUELTIG', 'zeilen'],
        [[ok, { ...ok, datum: '2026-11-19', gericht_id: 'G999' }], 'GERICHT_UNBEKANNT', 'zeilen[1].gericht_id'],
        [[ok, { ...ok, datum: '2026-11-19', beilage_id: 'G999' }], 'GERICHT_UNBEKANNT', 'zeilen[1].beilage_id'],
        [[ok, { ...ok, datum: '2026-02-30' }], 'EINGABE_UNGUELTIG', 'zeilen[1].datum'],
        [[ok, { ...ok, datum: '18.11.2026' }], 'EINGABE_UNGUELTIG', 'zeilen[1].datum'],
        [[ok, { ...ok, datum: '2026-11-19', portionen: 0 }], 'EINGABE_UNGUELTIG', 'zeilen[1].portionen'],
        [[ok, { ...ok, datum: '2026-11-19', portionen: 21 }], 'EINGABE_UNGUELTIG', 'zeilen[1].portionen'],
        [[ok, { ...ok, datum: '2026-11-19', portionen: 2.5 }], 'EINGABE_UNGUELTIG', 'zeilen[1].portionen'],
        [[ok, { ...ok, datum: '2026-11-19', portionen: 'viele' }], 'EINGABE_UNGUELTIG', 'zeilen[1].portionen'],
        [[ok, { ...ok, datum: '2026-11-19', portionen: undefined }], 'EINGABE_UNGUELTIG', 'zeilen[1].portionen'],
        [[ok, { ...ok, datum: '2026-11-19', fixiert: 'vielleicht' }], 'EINGABE_UNGUELTIG', 'zeilen[1].fixiert'],
        [[ok, { ...ok }], 'EINGABE_UNGUELTIG', 'zeilen[1].datum'],
        [[ok, { ...ok, datum: '2026-11-19', geaendert_am: 'gestern' }], 'EINGABE_UNGUELTIG', 'zeilen[1].geaendert_am'],
        [[ok, 'text'], 'EINGABE_UNGUELTIG', 'zeilen[1]'],
        [Array.from({ length: 63 }, (_, i) => ({ ...ok, datum: `2026-12-${String((i % 28) + 1).padStart(2, '0')}` })), 'EINGABE_UNGUELTIG', 'zeilen'],
      ];
      for (const [zeilen, code, feld] of cases) {
        await rejects(api.planSpeichern(zeilen), code, feld);
        assert.equal((await tab(be, 'Plan')).length, 0, `${code} ${feld}: es wurde etwas geschrieben`);
      }
    });

    it('plan_speichern: Wahrheitswerte als fixiert werden zu ja/nein', async () => {
      await api.planSpeichern([{ datum: '2026-11-18', gericht_id: 'G001', portionen: 2, fixiert: true }, { datum: '2026-11-19', gericht_id: 'G004', portionen: 2, fixiert: false }]);
      assert.deepEqual((await api.lesen()).daten.Plan.map((p) => p.fixiert), ['ja', 'nein']);
    });

    it('plan_speichern: beilage_id wird geschrieben, gelesen und wieder entfernt; leer heisst keine Beilage', async () => {
      await api.planSpeichern([{ datum: '2026-11-18', gericht_id: 'G001', beilage_id: 'G004', portionen: 2 }, { datum: '2026-11-19', gericht_id: 'G007', portionen: 2 }]);
      let p = (await api.lesen()).daten.Plan;
      assert.equal(p[0].beilage_id, 'G004');
      assert.equal(p[1].beilage_id, '', 'ohne beilage_id gesendet bleibt es leer');
      // dieselbe Zeile ohne beilage_id erneut speichern entfernt die Beilage (plan_speichern ist eine volle Zeilenangabe)
      await api.planSpeichern([{ datum: '2026-11-18', gericht_id: 'G001', portionen: 2 }]);
      p = (await api.lesen()).daten.Plan;
      assert.equal(p[0].beilage_id, '');
      // Tag ohne Hauptgericht: eine mitgeschickte beilage_id ist hinfaellig, die Zeile wird trotzdem geloescht
      const r = await api.planSpeichern([{ datum: '2026-11-18', gericht_id: '', beilage_id: 'G004' }]);
      assert.equal(r.geloescht, 1);
    });

    // ---------------------------------------------------------------- Bewertungen
    it('bewertung_speichern: neu, gleicher Schluessel ueberschreibt, andere Person ergibt eine zweite Zeile', async () => {
      const n0 = (await tab(be, 'Bewertungen')).length;
      assert.deepEqual(await api.bewertungSpeichern({ gericht_id: 'G011', datum: '2026-11-10', sterne: 4, notiz: 'gut', von: 'René' }), { ok: true, ueberschrieben: false });
      assert.deepEqual(await api.bewertungSpeichern({ gericht_id: 'G011', datum: '2026-11-10', sterne: 2, notiz: 'doch nicht', von: 'René' }), { ok: true, ueberschrieben: true });
      let b = (await api.lesen()).daten.Bewertungen;
      assert.equal(b.length, n0 + 1);
      assert.deepEqual(b.at(-1), { gericht_id: 'G011', datum: '2026-11-10', sterne: 2, notiz: 'doch nicht', von: 'René' });
      assert.equal((await api.bewertungSpeichern({ gericht_id: 'G011', datum: '2026-11-10', sterne: 5, von: 'Partnerin' })).ueberschrieben, false);
      b = (await api.lesen()).daten.Bewertungen;
      assert.equal(b.length, n0 + 2);
      assert.deepEqual(b.at(-1), { gericht_id: 'G011', datum: '2026-11-10', sterne: 5, notiz: '', von: 'Partnerin' });
      // anderer Tag = neue Zeile, von mit Leerzeichen wird getrimmt
      await api.bewertungSpeichern({ gericht_id: 'G011', datum: '2026-11-11', sterne: 3, von: '  René ' });
      b = (await api.lesen()).daten.Bewertungen;
      assert.equal(b.length, n0 + 3);
      assert.equal(b.at(-1).von, 'René');
      // bestehende Bewertung aus der Testdatei laesst sich ueberschreiben (Datum liegt als Datumszelle vor)
      const alt = golden('kochplaner_test.raw.json').Bewertungen[0];
      const r = await api.bewertungSpeichern({ gericht_id: alt.gericht_id, datum: alt.datum, sterne: 1, von: alt.von });
      assert.equal(r.ueberschrieben, true);
      assert.equal((await api.lesen()).daten.Bewertungen.length, n0 + 3);
    });

    it('bewertung_speichern: Eingabefehler', async () => {
      const ok = { gericht_id: 'G011', datum: '2026-11-10', sterne: 4, von: 'René' };
      const cases = [
        [{ ...ok, sterne: 0 }, 'EINGABE_UNGUELTIG', 'sterne'], [{ ...ok, sterne: 6 }, 'EINGABE_UNGUELTIG', 'sterne'],
        [{ ...ok, sterne: 3.5 }, 'EINGABE_UNGUELTIG', 'sterne'], [{ ...ok, sterne: 'x' }, 'EINGABE_UNGUELTIG', 'sterne'],
        [{ ...ok, sterne: undefined }, 'EINGABE_UNGUELTIG', 'sterne'],
        [{ ...ok, datum: '2026-13-01' }, 'EINGABE_UNGUELTIG', 'datum'], [{ ...ok, datum: undefined }, 'EINGABE_UNGUELTIG', 'datum'],
        [{ ...ok, gericht_id: 'G999' }, 'GERICHT_UNBEKANNT', 'gericht_id'], [{ ...ok, gericht_id: '' }, 'GERICHT_UNBEKANNT', 'gericht_id'],
        [{ ...ok, notiz: 'x'.repeat(2001) }, 'EINGABE_UNGUELTIG', 'notiz'], [{ ...ok, von: 'x'.repeat(61) }, 'EINGABE_UNGUELTIG', 'von'],
      ];
      const n0 = (await tab(be, 'Bewertungen')).length;
      for (const [b, code, feld] of cases) await rejects(api.bewertungSpeichern(b), code, feld);
      assert.equal((await tab(be, 'Bewertungen')).length, n0);
      assert.equal((await api.bewertungSpeichern({ ...ok, sterne: '5' })).ok, true, 'Zahl als Text ist erlaubt');
    });

    // ---------------------------------------------------------------- Gerichte
    it('gericht_speichern: neues Gericht mit Zutaten (Standardwerte, naechste Nummer, Zutaten 1..n)', async () => {
      const r = await api.gerichtSpeichern(
        { name: '  Kürbis   Suppe ', kcal_pro_portion: 420, tags: 'Suppe', schritte: 'Kochen.\nPürieren.', angelegt_am: '2026-11-14' },
        [{ name: 'Kürbis', menge: 1, einheit: 'Stück', einkaufen: 'ja' }, { name: 'Wasser', menge: '', einheit: '', einkaufen: 'nein' }, { name: 'Sahne', menge: '1,5', einheit: 'dl' }],
      );
      assert.deepEqual(r, { ok: true, id: 'G041', neu: true, warnungen: [] });
      const g = (await api.lesen()).daten.Gerichte.at(-1);
      assert.deepEqual(g, { id: 'G041', name: 'Kürbis Suppe', basis_portionen: 2, kcal_pro_portion: 420, tags: 'Suppe', favorit: 'nein', nie_wieder: 'nein', aktiv: 'ja',
        reicht_fuer_tage: 1, schritte: 'Kochen.\nPürieren.', quelle: 'App', angelegt_am: '2026-11-14', status: 'fertig', typ: 'hauptgericht' });
      const z = (await api.lesen()).daten.Zutaten.filter((x) => x.gericht_id === 'G041');
      assert.deepEqual(z, [
        { gericht_id: 'G041', pos: 1, name: 'Kürbis', menge: 1, einheit: 'Stück', einkaufen: 'ja' },
        { gericht_id: 'G041', pos: 2, name: 'Wasser', menge: '', einheit: '', einkaufen: 'nein' },
        { gericht_id: 'G041', pos: 3, name: 'Sahne', menge: 1.5, einheit: 'dl', einkaufen: 'ja' },
      ]);
      assert.equal((await api.lesen()).daten.Zutaten.length, 302);
    });

    it('gericht_speichern: nur Name ergibt status idee ohne Zutaten, kcal leer bleibt leer', async () => {
      const r = await api.gerichtSpeichern({ name: 'Moussaka', angelegt_am: '2026-11-14' });
      assert.equal(r.id, 'G041');
      const g = (await api.lesen()).daten.Gerichte.at(-1);
      assert.equal(g.status, 'idee');
      assert.equal(g.kcal_pro_portion, '');
      assert.equal(g.schritte === undefined ? '' : g.schritte, '');
      assert.equal((await api.lesen()).daten.Zutaten.length, 299);
      // naechstes Gericht bekommt die naechste Nummer, auch wenn eine Idee davor steht
      assert.equal((await api.gerichtSpeichern({ name: 'Rouladen', angelegt_am: '2026-11-14' })).id, 'G042');
    });

    it('gericht_speichern: gleicher Name warnt (NAME_EXISTIERT), legt aber an; Gross/Klein und Leerzeichen egal', async () => {
      const r = await api.gerichtSpeichern({ name: ' spaghetti  BOLOGNESE ', angelegt_am: '2026-11-14' });
      assert.equal(r.neu, true);
      assert.deepEqual(r.warnungen, [{ code: 'NAME_EXISTIERT', id: 'G001' }, { code: 'NAME_EXISTIERT', id: 'G033' }]);
    });

    it('gericht_speichern: Aendern nur der genannten Felder, Zutaten bleiben ohne zutaten-Parameter', async () => {
      const vorher = (await api.lesen()).daten;
      const g1 = vorher.Gerichte.find((g) => g.id === 'G001');
      const r = await api.gerichtSpeichern({ id: 'G001', kcal_pro_portion: 650, favorit: 'nein' });
      assert.deepEqual(r, { ok: true, id: 'G001', neu: false, warnungen: [] });
      const nachher = (await api.lesen()).daten;
      assert.deepEqual(nachher.Gerichte.find((g) => g.id === 'G001'), { ...g1, kcal_pro_portion: 650, favorit: 'nein' });
      assert.deepEqual(nachher.Zutaten, vorher.Zutaten);
      assert.equal(nachher.Gerichte.length, 40);
      // kcal wieder leeren
      await api.gerichtSpeichern({ id: 'G001', kcal_pro_portion: '' });
      assert.equal((await api.lesen()).daten.Gerichte.find((g) => g.id === 'G001').kcal_pro_portion, '');
    });

    it('gericht_speichern: typ wird geschrieben und gelesen, ohne Angabe bleibt ein bestehendes Gericht unveraendert (hauptgericht)', async () => {
      const r1 = await api.gerichtSpeichern({ name: 'Kartoffelgratin als Beilage', angelegt_am: '2026-11-14', typ: 'beilage' });
      let g = (await api.lesen()).daten.Gerichte.find((x) => x.id === r1.id);
      assert.equal(g.typ, 'beilage');
      // vorhandene Gerichte der Testdatei haben keine eigene typ-Spalte befuellt -> gilt als hauptgericht
      const g1 = (await api.lesen()).daten.Gerichte.find((x) => x.id === 'G001');
      assert.equal(g1.typ === '' || g1.typ === 'hauptgericht', true, 'leer bzw. hauptgericht, nie beilage');
      // Aendern ohne typ laesst den vorhandenen Wert stehen
      await api.gerichtSpeichern({ id: r1.id, kcal_pro_portion: 300 });
      g = (await api.lesen()).daten.Gerichte.find((x) => x.id === r1.id);
      assert.equal(g.typ, 'beilage', 'typ bleibt ohne erneute Angabe erhalten');
      // explizit zurueck auf hauptgericht
      await api.gerichtSpeichern({ id: r1.id, typ: 'hauptgericht' });
      g = (await api.lesen()).daten.Gerichte.find((x) => x.id === r1.id);
      assert.equal(g.typ, 'hauptgericht');
    });

    it('gericht_speichern: zutaten ersetzen alle Zutaten dieses Gerichts, andere bleiben, Reihenfolge der anderen bleibt', async () => {
      const vorher = (await api.lesen()).daten.Zutaten;
      const andere = vorher.filter((z) => z.gericht_id !== 'G004');
      assert.ok(vorher.length - andere.length >= 3);
      await api.gerichtSpeichern({ id: 'G004' }, [{ name: 'Linsen', menge: 300, einheit: 'g', einkaufen: 'ja' }, { name: 'Zwiebel', menge: 1, einheit: 'Stück', einkaufen: 'ja' }]);
      const nachher = (await api.lesen()).daten.Zutaten;
      assert.deepEqual(nachher.filter((z) => z.gericht_id !== 'G004'), andere);
      assert.deepEqual(nachher.filter((z) => z.gericht_id === 'G004'), [
        { gericht_id: 'G004', pos: 1, name: 'Linsen', menge: 300, einheit: 'g', einkaufen: 'ja' },
        { gericht_id: 'G004', pos: 2, name: 'Zwiebel', menge: 1, einheit: 'Stück', einkaufen: 'ja' },
      ]);
      // leere Liste entfernt alle Zutaten
      await api.gerichtSpeichern({ id: 'G004' }, []);
      assert.equal((await api.lesen()).daten.Zutaten.filter((z) => z.gericht_id === 'G004').length, 0);
      assert.equal((await api.lesen()).daten.Zutaten.length, andere.length);
    });

    it('gericht_speichern: Eingabefehler, nichts wird geschrieben', async () => {
      const ok = { name: 'Test', angelegt_am: '2026-11-14' };
      const z = { name: 'Mehl', menge: 100, einheit: 'g', einkaufen: 'ja' };
      const cases = [
        [undefined, undefined, 'gericht'], [{ ...ok, name: '   ' }, undefined, 'gericht.name'], [{ ...ok, name: 'x'.repeat(121) }, undefined, 'gericht.name'],
        [{ ...ok, basis_portionen: 0 }, undefined, 'gericht.basis_portionen'], [{ ...ok, basis_portionen: 100 }, undefined, 'gericht.basis_portionen'],
        [{ ...ok, kcal_pro_portion: -5 }, undefined, 'gericht.kcal_pro_portion'], [{ ...ok, kcal_pro_portion: 0 }, undefined, 'gericht.kcal_pro_portion'],
        [{ ...ok, kcal_pro_portion: 'viel' }, undefined, 'gericht.kcal_pro_portion'], [{ ...ok, kcal_pro_portion: 5001 }, undefined, 'gericht.kcal_pro_portion'],
        [{ ...ok, favorit: 'eventuell' }, undefined, 'gericht.favorit'], [{ ...ok, reicht_fuer_tage: 8 }, undefined, 'gericht.reicht_fuer_tage'],
        [{ ...ok, status: 'fast' }, undefined, 'gericht.status'], [{ ...ok, angelegt_am: 'heute' }, undefined, 'gericht.angelegt_am'],
        [{ ...ok, typ: 'unsinn' }, undefined, 'gericht.typ'], [{ ...ok, typ: 'Hauptspeise' }, undefined, 'gericht.typ'],
        [{ ...ok, tags: 'x'.repeat(201) }, undefined, 'gericht.tags'],
        [ok, [{ ...z, name: '' }], 'zutaten[0].name'], [ok, [z, { ...z, menge: -1 }], 'zutaten[1].menge'], [ok, [{ ...z, menge: 'ein bisschen' }], 'zutaten[0].menge'],
        [ok, [{ ...z, einkaufen: 'vielleicht' }], 'zutaten[0].einkaufen'], [ok, [{ ...z, einheit: 'x'.repeat(21) }], 'zutaten[0].einheit'],
        [ok, 'Mehl', 'zutaten'], [ok, Array.from({ length: 101 }, () => z), 'zutaten'], [ok, [z, 7], 'zutaten[1]'],
        [{ id: 'G999', kcal_pro_portion: 400 }, undefined, 'gericht.id'],
      ];
      const dump0 = stable(await be.dump());
      for (const [g, zut, feld] of cases) {
        const p = g === undefined ? api.gerichtSpeichern(undefined) : api.gerichtSpeichern(g, zut);
        await rejects(p, feld === 'gericht.id' ? 'GERICHT_UNBEKANNT' : 'EINGABE_UNGUELTIG', feld);
      }
      assert.deepEqual(stable(await be.dump()), dump0, 'Fehler duerfen nichts veraendern');
    });

    it('gericht_speichern mit anfrage_id: gleiche Kennung aendert das schon angelegte Gericht, legt kein Doppel an (verlorene Antwort)', async () => {
      const n0 = (await tab(be, 'Gerichte')).length;
      const r1 = await api.gerichtSpeichern({ name: 'Wiederholt', angelegt_am: '2026-11-14' }, [{ name: 'Karotte', menge: 2, einheit: 'Stück', einkaufen: 'ja' }], 'f-abc_1');
      assert.deepEqual(r1, { ok: true, id: 'G041', neu: true, warnungen: [] });
      // Antwort ging verloren, die App schickt dasselbe nochmal, inzwischen mit geaendertem Namen und einer Zutat mehr
      const r2 = await api.gerichtSpeichern({ name: 'Wiederholt (neu)', angelegt_am: '2026-11-14' },
        [{ name: 'Karotte', menge: 2, einheit: 'Stück', einkaufen: 'ja' }, { name: 'Zwiebel', menge: 1, einheit: 'Stück', einkaufen: 'ja' }], 'f-abc_1');
      assert.deepEqual(r2, { ok: true, id: 'G041', neu: false, warnungen: [], wiederholt: true });
      const g = await tab(be, 'Gerichte');
      assert.equal(g.length, n0 + 1, 'nur eine neue Zeile');
      assert.equal(g.at(-1).name, 'Wiederholt (neu)');
      assert.equal(g.at(-1).status, 'fertig');
      const z = (await tab(be, 'Zutaten')).filter((x) => x.gericht_id === 'G041');
      assert.deepEqual(z.map((x) => [x.pos, x.name]), [[1, 'Karotte'], [2, 'Zwiebel']], 'Zutaten ersetzt, nicht verdoppelt');
      // andere Kennung oder keine Kennung: neues Gericht
      assert.equal((await api.gerichtSpeichern({ name: 'Anderes' }, undefined, 'f-xyz')).id, 'G042');
      assert.equal((await api.gerichtSpeichern({ name: 'Noch eins' })).id, 'G043');
      assert.equal((await tab(be, 'Gerichte')).length, n0 + 3);
    });

    it('gericht_speichern mit anfrage_id: erster Versuch ohne Zutaten (idee), zweiter mit Zutaten ergibt status fertig', async () => {
      await api.gerichtSpeichern({ name: 'Erst Idee' }, undefined, 'f-idee');
      assert.equal((await tab(be, 'Gerichte')).at(-1).status, 'idee');
      const r = await api.gerichtSpeichern({ name: 'Erst Idee' }, [{ name: 'Reis', menge: 100, einheit: 'g', einkaufen: 'ja' }], 'f-idee');
      assert.equal(r.wiederholt, true);
      assert.equal((await tab(be, 'Gerichte')).at(-1).status, 'fertig');
    });

    it('gericht_speichern mit anfrage_id: zweiter Versuch ohne Zutaten entfernt die des ersten (Nutzer hat sie inzwischen geloescht)', async () => {
      const r1 = await api.gerichtSpeichern({ name: 'Zutaten weg' }, [{ name: 'Karotte', menge: 2, einheit: 'Stück', einkaufen: 'ja' }], 'f-weg');
      assert.equal((await tab(be, 'Zutaten')).filter((x) => x.gericht_id === r1.id).length, 1);
      const r2 = await api.gerichtSpeichern({ name: 'Zutaten weg' }, undefined, 'f-weg');
      assert.equal(r2.id, r1.id); assert.equal(r2.wiederholt, true);
      assert.equal((await tab(be, 'Zutaten')).filter((x) => x.gericht_id === r1.id).length, 0);
      assert.equal((await tab(be, 'Gerichte')).at(-1).status, 'idee');
    });

    it('gericht_speichern mit anfrage_id: wurde das Gericht inzwischen geloescht, entsteht ein neues; mit id wird die Kennung ignoriert; ungueltige Kennung wird abgewiesen', async () => {
      const n0 = (await tab(be, 'Gerichte')).length;
      for (const bad of ['mit leerzeichen', 'x'.repeat(65), 'a/b', 'äöü']) {
        await rejects(api.gerichtSpeichern({ name: 'X' }, undefined, bad), 'EINGABE_UNGUELTIG', 'anfrage_id');
      }
      assert.equal((await tab(be, 'Gerichte')).length, n0, 'nichts geschrieben');
      // mit id: normale Aenderung
      const r = await api.gerichtSpeichern({ id: 'G001', favorit: 'ja' }, undefined, 'f-mit-id');
      assert.equal(r.neu, false); assert.equal(r.wiederholt, undefined);
    });

    it('Text bleibt Text: "=1+1", "5", "2026-11-20", "TRUE", "+49", "-", fuehrendes Apostroph', async () => {
      const nasty = ['=1+1', '5', '2026-11-20', 'TRUE', '+49 123', '- erst kochen', "'quoted", '007', '1,5', '12.3', '@home', '3/4'];
      for (const [i, t] of nasty.entries()) {
        await api.gerichtSpeichern({ name: t, tags: t, schritte: t, quelle: t, angelegt_am: '2026-11-14' }, [{ name: t, menge: 1, einheit: t, einkaufen: 'ja' }]);
        await api.bewertungSpeichern({ gericht_id: 'G011', datum: `2026-10-${String(i + 1).padStart(2, '0')}`, sterne: 3, notiz: t, von: t });
      }
      const d = (await api.lesen()).daten;
      const gs = d.Gerichte.slice(-nasty.length);
      nasty.forEach((t, i) => {
        const g = gs[i];
        assert.equal(g.name, t, 'name ' + t); assert.equal(g.tags, t, 'tags ' + t); assert.equal(g.schritte, t, 'schritte ' + t); assert.equal(g.quelle, t, 'quelle ' + t);
        assert.equal(typeof g.name, 'string');
        const z = d.Zutaten.find((x) => x.gericht_id === g.id);
        assert.equal(z.name, t); assert.equal(z.einheit, t);
        const b = d.Bewertungen.find((x) => x.datum === `2026-10-${String(i + 1).padStart(2, '0')}` && x.gericht_id === 'G011');
        assert.equal(b.notiz, t); assert.equal(b.von, t);
      });
    });

    it('Zahlen bleiben Zahlen: Menge 1,5 / "2,25" / 0 / 0.001, Portionen, kcal', async () => {
      await api.gerichtSpeichern({ name: 'Zahlentest', kcal_pro_portion: '512,5', basis_portionen: '4', angelegt_am: '2026-11-14' },
        [{ name: 'A', menge: 1.5, einheit: 'l' }, { name: 'B', menge: '2,25', einheit: 'kg' }, { name: 'C', menge: 0, einheit: 'g' }, { name: 'D', menge: 0.001, einheit: 'g' }, { name: 'E', menge: '3', einheit: 'g' }]);
      const d = (await api.lesen()).daten;
      const g = d.Gerichte.at(-1);
      assert.equal(g.kcal_pro_portion, 512.5);
      assert.equal(g.basis_portionen, 4);
      assert.deepEqual(d.Zutaten.slice(-5).map((z) => z.menge), [1.5, 2.25, 0, 0.001, 3]);
    });

    // ---------------------------------------------------------------- Einstellungen
    it('einstellung_speichern: vorhandenen Schluessel aendern (keine Doppelzeile), unbekannt/ungueltig abweisen', async () => {
      assert.deepEqual(await api.einstellungSpeichern('standard_portionen', 4), { ok: true });
      await api.einstellungSpeichern('standard_portionen', '3');
      const e = (await api.lesen()).daten.Einstellungen;
      assert.deepEqual(e, [{ schluessel: 'standard_portionen', wert: 3 }, { schluessel: 'wiederholungssperre_tage', wert: 21 }]);
      await rejects(api.einstellungSpeichern('farbe', 1), 'EINGABE_UNGUELTIG', 'schluessel');
      for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) await rejects(api.einstellungSpeichern(k, 1), 'EINGABE_UNGUELTIG', 'schluessel');
      await rejects(api.einstellungSpeichern('standard_portionen', 0), 'EINGABE_UNGUELTIG', 'wert');
      await rejects(api.einstellungSpeichern('standard_portionen', 21), 'EINGABE_UNGUELTIG', 'wert');
      await rejects(api.einstellungSpeichern('wiederholungssperre_tage', 61), 'EINGABE_UNGUELTIG', 'wert');
      await rejects(api.einstellungSpeichern('standard_portionen', 2.5), 'EINGABE_UNGUELTIG', 'wert');
      assert.deepEqual((await api.lesen()).daten.Einstellungen, e);
    });

    it('Sheet belegt: Schreiben meldet BESCHAEFTIGT, Lesen geht weiter', async () => {
      await be.inject({ modus: 'beschaeftigt', anzahl: null });
      const c = be.client();
      await rejects(c.bewertungSpeichern({ gericht_id: 'G011', datum: '2026-11-10', sterne: 4 }), 'BESCHAEFTIGT');
      await rejects(c.planSpeichern([{ datum: '2026-11-18', gericht_id: 'G001', portionen: 2 }]), 'BESCHAEFTIGT');
      assert.equal((await c.lesen()).daten.Gerichte.length, 40);
      assert.equal(be.fetch.calls.length, 3, 'Schreiben wird nicht automatisch wiederholt');
    });

    it('20 gleichzeitige Bewertungen gehen alle durch', async () => {
      const n0 = (await tab(be, 'Bewertungen')).length;
      await Promise.all(Array.from({ length: 20 }, (_, i) => be.client().bewertungSpeichern({ gericht_id: 'G011', datum: `2026-09-${String(i + 1).padStart(2, '0')}`, sterne: (i % 5) + 1, von: 'R' })));
      assert.equal((await tab(be, 'Bewertungen')).length, n0 + 20);
    });
  });
}

// Eigenheiten, wie sie in einer von Hand gepflegten Tabelle vorkommen: Luecke in den Nummern, leere Zeile mittendrin, Leerzeichen in der Kopfzeile.
// Beide Backends bekommen dieselbe verformte Tabelle und muessen sich gleich verhalten.
describe('Protokoll: von Hand gepflegte Tabelle (Nummernluecke, leere Zeile, Leerzeichen in Kopfzeile)', () => {
  for (const kind of KINDS) {
    describe(kind, () => {
      let be, tmp;
      before(async () => {
        if (kind === 'mock') {
          tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-variante-'));
          const out = path.join(tmp, 'variante.xlsx');
          const py = [
            'import sys, openpyxl',
            'wb = openpyxl.load_workbook(sys.argv[1])',
            'g = wb["Gerichte"]',
            'assert g.cell(11, 1).value == "G010", g.cell(11, 1).value',
            'g.delete_rows(11)',
            'g.cell(1, 2).value = " name "',
            'b = wb["Bewertungen"]',
            'for c in range(1, b.max_column + 1): b.cell(3, c).value = None',
            'wb.save(sys.argv[2])',
          ].join('\n');
          execFileSync('python3', ['-I', '-c', py, dataFile('kochplaner_test'), out]);
          be = await startBackend('mock', 'kochplaner_test', { xlsx: out });
        } else {
          be = await startBackend('appsscript');
          const g = be.sim.book.getSheetByName('Gerichte');
          assert.equal(g.getRange(11, 1).getValue(), 'G010');
          g.deleteRows(11, 1);
          g.getRange(1, 2).setValues([[' name ']]);
          const b = be.sim.book.getSheetByName('Bewertungen');
          b.getRange(3, 1, 1, b.getLastColumn()).setValues([new Array(b.getLastColumn()).fill('')]);
        }
      });
      after(async () => { await be.stop(); if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

      it('lesen: Kopfzeile ohne Leerzeichen, leere Zeile wird uebersprungen, keine Phantom-Gerichte', async () => {
        const d = (await be.client().lesen()).daten;
        assert.equal(d.Gerichte.length, 39);
        assert.ok('name' in d.Gerichte[0], 'Schluessel "name" erwartet, bekam ' + Object.keys(d.Gerichte[0]).join('|'));
        assert.ok(!(' name ' in d.Gerichte[0]));
        assert.equal(d.Gerichte[0].name, golden('kochplaner_test.raw.json').Gerichte[0].name);
        assert.equal(d.Bewertungen.length, 24, 'eine von 25 Zeilen ist leer');
        assert.ok(d.Bewertungen.every((r) => Object.values(r).some((v) => v !== '')), 'keine leere Zeile in der Antwort');
      });

      it('gericht_speichern: neue Nummer = hoechste vorhandene + 1, nicht Anzahl + 1; Name landet trotz Leerzeichen in der Kopfzeile in der richtigen Spalte', async () => {
        const api = be.client();
        const r = await api.gerichtSpeichern({ name: 'Nach der Luecke', angelegt_am: '2026-11-14' });
        assert.equal(r.id, 'G041', 'Anzahl+1 waere G040 und damit doppelt');
        const d = (await api.lesen()).daten.Gerichte;
        assert.equal(d.length, 40);
        assert.equal(new Set(d.map((x) => x.id)).size, 40, 'alle Nummern verschieden');
        assert.equal(d.at(-1).name, 'Nach der Luecke');
        const r2 = await api.gerichtSpeichern({ name: 'Noch eins', angelegt_am: '2026-11-14' });
        assert.equal(r2.id, 'G042');
      });
    });
  }
});

describe('Protokoll gegen Code.gs: Besonderheiten des Apps-Script-Simulators', () => {
  let be;
  before(async () => { be = await startBackend('appsscript'); });
  beforeEach(async () => { await be.reset(); });

  it('nicht eingerichtet (kein Token in den Script-Eigenschaften): NICHT_EINGERICHTET, auch mit Token', async () => {
    const b = await startBackend('appsscript', 'kochplaner_test', { simOpts: { configured: false } });
    const r = await b.rawPost(JSON.stringify({ token: TOKEN, aktion: 'lesen' }));
    assert.equal(r.fehler.code, 'NICHT_EINGERICHTET');
  });

  it('Datumszellen werden in Europe/Berlin gelesen, auch kurz nach Mitternacht (kein Tag-Versatz)', async () => {
    const sim = be.sim;
    const sheet = sim.book.getSheetByName('Bewertungen');
    const last = sheet.getLastRow();
    // 2026-03-29 ist der Tag der Zeitumstellung, 00:30 Berlin liegt am Vortag in UTC
    const { berlinDate } = await import('../tools/gs_sim.mjs');
    sheet.getRange(last + 1, 1, 1, 5).setValues([['G011', berlinDate(2026, 3, 29, 0, 30), 3, '', 'x']]);
    sheet.getRange(last + 2, 1, 1, 5).setValues([['G011', berlinDate(2026, 10, 25, 0, 0), 3, '', 'y']]);
    assert.equal(berlinDate(2026, 3, 29, 0, 30).toISOString().slice(0, 10), '2026-03-28', 'Vorbedingung: UTC-Datum waere falsch');
    const r = JSON.parse(sim.post(JSON.stringify({ token: TOKEN, aktion: 'lesen' })).body);
    assert.equal(r.daten.Bewertungen.at(-2).datum, '2026-03-29T00:30:00');
    assert.equal(r.daten.Bewertungen.at(-1).datum, '2026-10-25');
  });

  it('Gerichts-Nummern ab 1000: G1000, G1001 (kein Rueckfall auf G000/G001 mit doppelten Nummern)', async () => {
    const g = be.sim.book.getSheetByName('Gerichte');
    g.getRange(g.getLastRow(), 1).setValues([['G999']]);
    const api = be.client();
    assert.equal((await api.gerichtSpeichern({ name: 'Tausend', angelegt_am: '2026-11-14' })).id, 'G1000');
    assert.equal((await api.gerichtSpeichern({ name: 'Tausend eins', angelegt_am: '2026-11-14' })).id, 'G1001');
    const ids = (await api.lesen()).daten.Gerichte.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, 'alle Nummern verschieden');
  });

  it('Sperre wird nach Fehlern wieder freigegeben', async () => {
    const api = be.client();
    await assert.rejects(api.bewertungSpeichern({ gericht_id: 'G999', datum: '2026-11-10', sterne: 3 }));
    await assert.rejects(api.planSpeichern([{ datum: 'x', gericht_id: 'G001', portionen: 2 }]));
    assert.equal(be.sim.state.locked, false);
    assert.equal((await api.bewertungSpeichern({ gericht_id: 'G011', datum: '2026-11-10', sterne: 3 })).ok, true);
  });

  it('Spalten, die der Nutzer selbst ergaenzt hat, bleiben beim Aendern erhalten', async () => {
    const sheet = be.sim.book.getSheetByName('Gerichte');
    const lastCol = sheet.getLastColumn();
    sheet.getRange(1, lastCol + 1, 1, 1).setValues([['meine_notiz']]);
    sheet.getRange(2, lastCol + 1, 1, 1).setValues([['Oma-Rezept']]);
    const api = be.client();
    await api.gerichtSpeichern({ id: 'G001', kcal_pro_portion: 111 });
    const g = (await api.lesen()).daten.Gerichte;
    assert.equal(g[0].meine_notiz, 'Oma-Rezept');
    assert.equal(g[0].kcal_pro_portion, 111);
    await api.gerichtSpeichern({ name: 'Neu', angelegt_am: '2026-11-14' });
    assert.equal((await api.lesen()).daten.Gerichte.at(-1).meine_notiz, '');
  });

  it('fehlende Tabs/Spalten: Lesen meldet TAB_FEHLT, Schreiben SPALTE_FEHLT', async () => {
    const sim = be.sim;
    sim.book.deleteSheet(sim.book.getSheetByName('Einstellungen'));
    assert.equal(JSON.parse(sim.post(JSON.stringify({ token: TOKEN, aktion: 'lesen' })).body).fehler.code, 'TAB_FEHLT');
    await be.reset();
    const p = be.sim.book.getSheetByName('Plan');
    p.getRange(1, 5, 1, 1).setValues([['fix']]);
    const r = JSON.parse(be.sim.post(JSON.stringify({ token: TOKEN, aktion: 'plan_speichern', zeilen: [{ datum: '2026-11-18', gericht_id: 'G001', portionen: 2 }] })).body);
    assert.equal(r.fehler.code, 'SPALTE_FEHLT');
    assert.match(r.fehler.meldung, /fixiert/);
    assert.equal(JSON.parse(be.sim.post(JSON.stringify({ token: TOKEN, aktion: 'lesen' })).body).ok, true, 'Lesen braucht nur den Tab');
  });
});

describe('setup() in Code.gs', () => {
  it('legt Tabs und Kopfzeilen an, schreibt Standardwerte, erzeugt Token, ueberschreibt nie Daten, ist wiederholbar', async () => {
    const sim = (await import('../tools/gs_sim.mjs')).createAppsScript({ empty: true, configured: false });
    sim.book.insertSheet('Tabelle1');
    const log1 = sim.run('setup');
    // Ausgaben (F25) ist Teil von KP.TABS, damit setup() den Tab mit Kopfzeile anlegt; die allgemeine Aktion
    // "lesen" liefert ihn trotzdem nicht mit (siehe Test weiter unten, KP.LESEN_TABS).
    assert.deepEqual(sim.book.getSheets().map((s) => s.getName()),
      ['Gerichte', 'Zutaten', 'Plan', 'Bewertungen', 'Einstellungen', 'Lebensmittel', 'Richtgewichte', 'Ausgaben']);
    assert.match(log1, /Leeres Standard-Tab entfernt: Tabelle1/);
    assert.equal(sim.book.getSpreadsheetTimeZone(), 'Europe/Berlin', 'Zeitzone des Sheets = Zeitzone der Schnittstelle');
    assert.match(log1, /Zeitzone des Sheets auf Europe\/Berlin gestellt/);
    const token = sim.props.get('TOKEN');
    assert.match(token, /^[0-9a-f]{64}$/);
    assert.match(log1, new RegExp('TOKEN: ' + token));
    assert.equal(sim.book.getSheetByName('Gerichte').getRange(1, 2).getValue(), 'name');
    assert.equal(sim.book.getSheetByName('Gerichte').frozen, 1);
    assert.deepEqual(sim.dump().Einstellungen, [{ schluessel: 'standard_portionen', wert: 2 }, { schluessel: 'wiederholungssperre_tage', wert: 21 }]);
    // gleich danach benutzbar
    const r = JSON.parse(sim.post(JSON.stringify({ token, aktion: 'gericht_speichern', gericht: { name: 'Erstes Gericht', angelegt_am: '2026-11-14' } })).body);
    assert.equal(r.id, 'G001');
    // zweiter Lauf: nichts geht verloren, Token bleibt
    const before = JSON.stringify(sim.dump());
    const log2 = sim.run('setup');
    assert.equal(JSON.stringify(sim.dump()), before);
    assert.equal(sim.props.get('TOKEN'), token);
    assert.doesNotMatch(log2, /Neues Token erzeugt/);
    assert.doesNotMatch(log2, /Zeitzone/, 'zweiter Lauf stellt nichts um');
    assert.match(log2, /Tab vorhanden und vollständig: Plan/);
    // Token erneuern macht das alte ungueltig
    const neu = sim.run('tokenErneuern');
    assert.notEqual(neu, token);
    assert.equal(JSON.parse(sim.post(JSON.stringify({ token, aktion: 'ping' })).body).fehler.code, 'TOKEN_FALSCH');
    assert.equal(JSON.parse(sim.post(JSON.stringify({ token: neu, aktion: 'ping' })).body).ok, true);
  });

  it('setup() an einem Tab mit fehlenden (nicht ergaenzbaren) Spalten warnt, ohne etwas zu veraendern', async () => {
    const sim = (await import('../tools/gs_sim.mjs')).createAppsScript({ empty: true, configured: false });
    const s = sim.book.insertSheet('Plan');
    // beilage_id ist schon da (sonst wuerde setup() sie automatisch ergaenzen, siehe naechster Test); die anderen 4 fehlen echt.
    s.getRange(1, 1, 1, 3).setValues([['datum', 'gericht_id', 'beilage_id']]);
    s.getRange(2, 1, 1, 3).setValues([['2026-11-18', 'G001', '']]);
    const log = sim.run('setup');
    assert.match(log, /ACHTUNG Plan: Spalten fehlen: woche_start, portionen, fixiert, geaendert_am/);
    assert.equal(s.getLastColumn(), 3);
  });

  it('setup() ergaenzt die neuen optionalen Spalten typ/beilage_id in bestehenden Tabs automatisch, ohne Daten zu ueberschreiben', async () => {
    const sim = (await import('../tools/gs_sim.mjs')).createAppsScript({ empty: true, configured: false });
    const g = sim.book.insertSheet('Gerichte');
    g.getRange(1, 1, 1, 13).setValues([['id', 'name', 'basis_portionen', 'kcal_pro_portion', 'tags', 'favorit', 'nie_wieder',
      'aktiv', 'reicht_fuer_tage', 'schritte', 'quelle', 'angelegt_am', 'status']]);
    g.getRange(2, 1, 1, 13).setValues([['G001', 'Alt-Gericht', 4, 500, '', 'nein', 'nein', 'ja', 1, '', 'Alt', '2026-01-01', 'fertig']]);
    const p = sim.book.insertSheet('Plan');
    p.getRange(1, 1, 1, 6).setValues([['woche_start', 'datum', 'gericht_id', 'portionen', 'fixiert', 'geaendert_am']]);
    p.getRange(2, 1, 1, 6).setValues([['2026-11-18', '2026-11-18', 'G001', 2, 'nein', '2026-11-18T09:00:00']]);
    const log = sim.run('setup');
    assert.match(log, /Spalte ergänzt in Gerichte: typ/);
    assert.match(log, /Spalte ergänzt in Plan: beilage_id/);
    assert.equal(g.getRange(1, 14).getValue(), 'typ');
    assert.equal(g.getRange(2, 14).getValue(), '', 'bestehende Zeile bleibt leer (= hauptgericht), wird nicht erfunden');
    assert.equal(g.getRange(2, 1).getValue(), 'G001', 'vorhandene Daten unberuehrt');
    assert.equal(g.getRange(2, 2).getValue(), 'Alt-Gericht', 'vorhandene Daten unberuehrt');
    assert.equal(p.getRange(1, 7).getValue(), 'beilage_id');
    assert.equal(p.getRange(2, 7).getValue(), '', 'bestehende Zeile bleibt leer (= keine Beilage)');
    assert.equal(p.getRange(2, 3).getValue(), 'G001', 'gericht_id unveraendert');
    // danach sofort benutzbar, inklusive der neuen Spalten
    const token = sim.props.get('TOKEN');
    const r = JSON.parse(sim.post(JSON.stringify({ token, aktion: 'gericht_speichern', gericht: { name: 'Neu', angelegt_am: '2026-11-14', typ: 'beilage' } })).body);
    assert.equal(r.ok, true);
    assert.equal(g.getRange(3, 14).getValue(), 'beilage');
  });
});

// Die Live-Pruefung (nur lesend, fuer die echte URL) muss selbst gegen beide Backends funktionieren und Fehler erkennen.
describe('Live-Pruefung tests/contract/live.mjs', () => {
  for (const kind of KINDS) {
    it(`alle Pruefungen bestehen gegen ${kind} und aendern nichts`, async () => {
      const { liveChecks } = await import('./live.mjs');
      const be = await startBackend(kind);
      try {
        const vorher = JSON.stringify(await be.dump());
        const res = await liveChecks({ url: be.url, token: TOKEN, fetchImpl: be.kind === 'mock' ? globalThis.fetch : be.sim.makeFetch({ inj: {} }) });
        assert.deepEqual(res.filter((r) => !r.ok), []);
        assert.ok(res.length >= 7);
        assert.equal(JSON.stringify(await be.dump()), vorher, 'Live-Pruefung darf nichts schreiben');
      } finally { await be.stop(); }
    });
  }
  it('erkennt ein falsch eingerichtetes Backend (Token der Pruefung passt nicht)', async () => {
    const { liveChecks } = await import('./live.mjs');
    const be = await startBackend('appsscript');
    const res = await liveChecks({ url: be.url, token: 'falsch', fetchImpl: be.sim.makeFetch({ inj: {} }) });
    assert.ok(res.some((r) => !r.ok && /ping/.test(r.name)));
  });
});
