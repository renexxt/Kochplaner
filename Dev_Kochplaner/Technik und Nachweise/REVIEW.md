# Review

Unabhängige Prüfung des Standes vom 15.11.2026 (Code.gs-Hash `babc5472fc1b8124…`, Nachweise `evidence/laeufe.json`, `evidence/mutation_*`). Prüfer: keine Beteiligung am Bau. Es wurde nichts am Projekt verändert, nur diese Datei ist neu.

## Gesamturteil

Das Projekt ist mit Auflagen lieferbar: Ich habe keinen Blocker gefunden, und der Kern (Datumslogik, Shuffle, Portionen, Einkaufszettel, Setup-Code, Doku) ist sauber umgesetzt und überwiegend stark getestet. Vor der Übergabe sollten aber die Datenverlust-Befunde B1 bis B4 behoben werden, denn sie treffen genau die Zusage „eingegebene Daten gehen nicht verloren“ (F10, F11, F16): „Tag leeren“ wird nie ins Sheet geschrieben (B1), ein spät eintreffender Lesevorgang überschreibt den gerade gespeicherten Plan in der Anzeige (B2), „Verbinden“ verwirft einen ungespeicherten Plan samt offenen Bewertungen (B3), und die Schnell-Zutaten werden beim Speichern still verworfen (B4). Die Tests sind dort blind, wo diese Fehler liegen (Zustandswechsel, Rennen zwischen Lesen und Schreiben, Pfade um die Buttons herum), und das Kriterium „Tippflächen mindestens 44 px“ (F18) wird von einem Element verletzt, das der Test nie darstellt (B6). Die Zahlen und Befehle im README stimmen mit den Nachweisen überein; die Doku hat wenige, aber für Nicht-Techniker relevante Lücken (Abschnitt Dokumentation).

## Funktionen F01–F23

| ID | Kriterium erfüllt? | Beleg im Test? | Anmerkung |
|---|---|---|---|
| F01 | ja | stark | Datums-/Wochenlogik `app/js/core/dates.js`, Golden-Dateien aus `oracle/oracle.py` (Monats-, Jahres-, Zeitumstellung). `state.js:130` prüft nur das Muster und `Date.parse`; `Date.parse('2026-02-31')` ist in Node gültig (Hinweis B17). |
| F02 | ja | stark | `core/shuffle.js`, Unit-Tests, Orakel `oracle/check_shuffle.py`, E2E mit festem Seed. Drei Stufen (frei, Sperre, Wiederholung) wie im Ziel. |
| F03 | ja | stark | Auswahl/Suche/Neu würfeln/Fixieren getestet. „Tag leeren“ (`ui/chooser.js:56`) gehört nicht zum Kriterium, ist aber fehlerhaft (B1). |
| F04 | ja | stark | `test_f01_f05_plan.py:198` `zahl()` liest nur ganze Zahlen (Dezimalkomma wird abgeschnitten): gebrochene kcal-Werte sind nicht geprüft. |
| F05 | ja | stark | Exakte Brüche (`core/fraction.js`, BigInt); 2 auf 5 auf 2 liefert die Ausgangswerte; Grenzen 1 bis 20 getestet. |
| F06 | ja | stark | `core/shopping.js:10-65` gegen das Orakel. `state.js:255` verschluckt Ausnahmen und zeigt dann eine leere Liste ohne Meldung (B15). Mengen-Eingabe mit Tausenderpunkt wird falsch gelesen (B14). |
| F07 | ja | stark im Unit-Test, schwach im E2E | Unit `tests/unit/state.test.mjs:183` ist belastbar. Der E2E-Test `test_f07_haken_nur_bei_unveraenderter_menge` prüft die Vorbedingung nicht (siehe Abschnitt Zu schwache Tests). |
| F08 | ja | stark | Zwischenablage und Aufruf-Adresse `shortcuts://run-shortcut?name=Einkauf&input=clipboard` geprüft; Wirkung auf dem Gerät nur im Abnahmetest. |
| F09 | ja | stark | Klartext, eine Zeile je Eintrag, Anleitung sichtbar. |
| F10 | teilweise | stark für Speichern, Neuladen, zweites Gerät; fehlt für Leeren und Rennen | B1 (leerer Tag wird nicht gespeichert), B2 (Lesen überschreibt frisch gespeicherten Plan). |
| F11 | teilweise | stark für Pflichtfelder, gleicher Name, Bearbeiten, Archivieren; fehlt für die Pfade in B4/B5 | `ui/views/dishForm.js:92-110`: Schnell-Text wird beim Speichern ignoriert (B4), Entwurf geht beim Verlassen verloren (B5). |
| F12 | teilweise | stark für den Parser, fehlt für den Speicherweg | Parser `core/parser.js` erkennt die sechs Beispiele; der Weg „tippen, dann sofort Speichern“ verliert die Zutaten (B4). Tausenderpunkt: B14. |
| F13 | ja | stark | Suche, Filter, Schalter mit Rücksetzen bei Fehler. |
| F14 | nein (Kann, bewusst) | nicht zutreffend | Bestätigt: nicht umgesetzt. `reicht_fuer_tage` wird gelesen (`core/normalize.js:51`) und im Backend gespeichert (`Code.gs:234`), aber nirgends verwendet. D48 behauptet fälschlich, das Feld sei im Gerichtsformular (Dokumentation D-4). |
| F15 | ja | stark | Drei Einfügevarianten und frischer Browser-Kontext getestet. `connect` (`state.js:107-120`) verwirft aber ungespeicherte Arbeit (B3). |
| F16 | teilweise | stark für die genannten Fälle, fehlt für Rennen und Zustandswechsel | Meldungen vorhanden, kein weißer Bildschirm. „Daten gehen nicht verloren“ gilt nicht für B2, B3, B5, B8. Fachbegriffe in den Texten: B13. |
| F17 | ja | stark | Offline lesen, Abhaken, „offline“-Meldung beim Schreiben getestet. |
| F18 | teilweise | schwach | Manifest, Icons, apple-touch-icon vorhanden. Checkbox-Beschriftung der Zutatenzeile misst 100 x 30 px (B6). Safe-Area nur oben/unten gesetzt (B16, für die geforderten Formate wohl ohne Folgen). |
| F19 | ja | schwach | Der Test schreibt die erwarteten Zeilen selbst in den Mock; die Kette „Claude liest Screenshot“ ist in der Sandbox nicht prüfbar. Prompt-Regel zu Apostroph mehrdeutig (B11). |
| F20 | ja | stark | Tour-Geometrie (Markierung umschließt Element, Karte im Bild, verdeckt nichts) wird wirklich gemessen. |
| F21 | ja | stark | Aktualisieren, neue Gerichte erscheinen, Uhrzeit des Abgleichs. Rennen mit Speichern: B2. |
| F22 | ja | stark | Zukunft gesperrt, Überschreiben, Zeilenformat. Fokusverlust im Notizfeld (B9). |
| F23 | ja | stark für Gewichtung, schwach für Rangliste | `test_f23_gewichtung_im_browser_1000_laeufe` ist belastbar. `test_f23_rangliste_leer_und_waechst` prüft „wächst“ nicht und kann leer durchlaufen (Abschnitt Zu schwache Tests). |

