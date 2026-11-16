"""F06 Einkaufszettel, F07 Abhaken, F08 Erinnerungen, F09 Notes, F10 Plan speichern und Historie."""
import json
import re

import pytest

import kp
from kp import DATA, PROFILE, erwartete_ansicht

SZENARIEN = json.loads((DATA / "scenarios.json").read_text(encoding="utf-8"))
GOLD = json.loads((DATA / "golden" / "einkauf.json").read_text(encoding="utf-8"))


def plan_laden(m, sz):
    zeilen = [{"datum": t["datum"], "gericht_id": t["gericht_id"], "portionen": t["portionen"], "fixiert": "nein"}
              for t in GOLD[sz["id"]]["tage"]]
    r = m.api("plan_speichern", zeilen=zeilen)
    assert r["ok"], r


@pytest.mark.parametrize("sz", SZENARIEN, ids=[s["id"] for s in SZENARIEN])
def test_f06_einkaufszettel_gegen_orakel(lab, sz):
    rec = lab.rec
    m = lab.mock(sz["datei"])
    plan_laden(m, sz)
    app = lab.geraet(m, "iphone", jetzt=sz["start"] + "T07:00:00Z")
    rec.schritt(f"Szenario {sz['id']}: {sz['beschreibung']}")
    app.start_setzen(sz["start"])
    gold = GOLD[sz["id"]]
    rec.gleich("F06", [t["name"] for t in app.tage()], [t["name"] for t in gold["tage"]], "Plan der sieben Tage wie im Orakel")
    app.t("tab-einkauf").click()
    app.page.wait_for_selector('[data-testid="einkauf-eintrag"], [data-testid="einkauf-leer"]')
    ist = [e["text"] for e in app.page.evaluate(kp.JS_EINKAUF)]
    rec.gleich("F06", ist, gold["einkauf"]["zeilen"], "Einkaufszettel (Mengen, Einheiten, Summen, Reihenfolge, Dezimalkomma) wie im Orakel")
    rec.pruefe("F06", all(not re.search(r"\d\.\d", z) for z in ist), "kein Dezimalpunkt in den Mengen")
    if sz["id"] in ("H01_standard", "H02_gkg_mix"):
        rec.shot(app.page, "einkaufszettel")


def test_f06_g_kg_und_stueck_regeln(lab):
    """Die Zieldokument-Beispiele: kg ab 1000 g, l ab 1000 ml, Stueck auf 0,5 aufgerundet nach dem Addieren."""
    rec = lab.rec
    zeilen = {}
    for sid in ("H02_gkg_mix", "H03_stueck", "H12_brueche"):
        sz = next(s for s in SZENARIEN if s["id"] == sid)
        m = lab.mock(sz["datei"])
        plan_laden(m, sz)
        app = lab.geraet(m, "iphone", jetzt=sz["start"] + "T07:00:00Z")
        app.start_setzen(sz["start"])
        zeilen[sid] = [e["text"] for e in app.einkauf()]
    rec.schritt("Einheiten umrechnen")
    rec.pruefe("F06", any(re.match(r"^\d+(,\d+)? kg ", z) for z in zeilen["H02_gkg_mix"]), "Gramm werden ab 1000 als kg angezeigt")
    rec.pruefe("F06", any(re.match(r"^\d+(,\d+)? l ", z) for z in zeilen["H02_gkg_mix"]), "Milliliter werden ab 1000 als l angezeigt: " + ", ".join(z for z in zeilen["H02_gkg_mix"] if " l " in z))
    rec.pruefe("F06", any(re.match(r"^\d+(,5)? Stück ", z) for z in zeilen["H03_stueck"]), "Stueck in halben Schritten")
    rec.pruefe("F06", all(re.match(r"^\d+(,5)? Stück ", z) for z in zeilen["H03_stueck"] if " Stück " in z), "jede Stueck-Zeile ist ganz oder x,5")


def test_f06_gleiche_zutat_schreibweise_wird_addiert(lab):
    rec = lab.rec
    sz = next(s for s in SZENARIEN if s["id"] == "H03_stueck")
    m = lab.mock(sz["datei"])
    plan_laden(m, sz)
    app = lab.geraet(m, "iphone", jetzt=sz["start"] + "T07:00:00Z")
    app.start_setzen(sz["start"])
    texte = [e["text"] for e in app.einkauf()]
    zwiebeln = [t for t in texte if t.lower().endswith(" zwiebel") or t.lower() == "zwiebel"]
    rec.pruefe("F06", len(zwiebeln) == 1, "'Zwiebel' und 'zwiebel ' (andere Schreibweise) ergeben genau eine Zeile: " + str(zwiebeln))


