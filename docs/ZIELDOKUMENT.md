# Zieldokument – Kochplaner-App

Stand 14.11.2026 · René Frank · Kopie des Claude-Dokuments https://claude.ai/artifact/4ZU4vdJjGJihECm1Ngroft (Doc-ID 1cd3e5cd-22b8-4c35-b912-2b017944ed7f), Revision 29. Diese Datei ist der verbindliche Vertrag und liegt im Drive-Ordner, damit er auch ohne Zugriff auf das Original verfügbar ist. Die Diagramm-Grafik „Architektur · Google Sheet als einzige Datenquelle“ fehlt in dieser Kopie, ihr Inhalt steht im Abschnitt Architektur.

## Ziel und Nicht-Ziele

Ziel ist eine deutsche Web-App für iPhone und iPad, die aus deiner Gerichte-Datenbank in Google Sheets mit wenigen Taps einen 7-Tage-Kochplan und den passenden Einkaufszettel erzeugt. („Du“ ist René.)

Die App muss können:

- Startdatum wählen, danach 7 aufeinanderfolgende Tage mit je einem Gericht anzeigen.
- Gerichte per Shuffle vorschlagen; ein Tipp auf einen Tag ändert das Gericht.
- Portionen erhöhen und verringern; Zutaten skalieren mit, Kalorien pro Portion bleiben gleich.
- Einen Einkaufszettel aus den 7 Tagen bilden und nach Apple Erinnerungen und Apple Notes bringen.
- Neue Gerichte aufnehmen: Du sagst oder schickst sie Claude im Chat (Screenshot, Text oder Diktat), Claude schreibt sie über den Google-Sheets-Konnektor ins Sheet, die App liest sie nur ab; alternativ gibt es ein Formular in der App.
- Gerichte nach dem Kochen mit 1 bis 5 Sternen bewerten und eine Rangliste der besten und schwächsten Gerichte zeigen; gut bewertete Gerichte werden öfter vorgeschlagen.
- Fehlt bei einem Gericht kcal pro Portion, automatisch eine Schätzung aus einer einfachen Lebensmittel-Datenbank im Sheet berechnen; ein von Hand eingetragener Wert geht immer vor (F24).
- Eine Hilfe mit geführter Tour und Anleitung bieten, damit auch deine Frau ohne Erklärung klarkommt.

Bewusst nicht Teil des Ziels:

- Kein Anthropic-API-Key und keine KI-Funktion in der App selbst.
- Keine Sortierung des Einkaufszettels nach Supermarktabteilung.
- Nur eine Mahlzeit pro Tag, immer genau 7 Tage.
- Keine Live-Kamera und kein Live-Mikrofon in der App, weil beides in iOS-Home-Bildschirm-Apps nach der Recherche unzuverlässig ist.
- Kein Android und keine Nutzerkonten.
- Keine Notes-Notiz mit automatisch erzeugten Checkboxen (siehe Annahmen und Risiken).

## Feste Entscheidungen

Diese Punkte gelten als beschlossen; Claude arbeitet danach ohne Rückfragen weiter. Was nicht von René kommt, ist als Annahme markiert.

