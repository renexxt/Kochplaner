// F24 Ausgaben erfassen: ausgabe_speichern, ausgaben_lesen. Eigene Datei (nicht protocol.test.mjs), damit sie
// nicht mit parallelen Aenderungen an den Haupt-Backends kollidiert (siehe PR-Beschreibung).
//
// Der Tab "Ausgaben" steht nicht in der geteilten Testdatei data/kochplaner_test.xlsx (die bleibt fuer dieses
// Feature unangetastet). Stattdessen:
//  - mock: eine Kopie der Testdatei in einem Temp-Ordner bekommt den Tab "Ausgaben" per openpyxl dazu
//    (gleiches Muster wie der bestehende Test "von Hand gepflegte Tabelle" in protocol.test.mjs).
//  - appsscript: ein frischer, leerer Simulator plus ein echter setup()-Lauf legt alle sechs Tabs an,
//    genau wie es Rene am echten Sheet einmal tun wird.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ApiError, createClient } from '../../app/js/adapters/api.js';
import { createAppsScript } from '../tools/gs_sim.mjs';
import { startBackend, KINDS, dataFile, SIM_URL } from './harness.mjs';

const rejects = async (p, code, feld) => {
  await assert.rejects(p, (e) => {
    assert.ok(e instanceof ApiError, 'ApiError erwartet, bekam ' + e);
    assert.equal(e.code, code, e.message);
    if (feld) assert.equal(e.feld, feld);
    return true;
  });
};

