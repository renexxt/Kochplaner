"""F15 Setup und weitere Geraete, F16 Fehlerfaelle, F17 Offline lesen."""
import json
import re

import pytest

import kp
from kp import PROFILE, norm_von, setup_code, TOKEN

SCHNELL = {"timeoutMs": 1200, "retryDelayMs": 50}


def profil(lab, pid="ben_clara", art="iphone", **kw):
    p = PROFILE[pid]
    m = lab.mock(p["datei"])
    app = lab.geraet(m, art, jetzt=p["start"] + "T07:00:00Z", **kw)
    return p, m, app


# ---------------------------------------------------------------- F15
def test_f15_setup_code_anzeigen_und_zweites_geraet(lab):
    rec = lab.rec
    p, m, a = profil(lab)
    a.start_setzen(p["start"])
    a.wuerfeln()
    rec.schritt("Einstellungen: Setup-Code anzeigen")
    a.tab("einstellungen")
    rec.pruefe("F15", "Verbunden mit 127.0.0.1" in a.text("verbunden"), "Verbindungsstatus: " + a.text("verbunden"))
    a.t("btn-code-zeigen").click()
    code = a.t("setup-code-anzeige").input_value()
    roh = json.loads(__import__("base64").urlsafe_b64decode(code[4:] + "=" * (-len(code[4:]) % 4)))
    rec.gleich("F15", (code[:4], roh["u"], roh["t"]), ("KP1.", m.base + "/exec", TOKEN), "Code enthaelt Adresse und Token")
    rec.shot(a.page, "setup_code")
    rec.schritt("zweites Geraet: frischer Kontext, nur dieser Code")
    b = lab.geraet(m, "ipad", verbunden=False, jetzt=p["start"] + "T20:00:00Z")
    b.verbinden(code)
    a.tab("plan")
    rec.gleich("F15", b.tage(), a.tage(), "derselbe Plan (7 Tage, Portionen, Fixierung)")
    b.tab("gerichte")
    a.tab("gerichte")
    rec.gleich("F15", b.text("gerichte-anzahl"), a.text("gerichte-anzahl"), "dieselben Gerichte")
    names = lambda ap: [x.split("\n")[0] for x in ap.page.locator('[data-testid="gericht"] .dish-title').all_inner_texts()]
    rec.gleich("F15", names(b), names(a), "dieselbe Gerichteliste")
    rec.shot(b.page, "zweites_geraet_gerichte")
    rec.schritt("Aenderung auf Geraet 2 erscheint auf Geraet 1 nach Aktualisieren")
    b.tab("plan")
    b.t("day-1-plus").click()
    b.gespeichert()
    a.tab("plan")
    a.t("btn-aktualisieren").click()
    a.page.wait_for_function("document.querySelector('[data-testid=day-1-portionen]').innerText === '3'")
    rec.gleich("F15", a.tage()[1]["portionen"], 3, "Aenderung des zweiten Geraets ist beim ersten sichtbar")


@pytest.mark.parametrize("variante", ["leerzeichen_umbruch", "anfuehrungszeichen", "adresse_token"])
def test_f15_code_toleranz(lab, variante):
    rec = lab.rec
    m = lab.mock()
    app = lab.geraet(m, "iphone", verbunden=False)
    code = m.code
    eingabe = {"leerzeichen_umbruch": "  " + code[:20] + "\n" + code[20:] + "  \n", "anfuehrungszeichen": "„" + code + "“",
               "adresse_token": f"{m.base}/exec {TOKEN}"}[variante]
    rec.schritt("Code mit typischen Einfuege-Fehlern: " + variante)
    app.page.goto(m.base + "/index.html")
    app.t("setup-code").fill(eingabe)
    app.t("btn-verbinden").click()
    app.page.wait_for_selector('[data-testid="day-0"]')
    rec.pruefe("F15", app.da("day-0") and not app.da("setup-noetig") and app.hash() == "#/plan", "Verbinden klappt trotz " + variante + ": Plan ist zu sehen")
    rec.pruefe("F15", "Verbunden" in (app.text("toast") or ""), "Rueckmeldung: " + str(app.text("toast")))