| Thema | Entscheidung | Herkunft |
|---|---|---|
| Geräte | iPhone und iPad, Safari, als Web-App mit eigenem Symbol auf dem Home-Bildschirm; Hoch- und Querformat | René |
| Sprache | Alles auf Deutsch, Dezimalkomma, Datum TT.MM.JJJJ | René, Dezimalkomma ist Annahme |
| Mahlzeiten | Ein Gericht pro Tag | René |
| Zeitraum | Startdatum frei wählbar, immer genau 7 Tage; „Mi–Mi“ heißt Mittwoch bis Dienstag | René, Auslegung ist Annahme |
| Auswahl | Shuffle schlägt Gerichte vor, ein Tipp auf einen Tag ändert das Gericht | René |
| Portionen | Standard 2, in den Einstellungen änderbar, pro Tag änderbar | Annahme (Kommentar dazu im Original noch offen, Standard bleibt 2) |
| Kalorien | kcal pro Portion steht im Sheet; ein von Hand eingetragener Wert geht immer vor. Ist das Feld leer, schätzt die App es automatisch aus den Tabs „Lebensmittel“ und „Richtgewichte“ (F24); bleiben Zutaten nicht zuordenbar, zeigt die App „ca.“ und die Anzahl, ohne zu raten | René (ursprünglich „keine Berechnung“), am 27.11.2026 vom Nutzer aufgehoben |
| Einkaufszettel | Eine flache Liste ohne Abteilungen | René |
| Export | Zwei Buttons: Apple Erinnerungen per Kurzbefehl und Apple Notes per Kopie mit einem Tap auf „Checkliste“ | René, „Beides“ |
| Datenbank | Google Sheet in eurem gemeinsamen Google Drive | René |
| Zugriff aufs Sheet | Kleine Apps-Script-Schnittstelle als reine Datenbrücke mit Token; die Oberfläche ist eine eigenständige Web-App | Auswahl |
| Neue Gerichte | René sagt oder schickt Claude im Chat ein Gericht (Screenshot, Text oder Diktat), Claude schreibt es über den Google-Sheets-Konnektor ins Sheet, die App liest es nur ab; alternativ Formular in der App | René |
| KI | Kein Anthropic-API-Key, keine KI-Funktion in der App | René |
| Code und Auslieferung | Projektordner lokal auf Renés PC, zusätzlich in Drive sicherbar; Auslieferung als statische Dateien über einen kostenlosen Hoster (z. B. Netlify oder Firebase Hosting), austauschbar; Drive selbst kann seit 2016 keine Webseiten ausliefern | Annahme |
| Mehrere Personen | Ein Sheet, eine App-Adresse, einmal Setup-Code pro Gerät | René |
| Abnahme | Ausführlicher manueller Test durch René am Ende | René |
| Testprofile | Claude wählt drei Profile | René |
| Hilfe in der App | Hilfe-Button auf jedem Bildschirm mit geführter Tour und Anleitung, damit auch Renés Frau ohne Erklärung klarkommt | René |
| Bewertung | 1 bis 5 Sterne mit optionaler Notiz je gekochtem Tag; Durchschnitt je Gericht, Rangliste und Einfluss auf den Shuffle (Gewichte: Favorit ×2, Durchschnitt ab 4 ×1,5, Durchschnitt bis 2 ×0,5) | René, Gewichte sind Annahme |
| Gerichtideen | Steht nur ein Name fest, legt Claude ein Gericht mit status = idee an; der Shuffle ignoriert es, bis Zutaten da sind | Annahme |

## Architektur

Die App kommt als statische Datei vom Hoster, spricht nur mit der Apps-Script-Schnittstelle und schreibt nie direkt ins Sheet. Neue Gerichte kommen zusätzlich über den Claude-Chat und den Google-Sheets-Konnektor ins Sheet.

## Datenmodell des Google Sheets

Das Sheet hat sieben Tabs. Die Spaltennamen sind fest, weil auch der Claude-Chat-Import danach schreibt. Die App liest tolerant (Dezimalkomma oder -punkt, ja/nein in beliebiger Schreibweise) und schreibt normalisiert.

**Tab „Gerichte“**, eine Zeile pro Gericht:

| Spalte | Pflicht | Regel |
|---|---|---|
| id | ja | eindeutig, z. B. G001 |
| name | ja | Duplikat gibt einen Hinweis, blockiert nicht |
| basis_portionen | ja | Portionen, auf die sich die Zutatenmengen beziehen, z. B. 4 |
| kcal_pro_portion | nein | Zahl; leer heißt „kcal fehlt“ bzw. wird automatisch geschätzt (F24), nie 0 |
| tags | nein | kommagetrennt, nur für die Suche |
| favorit | nein | ja/nein, Shuffle gewichtet höher |
| nie_wieder | nein | ja/nein, Shuffle schlägt das Gericht nie vor |
| aktiv | ja | ja/nein, Standard ja, nein heißt archiviert |
| reicht_fuer_tage | nein | Zahl, Standard 1 (Meal-Prep, Kann-Funktion) |
| schritte | nein | Zubereitung als Freitext |
| quelle | nein | z. B. „Screenshot 14.11.2026“ |
| angelegt_am | ja | Datum |
| status | nein | fertig oder idee, Standard fertig; „idee“ heißt: nur der Name steht fest, Zutaten fehlen noch; Shuffle und Tauschen ignorieren Ideen |
| typ | nein | hauptgericht oder beilage, Standard hauptgericht (leere Zelle); bestehende Gerichte ohne diese Spalte bleiben Hauptgerichte |

**Tab „Zutaten“**, eine Zeile pro Zutat:

| Spalte | Pflicht | Regel |
|---|---|---|
| gericht_id | ja | Verweis auf Gerichte.id |
| pos | ja | Reihenfolge innerhalb des Gerichts |
| name | ja | z. B. „Zwiebel“ |
| menge | nein | Menge für basis_portionen; leer bei „nach Geschmack“ |
| einheit | nein | g, kg, ml, l, EL, TL, Stück, Dose, Bund, Packung, Prise oder leer |
| einkaufen | ja | ja/nein, Standard ja; nein z. B. für Wasser |

**Tab „Plan“**, eine Zeile pro Tag, zugleich die Historie für die Wiederholungssperre: woche_start, datum, gericht_id, portionen, fixiert (ja/nein), geaendert_am, beilage_id (optional, Verweis auf ein Gericht mit typ = beilage; leer heißt kein Beilagengericht an diesem Tag). Skalierung und Einkaufszettel verarbeiten gericht_id und beilage_id unabhängig, jedes mit seiner eigenen basis_portionen, beide zusammen mit derselben Portionenzahl des Tages.

**Tab „Bewertungen“**, eine Zeile pro Bewertung: gericht_id, datum, sterne (1 bis 5), notiz, von (Name oder Gerät, optional).

**Tab „Einstellungen“**, Schlüssel und Wert: standard_portionen = 2, wiederholungssperre_tage = 21.

**Tab „Lebensmittel“** (F24), eine Zeile pro Lebensmittel: name, kcal_je_100g (Zahl, bezogen auf 100 g bzw. 100 ml).

**Tab „Richtgewichte“** (F24), eine Zeile pro Lebensmittel-Einheit-Kombination: name, einheit (Stück, EL, TL, Dose, Bund, Packung oder Prise – alles außer g/ml, die direkt umgerechnet werden), gramm
(z. B. „Ei“, „Stück“, 55). Wandelt Stückzahlen u. Ä. in Gramm um, bevor mit „Lebensmittel“ die Kalorien berechnet werden.

## Synthetische Testdaten und drei Testprofile

Alle Tests laufen gegen die Datei `kochplaner_test.xlsx` mit derselben Tab-Struktur wie das echte Sheet. Renés echtes Sheet wird von keinem Test berührt.

Die Testdatei hat 40 Gerichte (G001 bis G040) mit je 3 bis 10 Zutaten und diese absichtlichen Sonderfälle:

- 6 Favoriten, 3 Gerichte mit nie_wieder, 4 inaktive Gerichte.
- 2 Gerichte ohne kcal_pro_portion.
- 3 Gerichte mit Stückzutaten (Eier, Zwiebeln) für den Rundungstest.
- 2 Gerichte mit Zutaten ohne Menge („Prise Salz“, „nach Geschmack“).
- 1 Gericht mit reicht_fuer_tage = 3.
- 2 Gerichte mit gleichem Namen.
- Dieselbe Zutat in anderer Schreibweise („Zwiebel“, „zwiebel “) und in g und kg bzw. ml und l.
- Mengen mit Dezimalkomma (1,5) und einkaufen = nein bei Wasser. Dazu 1 Gericht mit status = idee ohne Zutaten und 25 Bewertungen auf 12 Gerichten: 4 mit Durchschnitt ab 4, 3 mit Durchschnitt bis 2, 1 mit nur einer Bewertung.

Die drei Profile unterscheiden sich in Einstellungen, Datenlage und Startdatum:

| Profil | Einstellungen | Datenlage | Start | Prüft |
|---|---|---|---|---|
| Anna, Single | 1 Portion | 40 Gerichte aktiv, Plan leer | Mi 18.11.2026 | Standardfall, Portionen 1 auf 3 und zurück, Export |
| Ben und Clara, Paar | 2 Portionen, Sperrfrist 21 Tage | Plan-Historie mit 14 belegten Tagen | Fr 20.11.2026 | Wiederholungssperre, Tauschen, Fixieren, zweites Gerät |
| Familie Weber | 4 Portionen | nur 6 aktive Gerichte, darunter das Meal-Prep-Gericht | Mi 30.12.2026 | zu wenige Gerichte, Jahreswechsel, Meal-Prep |

Zwei weitere Randfälle laufen ohne Profil: ein leeres Sheet mit nur Kopfzeilen und ein Gericht ohne Zutaten.

Die erwarteten Ergebnisse (Einkaufszettel, skalierte Mengen, Tagessummen) berechnet ein separates Python-Skript `oracle.py` aus der xlsx und dem Plan, ohne einen Zugriff auf den App-Code. Die App muss diese Werte auf ±0,01 treffen.

## Funktionen und Abnahmekriterien

