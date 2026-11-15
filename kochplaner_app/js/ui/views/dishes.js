// Gerichteliste (F13): Suche nach Name und Tag, Filter, Schalter fuer favorit, nie_wieder und aktiv
import { h, icon, clear } from '../dom.js';
import { nameKey, collate, cmpStr } from '../../core/parse.js';
import { ratingStats } from '../../core/ratings.js';
import { deNum } from '../../core/format.js';

const FILTER = [['alle', 'Alle'], ['favoriten', 'Favoriten'], ['ideen', 'Ideen'], ['archiviert', 'Archiviert']];

export function dishesView(app, { setupNeeded, go }) {
  const S = app.state;
  const root = h('div', { class: 'view dishes' });
  if (!S.setup) { root.append(setupNeeded()); return { el: root }; }
  let q = ''; let filter = 'alle';
  const listEl = h('ul', { class: 'dish-list', 'data-testid': 'gerichte-liste' });
  const chipsEl = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter' });
  const countEl = h('p', { class: 'summary', 'data-testid': 'gerichte-anzahl', role: 'status' });
  const search = h('input', { type: 'search', placeholder: 'Suche nach Name oder Tag', 'aria-label': 'Suche', 'data-testid': 'gerichte-suche', autocomplete: 'off', oninput: (e) => { q = e.target.value; render(); } });
  root.append(
    h('div', { class: 'row between' }, h('label', { class: 'search grow' }, icon('search', 18), search),
      h('button', { class: 'btn primary', 'data-testid': 'btn-neues-gericht', onclick: () => go('#/gericht/neu') }, icon('plus', 18), 'Neu')),
    chipsEl, countEl, listEl);

  const toggle = (g, feld, label, on, tid, hint) => h('button', {
    class: 'chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', 'data-testid': `gericht-${g.id}-${tid}`, title: hint,
    onclick: () => app.setDishFlag(g.id, feld, !on),
  }, label);

  function render() {
    clear(chipsEl);
    for (const [k, label] of FILTER) chipsEl.append(h('button', { class: 'chip' + (filter === k ? ' on' : ''), 'aria-pressed': filter === k ? 'true' : 'false', 'data-testid': 'filter-' + k, onclick: () => { filter = k; render(); } }, label));
    const terms = nameKey(q).split(' ').filter(Boolean);
    const stats = ratingStats(S.norm);
    const hits = S.norm.gerichte.filter((g) => {
      if (filter === 'archiviert' ? g.aktiv : !g.aktiv) return false;
      if (filter === 'favoriten' && !g.favorit) return false;
      if (filter === 'ideen' && g.status !== 'idee') return false;
      const hay = nameKey(g.name + ' ' + g.tags.join(' '));
      return terms.every((t) => hay.includes(t));
    }).sort((a, b) => cmpStr(collate(a.name), collate(b.name)) || cmpStr(a.id, b.id));
    countEl.textContent = `${hits.length} ${hits.length === 1 ? 'Gericht' : 'Gerichte'}`;
    clear(listEl);
    if (S.norm.gerichte.length === 0) listEl.append(h('li', { class: 'empty', 'data-testid': 'gerichte-leer' }, 'Im Sheet stehen noch keine Gerichte. Lege mit „Neu“ eines an oder lass Claude Gerichte eintragen (Hilfe → Neues Gericht).'));
    else if (hits.length === 0) listEl.append(h('li', { class: 'empty', 'data-testid': 'gerichte-nichts' }, 'Nichts gefunden. Probiere einen anderen Suchbegriff oder Filter.'));
    for (const g of hits) {
      const st = stats.get(g.id);
      listEl.append(h('li', { class: 'dish-card' + (g.aktiv ? '' : ' archived'), 'data-testid': 'gericht', 'data-id': g.id },
        h('button', { class: 'dish-open', 'data-testid': `gericht-${g.id}-oeffnen`, onclick: () => go('#/gericht/' + g.id), 'aria-label': `${g.name} bearbeiten` },
          h('span', { class: 'dish-text' },
            h('span', { class: 'dish-title' }, g.name, g.status === 'idee' ? h('span', { class: 'badge idee' }, 'Idee') : null, g.nie_wieder ? h('span', { class: 'badge nie' }, 'nie wieder') : null, !g.aktiv ? h('span', { class: 'badge arch' }, 'archiviert') : null),
            h('span', { class: 'dish-meta' }, [g.kcal_pro_portion !== null ? `${deNum(g.kcal_pro_portion)} kcal pro Portion` : 'kcal fehlt', g.tags.length ? g.tags.join(', ') : null, st ? `Ø ${deNum(st.durchschnitt, 1)} (${st.anzahl})` : null].filter(Boolean).join(' · '))),
          icon('chevron', 18)),
        h('div', { class: 'row wrap flags' },
          toggle(g, 'favorit', g.favorit ? '★ Favorit' : '☆ Favorit', g.favorit, 'fav', 'Favoriten werden öfter vorgeschlagen'),
          toggle(g, 'nie_wieder', 'Nie wieder', g.nie_wieder, 'nie', 'Wird nie vorgeschlagen'),
          toggle(g, 'aktiv', g.aktiv ? 'Aktiv' : 'Archiviert', g.aktiv, 'aktiv', 'Archivierte Gerichte erscheinen nirgends'))));
    }
  }
  render();
  return { el: root, update: render };
}
