// Gegenprobe: Code.gs (im Simulator) und der Python-Mock sind unabhaengig voneinander geschrieben.
// Beide bekommen dieselbe zufaellige Folge gueltiger und ungueltiger Aufrufe und muessen jedes Mal dieselbe Antwort geben
// und am Ende denselben Sheet-Inhalt haben.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBackend, stable } from './harness.mjs';
import { mulberry32 } from '../../app/js/core/shuffle.js';

const NASTY = ['=1+1', '5', '2026-11-20', 'TRUE', '+49 123', '- erst kochen', "'quoted", '007', '1,5', '12.3', '@home', '3/4', 'Käsespätzle', 'Crème brûlée', 'ß-Test',
  'mit "Anführungszeichen"', 'Zeile1\nZeile2', 'Tab\tTab', '😀 Smiley', '<b>fett</b>', '  außen Leerzeichen  ', '0', 'false', '-3', '1e3'];
const WORDS = ['Suppe', 'Auflauf', 'Pfanne', 'Salat', 'Curry', 'Gratin', 'Eintopf', 'Bowl', 'Wrap', 'Risotto'];
const UNITS = ['g', 'kg', 'ml', 'l', 'EL', 'TL', 'Stück', 'Dose', 'Bund', 'Prise', '', 'ML', 'Stk.'];
const MENGEN = [100, 250, 1.5, '2,25', '', 0, 3, '0,5', 0.001, 1000, '7', 99999, -1, 'viel', '1/2', 100001, '1.5'];
const BEWERTER = ['René', 'Partnerin', 'Gast', ''];

function makeOps(seed, n) {
  const rnd = mulberry32(seed);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const day = (m0 = 10) => `2026-${String(int(m0, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;
  const stamp = () => `${day()}T${String(int(0, 23)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`;
  const gid = () => (rnd() < 0.04 ? pick(['G999', '', 'x']) : 'G' + String(int(1, 40)).padStart(3, '0'));
  const ops = [];
  for (let i = 0; i < n; i++) {
    const t = rnd();
    if (t < 0.28) {
      const cnt = int(1, 7);
      const used = new Set();
      const zeilen = Array.from({ length: cnt }, () => {
        let d = day(); while (used.has(d)) d = day(); used.add(d);
        const z = { datum: d, gericht_id: rnd() < 0.1 ? '' : gid(), portionen: rnd() < 0.05 ? pick([0, 21, 2.5, 'x']) : int(1, 20), fixiert: pick(['ja', 'nein', true, false, undefined, '']), geaendert_am: stamp() };
        if (rnd() < 0.5) z.woche_start = day();
        if (rnd() < 0.03) z.datum = pick(['2026-02-30', 'morgen', '']);
        return z;
      });
      ops.push({ name: 'plan_speichern', args: { zeilen } });
    } else if (t < 0.5) {
      ops.push({ name: 'bewertung_speichern', args: { gericht_id: gid(), datum: day(9), sterne: rnd() < 0.06 ? pick([0, 6, 2.5, 'x', undefined]) : int(1, 5), notiz: rnd() < 0.5 ? pick(NASTY) : '', von: pick(BEWERTER) } });
    } else if (t < 0.85) {
      const g = { angelegt_am: day() };
      if (rnd() < 0.85) g.name = rnd() < 0.5 ? pick(NASTY) : `${pick(WORDS)} ${pick(WORDS)}`; else if (rnd() < 0.5) g.name = pick(['', '   ']);
      if (rnd() < 0.4) g.basis_portionen = rnd() < 0.1 ? pick([0, 100]) : int(1, 8);
      if (rnd() < 0.5) g.kcal_pro_portion = rnd() < 0.15 ? pick(['', 0, -4, 'x', 5001, '512,5']) : int(100, 1500);
      if (rnd() < 0.3) g.tags = pick(NASTY);
      if (rnd() < 0.3) g.favorit = pick(['ja', 'nein', true, false, 'vielleicht']);
      if (rnd() < 0.2) g.nie_wieder = pick(['ja', 'nein']);
      if (rnd() < 0.2) g.aktiv = pick(['ja', 'nein']);
      if (rnd() < 0.2) g.reicht_fuer_tage = pick([1, 2, 3, 7, 8, 0]);
      if (rnd() < 0.4) g.schritte = pick(NASTY);
      if (rnd() < 0.2) g.status = pick(['fertig', 'idee', 'fast']);
      if (rnd() < 0.3) g.quelle = pick(NASTY);
      if (rnd() < 0.5) g.id = gid();
      const args = { gericht: g };
      if (rnd() < 0.7) {
        args.zutaten = Array.from({ length: int(0, 6) }, () => ({
          name: rnd() < 0.03 ? '' : rnd() < 0.3 ? pick(NASTY) : pick(['Mehl', 'Zwiebel', 'Eier', 'Milch', 'Salz', 'Butter']), menge: pick(MENGEN), einheit: pick(UNITS), einkaufen: pick(['ja', 'nein', undefined, true, false, 'ja']),
        }));
      }
      ops.push({ name: 'gericht_speichern', args });
    } else {
      ops.push({ name: 'einstellung_speichern', args: { schluessel: pick(['standard_portionen', 'wiederholungssperre_tage', 'standard_portionen', 'farbe']), wert: rnd() < 0.15 ? pick([0, 99, 2.5, 'x']) : int(1, 20) } });
    }
  }
  return ops;
}

// Client-Methoden haben feste Parameter; fuer die Gegenprobe geht es direkt ueber das Protokoll (auch kaputte Eingaben)
const send = (be, op) => be.rawPost(JSON.stringify({ token: be.token, aktion: op.name, ...op.args }));

describe('Gegenprobe Code.gs gegen Mock', () => {
  let mock, gs;
  before(async () => { [mock, gs] = await Promise.all([startBackend('mock'), startBackend('appsscript')]); });
  after(async () => { await mock.stop(); });

  for (const seed of [1, 2, 3]) {
    it(`zufaellige Folge (Seed ${seed}, 120 Aufrufe): gleiche Antworten, gleicher Sheet-Inhalt`, async () => {
      await Promise.all([mock.reset(), gs.reset()]);
      const ops = makeOps(seed, 120);
      let okCount = 0, errCount = 0;
      for (const [i, op] of ops.entries()) {
        const a = stable(await send(mock, op)), b = stable(await send(gs, op));
        assert.deepEqual(b, a, `Aufruf ${i} (${op.name}) ${JSON.stringify(op.args).slice(0, 300)}`);
        a.ok ? okCount++ : errCount++;
        if (i % 20 === 19) assert.deepEqual(await gs.dump(), await mock.dump(), `Sheet-Inhalt nach Aufruf ${i}`);
      }
      const [ra, rb] = [await mock.client().lesen(), await gs.client().lesen()];
      assert.deepEqual(stable(rb), stable(ra));
      assert.deepEqual(await gs.dump(), await mock.dump());
      // Lesen und unabhaengiger Sheet-Dump zeigen dasselbe
      assert.deepEqual(rb.daten, await gs.dump());
      assert.ok(okCount > 40 && errCount > 5, `Mischung gueltig/ungueltig: ${okCount}/${errCount}`);
    });
  }
});
