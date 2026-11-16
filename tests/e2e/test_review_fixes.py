"""Tests zu den Befunden der unabhaengigen Pruefung (docs/REVIEW.md): B1, B3, B4, B5, B8, B9."""
import kp
from kp import PROFILE

SCHNELL = {"timeoutMs": 1200, "retryDelayMs": 50}


def anna(lab, art="iphone", **kw):
    p = PROFILE["anna"]
    m = lab.mock(p["datei"])
    return p, m, lab.geraet(m, art, jetzt=p["start"] + "T07:00:00Z", **kw)


def formular_neu(app):
    app.tab("gerichte")
    app.t("btn-neues-gericht").click()
    app.page.wait_for_selector('[data-testid="gericht-name"]')


def gericht(m, name):
    return [g for g in m.tab("Gerichte") if g["name"] == name]


def test_b1_kein_tag_leeren_im_auswahlfenster(lab):
    rec = lab.rec
    p, m, app = anna(lab)
    app.start_setzen(p["start"])
    app.wuerfeln()
    app.t("day-2-name").click()
    app.page.wait_for_selector('[data-testid="chooser"]')
    rec.pruefe("F03", app.da("chooser-wuerfeln"), "Auswahlfenster bietet Neu wuerfeln")
    rec.pruefe("F03", not app.da("chooser-leeren"), "es gibt keinen Knopf Tag leeren (der haette nie ins Sheet geschrieben)")
    rec.pruefe("F03", "Tag leeren" not in app.page.inner_text('[data-testid="chooser"]'), "auch kein Text Tag leeren")


def test_b4_text_im_schnellfeld_wird_beim_speichern_uebernommen(lab):
    rec = lab.rec
    p, m, app = anna(lab)
    n = len(m.tab("Gerichte"))
    formular_neu(app)
    app.t("gericht-name").fill("Schnellfeld-Auflauf")
    app.t("zutaten-schnell").fill("200 g Nudeln\n1,5 l Milch\n2 Eier")
    rec.schritt("direkt Speichern, ohne Zutaten erkennen zu druecken")
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_selector('[data-testid="gerichte-liste"]')
    g = gericht(m, "Schnellfeld-Auflauf")
    rec.gleich("F12", len(g), 1, "Gericht angelegt")
    z = sorted([z for z in m.tab("Zutaten") if z["gericht_id"] == g[0]["id"]], key=lambda z: z["pos"])
    rec.gleich("F12", [x["name"] for x in z], ["Nudeln", "Milch", "Eier"], "alle drei Zutaten aus dem Schnellfeld gespeichert")
    rec.gleich("F12", g[0]["status"], "fertig", "Status fertig, nicht Idee")
    rec.gleich("F12", len(m.tab("Gerichte")), n + 1, "genau eine neue Zeile")


def test_b4_unklare_zeile_haelt_das_speichern_an(lab):
    rec = lab.rec
    p, m, app = anna(lab)
    n = len(m.tab("Gerichte"))
    formular_neu(app)
    app.t("gericht-name").fill("Mehl-Test")
    app.t("zutaten-schnell").fill("1.500 g Mehl\n2 Eier")
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_selector('[data-testid="zutat-0-unklar"]')
    rec.pruefe("F12", "nicht eindeutig" in app.text("zutat-0-unklar"), "1.500 wird als unklar markiert: " + app.text("zutat-0-unklar"))
    rec.pruefe("F12", "prüfen" in app.text("form-meldung"), "Meldung bittet um Pruefung: " + app.text("form-meldung"))
    rec.gleich("F12", len(m.tab("Gerichte")), n, "noch nichts gespeichert")
    rec.gleich("F12", app.hash(), "#/gericht/neu", "Formular bleibt offen")
    rec.schritt("Menge korrigieren, dann Speichern")
    app.t("zutat-0-menge").fill("1500")
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_selector('[data-testid="gerichte-liste"]')
    g = gericht(m, "Mehl-Test")[0]
    z = sorted([z for z in m.tab("Zutaten") if z["gericht_id"] == g["id"]], key=lambda z: z["pos"])
    rec.gleich("F12", [(x["name"], x["menge"], x["einheit"]) for x in z], [("Mehl", 1500, "g"), ("Eier", 2, "Stück")], "korrigierte Menge gespeichert")


