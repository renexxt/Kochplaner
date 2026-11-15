// Anwendungszustand und alle Aktionen. Kein DOM. Wird von den Ansichten abonniert.
import { normalize, selectableIds } from './core/normalize.js';
import { rowsToSlots, emptySlots, setDish, toggleFix, stepPortionen, slotsToRows, slotsToTage, isComplete, defaultStart } from './core/plan.js';
import { proposePlan, rerollDay, ShuffleError, seedFrom } from './core/shuffle.js';
import { shoppingList } from './core/shopping.js';
import { upsertRating } from './core/ratings.js';
import { todayIso, addDays } from './core/dates.js';
import { stampBerlin } from './core/format.js';
import { decodeSetup, SetupCodeError } from './core/setupcode.js';
import { ApiError } from './adapters/api.js';

const SAVE_DELAY = 250;
const MELDUNG = {
  NETZWERK: 'Keine Verbindung. Bitte das Internet prüfen. Der Plan bleibt auf dem Gerät und wird später gespeichert.',
  ZEITUEBERSCHREITUNG: 'Google antwortet gerade nicht. Bitte später nochmal versuchen.',
  HTTP_FEHLER: 'Google meldet einen Fehler. Bitte später nochmal versuchen.',
  ANTWORT_UNGUELTIG: 'Die Antwort von Google ist nicht lesbar. Stimmt der Setup-Code? Am besten den Code neu einfügen.',
  TOKEN_FALSCH: 'Der Zugangsschlüssel stimmt nicht mehr. Bitte den aktuellen Setup-Code einfügen (Einstellungen).',
  TOKEN_FEHLT: 'Der Zugangsschlüssel fehlt. Bitte den Setup-Code einfügen (Einstellungen).',
  NICHT_EINGERICHTET: 'Das Google Sheet ist noch nicht vorbereitet. Bitte in Apps Script einmal „setup“ ausführen (Hilfe → Einrichtung).',
  TAB_FEHLT: 'Im Google Sheet fehlt ein Tabellenblatt. Bitte in Apps Script einmal „setup“ ausführen.',
  SPALTE_FEHLT: 'Im Google Sheet fehlt eine Spalte. Bitte in Apps Script einmal „setup“ ausführen.',
  BESCHAEFTIGT: 'Das Sheet ist gerade belegt. Bitte gleich nochmal versuchen.',
};
export const fehlerInfo = (e) => {
  if (e instanceof ApiError) {
    const text = MELDUNG[e.code] || e.meldung || 'Unbekannter Fehler.';
    return { code: e.code, meldung: text, offline: e.code === 'NETZWERK' || e.code === 'ZEITUEBERSCHREITUNG', feld: e.feld };
  }
  if (e instanceof SetupCodeError) return { code: e.code, meldung: e.message, offline: false };
  if (e instanceof ShuffleError) return { code: e.code, meldung: e.message, offline: false };
  return { code: 'INTERN', meldung: 'Unerwarteter Fehler: ' + (e && e.message ? e.message : e), offline: false };
};

