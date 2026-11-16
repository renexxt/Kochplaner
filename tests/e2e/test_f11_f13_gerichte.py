"""F11 Gericht anlegen/bearbeiten/archivieren, F12 Zutaten-Schnellerfassung, F13 Gerichteliste, F21 Aktualisieren."""
import re

import pytest

import kp
from kp import PROFILE, norm_von

QUICK = "200 g Mehl\n1,5 l Milch\n½ TL Salz\n2 Eier\n1 Dose Tomaten\nPrise Salz"


def anna(lab, art="iphone", **kw):
    p = PROFILE["anna"]
    m = lab.mock(p["datei"])
    return m, lab.geraet(m, art, jetzt=p["start"] + "T07:00:00Z", **kw)


def gericht(m, name):
    return next((g for g in m.tab("Gerichte") if g["name"] == name), None)


def zutaten(m, gid):
    return sorted([z for z in m.tab("Zutaten") if z["gericht_id"] == gid], key=lambda z: z["pos"])


def zahl(x):
    return float(str(x).replace(",", ".")) if str(x) != "" else None


def formular_neu(app):
    app.tab("gerichte")
    app.t("btn-neues-gericht").click()
    app.page.wait_for_selector('[data-testid="gericht-name"]')


def test_f11_anlegen_schreibt_gerichte_und_zutaten(lab):
    rec = lab.rec
    m, app = anna(lab)
    vorher = len(m.tab("Gerichte"))
    rec.schritt("Formular ausfuellen")
    formular_neu(app)
    app.t("gericht-name").fill("Testpfanne Nr. 1")
    app.t("gericht-basis").fill("4")
    app.t("gericht-kcal").fill("650")
    app.t("gericht-tags").fill("Pfanne, schnell")
    app.t("zutaten-schnell").fill(QUICK)
    app.t("btn-zutaten-erkennen").click()
    app.t("gericht-schritte").fill("Alles in die Pfanne.")
    rec.shot(app.page, "formular")
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_selector('[data-testid="gerichte-liste"]')
    g = gericht(m, "Testpfanne Nr. 1")
    rec.pruefe("F11", g is not None, "Zeile im Tab Gerichte angelegt")
    rec.gleich("F11", len(m.tab("Gerichte")), vorher + 1, "genau eine neue Zeile")
    rec.gleich("F11", g["id"], "G041", "neue Nummer = hoechste Nummer + 1")
    rec.gleich("F11", (g["basis_portionen"], g["kcal_pro_portion"], g["tags"]), (4, 650, "Pfanne, schnell"), "Basisportionen, kcal und Tags gespeichert")
    rec.gleich("F11", (g["favorit"], g["nie_wieder"], g["aktiv"], g["status"]), ("nein", "nein", "ja", "fertig"), "Standardwerte: kein Favorit, aktiv, status fertig")
    rec.gleich("F11", g["schritte"], "Alles in die Pfanne.", "Zubereitung gespeichert")
    z = zutaten(m, "G041")
    rec.gleich("F11", [(r["pos"], r["name"], zahl(r["menge"]), r["einheit"], r["einkaufen"]) for r in z],
               [(1, "Mehl", 200.0, "g", "ja"), (2, "Milch", 1.5, "l", "ja"), (3, "Salz", 0.5, "TL", "ja"), (4, "Eier", 2.0, "Stück", "ja"), (5, "Tomaten", 1.0, "Dose", "ja"), (6, "Salz", None, "Prise", "ja")],
               "Zutaten in Tab Zutaten, Positionen 1 bis 6")
    rec.pruefe("F11", "Gericht angelegt" in app.text("toast"), "Rueckmeldung: " + (app.text("toast") or ""))
    app.t("gerichte-suche").fill("Testpfanne")
    rec.gleich("F11", app.text("gerichte-anzahl"), "1 Gericht", "neues Gericht erscheint in der Liste")
    rec.shot(app.page, "liste_nach_speichern")