24 Funktionen, jede mit einem messbaren Kriterium und einem Eintrag im Evidenz-Report. Muss und Soll müssen am Ende bestehen, Kann nur, wenn alles andere grün ist.

| ID | Funktion | Prio | Abnahmekriterium |
|---|---|---|---|
| F01 | Startdatum wählen | Muss | Start Mi 18.11.2026 ergibt Mi 18.11. bis Di 24.11., Start Fr 20.11. ergibt Fr bis Do; Monats-, Jahreswechsel und Zeitumstellung liefern genau 7 Folgetage ohne Lücke und Doppel. |
| F02 | Shuffle-Vorschlag | Muss | 7 Gerichte, nur aktive, fertige (status = fertig) und ohne nie_wieder; keine Wiederholung im Plan, solange mindestens 7 passende Gerichte da sind; Gerichte der letzten 21 Tage laut Historie nur, wenn sonst weniger als 7 übrig bleiben; Favoriten kommen bei 1000 Läufen mit festem Seed mindestens 1,5-mal so oft vor; gleicher Seed ergibt denselben Plan. |
| F03 | Tag antippen und Gericht ändern | Muss | Der Tipp öffnet die Auswahl mit Suche über alle aktiven, fertigen Gerichte; die Wahl ersetzt nur diesen Tag; „Neu würfeln“ wirkt nur auf diesen Tag; fixierte Tage bleiben bei „Alle neu würfeln“ unverändert. |
| F04 | Tagesansicht | Muss | Je Tag Wochentag und Datum, Gerichtname, Portionen, kcal pro Portion (oder „kcal fehlt“) und kcal gesamt = kcal pro Portion × Portionen. |
| F05 | Portionen ändern | Muss | Plus und Minus pro Tag von 1 bis 20; Menge = menge × portionen ÷ basis_portionen; 2 auf 5 auf 2 liefert wieder exakt die Ausgangswerte; kcal pro Portion bleibt gleich; Zutaten ohne Menge skalieren nicht. |
| F06 | Einkaufszettel bilden | Muss | Alle Zutaten der 7 Tage mit einkaufen = ja; gleiche Zutat (ohne Groß-/Kleinschreibung und Leerzeichen) und gleiche Einheit werden addiert; g und kg bzw. ml und l werden in der Basiseinheit addiert und ab 1000 als kg bzw. l angezeigt; Stück wird erst nach dem Addieren auf 0,5 aufgerundet; alphabetisch sortiert, mit Dezimalkomma („1,5 l Milch“); Summen stimmen mit dem Orakel auf ±0,01. |
| F07 | Einkaufszettel abhaken | Muss | Tippen setzt und löst den Haken; der Stand bleibt nach dem Neuladen erhalten; „Zurücksetzen“ löscht alle Haken. |
| F08 | Export nach Erinnerungen | Muss | Der Button kopiert die Liste (eine Zeile je Eintrag) und startet den Kurzbefehl „Einkauf“; Fallback ist der Teilen-Dialog. In der Sandbox geprüft: Zwischenablage-Inhalt und Aufruf-Adresse; die Wirkung auf dem Gerät nur im manuellen Test. |
| F09 | Export nach Notes | Muss | „Für Notes kopieren“ legt dieselbe Liste als Klartext, eine Zeile je Eintrag, in die Zwischenablage; die App zeigt die Anleitung „Einfügen, Text markieren, Checkliste antippen“. |
| F10 | Plan speichern und Historie | Muss | Der Plan landet im Tab „Plan“; nach dem Neuladen und auf einem zweiten Gerät ist derselbe Plan sichtbar; die Historie speist die Wiederholungssperre. |
| F11 | Gericht anlegen, bearbeiten, archivieren | Muss | Formular mit Name, Basisportionen, kcal pro Portion (optional), Tags, Zutaten und Schritten; Name und Zutatenname sind Pflicht; Speichern schreibt in „Gerichte“ und „Zutaten“; gleicher Name zeigt einen Hinweis; Bearbeiten ändert dieselbe id; Archivieren setzt aktiv = nein. |
| F12 | Zutaten-Schnellerfassung | Soll | Textfeld mit einer Zutat pro Zeile; erkannt werden „200 g Mehl“, „1,5 l Milch“, „½ TL Salz“, „2 Eier“, „1 Dose Tomaten“ und „Prise Salz“; unklare Zeilen werden markiert, nicht verworfen; Diktat über die iOS-Tastatur verhält sich wie Tippen. |
| F13 | Gerichteliste | Soll | Suche nach Name und Tag; Filter nach Favorit, Idee und archiviert; die Schalter favorit, nie_wieder und aktiv schreiben ins Sheet. |
| F14 | Meal-Prep | Kann | Ein Gericht mit reicht_fuer_tage = N belegt beim Shuffle N Folgetage; die Zutaten zählen einmal für Portionen × N. |
| F15 | Setup und weitere Geräte | Muss | Einstellungsseite mit Setup-Code (Adresse und Token); ein neues Gerät (frischer Browser-Kontext) zeigt nach dem Einfügen desselben Codes dieselben Gerichte und denselben Plan; ein falscher Code gibt eine deutsche Fehlermeldung. |
| F16 | Fehlerfälle | Muss | Schnittstelle nicht erreichbar, falscher Token, Schreibfehler, leeres Sheet, weniger als 7 Gerichte: verständliche deutsche Meldung, kein weißer Bildschirm, eingegebene Daten gehen nicht verloren (Wiederholen-Knopf). |
| F17 | Offline lesen | Soll | Nach einmaligem Laden öffnet die App ohne Netz und zeigt den zuletzt geladenen Plan und Einkaufszettel; Abhaken geht; Schreiben meldet „offline“. |
| F18 | Web-App-Grundlagen | Muss | Manifest (standalone, Name, Icons), apple-touch-icon, Safe-Area; iPhone-Hochformat sowie iPad Hoch- und Querformat ohne abgeschnittene Inhalte; Tippflächen mindestens 44 px. |
| F19 | Gerichte-Import im Claude-Chat | Muss | Eine wiederverwendbare Import-Anleitung (Prompt) liegt bei, auch als kopierbare Vorlage in der Hilfe der App; ein Screenshot, ein Text oder ein Diktat ergibt je ein Gericht mit einer Zeile in „Gerichte“ und passenden Zeilen in „Zutaten“; fehlende kcal bleiben leer; ist nur ein Name bekannt, entsteht ein Gericht mit status = idee. In der Sandbox nur als Formatprüfung der geschriebenen Zeilen, die Bilderkennung nur im manuellen Test. |
| F20 | Hilfe und interaktive Anleitung | Muss | Ein Hilfe-Button („?“) auf jedem Bildschirm öffnet eine deutsche Hilfe mit drei Teilen. Erstens eine geführte Tour (Startdatum, Shuffle, Tag antippen, Portionen, Bewerten, Einkaufszettel, Export), die das jeweilige Bedienelement hervorhebt, übersprungen und jederzeit wiederholt werden kann und beim ersten Start angeboten wird. Zweitens eine Seite „Neues Gericht“ mit den Wegen Claude-Chat (Screenshot, Text, Diktat) und Formular samt kopierbarer Vorlage für den Chat. Drittens eine Einrichtungshilfe für Home-Bildschirm, Setup-Code und Kurzbefehl. Die Hilfe funktioniert offline; ein Durchlauf ohne Vorwissen schafft Plan und Einkaufszettel allein mit der Tour. |
| F21 | Gerichte aktualisieren | Muss | Beim Öffnen und per Button „Aktualisieren“ holt die App die neuesten Daten aus dem Sheet; ein vom Claude-Chat neu eingetragenes Gericht erscheint danach in der Gerichteliste, ohne dass etwas neu installiert wird; die App zeigt die Uhrzeit des letzten Abgleichs. |
| F22 | Gericht bewerten | Soll | Im Tagesbild eines heutigen oder vergangenen Tages gibt es Sterne von 1 bis 5 und eine optionale Notiz; jede Bewertung wird als Zeile im Tab „Bewertungen“ gespeichert; erneutes Bewerten desselben Tages überschreibt; zukünftige Tage lassen sich nicht bewerten; Durchschnitt und Anzahl je Gericht stimmen mit dem Orakel überein. |
| F23 | Rangliste und Gewichtung | Soll | Eine Rangliste zeigt die besten und schwächsten Gerichte nach Durchschnitt (ab 2 Bewertungen). Das Shuffle-Gewicht eines Gerichts ist 1, mit Favorit ×2, bei Durchschnitt ab 4 ×1,5 und bei Durchschnitt bis 2 (ab 2 Bewertungen) ×0,5; ein Gericht mit Durchschnitt bis 2 kommt bei 1000 Läufen mit festem Seed höchstens 0,75-mal so oft vor wie ein unbewertetes. |
| F24 | Automatische Kalorienberechnung | Soll | Ist kcal_pro_portion leer, berechnet die App sie aus den Zutaten über „Lebensmittel“ (g/ml direkt) und „Richtgewichte“ (andere Einheiten erst in Gramm); ein von Hand eingetragener Wert bleibt immer unangetastet; Zutaten ohne Treffer in beiden Tabs werden ausgelassen und als „ca.“ mit Anzahl gekennzeichnet, nicht geraten; Zutaten ohne Menge zählen weder zur Summe noch zu den nicht zuordenbaren. |

