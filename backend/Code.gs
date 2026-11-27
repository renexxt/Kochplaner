/**
 * Kochplaner – Datenschnittstelle (Google Apps Script, als Web-App bereitgestellt)
 *
 * Die App liest und schreibt das Google Sheet nur über diese Schnittstelle. Protokoll: docs/PROTOCOL.md
 * Einrichtung: Sheet öffnen > Erweiterungen > Apps Script > diesen Code einfügen > Funktion setup() ausführen
 * (legt die Tabs an und gibt das Token aus) > Bereitstellen > Neue Bereitstellung > Web-App
 * (Ausführen als: Ich, Zugriff: Jeder). URL und Token ergeben den Setup-Code für die App.
 *
 * Läuft im Apps-Script-Runtime V8. Keine Abhängigkeit von Node oder Browser.
 */

var KP = {
  VERSION: 1,
  TZ: 'Europe/Berlin',
  LOCK_MS: 15000,
  DATUMSSPALTEN: ['woche_start', 'datum', 'angelegt_am', 'geaendert_am'],
  TABS: {
    Gerichte: ['id', 'name', 'basis_portionen', 'kcal_pro_portion', 'tags', 'favorit', 'nie_wieder', 'aktiv',
      'reicht_fuer_tage', 'schritte', 'quelle', 'angelegt_am', 'status'],
    Zutaten: ['gericht_id', 'pos', 'name', 'menge', 'einheit', 'einkaufen'],
    Plan: ['woche_start', 'datum', 'gericht_id', 'portionen', 'fixiert', 'geaendert_am'],
    Bewertungen: ['gericht_id', 'datum', 'sterne', 'notiz', 'von'],
    Einstellungen: ['schluessel', 'wert'],
    // Ausgaben (F24): eigenstaendig, nicht an einen bestimmten Einkaufszettel oder Plan gebunden. setup() legt den Tab
    // ueber denselben generischen Lauf wie die anderen fuenf an. lesen_() liest ihn bewusst NICHT mit (KP.LESEN_TABS),
    // dafuer gibt es die eigenen Aktionen ausgabe_speichern/ausgaben_lesen.
    Ausgaben: ['datum', 'betrag', 'beschreibung', 'angelegt_am']
  },
  SETTINGS: {
    standard_portionen: { min: 1, max: 20, standard: 2 },
    wiederholungssperre_tage: { min: 1, max: 60, standard: 21 }
  }
};
// Tabs, die die allgemeine Aktion "lesen" zurueckgibt. Bewusst getrennt von KP.TABS (das zusaetzlich fuer setup()
// und die Spaltenpruefung aller Tabs gilt), damit "lesen" weiterhin genau diese fuenf liefert. Als eigene Zeile
// nach KP definiert (nicht als Eintrag in KP.TABS), damit tools/make_vorlage.py die Tab-Liste weiterhin sauber
// allein aus "TABS: { ... }" lesen kann.
KP.LESEN_TABS = ['Gerichte', 'Zutaten', 'Plan', 'Bewertungen', 'Einstellungen'];

/* ------------------------------------------------------------------ Einstiegspunkte */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    checkToken_(p.token);
    var action = String(p.action || 'ping');
    if (action !== 'ping' && action !== 'lesen') throw err_('NUR_POST', 'Diese Aktion geht nur per POST.');
    return json_(dispatch_(action, {}));
  } catch (ex) {
    return json_(fail_(ex));
  }
}

function doPost(e) {
  try {
    var body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '');
    } catch (x) {
      throw err_('ANFRAGE_UNGUELTIG', 'Die Anfrage ist kein gültiges JSON.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw err_('ANFRAGE_UNGUELTIG', 'Die Anfrage muss ein Objekt sein.');
    checkToken_(body.token);
    return json_(dispatch_(String(body.aktion || ''), body));
  } catch (ex) {
    return json_(fail_(ex));
  }
}

