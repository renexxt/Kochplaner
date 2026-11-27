// Einstellungen und Setup (F15): Setup-Code, Plan-Einstellungen, dieses Geraet
import { h, icon, clear } from '../dom.js';
import { encodeSetup } from '../../core/setupcode.js';
import { fehlerInfo } from '../../state.js';
import { APP_VERSION } from '../../version.js';
import { timeHM } from '../../core/format.js';

export function settingsView(app, { go, startTour }) {
  const S = app.state;
  const root = h('div', { class: 'view settings' });
  const verb = h('section', { class: 'card', 'data-testid': 'verbindung' });
  const planCard = h('section', { class: 'card', 'data-testid': 'plan-einstellungen' });
  let codeText = ''; let connecting = false; let connMsg = null; let showCode = false;

  const field = (label, input, hint) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);

  async function doConnect() {
    connecting = true; connMsg = null; renderConn();
    try {
      const n = await app.connect(codeText);
      const meldung = `Verbunden. ${n} ${n === 1 ? 'Gericht' : 'Gerichte'} geladen.`;
      connMsg = { art: 'ok', text: meldung };
      codeText = '';
      app.toast(meldung, 'ok');
      go('#/plan');
      if (!S.prefs.tourDone) startTour({ angebot: true });
    } catch (e) { connMsg = { art: 'fehler', text: fehlerInfo(e).meldung }; }
    connecting = false; renderConn(); renderPlan();
  }

  function renderConn() {
    clear(verb);
    verb.append(h('h2', {}, 'Verbindung zum Google Sheet'));
    if (S.setup) {
      const host = new URL(S.setup.url).host;
      verb.append(
        h('p', { class: 'ok-line', 'data-testid': 'verbunden' }, icon('check', 18), ` Verbunden mit ${host}`),
        h('p', { class: 'hint' }, `${S.norm.gerichte.length} Gerichte geladen${S.syncedAt ? ' · letzter Abgleich ' + timeHM(new Date(S.syncedAt)) + ' Uhr' : ''}`),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn', 'data-testid': 'btn-code-zeigen', onclick: () => { showCode = !showCode; renderConn(); } }, icon('copy', 18), showCode ? 'Setup-Code verbergen' : 'Setup-Code für ein anderes Gerät'),
          h('button', { class: 'btn quiet', 'data-testid': 'btn-trennen', onclick: () => { if (confirm('Verbindung auf diesem Gerät trennen? Die Daten im Sheet bleiben erhalten.')) { app.disconnect(); renderConn(); renderPlan(); } } }, 'Verbindung trennen')));
      if (showCode) {
        const code = encodeSetup(S.setup);
        verb.append(h('div', { class: 'note' }, h('p', {}, 'Diesen Code auf dem anderen Gerät unter Einstellungen einfügen. Er enthält den Zugangsschlüssel, bitte nur an Personen schicken, die das Sheet nutzen sollen.'),
          h('textarea', { readonly: true, rows: 4, 'data-testid': 'setup-code-anzeige', onclick: (e) => e.target.select() }, code),
          h('button', { class: 'btn', 'data-testid': 'btn-code-kopieren', onclick: async (e) => { const ok = await app.copyText(code); e.target.textContent = ok ? 'Kopiert' : 'Bitte von Hand markieren'; } }, 'Code kopieren')));
      }
      verb.append(h('hr'), h('p', { class: 'lbl' }, 'Anderen Setup-Code verwenden'));
    } else {
      verb.append(h('p', {}, 'Füge den Setup-Code ein, den du bei der Einrichtung bekommen hast. Er beginnt mit KP1. und enthält die Adresse der Schnittstelle und den Zugangsschlüssel.'));
    }
    verb.append(
      h('textarea', { rows: 4, placeholder: 'KP1.…', 'aria-label': 'Setup-Code', 'data-testid': 'setup-code', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', value: codeText, oninput: (e) => { codeText = e.target.value; } }),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', 'data-testid': 'btn-verbinden', disabled: connecting, onclick: doConnect }, connecting ? 'Verbinde …' : 'Verbinden'),
        h('button', { class: 'btn quiet', onclick: () => go('#/hilfe/einrichtung') }, 'Wo bekomme ich den Code?')),
      connMsg ? h('p', { class: 'note ' + connMsg.art, role: connMsg.art === 'fehler' ? 'alert' : 'status', 'data-testid': 'verbinden-meldung' }, connMsg.text) : null);
  }

  function renderPlan() {
    clear(planCard);
    planCard.append(h('h2', {}, 'Planung'));
    if (!S.setup) { planCard.append(h('p', { class: 'hint' }, 'Diese Einstellungen stehen im Sheet und gelten für alle, die es nutzen. Sie sind nach dem Verbinden verfügbar.')); return; }
    let por = String(S.norm.einstellungen.standard_portionen); let sp = String(S.norm.einstellungen.wiederholungssperre_tage);
    const status = h('p', { class: 'note', hidden: true, role: 'status', 'data-testid': 'einstellung-meldung' });
    const save = async (key, val, lo, hi, name) => {
      const n = Number(String(val).replace(',', '.'));
      status.hidden = false;
      if (!Number.isInteger(n) || n < lo || n > hi) { status.className = 'note fehler'; status.textContent = `${name}: bitte eine ganze Zahl von ${lo} bis ${hi} eingeben.`; return; }
      try { await app.saveSetting(key, n); status.className = 'note ok'; status.textContent = `${name} gespeichert.`; } catch (e) { status.className = 'note fehler'; status.textContent = fehlerInfo(e).meldung; }
    };
    planCard.append(
      field('Standard-Portionen pro Tag', h('div', { class: 'row' }, h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 20, value: por, 'data-testid': 'einst-portionen', oninput: (e) => { por = e.target.value; } }),
        h('button', { class: 'btn', 'data-testid': 'einst-portionen-speichern', onclick: () => save('standard_portionen', por, 1, 20, 'Standard-Portionen') }, 'Speichern')), 'Gilt für neue Tage. Pro Tag kannst du die Portionen im Plan ändern.'),
      field('Wiederholungssperre in Tagen', h('div', { class: 'row' }, h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 60, value: sp, 'data-testid': 'einst-sperre', oninput: (e) => { sp = e.target.value; } }),
        h('button', { class: 'btn', 'data-testid': 'einst-sperre-speichern', onclick: () => save('wiederholungssperre_tage', sp, 1, 60, 'Wiederholungssperre') }, 'Speichern')), 'So viele Tage vor dem Start werden bereits gekochte Gerichte beim Vorschlag möglichst vermieden.'),
      status);
  }

  const deviceCard = h('section', { class: 'card', 'data-testid': 'geraet' },
    h('h2', {}, 'Dieses Gerät'),
    field('Dein Name (für Bewertungen)', h('input', { type: 'text', value: S.prefs.name, placeholder: 'z. B. Anna', maxlength: 40, 'data-testid': 'einst-name', onchange: (e) => app.setPrefs({ name: e.target.value.trim() }) }), 'Optional. So können zwei Personen dasselbe Gericht am selben Tag getrennt bewerten.'),
    field('Link zum Google Sheet (optional)', h('input', { type: 'url', value: S.prefs.sheetLink, placeholder: 'https://docs.google.com/spreadsheets/…', 'data-testid': 'einst-sheetlink', onchange: (e) => app.setPrefs({ sheetLink: e.target.value.trim() }) }), 'Wird nur in die Chat-Vorlage unter „Neues Gericht“ eingesetzt und bleibt auf diesem Gerät.'));
  // Ausgaben (F25): eigenstaendiger Einstiegspunkt, jederzeit nutzbar, unabhaengig vom aktuellen Einkaufszettel.
  const expensesCard = h('section', { class: 'card' },
    h('h2', {}, 'Ausgaben'),
    h('p', { class: 'hint' }, 'Erfasse Einkäufe und Sonderausgaben wie „10 kg Mehl, Mühle“ – unabhängig vom Wochenplan.'),
    h('button', { class: 'btn', 'data-testid': 'btn-ausgaben-oeffnen', onclick: () => go('#/ausgaben') }, 'Ausgaben erfassen'));

  const aboutCard = h('section', { class: 'card' },
    h('h2', {}, 'Hilfe und Info'),
    h('div', { class: 'stack' },
      h('button', { class: 'btn', 'data-testid': 'btn-tour', onclick: () => startTour({}) }, 'Tour starten'),
      h('button', { class: 'btn', onclick: () => go('#/hilfe') }, 'Hilfe öffnen')),
    h('p', { class: 'hint', 'data-testid': 'version' }, `Kochplaner Version ${APP_VERSION}`));

  root.append(verb, planCard, expensesCard, deviceCard, aboutCard);
  renderConn(); renderPlan();
  let sig = `${!!S.setup}|${S.syncedAt}|${S.norm.gerichte.length}`;
  return { el: root, update: () => { const n = `${!!S.setup}|${S.syncedAt}|${S.norm.gerichte.length}`; if (n !== sig && !connecting) { sig = n; renderConn(); renderPlan(); } } };
}
