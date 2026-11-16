# START HIER – Anleitung für Claude (Kochplaner-Projekt)

Diese Datei liegt im Drive-Ordner **„Kochplaner“** (und im Projektordner selbst). Wenn dir jemand sagt „Schau dir den Ordner Kochplaner im Drive an“, bist du hier richtig. Lies diese Datei ganz, dann arbeite die Schritte unten ab. Der **aktuelle Stand steht nicht hier, sondern im Begleitdokument** (Google Sheet im selben Ordner). Diese Datei beschreibt nur das Verfahren.

## 1. Worum es geht (30 Sekunden)

René (Deutsch, Sprachdiktat, mag direkte, strukturierte, handlungsorientierte Antworten) lässt von Claude eine **Kochplaner-Web-App (PWA) für iPhone und iPad** bauen und **vollständig selbst testen**. Aus einer Gerichte-Datenbank (Google Sheet) erzeugt die App einen 7-Tage-Kochplan (ein Gericht pro Tag) und den Einkaufszettel, mit Shuffle, Portionen, Export nach Apple Erinnerungen und Notes, Bewertungen und Hilfe-Tour. René und seine Frau nutzen dieselbe App. Keine KI und kein API-Key in der App.

Der verbindliche Vertrag ist das **Zieldokument** (Datenmodell, Funktionen F01 bis F23 mit Messkriterien, Teststrategie, Lieferumfang, manueller Abnahmetest). Du hast es als Datei im Ordner: `Kochplaner_Zieldokument.md` (auch als `docs/ZIELDOKUMENT.md` im Projekt-ZIP). Das Original ist ein Claude-Dokument, das ein anderes Konto eventuell nicht öffnen kann: https://claude.ai/artifact/4ZU4vdJjGJihECm1Ngroft . Im Zweifel gilt die Markdown-Kopie.

## 2. Was du jetzt tust, der Reihe nach

1. **Antworte René auf Deutsch**, direkt und knapp. Sag in einem Satz, was du als Nächstes tust.
2. **Prüfe deine Werkzeuge.** Du brauchst die Connectoren **Google Drive** und **Google Sheets** (suche sie bei Bedarf mit ToolSearch bzw. SearchMcpRegistry) und eine Sandbox mit Shell (Python 3, Node 22). Fehlt etwas, sag René in einem Satz, was er einschalten soll, und mach mit dem weiter, was geht.
3. **Finde die Dateien nach Namen, nicht nach ID.** Wurde der Ordner in ein anderes Drive kopiert, sind alle Drive-IDs in den Notizen alt. Suche mit Drive `search_files` (Feld `title`, nicht `name`):
   - Ordner `Kochplaner`
   - Begleitdokument: Google Sheet **„Kochplaner – Fortschritt (Begleitdokument)“**
   - Snapshots: `kochplaner_snapshot_M<n>_<JJJJMMTT>.zip`
   - Zieldokument: `Kochplaner_Zieldokument.md`
4. **Lies das Begleitdokument** (Sheets `get_values`): Tab **Meilensteine** (Status je Meilenstein M0 bis M9), Tab **Fortsetzen** (Auftrag, Regeln, Technikentscheidungen), Tab **Log** (letzte Einträge). Die erste Zeile mit Status „in Arbeit“ oder „offen“ ist dein Einstieg.
5. **Hol das Projekt in die Sandbox.** Prüfe zuerst `ls /home/claude/kochplaner`. Gibt es den Ordner nicht (oder ist er älter als der Stand im Log), spiele den **Snapshot mit der höchsten M-Nummer** ein (neuester Tag gewinnt bei Gleichstand):
   - Drive `download_file_content` auf die ZIP-Datei, Base64 in eine Datei schreiben (`/home/claude/snap.b64`), dann
     `base64 -d /home/claude/snap.b64 > /home/claude/snap.zip && cd /home/claude && unzip -q -o snap.zip`
   - Das ZIP enthält den Ordner `kochplaner/`. Danach: `cd /home/claude/kochplaner && cat STATE.md`.
   - Ältere Snapshots (z. B. M0, M1) sind überholt, nicht einspielen.