def test_b5_entwurf_bleibt_bei_tabwechsel_und_neuladen(lab):
    rec = lab.rec
    p, m, app = anna(lab)
    formular_neu(app)
    app.t("gericht-name").fill("Entwurf-Eintopf")
    app.t("gericht-tags").fill("Eintopf")
    app.t("zutaten-schnell").fill("2 Karotten")
    app.t("btn-zutaten-erkennen").click()
    app.t("zutaten-schnell").fill("1 Zwiebel")
    rec.schritt("auf Plan wechseln und zurueck")
    app.tab("plan")
    formular_neu(app)
    rec.gleich("F11", app.t("gericht-name").input_value(), "Entwurf-Eintopf", "Name ist nach dem Tabwechsel noch da")
    rec.gleich("F11", app.t("zutat-0-name").input_value(), "Karotten", "erkannte Zutat ist noch da")
    rec.gleich("F11", app.t("zutaten-schnell").input_value(), "1 Zwiebel", "auch der noch nicht erkannte Text im Schnellfeld")
    rec.pruefe("F11", app.da("entwurf-hinweis"), "Hinweis: Entwurf wiederhergestellt")
    rec.shot(app.page, "entwurf_wiederhergestellt")
    rec.schritt("App neu laden (iOS beendet sie im Hintergrund)")
    app.neu_laden()
    formular_neu(app)
    rec.gleich("F11", (app.t("gericht-name").input_value(), app.t("gericht-tags").input_value()), ("Entwurf-Eintopf", "Eintopf"), "Entwurf ueberlebt das Neuladen")
    rec.schritt("Verwerfen")
    app.t("btn-entwurf-verwerfen").click()
    app.page.wait_for_function("document.querySelector('[data-testid=gericht-name]').value === ''")
    rec.pruefe("F11", not app.da("entwurf-hinweis"), "nach Verwerfen kein Hinweis mehr")
    rec.schritt("neuen Entwurf anlegen und speichern: danach ist kein Entwurf mehr da")
    app.t("gericht-name").fill("Gespeichertes Gericht")
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_selector('[data-testid="gerichte-liste"]')
    formular_neu(app)
    rec.gleich("F11", app.t("gericht-name").input_value(), "", "nach erfolgreichem Speichern beginnt das Formular leer")
    rec.schritt("Abbrechen verwirft den Entwurf")
    app.t("gericht-name").fill("Wird abgebrochen")
    app.t("btn-abbrechen").click()
    formular_neu(app)
    rec.gleich("F11", app.t("gericht-name").input_value(), "", "nach Abbrechen beginnt das Formular leer")


