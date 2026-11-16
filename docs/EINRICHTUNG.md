# Einrichtung in 10 Schritten

Du brauchst: ein Google-Konto (das gemeinsame Drive), ein kostenloses Konto bei einem Hoster (Netlify oder Firebase Hosting), ein iPhone oder iPad. Dauer beim ersten Mal etwa 30 Minuten. Danach braucht jedes weitere Gerät nur noch zwei Minuten.

Bis Schritt 5 arbeitest du am PC. Ab Schritt 6 am iPhone oder iPad.

## 1. Leeres Google Sheet anlegen
In eurem gemeinsamen Drive: Neu > Google Tabellen > „Leere Tabelle“. Nenne es „Kochplaner Gerichte“. Tabs und Kopfzeilen legt Schritt 3 an. Wer lieber importiert: `kochplaner_vorlage.xlsx` in Drive hochladen und mit Google Tabellen öffnen. Das sollte dasselbe ergeben, ist aber nicht auf echtem Google geprüft. Danach kurz kontrollieren: fünf Tabs mit Kopfzeile, Datumsspalten als Datum (nicht als Zahl). Im Zweifel den leeren Weg nehmen, Schritt 3 legt alles an.

In den fünf Tabs bitte keine eigenen Spalten oder Formeln anlegen: Die App schreibt ganze Zeilen und würde Formeln durch Werte ersetzen. Eigene Notizen gehören in einen sechsten Tab.

## 2. Apps Script öffnen und Code einfügen
Im Sheet: Erweiterungen > Apps Script. Oben links auf „Unbenanntes Projekt“ tippen und das Projekt in „Kochplaner“ umbenennen (dann steht in Schritt 3 dieser Name in der Google-Warnung). Das vorhandene Beispiel (`function myFunction`) komplett löschen. Den gesamten Inhalt von `backend/Code.gs` einfügen. Speichern (Disketten-Symbol).

## 3. Einrichtung ausführen und Token notieren
Oben in der Funktionsauswahl `setup` wählen, „Ausführen“ tippen. Google fragt einmal nach Berechtigungen: „Berechtigungen prüfen“ > Konto wählen > „Erweitert“ > „Kochplaner (unsicher) öffnen“ > „Zulassen“. Das ist dein eigener Code, die Warnung ist normal. Unten im Ausführungsprotokoll steht eine Zeile `TOKEN: …`. Kopiere das Token (lange Folge aus Buchstaben und Zahlen). Im Sheet gibt es jetzt fünf Tabs: Gerichte, Zutaten, Plan, Bewertungen, Einstellungen. Außerdem stellt `setup` die Zeitzone des Sheets auf Europe/Berlin, damit Datumsangaben in App und Sheet übereinstimmen.

## 4. Als Web-App bereitstellen
Oben rechts „Bereitstellen“ > „Neue Bereitstellung“ > Zahnrad > „Web-App“. Einstellungen:
- Ausführen als: **Ich**
- Wer hat Zugriff: **Jeder**

**Beides muss stimmen.** Google schlägt als Standard „Nur ich“ vor, und das Ausklappmenü „Ausführen als“ steht je nach Konto auf „Benutzer, der auf die Web-App zugreift“. Mit diesen Werten bricht die App am iPhone mit „Keine Verbindung“ ab, obwohl der Test am PC (dort bist du bei Google angemeldet) klappt. Kontrolle: „Bereitstellen“ > „Bereitstellungen verwalten“ > Stift. Dort muss stehen: „Ausführen als: Ich (deine E-Mail)“ und „Wer hat Zugriff: Jeder“. Nicht „Jeder mit einem Google-Konto“.

„Bereitstellen“ tippen und die **Web-App-URL** kopieren (endet auf `/exec`). Zugriff „Jeder“ ist nötig, damit die App ohne Google-Anmeldung zugreifen kann. Geschützt wird der Zugriff durch das Token. Gib URL und Token nur an Personen, die den Plan nutzen sollen.

Spätere Änderungen an `Code.gs` wirken erst nach „Bereitstellen“ > „Bereitstellungen verwalten“ > Stift > „Neue Version“ > „Bereitstellen“.

## 5. App-Ordner bei einem Hoster hochladen
Du lädst nur den Ordner `app` hoch, nicht das ganze Projekt. Es gibt nichts zu bauen.
- **Netlify:** Auf app.netlify.com/drop den Ordner `app` in das Fenster ziehen (aus `kochplaner_app.zip` erst entpacken, `index.html` muss direkt im Ordner liegen). Du bekommst eine Adresse wie `https://irgendein-name.netlify.app`. **Wichtig:** Ohne Konto löscht Netlify die Seite nach kurzer Zeit (etwa einer Stunde). Lege deshalb ein kostenloses Konto an und übernimm die Seite („Claim“), bevor du weitermachst. Der Name lässt sich in den Einstellungen ändern.
- **GitHub Pages (kostenlos, mit eigenem Repo):** Öffentliches Repo anlegen, den **Inhalt** des Ordners `app` hochladen (`index.html`, `sw.js`, `manifest.webmanifest`, `css`, `icons`, `js`; im Browser unter „Add file“ > „Upload files“, nicht den äußeren Ordner). Dann Settings > Pages > „Deploy from a branch“ > `main` und `/ (root)` > Save. Nach etwa einer Minute steht die Adresse oben, `https://<benutzer>.github.io/<repo>/`. Liegt `index.html` in einem Unterordner, hängt dessen Name an die Adresse (z. B. `…/Kochplaner/kochplaner_app/`); die App funktioniert dort, weil alle Pfade relativ sind. Das Repo ist öffentlich, im Repo steht nur App-Code, kein Token.
- **Firebase Hosting:** Alternativ `firebase init hosting` im Projektordner, als öffentlichen Ordner `app` angeben, dann `firebase deploy`.

