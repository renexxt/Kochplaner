// Gefuehrte Tour (F20): hebt das jeweilige Bedienelement hervor, laesst sich ueberspringen und wiederholen.
import { h, clear } from './dom.js';
import { TOUR } from '../content/help.js';

export function createTour(app, { layer, go }) {
  let step = 0; let active = false; let onResize = null;
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const finish = (done) => {
    active = false; clear(layer); layer.classList.remove('open');
    if (onResize) { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); onResize = null; }
    if (done !== undefined) app.setPrefs({ tourDone: true });
  };

  async function show(i) {
    step = i;
    const s = TOUR[i];
    go(s.route);
    await frames();
    if (!active) return;
    draw(s);
    await frames();
    if (!active) return;
    draw(s); // nach dem Scrollen noch einmal exakt ausrichten
    onResize = () => draw(s);
    window.addEventListener('resize', onResize); window.addEventListener('orientationchange', onResize);
  }

  const ziel = (s) => document.querySelector(s.sel) || (s.fallback && document.querySelector(s.fallback));

  // Karte und Markierung so setzen, dass die Karte das Bedienelement nie verdeckt und komplett auf dem Bildschirm liegt.
  // Die Karte sitzt am oberen oder unteren Rand, das Bedienelement wird in den freien Bereich gescrollt.
  function place(card, hole, el) {
    const vh = window.innerHeight; const vw = window.innerWidth;
    const pad = 6; const gap = 12; const rand = 12;
    card.style.width = `${Math.min(440, vw - 24)}px`;
    card.style.left = '50%'; card.style.transform = 'translateX(-50%)'; card.style.top = `${rand}px`;
    const cardH = card.offsetHeight;
    if (!el) { hole.style.display = 'none'; card.style.top = `${Math.max(rand, Math.round((vh - cardH) / 2))}px`; return; }
    const main = document.getElementById('view');
    const kopf = document.querySelector('header.top'); const tabs = document.getElementById('tabs');
    const zonen = {
      unten: { kartenTop: vh - rand - cardH, von: (kopf ? kopf.getBoundingClientRect().bottom : 0), bis: vh - rand - cardH - gap },
      oben: { kartenTop: rand, von: rand + cardH + gap, bis: (tabs ? tabs.getBoundingClientRect().top : vh) },
    };
    const anpassen = (name) => {
      const z = zonen[name]; const lo = z.von + pad; const hi = z.bis - pad;
      let r = el.getBoundingClientRect();
      let delta = 0;
      if (r.height > hi - lo || r.top < lo) delta = r.top - lo; else if (r.bottom > hi) delta = r.bottom - hi;
      if (delta && main) main.scrollTop += delta;
      r = el.getBoundingClientRect();
      return { name, z, lo, hi, r, passt: r.top >= lo - 1 && r.bottom <= hi + 1 };
    };
    const mitte = el.getBoundingClientRect(); const zuerstUnten = mitte.top + mitte.height / 2 < vh / 2;
    let wahl = null;
    for (const name of zuerstUnten ? ['unten', 'oben'] : ['oben', 'unten']) { const c = anpassen(name); if (c.passt) { wahl = c; break; } }
    if (!wahl) { // nichts passt vollstaendig (sehr hohes Element): groesseren freien Bereich nehmen, Markierung auf den sichtbaren Teil begrenzen
      wahl = anpassen(zonen.unten.bis - zonen.unten.von >= zonen.oben.bis - zonen.oben.von ? 'unten' : 'oben');
    }
    const { z, lo, hi, r } = wahl;
    const top = Math.max(r.top, lo); const bottom = Math.min(r.bottom, hi);
    Object.assign(hole.style, { top: `${top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + 2 * pad}px`, height: `${Math.max(0, bottom - top) + 2 * pad}px` });
    hole.dataset.ziel = TOUR[step].sel;
    card.style.top = `${z.kartenTop}px`;
  }

  function draw(s) {
    clear(layer);
    const last = step === TOUR.length - 1;
    const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Tour', 'data-testid': 'tour-karte' },
      h('div', { class: 'tour-kopf' },
        h('div', { class: 'tour-step', 'data-testid': 'tour-schritt' }, `Schritt ${step + 1} von ${TOUR.length}`),
        h('button', { class: 'btn quiet small', 'data-testid': 'tour-ueberspringen', onclick: () => finish(true) }, 'Überspringen')),
      h('h3', { 'data-testid': 'tour-titel' }, s.titel),
      h('p', {}, s.text),
      h('div', { class: 'tour-aktionen' },
        step > 0 ? h('button', { class: 'btn', 'data-testid': 'tour-zurueck', onclick: () => show(step - 1) }, 'Zurück') : null,
        h('button', { class: 'btn primary', 'data-testid': 'tour-weiter', onclick: () => (last ? (finish(true), go('#/plan')) : show(step + 1)) }, last ? 'Fertig' : 'Weiter')));
    const hole = h('div', { class: 'tour-hole', 'data-testid': 'tour-markierung' });
    layer.append(hole, card);
    layer.classList.add('open');
    place(card, hole, ziel(s));
  }

  function offer() {
    clear(layer); layer.classList.add('open');
    layer.append(h('div', { class: 'tour-card center', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Tour anbieten', 'data-testid': 'tour-angebot' },
      h('h3', {}, 'Kurze Tour?'),
      h('p', {}, 'In etwa einer Minute zeige ich dir, wie du einen Plan machst und den Einkaufszettel weitergibst. Du kannst sie später in der Hilfe wiederholen.'),
      h('div', { class: 'row between' },
        h('button', { class: 'btn quiet', 'data-testid': 'tour-spaeter', onclick: () => finish(true) }, 'Später'),
        h('button', { class: 'btn primary', 'data-testid': 'tour-starten', onclick: () => { clear(layer); active = true; show(0); } }, 'Tour starten'))));
  }

  return {
    start({ angebot = false } = {}) { if (angebot && active) return; if (active) finish(); if (angebot) { active = false; offer(); } else { active = true; show(0); } },
    isActive: () => active,
  };
}
