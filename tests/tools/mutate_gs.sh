#!/bin/bash
# Mutationspruefung fuer Code.gs: jeder Mutant muss von den Vertragstests gefunden werden
set -u
SRC="${KP_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
rm -rf /tmp/mutgs && mkdir -p /tmp/mutgs
mkdir -p /tmp/mutgs/k && tar -C "$SRC" --exclude=evidence --exclude=node_modules --exclude=__pycache__ --exclude=.pytest_cache -cf - . | tar -C /tmp/mutgs/k -xf -
cd /tmp/mutgs/k
cp backend/Code.gs /tmp/mutgs/Code.orig
run() { node --test --test-reporter=tap "tests/contract/**/*.test.mjs" 2>&1 | grep -E '^# fail' | awk '{print $3}'; }
mut() { # name, python-replace old, new
  cp /tmp/mutgs/Code.orig backend/Code.gs
  python3 - "$2" "$3" <<'PY'
import sys
p='backend/Code.gs'; s=open(p,encoding='utf-8').read(); old,new=sys.argv[1],sys.argv[2]
assert s.count(old)>=1, 'Mutationsstelle nicht gefunden: '+old
s=s.replace(old,new,1); open(p,'w',encoding='utf-8').write(s)
PY
  [ $? -ne 0 ] && { echo "$1: MUTATION NICHT ANWENDBAR"; return; }
  f=$(run); echo "$1: $f fehlgeschlagene Tests $([ "${f:-0}" -gt 0 ] && echo '-> gefunden' || echo '-> NICHT GEFUNDEN')"
}
mut "M01 Token-Pruefung aus" "if (diff !== 0) throw" "if (false) throw"
mut "M02 Datum per toISOString (Tag-Versatz)" "var d = Utilities.formatDate(v, KP.TZ, 'yyyy-MM-dd');" "var d = v.toISOString().slice(0, 10);"
mut "M03 Zeitzone UTC statt Berlin" "TZ: 'Europe/Berlin'," "TZ: 'UTC',"
mut "M04 Text nicht gegen Sheets-Umdeutung geschuetzt" "  if (typeof v !== 'string' || v === '') return v;" "  return v;"
mut "M05 Bewertung: Person im Schluessel ignoriert" "&& r.datum === datum && trim_(r.von) === von" "&& r.datum === datum"
mut "M06 Plan: Upsert haengt immer an" "var existing = rowOfDate[c.datum];" "var existing = null;"
mut "M07 neue Nummer = Anzahl+1 statt Maximum+1" "id = 'G' + (maxNum + 1 < 1000 ? ('000' + (maxNum + 1)).slice(-3) : String(maxNum + 1));" "id = 'G' + ('000' + (tg.records.length + 1)).slice(-3);"
mut "M08 Zutaten beim Ersetzen nicht geloescht" "    deleteRows_(tz.sheet, del);" "    /* nichts */"
mut "M09 Sperre wird nicht freigegeben" "    lock.releaseLock();" "    /* offen */"
mut "M10 Portionen bis 30 erlaubt" "intIn_(r.portionen, 1, 20, f + '.portionen')" "intIn_(r.portionen, 1, 30, f + '.portionen')"
mut "M11 Sterne bis 10 erlaubt" "intIn_(req.sterne, 1, 5, 'sterne')" "intIn_(req.sterne, 1, 10, 'sterne')"
mut "M12 Tag leeren loescht nicht" "if (existing) { delRows.push(existing); geloescht++; }" "if (existing) { geloescht++; }"
mut "M13 Zeilen mit unbekanntem Gericht erlaubt" "if (gid !== '' && !known[gid]) throw" "if (false) throw"
mut "M14 kein Zeilen-Schutz beim Loeschen (aufsteigend loeschen)" "var sorted = nums.slice().sort(function (a, b) { return b - a; });" "var sorted = nums.slice().sort(function (a, b) { return a - b; });"
mut "M15 Name wird nicht normalisiert" "var name = trim_(g.name).replace(/\\s+/g, ' ');" "var name = trim_(g.name);"
mut "M16 status idee nur bei fehlender Menge" "rec.status = zutaten.length ? 'fertig' : 'idee';" "rec.status = 'fertig';"
mut "M17 Fremdspalten werden ueberschrieben" "var out = rowNum ? t.sheet.getRange(rowNum, 1, 1, t.ncols).getValues()[0] : [];" "var out = [];"
mut "M18 leere Zeilen werden mitgeliefert" "    if (empty) continue;" "    /* leer mitnehmen */"
mut "M19 Kopfzeilen nicht getrimmt" "var header = (values[0] || []).map(trim_);" "var header = (values[0] || []).map(String);"
mut "M20 Einstellung legt immer neue Zeile an" "if (trim_(r.schluessel).toLowerCase() === key) row = t.rowNums[k];" "/* nie gefunden */"
mut "M21 Wiederholung mit gleicher Kennung legt ein Doppel an" "if (row) { id = frueher; wdh = true; }" "if (false) { id = frueher; wdh = true; }"
mut "M22 Kennung wird nicht gemerkt" "if (aid !== '') rememberRequest_(aid, id);" "/* nicht gemerkt */"
mut "M23 Zeitzone des Sheets wird nicht gestellt" "ss.setSpreadsheetTimeZone(KP.TZ);" "/* nichts */"
mut "M24 Nummer ab 1000 faellt auf 000 zurueck" "(maxNum + 1 < 1000 ? ('000' + (maxNum + 1)).slice(-3) : String(maxNum + 1))" "('000' + (maxNum + 1)).slice(-3)"
mut "M25 Einstellungsschluessel constructor wird nicht abgewiesen" "Object.prototype.hasOwnProperty.call(KP.SETTINGS, key) ? KP.SETTINGS[key] : null" "KP.SETTINGS[key]"
mut "M26 Wiederholung behaelt status idee trotz Zutaten" "} else if (!row || wdh) {" "} else if (!row) {"
mut "M27 Kennung wird nicht auf Zeichen und Laenge geprueft" "if (aid !== '' && !/^[A-Za-z0-9_-]{1,64}\$/.test(aid)) bad_(" "if (false) bad_("
mut "M28 Wiederholung ersetzt die Zutaten nicht" "if ((!row || wdh) && zutaten === null) zutaten = [];" "if (!row && zutaten === null) zutaten = [];"
mut "M29 typ wird nicht validiert (jeder Text waere gueltig)" "if (s !== 'hauptgericht' && s !== 'beilage') bad_(feld, feld + ' muss \"hauptgericht\" oder \"beilage\" sein (oder leer).');" "/* keine Pruefung */"
mut "M30 beilage_id: Existenz wird nicht geprueft" "if (gid !== '' && bid !== '' && !known[bid]) throw err_('GERICHT_UNBEKANNT', 'Gericht unbekannt: ' + bid, f + '.beilage_id');" "if (false) throw err_('GERICHT_UNBEKANNT', 'Gericht unbekannt: ' + bid, f + '.beilage_id');"
mut "M31 setup() ergaenzt typ/beilage_id nicht mehr automatisch" "var toAdd = ergaenzbar.filter(function (c) { return cols.indexOf(c) >= 0 && head.indexOf(c) < 0; });" "var toAdd = [];"
mut "M32 Lebensmittel fehlt in KP.TABS (Tab wird bei setup() nie angelegt, bei lesen() nie mitgeliefert)" "    Lebensmittel: ['name', 'kcal_je_100g'],
" ""
cd /; rm -rf /tmp/mutgs