Die Adresse muss mit `https://` beginnen. Bei einem Update lädst du den Ordner `app` erneut hoch.

## 6. App auf dem iPhone öffnen und auf den Home-Bildschirm legen
Adresse in **Safari** öffnen. Teilen-Symbol (Quadrat mit Pfeil nach oben) > „Zum Home-Bildschirm“ > „Hinzufügen“. Ab jetzt startest du die App über das neue Symbol „Kochplaner“, ohne Safari-Leiste.

## 7. Verbinden
Wie kommen URL und Token vom PC aufs iPhone? Schreibe beide in eine Nachricht oder E-Mail an dich selbst (URL in die erste Zeile, Token in die zweite), öffne sie am iPhone und kopiere beide Zeilen. Die Nachricht danach löschen, das Token ist wie ein Passwort.

In der App unten „Einstellungen“. In das Feld „Setup-Code“ einfügen: die Web-App-URL, ein Leerzeichen oder ein Zeilenumbruch, das Token. Beispiel: `https://script.google.com/macros/s/…/exec ABC123…`. „Verbinden“ tippen. Es darf nur die URL (endet auf `/exec`) und danach nur das Token im Feld stehen: ohne das Wort `TOKEN:` aus dem Protokoll, ohne `?token=` hinter der URL und ohne Anführungszeichen. Die App lädt die Gerichte und zeigt den Plan. Unter „Einstellungen“ > „Setup-Code für ein anderes Gerät“ steht jetzt der Code, der mit `KP1.` beginnt. Diesen kurzen Code gibst du an die anderen Geräte weiter.

## 8. Kurzbefehl „Einkauf“ anlegen
Damit „In Erinnerungen“ die Einkaufsliste in Apple Erinnerungen schreibt. Einmal pro Gerät, das exportieren soll. Anleitung: `docs/KURZBEFEHL.md`. Ohne Kurzbefehl funktionieren „Für Notes kopieren“ und „Teilen“ trotzdem.

## 9. iPad und zweites Handy
Auf jedem weiteren Gerät Schritt 6 wiederholen, dann in den Einstellungen den `KP1.`-Code aus Schritt 7 einfügen. Alle Geräte teilen denselben Plan. Schreiben zwei Personen denselben Tag, gewinnt der letzte Schreibvorgang.

## 10. Erste Gerichte anlegen
Drei Wege:
- In der App: „Gerichte“ > „Neu“. Zutaten lassen sich zeilenweise eintippen oder mit der Diktier-Taste der iOS-Tastatur sprechen („200 g Nudeln, 1 Zwiebel …“), dann „Zutaten erkennen“.
- Im Claude-Chat: Screenshot, Text oder Diktat senden und Claude das Gericht ins Sheet schreiben lassen. Den Prompt dafür findest du in `docs/IMPORT_ANLEITUNG.md` und in der App unter Hilfe > „Neues Gericht“. In der App danach „Aktualisieren“ tippen (Pfeil oben rechts).
- Direkt im Sheet (Tabs „Gerichte“ und „Zutaten“).

Dann der manuelle Abnahmetest: `docs/ABNAHMETEST.md`.

## Wenn etwas nicht klappt
| Meldung oder Verhalten | Ursache und Lösung |
|---|---|
| „Der Zugangsschlüssel stimmt nicht mehr“ | Setup-Code erneut einfügen (Einstellungen). Neues Token: im Apps-Script-Editor `tokenErneuern` ausführen und den neuen Code auf allen Geräten einfügen. Ungespeicherte Änderungen am Plan und offene Bewertungen bleiben dabei erhalten und werden danach gesendet. |
| „Das Google Sheet ist noch nicht vorbereitet“ | Schritt 3 (`setup`) ausführen. |
| „Nicht gespeichert … Deine Eingaben sind noch da“ beim Gericht | Nochmal „Speichern“ tippen. Auch wenn die erste Anfrage schon angekommen war, entsteht kein doppeltes Gericht. |
| Fehlermeldung nach einer Code-Änderung | Schritt 4: neue Version bereitstellen. |
| App fragt nach Setup-Code, obwohl schon verbunden | iOS hat den Speicher der App geleert. Code erneut einfügen. Die Daten liegen im Sheet. |
| „Dieser Setup-Code ist nicht gültig … beginnt mit KP1.“ | Im Feld stehen mehr oder weniger als URL und Token. Häufig: `TOKEN:` mitkopiert, `?token=…` an der URL, nur die URL ohne Token oder URL und Token ohne Leerzeichen dazwischen. Nur URL, Leerzeichen oder Zeilenumbruch, Token einfügen. |
| „Keine Verbindung. Bitte Internet prüfen.“ trotz Netz | Die Bereitstellung steht nicht auf „Ausführen als: Ich“ und „Zugriff: Jeder“. In Apps Script „Bereitstellungen verwalten“ > Stift > beides setzen > „Neue Version“ > „Bereitstellen“. Die URL bleibt gleich. Siehe Schritt 4. |
| Plan lädt langsam | Apps Script braucht oft einige Sekunden. Die App zeigt den letzten Stand, bis die Antwort kommt. |
