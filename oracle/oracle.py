#!/usr/bin/env python3
"""oracle.py - unabhaengiges Orakel fuer den Kochplaner.

Rechnet die erwarteten Werte direkt aus den xlsx-Dateien und den Plan-Eingaben.
Kein Zugriff auf App-Code. Rechnet exakt mit Bruechen (fractions.Fraction).

Befehle:
  python3 oracle/oracle.py golden            erzeugt data/golden/*.json
  python3 oracle/oracle.py shopping DATEI PLAN.json   Einkaufszettel fuer einen Plan (Debug)

Festlegungen (siehe docs/DECISIONS.md): leere Zelle favorit/nie_wieder = nein, aktiv = ja,
einkaufen = ja, status = fertig, reicht_fuer_tage = 1; Anzeige auf 2 Nachkommastellen
kaufmaennisch gerundet; Stueck erst nach dem Addieren auf 0,5 aufrunden.
"""
import argparse
import json
import math
import re
import sys
import unicodedata
from datetime import date, datetime, timedelta
from fractions import Fraction
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
TABS = ["Gerichte", "Zutaten", "Plan", "Bewertungen", "Einstellungen", "Lebensmittel", "Richtgewichte"]
WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]

# ---------------------------------------------------------------------------
# Rohdaten (so, wie Apps Script sie aus dem Sheet liefern wuerde, ohne Bereinigung)
# ---------------------------------------------------------------------------


def _cell_json(v):
    if v is None:
        return ""
    if isinstance(v, datetime):
        if v.hour == 0 and v.minute == 0 and v.second == 0:
            return v.strftime("%Y-%m-%d")
        return v.strftime("%Y-%m-%dT%H:%M:%S")
    if isinstance(v, date):
        return v.isoformat()
    return v


