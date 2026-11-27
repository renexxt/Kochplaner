#!/usr/bin/env python3
"""Erzeugt die synthetischen Testdaten (nur Daten, keine Erwartungswerte).

Ergebnis in data/:
  kochplaner_test.xlsx       Basisdatei, 40 Gerichte, 25 Bewertungen, leerer Plan
  profile_anna.xlsx          Single, 1 Portion, Plan leer
  profile_ben_clara.xlsx     Paar, 2 Portionen, 14 Tage Historie
  profile_weber.xlsx         Familie, 4 Portionen, nur 6 aktive Gerichte
  edge_empty.xlsx            nur Kopfzeilen
  edge_noingredients.xlsx    8 Gerichte, eines ohne Zutaten
  profiles.json              Profil-Metadaten
  scenarios.json             feste Eingaben (Plan-Tage + Portionen) fuer die Einkaufszettel-Goldens

Alles deterministisch (fester Seed), Aufruf: python3 data/make_testdata.py
"""
import json
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import openpyxl

OUT = Path(__file__).resolve().parent

H_GERICHTE = ["id", "name", "basis_portionen", "kcal_pro_portion", "tags", "favorit", "nie_wieder",
              "aktiv", "reicht_fuer_tage", "schritte", "quelle", "angelegt_am", "status", "typ"]
H_ZUTATEN = ["gericht_id", "pos", "name", "menge", "einheit", "einkaufen"]
H_PLAN = ["woche_start", "datum", "gericht_id", "portionen", "fixiert", "geaendert_am", "beilage_id"]
H_BEW = ["gericht_id", "datum", "sterne", "notiz", "von"]
H_EINST = ["schluessel", "wert"]
H_LEBENSMITTEL = ["name", "kcal_je_100g"]
H_RICHTGEWICHTE = ["name", "einheit", "gramm"]
H_AUSGABEN = ["datum", "betrag", "beschreibung", "angelegt_am"]

# ---------------------------------------------------------------------------
# Gerichte. Zutatenzeilen: name;menge;einheit[;einkaufen]
#   menge leer = ohne Menge ("nach Geschmack", "Prise")
#   menge "raw:..." wird als Text in die Zelle geschrieben (Dezimalkomma, Bruch, Zahl als Text)
# Felder: id, name, basis, kcal, tags, favorit, nie_wieder, aktiv, tage, schritte, status, zutaten
# ---------------------------------------------------------------------------
D = []


def dish(id, name, basis, kcal, tags, fav, nie, aktiv, tage, schritte, z, status="fertig"):
    D.append(dict(id=id, name=name, basis=basis, kcal=kcal, tags=tags, fav=fav, nie=nie, aktiv=aktiv,
                  tage=tage, schritte=schritte, status=status, z=[l for l in z.strip().split("\n") if l.strip()]))


