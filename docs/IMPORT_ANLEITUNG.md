# Neue Gerichte per Claude-Chat eintragen

Diese Anleitung liegt auch in der App unter **Hilfe → Neues Gericht**. Dort kann man den Text unten mit einem Tipp kopieren (der Link zum Google Sheet ist dann schon eingesetzt).

So geht es: Neuen Chat mit Claude öffnen, den Text unten einfügen, dann Screenshots (jedes Bild ein Gericht), Text oder Diktat dazugeben. Claude trägt die Gerichte in das Google Sheet ein. In der App danach „Aktualisieren“ tippen.

---

Trage die Gerichte aus meiner Nachricht in mein Google Sheet ein. Nutze dafür den Google-Sheets-Konnektor.
Sheet: <LINK ZUM GOOGLE SHEET>

Ablauf:
1. Jedes Bild und jeder Textblock ist genau ein Gericht. Mehrere Bilder ergeben mehrere Gerichte.
2. Lies zuerst die Tabs „Gerichte“ und „Zutaten“. So kennst du die nächste freie Nummer und siehst, ob es ein Gericht mit demselben Namen schon gibt. Gibt es den Namen schon, frag mich kurz, bevor du es nochmal anlegst.
3. Neue Gerichte bekommen als id den Buchstaben G und die höchste vorhandene Nummer plus 1, dreistellig (G041, G042 …). Ändere oder lösche nie vorhandene Zeilen.

Tab „Gerichte“, eine Zeile je Gericht. Spalten in dieser Reihenfolge:
id, name, basis_portionen, kcal_pro_portion, tags, favorit, nie_wieder, aktiv, reicht_fuer_tage, schritte, quelle, angelegt_am, status, typ
- name: kurzer, klarer Name des Gerichts
- basis_portionen: für wie viele Portionen die Mengen im Rezept gelten (ganze Zahl; steht nichts da, nimm 2)
- kcal_pro_portion: nur eintragen, wenn es im Rezept steht. Sonst leer lassen, nie 0 und nie schätzen
- tags: mit Komma getrennt, zum Beispiel Suppe, vegetarisch
- favorit: nein · nie_wieder: nein · aktiv: ja · reicht_fuer_tage: 1
- schritte: die Zubereitung als Freitext
- quelle: zum Beispiel „Screenshot 14.11.2026“, „Text“ oder „Diktat“
- angelegt_am: heutiges Datum als JJJJ-MM-TT
- status: fertig, wenn Zutaten da sind. Steht nur ein Name fest (eine Idee ohne Rezept), dann status idee und keine Zutaten anlegen
- typ: leer lassen (gilt als hauptgericht)

Tab „Zutaten“, eine Zeile je Zutat. Spalten in dieser Reihenfolge:
gericht_id, pos, name, menge, einheit, einkaufen
- gericht_id: die id des Gerichts
- pos: 1, 2, 3 … in der Reihenfolge des Rezepts
- name: zum Beispiel Zwiebel
- menge: eine Zahl (Dezimalkomma oder Punkt), leer bei „nach Geschmack“ oder „Prise“. Mengen genau so übernehmen, wie sie für basis_portionen im Rezept stehen, nichts umrechnen
- einheit: g, kg, ml, l, EL, TL, Stück, Dose, Bund, Packung, Prise oder leer. Gezählte Dinge wie 2 Eier sind Stück
- einkaufen: ja. Nur bei Wasser oder Dingen, die immer da sind: nein

Regeln:
- Nichts raten. Fehlt eine Angabe oder ist sie nicht lesbar, lass das Feld leer und sag es mir am Ende.
- Schreibe Texte so, dass das Sheet sie nicht umdeutet: Beginnt ein Textwert (name, tags, schritte, quelle) mit = + - @ oder sieht er aus wie ein Datum oder eine Zahl (zum Beispiel 1/2 Zitrone), setze ein Apostroph ' davor.
- In den Zahlenspalten (basis_portionen, kcal_pro_portion, pos, menge) steht nur die Zahl, nie ein Apostroph und kein Tausenderpunkt (1500, nicht 1.500).
- Fasse am Ende kurz zusammen: Anzahl der Gerichte, Namen mit id, welche kcal fehlen und was unsicher war. Dann sage ich in der App „Aktualisieren“.
