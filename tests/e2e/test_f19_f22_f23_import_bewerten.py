"""F19 Gerichte-Import im Claude-Chat (Format), F22 Bewerten, F23 Rangliste und Gewichtung."""
import json
import re
import sys

import pytest

import kp
from kp import DATA, PROFILE, ROOT, norm_von

sys.path.insert(0, str(ROOT / "tests" / "tools"))
import validate_import_rows as vir  # noqa: E402

IMPORT_DIR = ROOT / "tests" / "fixtures" / "import"
SAMPLES = sorted(IMPORT_DIR.glob("rezept*.json"))


def profil(lab, pid, art="iphone", jetzt=None, **kw):
    p = PROFILE[pid]
    m = lab.mock(p["datei"])
    app = lab.geraet(m, art, jetzt=jetzt or p["start"] + "T07:00:00Z", **kw)
    return p, m, app


# ---------------------------------------------------------------- F19
def test_f19_vorlage_in_der_hilfe(lab):
    rec = lab.rec
    p, m, app = profil(lab, "anna", hooks={})
    rec.schritt("Einstellungen: Link zum Sheet eintragen")
    app.tab("einstellungen")
    link = "https://docs.google.com/spreadsheets/d/TESTSHEET123/edit"
    app.t("einst-sheetlink").fill(link)
    app.t("einst-sheetlink").blur()
    app.page.wait_for_timeout(200)
    rec.schritt("Hilfe: Neues Gericht")
    app.t("btn-hilfe").click()
    app.t("hilfe-neu").click()
    app.page.wait_for_selector('[data-testid="vorlage-text"]')
    text = app.t("vorlage-text").input_value()
    rec.pruefe("F19", link in text, "Link zum Sheet steht in der Vorlage")
    dump = m.dump()
    spalten_g = list(dump["Gerichte"][0].keys())
    spalten_z = list(dump["Zutaten"][0].keys())
    rec.pruefe("F19", ", ".join(spalten_g) in text, "Spaltenliste Gerichte in der Vorlage = Spalten im Sheet: " + ", ".join(spalten_g))
    rec.pruefe("F19", ", ".join(spalten_z) in text, "Spaltenliste Zutaten in der Vorlage = Spalten im Sheet: " + ", ".join(spalten_z))
    for regel in ("genau ein Gericht", "nie 0 und nie schätzen", "status idee", "höchste vorhandene Nummer plus 1", "Ändere oder lösche nie vorhandene Zeilen", "Google-Sheets-Konnektor"):
        rec.pruefe("F19", regel in text, f"Regel in der Vorlage: '{regel}'")
    rec.pruefe("F19", "Screenshot" in app.page.inner_text("main") and "Text" in app.page.inner_text("main") and "Diktat" in app.page.inner_text("main"), "Hilfe nennt die Wege Screenshot, Text und Diktat")
    app.t("btn-vorlage-kopieren").click()
    app.page.wait_for_function("document.querySelector('[data-testid=btn-vorlage-kopieren]').innerText === 'Kopiert'")
    rec.gleich("F19", app.page.evaluate("navigator.clipboard.readText()"), text, "Kopieren legt genau die Vorlage in die Zwischenablage")
    rec.shot(app.page, "vorlage")
    datei = (ROOT / "docs" / "IMPORT_ANLEITUNG.md").read_text(encoding="utf-8")
    rec.pruefe("F19", text.split("\n")[0] in datei and ", ".join(spalten_g) in datei, "docs/IMPORT_ANLEITUNG.md enthaelt dieselbe Vorlage (aus einer Quelle erzeugt)")
    rec.pruefe("F19", "Weg 2" in app.page.inner_text("main") and app.da("btn-zum-formular"), "Weg 2: Formular ist verlinkt")