6. **Prüfe, dass alles grün ist, bevor du weiterbaust:**
   ```
   cd /home/claude/kochplaner
   ./data/build_all.sh                                   # Testdaten, Orakel-Golden, Orakel-Selbsttest
   node --test "tests/unit/**/*.test.mjs"                # Unit-Tests
   node --test "tests/contract/**/*.test.mjs"            # Vertragstests (Mock und Code.gs-Simulator)
   ```
   Schlägt etwas fehl, repariere zuerst das (Ursache im App-Code beheben; ein Test wird nur geändert, wenn er nachweislich falsch ist, und das steht dann in `docs/DECISIONS.md`).
7. **Arbeite am ersten offenen Meilenstein weiter** (Plan siehe Abschnitt 5), ohne Rückfragen, außer bei den Fällen in Abschnitt 4.
8. **Nach jedem Meilenstein** (Abschnitt 6): Sheet aktualisieren, Snapshot hochladen, Log schreiben, kurze Zwischenmeldung an René.

## 3. Ordnerinhalt (Drive „Kochplaner“)

| Datei | Zweck |
|---|---|
| `START_HIER.md` | diese Anleitung |
| `Kochplaner_Zieldokument.md` | der Vertrag (Kopie des Claude-Dokuments) |
| Google Sheet „Kochplaner – Fortschritt (Begleitdokument)“ | **maßgeblicher Stand**: Meilensteine, Fortsetzen, Log |
| `kochplaner_snapshot_M<n>_<Datum>.zip` | gesamter Projektstand nach Meilenstein n (nimm den höchsten) |
| später: App-Ordner, `Code.gs`, `kochplaner_vorlage.xlsx`, Testpaket, Evidenzbericht, Anleitungen | Lieferumfang laut Zieldokument |

Aufbau des Projektordners `kochplaner/` (im ZIP): `app/` (statische PWA, vanilla ES-Module, ohne Build, `app/js/core/` Logik, `app/js/adapters/api.js` Client), `backend/` (`Code.gs` für Google Apps Script, `mock_server.py` Testserver), `tests/` (`unit/`, `contract/`, `tools/gs_sim.mjs` Apps-Script-Simulator, später `e2e/`), `oracle/` (unabhängiges Python-Orakel und Shuffle-Prüfung), `data/` (Testdaten-Generator, 6 xlsx, Profile, Szenarien, `golden/`), `docs/` (`ZIELDOKUMENT.md`, `DECISIONS.md`, `PROTOCOL.md`), `evidence/`, `STATE.md`.

## 4. Regeln (kurz, Details im Zieldokument)

- **Sprache:** Antworten an René und die gesamte App-Oberfläche auf Deutsch; Dezimalkomma, Datum TT.MM.JJJJ.
- **Kein Anthropic-API-Key, keine KI in der App.** Die App liest das Sheet nur über die Apps-Script-Schnittstelle (Token); neue Gerichte kommen zusätzlich über den Claude-Chat und den Sheets-Connector ins Sheet.
- **Tests nutzen nur die synthetischen Dateien** in `data/`. **Renés echtes Sheet** richtest du erst ein (Tabs, Kopfzeilen), wenn er ein **leeres** Sheet angelegt und den Link gegeben hat, und du **überschreibst dort nie vorhandene Daten**. Dieses Begleitdokument ist nicht die Datenbank.
- **Rückfragen an René nur bei Entscheidungen, die sich nicht rückgängig machen lassen oder Kosten verursachen.** Alles andere mit dem Standard aus dem Zieldokument entscheiden und in `docs/DECISIONS.md` begründen. Läuft die Arbeit unbeaufsichtigt, nimm die vernünftigste Lesart und schreib sie ins Log.
- **Abbruch:** höchstens 5 Iterationsrunden; derselbe Fehler nach 3 Korrekturversuchen = Blocker, der als Zwischenbericht mit Ursache und Vorschlag an René geht (kein stilles Weitermachen).
- **Erfolg:** 3 vollständig grüne Gesamtläufe in Folge, alle Muss- und Soll-Funktionen (F01 bis F23, F14 ist nur „Kann“) bestanden, 0 flaky Tests, Evidenz vollständig, Mutationsprüfung findet alle 3 absichtlichen Fehler.
- **Nichts behaupten, was nicht geprüft ist.** Was die Sandbox nicht beweisen kann (echtes Safari, echtes Google, Erinnerungen/Notes, Bilderkennung), gehört in den manuellen Abnahmetest für René, nicht in den Evidenzbericht als „bestanden“.
- **Persönliche Daten:** Schreib keine privaten Angaben (E-Mail-Adresse usw.) in Dateien, Logs oder an externe Dienste.