## Befunde

Schweregrade: Blocker = Auslieferung nicht vertretbar; Wichtig = vor der Übergabe beheben; Hinweis = kann warten. Die Reihenfolge folgt dem Schaden für den Nutzer. Belege mit „V1/V2/V3“ und „Probe“ stammen aus Wegwerf-Skripten in `/tmp/review_probe/` (außerhalb des Projekts) gegen den echten Zustandsautomaten bzw. echtes Chrome gegen den Mock.

**Blocker: keine.**

### B1 – Wichtig – „Tag leeren“ wird nie ins Sheet geschrieben
Ort: `app/js/state.js:194` (`clearDay`), `state.js:149` (`doSave` bricht bei 0 Zeilen ab), `app/js/core/plan.js:28-33` (`slotsToRows` nimmt nur Tage mit Gericht), `app/js/ui/chooser.js:56` (Button).
Fehler: Der Tag wird nur lokal geleert. Gesendet werden nur belegte Tage, und das Protokoll hat kein Löschen eines Plantags. Die Oberfläche zeigt keinen Fehler.
Reproduktion (Probe V1): Plan mit 7 Gerichten speichern, Tag 3 antippen, „Tag leeren“. Sheet hat danach weiter 7 Plan-Zeilen. Nach „Aktualisieren“ steht auf Tag 3 wieder das alte Gericht (in der Probe G021). V1b: alle 7 Tage leeren, Status „leer“, im Sheet bleiben 7 Zeilen; ein zweites Gerät sieht den alten Plan, und die Wiederholungssperre zählt die „gelöschten“ Tage weiter.
Vorschlag: Protokoll und `Code.gs` um das Löschen eines Plantags erweitern (z. B. Zeile mit leerer `gericht_id` löscht die Zeile des Datums), oder „Tag leeren“ entfernen und nur „Neu würfeln“ anbieten. In beiden Fällen Unit- und Vertragstest ergänzen.

### B2 – Wichtig – Später Lesevorgang überschreibt den frisch gespeicherten Plan in der Anzeige
Ort: `app/js/state.js:89-105` (`refresh` baut Tage aus den neuen Daten, sobald `!S.planDirty`), `state.js:145-168` (`doSave`), Auslöser `app/js/main.js:140-142` (Rückkehr in die App) und `main.js:153` (Start).
Fehler: `refresh` prüft nicht, ob seit dem Start des Lesens ein Speichern begonnen oder beendet wurde. Apps Script antwortet oft erst nach mehreren Sekunden; ein alter Lesestand, der nach dem fertigen Speichern eintrifft, ersetzt die Anzeige und den lokalen Zwischenstand durch den alten (oder leeren) Plan.
Reproduktion (Probe V2): Lesen starten, währenddessen Plan ändern, Speichern abschließen lassen, dann die verspätete Lese-Antwort liefern. Danach zeigt die UI den alten bzw. leeren Plan; ein weiteres Ändern würde diesen Stand wieder schreiben.
Vorschlag: Lese-Antworten verwerfen (oder nur Gerichte/Bewertungen übernehmen), wenn seit Start des Lesens ein Speichern lief oder läuft (Zähler `version` vor dem Lesen merken und nach dem Lesen vergleichen). Test mit verzögerter Lese-Antwort ergänzen.