@pytest.mark.parametrize("fall,eingabe,erwartet", [
    ("muell", "quatsch", "Setup-Code ist nicht gültig"),
    ("leer", "", "Setup-Code"),
    ("http", setup_code("http://example.com/exec"), "https://"),
    ("kurzes_token", setup_code("https://script.google.com/macros/s/X/exec", "zu-kurz"), "Zugangsschlüssel"),
    ("falsches_token", None, "Zugangsschlüssel stimmt nicht"),
    ("adresse_nicht_erreichbar", setup_code("http://127.0.0.1:9/exec"), "Keine Verbindung"),
])
def test_f15_falscher_code_deutsche_meldung(lab, fall, eingabe, erwartet):
    rec = lab.rec
    m = lab.mock()
    app = lab.geraet(m, "iphone", verbunden=False, hooks=SCHNELL)
    app.erlaubt = True
    if fall == "falsches_token":
        eingabe = setup_code(m.base + "/exec", "falsch" + "x" * 30)
    rec.schritt("Eingabe: " + fall)
    app.page.goto(m.base + "/index.html")
    app.t("setup-code").fill(eingabe)
    app.t("btn-verbinden").click()
    app.page.wait_for_selector('[data-testid="verbinden-meldung"]')
    meldung = app.text("verbinden-meldung")
    rec.pruefe("F15", erwartet in meldung, f"deutsche Fehlermeldung: {meldung}")
    rec.pruefe("F15", not re.search(r"[A-Z_]{6,}|undefined|Error|TypeError", meldung), "keine technischen Begriffe in der Meldung")
    rec.pruefe("F15", app.da("setup-code") and all(app.seite_ok().values()), "Seite bleibt bedienbar, nichts verbunden")
    rec.shot(app.page, "fehlermeldung_" + fall)


def test_f15_verbindung_trennen(lab):
    rec = lab.rec
    p, m, app = profil(lab, "anna")
    app.tab("einstellungen")
    app.page.once("dialog", lambda d: d.accept())
    app.t("btn-trennen").click()
    app.page.wait_for_selector('[data-testid="setup-code"]')
    rec.pruefe("F15", not app.da("verbunden"), "nach dem Trennen wieder Eingabe fuer den Setup-Code")
    rec.pruefe("F15", len(m.tab("Gerichte")) == 40, "Daten im Sheet bleiben unberuehrt")
    rec.gleich("F15", app.page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('kp.'))"), ["kp.prefs"] if app.page.evaluate("!!localStorage.getItem('kp.prefs')") else [], "lokale Daten (Setup, Zwischenspeicher, Plan, Haken) sind geloescht")
    app.tab("plan")
    rec.pruefe("F15", "Setup-Code" in app.page.inner_text("main"), "Plan weist auf den fehlenden Setup-Code hin statt weisser Seite")


# ---------------------------------------------------------------- F16
def test_f16_schnittstelle_fehler_beim_lesen(lab):
    rec = lab.rec
    p, m, app = profil(lab, hooks=SCHNELL)
    app.erlaubt = True
    app.start_setzen(p["start"])
    app.wuerfeln()
    vor = app.tage()
    sync0 = app.text("sync-zeit")
    for modus, text in (("http500", "Google meldet einen Fehler"), ("kaputt", "nicht lesbar"), ("token", "Zugangsschlüssel stimmt nicht"), ("timeout", "antwortet gerade nicht")):
        rec.schritt(f"Fehler {modus} beim Aktualisieren")
        m.fehler(modus, None, 5000 if modus == "timeout" else None)
        app.t("btn-aktualisieren").click()
        app.page.wait_for_selector('[data-testid="banner-fehler"]', timeout=10000)
        meldung = app.text("banner-fehler")
        rec.pruefe("F16", text in meldung, f"{modus}: verstaendliche deutsche Meldung: {meldung.splitlines()[0]}")
        rec.pruefe("F16", "Angezeigt wird der Stand von" in meldung, "Meldung nennt, dass der letzte Stand angezeigt wird")
        rec.gleich("F16", app.tage(), vor, "Plan bleibt sichtbar (kein weisser Bildschirm, keine Daten weg)")
        rec.pruefe("F16", all(app.seite_ok().values()), "Seite vollstaendig dargestellt")
        if modus == "http500":
            rec.shot(app.page, "banner_fehler")
        m.fehler_aus()
        app.t("banner-neu-laden").click()
        app.page.wait_for_function("!document.querySelector('[data-testid=banner-fehler]')", timeout=10000)
        rec.pruefe("F16", not app.da("banner-fehler") and app.da("sync-zeit"), "'Erneut versuchen' behebt den Fehler, Banner verschwindet")
        rec.gleich("F16", app.tage(), vor, "nach dem erneuten Versuch derselbe Plan")


