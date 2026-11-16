# Kochplaner

Eine Web-App (PWA) für iPhone und iPad, die aus einer Gerichte-Datenbank in Google Sheets einen Kochplan für sieben Tage und den passenden Einkaufszettel macht. Alles auf Deutsch, Dezimalkomma, Datum TT.MM.JJJJ. Keine KI und kein API-Schlüssel in der App.

## Was die App kann
- **Plan:** Startdatum wählen, genau 7 Tage, ein Gericht pro Tag. „Vorschlag würfeln“ schlägt Gerichte vor (Favoriten und gut bewertete öfter, kürzlich gekochte nicht). Tag antippen, um das Gericht zu ändern oder nur diesen Tag neu zu würfeln. Tage lassen sich fixieren. Portionen pro Tag mit Plus und Minus, die Mengen rechnen mit, die Kalorien pro Portion bleiben gleich.
- **Einkaufszettel:** eine flache, alphabetische Liste. Gleiche Zutaten werden addiert, g/kg und ml/l umgerechnet, Stück auf halbe aufgerundet. Abhaken, Haken bleiben erhalten. Export „In Erinnerungen“ (Kurzbefehl) und „Für Notes kopieren“.
- **Gerichte:** Liste mit Suche und Filtern, Formular mit Schnellerfassung der Zutaten (tippen oder diktieren), Archivieren. Neue Gerichte kommen auch über den Claude-Chat ins Sheet (Screenshot, Text, Diktat).
- **Bewerten:** 1 bis 5 Sterne mit Notiz je gekochtem Tag, Rangliste, Einfluss auf den Vorschlag.
- **Mehrere Geräte:** ein Sheet, eine App-Adresse, einmal Setup-Code pro Gerät. Lesen geht auch offline.
- **Hilfe:** „?“ auf jedem Bildschirm, geführte Tour, Anleitung für neue Gerichte und Einrichtung.

## Los geht es
1. `docs/EINRICHTUNG.md`: Sheet, Apps Script, Hosting, Home-Bildschirm, Setup-Code (10 Schritte).
2. `docs/KURZBEFEHL.md`: Kurzbefehl „Einkauf“ für Apple Erinnerungen.
3. `docs/IMPORT_ANLEITUNG.md`: Prompt, mit dem Claude Gerichte aus Screenshots, Text oder Diktat ins Sheet schreibt.
4. `docs/ABNAHMETEST.md`: Checkliste für den Test auf echten Geräten (etwa 30 Minuten).

## Ordner
| Ordner | Inhalt |
|---|---|
| `app/` | Die fertige App. Reine statische Dateien ohne Build. **Nur diesen Ordner beim Hoster hochladen.** |
| `backend/` | `Code.gs` (Apps-Script-Schnittstelle mit Token) und `mock_server.py` (Test-Gegenstelle) |
| `docs/` | Einrichtung, Kurzbefehl, Import, Abnahmetest, `PROTOCOL.md` (Schnittstelle), `DECISIONS.md` (alle Annahmen mit Begründung), `ZIELDOKUMENT.md` (Anforderungen F01 bis F23) |
| `data/`, `oracle/` | Synthetische Testdaten (nur erfunden, keine echten Daten), drei Testprofile, unabhängiges Rechenorakel |
| `tests/` | Unit-, Vertrags- und E2E-Tests, Werkzeuge, Beispielbilder für den Import |
| `evidence/` | Evidenzbericht `report.html` (öffnen mit Doppelklick). `lauf_3/` = letzter Volllauf mit Videos, Screenshots, Traces und Prüfprotokollen, `lauf_1/` und `lauf_2/` = Prüfprotokolle der beiden Läufe davor, `laeufe.json`, `mutation_app.md`, `runde1_fehler.log` (erster Versuch mit zwei Testfehlern, siehe `docs/REVIEW.md`; danach drei grüne Läufe in Folge) |
| `tools/` | Hilfsskripte (Symbole, Vorlage, Bericht) |
| `kochplaner_vorlage.xlsx` | Leeres Sheet mit den fünf Tabs und Kopfzeilen zum Import in Google Drive |

## Tests wiederholen
Voraussetzungen: Node 22, Python 3.13 mit `pytest`, `playwright`, `openpyxl`, `pillow`, installiertes Google Chrome.

    npm run test:all                    # Testdaten und Orakel, 169 Unit- und 98 Vertragstests (ca. 1 Minute)
    cd tests/e2e && python3 -m pytest   # 137 Browser-Tests (ca. 5 Minuten), Nachweise in evidence/lauf_lokal/
    python3 tests/tools/mutate_app.py   # baut 15 absichtliche Fehler ein, die Tests müssen alle finden
    bash tests/tools/mutate_gs.sh       # dasselbe für Code.gs (28 Fehler)
    python3 tests/tools/volllauf.py 3   # drei komplette Läufe in Folge (ca. 17 Minuten), Nachweise in evidence/lauf_1 bis lauf_3
    python3 tools/make_report.py lauf_3   # Evidenzbericht neu erzeugen
    KP_URL=… KP_TOKEN=… node tests/contract/live.mjs   # nur lesende Prüfung gegen die echte Schnittstelle

Die E2E-Tests starten einen lokalen Mock, der dasselbe Protokoll spricht wie `Code.gs`, und steuern einen echten Chrome mit iPhone- und iPad-Emulation (hoch und quer). Die Uhr ist festgelegt (Europe/Berlin), der Zufall hat einen festen Startwert.

## Grenzen
- **Nicht in der Sandbox beweisbar:** echtes Safari, echtes Google, echte Apple Erinnerungen und Notes, Bilderkennung im Claude-Chat. Dafür gibt es den manuellen Abnahmetest.
- **Meal-Prep (F14, „Kann“)** ist nicht umgesetzt. Das Datenfeld `reicht_fuer_tage` ist im Sheet, im Protokoll und im Backend vorhanden, im Formular und in der Planung noch nicht (D48).
- **Notes:** Apple bietet keine Schnittstelle für Checkboxen von außen. Deshalb Kopie und ein Tap auf „Checkliste“.
- **Sicherheit:** Die Web-App-Adresse ist öffentlich erreichbar, der Zugriff ist durch das Token geschützt. Token und Setup-Code nur an Haushaltsmitglieder weitergeben. Neues Token: `tokenErneuern` im Apps-Script-Editor ausführen.
- **Zwei Personen gleichzeitig:** Wer zuletzt schreibt, gewinnt. Das reicht für einen Haushalt.
- **Formularentwurf:** Ein halb ausgefülltes Gerichtformular bleibt als Entwurf auf dem Gerät und wird beim nächsten Öffnen von „Neu“ zurückgeholt, auch nach Tabwechsel, Hilfe oder App-Neustart (D55). „Verwerfen“ und „Abbrechen“ löschen ihn.