dish("G001", "Spaghetti Bolognese", 2, 720, "Pasta,Hackfleisch", "ja", "nein", "ja", 1,
     "Zwiebel und Knoblauch anbraten, Hack dazu, Tomaten einkochen, Nudeln kochen.", """
Spaghetti;raw:250;g
Hackfleisch gemischt;300;g
Zwiebel;1;Stück
Knoblauch;2;Stück
Tomaten gehackt;1;Dose
Tomatenmark;1;EL
Olivenöl;2;EL
Salz;;Prise
Pfeffer;;
""")
dish("G002", "Spaghetti Carbonara", 2, 780, "Pasta", "nein", "nein", "ja", 1,
     "Speck auslassen, Eier mit Parmesan verrühren, alles mit den heißen Nudeln mischen.", """
Spaghetti;250;g
Speck;150;g
Eier;3;Stück
Parmesan;60;g
Pfeffer;;
Salz;;Prise
""")
dish("G003", "Hähnchen-Curry mit Reis", 4, 650, "Curry,Reis", "ja", "nein", "ja", 1,
     "Hähnchen anbraten, Gemüse und Currypaste dazu, mit Kokosmilch ablöschen, Reis kochen.", """
Hähnchenbrust;500;g
Reis;300;g
Kokosmilch;0.4;l
Zwiebel;1;Stück
Currypaste;2;EL
Paprika;2;Stück
Knoblauch;2;Stück
Rapsöl;1;EL
Wasser;600;ml;nein
Salz;;Prise
""")
dish("G004", "Linsensuppe", 4, 420, "Suppe,vegetarisch", "nein", "nein", "Ja", 1,
     "Gemüse würfeln, mit Linsen und Brühe 25 Minuten kochen, pürieren.", """
Rote Linsen;250;g
Karotten;3;Stück
zwiebel ;1;Stück
Gemüsebrühe;1;l
Olivenöl;2;EL
Tomatenmark;1;EL
Zitronensaft;1;EL
Salz;;Prise
""")
dish("G005", "Kartoffelsuppe", 4, 380, "Suppe,vegetarisch", "nein", "nein", "ja", 1,
     "Gemüse und Kartoffeln würfeln, in Brühe weich kochen, mit Sahne abschmecken.", """
Kartoffeln;800;g
Karotten;2;Stück
Lauch;1;Stück
Zwiebel;1;Stück
Gemüsebrühe;1;l
Sahne;100;ml
Butter;20;g
Salz;;Prise
Pfeffer;;
""")
dish("G006", "Gemüselasagne", 4, 610, "Auflauf,vegetarisch", "nein", "nein", "ja", 1,
     "Gemüse anbraten, Béchamel kochen, schichten, 35 Minuten backen.", """
Lasagneplatten;250;g
Zucchini;2;Stück
Paprika;2;Stück
Tomaten gehackt;2;Dose
Mozzarella;250;g
Milch;500;ml
Butter;40;g
Mehl;40;g
Salz;;Prise
""")
dish("G007", "Chili con Carne", 4, 690, "Hackfleisch,scharf", "ja", "nein", "ja", 1,
     "Hack anbraten, Zwiebeln, Paprika und Tomaten dazu, 30 Minuten köcheln, Bohnen und Mais zugeben.", """
Hackfleisch gemischt;500;g
Kidneybohnen;1;Dose
Mais;1;Dose
Tomaten gehackt;1;Dose
Zwiebel;2;Stück
Paprika;1;Stück
Chilipulver;1;TL
Tomatenmark;2;EL
Salz;;Prise
""")
dish("G008", "Pfannkuchen", 2, None, "süß,vegetarisch", "nein", "nein", "", 1,
     "Teig rühren, 10 Minuten ruhen lassen, portionsweise ausbacken.", """
Mehl;200;g
Milch;300;ml
Eier;2;Stück
Butter;20;g
Zucker;1;EL
Salz;;Prise
""")
dish("G009", "Schnitzel mit Kartoffelsalat", 2, 850, "Fleisch,Klassiker", "nein", "nein", "ja", 1,
     "Kartoffelsalat anmachen, Schnitzel panieren und ausbacken.", """
Schweineschnitzel;2;Stück
Semmelbrösel;100;g
Eier;1;Stück
Mehl;50;g
Kartoffeln;600;g
Gewürzgurken;4;Stück
Zwiebel;1;Stück
Rapsöl;4;EL
Essig;2;EL
Salz;1;TL
""")
dish("G010", "Gebratener Reis mit Ei", 2, 560, "Reis,schnell", "nein", "nein", "ja", 1,
     "Reis kochen und abkühlen lassen, mit Gemüse und Ei im Wok braten.", """
Reis;200;g
Eier;2;Stück
Karotten;2;Stück
Erbsen TK;150;g
Sojasauce;3;EL
Frühlingszwiebel;1;Bund
Rapsöl;2;EL
""")
dish("G011", "Ofengemüse mit Feta", 2, 480, "vegetarisch,Ofen", "nein", "nein", "ja", 1,
     "Gemüse schneiden, mit Öl und Kräutern 30 Minuten backen, Feta darüber.", """
Zucchini;1;Stück
Paprika;2;Stück
Karotten;2;Stück
Süßkartoffel;400;g
Feta;200;g
Olivenöl;3;EL
Thymian;1;Bund
Salz;;Prise
Pfeffer;;
""")
dish("G012", "Lachs mit Brokkoli", 2, 590, "Fisch,diät", "ja", "nein", "ja", 1,
     "Kartoffeln kochen, Lachs in Butter braten, Brokkoli dämpfen.", """
Lachsfilet;300;g
Brokkoli;1;Stück
Kartoffeln;400;g
Zitrone;1;Stück
Butter;raw:1.5;EL
Olivenöl;1;EL
Salz;;Prise
Pfeffer;;
""")
dish("G013", "Kürbissuppe", 4, 340, "Suppe,vegetarisch", "nein", "nein", "ja", 1,
     "Kürbis würfeln, mit Zwiebeln anschwitzen, mit Brühe und Kokosmilch kochen, pürieren.", """
Hokkaido-Kürbis;1;Stück
Zwiebel;1;Stück
Kokosmilch;200;ml
Gemüsebrühe;600;ml
Ingwer;1;Stück
Olivenöl;2;EL
Salz;;Prise
""")
dish("G014", "Tortellini in Sahnesauce", 2, 700, "Pasta", "nein", "ja", "ja", 1,
     "Tortellini kochen, Schinken anbraten, mit Sahne ablöschen.", """
Tortellini;500;g
Sahne;200;ml
Schinken;100;g
Parmesan;40;g
Salz;;Prise
""")
dish("G015", "Rührei mit Brot", 2, 450, "Ei,schnell", "nein", "nein", "ja", 1,
     "Eier mit Milch verquirlen, in Butter stocken lassen, Brot toasten.", """
Eier;4;Stück
Butter;20;g
Brot;4;Stück
Schnittlauch;1;Bund
Milch;50;ml
Salz;;Prise
""")
dish("G016", "Kartoffelauflauf", 4, 640, "Auflauf,vegetarisch", "nein", "nein", "nein", 1,
     "Kartoffeln in Scheiben schichten, mit Sahne übergießen, mit Käse überbacken.", """
Kartoffeln;1;kg
Sahne;200;ml
Käse gerieben;150;g
Zwiebel;1;Stück
Knoblauch;2;Stück
Butter;20;g
Muskat;;Prise
""")
dish("G017", "Gulasch mit Nudeln", 4, 740, "Fleisch,Schmorgericht", "nein", "nein", "ja", 1,
     "Fleisch scharf anbraten, Zwiebeln und Paprika zugeben, 90 Minuten schmoren.", """
Rindergulasch;600;g
Zwiebel  ;3;Stück
Paprika;2;Stück
Tomatenmark;2;EL
Nudeln;400;g
Paprikapulver;2;TL
Gemüsebrühe;500;ml
Rapsöl;2;EL
""")
dish("G018", "Tomatensuppe mit Reis", 4, 360, "Suppe,vegetarisch", "nein", "nein", "ja", 1,
     "Zwiebel anschwitzen, Tomaten und Brühe zugeben, Reis darin garen.", """
Tomaten gehackt;2;Dose
Reis;150;g
Zwiebel;1;Stück
Gemüsebrühe;0.5;l
Sahne;100;ml
Olivenöl;1;EL
Basilikum;1;Bund
Salz;;Prise
""")
dish("G019", "Thai-Gemüsepfanne", 2, 430, "vegetarisch,Asia", "nein", "nein", "ja", 1,
     "Gemüse im Wok braten, mit Kokosmilch und Currypaste ablöschen, Reisnudeln dazu.", """
Reisnudeln;200;g
Paprika;1;Stück
Karotten;2;Stück
Brokkoli;1;Stück
Sojasauce;3;EL
Kokosmilch;200;ml
Currypaste;1;EL
Erdnüsse;50;g
""")
dish("G020", "Fischstäbchen mit Kartoffelpüree", 2, 610, "Fisch,Kinderklassiker", "nein", "nein", "ja", 1,
     "Kartoffeln kochen und stampfen, Fischstäbchen backen, Erbsen erhitzen.", """
Fischstäbchen;8;Stück
Kartoffeln;600;g
Milch;100;ml
Butter;30;g
Erbsen TK;200;g
Muskat;;Prise
""")
dish("G021", "Wraps mit Hähnchen", 2, 640, "Hähnchen,schnell", "nein", "nein", "ja", 1,
     "Hähnchen braten, Gemüse schneiden, Wraps füllen und aufrollen.", """
Wraps;4;Stk.
Hähnchenbrust;300;g
Paprika;1;Stück
Gurke;raw:0,5;Stück
Joghurt;150;g
Eisbergsalat;0.5;Stück
Salz;;Prise
""")
dish("G022", "Käsespätzle", 4, 820, "vegetarisch,Klassiker", "ja", "nein", "ja", 1,
     "Zwiebeln rösten, Spätzle mit Käse schichten, im Ofen überbacken.", """
Spätzle;500;g
Käse gerieben;250;g
Zwiebel;3;Stück
Butter;30;g
Schnittlauch;1;Bund
Salz;;Prise
Pfeffer;;
""")
dish("G023", "Grüne-Bohnen-Eintopf", 4, None, "Eintopf", "nein", "nein", "ja", 1,
     "Fleisch anbraten, Bohnen, Kartoffeln und Bohnenkraut in Brühe garen.", """
Grüne Bohnen;500;g
Kartoffeln;500;g
Rindfleisch;300;g
Zwiebel;1;Stück
Bohnenkraut;1;TL
Gemüsebrühe;800;ml
Salz;;Prise
""")
dish("G024", "Zucchini-Puffer", 2, 470, "vegetarisch", "nein", "nein", "ja", 1,
     "Zucchini raspeln, ausdrücken, mit Ei und Mehl mischen, braten.", """
Zucchini;2;Stück
Eier;2;Stück
Mehl;60;g
Feta;100;g
Joghurt;150;g
Rapsöl;3;EL
""")
dish("G025", "Putengeschnetzeltes mit Reis", 2, 600, "Pute,Reis,diät", "nein", "nein", "ja", 1,
     "Pute anbraten, Champignons und Zwiebeln dazu, mit Sahne ablöschen, Reis kochen.", """
Putenbrust;350;g
Reis;200;g
Champignons;250;g
Sahne;150;ml
 zwiebel;1;Stück
Rapsöl;1;EL
Salz;;Prise
Pfeffer;;
""")
dish("G026", "Shakshuka", 2, 440, "Ei,vegetarisch", "nein", "nein", "ja", 1,
     "Zwiebeln und Paprika anbraten, Tomaten einkochen, Eier hineinschlagen und stocken lassen.", """
Eier;4;Stück
Tomaten gehackt;1;Dose
Paprika;1;Stück
Zwiebel;1;Stück
Knoblauch;2;Stück
Kreuzkümmel;1;TL
Olivenöl;2;EL
Fladenbrot;2;Stück
""")
dish("G027", "Hackbällchen in Tomatensauce", 4, 680, "Hackfleisch,Pasta", "nein", "nein", "nein", 1,
     "Hackbällchen formen und braten, in Tomatensauce ziehen lassen, Nudeln kochen.", """
Hackfleisch gemischt;500;g
Eier;1;Stück
Semmelbrösel;50;g
Tomaten gehackt;2;Dose
Zwiebel;1;Stück
Knoblauch;2;Stück
Nudeln;400;g
Olivenöl;2;EL
""")
dish("G028", "Kichererbsen-Curry", 4, 520, "vegetarisch,Curry,Diät", "ja", "nein", "ja", 1,
     "Zwiebel und Ingwer anbraten, Gewürze, Tomaten, Kokosmilch und Kichererbsen 20 Minuten köcheln.", """
Kichererbsen;2;Dose
Kokosmilch;400;ml
Tomaten gehackt;1;Dose
Spinat;200;g
Zwiebel;1;Stück
Ingwer;1;Stück
Currypulver;2;TL
Reis;300;g
Salz;;Prise
""")
dish("G029", "Pellkartoffeln mit Quark", 2, 510, "vegetarisch,schnell", "nein", "nein", "ja", 1,
     "Kartoffeln kochen, Quark mit Leinöl und Schnittlauch anrühren.", """
Kartoffeln;800;g
Quark;500;g
Leinöl;2;el
Schnittlauch;1;Bund
Zwiebel;1;Stück
Salz;;Prise
""")
dish("G030", "Maultaschen in Brühe", 2, 560, "Suppe,schwäbisch", "nein", "nein", "nein", 1,
     "Brühe erhitzen, Maultaschen 10 Minuten ziehen lassen.", """
Maultaschen;6;Stück
Gemüsebrühe;1;l
Zwiebel;1;Stück
Schnittlauch;1;Bund
Karotten;1;Stück
""")
dish("G031", "Ratatouille mit Baguette", 4, 430, "vegetarisch,Gemüse", "nein", "ja", "ja", 1,
     "Gemüse würfeln, nacheinander anbraten, mit Tomaten 30 Minuten schmoren.", """
Aubergine;1;Stück
Zucchini;2;Stück
Paprika;2;Stück
Tomaten gehackt;1;Dose
Zwiebel;2;Stück
Knoblauch;2;Stück
Olivenöl;4;EL
Baguette;1;Stück
Thymian;1;Bund
""")
dish("G032", "Reispfanne mit Paprika", 2, 520, "Reis,schnell", "nein", "ja", "ja", 1,
     "Hähnchen und Paprika braten, Reis und Mais zugeben, mit Sojasauce würzen.", """
Reis;200;g
Paprika;2;Stück
Zwiebel;1;Stück
Mais;1;Dose
Hähnchenbrust;250;g
Sojasauce;2;EL
Rapsöl;2;EL
""")
dish("G033", "Spaghetti Bolognese", 2, 650, "Pasta,vegetarisch", "nein", "nein", "ja", 1,
     "Linsen statt Hack: Gemüse anbraten, Linsen und Tomaten zugeben, 20 Minuten köcheln.", """
Spaghetti;250;g
Tellerlinsen;150;g
Zwiebel;1;Stück
Karotten;1;Stück
Tomaten gehackt;1;Dose
Tomatenmark;1;EL
Olivenöl;2;EL
Salz;;Prise
""")
dish("G034", "Linsensuppe", 4, 520, "Suppe,Eintopf", "nein", "nein", "ja", 1,
     "Linsen und Gemüse in Brühe garen, Würstchen zum Schluss erhitzen, mit Essig abschmecken.", """
Tellerlinsen;300;g
Würstchen;4;Stück
Kartoffeln;400;g
Karotten;2;Stück
Zwiebel;1;Stück
Essig;1;EL
Gemüsebrühe;raw:1,5;l
Wasser;500;ML;Nein
Salz;;Prise
""")
dish("G035", "Frikadellen mit Gurkensalat", 2, 700, "Hackfleisch", "nein", "nein", "ja", 1,
     "Hackmasse formen und braten, Gurke hobeln und mit Joghurt-Dill anmachen.", """
Hackfleisch gemischt;400;g
Brötchen;1;Stück
Eier;1;Stück
Zwiebel;1;Stück
Gurke;1;Stück
Joghurt;150;g
Dill;1;Bund
Senf;1;TL
""")
dish("G036", "Blumenkohl-Gratin", 4, 480, "Auflauf,vegetarisch", "nein", "nein", "ja", 1,
     "Blumenkohl vorgaren, Sauce kochen, überbacken.", """
Blumenkohl;1;Stück
Käse gerieben;150;g
Sahne;200;ml
Milch;200;ml
Butter;30;g
Mehl;30;g
Muskat;;Prise
Salz;;Prise
""")
dish("G037", "Rindfleisch-Eintopf (Meal-Prep)", 6, 600, "Eintopf,Meal-Prep", "nein", "nein", "ja", 3,
     "Großen Topf ansetzen, 2 Stunden schmoren, portionsweise einfrieren oder drei Tage essen.", """
Rindfleisch;900;g
Kartoffeln;1;kg
Karotten;5;Stück
Lauch;2;Stück
Zwiebel;2;Stück
Gemüsebrühe;2;l
Tomatenmark;2;EL
Lorbeerblatt;2;Stück
Salz;;Prise
""")
dish("G038", "Griechischer Bauernsalat mit Fladenbrot", 2, 450, "vegetarisch,Salat", "nein", "nein", "ja", 1,
     "Gemüse schneiden, mit Feta, Oliven und Öl anmachen, Fladenbrot aufbacken.", """
Tomaten;4;Stück
Gurke;1;Stück
Feta;200;g
Oliven;100;g
Rote Zwiebel;1;Stück
Olivenöl;3;EL
Fladenbrot;2;Stück
Oregano;raw:½;TL
""")
dish("G039", "Erbsensuppe", 4, 390, "Suppe", "nein", "nein", "Nein", 1,
     "Kartoffeln und Erbsen in Brühe kochen, pürieren, Würstchen dazu.", """
Erbsen TK;600;g
Kartoffeln;400;g
Zwiebel;1;Stück
Gemüsebrühe;1;l
Sahne;100;ml
Würstchen;2;Stück
Salz;;Prise
""")
dish("G040", "Ente mit Rotkohl", 2, None, "Idee,Festtag", "nein", "nein", "ja", 1, "", "", status="idee")