### B3 – Wichtig – „Verbinden“ verwirft ungespeicherte Arbeit und offene Bewertungen
Ort: `app/js/state.js:113` (`S.pending = []; persistPending(); S.planDirty = false;`).
Fehler: Typischer Weg: Schreiben scheitert mit „Token stimmt nicht“, die Meldung sagt „Bitte den aktuellen Setup-Code einfügen“, der Nutzer verbindet neu. `connect` löscht dabei den ungespeicherten Plan und alle wartenden Bewertungen und baut den Plan aus dem Sheet neu auf.
Reproduktion (Probe V3): Plan ändern, Schreiben mit falschem Token scheitern lassen (`dirty` = true, Bewertung in `pending`), `connect` mit neuem Code aufrufen: `dirty` false, `pending` leer, Plan wie im Sheet.
Vorschlag: Bei gleicher Adresse nur das Token tauschen und `pending`/`planDirty` behalten, danach erneut senden; bei anderer Adresse vorher nachfragen.

### B4 – Wichtig – Schnell-Zutaten werden beim Speichern still verworfen
Ort: `app/js/ui/views/dishForm.js:92-110` (`save` nutzt nur `f.zutaten`), `dishForm.js:54-62` (`quickParse` läuft nur über den eigenen Knopf, Zeile 127).
Fehler: Wer Zutaten ins Feld „Schnell eingeben“ tippt oder diktiert und direkt „Speichern“ tippt, bekommt „Gericht angelegt“ mit Status `idee` und null Zutaten, ohne Warnung.
Reproduktion (Probe, echtes Chrome gegen Mock): Gericht anlegen, Name eintragen, drei Zeilen ins Schnellfeld, „Speichern“. Toast „Gericht angelegt: Probe Auflauf.“, Zutaten im Sheet: 0, Status `idee`.
Vorschlag: In `save()` zuerst `quickParse()` ausführen, wenn `f.quick` nicht leer ist, und bei unklaren Zeilen vor dem Speichern anhalten. Test für genau diesen Weg ergänzen (die Tests drücken immer „Zutaten erkennen“).

### B5 – Wichtig – Gerichtsformular verliert den Entwurf beim Verlassen
Ort: `app/js/ui/views/dishForm.js` (Zustand `f` nur im Speicher, keine Ablage in `storage`).
Fehler: Wechsel auf einen anderen Tab und zurück, oder Neuladen der App durch iOS im Hintergrund (vermutet), und das Formular ist leer.
Reproduktion (Probe): Namen eintragen, unten auf „Plan“ tippen, zurück zu „Gerichte“ > „Neu“: Name ist `''`.
Vorschlag: Entwurf bei jeder Eingabe lokal ablegen und beim Öffnen anbieten; beim erfolgreichen Speichern löschen.

### B6 – Wichtig – Checkbox „einkaufen“ in der Zutatenzeile unter 44 px, Test blind
Ort: `app/css/app.css:139` (`.chk`), `app/js/ui/views/dishForm.js:46`.
Fehler: F18 verlangt Tippflächen von mindestens 44 px. Die Beschriftung samt Checkbox misst im Browser 100 x 30 px (Probe), die Checkbox selbst 24 x 24 px.
Reproduktion: Neues Gericht, Zutat hinzufügen, Maße der Zeile „einkaufen“ im Browser messen. `test_f18_layout_und_tippflaechen` (`test_f18_f20_pwa_hilfe.py:91-109`) prüft nur Seiten ohne Zutatenzeilen und meldet deshalb grün.
Vorschlag: `min-height: 44px` für `.chk` (und ausreichende Breite), den Test um eine Seite mit Zutatenzeilen erweitern.

### B7 – Wichtig (vermutet) – Zeitzone in `Code.gs` fest auf `Europe/Berlin`
Ort: `backend/Code.gs:14`, `:373-374`, `:470`.
Fehler: Datumszellen sind Mitternacht in der Zeitzone des Sheets, formatiert wird aber in Berlin. Steht das Sheet auf einer Zeitzone östlich von Berlin, verschiebt sich das Datum um einen Tag (vermutet; auf echtem Google nicht geprüft). Die Vertragstests können das nicht aufdecken, weil `tests/tools/gs_sim.mjs` dieselbe Konstante nutzt.
Vorschlag: In `setup()` `ss.setSpreadsheetTimeZone(KP.TZ)` aufrufen, oder die Zeitzone des Sheets (`ss.getSpreadsheetTimeZone()`) verwenden und in `EINRICHTUNG.md` im Abnahmetest „Datum im Sheet gleich Datum in der App“ prüfen lassen.

