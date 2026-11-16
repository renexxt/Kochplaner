#!/usr/bin/env python3
"""Evidenzbericht als HTML: eine Zeile je Funktions-ID mit Status, Pruefprotokoll (Assertions), Screenshots und Videos.
Liest evidence/<lauf>/*/steps.json (Ausgabe der E2E-Tests), docs/ZIELDOKUMENT.md (Funktionsliste) und
optional evidence/laeufe.json, evidence/logik_tests.json, evidence/mutation_app.json, evidence/mutation_gs.json.

Aufruf: python3 tools/make_report.py [Lauf-Ordner relativ zu evidence/, Standard: lauf_final]
Ergebnis: evidence/report.html (Videos und Bilder werden relativ verlinkt, Ordner evidence/ zusammen verschieben)
"""
import html
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EV = ROOT / "evidence"
lauf = sys.argv[1] if len(sys.argv) > 1 else "lauf_final"
LAUF = EV / lauf
e = html.escape


def funktionen():
    text = (ROOT / "docs" / "ZIELDOKUMENT.md").read_text(encoding="utf-8")
    out = {}
    for m in re.finditer(r"^\| (F\d\d) \| (.+?) \| (Muss|Soll|Kann) \| (.+?) \|$", text, re.M):
        out[m.group(1)] = {"name": m.group(2), "prio": m.group(3), "kriterium": m.group(4)}
    return out


