import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../app/js/state.js';
import { createStorage } from '../../app/js/adapters/storage.js';
import { ApiError } from '../../app/js/adapters/api.js';
import { encodeSetup } from '../../app/js/core/setupcode.js';
import { fakeClock, weekDays } from '../../app/js/core/dates.js';
import { golden } from './helpers.mjs';

const TOKEN = 'k'.repeat(16) + 'ABCDEF0123456789'.repeat(3);
const CODE = encodeSetup({ url: 'https://script.example.test/macros/s/X/exec', token: TOKEN });
const memBackend = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

/** Falsche Schnittstelle mit Aufzeichnung; fail = Fehler, der beim naechsten Schreiben geworfen wird */
function fakeApi(raw = golden('kochplaner_test.raw.json')) {
  const api = { calls: [], fail: null, raw: JSON.parse(JSON.stringify(raw)), reads: 0 };
  const maybeFail = () => { if (api.fail) { const e = api.fail; throw e; } };
  api.client = {
    ping: async () => ({ ok: true }),
    lesen: async () => { api.reads += 1; if (api.readFail) throw api.readFail; return { ok: true, daten: JSON.parse(JSON.stringify(api.raw)) }; },
    planSpeichern: async (z) => { maybeFail(); api.calls.push(['plan', z]); return { ok: true }; },
    bewertungSpeichern: async (b) => { maybeFail(); api.calls.push(['bewertung', b]); return { ok: true }; },
    gerichtSpeichern: async (g, z) => { maybeFail(); api.calls.push(['gericht', g, z]); return { ok: true, id: g.id || 'G041', neu: !g.id, warnungen: [] }; },
    einstellungSpeichern: async (k, v) => { maybeFail(); api.calls.push(['einstellung', k, v]); return { ok: true }; },
  };
  return api;
}
function build({ backend = memBackend(), api = fakeApi(), jetzt = '2026-11-14T08:30:00Z' } = {}) {
  const opened = []; const copied = [];
  const app = createApp({
    storage: createStorage(backend), clock: fakeClock(jetzt), makeClient: () => api.client, seedFor: (n) => 100 + n,
    openUrl: (u) => opened.push(u), copyText: async (t) => { copied.push(t); return true; }, shareText: async () => false,
  });
  return { app, api, backend, opened, copied };
}
const connected = async (o = {}) => { const b = build(o); await b.app.init(); await b.app.connect(CODE); return b; };
const netz = () => new ApiError('NETZWERK', 'Keine Verbindung.');

describe('Zustand: Start und Verbinden', () => {
  it('ohne Setup: 7 leere Tage ab heute, nichts gespeichert', async () => {
    const { app } = build(); await app.init();
    const s = app.state;
    assert.equal(s.setup, null);
    assert.equal(s.startIso, '2026-11-14');
    assert.deepEqual(s.slots.map((x) => x.datum), weekDays('2026-11-14').map((d) => d.datum));
    assert.ok(s.slots.every((x) => x.gericht_id === null && x.portionen === 2));
  });
  it('Verbinden lädt Gerichte und merkt sich das Setup; Neustart ohne Netz zeigt zuletzt geladene Daten', async () => {
    const b = await connected();
    assert.equal(b.app.state.norm.gerichte.length, 40);
    assert.ok(b.app.state.syncedAt);
    const api2 = fakeApi(); api2.readFail = netz();
    const b2 = build({ backend: b.backend, api: api2 });
    await b2.app.init(); await b2.app.refresh();
    assert.equal(b2.app.state.norm.gerichte.length, 40, 'Zwischenspeicher');
    assert.equal(b2.app.state.online, false);
    assert.equal(b2.app.state.loadError.code, 'NETZWERK');
    assert.match(b2.app.state.loadError.meldung, /Verbindung/);
  });
  it('falscher Code oder falsches Token: deutsche Meldung, altes Setup bleibt', async () => {
    const b = await connected();
    await assert.rejects(b.app.connect('quatsch'), (e) => e.code === 'SETUP_CODE_UNGUELTIG');
    b.api.client.ping = async () => { throw new ApiError('TOKEN_FALSCH', 'x'); };
    await assert.rejects(b.app.connect(CODE), (e) => e.code === 'TOKEN_FALSCH');
    assert.ok(b.app.state.setup);
  });
});