## Teststrategie und Beweisführung

Bewiesen wird in Schichten: reine Logik, App im Browser, Zusammenspiel mit der Datenbank. Videos allein beweisen nichts; jeder Schritt hat eine geprüfte Aussage (Assertion).

1. **Logik-Tests.** Datumsberechnung, Shuffle, Skalierung, Einkaufszettel-Addition und Zutaten-Parser sind reine Funktionen mit Unit- und Property-Tests. Zufall läuft mit festem Seed, die Uhr ist eine Fake-Clock in der Zeitzone Europe/Berlin.
2. **Unabhängiges Orakel.** `oracle.py` rechnet die erwarteten Werte aus der Testdatei, ohne App-Code. App und Orakel müssen auf ±0,01 übereinstimmen.
3. **Mock-Schnittstelle.** Ein lokaler Server spricht dasselbe Protokoll wie die Apps-Script-Schnittstelle und liest und schreibt die xlsx. Er kann Fehler einspielen (500, Zeitüberschreitung, falscher Token, 2 Sekunden Verzögerung). Dieselbe Contract-Test-Suite läuft später per Befehl gegen die echte Adresse.
4. **Playwright im Browser.** Chromium über das vorhandene Chrome mit iPhone- und iPad-Emulation, Hoch- und Querformat, Video, Screenshot je Schritt und Trace. In dieser Umgebung geprüft: Chrome, Videoaufnahme, ffmpeg und die Excel-Bibliothek laufen, der Playwright-Browser-Download ist blockiert. WebKit unter Linux ist kein iOS-Safari und zählt nicht als Beweis für iOS.
5. **Szenario je Profil.** Pro Profil ein Durchlauf: Einstellungen, Plan erzeugen, Tag ändern, fixieren, Portionen, Einkaufszettel, Export, Gericht anlegen, bewerten, Neuladen. Dazu ein Neuling-Durchlauf: Ein frischer Kontext ohne Vorwissen erzeugt Plan und Einkaufszettel allein mit Hilfe der Tour (F20).
6. **Zweites Gerät.** Ein frischer Browser-Kontext mit nur dem Setup-Code muss denselben Plan und dieselben Gerichte zeigen.
7. **Import-Format.** Fünf synthetische Rezept-Screenshots (PNG, darunter ein langer) dienen als Vorlage für den Claude-Chat-Import; ein Schema-Validator prüft, ob die geschriebenen Zeilen zum Datenmodell passen. Die Bilderkennung selbst wird hier nicht bewiesen.
8. **Fehlerinjektion.** Jeder Fehlerfall aus F16 wird gezielt ausgelöst.
9. **Mutationsprüfung.** Claude baut drei absichtliche Fehler ein (zum Beispiel Skalierung ohne Division, Haken gehen beim Neuladen verloren, Startdatum um einen Tag verschoben). Die Tests müssen alle drei finden, sonst sind sie zu schwach.
10. **Evidenz-Report.** Eine HTML-Seite mit einer Zeile je Funktions-ID: Status, Video, Screenshots, Assertion-Log. Ein Schritt ohne Assertion zählt nicht als Beweis.