@pytest.mark.parametrize("sample", SAMPLES, ids=[s.stem for s in SAMPLES])
def test_f19_importzeilen_format_und_app(lab, sample):
    """Der Chat schreibt je Bild/Text/Diktat ein Gericht. Hier: erwartete Zeilen schreiben, Format pruefen, in der App sehen."""
    rec = lab.rec
    erw = json.loads(sample.read_text(encoding="utf-8"))
    png = sample.with_suffix(".png")
    rec.pruefe("F19", png.exists() and png.stat().st_size > 5000, f"Vorlagebild {png.name} vorhanden ({png.stat().st_size} Bytes)")
    p, m, app = profil(lab, "anna")
    n0 = len(m.tab("Gerichte"))
    rec.schritt(f"Chat schreibt '{erw['gericht']['name']}' ins Sheet")
    g = dict(erw["gericht"])
    g["angelegt_am"] = "2026-11-14"
    r = m.api("gericht_speichern", gericht=g, **({"zutaten": erw["zutaten"]} if erw["zutaten"] else {}))
    rec.pruefe("F19", r["ok"], f"geschrieben als {r.get('id')}")
    dump = m.dump()
    ids = [x["id"] for x in dump["Gerichte"]]
    rec.gleich("F19", len(ids), len(set(ids)), "alle ids im Sheet bleiben eindeutig")
    neu = [x for x in dump["Gerichte"] if x["id"] == r["id"]]
    fehler = vir.validate(neu, [x for x in dump["Zutaten"] if x["gericht_id"] == r["id"]])
    rec.gleich("F19", fehler, [], "Schema-Pruefung der neu geschriebenen Zeilen (Gerichte und Zutaten)")
    rec.gleich("F19", len(dump["Gerichte"]), n0 + 1, "genau eine neue Zeile in 'Gerichte'")
    zeile = next(x for x in dump["Gerichte"] if x["id"] == r["id"])
    rec.gleich("F19", zeile["kcal_pro_portion"], erw["gericht"]["kcal_pro_portion"], "kcal wie im Rezept; fehlt sie, bleibt die Zelle leer (nie 0)")
    rec.gleich("F19", zeile["status"], erw["gericht"]["status"], "status: fertig mit Zutaten, idee nur mit Namen")
    zz = [x for x in dump["Zutaten"] if x["gericht_id"] == r["id"]]
    rec.gleich("F19", len(zz), len(erw["zutaten"]), "eine Zeile je Zutat in 'Zutaten'")
    rec.gleich("F19", [(x["name"], x["einheit"]) for x in sorted(zz, key=lambda x: x["pos"])], [(x["name"], x["einheit"]) for x in erw["zutaten"]], "Zutaten in Reihenfolge")
    rec.schritt("App: Aktualisieren")
    app.tab("gerichte")
    app.t("btn-aktualisieren").click()
    app.t("gerichte-suche").fill(erw["gericht"]["name"])
    app.page.wait_for_function("document.querySelector('[data-testid=gerichte-anzahl]').innerText === '1 Gericht'", timeout=8000)
    karte = app.t("gericht").first.inner_text()
    rec.pruefe("F19", erw["gericht"]["name"] in karte, "Gericht erscheint in der Liste")
    if erw["gericht"]["kcal_pro_portion"] == "":
        rec.pruefe("F19", "kcal fehlt" in karte or "Idee" in karte, "ohne kcal: 'kcal fehlt': " + karte.replace("\n", " "))
    if erw["gericht"]["status"] == "idee":
        rec.pruefe("F19", "Idee" in karte, "nur Name: als Idee gekennzeichnet")
        app.tab("plan")
        app.t("day-0-name").click()
        app.t("chooser-suche").fill(erw["gericht"]["name"])
        app.page.wait_for_timeout(200)
        rec.pruefe("F19", app.da("chooser-leer"), "Idee ist nicht auswaehlbar und nicht im Vorschlag")
    else:
        app.tab("plan")
        app.t("day-0-name").click()
        app.t("chooser-suche").fill(erw["gericht"]["name"])
        app.page.wait_for_timeout(200)
        rec.pruefe("F19", not app.da("chooser-leer"), "fertiges Gericht ist auswaehlbar")
        app.page.locator('[data-testid="chooser-liste"] button').first.click()
        app.gespeichert()
        z = [e["text"] for e in app.einkauf()]
        rec.pruefe("F19", len(z) >= len(erw["zutaten"]) - 1 and any(erw["zutaten"][0]["name"] in t for t in z), "Zutaten landen auf dem Einkaufszettel: " + ", ".join(z[:3]))


