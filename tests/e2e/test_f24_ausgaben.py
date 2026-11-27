"""F24 Ausgaben erfassen: eigenstaendiger Einstiegspunkt, unabhaengig vom Einkaufszettel oder Plan.

Der Tab "Ausgaben" steht nicht in der geteilten Testdatei data/kochplaner_test.xlsx (die bleibt fuer dieses
Feature unangetastet, andere Agenten arbeiten parallel an deren Inhalt). Jeder Test hier bekommt stattdessen
eine eigene Kopie mit dem zusaetzlichen Tab (per openpyxl, in pytests tmp_path, automatisch aufgeraeumt).
"""
import re

import openpyxl
import pytest

import kp
from kp import DATA, PROFILE


def _mit_ausgaben_tab(tmp_path, basis="kochplaner_test.xlsx"):
    """Kopie der Testdatei mit zusaetzlichem, leerem Tab "Ausgaben" (Kopfzeile wie setup() sie anlegen wuerde)."""
    wb = openpyxl.load_workbook(DATA / basis)
    ws = wb.create_sheet("Ausgaben")
    ws.append(["datum", "betrag", "beschreibung", "angelegt_am"])
    pfad = tmp_path / "mit_ausgaben.xlsx"
    wb.save(pfad)
    return str(pfad)


