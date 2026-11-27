// Start der App: Verdrahtung, Navigation, Kopfzeile, Meldungen. Test-Haken nur ueber window.__kpTest (von Playwright gesetzt).
import { h, icon, clear } from './ui/dom.js';
import { createStorage } from './adapters/storage.js';
import { createClient } from './adapters/api.js';
import { copyText, shareText } from './adapters/clipboard.js';
import { createApp } from './state.js';
import { seedFrom } from './core/shuffle.js';
import { timeHM } from './core/format.js';
import { planView } from './ui/views/plan.js';
import { shoppingView } from './ui/views/shopping.js';
import { dishesView } from './ui/views/dishes.js';
import { dishFormView } from './ui/views/dishForm.js';
import { rankingView } from './ui/views/ranking.js';
import { settingsView } from './ui/views/settings.js';
import { expensesView } from './ui/views/expenses.js';
import { helpView, helpNewDishView, helpSetupView } from './ui/views/help.js';
import { createTour } from './ui/tour.js';

const T = window.__kpTest || {};
const t0 = performance.now();
const base = T.jetzt ? Date.parse(T.jetzt) : null;
const clock = { now: () => (base === null ? new Date() : new Date(base + (performance.now() - t0))) };
const seedFor = (count, iso) => (T.seed !== undefined ? (Number(T.seed) + count) >>> 0 : seedFrom(`${iso}#${count}#${performance.now()}`));

let storageBackend = null;
try { storageBackend = window.localStorage; } catch { storageBackend = null; }
const storage = createStorage(T.ohneSpeicher ? null : storageBackend);

// Von aussen sichtbar (window.__kp) nur im Test; sonst bleibt das Objekt privat.
const kp = { opened: [], version: 1 };
if (window.__kpTest) window.__kp = kp;
const openUrl = (u) => { kp.opened.push(u); if (!T.externBlockiert) window.location.href = u; };

const app = createApp({
  storage, clock, seedFor, openUrl, copyText: (t) => { kp.letzteKopie = t; return copyText(t); }, shareText,
  makeClient: (setup) => createClient({ url: setup.url, token: setup.token, timeoutMs: T.timeoutMs || 20000, retryDelayMs: T.retryDelayMs || 400 }),
});
kp.app = app;

const $ = (s) => document.querySelector(s);
const viewEl = $('#view'); const overlay = $('#overlay'); const tourLayer = $('#tour');
let current = null; let rendered = null; let lastMain = '#/plan'; let helpFrom = '#/plan';

const TABS = [['plan', '#/plan', 'Plan', 'calendar'], ['einkauf', '#/einkauf', 'Einkauf', 'cart'], ['gerichte', '#/gerichte', 'Gerichte', 'book'], ['rangliste', '#/rangliste', 'Rangliste', 'trophy'], ['einstellungen', '#/einstellungen', 'Einstellungen', 'gear']];

function go(hash) {
  if (location.hash !== hash) { try { history.pushState(null, '', hash); } catch { location.hash = hash; } }
  render();
}
const setupNeeded = () => h('section', { class: 'card', 'data-testid': 'setup-noetig' },
  h('h2', {}, 'Noch nicht verbunden'),
  h('p', {}, 'Damit der Kochplaner deine Gerichte findet, brauchst du einmalig den Setup-Code für dein Google Sheet.'),
  h('div', { class: 'stack' },
    h('button', { class: 'btn primary', 'data-testid': 'btn-zu-einstellungen', onclick: () => go('#/einstellungen') }, 'Setup-Code eingeben'),
    h('button', { class: 'btn quiet', onclick: () => go('#/hilfe/einrichtung') }, 'Wo bekomme ich den Code?')));

const tour = createTour(app, { layer: tourLayer, go });
// Test-Schalter keineTour unterdrueckt nur das automatische Angebot, nicht den ausdruecklichen Start
const startTour = (o) => { if (o && o.angebot && T.keineTour) return; tour.start(o); };
const ctx = { overlay, setupNeeded, go, startTour };

