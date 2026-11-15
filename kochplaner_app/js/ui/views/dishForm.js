// Gericht anlegen und bearbeiten (F11) mit Zutaten-Schnellerfassung (F12)
import { h, icon, clear } from '../dom.js';
import { nameKey, parseAmount } from '../../core/parse.js';
import { numOut } from '../../core/normalize.js';
import { parseIngredients } from '../../core/parser.js';
import { fehlerInfo } from '../../state.js';

const UNITS = ['', 'g', 'kg', 'ml', 'l', 'EL', 'TL', 'Stück', 'Dose', 'Bund', 'Packung', 'Prise'];
const toStr = (n) => (n === null || n === undefined || n === '' ? '' : String(n).replace('.', ','));

export function dishFormView(app, { id, go, reload = () => go('#/gerichte') }) {
  const S = app.state;
  const root = h('div', { class: 'view dish-form' });
  if (!S.setup) { root.append(h('p', { class: 'note' }, 'Bitte zuerst unter Einstellungen den Setup-Code einfügen.')); return { el: root }; }
  const edit = id && id !== 'neu' ? S.norm.gerichte.find((g) => g.id === id) : null;
  if (id && id !== 'neu' && !edit) {
    root.append(h('p', { class: 'note warn', 'data-testid': 'gericht-unbekannt' }, 'Dieses Gericht gibt es nicht (mehr). Vielleicht hilft „Aktualisieren“.'), h('button', { class: 'btn', onclick: () => go('#/gerichte') }, 'Zur Gerichteliste'));
    return { el: root };
  }
  const f = {
    name: edit ? edit.name : '', basis: edit ? String(edit.basis_portionen) : String(S.norm.einstellungen.standard_portionen),
    kcal: edit ? toStr(edit.kcal_pro_portion) : '', tags: edit ? edit.tags.join(', ') : '', schritte: edit ? edit.schritte : '',
    zutaten: edit ? edit.zutaten.map((z) => ({ name: z.name, menge: toStr(z.menge), einheit: z.einheit || '', einkaufen: z.einkaufen, unklar: null })) : [],
    quick: '',
  };
  // Entwurf: wird bei jeder Aenderung gesichert und beim naechsten Oeffnen zurueckgeholt (bis Speichern oder Abbrechen).
  const draftKey = edit ? edit.id : 'neu';
  const initJson = JSON.stringify(f);
  let restored = false;
  // Wiederholungsschluessel fuer ein neues Gericht: bleibt im Entwurf, damit auch nach Neuladen kein Doppel entsteht
  let anfrageId = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const draft = app.getDraft(draftKey);
  if (draft) { const { anfrage, ...rest } = draft; Object.assign(f, rest); if (typeof anfrage === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(anfrage)) anfrageId = anfrage; restored = true; }
  const keepDraft = () => { if (JSON.stringify(f) === initJson) app.clearDraft(); else app.setDraft(draftKey, { ...f, anfrage: anfrageId }); };
  let busy = false;
  const msg = h('div', { 'data-testid': 'form-meldung', role: 'status' });
  const setMsg = (art, text) => { clear(msg); if (text) msg.append(h('p', { class: 'note ' + art, role: art === 'fehler' ? 'alert' : 'status' }, text)); };
  const nameHint = h('p', { class: 'hint warn-text', 'data-testid': 'name-hinweis', hidden: true }, 'Ein Gericht mit diesem Namen gibt es schon. Du kannst trotzdem speichern.');
  const checkName = () => {
    const k = nameKey(f.name);
    nameHint.hidden = !(k && S.norm.gerichte.some((g) => g.id !== (edit && edit.id) && nameKey(g.name) === k));
  };
  const zutatenEl = h('div', { class: 'zutaten', 'data-testid': 'zutaten-liste' });
  const ideaHint = h('p', { class: 'hint', 'data-testid': 'idee-hinweis' });

  function renderZutaten() {
    clear(zutatenEl);
    f.zutaten.forEach((z, i) => {
      zutatenEl.append(h('div', { class: 'zutat' + (z.unklar ? ' unklar' : ''), 'data-testid': `zutat-${i}` },
        h('input', { type: 'text', value: z.name, placeholder: 'Zutat', 'aria-label': `Zutat ${i + 1}: Name`, 'data-testid': `zutat-${i}-name`, oninput: (e) => { z.name = e.target.value; keepDraft(); } }),
        h('div', { class: 'zrow' },
          h('input', { type: 'text', inputmode: 'decimal', value: z.menge, placeholder: 'Menge', 'aria-label': `Zutat ${i + 1}: Menge`, 'data-testid': `zutat-${i}-menge`, oninput: (e) => { z.menge = e.target.value; keepDraft(); } }),
          h('select', { 'aria-label': `Zutat ${i + 1}: Einheit`, 'data-testid': `zutat-${i}-einheit`, onchange: (e) => { z.einheit = e.target.value; keepDraft(); } },
            (UNITS.includes(z.einheit) ? UNITS : [...UNITS, z.einheit]).map((u) => h('option', { value: u, selected: u === z.einheit }, u || '(Einheit)'))),
          h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: z.einkaufen, 'data-testid': `zutat-${i}-einkaufen`, onchange: (e) => { z.einkaufen = e.target.checked; keepDraft(); } }), 'einkaufen'),
          h('button', { class: 'icon-btn', 'aria-label': `Zutat ${i + 1} entfernen`, 'data-testid': `zutat-${i}-entfernen`, onclick: () => { f.zutaten.splice(i, 1); renderZutaten(); keepDraft(); } }, icon('trash', 20))),
        z.unklar ? h('p', { class: 'hint warn-text', 'data-testid': `zutat-${i}-unklar` }, '⚠ ' + z.unklar) : null));
    });
    const n = f.zutaten.filter((z) => z.name.trim()).length;
    ideaHint.textContent = n === 0 ? 'Ohne Zutaten wird das Gericht als Idee gespeichert. Der Vorschlag ignoriert Ideen, bis Zutaten da sind.' : '';
  }

  function quickParse() {
    const parsed = parseIngredients(f.quick);
    if (!parsed.length) { setMsg('warn', 'Bitte erst Zutaten eintippen oder diktieren, eine pro Zeile.'); return null; }
    for (const p of parsed) f.zutaten.push({ name: p.name, menge: toStr(p.menge), einheit: p.einheit || '', einkaufen: true, unklar: p.ok ? null : p.grund });
    const unclear = parsed.filter((p) => !p.ok).length;
    f.quick = ''; quickEl.value = '';
    renderZutaten(); keepDraft();
    setMsg(unclear ? 'warn' : 'ok', `${parsed.length} ${parsed.length === 1 ? 'Zutat' : 'Zutaten'} erkannt${unclear ? `, ${unclear} unklar (mit ⚠ markiert, bitte prüfen)` : ''}.`);
    return { n: parsed.length, unclear };
  }

  function validate() {
    const errs = [];
    const name = f.name.trim().replace(/\s+/g, ' ');
    if (!name) errs.push('Bitte einen Namen eingeben.');
    const basis = Number(String(f.basis).replace(',', '.'));
    if (!Number.isInteger(basis) || basis < 1 || basis > 99) errs.push('Basisportionen: bitte eine ganze Zahl von 1 bis 99.');
    let kcal = '';
    if (String(f.kcal).trim() !== '') {
      kcal = Number(String(f.kcal).trim().replace(',', '.'));
      if (!(kcal > 0 && kcal <= 5000)) errs.push('kcal pro Portion: leer lassen oder eine Zahl über 0 (höchstens 5000) eingeben.');
    }
    const zut = [];
    f.zutaten.forEach((z, i) => {
      const n = z.name.trim().replace(/\s+/g, ' ');
      const m = String(z.menge).trim();
      if (!n && !m && !z.einheit) return; // leere Zeile
      if (!n) { errs.push(`Zutat ${i + 1}: Der Name fehlt.`); return; }
      let menge = '';
      if (m !== '') {
        const fr = parseAmount(m);
        if (fr === null || fr.lt(parseAmount('0'))) errs.push(`Zutat ${i + 1} (${n}): „${m}“ ist keine gültige Menge.`);
        else menge = numOut(fr);
      }
      zut.push({ name: n, menge, einheit: z.einheit, einkaufen: z.einkaufen ? 'ja' : 'nein' });
    });
    return { errs, name, basis, kcal, zut };
  }

  async function save() {
    if (busy) return;
    // Text im Schnellfeld nicht verlieren: erst erkennen lassen. Sind Zeilen unklar, zuerst pruefen lassen.
    if (f.quick.trim()) {
      const q = quickParse();
      if (q && q.unclear) { setMsg('warn', `${q.n} ${q.n === 1 ? 'Zutat' : 'Zutaten'} aus dem Schnellfeld übernommen, ${q.unclear} davon unklar (mit ⚠ markiert). Bitte prüfen und dann nochmal „Speichern“ tippen.`); return; }
    }
    const v = validate();
    if (v.errs.length) { setMsg('fehler', v.errs.join(' ')); return; }
    busy = true; saveBtn.disabled = true; saveBtn.textContent = 'Speichert …'; setMsg('', '');
    const gericht = { name: v.name, basis_portionen: v.basis, tags: f.tags.trim(), schritte: f.schritte };
    if (edit) { gericht.id = edit.id; gericht.kcal_pro_portion = v.kcal; gericht.status = v.zut.length ? 'fertig' : 'idee'; }
    else { if (v.kcal !== '') gericht.kcal_pro_portion = v.kcal; gericht.angelegt_am = app.today(); }
    try {
      const r = await app.saveDish(gericht, edit || v.zut.length ? v.zut : undefined, edit ? undefined : anfrageId);
      const dupe = (r.warnungen || []).some((w) => w.code === 'NAME_EXISTIERT');
      app.clearDraft();
      app.toast(`${edit ? 'Änderungen gespeichert' : 'Gericht angelegt'}: ${v.name}${dupe ? ' (Hinweis: Name gibt es schon)' : ''}.`, 'ok');
      go('#/gerichte');
    } catch (e) {
      const info = fehlerInfo(e);
      setMsg('fehler', `Nicht gespeichert: ${info.meldung} Deine Eingaben sind noch da. Tippe auf „Speichern“, um es nochmal zu versuchen.`);
      busy = false; saveBtn.disabled = false; saveBtn.textContent = 'Speichern';
    }
  }

  const quickEl = h('textarea', { rows: 4, placeholder: '200 g Mehl\n1,5 l Milch\n½ TL Salz\n2 Eier\n1 Dose Tomaten\nPrise Salz', 'aria-label': 'Zutaten schnell eingeben', 'data-testid': 'zutaten-schnell', autocapitalize: 'sentences', oninput: (e) => { f.quick = e.target.value; keepDraft(); } });
  const saveBtn = h('button', { class: 'btn primary big', 'data-testid': 'btn-gericht-speichern', onclick: save }, 'Speichern');
  const field = (label, input, hint) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);

  root.append(
    h('h2', { class: 'form-title' }, edit ? 'Gericht bearbeiten' : 'Neues Gericht'),
    field('Name *', h('input', { type: 'text', value: f.name, placeholder: 'z. B. Kürbissuppe', maxlength: 120, 'data-testid': 'gericht-name', autocapitalize: 'sentences', oninput: (e) => { f.name = e.target.value; checkName(); keepDraft(); } })),
    nameHint,
    h('div', { class: 'two' },
      field('Basisportionen', h('input', { type: 'text', inputmode: 'numeric', value: f.basis, 'data-testid': 'gericht-basis', oninput: (e) => { f.basis = e.target.value; keepDraft(); } }), 'Für diese Portionen gelten die Mengen.'),
      field('kcal pro Portion', h('input', { type: 'text', inputmode: 'decimal', value: f.kcal, placeholder: 'optional', 'data-testid': 'gericht-kcal', oninput: (e) => { f.kcal = e.target.value; keepDraft(); } }), 'Leer = „kcal fehlt“.')),
    field('Tags', h('input', { type: 'text', value: f.tags, placeholder: 'Suppe, vegetarisch', 'data-testid': 'gericht-tags', oninput: (e) => { f.tags = e.target.value; keepDraft(); } }), 'Mit Komma trennen. Nur für die Suche.'),
    h('section', { class: 'card inner' },
      h('h3', {}, 'Zutaten'),
      field('Schnell eingeben (eine Zutat pro Zeile, Diktat geht auch)', quickEl),
      h('div', { class: 'row' }, h('button', { class: 'btn', 'data-testid': 'btn-zutaten-erkennen', onclick: quickParse }, 'Zutaten erkennen'),
        h('button', { class: 'btn quiet', 'data-testid': 'btn-zutat-neu', onclick: () => { f.zutaten.push({ name: '', menge: '', einheit: '', einkaufen: true, unklar: null }); renderZutaten(); keepDraft(); } }, icon('plus', 18), 'Zeile hinzufügen')),
      zutatenEl, ideaHint),
    field('Zubereitung (optional)', h('textarea', { rows: 5, value: f.schritte, 'data-testid': 'gericht-schritte', oninput: (e) => { f.schritte = e.target.value; keepDraft(); } })),
    msg,
    h('div', { class: 'stack' }, saveBtn,
      h('button', { class: 'btn quiet', 'data-testid': 'btn-abbrechen', onclick: () => { app.clearDraft(); go('#/gerichte'); } }, 'Abbrechen'),
      edit ? h('button', { class: 'btn danger', 'data-testid': 'btn-archivieren', onclick: async () => { const ok = await app.setDishFlag(edit.id, 'aktiv', !edit.aktiv); if (ok) { app.toast(edit.aktiv ? 'Gericht archiviert.' : 'Gericht wieder aktiv.', 'ok'); go('#/gerichte'); } } }, icon('archive', 18), edit.aktiv ? 'Archivieren' : 'Wieder aktivieren') : null));
  quickEl.value = f.quick;
  renderZutaten(); checkName();
  if (restored) {
    msg.before(h('div', { class: 'note warn row between', 'data-testid': 'entwurf-hinweis' },
      h('span', {}, 'Dein nicht gespeicherter Entwurf wurde wiederhergestellt.'),
      h('button', { class: 'btn quiet', 'data-testid': 'btn-entwurf-verwerfen', onclick: () => { app.clearDraft(); reload(); } }, 'Verwerfen')));
  }
  return { el: root };
}