function dispatch_(aktion, req) {
  switch (aktion) {
    case 'ping': return { ok: true, version: KP.VERSION, zeit: nowIso_() };
    case 'lesen': return lesen_();
    case 'plan_speichern': return locked_(function () { return planSpeichern_(req); });
    case 'bewertung_speichern': return locked_(function () { return bewertungSpeichern_(req); });
    case 'gericht_speichern': return locked_(function () { return gerichtSpeichern_(req); });
    case 'einstellung_speichern': return locked_(function () { return einstellungSpeichern_(req); });
    case 'ausgabe_speichern': return locked_(function () { return ausgabeSpeichern_(req); });
    case 'ausgaben_lesen': return ausgabenLesen_();
    default: throw err_('AKTION_UNBEKANNT', 'Unbekannte Aktion: ' + aktion);
  }
}

/* ------------------------------------------------------------------ Einrichtung (im Editor ausführen) */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = [];
  // Datumszellen sind Mitternacht in der Zeitzone des Sheets; die Schnittstelle liest und schreibt in KP.TZ. Beides muss gleich sein.
  if (ss.getSpreadsheetTimeZone() !== KP.TZ) {
    ss.setSpreadsheetTimeZone(KP.TZ);
    log.push('Zeitzone des Sheets auf ' + KP.TZ + ' gestellt');
  }
  Object.keys(KP.TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    var cols = KP.TABS[name];
    if (!sheet) {
      sheet = ss.insertSheet(name);
      log.push('Tab angelegt: ' + name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
      sheet.setFrozenRows(1);
      log.push('Kopfzeile geschrieben: ' + name);
    } else {
      var head = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(trim_);
      var missing = cols.filter(function (c) { return head.indexOf(c) < 0; });
      log.push(missing.length ? 'ACHTUNG ' + name + ': Spalten fehlen: ' + missing.join(', ') : 'Tab vorhanden und vollständig: ' + name);
    }
  });
  var settings = ss.getSheetByName('Einstellungen');
  if (settings.getLastRow() === 1) {
    settings.getRange(2, 1, 2, 2).setValues([['standard_portionen', 2], ['wiederholungssperre_tage', 21]]);
    log.push('Standardwerte in Einstellungen eingetragen');
  }
  ['Tabelle1', 'Sheet1'].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(s);
      log.push('Leeres Standard-Tab entfernt: ' + n);
    }
  });
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if (!token) {
    token = newToken_();
    props.setProperty('TOKEN', token);
    log.push('Neues Token erzeugt');
  }
  log.push('TOKEN: ' + token);
  var out = log.join('\n');
  Logger.log(out);
  return out;
}

/** Neues Token erzeugen (macht das alte ungültig). Danach den Setup-Code auf allen Geräten ersetzen. */
function tokenErneuern() {
  var token = newToken_();
  PropertiesService.getScriptProperties().setProperty('TOKEN', token);
  Logger.log('TOKEN: ' + token);
  return token;
}

/* ------------------------------------------------------------------ Aktionen */

function lesen_() {
  var ss = openSheet_();
  var daten = {};
  KP.LESEN_TABS.forEach(function (name) {
    var t = openTable_(ss, name, false);
    daten[name] = t.records;
  });
  return { ok: true, version: KP.VERSION, stand: nowIso_(), daten: daten };
}

/** Ausgaben (F24): eigene Liste, unabhaengig von "lesen". Tolerant wie die anderen Lese-Aktionen (nur Tab muss da sein). */
function ausgabenLesen_() {
  var t = openTable_(openSheet_(), 'Ausgaben', false);
  return { ok: true, ausgaben: t.records };
}

/** Ausgabe anlegen (F24): immer eine neue Zeile, kein Upsert (zwei Ausgaben am selben Tag sind zwei Eintraege).
 *  angelegt_am setzt die Schnittstelle immer selbst (Serverzeit); ein mitgeschickter Wert wird ignoriert. */