def test_b8_verlorene_antwort_legt_kein_doppel_an(lab):
    rec = lab.rec
    p, m, app = anna(lab, hooks=SCHNELL)
    app.erlaubt = True
    n = len(m.tab("Gerichte"))
    formular_neu(app)
    app.t("gericht-name").fill("Doppel-Test-Suppe")
    app.t("zutaten-schnell").fill("2 Karotten")
    app.t("btn-zutaten-erkennen").click()
    m.fehler("verloren", 1, 3000)
    rec.schritt("Speichern: Server schreibt, Antwort kommt nie an")
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_function("document.querySelector('[data-testid=form-meldung]').innerText.includes('Nicht gespeichert')", timeout=10000)
    rec.gleich("F16", len(gericht(m, "Doppel-Test-Suppe")), 1, "im Sheet steht das Gericht schon, obwohl die App Fehler meldet")
    rec.schritt("zusaetzliche Zutat, zweiter Versuch")
    app.t("zutaten-schnell").fill("1 Zwiebel")
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_selector('[data-testid="gerichte-liste"]')
    g = gericht(m, "Doppel-Test-Suppe")
    rec.gleich("F16", len(g), 1, "nach dem zweiten Versuch immer noch genau ein Gericht")
    rec.gleich("F16", len(m.tab("Gerichte")), n + 1, "nur eine neue Zeile in Gerichte")
    z = sorted([z for z in m.tab("Zutaten") if z["gericht_id"] == g[0]["id"]], key=lambda z: z["pos"])
    rec.gleich("F16", [x["name"] for x in z], ["Karotten", "Zwiebel"], "Zutaten aus dem zweiten Versuch ersetzen die des ersten (ohne Doppel)")
    rec.gleich("F16", g[0]["status"], "fertig", "Status passt zu den Zutaten")
    aufrufe = [e for e in m.log() if e.get("aktion") == "gericht_speichern"]
    rec.gleich("F16", len(aufrufe), 2, "zwei Schreibaufrufe, ein Gericht")


def test_b3_neu_verbinden_behaelt_ungespeicherten_plan(lab):
    rec = lab.rec
    p, m, app = anna(lab, hooks=SCHNELL)
    app.erlaubt = True
    app.start_setzen(p["start"])
    rec.schritt("Schreiben scheitert mit falschem Token")
    m.fehler("token", None)
    app.t("btn-shuffle").click()
    app.page.wait_for_selector('[data-testid="banner-offen"]', timeout=10000)
    tage = app.tage()
    rec.pruefe("F16", all(t["name"] != "Gericht wählen" for t in tage), "Plan steht auf dem Bildschirm")
    rec.gleich("F16", len(m.plan(p["start"])), 0, "nichts im Sheet")
    rec.schritt("Fehler behoben, Setup-Code erneut einfuegen")
    m.fehler_aus()
    app.tab("einstellungen")
    app.t("setup-code").fill(m.code)
    app.t("btn-verbinden").click()
    app.page.wait_for_function("window.__kp.app.state.planDirty === false && window.__kp.app.state.pending.length === 0", timeout=10000)
    rec.gleich("F16", len(m.plan(p["start"])), 7, "Plan wurde nach dem Verbinden gespeichert")
    app.tab("plan")
    rec.gleich("F16", app.tage(), tage, "der Plan auf dem Bildschirm ist unveraendert derselbe")
    ansicht, _ = kp.erwartete_ansicht(p["datei"], p["start"], m.plan(p["start"]))
    rec.gleich("F16", [a["name"] for a in ansicht], [t["name"] for t in tage], "gespeichert ist genau das, was auf dem Bildschirm stand")


def test_b9_fokus_im_notizfeld_bleibt_bei_aktualisierung(lab):
    rec = lab.rec
    p, m, app = anna(lab)
    app.start_setzen(p["start"])
    app.wuerfeln()
    app.page.wait_for_selector('[data-testid="day-0-notiz"]')
    app.t("day-0-notiz").click()
    app.page.keyboard.type("lecker")
    rec.schritt("Hintergrund-Aktualisierung (Neuaufbau der Liste) waehrend des Tippens")
    app.page.evaluate("window.__kp.app.emit()")
    aktiv = app.page.evaluate("""() => { const e = document.activeElement; return { id: e.dataset.testid, wert: e.value, s: e.selectionStart, e: e.selectionEnd }; }""")
    rec.gleich("F22", (aktiv["id"], aktiv["wert"]), ("day-0-notiz", "lecker"), "Fokus und Text im Notizfeld bleiben erhalten")
    rec.gleich("F22", (aktiv["s"], aktiv["e"]), (6, 6), "Schreibmarke steht am Ende des Textes")
    app.page.keyboard.type("!")
    rec.gleich("F22", app.t("day-0-notiz").input_value(), "lecker!", "es laesst sich ohne neues Antippen weitertippen")