def laden():
    tests = []
    for f in sorted(LAUF.glob("*/steps.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        d["ordner"] = f.parent.name
        tests.append(d)
    return tests


def json_oder_none(name):
    p = EV / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def medien(t):
    d = LAUF / t["ordner"]
    videos = sorted(p.name for p in d.glob("video_*.webm"))
    return videos


def test_block(t, fid):
    pr = [p for p in t["pruefungen"] if p["f"] == fid]
    ok = all(p["ok"] for p in pr)
    zeilen = []
    aktuell = None
    for p in pr:
        if p["schritt"] != aktuell:
            aktuell = p["schritt"]
            zeilen.append(f'<tr class="schritt"><td colspan="3">{e(aktuell or "")}</td></tr>')
        shot = f'<a href="{lauf}/{e(t["ordner"])}/{e(p["shot"])}"><img loading="lazy" src="{lauf}/{e(t["ordner"])}/{e(p["shot"])}" alt="Screenshot"></a>' if p.get("shot") else ""
        zeilen.append(f'<tr><td class="{"ok" if p["ok"] else "bad"}">{"✔" if p["ok"] else "✘"}</td><td>{e(p["aussage"])}</td><td>{shot}</td></tr>')
    videos = "".join(f'<video controls preload="none" src="{lauf}/{e(t["ordner"])}/{e(v)}"></video>' for v in medien(t)[:2])
    return (f'<details><summary><span class="{"ok" if ok else "bad"}">{"✔" if ok else "✘"}</span> {e(t["ordner"])} '
            f'<small>{len(pr)} Prüfungen, {t.get("dauer_s", "?")} s</small></summary>{videos}<table class="log">{"".join(zeilen)}</table></details>')


def main():
    funk = funktionen()
    tests = laden()
    if not tests:
        sys.exit(f"keine steps.json in {LAUF}")
    nach_f = defaultdict(list)
    for t in tests:
        for fid in sorted({p["f"] for p in t["pruefungen"] if p["f"]}):
            nach_f[fid].append(t)
    gesamt_pr = sum(len(t["pruefungen"]) for t in tests)
    schlecht = sum(1 for t in tests if t["status"] != "bestanden")
    laeufe = json_oder_none("laeufe.json") or []
    logik = json_oder_none("logik_tests.json")
    mut = json_oder_none("mutation_app.json")
    mutgs = json_oder_none("mutation_gs.json")

    k = []
    k.append(f'<h1>Kochplaner – Evidenzbericht</h1><p class="lead">{len(tests)} E2E-Tests mit {gesamt_pr} geprüften Aussagen in einem echten Chrome mit iPhone- und iPad-Emulation. '
             f'<b class="{"ok" if not schlecht else "bad"}">{"Alle bestanden." if not schlecht else f"{schlecht} Tests nicht bestanden."}</b></p>')
    if laeufe:
        z = "".join(f'<tr><td>{e(str(r["nr"]))}</td><td>{e(r["start"])}</td><td>{e(str(r["dauer"]))}</td><td>{r["unit"]}</td><td>{r["vertrag"]}</td><td>{r["orakel"]}</td><td>{r["e2e_bestanden"]} von {r["e2e_gesamt"]}</td><td class="{"ok" if r["gruen"] else "bad"}">{"grün" if r["gruen"] else "ROT"}</td></tr>' for r in laeufe)
        k.append(f'<h2>Vollläufe in Folge</h2><table class="plain"><tr><th>Lauf</th><th>Start</th><th>Dauer</th><th>Unit</th><th>Vertrag</th><th>Orakel</th><th>E2E</th><th>Ergebnis</th></tr>{z}</table>')
    if logik:
        k.append(f'<h2>Logik- und Schnittstellentests</h2><p>Unit-Tests {logik["unit"]}, Vertragstests (Mock gegen Code.gs im Simulator) {logik["vertrag"]}, Orakel-Selbsttest {logik["orakel"]}.</p>')
    # Funktionsliste
    z = []
    for fid, f in funk.items():
        ts = nach_f.get(fid, [])
        if not ts:
            status, cls, anz = ("nicht umgesetzt (Kann)", "warn", "") if f["prio"] == "Kann" else ("KEIN TEST", "bad", "")
            z.append(f'<tr id="{fid}"><td>{fid}</td><td><b>{e(f["name"])}</b><br><small>{e(f["prio"])}</small></td><td class="{cls}">{status}</td><td>{anz}</td><td><small>{e(f["kriterium"])}</small></td></tr>')
            continue
        pr = [p for t in ts for p in t["pruefungen"] if p["f"] == fid]
        ok = all(p["ok"] for p in pr)
        det = "".join(test_block(t, fid) for t in ts)
        z.append(f'<tr id="{fid}"><td>{fid}</td><td><b>{e(f["name"])}</b><br><small>{e(f["prio"])}</small></td><td class="{"ok" if ok else "bad"}">{"bestanden" if ok else "FEHLER"}</td>'
                 f'<td>{len(ts)} Tests<br>{len(pr)} Prüfungen</td><td><small>{e(f["kriterium"])}</small>{det}</td></tr>')
    k.append(f'<h2>Funktionen F01 bis F23</h2><table class="funk"><colgroup><col style="width:48px"><col style="width:150px"><col style="width:120px"><col style="width:100px"><col></colgroup><tr><th>ID</th><th>Funktion</th><th>Status</th><th>Umfang</th><th>Kriterium und Beweis (aufklappbar: Video, Screenshots, Prüfprotokoll)</th></tr>{"".join(z)}</table>')
    # Profilwege und Sonstiges
    sonst = defaultdict(list)
    for t in tests:
        for fid in sorted({p["f"] for p in t["pruefungen"] if p["f"] and p["f"] not in funk}):
            sonst[fid].append(t)
    if sonst:
        z = []
        for fid, ts in sonst.items():
            pr = [p for t in ts for p in t["pruefungen"] if p["f"] == fid]
            z.append(f'<tr><td>{e(fid)}</td><td class="{"ok" if all(p["ok"] for p in pr) else "bad"}">{"bestanden" if all(p["ok"] for p in pr) else "FEHLER"}</td><td>{len(ts)} Tests, {len(pr)} Prüfungen{"".join(test_block(t, fid) for t in ts)}</td></tr>')
        k.append(f'<h2>Durchgehende Profilwege (Anna, Ben und Clara, Familie Weber)</h2><table class="funk"><colgroup><col style="width:110px"><col style="width:120px"><col></colgroup><tr><th>Art</th><th>Status</th><th>Beweis</th></tr>{"".join(z)}</table>')
    sh = EV / "shuffle_check.txt"
    if sh.exists():
        k.append(f'<h2>Zufallsverteilung des Vorschlags (F02, F23)</h2><p>Unabhängige Python-Prüfung (oracle/check_shuffle.py) über Läufe mit festem Seed: Regeln eingehalten, Gewichte wirken wie vorgegeben (Favorit ×2, niedrig bewertet ×0,5).</p><pre>{e(sh.read_text(encoding="utf-8").strip())}</pre>')
    if mut:
        z = "".join(f'<tr><td>{e(r["id"])}{" (Pflicht)" if r.get("pflicht") else ""}</td><td>{e(r["beschreibung"])}</td><td class="{"ok" if r.get("unit_findet") else "bad"}">{"gefunden" if r.get("unit_findet") else "nicht gefunden"}</td>'
                     f'<td class="{"ok" if r.get("e2e_findet") else "bad"}">{"gefunden" if r.get("e2e_findet") else "nicht gefunden"}</td><td><small>{e(r.get("e2e_test", ""))}<br>{e(r.get("e2e_meldung", ""))}</small></td></tr>' for r in mut[1:])
        k.append(f'<h2>Mutationsprüfung der App</h2><p>Absichtlich eingebaute Fehler. Die Tests müssen jeden finden, sonst sind sie zu schwach.</p><table class="plain"><tr><th>Fehler</th><th>Was falsch ist</th><th>Unit-Tests</th><th>E2E-Tests</th><th>Erster Befund</th></tr>{z}</table>')
    if mutgs:
        k.append(f'<h2>Mutationsprüfung der Schnittstelle (Code.gs)</h2><p>{mutgs["gefunden"]} von {mutgs["gesamt"]} absichtlichen Fehlern gefunden. <small>{e(mutgs.get("hinweis", ""))}</small></p>')
    k.append('<h2>Was dieser Bericht nicht beweist</h2><p>Echtes Safari auf iPhone und iPad, echtes Google (Sheet und Apps Script), echte Apple Erinnerungen und Notes sowie die Bilderkennung im Claude-Chat. Dafür gibt es den manuellen Abnahmetest (docs/ABNAHMETEST.md). '
             'Der Chrome-Lauf emuliert Bildschirmgröße und Touch, ersetzt aber kein Safari.</p>')
    css = """body{font:15px/1.45 system-ui,sans-serif;margin:24px auto;max-width:1200px;padding:0 16px;color:#1d2a22}h1{margin-bottom:4px}.lead{font-size:1.05rem}
table{border-collapse:collapse;width:100%;margin:8px 0 24px}th,td{border:1px solid #d7ded9;padding:6px 8px;vertical-align:top;text-align:left}th{background:#eef3ef}
.ok{color:#1b6e3a;font-weight:600}.bad{color:#b3261e;font-weight:700}.warn{color:#8a5a00;font-weight:600}small{color:#5b6a61}
details{margin:6px 0}summary{cursor:pointer}video{display:block;max-width:360px;max-height:320px;margin:6px 0}table.log td{font-size:13px;padding:3px 6px}
tr.schritt td{background:#f5f8f6;font-weight:600}table.funk{table-layout:fixed}td{word-break:break-word}table.log td:nth-child(1){width:26px}table.log td:nth-child(3){width:90px}table.log img{height:60px;border:1px solid #ccc}table.plain td,table.plain th{font-size:14px}"""
    (EV / "report.html").write_text(f'<!doctype html><html lang="de"><meta charset="utf-8"><title>Kochplaner – Evidenzbericht</title><style>{css}</style><body>{"".join(k)}</body></html>', encoding="utf-8")
    print("evidence/report.html:", len(tests), "Tests,", gesamt_pr, "Prüfungen,", schlecht, "nicht bestanden")


if __name__ == "__main__":
    main()