function ausgabeSpeichern_(req) {
  var datum = dateStr_(req.datum, 'datum');
  var betrag = betragIn_(req.betrag, 'betrag');
  var beschreibung = textIn_(req.beschreibung, 200, 'beschreibung').trim();
  if (!beschreibung) bad_('beschreibung', 'Die Beschreibung fehlt.');
  var t = openTable_(openSheet_(), 'Ausgaben', true);
  var rec = { datum: datum, betrag: betrag, beschreibung: beschreibung, angelegt_am: nowIso_() };
  appendRows_(t, [mergeRow_(t, null, rec)]);
  return { ok: true };
}

function planSpeichern_(req) {
  var rows = req.zeilen;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 62) bad_('zeilen', 'zeilen muss eine Liste mit 1 bis 62 Einträgen sein.');
  var ss = openSheet_();
  var gerichte = openTable_(ss, 'Gerichte', true);
  var known = {};
  gerichte.records.forEach(function (r) { known[String(r.id)] = true; });
  var seen = {};
  var clean = rows.map(function (r, i) {
    var f = 'zeilen[' + i + ']';
    if (!r || typeof r !== 'object') bad_(f, 'Eintrag fehlt.');
    var datum = dateStr_(r.datum, f + '.datum');
    if (seen[datum]) bad_(f + '.datum', 'Datum kommt doppelt vor: ' + datum);
    seen[datum] = true;
    var gid = r.gericht_id == null ? '' : trim_(r.gericht_id);
    if (gid !== '' && !known[gid]) throw err_('GERICHT_UNBEKANNT', 'Gericht unbekannt: ' + gid, f + '.gericht_id');
    return {
      woche_start: dateStr_(r.woche_start || datum, f + '.woche_start'),
      datum: datum,
      gericht_id: gid,
      portionen: gid === '' ? '' : intIn_(r.portionen, 1, 20, f + '.portionen'),
      fixiert: yesNo_(r.fixiert, f + '.fixiert', 'nein'),
      geaendert_am: stampStr_(r.geaendert_am, f + '.geaendert_am')
    };
  });
  var t = openTable_(ss, 'Plan', true);
  var rowOfDate = {};
  t.rowNums.forEach(function (n, k) { rowOfDate[t.records[k].datum] = n; });
  var appendRows = [], geschrieben = 0, geloescht = 0, delRows = [];
  clean.forEach(function (c) {
    var existing = rowOfDate[c.datum];
    if (c.gericht_id === '') {
      if (existing) { delRows.push(existing); geloescht++; }
      return;
    }
    if (existing) {
      t.sheet.getRange(existing, 1, 1, t.ncols).setValues([mergeRow_(t, existing, c)]);
    } else {
      appendRows.push(mergeRow_(t, null, c));
    }
    geschrieben++;
  });
  appendRows_(t, appendRows);
  deleteRows_(t.sheet, delRows);
  return { ok: true, geschrieben: geschrieben, geloescht: geloescht };
}

function bewertungSpeichern_(req) {
  var ss = openSheet_();
  var gid = trim_(req.gericht_id);
  var known = false;
  openTable_(ss, 'Gerichte', true).records.forEach(function (r) { if (String(r.id) === gid) known = true; });
  if (!known) throw err_('GERICHT_UNBEKANNT', 'Gericht unbekannt: ' + gid, 'gericht_id');
  var datum = dateStr_(req.datum, 'datum');
  var sterne = intIn_(req.sterne, 1, 5, 'sterne');
  var notiz = textIn_(req.notiz, 2000, 'notiz');
  var von = textIn_(req.von, 60, 'von').trim();
  var t = openTable_(ss, 'Bewertungen', true);
  var row = null;
  t.records.forEach(function (r, k) {
    if (String(r.gericht_id) === gid && r.datum === datum && trim_(r.von) === von) row = t.rowNums[k];
  });
  var rec = { gericht_id: gid, datum: datum, sterne: sterne, notiz: notiz, von: von };
  if (row) t.sheet.getRange(row, 1, 1, t.ncols).setValues([mergeRow_(t, row, rec)]);
  else appendRows_(t, [mergeRow_(t, null, rec)]);
  return { ok: true, ueberschrieben: !!row };
}

