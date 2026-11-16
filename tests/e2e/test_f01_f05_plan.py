"""F01 Startdatum, F02 Shuffle, F03 Tag aendern, F04 Tagesansicht, F05 Portionen."""
import pytest

import kp
from kp import PROFILE, erwartete_ansicht, norm_von

WOCHENTAG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]


def profil_geraet(lab, pid, art="iphone", seed=7):
    p = PROFILE[pid]
    m = lab.mock(p["datei"])
    app = lab.geraet(m, art, jetzt=p["start"] + "T07:00:00Z", seed=seed)
    app.start_setzen(p["start"])
    return p, m, app


@pytest.mark.parametrize("pid,start", [("anna", "2026-11-18"), ("ben_clara", "2026-11-20"), ("weber", "2026-12-30")])
def test_f01_startdatum_profile(lab, pid, start):
    rec = lab.rec
    p, m, app = profil_geraet(lab, pid)
    rec.schritt(f"Profil {p['name']}: Startdatum {start} gewaehlt")
    soll = [d["datum"] for d in __import__("oracle").week_days(start)]
    ist = [t["datum"] for t in app.tage()]
    rec.gleich("F01", ist, soll, "7 aufeinanderfolgende Tage ab Start, keine Luecke, kein Doppel")
    rec.pruefe("F01", len(set(ist)) == 7, "genau 7 verschiedene Tage")
    koepfe = [t["kopf"] for t in app.tage()]
    from datetime import date
    d0 = date.fromisoformat(start)
    rec.pruefe("F01", koepfe[0].startswith(WOCHENTAG[d0.weekday()]) and koepfe[0].endswith(d0.strftime("%d.%m.%Y")), f"erster Tag lautet '{koepfe[0]}' (Wochentag, TT.MM.JJJJ)")
    rec.pruefe("F01", "(7 Tage)" in app.text("plan-bereich"), "Zeitraum-Zeile nennt 7 Tage: " + app.text("plan-bereich"))
    rec.shot(app.page, f"plan_{pid}")


@pytest.mark.parametrize("start", ["2026-10-22", "2026-03-26", "2026-12-28", "2027-02-26", "2028-02-27"])
def test_f01_sonderfaelle(lab, start):
    """Zeitumstellung (25.10.2026, 29.03.2026), Jahreswechsel, Monatswechsel, Schaltjahr 2028."""
    rec = lab.rec
    m = lab.mock("kochplaner_test.xlsx")
    app = lab.geraet(m, "iphone", jetzt="2026-11-14T08:30:00Z")
    rec.schritt(f"Startdatum {start}")
    app.start_setzen(start)
    ist = [t["datum"] for t in app.tage()]
    rec.gleich("F01", ist, [d["datum"] for d in __import__("oracle").week_days(start)], "7 Folgetage ohne Luecke und Doppel")
    rec.pruefe("F01", len(set(ist)) == 7, "keine Doppel")
    rec.pruefe("F01", app.page.evaluate("document.querySelector('[data-testid=plan-start]').value") == start, "Datumsfeld zeigt den gewaehlten Tag")


def test_f01_heute_knopf_und_ungueltig(lab):
    rec = lab.rec
    m = lab.mock()
    app = lab.geraet(m, "iphone", jetzt="2026-11-14T08:30:00Z")
    rec.schritt("Heute-Knopf")
    app.start_setzen("2026-12-01")
    app.t("start-heute").click()
    app.page.wait_for_function("document.querySelector('[data-testid=day-0]').dataset.datum === '2026-11-14'")
    rec.gleich("F01", app.tage()[0]["datum"], "2026-11-14", "Heute setzt den Start auf den aktuellen Tag (Europe/Berlin)")
    rec.schritt("Datum leeren wird abgelehnt")
    app.t("plan-start").fill("")
    app.page.wait_for_timeout(300)
    rec.gleich("F01", app.tage()[0]["datum"], "2026-11-14", "leeres Datum aendert nichts")
    rec.pruefe("F01", app.page.evaluate("document.querySelector('[data-testid=plan-start]').value") == "2026-11-14", "Feld springt auf gueltigen Wert zurueck")