def dump_raw(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    out = {}
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        recs = []
        if rows:
            header = [str(h).strip() if h is not None else "" for h in rows[0]]
            for r in rows[1:]:
                if all(v is None or v == "" for v in r):
                    continue
                recs.append({h: _cell_json(v) for h, v in zip(header, r) if h})
        out[ws.title] = recs
    return out


# ---------------------------------------------------------------------------
# Tolerantes Lesen
# ---------------------------------------------------------------------------
_VULGAR = {"½": Fraction(1, 2), "¼": Fraction(1, 4), "¾": Fraction(3, 4), "⅓": Fraction(1, 3), "⅔": Fraction(2, 3),
           "⅛": Fraction(1, 8)}


def parse_amount(v):
    """Zahl, Text mit Komma oder Punkt, Bruch (1/2, ½, 1 1/2, 1½) -> Fraction oder None."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return Fraction(str(v))
    s = str(v).strip()
    if s == "":
        return None
    total = Fraction(0)
    for ch, fr in _VULGAR.items():
        if ch in s:
            s = s.replace(ch, " ")
            total += fr
    s = s.strip()
    if s:
        parts = s.split()
        for p in parts:
            m = re.fullmatch(r"(\d+)/(\d+)", p)
            if m and int(m.group(2)) != 0:
                total += Fraction(int(m.group(1)), int(m.group(2)))
                continue
            p2 = p.replace(",", ".") if "." not in p else p.replace(",", "")
            if not re.fullmatch(r"\d+(\.\d+)?", p2):
                return None
            total += Fraction(p2)
    return total


def to_bool(v, default):
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    s = str(v).strip().casefold() if v is not None else ""
    if s in ("ja", "j", "yes", "y", "true", "wahr", "1", "x"):
        return True
    if s in ("nein", "n", "no", "false", "falsch", "0"):
        return False
    return default


def parse_date(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v).strip() if v is not None else ""
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", s)
    if m:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
    return None


_UNITS = {"g": "g", "gr": "g", "gramm": "g", "kg": "kg", "ml": "ml", "l": "l", "liter": "l", "el": "EL", "tl": "TL",
          "stück": "Stück", "stueck": "Stück", "stk": "Stück", "st": "Stück", "dose": "Dose", "dosen": "Dose",
          "bund": "Bund", "packung": "Packung", "pkg": "Packung", "päckchen": "Packung", "prise": "Prise"}


def norm_unit(u):
    raw = str(u).strip() if u is not None else ""
    key = raw.rstrip(".").strip().casefold()
    return _UNITS.get(key, raw)


def name_key(n):
    return " ".join(str(n).split()).casefold()


def display_name(n):
    s = " ".join(str(n).split())
    return s[:1].upper() + s[1:]


def collate(s):
    t = unicodedata.normalize("NFKD", s.casefold())
    return "".join(c for c in t if not unicodedata.combining(c))


def _lower_keys(rec):
    return {str(k).strip().casefold(): v for k, v in rec.items()}


def _num(f):
    if f is None:
        return None
    return int(f) if f.denominator == 1 else float(f)


def normalize(raw):
    """Rohdaten -> normalisiertes Modell. Schluessel mit Unterstrich sind intern (Fractions)."""
    settings = {"standard_portionen": 2, "wiederholungssperre_tage": 21}
    for r in raw.get("Einstellungen", []):
        r = _lower_keys(r)
        k = str(r.get("schluessel", "")).strip().casefold()
        v = parse_amount(r.get("wert"))
        if k in settings and v is not None and v.denominator == 1 and v >= 1:
            settings[k] = int(v)

    zut = {}
    for i, r in enumerate(raw.get("Zutaten", [])):
        r = _lower_keys(r)
        gid = str(r.get("gericht_id", "")).strip()
        name = " ".join(str(r.get("name", "")).split())
        if not gid or not name:
            continue
        pos = parse_amount(r.get("pos"))
        m = parse_amount(r.get("menge"))
        zut.setdefault(gid, []).append({
            "gericht_id": gid, "pos": int(pos) if pos is not None else i + 1, "name": name,
            "menge": _num(m), "_menge": m, "einheit": norm_unit(r.get("einheit")),
            "einkaufen": to_bool(r.get("einkaufen"), True), "_row": i})

    gerichte = []
    for r in raw.get("Gerichte", []):
        r = _lower_keys(r)
        gid = str(r.get("id", "")).strip()
        if not gid:
            continue
        basis = parse_amount(r.get("basis_portionen"))
        if basis is None or basis <= 0:
            basis = Fraction(settings["standard_portionen"])
        kcal = parse_amount(r.get("kcal_pro_portion"))
        if kcal is not None and kcal <= 0:
            kcal = None
        tage = parse_amount(r.get("reicht_fuer_tage"))
        tage = int(tage) if tage is not None and tage >= 1 else 1
        status = "idee" if str(r.get("status", "")).strip().casefold() == "idee" else "fertig"
        typ = "beilage" if str(r.get("typ", "")).strip().casefold() == "beilage" else "hauptgericht"
        z = sorted(zut.get(gid, []), key=lambda x: (x["pos"], x["_row"]))
        gerichte.append({
            "id": gid, "name": " ".join(str(r.get("name", "")).split()), "basis_portionen": _num(basis), "_basis": basis,
            "kcal_pro_portion": _num(kcal),
            "tags": [t.strip() for t in str(r.get("tags", "")).split(",") if t.strip()],
            "favorit": to_bool(r.get("favorit"), False), "nie_wieder": to_bool(r.get("nie_wieder"), False),
            "aktiv": to_bool(r.get("aktiv"), True), "reicht_fuer_tage": tage, "schritte": str(r.get("schritte", "")),
            "quelle": str(r.get("quelle", "")), "angelegt_am": parse_date(r.get("angelegt_am")), "status": status,
            "typ": typ, "zutaten": z})

    plan = []
    for r in raw.get("Plan", []):
        r = _lower_keys(r)
        d = parse_date(r.get("datum"))
        gid = str(r.get("gericht_id", "")).strip()
        p = parse_amount(r.get("portionen"))
        if d is None or not gid:
            continue
        plan.append({"woche_start": parse_date(r.get("woche_start")), "datum": d, "gericht_id": gid,
                     "beilage_id": str(r.get("beilage_id", "")).strip(),
                     "portionen": int(p) if p is not None and p >= 1 else settings["standard_portionen"],
                     "fixiert": to_bool(r.get("fixiert"), False)})

    bew = {}
    for r in raw.get("Bewertungen", []):
        r = _lower_keys(r)
        gid = str(r.get("gericht_id", "")).strip()
        d = parse_date(r.get("datum"))
        s = parse_amount(r.get("sterne"))
        if not gid or d is None or s is None or s.denominator != 1 or not 1 <= s <= 5:
            continue
        von = str(r.get("von", "")).strip()
        bew[(gid, d, von)] = {"gericht_id": gid, "datum": d, "sterne": int(s), "notiz": str(r.get("notiz", "")), "von": von}

    lebensmittel = []
    for r in raw.get("Lebensmittel", []):
        r = _lower_keys(r)
        name = " ".join(str(r.get("name", "")).split())
        if not name:
            continue
        kcal100 = parse_amount(r.get("kcal_je_100g"))
        if kcal100 is None:
            continue
        lebensmittel.append({"name": name, "kcal_je_100g": _num(kcal100)})

    richtgewichte = []
    for r in raw.get("Richtgewichte", []):
        r = _lower_keys(r)
        name = " ".join(str(r.get("name", "")).split())
        einheit = norm_unit(r.get("einheit"))
        if not name or not einheit:
            continue
        gramm = parse_amount(r.get("gramm"))
        if gramm is None:
            continue
        richtgewichte.append({"name": name, "einheit": einheit, "gramm": _num(gramm)})

    return {"einstellungen": settings, "gerichte": gerichte, "plan": sorted(plan, key=lambda x: (x["datum"], x["gericht_id"])),
            "bewertungen": list(bew.values()), "lebensmittel": lebensmittel, "richtgewichte": richtgewichte}


def to_json(obj):
    if isinstance(obj, dict):
        return {k: to_json(v) for k, v in obj.items() if not k.startswith("_")}
    if isinstance(obj, list):
        return [to_json(v) for v in obj]
    return obj


# ---------------------------------------------------------------------------
# Datum
# ---------------------------------------------------------------------------


def week_days(start_iso):
    s = date.fromisoformat(start_iso)
    out = []
    for i in range(7):
        d = s + timedelta(days=i)
        out.append({"datum": d.isoformat(), "wochentag": WOCHENTAGE[d.weekday()], "kurz": KURZ[d.weekday()],
                    "anzeige": f"{KURZ[d.weekday()]} {d.day:02d}.{d.month:02d}.{d.year}"})
    return out


# ---------------------------------------------------------------------------
# Einkaufszettel
# ---------------------------------------------------------------------------


def round2(x):
    """kaufmaennisch auf 2 Nachkommastellen, als Fraction mit Nenner 100."""
    n = math.floor(x * 100 + Fraction(1, 2))
    return Fraction(n, 100)


def fmt_num(x):
    """Dezimalkomma, hoechstens 2 Nachkommastellen, ohne Endnullen."""
    r = round2(x)
    n = int(r * 100)
    whole, frac = divmod(abs(n), 100)
    s = str(whole)
    if frac:
        s += "," + f"{frac:02d}".rstrip("0")
    return ("-" if n < 0 else "") + s


def shopping_list(norm, tage):
    gerichte = {g["id"]: g for g in norm["gerichte"]}
    groups = {}
    amountless = {}
    order = 0

    def add(d, portionen):
        nonlocal order
        scale = Fraction(portionen) / d["_basis"]
        for z in d["zutaten"]:
            if not z["einkaufen"]:
                continue
            key = name_key(z["name"])
            disp = display_name(z["name"])
            order += 1
            if z["_menge"] is None:
                amountless.setdefault(key, (order, disp))
                continue
            amt = z["_menge"] * scale
            unit = z["einheit"]
            if unit == "kg":
                fam, amt = "g", amt * 1000
            elif unit == "g":
                fam = "g"
            elif unit == "l":
                fam, amt = "ml", amt * 1000
            elif unit == "ml":
                fam = "ml"
            else:
                fam = unit.casefold()
            g = groups.setdefault((key, fam), {"name": disp, "fam": fam, "unit": unit, "total": Fraction(0), "order": order})
            g["total"] += amt

    # Hauptgericht und Beilage (falls gesetzt) fliessen unabhaengig in dieselbe Liste, jedes mit eigener Skalierung
    # ueber seine eigene basis_portionen, beide mit derselben Portionenzahl des Tages.
    for t in tage:
        add(gerichte[t["gericht_id"]], t["portionen"])
        bid = t.get("beilage_id")
        if bid:
            add(gerichte[bid], t["portionen"])
    items = []
    for (key, fam), g in groups.items():
        total = g["total"]
        if fam == "stück":
            total = Fraction(math.ceil(total * 2), 2)
        if fam == "g":
            val, unit = (total / 1000, "kg") if total >= 1000 else (total, "g")
        elif fam == "ml":
            val, unit = (total / 1000, "l") if total >= 1000 else (total, "ml")
        else:
            val, unit = total, g["unit"]
        r2 = round2(val)
        line = fmt_num(val) + (" " + unit if unit else "") + " " + g["name"]
        items.append({"key": key, "name": g["name"], "einheit": unit, "menge": float(r2), "menge_exakt": round(float(val), 6),
                      "anzeige": line, "_sort": (collate(g["name"]), collate(fam))})
    have = {k for (k, _f) in groups}
    for key, (_o, disp) in amountless.items():
        if key in have:
            continue
        items.append({"key": key, "name": disp, "einheit": "", "menge": None, "menge_exakt": None, "anzeige": disp,
                      "_sort": (collate(disp), "")})
    items.sort(key=lambda i: i["_sort"])
    for i in items:
        del i["_sort"]
    return {"items": items, "zeilen": [i["anzeige"] for i in items]}


def day_views(norm, start_iso, tage):
    gerichte = {g["id"]: g for g in norm["gerichte"]}
    days = week_days(start_iso)
    out = []
    for dd, t in zip(days, tage):
        g = gerichte[t["gericht_id"]]
        k = g["kcal_pro_portion"]
        out.append({"datum": dd["datum"], "anzeige": dd["anzeige"], "gericht_id": g["id"], "name": g["name"],
                    "portionen": t["portionen"], "kcal_pro_portion": k,
                    "kcal_gesamt": None if k is None else round(k * t["portionen"], 4)})
    return out


# ---------------------------------------------------------------------------
# Bewertungen und Gewichte
# ---------------------------------------------------------------------------


def rating_stats(norm):
    by = {}
    for b in norm["bewertungen"]:
        by.setdefault(b["gericht_id"], []).append(b["sterne"])
    return {gid: {"anzahl": len(v), "_avg": Fraction(sum(v), len(v)), "durchschnitt": round(sum(v) / len(v), 4)}
            for gid, v in by.items()}


def ranking(norm):
    stats = rating_stats(norm)
    names = {g["id"]: g["name"] for g in norm["gerichte"]}
    rows = [(gid, s) for gid, s in stats.items() if s["anzahl"] >= 2 and gid in names]
    rows.sort(key=lambda x: (-x[1]["_avg"], -x[1]["anzahl"], collate(names[x[0]]), x[0]))
    n = len(rows)
    k = min(5, math.ceil(n / 2))
    m = min(5, n // 2)
    best = [r[0] for r in rows[:k]]
    worst = [r[0] for r in reversed(rows[n - m:])] if m else []
    return {"alle": [{"gericht_id": g, "anzahl": s["anzahl"], "durchschnitt": s["durchschnitt"]} for g, s in rows],
            "beste": best, "schwaechste": worst}


def weights(norm):
    stats = rating_stats(norm)
    out = {}
    for g in norm["gerichte"]:
        w = Fraction(1)
        if g["favorit"]:
            w *= 2
        s = stats.get(g["id"])
        if s and s["anzahl"] >= 2:
            if s["_avg"] >= 4:
                w *= Fraction(3, 2)
            if s["_avg"] <= 2:
                w *= Fraction(1, 2)
        out[g["id"]] = float(w)
    return out


def eligible_ids(norm):
    return [g["id"] for g in norm["gerichte"] if g["aktiv"] and g["status"] == "fertig" and not g["nie_wieder"]]


def selectable_ids(norm):
    """Fuer Tauschen/Suche: aktiv und fertig (nie_wieder zaehlt hier nicht)."""
    return [g["id"] for g in norm["gerichte"] if g["aktiv"] and g["status"] == "fertig"]


# ---------------------------------------------------------------------------
# Golden-Dateien
# ---------------------------------------------------------------------------
DATE_STARTS = ["2026-11-18", "2026-11-20", "2026-10-21", "2027-03-24", "2026-03-25", "2026-12-30", "2027-12-29",
               "2028-02-26", "2027-02-26", "2026-11-28", "2026-12-27", "2026-01-01"]


def build_golden(data_dir, out_dir):
    data_dir, out_dir = Path(data_dir), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    norms = {}
    for x in sorted(data_dir.glob("*.xlsx")):
        raw = dump_raw(x)
        norm = normalize(raw)
        norms[x.name] = norm
        (out_dir / f"{x.stem}.raw.json").write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding="utf-8")
        (out_dir / f"{x.stem}.norm.json").write_text(json.dumps(to_json(norm), ensure_ascii=False, indent=1), encoding="utf-8")
        rk = ranking(norm)
        stats = {g: {"anzahl": s["anzahl"], "durchschnitt": s["durchschnitt"]} for g, s in rating_stats(norm).items()}
        (out_dir / f"{x.stem}.bewertung.json").write_text(json.dumps(
            {"statistik": stats, "rangliste": rk, "gewichte": weights(norm), "zulaessig_shuffle": eligible_ids(norm),
             "auswaehlbar": selectable_ids(norm)}, ensure_ascii=False, indent=1), encoding="utf-8")
    scen = json.loads((data_dir / "scenarios.json").read_text(encoding="utf-8"))
    shop = {}
    for s in scen:
        norm = norms[s["datei"]]
        shop[s["id"]] = {"datei": s["datei"], "start": s["start"], "beschreibung": s["beschreibung"],
                         "tage": day_views(norm, s["start"], s["tage"]),
                         "einkauf": shopping_list(norm, s["tage"])}
    (out_dir / "einkauf.json").write_text(json.dumps(shop, ensure_ascii=False, indent=1), encoding="utf-8")
    (out_dir / "daten.json").write_text(json.dumps({s: week_days(s) for s in DATE_STARTS}, ensure_ascii=False, indent=1),
                                        encoding="utf-8")
    print(f"golden: {len(norms)} Dateien, {len(shop)} Einkaufsszenarien, {len(DATE_STARTS)} Datumsfaelle -> {out_dir}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("golden")
    g.add_argument("--data", default=str(ROOT / "data"))
    g.add_argument("--out", default=str(ROOT / "data" / "golden"))
    s = sub.add_parser("shopping")
    s.add_argument("datei")
    s.add_argument("plan")
    a = ap.parse_args(argv)
    if a.cmd == "golden":
        build_golden(a.data, a.out)
    else:
        norm = normalize(dump_raw(a.datei))
        tage = json.loads(Path(a.plan).read_text(encoding="utf-8"))
        print("\n".join(shopping_list(norm, tage)["zeilen"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