def test_f19_formatpruefer_findet_fehler(lab):
    """Der Pruefer darf nicht alles durchlassen."""
    rec = lab.rec
    g = {"id": "G001", "name": "x", "basis_portionen": 2, "kcal_pro_portion": "", "tags": "", "favorit": "nein", "nie_wieder": "nein", "aktiv": "ja",
         "reicht_fuer_tage": 1, "schritte": "", "quelle": "", "angelegt_am": "2026-11-14", "status": "fertig"}
    z = [{"gericht_id": "G001", "pos": 1, "name": "Ei", "menge": 2, "einheit": "Stück", "einkaufen": "ja"}]
    rec.gleich("F19", vir.validate([g], z), [], "gueltige Zeilen werden akzeptiert")
    faelle = {
        "kcal 0": ({**g, "kcal_pro_portion": 0}, z, "kcal"),
        "id falsch": ({**g, "id": "7"}, z, "id muss G"),
        "name leer": ({**g, "name": " "}, z, "name fehlt"),
        "Portionen 0": ({**g, "basis_portionen": 0}, z, "basis_portionen"),
        "fertig ohne Zutaten": (g, [], "keine Zutaten"),
        "idee mit Zutaten": ({**g, "status": "idee"}, z, "status idee"),
        "pos-Luecke": (g, [{**z[0]}, {**z[0], "pos": 3}], "lueckenlos"),
        "falsche Einheit": (g, [{**z[0], "einheit": "Handvoll"}], "einheit"),
        "Menge Text": (g, [{**z[0], "menge": "viel"}], "menge"),
        "Zutat ohne Gericht": (g, z + [{**z[0], "gericht_id": "G009", "pos": 1}], "gibt es nicht"),
        "ja/nein falsch": ({**g, "aktiv": "vielleicht"}, z, "aktiv"),
        "Datum falsch": ({**g, "angelegt_am": "14.11.26"}, z, "angelegt_am"),
    }
    for name, (gg, zz, such) in faelle.items():
        f = vir.validate([gg], zz)
        rec.pruefe("F19", any(such in x for x in f), f"Pruefer meldet '{name}': {f[:1]}")


# ---------------------------------------------------------------- F22
def wuerfel_mit_bewertbar(app, p):
    app.start_setzen(p["start"])
    app.wuerfeln()


def test_f22_bewerten_ueberschreiben_zukunft(lab):
    rec = lab.rec
    p, m, app = profil(lab, "anna")
    wuerfel_mit_bewertbar(app, p)
    app.tab("einstellungen")
    app.t("einst-name").fill("René")
    app.t("einst-name").blur()
    app.tab("plan")
    rec.schritt("zukuenftiger Tag")
    rec.pruefe("F22", app.da("day-1-bewerten-spaeter") and not app.da("day-1-stern-1"), "Tag 2 (Zukunft): keine Sterne, Hinweis: " + app.text("day-1-bewerten-spaeter"))
    rec.pruefe("F22", app.da("day-0-stern-5"), "heutiger Tag: Sterne 1 bis 5 vorhanden")
    rec.pruefe("F22", app.t("day-0-bewertung-speichern").is_disabled(), "Speichern erst nach Sternwahl moeglich")
    gid = app.plan_gespeichert(p["start"])[0][1]
    n0 = len(m.tab("Bewertungen"))
    rec.schritt("4 Sterne mit Notiz")
    app.t("day-0-stern-4").click()
    app.t("day-0-notiz").fill("lecker, aber etwas salzig")
    rec.shot(app.page, "bewertung_eingabe")
    app.t("day-0-bewertung-speichern").click()
    app.page.wait_for_function("document.querySelector('[data-testid=day-0-bewertung-status]').innerText.startsWith('Gespeichert')")
    zeilen = [b for b in m.tab("Bewertungen") if b["gericht_id"] == gid and str(b["datum"])[:10] == p["start"]]
    rec.gleich("F22", len(m.tab("Bewertungen")), n0 + 1, "genau eine Zeile im Tab Bewertungen")
    rec.gleich("F22", (zeilen[0]["sterne"], zeilen[0]["notiz"], zeilen[0]["von"]), (4, "lecker, aber etwas salzig", "René"), "Sterne, Notiz und Name gespeichert")
    rec.schritt("erneut bewerten am selben Tag")
    app.t("day-0-stern-2").click()
    app.t("day-0-notiz").fill("doch nicht so gut")
    app.t("day-0-bewertung-speichern").click()
    app.page.wait_for_function("document.querySelector('[data-testid=day-0-bewertung-status]').innerText.includes('doch nicht')")
    zeilen = [b for b in m.tab("Bewertungen") if b["gericht_id"] == gid and str(b["datum"])[:10] == p["start"]]
    rec.gleich("F22", (len(m.tab("Bewertungen")), len(zeilen), zeilen[0]["sterne"], zeilen[0]["notiz"]), (n0 + 1, 1, 2, "doch nicht so gut"), "gleicher Tag und gleiche Person ueberschreibt, keine zweite Zeile")
    rec.schritt("nach Neuladen")
    app.neu_laden()
    rec.pruefe("F22", "★★☆☆☆" in app.text("day-0-bewertung-status") or "2" in app.text("day-0-bewertung-status"), "Bewertung ist nach dem Neuladen da: " + app.text("day-0-bewertung-status"))
    rec.shot(app.page, "bewertet")