## Iterationsschleife, Stopp und Eskalation

Nach Renés Freigabe dieses Dokuments arbeitet Claude ohne Rückfragen durch:

1. Alle Logik-Tests, Szenarien und Playwright-Läufe starten.
2. Fehlgeschlagene Prüfungen nach Ursache gruppieren und die Ursache im App-Code beheben. Ein Test wird nur geändert, wenn er nachweislich falsch ist; das steht dann mit Begründung in `DECISIONS.md`.
3. Alles erneut als Gesamtlauf starten, damit nichts anderes bricht.

**Erfolg:** 3 vollständig grüne Gesamtläufe in Folge, alle Muss- und Soll-Funktionen bestanden, kein flackernder Test, Evidenz-Report vollständig, und die Mutationsprüfung findet alle drei Fehler.

**Abbruch:** nach 5 Runden oder wenn derselbe Fehler trotz drei Korrekturversuchen bleibt. Dann gibt es einen Zwischenbericht mit Ursache und Vorschlag, kein stilles Weitermachen.

**Rückfragen:** Claude fragt nur bei Entscheidungen, die sich nicht rückgängig machen lassen oder Kosten verursachen. Alles andere wird mit dem hier festgelegten Standard entschieden und in `DECISIONS.md` begründet.

**Renés echtes Sheet:** Claude richtet Tabs und Kopfzeilen erst ein, nachdem René ein leeres Sheet angelegt und den Link gegeben hat, und überschreibt dort nie vorhandene Daten. Alle Tests nutzen nur die synthetische Datei.

