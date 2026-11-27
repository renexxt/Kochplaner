// Einkaufszettel (F06 bis F09): flache Liste, abhaken, Export nach Erinnerungen und Notes
import { h, icon, clear } from '../dom.js';
import { exportText, shortcutUrl, NOTES_ANLEITUNG, KURZBEFEHL_NAME } from '../../core/export.js';
import { weekDays, formatDE } from '../../core/dates.js';

export function shoppingView(app, { setupNeeded, go }) {
  const S = app.state;
  const root = h('div', { class: 'view shop' });
  if (!S.setup) { root.append(setupNeeded()); return { el: root }; }

  const summary = h('p', { class: 'summary', 'data-testid': 'einkauf-zusammenfassung' });
  const listEl = h('ul', { class: 'shop-list', 'data-testid': 'einkauf-liste', 'data-tour': 'liste' });
  const msg = h('div', { class: 'note', hidden: true, role: 'status', 'data-testid': 'export-meldung' });
  const notesHint = h('p', { class: 'hint', 'data-testid': 'notes-anleitung' }, `So geht es in Notes: ${NOTES_ANLEITUNG}.`);
  const resetBtn = h('button', { class: 'btn quiet', 'data-testid': 'btn-zuruecksetzen', onclick: () => app.resetChecks() }, 'Zurücksetzen');
  const showMsg = (text, art = 'ok') => { msg.hidden = false; msg.className = 'note ' + art; msg.textContent = text; };

  async function toReminders() {
    const items = app.shopping();
    if (!items.length) return showMsg('Der Einkaufszettel ist leer.', 'warn');
    const text = exportText(items);
    const copied = await app.copyText(text);
    if (!copied) {
      const shared = await app.shareText(text);
      return showMsg(shared ? 'Die Liste wurde über „Teilen“ weitergegeben. Wähle dort Erinnerungen.' : 'Kopieren und Teilen sind hier nicht möglich. Bitte „Für Notes kopieren“ probieren oder die Liste von Hand abschreiben.', 'warn');
    }
    showMsg(`Liste kopiert. Der Kurzbefehl „${KURZBEFEHL_NAME}“ wird gestartet. Klappt das nicht, nutze „Teilen“ (siehe Hilfe → Einrichtung).`);
    app.openUrl(shortcutUrl());
  }
  async function toNotes() {
    const items = app.shopping();
    if (!items.length) return showMsg('Der Einkaufszettel ist leer.', 'warn');
    const ok = await app.copyText(exportText(items));
    showMsg(ok ? `Liste kopiert. Jetzt in Notes: ${NOTES_ANLEITUNG}.` : 'Kopieren ist hier nicht möglich. Bitte „Teilen“ nutzen.', ok ? 'ok' : 'warn');
  }
  async function share() {
    const items = app.shopping();
    if (!items.length) return showMsg('Der Einkaufszettel ist leer.', 'warn');
    const text = exportText(items);
    const shared = await app.shareText(text);
    if (shared) return showMsg('Geteilt.');
    const ok = await app.copyText(text);
    showMsg(ok ? 'Teilen ist hier nicht verfügbar. Die Liste wurde stattdessen kopiert.' : 'Teilen und Kopieren sind hier nicht möglich.', 'warn');
  }

  root.append(
    h('div', { class: 'row between' }, summary, resetBtn),
    listEl,
    h('section', { class: 'card export', 'data-tour': 'export' },
      h('h2', {}, 'Liste weitergeben'),
      h('div', { class: 'stack' },
        h('button', { class: 'btn primary big', 'data-testid': 'btn-erinnerungen', onclick: toReminders }, icon('check', 20), 'In Erinnerungen'),
        h('button', { class: 'btn big', 'data-testid': 'btn-notes', onclick: toNotes }, icon('copy', 20), 'Für Notes kopieren'),
        h('button', { class: 'btn quiet', 'data-testid': 'btn-teilen', onclick: share }, icon('share', 18), 'Teilen …')),
      notesHint, msg),
    // Ausgaben (F24): unabhaengig von dieser Liste, auch fuer Sonderfaelle wie "10 kg Mehl, Mühle".
    h('section', { class: 'card' },
      h('h2', {}, 'Nach dem Einkaufen'),
      h('p', { class: 'hint' }, 'Trage ein, was der Einkauf gekostet hat – unabhängig vom Einkaufszettel.'),
      h('button', { class: 'btn', 'data-testid': 'btn-ausgabe-eintragen', onclick: () => go('#/ausgaben') }, 'Ausgabe eintragen')));

  function render() {
    const items = app.shopping();
    const days = weekDays(S.startIso);
    clear(listEl);
    const done = items.filter((i) => S.checked[i.id]).length;
    if (!items.length && S.listeFehler) {
      summary.textContent = '';
      listEl.append(h('li', { class: 'empty fehler', role: 'alert', 'data-testid': 'einkauf-fehler' }, S.listeFehler));
      resetBtn.disabled = true;
      return;
    }
    if (!items.length) {
      summary.textContent = '';
      listEl.append(h('li', { class: 'empty', 'data-testid': 'einkauf-leer' },
        'Noch kein Einkaufszettel. Er entsteht aus den Gerichten im Plan.',
        h('div', {}, h('button', { class: 'btn', onclick: () => go('#/plan') }, 'Zum Plan'))));
      resetBtn.disabled = true;
      return;
    }
    resetBtn.disabled = false;
    summary.textContent = `${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'} · ${done} abgehakt · ${formatDE(days[0].datum)} bis ${formatDE(days[6].datum)}`;
    for (const it of items) {
      const on = !!S.checked[it.id];
      listEl.append(h('li', {}, h('button', {
        class: 'shop-item' + (on ? ' done' : ''), role: 'checkbox', 'aria-checked': on ? 'true' : 'false', 'data-testid': 'einkauf-eintrag', 'data-key': it.key,
        onclick: () => app.toggleCheck(it.id),
      }, h('span', { class: 'box' }, on ? icon('check', 18) : null), h('span', { class: 'txt' }, it.anzeige))));
    }
  }
  render();
  return { el: root, update: render };
}