def test_f22_zwei_personen_getrennt(lab):
    rec = lab.rec
    p, m, a = profil(lab, "anna")
    wuerfel_mit_bewertbar(a, p)
    a.tab("einstellungen")
    a.t("einst-name").fill("René")
    a.t("einst-name").blur()
    a.tab("plan")
    b = lab.geraet(m, "ipad", jetzt=p["start"] + "T20:00:00Z")
    b.tab("einstellungen")
    b.t("einst-name").fill("Franziska")
    b.t("einst-name").blur()
    b.tab("plan")
    gid = a.plan_gespeichert(p["start"])[0][1]
    for ap, sterne, notiz in ((a, 5, "super"), (b, 3, "ok")):
        ap.t(f"day-0-stern-{sterne}").click()
        ap.t("day-0-notiz").fill(notiz)
        ap.t("day-0-bewertung-speichern").click()
        ap.page.wait_for_function("document.querySelector('[data-testid=day-0-bewertung-status]').innerText.startsWith('Gespeichert')")
    zeilen = sorted([(x["von"], x["sterne"]) for x in m.tab("Bewertungen") if x["gericht_id"] == gid and str(x["datum"])[:10] == p["start"]])
    rec.gleich("F22", zeilen, [("Franziska", 3), ("René", 5)], "beide bewerten dasselbe Gericht am selben Tag getrennt")
    rec.shot(b.page, "zweite_person")


def test_f22_vergangener_tag(lab):
    rec = lab.rec
    p, m, app = profil(lab, "anna", jetzt="2026-11-14T08:30:00Z")
    app.start_setzen("2026-11-12")
    app.wuerfeln()
    rec.pruefe("F22", all(app.da(f"day-{i}-stern-3") for i in (0, 1, 2)), "Tage 12., 13., 14.11. (heute und frueher) sind bewertbar")
    rec.pruefe("F22", all(app.da(f"day-{i}-bewerten-spaeter") for i in (3, 4, 5, 6)), "Tage ab 15.11. sind nicht bewertbar")
    app.t("day-0-stern-1").click()
    app.t("day-0-bewertung-speichern").click()
    app.page.wait_for_function("document.querySelector('[data-testid=day-0-bewertung-status]').innerText.startsWith('Gespeichert')")
    rec.pruefe("F22", any(str(x["datum"])[:10] == "2026-11-12" and x["sterne"] == 1 for x in m.tab("Bewertungen")), "Bewertung fuer 12.11. im Sheet")


def test_f22_durchschnitt_und_anzahl_wie_orakel(lab):
    rec = lab.rec
    p, m, app = profil(lab, "ben_clara")
    norm = norm_von(p["datei"])
    stats = __import__("oracle").rating_stats(norm)
    namen = {g["id"]: g["name"] for g in norm["gerichte"]}
    wahl = [gid for gid, s in stats.items() if s["anzahl"] >= 3][:2] + [gid for gid, s in stats.items() if s["anzahl"] == 1][:1]
    rec.pruefe("F22", len(wahl) == 3, "Testdaten liefern Gerichte mit mehreren und mit einer Bewertung")
    app.start_setzen(p["start"])
    for i, gid in enumerate(wahl):
        app.t(f"day-{i}-name").click()
        app.t("chooser-suche").fill(namen[gid])
        app.page.wait_for_timeout(150)
        if app.page.locator('[data-testid="chooser-liste"] button').count() > 1:  # Namensdubletten: genau die richtige id waehlen
            idx = [t.split("\n")[0] for t in app.page.locator('[data-testid="chooser-liste"] button').all_inner_texts()]
        app.page.locator('[data-testid="chooser-liste"] button').first.click()
    app.gespeichert()
    plan = app.plan_gespeichert(p["start"])
    rec.schritt("Anzeige gegen Orakel")
    for i, (datum, gid, *_r) in enumerate(plan):
        s = stats.get(gid)
        text = app.text(f"day-{i}-schnitt")
        if s:
            soll = f"Ø {str(round(float(s['durchschnitt']) + 1e-9, 1)).replace('.', ',').replace(',0', '')} ({s['anzahl']})"
            rec.gleich("F22", text, soll, f"Durchschnitt und Anzahl fuer {namen[gid]}")
        else:
            rec.pruefe("F22", text is None, f"ohne Bewertung keine Anzeige fuer {namen[gid]}")
    rec.schritt("eine neue Bewertung veraendert Durchschnitt und Anzahl")
    gid0 = plan[0][1]
    app.t("day-0-stern-1").click()
    app.t("day-0-bewertung-speichern").click()
    app.page.wait_for_function("document.querySelector('[data-testid=day-0-bewertung-status]').innerText.startsWith('Gespeichert')")
    alle = [b for b in m.tab("Bewertungen") if b["gericht_id"] == gid0]
    avg = sum(b["sterne"] for b in alle) / len(alle)
    soll = f"Ø {str(round(avg + 1e-9, 1)).replace('.', ',').replace(',0', '')} ({len(alle)})"
    rec.gleich("F22", app.text("day-0-schnitt"), soll, "Anzeige nach der neuen Bewertung stimmt mit dem Sheet ueberein")
    rec.shot(app.page, "durchschnitt")


