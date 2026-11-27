// Ausgaben erfassen (F24): eigenstaendiger Einstiegspunkt, jederzeit nutzbar, nicht an einen bestimmten
// Einkaufszettel oder Plan gebunden. Erreichbar ueber Einstellungen und (zusaetzlich) ueber einen Button
// direkt auf dem Einkaufszettel-Bildschirm (shopping.js).
import { h, clear } from '../dom.js';
import { formatDE } from '../../core/dates.js';
import { deNum } from '../../core/format.js';
import { parseBetrag, betragGueltig, BETRAG_MAX, sortAusgaben } from '../../core/expenses.js';
import { fehlerInfo } from '../../state.js';

export function expensesView(app, { setupNeeded }) {
  const S = app.state;
  const root = h('div', { class: 'view expenses' });
  if (!S.setup) { root.append(setupNeeded()); return { el: root }; }

  const f = { datum: app.today(), betrag: '', beschreibung: '' };
  let busy = false;
  const msg = h('div', { 'data-testid': 'ausgabe-meldung', role: 'status' });
  const setMsg = (art, text) => { clear(msg); if (text) msg.append(h('p', { class: 'note ' + art, role: art === 'fehler' ? 'alert' : 'status' }, text)); };

  function validate() {
    const errs = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.datum || '')) errs.push('Bitte ein gültiges Datum wählen.');
    const betrag = parseBetrag(f.betrag);
    if (!betragGueltig(betrag)) errs.push(`Betrag: bitte eine Zahl größer als 0 (höchstens ${deNum(BETRAG_MAX)}) eingeben, z. B. „23,50“.`);
    const beschreibung = f.beschreibung.trim();
    if (!beschreibung) errs.push('Bitte eine Beschreibung eingeben, z. B. „Wocheneinkauf“.');
    return { errs, datum: f.datum, betrag, beschreibung };
  }

  async function save() {
    if (busy) return;
    const v = validate();
    if (v.errs.length) { setMsg('fehler', v.errs.join(' ')); return; }
    busy = true; saveBtn.disabled = true; saveBtn.textContent = 'Speichert …'; setMsg('', '');
    try {
      await app.saveAusgabe({ datum: v.datum, betrag: v.betrag, beschreibung: v.beschreibung });
      f.betrag = ''; f.beschreibung = '';
      betragEl.value = ''; beschreibungEl.value = '';
      setMsg('ok', 'Ausgabe gespeichert.');
    } catch (e) {
      setMsg('fehler', `Nicht gespeichert: ${fehlerInfo(e).meldung} Deine Eingaben sind noch da.`);
    } finally {
      busy = false; saveBtn.disabled = false; saveBtn.textContent = 'Speichern';
    }
  }

  const field = (label, input, hint) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
  const datumEl = h('input', { type: 'date', value: f.datum, 'aria-label': 'Datum', 'data-testid': 'ausgabe-datum', oninput: (e) => { f.datum = e.target.value; } });
  const betragEl = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'z. B. 23,50', 'aria-label': 'Betrag in Euro', 'data-testid': 'ausgabe-betrag', oninput: (e) => { f.betrag = e.target.value; } });
  const beschreibungEl = h('input', { type: 'text', maxlength: 200, placeholder: 'z. B. „Wocheneinkauf“ oder „10 kg Mehl, Mühle“', 'aria-label': 'Beschreibung', 'data-testid': 'ausgabe-beschreibung', oninput: (e) => { f.beschreibung = e.target.value; } });
  const saveBtn = h('button', { class: 'btn primary big', 'data-testid': 'btn-ausgabe-speichern', onclick: save }, 'Speichern');

  const listeEl = h('ul', { class: 'rank-list', 'data-testid': 'ausgaben-liste' });
  const fehlerBox = h('div', {});

  function renderFehler() {
    clear(fehlerBox);
    if (S.ausgabenFehler) {
      fehlerBox.append(h('div', { class: 'note fehler row between', role: 'alert', 'data-testid': 'ausgaben-fehler' },
        h('span', {}, S.ausgabenFehler.meldung),
        h('button', { class: 'btn small', 'data-testid': 'btn-ausgaben-erneut', onclick: () => app.loadAusgaben() }, 'Erneut versuchen')));
    }
  }
  function renderListe() {
    clear(listeEl);
    const liste = sortAusgaben(S.ausgaben || []);
    if (!liste.length) {
      listeEl.append(h('li', { class: 'empty', 'data-testid': 'ausgaben-leer' }, S.ausgabenLoading ? 'Lädt …' : 'Noch keine Ausgaben erfasst.'));
      return;
    }
    for (const a of liste) {
      listeEl.append(h('li', { 'data-testid': 'ausgabe-eintrag' },
        h('span', { class: 'nm' }, `${formatDE(String(a.datum).slice(0, 10))} · ${a.beschreibung}`),
        h('span', { class: 'sc' }, h('b', {}, `${deNum(a.betrag, 2)} €`))));
    }
  }

  root.append(
    h('section', { class: 'card' },
      h('h2', {}, 'Ausgabe eintragen'),
      h('p', { class: 'hint' }, 'Unabhängig vom Einkaufszettel – auch für Sonderfälle wie „10 kg Mehl, Mühle“.'),
      field('Datum', datumEl),
      field('Betrag in Euro', betragEl),
      field('Beschreibung', beschreibungEl),
      msg,
      saveBtn),
    h('section', { class: 'card' },
      h('h2', {}, 'Zuletzt erfasst'),
      fehlerBox,
      listeEl));

  renderListe(); renderFehler();
  app.loadAusgaben();
  return { el: root, update: () => { renderListe(); renderFehler(); } };
}
