// Plan-Ansicht (F01 bis F05, F10, F22): Startdatum, 7 Tage, Shuffle, Tag aendern, fixieren, Portionen, Bewerten
import { h, icon, clear } from '../dom.js';
import { weekDays, formatDE, addDays } from '../../core/dates.js';
import { kcalTotal } from '../../core/shopping.js';
import { ratingStats } from '../../core/ratings.js';
import { deNum, stars } from '../../core/format.js';
import { openChooser } from '../chooser.js';
import { MIN_PORTIONEN, MAX_PORTIONEN } from '../../core/plan.js';

const STATUS = {
  leer: '', ok: 'Gespeichert', wartet: 'Änderung wird gleich gespeichert …', speichert: 'Speichert …',
  fehler: 'Nicht gespeichert', offline: 'Offline: nicht gespeichert',
};

export function planView(app, { overlay, setupNeeded }) {
  const S = app.state;
  const drafts = new Map();
  const root = h('div', { class: 'view plan' });
  if (!S.setup) { root.append(setupNeeded()); return { el: root }; }

  const startInput = h('input', {
    type: 'date', id: 'startdatum', value: S.startIso, 'data-testid': 'plan-start', 'aria-label': 'Startdatum',
    onchange: (e) => { if (!app.setStart(e.target.value)) e.target.value = S.startIso; },
  });
  const rangeEl = h('p', { class: 'range', 'data-testid': 'plan-bereich' });
  const shuffleDiaetBtn = h('button', { class: 'btn primary', 'data-testid': 'btn-shuffle-diaet', onclick: () => app.shuffleAll('diaet') }, icon('dice', 20), h('span', {}, 'Diät würfeln'));
  const shuffleAlleBtn = h('button', { class: 'btn primary', 'data-testid': 'btn-shuffle-alle', 'data-tour': 'shuffle', onclick: () => app.shuffleAll('alle') }, icon('dice', 20), h('span', {}, 'Alle würfeln'));
  const shuffleLeckerBtn = h('button', { class: 'btn primary', 'data-testid': 'btn-shuffle-lecker', onclick: () => app.shuffleAll('lecker') }, icon('dice', 20), h('span', {}, 'Lecker würfeln'));
  const statusEl = h('p', { class: 'plan-status', 'data-testid': 'plan-status', role: 'status' });
  const warnEl = h('div', { 'data-testid': 'plan-warnung' });
  const listEl = h('ol', { class: 'days', 'data-testid': 'plan-tage' });

  root.append(
    h('section', { class: 'card start', 'data-tour': 'start' },
      h('label', { for: 'startdatum', class: 'lbl' }, 'Startdatum'),
      h('div', { class: 'row' }, startInput, h('button', { class: 'btn quiet', 'aria-label': 'Heute als Start', 'data-testid': 'start-heute', onclick: () => { app.setStart(app.today()); } }, 'Heute')),
      rangeEl),
    h('div', { class: 'actions row shuffle-row' }, shuffleDiaetBtn, shuffleAlleBtn, shuffleLeckerBtn),
    warnEl, statusEl, listEl);

  const dish = (id) => S.norm.gerichte.find((g) => g.id === id) || null;

  function ratingBox(slot, i, g, firstRate) {
    if (slot.datum > app.today()) return h('p', { class: 'hint', 'data-testid': `day-${i}-bewerten-spaeter` }, 'Bewerten ist ab dem Kochtag möglich.');
    const own = app.ownRating(slot.gericht_id, slot.datum);
    const d = drafts.get(i) || { sterne: own ? own.sterne : 0, notiz: own ? own.notiz : '', gericht: slot.gericht_id };
    if (d.gericht !== slot.gericht_id) { d.sterne = own ? own.sterne : 0; d.notiz = own ? own.notiz : ''; d.gericht = slot.gericht_id; }
    drafts.set(i, d);
    const info = h('span', { class: 'hint', 'data-testid': `day-${i}-bewertung-status` }, own ? `Gespeichert: ${stars(own.sterne)}${own.notiz ? ' · ' + own.notiz : ''}` : 'Noch nicht bewertet');
    const save = h('button', {
      class: 'btn', 'data-testid': `day-${i}-bewertung-speichern`, disabled: d.sterne === 0,
      onclick: async () => {
        const r = await app.rate(i, d.sterne, d.notiz);
        if (r.ok) { drafts.delete(i); app.toast('Bewertung gespeichert.', 'ok'); }
      },
    }, 'Bewertung speichern');
    return h('div', { class: 'rate', 'data-testid': `day-${i}-bewertung`, 'data-tour': firstRate ? 'bewerten' : null },
      h('div', { class: 'rate-label' }, 'Wie war es?'),
      h('div', { class: 'stars', role: 'group', 'aria-label': 'Sterne' },
        [1, 2, 3, 4, 5].map((n) => h('button', {
          class: 'star' + (n <= d.sterne ? ' on' : ''), 'aria-label': `${n} ${n === 1 ? 'Stern' : 'Sterne'}`, 'aria-pressed': n === d.sterne ? 'true' : 'false',
          'data-testid': `day-${i}-stern-${n}`, onclick: () => { d.sterne = n; renderList(); },
        }, n <= d.sterne ? '★' : '☆'))),
      h('input', {
        type: 'text', placeholder: 'Notiz (optional)', value: d.notiz, maxlength: 500, 'aria-label': 'Notiz zur Bewertung', 'data-testid': `day-${i}-notiz`,
        oninput: (e) => { d.notiz = e.target.value; },
      }),
      h('div', { class: 'row between' }, save, info));
  }

  function dayCard(slot, i, state) {
    const g = dish(slot.gericht_id);
    const wd = weekDays(S.startIso)[i];
    const total = g ? kcalTotal(g, slot.portionen) : null;
    const st = g ? state.stats.get(g.id) : null;
    const heute = slot.datum === app.today();
    const firstRate = !!g && slot.datum <= app.today() && !state.rateShown;
    if (firstRate) state.rateShown = true;
    return h('li', { class: 'day' + (slot.fixiert ? ' fixed' : '') + (heute ? ' heute' : ''), 'data-testid': `day-${i}`, 'data-datum': slot.datum },
      h('div', { class: 'day-head' },
        h('span', { class: 'wd', 'data-testid': `day-${i}-datum` }, `${wd.wochentag}, ${formatDE(slot.datum)}`),
        heute ? h('span', { class: 'tag' }, 'heute') : null,
        h('button', {
          class: 'chip' + (slot.fixiert ? ' on' : ''), 'aria-pressed': slot.fixiert ? 'true' : 'false', 'aria-label': slot.fixiert ? 'Fixierung lösen' : 'Tag fixieren',
          'data-testid': `day-${i}-fix`, 'data-tour': i === 0 ? 'fix' : null, disabled: !g, onclick: () => app.fixToggle(i),
        }, icon(slot.fixiert ? 'lock' : 'unlock', 18), slot.fixiert ? 'Fixiert' : 'Fixieren')),
      h('button', {
        class: 'dish-btn' + (g ? '' : ' empty'), 'data-testid': `day-${i}-name`, 'data-tour': i === 0 ? 'tag' : null, 'aria-label': g ? `Gericht ändern: ${g.name}` : 'Gericht wählen',
        onclick: () => openChooser(app, i, overlay),
      }, h('span', { class: 'dish-name' }, g ? g.name : 'Gericht wählen'), g && st ? h('span', { class: 'avg', 'data-testid': `day-${i}-schnitt` }, `Ø ${deNum(st.durchschnitt, 1)} (${st.anzahl})`) : null, icon('chevron', 18)),
      g ? h('p', { class: 'kcal', 'data-testid': `day-${i}-kcal` },
        g.kcal_pro_portion !== null
          ? [h('span', { 'data-testid': `day-${i}-kcal-pro` }, `${deNum(g.kcal_pro_portion)} kcal pro Portion`), ' · ', h('span', { 'data-testid': `day-${i}-kcal-gesamt` }, `${deNum(total)} kcal gesamt`)]
          : h('span', { class: 'missing', 'data-testid': `day-${i}-kcal-fehlt` }, 'kcal fehlt')) : null,
      h('div', { class: 'row between ctl' },
        h('div', { class: 'stepper', 'data-tour': i === 0 ? 'portionen' : null },
          h('button', { class: 'icon-btn round', 'aria-label': 'Eine Portion weniger', 'data-testid': `day-${i}-minus`, disabled: slot.portionen <= MIN_PORTIONEN, onclick: () => app.portionen(i, -1) }, icon('minus')),
          h('span', { class: 'portionen', 'data-testid': `day-${i}-portionen`, 'aria-live': 'polite' }, String(slot.portionen)), h('span', { class: 'unit' }, slot.portionen === 1 ? 'Portion' : 'Portionen'),
          h('button', { class: 'icon-btn round', 'aria-label': 'Eine Portion mehr', 'data-testid': `day-${i}-plus`, disabled: slot.portionen >= MAX_PORTIONEN, onclick: () => app.portionen(i, 1) }, icon('plus'))),
        h('button', { class: 'btn quiet', 'data-testid': `day-${i}-reroll`, disabled: slot.fixiert, 'aria-label': 'Neu würfeln, nur dieser Tag', onclick: () => app.reroll(i) }, icon('dice', 18), 'Neu würfeln')),
      g ? ratingBox(slot, i, g, firstRate) : null);
  }

  function renderList() {
    // Beim Neuaufbau Fokus und Cursor im Notizfeld behalten (sonst schliesst sich auf dem iPhone die Tastatur beim Tippen)
    const ae = document.activeElement;
    const keep = ae && ae.tagName === 'INPUT' && ae.dataset.testid && listEl.contains(ae) ? { id: ae.dataset.testid, s: ae.selectionStart, e: ae.selectionEnd } : null;
    const days = weekDays(S.startIso);
    if (startInput.value !== S.startIso) startInput.value = S.startIso;
    rangeEl.textContent = `${days[0].wochentag}, ${formatDE(days[0].datum)} bis ${days[6].wochentag}, ${formatDE(days[6].datum)} (7 Tage)`;
    clear(warnEl);
    if (S.warnung === 'WENIGER_ALS_7') warnEl.append(h('p', { class: 'note warn', role: 'alert' }, 'Es gibt weniger als 7 passende Gerichte. Einzelne Gerichte kommen deshalb mehrfach vor. Lege weitere Gerichte an, damit es abwechslungsreicher wird.'));
    if (S.norm.gerichte.length === 0) warnEl.append(h('p', { class: 'note', 'data-testid': 'plan-keine-gerichte' }, 'Im Sheet gibt es noch keine Gerichte. Unter „Gerichte“ kannst du eines anlegen, oder du lässt Claude welche eintragen (siehe Hilfe).'));
    statusEl.textContent = STATUS[S.planStatus] || '';
    statusEl.className = 'plan-status ' + S.planStatus;
    clear(listEl);
    const state = { stats: ratingStats(S.norm), rateShown: false };
    S.slots.forEach((slot, i) => listEl.append(dayCard(slot, i, state)));
    if (keep) {
      const el = listEl.querySelector(`[data-testid="${keep.id}"]`);
      if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(keep.s, keep.e); } catch { /* egal */ } }
    }
  }

  renderList();
  return { el: root, update: renderList };
}