def test_f02_shuffle_anna(lab):
    rec = lab.rec
    p, m, app = profil_geraet(lab, "anna")
    norm = norm_von(p["datei"])
    ok_ids = {g["id"] for g in norm["gerichte"] if g["aktiv"] and g["status"] == "fertig" and not g["nie_wieder"]}
    rec.schritt("Vorschlag wuerfeln")
    app.wuerfeln()
    plan = app.plan_gespeichert(p["start"])
    ids = [r[1] for r in plan]
    rec.pruefe("F02", len(plan) == 7, "7 Tage im Plan gespeichert")
    rec.pruefe("F02", all(i in ok_ids for i in ids), "nur aktive, fertige Gerichte ohne nie_wieder: " + ", ".join(ids))
    rec.pruefe("F02", len(set(ids)) == 7, "keine Wiederholung innerhalb der Woche")
    rec.pruefe("F02", all(r[2] == 1 for r in plan), "Portionen = Einstellung des Profils (1)")
    rec.shot(app.page, "vorschlag")
    rec.schritt("5 weitere Vorschlaege")
    for _ in range(5):
        app.wuerfeln()
        i2 = [r[1] for r in app.plan_gespeichert(p["start"])]
        rec.pruefe("F02", len(set(i2)) == 7 and set(i2) <= ok_ids, "weiterer Vorschlag gueltig: " + ", ".join(i2))


def test_f02_gleicher_seed_gleicher_plan(lab):
    rec = lab.rec
    plaene = []
    for _ in range(2):
        p, m, app = profil_geraet(lab, "anna", seed=123)
        app.wuerfeln()
        plaene.append([r[1] for r in app.plan_gespeichert(p["start"])])
    rec.gleich("F02", plaene[0], plaene[1], "gleicher Seed ergibt denselben Plan (zwei getrennte Geraete)")
    p, m, app = profil_geraet(lab, "anna", seed=124)
    app.wuerfeln()
    rec.pruefe("F02", [r[1] for r in app.plan_gespeichert(p["start"])] != plaene[0], "anderer Seed ergibt anderen Plan")


def test_f02_sperrfrist_ben_clara(lab):
    """Gerichte der letzten 21 Tage kommen nur vor, wenn sonst weniger als 7 uebrig bleiben."""
    rec = lab.rec
    p, m, app = profil_geraet(lab, "ben_clara")
    norm = norm_von(p["datei"])
    hist = {r["gericht_id"] for r in m.tab("Plan") if r["datum"] >= "2026-10-30" and r["datum"] < p["start"]}
    rec.pruefe("F02", len(hist) >= 7, f"Testdaten: {len(hist)} Gerichte in der Historie")
    for lauf in range(6):
        app.wuerfeln()
        ids = [r[1] for r in app.plan_gespeichert(p["start"])]
        rec.pruefe("F02", not (set(ids) & hist), f"Lauf {lauf + 1}: kein Gericht aus der Sperrfrist: " + ", ".join(ids))
    rec.shot(app.page, "ben_clara_plan")


def test_f03_tag_aendern_fixieren(lab):
    rec = lab.rec
    p, m, app = profil_geraet(lab, "ben_clara")
    norm = norm_von(p["datei"])
    gname = {g["id"]: g["name"] for g in norm["gerichte"]}
    app.wuerfeln()
    vorher = [t["name"] for t in app.tage()]
    rec.schritt("Tag 2 antippen, nach 'suppe' suchen")
    app.t("day-1-name").click()
    app.page.wait_for_selector('[data-testid="chooser"]')
    app.t("chooser-suche").fill("suppe")
    app.page.wait_for_timeout(200)
    treffer = app.page.locator('[data-testid="chooser-liste"] button').all_inner_texts()
    auswahl_ok = {g["name"] for g in norm["gerichte"] if g["aktiv"] and g["status"] == "fertig"}
    rec.pruefe("F03", len(treffer) >= 1 and all("suppe" in t.lower() for t in treffer), f"{len(treffer)} Treffer, alle mit 'suppe'")
    rec.shot(app.page, "auswahl_suche")
    app.t("chooser-suche").fill("")
    app.page.wait_for_timeout(200)
    alle = app.page.locator('[data-testid="chooser-liste"] button').count()
    soll = len([g for g in norm["gerichte"] if g["aktiv"] and g["status"] == "fertig"])
    rec.gleich("F03", alle, soll, "Auswahl zeigt alle aktiven, fertigen Gerichte (ohne Archivierte und Ideen)")
    app.t("chooser-suche").fill("suppe")
    app.page.wait_for_timeout(200)
    namen = [t.split("\n")[0] for t in app.page.locator('[data-testid="chooser-liste"] button').all_inner_texts()]
    idx = next(i for i, n in enumerate(namen) if n != vorher[1] and n in auswahl_ok)
    gewaehlt = namen[idx]
    app.page.locator('[data-testid="chooser-liste"] button').nth(idx).click()
    app.gespeichert()
    nachher = [t["name"] for t in app.tage()]
    rec.gleich("F03", nachher[1], gewaehlt, "Tag 2 zeigt genau das gewaehlte Gericht")
    rec.pruefe("F03", nachher[1] != vorher[1], "Tag 2 hat sich geaendert")
    rec.gleich("F03", [n for i, n in enumerate(nachher) if i != 1], [n for i, n in enumerate(vorher) if i != 1], "alle anderen Tage unveraendert")
    rec.schritt("Neu wuerfeln wirkt nur auf Tag 4")
    v2 = [t["name"] for t in app.tage()]
    app.t("day-3-reroll").click()
    app.gespeichert()
    n2 = [t["name"] for t in app.tage()]
    rec.pruefe("F03", n2[3] != v2[3], "Tag 4 hat ein anderes Gericht")
    rec.gleich("F03", [n for i, n in enumerate(n2) if i != 3], [n for i, n in enumerate(v2) if i != 3], "andere Tage bleiben")
    rec.schritt("Tag 3 fixieren, alle neu wuerfeln")
    app.t("day-2-fix").click()
    app.gespeichert()
    fix_name = app.tage()[2]["name"]
    rec.pruefe("F03", app.tage()[2]["fixiert"], "Tag 3 ist fixiert")
    rec.pruefe("F03", app.t("day-2-reroll").is_disabled(), "Neu wuerfeln ist fuer fixierten Tag gesperrt")
    for _ in range(4):
        app.wuerfeln()
        rec.gleich("F03", app.tage()[2]["name"], fix_name, "fixierter Tag bleibt bei 'Alle neu wuerfeln'")
    plan = app.plan_gespeichert(p["start"])
    rec.gleich("F03", plan[2][3], "ja", "Fixierung steht im Sheet (Tab Plan)")
    rec.shot(app.page, "fixiert")


