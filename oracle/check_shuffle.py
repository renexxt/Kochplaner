#!/usr/bin/env python3
"""Prueft die von der App erzeugten Shuffle-Laeufe (evidence/shuffle_runs.json) unabhaengig vom App-Code.

Regeln aus dem Zieldokument (F02, F23). Eligibility, Sperrfrist und Gewichte rechnet dieses Skript selbst
aus den xlsx-Dateien. Aufruf: python3 oracle/check_shuffle.py
"""
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "oracle"))
import oracle as O  # noqa: E402


def mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs)


def main():
    runs = json.loads((ROOT / "evidence" / "shuffle_runs.json").read_text(encoding="utf-8"))
    problems = []
    report = []
    for pid, job in runs.items():
        norm = O.normalize(O.dump_raw(ROOT / "data" / job["datei"]))
        eligible = set(O.eligible_ids(norm))
        start = date.fromisoformat(job["start"])
        sperre = norm["einstellungen"]["wiederholungssperre_tage"]
        recent = {p["gericht_id"] for p in norm["plan"] if 1 <= (start - date.fromisoformat(p["datum"])).days <= sperre}
        free = eligible - recent
        counts = {}
        for r in job["laeufe"]:
            if len(r) != 7:
                problems.append(f"{pid}: Plan hat {len(r)} statt 7 Tage")
            bad = [g for g in r if g not in eligible]
            if bad:
                problems.append(f"{pid}: nicht vorschlagbare Gerichte {bad}")
            if len(eligible) >= 7 and len(set(r)) != 7:
                problems.append(f"{pid}: Wiederholung im Plan {r}")
            if len(free) >= 7 and set(r) & recent:
                problems.append(f"{pid}: Sperrfrist verletzt {sorted(set(r) & recent)}")
            if len(eligible) < 7 and len(set(r)) < min(len(eligible), 7):
                problems.append(f"{pid}: Gerichte ungenutzt trotz Mangel {r}")
            for g in r:
                counts[g] = counts.get(g, 0) + 1
        n = len(job["laeufe"])
        line = f"{pid}: {n} Laeufe, {len(eligible)} vorschlagbar, {len(recent)} in Sperrfrist"
        if pid in ("basis", "anna"):
            gerichte = {g["id"]: g for g in norm["gerichte"]}
            favs = [g for g in eligible if gerichte[g]["favorit"]]
            rest = [g for g in eligible if not gerichte[g]["favorit"]]
            ratio = mean(counts.get(g, 0) for g in favs) / mean(counts.get(g, 0) for g in rest)
            # reines Favoriten-Verhaeltnis: nur Gerichte ohne Bewertung auf beiden Seiten vergleichen
            stats = O.rating_stats(norm)
            favs_u = [g for g in favs if g not in stats]
            rest_u = [g for g in rest if g not in stats]
            ratio_u = mean(counts.get(g, 0) for g in favs_u) / mean(counts.get(g, 0) for g in rest_u) if favs_u else None
            if ratio < 1.5:
                problems.append(f"{pid}: Favoriten-Verhaeltnis {ratio:.2f} < 1,5")
            line += f", Favoriten x{ratio:.2f}"
            if ratio_u is not None:
                line += f" (nur unbewertete x{ratio_u:.2f})"
            low = [g for g, s in stats.items() if s["anzahl"] >= 2 and s["_avg"] <= 2 and g in eligible]
            unrated = [g for g in eligible if g not in stats and not gerichte[g]["favorit"]]
            if low:
                lr = mean(counts.get(g, 0) for g in low) / mean(counts.get(g, 0) for g in unrated)
                if lr > 0.75:
                    problems.append(f"{pid}: niedrig bewertete Gerichte x{lr:.2f} > 0,75")
                line += f", niedrig bewertet x{lr:.2f}"
        report.append(line)
    print("\n".join(report))
    if problems:
        print("\nFEHLER:\n" + "\n".join(sorted(set(problems))[:20]))
        return 1
    print("\nOK: alle Shuffle-Laeufe erfuellen die Regeln aus F02 und F23.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
