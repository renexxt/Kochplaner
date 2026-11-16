// Hilfe (F20): Tour, "Neues Gericht" (F19) und Einrichtung. Funktioniert ohne Netz.
import { h, icon } from '../dom.js';
import { HILFE_KONTEXT, EINRICHTUNG } from '../../content/help.js';
import { importPrompt } from '../../content/import_prompt.js';

export function helpView(app, { go, startTour, from }) {
  const ctx = HILFE_KONTEXT[from];
  const link = (titel, text, hash, tid) => h('button', { class: 'help-link', 'data-testid': tid, onclick: () => go(hash) },
    h('span', {}, h('b', {}, titel), h('span', { class: 'sub' }, text)), icon('chevron', 20));
  return {
    el: h('div', { class: 'view help', 'data-testid': 'hilfe' },
      ctx ? h('section', { class: 'card', 'data-testid': 'hilfe-kontext' }, h('h2', {}, 'Auf diesem Bildschirm'), h('p', {}, ctx)) : null,
      h('section', { class: 'card' },
        h('h2', {}, '1. Geführte Tour'),
        h('p', {}, 'Die Tour zeigt dir Schritt für Schritt, wie du einen Plan machst und den Einkaufszettel weitergibst. Du kannst sie jederzeit überspringen und wiederholen.'),
        h('button', { class: 'btn primary big', 'data-testid': 'btn-tour-starten', onclick: () => startTour({}) }, 'Tour starten')),
      h('section', { class: 'card' }, h('h2', {}, '2. Neues Gericht'), link('Gerichte aufnehmen', 'Per Claude-Chat (Screenshot, Text, Diktat) oder mit dem Formular', '#/hilfe/neu', 'hilfe-neu')),
      h('section', { class: 'card' }, h('h2', {}, '3. Einrichtung'), link('Home-Bildschirm, Setup-Code, Kurzbefehl', 'Einmal einrichten, dann läuft alles', '#/hilfe/einrichtung', 'hilfe-einrichtung'))),
  };
}

export function helpNewDishView(app, { go }) {
  const S = app.state;
  const text = importPrompt({ sheetLink: S.prefs.sheetLink });
  const copyBtn = h('button', { class: 'btn primary', 'data-testid': 'btn-vorlage-kopieren', onclick: async () => { const ok = await app.copyText(text); copyBtn.textContent = ok ? 'Kopiert' : 'Bitte von Hand markieren'; setTimeout(() => { copyBtn.textContent = 'Vorlage kopieren'; }, 2500); } }, icon('copy', 18), 'Vorlage kopieren');
  return {
    el: h('div', { class: 'view help', 'data-testid': 'hilfe-neu-seite' },
      h('section', { class: 'card' },
        h('h2', {}, 'Weg 1: Claude im Chat'),
        h('p', {}, 'Du schickst Claude ein Rezept, Claude trägt es ins Sheet ein. Das geht mit:'),
        h('ul', { class: 'bullets' },
          h('li', {}, h('b', {}, 'Screenshot: '), 'Jedes Bild wird genau ein Gericht. Mehrere Bilder auf einmal sind möglich.'),
          h('li', {}, h('b', {}, 'Text: '), 'Rezept einfügen oder abtippen.'),
          h('li', {}, h('b', {}, 'Diktat: '), 'Mit dem Mikrofon der iOS-Tastatur sprechen. Nur ein Name genügt, dann wird es eine Idee.')),
        h('p', {}, 'Schicke zuerst die Vorlage unten, danach die Rezepte. Claude braucht dafür den verbundenen Google-Sheets-Zugang. Danach hier in der App oben auf „Aktualisieren“ tippen.')),
      h('section', { class: 'card' },
        h('h2', {}, 'Vorlage für den Chat'),
        h('textarea', { readonly: true, rows: 12, 'data-testid': 'vorlage-text', onclick: (e) => e.target.select(), 'aria-label': 'Vorlage für den Claude-Chat' }, text),
        copyBtn,
        S.prefs.sheetLink ? null : h('p', { class: 'hint' }, 'Tipp: Trage unter Einstellungen den Link zu deinem Sheet ein, dann steht er in der Vorlage.')),
      h('section', { class: 'card' },
        h('h2', {}, 'Weg 2: Formular in der App'),
        h('p', {}, 'Name, Portionen, Zutaten und Zubereitung selbst eintragen. Die Zutaten kannst du mit der Schnellerfassung zeilenweise eintippen oder diktieren.'),
        h('button', { class: 'btn', 'data-testid': 'btn-zum-formular', onclick: () => go('#/gericht/neu') }, icon('plus', 18), 'Neues Gericht anlegen'))),
  };
}

export function helpSetupView() {
  return {
    el: h('div', { class: 'view help', 'data-testid': 'hilfe-einrichtung-seite' },
      EINRICHTUNG.map((a) => h('section', { class: 'card' }, h('h2', {}, a.titel), h('ol', { class: 'steps' }, a.schritte.map((s) => h('li', {}, s)))))),
  };
}
