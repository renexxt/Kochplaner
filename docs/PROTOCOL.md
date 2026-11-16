# Schnittstellenprotokoll App ⇄ Google Sheet

Die App spricht nie direkt mit Google Sheets, sondern mit einer kleinen Web-App (`backend/Code.gs`, Google Apps Script).
Für Tests gibt es einen Mock-Server (`backend/mock_server.py`), der dasselbe Protokoll gegen eine xlsx-Datei spricht.
Beide Seiten sind unabhängig geschrieben, `tests/contract/` prüft sie mit denselben Fällen.

## Transport

- Alles geht als **POST** an dieselbe URL (`…/exec`), Body = JSON, `Content-Type: text/plain;charset=utf-8`
  (kein `application/json`, sonst schickt der Browser eine Vorabfrage, die Apps Script nicht beantwortet).
- Zusätzlich `GET …/exec?token=…&action=ping|lesen` (zum Ausprobieren im Browser, schreibt nie).
- Anfrage: `{ "token": "…", "aktion": "…", …Parameter }`
- Antwort immer HTTP 200 mit JSON. Erfolg: `{ "ok": true, … }`. Fehler: `{ "ok": false, "fehler": { "code", "meldung", "feld"? } }`
  (`meldung` ist deutsch und für Nutzer lesbar).
- Der Client (`app/js/adapters/api.js`) ergänzt die Fehler `NETZWERK`, `ZEITUEBERSCHREITUNG` (Standard 20 s), `HTTP_FEHLER`, `ANTWORT_UNGUELTIG`.
  Lesen wird bei vorübergehenden Fehlern einmal wiederholt, Schreiben nie automatisch.

## Aktionen

| aktion | Parameter | Antwort |
|---|---|---|
| `ping` | – | `{version, zeit}` |
| `lesen` | – | `{version, stand, daten: {Gerichte, Zutaten, Plan, Bewertungen, Einstellungen}}`, je Tab eine Liste von Zeilen als Objekte (Spaltenname → Wert) |
| `plan_speichern` | `zeilen: [{datum, gericht_id, portionen, fixiert, woche_start?, geaendert_am?}]` (1 bis 62) | `{geschrieben, geloescht}` |
| `bewertung_speichern` | `gericht_id, datum, sterne (1–5), notiz?, von?` | `{ueberschrieben}` |
| `gericht_speichern` | `gericht: {id?, name, basis_portionen?, kcal_pro_portion?, tags?, favorit?, nie_wieder?, aktiv?, reicht_fuer_tage?, schritte?, quelle?, status?}`, `zutaten?: [{name, menge, einheit, einkaufen}]`, `anfrage_id?` (1–64 Zeichen aus Buchstaben, Ziffern, `_`, `-`) | `{id, neu, warnungen: [{code:"NAME_EXISTIERT", id}], wiederholt?}` |
| `einstellung_speichern` | `schluessel` (`standard_portionen` 1–20, `wiederholungssperre_tage` 1–60), `wert` | `{}` |

## Regeln beim Lesen

- Leere Zelle → `""`. Zahlen bleiben Zahlen, Text bleibt Text (auch `"1,5"`), Wahrheitswerte bleiben Wahrheitswerte.
- **Datumszellen** kommen immer als `"JJJJ-MM-TT"`, mit Uhrzeit als `"JJJJ-MM-TTTHH:MM:SS"`, in der Zeitzone Europe/Berlin
  (nie über `toISOString`, das verschiebt Tage).
- Ganz leere Zeilen werden ausgelassen, Spaltenüberschriften werden von Leerzeichen befreit, zusätzliche Spalten des Nutzers kommen mit.
- Das Lesen verlangt nur, dass der Tab da ist (sonst `TAB_FEHLT`). Schreiben verlangt alle Spalten (sonst `SPALTE_FEHLT`).

## Regeln beim Schreiben

