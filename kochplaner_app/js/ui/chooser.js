// Auswahl-Blatt zum Aendern des Gerichts an einem Tag (F03): Suche ueber alle aktiven, fertigen Gerichte.
import { h, icon, clear } from './dom.js';
import { collate, cmpStr, nameKey } from '../core/parse.js';
import { formatDE, weekDays } from '../core/dates.js';
import { deNum } from '../core/format.js';
import { ratingStats } from '../core/ratings.js';

export function openChooser(app, index, overlay) {
  const S = app.state;
  const slot = S.slots[index];
  const wd = weekDays(S.startIso)[index];
  const stats = ratingStats(S.norm);
  const ids = new Set(app.selectable());
  const dishes = S.norm.gerichte.filter((g) => ids.has(g.id)).sort((a, b) => cmpStr(collate(a.name), collate(b.name)) || cmpStr(a.id, b.id));
  let q = '';
  const list = h('ul', { class: 'choices', 'data-testid': 'chooser-liste' });
  const close = () => { overlay.classList.remove('open'); clear(overlay); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  function renderList() {
    clear(list);
    const terms = nameKey(q).split(' ').filter(Boolean);
    const hits = dishes.filter((g) => {
      const hay = nameKey(g.name + ' ' + g.tags.join(' '));
      return terms.every((t) => hay.includes(t));
    });
    if (dishes.length === 0) {
      list.append(h('li', { class: 'empty' }, 'Es gibt noch keine Gerichte, die man auswählen kann. Lege unter „Gerichte“ eines an oder lass es von Claude eintragen.'));
    } else if (hits.length === 0) {
      list.append(h('li', { class: 'empty', 'data-testid': 'chooser-leer' }, 'Kein Gericht gefunden. Versuche einen anderen Suchbegriff.'));
    }
    for (const g of hits) {
      const st = stats.get(g.id);
      list.append(h('li', {}, h('button', {
        class: 'choice' + (g.id === slot.gericht_id ? ' current' : ''), 'data-testid': 'choice-' + g.id, 'data-id': g.id,
        onclick: () => { app.chooseDish(index, g.id); close(); },
      },
      h('span', { class: 'choice-name' }, g.name, g.favorit ? h('span', { class: 'badge fav' }, '★ Favorit') : null, g.nie_wieder ? h('span', { class: 'badge nie' }, 'nie wieder') : null),
      h('span', { class: 'choice-meta' }, [g.kcal_pro_portion !== null ? `${deNum(g.kcal_pro_portion)} kcal pro Portion` : 'kcal fehlt', g.tags.length ? g.tags.join(', ') : null, st ? `Ø ${deNum(st.durchschnitt, 1)} (${st.anzahl})` : null].filter(Boolean).join(' · ')),
      )));
    }
  }

  const search = h('input', {
    type: 'search', placeholder: 'Suche nach Name oder Tag', 'aria-label': 'Suche', 'data-testid': 'chooser-suche', autocomplete: 'off', enterkeyhint: 'search',
    oninput: (e) => { q = e.target.value; renderList(); },
  });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Gericht auswählen', 'data-testid': 'chooser' },
    h('div', { class: 'sheet-head' },
      h('div', {}, h('div', { class: 'sheet-title' }, 'Gericht auswählen'), h('div', { class: 'sheet-sub' }, `${wd.wochentag}, ${formatDE(slot.datum)}`)),
      h('button', { class: 'icon-btn', 'aria-label': 'Schließen', 'data-testid': 'chooser-schliessen', onclick: close }, icon('close'))),
    h('div', { class: 'sheet-tools' },
      h('label', { class: 'search' }, icon('search', 18), search),
      h('div', { class: 'row' },
        h('button', { class: 'btn', 'data-testid': 'chooser-wuerfeln', disabled: slot.fixiert, title: 'Nur diesen Tag neu würfeln', 'aria-label': 'Neu würfeln, nur dieser Tag', onclick: () => { if (app.reroll(index)) close(); } }, icon('dice', 18), 'Neu würfeln'))),
    list);
  const backdrop = h('div', { class: 'backdrop', onclick: close });
  clear(overlay);
  overlay.append(backdrop, sheet);
  overlay.classList.add('open');
  document.addEventListener('keydown', onKey);
  renderList();
  setTimeout(() => search.focus({ preventScroll: true }), 50);
  return { close };
}