# ---------------------------------------------------------------- F23
def test_f23_rangliste_gegen_orakel(lab):
    rec = lab.rec
    p, m, app = profil(lab, "ben_clara")
    norm = norm_von(p["datei"])
    rk = __import__("oracle").ranking(norm)
    app.tab("rangliste")
    app.page.wait_for_selector('[data-testid="beste"]')
    ids = lambda sec: [e.get_attribute("data-id") for e in app.page.locator(f'[data-testid="{sec}-eintrag"]').all()]
    rec.gleich("F23", ids("beste"), rk["beste"], "beste Gerichte in der Reihenfolge des Orakels")
    rec.gleich("F23", ids("schwaechste"), rk["schwaechste"], "schwaechste Gerichte in der Reihenfolge des Orakels")
    rec.pruefe("F23", all(r["anzahl"] >= 2 for r in rk["alle"]), "nur Gerichte mit mindestens 2 Bewertungen")
    einzel = [g for g, s in __import__("oracle").rating_stats(norm).items() if s["anzahl"] == 1]
    rec.pruefe("F23", einzel and not any(i in ids("beste") + ids("schwaechste") for i in einzel), "Gericht mit nur einer Bewertung steht nicht in der Rangliste")
    top = app.t("beste-eintrag").first.inner_text().replace("\n", " ")
    d0 = rk["alle"][0]["durchschnitt"]
    rec.pruefe("F23", f"Ø {str(round(d0, 1)).replace('.', ',')}" in top and f"{rk['alle'][0]['anzahl']} Bewertungen" in top, "Zeile zeigt Durchschnitt und Anzahl: " + top)
    rec.pruefe("F23", f"({len(rk['alle'])})" in app.text("rangliste-alle"), "Liste 'Alle bewerteten Gerichte' nennt " + str(len(rk["alle"])))
    rec.shot(app.page, "rangliste")