def test_f11_pflichtfelder(lab):
    rec = lab.rec
    m, app = anna(lab)
    formular_neu(app)
    rec.schritt("ohne Namen speichern")
    app.t("btn-gericht-speichern").click()
    rec.pruefe("F11", "Namen" in app.text("form-meldung"), "Meldung verlangt einen Namen: " + app.text("form-meldung"))
    rec.pruefe("F11", "gericht_speichern" not in [e.get("aktion") for e in m.log()], "nichts wurde geschrieben")
    rec.shot(app.page, "name_fehlt")
    rec.schritt("Zutat mit Menge, aber ohne Namen")
    app.t("gericht-name").fill("Nur ein Test")
    app.t("btn-zutat-neu").click()
    app.t("zutat-0-menge").fill("3")
    app.t("btn-gericht-speichern").click()
    rec.pruefe("F11", "Name fehlt" in app.text("form-meldung") and "Zutat 1" in app.text("form-meldung"), "Meldung nennt Zutat 1 ohne Namen: " + app.text("form-meldung"))
    rec.pruefe("F11", gericht(m, "Nur ein Test") is None, "nichts geschrieben")
    rec.schritt("ungueltige kcal und Menge")
    app.t("zutat-0-name").fill("Mehl")
    app.t("zutat-0-menge").fill("abc")
    app.t("gericht-kcal").fill("0")
    app.t("btn-gericht-speichern").click()
    meldung = app.text("form-meldung")
    rec.pruefe("F11", "kcal" in meldung and "keine gültige Menge" in meldung, "beide Fehler werden genannt: " + meldung)
    rec.pruefe("F11", app.t("gericht-name").input_value() == "Nur ein Test", "Eingaben bleiben stehen")


def test_f11_gleicher_name_zeigt_hinweis(lab):
    rec = lab.rec
    m, app = anna(lab)
    norm = norm_von(PROFILE["anna"]["datei"])
    vorhanden = norm["gerichte"][0]["name"]
    vorher = sum(1 for g in m.tab("Gerichte") if g["name"].lower() == vorhanden.lower())
    formular_neu(app)
    rec.schritt("vorhandenen Namen tippen")
    app.page.wait_for_function("document.querySelector('[data-testid=name-hinweis]').hidden === true")
    app.t("gericht-name").fill(vorhanden.upper())
    rec.pruefe("F11", not app.t("name-hinweis").is_hidden(), "Hinweis 'gibt es schon' erscheint (ohne Gross-/Kleinschreibung)")
    rec.shot(app.page, "name_hinweis")
    app.t("zutaten-schnell").fill("1 Stück Test")
    app.t("btn-zutaten-erkennen").click()
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_selector('[data-testid="gerichte-liste"]')
    rec.pruefe("F11", "Name gibt es schon" in app.text("toast"), "Rueckmeldung nennt den doppelten Namen: " + app.text("toast"))
    rec.pruefe("F11", sum(1 for g in m.tab("Gerichte") if g["name"].lower() == vorhanden.lower()) == vorher + 1, "trotzdem angelegt (Varianten mit gleichem Namen sind erlaubt)")


def test_f11_nur_name_wird_idee(lab):
    rec = lab.rec
    m, app = anna(lab)
    formular_neu(app)
    app.t("gericht-name").fill("Ideenkuchen")
    rec.pruefe("F11", "Idee" in app.text("idee-hinweis") or "Idee" in app.page.inner_text("body"), "Formular erklaert: ohne Zutaten wird es eine Idee")
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_selector('[data-testid="gerichte-liste"]')
    g = gericht(m, "Ideenkuchen")
    rec.gleich("F11", (g["status"], g["kcal_pro_portion"], len(zutaten(m, g["id"]))), ("idee", "", 0), "status idee, kcal leer, keine Zutaten")
    app.t("gerichte-suche").fill("Ideenkuchen")
    rec.pruefe("F11", "Idee" in app.t("gericht").first.inner_text(), "Liste kennzeichnet die Idee")
    rec.schritt("Idee ist im Vorschlag und in der Auswahl nicht enthalten")
    app.tab("plan")
    app.t("day-0-name").click()
    app.t("chooser-suche").fill("Ideenkuchen")
    app.page.wait_for_timeout(200)
    rec.pruefe("F11", app.da("chooser-leer"), "Ideen erscheinen nicht in der Auswahl")