- Schreiben ist **Upsert** und ändert nur die genannten Felder. Zellen in Spalten, die die App nicht kennt, behalten ihren Wert. Formeln in eigenen Spalten werden beim Schreiben der Zeile aber zu Werten (Zeile wird als Ganzes zurückgeschrieben): keine eigenen Formeln in den fünf Tabs.
- `plan_speichern`: Schlüssel = `datum` (je Tag höchstens eine Zeile). Leeres `gericht_id` löscht die Zeile dieses Tages.
  `gericht_id` muss existieren (`GERICHT_UNBEKANNT`). `woche_start` ist standardmäßig das Datum, `geaendert_am` die Serverzeit.
- `bewertung_speichern`: Schlüssel = (`gericht_id`, `datum`, `von`). Gleicher Schlüssel überschreibt (`ueberschrieben: true`).
- `gericht_speichern` ohne `id` legt ein neues Gericht an: Nummer = größte vorhandene `G###` + 1, `angelegt_am` = heute,
  `status` = `idee` ohne Zutaten, sonst `fertig`; Standardwerte: 2 Portionen, `favorit` nein, `nie_wieder` nein, `aktiv` ja,
  `reicht_fuer_tage` 1, `quelle` „App“. Mit `id` wird das Gericht geändert; wenn `zutaten` mitgeschickt wird, ersetzt es alle Zutaten
  dieses Gerichts (Positionen 1…n), sonst bleiben sie. Gerichts-Nummern haben mindestens drei Stellen (`G001`), ab 1000 vier (`G1000`).
- **Wiederholungsschlüssel:** `gericht_speichern` ohne `id` mit `anfrage_id`: Kennt die Schnittstelle die Kennung schon (Script-Property `ANFRAGEN`, die letzten 30)
  und das Gericht dazu gibt es noch, wird dieses Gericht geändert (Name, Felder, Zutaten, Status nach den Zutaten) und die Antwort enthält `neu: false, wiederholt: true`.
  So legt ein zweiter Versuch nach verlorener Antwort kein Doppel an. Mit `id` wird `anfrage_id` ignoriert.
- `setup()` stellt die Zeitzone des Sheets auf Europe/Berlin (Datumszellen sind Mitternacht in der Zeitzone des Sheets).
- Text wird so gespeichert, wie er ankommt: `"=1+1"`, `"5"` oder `"2026-11-20"` in einem Textfeld bleiben Text.
- Mengen: `""` oder Zahl 0 bis 100000 (Komma-Text wie `"1,5"` wird akzeptiert). `kcal_pro_portion`: `""` oder Zahl über 0 bis 5000.

## Fehlercodes

`TOKEN_FEHLT`, `TOKEN_FALSCH`, `NICHT_EINGERICHTET`, `AKTION_UNBEKANNT`, `NUR_POST`, `ANFRAGE_UNGUELTIG`,
`EINGABE_UNGUELTIG` (mit `feld`), `GERICHT_UNBEKANNT`, `TAB_FEHLT`, `SPALTE_FEHLT`, `BESCHAEFTIGT` (Sheet gerade belegt, Wiederholung sinnvoll), `INTERN`.

## Sicherheit

Wer URL und Token kennt, kann lesen und schreiben. Das Token steht nur im Setup-Code und in den Script-Eigenschaften, nicht im Sheet.
`tokenErneuern()` im Apps-Script-Editor macht das alte Token ungültig. Die Zugriffe laufen über das Konto des Sheet-Besitzers.

## Mock-Steuerung (nur Tests)

`POST /__mock/fehler {"modus": "http500|timeout|kaputt|token|beschaeftigt|latenz|verloren", "anzahl": N, "ms": …}` (`verloren`: die Anfrage wird ausgeführt, die Antwort kommt nie an), `POST /__mock/reset`,
`GET /__mock/dump`, `GET /__mock/log`. Der Mock liefert außerdem den Ordner `app/` aus (damit App und Schnittstelle vom selben Host kommen).
