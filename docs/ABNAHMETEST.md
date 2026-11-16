# Manueller Abnahmetest auf iPhone und iPad

Die Sandbox kann vier Dinge nicht beweisen: echtes Safari auf iPhone und iPad, echtes Google, echte Apple Erinnerungen und Notes sowie die echte Bilderkennung. Dafür gibt es diesen Test, grob etwa 30 Minuten (Schätzung). René hakt ab, was passt (Punkt 19 ist optional); was nicht passt, schreibt er mit der Schritt-Nummer.

- [ ] 1. Leeres Google Sheet in eurem Drive anlegen → Claude richtet die fünf Tabs mit Kopfzeilen ein, wenn du den Link gibst; sonst legt `setup` in Schritt 2 sie an (`docs/EINRICHTUNG.md`, Schritte 1 bis 3).
- [ ] 2. `Code.gs` in Apps Script einfügen, `setup` ausführen und als Web-App bereitstellen → du hast Adresse und Token.
- [ ] 3. App-Ordner beim Hoster hochladen → die Adresse öffnet die App in Safari auf dem iPhone.
- [ ] 4. „Zum Home-Bildschirm“ → Symbol und Name stimmen, die App startet ohne Safari-Leiste.
- [ ] 5. Setup-Code einfügen → die Gerichteliste lädt.
- [ ] 6. Gericht per Formular anlegen und Zutaten mit der Diktier-Taste der iOS-Tastatur eingeben → neue Zeilen in „Gerichte“ und „Zutaten“.
- [ ] 7. Drei echte Screenshots und eine Gerichtidee als Text oder Diktat im Claude-Chat senden → drei neue Gerichte im Sheet, jedes Bild ein Gericht, Zutaten plausibel, nach dem Aktualisieren in der App sichtbar; die Idee steht mit status = idee im Sheet.
- [ ] 8. kcal pro Portion im Sheet nachtragen → die App zeigt den Wert statt „kcal fehlt“.
- [ ] 9. Plan mit Start Mittwoch und mit Start Freitag erzeugen → jeweils 7 Tage ab dem gewählten Tag. Im Sheet (Tab „Plan“) steht bei jedem Tag dasselbe Datum wie in der App (kein Tag Verschiebung).
- [ ] 10. Shuffle nutzen, einen Tag antippen und das Gericht ändern, einen Tag fixieren und „Alle neu würfeln“ wählen → der fixierte Tag bleibt.
- [ ] 11. Portionen bei einem Gericht von 2 auf 5 auf 1 ändern → Zutaten stimmen im Kopfrechnen, kcal pro Portion bleibt gleich.
- [ ] 12. Einkaufszettel → „In Erinnerungen“ → der Kurzbefehl läuft und die Einträge erscheinen mit Checkboxen; sonst klappt der Teilen-Dialog als Fallback.
- [ ] 13. Einkaufszettel → „Für Notes kopieren“ → in Notes einfügen, Text markieren, Checkliste antippen → Checkboxen sind da.
- [ ] 14. Auf dem iPad und auf dem Handy der Frau den Setup-Code einfügen → derselbe gespeicherte Plan ist sichtbar.
- [ ] 15. Flugmodus an, App öffnen → letzter Plan und Einkaufszettel sind lesbar, Abhaken geht.
- [ ] 16. App schließen und neu öffnen → das Setup bleibt erhalten, kein neuer Code nötig.
- [ ] 17. Einen vergangenen Tag mit Sternen und Notiz bewerten, App neu laden → die Bewertung bleibt, der Durchschnitt steht beim Gericht und in der Rangliste.
- [ ] 18. Renés Frau öffnet die Hilfe, startet die Tour, legt allein ein Gericht per Formular an und erzeugt einen Plan → das gelingt ohne Rückfrage an René.
- [ ] 19. (optional) Token erneuern: im Apps-Script-Editor `tokenErneuern` ausführen, Setup-Code neu anzeigen lassen und auf einem Gerät einfügen → die App verbindet sich wieder, ungespeicherte Änderungen gehen nicht verloren; das zweite Gerät meldet „Zugangsschlüssel stimmt nicht mehr“, bis dort der neue Code eingefügt ist.

Was die automatischen Tests bereits belegen (Details im Evidenzbericht `evidence/report.html`): alle Funktionen gegen ein simuliertes Sheet in einem echten Chrome mit iPhone- und iPad-Emulation. Dieser manuelle Test prüft nur noch, was eine Sandbox nicht kann: echtes Safari, echtes Google, echte Erinnerungen und Notes, echte Bilderkennung.
