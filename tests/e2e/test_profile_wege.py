"""Durchgehende Wege der drei Test-Profile (Anna, Ben und Clara, Familie Weber): vom Verbinden bis zum Neuladen.
Jeder Zwischenstand wird mit dem unabhaengigen Orakel und dem Mock-Sheet verglichen."""
import re

import pytest

import kp
from kp import PROFILE, erwartete_ansicht_live, oracle

WOCHENTAG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
GERAET = {"anna": "iphone", "ben_clara": "ipad", "weber": "ipad_quer"}


def sheet_ist_ui(rec, app, m, p, text):
    """Das gespeicherte Sheet entspricht genau dem, was die App zeigt, und das Orakel rechnet es gleich nach."""
    plan = m.plan(p["start"])
    rec.gleich("PROFIL", len(plan), 7, f"{text}: 7 Tage im Sheet")
    ansicht, einkauf = erwartete_ansicht_live(m, p["start"])
    tage = app.tage()
    rec.gleich("PROFIL", [(t["name"], t["portionen"]) for t in tage], [(a["name"], a["portionen"]) for a in ansicht], f"{text}: Bildschirm = Sheet (Gericht, Portionen)")
    rec.gleich("PROFIL", [t["fixiert"] for t in tage], [str(r["fixiert"]).lower() == "ja" for r in plan], f"{text}: Fixierung im Sheet wie auf dem Bildschirm")
    return ansicht, einkauf


