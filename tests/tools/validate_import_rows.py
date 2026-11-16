#!/usr/bin/env python3
"""Schema-Pruefung fuer Zeilen, die der Claude-Chat-Import in die Tabs Gerichte und Zutaten schreibt (F19).

Prueft nur das Format laut Datenmodell (Zieldokument), nicht die Bilderkennung.
  python3 tests/tools/validate_import_rows.py DUMP.json     (DUMP = Inhalt der Tabs als JSON, z. B. /__mock/dump)
Als Modul: validate(gerichte, zutaten) -> Liste von Fehlertexten (leer = in Ordnung).
"""
import json
import re
import sys
from datetime import date

GERICHTE = ["id", "name", "basis_portionen", "kcal_pro_portion", "tags", "favorit", "nie_wieder", "aktiv",
            "reicht_fuer_tage", "schritte", "quelle", "angelegt_am", "status"]
ZUTATEN = ["gericht_id", "pos", "name", "menge", "einheit", "einkaufen"]
EINHEITEN = {"", "g", "kg", "ml", "l", "EL", "TL", "Stück", "Dose", "Bund", "Packung", "Prise"}
JANEIN = {"ja", "nein"}


def _zahl(x):
    if isinstance(x, (int, float)) and not isinstance(x, bool):
        return float(x)
    if isinstance(x, str) and re.fullmatch(r"\d+([.,]\d+)?", x.strip()):
        return float(x.strip().replace(",", "."))
    return None


def _datum(x):
    s = str(x)[:10]
    try:
        date.fromisoformat(s)
        return True
    except ValueError:
        return False


def validate(gerichte, zutaten):
    fehler = []
    ids = [g.get("id") for g in gerichte]
    if len(set(ids)) != len(ids):
        fehler.append("id nicht eindeutig")
    for g in gerichte:
        gid = g.get("id", "?")
        fehlt = [c for c in GERICHTE if c not in g]
        if fehlt:
            fehler.append(f"{gid}: Spalten fehlen: {fehlt}")
            continue
        if not re.fullmatch(r"G\d{3,}", str(gid)):
            fehler.append(f"{gid}: id muss G und mindestens drei Ziffern sein")
        if not str(g["name"]).strip():
            fehler.append(f"{gid}: name fehlt")
        b = _zahl(g["basis_portionen"])
        if b is None or b != int(b) or not 1 <= b <= 99:
            fehler.append(f"{gid}: basis_portionen muss eine ganze Zahl von 1 bis 99 sein (ist {g['basis_portionen']!r})")
        if str(g["kcal_pro_portion"]).strip() != "":
            k = _zahl(g["kcal_pro_portion"])
            if k is None or not 0 < k <= 5000:
                fehler.append(f"{gid}: kcal_pro_portion leer lassen oder Zahl > 0 (ist {g['kcal_pro_portion']!r}), nie 0 oder geschaetzt")
        for c in ("favorit", "nie_wieder", "aktiv"):
            if str(g[c]).strip().lower() not in JANEIN:
                fehler.append(f"{gid}: {c} muss ja oder nein sein (ist {g[c]!r})")
        if str(g["reicht_fuer_tage"]).strip() != "" and (_zahl(g["reicht_fuer_tage"]) is None or not 1 <= _zahl(g["reicht_fuer_tage"]) <= 7):
            fehler.append(f"{gid}: reicht_fuer_tage leer oder 1 bis 7 (ist {g['reicht_fuer_tage']!r})")
        if not _datum(g["angelegt_am"]):
            fehler.append(f"{gid}: angelegt_am muss ein Datum JJJJ-MM-TT sein (ist {g['angelegt_am']!r})")
        if str(g["status"]) not in ("fertig", "idee", ""):
            fehler.append(f"{gid}: status muss fertig oder idee sein (ist {g['status']!r})")
        z = sorted([x for x in zutaten if x.get("gericht_id") == gid], key=lambda x: x.get("pos", 0))
        if str(g["status"]) == "idee" and z:
            fehler.append(f"{gid}: status idee, aber es gibt Zutaten")
        if str(g["status"]) in ("fertig", "") and not z:
            fehler.append(f"{gid}: status fertig, aber keine Zutaten (dann status idee)")
        if [x.get("pos") for x in z] != list(range(1, len(z) + 1)):
            fehler.append(f"{gid}: pos muss 1 bis {len(z)} lueckenlos sein (ist {[x.get('pos') for x in z]})")
    for x in zutaten:
        gid = x.get("gericht_id", "?")
        fehlt = [c for c in ZUTATEN if c not in x]
        if fehlt:
            fehler.append(f"Zutat bei {gid}: Spalten fehlen: {fehlt}")
            continue
        if gid not in ids:
            fehler.append(f"Zutat '{x['name']}': gericht_id {gid} gibt es nicht")
        if not str(x["name"]).strip():
            fehler.append(f"{gid} pos {x['pos']}: Zutatenname fehlt")
        if str(x["menge"]).strip() != "" and _zahl(x["menge"]) is None:
            fehler.append(f"{gid} {x['name']}: menge ist keine Zahl (ist {x['menge']!r})")
        if x["einheit"] not in EINHEITEN:
            fehler.append(f"{gid} {x['name']}: einheit {x['einheit']!r} ist nicht erlaubt")
        if str(x["einkaufen"]).strip().lower() not in JANEIN:
            fehler.append(f"{gid} {x['name']}: einkaufen muss ja oder nein sein")
    return fehler


if __name__ == "__main__":
    d = json.load(open(sys.argv[1], encoding="utf-8"))
    f = validate(d["Gerichte"], d["Zutaten"])
    print("\n".join(f) if f else "in Ordnung")
    sys.exit(1 if f else 0)