describe('Zustand: Plan', () => {
  it('Würfeln füllt 7 Tage und speichert sie als Zeilen für den Tab Plan', async () => {
    const b = await connected();
    b.app.shuffleAll(); await b.app.flushSave();
    const s = b.app.state;
    assert.ok(s.slots.every((x) => x.gericht_id));
    const [typ, rows] = b.api.calls.at(-1);
    assert.equal(typ, 'plan'); assert.equal(rows.length, 7);
    assert.deepEqual(rows.map((r) => r.datum), s.slots.map((x) => x.datum));
    for (const r of rows) {
      assert.equal(r.woche_start, '2026-11-14'); assert.equal(r.portionen, 2); assert.equal(r.fixiert, 'nein');
      assert.match(r.geaendert_am, /^2026-11-14T09:3\d:\d\d$/, 'Berliner Zeit');
    }
    assert.equal(s.planStatus, 'ok'); assert.equal(s.planDirty, false);
  });
  it('mehrere schnelle Änderungen ergeben einen Schreibvorgang mit dem letzten Stand', async () => {
    const b = await connected();
    b.app.shuffleAll();
    for (let i = 0; i < 4; i++) b.app.portionen(0, 1);
    await b.app.flushSave();
    const plans = b.api.calls.filter((c) => c[0] === 'plan');
    assert.equal(plans.length, 1);
    assert.equal(plans[0][1][0].portionen, 6);
  });
  it('Portionen bleiben zwischen 1 und 20', async () => {
    const b = await connected();
    for (let i = 0; i < 30; i++) b.app.portionen(1, 1);
    assert.equal(b.app.state.slots[1].portionen, 20);
    for (let i = 0; i < 30; i++) b.app.portionen(1, -1);
    assert.equal(b.app.state.slots[1].portionen, 1);
  });
  it('fixierter Tag bleibt bei „Alle neu würfeln“ und beim Neu-Würfeln des Tages', async () => {
    const b = await connected();
    b.app.shuffleAll(); b.app.fixToggle(3);
    const fixed = b.app.state.slots[3].gericht_id;
    for (let i = 0; i < 5; i++) { b.app.shuffleAll(); assert.equal(b.app.state.slots[3].gericht_id, fixed); }
    assert.equal(b.app.reroll(3), false);
    assert.equal(b.app.state.slots[3].gericht_id, fixed);
    assert.match(b.app.state.toast.text, /fixiert/);
  });
  it('Neu würfeln ändert nur den einen Tag; Auswahl ersetzt nur diesen Tag', async () => {
    const b = await connected();
    b.app.shuffleAll();
    const before = b.app.state.slots.map((s) => s.gericht_id);
    assert.equal(b.app.reroll(2), true);
    const after = b.app.state.slots.map((s) => s.gericht_id);
    assert.notEqual(after[2], before[2]);
    assert.deepEqual(after.filter((_, i) => i !== 2), before.filter((_, i) => i !== 2));
    assert.equal(b.app.chooseDish(5, 'G001'), true);
    assert.equal(b.app.state.slots[5].gericht_id, 'G001');
    assert.equal(b.app.chooseDish(5, 'GXYZ'), false);
  });
  it('Schreibfehler: Status offline, Änderung bleibt lokal, Wiederholen speichert; Neustart behält die ungespeicherte Änderung', async () => {
    const b = await connected();
    b.api.fail = netz();
    b.app.shuffleAll(); await b.app.flushSave();
    assert.equal(b.app.state.planStatus, 'offline');
    assert.equal(b.app.state.planDirty, true);
    assert.deepEqual(b.app.state.pending, [{ typ: 'plan' }]);
    const slots = JSON.stringify(b.app.state.slots);
    // Neustart (z. B. App geschlossen) behält den Stand
    const b2 = build({ backend: b.backend, api: fakeApi() });
    await b2.app.init();
    assert.equal(JSON.stringify(b2.app.state.slots), slots);
    assert.equal(b2.app.state.planDirty, true);
    // Verbindung wieder da: erster Gerät-Stand wird gespeichert
    b.api.fail = null;
    await b.app.retryPending();
    assert.equal(b.app.state.planStatus, 'ok'); assert.equal(b.app.state.pending.length, 0); assert.equal(b.api.calls.at(-1)[0], 'plan');
  });
  it('Abgleich überschreibt keine ungespeicherten Änderungen; ohne offene Änderung kommt der Plan aus dem Sheet', async () => {
    const b = await connected();
    b.api.fail = netz(); b.app.shuffleAll(); await b.app.flushSave();
    const mine = JSON.stringify(b.app.state.slots);
    await b.app.refresh();
    assert.equal(JSON.stringify(b.app.state.slots), mine);
    b.api.fail = null; await b.app.retryPending();
    b.api.raw.Plan = [{ woche_start: '2026-11-14', datum: '2026-11-14', gericht_id: 'G005', portionen: 3, fixiert: 'ja', geaendert_am: '2026-11-14T10:00:00' }];
    await b.app.refresh();
    assert.equal(b.app.state.slots[0].gericht_id, 'G005'); assert.equal(b.app.state.slots[0].portionen, 3); assert.equal(b.app.state.slots[0].fixiert, true);
    assert.equal(b.app.state.slots[1].gericht_id, null);
  });
  it('Startdatum: Wechsel lädt den Plan der Woche, ungespeicherter Plan blockiert den Wechsel, ungültiges Datum wird abgelehnt', async () => {
    const b = await connected();
    assert.equal(b.app.setStart('2026-12-30'), true);
    assert.deepEqual(b.app.state.slots.map((s) => s.datum), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04', '2027-01-05']);
    assert.equal(b.app.setStart('kaputt'), false); assert.equal(b.app.setStart(''), false);
    b.api.fail = netz(); b.app.shuffleAll(); await b.app.flushSave();
    assert.equal(b.app.setStart('2026-11-20'), false);
    assert.equal(b.app.state.startIso, '2026-12-30');
  });
  it('Einstellung Standard-Portionen gilt für leere Tage', async () => {
    const b = await connected();
    await b.app.saveSetting('standard_portionen', 4);
    assert.ok(b.app.state.slots.every((s) => s.portionen === 4));
    assert.deepEqual(b.api.calls.at(-1), ['einstellung', 'standard_portionen', 4]);
  });
});

describe('Zustand: Einkaufszettel und Haken', () => {
  it('Liste kommt aus dem Plan, Haken bleiben nach Neustart, Zurücksetzen löscht sie', async () => {
    const b = await connected();
    b.app.chooseDish(0, 'G001'); b.app.chooseDish(1, 'G002');
    const items = b.app.shopping();
    assert.ok(items.length > 3);
    b.app.toggleCheck(items[0].id); b.app.toggleCheck(items[2].id);
    const b2 = build({ backend: b.backend, api: fakeApi() }); await b2.app.init();
    assert.deepEqual(Object.keys(b2.app.state.checked).sort(), [items[0].id, items[2].id].sort());
    b2.app.toggleCheck(items[0].id);
    assert.deepEqual(Object.keys(b2.app.state.checked), [items[2].id]);
    b2.app.resetChecks();
    assert.deepEqual(b2.app.state.checked, {});
    assert.deepEqual(JSON.parse(b.backend.getItem('kp.checked') || '{}'), {}, 'auch im Speicher gelöscht');
  });
  it('Menge ändert sich: Haken gilt nur für unveränderte Einträge', async () => {
    const b = await connected();
    b.app.chooseDish(0, 'G001');
    const it0 = b.app.shopping()[0]; b.app.toggleCheck(it0.id);
    b.app.portionen(0, 2);
    const it1 = b.app.shopping().find((x) => x.key === it0.key);
    assert.notEqual(it1.id, it0.id);
    assert.equal(!!b.app.state.checked[it1.id], false);
  });
});

describe('Zustand: Bewerten, Gerichte', () => {
  it('Bewerten: heute und früher ja, Zukunft nein; gleicher Tag überschreibt; Zeile wie im Protokoll', async () => {
    const b = await connected();
    b.app.chooseDish(0, 'G001'); b.app.chooseDish(3, 'G002');
    await assert.rejects(b.app.rate(3, 4), /Zukünftige/);
    await assert.rejects(b.app.rate(0, 6), /1 bis 5/);
    b.app.setPrefs({ name: 'René' });
    const r1 = await b.app.rate(0, 4, ' lecker ');
    assert.equal(r1.ok, true);
    assert.deepEqual(b.api.calls.at(-1), ['bewertung', { gericht_id: 'G001', datum: '2026-11-14', sterne: 4, notiz: 'lecker', von: 'René' }]);
    await b.app.rate(0, 2, '');
    const own = b.app.state.norm.bewertungen.filter((x) => x.gericht_id === 'G001' && x.datum === '2026-11-14' && x.von === 'René');
    assert.equal(own.length, 1); assert.equal(own[0].sterne, 2);
    assert.equal(b.app.ownRating('G001', '2026-11-14').sterne, 2);
  });
  it('Bewerten ohne Netz: lokal sichtbar, offen gemerkt, bleibt nach Abgleich erhalten und lässt sich wiederholen', async () => {
    const b = await connected();
    b.app.chooseDish(0, 'G001'); b.api.fail = netz();
    const r = await b.app.rate(0, 5, 'x');
    assert.equal(r.ok, false);
    assert.equal(b.app.state.pending.length, 1);
    assert.equal(b.app.ownRating('G001', '2026-11-14').sterne, 5);
    await b.app.refresh();
    assert.equal(b.app.ownRating('G001', '2026-11-14').sterne, 5, 'nach Abgleich noch da');
    b.api.fail = null; await b.app.retryPending();
    assert.equal(b.app.state.pending.length, 0);
    assert.equal(b.api.calls.at(-1)[0], 'bewertung');
  });
  it('Schalter Favorit sofort sichtbar und im Sheet; bei Fehler zurückgesetzt', async () => {
    const b = await connected();
    const g = b.app.state.norm.gerichte.find((x) => !x.favorit);
    assert.equal(await b.app.setDishFlag(g.id, 'favorit', true), true);
    assert.equal(b.app.state.norm.gerichte.find((x) => x.id === g.id).favorit, true);
    assert.deepEqual(b.api.calls.at(-1), ['gericht', { id: g.id, favorit: 'ja' }, undefined]);
    b.api.fail = netz();
    assert.equal(await b.app.setDishFlag(g.id, 'favorit', false), false);
    assert.equal(b.app.state.norm.gerichte.find((x) => x.id === g.id).favorit, true, 'zurückgesetzt');
    assert.match(b.app.state.toast.text, /Nicht gespeichert/);
  });
  it('Gericht speichern: Fehler geht an die Maske, Erfolg lädt neu', async () => {
    const b = await connected();
    b.api.fail = new ApiError('EINGABE_UNGUELTIG', 'Der Name fehlt.', { feld: 'gericht.name' });
    await assert.rejects(b.app.saveDish({ name: '' }, []), (e) => e.code === 'EINGABE_UNGUELTIG');
    b.api.fail = null; const reads = b.api.reads;
    const r = await b.app.saveDish({ name: 'Neu' }, undefined);
    assert.equal(r.id, 'G041'); assert.equal(b.api.reads, reads + 1);
  });
});

describe('Zustand: Startdatum eines frisch verbundenen Geräts', () => {
  const planZeilen = (ws, tage) => tage.map((d, i) => ({ woche_start: ws, datum: d, gericht_id: 'G00' + (i + 1), portionen: 2, fixiert: 'nein', geaendert_am: '2026-11-10T10:00:00' }));
  const tage = (s, n = 7) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + i)); return d.toISOString().slice(0, 10); });
  it('öffnet die Planwoche, die heute abdeckt (nicht „heute“)', async () => {
    const api = fakeApi(); api.raw.Plan = planZeilen('2026-11-12', tage('2026-11-12'));
    const b = build({ api, jetzt: '2026-11-14T08:30:00Z' }); await b.app.init(); await b.app.connect(CODE);
    assert.equal(b.app.state.startIso, '2026-11-12');
    assert.equal(b.app.state.slots[0].gericht_id, 'G001'); assert.equal(b.app.state.slots[6].gericht_id, 'G007');
  });
  it('ohne laufende Woche: nächste Woche innerhalb von 14 Tagen, sonst heute', async () => {
    let api = fakeApi(); api.raw.Plan = planZeilen('2026-11-20', tage('2026-11-20'));
    let b = build({ api }); await b.app.init(); await b.app.connect(CODE);
    assert.equal(b.app.state.startIso, '2026-11-20');
    api = fakeApi(); api.raw.Plan = planZeilen('2026-12-20', tage('2026-12-20'));
    b = build({ api }); await b.app.init(); await b.app.connect(CODE);
    assert.equal(b.app.state.startIso, '2026-11-14', 'zu weit in der Zukunft');
    api = fakeApi(); api.raw.Plan = planZeilen('2026-11-01', tage('2026-11-01'));
    b = build({ api }); await b.app.init(); await b.app.connect(CODE);
    assert.equal(b.app.state.startIso, '2026-11-14', 'abgelaufener Plan');
  });
  it('mehrere deckende Wochen: die jüngste', async () => {
    const api = fakeApi(); api.raw.Plan = [...planZeilen('2026-11-10', tage('2026-11-10')), ...planZeilen('2026-11-13', tage('2026-11-13'))];
    const b = build({ api }); await b.app.init(); await b.app.connect(CODE);
    assert.equal(b.app.state.startIso, '2026-11-13');
  });
});