BY_ID = {d["id"]: d for d in D}
assert len(D) == 40

# Bewertungen: 25 Stueck auf 12 Gerichten
BEW = [
    # Durchschnitt >= 4
    ("G003", "2026-10-03", 5, "sehr lecker", "René"), ("G003", "2026-10-24", 4, "", "Partnerin"), ("G003", "2026-11-07", 5, "gern wieder", "René"),
    ("G012", "2026-10-10", 4, "", "René"), ("G012", "2026-11-02", 5, "Lachs war top", "Partnerin"),
    ("G022", "2026-10-17", 5, "", "René"), ("G022", "2026-11-09", 4, "etwas fettig", "Partnerin"),
    ("G028", "2026-10-06", 4, "", "René"), ("G028", "2026-10-30", 5, "mehr Ingwer", "Partnerin"),
    # Durchschnitt <= 2
    ("G014", "2026-10-08", 2, "zu schwer", "René"), ("G014", "2026-10-29", 1, "", "Partnerin"),
    ("G024", "2026-10-12", 2, "matschig", "Partnerin"), ("G024", "2026-11-04", 2, "", "René"),
    ("G035", "2026-10-15", 1, "trocken", "René"), ("G035", "2026-11-06", 2, "", "Partnerin"),
    # nur eine Bewertung (hoch, zaehlt aber nicht fuer Rangliste und Gewicht)
    ("G011", "2026-10-20", 5, "überraschend gut", "René"),
    # Mitte
    ("G001", "2026-10-01", 3, "", "René"), ("G001", "2026-10-22", 4, "", "Partnerin"), ("G001", "2026-11-11", 3, "", "René"),
    ("G007", "2026-10-14", 3, "", "René"), ("G007", "2026-11-05", 4, "", "Partnerin"),
    ("G010", "2026-10-19", 3, "", "René"), ("G010", "2026-11-10", 3, "okay", "Partnerin"),
    ("G004", "2026-10-26", 2, "zu fad", "René"), ("G004", "2026-11-12", 3, "", "Partnerin"),
]
assert len(BEW) == 25 and len({b[0] for b in BEW}) == 12