### B8 – Wichtig – Neues Gericht kann nach verlorener Antwort doppelt angelegt werden
Ort: `backend/Code.gs:208-285` (kein Wiederholungsschlüssel, Neuanlage Zeile 266-270), Wiederholen-Weg `app/js/ui/views/dishForm.js:106-109`.
Fehler: Läuft das Schreiben, aber die Antwort kommt nicht an (Zeitüberschreitung), meldet die App „Nicht gespeichert … nochmal versuchen“. Der zweite Versuch legt ein zweites Gericht an; es gibt nur den Hinweis `NAME_EXISTIERT`. Das Wiederholen-Muster gilt als der Ausweg nach Fehlern (F16).
Reproduktion (nur aus dem Code gelesen, nicht ausgeführt): Antwort des ersten `gericht_speichern` verwerfen, erneut „Speichern“.
Vorschlag: Die App vergibt eine Anfrage-Kennung je Formular; `Code.gs` merkt sich die letzte Kennung (z. B. in den Script-Properties) und liefert bei Wiederholung dieselbe `id`.

### B9 – Hinweis – Fokus geht im Bewertungs-Notizfeld bei jeder Aktualisierung verloren
Ort: `app/js/ui/views/plan.js:62-65` (Eingabefeld), `plan.js:102-117` (`renderList` baut alles neu bei jedem `emit`).
Probe: Fokus im Notizfeld, dann irgendein `emit` (Hintergrund-Aktualisierung): Fokus weg, Text bleibt erhalten (`d.notiz`). Auf dem iPhone schließt sich dabei die Tastatur beim Tippen.
Vorschlag: Beim Neuaufbau den aktiven Eintrag und die Cursorposition merken oder nur geänderte Karten neu zeichnen.

### B10 – Hinweis – `mergeRow_` ersetzt Formeln in Zeilen durch Werte
Ort: `backend/Code.gs:336-344` (`getValues()` und `setValues()` der ganzen Zeile).
Wer in einer eigenen Spalte der Gerichte- oder Zutatenzeile eine Formel hat, verliert sie beim nächsten Speichern dieser Zeile (vermutet aus dem Code, nicht auf Google geprüft). Vorschlag: nur die Zellen der angesprochenen Spalten schreiben oder `getFormulas()` zurückschreiben, oder in `EINRICHTUNG.md` sagen: keine eigenen Spalten/Formeln.

### B11 – Hinweis – Apostroph-Regel ist unklar, `'200` wird nicht gelesen
Ort: `app/js/content/import_prompt.js:33` (`menge: eine Zahl`) und `:39` (Apostroph, „sieht aus wie ... eine Zahl“), `backend/Code.gs:385-392` (`cellOut_`), `app/js/core/parse.js:7-27` (`parseAmount("'200")` ergibt `null`).
Das Verhalten hängt davon ab, wie der Claude-Chat ins Sheet schreibt (rohe oder interpretierte Eingabe). Das Schema des Sheets-Connectors, das ich gesehen habe, nennt diese Option nicht; ob ein Apostroph im Wert landet, ist ungeklärt. Folge im Schlechtesten Fall: Menge fehlt, Zutat erscheint „ohne Menge“. Vorschlag: im Prompt klarstellen, dass `menge` nie ein Apostroph bekommt, und `parseAmount` ein führendes `'` ignorieren lassen.

### B12 – Hinweis – Globale Variable `window.__kp` in der ausgelieferten App
Ort: `app/js/main.js:28`, `:35-36` (gibt `app` und Momentaufnahmen frei). D44 behauptet, Test-Schalter gebe es nur über `window.__kpTest`. Da die App keine fremden Skripte lädt, ist das Risiko klein; trotzdem erreicht jedes Skript im selben Ursprung den Zustand samt Setup-Code. Vorschlag: `__kp` nur anlegen, wenn `__kpTest` gesetzt ist.

### B13 – Hinweis – Fachwörter in Fehlertexten
Ort: `app/js/state.js:14-23` („Schnittstelle“, „Server“, „Token“, „Apps Script“, „setup“). Der Hinweis „Bitte in Apps Script die Funktion ‚setup‘ ausführen“ (`:20-22`) hilft der zweiten Person im Haushalt nicht. Vorschlag: zwei Stufen, eine Alltagssatz-Zeile plus „Technische Details“ für die Person, die das Sheet eingerichtet hat.

### B14 – Hinweis – Tausenderpunkt und Komma gemischt in Mengen
Ort: `app/js/core/parse.js:19`. `parseAmount("1.500")` ergibt 1,5 (nicht 1500), `parseAmount("1.000,5")` ergibt rund 1,0005. Wer „1.500 g Mehl“ ins Schnellfeld diktiert oder tippt, bekommt 1,5 g ohne Warnung. Vorschlag: Punkt mit genau drei Ziffern danach und ohne Komma als unklar markieren (F12 verlangt „unklare Zeilen markieren, nicht verwerfen“).

### B15 – Hinweis – Einkaufsliste verschluckt Ausnahmen
Ort: `app/js/state.js:255` (`try { … } catch { return []; }`). Ein unerwarteter Fehler in der Berechnung zeigt eine leere Liste ohne Meldung; der Nutzer geht dann ohne Einkaufszettel einkaufen. Vorschlag: Fehler als Meldung anzeigen („Einkaufszettel konnte nicht berechnet werden“).