## 5. Meilensteine (Status steht im Begleitdokument)

| ID | Inhalt | Fertig, wenn |
|---|---|---|
| M0 | Setup: Drive-Ordner, Begleitdokument, Projektgerüst | Ordner und Sheet existieren, Gerüst in der Sandbox, erster Snapshot |
| M1 | Testdaten und unabhängiges Orakel | `kochplaner_test.xlsx` (40 Gerichte, 25 Bewertungen, Randfälle), 3 Profile, `oracle.py` erzeugt Golden-Dateien |
| M2 | Kernlogik mit Unit- und Property-Tests | Daten, Seed-Shuffle mit Gewichten, Skalierung, Einkaufsliste, Zutaten-Parser, Bewertungen: Tests grün, Abgleich mit Orakel |
| M3 | Protokoll, Mock-Server, `Code.gs`, Apps-Script-Simulator | gleiches JSON-Protokoll gegen Mock und Code.gs, Vertragstests grün, Fehlerinjektion (500, Timeout, falsches Token, 2 s Latenz), Mutationsprüfung von Code.gs |
| M4 | Web-App komplett | F01 bis F23 bedienbar: Plan, Tag ändern, fixieren, Portionen, Einkaufsliste + Haken, beide Exporte, Gerichte-Formular mit Schnelleingabe, Bewerten, Rangliste, Einstellungen mit Setup-Code, Aktualisieren, Hilfe + Tour, PWA mit Offline |
| M5 | Playwright-Szenarien mit Beweisen | alle Funktionen auf iPhone/iPad (hoch/quer), 3 Profile, zweites Gerät, Fehlerfälle, Neuling-Durchlauf; Videos, Screenshots, Trace |
| M6 | Iterationsschleife und Mutationsprüfung | 3 grüne Läufe in Folge, 0 flaky, 3 absichtliche Fehler gefunden |
| M7 | Dokumentation und Auslieferungspaket | README, Einrichtungsanleitung (~10 Schritte), Kurzbefehl-Anleitung, Import-Prompt, DECISIONS.md, `kochplaner_vorlage.xlsx`, Evidenzbericht HTML |
| M8 | Unabhängiges Review | Review-Agent prüft gegen das Zieldokument, Befunde behoben oder begründet abgelehnt (`docs/REVIEW.md`) |
| M9 | Upload nach Drive und Übergabe | alles im Drive-Ordner, Begleitdokument final, Übergabe an René mit nächsten Schritten |

## 6. Nach jedem Meilenstein (Pflicht)

1. Alle Tests grün (siehe Schritt 6 oben), `STATE.md` aktualisieren.
2. **Snapshot erzeugen und hochladen:**
   ```
   cd /home/claude && mkdir -p snapshots
   zip -qr snapshots/kochplaner_snapshot_M<n>_<JJJJMMTT>.zip kochplaner -x '*/node_modules/*' '*/evidence/videos/*'
   sha256sum snapshots/kochplaner_snapshot_M<n>_<JJJJMMTT>.zip
   ```
   Dann Drive `create_file` mit `parentId` = ID des Ordners „Kochplaner“, `contentMimeType: application/zip`, `disableConversionToGoogleType: true` und `base64Content` = `sha256:<hex>:/home/claude/snapshots/<datei>.zip` (Dateireferenz, nicht selbst Base64 tippen). Hinweis: Drive `update_file` kann keinen Inhalt ändern, also immer neu anlegen.
