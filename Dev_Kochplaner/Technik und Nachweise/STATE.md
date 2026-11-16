# Kochplaner – Projektstand
Wiederaufnahme: zuerst `START_HIER.md` lesen (Anleitung für jede Claude-Instanz). Danach, falls vorhanden, das Begleitdokument im Drive-Ordner "Kochplaner" (Google Sheet "Kochplaner – Fortschritt (Begleitdokument)", Tabs Meilensteine, Fortsetzen, Log).
Zieldokument: `docs/ZIELDOKUMENT.md` (Kopie des Vertrags; Original in claude.ai, nur für den Auftraggeber).

## Stand (15.11.2026)
M0 bis M8 fertig, M9 (Übergabe) läuft. Gebaut ist alles aus dem Zieldokument außer F14 (Meal-Prep, „Kann“, D48).
- Unabhängige Prüfung: `docs/REVIEW.md` (keine Blocker, 17 Befunde und 8 Dokumentationspunkte). Alle behoben oder begründet nicht geändert, siehe Abschnitt „Behebung der Befunde“ und `docs/DECISIONS.md` D53–D60.
- Nachweise: `evidence/laeufe.json` (drei Volläufe in Folge), `evidence/report.html` (Bericht), `evidence/mutation_app.md` (15 absichtliche App-Fehler, alle gefunden), `evidence/mutation_gs.json` (28 absichtliche Fehler in `Code.gs`, alle gefunden).
- Nicht in der Sandbox prüfbar (nur im Abnahmetest `docs/ABNAHMETEST.md`): echtes Safari/iPhone/iPad, echtes Google (Sheets, Apps Script, Zeitzone, Formeln, Parallelität), Apple Erinnerungen und Notizen, Kurzbefehl „Einkauf“, Bilderkennung im Claude-Chat.

## Tests (alle grün)
- `./data/build_all.sh` (21 Orakel-Selbsttests), `node --test "tests/unit/**/*.test.mjs"` (169), `node --test "tests/contract/**/*.test.mjs"` (98), `node tests/tools/export_shuffle_runs.mjs && python3 oracle/check_shuffle.py`. Alles zusammen: `npm run test:all`.
- Browser-Tests (137): `cd tests/e2e && python3 -m pytest` (ca. 5 Minuten, im Hintergrund starten: `nohup python3 -m pytest > /tmp/e2e.log 2>&1 &`; Nachweise in evidence/lauf_lokal/).
- Drei Volläufe in Folge: `python3 tests/tools/volllauf.py 3` (ca. 17 Minuten, im Hintergrund starten). Danach Bericht: `python3 tools/make_report.py lauf_3`.
- Mutationsprüfung Code.gs (28 Mutanten): `bash tests/tools/mutate_gs.sh` (ca. 25 Minuten). App (15 Mutanten): `python3 tests/tools/mutate_app.py` (ca. 10 Minuten).
- Echtes Sheet (nur lesend, erst nach Einrichtung): `KP_URL=... KP_TOKEN=... node tests/contract/live.mjs`.

## Wo liegt was
- Entscheidungen: `docs/DECISIONS.md` (D01–D60). Protokoll: `docs/PROTOCOL.md`.
- Schnittstelle: `backend/Code.gs` (Apps Script), `backend/mock_server.py` (Mock), `tests/tools/gs_sim.mjs` (Simulator), `app/js/adapters/api.js` (Client).
- App-Quelle: `app/` (statisch, ohne Build): `index.html`, `js/state.js` (Zustand), `js/main.js` (Routen), `js/ui/views/*`, `js/core/*` (reine Logik), `css/app.css`, `sw.js`. Testschalter nur über `window.__kpTest` (D44). Hilfe- und Import-Text: `app/js/content/*`; `docs/IMPORT_ANLEITUNG.md` entsteht mit `node tests/tools/export_import_prompt.mjs`.
- Lieferdokumente: `README.md`, `docs/EINRICHTUNG.md`, `docs/KURZBEFEHL.md`, `docs/ABNAHMETEST.md`, `kochplaner_vorlage.xlsx` (entsteht aus `Code.gs` per `tools/make_vorlage.py`, wird von `build_all.sh` miterzeugt).
- App lokal starten (mit Mock): `python3 backend/mock_server.py --xlsx data/kochplaner_test.xlsx --app app --token <mind. 16 Zeichen> --port 0` (gibt `PORT=…` aus). Setup-Code für Tests: `KP1.`+base64url(JSON{u:"http://127.0.0.1:PORT/exec",t:TOKEN}).

## Offen
- F14 Meal-Prep nicht umgesetzt (Kann).
- Abnahmetest durch den Auftraggeber (ca. 30 Minuten, 18 Schritte plus optional Schritt 19) und Einrichtung mit echtem Google-Sheet (`docs/EINRICHTUNG.md`).
- Offene Entscheidung: Standard „2 Portionen“ pro Tag (Kommentar im Zieldokument).