### B16 – Hinweis – Safe-Area links/rechts fehlt (vermutet ohne Folgen)
Ort: `app/css/app.css` (nur `env(safe-area-inset-top/bottom)`, ich fand kein `-left`/`-right`). Betrifft iPhone im Querformat; F18 verlangt nur iPhone Hochformat sowie iPad Hoch- und Querformat, daher nur Hinweis.

### B17 – Hinweis – Kleinkram im Backend und in der Datumsprüfung
- `backend/Code.gs:268`: `('000' + n).slice(-3)` ergibt ab Gericht 1000 `G000`, ab 1001 `G001` und damit doppelte ids. Erst bei sehr großen Sammlungen relevant.
- `backend/Code.gs:289`: `KP.SETTINGS[key]` ohne `hasOwnProperty`; ein Schlüssel wie `constructor` liefert eine Funktion statt „Unbekannte Einstellung“ (`doPost` prüft das Token vorher, `Code.gs:53`, daher kein Angriff von außen).
- `backend/Code.gs:130` und `locked_` (`:483-491`): `lesen_` läuft ohne Sperre; beim Ersetzen der Zutaten (Löschen `:274-278`, Anfügen `:279-283`) kann ein gleichzeitiges Lesen ein Gericht kurz ohne Zutaten sehen (vermutet, Apps Script kann parallel ausführen).
- `backend/Code.gs:33-43`: GET mit Token in der Adresse (die App selbst nutzt nur POST, `app/js/adapters/api.js:29`). Adressen mit Token landen in Protokollen und Verläufen. Vorschlag: GET für `ping` ohne Token anbieten oder ganz streichen.
- `app/js/state.js:130`: `Date.parse('2026-02-31')` ist in Node gültig (3. März); die Datumsauswahl der App verhindert das, bei Safari vermutet.
- Echter Vorname im Auslieferungsstand: `app/js/ui/views/settings.js:81` (Platzhalter „z. B. René“), `START_HIER.md` (Vorname des Auftraggebers und Erwähnung seiner Frau). Die Test-Tabellen in `data/*.xlsx` und `kochplaner_vorlage.xlsx` enthalten ihn nicht (per Suche geprüft). Vorschlag: neutralen Platzhalter („z. B. Anna“) und START_HIER.md nicht mitliefern.

## Zu schwache Tests

| Test | Warum schwach | Was durchrutschen würde |
|---|---|---|
| `tests/e2e/test_profile_wege.py:38` (`count() >= 0`) | Eine Zählung ist immer größer oder gleich 0. | Jede Rückmeldung nach dem Verbinden, auch keine. |
| `test_f23_rangliste_leer_und_waechst` (`test_f19_f22_f23_import_bewerten.py:278-288`) | Der Name verspricht „wächst“, der Test prüft es nicht; `p, m, app = profil(...)` wird nicht verwendet; hat die Testdatei Bewertungen, läuft der `else`-Zweig mit `pruefe("F23", True, …)` durch (Zeile 288), also ohne Prüfung. | Eine Rangliste, die nach neuen Bewertungen nicht aktualisiert wird; eine leere Rangliste ohne Hinweis. |
| `test_f07_haken_nur_bei_unveraenderter_menge` (`test_f06_f10_einkauf.py:127-139`) | Es wird nicht geprüft, dass sich der Text von Eintrag 0 überhaupt geändert hat. Betrifft der Portionswechsel an Tag 0/1 diese Zutat nicht, ist die Bedingung `e["text"] != liste[0]["text"]` immer falsch und der Test besteht leer. | Im E2E: ein Haken, der bei geänderter Menge stehen bleibt („zu wenig kaufen“). Der Unit-Test `state.test.mjs:183` fängt diesen Fall. |
| `test_f18_layout_und_tippflaechen` (`test_f18_f20_pwa_hilfe.py:91-109`) | Misst Tippflächen auf Seiten ohne Zutatenzeilen und ohne iPhone-Querformat. | B6 (Checkbox 100 x 30 px) und alles, was nur im Formular mit Zutaten sichtbar wird. |
| `test_f19_importzeilen_format_und_app` (`test_f19_f22_f23_import_bewerten.py:59-75`) | Der Test schreibt die „erwarteten Zeilen“ selbst über die Mock-Schnittstelle; Normalisierung und Format prüft damit der Mock gegen sich selbst. Der eigentliche Importweg (Claude liest Screenshot) ist nicht prüfbar. | Eine Prompt-Formulierung, die zu falschen Zeilen führt (z. B. B11). |
| `zahl()` in `test_f01_f05_plan.py:198-200` | Entfernt Punkte und schneidet beim Komma ab. | Falsch dargestellte kcal mit Nachkommastellen. |
| Sechs Zeilen `rec.pruefe(…, True, …)` (`test_f15_f17_…py:68`, `:137`; `test_f18_f20_…py:255`, `:286`; `test_f19_f22_f23_…py:288`, `:318`) | Reine Protokollzeilen, sie zählen in „1035 Prüfungen“ mit. Bei `:68`, `:137`, `:255` stehen davor `wait_for_*`-Aufrufe, die bei Fehlern den Test abbrechen (gesehen); `:286` habe ich nicht im Kontext geprüft; `:288` ist leer (siehe oben), `:318` nur Protokoll. | Nichts durch diese Zeilen allein, aber die Zahl 1035 überzeichnet die Prüfbreite. |
| Kein Test für B1 bis B5, B8 | Die Zustands- und Rennfälle (Tag leeren, spätes Lesen, Verbinden mit offenen Änderungen, Speichern ohne „erkennen“, verlorene Antwort) kommen weder in Unit- noch E2E-Tests vor. | Genau die Befunde oben. |
| Mutationsprüfung App (`evidence/mutation_app.md`) | Nur 6 Mutanten, alle in Rechen- und Anzeigelogik; Mutant F wurde von den Unit-Tests nicht gefunden (nur vom E2E). Aussage „6 von 6“ sagt wenig über Zustandslogik. | Fehler in `state.js` wie B1 bis B3. |
| Orakel und App | `oracle/oracle.py` und die App stammen aus denselben Entscheidungen (DECISIONS) und derselben Hand; Gleichklang beweist Übereinstimmung mit den Entscheidungen, nicht mit den Erwartungen der Nutzer. | Fehlentscheidungen, die in beiden gleich stehen (z. B. „Punkt ist Dezimalzeichen“, B14). |
| „Keine externen Anfragen“ | Externe Anfragen sind in den Tests standardmäßig blockiert (`tests/e2e/conftest.py:51` `extern_blockiert=True`); eine ausdrückliche Prüfung, dass keine blockierte Anfrage versucht wurde, habe ich nicht gefunden (vermutet: Fehler würden als Konsolenfehler auffallen). | Eine künftige Anfrage an Dritte, die lautlos scheitert. |