## Definition of Done und Lieferumfang

Fertig ist das Projekt, wenn die Erfolgskriterien der Iterationsschleife erfüllt sind und alles Folgende im Drive-Ordner „Kochplaner“ liegt. Die Ablage läuft über den Google-Drive-Konnektor, sobald er verbunden ist; sonst schickt Claude die Dateien im Chat. Von Drive zieht René den Ordner auf seinen PC.

- **App-Ordner:** Quellcode, fertig gebaute Dateien zum Hochladen und eine deutsche `README.md`.
- **`Code.gs` für Apps Script** mit Token-Prüfung und einer Einrichtungsfunktion, die Tabs und Kopfzeilen im Sheet anlegt.
- **Google Sheet:** Tabs und Kopfzeilen richtet Claude über den Google-Sheets-Konnektor ein, sobald René ein leeres Sheet angelegt und den Link gegeben hat. Alternative ohne Konnektor: `kochplaner_vorlage.xlsx` zum Import in Drive.
- **Testpaket:** `kochplaner_test.xlsx`, die drei Profile, alle Testskripte, `oracle.py` und die Befehle zum Wiederholen in der README.
- **Evidenz-Report** mit Videos und Screenshots je Funktion.
- **Einrichtungsanleitung** in etwa zehn Schritten: Sheet, Apps Script bereitstellen, App-Ordner beim Hoster hochladen, Kurzbefehl „Einkauf“ anlegen, App auf den Home-Bildschirm legen, Setup-Code auf dem iPad und beim zweiten Nutzer einfügen.
- **Kurzbefehl-Anleitung** zum Selbst-Anlegen, Schritt für Schritt, weil eine fertige Kurzbefehl-Datei hier nicht geprüft werden kann.
- **Import-Anleitung für den Claude-Chat:** ein wiederverwendbarer Prompt mit den Spaltenregeln, zusätzlich als kopierbare Vorlage in der Hilfe der App.
- **`DECISIONS.md`** mit allen Annahmen und Begründungen.

## Manueller Abnahmetest auf iPhone und iPad

Die Sandbox kann vier Dinge nicht beweisen: echtes Safari auf iPhone und iPad, echtes Google, echte Apple Erinnerungen und Notes sowie die echte Bilderkennung. Dafür gibt es diesen Test, grob etwa 30 Minuten (Schätzung). René hakt ab, was passt; was nicht passt, schreibt er mit der Schritt-Nummer.

- [ ] 1. Leeres Google Sheet in eurem Drive anlegen und Claude den Link geben → sieben Tabs mit Kopfzeilen sind da.
- [ ] 2. `Code.gs` in Apps Script einfügen und als Web-App bereitstellen → du hast Adresse und Token.
- [ ] 3. App-Ordner beim Hoster hochladen → die Adresse öffnet die App in Safari auf dem iPhone.
- [ ] 4. „Zum Home-Bildschirm“ → Symbol und Name stimmen, die App startet ohne Safari-Leiste.
- [ ] 5. Setup-Code einfügen → die Gerichteliste lädt.
- [ ] 6. Gericht per Formular anlegen und Zutaten mit der Diktier-Taste der iOS-Tastatur eingeben → neue Zeilen in „Gerichte“ und „Zutaten“.
- [ ] 7. Drei echte Screenshots und eine Gerichtidee als Text oder Diktat im Claude-Chat senden → drei neue Gerichte im Sheet, jedes Bild ein Gericht, Zutaten plausibel, nach dem Aktualisieren in der App sichtbar; die Idee steht mit status = idee im Sheet.
- [ ] 8. kcal pro Portion im Sheet nachtragen → die App zeigt den Wert statt „kcal fehlt“.
- [ ] 9. Plan mit Start Mittwoch und mit Start Freitag erzeugen → jeweils 7 Tage ab dem gewählten Tag.
- [ ] 10. Shuffle nutzen, einen Tag antippen und das Gericht ändern, einen Tag fixieren und „Alle neu würfeln“ wählen → der fixierte Tag bleibt.
- [ ] 11. Portionen bei einem Gericht von 2 auf 5 auf 1 ändern → Zutaten stimmen im Kopfrechnen, kcal pro Portion bleibt gleich.
- [ ] 12. Einkaufszettel → „In Erinnerungen“ → der Kurzbefehl läuft und die Einträge erscheinen mit Checkboxen; sonst klappt der Teilen-Dialog als Fallback.
- [ ] 13. Einkaufszettel → „Für Notes kopieren“ → in Notes einfügen, Text markieren, Checkliste antippen → Checkboxen sind da.
- [ ] 14. Auf dem iPad und auf dem Handy der Frau den Setup-Code einfügen → derselbe gespeicherte Plan ist sichtbar.
- [ ] 15. Flugmodus an, App öffnen → letzter Plan und Einkaufszettel sind lesbar, Abhaken geht.
- [ ] 16. App schließen und neu öffnen → das Setup bleibt erhalten, kein neuer Code nötig.
- [ ] 17. Einen vergangenen Tag mit Sternen und Notiz bewerten, App neu laden → die Bewertung bleibt, der Durchschnitt steht beim Gericht und in der Rangliste.
- [ ] 18. Renés Frau öffnet die Hilfe, startet die Tour, legt allein ein Gericht per Formular an und erzeugt einen Plan → das gelingt ohne Rückfrage an René.

