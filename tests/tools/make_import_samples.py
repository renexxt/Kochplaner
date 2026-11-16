#!/usr/bin/env python3
"""Erzeugt fuenf synthetische Rezept-Screenshots (PNG, darunter ein langer) und je eine JSON-Datei mit den Zeilen,
die der Claude-Chat-Import daraus schreiben soll. Alles erfunden, keine echten Daten.
  python3 tests/tools/make_import_samples.py        -> tests/fixtures/import/
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "import"
FONTS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf"]
QUELLE = "Screenshot 14.11.2026"

REZEPTE = [
    ("rezept1_kuerbissuppe", "Hokkaido-Cremesuppe", 4, 320, "Suppe, vegetarisch", [
        ("Hokkaido-Kürbis", "1", "kg"), ("Zwiebel", "2", "Stück"), ("Olivenöl", "1", "EL"), ("Gemüsebrühe", "800", "ml"),
        ("Kokosmilch", "200", "ml"), ("Salz", "", "")],
     "Kürbis würfeln, mit Zwiebeln anbraten, mit Brühe auffüllen, 20 Minuten kochen, pürieren, Kokosmilch einrühren."),
    ("rezept2_pfannkuchen", "Buttermilch-Crêpes", 2, None, "süß, schnell", [
        ("Mehl", "250", "g"), ("Milch", "500", "ml"), ("Eier", "3", "Stück"), ("Salz", "", "Prise"), ("Butter", "2", "EL")],
     "Teig verrühren, 10 Minuten ruhen lassen, in Butter ausbacken."),
    ("rezept3_lasagne_lang", "Ratatouille-Lasagne", 6, 540, "Auflauf, vegetarisch", [
        ("Lasagneplatten", "250", "g"), ("Zucchini", "2", "Stück"), ("Paprika", "2", "Stück"), ("Aubergine", "1", "Stück"),
        ("Passierte Tomaten", "700", "g"), ("Zwiebel", "1", "Stück"), ("Knoblauch", "2", "Stück"), ("Mozzarella", "250", "g"),
        ("Parmesan", "50", "g"), ("Butter", "40", "g"), ("Mehl", "40", "g"), ("Milch", "0,5", "l")],
     "Gemüse anbraten und mit Tomaten köcheln. Béchamel aus Butter, Mehl und Milch rühren. Schichten: Sauce, Platten, Béchamel, Gemüse. "
     "Mit Käse bestreuen und 40 Minuten bei 180 Grad backen. Fünf Minuten ruhen lassen."),
    ("rezept4_nur_name", "Pizza Hawaii", None, None, "Idee", [], ""),
    ("rezept5_reisbrei", "Milchreis mit Zimt", 2, 410, "süß", [
        ("Rundkornreis", "200", "g"), ("Milch", "1,5", "l"), ("Zimt", "0,5", "TL"), ("Zucker", "2", "EL"), ("Apfelmus", "1", "Packung")],
     "Reis in der Milch 35 Minuten quellen lassen, süßen, mit Zimt und Apfelmus servieren."),
]


def font(size):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def zeichne(pfad, titel, portionen, kcal, zutaten, schritte, hoch=False):
    w, h = (900, 3200) if hoch else (900, 1500)
    img = Image.new("RGB", (w, h), "#fffdf8")
    d = ImageDraw.Draw(img)
    y = 40
    d.text((40, y), titel, fill="#222", font=font(54)); y += 90
    if portionen:
        d.text((40, y), f"Für {portionen} Portionen" + (f" · {kcal} kcal pro Portion" if kcal else ""), fill="#555", font=font(30)); y += 60
    if zutaten:
        d.text((40, y), "Zutaten", fill="#2f6b4f", font=font(38)); y += 60
        for n, m, e in zutaten:
            d.text((60, y), f"•  {m} {e} {n}".replace("  ", " ").strip() if m or e else f"•  {n} nach Geschmack", fill="#222", font=font(32)); y += 50
        y += 30
    if schritte:
        d.text((40, y), "Zubereitung", fill="#2f6b4f", font=font(38)); y += 60
        zeile = ""
        for wort in schritte.split():
            if d.textlength(zeile + " " + wort, font=font(30)) > w - 100:
                d.text((60, y), zeile.strip(), fill="#222", font=font(30)); y += 44; zeile = wort
            else:
                zeile += " " + wort
        d.text((60, y), zeile.strip(), fill="#222", font=font(30))
    img.save(pfad)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, titel, port, kcal, tags, zutaten, schritte in REZEPTE:
        zeichne(OUT / f"{name}.png", titel, port, kcal, zutaten, schritte, hoch=name.startswith("rezept3"))
        zeilen = {
            "bild": f"{name}.png",
            "gericht": {"name": titel, "basis_portionen": port or 2, "kcal_pro_portion": kcal if kcal else "", "tags": tags, "quelle": QUELLE,
                        "status": "fertig" if zutaten else "idee", "schritte": schritte},
            "zutaten": [{"name": n, "menge": m.replace(",", "."), "einheit": e, "einkaufen": "ja"} for n, m, e in zutaten],
        }
        (OUT / f"{name}.json").write_text(json.dumps(zeilen, ensure_ascii=False, indent=1), encoding="utf-8")
    print("geschrieben:", OUT, len(REZEPTE), "Rezepte")


if __name__ == "__main__":
    main()