## Dokumentation

Geprüft gegen Code und Zieldokument: `README.md`, `docs/EINRICHTUNG.md` (10 Schritte), `docs/KURZBEFEHL.md`, `docs/ABNAHMETEST.md` (18 Punkte), `docs/IMPORT_ANLEITUNG.md`, `docs/PROTOCOL.md`, `kochplaner_vorlage.xlsx`.

Bestätigt:
- Alle Lieferumfang-Punkte der Definition of Done sind als Dateien vorhanden; die Kopfzeilen der Vorlage stimmen mit `Code.gs` überein.
- `docs/IMPORT_ANLEITUNG.md` ist inhaltsgleich mit `app/js/content/import_prompt.js` (Skriptvergleich).
- Die Funktionsnamen `setup` und `tokenErneuern` gibt es in `Code.gs` (Menüs und Knöpfe von Google selbst konnte ich nicht prüfen); der `KP1.`-Code und die Alternative „URL, Leerzeichen, Token“ stimmen mit `app/js/core/setupcode.js` überein.
- Die Abweichungen in `ABNAHMETEST.md:5-6` gegenüber `ZIELDOKUMENT.md:205-206` (setup-Schritt) sind sinnvoll und in der Datei begründet.
- Zahlen im README (159/89/21/130) stimmen mit `evidence/laeufe.json`; Unit- und Vertragstests habe ich selbst ausgeführt, beide grün.

Fehler und Lücken:
- D-1 (Wichtig für Nicht-Techniker): `docs/EINRICHTUNG.md:14` nennt „Kochplaner (unsicher) öffnen“, aber Schritt 2 (`:11`) sagt nirgends, dass das Apps-Script-Projekt so benannt wird. Es heißt beim Anlegen anders (vermutet: „Unbenanntes Projekt“); die Person sucht dann vergeblich nach dem genannten Namen vor der Sicherheitswarnung. Vorschlag: in Schritt 2 „Projekt oben links in ‚Kochplaner‘ umbenennen“.
- D-2: URL und Token entstehen am Rechner (`EINRICHTUNG.md:14` und Schritt 4), die App läuft auf dem iPhone (`:33`, `:36`). Wie beides dorthin kommt (Nachricht an sich selbst, AirDrop, Notizen) steht nicht da. Hier bleiben Nicht-Techniker hängen. Vorschlag: ein Satz in Schritt 7 (`:36`).
- D-3: `docs/EINRICHTUNG.md:27` (Netlify): Ohne Konto wird ein hochgeladener Ordner bei Netlify Drop nach kurzer Zeit gelöscht (vermutet, aus Erinnerung, kein Netzwerk zum Nachprüfen). Die Anleitung erwähnt kein Konto; vor der Übergabe prüfen und gegebenenfalls ergänzen.
- D-4: `docs/DECISIONS.md:66` (D48) sagt, `reicht_fuer_tage` sei im Gerichtsformular vorhanden. Im Code kommt das Feld nur in `core/normalize.js:51`, `content/import_prompt.js`, `backend/Code.gs:19,234` und `docs/PROTOCOL.md:26,45` vor, nicht in `ui/views/dishForm.js`.
- D-5: `STATE.md:4-5` ist veraltet („M6 läuft … jetzt 3 Volläufe“; die drei grünen Läufe liegen in `evidence/laeufe.json`) und verweist auf ein Begleitdokument in Drive und eine claude.ai-Adresse, die Familienmitglieder nicht nutzen können. Als Lieferdokument ungeeignet; `START_HIER.md` enthält zudem den echten Vornamen (B17).
- D-6: `docs/EINRICHTUNG.md:8`: „Das Ergebnis ist dasselbe“ für den xlsx-Import der Vorlage ist nicht belegt; Verhalten von Google beim Konvertieren (Datumszellen, fixierte Zeile) habe ich nicht geprüft (vermutet unkritisch, aber ungetestet).
- D-7: `ABNAHMETEST.md` enthält keinen Punkt für „Token erneuern“; die Funktion steht nur in der Fehlertabelle (`EINRICHTUNG.md:55`). Hinweis, kein Verstoß gegen das Zieldokument.
- D-8: `docs/PROTOCOL.md`: Stichproben (`gericht_speichern`, Feld `reicht_fuer_tage`) stimmen mit `Code.gs` überein; einen vollständigen Zeile-für-Zeile-Abgleich habe ich nicht gemacht. Das Löschen eines Plantags (B1) fehlt dort wie im Code; bei einer Änderung beides nachziehen.