export function createApp({ storage, clock, makeClient, seedFor = null, openUrl, copyText, shareText, nav = () => ({ onLine: true }) }) {
  const S = {
    setup: null, raw: null, norm: normalize({}), syncedAt: null, online: true, loading: false, loadError: null,
    startIso: null, slots: [], planDirty: false, planStatus: 'leer', planFehler: null, warnung: null,
    pending: [], checked: {}, prefs: { name: '', sheetLink: '', tourDone: false }, toast: null, shuffleCount: 0, listeFehler: null,
  };
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => f(S));
  const now = () => clock.now();
  const nowIso = () => now().toISOString();
  const today = () => todayIso(clock);
  const client = () => makeClient(S.setup);
  let toastTimer = null;
  const toast = (text, art = 'info') => {
    S.toast = { text, art, id: Date.now() + Math.random() };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { S.toast = null; emit(); }, 4000);
    emit();
  };

  // ---- Speicher
  const persistPlan = () => storage.set('plan', { startIso: S.startIso, slots: S.slots, dirty: S.planDirty });
  const persistCache = () => storage.set('cache', { raw: S.raw, syncedAt: S.syncedAt });
  const persistPending = () => storage.set('pending', S.pending);

  const knownIds = () => new Set(S.norm.gerichte.map((g) => g.id));
  function buildSlots() {
    const std = S.norm.einstellungen.standard_portionen;
    const known = knownIds();
    return rowsToSlots(S.norm.plan, S.startIso, std).map((s) => (s.gericht_id && !known.has(s.gericht_id) ? { ...s, gericht_id: null, fixiert: false } : s));
  }
  function setRaw(raw) {
    S.raw = raw;
    S.norm = normalize(raw);
    persistCache();
  }
  // rawVersion zaehlt lokale Aenderungen am Datenbestand. refresh() erkennt damit Antworten, die aelter sind als ein inzwischen gespeicherter Stand.
  let rawVersion = 0;
  const patchRaw = (tab, fn) => { const raw = { ...(S.raw || {}) }; raw[tab] = fn(raw[tab] || []); rawVersion += 1; setRaw(raw); };
  const applyPendingRatings = () => { for (const op of S.pending) if (op.typ === 'bewertung') patchRaw('Bewertungen', (l) => rawUpsertRating(l, op.payload)); };

  // ---- Start, Verbinden, Abgleich
  async function init() {
    S.setup = storage.get('setup');
    S.prefs = { ...S.prefs, ...(storage.get('prefs') || {}) };
    S.checked = storage.get('checked') || {};
    S.pending = storage.get('pending') || [];
    const cache = storage.get('cache');
    if (cache && cache.raw) { S.raw = cache.raw; S.norm = normalize(cache.raw); S.syncedAt = cache.syncedAt || null; }
    const p = storage.get('plan');
    S.startIso = (p && p.startIso) || today();
    if (p && p.dirty && Array.isArray(p.slots) && p.slots.length === 7) { S.slots = p.slots; S.planDirty = true; S.planStatus = 'fehler'; S.planFehler = S.planFehler || { code: 'OFFEN', meldung: 'Änderungen am Plan sind noch nicht gespeichert.' }; }
    else { S.slots = buildSlots(); S.planStatus = S.slots.some((s) => s.gericht_id) ? 'ok' : 'leer'; }
    emit();
    return S;
  }

  async function refresh() {
    if (!S.setup) return false;
    S.loading = true; emit();
    try {
      let r = null;
      for (let versuch = 0; versuch < 2; versuch++) {
        const v = rawVersion;
        r = await client().lesen();
        if (v === rawVersion) break; // nichts Lokales ist dazwischengekommen
        r = null; // Antwort ist eventuell aelter als ein inzwischen gespeicherter Stand: verwerfen, einmal neu lesen
      }
      if (r) {
        setRaw(r.daten);
        applyPendingRatings();
        if (!S.planDirty) { S.slots = buildSlots(); S.planStatus = S.slots.some((s) => s.gericht_id) ? 'ok' : 'leer'; persistPlan(); }
      }
      S.syncedAt = nowIso();
      persistCache();
      S.online = true; S.loadError = null;
      return true;
    } catch (e) {
      S.online = false; S.loadError = fehlerInfo(e);
      return false;
    } finally { S.loading = false; emit(); }
  }

  async function connect(code) {
    const setup = decodeSetup(code); // wirft SetupCodeError
    const c = makeClient(setup);
    await c.ping();
    const r = await c.lesen();
    // Gleiche Adresse (z. B. nur neuer Token): ungespeicherte Arbeit bleibt erhalten und wird gleich geschickt.
    const gleich = !!(S.setup && S.setup.url === setup.url);
    S.setup = setup; storage.set('setup', setup);
    if (!gleich) { S.pending = []; persistPending(); S.planDirty = false; }
    setRaw(r.daten); S.syncedAt = nowIso(); persistCache();
    applyPendingRatings();
    S.online = true; S.loadError = null;
    if (!gleich || !S.planDirty) {
      S.startIso = defaultStart(S.norm.plan, today()); S.warnung = null;
      S.slots = buildSlots(); S.planStatus = S.slots.some((s) => s.gericht_id) ? 'ok' : 'leer'; persistPlan();
    }
    emit();
    if (gleich && (S.planDirty || S.pending.length)) await retryPending();
    return S.norm.gerichte.length;
  }
  function disconnect() {
    S.setup = null; S.raw = null; S.norm = normalize({}); S.syncedAt = null; S.pending = []; S.planDirty = false; S.loadError = null;
    for (const k of ['setup', 'cache', 'plan', 'pending', 'checked', 'draft']) storage.remove(k);
    S.checked = {}; S.slots = buildSlots(); S.planStatus = 'leer';
    emit();
  }

  // ---- Plan
  function setStart(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '') || Number.isNaN(Date.parse(iso))) return false;
    if (S.planDirty) { toast('Der Plan ist noch nicht gespeichert. Bitte erst „Wiederholen“ antippen.', 'fehler'); return false; }
    S.startIso = iso; S.warnung = null;
    S.slots = buildSlots(); S.planStatus = S.slots.some((s) => s.gericht_id) ? 'ok' : 'leer';
    persistPlan(); emit();
    return true;
  }
  let saveTimer = null; let saving = Promise.resolve(); let version = 0;
  function changed(slots) {
    S.slots = slots; S.planDirty = true; version += 1;
    S.planStatus = 'wartet'; S.planFehler = null;
    persistPlan(); emit();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saving = saving.then(doSave); }, SAVE_DELAY);
  }
  async function doSave() {
    if (!S.planDirty) return;
    const myVersion = version;
    const rows = slotsToRows(S.slots, S.startIso, stampBerlin(now()));
    if (rows.length === 0) { S.planDirty = false; S.planStatus = 'leer'; persistPlan(); emit(); return; }
    S.planStatus = 'speichert'; emit();
    try {
      await client().planSpeichern(rows);
      patchRaw('Plan', (list) => {
        const dates = new Set(rows.map((r) => r.datum));
        return [...list.filter((r) => !dates.has(String(r.datum).slice(0, 10))), ...rows];
      });
      S.pending = S.pending.filter((o) => o.typ !== 'plan'); persistPending();
      if (myVersion === version) { S.planDirty = false; S.planStatus = 'ok'; S.planFehler = null; }
      else { S.planStatus = 'wartet'; }
      S.online = true;
    } catch (e) {
      const info = fehlerInfo(e);
      S.planStatus = info.offline ? 'offline' : 'fehler'; S.planFehler = info;
      if (!S.pending.some((o) => o.typ === 'plan')) S.pending.push({ typ: 'plan' });
      persistPending();
    }
    persistPlan(); emit();
  }
  const flushSave = async () => { clearTimeout(saveTimer); if (S.planDirty) saving = saving.then(doSave); await saving; };

  function shuffleAll() {
    S.shuffleCount += 1;
    try {
      const r = proposePlan({ norm: S.norm, startIso: S.startIso, slots: S.slots, history: S.norm.plan, seed: seedFor(S.shuffleCount, nowIso()) });
      S.warnung = r.warnung;
      changed(r.slots);
      return true;
    } catch (e) { toast(fehlerInfo(e).meldung, 'fehler'); return false; }
  }
  function reroll(index) {
    const s = S.slots[index];
    if (s.fixiert) { toast('Dieser Tag ist fixiert. Erst die Fixierung lösen.', 'info'); return false; }
    S.shuffleCount += 1;
    try {
      const r = rerollDay({ norm: S.norm, startIso: S.startIso, slots: S.slots, index, history: S.norm.plan, seed: seedFor(S.shuffleCount, nowIso()) });
      if (!r.geaendert) { toast('Es gibt kein anderes passendes Gericht.', 'info'); return false; }
      changed(r.slots);
      return true;
    } catch (e) { toast(fehlerInfo(e).meldung, 'fehler'); return false; }
  }
  const chooseDish = (index, id) => { if (!knownIds().has(id)) return false; changed(setDish(S.slots, index, id)); return true; };
  const fixToggle = (index) => { changed(toggleFix(S.slots, index)); };
  const portionen = (index, delta) => { const before = S.slots[index].portionen; const next = stepPortionen(S.slots, index, delta); if (next[index].portionen !== before) changed(next); };

  // ---- Bewertungen
  const rawUpsertRating = (list, b) => {
    const i = list.findIndex((r) => String(r.gericht_id) === b.gericht_id && String(r.datum).slice(0, 10) === b.datum && String(r.von || '') === (b.von || ''));
    const row = { gericht_id: b.gericht_id, datum: b.datum, sterne: b.sterne, notiz: b.notiz || '', von: b.von || '' };
    if (i >= 0) { const c = list.slice(); c[i] = { ...list[i], ...row }; return c; }
    return [...list, row];
  };
  const ownRating = (gericht_id, datum) => S.norm.bewertungen.find((b) => b.gericht_id === gericht_id && b.datum === datum && b.von === (S.prefs.name || '')) || null;
  async function rate(index, sterne, notiz = '') {
    const s = S.slots[index];
    if (!s || !s.gericht_id) throw new Error('Kein Gericht an diesem Tag.');
    if (s.datum > today()) throw new Error('Zukünftige Tage lassen sich nicht bewerten.');
    if (!Number.isInteger(sterne) || sterne < 1 || sterne > 5) throw new Error('Bitte 1 bis 5 Sterne wählen.');
    const b = { gericht_id: s.gericht_id, datum: s.datum, sterne, notiz: String(notiz || '').trim(), von: S.prefs.name || '' };
    patchRaw('Bewertungen', (l) => rawUpsertRating(l, b));
    S.pending = S.pending.filter((o) => !(o.typ === 'bewertung' && o.payload.gericht_id === b.gericht_id && o.payload.datum === b.datum && o.payload.von === b.von));
    try {
      await client().bewertungSpeichern(b);
      persistPending(); emit();
      return { ok: true };
    } catch (e) {
      S.pending.push({ typ: 'bewertung', payload: b }); persistPending();
      const info = fehlerInfo(e); toast('Bewertung nicht gespeichert: ' + info.meldung, 'fehler');
      emit();
      return { ok: false, fehler: info };
    }
  }

  // ---- Gerichte, Einstellungen
  async function saveDish(gericht, zutaten, anfrageId) {
    const r = await client().gerichtSpeichern(gericht, zutaten, anfrageId); // Fehler gehen an die Eingabemaske, die offen bleibt
    await refresh();
    return r;
  }
  async function setDishFlag(id, feld, wert) {
    const alt = S.norm.gerichte.find((g) => g.id === id);
    const vorher = alt ? alt[feld] : null;
    patchRaw('Gerichte', (l) => l.map((r) => (String(r.id).trim() === id ? { ...r, [feld]: wert ? 'ja' : 'nein' } : r)));
    emit();
    try { await client().gerichtSpeichern({ id, [feld]: wert ? 'ja' : 'nein' }); return true; } catch (e) {
      patchRaw('Gerichte', (l) => l.map((r) => (String(r.id).trim() === id ? { ...r, [feld]: vorher ? 'ja' : 'nein' } : r)));
      toast('Nicht gespeichert: ' + fehlerInfo(e).meldung, 'fehler'); emit();
      return false;
    }
  }
  async function saveSetting(schluessel, wert) {
    await client().einstellungSpeichern(schluessel, wert);
    patchRaw('Einstellungen', (l) => {
      const i = l.findIndex((r) => String(r.schluessel).trim().toLowerCase() === schluessel);
      if (i >= 0) { const c = l.slice(); c[i] = { ...l[i], wert }; return c; }
      return [...l, { schluessel, wert }];
    });
    if (!S.planDirty) { S.slots = buildSlots(); persistPlan(); }
    emit();
  }
  // Entwurf des Gerichte-Formulars: bleibt erhalten, auch wenn iOS die App im Hintergrund beendet.
  const getDraft = (key) => { const d = storage.get('draft'); return d && d.key === key && d.f && typeof d.f === 'object' && Array.isArray(d.f.zutaten) ? d.f : null; };
  const setDraft = (key, f) => storage.set('draft', { key, f });
  const clearDraft = () => storage.remove('draft');
  function setPrefs(p) { S.prefs = { ...S.prefs, ...p }; storage.set('prefs', S.prefs); emit(); }

  // ---- Einkaufszettel
  function shopping() {
    try {
      const items = shoppingList(S.norm, slotsToTage(S.slots)).items.map((i) => ({ ...i, id: `${i.key}|${i.einheit}|${i.menge_exakt}` }));
      S.listeFehler = null;
      return items;
    } catch (e) {
      S.listeFehler = 'Der Einkaufszettel konnte nicht berechnet werden (' + (e && e.message ? e.message : e) + '). Bitte die Gerichte im Plan prüfen.';
      return [];
    }
  }
  function toggleCheck(id) {
    if (S.checked[id]) delete S.checked[id]; else S.checked[id] = true;
    storage.set('checked', S.checked); emit();
  }
  function resetChecks() { S.checked = {}; storage.set('checked', S.checked); emit(); }

  async function retryPending() {
    const ops = S.pending.slice();
    for (const op of ops) {
      if (op.typ === 'plan') { S.planDirty = true; await flushSave(); }
      if (op.typ === 'bewertung') {
        try { await client().bewertungSpeichern(op.payload); S.pending = S.pending.filter((o) => o !== op); persistPending(); } catch (e) { toast(fehlerInfo(e).meldung, 'fehler'); }
      }
    }
    emit();
  }

  return {
    state: S, subscribe: (f) => { listeners.add(f); return () => listeners.delete(f); }, emit,
    init, refresh, connect, disconnect,
    setStart, shuffleAll, reroll, chooseDish, fixToggle, portionen, flushSave,
    rate, ownRating, saveDish, setDishFlag, saveSetting, setPrefs, getDraft, setDraft, clearDraft,
    shopping, toggleCheck, resetChecks, retryPending, toast,
    today, now, copyText, shareText, openUrl, selectable: () => selectableIds(S.norm),
    isComplete: () => isComplete(S.slots), addDays, emptySlots,
  };
}