def test_f16_schreibfehler_plan_geht_nicht_verloren(lab):
    rec = lab.rec
    p, m, app = profil(lab, hooks=SCHNELL)
    app.erlaubt = True
    app.start_setzen(p["start"])
    rec.schritt("Schreiben schlaegt fehl")
    m.fehler("http500", None)
    app.t("btn-shuffle-alle").click()
    app.page.wait_for_selector('[data-testid="banner-offen"]', timeout=10000)
    tage = app.tage()
    rec.pruefe("F16", all(t["name"] != "Gericht wählen" for t in tage), "Plan bleibt auf dem Bildschirm")
    rec.pruefe("F16", "Nicht gespeichert" in app.text("plan-status"), "Status: " + app.text("plan-status"))
    rec.pruefe("F16", "Nicht gespeichert" in app.text("banner-offen") and "Wiederholen" in app.text("banner-offen"), "Banner mit Wiederholen: " + app.text("banner-offen").replace("\n", " "))
    rec.shot(app.page, "schreibfehler")
    rec.schritt("App neu laden, waehrend der Fehler noch besteht")
    app.neu_laden()
    rec.gleich("F16", app.tage(), tage, "ungespeicherter Plan ueberlebt das Neuladen")
    rec.pruefe("F16", app.da("banner-offen"), "Hinweis auf nicht gespeicherte Aenderungen bleibt")
    rec.schritt("Fehler behoben, Wiederholen")
    m.fehler_aus()
    app.t("banner-wiederholen").click()
    app.page.wait_for_function("!document.querySelector('[data-testid=banner-offen]')", timeout=10000)
    plan = app.plan_gespeichert(p["start"])
    rec.gleich("F16", len(plan), 7, "7 Tage im Sheet")
    ansicht, _ = kp.erwartete_ansicht(p["datei"], p["start"], m.plan(p["start"]))
    rec.gleich("F16", [a["name"] for a in ansicht], [t["name"] for t in tage], "gespeichert ist genau das, was auf dem Bildschirm stand")
    rec.pruefe("F16", len(m.tab("Plan")) == 14 + 7, "keine Doppel, Historie unberuehrt")


def test_f16_schreibfehler_gericht_formular_behaelt_eingaben(lab):
    rec = lab.rec
    p, m, app = profil(lab, "anna", hooks=SCHNELL)
    app.erlaubt = True
    app.tab("gerichte")
    app.t("btn-neues-gericht").click()
    app.t("gericht-name").fill("Fehlertest-Auflauf")
    app.t("zutaten-schnell").fill("200 g Nudeln\n1 Stück Zwiebel")
    app.t("btn-zutaten-erkennen").click()
    n = len(m.tab("Gerichte"))
    m.fehler("http500", 1)
    rec.schritt("Speichern schlaegt einmal fehl")
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_function("document.querySelector('[data-testid=form-meldung]').innerText.includes('Nicht gespeichert')")
    rec.pruefe("F16", "Eingaben sind noch da" in app.text("form-meldung"), "Meldung: " + app.text("form-meldung"))
    rec.gleich("F16", (app.t("gericht-name").input_value(), app.t("zutat-0-name").input_value(), app.t("zutat-1-name").input_value()), ("Fehlertest-Auflauf", "Nudeln", "Zwiebel"), "Eingaben stehen noch im Formular")
    rec.gleich("F16", len(m.tab("Gerichte")), n, "nichts halb geschrieben")
    rec.shot(app.page, "formular_fehler")
    rec.schritt("zweiter Versuch")
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_selector('[data-testid="gerichte-liste"]')
    rec.gleich("F16", len(m.tab("Gerichte")), n + 1, "jetzt genau eine neue Zeile (kein doppeltes Anlegen)")
    rec.gleich("F16", len([z for z in m.tab("Zutaten") if z["gericht_id"] == "G041"]), 2, "beide Zutaten gespeichert")