function gerichtSpeichern_(req) {
  var g = req.gericht;
  if (!g || typeof g !== 'object') bad_('gericht', 'gericht fehlt.');
  var ss = openSheet_();
  var tg = openTable_(ss, 'Gerichte', true);
  var id = g.id == null || g.id === '' ? '' : trim_(g.id);
  var row = null;
  // anfrage_id: Wiederholungsschluessel fuer neue Gerichte. Kam die Antwort der ersten Anfrage nicht an und die App
  // schickt dieselbe Kennung nochmal, wird das schon angelegte Gericht aktualisiert statt ein zweites anzulegen.
  var aid = req.anfrage_id == null ? '' : trim_(req.anfrage_id);
  if (aid !== '' && !/^[A-Za-z0-9_-]{1,64}$/.test(aid)) bad_('anfrage_id', 'anfrage_id: nur Buchstaben, Ziffern, _ und -, höchstens 64 Zeichen.');
  var wdh = false;
  if (id !== '') {
    tg.records.forEach(function (r, k) { if (String(r.id) === id) row = tg.rowNums[k]; });
    if (!row) throw err_('GERICHT_UNBEKANNT', 'Gericht unbekannt: ' + id, 'gericht.id');
  } else if (aid !== '') {
    var frueher = recallRequest_(aid);
    if (frueher) tg.records.forEach(function (r, k) { if (String(r.id) === frueher) row = tg.rowNums[k]; });
    if (row) { id = frueher; wdh = true; }
  }
  var has = function (k) { return Object.prototype.hasOwnProperty.call(g, k); };
  var rec = {};
  if (!row || has('name')) {
    var name = trim_(g.name).replace(/\s+/g, ' ');
    if (!name) bad_('gericht.name', 'Der Name fehlt.');
    if (name.length > 120) bad_('gericht.name', 'Der Name ist zu lang (höchstens 120 Zeichen).');
    rec.name = name;
  }
  if (has('basis_portionen') || !row) rec.basis_portionen = has('basis_portionen') ? intIn_(g.basis_portionen, 1, 99, 'gericht.basis_portionen') : 2;
  if (has('kcal_pro_portion')) rec.kcal_pro_portion = kcalIn_(g.kcal_pro_portion, 'gericht.kcal_pro_portion');
  if (has('tags')) rec.tags = textIn_(g.tags, 200, 'gericht.tags');
  ['favorit', 'nie_wieder', 'aktiv'].forEach(function (k) {
    if (has(k)) rec[k] = yesNo_(g[k], 'gericht.' + k, k === 'aktiv' ? 'ja' : 'nein');
    else if (!row) rec[k] = k === 'aktiv' ? 'ja' : 'nein';
  });
  if (has('reicht_fuer_tage') || !row) rec.reicht_fuer_tage = has('reicht_fuer_tage') ? intIn_(g.reicht_fuer_tage, 1, 7, 'gericht.reicht_fuer_tage') : 1;
  if (has('schritte')) rec.schritte = textIn_(g.schritte, 20000, 'gericht.schritte');
  if (has('quelle') || !row) rec.quelle = has('quelle') ? textIn_(g.quelle, 500, 'gericht.quelle') : 'App';
  if (!row) rec.angelegt_am = g.angelegt_am ? dateStr_(g.angelegt_am, 'gericht.angelegt_am') : nowIso_().slice(0, 10);

  var zutaten = null;
  if (Object.prototype.hasOwnProperty.call(req, 'zutaten')) {
    if (!Array.isArray(req.zutaten) || req.zutaten.length > 100) bad_('zutaten', 'zutaten muss eine Liste mit höchstens 100 Einträgen sein.');
    zutaten = req.zutaten.map(function (z, i) {
      var f = 'zutaten[' + i + ']';
      if (!z || typeof z !== 'object') bad_(f, 'Eintrag fehlt.');
      var zn = trim_(z.name).replace(/\s+/g, ' ');
      if (!zn) bad_(f + '.name', 'Der Name der Zutat fehlt.');
      if (zn.length > 120) bad_(f + '.name', 'Der Name der Zutat ist zu lang.');
      return { name: zn, menge: mengeIn_(z.menge, f + '.menge'), einheit: textIn_(z.einheit, 20, f + '.einheit').trim(),
        einkaufen: yesNo_(z.einkaufen, f + '.einkaufen', 'ja') };
    });
  }
  if ((!row || wdh) && zutaten === null) zutaten = [];
  if (has('status')) {
    if (g.status !== 'fertig' && g.status !== 'idee') bad_('gericht.status', 'status muss "fertig" oder "idee" sein.');
    rec.status = g.status;
  } else if (!row || wdh) {
    rec.status = zutaten.length ? 'fertig' : 'idee';
  }

  var warnungen = [];
  if (!row) {
    var key = nameKey_(rec.name), maxNum = 0;
    tg.records.forEach(function (r) {
      if (nameKey_(r.name) === key) warnungen.push({ code: 'NAME_EXISTIERT', id: String(r.id) });
      var m = /^G(\d+)$/.exec(String(r.id));
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });
    id = 'G' + (maxNum + 1 < 1000 ? ('000' + (maxNum + 1)).slice(-3) : String(maxNum + 1));
    rec.id = id;
    appendRows_(tg, [mergeRow_(tg, null, rec)]);
    if (aid !== '') rememberRequest_(aid, id);
  } else {
    tg.sheet.getRange(row, 1, 1, tg.ncols).setValues([mergeRow_(tg, row, rec)]);
  }
  if (zutaten !== null) {
    var tz = openTable_(ss, 'Zutaten', true);
    var del = [];
    tz.records.forEach(function (r, k) { if (String(r.gericht_id) === id) del.push(tz.rowNums[k]); });
    deleteRows_(tz.sheet, del);
    tz = openTable_(ss, 'Zutaten', true);
    appendRows_(tz, zutaten.map(function (z, i) {
      return mergeRow_(tz, null, { gericht_id: id, pos: i + 1, name: z.name, menge: z.menge, einheit: z.einheit, einkaufen: z.einkaufen });
    }));
  }
  var res = { ok: true, id: id, neu: !row, warnungen: warnungen };
  if (wdh) res.wiederholt = true;
  return res;
}

