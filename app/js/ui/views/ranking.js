// Rangliste (F23): beste und schwaechste Gerichte nach Durchschnitt (ab 2 Bewertungen)
import { h, clear } from '../dom.js';
import { ranking } from '../../core/ratings.js';
import { deNum, stars } from '../../core/format.js';

export function rankingView(app, { setupNeeded, go }) {
  const S = app.state;
  const root = h('div', { class: 'view rank' });
  if (!S.setup) { root.append(setupNeeded()); return { el: root }; }
  const body = h('div', {});
  root.append(body);

  function section(titel, ids, rows, testid) {
    const byId = new Map(rows.map((r) => [r.gericht_id, r]));
    const names = new Map(S.norm.gerichte.map((g) => [g.id, g.name]));
    return h('section', { class: 'card', 'data-testid': testid },
      h('h2', {}, titel),
      ids.length === 0 ? h('p', { class: 'hint' }, 'Noch keine Einträge.') : h('ol', { class: 'rank-list' }, ids.map((id, i) => {
        const r = byId.get(id);
        return h('li', { 'data-testid': `${testid}-eintrag`, 'data-id': id },
          h('span', { class: 'pos' }, String(i + 1)),
          h('span', { class: 'nm' }, names.get(id) || id),
          h('span', { class: 'sc' }, h('b', {}, `Ø ${deNum(r.durchschnitt, 1)}`), ' ', h('span', { class: 'stars-small', 'aria-hidden': 'true' }, stars(Math.round(r.durchschnitt))), h('span', { class: 'cnt' }, ` ${r.anzahl} Bewertungen`)));
      })));
  }

  function render() {
    clear(body);
    const rk = ranking(S.norm);
    if (rk.alle.length === 0) {
      body.append(h('section', { class: 'card', 'data-testid': 'rangliste-leer' },
        h('h2', {}, 'Noch keine Rangliste'),
        h('p', {}, 'Sie erscheint, sobald ein Gericht mindestens 2 Bewertungen hat. Bewerten kannst du im Plan an heutigen und vergangenen Tagen.'),
        h('button', { class: 'btn', onclick: () => go('#/plan') }, 'Zum Plan')));
    } else {
      body.append(section('Beste Gerichte', rk.beste, rk.alle, 'beste'), section('Schwächste Gerichte', rk.schwaechste, rk.alle, 'schwaechste'));
      body.append(h('details', { class: 'card', 'data-testid': 'rangliste-alle' }, h('summary', {}, `Alle bewerteten Gerichte (${rk.alle.length})`),
        h('ol', { class: 'rank-list' }, rk.alle.map((r, i) => h('li', {}, h('span', { class: 'pos' }, String(i + 1)), h('span', { class: 'nm' }, S.norm.gerichte.find((g) => g.id === r.gericht_id)?.name || r.gericht_id), h('span', { class: 'sc' }, h('b', {}, `Ø ${deNum(r.durchschnitt, 1)}`), h('span', { class: 'cnt' }, ` ${r.anzahl} Bewertungen`)))))));
    }
    body.append(h('p', { class: 'hint' }, 'Wirkung auf den Vorschlag: Gerichte mit Durchschnitt ab 4 werden 1,5-mal so oft vorgeschlagen, Gerichte mit Durchschnitt bis 2 halb so oft (jeweils ab 2 Bewertungen). Favoriten zählen doppelt.'));
  }
  render();
  return { el: root, update: render };
}
