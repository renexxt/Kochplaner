# Kochplaner – Anleitung für Claude Code

Diese Datei liest Claude Code zu Beginn jeder Sitzung. Sie ist die Übergabe vom Aufbau (Claude im Chat) zur Weiterentwicklung. Sie ersetzt `START_HIER.md`, das den früheren Ablauf über Google Drive beschreibt und für die Arbeit in diesem Repo überholt ist.

## Was das Projekt ist
Kochplaner ist eine PWA für iPhone und iPad. Aus einer Gerichte-Datenbank in einem Google Sheet macht sie einen Kochplan für 7 Tage und einen Einkaufszettel. Alles auf Deutsch (Dezimalkomma, Datum TT.MM.JJJJ). Keine KI und kein API-Schlüssel in der App.
- Frontend: `app/`, statisch, vanilla ES-Module, kein Build. Reine Logik in `app/js/core/`, Oberfläche in `app/js/ui/`, Zustand in `app/js/state.js`, Schnittstellen-Client in `app/js/adapters/api.js`.
- Backend: `backend/Code.gs` (Google Apps Script als Web-App, schützt das Sheet mit einem Token). `backend/mock_server.py` ist die Test-Gegenstelle mit demselben Protokoll (`docs/PROTOCOL.md`).
- Datenbank: ein Google Sheet mit den Tabs Gerichte, Zutaten, Plan, Bewertungen, Einstellungen. Spalten stehen in `KP.TABS` in `backend/Code.gs`.
- Anforderungen: `docs/ZIELDOKUMENT.md` (F01 bis F23). Alle Annahmen mit Begründung: `docs/DECISIONS.md` (zuletzt D64, nächste Nummer D65).

## Stand (16.11.2026)
- Gebaut und getestet ist alles außer F14 (Meal-Prep, „Kann“, D48). Alle Tests grün (siehe Befehle).
- Die App ist live und mit dem echten Sheet verbunden. Hosting: GitHub Pages aus `main`, Adresse `https://renexxt.github.io/Kochplaner/kochplaner_app/` (D63). Die Dateien liegen im Repo im Unterordner `kochplaner_app/`, im Projekt heißt der Ordner `app/`.
- Im echten Sheet stehen 21 Gerichte aus einer Rezeptliste (D61). 20 davon haben einen geschätzten Zutaten-Entwurf (D62), „Grillen“ ist eine Idee.
- **Nur am echten Gerät geprüft:** Setup-Code eingeben, Verbinden, Gerichte laden. Der manuelle Abnahmetest `docs/ABNAHMETEST.md` ist noch nicht durchgespielt.

## Regeln
1. **Test zuerst grün, dann weiterbauen.** Ein Test wird nur geändert, wenn er nachweislich falsch ist. Das kommt mit Begründung in `docs/DECISIONS.md`.
2. **`main` ist live.** GitHub Pages veröffentlicht jeden Stand von `main`. Arbeite auf einem Branch, öffne einen Pull Request, führe erst nach grünen Tests zusammen. Zwei Personen arbeiten parallel am Frontend.
3. **Bei jeder App-Änderung die Version erhöhen**: `APP_VERSION` in `app/js/version.js` und `VERSION` in `app/sw.js` (müssen gleich sein, `tests/unit/sw_files.test.mjs` prüft es). Kommen Dateien hinzu oder fallen weg, die Liste `DATEIEN` in `app/sw.js` anpassen.
4. **Keine Zugangsdaten ins Repo.** Das Repo ist öffentlich. Nie Token, Setup-Code (`KP1.…`), Web-App-URL mit Token, Sheet-ID, E-Mail-Adressen oder Screenshots davon einchecken. Tests nutzen nur synthetische Daten aus `data/`.
5. **Das echte Sheet nur auf ausdrücklichen Auftrag ändern** und nie vorhandene Zeilen überschreiben. Neue Gerichte kommen über die App oder den Claude-Chat (Vorlage in `docs/IMPORT_ANLEITUNG.md`).
6. **Nichts als bestanden melden, was nicht geprüft ist.** Echtes Safari, echtes Google, Apple Erinnerungen/Notizen, Bilderkennung im Chat sind in der Sandbox nicht beweisbar und gehören in den manuellen Abnahmetest.
7. **Sprache:** Antworten und die ganze Oberfläche auf Deutsch, in Alltagssprache. Der Auftraggeber diktiert oft und mag direkte, strukturierte, handlungsorientierte Antworten.
8. Testschalter im Code nur über `window.__kpTest` (D44).

## Befehle
Voraussetzungen: Node 22, Python 3.13 mit `pytest`, `playwright`, `openpyxl`, `pillow`, installiertes Google Chrome.

    npm run test:all                    # Testdaten, Orakel, Unit- und Vertragstests (ca. 1 Minute)
    cd tests/e2e && python3 -m pytest   # Browser-Tests mit iPhone- und iPad-Emulation (ca. 5 Minuten)
    python3 tests/tools/mutate_app.py   # 15 absichtliche App-Fehler, alle müssen gefunden werden
    bash tests/tools/mutate_gs.sh       # 32 absichtliche Fehler in Code.gs
    python3 backend/mock_server.py --xlsx data/kochplaner_test.xlsx --app app --token <mind. 16 Zeichen> --port 0   # App lokal mit Mock