/** Die letzten 30 Anfrage-Kennungen neuer Gerichte (Script-Properties, klein genug fuer das 9-KB-Limit je Eintrag). */
function readRequests_() {
  try {
    var l = JSON.parse(PropertiesService.getScriptProperties().getProperty('ANFRAGEN') || '[]');
    return Array.isArray(l) ? l : [];
  } catch (e) { return []; }
}
function recallRequest_(aid) {
  var l = readRequests_();
  for (var i = 0; i < l.length; i++) if (l[i][0] === aid) return String(l[i][1]);
  return '';
}
function rememberRequest_(aid, id) {
  var l = readRequests_().filter(function (p) { return p[0] !== aid; });
  l.push([aid, id]);
  PropertiesService.getScriptProperties().setProperty('ANFRAGEN', JSON.stringify(l.slice(-30)));
}

function einstellungSpeichern_(req) {
  var key = trim_(req.schluessel);
  var def = Object.prototype.hasOwnProperty.call(KP.SETTINGS, key) ? KP.SETTINGS[key] : null;
  if (!def) bad_('schluessel', 'Unbekannte Einstellung: ' + key);
  var val = intIn_(req.wert, def.min, def.max, 'wert');
  var t = openTable_(openSheet_(), 'Einstellungen', true);
  var row = null;
  t.records.forEach(function (r, k) { if (trim_(r.schluessel).toLowerCase() === key) row = t.rowNums[k]; });
  var rec = { schluessel: key, wert: val };
  if (row) t.sheet.getRange(row, 1, 1, t.ncols).setValues([mergeRow_(t, row, rec)]);
  else appendRows_(t, [mergeRow_(t, null, rec)]);
  return { ok: true };
}

/* ------------------------------------------------------------------ Tabellen */

function openSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