def test_f23_rangliste_leer_und_waechst(lab):
    rec = lab.rec
    p, m, app = profil(lab, "anna")
    # Anna hat Testdaten mit Bewertungen; fuer 'leer' ein leeres Sheet mit Gerichten verwenden
    m2 = lab.mock("edge_noingredients.xlsx")
    b = lab.geraet(m2, "iphone")
    rec.gleich("F23", len(m2.tab("Bewertungen")), 0, "Vorbedingung: die Datei hat keine Bewertungen")
    b.tab("rangliste")
    rec.pruefe("F23", b.da("rangliste-leer"), "ohne Bewertungen: Hinweis statt leerer Seite: " + (b.text("rangliste-leer") or "").replace("\n", " "))
    rec.shot(b.page, "rangliste_leer")
    a, c = [g["id"] for g in m2.tab("Gerichte")][:2]

    def aktualisieren():
        b.t("btn-aktualisieren").click()
        b.page.wait_for_function("!window.__kp.app.state.loading")

    rec.schritt("eine Bewertung genuegt noch nicht (Rangliste ab 2 Bewertungen je Gericht)")
    m2.api("bewertung_speichern", gericht_id=a, datum="2026-11-10", sterne=5, von="Anna")
    aktualisieren()
    rec.pruefe("F23", b.da("rangliste-leer"), "mit einer Bewertung noch leer")
    rec.schritt("zweite Bewertung: das Gericht erscheint")
    m2.api("bewertung_speichern", gericht_id=a, datum="2026-11-11", sterne=4, von="Ben")
    aktualisieren()
    rec.pruefe("F23", not b.da("rangliste-leer") and b.da("beste"), "mit zwei Bewertungen erscheint die Rangliste")
    rec.gleich("F23", b.page.locator('[data-testid="beste-eintrag"]').first.get_attribute("data-id"), a, "das Gericht steht bei den besten")
    rec.pruefe("F23", "4,5" in b.text("beste") and "2 Bewertungen" in b.text("beste"), "Durchschnitt 4,5 aus 2 Bewertungen: " + b.text("beste").replace("\n", " "))
    rec.schritt("zweites Gericht schlecht bewertet: die Rangliste waechst und sortiert")
    m2.api("bewertung_speichern", gericht_id=c, datum="2026-11-10", sterne=1, von="Anna")
    m2.api("bewertung_speichern", gericht_id=c, datum="2026-11-11", sterne=2, von="Ben")
    aktualisieren()
    rec.pruefe("F23", "(2)" in b.text("rangliste-alle").splitlines()[0], "alle bewerteten Gerichte: " + b.text("rangliste-alle").splitlines()[0])
    rec.gleich("F23", b.page.locator('[data-testid="beste-eintrag"]').first.get_attribute("data-id"), a, "bestes Gericht bleibt das mit Durchschnitt 4,5")
    rec.gleich("F23", b.page.locator('[data-testid="schwaechste-eintrag"]').first.get_attribute("data-id"), c, "schwaechstes Gericht ist das mit Durchschnitt 1,5")
    rec.shot(b.page, "rangliste_waechst")


def test_f23_gewichtung_im_browser_1000_laeufe(lab):
    """Shuffle-Gewichte mit der echten Browser-Logik: 1000 Vorschlaege mit festem Seed."""
    rec = lab.rec
    m = lab.mock("kochplaner_test.xlsx")
    app = lab.geraet(m, "iphone", seed=2026)
    norm = norm_von("kochplaner_test.xlsx")
    gew = __import__("oracle").weights(norm)
    zaehler = app.page.evaluate("""() => {
      const app = window.__kp.app, z = {};
      for (let i = 0; i < 1000; i++) { app.shuffleAll(); for (const s of app.state.slots) z[s.gericht_id] = (z[s.gericht_id] || 0) + 1; }
      return z; }""")
    ok = [g for g in norm["gerichte"] if g["aktiv"] and g["status"] == "fertig" and not g["nie_wieder"]]

    def avg(gs):
        return sum(zaehler.get(g["id"], 0) for g in gs) / len(gs)
    klassen = {w: [g for g in ok if gew[g["id"]] == w] for w in sorted({gew[g["id"]] for g in ok})}
    rec.pruefe("F23", 1.0 in klassen and any(w >= 2 for w in klassen) and 0.5 in klassen, "Gewichtsklassen (Gewicht: Anzahl Gerichte): " + ", ".join(f"{w}: {len(v)}" for w, v in klassen.items()))
    basis = avg(klassen[1.0])
    for w, gs in klassen.items():
        r = avg(gs) / basis
        if w >= 2:
            rec.pruefe("F23", r >= 1.5, f"Gewicht {w} (Favorit, ggf. gut bewertet): {r:.2f}-mal so oft wie unbewertete Gerichte (Soll mindestens 1,5)")
        elif w == 1.5:
            rec.pruefe("F23", r >= 1.2, f"Gewicht 1,5 (Durchschnitt ab 4): {r:.2f}-mal so oft (Soll Richtung 1,5)")
        elif w == 0.5:
            rec.pruefe("F23", r <= 0.75, f"Gewicht 0,5 (Durchschnitt bis 2): {r:.2f}-mal so oft (Soll hoechstens 0,75)")
        elif w == 1.0:
            rec.pruefe("F23", basis > 0, f"Basis: {basis:.1f} Auswahlen je unbewertetem Gericht in 1000 Laeufen (muss groesser als 0 sein)")
    nie = [g["id"] for g in norm["gerichte"] if g["nie_wieder"]]
    rec.pruefe("F23", not any(zaehler.get(i) for i in nie), "nie_wieder kommt in 1000 Laeufen kein einziges Mal vor")
    inakt = [g["id"] for g in norm["gerichte"] if not g["aktiv"] or g["status"] == "idee"]
    rec.pruefe("F23", not any(zaehler.get(i) for i in inakt), "archivierte Gerichte und Ideen kommen nie vor")