def test_f16_schreibfehler_bewertung_wiederholen(lab):
    rec = lab.rec
    p, m, app = profil(lab, hooks=SCHNELL)
    app.erlaubt = True
    app.start_setzen(p["start"])
    app.wuerfeln()
    app.t("day-0-stern-4").click()
    app.t("day-0-notiz").fill("lecker")
    m.fehler("http500", None)
    n = len(m.tab("Bewertungen"))
    app.t("day-0-bewertung-speichern").click()
    app.page.wait_for_selector('[data-testid="banner-offen"]', timeout=10000)
    rec.pruefe("F16", "4" in app.text("day-0-bewertung-status") or "★" in app.text("day-0-bewertung-status"), "Bewertung bleibt sichtbar: " + app.text("day-0-bewertung-status"))
    m.fehler_aus()
    app.t("banner-wiederholen").click()
    app.page.wait_for_function("!document.querySelector('[data-testid=banner-offen]')", timeout=10000)
    rec.gleich("F16", len(m.tab("Bewertungen")), n + 1, "nach Wiederholen genau eine neue Bewertung im Sheet")


def test_f16_leeres_sheet(lab):
    rec = lab.rec
    m = lab.mock("edge_empty.xlsx")
    app = lab.geraet(m, "iphone", jetzt="2026-11-14T08:30:00Z")
    rec.schritt("leeres Sheet (nur Kopfzeilen)")
    rec.pruefe("F16", all(app.seite_ok().values()), "Plan wird angezeigt, kein weisser Bildschirm")
    rec.pruefe("F16", app.da("plan-keine-gerichte"), "Hinweis: " + app.text("plan-keine-gerichte"))
    app.t("btn-shuffle-alle").click()
    app.page.wait_for_timeout(500)
    rec.pruefe("F16", all(t["name"] == "Gericht wählen" for t in app.tage()), "Wuerfeln erfindet nichts: alle Tage bleiben leer")
    rec.pruefe("F16", all(app.seite_ok().values()) and len(m.tab("Plan")) == 0, "nichts im Sheet geschrieben")
    rec.shot(app.page, "leer_plan")
    app.tab("gerichte")
    rec.pruefe("F16", app.da("gerichte-leer"), "Gerichteliste: " + app.text("gerichte-leer"))
    rec.schritt("erstes Gericht in leeres Sheet")
    app.t("btn-neues-gericht").click()
    app.t("gericht-name").fill("Erstes Gericht")
    app.t("zutaten-schnell").fill("1 Stück Ei")
    app.t("btn-zutaten-erkennen").click()
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_selector('[data-testid="gerichte-liste"]')
    rec.gleich("F16", [g["id"] for g in m.tab("Gerichte")], ["G001"], "erstes Gericht bekommt G001")
    app.tab("einkauf")
    rec.pruefe("F16", app.da("einkauf-leer"), "Einkaufszettel: Hinweis statt Fehler")


def test_f16_weniger_als_sieben_gerichte(lab):
    rec = lab.rec
    p, m, app = profil(lab, "weber")
    app.start_setzen(p["start"])
    norm = norm_von(p["datei"])
    aktive = {g["id"] for g in norm["gerichte"] if g["aktiv"] and g["status"] == "fertig" and not g["nie_wieder"]}
    rec.pruefe("F16", len(aktive) < 7, f"Testdaten: nur {len(aktive)} passende Gerichte")
    app.wuerfeln()
    ids = [r[1] for r in app.plan_gespeichert(p["start"])]
    rec.gleich("F16", len(ids), 7, "trotzdem 7 Tage gefuellt")
    rec.pruefe("F16", set(ids) <= aktive, "nur passende Gerichte, mit Wiederholungen")
    rec.pruefe("F16", "weniger als 7" in app.text("plan-warnung"), "verstaendliche Warnung: " + app.text("plan-warnung"))
    rec.shot(app.page, "weniger_als_7")