const ROUTES = [
  { re: /^#\/plan$/, tab: 'plan', titel: 'Kochplan', build: () => planView(app, ctx), main: true },
  { re: /^#\/einkauf$/, tab: 'einkauf', titel: 'Einkaufszettel', build: () => shoppingView(app, ctx), main: true },
  { re: /^#\/gerichte$/, tab: 'gerichte', titel: 'Gerichte', build: () => dishesView(app, ctx), main: true },
  { re: /^#\/gericht\/([\w-]+)$/, tab: 'gerichte', titel: 'Gericht', back: '#/gerichte', build: (m) => dishFormView(app, { id: m[1], go, reload }) },
  { re: /^#\/rangliste$/, tab: 'rangliste', titel: 'Rangliste', build: () => rankingView(app, ctx), main: true },
  { re: /^#\/einstellungen$/, tab: 'einstellungen', titel: 'Einstellungen', build: () => settingsView(app, ctx), main: true },
  // Ausgaben (F24): eigenstaendiger Einstiegspunkt (Einstellungen, zusaetzlich ein Button auf dem Einkaufszettel),
  // bewusst kein eigener Tab in der Hauptnavigation. "zurueck" fuehrt zu lastMain, wie bei #/hilfe.
  { re: /^#\/ausgaben$/, titel: 'Ausgaben', back: () => lastMain, build: () => expensesView(app, ctx) },
  { re: /^#\/hilfe$/, titel: 'Hilfe', back: () => lastMain, build: () => helpView(app, { go, startTour, from: helpFrom }) },
  { re: /^#\/hilfe\/neu$/, titel: 'Neues Gericht', back: '#/hilfe', build: () => helpNewDishView(app, { go }) },
  { re: /^#\/hilfe\/einrichtung$/, titel: 'Einrichtung', back: '#/hilfe', build: () => helpSetupView() },
];

// Ansicht neu aufbauen, auch wenn der Hash gleich bleibt (z. B. Entwurf verwerfen)
function reload() { rendered = null; render(); }

function render() {
  let hash = location.hash || '#/plan';
  if (!ROUTES.some((r) => r.re.test(hash))) hash = '#/plan';
  if (hash === rendered) return;
  const route = ROUTES.find((r) => r.re.test(hash));
  if (route.main) lastMain = hash;
  if (hash === '#/hilfe' && rendered) {
    if (ROUTES.find((r) => r.re.test(rendered))?.main) helpFrom = rendered;
    else if (/^#\/gericht\//.test(rendered)) helpFrom = '#/gericht';
  }
  rendered = hash;
  overlay.classList.remove('open'); clear(overlay);
  clear(viewEl);
  current = route.build(hash.match(route.re));
  current.route = route;
  viewEl.append(current.el);
  viewEl.scrollTop = 0;
  document.body.dataset.route = hash;
  chrome();
}

// ---- Kopfzeile, Tabs, Meldungen
const tabsEl = $('#tabs');
$('#btn-hilfe').append(icon('help', 26));
$('#btn-aktualisieren').append(icon('refresh', 22));
$('#btn-zurueck').append(icon('back', 24));
$('#btn-hilfe').addEventListener('click', () => go('#/hilfe'));
$('#btn-aktualisieren').addEventListener('click', async () => {
  if (!app.state.setup) { go('#/einstellungen'); return; }
  const ok = await app.refresh();
  app.toast(ok ? 'Aktualisiert.' : 'Aktualisieren hat nicht geklappt.', ok ? 'ok' : 'fehler');
});
$('#btn-zurueck').addEventListener('click', () => { const b = current?.route?.back; go(typeof b === 'function' ? b() : b || lastMain); });

function chrome() {
  const S = app.state; const route = current?.route;
  $('#titel').textContent = route ? route.titel : 'Kochplaner';
  $('#btn-zurueck').hidden = !(route && route.back);
  clear(tabsEl);
  for (const [k, hash, label, ic] of TABS) {
    tabsEl.append(h('button', { class: 'tab' + (route?.tab === k ? ' on' : ''), 'aria-current': route?.tab === k ? 'page' : null, 'data-testid': 'tab-' + k, onclick: () => go(hash) }, icon(ic, 24), h('span', {}, label)));
  }
  $('#sync').textContent = S.syncedAt ? `Abgleich ${timeHM(new Date(S.syncedAt))}` : (S.setup ? 'noch kein Abgleich' : '');
  $('#sync').title = S.syncedAt ? `Letzter Abgleich mit dem Sheet: ${timeHM(new Date(S.syncedAt))} Uhr` : '';
  $('#btn-aktualisieren').classList.toggle('busy', S.loading);
  $('#btn-aktualisieren').disabled = S.loading;
  banner();
  const t = $('#toast');
  if (S.toast) { t.textContent = S.toast.text; t.className = 'toast show ' + S.toast.art; } else { t.className = 'toast'; t.textContent = ''; }
}
function banner() {
  const S = app.state; const el = $('#banner'); clear(el);
  if (S.loadError && S.setup) {
    el.append(h('div', { class: 'banner err', role: 'alert', 'data-testid': 'banner-fehler' },
      h('span', {}, `${S.loadError.meldung}${S.syncedAt ? ` Angezeigt wird der Stand von ${timeHM(new Date(S.syncedAt))} Uhr.` : ''}`),
      h('button', { class: 'btn small', 'data-testid': 'banner-neu-laden', onclick: () => app.refresh() }, 'Erneut versuchen')));
  }
  if (S.pending.length || (S.planDirty && (S.planStatus === 'fehler' || S.planStatus === 'offline'))) {
    const why = S.planFehler ? S.planFehler.meldung : 'Änderungen sind noch nicht gespeichert.';
    el.append(h('div', { class: 'banner warn', role: 'alert', 'data-testid': 'banner-offen' },
      h('span', {}, `Nicht gespeichert: ${why}`), h('button', { class: 'btn small', 'data-testid': 'banner-wiederholen', onclick: () => app.retryPending() }, 'Wiederholen')));
  }
}

app.subscribe(() => { chrome(); current?.update?.(); });
window.addEventListener('popstate', render);
window.addEventListener('hashchange', render);
window.addEventListener('online', () => { if (app.state.setup) app.refresh(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && app.state.setup && !app.state.loading && (!app.state.syncedAt || Date.now() - Date.parse(app.state.syncedAt) > 120000)) app.refresh();
});

// ---- Start
(async function boot() {
  chrome();
  if (!location.hash) history.replaceState(null, '', '#/plan');
  const pre = storage.get('setup');
  if (!pre && (!location.hash || location.hash === '#/plan')) history.replaceState(null, '', '#/einstellungen');
  await app.init();
  render();
  chrome();
  if (app.state.setup) app.refresh();
  if (app.state.setup && !app.state.prefs.tourDone) startTour({ angebot: true });
  kp.bereit = true;
  if ('serviceWorker' in navigator && !T.ohneSW && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* ohne Offline-Modus weiter */ });
  }
})();