def test_f06_wasser_steht_nicht_auf_der_liste(lab):
    rec = lab.rec
    sz = next(s for s in SZENARIEN if s["id"] == "H05_wasser")
    m = lab.mock(sz["datei"])
    plan_laden(m, sz)
    app = lab.geraet(m, "iphone", jetzt=sz["start"] + "T07:00:00Z")
    app.start_setzen(sz["start"])
    texte = [e["text"].lower() for e in app.einkauf()]
    rec.pruefe("F06", not any("wasser" in t for t in texte), "einkaufen = nein (Wasser) steht nicht auf der Liste")


def test_f06_leerer_plan(lab):
    rec = lab.rec
    m = lab.mock("profile_anna.xlsx")
    app = lab.geraet(m, "iphone")
    rec.schritt("Einkaufszettel ohne Plan")
    app.tab("einkauf")
    rec.pruefe("F06", app.da("einkauf-leer"), "Hinweis 'Noch kein Einkaufszettel' statt weisser Seite")
    rec.pruefe("F06", app.t("btn-zuruecksetzen").is_disabled(), "Zuruecksetzen gesperrt ohne Eintraege")
    rec.shot(app.page, "leer")


def _plan_mit_liste(lab, pid="ben_clara", art="iphone"):
    p = PROFILE[pid]
    m = lab.mock(p["datei"])
    app = lab.geraet(m, art, jetzt=p["start"] + "T07:00:00Z")
    app.start_setzen(p["start"])
    app.wuerfeln()
    return p, m, app


def test_f07_abhaken_persistent_und_zuruecksetzen(lab):
    rec = lab.rec
    p, m, app = _plan_mit_liste(lab)
    liste = app.einkauf()
    rec.pruefe("F07", len(liste) >= 10 and not any(e["an"] for e in liste), f"{len(liste)} Eintraege, keiner abgehakt")
    rec.schritt("drei Eintraege antippen")
    for i in (0, 2, 5):
        app.t("einkauf-eintrag").nth(i).click()
    an = [e["an"] for e in app.page.evaluate(kp.JS_EINKAUF)]
    rec.gleich("F07", [i for i, a in enumerate(an) if a], [0, 2, 5], "Tippen setzt den Haken")
    rec.shot(app.page, "abgehakt")
    app.t("einkauf-eintrag").nth(2).click()
    rec.gleich("F07", [i for i, a in enumerate(app.page.evaluate(kp.JS_EINKAUF)) if a["an"]], [0, 5], "erneutes Tippen loest den Haken")
    rec.schritt("Neu laden")
    app.neu_laden()
    nach = app.einkauf()
    rec.gleich("F07", [i for i, e in enumerate(nach) if e["an"]], [0, 5], "Haken bleiben nach dem Neuladen erhalten")
    rec.gleich("F07", [e["text"] for e in nach], [e["text"] for e in liste], "Liste unveraendert")
    rec.pruefe("F07", "2 abgehakt" in app.text("einkauf-zusammenfassung"), "Zusammenfassung nennt 2 abgehakt: " + app.text("einkauf-zusammenfassung"))
    rec.schritt("Zuruecksetzen")
    app.t("btn-zuruecksetzen").click()
    rec.pruefe("F07", not any(e["an"] for e in app.page.evaluate(kp.JS_EINKAUF)), "Zuruecksetzen loescht alle Haken")
    app.neu_laden()
    rec.pruefe("F07", not any(e["an"] for e in app.einkauf()), "nach Neuladen bleiben sie geloescht")