def test_f11_bearbeiten_gleiche_id_und_archivieren(lab):
    rec = lab.rec
    m, app = anna(lab)
    app.tab("gerichte")
    app.t("gerichte-suche").fill("Linsensuppe")
    gid = app.t("gericht").first.get_attribute("data-id")
    n_g, n_z = len(m.tab("Gerichte")), len(zutaten(m, gid))
    rec.schritt(f"{gid} bearbeiten")
    app.t(f"gericht-{gid}-oeffnen").click()
    app.page.wait_for_selector('[data-testid="gericht-name"]')
    rec.gleich("F11", app.t("gericht-name").input_value(), "Linsensuppe", "Formular zeigt die gespeicherten Werte")
    rec.gleich("F11", app.page.locator('[data-testid^="zutat-"][data-testid$="-name"]').count(), n_z, "alle Zutaten sind im Formular")
    app.t("gericht-name").fill("Linsensuppe mit Wuerstchen")
    app.t("gericht-kcal").fill("")
    app.t("zutaten-schnell").fill("2 Stück Wiener")
    app.t("btn-zutaten-erkennen").click()
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_selector('[data-testid="gerichte-liste"]')
    g = next(x for x in m.tab("Gerichte") if x["id"] == gid)
    rec.gleich("F11", g["name"], "Linsensuppe mit Wuerstchen", "dieselbe id, neuer Name")
    rec.gleich("F11", len(m.tab("Gerichte")), n_g, "keine neue Zeile")
    rec.gleich("F11", g["kcal_pro_portion"], "", "kcal geleert (jetzt 'kcal fehlt')")
    rec.gleich("F11", len(zutaten(m, gid)), n_z + 1, "Zutatenliste ersetzt: alte plus die neue")
    rec.pruefe("F11", zutaten(m, gid)[-1]["name"] == "Wiener" and zutaten(m, gid)[-1]["pos"] == n_z + 1, "neue Zutat hinten, Positionen lueckenlos")
    rec.schritt("archivieren")
    app.t("gerichte-suche").fill("Wuerstchen")
    app.t(f"gericht-{gid}-oeffnen").click()
    app.page.wait_for_selector('[data-testid="btn-archivieren"]')
    app.t("btn-archivieren").click()
    app.page.wait_for_selector('[data-testid="gerichte-liste"]')
    g = next(x for x in m.tab("Gerichte") if x["id"] == gid)
    rec.gleich("F11", g["aktiv"], "nein", "Archivieren setzt aktiv = nein")
    rec.pruefe("F11", any(x["id"] == gid for x in m.tab("Gerichte")), "Gericht bleibt im Sheet (nichts geloescht)")
    app.t("gerichte-suche").fill("Wuerstchen")
    rec.gleich("F11", app.text("gerichte-anzahl"), "0 Gerichte", "Filter 'Alle' zeigt es nicht mehr")
    app.t("filter-archiviert").click()
    rec.gleich("F11", app.text("gerichte-anzahl"), "1 Gericht", "Filter 'Archiviert' zeigt es")
    app.tab("plan")
    app.t("day-0-name").click()
    app.t("chooser-suche").fill("Wuerstchen")
    app.page.wait_for_timeout(200)
    rec.pruefe("F11", app.da("chooser-leer"), "archiviertes Gericht ist nicht auswaehlbar")
    rec.shot(app.page, "archiviert")
    rec.schritt("Wuerfeln schlaegt es nie vor")
    app.page.keyboard.press("Escape")
    for _ in range(8):
        app.wuerfeln()
        rec.pruefe("F11", gid not in [r[1] for r in app.plan_gespeichert(app.tage()[0]["datum"])], "archiviertes Gericht kommt im Vorschlag nicht vor")


@pytest.mark.parametrize("eingabe,name,menge,einheit,unklar", [
    ("200 g Mehl", "Mehl", "200", "g", False),
    ("1,5 l Milch", "Milch", "1,5", "l", False),
    ("½ TL Salz", "Salz", "0,5", "TL", False),
    ("2 Eier", "Eier", "2", "Stück", False),
    ("1 Dose Tomaten", "Tomaten", "1", "Dose", False),
    ("Prise Salz", "Salz", "", "Prise", False),
    ("2-3 Zwiebeln", "Zwiebeln", "", "", True),
    ("Mehl g", "Mehl g", "", "", True),
])
def test_f12_schnellerfassung_zeilen(lab, eingabe, name, menge, einheit, unklar):
    rec = lab.rec
    m, app = anna(lab)
    formular_neu(app)
    rec.schritt(f"Eingabe '{eingabe}'")
    app.t("zutaten-schnell").fill(eingabe)
    app.t("btn-zutaten-erkennen").click()
    rec.gleich("F12", app.t("zutat-0-name").input_value(), name, "Name erkannt")
    rec.gleich("F12", app.t("zutat-0-menge").input_value(), menge, "Menge erkannt")
    rec.gleich("F12", app.t("zutat-0-einheit").input_value(), einheit, "Einheit erkannt")
    rec.gleich("F12", app.da("zutat-0-unklar"), unklar, "unklare Zeile ist markiert (nicht verworfen)" if unklar else "klare Zeile ohne Warnung")
    rec.gleich("F12", app.page.locator('[data-testid^="zutat-"][data-testid$="-name"]').count(), 1, "die Zeile ist uebernommen, nichts verworfen")


