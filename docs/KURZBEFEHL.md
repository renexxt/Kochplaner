# Kurzbefehl „Einkauf“ (Apple Erinnerungen)

Eine Web-App darf Apple Erinnerungen nicht direkt ansprechen. Deshalb legst du einmal einen Kurzbefehl an. Die App kopiert die Einkaufsliste (eine Zeile je Eintrag) in die Zwischenablage und startet den Kurzbefehl. Der legt jede Zeile als Erinnerung mit Kästchen an. Eine fertige Kurzbefehl-Datei liegt nicht bei, weil sie sich in dieser Umgebung nicht prüfen lässt. Das Anlegen dauert etwa drei Minuten.

## Vorbereitung
In der Erinnerungen-App eine Liste „Einkauf“ anlegen (oder eine bestehende benutzen).

## Kurzbefehl anlegen
1. App **Kurzbefehle** öffnen, oben rechts **+** tippen.
2. Oben auf den Namen tippen, **Umbenennen**, genau **Einkauf** eingeben. Groß- und Kleinschreibung beachten.
3. **Aktion hinzufügen** > „Zwischenablage abrufen“.
4. **Aktion hinzufügen** > „Text aufteilen“. Den Text auf „Zwischenablage“ lassen, bei „Trennzeichen“ **Neue Zeilen** wählen.
5. **Aktion hinzufügen** > „Für jedes Element wiederholen“ (Wiederholen mit jedem Element in „Aufgeteilter Text“).
6. In die Schleife: **Aktion hinzufügen** > „Neue Erinnerung hinzufügen“. Als Titel das **Wiederholungselement** wählen (blaue Variable), als Liste **Einkauf**.
7. Fertig tippen.

## In der App benutzen
Einkaufszettel > **In Erinnerungen**. Die App kopiert die Liste und öffnet den Kurzbefehl. Beim ersten Mal fragt iOS eventuell nach einer Bestätigung oder nach dem Zugriff auf Erinnerungen. Das bestätigst du einmal.

## Wenn es nicht klappt
- **Nichts passiert oder „Kurzbefehl nicht gefunden“:** Der Name muss genau **Einkauf** lauten.
- **Es erscheint eine einzige Erinnerung mit der ganzen Liste:** Schritt 4 prüfen, das Trennzeichen muss „Neue Zeilen“ sein.
- **iOS blockiert das Öffnen aus der Web-App:** In der App „Teilen …“ nutzen. Das Teilen-Menü reicht die Liste an Erinnerungen, Notes oder Nachrichten weiter.
- **Notes statt Erinnerungen:** „Für Notes kopieren“ tippen, in Notes einfügen, den Text markieren, **Checkliste** antippen. Notes bietet keine Schnittstelle für Checkboxen von außen, deshalb dieser eine Tipp.