def test_f07_haken_nur_bei_unveraenderter_menge(lab):
    rec = lab.rec
    p, m, app = _plan_mit_liste(lab)
    liste = app.einkauf()
    rec.schritt("alle Eintraege abhaken")
    for i in range(len(liste)):
        app.t("einkauf-eintrag").nth(i).click()
    vorher = app.page.evaluate(kp.JS_EINKAUF)
    rec.pruefe("F07", len(vorher) == len(liste) and all(e["an"] for e in vorher), f"Vorbedingung: alle {len(vorher)} Eintraege sind abgehakt")
    def ident(eintraege):
        """(Name-Schluessel, Nummer innerhalb gleicher Namen): dieselbe Zutat in zwei Einheiten bleibt unterscheidbar."""
        zaehler, out = {}, {}
        for e in eintraege:
            n = zaehler.get(e["key"], 0)
            zaehler[e["key"]] = n + 1
            out[(e["key"], n)] = e
        return out
    alt = ident(vorher)
    rec.schritt("Portionen von Tag 1 aendern (Menge einzelner Zutaten aendert sich)")
    app.tab("plan")
    for _ in range(3):
        app.t("day-0-plus").click()
    app.gespeichert()
    neu = ident(app.einkauf())
    gemeinsam = [k for k in neu if k in alt]
    geaendert = [neu[k] for k in gemeinsam if neu[k]["text"] != alt[k]["text"]]
    gleich = [neu[k] for k in gemeinsam if neu[k]["text"] == alt[k]["text"]]
    rec.pruefe("F07", len(geaendert) >= 1, f"Vorbedingung: die Menge mindestens eines Eintrags hat sich geaendert ({[(alt[k]['text'], neu[k]['text']) for k in gemeinsam if neu[k]['text'] != alt[k]['text']][:3]})")
    rec.pruefe("F07", len(gleich) >= 1, f"Vorbedingung: mindestens ein Eintrag blieb unveraendert ({len(gleich)} von {len(neu)})")
    rec.pruefe("F07", not any(e["an"] for e in geaendert), "Eintraege mit geaenderter Menge sind wieder offen (nie zu wenig kaufen)")
    rec.pruefe("F07", all(e["an"] for e in gleich), "Eintraege mit unveraenderter Menge bleiben abgehakt")


def test_f08_export_erinnerungen(lab):
    rec = lab.rec
    p, m, app = _plan_mit_liste(lab, "anna")
    zeilen = [e["text"] for e in app.einkauf()]
    rec.schritt("In Erinnerungen")
    app.t("btn-erinnerungen").click()
    app.page.wait_for_function("window.__kp.opened.length > 0")
    kopie = app.hook("letzteKopie")
    rec.gleich("F08", kopie.split("\n"), zeilen, "Zwischenablage: eine Zeile je Eintrag, wie auf dem Bildschirm")
    rec.gleich("F08", app.page.evaluate("navigator.clipboard.readText()"), kopie, "echte Zwischenablage des Browsers enthaelt dieselbe Liste")
    rec.gleich("F08", app.hook("opened"), ["shortcuts://run-shortcut?name=Einkauf&input=clipboard"], "Aufruf-Adresse des Kurzbefehls 'Einkauf'")
    rec.pruefe("F08", "Kurzbefehl" in app.text("export-meldung") and "Teilen" in app.text("export-meldung"), "Meldung nennt Kurzbefehl und Ausweg Teilen: " + app.text("export-meldung"))
    rec.shot(app.page, "erinnerungen")


def test_f08_fallback_teilen_dialog(lab):
    rec = lab.rec
    p = PROFILE["anna"]
    m = lab.mock(p["datei"])
    app = lab.geraet(m, "iphone", verbunden=False, jetzt=p["start"] + "T07:00:00Z")
    app.ctx.add_init_script("""
      Object.defineProperty(navigator, 'clipboard', {value: {writeText: () => Promise.reject(new Error('blockiert'))}, configurable: true});
      document.execCommand = () => false;
      window.__geteilt = []; navigator.share = (d) => { window.__geteilt.push(d); return Promise.resolve(); };""")
    app.verbinden()
    app.start_setzen(p["start"])
    app.wuerfeln()
    zeilen = [e["text"] for e in app.einkauf()]
    rec.schritt("Kopieren geht nicht: Teilen-Dialog")
    app.t("btn-erinnerungen").click()
    app.page.wait_for_function("window.__geteilt.length > 0")
    geteilt = app.page.evaluate("window.__geteilt[0]")
    rec.gleich("F08", geteilt["text"].split("\n"), zeilen, "Fallback uebergibt dieselbe Liste an den Teilen-Dialog")
    rec.pruefe("F08", "Teilen" in app.text("export-meldung") and "Erinnerungen" in app.text("export-meldung"), "Meldung erklaert: dort Erinnerungen waehlen: " + app.text("export-meldung"))
    rec.gleich("F08", app.hook("opened"), [], "Kurzbefehl wird dann nicht blind gestartet")
    rec.shot(app.page, "teilen_fallback")