Der Mock gibt `PORT=…` aus. Setup-Code für lokale Tests: `KP1.` plus base64url von `{"u":"http://127.0.0.1:PORT/exec","t":"TOKEN"}`.
`KP_URL=… KP_TOKEN=… node tests/contract/live.mjs` prüft lesend die echte Schnittstelle. Die echten Werte gibt dir der Auftraggeber, sie stehen nicht im Repo.

## Backend ändern
`backend/Code.gs` wird von Hand in den Apps-Script-Editor des Sheets kopiert. Dann dort „Bereitstellen“ > „Bereitstellungen verwalten“ > Stift > „Neue Version“ > „Bereitstellen“. So bleibt die Web-App-URL gleich. Die Einstellungen müssen „Ausführen als: Ich“ und „Zugriff: Jeder“ bleiben (D64). Das kann nur der Besitzer des Sheets tun, nicht Claude Code. Sag ihm, was er einfügen muss. Nach jeder Änderung an `Code.gs`: `tests/contract` und `bash tests/tools/mutate_gs.sh`.

## Offene Aufgaben, nach Wichtigkeit
1. **Setup-Code toleranter machen.** Beim ersten echten Einrichten scheiterte das Feld an `TOKEN: abc…` (so steht es im Apps-Script-Protokoll) und an `…/exec?token=abc…&action=lesen`. Beides sollte `decodeSetup` in `app/js/core/setupcode.js` verstehen und sauber zerlegen. Dazu Unit-Tests in `tests/unit/setupcode.test.mjs`, einen E2E-Test und die Fehlermeldung bzw. den Hilfetext in `app/js/content/help.js` und `settings.js` anpassen. Danach Version erhöhen.
2. **Verzeichnis für GitHub Pages festlegen.** Im Repo liegt die App bisher in `kochplaner_app/`, die Quelle ist `app/`. Entweder `kochplaner_app/` bei jeder Änderung mit dem Inhalt von `app/` überschreiben, oder `app/` per Workflow veröffentlichen. Der Workflow ändert die Adresse auf `https://renexxt.github.io/Kochplaner/`, und beide Geräte müssen die App neu zum Home-Bildschirm hinzufügen. Datei `.github/workflows/pages.yml`, dazu in Settings > Pages die Quelle auf „GitHub Actions“ stellen:

        name: Pages
        on: { push: { branches: [main] }, workflow_dispatch: {} }
        permissions: { contents: read, pages: write, id-token: write }
        concurrency: { group: pages, cancel-in-progress: true }
        jobs:
          deploy:
            environment: { name: github-pages, url: "${{ steps.d.outputs.page_url }}" }
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v4
              - uses: actions/upload-pages-artifact@v3
                with: { path: app }
              - id: d
                uses: actions/deploy-pages@v4

3. **Manuellen Abnahmetest durchspielen** (`docs/ABNAHMETEST.md`, ca. 30 Minuten, auf dem echten iPhone). Gefundene Fehler in Tests nachbilden, dann beheben.
4. **Zutaten-Entwurf im Sheet gegenlesen.** Das macht der Auftraggeber. Die Mengen sind geschätzt (D62).
5. **Offene Entscheidung:** Standard „2 Portionen“ pro Tag bestätigen.
6. **F14 Meal-Prep** (`reicht_fuer_tage`): im Sheet, Protokoll und Backend vorhanden, in Formular und Planung noch nicht (D48). Nur nach Auftrag.

## Stolpersteine, die schon aufgetreten sind
- **Eigener Speicher der installierten iOS-App:** Die App vom Home-Bildschirm hat einen anderen Speicher als Safari. Der Setup-Code muss in der installierten App eingegeben werden.
- **Apps-Script-Aufrufe:** Die App sendet POST als `text/plain`, damit kein CORS-Vorabaufruf nötig ist (Apps Script beantwortet ihn nicht). Antwortet Google mit einer Anmeldeseite, sieht die App nur „Keine Verbindung“, ein falsches „Zugriff“ in der Bereitstellung ist die häufigste Ursache (D64).
- **Datumszellen** sind echte Datumswerte in der Zeitzone Europe/Berlin. `setup()` stellt die Zeitzone des Sheets darauf. Im Sheet als `2026-11-15` eintragen.
- **Gerichte-Status:** Alles außer `idee` zählt als `fertig`. Nur `aktiv`, `fertig`, nicht `nie_wieder` und mit Zutaten wird gewürfelt.
- **Unterpfad-Hosting:** Alle Pfade in `index.html`, Manifest und `sw.js` sind relativ. Keine absoluten Pfade (`/…`) einführen.

## Wo steht was
`README.md` (Überblick), `docs/EINRICHTUNG.md` (Einrichtung in 10 Schritten, inkl. Fehlertabelle), `docs/PROTOCOL.md` (Schnittstelle), `docs/DECISIONS.md` (Entscheidungen), `docs/REVIEW.md` (unabhängige Prüfung und Behebung), `docs/KURZBEFEHL.md` (Apple Erinnerungen), `docs/IMPORT_ANLEITUNG.md` (Gerichte per Claude-Chat), `STATE.md` (Stand), `tools/` (Vorlage, Symbole, Bericht, `migrate_rezeptideen.py`, `zutaten_entwurf.py`).