def test_f12_diktat_wie_tippen(lab):
    rec = lab.rec
    m, app = anna(lab)
    formular_neu(app)
    rec.schritt("Diktat der iOS-Tastatur: Text wird am Stueck eingefuegt (insertText)")
    app.t("zutaten-schnell").focus()
    app.page.keyboard.insert_text(QUICK)
    app.t("btn-zutaten-erkennen").click()
    rec.gleich("F12", app.page.locator('[data-testid^="zutat-"][data-testid$="-name"]').count(), 6, "6 Zutaten erkannt")
    rec.pruefe("F12", "6 Zutaten erkannt." in app.text("form-meldung"), "Meldung: " + app.text("form-meldung"))
    rec.schritt("Mischung aus klaren und unklaren Zeilen")
    app.t("zutaten-schnell").fill("1 Stück Zwiebel\n2-3 Karotten\n\n   \n3 EL Öl")
    app.t("btn-zutaten-erkennen").click()
    rec.pruefe("F12", "unklar" in app.text("form-meldung"), "Meldung nennt unklare Zeilen: " + app.text("form-meldung"))
    rec.gleich("F12", app.page.locator('[data-testid^="zutat-"][data-testid$="-name"]').count(), 9, "leere Zeilen werden ignoriert, alle anderen uebernommen")
    rec.shot(app.page, "schnellerfassung")


def test_f13_suche_und_filter(lab):
    rec = lab.rec
    m, app = anna(lab)
    norm = norm_von(PROFILE["anna"]["datei"])
    gs = norm["gerichte"]
    app.tab("gerichte")
    rec.gleich("F13", app.text("gerichte-anzahl"), f"{sum(1 for g in gs if g['aktiv'])} Gerichte", "Filter 'Alle' zeigt alle nicht archivierten")
    rec.schritt("Suche nach Name")
    app.t("gerichte-suche").fill("suppe")
    erw = sorted(g["name"] for g in gs if g["aktiv"] and "suppe" in (g["name"] + " " + " ".join(g["tags"])).lower())
    namen = sorted(t.split("\n")[0].replace("Idee", "").strip() for t in app.page.locator('[data-testid="gericht"] .dish-title').all_inner_texts())
    rec.pruefe("F13", len(namen) == len(erw) and len(erw) >= 3, f"{len(namen)} Treffer fuer 'suppe'")
    rec.schritt("Suche nach Tag")
    tag = next(t for g in gs for t in g["tags"] if t.lower() not in g["name"].lower() and sum(1 for h in gs if t in h["tags"]) >= 2)
    app.t("gerichte-suche").fill(tag)
    erw_tag = [g for g in gs if g["aktiv"] and tag.lower() in (g["name"] + " " + " ".join(g["tags"])).lower()]
    rec.gleich("F13", app.text("gerichte-anzahl"), f"{len(erw_tag)} {'Gericht' if len(erw_tag) == 1 else 'Gerichte'}", f"Suche nach dem Tag '{tag}'")
    rec.schritt("Filter")
    app.t("gerichte-suche").fill("")
    for filt, soll in (("favoriten", sum(1 for g in gs if g["aktiv"] and g["favorit"])), ("ideen", sum(1 for g in gs if g["aktiv"] and g["status"] == "idee")), ("archiviert", sum(1 for g in gs if not g["aktiv"]))):
        app.t(f"filter-{filt}").click()
        rec.gleich("F13", app.text("gerichte-anzahl"), f"{soll} {'Gericht' if soll == 1 else 'Gerichte'}", f"Filter {filt}")
    rec.shot(app.page, "filter_archiviert")
    app.t("filter-alle").click()
    app.t("gerichte-suche").fill("gibtesnicht")
    rec.pruefe("F13", app.da("gerichte-nichts"), "Hinweis 'Nichts gefunden' statt leerer Seite")