describe('Ausgaben (F24): ausgabe_speichern, ausgaben_lesen', () => {
  for (const kind of KINDS) {
    describe(kind, () => {
      let mockBe, tmp;
      let sim, token, api;

      before(async () => {
        if (kind === 'mock') {
          tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-ausgaben-'));
          const out = path.join(tmp, 'mit_ausgaben.xlsx');
          const py = [
            'import sys, openpyxl',
            'wb = openpyxl.load_workbook(sys.argv[1])',
            'ws = wb.create_sheet("Ausgaben")',
            'ws.append(["datum", "betrag", "beschreibung", "angelegt_am"])',
            'wb.save(sys.argv[2])',
          ].join('\n');
          execFileSync('python3', ['-I', '-c', py, dataFile('kochplaner_test'), out]);
          mockBe = await startBackend('mock', 'kochplaner_test', { xlsx: out });
        }
      });
      after(async () => {
        if (kind === 'mock') { await mockBe.stop(); fs.rmSync(tmp, { recursive: true, force: true }); }
      });

      // appsscript: jeder Test bekommt einen frischen, ueber setup() eingerichteten Simulator (kein startBackend,
      // das wuerde mit vorbefuellten Golden-Daten ohne Ausgaben-Tab seeden, siehe harness.mjs).
      beforeEach(async () => {
        if (kind === 'mock') {
          await mockBe.reset();
          api = mockBe.client();
        } else {
          sim = createAppsScript({ empty: true, configured: false });
          sim.run('setup');
          token = sim.props.get('TOKEN');
          api = createClient({ url: SIM_URL, token, fetchImpl: sim.makeFetch({ inj: {} }), retryDelayMs: 5 });
        }
      });

      const dump = async () => (kind === 'mock' ? mockBe.dump() : sim.dump());
      const raw = async (text) => (kind === 'mock' ? mockBe.rawPost(text) : JSON.parse(sim.post(text).body));

      it('ausgaben_lesen auf einem frischen Tab: leere Liste', async () => {
        const r = await api.ausgabenLesen();
        assert.deepEqual(r, { ok: true, ausgaben: [] });
      });

      it('ausgabe_speichern legt eine neue Zeile an; angelegt_am setzt die Schnittstelle selbst', async () => {
        const r = await api.ausgabeSpeichern({ datum: '2026-11-20', betrag: '23,50', beschreibung: 'Wocheneinkauf' });
        assert.deepEqual(r, { ok: true });
        const liste = (await api.ausgabenLesen()).ausgaben;
        assert.equal(liste.length, 1);
        assert.equal(liste[0].datum, '2026-11-20');
        assert.equal(liste[0].betrag, 23.5);
        assert.equal(liste[0].beschreibung, 'Wocheneinkauf');
        assert.match(String(liste[0].angelegt_am), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
        const ausgabenTab = (await dump()).Ausgaben;
        assert.deepEqual(ausgabenTab, liste, 'ausgaben_lesen entspricht dem Tab-Inhalt');
      });

      it('ausgabe_speichern: kein Upsert, jeder Aufruf ist eine eigene Zeile (auch gleicher Tag, gleicher Betrag)', async () => {
        await api.ausgabeSpeichern({ datum: '2026-11-20', betrag: 10, beschreibung: 'Brot' });
        await api.ausgabeSpeichern({ datum: '2026-11-20', betrag: 10, beschreibung: 'Brot' });
        const liste = (await api.ausgabenLesen()).ausgaben;
        assert.equal(liste.length, 2);
      });

      it('ausgabe_speichern: Sonderfall unabhaengig vom Einkaufszettel, z. B. 10 kg Mehl bei der Muehle', async () => {
        await api.ausgabeSpeichern({ datum: '2026-10-01', betrag: '45,90', beschreibung: '10 kg Mehl, Mühle' });
        const liste = (await api.ausgabenLesen()).ausgaben;
        assert.deepEqual(liste.map((a) => a.beschreibung), ['10 kg Mehl, Mühle']);
      });

      it('ausgabe_speichern: angelegt_am wird ignoriert, wenn mitgeschickt (Serverzeit gewinnt)', async () => {
        await api.ausgabeSpeichern({ datum: '2026-11-20', betrag: 5, beschreibung: 'Test', angelegt_am: '1999-01-01T00:00:00' });
        const liste = (await api.ausgabenLesen()).ausgaben;
        assert.notEqual(liste[0].angelegt_am, '1999-01-01T00:00:00');
      });

      it('ausgabe_speichern: Eingabefehler, nichts wird geschrieben', async () => {
        const ok = { datum: '2026-11-20', betrag: '23,50', beschreibung: 'Test' };
        const cases = [
          [{ ...ok, datum: undefined }, 'datum'], [{ ...ok, datum: '2026-13-01' }, 'datum'], [{ ...ok, datum: '20.11.2026' }, 'datum'],
          [{ ...ok, betrag: undefined }, 'betrag'], [{ ...ok, betrag: 0 }, 'betrag'], [{ ...ok, betrag: -5 }, 'betrag'],
          [{ ...ok, betrag: 'viel' }, 'betrag'], [{ ...ok, betrag: 100001 }, 'betrag'],
          [{ ...ok, beschreibung: '' }, 'beschreibung'], [{ ...ok, beschreibung: '   ' }, 'beschreibung'], [{ ...ok, beschreibung: 'x'.repeat(201) }, 'beschreibung'],
        ];
        for (const [args, feld] of cases) await rejects(api.ausgabeSpeichern(args), 'EINGABE_UNGUELTIG', feld);
        assert.deepEqual((await api.ausgabenLesen()).ausgaben, [], 'kein Fehlerfall hat etwas geschrieben');
      });

      it('ausgabe_speichern: Betrag mit Punkt oder Komma, ganze Zahl bleibt ganze Zahl', async () => {
        await api.ausgabeSpeichern({ datum: '2026-11-20', betrag: '12.34', beschreibung: 'Punkt' });
        await api.ausgabeSpeichern({ datum: '2026-11-20', betrag: 20, beschreibung: 'Ganzzahl' });
        const liste = (await api.ausgabenLesen()).ausgaben;
        assert.equal(liste.find((a) => a.beschreibung === 'Punkt').betrag, 12.34);
        assert.equal(liste.find((a) => a.beschreibung === 'Ganzzahl').betrag, 20);
      });

      it('Token falsch/fehlend wird abgewiesen, schreibt nichts', async () => {
        const bad = await raw(JSON.stringify({ token: 'falsch', aktion: 'ausgabe_speichern', datum: '2026-11-20', betrag: 5, beschreibung: 'x' }));
        assert.equal(bad.fehler.code, 'TOKEN_FALSCH');
        assert.deepEqual((await dump()).Ausgaben, []);
      });

      it('die allgemeine Aktion "lesen" liefert den Tab Ausgaben bewusst nicht mit', async () => {
        await api.ausgabeSpeichern({ datum: '2026-11-20', betrag: 5, beschreibung: 'x' });
        const r = await api.lesen();
        assert.deepEqual(Object.keys(r.daten), ['Gerichte', 'Zutaten', 'Plan', 'Bewertungen', 'Einstellungen']);
      });
    });
  }
});