/** Liest einen Tab. records = Zeilen als Objekte (leere Zeilen ausgelassen), rowNums = Zeilennummern im Sheet. */
function openTable_(ss, name, needAllColumns) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw err_('TAB_FEHLT', 'Der Tab "' + name + '" fehlt. Bitte setup() im Apps-Script-Editor ausführen.');
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  var values = lastRow > 0 && lastCol > 0 ? sheet.getRange(1, 1, lastRow, lastCol).getValues() : [];
  var header = (values[0] || []).map(trim_);
  var col = {};
  header.forEach(function (h, i) { if (h && !(h in col)) col[h] = i; });
  if (needAllColumns) {
    var missing = KP.TABS[name].filter(function (c) { return !(c in col); });
    if (missing.length) throw err_('SPALTE_FEHLT', 'Im Tab "' + name + '" fehlen Spalten: ' + missing.join(', '));
  }
  var records = [], rowNums = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var empty = true;
    for (var c = 0; c < row.length; c++) if (!(row[c] === '' || row[c] === null || row[c] === undefined)) { empty = false; break; }
    if (empty) continue;
    var rec = {};
    header.forEach(function (h, i) { if (h) rec[h] = cellJson_(row[i]); });
    records.push(rec);
    rowNums.push(r + 1);
  }
  return { sheet: sheet, name: name, header: header, col: col, ncols: header.length, records: records, rowNums: rowNums, lastRow: lastRow };
}

/** Zeile für setValues: vorhandene Zellen bleiben erhalten (auch Spalten, die der Nutzer selbst ergänzt hat). */
function mergeRow_(t, rowNum, rec) {
  var out = rowNum ? t.sheet.getRange(rowNum, 1, 1, t.ncols).getValues()[0] : [];
  for (var i = 0; i < t.ncols; i++) if (out[i] === undefined) out[i] = '';
  Object.keys(rec).forEach(function (k) {
    if (!(k in t.col)) return;
    out[t.col[k]] = cellOut_(rec[k], k);
  });
  return out;
}

function appendRows_(t, rows) {
  if (!rows.length) return;
  var start = Math.max(t.lastRow, 1) + 1;
  t.sheet.getRange(start, 1, rows.length, t.ncols).setValues(rows);
  t.lastRow = start + rows.length - 1;
}

/** Löscht Zeilen (Nummern im Sheet), von unten nach oben, zusammenhängende Blöcke mit einem Aufruf. */
function deleteRows_(sheet, nums) {
  if (!nums.length) return;
  var sorted = nums.slice().sort(function (a, b) { return b - a; });
  var i = 0;
  while (i < sorted.length) {
    var j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] - 1) j++;
    sheet.deleteRows(sorted[j], j - i + 1);
    i = j + 1;
  }
}

/* ------------------------------------------------------------------ Zellwerte */

/** Zelle -> JSON: leer = "", Datum = "JJJJ-MM-TT" bzw. "JJJJ-MM-TTTHH:MM:SS" in Europe/Berlin (nie toISOString: das verschiebt Tage). */
function cellJson_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    var d = Utilities.formatDate(v, KP.TZ, 'yyyy-MM-dd');
    var t = Utilities.formatDate(v, KP.TZ, 'HH:mm:ss');
    return t === '00:00:00' ? d : d + 'T' + t;
  }
  return v;
}

/**
 * JSON -> Zelle. Sheets liest Strings in setValues wie getippt: "5" wird eine Zahl, "2026-11-20" ein Datum,
 * "=1+1" eine Formel. Text bekommt deshalb ein Apostroph (das Sheets nicht mitspeichert), nur die
 * Datumsspalten werden bewusst als Datum geschrieben.
 */
function cellOut_(v, spalte) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string' || v === '') return v;
  if (KP.DATUMSSPALTEN.indexOf(spalte) >= 0) return v;
  if (/^[=+\-@]/.test(v) || /^\s*[-+]?[\d.,]+\s*$/.test(v) || /^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}/.test(v) ||
      /^(true|false)$/i.test(v) || v.charAt(0) === "'") return "'" + v;
  return v;
}

/* ------------------------------------------------------------------ Eingabeprüfung */