# ---------------------------------------------------------------- F17
def test_f17_offline_lesen_abhaken_schreiben(lab):
    rec = lab.rec
    p, m, app = profil(lab, "ben_clara", sw=True)
    app.erlaubt = True
    app.start_setzen(p["start"])
    app.wuerfeln()
    liste = app.einkauf()
    app.page.evaluate("navigator.serviceWorker.ready.then(() => true)")
    rec.pruefe("F17", app.page.evaluate("navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(r => !!r.active)"), "Service Worker aktiv")
    app.neu_laden()  # laedt jetzt ueber den Service Worker
    app.tab("plan")
    tage = app.tage()
    rec.schritt("Netz aus, App neu starten (neue Seite)")
    app.ctx.set_offline(True)
    seite = app.ctx.new_page()
    seite.on("pageerror", lambda e: app.fehler_konsole.append(str(e)))
    seite.goto(m.base + "/index.html#/plan")
    seite.wait_for_selector('[data-testid="day-0"]', timeout=10000)
    app.page = seite
    rec.gleich("F17", app.tage(), tage, "ohne Netz: zuletzt geladener Plan wird angezeigt")
    rec.pruefe("F17", "Abgleich" in app.text("sync-zeit"), "Zeit des letzten Abgleichs sichtbar: " + app.text("sync-zeit"))
    app.page.wait_for_selector('[data-testid="banner-fehler"]', timeout=15000)
    rec.pruefe("F17", "Keine Verbindung" in app.text("banner-fehler"), "Hinweis: " + app.text("banner-fehler").splitlines()[0])
    rec.shot(app.page, "offline_plan")
    app.tab("einkauf")
    app.page.wait_for_selector('[data-testid="einkauf-eintrag"]')
    rec.gleich("F17", [e["text"] for e in app.page.evaluate(kp.JS_EINKAUF)], [e["text"] for e in liste], "ohne Netz: derselbe Einkaufszettel")
    rec.schritt("Abhaken ohne Netz")
    app.t("einkauf-eintrag").nth(1).click()
    app.t("einkauf-eintrag").nth(3).click()
    rec.gleich("F17", [i for i, e in enumerate(app.page.evaluate(kp.JS_EINKAUF)) if e["an"]], [1, 3], "Haken funktionieren offline")
    app.page.reload()
    app.page.wait_for_selector('[data-testid="einkauf-eintrag"]')
    rec.gleich("F17", [i for i, e in enumerate(app.page.evaluate(kp.JS_EINKAUF)) if e["an"]], [1, 3], "Haken bleiben nach Neustart ohne Netz")
    rec.shot(app.page, "offline_einkauf")
    rec.schritt("Schreiben ohne Netz meldet 'offline'")
    app.tab("plan")
    app.t("day-2-plus").click()
    app.page.wait_for_function("document.querySelector('[data-testid=plan-status]').innerText.includes('Offline')", timeout=10000)
    rec.pruefe("F17", "Offline" in app.text("plan-status"), "Status: " + app.text("plan-status"))
    rec.pruefe("F17", app.tage()[2]["portionen"] == 3, "Aenderung bleibt lokal sichtbar")
    rec.shot(app.page, "offline_schreiben")
    rec.schritt("Netz zurueck, Wiederholen")
    app.ctx.set_offline(False)
    app.t("banner-wiederholen").click()
    app.page.wait_for_function("!document.querySelector('[data-testid=banner-offen]')", timeout=10000)
    rec.gleich("F17", m.plan(p["start"])[2]["portionen"], 3, "nach Rueckkehr des Netzes im Sheet gespeichert")


def test_f17_hilfe_funktioniert_offline(lab):
    rec = lab.rec
    p, m, app = profil(lab, "anna", sw=True)
    app.erlaubt = True
    app.page.evaluate("navigator.serviceWorker.ready.then(() => true)")
    app.neu_laden()
    app.ctx.set_offline(True)
    app.page.reload()
    app.page.wait_for_selector('[data-testid="titel"]')
    rec.schritt("Hilfe offline")
    app.t("btn-hilfe").click()
    app.page.wait_for_selector('[data-testid="hilfe"]')
    rec.pruefe("F17", app.da("btn-tour-starten"), "Hilfe offen ohne Netz")
    app.t("hilfe-neu").click()
    app.page.wait_for_selector('[data-testid="vorlage-text"]')
    rec.pruefe("F17", len(app.t("vorlage-text").input_value()) > 500, "kopierbare Vorlage ist offline da")
    app.page.go_back()
    app.t("hilfe-einrichtung").click()
    app.page.wait_for_selector('[data-testid="hilfe-einrichtung-seite"]')
    rec.pruefe("F17", "Home-Bildschirm" in app.page.inner_text("main"), "Einrichtungshilfe offline")
    rec.shot(app.page, "hilfe_offline")