def cell_menge(m):
    m = m.strip()
    if m == "":
        return None
    if m.startswith("raw:"):
        return m[4:]
    f = float(m)
    return int(f) if f == int(f) else f


def einkaufen_cell(i, nein=None):
    if nein is not None:
        return nein
    return ["ja", "Ja", "ja", "", "JA", "ja", "ja"][i % 7]


def to_date(s):
    return datetime.strptime(s, "%Y-%m-%d")


def build(path, dishes, bew, plan, settings, aktiv_override=None):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Gerichte"
    ws.append(H_GERICHTE)
    zs = wb.create_sheet("Zutaten")
    zs.append(H_ZUTATEN)
    ps = wb.create_sheet("Plan")
    ps.append(H_PLAN)
    bs = wb.create_sheet("Bewertungen")
    bs.append(H_BEW)
    es = wb.create_sheet("Einstellungen")
    es.append(H_EINST)
    ls = wb.create_sheet("Lebensmittel")
    ls.append(H_LEBENSMITTEL)
    rg = wb.create_sheet("Richtgewichte")
    rg.append(H_RICHTGEWICHTE)
    aus = wb.create_sheet("Ausgaben")
    aus.append(H_AUSGABEN)
    rowc = 0
    for idx, d in enumerate(dishes):
        aktiv = d["aktiv"] if aktiv_override is None else aktiv_override(d)
        angelegt = to_date("2026-09-01") + timedelta(days=(idx * 3) % 70)
        angelegt_cell = angelegt if idx % 9 != 4 else angelegt.strftime("%d.%m.%Y")
        ws.append([d["id"], d["name"], d["basis"], d["kcal"], d["tags"], d["fav"], d["nie"], aktiv,
                   d["tage"] if d["tage"] != 1 else (None if idx % 2 else 1), d["schritte"],
                   "Testdaten", angelegt_cell, "" if d["status"] == "fertig" and idx % 3 == 0 else d["status"], ""])
        for pos, line in enumerate(d["z"], start=1):
            parts = line.split(";")
            name, menge, einheit = parts[0], parts[1], parts[2]
            nein = parts[3] if len(parts) > 3 else None
            zs.append([d["id"], pos, name, cell_menge(menge), einheit or None, einkaufen_cell(rowc, nein) or None])
            rowc += 1
    for b in bew:
        bs.append([b[0], to_date(b[1]), b[2], b[3] or None, b[4]])
    for p in plan:
        ps.append(p)
    for k, v in settings:
        es.append([k, v])
    for sh in wb.worksheets:
        for col in sh.columns:
            sh.column_dimensions[col[0].column_letter].width = max(12, min(40, max(len(str(c.value or "")) for c in col) + 2))
    wb.save(path)