function trim_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function bad_(feld, meldung) { throw err_('EINGABE_UNGUELTIG', meldung, feld); }

function intIn_(v, min, max, feld) {
  var n = typeof v === 'number' ? v : (/^\s*\d+\s*$/.test(String(v)) ? parseInt(v, 10) : NaN);
  if (!isFinite(n) || Math.floor(n) !== n || n < min || n > max) bad_(feld, feld + ' muss eine ganze Zahl von ' + min + ' bis ' + max + ' sein.');
  return n;
}

function kcalIn_(v, feld) {
  if (v === '' || v === null || v === undefined) return '';
  var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!isFinite(n) || n <= 0 || n > 5000) bad_(feld, feld + ' muss leer oder eine Zahl über 0 (höchstens 5000) sein.');
  return n;
}

/** Betrag einer Ausgabe (F24): immer Pflicht, anders als kcal/Menge nie leer. */
function betragIn_(v, feld) {
  var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!isFinite(n) || n <= 0 || n > 100000) bad_(feld, feld + ' muss eine Zahl größer als 0 (höchstens 100000) sein.');
  return n;
}

function mengeIn_(v, feld) {
  if (v === '' || v === null || v === undefined) return '';
  var n = typeof v === 'number' ? v : (/^\s*\d+([.,]\d+)?\s*$/.test(String(v)) ? Number(String(v).replace(',', '.')) : NaN);
  if (!isFinite(n) || n < 0 || n > 100000) bad_(feld, feld + ' muss leer oder eine Zahl von 0 bis 100000 sein.');
  return n;
}

function textIn_(v, max, feld) {
  var s = v === null || v === undefined ? '' : String(v);
  if (s.length > max) bad_(feld, feld + ' ist zu lang (höchstens ' + max + ' Zeichen).');
  return s;
}

function yesNo_(v, feld, standard) {
  if (v === undefined || v === null || v === '') return standard;
  if (v === true || v === 'ja') return 'ja';
  if (v === false || v === 'nein') return 'nein';
  return bad_(feld, feld + ' muss "ja" oder "nein" sein.');
}

function dateStr_(v, feld) {
  var s = trim_(v);
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]) return s;
  }
  return bad_(feld, feld + ' muss ein gültiges Datum im Format JJJJ-MM-TT sein.');
}

function stampStr_(v, feld) {
  if (v === undefined || v === null || v === '') return nowIso_();
  var s = trim_(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return bad_(feld, feld + ' muss JJJJ-MM-TTTHH:MM:SS sein.');
}

function nameKey_(s) { return trim_(s).replace(/\s+/g, ' ').toLowerCase(); }

/* ------------------------------------------------------------------ Antworten, Token, Sperre */

function err_(code, meldung, feld) {
  var e = new Error(meldung);
  e.kp = { code: code, meldung: meldung };
  if (feld) e.kp.feld = feld;
  return e;
}

function fail_(ex) {
  if (ex && ex.kp) return { ok: false, fehler: ex.kp };
  return { ok: false, fehler: { code: 'INTERN', meldung: 'Unerwarteter Fehler: ' + (ex && ex.message ? ex.message : String(ex)) } };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function nowIso_() { return Utilities.formatDate(new Date(), KP.TZ, "yyyy-MM-dd'T'HH:mm:ss"); }

function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }

function checkToken_(given) {
  var expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!expected) throw err_('NICHT_EINGERICHTET', 'Die Schnittstelle ist noch nicht eingerichtet (setup() ausführen).');
  if (given === undefined || given === null || given === '') throw err_('TOKEN_FEHLT', 'Das Token fehlt.');
  var a = String(given), diff = a.length === expected.length ? 0 : 1;
  for (var i = 0; i < expected.length; i++) diff |= (a.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  if (diff !== 0) throw err_('TOKEN_FALSCH', 'Das Token stimmt nicht.');
}

function locked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(KP.LOCK_MS)) throw err_('BESCHAEFTIGT', 'Das Sheet wird gerade von jemand anderem geschrieben. Bitte gleich nochmal.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