## Was ich geprüft habe und was nicht

Geprüft:
- Gelesen: `README.md`, `STATE.md`, `START_HIER.md`, alle Dateien in `docs/`, alle Dateien unter `app/` (Logik, Zustand, Ansichten, CSS, Service Worker, Manifest), `backend/Code.gs` vollständig, die E2E-Tests (alle Dateien in `tests/e2e/`), die Unit-Tests, die Liste der Vertragstests und den Simulator `tests/tools/gs_sim.mjs`, `tools/make_vorlage.py`, `tests/tools/mutate_gs.sh`, `evidence/laeufe.json`, `evidence/mutation_app.md`, `evidence/mutation_gs.json`, `evidence/report.html` und die `steps.json` des Laufs 3.
- Ausgeführt: `node --test "tests/unit/**/*.test.mjs"` (159 grün) und `node --test "tests/contract/**/*.test.mjs"` (89 grün). Eigene Wegwerf-Skripte außerhalb des Projekts (`/tmp/review_probe/`): Zustandsautomat gegen den Simulator (B1 bis B3), echtes Chrome gegen den Mock (B4, B5, B6, B9), Parser- und Einkaufsrechnung (B14), Skriptvergleich von `IMPORT_ANLEITUNG.md` mit `import_prompt.js`.
- Sicherheit: Rendern über `h()` mit `textContent` (kein XSS gefunden), keine `console.*`-Aufrufe, keine Anfragen außer an die eigene Schnittstelle (Quellcode-Suche), Token-Vergleich in `Code.gs:474-481` in konstanter Zeit, Token nur im POST-Body der App, im Repository keine echten Tokens oder E-Mail-Adressen.

Nicht geprüft:
- Die komplette E2E-Suite (laut Auftrag) und die Mutationsläufe habe ich nicht neu gestartet; ich stütze mich auf `evidence/`, ohne die Läufe selbst nachgezählt zu haben.
- Nichts davon lief gegen echtes Google Sheets/Apps Script, echtes Safari oder ein echtes iPhone/iPad. Verhalten dort (Zeitzone B7, Apostroph B11, Formeln B10, Parallelität B17, iOS-Neuladen B5, Netlify D-3, xlsx-Import D-6) ist deshalb nur „vermutet“.
- Kurzbefehl „Einkauf“ auf dem Gerät, Antippen auf echter Hardware, VoiceOver/Barrierefreiheit über die Prüfungen der Tests hinaus, Farbkontraste: nicht geprüft.
- Der Claude-Chat-Import (F19) selbst: nicht prüfbar ohne Chat und Sheet.
- Ob das echte Apps-Script-Sheet des Nutzers bereits eingerichtet ist, habe ich nicht angesehen (der Auftrag verlangte kein Netzwerk).

## Behebung der Befunde (Stand 15.11.2026, nach der Prüfung)

Alle Befunde wurden nach der Prüfung durchgesehen. Behoben ist, was in der Spalte „Wie“ steht; die Begründungen stehen in `docs/DECISIONS.md` (D53–D60). Jede Korrektur hat einen eigenen Test, und für die wichtigsten gibt es einen absichtlich eingebauten Fehler, den die Tests finden müssen (`evidence/mutation_app.md`, Mutanten G bis O, und `evidence/mutation_gs.json`, M21 bis M28).