def test_f09_export_notes(lab):
    rec = lab.rec
    p, m, app = _plan_mit_liste(lab, "weber")
    zeilen = [e["text"] for e in app.einkauf()]
    rec.schritt("Fuer Notes kopieren")
    app.t("btn-notes").click()
    app.page.wait_for_function("window.__kp.letzteKopie")
    kopie = app.hook("letzteKopie")
    rec.gleich("F09", kopie.split("\n"), zeilen, "Klartext, eine Zeile je Eintrag, dieselbe Liste")
    rec.pruefe("F09", "\n\n" not in kopie and "- " not in kopie[:2] and "[" not in kopie, "reiner Text ohne Aufzaehlungszeichen oder Formatierung")
    rec.gleich("F09", app.page.evaluate("navigator.clipboard.readText()"), kopie, "echte Zwischenablage")
    rec.gleich("F09", app.text("notes-anleitung"), "So geht es in Notes: Einfügen, Text markieren, Checkliste antippen.", "Anleitung sichtbar")
    rec.pruefe("F09", app.hook("opened") == [], "kein Kurzbefehl-Aufruf bei Notes")
    rec.shot(app.page, "notes")


def test_f10_plan_im_sheet_und_neuladen(lab):
    rec = lab.rec
    p, m, app = _plan_mit_liste(lab)
    plan = m.plan(p["start"])
    rec.pruefe("F10", len(plan) == 7, "Tab Plan hat 7 Zeilen fuer die Woche")
    rec.gleich("F10", [r["datum"] for r in plan], [t["datum"] for t in app.tage()], "Datumswerte entsprechen der Anzeige")
    rec.pruefe("F10", all(r["woche_start"] == p["start"] for r in plan), "woche_start = Startdatum")
    rec.pruefe("F10", all(re.match(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$", str(r["geaendert_am"])) for r in plan), "geaendert_am gesetzt")
    vor = app.tage()
    app.neu_laden()
    rec.gleich("F10", app.tage(), vor, "nach dem Neuladen derselbe Plan")
    rec.schritt("aeltere Historie bleibt erhalten")
    rec.pruefe("F10", len(m.tab("Plan")) == 14 + 7, "14 Historientage plus 7 neue Zeilen, nichts ueberschrieben: " + str(len(m.tab("Plan"))))


def test_f10_zweites_geraet_zeigt_denselben_plan(lab):
    rec = lab.rec
    p, m, app = _plan_mit_liste(lab)
    app.t("day-0-plus").click()
    app.t("day-3-fix").click()
    app.gespeichert()
    rec.schritt("zweites Geraet (frischer Browser-Kontext, nur Setup-Code)")
    b = lab.geraet(m, "ipad", jetzt=p["start"] + "T18:00:00Z")
    rec.gleich("F10", b.tage(), app.tage(), "zweites Geraet zeigt denselben Plan (Gerichte, Portionen, Fixierung) ohne Startdatum zu waehlen")
    rec.gleich("F10", b.einkauf() and [e["text"] for e in b.page.evaluate(kp.JS_EINKAUF)], [e["text"] for e in app.einkauf()], "und denselben Einkaufszettel")
    rec.shot(b.page, "zweites_geraet")


def test_f10_historie_speist_wiederholungssperre(lab):
    rec = lab.rec
    p = PROFILE["anna"]
    m = lab.mock(p["datei"])
    app = lab.geraet(m, "iphone", jetzt=p["start"] + "T07:00:00Z")
    app.start_setzen(p["start"])
    app.wuerfeln()
    woche1 = {r[1] for r in app.plan_gespeichert(p["start"])}
    rec.schritt("naechste Woche wuerfeln")
    app.start_setzen("2026-11-25")
    for _ in range(4):
        app.wuerfeln()
        woche2 = {r[1] for r in app.plan_gespeichert("2026-11-25")}
        rec.pruefe("F10", not (woche1 & woche2), "kein Gericht der Vorwoche in Woche 2 (Wiederholungssperre aus dem gespeicherten Plan): " + ", ".join(sorted(woche2)))
    rec.pruefe("F10", len(m.tab("Plan")) == 14, "beide Wochen stehen im Tab Plan")