## Annahmen und offene Risiken

Vier Punkte lassen sich in der Sandbox nicht klären; für sie gibt es den manuellen Test und einen Ausweichweg.

| Punkt | Stand | Folge |
|---|---|---|
| Notes-Checkboxen | Nach der Recherche gibt es keine belegte Schnittstelle, die in Apple Notes echte Checkboxen erzeugt; Kurzbefehl-Foren melden das als unzuverlässig | Erinnerungen sind der sichere Weg, Notes bekommt die Kopie mit einem Tap auf „Checkliste“ |
| Kurzbefehl-Aufruf aus der Web-App | Das Verhalten von shortcuts:// aus einer Home-Bildschirm-Web-App (Bestätigungsdialog, Längenlimit) ist nicht verifiziert | Teilen-Dialog als Fallback; Schritt 12 im manuellen Test |
| Hosting | Drive liefert seit August 2016 keine Webseiten mehr aus; nach bestem Wissen macht auch AirDrop des Ordners keine installierbare Web-App | Statischer Hoster, austauschbar |
| Apps-Script-Schnittstelle | Antwortzeit typischerweise Sekunden (nicht verifiziert); die Adresse ist öffentlich, deshalb ist der Token Pflicht; nach Code-Änderungen muss eine neue Version bereitgestellt werden | Ladeanzeigen und Zwischenspeicher in der App; die Anleitung nennt den Deploy-Schritt |
| iOS-Speicher | Die Home-Bildschirm-App hat einen eigenen Speicher getrennt von Safari, der unter Speicherdruck geleert werden kann | Setup-Code erneut einfügen; die Daten bleiben im Sheet |
| Claude-Chat-Import | Braucht den verbundenen Google-Sheets-Konnektor und Zugriff aufs Sheet (in dieser Sitzung verbunden; Renés Frau nur, wenn sie es mit eigenem Claude-Konto nutzen will, das Formular in der App geht ohne); die Qualität der Bilderkennung zeigt nur Schritt 7 des manuellen Tests | Fehlende Angaben bleiben leer, es wird nichts geraten |
| Zwei Personen gleichzeitig | Schreiben beide denselben Tag, gewinnt der letzte Schreibvorgang | Reicht für einen Haushalt, kein Konfliktsystem |
| Standardwerte | 2 Portionen, 21 Tage Wiederholungssperre, Dezimalkomma und die Bewertungs-Gewichte (Favorit ×2, Durchschnitt ab 4 ×1,5, Durchschnitt bis 2 ×0,5) sind Annahmen | In den Einstellungen änderbar |

Quellen der Recherche: [Google: Abschaltung des Drive-Webhostings](https://workspaceupdates.googleblog.com/2016/07/reminder-turn-down-of-google-drive-web.html), [Apple-Forum zur Web Speech API in Home-Bildschirm-Apps](https://developer.apple.com/forums/thread/748048), [Automators: Checkliste in Notes per Kurzbefehl](https://talk.automators.fm/t/shortcut-to-create-a-checklist-in-notes/5610), [Apps-Script-Limits](https://developers.google.com/apps-script/guides/services/quotas).