def test_f03_leerer_tag_und_tausch_ins_sheet(lab):
    rec = lab.rec
    p, m, app = profil_geraet(lab, "anna")
    rec.schritt("leerer Tag: Gericht waehlen ueber Auswahl")
    rec.pruefe("F03", all(t["name"] == "Gericht wählen" for t in app.tage()), "vor dem Wuerfeln steht an jedem Tag 'Gericht wählen'")
    app.t("day-0-name").click()
    app.t("chooser-suche").fill("Käsespätzle")
    app.page.locator('[data-testid="chooser-liste"] button').first.click()
    app.gespeichert()
    plan = app.plan_gespeichert(p["start"])
    rec.pruefe("F03", len(plan) == 1 and plan[0][0] == p["start"], "nur der gewaehlte Tag steht im Sheet")
    rec.gleich("F03", app.tage()[0]["name"], "Käsespätzle", "Gewaehltes Gericht erscheint am Tag")


@pytest.mark.parametrize("pid", ["anna", "ben_clara", "weber"])
def test_f04_tagesansicht_gegen_orakel(lab, pid):
    rec = lab.rec
    p, m, app = profil_geraet(lab, pid)
    app.wuerfeln()
    plan = m.plan(p["start"])
    ansicht, _ = erwartete_ansicht(p["datei"], p["start"], plan)
    tage = app.tage()
    for i, (t, soll) in enumerate(zip(tage, ansicht)):
        rec.schritt(f"Tag {i + 1}: {soll['name']}")
        rec.gleich("F04", t["name"], soll["name"], "Gerichtname")
        kurz, dm = soll["anzeige"].split(" ", 1)
        voll = WOCHENTAG[["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].index(kurz)]
        rec.gleich("F04", t["kopf"], f"{voll}, {dm}", "Wochentag und Datum")
        rec.gleich("F04", t["portionen"], soll["portionen"], "Portionen")
        if soll["kcal_pro_portion"] is None:
            rec.pruefe("F04", t["kcal_fehlt"] and not t["kcal_pro"], "ohne kcal: 'kcal fehlt'")
        else:
            def zahl(s):
                import re
                # deutsche Schreibweise: Punkt = Tausender, Komma = Dezimalzeichen ("1.234,5" -> 1234.5)
                return float(re.match(r"\d[\d.]*(?:,\d+)?", s).group(0).replace(".", "").replace(",", "."))
            rec.gleich("F04", zahl(t["kcal_pro"]), float(soll["kcal_pro_portion"]), "kcal pro Portion")
            rec.pruefe("F04", abs(zahl(t["kcal_gesamt"]) - soll["kcal_gesamt"]) <= 0.01, f"kcal gesamt = kcal/Portion x Portionen: {t['kcal_gesamt']} (Orakel {soll['kcal_gesamt']})")
    rec.shot(app.page, f"tagesansicht_{pid}")


def test_f04_kcal_fehlt(lab):
    rec = lab.rec
    p, m, app = profil_geraet(lab, "anna")
    norm = norm_von(p["datei"])
    ohne = [g for g in norm["gerichte"] if g["kcal_pro_portion"] is None and g["aktiv"] and g["status"] == "fertig"]
    rec.pruefe("F04", len(ohne) >= 1, f"Testdaten haben {len(ohne)} Gerichte ohne kcal")
    app.t("day-0-name").click()
    app.t("chooser-suche").fill(ohne[0]["name"])
    app.page.locator('[data-testid="chooser-liste"] button').first.click()
    rec.gleich("F04", app.text("day-0-kcal-fehlt"), "kcal fehlt", "Anzeige 'kcal fehlt'")
    rec.pruefe("F04", not app.da("day-0-kcal-gesamt"), "keine kcal-Summe ohne Angabe")
    rec.shot(app.page, "kcal_fehlt")


def test_f05_portionen_hin_und_zurueck(lab):
    rec = lab.rec
    p, m, app = profil_geraet(lab, "ben_clara")
    app.wuerfeln()
    plan0 = m.plan(p["start"])
    z0 = app.einkauf()
    app.tab("plan")
    k0 = app.tage()[0]
    rec.schritt("Tag 1: 2 auf 5 (3x Plus)")
    for _ in range(3):
        app.t("day-0-plus").click()
    app.gespeichert()
    rec.gleich("F05", app.tage()[0]["portionen"], 5, "Anzeige 5 Portionen")
    plan5 = m.plan(p["start"])
    ansicht, shop = erwartete_ansicht(p["datei"], p["start"], plan5)
    z5 = app.einkauf()
    rec.gleich("F05", [e["text"] for e in z5], shop["zeilen"], "Einkaufszettel bei 5 Portionen entspricht dem Orakel")
    app.tab("plan")
    k5 = app.tage()[0]
    rec.gleich("F05", k5["kcal_pro"], k0["kcal_pro"], "kcal pro Portion bleibt gleich")
    rec.shot(app.page, "fuenf_portionen")
    rec.schritt("zurueck auf 2")
    for _ in range(3):
        app.t("day-0-minus").click()
    app.gespeichert()
    z2 = app.einkauf()
    rec.gleich("F05", [e["text"] for e in z2], [e["text"] for e in z0], "2 auf 5 auf 2 liefert wieder exakt die Ausgangswerte")
    rec.gleich("F05", [(r["datum"], r["gericht_id"], r["portionen"]) for r in m.plan(p["start"])], [(r["datum"], r["gericht_id"], r["portionen"]) for r in plan0], "Plan im Sheet wie am Anfang")


def test_f05_grenzen_1_bis_20(lab):
    rec = lab.rec
    p, m, app = profil_geraet(lab, "anna")
    app.wuerfeln()
    rec.pruefe("F05", app.t("day-0-minus").is_disabled(), "bei 1 Portion ist Minus gesperrt")
    for _ in range(25):
        if not app.t("day-0-plus").is_disabled():
            app.t("day-0-plus").click()
    rec.gleich("F05", app.tage()[0]["portionen"], 20, "Obergrenze 20")
    rec.pruefe("F05", app.t("day-0-plus").is_disabled(), "bei 20 Portionen ist Plus gesperrt")
    app.gespeichert()
    rec.gleich("F05", m.plan(p["start"])[0]["portionen"], 20, "20 Portionen im Sheet")


def test_f05_zutat_ohne_menge_skaliert_nicht(lab):
    rec = lab.rec
    p, m, app = profil_geraet(lab, "anna")
    norm = norm_von(p["datei"])
    g = next(g for g in norm["gerichte"] if any(z["_menge"] is None and z["einkaufen"] for z in g["zutaten"]) and g["aktiv"] and g["status"] == "fertig")
    ohne = [z["name"].strip() for z in g["zutaten"] if z["_menge"] is None and z["einkaufen"]]
    app.t("day-0-name").click()
    app.t("chooser-suche").fill(g["name"])
    app.page.locator('[data-testid="chooser-liste"] button').first.click()
    app.gespeichert()
    z1 = [e["text"] for e in app.einkauf()]
    app.tab("plan")
    for _ in range(5):
        app.t("day-0-plus").click()
    app.gespeichert()
    z6 = [e["text"] for e in app.einkauf()]
    for name in ohne:
        a1 = [t for t in z1 if t.lower() == name.lower()]
        a6 = [t for t in z6 if t.lower() == name.lower()]
        rec.pruefe("F05", a1 and a1 == a6, f"'{name}' steht ohne Menge in der Liste und bleibt bei 1 und 6 Portionen gleich")