def test_f13_schalter_schreiben_ins_sheet(lab):
    rec = lab.rec
    m, app = anna(lab)
    app.tab("gerichte")
    app.t("gerichte-suche").fill("Linsensuppe")
    gid = app.t("gericht").first.get_attribute("data-id")
    row = lambda: next(x for x in m.tab("Gerichte") if x["id"] == gid)
    vor = (row()["favorit"], row()["nie_wieder"], row()["aktiv"])
    rec.schritt("Favorit")
    app.t(f"gericht-{gid}-fav").click()
    app.page.wait_for_function("(id) => document.querySelector(`[data-testid=gericht-${id}-fav]`).getAttribute('aria-pressed') === 'true'", arg=gid)
    rec.gleich("F13", row()["favorit"], "ja", "Favorit steht im Sheet")
    rec.gleich("F13", app.t(f"gericht-{gid}-fav").get_attribute("aria-pressed"), "true", "Schalter zeigt den Zustand")
    app.t(f"gericht-{gid}-fav").click()
    app.page.wait_for_function("(id) => document.querySelector(`[data-testid=gericht-${id}-fav]`).getAttribute('aria-pressed') === 'false'", arg=gid)
    rec.gleich("F13", row()["favorit"], "nein", "Favorit wieder aus")
    rec.schritt("Nie wieder")
    app.t(f"gericht-{gid}-nie").click()
    app.page.wait_for_function("(id) => document.querySelector(`[data-testid=gericht-${id}-nie]`).getAttribute('aria-pressed') === 'true'", arg=gid)
    rec.gleich("F13", row()["nie_wieder"], "ja", "nie_wieder steht im Sheet")
    rec.schritt("Archivieren per Schalter")
    app.t(f"gericht-{gid}-aktiv").click()
    app.page.wait_for_function("(id) => !document.querySelector(`[data-testid=gericht-${id}-aktiv]`)", arg=gid)
    rec.gleich("F13", row()["aktiv"], "nein", "aktiv = nein steht im Sheet, Eintrag verschwindet aus 'Alle'")
    rec.shot(app.page, "schalter")


def test_f21_aktualisieren_zeigt_neues_gericht_aus_dem_chat(lab):
    rec = lab.rec
    m, app = anna(lab)
    app.tab("gerichte")
    app.t("gerichte-suche").fill("Chatgericht")
    rec.gleich("F21", app.text("gerichte-anzahl"), "0 Gerichte", "vorher nicht vorhanden")
    sync0 = app.text("sync-zeit")
    rec.pruefe("F21", re.match(r"^Abgleich \d\d:\d\d$", sync0 or ""), "Uhrzeit des letzten Abgleichs wird angezeigt: " + str(sync0))
    rec.schritt("Claude-Chat schreibt ein Gericht ins Sheet (Schnittstelle)")
    r = m.api("gericht_speichern", gericht={"name": "Chatgericht Linsen-Dal", "basis_portionen": 2, "tags": "Indisch", "quelle": "Screenshot 14.11.2026"},
              zutaten=[{"name": "Rote Linsen", "menge": 200, "einheit": "g", "einkaufen": "ja"}])
    rec.pruefe("F21", r["ok"], "Eintrag im Sheet angelegt: " + str(r.get("id")))
    app.t("btn-aktualisieren").click()
    app.page.wait_for_function("document.querySelector('[data-testid=gerichte-anzahl]').innerText !== '0 Gerichte'", timeout=8000)
    rec.gleich("F21", app.text("gerichte-anzahl"), "1 Gericht", "nach 'Aktualisieren' erscheint das neue Gericht, ohne Neuinstallation")
    rec.shot(app.page, "nach_aktualisieren")
    rec.schritt("Beim Oeffnen der App wird ebenfalls aktualisiert")
    m.api("gericht_speichern", gericht={"name": "Chatgericht Zwei", "basis_portionen": 2}, zutaten=[{"name": "Reis", "menge": 100, "einheit": "g", "einkaufen": "ja"}])
    app.neu_laden()
    app.tab("gerichte")
    app.t("gerichte-suche").fill("Chatgericht")
    app.page.wait_for_function("document.querySelector('[data-testid=gerichte-anzahl]').innerText === '2 Gerichte'", timeout=8000)
    rec.gleich("F21", app.text("gerichte-anzahl"), "2 Gerichte", "beim App-Start geholt")