def plan_rows(start, picks, portionen, fixed=()):
    rows = []
    for i, gid in enumerate(picks):
        d = to_date(start) + timedelta(days=i)
        woche = to_date(start) + timedelta(days=(i // 7) * 7)
        rows.append([woche, d, gid, portionen, "ja" if i in fixed else "nein", datetime(2026, 11, 14, 9, 30), ""])
    return rows


def main():
    rnd = random.Random(20261114)
    std = [("standard_portionen", 2), ("wiederholungssperre_tage", 21)]

    # Basis
    build(OUT / "kochplaner_test.xlsx", D, BEW, [], std)

    # Anna
    build(OUT / "profile_anna.xlsx", D, BEW, [], [("standard_portionen", 1), ("wiederholungssperre_tage", 21)],
          aktiv_override=lambda d: "ja")

    # Ben und Clara: 14 Tage Historie (06.11. bis 19.11.2026)
    elig = [d["id"] for d in D if d["status"] == "fertig" and str(d["aktiv"]).lower() != "nein" and d["nie"] != "ja"]
    hist = rnd.sample(elig, 14)
    plan_bc = plan_rows("2026-11-06", hist[:7], 2, fixed=(1, 4)) + plan_rows("2026-11-13", hist[7:], 2)
    build(OUT / "profile_ben_clara.xlsx", D, BEW, plan_bc, std)

    # Weber: nur 6 aktive Gerichte, Historie 23.12. bis 29.12.2026
    weber_active = {"G004", "G007", "G013", "G022", "G036", "G037"}
    weber_hist = ["G007", "G022", "G037", "G004", "G013", "G036", "G007"]
    build(OUT / "profile_weber.xlsx", D, BEW, plan_rows("2026-12-23", weber_hist, 4),
          [("standard_portionen", 4), ("wiederholungssperre_tage", 21)],
          aktiv_override=lambda d: "ja" if d["id"] in weber_active else "nein")

    # Randfaelle
    build(OUT / "edge_empty.xlsx", [], [], [], [])
    small = []
    for d in D[:8]:
        c = dict(d)
        c["z"] = d["z"][:3]
        c["aktiv"] = "ja"
        c["nie"] = "nein"
        small.append(c)
    small[3] = dict(small[3], z=[])  # fertiges Gericht ohne Zutaten
    build(OUT / "edge_noingredients.xlsx", small, [], [], std)

    profiles = [
        dict(id="anna", name="Anna", datei="profile_anna.xlsx", start="2026-11-18", standard_portionen=1, sperre=21,
             beschreibung="Single, 1 Portion, 40 Gerichte aktiv, Plan leer"),
        dict(id="ben_clara", name="Ben und Clara", datei="profile_ben_clara.xlsx", start="2026-11-20", standard_portionen=2,
             sperre=21, beschreibung="Paar, 2 Portionen, 14 Tage Historie vom 06.11. bis 19.11.2026"),
        dict(id="weber", name="Familie Weber", datei="profile_weber.xlsx", start="2026-12-30", standard_portionen=4,
             sperre=21, beschreibung="4 Portionen, nur 6 aktive Gerichte inkl. Meal-Prep, Jahreswechsel"),
    ]
    (OUT / "profiles.json").write_text(json.dumps(profiles, ensure_ascii=False, indent=2), encoding="utf-8")

    # Szenarien (Eingaben fuer Einkaufszettel-Goldens)
    S = []

    def sc(id, datei, start, picks, desc):
        assert len(picks) == 7, id
        S.append(dict(id=id, datei=datei, start=start,
                      tage=[dict(gericht_id=g, portionen=p) for g, p in picks], beschreibung=desc))

    B = "kochplaner_test.xlsx"
    sc("H01_standard", B, "2026-11-18", [(g, 2) for g in ["G001", "G004", "G007", "G012", "G022", "G028", "G031"]],
       "sieben verschiedene Gerichte, je 2 Portionen")
    sc("H02_gkg_mix", B, "2026-11-18", [("G005", 2), ("G037", 3), ("G009", 2), ("G034", 4), ("G013", 2), ("G023", 4), ("G029", 2)],
       "Kartoffeln g und kg zu 3,2 kg, Gemuesebruehe l und ml zu 4,1 l")
    sc("H03_stueck", B, "2026-11-18", [("G001", 3), ("G004", 3), ("G015", 3), ("G002", 1), ("G026", 5), ("G010", 1), ("G021", 3)],
       "Stueckzutaten, Aufrunden auf 0,5 erst nach dem Addieren, Schreibweisen von Zwiebel")
    sc("H04_ohne_menge", B, "2026-11-18", [("G001", 2), ("G002", 2), ("G009", 2), ("G008", 2), ("G003", 4), ("G012", 2), ("G020", 2)],
       "Zutaten ohne Menge: Salz geht in der Menge auf, Pfeffer bleibt ohne Menge")
    sc("H05_wasser", B, "2026-11-18", [("G003", 4), ("G034", 4), ("G018", 4), ("G013", 4), ("G005", 4), ("G006", 4), ("G017", 4)],
       "einkaufen = nein bei Wasser, ml und l gemischt")
    sc("H06_extrem", B, "2026-11-18", [("G001", 1), ("G001", 20), ("G037", 20), ("G003", 1), ("G022", 20), ("G028", 1), ("G007", 20)],
       "Portionen 1 und 20, dasselbe Gericht zweimal")
    sc("H07_wiederholung", B, "2026-11-18", [("G001", 2), ("G001", 3), ("G001", 5), ("G004", 2), ("G004", 3), ("G007", 2), ("G007", 5)],
       "dasselbe Gericht mehrfach mit verschiedenen Portionen")
    sc("H08_idee", B, "2026-11-18", [("G040", 2), ("G001", 2), ("G004", 2), ("G007", 2), ("G012", 2), ("G022", 2), ("G028", 2)],
       "Idee ohne Zutaten im Plan darf nichts kaputt machen")
    sc("H09_doppelte_namen", B, "2026-11-18", [("G001", 2), ("G033", 2), ("G004", 4), ("G034", 4), ("G011", 2), ("G012", 2), ("G021", 2)],
       "zwei Gerichte mit gleichem Namen, gemeinsame Zutaten")
    sc("H10_weber", "profile_weber.xlsx", "2026-12-30", [("G037", 4), ("G007", 4), ("G022", 4), ("G013", 4), ("G036", 4), ("G004", 4), ("G037", 4)],
       "Weber, Meal-Prep-Gericht zweimal, Jahreswechsel")
    sc("H11_anna", "profile_anna.xlsx", "2026-11-18", [(g, 1) for g in ["G001", "G002", "G003", "G005", "G006", "G007", "G009"]],
       "Anna, je 1 Portion")
    sc("H12_brueche", B, "2026-11-18", [("G038", 3), ("G021", 3), ("G012", 1), ("G038", 1), ("G029", 3), ("G015", 1), ("G026", 3)],
       "Bruchmengen, Dezimalkomma und Text-Zahlen in den Zellen")
    sc("H13_ohne_zutaten", "edge_noingredients.xlsx", "2026-11-18", [("G001", 2), ("G002", 2), ("G003", 2), ("G004", 2), ("G005", 2), ("G006", 2), ("G007", 2)],
       "fertiges Gericht ohne Zutaten (G004) im Plan")

    pools = {}
    for name in ["kochplaner_test.xlsx", "profile_anna.xlsx", "profile_ben_clara.xlsx", "profile_weber.xlsx"]:
        if name == "profile_weber.xlsx":
            pools[name] = sorted(weber_active)
        elif name == "profile_anna.xlsx":
            pools[name] = [d["id"] for d in D if d["status"] == "fertig"]
        else:
            pools[name] = [d["id"] for d in D if d["status"] == "fertig" and str(d["aktiv"]).lower() != "nein"]
    portion_choices = [1, 2, 2, 2, 3, 4, 4, 5, 6, 8, 10, 12, 20]
    for i in range(1, 21):
        datei = rnd.choice(list(pools))
        picks = [(rnd.choice(pools[datei]), rnd.choice(portion_choices)) for _ in range(7)]
        start = date(2026, 11, 1) + timedelta(days=rnd.randrange(0, 150))
        sc(f"R{i:02d}_zufall", datei, start.isoformat(), picks, f"Zufallsplan {i}, Datei {datei}")

    (OUT / "scenarios.json").write_text(json.dumps(S, ensure_ascii=False, indent=2), encoding="utf-8")
    print("ok:", ", ".join(sorted(p.name for p in OUT.glob("*.xlsx"))), f"| {len(S)} Szenarien")


if __name__ == "__main__":
    sys.exit(main())