def test_f24_eigenstaendiger_einstiegspunkt_ueber_einstellungen(lab, tmp_path):
    """Erreichbar ueber die Einstellungen (jederzeit nutzbar, nicht an einen Plan gebunden), Formular, Validierung, Liste."""
    rec = lab.rec
    m = lab.mock(_mit_ausgaben_tab(tmp_path))
    app = lab.geraet(m, "iphone", jetzt="2026-11-20T18:00:00Z")
    rec.schritt("Ueber die Einstellungen zu Ausgaben, ohne vorher einen Plan zu brauchen")
    app.tab("einstellungen")
    app.t("btn-ausgaben-oeffnen").click()
    app.page.wait_for_function("location.hash === '#/ausgaben'")
    rec.pruefe("F24", app.da("ausgaben-leer"), "Leere Liste zeigt einen Hinweis statt einer weissen Seite")
    rec.shot(app.page, "leer")

    rec.schritt("Ungueltige Eingaben werden abgewiesen, nichts wird gespeichert")
    app.t("ausgabe-datum").fill("2026-11-20")
    app.t("ausgabe-betrag").fill("0")
    app.t("ausgabe-beschreibung").fill("Test")
    app.t("btn-ausgabe-speichern").click()
    app.page.wait_for_selector('[data-testid="ausgabe-meldung"] .note.fehler')
    rec.pruefe("F24", "größer als 0" in app.text("ausgabe-meldung"), "Deutsche Fehlermeldung zum Betrag: " + (app.text("ausgabe-meldung") or ""))
    rec.pruefe("F24", app.da("ausgaben-leer"), "weiterhin keine Ausgabe gespeichert")
    rec.pruefe("F24", len(m.tab("Ausgaben")) == 0, "auch im Sheet nichts geschrieben")

    rec.schritt("Gueltige Ausgabe eintragen, unabhaengig vom Einkaufszettel (Sonderfall)")
    app.t("ausgabe-datum").fill("2026-10-05")
    app.t("ausgabe-betrag").fill("45,90")
    app.t("ausgabe-beschreibung").fill("10 kg Mehl, Mühle")
    app.t("btn-ausgabe-speichern").click()
    app.page.wait_for_selector('[data-testid="ausgabe-eintrag"]')
    rec.pruefe("F24", "gespeichert" in (app.text("ausgabe-meldung") or ""), "Erfolgsmeldung nach dem Speichern")
    eintraege = app.t("ausgabe-eintrag")
    rec.pruefe("F24", eintraege.count() == 1, f"ein Eintrag in der Liste ({eintraege.count()})")
    text = eintraege.nth(0).inner_text()
    rec.pruefe("F24", "05.10.2026" in text, "Datum als TT.MM.JJJJ: " + text)
    rec.pruefe("F24", "10 kg Mehl, Mühle" in text, "Beschreibung sichtbar: " + text)
    rec.pruefe("F24", "45,9" in text and "€" in text, "Betrag mit Dezimalkomma und Euro-Zeichen: " + text)
    rec.shot(app.page, "eingetragen")

    rec.schritt("Zeile im Sheet: eigener Tab, angelegt_am gesetzt, unabhaengig von 'lesen'")
    zeilen = m.tab("Ausgaben")
    rec.pruefe("F24", len(zeilen) == 1, "genau eine Zeile im Tab Ausgaben")
    rec.gleich("F24", zeilen[0]["beschreibung"], "10 kg Mehl, Mühle", "Beschreibung im Sheet")
    rec.pruefe("F24", re.match(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$", str(zeilen[0]["angelegt_am"])), "angelegt_am ist ein Zeitstempel, von der Schnittstelle gesetzt")

    rec.schritt("Neu laden: die Ausgabe bleibt sichtbar (vom Server), eine zweite Ausgabe kommt dazu")
    app.neu_laden()
    app.tab("einstellungen")
    app.t("btn-ausgaben-oeffnen").click()
    app.page.wait_for_function("location.hash === '#/ausgaben'")
    app.page.wait_for_selector('[data-testid="ausgabe-eintrag"]')
    rec.pruefe("F24", app.t("ausgabe-eintrag").count() == 1, "nach Neuladen weiterhin ein Eintrag")
    app.t("ausgabe-datum").fill("2026-11-20")
    app.t("ausgabe-betrag").fill("12,30")
    app.t("ausgabe-beschreibung").fill("Wocheneinkauf")
    app.t("btn-ausgabe-speichern").click()
    app.page.wait_for_function("document.querySelectorAll('[data-testid=\"ausgabe-eintrag\"]').length === 2")
    neueste = app.t("ausgabe-eintrag").nth(0).inner_text()
    rec.pruefe("F24", "Wocheneinkauf" in neueste, "die zuletzt erfasste Ausgabe steht oben: " + neueste)
    rec.pruefe("F24", len(m.tab("Ausgaben")) == 2, "zwei unabhaengige Zeilen im Sheet, kein Upsert")


def test_f24_button_auf_dem_einkaufszettel(lab, tmp_path):
    """Direkt vom Einkaufszettel-Bildschirm aus erreichbar (nach dem Einkaufen), nicht an die aktuelle Liste gebunden."""
    rec = lab.rec
    p = PROFILE["ben_clara"]
    m = lab.mock(_mit_ausgaben_tab(tmp_path, basis=p["datei"]))
    app = lab.geraet(m, "iphone", jetzt=p["start"] + "T07:00:00Z")
    app.start_setzen(p["start"])
    app.wuerfeln()
    rec.schritt("Vom Einkaufszettel aus eine Ausgabe eintragen")
    app.tab("einkauf")
    app.t("btn-ausgabe-eintragen").click()
    app.page.wait_for_function("location.hash === '#/ausgaben'")
    rec.pruefe("F24", app.da("ausgabe-datum"), "Formular ist offen, unabhaengig vom aktuellen Einkaufszettel")
    app.t("ausgabe-datum").fill(p["start"])
    app.t("ausgabe-betrag").fill("8,20")
    app.t("ausgabe-beschreibung").fill("Kleinigkeit zwischendurch")
    app.t("btn-ausgabe-speichern").click()
    app.page.wait_for_selector('[data-testid="ausgabe-eintrag"]')
    rec.pruefe("F24", len(m.tab("Ausgaben")) == 1, "Ausgabe im Sheet angekommen")
    rec.schritt("Zurueck zum Einkaufszettel, die Liste selbst ist unveraendert")
    app.t("btn-zurueck").click()
    app.page.wait_for_function("location.hash === '#/einkauf'")
    rec.pruefe("F24", app.da("einkauf-eintrag") or app.da("einkauf-leer"), "Einkaufszettel ist weiterhin da, unbeeinflusst von der Ausgabe")
    rec.shot(app.page, "zurueck_zum_einkaufszettel")