| Befund | Ergebnis | Wie |
|---|---|---|
| B1 Tag leeren | behoben | Knopf entfernt (D53). Das Protokoll kann einen Tag weiterhin löschen (`plan_speichern` mit leerem `gericht_id`), Vertragstest vorhanden. |
| B2 Lesen überschreibt Speichern | behoben | Zähler `rawVersion`, veraltete Leseantwort wird verworfen und einmal neu gelesen (D54). Unit-Test mit verzögerter Antwort, Mutant G. |
| B3 Verbinden verwirft Arbeit | behoben | Gleiche Adresse behält Plan und Bewertungen, andere Adresse verwirft sie bewusst (D56). Unit- und E2E-Test, Mutant H. |
| B4 Schnell-Zutaten verworfen | behoben | `save()` liest das Schnellfeld mit; unklare Zeilen halten das Speichern an (D55). E2E-Tests für beide Wege, Mutant I. |
| B5 Entwurf geht verloren | behoben | Entwurf wird lokal gesichert und beim Öffnen zurückgeholt (D55). E2E-Test mit Tabwechsel und Neuladen, Mutant K. |
| B6 Haken unter 44 px | behoben | `.chk` mindestens 44 × 44 px; der Tippflächen-Test misst jetzt eine Seite mit vier Zutatenzeilen (D60). |
| B7 Zeitzone | behoben, auf echtem Google ungeprüft | `setup()` stellt das Sheet auf Europe/Berlin; Simulator kennt jetzt die Sheet-Zeitzone; Abnahmetest Punkt 9 (D58). |
| B8 Doppeltes Gericht | behoben | `anfrage_id` und Wiederholungserkennung in `Code.gs` (D57). E2E-Test „Antwort geht verloren“ (neuer Fehlermodus im Mock), Mutant J, Code.gs-Mutanten. |
| B9 Fokus im Notizfeld | behoben | `renderList` merkt Fokus und Auswahl. E2E-Test, Mutant N. |
| B10 Formeln in Zeilen | nur dokumentiert | Keine eigenen Spalten oder Formeln in den Tabs verwenden; steht in `EINRICHTUNG.md`. Code nicht geändert, weil der Einsatz nicht vorgesehen ist. |
| B11 Apostroph | behoben | Führender Apostroph wird ignoriert, Prompt-Regel eindeutig (D59). Unit-Test. |
| B12 `window.__kp` | behoben | Nur mit `__kpTest` vorhanden (D60). |
| B13 Fachwörter | behoben | Meldungen in Alltagssprache (D60). Unit-Test sucht Fachwörter per Muster. |
| B14 Tausenderpunkt | behoben | `1.500` und `1.000,5` gelten als unklar (D59). Unit- und E2E-Test, Mutant M. |
| B15 Leere Einkaufsliste | behoben | Rechenfehler wird als Meldung gezeigt (D60). Unit-Test, Mutant L. |
| B16 Safe-Area | behoben | Links und rechts ergänzt (D60). E2E-Test. |
| B17 Kleinkram | teilweise | Gerichts-Nummern ab 1000 und `hasOwnProperty` behoben (D58). Bewusst nicht geändert: `Date.parse` (die Datumsauswahl der App lässt ein 31.02. nicht zu), Lesen ohne Sperre (Wirkung auf echtem Google nicht prüfbar), GET mit Token in der Adresse (die App nutzt nur POST, GET bleibt für Fehlersuche, D26/D27). Der Platzhalter „z. B. René“ ist durch „z. B. Anna“ ersetzt; `START_HIER.md` bleibt außerhalb von `app/`. |

Dokumentation: D-1 bis D-4, D-6 und D-7 sind in `EINRICHTUNG.md`, `ABNAHMETEST.md` (neuer optionaler Punkt 19) und `DECISIONS.md` (D48 korrigiert) erledigt. D-3 habe ich per Websuche geprüft: Netlify Drop löscht Seiten ohne Konto nach etwa einer Stunde; `EINRICHTUNG.md` verlangt jetzt ein Konto und „Claim“. D-5: `STATE.md` ist aktualisiert, `START_HIER.md` bleibt außerhalb von `app/` und ist für Claude-Instanzen gedacht, nicht für Familienmitglieder. D-8: `PROTOCOL.md` nennt jetzt das Löschen eines Tages und `anfrage_id`.

Zu schwache Tests, wie im Abschnitt davor genannt:
- Der alte Test `test_f07_haken_nur_bei_unveraenderter_menge` war wirkungslos: Die geprüfte Zutat gehörte nicht zu den geänderten Tagen. Er wurde neu geschrieben (alle Einträge abhaken, Portionen eines Tages ändern, geänderte und unveränderte Einträge vergleichen). Mutant O (Eintrags-Schlüssel ohne Menge) wird jetzt gefunden.
- `test_f23_rangliste_leer_und_waechst` prüft jetzt wirklich, dass die Rangliste wächst und eine Basis hat.
- `zahl()` in `test_f01_f05_plan.py` liest das Dezimalkomma.
- Zwei Prüfungen, die immer wahr waren (in den Dateien zu F15/F17 und F18/F20), sind durch echte Prüfungen ersetzt.

Nicht verändert und weiter offen (siehe Abschnitt „Nicht geprüft“): alles, was nur auf echtem Google, Safari, iPhone und iPad zu sehen ist. Das deckt der Abnahmetest (`docs/ABNAHMETEST.md`) ab.

Wiederholung der Läufe nach den Korrekturen: Der erste Versuch (Runde 1) war rot, 135 von 137 Browser-Tests grün (`evidence/runde1_fehler.log`). Ursache war kein App-Fehler, sondern mein neu geschriebener Test in `test_f18_f20_pwa_hilfe.py`: Er verglich die als „SCHRITT 4 VON 7“ dargestellte Schrittanzeige mit „Schritt 4 von 7“. Der Vergleich liest jetzt den Text statt der Darstellung. Danach drei Läufe in Folge grün (Runde 2): je 137 von 137 Browser-Tests, 169 Unit-, 98 Vertrags- und 21 Orakel-Tests, 1097 Einzelprüfungen im Bericht, 0 nicht bestanden (`evidence/laeufe.json`).