@pytest.mark.parametrize("pid", ["anna", "ben_clara", "weber"])
def test_profil_wochenlauf(lab, pid):
    rec = lab.rec
    p = PROFILE[pid]
    m = lab.mock(p["datei"])
    norm = kp.norm_von(p["datei"])
    art = GERAET[pid]
    app = lab.geraet(m, art, verbunden=False, jetzt=p["start"] + "T07:00:00Z")
    waehlbar = {g["name"] for g in norm["gerichte"] if g["id"] in oracle.selectable_ids(norm)}

    rec.schritt(f"{p['name']}: {p['beschreibung']} ({kp.GERAETE[art]})")
    app.verbinden()
    rec.gleich("PROFIL", app.hash(), "#/plan", "nach dem Verbinden steht der Plan da")
    rec.pruefe("PROFIL", app.da("day-0") and not app.da("setup-noetig"), "Verbunden: Tageskarten sichtbar, kein Hinweis 'Noch nicht verbunden'")
    app.tab("einstellungen")
    rec.gleich("PROFIL", app.t("einst-portionen").input_value(), str(p["standard_portionen"]), "Standardportionen aus dem Sheet")
    rec.gleich("PROFIL", app.t("einst-sperre").input_value(), str(p["sperre"]), "Wiederholungssperre aus dem Sheet")
    app.tab("plan")

    rec.schritt("Startdatum und Woche wuerfeln")
    app.start_setzen(p["start"])
    kopf = [t["kopf"] for t in app.tage()]
    soll = [f"{WOCHENTAG[['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].index(d['kurz'])]}, {d['anzeige'].split(' ', 1)[1]}" for d in oracle.week_days(p["start"])]
    rec.gleich("PROFIL", kopf, soll, "sieben aufeinanderfolgende Tage (auch ueber Monats-/Jahreswechsel) mit Wochentag und TT.MM.JJJJ")
    app.wuerfeln()
    tage = app.tage()
    rec.pruefe("PROFIL", all(t["name"] in waehlbar for t in tage), "alle Vorschlaege sind aktive, fertige Gerichte")
    rec.gleich("PROFIL", {t["portionen"] for t in tage}, {p["standard_portionen"]}, "jeder Tag mit den Standardportionen")
    if pid == "weber":
        rec.pruefe("PROFIL", len({t["name"] for t in tage}) <= len(waehlbar) <= 6, f"nur {len(waehlbar)} Gerichte aktiv: Wiederholungen erlaubt")
    else:
        rec.pruefe("PROFIL", len({t["name"] for t in tage}) == 7, "sieben verschiedene Gerichte")
    rec.shot(app.page, "plan_gewuerfelt")
    sheet_ist_ui(rec, app, m, p, "nach dem Wuerfeln")

    rec.schritt("Tag 3 mit der Suche ein anderes Gericht geben")
    vorher = app.tage()[2]["name"]
    app.t("day-2-name").click()
    app.page.wait_for_selector('[data-testid="chooser-liste"] button')
    namen = [re.sub(r"(★ Favorit|nie wieder)+$", "", t.split("\n")[0]) for t in app.page.locator('[data-testid="chooser-liste"] button').all_inner_texts()]
    rec.pruefe("PROFIL", set(namen) <= waehlbar and len(namen) >= 1, f"Auswahlliste nur aus aktiven, fertigen Gerichten ({len(namen)}); Abweichung: {sorted(set(namen) - waehlbar)[:3]}")
    neu = next(n for n in namen if n != vorher)
    app.page.locator('[data-testid="chooser-liste"] button', has_text=neu).first.click()
    app.gespeichert()
    rec.gleich("PROFIL", app.tage()[2]["name"], neu, "Tag 3 zeigt das gewaehlte Gericht")

    rec.schritt("Tag 4 fixieren, Tag 5 einzeln neu wuerfeln, Portionen an Tag 2 aendern")
    app.t("day-3-fix").click()
    app.gespeichert()
    fix_name = app.tage()[3]["name"]
    app.t("day-4-reroll").click()
    app.gespeichert()
    rec.pruefe("PROFIL", app.tage()[4]["name"] in waehlbar, "Einzel-Wuerfeln liefert ein gueltiges Gericht")
    k_pro = app.tage()[1]["kcal_pro"]
    app.t("day-1-plus").click(); app.t("day-1-plus").click()
    app.gespeichert()
    t1 = app.tage()[1]
    rec.gleich("PROFIL", t1["portionen"], p["standard_portionen"] + 2, "zwei Portionen mehr")
    rec.gleich("PROFIL", t1["kcal_pro"], k_pro, "Kalorien pro Portion bleiben gleich")
    ansicht, einkauf = sheet_ist_ui(rec, app, m, p, "nach Tauschen, Fixieren, Portionen")
    rec.pruefe("PROFIL", all(str(r["fixiert"]).lower() == "ja" for r in m.plan(p["start"])[3:4]), "Tag 4 ist im Sheet fixiert")

    rec.schritt("Alle neu wuerfeln: fixierter Tag bleibt")
    app.wuerfeln()
    rec.gleich("PROFIL", app.tage()[3]["name"], fix_name, "fixierter Tag bleibt unveraendert")
    rec.pruefe("PROFIL", app.tage()[3]["fixiert"], "Fixierung bleibt")
    ansicht, einkauf = sheet_ist_ui(rec, app, m, p, "nach erneutem Wuerfeln")

    rec.schritt("Einkaufszettel gegen das Orakel, abhaken, weitergeben")
    eintraege = app.einkauf()
    rec.gleich("PROFIL", [e["text"] for e in eintraege], einkauf["zeilen"], "Einkaufszettel (Mengen, Einheiten, Reihenfolge) wie im Orakel")
    rec.shot(app.page, "einkaufszettel")
    app.page.locator('[data-testid="einkauf-eintrag"]').nth(0).click()
    app.page.locator('[data-testid="einkauf-eintrag"]').nth(1).click()
    rec.gleich("PROFIL", sum(e["an"] for e in app.page.evaluate(kp.JS_EINKAUF)), 2, "zwei Eintraege abgehakt")
    app.t("btn-notes").click()
    app.page.wait_for_function("window.__kp.letzteKopie")
    rec.gleich("PROFIL", app.hook("letzteKopie").split("\n"), einkauf["zeilen"], "Kopie fuer Notes: eine Zeile je Eintrag, wie das Orakel")

    rec.schritt("Neues Gericht anlegen und im Plan waehlen koennen")
    gerichte0 = len(m.tab("Gerichte"))
    app.tab("gerichte")
    app.t("btn-neues-gericht").click()
    app.page.wait_for_selector('[data-testid="gericht-name"]')
    name = f"Wegtest {p['name']} Pfanne"
    app.t("gericht-name").fill(name)
    app.t("gericht-basis").fill("2")
    app.t("gericht-kcal").fill("500")
    app.t("zutaten-schnell").fill("200 g Nudeln\n1 Zwiebel\n2 EL Öl")
    app.t("btn-zutaten-erkennen").click()
    app.t("btn-gericht-speichern").click()
    app.page.wait_for_selector('[data-testid="gerichte-liste"]')
    rec.gleich("PROFIL", len(m.tab("Gerichte")), gerichte0 + 1, "genau ein neues Gericht im Sheet")
    app.tab("plan")
    app.t("day-5-name").click()
    app.t("chooser-suche").fill("Wegtest")
    rec.pruefe("PROFIL", app.page.locator('[data-testid="chooser-liste"] button', has_text=name).count() == 1, "neues Gericht ist in der Auswahl")
    app.page.locator('[data-testid="chooser-liste"] button', has_text=name).first.click()
    app.gespeichert()
    rec.gleich("PROFIL", app.tage()[5]["name"], name, "neues Gericht steht im Plan")

    rec.schritt("Heutiges Gericht bewerten")
    app.tab("einstellungen")
    app.t("einst-name").fill(p["name"].split(" ")[0])
    app.t("einst-name").blur()
    app.tab("plan")
    app.t("day-0-stern-5").click()
    app.t("day-0-bewertung-speichern").click()
    app.page.wait_for_function("document.querySelector('[data-testid=day-0-bewertung-status]').innerText.startsWith('Gespeichert')")
    b = [x for x in m.tab("Bewertungen") if str(x["datum"])[:10] == p["start"] and x["sterne"] == 5]
    rec.pruefe("PROFIL", len(b) == 1 and b[0]["von"] == p["name"].split(" ")[0], "Bewertung mit Name im Sheet")

    rec.schritt("Neu laden: alles bleibt")
    vorher_tage = app.tage()
    ansicht, einkauf = sheet_ist_ui(rec, app, m, p, "vor dem Neuladen")
    app.neu_laden()
    app.page.wait_for_selector('[data-testid="day-0"]')
    app.page.wait_for_timeout(400)
    rec.gleich("PROFIL", app.tage(), vorher_tage, "nach dem Neuladen genau derselbe Plan (Namen, Portionen, Fixierung, kcal)")
    eintraege = app.einkauf()
    rec.gleich("PROFIL", [e["text"] for e in eintraege], einkauf["zeilen"], "Einkaufszettel nach Neuladen wie im Orakel")
    rec.gleich("PROFIL", sum(e["an"] for e in eintraege), 2, "die beiden Haken sind noch da")
    rec.pruefe("PROFIL", all(app.seite_ok().values()), "keine leere Seite, nichts ragt seitlich heraus")
    rec.shot(app.page, "nach_neuladen")
