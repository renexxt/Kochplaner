#!/usr/bin/env python3
"""Selbsttest: prueft (1) die Testdaten gegen die Vorgaben im Zieldokument und
(2) das Orakel gegen von Hand gerechnete Werte (nicht aus dem Orakel abgeleitet).

Aufruf: python3 oracle/selftest.py
"""
import json
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "oracle"))
import oracle as O  # noqa: E402

DATA = ROOT / "data"


def load(name):
    return O.normalize(O.dump_raw(DATA / name))


class TestTestdaten(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.n = load("kochplaner_test.xlsx")
        cls.raw = O.dump_raw(DATA / "kochplaner_test.xlsx")
        cls.g = cls.n["gerichte"]

    def test_vierzig_gerichte_ids(self):
        self.assertEqual([x["id"] for x in self.g], [f"G{i:03d}" for i in range(1, 41)])

    def test_zutatenanzahl(self):
        for x in self.g:
            if x["status"] == "idee":
                self.assertEqual(len(x["zutaten"]), 0)
            else:
                self.assertTrue(3 <= len(x["zutaten"]) <= 10, (x["id"], len(x["zutaten"])))

    def test_flags(self):
        self.assertEqual(sum(x["favorit"] for x in self.g), 6)
        self.assertEqual(sum(x["nie_wieder"] for x in self.g), 3)
        self.assertEqual(sum(not x["aktiv"] for x in self.g), 4)
        self.assertEqual(sum(1 for x in self.g if x["kcal_pro_portion"] is None and x["status"] == "fertig"), 2)
        self.assertEqual(sum(1 for x in self.g if x["reicht_fuer_tage"] == 3), 1)
        self.assertEqual(sum(1 for x in self.g if x["status"] == "idee"), 1)

    def test_doppelte_namen(self):
        names = [x["name"] for x in self.g]
        dups = {n for n in names if names.count(n) > 1}
        self.assertEqual(len(dups), 2)

    def test_stueck_ohne_menge_wasser(self):
        z = [(x["id"], q) for x in self.g for q in x["zutaten"]]
        self.assertGreaterEqual(len({i for i, q in z if q["einheit"] == "Stück"}), 3)
        self.assertGreaterEqual(len({i for i, q in z if q["menge"] is None}), 2)
        wasser = [q for _i, q in z if q["name"] == "Wasser"]
        self.assertTrue(wasser and all(not q["einkaufen"] for q in wasser))

    def test_schreibweisen_roh(self):
        names = {r["name"] for r in self.raw["Zutaten"]}
        self.assertIn("zwiebel ", names)
        self.assertIn("Zwiebel", names)
        self.assertTrue(any(isinstance(r["menge"], str) and "," in r["menge"] for r in self.raw["Zutaten"]))
        self.assertTrue(any(r["einheit"] == "ML" for r in self.raw["Zutaten"]))
        # beide Einheiten-Familien kommen vor
        units = {q["einheit"] for x in self.g for q in x["zutaten"]}
        self.assertTrue({"g", "kg", "ml", "l"} <= units)

    def test_bewertungen(self):
        b = self.n["bewertungen"]
        self.assertEqual(len(b), 25)
        st = O.rating_stats(self.n)
        self.assertEqual(len(st), 12)
        self.assertEqual(sum(1 for s in st.values() if s["anzahl"] >= 2 and s["durchschnitt"] >= 4), 4)
        self.assertEqual(sum(1 for s in st.values() if s["anzahl"] >= 2 and s["durchschnitt"] <= 2), 3)
        self.assertEqual(sum(1 for s in st.values() if s["anzahl"] == 1), 1)

    def test_profile(self):
        anna = load("profile_anna.xlsx")
        self.assertEqual(anna["einstellungen"]["standard_portionen"], 1)
        self.assertEqual(sum(g["aktiv"] for g in anna["gerichte"]), 40)
        self.assertEqual(anna["plan"], [])
        bc = load("profile_ben_clara.xlsx")
        self.assertEqual(len(bc["plan"]), 14)
        self.assertEqual(bc["plan"][0]["datum"], "2026-11-06")
        self.assertEqual(bc["plan"][-1]["datum"], "2026-11-19")
        self.assertEqual(len({p["gericht_id"] for p in bc["plan"]}), 14)
        w = load("profile_weber.xlsx")
        self.assertEqual(w["einstellungen"]["standard_portionen"], 4)
        self.assertEqual(sorted(g["id"] for g in w["gerichte"] if g["aktiv"] and g["status"] == "fertig"),
                         ["G004", "G007", "G013", "G022", "G036", "G037"])
        self.assertEqual(len(O.eligible_ids(w)), 6)  # 6 aktive, keine davon nie_wieder

    def test_randfaelle(self):
        e = load("edge_empty.xlsx")
        self.assertEqual((e["gerichte"], e["plan"], e["bewertungen"]), ([], [], []))
        self.assertEqual(e["einstellungen"], {"standard_portionen": 2, "wiederholungssperre_tage": 21})
        k = load("edge_noingredients.xlsx")
        self.assertEqual(len(k["gerichte"]), 8)
        self.assertEqual(len([g for g in k["gerichte"] if not g["zutaten"]]), 1)


class TestOrakelHandgerechnet(unittest.TestCase):
    """Alle Erwartungswerte hier sind von Hand aus den Testdaten gerechnet."""

    @classmethod
    def setUpClass(cls):
        cls.n = load("kochplaner_test.xlsx")

    def zeilen(self, tage, n=None):
        return O.shopping_list(n or self.n, [dict(gericht_id=g, portionen=p) for g, p in tage])["zeilen"]

    def test_kg_und_liter(self):
        z = self.zeilen([("G005", 2), ("G037", 3), ("G009", 2), ("G034", 4), ("G013", 2), ("G023", 4), ("G029", 2)])
        # Kartoffeln: 400 + 500 + 600 + 400 + 500 + 800 = 3200 g
        self.assertIn("3,2 kg Kartoffeln", z)
        # Gemuesebruehe: 500 + 1000 + 1500 + 300 + 800 = 4100 ml
        self.assertIn("4,1 l Gemüsebrühe", z)
        # Wasser steht nicht auf der Liste (einkaufen = nein)
        self.assertFalse(any("Wasser" in x for x in z))

    def test_stueck_aufrunden_nach_summe(self):
        z = self.zeilen([("G001", 3), ("G004", 3), ("G015", 3), ("G002", 1), ("G026", 5), ("G010", 1), ("G021", 3)])
        # Zwiebel: 1,5 + 0,75 + 2,5 = 4,75 -> 5 (Schreibweise "zwiebel " wird mitgezaehlt)
        self.assertIn("5 Stück Zwiebel", z)
        # Eier: 1,5 + 6 + 10 + 1 = 18,5
        self.assertIn("18,5 Stück Eier", z)
        # Knoblauch: 3 + 5 = 8
        self.assertIn("8 Stück Knoblauch", z)
        # Rote Linsen: 250 g * 3/4 = 187,5 g (keine Rundung auf Stueck)
        self.assertIn("187,5 g Rote Linsen", z)

    def test_ohne_menge(self):
        z = self.zeilen([("G001", 2), ("G002", 2), ("G009", 2), ("G008", 2), ("G003", 4), ("G012", 2), ("G020", 2)])
        # Salz: 1 TL aus G009 (1 TL * 2/2), die mengenlosen Salz-Zeilen gehen darin auf
        self.assertIn("1 TL Salz", z)
        self.assertNotIn("Salz", z)
        # Pfeffer kommt nur ohne Menge vor
        self.assertIn("Pfeffer", z)
        # Butter in g und in EL bleibt getrennt: 20 + 30 g, 1,5 EL
        self.assertIn("50 g Butter", z)
        self.assertIn("1,5 EL Butter", z)
        self.assertLess(z.index("1,5 EL Butter"), z.index("50 g Butter"))

    def test_kaufmaennisch_runden_und_extreme(self):
        z = self.zeilen([("G001", 1), ("G001", 20), ("G037", 20), ("G003", 1), ("G022", 20), ("G028", 1), ("G007", 20)])
        # Spaghetti: 250 * 1/2 + 250 * 20/2 = 125 + 2500 = 2625 g = 2,625 kg -> 2,63
        self.assertIn("2,63 kg Spaghetti", z)

    def test_skalierung_5_portionen(self):
        # G001 ist fuer 2 Portionen angegeben; 5 Portionen = Faktor 2,5
        z = self.zeilen([("G001", 5)])
        self.assertEqual(z, ["750 g Hackfleisch gemischt", "5 Stück Knoblauch", "5 EL Olivenöl", "Pfeffer", "Salz",
                             "625 g Spaghetti", "2,5 Dose Tomaten gehackt", "2,5 EL Tomatenmark", "2,5 Stück Zwiebel"])
        # 2 Portionen = Ausgangswerte
        z2 = self.zeilen([("G001", 2)])
        self.assertIn("250 g Spaghetti", z2)
        self.assertIn("300 g Hackfleisch gemischt", z2)
        self.assertIn("1 Stück Zwiebel", z2)
        # 1 Portion: Zwiebel 0,5
        self.assertIn("0,5 Stück Zwiebel", self.zeilen([("G001", 1)]))

    def test_idee_im_plan(self):
        z = self.zeilen([("G040", 2), ("G001", 2), ("G004", 2), ("G007", 2), ("G012", 2), ("G022", 2), ("G028", 2)])
        self.assertTrue(z)

    def test_kcal(self):
        v = O.day_views(self.n, "2026-11-18", [dict(gericht_id="G001", portionen=3), dict(gericht_id="G008", portionen=2)] + [
            dict(gericht_id="G004", portionen=1)] * 5)
        self.assertEqual(v[0]["kcal_gesamt"], 2160)
        self.assertIsNone(v[1]["kcal_pro_portion"])
        self.assertIsNone(v[1]["kcal_gesamt"])

    def test_sortierung_umlaute(self):
        mk = lambda n, e: {"name": n, "_menge": O.Fraction(1), "einheit": e, "einkaufen": True}
        norm = {"gerichte": [{"id": "X", "_basis": O.Fraction(1), "zutaten": [
            mk("Zucker", "g"), mk("Äpfel", "Stück"), mk("Apfelsaft", "l"), mk("Öl", "EL"), mk("Olive", "Stück")]}]}
        z = O.shopping_list(norm, [dict(gericht_id="X", portionen=1)])["zeilen"]
        # DIN 5007-1: Umlaute wie Grundbuchstabe, kuerzerer Name zuerst
        self.assertEqual([x.split(" ", 2)[-1] for x in z], ["Äpfel", "Apfelsaft", "Öl", "Olive", "Zucker"])

    def test_gewichte(self):
        w = O.weights(self.n)
        self.assertEqual(w["G003"], 3.0)   # Favorit x2, Durchschnitt 4,67 x1,5
        self.assertEqual(w["G001"], 2.0)   # Favorit, Durchschnitt 3,33
        self.assertEqual(w["G014"], 0.5)   # Durchschnitt 1,5
        self.assertEqual(w["G011"], 1.0)   # nur eine Bewertung (5): kein Bonus
        self.assertEqual(w["G002"], 1.0)

    def test_rangliste(self):
        r = O.ranking(self.n)
        ids = [x["gericht_id"] for x in r["alle"]]
        # Durchschnitte: G003 4,67; G022/G028/G012 je 4,5 (Gleichstand: Name Kaesespaetzle, Kichererbsen, Lachs);
        # G007 3,5; G001 3,33; G010 3; G004 2,5; G024 2; G035/G014 je 1,5 (Frikadellen vor Tortellini)
        self.assertEqual(ids, ["G003", "G022", "G028", "G012", "G007", "G001", "G010", "G004", "G024", "G035", "G014"])
        self.assertNotIn("G011", ids)  # nur eine Bewertung
        self.assertEqual(r["beste"], ["G003", "G022", "G028", "G012", "G007"])
        self.assertEqual(r["schwaechste"], ["G014", "G035", "G024", "G004", "G010"])
        self.assertEqual(r["alle"][0]["durchschnitt"], 4.6667)

    def test_wochentage(self):
        wd = O.week_days("2026-11-18")
        self.assertEqual([d["kurz"] for d in wd], ["Mi", "Do", "Fr", "Sa", "So", "Mo", "Di"])
        self.assertEqual(wd[-1]["datum"], "2026-11-24")
        self.assertEqual(O.week_days("2026-11-20")[-1]["datum"], "2026-11-26")
        self.assertEqual(O.week_days("2026-12-30")[3]["datum"], "2027-01-02")   # Jahreswechsel
        self.assertEqual(O.week_days("2028-02-26")[3]["datum"], "2028-02-29")   # Schaltjahr
        self.assertEqual(O.week_days("2027-02-26")[3]["datum"], "2027-03-01")   # kein Schaltjahr
        self.assertEqual(O.week_days("2026-10-21")[5]["datum"], "2026-10-26")   # Zeitumstellung 25.10.2026
        self.assertEqual(O.week_days("2027-03-24")[6]["datum"], "2027-03-30")   # Zeitumstellung 28.03.2027
        for s in O.DATE_STARTS:
            ds = [date.fromisoformat(d["datum"]) for d in O.week_days(s)]
            self.assertEqual([(b - a).days for a, b in zip(ds, ds[1:])], [1] * 6)

    def test_zahlen_lesen(self):
        P = O.parse_amount
        self.assertEqual(P("1,5"), O.Fraction(3, 2))
        self.assertEqual(P("1.5"), O.Fraction(3, 2))
        self.assertEqual(P("½"), O.Fraction(1, 2))
        self.assertEqual(P("1½"), O.Fraction(3, 2))
        self.assertEqual(P("1 1/2"), O.Fraction(3, 2))
        self.assertEqual(P("1/4"), O.Fraction(1, 4))
        self.assertEqual(P(" 250 "), 250)
        self.assertIsNone(P(""))
        self.assertIsNone(P("viel"))
        self.assertEqual(O.fmt_num(O.Fraction(5, 2)), "2,5")
        self.assertEqual(O.fmt_num(O.Fraction(2625, 1000)), "2,63")
        self.assertEqual(O.fmt_num(O.Fraction(3)), "3")


if __name__ == "__main__":
    unittest.main(verbosity=1)