3. **Begleitdokument aktualisieren** (Sheets `update_values`): Tab Meilensteine, Zeile = 2 + Meilenstein-Nummer (M0 = Zeile 2), Spalten A bis F = ID, Meilenstein, Status (`offen` / `in Arbeit` / `fertig`), Fertig wenn, Ergebnis/Ablageort (inkl. Snapshot-Name und Drive-ID), Stand (Datum). Dann Tab **Log** mit `append_values` auf `Log!A1:C1` einen Eintrag anhängen: Zeit, Meilenstein, was fertig ist, was als Nächstes kommt.
4. Dem nächsten Meilenstein Status „in Arbeit“ geben. René bekommt eine kurze Zwischenmeldung (ein, zwei Sätze).

## 7. Sandbox-Hinweise

- Python 3.13, Node 22, `openpyxl`, Playwright (Python) **nur mit `channel="chrome"`** (der Browser-Download ist gesperrt). Ausgehender Zugriff nur über eine Allowlist (Paketquellen, GitHub); `sheets.googleapis.com` ist **nicht** erreichbar, darum gibt es den Mock-Server. WebKit unter Linux ist kein iOS-Safari.
- Node-Tests mit Glob aufrufen: `node --test "tests/unit/**/*.test.mjs"` (ein Ordnername allein funktioniert nicht).
- Mock-Server starten: `python3 backend/mock_server.py --xlsx data/kochplaner_test.xlsx --app app --token <TOKEN> --port 0` (gibt `PORT=<n>` aus, liefert auch `app/` aus). Protokoll: `docs/PROTOCOL.md`.
- `backend/Code.gs` wird nie direkt gegen Google getestet, sondern im Node-`vm`-Simulator (`tests/tools/gs_sim.mjs`), der Datumszellen, Text-Umdeutung und Zeilenbereichsprüfung wie Google Sheets nachbildet. Gegen die echte URL laufen später nur lesende Prüfungen.
- Kein Kommandozeilen-Zugriff auf Renés Computer, außer die Verbindung zur Desktop-App ist aktiv.

## 8. Wenn etwas fehlt

- **Kein Drive/Sheets-Connector:** Sag René genau, was er in den Connector-Einstellungen einschalten muss. Bis dahin: Projekt aus dem ZIP, das er dir im Chat gibt, oder weiterarbeiten, sofern `/home/claude/kochplaner` noch existiert; Snapshots später hochladen.
- **Begleitdokument nicht auffindbar:** Lege ein neues Sheet „Kochplaner – Fortschritt (Begleitdokument)“ mit den Tabs Meilensteine, Fortsetzen, Log an und rekonstruiere den Stand aus `STATE.md` und dem neuesten Snapshot.
- **Zieldokument nicht lesbar:** Nimm `Kochplaner_Zieldokument.md`.
- **Unklar, was gemeint ist:** Entscheide nach dem Zieldokument, schreib die Entscheidung in `docs/DECISIONS.md`, frag René nur, wenn die Entscheidung nicht rückgängig zu machen ist.

## 9. Übergabe an René (Meilenstein M9)

Wenn alles fertig und grün ist, bekommt René (kurz und handlungsorientiert) diese nächsten Schritte: 1. Leeres Google Sheet in eurem Drive anlegen und den Link schicken, dann richtest du Tabs und Kopfzeilen per Sheets-Connector ein (Alternative: `kochplaner_vorlage.xlsx` importieren). 2. `Code.gs` im Sheet unter Erweiterungen > Apps Script einfügen, `setup()` ausführen (gibt das Token aus), als Web-App bereitstellen (Ausführen als: Ich, Zugriff: Jeder); URL + Token ergeben den Setup-Code. 3. App-Ordner bei Netlify oder Firebase Hosting hochladen. 4. Kurzbefehl „Einkauf“ nach Anleitung anlegen. 5. App zum Home-Bildschirm hinzufügen, Setup-Code einfügen (auch auf iPad und beim zweiten Nutzer). 6. Manueller Abnahmetest, 18 Schritte aus dem Zieldokument (ca. 30 Minuten).

## 10. Satz für René zum Weitergeben

> „Schau dir den Ordner ‚Kochplaner‘ in meinem Drive an. Lies zuerst `START_HIER.md` und mach dann dort weiter, wo das Begleitdokument aufgehört hat.“
